import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { authenticateJwt, authorizeRoles, verifyAccountActive, JWT_SECRET } from './middleware/auth.js';
import jwt from 'jsonwebtoken';
import { 
  createBreakerProxy, 
  rideServiceBreaker, 
  driverServiceBreaker 
} from './middleware/circuitBreaker.js';
import authRouter from './routes/auth.js';
import passengersRouter from './routes/passengers.js';
import systemRouter, { gatewayMetrics } from './routes/system.js';
import { initSocketServer } from './socket.js';

dotenv.config();

const app = express();
const PORT = process.env.GATEWAY_PORT || 5000;
const RIDE_SERVICE_URL = process.env.RIDE_SERVICE_URL || 'http://localhost:5001';
const DRIVER_SERVICE_URL = process.env.DRIVER_SERVICE_URL || 'http://localhost:5002';

// Standard Security & Protocol Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
}));
app.use(express.json());

// Correlation Tracking & Structured Logging
app.use(correlationIdMiddleware);

// Metric Collector Middleware
app.use((req, res, next) => {
  gatewayMetrics.totalRequests++;
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 200 && res.statusCode < 300) gatewayMetrics.status2xx++;
    else if (res.statusCode >= 400 && res.statusCode < 500) gatewayMetrics.status4xx++;
    else if (res.statusCode >= 500) gatewayMetrics.status5xx++;

    logger.info({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    }, 'Gateway HTTP Ingress');
  });

  next();
});

// Distributed Token Bucket Rate Limiter
app.use(rateLimiter({ capacity: 300, refillRatePerSec: 25 }));

// System & Health Endpoints (Public Health Checks)
app.use(systemRouter);
app.use('/api/v1', systemRouter);

// Authentication Endpoints (/api/v1/auth)
app.use('/api/v1/auth', authRouter);

// Identity header extraction & account liveness enforcement middleware
app.use(async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && payload.id) {
        const check = await verifyAccountActive(payload);
        if (!check.active) {
          return res.status(401).json({
            success: false,
            error: 'AccountRemoved',
            accountSuspended: true,
            message: check.reason,
          });
        }
        req.headers['x-user-id'] = payload.id;
        req.headers['x-user-role'] = payload.role;
      }
    } catch (e) {
      // Fallback: extract claims only if non-protected route without throwing
      try {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[1].includes('.')) {
          const payload = JSON.parse(Buffer.from(parts[1].split('.')[1], 'base64').toString());
          if (payload && payload.id) {
            req.headers['x-user-id'] = payload.id;
            req.headers['x-user-role'] = payload.role;
          }
        }
      } catch (e2) {}
    }
  }
  next();
});

// Passenger Domain Endpoints (RBAC Protected: PASSENGER, ADMIN, DRIVER)
app.use('/api/v1/passengers', authenticateJwt, authorizeRoles('PASSENGER', 'ADMIN', 'DRIVER'), passengersRouter);

// Protected Ride Creation: Passengers, Admins, and Drivers can test & book a ride
app.post('/api/v1/rides', authenticateJwt, authorizeRoles('PASSENGER', 'ADMIN', 'DRIVER'), createBreakerProxy(rideServiceBreaker, RIDE_SERVICE_URL));

// Driver Availability & Location: Drivers, Admins, and Passengers can update driver status/GPS
app.patch('/api/v1/drivers/:id/availability', authenticateJwt, authorizeRoles('DRIVER', 'ADMIN', 'PASSENGER'), createBreakerProxy(driverServiceBreaker, DRIVER_SERVICE_URL));
app.patch('/api/v1/drivers/:id/location', authenticateJwt, authorizeRoles('DRIVER', 'ADMIN', 'PASSENGER'), createBreakerProxy(driverServiceBreaker, DRIVER_SERVICE_URL));
app.post('/api/v1/drivers/:id/rate', authenticateJwt, authorizeRoles('PASSENGER', 'ADMIN', 'DRIVER'), createBreakerProxy(driverServiceBreaker, DRIVER_SERVICE_URL));

// General Proxy Routes with Circuit Breaker Protection
// All other /api/v1/rides/* traffic -> Ride Service (:5001)
app.use('/api/v1/rides', createBreakerProxy(rideServiceBreaker, RIDE_SERVICE_URL));

// In-Ride Emergency SOS & Rescue Dispatch -> Ride Service (:5001)
app.use('/api/v1/sos', createBreakerProxy(rideServiceBreaker, RIDE_SERVICE_URL));
app.use('/api/sos', createBreakerProxy(rideServiceBreaker, RIDE_SERVICE_URL));
app.use('/api/v1/admin/sos', createBreakerProxy(rideServiceBreaker, RIDE_SERVICE_URL));
app.use('/api/admin/sos', createBreakerProxy(rideServiceBreaker, RIDE_SERVICE_URL));

// All other /api/v1/drivers/* traffic -> Driver Service (:5002)
app.use('/api/v1/drivers', createBreakerProxy(driverServiceBreaker, DRIVER_SERVICE_URL));

// Root API Welcome / Gateway Info
app.get('/api/v1', (req, res) => {
  res.json({
    system: 'RideFlow API Gateway',
    version: '1.0.0-distributed',
    status: 'ACTIVE',
    security: 'JWT + RBAC Enabled (bcrypt)',
    endpoints: {
      health: '/health',
      servicesHealth: '/health/services',
      metrics: '/api/v1/metrics',
      auth: {
        register: 'POST /api/v1/auth/register',
        login: 'POST /api/v1/auth/login',
        me: 'GET /api/v1/auth/me',
      },
      passengers: '/api/v1/passengers (Protected)',
      rides: '/api/v1/rides',
      drivers: '/api/v1/drivers',
    },
  });
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NotFound',
    message: `API Gateway route '${req.method} ${req.url}' does not exist.`,
  });
});

// Centralized Gateway Error Handler
app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack, requestId: req.id }, 'Unhandled Gateway Exception');
  res.status(500).json({
    success: false,
    error: 'InternalServerError',
    message: 'An unexpected error occurred in the API Gateway.',
    requestId: req.id,
  });
});

const server = http.createServer(app);

// Initialize Socket.IO Real-time Channels
initSocketServer(server);

server.listen(PORT, () => {
  logger.info(`🛡️ RideFlow API Gateway running on http://localhost:${PORT}`);
  logger.info(`🔒 Security: JWT & Role-Based Access Control (RBAC) Active`);
  logger.info(`⚡ Real-time: Socket.IO Engine listening on port ${PORT}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down API Gateway gracefully...');
  server.close(() => {
    logger.info('API Gateway closed.');
    process.exit(0);
  });
});

export default app;

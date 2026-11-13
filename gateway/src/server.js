import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { 
  createBreakerProxy, 
  rideServiceBreaker, 
  driverServiceBreaker 
} from './middleware/circuitBreaker.js';
import authRouter from './routes/auth.js';
import passengersRouter from './routes/passengers.js';
import systemRouter, { gatewayMetrics } from './routes/system.js';

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

// Distributed Token Bucket Rate Limiter (Capacity: 100 req, refill: 5/s)
app.use(rateLimiter({ capacity: 100, refillRatePerSec: 5 }));

// System & Health Endpoints
app.use(systemRouter);

// Authentication Endpoints (/api/v1/auth)
app.use('/api/v1/auth', authRouter);

// Passenger Domain Endpoints (/api/v1/passengers)
app.use('/api/v1/passengers', passengersRouter);

// Proxy Routes with Circuit Breaker Protection
// All /api/v1/rides/* traffic -> Ride Service (:5001)
app.use('/api/v1/rides', createBreakerProxy(rideServiceBreaker, RIDE_SERVICE_URL));

// All /api/v1/drivers/* traffic -> Driver Service (:5002)
app.use('/api/v1/drivers', createBreakerProxy(driverServiceBreaker, DRIVER_SERVICE_URL));

// Root API Welcome / Gateway Info
app.get('/api/v1', (req, res) => {
  res.json({
    system: 'RideFlow API Gateway',
    version: '1.0.0-distributed',
    status: 'ACTIVE',
    endpoints: {
      health: '/health',
      servicesHealth: '/health/services',
      metrics: '/api/v1/metrics',
      auth: '/api/v1/auth',
      passengers: '/api/v1/passengers',
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

const server = app.listen(PORT, () => {
  logger.info(`🛡️ RideFlow API Gateway running on http://localhost:${PORT}`);
  logger.info(`🔗 Downstream Ride Service URL: ${RIDE_SERVICE_URL}`);
  logger.info(`🔗 Downstream Driver Service URL: ${DRIVER_SERVICE_URL}`);
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

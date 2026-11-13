import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ridesRouter from './routes/rides.js';
import { logger } from './logger.js';

dotenv.config();

const app = express();
const PORT = process.env.RIDE_SERVICE_PORT || 5001;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    }, 'Ride Service Request');
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'ride-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Domain routes
app.use('/api/v1/rides', ridesRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NotFound',
    message: `Route ${req.method} ${req.url} does not exist in Ride Service`,
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  logger.error(err, 'Unhandled error in Ride Service');
  res.status(500).json({
    success: false,
    error: 'InternalServerError',
    message: err.message,
  });
});

const server = app.listen(PORT, () => {
  logger.info(`🚗 Ride Service running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Closing Ride Service gracefully...');
  server.close(() => {
    logger.info('Ride Service closed.');
    process.exit(0);
  });
});

export default app;


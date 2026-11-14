import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { logger } from './logger.js';
import { JWT_SECRET } from './middleware/auth.js';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export const socketMetrics = {
  connectedClients: 0,
  eventsReceived: 0,
  eventsEmitted: 0,
  totalConnectionsServed: 0,
};

let io = null;
let redisSub = null;

/**
 * Initialize Socket.IO Server with JWT Handshake Auth & Multi-tenant Rooms
 */
export function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // 1. Handshake Authentication Middleware
  io.use((socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || 
                         socket.handshake.headers?.authorization || 
                         socket.handshake.query?.token;

      if (!authHeader) {
        logger.warn({ socketId: socket.id }, 'Socket connection rejected: No authentication token provided');
        return next(new Error('Authentication error: Token required'));
      }

      const token = authHeader.replace(/^Bearer\s+/i, '');
      const decoded = jwt.verify(token, JWT_SECRET);

      socket.user = decoded; // { id, role, email, name }
      next();
    } catch (err) {
      logger.warn({ socketId: socket.id, error: err.message }, 'Socket connection rejected: Invalid JWT');
      return next(new Error(`Authentication error: ${err.message}`));
    }
  });

  // 2. Redis Pub/Sub Bridge for Microservice Broadcasts
  try {
    redisSub = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      lazyConnect: false,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 2000)),
    });

    redisSub.subscribe('rideflow:realtime:events', (err) => {
      if (err) {
        logger.warn({ error: err.message }, 'Failed to subscribe to Redis realtime channel');
      } else {
        logger.info('⚡ Socket.IO subscribed to Redis channel: rideflow:realtime:events');
      }
    });

    redisSub.on('message', (channel, message) => {
      if (channel === 'rideflow:realtime:events') {
        try {
          const { room, event, data } = JSON.parse(message);
          if (room) {
            io.to(room).emit(event, data);
          } else {
            io.emit(event, data);
          }
          if (event === 'ride:status:changed') {
            io.emit('ride:status:changed', data);
          }
          socketMetrics.eventsEmitted++;
          logger.debug({ room, event }, 'Distributed event relayed from Redis to Socket.IO');
        } catch (parseErr) {
          logger.warn({ error: parseErr.message }, 'Failed to parse Redis realtime message');
        }
      }
    });
  } catch (redisErr) {
    logger.warn({ error: redisErr.message }, 'Redis pub/sub subscriber initialization failed');
  }

  // 3. Connection & Multi-tenant Room Management
  io.on('connection', (socket) => {
    const user = socket.user;
    socketMetrics.connectedClients++;
    socketMetrics.totalConnectionsServed++;

    logger.info({
      socketId: socket.id,
      userId: user.id,
      role: user.role,
      name: user.name,
    }, '🔌 Client connected to Socket.IO real-time channel');

    // Automatic Room Assignment:
    // Every user joins private user room
    socket.join(`user:${user.id}`);

    // Drivers join driver private room & driver broadcast channel
    if (user.role === 'DRIVER') {
      socket.join(`driver:${user.id}`);
      socket.join('role:driver');
    }

    // Admins join admin telemetry room
    if (user.role === 'ADMIN') {
      socket.join('admin:telemetry');
      socket.join('role:admin');
    }

    // Join specific ride channel (e.g. tracking active ride)
    socket.on('join:ride', ({ rideId }) => {
      if (!rideId) return;
      socket.join(`ride:${rideId}`);
      logger.info({ socketId: socket.id, userId: user.id, rideId }, 'User joined ride room');
    });

    // Leave ride channel
    socket.on('leave:ride', ({ rideId }) => {
      if (!rideId) return;
      socket.leave(`ride:${rideId}`);
      logger.info({ socketId: socket.id, userId: user.id, rideId }, 'User left ride room');
    });

    // Driver GPS Location Streaming
    socket.on('driver:location:update', (payload) => {
      socketMetrics.eventsReceived++;
      const { rideId, latitude, longitude, speed, heading } = payload || {};

      const locationData = {
        driverId: user.id,
        driverName: user.name,
        latitude,
        longitude,
        speed: speed || 0,
        heading: heading || 0,
        timestamp: new Date().toISOString(),
      };

      // Broadcast to specific ride room (passenger and driver tracking)
      if (rideId) {
        io.to(`ride:${rideId}`).emit('ride:driver:location', locationData);
        socketMetrics.eventsEmitted++;
      }

      // Broadcast to Admin Fleet Telemetry
      io.to('admin:telemetry').emit('driver:telemetry:update', locationData);
      socketMetrics.eventsEmitted++;
    });

    // Ride Status Updates (State Machine Broadcasts)
    socket.on('ride:status:changed', (payload) => {
      socketMetrics.eventsReceived++;
      const { rideId, status, ride } = payload || {};
      if (rideId) {
        io.to(`ride:${rideId}`).emit('ride:status:changed', { rideId, status, ride });
        socketMetrics.eventsEmitted++;
      }
      io.to('admin:telemetry').emit('admin:ride:status', { rideId, status, ride });
    });

    // Driver Dispatch Offer Response (Accept / Reject)
    socket.on('dispatch:offer:response', (payload) => {
      socketMetrics.eventsReceived++;
      const { rideId, assignmentId, accepted } = payload || {};
      if (rideId) {
        io.to(`ride:${rideId}`).emit('dispatch:offer:response', {
          driverId: user.id,
          rideId,
          assignmentId,
          accepted,
          timestamp: new Date().toISOString(),
        });
        socketMetrics.eventsEmitted++;
      }
    });

    // Real-time Chat / Alerts within Ride
    socket.on('ride:message', (payload) => {
      socketMetrics.eventsReceived++;
      const { rideId, message } = payload || {};
      if (rideId && message) {
        io.to(`ride:${rideId}`).emit('ride:message', {
          senderId: user.id,
          senderName: user.name,
          senderRole: user.role,
          message,
          timestamp: new Date().toISOString(),
        });
        socketMetrics.eventsEmitted++;
      }
    });

    // Disconnect Handler
    socket.on('disconnect', (reason) => {
      socketMetrics.connectedClients = Math.max(0, socketMetrics.connectedClients - 1);
      logger.info({ socketId: socket.id, userId: user.id, reason }, 'Client disconnected from Socket.IO');
    });
  });

  logger.info('🚀 Socket.IO Real-time Server Initialized with JWT handshake & Redis bridge');
  return io;
}

/**
 * Helper to emit event to room from within Gateway
 */
export function emitToRoom(room, event, data) {
  if (!io) return false;
  io.to(room).emit(event, data);
  socketMetrics.eventsEmitted++;
  return true;
}

/**
 * Get Socket.IO Health and Telemetry Metrics
 */
export function getSocketMetrics() {
  return {
    enabled: !!io,
    connectedClients: socketMetrics.connectedClients,
    totalConnectionsServed: socketMetrics.totalConnectionsServed,
    eventsReceived: socketMetrics.eventsReceived,
    eventsEmitted: socketMetrics.eventsEmitted,
    activeRoomsCount: io ? io.sockets.adapter.rooms.size : 0,
  };
}

import Redis from 'ioredis';
import { logger } from './logger.js';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redisClient = null;
let isConnected = false;

export const rideCacheMetrics = {
  connected: false,
  hits: 0,
  misses: 0,
  invalidations: 0,
  get hitRate() {
    const total = this.hits + this.misses;
    if (total === 0) return '0.0%';
    return ((this.hits / total) * 100).toFixed(1) + '%';
  }
};

try {
  redisClient = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 500, 2000);
    },
    lazyConnect: false,
  });

  redisClient.on('connect', () => {
    isConnected = true;
    rideCacheMetrics.connected = true;
    logger.info({ host: REDIS_HOST, port: REDIS_PORT }, '⚡ Redis connected in Ride Service');
  });

  redisClient.on('ready', () => {
    isConnected = true;
    rideCacheMetrics.connected = true;
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    rideCacheMetrics.connected = false;
    logger.warn({ error: err.message }, 'Redis error in Ride Service - continuing with direct DB queries');
  });

  redisClient.on('close', () => {
    isConnected = false;
    rideCacheMetrics.connected = false;
  });
} catch (err) {
  isConnected = false;
  rideCacheMetrics.connected = false;
  logger.warn({ error: err.message }, 'Failed to initialize Redis in Ride Service');
}

export function isRedisConnected() {
  return isConnected && redisClient && redisClient.status === 'ready';
}

export function getRedisClient() {
  return redisClient;
}

export async function getCache(key) {
  if (!isRedisConnected()) return null;
  try {
    const raw = await redisClient.get(key);
    if (raw) {
      rideCacheMetrics.hits++;
      return JSON.parse(raw);
    }
    rideCacheMetrics.misses++;
    return null;
  } catch (err) {
    logger.warn({ key, error: err.message }, 'Redis get error');
    rideCacheMetrics.misses++;
    return null;
  }
}

export async function setCache(key, value, ttlSeconds = 30) {
  if (!isRedisConnected()) return false;
  try {
    const serialized = JSON.stringify(value);
    await redisClient.set(key, serialized, 'EX', ttlSeconds);
    return true;
  } catch (err) {
    logger.warn({ key, error: err.message }, 'Redis set error');
    return false;
  }
}

export async function invalidateKey(key) {
  if (!isRedisConnected()) return;
  try {
    await redisClient.del(key);
    rideCacheMetrics.invalidations++;
  } catch (err) {
    logger.warn({ key, error: err.message }, 'Redis invalidateKey error');
  }
}

export async function invalidatePattern(pattern) {
  if (!isRedisConnected()) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      rideCacheMetrics.invalidations += keys.length;
      logger.info({ pattern, deletedCount: keys.length }, 'Invalidated ride cache keys');
    }
  } catch (err) {
    logger.warn({ pattern, error: err.message }, 'Redis invalidatePattern error');
  }
}

/**
 * Publish distributed realtime event via Redis Pub/Sub to Socket.IO clients
 */
export async function publishRealtimeEvent(room, event, data) {
  if (!isRedisConnected() || !redisClient) return false;
  try {
    await redisClient.publish('rideflow:realtime:events', JSON.stringify({ room, event, data }));
    return true;
  } catch (err) {
    logger.warn({ room, event, error: err.message }, 'Failed to publish realtime event to Redis');
    return false;
  }
}


import Redis from 'ioredis';
import { logger } from './logger.js';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redisClient = null;
let isConnected = false;

// Global Gateway Redis Telemetry Metrics
export const redisGatewayMetrics = {
  connected: false,
  rateLimitHits: 0,
  rateLimitBlocked429: 0,
  fallbackToMemoryCount: 0,
};

try {
  redisClient = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    retryStrategy(times) {
      if (times > 5) {
        logger.warn('Redis reconnection retries exhausted. Running in degraded in-memory mode.');
        return null; // Stop retrying automatically to avoid blocking
      }
      return Math.min(times * 500, 2000);
    },
    lazyConnect: false,
  });

  redisClient.on('connect', () => {
    isConnected = true;
    redisGatewayMetrics.connected = true;
    logger.info({ host: REDIS_HOST, port: REDIS_PORT }, '⚡ Redis connected successfully in API Gateway');
  });

  redisClient.on('ready', () => {
    isConnected = true;
    redisGatewayMetrics.connected = true;
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    redisGatewayMetrics.connected = false;
    logger.warn({ error: err.message }, 'Redis connection error in Gateway - falling back to in-memory mode');
  });

  redisClient.on('close', () => {
    isConnected = false;
    redisGatewayMetrics.connected = false;
  });
} catch (err) {
  isConnected = false;
  redisGatewayMetrics.connected = false;
  logger.warn({ error: err.message }, 'Failed to initialize Redis client. Operating in memory fallback mode.');
}

export function isRedisConnected() {
  return isConnected && redisClient && redisClient.status === 'ready';
}

export function getRedisClient() {
  return redisClient;
}

/**
 * Atomic Redis Token Bucket Rate Limiter Lua Script
 * Keys: 1 (ratelimit:<identifier>)
 * ARGV: 1 (capacity), 2 (refillRatePerSec), 3 (cost), 4 (nowTimestampMs)
 * 
 * Returns: [allowed (1 or 0), remainingTokens, resetTimeMs]
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- Retrieve current state from Redis Hash
local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  last_refill = now
else
  -- Calculate tokens replenished since last refill
  local elapsed = (now - last_refill) / 1000.0
  if elapsed > 0 then
    tokens = math.min(capacity, tokens + (elapsed * refillRate))
    last_refill = now
  end
end

local allowed = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
end

-- Save state back to Redis with a TTL of 2x the bucket fill duration
local ttl = math.ceil((capacity / refillRate) * 2)
if ttl < 60 then ttl = 60 end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
redis.call('EXPIRE', key, ttl)

return { allowed, math.floor(tokens), math.ceil(last_refill + (1000 / refillRate)) }
`;

/**
 * Execute Distributed Token Bucket Rate Check against Redis
 */
export async function consumeToken(key, capacity = 100, refillRatePerSec = 5, cost = 1) {
  if (!isRedisConnected()) {
    return null; // Signals caller to use in-memory fallback
  }

  try {
    const now = Date.now();
    const result = await redisClient.eval(
      TOKEN_BUCKET_LUA,
      1,
      `ratelimit:${key}`,
      capacity,
      refillRatePerSec,
      cost,
      now
    );

    const [allowed, remaining, resetTimeMs] = result;
    return {
      allowed: allowed === 1,
      remaining: Math.max(0, remaining),
      resetTimeMs,
      source: 'Redis',
    };
  } catch (err) {
    logger.warn({ error: err.message }, 'Redis rate limiter eval failed - falling back to memory');
    return null;
  }
}


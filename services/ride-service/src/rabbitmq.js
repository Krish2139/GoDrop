import amqp from 'amqplib';
import { logger } from './logger.js';

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = process.env.RABBITMQ_PORT || 5672;
const RABBITMQ_USER = process.env.RABBITMQ_USER || 'guest';
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'guest';

export const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

// Topic & Dead-Letter Exchanges
export const TOPIC_EXCHANGE = 'rideflow.topic';
export const DLX_EXCHANGE = 'rideflow.dlx';

// Queues
export const QUEUES = {
  DISPATCH: 'dispatch.queue',
  DISPATCH_DLQ: 'dispatch.dlq',
  NOTIFICATION: 'notification.queue',
  NOTIFICATION_DLQ: 'notification.dlq',
};

// Routing Keys
export const ROUTING_KEYS = {
  RIDE_REQUESTED: 'ride.requested',
  RIDE_OFFERED: 'ride.offered',
  RIDE_ACCEPTED: 'ride.accepted',
  RIDE_REJECTED: 'ride.rejected',
  RIDE_ARRIVED: 'ride.arrived',
  RIDE_STARTED: 'ride.started',
  RIDE_COMPLETED: 'ride.completed',
  RIDE_CANCELLED: 'ride.cancelled',
  RIDE_TIMEOUT: 'ride.timeout',
  NOTIFICATION_ALL: 'ride.*',
};

let connection = null;
let channel = null;
let isConnected = false;

export const rabbitMetrics = {
  connected: false,
  publishedCount: 0,
  publishErrors: 0,
};

/**
 * Initialize RabbitMQ Connection, Exchanges, and Queues with Dead-Letter routing
 */
export async function initRabbitMQ() {
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    isConnected = true;
    rabbitMetrics.connected = true;

    connection.on('error', (err) => {
      isConnected = false;
      rabbitMetrics.connected = false;
      logger.error(err, 'RabbitMQ connection error');
    });

    connection.on('close', () => {
      isConnected = false;
      rabbitMetrics.connected = false;
      logger.warn('RabbitMQ connection closed. Reconnecting in 3s...');
      setTimeout(initRabbitMQ, 3000);
    });

    // 1. Declare Topic Exchange & Dead-Letter Exchange (Durable)
    await channel.assertExchange(TOPIC_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });

    // 2. Declare Dead-Letter Queues (DLQs)
    await channel.assertQueue(QUEUES.DISPATCH_DLQ, { durable: true });
    await channel.bindQueue(QUEUES.DISPATCH_DLQ, DLX_EXCHANGE, QUEUES.DISPATCH_DLQ);

    await channel.assertQueue(QUEUES.NOTIFICATION_DLQ, { durable: true });
    await channel.bindQueue(QUEUES.NOTIFICATION_DLQ, DLX_EXCHANGE, QUEUES.NOTIFICATION_DLQ);

    // 3. Declare Dispatch Queue with DLX configuration
    await channel.assertQueue(QUEUES.DISPATCH, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_EXCHANGE,
        'x-dead-letter-routing-key': QUEUES.DISPATCH_DLQ,
      },
    });

    // Bind dispatch.queue to ride events that trigger driver dispatch
    await channel.bindQueue(QUEUES.DISPATCH, TOPIC_EXCHANGE, ROUTING_KEYS.RIDE_REQUESTED);
    await channel.bindQueue(QUEUES.DISPATCH, TOPIC_EXCHANGE, ROUTING_KEYS.RIDE_REJECTED);
    await channel.bindQueue(QUEUES.DISPATCH, TOPIC_EXCHANGE, ROUTING_KEYS.RIDE_TIMEOUT);

    // 4. Declare Notification Queue with DLX configuration
    await channel.assertQueue(QUEUES.NOTIFICATION, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_EXCHANGE,
        'x-dead-letter-routing-key': QUEUES.NOTIFICATION_DLQ,
      },
    });

    // Bind notification.queue to all ride events
    await channel.bindQueue(QUEUES.NOTIFICATION, TOPIC_EXCHANGE, 'ride.*');
    await channel.bindQueue(QUEUES.NOTIFICATION, TOPIC_EXCHANGE, 'driver.*');

    logger.info({
      host: RABBITMQ_HOST,
      port: RABBITMQ_PORT,
      exchange: TOPIC_EXCHANGE,
      dlx: DLX_EXCHANGE,
    }, '🐰 RabbitMQ connected: Exchanges & Durable Queues initialized');

    return { connection, channel };
  } catch (err) {
    isConnected = false;
    rabbitMetrics.connected = false;
    logger.warn({ error: err.message }, 'Failed to connect to RabbitMQ. Will retry in 5s...');
    setTimeout(initRabbitMQ, 5000);
    return null;
  }
}

export function isRabbitConnected() {
  return isConnected && channel !== null;
}

export function getChannel() {
  return channel;
}

/**
 * Publish persistent message to RabbitMQ Topic Exchange
 */
export async function publishEvent(routingKey, payload, options = {}) {
  if (!isRabbitConnected()) {
    logger.warn({ routingKey }, 'RabbitMQ offline: Cannot publish event');
    rabbitMetrics.publishErrors++;
    return false;
  }

  try {
    const buffer = Buffer.from(JSON.stringify(payload));
    const published = channel.publish(TOPIC_EXCHANGE, routingKey, buffer, {
      persistent: true, // Message durability: survives broker restarts
      messageId: options.messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      contentType: 'application/json',
      ...options,
    });

    if (published) {
      rabbitMetrics.publishedCount++;
      logger.info({ routingKey, messageId: options.messageId }, 'Published message to RabbitMQ');
    }
    return published;
  } catch (err) {
    logger.error(err, 'Error publishing to RabbitMQ');
    rabbitMetrics.publishErrors++;
    return false;
  }
}


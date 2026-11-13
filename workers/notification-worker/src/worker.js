import amqp from 'amqplib';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import { pool, query } from './db.js';

dotenv.config();

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = process.env.RABBITMQ_PORT || 5672;
const RABBITMQ_USER = process.env.RABBITMQ_USER || 'guest';
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'guest';
const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

const QUEUE_NAME = 'notification.queue';
const DLX_NAME = 'rideflow.dlx';
const DLQ_NAME = 'notification.dlq';

export const notificationMetrics = {
  notificationsSent: 0,
  notificationsFailed: 0,
  connected: false,
};

let connection = null;
let channel = null;

// Template generator for simulated multi-channel alerts
function formatNotification(event) {
  const eventType = event.eventType;
  const data = event.data || {};
  const rideId = event.aggregateId || data.id || 'N/A';

  switch (eventType) {
    case 'RIDE_REQUESTED':
      return {
        userId: data.passenger_id || 'user-pass-1',
        channel: 'PUSH',
        title: 'Ride Requested',
        message: `Your ride from ${data.pickup_address || 'pickup'} has been placed. Locating nearest driver...`,
      };

    case 'DRIVER_DISPATCH_OFFERED':
      return {
        userId: data.driver_id || 'user-drv-1',
        channel: 'SMS',
        title: 'Incoming Dispatch Offer',
        message: `New ride offer: ${data.distance_km || 2.5}km away. Vehicle: ${data.vehicle || 'Cab'}. Accept within 30s!`,
      };

    case 'DRIVER_ACCEPTED_OFFER':
      return {
        userId: data.passenger_id || 'user-pass-1',
        channel: 'PUSH',
        title: 'Driver Accepted & En Route',
        message: `Your driver has accepted the ride and is en route to pickup location!`,
      };

    case 'DRIVER_REJECTED_OFFER':
      return {
        userId: data.passenger_id || 'user-pass-1',
        channel: 'PUSH',
        title: 'Finding Next Driver',
        message: `Previous driver was unavailable. System is automatically finding the next closest driver...`,
      };

    case 'DRIVER_OFFER_EXPIRED':
      return {
        userId: data.driver_id || 'user-drv-1',
        channel: 'PUSH',
        title: 'Offer Expired',
        message: `Ride assignment offer expired after 30 seconds. System has routed it to another driver.`,
      };

    case 'RIDE_DRIVER_ARRIVED':
      return {
        userId: data.passenger_id || 'user-pass-1',
        channel: 'SMS',
        title: 'Driver Arrived',
        message: `Your driver has arrived at the pickup location. Please board your ride!`,
      };

    case 'RIDE_IN_PROGRESS':
      return {
        userId: data.passenger_id || 'user-pass-1',
        channel: 'PUSH',
        title: 'Trip Started',
        message: `Your trip has begun. Navigating safely to your destination.`,
      };

    case 'RIDE_COMPLETED':
      return {
        userId: data.passenger_id || 'user-pass-1',
        channel: 'EMAIL',
        title: 'Ride Completed & Receipt',
        message: `Trip completed! Total Fare: ₹${data.fare_amount || 0}. Thank you for riding with RideFlow.`,
      };

    case 'RIDE_CANCELLED':
      return {
        userId: data.passenger_id || 'user-pass-1',
        channel: 'PUSH',
        title: 'Ride Cancelled',
        message: `Your ride has been cancelled.`,
      };

    default:
      return {
        userId: 'user-pass-1',
        channel: 'PUSH',
        title: `Ride Update: ${eventType}`,
        message: `Status update for ride ${rideId}: ${eventType}`,
      };
  }
}

async function startNotificationWorker() {
  try {
    logger.info({ host: RABBITMQ_HOST, port: RABBITMQ_PORT }, '🔔 Starting Notification Worker...');

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    notificationMetrics.connected = true;

    await channel.prefetch(5);

    // Assert Queue and DLQ
    await channel.assertExchange(DLX_NAME, 'direct', { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, DLQ_NAME);

    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_NAME,
        'x-dead-letter-routing-key': DLQ_NAME,
      },
    });

    logger.info({ queue: QUEUE_NAME, dlq: DLQ_NAME }, '⚡ Notification Worker listening for event alerts');

    channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      const messageId = msg.properties.messageId || `msg-${Date.now()}`;
      let content = null;

      try {
        content = JSON.parse(msg.content.toString());
      } catch (parseErr) {
        logger.error({ parseErr: parseErr.message }, 'Fatal: Invalid notification payload - routing to DLQ');
        notificationMetrics.notificationsFailed++;
        channel.nack(msg, false, false);
        return;
      }

      logger.info({ messageId, eventType: content.eventType }, '📨 Processing simulated notification');

      try {
        const notif = formatNotification(content);
        const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        // Verify valid user_id foreign key in PostgreSQL
        let targetUserId = notif.userId;
        const userCheck = await query('SELECT id FROM users WHERE id = $1', [targetUserId]);
        if (userCheck.rows.length === 0) {
          // Fallback to existing seed user so FK constraint is satisfied
          const defaultUser = await query('SELECT id FROM users LIMIT 1');
          if (defaultUser.rows.length > 0) targetUserId = defaultUser.rows[0].id;
        }

        // Record Simulated Multi-Channel Notification in PostgreSQL
        await query(
          `INSERT INTO notifications (id, user_id, channel, title, message, status, sent_at)
           VALUES ($1, $2, $3, $4, $5, 'SENT', NOW())`,
          [notifId, targetUserId, notif.channel, notif.title, notif.message]
        );

        // Acknowledge Message
        channel.ack(msg);
        notificationMetrics.notificationsSent++;

        logger.info({
          notifId,
          channel: notif.channel,
          title: notif.title,
          recipient: targetUserId,
        }, `📱 Simulated [${notif.channel}] notification dispatched`);

      } catch (err) {
        logger.error({ err: err.message }, 'Failed to deliver notification');
        notificationMetrics.notificationsFailed++;
        channel.nack(msg, false, false);
      }
    });

  } catch (err) {
    logger.error(err, 'Failed to connect Notification Worker. Retrying in 5s...');
    notificationMetrics.connected = false;
    setTimeout(startNotificationWorker, 5000);
  }
}

// Graceful Shutdown
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Graceful shutdown initiated in Notification Worker...');
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
    logger.info('Clean shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error(err, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startNotificationWorker();

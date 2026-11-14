import amqp from 'amqplib';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import { pool, query } from './db.js';

dotenv.config();

const RIDE_SERVICE_URL = process.env.RIDE_SERVICE_URL || 'http://ride-service:5001';

async function dispatchRide(rideId) {
  const res = await fetch(`${RIDE_SERVICE_URL}/api/v1/rides/${rideId}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return await res.json();
}

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = process.env.RABBITMQ_PORT || 5672;
const RABBITMQ_USER = process.env.RABBITMQ_USER || 'guest';
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'guest';
const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

const QUEUE_NAME = 'dispatch.queue';
const DLX_NAME = 'rideflow.dlx';
const DLQ_NAME = 'dispatch.dlq';

export const workerMetrics = {
  tasksProcessed: 0,
  tasksFailed: 0,
  tasksSkippedIdempotent: 0,
  connected: false,
};

let connection = null;
let channel = null;

async function startWorker() {
  try {
    logger.info({ host: RABBITMQ_HOST, port: RABBITMQ_PORT }, '🚀 Starting Dispatch Worker...');

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    workerMetrics.connected = true;

    // Set prefetch to 1 for fair round-robin dispatching across worker replicas
    await channel.prefetch(1);

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

    logger.info({ queue: QUEUE_NAME, dlq: DLQ_NAME }, '⚡ Dispatch Worker listening for dispatch jobs');

    channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      const messageId = msg.properties.messageId || `msg-${Date.now()}`;
      const taskId = `task-dsp-${messageId}`;
      let content = null;

      try {
        content = JSON.parse(msg.content.toString());
      } catch (parseErr) {
        logger.error({ parseErr: parseErr.message }, 'Fatal: Corrupted message format - routing directly to DLQ');
        workerMetrics.tasksFailed++;
        channel.nack(msg, false, false); // Route immediately to Dead-Letter Queue
        return;
      }

      const rideId = content.aggregateId || content.data?.id || content.data?.rideId || content.data?.ride_id;

      if (!rideId) {
        logger.warn({ content }, 'Invalid message payload: missing rideId. Routing to DLQ.');
        channel.nack(msg, false, false);
        return;
      }

      logger.info({ messageId, rideId, eventType: content.eventType }, '📥 Consumed dispatch job from RabbitMQ');

      try {
        // 1. Idempotency Check: Verify if task already completed or ride already assigned
        const taskCheck = await query('SELECT status FROM tasks WHERE id = $1', [taskId]);
        if (taskCheck.rows.length > 0 && taskCheck.rows[0].status === 'COMPLETED') {
          logger.info({ taskId, rideId }, 'Idempotency filter: Task already completed. Skipping.');
          workerMetrics.tasksSkippedIdempotent++;
          channel.ack(msg);
          return;
        }

        // Record Task In-Progress
        await query(
          `INSERT INTO tasks (id, type, payload, status, attempts, created_at)
           VALUES ($1, 'DISPATCH_TASK', $2, 'PROCESSING', 1, NOW())
           ON CONFLICT (id) DO UPDATE SET attempts = tasks.attempts + 1, status = 'PROCESSING'`,
          [taskId, JSON.stringify(content)]
        );

        // 2. Execute Automatic Driver Dispatch Algorithm
        const result = await dispatchRide(rideId);

        // 3. Mark Task Completed
        await query(
          `UPDATE tasks 
           SET status = 'COMPLETED', processed_at = NOW() 
           WHERE id = $1`,
          [taskId]
        );

        // 4. Manual Message Acknowledgement (ACK)
        channel.ack(msg);
        workerMetrics.tasksProcessed++;

        logger.info({
          taskId,
          rideId,
          dispatched: result.dispatched,
          driver: result.driver?.name || null,
        }, '✅ Dispatch job successfully processed & ACKed');

      } catch (jobErr) {
        logger.error({ err: jobErr.message, rideId, taskId }, 'Dispatch Worker task execution failed');

        workerMetrics.tasksFailed++;

        // Record Task Failure
        await query(
          `UPDATE tasks 
           SET status = 'FAILED', error_message = $1 
           WHERE id = $2`,
          [jobErr.message, taskId]
        ).catch(() => {});

        // On fatal processing error, reject to DLQ
        channel.nack(msg, false, false);
      }
    });

  } catch (err) {
    logger.error(err, 'Failed to connect Dispatch Worker. Reconnecting in 5s...');
    workerMetrics.connected = false;
    setTimeout(startWorker, 5000);
  }
}

// Graceful Shutdown Handler
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Graceful shutdown initiated in Dispatch Worker...');
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
    logger.info('Clean shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error(err, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startWorker();


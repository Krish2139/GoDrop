import { pool, isDbConnected } from './db.js';
import { logger } from './logger.js';
import { publishEvent, isRabbitConnected, ROUTING_KEYS } from './rabbitmq.js';

export const outboxMetrics = {
  totalProcessed: 0,
  failedCount: 0,
  pendingCount: 0,
  lastPollAt: null,
};

// Map Outbox event types to RabbitMQ routing keys
function resolveRoutingKey(eventType) {
  switch (eventType) {
    case 'RIDE_REQUESTED': return ROUTING_KEYS.RIDE_REQUESTED;
    case 'DRIVER_DISPATCH_OFFERED': return ROUTING_KEYS.RIDE_OFFERED;
    case 'DRIVER_ACCEPTED_OFFER': return ROUTING_KEYS.RIDE_ACCEPTED;
    case 'DRIVER_REJECTED_OFFER': return ROUTING_KEYS.RIDE_REJECTED;
    case 'DRIVER_OFFER_EXPIRED': return ROUTING_KEYS.RIDE_TIMEOUT;
    case 'RIDE_DRIVER_ARRIVED': return ROUTING_KEYS.RIDE_ARRIVED;
    case 'RIDE_IN_PROGRESS': return ROUTING_KEYS.RIDE_STARTED;
    case 'RIDE_COMPLETED': return ROUTING_KEYS.RIDE_COMPLETED;
    case 'RIDE_CANCELLED': return ROUTING_KEYS.RIDE_CANCELLED;
    default: return `ride.${eventType.toLowerCase()}`;
  }
}

/**
 * Poll and Relay Transactional Outbox Events to RabbitMQ
 */
export async function processOutboxBatch() {
  if (!isDbConnected() || !isRabbitConnected()) {
    return 0;
  }

  outboxMetrics.lastPollAt = new Date().toISOString();
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Safe Concurrency: Select pending events with row-level SKIP LOCKED
    const res = await client.query(
      `SELECT * FROM outbox_events 
       WHERE status = 'PENDING' 
       ORDER BY created_at ASC 
       LIMIT 25 
       FOR UPDATE SKIP LOCKED`
    );

    if (res.rows.length === 0) {
      await client.query('COMMIT');
      return 0;
    }

    outboxMetrics.pendingCount = res.rows.length;
    let processed = 0;

    for (const event of res.rows) {
      const routingKey = resolveRoutingKey(event.event_type);
      let payload = event.payload;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          // keep as string
        }
      }

      // Publish to RabbitMQ Topic Exchange with durability
      const published = await publishEvent(routingKey, {
        eventId: event.id,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        eventType: event.event_type,
        data: payload,
        occurredAt: event.created_at,
      }, {
        messageId: event.id,
      });

      if (published) {
        // Mark Outbox Event as PUBLISHED
        await client.query(
          `UPDATE outbox_events 
           SET status = 'PUBLISHED', published_at = NOW() 
           WHERE id = $1`,
          [event.id]
        );
        processed++;
        outboxMetrics.totalProcessed++;
      } else {
        outboxMetrics.failedCount++;
      }
    }

    await client.query('COMMIT');
    logger.info({ processedCount: processed }, 'Transactional Outbox batch relayed to RabbitMQ');
    return processed;
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error(err, 'Error in Transactional Outbox poller');
    outboxMetrics.failedCount++;
    return 0;
  } finally {
    if (client) client.release();
  }
}

let pollerTimer = null;

/**
 * Start the background Transactional Outbox Poller
 */
export function startOutboxPublisher(intervalMs = 1500) {
  logger.info({ intervalMs }, 'Starting Transactional Outbox Publisher background poller');
  
  if (pollerTimer) clearInterval(pollerTimer);
  
  pollerTimer = setInterval(async () => {
    try {
      await processOutboxBatch();
    } catch (err) {
      logger.error(err, 'Unhandled error in Outbox poller loop');
    }
  }, intervalMs);
}

export function stopOutboxPublisher() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
}

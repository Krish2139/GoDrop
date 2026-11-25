import express from 'express';
import { z } from 'zod';
import {
  RIDE_STATES,
  RIDE_LIFECYCLE_STEPS,
  VALID_TRANSITIONS,
  isValidTransition,
  isCancellable,
  calculateHaversineDistance,
  calculateFare
} from '../stateMachine.js';
import { logger } from '../logger.js';
import { query, isDbConnected, pool } from '../db.js';
import {
  dispatchRide,
  acceptOffer,
  rejectOffer,
  expireOffer,
  assignmentsStore,
  memoryDrivers
} from '../dispatchEngine.js';
import {
  getCache,
  setCache,
  invalidateKey,
  invalidatePattern,
  rideCacheMetrics,
  isRedisConnected,
  getRedisClient,
  publishRealtimeEvent
} from '../redis.js';

const SURGE_REDIS_KEY = 'rideflow:pricing:surge_multiplier';
let currentSurgeMultiplier = 1.0;

function clampSurgeMultiplier(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 1.0;
  return Number(Math.min(3.0, Math.max(1.0, num)).toFixed(1));
}

export async function getSurgeMultiplier() {
  if (isRedisConnected()) {
    try {
      const rClient = getRedisClient();
      const raw = await rClient.get(SURGE_REDIS_KEY);
      if (raw !== null) {
        currentSurgeMultiplier = clampSurgeMultiplier(parseFloat(raw));
        return currentSurgeMultiplier;
      }
    } catch (e) { }
  }
  return currentSurgeMultiplier;
}

export async function setSurgeMultiplier(multiplier) {
  const clamped = clampSurgeMultiplier(multiplier);
  currentSurgeMultiplier = clamped;
  if (isRedisConnected()) {
    try {
      const rClient = getRedisClient();
      await rClient.set(SURGE_REDIS_KEY, String(clamped));
    } catch (e) { }
  }
  return clamped;
}

const router = express.Router();

export async function invalidateRideCaches(rideId) {
  await Promise.all([
    invalidateKey(`cache:rides:${rideId}`),
    invalidatePattern('cache:rides:list:*'),
    invalidatePattern('cache:drivers:*'),
  ]);
}

// In-Memory store fallback
export const ridesStore = [
  {
    id: 'ride-seed-1',
    passenger_id: 'pass-seed-1',
    passenger_name: 'Aarav Patel',
    driver_id: 'driver-seed-1',
    status: RIDE_STATES.COMPLETED,
    pickup_address: 'SG Highway (Iscon Cross Road)',
    pickup_latitude: 23.0275,
    pickup_longitude: 72.5076,
    destination_address: 'Navrangpura (CG Road)',
    destination_latitude: 23.0372,
    destination_longitude: 72.5613,
    distance_km: 5.80,
    fare_amount: 157.30,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  }
];

const createRideSchema = z.object({
  passenger_id: z.string().min(1, 'Passenger ID is required'),
  passenger_name: z.string().optional().default('Aarav Patel'),
  pickup_address: z.string().min(2, 'Pickup address is required'),
  pickup_latitude: z.number().min(-90).max(90),
  pickup_longitude: z.number().min(-180).max(180),
  destination_address: z.string().min(2, 'Destination address is required'),
  destination_latitude: z.number().min(-90).max(90),
  destination_longitude: z.number().min(-180).max(180),
  auto_dispatch: z.boolean().optional().default(true),
});

const cancelRideSchema = z.object({
  reason: z.string().optional().default('Passenger requested cancellation'),
});

// GET /api/v1/rides/cache/metrics - Cache Telemetry
router.get('/cache/metrics', (req, res) => {
  res.json({
    success: true,
    redisConnected: isRedisConnected(),
    metrics: {
      hits: rideCacheMetrics.hits,
      misses: rideCacheMetrics.misses,
      hitRate: rideCacheMetrics.hitRate,
      invalidations: rideCacheMetrics.invalidations,
    },
  });
});

// Helper: Atomic State Transition with Outbox Pattern & Cache Invalidation
async function executeTransition(res, rideId, targetState, additionalFields = {}, outboxEventType = null) {
  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // Row-Level Lock: Prevent concurrency race conditions
      const selectRes = await client.query('SELECT * FROM rides WHERE id = $1 FOR UPDATE', [rideId]);
      if (selectRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
      }

      const ride = selectRes.rows[0];

      // Validate transition legality
      if (!isValidTransition(ride.status, targetState)) {
        await client.query('ROLLBACK');
        logger.warn({ rideId, currentStatus: ride.status, targetState }, 'Illegal state transition attempt');
        return res.status(400).json({
          success: false,
          error: 'InvalidStateTransition',
          message: `Illegal transition: Cannot transition ride from '${ride.status}' to '${targetState}'.`,
          currentStatus: ride.status,
          permittedTransitions: VALID_TRANSITIONS[ride.status] || [],
        });
      }

      const driverId = additionalFields.driver_id !== undefined ? additionalFields.driver_id : ride.driver_id;
      const cancellationReason = additionalFields.cancellation_reason || ride.cancellation_reason;

      // Update Ride record
      await client.query(
        `UPDATE rides 
         SET status = $1, driver_id = $2, cancellation_reason = $3, updated_at = NOW() 
         WHERE id = $4`,
        [targetState, driverId, cancellationReason, rideId]
      );

      const fullSelectRes = await client.query(
        `SELECT r.*, u.name as driver_name, u.phone as driver_phone, d.vehicle_model, d.license_plate, d.rating as driver_rating
         FROM rides r
         LEFT JOIN drivers d ON r.driver_id = d.id
         LEFT JOIN users u ON d.user_id = u.id
         WHERE r.id = $1`,
        [rideId]
      );
      const updatedRide = fullSelectRes.rows[0];

      // Insert Transactional Outbox Event
      const eventType = outboxEventType || `RIDE_${targetState}`;
      await client.query(
        `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [
          `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          'RIDE',
          rideId,
          eventType,
          JSON.stringify(updatedRide)
        ]
      );

      // When driver arrives at pickup, update driver location to pickup coordinates
      if (targetState === RIDE_STATES.DRIVER_ARRIVED && updatedRide.driver_id) {
        if (updatedRide.pickup_latitude && updatedRide.pickup_longitude) {
          await client.query(
            `UPDATE drivers 
             SET current_latitude = $1, current_longitude = $2, updated_at = NOW() 
             WHERE id = $3`,
            [updatedRide.pickup_latitude, updatedRide.pickup_longitude, updatedRide.driver_id]
          );
        }
      }

      // When trip starts, update driver status to ON_TRIP
      if (targetState === RIDE_STATES.IN_PROGRESS && updatedRide.driver_id) {
        await client.query(
          `UPDATE drivers SET status = 'ON_TRIP', updated_at = NOW() WHERE id = $1`,
          [updatedRide.driver_id]
        );
      }

      // If ride is completed, increment passenger total_rides count and release driver back to AVAILABLE
      // ALSO update driver's current location to ride destination (e.g. from Vastrapur to GIFT City)!
      if (targetState === RIDE_STATES.COMPLETED) {
        // Revoke all remaining OFFERED assignments for this ride and any cancelled rides so they never go to other drivers
        await client.query(
          `UPDATE ride_assignments 
           SET status = 'REVOKED', responded_at = NOW() 
           WHERE (ride_id = $1 OR ride_id IN (SELECT id FROM rides WHERE passenger_id = $2)) AND status = 'OFFERED'`,
          [rideId, updatedRide.passenger_id]
        );
        await client.query(
          `UPDATE drivers 
           SET status = 'AVAILABLE', updated_at = NOW() 
           WHERE id IN (
             SELECT driver_id FROM ride_assignments 
             WHERE (ride_id = $1 OR ride_id IN (SELECT id FROM rides WHERE passenger_id = $2)) AND status = 'REVOKED'
           ) AND status = 'RESERVED'`,
          [rideId, updatedRide.passenger_id]
        );

        if (updatedRide.passenger_id) {
          // If a ride is completed (especially a rescue ride), cancel ALL other non-completed rides for this passenger
          await client.query(
            `UPDATE rides 
             SET status = 'CANCELLED', cancellation_reason = 'RESCUE_COMPLETED', updated_at = NOW() 
             WHERE passenger_id = $1 AND id != $2 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
            [updatedRide.passenger_id, rideId]
          );

          // Also cancel any aborted SOS rides for this passenger so old rides never linger
          await client.query(
            `UPDATE rides 
             SET status = 'CANCELLED', cancellation_reason = 'RESCUE_COMPLETED', updated_at = NOW() 
             WHERE passenger_id = $1 AND status = 'ABORTED_SOS'`,
            [updatedRide.passenger_id]
          );

          // Mark any active SOS incidents associated with this passenger or ride as RESOLVED
          await client.query(
            `UPDATE sos_incidents 
             SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
             WHERE (passenger_id = $1 OR ride_id = $2 OR rescue_ride_id = $2) AND status = 'ACTIVE'`,
            [updatedRide.passenger_id, rideId]
          );

          // If a rescue ride is completed, ensure any offending flagged drivers are immediately purged from database
          if (updatedRide.is_free_rescue) {
            const incRes = await client.query(
              'SELECT driver_id FROM sos_incidents WHERE (rescue_ride_id = $1 OR passenger_id = $2) AND driver_id IS NOT NULL',
              [rideId, updatedRide.passenger_id]
            );
            for (const inc of incRes.rows) {
              if (inc.driver_id) {
                const drv = await client.query('SELECT user_id FROM drivers WHERE id = $1', [inc.driver_id]);
                const uId = drv.rows[0]?.user_id;
                await client.query('DELETE FROM drivers WHERE id = $1', [inc.driver_id]);
                if (uId) await client.query('DELETE FROM users WHERE id = $1', [uId]);
              }
            }
          }

          await client.query(
            `UPDATE passengers SET total_rides = total_rides + 1 WHERE id = $1`,
            [updatedRide.passenger_id]
          );
        }
        if (updatedRide.driver_id) {
          await client.query(
            `UPDATE drivers 
             SET status = 'AVAILABLE', 
                 current_latitude = COALESCE($1, current_latitude), 
                 current_longitude = COALESCE($2, current_longitude), 
                 updated_at = NOW() 
             WHERE id = $3`,
            [updatedRide.destination_latitude, updatedRide.destination_longitude, updatedRide.driver_id]
          );
        }
      }

      await client.query('COMMIT');
      await invalidateRideCaches(rideId);
      await invalidatePattern('cache:drivers:*');

      // Realtime Event Broadcasting via Redis to Socket.IO
      publishRealtimeEvent(`ride:${rideId}`, 'ride:status:changed', {
        rideId,
        status: targetState,
        ride: updatedRide,
      });
      if (updatedRide.passenger_id) {
        publishRealtimeEvent(`user:${updatedRide.passenger_id}`, 'ride:status:changed', {
          rideId,
          status: targetState,
          ride: updatedRide,
        });
      }
      publishRealtimeEvent('admin:telemetry', 'admin:ride:status', {
        rideId,
        status: targetState,
        ride: updatedRide,
      });

      // Broadcast Driver Location Telemetry on Arrival & Completion
      if (targetState === RIDE_STATES.COMPLETED && updatedRide.driver_id) {
        publishRealtimeEvent(`ride:${rideId}`, 'ride:driver:location', {
          driverId: updatedRide.driver_id,
          driverName: updatedRide.driver_name,
          latitude: updatedRide.destination_latitude,
          longitude: updatedRide.destination_longitude,
          heading: 0,
          speed: 0,
        });
        publishRealtimeEvent('admin:telemetry', 'driver:telemetry:update', {
          driverId: updatedRide.driver_id,
          status: 'AVAILABLE',
          latitude: updatedRide.destination_latitude,
          longitude: updatedRide.destination_longitude,
          heading: 0,
        });
      } else if (targetState === RIDE_STATES.DRIVER_ARRIVED && updatedRide.driver_id) {
        publishRealtimeEvent(`ride:${rideId}`, 'ride:driver:location', {
          driverId: updatedRide.driver_id,
          driverName: updatedRide.driver_name,
          latitude: updatedRide.pickup_latitude,
          longitude: updatedRide.pickup_longitude,
          heading: 0,
          speed: 0,
        });
      }

      logger.info({ rideId, previousStatus: ride.status, newStatus: targetState }, 'Atomic ride transition committed & cache invalidated');

      return res.json({
        success: true,
        message: `Ride state successfully transitioned to ${targetState}`,
        source: 'PostgreSQL',
        data: updatedRide,
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'Database error during atomic state transition');
    } finally {
      if (client) client.release();
    }
  }

  // In-Memory Fallback
  const ride = ridesStore.find(r => r.id === rideId);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }

  if (!isValidTransition(ride.status, targetState)) {
    return res.status(400).json({
      success: false,
      error: 'InvalidStateTransition',
      message: `Illegal transition: Cannot transition ride from '${ride.status}' to '${targetState}'.`,
      currentStatus: ride.status,
    });
  }

  ride.status = targetState;
  ride.updated_at = new Date().toISOString();
  Object.assign(ride, additionalFields);

  if (targetState === RIDE_STATES.DRIVER_ARRIVED && ride.driver_id) {
    const d = memoryDrivers.find(d => d.id === ride.driver_id);
    if (d && ride.pickup_latitude && ride.pickup_longitude) {
      d.current_latitude = ride.pickup_latitude;
      d.current_longitude = ride.pickup_longitude;
    }
  }

  if (targetState === RIDE_STATES.IN_PROGRESS && ride.driver_id) {
    const d = memoryDrivers.find(d => d.id === ride.driver_id);
    if (d) d.status = 'ON_TRIP';
  }

  if (targetState === RIDE_STATES.COMPLETED && ride.driver_id) {
    const d = memoryDrivers.find(d => d.id === ride.driver_id);
    if (d) {
      d.status = 'AVAILABLE';
      if (ride.destination_latitude && ride.destination_longitude) {
        d.current_latitude = ride.destination_latitude;
        d.current_longitude = ride.destination_longitude;
      }
    }
  }

  await invalidateRideCaches(rideId);

  return res.json({
    success: true,
    message: `Ride state successfully transitioned to ${targetState}`,
    source: 'InMemoryStore',
    data: ride,
  });
}

// GET /api/v1/rides/pricing/surge - Fetch active surge pricing multiplier
router.get('/pricing/surge', async (req, res) => {
  const multiplier = await getSurgeMultiplier();
  res.json({
    success: true,
    data: {
      multiplier,
      base_fare: Number((50 * multiplier).toFixed(2)),
      per_km_rate: Number((18.5 * multiplier).toFixed(2)),
      is_surge: multiplier > 1.0,
    },
  });
});

// PUT /api/v1/rides/pricing/surge - Update live surge pricing multiplier and broadcast to all portals
router.put('/pricing/surge', async (req, res) => {
  const { multiplier } = req.body || {};
  if (multiplier === undefined || Number.isNaN(Number(multiplier))) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'Valid multiplier (1.0 - 3.0) required' });
  }

  const updated = await setSurgeMultiplier(multiplier);
  const payload = {
    multiplier: updated,
    base_fare: Number((50 * updated).toFixed(2)),
    per_km_rate: Number((18.5 * updated).toFixed(2)),
    is_surge: updated > 1.0,
    updated_at: new Date().toISOString(),
  };

  logger.info({ multiplier: updated }, '⚡ Admin updated dynamic Surge Pricing Multiplier');
  publishRealtimeEvent(null, 'pricing:surge:updated', payload);

  res.json({
    success: true,
    message: `Surge pricing multiplier updated to ${updated.toFixed(1)}x`,
    data: payload,
  });
});

// GET /api/v1/rides - Query and filter rides (Cached with TTL 20s)
router.get('/', async (req, res) => {
  try {
    const { status, passenger_id, driver_id, limit = 50, page = 1 } = req.query;
    const cacheKey = `cache:rides:list:${status || 'all'}:${passenger_id || 'all'}:${driver_id || 'all'}:${limit}:${page}`;

    // 1. Check Redis Cache
    const cachedList = await getCache(cacheKey);
    if (cachedList) {
      res.setHeader('X-Cache', 'HIT');
      return res.json({
        success: true,
        total: cachedList.length,
        source: 'Redis-Cache',
        data: cachedList,
      });
    }

    res.setHeader('X-Cache', 'MISS');

    // 2. Cache Miss: Query Database
    if (isDbConnected()) {
      try {
        let sql = `
        SELECT r.*, 
               d.name as driver_name, d.phone as driver_phone, d.vehicle_model, d.license_plate, d.rating as driver_rating,
               p_user.name as passenger_name, p_user.phone as passenger_phone,
               COALESCE(
                 (SELECT json_agg(json_build_object('driver_id', ra.driver_id, 'status', ra.status, 'offered_at', ra.offered_at, 'responded_at', ra.responded_at))
                  FROM ride_assignments ra WHERE ra.ride_id = r.id),
                 '[]'::json
               ) as assignments
        FROM rides r
        LEFT JOIN (
          SELECT dr.id, u.name, u.phone, dr.vehicle_model, dr.license_plate, dr.rating
          FROM drivers dr
          JOIN users u ON dr.user_id = u.id
        ) d ON r.driver_id = d.id
        LEFT JOIN passengers p ON r.passenger_id = p.id
        LEFT JOIN users p_user ON p.user_id = p_user.id
        WHERE 1=1
      `;
        const params = [];

        if (status) {
          params.push(status);
          sql += ` AND r.status = $${params.length}`;
        }
        if (passenger_id) {
          params.push(passenger_id);
          sql += ` AND r.passenger_id = $${params.length}`;
        }
        if (driver_id) {
          params.push(driver_id);
          sql += ` AND (r.driver_id = $${params.length} OR r.id IN (SELECT ride_id FROM ride_assignments WHERE driver_id = $${params.length}))`;
        }

        sql += ` ORDER BY r.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

        const result = await query(sql, params);
        await setCache(cacheKey, result.rows, 20);

        return res.json({
          success: true,
          total: result.rowCount,
          source: 'PostgreSQL',
          data: result.rows,
        });
      } catch (err) {
        logger.error(err, 'PostgreSQL error querying rides');
      }
    }

    let filtered = [...ridesStore];
    if (status) filtered = filtered.filter(r => r.status === status);
    if (passenger_id) filtered = filtered.filter(r => r.passenger_id === passenger_id);
    if (driver_id) filtered = filtered.filter(r => r.driver_id === driver_id);
    filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    await setCache(cacheKey, filtered, 20);

    return res.json({
      success: true,
      total: filtered.length,
      source: 'InMemoryStore',
      data: filtered,
    });
  } catch (err) {
    logger.error(err, 'Error in GET /rides');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// POST /api/v1/rides - Create Ride Request & Trigger Auto-Dispatch
router.post('/', async (req, res) => {
  try {
    const validated = createRideSchema.parse(req.body);
    const rideId = `ride-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Calculate distance and dynamic surge-adjusted fare
    const distanceKm = calculateHaversineDistance(
      validated.pickup_latitude,
      validated.pickup_longitude,
      validated.destination_latitude,
      validated.destination_longitude
    );
    const surgeMultiplier = await getSurgeMultiplier();
    const fare = calculateFare(distanceKm, surgeMultiplier);

    let createdRide = null;

    if (isDbConnected()) {
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Insert new ride in REQUESTED status
        const insertRes = await client.query(
          `INSERT INTO rides (
            id, passenger_id, status, pickup_address, pickup_latitude, pickup_longitude,
            destination_address, destination_latitude, destination_longitude, distance_km, fare_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *`,
          [
            rideId,
            validated.passenger_id,
            RIDE_STATES.REQUESTED,
            validated.pickup_address,
            validated.pickup_latitude,
            validated.pickup_longitude,
            validated.destination_address,
            validated.destination_latitude,
            validated.destination_longitude,
            distanceKm,
            fare
          ]
        );

        createdRide = insertRes.rows[0];

        // Insert Outbox Event for ride creation
        await client.query(
          `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
          [
            `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            'RIDE',
            rideId,
            'RIDE_REQUESTED',
            JSON.stringify(createdRide)
          ]
        );

        await client.query('COMMIT');
        logger.info({ rideId, distanceKm, fare }, 'Ride request committed in PostgreSQL');
      } catch (err) {
        if (client) await client.query('ROLLBACK');
        logger.error(err, 'PostgreSQL ride creation failed, falling back to memory');
      } finally {
        if (client) client.release();
      }
    }

    if (!createdRide) {
      createdRide = {
        id: rideId,
        passenger_id: validated.passenger_id,
        passenger_name: validated.passenger_name,
        driver_id: null,
        status: RIDE_STATES.REQUESTED,
        pickup_address: validated.pickup_address,
        pickup_latitude: validated.pickup_latitude,
        pickup_longitude: validated.pickup_longitude,
        destination_address: validated.destination_address,
        destination_latitude: validated.destination_latitude,
        destination_longitude: validated.destination_longitude,
        distance_km: distanceKm,
        fare_amount: fare,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      ridesStore.push(createdRide);
    }

    // AUTOMATIC DISPATCH ALGORITHM EXECUTION
    let dispatchResult = null;
    if (validated.auto_dispatch) {
      dispatchResult = await dispatchRide(rideId);
      if (dispatchResult && dispatchResult.ride) {
        createdRide = dispatchResult.ride;
      }
    }

    // Broadcast real-time creation
    publishRealtimeEvent(`user:${validated.passenger_id}`, 'ride:status:changed', {
      rideId,
      status: createdRide.status,
      ride: createdRide,
    });
    publishRealtimeEvent('admin:telemetry', 'admin:ride:status', {
      rideId,
      status: createdRide.status,
      ride: createdRide,
    });

    return res.status(201).json({
      success: true,
      message: dispatchResult?.dispatched
        ? `Ride created! Nearest driver (${dispatchResult.driver.name}, ${dispatchResult.driver.distance_km}km) atomically reserved.`
        : 'Ride created! System searching for nearby drivers.',
      source: isDbConnected() ? 'PostgreSQL' : 'InMemoryStore',
      data: createdRide,
      dispatch: dispatchResult,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    logger.error(err, 'Error creating ride');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// POST /api/v1/rides/:id/dispatch - Manually or Asynchronously Trigger Dispatch Engine
router.post('/:id/dispatch', async (req, res) => {
  const result = await dispatchRide(req.params.id);
  res.json(result);
});

// GET /api/v1/rides/:id/assignments - View Dispatch Offer History for this ride
router.get('/:id/assignments', async (req, res) => {
  if (isDbConnected()) {
    try {
      const result = await query(
        `SELECT a.*, u.name as driver_name, u.phone as driver_phone, d.vehicle_model, d.license_plate, d.rating as driver_rating
         FROM ride_assignments a
         JOIN drivers d ON a.driver_id = d.id
         JOIN users u ON d.user_id = u.id
         WHERE a.ride_id = $1
         ORDER BY a.offered_at DESC`,
        [req.params.id]
      );
      return res.json({
        success: true,
        total: result.rowCount,
        source: 'PostgreSQL',
        data: result.rows,
      });
    } catch (err) {
      logger.error(err, 'PostgreSQL error fetching ride assignments');
    }
  }

  const assignments = assignmentsStore.filter(a => a.ride_id === req.params.id);
  res.json({
    success: true,
    total: assignments.length,
    source: 'InMemoryStore',
    data: assignments,
  });
});

// GET /api/v1/rides/:id - Get Single Ride Details (Cached with TTL 30s)
router.get('/:id', async (req, res) => {
  const cacheKey = `cache:rides:${req.params.id}`;

  // 1. Check Redis Cache
  const cachedRide = await getCache(cacheKey);
  if (cachedRide) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ success: true, source: 'Redis-Cache', data: cachedRide });
  }

  res.setHeader('X-Cache', 'MISS');

  // 2. Cache Miss: Query Database
  if (isDbConnected()) {
    try {
      const result = await query(
        `SELECT r.*, u.name as driver_name, u.phone as driver_phone, d.vehicle_model, d.license_plate, d.rating as driver_rating
         FROM rides r
         LEFT JOIN drivers d ON r.driver_id = d.id
         LEFT JOIN users u ON d.user_id = u.id
         WHERE r.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
        await setCache(cacheKey, result.rows[0], 30);
        return res.json({ success: true, source: 'PostgreSQL', data: result.rows[0] });
      }
    } catch (err) {
      logger.error(err, 'PostgreSQL fetch ride error');
    }
  }

  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }
  await setCache(cacheKey, ride, 30);
  res.json({ success: true, source: 'InMemoryStore', data: ride });
});

// POST /api/v1/rides/:id/rate - Rate driver for a completed ride
router.post('/:id/rate', async (req, res) => {
  try {
    const rawRating = parseFloat(req.body.rating);
    if (isNaN(rawRating) || rawRating < 1 || rawRating > 5) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Rating must be a numeric score between 1 and 5'
      });
    }
    const submittedRating = Math.max(1, Math.min(5, rawRating));
    const comment = req.body.comment || '';

    let driverId = req.body.driver_id;
    if (isDbConnected()) {
      try {
        if (!driverId) {
          const rideRes = await query('SELECT driver_id FROM rides WHERE id = $1', [req.params.id]);
          if (rideRes.rows.length > 0) {
            driverId = rideRes.rows[0].driver_id;
          }
        }

        if (driverId) {
          const findDriver = await query('SELECT * FROM drivers WHERE id = $1', [driverId]);
          if (findDriver.rows.length > 0) {
            const currentDriver = findDriver.rows[0];
            const currentRating = parseFloat(currentDriver.rating) || 5.0;
            const currentCount = parseInt(currentDriver.total_ratings, 10) || 5;

            const newCount = currentCount + 1;
            const newRating = Number(((currentRating * currentCount + submittedRating) / newCount).toFixed(2));

            await query(
              'UPDATE drivers SET rating = $1, total_ratings = $2, updated_at = NOW() WHERE id = $3',
              [newRating, newCount, driverId]
            );

            return res.json({
              success: true,
              message: `Driver overall rating successfully updated to ${newRating.toFixed(2)}`,
              data: {
                driverId,
                rating: newRating,
                totalRatings: newCount,
                previousRating: currentRating,
                submittedRating,
                comment,
                rideId: req.params.id
              }
            });
          }
        }
      } catch (err) {
        logger.error(err, 'Error updating driver rating from ride');
      }
    }

    res.json({
      success: true,
      message: 'Rating submitted',
      data: { rating: submittedRating, comment, rideId: req.params.id }
    });
  } catch (err) {
    logger.error(err, 'Error rating ride');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// POST /api/v1/rides/:id/cancel - Cancel Ride (Releases driver if assigned & invalidates cache)
router.post('/:id/cancel', async (req, res) => {
  const { reason } = cancelRideSchema.parse(req.body || {});

  if (isDbConnected()) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const checkRes = await client.query('SELECT * FROM rides WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (checkRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
      }

      const ride = checkRes.rows[0];
      if (!isCancellable(ride.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'CannotCancelRide',
          message: `Ride cannot be cancelled from status '${ride.status}'. Only [REQUESTED, PENDING, DRIVER_ASSIGNED] are cancellable.`,
          status: ride.status,
        });
      }

      // If a driver was reserved for this ride, release them back to AVAILABLE
      if (ride.driver_id) {
        await client.query(
          `UPDATE drivers SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1 AND status = 'RESERVED'`,
          [ride.driver_id]
        );
        await client.query(
          `UPDATE ride_assignments SET status = 'EXPIRED', responded_at = NOW() WHERE ride_id = $1 AND status = 'OFFERED'`,
          [ride.id]
        );
      }

      // Transition ride to CANCELLED
      const updateRes = await client.query(
        `UPDATE rides SET status = 'CANCELLED', cancellation_reason = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [reason, req.params.id]
      );

      // Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, 'RIDE', $2, 'RIDE_CANCELLED', $3, 'PENDING')`,
        [
          `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          req.params.id,
          JSON.stringify(updateRes.rows[0])
        ]
      );

      await client.query('COMMIT');
      await invalidateRideCaches(req.params.id);

      return res.json({
        success: true,
        message: 'Ride successfully cancelled. Reserved driver released.',
        source: 'PostgreSQL',
        data: updateRes.rows[0],
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      logger.error(err, 'PostgreSQL cancel error');
    } finally {
      if (client) client.release();
    }
  }

  // In-Memory Fallback
  await invalidateRideCaches(req.params.id);
  return executeTransition(res, req.params.id, RIDE_STATES.CANCELLED, { cancellation_reason: reason });
});

// POST /api/v1/rides/:id/accept - Driver Accepts Offer
router.post('/:id/accept', async (req, res) => {
  let { driver_id } = req.body || {};
  if (!driver_id) {
    if (isDbConnected()) {
      const rideRes = await query('SELECT driver_id FROM rides WHERE id = $1', [req.params.id]);
      if (rideRes.rows.length > 0) driver_id = rideRes.rows[0].driver_id;
    } else {
      const ride = ridesStore.find(r => r.id === req.params.id);
      if (ride) driver_id = ride.driver_id;
    }
  }
  if (!driver_id) {
    driver_id = 'driver-seed-1';
  }
  const result = await acceptOffer(req.params.id, driver_id);
  res.json(result);
});

// POST /api/v1/rides/:id/reject - Driver Rejects Offer (Cascades to next driver)
router.post('/:id/reject', async (req, res) => {
  const { driver_id, reason } = req.body || {};
  if (!driver_id) {
    // If not provided in body, fetch current driver assigned to ride
    let currentDriverId = null;
    if (isDbConnected()) {
      const rideRes = await query('SELECT driver_id FROM rides WHERE id = $1', [req.params.id]);
      if (rideRes.rows.length > 0) currentDriverId = rideRes.rows[0].driver_id;
    } else {
      const ride = ridesStore.find(r => r.id === req.params.id);
      if (ride) currentDriverId = ride.driver_id;
    }
    const result = await rejectOffer(req.params.id, currentDriverId || 'driver-seed-1', reason || 'Driver rejected');
    return res.json(result);
  }
  const result = await rejectOffer(req.params.id, driver_id, reason || 'Driver rejected');
  res.json(result);
});

// POST /api/v1/rides/:id/expire - Offer Timed Out (30s)
router.post('/:id/expire', async (req, res) => {
  const result = await expireOffer(req.params.id);
  res.json(result);
});

// POST /api/v1/rides/:id/arrived - Driver Arrived at Pickup
router.post('/:id/arrived', (req, res) => {
  return executeTransition(res, req.params.id, RIDE_STATES.DRIVER_ARRIVED);
});

// POST /api/v1/rides/:id/start - Trip In Progress
router.post('/:id/start', (req, res) => {
  return executeTransition(res, req.params.id, RIDE_STATES.IN_PROGRESS);
});

// POST /api/v1/rides/:id/complete - Trip Completed
router.post('/:id/complete', (req, res) => {
  return executeTransition(res, req.params.id, RIDE_STATES.COMPLETED);
});

export default router;

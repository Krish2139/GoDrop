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

const router = express.Router();

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
});

const cancelRideSchema = z.object({
  reason: z.string().optional().default('Passenger requested cancellation'),
});

// Helper: Atomic State Transition with Outbox Pattern
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
      const updateRes = await client.query(
        `UPDATE rides 
         SET status = $1, driver_id = $2, cancellation_reason = $3, updated_at = NOW() 
         WHERE id = $4 
         RETURNING *`,
        [targetState, driverId, cancellationReason, rideId]
      );

      const updatedRide = updateRes.rows[0];

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

      // If ride is completed, increment passenger total_rides count
      if (targetState === RIDE_STATES.COMPLETED && updatedRide.passenger_id) {
        await client.query(
          `UPDATE passengers SET total_rides = total_rides + 1 WHERE id = $1`,
          [updatedRide.passenger_id]
        );
      }

      await client.query('COMMIT');

      logger.info({ rideId, previousStatus: ride.status, newStatus: targetState }, 'Atomic ride transition committed');

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

  return res.json({
    success: true,
    message: `Ride state successfully transitioned to ${targetState}`,
    source: 'InMemoryStore',
    data: ride,
  });
}

// GET /api/v1/rides - Query and filter rides
router.get('/', async (req, res) => {
  const { status, passenger_id, driver_id, limit = 50, page = 1 } = req.query;

  if (isDbConnected()) {
    try {
      let sql = `
        SELECT r.*, d.name as driver_name, d.vehicle_model, d.license_plate, d.rating as driver_rating
        FROM rides r
        LEFT JOIN drivers d ON r.driver_id = d.id
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
        sql += ` AND r.driver_id = $${params.length}`;
      }

      sql += ` ORDER BY r.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

      const result = await query(sql, params);
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

  res.json({
    success: true,
    total: filtered.length,
    source: 'InMemoryStore',
    data: filtered,
  });
});

// POST /api/v1/rides - Create Ride Request
router.post('/', async (req, res) => {
  try {
    const validated = createRideSchema.parse(req.body);
    const rideId = `ride-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Calculate distance and dynamic fare
    const distanceKm = calculateHaversineDistance(
      validated.pickup_latitude,
      validated.pickup_longitude,
      validated.destination_latitude,
      validated.destination_longitude
    );
    const fare = calculateFare(distanceKm);

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

        const newRide = insertRes.rows[0];

        // Insert Outbox Event for asynchronous dispatch processing
        await client.query(
          `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
          [
            `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            'RIDE',
            rideId,
            'RIDE_REQUESTED',
            JSON.stringify(newRide)
          ]
        );

        await client.query('COMMIT');

        logger.info({ rideId, distanceKm, fare }, 'Ride request committed in PostgreSQL');

        return res.status(201).json({
          success: true,
          message: 'Ride request created successfully.',
          source: 'PostgreSQL',
          data: newRide,
        });
      } catch (err) {
        if (client) await client.query('ROLLBACK');
        logger.error(err, 'PostgreSQL ride creation failed, falling back to memory');
      } finally {
        if (client) client.release();
      }
    }

    const fallbackRide = {
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

    ridesStore.push(fallbackRide);
    res.status(201).json({
      success: true,
      message: 'Ride request created successfully.',
      source: 'InMemoryStore',
      data: fallbackRide,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    logger.error(err, 'Error creating ride');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// GET /api/v1/rides/:id - Get Single Ride Details
router.get('/:id', async (req, res) => {
  if (isDbConnected()) {
    try {
      const result = await query(
        `SELECT r.*, d.name as driver_name, d.phone as driver_phone, d.vehicle_model, d.license_plate, d.rating as driver_rating
         FROM rides r
         LEFT JOIN drivers d ON r.driver_id = d.id
         WHERE r.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
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
  res.json({ success: true, source: 'InMemoryStore', data: ride });
});

// POST /api/v1/rides/:id/cancel - Cancel Ride (Eligibility Checked)
router.post('/:id/cancel', async (req, res) => {
  const { reason } = cancelRideSchema.parse(req.body || {});

  // Pre-check eligibility
  if (isDbConnected()) {
    try {
      const checkRes = await query('SELECT status FROM rides WHERE id = $1', [req.params.id]);
      if (checkRes.rows.length > 0) {
        const currentStatus = checkRes.rows[0].status;
        if (!isCancellable(currentStatus)) {
          return res.status(400).json({
            success: false,
            error: 'CannotCancelRide',
            message: `Ride cannot be cancelled from current status '${currentStatus}'. Cancellation is permitted only from [REQUESTED, PENDING, DRIVER_ASSIGNED].`,
            status: currentStatus,
          });
        }
      }
    } catch (err) {
      logger.error(err, 'PostgreSQL cancel pre-check error');
    }
  }

  return executeTransition(res, req.params.id, RIDE_STATES.CANCELLED, { cancellation_reason: reason });
});

// POST /api/v1/rides/:id/assign - Assign Driver (Moves to DRIVER_ASSIGNED)
router.post('/:id/assign', (req, res) => {
  const { driver_id } = req.body;
  if (!driver_id) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'driver_id is required' });
  }
  return executeTransition(res, req.params.id, RIDE_STATES.DRIVER_ASSIGNED, { driver_id });
});

// POST /api/v1/rides/:id/accept - Driver Accepts Offer (Moves to DRIVER_ACCEPTED)
router.post('/:id/accept', (req, res) => {
  const { driver_id } = req.body;
  if (!driver_id) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'driver_id is required' });
  }
  return executeTransition(res, req.params.id, RIDE_STATES.DRIVER_ACCEPTED, { driver_id });
});

// POST /api/v1/rides/:id/reject - Driver Rejects Offer (Rolls back to PENDING)
router.post('/:id/reject', (req, res) => {
  return executeTransition(res, req.params.id, RIDE_STATES.PENDING, { driver_id: null }, 'RIDE_DRIVER_REJECTED');
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

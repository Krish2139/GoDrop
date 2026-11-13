import express from 'express';
import { z } from 'zod';
import { RIDE_STATES, isValidTransition } from '../stateMachine.js';
import { logger } from '../logger.js';
import { query, isDbConnected } from '../db.js';

const router = express.Router();

// Resilient In-Memory Store fallback
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
    fare_amount: 165.00,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  }
];

const createRideSchema = z.object({
  passenger_id: z.string().min(1, 'Passenger ID is required'),
  passenger_name: z.string().optional().default('Passenger'),
  pickup_address: z.string().min(2, 'Pickup address is required'),
  pickup_latitude: z.number().min(-90).max(90),
  pickup_longitude: z.number().min(-180).max(180),
  destination_address: z.string().min(2, 'Destination address is required'),
  destination_latitude: z.number().min(-90).max(90),
  destination_longitude: z.number().min(-180).max(180),
});

// Helper to transition ride status
async function transitionRide(res, rideId, targetState, additionalFields = {}) {
  let ride;

  if (isDbConnected()) {
    try {
      const selectRes = await query('SELECT * FROM rides WHERE id = $1 FOR UPDATE', [rideId]);
      if (selectRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
      }
      ride = selectRes.rows[0];

      if (!isValidTransition(ride.status, targetState)) {
        logger.warn({ rideId, from: ride.status, to: targetState }, 'Illegal state transition rejected by PostgreSQL');
        return res.status(400).json({
          success: false,
          error: 'InvalidStateTransition',
          message: `Cannot transition ride from '${ride.status}' to '${targetState}'.`,
        });
      }

      const driverId = additionalFields.driver_id !== undefined ? additionalFields.driver_id : ride.driver_id;
      const updateRes = await query(
        `UPDATE rides 
         SET status = $1, driver_id = $2, updated_at = NOW() 
         WHERE id = $3 
         RETURNING *`,
        [targetState, driverId, rideId]
      );

      // Record outbox event inside transactional flow
      await query(
        `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [
          `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          'RIDE',
          rideId,
          `RIDE_${targetState}`,
          JSON.stringify(updateRes.rows[0])
        ]
      );

      logger.info({ rideId, targetState }, 'Ride state updated in PostgreSQL');
      return res.json({
        success: true,
        message: `Ride successfully transitioned to ${targetState}`,
        data: updateRes.rows[0],
      });
    } catch (err) {
      logger.error(err, 'PostgreSQL error during ride transition');
    }
  }

  // Fallback to In-Memory store
  ride = ridesStore.find(r => r.id === rideId);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }

  if (!isValidTransition(ride.status, targetState)) {
    return res.status(400).json({
      success: false,
      error: 'InvalidStateTransition',
      message: `Cannot transition ride from '${ride.status}' to '${targetState}'.`,
    });
  }

  ride.status = targetState;
  ride.updated_at = new Date().toISOString();
  Object.assign(ride, additionalFields);

  return res.json({
    success: true,
    message: `Ride successfully transitioned to ${targetState}`,
    data: ride,
  });
}

// GET /api/v1/rides - List rides
router.get('/', async (req, res) => {
  const { status, passenger_id } = req.query;

  if (isDbConnected()) {
    try {
      let sql = 'SELECT * FROM rides WHERE 1=1';
      const params = [];

      if (status) {
        params.push(status);
        sql += ` AND status = $${params.length}`;
      }
      if (passenger_id) {
        params.push(passenger_id);
        sql += ` AND passenger_id = $${params.length}`;
      }
      sql += ' ORDER BY updated_at DESC LIMIT 50';

      const result = await query(sql, params);
      return res.json({
        success: true,
        total: result.rowCount,
        source: 'PostgreSQL',
        data: result.rows,
      });
    } catch (err) {
      logger.error(err, 'Error querying PostgreSQL rides, falling back to memory');
    }
  }

  let filtered = [...ridesStore];
  if (status) filtered = filtered.filter(r => r.status === status);
  if (passenger_id) filtered = filtered.filter(r => r.passenger_id === passenger_id);
  filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  res.json({
    success: true,
    total: filtered.length,
    source: 'InMemoryStore',
    data: filtered,
  });
});

// POST /api/v1/rides - Create a new ride request
router.post('/', async (req, res) => {
  try {
    const validated = createRideSchema.parse(req.body);
    const rideId = `ride-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fare = Number((100 + Math.random() * 200).toFixed(2));

    if (isDbConnected()) {
      try {
        const insertRes = await query(
          `INSERT INTO rides (
            id, passenger_id, status, pickup_address, pickup_latitude, pickup_longitude,
            destination_address, destination_latitude, destination_longitude, fare_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
            fare
          ]
        );

        // Transactional Outbox pattern: write event to outbox_events table
        await query(
          `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
          [
            `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            'RIDE',
            rideId,
            'RIDE_REQUESTED',
            JSON.stringify(insertRes.rows[0])
          ]
        );

        logger.info({ rideId }, 'New ride inserted into PostgreSQL with Outbox Event');
        return res.status(201).json({
          success: true,
          message: 'Ride request created successfully.',
          source: 'PostgreSQL',
          data: insertRes.rows[0],
        });
      } catch (err) {
        logger.error(err, 'Error inserting ride to PostgreSQL, falling back to memory');
      }
    }

    // In-Memory store fallback
    const newRide = {
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
      fare_amount: fare,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    ridesStore.push(newRide);
    res.status(201).json({
      success: true,
      message: 'Ride request created successfully.',
      source: 'InMemoryStore',
      data: newRide,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    logger.error(err, 'Error creating ride');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// GET /api/v1/rides/:id
router.get('/:id', async (req, res) => {
  if (isDbConnected()) {
    try {
      const result = await query('SELECT * FROM rides WHERE id = $1', [req.params.id]);
      if (result.rows.length > 0) {
        return res.json({ success: true, source: 'PostgreSQL', data: result.rows[0] });
      }
    } catch (err) {
      logger.error(err, 'PostgreSQL error fetching ride');
    }
  }

  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }
  res.json({ success: true, source: 'InMemoryStore', data: ride });
});

// State Transitions
router.post('/:id/cancel', (req, res) => transitionRide(res, req.params.id, RIDE_STATES.CANCELLED));
router.post('/:id/accept', (req, res) => {
  const { driver_id } = req.body;
  if (!driver_id) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'driver_id is required' });
  }
  return transitionRide(res, req.params.id, RIDE_STATES.DRIVER_ACCEPTED, { driver_id });
});
router.post('/:id/reject', (req, res) => transitionRide(res, req.params.id, RIDE_STATES.PENDING, { driver_id: null }));
router.post('/:id/arrived', (req, res) => transitionRide(res, req.params.id, RIDE_STATES.DRIVER_ARRIVED));
router.post('/:id/start', (req, res) => transitionRide(res, req.params.id, RIDE_STATES.IN_PROGRESS));
router.post('/:id/complete', (req, res) => transitionRide(res, req.params.id, RIDE_STATES.COMPLETED));

export default router;

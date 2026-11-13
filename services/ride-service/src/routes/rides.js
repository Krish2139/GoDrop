import express from 'express';
import { z } from 'zod';
import { RIDE_STATES, isValidTransition } from '../stateMachine.js';
import { logger } from '../logger.js';

const router = express.Router();

// In-Memory Data Store (will be migrated to PostgreSQL in Milestone 3)
export const ridesStore = [
  {
    id: 'ride-seed-1',
    passenger_id: 'pass-seed-1',
    passenger_name: 'John Doe',
    driver_id: 'driver-seed-1',
    status: RIDE_STATES.COMPLETED,
    pickup_address: 'Downtown Metro Station',
    pickup_latitude: 12.9716,
    pickup_longitude: 77.5946,
    destination_address: 'Tech Innovation Park',
    destination_latitude: 12.9352,
    destination_longitude: 77.6245,
    fare_amount: 240.50,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  }
];

// Zod Validation Schema for creating a ride
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
function transitionRide(res, ride, targetState, additionalFields = {}) {
  if (!isValidTransition(ride.status, targetState)) {
    logger.warn({ rideId: ride.id, from: ride.status, to: targetState }, 'Illegal state transition rejected');
    return res.status(400).json({
      success: false,
      error: 'InvalidStateTransition',
      message: `Cannot transition ride from status '${ride.status}' to '${targetState}'.`,
    });
  }

  const previousState = ride.status;
  ride.status = targetState;
  ride.updated_at = new Date().toISOString();
  Object.assign(ride, additionalFields);

  logger.info({ rideId: ride.id, previousState, newState: targetState }, 'Ride state transitioned');
  return res.json({
    success: true,
    message: `Ride successfully transitioned to ${targetState}`,
    data: ride,
  });
}

// GET /api/v1/rides - List rides (supports ?status= and ?passenger_id=)
router.get('/', (req, res) => {
  const { status, passenger_id } = req.query;
  let filtered = [...ridesStore];

  if (status) {
    filtered = filtered.filter(r => r.status === status);
  }
  if (passenger_id) {
    filtered = filtered.filter(r => r.passenger_id === passenger_id);
  }

  // Sort by updated_at descending
  filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  res.json({
    success: true,
    total: filtered.length,
    data: filtered,
  });
});

// POST /api/v1/rides - Create a new ride request
router.post('/', (req, res) => {
  try {
    const validated = createRideSchema.parse(req.body);

    const newRide = {
      id: `ride-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      fare_amount: Number((100 + Math.random() * 200).toFixed(2)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    ridesStore.push(newRide);
    logger.info({ rideId: newRide.id, passengerId: newRide.passenger_id }, 'New ride requested');

    res.status(201).json({
      success: true,
      message: 'Ride request created successfully.',
      data: newRide,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        details: err.errors,
      });
    }
    logger.error(err, 'Error creating ride request');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// GET /api/v1/rides/:id - Get ride details
router.get('/:id', (req, res) => {
  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({
      success: false,
      error: 'NotFound',
      message: `Ride with ID '${req.params.id}' was not found.`,
    });
  }
  res.json({ success: true, data: ride });
});

// POST /api/v1/rides/:id/cancel - Cancel ride
router.post('/:id/cancel', (req, res) => {
  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }
  return transitionRide(res, ride, RIDE_STATES.CANCELLED);
});

// POST /api/v1/rides/:id/accept - Driver accepts ride
router.post('/:id/accept', (req, res) => {
  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }
  const { driver_id } = req.body;
  if (!driver_id) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'driver_id is required' });
  }

  // If driver was not yet assigned, bind driver
  return transitionRide(res, ride, RIDE_STATES.DRIVER_ACCEPTED, { driver_id });
});

// POST /api/v1/rides/:id/reject - Driver rejects ride offer
router.post('/:id/reject', (req, res) => {
  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }
  // Transition back to PENDING so dispatch worker can reassign
  return transitionRide(res, ride, RIDE_STATES.PENDING, { driver_id: null });
});

// POST /api/v1/rides/:id/arrived - Driver arrived at pickup
router.post('/:id/arrived', (req, res) => {
  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }
  return transitionRide(res, ride, RIDE_STATES.DRIVER_ARRIVED);
});

// POST /api/v1/rides/:id/start - Trip starts
router.post('/:id/start', (req, res) => {
  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }
  return transitionRide(res, ride, RIDE_STATES.IN_PROGRESS);
});

// POST /api/v1/rides/:id/complete - Trip completes
router.post('/:id/complete', (req, res) => {
  const ride = ridesStore.find(r => r.id === req.params.id);
  if (!ride) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Ride not found' });
  }
  return transitionRide(res, ride, RIDE_STATES.COMPLETED);
});

export default router;

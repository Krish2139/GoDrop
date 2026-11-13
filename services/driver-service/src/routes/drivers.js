import express from 'express';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = express.Router();

export const DRIVER_STATUS = {
  AVAILABLE: 'AVAILABLE',
  OFFLINE: 'OFFLINE',
  RESERVED: 'RESERVED',
  ON_TRIP: 'ON_TRIP',
};

// Seed drivers for local simulation (will be replaced by PostgreSQL in Milestone 3)
export const driversStore = [
  {
    id: 'driver-seed-1',
    user_id: 'user-drv-1',
    name: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    vehicle_model: 'Toyota Prius (White)',
    license_plate: 'KA-01-AB-1234',
    rating: 4.85,
    status: DRIVER_STATUS.AVAILABLE,
    current_latitude: 12.9719,
    current_longitude: 77.5937,
    heading: 90,
    updated_at: new Date().toISOString(),
  },
  {
    id: 'driver-seed-2',
    user_id: 'user-drv-2',
    name: 'Priya Sharma',
    phone: '+91 98765 43211',
    vehicle_model: 'Hyundai Verna (Silver)',
    license_plate: 'KA-05-CD-5678',
    rating: 4.92,
    status: DRIVER_STATUS.AVAILABLE,
    current_latitude: 12.9780,
    current_longitude: 77.6010,
    heading: 180,
    updated_at: new Date().toISOString(),
  },
  {
    id: 'driver-seed-3',
    user_id: 'user-drv-3',
    name: 'Amit Verma',
    phone: '+91 98765 43212',
    vehicle_model: 'Honda City (Black)',
    license_plate: 'KA-03-EF-9012',
    rating: 4.70,
    status: DRIVER_STATUS.OFFLINE,
    current_latitude: 12.9350,
    current_longitude: 77.6240,
    heading: 0,
    updated_at: new Date().toISOString(),
  }
];

// In-memory offers queue for drivers
export const offersStore = [];

// Zod validation schemas
const registerDriverSchema = z.object({
  name: z.string().min(2, 'Driver name required'),
  phone: z.string().min(8, 'Valid phone required'),
  vehicle_model: z.string().min(2, 'Vehicle model required'),
  license_plate: z.string().min(2, 'License plate required'),
  latitude: z.number().min(-90).max(90).optional().default(12.9716),
  longitude: z.number().min(-180).max(180).optional().default(77.5946),
});

const availabilitySchema = z.object({
  status: z.enum([DRIVER_STATUS.AVAILABLE, DRIVER_STATUS.OFFLINE]),
});

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional().default(0),
});

// Haversine formula calculation for approximate distance in kilometers
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// GET /api/v1/drivers - List drivers (supports ?status=)
router.get('/', (req, res) => {
  const { status } = req.query;
  let result = [...driversStore];
  if (status) {
    result = result.filter(d => d.status === status);
  }
  res.json({
    success: true,
    total: result.length,
    data: result,
  });
});

// GET /api/v1/drivers/nearby - Retrieve eligible nearby drivers (used by dispatch worker)
router.get('/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const maxDistanceKm = parseFloat(req.query.radiusKm) || 10;

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({
      success: false,
      error: 'ValidationError',
      message: 'Query parameters lat and lng must be valid numbers.',
    });
  }

  // Filter only AVAILABLE drivers
  const eligible = driversStore.filter(d => d.status === DRIVER_STATUS.AVAILABLE);

  // Compute distance and sort by proximity
  const ranked = eligible
    .map(driver => {
      const distanceKm = calculateHaversineDistance(
        lat,
        lng,
        driver.current_latitude,
        driver.current_longitude
      );
      return {
        ...driver,
        distance_km: distanceKm,
        estimated_eta_mins: Math.max(1, Math.round(distanceKm * 3)),
      };
    })
    .filter(d => d.distance_km <= maxDistanceKm)
    .sort((a, b) => a.distance_km - b.distance_km);

  logger.info({ pickup: { lat, lng }, candidatesFound: ranked.length }, 'Nearby eligible drivers calculated');

  res.json({
    success: true,
    count: ranked.length,
    data: ranked,
  });
});

// POST /api/v1/drivers - Register a new driver
router.post('/', (req, res) => {
  try {
    const validated = registerDriverSchema.parse(req.body);

    const newDriver = {
      id: `driver-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: `user-${Date.now()}`,
      name: validated.name,
      phone: validated.phone,
      vehicle_model: validated.vehicle_model,
      license_plate: validated.license_plate,
      rating: 5.0,
      status: DRIVER_STATUS.AVAILABLE,
      current_latitude: validated.latitude,
      current_longitude: validated.longitude,
      heading: 0,
      updated_at: new Date().toISOString(),
    };

    driversStore.push(newDriver);
    logger.info({ driverId: newDriver.id, name: newDriver.name }, 'New driver registered');

    res.status(201).json({
      success: true,
      message: 'Driver profile registered successfully',
      data: newDriver,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    logger.error(err, 'Error registering driver');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// GET /api/v1/drivers/:id - Get driver profile
router.get('/:id', (req, res) => {
  const driver = driversStore.find(d => d.id === req.params.id);
  if (!driver) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Driver not found' });
  }
  res.json({ success: true, data: driver });
});

// PATCH /api/v1/drivers/:id/availability - Toggle Online/Offline
router.patch('/:id/availability', (req, res) => {
  try {
    const driver = driversStore.find(d => d.id === req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'NotFound', message: 'Driver not found' });
    }

    const { status } = availabilitySchema.parse(req.body);
    const prevStatus = driver.status;
    driver.status = status;
    driver.updated_at = new Date().toISOString();

    logger.info({ driverId: driver.id, prevStatus, newStatus: status }, 'Driver availability updated');

    res.json({
      success: true,
      message: `Driver status updated to ${status}`,
      data: driver,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// PATCH /api/v1/drivers/:id/location - Update simulated GPS coordinates
router.patch('/:id/location', (req, res) => {
  try {
    const driver = driversStore.find(d => d.id === req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'NotFound', message: 'Driver not found' });
    }

    const { latitude, longitude, heading } = locationSchema.parse(req.body);
    driver.current_latitude = latitude;
    driver.current_longitude = longitude;
    if (heading !== undefined) driver.heading = heading;
    driver.updated_at = new Date().toISOString();

    res.json({
      success: true,
      message: 'Driver GPS location updated',
      data: {
        id: driver.id,
        latitude: driver.current_latitude,
        longitude: driver.current_longitude,
        heading: driver.heading,
        updated_at: driver.updated_at,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// GET /api/v1/drivers/:id/offers - View pending ride offers
router.get('/:id/offers', (req, res) => {
  const driverOffers = offersStore.filter(o => o.driver_id === req.params.id && o.status === 'PENDING');
  res.json({
    success: true,
    total: driverOffers.length,
    data: driverOffers,
  });
});

export default router;

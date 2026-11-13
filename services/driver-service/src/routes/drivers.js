import express from 'express';
import { z } from 'zod';
import { logger } from '../logger.js';
import { query, isDbConnected } from '../db.js';
import { 
  getCache, 
  setCache, 
  invalidateKey, 
  invalidatePattern, 
  driverCacheMetrics,
  isRedisConnected 
} from '../redis.js';

const router = express.Router();

export const DRIVER_STATUS = {
  AVAILABLE: 'AVAILABLE',
  OFFLINE: 'OFFLINE',
  RESERVED: 'RESERVED',
  ON_TRIP: 'ON_TRIP',
};

// Resilient In-Memory fallback store (Ahmedabad, Gujarat)
export const driversStore = [
  {
    id: 'driver-seed-1',
    user_id: 'user-drv-1',
    name: 'Rajesh Prajapati',
    phone: '+91 98980 11223',
    vehicle_model: 'Toyota Prius (White)',
    license_plate: 'GJ-01-AB-1234',
    rating: 4.85,
    status: DRIVER_STATUS.AVAILABLE,
    current_latitude: 23.0275,
    current_longitude: 72.5076,
    heading: 90,
    updated_at: new Date().toISOString(),
  },
  {
    id: 'driver-seed-2',
    user_id: 'user-drv-2',
    name: 'Priya Desai',
    phone: '+91 98980 44556',
    vehicle_model: 'Hyundai Verna (Silver)',
    license_plate: 'GJ-01-CD-5678',
    rating: 4.92,
    status: DRIVER_STATUS.AVAILABLE,
    current_latitude: 23.0373,
    current_longitude: 72.5303,
    heading: 180,
    updated_at: new Date().toISOString(),
  },
  {
    id: 'driver-seed-3',
    user_id: 'user-drv-3',
    name: 'Amit Mehta',
    phone: '+91 98980 77889',
    vehicle_model: 'Honda City (Black)',
    license_plate: 'GJ-01-EF-9012',
    rating: 4.70,
    status: DRIVER_STATUS.OFFLINE,
    current_latitude: 23.0372,
    current_longitude: 72.5613,
    heading: 0,
    updated_at: new Date().toISOString(),
  }
];

export const offersStore = [];

const registerDriverSchema = z.object({
  name: z.string().min(2, 'Driver name required'),
  phone: z.string().min(8, 'Valid phone required'),
  vehicle_model: z.string().min(2, 'Vehicle model required'),
  license_plate: z.string().min(2, 'License plate required'),
  latitude: z.number().min(-90).max(90).optional().default(23.0275),
  longitude: z.number().min(-180).max(180).optional().default(72.5076),
});

const availabilitySchema = z.object({
  status: z.enum([DRIVER_STATUS.AVAILABLE, DRIVER_STATUS.OFFLINE]),
});

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional().default(0),
});

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// Invalidate driver related caches
async function invalidateDriverCaches(driverId) {
  await Promise.all([
    invalidateKey(`cache:drivers:profile:${driverId}`),
    invalidatePattern('cache:drivers:list:*'),
    invalidatePattern('cache:drivers:nearby:*'),
  ]);
}

// GET /api/v1/drivers/cache/metrics - Telemetry
router.get('/cache/metrics', (req, res) => {
  res.json({
    success: true,
    redisConnected: isRedisConnected(),
    metrics: {
      hits: driverCacheMetrics.hits,
      misses: driverCacheMetrics.misses,
      hitRate: driverCacheMetrics.hitRate,
      invalidations: driverCacheMetrics.invalidations,
    },
  });
});

// GET /api/v1/drivers - List drivers (Cached with TTL 45s)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const cacheKey = `cache:drivers:list:${status || 'all'}`;

  // 1. Check Redis Cache
  const cachedData = await getCache(cacheKey);
  if (cachedData) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({
      success: true,
      total: cachedData.length,
      source: 'Redis-Cache',
      data: cachedData,
    });
  }

  res.setHeader('X-Cache', 'MISS');

  // 2. Cache Miss: Fetch from PostgreSQL / Memory
  if (isDbConnected()) {
    try {
      let sql = 'SELECT * FROM drivers';
      const params = [];
      if (status) {
        params.push(status);
        sql += ' WHERE status = $1';
      }
      sql += ' ORDER BY updated_at DESC';

      const result = await query(sql, params);
      await setCache(cacheKey, result.rows, 45);

      return res.json({
        success: true,
        total: result.rowCount,
        source: 'PostgreSQL',
        data: result.rows,
      });
    } catch (err) {
      logger.error(err, 'PostgreSQL error querying drivers');
    }
  }

  let result = [...driversStore];
  if (status) result = result.filter(d => d.status === status);
  await setCache(cacheKey, result, 45);

  res.json({
    success: true,
    total: result.length,
    source: 'InMemoryStore',
    data: result,
  });
});

// GET /api/v1/drivers/nearby - Retrieve eligible nearby drivers (Cached with TTL 15s)
router.get('/nearby', async (req, res) => {
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

  const cacheKey = `cache:drivers:nearby:${lat.toFixed(3)}:${lng.toFixed(3)}:${maxDistanceKm}`;

  // 1. Check Redis Cache
  const cachedNearby = await getCache(cacheKey);
  if (cachedNearby) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({
      success: true,
      count: cachedNearby.length,
      source: 'Redis-Cache',
      data: cachedNearby,
    });
  }

  res.setHeader('X-Cache', 'MISS');

  // 2. Cache Miss: Query & Compute
  let candidates = [];
  let source = 'InMemoryStore';

  if (isDbConnected()) {
    try {
      const dbRes = await query('SELECT * FROM drivers WHERE status = $1', [DRIVER_STATUS.AVAILABLE]);
      candidates = dbRes.rows;
      source = 'PostgreSQL';
    } catch (err) {
      logger.error(err, 'PostgreSQL error querying nearby drivers');
      candidates = driversStore.filter(d => d.status === DRIVER_STATUS.AVAILABLE);
    }
  } else {
    candidates = driversStore.filter(d => d.status === DRIVER_STATUS.AVAILABLE);
  }

  const ranked = candidates
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

  logger.info({ pickup: { lat, lng }, candidatesFound: ranked.length, source }, 'Nearby drivers ranked');

  // Cache nearby result for 15s
  await setCache(cacheKey, ranked, 15);

  res.json({
    success: true,
    count: ranked.length,
    source,
    data: ranked,
  });
});

// POST /api/v1/drivers - Register a new driver
router.post('/', async (req, res) => {
  try {
    const validated = registerDriverSchema.parse(req.body);
    const driverId = `driver-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const userId = `user-${Date.now()}`;

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO users (id, email, password_hash, role, name, phone)
           VALUES ($1, $2, $3, 'DRIVER', $4, $5)
           ON CONFLICT DO NOTHING`,
          [userId, `${driverId}@rideflow.io`, 'driver123', validated.name, validated.phone]
        );

        const insertRes = await query(
          `INSERT INTO drivers (
            id, user_id, vehicle_model, license_plate, rating, status, current_latitude, current_longitude, heading
          ) VALUES ($1, $2, $3, $4, 5.0, $5, $6, $7, 0)
          RETURNING *`,
          [
            driverId,
            userId,
            validated.vehicle_model,
            validated.license_plate,
            DRIVER_STATUS.AVAILABLE,
            validated.latitude,
            validated.longitude,
          ]
        );

        await invalidateDriverCaches(driverId);
        logger.info({ driverId }, 'Driver registered in PostgreSQL');

        return res.status(201).json({
          success: true,
          message: 'Driver profile registered successfully',
          source: 'PostgreSQL',
          data: insertRes.rows[0],
        });
      } catch (err) {
        logger.error(err, 'PostgreSQL error creating driver');
      }
    }

    const newDriver = {
      id: driverId,
      user_id: userId,
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
    await invalidateDriverCaches(driverId);

    res.status(201).json({
      success: true,
      message: 'Driver profile registered successfully',
      source: 'InMemoryStore',
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

// GET /api/v1/drivers/profile - Current driver profile
router.get('/profile', async (req, res) => {
  const userId = req.query.user_id;

  if (isDbConnected()) {
    try {
      let result;
      if (userId) {
        result = await query('SELECT * FROM drivers WHERE user_id = $1 LIMIT 1', [userId]);
      } else {
        result = await query('SELECT * FROM drivers ORDER BY created_at ASC LIMIT 1');
      }

      if (result.rows.length > 0) {
        return res.json({ success: true, source: 'PostgreSQL', data: result.rows[0] });
      }
    } catch (err) {
      logger.error(err, 'PostgreSQL error fetching driver profile');
    }
  }

  const driver = userId ? driversStore.find(d => d.user_id === userId) || driversStore[0] : driversStore[0];
  res.json({ success: true, source: 'InMemoryStore', data: driver });
});

// GET /api/v1/drivers/:id - Single Driver Profile (Cached with TTL 120s)
router.get('/:id', async (req, res) => {
  const cacheKey = `cache:drivers:profile:${req.params.id}`;

  // 1. Check Redis Cache
  const cachedDriver = await getCache(cacheKey);
  if (cachedDriver) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ success: true, source: 'Redis-Cache', data: cachedDriver });
  }

  res.setHeader('X-Cache', 'MISS');

  // 2. Fetch from DB
  if (isDbConnected()) {
    try {
      const resDb = await query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
      if (resDb.rows.length > 0) {
        await setCache(cacheKey, resDb.rows[0], 120);
        return res.json({ success: true, source: 'PostgreSQL', data: resDb.rows[0] });
      }
    } catch (err) {
      logger.error(err, 'PostgreSQL error fetching driver');
    }
  }

  const driver = driversStore.find(d => d.id === req.params.id);
  if (!driver) {
    return res.status(404).json({ success: false, error: 'NotFound', message: 'Driver not found' });
  }
  await setCache(cacheKey, driver, 120);
  res.json({ success: true, source: 'InMemoryStore', data: driver });
});

// PATCH /api/v1/drivers/:id/availability - Updates availability & invalidates cache
router.patch('/:id/availability', async (req, res) => {
  try {
    const { status } = availabilitySchema.parse(req.body);

    if (isDbConnected()) {
      try {
        const updateRes = await query(
          'UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [status, req.params.id]
        );
        if (updateRes.rows.length > 0) {
          // Invalidate driver cache
          await invalidateDriverCaches(req.params.id);
          return res.json({
            success: true,
            message: `Driver status updated to ${status}`,
            source: 'PostgreSQL',
            data: updateRes.rows[0],
          });
        }
      } catch (err) {
        logger.error(err, 'PostgreSQL error updating driver availability');
      }
    }

    const driver = driversStore.find(d => d.id === req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'NotFound', message: 'Driver not found' });
    }
    driver.status = status;
    driver.updated_at = new Date().toISOString();
    await invalidateDriverCaches(req.params.id);

    res.json({
      success: true,
      message: `Driver status updated to ${status}`,
      source: 'InMemoryStore',
      data: driver,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// PATCH /api/v1/drivers/:id/location - Updates GPS & invalidates proximity cache
router.patch('/:id/location', async (req, res) => {
  try {
    const { latitude, longitude, heading } = locationSchema.parse(req.body);

    if (isDbConnected()) {
      try {
        const updateRes = await query(
          `UPDATE drivers 
           SET current_latitude = $1, current_longitude = $2, heading = COALESCE($3, heading), updated_at = NOW()
           WHERE id = $4 
           RETURNING id, current_latitude, current_longitude, heading, updated_at`,
          [latitude, longitude, heading, req.params.id]
        );
        if (updateRes.rows.length > 0) {
          await invalidateDriverCaches(req.params.id);
          return res.json({
            success: true,
            message: 'Driver GPS location updated',
            source: 'PostgreSQL',
            data: updateRes.rows[0],
          });
        }
      } catch (err) {
        logger.error(err, 'PostgreSQL error updating driver location');
      }
    }

    const driver = driversStore.find(d => d.id === req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'NotFound', message: 'Driver not found' });
    }
    driver.current_latitude = latitude;
    driver.current_longitude = longitude;
    if (heading !== undefined) driver.heading = heading;
    driver.updated_at = new Date().toISOString();
    await invalidateDriverCaches(req.params.id);

    res.json({
      success: true,
      message: 'Driver GPS location updated',
      source: 'InMemoryStore',
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

// GET /api/v1/drivers/:id/offers
router.get('/:id/offers', async (req, res) => {
  if (isDbConnected()) {
    try {
      const result = await query(
        `SELECT a.*, 
                r.pickup_address, 
                r.destination_address, 
                r.fare_amount,
                u.name as passenger_name,
                ROUND(EXTRACT(EPOCH FROM (a.expires_at - NOW()))) as remaining_seconds
         FROM ride_assignments a
         JOIN rides r ON a.ride_id = r.id
         LEFT JOIN passengers p ON r.passenger_id = p.id
         LEFT JOIN users u ON p.user_id = u.id
         WHERE a.driver_id = $1 AND a.status = 'OFFERED' AND a.expires_at > NOW()
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
      logger.error(err, 'PostgreSQL error fetching offers');
    }
  }

  const driverOffers = offersStore.filter(o => o.driver_id === req.params.id && o.status === 'PENDING');
  res.json({
    success: true,
    total: driverOffers.length,
    source: 'InMemoryStore',
    data: driverOffers,
  });
});

export default router;

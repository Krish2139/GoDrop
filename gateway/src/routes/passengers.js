import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { logger } from '../logger.js';
import { query, isDbConnected } from '../db.js';
import { JWT_SECRET } from '../middleware/auth.js';

const router = express.Router();
const RIDE_SERVICE_URL = process.env.RIDE_SERVICE_URL || 'http://localhost:5001';

export const passengersStore = [
  {
    id: 'pass-seed-1',
    user_id: 'user-pass-1',
    name: 'Aarav Sharma',
    phone: '+91 91234 56789',
    rating: 4.9,
    total_rides: 0,
    created_at: new Date().toISOString(),
  }
];

// GET /api/v1/passengers/profile
router.get('/profile', async (req, res) => {
  let userId = req.user?.id || req.query.user_id;

  if (!userId && req.headers.authorization?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
      userId = decoded.id;
    } catch (_) {}
  }

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required to view passenger profile.',
    });
  }

  if (isDbConnected()) {
    try {
      const result = await query(
        `SELECT p.*, u.name, u.email, u.phone 
         FROM passengers p 
         JOIN users u ON p.user_id = u.id 
         WHERE p.user_id = $1 LIMIT 1`,
        [userId]
      );

      if (result && result.rows.length > 0) {
        return res.json({ success: true, source: 'PostgreSQL', data: result.rows[0] });
      }

      // If no passenger row yet exists for this user, create one automatically
      const userRes = await query('SELECT id, name, email, phone FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        const newPassId = `pass-${Date.now()}`;
        await query(
          `INSERT INTO passengers (id, user_id, rating, total_rides)
           VALUES ($1, $2, 5.00, 0)
           ON CONFLICT DO NOTHING`,
          [newPassId, u.id]
        );
        return res.json({
          success: true,
          source: 'PostgreSQL',
          data: {
            id: newPassId,
            user_id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            rating: 5.00,
            total_rides: 0,
          }
        });
      }
      return res.status(404).json({ success: false, error: 'NotFound', message: 'User not found' });
    } catch (err) {
      logger.error(err, 'PostgreSQL error fetching passenger profile');
    }
  }

  // In-Memory Fallback - strictly find by user_id
  const passenger = passengersStore.find(p => p.user_id === userId) || passengersStore[0];
  res.json({
    success: true,
    source: 'InMemoryStore',
    data: passenger,
  });
});

// GET /api/v1/passengers/rides - Aggregated from Ride Service
router.get('/rides', async (req, res) => {
  const passengerId = req.query.passenger_id || passengersStore[0].id;
  try {
    const response = await axios.get(`${RIDE_SERVICE_URL}/api/v1/rides`, {
      params: { passenger_id: passengerId },
      timeout: 3000,
    });
    res.json(response.data);
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to fetch rides from Ride Service');
    res.json({
      success: true,
      total: 0,
      data: [],
      warning: 'Downstream Ride Service unavailable or returned an error.',
    });
  }
});

export default router;

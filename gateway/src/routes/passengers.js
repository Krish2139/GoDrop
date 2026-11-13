import express from 'express';
import axios from 'axios';
import { logger } from '../logger.js';

const router = express.Router();
const RIDE_SERVICE_URL = process.env.RIDE_SERVICE_URL || 'http://localhost:5001';

// Seed passengers
export const passengersStore = [
  {
    id: 'pass-seed-1',
    user_id: 'user-pass-1',
    name: 'Aarav Sharma',
    phone: '+91 91234 56789',
    rating: 4.9,
    total_rides: 14,
    created_at: new Date().toISOString(),
  }
];

// GET /api/v1/passengers/profile
router.get('/profile', (req, res) => {
  const passenger = passengersStore[0];
  res.json({
    success: true,
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

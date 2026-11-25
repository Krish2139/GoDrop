import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { logger } from '../logger.js';
import { authenticateJwt } from '../middleware/auth.js';
import { query, isDbConnected, pool } from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_rideflow_academic_system_design_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Pre-hashed passwords using bcryptjs (salt rounds = 10)
// Passwords:
// admin@rideflow.io -> admin123
// passenger@rideflow.io -> pass123
// driver@rideflow.io -> driver123
const ADMIN_HASH = bcrypt.hashSync('admin123', 10);
const PASS_HASH = bcrypt.hashSync('pass123', 10);
const DRV_HASH = bcrypt.hashSync('driver123', 10);

export const usersStore = [
  {
    id: 'user-admin-1',
    email: 'admin@rideflow.io',
    name: 'System Administrator',
    role: 'ADMIN',
    password_hash: ADMIN_HASH,
    created_at: new Date().toISOString(),
  },
  {
    id: 'user-pass-1',
    email: 'passenger@rideflow.io',
    name: 'Aarav Patel',
    role: 'PASSENGER',
    password_hash: PASS_HASH,
    created_at: new Date().toISOString(),
  },
  {
    id: 'user-drv-1',
    email: 'driver@rideflow.io',
    name: 'Rajesh Kumar',
    role: 'DRIVER',
    password_hash: DRV_HASH,
    created_at: new Date().toISOString(),
  },
];

const registerSchema = z.object({
  email: z.string().email('Valid email address required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional().default('+91 90000 00000'),
  role: z.enum(['PASSENGER', 'DRIVER', 'ADMIN']).default('PASSENGER'),
  vehicle_model: z.string().optional(),
  license_plate: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Valid email address required'),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const validated = registerSchema.parse(req.body);
    const normalizedEmail = validated.email.toLowerCase().trim();

    // Check if user already exists
    if (isDbConnected()) {
      try {
        const checkRes = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (checkRes.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'ConflictError',
            message: 'A user with this email address already exists.',
          });
        }
      } catch (err) {
        logger.error(err, 'PostgreSQL check user error');
      }
    }

    const memoryExisting = usersStore.find(u => u.email.toLowerCase() === normalizedEmail);
    if (memoryExisting) {
      return res.status(409).json({
        success: false,
        error: 'ConflictError',
        message: 'A user with this email address already exists.',
      });
    }

    // Hash password with bcrypt
    const password_hash = await bcrypt.hash(validated.password, 10);
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const newUser = {
      id: userId,
      email: normalizedEmail,
      name: validated.name,
      role: validated.role,
      phone: validated.phone,
      password_hash,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isDbConnected()) {
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO users (id, email, password_hash, role, name, phone)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newUser.id, newUser.email, newUser.password_hash, newUser.role, newUser.name, newUser.phone]
        );

        if (newUser.role === 'PASSENGER') {
          await client.query(
            `INSERT INTO passengers (id, user_id, rating, total_rides)
             VALUES ($1, $2, 5.00, 0)`,
            [`pass-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, newUser.id]
          );
        } else if (newUser.role === 'DRIVER') {
          const vehicleModel = validated.vehicle_model || 'Hyundai Grand i10 (White)';
          let licensePlate = (validated.license_plate || '').trim() || `GJ-01-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(1000 + Math.random() * 9000)}`;
          const lat = validated.latitude || 23.0275;
          const lng = validated.longitude || 72.5076;

          // Ensure license plate uniqueness cleanly before insert
          const plateCheck = await client.query('SELECT id FROM drivers WHERE license_plate = $1', [licensePlate]);
          if (plateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              error: 'ConflictError',
              message: `Vehicle license plate '${licensePlate}' is already registered. Please enter a unique license plate.`,
            });
          }

          await client.query(
            `INSERT INTO drivers (id, user_id, vehicle_model, license_plate, rating, status, current_latitude, current_longitude, approval_status)
             VALUES ($1, $2, $3, $4, 5.00, 'OFFLINE', $5, $6, 'PENDING')`,
            [`driver-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, newUser.id, vehicleModel, licensePlate, lat, lng]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        logger.error(err, 'PostgreSQL insert user error');
        if (err.code === '23505') {
          return res.status(409).json({
            success: false,
            error: 'ConflictError',
            message: 'Account email or license plate already exists.',
          });
        }
        return res.status(500).json({
          success: false,
          error: 'DatabaseError',
          message: 'Failed to create account in database. Please try again.',
        });
      } finally {
        if (client) client.release();
      }
    }

    usersStore.push(newUser);

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, name: newUser.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info({ userId: newUser.id, email: newUser.email, role: newUser.role }, 'User registered with bcrypt hash');

    res.status(201).json({
      success: true,
      message: newUser.role === 'DRIVER'
        ? 'Driver application submitted! Your profile is pending administrator verification.'
        : 'Account registered successfully.',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        approval_status: newUser.role === 'DRIVER' ? 'PENDING' : 'APPROVED',
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    logger.error(err, 'Registration error');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    let user;

    if (isDbConnected()) {
      try {
        const result = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
        if (result.rows.length > 0) {
          user = result.rows[0];
        }
      } catch (err) {
        logger.error(err, 'PostgreSQL user lookup error');
      }
    }

    if (!user) {
      user = usersStore.find(u => u.email.toLowerCase() === normalizedEmail);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email or password credentials.',
      });
    }

    // Verify password with bcryptjs
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      logger.warn({ email: normalizedEmail }, 'Failed login: incorrect password');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email or password credentials.',
      });
    }

    // For DRIVER logins, ensure active driver profile exists and is not suspended
    if (user.role === 'DRIVER' && isDbConnected()) {
      const drvRes = await query('SELECT id, status FROM drivers WHERE user_id = $1 LIMIT 1', [user.id]);
      if (drvRes.rows.length === 0 || drvRes.rows[0].status === 'SUSPENDED_SOS') {
        logger.warn({ userId: user.id, email: normalizedEmail }, 'Driver login rejected: missing or suspended driver profile');
        return res.status(401).json({
          success: false,
          error: 'AccountRemoved',
          accountSuspended: true,
          message: 'Your driver account has been suspended or is not active.',
        });
      }
    }

    // Issue signed JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info({ userId: user.id, email: user.email, role: user.role }, 'Successful user login');

    res.json({
      success: true,
      message: 'Authentication successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'ValidationError', details: err.errors });
    }
    logger.error(err, 'Login error');
    res.status(500).json({ success: false, error: 'InternalServerError' });
  }
});

// GET /api/v1/auth/me - Protected by authenticateJwt
router.get('/me', authenticateJwt, (req, res) => {
  res.json({
    success: true,
    message: 'User authentication verified.',
    user: req.user,
  });
});

export default router;

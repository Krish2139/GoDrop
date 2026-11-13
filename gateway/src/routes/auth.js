import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_rideflow_academic_system_design_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Pre-seeded users (will be managed in PostgreSQL in Milestone 3 & 4)
export const usersStore = [
  {
    id: 'user-admin-1',
    email: 'admin@rideflow.io',
    name: 'System Administrator',
    role: 'ADMIN',
    password_hash: 'admin123', // Demo plain for initial verification
    created_at: new Date().toISOString(),
  },
  {
    id: 'user-pass-1',
    email: 'passenger@rideflow.io',
    name: 'Aarav Sharma',
    role: 'PASSENGER',
    password_hash: 'pass123',
    created_at: new Date().toISOString(),
  },
  {
    id: 'user-drv-1',
    email: 'driver@rideflow.io',
    name: 'Rajesh Kumar',
    role: 'DRIVER',
    password_hash: 'driver123',
    created_at: new Date().toISOString(),
  },
];

// Zod schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name is required'),
  role: z.enum(['PASSENGER', 'DRIVER', 'ADMIN']).default('PASSENGER'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/v1/auth/register
router.post('/register', (req, res) => {
  try {
    const validated = registerSchema.parse(req.body);

    const existing = usersStore.find(u => u.email === validated.email);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'ConflictError',
        message: 'A user with this email address already exists.',
      });
    }

    const newUser = {
      id: `user-${Date.now()}`,
      email: validated.email,
      name: validated.name,
      role: validated.role,
      password_hash: validated.password,
      created_at: new Date().toISOString(),
    };

    usersStore.push(newUser);

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, name: newUser.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info({ userId: newUser.id, role: newUser.role }, 'User registered');

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
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
router.post('/login', (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = usersStore.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password_hash !== password) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email or password credentials.',
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info({ userId: user.id, email: user.email }, 'User logged in');

    res.json({
      success: true,
      message: 'Login successful',
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

// GET /api/v1/auth/me
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authorization Bearer token required.',
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({
      success: true,
      user: decoded,
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      error: 'InvalidToken',
      message: 'Token expired or invalid.',
    });
  }
});

export default router;


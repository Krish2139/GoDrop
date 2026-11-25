import jwt from 'jsonwebtoken';
import { logger } from '../logger.js';
import { query, isDbConnected } from '../db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_rideflow_academic_system_design_2026';

/**
 * Verifies that the authenticated user (and driver profile if DRIVER) still exists in PostgreSQL
 * and has not been suspended or removed.
 */
export async function verifyAccountActive(decodedUser) {
  if (!isDbConnected() || !decodedUser?.id) {
    return { active: true };
  }

  // Built-in fallback admin account (admin@rideflow.io) has no UI registration path
  // and must remain active even after clearing all database records.
  if (decodedUser.role === 'ADMIN' && decodedUser.id === 'user-admin-1') {
    return { active: true };
  }

  try {
    const userRes = await query('SELECT id, role FROM users WHERE id = $1 LIMIT 1', [decodedUser.id]);
    if (userRes.rows.length === 0) {
      return {
        active: false,
        reason: 'Your account has been suspended and removed from the system.',
      };
    }

    if (decodedUser.role === 'DRIVER') {
      const drvRes = await query('SELECT id, status FROM drivers WHERE user_id = $1 LIMIT 1', [decodedUser.id]);
      if (drvRes.rows.length === 0 || drvRes.rows[0].status === 'SUSPENDED_SOS') {
        return {
          active: false,
          reason: 'Your driver account has been suspended and removed from the system.',
        };
      }
    }

    return { active: true };
  } catch (err) {
    logger.warn({ error: err.message }, 'Account liveness verification failed');
    return { active: true };
  }
}

/**
 * Middleware: Verifies JWT in Authorization header.
 * Attaches decoded payload to req.user
 */
export async function authenticateJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Access denied. Missing or malformed Bearer authorization token.',
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const check = await verifyAccountActive(decoded);
    if (!check.active) {
      logger.warn({ userId: decoded.id, role: decoded.role, path: req.path }, 'Rejected JWT for deleted/suspended account');
      return res.status(401).json({
        success: false,
        error: 'AccountRemoved',
        accountSuspended: true,
        message: check.reason,
      });
    }
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn({ error: err.message, path: req.path }, 'JWT authentication failed');
    return res.status(401).json({
      success: false,
      error: 'InvalidToken',
      message: 'Token has expired or is invalid. Please log in again.',
    });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware factory.
 * @param  {...string} allowedRoles Roles permitted to access the route
 */
export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required before checking permissions.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        { userId: req.user.id, userRole: req.user.role, allowedRoles, path: req.path },
        'Access forbidden: insufficient role permissions'
      );

      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Forbidden: User role '${req.user.role}' does not have permission to access this resource. Allowed roles: [${allowedRoles.join(', ')}].`,
      });
    }

    next();
  };
}


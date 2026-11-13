import jwt from 'jsonwebtoken';
import { logger } from '../logger.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_rideflow_academic_system_design_2026';

/**
 * Middleware: Verifies JWT in Authorization header.
 * Attaches decoded payload to req.user
 */
export function authenticateJwt(req, res, next) {
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


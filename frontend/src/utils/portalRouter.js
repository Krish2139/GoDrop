/**
 * Official Port Configuration:
 * Home Page: 3000
 * Driver Terminal: 3001
 * Administrator Console: 3002
 * Passenger Portal: 3003
 */
export const PORT_MAP = {
  HOME: '3000',
  OVERVIEW: '3000',
  DRIVER: '3001',
  ADMIN: '3002',
  PASSENGER: '3003',
};

export const ROLE_DEFAULT_PATHS = {
  HOME: '/',
  OVERVIEW: '/',
  DRIVER: '/driver',
  ADMIN: '/admin',
  PASSENGER: '/passenger',
};

/**
 * Get the target port for a given role or portal type
 */
export const getTargetPort = (role) => {
  const normalized = (role || '').toUpperCase();
  return PORT_MAP[normalized] || '3000';
};

/**
 * Get the full or relative URL for a specific role and path.
 * If already on the correct port, returns relative path (enabling SPA navigation).
 * Otherwise returns fully-qualified URL with the official port.
 */
export const getPortalUrl = (role, path = '') => {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const currentPort = window.location.port;

  const normalized = (role || '').toUpperCase();
  const targetPort = PORT_MAP[normalized] || '3000';
  const defaultPath = ROLE_DEFAULT_PATHS[normalized] || '/';
  const targetPath = path || defaultPath;

  // If already running on the target port (or in a production proxy with no port), use relative path
  if (currentPort === targetPort || !currentPort) {
    return targetPath;
  }

  return `${protocol}//${hostname}:${targetPort}${targetPath}`;
};

/**
 * Navigate to the target portal.
 * If cross-port, uses window.location.href (or window.location.replace if replace=true).
 * If on the same port, uses the provided navigate() function.
 */
export const navigateToPortal = (role, path = '', navigate = null, replace = false) => {
  const targetUrl = getPortalUrl(role, path);
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    if (replace) {
      window.location.replace(targetUrl);
    } else {
      window.location.href = targetUrl;
    }
  } else if (typeof navigate === 'function') {
    navigate(targetUrl, { replace });
  } else {
    if (replace) {
      window.location.replace(targetUrl);
    } else {
      window.location.href = targetUrl;
    }
  }
};

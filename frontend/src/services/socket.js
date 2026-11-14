import { io } from 'socket.io-client';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:5000';

let socket = null;

/**
 * Get or initialize active Socket.IO connection
 */
export function getSocket(token) {
  const authToken = token || localStorage.getItem('rideflow_token') || localStorage.getItem('token');

  if (!socket && authToken) {
    socket = io(GATEWAY_URL, {
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('⚡ Connected to RideFlow Real-time Gateway via Socket.IO:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️ Socket.IO Connection Error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from Socket.IO:', reason);
    });
  }

  return socket;
}

/**
 * Disconnect and clear socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Join specific Ride channel
 */
export function joinRideRoom(rideId) {
  if (!rideId) return;
  const s = getSocket();
  if (s) {
    s.emit('join:ride', { rideId });
  }
}

/**
 * Leave specific Ride channel
 */
export function leaveRideRoom(rideId) {
  if (!rideId) return;
  const s = getSocket();
  if (s) {
    s.emit('leave:ride', { rideId });
  }
}

/**
 * Driver GPS Location Streaming
 */
export function streamDriverLocation(payload) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit('driver:location:update', payload);
  }
}

/**
 * Subscribe to Driver GPS Location Stream for active ride
 */
export function onDriverLocation(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('ride:driver:location', callback);
  return () => s.off('ride:driver:location', callback);
}

/**
 * Subscribe to Ride Status updates
 */
export function onRideStatusChanged(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('ride:status:changed', callback);
  return () => s.off('ride:status:changed', callback);
}

/**
 * Subscribe to Dispatch Offers (Driver private channel)
 */
export function onDispatchOffer(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('dispatch:offer', callback);
  return () => s.off('dispatch:offer', callback);
}

/**
 * Subscribe to No Drivers Available notification
 */
export function onNoDriversAvailable(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('ride:no_drivers_available', callback);
  return () => s.off('ride:no_drivers_available', callback);
}

/**
 * Subscribe to Admin Telemetry updates
 */
export function onAdminDriverTelemetry(callback) {
  const s = getSocket();
  if (!s) return () => {};
  s.on('driver:telemetry:update', callback);
  return () => s.off('driver:telemetry:update', callback);
}


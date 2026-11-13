/**
 * RideFlow Ride Lifecycle State Machine & Fare Computation Engine
 * 
 * Strict transition matrix to prevent illegal state jumps, arbitrary status updates,
 * and race conditions in a distributed microservice environment.
 */

export const RIDE_STATES = {
  REQUESTED: 'REQUESTED',
  PENDING: 'PENDING',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  DRIVER_ACCEPTED: 'DRIVER_ACCEPTED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

// Step index for UI timeline visualization
export const RIDE_LIFECYCLE_STEPS = [
  RIDE_STATES.REQUESTED,
  RIDE_STATES.PENDING,
  RIDE_STATES.DRIVER_ASSIGNED,
  RIDE_STATES.DRIVER_ACCEPTED,
  RIDE_STATES.DRIVER_ARRIVED,
  RIDE_STATES.IN_PROGRESS,
  RIDE_STATES.COMPLETED,
];

// Define permissible directed transitions
export const VALID_TRANSITIONS = {
  [RIDE_STATES.REQUESTED]: [RIDE_STATES.PENDING, RIDE_STATES.DRIVER_ASSIGNED, RIDE_STATES.CANCELLED],
  [RIDE_STATES.PENDING]: [RIDE_STATES.DRIVER_ASSIGNED, RIDE_STATES.CANCELLED],
  [RIDE_STATES.DRIVER_ASSIGNED]: [RIDE_STATES.DRIVER_ACCEPTED, RIDE_STATES.PENDING, RIDE_STATES.CANCELLED],
  [RIDE_STATES.DRIVER_ACCEPTED]: [RIDE_STATES.DRIVER_ARRIVED, RIDE_STATES.CANCELLED],
  [RIDE_STATES.DRIVER_ARRIVED]: [RIDE_STATES.IN_PROGRESS, RIDE_STATES.CANCELLED],
  [RIDE_STATES.IN_PROGRESS]: [RIDE_STATES.COMPLETED],
  [RIDE_STATES.COMPLETED]: [], // Terminal state
  [RIDE_STATES.CANCELLED]: [], // Terminal state
};

// States eligible for passenger cancellation
export const CANCELLABLE_STATES = [
  RIDE_STATES.REQUESTED,
  RIDE_STATES.PENDING,
  RIDE_STATES.DRIVER_ASSIGNED,
];

/**
 * Validates if a state transition from currentState to targetState is permissible.
 * @param {string} currentState 
 * @param {string} targetState 
 * @returns {boolean}
 */
export function isValidTransition(currentState, targetState) {
  const allowed = VALID_TRANSITIONS[currentState] || [];
  return allowed.includes(targetState);
}

/**
 * Checks if a ride in currentState is eligible for cancellation.
 * @param {string} currentState 
 * @returns {boolean}
 */
export function isCancellable(currentState) {
  return CANCELLABLE_STATES.includes(currentState);
}

/**
 * Haversine Great-Circle Geodistance Calculator
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers (2 decimal precision)
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Dynamic Fare Calculation
 * Formula: Base Fare (₹50) + (Distance * ₹18.50/km)
 * @param {number} distanceKm 
 * @returns {number}
 */
export function calculateFare(distanceKm) {
  const BASE_FARE = 50.00;
  const PER_KM_RATE = 18.50;
  const computed = BASE_FARE + (distanceKm * PER_KM_RATE);
  return Number(Math.max(BASE_FARE, computed).toFixed(2));
}

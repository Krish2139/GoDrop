/**
 * RideFlow Ride Lifecycle State Machine
 * 
 * Strict transition matrix to prevent illegal state jumps and race conditions.
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

// Define permissible directed transitions
const VALID_TRANSITIONS = {
  [RIDE_STATES.REQUESTED]: [RIDE_STATES.PENDING, RIDE_STATES.CANCELLED],
  [RIDE_STATES.PENDING]: [RIDE_STATES.DRIVER_ASSIGNED, RIDE_STATES.CANCELLED],
  [RIDE_STATES.DRIVER_ASSIGNED]: [RIDE_STATES.DRIVER_ACCEPTED, RIDE_STATES.PENDING, RIDE_STATES.CANCELLED],
  [RIDE_STATES.DRIVER_ACCEPTED]: [RIDE_STATES.DRIVER_ARRIVED, RIDE_STATES.CANCELLED],
  [RIDE_STATES.DRIVER_ARRIVED]: [RIDE_STATES.IN_PROGRESS, RIDE_STATES.CANCELLED],
  [RIDE_STATES.IN_PROGRESS]: [RIDE_STATES.COMPLETED],
  [RIDE_STATES.COMPLETED]: [], // Terminal state
  [RIDE_STATES.CANCELLED]: [], // Terminal state
};

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

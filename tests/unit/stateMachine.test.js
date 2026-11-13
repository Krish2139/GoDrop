import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  RIDE_STATES, 
  isValidTransition, 
  isCancellable 
} from '../../services/ride-service/src/stateMachine.js';

describe('Unit: Ride Lifecycle State Machine Matrix', () => {

  describe('Permissible Directed Lifecycle State Transitions', () => {
    it('should permit REQUESTED -> DRIVER_ASSIGNED', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.REQUESTED, RIDE_STATES.DRIVER_ASSIGNED), true);
    });

    it('should permit REQUESTED -> PENDING (when no initial candidate available)', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.REQUESTED, RIDE_STATES.PENDING), true);
    });

    it('should permit DRIVER_ASSIGNED -> DRIVER_ACCEPTED', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.DRIVER_ASSIGNED, RIDE_STATES.DRIVER_ACCEPTED), true);
    });

    it('should permit DRIVER_ASSIGNED -> PENDING (when driver rejects offer or expires)', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.DRIVER_ASSIGNED, RIDE_STATES.PENDING), true);
    });

    it('should permit DRIVER_ACCEPTED -> DRIVER_ARRIVED', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.DRIVER_ACCEPTED, RIDE_STATES.DRIVER_ARRIVED), true);
    });

    it('should permit DRIVER_ARRIVED -> IN_PROGRESS (trip starts)', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.DRIVER_ARRIVED, RIDE_STATES.IN_PROGRESS), true);
    });

    it('should permit IN_PROGRESS -> COMPLETED (trip ends)', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.IN_PROGRESS, RIDE_STATES.COMPLETED), true);
    });
  });

  describe('Strict Illegal Transition Guards', () => {
    it('should reject direct jumps from REQUESTED -> COMPLETED', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.REQUESTED, RIDE_STATES.COMPLETED), false);
    });

    it('should reject skipping dispatch: REQUESTED -> IN_PROGRESS', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.REQUESTED, RIDE_STATES.IN_PROGRESS), false);
    });

    it('should reject transitions out of terminal state: COMPLETED -> IN_PROGRESS', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.COMPLETED, RIDE_STATES.IN_PROGRESS), false);
    });

    it('should reject transitions out of terminal state: CANCELLED -> REQUESTED', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.CANCELLED, RIDE_STATES.REQUESTED), false);
    });

    it('should reject backwards jumps: COMPLETED -> DRIVER_ASSIGNED', () => {
      assert.strictEqual(isValidTransition(RIDE_STATES.COMPLETED, RIDE_STATES.DRIVER_ASSIGNED), false);
    });
  });

  describe('Cancellation Policy Matrix (isCancellable)', () => {
    it('should permit passenger cancellation during REQUESTED state', () => {
      assert.strictEqual(isCancellable(RIDE_STATES.REQUESTED), true);
    });

    it('should permit passenger cancellation during PENDING state', () => {
      assert.strictEqual(isCancellable(RIDE_STATES.PENDING), true);
    });

    it('should permit passenger cancellation during DRIVER_ASSIGNED state', () => {
      assert.strictEqual(isCancellable(RIDE_STATES.DRIVER_ASSIGNED), true);
    });

    it('should forbid passenger cancellation once driver has ARRIVED', () => {
      assert.strictEqual(isCancellable(RIDE_STATES.DRIVER_ARRIVED), false);
    });

    it('should strictly forbid cancellation once trip is IN_PROGRESS', () => {
      assert.strictEqual(isCancellable(RIDE_STATES.IN_PROGRESS), false);
    });

    it('should strictly forbid cancellation once trip is COMPLETED', () => {
      assert.strictEqual(isCancellable(RIDE_STATES.COMPLETED), false);
    });
  });
});

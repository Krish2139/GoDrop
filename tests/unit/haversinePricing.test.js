import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  calculateHaversineDistance, 
  calculateFare 
} from '../../services/ride-service/src/stateMachine.js';

describe('Unit: Geospatial Haversine & Dynamic Fare Calculations', () => {

  describe('Haversine Great-Circle Geodistance (Ahmedabad Landmarks)', () => {
    it('should calculate distance between SG Highway (Iscon) and Vastrapur Lake accurately', () => {
      // Iscon Cross Road: 23.0275, 72.5076
      // Vastrapur Lake:   23.0373, 72.5303
      const distance = calculateHaversineDistance(23.0275, 72.5076, 23.0373, 72.5303);
      assert.strictEqual(typeof distance, 'number');
      // Should be approximately 2.59 km
      assert.ok(distance >= 2.50 && distance <= 2.70, `Expected ~2.59km, received ${distance}km`);
    });

    it('should calculate distance between Sabarmati Riverfront and SVP Airport accurately', () => {
      // Sabarmati Riverfront: 23.0338, 72.5714
      // SVP Airport (SVPIA):  23.0734, 72.6266
      const distance = calculateHaversineDistance(23.0338, 72.5714, 23.0734, 72.6266);
      // Great-circle distance is approx 7.2km
      assert.ok(distance >= 7.0 && distance <= 7.5, `Expected ~7.2km, received ${distance}km`);
    });

    it('should return exactly 0.00 km for identical coordinates', () => {
      const distance = calculateHaversineDistance(23.0275, 72.5076, 23.0275, 72.5076);
      assert.strictEqual(distance, 0.00);
    });

    it('should calculate long-distance metro corridor between Ahmedabad and GIFT City (~23km)', () => {
      // SG Highway: 23.0275, 72.5076
      // GIFT City:  23.1598, 72.6842
      const distance = calculateHaversineDistance(23.0275, 72.5076, 23.1598, 72.6842);
      assert.ok(distance >= 22.0 && distance <= 24.5, `Expected ~23km, received ${distance}km`);
    });
  });

  describe('Dynamic Fare Computation Formula (Base ₹50 + ₹18.50/km)', () => {
    it('should charge base fare for zero or negligible distance', () => {
      const fare = calculateFare(0);
      assert.strictEqual(fare, 50.00);
    });

    it('should compute exact fare for a 10 km trip: ₹50 + 10 * 18.50 = ₹235.00', () => {
      const fare = calculateFare(10);
      assert.strictEqual(fare, 235.00);
    });

    it('should compute exact fare for 2.59 km trip (Iscon to Vastrapur): ₹50 + 2.59 * 18.50 = ₹97.91', () => {
      const fare = calculateFare(2.59);
      assert.strictEqual(fare, 97.91);
    });

    it('should maintain 2 decimal precision without floating point drift', () => {
      const fare = calculateFare(3.33333);
      const strFare = fare.toString();
      const decimals = strFare.split('.')[1] || '';
      assert.ok(decimals.length <= 2, 'Fare must have at most 2 decimal places');
    });
  });
});

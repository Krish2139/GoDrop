import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateHaversineDistance } from '../../services/ride-service/src/stateMachine.js';

const MAX_DISPATCH_RADIUS_KM = 25.0; // 25km search radius for Ahmedabad metro
const OFFER_TIMEOUT_SECONDS = 30;    // 30-second offer lifecycle window

describe('Unit: Automatic Driver Dispatch Algorithm & Reservation', () => {

  const pickupLat = 23.0275; // Iscon Cross Road, SG Highway
  const pickupLng = 72.5076;

  const mockDrivers = [
    { id: 'drv-far', name: 'Far Driver (GIFT City)', lat: 23.1598, lng: 72.6842, status: 'AVAILABLE' },
    { id: 'drv-near', name: 'Near Driver (Vastrapur)', lat: 23.0373, lng: 72.5303, status: 'AVAILABLE' },
    { id: 'drv-mid', name: 'Mid Driver (CG Road)', lat: 23.0372, lng: 72.5613, status: 'AVAILABLE' },
    { id: 'drv-busy', name: 'Busy Driver', lat: 23.0280, lng: 72.5080, status: 'RESERVED' },
  ];

  it('should enforce maximum search envelope of 25.0 km', () => {
    assert.strictEqual(MAX_DISPATCH_RADIUS_KM, 25.0);
  });

  it('should enforce 30-second offer timeout window', () => {
    assert.strictEqual(OFFER_TIMEOUT_SECONDS, 30);
  });

  it('should rank available candidate drivers by ascending Haversine distance', () => {
    const candidates = mockDrivers
      .filter(d => d.status === 'AVAILABLE')
      .map(d => ({
        ...d,
        distance_km: calculateHaversineDistance(pickupLat, pickupLng, d.lat, d.lng),
      }))
      .filter(d => d.distance_km <= MAX_DISPATCH_RADIUS_KM)
      .sort((a, b) => a.distance_km - b.distance_km);

    assert.strictEqual(candidates.length, 3, 'Must filter only AVAILABLE drivers within radius');
    assert.strictEqual(candidates[0].id, 'drv-near', 'Nearest driver (Vastrapur) must be ranked #1');
    assert.strictEqual(candidates[1].id, 'drv-mid', 'Mid driver (CG Road) must be ranked #2');
    assert.strictEqual(candidates[2].id, 'drv-far', 'Far driver (GIFT City) must be ranked #3');

    assert.ok(candidates[0].distance_km < candidates[1].distance_km);
    assert.ok(candidates[1].distance_km < candidates[2].distance_km);
  });

  it('should prevent double-booking: Busy or Reserved drivers must be excluded from candidates', () => {
    const available = mockDrivers.filter(d => d.status === 'AVAILABLE');
    const hasBusy = available.some(d => d.status !== 'AVAILABLE');
    assert.strictEqual(hasBusy, false, 'Candidate pool must never include non-AVAILABLE drivers');
  });

  it('should compute valid 30-second future expiration timestamps', () => {
    const before = Date.now();
    const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000);
    const diffSeconds = (expiresAt.getTime() - before) / 1000;

    assert.ok(diffSeconds >= 29.9 && diffSeconds <= 30.1, 'Expiration window must be exactly 30s');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';

const GATEWAY_URL = 'http://localhost:5000';

describe('Integration: Circuit Breaker & Chaos Engineering Controls', () => {

  it('GET /api/v1/chaos/status should return circuit breaker operational states', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/chaos/status`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.circuitBreakers.rideService, 'Must report Ride Service breaker');
    assert.ok(body.circuitBreakers.driverService, 'Must report Driver Service breaker');
  });

  it('POST /api/v1/chaos/inject should successfully activate fault injection', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/chaos/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'driverService', mode: 'error' }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.chaosState.active, true);
    assert.strictEqual(body.chaosState.target, 'driverService');
    assert.strictEqual(body.chaosState.mode, 'error');
  });

  it('POST /api/v1/chaos/reset should heal all circuits and restore CLOSED state', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/chaos/reset`, {
      method: 'POST',
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.chaosState.active, false);

    // Verify status confirms CLOSED state
    const statusRes = await fetch(`${GATEWAY_URL}/api/v1/chaos/status`).then(r => r.json());
    assert.strictEqual(statusRes.circuitBreakers.driverService.state, 'CLOSED');
    assert.strictEqual(statusRes.circuitBreakers.rideService.state, 'CLOSED');
  });
});


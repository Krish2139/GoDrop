import { describe, it } from 'node:test';
import assert from 'node:assert';

const GATEWAY_URL = 'http://localhost:5000';

describe('Integration: API Gateway Ingress & JWT Authentication', () => {

  it('GET /health should return 200 with service UP status', async () => {
    const res = await fetch(`${GATEWAY_URL}/health`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.status, 'UP');
    assert.strictEqual(body.service, 'api-gateway');
    assert.ok(body.uptime >= 0);
  });

  it('GET /api/v1/metrics should expose operational telemetry', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/metrics`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(body.gateway, 'Must include gateway HTTP metrics');
    assert.ok(body.circuitBreakers, 'Must include circuit breaker telemetry');
    assert.ok(body.rateLimiter, 'Must include rate limiter status');
    assert.ok(body.socketio, 'Must include Socket.IO metrics');
  });

  it('POST /api/v1/auth/login with valid credentials should return JWT and user profile', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'passenger@rideflow.io',
        password: 'pass123',
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();

    assert.strictEqual(body.success, true);
    assert.ok(body.token, 'Must return signed JWT token');
    assert.strictEqual(typeof body.token, 'string');
    assert.strictEqual(body.user.role, 'PASSENGER');
    assert.strictEqual(body.user.name, 'Aarav Patel');
  });

  it('POST /api/v1/auth/login with invalid password should reject with 401 Unauthorized', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'passenger@rideflow.io',
        password: 'wrong_password_123',
      }),
    });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, 'Unauthorized');
  });

  it('Protected endpoint should reject unauthenticated requests with 401 Unauthorized', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/passengers`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized');
  });
});

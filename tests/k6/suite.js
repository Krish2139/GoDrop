import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Academic telemetry trends
const bookingTrend = new Trend('academic_ride_booking_ms');
const ingressTrend = new Trend('academic_ingress_latency_ms');
const nearbyTrend = new Trend('academic_nearby_drivers_ms');
const totalRidesCreated = new Counter('academic_rides_created_total');
const testSuccessRate = new Rate('academic_success_rate');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:5000';

export const options = {
  stages: [
    { duration: '3s', target: 15 },  // Ramp-up to 15 VUs
    { duration: '12s', target: 35 }, // Sustained load test (35 VUs across multiple endpoints)
    { duration: '3s', target: 0 },   // Graceful cooldown
  ],
  thresholds: {
    'http_req_duration': ['p(95)<250', 'p(99)<500'],
    'academic_success_rate': ['rate>0.95'],
    'http_req_failed': ['rate<0.05'],
  },
};

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({
      email: 'passenger@rideflow.io',
      password: 'pass123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  let token = null;
  let passengerId = 'pass-seed-1';
  if (loginRes.status === 200) {
    const data = loginRes.json();
    token = data.token;
    passengerId = data.user?.passenger?.id || data.user?.id || 'pass-seed-1';
  }
  return { token, passengerId };
}

export default function (data) {
  const clientIp = `10.103.${__VU}.${__ITER % 200}`;

  // Group 1: Gateway Ingress & Health Checks
  group('Gateway Ingress', () => {
    const res = http.get(`${BASE_URL}/health`);
    ingressTrend.add(res.timings.duration);
    const ok = check(res, {
      'Health check status is 200': (r) => r.status === 200,
    });
    testSuccessRate.add(ok);
  });

  // Group 2: Geospatial Driver Discovery (Ahmedabad Lat/Lng)
  group('Geospatial Driver Discovery', () => {
    const res = http.get(`${BASE_URL}/api/v1/drivers/nearby?lat=23.0294&lng=72.5074&radius=15`, {
      headers: { 'X-Forwarded-For': clientIp },
    });
    nearbyTrend.add(res.timings.duration);
    const ok = check(res, {
      'Nearby drivers status is 200': (r) => r.status === 200,
      'Contains data array': (r) => {
        try { return Array.isArray(r.json().data); } catch (e) { return false; }
      },
    });
    testSuccessRate.add(ok);
  });

  // Group 3: Dynamic Ride Lifecycle Booking
  if (data.token) {
    group('Ride Booking Flow', () => {
      const payload = JSON.stringify({
        passenger_id: data.passengerId,
        pickup_address: 'Iscon Cross Road, SG Highway, Ahmedabad',
        pickup_latitude: 23.0294,
        pickup_longitude: 72.5074,
        destination_address: 'Vastrapur Lake, Ahmedabad',
        destination_latitude: 23.0366,
        destination_longitude: 72.5298,
        auto_dispatch: false,
      });

      const params = {
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': clientIp,
          'X-Client-ID': `vu-${__VU}`,
          Authorization: `Bearer ${data.token}`,
        },
      };

      const res = http.post(`${BASE_URL}/api/v1/rides`, payload, params);
      bookingTrend.add(res.timings.duration);

      const ok = check(res, {
        'Ride created with 201': (r) => r.status === 201,
      });
      testSuccessRate.add(ok);
      if (ok) totalRidesCreated.add(1);
    });
  }

  sleep(0.2);
}

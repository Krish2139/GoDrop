import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const nearbyLatency = new Trend('driver_nearby_latency_ms');
const successRate = new Rate('nearby_success_rate');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:5000';

export const options = {
  stages: [
    { duration: '3s', target: 15 },
    { duration: '10s', target: 35 },
    { duration: '3s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<150', 'p(99)<300'],
    'nearby_success_rate': ['rate>0.95'],
  },
};

export default function () {
  // Ahmedabad coordinates (Iscon Cross Road with slight jitter)
  const lat = 23.0294 + (Math.random() - 0.5) * 0.05;
  const lng = 72.5074 + (Math.random() - 0.5) * 0.05;

  // Simulate distributed mobile clients across unique IPs to prevent artificial IP collision
  const clientIp = `10.100.${__VU}.${__ITER % 200}`;

  const res = http.get(`${BASE_URL}/api/v1/drivers/nearby?lat=${lat}&lng=${lng}&radius=15`, {
    headers: {
      'X-Forwarded-For': clientIp,
    },
  });
  nearbyLatency.add(res.timings.duration);

  const ok = check(res, {
    'Nearby drivers status 200': (r) => r.status === 200,
    'Returns array of drivers in data field': (r) => {
      try {
        const body = r.json();
        return body && body.success === true && Array.isArray(body.data);
      } catch (e) {
        return false;
      }
    },
  });

  successRate.add(ok);
  sleep(0.1);
}

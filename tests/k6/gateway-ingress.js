import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom academic performance metrics
const failureRate = new Rate('custom_failure_rate');
const healthLatency = new Trend('health_check_latency_ms');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:5000';

export const options = {
  stages: [
    { duration: '5s', target: 20 },   // Warm-up ramp
    { duration: '15s', target: 50 },  // Sustained concurrency (50 VUs)
    { duration: '5s', target: 0 },    // Cooldown ramp
  ],
  thresholds: {
    'http_req_duration': ['p(95)<150', 'p(99)<300'], // 95% of requests must complete < 150ms
    'http_req_failed': ['rate<0.01'],                 // Under 1% failure rate
    'custom_failure_rate': ['rate<0.01'],
  },
};

export default function () {
  // Test 1: High-throughput Liveness / Health probe
  const resHealth = http.get(`${BASE_URL}/health`);
  healthLatency.add(resHealth.timings.duration);

  const healthOk = check(resHealth, {
    'Health status 200': (r) => r.status === 200,
    'Health reports UP': (r) => r.body && r.body.includes('UP'),
  });
  failureRate.add(!healthOk);

  // Test 2: Ingress Prometheus / System Telemetry
  const resMetrics = http.get(`${BASE_URL}/api/v1/metrics`);
  const metricsOk = check(resMetrics, {
    'Metrics status 200': (r) => r.status === 200,
    'Metrics contains memory or uptime': (r) => r.body && (r.body.includes('memory') || r.body.includes('uptime')),
  });
  failureRate.add(!metricsOk);

  sleep(0.1); // 100ms think time between iterations
}

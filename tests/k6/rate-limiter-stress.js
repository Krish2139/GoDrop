import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const rateLimitHits = new Counter('rate_limit_429_hits');
const successfulBypasses = new Counter('requests_allowed');
const serverErrors = new Counter('server_errors_500');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:5000';

export const options = {
  scenarios: {
    flood_stress: {
      executor: 'constant-arrival-rate',
      rate: 150,               // 150 requests per second to overwhelm default bucket capacity
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 40,
      maxVUs: 80,
    },
  },
  thresholds: {
    // Under heavy flood, distributed token bucket MUST trigger 429 and NEVER trigger 500
    'server_errors_500': ['count==0'],
    'rate_limit_429_hits': ['count>10'], // Proves rate limiting is actively enforcing
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/rides/stress-test-route`, {
    headers: {
      'X-Forwarded-For': '192.168.1.100', // Pinned simulated IP to isolate token bucket
    },
  });

  if (res.status === 429) {
    rateLimitHits.add(1);
  } else if (res.status >= 500) {
    serverErrors.add(1);
  } else {
    successfulBypasses.add(1);
  }

  check(res, {
    'No 500 Server Crashes under flood': (r) => r.status !== 500,
    'Graceful degradation or 429 Throttled': (r) => r.status === 429 || r.status < 500,
  });
}


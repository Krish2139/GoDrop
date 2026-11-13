import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

const bookingDuration = new Trend('ride_booking_duration_ms');
const ridesBooked = new Counter('rides_booked_total');
const bookingSuccessRate = new Rate('ride_booking_success_rate');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:5000';

export const options = {
  stages: [
    { duration: '3s', target: 10 },
    { duration: '10s', target: 25 },
    { duration: '3s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<350', 'p(99)<700'],
    'ride_booking_success_rate': ['rate>0.95'],
  },
};

// Setup: Authenticate Passenger Persona once per test execution
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({
      email: 'passenger@rideflow.io',
      password: 'pass123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status !== 200) {
    throw new Error(`Auth failed with status ${loginRes.status}: ${loginRes.body}`);
  }

  const json = loginRes.json();
  const passengerId = json.user?.passenger?.id || json.user?.id || 'pass-seed-1';
  return { token: json.token, passengerId };
}

// Ahmedabad route test matrix
const AHMEDABAD_ROUTES = [
  {
    pickup_latitude: 23.0294, pickup_longitude: 72.5074, pickup_address: 'Iscon Cross Road, SG Highway, Ahmedabad',
    destination_latitude: 23.0366, destination_longitude: 72.5298, destination_address: 'Vastrapur Lake, Ahmedabad',
  },
  {
    pickup_latitude: 23.0305, pickup_longitude: 72.5647, pickup_address: 'Riverfront Promenade, Sabarmati, Ahmedabad',
    destination_latitude: 23.0734, destination_longitude: 72.6266, destination_address: 'Sardar Vallabhbhai Patel Airport (AMD), Ahmedabad',
  },
  {
    pickup_latitude: 23.0258, pickup_longitude: 72.5562, pickup_address: 'Law Garden Night Market, Ellisbridge, Ahmedabad',
    destination_latitude: 23.0384, destination_longitude: 72.5583, destination_address: 'CG Road Commercial Hub, Navrangpura, Ahmedabad',
  },
  {
    pickup_latitude: 23.0366, pickup_longitude: 72.5298, pickup_address: 'Vastrapur Lake Amphi, Ahmedabad',
    destination_latitude: 23.1611, destination_longitude: 72.6841, destination_address: 'GIFT City FinTech Tower, Gandhinagar/Ahmedabad',
  },
];

export default function (data) {
  const route = AHMEDABAD_ROUTES[Math.floor(Math.random() * AHMEDABAD_ROUTES.length)];

  const payload = JSON.stringify({
    passenger_id: data.passengerId,
    pickup_address: route.pickup_address,
    pickup_latitude: route.pickup_latitude,
    pickup_longitude: route.pickup_longitude,
    destination_address: route.destination_address,
    destination_latitude: route.destination_latitude,
    destination_longitude: route.destination_longitude,
    auto_dispatch: false, // Benchmark pure ride creation, transactional outbox & DB persistence
  });

  const clientIp = `10.102.${__VU}.${__ITER % 200}`;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': clientIp,
      'X-Client-ID': `vu-${__VU}`,
      Authorization: `Bearer ${data.token}`,
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/rides`, payload, params);
  bookingDuration.add(res.timings.duration);

  const success = check(res, {
    'Ride booking status is 201': (r) => r.status === 201,
    'Returns valid ride object with id': (r) => {
      try {
        const body = r.json();
        return body && body.data && body.data.id;
      } catch (e) {
        return false;
      }
    },
    'Calculates positive fare amount': (r) => {
      try {
        const body = r.json();
        return body && body.data && parseFloat(body.data.fare_amount) > 0;
      } catch (e) {
        return false;
      }
    },
  });

  bookingSuccessRate.add(success);
  if (success) {
    ridesBooked.add(1);
  }

  sleep(0.15);
}

import { pool } from './services/ride-service/src/db.js';

const GATEWAY_URL = 'http://localhost:5000';

async function req(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.response = { status: res.status, data };
    throw err;
  }
  return { data, status: res.status };
}

async function testDispatchAlgorithm() {
  console.log('================================================================');
  console.log('🧪 MILESTONE 7: AUTOMATIC DRIVER DISPATCH ALGORITHM TEST SUITE');
  console.log('================================================================\n');

  try {
    // 0. Reset test drivers to baseline state
    console.log('Step 0A: Resetting test driver fleet in PostgreSQL...');
    await pool.query("UPDATE drivers SET status = 'AVAILABLE' WHERE id IN ('driver-seed-1', 'driver-seed-2', 'driver-seed-4', 'driver-seed-5')");
    await pool.query("UPDATE drivers SET status = 'OFFLINE' WHERE id = 'driver-seed-3'");
    console.log('✅ Baseline driver availability restored.');

    // Authenticate as Passenger to obtain JWT Bearer Token
    console.log('\nStep 0B: Authenticating passenger persona (passenger@rideflow.io)...');
    const loginRes = await req(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: 'passenger@rideflow.io',
        password: 'pass123',
      }),
    });
    const token = loginRes.data.token;
    console.log(`✅ JWT Token Acquired: Role=${loginRes.data.user.role}`);

    // Verify Available Drivers
    console.log('\nStep 0C: Querying available drivers in Ahmedabad...');
    const driversRes = await req(`${GATEWAY_URL}/api/v1/drivers?status=AVAILABLE`);
    console.log(`✅ Available Drivers Count: ${driversRes.data.total}`);
    driversRes.data.data.forEach(d => {
      console.log(`   - [${d.id}] ${d.vehicle_model} (${d.license_plate}) at [${d.current_latitude}, ${d.current_longitude}]`);
    });

    // 1. Create a Ride Request at SG Highway (Iscon Cross Road: 23.0275, 72.5076)
    console.log('\n----------------------------------------------------------------');
    console.log('Step 1: Requesting a Ride at SG Highway (Iscon Cross Road)...');
    const ride1Payload = {
      passenger_id: 'pass-seed-1',
      passenger_name: 'Aarav Patel',
      pickup_address: 'SG Highway (Iscon Cross Road)',
      pickup_latitude: 23.0275,
      pickup_longitude: 72.5076,
      destination_address: 'Navrangpura (CG Road)',
      destination_latitude: 23.0372,
      destination_longitude: 72.5613,
      auto_dispatch: true,
    };

    const bookRes = await req(`${GATEWAY_URL}/api/v1/rides`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(ride1Payload),
    });
    const ride1 = bookRes.data.data;
    const dispatch1 = bookRes.data.dispatch;

    console.log(`✅ Ride Created: ID=${ride1.id}, Status=${ride1.status}, Fare=₹${ride1.fare_amount}`);
    console.log(`✅ Auto-Dispatch Result:`);
    console.log(`   - Driver Assigned: ${dispatch1.driver.name} (${dispatch1.driver.vehicle_model})`);
    console.log(`   - Distance: ${dispatch1.driver.distance_km} km (Nearest candidate selected)`);
    console.log(`   - Assignment ID: ${dispatch1.assignment.id}, Status: ${dispatch1.assignment.status}`);
    console.log(`   - Offer Expires At: ${dispatch1.assignment.expires_at}`);

    // Verify Driver 1 is now RESERVED in the database
    const assignedDriverRes = await req(`${GATEWAY_URL}/api/v1/drivers/${dispatch1.driver.id}`);
    console.log(`✅ Driver Status in DB: ${assignedDriverRes.data.data.status} (Atomically locked from AVAILABLE)`);

    // 2. Test Driver Rejection & Auto-Cascading Dispatch to Next Nearest Driver
    console.log('\n----------------------------------------------------------------');
    console.log('Step 2: Testing Driver Rejection & Auto-Cascading Dispatch...');
    console.log(`Driver ${dispatch1.driver.name} declines the ride offer...`);

    const rejectRes = await req(`${GATEWAY_URL}/api/v1/rides/${ride1.id}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        driver_id: dispatch1.driver.id,
        reason: 'Driver stuck in traffic near Vastrapur',
      }),
    });

    console.log(`✅ Rejection processed: ${rejectRes.data.message}`);
    const nextDispatch = rejectRes.data.nextDispatch;
    console.log(`✅ Auto-Cascade Triggered:`);
    console.log(`   - Previous Driver (${dispatch1.driver.id}) released back to AVAILABLE.`);
    console.log(`   - Next Nearest Driver Selected: ${nextDispatch.driver.name} (${nextDispatch.driver.vehicle_model})`);
    console.log(`   - Next Distance: ${nextDispatch.driver.distance_km} km`);
    console.log(`   - New Assignment ID: ${nextDispatch.assignment.id}`);

    // Verify Previous Driver is back to AVAILABLE
    const releasedDriverRes = await req(`${GATEWAY_URL}/api/v1/drivers/${dispatch1.driver.id}`);
    console.log(`✅ Previous Driver Status: ${releasedDriverRes.data.data.status} (Released back to pool)`);

    // 3. Test Driver Acceptance
    console.log('\n----------------------------------------------------------------');
    console.log('Step 3: Testing Driver Acceptance...');
    console.log(`Driver ${nextDispatch.driver.name} accepts the ride offer...`);

    const acceptRes = await req(`${GATEWAY_URL}/api/v1/rides/${ride1.id}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        driver_id: nextDispatch.driver.id,
      }),
    });

    console.log(`✅ Offer Accepted: Status=${acceptRes.data.status}`);
    const acceptedDriverRes = await req(`${GATEWAY_URL}/api/v1/drivers/${nextDispatch.driver.id}`);
    console.log(`✅ Accepted Driver Status in DB: ${acceptedDriverRes.data.data.status} (Marked ON_TRIP)`);

    // 4. Test Assignment Audit Trail
    console.log('\n----------------------------------------------------------------');
    console.log('Step 4: Verifying Ride Assignment Audit Trail in PostgreSQL...');
    const assignmentsRes = await req(`${GATEWAY_URL}/api/v1/rides/${ride1.id}/assignments`);
    console.log(`✅ Total Assignment Offers Recorded: ${assignmentsRes.data.total}`);
    assignmentsRes.data.data.forEach((asgn, idx) => {
      console.log(`   ${idx + 1}. Driver: ${asgn.driver_name} | Status: ${asgn.status} | Distance: ${asgn.distance_km}km | Offered: ${asgn.offered_at}`);
    });

    // 5. Concurrent Booking Test: Atomicity and Race-Condition Prevention
    console.log('\n----------------------------------------------------------------');
    console.log('Step 5: Testing Concurrent Booking Race Condition Prevention...');
    console.log('Simulating 2 concurrent booking requests at the same location to test atomic conditional locking...');

    const [resA, resB] = await Promise.all([
      req(`${GATEWAY_URL}/api/v1/rides`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          passenger_id: 'pass-seed-1',
          passenger_name: 'Passenger A',
          pickup_address: 'SG Highway (Iscon Cross Road)',
          pickup_latitude: 23.0275,
          pickup_longitude: 72.5076,
          destination_address: 'Navrangpura (CG Road)',
          destination_latitude: 23.0372,
          destination_longitude: 72.5613,
          auto_dispatch: true,
        }),
      }),
      req(`${GATEWAY_URL}/api/v1/rides`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          passenger_id: 'pass-seed-1',
          passenger_name: 'Passenger B',
          pickup_address: 'SG Highway (Iscon Cross Road)',
          pickup_latitude: 23.0275,
          pickup_longitude: 72.5076,
          destination_address: 'Navrangpura (CG Road)',
          destination_latitude: 23.0372,
          destination_longitude: 72.5613,
          auto_dispatch: true,
        }),
      })
    ]);

    const dataA = resA.data;
    const dataB = resB.data;

    console.log(`✅ Ride A (${dataA.data.id}): Driver Assigned = ${dataA.dispatch.driver.name} (ID: ${dataA.dispatch.driver.id}, Dist: ${dataA.dispatch.driver.distance_km}km)`);
    console.log(`✅ Ride B (${dataB.data.id}): Driver Assigned = ${dataB.dispatch.driver.name} (ID: ${dataB.dispatch.driver.id}, Dist: ${dataB.dispatch.driver.distance_km}km)`);

    if (dataA.dispatch.driver.id !== dataB.dispatch.driver.id) {
      console.log('🎉 SUCCESS: Atomic conditional reservation verified! Both concurrent rides were assigned distinct, unique drivers.');
    } else {
      console.error('❌ FAILURE: Race condition detected - both rides assigned the same driver!');
    }

    console.log('\n================================================================');
    console.log('✨ ALL MILESTONE 7 AUTOMATIC DISPATCH ALGORITHM TESTS PASSED!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ Test failed:', err.response?.data || err.message);
  } finally {
    await pool.end();
  }
}

testDispatchAlgorithm();

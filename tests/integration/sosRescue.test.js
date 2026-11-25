import { describe, it, after } from 'node:test';
import assert from 'node:assert';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:5000';

describe('Integration: In-Ride SOS & Automated Rescue Dispatch Feature', () => {
  let adminToken;
  let passengerToken;
  let testRideId;
  let testIncidentId;

  it('0. Obtain JWT authentication tokens for Admin and Passenger via /api/v1/auth/login', async () => {
    // Admin login
    const adminRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@rideflow.io',
        password: 'admin123',
      }),
    });
    const adminData = await adminRes.json();
    assert.strictEqual(adminRes.status, 200, 'Admin login failed');
    adminToken = adminData.token;
    assert.ok(adminToken, 'Admin token must be returned');

    // Passenger login
    const passRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'passenger@rideflow.io',
        password: 'pass123',
      }),
    });
    const passData = await passRes.json();
    assert.strictEqual(passRes.status, 200, 'Passenger login failed');
    passengerToken = passData.token;
    assert.ok(passengerToken, 'Passenger token must be returned');
  });

  it('1. Create an active ride in IN_PROGRESS state to test in-ride SOS', async () => {
    // Request a ride
    const reqRes = await fetch(`${GATEWAY_URL}/api/v1/rides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({
        passenger_id: 'pass-seed-1',
        pickup_address: 'Ahmedabad Junction (Kalupur Station)',
        pickup_latitude: 23.0225,
        pickup_longitude: 72.5714,
        destination_address: 'SG Highway (Iscon Cross Road)',
        destination_latitude: 23.0275,
        destination_longitude: 72.5076,
      }),
    });

    const reqData = await reqRes.json();
    assert.strictEqual(reqRes.status, 201, `Failed to request ride: ${JSON.stringify(reqData)}`);
    assert.ok(reqData.data?.id, 'Must return ride id');
    testRideId = reqData.data.id;

    // Fetch ride to find assigned driver
    const rideDetailsRes = await fetch(`${GATEWAY_URL}/api/v1/rides/${testRideId}`);
    const rideDetails = await rideDetailsRes.json();
    const assignedDriverId = rideDetails.data?.driver_id || reqData.data?.driver_id || 'driver-seed-1';

    // Transition ride: DRIVER_ACCEPTED -> DRIVER_ARRIVED -> IN_PROGRESS
    const acceptRes = await fetch(`${GATEWAY_URL}/api/v1/rides/${testRideId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: assignedDriverId }),
    });
    const acceptData = await acceptRes.json();
    assert.strictEqual(acceptRes.status, 200, `Accept failed: ${JSON.stringify(acceptData)}`);

    const arrivedRes = await fetch(`${GATEWAY_URL}/api/v1/rides/${testRideId}/arrived`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const arrivedData = await arrivedRes.json();
    assert.strictEqual(arrivedRes.status, 200, `Arrived failed: ${JSON.stringify(arrivedData)}`);

    const startRes = await fetch(`${GATEWAY_URL}/api/v1/rides/${testRideId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const startData = await startRes.json();
    assert.strictEqual(startRes.status, 200, `Failed to start ride: ${JSON.stringify(startData)}`);
    assert.strictEqual(startData.data.status, 'IN_PROGRESS', 'Ride must be in IN_PROGRESS state');
  });

  it('2. POST /api/v1/sos/trigger should activate SOS, create incident, and return context', async () => {
    const triggerRes = await fetch(`${GATEWAY_URL}/api/v1/sos/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({
        ride_id: testRideId,
        passenger_id: 'pass-seed-1',
        lat: 23.0250,
        lng: 72.5400,
      }),
    });

    const triggerData = await triggerRes.json();
    assert.strictEqual(triggerRes.status, 201, `Failed to trigger SOS: ${JSON.stringify(triggerData)}`);
    assert.strictEqual(triggerData.success, true);
    assert.ok(triggerData.data?.incident_id, 'Must return incident_id');
    assert.strictEqual(triggerData.data.status, 'ACTIVE');
    const simAlert = triggerData.simulated_external_alert || triggerData.simulated_authority_alert || triggerData.data?.simulated_external_alert || triggerData.data?.simulated_authority_alert;
    assert.ok(simAlert, 'Must include simulated authority alert');
    assert.match(
      simAlert,
      /Simulated alert dispatched to Emergency Contacts & Local Authorities API/
    );

    testIncidentId = triggerData.data?.incident_id || triggerData.incident_id;
  });

  it('3. POST /api/v1/sos/:incidentId/location should stream live GPS coordinates', async () => {
    const locRes = await fetch(`${GATEWAY_URL}/api/v1/sos/${testIncidentId}/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({
        lat: 23.0265,
        lng: 72.5350,
      }),
    });

    const locData = await locRes.json();
    assert.strictEqual(locRes.status, 200);
    assert.strictEqual(locData.success, true);
    assert.strictEqual(locData.data.current_lat, 23.0265);
    assert.strictEqual(locData.data.current_lng, 72.5350);
  });

  it('4. GET /api/v1/admin/sos/incidents should list incidents for Admin Command Center', async () => {
    const incRes = await fetch(`${GATEWAY_URL}/api/v1/admin/sos/incidents`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const incData = await incRes.json();
    assert.strictEqual(incRes.status, 200);
    assert.strictEqual(incData.success, true);
    assert.ok(Array.isArray(incData.data), 'Data must be an array of incidents');

    const found = incData.data.find(i => i.incident_id === testIncidentId);
    assert.ok(found, 'Triggered incident must be found in admin incident list');
    assert.strictEqual(found.status, 'ACTIVE');
    assert.strictEqual(found.ride_id, testRideId);
    assert.ok(found.driver_name, 'Must include driver details in context');
  });

  it('5. POST /api/v1/admin/sos/:incidentId/suspend-driver should abort ride and suspend driver', async () => {
    const suspRes = await fetch(`${GATEWAY_URL}/api/v1/admin/sos/${testIncidentId}/suspend-driver`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const suspData = await suspRes.json();
    assert.strictEqual(suspRes.status, 200, `Failed to suspend driver: ${JSON.stringify(suspData)}`);
    assert.strictEqual(suspData.success, true);
    assert.strictEqual(suspData.data.ride_status, 'ABORTED_SOS');
    assert.strictEqual(suspData.data.driver_status, 'SUSPENDED_SOS');

    // Verify ride in DB is ABORTED_SOS
    const rideCheckRes = await fetch(`${GATEWAY_URL}/api/v1/rides/${testRideId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const rideCheck = await rideCheckRes.json();
    assert.strictEqual(rideCheck.data.status, 'ABORTED_SOS');
  });

  it('6. POST /api/v1/admin/sos/:incidentId/dispatch-rescue should dispatch a free rescue cab (fare ₹0)', async () => {
    // First make another driver available to pick up rescue if driver-seed-1 is suspended
    await fetch(`${GATEWAY_URL}/api/v1/drivers/driver-seed-2/availability`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    }).catch(() => {});

    const rescueRes = await fetch(`${GATEWAY_URL}/api/v1/admin/sos/${testIncidentId}/dispatch-rescue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const rescueData = await rescueRes.json();
    assert.strictEqual(rescueRes.status, 201, `Failed to dispatch rescue: ${JSON.stringify(rescueData)}`);
    assert.strictEqual(rescueData.success, true);
    assert.ok(rescueData.data?.rescue_ride, 'Must return rescue ride object');
    assert.strictEqual(rescueData.data.rescue_ride.is_free_rescue, true, 'is_free_rescue flag must be true');
    assert.strictEqual(Number(rescueData.data.rescue_ride.fare_amount), 0, 'Fare must be ₹0 for rescue ride');
    assert.strictEqual(rescueData.data.rescue_ride.pickup_latitude, 23.0265, 'Pickup must match passenger live SOS coordinates');
  });

  it('7. POST /api/v1/admin/sos/:incidentId/resolve should mark incident RESOLVED', async () => {
    const resRes = await fetch(`${GATEWAY_URL}/api/v1/admin/sos/${testIncidentId}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const resData = await resRes.json();
    assert.strictEqual(resRes.status, 200);
    assert.strictEqual(resData.success, true);
    assert.strictEqual(resData.data.status, 'RESOLVED');
    assert.ok(resData.data.resolved_at, 'resolved_at timestamp must be populated');
  });

  after(async () => {
    try {
      const pg = await import('pg');
      const Pool = pg.default?.Pool || pg.Pool;
      const client = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'rideflow_db',
        user: process.env.POSTGRES_USER || 'rideflow_user',
        password: process.env.POSTGRES_PASSWORD || 'rideflow_secure_password',
      });
      await client.query(`
        INSERT INTO users (id, email, password_hash, role, name, phone)
        VALUES 
          ('user-drv-1', 'driver@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Rajesh Prajapati', '+91 98980 11223'),
          ('user-drv-2', 'driver2@rideflow.io', '$2b$10$WPzWdSMqa2CO55rtPodcne6TXYJVUS7GoeCzIPUjJ1Lu1OLNIwksy', 'DRIVER', 'Priya Desai', '+91 98980 44556')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO drivers (id, user_id, vehicle_model, license_plate, rating, status, current_latitude, current_longitude, heading)
        VALUES 
          ('driver-seed-1', 'user-drv-1', 'Toyota Prius (White)', 'GJ-01-AB-1234', 4.85, 'AVAILABLE', 23.0275, 72.5076, 90),
          ('driver-seed-2', 'user-drv-2', 'Hyundai Verna (Silver)', 'GJ-01-CD-5678', 4.92, 'AVAILABLE', 23.0373, 72.5303, 180)
        ON CONFLICT (id) DO UPDATE SET status = 'AVAILABLE';
      `);
      await client.end();
    } catch (e) {
      // ignore
    }
  });
});

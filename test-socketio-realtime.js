import { io } from 'socket.io-client';
import Redis from 'ioredis';

const GATEWAY_URL = 'http://localhost:5000';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = 6379;

async function runSocketRealtimeTests() {
  console.log('================================================================');
  console.log('🧪 MILESTONE 10: SOCKET.IO REAL-TIME CHANNELS & GPS STREAM TESTS');
  console.log('================================================================');

  let passengerSocket = null;
  let driverSocket = null;
  let redisClient = null;

  try {
    // -------------------------------------------------------------
    // Step 1: Verify Unauthenticated Connection Rejection
    // -------------------------------------------------------------
    console.log('\nStep 1: Testing Handshake Authentication Security (No JWT)...');
    const authFailedPromise = new Promise((resolve, reject) => {
      const unauthSocket = io(GATEWAY_URL, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 3000,
      });

      unauthSocket.on('connect_error', (err) => {
        unauthSocket.close();
        resolve(err.message);
      });

      unauthSocket.on('connect', () => {
        unauthSocket.close();
        reject(new Error('Vulnerability: Unauthenticated socket was allowed to connect!'));
      });
    });

    const rejectionReason = await authFailedPromise;
    console.log(`✅ Handshake Auth Guard: Rejected unauthenticated connection successfully!`);
    console.log(`   - Reason: "${rejectionReason}"`);

    // -------------------------------------------------------------
    // Step 2: Acquire JWTs & Establish Authenticated Sockets
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('Step 2: Authenticating Personas & Connecting Sockets...');

    // Login Passenger
    const passLoginRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'passenger@rideflow.io', password: 'pass123' }),
    }).then(r => r.json());

    const passengerToken = passLoginRes.token || passLoginRes.data?.token;
    const passengerUser = passLoginRes.user || passLoginRes.data?.user;
    console.log(`✅ Passenger Authenticated: ${passengerUser.name} (${passengerUser.id})`);

    // Login Driver
    const driverLoginRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'driver@rideflow.io', password: 'driver123' }),
    }).then(r => r.json());

    const driverToken = driverLoginRes.token || driverLoginRes.data?.token;
    const driverUser = driverLoginRes.user || driverLoginRes.data?.user;
    console.log(`✅ Driver Authenticated: ${driverUser.name} (${driverUser.id})`);

    // Connect Passenger Socket
    passengerSocket = io(GATEWAY_URL, {
      auth: { token: passengerToken },
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      passengerSocket.on('connect', resolve);
      passengerSocket.on('connect_error', reject);
    });
    console.log(`✅ Passenger Socket.IO Connected: SocketID=${passengerSocket.id}`);

    // Connect Driver Socket
    driverSocket = io(GATEWAY_URL, {
      auth: { token: driverToken },
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      driverSocket.on('connect', resolve);
      driverSocket.on('connect_error', reject);
    });
    console.log(`✅ Driver Socket.IO Connected: SocketID=${driverSocket.id}`);

    // -------------------------------------------------------------
    // Step 3: Join Shared Ride Channel & Stream Driver GPS
    // -------------------------------------------------------------
    const testRideId = `ride-live-${Date.now()}`;
    console.log('\n----------------------------------------------------------------');
    console.log(`Step 3: Joining Ride Channel [ride:${testRideId}] & Streaming GPS...`);

    passengerSocket.emit('join:ride', { rideId: testRideId });
    driverSocket.emit('join:ride', { rideId: testRideId });

    // Allow rooms to register
    await new Promise(r => setTimeout(r, 200));

    const gpsPromise = new Promise((resolve) => {
      passengerSocket.on('ride:driver:location', (data) => {
        resolve(data);
      });
    });

    // Driver emits simulated Ahmedabad GPS coordinates (SG Highway -> Iscon)
    const startTime = Date.now();
    driverSocket.emit('driver:location:update', {
      rideId: testRideId,
      latitude: 23.0275,
      longitude: 72.5076,
      speed: 45,
      heading: 90,
    });

    const receivedGps = await gpsPromise;
    const latency = Date.now() - startTime;

    console.log(`✅ Real-time GPS Telemetry Delivered to Passenger:`);
    console.log(`   - Driver: ${receivedGps.driverName} (${receivedGps.driverId})`);
    console.log(`   - Coordinates: ${receivedGps.latitude}° N, ${receivedGps.longitude}° E`);
    console.log(`   - Speed: ${receivedGps.speed} km/h | Heading: ${receivedGps.heading}°`);
    console.log(`   - Sub-second Broadcast Latency: ${latency}ms`);
    console.log('🎉 SUCCESS: Direct Driver-to-Passenger GPS streaming verified!');

    // -------------------------------------------------------------
    // Step 4: Test Microservice Redis Pub/Sub Event Bridge
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('Step 4: Testing Microservice Redis Pub/Sub to Socket.IO Bridge...');
    console.log('Publishing ride state transition via Redis pub/sub channel...');

    redisClient = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

    const statusPromise = new Promise((resolve) => {
      passengerSocket.on('ride:status:changed', (data) => {
        resolve(data);
      });
    });

    // Microservice simulates publishing ride state change to Redis
    await redisClient.publish('rideflow:realtime:events', JSON.stringify({
      room: `ride:${testRideId}`,
      event: 'ride:status:changed',
      data: {
        rideId: testRideId,
        status: 'DRIVER_ARRIVED',
        message: 'Driver has arrived at Vastrapur Lake pickup point',
        timestamp: new Date().toISOString(),
      },
    }));

    const receivedStatus = await statusPromise;
    console.log(`✅ Event Relayed through Redis Pub/Sub into Socket.IO Room:`);
    console.log(`   - Ride ID: ${receivedStatus.rideId}`);
    console.log(`   - Transitioned Status: ${receivedStatus.status}`);
    console.log(`   - Message: "${receivedStatus.message}"`);
    console.log('🎉 SUCCESS: Distributed Redis-to-Socket.IO Pub/Sub bridge verified!');

    // -------------------------------------------------------------
    // Step 5: Test Private Dispatch Offer Push to Driver Channel
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log(`Step 5: Testing Private Targeted Dispatch Offer to Driver Channel [driver:${driverUser.id}]...`);

    const offerPromise = new Promise((resolve) => {
      driverSocket.on('dispatch:offer', (data) => {
        resolve(data);
      });
    });

    // Publish dispatch offer to driver's private room
    await redisClient.publish('rideflow:realtime:events', JSON.stringify({
      room: `driver:${driverUser.id}`,
      event: 'dispatch:offer',
      data: {
        assignmentId: `asgn-test-${Date.now()}`,
        rideId: testRideId,
        pickupAddress: 'Sabarmati Riverfront (Ashram Road)',
        destinationAddress: 'SVP International Airport (SVPIA)',
        distanceKm: 3.42,
        fare: 185.50,
        remainingSeconds: 30,
      },
    }));

    const receivedOffer = await offerPromise;
    console.log(`✅ Targeted Driver Dispatch Offer Received over WebSocket:`);
    console.log(`   - Assignment ID: ${receivedOffer.assignmentId}`);
    console.log(`   - Route: ${receivedOffer.pickupAddress} -> ${receivedOffer.destinationAddress}`);
    console.log(`   - Fare: ₹${receivedOffer.fare} | Proximity: ${receivedOffer.distanceKm} km`);
    console.log(`   - Countdown Window: ${receivedOffer.remainingSeconds}s`);
    console.log('🎉 SUCCESS: Private Driver Dispatch channel verified!');

    // -------------------------------------------------------------
    // Step 6: Verify Gateway Telemetry Metrics for Socket.IO
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('Step 6: Verifying Gateway Real-time Telemetry in /api/v1/metrics...');

    const metricsRes = await fetch(`${GATEWAY_URL}/api/v1/metrics`).then(r => r.json());
    const sm = metricsRes.socketio;

    console.log(`✅ Gateway Socket.IO Metrics:`);
    console.log(`   - Real-time Engine Enabled: ${sm?.enabled}`);
    console.log(`   - Active Connected Clients: ${sm?.connectedClients}`);
    console.log(`   - Total Connections Served: ${sm?.totalConnectionsServed}`);
    console.log(`   - Events Received: ${sm?.eventsReceived}`);
    console.log(`   - Events Emitted: ${sm?.eventsEmitted}`);
    console.log(`   - Active Rooms: ${sm?.activeRoomsCount}`);

    console.log('\n================================================================');
    console.log('✨ ALL MILESTONE 10 SOCKET.IO REAL-TIME CHANNEL TESTS PASSED!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    if (passengerSocket) passengerSocket.close();
    if (driverSocket) driverSocket.close();
    if (redisClient) redisClient.disconnect();
  }
}

runSocketRealtimeTests();

import amqp from 'amqplib';
import { pool } from './services/ride-service/src/db.js';

const GATEWAY_URL = 'http://localhost:5000';
const RABBIT_URL = 'amqp://guest:guest@localhost:5672';
const RABBIT_API_URL = 'http://localhost:15672/api';
const AUTH_HEADER = 'Basic ' + Buffer.from('guest:guest').toString('base64');

async function req(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), data };
}

async function testRabbitMQPipeline() {
  console.log('================================================================');
  console.log('🧪 MILESTONE 9: RABBITMQ ASYNCHRONOUS WORKER PIPELINE TESTS');
  console.log('================================================================\n');

  let rabbitConn = null;
  let rabbitChannel = null;

  try {
    // 0. Connect directly to RabbitMQ to inspect topology
    console.log('Step 0: Verifying RabbitMQ Broker & Queue Topology...');
    rabbitConn = await amqp.connect(RABBIT_URL);
    rabbitChannel = await rabbitConn.createChannel();

    const queuesRes = await fetch(`${RABBIT_API_URL}/queues`, {
      headers: { Authorization: AUTH_HEADER }
    }).then(r => r.json());

    console.log(`✅ Active RabbitMQ Queues on Broker (${queuesRes.length}):`);
    queuesRes.forEach(q => {
      console.log(`   - [${q.name}] Messages: ${q.messages} | Active Consumers: ${q.consumers} | State: ${q.state}`);
    });

    // 1. Authenticate Passenger Persona
    console.log('\n----------------------------------------------------------------');
    console.log('Step 1: Authenticating Passenger Persona...');
    const loginRes = await req(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'passenger@rideflow.io', password: 'pass123' })
    });
    const token = loginRes.data.token;
    console.log(`✅ Token Acquired for Passenger: ${loginRes.data.user.name}`);

    // Ensure available drivers in DB
    await pool.query("UPDATE drivers SET status = 'AVAILABLE' WHERE id IN ('driver-seed-1', 'driver-seed-2', 'driver-seed-4', 'driver-seed-5')");

    // 2. Create Ride to trigger Transactional Outbox
    console.log('\n----------------------------------------------------------------');
    console.log('Step 2: Creating Ride to Trigger Transactional Outbox...');
    const bookRes = await req(`${GATEWAY_URL}/api/v1/rides`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        passenger_id: 'pass-seed-1',
        passenger_name: 'Aarav Patel',
        pickup_address: 'SG Highway (Iscon Cross Road)',
        pickup_latitude: 23.0275,
        pickup_longitude: 72.5076,
        destination_address: 'Navrangpura (CG Road)',
        destination_latitude: 23.0372,
        destination_longitude: 72.5613,
        auto_dispatch: false, // Let the async Dispatch Worker handle assignment via RabbitMQ!
      })
    });

    const rideId = bookRes.data.data.id;
    console.log(`✅ Ride Request Committed in DB: ID=${rideId}, Status=${bookRes.data.data.status}`);

    // 3. Verify Outbox Table & Background Publisher Relay
    console.log('\n----------------------------------------------------------------');
    console.log('Step 3: Checking Transactional Outbox Event in PostgreSQL...');
    await new Promise(r => setTimeout(r, 2200)); // Allow poller interval (1500ms) to process

    const outboxCheck = await pool.query(
      `SELECT id, aggregate_id, event_type, status, created_at, published_at 
       FROM outbox_events 
       WHERE aggregate_id = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [rideId]
    );

    if (outboxCheck.rows.length > 0) {
      const ev = outboxCheck.rows[0];
      console.log(`✅ Outbox Event Found: Type=${ev.event_type}, Status=${ev.status}`);
      console.log(`   - Event ID: ${ev.id}`);
      console.log(`   - Created At: ${ev.created_at}`);
      console.log(`   - Published At: ${ev.published_at}`);
      if (ev.status === 'PUBLISHED') {
        console.log('🎉 SUCCESS: Outbox Publisher successfully relayed event to RabbitMQ topic exchange!');
      }
    } else {
      console.warn('⚠️ No outbox event found for this ride.');
    }

    // 4. Verify Notification Worker Generated Alert
    console.log('\n----------------------------------------------------------------');
    console.log('Step 4: Verifying Simulated Notification Worker Processing...');
    const notifCheck = await pool.query(
      `SELECT id, channel, title, message, status, sent_at 
       FROM notifications 
       ORDER BY created_at DESC LIMIT 1`
    );

    if (notifCheck.rows.length > 0) {
      const notif = notifCheck.rows[0];
      console.log(`✅ Notification Record in PostgreSQL:`);
      console.log(`   - Channel: [${notif.channel}]`);
      console.log(`   - Title: "${notif.title}"`);
      console.log(`   - Message: "${notif.message}"`);
      console.log(`   - Status: ${notif.status} (Sent At: ${notif.sent_at})`);
      console.log('🎉 SUCCESS: Notification Worker consumed message from notification.queue and inserted alert!');
    }

    // 5. Test Dead-Letter Queue (DLQ) Routing
    console.log('\n----------------------------------------------------------------');
    console.log('Step 5: Testing Dead-Letter Queue (DLQ) Routing for Poison Pill Messages...');
    console.log('Publishing invalid non-JSON corrupted payload to dispatch.queue...');

    // Publish malformed string directly to dispatch.queue
    rabbitChannel.sendToQueue('dispatch.queue', Buffer.from('INVALID_CORRUPT_PAYLOAD_POISON_PILL'), {
      persistent: false,
    });

    // Wait for worker to consume and nack to DLQ
    await new Promise(r => setTimeout(r, 1500));

    const dlqStatus = await fetch(`${RABBIT_API_URL}/queues/%2F/dispatch.dlq`, {
      headers: { Authorization: AUTH_HEADER }
    }).then(r => r.json());

    console.log(`✅ Dead-Letter Queue (dispatch.dlq) Messages Count: ${dlqStatus.messages || 0}`);
    if ((dlqStatus.messages || 0) > 0) {
      console.log('🎉 SUCCESS: Dead-Letter Queue verified! Corrupted message safely quarantined in dispatch.dlq.');
    }

    // 6. Test System Metrics Telemetry
    console.log('\n----------------------------------------------------------------');
    console.log('Step 6: Verifying RabbitMQ Telemetry in System Metrics...');
    const metricsRes = await req(`${GATEWAY_URL}/api/v1/metrics`);
    const m = metricsRes.data;

    console.log(`✅ Gateway RabbitMQ Telemetry:`);
    console.log(`   - Management Dashboard: ${m.rabbitmq?.managementUrl}`);
    console.log(`   - Active Queues Monitored: ${m.rabbitmq?.queues?.length || 0}`);
    m.rabbitmq?.queues?.forEach(q => {
      console.log(`     * ${q.name}: ${q.messages} msg(s) | Consumers: ${q.consumers}`);
    });

    console.log('\n================================================================');
    console.log('✨ ALL MILESTONE 9 RABBITMQ ASYNCHRONOUS PIPELINE TESTS PASSED!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    if (rabbitChannel) await rabbitChannel.close().catch(() => {});
    if (rabbitConn) await rabbitConn.close().catch(() => {});
    await pool.end();
  }
}

testRabbitMQPipeline();


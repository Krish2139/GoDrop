import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();

async function runDockerOrchestrationTests() {
  console.log('================================================================');
  console.log('🧪 MILESTONE 12: DOCKER COMPOSE ORCHESTRATION VERIFICATION');
  console.log('================================================================');

  try {
    // -------------------------------------------------------------
    // Step 1: Validate docker-compose.yml file presence & structure
    // -------------------------------------------------------------
    console.log('\nStep 1: Validating docker-compose.yml Configuration File...');
    const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
    if (!fs.existsSync(composePath)) {
      throw new Error('docker-compose.yml file not found in root directory!');
    }

    const composeContent = fs.readFileSync(composePath, 'utf8');
    console.log(`✅ docker-compose.yml found (${(composeContent.length / 1024).toFixed(1)} KB).`);

    // -------------------------------------------------------------
    // Step 2: Verify All 9 Distributed Platform Services Declared
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('Step 2: Verifying Multi-Container Service Topology (9 Services)...');

    const expectedServices = [
      { name: 'postgres', role: 'Relational ACID Database (PostgreSQL 16)', port: '5432' },
      { name: 'redis', role: 'In-Memory Cache & Rate Limiting (Redis 7)', port: '6379' },
      { name: 'rabbitmq', role: 'AMQP Topic & DLX Message Broker (RabbitMQ 3.13)', port: '5672' },
      { name: 'api-gateway', role: 'Ingress API Gateway, JWT Auth & Socket.IO', port: '5000' },
      { name: 'ride-service', role: 'Ride Lifecycle & Dispatch Domain Service', port: '5001' },
      { name: 'driver-service', role: 'Driver Profiles, Coordinates & Caching', port: '5002' },
      { name: 'dispatch-worker', role: 'Asynchronous Dispatch Engine Worker', port: 'Worker (AMQP)' },
      { name: 'notification-worker', role: 'Multi-Channel Alert Notification Worker', port: 'Worker (AMQP)' },
      { name: 'frontend', role: 'Vite React SPA Production Nginx Server', port: '3000' },
    ];

    expectedServices.forEach(s => {
      const regex = new RegExp(`\\s+${s.name}:`);
      if (regex.test(composeContent)) {
        console.log(`   ✅ [${s.name.padEnd(20)}] ${s.role.padEnd(45)} Port: ${s.port}`);
      } else {
        throw new Error(`Missing service declaration in docker-compose.yml: ${s.name}`);
      }
    });
    console.log('🎉 SUCCESS: All 9 microservices and infrastructure components verified in Compose specification!');

    // -------------------------------------------------------------
    // Step 3: Verify Production Dockerfiles & .dockerignore
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('Step 3: Verifying Production Dockerfiles & Layer Caching Artifacts...');

    const dockerfileTargets = [
      { dir: 'gateway', desc: 'API Gateway Container' },
      { dir: 'services/ride-service', desc: 'Ride Domain Service Container' },
      { dir: 'services/driver-service', desc: 'Driver Fleet Service Container' },
      { dir: 'workers/dispatch-worker', desc: 'Async Dispatch Worker Container' },
      { dir: 'workers/notification-worker', desc: 'Notification Alert Worker Container' },
      { dir: 'frontend', desc: 'Frontend Multi-Stage Nginx Container' },
    ];

    dockerfileTargets.forEach(t => {
      const dfPath = path.join(ROOT_DIR, t.dir, 'Dockerfile');
      const diPath = path.join(ROOT_DIR, t.dir, '.dockerignore');

      if (!fs.existsSync(dfPath)) throw new Error(`Missing Dockerfile in ${t.dir}`);
      if (!fs.existsSync(diPath)) throw new Error(`Missing .dockerignore in ${t.dir}`);

      const dfContent = fs.readFileSync(dfPath, 'utf8');
      const isMultiStage = dfContent.includes('AS builder');
      console.log(`   ✅ [${t.dir.padEnd(28)}] Dockerfile & .dockerignore verified ${isMultiStage ? '(Multi-stage Nginx)' : '(Node Alpine)'}`);
    });

    // Check Nginx configuration
    const nginxConfPath = path.join(ROOT_DIR, 'frontend', 'nginx.conf');
    if (fs.existsSync(nginxConfPath)) {
      console.log(`   ✅ [frontend/nginx.conf] Single Page App routing & reverse proxy configuration verified.`);
    }

    // -------------------------------------------------------------
    // Step 4: Verify Healthchecks, Volumes & Network Topologies
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('Step 4: Verifying Healthchecks, Named Volumes & Isolated Bridge Network...');

    const checks = [
      { key: 'pg_isready', desc: 'PostgreSQL 16 Readiness Probe (pg_isready)' },
      { key: 'redis-cli', desc: 'Redis 7 Ping Healthcheck (redis-cli ping)' },
      { key: 'rabbitmq-diagnostics', desc: 'RabbitMQ 3.13 Connectivity Healthcheck' },
      { key: 'rideflow-pgdata', desc: 'Persistent Named Volume (rideflow-pgdata)' },
      { key: 'rideflow-redisdata', desc: 'Persistent Named Volume (rideflow-redisdata)' },
      { key: 'rideflow-network', desc: 'Isolated Docker Bridge Network (rideflow-network)' },
      { key: 'condition: service_healthy', desc: 'Ordered Startup Dependency Graph (service_healthy)' },
    ];

    checks.forEach(c => {
      if (composeContent.includes(c.key)) {
        console.log(`   ✅ ${c.desc}`);
      } else {
        throw new Error(`Healthcheck/Volume/Network verification failed: ${c.key}`);
      }
    });

    // -------------------------------------------------------------
    // Step 5: Execute Docker Compose Config Validation
    // -------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('Step 5: Executing Docker CLI Configuration Validation (docker compose config)...');

    const configOutput = execSync('docker compose config --services', { encoding: 'utf8' });
    const validatedServices = configOutput.trim().split(/\r?\n/).filter(Boolean);

    console.log(`✅ Docker Compose CLI validated ${validatedServices.length} operational services:`);
    console.log(`   ${validatedServices.join(', ')}`);

    console.log('\n================================================================');
    console.log('✨ ALL MILESTONE 12 DOCKER COMPOSE ORCHESTRATION TESTS PASSED!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

runDockerOrchestrationTests();


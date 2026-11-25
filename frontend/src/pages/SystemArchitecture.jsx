import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Zap,
  ShieldCheck,
  Gauge,
  Server,
  Clock
} from 'lucide-react';
import apiClient from '../api/client';
import './SystemArchitecture.css';

const LOAD_TEST_MATRIX = [
  {
    scenario: '1. Normal Volume (Ingress & Health)',
    script: 'tests/k6/gateway-ingress.js',
    inboundLoad: '50 concurrent VUs (25s)',
    measuredRps: '315.1 RPS',
    avgLatency: '38.4 ms',
    p95Behavior: '115.0 ms (p99: 154 ms)',
    result: 'PASS (100% 200 OK)',
  },
  {
    scenario: '2. Geospatial Driver Discovery',
    script: 'tests/k6/geospatial-dispatch.js',
    inboundLoad: '35 concurrent VUs (16s)',
    measuredRps: '132.7 RPS',
    avgLatency: '46.2 ms',
    p95Behavior: '135.0 ms (Haversine + Cache)',
    result: 'PASS (0% Failures)',
  },
  {
    scenario: '3. Token Bucket Rate Limiter',
    script: 'tests/k6/rate-limiter-stress.js',
    inboundLoad: '150 req/s flood (10s)',
    measuredRps: 'Rate Limited',
    avgLatency: '429 Blocked',
    p95Behavior: 'Retry-After / Lua Atomic',
    result: 'PASS (1,351 HTTP 429, 0x 500)',
  },
  {
    scenario: '4. Concurrent Passenger Booking',
    script: 'tests/k6/concurrent-booking.js',
    inboundLoad: '25 concurrent VUs (16s)',
    measuredRps: '1,325 rides',
    avgLatency: '19.6 ms',
    p95Behavior: '38.0 ms (Atomic Row Locks)',
    result: 'PASS (0% Failures)',
  },
  {
    scenario: '5. Cache Hit vs Miss Acceleration',
    script: 'Redis /api/v1/drivers/nearby',
    inboundLoad: 'Cold / Hot Read Mix',
    measuredRps: '132.7+ RPS',
    avgLatency: 'Sub-10 ms (Hit)',
    p95Behavior: 'Automated TTL + Invalidation',
    result: 'PASS (Redis Cache Active)',
  },
  {
    scenario: '6. Circuit Breaker Fallback',
    script: 'POST /api/v1/chaos/inject',
    inboundLoad: 'Fault-injected burst (≥ 3 errs)',
    measuredRps: 'Fast-Fail',
    avgLatency: 'Instant 503 / Cache',
    p95Behavior: 'Retry-After: 4s | REDIS_CACHE',
    result: 'PASS (Circuit Tripped OPEN)',
  },
  {
    scenario: '7. Worker Queue & Outbox Relay',
    script: 'RabbitMQ dispatch.queue',
    inboundLoad: 'Async Ride Dispatch Jobs',
    measuredRps: 'Job Queue',
    avgLatency: '100% Relayed',
    p95Behavior: 'Asynchronous DB + DLQ Isolation',
    result: 'PASS (Idempotent Delivery)',
  },
  {
    scenario: '8. Full Academic Suite & Recovery',
    script: 'tests/k6/suite.js + chaos/reset',
    inboundLoad: '35 VUs combined (18s)',
    measuredRps: '222.3 RPS',
    avgLatency: '31.8 ms',
    p95Behavior: '70.4 ms | Zero Dropouts',
    result: 'PASS (100% Recovered)',
  },
];

const SystemArchitecture = () => {
  const [healthData, setHealthData] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [chaosData, setChaosData] = useState(null);
  const [probeLatencyMs, setProbeLatencyMs] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [healthError, setHealthError] = useState(null);

  const [burstRunning, setBurstRunning] = useState(false);
  const [burstResult, setBurstResult] = useState(null);

  const fetchLiveHealthMatrix = useCallback(async () => {
    setLoadingHealth(true);
    setHealthError(null);
    const started = performance.now();
    try {
      const [healthRes, metricsRes, chaosRes] = await Promise.all([
        apiClient.get('/health/services'),
        apiClient.get('/metrics'),
        apiClient.get('/chaos/status'),
      ]);
      const elapsed = Math.round(performance.now() - started);
      setProbeLatencyMs(elapsed);
      setHealthData(healthRes.data);
      setMetricsData(metricsRes.data);
      setChaosData(chaosRes.data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setHealthError(err.response?.data?.message || err.message || 'Unable to reach API Gateway (:5000)');
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveHealthMatrix();
  }, [fetchLiveHealthMatrix]);

  const runLiveBurstTest = async () => {
    if (burstRunning) return;
    setBurstRunning(true);
    try {
      const totalRequests = 30;
      const startTime = performance.now();
      const latencies = [];
      let successCount = 0;
      let rateLimitedCount = 0;

      const requests = Array.from({ length: totalRequests }, async (_, idx) => {
        const reqStart = performance.now();
        const endpoint = idx % 2 === 0
          ? '/health'
          : '/drivers/nearby?lat=23.0275&lng=72.5076&radius=15';
        try {
          const res = await apiClient.get(endpoint);
          if (res.status >= 200 && res.status < 300) successCount++;
        } catch (err) {
          if (err.response?.status === 429) rateLimitedCount++;
        } finally {
          latencies.push(performance.now() - reqStart);
        }
      });

      await Promise.all(requests);
      const totalElapsedSec = Math.max((performance.now() - startTime) / 1000, 0.001);
      const sorted = [...latencies].sort((a, b) => a - b);
      const avgMs = latencies.reduce((acc, v) => acc + v, 0) / latencies.length;
      const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));

      setBurstResult({
        totalRequests,
        successCount,
        rateLimitedCount,
        rps: (totalRequests / totalElapsedSec).toFixed(1),
        avgMs: avgMs.toFixed(1),
        p95Ms: sorted[p95Index].toFixed(1),
        ranAt: new Date().toLocaleTimeString(),
      });

      fetchLiveHealthMatrix();
    } finally {
      setBurstRunning(false);
    }
  };

  const rideSvc = healthData?.services?.rideService;
  const drvSvc = healthData?.services?.driverService;
  const rideBreakerState = chaosData?.circuitBreakers?.rideService?.state || metricsData?.circuitBreakers?.rideService?.state || 'UNKNOWN';
  const drvBreakerState = chaosData?.circuitBreakers?.driverService?.state || metricsData?.circuitBreakers?.driverService?.state || 'UNKNOWN';

  const renderStatusPill = (status) => {
    const normalized = (status || '').toUpperCase();
    if (['UP', 'HEALTHY', 'CLOSED', 'CONNECTED', 'PASS'].includes(normalized)) {
      return (
        <span className="status-pill pass">
          <CheckCircle2 size={13} /> PASS ({normalized})
        </span>
      );
    }
    if (['HALF-OPEN', 'DEGRADED'].includes(normalized)) {
      return (
        <span className="status-pill warn">
          <AlertTriangle size={13} /> {normalized}
        </span>
      );
    }
    return (
      <span className="status-pill fail">
        <XCircle size={13} /> {normalized || 'OFFLINE'}
      </span>
    );
  };

  const healthRows = [
    {
      name: 'API Gateway Perimeter',
      target: 'GET /api/v1/health (:5000)',
      telemetry: metricsData
        ? `${metricsData.gateway?.totalRequests ?? 0} total reqs (2xx: ${metricsData.gateway?.statusBreakdown?.['2xx'] ?? 0}, 4xx: ${metricsData.gateway?.statusBreakdown?.['4xx'] ?? 0}, 5xx: ${metricsData.gateway?.statusBreakdown?.['5xx'] ?? 0})`
        : 'Awaiting telemetry...',
      latency: probeLatencyMs !== null ? `${probeLatencyMs} ms` : '—',
      sla: 'Uptime > 99.9%, 0 unhandled 5xx',
      status: healthData?.gateway?.status || (healthError ? 'DOWN' : 'LOADING'),
    },
    {
      name: 'Ride Service & PostgreSQL Outbox',
      target: 'GET :5001/health',
      telemetry: rideSvc?.details
        ? `Uptime ${Math.floor(rideSvc.details.uptime || 0)}s | Outbox Relayed: ${rideSvc.details.rabbitmq?.outboxRelayed ?? 0}`
        : 'Unavailable',
      latency: probeLatencyMs !== null ? `${probeLatencyMs} ms` : '—',
      sla: 'ACID TX + State Machine Enforced',
      status: rideSvc?.status || 'DOWN',
    },
    {
      name: 'Driver Service & Spatial Index',
      target: 'GET :5002/health',
      telemetry: drvSvc?.details
        ? `Uptime ${Math.floor(drvSvc.details.uptime || 0)}s | Cache Hit Rate: ${drvSvc.details.redis?.cacheMetrics?.hitRate || '0%'}`
        : 'Unavailable',
      latency: probeLatencyMs !== null ? `${probeLatencyMs} ms` : '—',
      sla: '25km Haversine Fleet Lookup',
      status: drvSvc?.status || 'DOWN',
    },
    {
      name: 'Redis Cache & Token Bucket',
      target: 'Redis 7 (:6379)',
      telemetry: metricsData?.redis
        ? `Mem: ${metricsData.redis.memoryUsed} | Checked: ${metricsData.rateLimiter?.totalChecked ?? 0} | 429 Blocked: ${metricsData.rateLimiter?.exceededCount429 ?? 0}`
        : 'Unavailable',
      latency: '< 5 ms in-memory',
      sla: '300 cap / 25 tokens/sec + TTL Cache',
      status: metricsData?.redis?.connected ? 'CONNECTED' : 'DEGRADED',
    },
    {
      name: 'RabbitMQ Async Broker',
      target: 'AMQP :5672 / UI :15672',
      telemetry: rideSvc?.details?.rabbitmq
        ? `${rideSvc.details.rabbitmq.broker} | Published: ${rideSvc.details.rabbitmq.publishedCount ?? 0}`
        : 'Unavailable',
      latency: 'Async Event Bus',
      sla: 'Durable dispatch.queue + DLQ',
      status: (metricsData?.rabbitmq?.connected || rideSvc?.details?.rabbitmq?.connected) ? 'CONNECTED' : 'DOWN',
    },
    {
      name: 'Opossum Circuit Breakers',
      target: 'GET /api/v1/chaos/status',
      telemetry: `RideBreaker: ${rideBreakerState} | DriverBreaker: ${drvBreakerState} | Chaos Active: ${chaosData?.chaosState?.active ? 'YES' : 'NO'}`,
      latency: '3,000 ms timeout / 4,000 ms reset',
      sla: '50% Err Threshold → Fast-Fail Fallback',
      status: (rideBreakerState === 'CLOSED' && drvBreakerState === 'CLOSED') ? 'CLOSED' : 'DEGRADED',
    },
    {
      name: 'Socket.IO Real-Time Bus',
      target: 'WebSocket :5000',
      telemetry: metricsData?.socketio
        ? `Live Clients: ${metricsData.socketio.connectedClients} | Total Served: ${metricsData.socketio.totalConnectionsServed} | Emitted: ${metricsData.socketio.eventsEmitted}`
        : 'Unavailable',
      latency: '3s GPS Telemetry Stream',
      sla: 'Passenger / Driver / Admin Rooms',
      status: metricsData?.socketio?.enabled ? 'CONNECTED' : 'DOWN',
    },
  ];

  return (
    <div className="container arch-page">
      <div className="arch-page-header">
        <div>
          <h1 className="arch-page-title">
            Distributed System Architecture, Health & Load Matrices
          </h1>
          <p className="arch-page-subtitle">
            Live microservice health probes, Opossum circuit breaker telemetry, and Grafana k6 concurrency
            benchmark results across the API Gateway, Redis Cache, RabbitMQ Workers, and PostgreSQL cluster.
          </p>
        </div>

        <div className="arch-header-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={fetchLiveHealthMatrix}
            disabled={loadingHealth}
          >
            <RefreshCw size={16} className={loadingHealth ? 'spin' : ''} />
            <span>{loadingHealth ? 'Probing Stack...' : 'Refresh Health Matrix'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={runLiveBurstTest}
            disabled={burstRunning}
          >
            <Zap size={16} />
            <span>{burstRunning ? 'Running 30-Req Burst...' : 'Run Live Load Burst'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: LIVE HEALTH TEST MATRIX */}
      <section className="matrix-section">
        <div className="matrix-header-row">
          <div>
            <h2 className="matrix-title">
              <Activity size={22} color="#0C6CF6" />
              <span>1. Live System Health & Resilience Test Matrix</span>
            </h2>
            <p className="matrix-desc">
              Real-time probe against <code>/api/v1/health/services</code>, <code>/api/v1/metrics</code>, and <code>/api/v1/chaos/status</code>
              {lastChecked ? ` • Last verified at ${lastChecked}` : ''}.
            </p>
          </div>
          {renderStatusPill(healthData?.status || (healthError ? 'DOWN' : 'UP'))}
        </div>

        {healthError && (
          <div className="auth-alert alert-error" style={{ marginBottom: '1rem' }}>
            <AlertTriangle size={18} />
            <span>{healthError}</span>
          </div>
        )}

        <div className="health-kpi-grid">
          <div className="health-kpi-card">
            <span className="health-kpi-label">Cluster Health</span>
            <span className="health-kpi-value">
              <Server size={18} color="#10B981" />
              {healthData?.status || (loadingHealth ? 'Checking...' : 'DEGRADED')}
            </span>
            <span className="health-kpi-sub">Gateway + Ride + Driver</span>
          </div>

          <div className="health-kpi-card">
            <span className="health-kpi-label">Circuit Breakers</span>
            <span className="health-kpi-value">
              <ShieldCheck size={18} color="#0C6CF6" />
              {rideBreakerState} / {drvBreakerState}
            </span>
            <span className="health-kpi-sub">Opossum Fast-Fail Guard</span>
          </div>

          <div className="health-kpi-card">
            <span className="health-kpi-label">Redis Cache Hit Rate</span>
            <span className="health-kpi-value">
              <Gauge size={18} color="#F59E0B" />
              {rideSvc?.details?.redis?.cacheMetrics?.hitRate || '—'} / {drvSvc?.details?.redis?.cacheMetrics?.hitRate || '—'}
            </span>
            <span className="health-kpi-sub">Ride / Driver Cache Efficiency</span>
          </div>

          <div className="health-kpi-card">
            <span className="health-kpi-label">Probe Round-Trip</span>
            <span className="health-kpi-value">
              <Clock size={18} color="#6366F1" />
              {probeLatencyMs !== null ? `${probeLatencyMs} ms` : '—'}
            </span>
            <span className="health-kpi-sub">
              {metricsData?.gateway?.totalRequests ?? 0} total requests served
            </span>
          </div>
        </div>

        <div className="matrix-table-wrap">
          <table className="health-matrix-table">
            <thead>
              <tr>
                <th>Subsystem / Health Check</th>
                <th>Target / Port</th>
                <th>Live Measured Telemetry</th>
                <th>SLA / Latency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {healthRows.map((row) => (
                <tr key={row.name}>
                  <td style={{ fontWeight: 700, color: 'var(--slate-900)' }}>{row.name}</td>
                  <td><span className="mono-text">{row.target}</span></td>
                  <td style={{ color: 'var(--slate-700)' }}>{row.telemetry}</td>
                  <td style={{ color: 'var(--slate-600)' }}>
                    <div style={{ fontWeight: 600 }}>{row.latency}</div>
                    <div style={{ fontSize: '0.75rem' }}>{row.sla}</div>
                  </td>
                  <td>{renderStatusPill(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 2: CONCURRENT LOAD TEST MATRIX (REFERENCE LAYOUT) */}
      <section className="matrix-section-dark">
        <div className="matrix-header-row">
          <div>
            <h2 className="matrix-title">
              <Gauge size={22} color="#0C6CF6" />
              <span>2. Concurrent Load Testing Benchmark Results (Load Test Matrix)</span>
            </h2>
            <p className="matrix-desc">
              Benchmarked using Grafana k6 suites (<code>tests/k6/*</code>) and Opossum Chaos fault-injection scenarios across production-like traffic spikes.
            </p>
          </div>
        </div>

        {burstResult && (
          <div className="live-burst-banner">
            <div>
              <strong style={{ color: '#047857', display: 'block', marginBottom: '0.2rem' }}>
                Live Browser Burst Test Completed ({burstResult.ranAt})
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--slate-600)' }}>
                Fired {burstResult.totalRequests} concurrent read requests against <code>/health</code> and <code>/api/v1/drivers/nearby</code>
              </span>
            </div>
            <div className="live-burst-metrics">
              <span>Throughput: <strong>{burstResult.rps} RPS</strong></span>
              <span>Avg Latency: <strong>{burstResult.avgMs} ms</strong></span>
              <span>p95 Latency: <strong>{burstResult.p95Ms} ms</strong></span>
              <span>Succeeded: <strong>{burstResult.successCount}/{burstResult.totalRequests}</strong></span>
              {burstResult.rateLimitedCount > 0 && (
                <span>429 Throttled: <strong>{burstResult.rateLimitedCount}</strong></span>
              )}
            </div>
          </div>
        )}

        <div className="matrix-table-wrap">
          <table className="load-matrix-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Inbound Load</th>
                <th>Measured RPS</th>
                <th>Avg Latency</th>
                <th>p95 Latency / Behavior</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {LOAD_TEST_MATRIX.map((row) => (
                <tr key={row.scenario}>
                  <td className="load-scenario-cell">
                    <div>{row.scenario}</div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 400, color: 'var(--slate-500)', marginTop: '0.2rem' }}>
                      {row.script}
                    </div>
                  </td>
                  <td>{row.inboundLoad}</td>
                  <td>{row.measuredRps}</td>
                  <td>{row.avgLatency}</td>
                  <td>
                    <span className="load-code-pill">{row.p95Behavior}</span>
                  </td>
                  <td className="load-pass-cell">{row.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default SystemArchitecture;

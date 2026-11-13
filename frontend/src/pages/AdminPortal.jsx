import React from 'react';
import { ShieldCheck, Activity, Server, Radio, Database, Clock } from 'lucide-react';

const AdminPortal = () => {
  return (
    <div className="container" style={{ padding: '2.5rem 1.5rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '2rem',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '1.25rem'
      }}>
        <div>
          <div className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Module C</div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--slate-900)' }}>
            Admin Monitoring & Operations Center
          </h1>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.95rem' }}>
            Inspect system health, active rides, Redis cache hit rates, RabbitMQ queues, and driver allocations.
          </p>
        </div>
        <div className="badge badge-warning">
          <Clock size={14} /> Scheduled for Milestone 5 & 11
        </div>
      </div>

      <div className="card" style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center', padding: '3rem 2rem' }}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary-50)',
          color: 'var(--primary-700)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto'
        }}>
          <ShieldCheck size={32} />
        </div>
        <h3 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--slate-900)' }}>
          Telemetry & Operational Dashboard
        </h3>
        <p style={{ color: 'var(--slate-600)', lineHeight: '1.6', marginBottom: '1.5rem', fontSize: '0.925rem' }}>
          Provides centralized administrative visibility into distributed services: 
          active ride states, driver inventory, RabbitMQ dead-letter queues, Redis rate limit consumption, 
          and circuit breaker health status.
        </p>

        <div style={{
          background: 'var(--slate-50)',
          border: '1px solid var(--slate-200)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          textAlign: 'left',
          fontSize: '0.85rem',
          color: 'var(--slate-600)',
          marginBottom: '1.5rem'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--slate-800)', marginBottom: '0.4rem' }}>
            System Metrics Overview:
          </div>
          <div>✓ API Gateway Health Probes: <code>/health</code> & <code>/health/services</code></div>
          <div>✓ RabbitMQ Queue Depth & Dispatch Worker Concurrency</div>
          <div>✓ Redis Cache Hit/Miss Statistics & Token Bucket Limits</div>
          <div>✓ Opossum Circuit Breaker State (CLOSED / OPEN / HALF-OPEN)</div>
        </div>
      </div>
    </div>
  );
};

export default AdminPortal;


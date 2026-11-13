import React from 'react';
import { 
  Layers, 
  Database, 
  Radio, 
  Cpu, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  GitMerge, 
  Activity 
} from 'lucide-react';
import ArchitectureBanner from '../components/ArchitectureBanner';

const SystemArchitecture = () => {
  return (
    <div className="container" style={{ padding: '2.5rem 1.5rem' }}>
      <div style={{ marginBottom: '2.5rem' }}>
        <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Academic System Design Document</span>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--slate-900)', marginBottom: '0.75rem' }}>
          Distributed System Architecture & Design
        </h1>
        <p style={{ color: 'var(--slate-600)', fontSize: '1.05rem', maxWidth: '850px', lineHeight: '1.6' }}>
          RideFlow is architected as an asynchronous, distributed event-driven microservice system 
          designed to satisfy high concurrency, non-blocking I/O, atomic transactions, and fault isolation.
        </p>
      </div>

      <ArchitectureBanner />

      {/* Ride State Lifecycle Section */}
      <div className="card" style={{ marginBottom: '2rem', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--slate-900)', marginBottom: '1rem' }}>
          Ride Lifecycle State Machine
        </h2>
        <p style={{ color: 'var(--slate-600)', fontSize: '0.925rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          To prevent race conditions, illegal skips, and data corruption, every ride follows a strictly validated, 
          unidirectional state machine enforced by PostgreSQL checks and Express domain validation:
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          background: 'var(--slate-50)',
          padding: '1.25rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--slate-200)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem'
        }}>
          <span className="badge badge-neutral">REQUESTED</span>
          <span>→</span>
          <span className="badge badge-info">PENDING</span>
          <span>→</span>
          <span className="badge badge-warning">DRIVER_ASSIGNED</span>
          <span>→</span>
          <span className="badge badge-info">DRIVER_ACCEPTED</span>
          <span>→</span>
          <span className="badge badge-info">DRIVER_ARRIVED</span>
          <span>→</span>
          <span className="badge badge-info">IN_PROGRESS</span>
          <span>→</span>
          <span className="badge badge-success">COMPLETED</span>
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--slate-500)' }}>
          * Ride cancellation is supported exclusively from <code>REQUESTED</code>, <code>PENDING</code>, or <code>DRIVER_ASSIGNED</code> states.
        </div>
      </div>

      {/* Concurrency & Distributed Consistency */}
      <div className="grid grid-cols-2" style={{ gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--slate-900)', marginBottom: '0.75rem' }}>
            Concurrency & Atomic Locking
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--slate-600)', lineHeight: '1.6', marginBottom: '1rem' }}>
            When hundreds of ride requests hit the dispatch engine simultaneously, double-booking an available driver is a classic distributed hazard.
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--slate-700)' }}>
              <CheckCircle2 size={16} color="#10B981" />
              <span><b>PostgreSQL Row Locks:</b> Conditional updates ensure only one worker claims a driver.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--slate-700)' }}>
              <CheckCircle2 size={16} color="#10B981" />
              <span><b>State Invariance:</b> Driver availability flips atomically from <code>AVAILABLE</code> to <code>RESERVED</code>.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--slate-700)' }}>
              <CheckCircle2 size={16} color="#10B981" />
              <span><b>Idempotent Keys:</b> Prevents duplicate ride submissions from creating redundant records.</span>
            </li>
          </ul>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--slate-900)', marginBottom: '0.75rem' }}>
            Resilience & Fault Isolation
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--slate-600)', lineHeight: '1.6', marginBottom: '1rem' }}>
            Ensuring high availability even when auxiliary components (Redis, background workers) experience transient network lag.
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--slate-700)' }}>
              <CheckCircle2 size={16} color="#10B981" />
              <span><b>Circuit Breaker (Opossum):</b> Isolates slow or failing downstream microservices.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--slate-700)' }}>
              <CheckCircle2 size={16} color="#10B981" />
              <span><b>RabbitMQ DLQ:</b> Unprocessable dispatch messages land in Dead-Letter Queues for diagnosis.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--slate-700)' }}>
              <CheckCircle2 size={16} color="#10B981" />
              <span><b>Redis Graceful Fallback:</b> Bypasses cache directly to Postgres if Redis is unreachable.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SystemArchitecture;

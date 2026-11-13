import React, { useState } from 'react';
import { 
  Server, 
  Database, 
  Radio, 
  Cpu, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  CheckCircle2, 
  Info 
} from 'lucide-react';
import './ArchitectureBanner.css';

const ArchitectureBanner = () => {
  const [activeComponent, setActiveComponent] = useState('gateway');

  const components = {
    gateway: {
      name: 'Express API Gateway',
      port: ':5000',
      role: 'Unified Gateway & Security Perimeter',
      details: 'Handles JWT authorization, Zod schema validation, Redis-backed distributed rate limiting (Token Bucket), request correlation IDs, and circuit breaker fallback via Opossum.',
      features: ['Centralized Routing', 'Distributed Rate Limiting (HTTP 429)', 'Structured Pino Logging', 'Circuit Breaker Protection']
    },
    services: {
      name: 'Ride & Driver Microservices',
      port: ':5001 & :5002',
      role: 'Core Domain Services',
      details: 'Independent Express services handling ride state machine transitions and driver profile/GPS updates. Outbox pattern safely writes events inside PostgreSQL transactions.',
      features: ['Ride Lifecycle State Machine', 'Simulated GPS Coordinate Tracking', 'Transactional Outbox Pattern', 'Non-blocking REST APIs']
    },
    postgres: {
      name: 'PostgreSQL Database',
      port: ':5432',
      role: 'Authoritative Relational Store',
      details: 'Strict source of truth enforcing ACID transactions, row-level locks (SELECT FOR UPDATE) to eliminate race conditions, foreign keys, and SQL migration versioning.',
      features: ['Concurrency-Safe Locking', 'Strict State Transition Checks', 'Outbox & Notifications Tables', 'Indexed Haversine Lookup']
    },
    redis: {
      name: 'Redis Cache & Rate Limiter',
      port: ':6379',
      role: 'In-Memory Acceleration Layer',
      details: 'Maintains distributed rate-limit counters, caches frequent read queries with TTL and automated invalidation, and tracks real-time driver coordinates for accelerated candidate filtering.',
      features: ['Token Bucket Counter', 'Cache Hit/Miss Metrics', 'Fast Geospatial Lookups', 'Graceful Degradation Fallback']
    },
    rabbitmq: {
      name: 'RabbitMQ Message Broker',
      port: ':5672',
      role: 'Asynchronous Event Bus',
      details: 'Guarantees resilient message transport between services and background workers using durable queues, consumer manual acknowledgements, dead-letter exchanges (DLX), and exponential retry.',
      features: ['Durable Dispatch Queues', 'Dead-Letter Queues (DLQ)', 'Idempotent Delivery Keys', 'At-Least-Once Delivery']
    },
    workers: {
      name: 'Background Workers',
      port: 'Async Processes',
      role: 'Dispatch & Notification Engines',
      details: 'Dispatch Worker calculates Haversine distances to rank eligible drivers and executes atomic DB reservations. Notification Worker processes async delivery events with retry mechanisms.',
      features: ['Haversine Formula Ranking', 'Atomic Driver Reservation', 'Simulated Push Alerts', 'Automatic Timeout Recovery']
    }
  };

  const current = components[activeComponent];

  return (
    <div className="arch-banner-card">
      <div className="arch-banner-header">
        <div className="arch-header-text">
          <span className="arch-badge">Distributed System Architecture</span>
          <h3 className="arch-title">Interactive Topology & Component Blueprint</h3>
          <p className="arch-subtitle">
            Click on any architectural subsystem to inspect its design specifications and fault-tolerance guarantees.
          </p>
        </div>
      </div>

      {/* Visual Component Pipeline */}
      <div className="arch-pipeline">
        <button 
          className={`pipeline-node ${activeComponent === 'gateway' ? 'active' : ''}`}
          onClick={() => setActiveComponent('gateway')}
        >
          <Server size={20} />
          <span className="node-title">API Gateway</span>
          <span className="node-port">:5000</span>
        </button>

        <div className="pipeline-arrow"><ArrowRight size={18} /></div>

        <button 
          className={`pipeline-node ${activeComponent === 'services' ? 'active' : ''}`}
          onClick={() => setActiveComponent('services')}
        >
          <Cpu size={20} />
          <span className="node-title">Microservices</span>
          <span className="node-port">:5001 / :5002</span>
        </button>

        <div className="pipeline-arrow"><ArrowRight size={18} /></div>

        <button 
          className={`pipeline-node ${activeComponent === 'rabbitmq' ? 'active' : ''}`}
          onClick={() => setActiveComponent('rabbitmq')}
        >
          <Radio size={20} />
          <span className="node-title">RabbitMQ</span>
          <span className="node-port">:5672</span>
        </button>

        <div className="pipeline-arrow"><ArrowRight size={18} /></div>

        <button 
          className={`pipeline-node ${activeComponent === 'workers' ? 'active' : ''}`}
          onClick={() => setActiveComponent('workers')}
        >
          <Zap size={20} />
          <span className="node-title">Workers</span>
          <span className="node-port">Async</span>
        </button>
      </div>

      {/* Auxiliary Systems Row */}
      <div className="arch-aux-row">
        <button 
          className={`pipeline-node-aux ${activeComponent === 'redis' ? 'active' : ''}`}
          onClick={() => setActiveComponent('redis')}
        >
          <Zap size={18} />
          <span>Redis Cache & Rate Limiting (:6379)</span>
        </button>
        <button 
          className={`pipeline-node-aux ${activeComponent === 'postgres' ? 'active' : ''}`}
          onClick={() => setActiveComponent('postgres')}
        >
          <Database size={18} />
          <span>PostgreSQL Authoritative DB (:5432)</span>
        </button>
      </div>

      {/* Inspector Details Box */}
      <div className="arch-inspector">
        <div className="inspector-head">
          <div className="inspector-title-group">
            <span className="inspector-tag">{current.role}</span>
            <h4 className="inspector-name">{current.name} <span className="inspector-port">{current.port}</span></h4>
          </div>
        </div>
        <p className="inspector-desc">{current.details}</p>
        <div className="inspector-features-grid">
          {current.features.map((feature, idx) => (
            <div key={idx} className="inspector-feature-item">
              <CheckCircle2 size={16} className="feature-icon" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ArchitectureBanner;

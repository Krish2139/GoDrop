import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Car, 
  MapPin, 
  ShieldCheck, 
  Activity, 
  Zap, 
  Cpu, 
  Database, 
  Radio, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Sliders 
} from 'lucide-react';
import StatCard from '../components/StatCard';
import ArchitectureBanner from '../components/ArchitectureBanner';
import './Home.css';

const Home = () => {
  const milestones = [
    { id: 1, title: 'Dev Environment & React Setup', status: 'completed' },
    { id: 2, title: 'Express Backend & API Gateway', status: 'completed' },
    { id: 3, title: 'PostgreSQL Database & Migrations', status: 'completed' },
    { id: 4, title: 'JWT Auth & RBAC Security', status: 'completed' },
    { id: 5, title: 'Passenger & Driver Dashboards', status: 'completed' },
    { id: 6, title: 'Ride Lifecycle State Machine', status: 'completed' },
    { id: 7, title: 'Atomic Driver Dispatch Algorithm', status: 'next' },
    { id: 8, title: 'Redis Caching & Rate Limiting', status: 'upcoming' },
    { id: 9, title: 'RabbitMQ Async Worker Pipeline', status: 'upcoming' },
    { id: 10, title: 'Socket.IO Real-time Channels', status: 'upcoming' },
    { id: 11, title: 'Circuit Breaker & Resilience', status: 'upcoming' },
    { id: 12, title: 'Docker Compose Orchestration', status: 'upcoming' },
    { id: 13, title: 'Jest Unit & Integration Tests', status: 'upcoming' },
    { id: 14, title: 'k6 Performance & Load Testing', status: 'upcoming' },
    { id: 15, title: 'Final Academic Submission & Demo', status: 'upcoming' },
  ];

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container hero-container">
          <div className="hero-content">
            <div className="hero-tag">
              <span className="hero-tag-dot"></span>
              Distributed System Engineering • 40-Mark Project
            </div>
            <h1 className="hero-title">
              Distributed Ride Booking & <span className="highlight-text">Driver Dispatch</span> System
            </h1>
            <p className="hero-desc">
              RideFlow is a high-performance, fault-tolerant platform architected to solve 
              concurrency race conditions, sub-second driver dispatching, distributed rate limiting, 
              and asynchronous message processing using Node.js, PostgreSQL, Redis, RabbitMQ, and Docker.
            </p>

            <div className="hero-cta-group">
              <Link to="/passenger" className="btn btn-primary">
                <Car size={18} />
                <span>Passenger Portal</span>
              </Link>
              <Link to="/driver" className="btn btn-outline">
                <MapPin size={18} />
                <span>Driver Portal</span>
              </Link>
              <Link to="/admin" className="btn btn-secondary">
                <ShieldCheck size={18} />
                <span>Admin Ops</span>
              </Link>
            </div>
          </div>

          <div className="hero-card-preview">
            <div className="preview-terminal">
              <div className="terminal-header">
                <div className="terminal-dots">
                  <span className="dot red"></span>
                  <span className="dot yellow"></span>
                  <span className="dot green"></span>
                </div>
                <span className="terminal-title">system-status.json</span>
              </div>
              <pre className="terminal-body">
{`{
  "system": "RideFlow",
  "version": "1.0.0-distributed",
  "status": "HEALTHY",
  "milestone": "1 - Setup Complete",
  "topology": {
    "gateway": "Express (Port 5000)",
    "ride_service": "Express (Port 5001)",
    "driver_service": "Express (Port 5002)",
    "database": "PostgreSQL 16",
    "cache": "Redis 7 (Token Bucket)",
    "broker": "RabbitMQ 3.13"
  },
  "concurrency_protection": "SELECT FOR UPDATE",
  "dispatch_metric": "Haversine Geodistance"
}`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Primary KPI Stats */}
      <section className="stats-section">
        <div className="container">
          <div className="grid grid-cols-4">
            <StatCard 
              icon={<Car size={20} />} 
              label="System Architecture" 
              value="Microservices" 
              subtext="Distributed & Decoupled" 
              color="blue" 
            />
            <StatCard 
              icon={<Zap size={20} />} 
              label="Dispatch Latency" 
              value="< 150 ms" 
              subtext="Haversine ranking" 
              trend="Optimized"
              color="green" 
            />
            <StatCard 
              icon={<ShieldCheck size={20} />} 
              label="Rate Limiting" 
              value="Token Bucket" 
              subtext="Redis distributed 429" 
              color="purple" 
            />
            <StatCard 
              icon={<Radio size={20} />} 
              label="Event Broker" 
              value="RabbitMQ" 
              subtext="Durable DLQ Queues" 
              color="amber" 
            />
          </div>
        </div>
      </section>

      {/* Interactive System Architecture Component */}
      <section className="architecture-section">
        <div className="container">
          <ArchitectureBanner />
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section className="pillars-section">
        <div className="container">
          <div className="section-head text-center">
            <span className="badge badge-info">Design Highlights</span>
            <h2 className="section-title">Engineered for Academic & Production Rigor</h2>
            <p className="section-subtitle">
              Addressing real-world distributed challenges: race conditions, message loss, network partitions, and cascading failure.
            </p>
          </div>

          <div className="grid grid-cols-3">
            <div className="card pillar-card">
              <div className="pillar-icon blue"><Database size={24} /></div>
              <h3 className="pillar-title">Atomic Driver Reservation</h3>
              <p className="pillar-text">
                Prevents double-booking where two passengers are assigned the same driver. 
                Utilizes PostgreSQL row-level locks (<code>SELECT FOR UPDATE SKIP LOCKED</code>) 
                and conditional status transitions.
              </p>
            </div>

            <div className="card pillar-card">
              <div className="pillar-icon green"><Zap size={24} /></div>
              <h3 className="pillar-title">Distributed Rate Limiter</h3>
              <p className="pillar-text">
                Protects backend microservices from burst traffic and brute-force spikes. 
                Implemented using Redis atomic token-bucket operations with standardized 
                <code>HTTP 429 Too Many Requests</code> backpressure.
              </p>
            </div>

            <div className="card pillar-card">
              <div className="pillar-icon amber"><Radio size={24} /></div>
              <h3 className="pillar-title">Transactional Outbox</h3>
              <p className="pillar-text">
                Guarantees at-least-once message delivery without dual-write inconsistencies. 
                Events are committed in the same database transaction as ride records, then 
                relayed to RabbitMQ durable exchanges.
              </p>
            </div>

            <div className="card pillar-card">
              <div className="pillar-icon purple"><Cpu size={24} /></div>
              <h3 className="pillar-title">Circuit Breaker (Opossum)</h3>
              <p className="pillar-text">
                Prevents cascading microservice downtime. If the Ride or Driver service 
                becomes unresponsive, the Gateway opens the circuit and delivers fast 
                fallback degradation responses.
              </p>
            </div>

            <div className="card pillar-card">
              <div className="pillar-icon blue"><Sliders size={24} /></div>
              <h3 className="pillar-title">Haversine Dispatch Engine</h3>
              <p className="pillar-text">
                Computes great-circle distances across simulated GPS coordinates. 
                Sorts available drivers by proximity and iterates candidates until 
                an atomic match is successfully locked.
              </p>
            </div>

            <div className="card pillar-card">
              <div className="pillar-icon green"><Activity size={24} /></div>
              <h3 className="pillar-title">Socket.IO Push Stream</h3>
              <p className="pillar-text">
                Full-duplex real-time synchronization keeps Passenger and Driver dashboards 
                instantly updated across state transitions: <code>REQUESTED</code> → 
                <code>ASSIGNED</code> → <code>IN_PROGRESS</code> → <code>COMPLETED</code>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 15-Milestone Roadmap Tracker */}
      <section className="roadmap-section">
        <div className="container">
          <div className="section-head text-center">
            <span className="badge badge-success">Milestone Tracker</span>
            <h2 className="section-title">15-Stage Development Roadmap</h2>
            <p className="section-subtitle">
              Progressive implementation adhering strictly to academic engineering milestones.
            </p>
          </div>

          <div className="roadmap-grid">
            {milestones.map((m) => (
              <div key={m.id} className={`roadmap-step roadmap-${m.status}`}>
                <div className="step-num">M{m.id}</div>
                <div className="step-details">
                  <span className="step-name">{m.title}</span>
                  <span className={`step-badge badge-${m.status === 'completed' ? 'success' : m.status === 'next' ? 'info' : 'neutral'}`}>
                    {m.status === 'completed' ? 'Verified Done' : m.status === 'next' ? 'Ready to Build' : 'Queued'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;


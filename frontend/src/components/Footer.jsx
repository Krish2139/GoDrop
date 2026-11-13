import React from 'react';
import { Layers, ShieldCheck, Database, Cpu, Radio, GitFork } from 'lucide-react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer-root">
      <div className="container footer-content">
        <div className="footer-top-grid">
          <div className="footer-col-main">
            <div className="footer-brand-title">RideFlow System</div>
            <p className="footer-desc">
              A high-concurrency, distributed ride-hailing and driver dispatch platform.
              Designed with API Gateway routing, atomic PostgreSQL driver reservation,
              Redis distributed rate limiting, and RabbitMQ asynchronous workers.
            </p>
            <div className="footer-meta-pill">
              <span>Academic System Design Project (40 Marks)</span>
            </div>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Architecture Layers</div>
            <ul className="footer-links">
              <li><Layers size={14} /> Express API Gateway</li>
              <li><Cpu size={14} /> Ride & Driver Services</li>
              <li><Database size={14} /> PostgreSQL + Redis Cache</li>
              <li><Radio size={14} /> RabbitMQ Dispatch Worker</li>
            </ul>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Fault Tolerance</div>
            <ul className="footer-links">
              <li><ShieldCheck size={14} /> Opossum Circuit Breaker</li>
              <li><GitFork size={14} /> Transactional Outbox</li>
              <li><Database size={14} /> Dead-Letter Queues (DLQ)</li>
              <li><ShieldCheck size={14} /> Concurrency Locking</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2026 RideFlow Distributed System. Developed with React, Node.js, Express, PostgreSQL, Redis, RabbitMQ & Docker.</p>
          <div className="footer-status-tag">
            <span className="dot"></span> Milestone 1: Environment & Setup Complete
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


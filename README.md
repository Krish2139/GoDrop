# RideFlow – Distributed Ride Booking and Driver Dispatch System

## Academic System Design Project (40 Marks)

RideFlow is an enterprise-grade, distributed ride booking and driver dispatch platform inspired by Uber and Ola. The platform is designed to handle high concurrency, atomic driver reservations using PostgreSQL locks, asynchronous processing via RabbitMQ, sub-millisecond cache lookups and token-bucket rate limiting via Redis, and real-time bidirectional push updates via Socket.IO.

---

## 1. System Architecture Overview

```
                      +-----------------------------+
                      |   React.js + Vite Client   |
                      |   (Port 3000)               |
                      +--------------+--------------+
                                     |
                                     | HTTP REST & Socket.IO
                                     v
                      +-----------------------------+
                      |     Express API Gateway     |
                      |     (Port 5000)             |
                      | - Authentication (JWT)      |
                      | - Rate Limiter (Redis 429)  |
                      | - Circuit Breaker (Opossum) |
                      | - Request Correlation / Log |
                      +-------+--------------+------+
                              |              |
             +----------------+              +----------------+
             v                                                v
+------------------------+                        +------------------------+
|      Ride Service      |                        |     Driver Service     |
|      (Port 5001)       |                        |      (Port 5002)       |
| - State Machine        |                        | - Simulated GPS Ping   |
| - Outbox Publisher     |                        | - Availability Status  |
+-----------+------------+                        +-----------+------------+
            |                                                 |
            +--------------------+   +------------------------+
                                 |   |
                                 v   v
                      +-----------------------------+
                      |    PostgreSQL Database      |
                      |    (Port 5432 - Source of   |
                      |     Truth & Row Locks)      |
                      +--------------+--------------+
                                     |
               Outbox Events Relayed |
                                     v
                      +-----------------------------+
                      |   RabbitMQ Message Broker   |
                      |   (Port 5672 / 15672)       |
                      +-------+--------------+------+
                              |              |
             +----------------+              +----------------+
             v                                                v
+------------------------+                        +------------------------+
|    Dispatch Worker     |                        |  Notification Worker   |
| - Haversine Ranking    |                        | - Simulated Alerts     |
| - Atomic DB Match Lock |                        | - Resilient Retry      |
+------------------------+                        +------------------------+
```

---

## 2. Technology Stack

- **Frontend:** React 19, Vite, React Router 7, Axios, Socket.IO Client, Lucide React, Modern CSS System.
- **Backend:** Node.js 24, Express.js, Zod (validation), Pino (logging), Opossum (circuit breaker), JWT & bcrypt.
- **Data & Caching:** PostgreSQL 16 (ACID transactions, Row-level locking), Redis 7 (Token Bucket Rate Limiting, Query Caching).
- **Messaging:** RabbitMQ 3.13 (Durable queues, Dead-letter exchanges, Transactional Outbox pattern).
- **DevOps & Verification:** Docker, Docker Compose, Jest, Supertest, k6.

---

## 3. Project Structure

```
Ride/
│
├── frontend/                     # React + Vite web client
│   ├── public/                   # Static assets & SVG icons
│   ├── src/
│   │   ├── api/                  # Axios HTTP client & interceptors
│   │   ├── components/           # Reusable UI widgets (Navbar, Footer, StatCard, ArchitectureBanner)
│   │   ├── pages/                # Portals: Home, Passenger, Driver, Admin, SystemArchitecture
│   │   ├── styles/               # CSS Design system (variables.css, global.css)
│   │   ├── App.jsx               # Client routes & app layout
│   │   └── main.jsx              # React DOM entry point
│   ├── index.html                # HTML5 entry with Inter font
│   ├── package.json              # Frontend dependencies
│   └── vite.config.js            # Vite configuration (Port 3000)
│
├── gateway/                      # Express API Gateway (Milestone 2)
├── services/
│   ├── ride-service/             # Ride domain service (Milestone 2 & 6)
│   └── driver-service/           # Driver location & status service (Milestone 2 & 7)
├── workers/
│   ├── dispatch-worker/          # Proximity ranking & atomic assignment worker (Milestone 9)
│   └── notification-worker/      # Async simulated notifications worker (Milestone 9)
├── database/
│   ├── migrations/               # PostgreSQL schema DDL (Milestone 3)
│   └── seeds/                    # Initial demo data & coordinates (Milestone 3)
├── tests/                        # Jest & Supertest integration suites (Milestone 13)
├── docs/                         # Academic documentation & diagrams (Milestone 15)
├── .env.example                  # Environment configuration template
├── .gitignore                    # Git exclusions
├── package.json                  # Monorepo root scripts
└── README.md                     # System documentation
```

---

## 4. Milestone Progress

| Milestone | Description | Status |
|---|---|---|
| **M1** | Development environment and React website setup | **COMPLETED & VERIFIED** |
| **M2** | Express backend and API Gateway | Next |
| **M3** | PostgreSQL database and migrations | Queued |
| **M4** | Authentication and role-based access control | Queued |
| **M5** | Passenger and Driver dashboards | Queued |
| **M6** | Ride booking and ride lifecycle state machine | Queued |
| **M7** | Automatic driver dispatch algorithm (Haversine & Atomic Lock) | Queued |
| **M8** | Redis caching and distributed rate limiting (Token Bucket) | Queued |
| **M9** | RabbitMQ and background workers (Dispatch & Notification) | Queued |
| **M10** | Socket.IO real-time updates | Queued |
| **M11** | Circuit breaker (Opossum), retries, logging, and metrics | Queued |
| **M12** | Docker Compose integration | Queued |
| **M13** | Unit tests and integration tests (Jest & Supertest) | Queued |
| **M14** | k6 load testing and performance analysis | Queued |
| **M15** | Final academic documentation and presentation | Queued |

---

## 5. How to Run Milestone 1

### Prerequisites
- Node.js (v18+)
- npm (v9+)

### Start the Frontend Server
From the root project directory:
```powershell
cd frontend
npm run dev
```
Open your browser at: `http://localhost:3000`


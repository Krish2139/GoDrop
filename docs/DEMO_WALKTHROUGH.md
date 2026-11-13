# RideFlow: Academic Evaluation & Interactive Demo Walkthrough
## Comprehensive Evaluator's Step-by-Step Demonstration Guide

**Project Classification:** 40-Mark Academic System Design Project  
**Location Context:** Ahmedabad, Gujarat, India (SG Highway, Vastrapur Lake, CG Road, Airport)  
**System URL:** [http://localhost:3000](http://localhost:3000)  
**API Gateway:** [http://localhost:5000](http://localhost:5000)

---

## 1. Quick Access Credentials & One-Click Personas

The web application features built-in **1-Click Persona Selectors** on the login page and portal navigation bars:

| Persona | Role | Email | Password | Primary Demonstration Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Aarav Patel** | `PASSENGER` | `passenger@rideflow.io` | `pass123` | Book rides, view dynamic fare calculation, track driver on Ahmedabad map, Socket.IO live updates. |
| **Rajesh Kumar** | `DRIVER` | `driver@rideflow.io` | `driver123` | Receive 30s atomic ride offers, accept/reject, toggle GPS streaming, complete ride lifecycle. |
| **System Admin** | `ADMIN` | `admin@rideflow.io` | `admin123` | Chaos engineering fault injection, trip circuit breakers, view Redis rate limiter & RabbitMQ metrics. |

---

## 2. Interactive Evaluation Walkthrough (3-Part Demo)

### Part 1: Passenger Journey (Aarav Patel)
1. **Navigate to Passenger Portal:** Open [http://localhost:3000/passenger](http://localhost:3000/passenger) (or click **"Passenger Portal"** in the top navigation).
2. **One-Click Quick Login:** Click **"Load Passenger Credentials (Aarav Patel)"** and submit.
3. **Select Pickup & Destination:**
   - **Pickup:** Click the quick-fill button **"SG Highway (Iscon Cross Road)"** (`23.0275, 72.5076`).
   - **Dropoff:** Click the quick-fill button **"Vastrapur Lake"** (`23.0366, 72.5298`).
4. **Inspect Dynamic Fare Engine:** Notice the fare box computes distance as **2.59 km** and exact fare as **₹97.91** (Base ₹50.00 + 2.59 km × ₹18.50/km).
5. **Request Ride:** Click **"Book Ride Now"**.
   - Notice the status transition to `REQUESTED` $\rightarrow$ `DRIVER_ASSIGNED`.
   - The nearest available driver (e.g., Rajesh Kumar in `GJ-01-AB-1234`) is reserved atomically.
   - The interactive state timeline visualizes the active stage.

---

### Part 2: Driver Dispatch & Real-Time Fulfillment (Rajesh Kumar)
1. **Open Driver Portal in Split Screen or New Tab:** Navigate to [http://localhost:3000/driver](http://localhost:3000/driver).
2. **Login as Driver:** Click **"Load Driver Credentials (Rajesh Kumar)"** and submit.
3. **Receive Broadcast Offer:**
   - Notice the **30-second countdown timer** showing the pending dispatch offer for the ride booked in Part 1.
   - The pickup address is displayed as *Iscon Cross Road, SG Highway*.
4. **Accept Offer:** Click **"Accept Ride Offer"**.
   - Driver status switches to `RESERVED` $\rightarrow$ `BUSY`.
   - Real-time Socket.IO room broadcast instantly syncs the Passenger tab to `DRIVER_ACCEPTED` without page reload!
5. **Simulate Trip Progression:**
   - Click **"Arrived at Pickup"** $\implies$ Status advances to `DRIVER_ARRIVED`.
   - Click **"Start Trip"** $\implies$ Status advances to `IN_PROGRESS`.
   - Click **"Complete Trip"** $\implies$ Status transitions to `COMPLETED`. Driver status is atomically freed back to `AVAILABLE`, and passenger total rides counter increments.

---

### Part 3: Administrative Resilience & Chaos Engineering
1. **Navigate to Admin Portal:** Open [http://localhost:3000/admin](http://localhost:3000/admin).
2. **Review Live Telemetry:**
   - **API Ingress Requests:** Real-time counter of total requests served.
   - **Distributed Rate Limiter:** Number of requests checked and active tracked IPs.
   - **Circuit Breakers:** Operational status of `Ride Service` and `Driver Service` breakers.
3. **Live Chaos Engineering Fault Injection:**
   - In the **Chaos Engineering & Resilience Controls** panel, click **"Inject Downstream Latency / Fault"** on `Ride Service`.
   - Notice the circuit breaker transitions from `CLOSED` (Green) $\rightarrow$ `OPEN` (Red).
4. **Verify Graceful Degradation:**
   - Return to the Passenger portal or query `GET /api/v1/drivers/nearby`.
   - The API Gateway does **NOT** crash with `HTTP 500`. Instead, it serves cached driver fleets with a yellow **"Degraded Mode - Fallback Cache"** indicator.
5. **Heal System:** Return to Admin Portal and click **"Reset & Heal All Circuits"**. The breaker immediately returns to `CLOSED` (Green).

---

## 3. Automated Terminal Verification Commands

For formal grading, execute the following commands from PowerShell in `C:\Users\Lenovo\Desktop\Ride`:

### A. Run Master System Verification (All 15 Milestones)
```powershell
npm run verify:all
```
*Validates database connections, authentication, spatial search, outbox events, rate limiting, circuit breaker chaos controls, and Jest suites.*

### B. Run Automated Jest & Node Test Suites (43 Tests)
```powershell
npm test
```
*Expected: 43 tests passed across 11 suites in < 1 second.*

### C. Run Grafana k6 Load Test Suite
```powershell
npm run test:load
```
*Expected: 4,000+ requests across 35 VUs at 220+ req/s with 0% failure rate and p95 latency < 100ms.*

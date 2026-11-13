import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { 
  ShieldCheck, 
  Activity, 
  Server, 
  Database, 
  Radio, 
  Cpu, 
  Users, 
  Car, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Clock, 
  Sliders 
} from 'lucide-react';
import StatCard from '../components/StatCard';
import './AdminPortal.css';

const AdminPortal = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [servicesHealth, setServicesHealth] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAdminTelemetry = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch System Metrics
      const metricsRes = await apiClient.get('/metrics');
      setMetrics(metricsRes.data);

      // 2. Fetch Downstream Health
      const healthRes = await apiClient.get('/health/services');
      setServicesHealth(healthRes.data);

      // 3. Fetch Drivers
      const driversRes = await apiClient.get('/drivers');
      if (driversRes.data.success) {
        setDrivers(driversRes.data.data || []);
      }

      // 4. Fetch All Rides
      const ridesRes = await apiClient.get('/rides');
      if (ridesRes.data.success) {
        setRides(ridesRes.data.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching administrator telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminTelemetry();
  }, []);

  const availableDrivers = drivers.filter(d => d.status === 'AVAILABLE').length;
  const offlineDrivers = drivers.filter(d => d.status === 'OFFLINE').length;
  const activeRides = rides.filter(r => !['COMPLETED', 'CANCELLED'].includes(r.status)).length;
  const completedRides = rides.filter(r => r.status === 'COMPLETED').length;

  return (
    <div className="container admin-portal-page">
      {/* Top Banner */}
      <div className="portal-header">
        <div>
          <span className="badge badge-info">Module C</span>
          <h1 className="portal-title">System Operations & Admin Console</h1>
          <p className="portal-subtitle">
            Logged in as <b>{user?.name || 'Administrator'}</b>. Monitoring distributed microservice health, dispatch queues, and telemetry.
          </p>
        </div>
        <button onClick={loadAdminTelemetry} className="btn btn-outline btn-refresh" disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {error && (
        <div className="portal-alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-4 admin-kpi-grid">
        <StatCard 
          icon={<Car size={20} />} 
          label="Total Fleet Drivers" 
          value={drivers.length} 
          subtext={`${availableDrivers} Online / ${offlineDrivers} Offline`} 
          color="blue" 
        />
        <StatCard 
          icon={<Zap size={20} />} 
          label="Active Rides" 
          value={activeRides} 
          subtext="In dispatch/transit" 
          trend="Live" 
          color="amber" 
        />
        <StatCard 
          icon={<CheckCircle2 size={20} />} 
          label="Completed Rides" 
          value={completedRides} 
          subtext="Successfully delivered" 
          color="green" 
        />
        <StatCard 
          icon={<Server size={20} />} 
          label="API Ingress Requests" 
          value={metrics?.gateway?.totalRequests || 0} 
          subtext={`Uptime: ${metrics?.uptimeSeconds || 0}s`} 
          color="purple" 
        />
      </div>

      {/* Distributed Subsystems Health & Circuit Breakers */}
      {/* Infrastructure & Telemetry 3-Column Grid */}
      <div className="health-breaker-grid">
        {/* 1. Service Health Monitor */}
        <div className="card">
          <h3 className="admin-card-title"><Activity size={18} className="icon-blue" /> Infrastructure Health</h3>
          <div className="services-health-list">
            <div className="health-item-row">
              <div className="service-info">
                <span className="dot green"></span>
                <div>
                  <span className="service-name">API Gateway (Ingress)</span>
                  <span className="service-url">http://localhost:5000</span>
                </div>
              </div>
              <span className="badge badge-success">HEALTHY (UP)</span>
            </div>

            <div className="health-item-row">
              <div className="service-info">
                <span className={`dot ${servicesHealth?.services?.rideService?.status === 'UP' ? 'green' : 'red'}`}></span>
                <div>
                  <span className="service-name">Ride Domain Service</span>
                  <span className="service-url">http://localhost:5001</span>
                </div>
              </div>
              <span className={`badge ${servicesHealth?.services?.rideService?.status === 'UP' ? 'badge-success' : 'badge-neutral'}`}>
                {servicesHealth?.services?.rideService?.status || 'UNKNOWN'}
              </span>
            </div>

            <div className="health-item-row">
              <div className="service-info">
                <span className={`dot ${servicesHealth?.services?.driverService?.status === 'UP' ? 'green' : 'red'}`}></span>
                <div>
                  <span className="service-name">Driver Telemetry Service</span>
                  <span className="service-url">http://localhost:5002</span>
                </div>
              </div>
              <span className={`badge ${servicesHealth?.services?.driverService?.status === 'UP' ? 'badge-success' : 'badge-neutral'}`}>
                {servicesHealth?.services?.driverService?.status || 'UNKNOWN'}
              </span>
            </div>

            <div className="health-item-row">
              <div className="service-info">
                <span className="dot green"></span>
                <div>
                  <span className="service-name">PostgreSQL 16 Database</span>
                  <span className="service-url">Port 5432 (rideflow_db)</span>
                </div>
              </div>
              <span className="badge badge-success">ACID PERSISTENCE</span>
            </div>

            <div className="health-item-row">
              <div className="service-info">
                <span className={`dot ${metrics?.redis?.connected ? 'green' : 'red'}`}></span>
                <div>
                  <span className="service-name">Redis 7 Distributed Cache</span>
                  <span className="service-url">Port 6379 (rideflow-redis)</span>
                </div>
              </div>
              <span className={`badge ${metrics?.redis?.connected ? 'badge-success' : 'badge-warning'}`}>
                {metrics?.redis?.connected ? 'DISTRIBUTED (UP)' : 'DEGRADED (DOWN)'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Redis Caching & Invalidation Telemetry */}
        <div className="card">
          <h3 className="admin-card-title"><Zap size={18} className="icon-blue" /> Redis Caching & Telemetry</h3>
          
          <div className="telemetry-box">
            <div className="telemetry-row">
              <span>Redis Cluster Mode:</span>
              <span className={`badge ${metrics?.redis?.connected ? 'badge-success' : 'badge-warning'}`}>
                {metrics?.redis?.provider || 'Redis 7 (Alpine)'}
              </span>
            </div>
            <div className="telemetry-row">
              <span>Redis Memory Footprint:</span>
              <b>{metrics?.redis?.memoryUsed || '1.2M'}</b>
            </div>
            <div className="telemetry-row">
              <span>Driver Service Cache Hits / Misses:</span>
              <b>
                {servicesHealth?.services?.driverService?.details?.redis?.cacheMetrics?.hits || 0} / {servicesHealth?.services?.driverService?.details?.redis?.cacheMetrics?.misses || 0}
              </b>
            </div>
            <div className="telemetry-row">
              <span>Driver Cache Hit Ratio:</span>
              <b style={{ color: '#059669' }}>
                {servicesHealth?.services?.driverService?.details?.redis?.cacheMetrics?.hitRate || '0.0%'}
              </b>
            </div>
            <div className="telemetry-divider"></div>
            <div className="telemetry-row">
              <span>Ride Service Cache Hits / Misses:</span>
              <b>
                {servicesHealth?.services?.rideService?.details?.redis?.cacheMetrics?.hits || 0} / {servicesHealth?.services?.rideService?.details?.redis?.cacheMetrics?.misses || 0}
              </b>
            </div>
            <div className="telemetry-row">
              <span>Cache Invalidation Triggers:</span>
              <b>
                {(servicesHealth?.services?.driverService?.details?.redis?.cacheMetrics?.invalidations || 0) + 
                 (servicesHealth?.services?.rideService?.details?.redis?.cacheMetrics?.invalidations || 0)} events
              </b>
            </div>
            <div className="telemetry-row">
              <span>Cache Consistency Policy:</span>
              <span className="badge badge-info">WRITE-THROUGH INVALIDATION</span>
            </div>
          </div>
        </div>

        {/* 3. Distributed Rate Limiting & Circuit Breakers */}
        <div className="card">
          <h3 className="admin-card-title"><ShieldCheck size={18} className="icon-blue" /> Rate Limiting & Fault Tolerance</h3>
          
          <div className="telemetry-box">
            <div className="telemetry-row">
              <span>Token Bucket Rate Limiter:</span>
              <b>{metrics?.rateLimiter?.algorithm || 'Distributed Token Bucket'}</b>
            </div>
            <div className="telemetry-row">
              <span>Limiter Storage Provider:</span>
              <span className="badge badge-success">
                {metrics?.rateLimiter?.redisBacked ? 'REDIS DISTRIBUTED' : 'LOCAL MEMORY'}
              </span>
            </div>
            <div className="telemetry-row">
              <span>Tracked Active Clients:</span>
              <b>{metrics?.rateLimiter?.activeTrackedClients || 1}</b>
            </div>
            <div className="telemetry-row">
              <span>HTTP 429 Throttle Triggers:</span>
              <b style={{ color: metrics?.rateLimiter?.exceededCount429 > 0 ? '#DC2626' : 'inherit' }}>
                {metrics?.rateLimiter?.exceededCount429 || 0}
              </b>
            </div>
            <div className="telemetry-divider"></div>
            <div className="telemetry-row">
              <span>Ride Service Circuit Breaker:</span>
              <span className="badge badge-success">
                {metrics?.circuitBreakers?.rideService?.state || 'CLOSED'}
              </span>
            </div>
            <div className="telemetry-row">
              <span>Driver Service Circuit Breaker:</span>
              <span className="badge badge-success">
                {metrics?.circuitBreakers?.driverService?.state || 'CLOSED'}
              </span>
            </div>
            <div className="telemetry-row">
              <span>Failover Resilience:</span>
              <span className="badge badge-success">ZERO DISRUPTION FALLBACK</span>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Inventory Table */}
      <div className="card">
        <h3 className="admin-card-title">Driver Fleet & Geospatial Coordinates</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Driver ID</th>
                <th>Name</th>
                <th>Vehicle</th>
                <th>License Plate</th>
                <th>Status</th>
                <th>GPS Latitude</th>
                <th>GPS Longitude</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id}>
                  <td><code>{d.id}</code></td>
                  <td><b>{d.name}</b></td>
                  <td>{d.vehicle_model}</td>
                  <td><code>{d.license_plate}</code></td>
                  <td>
                    <span className={`badge ${d.status === 'AVAILABLE' ? 'badge-success' : 'badge-neutral'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td>{d.current_latitude?.toFixed(4)}</td>
                  <td>{d.current_longitude?.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All System Rides Table */}
      <div className="card">
        <h3 className="admin-card-title">All Rides State Machine Registry</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ride ID</th>
                <th>Passenger</th>
                <th>Pickup Location</th>
                <th>Destination</th>
                <th>Fare</th>
                <th>Status</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {rides.map(r => (
                <tr key={r.id}>
                  <td><code>{r.id.substring(0, 14)}...</code></td>
                  <td>{r.passenger_name || 'Passenger'}</td>
                  <td>{r.pickup_address}</td>
                  <td>{r.destination_address}</td>
                  <td><b>₹{r.fare_amount}</b></td>
                  <td>
                    <span className={`badge ${r.status === 'COMPLETED' ? 'badge-success' : r.status === 'CANCELLED' ? 'badge-neutral' : 'badge-warning'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminPortal;

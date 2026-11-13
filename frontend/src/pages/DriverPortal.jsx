import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { 
  Navigation, 
  MapPin, 
  Power, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Car, 
  Clock, 
  DollarSign, 
  Compass, 
  Star, 
  ShieldCheck, 
  Play, 
  Flag 
} from 'lucide-react';
import './DriverPortal.css';

const GPS_WAYPOINTS = [
  { name: 'Downtown Central Mall', lat: 12.9719, lng: 77.5937, heading: 90 },
  { name: 'Indiranagar 100ft Road', lat: 12.9780, lng: 77.6010, heading: 180 },
  { name: 'Koramangala 5th Block', lat: 12.9350, lng: 77.6240, heading: 270 },
  { name: 'MG Road Metro Station', lat: 12.9750, lng: 77.6080, heading: 45 },
  { name: 'Airport Expressway Toll', lat: 13.1000, lng: 77.6500, heading: 0 },
];

const DriverPortal = () => {
  const { user } = useAuth();
  const [driver, setDriver] = useState(null);
  const [rides, setRides] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // GPS Simulation State
  const [simLat, setSimLat] = useState(12.9719);
  const [simLng, setSimLng] = useState(77.5937);
  const [simHeading, setSimHeading] = useState(90);

  const loadDriverData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch driver profile
      const profRes = await apiClient.get('/drivers/profile');
      if (profRes.data.success) {
        const d = profRes.data.data;
        setDriver(d);
        setSimLat(d.current_latitude);
        setSimLng(d.current_longitude);
        setSimHeading(d.heading || 0);

        // Fetch driver offers
        const offersRes = await apiClient.get(`/drivers/${d.id}/offers`);
        if (offersRes.data.success) {
          setOffers(offersRes.data.data || []);
        }
      }

      // Fetch rides
      const ridesRes = await apiClient.get('/rides');
      if (ridesRes.data.success) {
        const allRides = ridesRes.data.data || [];
        setRides(allRides);

        // Check if there is an active ride assigned/in-progress for this driver
        const active = allRides.find(
          r => ['DRIVER_ASSIGNED', 'DRIVER_ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(r.status)
        );
        setActiveRide(active || null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error loading driver profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDriverData();
  }, []);

  // Toggle Availability Status
  const handleToggleAvailability = async () => {
    if (!driver) return;
    setActionLoading(true);
    setError(null);
    setMessage(null);

    const targetStatus = driver.status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
    try {
      const res = await apiClient.patch(`/drivers/${driver.id}/availability`, {
        status: targetStatus,
      });
      if (res.data.success) {
        setDriver(res.data.data);
        setMessage(`Availability updated to ${targetStatus}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update availability status');
    } finally {
      setActionLoading(false);
    }
  };

  // Broadcast Simulated GPS Coordinates
  const handleUpdateLocation = async (lat, lng, heading) => {
    if (!driver) return;
    setActionLoading(true);
    setError(null);
    setMessage(null);

    const targetLat = lat !== undefined ? lat : parseFloat(simLat);
    const targetLng = lng !== undefined ? lng : parseFloat(simLng);
    const targetHeading = heading !== undefined ? heading : parseInt(simHeading, 10);

    try {
      const res = await apiClient.patch(`/drivers/${driver.id}/location`, {
        latitude: targetLat,
        longitude: targetLng,
        heading: targetHeading,
      });
      if (res.data.success) {
        setSimLat(targetLat);
        setSimLng(targetLng);
        setSimHeading(targetHeading);
        setMessage(`Simulated GPS ping broadcasted: [${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}]`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update driver GPS location');
    } finally {
      setActionLoading(false);
    }
  };

  // Select Waypoint Preset
  const handleSelectWaypoint = (wp) => {
    setSimLat(wp.lat);
    setSimLng(wp.lng);
    setSimHeading(wp.heading);
    handleUpdateLocation(wp.lat, wp.lng, wp.heading);
  };

  // Accept Ride Offer
  const handleAcceptRide = async (rideId) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiClient.post(`/rides/${rideId}/accept`, {
        driver_id: driver?.id || 'driver-seed-1',
      });
      if (res.data.success) {
        setMessage('Ride offer accepted! Proceed to pickup location.');
        await loadDriverData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to accept ride');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Ride Offer
  const handleRejectRide = async (rideId) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiClient.post(`/rides/${rideId}/reject`);
      if (res.data.success) {
        setMessage('Ride offer rejected. Ride returned to pending dispatch.');
        await loadDriverData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject ride');
    } finally {
      setActionLoading(false);
    }
  };

  // Trip Status Transitions
  const handleTripAction = async (endpoint, successText) => {
    if (!activeRide) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiClient.post(`/rides/${activeRide.id}/${endpoint}`);
      if (res.data.success) {
        setMessage(successText);
        await loadDriverData();
      }
    } catch (err) {
      setError(err.response?.data?.message || `Failed to transition ride status`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="container driver-portal-page">
      {/* Header Banner */}
      <div className="portal-header">
        <div>
          <span className="badge badge-info">Module B</span>
          <h1 className="portal-title">Driver Dispatch Terminal</h1>
          <p className="portal-subtitle">
            Welcome, <b>{driver?.name || user?.name || 'Rajesh Kumar'}</b>. Manage availability, simulated GPS telemetry, and incoming dispatch offers.
          </p>
        </div>
        <button onClick={loadDriverData} className="btn btn-outline btn-refresh" disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Alerts */}
      {message && (
        <div className="portal-alert alert-success">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="portal-alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Top Grid: Profile & Availability Toggle */}
      <div className="grid grid-cols-3 driver-top-grid">
        {/* Driver Profile Card */}
        <div className="card driver-profile-card">
          <div className="driver-card-head">
            <div className="driver-avatar-circle">
              <Navigation size={24} />
            </div>
            <div>
              <h3 className="driver-name">{driver?.name || 'Rajesh Kumar'}</h3>
              <span className="driver-vehicle">{driver?.vehicle_model || 'Toyota Prius (White)'}</span>
            </div>
          </div>
          <div className="driver-details-list">
            <div className="detail-row">
              <span className="detail-label">License Plate:</span>
              <span className="detail-val"><code>{driver?.license_plate || 'KA-01-AB-1234'}</code></span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Rating:</span>
              <span className="detail-val rating"><Star size={14} /> {driver?.rating || '4.85'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Current Status:</span>
              <span className={`badge ${driver?.status === 'AVAILABLE' ? 'badge-success' : 'badge-neutral'}`}>
                {driver?.status || 'AVAILABLE'}
              </span>
            </div>
          </div>
        </div>

        {/* Online / Offline Availability Switch Card */}
        <div className="card toggle-card">
          <div className="toggle-header">
            <span className="card-label">Dispatch Availability</span>
            <span className={`status-pill ${driver?.status === 'AVAILABLE' ? 'online' : 'offline'}`}>
              <span className="dot"></span>
              {driver?.status === 'AVAILABLE' ? 'ONLINE & RECEIVING' : 'OFFLINE'}
            </span>
          </div>
          <p className="toggle-desc">
            When Online, the automatic dispatch algorithm ranks your proximity via Haversine distance and routes incoming ride requests.
          </p>
          <button 
            onClick={handleToggleAvailability} 
            className={`btn toggle-btn ${driver?.status === 'AVAILABLE' ? 'btn-offline' : 'btn-online'}`}
            disabled={actionLoading}
          >
            <Power size={18} />
            <span>{driver?.status === 'AVAILABLE' ? 'Go Offline' : 'Go Online (Available)'}</span>
          </button>
        </div>
      </div>

      {/* Middle Section: Active Trip Console & Incoming Offers */}
      <div className="grid grid-cols-2 driver-middle-grid">
        {/* Active Trip Execution Console */}
        <div className="card active-trip-card">
          <div className="card-head-simple">
            <h3 className="card-title"><Car size={20} className="icon-blue" /> Active Trip Execution</h3>
            {activeRide && <span className="badge badge-warning">{activeRide.status}</span>}
          </div>

          {activeRide ? (
            <div className="active-trip-console">
              <div className="trip-passenger-info">
                <div>Passenger: <b>{activeRide.passenger_name || 'Passenger'}</b></div>
                <div>Fare: <b className="fare-tag">₹{activeRide.fare_amount}</b></div>
              </div>

              <div className="trip-locations-box">
                <div className="location-row">
                  <span className="dot green"></span>
                  <div>
                    <span className="loc-label">Pickup:</span>
                    <p className="loc-addr">{activeRide.pickup_address}</p>
                  </div>
                </div>
                <div className="location-row">
                  <span className="dot red"></span>
                  <div>
                    <span className="loc-label">Destination:</span>
                    <p className="loc-addr">{activeRide.destination_address}</p>
                  </div>
                </div>
              </div>

              {/* Sequential Action Controls */}
              <div className="trip-stepper-actions">
                {['DRIVER_ASSIGNED', 'PENDING'].includes(activeRide.status) && (
                  <div className="action-step-group">
                    <button 
                      onClick={() => handleAcceptRide(activeRide.id)}
                      className="btn btn-primary"
                      disabled={actionLoading}
                    >
                      <CheckCircle2 size={16} /> Accept Ride Offer
                    </button>
                    <button 
                      onClick={() => handleRejectRide(activeRide.id)}
                      className="btn btn-outline"
                      disabled={actionLoading}
                    >
                      <XCircle size={16} /> Reject Offer
                    </button>
                  </div>
                )}

                {activeRide.status === 'DRIVER_ACCEPTED' && (
                  <button 
                    onClick={() => handleTripAction('arrived', 'Marked arrived at pickup location')}
                    className="btn btn-primary"
                    disabled={actionLoading}
                  >
                    <MapPin size={16} /> Step 1: Mark Arrived at Pickup
                  </button>
                )}

                {activeRide.status === 'DRIVER_ARRIVED' && (
                  <button 
                    onClick={() => handleTripAction('start', 'Trip started! Navigating to destination.')}
                    className="btn btn-primary"
                    disabled={actionLoading}
                  >
                    <Play size={16} /> Step 2: Start Trip (Passenger Onboard)
                  </button>
                )}

                {activeRide.status === 'IN_PROGRESS' && (
                  <button 
                    onClick={() => handleTripAction('complete', 'Trip completed successfully! Fare recorded.')}
                    className="btn btn-primary btn-success-action"
                    disabled={actionLoading}
                  >
                    <Flag size={16} /> Step 3: Complete Trip & Collect Fare
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="no-active-trip">
              <Navigation size={32} className="no-trip-icon" />
              <p>No active ride in execution.</p>
              <span className="subtext">Make sure your status is set to ONLINE to receive offers.</span>
            </div>
          )}
        </div>

        {/* Simulated GPS Coordinate Controller */}
        <div className="card gps-card">
          <div className="card-head-simple">
            <h3 className="card-title"><Compass size={20} className="icon-blue" /> Simulated GPS Controller</h3>
            <span className="badge badge-info">{simHeading}° Heading</span>
          </div>

          <p className="gps-desc">
            Broadcast simulated GPS coordinates to the Driver Service to update proximity calculations in real-time.
          </p>

          <div className="waypoint-buttons-group">
            <span className="quick-label">Teleport to Waypoint:</span>
            <div className="waypoint-grid">
              {GPS_WAYPOINTS.map((wp, idx) => (
                <button 
                  key={idx} 
                  type="button" 
                  className="waypoint-pill"
                  onClick={() => handleSelectWaypoint(wp)}
                  disabled={actionLoading}
                >
                  <MapPin size={12} /> {wp.name}
                </button>
              ))}
            </div>
          </div>

          <div className="coords-inputs-grid">
            <div className="form-group">
              <label className="input-label">Latitude</label>
              <input 
                type="number" 
                step="0.0001" 
                className="form-input" 
                value={simLat} 
                onChange={(e) => setSimLat(e.target.value)} 
              />
            </div>
            <div className="form-group">
              <label className="input-label">Longitude</label>
              <input 
                type="number" 
                step="0.0001" 
                className="form-input" 
                value={simLng} 
                onChange={(e) => setSimLng(e.target.value)} 
              />
            </div>
            <div className="form-group">
              <label className="input-label">Heading (°)</label>
              <input 
                type="number" 
                min="0" 
                max="360" 
                className="form-input" 
                value={simHeading} 
                onChange={(e) => setSimHeading(e.target.value)} 
              />
            </div>
          </div>

          <button 
            type="button" 
            onClick={() => handleUpdateLocation()} 
            className="btn btn-outline btn-broadcast"
            disabled={actionLoading}
          >
            <Compass size={16} /> Broadcast GPS Telemetry Ping
          </button>
        </div>
      </div>

      {/* Completed Rides Table */}
      <div className="card history-card">
        <div className="history-head">
          <h3 className="history-title">Trips & Execution Records</h3>
          <span className="badge badge-neutral">{rides.length} Total Registered Rides</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ride ID</th>
                <th>Passenger</th>
                <th>Pickup Address</th>
                <th>Destination</th>
                <th>Fare Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rides.length > 0 ? (
                rides.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.id.substring(0, 12)}...</code></td>
                    <td>{r.passenger_name || 'Passenger'}</td>
                    <td>{r.pickup_address}</td>
                    <td>{r.destination_address}</td>
                    <td><b>₹{r.fare_amount}</b></td>
                    <td>
                      <span className={`badge ${r.status === 'COMPLETED' ? 'badge-success' : r.status === 'CANCELLED' ? 'badge-neutral' : 'badge-warning'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                    No trip execution records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DriverPortal;

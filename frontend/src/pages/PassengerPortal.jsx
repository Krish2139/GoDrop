import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { 
  Car, 
  MapPin, 
  Navigation, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  DollarSign, 
  User, 
  Star, 
  ArrowRight,
  Sliders
} from 'lucide-react';
import './PassengerPortal.css';

const LOCATION_PRESETS = [
  { name: 'Downtown Central Mall', lat: 12.9716, lng: 77.5946 },
  { name: 'MG Road Metro Station', lat: 12.9750, lng: 77.6080 },
  { name: 'Indiranagar 100ft Road', lat: 12.9784, lng: 77.6408 },
  { name: 'Koramangala 5th Block', lat: 12.9352, lng: 77.6245 },
  { name: 'Tech Innovation Park (Whitefield)', lat: 12.9854, lng: 77.7312 },
  { name: 'International Airport T1', lat: 13.1986, lng: 77.7066 },
];

const PassengerPortal = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [rides, setRides] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Booking Form State
  const [pickupPreset, setPickupPreset] = useState(LOCATION_PRESETS[0].name);
  const [pickupAddress, setPickupAddress] = useState(LOCATION_PRESETS[0].name);
  const [pickupLat, setPickupLat] = useState(LOCATION_PRESETS[0].lat);
  const [pickupLng, setPickupLng] = useState(LOCATION_PRESETS[0].lng);

  const [destPreset, setDestPreset] = useState(LOCATION_PRESETS[3].name);
  const [destAddress, setDestAddress] = useState(LOCATION_PRESETS[3].name);
  const [destLat, setDestLat] = useState(LOCATION_PRESETS[3].lat);
  const [destLng, setDestLng] = useState(LOCATION_PRESETS[3].lng);

  // Fare estimation calculation based on Haversine distance
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  };

  const estimatedDistance = calculateDistance(pickupLat, pickupLng, destLat, destLng);
  const estimatedFare = Number((50 + estimatedDistance * 18.5).toFixed(2));

  // Load profile and rides
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch profile
      const profRes = await apiClient.get('/passengers/profile');
      if (profRes.data.success) {
        setProfile(profRes.data.data);
      }

      // Fetch rides
      const ridesRes = await apiClient.get('/rides');
      if (ridesRes.data.success) {
        const allRides = ridesRes.data.data || [];
        setRides(allRides);

        // Identify current active ride (not COMPLETED or CANCELLED)
        const currentActive = allRides.find(
          r => !['COMPLETED', 'CANCELLED'].includes(r.status)
        );
        setActiveRide(currentActive || null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error loading passenger data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update pickup preset
  const handlePickupChange = (e) => {
    const selected = LOCATION_PRESETS.find(p => p.name === e.target.value);
    if (selected) {
      setPickupPreset(selected.name);
      setPickupAddress(selected.name);
      setPickupLat(selected.lat);
      setPickupLng(selected.lng);
    }
  };

  // Update destination preset
  const handleDestChange = (e) => {
    const selected = LOCATION_PRESETS.find(p => p.name === e.target.value);
    if (selected) {
      setDestPreset(selected.name);
      setDestAddress(selected.name);
      setDestLat(selected.lat);
      setDestLng(selected.lng);
    }
  };

  // Submit Ride Booking
  const handleBookRide = async (e) => {
    e.preventDefault();
    setBookingLoading(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        passenger_id: profile?.id || 'pass-seed-1',
        passenger_name: user?.name || 'Aarav Sharma',
        pickup_address: pickupAddress,
        pickup_latitude: parseFloat(pickupLat),
        pickup_longitude: parseFloat(pickupLng),
        destination_address: destAddress,
        destination_latitude: parseFloat(destLat),
        destination_longitude: parseFloat(destLng),
      };

      const res = await apiClient.post('/rides', payload);
      if (res.data.success) {
        setMessage('Ride request submitted! The system is locating nearby drivers.');
        setActiveRide(res.data.data);
        await loadData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit ride request');
    } finally {
      setBookingLoading(false);
    }
  };

  // Cancel Active Ride
  const handleCancelRide = async (rideId) => {
    if (!window.confirm('Are you sure you want to cancel this ride request?')) return;
    try {
      const res = await apiClient.post(`/rides/${rideId}/cancel`);
      if (res.data.success) {
        setMessage('Ride has been cancelled.');
        setActiveRide(null);
        await loadData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel ride');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED': return <span className="badge badge-success">COMPLETED</span>;
      case 'CANCELLED': return <span className="badge badge-neutral">CANCELLED</span>;
      case 'IN_PROGRESS': return <span className="badge badge-info">IN PROGRESS</span>;
      case 'DRIVER_ASSIGNED': return <span className="badge badge-warning">DRIVER ASSIGNED</span>;
      case 'DRIVER_ACCEPTED': return <span className="badge badge-info">DRIVER ACCEPTED</span>;
      case 'DRIVER_ARRIVED': return <span className="badge badge-info">DRIVER ARRIVED</span>;
      case 'REQUESTED': return <span className="badge badge-warning">REQUESTED</span>;
      case 'PENDING': return <span className="badge badge-warning">SEARCHING DRIVER</span>;
      default: return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div className="container passenger-portal-page">
      {/* Top Banner */}
      <div className="portal-header">
        <div>
          <span className="badge badge-info">Module A</span>
          <h1 className="portal-title">Passenger Portal</h1>
          <p className="portal-subtitle">
            Welcome back, <b>{user?.name || 'Aarav Sharma'}</b>. Request on-demand rides with automated driver dispatching.
          </p>
        </div>
        <button onClick={loadData} className="btn btn-outline btn-refresh" disabled={loading}>
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

      {/* Top Row: Profile Card & Active Trip Card */}
      <div className="grid grid-cols-3 portal-top-grid">
        {/* Passenger Profile Card */}
        <div className="card profile-card">
          <div className="profile-header">
            <div className="avatar-circle">
              <User size={24} />
            </div>
            <div>
              <h3 className="profile-name">{user?.name || 'Aarav Sharma'}</h3>
              <span className="profile-email">{user?.email || 'passenger@rideflow.io'}</span>
            </div>
          </div>
          <div className="profile-stats-row">
            <div className="profile-stat-box">
              <span className="stat-label">Rating</span>
              <span className="stat-val rating-val"><Star size={16} /> 4.90</span>
            </div>
            <div className="profile-stat-box">
              <span className="stat-label">Total Rides</span>
              <span className="stat-val">{rides.length}</span>
            </div>
            <div className="profile-stat-box">
              <span className="stat-label">Status</span>
              <span className="stat-val active-status">Active</span>
            </div>
          </div>
        </div>

        {/* Live Active Ride Tracker Card */}
        <div className="card active-ride-card">
          <div className="card-header-row">
            <span className="card-label">Active Ride Status</span>
            {activeRide && getStatusBadge(activeRide.status)}
          </div>

          {activeRide ? (
            <div className="active-ride-body">
              <div className="trip-route-visual">
                <div className="route-point">
                  <div className="dot green"></div>
                  <div>
                    <span className="point-tag">Pickup</span>
                    <p className="point-addr">{activeRide.pickup_address}</p>
                  </div>
                </div>
                <div className="route-line"></div>
                <div className="route-point">
                  <div className="dot red"></div>
                  <div>
                    <span className="point-tag">Destination</span>
                    <p className="point-addr">{activeRide.destination_address}</p>
                  </div>
                </div>
              </div>

              <div className="active-ride-meta">
                <div>Fare: <b>₹{activeRide.fare_amount}</b></div>
                <div>ID: <code>{activeRide.id.substring(0, 15)}...</code></div>
              </div>

              {['REQUESTED', 'PENDING', 'DRIVER_ASSIGNED'].includes(activeRide.status) && (
                <button 
                  onClick={() => handleCancelRide(activeRide.id)} 
                  className="btn btn-outline btn-cancel"
                >
                  <XCircle size={16} /> Cancel Ride Request
                </button>
              )}
            </div>
          ) : (
            <div className="no-active-ride">
              <Car size={32} className="no-ride-icon" />
              <p>No active ride in progress.</p>
              <span className="subtext">Use the booking form below to request a ride.</span>
            </div>
          )}
        </div>
      </div>

      {/* Booking Form Card */}
      <div className="card booking-card">
        <div className="booking-card-head">
          <div className="head-title-wrap">
            <MapPin size={22} className="icon-blue" />
            <div>
              <h2 className="head-title">Book a New Ride</h2>
              <p className="head-sub">Select pickup and destination coordinates. Fare is calculated using Haversine distance.</p>
            </div>
          </div>
          <div className="fare-preview-pill">
            <span className="pill-label">Est. Distance:</span>
            <span className="pill-val">{estimatedDistance} km</span>
            <span className="pill-sep">|</span>
            <span className="pill-label">Est. Fare:</span>
            <span className="pill-fare">₹{estimatedFare}</span>
          </div>
        </div>

        <form onSubmit={handleBookRide} className="booking-form-grid">
          {/* Pickup Selection */}
          <div className="form-column">
            <h4 className="col-heading"><span className="dot green"></span> Pickup Location</h4>
            <div className="form-group">
              <label className="input-label">Quick Preset</label>
              <select className="form-select" value={pickupPreset} onChange={handlePickupChange}>
                {LOCATION_PRESETS.map((p, idx) => (
                  <option key={idx} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Pickup Address</label>
              <input 
                type="text" 
                className="form-input" 
                value={pickupAddress} 
                onChange={(e) => setPickupAddress(e.target.value)} 
                required 
              />
            </div>
            <div className="coords-row">
              <div className="form-group">
                <label className="input-label">Latitude</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  className="form-input" 
                  value={pickupLat} 
                  onChange={(e) => setPickupLat(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="input-label">Longitude</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  className="form-input" 
                  value={pickupLng} 
                  onChange={(e) => setPickupLng(e.target.value)} 
                  required 
                />
              </div>
            </div>
          </div>

          {/* Destination Selection */}
          <div className="form-column">
            <h4 className="col-heading"><span className="dot red"></span> Destination Location</h4>
            <div className="form-group">
              <label className="input-label">Quick Preset</label>
              <select className="form-select" value={destPreset} onChange={handleDestChange}>
                {LOCATION_PRESETS.map((p, idx) => (
                  <option key={idx} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Destination Address</label>
              <input 
                type="text" 
                className="form-input" 
                value={destAddress} 
                onChange={(e) => setDestAddress(e.target.value)} 
                required 
              />
            </div>
            <div className="coords-row">
              <div className="form-group">
                <label className="input-label">Latitude</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  className="form-input" 
                  value={destLat} 
                  onChange={(e) => setDestLat(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="input-label">Longitude</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  className="form-input" 
                  value={destLng} 
                  onChange={(e) => setDestLng(e.target.value)} 
                  required 
                />
              </div>
            </div>
          </div>

          <div className="booking-submit-row">
            <button 
              type="submit" 
              className="btn btn-primary btn-lg" 
              disabled={bookingLoading || (activeRide && !['COMPLETED', 'CANCELLED'].includes(activeRide.status))}
            >
              <Car size={18} />
              <span>{bookingLoading ? 'Dispatching...' : activeRide ? 'Active Ride Already in Progress' : `Confirm & Request Ride (₹${estimatedFare})`}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Ride History Table */}
      <div className="card history-card">
        <div className="history-head">
          <h3 className="history-title">Ride History & Assignments</h3>
          <span className="badge badge-neutral">{rides.length} Total Trips</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ride ID</th>
                <th>Pickup Location</th>
                <th>Destination</th>
                <th>Fare</th>
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {rides.length > 0 ? (
                rides.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.id.substring(0, 12)}...</code></td>
                    <td>{r.pickup_address}</td>
                    <td>{r.destination_address}</td>
                    <td><b>₹{r.fare_amount}</b></td>
                    <td>{getStatusBadge(r.status)}</td>
                    <td>{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                    No previous ride records found.
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

export default PassengerPortal;

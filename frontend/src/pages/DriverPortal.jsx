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
import RideLifecycleTimeline from '../components/RideLifecycleTimeline';
import { 
  getSocket, 
  joinRideRoom, 
  leaveRideRoom, 
  onDispatchOffer, 
  onRideStatusChanged, 
  streamDriverLocation 
} from '../services/socket';
import './DriverPortal.css';

const GPS_WAYPOINTS = [
  { name: 'SG Highway (Iscon Cross Road)', lat: 23.0275, lng: 72.5076, heading: 90 },
  { name: 'Vastrapur Lake / AlphaOne', lat: 23.0373, lng: 72.5303, heading: 180 },
  { name: 'Navrangpura / CG Road', lat: 23.0372, lng: 72.5613, heading: 45 },
  { name: 'Sabarmati Riverfront Promenade', lat: 23.0338, lng: 72.5714, heading: 0 },
  { name: 'SVP International Airport (SVPIA)', lat: 23.0734, lng: 72.6266, heading: 270 },
  { name: 'GIFT City Gandhinagar', lat: 23.1598, lng: 72.6842, heading: 15 },
];

const DriverPortal = () => {
  const { user, switchDriver, register, knownDrivers } = useAuth();
  const [driver, setDriver] = useState(null);
  const [rides, setRides] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [offers, setOffers] = useState([]);
  const [activeOffer, setActiveOffer] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Manual Driver Management State
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [newDrvName, setNewDrvName] = useState('');
  const [newDrvEmail, setNewDrvEmail] = useState('');
  const [newDrvVehicle, setNewDrvVehicle] = useState('Toyota Innova (Silver)');
  const [newDrvPlate, setNewDrvPlate] = useState('GJ-01-XY-1234');
  const [newDrvPassword, setNewDrvPassword] = useState('driver123');

  // GPS Simulation State (Default: Ahmedabad SG Highway)
  const [simLat, setSimLat] = useState(23.0275);
  const [simLng, setSimLng] = useState(72.5076);
  const [simHeading, setSimHeading] = useState(90);

  const handleSwitchDriver = async (email) => {
    setActionLoading(true);
    setError(null);
    try {
      await switchDriver(email);
      setMessage(`Switched terminal to driver: ${email}`);
      await loadDriverData();
    } catch (err) {
      setError(err.message || 'Failed to switch driver account');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateNewDriver = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);
      await register({
        name: newDrvName,
        email: newDrvEmail,
        password: newDrvPassword,
        role: 'DRIVER',
        vehicle_model: newDrvVehicle,
        license_plate: newDrvPlate,
        latitude: 23.0275,
        longitude: 72.5076,
      });
      setMessage(`New driver registered & active: ${newDrvName} (${newDrvVehicle})`);
      setShowAddDriver(false);
      setNewDrvName('');
      setNewDrvEmail('');
      await loadDriverData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to register driver');
    } finally {
      setActionLoading(false);
    }
  };

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

  // Sync active offer & countdown
  useEffect(() => {
    if (offers && offers.length > 0) {
      const off = offers[0];
      setActiveOffer(off);
      const remaining = off.remaining_seconds ? Math.max(1, parseInt(off.remaining_seconds, 10)) : 30;
      setCountdown(remaining);
    } else {
      setActiveOffer(null);
    }
  }, [offers]);

  // Handle Offer Expiration Timeout
  const handleOfferTimeout = async (rideId) => {
    try {
      await apiClient.post(`/rides/${rideId}/expire`);
      setMessage('Ride offer expired (30s timeout). Automatically re-dispatched to next driver.');
      loadDriverData();
    } catch (e) {
      console.error(e);
    }
  };

  // 30-Second Countdown Timer Ticker
  useEffect(() => {
    if (!activeOffer || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleOfferTimeout(activeOffer.ride_id || activeOffer.rideId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeOffer, countdown]);

  // Socket.IO Real-time Channels integration
  useEffect(() => {
    const s = getSocket();
    if (s) {
      // Instant Dispatch Offer Listener
      const unsubOffer = onDispatchOffer((offer) => {
        console.log('⚡ Incoming dispatch offer received via Socket.IO:', offer);
        setActiveOffer({
          id: offer.assignmentId,
          assignment_id: offer.assignmentId,
          ride_id: offer.rideId,
          rideId: offer.rideId,
          pickup_address: offer.pickupAddress,
          destination_address: offer.destinationAddress,
          distance_km: offer.distanceKm,
          fare: offer.fare,
          remaining_seconds: offer.remainingSeconds || 30,
        });
        setCountdown(offer.remainingSeconds || 30);
      });

      // Realtime Ride State Change Listener
      const unsubRide = onRideStatusChanged((data) => {
        if (data) {
          loadDriverData();
        }
      });

      return () => {
        unsubOffer();
        unsubRide();
      };
    }
  }, [driver?.id]);

  // Stream Live GPS Location to Ride Room & Admin Telemetry
  useEffect(() => {
    if (activeRide && ['DRIVER_ASSIGNED', 'DRIVER_ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(activeRide.status)) {
      joinRideRoom(activeRide.id);

      const emitLoc = () => {
        streamDriverLocation({
          rideId: activeRide.id,
          latitude: simLat,
          longitude: simLng,
          heading: simHeading,
          speed: activeRide.status === 'IN_PROGRESS' ? 42 : 20,
        });
      };

      emitLoc();
      const interval = setInterval(emitLoc, 3000);

      return () => {
        leaveRideRoom(activeRide.id);
        clearInterval(interval);
      };
    }
  }, [activeRide?.id, activeRide?.status, simLat, simLng, simHeading]);

  // Periodic Polling for incoming offers
  useEffect(() => {
    if (!driver?.id) return;
    const pollInterval = setInterval(() => {
      apiClient.get(`/drivers/${driver.id}/offers`).then(res => {
        if (res.data.success) {
          setOffers(res.data.data || []);
        }
      }).catch(() => {});
    }, 3500);
    return () => clearInterval(pollInterval);
  }, [driver?.id]);

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

      {/* Ahmedabad Driver Fleet Account Switcher */}
      <div className="card fleet-switcher-card" style={{ marginBottom: '1.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Car size={18} style={{ color: '#2563eb' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Switch Active Driver Account (Ahmedabad Fleet)</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowAddDriver(!showAddDriver)}
            className="btn btn-sm btn-outline"
            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
          >
            {showAddDriver ? 'Close Registration' : '+ Register New Driver Manually'}
          </button>
        </div>

        {/* 5 Driver Selection Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
          {(knownDrivers || []).map((d) => {
            const isCurrent = user?.email === d.email;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => handleSwitchDriver(d.email)}
                disabled={actionLoading}
                style={{
                  padding: '0.85rem',
                  borderRadius: '8px',
                  border: isCurrent ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: isCurrent ? '#eff6ff' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isCurrent ? '0 2px 4px rgba(37,99,235,0.12)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: isCurrent ? '#1d4ed8' : '#1e293b' }}>{d.name}</span>
                  {isCurrent && <span style={{ fontSize: '0.65rem', background: '#2563eb', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>ACTIVE</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '3px' }}>{d.vehicle}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                  <code>{d.plate}</code>
                  <span>{d.location}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Inline Add Driver Form */}
        {showAddDriver && (
          <form onSubmit={handleCreateNewDriver} style={{ marginTop: '1rem', padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px dashed #94a3b8' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.88rem', fontWeight: 600 }}>Register New Custom Driver Account</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'block', marginBottom: '2px' }}>Driver Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hardik Pandya"
                  value={newDrvName}
                  onChange={(e) => setNewDrvName(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'block', marginBottom: '2px' }}>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. hardik@rideflow.io"
                  value={newDrvEmail}
                  onChange={(e) => setNewDrvEmail(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'block', marginBottom: '2px' }}>Vehicle Model & Color</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Toyota Innova (Silver)"
                  value={newDrvVehicle}
                  onChange={(e) => setNewDrvVehicle(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'block', marginBottom: '2px' }}>License Plate</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GJ-01-XY-5555"
                  value={newDrvPlate}
                  onChange={(e) => setNewDrvPlate(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setShowAddDriver(false)} className="btn btn-sm btn-outline">Cancel</button>
              <button type="submit" disabled={actionLoading} className="btn btn-sm btn-primary">
                Register & Switch to This Driver
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Live Incoming Ride Offer Banner (Auto-Dispatch Engine) */}
      {activeOffer && (
        <div className="incoming-offer-banner">
          <div className="offer-header">
            <div className="offer-title">
              <Car size={22} />
              <span>Incoming Ride Offer!</span>
            </div>
            <div className="offer-timer-badge">
              <Clock size={16} />
              <span>Expires in {countdown}s</span>
            </div>
          </div>

          <div className="offer-progress-track">
            <div 
              className="offer-progress-fill" 
              style={{ width: `${Math.max(0, (countdown / 30) * 100)}%` }}
            ></div>
          </div>

          <div className="offer-content-grid">
            <div className="offer-locations">
              <div className="location-row">
                <span className="dot green"></span>
                <div>
                  <span className="loc-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Pickup:</span>
                  <p className="loc-addr" style={{ color: '#FFFFFF', fontWeight: 600 }}>{activeOffer.pickup_address}</p>
                </div>
              </div>
              <div className="location-row">
                <span className="dot red"></span>
                <div>
                  <span className="loc-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Destination:</span>
                  <p className="loc-addr" style={{ color: '#FFFFFF', fontWeight: 600 }}>{activeOffer.destination_address}</p>
                </div>
              </div>
            </div>

            <div className="offer-metrics">
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>
                Proximity: <b>{activeOffer.distance_km} km away</b>
              </span>
              <div className="offer-fare">₹{activeOffer.fare_amount}</div>
            </div>
          </div>

          <div className="offer-actions">
            <button 
              onClick={() => handleAcceptRide(activeOffer.ride_id)} 
              className="btn-accept-offer"
              disabled={actionLoading}
            >
              <CheckCircle2 size={18} />
              <span>Accept Offer ({countdown}s)</span>
            </button>
            <button 
              onClick={() => handleRejectRide(activeOffer.ride_id)} 
              className="btn-reject-offer"
              disabled={actionLoading}
            >
              <XCircle size={18} />
              <span>Decline Offer</span>
            </button>
          </div>
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
              <RideLifecycleTimeline currentStatus={activeRide.status} />

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

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ShieldAlert,
  Play,
  Flag,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import RideLifecycleTimeline from '../components/RideLifecycleTimeline';
import RideMap from '../components/RideMap';
import {
  getSocket,
  joinRideRoom,
  leaveRideRoom,
  onDispatchOffer,
  onRideStatusChanged,
  onDriverSuspendedSos,
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

const resolveDriverRides = (allRides, drv, usr) => {
  if (!allRides || !drv) return { activeRide: null, historyRides: [] };

  const matchesDriver = (id) => (
    id === drv.id || id === drv.user_id || (usr?.id && id === usr.id)
  );

  // 1. Identify active ride for this driver:
  // Must be currently assigned/accepted by this driver and not rejected
  const activeRide = allRides.find(r => {
    if (!matchesDriver(r.driver_id)) return false;
    const myAsgn = Array.isArray(r.assignments) ? r.assignments.find(a => matchesDriver(a.driver_id)) : null;
    if (myAsgn && myAsgn.status === 'REJECTED') return false;
    return ['DRIVER_ASSIGNED', 'DRIVER_ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(r.status);
  }) || null;

  // 2. Resolve history rides:
  // Completed by this driver, or cancelled (either cancelled by passenger or declined/cancelled by driver)
  const historyRides = allRides.reduce((acc, r) => {
    const isFinalDriver = matchesDriver(r.driver_id);
    const myAsgn = Array.isArray(r.assignments) ? r.assignments.find(a => matchesDriver(a.driver_id)) : null;

    if (!isFinalDriver && !myAsgn) return acc;

    let displayStatus = null;

    if (isFinalDriver && r.status === 'COMPLETED') {
      displayStatus = 'COMPLETED';
    } else if (myAsgn && (myAsgn.status === 'REJECTED' || myAsgn.status === 'EXPIRED')) {
      // Driver declined or expired the incoming ride request
      displayStatus = 'CANCELLED';
    } else if (r.status === 'CANCELLED' && (isFinalDriver || myAsgn)) {
      displayStatus = 'CANCELLED';
    }

    if (displayStatus) {
      acc.push({
        ...r,
        driver_display_status: displayStatus,
        driver_note: myAsgn?.status === 'REJECTED' ? 'Request Declined' : myAsgn?.status === 'EXPIRED' ? 'Offer Expired' : null,
      });
    }

    return acc;
  }, []);

  return { activeRide, historyRides };
};

const DriverPortal = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const forceSuspendLogout = (reasonMsg) => {
    if (reasonMsg) {
      sessionStorage.setItem('rideflow_auth_error', reasonMsg);
    }
    logout();
    navigate('/auth?role=driver', { replace: true });
  };
  const [driver, setDriver] = useState(null);
  const [rides, setRides] = useState([]);
  const [tripFilter, setTripFilter] = useState('ALL'); // 'ALL' | 'COMPLETED' | 'CANCELLED'
  const [showAllTrips, setShowAllTrips] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [completedTripModal, setCompletedTripModal] = useState(null);
  const [offers, setOffers] = useState([]);
  const [activeOffer, setActiveOffer] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // GPS Simulation State (Default: Ahmedabad SG Highway)
  const [simLat, setSimLat] = useState(23.0275);
  const [simLng, setSimLng] = useState(72.5076);
  const [simHeading, setSimHeading] = useState(90);

  const loadDriverData = async (userOverride = null) => {
    const activeUser = userOverride || user;
    try {
      setLoading(true);
      setError(null);

      // Fetch driver profile explicitly passing user ID
      const profRes = await apiClient.get('/drivers/profile', {
        params: activeUser?.id ? { user_id: activeUser.id } : {}
      });
      if (profRes.data.success && profRes.data.data) {
        const d = profRes.data.data;
        setDriver(d);
        setSimLat(d.current_latitude);
        setSimLng(d.current_longitude);
        setSimHeading(d.heading || 0);

        // Fetch driver offers specifically for this driver
        const offersRes = await apiClient.get(`/drivers/${d.id}/offers`);
        const driverOffers = (offersRes.data.success && offersRes.data.data) ? offersRes.data.data : [];
        setOffers(driverOffers);

        // Fetch rides with driver_id for optimal backend filtering and assignment resolution
        const ridesRes = await apiClient.get('/rides', {
          params: d?.id ? { driver_id: d.id } : {}
        });
        if (ridesRes.data.success) {
          const allRides = ridesRes.data.data || [];

          const { activeRide: myActive, historyRides: myDriverHistory } = resolveDriverRides(allRides, d, activeUser);
          setActiveRide(myActive);
          setRides(myDriverHistory);

          // If there is an active ride in DRIVER_ASSIGNED, but offers list is empty, synthesize offer
          if (myActive && myActive.status === 'DRIVER_ASSIGNED' && driverOffers.length === 0) {
            setActiveOffer({
              ride_id: myActive.id,
              pickup_address: myActive.pickup_address,
              destination_address: myActive.destination_address,
              fare_amount: myActive.fare_amount,
              distance_km: myActive.distance_km,
              remaining_seconds: 180,
            });
            setCountdown(180);
          }
        }
      }
    } catch (err) {
      const status = err.response?.status;
      const errData = err.response?.data;
      if (status === 401 || (status === 404 && errData?.accountSuspended)) {
        forceSuspendLogout(errData?.message || 'Your driver account has been suspended and removed from the system.');
        return;
      }
      setError(errData?.message || 'Error loading driver profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDriverData();
  }, [user?.id]);

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
        loadDriverData();
      });

      // Realtime Ride State Change Listener
      const unsubRide = onRideStatusChanged((data) => {
        if (data) {
          loadDriverData();
        }
      });

      // Realtime Driver Verification Approval Listener
      const socket = getSocket();
      const handleApprovalUpdate = (data) => {
        if (data && (data.driverId === driver?.id || data.driver?.id === driver?.id)) {
          loadDriverData();
        }
      };
      if (socket) {
        socket.on('driver:approval:updated', handleApprovalUpdate);
      }

      // Realtime Driver Suspended via In-Ride Emergency SOS Listener
      const unsubSuspended = onDriverSuspendedSos((data) => {
        console.warn('⛔ Driver suspended via SOS:', data);
        if (!data?.driverId || data.driverId === driver?.id || data.userId === user?.id) {
          forceSuspendLogout(data?.reason || 'Your account has been suspended and removed due to an in-ride emergency report.');
        }
      });

      return () => {
        unsubOffer();
        unsubRide();
        unsubSuspended();
        if (socket) {
          socket.off('driver:approval:updated', handleApprovalUpdate);
        }
      };
    }
  }, [driver?.id]);

  // Automatic Polling to keep driver state seamlessly synchronized
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (!driver?.id) return;
      apiClient.get(`/drivers/${driver.id}/offers`).then(res => {
        if (res.data?.success) {
          const list = res.data.data || [];
          setOffers(list);
          if (list.length > 0) {
            setActiveOffer(list[0]);
          }
        }
      }).catch(() => { });

      apiClient.get('/rides', {
        params: driver?.id ? { driver_id: driver.id } : {}
      }).then(res => {
        if (res.data?.success && driver?.id) {
          const allRides = res.data.data || [];
          const { activeRide: myActive, historyRides: myDriverHistory } = resolveDriverRides(allRides, driver, user);
          setActiveRide(myActive);
          setRides(myDriverHistory);
        }
      }).catch(() => { });
    }, 2500);

    return () => clearInterval(pollInterval);
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
      }).catch(() => { });
    }, 3500);
    return () => clearInterval(pollInterval);
  }, [driver?.id]);

  // Toggle Availability Status
  const handleToggleAvailability = async () => {
    if (!driver) return;
    setActionLoading(true);
    setError(null);
    setMessage(null);

    if (driver.status === 'SUSPENDED_SOS') {
      setError('⛔ Your account is SUSPENDED due to an emergency safety incident. Action not permitted.');
      setActionLoading(false);
      return;
    }

    if (driver.approval_status === 'PENDING') {
      setError('Your driver profile is pending administrator verification. You cannot go online until approved.');
      setActionLoading(false);
      return;
    }

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
    if (driver?.status === 'SUSPENDED_SOS') {
      setError('⛔ Your account is SUSPENDED due to an emergency safety incident. Action not permitted.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const targetDriverId = driver?.id || activeRide?.driver_id || 'driver-seed-1';
      const res = await apiClient.post(`/rides/${rideId}/accept`, {
        driver_id: targetDriverId,
      });
      if (res.data.success || res.data.status === 'DRIVER_ACCEPTED') {
        setMessage('Ride offer accepted! Proceed to pickup location.');
        await loadDriverData();
      } else {
        setError(res.data.message || 'Failed to accept ride');
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
    if (driver?.status === 'SUSPENDED_SOS') {
      setError('⛔ Your account is SUSPENDED due to an emergency safety incident. Action not permitted.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiClient.post(`/rides/${activeRide.id}/${endpoint}`);
      if (res.data.success) {
        setMessage(successText);
        if (endpoint === 'complete') {
          const finishedRide = res.data?.data || activeRide;
          setCompletedTripModal({
            id: finishedRide.id || activeRide.id,
            pickup_address: finishedRide.pickup_address || activeRide.pickup_address,
            destination_address: finishedRide.destination_address || activeRide.destination_address,
            fare_amount: finishedRide.fare_amount || activeRide.fare_amount,
            distance_km: finishedRide.distance_km || activeRide.distance_km,
            passenger_name: finishedRide.passenger_name || activeRide.passenger_name || 'Passenger',
            vehicle_type: finishedRide.vehicle_type || activeRide.vehicle_type || 'Ride',
          });
          if (activeRide.destination_latitude && activeRide.destination_longitude) {
            setSimLat(activeRide.destination_latitude);
            setSimLng(activeRide.destination_longitude);
          }
        } else if (endpoint === 'arrived' && activeRide.pickup_latitude && activeRide.pickup_longitude) {
          setSimLat(activeRide.pickup_latitude);
          setSimLng(activeRide.pickup_longitude);
        }
        await loadDriverData();
      }
    } catch (err) {
      setError(err.response?.data?.message || `Failed to transition ride status`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="portal-page-wrapper">
      <div className="container driver-portal-page">
        {/* Header Banner */}
        <div className="portal-header">
          <h1 className="portal-title">Welcome, {driver?.name || user?.name || 'Driver'}</h1>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="portal-alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Live Incoming Ride Offer Banner (Auto-Dispatch Engine) */}
        {offers && offers.length > 1 ? (
          <div className="incoming-offer-banner">
            <div className="offer-header">
              <div className="offer-title">
                <Car size={22} />
                <span>Incoming Ride Offers ({offers.length} Requests Available)</span>
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

            <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' }}>
              Multiple concurrent passenger requests received for your location. Select and accept any ride offer below (the others will immediately re-route to the next nearest driver):
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {offers.map((off, idx) => (
                <div
                  key={off.id || off.ride_id || idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                  }}
                >
                  <div className="offer-content-grid" style={{ marginBottom: '1rem' }}>
                    <div className="offer-locations">
                      <div className="location-row">
                        <span className="dot green"></span>
                        <div>
                          <span className="loc-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Pickup:</span>
                          <p className="loc-addr" style={{ color: '#FFFFFF', fontWeight: 600 }}>{off.pickup_address}</p>
                        </div>
                      </div>
                      <div className="location-row">
                        <span className="dot red"></span>
                        <div>
                          <span className="loc-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Destination:</span>
                          <p className="loc-addr" style={{ color: '#FFFFFF', fontWeight: 600 }}>{off.destination_address}</p>
                        </div>
                      </div>
                    </div>

                    <div className="offer-metrics">
                      <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>
                        Passenger: <b>{off.passenger_name || 'Passenger'}</b>
                        {off.distance_km ? ` (${off.distance_km} km away)` : ''}
                      </span>
                      <div className="offer-fare">₹{off.fare_amount}</div>
                    </div>
                  </div>

                  <div className="offer-actions">
                    <button
                      onClick={() => handleAcceptRide(off.ride_id)}
                      className="btn-accept-offer"
                      disabled={actionLoading}
                    >
                      <CheckCircle2 size={18} />
                      <span>Accept Ride Offer</span>
                    </button>
                    <button
                      onClick={() => handleRejectRide(off.ride_id)}
                      className="btn-reject-offer"
                      disabled={actionLoading}
                    >
                      <XCircle size={18} />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeOffer && (
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

        {/* Main Dashboard 2-Column Layout: Left (Driver Info + Active Trip) & Right (Stretched Interactive Map) */}
        <div className="driver-dashboard-grid">
          {/* Left Column: Driver Info + Active Trip Execution */}
          <div className="driver-left-col">
            {/* Driver Suspended SOS Lockout Alert Banner */}
            {driver?.status === 'SUSPENDED_SOS' && (
              <div className="driver-suspended-banner">
                <ShieldAlert size={32} className="driver-suspended-icon" />
                <div>
                  <b className="driver-suspended-title">⛔ DRIVER ACCOUNT SUSPENDED (EMERGENCY SOS)</b>
                  <span className="driver-suspended-desc">
                    Your account has been suspended by System Operations following an In-Ride Passenger Emergency SOS report. All trip dispatch offers, acceptance, and trip completion capabilities have been locked down.
                  </span>
                </div>
              </div>
            )}

            {/* Driver Approval Alert if Pending */}
            {driver?.approval_status === 'PENDING' && (
              <div className="portal-alert" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Clock size={22} style={{ color: '#D97706', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <b style={{ display: 'block', fontSize: '0.95rem', marginBottom: '0.25rem' }}>⏳ Driver Application Pending Administrator Verification</b>
                  <span style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                    Your registration information has been sent to the Operations Administrator. Once verified and approved, your vehicle will be allocated as a driver and ride requests will become available to you.
                  </span>
                </div>
              </div>
            )}

            {/* Driver Profile Card with Availability Toggle */}
            <div className="card driver-profile-card">
              <div className="driver-card-head">
                <div className="driver-head-left">
                  <div className="driver-avatar-circle">
                    <Navigation size={24} />
                  </div>
                  <div>
                    <h3 className="driver-name">{driver?.name || 'Rajesh Kumar'}</h3>
                    <span className="driver-vehicle">{driver?.vehicle_model || 'Toyota Prius (White)'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleAvailability}
                  className={`driver-circular-power-btn ${driver?.status === 'AVAILABLE' ? 'online' : 'offline'}`}
                  disabled={actionLoading || driver?.approval_status === 'PENDING'}
                  title={driver?.approval_status === 'PENDING' ? 'Pending administrator approval' : (driver?.status === 'AVAILABLE' ? 'Online (Click to Go Offline)' : 'Offline (Click to Go Online)')}
                  aria-label={driver?.status === 'AVAILABLE' ? 'Online (Click to Go Offline)' : 'Offline (Click to Go Online)'}
                >
                  <Power size={22} />
                </button>
              </div>
              <div className="driver-details-list">
                <div className="detail-row">
                  <span className="detail-label">Verification:</span>
                  <span className={`badge ${driver?.approval_status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                    {driver?.approval_status === 'APPROVED' ? '✓ VERIFIED PARTNER' : '⏳ PENDING REVIEW'}
                  </span>
                </div>
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
          </div>

          {/* Right Column: Full-Height Stretched Interactive GPS Map Card */}
          <div className="card gps-card driver-map-stretched-card">
            {/* Interactive Telemetry Map */}
            <RideMap
              driverLocation={{
                lat: simLat,
                lng: simLng,
                heading: simHeading,
                name: driver?.name || 'Driver',
              }}
              pickupLocation={activeRide ? {
                lat: activeRide.pickup_latitude,
                lng: activeRide.pickup_longitude,
                address: activeRide.pickup_address,
              } : null}
              destLocation={activeRide ? {
                lat: activeRide.destination_latitude,
                lng: activeRide.destination_longitude,
                address: activeRide.destination_address,
              } : null}
              onMapClick={(lat, lng) => {
                setSimLat(lat);
                setSimLng(lng);
                handleUpdateLocation(lat, lng, simHeading);
              }}
              clickHint="Click map to teleport GPS location"
              statusText={activeRide ? `Active Navigation • ${activeRide.status}` : null}
              height="450px"
              showRoute={!!activeRide}
            />

            <div className="coords-inputs-grid">
              <div className="form-group">
                <label className="input-label">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  className="form-input"
                  value={simLat}
                  onChange={(e) => setSimLat(e.target.value)}
                  onBlur={() => handleUpdateLocation()}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateLocation()}
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
                  onBlur={() => handleUpdateLocation()}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateLocation()}
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
                  onBlur={() => handleUpdateLocation()}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateLocation()}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Completed Rides Table */}
        <div className="card history-card">
          <div className="history-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 className="history-title">Trips & Execution Records</h3>
              <span style={{ fontSize: '0.8rem', color: '#64748B', display: 'block', marginTop: '0.2rem' }}>
                Showing {driver?.name ? `${driver.name}'s` : 'driver'} completed and cancelled rides
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              {/* Filter Toggle Buttons: All / Completed / Cancelled */}
              <div className="trip-filter-tabs" style={{ display: 'inline-flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                <button
                  type="button"
                  onClick={() => setTripFilter('ALL')}
                  style={{
                    border: 'none',
                    background: tripFilter === 'ALL' ? '#FFFFFF' : 'transparent',
                    color: tripFilter === 'ALL' ? '#1E293B' : '#64748B',
                    fontWeight: tripFilter === 'ALL' ? 700 : 500,
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: tripFilter === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  All ({rides.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTripFilter('COMPLETED')}
                  style={{
                    border: 'none',
                    background: tripFilter === 'COMPLETED' ? '#10B981' : 'transparent',
                    color: tripFilter === 'COMPLETED' ? '#FFFFFF' : '#64748B',
                    fontWeight: tripFilter === 'COMPLETED' ? 700 : 500,
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: tripFilter === 'COMPLETED' ? '0 1px 3px rgba(16,185,129,0.3)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Completed ({rides.filter(r => (r.driver_display_status || r.status) === 'COMPLETED').length})
                </button>
                <button
                  type="button"
                  onClick={() => setTripFilter('CANCELLED')}
                  style={{
                    border: 'none',
                    background: tripFilter === 'CANCELLED' ? '#EF4444' : 'transparent',
                    color: tripFilter === 'CANCELLED' ? '#FFFFFF' : '#64748B',
                    fontWeight: tripFilter === 'CANCELLED' ? 700 : 500,
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: tripFilter === 'CANCELLED' ? '0 1px 3px rgba(239,68,68,0.3)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Cancelled ({rides.filter(r => (r.driver_display_status || r.status) === 'CANCELLED').length})
                </button>
              </div>
            </div>
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
                {(() => {
                  const displayedRides = rides.filter(r => {
                    const s = r.driver_display_status || r.status;
                    if (tripFilter === 'COMPLETED') return s === 'COMPLETED';
                    if (tripFilter === 'CANCELLED') return s === 'CANCELLED';
                    return true;
                  });
                  return displayedRides.length > 0 ? (
                    (showAllTrips ? displayedRides : displayedRides.slice(0, 5)).map((r) => (
                      <tr key={r.id}>
                        <td><code>{r.id.substring(0, 12)}...</code></td>
                        <td><b>{r.passenger_name || 'Passenger'}</b></td>
                        <td>{r.pickup_address}</td>
                        <td>{r.destination_address}</td>
                        <td><b>₹{r.fare_amount}</b></td>
                        <td>
                          <span className={`badge ${(r.driver_display_status || r.status) === 'COMPLETED' ? 'badge-success' : 'badge-neutral'}`}>
                            {r.driver_display_status || r.status}
                          </span>
                          {r.driver_note && (
                            <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '2px', fontWeight: 500 }}>
                              {r.driver_note}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        {tripFilter === 'COMPLETED'
                          ? 'No completed rides recorded for this driver yet.'
                          : tripFilter === 'CANCELLED'
                            ? 'No cancelled rides recorded for this driver.'
                            : 'No completed or cancelled rides for this driver yet.'}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>

          {(() => {
            const displayedRides = rides.filter(r => {
              const s = r.driver_display_status || r.status;
              if (tripFilter === 'COMPLETED') return s === 'COMPLETED';
              if (tripFilter === 'CANCELLED') return s === 'CANCELLED';
              return true;
            });
            return displayedRides.length > 5 ? (
              <div style={{ padding: '0.85rem', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setShowAllTrips(prev => !prev)}
                  className="btn btn-outline btn-sm"
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#2563EB',
                    borderColor: '#BFDBFE',
                    background: '#EFF6FF',
                    padding: '0.45rem 1.25rem',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer'
                  }}
                >
                  {showAllTrips ? (
                    <>Show Less <ChevronUp size={15} /></>
                  ) : (
                    <>Show More ({displayedRides.length - 5} older trips) <ChevronDown size={15} /></>
                  )}
                </button>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* Pop Message Modal: Trip Completed & Fare Recorded */}
      {completedTripModal && (
        <div 
          className="completed-modal-backdrop" 
          onClick={(e) => { if (e.target === e.currentTarget) setCompletedTripModal(null); }}
        >
          <div className="completed-modal-dialog">
            {/* Close 'X' Button */}
            <button 
              onClick={() => setCompletedTripModal(null)}
              className="completed-modal-close-btn"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Celebration Icon Badge */}
            <div className="celebrate-icon-ring">
              <CheckCircle2 size={38} color="#10B981" />
            </div>

            <h2 className="completed-title">Trip Completed Successfully! 🎉</h2>

            {/* Trip Route & Fare Preview */}
            <div className="completed-trip-card">
              <div className="completed-route-col">
                <div className="route-stop">
                  <span className="route-stop-dot green"></span>
                  <span className="route-stop-text">{completedTripModal.pickup_address}</span>
                </div>
                <div className="route-stop-divider"></div>
                <div className="route-stop">
                  <span className="route-stop-dot red"></span>
                  <span className="route-stop-text">{completedTripModal.destination_address}</span>
                </div>
              </div>
              <div className="completed-fare-tag">
                <span className="fare-tag-label">Fare Collected</span>
                <span className="fare-tag-val">₹{completedTripModal.fare_amount}</span>
              </div>
            </div>

            {/* Passenger & Trip Details Pill/Grid */}
            <div className="driver-modal-stats-card">
              <div className="driver-modal-stat-row">
                <span className="driver-stat-title">Passenger:</span>
                <span className="driver-stat-val"><b>{completedTripModal.passenger_name || 'Passenger'}</b></span>
              </div>
              {completedTripModal.distance_km && (
                <div className="driver-modal-stat-row">
                  <span className="driver-stat-title">Distance:</span>
                  <span className="driver-stat-val"><b>{completedTripModal.distance_km} km</b></span>
                </div>
              )}
              {completedTripModal.id && (
                <div className="driver-modal-stat-row">
                  <span className="driver-stat-title">Ride ID:</span>
                  <span className="driver-stat-val font-mono" style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    {completedTripModal.id.slice(0, 18)}...
                  </span>
                </div>
              )}
            </div>

            {/* Ready for Next Ride Action Button */}
            <button 
              type="button" 
              onClick={() => setCompletedTripModal(null)}
              className="driver-modal-dismiss-btn"
            >
              <Car size={18} /> Ready for Next Ride
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverPortal;

import React, { useState, useEffect, useRef } from 'react';
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
  Sliders,
  AlertTriangle,
  X
} from 'lucide-react';
import StatCard from '../components/StatCard';
import RideLifecycleTimeline from '../components/RideLifecycleTimeline';
import { 
  getSocket, 
  joinRideRoom, 
  leaveRideRoom, 
  onRideStatusChanged, 
  onDriverLocation,
  onNoDriversAvailable
} from '../services/socket';
import './PassengerPortal.css';

const LOCATION_PRESETS = [
  { name: 'SG Highway (Iscon Cross Road)', lat: 23.0275, lng: 72.5076 },
  { name: 'Vastrapur Lake / AlphaOne Mall', lat: 23.0373, lng: 72.5303 },
  { name: 'Navrangpura (CG Road)', lat: 23.0372, lng: 72.5613 },
  { name: 'Sabarmati Riverfront (Ashram Road)', lat: 23.0338, lng: 72.5714 },
  { name: 'Prahlad Nagar Corporate Road', lat: 23.0125, lng: 72.5108 },
  { name: 'Ahmedabad Junction (Kalupur Station)', lat: 23.0233, lng: 72.6006 },
  { name: 'SVP International Airport (SVPIA)', lat: 23.0734, lng: 72.6266 },
  { name: 'GIFT City / Gandhinagar Hub', lat: 23.1598, lng: 72.6842 },
];

const PassengerPortal = () => {
  const { user, switchPassenger, register, knownPassengers } = useAuth();
  const [profile, setProfile] = useState(null);
  const [rides, setRides] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [liveDriverLocation, setLiveDriverLocation] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // No Drivers Available Pop Modal State
  const [showNoDriverModal, setShowNoDriverModal] = useState(false);
  const [noDriverReason, setNoDriverReason] = useState('All nearby drivers have declined or are currently busy. Your ride request has been automatically cancelled.');
  const [retryingDispatch, setRetryingDispatch] = useState(false);
  const [dismissedModalRideId, setDismissedModalRideId] = useState(null);
  const [cancelledRideInfo, setCancelledRideInfo] = useState(null);
  const [modalCountdown, setModalCountdown] = useState(60);

  // Keep No Driver Modal visible on screen for 1 minute (60 seconds) with live countdown & auto-dismiss
  useEffect(() => {
    let timer;
    if (showNoDriverModal) {
      setModalCountdown(60);
      timer = setInterval(() => {
        setModalCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowNoDriverModal(false);
            const rideIdToDismiss = activeRide?.id || cancelledRideInfo?.id;
            if (rideIdToDismiss) {
              setDismissedModalRideId(rideIdToDismiss);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showNoDriverModal, activeRide?.id, cancelledRideInfo?.id]);

  // Automatically pop up modal when active ride is in PENDING state (No driver available)
  useEffect(() => {
    if (activeRide && activeRide.status === 'PENDING' && dismissedModalRideId !== activeRide.id) {
      setShowNoDriverModal(true);
    }
  }, [activeRide?.id, activeRide?.status, dismissedModalRideId]);

  // Manual Passenger Management State
  const [showAddPassenger, setShowAddPassenger] = useState(false);
  const [newPassName, setNewPassName] = useState('');
  const [newPassEmail, setNewPassEmail] = useState('');
  const [newPassPhone, setNewPassPhone] = useState('');
  const [newPassPassword, setNewPassPassword] = useState('pass123');

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
      const profRes = await apiClient.get('/passengers/profile', {
        params: user?.id ? { user_id: user.id } : {}
      });
      if (profRes.data.success) {
        setProfile(profRes.data.data);
      }

      // Fetch rides
      const ridesRes = await apiClient.get('/rides');
      if (ridesRes.data.success) {
        const allRides = ridesRes.data.data || [];
        setRides(allRides);

        // Identify current active ride (not COMPLETED or CANCELLED)
        const myPassId = profRes.data?.data?.id;
        const currentActive = allRides.find(
          r => (myPassId ? r.passenger_id === myPassId : true) && !['COMPLETED', 'CANCELLED'].includes(r.status)
        );
        setActiveRide(currentActive || null);

        // Check if most recent ride was auto-cancelled due to NO_DRIVERS
        const cancelledNoDrivers = allRides.find(
          r => r.status === 'CANCELLED' && (r.cancellation_reason?.includes('NO_DRIVERS') || r.cancellation_reason?.includes('DRIVERS_BUSY'))
        );
        if (cancelledNoDrivers) {
          setCancelledRideInfo(cancelledNoDrivers);
          if (dismissedModalRideId !== cancelledNoDrivers.id) {
            setShowNoDriverModal(true);
            setNoDriverReason('No drivers available at this moment. All nearby drivers have declined the ride request. Your ride request has been automatically cancelled.');
            setMessage('Ride request automatically cancelled: No drivers available.');
          }
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error loading passenger data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  // Automatic Polling to guarantee instant portal-to-portal synchronization
  useEffect(() => {
    const pollInterval = setInterval(() => {
      apiClient.get('/rides').then(ridesRes => {
        if (ridesRes.data?.success) {
          const allRides = ridesRes.data.data || [];
          setRides(allRides);
          const currentActive = allRides.find(
            r => (profile?.id ? r.passenger_id === profile.id : true) && !['COMPLETED', 'CANCELLED'].includes(r.status)
          );
          setActiveRide(currentActive || null);

          // Check if ride was auto-cancelled due to NO_DRIVERS
          const cancelledNoDrivers = allRides.find(
            r => r.status === 'CANCELLED' && (r.cancellation_reason?.includes('NO_DRIVERS') || r.cancellation_reason?.includes('DRIVERS_BUSY'))
          );
          if (cancelledNoDrivers) {
            setCancelledRideInfo(cancelledNoDrivers);
            if (dismissedModalRideId !== cancelledNoDrivers.id) {
              setShowNoDriverModal(true);
              setNoDriverReason('No drivers available at this moment. All nearby drivers have declined the ride request. Your ride request has been automatically cancelled.');
              setMessage('Ride request automatically cancelled: No drivers available.');
            }
          }
        }
      }).catch(() => {});
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [profile?.id]);

  // Socket.IO Real-time Channels integration
  useEffect(() => {
    const s = getSocket();
    if (s) {
      setSocketConnected(s.connected);
      const onConn = () => setSocketConnected(true);
      const onDis = () => setSocketConnected(false);
      s.on('connect', onConn);
      s.on('disconnect', onDis);

      const unsubStatus = onRideStatusChanged((data) => {
        if (data) {
          console.log('⚡ Realtime ride status received via Socket.IO:', data.status);
          if (data.noDriversAvailable || (data.status === 'CANCELLED' && data.cancellation_reason?.includes('NO_DRIVERS'))) {
            setShowNoDriverModal(true);
            if (data.message) setNoDriverReason(data.message);
            if (data.ride) setCancelledRideInfo(data.ride);
          }
          loadData();
        }
      });

      const unsubNoDrivers = onNoDriversAvailable((data) => {
        console.warn('⚠️ No drivers available event received:', data);
        setShowNoDriverModal(true);
        if (data?.message) setNoDriverReason(data.message);
        if (data?.ride) setCancelledRideInfo(data.ride);
        loadData();
      });

      return () => {
        s.off('connect', onConn);
        s.off('disconnect', onDis);
        unsubStatus();
        unsubNoDrivers();
      };
    }
  }, []);

  // Join Ride Channel & Listen to Driver GPS Location Stream
  useEffect(() => {
    if (activeRide?.id && !['COMPLETED', 'CANCELLED'].includes(activeRide.status)) {
      joinRideRoom(activeRide.id);

      const unsubLoc = onDriverLocation((loc) => {
        setLiveDriverLocation(loc);
      });

      return () => {
        leaveRideRoom(activeRide.id);
        unsubLoc();
      };
    } else {
      setLiveDriverLocation(null);
    }
  }, [activeRide?.id, activeRide?.status]);

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
    setDismissedModalRideId(null);
    setCancelledRideInfo(null);
    setShowNoDriverModal(false);

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
        const assignedDriver = res.data.dispatch?.driver;
        const driverNotice = assignedDriver 
          ? ` Nearest driver assigned: ${assignedDriver.name} (${assignedDriver.vehicle_model || 'Vehicle'}, ${assignedDriver.license_plate}). You can open the Driver Portal and switch to their account to accept & complete the trip!` 
          : ' System is matching nearest available driver.';
        setMessage('Ride request created!' + driverNotice);
        setActiveRide(res.data.data);
        await loadData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit ride request');
    } finally {
      setBookingLoading(false);
    }
  };

  // Switch Active Passenger Account
  const handleSwitchPassenger = async (email) => {
    try {
      setBookingLoading(true);
      setError(null);
      await switchPassenger(email);
      setMessage(`Switched active passenger account to: ${email}`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to switch passenger');
    } finally {
      setBookingLoading(false);
    }
  };

  // Create & Register New Passenger Manually
  const handleCreateNewPassenger = async (e) => {
    e.preventDefault();
    try {
      setBookingLoading(true);
      setError(null);
      await register({
        name: newPassName,
        email: newPassEmail,
        phone: newPassPhone || '+91 98000 00000',
        password: newPassPassword,
        role: 'PASSENGER',
      });
      setMessage(`New passenger created & active: ${newPassName} (${newPassEmail})`);
      setShowAddPassenger(false);
      setNewPassName('');
      setNewPassEmail('');
      setNewPassPhone('');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create passenger');
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
        setShowNoDriverModal(false);
        await loadData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel ride');
    }
  };

  // Dismiss No Driver Modal
  const handleCloseModal = () => {
    setShowNoDriverModal(false);
    const rideIdToDismiss = activeRide?.id || cancelledRideInfo?.id;
    if (rideIdToDismiss) {
      setDismissedModalRideId(rideIdToDismiss);
    }
  };

  // Retry Auto-Dispatch when no drivers are available
  const handleRetryDispatch = async () => {
    if (!activeRide) return;
    setRetryingDispatch(true);
    setError(null);
    setDismissedModalRideId(null);
    try {
      const res = await apiClient.post(`/rides/${activeRide.id}/dispatch`);
      if (res.data?.dispatched) {
        setShowNoDriverModal(false);
        setMessage(`Driver matched! Nearest driver ${res.data.driver?.name || 'Driver'} assigned.`);
        await loadData();
      } else {
        setShowNoDriverModal(true);
        setMessage('Still no available drivers nearby. Please try again in a few moments or cancel.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retry dispatch');
    } finally {
      setRetryingDispatch(false);
    }
  };

  // Cancel directly from No Drivers Available Modal
  const handleCancelFromModal = async () => {
    if (!activeRide) {
      setShowNoDriverModal(false);
      return;
    }
    await handleCancelRide(activeRide.id);
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
      case 'PENDING': return (
        <span 
          className="badge" 
          onClick={() => setShowNoDriverModal(true)}
          style={{ cursor: 'pointer', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', fontWeight: 700 }}
          title="Click to view details"
        >
          ⚠️ NO DRIVERS AVAILABLE
        </span>
      );
      default: return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div className="container passenger-portal-page">
      {/* Pop Message Modal: No Drivers Available */}
      {showNoDriverModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem',
        }}>
          <div style={{
            maxWidth: '460px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid #fee2e2',
            padding: '2rem',
            textAlign: 'center',
            position: 'relative'
          }}>
            {/* Close 'X' Button */}
            <button 
              onClick={handleCloseModal}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '0.25rem'
              }}
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Warning Icon Badge */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem auto',
              border: '2px solid #FCA5A5'
            }}>
              <AlertTriangle size={32} />
            </div>

            {/* 1-Minute Active Countdown Indicator Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#FFFBEB',
              color: '#B45309',
              border: '1px solid #FDE68A',
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              fontWeight: 700,
              marginBottom: '0.75rem'
            }}>
              <Clock size={15} /> Showing on screen: {modalCountdown}s remaining (1 min)
            </div>

            {/* Progress Bar (60s countdown) */}
            <div style={{
              width: '100%',
              height: '5px',
              background: '#F1F5F9',
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '1.25rem'
            }}>
              <div style={{
                width: `${(modalCountdown / 60) * 100}%`,
                height: '100%',
                background: modalCountdown > 15 ? '#DC2626' : '#EF4444',
                transition: 'width 1s linear'
              }} />
            </div>

            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1E293B', marginBottom: '0.5rem' }}>
              No Driver Available At This Moment
            </h3>

            <p style={{ fontSize: '0.92rem', color: '#64748B', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              {noDriverReason || 'All nearby drivers have declined the ride request or are currently unavailable. Your ride request has been automatically cancelled.'}
            </p>

            {(activeRide || cancelledRideInfo) && (
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
                textAlign: 'left',
                fontSize: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748B' }}>Pickup:</span>
                  <b style={{ color: '#1E293B' }}>{(activeRide || cancelledRideInfo).pickup_address}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748B' }}>Destination:</span>
                  <b style={{ color: '#1E293B' }}>{(activeRide || cancelledRideInfo).destination_address}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Fare:</span>
                  <b style={{ color: '#2563EB' }}>₹{(activeRide || cancelledRideInfo).fare_amount}</b>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button 
                onClick={() => {
                  handleCloseModal();
                  document.querySelector('.booking-card')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', justifyContent: 'center', fontSize: '0.95rem' }}
              >
                <Car size={16} /> Book Another Ride
              </button>

              <button 
                onClick={handleCloseModal}
                className="btn btn-outline"
                style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
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
        <div className="portal-alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          {error.includes('Forbidden') && (
            <button 
              className="btn btn-sm btn-outline"
              onClick={() => handleSwitchPassenger('passenger@rideflow.io')}
              style={{ background: '#fff', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
            >
              Switch to Passenger Account
            </button>
          )}
        </div>
      )}

      {/* Passenger Account Switcher & Manual Add Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={18} style={{ color: '#16a34a' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Active Passenger Account</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowAddPassenger(!showAddPassenger)}
            className="btn btn-sm btn-outline"
            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
          >
            {showAddPassenger ? 'Close Registration' : '+ Add New Passenger Manually'}
          </button>
        </div>

        {/* Quick Passenger Selector Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: showAddPassenger ? '1rem' : 0 }}>
          {(knownPassengers || []).map((p) => {
            const isCurrent = user?.email === p.email;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSwitchPassenger(p.email)}
                disabled={bookingLoading}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '6px',
                  border: isCurrent ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  background: isCurrent ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: isCurrent ? 600 : 400,
                  color: isCurrent ? '#15803d' : '#334155',
                }}
              >
                <span>{p.name}</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>({p.email})</span>
                {isCurrent && <span style={{ fontSize: '0.65rem', background: '#16a34a', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>ACTIVE</span>}
              </button>
            );
          })}
        </div>

        {/* Inline Add Passenger Form */}
        {showAddPassenger && (
          <form onSubmit={handleCreateNewPassenger} style={{ marginTop: '0.75rem', padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px dashed #94a3b8' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.88rem', fontWeight: 600 }}>Register New Custom Passenger Account</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'block', marginBottom: '2px' }}>Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Sarabhai"
                  value={newPassName}
                  onChange={(e) => setNewPassName(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'block', marginBottom: '2px' }}>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. vikram@rideflow.io"
                  value={newPassEmail}
                  onChange={(e) => setNewPassEmail(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'block', marginBottom: '2px' }}>Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 98000 00000"
                  value={newPassPhone}
                  onChange={(e) => setNewPassPhone(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, display: 'block', marginBottom: '2px' }}>Password</label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={newPassPassword}
                  onChange={(e) => setNewPassPassword(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setShowAddPassenger(false)} className="btn btn-sm btn-outline">Cancel</button>
              <button type="submit" disabled={bookingLoading} className="btn btn-sm btn-primary">
                Create & Switch to This Passenger
              </button>
            </div>
          </form>
        )}
      </div>

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
              <RideLifecycleTimeline currentStatus={activeRide.status} />

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

              {activeRide.driver_name && (
                <div className="assigned-driver-card" style={{
                  background: 'var(--slate-50)',
                  border: '1px solid var(--slate-200)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '0.75rem'
                }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--slate-500)', textTransform: 'uppercase', fontWeight: 700 }}>Assigned Driver</span>
                    <h4 style={{ margin: '0.15rem 0', color: 'var(--slate-900)', fontSize: '0.95rem' }}>{activeRide.driver_name}</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--slate-600)' }}>{activeRide.vehicle_model} • <code>{activeRide.license_plate}</code></span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#D97706', fontWeight: 700, fontSize: '0.9rem' }}>
                      <Star size={14} /> {activeRide.driver_rating || '4.90'}
                    </span>
                    <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, marginTop: '0.2rem' }}>
                      ● Assigned & En Route
                    </div>
                  </div>
                </div>
              )}

              {/* Socket.IO Live Driver GPS Telemetry Stream */}
              {liveDriverLocation && (
                <div style={{
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.65rem 0.85rem',
                  marginTop: '0.65rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  fontSize: '0.8rem',
                  color: '#065F46'
                }}>
                  <span className="dot pulse-green" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span>
                  <div>
                    <b>⚡ Socket.IO Live GPS Stream:</b> {liveDriverLocation.driverName || 'Driver'} at <code>{Number(liveDriverLocation.latitude).toFixed(4)}° N, {Number(liveDriverLocation.longitude).toFixed(4)}° E</code>
                    {liveDriverLocation.speed > 0 && <span style={{ marginLeft: '0.4rem', color: '#047857' }}>({liveDriverLocation.speed} km/h)</span>}
                  </div>
                </div>
              )}

              {/* No Drivers Available Warning Banner in Card */}
              {activeRide.status === 'PENDING' && !activeRide.driver_id && (
                <div style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  marginTop: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  color: '#991B1B',
                  fontSize: '0.85rem'
                }}>
                  <AlertTriangle size={20} style={{ flexShrink: 0, color: '#DC2626' }} />
                  <div style={{ flex: 1 }}>
                    <b style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.15rem' }}>No Driver Available At This Moment</b>
                    <span>All nearby drivers declined or timed out. You can retry dispatch or cancel.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button 
                      onClick={() => setShowNoDriverModal(true)}
                      className="btn btn-sm btn-outline"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', background: '#fff' }}
                    >
                      View Details
                    </button>
                    <button 
                      onClick={handleRetryDispatch}
                      disabled={retryingDispatch}
                      className="btn btn-sm btn-primary"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    >
                      <RefreshCw size={13} className={retryingDispatch ? 'spin' : ''} /> Retry
                    </button>
                  </div>
                </div>
              )}

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
              {cancelledRideInfo && (cancelledRideInfo.cancellation_reason?.includes('NO_DRIVERS') || cancelledRideInfo.cancellation_reason?.includes('DRIVERS_BUSY')) && (
                <div style={{
                  width: '100%',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '12px',
                  padding: '1.1rem 1.25rem',
                  marginBottom: '1.25rem',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.1)'
                }}>
                  <AlertTriangle size={28} style={{ color: '#DC2626', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <b style={{ color: '#991B1B', fontSize: '1rem', display: 'block', marginBottom: '0.2rem' }}>
                      No Driver Available At This Moment
                    </b>
                    <span style={{ color: '#7F1D1D', fontSize: '0.88rem', lineHeight: 1.4 }}>
                      All nearby drivers have declined the ride request. Your ride request has been automatically cancelled.
                    </span>
                  </div>
                  <button 
                    onClick={() => setShowNoDriverModal(true)}
                    className="btn btn-sm btn-outline"
                    style={{ background: '#ffffff', borderColor: '#DC2626', color: '#DC2626', fontWeight: 700, flexShrink: 0, padding: '0.45rem 0.85rem' }}
                  >
                    View Popup Modal
                  </button>
                </div>
              )}
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

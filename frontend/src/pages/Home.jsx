import React from 'react';
import { Link } from 'react-router-dom';
import { Car, MapPin, Zap, Navigation, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPortalUrl } from '../utils/portalRouter';
import './Home.css';

const Home = () => {
  const { user, isAuthenticated } = useAuth();

  // If already authenticated with the correct role, open portal directly; otherwise open role-specific sign-in/register page
  const passengerTarget = getPortalUrl('PASSENGER', (isAuthenticated && user?.role === 'PASSENGER') ? '/passenger' : '/auth?role=passenger');
  const driverTarget = getPortalUrl('DRIVER', (isAuthenticated && user?.role === 'DRIVER') ? '/driver' : '/auth?role=driver');

  return (
    <div className="home-page">
      {/* Hero Section with High-Resolution Car Background */}
      <section className="hero-section">
        <div className="container hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              Distributed Ride Booking & <span className="highlight-text">Driver Dispatch</span> System
            </h1>
            <p className="hero-desc">
              GoDrop delivers fast, reliable, and intelligent on-demand urban mobility. 
              Effortlessly book rides with instant automated driver dispatching, live GPS route navigation, 
              and transparent upfront fares engineered for seamless city commutes.
            </p>

            <div className="hero-cta-group">
              <a href={passengerTarget} className="btn btn-hero-primary">
                <Car size={20} />
                <span>Passenger Portal</span>
              </a>
              <a href={driverTarget} className="btn btn-hero-secondary">
                <MapPin size={20} />
                <span>Driver Portal</span>
              </a>
            </div>

            {/* Feature Highlights Pills */}
            <div className="hero-feature-pills">
              <span className="hero-feature-pill">
                <Zap size={14} className="pill-icon-amber" /> Sub-Second Dispatch
              </span>
              <span className="hero-feature-pill">
                <Navigation size={14} className="pill-icon-blue" /> Live GPS Tracking
              </span>
              <span className="hero-feature-pill">
                <ShieldCheck size={14} className="pill-icon-green" /> Concurrency Protected
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;

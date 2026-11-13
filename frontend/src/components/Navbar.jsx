import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Car, 
  MapPin, 
  Users, 
  ShieldCheck, 
  Cpu, 
  Activity, 
  Menu, 
  X 
} from 'lucide-react';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { path: '/', label: 'Overview', icon: <Car size={18} /> },
    { path: '/passenger', label: 'Passenger Portal', icon: <Users size={18} /> },
    { path: '/driver', label: 'Driver Portal', icon: <MapPin size={18} /> },
    { path: '/admin', label: 'Admin Ops', icon: <ShieldCheck size={18} /> },
    { path: '/architecture', label: 'System Design', icon: <Cpu size={18} /> },
  ];

  return (
    <header className="navbar-header">
      <div className="container navbar-container">
        <Link to="/" className="navbar-brand">
          <div className="brand-icon-wrapper">
            <Car size={22} className="brand-icon" />
          </div>
          <div className="brand-text-group">
            <span className="brand-title">RideFlow</span>
            <span className="brand-badge">Distributed</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="desktop-nav">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* System Health Quick Status Badge */}
        <div className="navbar-actions">
          <div className="system-status-pill">
            <span className="status-dot-pulse"></span>
            <span className="status-text">Milestone 1 Active</span>
          </div>
          <button 
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-drawer">
          <div className="container mobile-drawer-content">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`mobile-nav-item ${location.pathname === link.path ? 'mobile-nav-item-active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;

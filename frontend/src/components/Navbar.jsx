import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Car, 
  MapPin, 
  Users, 
  ShieldCheck, 
  Cpu, 
  LogIn, 
  LogOut, 
  User, 
  Menu, 
  X 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();

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

        {/* User Authentication & Session Action */}
        <div className="navbar-actions">
          {isAuthenticated ? (
            <div className="nav-user-profile">
              <span className={`user-role-badge badge-role-${user.role.toLowerCase()}`}>
                {user.role}
              </span>
              <span className="user-name-text">{user.name}</span>
              <button 
                onClick={logout} 
                className="btn-logout-icon" 
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link to="/auth" className="btn btn-primary btn-sm">
              <LogIn size={15} />
              <span>Sign In</span>
            </Link>
          )}

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
            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
              {isAuthenticated ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Logged in: <b>{user.name}</b> ({user.role})</span>
                  <button onClick={logout} className="btn btn-secondary btn-sm">Sign Out</button>
                </div>
              ) : (
                <Link to="/auth" className="btn btn-primary" onClick={() => setMobileMenuOpen(false)}>
                  <LogIn size={16} /> Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;

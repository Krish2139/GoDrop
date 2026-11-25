import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Car, LogIn, LogOut, ChevronDown, Navigation, Activity, Home as HomeIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navigateToPortal, getPortalUrl } from '../utils/portalRouter';
import './Navbar.css';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isHomeContext =
    !window.location.port ||
    window.location.port === '3000' ||
    location.pathname === '/' ||
    location.pathname === '/architecture';

  const handleSignOut = () => {
    logout();
    navigateToPortal('HOME', '/', navigate);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  return (
    <header className="navbar-header">
      <div className="container navbar-container">
        {/* Brand Logo & Name: Directly opens Home page on port 3000 */}
        <a 
          href={getPortalUrl('HOME', '/')} 
          onClick={(e) => {
            if (window.location.port === '3000' || !window.location.port) {
              e.preventDefault();
              navigate('/');
            }
          }}
          className="navbar-brand"
          title="GoDrop Home"
        >
          <div className="brand-logo-pill">
            <img src="/godrop-logo.png" alt="GoDrop" className="brand-logo-img" />
          </div>
        </a>

        {/* Home Screen Navigation Bar Links */}
        {isHomeContext && (
          <nav className="home-arch-nav" aria-label="Primary Navigation">
            <Link
              to="/"
              className={`nav-item ${location.pathname === '/' ? 'nav-item-active' : ''}`}
            >
              <HomeIcon size={16} />
              <span>Home</span>
            </Link>
            <Link
              to="/architecture"
              className={`nav-item ${location.pathname === '/architecture' ? 'nav-item-active' : ''}`}
            >
              <Activity size={16} />
              <span>System Architecture</span>
            </Link>
          </nav>
        )}

        {/* User Authentication & Session Action */}
        <div className="navbar-actions">
          {isAuthenticated ? (
            <div className="nav-user-profile">
              <span className={`user-role-badge badge-role-${user.role.toLowerCase()}`}>
                {user.role}
              </span>
              <span className="user-name-text">{user.name}</span>
              <button 
                onClick={handleSignOut} 
                className="btn-logout-icon" 
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="signin-dropdown-wrap" ref={dropdownRef}>
              <button 
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="btn btn-primary btn-sm signin-dropdown-trigger"
                aria-expanded={dropdownOpen}
              >
                <LogIn size={15} />
                <span>Sign In</span>
                <ChevronDown size={14} className={`dropdown-chevron ${dropdownOpen ? 'open' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="signin-dropdown-menu">
                  <button 
                    type="button"
                    className="signin-dropdown-item"
                    onClick={() => {
                      setDropdownOpen(false);
                      navigateToPortal('PASSENGER', '/auth?role=passenger', navigate);
                    }}
                  >
                    <div className="dropdown-item-icon passenger">
                      <Car size={18} />
                    </div>
                    <div className="dropdown-item-text">
                      <span className="dropdown-item-title">Passenger</span>
                      <span className="dropdown-item-desc">Sign in to book rides</span>
                    </div>
                  </button>

                  <button 
                    type="button"
                    className="signin-dropdown-item"
                    onClick={() => {
                      setDropdownOpen(false);
                      navigateToPortal('DRIVER', '/auth?role=driver', navigate);
                    }}
                  >
                    <div className="dropdown-item-icon driver">
                      <Navigation size={18} />
                    </div>
                    <div className="dropdown-item-text">
                      <span className="dropdown-item-title">Driver</span>
                      <span className="dropdown-item-desc">Sign in to driver terminal</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;

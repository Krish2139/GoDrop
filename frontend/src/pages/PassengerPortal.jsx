import React from 'react';
import { Users, MapPin, Calendar, Clock, AlertCircle } from 'lucide-react';

const PassengerPortal = () => {
  return (
    <div className="container" style={{ padding: '2.5rem 1.5rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '2rem',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '1.25rem'
      }}>
        <div>
          <div className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Module A</div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--slate-900)' }}>
            Passenger Portal
          </h1>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.95rem' }}>
            Book rides, select pickup and destination coordinates, and track assigned drivers in real-time.
          </p>
        </div>
        <div className="badge badge-warning">
          <Clock size={14} /> Scheduled for Milestone 5
        </div>
      </div>

      <div className="card" style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center', padding: '3rem 2rem' }}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary-50)',
          color: 'var(--primary-600)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto'
        }}>
          <Users size={32} />
        </div>
        <h3 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--slate-900)' }}>
          Passenger Dashboard & Booking Interface
        </h3>
        <p style={{ color: 'var(--slate-600)', lineHeight: '1.6', marginBottom: '1.5rem', fontSize: '0.925rem' }}>
          This portal will feature registration/login, simulated coordinate selection (e.g. Downtown to Airport), 
          instant fare estimate, automatic driver assignment notifications, and live Socket.IO trip tracking.
        </p>

        <div style={{
          background: 'var(--slate-50)',
          border: '1px solid var(--slate-200)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          textAlign: 'left',
          fontSize: '0.85rem',
          color: 'var(--slate-600)',
          marginBottom: '1.5rem'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--slate-800)', marginBottom: '0.4rem' }}>
            Upcoming Integration Pipeline:
          </div>
          <div>✓ M2: Express API Gateway & Ride Routes</div>
          <div>✓ M3: PostgreSQL <code>rides</code> & <code>passengers</code> schemas</div>
          <div>✓ M4: JWT Role-Based Access Control</div>
          <div>✓ M5: Full Interactive Booking UI</div>
        </div>
      </div>
    </div>
  );
};

export default PassengerPortal;


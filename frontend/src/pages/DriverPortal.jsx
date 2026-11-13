import React from 'react';
import { MapPin, Navigation, ToggleLeft, Clock } from 'lucide-react';

const DriverPortal = () => {
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
          <div className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Module B</div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--slate-900)' }}>
            Driver Portal
          </h1>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.95rem' }}>
            Manage online availability, broadcast simulated GPS coordinates, and accept incoming dispatch offers.
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
          backgroundColor: 'var(--success-bg)',
          color: '#059669',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto'
        }}>
          <Navigation size={32} />
        </div>
        <h3 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--slate-900)' }}>
          Driver Dispatch Terminal
        </h3>
        <p style={{ color: 'var(--slate-600)', lineHeight: '1.6', marginBottom: '1.5rem', fontSize: '0.925rem' }}>
          Drivers will toggle ONLINE/OFFLINE availability, stream simulated GPS locations, 
          receive timed ride offers dispatched by RabbitMQ, and transition trip statuses 
          (<code>DRIVER_ACCEPTED</code> → <code>ARRIVED</code> → <code>IN_PROGRESS</code> → <code>COMPLETED</code>).
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
          <div>✓ M2: Driver REST Endpoints in Express Gateway</div>
          <div>✓ M3: PostgreSQL <code>drivers</code> & <code>ride_assignments</code> tables</div>
          <div>✓ M7: Haversine Proximity Match Engine</div>
          <div>✓ M10: Socket.IO Instant Dispatch Notifications</div>
        </div>
      </div>
    </div>
  );
};

export default DriverPortal;


import React from 'react';
import { 
  Check, 
  Clock, 
  Car, 
  MapPin, 
  Navigation, 
  Flag, 
  XCircle 
} from 'lucide-react';
import './RideLifecycleTimeline.css';

const STEPS = [
  { key: 'REQUESTED', label: 'Requested', icon: <Clock size={14} /> },
  { key: 'PENDING', label: 'Dispatching', icon: <Navigation size={14} /> },
  { key: 'DRIVER_ASSIGNED', label: 'Assigned', icon: <Car size={14} /> },
  { key: 'DRIVER_ACCEPTED', label: 'Accepted', icon: <Check size={14} /> },
  { key: 'DRIVER_ARRIVED', label: 'Arrived', icon: <MapPin size={14} /> },
  { key: 'IN_PROGRESS', label: 'In Transit', icon: <Navigation size={14} /> },
  { key: 'COMPLETED', label: 'Completed', icon: <Flag size={14} /> },
];

const RideLifecycleTimeline = ({ currentStatus }) => {
  if (currentStatus === 'CANCELLED') {
    return (
      <div className="timeline-cancelled-banner">
        <XCircle size={18} />
        <span>Ride Request Was Cancelled</span>
      </div>
    );
  }

  if (currentStatus === 'ABORTED_SOS') {
    return (
      <div className="timeline-cancelled-banner" style={{ background: '#FEF2F2', borderColor: '#F87171', color: '#991B1B' }}>
        <XCircle size={18} style={{ color: '#DC2626' }} />
        <span>Ride Aborted (Emergency SOS Protocol) • Re-routing to Nearest Rescue Driver</span>
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex(s => s.key === currentStatus);

  return (
    <div className="lifecycle-timeline-wrap">
      <div className="timeline-steps-track">
        {STEPS.map((step, idx) => {
          const isDone = currentStepIndex > idx;
          const isCurrent = currentStepIndex === idx;
          const isPending = currentStepIndex < idx;

          return (
            <React.Fragment key={step.key}>
              <div className={`timeline-node ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}>
                <div className="node-icon-circle">
                  {isDone ? <Check size={14} /> : step.icon}
                </div>
                <span className="node-label">{step.label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`timeline-connector ${isDone ? 'filled' : ''}`}></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default RideLifecycleTimeline;


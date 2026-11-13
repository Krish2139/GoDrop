import React from 'react';
import './StatCard.css';

const StatCard = ({ icon, label, value, subtext, trend, color = 'blue' }) => {
  return (
    <div className={`stat-card stat-card-${color}`}>
      <div className="stat-card-header">
        <span className="stat-card-label">{label}</span>
        <div className="stat-card-icon-wrap">{icon}</div>
      </div>
      <div className="stat-card-value">{value}</div>
      {(subtext || trend) && (
        <div className="stat-card-footer">
          {trend && <span className="stat-card-trend">{trend}</span>}
          {subtext && <span className="stat-card-subtext">{subtext}</span>}
        </div>
      )}
    </div>
  );
};

export default StatCard;

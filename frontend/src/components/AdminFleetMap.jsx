import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Compass, 
  Car, 
  MapPin, 
  CheckCircle2, 
  Navigation, 
  Filter, 
  Maximize2, 
  RefreshCw 
} from 'lucide-react';
import './AdminFleetMap.css';

// Ahmedabad City Center
const AHMEDABAD_CENTER = [23.0338, 72.5714];
const DEFAULT_ZOOM = 12;

const AdminFleetMap = ({ drivers = [], rides = [], height = '460px' }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routesLayerRef = useRef(null);

  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, AVAILABLE, ON_TRIP, OFFLINE, PENDING
  const [showActiveRoutes, setShowActiveRoutes] = useState(true);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: AHMEDABAD_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      routesLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers & Polylines whenever drivers, rides, or filters change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !markersLayerRef.current || !routesLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    routesLayerRef.current.clearLayers();

    // 1. Filter drivers
    const filteredDrivers = drivers.filter(d => {
      if (filterStatus === 'ALL') return true;
      if (filterStatus === 'PENDING') return d.approval_status === 'PENDING';
      if (filterStatus === 'AVAILABLE') return d.status === 'AVAILABLE' && d.approval_status !== 'PENDING';
      if (filterStatus === 'ON_TRIP') return (d.status === 'ON_TRIP' || d.status === 'RESERVED');
      if (filterStatus === 'OFFLINE') return d.status === 'OFFLINE' && d.approval_status !== 'PENDING';
      return true;
    });

    // 2. Render Driver Markers
    filteredDrivers.forEach(driver => {
      const lat = driver.current_latitude;
      const lng = driver.current_longitude;
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      const isPending = driver.approval_status === 'PENDING';
      const isAvailable = driver.status === 'AVAILABLE' && !isPending;
      const isOnTrip = (driver.status === 'ON_TRIP' || driver.status === 'RESERVED') && !isPending;

      let colorClass = 'offline';
      let statusLabel = 'OFFLINE';
      if (isPending) {
        colorClass = 'pending';
        statusLabel = 'PENDING APPROVAL';
      } else if (isAvailable) {
        colorClass = 'available';
        statusLabel = 'AVAILABLE';
      } else if (isOnTrip) {
        colorClass = 'ontrip';
        statusLabel = 'ON TRIP';
      }

      const driverIcon = L.divIcon({
        className: 'admin-driver-marker-wrapper',
        html: `
          <div class="admin-car-marker ${colorClass}">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>
              <circle cx="7" cy="17" r="2"></circle>
              <path d="M9 17h6"></path>
              <circle cx="17" cy="17" r="2"></circle>
            </svg>
            <span class="marker-caption">${driver.name ? driver.name.split(' ')[0] : 'Driver'}</span>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22],
      });

      const marker = L.marker([lat, lng], { icon: driverIcon });
      marker.bindPopup(`
        <div class="admin-map-popup">
          <div class="popup-header">
            <b>${driver.name || 'Driver'}</b>
            <span class="badge ${isAvailable ? 'badge-success' : isPending ? 'badge-warning' : isOnTrip ? 'badge-warning' : 'badge-neutral'}">
              ${statusLabel}
            </span>
          </div>
          <div class="popup-body">
            <div><b>Vehicle:</b> ${driver.vehicle_model || 'Standard Sedan'}</div>
            <div><b>Plate:</b> <code>${driver.license_plate || 'N/A'}</code></div>
            <div><b>Rating:</b> ★ ${driver.rating || '5.00'}</div>
            <div><b>Verification:</b> ${driver.approval_status || 'APPROVED'}</div>
            <div><b>GPS:</b> ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
          </div>
        </div>
      `);
      markersLayerRef.current.addLayer(marker);
    });

    // 3. Render Active Ride Routes (if enabled)
    if (showActiveRoutes && rides && rides.length > 0) {
      const activeRides = rides.filter(r => !['COMPLETED', 'CANCELLED'].includes(r.status));
      activeRides.forEach(ride => {
        const pLat = ride.pickup_latitude;
        const pLng = ride.pickup_longitude;
        const dLat = ride.destination_latitude;
        const dLng = ride.destination_longitude;

        if (pLat && pLng && dLat && dLng) {
          // Pickup Marker (Green Pin)
          const pickupIcon = L.divIcon({
            className: 'admin-pickup-marker',
            html: `<div class="pickup-pin-dot">🟢</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });
          const pMarker = L.marker([pLat, pLng], { icon: pickupIcon });
          pMarker.bindPopup(`<b>Pickup:</b> ${ride.pickup_address || 'Pickup'}<br/><b>Passenger:</b> ${ride.passenger_name || 'Passenger'}`);
          routesLayerRef.current.addLayer(pMarker);

          // Dropoff Marker (Red Flag)
          const dropIcon = L.divIcon({
            className: 'admin-drop-marker',
            html: `<div class="drop-pin-dot">🏁</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });
          const dMarker = L.marker([dLat, dLng], { icon: dropIcon });
          dMarker.bindPopup(`<b>Destination:</b> ${ride.destination_address || 'Destination'}<br/><b>Fare:</b> ₹${ride.fare_amount}`);
          routesLayerRef.current.addLayer(dMarker);

          // Route Polyline (Dashed Blue)
          const polyline = L.polyline([[pLat, pLng], [dLat, dLng]], {
            color: '#2563EB',
            weight: 3.5,
            opacity: 0.8,
            dashArray: '6, 8',
          });
          polyline.bindPopup(`
            <b>Active Ride #${ride.id?.substring(0, 8)}</b><br/>
            <b>Status:</b> ${ride.status}<br/>
            <b>Passenger:</b> ${ride.passenger_name || 'Passenger'}<br/>
            <b>Fare:</b> ₹${ride.fare_amount} (${ride.distance_km || 0} km)
          `);
          routesLayerRef.current.addLayer(polyline);
        }
      });
    }
  }, [drivers, rides, filterStatus, showActiveRoutes]);

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(AHMEDABAD_CENTER, DEFAULT_ZOOM);
    }
  };

  const availableCount = drivers.filter(d => d.status === 'AVAILABLE' && d.approval_status !== 'PENDING').length;
  const onTripCount = drivers.filter(d => (d.status === 'ON_TRIP' || d.status === 'RESERVED') && d.approval_status !== 'PENDING').length;
  const offlineCount = drivers.filter(d => d.status === 'OFFLINE' && d.approval_status !== 'PENDING').length;
  const pendingCount = drivers.filter(d => d.approval_status === 'PENDING').length;
  const activeRidesCount = rides.filter(r => !['COMPLETED', 'CANCELLED'].includes(r.status)).length;

  return (
    <div className="admin-fleet-map-wrapper">
      {/* Map Control Header Bar */}
      <div className="admin-map-toolbar">
        <div className="map-toolbar-left">
          <div className="map-live-badge">
            <span className="live-dot pulse"></span>
            <span>Live Ahmedabad Fleet Command Map</span>
          </div>

          {/* Filter Pills */}
          <div className="filter-pill-group">
            <button 
              type="button" 
              className={`filter-pill ${filterStatus === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterStatus('ALL')}
            >
              All ({drivers.length})
            </button>
            <button 
              type="button" 
              className={`filter-pill pill-available ${filterStatus === 'AVAILABLE' ? 'active' : ''}`}
              onClick={() => setFilterStatus('AVAILABLE')}
            >
              🟢 Available ({availableCount})
            </button>
            <button 
              type="button" 
              className={`filter-pill pill-ontrip ${filterStatus === 'ON_TRIP' ? 'active' : ''}`}
              onClick={() => setFilterStatus('ON_TRIP')}
            >
              🟠 On Trip ({onTripCount})
            </button>
            <button 
              type="button" 
              className={`filter-pill pill-offline ${filterStatus === 'OFFLINE' ? 'active' : ''}`}
              onClick={() => setFilterStatus('OFFLINE')}
            >
              ⚪ Offline ({offlineCount})
            </button>
            {pendingCount > 0 && (
              <button 
                type="button" 
                className={`filter-pill pill-pending ${filterStatus === 'PENDING' ? 'active' : ''}`}
                onClick={() => setFilterStatus('PENDING')}
              >
                ⏳ Pending ({pendingCount})
              </button>
            )}
          </div>
        </div>

        <div className="map-toolbar-right">
          <label className="route-toggle-label">
            <input 
              type="checkbox" 
              checked={showActiveRoutes} 
              onChange={(e) => setShowActiveRoutes(e.target.checked)} 
            />
            <span>Active Trips ({activeRidesCount})</span>
          </label>
          <button 
            type="button" 
            onClick={handleRecenter} 
            className="btn btn-outline btn-xs"
            title="Recenter Ahmedabad"
          >
            <Compass size={14} /> Recenter
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div 
        ref={mapContainerRef} 
        className="admin-leaflet-container" 
        style={{ height }}
      />
    </div>
  );
};

export default AdminFleetMap;

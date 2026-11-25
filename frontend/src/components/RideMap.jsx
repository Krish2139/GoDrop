import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import './RideMap.css';

// Default center: Ahmedabad SG Highway
const DEFAULT_CENTER = [23.0373, 72.5303];
const DEFAULT_ZOOM = 13;

const getShortLocationLabel = (addr, defaultLabel) => {
  if (!addr) return defaultLabel;
  const clean = String(addr).trim();
  if (clean.includes('(') && clean.includes(')')) {
    const match = clean.match(/\(([^)]+)\)/);
    if (match && match[1].length >= 2 && match[1].length <= 20) {
      return match[1];
    }
  }
  if (clean.includes('/')) {
    const part = clean.split('/')[0].trim();
    if (part.length <= 20) return part;
  }
  if (clean.length > 22) {
    return clean.substring(0, 20) + '...';
  }
  return clean;
};

const RideMap = ({
  driverLocation = null, // { lat, lng, heading, name }
  pickupLocation = null, // { lat, lng, address }
  destLocation = null,   // { lat, lng, address }
  onMapClick = null,     // (lat, lng) => void
  height = '320px',
  showRoute = true,
  statusText = 'Live GPS Navigation',
  clickHint = null,
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({
    driver: null,
    pickup: null,
    dest: null,
    polyline: null,
  });

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: false,
      });

      // Standard OpenStreetMap Tile Layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Map Click Handler for driver teleport / coordinate picking
      if (onMapClick) {
        map.on('click', (e) => {
          onMapClick(e.latlng.lat, e.latlng.lng);
        });
      }

      mapInstanceRef.current = map;

      // Force size invalidation so tiles load across entire container
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update onMapClick handler if it changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.off('click');
    if (onMapClick) {
      map.on('click', (e) => {
        onMapClick(e.latlng.lat, e.latlng.lng);
      });
    }
  }, [onMapClick]);

  // Update Markers & Polylines when locations change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const boundsPoints = [];

    // 1. Pickup Marker
    if (pickupLocation && pickupLocation.lat && pickupLocation.lng) {
      const pLat = parseFloat(pickupLocation.lat);
      const pLng = parseFloat(pickupLocation.lng);
      boundsPoints.push([pLat, pLng]);

      const shortPickup = getShortLocationLabel(pickupLocation.address, 'Pickup');
      const pickupIcon = L.divIcon({
        className: 'custom-leaflet-marker-pin',
        html: `
          <div class="pickup-marker-pin">
            <div class="pickup-marker-badge">
              <span class="marker-dot">●</span>
              <span class="marker-type">PICKUP:</span>
              <span class="marker-label">${shortPickup}</span>
            </div>
            <div class="pickup-marker-arrow"></div>
          </div>
        `,
        iconSize: null,
      });

      if (markersRef.current.pickup) {
        markersRef.current.pickup.setLatLng([pLat, pLng]);
        markersRef.current.pickup.setIcon(pickupIcon);
      } else {
        markersRef.current.pickup = L.marker([pLat, pLng], { icon: pickupIcon, zIndexOffset: 800 }).addTo(map);
      }
      if (pickupLocation.address) {
        markersRef.current.pickup.bindPopup(`<b>Pickup Location:</b><br/>${pickupLocation.address}`);
      }
    } else if (markersRef.current.pickup) {
      map.removeLayer(markersRef.current.pickup);
      markersRef.current.pickup = null;
    }

    // 2. Destination Marker
    if (destLocation && destLocation.lat && destLocation.lng) {
      const dLat = parseFloat(destLocation.lat);
      const dLng = parseFloat(destLocation.lng);
      boundsPoints.push([dLat, dLng]);

      const shortDest = getShortLocationLabel(destLocation.address, 'Drop-off');
      const destIcon = L.divIcon({
        className: 'custom-leaflet-marker-pin',
        html: `
          <div class="dest-marker-pin">
            <div class="dest-marker-badge">
              <span class="marker-dot">🏁</span>
              <span class="marker-type">DROP-OFF:</span>
              <span class="marker-label">${shortDest}</span>
            </div>
            <div class="dest-marker-arrow"></div>
          </div>
        `,
        iconSize: null,
      });

      if (markersRef.current.dest) {
        markersRef.current.dest.setLatLng([dLat, dLng]);
        markersRef.current.dest.setIcon(destIcon);
      } else {
        markersRef.current.dest = L.marker([dLat, dLng], { icon: destIcon, zIndexOffset: 700 }).addTo(map);
      }
      if (destLocation.address) {
        markersRef.current.dest.bindPopup(`<b>Destination Location:</b><br/>${destLocation.address}`);
      }
    } else if (markersRef.current.dest) {
      map.removeLayer(markersRef.current.dest);
      markersRef.current.dest = null;
    }

    // 3. Driver Live Vehicle Marker
    if (driverLocation && driverLocation.lat && driverLocation.lng) {
      const drvLat = parseFloat(driverLocation.lat);
      const drvLng = parseFloat(driverLocation.lng);
      boundsPoints.push([drvLat, drvLng]);

      const heading = driverLocation.heading || 0;
      const driverIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div class="driver-vehicle-marker">
            <div class="driver-pulse-ring"></div>
            <div class="driver-icon-disc" style="transform: rotate(${heading}deg);">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
              </svg>
            </div>
            ${driverLocation.name ? `<div class="driver-marker-name">${driverLocation.name}</div>` : ''}
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      if (markersRef.current.driver) {
        markersRef.current.driver.setLatLng([drvLat, drvLng]);
        markersRef.current.driver.setIcon(driverIcon);
      } else {
        markersRef.current.driver = L.marker([drvLat, drvLng], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
      }
    } else if (markersRef.current.driver) {
      map.removeLayer(markersRef.current.driver);
      markersRef.current.driver = null;
    }

    // 4. Route Polyline
    if (showRoute && pickupLocation?.lat && destLocation?.lat) {
      const routeCoords = [
        [parseFloat(pickupLocation.lat), parseFloat(pickupLocation.lng)],
        [parseFloat(destLocation.lat), parseFloat(destLocation.lng)],
      ];

      if (markersRef.current.polyline) {
        markersRef.current.polyline.setLatLngs(routeCoords);
      } else {
        markersRef.current.polyline = L.polyline(routeCoords, {
          color: '#2563EB',
          weight: 4,
          opacity: 0.85,
          dashArray: '8, 8',
        }).addTo(map);
      }
    } else if (markersRef.current.polyline) {
      map.removeLayer(markersRef.current.polyline);
      markersRef.current.polyline = null;
    }

    // 5. Auto-fit bounds
    if (boundsPoints.length >= 2) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 14);
    }
  }, [
    pickupLocation?.lat,
    pickupLocation?.lng,
    pickupLocation?.address,
    destLocation?.lat,
    destLocation?.lng,
    destLocation?.address,
    driverLocation?.lat,
    driverLocation?.lng,
    driverLocation?.heading,
    showRoute,
  ]);

  return (
    <div className="ride-map-wrapper" style={{ height }}>
      {statusText && (
        <div className="map-status-overlay">
          <span className="map-live-dot"></span>
          <span>{statusText}</span>
        </div>
      )}
      {clickHint && (
        <div className="map-hint-overlay">
          <span>{clickHint}</span>
        </div>
      )}
      <div ref={mapContainerRef} className="ride-map-container" />
    </div>
  );
};

export default RideMap;

import { useEffect, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getL() { return window.L; }

// ── MODERN, HIGH-VISIBILITY ICONS ───────────────────────────────────────────
function hospitalMarkerHtml(occ) {
  const color = occ > 80 ? '#ef4444' : '#22c55e'; // Red if full, Green if open
  return `<div style="
    background:#ffffff; border:3px solid ${color}; color:#000000;
    font-family:var(--body-font, sans-serif); font-size:16px; padding:6px 12px; 
    border-radius:30px; text-align:center; white-space:nowrap;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-weight:bold;
    display: flex; align-items: center; gap: 6px;">
    🏥 <span>${occ}% Full</span>
  </div>`;
}

function ambulanceMarkerHtml(busy) {
  const color = busy ? '#3b82f6' : '#64748b'; // Blue if dispatched, Gray if idle
  const glow = busy ? 'box-shadow: 0 0 16px rgba(59, 130, 246, 0.6);' : 'box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
  return `<div style="
    background:#ffffff; border:3px solid ${color};
    font-size:20px; padding:8px; border-radius:50%; ${glow}
    display: flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; z-index: 999;">
    🚑
  </div>`;
}

function patientMarkerHtml(patient) {
  if (patient.status === "admitted") {
    return `<div style="
      background:#22c55e; border:3px solid #ffffff; color:#ffffff;
      font-family:var(--body-font, sans-serif); font-size:16px; padding:6px 12px; 
      border-radius:30px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      white-space:nowrap; font-weight:bold; display: flex; align-items: center; gap: 6px;">
      ✅ <span>Secured</span>
    </div>`;
  }
  return `
    <style>
      @keyframes pulse-ring {
        0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
        100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
    </style>
    <div style="
      background:#ef4444; border:3px solid #ffffff; 
      font-size:20px; width:44px; height:44px; display:flex; align-items:center; justify-content:center;
      border-radius:50%; animation: pulse-ring 2s infinite;">
      🤕
    </div>`;
}


export default function MapView({ isActive }) {
  const mapRef      = useRef(null);
  const mapObj      = useRef(null);
  const markersRef  = useRef({ hospitals: {}, ambulances: {}, patients: {} });
  const linesRef    = useRef({});
  const routesCache = useRef({}); // Caches road paths so we only fetch once per dispatch
  const wsRef       = useRef(null);

  const initMap = useCallback(() => {
    const L = getL();
    if (!L || mapObj.current || !mapRef.current) return;

    const map = L.map(mapRef.current, {
      center: [12.9716, 77.5946],
      zoom: 12,
      zoomControl: false,
    });

    // Vibrant Base Layer
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { attribution: "© OSM © CARTO", maxZoom: 19 }
    ).addTo(map);

    mapObj.current = map;
  }, []);

  // Fixes the grey-screen bug when switching tabs
  useEffect(() => {
    if (isActive && mapObj.current) {
      setTimeout(() => mapObj.current.invalidateSize(), 100);
    }
  }, [isActive]);

  const updateMarkers = useCallback((data) => {
    const L = getL();
    const map = mapObj.current;
    if (!L || !map || !data) return;

    // 1. Render Hospitals
    (data.hospitals || []).forEach(h => {
      const occ = Math.round((h.total_beds - h.beds_available) / (h.total_beds || 1) * 100);
      const icon = L.divIcon({
        className: "", html: hospitalMarkerHtml(occ),
        iconSize: [110, 40], iconAnchor: [55, 20],
      });
      if (markersRef.current.hospitals[h.id]) {
        markersRef.current.hospitals[h.id].setIcon(icon);
      } else {
        markersRef.current.hospitals[h.id] = L.marker([h.lat, h.lon], { icon }).addTo(map);
      }
    });

    // 2. Clear old road paths
    Object.values(linesRef.current).forEach(line => map.removeLayer(line));
    linesRef.current = {};

    // 3. Render Ambulances & Animate Along Roads
    (data.ambulances || []).forEach(a => {
      const busy = a.status === "busy";
      let displayLat = a.lat;
      let displayLon = a.lon;

      if (busy && a.assigned_patient) {
        const p = (data.patients || []).find(pt => pt.id === a.assigned_patient);
        if (p) {
          const cacheKey = `${a.id}_${p.id}`;
          
          // Fetch exact road coordinates from OSRM if not already cached
          if (!routesCache.current[cacheKey]) {
            routesCache.current[cacheKey] = { status: 'fetching', coords: [], progress: 0 };
            
            fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${p.lon},${p.lat}?overview=full&geometries=geojson`)
              .then(res => res.json())
              .then(resData => {
                if (resData.routes && resData.routes.length > 0) {
                  // OSRM returns [lon, lat], Leaflet needs [lat, lon]
                  const coords = resData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                  routesCache.current[cacheKey] = { status: 'done', coords, progress: 0 };
                }
              })
              .catch(() => { routesCache.current[cacheKey] = { status: 'error' }; });
          }

          // If road path is ready, override backend coordinates and drive along the track
          if (routesCache.current[cacheKey].status === 'done') {
            const coords = routesCache.current[cacheKey].coords;
            let progress = routesCache.current[cacheKey].progress;
            
            // Calculate speed so it finishes the route smoothly
            const stepSize = Math.max(1, Math.floor(coords.length / 15)); 
            progress = Math.min(progress + stepSize, coords.length - 1);
            routesCache.current[cacheKey].progress = progress;

            // Override display coordinates
            displayLat = coords[progress][0];
            displayLon = coords[progress][1];

            // Draw the visible thick blue routing line from current pos to patient
            const remainingCoords = coords.slice(progress);
            if (remainingCoords.length > 1) {
              const line = L.polyline(remainingCoords, {
                color: '#3b82f6', // Google Maps Blue
                weight: 6,
                opacity: 0.9,
                lineJoin: 'round'
              }).addTo(map);
              linesRef.current[a.id] = line;
            }
          }
        }
      } else {
        // Clear route cache if ambulance becomes available
        Object.keys(routesCache.current).forEach(key => {
          if (key.startsWith(a.id)) delete routesCache.current[key];
        });
      }

      // Render the Ambulance Marker
      const icon = L.divIcon({
        className: "", html: ambulanceMarkerHtml(busy),
        iconSize: [44, 44], iconAnchor: [22, 22],
      });
      
      if (markersRef.current.ambulances[a.id]) {
        // CSS transitions in App.css will make this location update glide smoothly
        markersRef.current.ambulances[a.id].setLatLng([displayLat, displayLon]).setIcon(icon);
      } else {
        markersRef.current.ambulances[a.id] = L.marker([displayLat, displayLon], { icon }).addTo(map);
      }
    });

    // 4. Render Patients
    (data.patients || []).forEach(p => {
      const icon = L.divIcon({
        className: "", html: patientMarkerHtml(p),
        // Wider size for the green "Secured" pill, standard size for the alert face
        iconSize: p.status === "admitted" ? [120, 40] : [44, 44], 
        iconAnchor: p.status === "admitted" ? [60, 20] : [22, 22],
      });
      
      if (markersRef.current.patients[p.id]) {
        markersRef.current.patients[p.id].setIcon(icon);
      } else {
        markersRef.current.patients[p.id] = L.marker([p.lat, p.lon], { icon }).addTo(map);
      }
    });
  }, []);

  const connectWs = useCallback(() => {
    try {
      const wsUrl = API.replace(/^http/, "ws") + "/ws/live";
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => { try { updateMarkers(JSON.parse(e.data)); } catch {} };
      ws.onclose = () => { setTimeout(connectWs, 2000); };
      wsRef.current = ws;
    } catch {}
  }, [updateMarkers]);

  useEffect(() => {
    const timer = setTimeout(() => { initMap(); connectWs(); }, 100);
    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
    };
  }, [connectWs, initMap]);

  return (
    <div className="map-view-wrapper">
      <div className="map-topbar">
        <span style={{color:"var(--text)"}}>LIVE.MAP_SYS_TRACKING // REALTIME_OSRM_ROUTING</span>
      </div>
      <div className="map-body">
        <div ref={mapRef} className="map-container" />
      </div>
    </div>
  );
}
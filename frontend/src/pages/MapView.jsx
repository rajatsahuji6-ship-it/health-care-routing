// pages/MapView.jsx — Fixed map with side panel, macOS theme
import { useEffect, useRef, useState, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getL() { return window.L; }

const SEV_COLORS = { critical: "#ef4444", moderate: "#f59e0b", mild: "#22c55e" };

// Animated marker HTML generators
function hospitalMarkerHtml(occ) {
  const c = occ > 80 ? "#ef4444" : occ > 50 ? "#f59e0b" : "#22c55e";
  const glow = occ > 80 ? "rgba(239,68,68,0.5)" : occ > 50 ? "rgba(245,158,11,0.4)" : "rgba(34,197,94,0.4)";
  return `<div style="
    position:relative;width:40px;height:40px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;">
    <div style="
      width:40px;height:40px;border-radius:12px;
      background:rgba(10,10,25,0.9);
      border:2px solid ${c};
      box-shadow:0 0 16px ${glow}, 0 4px 12px rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
      font-size:18px;backdrop-filter:blur(8px);">🏥</div>
    <div style="
      position:absolute;bottom:-2px;right:-2px;
      width:14px;height:14px;border-radius:50%;
      background:${c};border:2px solid #0a0a0f;
      box-shadow:0 0 6px ${glow};"></div>
  </div>`;
}

function ambulanceMarkerHtml(busy) {
  const c    = busy ? "#ef4444" : "#22c55e";
  const glow = busy ? "rgba(239,68,68,0.6)" : "rgba(34,197,94,0.5)";
  const anim = busy ? "animation:amb-pulse 1s ease-in-out infinite;" : "";
  return `<style>
    @keyframes amb-pulse {
      0%,100% { box-shadow:0 0 14px ${glow},0 4px 12px rgba(0,0,0,0.5); }
      50%      { box-shadow:0 0 28px ${glow},0 4px 12px rgba(0,0,0,0.5); }
    }
  </style>
  <div style="
    width:42px;height:28px;border-radius:8px;
    background:rgba(10,10,25,0.92);
    border:2px solid ${c};
    box-shadow:0 0 14px ${glow},0 4px 12px rgba(0,0,0,0.5);
    display:flex;align-items:center;justify-content:center;
    font-size:18px;cursor:pointer;backdrop-filter:blur(8px);
    ${anim}">🚑</div>`;
}

function patientMarkerHtml(sev_label) {
  const c = SEV_COLORS[sev_label] || "#6b7280";
  return `<div style="
    width:30px;height:30px;border-radius:50%;
    background:rgba(10,10,25,0.9);
    border:2px solid ${c};
    box-shadow:0 0 12px ${c}88,0 3px 8px rgba(0,0,0,0.5);
    display:flex;align-items:center;justify-content:center;
    font-size:14px;cursor:pointer;backdrop-filter:blur(8px);">🤕</div>`;
}

export default function MapView() {
  const mapRef      = useRef(null);
  const mapObj      = useRef(null);
  const markersRef  = useRef({ hospitals: {}, ambulances: {}, patients: {} });
  const wsRef       = useRef(null);
  const pollRef     = useRef(null);

  const [liveData,  setLiveData]  = useState(null);
  const [wsStatus,  setWsStatus]  = useState("connecting");
  const [selected,  setSelected]  = useState(null);
  const [selType,   setSelType]   = useState(null);

  // ── Initialize map once ───────────────────────────────────────────────────
  const initMap = useCallback(() => {
    const L = getL();
    if (!L || mapObj.current || !mapRef.current) return;

    const map = L.map(mapRef.current, {
      center: [12.9716, 77.5946],
      zoom: 12,
      zoomControl: true,
    });

    // Dark tile layer
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO", maxZoom: 19 }
    ).addTo(map);

    mapObj.current = map;
  }, []);

  // ── Update markers from data ────────────────────────────────────────────
  const updateMarkers = useCallback((data) => {
    const L   = getL();
    const map = mapObj.current;
    if (!L || !map || !data) return;

    // Hospitals
    (data.hospitals || []).forEach(h => {
      const occ = Math.round((h.total_beds - h.beds_available) / (h.total_beds || 1) * 100);
      const icon = L.divIcon({
        className: "",
        html: hospitalMarkerHtml(occ),
        iconSize: [40, 40], iconAnchor: [20, 20],
      });
      if (markersRef.current.hospitals[h.id]) {
        markersRef.current.hospitals[h.id].setIcon(icon);
      } else {
        const m = L.marker([h.lat, h.lon], { icon }).addTo(map);
        m.bindPopup(`
          <div style="padding:4px 0">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px;">${h.name}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;">
              <span style="color:#94a3b8">General Beds</span>
              <span style="font-weight:600">${h.beds_available}/${h.total_beds}</span>
              <span style="color:#94a3b8">ICU Beds</span>
              <span style="font-weight:600">${h.icu_available}/${h.icu_beds}</span>
              <span style="color:#94a3b8">Wait Time</span>
              <span style="font-weight:600">~${h.wait_time} min</span>
              <span style="color:#94a3b8">Occupancy</span>
              <span style="font-weight:600;color:${occ > 80 ? '#ef4444' : occ > 50 ? '#f59e0b' : '#22c55e'}">${occ}%</span>
            </div>
          </div>
        `);
        m.on("click", () => { setSelected(h); setSelType("hospital"); });
        markersRef.current.hospitals[h.id] = m;
      }
    });

    // Ambulances
    (data.ambulances || []).forEach(a => {
      const busy = a.status === "busy";
      const icon = L.divIcon({
        className: "",
        html: ambulanceMarkerHtml(busy),
        iconSize: [42, 28], iconAnchor: [21, 14],
      });
      if (markersRef.current.ambulances[a.id]) {
        markersRef.current.ambulances[a.id].setLatLng([a.lat, a.lon]).setIcon(icon);
      } else {
        const m = L.marker([a.lat, a.lon], { icon }).addTo(map);
        m.bindPopup(`
          <div style="padding:4px 0">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px;">${a.name || a.id}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;">
              <span style="color:#94a3b8">Status</span>
              <span style="font-weight:600;color:${busy ? '#ef4444' : '#22c55e'}">${a.status}</span>
              <span style="color:#94a3b8">Patient</span>
              <span style="font-weight:600">${a.assigned_patient || "None"}</span>
              <span style="color:#94a3b8">GPS</span>
              <span style="font-weight:600">${a.lat?.toFixed(3)}, ${a.lon?.toFixed(3)}</span>
            </div>
          </div>
        `);
        m.on("click", () => { setSelected(a); setSelType("ambulance"); });
        markersRef.current.ambulances[a.id] = m;
      }
    });

    // Patients
    (data.patients || []).forEach(p => {
      if (markersRef.current.patients[p.id]) return; // don't re-add
      const icon = L.divIcon({
        className: "",
        html: patientMarkerHtml(p.severity_label),
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      const m = L.marker([p.lat, p.lon], { icon }).addTo(map);
      m.bindPopup(`
        <div style="padding:4px 0">
          <div style="font-weight:700;font-size:14px;margin-bottom:8px;">${p.name || "Patient"}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;">
            <span style="color:#94a3b8">Severity</span>
            <span style="font-weight:600;color:${SEV_COLORS[p.severity_label] || '#fff'}">${p.severity} — ${p.severity_label}</span>
            <span style="color:#94a3b8">Status</span>
            <span style="font-weight:600">${p.status}</span>
          </div>
        </div>
      `);
      m.on("click", () => { setSelected(p); setSelType("patient"); });
      markersRef.current.patients[p.id] = m;
    });

    setLiveData(data);
  }, []);

  // ── Fetch data ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/get_live_tracking`);
      const data = await res.json();
      updateMarkers(data);
      setWsStatus("polling");
    } catch {
      updateMarkers(DEMO_DATA);
      setWsStatus("demo");
    }
  }, [updateMarkers]);

  // ── WebSocket ────────────────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    try {
      const wsUrl = API.replace(/^http/, "ws") + "/ws/live";
      const ws = new WebSocket(wsUrl);
      ws.onopen    = () => setWsStatus("live");
      ws.onmessage = (e) => { try { updateMarkers(JSON.parse(e.data)); } catch {} };
      ws.onerror   = () => setWsStatus("polling");
      ws.onclose   = () => { setWsStatus("polling"); setTimeout(connectWs, 4000); };
      wsRef.current = ws;
    } catch { setWsStatus("polling"); }
  }, [updateMarkers]);

  // ── Mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Small delay to let DOM render map container first
    const timer = setTimeout(() => {
      initMap();
      fetchData();
      connectWs();
      pollRef.current = setInterval(fetchData, 2500);
    }, 100);
    return () => {
      clearTimeout(timer);
      clearInterval(pollRef.current);
      wsRef.current?.close();
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
      markersRef.current = { hospitals: {}, ambulances: {}, patients: {} };
    };
  }, []); // eslint-disable-line

  const hospitals  = liveData?.hospitals  || DEMO_DATA.hospitals;
  const ambulances = liveData?.ambulances || DEMO_DATA.ambulances;
  const patients   = liveData?.patients   || DEMO_DATA.patients;

  const hCount = hospitals.length;
  const aFree  = ambulances.filter(a => a.status === "available").length;
  const pCount = patients.length;

  const statusColor = wsStatus === "live" ? "#22c55e" : wsStatus === "polling" ? "#f59e0b" : "#6b7280";
  const statusLabel = wsStatus === "live" ? "WebSocket Live" : wsStatus === "polling" ? "Polling" : "Demo Mode";

  return (
    <div className="map-view-wrapper">
      {/* Top status bar */}
      <div className="map-topbar">
        <div className="map-status-dot" style={{ background: statusColor }} />
        <span className="map-status-text">{statusLabel} — updates every 2.5s</span>
        <div className="map-counter">🏥 {hCount}</div>
        <div className="map-counter" style={{ color: aFree > 0 ? "#22c55e" : "#ef4444" }}>
          🚑 {aFree}/{ambulances.length} free
        </div>
        <div className="map-counter">🤕 {pCount}</div>
      </div>

      {/* Map + side panel */}
      <div className="map-body">
        {/* The actual Leaflet map */}
        <div ref={mapRef} className="map-container" />

        {/* Legend overlay */}
        <div className="map-legend-overlay">
          <div className="ml-title">Legend</div>
          <div className="ml-row"><div className="ml-dot" style={{background:"#22c55e"}} />Hospital OK</div>
          <div className="ml-row"><div className="ml-dot" style={{background:"#f59e0b"}} />Hospital 50%+</div>
          <div className="ml-row"><div className="ml-dot" style={{background:"#ef4444"}} />Hospital 80%+</div>
          <div className="ml-row"><span style={{fontSize:13}}>🚑</span> Ambulance (free)</div>
          <div className="ml-row"><span style={{fontSize:13,filter:"hue-rotate(140deg)"}}>🚑</span> Ambulance (busy)</div>
          <div className="ml-row"><span style={{fontSize:13}}>🤕</span> Patient</div>
        </div>

        {/* Side panel */}
        <div className="map-sidebar-panel">
          <div className="msp-header">📡 Live Entities</div>
          <div className="msp-scroll">

            <div className="msp-section-label">Hospitals ({hCount})</div>
            {hospitals.map(h => {
              const occ = Math.round((h.total_beds - h.beds_available) / (h.total_beds||1) * 100);
              const c = occ > 80 ? "#ef4444" : occ > 50 ? "#f59e0b" : "#22c55e";
              return (
                <div key={h.id} className={`msp-item ${selected?.id === h.id ? "selected" : ""}`}
                  onClick={() => { setSelected(h); setSelType("hospital"); mapObj.current?.flyTo([h.lat, h.lon], 14); }}>
                  <div className="msp-item-header">
                    <span className="msp-item-name">{h.name.split(" ").slice(0,2).join(" ")}</span>
                    <span style={{fontSize:10,color:c,fontWeight:600}}>{occ}%</span>
                  </div>
                  <div className="msp-item-body">
                    <div className="msp-row"><span className="msp-key">Beds</span><span className="msp-val">{h.beds_available}/{h.total_beds}</span></div>
                    <div className="msp-row"><span className="msp-key">ICU</span><span className="msp-val">{h.icu_available}/{h.icu_beds}</span></div>
                    <div className="occ-bar-mini"><div className="occ-fill-mini" style={{width:`${occ}%`,background:c}} /></div>
                  </div>
                </div>
              );
            })}

            <div className="msp-section-label" style={{marginTop:10}}>Ambulances ({ambulances.length})</div>
            {ambulances.map(a => (
              <div key={a.id} className={`msp-item ${selected?.id === a.id ? "selected" : ""}`}
                onClick={() => { setSelected(a); setSelType("ambulance"); mapObj.current?.flyTo([a.lat, a.lon], 14); }}>
                <div className="msp-item-header">
                  <span className="msp-item-name">{a.name || a.id}</span>
                  <span className={`status-tag ${a.status}`}>{a.status}</span>
                </div>
                <div className="msp-item-body">
                  <div className="msp-row"><span className="msp-key">Patient</span><span className="msp-val">{a.assigned_patient || "—"}</span></div>
                </div>
              </div>
            ))}

            {patients.length > 0 && <>
              <div className="msp-section-label" style={{marginTop:10}}>Patients ({patients.length})</div>
              {patients.slice(-8).reverse().map(p => (
                <div key={p.id} className={`msp-item ${selected?.id === p.id ? "selected" : ""}`}
                  onClick={() => { setSelected(p); setSelType("patient"); mapObj.current?.flyTo([p.lat, p.lon], 14); }}>
                  <div className="msp-item-header">
                    <span className="msp-item-name">{p.name || p.id}</span>
                    <span style={{fontSize:10,color:SEV_COLORS[p.severity_label]||"#fff",fontWeight:600}}>{p.severity}</span>
                  </div>
                  <div className="msp-item-body">
                    <div className="msp-row">
                      <span className="msp-key">{p.severity_label}</span>
                      <span className={`status-tag ${p.status}`}>{p.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </>}

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Demo data (when backend offline) ────────────────────────────────────────
const DEMO_DATA = {
  hospitals: [
    { id:"h0", name:"City General Hospital",    lat:12.9716, lon:77.5946, total_beds:100, beds_available:72, icu_beds:20, icu_available:14, wait_time:10 },
    { id:"h1", name:"Apex Medical Centre",      lat:12.9352, lon:77.6244, total_beds:80,  beds_available:25, icu_beds:15, icu_available:3,  wait_time:25 },
    { id:"h2", name:"St. Mary's Hospital",      lat:13.0012, lon:77.5800, total_beds:60,  beds_available:48, icu_beds:10, icu_available:7,  wait_time:5  },
    { id:"h3", name:"LifeCare Institute",       lat:12.9582, lon:77.6478, total_beds:120, beds_available:8,  icu_beds:30, icu_available:1,  wait_time:45 },
    { id:"h4", name:"Metro Emergency Hospital", lat:12.9830, lon:77.6080, total_beds:90,  beds_available:60, icu_beds:25, icu_available:18, wait_time:8  },
  ],
  ambulances: [
    { id:"a0", name:"AMB-001", lat:12.960, lon:77.590, status:"available", assigned_patient:null },
    { id:"a1", name:"AMB-002", lat:12.982, lon:77.613, status:"busy",      assigned_patient:"p001" },
    { id:"a2", name:"AMB-003", lat:12.947, lon:77.632, status:"available", assigned_patient:null },
    { id:"a3", name:"AMB-004", lat:13.001, lon:77.572, status:"available", assigned_patient:null },
  ],
  patients: [
    { id:"p001", name:"Ravi Kumar",   severity:9.2, severity_label:"critical", lat:12.970, lon:77.600, status:"assigned" },
    { id:"p002", name:"Priya Sharma", severity:5.5, severity_label:"moderate", lat:12.955, lon:77.615, status:"admitted" },
    { id:"p003", name:"Anil Mehta",   severity:2.1, severity_label:"mild",     lat:12.990, lon:77.585, status:"pending"  },
  ],
};

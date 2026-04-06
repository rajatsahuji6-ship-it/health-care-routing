// App.jsx — Simulation state lives HERE (App level) so tab switches don't kill it
import { useState, useEffect, useCallback } from "react";
import Dashboard from "./pages/Dashboard";
import MapView from "./pages/MapView";
import PatientForm from "./pages/PatientForm";
import AdminPanel from "./pages/AdminPanel";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TABS = [
  { id: "dashboard", icon: "⬛", label: "Dashboard" },
  { id: "map",       icon: "◉",  label: "Live Map"   },
  { id: "patient",   icon: "＋", label: "Emergency"  },
  { id: "admin",     icon: "⚙",  label: "Admin"      },
];

export default function App() {
  const [activeTab,   setActiveTab]   = useState("dashboard");
  const [time,        setTime]        = useState(new Date());
  // ── Simulation state at App level — survives tab switches ──────────────
  const [simRunning,  setSimRunning]  = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // On mount, check backend sim status (so page refresh also reflects it)
  useEffect(() => {
    // We just default to false on load; backend keeps running regardless
  }, []);

  const toggleSim = useCallback(async () => {
    const endpoint = simRunning ? "simulation/stop" : "simulation/start";
    try {
      await fetch(`${API}/${endpoint}`);
    } catch {
      // backend unavailable — toggle locally for UI demo
    }
    setSimRunning(s => !s);
  }, [simRunning]);

  const timeStr = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="os-root">
      {/* macOS-style menu bar */}
      <div className="menubar">
        <div className="menubar-left">
          <div className="apple-logo">⬛</div>
          <span className="app-name">SmartER</span>
          <span className="menu-item">File</span>
          <span className="menu-item">View</span>
          <span className="menu-item">Simulation</span>
          <span className="menu-item">Help</span>
        </div>
        <div className="menubar-right">
          {/* Global sim toggle in menu bar — always visible */}
          <button
            onClick={toggleSim}
            style={{
              background: simRunning ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)",
              border: simRunning ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(34,197,94,0.25)",
              color: simRunning ? "#fca5a5" : "#86efac",
              borderRadius: 20,
              padding: "2px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "inherit",
            }}
          >
            {simRunning ? (
              <><span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"#ef4444",animation:"pulse-anim 1s infinite"}} />⏹ Stop Sim</>
            ) : (
              <><span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"#22c55e"}} />▶ Start Sim</>
            )}
          </button>
          <div className="status-pill">
            <span className="pulse-dot" />
            <span>{simRunning ? "Simulation Running" : "System Live"}</span>
          </div>
          <span className="menu-time">{dateStr}  {timeStr}</span>
        </div>
      </div>

      {/* Window chrome */}
      <div className="window-frame">
        <div className="sidebar">
          <div className="traffic-lights">
            <div className="tl tl-red" />
            <div className="tl tl-yellow" />
            <div className="tl tl-green" />
          </div>
          <div className="sidebar-brand">
            <div className="brand-icon">🚑</div>
            <div className="brand-text">
              <div className="brand-name">SmartER</div>
              <div className="brand-sub">Healthcare AI</div>
            </div>
          </div>
          <nav className="sidebar-nav">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`sidebar-item ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="si-icon">{tab.icon}</span>
                <span className="si-label">{tab.label}</span>
                {activeTab === tab.id && <span className="si-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="sf-badge">
              <span className="sf-dot" />
              RL Model Active
            </div>
            {/* Sim status in sidebar too */}
            <div style={{
              display:"flex", alignItems:"center", gap:5, fontSize:11,
              color: simRunning ? "#fca5a5" : "#64748b", marginTop:4,
              cursor:"pointer"
            }} onClick={toggleSim}>
              <span>{simRunning ? "🔴" : "⚫"}</span>
              {simRunning ? "Sim Running" : "Sim Idle"}
            </div>
            <div className="sf-version">v1.0.0 · OpenEnv</div>
          </div>
        </div>

        {/* Main content area — NOTE: all 4 pages are mounted simultaneously
            but only the active one is visible. This prevents unmount on tab switch. */}
        <div className="content-area">
          <div className="content-header">
            <div className="ch-breadcrumb">
              <span className="ch-root">SmartER</span>
              <span className="ch-sep">›</span>
              <span className="ch-page">{TABS.find(t => t.id === activeTab)?.label}</span>
            </div>
          </div>
          <div className="content-body">
            {/* All pages always mounted — display:none hides inactive ones */}
            <div style={{ display: activeTab === "dashboard" ? "block" : "none" }}>
              <Dashboard simRunning={simRunning} onToggleSim={toggleSim} />
            </div>
            <div style={{ display: activeTab === "map" ? "block" : "none" }}>
              <MapView />
            </div>
            <div style={{ display: activeTab === "patient" ? "block" : "none" }}>
              <PatientForm />
            </div>
            <div style={{ display: activeTab === "admin" ? "block" : "none" }}>
              <AdminPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

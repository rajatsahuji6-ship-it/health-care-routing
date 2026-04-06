// pages/Dashboard.jsx — receives simRunning + onToggleSim as props from App
// This means the sim state is NEVER reset when switching tabs
import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"rgba(10,10,25,0.97)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#e2e8f0"}}>
      <div style={{color:"#94a3b8",marginBottom:4}}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{color:p.color,fontWeight:600}}>{p.name}: {p.value}{p.unit||""}</div>)}
    </div>
  );
};

export default function Dashboard({ simRunning, onToggleSim }) {
  const [stats,    setStats]    = useState(null);
  const [tracking, setTracking] = useState(null);
  const [history,  setHistory]  = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        fetch(`${API}/stats`).then(r => r.json()),
        fetch(`${API}/get_live_tracking`).then(r => r.json()),
      ]);
      setStats(s);
      setTracking(t);
      setHistory(h => [...h.slice(-19), {
        t: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        assignments: s.total_assignments,
        occupancy: s.bed_occupancy_pct,
      }]);
    } catch {
      setStats(MOCK_STATS);
      setTracking(MOCK_TRACKING);
    }
  }, []);

  // Poll every 3s — this interval survives because Dashboard never unmounts
  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 3000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (!stats) return <div className="loading">⏳ Loading system data…</div>;

  const bedData = (stats.hospitals || []).map(h => ({
    name: h.name.split(" ")[0],
    General: h.occupancy_pct,
    ICU: h.icu_occupancy,
  }));

  const pieData = [
    { name: "Available", value: stats.available_ambs ?? 3, color: "#22c55e" },
    { name: "Busy",      value: stats.busy_ambs      ?? 1, color: "#ef4444" },
  ];

  const patients = (tracking?.patients || []).slice(-6).reverse();

  const kpis = [
    { icon: "👥", label: "Total Patients",  value: stats.total_patients,     color: "#6366f1", delta: `+${stats.total_patients > 0 ? 1 : 0}` },
    { icon: "🛏️", label: "Beds In Use",     value: `${stats.beds_in_use}/${stats.total_beds}`, color: "#8b5cf6" },
    { icon: "📊", label: "Bed Occupancy",   value: `${stats.bed_occupancy_pct}%`, color: "#f59e0b",
      delta: stats.bed_occupancy_pct > 70 ? "⚠️ HIGH" : "Normal" },
    { icon: "🚑", label: "Ambs Free",       value: stats.available_ambs,     color: "#22c55e" },
    { icon: "✅", label: "Assignments",     value: stats.total_assignments,  color: "#06b6d4", delta: `+${stats.total_assignments > 0 ? 1 : 0}` },
  ];

  return (
    <div className="dashboard">
      <div>
        <div className="page-title">Command Center</div>
        <div className="page-sub">Real-time overview — RL model: <span style={{color:"#818cf8",fontWeight:600}}>DQN (PyTorch) · 1000 episodes · ε=0.05</span></div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <div key={i} className="kpi-card" style={{ "--kpi-color": k.color }}>
            <div className="kpi-top">
              <span className="kpi-icon">{k.icon}</span>
              {k.delta && (
                <span className="kpi-delta" style={{ color: k.delta.includes("⚠") ? "#f59e0b" : undefined }}>
                  {k.delta}
                </span>
              )}
            </div>
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-card-title">Hospital Occupancy</div>
              <div className="chart-card-sub">General beds vs ICU utilisation (%)</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bedData} barCategoryGap="30%">
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="General" fill="#6366f1" radius={[4, 4, 0, 0]} name="General" />
              <Bar dataKey="ICU"     fill="#a855f7" radius={[4, 4, 0, 0]} name="ICU" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-card-title">Ambulance Fleet</div>
              <div className="chart-card-sub">Current availability</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="value" strokeWidth={0}>
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pie-legend">
            {pieData.map(d => (
              <div key={d.name} className="pie-legend-item">
                <div className="pie-swatch" style={{ background: d.color }} />
                {d.name}: <strong style={{ color: d.color }}>{d.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live history */}
      {history.length > 2 && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-card-title">Live Activity Feed</div>
              <div className="chart-card-sub">Assignments &amp; bed occupancy over time</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Area type="monotone" dataKey="assignments" stroke="#6366f1" fill="url(#gA)" strokeWidth={2} name="Assignments" dot={false} />
              <Area type="monotone" dataKey="occupancy"   stroke="#22c55e" fill="url(#gB)" strokeWidth={2} name="Occupancy %" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bottom row */}
      <div className="bottom-row">
        {/* Recent patients */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-title">🚨 Recent Emergency Patients</span>
            <span className="section-count">{patients.length} shown</span>
          </div>
          <table className="os-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Severity</th><th>Status</th></tr>
            </thead>
            <tbody>
              {patients.length > 0 ? patients.map(p => (
                <tr key={p.id}>
                  <td><code>{p.id}</code></td>
                  <td style={{ color: "#e2e8f0", fontWeight: 500 }}>{p.name}</td>
                  <td>
                    <span className={`badge ${p.severity_label === "critical" ? "badge-red" : p.severity_label === "moderate" ? "badge-yellow" : "badge-green"}`}>
                      {p.severity_label} · {p.severity}
                    </span>
                  </td>
                  <td><span className={`status-tag ${p.status}`}>{p.status}</span></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "#475569", padding: "20px" }}>
                    No patients yet — start the simulation
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Simulation card — uses props from App, never resets */}
        <div className="sim-card">
          <div className="sim-card-title">⚙️ Simulation Engine</div>
          <div className="sim-desc">
            Auto-generates patients, moves ambulances, and continuously tests the RL model.
            <strong style={{ color: "#818cf8" }}> State persists across all tabs.</strong>
          </div>

          <div className={`sim-toggle ${simRunning ? "running" : ""}`} onClick={onToggleSim}>
            <span className="sim-toggle-icon">{simRunning ? "⏹" : "▶️"}</span>
            <div className="sim-toggle-text">
              <div className="sim-toggle-label">{simRunning ? "Stop Simulation" : "Start Simulation"}</div>
              <div className="sim-toggle-sub">{simRunning ? "Running — switch tabs freely" : "Click to begin auto-dispatch"}</div>
            </div>
            <span className="sim-toggle-arrow">›</span>
          </div>

          <div className="sim-stats">
            {[
              ["Status",      simRunning ? "🟢 Running" : "⚫ Idle"],
              ["Persistence", "Survives tab switches ✓"],
              ["Interval",    "2 seconds"],
              ["Model",       "DQN · ε=0.05 converged"],
              ["Dispatched",  `${stats.total_assignments} assignments`],
            ].map(([k, v]) => (
              <div key={k} className="sim-stat-row">
                <span className="sim-stat-label">{k}</span>
                <span className="sim-stat-value" style={{ color: k === "Persistence" ? "#22c55e" : undefined }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mock data ────────────────────────────────────────────────────────────────
const MOCK_STATS = {
  total_patients: 42, beds_in_use: 210, total_beds: 450,
  bed_occupancy_pct: 46.7, available_ambs: 3, busy_ambs: 1, total_assignments: 38,
  hospitals: [
    { name: "City General",  occupancy_pct: 28, icu_occupancy: 30 },
    { name: "Apex Medical",  occupancy_pct: 69, icu_occupancy: 60 },
    { name: "St. Mary's",    occupancy_pct: 20, icu_occupancy: 30 },
    { name: "LifeCare",      occupancy_pct: 24, icu_occupancy: 27 },
    { name: "Metro ER",      occupancy_pct: 30, icu_occupancy: 28 },
  ],
};
const MOCK_TRACKING = {
  patients: [
    { id: "abc1", name: "Ravi Kumar",   severity: 9.2, severity_label: "critical", status: "assigned" },
    { id: "abc2", name: "Priya Sharma", severity: 5.5, severity_label: "moderate", status: "admitted" },
    { id: "abc3", name: "Anil Mehta",   severity: 2.1, severity_label: "mild",     status: "pending"  },
  ],
};

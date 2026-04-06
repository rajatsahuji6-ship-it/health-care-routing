import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#000000", border:"2px solid #333333", padding:"12px", fontFamily:"var(--mono-font)", textTransform:"uppercase", color:"#ffffff"}}>
      <div style={{color:"#777777", marginBottom:8}}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{color:p.color}}>{p.name}: {p.value}</div>)}
    </div>
  );
};

export default function Dashboard({ simRunning, onToggleSim }) {
  const [stats, setStats] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [history, setHistory] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([ 
        fetch(`${API}/stats`).then(r => r.json()), 
        fetch(`${API}/get_live_tracking`).then(r => r.json()) 
      ]);
      setStats(s); 
      setTracking(t);
      setHistory(h => [...h.slice(-19), { 
        t: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), 
        assignments: s.total_assignments, 
        occupancy: s.bed_occupancy_pct 
      }]);
    } catch {
      // Mock data fallback if backend is offline
      setStats({ 
        total_patients: 42, beds_in_use: 210, total_beds: 450, bed_occupancy_pct: 46.7, 
        available_ambs: 3, busy_ambs: 1, total_assignments: 38, 
        hospitals: [{ name: "City Gen", occupancy_pct: 28, icu_occupancy: 30 }] 
      });
      setTracking({ patients: [] });
    }
  }, []);

  useEffect(() => { 
    fetchData(); 
    const iv = setInterval(fetchData, 3000); 
    return () => clearInterval(iv); 
  }, [fetchData]);

  if (!stats) return <div className="loading" style={{fontFamily:"var(--dot-font)", fontSize: 24}}>CONNECTING...</div>;

  const bedData = (stats.hospitals || []).map(h => ({
    name: h.name.split(" ")[0],
    General: h.occupancy_pct,
    ICU: h.icu_occupancy,
  }));

  const pieData = [
    { name: "Available", value: stats.available_ambs ?? 3, color: "#ffffff" },
    { name: "Busy",      value: stats.busy_ambs      ?? 1, color: "#f50000" },
  ];

  const patients = (tracking?.patients || []).slice(-5).reverse();

  return (
    <div className="dashboard">
      <div>
        <div className="page-title">SYSTEM.OVERVIEW</div>
        <div className="page-sub">AI ROUTING ACTIVE // ENGINE: PyTorch DQN</div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-value">{stats.total_patients}</div><div className="kpi-label">Patients</div></div>
        <div className="kpi-card"><div className="kpi-value" style={{color:"var(--accent)"}}>{stats.bed_occupancy_pct}%</div><div className="kpi-label">Occupancy</div></div>
        <div className="kpi-card"><div className="kpi-value">{stats.available_ambs}</div><div className="kpi-label">Ambs Free</div></div>
        <div className="kpi-card"><div className="kpi-value">{stats.total_assignments}</div><div className="kpi-label">Dispatched</div></div>
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-card-title" style={{marginBottom: 16}}>HOSPITAL.OCCUPANCY</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bedData} barCategoryGap="20%">
              <XAxis dataKey="name" tick={{ fill: "#777777", fontFamily: "var(--mono-font)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#777777", fontFamily: "var(--mono-font)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#111111" }} />
              <Bar dataKey="General" fill="#ffffff" radius={[0, 0, 0, 0]} name="General" />
              <Bar dataKey="ICU"     fill="#f50000" radius={[0, 0, 0, 0]} name="ICU" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-card-title" style={{marginBottom: 16}}>AMBULANCE.FLEET</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value" stroke="none">
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bottom-row">
        <div className="section-card">
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <span className="section-title">RECENT.DISPATCHES</span>
            <span className="section-count">[{patients.length}]</span>
          </div>
          <table className="os-table">
            <thead>
              <tr><th>ID</th><th>Severity</th><th>Status</th></tr>
            </thead>
            <tbody>
              {patients.length > 0 ? patients.map(p => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td style={{color: p.severity_label === "critical" ? "var(--accent)" : "inherit"}}>{p.severity_label}</td>
                  <td><span className={`status-tag ${p.status}`}>{p.status}</span></td>
                </tr>
              )) : (
                <tr><td colSpan={3} style={{textAlign:"center"}}>NO DATA</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sim-card">
          <div className="sim-card-title">SIMULATION.ENGINE</div>
          <div className="chart-card-sub" style={{marginBottom: 16, lineHeight: 1.5}}>
            Auto-generates patients and dispatches ambulances. State persists globally.
          </div>
          
          <div className={`sim-toggle ${simRunning ? "running" : ""}`} onClick={onToggleSim}>
            <div>{simRunning ? "[ HALT ENGINE ]" : "[ IGNITE ENGINE ]"}</div>
          </div>

          <div className="sim-stats">
            <div className="sim-stat-row"><span className="sim-stat-label">STATUS</span><span style={{color: simRunning ? 'var(--accent)' : 'inherit'}}>{simRunning ? "RUNNING" : "IDLE"}</span></div>
            <div className="sim-stat-row"><span className="sim-stat-label">TICK RATE</span><span>0.5s</span></div>
            <div className="sim-stat-row"><span className="sim-stat-label">MODEL</span><span>DQN (PYTORCH)</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
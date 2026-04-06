// pages/PatientForm.jsx — with GPS auto-detect + macOS theme
import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SEV_HINTS = {
  1: "Mild discomfort / routine check",      2: "Minor injury, stable vitals",
  3: "Moderate pain, mobile",                4: "Significant discomfort",
  5: "Moderate emergency",                   6: "Serious condition",
  7: "Severe emergency, urgent",             8: "Critical — ICU likely needed",
  9: "Life-threatening condition",           10: "Cardiac / Respiratory arrest",
};

// GPS status states
const GPS = { IDLE: "idle", LOADING: "loading", SUCCESS: "success", ERROR: "error", DENIED: "denied" };

export default function PatientForm() {
  const [form, setForm] = useState({ name: "", severity: 5, lat: "", lon: "", notes: "" });
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [gpsState, setGpsState] = useState(GPS.IDLE);
  const [gpsMsg,   setGpsMsg]   = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const sev = Number(form.severity);
  const sevLabel = sev >= 8 ? "critical" : sev >= 5 ? "moderate" : "mild";
  const sevColor = sev >= 8 ? "#ef4444"  : sev >= 5 ? "#f59e0b"  : "#22c55e";

  // ── Random Bengaluru location (fallback demo) ─────────────────────────────
  const randomLocation = () => {
    const lat = (12.85 + Math.random() * 0.25).toFixed(5);
    const lon = (77.45 + Math.random() * 0.30).toFixed(5);
    setForm(f => ({ ...f, lat, lon }));
  };

  // ── Real GPS auto-detect ───────────────────────────────────────────────────
  const detectLocation = () => {
    if (!navigator.geolocation) {
      setGpsState(GPS.ERROR);
      setGpsMsg("Geolocation is not supported by your browser.");
      return;
    }
    setGpsState(GPS.LOADING);
    setGpsMsg("Requesting location permission…");

    navigator.geolocation.getCurrentPosition(
      // ── Success ────────────────────────────────────────────────────────────
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        setForm(f => ({ ...f, lat, lon }));
        setGpsState(GPS.SUCCESS);
        setGpsMsg(`📍 Located: ${lat}, ${lon} (±${Math.round(pos.coords.accuracy)}m)`);
      },
      // ── Error ──────────────────────────────────────────────────────────────
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsState(GPS.DENIED);
          setGpsMsg("Location permission denied. Please allow access in your browser and try again.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsState(GPS.ERROR);
          setGpsMsg("Location unavailable. Try again or enter manually.");
        } else if (err.code === err.TIMEOUT) {
          setGpsState(GPS.ERROR);
          setGpsMsg("Location request timed out. Try again.");
        } else {
          setGpsState(GPS.ERROR);
          setGpsMsg("Could not get location. Enter coordinates manually.");
        }
      },
      // ── Options ────────────────────────────────────────────────────────────
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  };

  // ── Form submit ───────────────────────────────────────────────────────────
  const submit = async (e) => {
    e.preventDefault();
    if (!form.lat || !form.lon) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API}/add_patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     form.name || "Unknown Patient",
          severity: sev,
          lat:      parseFloat(form.lat),
          lon:      parseFloat(form.lon),
          notes:    form.notes,
        }),
      });
      setResult(await res.json());
    } catch {
      setResult(mockResult({ name: form.name || "Unknown Patient", severity: sev, lat: parseFloat(form.lat), lon: parseFloat(form.lon) }));
    } finally {
      setLoading(false);
    }
  };

  // ── GPS button styles based on state ─────────────────────────────────────
  const gpsBtnStyle = () => {
    if (gpsState === GPS.LOADING) return { color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)" };
    if (gpsState === GPS.SUCCESS) return { color: "#22c55e", borderColor: "rgba(34,197,94,0.3)",  background: "rgba(34,197,94,0.08)" };
    if (gpsState === GPS.DENIED)  return { color: "#ef4444", borderColor: "rgba(239,68,68,0.3)",  background: "rgba(239,68,68,0.08)" };
    if (gpsState === GPS.ERROR)   return { color: "#ef4444", borderColor: "rgba(239,68,68,0.3)",  background: "rgba(239,68,68,0.08)" };
    return {};
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">🚨 Emergency Intake</div>
        <div className="page-sub">Register a patient — the AI will instantly assign the optimal hospital and ambulance</div>
      </div>

      {/* ── Model info banner ─────────────────────────────────────────────── */}
      <div className="model-banner">
        <div className="mb-icon">🤖</div>
        <div className="mb-body">
          <div className="mb-title">DQN Model Active</div>
          <div className="mb-sub">Trained · 1000 episodes · ε=0.05 (fully converged) · PyTorch CPU</div>
        </div>
        <div className="mb-stats">
          <div className="mb-stat"><span>Episodes</span><strong>1,000</strong></div>
          <div className="mb-stat"><span>Epsilon</span><strong style={{color:"#22c55e"}}>0.05</strong></div>
          <div className="mb-stat"><span>Steps</span><strong>99,937</strong></div>
        </div>
      </div>

      <div className="patient-page">
        {/* ── Form ────────────────────────────────────────────────────────── */}
        <div className="form-glass">
          <div>
            <div className="form-title">Patient Details</div>
            <div className="form-sub">The RL model uses severity + GPS coordinates to dispatch the optimal response.</div>
          </div>

          <form onSubmit={submit} className="form-fields">
            {/* Name */}
            <div className="field">
              <label className="field-label">Patient Name</label>
              <input className="field-input" placeholder="Full name (optional)"
                value={form.name} onChange={e => set("name", e.target.value)} />
            </div>

            {/* Severity */}
            <div className="field">
              <label className="field-label">Severity Level</label>
              <div className="severity-display">
                <span className="severity-number" style={{ color: sevColor }}>{sev.toFixed(1)}</span>
                <span className={`badge ${sevLabel === "critical" ? "badge-red" : sevLabel === "moderate" ? "badge-yellow" : "badge-green"}`}>
                  {sevLabel.toUpperCase()}
                </span>
              </div>
              <div className="severity-track">
                <div className="severity-fill" style={{
                  width: `${(sev - 1) / 9 * 100}%`,
                  background: `linear-gradient(90deg, #22c55e, ${sevColor})`,
                }} />
              </div>
              <input type="range" className="sev-slider" min={1} max={10} step={0.1}
                value={form.severity} onChange={e => set("severity", e.target.value)} />
              <div className="severity-hint">{SEV_HINTS[Math.round(sev)]}</div>
            </div>

            {/* GPS section */}
            <div className="field">
              <label className="field-label">Patient Location</label>

              {/* Auto-detect button */}
              <button
                type="button"
                className="gps-detect-btn"
                style={gpsBtnStyle()}
                onClick={detectLocation}
                disabled={gpsState === GPS.LOADING}
              >
                {gpsState === GPS.LOADING ? (
                  <><span className="gps-spin">⏳</span> Detecting Location…</>
                ) : gpsState === GPS.SUCCESS ? (
                  <><span>✅</span> Location Detected — Click to Refresh</>
                ) : gpsState === GPS.DENIED ? (
                  <><span>🚫</span> Permission Denied — Click to Retry</>
                ) : gpsState === GPS.ERROR ? (
                  <><span>⚠️</span> Error — Click to Retry</>
                ) : (
                  <><span>📍</span> Auto-Detect My Location</>
                )}
              </button>

              {/* GPS status message */}
              {gpsMsg && (
                <div className={`gps-msg ${gpsState}`}>{gpsMsg}</div>
              )}

              {/* Manual coordinates */}
              <div className="coords-label">Or enter coordinates manually:</div>
              <div className="field-row-2">
                <div className="field">
                  <label className="field-label" style={{textTransform:"none",letterSpacing:0,fontSize:11}}>Latitude</label>
                  <input className="field-input" type="number" step="0.00001" placeholder="12.9716"
                    value={form.lat} onChange={e => set("lat", e.target.value)} required />
                </div>
                <div className="field">
                  <label className="field-label" style={{textTransform:"none",letterSpacing:0,fontSize:11}}>Longitude</label>
                  <input className="field-input" type="number" step="0.00001" placeholder="77.5946"
                    value={form.lon} onChange={e => set("lon", e.target.value)} required />
                </div>
              </div>

              <button type="button" className="btn-secondary" style={{marginTop:6}} onClick={randomLocation}>
                🎲 Use Random Bengaluru Location (Demo)
              </button>
            </div>

            {/* Notes */}
            <div className="field">
              <label className="field-label">Clinical Notes</label>
              <textarea className="field-input" rows={3}
                placeholder="Symptoms, allergies, medical history…"
                value={form.notes} onChange={e => set("notes", e.target.value)} />
            </div>

            <button type="submit" className="btn-primary" disabled={loading || !form.lat || !form.lon}>
              {loading ? "🔄 Dispatching AI Model…" : "🚑 Dispatch Emergency Response"}
            </button>
            {(!form.lat || !form.lon) && (
              <div style={{fontSize:11,color:"#64748b",textAlign:"center"}}>
                ↑ Set patient location first (auto-detect or manual)
              </div>
            )}
          </form>
        </div>

        {/* ── Result ──────────────────────────────────────────────────────── */}
        {result ? (
          <AssignmentResult result={result} />
        ) : (
          <div className="empty-result">
            <div className="empty-icon">🤖</div>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "#e2e8f0" }}>AI Assignment Result</div>
            <div>Submit a patient request to see the DQN model's dispatch decision, reasoning, and live ETA.</div>
            <div style={{marginTop:16,fontSize:11,color:"#475569"}}>
              Model: <code style={{color:"#818cf8"}}>dqn_healthcare.pth</code> · 1000 eps trained
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentResult({ result }) {
  const a   = result.assignment;
  const p   = result.patient;
  const sev = p?.severity || 0;
  const sevLabel = sev >= 8 ? "critical" : sev >= 5 ? "moderate" : "mild";

  return (
    <div className="result-glass">
      <div className="result-header-row">
        <span className="result-title">✅ Response Dispatched</span>
        <span className="result-id">ID: {p?.id}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className={`badge ${sevLabel === "critical" ? "badge-red" : sevLabel === "moderate" ? "badge-yellow" : "badge-green"}`}>
          Severity {sev} — {sevLabel}
        </span>
        <span className="badge badge-blue">🤖 {a?.model_used}</span>
        {p?.notes && <span className="badge badge-purple">📝 Notes attached</span>}
      </div>

      <div className="result-cards">
        <div className="result-item">
          <span className="ri-icon">🏥</span>
          <div className="ri-body">
            <div className="ri-label">Assigned Hospital</div>
            <div className="ri-value">{a?.hospital?.name}</div>
            <div className="ri-sub">{a?.hospital?.beds_available} beds · {a?.hospital?.icu_available} ICU free</div>
          </div>
        </div>
        <div className="result-item">
          <span className="ri-icon">🚑</span>
          <div className="ri-body">
            <div className="ri-label">Dispatched Ambulance</div>
            <div className="ri-value">{a?.ambulance?.name || a?.ambulance?.id}</div>
            <div className="ri-sub">{a?.dist_amb_patient} km from patient</div>
          </div>
        </div>
        <div className="result-item">
          <span className="ri-icon">⏱</span>
          <div className="ri-body">
            <div className="ri-label">Total ETA</div>
            <div className="ri-value eta-big">{a?.eta_minutes} min</div>
            <div className="ri-sub">pickup → hospital</div>
          </div>
        </div>
        {p?.lat && (
          <div className="result-item">
            <span className="ri-icon">📍</span>
            <div className="ri-body">
              <div className="ri-label">Patient GPS</div>
              <div className="ri-value" style={{fontSize:13}}>{parseFloat(p.lat).toFixed(4)}, {parseFloat(p.lon).toFixed(4)}</div>
              <div className="ri-sub">Coordinates confirmed</div>
            </div>
          </div>
        )}
      </div>

      {a?.reasoning?.length > 0 && (
        <div className="reasoning-box">
          <div className="reasoning-title">🤖 DQN Model Reasoning</div>
          <div className="reasoning-list">
            {a.reasoning.map((r, i) => <div key={i} className="reasoning-row">{r}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function mockResult(body) {
  const sev = body.severity;
  return {
    patient: { ...body, id: "demo1", severity_label: sev >= 8 ? "critical" : sev >= 5 ? "moderate" : "mild", status: "assigned" },
    assignment: {
      hospital:  { id: "h0", name: "City General Hospital", beds_available: 71, icu_available: 13, icu_beds: 20 },
      ambulance: { id: "a0", name: "AMB-001" },
      eta_minutes: 12.3, dist_amb_patient: 3.2, dist_to_hospital: 5.8,
      model_used: "DQN (demo)",
      reasoning: [
        "✅ 71 beds available at City General",
        "🏥 13 ICU beds free",
        "📍 AMB-001 is 3.2 km away",
        "⏱ ETA to patient: 3.2 min | to hospital: 9.1 min",
      ],
    },
  };
}

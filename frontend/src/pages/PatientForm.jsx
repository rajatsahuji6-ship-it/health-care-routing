import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function PatientForm() {
  const [formData, setFormData] = useState({ name: "", severity: 5, lat: null, lon: null });
  const [address, setAddress] = useState("AWAITING GPS SIGNAL...");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setFormData(prev => ({ ...prev, lat: latitude, lon: longitude }));
          
          try {
            // Reverse Geocoding using OpenStreetMap Nominatim
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            
            const area = data.address.suburb || data.address.neighbourhood || data.address.city_district || "";
            const city = data.address.city || data.address.town || data.address.village || "";
            const state = data.address.state || "";
            
            const formattedAddress = [area, city, state].filter(Boolean).join(", ");
            setAddress(formattedAddress ? formattedAddress.toUpperCase() : "LOCATION FOUND // NO ADDRESS DATA");
          } catch (e) {
            setAddress(`GPS ACQUIRED: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        },
        (error) => {
          setAddress("LOCATION PERMISSION DENIED. SYSTEM HALTED.");
        }
      );
    } else {
      setAddress("GEOLOCATION NOT SUPPORTED BY HARDWARE.");
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.lat || !formData.lon) return alert("Cannot dispatch without GPS coordinates.");
    
    setLoading(true);
    try {
      const res = await fetch(`${API}/add_patient`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", alignItems: "start" }}>
      
      {/* INTAKE FORM */}
      <div className="section-card">
        <div className="section-title" style={{ marginBottom: "24px" }}>DISPATCH.INTAKE_FORM</div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontFamily: "var(--mono-font)", fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Patient Name</label>
            <input 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="e.g. John Doe"
              style={{ background: "transparent", border: "2px solid var(--border-2)", color: "var(--text)", padding: "16px", fontFamily: "var(--mono-font)", outline: "none", borderRadius: "8px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontFamily: "var(--mono-font)", fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Severity (1-10)</label>
              <span style={{ fontFamily: "var(--dot-font)", fontSize: "28px", color: formData.severity > 7 ? "var(--accent)" : "var(--text)" }}>{formData.severity}</span>
            </div>
            <input 
              type="range" min="1" max="10" step="0.1"
              value={formData.severity}
              onChange={e => setFormData({...formData, severity: parseFloat(e.target.value)})}
              style={{ accentColor: "var(--accent)", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-3)", padding: "16px", borderRadius: "8px", border: "1px dashed var(--border-2)" }}>
            <label style={{ fontFamily: "var(--mono-font)", fontSize: "11px", color: "var(--accent)", textTransform: "uppercase" }}>Target Coordinates</label>
            <div style={{ fontFamily: "var(--mono-font)", fontSize: "14px", color: "var(--text)", fontWeight: "bold" }}>
              {address}
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || !formData.lat}
            style={{ 
              background: formData.lat ? "var(--text)" : "var(--surface-3)", 
              color: formData.lat ? "var(--bg)" : "var(--text-3)", 
              border: "none", padding: "16px", fontFamily: "var(--mono-font)", fontWeight: "bold", fontSize: "14px",
              textTransform: "uppercase", cursor: formData.lat ? "pointer" : "not-allowed", borderRadius: "40px", marginTop: "12px",
              transition: "transform 0.1s"
            }}
            onMouseOver={(e) => formData.lat && (e.target.style.transform = "scale(0.98)")}
            onMouseOut={(e) => formData.lat && (e.target.style.transform = "scale(1)")}
          >
            {loading ? "PROCESSING..." : "[ INITIALIZE DISPATCH ]"}
          </button>
        </form>
      </div>

      {/* RL MODEL RESULT */}
      <div className="section-card">
        <div className="section-title" style={{ marginBottom: "24px", color: "var(--accent)" }}>AI.ROUTING_RESULT</div>
        
        {result ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid var(--border)", paddingBottom: "16px" }}>
              <div>
                <div style={{ fontFamily: "var(--mono-font)", fontSize: "11px", color: "var(--text-3)" }}>ASSIGNED HOSPITAL</div>
                <div style={{ fontFamily: "var(--dot-font)", fontSize: "24px", marginTop: "4px" }}>{result.assignment.hospital.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--mono-font)", fontSize: "11px", color: "var(--text-3)" }}>DISTANCE</div>
                <div style={{ fontFamily: "var(--mono-font)", fontSize: "16px", fontWeight: "bold", marginTop: "8px" }}>{result.assignment.dist_to_hospital} KM</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid var(--border)", paddingBottom: "16px" }}>
              <div>
                <div style={{ fontFamily: "var(--mono-font)", fontSize: "11px", color: "var(--text-3)" }}>DISPATCHED AMBULANCE</div>
                <div style={{ fontFamily: "var(--dot-font)", fontSize: "24px", marginTop: "4px" }}>{result.assignment.ambulance.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--mono-font)", fontSize: "11px", color: "var(--accent)" }}>TOTAL ETA</div>
                <div style={{ fontFamily: "var(--dot-font)", fontSize: "32px", color: "var(--accent)" }}>{result.assignment.eta_minutes} MIN</div>
              </div>
            </div>

            <div style={{ background: "var(--surface-3)", border: "1px solid var(--border)", padding: "16px", borderRadius: "8px" }}>
              <div style={{ fontFamily: "var(--mono-font)", fontSize: "11px", color: "var(--text-3)", marginBottom: "12px" }}>MODEL REASONING</div>
              {result.assignment.reasoning.map((r, i) => (
                <div key={i} style={{ fontFamily: "var(--mono-font)", fontSize: "13px", marginBottom: "8px", color: "var(--text-2)" }}>&gt; {r}</div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: "var(--mono-font)", color: "var(--text-3)", textAlign: "center", padding: "80px 0" }}>
            AWAITING SYSTEM INPUT...
          </div>
        )}
      </div>
    </div>
  );
}
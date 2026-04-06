// pages/AdminPanel.jsx — macOS OS theme
import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function AdminPanel() {
  const [hospitals,   setHospitals]   = useState(DEMO_H);
  const [ambulances,  setAmbulances]  = useState(DEMO_A);
  const [assignments, setAssignments] = useState(DEMO_ASGN);
  const [tab, setTab] = useState("hospitals");

  const fetchAll = async () => {
    try {
      const [h,a,t] = await Promise.all([
        fetch(`${API}/get_hospitals`).then(r=>r.json()),
        fetch(`${API}/get_ambulances`).then(r=>r.json()),
        fetch(`${API}/get_live_tracking`).then(r=>r.json()),
      ]);
      setHospitals(h.hospitals||DEMO_H);
      setAmbulances(a.ambulances||DEMO_A);
      setAssignments(t.assignments||DEMO_ASGN);
    } catch {}
  };

  useEffect(() => { fetchAll(); const iv=setInterval(fetchAll,5000); return ()=>clearInterval(iv); }, []);

  const updateBeds = async (id, field, val) => {
    try {
      await fetch(`${API}/update_hospital_beds`,{method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({hospital_id:id,[field]:+val})});
      fetchAll();
    } catch { fetchAll(); }
  };

  return (
    <div className="admin-page">
      <div>
        <div className="page-title">⚙️ Admin Panel</div>
        <div className="page-sub">Manage hospital resources, ambulance fleet, and view assignment history</div>
      </div>

      <div className="admin-tabs">
        {[["hospitals","🏥 Hospitals"],["ambulances","🚑 Ambulances"],["assignments","📋 Assignments"]].map(([id,label])=>(
          <button key={id} className={`admin-tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      {tab==="hospitals" && (
        <div className="admin-glass">
          <table className="admin-table">
            <thead>
              <tr><th>Hospital</th><th>Beds</th><th>ICU</th><th>Wait (min)</th><th>Occupancy</th></tr>
            </thead>
            <tbody>
              {hospitals.map(h=>{
                const occ=Math.round((h.total_beds-h.beds_available)/h.total_beds*100);
                const c=occ>80?"#ef4444":occ>50?"#f59e0b":"#22c55e";
                return (
                  <tr key={h.id}>
                    <td>
                      <div style={{fontWeight:600,color:"#e2e8f0",fontSize:13}}>{h.name}</div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{h.address}</div>
                    </td>
                    <td>
                      <input type="number" min={0} max={h.total_beds} defaultValue={h.beds_available}
                        className="admin-input" onBlur={e=>updateBeds(h.id,"beds_available",e.target.value)} />
                      <span style={{color:"#64748b",fontSize:11}}> / {h.total_beds}</span>
                    </td>
                    <td>
                      <input type="number" min={0} max={h.icu_beds} defaultValue={h.icu_available}
                        className="admin-input" onBlur={e=>updateBeds(h.id,"icu_available",e.target.value)} />
                      <span style={{color:"#64748b",fontSize:11}}> / {h.icu_beds}</span>
                    </td>
                    <td>
                      <input type="number" min={0} max={120} defaultValue={h.wait_time}
                        className="admin-input" onBlur={e=>updateBeds(h.id,"wait_time",e.target.value)} />
                    </td>
                    <td style={{minWidth:130}}>
                      <div className="occ-bar">
                        <div className="occ-fill" style={{width:`${occ}%`,background:c}} />
                      </div>
                      <span style={{fontSize:11,color:c,fontWeight:600}}>{occ}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab==="ambulances" && (
        <div className="admin-glass">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Name</th><th>Status</th><th>GPS</th><th>Assigned Patient</th></tr></thead>
            <tbody>
              {ambulances.map(a=>(
                <tr key={a.id}>
                  <td><code style={{color:"#818cf8",background:"rgba(99,102,241,0.1)",padding:"1px 6px",borderRadius:4,fontSize:11}}>{a.id}</code></td>
                  <td style={{fontWeight:600,color:"#e2e8f0"}}>{a.name||a.id}</td>
                  <td><span className={`status-tag ${a.status}`}>{a.status}</span></td>
                  <td><span style={{fontSize:11,color:"#64748b",fontVariantNumeric:"tabular-nums"}}>{a.lat?.toFixed(4)}, {a.lon?.toFixed(4)}</span></td>
                  <td>{a.assigned_patient ? <code style={{color:"#818cf8",fontSize:11}}>{a.assigned_patient}</code> : <span style={{color:"#475569"}}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==="assignments" && (
        <div className="admin-glass">
          <table className="admin-table">
            <thead><tr><th>Patient</th><th>Hospital</th><th>Ambulance</th><th>ETA</th><th>Timestamp</th></tr></thead>
            <tbody>
              {[...assignments].reverse().map((asgn,i)=>(
                <tr key={i}>
                  <td><code style={{color:"#818cf8",fontSize:11,background:"rgba(99,102,241,0.1)",padding:"1px 6px",borderRadius:4}}>{asgn.patient_id}</code></td>
                  <td style={{color:"#94a3b8",fontSize:12}}>{asgn.hospital_id}</td>
                  <td style={{color:"#94a3b8",fontSize:12}}>{asgn.ambulance_id}</td>
                  <td><span style={{color:"#22c55e",fontWeight:600}}>{asgn.eta_minutes} min</span></td>
                  <td style={{color:"#64748b",fontSize:11}}>{new Date((asgn.timestamp||Date.now()/1000)*1000).toLocaleTimeString()}</td>
                </tr>
              ))}
              {assignments.length===0 && <tr><td colSpan={5} style={{textAlign:"center",color:"#475569",padding:24}}>No assignments yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const DEMO_H = [
  {id:"h0",name:"City General Hospital",    address:"MG Road",     total_beds:100,beds_available:72,icu_beds:20,icu_available:14,wait_time:10},
  {id:"h1",name:"Apex Medical Centre",      address:"Koramangala", total_beds:80, beds_available:25,icu_beds:15,icu_available:3, wait_time:25},
  {id:"h2",name:"St. Mary's Hospital",      address:"Hebbal",      total_beds:60, beds_available:48,icu_beds:10,icu_available:7, wait_time:5 },
  {id:"h3",name:"LifeCare Institute",       address:"Indiranagar", total_beds:120,beds_available:91,icu_beds:30,icu_available:22,wait_time:20},
  {id:"h4",name:"Metro Emergency Hospital", address:"Whitefield",  total_beds:90, beds_available:63,icu_beds:25,icu_available:18,wait_time:8 },
];
const DEMO_A = [
  {id:"a0",name:"AMB-001",lat:12.960,lon:77.590,status:"available",assigned_patient:null},
  {id:"a1",name:"AMB-002",lat:12.980,lon:77.610,status:"busy",     assigned_patient:"demo1"},
  {id:"a2",name:"AMB-003",lat:12.945,lon:77.630,status:"available",assigned_patient:null},
  {id:"a3",name:"AMB-004",lat:13.000,lon:77.570,status:"available",assigned_patient:null},
];
const DEMO_ASGN = [
  {patient_id:"abc1",hospital_id:"h0",ambulance_id:"a0",eta_minutes:12.3,timestamp:Date.now()/1000-120},
  {patient_id:"abc2",hospital_id:"h2",ambulance_id:"a2",eta_minutes:8.7, timestamp:Date.now()/1000-60},
];

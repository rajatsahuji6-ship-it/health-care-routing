"""
main.py  –  FastAPI Backend
============================
Healthcare Routing & Emergency Management API
"""

import asyncio
import json
import math
import os
import random
import sys
import time
import uuid
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── RL imports ───────────────────────────────────────────────────────────────
BACKEND_DIR = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(BACKEND_DIR, "..", "openenv_env"))
sys.path.insert(0, os.path.join(BACKEND_DIR, "..", "rl"))

from healthcare_env import HealthcareRoutingEnv, haversine_distance, compute_eta

# ─────────────────────────────────────────────────────────────────────────────
# In-memory "database"
# ─────────────────────────────────────────────────────────────────────────────

HOSPITALS: List[Dict] = [
    {"id": "h0", "name": "City General Hospital",    "lat": 12.9716, "lon": 77.5946, "total_beds": 100, "beds_available": 72, "icu_beds": 20, "icu_available": 14, "wait_time": 10, "address": "MG Road, Bengaluru"},
    {"id": "h1", "name": "Apex Medical Centre",      "lat": 12.9352, "lon": 77.6244, "total_beds": 80,  "beds_available": 55, "icu_beds": 15, "icu_available": 9,  "wait_time": 15, "address": "Koramangala, Bengaluru"},
    {"id": "h2", "name": "St. Mary's Hospital",      "lat": 13.0012, "lon": 77.5800, "total_beds": 60,  "beds_available": 48, "icu_beds": 10, "icu_available": 7,  "wait_time": 5,  "address": "Hebbal, Bengaluru"},
    {"id": "h3", "name": "LifeCare Institute",       "lat": 12.9582, "lon": 77.6478, "total_beds": 120, "beds_available": 91, "icu_beds": 30, "icu_available": 22, "wait_time": 20, "address": "Indiranagar, Bengaluru"},
    {"id": "h4", "name": "Metro Emergency Hospital", "lat": 12.9830, "lon": 77.6080, "total_beds": 90,  "beds_available": 63, "icu_beds": 25, "icu_available": 18, "wait_time": 8,  "address": "Whitefield, Bengaluru"},
]

AMBULANCES: List[Dict] = [
    {"id": "a0", "name": "AMB-001", "lat": 12.9600, "lon": 77.5900, "status": "available", "assigned_patient": None, "speed_kmh": 60},
    {"id": "a1", "name": "AMB-002", "lat": 12.9800, "lon": 77.6100, "status": "available", "assigned_patient": None, "speed_kmh": 65},
    {"id": "a2", "name": "AMB-003", "lat": 12.9450, "lon": 77.6300, "status": "available", "assigned_patient": None, "speed_kmh": 55},
    {"id": "a3", "name": "AMB-004", "lat": 13.0000, "lon": 77.5700, "status": "available", "assigned_patient": None, "speed_kmh": 70},
]

PATIENTS: Dict[str, Dict]     = {}
ASSIGNMENTS: List[Dict]       = []

# ─────────────────────────────────────────────────────────────────────────────
# RL environment
# ─────────────────────────────────────────────────────────────────────────────
rl_env: Optional[HealthcareRoutingEnv] = None

try:
    import torch
    from dqn_agent import DQNAgent
    _model_path = os.path.join(BACKEND_DIR, "..", "rl", "models", "dqn_healthcare.pth")
    dqn_agent: Optional[DQNAgent] = None
    if os.path.exists(_model_path):
        _tmp_env = HealthcareRoutingEnv()
        _tmp_obs, _ = _tmp_env.reset()
        dqn_agent = DQNAgent(
            obs_size    = _tmp_env.observation_space.shape[0],
            action_size = _tmp_env.action_space.n,
        )
        dqn_agent.load(_model_path)
        print("[Backend] DQN model loaded ✓")
    else:
        print("[Backend] No trained DQN found – using greedy fallback")
except Exception as e:
    dqn_agent = None
    print(f"[Backend] DQN unavailable ({e}) – using greedy fallback")


# ─────────────────────────────────────────────────────────────────────────────
# Simulation state
# ─────────────────────────────────────────────────────────────────────────────
simulation_running = False
simulation_task    = None
ws_connections: List[WebSocket] = []


class PatientIn(BaseModel):
    name:     str            = Field(default="Unknown Patient")
    severity: float          = Field(..., ge=1, le=10)
    lat:      float          = Field(...)
    lon:      float          = Field(...)
    notes:    Optional[str]  = None

class AmbulanceLocationUpdate(BaseModel):
    ambulance_id: str
    lat:          float
    lon:          float
    status:       Optional[str] = None

class HospitalBedsUpdate(BaseModel):
    hospital_id:     str
    beds_available:  Optional[int] = None
    icu_available:   Optional[int] = None
    wait_time:       Optional[int] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rl_env
    rl_env = HealthcareRoutingEnv()
    rl_env.reset()
    print("[Backend] Healthcare Routing API started")
    yield
    print("[Backend] Shutting down")

app = FastAPI(title="SmartER API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def rl_assign(patient: Dict) -> Dict:
    env = HealthcareRoutingEnv(hospitals=HOSPITALS, ambulances=AMBULANCES)
    env.hospitals  = [{**h, "beds_available": h["beds_available"], "icu_available": h["icu_available"], "current_wait": h["wait_time"]} for h in HOSPITALS]
    env.ambulances = [{**a, "status": a["status"]} for a in AMBULANCES]
    env.patient = {"severity": patient["severity"], "lat": patient["lat"], "lon": patient["lon"], "traffic": random.uniform(0.9, 1.8)}

    obs = env._get_observation()
    action = dqn_agent.greedy_action(obs) if dqn_agent else env.get_greedy_action()

    hosp_idx, amb_idx = env.decode_action(action)
    hospital  = HOSPITALS[min(hosp_idx, len(HOSPITALS) - 1)]
    ambulance = AMBULANCES[min(amb_idx, len(AMBULANCES) - 1)]

    dist_amb_patient = haversine_distance(ambulance["lat"], ambulance["lon"], patient["lat"], patient["lon"])
    dist_patient_hosp = haversine_distance(patient["lat"], patient["lon"], hospital["lat"], hospital["lon"])
    traffic = env.patient["traffic"]
    eta_to_patient = compute_eta(dist_amb_patient, traffic, ambulance.get("speed_kmh", 60))
    eta_to_hospital = compute_eta(dist_patient_hosp, traffic, ambulance.get("speed_kmh", 60))
    total_eta = round(eta_to_patient + eta_to_hospital, 1)

    reasoning = []
    if hospital["beds_available"] > 0: reasoning.append(f"✅ {hospital['beds_available']} beds available")
    if patient["severity"] >= 8 and hospital["icu_available"] > 0: reasoning.append(f"🏥 ICU bed available ({hospital['icu_available']} free)")
    reasoning.append(f"📍 Ambulance {ambulance['name']} is {dist_amb_patient:.1f} km away")
    reasoning.append(f"⏱ ETA to patient: {eta_to_patient:.1f} min | to hospital: {eta_to_hospital:.1f} min")

    return {
        "hospital": hospital, "ambulance": ambulance, "eta_minutes": total_eta,
        "dist_amb_patient": round(dist_amb_patient, 2), "dist_to_hospital": round(dist_patient_hosp, 2),
        "reasoning": reasoning, "model_used": "DQN" if dqn_agent else "Greedy",
    }


@app.get("/")
def root(): return {"status": "ok", "message": "Healthcare Routing API v1.0"}

@app.post("/add_patient")
def add_patient(patient_in: PatientIn):
    patient_id = str(uuid.uuid4())[:8]
    severity_label = "critical" if patient_in.severity >= 8 else "moderate" if patient_in.severity >= 5 else "mild"
    patient = {
        "id": patient_id, "name": patient_in.name, "severity": patient_in.severity,
        "severity_label": severity_label, "lat": patient_in.lat, "lon": patient_in.lon,
        "notes": patient_in.notes, "status": "pending", "timestamp": time.time(),
    }
    PATIENTS[patient_id] = patient
    assignment = rl_assign(patient)

    hosp_id = assignment["hospital"]["id"]
    amb_id  = assignment["ambulance"]["id"]

    for h in HOSPITALS:
        if h["id"] == hosp_id:
            h["beds_available"] = max(0, h["beds_available"] - 1)
            if patient_in.severity >= 8: h["icu_available"] = max(0, h["icu_available"] - 1)
            break

    for a in AMBULANCES:
        if a["id"] == amb_id:
            a["status"] = "busy"
            a["assigned_patient"] = patient_id
            break

    patient["status"] = "assigned"
    ASSIGNMENTS.append({"patient_id": patient_id, "hospital_id": hosp_id, "ambulance_id": amb_id, "eta_minutes": assignment["eta_minutes"], "timestamp": time.time()})

    return {"patient": patient, "assignment": assignment, "message": f"Assigned using {assignment['model_used']}"}

@app.get("/get_hospitals")
def get_hospitals(): return {"hospitals": HOSPITALS, "count": len(HOSPITALS)}

@app.get("/get_ambulances")
def get_ambulances(): return {"ambulances": AMBULANCES, "count": len(AMBULANCES)}

@app.post("/assign_resources")
def assign_resources(patient_in: PatientIn): return rl_assign(patient_in.model_dump())

@app.put("/update_ambulance_location")
def update_ambulance_location(update: AmbulanceLocationUpdate):
    for a in AMBULANCES:
        if a["id"] == update.ambulance_id:
            a["lat"], a["lon"] = update.lat, update.lon
            if update.status: a["status"] = update.status
            return {"ok": True, "ambulance": a}
    raise HTTPException(status_code=404, detail="Ambulance not found")

@app.put("/update_hospital_beds")
def update_hospital_beds(update: HospitalBedsUpdate):
    for h in HOSPITALS:
        if h["id"] == update.hospital_id:
            if update.beds_available is not None: h["beds_available"] = update.beds_available
            if update.icu_available is not None: h["icu_available"] = update.icu_available
            if update.wait_time is not None: h["wait_time"] = update.wait_time
            return {"ok": True, "hospital": h}
    raise HTTPException(status_code=404, detail="Hospital not found")

@app.get("/get_live_tracking")
def get_live_tracking():
    return {"timestamp": time.time(), "hospitals": HOSPITALS, "ambulances": AMBULANCES, "patients": list(PATIENTS.values()), "assignments": ASSIGNMENTS[-20:]}

@app.get("/patients")
def get_patients(): return {"patients": list(PATIENTS.values()), "count": len(PATIENTS)}

@app.get("/stats")
def get_stats():
    total_beds = sum(h["total_beds"] for h in HOSPITALS)
    used_beds  = sum(h["total_beds"] - h["beds_available"] for h in HOSPITALS)
    return {
        "total_patients": len(PATIENTS), "total_assignments": len(ASSIGNMENTS),
        "total_beds": total_beds, "beds_in_use": used_beds, "bed_occupancy_pct": round(used_beds / max(total_beds, 1) * 100, 1),
        "available_ambs": sum(1 for a in AMBULANCES if a["status"] == "available"),
        "busy_ambs": sum(1 for a in AMBULANCES if a["status"] == "busy"),
        "hospitals": [{"name": h["name"], "occupancy_pct": round((h["total_beds"] - h["beds_available"]) / h["total_beds"] * 100, 1), "icu_occupancy": round((h["icu_beds"] - h["icu_available"]) / h["icu_beds"] * 100, 1)} for h in HOSPITALS]
    }

# ── FIXED SIMULATION LOGIC: FAST SMOOTH TICKING ────────────────────────────
async def simulation_loop():
    global simulation_running
    LAT_MIN, LAT_MAX = 12.85, 13.10
    LON_MIN, LON_MAX = 77.45, 77.75

    while simulation_running:
        for a in AMBULANCES:
            if a["status"] == "busy" and a.get("assigned_patient"):
                pid = a["assigned_patient"]
                patient = PATIENTS.get(pid)
                if patient:
                    dlat = patient["lat"] - a["lat"]
                    dlon = patient["lon"] - a["lon"]
                    dist = math.sqrt(dlat**2 + dlon**2)
                    
                    speed = 0.008 # High speed for visible, smooth simulation
                    
                    if dist > speed:
                        a["lat"] += (dlat / dist) * speed
                        a["lon"] += (dlon / dist) * speed
                    else:
                        a["lat"] = patient["lat"]
                        a["lon"] = patient["lon"]
                        a["status"] = "available"
                        a["assigned_patient"] = None
                        PATIENTS[pid]["status"] = "admitted"

        if random.random() < 0.15:
            fake_patient = PatientIn(name=f"Sim-PT-{random.randint(100, 999)}", severity=round(random.uniform(1, 10), 1), lat=random.uniform(LAT_MIN, LAT_MAX), lon=random.uniform(LON_MIN, LON_MAX))
            add_patient(fake_patient)

        for h in HOSPITALS:
            if random.random() < 0.05 and h["beds_available"] < h["total_beds"]: h["beds_available"] += 1
            if random.random() < 0.02 and h["icu_available"] < h["icu_beds"]: h["icu_available"] += 1

        if ws_connections:
            payload = json.dumps({"type": "live_update", "timestamp": time.time(), "ambulances": AMBULANCES, "hospitals": HOSPITALS, "patients": list(PATIENTS.values())[-10:]})
            dead = []
            for ws in ws_connections:
                try: await ws.send_text(payload)
                except Exception: dead.append(ws)
            for ws in dead: ws_connections.remove(ws)

        await asyncio.sleep(0.5) # 0.5s tick rate for fluid movement

@app.get("/simulation/start")
async def start_simulation():
    global simulation_running, simulation_task
    if simulation_running: return {"message": "Simulation already running"}
    simulation_running = True
    simulation_task = asyncio.create_task(simulation_loop())
    return {"message": "Simulation started"}

@app.get("/simulation/stop")
async def stop_simulation():
    global simulation_running, simulation_task
    simulation_running = False
    if simulation_task: simulation_task.cancel()
    return {"message": "Simulation stopped"}

@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    await websocket.accept()
    ws_connections.append(websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        ws_connections.remove(websocket)
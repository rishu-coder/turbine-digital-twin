# ⚙️ Industrial Gas Turbine Digital Twin Platform

A cloud-ready, real-time **Digital Twin** for medium-sized industrial gas turbines — delivering anomaly detection, physics-informed prognostics, remaining useful life (RUL) estimation, and predictive maintenance recommendations.

🌐 **Live Demo:** `https://rishu-coder.github.io/turbine-digital-twin/`

---

## 🎯 Project Vision

This platform provides the critical commercialisation step for digital twin technology applied to industrial gas turbines. It delivers a new suite of **predictive service offerings** to asset operators, enabling:

- **Earlier fault detection** — catch degradation weeks before failure
- **Data-driven maintenance scheduling** — move from time-based to condition-based servicing
- **Reduced unplanned downtime** — operators receive actionable alerts with severity triage
- **Fleet-level visibility** — monitor multiple turbines across multiple sites from a single interface

---

## 📸 Platform Overview

| View | Description |
|---|---|
| **Fleet Dashboard** | 4-turbine fleet with live health status, alert counts, and sparkline trends |
| **3D Turbine Schematic** | Animated cross-section showing compressor, combustor, turbine, and bearing health |
| **Performance Analytics** | Live parameter table with 11 operating variables and trend charts |
| **Prognostics & RUL** | Remaining Useful Life estimation, fault probability matrix, maintenance recommendations |
| **Alert Management** | Fleet-wide alert aggregation with ISO 10816 / API 670 alarm limit reference |

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    TURBINE·DT PLATFORM                             │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Fleet       │  │  Twin State      │  │  Prognostics         │  │
│  │  Sidebar     │  │  Engine          │  │  Engine              │  │
│  │              │  │  (Physics Model) │  │  (RUL + Fault Prob)  │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│         └───────────────────┼────────────────────────┘             │
│                             │                                      │
│              ┌──────────────▼──────────────┐                       │
│              │  Digital Twin State Store   │                       │
│              │  (React useState)           │                       │
│              │                             │                       │
│              │  TurbineTwin {              │                       │
│              │    load, speed, EGT, TIT    │                       │
│              │    comp_efficiency          │                       │
│              │    vibration (6 channels)   │                       │
│              │    anomaly_score            │                       │
│              │    health_index             │                       │
│              │    rul, fault_mode          │                       │
│              │    alerts[], history[]      │                       │
│              │  }                          │                       │
│              └──────────────┬──────────────┘                       │
│                             │                                      │
│         ┌───────────────────┼────────────────────────┐             │
│         ▼                   ▼                        ▼             │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Schematic   │  │  Performance     │  │  Alert Management    │  │
│  │  (SVG anim)  │  │  Charts + Table  │  │  + ISO limits ref    │  │
│  └──────────────┘  └──────────────────┘  └──────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘

Production Extension:
┌─────────────────────────────────────────────────────────────────────┐
│  IoT Edge Layer → MQTT Broker → NestJS API → TimescaleDB            │
│  → WebSocket → React Frontend (replaces simulation engine)          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔬 Key Technical Features

### Physics-Informed Sensor Simulation Engine
Each turbine twin maintains **11 live operating parameters** updated every 1.2 seconds with realistic Gaussian noise and drift:

| Parameter | Range | Unit |
|---|---|---|
| Load | 60–100 | % |
| Shaft Speed | 2,950–3,050 | RPM |
| Exhaust Gas Temperature (EGT) | 480–620 | °C |
| Turbine Inlet Temperature (TIT) | 1,150–1,320 | °C |
| Compressor Outlet Pressure | 12–17 | bar |
| Compressor Efficiency | 78–92 | % |
| Turbine Efficiency | 80–94 | % |
| Fuel Flow Rate | 1.5–2.5 | kg/s |
| Heat Rate | 9,200–12,000 | kJ/kWh |
| NOx Emissions | 20–90 | ppm |
| Bearing Vibration (6 channels) | 0.5–12 | mm/s RMS |

### Fault Injection Engine
Five physics-accurate fault modes can be injected at runtime for testing, training, and scenario planning:

| Fault Mode | Affected Parameters | Signature |
|---|---|---|
| **Compressor Fouling** | Comp. efficiency ↓, heat rate ↑, EGT ↑ | Gradual efficiency degradation |
| **Hot Section Degradation** | EGT ↑, TIT ↑, turbine efficiency ↓, NOx ↑ | Thermal exceedance |
| **Bearing Wear** | Bearing 2 vibration ↑ (oscillatory) | Periodic vibration signature |
| **Compressor Surge** | Pressure oscillation, load ↓, vibration spikes | Cyclic instability |
| **Combustor Anomaly** | NOx ↑, TIT oscillation ↑, fuel flow ↑ | Combustion irregularity |

### Anomaly Detection
- Composite anomaly score (0–1) computed per twin per tick
- Threshold: > 0.65 = CRITICAL, 0.35–0.65 = ELEVATED, < 0.35 = NORMAL
- Score driven by multi-parameter deviation and fault physics

### Prognostics & RUL
- **Remaining Useful Life** estimated in operating hours toward major overhaul (10,000 hr baseline)
- Degradation rate compounds with fault severity
- **Fault Probability Matrix** for 7 fault classes with physics-informed probability estimates
- **Maintenance Recommendation Engine** generates prioritised action list with time-to-action

### Alert System (ISO 10816 / API 670 Aligned)
| Code | Trigger | Severity |
|---|---|---|
| EGT-HI | Exhaust temp > 580°C | CRITICAL |
| TIT-HI | Turbine inlet temp > 1,290°C | CRITICAL |
| VIB-B2 | Bearing 2 vibration > 7.0 mm/s | WARNING |
| CEFF-LO | Compressor efficiency < 82% | WARNING |
| NOX-HI | NOx > 70 ppm | WARNING |
| ANOM | Anomaly score > 0.65 | CRITICAL |
| RUL-LO | Remaining useful life < 500 hrs | CRITICAL |
| HI-LO | Health index < 70% | WARNING |

---

## 📖 How to Use the Platform

### Fleet Sidebar (Left Panel)
- Shows all 4 turbines with real-time health index, EGT, and RUL summary
- Status badges: `RUNNING` (green) · `WARNING` (amber) · `ALERT` (red, pulsing)
- Click any turbine card to select it and load its detail views
- Fleet summary shows total RUNNING / WARNING / CRITICAL counts

### Navigation Tabs

| Tab | Contents |
|---|---|
| **Overview** | Animated turbine schematic, radial gauges, anomaly ring, health bars, bearing vibration |
| **Performance** | Full 11-parameter live data table with status classification and trend sparklines |
| **Prognostics & RUL** | RUL bar, degradation trend, fault probability matrix, maintenance recommendations |
| **Alerts** | Fleet-wide alert aggregation, alarm counts, ISO/API alarm limit reference table |

### Fault Injection (Top Bar → ⚡ FAULT INJECT)
Use this to simulate real fault scenarios on the currently selected turbine:

1. Select a turbine from the fleet sidebar
2. Click **⚡ FAULT INJECT** in the top bar
3. Choose a fault mode (e.g. "Bearing Wear")
4. Watch the platform respond: anomaly score rises, alerts fire, health degrades
5. Select **Normal Operation** to clear the injected fault

This feature is designed for:
- Operator training scenarios
- Algorithm validation
- Customer demonstrations of the prognostic capability

### Pause / Resume
Use the **⏸ PAUSE** button to freeze the simulation for detailed inspection of any parameter state.

### Quick Stats Rail (Right Panel)
Always-visible summary for the selected turbine: power output, heat rate, fuel flow, NOx, anomaly score, health index, RUL, and per-bearing vibration maxima.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | React 18 + Vite | UI rendering and build tooling |
| 3D/SVG | Native SVG + CSS animation | Turbine schematic with rotating components |
| Charts | Native SVG sparklines | Zero-dependency trend visualisation |
| State | React `useState` + `useRef` | Twin state and history buffers |
| Physics engine | Custom JS | Gaussian sensor drift + fault injection |
| Deployment | GitHub Pages via `gh-pages` | Static hosting |
| Fonts | Google Fonts (Share Tech Mono) | Industrial monospace typography |

---

## 📁 Project Structure

```
turbine-digital-twin/
├── public/
│   └── vite.svg
├── src/
│   ├── App.jsx          ← Entire platform (physics engine + UI)
│   ├── main.jsx         ← React entry point
│   └── index.css        ← Minimal global reset
├── index.html
├── vite.config.js       ← base: '/turbine-digital-twin/'
├── package.json
└── README.md
```

---


## 🗺️ Roadmap to Production

### Phase 1 — Cloud Backend (Next)
- [ ] NestJS API with JWT authentication and RBAC (Operator / Engineer / Admin)
- [ ] PostgreSQL + TimescaleDB for time-series sensor storage
- [ ] MQTT broker (Mosquitto / AWS IoT Core) for real edge device ingestion
- [ ] WebSocket / Socket.IO gateway replacing the simulation engine

### Phase 2 — ML Integration
- [ ] LSTM / Transformer-based anomaly detection model (replace rule-based score)
- [ ] Physics-informed neural network for RUL regression
- [ ] Automated retraining pipeline on new sensor data
- [ ] Model confidence intervals displayed in the UI

### Phase 3 — Production Features
- [ ] Multi-site / multi-fleet hierarchy view
- [ ] Historical playback and event replay
- [ ] Maintenance work order integration (SAP PM / Maximo)
- [ ] PDF report generation (daily / weekly / inspection reports)
- [ ] Mobile-responsive layout for field engineers
- [ ] Digital twin model import (Siemens NX / Ansys FMU)

### Phase 4 — Commercial Service Offerings
- [ ] Customer portal with white-label branding
- [ ] SLA-based alert escalation (email / SMS / PagerDuty)
- [ ] Benchmarking against fleet anonymised performance baseline
- [ ] Energy efficiency optimisation recommendations (heat rate improvement)
- [ ] Regulatory compliance reporting (emissions, noise)

---

## 📐 Standards & References

- **ISO 10816** — Mechanical vibration / evaluation of machine vibration
- **API 670** — Machinery protection systems
- **ISO 3977** — Gas turbines — procurement
- **ASME PTC 22** — Gas turbine performance test code
- **IEC 62541 (OPC-UA)** — Industrial communication standard for IoT integration

---

## 🤝 Contributing

Pull requests are welcome. For major feature changes please open an issue to discuss scope first.

---

## 📄 License

[MIT](LICENSE)

---

*Built with React · Deployed on GitHub Pages · Designed for commercialisation of industrial digital twin technology*

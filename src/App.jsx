import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// PHYSICS ENGINE — Realistic gas turbine sensor simulation
// ═══════════════════════════════════════════════════════════════════
const TURBINE_FLEET = [
  { id: "GT-001", name: "Gas Turbine 001", site: "Platform Alpha", model: "SGT-400", mw: 12.9 },
  { id: "GT-002", name: "Gas Turbine 002", site: "Platform Alpha", model: "SGT-400", mw: 12.9 },
  { id: "GT-003", name: "Gas Turbine 003", site: "Facility Bravo", model: "SGT-700", mw: 32.0 },
  { id: "GT-004", name: "Gas Turbine 004", site: "Facility Bravo", model: "SGT-700", mw: 32.0 },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand  = (lo, hi) => lo + Math.random() * (hi - lo);
const gauss = (mu, sigma) => mu + sigma * (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.5;

// Fault injection modes
const FAULT_MODES = {
  NORMAL:       "normal",
  COMPRESSOR:   "compressor_fouling",
  HOT_SECTION:  "hot_section_degradation",
  BEARING:      "bearing_wear",
  SURGE:        "compressor_surge",
  COMBUSTOR:    "combustor_anomaly",
};

function initTwin(t) {
  return {
    ...t,
    // Operating parameters
    load: rand(75, 95),           // % load
    speed: gauss(3000, 5),        // RPM
    exhaust_temp: gauss(520, 3),  // °C
    tit: gauss(1220, 8),          // Turbine Inlet Temp °C
    compressor_inlet_temp: gauss(25, 2), // °C
    compressor_outlet_pressure: gauss(14.5, 0.2), // bar
    compressor_efficiency: gauss(87, 0.5), // %
    turbine_efficiency: gauss(89, 0.5),   // %
    fuel_flow: gauss(1.8, 0.05),          // kg/s
    heat_rate: gauss(9800, 50),           // kJ/kWh
    nox_emissions: gauss(42, 2),          // ppm
    // Vibration (X,Y per bearing)
    vib_b1x: gauss(1.8, 0.2), vib_b1y: gauss(1.7, 0.2),
    vib_b2x: gauss(2.1, 0.2), vib_b2y: gauss(2.0, 0.2),
    vib_b3x: gauss(1.5, 0.1), vib_b3y: gauss(1.6, 0.1),
    // Health & prognostics
    health_index: rand(88, 97),   // 0–100
    rul: Math.round(rand(4200, 8800)), // Remaining Useful Life (hours)
    fault_mode: FAULT_MODES.NORMAL,
    fault_severity: 0,
    anomaly_score: rand(0.01, 0.08),
    // Maintenance
    hours_since_inspection: Math.round(rand(200, 2800)),
    starts_since_overhaul: Math.round(rand(50, 400)),
    // Status
    status: "RUNNING",
    alerts: [],
    trend_degradation: 0,
    // History buffers
    hist_exhaust: Array.from({length:40}, () => gauss(520,3)),
    hist_vib:     Array.from({length:40}, () => gauss(2.0, 0.2)),
    hist_health:  Array.from({length:40}, () => rand(88,97)),
    hist_load:    Array.from({length:40}, () => rand(75,95)),
  };
}

function stepTwin(t, tick) {
  const degradation = t.trend_degradation;
  const fm = t.fault_mode;
  const sev = t.fault_severity;

  // Base drift
  let load = clamp(t.load + gauss(0, 0.3), 60, 100);
  let speed = clamp(t.speed + gauss(0, 1.5), 2950, 3050);
  let exhaust_temp = clamp(t.exhaust_temp + gauss(0, 0.8) + degradation * 0.5, 480, 620);
  let tit = clamp(t.tit + gauss(0, 2), 1150, 1320);
  let comp_press = clamp(t.compressor_outlet_pressure + gauss(0, 0.05), 12, 17);
  let comp_eff = clamp(t.compressor_efficiency + gauss(0, 0.1) - degradation * 0.02, 78, 92);
  let turb_eff = clamp(t.turbine_efficiency + gauss(0, 0.1) - degradation * 0.015, 80, 94);
  let fuel_flow = clamp(t.fuel_flow + gauss(0, 0.008), 1.5, 2.5);
  let heat_rate = clamp(t.heat_rate + gauss(0, 10) + degradation * 5, 9200, 12000);
  let nox = clamp(t.nox_emissions + gauss(0, 0.5), 20, 90);
  let vib_b1x = clamp(t.vib_b1x + gauss(0, 0.05), 0.5, 12);
  let vib_b1y = clamp(t.vib_b1y + gauss(0, 0.05), 0.5, 12);
  let vib_b2x = clamp(t.vib_b2x + gauss(0, 0.05), 0.5, 12);
  let vib_b2y = clamp(t.vib_b2y + gauss(0, 0.05), 0.5, 12);
  let vib_b3x = clamp(t.vib_b3x + gauss(0, 0.03), 0.5, 12);
  let vib_b3y = clamp(t.vib_b3y + gauss(0, 0.03), 0.5, 12);
  let anomaly_score = clamp(t.anomaly_score + gauss(0, 0.005), 0, 1);
  let health_index = t.health_index;
  let rul = t.rul;
  let new_degradation = degradation;

  // ── Fault injection physics ──────────────────────────────────────
  if (fm === FAULT_MODES.COMPRESSOR) {
    comp_eff -= sev * 4;
    comp_press -= sev * 0.8;
    heat_rate += sev * 200;
    exhaust_temp += sev * 15;
    anomaly_score = clamp(0.3 + sev * 0.4, 0, 1);
    new_degradation = Math.min(5, degradation + 0.02);
  }
  if (fm === FAULT_MODES.HOT_SECTION) {
    exhaust_temp += sev * 30;
    tit += sev * 40;
    turb_eff -= sev * 3;
    nox += sev * 20;
    anomaly_score = clamp(0.4 + sev * 0.4, 0, 1);
    new_degradation = Math.min(5, degradation + 0.03);
  }
  if (fm === FAULT_MODES.BEARING) {
    vib_b2x += sev * 4 + Math.sin(tick * 0.3) * sev;
    vib_b2y += sev * 3.5 + Math.cos(tick * 0.3) * sev;
    anomaly_score = clamp(0.35 + sev * 0.45, 0, 1);
    new_degradation = Math.min(5, degradation + 0.025);
  }
  if (fm === FAULT_MODES.SURGE) {
    comp_press += Math.sin(tick * 0.8) * sev * 2;
    vib_b1x += Math.abs(Math.sin(tick * 1.2)) * sev * 3;
    load -= sev * 10;
    anomaly_score = clamp(0.6 + sev * 0.3, 0, 1);
    new_degradation = Math.min(5, degradation + 0.04);
  }
  if (fm === FAULT_MODES.COMBUSTOR) {
    nox += sev * 30;
    tit += sev * 25 + Math.sin(tick * 0.4) * sev * 10;
    exhaust_temp += sev * 20;
    fuel_flow += sev * 0.15;
    anomaly_score = clamp(0.35 + sev * 0.4, 0, 1);
    new_degradation = Math.min(5, degradation + 0.02);
  }

  // Health index degradation model
  health_index = clamp(health_index - new_degradation * 0.01 - (anomaly_score > 0.5 ? 0.05 : 0), 0, 100);
  rul = Math.max(0, t.rul - 0.5 - new_degradation * 0.5);

  // Alert generation
  const alerts = [];
  if (exhaust_temp > 580)   alerts.push({ code:"EGT-HI",  sev:"CRITICAL", msg:"Exhaust Gas Temp critically high", value:`${exhaust_temp.toFixed(0)}°C` });
  if (tit > 1290)           alerts.push({ code:"TIT-HI",  sev:"CRITICAL", msg:"Turbine Inlet Temp exceeded limit", value:`${tit.toFixed(0)}°C` });
  if (vib_b2x > 7 || vib_b2y > 7) alerts.push({ code:"VIB-B2", sev:"WARNING",  msg:"Bearing 2 vibration elevated", value:`${Math.max(vib_b2x,vib_b2y).toFixed(2)} mm/s` });
  if (comp_eff < 82)        alerts.push({ code:"CEFF-LO", sev:"WARNING",  msg:"Compressor efficiency below threshold", value:`${comp_eff.toFixed(1)}%` });
  if (nox > 70)             alerts.push({ code:"NOX-HI",  sev:"WARNING",  msg:"NOx emissions elevated", value:`${nox.toFixed(0)} ppm` });
  if (anomaly_score > 0.65) alerts.push({ code:"ANOM",    sev:"CRITICAL", msg:"Anomaly detection threshold exceeded", value:`Score: ${anomaly_score.toFixed(3)}` });
  if (rul < 500)            alerts.push({ code:"RUL-LO",  sev:"CRITICAL", msg:"Remaining useful life critically low", value:`${Math.round(rul)} hrs` });
  if (health_index < 70)    alerts.push({ code:"HI-LO",   sev:"WARNING",  msg:"Health index degraded", value:`${health_index.toFixed(1)}%` });

  const status = alerts.some(a => a.sev === "CRITICAL") ? "ALERT" :
                 alerts.some(a => a.sev === "WARNING")  ? "WARNING" : "RUNNING";

  return {
    ...t,
    load, speed, exhaust_temp, tit,
    compressor_inlet_temp: clamp(t.compressor_inlet_temp + gauss(0, 0.2), 15, 45),
    compressor_outlet_pressure: comp_press,
    compressor_efficiency: comp_eff,
    turbine_efficiency: turb_eff,
    fuel_flow, heat_rate, nox_emissions: nox,
    vib_b1x, vib_b1y, vib_b2x, vib_b2y, vib_b3x, vib_b3y,
    anomaly_score, health_index, rul, status, alerts,
    trend_degradation: new_degradation,
    hours_since_inspection: t.hours_since_inspection + 1/3600,
    starts_since_overhaul: t.starts_since_overhaul,
    hist_exhaust: [...t.hist_exhaust.slice(1), exhaust_temp],
    hist_vib:     [...t.hist_vib.slice(1),     Math.max(vib_b1x,vib_b2x,vib_b3x)],
    hist_health:  [...t.hist_health.slice(1),  health_index],
    hist_load:    [...t.hist_load.slice(1),     load],
  };
}

// ═══════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════
const C = {
  bg:       "#05080f",
  surface:  "#090e1a",
  panel:    "#0c1220",
  border:   "#0e2040",
  borderHi: "#1a3a6e",
  accent:   "#00c8ff",
  accentDim:"#0066aa",
  amber:    "#f59e0b",
  red:      "#ef4444",
  green:    "#10b981",
  violet:   "#7c3aed",
  text:     "#ccd6f6",
  textDim:  "#4a6fa5",
  textMute: "#1e3a5f",
};

// ═══════════════════════════════════════════════════════════════════
// MINI CHART — SVG sparkline with fill
// ═══════════════════════════════════════════════════════════════════
function MiniChart({ data, color, height = 48, width = "100%", fill = true }) {
  const svgRef = useRef(null);
  const [svgW, setSvgW] = useState(200);
  useEffect(() => {
    if (svgRef.current) setSvgW(svgRef.current.clientWidth || 200);
  }, []);
  if (!data || data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data) || lo + 1;
  const pad = (hi - lo) * 0.1;
  const loP = lo - pad, hiP = hi + pad;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * svgW;
    const y = height - ((v - loP) / (hiP - loP)) * height;
    return [x, y];
  });
  const linePath = pts.map((p,i) => `${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const fillPath = linePath + ` L${svgW},${height} L0,${height} Z`;
  return (
    <svg ref={svgRef} style={{ width, height, display:"block" }} viewBox={`0 0 ${svgW} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={fillPath} fill={`url(#g-${color.replace("#","")})`} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RADIAL GAUGE
// ═══════════════════════════════════════════════════════════════════
function RadialGauge({ value, max, min = 0, label, unit, color, size = 80 }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -140 + pct * 280;
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const arcPath = (startDeg, endDeg, radius) => {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(s), y1 = cy + radius * Math.sin(s);
    const x2 = cx + radius * Math.cos(e), y2 = cy + radius * Math.sin(e);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M${x1},${y1} A${radius},${radius} 0 ${large} 1 ${x2},${y2}`;
  };
  const needleX = cx + r * 0.72 * Math.cos((angle * Math.PI) / 180);
  const needleY = cy + r * 0.72 * Math.sin((angle * Math.PI) / 180);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={arcPath(-140, 140, r)} fill="none" stroke={C.border} strokeWidth="5" strokeLinecap="round" />
      <path d={arcPath(-140, -140 + pct * 280, r)} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill={color} />
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={size * 0.16} fontWeight="700" fill={color} fontFamily="'Courier New', monospace">
        {typeof value === "number" ? value.toFixed(value > 100 ? 0 : 1) : value}
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize={size * 0.1} fill={C.textDim} fontFamily="'Courier New', monospace">{unit}</text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ANOMALY SCORE RING
// ═══════════════════════════════════════════════════════════════════
function AnomalyRing({ score, size = 120 }) {
  const pct = Math.min(1, score);
  const color = pct > 0.65 ? C.red : pct > 0.35 ? C.amber : C.green;
  const cx = size/2, cy = size/2, r = size*0.38;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const label = pct > 0.65 ? "CRITICAL" : pct > 0.35 ? "ELEVATED" : "NORMAL";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth="8" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
        strokeLinecap="round" style={{ transition:"stroke-dasharray 0.6s ease" }} />
      <text x={cx} y={cy-8} textAnchor="middle" fontSize={size*0.22} fontWeight="900" fill={color} fontFamily="'Courier New', monospace">
        {(score*100).toFixed(1)}
      </text>
      <text x={cx} y={cy+8} textAnchor="middle" fontSize={size*0.09} fill={C.textDim} fontFamily="'Courier New', monospace">ANOMALY</text>
      <text x={cx} y={cy+20} textAnchor="middle" fontSize={size*0.09} fill={color} fontFamily="'Courier New', monospace">{label}</text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH BAR
// ═══════════════════════════════════════════════════════════════════
function HealthBar({ value, label, warn = 70, crit = 50 }) {
  const color = value < crit ? C.red : value < warn ? C.amber : C.green;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>{label}</span>
        <span style={{ fontSize:10, color, fontFamily:"monospace", fontWeight:700 }}>{value.toFixed(1)}%</span>
      </div>
      <div style={{ height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:`${value}%`, height:"100%", background:color,
          borderRadius:2, transition:"width 0.6s ease, background 0.4s" }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TURBINE SCHEMATIC SVG — stylised cross-section
// ═══════════════════════════════════════════════════════════════════
function TurbineSchematic({ twin, size = 400 }) {
  const tick = useRef(0);
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setAngle(a => (a + (twin?.status === "RUNNING" ? 3 : twin?.status === "ALERT" ? 5 : 1)) % 360);
    }, 30);
    return () => clearInterval(id);
  }, [twin?.status]);

  if (!twin) return null;
  const w = size, h = size * 0.45;
  const cx = w / 2, cy = h / 2;
  const statusColor = twin.status === "ALERT" ? C.red : twin.status === "WARNING" ? C.amber : C.accent;
  const bladeCt = 12;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:"block" }}>
      <defs>
        <radialGradient id="turbBodyGrad" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#1a3a6e" stopOpacity="0.8"/>
          <stop offset="100%" stopColor="#05080f" stopOpacity="0.9"/>
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <linearGradient id="caseGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a5f"/>
          <stop offset="100%" stopColor="#0a1628"/>
        </linearGradient>
      </defs>

      {/* Exhaust plume */}
      {twin.status === "RUNNING" || twin.status === "ALERT" ? (
        <ellipse cx={w-30} cy={cy} rx={20} ry={12}
          fill={twin.exhaust_temp > 580 ? "#7f1d1d" : "#1a3a4e"}
          opacity="0.4" />
      ) : null}

      {/* Main casing */}
      <rect x={60} y={cy-52} width={w-120} height={104} rx={8}
        fill="url(#caseGrad)" stroke={C.borderHi} strokeWidth="1.5" />

      {/* Compressor section (left) */}
      <rect x={65} y={cy-50} width={120} height={100} rx={4}
        fill="#0a1628" stroke={C.textMute} strokeWidth="1" />
      <text x={125} y={cy-34} textAnchor="middle" fontSize="8"
        fill={C.textDim} fontFamily="monospace" letterSpacing="2">COMPRESSOR</text>

      {/* Combustor section (middle) */}
      <rect x={190} y={cy-48} width={w-380} height={96} rx={4}
        fill="#0d1520" stroke={C.textMute} strokeWidth="1" />
      <text x={cx} y={cy-32} textAnchor="middle" fontSize="8"
        fill={C.textDim} fontFamily="monospace" letterSpacing="2">COMBUSTOR</text>
      {/* Flame */}
      <ellipse cx={cx} cy={cy+10}
        rx={twin.fault_mode === FAULT_MODES.COMBUSTOR ? 28 : 20}
        ry={twin.fault_mode === FAULT_MODES.COMBUSTOR ? 22 : 16}
        fill={twin.fault_mode === FAULT_MODES.COMBUSTOR ? "#7f1d1d" : "#1a3050"}
        opacity="0.7" />
      <ellipse cx={cx} cy={cy+10} rx={12} ry={10}
        fill={twin.fault_mode === FAULT_MODES.COMBUSTOR ? C.red : C.accent}
        opacity="0.4" filter="url(#glow)" />

      {/* Turbine section (right) */}
      <rect x={w-305} y={cy-50} width={120} height={100} rx={4}
        fill="#0a1628" stroke={C.textMute} strokeWidth="1" />
      <text x={w-245} y={cy-34} textAnchor="middle" fontSize="8"
        fill={C.textDim} fontFamily="monospace" letterSpacing="2">TURBINE</text>

      {/* Rotating compressor disk */}
      {Array.from({length: bladeCt}).map((_,i) => {
        const a = ((i / bladeCt) * 360 + angle) * Math.PI / 180;
        const bx = 125 + Math.cos(a) * 28, by = cy + Math.sin(a) * 28;
        return (
          <line key={i} x1={125} y1={cy} x2={bx} y2={by}
            stroke={statusColor} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        );
      })}
      <circle cx={125} cy={cy} r={28} fill="none"
        stroke={statusColor} strokeWidth="1" opacity="0.3" />
      <circle cx={125} cy={cy} r={8} fill={statusColor} opacity="0.6" />

      {/* Rotating turbine disk */}
      {Array.from({length: 10}).map((_,i) => {
        const a = ((-i / 10) * 360 + angle * 1.1) * Math.PI / 180;
        const bx = w-245 + Math.cos(a) * 32, by = cy + Math.sin(a) * 32;
        return (
          <line key={i} x1={w-245} y1={cy} x2={bx} y2={by}
            stroke={twin.exhaust_temp > 560 ? C.amber : statusColor}
            strokeWidth="3" strokeLinecap="round" opacity="0.65" />
        );
      })}
      <circle cx={w-245} cy={cy} r={8} fill={twin.exhaust_temp > 560 ? C.amber : statusColor} opacity="0.6" />

      {/* Shaft */}
      <line x1={70} y1={cy} x2={w-70} y2={cy}
        stroke={C.borderHi} strokeWidth="3" strokeDasharray="6,4" opacity="0.5" />

      {/* Bearing indicators */}
      {[125, cx, w-245].map((bx, i) => {
        const vibMax = [Math.max(twin.vib_b1x,twin.vib_b1y), Math.max(twin.vib_b2x,twin.vib_b2y), Math.max(twin.vib_b3x,twin.vib_b3y)][i];
        const bc = vibMax > 7 ? C.red : vibMax > 4 ? C.amber : C.green;
        return (
          <g key={i}>
            <rect x={bx-6} y={cy+36} width={12} height={8} rx={2} fill={bc} opacity="0.8" />
            <text x={bx} y={cy+54} textAnchor="middle" fontSize="7" fill={bc} fontFamily="monospace">
              B{i+1}
            </text>
          </g>
        );
      })}

      {/* Inlet arrow */}
      <polygon points={`62,${cy-10} 62,${cy+10} 50,${cy}`} fill={C.accent} opacity="0.6" />
      <text x={30} y={cy+4} textAnchor="middle" fontSize="8" fill={C.textDim} fontFamily="monospace">IN</text>

      {/* Exhaust arrow */}
      <polygon points={`${w-62},${cy-10} ${w-62},${cy+10} ${w-50},${cy}`}
        fill={twin.exhaust_temp > 580 ? C.red : C.amber} opacity="0.6" />
      <text x={w-30} y={cy+4} textAnchor="middle" fontSize="8"
        fill={twin.exhaust_temp > 580 ? C.red : C.amber} fontFamily="monospace">EGT</text>

      {/* Status badge */}
      <rect x={cx-30} y={h-18} width={60} height={14} rx={3}
        fill={statusColor} opacity="0.15" />
      <text x={cx} y={h-8} textAnchor="middle" fontSize="9" fill={statusColor}
        fontFamily="monospace" fontWeight="700" filter="url(#glow)">
        {twin.status}
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIBRATION WATERFALL PLOT
// ═══════════════════════════════════════════════════════════════════
function VibrationPlot({ twin }) {
  const bearings = [
    { label:"B1-X", val:twin.vib_b1x }, { label:"B1-Y", val:twin.vib_b1y },
    { label:"B2-X", val:twin.vib_b2x }, { label:"B2-Y", val:twin.vib_b2y },
    { label:"B3-X", val:twin.vib_b3x }, { label:"B3-Y", val:twin.vib_b3y },
  ];
  return (
    <div>
      {bearings.map(b => {
        const color = b.val > 7 ? C.red : b.val > 4 ? C.amber : C.green;
        const pct = Math.min(100, (b.val / 12) * 100);
        return (
          <div key={b.label} style={{ marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:9, color:C.textDim, fontFamily:"monospace", width:30, flexShrink:0 }}>{b.label}</span>
            <div style={{ flex:1, height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
              <div style={{ width:`${pct}%`, height:"100%", background:color,
                borderRadius:3, transition:"width 0.4s ease" }} />
            </div>
            <span style={{ fontSize:9, color, fontFamily:"monospace", width:40, textAlign:"right" }}>
              {b.val.toFixed(2)}
            </span>
          </div>
        );
      })}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:12, marginTop:4 }}>
        {[["OK","<4",C.green],["WARN","4-7",C.amber],["CRIT",">7",C.red]].map(([l,v,c]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
            <div style={{ width:6, height:6, borderRadius:1, background:c }} />
            <span style={{ fontSize:8, color:C.textDim }}>{l} {v} mm/s</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RUL PROGNOSTICS CHART
// ═══════════════════════════════════════════════════════════════════
function RULChart({ twin }) {
  const rul = twin.rul;
  const maxRul = 10000;
  const pct = (rul / maxRul) * 100;
  const color = rul < 500 ? C.red : rul < 2000 ? C.amber : C.green;
  const maintDate = new Date();
  maintDate.setHours(maintDate.getHours() + rul);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:8 }}>
        <div>
          <div style={{ fontSize:28, fontWeight:900, color, fontFamily:"monospace", lineHeight:1 }}>
            {Math.round(rul).toLocaleString()}
          </div>
          <div style={{ fontSize:9, color:C.textDim, letterSpacing:2, marginTop:2 }}>REMAINING USEFUL LIFE (hours)</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:11, color:C.textDim }}>Projected maintenance</div>
          <div style={{ fontSize:12, color, fontFamily:"monospace", fontWeight:700 }}>
            {maintDate.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
          </div>
        </div>
      </div>
      <div style={{ height:8, background:C.border, borderRadius:4, overflow:"hidden", marginBottom:6 }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color,
          borderRadius:4, transition:"width 0.8s ease" }} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:8, color:C.textMute }}>0 hrs</span>
        <span style={{ fontSize:8, color:C.textMute }}>10,000 hrs (major overhaul)</span>
      </div>

      <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
        {[
          { label:"Hours since inspection", val:`${Math.round(twin.hours_since_inspection).toLocaleString()} h` },
          { label:"Starts since overhaul",  val:twin.starts_since_overhaul },
          { label:"Degradation rate",       val:`${twin.trend_degradation.toFixed(3)}/tick` },
        ].map(({ label, val }) => (
          <div key={label} style={{ background:C.bg, borderRadius:6, padding:"8px 10px",
            border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:8, color:C.textDim, letterSpacing:1, marginBottom:4 }}>{label.toUpperCase()}</div>
            <div style={{ fontSize:12, color:C.text, fontFamily:"monospace", fontWeight:700 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ALERT PANEL
// ═══════════════════════════════════════════════════════════════════
function AlertPanel({ allTwins }) {
  const allAlerts = Object.values(allTwins).flatMap(t =>
    t.alerts.map(a => ({ ...a, turbine: t.id, site: t.site }))
  ).sort((a,b) => (a.sev === "CRITICAL" ? -1 : 1));

  if (!allAlerts.length) return (
    <div style={{ padding:"16px 12px", textAlign:"center" }}>
      <div style={{ fontSize:10, color:C.green, letterSpacing:2 }}>✓ ALL SYSTEMS NOMINAL</div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {allAlerts.map((a, i) => (
        <div key={i} style={{
          padding:"8px 10px", borderRadius:6,
          background: a.sev === "CRITICAL" ? "#1a0505" : "#1a1205",
          border:`1px solid ${a.sev === "CRITICAL" ? "#7f1d1d" : "#78350f"}`,
          display:"flex", alignItems:"center", gap:8,
          animation: a.sev === "CRITICAL" ? "puls 2s infinite" : "none",
        }}>
          <div style={{ width:6, height:6, borderRadius:"50%", flexShrink:0,
            background: a.sev === "CRITICAL" ? C.red : C.amber }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:10, color: a.sev === "CRITICAL" ? "#fca5a5" : "#fcd34d",
              fontWeight:700, fontFamily:"monospace" }}>[{a.code}] {a.turbine}</div>
            <div style={{ fontSize:9, color:C.textDim, marginTop:1 }}>{a.msg}</div>
          </div>
          <div style={{ fontSize:9, color: a.sev === "CRITICAL" ? C.red : C.amber,
            fontFamily:"monospace", flexShrink:0 }}>{a.value}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FLEET STATUS CARDS
// ═══════════════════════════════════════════════════════════════════
function FleetCard({ twin, selected, onClick }) {
  const sc = twin.status === "ALERT" ? C.red : twin.status === "WARNING" ? C.amber : C.green;
  return (
    <div onClick={onClick} style={{
      padding:"10px 12px", borderRadius:8, cursor:"pointer",
      background: selected ? C.panel : C.surface,
      border:`1px solid ${selected ? C.accent : twin.status === "ALERT" ? "#7f1d1d" : C.border}`,
      transition:"all 0.2s", marginBottom:4,
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:C.text, fontFamily:"monospace" }}>{twin.id}</div>
          <div style={{ fontSize:9, color:C.textDim, marginTop:1 }}>{twin.site} · {twin.model}</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
          <div style={{ fontSize:8, color:sc, fontFamily:"monospace", fontWeight:700,
            padding:"2px 5px", borderRadius:3, background:`${sc}15`,
            animation: twin.status==="ALERT" ? "puls 1.5s infinite" : "none" }}>
            {twin.status}
          </div>
          {twin.alerts.length > 0 && (
            <div style={{ fontSize:8, color:C.red }}>⚠ {twin.alerts.length} alert{twin.alerts.length>1?"s":""}</div>
          )}
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginTop:8 }}>
        {[
          { l:"HI", v:`${twin.health_index.toFixed(0)}%`, c: twin.health_index<70?C.red:twin.health_index<85?C.amber:C.green },
          { l:"EGT", v:`${twin.exhaust_temp.toFixed(0)}°`, c: twin.exhaust_temp>580?C.red:twin.exhaust_temp>560?C.amber:C.text },
          { l:"RUL", v:`${Math.round(twin.rul/1000).toFixed(1)}kh`, c: twin.rul<500?C.red:twin.rul<2000?C.amber:C.text },
        ].map(({l,v,c}) => (
          <div key={l}>
            <div style={{ fontSize:8, color:C.textMute }}>{l}</div>
            <div style={{ fontSize:11, color:c, fontFamily:"monospace", fontWeight:700 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:6 }}>
        <MiniChart data={twin.hist_health} color={sc} height={22} fill={false} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [twins, setTwins] = useState(() =>
    Object.fromEntries(TURBINE_FLEET.map(t => [t.id, initTwin(t)]))
  );
  const [selected, setSelected] = useState("GT-001");
  const [tab, setTab] = useState("overview"); // overview | performance | prognostics | alerts
  const [tick, setTick] = useState(0);
  const [faultMenu, setFaultMenu] = useState(false);
  const [paused, setPaused] = useState(false);

  // Live data tick
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setTwins(prev => {
        const next = {};
        Object.entries(prev).forEach(([k, v]) => { next[k] = stepTwin(v, tick); });
        return next;
      });
      setTick(t => t + 1);
    }, 1200);
    return () => clearInterval(id);
  }, [paused, tick]);

  const sel = twins[selected];
  const allAlerts = Object.values(twins).flatMap(t => t.alerts);
  const critCount = allAlerts.filter(a => a.sev === "CRITICAL").length;

  const injectFault = (mode) => {
    setTwins(prev => ({
      ...prev,
      [selected]: { ...prev[selected], fault_mode: mode, fault_severity: mode === FAULT_MODES.NORMAL ? 0 : 1.5 }
    }));
    setFaultMenu(false);
  };

  const TABS = [
    { id:"overview",     label:"Overview" },
    { id:"performance",  label:"Performance" },
    { id:"prognostics",  label:"Prognostics & RUL" },
    { id:"alerts",       label:`Alerts${allAlerts.length ? ` (${allAlerts.length})` : ""}` },
  ];

  const faultLabels = {
    [FAULT_MODES.NORMAL]:      "Normal Operation",
    [FAULT_MODES.COMPRESSOR]:  "Compressor Fouling",
    [FAULT_MODES.HOT_SECTION]: "Hot Section Degradation",
    [FAULT_MODES.BEARING]:     "Bearing Wear",
    [FAULT_MODES.SURGE]:       "Compressor Surge",
    [FAULT_MODES.COMBUSTOR]:   "Combustor Anomaly",
  };

  return (
    <div style={{
      width:"100vw", height:"100vh", background:C.bg,
      fontFamily:"'Courier New', Courier, monospace",
      color:C.text, display:"flex", flexDirection:"column", overflow:"hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        * { box-sizing:border-box; margin:0; padding:0 }
        @keyframes puls { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes scan {
          0%{background-position:0 0} 100%{background-position:0 100px}
        }
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${C.accentDim};border-radius:2px}
        button{cursor:pointer;border:none;font-family:inherit}
        select{font-family:inherit}
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div style={{
        padding:"0 20px", height:52, background:C.surface,
        borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", gap:16, flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <svg width="28" height="28" viewBox="0 0 28 28">
            <polygon points="14,2 26,20 2,20" fill="none" stroke={C.accent} strokeWidth="1.5"/>
            <circle cx="14" cy="14" r="4" fill={C.accent} opacity="0.8"/>
            <line x1="14" y1="6" x2="14" y2="22" stroke={C.accent} strokeWidth="0.8" opacity="0.4"/>
            <line x1="6" y1="14" x2="22" y2="14" stroke={C.accent} strokeWidth="0.8" opacity="0.4"/>
          </svg>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.accent, letterSpacing:3 }}>TURBINE·DT</div>
            <div style={{ fontSize:8, color:C.textDim, letterSpacing:4 }}>DIGITAL TWIN PLATFORM</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:2, marginLeft:24 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"6px 14px", borderRadius:4, fontSize:9, letterSpacing:1.5,
              textTransform:"uppercase", fontFamily:"inherit",
              background: tab===t.id ? `${C.accent}18` : "transparent",
              color: tab===t.id ? C.accent : C.textDim,
              border:`1px solid ${tab===t.id ? C.accentDim : "transparent"}`,
              transition:"all 0.2s",
              position:"relative",
            }}>
              {t.label}
              {t.id==="alerts" && critCount > 0 && (
                <span style={{
                  position:"absolute", top:-4, right:-4, width:8, height:8,
                  borderRadius:"50%", background:C.red, animation:"puls 1s infinite",
                }} />
              )}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
          {/* Fault injector */}
          <div style={{ position:"relative" }}>
            <button onClick={() => setFaultMenu(f => !f)} style={{
              padding:"5px 12px", borderRadius:4, fontSize:9, letterSpacing:1,
              background:`${C.amber}15`, color:C.amber, border:`1px solid ${C.amber}40`,
            }}>
              ⚡ FAULT INJECT
            </button>
            {faultMenu && (
              <div style={{
                position:"absolute", top:32, right:0, background:C.panel,
                border:`1px solid ${C.borderHi}`, borderRadius:6, padding:6,
                minWidth:200, zIndex:100,
              }}>
                {Object.entries(faultLabels).map(([mode, label]) => (
                  <button key={mode} onClick={() => injectFault(mode)} style={{
                    display:"block", width:"100%", textAlign:"left",
                    padding:"7px 10px", fontSize:10, borderRadius:4,
                    background: sel?.fault_mode === mode ? `${C.accent}20` : "transparent",
                    color: sel?.fault_mode === mode ? C.accent : C.text,
                    letterSpacing:0.5,
                  }}>{label}</button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setPaused(p => !p)} style={{
            padding:"5px 10px", borderRadius:4, fontSize:9,
            background: paused ? `${C.amber}15` : `${C.green}15`,
            color: paused ? C.amber : C.green,
            border:`1px solid ${paused ? C.amber : C.green}40`,
          }}>
            {paused ? "▶ RESUME" : "⏸ PAUSE"}
          </button>

          {/* Live dot */}
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%",
              background: paused ? C.amber : C.green,
              animation: paused ? "none" : "puls 1.5s infinite" }} />
            <span style={{ fontSize:8, color: paused ? C.amber : C.green, letterSpacing:3 }}>
              {paused ? "PAUSED" : "LIVE"}
            </span>
          </div>
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── LEFT: Fleet sidebar ──────────────────────────────────── */}
        <div style={{
          width:220, background:C.surface, borderRight:`1px solid ${C.border}`,
          display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0,
        }}>
          {/* Fleet header */}
          <div style={{ padding:"12px 12px 8px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:8, color:C.textMute, letterSpacing:3, marginBottom:6 }}>FLEET ({TURBINE_FLEET.length} UNITS)</div>
            <div style={{ display:"flex", gap:6 }}>
              {[
                { label:"RUN", count:Object.values(twins).filter(t=>t.status==="RUNNING").length, color:C.green },
                { label:"WARN", count:Object.values(twins).filter(t=>t.status==="WARNING").length, color:C.amber },
                { label:"CRIT", count:Object.values(twins).filter(t=>t.status==="ALERT").length, color:C.red },
              ].map(({ label, count, color }) => (
                <div key={label} style={{ flex:1, textAlign:"center", background:C.bg,
                  borderRadius:4, padding:"4px 0", border:`1px solid ${color}30` }}>
                  <div style={{ fontSize:14, fontWeight:900, color }}>{count}</div>
                  <div style={{ fontSize:7, color:C.textDim, letterSpacing:1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fleet cards */}
          <div style={{ flex:1, overflowY:"auto", padding:10 }}>
            {TURBINE_FLEET.map(t => (
              <FleetCard key={t.id} twin={twins[t.id]} selected={selected===t.id}
                onClick={() => { setSelected(t.id); setTab("overview"); }} />
            ))}
          </div>

          {/* Fault mode indicator */}
          {sel?.fault_mode !== FAULT_MODES.NORMAL && (
            <div style={{
              padding:"8px 12px", background:"#1a0505",
              borderTop:`1px solid #7f1d1d`,
            }}>
              <div style={{ fontSize:8, color:C.red, letterSpacing:2, animation:"puls 1.5s infinite" }}>
                ⚠ FAULT INJECTED
              </div>
              <div style={{ fontSize:9, color:"#fca5a5", marginTop:2 }}>
                {faultLabels[sel.fault_mode]}
              </div>
            </div>
          )}
        </div>

        {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
        <div style={{ flex:1, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:12 }}>

          {/* OVERVIEW TAB */}
          {tab === "overview" && sel && (
            <>
              {/* Turbine header */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:18, fontWeight:900, color:C.accent, letterSpacing:3 }}>{sel.id}</div>
                  <div style={{ fontSize:10, color:C.textDim }}>{sel.site} · {sel.model} · {sel.mw} MW</div>
                </div>
                <div style={{ fontSize:9, color:C.textDim }}>
                  Twin sync: <span style={{ color:C.green }}>✓ LIVE</span> · Tick #{tick}
                </div>
              </div>

              {/* Schematic */}
              <div style={{ background:C.panel, borderRadius:10, padding:16,
                border:`1px solid ${C.border}`, overflow:"hidden" }}>
                <div style={{ fontSize:8, color:C.textDim, letterSpacing:3, marginBottom:8 }}>
                  REAL-TIME TURBINE SCHEMATIC
                </div>
                <TurbineSchematic twin={sel} size={Math.min(700, window.innerWidth - 320)} />
              </div>

              {/* Core metrics gauges */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                {[
                  { label:"Load", val:sel.load, min:0, max:110, unit:"%", color:C.accent },
                  { label:"Speed", val:sel.speed, min:2800, max:3200, unit:"RPM", color:C.green },
                  { label:"EGT", val:sel.exhaust_temp, min:450, max:650, unit:"°C",
                    color: sel.exhaust_temp>580 ? C.red : sel.exhaust_temp>560 ? C.amber : C.accent },
                  { label:"TIT", val:sel.tit, min:1100, max:1350, unit:"°C",
                    color: sel.tit>1280 ? C.red : sel.tit>1250 ? C.amber : C.accent },
                ].map(g => (
                  <div key={g.label} style={{ background:C.panel, borderRadius:8, padding:12,
                    border:`1px solid ${C.border}`, display:"flex", flexDirection:"column",
                    alignItems:"center", gap:4 }}>
                    <div style={{ fontSize:8, color:C.textDim, letterSpacing:2 }}>{g.label.toUpperCase()}</div>
                    <RadialGauge {...g} size={80} />
                  </div>
                ))}
              </div>

              {/* Anomaly + Health row */}
              <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:10 }}>
                <div style={{ background:C.panel, borderRadius:8, padding:12,
                  border:`1px solid ${C.border}`, display:"flex", flexDirection:"column",
                  alignItems:"center", gap:4 }}>
                  <div style={{ fontSize:8, color:C.textDim, letterSpacing:2, marginBottom:4 }}>ANOMALY DETECTION</div>
                  <AnomalyRing score={sel.anomaly_score} size={120} />
                </div>
                <div style={{ background:C.panel, borderRadius:8, padding:14, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:8, color:C.textDim, letterSpacing:2, marginBottom:12 }}>SYSTEM HEALTH INDICES</div>
                  <HealthBar value={sel.health_index} label="Overall Health Index" />
                  <HealthBar value={sel.compressor_efficiency} label="Compressor Efficiency" warn={84} crit={80} />
                  <HealthBar value={sel.turbine_efficiency} label="Turbine Efficiency" warn={86} crit={82} />
                  <HealthBar value={clamp(100 - (sel.nox_emissions/90)*100, 0, 100)}
                    label="Emissions Health" warn={60} crit={40} />
                  <div style={{ marginTop:10 }}>
                    <div style={{ fontSize:8, color:C.textDim, marginBottom:4, letterSpacing:2 }}>
                      HEALTH TREND (last 40 readings)
                    </div>
                    <MiniChart data={sel.hist_health}
                      color={sel.health_index<70?C.red:sel.health_index<85?C.amber:C.green}
                      height={36} />
                  </div>
                </div>
              </div>

              {/* Vibration */}
              <div style={{ background:C.panel, borderRadius:8, padding:14, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:8, color:C.textDim, letterSpacing:2, marginBottom:10 }}>
                  BEARING VIBRATION — mm/s RMS
                </div>
                <VibrationPlot twin={sel} />
              </div>

              {/* Active alerts */}
              {sel.alerts.length > 0 && (
                <div style={{ background:"#0d0505", borderRadius:8, padding:14, border:"1px solid #7f1d1d" }}>
                  <div style={{ fontSize:8, color:C.red, letterSpacing:2, marginBottom:8 }}>
                    ⚠ ACTIVE ALERTS ({sel.alerts.length})
                  </div>
                  <AlertPanel allTwins={{ [sel.id]: sel }} />
                </div>
              )}
            </>
          )}

          {/* PERFORMANCE TAB */}
          {tab === "performance" && sel && (
            <>
              <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:3 }}>
                PERFORMANCE ANALYTICS — {sel.id}
              </div>

              {/* Parameter table */}
              <div style={{ background:C.panel, borderRadius:8, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                <div style={{ padding:"8px 14px", borderBottom:`1px solid ${C.border}`,
                  fontSize:8, color:C.textDim, letterSpacing:3 }}>
                  LIVE OPERATING PARAMETERS
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:C.bg }}>
                      {["Parameter","Value","Unit","Status","Trend"].map(h => (
                        <th key={h} style={{ padding:"8px 14px", textAlign:"left",
                          fontSize:8, color:C.textDim, letterSpacing:2,
                          borderBottom:`1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { param:"Load",                  val:sel.load,                          unit:"%",     lo:60, hi:100, decimals:1, hist:sel.hist_load },
                      { param:"Shaft Speed",            val:sel.speed,                         unit:"RPM",   lo:2950, hi:3050, decimals:0 },
                      { param:"Exhaust Gas Temp (EGT)", val:sel.exhaust_temp,                  unit:"°C",    lo:480, hi:580, decimals:0, hist:sel.hist_exhaust },
                      { param:"Turbine Inlet Temp",     val:sel.tit,                           unit:"°C",    lo:1150, hi:1280, decimals:0 },
                      { param:"Compressor Inlet Temp",  val:sel.compressor_inlet_temp,         unit:"°C",    lo:15, hi:40, decimals:1 },
                      { param:"Compressor Outlet Press",val:sel.compressor_outlet_pressure,    unit:"bar",   lo:13, hi:16, decimals:2 },
                      { param:"Compressor Efficiency",  val:sel.compressor_efficiency,         unit:"%",     lo:82, hi:92, decimals:1 },
                      { param:"Turbine Efficiency",     val:sel.turbine_efficiency,            unit:"%",     lo:84, hi:94, decimals:1 },
                      { param:"Fuel Flow Rate",         val:sel.fuel_flow,                     unit:"kg/s",  lo:1.5, hi:2.2, decimals:3 },
                      { param:"Heat Rate",              val:sel.heat_rate,                     unit:"kJ/kWh",lo:9200, hi:10500, decimals:0 },
                      { param:"NOx Emissions",          val:sel.nox_emissions,                 unit:"ppm",   lo:20, hi:60, decimals:1 },
                    ].map(({ param, val, unit, lo, hi, decimals, hist }) => {
                      const inRange = val >= lo && val <= hi;
                      const color = inRange ? C.green : val < lo * 0.9 || val > hi * 1.1 ? C.red : C.amber;
                      return (
                        <tr key={param} style={{ borderBottom:`1px solid ${C.border}` }}>
                          <td style={{ padding:"8px 14px", fontSize:10, color:C.textDim }}>{param}</td>
                          <td style={{ padding:"8px 14px", fontSize:12, color, fontFamily:"monospace", fontWeight:700 }}>
                            {val.toFixed(decimals)}
                          </td>
                          <td style={{ padding:"8px 14px", fontSize:9, color:C.textMute }}>{unit}</td>
                          <td style={{ padding:"8px 14px" }}>
                            <span style={{ fontSize:8, color, padding:"2px 5px",
                              borderRadius:3, background:`${color}18` }}>
                              {inRange ? "NORMAL" : val < lo ? "LOW" : "HIGH"}
                            </span>
                          </td>
                          <td style={{ padding:"4px 14px", width:100 }}>
                            {hist && <MiniChart data={hist} color={color} height={20} fill={false} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* EGT + Load trend charts */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  { label:"EXHAUST GAS TEMPERATURE TREND", data:sel.hist_exhaust, color:C.amber, unit:"°C" },
                  { label:"LOAD TREND", data:sel.hist_load, color:C.accent, unit:"%" },
                ].map(({ label, data, color, unit }) => (
                  <div key={label} style={{ background:C.panel, borderRadius:8, padding:14, border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:8, color:C.textDim, letterSpacing:2, marginBottom:6 }}>{label}</div>
                    <div style={{ fontSize:18, fontWeight:700, color, fontFamily:"monospace" }}>
                      {data[data.length-1]?.toFixed(1)} <span style={{ fontSize:10, color:C.textDim }}>{unit}</span>
                    </div>
                    <MiniChart data={data} color={color} height={56} />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* PROGNOSTICS TAB */}
          {tab === "prognostics" && sel && (
            <>
              <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:3 }}>
                PROGNOSTICS & HEALTH MANAGEMENT — {sel.id}
              </div>

              {/* RUL */}
              <div style={{ background:C.panel, borderRadius:8, padding:16, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:8, color:C.textDim, letterSpacing:3, marginBottom:12 }}>
                  REMAINING USEFUL LIFE (RUL) — ML PROGNOSTIC MODEL
                </div>
                <RULChart twin={sel} />
              </div>

              {/* Health trend */}
              <div style={{ background:C.panel, borderRadius:8, padding:14, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:8, color:C.textDim, letterSpacing:2, marginBottom:6 }}>HEALTH INDEX DEGRADATION CURVE</div>
                <MiniChart data={sel.hist_health}
                  color={sel.health_index<70?C.red:sel.health_index<85?C.amber:C.green}
                  height={80} />
              </div>

              {/* Fault probability matrix */}
              <div style={{ background:C.panel, borderRadius:8, padding:14, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:8, color:C.textDim, letterSpacing:2, marginBottom:12 }}>
                  FAULT PROBABILITY MATRIX — PHYSICS-INFORMED ML MODEL
                </div>
                {[
                  { fault:"Compressor Fouling",         prob: sel.fault_mode===FAULT_MODES.COMPRESSOR ? 0.82 : Math.min(0.3, sel.anomaly_score * 1.5) },
                  { fault:"Hot Section Degradation",    prob: sel.fault_mode===FAULT_MODES.HOT_SECTION ? 0.89 : Math.min(0.2, (sel.tit-1200)/200) },
                  { fault:"Bearing Wear",               prob: sel.fault_mode===FAULT_MODES.BEARING ? 0.91 : Math.min(0.25, Math.max(0, (sel.vib_b2x-3)/8)) },
                  { fault:"Compressor Surge",           prob: sel.fault_mode===FAULT_MODES.SURGE ? 0.76 : Math.min(0.15, sel.anomaly_score) },
                  { fault:"Combustor Anomaly",          prob: sel.fault_mode===FAULT_MODES.COMBUSTOR ? 0.84 : Math.min(0.2, sel.nox_emissions/500) },
                  { fault:"Lube Oil Contamination",     prob: Math.min(0.18, rand(0.01, 0.1)) },
                  { fault:"Turbine Blade Erosion",      prob: Math.min(0.22, (sel.trend_degradation/10) + 0.05) },
                ].map(({ fault, prob }) => {
                  const color = prob > 0.6 ? C.red : prob > 0.3 ? C.amber : C.green;
                  return (
                    <div key={fault} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <div style={{ width:160, fontSize:10, color:C.textDim, flexShrink:0 }}>{fault}</div>
                      <div style={{ flex:1, height:8, background:C.border, borderRadius:4, overflow:"hidden" }}>
                        <div style={{ width:`${prob*100}%`, height:"100%", background:color,
                          borderRadius:4, transition:"width 0.8s ease" }} />
                      </div>
                      <div style={{ width:48, fontSize:10, color, fontFamily:"monospace",
                        fontWeight:700, textAlign:"right" }}>{(prob*100).toFixed(0)}%</div>
                      <div style={{ width:52, fontSize:8, color, padding:"2px 4px",
                        borderRadius:3, background:`${color}18`, textAlign:"center" }}>
                        {prob>0.6?"HIGH":prob>0.3?"MED":"LOW"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Maintenance recommendation */}
              <div style={{ background: sel.rul < 2000 ? "#0d0505" : C.panel,
                borderRadius:8, padding:14, border:`1px solid ${sel.rul<2000?"#7f1d1d":C.border}` }}>
                <div style={{ fontSize:8, color:sel.rul<2000?C.red:C.textDim, letterSpacing:2, marginBottom:10 }}>
                  MAINTENANCE RECOMMENDATION ENGINE
                </div>
                {[
                  { action:"Borescope inspection — compressor section",
                    priority: sel.compressor_efficiency < 84 ? "IMMEDIATE" : "SCHEDULED",
                    due: `${Math.round(sel.rul * 0.15).toLocaleString()} hrs` },
                  { action:"Vibration analysis — bearing 2 detailed study",
                    priority: sel.vib_b2x > 5 ? "IMMEDIATE" : "ROUTINE",
                    due: `${Math.round(sel.rul * 0.08).toLocaleString()} hrs` },
                  { action:"Hot gas path inspection & turbine blade assessment",
                    priority: sel.exhaust_temp > 570 ? "URGENT" : "NEXT OUTAGE",
                    due: `${Math.round(sel.rul * 0.5).toLocaleString()} hrs` },
                  { action:"Combustion tuning & NOx optimisation",
                    priority: sel.nox_emissions > 60 ? "URGENT" : "NEXT OUTAGE",
                    due: `${Math.round(sel.rul * 0.2).toLocaleString()} hrs` },
                  { action:"Major overhaul — full strip & rebuild",
                    priority: sel.rul < 500 ? "CRITICAL" : "PLANNED",
                    due: `${Math.round(sel.rul).toLocaleString()} hrs (RUL limit)` },
                ].map(({ action, priority, due }) => {
                  const pc = priority==="IMMEDIATE"||priority==="CRITICAL" ? C.red : priority==="URGENT" ? C.amber : C.green;
                  return (
                    <div key={action} style={{ display:"flex", alignItems:"center", gap:10,
                      padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                      <div style={{ flex:1, fontSize:10, color:C.text }}>{action}</div>
                      <div style={{ fontSize:8, color:pc, padding:"2px 6px", borderRadius:3,
                        background:`${pc}18`, flexShrink:0 }}>{priority}</div>
                      <div style={{ fontSize:9, color:C.textDim, fontFamily:"monospace",
                        flexShrink:0, minWidth:80, textAlign:"right" }}>{due}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ALERTS TAB */}
          {tab === "alerts" && (
            <>
              <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:3 }}>
                FLEET ALERT MANAGEMENT
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                {[
                  { label:"Total Alerts", val:allAlerts.length, color:C.amber },
                  { label:"Critical", val:critCount, color:C.red },
                  { label:"Warnings", val:allAlerts.length-critCount, color:C.amber },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background:C.panel, borderRadius:8, padding:14,
                    border:`1px solid ${C.border}`, textAlign:"center" }}>
                    <div style={{ fontSize:28, fontWeight:900, color, fontFamily:"monospace" }}>{val}</div>
                    <div style={{ fontSize:8, color:C.textDim, letterSpacing:2 }}>{label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:C.panel, borderRadius:8, padding:14, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:8, color:C.textDim, letterSpacing:2, marginBottom:10 }}>ALL FLEET ALERTS</div>
                <AlertPanel allTwins={twins} />
              </div>

              {/* ISO alarm limits reference */}
              <div style={{ background:C.panel, borderRadius:8, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                <div style={{ padding:"8px 14px", borderBottom:`1px solid ${C.border}`,
                  fontSize:8, color:C.textDim, letterSpacing:3 }}>
                  ISO 10816 / API 670 ALARM LIMITS REFERENCE
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:C.bg }}>
                      {["Parameter","Normal","Warning","Critical","Unit"].map(h => (
                        <th key={h} style={{ padding:"6px 14px", textAlign:"left",
                          fontSize:8, color:C.textDim, letterSpacing:1,
                          borderBottom:`1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Exhaust Gas Temp",   "< 560", "560–580", "> 580", "°C"],
                      ["Turbine Inlet Temp", "< 1250","1250–1280","> 1280","°C"],
                      ["Shaft Vibration",    "< 4.0", "4.0–7.1", "> 7.1", "mm/s"],
                      ["NOx Emissions",      "< 60",  "60–75",   "> 75",  "ppm"],
                      ["Anomaly Score",      "< 0.35","0.35–0.65","> 0.65","—"],
                      ["Comp. Efficiency",   "> 85",  "82–85",   "< 82",  "%"],
                    ].map(row => (
                      <tr key={row[0]} style={{ borderBottom:`1px solid ${C.border}` }}>
                        <td style={{ padding:"7px 14px", fontSize:10, color:C.text }}>{row[0]}</td>
                        <td style={{ padding:"7px 14px", fontSize:10, color:C.green, fontFamily:"monospace" }}>{row[1]}</td>
                        <td style={{ padding:"7px 14px", fontSize:10, color:C.amber, fontFamily:"monospace" }}>{row[2]}</td>
                        <td style={{ padding:"7px 14px", fontSize:10, color:C.red, fontFamily:"monospace" }}>{row[3]}</td>
                        <td style={{ padding:"7px 14px", fontSize:9, color:C.textDim }}>{row[4]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Quick-stats rail ───────────────────────────────── */}
        <div style={{
          width:186, background:C.surface, borderLeft:`1px solid ${C.border}`,
          overflowY:"auto", padding:10, flexShrink:0,
          display:"flex", flexDirection:"column", gap:8,
        }}>
          <div style={{ fontSize:8, color:C.textMute, letterSpacing:3 }}>QUICK STATS</div>

          {sel && [
            { label:"POWER OUTPUT",   val:`${(sel.load * sel.mw / 100).toFixed(1)}`, unit:"MW" },
            { label:"HEAT RATE",      val:`${sel.heat_rate.toFixed(0)}`, unit:"kJ/kWh" },
            { label:"FUEL FLOW",      val:`${sel.fuel_flow.toFixed(3)}`, unit:"kg/s" },
            { label:"NOx",            val:`${sel.nox_emissions.toFixed(1)}`, unit:"ppm" },
            { label:"ANOMALY SCORE",  val:`${(sel.anomaly_score*100).toFixed(2)}`, unit:"%" },
            { label:"HEALTH INDEX",   val:`${sel.health_index.toFixed(1)}`, unit:"%" },
            { label:"RUL",            val:`${Math.round(sel.rul).toLocaleString()}`, unit:"hrs" },
          ].map(({ label, val, unit }) => (
            <div key={label} style={{ background:C.panel, borderRadius:6, padding:"8px 10px",
              border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:8, color:C.textMute, letterSpacing:1.5, marginBottom:3 }}>{label}</div>
              <div style={{ fontSize:15, fontWeight:700, color:C.accent, fontFamily:"monospace", lineHeight:1 }}>
                {val} <span style={{ fontSize:9, color:C.textDim, fontWeight:400 }}>{unit}</span>
              </div>
            </div>
          ))}

          <div style={{ marginTop:4, fontSize:8, color:C.textMute, letterSpacing:2 }}>VIBRATION (max)</div>
          {sel && [
            { label:"Bearing 1", val:Math.max(sel.vib_b1x, sel.vib_b1y) },
            { label:"Bearing 2", val:Math.max(sel.vib_b2x, sel.vib_b2y) },
            { label:"Bearing 3", val:Math.max(sel.vib_b3x, sel.vib_b3y) },
          ].map(({ label, val }) => {
            const color = val > 7 ? C.red : val > 4 ? C.amber : C.green;
            return (
              <div key={label} style={{ background:C.panel, borderRadius:6, padding:"7px 10px",
                border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:8, color:C.textMute, marginBottom:2 }}>{label}</div>
                <div style={{ fontSize:13, fontWeight:700, color, fontFamily:"monospace" }}>
                  {val.toFixed(2)} <span style={{ fontSize:8, color:C.textDim }}>mm/s</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

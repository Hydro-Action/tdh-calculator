/*
 * TDH & Flow Calculator - hydraulics engine
 * US customary units throughout: flow gpm, head ft, diameter in, length ft.
 * Pure functions only (no DOM) so the engine can be tested on its own.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- version
  // Change both on every release and add an entry to CHANGELOG.md. The version is printed on every report so a
  // sealed report can be traced to the calculator release that produced it.
  const VERSION = '2.0.0';
  const RELEASE_DATE = '2026-11-20';

  // ---------------------------------------------------------------- constants
  const G = 32.174;             // ft/s^2
  const FT_PER_PSI = 2.307;      // ft of water per psi (60 F)
  const GAL_PER_FT3 = 7.48052;
  const GPM_PER_CFS = 448.831;
  const NU = 1.217e-5;           // kinematic viscosity of water, ft^2/s (60 F)
  const HW_K = 4.52 * FT_PER_PSI; // Hazen-Williams constant, ft/ft form (=10.43)
  const ORIF_K = GPM_PER_CFS * (Math.PI / 576) * Math.sqrt(2 * G); // = 19.64
  const VEL_K = 576 / (GPM_PER_CFS * Math.PI); // v(fps) = VEL_K * Q / d^2 (=0.4085)

  const NOMINALS = [
    ['0.5', '1/2"'], ['0.75', '3/4"'], ['1', '1"'], ['1.25', '1-1/4"'], ['1.5', '1-1/2"'],
    ['2', '2"'], ['2.5', '2-1/2"'], ['3', '3"'], ['4', '4"'], ['6', '6"']
  ];

  // Inside diameters (in) from ASTM D1785 / D2241 average wall dimensions.
  const PIPE_ID = {
    'PVC Sch 40': { '0.5': 0.622, '0.75': 0.824, '1': 1.049, '1.25': 1.380, '1.5': 1.610, '2': 2.067, '2.5': 2.469, '3': 3.068, '4': 4.026, '6': 6.065 },
    'PVC Sch 80': { '0.5': 0.546, '0.75': 0.742, '1': 0.957, '1.25': 1.278, '1.5': 1.500, '2': 1.939, '2.5': 2.323, '3': 2.900, '4': 3.826, '6': 5.761 },
    'PVC SDR 21 (Class 200)': { '0.75': 0.930, '1': 1.189, '1.25': 1.502, '1.5': 1.720, '2': 2.149, '2.5': 2.601, '3': 3.166, '4': 4.072, '6': 5.993 },
    'PVC SDR 26 (Class 160)': { '1': 1.195, '1.25': 1.532, '1.5': 1.754, '2': 2.193, '2.5': 2.655, '3': 3.230, '4': 4.154, '6': 6.115 }
  };
  const PIPE_CLASSES = Object.keys(PIPE_ID).concat(['Custom ID']);

  const FITTINGS = [
    { k: 'e90', label: '90° elbow', K: 0.9 },
    { k: 'e45', label: '45° elbow', K: 0.4 },
    { k: 'teeRun', label: 'Tee (flow through run)', K: 0.6 },
    { k: 'teeBr', label: 'Tee (flow through branch)', K: 1.8 },
    { k: 'valve', label: 'Ball / gate valve (open)', K: 0.2 },
    { k: 'check', label: 'Check valve (swing)', K: 2.5 },
    { k: 'union', label: 'Union / coupling / QD', K: 0.08 }
  ];

  const ORIFICES = [
    ['0.125', '1/8"'], ['0.15625', '5/32"'], ['0.1875', '3/16"'], ['0.21875', '7/32"'],
    ['0.25', '1/4"'], ['0.28125', '9/32"'], ['0.3125', '5/16"']
  ];

  const SYSTEM_TYPES = {
    lpd: 'Low Pressure Distribution (LPD / pressure-dosed)',
    drip: 'Subsurface Drip Dispersal',
    spray: 'Spray Dispersal (surface application)',
    gravity: 'Non-Pressurized (pump to gravity / distribution box)',
    discharge: 'Discharge: Outfall or Pressure Sewer Main Tie-In',
    other: 'Other Pressurized Device (known flow & pressure)'
  };
  const PROJECT_TYPES = { sfr: 'Single Family Residence', mfr: 'Multiple Family Residence', commercial: 'Commercial' };

  /** The point static head is measured to (from the pump-off level), by system type. */
  function staticRef(s) {
    switch (s.systemType) {
      case 'lpd': return 'manifold inlet';
      case 'drip': return 'supply manifold inlet';
      case 'spray': return 'distribution line inlet';
      case 'gravity': return 'distribution box inlet';
      case 'discharge': return s.discharge && s.discharge.mode === 'main' ? 'sewer main connection' : 'outlet invert';
      default: return 'device inlet';
    }
  }

  // ---------------------------------------------------------------- helpers
  const num = (v, def = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };
  function nomLabel(n) { const f = NOMINALS.find(x => x[0] === String(n)); return f ? f[1] : n + '"'; }
  function orificeLabel(d) { const f = ORIFICES.find(x => Math.abs(parseFloat(x[0]) - d) < 1e-6); return f ? f[1] : d + '"'; }

  function pipeId(pipe, what) {
    if (!pipe) throw new Error(`${what}: pipe not specified`);
    if (pipe.cls === 'Custom ID') {
      const d = num(pipe.id);
      if (!(d > 0)) throw new Error(`${what}: enter an inside diameter for the custom pipe`);
      return d;
    }
    const t = PIPE_ID[pipe.cls];
    if (!t) throw new Error(`${what}: unknown pipe class "${pipe.cls}"`);
    const d = t[String(pipe.nom)];
    if (!d) throw new Error(`${what}: ${nomLabel(pipe.nom)} is not available in ${pipe.cls}`);
    return d;
  }
  function pipeLabel(pipe) {
    if (!pipe) return '';
    return pipe.cls === 'Custom ID' ? `Custom, ID ${num(pipe.id).toFixed(3)}"` : `${nomLabel(pipe.nom)} ${pipe.cls}`;
  }

  const velocity = (Q, d) => VEL_K * Q / (d * d);
  const velHead = v => v * v / (2 * G);
  const galPerFt = d => Math.PI / 4 * Math.pow(d / 12, 2) * GAL_PER_FT3;
  const toFt = (val, unit) => unit === 'psi' ? num(val) * FT_PER_PSI : num(val);

  function dwFactor(Re, relRough) {
    if (!(Re > 0)) return 0;
    if (Re < 2300) return 64 / Re;
    const a = Math.log10(relRough / 3.7 + 5.74 / Math.pow(Re, 0.9));
    return 0.25 / (a * a);
  }

  /** Friction loss (ft) for Q gpm through L ft of pipe with ID d inches. */
  function frictionLoss(Q, L, d, fr) {
    if (!(Q > 0) || !(L > 0)) return 0;
    if (fr.method === 'DW') {
      const v = velocity(Q, d), D = d / 12;
      const f = dwFactor(v * D / NU, (fr.eps || 5e-6) / D);
      return f * (L / D) * velHead(v);
    }
    return HW_K * L * Math.pow(Q, 1.852) / (Math.pow(fr.C, 1.852) * Math.pow(d, 4.8704));
  }

  const orificeQ = (d, h, cd) => h > 0 ? ORIF_K * cd * d * d * Math.sqrt(h) : 0;

  function makeEmitter(spec) {
    if (spec.type === 'orifice') return h => orificeQ(spec.d, h, spec.cd);
    if (spec.type === 'power') {
      const k = spec.qRef / Math.pow(spec.pRef, spec.x);
      return h => h > 0 ? k * Math.pow(h / FT_PER_PSI, spec.x) : 0;
    }
    return h => h > 0 ? spec.q : 0; // pressure compensating: constant flow
  }

  // ---------------------------------------------------------------- lateral
  /**
   * Step-by-step lateral analysis from the distal emitter back to the inlet.
   * p = {n, spacing, firstLen, d, fr, emitter(h)->gpm, endFlow, dz}
   * dz = elevation of distal end minus inlet (ft).
   */
  function lateralRun(p, hEnd, detail) {
    const totalLen = p.firstLen + (p.n - 1) * p.spacing;
    const slope = totalLen > 0 ? p.dz / totalLen : 0;
    let H = hEnd, Q = p.endFlow || 0, hfTot = 0;
    let q = p.emitter(H);
    Q += q;
    const qDistal = q;
    let qMin = q, qMax = q;
    const rows = detail ? [{ i: p.n, x: totalLen, h: H, q, Q }] : null;
    for (let i = p.n - 1; i >= 1; i--) {
      const hf = frictionLoss(Q, p.spacing, p.d, p.fr);
      hfTot += hf;
      H += hf + slope * p.spacing;
      q = p.emitter(H);
      Q += q;
      if (q < qMin) qMin = q;
      if (q > qMax) qMax = q;
      if (detail) rows.push({ i, x: p.firstLen + (i - 1) * p.spacing, h: H, q, Q });
    }
    const hf0 = frictionLoss(Q, p.firstLen, p.d, p.fr);
    hfTot += hf0;
    H += hf0 + slope * p.firstLen;
    return { hIn: H, hEnd, Q, qMin, qMax, qDistal, qFirst: q, hfTot, rows: detail ? rows.reverse() : null };
  }

  /** Solve the lateral for a given inlet pressure head (bisection on distal head). */
  function lateralFromInlet(p, hIn) {
    let lo = Math.min(0, hIn) - Math.abs(p.dz) - 1;
    let hi = Math.max(0, hIn) + Math.abs(p.dz) + 1;
    for (let k = 0; k < 60 && lateralRun(p, lo).hIn > hIn; k++) lo -= Math.max(10, Math.abs(lo));
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (lateralRun(p, mid).hIn > hIn) hi = mid; else lo = mid;
    }
    return lateralRun(p, (lo + hi) / 2);
  }

  // ---------------------------------------------------------------- network
  /**
   * Manifold + laterals. Finds the manifold inlet head such that the most
   * critical (lowest pressure) lateral end receives hTarget.
   * spec = {nConn, runsPerConn, connSpacing, firstConnLen, dMan, frMan, connDz, manFeed, run}
   */
  function networkSolve(spec, hTarget) {
    const center = spec.manFeed === 'center' && spec.nConn > 1;
    const nCalc = center ? Math.ceil(spec.nConn / 2) : spec.nConn;
    const mult = center ? 2 : 1;
    const firstLen = center ? (spec.nConn % 2 === 0 ? spec.connSpacing / 2 : 0) : 0;
    let hFar = hTarget, sol = null;
    for (let it = 0; it < 50; it++) {
      sol = networkPass(spec, nCalc, hFar, firstLen);
      const minEnd = Math.min(...sol.conns.map(c => c.hEnd));
      const diff = hTarget - minEnd;
      if (Math.abs(diff) < 1e-5) break;
      hFar += diff;
    }
    let qMin = Infinity, qMax = 0, crit = sol.conns[0];
    sol.conns.forEach(c => {
      qMin = Math.min(qMin, c.qMin); qMax = Math.max(qMax, c.qMax);
      if (c.hEnd < crit.hEnd - 1e-9) crit = c;
    });
    return {
      hInlet: sol.hInlet, Q: sol.Q * mult, Qhalf: sol.Q, mult, nCalc, oddCenter: center && spec.nConn % 2 === 1,
      conns: sol.conns, manLoss: sol.manLoss, qMin, qMax,
      variation: qMax > 0 ? (qMax - qMin) / qMax * 100 : 0,
      critical: crit,
      criticalRows: lateralRun(spec.run, crit.hEnd, true)
    };
  }

  function networkPass(spec, nCalc, hFar, firstLen) {
    const runs = spec.runsPerConn;
    const conns = [];
    let r = lateralRun(spec.run, hFar);
    let Hm = r.hIn, Qm = runs * r.Q, manLoss = 0;
    const push = (k, r) => conns.push({ k, z: (k - 1) * spec.connDz, hIn: r.hIn, hEnd: r.hEnd, qRun: r.Q, qConn: runs * r.Q, qMin: r.qMin, qMax: r.qMax, qFirst: r.qFirst, qDistal: r.qDistal, latLoss: r.hfTot });
    push(nCalc, r);
    for (let k = nCalc - 1; k >= 1; k--) {
      const hf = frictionLoss(Qm, spec.connSpacing, spec.dMan, spec.frMan);
      manLoss += hf;
      Hm += hf + spec.connDz;
      r = lateralFromInlet(spec.run, Hm);
      Qm += runs * r.Q;
      push(k, r);
    }
    if (firstLen > 0) { const hf = frictionLoss(Qm, firstLen, spec.dMan, spec.frMan); manLoss += hf; Hm += hf; }
    conns.reverse();
    return { hInlet: Hm, Q: Qm, conns, manLoss };
  }

  function lateralGeometry(L, s, nOverride, what) {
    if (!(L > 0)) throw new Error(`${what}: length must be greater than zero`);
    if (!(s > 0)) throw new Error(`${what}: spacing must be greater than zero`);
    const n = nOverride > 0 ? Math.round(nOverride) : Math.max(1, Math.floor(L / s + 1e-9));
    const firstLen = L - (n - 1) * s;
    if (firstLen < -1e-9) throw new Error(`${what}: ${n} outlets at ${s} ft spacing do not fit in ${L} ft`);
    return { n, firstLen: Math.max(0, firstLen) };
  }

  // ---------------------------------------------------------------- transport
  const SEGMENTS = [
    { key: 'discharge', label: 'Pump discharge assembly' },
    { key: 'before', label: 'Force main (pump to valve)' },
    { key: 'after', label: 'Zone force main (valve to manifold)' }
  ];

  function segmentCalc(seg, Q, fr, K, sf, what) {
    const d = pipeId(seg.pipe, what);
    const L = num(seg.L);
    const v = velocity(Q, d);
    const hf = frictionLoss(Q, L, d, fr);
    let sumK = num(seg.kOther);
    const fits = [];
    FITTINGS.forEach(f => {
      const n = num(seg.fit && seg.fit[f.k]);
      if (n > 0) { sumK += n * num(K[f.k], f.K); fits.push({ label: f.label, n, K: num(K[f.k], f.K) }); }
    });
    if (num(seg.kOther) > 0) fits.push({ label: 'Other (ΣK entered)', n: 1, K: num(seg.kOther) });
    const hm = sumK * velHead(v);
    const raw = hf + hm;
    return { what, pipe: seg.pipe, d, L, Q, v, hf, sumK, hm, fits, raw, total: raw * (1 + sf / 100), vol: L * galPerFt(d) };
  }

  // ---------------------------------------------------------------- system models
  function frFor(settings, C) { return { method: settings.method, C: C || num(settings.cPVC, 150), eps: num(settings.eps, 5e-6) }; }

  function lpdModel(s) {
    const L = s.lpd, set = s.settings;
    const fr = frFor(set);
    const nLat = Math.round(num(L.nLat));
    if (!(nLat >= 1)) throw new Error('LPD: number of laterals must be at least 1');
    const dLat = pipeId(L.latPipe, 'Lateral pipe');
    const geo = lateralGeometry(num(L.latLen), num(L.spacing), num(L.nOverride), 'Lateral');
    const orifD = num(L.orifice);
    const cd = num(L.cd, 0.6);
    const run = { n: geo.n, spacing: num(L.spacing), firstLen: geo.firstLen, d: dLat, fr, emitter: makeEmitter({ type: 'orifice', d: orifD, cd }), endFlow: 0, dz: num(L.latDz) };
    const both = L.sides === 'both';
    const nConn = both ? Math.ceil(nLat / 2) : nLat;
    const manLen = num(L.manLen);
    const dMan = nConn > 1 ? pipeId(L.manPipe, 'Manifold pipe') : dLat;
    const spec = { nConn, runsPerConn: both ? 2 : 1, connSpacing: nConn > 1 ? manLen / (nConn - 1) : 0, dMan, frMan: fr, connDz: num(L.connDz), manFeed: L.manFeed, run };
    const hEnd = num(L.hEnd);
    if (!(hEnd > 0)) throw new Error('LPD: residual head at the last orifice must be greater than zero');
    return {
      kind: 'network', spec, hEnd, variable: true,
      details: { geo, dLat, dMan, nLat, nConn, both, orifD, cd, manLen, oddPair: both && nLat % 2 === 1 },
      volumes: {
        laterals: volItem('Laterals', pipeLabel(L.latPipe), dLat, nLat, num(L.latLen)),
        manifold: nConn > 1 ? volItem('Manifold', pipeLabel(L.manPipe), dMan, 1, manLen) : null
      }
    };
  }

  /** Pipe volume line item: count runs of lenEach ft of pipe with inside diameter d. */
  function volItem(label, pipe, d, count, lenEach) {
    const L = count * lenEach, gpf = galPerFt(d);
    return { label, pipe, d, count, lenEach, L, gpf, vol: L * gpf };
  }

  function sprayModel(s) {
    const S = s.spray, set = s.settings;
    const fr = frFor(set);
    const n = Math.round(num(S.nHeads));
    if (!(n >= 1)) throw new Error('Spray: number of heads must be at least 1');
    const dLine = pipeId(S.linePipe, 'Spray distribution line');
    const ratedQ = num(S.ratedQ), ratedP = num(S.ratedP), x = num(S.x, 0.5);
    if (!(ratedQ > 0 && ratedP > 0)) throw new Error('Spray: enter the head rated flow and rated pressure');
    const run = { n, spacing: num(S.spacing), firstLen: num(S.firstLen), d: dLine, fr, emitter: makeEmitter({ type: 'power', qRef: ratedQ, pRef: ratedP, x }), endFlow: 0, dz: num(S.latDz) };
    if (n > 1 && !(run.spacing > 0)) throw new Error('Spray: head spacing must be greater than zero');
    const nConn = Math.max(1, Math.round(num(S.nBranches, 1)));
    const dMan = nConn > 1 ? pipeId(S.manPipe, 'Spray header pipe') : dLine;
    const spec = { nConn, runsPerConn: 1, connSpacing: num(S.branchSpacing), dMan, frMan: fr, connDz: 0, manFeed: 'end', run };
    const hEnd = num(S.reqP) * FT_PER_PSI;
    if (!(hEnd > 0)) throw new Error('Spray: minimum pressure at the last head must be greater than zero');
    const lineLen = run.firstLen + (n - 1) * run.spacing;
    return {
      kind: 'network', spec, hEnd, variable: true,
      details: { dLine, dMan, n, nConn, ratedQ, ratedP, x, lineLen },
      volumes: {
        laterals: volItem('Distribution lines', pipeLabel(S.linePipe), dLine, nConn, lineLen),
        manifold: nConn > 1 ? volItem('Header', pipeLabel(S.manPipe), dMan, 1, (nConn - 1) * spec.connSpacing) : null
      }
    };
  }

  function dripModel(s) {
    const D = s.drip, set = s.settings;
    const frPVC = frFor(set);
    const frDrip = frFor(set, num(D.latC, 140));
    const nLat = Math.round(num(D.nLat));
    if (!(nLat >= 1)) throw new Error('Drip: number of laterals must be at least 1');
    const dLat = num(D.latId);
    if (!(dLat > 0)) throw new Error('Drip: enter the dripline inside diameter');
    const spacingFt = num(D.emSpacing) / 12;
    const geo = lateralGeometry(num(D.latLen), spacingFt, 0, 'Dripline lateral');
    const pc = D.emType !== 'npc';
    const qEm = num(D.emQ) / 60; // gph -> gpm
    if (!(qEm > 0)) throw new Error('Drip: enter the emitter flow rate');
    const emitter = pc ? makeEmitter({ type: 'constant', q: qEm }) : makeEmitter({ type: 'power', qRef: qEm, pRef: num(D.emPref, 15), x: num(D.emX, 0.5) });
    const run = { n: geo.n, spacing: spacingFt, firstLen: geo.firstLen, d: dLat, fr: frDrip, emitter, endFlow: 0, dz: num(D.latDz) };
    const nConn = nLat;
    const manLen = num(D.manLen);
    const dMan = nConn > 1 ? pipeId(D.manPipe, 'Drip supply manifold') : dLat;
    const spec = { nConn, runsPerConn: 1, connSpacing: nConn > 1 ? manLen / (nConn - 1) : 0, dMan, frMan: frPVC, connDz: num(D.connDz), manFeed: D.manFeed, run };
    const hEnd = num(D.minP) * FT_PER_PSI;
    if (!(hEnd > 0)) throw new Error('Drip: minimum pressure at the distal emitter must be greater than zero');
    return {
      kind: 'network', spec, hEnd, variable: !pc, pc,
      details: { geo, dLat, dMan, nLat, qEm, spacingFt, frDrip, manLen },
      volumes: {
        laterals: volItem('Dripline laterals', `Dripline, ID ${dLat.toFixed(3)}"`, dLat, nLat, num(D.latLen)),
        manifold: nConn > 1 ? volItem('Supply manifold', pipeLabel(D.manPipe), dMan, 1, manLen) : null
      }
    };
  }

  /** Drip flushing: required head at the distal lateral ends and flush flow per lateral. */
  function dripFlush(s, model) {
    const D = s.drip;
    const frPVC = frFor(s.settings);
    const vF = num(D.flushV, 2);
    const qFlush = VEL_K > 0 ? vF * model.details.dLat * model.details.dLat / VEL_K : 0;
    const nLat = model.details.nLat;
    const Qret = qFlush * nLat;
    const dRetMan = nLat > 1 ? pipeId(D.retManPipe, 'Drip return manifold') : model.details.dLat;
    const sp = nLat > 1 ? num(D.retManLen) / (nLat - 1) : 0;
    let retManLoss = 0;
    for (let i = 1; i < nLat; i++) retManLoss += frictionLoss(i * qFlush, sp, dRetMan, frPVC);
    const dRet = pipeId(D.retPipe, 'Drip return line');
    const vRet = velocity(Qret, dRet);
    const retHf = frictionLoss(Qret, num(D.retLen), dRet, frPVC);
    const retHm = num(D.retK) * velHead(vRet);
    const retDz = num(D.retDz);
    const required = retManLoss + retHf + retHm + retDz;
    const hEnd = Math.max(model.hEnd, required);
    return { vF, qFlush, Qret, dRetMan, retManLoss, dRet, vRet, retHf, retHm, retDz, required, hEnd, governs: required > model.hEnd };
  }

  /**
   * Discharge to an open outfall (ditch / surface water) or a tie-in to a pressurized sewer main.
   * Outfall: head at the outlet = tailwater depth above the outlet + exit loss (K · v²/2g, K = 1.0 for free discharge).
   * Sewer main: head at the connection = the main's operating pressure (design to its maximum; check the minimum).
   */
  function dischargeModel(s) {
    const X = s.discharge || {};
    const Q = num(X.Q);
    if (!(Q > 0)) throw new Error('Discharge: enter the design discharge flow rate (gpm)');
    const T = s.transport;
    const outSeg = s.valve.use && num(T.after.L) > 0 ? T.after : num(T.before.L) > 0 ? T.before : T.discharge;
    const dOut = pipeId(outSeg.pipe, 'Outlet pipe');
    if (X.mode === 'main') {
      const pMax = num(X.pMax), pMin = num(X.pMin);
      if (!(pMax > 0)) throw new Error('Sewer main tie-in: enter the maximum operating pressure of the main at the connection (psi)');
      if (pMin > pMax) throw new Error('Sewer main tie-in: the minimum main pressure cannot exceed the maximum');
      const hMax = pMax * FT_PER_PSI, hMin = pMin > 0 ? pMin * FT_PER_PSI : null;
      return { kind: 'discharge', Q, hNetFn: () => hMax, hNetMinFn: hMin !== null ? () => hMin : null,
        details: { mode: 'main', pMax, hMax, pMin: pMin > 0 ? pMin : null, hMin, dOut, outPipe: outSeg.pipe } };
    }
    const tw = Math.max(0, num(X.tailwater)), K = num(X.exitK, 1);
    const exitAt = q => K * velHead(velocity(q, dOut));
    const vOut = velocity(Q, dOut);
    return { kind: 'discharge', Q, hNetFn: q => tw + exitAt(q),
      details: { mode: 'outfall', tw, K, dOut, vOut, hExit: exitAt(Q), outPipe: outSeg.pipe } };
  }

  // ---------------------------------------------------------------- scenario
  function buildScenario(s, label, Q, hNet, Qd, net, extra, model) {
    const set = s.settings;
    const fr = frFor(set);
    const sf = num(set.frictionSF);
    const K = set.K || {};
    const scale = Qd > 0 ? Math.pow(Q / Qd, 2) : 1;
    const segs = [];
    SEGMENTS.forEach(meta => {
      const seg = s.transport[meta.key];
      if (meta.key === 'after' && !s.valve.use) return;
      if (!seg || (num(seg.L) <= 0 && !hasFittings(seg))) return;
      const lbl = meta.key === 'before' && !s.valve.use ? 'Force main' : meta.label;
      segs.push(Object.assign({ key: meta.key, label: lbl }, segmentCalc(seg, Q, fr, K, sf, lbl)));
    });
    // Losses entered at a reference flow scale with (Q/Qref)^2; default reference is the design flow.
    const scaleAt = qRef => num(qRef) > 0 ? Math.pow(Q / num(qRef), 2) : scale;
    const valveScale = scaleAt(s.valve.q);
    const valveLoss = s.valve.use ? toFt(s.valve.loss, s.valve.unit) * valveScale : 0;
    const addons = (s.addons || []).filter(a => num(a.val) !== 0).map(a => { const sc = scaleAt(a.q); return { label: a.label || 'Supplemental device', val: num(a.val), unit: a.unit, qRef: num(a.q) > 0 ? num(a.q) : Qd, scale: sc, ft: toFt(a.val, a.unit) * sc }; });
    const addonTotal = addons.reduce((t, a) => t + a.ft, 0);
    const lift = num(s.lift);
    const segTotal = segs.reduce((t, x) => t + x.total, 0);
    const tee = inletTee(s, model, Q);
    const teeLoss = tee ? tee.loss : 0;
    const TDH = lift + segTotal + valveLoss + addonTotal + teeLoss + hNet;
    return Object.assign({ label, Q, hNet, net, segs, valveLoss, valveScale, valveQRef: num(s.valve.q) > 0 ? num(s.valve.q) : Qd, addons, addonTotal, lift, segTotal, tee, teeLoss, manInlet: tee, TDH, scale, sf }, extra || {});
  }
  /**
   * Tee at the manifold (or spray header) inlet, where the force main joins a manifold serving more than one lateral.
   * Loss = K(tee, flow through branch) × v²/2g at the manifold velocity of the flow entering it (each half when center-fed).
   */
  function inletTee(s, model, Q) {
    if (!model || !model.spec || !(model.spec.nConn > 1) || !(Q > 0)) return null;
    const center = model.spec.manFeed === 'center';
    const Qin = center ? Q / 2 : Q;
    const K = num((s.settings && s.settings.K || {}).teeBr, FITTINGS.find(f => f.k === 'teeBr').K);
    const v = velocity(Qin, model.spec.dMan), hv = velHead(v);
    return { Q: Qin, d: model.spec.dMan, v, hv, K, loss: K * hv, center };
  }
  function hasFittings(seg) { return num(seg.kOther) > 0 || FITTINGS.some(f => num(seg.fit && seg.fit[f.k]) > 0); }

  // ---------------------------------------------------------------- main compute
  function compute(s) {
    const R = { errors: [], checks: [], sys: s.systemType, scenarios: [] };
    try {
      let model = null, design;
      if (s.systemType === 'lpd') model = lpdModel(s);
      else if (s.systemType === 'spray') model = sprayModel(s);
      else if (s.systemType === 'drip') model = dripModel(s);

      if (model) {
        const net = networkSolve(model.spec, model.hEnd);
        design = buildScenario(s, s.systemType === 'drip' ? 'Dosing' : 'Design', net.Q, net.hInlet, net.Q, net, null, model);
        R.model = model;
      } else if (s.systemType === 'discharge') {
        R.model = dischargeModel(s);
        const Q = R.model.Q;
        design = buildScenario(s, R.model.details.mode === 'main' ? 'Design (max main pressure)' : 'Design', Q, R.model.hNetFn(Q), Q, null);
      } else {
        const o = s.systemType === 'gravity' ? s.gravity : s.other;
        const Q = num(o.Q);
        if (!(Q > 0)) throw new Error('Enter the design flow rate (gpm)');
        const hRes = toFt(o.resid, o.unit);
        design = buildScenario(s, 'Design', Q, hRes, Q, null);
        R.model = { kind: 'simple', hRes };
      }
      R.scenarios.push(design);

      if (s.systemType === 'drip' && s.drip.flush) {
        const fl = dripFlush(s, model);
        const fspec = Object.assign({}, model.spec, { run: Object.assign({}, model.spec.run, { endFlow: fl.qFlush }) });
        const fnet = networkSolve(fspec, fl.hEnd);
        R.flush = fl;
        R.scenarios.push(buildScenario(s, 'Flushing', fnet.Q, fnet.hInlet, design.Q, fnet, { flush: fl }, model));
      }


      R.design = design;
      R.governing = R.scenarios.reduce((a, b) => (b.TDH > a.TDH ? b : a));
      R.volumes = volumes(s, design, model);
      R.dose = doseCalc(s, design, R.volumes);
      R.curve = systemCurve(s, R.model, design);
      // Sewer main tie-in: second system curve at the main's minimum pressure (pump runs farther out on its curve)
      if (R.model.kind === 'discharge' && R.model.hNetMinFn) {
        R.curveMin = systemCurve(s, R.model, design, R.model.hNetMinFn);
        R.minShutoff = buildScenario(s, '', 0, R.model.hNetFn(0), design.Q, null).TDH; // head at zero flow = static + max main pressure
      } else if (R.model.kind === 'discharge' && R.model.details.mode === 'main') {
        R.minShutoff = buildScenario(s, '', 0, R.model.hNetFn(0), design.Q, null).TDH;
      }
      R.checks = checks(s, R, model);
    } catch (e) {
      R.errors.push(e.message || String(e));
    }
    return R;
  }

  function volumes(s, design, model) {
    const seg = k => { const g = design.segs.find(x => x.key === k); return g && g.L > 0 ? volItem(g.label, pipeLabel(g.pipe), g.d, 1, g.L) : null; };
    const mv = model && model.volumes ? model.volumes : {};
    const items = {
      discharge: seg('discharge'), before: seg('before'), after: s.valve.use ? seg('after') : null,
      manifold: mv.manifold || null, laterals: mv.laterals || null
    };
    const vol = it => it ? it.vol : 0;
    const v = { items, discharge: vol(items.discharge), before: vol(items.before), after: vol(items.after), manifold: vol(items.manifold), laterals: vol(items.laterals) };
    v.beforeValve = v.discharge + v.before;
    v.afterValve = v.after + v.manifold + v.laterals;
    v.total = v.beforeValve + v.afterValve;
    return v;
  }

  function doseCalc(s, design, vol) {
    const d = s.dose || {};
    const gpd = num(d.gpd);
    const zones = s.valve.use ? Math.max(1, Math.round(num(s.valve.zones, 1))) : Math.max(1, Math.round(num(d.zones, 1)));
    const mode = d.mode === 'demand' ? 'demand' : 'timed';
    const out = { mode, gpd, zones, valid: false };
    out.drainback = d.drainback ? vol.beforeValve : 0;
    out.minMult = num(d.minMult, 0);
    out.minDose = s.systemType === 'lpd' && out.minMult > 0 ? out.minMult * vol.laterals : null; // 0 = no minimum dose check
    // Minimum volume that must be pumped per dose (a volume requirement only; float heights depend on the tank)
    out.minGross = out.minDose !== null ? out.minDose + out.drainback : null;
    if (!(gpd > 0)) return out;

    if (mode === 'timed') {
      // Timer sets the number of doses; dose volume follows from the daily flow.
      const perDay = num(d.dosesPerDay);
      out.perDay = perDay;
      if (!(perDay > 0)) return out;
      out.totalDoses = perDay * zones;
      out.netDose = gpd / out.totalDoses;
      out.grossDose = out.netDose + out.drainback;
      // Optional: tank drawdown per dose, only when the tank's gallons per inch is provided
      out.galPerIn = num(d.galPerIn);
      out.tankDrawdown = out.galPerIn > 0 ? out.grossDose / out.galPerIn : null;
      out.runMin = out.grossDose / design.Q;
      out.cycleMin = 1440 / out.totalDoses;   // one dose cycle (ON + OFF), all zones in sequence
      out.offMin = out.cycleMin - out.runMin; // timer OFF setting
    } else {
      // Floats set the dose: the drawdown height and its volume come from the tank manufacturer's chart
      // (gallons per inch is not constant for round or tapered tanks, so the volume is entered directly).
      const dd = num(d.drawdownIn), dv = num(d.drawdownGal);
      out.drawdown = dd > 0 ? dd : null;
      if (!(dv > 0)) return Object.assign(out, { needFloats: true });
      out.grossDose = dv;
      out.netDose = out.grossDose - out.drainback;
      if (!(out.netDose > 0)) return Object.assign(out, { valid: false, drainbackExceeds: true });
      out.totalDoses = gpd / out.netDose;   // doses per day at design flow
      out.perDay = out.totalDoses / zones;  // per zone
      out.runMin = out.grossDose / design.Q;
    }
    out.valid = true;
    out.dailyRunMin = out.runMin * out.totalDoses;
    return out;
  }

  // ---------------------------------------------------------------- system curve
  // Flow grid for fixed-flow system curves: out to the larger of 6 × design flow or 200 gpm, so operating points of
  // all library pumps fall on the curve. The design flow itself is always included as a point.
  function flowGrid(Qd) {
    const Qmax = Math.max(6 * Qd, 200), N = 60, qs = [Qd];
    for (let i = 1; i <= N; i++) qs.push(Qmax * i / N);
    return qs.sort((a, b) => a - b).filter((q, i, a) => i === 0 || q - a[i - 1] > 1e-9);
  }

  function systemCurve(s, model, design, hNetFn) {
    const Qd = design.Q;
    if (model && model.kind === 'discharge') {
      // Outlet head is known as a function of flow (exit loss), or constant (main pressure)
      const fn = hNetFn || model.hNetFn;
      return [0].concat(flowGrid(Qd)).map(Q => ({ Q, H: buildScenario(s, '', Q, fn(Q), Qd, null).TDH, hNet: fn(Q) }));
    }
    // Zero-flow point: flow starts once the lowest outlet is reached, so the head at Q = 0 is the static head
    // (to the manifold inlet) plus the elevation of the lowest outlet relative to the manifold inlet.
    let z0 = 0;
    if (model && model.kind === 'network') {
      const sp = model.spec;
      const nCalc = sp.manFeed === 'center' && sp.nConn > 1 ? Math.ceil(sp.nConn / 2) : sp.nConn;
      z0 = Math.min(0, sp.run.dz) + Math.min(0, (nCalc - 1) * sp.connDz);
    }
    // Each point also stores hNet: the pressure head required at the distribution inlet (manifold / outlet) at that flow.
    const pts = [{ Q: 0, H: num(s.lift) + z0, hNet: z0 }];
    if (model && model.variable) {
      // Range extends to several times the design flow so pump operating points (including oversized pumps) fall on the curve
      [0.03, 0.1, 0.2, 0.35, 0.55, 0.75, 1, 1.3, 1.7, 2.2, 3, 4, 5.5, 7.5, 10, 14, 20, 28, 40, 60, 90, 140].forEach(f => {
        const net = networkSolve(model.spec, model.hEnd * f);
        pts.push({ Q: net.Q, H: buildScenario(s, '', net.Q, net.hInlet, Qd, null, null, model).TDH, hNet: net.hInlet });
      });
    } else {
      // Constant-pressure requirement (PC drip, gravity, known device): network losses scale with Q^1.852
      const hRes = model && model.kind === 'network' ? model.hEnd : (model ? model.hRes : 0);
      const dyn = Math.max(0, design.hNet - hRes);
      flowGrid(Qd).forEach(Q => {
        const hNet = hRes + dyn * Math.pow(Q / Qd, 1.852);
        pts.push({ Q, H: buildScenario(s, '', Q, hNet, Qd, null, null, model).TDH, hNet });
      });
      pts[0].hNet = hRes; pts[0].H = num(s.lift) + hRes;
    }
    pts.sort((a, b) => a.Q - b.Q);
    return pts;
  }

  function interp(pts, x) {
    if (!pts.length || x < pts[0].Q || x > pts[pts.length - 1].Q) return null;
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i].Q) {
        const a = pts[i - 1], b = pts[i];
        return b.Q === a.Q ? b.H : a.H + (b.H - a.H) * (x - a.Q) / (b.Q - a.Q);
      }
    }
    return null;
  }

  /** Pressure head at the distribution inlet (hNet) at flow Q, interpolated along the system curve. */
  function inletHeadAt(sysPts, Q) {
    return interp(sysPts.map(p => ({ Q: p.Q, H: p.hNet })), Q);
  }

  /**
   * Field-pressure check for a selected pump: the pressure at the distribution inlet when the pump runs at its
   * operating point, compared with the maximum allowed for drip emitters or spray heads.
   */
  function fieldPressureCheck(s, R, op) {
    if (!op || !R.curve) return null;
    const maxP = s.systemType === 'drip' ? num(s.drip.maxP) : s.systemType === 'spray' ? num(s.spray.maxP) : 0;
    if (!(maxP > 0)) return null;
    const h = inletHeadAt(R.curve, op.Q);
    if (h === null) return null;
    const p = h / FT_PER_PSI;
    return { psi: p, maxP, over: p > maxP, what: s.systemType === 'drip' ? 'emitter' : 'spray head' };
  }

  /** Intersection of a pump curve [{Q,H}] with the system curve. */
  function operatingPoint(pumpPts, sysPts) {
    const p = pumpPts.filter(x => Number.isFinite(x.Q) && Number.isFinite(x.H)).sort((a, b) => a.Q - b.Q);
    if (p.length < 2) return null;
    const lo = Math.max(p[0].Q, sysPts[0].Q), hi = Math.min(p[p.length - 1].Q, sysPts[sysPts.length - 1].Q);
    if (!(hi > lo)) return null;
    const N = 400;
    let prevQ = lo, prevD = interp(p, lo) - interp(sysPts, lo);
    for (let i = 1; i <= N; i++) {
      const Q = lo + (hi - lo) * i / N;
      const dlt = interp(p, Q) - interp(sysPts, Q);
      if (prevD >= 0 && dlt <= 0) {
        const t = prevD === dlt ? 0 : prevD / (prevD - dlt);
        const Qx = prevQ + t * (Q - prevQ);
        return { Q: Qx, H: interp(p, Qx) };
      }
      prevQ = Q; prevD = dlt;
    }
    return null;
  }

  function pumpMeets(pumpPts, Q, H) {
    const p = pumpPts.slice().sort((a, b) => a.Q - b.Q);
    const h = interp(p, Q);
    return h !== null && h >= H ? h : null;
  }

  // ---------------------------------------------------------------- input plausibility
  // Values that are valid but outside the usual range for onsite dispersal. These often come from a typo or a unit
  // mix-up (feet for inches, gpm for gph, psi for ft). Each one raises a caution; nothing is blocked.
  // [path, label, unit, low, high, hint, applies-to system type (blank = all)]
  const PLAUSIBLE = [
    ['lift', 'Static head', 'ft', -50, 150, 'Static head is entered in feet.', ''],
    ['transport.discharge.L', 'Discharge assembly length', 'ft', 0, 50, 'The discharge assembly is the piping inside the pump tank and riser; the force main is entered separately.', ''],
    ['transport.before.L', 'Force main length', 'ft', 0, 5000, '', ''],
    ['transport.after.L', 'Zone force main length', 'ft', 0, 5000, '', '', s => s.valve.use],
    ['lpd.latLen', 'LPD lateral length', 'ft', 0, 150, '', 'lpd'],
    ['lpd.spacing', 'Orifice spacing', 'ft', 1.5, 10, 'Orifice spacing is entered in feet.', 'lpd'],
    ['lpd.hEnd', 'Distal residual head', 'ft', 0, 15, 'Residual head is entered in feet (1 psi = 2.307 ft).', 'lpd'],
    ['lpd.cd', 'Orifice discharge coefficient', '', 0.5, 0.7, 'A sharp-edged drilled orifice is usually taken as 0.60.', 'lpd'],
    ['lpd.nLat', 'Number of laterals per zone', '', 0, 40, '', 'lpd'],
    ['lpd.manLen', 'Manifold length', 'ft', 0, 300, '', 'lpd'],
    ['lpd.latDz', 'Elevation change along lateral', 'ft', -10, 10, '', 'lpd'],
    ['lpd.connDz', 'Elevation step between lateral connections', 'ft', -10, 10, 'This is the step between adjacent laterals, not the total across the field.', 'lpd'],
    ['drip.latLen', 'Dripline lateral length', 'ft', 0, 500, 'Check the maximum lateral length in the dripline manufacturer\'s tables.', 'drip'],
    ['drip.latId', 'Dripline inside diameter', 'in', 0.4, 1.0, 'Dripline inside diameter is entered in inches.', 'drip'],
    ['drip.emQ', 'Emitter flow', 'gph', 0.2, 4, 'Emitter flow is entered in gallons per hour, not gpm.', 'drip'],
    ['drip.emSpacing', 'Emitter spacing', 'in', 6, 48, 'Emitter spacing is entered in inches (24 in = 2 ft).', 'drip'],
    ['drip.minP', 'Minimum pressure at distal emitter', 'psi', 3, 40, 'Pressure is entered in psi.', 'drip'],
    ['drip.latDz', 'Elevation change along lateral', 'ft', -20, 20, '', 'drip'],
    ['spray.ratedQ', 'Spray head rated flow', 'gpm', 0, 20, '', 'spray'],
    ['spray.ratedP', 'Spray head rated pressure', 'psi', 10, 100, 'Pressure is entered in psi.', 'spray'],
    ['spray.reqP', 'Minimum pressure at last head', 'psi', 10, 100, 'Pressure is entered in psi.', 'spray'],
    ['spray.spacing', 'Spacing between heads', 'ft', 0, 150, '', 'spray'],
    ['dose.drawdownIn', 'Float drawdown height', 'in', 2, 48, 'Drawdown height is entered in inches.', '', s => s.dose.mode === 'demand'],
    ['dose.galPerIn', 'Pump tank volume per inch', 'gal/in', 5, 500, '', '', s => s.dose.mode === 'timed' && num(s.dose.galPerIn) > 0]
  ];
  function plausibility(s, R) {
    const out = [];
    const get = p => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), s);
    const fmt = (x, u) => `${+x.toFixed(3)}${u ? ' ' + u : ''}`;
    PLAUSIBLE.forEach(([path, label, unit, lo, hi, hint, sys, when]) => {
      if (sys && sys !== s.systemType) return;
      if (when && !when(s)) return;
      const raw = get(path);
      if (raw === '' || raw == null) return;
      const v = num(raw);
      if (!Number.isFinite(v) || (v >= lo && v <= hi)) return;
      out.push(`Check the input: ${label.charAt(0).toLowerCase() + label.slice(1)} is ${fmt(v, unit)}, outside the usual range of ${fmt(lo, '')} to ${fmt(hi, unit)}.${hint ? ' ' + hint : ''} If the value is correct, this caution can be ignored.`);
    });
    // Demand dosing: the implied gallons per inch shows a feet/inches mix-up or a mismatched height and volume.
    if (s.dose.mode === 'demand' && num(s.dose.drawdownIn) > 0 && num(s.dose.drawdownGal) > 0) {
      const gpi = num(s.dose.drawdownGal) / num(s.dose.drawdownIn);
      if (gpi < 5 || gpi > 500) out.push(`Check the input: the float drawdown of ${num(s.dose.drawdownGal)} gal over ${num(s.dose.drawdownIn)} in is ${gpi.toFixed(1)} gal/in, outside the usual range of 5 to 500 gal/in for a pump tank. Confirm both values against the tank manufacturer's chart (height in inches). If the values are correct, this caution can be ignored.`);
    }
    if (R && R.design && R.design.Q > 500) out.push(`Check the input: the design flow is ${R.design.Q.toFixed(1)} gpm, which is large for an onsite dispersal zone. Confirm the number of laterals, outlets and units. If the value is correct, this caution can be ignored.`);
    return out;
  }

  // ---------------------------------------------------------------- checks
  function checks(s, R, model) {
    const out = [];
    const set = s.settings;
    const vMin = num(set.vMin, 2), vMax = num(set.vMax, 5);
    const add = (level, text) => out.push({ level, text });
    plausibility(s, R).forEach(t => add('warn', t));
    R.scenarios.forEach(sc => {
      sc.segs.forEach(g => {
        if (g.L <= 0) return;
        if (g.v > vMax) add('warn', `${sc.label}: velocity in the ${g.label.toLowerCase()} is ${g.v.toFixed(1)} ft/s, above the ${vMax} ft/s guideline. The friction loss at this velocity is included in the TDH; the guideline limits surge (water hammer) pressure when the pump starts and stops. Increase the pipe size or reduce the flow rate.`);
        else if (g.v < vMin && g.key !== 'discharge') add('info', `${sc.label}: velocity in the ${g.label.toLowerCase()} is ${g.v.toFixed(1)} ft/s, below the ${vMin} ft/s scouring guideline. Solids and biological growth can accumulate in the pipe at low velocity; this matters less if the force main drains back after each dose.`);
      });
      if (sc.manInlet && sc.manInlet.v > vMax) {
        const mi = sc.manInlet, term = s.systemType === 'spray' ? 'header' : 'manifold';
        add('warn', `${sc.label}: the ${term} inlet velocity is ${mi.v.toFixed(1)} ft/s, above the ${vMax} ft/s guideline. Increase the ${term} size.`);
      }
      const transport = sc.segs.filter(g => g.key !== 'discharge').reduce((t, g) => t + g.total, 0);
      if (sc.TDH > 0 && transport / sc.TDH > 0.4) add('warn', `${sc.label}: the force main head loss (${transport.toFixed(1)} ft) is more than 40% of the TDH (${sc.TDH.toFixed(1)} ft). To reduce it, increase the pipe diameter, change the pipe class/schedule (if allowed), or reduce the flow rate.`);
    });
    const ds = R.dose;
    if (ds && ds.mode === 'timed' && ds.valid && ds.offMin < 0) add('warn', `Timed dosing: each dose takes ${ds.runMin.toFixed(1)} min of pump run time, but the dose cycle is only ${ds.cycleMin.toFixed(1)} min (${ds.totalDoses} doses per day). Reduce the doses per day or increase the pump flow.`);
    if (ds && ds.mode === 'demand' && ds.needFloats) add('info', `Demand dosing: the float drawdown volume has not been entered. Set the pump-on and pump-off floats from the tank manufacturer's chart${ds.minGross !== null ? `; the drawdown volume must be at least ${ds.minGross.toFixed(1)} gal (minimum net dose ${ds.minDose.toFixed(1)} gal + drainback ${ds.drainback.toFixed(1)} gal)` : ''}.`);
    if (ds && ds.mode === 'demand' && ds.drainbackExceeds) add('warn', `Demand dosing: the float drawdown volume (${num(s.dose.drawdownGal).toFixed(1)} gal) does not exceed the drainback volume (${ds.drainback.toFixed(1)} gal), so no effluent reaches the field. Increase the float drawdown volume.`);
    if (s.valve.use && !(num(s.transport.after && s.transport.after.L) > 0)) add('warn', 'An indexing valve is selected, but the zone force main (downstream of the valve) has no length. Enter the length from the valve to the critical zone manifold.');
    if (num(s.lift) < 0) add('info', 'The static head is negative (the distribution is below the pump-off level). Check that siphoning cannot occur.');

    const D = R.design;
    if (R.sys === 'lpd' && D.net) {
      const maxVar = num(s.lpd.maxVar, 10);
      if (D.net.variation > maxVar) add('warn', `The orifice flow differential (${D.net.variation.toFixed(1)}%) exceeds the ${maxVar}% design limit. Use a larger lateral or manifold, shorter laterals, center-feed, or a higher residual head.`);
      else add('ok', `The orifice flow differential across the zone is ${D.net.variation.toFixed(1)}% (limit ${maxVar}%).`);
      const minRes = num(s.lpd.orifice) < 0.1875 ? 5 : 2;
      if (num(s.lpd.hEnd) < minRes) add('warn', `A residual head of ${s.lpd.hEnd} ft is below the typical ${minRes} ft minimum for a ${orificeLabel(num(s.lpd.orifice))} orifice.`);
      if (model.details.oddPair) add('info', 'There is an odd number of laterals on a two-sided manifold, so one manifold connection is analyzed as a full pair (conservative).');
      if (D.net.oddCenter) add('info', 'A center-fed manifold with an odd number of connections is analyzed as two equal halves (conservative).');
      const dose = R.dose;
      if (dose.valid && dose.minDose !== null) {
        if (dose.netDose < dose.minDose) add('warn', `The net dose (${dose.netDose.toFixed(1)} gal) is less than ${dose.minMult} × the lateral volume (${dose.minDose.toFixed(1)} gal). ${dose.mode === 'demand' ? `Increase the float drawdown volume to at least ${dose.minGross.toFixed(1)} gal (set from the tank manufacturer's chart), or reduce the lateral volume.` : 'Reduce the doses per day or the lateral volume.'}`);
        else add('ok', `The net dose (${dose.netDose.toFixed(1)} gal) is at least ${dose.minMult} × the lateral volume (${dose.minDose.toFixed(1)} gal).`);
      }
    }
    if (R.sys === 'spray' && D.net) {
      const maxVar = num(s.spray.maxVar, 10);
      if (D.net.variation > maxVar) add('warn', `The spray head flow variation (${D.net.variation.toFixed(1)}%) exceeds ${maxVar}%.`);
      else add('ok', `The spray head flow variation is ${D.net.variation.toFixed(1)}% (limit ${maxVar}%).`);
      const pMax = Math.max(...D.net.conns.map(c => c.hIn)) / FT_PER_PSI;
      if (num(s.spray.maxP) > 0 && pMax > num(s.spray.maxP)) add('warn', `The pressure at the first spray head (~${pMax.toFixed(1)} psi) exceeds the ${s.spray.maxP} psi maximum.`);
    }
    if (R.sys === 'discharge' && R.model) {
      const dm = R.model.details;
      if (dm.mode === 'main') {
        add('info', `Sewer main tie-in: the pump's shutoff head must exceed ${R.minShutoff.toFixed(1)} ft (static head + maximum main pressure of ${dm.pMax} psi), with margin, or it will deadhead when the main is at maximum pressure. Provide redundant check valves and an isolation valve at the connection, per the sewer authority's requirements.`);
        if (dm.pMin !== null) add('info', `At the minimum main pressure (${dm.pMin} psi), the pump runs farther out on its curve, at a higher flow. Check the selected pump's operating point on the minimum-pressure system curve (Chart tab) for runout and motor load.`);
        else add('info', 'Enter the minimum main pressure, if known, to check the pump operating point when the main is lightly loaded.');
      } else {
        if (dm.tw > 0) add('info', `The outfall is submerged ${dm.tw.toFixed(1)} ft at the design tailwater. Provide a check valve or flap gate to prevent backflow from the receiving water.`);
        add('info', 'Discharge to surface water is subject to the NPDES / state discharge permit limits for flow and effluent quality.');
      }
    }
    if (R.sys === 'drip') {
      const maxP = num(s.drip.maxP);
      R.scenarios.forEach(sc => {
        const pIn = Math.max(...sc.net.conns.map(c => c.hIn)) / FT_PER_PSI;
        if (maxP > 0 && pIn > maxP) add('warn', `${sc.label}: the lateral inlet pressure (${pIn.toFixed(1)} psi) exceeds the ${maxP} psi maximum emitter pressure. A pressure regulator may be required.`);
      });
      if (model && !model.pc) {
        if (D.net.variation > 10) add('warn', `The emitter flow variation (${D.net.variation.toFixed(1)}%) exceeds 10%.`);
        else add('ok', `The emitter flow variation is ${D.net.variation.toFixed(1)}%.`);
      }
      if (R.flush) add(R.flush.governs ? 'info' : 'ok', R.flush.governs
        ? `During flushing, the return path needs ${(R.flush.required / FT_PER_PSI).toFixed(1)} psi at the lateral ends, which is more than the minimum emitter pressure, so the return path governs.`
        : `Flushing at ${R.flush.vF} ft/s needs ${R.flush.qFlush.toFixed(2)} gpm per lateral end (${R.flush.Qret.toFixed(1)} gpm returned).`);
    }
    return out;
  }

  return {
    VERSION, RELEASE_DATE, PLAUSIBLE,
    G, FT_PER_PSI, GAL_PER_FT3, ORIF_K, VEL_K, HW_K, NU,
    NOMINALS, PIPE_ID, PIPE_CLASSES, FITTINGS, ORIFICES, SYSTEM_TYPES, PROJECT_TYPES, SEGMENTS,
    num, nomLabel, orificeLabel, pipeId, pipeLabel, velocity, velHead, galPerFt, toFt,
    frictionLoss, orificeQ, makeEmitter, lateralRun, lateralFromInlet, networkSolve,
    compute, interp, operatingPoint, pumpMeets, staticRef, inletHeadAt, fieldPressureCheck
  };
});

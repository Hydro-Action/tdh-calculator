/*
 * TDH & Flow Calculator - automated test suite.
 * Open tests/run.html in a browser (served from the project folder) to run.
 *
 * Every scenario is checked against independent hand-calculation formulas written
 * here (not taken from js/calc.js), and the generated report is checked against the
 * engine results.
 */
(function (root) {
  'use strict';
  const C = root.Calc;

  // ------------------------------------------------------------ independent formulas
  const G = 32.174, FT = 2.307;
  const ORIF = 448.831 * Math.PI / 576 * Math.sqrt(2 * G);       // gpm = ORIF·Cd·d²·√h
  const vel = (Q, d) => (Q / 448.831) / (Math.PI / 4 * Math.pow(d / 12, 2));   // ft/s
  const hv = v => v * v / (2 * G);
  const hw = (Q, L, d, Cc) => (Q > 0 && L > 0) ? 4.52 * FT * L * Math.pow(Q, 1.852) / (Math.pow(Cc, 1.852) * Math.pow(d, 4.8704)) : 0;
  const gpf = d => Math.PI / 4 * Math.pow(d / 12, 2) * 7.48052;
  const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const near = (a, b, rel, abs) => Math.abs(a - b) <= Math.max(abs || 1e-6, (rel || 1e-6) * Math.abs(b));

  // ------------------------------------------------------------ bookkeeping
  let checks = 0, runs = 0;
  const fails = [], notes = [];
  function check(cond, where, msg) { checks++; if (!cond) fails.push(`${where}: ${msg}`); return cond; }
  function note(where, msg) { notes.push(`${where}: ${msg}`); }

  /** Finds non-finite numbers anywhere in an object (functions skipped). */
  function badNumbers(obj, path, seen, out) {
    if (obj === null || obj === undefined) return out;
    if (typeof obj === 'number') { if (!Number.isFinite(obj)) out.push(path); return out; }
    if (typeof obj !== 'object' || seen.has(obj)) return out;
    seen.add(obj);
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'function') continue;
      if (['hMin', 'pMin', 'drawdown', 'tankDrawdown', 'minDose', 'minGross', 'manifold'].includes(k) && obj[k] === null) continue;
      badNumbers(obj[k], path + '.' + k, seen, out);
    }
    return out;
  }

  const txt = html => { const d = document.createElement('div'); d.innerHTML = html; return d; };
  const numIn = s => { const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };

  // ------------------------------------------------------------ scenario checks
  function verify(name, s, R) {
    runs++;
    if (!check(R.errors.length === 0, name, 'unexpected input error: ' + R.errors.join('; '))) return;
    const bad = badNumbers(R, 'R', new Set(), []);
    check(bad.length === 0, name, 'non-finite values at ' + bad.slice(0, 5).join(', '));

    const set = s.settings, Cpvc = n(set.cPVC), sf = n(set.frictionSF);
    const Qd = R.design.Q;

    R.scenarios.forEach(sc => {
      const w = `${name} [${sc.label}]`;
      // TDH = sum of its parts
      const sum = sc.lift + sc.segTotal + sc.valveLoss + sc.addonTotal + sc.teeLoss + sc.hNet;
      check(near(sum, sc.TDH, 1e-9, 1e-9), w, `TDH ${sc.TDH} != sum of parts ${sum}`);
      check(near(sc.lift, n(s.lift), 0, 1e-12), w, 'static head not equal to input');

      // manifold / header inlet tee: K(tee branch) × v²/2g at the manifold velocity, only where a manifold serves 2+ connections
      const sp = R.model && R.model.spec;
      if (sp && sp.nConn > 1) {
        const Qin = sp.manFeed === 'center' ? sc.Q / 2 : sc.Q;
        const exp = n(set.K.teeBr) * hv(vel(Qin, sp.dMan));
        check(near(sc.teeLoss, exp, 1e-6, 1e-9), w, `inlet tee loss ${sc.teeLoss} vs ${exp}`);
        if (sc.net) check(near(Qin, sc.net.Qhalf, 1e-9, 1e-9), w, `tee flow ${Qin} vs manifold inlet flow ${sc.net.Qhalf}`);
      } else check(sc.teeLoss === 0 && !sc.tee, w, 'inlet tee added without a manifold');

      // force main segments vs independent formulas
      sc.segs.forEach(g => {
        const d = C.pipeId(g.pipe, 'x');
        const v = vel(sc.Q, d);
        check(near(g.v, v, 1e-4), w, `${g.label} velocity ${g.v} vs ${v}`);
        if (set.method !== 'DW') check(near(g.hf, hw(sc.Q, g.L, d, Cpvc), 1e-4, 1e-9), w, `${g.label} hf ${g.hf} vs ${hw(sc.Q, g.L, d, Cpvc)}`);
        let K = n(g.kOther !== undefined ? 0 : 0);
        const seg = s.transport[g.key];
        K = n(seg.kOther);
        C.FITTINGS.forEach(f => { K += n(seg.fit[f.k]) * n(set.K[f.k]); });
        check(near(g.sumK, K, 1e-9, 1e-9), w, `${g.label} ΣK ${g.sumK} vs ${K}`);
        check(near(g.hm, K * hv(v), 1e-4, 1e-9), w, `${g.label} minor loss`);
        check(near(g.total, (g.hf + g.hm) * (1 + sf / 100), 1e-9, 1e-9), w, `${g.label} total with safety factor`);
        check(near(g.vol, g.L * gpf(d), 1e-6, 1e-9), w, `${g.label} volume`);
      });

      // indexing valve and supplemental device scaling
      if (s.valve.use) {
        const qref = n(s.valve.q) > 0 ? n(s.valve.q) : Qd;
        const exp = (s.valve.unit === 'psi' ? n(s.valve.loss) * FT : n(s.valve.loss)) * Math.pow(sc.Q / qref, 2);
        check(near(sc.valveLoss, exp, 1e-9, 1e-9), w, `valve loss ${sc.valveLoss} vs ${exp}`);
      } else check(sc.valveLoss === 0, w, 'valve loss without valve');
      const expAdd = (s.addons || []).filter(a => n(a.val) !== 0).reduce((t, a) => {
        const qref = n(a.q) > 0 ? n(a.q) : Qd;
        return t + (a.unit === 'psi' ? n(a.val) * FT : n(a.val)) * Math.pow(sc.Q / qref, 2);
      }, 0);
      check(near(sc.addonTotal, expAdd, 1e-9, 1e-9), w, `supplemental losses ${sc.addonTotal} vs ${expAdd}`);

      // distribution network
      const net = sc.net;
      if (net) {
        const model = R.model;
        const target = sc.flush ? sc.flush.hEnd : model.hEnd;
        const minEnd = Math.min(...net.conns.map(c => c.hEnd));
        check(near(minEnd, target, 0, 2e-4), w, `critical distal head ${minEnd} vs target ${target}`);
        const qsum = net.conns.reduce((t, c) => t + c.qConn, 0);
        check(near(net.Q, qsum * net.mult, 1e-9, 1e-9), w, `network flow ${net.Q} vs Σ connections ${qsum}×${net.mult}`);
        check(near(sc.Q, net.Q, 1e-12, 1e-12), w, 'scenario flow != network flow');
        // outlet-by-outlet check of the critical lateral
        const rows = net.criticalRows.rows;
        const endFlow = sc.flush ? sc.flush.qFlush : 0;
        const qRows = rows.reduce((t, r) => t + r.q, 0);
        check(near(net.criticalRows.Q, qRows + endFlow, 1e-9, 1e-9), w, 'critical lateral flow != Σ outlet flows');
        rows.forEach(r => {
          let qe;
          if (s.systemType === 'lpd') qe = r.h > 0 ? ORIF * n(s.lpd.cd) * Math.pow(n(s.lpd.orifice), 2) * Math.sqrt(r.h) : 0;
          else if (s.systemType === 'spray') qe = r.h > 0 ? n(s.spray.ratedQ) * Math.pow((r.h / FT) / n(s.spray.ratedP), n(s.spray.x)) : 0;
          else if (s.drip.emType === 'npc') qe = r.h > 0 ? (n(s.drip.emQ) / 60) * Math.pow((r.h / FT) / n(s.drip.emPref), n(s.drip.emX)) : 0;
          else qe = r.h > 0 ? n(s.drip.emQ) / 60 : 0;
          check(near(r.q, qe, 1e-6, 1e-9), w, `outlet ${r.i} flow ${r.q} vs ${qe} at h=${r.h}`);
        });
        // independent step calculation of the critical lateral (Hazen-Williams only)
        if (set.method !== 'DW') {
          const run = model.spec.run;
          const Cl = s.systemType === 'drip' ? n(s.drip.latC) : Cpvc;
          const tot = run.firstLen + (run.n - 1) * run.spacing;
          const slope = tot > 0 ? run.dz / tot : 0;
          let H = net.criticalRows.hEnd, Q = endFlow + rows[rows.length - 1].q;
          for (let i = rows.length - 2; i >= 0; i--) { H += hw(Q, run.spacing, run.d, Cl) + slope * run.spacing; Q += rows[i].q; }
          H += hw(Q, run.firstLen, run.d, Cl) + slope * run.firstLen;
          check(near(H, net.criticalRows.hIn, 1e-6, 1e-6), w, `critical lateral inlet head ${net.criticalRows.hIn} vs independent ${H}`);
        }
        // a variation above the design limit must raise a caution
        const lim = s.systemType === 'lpd' ? n(s.lpd.maxVar) : s.systemType === 'spray' ? n(s.spray.maxVar) : (s.drip.emType === 'npc' ? 10 : Infinity);
        if (sc === R.design && net.variation > lim) check(R.checks.some(c => c.level === 'warn' && /variation|differential/.test(c.text)), w, `variation ${net.variation.toFixed(1)}% > ${lim}% with no caution`);
      }
    });

    // volumes
    const V = R.volumes;
    check(near(V.beforeValve, V.discharge + V.before, 1e-12, 1e-12), name, 'volume upstream total');
    check(near(V.afterValve, V.after + V.manifold + V.laterals, 1e-12, 1e-12), name, 'volume downstream total');
    Object.values(V.items).forEach(it => { if (it) check(near(it.vol, it.L * gpf(it.d), 1e-9, 1e-9) && near(it.L, it.count * it.lenEach, 1e-12, 1e-12), name, `${it.label} volume item`); });

    // dosing
    const ds = R.dose;
    if (ds.valid) {
      if (ds.mode === 'timed') {
        check(near(ds.netDose * ds.totalDoses, n(s.dose.gpd), 1e-9), name, 'timed: net dose × doses != daily flow');
        check(near(ds.offMin + ds.runMin, 1440 / ds.totalDoses, 1e-9), name, 'timed: ON + OFF != cycle');
      } else {
        check(near(ds.netDose, ds.grossDose - ds.drainback, 1e-12, 1e-12), name, 'demand: net != gross − drainback');
        check(near(ds.totalDoses * ds.netDose, n(s.dose.gpd), 1e-9), name, 'demand: doses × net != daily flow');
      }
      check(near(ds.runMin * Qd, ds.grossDose, 1e-9), name, 'run time × Q != gross dose');
      check(near(ds.drainback, s.dose.drainback ? V.beforeValve : 0, 1e-12, 1e-12), name, 'drainback volume');
    }

    // system curve: non-decreasing and passes through the design point
    const cv = R.curve;
    for (let i = 1; i < cv.length; i++) {
      if (cv[i].Q < cv[i - 1].Q - 1e-9) { check(false, name, 'system curve flows not sorted'); break; }
      if (cv[i].H < cv[i - 1].H - 1e-6) { check(false, name, `system curve decreases between ${cv[i - 1].Q.toFixed(2)} and ${cv[i].Q.toFixed(2)} gpm`); break; }
    }
    const hAtD = C.interp(cv, R.design.Q);
    check(hAtD !== null && near(hAtD, R.design.TDH, 0.005, 0.05), name, `system curve at design flow ${hAtD} vs TDH ${R.design.TDH}`);

    // report matches the calculations
    let html = '';
    try { html = Report.build(s, R, { system: R.curve, duty: [], pumps: [] }); } catch (e) { check(false, name, 'report threw: ' + e.message); return; }
    // print layout groups (div wrappers) must open and close evenly
    { const o = (html.match(/<div\b/g) || []).length, c = (html.match(/<\/div>/g) || []).length; check(o === c, name, `report has ${o} <div> and ${c} </div>`); }
    check(!/Pipe inside diameters are nominal/.test(html), name, 'report still has the pipe inside diameter note');
    check(!!R.design.net === /evenly spaced/.test(html), name, 'outlet spacing note shown for a design without a distribution network (or missing for one with it)');
    const doc = txt(html);
    const t = doc.textContent;
    const badTxt = t.match(/NaN|undefined|Infinity|\bnull\b|\[object/g);
    check(!badTxt, name, 'report contains ' + (badTxt || []).slice(0, 3).join(', '));
    const sum = doc.querySelectorAll('.summary b');
    check(sum.length === 3 && near(numIn(sum[0].textContent), +R.governing.Q.toFixed(1), 0, 0.051) && near(numIn(sum[1].textContent), +R.governing.TDH.toFixed(1), 0, 0.051), name, 'report summary flow/TDH mismatch');
    const h2 = [...doc.querySelectorAll('h2')].find(h => /Total Dynamic Head/.test(h.textContent));
    if (check(!!h2, name, 'report missing TDH section')) {
      const rows = [...h2.nextElementSibling.querySelectorAll('tbody tr')];
      const iTot = rows.findIndex(r => /Total dynamic head \(ft\)/.test(r.textContent));
      R.scenarios.forEach((sc, j) => {
        const col = r => numIn(r.cells[1 + j].textContent);
        const parts = rows.slice(0, iTot).reduce((t2, r) => t2 + col(r), 0);
        const tot = col(rows[iTot]);
        check(near(tot, +sc.TDH.toFixed(2), 0, 0.006), name, `report TDH ${tot} vs ${sc.TDH.toFixed(2)} (${sc.label})`);
        check(near(parts, tot, 0, 0.011 * iTot + 0.006), name, `report TDH rows sum ${parts.toFixed(2)} vs total ${tot} (${sc.label})`);
        const qr = rows.find(r => /Flow rate \(gpm\)/.test(r.textContent));
        check(qr && near(col(qr), +sc.Q.toFixed(2), 0, 0.006), name, 'report flow row mismatch');
      });
    }
    // every force main pipe appears in the report
    R.design.segs.forEach(g => check(t.includes(C.pipeLabel(g.pipe)), name, `report missing pipe ${C.pipeLabel(g.pipe)}`));

    // diagram renders
    try { const svg = Diagram.render(s, R); check(svg.startsWith('<svg') && !/NaN|undefined/.test(svg), name, 'diagram has NaN/undefined'); }
    catch (e) { check(false, name, 'diagram threw: ' + e.message); }
  }

  // ------------------------------------------------------------ scenario matrix
  function base(type) {
    const s = clone(root.TDHApp.defaultState());
    s.systemType = type;
    return s;
  }
  const variants = {
    method: [s => {}, s => { s.settings.method = 'DW'; }],
    valve: [s => {}, s => { s.valve.use = true; s.valve.zones = 3; s.valve.loss = 4; s.transport.after.pipe.nom = '1.5'; s.transport.after.L = 60; }, s => { s.valve.use = true; s.valve.loss = 2; s.valve.unit = 'psi'; s.valve.q = 30; }],
    addons: [s => { s.addons = []; }, s => { s.addons = [{ label: 'Disc filter', val: 3, unit: 'psi', q: 20 }, { label: 'Meter', val: 1.5, unit: 'ft', q: '' }]; }],
    dose: [s => {}, s => { s.dose.mode = 'demand'; s.dose.drawdownIn = 5; s.dose.drawdownGal = 150; }, s => { s.dose.mode = 'demand'; s.dose.drawdownIn = ''; s.dose.drawdownGal = ''; }, s => { s.dose.drainback = false; s.settings.frictionSF = 15; }]
  };
  function product(lists) { return lists.reduce((acc, l) => acc.flatMap(a => l.map(f => a.concat([f]))), [[]]); }

  const systemVariants = {
    lpd: product([
      [s => { s.lpd.sides = 'one'; }, s => { s.lpd.sides = 'both'; }],
      [s => { s.lpd.manFeed = 'end'; }, s => { s.lpd.manFeed = 'center'; }],
      [s => { s.lpd.nLat = 1; }, s => { s.lpd.nLat = 2; }, s => { s.lpd.nLat = 3; }, s => { s.lpd.nLat = 7; }, s => { s.lpd.nLat = 12; }],
      [s => {}, s => { s.lpd.connDz = 0.5; }, s => { s.lpd.connDz = -0.75; s.lpd.latDz = 1.5; }, s => { s.lpd.latDz = -2; }],
      [s => {}, s => { s.lpd.orifice = '0.125'; s.lpd.hEnd = 5; s.lpd.spacing = 2; }, s => { s.lpd.orifice = '0.25'; s.lpd.hEnd = 2; s.lpd.latLen = 80; }]
    ]),
    drip: product([
      [s => {}, s => { s.drip.emType = 'npc'; }],
      [s => { s.drip.flush = true; }, s => { s.drip.flush = false; }, s => { s.drip.flush = true; s.drip.retDz = 30; }],
      [s => { s.drip.nLat = 1; }, s => { s.drip.nLat = 2; }, s => { s.drip.nLat = 9; }],
      [s => {}, s => { s.drip.manFeed = 'center'; s.drip.latDz = 3; s.drip.connDz = 0.5; }]
    ]),
    spray: product([
      [s => { s.spray.nHeads = 1; s.spray.firstLen = 30; }, s => {}, s => { s.spray.nHeads = 12; s.spray.spacing = 20; }],
      [s => {}, s => { s.spray.nBranches = 3; s.spray.branchSpacing = 25; }],
      [s => {}, s => { s.spray.latDz = 6; s.spray.x = 0.46; }]
    ]),
    gravity: [[s => {}], [s => { s.gravity.resid = 0; }]],
    other: [[s => {}], [s => { s.other.resid = 25; s.other.unit = 'psi'; }]],
    discharge: product([
      [s => { s.discharge.mode = 'outfall'; }, s => { s.discharge.mode = 'outfall'; s.discharge.tailwater = 2.5; s.discharge.exitK = 1; }, s => { s.discharge.mode = 'main'; s.discharge.pMax = 35; s.discharge.pMin = ''; }, s => { s.discharge.mode = 'main'; s.discharge.pMax = 35; s.discharge.pMin = 12; }],
      [s => {}, s => { s.lift = -3; }]
    ])
  };

  function runMatrix() {
    Object.entries(systemVariants).forEach(([type, sysList]) => {
      const common = product([variants.method, variants.valve, variants.addons, variants.dose]);
      // full system matrix with every common variant would be large; pair each system variant with a rotating common variant
      sysList.forEach((sv, i) => {
        const picks = [common[i % common.length], common[(i * 7 + 3) % common.length], common[(i * 13 + 5) % common.length]];
        picks.forEach((cv, j) => {
          const s = base(type);
          sv.forEach(f => f(s)); cv.forEach(f => f(s));
          let R;
          try { R = C.compute(s); } catch (e) { check(false, `${type} #${i}.${j}`, 'compute threw: ' + e.message); return; }
          verify(`${type} #${i}.${j}`, s, R);
        });
      });
      // every common variant once on the default system variant
      common.forEach((cv, j) => {
        const s = base(type); cv.forEach(f => f(s));
        verify(`${type} common#${j}`, s, C.compute(s));
      });
    });
  }

  // ------------------------------------------------------------ invalid / edge inputs (must not crash; must give a clear error)
  function runInvalid() {
    const cases = [
      ['LPD laterals = 0', 'lpd', s => { s.lpd.nLat = 0; }],
      ['LPD blank lateral length', 'lpd', s => { s.lpd.latLen = ''; }],
      ['LPD zero spacing', 'lpd', s => { s.lpd.spacing = 0; }],
      ['LPD too many orifices for length', 'lpd', s => { s.lpd.nOverride = 40; s.lpd.latLen = 50; s.lpd.spacing = 3; }],
      ['LPD zero residual head', 'lpd', s => { s.lpd.hEnd = 0; }],
      ['1/2" not made in SDR 21', 'lpd', s => { s.transport.before.pipe = { cls: 'PVC SDR 21 (Class 200)', nom: '0.5', id: '' }; }],
      ['Custom pipe with no ID', 'lpd', s => { s.lpd.latPipe = { cls: 'Custom ID', nom: '1', id: '' }; }],
      ['Drip no dripline ID', 'drip', s => { s.drip.latId = ''; }],
      ['Drip zero emitter flow', 'drip', s => { s.drip.emQ = 0; }],
      ['Drip zero minimum pressure', 'drip', s => { s.drip.minP = 0; }],
      ['Spray no head rating', 'spray', s => { s.spray.ratedQ = ''; }],
      ['Spray multiple heads, zero spacing', 'spray', s => { s.spray.spacing = 0; }],
      ['Gravity zero flow', 'gravity', s => { s.gravity.Q = 0; }],
      ['Discharge zero flow', 'discharge', s => { s.discharge.Q = ''; }],
      ['Main no max pressure', 'discharge', s => { s.discharge.mode = 'main'; s.discharge.pMax = ''; }],
      ['Main min > max', 'discharge', s => { s.discharge.mode = 'main'; s.discharge.pMax = 10; s.discharge.pMin = 20; }]
    ];
    cases.forEach(([name, type, f]) => {
      const s = base(type); f(s);
      let R;
      try { R = C.compute(s); } catch (e) { check(false, 'invalid: ' + name, 'compute threw instead of reporting an error: ' + e.message); return; }
      check(R.errors.length > 0, 'invalid: ' + name, 'no error reported');
      try { const h = Report.build(s, R, null); check(!/NaN|undefined/.test(txt(h).textContent), 'invalid: ' + name, 'error report contains NaN/undefined'); }
      catch (e) { check(false, 'invalid: ' + name, 'report threw: ' + e.message); }
      try { Diagram.render(s, R); } catch (e) { check(false, 'invalid: ' + name, 'diagram threw: ' + e.message); }
    });

    // inputs that are valid but should raise a caution
    const cautions = [
      ['timed dosing, run longer than cycle', 'gravity', s => { s.gravity.Q = 2; s.dose.dosesPerDay = 400; }, /dose cycle is only/],
      ['demand: drawdown < drainback', 'lpd', s => { s.dose.mode = 'demand'; s.dose.drawdownGal = 10; }, /does not exceed the drainback/],
      ['valve with no zone force main', 'lpd', s => { s.valve.use = true; s.transport.after.L = 0; }, /zone force main/],
      ['high manifold velocity', 'lpd', s => { s.lpd.nLat = 10; }, /manifold inlet velocity/],
      ['LPD large variation', 'lpd', s => { s.lpd.latLen = 120; s.lpd.latPipe.nom = '1'; }, /exceeds the 10% design limit/],
      ['drip inlet over max pressure', 'drip', s => { s.drip.maxP = 12; }, /exceeds the 12 psi maximum/],
      ['negative static head', 'gravity', s => { s.lift = -4; }, /siphoning/],
      ['submerged outfall', 'discharge', s => { s.discharge.tailwater = 2; }, /flap gate/],
      ['LPD dose below minimum multiple', 'lpd', s => { s.dose.minMult = 5; s.dose.dosesPerDay = 40; }, /less than 5 × the lateral volume/],
      ['LPD demand: minimum drawdown stated', 'lpd', s => { s.dose.minMult = 5; s.dose.mode = 'demand'; s.dose.drawdownGal = ''; }, /drawdown volume must be at least/]
    ];
    // minimum dose multiple of 0 (the default) turns the minimum dose check off
    {
      const s = base('lpd'); s.dose.dosesPerDay = 40; const R = C.compute(s);
      check(s.dose.minMult === 0 && R.dose.minDose === null && !R.checks.some(c => /lateral volume/.test(c.text)), 'minimum dose off', 'minimum dose check raised with a multiple of 0');
      const h = txt(Report.build(s, R, null)).textContent;
      check(!/Minimum dose/.test(h), 'minimum dose off', 'report shows a minimum dose with a multiple of 0');
    }
    cautions.forEach(([name, type, f, re]) => {
      const s = base(type); f(s);
      const R = C.compute(s);
      check(R.errors.length === 0 && R.checks.some(c => re.test(c.text)), 'caution: ' + name, 'expected caution not raised' + (R.errors.length ? ' (error: ' + R.errors[0] + ')' : ''));
    });
  }

  // ------------------------------------------------------------ engineering trend checks
  function runTrends() {
    const tdh = (type, f) => { const s = base(type); f(s); const R = C.compute(s); return R.errors.length ? NaN : R.design.TDH; };
    const q = (type, f) => { const s = base(type); f(s); const R = C.compute(s); return R.errors.length ? NaN : R.design.Q; };
    const t = (name, cond) => check(cond, 'trend: ' + name, 'trend not as expected');
    t('longer force main → higher TDH', tdh('lpd', s => { s.transport.before.L = 300; }) > tdh('lpd', s => {}));
    t('larger force main → lower TDH', tdh('lpd', s => { s.transport.before.pipe.nom = '3'; }) < tdh('lpd', s => {}));
    t('more static head → TDH up by same amount', near(tdh('lpd', s => { s.lift = 15; }) - tdh('lpd', s => {}), 10, 1e-9, 1e-9));
    t('higher residual head → more LPD flow', q('lpd', s => { s.lpd.hEnd = 8; }) > q('lpd', s => {}));
    t('larger orifice → more LPD flow', q('lpd', s => { s.lpd.orifice = '0.25'; }) > q('lpd', s => {}));
    t('more laterals → more LPD flow', q('lpd', s => { s.lpd.nLat = 8; }) > q('lpd', s => {}));
    t('center-fed manifold → TDH ≤ end-fed', tdh('lpd', s => { s.lpd.manFeed = 'center'; s.lpd.nLat = 8; }) <= tdh('lpd', s => { s.lpd.nLat = 8; }) + 1e-9);
    t('safety factor raises TDH', tdh('lpd', s => { s.settings.frictionSF = 20; }) > tdh('lpd', s => {}));
    t('C = 130 raises TDH vs C = 150', tdh('lpd', s => { s.settings.cPVC = 130; }) > tdh('lpd', s => {}));
    const hwT = tdh('lpd', s => {}), dwT = tdh('lpd', s => { s.settings.method = 'DW'; });
    t('Darcy-Weisbach within 15% of Hazen-Williams (PVC)', Math.abs(dwT - hwT) / hwT < 0.15);
    { const s = base('drip'); const R = C.compute(s); t('drip flushing flow > dosing flow', R.scenarios[1].Q > R.scenarios[0].Q); t('drip flushing TDH > dosing TDH', R.scenarios[1].TDH > R.scenarios[0].TDH); }
    { const a = q('spray', s => {}), b = q('spray', s => { s.spray.nBranches = 3; s.spray.branchSpacing = 10; s.spray.manPipe.nom = '3'; }); t('3 identical spray lines ≈ 3× flow', b > 2.85 * a && b < 3.01 * a); }
    { const a = q('lpd', s => { s.lpd.nLat = 4; }), b = q('lpd', s => { s.lpd.nLat = 4; s.lpd.sides = 'both'; }); t('4 laterals one side vs both sides: flows within 3%', Math.abs(a - b) / a < 0.03); }
    t('uphill laterals need more head than level', tdh('lpd', s => { s.lpd.latDz = 2; }) > tdh('lpd', s => {}));
    t('PC drip: flow independent of pressure margin', near(q('drip', s => { s.drip.minP = 20; }), q('drip', s => {}), 1e-9));
    t('outfall tailwater adds head 1:1', near(tdh('discharge', s => { s.discharge.tailwater = 3; }) - tdh('discharge', s => {}), 3, 1e-9, 1e-9));
    t('sewer main: TDH rises 2.307 ft per psi', near(tdh('discharge', s => { s.discharge.mode = 'main'; s.discharge.pMax = 31; }) - tdh('discharge', s => { s.discharge.mode = 'main'; s.discharge.pMax = 30; }), FT, 1e-6));
  }

  // ------------------------------------------------------------ hand calculations (documented textbook values)
  function runHandCalcs() {
    const h = (name, got, exp, tol) => check(near(got, exp, tol), 'hand calc: ' + name, `${got} vs expected ${exp}`);
    h('3/16" orifice, Cd 0.6, 5 ft → 0.926 gpm', C.orificeQ(0.1875, 5, 0.6), 0.926, 0.002);
    h('1/8" orifice, Cd 0.6, 5 ft → 0.412 gpm', C.orificeQ(0.125, 5, 0.6), 0.4117, 0.002);
    h('HW 100 ft 2" Sch 40 @ 50 gpm, C150 → ~4.0 ft', C.frictionLoss(50, 100, 2.067, { method: 'HW', C: 150 }), 4.03, 0.02);
    h('velocity 2" Sch 40 @ 50 gpm → 4.78 ft/s', C.velocity(50, 2.067), 4.78, 0.005);
    h('volume 2" Sch 40 → 0.1743 gal/ft', C.galPerFt(2.067), 0.1743, 0.002);
    h('1 psi → 2.307 ft', C.FT_PER_PSI, 2.307, 1e-9);
    // HW and DW agree for smooth PVC at moderate Reynolds number
    const hwv = C.frictionLoss(30, 100, 1.61, { method: 'HW', C: 150 }), dwv = C.frictionLoss(30, 100, 1.61, { method: 'DW', eps: 5e-6 });
    check(Math.abs(hwv - dwv) / hwv < 0.12, 'hand calc: HW vs DW 1-1/2" @ 30 gpm', `${hwv.toFixed(3)} vs ${dwv.toFixed(3)}`);
  }

  // ------------------------------------------------------------ pump library checks
  function runPumps() {
    PumpData.BUILTIN_PUMPS.forEach(p => {
      const w = 'pump ' + p.name;
      check(p.pts.length >= 3, w, 'fewer than 3 curve points');
      check(p.pts[0].Q === 0, w, 'curve does not start at shutoff (0 gpm)');
      for (let i = 1; i < p.pts.length; i++) {
        check(p.pts[i].Q > p.pts[i - 1].Q, w, `flow not increasing at point ${i}`);
        check(p.pts[i].H <= p.pts[i - 1].H, w, `head rises with flow at point ${i}`);
      }
      check(PumpData.PUMP_CATEGORIES.some(c => c.id === p.category), w, 'unknown category');
      check(!!p.source, w, 'no source document');
    });
    // oversized pump on drip: field pressure at the operating point must be flagged over the emitter maximum
    {
      const sd = base('drip'); sd.drip.emType = 'npc'; const Rd = C.compute(sd);
      const big = PumpData.BUILTIN_PUMPS.find(p => p.id === 'ashland-20cpm');
      const fp = C.fieldPressureCheck(sd, Rd, C.operatingPoint(big.pts, Rd.curve));
      check(fp && fp.over, 'pump field pressure', 'Ashland 20CPM on default drip should exceed the 45 psi emitter maximum' + (fp ? ` (got ${fp.psi.toFixed(1)} psi)` : ' (no result)'));
      const small = PumpData.BUILTIN_PUMPS.find(p => p.id === 'liberty-fl30');
      const op = C.operatingPoint(small.pts, Rd.curve), fp2 = C.fieldPressureCheck(sd, Rd, op);
      check(!op || (fp2 && !fp2.over), 'pump field pressure', 'FL30 should not exceed the emitter maximum');
    }
    // whenever a pump curve physically crosses the system curve, an operating point must be found
    ['lpd', 'drip', 'spray', 'gravity', 'other', 'discharge'].forEach(type => {
      const st = base(type); if (type === 'drip') st.drip.emType = 'npc';
      const Rt = C.compute(st);
      PumpData.BUILTIN_PUMPS.forEach(p => {
        const sorted = p.pts.slice().sort((a, b) => a.Q - b.Q);
        const end = sorted[sorted.length - 1];
        const sysAt0 = C.interp(Rt.curve, 0), sysAtEnd = C.interp(Rt.curve, end.Q);
        if (sysAt0 !== null && sysAtEnd !== null && sorted[0].H > sysAt0 && end.H < sysAtEnd) {
          check(!!C.operatingPoint(p.pts, Rt.curve), `pump ${p.name} on ${type}`, 'curves cross but no operating point reported');
        }
      });
    });
    // operating point lies on both curves
    const s = base('lpd'); const R = C.compute(s);
    PumpData.BUILTIN_PUMPS.forEach(p => {
      const op = C.operatingPoint(p.pts, R.curve);
      if (op) {
        const hp = C.interp(p.pts, op.Q), hs = C.interp(R.curve, op.Q);
        check(near(hp, op.H, 0.01, 0.1) && near(hs, op.H, 0.02, 0.3), 'pump ' + p.name, `operating point not on both curves (${op.Q.toFixed(1)} gpm: pump ${hp}, system ${hs}, op ${op.H})`);
      }
    });
  }

  // ------------------------------------------------------------ input plausibility cautions
  function runPlausibility() {
    const has = R => R.checks.some(c => /^Check the input:/.test(c.text));
    // defaults for every system type must not raise a plausibility caution
    ['lpd', 'drip', 'spray', 'gravity', 'other', 'discharge'].forEach(type => {
      const R = C.compute(base(type));
      check(!has(R), 'plausibility: default ' + type, 'defaults raise a plausibility caution: ' + R.checks.filter(c => /^Check the input:/.test(c.text)).map(c => c.text).join(' | '));
    });
    const cases = [
      ['drip emitter spacing in feet', 'drip', s => { s.drip.emSpacing = 2; }, /emitter spacing is 2 in/],
      ['drip emitter flow in gpm', 'drip', s => { s.drip.emQ = 0.01; }, /emitter flow is 0.01 gph/],
      ['LPD residual entered as large value', 'lpd', s => { s.lpd.hEnd = 25; }, /distal residual head is 25 ft/],
      ['static head 500 ft', 'lpd', s => { s.lift = 500; }, /static head is 500 ft/],
      ['discharge assembly 200 ft', 'lpd', s => { s.transport.discharge.L = 200; }, /discharge assembly length/],
      ['demand drawdown height in feet', 'lpd', s => { s.dose.mode = 'demand'; s.dose.drawdownIn = 1.5; s.dose.drawdownGal = 120; }, /float drawdown height is 1.5 in/],
      ['demand height and volume mismatched', 'lpd', s => { s.dose.mode = 'demand'; s.dose.drawdownIn = 10; s.dose.drawdownGal = 10000; }, /1000.0 gal\/in/],
      ['Cd typo', 'lpd', s => { s.lpd.cd = 6; }, /discharge coefficient is 6/],
      ['spray pressure out of range', 'spray', s => { s.spray.reqP = 150; s.spray.maxP = 200; }, /minimum pressure at last head is 150 psi/],
      ['design flow over 500 gpm', 'other', s => { s.other.Q = 800; }, /design flow is 800.0 gpm/]
    ];
    cases.forEach(([name, type, f, re]) => {
      const s = base(type); f(s);
      let R; try { R = C.compute(s); } catch (e) { check(false, 'plausibility: ' + name, 'compute threw: ' + e.message); return; }
      check(R.checks.some(c => c.level === 'warn' && re.test(c.text)), 'plausibility: ' + name, 'expected caution not raised' + (R.errors.length ? ' (error: ' + R.errors[0] + ')' : ''));
    });
    // a timed-dosing tank volume left blank must not raise a caution
    { const s = base('lpd'); s.dose.galPerIn = ''; check(!has(C.compute(s)), 'plausibility: blank gal/in', 'caution raised for a blank optional input'); }
  }

  // ------------------------------------------------------------ reference cases (outside answers, tests/reference-cases.js)
  function deepMerge(base, over) {
    if (Array.isArray(over)) return over.slice();
    if (over && typeof over === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
      const out = Object.assign({}, base);
      Object.keys(over).forEach(k => { out[k] = deepMerge(base[k], over[k]); });
      return out;
    }
    return over === undefined ? base : over;
  }
  const refs = [];
  function runReference() {
    refs.length = 0;
    const list = root.REFERENCE_CASES || [];
    const ids = new Set();
    list.forEach(rc => {
      const w = 'reference ' + rc.id;
      check(!ids.has(rc.id), w, 'duplicate id'); ids.add(rc.id);
      check(!!rc.source, w, 'no source recorded');
      const s = deepMerge(clone(root.TDHApp.defaultState()), rc.project ? (rc.project.state || rc.project) : (rc.inputs || {}));
      let R; try { R = C.compute(s); } catch (e) { check(false, w, 'compute threw: ' + e.message); return; }
      if (R.errors.length) { check(false, w, 'input error: ' + R.errors.join('; ')); return; }
      const fl = R.scenarios.length > 1 ? R.scenarios[1] : null;
      const got = { Q: R.governing.Q, TDH: R.governing.TDH, flushQ: fl && fl.Q, flushTDH: fl && fl.TDH, netDose: R.dose && R.dose.valid ? R.dose.netDose : null };
      const rows = [];
      Object.keys(rc.expect || {}).forEach(k => {
        const exp = rc.expect[k];
        if (exp === null || exp === undefined) return;
        const g = got[k];
        const t = Object.assign({ pct: 3, abs: 0.5 }, (rc.tol || {})[k] || {});
        if ((rc.tol || {})[k] && !('pct' in rc.tol[k])) t.pct = 0;
        if ((rc.tol || {})[k] && !('abs' in rc.tol[k])) t.abs = 0;
        const diff = g === null || g === undefined ? NaN : g - exp;
        const ok = Number.isFinite(diff) && Math.abs(diff) <= Math.max(t.abs, t.pct / 100 * Math.abs(exp));
        rows.push({ k, exp, got: g, diff, pct: exp ? 100 * diff / exp : NaN, ok, tol: t });
        if (rc.status === 'active') check(ok, w, `${k} = ${Number.isFinite(g) ? g.toFixed(3) : g}, expected ${exp} (tolerance ${t.pct}% or ${t.abs})`);
      });
      refs.push({ id: rc.id, title: rc.title, source: rc.source, status: rc.status || 'pending', why: rc.why || '', rows });
    });
  }

  // ------------------------------------------------------------ release: index.html cache-busting matches the version
  function runRelease() {
    let html = '';
    try { const x = new XMLHttpRequest(); x.open('GET', '../index.html', false); x.send(); html = x.status === 200 ? x.responseText : ''; } catch (e) { html = ''; }
    if (!html) { note('release', 'could not read index.html to check the ?v= links'); return; }
    const links = html.match(/(?:src|href)="(?:js|css)\/[^"]+"/g) || [];
    check(links.length >= 7, 'release', `expected 7 local script/style links in index.html, found ${links.length}`);
    links.forEach(l => check(l.includes('?v=' + C.VERSION + '"'), 'release', `${l} in index.html does not end in ?v=${C.VERSION} (VERSION in js/calc.js)`));
  }

  function run() {
    const t0 = performance.now();
    checks = 0; runs = 0; fails.length = 0; notes.length = 0;
    runHandCalcs(); runMatrix(); runInvalid(); runTrends(); runPumps(); runPlausibility(); runReference(); runRelease();
    return { scenarios: runs, checks, fails: fails.slice(), notes: notes.slice(), refs: refs.slice(), version: C.VERSION, ms: Math.round(performance.now() - t0) };
  }

  root.TDHTests = { run };
})(typeof self !== 'undefined' ? self : this);

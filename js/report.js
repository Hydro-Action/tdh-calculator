/* Printable calculation report */
(function (root) {
  'use strict';
  const C = root.Calc;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // number formatter; values that round to zero print as 0 (never "-0.00")
  const f = (x, d = 2) => Number.isFinite(x) ? (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const n = (x) => Number.isFinite(+x) ? +x : 0;

  const tbl = (head, rows, o = {}) => `<table class="${o.cls || ''}">${head ? `<thead><tr>${head.map(h => `<th class="${h[1] || ''}">${h[0]}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.join('')}</tbody></table>`;
  const tr = (cells, cls) => `<tr class="${cls || ''}">${cells.map(c => Array.isArray(c) ? `<td class="${c[1] || ''}">${c[0]}</td>` : `<td>${c}</td>`).join('')}</tr>`;
  const kv = rows => tbl(null, rows.map(r => tr([r[0], [r[1], 'n']])), { cls: 'kv' });
  const eq = (expr, where) => `<div class="eq">${expr}${where ? `<div class="w">${where}</div>` : ''}</div>`;

  function build(S, R, chartData) {
    const out = [];
    const info = S.info || {};
    const sysName = C.SYSTEM_TYPES[S.systemType];
    out.push(`<div class="rpt">`);
    const logo = root.HA_LOGO;
    out.push(`<div class="brandline">${logo ? `<img src="${esc(logo)}" alt="Hydro-Action">` : '<span class="wordmark"><span class="wm-h">hydro</span><span class="wm-dot">·</span><span class="wm-a">action</span></span>'}<span class="tag">Hydro-Action, Inc. · TDH &amp; Flow Calculator v${esc(C.VERSION)}</span></div>`);
    out.push(`<div class="rhead"><div><h1>Pump Design Calculations</h1><div style="font-size:11pt;margin-top:2px">Total Dynamic Head &amp; Flow: ${esc(sysName)}</div>
      <div style="margin-top:8px;font-size:11pt"><b>${esc(info.name || 'Untitled project')}</b>${info.name2 ? '<br>' + esc(info.name2) : ''}</div>
      <div class="small">${[info.client && 'Owner: ' + esc(info.client), info.location && esc(info.location), info.permit && 'Permit/Job: ' + esc(info.permit)].filter(Boolean).join(' · ')}</div></div>
      <div class="meta">${info.company ? `<b>${esc(info.company)}</b><br>` : ''}${info.designer ? 'Designer: ' + esc(info.designer) + '<br>' : ''}Date: ${esc(info.date || '')}<br>Project type: ${esc(C.PROJECT_TYPES[S.projectType] || '')}</div></div>`);

    if (R.errors.length) {
      out.push(`<h2>Input errors</h2><ul>${R.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><p>Correct the input to generate the report.</p>${stamp()}</div>`);
      return out.join('');
    }
    const D = R.design, scs = R.scenarios, two = scs.length > 1, G = R.governing;

    // ---------------- 1. summary
    out.push(`<h2>1. Design Summary</h2>`);
    out.push(`<div class="summary"><div><span>Design flow rate</span><b>${f(G.Q, 1)} gpm</b></div><div><span>Total dynamic head</span><b>${f(G.TDH, 1)} ft</b></div><div><span>Total dynamic pressure</span><b>${f(G.TDH / C.FT_PER_PSI, 1)} psi</b></div></div>`);
    if (two) out.push(`<p>The pump must satisfy both duty points: ${scs.map(s => `<b>${s.label}</b>: ${f(s.Q, 1)} gpm at ${f(s.TDH, 1)} ft`).join('; ')}.</p>`);
    if (root.Diagram) {
      let svg = '';
      try { svg = root.Diagram.render(S, R); } catch (e) { svg = ''; }
      if (svg) out.push(`<h3>System schematic</h3><div class="chart avoid" style="border:1px solid #dde7e9;border-radius:6px;padding:4px">${svg}</div>`);
    }
    const pumps = chartData ? chartData.pumps : [];
    if (pumps.length) {
      const mainTie = !!R.minShutoff;
      const shut = pts => { const p = pts.slice().sort((a, b) => a.Q - b.Q); return p.length ? p[0].H : null; };
      const fieldChk = S.systemType === 'drip' || S.systemType === 'spray';
      const fmax = S.systemType === 'drip' ? n(S.drip.maxP) : n(S.spray.maxP);
      out.push(tbl([['Selected pump'], ['Operating point (curve intersection)'], ...scs.map(s => [`Head available at ${f(s.Q, 1)} gpm`, 'n']),
        ...(mainTie ? [[`Shutoff head (req. &gt; ${f(R.minShutoff, 1)} ft)`, 'n']] : []), ...(R.curveMin ? [['At min. main pressure']] : []),
        ...(fieldChk && fmax > 0 ? [[`Manifold inlet pressure at operating point (max ${f(fmax, 0)} psi)`, 'n']] : [])],
        pumps.map(p => tr([esc(p.name), p.op ? `${f(p.op.Q, 1)} gpm @ ${f(p.op.H, 1)} ft` : 'No intersection', ...scs.map(s => { const h = C.pumpMeets(p.pts, s.Q, s.TDH); return [h !== null ? `${f(h, 1)} ft ✓` : 'Does not meet', 'n']; }),
          ...(mainTie ? [[(() => { const h = shut(p.pts); return h !== null ? `${f(h, 1)} ft ${h > R.minShutoff ? '✓' : '✗ deadheads'}` : '—'; })(), 'n']] : []),
          ...(R.curveMin ? [p.op2 ? `${f(p.op2.Q, 1)} gpm @ ${f(p.op2.H, 1)} ft` : 'Beyond end of pump curve (runout)'] : []),
          ...(fieldChk && fmax > 0 ? [[(() => { const fp = C.fieldPressureCheck(S, R, p.op); return fp ? `${f(fp.psi, 1)} psi ${fp.over ? '✗ over maximum' : '✓'}` : '—'; })(), 'n']] : [])]))));
      if (fieldChk && pumps.some(p => { const fp = C.fieldPressureCheck(S, R, p.op); return fp && fp.over; })) {
        out.push(`<p class="small"><b>Caution:</b> at its operating point, a selected pump marked ✗ delivers more pressure than the ${S.systemType === 'drip' ? 'emitters' : 'spray heads'} are rated for. Select a smaller pump or add pressure regulation.</p>`);
      }
    }

    // ---------------- 2. methods
    out.push(`<h2>2. Design Basis &amp; Methods</h2>`);
    const set = S.settings;
    if (set.method === 'DW') {
      out.push(eq('h<sub>f</sub> = f · (L / D) · v² / 2g, &nbsp; f = 0.25 / [log<sub>10</sub>(ε / 3.7D + 5.74 / Re<sup>0.9</sup>)]² (Swamee-Jain); f = 64/Re for Re &lt; 2300',
        `Darcy-Weisbach friction loss. ε = ${set.eps} ft, ν = ${C.NU} ft²/s (water at 60 °F), g = ${C.G} ft/s².`));
    } else {
      out.push(eq(`h<sub>f</sub> = ${C.HW_K.toFixed(2)} · L · Q<sup>1.852</sup> / (C<sup>1.852</sup> · d<sup>4.8704</sup>)`,
        `Hazen-Williams friction loss: h<sub>f</sub> in ft, L = length (ft), Q = flow (gpm), d = inside diameter (in), C = ${set.cPVC} for PVC${S.systemType === 'drip' ? `, C = ${S.drip.latC} for dripline` : ''}.`));
    }
    out.push(eq('v = 0.4085 · Q / d²', 'Velocity (ft/s), with Q in gpm and d in inches.'));
    out.push(eq('h<sub>m</sub> = ΣK · v² / 2g', 'Minor (fitting) losses using the K-values tabulated below.'));
    if (S.systemType === 'lpd') out.push(eq(`q = ${C.ORIF_K.toFixed(2)} · C<sub>d</sub> · d<sub>o</sub>² · √h`, 'Orifice discharge (gpm): C<sub>d</sub> = discharge coefficient, d<sub>o</sub> = orifice diameter (in), h = pressure head at orifice (ft). Derived from q = C<sub>d</sub>·A·√(2gh).'));
    if (S.systemType === 'spray' || (S.systemType === 'drip' && S.drip.emType === 'npc')) out.push(eq('q = k · P<sup>x</sup>, &nbsp; k = q<sub>ref</sub> / P<sub>ref</sub><sup>x</sup>', 'Emitter / nozzle discharge as a function of pressure P (psi).'));
    if (S.systemType === 'drip' && S.drip.emType !== 'npc') out.push(eq('q = q<sub>rated</sub> (constant)', 'Pressure-compensating emitters deliver their rated flow within the operating pressure range.'));
    if (D.net) out.push(`<p>The distribution network is analyzed outlet by outlet. Starting at the distal outlet with the required residual head, the calculation steps back toward the inlet, adding friction loss for the accumulated flow in each pipe segment plus any elevation change, and recomputing each outlet's discharge at its local pressure. Each lateral or line on the manifold is solved for the pressure available at its connection. The manifold inlet head is then adjusted until the <i>most critical</i> outlet in the zone receives exactly the design residual head.</p>`);
    out.push(`<p>TDH = static head + distal residual head + force main losses + indexing valve loss${D.tee ? ` + ${S.systemType === 'spray' ? 'header' : 'manifold'} inlet tee loss` : ''} + distribution network losses + supplemental device losses. Conversion: 1 psi = ${C.FT_PER_PSI} ft of water.</p>`);
    out.push(tbl([['Fitting'], ['K', 'n']], C.FITTINGS.map(x => tr([x.label, [f(n(set.K[x.k]), 2), 'n']]))));
    out.push(kv([
      ['Friction method', set.method === 'DW' ? 'Darcy-Weisbach' : 'Hazen-Williams'],
      ...(n(set.frictionSF) ? [['Safety factor applied to force main losses', f(n(set.frictionSF), 0) + ' %']] : []),
      ['Velocity guideline (force main)', `${f(n(set.vMin), 1)} – ${f(n(set.vMax), 1)} ft/s`]
    ]));
    out.push(`<p class="small">The velocity guideline is a design check, not part of the TDH. The minimum keeps solids from settling in the pipe; the maximum limits surge (water hammer) pressure when the pump starts and stops. Friction loss at the actual velocity is included in the TDH.</p>`);

    // ---------------- 3. distribution
    let sec = 3;
    if (D.net) out.push(distributionSection(S, R, sec++));
    else if (S.systemType === 'discharge') {
      const X = S.discharge, dm = R.model.details;
      if (dm.mode === 'main') {
        out.push(`<h2>${sec++}. Discharge Requirements: Pressurized Sewer Main Tie-In</h2>`);
        out.push(kv([
          ['Sewer main / connection point', esc(X.desc || '—')],
          ['Design discharge flow rate', f(D.Q, 1) + ' gpm'],
          ['Service line at connection', C.pipeLabel(dm.outPipe) + ` (ID ${f(dm.dOut, 3)} in)`],
          ['<b>Maximum main pressure at connection (design)</b>', `<b>${f(dm.pMax, 1)} psi × ${C.FT_PER_PSI} = ${f(dm.hMax, 2)} ft</b>`],
          ['Minimum main pressure at connection', dm.pMin !== null ? `${f(dm.pMin, 1)} psi × ${C.FT_PER_PSI} = ${f(dm.hMin, 2)} ft` : ''],
          ['Required pump shutoff head = static head + maximum main pressure head', `${f(R.minShutoff, 2)} ft (exceed with margin)`]
        ]));
        out.push(`<p class="small">The pump discharges against the main's hydraulic grade line at the connection, so the design is based on the main's maximum operating pressure. ${dm.pMin !== null ? 'A second system curve at the minimum main pressure is used to check the pump operating point at reduced main pressure (runout). ' : ''}Static head is measured to the connection point or to any higher point on the service line. Provide redundant check valves and an isolation valve at the connection, per the sewer authority's requirements.</p>`);
      } else {
        out.push(`<h2>${sec++}. Discharge Requirements: Open Outfall</h2>`);
        out.push(kv([
          ['Receiving ditch / outfall location', esc(X.desc || '—')],
          ['Design discharge flow rate', f(D.Q, 1) + ' gpm'],
          ['Outlet pipe', C.pipeLabel(dm.outPipe) + ` (ID ${f(dm.dOut, 3)} in)`],
          ['Outlet velocity v = 0.4085 · Q / d²', `0.4085 × ${f(D.Q, 2)} / ${f(dm.dOut, 3)}² = ${f(dm.vOut, 2)} ft/s`],
          ['Exit loss = K · v² / 2g', `${f(dm.K, 2)} × ${f(dm.vOut, 2)}² / (2 × ${C.G}) = ${f(dm.hExit, 3)} ft`],
          ['Tailwater depth above outlet (design high water)', f(dm.tw, 2) + ' ft'],
          ['<b>Head required at outlet = tailwater + exit loss</b>', `<b>${f(D.hNet, 3)} ft</b>`]
        ]));
        out.push(`<p class="small">Static head is measured to the outlet invert or to any higher point on the line. Discharge to surface water is subject to the NPDES / state discharge permit limits for flow and effluent quality.${dm.tw > 0 ? ' The outlet is submerged at design high water, so provide a check valve or flap gate to prevent backflow.' : ''}</p>`);
      }
    } else {
      const o = S.systemType === 'gravity' ? S.gravity : S.other;
      out.push(`<h2>${sec++}. Discharge Requirements</h2>`);
      out.push(kv([['Discharge point / device', esc(o.desc || '—')], ['Design flow rate', f(D.Q, 1) + ' gpm'], ['Required residual head', `${f(n(o.resid), 2)} ${o.unit} = ${f(D.hNet, 2)} ft`]]));
    }

    // ---------------- 4. transport
    out.push(`<h2>${sec++}. Pump Discharge &amp; Force Main</h2>`);
    scs.forEach(s => {
      if (two) out.push(`<h3>${s.label} condition: Q = ${f(s.Q, 2)} gpm</h3>`);
      const rows = s.segs.map(g => tr([g.label, C.pipeLabel(g.pipe), [f(g.d, 3), 'n'], [f(g.L, 1), 'n'], [f(g.Q, 2), 'n'], [f(g.v, 2), 'n'], [f(g.hf, 2), 'n'], [f(g.sumK, 2), 'n'], [f(g.hm, 2), 'n'], [f(g.total, 2), 'n']]));
      rows.push(tr(['Total', '', '', '', '', '', '', '', '', [f(s.segTotal, 2), 'n']], 'tot'));
      out.push(tbl([['Segment'], ['Pipe'], ['ID (in)', 'n'], ['L (ft)', 'n'], ['Q (gpm)', 'n'], ['v (ft/s)', 'n'], ['h<sub>f</sub> (ft)', 'n'], ['ΣK', 'n'], ['h<sub>m</sub> (ft)', 'n'], ['Total (ft)', 'n']], rows));
      if (s.sf) out.push(`<p class="small">Totals include a ${s.sf}% safety factor: total = (h<sub>f</sub> + h<sub>m</sub>) × ${f(1 + s.sf / 100, 2)}.</p>`);
    });
    const fitRows = [];
    D.segs.forEach(g => g.fits.forEach(x => fitRows.push(tr([g.label, x.label, [x.n, 'n'], [f(x.K, 2), 'n'], [f(x.n * x.K, 2), 'n']]))));
    if (fitRows.length) out.push(`<h3>Fittings</h3>` + tbl([['Segment'], ['Fitting'], ['Qty', 'n'], ['K', 'n'], ['Qty × K', 'n']], fitRows));
    const g0 = D.segs.find(g => g.L > 0);
    if (g0) {
      out.push(`<h3>Sample calculation: ${g0.label.toLowerCase()} at Q = ${f(g0.Q, 2)} gpm</h3>`);
      out.push(eq(`v = 0.4085 × ${f(g0.Q, 2)} / ${f(g0.d, 3)}² = <b>${f(g0.v, 2)} ft/s</b>`));
      if (set.method !== 'DW') out.push(eq(`h<sub>f</sub> = ${C.HW_K.toFixed(2)} × ${f(g0.L, 1)} × ${f(g0.Q, 2)}<sup>1.852</sup> / (${set.cPVC}<sup>1.852</sup> × ${f(g0.d, 3)}<sup>4.8704</sup>) = <b>${f(g0.hf, 2)} ft</b>`));
      else out.push(eq(`h<sub>f</sub> = f · (${f(g0.L, 1)} / ${f(g0.d / 12, 4)}) · ${f(g0.v, 2)}² / (2 × ${C.G}) = <b>${f(g0.hf, 2)} ft</b>`));
      out.push(eq(`h<sub>m</sub> = ${f(g0.sumK, 2)} × ${f(g0.v, 2)}² / (2 × ${C.G}) = <b>${f(g0.hm, 2)} ft</b>`));
    }

    // ---------------- 5. valve & add-ons
    if (S.valve.use || D.addons.length) {
      const title = [S.valve.use ? 'Indexing Valve' : '', D.addons.length ? 'Supplemental Device' : ''].filter(Boolean).join(' &amp; ') + ' Losses';
      out.push(`<h2>${sec++}. ${title}</h2>`);
      const rows = [];
      scs.forEach(s => {
        if (S.valve.use) rows.push(tr([(two ? s.label + ': ' : '') + 'Indexing valve' + (S.valve.model ? ' (' + esc(S.valve.model) + ')' : ''), `${f(n(S.valve.loss), 2)} ${S.valve.unit} at ${f(s.valveQRef, 1)} gpm`, [f(s.Q, 2), 'n'], [f(s.valveScale, 3), 'n'], [f(s.valveLoss, 2), 'n']]));
        s.addons.forEach(a => rows.push(tr([(two ? s.label + ': ' : '') + esc(a.label), `${f(a.val, 2)} ${a.unit} at ${f(a.qRef, 1)} gpm`, [f(s.Q, 2), 'n'], [f(a.scale, 3), 'n'], [f(a.ft, 2), 'n']])));
      });
      out.push(tbl([['Item'], ['Entered loss'], ['Q (gpm)', 'n'], ['(Q/Q<sub>ref</sub>)²', 'n'], ['Loss (ft)', 'n']], rows));
      out.push(`<p class="small">${S.valve.use ? `The valve serves ${n(S.valve.zones)} zones, and one zone is dosed at a time. ` : ''}Each loss is entered at a reference flow Q<sub>ref</sub> and scaled by (Q/Q<sub>ref</sub>)² at other flows.</p>`);
    }

    // ---------------- 6. TDH
    out.push(`<h2>${sec++}. Total Dynamic Head</h2>`);
    const resid = s => s.net ? (s.flush ? s.flush.hEnd : R.model.hEnd) : s.hNet;
    // One list of components drives both the table and the equation, so they always match line for line.
    const comps = [];
    const comp = (label, tag, fn) => comps.push({ label, tag, fn });
    comp(`Static head (pump-off level to ${C.staticRef(S)})`, 'static', s => s.lift);
    comp(D.net ? 'Distal residual head' : S.systemType === 'discharge' ? (R.model.details.mode === 'main' ? 'Sewer main pressure at connection (maximum)' : 'Outlet: tailwater + exit loss') : 'Residual head at discharge',
      D.net ? 'residual' : S.systemType === 'discharge' ? (R.model.details.mode === 'main' ? 'main pressure' : 'outlet') : 'residual', resid);
    comp('Force main losses (pipe + fittings)', 'force main', s => s.segTotal);
    if (S.valve.use) comp('Indexing valve loss', 'valve', s => s.valveLoss);
    if (D.tee) comp(`${S.systemType === 'spray' ? 'Header' : 'Manifold'} inlet tee (K = ${f(D.tee.K, 1)})`, 'inlet tee', s => s.teeLoss);
    if (D.net) {
      comp('Manifold friction loss', 'manifold', s => s.net.manLoss);
      comp('Lateral friction loss (critical lateral)', 'lateral', s => s.net.critical.latLoss);
      const bal = s => s.hNet - resid(s) - s.net.manLoss - s.net.critical.latLoss;
      // shown only when the field is not level (elevation differences between the inlet and the critical outlet)
      if (scs.some(s => Math.abs(bal(s)) >= 0.005)) comp('Field elevation (inlet to critical outlet)', 'field elev.', bal);
    }
    if (D.addons.length) comp('Supplemental device losses', 'devices', s => s.addonTotal);
    const tdhRows = comps.map(c => tr([c.label, ...scs.map(s => [f(c.fn(s), 2), 'n'])]));
    tdhRows.push(tr(['<b>Total dynamic head (ft)</b>', ...scs.map(s => [`<b>${f(s.TDH, 2)}</b>`, 'n'])], 'tot'));
    tdhRows.push(tr(['Total dynamic head (psi)', ...scs.map(s => [f(s.TDH / C.FT_PER_PSI, 2), 'n'])]));
    tdhRows.push(tr(['<b>Flow rate (gpm)</b>', ...scs.map(s => [`<b>${f(s.Q, 2)}</b>`, 'n'])], 'tot'));
    out.push(tbl([['Component'], ...scs.map(s => [s.label + ' (ft)', 'n'])], tdhRows));
    scs.forEach(s => {
      const terms = comps.map((c, i) => { const v = c.fn(s); return `${i ? (v < 0 ? ' − ' : ' + ') : ''}${f(i ? Math.abs(v) : v, 2)} <span class="w">(${c.tag})</span>`; }).join('');
      out.push(eq(`TDH = ${terms} = <b>${f(s.TDH, 2)} ft</b>`, two ? `${s.label} condition` : ''));
    });

    // ---------------- 7. volumes & dosing
    out.push(`<h2>${sec++}. Pipe Volumes &amp; Dosing</h2>`);
    out.push(eq('V = 0.0408 · d² · L', 'Pipe volume (gal), with d = inside diameter (in) and L = length (ft).'));
    const V = R.volumes;
    const I = V.items;
    const vr = (label, it) => tr([label, it ? esc(it.pipe) : '—', [it ? f(it.d, 3) : '—', 'n'], [it ? (it.count > 1 ? `${it.count} × ${f(it.lenEach, 1)}` : f(it.lenEach, 1)) : '—', 'n'], [it ? f(it.L, 1) : '0.0', 'n'], [it ? f(it.gpf, 4) : '—', 'n'], [f(it ? it.vol : 0, 2), 'n']]);
    const vt = (label, v) => tr([`<b>${label}</b>`, '', '', '', '', '', [`<b>${f(v, 2)}</b>`, 'n']], 'tot');
    out.push(tbl([['Component'], ['Pipe'], ['ID (in)', 'n'], ['Runs × length (ft)', 'n'], ['Total L (ft)', 'n'], ['gal/ft', 'n'], ['Volume (gal)', 'n']], [
      vr('Discharge assembly', I.discharge),
      vr('Force main' + (S.valve.use ? ' (pump to valve)' : ''), I.before),
      vt('Total, pump to valve', V.beforeValve),
      ...(S.valve.use ? [vr('Zone force main (valve to manifold)', I.after)] : []),
      ...(I.manifold ? [vr(esc(I.manifold.label), I.manifold)] : []),
      ...(I.laterals ? [vr(esc(I.laterals.label) + (S.systemType === 'spray' ? '' : ' (per zone)'), I.laterals)] : []),
      vt('Total, valve to laterals', V.afterValve)
    ]));
    const sv = I.before || I.discharge;
    if (sv) out.push(eq(`Example: ${sv.label.toLowerCase()}: gal/ft = 0.0408 × ${f(sv.d, 3)}² = ${f(sv.gpf, 4)}; &nbsp; V = ${f(sv.gpf, 4)} × ${f(sv.L, 1)} = <b>${f(sv.vol, 2)} gal</b>`));
    const ds = R.dose;
    const minRow = ds.minDose !== null ? [[`Minimum dose = ${ds.minMult} × lateral volume`, f(ds.minDose, 1) + ' gal']] : [];
    if (ds.valid && ds.mode === 'demand') {
      out.push(`<h3>Dosing method: demand dosing (float controlled)</h3>`);
      out.push(`<p class="small">Drawdown height and volume are based on the selected pump tank specifications and the float elevations set in that tank.</p>`);
      out.push(kv([
        ['Design daily flow', f(ds.gpd, 0) + ' gpd'],
        ['Drawdown height, pump-on to pump-off float', ds.drawdown !== null ? f(ds.drawdown, 2) + ' in' : ''],
        ['Drawdown volume (from the tank manufacturer\'s chart) = gross volume pumped per dose', f(ds.grossDose, 1) + ' gal'],
        ['Drainback volume (pump to valve)', f(ds.drainback, 1) + ' gal'],
        ['<b>Net dose delivered per zone = gross − drainback</b>', `<b>${f(ds.netDose, 1)} gal</b>`],
        ...minRow,
        ['Doses per day at design flow = gpd / net dose', f(ds.totalDoses, 2)],
        ...(ds.zones > 1 ? [[`Doses per zone per day (${ds.zones} zones)`, f(ds.perDay, 2)]] : []),
        ['Pump run time per dose = gross volume / Q', f(ds.runMin, 2) + ' min'],
        ['Total pump run time per day', f(ds.dailyRunMin, 0) + ' min']
      ]));
    } else if (ds.valid) {
      out.push(`<h3>Dosing method: timed dosing (timer controlled)</h3>`);
      out.push(kv([
        ['Design daily flow', f(ds.gpd, 0) + ' gpd'],
        ['Zones × doses per zone per day', `${ds.zones} × ${f(ds.perDay, 1)} = ${f(ds.totalDoses, 0)} doses/day`],
        ['Net dose per zone = gpd / doses per day', f(ds.netDose, 1) + ' gal'],
        ...minRow,
        ['Drainback volume (pump to valve)', f(ds.drainback, 1) + ' gal'],
        ['Gross volume pumped per dose', f(ds.grossDose, 1) + ' gal'],
        ['<b>Timer ON = gross volume / Q</b>', `<b>${f(ds.runMin, 2)} min</b>`],
        ['<b>Timer OFF = 1440 / doses per day − ON</b>', `<b>${f(ds.offMin, 2)} min</b>`],
        ['Total pump run time per day', f(ds.dailyRunMin, 0) + ' min'],
        ...(ds.tankDrawdown !== null ? [[`Tank drawdown per dose = gross volume / ${f(ds.galPerIn, 1)} gal/in (tank manufacturer's chart)`, f(ds.tankDrawdown, 2) + ' in']] : [])
      ]));
      out.push(`<p class="small">Timer settings are based on the design daily flow at the design pump flow rate. Verify the actual pump delivery at startup and adjust the ON time to deliver the design dose.</p>`);
    } else if (ds.mode === 'demand') {
      // Floats not yet set: document the requirement without assuming tank geometry
      out.push(`<h3>Dosing method: demand dosing (float controlled)</h3>`);
      out.push(`<p class="small">Drawdown height and volume are based on the selected pump tank specifications and the float elevations set in that tank.</p>`);
      out.push(kv([
        ['Design daily flow', ds.gpd > 0 ? f(ds.gpd, 0) + ' gpd' : 'Not entered'],
        ['Drawdown height, pump-on to pump-off float', ds.drawdown !== null ? f(ds.drawdown, 2) + ' in' : ''],
        ['Drawdown volume (from the tank manufacturer\'s chart)', 'Not entered'],
        ['Drainback volume (pump to valve)', f(ds.drainback, 1) + ' gal'],
        ...minRow,
        ...(ds.minGross !== null ? [['<b>Minimum drawdown volume = minimum dose + drainback</b>', `<b>${f(ds.minGross, 1)} gal</b>`]] : [])
      ]));
      out.push(`<p class="small">The float settings depend on the pump tank's size and shape. Set the pump-on and pump-off floats from the tank manufacturer's chart${ds.minGross !== null ? ' so the drawdown volume is at least the minimum shown above' : ''}.</p>`);
    }

    // ---------------- 8. system curve
    out.push(`<h2>${sec++}. System Curve${pumps.length ? ' &amp; Pump Selection' : ''}</h2>`);
    if (chartData) out.push(`<div class="chart avoid">${root.Chart.render(Object.assign({ width: 720, height: 430 }, chartData))}</div>`);
    out.push(`<p class="small">Legend: blue = system curve${R.curveMin ? ' at maximum main pressure; dashed blue = system curve at minimum main pressure' : ''}; red circle = design point${pumps.length ? '; colored lines = pump curves; green circles = operating points' : ''}. ${R.model && R.model.variable ? 'The system curve was generated by re-solving the distribution network at a range of distal heads.' : R.model && R.model.kind === 'discharge' ? 'The system curve was calculated directly at each flow, including force main friction, fittings and the outlet requirement.' : 'The system curve assumes a constant residual requirement, with friction losses varying with Q<sup>1.852</sup>.'}</p>`);
    const cpts = R.curve.filter(p => p.Q <= G.Q * 2.5);
    out.push(tbl([['Q (gpm)', 'n'], ...cpts.slice(0, 1).map(() => ['TDH (ft)', 'n'])], cpts.map(p => tr([[f(p.Q, 1), 'n'], [f(p.H, 1), 'n']]))).replace('<table', '<table style="width:auto;min-width:40%"'));

    // ---------------- 9. checks
    out.push(`<h2>${sec++}. Design Checks</h2>`);
    if (R.checks.length) out.push(`<ul>${R.checks.map(c => `<li><span class="chk-${c.level}">${c.level === 'ok' ? 'OK' : c.level === 'warn' ? 'CAUTION' : 'NOTE'}:</span> ${esc(c.text)}</li>`).join('')}</ul>`);
    else out.push('<p>No cautions.</p>');

    // ---------------- 10. notes
    out.push(`<h2>${sec++}. Notes &amp; Assumptions</h2><ul class="small">
      <li>Water at 60 °F. Effluent is assumed to have the hydraulic properties of clean water.</li>
      <li>Static head is measured from the pump-off liquid level to the ${C.staticRef(S)}.${D.net ? ' Elevation changes within the dispersal area (along laterals and between laterals) are included in the distribution network analysis, not in the static head.' : ''} If the force main crosses a point higher than this, the static head must be taken to that point.</li>
      <li>Pipe inside diameters are nominal average values for the pipe class shown. Verify them against the manufacturer's data for the pipe being installed.</li>
      <li>Distribution outlets are assumed to be evenly spaced, with the last outlet at the distal end of each lateral.</li>
      ${minorLossNote(S, R)}
      <li>Manufacturer data (pump curves, valve and filter losses, emitter or nozzle ratings) must be verified for the specific products installed.</li>
      <li>This report documents the hydraulic calculations only. Comply with all applicable local and state regulations for system sizing, setbacks, and component requirements.</li></ul>`);
    if (info.notes) out.push(`<h3>Project notes</h3><p style="white-space:pre-wrap">${esc(info.notes)}</p>`);
    out.push(`<div class="sig"><div>Prepared by${info.designer ? ': ' + esc(info.designer) : ''}</div><div>Date</div></div>`);
    out.push(stamp());
    out.push(`</div>`);
    return out.join('');
  }

  /** Identifies the calculator release, so a printed report can be traced to the code that produced it. */
  function stamp() {
    const d = new Date(), pad = x => String(x).padStart(2, '0');
    const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `<div class="stamp">Calculated with the Hydro-Action TDH &amp; Flow Calculator, version ${esc(C.VERSION)} (released ${esc(C.RELEASE_DATE)}). Report generated ${now}.</div>`;
  }

  /** Documents that minor losses inside the distribution network are neglected, with the inlet velocity as justification. */
  function minorLossNote(S, R) {
    const t = S.systemType;
    if (!R.design.net) return '';
    const parts = t === 'spray' ? 'within the header, at line connections, and at head risers' : t === 'drip' ? 'within the supply manifold and at dripline connections' : 'within the manifold and at lateral connections';
    const m = t === 'spray' ? 'header' : 'manifold';
    const teeTxt = R.design.tee ? ` A tee at the ${m} inlet (flow through branch, K = ${f(R.design.tee.K, 1)}) is included at the ${m} inlet velocity.` : '';
    return `<li>Fittings up to the ${m} inlet are included with the force main fittings.${teeTxt} Minor (fitting) losses ${parts} are small compared with the residual head and pipe friction and are not included.</li>`;
  }

  function distributionSection(S, R, sec) {
    const out = [];
    const t = S.systemType, D = R.design, m = R.model, det = m.details, net = D.net;
    out.push(`<h2>${sec}. Distribution Network</h2>`);
    if (t === 'lpd') {
      const L = S.lpd;
      out.push(kv([
        ['Laterals per zone', det.nLat + (det.both ? ' (both sides of manifold, ' + det.nConn + ' connections)' : ' (one side of manifold)')],
        ['Lateral length / pipe', `${f(n(L.latLen), 1)} ft, ${C.pipeLabel(L.latPipe)} (ID ${f(det.dLat, 3)} in)`],
        ['Orifice size / spacing', `${C.orificeLabel(det.orifD)} at ${f(n(L.spacing), 2)} ft`],
        ['Orifices per lateral / per zone', `${det.geo.n} / ${det.geo.n * det.nLat}`],
        ['Distance from lateral inlet to first orifice', f(det.geo.firstLen, 2) + ' ft'],
        ['Discharge coefficient C<sub>d</sub>', f(det.cd, 2)],
        ['Design distal residual head (last orifice)', f(m.hEnd, 2) + ' ft'],
        ['Elevation change along lateral', f(n(L.latDz), 2) + ' ft'],
        ['Manifold', det.nConn > 1 ? `${f(det.manLen, 1)} ft, ${C.pipeLabel(L.manPipe)} (ID ${f(det.dMan, 3)} in), ${L.manFeed === 'center' ? 'center' : 'end'}-fed, ${f(m.spec.connSpacing, 2)} ft between connections` : 'Single lateral (no manifold)'],
        ['Elevation step between lateral connections', f(n(L.connDz), 2) + ' ft']
      ]));
      const q = net.critical.qDistal;
      out.push(`<h3>Orifice discharge at the critical (last) orifice</h3>`);
      out.push(eq(`q = ${C.ORIF_K.toFixed(2)} × ${f(det.cd, 2)} × ${f(det.orifD, 4)}² × √${f(net.critical.hEnd, 2)} = <b>${f(q, 3)} gpm</b>`));
    } else if (t === 'drip') {
      const Dr = S.drip;
      out.push(kv([
        ['Dripline laterals per zone', det.nLat],
        ['Lateral length / dripline ID', `${f(n(Dr.latLen), 1)} ft / ${f(det.dLat, 3)} in (C = ${Dr.latC})`],
        ['Emitter', `${Dr.emType === 'npc' ? 'Non-pressure compensating' : 'Pressure compensating'}, ${f(n(Dr.emQ), 2)} gph${Dr.emType === 'npc' ? ` at ${Dr.emPref} psi, x = ${Dr.emX}` : ''}, ${f(n(Dr.emSpacing), 1)} in spacing`],
        ['Emitters per lateral / per zone', `${det.geo.n} / ${det.geo.n * det.nLat}`],
        ['Minimum / maximum emitter pressure', `${f(n(Dr.minP), 1)} / ${f(n(Dr.maxP), 1)} psi`],
        ['Supply manifold', det.nLat > 1 ? `${f(det.manLen, 1)} ft, ${C.pipeLabel(Dr.manPipe)} (ID ${f(det.dMan, 3)} in), ${Dr.manFeed}-fed` : 'Single lateral'],
        ['Elevation change along lateral / between laterals', `${f(n(Dr.latDz), 2)} ft / ${f(n(Dr.connDz), 2)} ft`]
      ]));
      out.push(eq(`Zone dosing flow = Σ emitter flows = ${det.geo.n * det.nLat} emitters × ${f(net.qMin * 60, 3)}${net.qMax - net.qMin > 1e-6 ? '–' + f(net.qMax * 60, 3) : ''} gph ÷ 60 = <b>${f(D.Q, 2)} gpm</b>`));
    } else {
      const Sp = S.spray;
      out.push(kv([
        ['Spray heads per line / lines per zone', `${det.n} / ${det.nConn}`],
        ['Head rating', `${f(det.ratedQ, 2)} gpm at ${f(det.ratedP, 1)} psi, x = ${det.x}`],
        ['Minimum pressure at last head', `${f(n(Sp.reqP), 1)} psi = ${f(m.hEnd, 2)} ft`],
        ['Distribution line', `${C.pipeLabel(Sp.linePipe)} (ID ${f(det.dLine, 3)} in), ${f(n(Sp.firstLen), 1)} ft to first head, heads at ${f(n(Sp.spacing), 1)} ft`],
        ['Elevation change along line', f(n(Sp.latDz), 2) + ' ft']
      ]));
      const k = det.ratedQ / Math.pow(det.ratedP, det.x);
      out.push(eq(`k = ${f(det.ratedQ, 2)} / ${f(det.ratedP, 1)}<sup>${det.x}</sup> = ${f(k, 4)}; &nbsp; q<sub>last</sub> = ${f(k, 4)} × ${f(net.critical.hEnd / C.FT_PER_PSI, 2)}<sup>${det.x}</sup> = <b>${f(net.critical.qDistal, 3)} gpm</b>`));
    }

    R.scenarios.forEach(s => {
      const nn = s.net;
      out.push(`<h3>${R.scenarios.length > 1 ? s.label + ': ' : ''}${t === 'spray' ? 'Distribution line' : 'Lateral'} results by manifold connection</h3>`);
      const unit = t === 'lpd' ? 'ft' : 'psi';
      const cv = h => t === 'lpd' ? h : h / C.FT_PER_PSI;
      const rows = nn.conns.map(c => tr([[c.k, 'n'], [f(c.z, 2), 'n'], [f(cv(c.hIn), 2), 'n'], [f(cv(c.hEnd), 2), 'n'], [f(c.latLoss, 2), 'n'], [f(c.qRun, 3), 'n'], [f(c.qConn, 3), 'n']], c === nn.critical ? 'tot' : ''));
      out.push(tbl([['Conn.', 'n'], ['Rel. elev. (ft)', 'n'], [`Inlet head (${unit})`, 'n'], [`Distal head (${unit})`, 'n'], ['Friction (ft)', 'n'], ['Flow per run (gpm)', 'n'], ['Flow at conn. (gpm)', 'n']], rows));
      out.push(kv([
        ['Number of connections analyzed' + (nn.mult > 1 ? ' (one half of center-fed manifold)' : ''), nn.nCalc],
        ['Manifold friction loss', f(nn.manLoss, 2) + ' ft'],
        ...(s.manInlet ? [[`Manifold inlet velocity${s.manInlet.center ? ' (each half)' : ''} = 0.4085 × ${f(s.manInlet.Q, 2)} / ${f(s.manInlet.d, 3)}²`, `${f(s.manInlet.v, 2)} ft/s (v²/2g = ${f(s.manInlet.hv, 3)} ft)`],
          [`Manifold inlet tee loss = K × v²/2g = ${f(s.tee.K, 1)} × ${f(s.tee.hv, 3)}`, f(s.teeLoss, 2) + ' ft']] : []),
        ['Head required at manifold inlet', `${f(s.hNet, 2)} ft (${f(s.hNet / C.FT_PER_PSI, 2)} psi)`],
        ['Outlet flow: minimum / maximum', `${f(nn.qMin, 4)} / ${f(nn.qMax, 4)} gpm`],
        ['Flow variation = (q<sub>max</sub> − q<sub>min</sub>) / q<sub>max</sub>', f(nn.variation, 2) + ' %'],
        ['<b>Total zone flow</b>', `<b>${f(s.Q, 2)} gpm</b>`]
      ]));
    });

    if (R.flush) {
      const fl = R.flush;
      out.push(`<h3>Field flushing</h3>`);
      out.push(eq(`q<sub>flush</sub> = v · d² / 0.4085 = ${f(fl.vF, 2)} × ${f(det.dLat, 3)}² / 0.4085 = <b>${f(fl.qFlush, 3)} gpm per lateral</b>; return flow = ${det.nLat} × ${f(fl.qFlush, 3)} = <b>${f(fl.Qret, 2)} gpm</b>`));
      out.push(kv([
        ['Return manifold friction', f(fl.retManLoss, 2) + ' ft'],
        ['Return line friction (' + C.pipeLabel(S.drip.retPipe) + ', ' + f(n(S.drip.retLen), 0) + ' ft, v = ' + f(fl.vRet, 2) + ' ft/s)', f(fl.retHf, 2) + ' ft'],
        ['Return line fittings (ΣK = ' + f(n(S.drip.retK), 2) + ')', f(fl.retHm, 2) + ' ft'],
        ['Return discharge elevation relative to lateral ends', f(fl.retDz, 2) + ' ft'],
        ['Head required at lateral ends to drive the return flow', f(fl.required, 2) + ' ft'],
        ['Design distal head while flushing = max(minimum emitter head, return requirement)', `<b>${f(fl.hEnd, 2)} ft (${f(fl.hEnd / C.FT_PER_PSI, 2)} psi)</b>`]
      ]));
    }

    // critical lateral detail
    const rows = net.criticalRows.rows;
    const step = rows.length > 45 ? Math.ceil(rows.length / 30) : 1;
    const shown = rows.filter((r, i) => i % step === 0 || i === rows.length - 1);
    const cv = h => t === 'lpd' ? h : h / C.FT_PER_PSI;
    const unit = t === 'lpd' ? 'ft' : 'psi';
    out.push(`<h3>Outlet-by-outlet analysis: critical ${t === 'spray' ? 'line' : 'lateral'} (connection ${net.critical.k}, ${D.label.toLowerCase()})</h3>`);
    if (step > 1) out.push(`<p class="small">Every ${step}th outlet shown, out of ${rows.length}.</p>`);
    out.push(tbl([['Outlet', 'n'], ['Distance from inlet (ft)', 'n'], [`Pressure head (${unit})`, 'n'], ['Outlet flow (gpm)', 'n'], ['Pipe flow upstream (gpm)', 'n']],
      shown.map(r => tr([[r.i, 'n'], [f(r.x, 2), 'n'], [f(cv(r.h), 3), 'n'], [f(r.q, 4), 'n'], [f(r.Q, 3), 'n']]))));
    return out.join('');
  }

  root.Report = { build };
})(typeof self !== 'undefined' ? self : this);

/* TDH & Flow Calculator - user interface */
(function () {
  'use strict';
  const C = window.Calc;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (x, d = 1) => Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const KEY_CUR = 'tdhcalc.current', KEY_PROJ = 'tdhcalc.projects', KEY_PUMPS = 'tdhcalc.pumps';

  // ------------------------------------------------------------------ state
  const pipe = (nom, cls = 'PVC Sch 40') => ({ cls, nom, id: '' });
  const fit = o => Object.assign({ e90: 0, e45: 0, teeRun: 0, teeBr: 0, valve: 0, check: 0, union: 0 }, o || {});
  function defaultState() {
    const K = {}; C.FITTINGS.forEach(f => { K[f.k] = f.K; });
    return {
      version: 1, id: uid(),
      info: { name: '', name2: '', client: '', location: '', permit: '', designer: '', company: '', date: today(), notes: '' },
      projectType: 'sfr', systemType: 'lpd',
      lift: 5,
      transport: {
        discharge: { pipe: pipe('2'), L: 5, fit: fit({ e90: 2, valve: 1, check: 1, union: 2 }), kOther: 0 },
        before: { pipe: pipe('2'), L: 100, fit: fit({ e90: 2, e45: 2 }), kOther: 0 },
        after: { pipe: pipe('2'), L: 50, fit: fit({ e90: 2 }), kOther: 0 }
      },
      valve: { use: false, model: '', zones: 2, loss: 0, unit: 'ft', q: '' },
      addons: [{ label: 'Flow meter', val: 0, unit: 'ft', q: '' }],
      lpd: { nLat: 4, latLen: 50, latPipe: pipe('1.25'), orifice: '0.1875', spacing: 5, nOverride: 0, hEnd: 5, cd: 0.6, sides: 'one', manLen: 15, manPipe: pipe('1.5'), manFeed: 'end', latDz: 0, connDz: 0, maxVar: 10 },
      drip: { nLat: 6, latLen: 200, latId: 0.55, latC: 140, emType: 'pc', emQ: 0.6, emSpacing: 24, emPref: 15, emX: 0.5, minP: 10, maxP: 45, latDz: 0, manLen: 10, manPipe: pipe('1.5'), manFeed: 'end', connDz: 0, flush: true, flushV: 2, retManLen: 10, retManPipe: pipe('1'), retPipe: pipe('1'), retLen: 100, retK: 3, retDz: -5 },
      spray: { nHeads: 6, ratedQ: 2, ratedP: 30, x: 0.5, reqP: 30, maxP: 60, linePipe: pipe('1'), firstLen: 20, spacing: 30, latDz: 0, nBranches: 1, branchSpacing: 0, manPipe: pipe('1.25'), maxVar: 10 },
      gravity: { desc: 'Distribution box', Q: 20, resid: 2, unit: 'ft' },
      other: { desc: '', Q: 10, resid: 20, unit: 'ft' },
      discharge: { mode: 'outfall', desc: '', Q: 20, tailwater: 0, exitK: 1, pMax: 20, pMin: '' },
      dose: { mode: 'timed', gpd: 480, dosesPerDay: 4, zones: 1, drainback: true, galPerIn: 0, drawdownIn: 4, drawdownGal: 120, minMult: 5 },
      settings: { method: 'HW', cPVC: 150, eps: 0.000005, frictionSF: 0, vMin: 2, vMax: 5, K },
      chart: { selected: [], findQ: '', findH: '', findPct: 0, findCat: '' }
    };
  }
  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    if (base && typeof base === 'object') {
      const out = Object.assign({}, base);
      if (over && typeof over === 'object') Object.keys(over).forEach(k => { out[k] = k in base ? merge(base[k], over[k]) : over[k]; });
      return out;
    }
    return over === undefined ? base : over;
  }

  // Design settings (friction method, C, K-values, velocity guidelines) are fixed at the standard values in
  // defaultState(); they are not user inputs. Values saved in older projects are replaced on load.
  const withState = st => Object.assign(merge(defaultState(), st), { settings: defaultState().settings });
  let S = withState(LS.get(KEY_CUR, {}));
  let R = null;
  let dirty = false;
  let selectedRecent = null;
  let activePump = null;
  let diagOpen = true;
  const openCats = new Set();
  document.addEventListener('toggle', e => {
    if (e.target.id === 'diagDetails') diagOpen = e.target.open;
    if (e.target.classList && e.target.classList.contains('pgroup')) { if (e.target.open) openCats.add(e.target.dataset.cat); else openCats.delete(e.target.dataset.cat); }
  }, true);
  let findResult = null;

  // Pump library = built-in pumps (js/pump-data.js, read-only) + pumps the user adds (saved in this browser).
  const CATS = (window.PumpData && PumpData.PUMP_CATEGORIES) || [{ id: 'other', label: 'Other / uncategorized' }];
  const BUILTIN = ((window.PumpData && PumpData.BUILTIN_PUMPS) || []).map(p => Object.assign({}, p));
  // The old placeholder sample pumps are dropped from saved libraries.
  let USER = (LS.get(KEY_PUMPS, []) || []).filter(p => p && p.id !== 'sample1' && p.id !== 'sample2' && !p.builtin);
  const allPumps = () => BUILTIN.concat(USER);
  const catOf = p => CATS.some(c => c.id === p.category) ? p.category : 'other';
  const catLabel = id => (CATS.find(c => c.id === id) || { label: 'Other / uncategorized' }).label;
  const saveUser = () => LS.set(KEY_PUMPS, USER);

  const getP = (path, obj = S) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function setP(path, val, obj = S) {
    const ks = path.split('.'); let o = obj;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }

  // ------------------------------------------------------------------ form helpers
  const unitTag = u => u ? `<span class="unit">${u}</span>` : '';
  const helpTag = h => h ? `<div class="help">${h}</div>` : '';
  function fNum(path, label, unit, o = {}) {
    const v = getP(path);
    return `<div class="frow"><label>${label}</label><div class="inp"><input type="number" step="any" data-path="${path}" data-type="num" value="${esc(v)}" ${o.min !== undefined ? `min="${o.min}"` : ''}>${unitTag(unit)}</div>${helpTag(o.help)}</div>`;
  }
  function fText(path, label, o = {}) {
    return `<div class="frow ${o.wide ? 'wide' : ''}"><label>${label}</label><div class="inp plain"><input type="${o.type || 'text'}" data-path="${path}" value="${esc(getP(path))}" placeholder="${esc(o.ph || '')}"></div>${helpTag(o.help)}</div>`;
  }
  function fSel(path, label, options, o = {}) {
    const v = String(getP(path));
    const opts = options.map(([val, lab]) => `<option value="${esc(val)}" ${String(val) === v ? 'selected' : ''}>${esc(lab)}</option>`).join('');
    return `<div class="frow ${o.wide ? 'wide' : ''}"><label>${label}</label><div class="inp"><select data-path="${path}" ${o.rerender ? 'data-rerender="1"' : ''}>${opts}</select>${unitTag(o.unit)}</div>${helpTag(o.help)}</div>`;
  }
  function fChk(path, label, o = {}) {
    return `<label class="chk"><input type="checkbox" data-path="${path}" ${getP(path) ? 'checked' : ''} ${o.rerender ? 'data-rerender="1"' : ''}> ${label}</label>${o.help ? `<div class="help" style="font-size:12px;color:var(--faint);margin:-4px 0 4px 24px">${o.help}</div>` : ''}`;
  }
  function fUnitNum(path, unitPath, label, o = {}) {
    const u = getP(unitPath);
    return `<div class="frow"><label>${label}</label><div class="inp"><input type="number" step="any" data-path="${path}" data-type="num" value="${esc(getP(path))}"><select data-path="${unitPath}" style="width:auto;border-left:1px solid var(--border);background:var(--surface-2)"><option ${u === 'ft' ? 'selected' : ''} value="ft">ft</option><option ${u === 'psi' ? 'selected' : ''} value="psi">psi</option></select></div>${helpTag(o.help)}</div>`;
  }
  function fPipe(path, label) {
    const p = getP(path) || {};
    const custom = p.cls === 'Custom ID';
    const table = C.PIPE_ID[p.cls] || {};
    let idTxt = '';
    try { idTxt = `ID ${C.pipeId(p, label).toFixed(3)} in`; } catch (e) { idTxt = `<span style="color:var(--bad)">${esc(e.message.split(': ').pop())}</span>`; }
    const nomOpts = C.NOMINALS.map(([v, l]) => `<option value="${v}" ${String(p.nom) === v ? 'selected' : ''} ${!custom && !table[v] ? 'disabled' : ''}>${l}</option>`).join('');
    const clsOpts = C.PIPE_CLASSES.map(c => `<option ${c === p.cls ? 'selected' : ''}>${c}</option>`).join('');
    return `<div class="frow pipe"><label>${label} <span class="pipe-id">· ${idTxt}</span></label>
      <div class="pipe-sel">
        <div class="inp"><select data-path="${path}.cls" data-rerender="1">${clsOpts}</select></div>
        <div class="inp ${custom ? 'disabled' : ''}"><select data-path="${path}.nom" data-rerender="1" ${custom ? 'disabled' : ''}>${nomOpts}</select></div>
        <div class="inp ${custom ? '' : 'disabled'}"><input type="number" step="any" data-path="${path}.id" data-type="num" data-rerender="1" placeholder="ID" value="${esc(p.id)}" ${custom ? '' : 'disabled'}><span class="unit">in</span></div>
      </div></div>`;
  }
  function fFittings(path) {
    const seg = getP(path);
    const count = C.FITTINGS.reduce((t, f) => t + (+seg.fit[f.k] || 0), 0);
    const rows = C.FITTINGS.map(f => `<div class="frow"><label>${f.label}</label><div class="inp sm"><input type="number" step="1" min="0" data-path="${path}.fit.${f.k}" data-type="num" value="${esc(seg.fit[f.k])}"></div></div>`).join('');
    return `<details class="fit"><summary>Fittings &amp; valves (${count} fitting${count === 1 ? '' : 's'}${+seg.kOther ? ', ΣK other ' + seg.kOther : ''})</summary>
      <div class="fitgrid">${rows}<div class="frow"><label>Other ΣK</label><div class="inp sm"><input type="number" step="any" data-path="${path}.kOther" data-type="num" value="${esc(seg.kOther)}"></div></div></div></details>`;
  }
  const card = (title, body, extra = '') => `<div class="card"><div class="card-h">${title}<span class="spacer"></span>${extra}</div><div class="card-b">${body}</div></div>`;
  const sub = t => `<div class="sub">${t}</div>`;

  // ------------------------------------------------------------------ START page
  const SYS_DESC = {
    lpd: 'Orifices in pressurized laterals (LPD/LPP, pressure-dosed mounds, sand filters).',
    drip: 'Subsurface drip tubing with PC or non-PC emitters, including field flushing.',
    spray: 'Spray heads or rotors on a distribution line (surface application).',
    gravity: 'Pump to a distribution box, gravity trench, or tank (non-pressurized).',
    discharge: 'Open outfall to a ditch or surface water, or a tie-in to a pressurized sewer main (pretreatment).',
    other: 'Any device with a known flow and required pressure (packaged systems, etc.).'
  };
  function renderStart() {
    const projs = LS.get(KEY_PROJ, {});
    const list = Object.values(projs).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
    const rows = list.map(p => `<tr data-id="${esc(p.state.id)}" class="${selectedRecent === p.state.id ? 'sel' : ''}"><td>${esc(p.name || 'Untitled')}</td><td>${esc(C.SYSTEM_TYPES[p.state.systemType] ? p.state.systemType.toUpperCase() : '')}</td><td>${esc(new Date(p.savedAt).toLocaleString())}</td><td style="width:30px"><button class="linkbtn" data-del="${esc(p.state.id)}" title="Remove from list">✕</button></td></tr>`).join('');
    const ptypes = Object.entries(C.PROJECT_TYPES).map(([k, l]) => `<label class="opt ${S.projectType === k ? 'on' : ''}"><input type="radio" name="ptype" data-path="projectType" value="${k}" data-rerender="1" ${S.projectType === k ? 'checked' : ''}><div><b>${l}</b></div></label>`).join('');
    const stypes = Object.entries(C.SYSTEM_TYPES).map(([k, l]) => `<label class="opt ${S.systemType === k ? 'on' : ''}"><input type="radio" name="stype" data-path="systemType" value="${k}" data-rerender="1" ${S.systemType === k ? 'checked' : ''}><div><b>${l}</b><span>${SYS_DESC[k]}</span></div></label>`).join('');
    $('#page-start').innerHTML = `
      <div class="grid-start">
        <div>
          ${card('Hydro-Action TDH &amp; Flow Calculator', `
            <p style="margin:0 0 10px;line-height:1.5">Calculates the design flow rate and total dynamic head (TDH) for a pump dosing a wastewater dispersal system, and produces a calculation report. Units are US customary (gpm, ft, psi, in).</p>
            <table class="pspec about">
              <tr><td>System types</td><td>Low pressure distribution; drip (dosing and flushing); spray; non-pressurized; discharge to an outfall or pressurized sewer main; other pressurized device</td></tr>
              <tr><td>Distribution network</td><td>Outlet-by-outlet calculation of each lateral and the manifold, including elevation differences</td></tr>
              <tr><td>Friction loss</td><td>Hazen-Williams or Darcy-Weisbach; fittings by K-value</td></tr>
              <tr><td>Pipe</td><td>PVC Sch 40, Sch 80, SDR 21, SDR 26, or an entered inside diameter</td></tr>
              <tr><td>Dosing</td><td>Timed or demand; pipe volumes, drainback, dose volume, pump run time</td></tr>
              <tr><td>Pump selection</td><td>System curve, pump curves, operating point</td></tr>
              <tr><td>Report</td><td>Inputs, equations with values, results, design checks</td></tr>
            </table>`)}
          ${card('Recent projects', `
            <div class="recent-wrap">${list.length ? `<table class="list"><thead><tr><th>Project name</th><th>Type</th><th>Saved</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">No saved projects yet. Click <b>Save</b> to keep a project in this list.</div>'}</div>
            <div class="btnrow">
              <button class="btn" id="stNew">New</button>
              <button class="btn" id="stOpen" ${selectedRecent ? '' : 'disabled'}>Open</button>
              <button class="btn" id="stBrowse">Browse…</button>
            </div>
            <div class="help" style="font-size:12px;color:var(--faint);margin-top:8px">Projects saved with <b>Save</b> are stored in this browser. Use <b>Export</b> to save a .tdh.json file you can share, back up, or open on another computer with <b>Browse…</b>.</div>`)}
        </div>
        <div>
          ${card('Project information', `
            ${fText('info.name', 'Project name (line 1)')}
            ${fText('info.name2', 'Project name (line 2)')}
            <div class="two">
              ${fText('info.client', 'Owner / client')}
              ${fText('info.permit', 'Permit / job no.')}
            </div>
            ${fText('info.location', 'Site address / location')}
            <div class="two">
              ${fText('info.designer', 'Designer')}
              ${fText('info.company', 'Company')}
            </div>
            <div class="two">${fText('info.date', 'Date', { type: 'date' })}<div></div></div>
            <div class="frow wide"><label>Project notes (printed in report)</label><textarea data-path="info.notes" rows="3">${esc(S.info.notes)}</textarea></div>`)}
          ${card('Project type', `<div class="opts three">${ptypes}</div>`)}
          ${card('System type', `<div class="opts">${stypes}</div><div class="btnrow"><button class="btn primary" id="stGo">Continue to parameters →</button></div>`)}
        </div>
      </div>`;
    $$('#page-start tbody tr').forEach(tr => {
      tr.addEventListener('click', e => { if (e.target.dataset.del) return; selectedRecent = tr.dataset.id; renderStart(); });
      tr.addEventListener('dblclick', () => openSaved(tr.dataset.id));
    });
    $$('#page-start [data-del]').forEach(b => b.addEventListener('click', () => {
      const p = LS.get(KEY_PROJ, {});
      if (!confirm(`Remove "${(p[b.dataset.del] || {}).name || 'Untitled'}" from the recent projects list?`)) return;
      delete p[b.dataset.del]; LS.set(KEY_PROJ, p); if (selectedRecent === b.dataset.del) selectedRecent = null; renderStart();
    }));
    $('#stNew').onclick = newProject;
    $('#stOpen').onclick = () => selectedRecent && openSaved(selectedRecent);
    $('#stBrowse').onclick = () => $('#fileOpen').click();
    $('#stGo').onclick = () => showTab('params');
  }

  // ------------------------------------------------------------------ PARAMETERS page
  function distributionInputs() {
    const t = S.systemType;
    if (t === 'lpd') {
      return card('Distribution — low pressure laterals', `
        ${sub('Laterals')}
        ${fNum('lpd.nLat', 'Number of laterals per zone', '')}
        ${fNum('lpd.latLen', 'Lateral length (manifold to end cap)', 'ft')}
        ${fPipe('lpd.latPipe', 'Lateral pipe')}
        ${fSel('lpd.orifice', 'Orifice size', C.ORIFICES, { unit: 'in' })}
        ${fNum('lpd.spacing', 'Orifice spacing', 'ft')}
        ${fNum('lpd.nOverride', 'Orifices per lateral (0 = auto)', '', { help: 'Auto = floor(length ÷ spacing), with the last orifice at the end cap.' })}
        ${fNum('lpd.hEnd', 'Distal residual head (last orifice)', 'ft', { help: 'Typically 5 ft for 1/8" and 5/32" orifices, and 2 ft minimum for 3/16" and larger.' })}
        ${fNum('lpd.cd', 'Orifice discharge coefficient (C)', '', { help: '0.60 for a sharp-edged drilled orifice.' })}
        ${fNum('lpd.latDz', 'Elevation change along lateral (end − inlet)', 'ft')}
        ${sub('Manifold')}
        ${fSel('lpd.sides', 'Lateral arrangement', [['one', 'Laterals on one side of manifold'], ['both', 'Laterals on both sides (opposed pairs)']])}
        ${fSel('lpd.manFeed', 'Manifold feed location', [['end', 'End-fed'], ['center', 'Center-fed']])}
        ${fNum('lpd.manLen', 'Manifold length (first to last lateral)', 'ft')}
        ${fPipe('lpd.manPipe', 'Manifold pipe')}
        ${fNum('lpd.connDz', 'Elevation step between lateral connections', 'ft', { help: 'Positive means each lateral farther from the manifold inlet is higher.' })}
        ${fNum('lpd.maxVar', 'Maximum allowable orifice flow differential', '%')}`);
    }
    if (t === 'drip') {
      const npc = S.drip.emType === 'npc';
      return card('Distribution — drip dispersal zone', `
        ${sub('Dripline &amp; emitters')}
        ${fNum('drip.nLat', 'Number of dripline laterals per zone', '')}
        ${fNum('drip.latLen', 'Length of each lateral', 'ft')}
        ${fNum('drip.latId', 'Dripline inside diameter', 'in', { help: 'From the manufacturer, e.g. about 0.55 in for 1/2" dripline.' })}
        ${fNum('drip.latC', 'Dripline Hazen-Williams C', '')}
        ${fSel('drip.emType', 'Emitter type', [['pc', 'Pressure compensating (PC)'], ['npc', 'Non-pressure compensating']], { rerender: true })}
        ${fNum('drip.emQ', npc ? 'Emitter flow at reference pressure' : 'Emitter flow rate', 'gph')}
        ${npc ? fNum('drip.emPref', 'Reference pressure', 'psi') + fNum('drip.emX', 'Emitter exponent (x)', '', { help: 'q = k·Pˣ. Turbulent emitters are about 0.5.' }) : ''}
        ${fNum('drip.emSpacing', 'Emitter spacing', 'in')}
        ${fNum('drip.minP', 'Minimum pressure at distal emitter', 'psi')}
        ${fNum('drip.maxP', 'Maximum emitter operating pressure', 'psi')}
        ${fNum('drip.latDz', 'Elevation change along lateral (end − inlet)', 'ft')}
        ${sub('Supply manifold')}
        ${fNum('drip.manLen', 'Supply manifold length (first to last lateral)', 'ft')}
        ${fPipe('drip.manPipe', 'Supply manifold pipe')}
        ${fSel('drip.manFeed', 'Manifold feed location', [['end', 'End-fed'], ['center', 'Center-fed']])}
        ${fNum('drip.connDz', 'Elevation step between laterals', 'ft')}
        ${sub('Field flushing')}
        ${fChk('drip.flush', 'Check the field-flushing condition', { rerender: true })}
        ${S.drip.flush ? `
          ${fNum('drip.flushV', 'Flushing velocity at lateral ends', 'ft/s', { help: 'Typically 1–2 ft/s. Check the dripline manufacturer\'s requirement.' })}
          ${fNum('drip.retManLen', 'Return manifold length', 'ft')}
          ${fPipe('drip.retManPipe', 'Return manifold pipe')}
          ${fPipe('drip.retPipe', 'Return line to tank pipe')}
          ${fNum('drip.retLen', 'Return line length', 'ft')}
          ${fNum('drip.retK', 'Return line fittings ΣK', '')}
          ${fNum('drip.retDz', 'Return discharge elevation − lateral end elevation', 'ft')}` : ''}`);
    }
    if (t === 'spray') {
      return card('Distribution — spray zone', `
        ${sub('Spray heads')}
        ${fNum('spray.nHeads', 'Spray heads per distribution line', '')}
        ${fNum('spray.ratedQ', 'Head rated flow', 'gpm')}
        ${fNum('spray.ratedP', 'at rated pressure', 'psi')}
        ${fNum('spray.x', 'Nozzle exponent (x)', '', { help: 'q = k·Pˣ. Use 0.5 for typical spray nozzles.' })}
        ${fNum('spray.reqP', 'Minimum pressure at last head', 'psi')}
        ${fNum('spray.maxP', 'Maximum head operating pressure', 'psi')}
        ${sub('Distribution line')}
        ${fPipe('spray.linePipe', 'Distribution line pipe')}
        ${fNum('spray.firstLen', 'Length from zone inlet to first head', 'ft')}
        ${fNum('spray.spacing', 'Spacing between heads along line', 'ft')}
        ${fNum('spray.latDz', 'Elevation change along line (last − first)', 'ft')}
        ${fNum('spray.nBranches', 'Identical distribution lines per zone', '')}
        ${+S.spray.nBranches > 1 ? fNum('spray.branchSpacing', 'Header length between lines', 'ft') + fPipe('spray.manPipe', 'Header pipe') : ''}
        ${fNum('spray.maxVar', 'Maximum allowable head flow variation', '%')}`);
    }
    if (t === 'discharge') {
      const X = S.discharge, main = X.mode === 'main';
      return card('Discharge — outfall or sewer main tie-in', `
        ${fSel('discharge.mode', 'Discharge to', [['outfall', 'Open outfall (ditch / surface water)'], ['main', 'Pressurized sewer main (tie-in)']], { rerender: true, wide: true })}
        ${main
          ? fText('discharge.desc', 'Sewer main / connection point (description)', { ph: 'e.g. 6" PVC municipal force main at Main St., Sta. 12+50', help: 'Identifies the main and where the service line ties in: the main\'s size and material, owner, and location (street, station, or manhole/valve ID). Shown on the diagram and in the report only; it is not used in the calculations.' })
          : fText('discharge.desc', 'Receiving ditch / outfall location (description)', { ph: 'e.g. Roadside ditch, east side of County Rd 5', help: 'Identifies the receiving water and outfall location (and the permit outfall number, if any). Shown on the diagram and in the report only; it is not used in the calculations.' })}
        ${fNum('discharge.Q', 'Design discharge flow rate', 'gpm', { help: main ? 'The flow the pump must deliver against the main at its maximum pressure, from pump selection or the sewer authority\'s allowance.' : 'From pump selection or the discharge permit\'s maximum rate.' })}
        ${main ? `
          ${fNum('discharge.pMax', 'Maximum main pressure at connection', 'psi', { help: 'The highest operating pressure of the main at the tie-in, with other pumps running. Get this from the sewer authority or the main\'s hydraulic model. The pump is designed to this pressure.' })}
          ${fNum('discharge.pMin', 'Minimum main pressure at connection (optional)', 'psi', { help: 'Used to check the pump operating point when the main is lightly loaded (runout).' })}
          <div class="note-box">Static head is measured to the connection point, or to any higher point on the service line.</div>`
        : `
          ${fNum('discharge.tailwater', 'Tailwater depth above outlet (design high water)', 'ft', { help: 'Use 0 for a free (unsubmerged) outfall.' })}
          ${fNum('discharge.exitK', 'Exit loss coefficient (K)', '', { help: '1.0 for a pipe discharging to open water or atmosphere. The exit velocity head is lost at the outlet.' })}
          <div class="note-box">Static head is measured to the outlet invert, or to any higher point on the line.</div>`}`);
    }
    const k = t === 'gravity' ? 'gravity' : 'other';
    return card(t === 'gravity' ? 'Discharge — non-pressurized' : 'Discharge — known device', `
      ${fText(k + '.desc', 'Discharge point / device')}
      ${fNum(k + '.Q', 'Design pump flow rate', 'gpm', { help: t === 'gravity' ? 'Choose a flow that meets the dose volume and run time (and the velocity guideline).' : 'Use the device manufacturer\'s required flow.' })}
      ${fUnitNum(k + '.resid', k + '.unit', t === 'gravity' ? 'Residual head at discharge' : 'Required pressure at device inlet', { help: t === 'gravity' ? 'Usually 0–2 ft for free discharge into a distribution box.' : '' })}`);
  }

  function renderParams() {
    if (!R || R.sys !== S.systemType) recompute();
    const teeHelp = R && R.design && R.design.tee ? `<div class="help" style="font-size:12px;color:var(--faint);margin-top:8px">The tee where the force main joins the ${S.systemType === 'spray' ? 'header' : 'manifold'} is added automatically (K = ${R.design.tee.K}). Do not include it in the fittings above.</div>` : '';
    const valve = S.valve.use;
    const addRows = S.addons.map((a, i) => `<tr><td><div class="inp plain"><input data-path="addons.${i}.label" value="${esc(a.label)}" placeholder="Device (e.g. disc filter)"></div></td>
      <td><div class="inp"><input type="number" step="any" data-path="addons.${i}.val" data-type="num" value="${esc(a.val)}"><select data-path="addons.${i}.unit" style="width:auto;border-left:1px solid var(--border);background:var(--surface-2)"><option ${a.unit === 'ft' ? 'selected' : ''}>ft</option><option ${a.unit === 'psi' ? 'selected' : ''}>psi</option></select></div></td>
      <td><div class="inp" title="Flow at which this loss was read (blank = design flow)"><input type="number" step="any" data-path="addons.${i}.q" data-type="num" value="${esc(a.q)}" placeholder="Q ref"><span class="unit">gpm</span></div></td>
      <td><button class="linkbtn" data-rmaddon="${i}" title="Remove">✕</button></td></tr>`).join('');
    $('#page-params').innerHTML = `
      <div class="card diagram-card"><details id="diagDetails" ${diagOpen ? 'open' : ''}><summary class="card-h">▸ System diagram<span class="spacer"></span><span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--faint)">updates as you edit</span></summary><div class="card-b diagbox" id="diagBox"></div></details></div>
      <div class="grid-params">
        <div class="col-inputs">
          ${card('System', `
            ${fSel('systemType', 'System type', Object.entries(C.SYSTEM_TYPES), { rerender: true, wide: true })}
            ${fNum('lift', 'Static head (elevation lift)', 'ft', { help: `Elevation from the pump-off (low) liquid level to the ${C.staticRef(S)}. If the force main crosses a higher point, use that point.` + (['lpd', 'drip', 'spray'].includes(S.systemType) ? ' Elevation changes within the dispersal area are entered with the laterals and are not included here.' : '') })}`)}
          ${card('Pump discharge &amp; force main', `
            ${sub('Discharge assembly')}
            ${fPipe('transport.discharge.pipe', 'Discharge assembly pipe')}
            ${fNum('transport.discharge.L', 'Discharge assembly length', 'ft')}
            ${fFittings('transport.discharge')}
            ${sub('Force main' + (valve ? ' (pump to valve)' : ''))}
            ${fPipe('transport.before.pipe', 'Force main pipe')}
            ${fNum('transport.before.L', 'Force main length' + (valve ? ' (pump to valve)' : ''), 'ft')}
            ${fFittings('transport.before')}
            ${sub('Indexing / zone valve')}
            ${fChk('valve.use', 'Use an indexing (distributing) valve or zone valves', { rerender: true })}
            ${valve ? `
              ${fText('valve.model', 'Indexing valve make / model')}
              ${fNum('valve.zones', 'Number of zones served', '')}
              ${fUnitNum('valve.loss', 'valve.unit', 'Head loss through valve', { help: 'From the manufacturer\'s head loss chart.' })}
              ${fNum('valve.q', '…at flow rate (blank = design flow)', 'gpm', { help: 'The loss is scaled by (Q/Q<sub>ref</sub>)² at other flows (flushing, system curve).' })}
              ${sub('Zone force main (valve to manifold)')}
              <div class="help" style="font-size:12px;color:var(--faint);margin:-2px 0 6px">The line from the indexing valve outlet to the zone manifold. It can be a different size from the force main that supplies the valve. Enter the critical zone, usually the longest run or the highest zone.</div>
              ${fPipe('transport.after.pipe', 'Zone force main pipe')}
              ${fNum('transport.after.L', 'Zone force main length', 'ft')}
              ${fFittings('transport.after')}` : ''}${teeHelp}`)}
          ${distributionInputs()}
          ${card('Supplemental device losses', `
            <table class="addons"><tbody>${addRows}</tbody></table>
            <button class="btn small" id="addAddon">+ Add loss</button>
            <div class="help" style="font-size:12px;color:var(--faint);margin-top:6px">In-line plumbing devices added to the system, such as a flow meter, disc filter, pressure regulator, solenoid valve, or headworks. Enter each loss and the flow it was read at (blank = design flow). Losses scale with (Q/Q<sub>ref</sub>)².</div>`)}
          ${card('Dosing', `
            ${fSel('dose.mode', 'Dosing method', [['timed', 'Timed dosing (timer controls)'], ['demand', 'Demand dosing (floats)']], { rerender: true, wide: true })}
            ${fNum('dose.gpd', 'Design daily flow', 'gpd')}
            ${valve ? '' : fNum('dose.zones', 'Number of zones dosed separately', '')}
            ${S.dose.mode === 'demand' ? `
              <div class="note-box">Drawdown height and volume come from the selected pump tank's specifications and the float elevations set in that tank. Use the tank manufacturer's chart for the volume between the pump-on and pump-off floats.</div>
              ${fNum('dose.drawdownIn', 'Drawdown height (pump-on to pump-off)', 'in', { help: 'The vertical distance between the pump-on and pump-off floats.' })}
              ${fNum('dose.drawdownGal', 'Drawdown volume', 'gal', { help: 'The tank volume between the pump-on and pump-off floats, from the tank manufacturer\'s chart. This is the volume pumped per dose.' })}`
            : `
              ${fNum('dose.dosesPerDay', 'Doses per zone per day', '', { help: 'The timer spreads the daily flow evenly over this many doses.' })}
              ${fNum('dose.galPerIn', 'Pump tank volume per inch (optional)', 'gal/in', { help: 'From the tank manufacturer\'s chart, in the operating range. Leave blank to skip the tank drawdown calculation.' })}`}
            ${fChk('dose.drainback', 'The force main (pump to valve) drains back to the pump tank after each dose')}
            ${S.systemType === 'lpd' ? fNum('dose.minMult', 'Minimum dose as a multiple of lateral volume', '×') : ''}`)}
        </div>
        <div id="colCalc"></div>
        <div id="colStatic"></div>
      </div>`;
    $('#addAddon').onclick = () => { S.addons.push({ label: '', val: 0, unit: 'ft' }); changed(true); };
    $$('[data-rmaddon]').forEach(b => b.onclick = () => { S.addons.splice(+b.dataset.rmaddon, 1); changed(true); });
    renderResults();
  }

  const rr = (k, v, unit, o = {}) => `<div class="rrow ${o.cls || ''}"><span class="k">${o.flag ? '<span class="flag"></span>' : ''}${k}</span><span class="v">${v}${unit ? `<small>${unit}</small>` : ''}</span></div>`;
  const multi = (vals, d, unit) => vals.map(v => fmt(v, d)).join(' / ') + (unit ? `<small>${unit}</small>` : '');

  function renderResults() {
    const cc = $('#colCalc'), cs = $('#colStatic');
    if (!cc) return;
    if (!R || R.sys !== S.systemType) recompute(); // keep results in step with the inputs
    const db = $('#diagBox');
    if (db) { try { db.innerHTML = Diagram.render(S, R); } catch (e) { db.innerHTML = `<div class="empty">The diagram can't be drawn until the input errors are fixed.</div>`; } }
    if (R.errors.length) {
      cc.innerHTML = R.errors.map(e => `<div class="errbox">⚠ ${esc(e)}</div>`).join('') + card('Calculations', '<div class="empty">Correct the input above to see the results.</div>');
      cs.innerHTML = '';
      return;
    }
    const scs = R.scenarios, D = R.design, two = scs.length > 1;
    const hdr = two ? `<div class="rrow dim"><span class="k"></span><span class="v">${scs.map(s => s.label).join(' / ')}</span></div>` : '';
    const vflag = v => v > (+S.settings.vMax || 5);
    let calc = '';
    const t = S.systemType;
    if (t === 'lpd') {
      const n = D.net, m = R.model.details;
      const crit = n.criticalRows;
      const diff = crit.qFirst > 0 ? (crit.qFirst - crit.qDistal) / crit.qFirst * 100 : 0;
      calc += rr('Minimum flow rate per orifice', fmt(n.qMin, 3), 'gpm');
      calc += rr('Maximum flow rate per orifice', fmt(n.qMax, 3), 'gpm');
      calc += rr('Orifices per lateral', m.geo.n, '');
      calc += rr('Number of orifices per zone', m.geo.n * m.nLat, '');
      calc += rr('Number of laterals per zone', m.nLat, '');
      calc += rr('Total flow rate per zone', fmt(D.Q, 1), 'gpm', { cls: 'total' });
      calc += rr('% flow differential, 1st vs last orifice', fmt(diff, 1), '%', { flag: diff > +S.lpd.maxVar });
      calc += rr('% flow variation, entire zone', fmt(n.variation, 1), '%', { flag: n.variation > +S.lpd.maxVar });
      calc += rr('Lateral inlet velocity', fmt(C.velocity(n.conns[0].qRun, m.dLat), 2), 'ft/s');
    } else if (t === 'drip') {
      const m = R.model.details;
      calc += hdr;
      calc += rr('Emitters per lateral', m.geo.n, '');
      calc += rr('Emitters per zone', m.geo.n * m.nLat, '');
      calc += rr('Emitter flow (min / max)', `${fmt(D.net.qMin * 60, 3)} / ${fmt(D.net.qMax * 60, 3)}`, 'gph');
      if (R.flush) calc += rr('Flush flow per lateral end', fmt(R.flush.qFlush, 2), 'gpm');
      calc += rr('Total flow rate per zone', multi(scs.map(s => s.Q), 1, 'gpm'), '', { cls: 'total' });
      calc += rr('Lateral inlet pressure (max)', multi(scs.map(s => Math.max(...s.net.conns.map(c => c.hIn)) / C.FT_PER_PSI), 1, 'psi'), '');
      calc += rr('Distal emitter pressure (min)', multi(scs.map(s => Math.min(...s.net.conns.map(c => c.hEnd)) / C.FT_PER_PSI), 1, 'psi'), '');
      if (!R.model.pc) calc += rr('% emitter flow variation', fmt(D.net.variation, 1), '%', { flag: D.net.variation > 10 });
    } else if (t === 'spray') {
      const n = D.net, m = R.model.details;
      calc += rr('Spray heads per zone', m.n * m.nConn, '');
      calc += rr('Flow per head (min / max)', `${fmt(n.qMin, 2)} / ${fmt(n.qMax, 2)}`, 'gpm');
      calc += rr('Pressure at last head', fmt(n.critical.hEnd / C.FT_PER_PSI, 1), 'psi');
      calc += rr('Pressure at line inlet', fmt(Math.max(...n.conns.map(c => c.hIn)) / C.FT_PER_PSI, 1), 'psi');
      calc += rr('Total flow rate per zone', fmt(D.Q, 1), 'gpm', { cls: 'total' });
      calc += rr('% head flow variation', fmt(n.variation, 1), '%', { flag: n.variation > +S.spray.maxVar });
    } else if (t === 'discharge') {
      const dm = R.model.details;
      calc += rr('Design discharge flow rate', fmt(D.Q, 1), 'gpm', { cls: 'total' });
      if (dm.mode === 'main') {
        calc += rr('Maximum main pressure', `${fmt(dm.pMax, 1)}<small>psi</small> (${fmt(dm.hMax, 1)} ft)`, '');
        if (dm.pMin !== null) calc += rr('Minimum main pressure', `${fmt(dm.pMin, 1)}<small>psi</small> (${fmt(dm.hMin, 1)} ft)`, '');
        calc += rr('Required pump shutoff head (exceed with margin)', fmt(R.minShutoff, 1), 'ft', { cls: 'total' });
      } else {
        calc += rr('Outlet velocity', fmt(dm.vOut, 2), 'ft/s');
        calc += rr(`Exit loss (K = ${fmt(dm.K, 2)})`, fmt(dm.hExit, 2), 'ft');
        calc += rr('Tailwater above outlet', fmt(dm.tw, 2), 'ft');
      }
    } else {
      calc += rr('Design flow rate', fmt(D.Q, 1), 'gpm', { cls: 'total' });
      calc += rr('Residual head at discharge', fmt(D.hNet, 1), 'ft');
    }
    // velocities
    const segKeys = ['discharge', 'before', 'after'];
    const segNames = { discharge: 'Discharge assembly velocity', before: 'Force main velocity' + (S.valve.use ? ' (pump to valve)' : ''), after: 'Zone force main velocity' };
    segKeys.forEach(k => {
      if (k === 'after' && !S.valve.use) return;
      const vals = scs.map(s => (s.segs.find(g => g.key === k) || {}).v);
      if (vals[0] === undefined) return;
      calc += rr(segNames[k], multi(vals, 1, 'ft/s'), '', { flag: vals.some(vflag) });
    });
    if (scs[0].manInlet) {
      const mv = scs.map(s => s.manInlet.v);
      calc += rr((t === 'spray' ? 'Header' : 'Manifold') + ' inlet velocity' + (scs[0].manInlet.center ? ' (each half)' : ''), multi(mv, 1, 'ft/s'), '', { flag: mv.some(vflag) });
    }

    // friction losses
    let fr = hdr;
    const segVal = (s, k) => (s.segs.find(g => g.key === k) || {}).total || 0;
    fr += rr('Loss through discharge assembly', multi(scs.map(s => segVal(s, 'discharge')), 1, 'ft'));
    fr += rr('Loss in force main' + (S.valve.use ? ' (pump to valve)' : ''), multi(scs.map(s => segVal(s, 'before')), 1, 'ft'));
    fr += rr('Loss through indexing valve', multi(scs.map(s => s.valveLoss), 1, 'ft'), '', { cls: S.valve.use ? '' : 'dim' });
    fr += rr('Loss in zone force main', multi(scs.map(s => segVal(s, 'after')), 1, 'ft'), '', { cls: S.valve.use ? '' : 'dim' });
    if (D.net) {
      fr += rr('Loss in manifold', multi(scs.map(s => s.net.manLoss), 1, 'ft'));
      fr += rr('Loss in ' + (t === 'spray' ? 'distribution line' : 'laterals'), multi(scs.map(s => s.net.critical.latLoss), 1, 'ft'));
    }
    fr += rr('Supplemental device losses', multi(scs.map(s => s.addonTotal), 1, 'ft'));
    if (R.flush) fr += rr('Flush return path (sets lateral end head)', fmt(R.flush.required, 1), 'ft', { cls: R.flush.governs ? '' : 'dim' });
    if (+S.settings.frictionSF) fr += `<div class="help" style="font-size:12px;color:var(--faint);margin-top:6px">Force main losses include a ${S.settings.frictionSF}% safety factor.</div>`;

    const notes = R.checks.length ? `<ul class="notes">${R.checks.map(c => `<li class="${c.level}">${esc(c.text)}</li>`).join('')}</ul>` : '<div class="empty">No cautions.</div>';
    cc.innerHTML = card('Calculations', calc) + card('Frictional head losses', fr) + card('Design checks &amp; cautions', notes);

    // static / volumes / dose / duty
    const resid = D.net ? R.model.hEnd : D.hNet;
    const residLbl = t === 'lpd' ? 'Distal residual head (last orifice)' : t === 'drip' ? 'Pressure at distal emitter' : t === 'spray' ? 'Pressure at last head' : t === 'discharge' ? (R.model.details.mode === 'main' ? 'Sewer main pressure (max)' : 'Tailwater + exit loss') : 'Residual head at discharge';
    let st = rr('Static head (elevation lift)', fmt(+S.lift, 1), 'ft');
    st += rr(residLbl, `${fmt(resid, 1)}<small>ft</small> (${fmt(resid / C.FT_PER_PSI, 1)} psi)`, '');
    if (D.net) {
      const bal = D.hNet - resid - D.net.manLoss - D.net.critical.latLoss;
      if (Math.abs(bal) > 0.05) st += rr('Field elevation / balance', fmt(bal, 1), 'ft');
    }
    const V = R.volumes;
    // Each volume line shows the pipe, ID and length it was calculated from
    const vrow = (label, it, o = {}) => {
      const basis = it ? `<div class="vbasis">${esc(it.pipe)} · ID ${fmt(it.d, 3)}" · ${it.count > 1 ? `${it.count} × ${fmt(it.lenEach, 1)} ft = ` : ''}${fmt(it.L, 1)} ft × ${fmt(it.gpf, 4)} gal/ft</div>` : '';
      return `<div class="rrow ${o.cls || ''}"><span class="k">${label}${basis}</span><span class="v">${fmt(it ? it.vol : 0, 1)}<small>gal</small></span></div>`;
    };
    const I = V.items;
    let vol = vrow('Discharge assembly', I.discharge);
    vol += vrow('Force main' + (S.valve.use ? ' (pump to valve)' : ''), I.before);
    vol += rr('Total volume, pump to valve', fmt(V.beforeValve, 1), 'gal', { cls: 'total' });
    if (S.valve.use) vol += vrow('Zone force main (valve to manifold)', I.after);
    if (I.manifold) vol += vrow(I.manifold.label, I.manifold);
    if (I.laterals) vol += vrow(I.laterals.label + (t === 'spray' ? '' : ' (per zone)'), I.laterals);
    vol += rr('Total volume, valve to laterals', fmt(V.afterValve, 1), 'gal', { cls: 'total' });
    const ds = R.dose;
    let dose = '';
    if (ds.valid && ds.mode === 'demand') {
      dose += rr('Dosing method', 'Demand (floats)', '');
      dose += rr('Drawdown height', ds.drawdown !== null ? fmt(ds.drawdown, 1) : '', ds.drawdown !== null ? 'in' : '');
      dose += rr('Drawdown volume (gross dose)', fmt(ds.grossDose, 1), 'gal');
      dose += rr('Drainback volume', fmt(ds.drainback, 1), 'gal');
      dose += rr('Net dose delivered per zone', fmt(ds.netDose, 1), 'gal', { cls: 'total', flag: ds.minDose !== null && ds.netDose < ds.minDose });
      if (ds.minDose !== null) dose += rr(`Minimum dose (${ds.minMult} × lateral volume)`, fmt(ds.minDose, 1), 'gal');
      dose += rr('Doses per day at design flow', fmt(ds.totalDoses, 1), '');
      if (ds.zones > 1) dose += rr('Doses per zone per day', fmt(ds.perDay, 1), '');
      dose += rr('Pump run time per dose', fmt(ds.runMin, 1), 'min');
      dose += rr('Total pump run time per day', fmt(ds.dailyRunMin, 0), 'min');
    } else if (ds.valid) {
      dose += rr('Dosing method', 'Timed (timer)', '');
      dose += rr('Net dose per zone', fmt(ds.netDose, 1), 'gal', { flag: ds.minDose !== null && ds.netDose < ds.minDose });
      if (ds.minDose !== null) dose += rr(`Minimum dose (${ds.minMult} × lateral volume)`, fmt(ds.minDose, 1), 'gal');
      dose += rr('Drainback volume', fmt(ds.drainback, 1), 'gal');
      dose += rr('Gross volume pumped per dose', fmt(ds.grossDose, 1), 'gal', { cls: 'total' });
      dose += rr('Timer ON (pump run time per dose)', fmt(ds.runMin, 1), 'min', { cls: 'total' });
      dose += rr('Timer OFF (between doses)', fmt(ds.offMin, 1), 'min', { cls: 'total', flag: ds.offMin < 0 });
      dose += rr(`Dose cycle (${fmt(ds.totalDoses, 0)} doses per day)`, fmt(ds.cycleMin, 1), 'min');
      dose += rr('Total pump run time per day', fmt(ds.dailyRunMin, 0), 'min');
      if (ds.mode === 'timed' && ds.tankDrawdown !== null) dose += rr(`Tank drawdown per dose (at ${fmt(ds.galPerIn, 1)} gal/in)`, fmt(ds.tankDrawdown, 1), 'in');
    } else if (ds.mode === 'demand') {
      // floats not set yet: report what is known, including the minimum drawdown volume (no height estimate)
      dose += rr('Dosing method', 'Demand (floats)', '');
      dose += rr('Drawdown height', ds.drawdown !== null ? fmt(ds.drawdown, 1) : '', ds.drawdown !== null ? 'in' : '');
      dose += rr('Drawdown volume', 'not entered', '', { cls: 'dim' });
      dose += rr('Drainback volume', fmt(ds.drainback, 1), 'gal');
      if (ds.minDose !== null) {
        dose += rr(`Minimum net dose (${ds.minMult} × lateral volume)`, fmt(ds.minDose, 1), 'gal');
        dose += rr('Minimum drawdown volume (net + drainback)', fmt(ds.minGross, 1), 'gal', { cls: 'total' });
      }
      dose += `<div class="help" style="font-size:12px;color:var(--faint);margin-top:6px">Set the pump-on and pump-off floats from the tank manufacturer's chart, then enter the drawdown height and volume to calculate doses per day and run time.</div>`;
    } else dose = '<div class="empty">Enter the daily flow and doses per day.</div>';

    const G = R.governing;
    const duty = `<div class="card duty"><div class="card-h">Minimum pump requirements</div>
      <div class="duty-grid"><div><div class="lbl">Design flow rate</div><div class="big">${fmt(G.Q, 1)} <span style="font-size:15px">gpm</span></div></div>
      <div><div class="lbl">Total dynamic head</div><div class="big">${fmt(G.TDH, 1)} <span style="font-size:15px">ft</span></div></div></div>
      ${two ? `<div class="alt">${scs.map(s => `${s.label}: ${fmt(s.Q, 1)} gpm @ ${fmt(s.TDH, 1)} ft (${fmt(s.TDH / C.FT_PER_PSI, 1)} psi)`).join('<br>')}<br>The pump must meet both duty points.</div>` : `<div class="alt">${fmt(G.TDH / C.FT_PER_PSI, 1)} psi total dynamic pressure</div>`}</div>`;

    let tdh = '';
    scs.forEach(s => {
      const resid2 = s.net ? (s.flush ? s.flush.hEnd : R.model.hEnd) : s.hNet;
      tdh += two ? `<div class="sub">${s.label}</div>` : '';
      tdh += rr('Static head', fmt(s.lift, 1), 'ft');
      tdh += rr(s.net ? 'Distal residual head' : t === 'discharge' ? residLbl : 'Residual head', fmt(resid2, 1), 'ft');
      tdh += rr('Force main losses', fmt(s.segTotal, 1), 'ft');
      if (S.valve.use) tdh += rr('Valve loss', fmt(s.valveLoss, 1), 'ft');
      if (s.tee) tdh += rr((t === 'spray' ? 'Header' : 'Manifold') + ' inlet tee', fmt(s.teeLoss, 1), 'ft');
      if (s.net) tdh += rr('Distribution network losses', fmt(s.hNet - resid2, 1), 'ft');
      if (s.addonTotal) tdh += rr('Supplemental device losses', fmt(s.addonTotal, 1), 'ft');
      tdh += rr('Total dynamic head', fmt(s.TDH, 1), 'ft', { cls: 'total' });
    });
    cs.innerHTML = duty + card('TDH summary', tdh) + card('Static heads', st) + card('Pipe volumes', vol) + card('Dosing', dose);
  }

  // ------------------------------------------------------------------ CHART page
  function pumpColor(i) { return Chart.PUMP_COLORS[i % Chart.PUMP_COLORS.length]; }
  function chartData() {
    const sel = new Set(S.chart.selected);
    const pumps = allPumps().map((p, i) => ({ p, color: pumpColor(i) })).filter(x => sel.has(x.p.id)).map(x => ({
      id: x.p.id, name: x.p.name, color: x.color, pts: x.p.pts, op: R.curve ? C.operatingPoint(x.p.pts, R.curve) : null,
      op2: R.curveMin ? C.operatingPoint(x.p.pts, R.curveMin) : null
    }));
    const duty = R.errors.length ? [] : R.scenarios.map(s => ({ Q: s.Q, H: s.TDH, label: R.scenarios.length > 1 ? s.label : 'Design point' }));
    const systems = [{ pts: R.curve || [], color: '#1b75bc' }];
    if (R.curveMin) systems.push({ pts: R.curveMin, color: '#1b75bc', dash: '7 5' });
    return { system: R.curve || [], systems, duty, pumps };
  }
  /** Pump shutoff head (head at zero flow) from its curve. */
  function shutoffHead(pts) {
    const p = pts.slice().sort((a, b) => a.Q - b.Q);
    return p.length ? (p[0].Q === 0 ? p[0].H : C.interp(p, p[0].Q)) : null;
  }
  function renderChart() {
    if (!R || R.sys !== S.systemType) recompute();
    const data = chartData();
    // Pump list grouped by category (collapsible); color index follows the full library order
    const all = allPumps();
    const row = (p, i) => {
      const cls = findResult ? (findResult.has(p.id) ? 'match' : 'nomatch') : '';
      return `<label class="${cls}"><input type="checkbox" data-pump="${esc(p.id)}" ${S.chart.selected.includes(p.id) ? 'checked' : ''}><span class="swatch" style="background:${pumpColor(i)}"></span><span style="flex:1" data-pdesc="${esc(p.id)}">${esc(p.name)}${p.builtin ? '' : ' <span style="color:var(--faint);font-size:11px">(mine)</span>'}</span></label>`;
    };
    const plist = CATS.map(c => {
      const items = all.map((p, i) => ({ p, i })).filter(x => catOf(x.p) === c.id);
      if (!items.length) return '';
      const nSel = items.filter(x => S.chart.selected.includes(x.p.id)).length;
      const open = openCats.has(c.id) || nSel > 0 || (findResult && items.some(x => findResult.has(x.p.id)));
      return `<details class="pgroup" data-cat="${c.id}" ${open ? 'open' : ''}><summary title="${esc(c.note || '')}"><span>${esc(c.label)}</span><span class="pcount">${items.length}${nSel ? ` · ${nSel} shown` : ''}</span></summary>${items.map(x => row(x.p, x.i)).join('')}</details>`;
    }).join('') || '<div class="empty">Your pump library is empty.</div>';
    const G = R.errors.length ? null : R.governing;
    const sizeFor = G ? R.scenarios.map(s => rr((R.scenarios.length > 1 ? s.label : 'Design') + ' flow rate', fmt(s.Q, 1), 'gpm') + rr((R.scenarios.length > 1 ? s.label + ' ' : '') + 'Total dynamic head', fmt(s.TDH, 1), 'ft')).join('') : '<div class="empty">Fix the input errors on the Parameters tab.</div>';
    const lg = (svg, t) => `<div>${svg}<span>${t}</span></div>`;
    const line = (c, dash) => `<svg width="34" height="10"><line x1="2" y1="5" x2="32" y2="5" stroke="${c}" stroke-width="3" stroke-dasharray="${dash || ''}"/></svg>`;
    const circ = c => `<svg width="34" height="16"><circle cx="17" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2.5"/></svg>`;
    if (S.chart.findQ === '' && G) { S.chart.findQ = +G.Q.toFixed(1); S.chart.findH = +G.TDH.toFixed(1); }
    $('#page-chart').innerHTML = `
      <div class="grid-chart">
        <div>
          ${card('Size pump for', sizeFor)}
          ${card('Choose pumps', `<div class="pumplist">${plist}</div><div class="btnrow"><button class="btn small" id="managePumps">Manage pump library…</button></div>`)}
          ${card('Legend', `<div class="legend">${lg(line('#1b75bc'), R.curveMin ? 'System curve (max main pressure)' : 'System curve')}${R.curveMin ? lg(line('#1b75bc', '7 5'), 'System curve (min main pressure)') : ''}${lg(line('#7c3aed'), 'Pump curve')}${lg(circ('#16a34a'), 'Curve intersection (operating point)')}${lg(circ('#dc2626'), 'Design point')}</div>`)}
        </div>
        <div class="card"><div class="chartbox" id="chartBox">${Chart.render(Object.assign({ width: 800, height: 600 }, data))}</div><div class="readout" id="readout">Hover over the chart to read values.</div></div>
        <div>
          ${card('Pump description', `<div class="pumpdesc" id="pumpDesc">${pumpDescHtml()}</div>`)}
          ${card('Find pumps', `
            ${fNum('chart.findQ', 'Flow (GPM)', 'gpm')}
            ${fNum('chart.findH', 'TDH', 'ft')}
            ${fNum('chart.findPct', 'plus safety margin', '%')}
            ${fSel('chart.findCat', 'Pump category', [['', 'All categories']].concat(CATS.map(c => [c.id, c.label])), { wide: true })}
            <div class="btnrow"><button class="btn primary" id="findBtn">Find</button><button class="btn" id="clearBtn">Clear</button></div>
            <div id="findMsg" style="margin-top:8px;font-size:13px;color:var(--muted)">${findResult ? `${findResult.size} pump${findResult.size === 1 ? '' : 's'} in the library meet this point.` : ''}</div>`)}
        </div>
      </div>`;
    $$('[data-pump]').forEach(cb => cb.onchange = () => {
      const id = cb.dataset.pump;
      S.chart.selected = cb.checked ? S.chart.selected.concat(id) : S.chart.selected.filter(x => x !== id);
      activePump = cb.checked ? id : activePump;
      markDirty(); renderChart();
    });
    $$('[data-pdesc]').forEach(el => el.addEventListener('mouseenter', () => { activePump = el.dataset.pdesc; $('#pumpDesc').innerHTML = pumpDescHtml(); }));
    $('#managePumps').onclick = () => openPumpDialog();
    $('#findBtn').onclick = () => {
      const Q = +S.chart.findQ, H = (+S.chart.findH) * (1 + (+S.chart.findPct || 0) / 100);
      const cat = S.chart.findCat || '';
      findResult = new Set(allPumps().filter(p => (!cat || catOf(p) === cat) && C.pumpMeets(p.pts, Q, H) !== null).map(p => p.id));
      S.chart.selected = Array.from(new Set(S.chart.selected.concat(Array.from(findResult))));
      renderChart();
    };
    $('#clearBtn').onclick = () => { findResult = null; S.chart.selected = []; renderChart(); };
    const svg = $('#chartBox svg');
    svg.addEventListener('mousemove', e => {
      const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      const x = (e.clientX - r.left) * vb.width / r.width, y = (e.clientY - r.top) * vb.height / r.height;
      const d = svg.dataset;
      const Q = (x - d.ml) / d.pw * d.qmax, H = (1 - (y - d.mt) / d.ph) * d.hmax;
      if (Q < 0 || H < 0 || Q > +d.qmax || H > +d.hmax) { $('#readout').textContent = 'Hover over the chart to read values.'; return; }
      const sysH = C.interp(R.curve || [], Q);
      $('#readout').textContent = `Cursor: ${fmt(Q, 1)} gpm, ${fmt(H, 1)} ft    |    System curve at ${fmt(Q, 1)} gpm: ${sysH === null ? '—' : fmt(sysH, 1) + ' ft'}`;
    });
  }
  function pumpDescHtml() {
    const p = allPumps().find(x => x.id === activePump);
    if (!p) return '<div class="empty">Hover over or select a pump to see its details.</div>';
    const op = R.curve ? C.operatingPoint(p.pts, R.curve) : null;
    const meets = R.errors.length ? [] : R.scenarios.map(s => ({ s, h: C.pumpMeets(p.pts, s.Q, s.TDH) }));
    return `<h4>${esc(p.name)}</h4><div style="white-space:pre-wrap;color:var(--muted)">${esc(p.desc || '')}</div>${pumpSpecHtml(p)}
      <div style="margin-top:8px">${op ? `Operating point: <b>${fmt(op.Q, 1)} gpm @ ${fmt(op.H, 1)} ft</b>` : 'No intersection with the system curve.'}</div>
      ${meets.map(m => `<div style="margin-top:4px">${m.s.label}: ${m.h !== null ? `<span class="pill ok">Meets</span> ${fmt(m.h, 1)} ft available` : '<span class="pill warn">Does not meet</span>'}</div>`).join('')}
      ${mainChecks(p)}
      ${(() => { const fp = R.errors.length ? null : C.fieldPressureCheck(S, R, op); return fp ? `<div style="margin-top:4px">Pressure at the manifold inlet at the operating point: <b>${fmt(fp.psi, 1)} psi</b> ${fp.over ? `<span class="pill warn">Above ${fmt(fp.maxP, 0)} psi ${fp.what} maximum</span>` : `<span class="pill ok">Within ${fmt(fp.maxP, 0)} psi maximum</span>`}</div>` : ''; })()}`;
  }
  /** Spec table for a pump: category, manufacturer, hp, solids, order numbers, source. */
  function pumpSpecHtml(p) {
    const rows = [['Category', catLabel(catOf(p))]];
    if (p.manufacturer || p.series) rows.push(['Manufacturer', [p.manufacturer, p.series].filter(Boolean).join(' · ')]);
    if (p.hp) rows.push(['Horsepower', p.hp + ' hp']);
    if (p.solids) rows.push(['Solids handling', p.solids]);
    (p.models || []).forEach(m => rows.push([m.order, [m.volts && m.volts + ' V/ph', m.fla && m.fla + ' FLA', m.note].filter(Boolean).join(', ')]));
    if (p.source) rows.push(['Source', p.source]);
    return `<table class="pspec">${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`;
  }
  /** Sewer main tie-in: shutoff head vs. static + max main pressure, and runout at minimum main pressure. */
  function mainChecks(p) {
    if (R.errors.length || !R.minShutoff) return '';
    const sh = shutoffHead(p.pts);
    const ok = sh !== null && sh > R.minShutoff;
    const op2 = R.curveMin ? C.operatingPoint(p.pts, R.curveMin) : null;
    return `<div style="margin-top:6px">Shutoff head ${sh !== null ? fmt(sh, 1) + ' ft' : '—'} vs required ${fmt(R.minShutoff, 1)} ft: ${ok ? '<span class="pill ok">OK</span>' : '<span class="pill warn">Will deadhead at max main pressure</span>'}</div>
      ${R.curveMin ? `<div style="margin-top:4px">At minimum main pressure: ${op2 ? `<b>${fmt(op2.Q, 1)} gpm @ ${fmt(op2.H, 1)} ft</b> (check runout)` : 'beyond the end of the published pump curve (runout)'}</div>` : ''}`;
  }

  // ---------- pump library dialog
  let dlgSel = null;
  function openPumpDialog() {
    const all = allPumps();
    dlgSel = dlgSel && all.some(x => x.id === dlgSel) ? dlgSel : (all[0] && all[0].id);
    renderPumpDialog();
    $('#pumpDialog').showModal();
  }
  function renderPumpDialog() {
    const all = allPumps();
    const p = all.find(x => x.id === dlgSel);
    // sidebar grouped by category
    const items = CATS.map(c => {
      const list = all.filter(x => catOf(x) === c.id);
      if (!list.length) return '';
      return `<div class="sub" style="margin:10px 4px 4px;font-size:11.5px">${esc(c.label)}</div>` +
        list.map(x => `<button class="item ${x.id === dlgSel ? 'on' : ''}" data-dsel="${esc(x.id)}">${esc(x.name || 'Unnamed pump')}${x.builtin ? '' : ' <span style="color:var(--faint)">(mine)</span>'}</button>`).join('');
    }).join('');
    let main = '<div class="empty">Add a pump to begin.</div>';
    if (p && p.builtin) {
      // built-in pumps are read-only
      const ptsRo = p.pts.map(pt => `<tr><td style="text-align:right">${pt.Q}</td><td style="text-align:right">${pt.H}</td></tr>`).join('');
      main = `<h3 style="margin:0 0 4px">${esc(p.name)}<span class="badge-ro">Built-in</span></h3>
        <div style="color:var(--muted)">${esc(p.desc || '')}</div>${pumpSpecHtml(p)}
        <div class="sub">Pump curve points</div>
        <table class="pts"><thead><tr><th>Flow (gpm)</th><th>Head (ft)</th></tr></thead><tbody>${ptsRo}</tbody></table>
        <div class="btnrow"><button class="btn small" id="pDup">Duplicate to edit</button></div>
        <div class="help" style="font-size:12px;color:var(--faint);margin-top:10px">Built-in pumps come with the app and can't be changed here. Use "Duplicate to edit" to make your own copy.</div>`;
    } else if (p) {
      const pts = p.pts.map((pt, i) => `<tr><td><div class="inp"><input type="number" step="any" data-pt="${i}" data-f="Q" value="${pt.Q}"><span class="unit">gpm</span></div></td><td><div class="inp"><input type="number" step="any" data-pt="${i}" data-f="H" value="${pt.H}"><span class="unit">ft</span></div></td><td><button class="linkbtn" data-rmpt="${i}">✕</button></td></tr>`).join('');
      const catOpts = CATS.map(c => `<option value="${c.id}" ${catOf(p) === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
      const fld = (id, label, val, ph) => `<div class="frow wide"><label>${label}</label><div class="inp plain"><input id="${id}" value="${esc(val || '')}" placeholder="${esc(ph || '')}"></div></div>`;
      main = `
        ${fld('pName', 'Pump name', p.name)}
        <div class="frow wide"><label>Category</label><div class="inp"><select id="pCat">${catOpts}</select></div></div>
        <div class="two">${fld('pMfr', 'Manufacturer', p.manufacturer, 'e.g. Ashland Pump')}${fld('pSeries', 'Series / model', p.series, 'e.g. CPM Series')}</div>
        <div class="two">${fld('pHp', 'Horsepower', p.hp, 'e.g. 1/2')}${fld('pSolids', 'Solids handling', p.solids, 'e.g. 1/8"')}</div>
        <div class="frow wide"><label>Description (voltage, phase, order numbers, notes)</label><textarea id="pDesc" rows="3">${esc(p.desc || '')}</textarea></div>
        <div class="sub">Pump curve points (from the manufacturer's curve)</div>
        <table class="pts"><thead><tr><th>Flow</th><th>Head</th><th></th></tr></thead><tbody>${pts}</tbody></table>
        <div class="btnrow"><button class="btn small" id="pAddPt">+ Add point</button><button class="btn small danger" id="pDel">Delete pump</button></div>
        <div class="help" style="font-size:12px;color:var(--faint);margin-top:10px">Enter at least 3 points, from shutoff (0 gpm) to the end of the curve. Your pumps are saved in this browser. Use Export to share them.</div>`;
    }
    $('#pumpDialog').innerHTML = `
      <div class="dlg-h"><h2>Pump library</h2><button class="btn small" id="pImport">Import…</button><button class="btn small" id="pExport" title="Exports the pumps you added (built-in pumps come with the app)">Export my pumps</button><button class="btn ghost" id="pClose">✕</button></div>
      <div class="dlg-b">
        <div class="dlg-side">${items || '<div class="empty">No pumps</div>'}<div class="btnrow"><button class="btn small" id="pAdd">+ New pump</button></div></div>
        <div class="dlg-main">${main}</div>
      </div>
      <div class="dlg-f"><button class="btn primary" id="pDone">Done</button></div>`;
    $$('[data-dsel]').forEach(b => b.onclick = () => { dlgSel = b.dataset.dsel; renderPumpDialog(); });
    $('#pAdd').onclick = () => { const n = { id: uid(), name: 'New pump', category: 'other', desc: '', pts: [{ Q: 0, H: 100 }, { Q: 20, H: 70 }, { Q: 40, H: 20 }] }; USER.push(n); dlgSel = n.id; saveUser(); renderPumpDialog(); };
    $('#pClose').onclick = $('#pDone').onclick = () => { $('#pumpDialog').close(); };
    $('#pExport').onclick = () => download('pump-library.json', JSON.stringify(USER, null, 2));
    $('#pImport').onclick = () => $('#pumpImport').click();
    if (p && p.builtin) {
      $('#pDup').onclick = () => {
        const c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.builtin = false; c.name = p.name + ' (copy)';
        USER.push(c); dlgSel = c.id; saveUser(); renderPumpDialog();
      };
    } else if (p) {
      const bind = (id, key) => { $(id).oninput = e => { p[key] = e.target.value; saveUser(); if (key === 'name') { const b = $(`[data-dsel="${p.id}"]`); if (b) b.textContent = p.name || 'Unnamed pump'; } }; };
      bind('#pName', 'name'); bind('#pMfr', 'manufacturer'); bind('#pSeries', 'series'); bind('#pHp', 'hp'); bind('#pSolids', 'solids'); bind('#pDesc', 'desc');
      $('#pCat').onchange = e => { p.category = e.target.value; saveUser(); renderPumpDialog(); };
      $$('[data-pt]').forEach(inp => inp.oninput = () => { const v = parseFloat(inp.value); p.pts[+inp.dataset.pt][inp.dataset.f] = Number.isFinite(v) ? v : 0; saveUser(); });
      $$('[data-rmpt]').forEach(b => b.onclick = () => { p.pts.splice(+b.dataset.rmpt, 1); saveUser(); renderPumpDialog(); });
      $('#pAddPt').onclick = () => { const last = p.pts[p.pts.length - 1] || { Q: 0, H: 0 }; p.pts.push({ Q: last.Q + 10, H: Math.max(0, last.H - 10) }); saveUser(); renderPumpDialog(); };
      $('#pDel').onclick = () => { if (!confirm(`Delete "${p.name}" from your pump library?`)) return; USER = USER.filter(x => x.id !== p.id); S.chart.selected = S.chart.selected.filter(x => x !== p.id); dlgSel = allPumps()[0] && allPumps()[0].id; saveUser(); renderPumpDialog(); };
    }
  }
  $('#pumpDialog').addEventListener('close', () => { USER.forEach(p => p.pts.sort((a, b) => a.Q - b.Q)); saveUser(); if (currentTab === 'chart') renderChart(); });
  $('#pumpImport').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      const arr = JSON.parse(txt);
      if (!Array.isArray(arr)) throw new Error('not a pump list');
      let added = 0;
      arr.forEach(p => {
        if (!p || !p.name || !Array.isArray(p.pts) || p.builtin) return;
        const id = p.id && !allPumps().some(x => x.id === p.id) ? p.id : uid();
        USER.push({ id, name: String(p.name), category: CATS.some(c => c.id === p.category) ? p.category : 'other', manufacturer: String(p.manufacturer || ''), series: String(p.series || ''), hp: String(p.hp || ''), solids: String(p.solids || ''), desc: String(p.desc || ''), pts: p.pts.map(x => ({ Q: +x.Q || 0, H: +x.H || 0 })) });
        added++;
      });
      saveUser(); toast(`Imported ${added} pump${added === 1 ? '' : 's'}`); renderPumpDialog();
    }).catch(err => alert('Could not import the pump library: ' + err.message));
    e.target.value = '';
  });

  // ------------------------------------------------------------------ REPORT page
  function renderReport() {
    if (!R || R.sys !== S.systemType) recompute();
    const data = R.errors.length ? null : chartData();
    $('#page-report').innerHTML = `<div class="report-toolbar"><button class="btn primary" id="rPrint">Print / Save as PDF</button><span class="muted">In the print dialog, choose "Save as PDF" to create a PDF file. The report updates automatically when you change the inputs.</span></div>
      <div class="paper">${Report.build(S, R, data)}</div>`;
    $('#rPrint').onclick = () => window.print();
  }

  // ------------------------------------------------------------------ tabs & events
  let currentTab = 'start';
  function showTab(t) {
    currentTab = t;
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + t));
    renderCurrent();
    window.scrollTo(0, 0);
  }
  function renderCurrent() {
    if (currentTab === 'start') renderStart();
    else if (currentTab === 'params') renderParams();
    else if (currentTab === 'chart') renderChart();
    else renderReport();
  }
  $$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function recompute() {
    R = C.compute(S);
    $('#projTitle').textContent = [S.info.name || 'Untitled project', C.SYSTEM_TYPES[S.systemType]].join(' · ');
  }
  let timer = null;
  function changed(rerender) {
    markDirty();
    clearTimeout(timer);
    if (rerender) { recompute(); renderCurrent(); return; }
    timer = setTimeout(() => { recompute(); if (currentTab === 'params') renderResults(); else if (currentTab === 'report') renderReport(); }, 150);
  }
  function markDirty() {
    dirty = true;
    LS.set(KEY_CUR, S);
    $('#saveState').textContent = 'Unsaved changes';
  }
  function onField(e) {
    const el = e.target;
    const path = el.dataset && el.dataset.path;
    if (!path) return;
    const toggle = el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT';
    const rer = el.dataset.rerender === '1';
    if (toggle && e.type !== 'change') return;
    if (!toggle && e.type === 'change') { if (rer) changed(true); return; } // typed values: rerender after editing ends
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
    else if (el.dataset.type === 'num') { const n = parseFloat(el.value); v = Number.isFinite(n) ? n : ''; }
    else v = el.value;
    setP(path, v);
    changed(toggle && rer);
  }
  document.querySelector('main').addEventListener('input', onField);
  document.querySelector('main').addEventListener('change', onField);

  // ------------------------------------------------------------------ files & projects
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const fileName = () => (S.info.name || 'tdh-project').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.tdh.json';
  function saveProject() {
    const p = LS.get(KEY_PROJ, {});
    p[S.id] = { name: S.info.name || 'Untitled', savedAt: new Date().toISOString(), state: S };
    if (!LS.set(KEY_PROJ, p)) { alert('Could not save to browser storage. Use Export instead.'); return; }
    dirty = false; $('#saveState').textContent = 'Saved'; toast('Project saved');
    if (currentTab === 'start') renderStart();
  }
  function loadState(st) {
    S = withState(st);
    if (!S.id) S.id = uid();
    findResult = null; dirty = false;
    LS.set(KEY_CUR, S);
    $('#saveState').textContent = '';
    recompute(); showTab('params');
  }
  function openSaved(id) {
    if (dirty && !confirm('Discard unsaved changes to the current project?')) return;
    const p = LS.get(KEY_PROJ, {})[id];
    if (p) { loadState(p.state); toast(`Opened "${p.name}"`); }
  }
  function newProject() {
    if (dirty && !confirm('Discard unsaved changes to the current project?')) return;
    S = defaultState(); dirty = false; findResult = null; LS.set(KEY_CUR, S); $('#saveState').textContent = '';
    recompute(); showTab('start');
  }
  $('#fileOpen').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (dirty && !confirm('Discard unsaved changes to the current project?')) { e.target.value = ''; return; }
    f.text().then(t => { const st = JSON.parse(t); const ps = st.state || st, sv = ps.calcVersion; loadState(ps); toast(sv && sv !== C.VERSION ? `Opened ${f.name} (saved with v${sv}; recalculated with v${C.VERSION})` : `Opened ${f.name}`); })
      .catch(err => alert('Could not open the file: ' + err.message));
    e.target.value = '';
  });
  $('#btnNew').onclick = newProject;
  $('#btnSave').onclick = saveProject;
  // The exported file records the calculator version it was saved with.
  $('#btnExport').onclick = () => { download(fileName(), JSON.stringify(Object.assign({}, S, { calcVersion: C.VERSION }), null, 2)); };
  $('#btnPrint').onclick = () => { showTab('report'); setTimeout(() => window.print(), 100); };
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); } });
  window.addEventListener('beforeprint', () => { if (currentTab !== 'report') renderReport(); });

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  { const v = document.getElementById('appVer'); if (v) { v.textContent = 'v' + C.VERSION; v.title = 'Released ' + C.RELEASE_DATE; } }
  window.TDHApp = { getState: () => S, getResult: () => R, defaultState };
  recompute();
  showTab('start');
})();

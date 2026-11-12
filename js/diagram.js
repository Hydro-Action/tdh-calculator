/* System schematic: pump tank -> discharge assembly -> force main -> (valve) -> distribution.
 * Drawn from the current project inputs. Schematic only, not to scale. */
(function (root) {
  'use strict';
  const C = root.Calc;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const f1 = v => (Math.round(num(v) * 10) / 10).toLocaleString('en-US');

  const BLUE = '#1b75bc', GREEN = '#3b8e57', NAVY = '#0c222e', MUTED = '#4f6470', RED = '#c62828', GRAY = '#84969f', RET = '#7a5aa6';
  const SHORT = { e90: '90°', e45: '45°', teeRun: 'tee (run)', teeBr: 'tee (branch)', valve: 'ball/gate valve', check: 'check valve', union: 'union' };

  function fittingText(seg) {
    if (!seg || !seg.fit) return '';
    const parts = Object.keys(SHORT).filter(k => num(seg.fit[k]) > 0).map(k => `${num(seg.fit[k])}× ${SHORT[k]}`);
    if (num(seg.kOther) > 0) parts.push(`ΣK other ${seg.kOther}`);
    // two lines max, about 3 items per line, so labels stay out of the field area
    return [parts.slice(0, 3).join(', '), parts.slice(3).join(', ')];
  }
  const pipeTxt = seg => `${C.pipeLabel(seg.pipe)} · ${f1(seg.L)} ft`;

  function render(S, R, opts) {
    opts = opts || {};
    // With an indexing valve the field is shifted right to make room for the valve and the zone force main.
    const DX = S.valve && S.valve.use ? 230 : 0;
    const W = 1000 + DX, H = 540;
    const t = S.systemType;
    const o = [];
    const P = (d, c, w, dash, extra) => o.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${extra || ''}/>`);
    const T = (x, y, s, a) => {
      a = a || {};
      o.push(`<text x="${x}" y="${y}" font-size="${a.size || 12}" font-weight="${a.w || 400}" fill="${a.c || NAVY}" text-anchor="${a.anchor || 'start'}"${a.rot ? ` transform="rotate(${a.rot} ${x} ${y})"` : ''}>${esc(s)}</text>`);
    };
    // Label block: bold title + detail lines, white halo for legibility
    const label = (x, y, title, lines, a) => {
      a = a || {};
      const anchor = a.anchor || 'start';
      const lh = 14;
      const all = [title].concat((lines || []).filter(Boolean));
      o.push(`<g paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">`);
      all.forEach((s, i) => T(x, y + i * lh, s, { w: i === 0 ? 700 : 400, size: i === 0 ? 12.5 : 11.5, c: i === 0 ? (a.c || NAVY) : MUTED, anchor }));
      o.push(`</g>`);
    };
    const leader = (x1, y1, x2, y2) => { o.push(`<circle cx="${x1}" cy="${y1}" r="3" fill="${NAVY}"/>`); P(`M${x1} ${y1} L${x2} ${y2}`, NAVY, 1, ''); };
    const arrow = (x, y, dir, c) => { // small flow arrowhead
      const d = { r: `M${x - 6} ${y - 5} L${x + 4} ${y} L${x - 6} ${y + 5}`, d: `M${x - 5} ${y - 6} L${x} ${y + 4} L${x + 5} ${y - 6}`, u: `M${x - 5} ${y + 6} L${x} ${y - 4} L${x + 5} ${y + 6}`, l: `M${x + 6} ${y - 5} L${x - 4} ${y} L${x + 6} ${y + 5}` }[dir];
      P(d, c || '#fff', 2, '');
    };

    o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Source Sans 3, Source Sans Pro, Segoe UI, Arial, sans-serif" role="img" aria-label="System schematic">`);
    o.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);

    // ---------------- dose tank (section view)
    const tx = 40, ty = 170, tw = 190, th = 290;
    const yOn = 255, yOff = 335;
    o.push(`<rect x="${tx}" y="${yOn}" width="${tw}" height="${ty + th - yOn}" fill="#d6e8f5"/>`);
    o.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="none" stroke="${NAVY}" stroke-width="2.5" rx="4"/>`);
    o.push(`<rect x="${tx + 60}" y="${ty - 22}" width="70" height="22" fill="#f6fafa" stroke="${NAVY}" stroke-width="2"/>`);
    T(tx + 95, ty - 7, 'riser', { size: 10.5, c: MUTED, anchor: 'middle' });
    P(`M0 ${ty} H${tx}`, '#8a6d4b', 2, ''); P(`M${tx + tw} ${ty} H${492 + DX}`, '#8a6d4b', 2, '');
    T(tx + tw + 8, ty - 6, 'finished grade', { size: 10.5, c: '#8a6d4b' });
    P(`M${tx + 4} ${yOn} H${tx + tw - 4}`, BLUE, 1.2, '5 4');
    T(tx + tw - 8, yOn - 5, 'pump on', { size: 10.5, c: BLUE, anchor: 'end' });
    P(`M${tx + 4} ${yOff} H${tx + tw - 4}`, RED, 1.5, '5 4');
    T(tx + tw - 8, yOff - 5, 'pump off', { size: 10.5, c: RED, anchor: 'end', w: 600 });
    T(tx + tw / 2, ty + th + 18, 'Pump tank (section)', { size: 12, w: 700, anchor: 'middle' });
    // dose setting between the pump-on and pump-off levels
    const ds = R && R.dose;
    if (ds && (ds.valid || ds.mode === 'demand')) {
      const lines = ds.mode === 'demand'
        ? (ds.grossDose > 0
          ? ['Demand dose', ds.drawdown !== null ? `${f1(ds.drawdown)} in = ${f1(ds.grossDose)} gal` : `${f1(ds.grossDose)} gal`]
          : ['Demand dose'].concat(ds.drawdown !== null ? [`${f1(ds.drawdown)} in`] : [], ['floats set per', 'tank chart']))
        : ['Timed dose', `ON ${f1(ds.runMin)} min`, `OFF ${f1(ds.offMin)} min`];
      if (ds.mode === 'demand') { P(`M${tx + 10} ${yOn + 4} V${yOff - 4}`, NAVY, 1, ''); P(`M${tx + 6} ${yOn + 10} L${tx + 10} ${yOn + 3} L${tx + 14} ${yOn + 10}`, NAVY, 1, ''); P(`M${tx + 6} ${yOff - 10} L${tx + 10} ${yOff - 3} L${tx + 14} ${yOff - 10}`, NAVY, 1, ''); }
      o.push(`<g paint-order="stroke" stroke="#d6e8f5" stroke-width="3">`);
      T(tx + 18, yOn + 26, lines[0], { size: 10.5, w: 700 });
      lines.slice(1).forEach((s, i) => T(tx + 18, yOn + 40 + i * 13, s, { size: 10 }));
      o.push(`</g>`);
    }
    // pump
    const px = tx + 75, py = 390;
    o.push(`<rect x="${px}" y="${py}" width="36" height="58" rx="5" fill="#8fa5b3" stroke="${NAVY}" stroke-width="1.5"/>`);
    T(px + 18, py + 33, 'PUMP', { size: 9.5, w: 700, c: '#fff', anchor: 'middle' });

    // ---------------- discharge assembly
    const dx = px + 18, dTop = 215;
    P(`M${dx} ${py} V${dTop} H${tx + tw}`, BLUE, 5);
    // fitting symbols on the riser pipe
    const sym = (y, kind) => {
      if (kind === 'check') { o.push(`<rect x="${dx - 9}" y="${y - 9}" width="18" height="18" fill="#fff" stroke="${NAVY}" stroke-width="1.5"/>`); P(`M${dx - 5} ${y + 4} L${dx} ${y - 4} L${dx + 5} ${y + 4} Z`, NAVY, 1.2, ''); }
      if (kind === 'valve') o.push(`<path d="M${dx - 9} ${y - 8} L${dx + 9} ${y + 8} L${dx + 9} ${y - 8} L${dx - 9} ${y + 8} Z" fill="#fff" stroke="${NAVY}" stroke-width="1.5"/>`);
      if (kind === 'union') { P(`M${dx - 8} ${y - 3} H${dx + 8}`, NAVY, 2, ''); P(`M${dx - 8} ${y + 3} H${dx + 8}`, NAVY, 2, ''); }
    };
    const dseg = S.transport.discharge;
    if (num(dseg.fit && dseg.fit.check)) sym(365, 'check');
    if (num(dseg.fit && dseg.fit.union)) sym(300, 'union');
    if (num(dseg.fit && dseg.fit.valve)) sym(245, 'valve');
    arrow(dx, 280, 'u');
    leader(dx + 9, 365, 262, 392);
    label(266, 390, 'Discharge assembly', [pipeTxt(dseg)].concat(fittingText(dseg)));

    // ---------------- elevation lift dimension
    P(`M14 100 H${495 + DX}`, GRAY, 1, '6 4');
    o.push(`<g paint-order="stroke" stroke="#fff" stroke-width="4">`);
    const ref = C.staticRef(S);
    T(30, 94, `Elevation of ${ref}`, { size: 10.5, c: MUTED });
    o.push(`</g>`);
    P(`M22 ${yOff} V104`, NAVY, 1.2, '');
    P(`M17 112 L22 102 L27 112`, NAVY, 1.2, ''); P(`M17 ${yOff - 8} L22 ${yOff + 2} L27 ${yOff - 8}`, NAVY, 1.2, '');
    P(`M14 ${yOff} H${tx}`, RED, 1, '3 3');
    o.push(`<g paint-order="stroke" stroke="#fff" stroke-width="4">`);
    T(34, 140, `Static head = ${f1(S.lift)} ft`, { size: 12, w: 700, rot: 0 });
    o.push(`</g>`);

    // ---------------- transport line (+ add-ons, valve)
    const ly = dTop; // line elevation in drawing
    const fieldX = 505;
    let x = tx + tw;
    const addons = (S.addons || []).filter(a => num(a.val) !== 0);
    if (addons.length) {
      const ax = x + 28;
      o.push(`<rect x="${ax - 10}" y="${ly - 10}" width="20" height="20" fill="#fff" stroke="${GREEN}" stroke-width="2"/>`);
      T(ax, ly + 4, '+', { size: 13, w: 700, c: GREEN, anchor: 'middle' });
      label(ax - 8, ly - 30, 'Supplemental devices', addons.slice(0, 2).map(a => `${a.label || 'loss'}: ${f1(a.val)} ${a.unit}`), { c: GREEN });
    }
    const before = S.transport.before;
    if (S.valve.use) {
      const vx = 480, fieldAbs = fieldX + DX;
      const after = S.transport.after;
      // line weight hints at relative pipe size
      let dB = 2, dA = 2;
      try { dB = C.pipeId(before.pipe, ''); dA = C.pipeId(after.pipe, ''); } catch (e) { /* drawn at default weight */ }
      const wA = dA < dB - 1e-6 ? 3.5 : dA > dB + 1e-6 ? 6.5 : 5;
      P(`M${x} ${ly} H${vx - 16}`, BLUE, 5);
      P(`M${vx + 16} ${ly} H${fieldAbs}`, BLUE, wA);
      o.push(`<circle cx="${vx}" cy="${ly}" r="16" fill="#fff" stroke="${NAVY}" stroke-width="2"/>`);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; P(`M${vx} ${ly} L${(vx + 11 * Math.cos(a)).toFixed(1)} ${(ly + 11 * Math.sin(a)).toFixed(1)}`, NAVY, 1.2, ''); }
      // outlets to the other zones
      const z = Math.max(1, Math.round(num(S.valve.zones)));
      if (z > 1) {
        P(`M${vx - 6} ${ly + 15} V${ly + 66}`, GRAY, 3, '2 5');
        P(`M${vx + 8} ${ly + 14} L${vx + 34} ${ly + 62}`, GRAY, 3, '2 5');
        T(vx + 10, ly + 82, `to zone${z > 2 ? 's' : ''} 2${z > 2 ? '–' + z : ''}`, { size: 11, c: MUTED, anchor: 'middle' });
      }
      label(vx, ly - 58, 'Indexing valve', [S.valve.model || null, `${z} zones · ${f1(S.valve.loss)} ${S.valve.unit} loss`].filter(Boolean), { anchor: 'middle' });
      label(245, ly + 34, 'Force main', ['pump to valve', pipeTxt(before)].concat(fittingText(before)));
      label((vx + 16 + fieldAbs) / 2 + 8, ly + 34, 'Zone force main', ['valve to manifold (critical zone)', pipeTxt(after)].concat(fittingText(after)), { anchor: 'middle' });
      arrow((vx + 16 + fieldAbs) / 2 + 8, ly, 'r');
    } else {
      P(`M${x} ${ly} H${fieldX}`, BLUE, 5);
      label(285, ly + 34, 'Force main', [pipeTxt(before)].concat(fittingText(before)));
    }
    arrow(330, ly, 'r');

    // ---------------- dispersal field (plan view), drawn in its own shifted group
    o.push(`<g transform="translate(${DX} 0)">`);
    const fx = 505, fy = 60, fw = 485, fh = 455;
    o.push(`<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="12" fill="#f3f8f4" stroke="${GREEN}" stroke-width="1.5" stroke-dasharray="7 5"/>`);
    T(fx + 14, fy + 20, (t === 'gravity' || t === 'other') ? 'Discharge point' : t === 'discharge' ? (S.discharge.mode === 'main' ? 'Sewer main connection (plan view)' : 'Outfall (section view)') : 'Dispersal zone (plan view)', { size: 12, w: 700, c: GREEN });

    const rowsY = (k, y0, y1) => k <= 1 ? [(y0 + y1) / 2] : Array.from({ length: k }, (_, i) => y0 + i * (y1 - y0) / (k - 1));
    const enterTo = (xm, yfeed) => P(`M${fieldX} ${ly} H${fieldX + 12} V${yfeed} H${xm}`, BLUE, 5);

    /**
     * Draws the manifold with a clearly marked feed point.
     * End-fed: supply enters at the top end, with flow running one way. Center-fed: supply enters between the
     * middle connections, with flow running both ways. Returns the feed y and the row gap used, so labels avoid it.
     */
    const manifold = (mx, ys, center, labelSide) => {
      const k = ys.length;
      let feedY, top = ys[0], gap = -1;
      if (center && k > 1) { gap = Math.floor((k - 1) / 2); feedY = (ys[gap] + ys[gap + 1]) / 2; }
      else { feedY = ys[0] - 24; top = feedY; }
      P(`M${mx} ${top} V${ys[k - 1]}`, BLUE, 6);
      P(`M${fieldX} ${ly} H${fieldX + 12} V${feedY} H${mx}`, BLUE, 5);
      arrow(fieldX + 12 + (mx - fieldX - 12) / 2, feedY, 'r');
      if (center && k > 1) { arrow(mx, feedY - 18, 'u'); arrow(mx, feedY + 18, 'd'); }
      else arrow(mx, (feedY + ys[0]) / 2 + 4, 'd');
      // tee marker at the inlet
      o.push(`<rect x="${mx - 8}" y="${feedY - 8}" width="16" height="16" rx="2" fill="${NAVY}" stroke="#fff" stroke-width="2"/>`);
      const txt = `Inlet · ${center && k > 1 ? 'center' : 'end'}-fed`;
      o.push(`<g paint-order="stroke" stroke="#fff" stroke-width="4">`);
      // left-side labels sit above the incoming supply line so they don't overlap it
      T(labelSide === 'left' ? mx - 16 : mx + 16, labelSide === 'left' ? feedY - 10 : feedY + 4, txt, { size: 12, w: 700, c: BLUE, anchor: labelSide === 'left' ? 'end' : 'start' });
      o.push(`</g>`);
      return { feedY, gap };
    };
    // Row gap for the manifold label: a gap that the inlet label does not use
    const labelGapY = (ys, mf) => {
      const k = ys.length;
      if (k < 2) return ys[0] + 40;
      if (k === 2 && mf.gap === 0) return mf.feedY + 26;
      const g = mf.gap === 0 ? k - 2 : 0;
      return (ys[g] + ys[g + 1]) / 2 - 6;
    };

    if (t === 'lpd') {
      const L = S.lpd;
      const nLat = Math.max(1, Math.round(num(L.nLat)));
      const both = L.sides === 'both';
      const nConn = both ? Math.ceil(nLat / 2) : nLat;
      const k = Math.min(nConn, 6);
      const ys = rowsY(k, 130, 470);
      const mx = both ? 745 : 560;
      const center = L.manFeed === 'center' && nConn > 1;
      const nOr = R && R.model && R.model.details && R.model.details.geo ? R.model.details.geo.n : Math.max(1, Math.floor(num(L.latLen) / Math.max(num(L.spacing), 0.01)));
      const dots = Math.min(nOr, 12);
      const sides = both ? [[mx, 530], [mx, 965]] : [[mx, 965]];
      ys.forEach((y, i) => sides.forEach(([a, b]) => {
        P(`M${a} ${y} H${b}`, BLUE, 3);
        P(`M${b} ${y - 7} V${y + 7}`, NAVY, 3); // end cap
        for (let j = 1; j <= dots; j++) {
          const xx = a + (b - a) * (j / dots) - (b > a ? 6 : -6);
          o.push(`<circle cx="${xx.toFixed(1)}" cy="${y}" r="${j === dots && i === ys.length - 1 && b > a ? 4.5 : 2.6}" fill="${j === dots && i === ys.length - 1 && b > a ? RED : NAVY}"/>`);
        }
      }));
      let mlY;
      if (nConn > 1) {
        const mf = manifold(mx, ys, center, both ? 'left' : 'right');
        mlY = labelGapY(ys, mf);
      } else { enterTo(mx, ys[0]); mlY = ys[0] + 40; }
      // labels
      label(mx + 12, mlY, 'Manifold', [nConn > 1 ? `${C.pipeLabel(L.manPipe)} · ${f1(L.manLen)} ft` : 'single lateral (no manifold)', nConn > 1 ? `${center ? 'center' : 'end'}-fed` : '']);
      const ly1 = ys[0];
      label(both ? 790 : 750, ly1 - 30, `Laterals: ${nLat}${k < nConn ? ` (${k * (both ? 2 : 1)} drawn)` : ''}`, [`${C.pipeLabel(L.latPipe)} · ${f1(L.latLen)} ft each${both ? ', both sides' : ''}`]);
      const yl = ys[ys.length - 1];
      label(965, yl + 22, `Orifices: ${C.orificeLabel(num(L.orifice))} @ ${f1(L.spacing)} ft · ${nOr}/lateral`, [`Last orifice (●): residual head ${f1(L.hEnd)} ft`], { anchor: 'end' });
      if (k < nConn) T(fx + fw - 12, fy + 20, `showing ${k} of ${nConn} manifold connections`, { size: 10.5, c: MUTED, anchor: 'end' });
    } else if (t === 'drip') {
      const D = S.drip;
      const nLat = Math.max(1, Math.round(num(D.nLat)));
      const k = Math.min(nLat, 6);
      const ys = rowsY(k, 140, 450);
      const sx = 560, rx = 940;
      ys.forEach((y, i) => {
        P(`M${sx} ${y} H${rx}`, GREEN, 3);
        for (let xx = sx + 14; xx < rx - 4; xx += 14) o.push(`<circle cx="${xx}" cy="${y}" r="1.8" fill="${NAVY}"/>`);
        if (i === ys.length - 1) o.push(`<circle cx="${rx - 10}" cy="${y}" r="4.5" fill="${RED}"/>`);
        if (!D.flush) P(`M${rx} ${y - 7} V${y + 7}`, NAVY, 3);
      });
      const center = D.manFeed === 'center' && nLat > 1;
      let mlY;
      if (nLat > 1) { const mf = manifold(sx, ys, center, 'right'); mlY = labelGapY(ys, mf); }
      else { enterTo(sx, ys[0]); mlY = ys[0] + 40; }
      label(sx + 12, mlY, 'Supply manifold', [nLat > 1 ? `${C.pipeLabel(D.manPipe)} · ${f1(D.manLen)} ft` : 'single lateral', nLat > 1 ? `${center ? 'center' : 'end'}-fed` : '']);
      label(700, (ys[0] + (ys[1] || 300)) / 2 - 12, `Dripline laterals: ${nLat}${k < nLat ? ` (${k} drawn)` : ''}`, [`${f1(D.latLen)} ft each · ID ${num(D.latId).toFixed(3)}"`, `${f1(D.emQ)} gph emitters @ ${f1(D.emSpacing)} in (${D.emType === 'npc' ? 'non-PC' : 'PC'})`]);
      label(rx - 10, ys[ys.length - 1] + 24, `Distal emitter (●): min ${f1(D.minP)} psi`, [], { anchor: 'end' });
      if (D.flush) {
        const fl = R && R.flush;
        // return manifold collects the lateral ends; return line carries the flush flow back to the pump tank
        P(`M${rx} ${ys[0]} V${ys[ys.length - 1]}`, RET, 5);
        ys.forEach(y => o.push(`<circle cx="${rx}" cy="${y}" r="3.5" fill="#fff" stroke="${RET}" stroke-width="2"/>`));
        P(`M${rx} ${ys[0]} V40 H${tx + 95 - DX} V${ty - 22}`, RET, 4);
        arrow(rx, 70, 'u'); arrow(640, 40, 'l'); arrow(330 - DX, 40, 'l'); arrow(tx + 95 - DX, 120, 'd');
        label(rx - 10, ys[0] - 24, 'Return manifold', [nLat > 1 ? `${C.pipeLabel(D.retManPipe)} · ${f1(D.retManLen)} ft` : 'single lateral'], { anchor: 'end', c: RET });
        label(260 - DX, 58, 'Flush return line to pump tank', [
          `${C.pipeLabel(D.retPipe)} · ${f1(D.retLen)} ft · fittings ΣK ${f1(D.retK)}`,
          fl ? `Flush flow ${f1(fl.Qret)} gpm (${fl.qFlush.toFixed(2)} gpm/lateral at ${f1(fl.vF)} ft/s)` : `Flushing at ${f1(D.flushV)} ft/s at lateral ends`
        ], { c: RET });
      }
    } else if (t === 'spray') {
      const Sp = S.spray;
      const nB = Math.max(1, Math.round(num(Sp.nBranches)));
      const k = Math.min(nB, 4);
      const ys = rowsY(k, k > 1 ? 150 : 300, 440);
      const hx = 560;
      const nH = Math.max(1, Math.round(num(Sp.nHeads)));
      const dh = Math.min(nH, 7);
      ys.forEach((y, i) => {
        P(`M${hx} ${y} H950`, BLUE, 3);
        for (let j = 0; j < dh; j++) {
          const xx = 610 + j * (330 / Math.max(dh - 1, 1));
          o.push(`<circle cx="${xx}" cy="${y}" r="24" fill="#cfe5f5" opacity=".55"/>`);
          o.push(`<circle cx="${xx}" cy="${y}" r="${j === dh - 1 && i === ys.length - 1 ? 5.5 : 4.5}" fill="${j === dh - 1 && i === ys.length - 1 ? RED : NAVY}"/>`);
        }
        P(`M950 ${y - 7} V${y + 7}`, NAVY, 3);
      });
      if (k > 1) P(`M${hx} ${ys[0]} V${ys[ys.length - 1]}`, BLUE, 5);
      enterTo(hx, ys[0]);
      label(600, ys[0] - 36, `Distribution line${nB > 1 ? `s: ${nB}` : ''}`, [`${C.pipeLabel(Sp.linePipe)} · ${f1(Sp.firstLen)} ft to 1st head, heads @ ${f1(Sp.spacing)} ft`]);
      label(950, ys[ys.length - 1] + 40, `Spray heads: ${nH} per line · ${f1(Sp.ratedQ)} gpm @ ${f1(Sp.ratedP)} psi`, [`Last head (●): min ${f1(Sp.reqP)} psi`], { anchor: 'end' });
      if (nB > 1) label(hx + 8, (ys[0] + ys[1]) / 2 + 4, 'Header', [`${C.pipeLabel(Sp.manPipe)}`]);
    } else if (t === 'discharge') {
      const X = S.discharge;
      const dm = R && R.model && R.model.details ? R.model.details : {};
      const outPipe = dm.outPipe ? C.pipeLabel(dm.outPipe) : '';
      if (X.mode === 'main') {
        // pressurized sewer main with a service tie-in
        const my = 400, tx2 = 760, sy = 290;
        P(`M520 ${my} H975`, '#6b7c88', 12);
        P(`M520 ${my} H975`, '#9aabb6', 7);
        arrow(600, my, 'r', '#fff'); arrow(900, my, 'r', '#fff');
        P(`M${fieldX} ${ly} H${fieldX + 12} V${sy} H${tx2} V${my - 6}`, BLUE, 5);
        arrow(560, sy, 'r');
        // redundant check valves + isolation (curb stop) valve on the service line
        const cv = x => { o.push(`<rect x="${x - 9}" y="${sy - 9}" width="18" height="18" fill="#fff" stroke="${NAVY}" stroke-width="1.5"/>`); P(`M${x - 4} ${sy - 5} L${x + 4} ${sy} L${x - 4} ${sy + 5} Z`, NAVY, 1.2, ''); };
        cv(625); cv(660);
        o.push(`<path d="M${697 - 9} ${sy - 8} L${697 + 9} ${sy + 8} L${697 + 9} ${sy - 8} L${697 - 9} ${sy + 8} Z" fill="#fff" stroke="${NAVY}" stroke-width="1.5"/>`);
        o.push(`<rect x="${tx2 - 8}" y="${my - 14}" width="16" height="16" rx="2" fill="${NAVY}" stroke="#fff" stroke-width="2"/>`);
        label(600, sy - 46, 'Service connection', [outPipe, 'redundant check valves + isolation valve']);
        label(tx2 + 14, my - 26, 'Tie-in (tee)', []);
        label(975, my + 32, X.desc || 'Pressurized sewer main', [`Max ${f1(X.pMax)} psi${num(X.pMin) > 0 ? ` / min ${f1(X.pMin)} psi` : ''} at connection`, `Design flow ${f1(X.Q)} gpm into main`], { anchor: 'end' });
      } else {
        // open outfall to a ditch (section view)
        const gy = 290, by = 440, oy = 350, ox = Math.round(670 + (oy - gy) * 60 / (by - gy)); // outlet on the ditch bank
        o.push(`<path d="M520 ${gy} H670 L730 ${by} H880 L940 ${gy} H975" fill="none" stroke="#8a6d4b" stroke-width="2.5"/>`);
        const tw = num(X.tailwater);
        const wy = tw > 0 ? Math.max(gy + 8, oy - Math.min(tw, 6) * 10) : by - 22;
        const xl = 670 + (wy - gy) * 60 / (by - gy), xr = 940 - (wy - gy) * 60 / (by - gy);
        o.push(`<path d="M${xl.toFixed(1)} ${wy} H${xr.toFixed(1)} L880 ${by} H730 Z" fill="#cfe5f5" stroke="none"/>`);
        P(`M${xl.toFixed(1)} ${wy} H${xr.toFixed(1)}`, BLUE, 1.5, '6 4');
        P(`M${fieldX} ${ly} H${fieldX + 12} V${oy} H${ox}`, BLUE, 5);
        arrow(600, oy, 'r');
        o.push(`<rect x="${ox - 4}" y="${oy - 14}" width="6" height="28" fill="#6b7c88"/>`); // headwall
        if (tw <= 0) { P(`M${ox + 4} ${oy} q 18 4 26 ${by - 24 - oy}`, BLUE, 2.5, '4 4'); }
        else { P(`M${ox + 6} ${oy} h18`, BLUE, 2.5, '4 4'); P(`M${ox + 20} ${oy - 5} l6 5 l-6 5`, BLUE, 2, ''); }
        if (tw > 0) {
          P(`M960 ${wy} V${oy}`, NAVY, 1, ''); P(`M955 ${wy} H965 M955 ${oy} H965`, NAVY, 1, '');
          P(`M${ox + 2} ${oy} H962`, GRAY, 1, '3 3');
          label(955, (wy + oy) / 2 + 4, `Tailwater ${f1(tw)} ft`, [], { anchor: 'end' });
        }
        label(530, gy - 62, 'Outfall pipe', [outPipe, dm.vOut ? `exit v = ${dm.vOut.toFixed(2)} ft/s, loss ${dm.hExit.toFixed(2)} ft (K = ${f1(dm.K)})` : '']);
        label(805, by + 26, X.desc || 'Receiving ditch / surface water', ['NPDES / discharge permit applies'], { anchor: 'middle' });
      }
    } else if (t === 'gravity') {
      const G = S.gravity;
      const bx = 600, by = 260;
      enterTo(bx - 30, by);
      o.push(`<rect x="${bx - 30}" y="${by - 30}" width="60" height="60" rx="4" fill="#fff" stroke="${NAVY}" stroke-width="2.5"/>`);
      [-120, -40, 40, 120].forEach(dy => P(`M${bx + 30} ${by + dy / 4} C${bx + 90} ${by + dy / 4} ${bx + 90} ${by + dy} ${bx + 150} ${by + dy} H960`, '#8a6d4b', 6, '14 8'));
      label(bx - 30, by + 52, G.desc || 'Distribution box', [`${f1(G.Q)} gpm · residual ${f1(G.resid)} ${G.unit}`]);
      T(960, by + 150, 'gravity distribution lines', { size: 11, c: MUTED, anchor: 'end' });
    } else {
      const Ot = S.other;
      const bx = 640, by = 260;
      enterTo(bx - 60, by);
      o.push(`<rect x="${bx - 60}" y="${by - 45}" width="160" height="90" rx="8" fill="#fff" stroke="${NAVY}" stroke-width="2.5"/>`);
      T(bx + 20, by - 4, Ot.desc || 'Pressurized device', { size: 13, w: 700, anchor: 'middle' });
      T(bx + 20, by + 16, `${f1(Ot.Q)} gpm @ ${f1(Ot.resid)} ${Ot.unit}`, { size: 12, c: MUTED, anchor: 'middle' });
    }

    o.push('</g>');

    // legend
    const lgY = 528;
    P(`M20 ${lgY - 4} H44`, BLUE, 5); T(50, lgY, 'pressurized pipe', { size: 11, c: MUTED });
    if (t === 'drip') { P(`M160 ${lgY - 4} H184`, GREEN, 3); T(190, lgY, 'dripline', { size: 11, c: MUTED }); }
    if (t === 'drip' && S.drip.flush) { P(`M400 ${lgY - 4} H424`, RET, 4); T(430, lgY, 'flush return (manifold + line)', { size: 11, c: MUTED }); }
    if (t === 'lpd' || t === 'drip' || t === 'spray') {
      o.push(`<circle cx="${t === 'drip' ? 262 : 172}" cy="${lgY - 4}" r="4.5" fill="${RED}"/>`);
      T(t === 'drip' ? 272 : 182, lgY, 'critical (distal) outlet', { size: 11, c: MUTED });
    }
    T(W - 12, lgY, 'Schematic, not to scale. Values from the current project.', { size: 11, c: MUTED, anchor: 'end' });
    o.push('</svg>');
    return o.join('');
  }

  root.Diagram = { render };
})(typeof self !== 'undefined' ? self : this);

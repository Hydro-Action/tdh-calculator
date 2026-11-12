/* SVG pump / system curve chart (no external libraries). */
(function (root) {
  'use strict';
  const PUMP_COLORS = ['#7c3aed', '#0d9488', '#d97706', '#db2777', '#4b5563', '#65a30d', '#2563eb', '#9333ea', '#ea580c', '#0891b2'];

  function niceStep(range, target) {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function niceMax(v, target) {
    if (!(v > 0)) return { max: 10, step: 1 };
    const step = niceStep(v, target);
    return { max: Math.ceil(v / step) * step, step };
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /**
   * opts: { system:[{Q,H}], duty:[{Q,H,label}], pumps:[{name,color,pts,op}], width, height, xMax?, yMax? }
   */
  function render(opts) {
    const W = opts.width || 760, H = opts.height || 540;
    const m = { l: 64, r: 18, t: 16, b: 52 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const duty = opts.duty || [];
    const pumps = opts.pumps || [];
    const dQ = Math.max(0, ...duty.map(d => d.Q));
    const dH = Math.max(0, ...duty.map(d => d.H));
    let qMax = opts.xMax || Math.max(dQ * 2, ...pumps.map(p => Math.max(...p.pts.map(x => x.Q))), 1);
    let hMax = opts.yMax || Math.max(dH * 1.6, ...pumps.map(p => Math.max(...p.pts.map(x => x.H))), 1);
    const xs = niceMax(qMax, 10), ys = niceMax(hMax, 10);
    qMax = xs.max; hMax = ys.max;
    const X = q => m.l + q / qMax * pw;
    const Y = h => m.t + ph - h / hMax * ph;
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif" data-qmax="${qMax}" data-hmax="${hMax}" data-ml="${m.l}" data-mt="${m.t}" data-pw="${pw}" data-ph="${ph}">`);
    parts.push(`<defs><clipPath id="plotclip"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>`);
    parts.push(`<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="#fff" stroke="#9aa6b6"/>`);
    // minor grid
    const minorX = xs.step / 5, minorY = ys.step / 5;
    for (let q = minorX; q < qMax - 1e-9; q += minorX) parts.push(`<line x1="${X(q)}" y1="${m.t}" x2="${X(q)}" y2="${m.t + ph}" stroke="#eef1f5"/>`);
    for (let h = minorY; h < hMax - 1e-9; h += minorY) parts.push(`<line x1="${m.l}" y1="${Y(h)}" x2="${m.l + pw}" y2="${Y(h)}" stroke="#eef1f5"/>`);
    // major grid + labels
    for (let q = 0; q <= qMax + 1e-9; q += xs.step) {
      parts.push(`<line x1="${X(q)}" y1="${m.t}" x2="${X(q)}" y2="${m.t + ph}" stroke="#d5dbe4"/>`);
      parts.push(`<text x="${X(q)}" y="${m.t + ph + 18}" font-size="12" text-anchor="middle" fill="#4b5563">${+q.toFixed(2)}</text>`);
    }
    for (let h = 0; h <= hMax + 1e-9; h += ys.step) {
      parts.push(`<line x1="${m.l}" y1="${Y(h)}" x2="${m.l + pw}" y2="${Y(h)}" stroke="#d5dbe4"/>`);
      parts.push(`<text x="${m.l - 8}" y="${Y(h) + 4}" font-size="12" text-anchor="end" fill="#4b5563">${+h.toFixed(2)}</text>`);
    }
    parts.push(`<text x="${m.l + pw / 2}" y="${H - 10}" font-size="13" font-weight="600" text-anchor="middle" fill="#0c222e">Flow rate (gpm)</text>`);
    parts.push(`<text transform="translate(16 ${m.t + ph / 2}) rotate(-90)" font-size="13" font-weight="600" text-anchor="middle" fill="#0c222e">Total dynamic head (ft)</text>`);

    const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.Q).toFixed(1)} ${Y(p.H).toFixed(1)}`).join(' ');
    parts.push('<g clip-path="url(#plotclip)">');
    pumps.forEach(p => {
      const pts = p.pts.slice().sort((a, b) => a.Q - b.Q);
      parts.push(`<path d="${path(pts)}" fill="none" stroke="${p.color}" stroke-width="2.2" stroke-dasharray="${p.dash || ''}"><title>${esc(p.name)}</title></path>`);
    });
    (opts.systems || [{ pts: opts.system, color: '#1b75bc', label: 'System curve' }]).forEach(sc => {
      if (sc.pts && sc.pts.length) parts.push(`<path d="${path(sc.pts)}" fill="none" stroke="${sc.color}" stroke-width="2.6" stroke-dasharray="${sc.dash || ''}"/>`);
    });
    duty.forEach(d => {
      parts.push(`<line x1="${m.l}" y1="${Y(d.H)}" x2="${X(d.Q)}" y2="${Y(d.H)}" stroke="#dc2626" stroke-dasharray="4 3"/>`);
      parts.push(`<line x1="${X(d.Q)}" y1="${Y(d.H)}" x2="${X(d.Q)}" y2="${m.t + ph}" stroke="#dc2626" stroke-dasharray="4 3"/>`);
    });
    parts.push('</g>');
    duty.forEach(d => {
      parts.push(`<circle cx="${X(d.Q)}" cy="${Y(d.H)}" r="8" fill="none" stroke="#dc2626" stroke-width="2.5"><title>${esc(d.label)}: ${d.Q.toFixed(1)} gpm @ ${d.H.toFixed(1)} ft</title></circle>`);
      if (d.label) parts.push(`<text x="${X(d.Q) + 11}" y="${Y(d.H) - 9}" font-size="11.5" font-weight="600" fill="#dc2626">${esc(d.label)}</text>`);
    });
    pumps.forEach(p => {
      if (p.op2) parts.push(`<circle cx="${X(p.op2.Q)}" cy="${Y(p.op2.H)}" r="6.5" fill="#fff" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="3 2"><title>${esc(p.name)} at minimum main pressure: ${p.op2.Q.toFixed(1)} gpm @ ${p.op2.H.toFixed(1)} ft</title></circle>`);
      if (p.op) parts.push(`<circle cx="${X(p.op.Q)}" cy="${Y(p.op.H)}" r="6.5" fill="#fff" stroke="#16a34a" stroke-width="2.5"><title>${esc(p.name)} operating point: ${p.op.Q.toFixed(1)} gpm @ ${p.op.H.toFixed(1)} ft</title></circle>`);
    });
    parts.push('</svg>');
    return parts.join('');
  }

  root.Chart = { render, PUMP_COLORS };
})(typeof self !== 'undefined' ? self : this);

/* DKAS · croquis de fabricación: planta, frente y lado a escala, con medidas, y la lista de cortes.
   Dibuja exactamente las piezas del 3D (DKAS.piezas). Devuelve un SVG; DKAS_CQ.png() lo pasa a imagen. */
(function () {
  const D = window.DKAS;
  const r1 = v => Math.round(v * 10) / 10;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // ejes de la barra igual que en el 3D: x = largo de la barra, z = ancho (w), y = alto (h)
  function ejes(p1, p2, lado) {
    const x = norm(sub(p2, p1)); let z = null;
    for (const l of [lado || [0, 0, 1], [0, 1, 0], [1, 0, 0], [0, 0, 1]]) { const d = dot(l, x); z = [l[0] - x[0] * d, l[1] - x[1] * d, l[2] - x[2] * d]; if (Math.hypot(...z) > 0.01) break; }
    z = norm(z); return { x, y: cross(z, x), z };
  }

  // una vista: proyecta cada barra como rectángulo (u, v son los ejes del papel)
  function vista(c, P, u, v, ox, oy, k) {
    const out = [], pr = p => [ox + dot(p, u) * k, oy - dot(p, v) * k];
    const n3 = cross(u, v);
    P.barras.forEach(([p1, p2, w, h, lado]) => {
      const E = ejes(p1, p2, lado), a = pr(p1), b = pr(p2);
      let dx = b[0] - a[0], dy = b[1] - a[1]; const ln = Math.hypot(dx, dy);
      // grueso visto en el papel
      const perp3 = ln > 0.5 ? norm(cross(n3, E.x)) : u;
      const g = (Math.abs(dot(E.y, perp3)) * h + Math.abs(dot(E.z, perp3)) * w) * k / 2;
      if (ln < 0.5) { const gu = (Math.abs(dot(E.y, u)) * h + Math.abs(dot(E.z, u)) * w) * k / 2, gv = (Math.abs(dot(E.y, v)) * h + Math.abs(dot(E.z, v)) * w) * k / 2; out.push(`<rect x="${a[0] - gu}" y="${a[1] - gv}" width="${2 * gu}" height="${2 * gv}" class="b"/>`); return; }
      const nx = -dy / ln * g, ny = dx / ln * g;
      out.push(`<polygon class="b" points="${[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]].map(q => q.map(r1).join(',')).join(' ')}"/>`);
    });
    if (P.ped) {
      const pl = P.ped.plato, co = P.ped.columna, H = P.ped.H;
      if (Math.abs(v[1]) > 0.5) { // vista de frente o de lado
        out.push(`<rect class="b" x="${ox - pl / 2 * k}" y="${oy - 1.3 * k}" width="${pl * k}" height="${1.3 * k}"/>`, `<rect class="b" x="${ox - co / 2 * k}" y="${oy - H * k}" width="${co * k}" height="${(H - 1.3) * k}"/>`);
      } else out.push(`<circle class="mdf" cx="${ox}" cy="${oy}" r="${pl / 2 * k}"/>`, `<circle class="b" cx="${ox}" cy="${oy}" r="${co / 2 * k}"/>`);
    }
    return out.join('');
  }

  function contorno(fm, L, W, r, cx, cy, k, cls) {
    const a = L / 2 * k, b = W / 2 * k;
    if (fm === 'round') return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${a}"/>`;
    if (fm === 'oval') return `<ellipse class="${cls}" cx="${cx}" cy="${cy}" rx="${a}" ry="${b}"/>`;
    return `<rect class="${cls}" x="${cx - a}" y="${cy - b}" width="${2 * a}" height="${2 * b}" rx="${(fm === 'ovcuad' ? r : 0.4) * k}"/>`;
  }
  // cota: línea con flechas y texto
  function cota(x1, y1, x2, y2, t, lado) {
    const hor = Math.abs(y2 - y1) < Math.abs(x2 - x1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const tx = hor ? `<text x="${mx}" y="${my - 7}" class="t" text-anchor="middle">${t}</text>` : `<text x="${mx + (lado || -1) * 8}" y="${my + 5}" class="t" text-anchor="${(lado || -1) < 0 ? 'end' : 'start'}">${t}</text>`;
    return `<line class="c" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-start="url(#f)" marker-end="url(#f)"/>` + tx;
  }

  // info: { folio, cliente, fecha, titulo }
  function svg(m, info) {
    info = info || {};
    const c = D.calcular(m), M = c.m, P = D.piezas(c), W0 = 1600, H0 = 1130;
    const red = D.redonda(M.forma), ancho = M.L, fondo = M.W;
    const parts = [];
    // ---- planta ----
    const kP = Math.min(720 / ancho, 380 / fondo), cxP = 500, cyP = 350;
    parts.push(`<text x="40" y="112" class="h">PLANTA (vista de arriba)</text>`);
    parts.push(contorno(M.forma, M.L, M.W, D.radio(M), cxP, cyP, kP, 'p'));
    parts.push(contorno(c.mdf.forma, c.mdf.L, c.mdf.W, c.mdf.r, cxP, cyP, kP, 'mdf'));
    parts.push(`<g transform="translate(0,0)">${vista(c, P, [1, 0, 0], [0, 0, -1], cxP, cyP, kP)}</g>`);
    const xl = cxP - M.L / 2 * kP, xr = cxP + M.L / 2 * kP, yt = cyP - M.W / 2 * kP, yb = cyP + M.W / 2 * kP;
    parts.push(cota(xl, yt - 28, xr, yt - 28, (M.forma === 'round' ? 'Ø ' : '') + M.L + ' cm'));
    if (!red || M.forma === 'square') parts.push(cota(xr + 28, yt, xr + 28, yb, M.W + ' cm', 1));
    const mx1 = cxP - c.mdf.L / 2 * kP, mx2 = cxP + c.mdf.L / 2 * kP, my2 = cyP + c.mdf.W / 2 * kP;
    parts.push(cota(mx1, yb + 26, mx2, yb + 26, 'MDF ' + c.mdf.L + (red && M.forma === 'round' ? '' : ' × ' + c.mdf.W) + ' cm'));
    parts.push(cota(xl, yb + 56, mx1, yb + 56, 'volado ' + c.volado.L));
    if (!red) parts.push(cota(xl - 28, my2, xl - 28, yb, 'volado ' + c.volado.W));
    // ---- frente ----
    const kF = Math.min(700 / ancho, 300 / M.H), cxF = 490, pisoF = 1010;
    parts.push(`<text x="40" y="${pisoF - M.H * kF - 70}" class="h">FRENTE</text>`);
    parts.push(`<line class="piso" x1="${cxF - M.L / 2 * kF - 30}" y1="${pisoF}" x2="${cxF + M.L / 2 * kF + 30}" y2="${pisoF}"/>`);
    parts.push(vista(c, P, [1, 0, 0], [0, 1, 0], cxF, pisoF, kF));
    parts.push(`<rect class="mdf2" x="${cxF - c.mdf.L / 2 * kF}" y="${pisoF - (M.H - 1.3) * kF}" width="${c.mdf.L * kF}" height="${1.2 * kF}"/>`);
    parts.push(`<rect class="p" x="${cxF - M.L / 2 * kF}" y="${pisoF - M.H * kF}" width="${M.L * kF}" height="${Math.max(2, 1.2 * kF)}"/>`);
    const xF2 = cxF + M.L / 2 * kF;
    parts.push(cota(xF2 + 30, pisoF - M.H * kF, xF2 + 30, pisoF, 'altura ' + M.H + ' cm', 1));
    parts.push(cota(cxF - M.L / 2 * kF - 30, pisoF - c.base.H * kF, cxF - M.L / 2 * kF - 30, pisoF, 'base ' + c.base.H));
    parts.push(cota(cxF - c.base.L / 2 * kF, pisoF + 30, cxF + c.base.L / 2 * kF, pisoF + 30, (M.base === 'ped' ? 'cruz ' : 'base ') + c.base.L + ' cm'));
    // ---- lado ----
    const kL = Math.min(380 / fondo, 300 / M.H), cxL = 1220, pisoL = 470;
    parts.push(`<text x="1010" y="112" class="h">LADO</text>`);
    parts.push(`<line class="piso" x1="${cxL - M.W / 2 * kL - 20}" y1="${pisoL}" x2="${cxL + M.W / 2 * kL + 20}" y2="${pisoL}"/>`);
    parts.push(vista(c, P, [0, 0, 1], [0, 1, 0], cxL, pisoL, kL));
    parts.push(`<rect class="mdf2" x="${cxL - c.mdf.W / 2 * kL}" y="${pisoL - (M.H - 1.3) * kL}" width="${c.mdf.W * kL}" height="${1.2 * kL}"/>`);
    parts.push(`<rect class="p" x="${cxL - M.W / 2 * kL}" y="${pisoL - M.H * kL}" width="${M.W * kL}" height="${Math.max(2, 1.2 * kL)}"/>`);
    parts.push(cota(cxL - c.base.W / 2 * kL, pisoL + 30, cxL + c.base.W / 2 * kL, pisoL + 30, (M.base === 'ped' ? 'cruz ' : 'base ') + c.base.W + ' cm'));
    // ---- datos ----
    const filas = [['Piedra', D.piedra(M.piedra).nombre + ' · ' + D.medida(M) + ' · 12 mm'], ['', c.piedra.m2 + ' m² · ' + c.piedra.aprov + '% de la placa · ' + c.piedra.peso + ' kg'],
      ['MDF negro', (M.forma === 'round' ? 'Ø ' + c.mdf.L : c.mdf.L + ' × ' + c.mdf.W) + ' cm · 12 mm' + (c.mdf.r ? ' · esquinas r ' + c.mdf.r : '')],
      ['Base', D.BASES[M.base].nombre + ' · ' + c.base.L + ' × ' + c.base.W + ' × ' + c.base.H + ' cm' + (M.base === 'ped' ? ' · plato Ø ' + c.base.plato : '')],
      ['Volado', M.forma === 'round' ? c.volado.L + ' cm alrededor' : c.volado.L + ' cm cabeceras · ' + c.volado.W + ' cm lados'],
      ['Personas', c.personas ? c.personas + ' (70 cm c/u)' : '—'], ['PTR', c.metros + ' m lineales']];
    let y = 560; parts.push(`<text x="1010" y="${y}" class="h">DATOS</text>`); y += 30;
    filas.forEach(([k, v]) => { parts.push(`<text x="1010" y="${y}" class="k">${esc(k)}</text><text x="1130" y="${y}" class="v">${esc(v)}</text>`); y += 26; });
    y += 12; parts.push(`<text x="1010" y="${y}" class="h">CORTES</text>`); y += 28;
    c.cortes.forEach(x => { parts.push(`<text x="1010" y="${y}" class="v"><tspan font-weight="700">${x.cant} ×</tspan> ${esc(x.pieza)} — ${x.med} cm</text><text x="1560" y="${y}" class="k" text-anchor="end">${esc(x.mat)}</text>`); y += 23; });
    if (c.avisos.length) { y += 8; c.avisos.forEach(a => { parts.push(`<text x="1010" y="${y}" class="av">⚠ ${esc(a).slice(0, 95)}</text>`); y += 22; }); }
    const cab = `<rect x="0" y="0" width="${W0}" height="76" fill="#1a1917"/><text x="40" y="50" font-family="Georgia,serif" font-size="34" fill="#fff" letter-spacing="6">DKAS</text>
<text x="190" y="47" class="w">Croquis de fabricación · ${esc(info.titulo || D.titulo(M))}</text>
<text x="${W0 - 40}" y="47" class="w" text-anchor="end">${esc([info.folio ? 'Pedido #' + info.folio : '', info.cliente || '', info.fecha || new Date().toLocaleDateString('es-MX')].filter(Boolean).join(' · '))}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W0} ${H0}" width="${W0}" height="${H0}" font-family="Arial,Helvetica,sans-serif">
<defs><marker id="f" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 2 L10 5 L0 8z" fill="#a8844f"/></marker></defs>
<style>.p{fill:#efebe4;stroke:#1a1917;stroke-width:2}.mdf{fill:none;stroke:#555;stroke-width:1.5;stroke-dasharray:8 6}.mdf2{fill:#222}.b{fill:#2b2b2b;fill-opacity:.88;stroke:#111;stroke-width:.6}
.c{stroke:#a8844f;stroke-width:1.3}.t{font-size:17px;fill:#7a5f36;font-weight:700}.h{font-size:15px;letter-spacing:2px;fill:#6e6962;font-weight:700}.k{font-size:15px;fill:#6e6962}.v{font-size:16px;fill:#1a1917}
.av{font-size:14px;fill:#b3261e}.w{font-size:19px;fill:#fff}.piso{stroke:#999;stroke-width:1.5;stroke-dasharray:3 4}</style>
<rect width="${W0}" height="${H0}" fill="#fff"/>${cab}<line x1="980" y1="96" x2="980" y2="1100" stroke="#e7e3dc"/><line x1="40" y1="${pisoF - M.H * kF - 100}" x2="960" y2="${pisoF - M.H * kF - 100}" stroke="#e7e3dc"/>
${parts.join('\n')}
<text x="40" y="${H0 - 18}" class="k">Medidas en cm. La piedra se corta de una placa de 320 × 160 cm. Calculado por el sistema DKAS: revisa en taller antes de cortar.</text></svg>`;
  }
  // plano para el cliente y el arquitecto: planta con el espacio libre recomendado, frente y lado, sin cortes ni costos del taller
  function plano(m, info) {
    info = info || {};
    const c = D.calcular(m), M = c.m, P = D.piezas(c), v = c.viab, E = D.espacio(M), W0 = 1600, H0 = 900;
    const red = M.forma === 'round', parts = [];
    // ---- planta: la mesa dentro de su espacio libre ----
    const kP = Math.min(860 / E.L, 440 / E.W), cxP = 480, cyP = 330;
    parts.push(`<text x="40" y="70" class="h">PLANTA</text>`);
    parts.push(`<rect class="esp" x="${cxP - E.L / 2 * kP}" y="${cyP - E.W / 2 * kP}" width="${E.L * kP}" height="${E.W * kP}" rx="6"/>`);
    parts.push(contorno(M.forma, M.L, M.W, D.radio(M), cxP, cyP, kP, 'p'));
    // uniones de placa
    for (let i = 1; i < v.nL; i++) { const x = cxP - M.L / 2 * kP + i * M.L / v.nL * kP; parts.push(`<line class="junta" x1="${x}" y1="${cyP - M.W / 2 * kP}" x2="${x}" y2="${cyP + M.W / 2 * kP}"/>`); }
    for (let j = 1; j < v.nW; j++) { const y = cyP - M.W / 2 * kP + j * M.W / v.nW * kP; parts.push(`<line class="junta" x1="${cxP - M.L / 2 * kP}" y1="${y}" x2="${cxP + M.L / 2 * kP}" y2="${y}"/>`); }
    parts.push(`<g opacity=".28">${vista(c, P, [1, 0, 0], [0, 0, -1], cxP, cyP, kP)}</g>`);
    const xl = cxP - M.L / 2 * kP, xr = cxP + M.L / 2 * kP, yt = cyP - M.W / 2 * kP, yb = cyP + M.W / 2 * kP;
    parts.push(cota(xl, yt - 22, xr, yt - 22, (red ? 'Ø ' : '') + M.L));
    if (!red) parts.push(cota(xr + 22, yt, xr + 22, yb, M.W, 1));
    const ex1 = cxP - E.L / 2 * kP, ex2 = cxP + E.L / 2 * kP, ey2 = cyP + E.W / 2 * kP;
    parts.push(cota(ex1, ey2 + 26, ex2, ey2 + 26, 'espacio libre ' + E.L + ' × ' + E.W));
    parts.push(cota(ex1, cyP, xl, cyP, E.k));
    // ---- frente y lado ----
    const kF = Math.min(820 / M.L, 140 / M.H), pisoF = 830, cxF = 500;
    parts.push(`<text x="40" y="${pisoF - 170}" class="h">FRENTE</text>`);
    parts.push(`<line class="piso" x1="${cxF - M.L / 2 * kF - 20}" y1="${pisoF}" x2="${cxF + M.L / 2 * kF + 20}" y2="${pisoF}"/>`);
    parts.push(vista(c, P, [1, 0, 0], [0, 1, 0], cxF, pisoF, kF));
    parts.push(`<rect class="p" x="${cxF - M.L / 2 * kF}" y="${pisoF - M.H * kF}" width="${M.L * kF}" height="${Math.max(2.5, 2.4 * kF)}"/>`);
    parts.push(cota(cxF - M.L / 2 * kF - 22, pisoF - M.H * kF, cxF - M.L / 2 * kF - 22, pisoF, M.H, -1));
    const kL = Math.min(360 / M.W, 140 / M.H), cxL = 1330;
    parts.push(`<text x="1080" y="${pisoF - 170}" class="h">LADO</text>`);
    parts.push(`<line class="piso" x1="${cxL - M.W / 2 * kL - 20}" y1="${pisoF}" x2="${cxL + M.W / 2 * kL + 20}" y2="${pisoF}"/>`);
    parts.push(vista(c, P, [0, 0, 1], [0, 1, 0], cxL, pisoF, kL));
    parts.push(`<rect class="p" x="${cxL - M.W / 2 * kL}" y="${pisoF - M.H * kL}" width="${M.W * kL}" height="${Math.max(2.5, 2.4 * kL)}"/>`);
    parts.push(cota(cxL - M.W / 2 * kL, pisoF + 26, cxL + M.W / 2 * kL, pisoF + 26, M.W));
    // ---- datos ----
    const filas = [['Cubierta', D.piedra(M.piedra).nombre + ' · 12 mm'], ['Superficie', v.m2 + ' m² · ' + (v.placas > 1 ? v.placas + ' piezas' : '1 placa')], ['Peso piedra', '≈ ' + v.peso + ' kg'],
      ['Base', D.BASES[M.base].nombre + ' · acero'], ['Personas', c.personas || '—'], ['Fabricación', v.t]];
    let y = 104; parts.push(`<text x="1000" y="70" class="h">DATOS</text>`);
    filas.forEach(([k, val]) => { parts.push(`<text x="1000" y="${y}" class="k">${esc(k)}</text><text x="1150" y="${y}" class="v">${esc(val)}</text>`); y += 27; });
    const cab = `<text x="${W0 - 40}" y="44" class="k" text-anchor="end">${esc([info.titulo || D.titulo(M), info.fecha || new Date().toLocaleDateString('es-MX')].join(' · '))}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W0} ${H0}" width="${W0}" height="${H0}" font-family="Jost,'Segoe UI',Arial,sans-serif">
<defs><marker id="f" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 2 L10 5 L0 8z" fill="#a8844f"/></marker></defs>
<style>.p{fill:#f3efe8;stroke:#1a1917;stroke-width:2}.esp{fill:none;stroke:#b9ab94;stroke-width:1.4;stroke-dasharray:6 6}.junta{stroke:#a8844f;stroke-width:2;stroke-dasharray:10 5}
.b{fill:#2b2b2b;fill-opacity:.88;stroke:#111;stroke-width:.6}.mdf{fill:none;stroke:#555;stroke-width:1.5;stroke-dasharray:8 6}
.c{stroke:#a8844f;stroke-width:1.3}.t{font-size:17px;fill:#7a5f36;font-weight:600}.h{font-size:14px;letter-spacing:3px;fill:#6e6962;font-weight:600}.k{font-size:15px;fill:#6e6962}.v{font-size:16px;fill:#1a1917}
.piso{stroke:#999;stroke-width:1.5;stroke-dasharray:3 4}</style>
<rect width="${W0}" height="${H0}" fill="#fff"/>${cab}<line x1="40" y1="630" x2="${W0 - 40}" y2="630" stroke="#e7e3dc"/>
${parts.join('\n')}
<text x="40" y="${H0 - 22}" class="k">Medidas en cm. Línea punteada: espacio libre recomendado (${E.k} cm por lado para sillas y paso).${v.placas > 1 ? ' Línea dorada: unión de placas.' : ''}</text></svg>`;
  }
  // el SVG pasado a JPEG (para descargar o mandar por WhatsApp)
  function png(m, info, q) {
    return new Promise((ok, bad) => {
      const im = new Image(), s = svg(m, info);
      im.onload = () => { const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1130; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1600, 1130); x.drawImage(im, 0, 0); cv.toBlob(ok, 'image/jpeg', q || 0.9); };
      im.onerror = bad; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    });
  }
  window.DKAS_CQ = { svg, png, plano };
})();

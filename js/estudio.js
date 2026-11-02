/* DKAS · Estudio de diseño (solo administración, dentro del panel).
   Se crea la mesa completa: la piedra y su recorte (formas de siempre o a mano sobre la placa real de 320 × 160),
   la base (del catálogo, dibujada de frente o diseñada desde arriba), y el sistema revisa que todo cuadre
   (que la base quepa bajo la piedra, que no se voltee, rodillas, placas) y saca la ficha con planos y cortes. */
(function () {
  const D = window.DKAS, A = window.DAZK_API, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = A.esc, r1 = v => Math.round(v * 10) / 10, G = D.G;
  const FORMAS = [['rect', 'Rectangular'], ['ovcuad', 'Ovalada cuadrada'], ['oval', 'Ovalada'], ['square', 'Cuadrada'], ['round', 'Redonda'], ['libre', 'Libre (a mano)']];
  const SIMS = [['nada', 'Sin espejo'], ['x', 'Espejo ↔'], ['z', 'Espejo ↕'], ['xz', 'Espejo en 4'], ['r3', 'Radial 3'], ['r4', 'Radial 4'], ['r6', 'Radial 6']];
  const HERR = [['pata', 'Pata'], ['arriba', 'Barra arriba'], ['piso', 'Barra al piso'], ['aro', 'Aro arriba'], ['aropiso', 'Aro al piso'], ['borrar', 'Borrar']];
  const nueva = () => ({ estudio: 1, uso: 'comedor', forma: 'rect', L: 240, W: 100, r: 0, H: 75, piedra: 'statuario', color: 'negro', base: 'patas', volado: '', baseL: '', baseW: '',
    libre: null, frente: null, planta: { perfil: 'ligero', postes: [], arriba: [], piso: [], aros: [], columna: null } });
  let m = nueva(), id = null, nombre = '', visor = null, ctx = null, tab = 'piedra', sel = -1, herr = 'pata', sim = 'xz', mano = false, c = null, t3 = 0;

  // ---------- arranque ----------
  function pantalla(main, cx) {
    ctx = cx;
    main.innerHTML = '<div class="es"><div class="es-cab"><div><h1>Estudio de diseño</h1><p class="sub">Solo administración. Crea la mesa completa: piedra, recorte y base. El sistema revisa que todo cuadre y saca las medidas.</p></div>'
      + '<div class="es-acc"><input id="es-nom" maxlength="80" placeholder="Nombre del diseño"><button class="btn" id="es-nueva">Nueva</button><button class="btn" id="es-abrir">Mis diseños</button><button class="btn oro" id="es-guardar">Guardar</button></div></div>'
      + '<div class="es-grid"><div class="es-izq"><div class="es-3d" id="es-3d"></div>'
      + '<div class="es-vistas"><div class="es-seg">' + [['tres', '3D'], ['frente', 'Frente'], ['lado', 'Lado'], ['arriba', 'Planta']].map(([k, t], i) => '<button data-vista="' + k + '"' + (i ? '' : ' class="on"') + '>' + t + '</button>').join('') + '</div>'
      + '<label><input type="checkbox" id="es-cotas" checked> Medidas</label><label><input type="checkbox" id="es-sillas" checked> Sillas</label></div>'
      + '<div class="es-rev" id="es-rev"></div></div>'
      + '<div class="es-der"><nav class="es-tabs">' + [['piedra', '1 · Piedra'], ['forma', '2 · Forma y recorte'], ['base', '3 · Base'], ['medidas', '4 · Medidas']].map(([k, t]) => '<button data-tab="' + k + '">' + t + '</button>').join('') + '</nav><div id="es-tab"></div></div></div></div>';
    $('#es-nom').value = nombre; $('#es-nom').oninput = e => { nombre = e.target.value; };
    $('#es-nueva').onclick = () => { if (!confirm('¿Empezar un diseño nuevo? Lo que no guardaste se pierde.')) return; m = nueva(); id = null; nombre = ''; $('#es-nom').value = ''; sel = -1; todo(); };
    $('#es-abrir').onclick = abrirLista; $('#es-guardar').onclick = guardar;
    $$('[data-vista]').forEach(b => b.onclick = () => { $$('[data-vista]').forEach(x => x.classList.toggle('on', x === b)); visor.vista(b.dataset.vista); });
    $('#es-cotas').onchange = e => visor.cotas(e.target.checked); $('#es-sillas').onchange = e => visor.sillas(e.target.checked);
    $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; pinTab(); });
    visor = DKAS3D.crear($('#es-3d'), { tex: 'tex/piedras/1k/', fondo: 0xf3f1ed });
    todo();
  }
  function salir() { visor = null; if (D.BASES['zz-estudio']) D.quitarBase('zz-estudio'); }

  // recalcula, 3D (con poquito retraso mientras se arrastra) y revisiones
  function todo(rapido) {
    c = D.calcular(m);
    revisiones();
    clearTimeout(t3); if (rapido) t3 = setTimeout(() => visor && visor.mostrar(m), 140); else if (visor) visor.mostrar(m);
    if (!rapido) pinTab(); else if (tab === 'forma') { lienzoForma(); datosForma(); } else if (tab === 'base') lienzoPlanta();
  }
  function revisiones() {
    const ic = ['✓', '!', '✕'], tit = ['Todo cuadra', 'Funciona, con detalles', 'Hay que corregir'];
    $('#es-rev').innerHTML = '<p class="es-sem n' + c.nivel + '"><b>' + tit[c.nivel] + '</b> · ' + esc(D.piedra(c.m.piedra).nombre) + ' · ' + medTxt() + ' · h ' + c.m.H + ' cm' + (c.personas ? ' · ' + c.personas + ' personas' : '') + '</p>'
      + '<ul>' + c.rev.slice().sort((a, b) => b.n - a.n).map(r => '<li class="n' + r.n + '"><i>' + ic[r.n] + '</i>' + esc(r.t) + '</li>').join('') + '</ul>';
  }
  const medTxt = () => c.m.forma === 'round' ? 'Ø ' + c.m.L + ' cm' : c.m.L + ' × ' + c.m.W + ' cm';
  function pinTab() {
    $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const box = $('#es-tab');
    if (tab === 'piedra') tabPiedra(box); else if (tab === 'forma') tabForma(box); else if (tab === 'base') tabBase(box); else tabMedidas(box);
  }
  const num = (k, lab, val, extra) => '<label class="es-n">' + lab + '<span><input type="number" inputmode="decimal" data-k="' + k + '" value="' + (val === '' || val == null ? '' : val) + '"' + (extra || '') + '><em>cm</em></span></label>';
  function enlazarNums(box) {
    box.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => {
      const v = i.value === '' ? '' : +i.value, k = i.dataset.k;
      if (k === 'H') m.H = v || D.USOS[m.uso].H; else if (k === 'Lc' || k === 'Wc') escalarLibre(k === 'Lc' ? v : null, k === 'Wc' ? v : null); else m[k] = v;
      todo();
    });
  }

  // ---------- 1 · piedra ----------
  function tabPiedra(box) {
    box.innerHTML = '<h3>Uso</h3><div class="es-pills">' + Object.entries(D.USOS).map(([k, u]) => '<button class="pill' + (m.uso === k ? ' sel' : '') + '" data-uso="' + k + '">' + u.nombre + '</button>').join('') + '</div>'
      + '<div class="es-nums">' + num('H', 'Altura total', m.H) + '</div><p class="nota">La base mide ' + r1(m.H - D.CUBIERTA) + ' cm: la altura menos 12 mm de piedra, 12 mm de MDF y el pegamento.</p>'
      + '<h3>Piedra</h3><div class="es-piedras">' + D.PIEDRAS.map(p => '<button data-p="' + p.id + '"' + (m.piedra === p.id ? ' class="on"' : '') + '><img src="img/piedras/' + p.id + '.jpg" alt="" loading="lazy"><b>' + esc(p.nombre) + '</b><small>' + esc(p.acabado || p.desc) + '</small></button>').join('') + '</div>'
      + '<p class="nota">Cada placa mide 320 × 160 cm y 12 mm. En "Forma y recorte" la ves completa y cortas la mesa de ella.</p>';
    box.querySelectorAll('[data-uso]').forEach(b => b.onclick = () => { const antes = D.USOS[m.uso].H; m.uso = b.dataset.uso; if (m.H === antes) m.H = D.USOS[m.uso].H; todo(); });
    box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { m.piedra = b.dataset.p; texForma = null; todo(); });
    enlazarNums(box);
  }

  // ---------- 2 · forma y recorte ----------
  function tabForma(box) {
    const lib = m.forma === 'libre', red = m.forma === 'round' || m.forma === 'square';
    box.innerHTML = '<div class="es-pills">' + FORMAS.map(([k, t]) => '<button class="pill' + (m.forma === k ? ' sel' : '') + '" data-forma="' + k + '">' + t + '</button>').join('') + '</div>'
      + (lib ? '<div class="es-pills es-mini"><button class="btn' + (mano ? ' on' : '') + '" id="es-mano">✏️ Dibujar a mano</button><label class="es-chk"><input type="checkbox" id="es-curva"' + (m.libre.curva ? ' checked' : '') + '> Orilla curva</label>'
          + '<button class="btn" data-sim="x">Hacer simétrica ↔</button><button class="btn" data-sim="z">Hacer simétrica ↕</button></div>'
          + '<div class="es-nums">' + num('Lc', 'Largo total', c.m.L) + num('Wc', 'Ancho total', c.m.W) + num('volado', 'Volado del MDF', m.volado, ' placeholder="auto ' + c.mdf.volado + '"') + '</div>'
        : '<div class="es-nums">' + num('L', red ? (m.forma === 'round' ? 'Diámetro' : 'Lado') : 'Largo', m.L) + (red ? '' : num('W', 'Ancho', m.W))
          + (m.forma === 'oval' || m.forma === 'round' ? '' : num('r', 'Radio de esquinas', m.r, m.forma === 'ovcuad' ? ' placeholder="auto ' + D.radio({ forma: 'ovcuad', W: m.W }) + '"' : ''))
          + num('volado', 'Volado del MDF', m.volado, ' placeholder="auto ' + c.mdf.vL + (c.mdf.vL !== c.mdf.vW ? '/' + c.mdf.vW : '') + '"') + '</div>'
          + '<button class="btn" id="es-alibre">✂️ Recortar a mano (mover puntos)</button>')
      + '<div class="lienzo es-lz"><canvas id="es-cf" width="1200" height="700"></canvas></div>'
      + '<p class="nota" id="es-ayuda"></p><div id="es-punto"></div>';
    box.querySelectorAll('[data-forma]').forEach(b => b.onclick = () => {
      const f = b.dataset.forma; if (f === m.forma) return;
      if (f === 'libre') m.libre = m.libre && m.libre.pts ? m.libre : D.aLibre(Object.assign({}, m, { forma: m.forma }));
      else if (m.forma === 'libre') { m.L = Math.round(c.m.L); m.W = Math.round(c.m.W); }
      m.forma = f; sel = -1; todo();
    });
    if ($('#es-alibre')) $('#es-alibre').onclick = () => { m.libre = D.aLibre(m); m.L = c.m.L; m.W = c.m.W; m.forma = 'libre'; sel = -1; todo(); };
    if (lib) {
      $('#es-mano').onclick = () => { mano = !mano; sel = -1; tabForma(box); };
      $('#es-curva').onchange = e => { m.libre.curva = e.target.checked; todo(); };
      box.querySelectorAll('[data-sim]').forEach(b => b.onclick = () => { simetrica(b.dataset.sim); todo(); });
    }
    enlazarNums(box); lienzoForma(); datosForma(); eventosForma();
  }
  function datosForma() {
    const ay = $('#es-ayuda'); if (!ay) return;
    const lib = m.forma === 'libre';
    ay.textContent = !lib ? 'Atrás está la placa completa de 320 × 160 cm; lo oscuro es lo que se corta. La línea punteada es el MDF.'
      : mano ? 'Dibuja la orilla de la mesa con el dedo o el mouse, en un solo trazo. Al soltar se vuelve puntos que puedes mover.'
        : 'Arrastra los puntos dorados. Toca un "+" para agregar un punto en ese lado. Toca un punto para ponerle radio o borrarlo.';
    const box = $('#es-punto'); if (!box) return;
    if (!lib || sel < 0 || !m.libre.pts[sel]) { box.innerHTML = ''; return; }
    const p = m.libre.pts[sel];
    box.innerHTML = '<div class="es-pt"><b>Punto ' + (sel + 1) + '</b>' + num('px', 'X', r1(p[0])) + num('pz', 'Z', r1(p[1])) + (m.libre.curva ? '' : num('pr', 'Radio', (m.libre.radios || [])[sel] || 0))
      + '<button class="btn" id="es-borrapt"' + (m.libre.pts.length <= 3 ? ' disabled' : '') + '>Borrar punto</button></div>';
    box.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => {
      const v = +i.value || 0; if (i.dataset.k === 'px') p[0] = v; else if (i.dataset.k === 'pz') p[1] = v; else { m.libre.radios = m.libre.radios || m.libre.pts.map(() => 0); m.libre.radios[sel] = Math.max(0, v); }
      centrar(); todo();
    });
    $('#es-borrapt').onclick = () => { m.libre.pts.splice(sel, 1); if (m.libre.radios) m.libre.radios.splice(sel, 1); sel = -1; centrar(); todo(); };
  }
  // la mesa siempre centrada (la base va al centro)
  function centrar() {
    const b = G.caja(m.libre.pts), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (Math.abs(cx) > 0.05 || Math.abs(cz) > 0.05) { m.libre.pts = m.libre.pts.map(([x, z]) => [r1(x - cx), r1(z - cz)]); if (vista) { vista.ox += cx; vista.oz += cz; } }
  }
  function escalarLibre(L, W) {
    const b = G.caja(c.contorno), kx = L ? L / b.w : 1, kz = W ? W / b.h : 1;
    m.libre.pts = m.libre.pts.map(([x, z]) => [r1(x * kx), r1(z * kz)]);
  }
  function simetrica(eje) {
    const k = eje === 'x' ? 0 : 1, p = m.libre.pts;
    // se queda la mitad con más puntos (x ≤ 0 o z ≤ 0) y se copia en espejo
    let mitad = p.map((q, i) => ({ q, r: (m.libre.radios || [])[i] || 0 })).filter(o => o.q[k] <= 0.5);
    if (mitad.length < 2) return ctx.alerta('Pon al menos 2 puntos de un lado para copiarlo.');
    // ordenar por ángulo para que el contorno no se cruce
    const todos = mitad.concat(mitad.filter(o => Math.abs(o.q[k]) > 0.5).map(o => ({ q: k ? [o.q[0], -o.q[1]] : [-o.q[0], o.q[1]], r: o.r })));
    todos.sort((a, b) => Math.atan2(a.q[1], a.q[0]) - Math.atan2(b.q[1], b.q[0]));
    m.libre.pts = todos.map(o => o.q); m.libre.radios = todos.map(o => o.r); sel = -1; centrar();
  }

  // dibujo de la placa y el corte (vista desde arriba)
  let vista = null, texForma = null;
  function marco(cv, extra) {
    const ct = c.contorno, b = G.caja(ct), v = c.viab, pl = v.rot ? [v.nL * 160, v.nW * 320] : [v.nL * 320, v.nW * 160];
    const w = Math.max(b.w, extra ? pl[0] : 0) + 70, h = Math.max(b.h, extra ? pl[1] : 0) + 70, k = Math.min(cv.width / w, cv.height / h);
    return { k, cx: cv.width / 2, cy: cv.height / 2, ox: 0, oz: 0, pl };
  }
  const aP = (x, z) => [vista.cx + (x - vista.ox) * vista.k, vista.cy + (z - vista.oz) * vista.k];
  const aM = (px, py) => [(px - vista.cx) / vista.k + vista.ox, (py - vista.cy) / vista.k + vista.oz];
  function camino(x, pts) { x.beginPath(); pts.forEach(([a, b], i) => { const [px, py] = aP(a, b); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); }
  function lienzoForma() {
    const cv = $('#es-cf'); if (!cv) return;
    const x = cv.getContext('2d'); if (!arrastre) vista = marco(cv, true);
    x.clearRect(0, 0, cv.width, cv.height); x.fillStyle = '#ece8e1'; x.fillRect(0, 0, cv.width, cv.height);
    // la(s) placa(s) con la foto real
    const [pw, ph] = vista.pl, [x0, y0] = aP(-pw / 2, -ph / 2);
    if (!texForma || texForma.id !== m.piedra) { texForma = new Image(); texForma.id = m.piedra; texForma.onload = () => lienzoForma(); texForma.src = 'tex/piedras/1k/' + m.piedra + '.jpg'; }
    const nx = c.viab.nL, nz = c.viab.nW;
    const sw = pw / nx * vista.k, sh = ph / nz * vista.k;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (texForma.complete && texForma.naturalWidth) { x.save(); x.translate(x0 + (i + i % 2) * sw, y0 + (j + j % 2) * sh); x.scale(i % 2 ? -1 : 1, j % 2 ? -1 : 1); if (sw < sh) { x.translate(sw, 0); x.rotate(Math.PI / 2); x.drawImage(texForma, 0, 0, sh, sw); } else x.drawImage(texForma, 0, 0, sw, sh); x.restore(); }
      else { x.fillStyle = '#d9d4cb'; x.fillRect(x0 + i * sw, y0 + j * sh, sw, sh); }
      x.strokeStyle = 'rgba(40,35,30,.5)'; x.lineWidth = 1; x.strokeRect(x0 + i * sw, y0 + j * sh, sw, sh);
    }
    // lo que se corta, oscuro
    x.save(); x.beginPath(); x.rect(0, 0, cv.width, cv.height); const ct = c.contorno;
    ct.slice().reverse().forEach(([a, b], i) => { const [px, py] = aP(a, b); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath();
    x.fillStyle = 'rgba(20,17,14,.62)'; x.fill('evenodd'); x.restore();
    camino(x, ct); x.strokeStyle = '#c2a273'; x.lineWidth = 3; x.stroke();
    camino(x, c.mdf.contorno); x.setLineDash([8, 6]); x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1.5; x.stroke(); x.setLineDash([]);
    // medidas generales
    const b = G.caja(ct); x.font = '600 22px Inter, sans-serif'; x.textAlign = 'center';
    cotaH(x, b.x0, b.x1, b.z0 - 14 / vista.k * 2.2, (m.forma === 'round' ? 'Ø ' : '') + r1(b.w) + ' cm');
    if (m.forma !== 'round') cotaV(x, b.x1 + 14 / vista.k * 2.2, b.z0, b.z1, r1(b.h) + ' cm');
    x.fillStyle = '#6b665e'; x.font = '500 16px Inter, sans-serif'; x.textAlign = 'left';
    x.fillText('Placa ' + pw + ' × ' + ph + ' cm' + (c.viab.placas > 1 ? ' (' + c.viab.placas + ' piezas)' : '') + ' · aprovechas ' + c.piedra.aprov + '%', 14, cv.height - 14);
    if (m.forma !== 'libre') return;
    const p = m.libre.pts;
    // largo de cada lado (orilla recta)
    if (!m.libre.curva) { x.font = '600 15px Inter, sans-serif'; x.textAlign = 'center'; p.forEach((q, i) => { const n = p[(i + 1) % p.length], l = Math.hypot(n[0] - q[0], n[1] - q[1]); if (l < 8) return; const [px, py] = aP((q[0] + n[0]) / 2, (q[1] + n[1]) / 2); etiqueta(x, r1(l) + '', px, py - 18); }); }
    if (mano) { if (trazo) { x.beginPath(); trazo.forEach(([a, b2], i) => { const [px, py] = aP(a, b2); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = '#c2a273'; x.lineWidth = 4; x.stroke(); } return; }
    p.forEach((q, i) => { const n = p[(i + 1) % p.length], [px, py] = aP((q[0] + n[0]) / 2, (q[1] + n[1]) / 2); x.beginPath(); x.arc(px, py, 10, 0, 7); x.fillStyle = 'rgba(255,255,255,.85)'; x.fill(); x.fillStyle = '#16140f'; x.font = '700 16px Inter, sans-serif'; x.textAlign = 'center'; x.fillText('+', px, py + 5.5); });
    p.forEach((q, i) => { const [px, py] = aP(q[0], q[1]); x.beginPath(); x.arc(px, py, i === sel ? 13 : 10, 0, 7); x.fillStyle = i === sel ? '#fff' : '#c2a273'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#16140f'; x.stroke(); });
  }
  function etiqueta(x, t, px, py) { const w = x.measureText(t).width + 14; x.fillStyle = 'rgba(14,12,10,.85)'; x.beginPath(); x.roundRect ? x.roundRect(px - w / 2, py - 12, w, 22, 11) : x.rect(px - w / 2, py - 12, w, 22); x.fill(); x.fillStyle = '#f1e6d2'; x.fillText(t, px, py + 4.5); }
  function cotaH(x, a, b, z, t) { const [p1, y] = aP(a, z), [p2] = aP(b, z); x.strokeStyle = '#a8844f'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(p1, y); x.lineTo(p2, y); x.moveTo(p1, y - 7); x.lineTo(p1, y + 7); x.moveTo(p2, y - 7); x.lineTo(p2, y + 7); x.stroke(); etiqueta(x, t, (p1 + p2) / 2, y - 16); }
  function cotaV(x, xx, a, b, t) { const [px, y1] = aP(xx, a), [, y2] = aP(xx, b); x.strokeStyle = '#a8844f'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(px, y1); x.lineTo(px, y2); x.moveTo(px - 7, y1); x.lineTo(px + 7, y1); x.moveTo(px - 7, y2); x.lineTo(px + 7, y2); x.stroke(); x.save(); x.translate(px + 18, (y1 + y2) / 2); x.rotate(-Math.PI / 2); etiqueta(x, t, 0, 0); x.restore(); }
  function puntoDe(cv, e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
  let arrastre = null, trazo = null;
  function eventosForma() {
    const cv = $('#es-cf'); if (!cv || m.forma !== 'libre') return;
    cv.onpointerdown = e => {
      const [px, py] = puntoDe(cv, e), p = m.libre.pts; cv.setPointerCapture(e.pointerId);
      if (mano) { trazo = [aM(px, py)]; arrastre = { mano: true }; return; }
      const cerca = (x, z) => Math.hypot(aP(x, z)[0] - px, aP(x, z)[1] - py) < 22;
      let i = p.findIndex(q => cerca(q[0], q[1]));
      if (i < 0) { const j = p.findIndex((q, k) => { const n = p[(k + 1) % p.length]; return cerca((q[0] + n[0]) / 2, (q[1] + n[1]) / 2); });
        if (j >= 0) { const n = p[(j + 1) % p.length]; p.splice(j + 1, 0, [r1((p[j][0] + n[0]) / 2), r1((p[j][1] + n[1]) / 2)]); if (m.libre.radios) m.libre.radios.splice(j + 1, 0, 0); i = j + 1; } }
      sel = i; arrastre = i >= 0 ? { i } : null; todo(true); datosForma();
    };
    cv.onpointermove = e => {
      if (!arrastre) return; const [px, py] = puntoDe(cv, e), [x, z] = aM(px, py);
      if (arrastre.mano) { trazo.push([x, z]); lienzoForma(); return; }
      m.libre.pts[arrastre.i] = [Math.round(x * 2) / 2, Math.round(z * 2) / 2]; c = D.calcular(m); lienzoForma(); revisiones(); clearTimeout(t3); t3 = setTimeout(() => visor.mostrar(m), 140);
    };
    cv.onpointerup = cv.onpointercancel = () => {
      if (!arrastre) return; const a = arrastre; arrastre = null;
      if (a.mano) { const t = trazo; trazo = null; if (t && t.length > 8) { let pts = rdp(t, 2.5); if (pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 20) pts.pop();
        if (pts.length >= 3) { m.libre = { pts: pts.map(([x, z]) => [r1(x), r1(z)]), radios: pts.map(() => 0), curva: true }; mano = false; } } sel = -1; centrar(); todo(); return; }
      centrar(); todo();
    };
  }
  function rdp(pts, eps) {
    if (pts.length < 3) return pts; const a = pts[0], b = pts[pts.length - 1]; let im = 0, dm = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = G.dSeg(pts[i], a, b); if (d > dm) { dm = d; im = i; } }
    return dm > eps ? rdp(pts.slice(0, im + 1), eps).slice(0, -1).concat(rdp(pts.slice(im), eps)) : [a, b];
  }

  // ---------- 3 · base ----------
  const tipoBase = () => m.base === 'planta' ? 'planta' : m.base === 'frente' ? 'frente' : 'catalogo';
  function tabBase(box) {
    const t = tipoBase(), cat = Object.keys(D.BASES).filter(k => !D.BASES[k].cli && !/^zz-/.test(k));
    box.innerHTML = '<h3>Color de la base</h3><div class="es-pills">' + D.COLORES.map(k => '<button class="es-col' + (m.color === k.id ? ' on' : '') + '" data-col="' + k.id + '" title="' + k.nombre + '"><i style="background:' + k.hex + '"></i>' + k.nombre + '</button>').join('') + '</div>'
      + '<h3>¿Cómo la quieres hacer?</h3><div class="es-tipos">' + [['catalogo', 'Del catálogo', 'Nuestras bases, a la medida de esta piedra'], ['frente', 'Dibujarla de frente', 'Dibujas las patas vistas de frente; el sistema la vuelve fabricable'], ['planta', 'Diseñarla desde arriba', 'Pones patas, barras y aros viendo la mesa desde arriba (ideal para redondas)']]
        .map(([k, a, b]) => '<button data-tipo="' + k + '"' + (t === k ? ' class="on"' : '') + '><b>' + a + '</b><small>' + b + '</small></button>').join('') + '</div><div id="es-bx"></div>';
    box.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { m.color = b.dataset.col; todo(); });
    box.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => {
      const k = b.dataset.tipo;
      if (k === 'catalogo') m.base = cat.includes(m.base) ? m.base : 'patas';
      else if (k === 'frente') { if (!m.frente) return dibujarFrente(); m.base = 'frente'; }
      else { m.base = 'planta'; if (vacioPlanta()) plantilla(m.forma === 'round' ? 'aro4' : '4'); }
      todo();
    });
    const bx = $('#es-bx'), auto = c.base.auto || {};
    const medidas = '<div class="es-nums">' + num('baseL', 'Largo de la base', m.baseL, ' placeholder="auto ' + (auto.L || '') + '"') + num('baseW', 'Ancho de la base', m.baseW, ' placeholder="auto ' + (auto.W || '') + '"') + '</div>'
      + '<p class="nota">Vacío = el sistema la ajusta a la piedra. ' + (m.baseL || m.baseW ? '<button class="lnk" id="es-ajusta">Ajustar a la piedra</button>' : '') + '</p>';
    if (t === 'catalogo') {
      bx.innerHTML = '<div class="es-bases">' + cat.map(k => { const b = D.BASES[k], img = b.foto || (['patas', 'marco', 'trapecio', 'x', 'zeta', 't', 'ym', 'ped'].includes(k) ? 'img/bases/' + k + '.jpg' : '');
        return '<button data-base="' + k + '"' + (m.base === k ? ' class="on"' : '') + '>' + (img ? '<img src="' + img + '" alt="" loading="lazy">' : '<span class="es-sinf"></span>') + '<b>' + esc(b.nombre) + '</b></button>'; }).join('') + '</div>' + (m.base === 'ped' ? '' : medidas);
      bx.querySelectorAll('[data-base]').forEach(b => b.onclick = () => { m.base = b.dataset.base; todo(); });
    } else if (t === 'frente') {
      bx.innerHTML = '<div class="es-pills"><button class="btn" id="es-redib">✏️ Volver a dibujarla de frente</button></div><p class="nota">' + esc((m.frente && m.frente.nombre) || '') + ' · ' + esc(D.PERFILES[(m.frente && m.frente.perfil) || 'ligero'].nombre) + '. La misma figura va en los dos lados largos.</p>' + medidas;
      $('#es-redib').onclick = dibujarFrente;
    } else {
      const pl = m.planta, pc = pl.columna;
      bx.innerHTML = '<h3>Herramienta</h3><div class="es-pills">' + HERR.map(([k, t2]) => '<button class="pill' + (herr === k ? ' sel' : '') + '" data-herr="' + k + '">' + t2 + '</button>').join('') + '</div>'
        + '<div class="es-fila"><label>Simetría<select id="es-sim">' + SIMS.map(([k, t2]) => '<option value="' + k + '"' + (sim === k ? ' selected' : '') + '>' + t2 + '</option>').join('') + '</select></label>'
        + '<label>Perfil<select id="es-perfil">' + Object.entries(D.PERFILES).map(([k, p]) => '<option value="' + k + '"' + (pl.perfil === k ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>'
        + '<label class="es-chk"><input type="checkbox" id="es-col"' + (pc ? ' checked' : '') + '> Columna al centro</label>' + (pc ? num('plato', 'Plato Ø', pc.plato) : '') + '</div>'
        + '<div class="lienzo es-lz"><canvas id="es-cp" width="1200" height="760"></canvas></div>'
        + '<p class="nota" id="es-ayp"></p><div class="es-pills es-mini"><span class="nota">Empezar con:</span>' + [['4', '4 patas'], ['aro4', 'Aro + 4 patas'], ['tri', 'Trípode con aro'], ['col', 'Columna'], ['cero', 'Vaciar']].map(([k, t2]) => '<button class="btn" data-pl="' + k + '">' + t2 + '</button>').join('') + '</div>';
      bx.querySelectorAll('[data-herr]').forEach(b => b.onclick = () => { herr = b.dataset.herr; tabBase(box); });
      $('#es-sim').onchange = e => { sim = e.target.value; lienzoPlanta(); };
      $('#es-perfil').onchange = e => { pl.perfil = e.target.value; todo(); };
      $('#es-col').onchange = e => { pl.columna = e.target.checked ? { d: m.uso === 'comedor' ? 11.4 : 8.9, plato: m.uso === 'centro' ? 40 : 55 } : null; todo(); };
      bx.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => { plantilla(b.dataset.pl); todo(); });
      const ip = bx.querySelector('[data-k="plato"]'); if (ip) { ip.removeAttribute('data-k'); ip.onchange = () => { pl.columna.plato = Math.max(20, +ip.value || 50); todo(); }; }
      lienzoPlanta(); eventosPlanta();
    }
    if ($('#es-ajusta')) $('#es-ajusta').onclick = () => { m.baseL = m.baseW = ''; todo(); };
    enlazarNums(bx);
  }
  function dibujarFrente() {
    if (!window.DKAS_DISENA) return ctx.alerta('No se pudo abrir el dibujo.');
    let mini = null;
    DKAS_DISENA.abrirCliente(p => { m.frente = { segs: p.segs, perfil: p.perfil, nombre: p.nombre }; m.base = 'frente'; todo(); }, {
      tresD: (el, r) => { if (!mini || mini.el !== el) { mini = DKAS3D.crear(el, { tex: 'tex/piedras/1k/', fondo: 0xf3f1ed }); mini.el = el; mini.sillas(false); }
        mini.mostrar(Object.assign({}, m, { base: 'frente', frente: { segs: r.segs, perfil: r.perfil } })); },
    });
  }
  const vacioPlanta = () => { const p = m.planta; return !(p.postes.length || p.arriba.length || p.piso.length || p.aros.length || p.columna); };
  function plantilla(k) {
    const mb = G.caja(c.mdf.contorno), hx = Math.max(15, mb.w / 2 - 8), hz = Math.max(15, mb.h / 2 - 8), R = Math.max(15, Math.min(hx, hz)), pf = m.planta.perfil || 'ligero';
    const pl = { perfil: pf, postes: [], arriba: [], piso: [], aros: [], columna: null }, rr = v => Math.round(v);
    if (k === '4') { const a = rr(hx), b = rr(hz); pl.postes = [[-a, -b], [a, -b], [a, b], [-a, b]]; pl.arriba = [[-a, -b, a, -b], [a, -b, a, b], [a, b, -a, b], [-a, b, -a, -b]]; }
    if (k === 'aro4') { const r = rr(R); pl.aros = [{ r, nivel: 'arriba' }]; pl.postes = [0, 1, 2, 3].map(i => [rr(r * Math.cos(i * Math.PI / 2 + Math.PI / 4)), rr(r * Math.sin(i * Math.PI / 2 + Math.PI / 4))]); }
    if (k === 'tri') { const r = rr(R); pl.aros = [{ r, nivel: 'arriba' }]; pl.postes = [0, 1, 2].map(i => [rr(r * Math.cos(i * 2 * Math.PI / 3)), rr(r * Math.sin(i * 2 * Math.PI / 3))]); }
    if (k === 'col') pl.columna = { d: m.uso === 'comedor' ? 11.4 : 8.9, plato: m.uso === 'centro' ? 40 : 55 };
    m.planta = pl;
  }
  // simetría: todas las copias de un punto
  function copias(x, z) {
    const out = [[x, z]], add = q => { if (!out.some(o => Math.hypot(o[0] - q[0], o[1] - q[1]) < 0.6)) out.push(q); };
    if (sim === 'x' || sim === 'xz') add([-x, z]);
    if (sim === 'z' || sim === 'xz') add([x, -z]);
    if (sim === 'xz') add([-x, -z]);
    const n = { r3: 3, r4: 4, r6: 6 }[sim];
    if (n) for (let i = 1; i < n; i++) { const a = i * 2 * Math.PI / n; add([x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)]); }
    return out.map(([a, b]) => [r1(a), r1(b)]);
  }
  function copiasBarra(x1, z1, x2, z2) { const A2 = copias(x1, z1), B2 = copias(x2, z2); return A2.map((a, i) => [a[0], a[1], (B2[i] || B2[0])[0], (B2[i] || B2[0])[1]]).filter((q, i, arr) => arr.findIndex(o => igualB(o, q)) === i); }
  const igualB = (a, b) => (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.6 && Math.hypot(a[2] - b[2], a[3] - b[3]) < 0.6) || (Math.hypot(a[0] - b[2], a[1] - b[3]) < 0.6 && Math.hypot(a[2] - b[0], a[3] - b[1]) < 0.6);
  let vistaP = null, tiro = null;
  function lienzoPlanta() {
    const cv = $('#es-cp'); if (!cv) return; const x = cv.getContext('2d');
    vista = vistaP = marco(cv, false);
    x.clearRect(0, 0, cv.width, cv.height); x.fillStyle = '#fbfaf8'; x.fillRect(0, 0, cv.width, cv.height);
    // cuadrícula de 10 cm
    const b = G.caja(c.contorno); x.strokeStyle = 'rgba(160,150,135,.18)'; x.lineWidth = 1;
    for (let gx = Math.floor((b.x0 - 30) / 10) * 10; gx <= b.x1 + 30; gx += 10) { const [px] = aP(gx, 0); x.beginPath(); x.moveTo(px, 0); x.lineTo(px, cv.height); x.stroke(); }
    for (let gz = Math.floor((b.z0 - 30) / 10) * 10; gz <= b.z1 + 30; gz += 10) { const [, py] = aP(0, gz); x.beginPath(); x.moveTo(0, py); x.lineTo(cv.width, py); x.stroke(); }
    camino(x, c.contorno); x.fillStyle = 'rgba(194,162,115,.13)'; x.fill(); x.strokeStyle = '#c2a273'; x.lineWidth = 2.5; x.stroke();
    camino(x, c.mdf.contorno); x.setLineDash([8, 6]); x.strokeStyle = '#8b857b'; x.lineWidth = 1.5; x.stroke(); x.setLineDash([]);
    // ejes de simetría
    x.strokeStyle = 'rgba(168,132,79,.35)'; x.setLineDash([3, 6]); const [ox, oy] = aP(0, 0); x.beginPath(); x.moveTo(ox, 0); x.lineTo(ox, cv.height); x.moveTo(0, oy); x.lineTo(cv.width, oy); x.stroke(); x.setLineDash([]);
    pintaPiezas(x, c.P, vista.k);
    if (tiro) { x.strokeStyle = 'rgba(31,138,76,.8)'; x.lineWidth = 5; x.setLineDash([6, 5]);
      if (tiro.aro) { x.beginPath(); x.arc(ox, oy, tiro.r * vista.k, 0, 7); x.stroke(); }
      else copiasBarra(tiro.a[0], tiro.a[1], tiro.b[0], tiro.b[1]).forEach(q => { const [p1, p2] = aP(q[0], q[1]), [p3, p4] = aP(q[2], q[3]); x.beginPath(); x.moveTo(p1, p2); x.lineTo(p3, p4); x.stroke(); });
      x.setLineDash([]); }
    const ay = $('#es-ayp');
    if (ay) ay.textContent = { pata: 'Toca donde va una pata (con la simetría se ponen las copias solas).', arriba: 'Arrastra de un punto a otro para poner una barra debajo de la piedra (bastidor).', piso: 'Arrastra para poner una barra que va en el piso (pie).', aro: 'Arrastra desde el centro para el tamaño del aro de arriba.', aropiso: 'Arrastra desde el centro para el tamaño del aro que va en el piso.', borrar: 'Toca una pieza para quitarla (con sus copias).' }[herr] + ' La cuadrícula es de 10 cm; dorado = piedra, punteado = MDF.';
  }
  function pintaPiezas(x, P, k) {
    const yA = c.base.H - 8;
    P.barras.forEach(([a, b, w, h]) => {
      const vert = Math.hypot(b[0] - a[0], b[2] - a[2]) < 1, alto = Math.max(a[1], b[1]) >= yA, bajo = Math.min(a[1], b[1]) <= 8 && Math.max(a[1], b[1]) <= 8;
      const [p1, p2] = aP(a[0], a[2]), [p3, p4] = aP(b[0], b[2]);
      if (vert) { const s = Math.max(w, h) * k; x.fillStyle = '#16140f'; x.fillRect(p1 - s / 2, p2 - s / 2, s, s); return; }
      x.strokeStyle = bajo ? '#8a7f70' : alto ? '#3a3733' : '#5c5650'; x.lineWidth = Math.max(3, w * k); x.lineCap = 'butt'; x.beginPath(); x.moveTo(p1, p2); x.lineTo(p3, p4); x.stroke();
    });
    if (P.ped) { const [ox, oy] = aP(0, 0); x.beginPath(); x.arc(ox, oy, P.ped.plato / 2 * k, 0, 7); x.fillStyle = 'rgba(58,55,51,.25)'; x.fill(); x.beginPath(); x.arc(ox, oy, P.ped.columna / 2 * k, 0, 7); x.fillStyle = '#16140f'; x.fill(); }
  }
  function eventosPlanta() {
    const cv = $('#es-cp'); if (!cv) return;
    const pl = () => m.planta, snap = ([x, z]) => {
      // se pega a una pata o punta cercana; si no, al centímetro
      const P = pl(), cand = P.postes.concat(...P.arriba.map(q => [[q[0], q[1]], [q[2], q[3]]]), ...P.piso.map(q => [[q[0], q[1]], [q[2], q[3]]]));
      const k = cand.find(q => Math.hypot(q[0] - x, q[1] - z) * vista.k < 16); return k ? [k[0], k[1]] : [Math.round(x), Math.round(z)];
    };
    cv.onpointerdown = e => {
      cv.setPointerCapture(e.pointerId); vista = vistaP; const q = snap(aM(...puntoDe(cv, e))), P = pl();
      if (herr === 'pata') { copias(q[0], q[1]).forEach(p => { if (!P.postes.some(o => Math.hypot(o[0] - p[0], o[1] - p[1]) < 1)) P.postes.push(p); }); return todo(); }
      if (herr === 'borrar') return borrarEn(q);
      tiro = herr === 'aro' || herr === 'aropiso' ? { aro: true, r: Math.hypot(q[0], q[1]) } : { a: q, b: q };
      lienzoPlanta();
    };
    cv.onpointermove = e => { if (!tiro) return; vista = vistaP; const q = snap(aM(...puntoDe(cv, e))); if (tiro.aro) tiro.r = Math.round(Math.hypot(q[0], q[1])); else tiro.b = q; lienzoPlanta(); };
    cv.onpointerup = cv.onpointercancel = () => {
      if (!tiro) return; const t = tiro, P = pl(); tiro = null;
      if (t.aro) { if (t.r >= 10) P.aros.push({ r: t.r, nivel: herr === 'aropiso' ? 'piso' : 'arriba' }); }
      else if (Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]) >= 5) { const lst = herr === 'piso' ? P.piso : P.arriba; copiasBarra(t.a[0], t.a[1], t.b[0], t.b[1]).forEach(q => { if (!lst.some(o => igualB(o, q))) lst.push(q); }); }
      todo();
    };
  }
  function borrarEn(q) {
    const P = m.planta, d = 14 / vista.k;
    const pi = P.postes.findIndex(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < d);
    if (pi >= 0) { const cs = copias(...P.postes[pi]); P.postes = P.postes.filter(p => !cs.some(o => Math.hypot(o[0] - p[0], o[1] - p[1]) < 1)); return todo(); }
    for (const k of ['arriba', 'piso']) { const bi = P[k].findIndex(b => G.dSeg(q, [b[0], b[1]], [b[2], b[3]]) < d);
      if (bi >= 0) { const cs = copiasBarra(...P[k][bi]); P[k] = P[k].filter(b => !cs.some(o => igualB(o, b))); return todo(); } }
    const ai = P.aros.findIndex(a => Math.abs(Math.hypot(q[0], q[1]) - a.r) < d); if (ai >= 0) { P.aros.splice(ai, 1); return todo(); }
    if (P.columna && Math.hypot(q[0], q[1]) < Math.max(d, P.columna.plato / 2)) { P.columna = null; return todo(); }
  }

  // ---------- 4 · medidas (ficha) ----------
  function tabMedidas(box) {
    const M = c.m, pi = D.piedra(M.piedra), col = D.color(M.color), v = c.viab, pz = c.piedra, md = c.mdf, vo = c.volados;
    const nomBase = m.base === 'planta' ? 'Diseñada desde arriba' : m.base === 'frente' ? 'Dibujada de frente' + (m.frente && m.frente.nombre ? ' · ' + m.frente.nombre : '') : D.BASES[M.base].nombre;
    const fila = (a, b) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>', tabla = (t, f) => '<div class="es-tb"><h3>' + t + '</h3><table class="es-fi">' + f.join('') + '</table></div>';
    const formaN = (FORMAS.find(f => f[0] === M.forma) || [, ''])[1], mdfA = Math.round(Math.abs(G.area(md.contorno)) / 100) / 100;
    const ptr = c.cortes.filter(z => /^PTR/.test(z.mat)), tramos = Math.ceil(c.metros * 1.1 / 6);
    let lados = '';
    if (M.forma === 'libre' && m.libre) { const p = m.libre.pts; lados = '<div class="es-tb"><h3>Puntos del recorte (cm, desde el centro)</h3><table class="cortes"><tr><th>Punto</th><th>X</th><th>Z</th>' + (m.libre.curva ? '' : '<th>Radio</th>') + '<th>Lado al siguiente</th></tr>'
      + p.map((q, i) => { const n = p[(i + 1) % p.length]; return '<tr><td>' + (i + 1) + '</td><td>' + r1(q[0]) + '</td><td>' + r1(q[1]) + '</td>' + (m.libre.curva ? '' : '<td>' + ((m.libre.radios || [])[i] || 0) + '</td>') + '<td>' + r1(Math.hypot(n[0] - q[0], n[1] - q[1])) + (m.libre.curva ? ' (cuerda)' : '') + '</td></tr>'; }).join('') + '</table>' + (m.libre.curva ? '<p class="nota">Orilla curva que pasa por los puntos: cortar con plantilla 1:1.</p>' : '') + '</div>'; }
    box.innerHTML = '<div id="es-ficha"><div class="es-fcab"><img src="img/dkas-oscuro.png" alt="DKAS"><div><b>' + esc(nombre || 'Diseño sin nombre') + '</b><small>Ficha técnica · ' + new Date().toLocaleDateString('es-MX') + '</small></div></div>'
      + '<p class="es-sem n' + c.nivel + '">' + ['✓ Todo cuadra', '! Funciona, con detalles', '✕ Hay que corregir'][c.nivel] + '</p><img class="es-ffoto" id="es-ffoto" alt="">'
      + '<div class="es-tbs">' + tabla('Piedra', [fila('Piedra', esc(pi.nombre) + (pi.acabado ? ' · ' + esc(pi.acabado) : '')), fila('Forma', formaN), fila(M.forma === 'round' ? 'Diámetro' : 'Largo × ancho', medTxt()), fila('Espesor', '12 mm'),
          M.forma !== 'libre' && M.forma !== 'oval' && M.forma !== 'round' ? fila('Radio de esquinas', (M.forma === 'ovcuad' ? (m.r !== '' && m.r != null ? m.r : D.radio({ forma: 'ovcuad', W: M.W })) : (m.r || 0)) + ' cm') : '',
          fila('Área', pz.m2 + ' m²'), fila('Canto a pulir', pz.perim + ' m'), fila('Peso aprox.', pz.peso + ' kg'), fila('Placas 320 × 160', v.placas + (v.placas > 1 ? ' (' + v.nL + ' × ' + v.nW + ', ' + v.uniones + ' unión' + (v.uniones > 1 ? 'es' : '') + ')' : '')),
          fila('Aprovechamiento', pz.aprov + '% · merma ' + r1(v.placas * 5.12 - pz.m2) + ' m²')])
        + tabla('MDF y alturas', [fila('MDF', md.L + ' × ' + md.W + ' cm · 12 mm · ' + mdfA + ' m²'), fila('Volado piedra → MDF', md.vL === md.vW ? md.vL + ' cm' : md.vL + ' cm cabeceras · ' + md.vW + ' cm lados'),
          fila('Altura total', M.H + ' cm'), fila('Piedra + MDF + pegamento', D.CUBIERTA + ' cm'), fila('Altura de la base', c.base.H + ' cm'), c.personas ? fila('Personas', c.personas + ' (70 cm por lugar)') : ''])
        + tabla('Base', [fila('Base', esc(nomBase)), fila('Color', col.nombre), vo ? fila('Huella de la base', vo.baseL + ' × ' + vo.baseW + ' cm') : '', vo ? fila('De la orilla a la base', 'cabeceras ' + vo.izq + ' / ' + vo.der + ' cm · lados ' + vo.atras + ' / ' + vo.frente + ' cm') : '',
          c.volReal != null ? fila('Volado real', 'máx. ' + c.volReal + ' cm de donde pisa la base') : '', fila('PTR total', c.metros + ' m' + (ptr.length ? ' · comprar ' + tramos + ' tramo' + (tramos > 1 ? 's' : '') + ' de 6 m (con 10% de merma)' : '')),
          c.base.plato ? fila('Pedestal', 'plato Ø ' + c.base.plato + ' cm · columna ' + (c.base.columna > 10 ? '4 1/2"' : '3 1/2"')) : '']) + '</div>'
      + '<div class="es-tb"><h3>Revisión</h3><ul class="es-revl">' + c.rev.slice().sort((a, b) => b.n - a.n).map(r => '<li class="n' + r.n + '">' + esc(r.t) + '</li>').join('') + '</ul></div>'
      + '<div class="es-tb"><h3>Planos (cm)</h3><div class="es-planos"><figure>' + plano('planta') + '<figcaption>Planta (vista desde arriba)</figcaption></figure><figure>' + plano('frente') + '<figcaption>Frente</figcaption></figure><figure>' + plano('lado') + '<figcaption>Lado</figcaption></figure></div></div>'
      + lados
      + '<div class="es-tb"><h3>Lista de cortes de la base</h3><table class="cortes"><tr><th>Pieza</th><th>Cant.</th><th>Medida</th><th>Material</th></tr>' + c.cortes.map(z => '<tr><td>' + esc(z.pieza) + '</td><td>' + z.cant + '</td><td>' + z.med + ' cm</td><td>' + esc(z.mat) + '</td></tr>').join('') + '</table></div>'
      + '</div><div class="es-pills"><button class="btn oro" id="es-print">Imprimir / guardar PDF</button></div>';
    $('#es-print').onclick = () => { $('#es-ffoto').src = visor.foto(1400, 900, true); setTimeout(() => print(), 250); };
    Promise.resolve(visor.listo && visor.listo()).then(() => { const f = $('#es-ffoto'); if (f && !f.src) f.src = visor.foto(1400, 900, true); });
  }
  // planos SVG en cm: planta, frente y lado, con cotas
  function plano(v) {
    const M = c.m, P = c.P, b = G.caja(c.contorno), H = M.H, Hb = c.base.H, fs = Math.max(M.L, M.W, H) / 26, pad = fs * 5;
    let x0, x1, y0, y1, out = '';
    const ln = (a, bb, cc, d, st) => '<line x1="' + r1(a) + '" y1="' + r1(bb) + '" x2="' + r1(cc) + '" y2="' + r1(d) + '" ' + st + '/>';
    const txt = (x, y, t, rot) => '<text x="' + r1(x) + '" y="' + r1(y) + '" font-size="' + r1(fs) + '" text-anchor="middle"' + (rot ? ' transform="rotate(-90 ' + r1(x) + ' ' + r1(y) + ')"' : '') + '>' + t + '</text>';
    const cota = (a, y, bb, t) => ln(a, y, bb, y, 'class="c"') + ln(a, y - fs / 2, a, y + fs / 2, 'class="c"') + ln(bb, y - fs / 2, bb, y + fs / 2, 'class="c"') + txt((a + bb) / 2, y - fs * 0.45, t);
    const cotaV = (x, a, bb, t) => ln(x, a, x, bb, 'class="c"') + ln(x - fs / 2, a, x + fs / 2, a, 'class="c"') + ln(x - fs / 2, bb, x + fs / 2, bb, 'class="c"') + txt(x - fs * 0.45, (a + bb) / 2, t, true);
    const pts = p => p.map(q => r1(q[0]) + ',' + r1(q[1])).join(' ');
    if (v === 'planta') {
      x0 = b.x0 - pad; x1 = b.x1 + pad; y0 = b.z0 - pad; y1 = b.z1 + pad;
      out += '<polygon points="' + pts(c.contorno) + '" class="p"/><polygon points="' + pts(c.mdf.contorno) + '" class="mdf"/>';
      P.barras.forEach(([a, bb, w]) => { if (Math.hypot(bb[0] - a[0], bb[2] - a[2]) < 1) out += '<rect x="' + r1(a[0] - w / 2) + '" y="' + r1(a[2] - w / 2) + '" width="' + w + '" height="' + w + '" class="b"/>'; else out += ln(a[0], a[2], bb[0], bb[2], 'class="bl" stroke-width="' + w + '"'); });
      if (P.ped) out += '<circle cx="0" cy="0" r="' + P.ped.plato / 2 + '" class="pl"/><circle cx="0" cy="0" r="' + P.ped.columna / 2 + '" class="b"/>';
      out += cota(b.x0, b.z0 - pad * 0.45, b.x1, (M.forma === 'round' ? 'Ø ' : '') + M.L) + (M.forma === 'round' ? '' : cotaV(b.x1 + pad * 0.55, b.z0, b.z1, M.W));
      if (c.volados) { const vo = c.volados, bx0 = b.x0 + vo.izq, bx1 = b.x1 - vo.der; out += cota(bx0, b.z1 + pad * 0.55, bx1, 'base ' + vo.baseL); }
    } else {
      const lado = v === 'lado', k = lado ? 2 : 0, e0 = lado ? b.z0 : b.x0, e1 = lado ? b.z1 : b.x1, me = G.caja(c.mdf.contorno), m0 = lado ? me.z0 : me.x0, m1 = lado ? me.z1 : me.x1;
      x0 = e0 - pad; x1 = e1 + pad * 1.2; y0 = -H - pad * 0.9; y1 = pad * 0.9;
      out += ln(x0, 0, x1, 0, 'class="piso"') + '<rect x="' + r1(e0) + '" y="' + r1(-H) + '" width="' + r1(e1 - e0) + '" height="1.2" class="p"/><rect x="' + r1(m0) + '" y="' + r1(-H + 1.3) + '" width="' + r1(m1 - m0) + '" height="1.2" class="mdfr"/>';
      P.barras.forEach(([a, bb, w, h]) => { const dx = Math.abs(bb[k] - a[k]), dy = Math.abs(bb[1] - a[1]); if (dx < 0.5 && dy < 0.5) return; const sw = dy < 0.5 ? h : w; out += ln(a[k], -a[1], bb[k], -bb[1], 'class="bl" stroke-width="' + sw + '"'); });
      if (P.ped) out += '<rect x="' + r1(-P.ped.plato / 2) + '" y="-1.3" width="' + P.ped.plato + '" height="1.3" class="b"/><rect x="' + r1(-P.ped.columna / 2) + '" y="' + r1(-P.ped.H) + '" width="' + P.ped.columna + '" height="' + r1(P.ped.H - 1.3) + '" class="b"/>';
      out += cota(e0, -H - pad * 0.45, e1, r1(e1 - e0)) + cotaV(e1 + pad * 0.5, -H, 0, 'h ' + H) + cotaV(e1 + pad * 1.0, -Hb, 0, 'base ' + Hb);
    }
    return '<svg viewBox="' + [x0, y0, x1 - x0, y1 - y0].map(r1).join(' ') + '" class="es-svg">' + out + '</svg>';
  }

  // ---------- guardar y abrir ----------
  function chica(url) {
    return new Promise(ok => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); let w = 720, q = 0.82, u; do { cv.width = w; cv.height = Math.round(w * im.height / im.width); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); u = cv.toDataURL('image/jpeg', q); q -= 0.08; w -= 80; } while (u.length > 150000 && w > 300); ok(u); }; im.src = url; });
  }
  async function guardar() {
    const n = ($('#es-nom').value || '').trim(); if (!n) { $('#es-nom').focus(); return ctx.alerta('Ponle nombre al diseño.'); }
    nombre = n; const b = $('#es-guardar'); b.disabled = true; b.textContent = 'Guardando…';
    try {
      await (visor.listo() || Promise.resolve());
      if (!id) id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await A.guardarEstudio(id, { nombre: n, m: JSON.parse(JSON.stringify(m)), foto: await chica(visor.foto(900, 600)), resumen: medTxt() + ' · ' + D.piedra(c.m.piedra).nombre, creado: Date.now() });
      ctx.toast('Diseño guardado');
    } catch (e) { ctx.alerta(e.message); }
    b.disabled = false; b.textContent = 'Guardar';
  }
  // Firebase quita las listas vacías: se rellenan al abrir
  function limpio(x) {
    const n = Object.assign(nueva(), x || {}); n.estudio = 1;
    n.planta = Object.assign({ perfil: 'ligero', postes: [], arriba: [], piso: [], aros: [], columna: null }, n.planta || {});
    ['postes', 'arriba', 'piso', 'aros'].forEach(k => { n.planta[k] = Object.values(n.planta[k] || {}); });
    if (n.libre) { n.libre.pts = Object.values(n.libre.pts || {}); n.libre.radios = Object.values(n.libre.radios || {}); }
    if (n.frente) n.frente.segs = Object.values(n.frente.segs || {});
    return n;
  }
  async function abrirLista() {
    const v = document.createElement('div'); v.className = 'es-modal'; v.innerHTML = '<div class="es-mcaja"><header><b>Mis diseños</b><button class="btn" data-x>Cerrar</button></header><div id="es-ml"><p class="sub">Cargando…</p></div></div>';
    document.body.appendChild(v); const cerrar = () => v.remove();
    v.onclick = e => { if (e.target === v || e.target.closest('[data-x]')) cerrar(); };
    let l; try { l = await A.estudios(); } catch (e) { $('#es-ml').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    const arr = Object.entries(l || {}).sort((a, b) => (b[1].cambiado || 0) - (a[1].cambiado || 0));
    $('#es-ml').innerHTML = arr.length ? '<div class="es-mis">' + arr.map(([k, d]) => '<div class="es-mi">' + (d.foto ? '<img src="' + d.foto + '" alt="">' : '') + '<b>' + esc(d.nombre) + '</b><small>' + esc(d.resumen || '') + (d.por ? ' · ' + esc(d.por) : '') + '</small>'
      + '<div><button class="btn oro" data-ab="' + k + '">Abrir</button><button class="btn" data-du="' + k + '">Duplicar</button><button class="lnk gris" data-bo="' + k + '">Borrar</button></div></div>').join('') + '</div>' : '<p class="sub">Todavía no guardas diseños.</p>';
    v.querySelectorAll('[data-ab],[data-du]').forEach(b => b.onclick = () => { const k = b.dataset.ab || b.dataset.du, d = l[k]; m = limpio(d.m); sel = -1;
      if (b.dataset.ab) { id = k; nombre = d.nombre; } else { id = null; nombre = d.nombre + ' (copia)'; }
      $('#es-nom').value = nombre; cerrar(); todo(); });
    v.querySelectorAll('[data-bo]').forEach(b => b.onclick = async () => { if (!confirm('¿Borrar "' + l[b.dataset.bo].nombre + '"?')) return; try { await A.borrarEstudio(b.dataset.bo); if (id === b.dataset.bo) id = null; cerrar(); abrirLista(); } catch (e) { ctx.alerta(e.message); } });
  }

  window.DKAS_ESTUDIO = { pantalla, salir };
})();

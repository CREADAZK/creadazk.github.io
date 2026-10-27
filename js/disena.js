/* DKAS · Diseñar bases (panel). Se dibuja la base vista de frente; el sistema la vuelve una base que sí se fabrica
   (líneas rectas, ángulos limpios, simétrica, que llegue al piso y al bastidor), la muestra en 3D con sus cortes,
   y si no gusta propone otra, y otra, hasta que guste. Al subirla queda en el catálogo (panel y página de clientes). */
(function () {
  const D = window.DKAS, A = window.DAZK_API, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = A.esc, PRUEBA = 'zz-prueba';
  // lienzo: la base va de x = 100 a 900 (de -1 a 1) y de y = 500 (piso) a 110 (abajo del MDF)
  const CW = 1000, CH = 560, X0 = 100, X1 = 900, PISO = 500, ARRIBA = 110;
  const aD = (px, py) => [(px - X0) / (X1 - X0) * 2 - 1, (PISO - py) / (PISO - ARRIBA)];
  const aC = (x, y) => [X0 + (x + 1) / 2 * (X1 - X0), PISO - y * (PISO - ARRIBA)];
  const MESA = { uso: 'comedor', forma: 'rect', L: 240, W: 100, piedra: 'statuario' };
  // proporción real: media base ≈ 105 cm de largo por ≈ 67 cm de alto (para que los ángulos sean los de verdad)
  const PX = 105, PY = 67;

  const VARIANTES = [
    { nombre: 'Limpia y simétrica', eps: 0.035, ang: 15, sym: true, perfil: 'ligero' },
    { nombre: 'Robusta', eps: 0.05, ang: 15, sym: true, perfil: 'robusto' },
    { nombre: 'Líneas puras a 45°', eps: 0.07, ang: 45, sym: true, perfil: 'robusto' },
    { nombre: 'En placa de solera', eps: 0.04, ang: 15, sym: true, perfil: 'solera' },
    { nombre: 'Como la dibujaste', eps: 0.025, ang: 5, sym: false, perfil: 'ligero' },
  ];
  function variante(n) {
    if (n < VARIANTES.length) return VARIANTES[n];
    // ya se probaron las de siempre: combinaciones nuevas
    const r = k => { const x = Math.sin(n * 9301 + k * 49297) * 233280; return x - Math.floor(x); };
    const angs = [5, 10, 15, 22.5, 30, 45], pf = ['ligero', 'robusto', 'solera'];
    return { nombre: 'Propuesta ' + (n + 1), eps: 0.02 + r(1) * 0.07, ang: angs[Math.floor(r(2) * angs.length)], sym: r(3) < 0.75, perfil: pf[Math.floor(r(4) * pf.length)] };
  }

  // ---------- el rediseño ----------
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    let im = 0, dm = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L; if (d > dm) { dm = d; im = i; } }
    return dm > eps ? rdp(pts.slice(0, im + 1), eps).slice(0, -1).concat(rdp(pts.slice(im), eps)) : [a, b];
  }
  function redisenar(trazos, v) {
    let segs = [];
    trazos.forEach(t => { const p = rdp(t, v.eps); for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]); });
    const largo = q => Math.hypot((q[2] - q[0]) * PX, (q[3] - q[1]) * PY);
    segs = segs.filter(q => largo(q) > 6);
    // al piso y al bastidor
    const pega = y => y < 0.1 ? 0 : y > 0.9 ? 1 : y;
    segs = segs.map(([a, b, c, d]) => [a, pega(b), c, pega(d)]);
    // ángulos limpios: se gira el tramo sobre la punta que toca piso o bastidor
    segs = segs.map(q => {
      let [x1, y1, x2, y2] = q; if (!(y1 === 0 || y1 === 1) && (y2 === 0 || y2 === 1)) [x1, y1, x2, y2] = [x2, y2, x1, y1];
      const dx = (x2 - x1) * PX, dy = (y2 - y1) * PY, L = Math.hypot(dx, dy);
      // se endereza al ángulo limpio más cercano, pero solo si ya casi lo era (no se pierde el diseño)
      const g0 = Math.atan2(dy, dx) * 180 / Math.PI, gA = Math.round(g0 / v.ang) * v.ang, tol = Math.min(v.ang / 2, 12);
      const a = (Math.abs(g0 - gA) <= tol ? gA : Math.round(g0 / 5) * 5) * Math.PI / 180;
      let nx = x1 + Math.cos(a) * L / PX, ny = y1 + Math.sin(a) * L / PY;
      // si el otro extremo iba al piso o arriba, que llegue exacto
      if (y2 === 0 || y2 === 1) { if (Math.abs(Math.sin(a)) > 0.05) { const t = (y2 - y1) * PY / Math.sin(a); nx = x1 + Math.cos(a) * t / PX; ny = y2; } }
      return [x1, y1, nx, ny];
    });
    // simétrica: se queda el lado con más dibujo y se copia al otro
    if (v.sym) {
      const izq = segs.filter(q => (q[0] + q[2]) / 2 <= 0.02), der = segs.filter(q => (q[0] + q[2]) / 2 > 0.02);
      const lado = izq.reduce((a, q) => a + largo(q), 0) >= der.reduce((a, q) => a + largo(q), 0) ? izq : der.map(q => [-q[0], q[1], -q[2], q[3]]);
      segs = lado.concat(lado.filter(q => Math.abs(q[0]) > 0.01 || Math.abs(q[2]) > 0.01).map(q => [-q[0], q[1], -q[2], q[3]]));
    }
    // uniones: puntas cercanas se vuelven la misma
    const pts = []; segs.forEach(q => { pts.push([q, 0], [q, 2]); });
    pts.forEach(([q, i]) => pts.forEach(([r, j]) => { if (q !== r && Math.hypot((q[i] - r[j]) * PX, (q[i + 1] - r[j + 1]) * PY) < 7) { const mx = (q[i] + r[j]) / 2, my = (q[i + 1] + r[j + 1]) / 2; q[i] = r[j] = mx; q[i + 1] = r[j + 1] = my; } }));
    // las puntas sueltas que caen sobre otra pieza se sueldan a ella (el travesaño llega justo a la pata)
    segs.forEach(q => [0, 2].forEach(i => {
      if (q[i + 1] === 0 || q[i + 1] === 1) return;
      // la punta se alarga o se acorta en su misma dirección hasta tocar la otra pieza (no se tuerce)
      const j = 2 - i, ox = q[j] * PX, oy = q[j + 1] * PY, px = q[i] * PX, py = q[i + 1] * PY, ux = px - ox, uy = py - oy;
      let mejor = null;
      segs.forEach(r => { if (r === q) return; const ax = r[0] * PX, ay = r[1] * PY, vx = r[2] * PX - ax, vy = r[3] * PY - ay, den = ux * vy - uy * vx;
        if (Math.abs(den) < 1e-6) return;
        const s = ((ax - ox) * vy - (ay - oy) * vx) / den, t = ((ax - ox) * uy - (ay - oy) * ux) / den;
        if (t < -0.02 || t > 1.02) return;
        const cx = ox + s * ux, cy = oy + s * uy, d = Math.hypot(px - cx, py - cy);
        if (d < 12 && (!mejor || d < mejor[0])) mejor = [d, cx / PX, cy / PY]; });
      if (mejor) { q[i] = mejor[1]; q[i + 1] = mejor[2]; }
    }));
    // a la cuadrícula del taller y dentro de la mesa
    const g = 0.0125, cl = (n, a, b) => Math.max(a, Math.min(b, n));
    segs = segs.map(q => [cl(Math.round(q[0] / g) * g, -1, 1), cl(Math.round(q[1] / g) * g, 0, 1), cl(Math.round(q[2] / g) * g, -1, 1), cl(Math.round(q[3] / g) * g, 0, 1)].map(n => Math.round(n * 10000) / 10000))
      .filter(q => largo(q) > 6);
    const vistos = new Set(); segs = segs.filter(q => { const k = [q, [q[2], q[3], q[0], q[1]]].map(z => z.join(',')).sort()[0]; if (vistos.has(k)) return false; vistos.add(k); return true; });
    if (!segs.length) return { error: 'Dibuja líneas más largas: no salió ninguna pieza.' };
    if (!segs.some(q => q[1] === 0 || q[3] === 0)) return { error: 'La base tiene que llegar al piso. Dibuja hasta la línea de abajo.' };
    if (!segs.some(q => q[1] === 1 || q[3] === 1)) return { error: 'La base tiene que llegar arriba (al bastidor). Dibuja hasta la línea de arriba.' };
    return { segs, perfil: v.perfil, nombre: v.nombre };
  }

  // ---------- dibujo de frente (SVG) de una propuesta ----------
  function svgFrente(segs, perfil) {
    const w = Math.max(3, D.PERFILES[perfil].alto * 1.1);
    return '<svg viewBox="0 0 ' + CW + ' ' + CH + '" class="frente">'
      + '<rect x="40" y="70" width="920" height="14" rx="3" fill="#d9d4cb"/><rect x="' + X0 + '" y="84" width="' + (X1 - X0) + '" height="10" fill="#2a2826"/>'
      + '<rect x="' + X0 + '" y="94" width="' + (X1 - X0) + '" height="16" fill="#3a3733"/>'
      + '<line x1="20" y1="' + PISO + '" x2="980" y2="' + PISO + '" stroke="#bcb5aa" stroke-width="2"/>'
      + segs.map(([a, b, c, d]) => { const p = aC(a, b), q = aC(c, d); return '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '" stroke="#1d1b18" stroke-width="' + w + '" stroke-linecap="square"/>'; }).join('')
      + '</svg>';
  }

  // ---------- la pantalla ----------
  let trazos = [], n = 0, prop = null, visor = null, ctx = null;
  function pantalla(main, c) {
    ctx = c; trazos = []; n = 0; prop = null;
    const bases = D.propias.filter(id => id !== PRUEBA);
    main.innerHTML = '<div class="cab"><div><h1>Diseñar bases</h1><p class="sub">Dibuja la base como la imaginas. El sistema la vuelve una base que sí se fabrica, la ves en 3D y si te gusta la subes.</p></div></div>'
      + '<section class="sec"><h2><span>1</span>Dibuja la base vista de frente</h2>'
      + '<p class="nota">Arriba está la piedra y el bastidor; abajo el piso. Dibuja las patas con el dedo o el mouse, de arriba hasta el piso. Puedes dibujar solo la mitad izquierda: el sistema la copia del otro lado.</p>'
      + '<div class="lienzo"><canvas id="dz" width="' + CW + '" height="' + CH + '"></canvas></div>'
      + '<div class="botones"><button class="btn" id="dz-des">↶ Deshacer</button><button class="btn" id="dz-borra">Borrar todo</button><button class="btn negro" id="dz-ok">Rediseñar →</button></div></section>'
      + '<section class="sec" id="dz-prop" hidden><h2><span>2</span>Así la haríamos</h2><p class="prop-n" id="dz-n"></p><div class="prop" id="dz-grid"><div id="dz-frente"></div><div class="visor3d" id="dz-3d"></div></div><div id="dz-cont"></div></section>'
      + '<section class="sec"><h2><span>3</span>Bases diseñadas</h2>' + (bases.length ? '<div class="mis-bases">' + bases.map(id => { const b = D.BASES[id]; return '<div class="mb">' + (b.foto ? '<img src="' + b.foto + '" alt="">' : '') + '<b>' + esc(b.nombre) + '</b><small>' + esc(D.PERFILES[b.perfil].nombre) + '</small><button class="lnk gris" data-quita="' + id + '">Quitar</button></div>'; }).join('') + '</div>' : '<p class="nota">Todavía no hay. La que subas aparece aquí, en los pedidos y en la página de clientes.</p>') + '</section>';
    pizarra();
    $('#dz-des').onclick = () => { trazos.pop(); pizarra(); };
    $('#dz-borra').onclick = () => { trazos = []; pizarra(); $('#dz-prop').hidden = true; };
    $('#dz-ok').onclick = () => { n = 0; proponer(); };
    $$('[data-quita]').forEach(b => b.onclick = async () => {
      if (!confirm('¿Quitar la base "' + D.BASES[b.dataset.quita].nombre + '" del catálogo? Los pedidos que ya la tienen no cambian.')) return;
      try { await A.borrarBase(b.dataset.quita); D.quitarBase(b.dataset.quita); ctx.toast('Base quitada'); pantalla(main, ctx); } catch (e) { ctx.alerta(e.message); }
    });
  }
  function pizarra() {
    const cv = $('#dz'), g = cv.getContext('2d');
    const dibuja = () => {
      g.clearRect(0, 0, CW, CH); g.fillStyle = '#fbfaf8'; g.fillRect(0, 0, CW, CH);
      // guías: piedra, MDF, bastidor, piso y el centro
      g.fillStyle = '#d9d4cb'; g.fillRect(40, 70, 920, 14); g.fillStyle = '#2a2826'; g.fillRect(X0, 84, X1 - X0, 10); g.fillStyle = '#3a3733'; g.fillRect(X0, 94, X1 - X0, 16);
      g.strokeStyle = '#bcb5aa'; g.lineWidth = 2; g.beginPath(); g.moveTo(20, PISO); g.lineTo(980, PISO); g.stroke();
      g.setLineDash([6, 8]); g.strokeStyle = '#d6d0c6'; g.beginPath(); g.moveTo(CW / 2, 115); g.lineTo(CW / 2, PISO); g.stroke();
      [X0, X1].forEach(x => { g.beginPath(); g.moveTo(x, 115); g.lineTo(x, PISO); g.stroke(); }); g.setLineDash([]);
      g.fillStyle = '#9b958b'; g.font = '600 15px Inter,Arial'; g.fillText('PIEDRA', 50, 62); g.fillText('PISO', 30, PISO + 24); g.fillText('centro', CW / 2 - 22, 132);
      g.strokeStyle = '#1d1b18'; g.lineWidth = 7; g.lineCap = g.lineJoin = 'round';
      trazos.forEach(t => { g.beginPath(); t.forEach(([x, y], i) => { const [px, py] = aC(x, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); });
    };
    dibuja();
    let actual = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return aD((e.clientX - r.left) * CW / r.width, (e.clientY - r.top) * CH / r.height); };
    cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); actual = [pos(e)]; trazos.push(actual); dibuja(); e.preventDefault(); };
    cv.onpointermove = e => { if (!actual) return; actual.push(pos(e)); dibuja(); };
    cv.onpointerup = cv.onpointercancel = () => { if (actual && actual.length < 2) trazos.pop(); actual = null; dibuja(); };
  }
  async function proponer() {
    const box = $('#dz-prop'), cont = $('#dz-cont');
    if (!trazos.length) return ctx.alerta('Primero dibuja la base.');
    const v = variante(n), r = redisenar(trazos, v);
    box.hidden = false;
    $('#dz-grid').hidden = !!r.error; $('#dz-n').hidden = !!r.error;
    if (r.error) { cont.innerHTML = '<p class="aviso-rojo">' + esc(r.error) + '</p>'; box.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    prop = r;
    D.registrarBase(PRUEBA, { nombre: 'Prueba', segs: r.segs, perfil: r.perfil });
    const m = D.normalizar(Object.assign({ base: PRUEBA }, MESA)), c = D.calcular(m);
    $('#dz-n').innerHTML = 'Propuesta ' + (n + 1) + ' · <b>' + esc(r.nombre) + '</b> · ' + esc(D.PERFILES[r.perfil].nombre);
    $('#dz-frente').innerHTML = '<div class="frente-box">' + svgFrente(r.segs, r.perfil) + '</div><p class="nota">Vista de frente, ya derechita. Medidas de ejemplo en una mesa de 240 × 100.</p>';
    cont.innerHTML = '<table class="cortes"><tr><th>Pieza</th><th>Cant.</th><th>Medida</th><th>Material</th></tr>' + c.cortes.map(z => '<tr><td>' + esc(z.pieza) + '</td><td>' + z.cant + '</td><td>' + z.med + ' cm</td><td>' + esc(z.mat) + '</td></tr>').join('') + '</table>'
      + '<p class="nota">' + c.metros + ' m de PTR para esta mesa de ejemplo.</p>'
      + '<div class="decide"><button class="btn" id="dz-otra">No me gusta, otra propuesta ↻</button><button class="btn" id="dz-redibuja">Volver a dibujar</button></div>'
      + '<div class="subir"><label>Nombre de la base<input id="dz-nom" placeholder="Ej. Arco, Delta, Puente…"></label><button class="btn oro" id="dz-sube">Me gusta, subirla ✓</button></div>';
    if (!visor) visor = DKAS3D.crear($('#dz-3d'), { tex: 'tex/piedras/1k/', fondo: 0xf3f1ed });
    visor.sillas(false); visor.mostrar(m);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#dz-otra').onclick = () => { n++; proponer(); };
    $('#dz-redibuja').onclick = () => { $('#dz').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    $('#dz-sube').onclick = () => subir(m);
  }
  async function subir(m) {
    const nom = $('#dz-nom').value.trim(); if (!nom) { $('#dz-nom').focus(); return ctx.alerta('Ponle nombre a la base.'); }
    const base = String(nom).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'base';
    let id = base, k = 2; while (D.BASES[id] && id !== PRUEBA) id = base + '-' + k++;
    const b = $('#dz-sube'); b.disabled = true; b.textContent = 'Subiendo…';
    try {
      await (visor.listo() || Promise.resolve());
      const foto = await chica(visor.foto(900, 600));
      const data = { nombre: nom, desc: 'Diseño DKAS · ' + D.PERFILES[prop.perfil].nombre + '.', segs: prop.segs, perfil: prop.perfil, foto, creado: Date.now() };
      await A.guardarBase(id, data);
      D.quitarBase(PRUEBA); D.registrarBase(id, data);
      ctx.toast('¡Listo! "' + nom + '" ya está en el catálogo'); visor = null; pantalla($('#m'), ctx);
    } catch (e) { b.disabled = false; b.textContent = 'Me gusta, subirla ✓'; ctx.alerta(e.message); }
  }
  // foto chica para guardar (JPEG < 150 KB)
  function chica(url) {
    return new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); let w = 720, q = 0.82, u; do { c.width = w; c.height = Math.round(w * im.height / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); u = c.toDataURL('image/jpeg', q); q -= 0.08; w -= 80; } while (u.length > 150000 && w > 300); ok(u); }; im.src = url; });
  }
  // al salir de la pantalla la base de prueba no se queda en las listas
  function salir() { if (D.BASES[PRUEBA]) D.quitarBase(PRUEBA); visor = null; }

  window.DKAS_DISENA = { pantalla, salir, redisenar, VARIANTES };
})();

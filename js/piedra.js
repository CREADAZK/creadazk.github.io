/* DKAS · cortes de piedra para cortadora de puente. Todo en cm.
   Solo cortes de guillotina: cada corte va recto de lado a lado del pedazo que se está cortando.
   Cómo acomoda: cada pieza entra en un espacio libre; ese espacio se parte con 2 cortes rectos (uno de lado a lado
   del espacio y otro de lado a lado de la tira), así que el resultado siempre se puede cortar en la máquina.
   El disco se come `kerf` cm en cada corte; a una placa completa se le refilan `refilado` cm por lado (a un retazo no:
   sus orillas ya vienen cortadas). Redondas = su cuadro de Ø × Ø. Rectangulares se pueden girar 90°.
   Se prueban varias reglas (orden, dónde poner cada pieza, hacia dónde partir) y se queda la mejor. */
(function (root) {
  const DEF = { kerf: 0.5, refilado: 1, minSob: 15 };
  const EPS = 1e-6, r1 = n => Math.round(n * 10) / 10;

  // ---------- piezas ----------
  // pieza del catálogo: { nombre, forma: 'red'|'rect', d } o { nombre, forma: 'rect', w, h }
  const medida = p => p.forma === 'red' ? 'Ø' + r1(p.d) : r1(p.w) + '×' + r1(p.h);
  const etiqueta = p => (p.nombre ? p.nombre + ' ' : '') + medida(p);
  // pedido = [{ pieza, cant }] → una lista con cada pieza suelta y su huella (cuadro que ocupa)
  function expandir(pedido) {
    const l = [];
    pedido.forEach((x, k) => {
      const p = x.pieza, w = +(p.forma === 'red' ? p.d : p.w), h = +(p.forma === 'red' ? p.d : p.h);
      if (!(w > 0 && h > 0)) throw new Error('La pieza ' + (p.nombre || '') + ' no tiene medidas.');
      for (let i = 0; i < (Math.max(0, Math.floor(+x.cant || 0))); i++) l.push({ k, nombre: p.nombre || '', forma: p.forma === 'red' ? 'red' : 'rect', w, h, et: etiqueta(p) });
    });
    return l;
  }

  // ---------- un espacio (una placa o un retazo) con una regla ----------
  const ORDEN = {
    area: (a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    lado: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
    perim: (a, b) => (b.w + b.h) - (a.w + a.h) || b.w * b.h - a.w * a.h,
  };
  const FIT = { // menor = mejor
    area: (F, w, h) => F.w * F.h - w * h,
    corto: (F, w, h) => Math.min(F.w - w, F.h - h),
    largo: (F, w, h) => Math.max(F.w - w, F.h - h),
  };
  const SPLIT = { // true = primero el corte horizontal de lado a lado del espacio
    sobraCorto: (F, w, h) => F.w - w <= F.h - h,
    sobraLargo: (F, w, h) => F.w - w > F.h - h,
    areaMin: (F, w, h) => w * (F.h - h) > (F.w - w) * h,
    areaMax: (F, w, h) => w * (F.h - h) <= (F.w - w) * h,
    ejeCorto: F => F.w <= F.h,
    ejeLargo: F => F.w > F.h,
  };
  const REGLAS = [];
  Object.keys(ORDEN).forEach(o => Object.keys(FIT).forEach(f => Object.keys(SPLIT).forEach(s => REGLAS.push([o, f, s]))));

  function corrida(items, W, H, kerf, [o, f, s]) {
    const libres = [{ x: 0, y: 0, w: W, h: H }], puestas = [], cortes = [], faltan = [];
    items.slice().sort(ORDEN[o]).forEach(it => {
      let best = null;
      libres.forEach((F, i) => (it.forma === 'rect' && it.w !== it.h ? [false, true] : [false]).forEach(rot => {
        const w = rot ? it.h : it.w, h = rot ? it.w : it.h;
        if (w > F.w + EPS || h > F.h + EPS) return;
        const sc = FIT[f](F, w, h);
        if (!best || sc < best.sc - EPS || (Math.abs(sc - best.sc) <= EPS && (F.y < best.F.y - EPS || (Math.abs(F.y - best.F.y) <= EPS && F.x < best.F.x)))) best = { i, F, rot, w, h, sc };
      }));
      if (!best) return faltan.push(it);
      const { F, w, h } = best; libres.splice(best.i, 1);
      puestas.push(Object.assign({}, it, { x: F.x, y: F.y, w, h, rot: best.rot }));
      const hz = SPLIT[s](F, w, h), sobraW = F.w - w > EPS, sobraH = F.h - h > EPS;
      let der, aba;
      if (hz) { // horizontal de lado a lado del espacio, luego vertical en la tira de arriba
        if (sobraH) cortes.push({ o: 'h', pos: F.y + h, a: F.x, b: F.x + F.w });
        if (sobraW) cortes.push({ o: 'v', pos: F.x + w, a: F.y, b: F.y + h });
        der = { x: F.x + w + kerf, y: F.y, w: F.w - w - kerf, h }; aba = { x: F.x, y: F.y + h + kerf, w: F.w, h: F.h - h - kerf };
      } else { // vertical de arriba a abajo del espacio, luego horizontal en la tira de la izquierda
        if (sobraW) cortes.push({ o: 'v', pos: F.x + w, a: F.y, b: F.y + F.h });
        if (sobraH) cortes.push({ o: 'h', pos: F.y + h, a: F.x, b: F.x + w });
        der = { x: F.x + w + kerf, y: F.y, w: F.w - w - kerf, h: F.h }; aba = { x: F.x, y: F.y + h + kerf, w, h: F.h - h - kerf };
      }
      [der, aba].forEach(r => { if (r.w > EPS && r.h > EPS) libres.push(r); });
    });
    return { puestas, cortes, libres, faltan };
  }
  // la mejor regla para un espacio: más piezas puestas, luego el sobrante más grande, luego menos cortes
  const mayorLibre = l => l.reduce((m, r) => Math.max(m, Math.min(r.w, r.h) >= DEF.minSob ? r.w * r.h : 0), 0);
  function mejor(items, W, H, kerf) {
    let b = null;
    REGLAS.forEach(R => {
      const c = corrida(items, W, H, kerf, R), sc = [c.puestas.length, mayorLibre(c.libres), -c.cortes.length];
      if (!b || sc[0] > b.sc[0] || (sc[0] === b.sc[0] && (sc[1] > b.sc[1] + EPS || (Math.abs(sc[1] - b.sc[1]) <= EPS && sc[2] > b.sc[2])))) b = Object.assign(c, { sc, regla: R });
    });
    return b;
  }

  // ---------- un espacio físico: placa completa (con refilado) o retazo ----------
  // esp = { tipo: 'placa'|'retazo', id?, w, h }  → resultado en coordenadas de la pieza real (desde su orilla izquierda y de arriba)
  function cortarEn(items, esp, cfg) {
    const ref = esp.tipo === 'placa' ? cfg.refilado : 0, W = esp.w - 2 * ref, H = esp.h - 2 * ref;
    if (W <= 0 || H <= 0) return { esp, puestas: [], cortes: [], libres: [], faltan: items.slice(), sobrantes: [], ref };
    const m = mejor(items, W, H, cfg.kerf), mv = r => Object.assign({}, r, { x: r1(r.x + ref), y: r1(r.y + ref), w: r1(r.w), h: r1(r.h) });
    const puestas = m.puestas.map(mv), libres = m.libres.map(mv);
    const cortes = (ref > 0 ? [{ o: 'ref', txt: 'Refilar las 4 orillas (' + r1(ref) + ' cm por lado)' }] : []).concat(m.cortes.map(c => ({ o: c.o, pos: r1(c.pos + ref), a: r1(c.a + ref), b: r1(c.b + ref) })));
    const sobrantes = libres.filter(r => r.w >= cfg.minSob - EPS && r.h >= cfg.minSob - EPS);
    const area = esp.w * esp.h, usada = puestas.reduce((s, p) => s + p.w * p.h, 0);
    return { esp, ref, puestas, cortes, libres, faltan: m.faltan, sobrantes, pct: Math.round(usada / area * 100), mermaPct: Math.round((area - usada - sobrantes.reduce((s, r) => s + r.w * r.h, 0)) / area * 100) };
  }
  // llena espacios en orden hasta poner todo (cada espacio con su mejor regla)
  function llenar(items, espacios, cfg) {
    let quedan = items.slice(); const usados = [];
    for (const e of espacios) { if (!quedan.length) break; const r = cortarEn(quedan, e, cfg); if (!r.puestas.length) continue; usados.push(r); quedan = r.faltan; }
    return { usados, faltan: quedan };
  }

  // ---------- ¿Me cabe? ----------
  // inv = { placas: [{ id, w, h, cant }], retazos: [{ id, w, h }] } de UNA piedra; placaStd = { w: 320, h: 160 }
  function meCabe(pedido, inv, cfg0, placaStd) {
    const cfg = Object.assign({}, DEF, cfg0 || {}), std = placaStd || { w: 320, h: 160 }, items = expandir(pedido);
    if (!items.length) return { estado: 'error', msg: 'Elige al menos una pieza.' };
    if (items.length > 200) return { estado: 'error', msg: 'Son demasiadas piezas para un cálculo (máximo 200).' };
    // una pieza que no cabe ni en la placa completa (ni girada) es un error, no un faltante
    const placasInv = (inv.placas || []).filter(p => p.cant > 0), maxW = Math.max(std.w, ...placasInv.map(p => p.w)), maxH = Math.max(std.h, ...placasInv.map(p => p.h));
    const uW = maxW - 2 * cfg.refilado, uH = maxH - 2 * cfg.refilado;
    const grande = items.find(it => !((it.w <= uW + EPS && it.h <= uH + EPS) || (it.forma === 'rect' && it.h <= uW + EPS && it.w <= uH + EPS)) && !(inv.retazos || []).some(r => (it.w <= r.w + EPS && it.h <= r.h + EPS) || (it.h <= r.w + EPS && it.w <= r.h + EPS)));
    if (grande) return { estado: 'error', msg: 'La pieza ' + grande.et + ' (' + r1(grande.w) + ' × ' + r1(grande.h) + ' cm) es más grande que la placa: en una placa de ' + maxW + ' × ' + maxH + ' cm caben como máximo ' + r1(uW) + ' × ' + r1(uH) + ' cm después de refilar.' };
    // 1) un solo retazo, del más chico al más grande
    const ret = (inv.retazos || []).slice().sort((a, b) => a.w * a.h - b.w * b.h);
    for (const r of ret) { const c = cortarEn(items, Object.assign({ tipo: 'retazo' }, r), cfg); if (!c.faltan.length) return fin({ estado: 'retazo', espacios: [c] }); }
    // 2) placas completas (las más chicas primero)
    const stock = []; placasInv.slice().sort((a, b) => a.w * a.h - b.w * b.h).forEach(p => { for (let i = 0; i < p.cant; i++) stock.push(Object.assign({ tipo: 'placa' }, p)); });
    const conStock = llenar(items, stock, cfg);
    if (!conStock.faltan.length) return fin({ estado: 'placa', espacios: conStock.usados });
    // 3) no alcanza: cuántas placas más (del tamaño normal) harían falta
    const extra = []; for (let i = 0; i < 60; i++) extra.push({ tipo: 'placa', id: null, w: std.w, h: std.h, nueva: true });
    const conExtra = llenar(conStock.faltan, extra, cfg);
    const nFaltan = conExtra.usados.length;
    return fin({ estado: 'falta', espacios: conStock.usados.concat(conExtra.usados), placasFaltan: nFaltan, piezasFaltan: conStock.faltan.length, tienes: stock.length });

    function fin(r) {
      r.cfg = cfg; r.total = items.length;
      const placas = r.espacios.filter(e => e.esp.tipo === 'placa');
      r.pctPlaca = placas.length ? Math.round(placas.reduce((s, e) => s + e.puestas.reduce((t, p) => t + p.w * p.h, 0), 0) / placas.reduce((s, e) => s + e.esp.w * e.esp.h, 0) * 100) : null;
      return r;
    }
  }

  // ---------- con lo que sobra, ¿qué más sale? ----------
  // por cada pieza del catálogo, cuántas caben en los espacios libres (las grandes primero); devuelve las que salen
  function sugerir(espacios, catalogo, cfg0) {
    const cfg = Object.assign({}, DEF, cfg0 || {}), out = [];
    catalogo.slice().sort((a, b) => huella(b) - huella(a)).forEach(p => {
      let n = 0;
      espacios.forEach(e => e.libres.forEach(r => { const items = expandir([{ pieza: p, cant: 40 }]); n += corrida(items, r.w, r.h, cfg.kerf, ['area', 'corto', 'sobraCorto']).puestas.length; }));
      if (n) out.push({ pieza: p, n, et: etiqueta(p) });
    });
    return out;
  }
  const huella = p => p.forma === 'red' ? p.d * p.d : p.w * p.h;

  // ---------- orden de los cortes, en palabras para el taller ----------
  function pasos(e) {
    return e.cortes.map(c => c.o === 'ref' ? c.txt : c.o === 'h'
      ? 'Corte horizontal a ' + c.pos + ' cm de arriba (de ' + c.a + ' a ' + c.b + ' cm)'
      : 'Corte vertical a ' + c.pos + ' cm del lado izquierdo (de ' + c.a + ' a ' + c.b + ' cm de arriba)');
  }

  // ---------- revisión: ¿se puede separar todo con cortes de lado a lado y con el kerf respetado? (para pruebas) ----------
  function esGuillotina(ps, kerf) {
    if (ps.length <= 1) return true;
    for (const [ax, sz] of [['x', 'w'], ['y', 'h']]) {
      const cand = [...new Set(ps.map(p => p[ax] + p[sz]))];
      for (const c of cand) {
        const a = ps.filter(p => p[ax] + p[sz] <= c + EPS), b = ps.filter(p => p[ax] >= c + kerf - 1e-3);
        if (a.length && b.length && a.length + b.length === ps.length) return esGuillotina(a, kerf) && esGuillotina(b, kerf);
      }
    }
    return false;
  }
  function seEnciman(ps, kerf) {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      const sepX = a.x + a.w + kerf <= b.x + 1e-3 || b.x + b.w + kerf <= a.x + 1e-3, sepY = a.y + a.h + kerf <= b.y + 1e-3 || b.y + b.h + kerf <= a.y + 1e-3;
      if (!sepX && !sepY) return true;
    }
    return false;
  }

  const CORTES = { DEF, expandir, cortarEn, meCabe, sugerir, pasos, etiqueta, medida, esGuillotina, seEnciman };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORTES; else root.DKAS_CORTES = CORTES;
})(typeof window !== 'undefined' ? window : globalThis);

;
/* DKAS · Piedra: inventario de placas y retazos, catálogo de piezas, "¿Me cabe?", cortar e historial, hoja de corte.
   El cálculo vive en cortes.js (DKAS_CORTES). Datos:
     piedra/placas/<id>  = { piedra, w, h, cant, por, creado }
     piedra/retazos/<id> = { piedra, w, h, origen?, por, creado }
     piedra/piezas/<id>  = { nombre, forma: 'red'|'rect', d | w,h, orden }   (se precarga sola la primera vez)
     piedra/cortes/<id>  = { fecha, piedra, nota?, piezas: [{ et, cant }], espacios: [...], por, creado }
     piedra/cfg          = { kerf, refilado, minSob }
   Rutas: #piedra (¿Me cabe?) · #piedra/placas · #piedra/piezas · #piedra/historial · #piedra/hoja (la del cálculo actual) · #piedra/hoja=<id> */
(function () {
  const C = window.DKAS_CORTES;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? Math.round(n * 10) / 10 : NaN; };
  const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const p2 = n => String(n).padStart(2, '0'), hoy = () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const fCorta = f => { const d = new Date(f + 'T12:00'); return d.getDate() + ' ' + MES3[d.getMonth()] + ' ' + d.getFullYear(); };
  const mismo = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const PIEZAS0 = [['Equilibrio', 'red', 60], ['Equilibrio', 'red', 70], ['Equilibrio', 'red', 80], ['Nido', 'red', 40], ['Nido', 'red', 45], ['Nido', 'red', 50], ['Alta', 'red', 60],
    ['Origen', 'rect', 100, 100], ['Origen', 'rect', 120, 120], ['Auxiliar', 'rect', 50, 50]];
  const STD = { w: 320, h: 160 };

  let X, A, main, inv = { placas: [], retazos: [] }, piezas = [], cfg = Object.assign({}, C.DEF), cortes = [], cargado = false;
  let sel = { piedra: '', lista: [] }, res = null, resultados = null, editPieza = null;
  try { const s = JSON.parse(localStorage.getItem('dkas-piedra-sel')); if (s && Array.isArray(s.lista)) sel = s; } catch (e) {}
  const guardaSel = () => { try { localStorage.setItem('dkas-piedra-sel', JSON.stringify(sel)); } catch (e) {} };
  const lista = o => Object.entries(o || {}).map(([id, x]) => Object.assign({ id }, x));
  const nombresPiedra = () => [...new Set((window.DKAS ? window.DKAS.PIEDRAS.map(p => p.nombre) : []).concat(inv.placas.map(p => p.piedra), inv.retazos.map(r => r.piedra)))];

  async function cargar() {
    const [pl, re, pz, cf, co] = await Promise.all(['piedra/placas', 'piedra/retazos', 'piedra/piezas', 'piedra/cfg', 'piedra/cortes'].map(p => A.nodo(p)));
    inv = { placas: lista(pl), retazos: lista(re) };
    piezas = lista(pz).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    cortes = lista(co).sort((a, b) => (b.creado || 0) - (a.creado || 0));
    cfg = Object.assign({}, C.DEF, cf || {});
    if (!pz) { // primera vez: el catálogo precargado
      const u = {}; PIEZAS0.forEach(([nombre, forma, a, b], i) => { u['piedra/piezas/z' + p2(i)] = forma === 'red' ? { nombre, forma, d: a, orden: i } : { nombre, forma, w: a, h: b, orden: i }; });
      await A.nodoVarios(u); piezas = lista(Object.fromEntries(Object.entries(u).map(([k, v]) => [k.split('/').pop(), v])));
    }
    cargado = true;
  }
  async function pantalla(m, ctx, sub) {
    main = m; X = ctx; A = ctx.A;
    if (!$('.pd')) main.innerHTML = '<div class="pd"><p class="cargando">Cargando…</p></div>';
    try { await cargar(); } catch (e) { main.innerHTML = '<div class="pd"><h1>Piedra</h1><p class="err">No se pudo cargar: ' + esc(e.message) + '</p></div>'; return; }
    sub = sub || '';
    if (sub.startsWith('hoja=')) return hojaGuardada(sub.slice(5));
    if (sub === 'hoja') return res && res.estado !== 'error' ? hoja(armarCorte(res), true) : (location.hash = '#piedra');
    if (sub === 'placas') return placas();
    if (sub === 'piezas') return catalogo();
    if (sub === 'historial') return historial();
    meCabe();
  }
  const tabs = on => '<div class="pd-tabs">' + [['', '¿Me cabe?'], ['placas', 'Mis placas'], ['piezas', 'Piezas'], ['historial', 'Historial']].map(([k, t]) => '<a href="#piedra' + (k ? '/' + k : '') + '"' + (on === k ? ' class="on"' : '') + '>' + t + '</a>').join('') + '</div>';

  // ---------- ¿Me cabe? ----------
  function invDe(p) { return { placas: inv.placas.filter(x => mismo(x.piedra, p)), retazos: inv.retazos.filter(x => mismo(x.piedra, p)) }; }
  // piedras que tienen algo en inventario
  const conInventario = () => nombresPiedra().filter(n => { const i = invDe(n); return i.retazos.length || i.placas.some(p => +p.cant > 0); });
  function meCabe() {
    main.innerHTML = '<div class="pd">' + tabs('')
      + '<section class="pd-sec"><h2 class="pd-h">¿Qué quieres cortar?</h2><div class="pd-cat">' + piezas.map(p => '<button data-add="' + esc(p.id) + '"><b>' + esc(p.nombre) + '</b>' + esc(C.medida(p)) + '</button>').join('') + '<button class="pd-esp" id="pd-esp">＋ Otra medida</button></div>'
      + '<div id="pd-espf" hidden class="pd-espf"><div class="dn-per pd-forma"><button data-fm="rect" class="on">Rectangular</button><button data-fm="red">Redonda</button></div>'
      + '<div class="pd-med"><label id="pd-l1">Largo (cm)<input id="pd-ew" inputmode="decimal"></label><label id="pd-l2">Ancho (cm)<input id="pd-eh" inputmode="decimal"></label><label>Nombre (opcional)<input id="pd-en" maxlength="40" placeholder="ej. Mesa Juan"></label></div><button class="btn negro" id="pd-eok">Agregar</button></div>'
      + '<div id="pd-sel"></div><button class="btn negro grande" id="pd-ok">¿Me cabe?</button></section>'
      + '<div id="pd-res"></div></div>';
    $$('[data-add]').forEach(b => b.onclick = () => { const p = piezas.find(x => x.id === b.dataset.add); const ya = sel.lista.find(x => x.pieza.id === p.id); if (ya) ya.cant++; else sel.lista.push({ pieza: p, cant: 1 }); guardaSel(); pintarSel(); limpiarRes(); });
    let forma = 'rect';
    $('#pd-esp').onclick = () => { $('#pd-espf').hidden = !$('#pd-espf').hidden; if (!$('#pd-espf').hidden) $('#pd-ew').focus(); };
    $$('[data-fm]').forEach(b => b.onclick = () => { forma = b.dataset.fm; $$('[data-fm]').forEach(o => o.classList.toggle('on', o === b)); $('#pd-l1').firstChild.textContent = forma === 'red' ? 'Diámetro (cm)' : 'Largo (cm)'; $('#pd-l2').hidden = forma === 'red'; });
    $('#pd-eok').onclick = () => {
      const w = num($('#pd-ew').value), h = forma === 'red' ? w : num($('#pd-eh').value), n = $('#pd-en').value.trim().slice(0, 40);
      if (!(w > 0 && w <= 400 && h > 0 && h <= 400)) return X.alerta('Escribe las medidas en cm (hasta 400).');
      sel.lista.push({ pieza: forma === 'red' ? { id: 'esp' + Date.now(), nombre: n || 'Especial', forma, d: w } : { id: 'esp' + Date.now(), nombre: n || 'Especial', forma, w, h }, cant: 1 });
      guardaSel(); $('#pd-ew').value = $('#pd-eh').value = $('#pd-en').value = ''; $('#pd-espf').hidden = true; pintarSel(); limpiarRes();
    };
    $('#pd-ok').onclick = calcular;
    pintarSel();
    if (resultados) pintarRes();
  }
  const limpiarRes = () => { res = null; resultados = null; const r = $('#pd-res'); if (r) r.innerHTML = ''; };
  function pintarSel() {
    const el = $('#pd-sel'); if (!el) return;
    el.innerHTML = sel.lista.length ? '<div class="pd-lista">' + sel.lista.map((x, i) => '<div><span>' + esc(C.etiqueta(x.pieza)) + (x.pieza.id && String(x.pieza.id).startsWith('esp') ? ' <small>especial</small>' : '') + '</span><button data-m="' + i + '" aria-label="Una menos">−</button><b>' + x.cant + '</b><button data-p="' + i + '" aria-label="Una más">＋</button><button data-q="' + i + '" class="pd-q" aria-label="Quitar">✕</button></div>').join('') + '</div>'
      : '<p class="sub pd-vacio">Toca las piezas que quieres cortar.</p>';
    $$('[data-m]', el).forEach(b => b.onclick = () => { const x = sel.lista[+b.dataset.m]; if (--x.cant < 1) sel.lista.splice(+b.dataset.m, 1); guardaSel(); pintarSel(); limpiarRes(); });
    $$('[data-p]', el).forEach(b => b.onclick = () => { sel.lista[+b.dataset.p].cant = Math.min(99, sel.lista[+b.dataset.p].cant + 1); guardaSel(); pintarSel(); limpiarRes(); });
    $$('[data-q]', el).forEach(b => b.onclick = () => { sel.lista.splice(+b.dataset.q, 1); guardaSel(); pintarSel(); limpiarRes(); });
    const ok = $('#pd-ok'); if (ok) ok.disabled = !sel.lista.length;
  }
  function calcular() {
    if (!sel.lista.length) return X.alerta('Toca las piezas que quieres cortar.');
    const pedido = sel.lista.map(x => ({ et: C.etiqueta(x.pieza), cant: x.cant })), ps = conInventario();
    resultados = (ps.length ? ps : ['']).map(n => Object.assign(C.meCabe(sel.lista, n ? invDe(n) : { placas: [], retazos: [] }, cfg, STD), { piedra: n, pedido }));
    const rango = r => ({ retazo: 0, placa: 1, falta: 2, error: 3 })[r.estado], area = r => r.estado === 'retazo' ? r.espacios[0].esp.w * r.espacios[0].esp.h : 0;
    resultados.sort((a, b) => rango(a) - rango(b) || area(a) - area(b) || (a.placasFaltan || 0) - (b.placasFaltan || 0));
    res = resultados[0]; sel.piedra = res.piedra;
    pintarRes(); $('#pd-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const nombreEsp = e => (e.esp.tipo === 'retazo' ? 'Sobrante ' : e.esp.nueva ? 'Placa nueva ' : 'Placa ') + e.esp.w + '×' + e.esp.h;
  const cuanto = p => p < 30 ? 'un pedazo (' + p + '%)' : p < 60 ? 'como la mitad (' + p + '%)' : p < 85 ? 'casi toda (' + p + '%)' : 'toda (' + p + '%)';
  function frase(r) {
    if (r.estado === 'retazo') return ['verde', '✅', 'Sí cabe en un sobrante de ' + r.espacios[0].esp.w + '×' + r.espacios[0].esp.h];
    if (r.estado === 'placa') { const n = r.espacios.length; return ['ambar', '🟡', n === 1 ? 'Usa 1 placa · ocupas ' + cuanto(r.pctPlaca) : 'Usa ' + n + ' placas · ocupas ' + r.pctPlaca + '%']; }
    return ['rojo', '❌', r.piedra ? 'No te alcanza: te ' + (r.placasFaltan === 1 ? 'falta 1 placa' : 'faltan ' + r.placasFaltan + ' placas') : 'Necesitas ' + (r.placasFaltan === 1 ? '1 placa' : r.placasFaltan + ' placas') + ' · no tienes placas registradas'];
  }
  function pintarRes() {
    const el = $('#pd-res'); if (!el || !resultados) return;
    if (resultados[0].estado === 'error') { el.innerHTML = '<section class="pd-r rojo"><p class="pd-r-t">❌ Esa pieza es más grande que la placa</p><p class="pd-r-s">Lo más grande que sale de una placa es ' + (STD.w - 2 * cfg.refilado) + ' × ' + (STD.h - 2 * cfg.refilado) + ' cm.</p></section>'; return; }
    el.innerHTML = '<h2 class="pd-h pd-h2t">¿Dónde te cabe?</h2><div class="pd-opc">' + resultados.map((r, i) => { const t = frase(r); return '<button class="pd-op ' + t[0] + (r === res ? ' on' : '') + '" data-op="' + i + '"><i>' + t[1] + '</i><span><b>' + esc(r.piedra || 'Placa nueva') + '</b>' + esc(t[2]) + '</span></button>'; }).join('') + '</div>'
      + '<div id="pd-det"></div>';
    $$('[data-op]', el).forEach(b => b.onclick = () => { res = resultados[+b.dataset.op]; sel.piedra = res.piedra; $$('[data-op]', el).forEach(o => o.classList.toggle('on', o === b)); detalle(); });
    detalle();
  }
  // lo que ves al tocar una piedra: el dibujo, lo que te sobra y Cortar
  function detalle() {
    const el = $('#pd-det'), r = res; if (!el || !r) return;
    if (r.estado === 'falta') { el.innerHTML = '<section class="pd-sec pd-det"><p>' + (r.piedra ? 'Con lo que tienes de <b>' + esc(r.piedra) + '</b> no salen todas las piezas.' : 'Agrega tus placas en <a href="#piedra/placas">Mis placas</a> para saber si te cabe.') + '</p><a class="pd-taller" href="#piedra/hoja">Ver cómo quedaría →</a></section>'; return; }
    const sob = r.espacios.flatMap(e => e.sobrantes).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const sug = sob ? C.sugerir(r.espacios, piezas, cfg)[0] : null;
    el.innerHTML = '<section class="pd-sec pd-det">' + r.espacios.map(e => '<p class="pd-et">' + esc(nombreEsp(e)) + '</p>' + dibujo(e, 'simple')).join('')
      + '<p class="pd-sobra">' + (sob ? 'Te sobra un pedazo de <b>' + sob.w + '×' + sob.h + '</b>' + (sug ? ' · ahí sale ' + sug.n + ' ' + esc(sug.et) : '') + '. Se guarda solo.' : 'No te sobra nada que sirva.') + '</p>'
      + '<input id="pd-nota" maxlength="200" placeholder="Nota (opcional): ej. mesa Juan"><button class="btn negro grande" id="pd-cortar">Cortar</button>'
      + '<a class="pd-taller" href="#piedra/hoja">Medidas para el taller →</a></section>';
    $('#pd-cortar').onclick = cortar;
  }
  function posiciones(e) {
    return '<ol class="pd-pos">' + e.puestas.map(p => '<li><b>' + esc(p.et) + '</b>' + (p.rot ? ' <small>(girada)</small>' : '') + '<span>Esquina a ' + p.x + ' cm del lado izquierdo y ' + p.y + ' cm de arriba</span></li>').join('') + '</ol>'
      + (e.sobrantes.length ? '<p class="pd-sob">Sobrante' + (e.sobrantes.length === 1 ? '' : 's') + ' que se guarda' + (e.sobrantes.length === 1 ? '' : 'n') + ': ' + e.sobrantes.map(r => r.w + '×' + r.h).join(', ') + ' · merma ' + e.mermaPct + '%</p>' : '<p class="pd-sob">Sin sobrantes útiles (lo que queda es merma, ' + e.mermaPct + '%).</p>');
  }

  // dibujo en cm (viewBox = la pieza real); atributos en línea para poder convertirlo a imagen
  function dibujo(e, grande) {
    const W = e.esp.w, H = e.esp.h, pad = 14, f = (a, b) => Math.max(4.2, Math.min(9, Math.min(a, b) / 6.5));
    let s = '<svg class="pd-svg" xmlns="http://www.w3.org/2000/svg" viewBox="' + (-pad) + ' ' + (-pad) + ' ' + (W + pad * 2) + ' ' + (H + pad * 2) + '" font-family="Inter,Arial,sans-serif" role="img" aria-label="' + esc(nombreEsp(e)) + ' con ' + e.puestas.length + ' piezas">'
      + '<rect x="' + (-pad) + '" y="' + (-pad) + '" width="' + (W + pad * 2) + '" height="' + (H + pad * 2) + '" fill="#ffffff"/>'
      + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + (e.esp.nueva ? '#f6e9e7' : '#e7e2d9') + '" stroke="#8d867b" stroke-width="0.6"/>'
      + (e.ref && grande !== 'simple' ? '<rect x="' + e.ref + '" y="' + e.ref + '" width="' + (W - 2 * e.ref) + '" height="' + (H - 2 * e.ref) + '" fill="none" stroke="#b9b1a4" stroke-width="0.4" stroke-dasharray="2 1.5"/>' : '')
      + '<text x="' + W / 2 + '" y="' + (-4) + '" font-size="6" text-anchor="middle" fill="#6b665e">' + W + ' cm</text>'
      + '<text x="' + (-4) + '" y="' + H / 2 + '" font-size="6" text-anchor="middle" fill="#6b665e" transform="rotate(-90 ' + (-4) + ' ' + H / 2 + ')">' + H + ' cm</text>';
    e.sobrantes.forEach(r => { s += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="#e3f1e7" stroke="#2e9e5e" stroke-width="0.5" stroke-dasharray="2.5 1.5"/>' + (Math.min(r.w, r.h) > 18 && (grande !== 'simple' || r === e.sobrantes.reduce((m, q) => q.w * q.h > m.w * m.h ? q : m)) ? '<text x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + 2) + '" font-size="' + f(r.w, r.h) * 0.8 + '" text-anchor="middle" fill="#1d6e41">' + (grande === 'simple' ? 'Te sobra ' : 'Sobrante ') + r.w + '×' + r.h + '</text>' : ''); });
    e.puestas.forEach((p, i) => {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2, fs = f(p.w, p.h);
      s += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" fill="#ffffff" stroke="#16140f" stroke-width="0.6"' + (p.forma === 'red' ? ' stroke-dasharray="1.6 1.2"' : '') + '/>'
        + (p.forma === 'red' ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + p.w / 2 + '" fill="#f4efe6" stroke="#a8844f" stroke-width="0.7"/>' : '')
        + '<text x="' + cx + '" y="' + (cy - fs * 0.25) + '" font-size="' + fs + '" font-weight="700" text-anchor="middle" fill="#16140f">' + (grande === 'simple' ? '' : (i + 1) + '. ') + esc(p.nombre || 'Pieza') + '</text>'
        + '<text x="' + cx + '" y="' + (cy + fs * 0.95) + '" font-size="' + fs * 0.85 + '" text-anchor="middle" fill="#6b665e">' + esc(p.forma === 'red' ? 'Ø' + p.w : p.w + '×' + p.h) + '</text>';
    });
    if (grande === true) { // números del orden de corte
      let k = 0; e.cortes.forEach(c => { if (c.o === 'ref') { k++; return; } k++; const x = c.o === 'h' ? (c.a + c.b) / 2 : c.pos, y = c.o === 'h' ? c.pos : (c.a + c.b) / 2;
        s += '<line x1="' + (c.o === 'h' ? c.a : c.pos) + '" y1="' + (c.o === 'h' ? c.pos : c.a) + '" x2="' + (c.o === 'h' ? c.b : c.pos) + '" y2="' + (c.o === 'h' ? c.pos : c.b) + '" stroke="#c2362b" stroke-width="0.5"/>'
          + '<circle cx="' + x + '" cy="' + y + '" r="3.4" fill="#c2362b"/><text x="' + x + '" y="' + (y + 1.6) + '" font-size="4.3" font-weight="700" text-anchor="middle" fill="#fff">' + k + '</text>'; });
    }
    return s + '</svg>';
  }

  // ---------- cortar: descuenta del inventario, guarda sobrantes e historial ----------
  const nid = p => p + Date.now().toString(36) + A.rnd().slice(0, 6);
  function armarCorte(r, nota) {
    return { fecha: hoy(), piedra: r.piedra, nota: nota || '', piezas: r.pedido, estado: r.estado, cfg: { kerf: r.cfg.kerf, refilado: r.cfg.refilado },
      espacios: r.espacios.map(e => ({ tipo: e.esp.tipo, id: e.esp.id || null, w: e.esp.w, h: e.esp.h, ref: e.ref, nueva: !!e.esp.nueva, pct: e.pct, mermaPct: e.mermaPct,
        puestas: e.puestas.map(p => ({ et: p.et, nombre: p.nombre, forma: p.forma, x: p.x, y: p.y, w: p.w, h: p.h, rot: !!p.rot })), cortes: e.cortes, sobrantes: e.sobrantes.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })) })) };
  }
  // el mismo formato que usa el dibujo, desde un corte guardado
  const comoEspacio = e => ({ esp: { tipo: e.tipo, id: e.id, w: e.w, h: e.h, nueva: e.nueva }, ref: e.ref, pct: e.pct, mermaPct: e.mermaPct, puestas: e.puestas || [], cortes: e.cortes || [], sobrantes: e.sobrantes || [] });
  async function cortar() {
    const b = $('#pd-cortar'), nota = ($('#pd-nota').value || '').trim().slice(0, 200);
    b.disabled = true; b.textContent = 'Revisando el inventario…';
    try {
      await cargar(); // por si alguien más cortó mientras tanto
      const r2 = C.meCabe(sel.lista, invDe(sel.piedra), cfg, STD), ids = r => r.espacios.map(e => e.esp.tipo + ':' + e.esp.id).join(',');
      if (r2.estado !== res.estado || ids(r2) !== ids(res)) { limpiarRes(); meCabe(); calcular(); return X.alerta('El inventario cambió. Revisa el cálculo nuevo y vuelve a tocar Cortar.'); }
      const usaTxt = res.espacios.map(nombreEsp).join(' y ');
      if (!confirm('¿Cortar ' + res.total + (res.total === 1 ? ' pieza' : ' piezas') + ' de ' + res.piedra + ' en ' + usaTxt + '? Se descuenta del inventario' + (res.espacios.some(e => e.sobrantes.length) ? ' y se guardan los sobrantes.' : '.'))) { b.disabled = false; b.textContent = 'Cortar'; return; }
      const id = nid('c'), me = X.me() || {}, por = (me.nombre || 'DKAS').slice(0, 60), u = {}, menos = {};
      res.espacios.forEach(e => {
        if (e.esp.tipo === 'retazo') u['piedra/retazos/' + e.esp.id] = null; else menos[e.esp.id] = (menos[e.esp.id] || 0) + 1;
        e.sobrantes.forEach(r => { u['piedra/retazos/' + nid('r')] = { piedra: res.piedra, w: r.w, h: r.h, origen: id, por, creado: A.TS }; });
      });
      Object.entries(menos).forEach(([pid, n]) => { const p = inv.placas.find(x => x.id === pid), q = (+p.cant || 0) - n; if (q > 0) u['piedra/placas/' + pid + '/cant'] = q; else u['piedra/placas/' + pid] = null; });
      const c = armarCorte(res, nota); delete c.estado; if (!c.nota) delete c.nota;
      u['piedra/cortes/' + id] = Object.assign(c, { por, creado: A.TS });
      b.textContent = 'Guardando…';
      await A.nodoVarios(u);
      X.toast('Corte guardado · inventario actualizado'); sel.lista = []; guardaSel(); res = null; await cargar(); location.hash = '#piedra/hoja=' + id;
    } catch (e) { b.disabled = false; b.textContent = 'Cortar'; X.alerta(e.message); }
  }

  // ---------- hoja de corte ----------
  function hojaGuardada(id) { const c = cortes.find(x => x.id === id); if (!c) { main.innerHTML = '<div class="pd">' + tabs('historial') + '<p class="sub">No encontré ese corte.</p></div>'; return; } hoja(c, false); }
  function hoja(c, previa) {
    const esps = c.espacios.map(comoEspacio), K = c.cfg || cfg;
    main.innerHTML = '<div class="pd pd-hoja"><a class="volver pd-np" href="' + (previa ? '#piedra' : '#piedra/historial') + '">← ' + (previa ? '¿Me cabe?' : 'Historial') + '</a>'
      + '<div class="pd-hc"><div><p class="dn-k">DKAS · Hoja de corte' + (previa ? ' (sin confirmar)' : '') + '</p><h1>' + esc(c.piedra) + '</h1><p class="sub">' + fCorta(c.fecha) + (c.por ? ' · ' + esc(c.por) : '') + (c.nota ? ' · ' + esc(c.nota) : '') + '</p></div>'
      + '<div class="pd-hb pd-np"><button class="btn" id="pd-imp">Imprimir</button><button class="btn verde" id="pd-wa">WhatsApp</button></div></div>'
      + '<p class="pd-hp">Piezas: ' + c.piezas.map(p => p.cant + ' × ' + esc(p.et)).join(' · ') + '</p>'
      + '<p class="pd-hp">Disco ' + K.kerf + ' cm · refilado ' + K.refilado + ' cm por lado en placa completa · medidas en cm desde la orilla izquierda y de arriba.</p>'
      + esps.map((e, i) => '<section class="pd-sec pd-esp-h"><h3>' + (esps.length > 1 ? (i + 1) + '. ' : '') + esc(nombreEsp(e)) + (e.esp.nueva ? ' (falta comprarla)' : '') + '</h3>' + dibujo(e, true)
        + '<div class="pd-h2"><div><p class="dn-k">Piezas</p>' + posiciones(e) + '</div><div><p class="dn-k">Orden de los cortes</p><ol class="pd-ord">' + C.pasos(e).map(t => '<li>' + esc(t) + '</li>').join('') + '</ol></div></div></section>').join('')
      + '</div>';
    $('#pd-imp').onclick = () => print();
    $('#pd-wa').onclick = () => compartir(c, esps);
  }
  function textoWA(c, esps) {
    const K = c.cfg || cfg;
    return ['*DKAS · Hoja de corte*', c.piedra + ' · ' + fCorta(c.fecha) + (c.nota ? ' · ' + c.nota : ''), 'Disco ' + K.kerf + ' cm · refilado ' + K.refilado + ' cm · medidas en cm desde la orilla izquierda y de arriba', '']
      .concat(...esps.map((e, i) => ['*' + (esps.length > 1 ? (i + 1) + '. ' : '') + nombreEsp(e) + '*'].concat(e.puestas.map((p, j) => (j + 1) + '. ' + p.et + (p.rot ? ' (girada)' : '') + ': esquina a ' + p.x + ' izq, ' + p.y + ' arriba'),
        ['_Cortes en orden:_'], C.pasos(e).map((t, j) => (j + 1) + ') ' + t), e.sobrantes.length ? ['Sobrantes: ' + e.sobrantes.map(r => r.w + '×' + r.h).join(', ')] : [], [''])))
      .join('\n');
  }
  async function compartir(c, esps) {
    const txt = textoWA(c, esps);
    try { // en el celular: manda los dibujos como imagen + el texto
      if (navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        const files = await Promise.all(esps.map((e, i) => png(dibujo(e, true), 'corte-' + (i + 1) + '.png')));
        if (navigator.canShare({ files })) { await navigator.share({ files, text: txt }); return; }
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
  }
  function png(svg, nombre) {
    return new Promise((ok, mal) => {
      const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = () => { const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number), k = 1600 / vb[2], cv = document.createElement('canvas'); cv.width = 1600; cv.height = Math.round(vb[3] * k);
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        cv.toBlob(b => b ? ok(new File([b], nombre, { type: 'image/png' })) : mal(new Error('No se pudo hacer la imagen.')), 'image/png'); };
      img.onerror = () => mal(new Error('No se pudo hacer la imagen.')); img.src = url;
    });
  }

  // ---------- mis placas y retazos + reglas de corte ----------
  function placas() {
    const dl = '<datalist id="pd-dl">' + nombresPiedra().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>';
    const pl = inv.placas.slice().sort((a, b) => a.piedra.localeCompare(b.piedra)), re = inv.retazos.slice().sort((a, b) => a.piedra.localeCompare(b.piedra) || b.w * b.h - a.w * a.h);
    main.innerHTML = '<div class="pd">' + tabs('placas') + dl
      + '<section class="pd-sec"><h3>Placas completas</h3>' + (pl.length ? '<div class="pd-inv">' + pl.map(p => '<div><span><b>' + esc(p.piedra) + '</b><small>' + p.w + ' × ' + p.h + ' cm</small></span><button data-pm="' + p.id + '" aria-label="Una menos">−</button><b>' + p.cant + '</b><button data-pp="' + p.id + '" aria-label="Una más">＋</button><button class="pd-q" data-pq="' + p.id + '" aria-label="Quitar">✕</button></div>').join('') + '</div>' : '<p class="sub">Aún no hay placas.</p>')
      + '<div class="pd-add"><label class="full">Piedra<input id="pa-pi" list="pd-dl" placeholder="ej. Bulgaria Dark Grey"></label><label>Largo<input id="pa-w" inputmode="decimal" value="' + STD.w + '"></label><label>Ancho<input id="pa-h" inputmode="decimal" value="' + STD.h + '"></label><label>Cantidad<input id="pa-c" inputmode="numeric" value="1"></label><button class="btn negro" id="pa-ok">Agregar placas</button></div></section>'
      + '<section class="pd-sec"><h3>Sobrantes y retazos</h3>' + (re.length ? '<div class="pd-inv">' + re.map(r => { const co = r.origen && cortes.find(c => c.id === r.origen); return '<div><span><b>' + esc(r.piedra) + '</b><small>' + r.w + ' × ' + r.h + ' cm · ' + (co ? 'sobró del corte del ' + fCorta(co.fecha) : 'agregado a mano') + '</small></span><button class="pd-q" data-rq="' + r.id + '" aria-label="Quitar">✕</button></div>'; }).join('') + '</div>' : '<p class="sub">No hay retazos. Se agregan solos al confirmar un corte.</p>')
      + '<div class="pd-add"><label class="full">Piedra<input id="ra-pi" list="pd-dl" placeholder="ej. Peacock"></label><label>Largo<input id="ra-w" inputmode="decimal"></label><label>Ancho<input id="ra-h" inputmode="decimal"></label><button class="btn negro" id="ra-ok">Agregar retazo</button></div></section>'
      + '<section class="pd-sec"><h3>Reglas de corte</h3><div class="pd-add"><label>Disco / kerf (cm)<input id="cf-k" inputmode="decimal" value="' + cfg.kerf + '"></label><label>Refilado por lado (cm)<input id="cf-r" inputmode="decimal" value="' + cfg.refilado + '"></label><label>Merma: menor de (cm)<input id="cf-m" inputmode="decimal" value="' + cfg.minSob + '"></label><button class="btn" id="cf-ok">Guardar reglas</button></div>'
      + '<p class="sub">Solo cortes rectos de lado a lado (cortadora de puente). Las redondas se cortan primero como cuadro. Lo que sobra más chico que ' + cfg.minSob + '×' + cfg.minSob + ' cm es merma.</p></section></div>';
    const hecho = async (u, t) => { try { await A.nodoVarios(u); X.toast(t); await cargar(); placas(); } catch (e) { X.alerta(e.message); } };
    $$('[data-pp],[data-pm]').forEach(b => b.onclick = () => { const id = b.dataset.pp || b.dataset.pm, p = inv.placas.find(x => x.id === id), q = (+p.cant || 0) + (b.dataset.pp ? 1 : -1);
      if (q < 1) { if (!confirm('¿Quitar la última placa de ' + p.piedra + '?')) return; return hecho({ ['piedra/placas/' + id]: null }, 'Placa quitada'); }
      hecho({ ['piedra/placas/' + id + '/cant']: q }, p.piedra + ': ' + q + (q === 1 ? ' placa' : ' placas')); });
    $$('[data-pq]').forEach(b => b.onclick = () => { const p = inv.placas.find(x => x.id === b.dataset.pq); if (confirm('¿Quitar las ' + p.cant + ' placas de ' + p.piedra + ' (' + p.w + '×' + p.h + ')?')) hecho({ ['piedra/placas/' + p.id]: null }, 'Placas quitadas'); });
    $$('[data-rq]').forEach(b => b.onclick = () => { const r = inv.retazos.find(x => x.id === b.dataset.rq); if (confirm('¿Quitar el retazo de ' + r.piedra + ' de ' + r.w + '×' + r.h + '?')) hecho({ ['piedra/retazos/' + r.id]: null }, 'Retazo quitado'); });
    const piedraOk = v => { v = v.trim().slice(0, 40); const n = nombresPiedra().find(x => mismo(x, v)); return n || v; };
    $('#pa-ok').onclick = () => {
      const pi = piedraOk($('#pa-pi').value), w = num($('#pa-w').value), h = num($('#pa-h').value), c = Math.floor(num($('#pa-c').value));
      if (pi.length < 2) return X.alerta('Escribe la piedra.'); if (!(w > 0 && w <= 400 && h > 0 && h <= 400)) return X.alerta('Revisa las medidas (cm).'); if (!(c >= 1 && c <= 999)) return X.alerta('Revisa la cantidad.');
      const ya = inv.placas.find(p => mismo(p.piedra, pi) && ((p.w === w && p.h === h) || (p.w === h && p.h === w)));
      const me = X.me() || {}; hecho(ya ? { ['piedra/placas/' + ya.id + '/cant']: (+ya.cant || 0) + c } : { ['piedra/placas/' + nid('p')]: { piedra: pi, w: Math.max(w, h), h: Math.min(w, h), cant: c, por: (me.nombre || 'DKAS').slice(0, 60), creado: A.TS } }, c + (c === 1 ? ' placa agregada' : ' placas agregadas'));
    };
    $('#ra-ok').onclick = () => {
      const pi = piedraOk($('#ra-pi').value), w = num($('#ra-w').value), h = num($('#ra-h').value);
      if (pi.length < 2) return X.alerta('Escribe la piedra.'); if (!(w > 0 && w <= 400 && h > 0 && h <= 400)) return X.alerta('Revisa las medidas (cm).');
      if (Math.min(w, h) < cfg.minSob) return X.alerta('Un pedazo de menos de ' + cfg.minSob + ' cm es merma; no se guarda.');
      const me = X.me() || {}; hecho({ ['piedra/retazos/' + nid('r')]: { piedra: pi, w: Math.max(w, h), h: Math.min(w, h), por: (me.nombre || 'DKAS').slice(0, 60), creado: A.TS } }, 'Retazo agregado');
    };
    $('#cf-ok').onclick = () => {
      const k = num($('#cf-k').value), r = num($('#cf-r').value), m = num($('#cf-m').value);
      if (!(k >= 0 && k <= 3)) return X.alerta('El disco va de 0 a 3 cm.'); if (!(r >= 0 && r <= 10)) return X.alerta('El refilado va de 0 a 10 cm.'); if (!(m >= 0 && m <= 100)) return X.alerta('Revisa la medida mínima del sobrante.');
      hecho({ 'piedra/cfg': { kerf: k, refilado: r, minSob: m } }, 'Reglas guardadas');
    };
  }

  // ---------- catálogo de piezas ----------
  function catalogo() {
    const e = editPieza ? piezas.find(p => p.id === editPieza) : null, fm = e ? e.forma : 'red';
    main.innerHTML = '<div class="pd">' + tabs('piezas')
      + '<section class="pd-sec"><h3>' + (e ? 'Editar ' + esc(C.etiqueta(e)) : 'Nueva pieza') + '</h3><div class="dn-per pd-forma"><button data-fm="red"' + (fm === 'red' ? ' class="on"' : '') + '>Redonda</button><button data-fm="rect"' + (fm === 'rect' ? ' class="on"' : '') + '>Rectangular</button></div>'
      + '<div class="pd-add"><label class="full">Nombre<input id="pz-n" maxlength="40" value="' + esc(e ? e.nombre : '') + '" placeholder="ej. Equilibrio"></label><label id="pz-l1">' + (fm === 'red' ? 'Diámetro' : 'Largo') + ' (cm)<input id="pz-w" inputmode="decimal" value="' + (e ? (e.forma === 'red' ? e.d : e.w) : '') + '"></label><label id="pz-l2"' + (fm === 'red' ? ' hidden' : '') + '>Ancho (cm)<input id="pz-h" inputmode="decimal" value="' + (e && e.forma === 'rect' ? e.h : '') + '"></label>'
      + '<button class="btn negro" id="pz-ok">' + (e ? 'Guardar cambios' : 'Agregar pieza') + '</button>' + (e ? '<button class="btn" id="pz-x">Cancelar</button>' : '') + '</div></section>'
      + '<section class="pd-sec"><h3>Catálogo</h3><div class="pd-inv">' + piezas.map(p => '<div><span><b>' + esc(p.nombre) + '</b><small>' + (p.forma === 'red' ? 'Redonda ' : 'Rectangular ') + esc(C.medida(p)) + ' cm</small></span><button class="lnk" data-ze="' + p.id + '">Editar</button><button class="pd-q" data-zq="' + p.id + '" aria-label="Quitar">✕</button></div>').join('') + '</div></section></div>';
    let forma = fm;
    $$('[data-fm]').forEach(b => b.onclick = () => { forma = b.dataset.fm; $$('[data-fm]').forEach(o => o.classList.toggle('on', o === b)); $('#pz-l1').firstChild.textContent = (forma === 'red' ? 'Diámetro' : 'Largo') + ' (cm)'; $('#pz-l2').hidden = forma === 'red'; });
    $$('[data-ze]').forEach(b => b.onclick = () => { editPieza = b.dataset.ze; catalogo(); scrollTo(0, 0); });
    if ($('#pz-x')) $('#pz-x').onclick = () => { editPieza = null; catalogo(); };
    $$('[data-zq]').forEach(b => b.onclick = async () => { const p = piezas.find(x => x.id === b.dataset.zq); if (!confirm('¿Quitar ' + C.etiqueta(p) + ' del catálogo?')) return; try { await A.nodoBorra('piedra/piezas/' + p.id); if (editPieza === p.id) editPieza = null; await cargar(); catalogo(); X.toast('Pieza quitada'); } catch (x) { X.alerta(x.message); } });
    $('#pz-ok').onclick = async () => {
      const n = $('#pz-n').value.trim().slice(0, 40), w = num($('#pz-w').value), h = forma === 'red' ? w : num($('#pz-h').value);
      if (n.length < 1) return X.alerta('Escribe el nombre.'); if (!(w > 0 && w <= 400 && h > 0 && h <= 400)) return X.alerta('Revisa las medidas (cm).');
      const x = forma === 'red' ? { nombre: n, forma, d: w } : { nombre: n, forma, w, h };
      x.orden = e ? (e.orden || 0) : piezas.reduce((m, p) => Math.max(m, p.orden || 0), 0) + 1;
      try { await A.nodoPon('piedra/piezas/' + (e ? e.id : nid('z')), x); editPieza = null; await cargar(); catalogo(); X.toast(e ? 'Pieza guardada' : 'Pieza agregada'); } catch (y) { X.alerta(y.message); }
    };
  }

  // ---------- historial ----------
  function historial() {
    main.innerHTML = '<div class="pd">' + tabs('historial') + '<section class="pd-sec">' + (cortes.length ? '<div class="pd-inv pd-hist">' + cortes.map(c => '<a href="#piedra/hoja=' + c.id + '"><span><b>' + esc(c.piedra) + '</b><small>' + fCorta(c.fecha) + ' · ' + (c.piezas || []).map(p => p.cant + ' × ' + esc(p.et)).join(', ') + '</small>' + (c.nota ? '<small>' + esc(c.nota) + '</small>' : '') + '</span><em>' + (c.espacios || []).map(e => (e.tipo === 'retazo' ? 'Retazo ' : 'Placa ') + e.w + '×' + e.h).join(' + ') + '<small>' + esc(c.por || '') + '</small></em></a>').join('') + '</div>'
      : '<p class="sub">Todavía no hay cortes. Cuando confirmes uno en «¿Me cabe?» aparece aquí.</p>') + '</section></div>';
  }

  window.DKAS_PIEDRA = { pantalla };
})();

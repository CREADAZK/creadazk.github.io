/* DKAS · Dinero (pantalla principal del panel): lo que entra, lo que sale y la ganancia.
   Datos propios, empezados desde cero (no usa gastos/ ni ingresos/ ni pagos/ viejos):
     dinero/movs/<id> = { tipo: 'in'|'out', monto, cat, nota?, fecha 'AAAA-MM-DD', por, creado, editado? }
     dinero/cats      = { in: [..], out: [..] }   (se crean solas la primera vez)
   Rutas: #dinero (tablero) · #dinero/todos (lista completa con filtros y exportar). */
(function () {
  // ---------- cálculo (sin pantalla; también lo usan las pruebas en Node) ----------
  const CATS0 = { in: ['Anticipo', 'Liquidación', 'Otro'], out: ['Placa', 'Acero', 'Discos', 'Sueldo', 'Gasolina', 'Renta/Luz', 'Otro'] };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const DIA1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const p2 = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const dte = s => new Date(s + 'T12:00:00');
  const mas = (s, n) => { const d = dte(s); d.setDate(d.getDate() + n); return ymd(d); };
  const dias = (a, b) => Math.round((dte(b) - dte(a)) / 864e5);
  const finMes = (y, m) => ymd(new Date(y, m + 1, 0, 12));

  // un periodo: desde/hasta, el mismo tramo del periodo anterior (para comparar parejo), barras y nombre
  function periodo(tipo, hoy) {
    const d = dte(hoy), y = d.getFullYear(), m = d.getMonth();
    let ini, fin, aIni, aFin, barras, vs;
    if (tipo === 'semana') {
      ini = mas(hoy, -((d.getDay() + 6) % 7)); fin = mas(ini, 6); aIni = mas(ini, -7); aFin = mas(ini, -1);
      barras = DIA1.map((t, i) => ({ t, ini: mas(ini, i), fin: mas(ini, i) })); vs = 'la semana pasada';
    } else if (tipo === 'anio') {
      ini = y + '-01-01'; fin = y + '-12-31'; aIni = (y - 1) + '-01-01'; aFin = (y - 1) + '-12-31';
      barras = MES3.map((t, i) => ({ t, ini: y + '-' + p2(i + 1) + '-01', fin: finMes(y, i) })); vs = String(y - 1);
    } else {
      ini = y + '-' + p2(m + 1) + '-01'; fin = finMes(y, m);
      const pm = new Date(y, m - 1, 1, 12); aIni = ymd(pm); aFin = finMes(pm.getFullYear(), pm.getMonth());
      barras = []; for (let s = 1; s <= +fin.slice(8); s += 7) { const e = Math.min(s + 6, +fin.slice(8)); barras.push({ t: s + '–' + e, ini: ini.slice(0, 8) + p2(s), fin: ini.slice(0, 8) + p2(e) }); }
      vs = MESES[pm.getMonth()];
    }
    // lo que va del periodo contra lo mismo del anterior (al día 14 contra el 1–14 del mes pasado)
    const corre = Math.min(dias(ini, hoy), dias(aIni, aFin));
    return { tipo, ini, fin, aIni, aFin, aCorte: hoy >= ini && hoy <= fin ? mas(aIni, corre) : aFin, barras, vs, enCurso: hoy >= ini && hoy <= fin };
  }
  const dentro = (l, a, b) => l.filter(x => x.fecha >= a && x.fecha <= b);
  const suma = (l, t) => l.reduce((s, x) => s + (x.tipo === t ? +x.monto || 0 : 0), 0);
  function totales(l) { const e = suma(l, 'in'), s = suma(l, 'out'); return { entro: e, salio: s, ganancia: e - s }; }
  function porCategoria(l) {
    const o = {}, tot = suma(l, 'out'); l.filter(x => x.tipo === 'out').forEach(x => { o[x.cat] = (o[x.cat] || 0) + (+x.monto || 0); });
    return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([cat, monto]) => ({ cat, monto, pct: tot ? monto / tot * 100 : 0 }));
  }
  // ↑/↓ de la ganancia contra el periodo anterior; con base cero o negativa no hay porcentaje honesto: se da la diferencia en pesos
  function comparar(act, ant) {
    const dif = act - ant;
    if (ant > 0) return { dif, pct: Math.round(dif / ant * 100), mejor: dif >= 0 };
    return { dif, pct: null, mejor: dif >= 0 };
  }
  function resumen(movs, tipo, hoy) {
    const P = periodo(tipo, hoy), act = dentro(movs, P.ini, P.fin), ant = dentro(movs, P.aIni, P.aCorte);
    const T = totales(act), A = totales(ant);
    return { P, T, A, cmp: comparar(T.ganancia, A.ganancia), cats: porCategoria(act), barras: P.barras.map(b => Object.assign({}, b, totales(dentro(act, b.ini, b.fin)))) };
  }
  const csvCampo = v => { v = String(v == null ? '' : v); if (/^[=+@\t\r]/.test(v) || /^-\D/.test(v)) v = "'" + v; return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function csv(l) {
    return '﻿' + [['Fecha', 'Tipo', 'Categoría', 'Nota', 'Monto', 'Registró']].concat(l.map(x => [x.fecha, x.tipo === 'in' ? 'Entrada' : 'Salida', x.cat, x.nota || '', (x.tipo === 'in' ? '' : '-') + (+x.monto), x.por || '']))
      .map(r => r.map(csvCampo).join(',')).join('\r\n');
  }
  const ordenar = l => l.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
  const monto = t => { const n = Number(String(t || '').replace(/[$,\s]/g, '')); return isFinite(n) && n > 0 && n < 1e8 ? Math.round(n * 100) / 100 : 0; };
  const calc = { CATS0, periodo, totales, porCategoria, comparar, resumen, csv, ordenar, monto, ymd, mas };
  if (typeof module !== 'undefined' && module.exports) { module.exports = calc; return; }

  // ---------- pantalla ----------
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  let X = null, A = null, main = null, movs = [], cats = null, per = 'mes', filtro = { tipo: '', cat: '', desde: '', hasta: '', q: '' };
  try { per = localStorage.getItem('dkas-dinero-per') || 'mes'; } catch (e) {}
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = n => (n < 0 ? '−' : '') + '$' + Math.abs(Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const corto = n => { n = Math.abs(n); return n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + ' M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + ' mil' : '$' + Math.round(n); };
  const hoy = () => ymd(new Date());
  const fCorta = f => { const d = dte(f), h = hoy(); return f === h ? 'Hoy' : f === mas(h, -1) ? 'Ayer' : d.getDate() + ' ' + MES3[d.getMonth()].toLowerCase() + (f.slice(0, 4) !== h.slice(0, 4) ? ' ' + f.slice(0, 4) : ''); };

  async function cargar() {
    const [m, c] = await Promise.all([A.nodo('dinero/movs'), cats ? Promise.resolve(cats) : A.nodo('dinero/cats')]);
    movs = ordenar(Object.entries(m || {}).map(([id, x]) => Object.assign({ id }, x)));
    if (!c || !c.in || !c.out) { cats = JSON.parse(JSON.stringify(CATS0)); A.nodoPon('dinero/cats', cats).catch(() => {}); } else cats = { in: Object.values(c.in), out: Object.values(c.out) };
  }
  async function pantalla(m, ctx, sub) {
    main = m; X = ctx; A = ctx.A;
    if (!$('.dn')) main.innerHTML = '<div class="dn"><p class="cargando">Cargando…</p></div>';
    try { await cargar(); } catch (e) { main.innerHTML = '<div class="dn"><h1>Dinero</h1><p class="err">No se pudo cargar: ' + esc(e.message) + '</p></div>'; return; }
    if (sub === 'todos') todos(); else tablero();
  }
  const filaMov = x => '<button class="dn-mov ' + x.tipo + '" data-mov="' + esc(x.id) + '"><i aria-hidden="true">' + (x.tipo === 'in' ? '＋' : '−') + '</i><span><b>' + esc(x.cat) + '</b>' + (x.nota ? '<small>' + esc(x.nota) + '</small>' : '') + '</span><em>' + (x.tipo === 'in' ? '+' : '−') + pesos(x.monto) + '<small>' + fCorta(x.fecha) + '</small></em></button>';
  const botonRegistrar = () => '<button class="dn-reg" id="dn-reg"><span>＋</span> Registrar</button>';

  function tablero() {
    const R = resumen(movs, per, hoy()), T = R.T, c = R.cmp;
    const cmpTxt = !movs.length ? '' : c.pct != null && c.pct !== 0 ? 'Ganancia ' + (c.pct > 0 ? '↑ ' : '↓ ') + Math.abs(c.pct) + '% vs. ' + R.P.vs
      : c.dif === 0 ? 'Igual que ' + R.P.vs : 'Ganancia ' + (c.dif > 0 ? '↑ ' : '↓ ') + pesos(Math.abs(c.dif)) + ' vs. ' + R.P.vs;
    const tramo = R.P.enCurso && R.P.aCorte !== R.P.aFin ? ' (mismos días)' : '';
    main.innerHTML = '<div class="dn">'
      + '<div class="dn-per" role="tablist">' + [['semana', 'Esta semana'], ['mes', 'Este mes'], ['anio', 'Este año']].map(([k, t]) => '<button role="tab" data-per="' + k + '"' + (per === k ? ' class="on" aria-selected="true"' : '') + '>' + t + '</button>').join('') + '</div>'
      + '<section class="dn-hero"><p class="dn-k">Ganancia</p><p class="dn-g' + (T.ganancia < 0 ? ' neg' : '') + '">' + pesos(T.ganancia) + '</p>'
      + '<p class="dn-es">Entró <b class="v">' + pesos(T.entro) + '</b> · Salió <b class="r">' + pesos(T.salio) + '</b></p>'
      + (cmpTxt ? '<p class="dn-cmp ' + (c.mejor ? 'ok' : 'mal') + '">' + cmpTxt + tramo + '</p>' : '') + '</section>'
      + '<section class="dn-sec"><div class="dn-sec-c"><h3>' + (per === 'anio' ? 'Por mes' : per === 'mes' ? 'Por semana' : 'Por día') + '</h3><p class="dn-ley"><i class="v"></i>Entró <i class="r"></i>Salió</p></div>' + grafica(R.barras) + '<p class="dn-tip" id="dn-tip">Toca una barra para ver la cantidad.</p></section>'
      + '<section class="dn-sec"><h3>En qué se va el dinero</h3>' + (R.cats.length ? '<div class="dn-cats">' + R.cats.map(k => '<div><span>' + esc(k.cat) + '</span><i><em style="width:' + Math.max(1.5, k.pct) + '%"></em></i><b>' + Math.round(k.pct) + '%</b><small>' + pesos(k.monto) + '</small></div>').join('') + '</div>' : '<p class="sub">Todavía no hay salidas en este periodo.</p>') + '</section>'
      + '<section class="dn-sec"><div class="dn-sec-c"><h3>Últimos movimientos</h3>' + (movs.length ? '<a href="#dinero/todos" class="lnk">Ver todos</a>' : '') + '</div>'
      + (movs.length ? '<div class="dn-lista">' + movs.slice(0, 5).map(filaMov).join('') + '</div>' : '<p class="sub">Aún no hay movimientos. Toca <b>＋ Registrar</b> para anotar el primero.</p>') + '</section>'
      + botonRegistrar() + '</div>';
    $$('[data-per]').forEach(b => b.onclick = () => { per = b.dataset.per; try { localStorage.setItem('dkas-dinero-per', per); } catch (e) {} tablero(); });
    $$('.dn-bar').forEach(g => g.onclick = () => { $$('.dn-bar').forEach(o => o.classList.toggle('on', o === g)); const b = R.barras[+g.dataset.i]; $('#dn-tip').innerHTML = '<b>' + esc(etiquetaBarra(b)) + '</b>: entró <b class="v">' + pesos(b.entro) + '</b> · salió <b class="r">' + pesos(b.salio) + '</b> · ganancia <b>' + pesos(b.ganancia) + '</b>'; });
    enlazar();
  }
  const etiquetaBarra = b => per === 'anio' ? MESES[+b.ini.slice(5, 7) - 1].replace(/^./, c => c.toUpperCase()) : per === 'mes' ? 'Del ' + b.t.replace('–', ' al ') : ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dte(b.ini).getDay()] + ' ' + +b.ini.slice(8);

  // barras agrupadas (entró | salió) en SVG; puntas redondeadas de 4px, base recta, una línea guía con el máximo
  function grafica(bs) {
    const W = 340, H = 150, top = 16, base = H - 22, n = bs.length, mx = Math.max(1, ...bs.map(b => Math.max(b.entro, b.salio)));
    const gw = W / n, bw = Math.min(16, (gw - 8) / 2), y = v => base - (base - top) * v / mx;
    const barra = (x, v, cl) => { if (!v) return ''; const h = Math.max(2, base - y(v)), r = Math.min(4, bw / 2, h); return '<path class="' + cl + '" d="M' + x + ',' + base + 'V' + (base - h + r) + 'q0,-' + r + ' ' + r + ',-' + r + 'h' + (bw - 2 * r) + 'q' + r + ',0 ' + r + ',' + r + 'V' + base + 'Z"/>'; };
    let s = '<svg class="dn-graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Entradas y salidas por ' + (per === 'anio' ? 'mes' : per === 'mes' ? 'semana' : 'día') + '">'
      + '<line class="g" x1="0" x2="' + W + '" y1="' + top + '" y2="' + top + '"/><text class="gt" x="' + W + '" y="' + (top - 5) + '" text-anchor="end">' + corto(mx) + '</text><line class="b" x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '"/>';
    bs.forEach((b, i) => {
      const cx = gw * i + gw / 2, x1 = cx - bw - 1, x2 = cx + 1;
      s += '<g class="dn-bar" data-i="' + i + '" tabindex="0"><title>' + etiquetaBarra(b) + ': entró ' + pesos(b.entro) + ', salió ' + pesos(b.salio) + '</title><rect class="hit" x="' + (gw * i) + '" y="0" width="' + gw + '" height="' + H + '"/>'
        + barra(x1, b.entro, 'v') + barra(x2, b.salio, 'r') + '<text class="et" x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(b.t) + '</text></g>';
    });
    return s + '</svg>';
  }

  // ---------- todos los movimientos, con filtros y exportar ----------
  function filtrados() {
    const q = filtro.q.trim().toLowerCase();
    return movs.filter(x => (!filtro.tipo || x.tipo === filtro.tipo) && (!filtro.cat || x.cat === filtro.cat) && (!filtro.desde || x.fecha >= filtro.desde) && (!filtro.hasta || x.fecha <= filtro.hasta)
      && (!q || (x.cat + ' ' + (x.nota || '') + ' ' + (x.por || '')).toLowerCase().includes(q)));
  }
  function todos() {
    const usadas = [...new Set(cats.in.concat(cats.out).concat(movs.map(x => x.cat)))];
    main.innerHTML = '<div class="dn"><a href="#dinero" class="volver">← Dinero</a><div class="dn-sec-c"><h1>Movimientos</h1><button class="btn" id="dn-csv">Exportar a Excel</button></div>'
      + '<div class="dn-fil"><div class="dn-per">' + [['', 'Todo'], ['in', 'Entró'], ['out', 'Salió']].map(([k, t]) => '<button data-ft="' + k + '"' + (filtro.tipo === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div>'
      + '<input id="dn-q" type="search" placeholder="Buscar nota o categoría" value="' + esc(filtro.q) + '">'
      + '<select id="dn-fc"><option value="">Todas las categorías</option>' + usadas.map(c => '<option' + (filtro.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>'
      + '<label>Desde<input type="date" id="dn-fd" value="' + filtro.desde + '"></label><label>Hasta<input type="date" id="dn-fh" value="' + filtro.hasta + '"></label></div>'
      + '<p class="dn-tot" id="dn-tot"></p><div class="dn-lista" id="dn-todos"></div>' + botonRegistrar() + '</div>';
    const pintar = () => { const l = filtrados(), t = totales(l); $('#dn-tot').innerHTML = l.length + (l.length === 1 ? ' movimiento' : ' movimientos') + ' · entró <b class="v">' + pesos(t.entro) + '</b> · salió <b class="r">' + pesos(t.salio) + '</b> · ganancia <b>' + pesos(t.ganancia) + '</b>'; $('#dn-todos').innerHTML = l.length ? l.map(filaMov).join('') : '<p class="sub">Nada con estos filtros.</p>'; };
    $$('[data-ft]').forEach(b => b.onclick = () => { filtro.tipo = b.dataset.ft; $$('[data-ft]').forEach(o => o.classList.toggle('on', o === b)); pintar(); });
    $('#dn-q').oninput = e => { filtro.q = e.target.value; pintar(); };
    $('#dn-fc').onchange = e => { filtro.cat = e.target.value; pintar(); };
    $('#dn-fd').onchange = e => { filtro.desde = e.target.value; pintar(); };
    $('#dn-fh').onchange = e => { filtro.hasta = e.target.value; pintar(); };
    $('#dn-csv').onclick = () => exportar(filtrados());
    pintar(); enlazar();
  }
  async function exportar(l) {
    if (!l.length) return X.alerta('No hay movimientos para exportar.');
    const nombre = 'DKAS dinero ' + hoy() + '.csv', blob = new Blob([csv(l)], { type: 'text/csv;charset=utf-8' });
    try { const f = new File([blob], nombre, { type: 'text/csv' }); if (navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: nombre }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    X.toast('Listo: ' + nombre);
  }
  function enlazar() {
    $('#dn-reg').onclick = () => hoja();
    $$('[data-mov]').forEach(b => b.onclick = () => hoja(movs.find(x => x.id === b.dataset.mov)));
  }
  const repintar = () => (location.hash === '#dinero/todos' ? todos() : tablero());

  // ---------- registrar / editar: tipo → cantidad → categoría → (nota, fecha) → Guardar ----------
  function hoja(ed) {
    const d = ed ? { tipo: ed.tipo, monto: String(ed.monto), cat: ed.cat, nota: ed.nota || '', fecha: ed.fecha } : { tipo: '', monto: '', cat: '', nota: '', fecha: hoy() };
    const cap = document.createElement('div'); cap.className = 'dn-capa'; document.body.appendChild(cap); document.body.classList.add('dn-sin-scroll');
    const cerrar = () => { cap.remove(); document.body.classList.remove('dn-sin-scroll'); };
    cap.onclick = e => { if (e.target === cap) cerrar(); };
    const pintar = foco => {
      const ok = d.tipo && monto(d.monto) && d.cat && d.fecha;
      const lista = d.tipo ? cats[d.tipo].concat(d.cat && !cats[d.tipo].includes(d.cat) ? [d.cat] : []) : [];
      cap.innerHTML = '<div class="dn-hoja" role="dialog" aria-label="' + (ed ? 'Editar movimiento' : 'Registrar') + '"><div class="dn-hoja-c"><h2>' + (ed ? 'Editar movimiento' : 'Registrar') + '</h2><button class="dn-x" aria-label="Cerrar">✕</button></div>'
        + '<div class="dn-tipo"><button data-t="in" class="in' + (d.tipo === 'in' ? ' on' : '') + '">🟢 Entró dinero</button><button data-t="out" class="out' + (d.tipo === 'out' ? ' on' : '') + '">🔴 Salió dinero</button></div>'
        + (d.tipo ? '<label class="dn-cant">Cantidad<span><i>$</i><input id="dn-m" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0" value="' + esc(d.monto) + '"></span></label>'
          + '<div class="dn-chips-c"><p class="dn-k">Categoría</p><button class="lnk gris" id="dn-ec">Editar</button></div><div class="dn-chips">' + lista.map(c => '<button data-c="' + esc(c) + '"' + (d.cat === c ? ' class="on"' : '') + '>' + esc(c) + '</button>').join('') + '</div>'
          + '<div class="dn-mas"><label>Nota (opcional)<input id="dn-n" maxlength="80" placeholder="ej. Mesa Juan" value="' + esc(d.nota) + '"></label><label>Fecha<input id="dn-f" type="date" value="' + d.fecha + '" max="' + mas(hoy(), 366) + '"></label></div>'
          + '<button class="btn negro grande" id="dn-g"' + (ok ? '' : ' disabled') + '>Guardar</button>' + (ed ? '<button class="dn-borrar" id="dn-b">Borrar este movimiento</button>' : '')
          : '<p class="sub dn-hint">¿Entró o salió dinero?</p>') + '</div>';
      $('.dn-x', cap).onclick = cerrar;
      $$('[data-t]', cap).forEach(b => b.onclick = () => { if (d.tipo !== b.dataset.t) { d.tipo = b.dataset.t; if (!cats[d.tipo].includes(d.cat)) d.cat = ''; } pintar('m'); });
      if (!d.tipo) return;
      const m = $('#dn-m', cap), g = $('#dn-g', cap), listo = () => { g.disabled = !(d.tipo && monto(d.monto) && d.cat && d.fecha); };
      m.oninput = () => { d.monto = m.value.replace(/[^\d.,]/g, ''); if (m.value !== d.monto) m.value = d.monto; listo(); };
      m.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); m.blur(); } };
      $$('[data-c]', cap).forEach(b => b.onclick = () => { d.cat = b.dataset.c; $$('[data-c]', cap).forEach(o => o.classList.toggle('on', o === b)); m.blur(); listo(); });
      $('#dn-n', cap).oninput = e => { d.nota = e.target.value; };
      $('#dn-f', cap).onchange = e => { d.fecha = e.target.value; listo(); };
      $('#dn-ec', cap).onclick = () => editarCats(d.tipo, ren => { if (ren[d.cat]) d.cat = ren[d.cat]; pintar(); });
      g.onclick = async () => {
        const x = { tipo: d.tipo, monto: monto(d.monto), cat: d.cat.slice(0, 30), fecha: d.fecha }; const nota = d.nota.trim().slice(0, 80);
        if (!x.monto) return X.alerta('Escribe la cantidad.'); if (!/^20\d\d-\d\d-\d\d$/.test(x.fecha)) return X.alerta('Revisa la fecha.');
        g.disabled = true; g.textContent = 'Guardando…';
        try {
          if (ed) await A.nodoCambia('dinero/movs/' + ed.id, Object.assign(x, { nota: nota || null }));
          else await A.nodoAgrega('dinero/movs', nota ? Object.assign(x, { nota }) : x);
          cerrar(); X.toast((d.tipo === 'in' ? 'Entrada' : 'Salida') + ' de ' + pesos(x.monto) + ' guardada'); await cargar(); repintar();
        } catch (e) { g.disabled = false; g.textContent = 'Guardar'; X.alerta(e.message); }
      };
      if (ed) $('#dn-b', cap).onclick = async () => {
        if (!confirm('¿Borrar ' + (ed.tipo === 'in' ? 'la entrada' : 'la salida') + ' de ' + pesos(ed.monto) + ' (' + ed.cat + ', ' + fCorta(ed.fecha).toLowerCase() + ')? No se puede deshacer.')) return;
        try { await A.nodoBorra('dinero/movs/' + ed.id); cerrar(); X.toast('Movimiento borrado'); await cargar(); repintar(); } catch (e) { X.alerta(e.message); }
      };
      if (foco === 'm' && !d.monto) setTimeout(() => m.focus(), 30);
    };
    pintar(ed ? null : '');
  }

  // categorías editables por tipo; renombrar también cambia los movimientos que ya la usan
  function editarCats(tipo, listo) {
    const cap = document.createElement('div'); cap.className = 'dn-capa arriba'; document.body.appendChild(cap);
    const filas = cats[tipo].map(c => ({ orig: c, v: c }));
    const pintar = () => {
      cap.innerHTML = '<div class="dn-hoja"><div class="dn-hoja-c"><h2>Categorías de ' + (tipo === 'in' ? 'entrada' : 'salida') + '</h2><button class="dn-x" aria-label="Cerrar">✕</button></div>'
        + '<div class="dn-ecats">' + filas.map((f, i) => '<div><input data-i="' + i + '" maxlength="30" value="' + esc(f.v) + '"><button data-q="' + i + '" aria-label="Quitar ' + esc(f.v) + '">✕</button></div>').join('') + '</div>'
        + '<button class="btn" id="dn-ca">＋ Agregar categoría</button><p class="sub">Si cambias un nombre, también se cambia en los movimientos que ya la tienen. Si quitas una, los movimientos viejos la conservan.</p><button class="btn negro grande" id="dn-cg">Guardar categorías</button></div>';
      $('.dn-x', cap).onclick = () => cap.remove();
      $$('[data-i]', cap).forEach(i => i.oninput = () => { filas[+i.dataset.i].v = i.value; });
      $$('[data-q]', cap).forEach(b => b.onclick = () => { filas.splice(+b.dataset.q, 1); pintar(); });
      $('#dn-ca', cap).onclick = () => { filas.push({ orig: null, v: '' }); pintar(); const l = $$('[data-i]', cap); l[l.length - 1].focus(); };
      $('#dn-cg', cap).onclick = async () => {
        const nuevas = filas.map(f => f.v.trim().slice(0, 30)).filter(Boolean);
        if (!nuevas.length) return X.alerta('Deja al menos una categoría.');
        if (new Set(nuevas.map(v => v.toLowerCase())).size !== nuevas.length) return X.alerta('Hay dos categorías con el mismo nombre.');
        const u = { ['dinero/cats/' + tipo]: nuevas }, ren = {};
        filas.filter(f => f.orig && f.v.trim() && f.v.trim() !== f.orig).forEach(f => (ren[f.orig] = f.v.trim().slice(0, 30)) && movs.filter(x => x.tipo === tipo && x.cat === f.orig).forEach(x => { u['dinero/movs/' + x.id + '/cat'] = f.v.trim().slice(0, 30); }));
        try { await A.nodoVarios(u); cats[tipo] = nuevas; cap.remove(); X.toast('Categorías guardadas'); await cargar(); repintar(); listo(ren); } catch (e) { X.alerta(e.message); }
      };
    };
    pintar();
  }

  window.DKAS_DINERO = Object.assign({ pantalla }, { calc });
})();

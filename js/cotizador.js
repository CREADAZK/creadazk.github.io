/* DKAS · precios: costo, precio, 10%, entrega, acomodo en la placa y paquetes de placa completa. Todo en cm y pesos.
   Lo usan el panel (Cotizar) y lista-precios.js (PDF). Números del dueño (libreta 2026-11-15): placa 9,000 · +500 por pieza ·
   MDF 650 la hoja · grapa 40×40 70 cm = 1,200 · base mesita 0.80 = 1,500 · bases grandes 6–7 mil · flete 2,000 · precio = costo × 1.6. */
(function (root) {
const CORTES = typeof module !== 'undefined' && module.exports ? require('./cortes.js') : root.DKAS_CORTES;
const C = {
  placa: { w: 320, h: 160, precio: 9000 },
  extra: 500,                        // dueño: +500 por pieza
  mdf: { hoja: 650, w: 244, h: 122, corte: 50 },
  corteRecto: 150, corteCurvo: 350, canto: 100, // por metro lineal (estimado)
  margen: 1.6,
  flete: 2000, minivanComedor: 800, minivanChica: 400,
  chiquita: 1125,                    // valor de un 0.80×0.80 que sale del sobrante
  pesoM2: 29,                        // kg por m² de sinterizado 12 mm
};
const VOLADO = { lateral: 8, centro: 12, consola: 8, escritorio: 15, periquera: 15, comedor: 25 };
const ALTO = { lateral: 55, centro: 40, consola: 80, escritorio: 75, periquera: 105, comedor: 76 };
// base por uso según el área de la piedra (m²); calibrada con los números del dueño
const BASE = {
  lateral: a => 800 + 1000 * a,          // Ø0.60 ≈ 1,200 (grapa chica)
  centro: a => 700 + 1250 * a,           // 0.80×0.80 = 1,500
  consola: a => 1200 + 1500 * a,
  escritorio: a => 1500 + 1500 * a,
  periquera: a => 1000 + 1500 * a,
  comedor: a => Math.min(7000, 2000 + 1800 * a), // tope 7,000 (dueño: bases grandes 6–7 mil)
};
const r100 = n => Math.round(n / 100) * 100, up100 = n => Math.ceil(n / 100) * 100;

// ---------- catálogo de medidas (cm) ----------
const L = [];
const add = (grupo, uso, forma, w, h, pers, nota) => L.push({ grupo, uso, forma, w, h: h ?? w, pers, nota });
// laterales
[40, 45, 50, 60].forEach(d => add('Mesas laterales', 'lateral', 'red', d));
[40, 50, 60].forEach(d => add('Mesas laterales', 'lateral', 'rect', d, d));
// centro
[[80, 80], [90, 90], [100, 100], [100, 60], [120, 60], [120, 70], [140, 70], [140, 80], [160, 80]].forEach(([w, h]) => add('Mesas de centro', 'centro', 'rect', w, h));
[80, 90, 100, 120].forEach(d => add('Mesas de centro', 'centro', 'red', d));
[[120, 80], [140, 90], [150, 100]].forEach(([w, h]) => add('Mesas de centro', 'centro', 'org', w, h));
// consolas y escritorios
[[100, 35], [120, 40], [150, 40], [180, 40]].forEach(([w, h]) => add('Consolas y escritorios', 'consola', 'rect', w, h));
[[120, 60], [140, 70], [160, 80]].forEach(([w, h]) => add('Consolas y escritorios', 'escritorio', 'rect', w, h));
// periqueras y barras
[60, 70, 80].forEach(d => add('Periqueras y barras (alto 1.05)', 'periquera', 'red', d, d, d <= 60 ? '2' : d <= 70 ? '2–3' : '3–4'));
[[120, 60], [160, 60], [200, 60], [240, 60]].forEach(([w, h]) => add('Periqueras y barras (alto 1.05)', 'periquera', 'rect', w, h, Math.round(w / 60) + ''));
// comedor redondo
[[100, '2–4'], [110, '4'], [120, '4'], [130, '4–5'], [140, '5–6'], [150, '6'], [160, '6–7']].forEach(([d, p]) => add('Comedor redondo', 'comedor', 'red', d, d, p));
// comedor cuadrado
[[90, '4'], [100, '4'], [120, '4'], [140, '8'], [160, '8']].forEach(([d, p]) => add('Comedor cuadrado', 'comedor', 'rect', d, d, p));
// comedor rectangular
[[140, 80, '4'], [160, 90, '4–6'], [180, 90, '6'], [180, 100, '6'], [200, 90, '6–8'], [200, 100, '6–8'], [200, 110, '8'], [200, 120, '8'], [220, 100, '8'],
 [220, 110, '8'], [240, 100, '8–10'], [240, 110, '8–10'], [240, 120, '8–10'], [260, 120, '10'], [280, 120, '10'], [280, 140, '10–12'],
 [280, 150, '10–12', 'Maestra'], [300, 120, '10–12'], [300, 140, '12'], [320, 160, '12–14', 'Placa completa']].forEach(([w, h, p, n]) => add('Comedor rectangular', 'comedor', 'rect', w, h, p, n));
// comedor ovalado
[[180, 100, '6'], [200, 110, '6–8'], [240, 120, '8–10'], [280, 140, '10–12']].forEach(([w, h, p]) => add('Comedor ovalado', 'comedor', 'oval', w, h, p));

// ---------- cálculo ----------
function perimetro(f, w, h) {
  if (f === 'red') return Math.PI * w;
  if (f === 'rect') return 2 * (w + h);
  const a = w / 2, b = h / 2, ram = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  return f === 'org' ? ram * 1.15 : ram;
}
function area(f, w, h) { return (f === 'rect' ? w * h : Math.PI * w * h / 4) / 1e4; } // m²
function acomodo(w, h) {
  const pieza = { forma: 'rect', w, h }, esp = { tipo: 'retazo', w: C.placa.w, h: C.placa.h }, cfg = { kerf: 0, refilado: 0, minSob: 15 };
  const items = [];
  for (let i = 0; i < 40; i++) items.push({ k: 0, forma: 'rect', w, h, et: '' });
  const r = CORTES.cortarEn(items, esp, cfg), n = r.puestas.length;
  // sobrante: el máximo de mesitas de 0.80×0.80 que caben junto con las n mesas (todas las mesas deben entrar)
  let mejor = { puestas: r.puestas, chicas: [] };
  if (!(w === 80 && h === 80)) for (let k = 1; k <= 8; k++) {
    const its = items.slice(0, n).concat(Array.from({ length: k }, () => ({ k: 1, forma: 'rect', w: 80, h: 80, et: '' })));
    const s = CORTES.cortarEn(its, esp, cfg);
    if (s.faltan.length) break;
    mejor = { puestas: s.puestas.filter(p => p.k === 0), chicas: s.puestas.filter(p => p.k === 1) };
  }
  return { n, puestas: mejor.puestas, chicas: mejor.chicas };
}
function calcular(m) {
  const a = area(m.forma, m.w, m.h), P = perimetro(m.forma, m.w, m.h) / 100;
  const ac = acomodo(m.w, m.h);
  const credito = ac.chicas.length * C.chiquita;
  const piedra = Math.max(0, (C.placa.precio - credito) / ac.n);
  const curvo = m.forma !== 'rect';
  const corte = curvo ? P * (C.corteCurvo + C.canto) : (P / 2) * C.corteRecto + P * C.canto;
  const v = VOLADO[m.uso], mw = Math.max(20, m.w - 2 * v), mh = Math.max(20, m.h - 2 * v);
  const hojas = (mw > C.mdf.w || mh > C.mdf.h) && (mh > C.mdf.w || mw > C.mdf.h) ? 2 : 1;
  const amdf = mw * mh / 1e4, octavo = C.mdf.w * C.mdf.h / 1e4 / 8;
  const mdf = hojas === 2 ? 2 * C.mdf.hoja + C.mdf.corte : Math.min(C.mdf.hoja, Math.ceil(amdf / octavo) * C.mdf.hoja / 8) + C.mdf.corte;
  const base = r100(BASE[m.uso](a));
  const pegamento = r100(100 + 80 * a) || 100, empaque = r100(100 + 60 * a) || 100;
  const costo = piedra + C.extra + corte + mdf + base + pegamento + empaque;
  const precio = up100(costo * C.margen);
  const largo = Math.max(m.w, m.h), ancho = Math.min(m.w, m.h);
  const minivan = largo <= 190 && ancho <= 110;
  const chico = ['lateral', 'centro', 'consola', 'escritorio'].includes(m.uso) || (m.uso === 'periquera' && largo <= 80);
  const entrega = minivan ? (chico ? C.minivanChica : C.minivanComedor) : C.flete;
  const total = chico ? precio : precio + entrega;
  return Object.assign(m, { a, P, ac, credito, piedra, corte, mdf, hojas, mdfMed: [mw, mh], base, pegamento, empaque, otros: C.extra + mdf + pegamento + empaque,
    costo, precio, ganancia: precio - costo, minivan, chico, entrega, total, peso: Math.round(a * C.pesoM2), alto: ALTO[m.uso] });
}

// 10% de descuento: conviene (verde) si todavía ganas 30% o más sobre el costo
const MIN_GANA = 0.30;
const semaforo = pct => pct >= MIN_GANA ? 'ok' : pct >= 0.15 ? 'meh' : 'no';

// ---------- paquetes de placa completa ----------
const PAQ = [
  { nombre: 'Comedor de 8 + sala completa', para: 'Casa: comedor, centro, recibidor', piezas: [['comedor', 'rect', 240, 120, 'Comedor 8'], ['centro', 'rect', 80, 80, 'Centro'], ['centro', 'rect', 80, 80, 'Centro'], ['consola', 'rect', 180, 40, 'Consola'], ['lateral', 'rect', 40, 40, 'Lateral']] },
  { nombre: 'Comedor de 8 + centro + laterales', para: 'Casa: comedor y sala', piezas: [['comedor', 'rect', 200, 120, 'Comedor 8'], ['centro', 'rect', 120, 80, 'Centro'], ['lateral', 'red', 60, 60, 'Lateral'], ['lateral', 'red', 60, 60, 'Lateral'], ['consola', 'rect', 150, 40, 'Consola'], ['lateral', 'rect', 40, 40, 'Lateral']] },
  { nombre: 'Comedor de 6 + sala', para: 'Departamento', piezas: [['comedor', 'rect', 180, 100, 'Comedor 6'], ['centro', 'rect', 140, 80, 'Centro'], ['consola', 'rect', 140, 40, 'Consola'], ['lateral', 'red', 60, 60, 'Lateral'], ['lateral', 'red', 60, 60, 'Lateral'], ['lateral', 'red', 60, 60, 'Lateral']] },
  { nombre: 'Maestra + 4 laterales', para: 'Casa grande: comedor de 10 a 12', piezas: [['comedor', 'rect', 280, 150, 'Maestra'], ['lateral', 'rect', 40, 40, 'Lat.'], ['lateral', 'rect', 40, 40, 'Lat.'], ['lateral', 'rect', 40, 40, 'Lat.'], ['lateral', 'rect', 40, 40, 'Lat.']] },
  { nombre: 'Comedor redondo + sala orgánica', para: 'Casa: comedor de 6 y sala', piezas: [['comedor', 'red', 160, 160, 'Comedor Ø1.60'], ['centro', 'org', 150, 100, 'Centro orgánica'], ['lateral', 'red', 60, 60, 'Lateral'], ['lateral', 'red', 60, 60, 'Lateral']] },
  { nombre: 'Dos comedores redondos Ø1.60', para: 'Dos casas, o casa + terraza (tu libreta)', piezas: [['comedor', 'red', 160, 160, 'Comedor Ø1.60'], ['comedor', 'red', 160, 160, 'Comedor Ø1.60']] },
  { nombre: 'Comedor redondo + comedor cuadrado', para: 'Comedor + desayunador (tu libreta)', piezas: [['comedor', 'red', 160, 160, 'Redondo Ø1.60'], ['comedor', 'rect', 160, 160, 'Cuadrado 1.60']] },
  { nombre: 'Sala orgánica + 4 mesitas + 2 laterales', para: 'Tu libreta: media placa orgánica y media placa en 4', piezas: [['centro', 'org', 150, 100, 'Orgánica'], ['lateral', 'red', 60, 60, 'Lateral'], ['lateral', 'red', 60, 60, 'Lateral'], ['centro', 'rect', 80, 80, 'Mesita'], ['centro', 'rect', 80, 80, 'Mesita'], ['centro', 'rect', 80, 80, 'Mesita'], ['centro', 'rect', 80, 80, 'Mesita']] },
  { nombre: 'Restaurante o café: 8 mesas de 2', para: 'Negocio', piezas: Array.from({ length: 8 }, () => ['centro', 'rect', 80, 80, 'Mesa 0.80']) },
  { nombre: 'Bar o terraza: 10 periqueras + barra', para: 'Negocio', piezas: Array.from({ length: 10 }, () => ['periquera', 'red', 60, 60, 'Periq.']).concat([['periquera', 'rect', 240, 40, 'Barra de pared 2.40 × 0.40']]) },
];
const DESC = [0.10, 0.15, 0.20];
function calcPaquetes() {
  PAQ.forEach(q => {
  q.ps = q.piezas.map(([uso, forma, w, h, nom]) => calcular({ grupo: '', uso, forma, w, h, nom }));
  const items = q.ps.map((m, i) => ({ k: i, forma: 'rect', w: m.w, h: m.h, et: '' }));
  const r = CORTES.cortarEn(items, { tipo: 'retazo', w: C.placa.w, h: C.placa.h }, { kerf: 0, refilado: 0, minSob: 15 });
  if (r.faltan.length) throw new Error('No cabe el paquete ' + q.nombre);
  q.puestas = r.puestas;
  q.usado = Math.round(q.ps.reduce((s, m) => s + m.w * m.h, 0) / (C.placa.w * C.placa.h) * 100);
  q.costo = C.placa.precio + q.ps.reduce((s, m) => s + m.costo - m.piedra, 0);
  q.lista = q.ps.reduce((s, m) => s + m.precio, 0);
  q.entrega = q.ps.some(m => !m.minivan) ? C.flete : q.ps.some(m => !m.chico) ? C.minivanComedor : C.minivanChica;
  q.desc = DESC.map(d => { const p = r100(q.lista * (1 - d)); return { d, p, pct: (p - q.costo) / q.costo }; });
  q.reco = q.desc.filter(x => x.pct >= MIN_GANA).pop() || q.desc[0];
  q.max = Math.floor((1 - (1 + MIN_GANA) * q.costo / q.lista) * 100);
  q.principal = q.ps.reduce((a, b) => b.precio > a.precio ? b : a);
  q.resto = q.reco.p - q.principal.precio;
});
  return PAQ;
}
function agrupar(ps) {
  const g = [];
  ps.forEach(m => { const x = g.find(([o]) => o.nom === m.nom && o.w === m.w && o.h === m.h && o.forma === m.forma); x ? x[1]++ : g.push([m, 1]); });
  return g;
}
// ---------- cotizar una medida: precio, 10%, entrega, placa, qué más sale del sobrante y medidas que convienen ----------
const PERSONAS = (uso, forma, w, h) => {
  if (uso === 'periquera') return forma === 'rect' ? Math.max(2, Math.round(Math.max(w, h) / 60)) : w <= 60 ? 2 : w <= 70 ? 3 : 4;
  if (uso !== 'comedor') return null;
  if (forma === 'red') return Math.max(2, Math.floor(Math.PI * w / 65));
  const L = Math.max(w, h), A = Math.min(w, h);
  return Math.max(2, 2 * Math.floor(L / 60) + (A >= 100 ? 2 : 0));
};
// piezas chicas que se ofrecen con lo que sobra (de la más cara a la más barata)
const EXTRAS = [['centro', 'rect', 120, 60, 'Mesa de centro'], ['consola', 'rect', 180, 40, 'Consola'], ['centro', 'rect', 80, 80, 'Mesa de centro'], ['consola', 'rect', 120, 40, 'Consola'],
  ['lateral', 'red', 60, 60, 'Lateral'], ['lateral', 'rect', 50, 50, 'Lateral'], ['lateral', 'rect', 40, 40, 'Lateral']];
const CFG0 = { kerf: 0, refilado: 0, minSob: 15 };
const cabeEn = (w, h) => (w <= C.placa.w && h <= C.placa.h) || (h <= C.placa.w && w <= C.placa.h);
function cotizar(q) {
  const uso = q.uso, forma = q.forma, w = +q.w, h = forma === 'red' ? +q.w : +q.h, cant = Math.max(1, Math.floor(+q.cant || 1));
  if (!(w > 0 && h > 0)) return { error: 'Escribe las medidas.' };
  if (w < 30 || h < 30) return { error: 'La medida más chica que se corta es de 30 cm.' };
  if (!cabeEn(w, h)) return { error: 'No sale de una sola placa (la placa mide 3.20 × 1.60). Para esa medida se necesitan 2 placas unidas: cotízala aparte.' };
  const m = calcular({ uso, forma, w, h, nom: 'La mesa' });
  m.pers = PERSONAS(uso, forma, w, h);
  const r = { m, cant, placas: Math.ceil(cant / m.ac.n) };
  // precios
  r.precio = m.precio * cant;
  r.d10 = r100(r.precio * 0.9); r.pct10 = (r.d10 - m.costo * cant) / (m.costo * cant);
  r.entrega = m.entrega; r.total = r.precio + (m.chico ? 0 : m.entrega);
  // qué más sale del sobrante (en la última placa): se agregan piezas mientras todo quepa
  const enUltima = cant - (r.placas - 1) * m.ac.n;
  const base = Array.from({ length: enUltima }, (_, i) => ({ k: 'm', forma: 'rect', w, h, et: '' }));
  let extras = [], acomodo1 = CORTES.cortarEn(base, { tipo: 'retazo', w: C.placa.w, h: C.placa.h }, CFG0).puestas;
  const otraIgual = [uso, forma, w, h, 'Otra igual'];
  for (const ex of [otraIgual].concat(EXTRAS)) for (let i = 0; i < (ex === otraIgual ? 12 : 2); i++) {
    const prueba = base.concat(extras.concat([ex]).map((e, j) => ({ k: j, forma: 'rect', w: e[2], h: e[3], et: '' })));
    const s = CORTES.cortarEn(prueba, { tipo: 'retazo', w: C.placa.w, h: C.placa.h }, CFG0);
    if (s.faltan.length) break;
    extras.push(ex); acomodo1 = s.puestas;
  }
  r.extras = extras.map(([u, f, ew, eh, nom]) => calcular({ uso: u, forma: f, w: ew, h: eh, nom }));
  r.puestas = acomodo1;
  r.usado = Math.round((enUltima * w * h + r.extras.reduce((s, e) => s + e.w * e.h, 0)) / (C.placa.w * C.placa.h) * 100);
  // paquete: la(s) mesa(s) + todo lo que sale del sobrante, con el descuento más grande que deja 30%
  if (r.extras.length) {
    const todas = Array.from({ length: cant }, () => m).concat(r.extras);
    const costo = r.placas * C.placa.precio + todas.reduce((s, x) => s + x.costo - x.piedra, 0), lista = todas.reduce((s, x) => s + x.precio, 0);
    const desc = DESC.map(d => { const p = r100(lista * (1 - d)); return { d, p, pct: (p - costo) / costo }; });
    const reco = desc.filter(x => x.pct >= MIN_GANA).pop() || null;
    const entrega = todas.some(x => !x.minivan) ? C.flete : todas.some(x => !x.chico) ? C.minivanComedor : C.minivanChica;
    r.paquete = { costo, lista, desc, reco, entrega, extrasLista: r.extras.reduce((s, x) => s + x.precio, 0), resto: reco ? reco.p - r.precio : null };
  }
  // medidas parecidas (±20 cm) que salen más baratas porque aprovechan mejor la placa
  r.parecidas = L.filter(x => x.uso === uso && x.forma === forma && !(x.w === w && x.h === h) && Math.abs(x.w - w) <= 20 && Math.abs(x.h - h) <= 20)
    .map(x => x.precio ? x : calcular(x)).filter(x => x.precio <= m.precio * 0.95).sort((a, b) => a.precio - b.precio).slice(0, 3);
  return r;
}

const PRECIOS = { C, VOLADO, ALTO, BASE, r100, up100, perimetro, area, acomodo, calcular, CATALOGO: L, MIN_GANA, semaforo, PAQ, DESC, calcPaquetes, agrupar, cotizar, PERSONAS };
if (typeof module !== 'undefined' && module.exports) module.exports = PRECIOS; else root.DKAS_PRECIOS = PRECIOS;
})(typeof window !== 'undefined' ? window : globalThis);

;
/* DKAS · Cotizar: pones el uso, la forma y las medidas y te dice el precio, el precio con 10%, la entrega, cuánto ganas,
   cómo sale de la placa, qué más sale del sobrante (con precio de paquete), medidas parecidas más baratas y el mensaje
   para el cliente. Las cuentas viven en precios.js (DKAS_PRECIOS), las mismas de "Lista de precios DKAS.pdf".
   Ruta: #cotizar. No guarda nada en Firebase; recuerda la última consulta en localStorage (dkas-cotizar). */
(function () {
  const P = window.DKAS_PRECIOS;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $m = n => '$' + Math.round(n).toLocaleString('en-US');
  const m2 = cm => (cm / 100).toFixed(2);
  const med = x => x.forma === 'red' ? 'Ø ' + m2(x.w) : m2(x.w) + ' × ' + m2(x.h);
  // acepta "2.10", "2,10" (metros) o "210" (cm)
  const cm = v => { const n = Number(String(v == null ? '' : v).replace(',', '.').trim()); if (!isFinite(n) || n <= 0) return NaN; return Math.round(n < 10 ? n * 100 : n); };

  const USOS = [['comedor', 'Comedor'], ['centro', 'Centro'], ['lateral', 'Lateral'], ['periquera', 'Periquera'], ['consola', 'Consola'], ['escritorio', 'Escritorio']];
  const FORMAS = [['rect', 'Rectangular'], ['red', 'Redonda'], ['oval', 'Ovalada'], ['org', 'Orgánica']];
  let X, main, st = { uso: 'comedor', forma: 'rect', w: '', h: '', cant: 1, con10: false };
  try { const s = JSON.parse(localStorage.getItem('dkas-cotizar')); if (s && s.uso) st = Object.assign(st, s); } catch (e) {}
  const guarda = () => { try { localStorage.setItem('dkas-cotizar', JSON.stringify(st)); } catch (e) {} };

  function pantalla(m, ctx) {
    main = m; X = ctx;
    main.innerHTML = '<div class="cz"><h1 class="cz-t">Cotizar</h1>'
      + '<section class="cz-f">'
      + '<div class="cz-k">¿Qué mesa?</div><div class="cz-ch" id="cz-uso">' + USOS.map(([k, t]) => '<button data-uso="' + k + '">' + t + '</button>').join('') + '</div>'
      + '<div class="cz-k">Forma</div><div class="cz-ch" id="cz-forma">' + FORMAS.map(([k, t]) => '<button data-forma="' + k + '">' + t + '</button>').join('') + '</div>'
      + '<div class="cz-med"><label><span id="cz-l1">Largo</span><input id="cz-w" inputmode="decimal" placeholder="ej. 2.00"></label><label id="cz-l2w"><span>Ancho</span><input id="cz-h" inputmode="decimal" placeholder="ej. 1.00"></label><label class="cz-cant"><span>Cuántas</span><input id="cz-c" inputmode="numeric" value="1"></label></div>'
      + '<p class="cz-ayuda">En metros (2.10) o en centímetros (210).</p>'
      + '<div class="cz-k">Medidas de la lista</div><div class="cz-std" id="cz-std"></div>'
      + '</section><div id="cz-res"></div></div>';
    $('#cz-w').value = st.w; $('#cz-h').value = st.h; $('#cz-c').value = st.cant;
    $$('[data-uso]').forEach(b => b.onclick = () => { st.uso = b.dataset.uso; pintar(); });
    $$('[data-forma]').forEach(b => b.onclick = () => { st.forma = b.dataset.forma; pintar(); });
    ['#cz-w', '#cz-h', '#cz-c'].forEach(s => $(s).oninput = () => { st.w = $('#cz-w').value; st.h = $('#cz-h').value; st.cant = $('#cz-c').value; calcular(); });
    pintar();
  }

  function pintar() {
    $$('[data-uso]').forEach(b => b.classList.toggle('on', b.dataset.uso === st.uso));
    $$('[data-forma]').forEach(b => b.classList.toggle('on', b.dataset.forma === st.forma));
    const red = st.forma === 'red';
    $('#cz-l1').textContent = red ? 'Diámetro' : 'Largo'; $('#cz-l2w').hidden = red;
    const std = P.CATALOGO.filter(x => x.uso === st.uso && x.forma === st.forma);
    $('#cz-std').innerHTML = std.length ? std.map(x => '<button data-w="' + x.w + '" data-h="' + x.h + '">' + med(x) + (x.nota ? ' <small>' + esc(x.nota) + '</small>' : '') + '</button>').join('') : '<span class="cz-nada">No hay medidas de lista para esta combinación: escribe la medida.</span>';
    $$('#cz-std [data-w]').forEach(b => b.onclick = () => { st.w = m2(+b.dataset.w); st.h = m2(+b.dataset.h); $('#cz-w').value = st.w; $('#cz-h').value = st.h; calcular(); });
    calcular();
  }

  function calcular() {
    guarda();
    const out = $('#cz-res'), w = cm(st.w), h = st.forma === 'red' ? w : cm(st.h), cant = Math.max(1, Math.floor(+st.cant || 1));
    $$('#cz-std [data-w]').forEach(b => b.classList.toggle('on', +b.dataset.w === w && +b.dataset.h === h));
    if (!(w > 0) || !(h > 0)) { out.innerHTML = '<p class="cz-vacio">Escribe las medidas o toca una de la lista.</p>'; return; }
    const r = P.cotizar({ uso: st.uso, forma: st.forma, w: Math.max(w, h), h: Math.min(w, h), cant });
    if (r.error) { out.innerHTML = '<div class="cz-err">' + esc(r.error) + '</div>'; return; }
    out.innerHTML = tarjetaPrecio(r) + tarjetaPlaca(r) + tarjetaSobra(r) + tarjetaParecidas(r) + tarjetaCosto(r) + tarjetaPaquetes();
    $$('[data-copia]', out).forEach(b => b.onclick = () => copiar(b.dataset.copia === 'msg' ? mensaje(r) : b.dataset.txt));
    const t = $('#cz-10', out); if (t) t.onchange = () => { st.con10 = t.checked; guarda(); };
    $$('[data-ir]', out).forEach(b => b.onclick = () => { st.w = m2(+b.dataset.w); st.h = m2(+b.dataset.h); $('#cz-w').value = st.w; $('#cz-h').value = st.h; calcular(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  // ---------- tarjetas ----------
  function tarjetaPrecio(r) {
    const m = r.m, c = r.cant, sem = P.semaforo(r.pct10);
    return '<section class="cz-c cz-precio"><div class="cz-que">' + (c > 1 ? c + ' × ' : '') + esc(nombreUso(m)) + ' ' + med(m) + (m.pers ? ' · ' + m.pers + ' personas' : '') + '</div>'
      + '<div class="cz-big">' + $m(r.precio) + '</div>' + (c > 1 ? '<div class="cz-sub">' + $m(m.precio) + ' cada una</div>' : '')
      + '<div class="cz-filas">'
      + (m.chico ? '<div><span>Entrega</span><b>Minivan ~' + $m(P.C.minivanChica) + ' por viaje, aparte</b></div>'
        : '<div><span>Entrega</span><b>' + (m.minivan ? 'Minivan ' : 'Flete ') + $m(m.entrega) + '</b></div><div class="cz-tot"><span>Total al cliente</span><b>' + $m(r.total) + '</b></div>')
      + '<div class="cz-d10 ' + sem + '"><span>Con 10%</span><b>' + $m(r.d10) + (m.chico ? '' : ' <small>+ entrega = ' + $m(r.d10 + m.entrega) + '</small>') + '</b><em>' + (sem === 'ok' ? 'Sí conviene: ganas ' : 'Ojo: ganas solo ') + Math.round(r.pct10 * 100) + '%</em></div>'
      + '<div><span>Ganas</span><b>' + $m(r.precio - m.costo * c) + ' <small>(' + Math.round((r.precio - m.costo * c) / (m.costo * c) * 100) + '%)</small></b></div>'
      + '</div><label class="cz-sw"><input type="checkbox" id="cz-10"' + (st.con10 ? ' checked' : '') + '> Mandar el precio con 10%</label>'
      + '<button class="btn negro grande" data-copia="msg">Copiar mensaje para el cliente</button></section>';
  }
  function tarjetaPlaca(r) {
    const m = r.m, sobra = r.extras.length;
    return '<section class="cz-c"><h2>Cómo sale de la placa</h2>' + svg(r)
      + '<p class="cz-p">De una placa de 3.20 × 1.60 salen <b>' + m.ac.n + (m.ac.n === 1 ? ' mesa' : ' iguales') + '</b>.' + (r.cant > 1 ? ' Para ' + r.cant + ' ocupas <b>' + r.placas + ' placa' + (r.placas > 1 ? 's' : '') + '</b>.' : '')
      + (sobra ? ' Con el sobrante usas el <b>' + r.usado + '%</b> de la placa (en dorado).' : '') + '</p></section>';
  }
  function tarjetaSobra(r) {
    if (!r.extras.length || !r.paquete) return '';
    const q = r.paquete, g = P.agrupar(r.extras);
    const frase = q.reco ? 'De tu misma placa salen también ' + g.map(([e, n]) => (n > 1 ? n + ' ' : 'una ') + nombrePlural(e, n) + ' de ' + med(e)).join(', ') + '. Si te las llevas juntas, son solo ' + $m(q.resto) + ' más.' : '';
    return '<section class="cz-c"><h2>Con lo que sobra puedes hacer</h2><div class="cz-lista">'
      + g.map(([e, n]) => '<div><span>' + (n > 1 ? n + ' × ' : '') + esc(e.nom) + ' ' + med(e) + '</span><b>' + $m(e.precio * n) + '</b></div>').join('')
      + '<div class="cz-tot"><span>Todo junto, suelto</span><b>' + $m(q.lista) + '</b></div>'
      + q.desc.map(x => '<div class="cz-ds ' + P.semaforo(x.pct) + (x === q.reco ? ' reco' : '') + '"><span>Paquete con ' + Math.round(x.d * 100) + '%' + (x === q.reco ? ' · el que te recomiendo' : '') + '</span><b>' + $m(x.p) + ' <small>ganas ' + Math.round(x.pct * 100) + '%</small></b></div>').join('')
      + '</div>' + (frase ? '<p class="cz-frase">"' + esc(frase) + '"</p><button class="btn" data-copia="txt" data-txt="' + esc(frase) + '">Copiar esta frase</button>' : '') + '</section>';
  }
  function tarjetaParecidas(r) {
    if (!r.parecidas.length) return '';
    return '<section class="cz-c"><h2>Medidas parecidas que salen más baratas</h2><p class="cz-p">Aprovechan mejor la placa. Ofrécelas si al cliente le da igual unos centímetros.</p><div class="cz-lista">'
      + r.parecidas.map(x => '<div><span>' + med(x) + ' <small>' + x.ac.n + ' por placa</small></span><b>' + $m(x.precio) + ' <button class="lnk" data-ir data-w="' + x.w + '" data-h="' + x.h + '">ver</button></b></div>').join('') + '</div></section>';
  }
  function tarjetaCosto(r) {
    const m = r.m;
    const fil = [['Piedra', m.piedra, m.credito ? 'Placa ÷ ' + m.ac.n + ', menos ' + m.ac.chicas.length + ' mesitas de 0.80 del sobrante' : 'Placa ' + $m(P.C.placa.precio) + ' ÷ ' + m.ac.n],
      ['Cargo por pieza', P.C.extra, ''], ['Corte y canto', m.corte, m.forma === 'rect' ? 'Recto' : 'Curvo'], ['MDF 12 mm', m.mdf, m2(m.mdfMed[0]) + ' × ' + m2(m.mdfMed[1])],
      ['Base', m.base, 'Alto ' + m2(m.alto)], ['Pegamento y tornillería', m.pegamento, ''], ['Empaque', m.empaque, '']];
    return '<details class="cz-c cz-det"><summary>Lo que te cuesta' + (r.cant > 1 ? ' (cada una)' : '') + ': <b>' + $m(m.costo) + '</b></summary><div class="cz-lista">'
      + fil.map(([t, v, n]) => '<div><span>' + t + (n ? ' <small>' + esc(n) + '</small>' : '') + '</span><b>' + $m(v) + '</b></div>').join('')
      + '<div class="cz-tot"><span>Costo</span><b>' + $m(m.costo) + '</b></div><div><span>Precio <small>costo × ' + P.C.margen + '</small></span><b>' + $m(m.precio) + '</b></div></div>'
      + '<p class="cz-p cz-chico">Corte, bases intermedias, pegamento y empaque son estimados; los demás son tus números.</p></details>';
  }
  let paqs = null;
  function tarjetaPaquetes() {
    paqs = paqs || P.calcPaquetes();
    return '<details class="cz-c cz-det"><summary>Paquetes de placa completa (' + paqs.length + ')</summary><div class="cz-lista">'
      + paqs.map(q => '<div class="cz-pq"><span><b>' + esc(q.nombre) + '</b><small>' + P.agrupar(q.ps).map(([m, n]) => (n > 1 ? n + ' × ' : '') + m.nom.replace('Periq.', 'Periquera').replace('Lat.', 'Lateral') + (/\d/.test(m.nom) ? '' : ' ' + med(m))).join(' · ') + '</small></span><b><s>' + $m(q.lista) + '</s>' + $m(q.reco.p) + '<small>−' + Math.round(q.reco.d * 100) + '% + entrega ' + $m(q.entrega) + '</small></b></div>').join('')
      + '</div></details>';
  }

  // ---------- dibujo ----------
  function svg(r) {
    const W = 320, H = 160, m = r.m;
    const pz = r.puestas.map(p => {
      const ex = p.k === 'm' ? null : r.extras[p.k], f = ex ? ex.forma : m.forma, cls = ex ? 'cz-x' : 'cz-m';
      const forma = f === 'rect' ? '<rect x="' + (p.x + 1) + '" y="' + (p.y + 1) + '" width="' + (p.w - 2) + '" height="' + (p.h - 2) + '" rx="2" class="' + cls + '"/>'
        : '<ellipse cx="' + (p.x + p.w / 2) + '" cy="' + (p.y + p.h / 2) + '" rx="' + (p.w / 2 - 1) + '" ry="' + (p.h / 2 - 1) + '" class="' + cls + '"/>';
      const fs = Math.max(7, Math.min(14, Math.min(p.w, p.h) / 4));
      const txt = p.w >= 35 && p.h >= 25 ? '<text x="' + (p.x + p.w / 2) + '" y="' + (p.y + p.h / 2 + fs / 3) + '" font-size="' + fs + '">' + (p.rot ? m2(p.h) + '×' + m2(p.w) : (f === 'red' ? 'Ø' + m2(p.w) : m2(p.w) + '×' + m2(p.h))) + '</text>' : '';
      return forma + txt;
    }).join('');
    return '<svg class="cz-svg" viewBox="-2 -2 ' + (W + 4) + ' ' + (H + 4) + '"><rect x="0" y="0" width="' + W + '" height="' + H + '" class="cz-pl"/>' + pz + '</svg>';
  }

  // ---------- textos ----------
  const NOM = { comedor: 'Mesa de comedor', centro: 'Mesa de centro', lateral: 'Mesa lateral', periquera: 'Periquera', consola: 'Consola', escritorio: 'Escritorio' };
  const nombreUso = m => NOM[m.uso] + (m.forma === 'red' ? ' redonda' : m.forma === 'oval' ? ' ovalada' : m.forma === 'org' ? ' orgánica' : m.w === m.h ? ' cuadrada' : '');
  const nombrePlural = (e, n) => { const b = e.nom.toLowerCase(); return n > 1 ? b.replace('mesa de centro', 'mesas de centro').replace(/^consola$/, 'consolas').replace(/^lateral$/, 'laterales').replace('otra igual', 'mesas iguales') : b.replace('otra igual', 'mesa igual'); };
  function mensaje(r) {
    const m = r.m, con10 = st.con10, p = con10 ? r.d10 : r.precio, tot = p + (m.chico ? 0 : m.entrega);
    const que = (r.cant > 1 ? r.cant + ' ' + nombreUso(m).toLowerCase().replace(/^mesa /, 'mesas ').replace(/^periquera/, 'periqueras').replace(/^consola/, 'consolas').replace(/^escritorio/, 'escritorios') : 'tu ' + nombreUso(m).toLowerCase()) + ' de piedra sinterizada de ' + med(m) + ' m' + (m.pers ? ' (para ' + m.pers + ' personas)' : '');
    return 'Hola, ¿cómo estás? Soy Zury de DKAS. Te paso la cotización de ' + que + ': ' + $m(p) + (con10 ? ', ya con 10% de descuento' : '') + '.'
      + (m.chico ? '' : ' La entrega es de ' + $m(m.entrega) + ', en total ' + $m(tot) + '.')
      + ' Para fabricarla se aparta con el 50% de anticipo. ¿Cómo la ves?';
  }
  function copiar(t) {
    const ok = () => X.toast('Copiado. Pégalo en WhatsApp.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => viejo(t, ok)); else viejo(t, ok);
  }
  function viejo(t, ok) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); ok(); } catch (e) { X.alerta(t); } a.remove(); }

  window.DKAS_COTIZAR = { pantalla, mensaje: r => mensaje(r) };
})();

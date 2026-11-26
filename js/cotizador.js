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
  flete: 4500, minivanComedor: 800, minivanChica: 400, // dueño 25 nov 2026: el flete siempre es $4,500
  chiquita: 1125,                    // valor de un 0.80×0.80 que sale del sobrante
  pesoM2: 29,                        // kg por m² de sinterizado 12 mm
};
const VOLADO = { lateral: 8, centro: 12, consola: 8, escritorio: 15, periquera: 15, comedor: 25 };
const ALTO = { lateral: 55, centro: 40, consola: 80, escritorio: 75, periquera: 105, comedor: 75 };
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
// igual que DKAS.personas (dkas-data.js): 70 cm por persona; así la hoja y el plano dicen lo mismo
const PERSONAS = (uso, forma, w, h) => {
  if (uso !== 'comedor' && uso !== 'periquera') return null;
  const L = Math.max(w, h), W = Math.min(w, h);
  if (forma === 'rect' && L === W) return 4 * Math.max(1, Math.floor(L / 70));
  if (forma === 'rect') return 2 * Math.floor(L / 70) + (W >= 90 ? 2 : 0);
  return Math.floor(perimetro(forma === 'org' ? 'oval' : forma, L, W) / 70);
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
/* DKAS · Cotizar (v2, 2026-11-15: "más fácil, igual de información, más opciones para mandar por WhatsApp con fotos").
   Arriba: qué mesa, forma, medidas, cuántas y piedra (todo con toques). En medio: el precio grande con el cambio a "con 10%"
   y, cerrados con su resumen, placa y sobrante, medidas más baratas, lo que te cuesta y los paquetes. Abajo: Mandar por WhatsApp
   con nombre y número, 5 tipos de mensaje, texto editable y adjuntos (hoja de cotización, foto 3D, plano con medidas, muestra
   de la piedra, paquete de la placa). Las cuentas viven en precios.js (DKAS_PRECIOS), las mismas del PDF.
   Ruta: #cotizar. No guarda nada en Firebase; recuerda la última consulta en localStorage (dkas-cotizar). */
(function () {
  const P = window.DKAS_PRECIOS, D = window.DKAS;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $m = n => '$' + Math.round(n).toLocaleString('en-US');
  const m2 = cm => (cm / 100).toFixed(2);
  const med = x => x.forma === 'red' ? 'Ø ' + m2(x.w) : m2(x.w) + ' × ' + m2(x.h);
  const cm = v => { const n = Number(String(v == null ? '' : v).replace(',', '.').trim()); if (!isFinite(n) || n <= 0) return NaN; return Math.round(n < 10 ? n * 100 : n); };
  const USOS = [['comedor', 'Comedor'], ['centro', 'Centro'], ['lateral', 'Lateral'], ['periquera', 'Periquera'], ['consola', 'Consola'], ['escritorio', 'Escritorio']];
  const FORMAS = [['rect', 'Rectangular'], ['red', 'Redonda'], ['oval', 'Ovalada'], ['org', 'Orgánica']];
  const PIEDRAS = (D && D.PIEDRAS) || [];
  const ADJ = [['hoja', 'Hoja de cotización'], ['f3d', 'Foto 3D'], ['plano', 'Plano con medidas'], ['piedra', 'Muestra de la piedra'], ['paq', 'Paquete de la placa']];
  const TIPOS = [['coti', 'Cotización'], ['corta', 'Corta'], ['formal', 'Formal'], ['paq', 'Ofrecer paquete'], ['barata', 'Medida más barata']];

  let X, main, r = null, editado = false;
  let st = { uso: 'comedor', forma: 'rect', w: '', h: '', cant: 1, piedra: PIEDRAS[0] ? PIEDRAS[0].id : '', base: '', con10: false, tipo: 'coti', nombre: '', tel: '', adj: { hoja: true, f3d: true, plano: true, piedra: true, paq: false } };
  try { const s = JSON.parse(localStorage.getItem('dkas-cotizar')); if (s && s.uso) st = Object.assign(st, s, { adj: Object.assign({}, st.adj, s.adj || {}) }); } catch (e) {}
  const guarda = () => { try { localStorage.setItem('dkas-cotizar', JSON.stringify(st)); } catch (e) {} };

  // ---------- pantalla ----------
  function pantalla(m, ctx) {
    main = m; X = ctx;
    main.innerHTML = '<div class="cz">'
      + '<section class="cz-f"><div class="cz-fila" id="cz-uso">' + USOS.map(([k, t]) => '<button data-uso="' + k + '">' + t + '</button>').join('') + '</div>'
      + '<div class="cz-fila" id="cz-forma">' + FORMAS.map(([k, t]) => '<button data-forma="' + k + '">' + t + '</button>').join('') + '</div>'
      + '<div class="cz-med"><label><span id="cz-l1">Largo</span><input id="cz-w" inputmode="decimal" placeholder="2.00" autocomplete="off"></label><span class="cz-x" id="cz-xx">×</span>'
      + '<label id="cz-l2w"><span>Ancho</span><input id="cz-h" inputmode="decimal" placeholder="1.00" autocomplete="off"></label>'
      + '<div class="cz-cant"><span>Cuántas</span><div><button data-c="-1" aria-label="Menos">−</button><b id="cz-c">1</b><button data-c="1" aria-label="Más">+</button></div></div></div>'
      + '<div class="cz-fila cz-std" id="cz-std"></div>'
      + '<div class="cz-fila cz-pied" id="cz-pied">' + PIEDRAS.map(p => '<button data-p="' + p.id + '" title="' + esc(p.nombre) + '"><i style="background-image:url(img/piedras/' + p.id + '.jpg)"></i>' + esc(p.nombre) + '</button>').join('') + '</div>'
      + '<div class="cz-fila cz-bases" id="cz-bases"></div></section>'
      + '<div id="cz-res"></div>'
      + '<section class="cz-c cz-env" id="cz-env" hidden><h2>Mandar por WhatsApp</h2>'
      + '<div class="cz-cli"><label><span>Nombre</span><input id="cz-nom" autocomplete="off" placeholder="opcional"></label><label><span>WhatsApp</span><input id="cz-tel" inputmode="tel" autocomplete="off" placeholder="opcional, 10 dígitos"></label></div>'
      + '<div class="cz-k">Mensaje</div><div class="cz-fila cz-tipos" id="cz-tipos"></div>'
      + '<textarea id="cz-msg" rows="6"></textarea>'
      + '<div class="cz-k">Mandar también</div><div class="cz-adj" id="cz-adj"></div>'
      + '<div class="cz-bot"><button class="btn verde grande" id="cz-wa">Mandar por WhatsApp</button><div><button class="btn" id="cz-cop">Copiar texto</button><button class="btn" id="cz-baj">Bajar imágenes</button></div></div>'
      + '<p class="cz-chico">Con número: se abre su chat con el mensaje y las imágenes quedan copiadas para pegarlas. Sin número: eliges a quién mandárselo.</p></section>'
      + '<div class="cz-bar" id="cz-bar" hidden><div><small id="cz-bar-t"></small><b id="cz-bar-p"></b></div><button class="btn verde" id="cz-bar-b">Mandar</button></div>'
      + '</div>';
    $('#cz-w').value = st.w; $('#cz-h').value = st.h; $('#cz-nom').value = st.nombre; $('#cz-tel').value = st.tel;
    $$('[data-uso]').forEach(b => b.onclick = () => { st.uso = b.dataset.uso; st.base = ''; pintar(); });
    $$('[data-forma]').forEach(b => b.onclick = () => { st.forma = b.dataset.forma; st.base = ''; pintar(); });
    $$('[data-p]').forEach(b => b.onclick = () => { st.piedra = b.dataset.p; marcar(); calcular(); });
    $$('[data-c]').forEach(b => b.onclick = () => { st.cant = Math.max(1, Math.min(50, (+st.cant || 1) + +b.dataset.c)); calcular(); });
    ['#cz-w', '#cz-h'].forEach(s => $(s).oninput = () => { st.w = $('#cz-w').value; st.h = $('#cz-h').value; calcular(); });
    $('#cz-w').onkeydown = e => { if (e.key === 'Enter' && st.forma !== 'red') $('#cz-h').focus(); };
    $('#cz-nom').oninput = () => { st.nombre = $('#cz-nom').value.trim(); editado = false; envio(); };
    $('#cz-tel').oninput = () => { st.tel = $('#cz-tel').value.trim(); guarda(); };
    $('#cz-msg').oninput = () => { editado = true; };
    $('#cz-wa').onclick = mandar; $('#cz-bar-b').onclick = () => $('#cz-env').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#cz-cop').onclick = () => copiar($('#cz-msg').value);
    $('#cz-baj').onclick = async () => { const fs = await archivos(); fs.forEach(f => bajar(f)); X.toast(fs.length ? 'Se bajaron ' + fs.length + ' imágenes' : 'No hay imágenes elegidas'); };
    pintar();
  }

  // ---------- modelo para el 3D y el plano del sistema (solo comedor, centro y periquera con medidas que el sistema acepta) ----------
  function modeloD(rr) {
    if (!D || !D.USOS || !D.USOS[st.uso] || st.forma === 'org') return null;
    const x = rr.m, forma = st.forma === 'red' ? 'round' : st.forma === 'oval' ? 'oval' : x.w === x.h ? 'square' : 'rect';
    if (!D.USOS[st.uso].formas[forma]) return null;
    const n = D.normalizar({ uso: st.uso, forma, L: x.w, W: x.h, piedra: st.piedra, base: st.base, color: 'negro' });
    return n.L === x.w && n.W === x.h ? n : null;
  }

  function pintar() {
    marcar();
    const red = st.forma === 'red';
    $('#cz-l1').textContent = red ? 'Diámetro' : 'Largo'; $('#cz-l2w').hidden = red; $('#cz-xx').hidden = red;
    const std = P.CATALOGO.filter(x => x.uso === st.uso && x.forma === st.forma);
    $('#cz-std').innerHTML = std.length ? '<span class="cz-et">Rápidas</span>' + std.map(x => '<button data-w="' + x.w + '" data-h="' + x.h + '">' + med(x) + '</button>').join('') : '';
    $$('#cz-std [data-w]').forEach(b => b.onclick = () => { st.w = m2(+b.dataset.w); st.h = m2(+b.dataset.h); $('#cz-w').value = st.w; $('#cz-h').value = st.h; calcular(); });
    calcular();
  }
  function marcar() {
    $$('[data-uso]').forEach(b => b.classList.toggle('on', b.dataset.uso === st.uso));
    $$('[data-forma]').forEach(b => b.classList.toggle('on', b.dataset.forma === st.forma));
    $$('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === st.piedra));
  }

  function calcular() {
    guarda(); $('#cz-c').textContent = st.cant || 1;
    const out = $('#cz-res'), w = cm(st.w), h = st.forma === 'red' ? w : cm(st.h), cant = Math.max(1, Math.floor(+st.cant || 1));
    $$('#cz-std [data-w]').forEach(b => b.classList.toggle('on', +b.dataset.w === Math.max(w, h) && +b.dataset.h === Math.min(w, h)));
    r = null; editado = false;
    const sinRes = msg => { out.innerHTML = msg; $('#cz-env').hidden = true; $('#cz-bar').hidden = true; $('#cz-bases').innerHTML = ''; };
    if (!(w > 0) || !(h > 0)) return sinRes('<p class="cz-vacio">Escribe las medidas o toca una rápida.</p>');
    const rr = P.cotizar({ uso: st.uso, forma: st.forma, w: Math.max(w, h), h: Math.min(w, h), cant });
    if (rr.error) return sinRes('<div class="cz-err">' + esc(rr.error) + '</div>');
    r = rr; r.piedra = PIEDRAS.find(p => p.id === st.piedra) || PIEDRAS[0] || { id: '', nombre: '' };
    // bases que el sistema puede dibujar para esta mesa
    const md = modeloD(r); r.modelo = md;
    if (md && D.basesPara) {
      const bs = D.basesPara(md).filter(b => D.BASES[b] && !D.BASES[b].cli);
      if (!bs.includes(st.base)) st.base = md.base;
      $('#cz-bases').innerHTML = '<span class="cz-et">Base</span>' + bs.map(b => '<button data-b="' + b + '"' + (b === st.base ? ' class="on"' : '') + '>' + esc(D.BASES[b].nombre) + '</button>').join('');
      $$('#cz-bases [data-b]').forEach(b => b.onclick = () => { st.base = b.dataset.b; calcular(); });
      r.modelo = D.normalizar(Object.assign({}, md, { base: st.base }));
    } else $('#cz-bases').innerHTML = '';
    out.innerHTML = resumen() + plegables();
    $$('[data-modo]', out).forEach(b => b.onclick = () => { st.con10 = b.dataset.modo === '10'; calcular(); });
    $$('[data-ir]', out).forEach(b => b.onclick = () => { st.w = m2(+b.dataset.w); st.h = m2(+b.dataset.h); $('#cz-w').value = st.w; $('#cz-h').value = st.h; calcular(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $$('[data-frase]', out).forEach(b => b.onclick = () => copiar(b.dataset.frase));
    $('#cz-env').hidden = false; envio();
    const pr = st.con10 ? r.d10 : r.precio;
    $('#cz-bar').hidden = false; $('#cz-bar-t').textContent = (r.cant > 1 ? r.cant + ' × ' : '') + med(r.m) + (st.con10 ? ' · con 10%' : '');
    $('#cz-bar-p').textContent = $m(pr + (r.m.chico ? 0 : r.entrega)) + (r.m.chico ? '' : ' con entrega');
  }

  // ---------- precio ----------
  function resumen() {
    const m = r.m, c = r.cant, sem = P.semaforo(r.pct10), costoT = m.costo * c, gana = (st.con10 ? r.d10 : r.precio) - costoT;
    const pr = st.con10 ? r.d10 : r.precio;
    return '<section class="cz-c cz-precio"><div class="cz-que">' + (c > 1 ? c + ' × ' : '') + esc(nombreUso(m)) + ' ' + med(m) + (m.pers ? ' · ' + m.pers + ' personas' : '') + ' · ' + esc(r.piedra.nombre) + '</div>'
      + '<div class="cz-modo"><button data-modo="n"' + (st.con10 ? '' : ' class="on"') + '>Precio normal</button><button data-modo="10" class="' + (st.con10 ? 'on ' : '') + sem + '">Con 10%</button></div>'
      + '<div class="cz-big">' + $m(pr) + (st.con10 ? ' <s>' + $m(r.precio) + '</s>' : '') + '</div>' + (c > 1 ? '<div class="cz-sub">' + $m(pr / c) + ' cada una</div>' : '')
      + '<div class="cz-3">'
      + '<div><span>Entrega</span><b>' + (m.chico ? 'Aparte' : $m(m.entrega)) + '</b><small>' + (m.chico ? 'minivan ~' + $m(P.C.minivanChica) + ' por viaje' : m.minivan ? 'en minivan' : 'flete, no cabe en minivan') + '</small></div>'
      + '<div class="cz-tt"><span>Total</span><b>' + $m(pr + (m.chico ? 0 : m.entrega)) + '</b><small>anticipo 50%: ' + $m(Math.ceil((pr + (m.chico ? 0 : m.entrega)) / 2)) + '</small></div>'
      + '<div class="' + (st.con10 ? sem : '') + '"><span>Ganas</span><b>' + $m(gana) + '</b><small>' + Math.round(gana / costoT * 100) + '% sobre el costo</small></div></div>'
      + (st.con10 ? '<p class="cz-aviso ' + sem + '">' + (sem === 'ok' ? 'Con 10% sí te conviene: sigues ganando ' : 'Ojo: con 10% ganas solo ') + Math.round(r.pct10 * 100) + '%.</p>' : '<p class="cz-aviso">Con 10% quedaría en ' + $m(r.d10) + ' y ganarías ' + Math.round(r.pct10 * 100) + '% (' + (sem === 'ok' ? 'sí conviene' : 'no conviene') + ').</p>')
      + '</section>';
  }

  // ---------- detalles plegados con su resumen en una línea ----------
  function plegables() {
    const m = r.m, q = r.paquete, g = P.agrupar(r.extras), out = [];
    const cuenta = {}; r.extras.forEach(e => { const k = e.nom === 'Otra igual' ? 'iguales' : e.nom.toLowerCase(); cuenta[k] = (cuenta[k] || 0) + 1; });
    const sobraTxt = r.extras.length ? 'sobra para ' + Object.entries(cuenta).map(([k, n]) => n + ' ' + (n > 1 ? k.replace('mesa de centro', 'mesas de centro').replace(/^consola$/, 'consolas').replace(/^lateral$/, 'laterales') : k.replace('iguales', 'igual'))).join(', ') : 'casi no sobra';
    out.push(plegable('placa', 'Placa y sobrante', 'Salen ' + m.ac.n + ' por placa · ' + sobraTxt + (q && q.reco ? ' · paquete ' + $m(q.reco.p) : ''),
      svg() + '<p class="cz-p">De una placa de 3.20 × 1.60 salen <b>' + m.ac.n + (m.ac.n === 1 ? ' mesa' : ' iguales') + '</b>.' + (r.cant > 1 ? ' Para ' + r.cant + ' ocupas <b>' + r.placas + ' placa' + (r.placas > 1 ? 's' : '') + '</b>.' : '') + (g.length ? ' Con el sobrante (en dorado) usas el <b>' + r.usado + '%</b>.' : '') + '</p>'
      + (q ? '<div class="cz-lista">' + g.map(([e, n]) => '<div><span>' + (n > 1 ? n + ' × ' : '') + esc(e.nom) + ' ' + med(e) + '</span><b>' + $m(e.precio * n) + '</b></div>').join('')
        + '<div class="cz-tot"><span>Todo junto, suelto</span><b>' + $m(q.lista) + '</b></div>'
        + q.desc.map(x => '<div class="cz-ds ' + P.semaforo(x.pct) + (x === q.reco ? ' reco' : '') + '"><span>Paquete con ' + Math.round(x.d * 100) + '%' + (x === q.reco ? ' · recomendado' : '') + '</span><b>' + $m(x.p) + ' <small>ganas ' + Math.round(x.pct * 100) + '%</small></b></div>').join('') + '</div>'
        + (q.reco ? '<p class="cz-frase">"' + esc(frasePaquete()) + '"</p><button class="btn" data-frase="' + esc(frasePaquete()) + '">Copiar frase</button>' : '') : '')));
    if (r.parecidas.length) out.push(plegable('par', 'Medidas más baratas', r.parecidas.map(x => med(x) + ' ' + $m(precioPar(x))).join(' · '),
      '<p class="cz-p">Aprovechan mejor la placa. Ofrécelas si al cliente le da igual unos centímetros.</p><div class="cz-lista">' + r.parecidas.map(x => '<div><span>' + med(x) + ' <small>' + x.ac.n + ' por placa</small></span><b>' + $m(x.precio) + ' <button class="lnk" data-ir data-w="' + x.w + '" data-h="' + x.h + '">usar</button></b></div>').join('') + '</div>'));
    const fil = [['Piedra', m.piedra, m.credito ? 'placa ÷ ' + m.ac.n + ' − mesitas del sobrante' : 'placa ' + $m(P.C.placa.precio) + ' ÷ ' + m.ac.n], ['Cargo por pieza', P.C.extra, ''], ['Corte y canto', m.corte, m.forma === 'rect' ? 'recto' : 'curvo'],
      ['MDF 12 mm', m.mdf, m2(m.mdfMed[0]) + ' × ' + m2(m.mdfMed[1])], ['Base', m.base, 'alto ' + m2(m.alto)], ['Pegamento y tornillería', m.pegamento, ''], ['Empaque', m.empaque, '']];
    out.push(plegable('costo', 'Lo que te cuesta', $m(m.costo) + (r.cant > 1 ? ' cada una' : '') + ' · precio = costo × ' + P.C.margen,
      '<div class="cz-lista">' + fil.map(([t, v, n]) => '<div><span>' + t + (n ? ' <small>' + esc(n) + '</small>' : '') + '</span><b>' + $m(v) + '</b></div>').join('') + '<div class="cz-tot"><span>Costo</span><b>' + $m(m.costo) + '</b></div></div><p class="cz-chico">Corte, bases intermedias, pegamento y empaque son estimados; lo demás son tus números.</p>'));
    const ps = P.calcPaquetes();
    out.push(plegable('paqs', 'Paquetes de placa completa', ps.length + ' combinaciones, de ' + $m(Math.min(...ps.map(q => q.reco.p))) + ' a ' + $m(Math.max(...ps.map(q => q.reco.p))),
      '<div class="cz-lista">' + ps.map(q => '<div class="cz-pq"><span><b>' + esc(q.nombre) + '</b><small>' + P.agrupar(q.ps).map(([x, n]) => (n > 1 ? n + ' × ' : '') + x.nom.replace('Periq.', 'Periquera').replace('Lat.', 'Lateral') + (/\d/.test(x.nom) ? '' : ' ' + med(x))).join(' · ') + '</small></span><b><s>' + $m(q.lista) + '</s>' + $m(q.reco.p) + '<small>−' + Math.round(q.reco.d * 100) + '% + entrega ' + $m(q.entrega) + '</small></b></div>').join('') + '</div>'));
    return out.join('');
  }
  const abiertos = {};
  function plegable(k, t, sub, body) {
    setTimeout(() => { const d = $('#cz-d-' + k); if (d) d.ontoggle = () => { abiertos[k] = d.open; }; });
    return '<details class="cz-c cz-pl" id="cz-d-' + k + '"' + (abiertos[k] ? ' open' : '') + '><summary><b>' + t + '</b><small>' + esc(sub) + '</small></summary><div class="cz-in">' + body + '</div></details>';
  }

  // ---------- mandar ----------
  function envio() {
    if (!r) return;
    const tipos = TIPOS.filter(([k]) => k !== 'paq' || (r.paquete && r.paquete.reco)).filter(([k]) => k !== 'barata' || r.parecidas.length);
    if (!tipos.some(([k]) => k === st.tipo)) st.tipo = 'coti';
    $('#cz-tipos').innerHTML = tipos.map(([k, t]) => '<button data-t="' + k + '"' + (k === st.tipo ? ' class="on"' : '') + '>' + t + '</button>').join('');
    $$('#cz-tipos [data-t]').forEach(b => b.onclick = () => { st.tipo = b.dataset.t; if (st.tipo === 'paq') st.adj.paq = true; editado = false; envio(); });
    const adj = ADJ.filter(([k]) => (k !== 'f3d' || (r.modelo && window.DKAS3D)) && (k !== 'paq' || r.extras.length));
    $('#cz-adj').innerHTML = adj.map(([k, t]) => '<label><input type="checkbox" data-a="' + k + '"' + (st.adj[k] ? ' checked' : '') + '><span>' + t + '</span></label>').join('');
    $$('#cz-adj [data-a]').forEach(i => i.onchange = () => { st.adj[i.dataset.a] = i.checked; guarda(); });
    if (!editado) $('#cz-msg').value = mensaje();
    guarda();
  }

  const NOM = { comedor: 'mesa de comedor', centro: 'mesa de centro', lateral: 'mesa lateral', periquera: 'periquera', consola: 'consola', escritorio: 'escritorio' };
  const PLU = { comedor: 'mesas de comedor', centro: 'mesas de centro', lateral: 'mesas laterales', periquera: 'periqueras', consola: 'consolas', escritorio: 'escritorios' };
  const formaTxt = m => m.forma === 'red' ? ' redonda' : m.forma === 'oval' ? ' ovalada' : m.forma === 'org' ? ' orgánica' : m.w === m.h ? ' cuadrada' : '';
  const nombreUso = m => { const n = NOM[m.uso]; return n.charAt(0).toUpperCase() + n.slice(1) + formaTxt(m); };
  const nombrePlural = (e, n) => { const b = e.nom.toLowerCase(); return n > 1 ? b.replace('mesa de centro', 'mesas de centro').replace(/^consola$/, 'consolas').replace(/^lateral$/, 'laterales').replace('otra igual', 'iguales') : b.replace('otra igual', 'igual'); };
  const precioPar = x => st.con10 ? P.r100(x.precio * 0.9) : x.precio;
  function frasePaquete() {
    const q = r.paquete, g = P.agrupar(r.extras);
    return 'De tu misma placa salen también ' + g.map(([e, n]) => (n > 1 ? n + ' ' : 'una ') + nombrePlural(e, n).replace(/^igual(es)?$/, n > 1 ? 'mesas iguales' : 'mesa igual') + ' de ' + med(e)).join(', ') + '. Si te las llevas juntas, son solo ' + $m(q.reco.p - (st.con10 ? r.d10 : r.precio)) + ' más.';
  }
  function mensaje() {
    const m = r.m, c = r.cant, pr = st.con10 ? r.d10 : r.precio, tot = pr + (m.chico ? 0 : m.entrega), nom = (st.nombre || '').split(' ')[0];
    const que = (c > 1 ? c + ' ' + PLU[m.uso] + formaTxt(m).replace('redonda', 'redondas').replace('ovalada', 'ovaladas').replace('orgánica', 'orgánicas').replace('cuadrada', 'cuadradas') : 'tu ' + NOM[m.uso] + formaTxt(m))
      + ' de ' + med(m) + ' m en piedra sinterizada ' + r.piedra.nombre + (m.pers ? ' (para ' + m.pers + ' personas)' : '');
    const precioTxt = $m(pr) + (st.con10 ? ', ya con 10% de descuento' : '');
    const ent = m.chico ? ' La entrega la coordinamos aparte.' : ' La entrega es de ' + $m(m.entrega) + ', en total ' + $m(tot) + '.';
    const hola = 'Hola' + (nom ? ' ' + nom : '') + ', ¿cómo estás? Soy Zury de DKAS.';
    const base = hola + ' Te paso la cotización de ' + que + ': ' + precioTxt + '.' + ent + ' Te mando la hoja con las fotos y el plano con medidas. Se aparta con el 50% de anticipo.';
    if (st.tipo === 'corta') return 'Hola' + (nom ? ' ' + nom : '') + ', te paso tu cotización: ' + (c > 1 ? c + ' × ' : '') + NOM[m.uso] + formaTxt(m) + ' ' + med(m) + ' en ' + r.piedra.nombre + ', ' + precioTxt + (m.chico ? '' : ' + entrega ' + $m(m.entrega)) + '. ¿Cómo la ves?';
    if (st.tipo === 'formal') return 'Hola' + (nom ? ' ' + nom : '') + ', buen día. Le comparto la cotización de ' + que.replace(/^tu /, 'su ') + '.\n\nPrecio: ' + precioTxt + (m.chico ? '' : '\nEntrega: ' + $m(m.entrega) + '\nTotal: ' + $m(tot)) + '\nAnticipo para iniciar la fabricación: 50% (' + $m(Math.ceil(tot / 2)) + ')\n\nAdjunto la hoja de cotización y el plano con medidas. Quedo a sus órdenes.\nZury · DKAS';
    if (st.tipo === 'paq' && r.paquete && r.paquete.reco) return base + ' ' + frasePaquete() + ' Todo junto queda en ' + $m(r.paquete.reco.p) + '. ¿Cómo la ves?';
    if (st.tipo === 'barata' && r.parecidas.length) { const x = r.parecidas[0]; return base + ' Si te funciona una de ' + med(x) + ' m, te queda en ' + $m(precioPar(x)) + ', porque aprovecha mejor la placa. ¿Cómo la ves?'; }
    return base + ' ¿Cómo la ves?';
  }

  async function mandar() {
    if (!r) return;
    const b = $('#cz-wa'); b.disabled = true; const t0 = b.textContent; b.textContent = 'Preparando imágenes…';
    try {
      const fs = await archivos(), tel = st.tel ? (X.A && X.A.waNum ? X.A.waNum(st.tel) : st.tel.replace(/\D/g, '')) : '';
      if (X.compartir) await X.compartir(fs, $('#cz-msg').value, tel);
      else { fs.forEach(f => bajar(f)); window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent($('#cz-msg').value), '_blank'); }
    } catch (e) { X.alerta(e.message || 'No se pudo preparar'); }
    b.disabled = false; b.textContent = t0;
  }
  async function archivos() {
    const out = [], nom = 'dkas-' + med(r.m).replace(/[^\d.]+/g, 'x');
    const foto = st.adj.f3d || st.adj.hoja ? await foto3d() : null;
    if (st.adj.hoja) out.push(new File([await hojaCoti(foto)], nom + '-cotizacion.jpg', { type: 'image/jpeg' }));
    if (st.adj.f3d && foto) out.push(new File([foto], nom + '-3d.jpg', { type: 'image/jpeg' }));
    if (st.adj.plano) out.push(new File([await plano()], nom + '-plano.jpg', { type: 'image/jpeg' }));
    if (st.adj.piedra) out.push(new File([await muestra()], 'piedra-' + r.piedra.id + '.jpg', { type: 'image/jpeg' }));
    if (st.adj.paq && r.extras.length) out.push(new File([await hojaPaquete()], nom + '-paquete.jpg', { type: 'image/jpeg' }));
    return out;
  }

  // ---------- imágenes ----------
  const cargar = src => (X && X.cargarImg) ? X.cargarImg(src) : new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const blobDe = cv => new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.9));
  const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); return [c, g]; };
  const txt = (g, t, x, y, font, color, al) => { g.font = font; g.fillStyle = color; g.textAlign = al || 'left'; g.fillText(t, x, y); g.textAlign = 'left'; };
  const fecha = () => new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const pie = (g, W, y) => txt(g, 'WhatsApp ' + (window.DKAS_WA || []).map(w => w.label).join(' · ') + '  ·  dkas.mx', W / 2, y, '400 22px Inter,Arial', '#6e6962', 'center');
  async function foto3d() {
    if (!r.modelo || !X.foto3d) return null;
    try { const u = await X.foto3d(r.modelo); if (!u) return null; return await (await fetch(u)).blob(); } catch (e) { return null; }
  }
  // contorno de la pieza (vista desde arriba) en un rectángulo
  function contorno(g, forma, x, y, w, h) {
    g.beginPath();
    if (forma === 'rect') g.rect(x, y, w, h);
    else if (forma === 'org') { const cx = x + w / 2, cy = y + h / 2, n = 60; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, k = 1 + 0.06 * Math.sin(3 * a + 0.6) + 0.04 * Math.sin(5 * a + 1.7), px = cx + Math.cos(a) * w / 2 * k / 1.1, py = cy + Math.sin(a) * h / 2 * k / 1.1; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); }
    else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  }
  async function piezaConPiedra(g, forma, x, y, w, h) {
    const tex = await cargar('tex/piedras/1k/' + r.piedra.id + '.jpg');
    g.save(); contorno(g, forma, x, y, w, h); g.clip();
    if (tex) { const s = Math.max(w / tex.width, h / tex.height); g.drawImage(tex, x + (w - tex.width * s) / 2, y + (h - tex.height * s) / 2, tex.width * s, tex.height * s); } else { g.fillStyle = '#d9d4ca'; g.fillRect(x, y, w, h); }
    g.restore(); g.lineWidth = 3; g.strokeStyle = '#1a1917'; contorno(g, forma, x, y, w, h); g.stroke();
  }
  function cota(g, x1, y1, x2, y2, t, lado) {
    g.strokeStyle = '#8a8378'; g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const flecha = (x, y, a) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 14 * Math.cos(a - .4), y - 14 * Math.sin(a - .4)); g.moveTo(x, y); g.lineTo(x - 14 * Math.cos(a + .4), y - 14 * Math.sin(a + .4)); g.stroke(); };
    const a = Math.atan2(y2 - y1, x2 - x1); flecha(x2, y2, a); flecha(x1, y1, a + Math.PI);
    g.save(); g.translate((x1 + x2) / 2, (y1 + y2) / 2); if (lado) g.rotate(-Math.PI / 2); txt(g, t, 0, -12, '600 30px Inter,Arial', '#1a1917', 'center'); g.restore();
  }
  async function vistaPlanta(W, H, conCotas) {
    const [c, g] = lienzo(W, H), m = r.m, pad = conCotas ? 110 : 40, k = Math.min((W - pad * 2) / m.w, (H - pad * 2) / m.h), w = m.w * k, h = m.h * k, x = (W - w) / 2, y = (H - h) / 2;
    g.fillStyle = '#f3f1ed'; g.fillRect(0, 0, W, H);
    await piezaConPiedra(g, m.forma, x, y, w, h);
    if (conCotas) { cota(g, x, y + h + 50, x + w, y + h + 50, m.forma === 'red' ? 'Ø ' + m2(m.w) + ' m' : m2(m.w) + ' m'); if (m.forma !== 'red') cota(g, x + w + 50, y + h, x + w + 50, y, m2(m.h) + ' m', true); }
    return c;
  }
  async function plano() {
    if (r.modelo && window.DKAS_CQ) { try { return await window.DKAS_CQ.png(r.modelo, { plano: true, cliente: st.nombre || undefined, titulo: nombreUso(r.m) + ' ' + med(r.m) }); } catch (e) {} }
    const W = 1600, H = 1130, [c, g] = lienzo(W, H), logo = await cargar('img/dkas-oscuro.png');
    if (logo) g.drawImage(logo, 70, 50, logo.width * 56 / logo.height, 56);
    txt(g, 'PLANO CON MEDIDAS', W - 70, 90, '600 26px Inter,Arial', '#6e6962', 'right');
    txt(g, nombreUso(r.m) + ' · ' + med(r.m) + ' m', 70, 170, '500 46px "Cormorant Garamond",Georgia,serif', '#1a1917');
    const vp = await vistaPlanta(1100, 760, true); g.drawImage(vp, 70, 220);
    const filas = [['Vista', 'desde arriba'], ['Medidas', med(r.m) + ' m'], ['Alto', m2(r.m.alto) + ' m'], ['Piedra', r.piedra.nombre], ['Grosor', '12 mm sinterizado'], ['Cantidad', String(r.cant)]];
    filas.forEach(([k, v], i) => { txt(g, k, 1210, 270 + i * 70, '400 24px Inter,Arial', '#8a8378'); txt(g, v, 1210, 302 + i * 70, '600 28px Inter,Arial', '#1a1917'); });
    pie(g, W, H - 40); return blobDe(c);
  }
  async function hojaCoti(foto) {
    const W = 1080, H = 1350, [c, g] = lienzo(W, H), m = r.m, pr = st.con10 ? r.d10 : r.precio, tot = pr + (m.chico ? 0 : m.entrega);
    const logo = await cargar('img/dkas-oscuro.png'); if (logo) g.drawImage(logo, 70, 60, logo.width * 66 / logo.height, 66);
    txt(g, 'COTIZACIÓN', W - 70, 92, '600 26px Inter,Arial', '#6e6962', 'right'); txt(g, fecha(), W - 70, 124, '400 22px Inter,Arial', '#8a8378', 'right');
    const fi = foto ? await cargar(URL.createObjectURL(foto)) : await vistaPlanta(940, 560, false);
    g.save(); g.beginPath(); g.roundRect ? g.roundRect(70, 170, 940, 560, 24) : g.rect(70, 170, 940, 560); g.clip();
    if (fi) { const s = Math.max(940 / fi.width, 560 / fi.height); g.drawImage(fi, 70 + (940 - fi.width * s) / 2, 170 + (560 - fi.height * s) / 2, fi.width * s, fi.height * s); }
    g.restore();
    txt(g, (st.nombre ? 'Para ' + st.nombre : nombreUso(m)), 70, 800, '500 46px "Cormorant Garamond",Georgia,serif', '#1a1917');
    const filas = [['Mesa', nombreUso(m)], ['Medidas', med(m) + ' m'], ['Piedra', r.piedra.nombre], ['Alto', m2(m.alto) + ' m']].concat(m.pers ? [['Personas', String(m.pers)]] : [])
      .concat(r.modelo && D.BASES[r.modelo.base] ? [['Base', D.BASES[r.modelo.base].nombre]] : []).concat(r.cant > 1 ? [['Cantidad', String(r.cant)]] : []);
    filas.forEach(([k, v], i) => { const y = 860 + Math.floor(i / 2) * 44, x = i % 2 ? 560 : 70; txt(g, k, x, y, '400 25px Inter,Arial', '#6e6962'); txt(g, v, x + 130, y, '500 25px Inter,Arial', '#1a1917'); });
    g.fillStyle = '#f6f4f0'; g.fillRect(70, 1040, 940, 230);
    const col = (t, v, x, sub) => { txt(g, t, x, 1090, '600 22px Inter,Arial', '#6e6962'); txt(g, v, x, 1150, '700 46px Inter,Arial', '#1a1917'); if (sub) txt(g, sub, x, 1190, '400 22px Inter,Arial', '#8a8378'); };
    col(st.con10 ? 'PRECIO (−10%)' : 'PRECIO', $m(pr), 105, st.con10 ? 'antes ' + $m(r.precio) : r.cant > 1 ? $m(pr / r.cant) + ' c/u' : '');
    col('ENTREGA', m.chico ? 'Aparte' : $m(m.entrega), 420, m.chico ? '' : m.minivan ? 'en minivan' : 'flete');
    col('TOTAL', $m(tot), 700, 'anticipo 50%: ' + $m(Math.ceil(tot / 2)));
    txt(g, 'Piedra sinterizada 12 mm · fabricada en nuestro taller · precio vigente 15 días', 105, 1245, '400 20px Inter,Arial', '#8a8378');
    pie(g, W, H - 32); return blobDe(c);
  }
  async function muestra() {
    const W = 1080, H = 1080, [c, g] = lienzo(W, H), tex = await cargar('tex/piedras/1k/' + r.piedra.id + '.jpg');
    g.fillStyle = '#f3f1ed'; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.roundRect ? g.roundRect(70, 70, 940, 720, 20) : g.rect(70, 70, 940, 720); g.clip();
    if (tex) { const s = Math.max(940 / tex.width, 720 / tex.height); g.drawImage(tex, 70 + (940 - tex.width * s) / 2, 70, tex.width * s, tex.height * s); }
    g.restore();
    txt(g, r.piedra.nombre, 70, 880, '500 64px "Cormorant Garamond",Georgia,serif', '#1a1917');
    txt(g, [r.piedra.desc, r.piedra.acabado].filter(Boolean).join(' · '), 70, 930, '400 28px Inter,Arial', '#6e6962');
    txt(g, 'Piedra sinterizada 12 mm · placa de 3.20 × 1.60 m', 70, 975, '400 26px Inter,Arial', '#8a8378');
    const logo = await cargar('img/dkas-oscuro.png'); if (logo) g.drawImage(logo, W - 70 - logo.width * 44 / logo.height, 1000, logo.width * 44 / logo.height, 44);
    return blobDe(c);
  }
  async function hojaPaquete() {
    const W = 1080, H = 1350, [c, g] = lienzo(W, H), q = r.paquete, k = 940 / 320, x0 = 70, y0 = 200;
    const logo = await cargar('img/dkas-oscuro.png'); if (logo) g.drawImage(logo, 70, 60, logo.width * 66 / logo.height, 66);
    txt(g, 'TODO DE LA MISMA PLACA', W - 70, 102, '600 24px Inter,Arial', '#6e6962', 'right');
    g.fillStyle = '#ece8e0'; g.fillRect(x0, y0, 320 * k, 160 * k);
    for (const p of r.puestas) { const ex = p.k === 'm' ? null : r.extras[p.k], f = ex ? ex.forma : r.m.forma; await piezaConPiedra(g, f, x0 + p.x * k + 3, y0 + p.y * k + 3, p.w * k - 6, p.h * k - 6);
      const t = ex ? ex.nom : nombreUso(r.m); g.font = '600 22px Inter,Arial'; const tw = g.measureText(t).width + 20; if (p.w * k > tw && p.h * k > 50) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x0 + p.x * k + p.w * k / 2 - tw / 2, y0 + p.y * k + p.h * k / 2 - 20, tw, 36); txt(g, t, x0 + p.x * k + p.w * k / 2, y0 + p.y * k + p.h * k / 2 + 6, '600 22px Inter,Arial', '#1a1917', 'center'); } }
    let y = y0 + 160 * k + 70;
    const fila = (t, v, b) => { txt(g, t, 70, y, (b ? '700 ' : '400 ') + '28px Inter,Arial', b ? '#1a1917' : '#3a3833'); txt(g, v, W - 70, y, (b ? '700 ' : '500 ') + '28px Inter,Arial', '#1a1917', 'right'); y += 48; };
    fila((r.cant > 1 ? r.cant + ' × ' : '') + nombreUso(r.m) + ' ' + med(r.m), $m(r.precio));
    P.agrupar(r.extras).forEach(([e, n]) => fila((n > 1 ? n + ' × ' : '') + (e.nom === 'Otra igual' ? nombreUso(r.m) : e.nom) + ' ' + med(e), $m(e.precio * n)));
    g.strokeStyle = '#d9d3c8'; g.beginPath(); g.moveTo(70, y - 26); g.lineTo(W - 70, y - 26); g.stroke(); y += 10;
    fila('Si las compras sueltas', $m(q.lista));
    if (q.reco) { g.fillStyle = '#f6f4f0'; g.fillRect(70, y - 10, 940, 110); txt(g, 'TODO JUNTO', 105, y + 32, '600 24px Inter,Arial', '#6e6962'); txt(g, $m(q.reco.p), 105, y + 84, '700 50px Inter,Arial', '#1a1917'); txt(g, 'ahorras ' + $m(q.lista - q.reco.p) + ' + entrega ' + $m(q.entrega), W - 105, y + 70, '500 26px Inter,Arial', '#2f6b3a', 'right'); }
    pie(g, W, H - 32); return blobDe(c);
  }

  // ---------- dibujo en pantalla ----------
  function svg() {
    const m = r.m;
    return '<svg class="cz-svg" viewBox="-2 -2 324 164"><rect x="0" y="0" width="320" height="160" class="cz-pl0"/>' + r.puestas.map(p => {
      const ex = p.k === 'm' ? null : r.extras[p.k], f = ex ? ex.forma : m.forma, cls = ex ? 'cz-x' : 'cz-m';
      const forma = f === 'rect' ? '<rect x="' + (p.x + 1) + '" y="' + (p.y + 1) + '" width="' + (p.w - 2) + '" height="' + (p.h - 2) + '" rx="2" class="' + cls + '"/>' : '<ellipse cx="' + (p.x + p.w / 2) + '" cy="' + (p.y + p.h / 2) + '" rx="' + (p.w / 2 - 1) + '" ry="' + (p.h / 2 - 1) + '" class="' + cls + '"/>';
      const fs = Math.max(7, Math.min(14, Math.min(p.w, p.h) / 4));
      return forma + (p.w >= 35 && p.h >= 25 ? '<text x="' + (p.x + p.w / 2) + '" y="' + (p.y + p.h / 2 + fs / 3) + '" font-size="' + fs + '">' + (f === 'red' ? 'Ø' + m2(p.w) : m2(p.w) + '×' + m2(p.h)) + '</text>' : '');
    }).join('') + '</svg>';
  }

  function copiar(t) {
    const ok = () => X.toast('Copiado. Pégalo en WhatsApp.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => viejo(t, ok)); else viejo(t, ok);
  }
  function viejo(t, ok) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); ok(); } catch (e) { X.alerta('No se pudo copiar'); } a.remove(); }
  function bajar(f) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

  window.DKAS_COTIZAR = { pantalla, _r: () => r, _archivos: () => archivos(), _mensaje: () => mensaje() };
})();

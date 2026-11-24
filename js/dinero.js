/* DKAS · Cuentas (dentro de Dinero): clientes con su pedido y seguimiento, deudas, avisos, proyección de caja,
   exportar a Excel y PDF, y la clave para confirmar lo importante.
   Datos (Firebase, mismos permisos que dinero/):
     dinero/clientes/<id> = { nombre, telefono, zona, fecha, tipo, forma, largo, ancho, cantidad, piedra, base, detalles,
                              precio, anticipo, entrega, notas, costos:{placa,base,mdf,flete,entrega,material,otros},
                              pend:{campo:true}, pasos:{placa,base,armado,entregado:'AAAA-MM-DD'}, cerrado, por, creado, editado }
     dinero/deudas/<id>   = { nombre, monto, vence, aprox, notas, por, creado }
     dinero/movs/<id>     + { cliente, deuda, metodo, revisar }
   Rutas: #dinero/clientes · #dinero/c=<id> · #dinero/deudas · #dinero/exportar */
(function () {
  // ---------- cálculo (sin pantalla; también lo usan las pruebas en Node) ----------
  const p2 = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const dte = s => new Date(s + 'T12:00:00');
  const mas = (s, n) => { const d = dte(s); d.setDate(d.getDate() + n); return ymd(d); };
  const entre = (a, b) => Math.round((dte(b) - dte(a)) / 864e5);
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  const vacio = v => v === undefined || v === null || v === '';
  const COST = [['placa', 'Placa / piedra'], ['base', 'Base (herrería)'], ['mdf', 'MDF'], ['flete', 'Fletes'], ['entrega', 'Entrega / gasolina'], ['material', 'Tornillos, pegamento, discos'], ['otros', 'Otros']];
  // las mismas opciones que la hoja de papel "Formato de pedido · Mesa personalizada"
  const FORMAS = ['Rectangular', 'Cuadrada', 'Redonda', 'Ovalada', 'Irregular'];
  const TIPOS = ['Comedor', 'Exterior', 'Centro', 'Lateral', 'Escritorio', 'Periquera', 'Otra'];
  const MATERIALES = ['Piedra sinterizada', 'Mármol', 'Granito', 'Cuarzo', 'Otro'];
  const PIEDRAS = ['Taj Mahal', 'Mont Blanc', 'Statuario', 'Peacock', 'Cardenaskin', 'Classic Bulgar', 'Bulgaria Dark Grey', 'Saloran Grey', 'Travertine', 'Pure White', 'Limestone', 'Otra'];
  const ACABADOS = ['Mate', 'Brillante', 'Texturizado'];
  const CANTOS = ['Recto', 'Biselado', 'Otro'];
  const SINO = ['Sí', 'No'];
  const BASES = ['Patas rectas', 'En U', 'En X', 'Patas inclinadas', 'Pedestal central', 'Doble pedestal', 'Geométrica', 'Circular', 'Tipo araña', 'Otra'];
  const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta'];
  const PASOS_ALTA = ['Datos del cliente', 'Tipo, forma y medidas', 'Cubierta', 'Base de herrería', 'Precio y anticipo', 'Costos'];
  // lo que el sistema pide en el alta; si no se tiene, se marca "No lo tengo aún" y queda pendiente
  const CAMPOS = [
    [0, 'telefono', 'Teléfono'], [0, 'direccion', 'Dirección'], [0, 'vendedor', 'Vendedor'], [0, 'fecha', 'Fecha del pedido'], [0, 'entrega', 'Fecha de entrega'],
    [1, 'forma', 'Forma'], [1, 'tipo', 'Tipo de mesa'], [1, 'medidas', 'Largo y ancho'], [1, 'altura', 'Altura'],
    [2, 'material', 'Tipo de cubierta'], [2, 'marca', 'Marca / proveedor'], [2, 'color', 'Color de la piedra'], [2, 'acabado', 'Acabado de la cubierta'], [2, 'canto', 'Tipo de canto'], [2, 'espesor', 'Espesor'], [2, 'refuerzo', 'Refuerzo inferior'],
    [3, 'base', 'Diseño de la base'], [3, 'pintura', 'Color de pintura'], [3, 'pacabado', 'Acabado de pintura'], [3, 'ptipo', 'Tipo de pintura'], [3, 'niveladores', 'Niveladores'], [3, 'placasm', 'Placas de montaje'],
    [4, 'precio', 'Precio de venta'], [4, 'anticipo', 'Anticipo acordado'],
    [5, 'c.placa', 'Costo de la placa'], [5, 'c.base', 'Costo de la base'], [5, 'c.mdf', 'Costo del MDF'], [5, 'c.flete', 'Costo de fletes'], [5, 'c.entrega', 'Costo de entrega'], [5, 'c.material', 'Costo de material']];
  function lleno(c, k) {
    if (k === 'medidas') return num(c.largo) > 0 && (c.forma === 'Redonda' || num(c.ancho) > 0);
    if (k === 'precio') return num(c.precio) > 0;
    if (k === 'direccion') return !vacio(c.direccion) || !vacio(c.zona);
    if (k === 'color') return !vacio(c.color) || !vacio(c.piedra);
    if (k === 'altura') return num(c.altura) > 0;
    if (k.slice(0, 2) === 'c.') return !vacio((c.costos || {})[k.slice(2)]);
    return !vacio(c[k]);
  }
  const pendientes = c => CAMPOS.filter(([, k]) => !lleno(c, k)).map(([, , l]) => l);
  // placa 3.20×1.60 = $9,000 + $500 de corte por pieza; MDF $650; base de comedor $6,000–7,000; flete $2,000 si no cabe en la minivan; regla de precio ×1.6 (datos del dueño)
  const PLACA = 9000, CORTE = 500, REGLA = 1.6;
  function fraccionPlaca(L, W) {
    const a = Math.max(L, W), b = Math.min(L, W);
    if (!a || !b) return 0;
    if (a <= 0.8 && b <= 0.8) return 0.25;
    if ((a <= 1.6 && b <= 1.6) || (a <= 3.2 && b <= 0.8)) return 0.5;
    if (a <= 3.2 && b <= 1.6) return 1;
    return Math.ceil(a * b / 5.12 * 1.15);
  }
  function costosSugeridos(c) {
    const L = num(c.largo) / 100, W = (c.forma === 'Redonda' ? num(c.largo) : num(c.ancho)) / 100, q = Math.max(1, num(c.cantidad) || 1);
    const f = fraccionPlaca(L, W), grande = Math.max(L, W) >= 1.4 || c.tipo === 'Comedor';
    const base = c.tipo === 'Comedor' ? (Math.max(L, W) >= 2.4 ? 7000 : 6000) : c.tipo === 'Periquera' ? 3000 : c.tipo === 'Escritorio' ? 3500 : 1500;
    return { placa: Math.round(f * PLACA + CORTE) * q, base: base * q, mdf: (c.tipo === 'Comedor' ? 650 : 0) * q, flete: grande ? 2000 : 0, entrega: grande ? 0 : 300, material: 300 * q, otros: 0, fraccion: f };
  }
  // a qué costo va un gasto, por su categoría y si no, por su nota
  function catCosto(x) {
    const t = (x.cat || '') + ' | ' + (x.nota || ''), c = x.cat || '';
    const prueba = s => [[/placa|piedra|quarmol/i, 'placa'], [/base|herrer|acero|enrique|soldad/i, 'base'], [/mdf/i, 'mdf'], [/flete/i, 'flete'], [/entrega|gasolina/i, 'entrega'], [/tornill|pegamento|disco|pintura|material/i, 'material']].find(([r]) => r.test(s));
    const r = prueba(c) || prueba(t); return r ? r[1] : 'otros';
  }
  const esIn = x => x.tipo === 'in';
  function statsCli(c, movs, hoy) {
    const ms = movs.filter(m => m.cliente === c.id), ents = ms.filter(esIn), sals = ms.filter(m => !esIn(m));
    const ent = ents.reduce((a, m) => a + num(m.monto), 0), sal = sals.reduce((a, m) => a + num(m.monto), 0);
    const precio = num(c.precio), costo = COST.reduce((a, [k]) => a + num((c.costos || {})[k]), 0);
    const real = {}; COST.forEach(([k]) => { real[k] = 0; }); sals.forEach(m => { real[catCosto(m)] += num(m.monto); });
    const antAc = !vacio(c.anticipo) ? num(c.anticipo) : precio * 0.5;
    const costoFinal = Math.max(costo, sal), ganancia = precio && costo ? precio - costoFinal : null;
    const primera = l => l.map(m => m.fecha).filter(Boolean).sort()[0] || '';
    const de = k => sals.filter(m => catCosto(m) === k), P = c.pasos || {};
    const liq = precio > 0 && ent >= precio;
    const pasos = [
      { k: 'pedido', n: 'Pedido confirmado', done: true, fecha: c.fecha || '', auto: true },
      { k: 'anticipo', n: 'Anticipo recibido', done: ent > 0, fecha: primera(ents), auto: true },
      { k: 'placa', n: 'Placa comprada', done: !!P.placa || de('placa').length > 0, fecha: P.placa || primera(de('placa')) },
      { k: 'base', n: 'Base hecha', done: !!P.base || de('base').length > 0, fecha: P.base || primera(de('base')) },
      { k: 'armado', n: 'Armada y lista', done: !!P.armado, fecha: P.armado || '' },
      { k: 'entregado', n: 'Entregada', done: !!P.entregado, fecha: P.entregado || '' },
      { k: 'liquidado', n: 'Liquidada', done: liq, fecha: liq ? ents.map(m => m.fecha).sort().slice(-1)[0] : '', auto: true }];
    const hechos = pasos.filter(p => p.done).length;
    return { ms, ent, sal, precio, costo, real, antAc, ganancia, pasos, hechos, actual: pasos.find(p => !p.done),
      porCobrar: precio ? precio - ent : null, porGastar: costo ? Math.max(costo - sal, 0) : null, balance: ent - sal,
      margen: ganancia != null && precio ? ganancia / precio : null, veces: precio && costo ? precio / costoFinal : null,
      cobradoPct: precio ? ent / precio : null, gastadoPct: costo ? sal / costo : null,
      necesita: costo ? Math.max(Math.max(costo - sal, 0) - (ent - sal), 0) : null,
      diasEntrega: c.entrega ? entre(hoy, c.entrega) : null, precioSug: costo ? Math.ceil(costo * REGLA / 100) * 100 : null,
      aclarar: ms.filter(m => m.revisar).length, pend: pendientes(c) };
  }
  const pesosC = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-MX');
  const pctT = n => n == null || !isFinite(n) ? '—' : Math.round(n * 100) + '%';
  const enDias = n => n == null ? '' : n === 0 ? 'hoy' : n === 1 ? 'mañana' : n === -1 ? 'ayer' : n > 0 ? 'en ' + n + ' días' : 'hace ' + -n + ' días';
  // avisos de un cliente, del más urgente (1) al menos (5)
  function alertas(c, s) {
    const A = [], entregada = s.pasos[5].done;
    if (s.ganancia != null && s.ganancia < 0) A.push([1, 'Esta mesa deja pérdida', 'Cuesta ' + pesosC(Math.max(s.costo, s.sal)) + ' y se vende en ' + pesosC(s.precio) + ': se pierden ' + pesosC(-s.ganancia) + '.']);
    if (s.diasEntrega != null && s.diasEntrega < 0 && !entregada) A.push([1, 'Entrega atrasada ' + -s.diasEntrega + ' días', 'Se prometió para el ' + c.entrega + '.']);
    if (entregada && s.porCobrar > 0) A.push([1, 'Cobrar saldo de ' + pesosC(s.porCobrar), 'Ya se entregó y no ha liquidado.']);
    if (!s.precio) A.push([2, 'Falta el precio de venta', 'Sin precio no se sabe cuánto debe ni cuánto se gana.']);
    if (s.diasEntrega != null && s.diasEntrega >= 0 && s.diasEntrega <= 3 && !s.pasos[4].done) A.push([2, 'Se entrega ' + enDias(s.diasEntrega) + ' y no está lista', 'Falta: ' + s.pasos.slice(1, 5).filter(p => !p.done).map(p => p.n.toLowerCase()).join(', ') + '.']);
    if (s.precio && s.ent < s.antAc && !entregada) A.push([2, 'Falta anticipo: ' + pesosC(s.antAc - s.ent), 'Acordado ' + pesosC(s.antAc) + ', recibido ' + pesosC(s.ent) + '. Regla: 50% antes de fabricar.']);
    if (s.necesita > 0) A.push([3, 'Faltan ' + pesosC(s.necesita) + ' de otro lado para terminarla', 'Lo que ha pagado no alcanza para lo que falta gastar.']);
    else if (s.balance < 0) A.push([3, 'Se está financiando con ' + pesosC(-s.balance) + ' de otros', 'Se gastó más de lo que ha pagado.']);
    if (s.costo && s.sal > s.costo) A.push([3, 'Se pasó ' + pesosC(s.sal - s.costo) + ' del costo estimado', 'Revisa en la tabla de costos qué se fue arriba.']);
    if (s.margen != null && s.margen >= 0 && s.margen < 0.2) A.push([4, 'Ganancia baja: ' + pctT(s.margen), 'Con la regla ×1.6 el precio sería ' + pesosC(s.precioSug) + '.']);
    if (s.pend.length) A.push([4, s.pend.length + ' dato(s) pendiente(s)', s.pend.join(', ') + '.']);
    if (s.aclarar) A.push([4, s.aclarar + ' movimiento(s) por aclarar', 'Están marcados en amarillo.']);
    if (s.hechos === 7 && !c.cerrado) A.push([5, 'Lista para finalizar', 'Entregada y cobrada completa.']);
    return A.sort((a, b) => a[0] - b[0]);
  }
  function siguiente(c, s) {
    const p = s.actual; if (!p) return c.cerrado ? 'Pedido finalizado.' : 'Finalizar el pedido.';
    return { anticipo: 'Cobrar el anticipo' + (s.antAc ? ' de ' + pesosC(s.antAc) : '') + '.', placa: 'Comprar la placa.', base: 'Mandar hacer la base.', armado: 'Armar la mesa y dejarla lista.',
      entregado: 'Entregar' + (c.entrega ? ' (' + enDias(s.diasEntrega) + ')' : '') + '.', liquidado: 'Cobrar el saldo de ' + pesosC(Math.max(s.porCobrar || 0, 0)) + '.' }[p.k];
  }
  function statsDeu(d, movs) { const pag = movs.filter(m => m.deuda === d.id && !esIn(m)).reduce((a, m) => a + num(m.monto), 0); return { pag, falta: Math.max(num(d.monto) - pag, 0) }; }
  function totales(clientes, movs, deudas, hoy) {
    let ent = 0, sal = 0, teDeben = 0, porGastar = 0, gan = 0, venta = 0, conGan = 0;
    const porMetodo = { Efectivo: 0, Banco: 0, 'Sin decir': 0 };
    movs.forEach(m => { const v = num(m.monto), s = esIn(m) ? v : -v; esIn(m) ? ent += v : sal += v; porMetodo[m.metodo === 'Efectivo' ? 'Efectivo' : m.metodo ? 'Banco' : 'Sin decir'] += s; });
    const activos = clientes.filter(c => !c.cerrado).map(c => [c, statsCli(c, movs, hoy)]);
    activos.forEach(([, s]) => { if (s.porCobrar > 0) teDeben += s.porCobrar; if (s.porGastar) porGastar += s.porGastar; if (s.ganancia != null) { gan += s.ganancia; venta += s.precio; conGan++; } });
    const debes = deudas.reduce((a, d) => a + statsDeu(d, movs).falta, 0);
    const sinDueno = movs.filter(m => !esIn(m) && !m.cliente && !m.deuda).reduce((a, m) => a + num(m.monto), 0);
    return { ent, sal, caja: ent - sal, porMetodo, activos, teDeben, porGastar, debes, gan, venta, conGan, sinDueno,
      posicion: ent - sal + teDeben - porGastar - debes, porAclarar: movs.filter(m => m.revisar).length,
      pendCli: activos.filter(([, s]) => s.pend.length).length };
  }
  // los gastos que faltan se hacen ~10 días antes de entregar, el saldo se cobra al entregar y las deudas al vencer
  function proyeccion(t, deudas, movs, hoy) {
    const ev = [];
    t.activos.forEach(([c, s]) => {
      const fe = c.entrega || '';
      if (s.porGastar > 0) ev.push({ f: fe && mas(fe, -10) > hoy ? mas(fe, -10) : hoy, v: -s.porGastar, t: 'Gastos que faltan · ' + c.nombre });
      if (s.porCobrar > 0) ev.push({ f: s.pasos[5].done ? hoy : fe ? (fe > hoy ? fe : hoy) : '9999-12-31', v: s.porCobrar, t: 'Cobrar saldo · ' + c.nombre, sinFecha: !fe && !s.pasos[5].done });
    });
    deudas.forEach(d => { const x = statsDeu(d, movs).falta; if (x > 0 && d.vence) ev.push({ f: d.vence > hoy ? d.vence : hoy, v: -x, t: 'Pagar · ' + d.nombre }); });
    ev.sort((a, b) => a.f.localeCompare(b.f) || a.v - b.v);
    let run = t.caja, min = t.caja, minF = hoy; ev.forEach(e => { run += e.v; e.run = run; if (run < min) { min = run; minF = e.f; } });
    return { ev, min, minF };
  }
  const calc = { COST, CAMPOS, lleno, pendientes, fraccionPlaca, costosSugeridos, catCosto, statsCli, alertas, siguiente, statsDeu, totales, proyeccion, num };
  if (typeof module !== 'undefined' && module.exports) { module.exports = calc; return; }

  // ---------- pantalla ----------
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-MX');
  const hoy = () => ymd(new Date());
  const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fC = f => { if (!f || f > '9999') return ''; if (f.slice(0, 4) === '9999') return 'sin fecha'; const d = dte(f); return d.getDate() + ' ' + MES3[d.getMonth()] + (f.slice(0, 4) !== hoy().slice(0, 4) ? ' ' + f.slice(2, 4) : ''); };
  const cls = n => n > 0 ? 'v' : n < 0 ? 'r' : '';
  const limpio = o => JSON.parse(JSON.stringify(o || {}));
  const otra = (v, o) => (v === 'Otra' || v === 'Otro') && o ? o : v;
  const piezaTxt = c => {
    const med = c.forma === 'Redonda' ? (num(c.largo) ? 'Ø' + num(c.largo) : '') : (num(c.largo) ? num(c.largo) + '×' + num(c.ancho) : '');
    const t = [num(c.cantidad) > 1 ? num(c.cantidad) + '×' : '', otra(c.tipo, c.tipoOtra) || '', c.forma ? c.forma.toLowerCase() : '', med ? med + (num(c.altura) ? '×' + num(c.altura) : '') + ' cm' : '', c.color || c.piedra || '', c.base ? '· base ' + otra(c.base, c.baseOtra) : ''].filter(Boolean).join(' ');
    return t || 'Falta decir qué mesa es';
  };
  let S = null; // estado que pasa dinero.js: { main, X, A, movs, clientes, deudas, cargar, hoja }
  const st = c => statsCli(c, S.movs, hoy());
  const P_ = v => vacio(v) ? 'pendiente' : String(v);
  function specs(c) {
    const med = c.forma === 'Redonda' ? (num(c.largo) ? 'Ø ' + num(c.largo) + ' cm' : '') : (num(c.largo) ? num(c.largo) + ' × ' + num(c.ancho) + ' cm' : '');
    return [
      ['1 · Datos del cliente', [['Nº de pedido', c.folio ? String(c.folio) : '—'], ['Nombre', c.nombre], ['Teléfono', P_(c.telefono)], ['Email', c.email || '—'], ['Dirección', P_(c.direccion || c.zona)], ['Vendedor', P_(otra(c.vendedor, c.vendedorOtro))], ['Fecha del pedido', P_(c.fecha)], ['Fecha de entrega', P_(c.entrega)]]],
      ['2 · Tipo y forma', [['Forma', P_(c.forma)], ['Uso', P_(otra(c.tipo, c.tipoOtra))], ['Medidas', P_(med)], ['Altura', num(c.altura) ? num(c.altura) + ' cm' : 'pendiente'], ['Cuántas', String(num(c.cantidad) || 1)]]],
      ['3 · Cubierta', [['Tipo', P_(otra(c.material, c.materialOtro))], ['Marca / proveedor', P_(c.marca)], ['Color', P_(otra(c.color || c.piedra, c.colorOtra))], ['Acabado', P_(c.acabado)], ['Canto', P_(otra(c.canto, c.cantoOtro))], ['Espesor', num(c.espesor) ? num(c.espesor) + ' mm' : 'pendiente'], ['Refuerzo inferior', P_(c.refuerzo)], ['Observaciones', c.obsCubierta || '—']]],
      ['4 · Base de herrería', [['Diseño', P_(otra(c.base, c.baseOtra))], ['Color de pintura', P_(c.pintura)], ['Acabado', P_(c.pacabado)], ['Tipo de pintura', P_(c.ptipo)], ['Niveladores', P_(c.niveladores)], ['Placas de montaje', P_(c.placasm)], ['Observaciones', c.obsBase || '—']]]];
  }
  const cli = id => S.clientes.find(c => c.id === id);

  function nav() { return ''; } // el menú de arriba del panel ya tiene Resumen · Clientes · Movimientos · Deudas · Exportar
  function navViejo(act) {
    return '<nav class="cu-nav">' + [['', 'Resumen'], ['clientes', 'Clientes'], ['todos', 'Movimientos'], ['deudas', 'Deudas'], ['exportar', 'Exportar']]
      .map(([k, t]) => '<a href="#dinero' + (k ? '/' + k : '') + '"' + (act === k ? ' class="on"' : '') + '>' + t + '</a>').join('') + '</nav>';
  }

  // ---------- clave para confirmar (solo confirma que es a propósito; no es seguridad: está en el código de la página) ----------
  const CLAVE = '55';
  function pedirClave(titulo, lineas) {
    return new Promise(ok => {
      const cap = document.createElement('div'); cap.className = 'dn-capa arriba cu-clave'; document.body.appendChild(cap);
      cap.innerHTML = '<div class="dn-hoja" role="dialog" aria-label="Confirmar"><div class="dn-hoja-c"><h2>' + esc(titulo) + '</h2><button class="dn-x" aria-label="Cerrar">✕</button></div>'
        + (lineas && lineas.length ? '<dl class="cu-conf">' + lineas.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' : '')
        + '<p class="sub">Revisa que todo sea correcto y escribe tu clave para confirmar.</p>'
        + '<label class="dn-cant">Clave<span><input id="cu-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••"></span></label><p class="cu-err" id="cu-perr" hidden>Clave incorrecta. No se guardó nada.</p>'
        + '<button class="btn negro grande" id="cu-pok">Confirmar</button></div>';
      const fin = v => { cap.remove(); ok(v); };
      $('.dn-x', cap).onclick = () => fin(false); cap.onclick = e => { if (e.target === cap) fin(false); };
      const pin = $('#cu-pin', cap), probar = () => { if (pin.value.trim() === CLAVE) fin(true); else { $('#cu-perr', cap).hidden = false; pin.value = ''; pin.focus(); } };
      $('#cu-pok', cap).onclick = probar; pin.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); probar(); } };
      setTimeout(() => pin.focus(), 40);
    });
  }

  // ---------- resumen (va dentro del tablero de Dinero) ----------
  function resumen(s) {
    S = s; const H = hoy(), t = totales(S.clientes, S.movs, S.deudas, H), pr = proyeccion(t, S.deudas, S.movs, H);
    const al = []; t.activos.forEach(([c, x]) => alertas(c, x).forEach(a => { if (a[0] <= 3 || a[0] === 5) al.push(a.concat([c])); })); al.sort((a, b) => a[0] - b[0]);
    const lista = [
      [t.porAclarar === 0, 'Aclarar los movimientos marcados en amarillo' + (t.porAclarar ? ' (faltan ' + t.porAclarar + ')' : '')],
      [S.clientes.length > 0, 'Dar de alta a cada cliente con pedido'],
      [t.pendCli === 0, 'Completar los datos pendientes de los clientes' + (t.pendCli ? ' (' + t.pendCli + ' con datos pendientes)' : '')],
      [t.sinDueno === 0, 'Asignar cada gasto a su cliente' + (t.sinDueno ? ' (' + pesos(t.sinDueno) + ' sin cliente)' : '')],
      [t.porMetodo['Sin decir'] === 0, 'Decir de cada movimiento si fue efectivo o banco'],
      [S.deudas.length > 0, 'Anotar todas las deudas del negocio']];
    const hechos = lista.filter(x => x[0]).length, mp = t.venta ? t.gan / t.venta : null;
    return '<section class="dn-sec cu-res"><div class="dn-sec-c"><h3>Cuentas claras</h3><a class="lnk" href="#dinero/exportar">Exportar</a></div>'
      + '<div class="cu-4"><div><span>Te deben clientes</span><b class="v">' + pesos(t.teDeben) + '</b></div><div><span>Falta gastar en pedidos</span><b class="r">' + pesos(t.porGastar) + '</b></div>'
      + (S.deudas.length ? '<div><span>Debemos</span><b class="r">' + pesos(t.debes) + '</b></div>' : '<a class="cu-sinanotar" href="#dinero/deudas"><span>Debemos</span><b class="a">Sin anotar</b><small>Anótalas aquí →</small></a>') + '<div><span>Posición real' + (S.deudas.length ? '' : ' (sin deudas)') + '</span><b class="' + cls(t.posicion) + '">' + pesos(t.posicion) + '</b></div></div>'
      + (S.deudas.length ? '' : '<p class="cu-aviso" style="margin-top:12px">Todavía no hay ninguna deuda anotada. Mientras no se anoten, la posición real se ve mejor de lo que es.</p>')
      + '<p class="cu-leccion"><b>Posición real</b> = dinero con nosotros + lo que nos deben − lo que falta gastar − lo que debemos. Si es positiva, alcanza: falta efectivo hoy y se arregla cobrando y ordenando pagos. Si es negativa, aunque se cobre todo no alcanza.</p></section>'
      + '<section class="dn-sec"><div class="dn-sec-c"><h3>Hoy toca · ' + al.length + '</h3><a class="lnk" href="#dinero/clientes">Clientes</a></div>'
      + (al.length ? '<div class="cu-al">' + al.slice(0, 8).map(a => '<a class="p' + a[0] + '" href="#dinero/c=' + esc(a[3].id) + '"><i></i><span><b>' + esc(a[3].nombre) + ': ' + esc(a[1]) + '</b><small>' + esc(a[2]) + '</small></span></a>').join('') + '</div>' : '<p class="sub">Nada urgente.</p>') + '</section>'
      + '<section class="dn-sec"><h3>¿Nos alcanza? · lo que viene</h3>' + (pr.ev.length
        ? '<p class="sub">Si lo que falta de cada mesa se gasta 10 días antes de entregarla y el saldo se cobra al entregar:</p><div class="cu-tabla"><table><thead><tr><th>Fecha</th><th>Qué pasa</th><th>Monto</th><th>Queda</th></tr></thead><tbody>'
          + pr.ev.slice(0, 12).map(e => '<tr><td>' + fC(e.f) + '</td><td>' + esc(e.t) + '</td><td class="' + cls(e.v) + '">' + pesos(e.v) + '</td><td class="' + cls(e.run) + '">' + pesos(e.run) + '</td></tr>').join('') + '</tbody></table></div>'
          + '<p class="cu-leccion">' + (pr.min < 0 ? '<b>Ojo:</b> el ' + fC(pr.minF) + ' faltarían <b class="r">' + pesos(-pr.min) + '</b>. Para evitarlo: cobrar antes, pedir más anticipo o pedir plazo a un proveedor.' : 'El punto más bajo sería <b>' + pesos(pr.min) + '</b> el ' + fC(pr.minF) + '. Alcanza.') + '</p>'
        : '<p class="sub">Cuando los clientes tengan precio, costos y fecha de entrega, aquí se ve si alcanza el dinero fecha por fecha.</p>') + '</section>'
      + '<section class="dn-sec"><h3>Clientes activos · ' + t.activos.length + '</h3><div class="cu-3"><div><span>Venta total</span><b>' + pesos(t.activos.reduce((a, [, x]) => a + x.precio, 0)) + '</b></div><div><span>Ganancia esperada</span><b class="' + cls(t.gan) + '">' + (t.conGan ? pesos(t.gan) : '—') + '</b></div><div><span>Margen promedio</span><b>' + pctT(mp) + '</b></div></div>'
      + (t.conGan < t.activos.length ? '<p class="sub">Con ' + t.conGan + ' de ' + t.activos.length + ' clientes (los demás no tienen precio o costos).</p>' : '') + '</section>'
      + '<section class="dn-sec"><h3>Para que cuadre al 100% · ' + hechos + ' de ' + lista.length + '</h3><div class="cu-chk">' + lista.map(([ok, txt]) => '<p class="' + (ok ? 'si' : '') + '"><i>' + (ok ? '✓' : '!') + '</i>' + esc(txt) + '</p>').join('') + '</div></section>';
  }

  // ---------- rutas ----------
  function pantalla(sub, s) {
    S = s;
    if (sub === 'clientes') return clientes();
    if (/^c=/.test(sub)) { const c = cli(sub.slice(2)); return c ? cliente(c) : clientes(); }
    if (sub === 'deudas') return deudas();
    if (sub === 'exportar') return exportar();
    if (sub === 'nuevo') { clientes(); return alta(); }
    return clientes();
  }
  function tarjeta(c) {
    const s = st(c), urg = alertas(c, s).filter(a => a[0] <= 2).length;
    return '<a class="cu-cli" href="#dinero/c=' + esc(c.id) + '"><div class="cu-cli-t"><b>' + esc(c.nombre) + '</b>' + (urg ? '<em class="cu-pill r">' + urg + ' urgente' + (urg > 1 ? 's' : '') + '</em>' : '') + (s.pend.length ? '<em class="cu-pill a">' + s.pend.length + ' pendiente' + (s.pend.length > 1 ? 's' : '') + '</em>' : '') + (c.cerrado ? '<em class="cu-pill v">finalizado</em>' : '') + '<strong>' + (s.precio ? pesos(s.precio) : '<small class="a">sin precio</small>') + '</strong></div>'
      + '<small>' + esc(piezaTxt(c)) + '</small><i class="cu-prog"><em style="width:' + Math.round(s.hechos / 7 * 100) + '%"></em></i>'
      + '<small class="cu-cli-d"><span>' + (s.actual ? 'Sigue: ' + esc(s.actual.n.toLowerCase()) : 'Completo') + '</span><span>' + (c.entrega ? 'Entrega ' + fC(c.entrega) + (!s.pasos[5].done ? ' · <b class="' + (s.diasEntrega < 0 ? 'r' : s.diasEntrega <= 3 ? 'a' : '') + '">' + enDias(s.diasEntrega) + '</b>' : '') : '<b class="a">sin fecha de entrega</b>') + '</span><span>Pagó ' + pesos(s.ent) + (s.porCobrar > 0 ? ' · debe <b>' + pesos(s.porCobrar) + '</b>' : '') + '</span></small></a>';
  }
  function clientes() {
    const o = (a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999') || (a.nombre || '').localeCompare(b.nombre || '');
    const act = S.clientes.filter(c => !c.cerrado).sort(o), fin = S.clientes.filter(c => c.cerrado).sort(o);
    S.main.innerHTML = '<div class="dn">' + nav('clientes') + '<div class="dn-sec-c"><h1>Clientes</h1><button class="btn negro" id="cu-nuevo">＋ Nuevo cliente</button></div>'
      + '<p class="sub">Ordenados por fecha de entrega. La barra es el avance del pedido, de confirmado a liquidado.</p>'
      + '<section class="dn-sec">' + (act.map(tarjeta).join('') || '<p class="sub">No hay clientes activos. Toca <b>＋ Nuevo cliente</b>.</p>') + '</section>'
      + (fin.length ? '<section class="dn-sec"><h3>Finalizados · ' + fin.length + '</h3>' + fin.map(tarjeta).join('') + '</section>' : '') + '</div>';
    $('#cu-nuevo').onclick = () => alta();
  }
  function cliente(c) {
    const s = st(c), al = alertas(c, s), fin = s.pasos[5].done && s.pasos[6].done;
    const filas = COST.map(([k, n]) => { const e = !vacio((c.costos || {})[k]) ? num(c.costos[k]) : null, r = s.real[k]; if (!e && !r) return ''; const d = r - (e || 0);
      return '<tr><td>' + esc(n) + '</td><td>' + (e != null ? pesos(e) : '<span class="a">pendiente</span>') + '</td><td>' + (r ? pesos(r) : '—') + '</td><td class="' + (e != null && r ? (d > 0 ? 'r' : 'v') : '') + '">' + (e != null && r ? (d > 0 ? '+' : '') + pesos(d) : e != null ? '<span class="gris">por gastar</span>' : '') + '</td></tr>'; }).join('');
    const nom1 = (c.nombre || '').split(' ')[0];
    S.main.innerHTML = '<div class="dn cu-ficha">' + nav('clientes') + '<a href="#dinero/clientes" class="volver">← Clientes</a>'
      + '<div class="cu-cab"><h1>' + esc(c.nombre) + (c.cerrado ? ' <em class="cu-pill v">finalizado</em>' : '') + '</h1><p class="sub">' + esc(piezaTxt(c)) + '</p>'
      + '<p class="sub">' + [c.telefono, c.zona, c.fecha ? 'pidió el ' + fC(c.fecha) : ''].filter(Boolean).map(esc).join(' · ') + ' · entrega ' + (c.entrega ? '<b class="' + (!s.pasos[5].done && s.diasEntrega < 0 ? 'r' : '') + '">' + fC(c.entrega) + (!s.pasos[5].done ? ' (' + enDias(s.diasEntrega) + ')' : '') + '</b>' : '<b class="a">sin fecha</b>') + '</p></div>'
      + '<section class="dn-hero cu-sig"><p class="dn-k">Siguiente paso</p><p class="cu-sig-t">' + esc(siguiente(c, s)) + '</p><i class="cu-prog"><em style="width:' + Math.round(s.hechos / 7 * 100) + '%"></em></i><p class="sub">' + s.hechos + ' de 7 pasos</p></section>'
      + (al.length ? '<section class="dn-sec"><h3>Avisos</h3><div class="cu-al">' + al.map(a => '<div class="p' + a[0] + '"><i></i><span><b>' + esc(a[1]) + '</b><small>' + esc(a[2]) + '</small></span></div>').join('') + '</div></section>' : '')
      + (s.pend.length ? '<section class="dn-sec cu-pend"><h3>Datos pendientes · ' + s.pend.length + '</h3><p>' + s.pend.map(esc).join(' · ') + '</p><button class="btn" data-edit="1">Completar datos</button></section>' : '')
      + '<section class="dn-sec"><h3>Seguimiento del pedido</h3><ol class="cu-pasos">' + s.pasos.map((p, i) => '<li class="' + (p.done ? 'si' : '') + (s.actual === p ? ' ya' : '') + '"><i>' + (p.done ? '✓' : i + 1) + '</i><span><b>' + esc(p.n) + '</b><small>' + (p.done ? (p.fecha ? fC(p.fecha) : 'hecho') : p.auto ? 'se marca solo al registrar el dinero' : 'pendiente') + '</small></span>'
        + (!p.auto && !c.cerrado ? '<button class="btn" data-paso="' + p.k + '">' + ((c.pasos || {})[p.k] ? 'Desmarcar' : p.done ? 'Fijar fecha' : 'Marcar') + '</button>' : '') + '</li>').join('') + '</ol></section>'
      + '<section class="dn-sec"><h3>Dinero del cliente</h3><div class="cu-4"><div><span>Precio de venta</span><b>' + (s.precio ? pesos(s.precio) : '<small class="a">pendiente</small>') + '</b></div><div><span>Ya pagó' + (s.cobradoPct != null ? ' · ' + pctT(s.cobradoPct) : '') + '</span><b class="v">' + pesos(s.ent) + '</b></div>'
        + '<div><span>Le falta pagar</span><b>' + (s.porCobrar != null ? pesos(Math.max(s.porCobrar, 0)) : '—') + '</b></div><div><span>Anticipo acordado</span><b>' + (s.precio ? pesos(s.antAc) : '—') + '</b></div></div>'
        + (s.precio ? '<i class="cu-prog v"><em style="width:' + Math.min(100, Math.round(s.cobradoPct * 100)) + '%"></em></i>' : '') + '</section>'
      + '<section class="dn-sec"><h3>Costos: estimado contra real</h3>' + (filas ? '<div class="cu-tabla"><table><thead><tr><th>Concepto</th><th>Estimado</th><th>Real</th><th>Diferencia</th></tr></thead><tbody>' + filas + '</tbody><tfoot><tr><td>Total</td><td>' + (s.costo ? pesos(s.costo) : '—') + '</td><td>' + pesos(s.sal) + '</td><td class="' + (s.costo && s.sal > s.costo ? 'r' : '') + '">' + (s.costo ? (s.sal > s.costo ? '+' : '') + pesos(s.sal - s.costo) : '—') + '</td></tr></tfoot></table></div>'
        + (s.costo ? '<p class="sub">Gastado ' + pctT(s.gastadoPct) + ' de lo estimado · falta gastar <b>' + pesos(s.porGastar) + '</b></p>' : '') : '<p class="sub">Sin costos todavía.</p>') + '</section>'
      + '<section class="dn-sec"><h3>Ganancia</h3><div class="cu-4"><div><span>Ganancia esperada</span><b class="' + (s.ganancia != null ? cls(s.ganancia) : '') + '">' + (s.ganancia != null ? pesos(s.ganancia) : '—') + '</b></div><div><span>Margen</span><b>' + pctT(s.margen) + '</b></div>'
        + '<div><span>Se vende a</span><b>' + (s.veces ? '×' + s.veces.toFixed(2) : '—') + '</b><small>la regla es ×1.6</small></div><div><span>Precio con ×1.6</span><b class="oro">' + (s.precioSug ? pesos(s.precioSug) : '—') + '</b></div></div></section>'
      + '<section class="dn-hero"><p class="dn-k">Dinero de este cliente que nos queda</p><p class="dn-g' + (s.balance < 0 ? ' neg' : '') + '">' + pesos(s.balance) + '</p><p class="dn-nota">'
        + (s.balance < 0 ? 'Se gastó más de lo que ha pagado: se está cubriendo con dinero de otros clientes.' : s.necesita > 0 ? 'Faltan ' + pesos(s.porGastar) + ' de gastos y solo hay ' + pesos(s.balance) + ' suyos: faltan ' + pesos(s.necesita) + ' de otro lado o cobrarle antes.' : s.porGastar > 0 ? 'Faltan ' + pesos(s.porGastar) + ' de gastos: ese dinero ya está comprometido para su mesa.' : 'Cubre todo lo gastado.') + '</p></section>'
      + '<div class="cu-btns"><button class="btn negro grande" id="cu-reg">＋ Registrar dinero de ' + esc(nom1) + '</button><button class="btn" data-edit="1">Editar cliente</button></div>'
      + '<div class="cu-btns"><button class="btn" id="cu-xfp">Formato de pedido (PDF)</button><button class="btn" id="cu-xpdf">Estado de cuenta (PDF)</button><button class="btn" id="cu-xxls">Excel de este cliente</button></div>'
      + (!c.cerrado ? '<button class="btn grande cu-fin" id="cu-fin"' + (fin ? '' : ' disabled') + '>' + (fin ? 'Finalizar pedido ✓' : 'Finalizar pedido (cuando esté entregada y liquidada)') + '</button>' : '<button class="btn" id="cu-reab">Reabrir pedido</button>')
      + '<section class="dn-sec cu-hoja-p"><div class="dn-sec-c"><h3>Formato de pedido</h3><button class="lnk" data-edit="1">Editar</button></div>' + specs(c).map(([t, l]) => '<h4>' + esc(t) + '</h4><dl>' + l.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd' + (v === 'pendiente' ? ' class="a"' : '') + '>' + esc(v) + '</dd>').join('') + '</dl>').join('') + '</section>'
      + (c.notas ? '<section class="dn-sec"><h3>Notas</h3><p class="cu-notas">' + esc(c.notas) + '</p></section>' : '')
      + '<section class="dn-sec"><h3>Movimientos de este cliente</h3>' + (s.ms.length ? '<div class="dn-lista">' + s.ms.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(S.filaMov).join('') + '</div>' : '<p class="sub">Sin movimientos.</p>') + '</section></div>';
    $$('[data-edit]').forEach(b => b.onclick = () => alta(c));
    $('#cu-reg').onclick = () => S.hoja(null, { cliente: c.id });
    $$('.dn-lista [data-mov]').forEach(b => b.onclick = () => S.hoja(S.movs.find(x => x.id === b.dataset.mov)));
    $('#cu-xpdf').onclick = () => pdfCliente(c); $('#cu-xfp').onclick = () => pdfFormato(c); $('#cu-xxls').onclick = () => xlsCliente(c);
    $$('[data-paso]').forEach(b => b.onclick = async () => {
      const k = b.dataset.paso, P = Object.assign({}, c.pasos || {}), quitar = !!P[k], p = s.pasos.find(x => x.k === k);
      if (!await pedirClave(quitar ? 'Desmarcar paso' : 'Marcar paso', [['Cliente', c.nombre], ['Paso', p.n], ['Fecha', quitar ? 'se quita' : fC(hoy())]])) return;
      if (quitar) delete P[k]; else P[k] = hoy();
      try { await S.A.nodoPon('dinero/clientes/' + c.id + '/pasos', Object.keys(P).length ? P : null); await S.cargar(); cliente(cli(c.id)); S.X.toast(p.n + (quitar ? ' desmarcado' : ' marcado')); } catch (e) { S.X.alerta(e.message); }
    });
    const f = $('#cu-fin'); if (f) f.onclick = async () => { if (!await pedirClave('Finalizar pedido', [['Cliente', c.nombre], ['Cobrado', pesos(s.ent)], ['Gastado', pesos(s.sal)], ['Le quedó', pesos(s.balance)]])) return; try { await S.A.nodoCambia('dinero/clientes/' + c.id, { cerrado: true }); await S.cargar(); cliente(cli(c.id)); S.X.toast('Pedido finalizado'); } catch (e) { S.X.alerta(e.message); } };
    const r = $('#cu-reab'); if (r) r.onclick = async () => { if (!await pedirClave('Reabrir pedido', [['Cliente', c.nombre]])) return; try { await S.A.nodoCambia('dinero/clientes/' + c.id, { cerrado: false }); await S.cargar(); cliente(cli(c.id)); } catch (e) { S.X.alerta(e.message); } };
  }

  // ---------- alta / edición de cliente, igual que la hoja "Formato de pedido": no avanza hasta que cada dato esté lleno o marcado "No lo tengo aún" ----------
  const NUMS = ['largo', 'ancho', 'cantidad', 'altura', 'espesor', 'precio', 'anticipo'];
  function alta(c0) {
    c0 = c0 || {}; const w = limpio(c0); w.costos = w.costos || {}; w.pend = w.pend || {};
    if (!w.fecha) w.fecha = hoy(); if (!w.cantidad) w.cantidad = 1;
    if (!w.direccion && w.zona) w.direccion = w.zona; if (!w.color && w.piedra) w.color = w.piedra;
    if (!w.folio) w.folio = S.clientes.reduce((m, c) => Math.max(m, num(c.folio)), 0) + 1;
    let paso = 0; const N = PASOS_ALTA.length;
    const cap = document.createElement('div'); cap.className = 'dn-capa'; document.body.appendChild(cap); document.body.classList.add('dn-sin-scroll');
    const cerrar = () => { cap.remove(); document.body.classList.remove('dn-sin-scroll'); };
    const costoW = () => COST.reduce((a, [k]) => a + num(w.costos[k]), 0);
    const vivo = () => { const co = costoW(), p = num(w.precio), g = p && co ? p - co : null; return '<div class="cu-vivo"><div>Costo<b>' + (co ? pesos(co) : '—') + '</b></div><div>Precio<b>' + (p ? pesos(p) : '—') + '</b></div><div>Ganancia<b class="' + (g != null ? cls(g) : '') + '">' + (g != null ? pesos(g) + ' · ' + pctT(g / p) : '—') + '</b></div></div>'; };
    const noTengo = k => '<button type="button" class="cu-nt' + (w.pend[k] ? ' on' : '') + '" data-nt="' + k + '">' + (w.pend[k] ? 'Pendiente ✓' : 'No lo tengo aún') + '</button>';
    const caja = (k, lbl, html) => '<div class="cu-campo" data-req="' + k + '"><div class="cu-campo-c"><span>' + lbl + '</span>' + (k ? noTengo(k) : '') + '</div>' + html + '</div>';
    const inp = (k, extra) => '<input data-k="' + k + '" value="' + esc(w[k] == null ? '' : w[k]) + '" ' + (extra || '') + '>';
    const area = (k, ph) => '<textarea data-k="' + k + '" maxlength="300" placeholder="' + (ph || '') + '">' + esc(w[k] || '') + '</textarea>';
    const chips = (k, l, otraK, ph) => '<div class="dn-chips" data-g="' + k + '">' + l.map(x => '<button type="button" data-v="' + esc(x) + '"' + (w[k] === x ? ' class="on"' : '') + '>' + esc(x) + '</button>').join('') + '</div>'
      + (otraK && (w[k] === 'Otra' || w[k] === 'Otro') ? '<input data-k="' + otraK + '" value="' + esc(w[otraK] || '') + '" maxlength="60" placeholder="' + (ph || '¿Cuál?') + '" class="cu-otra">' : '');
    function cuerpo() {
      if (paso === 0) return '<p class="cu-folio">Nº de pedido <b>' + esc(w.folio) + '</b></p>'
        + caja('', 'Nombre del cliente', inp('nombre', 'maxlength="80" autocomplete="off" placeholder="ej. Becky Zaga"'))
        + caja('telefono', 'Teléfono / WhatsApp', inp('telefono', 'inputmode="tel" maxlength="20"'))
        + caja('', 'Email (opcional)', inp('email', 'type="email" maxlength="80"'))
        + caja('direccion', 'Dirección de entrega', inp('direccion', 'maxlength="160"'))
        + caja('vendedor', 'Vendedor', chips('vendedor', [...new Set(['Zury', 'David'].concat(S.clientes.map(c => c.vendedor).filter(Boolean)))].concat(['Otro']), 'vendedorOtro', 'Nombre del vendedor'))
        + '<div class="cu-2i">' + caja('fecha', 'Fecha del pedido', inp('fecha', 'type="date"')) + caja('entrega', 'Fecha de entrega', inp('entrega', 'type="date"')) + '</div>';
      if (paso === 1) { const red = w.forma === 'Redonda';
        return caja('forma', 'Forma', chips('forma', FORMAS)) + caja('tipo', 'Uso', chips('tipo', TIPOS, 'tipoOtra'))
          + caja('medidas', 'Medidas finales de la mesa (cm)', '<div class="cu-3i">' + inp('largo', 'inputmode="decimal" placeholder="' + (red ? 'Diámetro' : 'Largo') + '" aria-label="' + (red ? 'Diámetro' : 'Largo') + '"') + (red ? '' : inp('ancho', 'inputmode="decimal" placeholder="Ancho" aria-label="Ancho"')) + inp('cantidad', 'inputmode="numeric" placeholder="Cuántas" aria-label="Cuántas"') + '</div><small class="sub">' + (red ? 'Diámetro' : 'Largo · ancho') + ' · cuántas mesas. Ej. 3 m = 300.</small>')
          + caja('altura', 'Altura (cm)', inp('altura', 'inputmode="decimal" placeholder="75"') + '<button type="button" class="cu-sug" data-pon="altura" data-val="75">Comedor estándar: 75 cm · usar</button>'); }
      if (paso === 2) return caja('material', 'Tipo de cubierta', chips('material', MATERIALES, 'materialOtro'))
        + caja('marca', 'Marca / proveedor', inp('marca', 'maxlength="60" placeholder="ej. Quarmol"'))
        + caja('color', 'Color / piedra', chips('color', PIEDRAS, 'colorOtra', 'Nombre de la piedra'))
        + caja('acabado', 'Acabado', chips('acabado', ACABADOS)) + caja('canto', 'Tipo de canto', chips('canto', CANTOS, 'cantoOtro', 'ej. Pulido'))
        + '<div class="cu-2i">' + caja('espesor', 'Espesor (mm)', inp('espesor', 'inputmode="decimal" placeholder="12"') + (w.material === 'Piedra sinterizada' && !w.espesor ? '<button type="button" class="cu-sug" data-pon="espesor" data-val="12">Placa sinterizada: 12 mm · usar</button>' : '')) + caja('refuerzo', 'Refuerzo inferior', chips('refuerzo', SINO)) + '</div>'
        + caja('', 'Observaciones de la cubierta (opcional)', area('obsCubierta', 'ej. canto pulido, esquinas redondeadas'));
      if (paso === 3) return caja('base', 'Diseño de la base', chips('base', BASES, 'baseOtra', 'ej. especial, Base Maestra'))
        + caja('pintura', 'Color de pintura', inp('pintura', 'maxlength="40" placeholder="ej. Negro"'))
        + caja('pacabado', 'Acabado de la pintura', chips('pacabado', ACABADOS)) + caja('ptipo', 'Tipo de pintura', inp('ptipo', 'maxlength="40" placeholder="ej. Electrostática"'))
        + '<div class="cu-2i">' + caja('niveladores', 'Niveladores', chips('niveladores', SINO)) + caja('placasm', 'Placas de montaje', chips('placasm', SINO)) + '</div>'
        + caja('', 'Observaciones de la base (opcional)', area('obsBase'));
      if (paso === 4) { const co = costoW(), sug = co ? Math.ceil(co * REGLA / 100) * 100 : null;
        return caja('precio', 'Precio de venta total', inp('precio', 'inputmode="decimal" class="cu-grande" placeholder="$0"') + (sug ? '<button type="button" class="cu-sug" data-pon="precio" data-val="' + sug + '">Con la regla ×1.6 serían ' + pesos(sug) + ' · usar</button>' : '<small class="sub">Cuando pongas los costos (siguiente paso) y regreses aquí, te sugiero el precio con la regla ×1.6.</small>'))
          + caja('anticipo', 'Anticipo acordado', inp('anticipo', 'inputmode="decimal" placeholder="$0"') + (num(w.precio) ? '<button type="button" class="cu-sug" data-pon="anticipo" data-val="' + num(w.precio) / 2 + '">Usar el 50%: ' + pesos(num(w.precio) / 2) + '</button>' : ''))
          + caja('', 'Notas (opcional)', area('notas')); }
      const sg = costosSugeridos(w), f = sg.fraccion;
      return '<p class="sub">Lo que cuesta hacer esta mesa. ' + (num(w.largo) ? 'Con esas medidas usa ' + (f === 0.25 ? '¼ de placa' : f === 0.5 ? 'media placa' : f === 1 ? 'una placa' : f + ' placas') + ' de 3.20×1.60.' : 'Pon las medidas para calcular la placa.') + '</p>'
        + '<button type="button" class="btn" id="w-calc">Calcular costos sugeridos</button>'
        + '<div class="cu-2i">' + COST.map(([k, n]) => caja(k === 'otros' ? '' : 'c.' + k, n + (k === 'otros' ? ' (opcional)' : ''), '<input data-ck="' + k + '" inputmode="decimal" value="' + esc(w.costos[k] == null ? '' : w.costos[k]) + '" placeholder="' + (sg[k] ? pesos(sg[k]) : '$0') + '">')).join('') + '</div>'
        + '<p class="sub">Sugeridos con los costos del negocio: placa $9,000 + $500 de corte, MDF $650, base de comedor $6,000–7,000 y flete $2,000 si no cabe en la minivan. Si un costo no aplica, pon 0.</p>';
    }
    function leer() {
      $$('[data-k]', cap).forEach(i => { const k = i.dataset.k, v = i.value.trim(); w[k] = NUMS.includes(k) ? (v === '' ? '' : num(v)) : v; });
      $$('[data-ck]', cap).forEach(i => { const v = i.value.trim(); w.costos[i.dataset.ck] = v === '' ? '' : num(v); });
    }
    const faltan = () => CAMPOS.filter(([p, k]) => p === paso && !lleno(w, k) && !w.pend[k]).map(x => x[1]);
    function pintar() {
      cap.innerHTML = '<div class="dn-hoja cu-alta" role="dialog" aria-label="Formato de pedido"><div class="dn-hoja-c"><h2>' + (c0.id ? 'Editar pedido' : 'Formato de pedido') + '</h2><button class="dn-x" aria-label="Cerrar">✕</button></div>'
        + '<div class="cu-pasos-w">' + PASOS_ALTA.map((p, i) => '<span class="' + (i <= paso ? 'on' : '') + '"></span>').join('') + '</div><p class="dn-k">' + (paso + 1) + ' de ' + N + ' · ' + PASOS_ALTA[paso] + '</p>'
        + cuerpo() + '<p class="cu-err" id="w-err" hidden></p>' + vivo()
        + '<div class="cu-btns">' + (paso > 0 ? '<button class="btn" id="w-atras">← Atrás</button>' : '<button class="btn" id="w-x">Cancelar</button>') + (paso < N - 1 ? '<button class="btn negro" id="w-sig">Siguiente →</button>' : '<button class="btn negro" id="w-ok">' + (c0.id ? 'Guardar cambios' : 'Dar de alta') + '</button>') + '</div>'
        + (c0.id && paso === 0 ? '<button class="dn-borrar" id="w-borrar">Borrar este cliente</button>' : '') + '</div>';
      $('.dn-x', cap).onclick = cerrar; if ($('#w-x', cap)) $('#w-x', cap).onclick = cerrar;
      $$('[data-g]', cap).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; leer(); w[g.dataset.g] = b.dataset.v; delete w.pend[g.dataset.g]; pintar(); if (/^Otr[ao]$/.test(b.dataset.v)) { const o = $('.cu-otra', cap); if (o) o.focus(); } });
      $$('[data-nt]', cap).forEach(b => b.onclick = () => { leer(); const k = b.dataset.nt; if (w.pend[k]) delete w.pend[k]; else w.pend[k] = true; pintar(); });
      $$('[data-pon]', cap).forEach(b => b.onclick = () => { leer(); w[b.dataset.pon] = num(b.dataset.val); delete w.pend[b.dataset.pon]; pintar(); });
      $$('input,textarea', cap).forEach(i => i.oninput = () => { leer(); const vv = $('.cu-vivo', cap); if (vv) vv.outerHTML = vivo(); });
      if ($('#w-calc', cap)) $('#w-calc', cap).onclick = () => { leer(); const sg = costosSugeridos(w); COST.forEach(([k]) => { if (vacio(w.costos[k])) w.costos[k] = sg[k]; }); pintar(); S.X.toast('Costos sugeridos puestos: corrígelos con lo real'); };
      if ($('#w-atras', cap)) $('#w-atras', cap).onclick = () => { leer(); paso--; pintar(); cap.scrollTop = 0; };
      const marcar = (f, sinNombre) => { $$('.cu-campo', cap).forEach(el => el.classList.toggle('falta', f.includes(el.dataset.req) || (sinNombre && !!el.querySelector('[data-k=nombre]'))));
        const e = $('#w-err', cap); e.hidden = false; e.textContent = sinNombre ? 'Escribe el nombre del cliente.' : 'Faltan ' + f.length + ' dato(s). Llénalos o toca "No lo tengo aún" y quedan pendientes.';
        const p = $('.cu-campo.falta', cap); if (p) p.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      const validar = () => { leer(); if (paso === 0 && !w.nombre) { marcar([], true); return false; } const f = faltan(); if (!f.length) return true; marcar(f); return false; };
      if ($('#w-sig', cap)) $('#w-sig', cap).onclick = () => { if (validar()) { paso++; pintar(); cap.scrollTop = 0; } };
      if ($('#w-ok', cap)) $('#w-ok', cap).onclick = async () => {
        if (!validar()) return;
        Object.keys(w.pend).forEach(k => { if (lleno(w, k)) delete w.pend[k]; });
        const d = {}; ['folio', 'nombre', 'telefono', 'email', 'direccion', 'vendedor', 'vendedorOtro', 'fecha', 'entrega', 'forma', 'tipo', 'tipoOtra', 'largo', 'ancho', 'cantidad', 'altura', 'material', 'materialOtro', 'marca', 'color', 'colorOtra', 'acabado', 'canto', 'cantoOtro', 'espesor', 'refuerzo', 'obsCubierta',
          'base', 'baseOtra', 'pintura', 'pacabado', 'ptipo', 'niveladores', 'placasm', 'obsBase', 'precio', 'anticipo', 'notas'].forEach(k => { d[k] = vacio(w[k]) ? '' : w[k]; });
        d.nombre = String(d.nombre).slice(0, 80); d.precio = num(d.precio); d.cantidad = num(d.cantidad) || 1; d.zona = ''; d.piedra = '';
        d.costos = Object.fromEntries(COST.map(([k]) => [k, vacio(w.costos[k]) ? '' : num(w.costos[k])])); d.pend = w.pend; d.cerrado = !!w.cerrado;
        const pend = pendientes(d);
        if (!await pedirClave(c0.id ? 'Guardar cambios del pedido' : 'Dar de alta el pedido', [['Nº de pedido', String(d.folio)], ['Cliente', d.nombre], ['Mesa', piezaTxt(d)], ['Entrega', d.entrega ? fC(d.entrega) : 'pendiente'], ['Precio', d.precio ? pesos(d.precio) : 'pendiente'], ['Costo estimado', costoW() ? pesos(costoW()) : 'pendiente'], ['Datos pendientes', pend.length ? pend.length + '' : 'ninguno']])) return;
        const g = $('#w-ok', cap); g.disabled = true; g.textContent = 'Guardando…';
        try {
          // Firebase no guarda "" en hijos; se mandan como null para borrar lo que se vació
          const fb = JSON.parse(JSON.stringify(d, (k, v) => v === '' ? null : v));
          let id = c0.id;
          if (id) await S.A.nodoCambia('dinero/clientes/' + id, Object.assign(fb, { costos: fb.costos || null, pend: Object.keys(d.pend).length ? d.pend : null }));
          else id = await S.A.nodoAgrega('dinero/clientes', fb);
          cerrar(); await S.cargar(); S.X.toast(c0.id ? 'Pedido guardado' : 'Pedido dado de alta'); location.hash = '#dinero/c=' + id; if (c0.id) cliente(cli(id));
        } catch (e) { g.disabled = false; g.textContent = 'Guardar'; S.X.alerta(e.message); }
      };
      if ($('#w-borrar', cap)) $('#w-borrar', cap).onclick = async () => {
        if (S.movs.some(m => m.cliente === c0.id)) return S.X.alerta('Este cliente tiene movimientos de dinero. Cámbialos a otro cliente o bórralos primero.');
        if (!await pedirClave('Borrar cliente', [['Cliente', c0.nombre], ['Ojo', 'no se puede deshacer']])) return;
        try { await S.A.nodoBorra('dinero/clientes/' + c0.id); cerrar(); await S.cargar(); location.hash = '#dinero/clientes'; S.X.toast('Cliente borrado'); } catch (e) { S.X.alerta(e.message); }
      };
      if (paso === 0 && !c0.id) setTimeout(() => { const n = $('[data-k=nombre]', cap); if (n) n.focus(); }, 40);
    }
    pintar();
  }

  // ---------- deudas ----------
  function deudas() {
    const ds = S.deudas.slice().sort((a, b) => (a.vence || '9999').localeCompare(b.vence || '9999')), tot = ds.reduce((a, d) => a + statsDeu(d, S.movs).falta, 0);
    S.main.innerHTML = '<div class="dn">' + nav('deudas') + '<div class="dn-sec-c"><h1>Deudas</h1><button class="btn negro" id="cu-nd">＋ Deuda</button></div>'
      + '<section class="dn-hero"><p class="dn-k">Debemos en total</p>' + (ds.length ? '<p class="dn-g' + (tot ? ' neg' : '') + '">' + pesos(tot) + '</p><p class="dn-nota">Cuando se pague algo, regístralo como salida y elige la deuda: se descuenta sola.</p>' : '<p class="dn-g a">Sin anotar</p><p class="dn-nota">Todavía no hay ninguna deuda anotada. Toca <b>＋ Deuda</b> y anota cada una: a quién, cuánto y para cuándo. Si no sabes la cantidad exacta, pon la aproximada.</p>') + '</section>'
      + '<section class="dn-sec">' + (ds.map(d => { const x = statsDeu(d, S.movs), dd = d.vence ? entre(hoy(), d.vence) : null;
        return '<button class="cu-deu" data-deu="' + esc(d.id) + '"><span><b>' + esc(d.nombre) + (d.aprox ? ' <em class="cu-pill a">aprox.</em>' : '') + (x.falta && dd != null && dd < 0 ? ' <em class="cu-pill r">vencida</em>' : '') + '</b><small>De ' + pesos(num(d.monto)) + ' · pagado ' + pesos(x.pag) + (d.vence ? ' · vence ' + fC(d.vence) + ' (' + enDias(dd) + ')' : '') + (d.notas ? ' · ' + esc(d.notas) : '') + '</small></span><em class="' + (x.falta ? 'r' : 'v') + '">' + (x.falta ? pesos(x.falta) : 'Pagada') + '</em></button>'; }).join('')
        || '<p class="sub">Anota aquí a quién le debe el negocio: proveedores, herreros, préstamos, tarjetas, familia.</p>') + '</section></div>';
    $('#cu-nd').onclick = () => hojaDeuda();
    $$('[data-deu]').forEach(b => b.onclick = () => hojaDeuda(S.deudas.find(d => d.id === b.dataset.deu)));
  }
  function hojaDeuda(d0) {
    d0 = d0 || {};
    const cap = document.createElement('div'); cap.className = 'dn-capa'; document.body.appendChild(cap);
    const cerrar = () => cap.remove();
    cap.innerHTML = '<div class="dn-hoja"><div class="dn-hoja-c"><h2>' + (d0.id ? 'Editar deuda' : 'Nueva deuda') + '</h2><button class="dn-x" aria-label="Cerrar">✕</button></div>'
      + '<div class="cu-campo"><div class="cu-campo-c"><span>¿A quién se le debe?</span></div><input id="d-n" maxlength="60" value="' + esc(d0.nombre || '') + '" placeholder="ej. Quarmol (placas)"></div>'
      + '<div class="cu-2i"><div class="cu-campo"><div class="cu-campo-c"><span>¿Cuánto en total?</span></div><input id="d-m" inputmode="decimal" value="' + esc(d0.monto || '') + '" placeholder="$0"></div><div class="cu-campo"><div class="cu-campo-c"><span>¿Para cuándo?</span></div><input id="d-v" type="date" value="' + esc(d0.vence || '') + '"></div></div>'
      + '<label class="cu-chk1"><input type="checkbox" id="d-a"' + (d0.aprox ? ' checked' : '') + '> La cantidad es aproximada (hay que confirmarla)</label>'
      + '<div class="cu-campo"><div class="cu-campo-c"><span>Notas (intereses, quién la sabe…)</span></div><textarea id="d-o" maxlength="200">' + esc(d0.notas || '') + '</textarea></div>'
      + '<p class="cu-err" id="d-err" hidden></p><button class="btn negro grande" id="d-g">Guardar</button>' + (d0.id ? '<button class="dn-borrar" id="d-b">Borrar esta deuda</button>' : '') + '</div>';
    $('.dn-x', cap).onclick = cerrar; cap.onclick = e => { if (e.target === cap) cerrar(); };
    $('#d-g', cap).onclick = async () => {
      const x = { nombre: $('#d-n', cap).value.trim().slice(0, 60), monto: num($('#d-m', cap).value), vence: $('#d-v', cap).value || null, aprox: $('#d-a', cap).checked, notas: $('#d-o', cap).value.trim().slice(0, 200) || null };
      const e = $('#d-err', cap); if (!x.nombre || !x.monto) { e.hidden = false; e.textContent = 'Escribe a quién y cuánto. Si no sabes cuánto exacto, pon lo aproximado y marca la casilla.'; return; }
      if (!await pedirClave(d0.id ? 'Guardar deuda' : 'Anotar deuda', [['A quién', x.nombre], ['Monto', pesos(x.monto) + (x.aprox ? ' (aprox.)' : '')], ['Vence', x.vence ? fC(x.vence) : 'sin fecha']])) return;
      try { if (d0.id) await S.A.nodoCambia('dinero/deudas/' + d0.id, x); else await S.A.nodoAgrega('dinero/deudas', x); cerrar(); await S.cargar(); deudas(); S.X.toast('Deuda guardada'); } catch (er) { S.X.alerta(er.message); }
    };
    if (d0.id) $('#d-b', cap).onclick = async () => {
      if (S.movs.some(m => m.deuda === d0.id)) return S.X.alerta('Esta deuda tiene pagos registrados. Bórralos o cámbialos primero.');
      if (!await pedirClave('Borrar deuda', [['A quién', d0.nombre], ['Ojo', 'no se puede deshacer']])) return;
      try { await S.A.nodoBorra('dinero/deudas/' + d0.id); cerrar(); await S.cargar(); deudas(); } catch (er) { S.X.alerta(er.message); }
    };
  }

  // ---------- exportar ----------
  function exportar() {
    S.main.innerHTML = '<div class="dn">' + nav('exportar') + '<h1>Exportar</h1><p class="sub">Para rendir cuentas a los socios: todo lo del panel en un solo archivo.</p>'
      + '<section class="dn-sec cu-exp"><h3>Reporte general</h3><p class="sub">Resumen, clientes con su avance y ganancia, datos pendientes, costos estimado contra real, deudas, lo que viene y todos los movimientos.</p>'
      + '<div class="cu-btns"><button class="btn negro grande" id="x-pdf">Reporte general (PDF)</button><button class="btn grande" id="x-xls">Reporte general (Excel)</button></div></section>'
      + '<section class="dn-sec"><h3>Por cliente</h3><p class="sub">Abre un cliente y usa <b>Estado de cuenta (PDF)</b> o <b>Excel de este cliente</b>.</p>'
      + S.clientes.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(c => '<div class="cu-xrow"><span>' + esc(c.nombre) + '</span><button class="btn" data-xp="' + esc(c.id) + '">PDF</button><button class="btn" data-xx="' + esc(c.id) + '">Excel</button></div>').join('') + '</section>'
      + '<section class="dn-sec"><h3>Movimientos</h3><p class="sub">En <a class="lnk" href="#dinero/todos">Movimientos</a> puedes filtrar por fechas y sacar el estado de cuenta.</p></section></div>';
    $('#x-pdf').onclick = () => pdfGeneral(); $('#x-xls').onclick = () => xlsGeneral();
    $$('[data-xp]').forEach(b => b.onclick = () => pdfCliente(cli(b.dataset.xp))); $$('[data-xx]').forEach(b => b.onclick = () => xlsCliente(cli(b.dataset.xx)));
  }
  const lib = (src, ya) => ya() ? Promise.resolve() : new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('No se pudo cargar el generador. Revisa tu internet.')); document.head.appendChild(s); });
  const libPDF = async () => { await lib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => window.jspdf); await lib('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', () => window.jspdf && window.jspdf.jsPDF.API.autoTable); };
  const libXLS = () => lib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => window.XLSX);
  async function bajar(blob, nombre) {
    try { const f = new File([blob], nombre, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: nombre }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    S.X.toast('Listo: ' + nombre);
  }
  const ocupado = async (fn) => { S.X.toast('Preparando archivo…'); try { await fn(); } catch (e) { S.X.alerta(e.message || String(e)); } };
  const nomQuien = m => m.cliente ? ((cli(m.cliente) || {}).nombre || '') : m.deuda ? 'Deuda: ' + ((S.deudas.find(d => d.id === m.deuda) || {}).nombre || '') : 'General';
  const quienTiene = m => m.quien || (/david/i.test(m.nota || '') ? 'David' : 'Zury');
  // tablas comunes (filas de datos puros: números como números)
  function tablas() {
    const H = hoy(), t = totales(S.clientes, S.movs, S.deudas, H), pr = proyeccion(t, S.deudas, S.movs, H);
    const per = {}; S.movs.forEach(m => { const q = quienTiene(m); per[q] = (per[q] || 0) + (esIn(m) ? 1 : -1) * num(m.monto); });
    const todos = S.clientes.map(c => [c, st(c)]);
    return {
      t, pr,
      resumen: [['Dinero con nosotros (entró − salió)', t.caja], ...Object.entries(per).map(([q, v]) => ['  Lo tiene ' + q, v]), ['  En efectivo', t.porMetodo.Efectivo], ['  En banco', t.porMetodo.Banco], ['  Sin decir si fue efectivo o banco', t.porMetodo['Sin decir']],
        ['Entró en total', t.ent], ['Salió en total', t.sal], ['Nos deben clientes', t.teDeben], ['Falta gastar en pedidos', t.porGastar], ['Debemos', S.deudas.length ? t.debes : 'sin anotar todavía'], ['Posición real' + (S.deudas.length ? '' : ' (sin contar deudas)'), t.posicion],
        ['Ganancia esperada de clientes activos', t.conGan ? t.gan : ''], ['Margen promedio', t.venta ? Math.round(t.gan / t.venta * 1000) / 10 + '%' : ''], ['Gastos sin cliente asignado', t.sinDueno], ['Movimientos por aclarar', String(t.porAclarar)]],
      clientesH: ['Cliente', 'Mesa', 'Teléfono', 'Pidió', 'Entrega', 'Avance', 'Sigue', 'Precio', 'Pagó', 'Debe', 'Costo estimado', 'Gastado', 'Falta gastar', 'Ganancia', 'Margen', 'Estado', 'Datos pendientes'],
      clientes: todos.map(([c, s]) => [c.nombre, piezaTxt(c), c.telefono || '', c.fecha || '', c.entrega || '', s.hechos + '/7', s.actual ? s.actual.n : 'Completo', s.precio || '', s.ent, s.porCobrar != null ? Math.max(s.porCobrar, 0) : '', s.costo || '', s.sal, s.porGastar != null ? s.porGastar : '', s.ganancia != null ? s.ganancia : '', s.margen != null ? Math.round(s.margen * 1000) / 10 + '%' : '', c.cerrado ? 'Finalizado' : 'Activo', s.pend.join(', ')]),
      costosH: ['Cliente', 'Concepto', 'Estimado', 'Real', 'Diferencia'],
      costos: [].concat(...todos.map(([c, s]) => COST.map(([k, n]) => { const e = !vacio((c.costos || {})[k]) ? num(c.costos[k]) : null, r = s.real[k]; return e == null && !r ? null : [c.nombre, n, e == null ? 'pendiente' : e, r, e == null ? '' : r - e]; }).filter(Boolean))),
      deudasH: ['A quién', 'Monto', 'Pagado', 'Falta', 'Vence', 'Aproximada', 'Notas'],
      deudas: S.deudas.map(d => { const x = statsDeu(d, S.movs); return [d.nombre, num(d.monto), x.pag, x.falta, d.vence || '', d.aprox ? 'Sí' : 'No', d.notas || '']; }),
      proyH: ['Fecha', 'Qué pasa', 'Monto', 'Queda'],
      proy: pr.ev.map(e => [e.f.slice(0, 4) === '9999' ? 'sin fecha' : e.f, e.t, e.v, e.run]),
      movsH: ['Fecha', 'Tipo', 'Categoría', 'Cliente / deuda', 'Quién', 'Cómo', 'Nota', 'Entrada', 'Salida', 'Estado', 'Registró'],
      movs: S.movs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.creado || 0) - (b.creado || 0)).map(m => [m.fecha, esIn(m) ? 'Entrada' : 'Salida', m.cat || '', nomQuien(m), quienTiene(m), m.metodo || 'sin decir', m.nota || '', esIn(m) ? num(m.monto) : '', esIn(m) ? '' : num(m.monto), m.revisar ? 'Por aclarar' : 'Claro', m.por || ''])
    };
  }
  function hoja(XL, cab, filas, anchos) {
    const ws = XL.utils.aoa_to_sheet(cab ? [cab].concat(filas) : filas);
    ws['!cols'] = (anchos || []).map(w => ({ wch: w }));
    Object.keys(ws).forEach(k => { const c = ws[k]; if (k[0] !== '!' && c.t === 'n') c.z = '"$"#,##0;[Red]-"$"#,##0'; });
    return ws;
  }
  const libroABlob = (XL, wb) => new Blob([XL.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  function xlsGeneral() {
    return ocupado(async () => {
      await libXLS(); const XL = window.XLSX, T = tablas(), wb = XL.utils.book_new();
      XL.utils.book_append_sheet(wb, hoja(XL, ['Concepto', 'Monto'], [['Reporte DKAS al ' + hoy(), '']].concat(T.resumen), [44, 16]), 'Resumen');
      XL.utils.book_append_sheet(wb, hoja(XL, T.clientesH, T.clientes, [22, 40, 14, 11, 11, 8, 20, 12, 12, 12, 13, 12, 12, 12, 9, 11, 50]), 'Clientes');
      XL.utils.book_append_sheet(wb, hoja(XL, T.costosH, T.costos, [22, 28, 13, 13, 13]), 'Costos');
      XL.utils.book_append_sheet(wb, hoja(XL, T.movsH, T.movs, [11, 9, 16, 22, 10, 13, 50, 12, 12, 12, 12]), 'Movimientos');
      XL.utils.book_append_sheet(wb, hoja(XL, T.deudasH, T.deudas, [26, 13, 13, 13, 11, 11, 40]), 'Deudas');
      XL.utils.book_append_sheet(wb, hoja(XL, T.proyH, T.proy, [12, 36, 13, 13]), 'Lo que viene');
      await bajar(libroABlob(XL, wb), 'DKAS reporte general ' + hoy() + '.xlsx');
    });
  }
  function xlsCliente(c) {
    return ocupado(async () => {
      await libXLS(); const XL = window.XLSX, s = st(c), wb = XL.utils.book_new();
      const ficha = [].concat(...specs(c).map(([t, l]) => [[t, '']].concat(l))).concat([['Dinero', ''],
        ['Precio de venta', s.precio || 'pendiente'], ['Anticipo acordado', s.precio ? s.antAc : ''], ['Ya pagó', s.ent], ['Le falta pagar', s.porCobrar != null ? Math.max(s.porCobrar, 0) : ''], ['Costo estimado', s.costo || 'pendiente'], ['Gastado', s.sal],
        ['Falta gastar', s.porGastar != null ? s.porGastar : ''], ['Ganancia esperada', s.ganancia != null ? s.ganancia : ''], ['Margen', s.margen != null ? Math.round(s.margen * 1000) / 10 + '%' : ''], ['Dinero de este cliente que queda', s.balance],
        ['Avance', s.hechos + ' de 7'], ['Siguiente paso', siguiente(c, s)], ['Datos pendientes', s.pend.join(', ') || 'ninguno'], ['Notas', c.notas || '']]);
      XL.utils.book_append_sheet(wb, hoja(XL, ['Dato', 'Valor'], ficha, [30, 60]), 'Ficha');
      XL.utils.book_append_sheet(wb, hoja(XL, ['Paso', 'Estado', 'Fecha'], s.pasos.map(p => [p.n, p.done ? 'Hecho' : 'Pendiente', p.fecha || '']), [22, 12, 12]), 'Seguimiento');
      XL.utils.book_append_sheet(wb, hoja(XL, ['Concepto', 'Estimado', 'Real', 'Diferencia'], COST.map(([k, n]) => { const e = !vacio((c.costos || {})[k]) ? num(c.costos[k]) : null, r = s.real[k]; return [n, e == null ? 'pendiente' : e, r, e == null ? '' : r - e]; }), [28, 13, 13, 13]), 'Costos');
      XL.utils.book_append_sheet(wb, hoja(XL, ['Fecha', 'Tipo', 'Categoría', 'Quién', 'Cómo', 'Nota', 'Entrada', 'Salida'], s.ms.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m => [m.fecha, esIn(m) ? 'Entrada' : 'Salida', m.cat || '', quienTiene(m), m.metodo || 'sin decir', m.nota || '', esIn(m) ? num(m.monto) : '', esIn(m) ? '' : num(m.monto)]), [11, 9, 16, 10, 13, 50, 12, 12]), 'Movimientos');
      await bajar(libroABlob(XL, wb), 'DKAS ' + c.nombre + ' ' + hoy() + '.xlsx');
    });
  }
  // ---- PDF formal: blanco y negro, encabezado con logo, tablas con líneas finas, pie con fecha y página ----
  const sinRaros = s => String(s == null ? '' : s).replace(/−/g, '-').replace(/[✓✕→←]/g, '').replace(/[^\x00-\xFF€…–—‘’“”•]/g, '');
  const $p = n => n === '' || n == null ? '' : typeof n === 'number' ? pesosC(n) : sinRaros(n);
  async function logoData() { try { const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = 'img/dkas-oscuro.png'; }); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); return { d: cv.toDataURL('image/png'), r: img.naturalWidth / img.naturalHeight }; } catch (e) { return null; } }
  async function docPDF(titulo, sub, numerar) {
    await libPDF(); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' }), W = 279.4, M = 14, L = await logoData();
    if (L) doc.addImage(L.d, 'PNG', M, 10, 9 * L.r, 9);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(sinRaros(titulo), W - M, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(sinRaros(sub), W - M, 20, { align: 'right' }); doc.setTextColor(0);
    doc.setDrawColor(168, 132, 79); doc.setLineWidth(0.5); doc.line(M, 24, W - M, 24);
    const ahora = new Date(), quien = ((S.X.me && S.X.me()) || {}).nombre || '';
    const pie = () => { const n = doc.internal.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(sinRaros('Generado el ' + ymd(ahora) + ' ' + p2(ahora.getHours()) + ':' + p2(ahora.getMinutes()) + (quien ? ' por ' + quien : '') + ' desde el panel DKAS · Montos en pesos mexicanos (MXN) · Solo incluye lo registrado en el panel.'), M, 208); doc.text('Página ' + i + ' de ' + n, W - M, 208, { align: 'right' }); } doc.setTextColor(0); };
    let y = 30, nsec = 0;
    const sec = (t) => { if (y > 185) { doc.addPage(); y = 18; } doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(sinRaros((numerar ? ++nsec + '. ' : '') + t), M, y); y += 2; };
    const tabla = (cab, filas, opt) => { doc.autoTable(Object.assign({ startY: y, head: [cab.map(sinRaros)], body: filas.map(r => r.map($p)), margin: { left: M, right: M, bottom: 14 }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: [210, 205, 196], lineWidth: 0.1, textColor: [22, 20, 15] }, headStyles: { fillColor: [22, 20, 15], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [247, 246, 243] } }, opt || {})); y = doc.lastAutoTable.finalY + 8; };
    const parrafo = (t) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); const ls = doc.splitTextToSize(sinRaros(t), W - 2 * M); if (y + ls.length * 4 > 200) { doc.addPage(); y = 18; } doc.text(ls, M, y + 3); y += ls.length * 4 + 8; };
    return { doc, sec, tabla, parrafo, pie, get y() { return y; }, set y(v) { y = v; } };
  }
  const derecha = n => { const o = {}; for (let i = 0; i < n.length; i++) if (n[i]) o[i] = { halign: 'right' }; return o; };
  function pdfGeneral() {
    return ocupado(async () => {
      const T = tablas(), P = await docPDF('Reporte de cuentas', 'Al ' + ymd(new Date()) + ' · ' + S.clientes.length + ' clientes · ' + S.movs.length + ' movimientos', true);
      P.sec('Resumen'); P.tabla(['Concepto', 'Monto'], T.resumen, { columnStyles: { 1: { halign: 'right' } }, tableWidth: 140 });
      P.parrafo('Posición real = dinero con nosotros + lo que nos deben clientes - lo que falta gastar en pedidos - lo que debemos. ' + (T.t.posicion >= 0 ? 'Hoy es positiva: alcanza para cubrir lo que se debe si se cobra todo.' : 'Hoy es negativa: aunque se cobre todo no alcanza para cubrir lo que se debe.'));
      P.sec('Clientes'); P.tabla(['Cliente', 'Mesa', 'Entrega', 'Avance', 'Precio', 'Pagó', 'Debe', 'Costo est.', 'Gastado', 'Ganancia', 'Margen', 'Estado'], T.clientes.map(r => [r[0], r[1], r[4], r[5], r[7], r[8], r[9], r[10], r[11], r[13], r[14], r[15]]), { columnStyles: Object.assign(derecha([0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1]), { 1: { cellWidth: 62 } }) });
      const pend = T.clientes.filter(r => r[16]); if (pend.length) { P.sec('Datos pendientes por cliente'); P.tabla(['Cliente', 'Falta'], pend.map(r => [r[0], r[16]]), { columnStyles: { 0: { cellWidth: 45 } } }); }
      if (T.costos.length) { P.sec('Costos: estimado contra real'); P.tabla(T.costosH, T.costos, { columnStyles: derecha([0, 0, 1, 1, 1]) }); }
      P.sec('Deudas'); if (T.deudas.length) P.tabla(T.deudasH, T.deudas, { columnStyles: derecha([0, 1, 1, 1]) }); else P.parrafo('No hay deudas registradas en el panel.');
      if (T.proy.length) { P.sec('Lo que viene (proyección)'); P.parrafo('Supone que lo que falta de cada mesa se gasta 10 días antes de entregarla, que el saldo se cobra al entregar y que las deudas se pagan al vencer.'); P.tabla(T.proyH, T.proy, { columnStyles: derecha([0, 0, 1, 1]) }); }
      P.sec('Movimientos'); P.tabla(['Fecha', 'Tipo', 'Categoría', 'Cliente / deuda', 'Quién', 'Cómo', 'Nota', 'Entrada', 'Salida', 'Estado'], T.movs.map(r => r.slice(0, 10)), { columnStyles: Object.assign(derecha([0, 0, 0, 0, 0, 0, 0, 1, 1]), { 6: { cellWidth: 70 } }) });
      P.tabla(['', 'Entró', 'Salió', 'Queda'], [['Totales', T.t.ent, T.t.sal, T.t.caja]], { columnStyles: derecha([0, 1, 1, 1]), tableWidth: 120, styles: { fontStyle: 'bold', fontSize: 9 } });
      P.pie(); await bajar(P.doc.output('blob'), 'DKAS reporte general ' + hoy() + '.pdf');
    });
  }
  function pdfCliente(c) {
    return ocupado(async () => {
      const s = st(c), P = await docPDF('Estado de cuenta · ' + c.nombre, piezaTxt(c));
      P.sec('Pedido'); P.tabla(['Dato', 'Valor', 'Dato', 'Valor'], (() => { const l = [].concat(...specs(c).map(([, x]) => x)).concat([['Siguiente paso', siguiente(c, s)], ['Datos pendientes', s.pend.join(', ') || 'ninguno']]), o = []; for (let i = 0; i < l.length; i += 2) o.push([l[i][0], l[i][1], (l[i + 1] || [])[0] || '', (l[i + 1] || [])[1] || '']); return o; })(), { columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' }, 2: { cellWidth: 38, fontStyle: 'bold' } } });
      P.sec('Dinero'); P.tabla(['Precio', 'Anticipo acordado', 'Ya pagó', 'Le falta pagar', 'Costo estimado', 'Gastado', 'Falta gastar', 'Ganancia esperada', 'Margen', 'Le queda de este cliente'],
        [[s.precio || 'pendiente', s.precio ? s.antAc : '', s.ent, s.porCobrar != null ? Math.max(s.porCobrar, 0) : '', s.costo || 'pendiente', s.sal, s.porGastar != null ? s.porGastar : '', s.ganancia != null ? s.ganancia : '', pctT(s.margen), s.balance]], { columnStyles: derecha([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) });
      P.sec('Seguimiento'); P.tabla(['Paso', 'Estado', 'Fecha'], s.pasos.map(p => [p.n, p.done ? 'Hecho' : 'Pendiente', p.fecha || '']), { tableWidth: 140 });
      P.sec('Costos: estimado contra real'); P.tabla(['Concepto', 'Estimado', 'Real', 'Diferencia'], COST.map(([k, n]) => { const e = !vacio((c.costos || {})[k]) ? num(c.costos[k]) : null, r = s.real[k]; return [n, e == null ? 'pendiente' : e, r, e == null ? '' : r - e]; }), { columnStyles: derecha([0, 1, 1, 1]), tableWidth: 160 });
      P.sec('Movimientos'); if (s.ms.length) P.tabla(['Fecha', 'Tipo', 'Categoría', 'Quién', 'Cómo', 'Nota', 'Entrada', 'Salida'], s.ms.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m => [m.fecha, esIn(m) ? 'Entrada' : 'Salida', m.cat || '', quienTiene(m), m.metodo || 'sin decir', m.nota || '', esIn(m) ? num(m.monto) : '', esIn(m) ? '' : num(m.monto)]), { columnStyles: Object.assign(derecha([0, 0, 0, 0, 0, 0, 1, 1]), { 5: { cellWidth: 80 } }) }); else P.parrafo('Sin movimientos.');
      if (c.notas) { P.sec('Notas'); P.parrafo(c.notas); }
      P.pie(); await bajar(P.doc.output('blob'), 'DKAS estado de cuenta ' + c.nombre + ' ' + hoy() + '.pdf');
    });
  }

  // ---- Formato de pedido en PDF: la misma hoja de papel, llena con los datos del sistema ----
  async function imgData(src) { try { const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; }); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); return { d: cv.toDataURL('image/png'), r: img.naturalWidth / img.naturalHeight }; } catch (e) { return null; } }
  function pdfFormato(c) {
    return ocupado(async () => {
      await libPDF(); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'letter' }), W = 215.9, M = 12, s = st(c), L = await imgData('img/dkas-claro.png');
      const T = v => sinRaros(v == null ? '' : v), fD = f => f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : '';
      doc.setFillColor(22, 20, 15); doc.rect(M, 10, W - 2 * M, 24, 'F');
      if (L) doc.addImage(L.d, 'PNG', M + 6, 14, 16 * L.r, 16);
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('FORMATO DE PEDIDO', 82, 21); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text('M E S A   P E R S O N A L I Z A D A', 82, 27);
      doc.setFillColor(255); doc.rect(W - M - 52, 13, 48, 18, 'F'); doc.setTextColor(22, 20, 15); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.text('Nº PEDIDO:', W - M - 49, 20); doc.text('FECHA:', W - M - 49, 27); doc.setFont('helvetica', 'normal'); doc.text(T(c.folio || ''), W - M - 30, 20); doc.text(fD(c.fecha), W - M - 36, 27);
      let y = 40;
      const barra = (n, t) => { doc.setFillColor(22, 20, 15); doc.rect(M, y, W - 2 * M, 6.5, 'F'); doc.setFillColor(200, 196, 188); doc.rect(M, y, 8, 6.5, 'F'); doc.setTextColor(22, 20, 15); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(String(n), M + 4, y + 4.7, { align: 'center' }); doc.setTextColor(255); doc.text(T(t), M + 11, y + 4.7); doc.setTextColor(22, 20, 15); y += 11; };
      const campo = (x, w, lbl, v, yy) => { yy = yy || y; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(22, 20, 15); doc.text(T(lbl), x, yy); const lw = doc.getTextWidth(T(lbl)) + 2; doc.setDrawColor(150); doc.setLineWidth(0.2); doc.line(x + lw, yy + 0.8, x + w, yy + 0.8);
        const pend = vacio(v); doc.setFont('helvetica', pend ? 'italic' : 'bold'); doc.setTextColor(pend ? 162 : 22, pend ? 107 : 20, pend ? 0 : 15); doc.text(T(pend ? 'pendiente' : v), x + lw + 1, yy - 0.3, { maxWidth: w - lw - 2 }); doc.setTextColor(22, 20, 15); doc.setFont('helvetica', 'normal'); };
      const caja = (x, yy, lbl, on) => { doc.setDrawColor(60); doc.setLineWidth(0.3); doc.rect(x, yy - 3, 3.4, 3.4); if (on) { doc.setLineWidth(0.6); doc.line(x + 0.6, yy - 1.3, x + 1.5, yy - 0.2); doc.line(x + 1.5, yy - 0.2, x + 3, yy - 2.6); } doc.setFont('helvetica', on ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.text(T(lbl), x + 5, yy); doc.setFont('helvetica', 'normal'); };
      const fila = (opc, val, x0, ancho, extra) => { const paso = ancho / opc.length; opc.forEach((o, i) => caja(x0 + i * paso, y, o + (extra && o === val && extra[1] ? ': ' + extra[1] : ''), o === val)); };
      // 1
      barra(1, 'DATOS DEL CLIENTE');
      campo(M + 2, 105, 'Nombre:', c.nombre); campo(M + 112, W - 2 * M - 112, 'Email:', c.email || '—'); y += 7;
      campo(M + 2, 105, 'Dirección:', c.direccion || c.zona); campo(M + 112, W - 2 * M - 112, 'Vendedor:', otra(c.vendedor, c.vendedorOtro)); y += 7;
      campo(M + 2, 105, 'Teléfono:', c.telefono); campo(M + 112, W - 2 * M - 112, 'Fecha de entrega:', fD(c.entrega)); y += 9;
      // 2
      barra(2, 'TIPO Y FORMA DE MESA');
      fila(FORMAS, c.forma, M + 2, W - 2 * M - 4); y += 7;
      fila(['Comedor', 'Exterior', 'Centro', 'Lateral', 'Escritorio', 'Periquera', 'Otra'], c.tipo, M + 2, W - 2 * M - 4, ['Otra', c.tipoOtra]); y += 9;
      // 3
      barra(3, 'MEDIDAS DEL PEDIDO TERMINADO');
      const red = c.forma === 'Redonda';
      campo(M + 2, 45, red ? 'Diámetro (cm):' : 'Largo (cm):', num(c.largo) || ''); campo(M + 52, 40, 'Ancho (cm):', red ? '—' : (num(c.ancho) || '')); campo(M + 97, 40, 'Altura (cm):', num(c.altura) || ''); campo(M + 142, 40, 'Cuántas:', String(num(c.cantidad) || 1)); y += 9;
      // 4
      barra(4, 'ESPECIFICACIONES DE LA CUBIERTA');
      fila(MATERIALES, c.material, M + 2, W - 2 * M - 4, ['Otro', c.materialOtro]); y += 7;
      campo(M + 2, 92, 'Marca / Modelo:', c.marca); campo(M + 98, W - 2 * M - 98, 'Color:', otra(c.color || c.piedra, c.colorOtra)); y += 7;
      doc.text('Acabado:', M + 2, y); fila(ACABADOS, c.acabado, M + 20, 75); doc.text('Tipo de canto:', M + 100, y); fila(CANTOS, c.canto, M + 124, W - 2 * M - 124, ['Otro', c.cantoOtro]); y += 7;
      campo(M + 2, 50, 'Espesor (mm):', num(c.espesor) || ''); doc.text('Refuerzo inferior:', M + 60, y); fila(SINO, c.refuerzo, M + 88, 30); y += 7;
      campo(M + 2, W - 2 * M - 4, 'Observaciones:', c.obsCubierta || '—'); y += 9;
      // 5
      barra(5, 'DISEÑO DE LA BASE DE HERRERÍA');
      fila(BASES.slice(0, 5), c.base, M + 2, W - 2 * M - 4); y += 7; fila(BASES.slice(5), c.base, M + 2, W - 2 * M - 4, ['Otra', c.baseOtra]); y += 7;
      campo(M + 2, 92, 'Color de pintura:', c.pintura); campo(M + 98, W - 2 * M - 98, 'Tipo de pintura:', c.ptipo); y += 7;
      doc.text('Acabado:', M + 2, y); fila(ACABADOS, c.pacabado, M + 20, 75); doc.text('Niveladores:', M + 100, y); fila(SINO, c.niveladores, M + 120, 26); doc.text('Placas:', M + 150, y); fila(SINO, c.placasm, M + 162, 26); y += 7;
      campo(M + 2, W - 2 * M - 4, 'Observaciones:', c.obsBase || '—'); y += 9;
      // 6
      barra(6, 'PRECIO Y PAGOS');
      campo(M + 2, 60, 'Precio total:', s.precio ? pesosC(s.precio) : ''); campo(M + 66, 60, 'Anticipo acordado:', s.precio ? pesosC(s.antAc) : ''); campo(M + 130, W - 2 * M - 130, 'Pagado:', pesosC(s.ent)); y += 7;
      campo(M + 2, 60, 'Saldo:', s.precio ? pesosC(Math.max(s.porCobrar, 0)) : ''); campo(M + 66, W - 2 * M - 66, 'Notas:', c.notas || '—'); y += 10;
      if (s.pend.length) { doc.setFontSize(8); doc.setTextColor(162, 107, 0); doc.text(doc.splitTextToSize(T('Datos pendientes (' + s.pend.length + '): ' + s.pend.join(', ') + '.'), W - 2 * M), M + 2, y); doc.setTextColor(22, 20, 15); y += 10; }
      doc.setDrawColor(120); doc.line(M + 10, 255, M + 80, 255); doc.line(W - M - 80, 255, W - M - 10, 255); doc.setFontSize(8); doc.text('Firma del cliente', M + 45, 260, { align: 'center' }); doc.text('Firma DKAS', W - M - 45, 260, { align: 'center' });
      doc.setFontSize(7); doc.setTextColor(120); doc.text(T('Generado el ' + ymd(new Date()) + ' desde el panel DKAS · dkas.mx'), M, 270); doc.setTextColor(0);
      await bajar(doc.output('blob'), 'DKAS formato de pedido ' + (c.folio ? c.folio + ' ' : '') + c.nombre + '.pdf');
    });
  }

  window.DKAS_CUENTAS = { calc, pantalla, resumen, nav, pedirClave, catCosto, piezaTxt };
})();

;
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
  // estado de cuenta: movimientos del más viejo al más nuevo con su saldo; con saldo anterior solo si no hay filtro de tipo/categoría/búsqueda
  function estado(movs, f) {
    f = Object.assign({ tipo: '', cat: '', desde: '', hasta: '', q: '' }, f);
    const q = String(f.q || '').trim().toLowerCase(), conSaldo = !f.tipo && !f.cat && !q;
    const pasa = x => (!f.tipo || x.tipo === f.tipo) && (!f.cat || x.cat === f.cat) && (!f.desde || x.fecha >= f.desde) && (!f.hasta || x.fecha <= f.hasta) && (!q || (x.cat + ' ' + (x.nota || '') + ' ' + (x.por || '')).toLowerCase().includes(q));
    const asc = movs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.creado || 0) - (b.creado || 0));
    const saldoAnt = conSaldo && f.desde ? asc.filter(x => x.fecha < f.desde).reduce((s, x) => s + (x.tipo === 'in' ? 1 : -1) * (+x.monto || 0), 0) : 0;
    let saldo = saldoAnt; const lista = asc.filter(pasa).map(x => { saldo += (x.tipo === 'in' ? 1 : -1) * (+x.monto || 0); return Object.assign({}, x, { saldo }); });
    const T = totales(lista), porCat = t => { const o = {}; lista.filter(x => x.tipo === t).forEach(x => { o[x.cat] = (o[x.cat] || 0) + (+x.monto || 0); }); const tot = t === 'in' ? T.entro : T.salio; return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([cat, monto]) => ({ cat, monto, pct: tot ? monto / tot * 100 : 0 })); };
    return { lista, conSaldo, saldoAnt, saldoFin: saldoAnt + T.ganancia, T, catsIn: porCat('in'), catsOut: porCat('out'), desde: f.desde || (lista[0] || {}).fecha || '', hasta: f.hasta || (lista[lista.length - 1] || {}).fecha || '' };
  }
  // quién tiene el dinero hoy: lo que cada quien recibió menos lo que pagó, desde el primer movimiento.
  // Los viejos sin "quien" se leen de la nota (si dice David, es de David; si no, de Zury).
  const PERSONAS0 = ['Zury', 'David'];
  const quienDe = x => x.quien || (/david/i.test(x.nota || '') ? 'David' : 'Zury');
  function porPersona(movs) {
    const o = {}; PERSONAS0.forEach(p => { o[p] = 0; });
    movs.forEach(x => { const q = quienDe(x); o[q] = (o[q] || 0) + (x.tipo === 'in' ? 1 : -1) * (+x.monto || 0); });
    const lista = Object.entries(o).map(([quien, monto]) => ({ quien, monto }));
    return { lista, total: lista.reduce((s, x) => s + x.monto, 0) };
  }
  const calc = { CATS0, PERSONAS0, quienDe, porPersona, estado, periodo, totales, porCategoria, comparar, resumen, csv, ordenar, monto, ymd, mas };
  if (typeof module !== 'undefined' && module.exports) { module.exports = calc; return; }

  // ---------- pantalla ----------
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  let X = null, A = null, main = null, movs = [], cats = null, clientes = [], deudas = [], per = 'mes', filtro = { tipo: '', cat: '', desde: '', hasta: '', q: '' };
  const CU = () => window.DKAS_CUENTAS;
  // lo que necesita cuentas.js (clientes, deudas, exportar)
  const estadoCU = () => ({ main, X, A, movs, clientes, deudas, cargar, hoja, filaMov });
  const nomCli = id => (clientes.find(c => c.id === id) || {}).nombre || '';
  const nomDeu = id => (deudas.find(d => d.id === id) || {}).nombre || '';
  try { per = localStorage.getItem('dkas-dinero-per') || 'mes'; } catch (e) {}
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = n => (n < 0 ? '−' : '') + '$' + Math.abs(Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const corto = n => { n = Math.abs(n); return n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + ' M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + ' mil' : '$' + Math.round(n); };
  const hoy = () => ymd(new Date());
  const ultimoQuien = () => { try { return localStorage.getItem('dkas-dinero-quien') || 'Zury'; } catch (e) { return 'Zury'; } };
  const fCorta = f => { const d = dte(f), h = hoy(); return f === h ? 'Hoy' : f === mas(h, -1) ? 'Ayer' : d.getDate() + ' ' + MES3[d.getMonth()].toLowerCase() + (f.slice(0, 4) !== h.slice(0, 4) ? ' ' + f.slice(0, 4) : ''); };

  async function cargar() {
    const [m, c, cl, de] = await Promise.all([A.nodo('dinero/movs'), cats ? Promise.resolve(cats) : A.nodo('dinero/cats'), A.nodo('dinero/clientes'), A.nodo('dinero/deudas')]);
    movs = ordenar(Object.entries(m || {}).map(([id, x]) => Object.assign({ id }, x)));
    clientes = Object.entries(cl || {}).map(([id, x]) => Object.assign({ id }, x));
    deudas = Object.entries(de || {}).map(([id, x]) => Object.assign({ id }, x));
    if (!c || !c.in || !c.out) { cats = JSON.parse(JSON.stringify(CATS0)); A.nodoPon('dinero/cats', cats).catch(() => {}); } else cats = { in: Object.values(c.in), out: Object.values(c.out) };
  }
  async function pantalla(m, ctx, sub) {
    main = m; X = ctx; A = ctx.A;
    if (!$('.dn')) main.innerHTML = '<div class="dn"><p class="cargando">Cargando…</p></div>';
    try { await cargar(); } catch (e) { main.innerHTML = '<div class="dn"><h1>Dinero</h1><p class="err">No se pudo cargar: ' + esc(e.message) + '</p></div>'; return; }
    if (sub === 'todos') todos(); else if (sub && CU()) CU().pantalla(sub, estadoCU()); else tablero();
  }
  const filaMov = x => '<button class="dn-mov ' + x.tipo + '" data-mov="' + esc(x.id) + '"><i aria-hidden="true">' + (x.tipo === 'in' ? '＋' : '−') + '</i><span><b>' + (x.revisar ? '<em class="cu-pill a">aclarar</em> ' : '') + esc(x.cat) + (x.cliente ? ' · ' + esc(nomCli(x.cliente)) : x.deuda ? ' · deuda ' + esc(nomDeu(x.deuda)) : '') + '</b>' + '<small>' + esc(quienDe(x)) + (x.metodo ? ' · ' + esc(x.metodo) : '') + (x.nota ? ' · ' + esc(x.nota) : '') + '</small>' + '</span><em>' + (x.tipo === 'in' ? '+' : '−') + pesos(x.monto) + '<small>' + fCorta(x.fecha) + '</small></em></button>';
  const botonRegistrar = () => '<button class="dn-reg" id="dn-reg"><span>＋</span> Registrar</button>';

  function tablero() {
    const R = resumen(movs, per, hoy()), T = R.T, c = R.cmp;
    const cmpTxt = !movs.length ? '' : c.pct != null && c.pct !== 0 ? 'Guardado ' + (c.pct > 0 ? '↑ ' : '↓ ') + Math.abs(c.pct) + '% vs. ' + R.P.vs
      : c.dif === 0 ? 'Igual que ' + R.P.vs : 'Guardado ' + (c.dif > 0 ? '↑ ' : '↓ ') + pesos(Math.abs(c.dif)) + ' vs. ' + R.P.vs;
    const tramo = R.P.enCurso && R.P.aCorte !== R.P.aFin ? ' (mismos días)' : '';
    main.innerHTML = '<div class="dn">' + (CU() ? CU().nav('') : '')
      + '<div class="dn-per" role="tablist">' + [['semana', 'Esta semana'], ['mes', 'Este mes'], ['anio', 'Este año']].map(([k, t]) => '<button role="tab" data-per="' + k + '"' + (per === k ? ' class="on" aria-selected="true"' : '') + '>' + t + '</button>').join('') + '</div>'
      + (() => { const Q = porPersona(movs); return '<section class="dn-hero dn-hoy"><p class="dn-k">Dinero con nosotros hoy</p><p class="dn-g' + (Q.total < 0 ? ' neg' : '') + '">' + pesos(Q.total) + '</p>'
        + '<div class="dn-quien">' + Q.lista.map(p => '<div' + (p.monto < 0 ? ' class="neg"' : '') + '><span>' + esc(p.quien) + '</span><b>' + pesos(Math.abs(p.monto)) + '</b><small>' + (p.monto < 0 ? 'puso de su bolsa' : 'lo tiene') + '</small></div>').join('') + '</div>'
        + '<p class="dn-nota">Es dinero de anticipos y pagos de clientes. <b>No es ganancia todavía:</b> primero hay que terminar y pagar las mesas que están en proceso.</p></section>'; })()
      + '<section class="dn-dos"><div class="dn-c in"><p class="dn-k">Cobramos</p><b>' + pesos(T.entro) + '</b><small>lo que pagaron los clientes</small></div><div class="dn-c out"><p class="dn-k">Gastamos</p><b>' + pesos(T.salio) + '</b><small>placas, herrería, fletes y más</small></div>'
      + '<p class="dn-sob">' + (T.ganancia < 0 ? 'Este periodo se gastó <b class="r">' + pesos(-T.ganancia) + '</b> más de lo que se cobró' : 'Este periodo sobraron <b>' + pesos(T.ganancia) + '</b>') + (cmpTxt ? ' · <span class="dn-cmp ' + (c.mejor ? 'ok' : 'mal') + '">' + cmpTxt + tramo + '</span>' : '') + '</p></section>'
      + (CU() ? CU().resumen(estadoCU()) : '')
      + '<section class="dn-sec"><div class="dn-sec-c"><h3>' + (per === 'anio' ? 'Por mes' : per === 'mes' ? 'Por semana' : 'Por día') + '</h3><p class="dn-ley"><i class="v"></i>Entró <i class="r"></i>Salió</p></div>' + grafica(R.barras) + '<p class="dn-tip" id="dn-tip">Toca una barra para ver la cantidad.</p></section>'
      + '<section class="dn-sec"><h3>En qué se va el dinero</h3>' + (R.cats.length ? '<div class="dn-cats">' + R.cats.map(k => '<div><span>' + esc(k.cat) + '</span><i><em style="width:' + Math.max(1.5, k.pct) + '%"></em></i><b>' + Math.round(k.pct) + '%</b><small>' + pesos(k.monto) + '</small></div>').join('') + '</div>' : '<p class="sub">Todavía no hay salidas en este periodo.</p>') + '</section>'
      + '<section class="dn-sec"><div class="dn-sec-c"><h3>Últimos movimientos</h3>' + (movs.length ? '<a href="#dinero/todos" class="lnk">Ver todos</a>' : '') + '</div>'
      + (movs.length ? '<div class="dn-lista">' + movs.slice(0, 5).map(filaMov).join('') + '</div>' : '<p class="sub">Aún no hay movimientos. Toca <b>＋ Registrar</b> para anotar el primero.</p>') + '</section>'
      + botonRegistrar() + '</div>';
    $$('[data-per]').forEach(b => b.onclick = () => { per = b.dataset.per; try { localStorage.setItem('dkas-dinero-per', per); } catch (e) {} tablero(); });
    $$('.dn-bar').forEach(g => g.onclick = () => { $$('.dn-bar').forEach(o => o.classList.toggle('on', o === g)); const b = R.barras[+g.dataset.i]; $('#dn-tip').innerHTML = '<b>' + esc(etiquetaBarra(b)) + '</b>: entró <b class="v">' + pesos(b.entro) + '</b> · salió <b class="r">' + pesos(b.salio) + '</b> · quedó <b>' + pesos(b.ganancia) + '</b>'; });
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
    main.innerHTML = '<div class="dn">' + (CU() ? CU().nav('todos') : '<a href="#dinero" class="volver">← Dinero</a>') + '<div class="dn-sec-c"><h1>Movimientos</h1></div><div class="dn-exp"><button class="btn negro" id="dn-pdf">Estado de cuenta (PDF)</button><button class="btn" id="dn-csv">Exportar a Excel</button></div>'
      + '<div class="dn-fil"><div class="dn-per">' + [['', 'Todo'], ['in', 'Entró'], ['out', 'Salió']].map(([k, t]) => '<button data-ft="' + k + '"' + (filtro.tipo === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div>'
      + '<input id="dn-q" type="search" placeholder="Buscar nota o categoría" value="' + esc(filtro.q) + '">'
      + '<select id="dn-fc"><option value="">Todas las categorías</option>' + usadas.map(c => '<option' + (filtro.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>'
      + '<div class="dn-rap">' + [['mes', 'Este mes'], ['ant', 'Mes pasado'], ['anio', 'Este año'], ['todo', 'Todo']].map(([k, t]) => '<button data-rap="' + k + '">' + t + '</button>').join('') + '</div>'
      + '<label>Desde<input type="date" id="dn-fd" value="' + filtro.desde + '"></label><label>Hasta<input type="date" id="dn-fh" value="' + filtro.hasta + '"></label></div>'
      + '<p class="dn-tot" id="dn-tot"></p><div class="dn-lista" id="dn-todos"></div>' + botonRegistrar() + '</div>';
    const pintar = () => { const l = filtrados(), t = totales(l); $('#dn-tot').innerHTML = l.length + (l.length === 1 ? ' movimiento' : ' movimientos') + ' · entró <b class="v">' + pesos(t.entro) + '</b> · salió <b class="r">' + pesos(t.salio) + '</b> · quedó <b>' + pesos(t.ganancia) + '</b>'; $('#dn-todos').innerHTML = l.length ? l.map(filaMov).join('') : '<p class="sub">Nada con estos filtros.</p>'; };
    $$('[data-ft]').forEach(b => b.onclick = () => { filtro.tipo = b.dataset.ft; $$('[data-ft]').forEach(o => o.classList.toggle('on', o === b)); pintar(); });
    $('#dn-q').oninput = e => { filtro.q = e.target.value; pintar(); };
    $('#dn-fc').onchange = e => { filtro.cat = e.target.value; pintar(); };
    $('#dn-fd').onchange = e => { filtro.desde = e.target.value; pintar(); };
    $('#dn-fh').onchange = e => { filtro.hasta = e.target.value; pintar(); };
    $('#dn-csv').onclick = () => exportar(filtrados());
    $('#dn-pdf').onclick = () => estadoPDF();
    $$('[data-rap]').forEach(b => b.onclick = () => { const h = hoy(), d = dte(h), k = b.dataset.rap, pm = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12);
      [filtro.desde, filtro.hasta] = k === 'mes' ? [h.slice(0, 8) + '01', h] : k === 'ant' ? [ymd(pm), ymd(new Date(d.getFullYear(), d.getMonth(), 0, 12))] : k === 'anio' ? [h.slice(0, 5) + '01-01', h] : ['', ''];
      $('#dn-fd').value = filtro.desde; $('#dn-fh').value = filtro.hasta; pintar(); });
    pintar(); enlazar();
  }
  async function exportar(l) {
    if (!l.length) return X.alerta('No hay movimientos para exportar.');
    const nombre = 'DKAS dinero ' + hoy() + '.csv', blob = new Blob([csv(l)], { type: 'text/csv;charset=utf-8' });
    try { const f = new File([blob], nombre, { type: 'text/csv' }); if (navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: nombre }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    X.toast('Listo: ' + nombre);
  }
  const fLarga = f => { const d = dte(f); return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear(); };
  function estadoPDF() {
    const E = estado(movs, filtro);
    if (!E.lista.length) return X.alerta('No hay movimientos con estos filtros.');
    const ahora = new Date(), quien = ((X.me && X.me()) || {}).nombre || '';
    const filtros = [filtro.tipo ? (filtro.tipo === 'in' ? 'solo entradas' : 'solo salidas') : '', filtro.cat ? 'categoría ' + filtro.cat : '', filtro.q.trim() ? 'búsqueda «' + filtro.q.trim() + '»' : ''].filter(Boolean);
    const tablaCat = (t, l, tot) => '<table class="ec-cat"><thead><tr><th>' + t + '</th><th>Monto</th><th>%</th></tr></thead><tbody>' + (l.length ? l.map(c => '<tr><td>' + esc(c.cat) + '</td><td>' + pesos(c.monto) + '</td><td>' + c.pct.toFixed(1) + '%</td></tr>').join('') : '<tr><td colspan="3" class="ec-n">Sin movimientos</td></tr>') + '</tbody><tfoot><tr><td>Total</td><td>' + pesos(tot) + '</td><td>' + (l.length ? '100%' : '') + '</td></tr></tfoot></table>';
    const caja = (t, v, cl) => '<div class="ec-k' + (cl ? ' ' + cl : '') + '"><span>' + t + '</span><b>' + v + '</b></div>';
    const html = '<header class="ec-h"><img src="img/dkas-oscuro.png" alt="DKAS"><div><h1>Estado de cuenta</h1><p>' + (E.desde ? 'Del ' + fLarga(E.desde) + ' al ' + fLarga(E.hasta) : 'Sin movimientos') + '</p>'
      + (filtros.length ? '<p class="ec-f">Filtrado: ' + esc(filtros.join(' · ')) + '</p>' : '') + '</div></header>'
      + '<section class="ec-res">' + (E.conSaldo ? caja('Saldo anterior', pesos(E.saldoAnt)) : '') + caja('Entradas', pesos(E.T.entro), 'v') + caja('Salidas', pesos(E.T.salio), 'r') + caja('Resultado del periodo', pesos(E.T.ganancia)) + (E.conSaldo ? caja('Saldo final', pesos(E.saldoFin), 'fin') : '') + '</section>'
      + '<section class="ec-cats">' + tablaCat('Entradas por categoría', E.catsIn, E.T.entro) + tablaCat('Salidas por categoría', E.catsOut, E.T.salio) + '</section>'
      + '<h2>Detalle de movimientos <small>(' + E.lista.length + ')</small></h2><table class="ec-det"><thead><tr><th>#</th><th>Fecha</th><th>Categoría</th><th>Nota</th><th>Registró</th><th>Entrada</th><th>Salida</th>' + (E.conSaldo ? '<th>Saldo</th>' : '') + '</tr></thead><tbody>'
      + (E.conSaldo && filtro.desde ? '<tr class="ec-ant"><td></td><td>' + fCortaPDF(filtro.desde) + '</td><td colspan="5">Saldo anterior</td><td>' + pesos(E.saldoAnt) + '</td></tr>' : '')
      + E.lista.map((x, i) => '<tr><td>' + (i + 1) + '</td><td>' + fCortaPDF(x.fecha) + '</td><td>' + esc(x.cat) + '</td><td>' + esc(x.nota || '') + '</td><td>' + esc(x.por || '') + '</td><td class="v">' + (x.tipo === 'in' ? pesos(x.monto) : '') + '</td><td class="r">' + (x.tipo === 'out' ? pesos(x.monto) : '') + '</td>' + (E.conSaldo ? '<td>' + pesos(x.saldo) + '</td>' : '') + '</tr>').join('')
      + '</tbody><tfoot><tr><td colspan="5">Totales</td><td>' + pesos(E.T.entro) + '</td><td>' + pesos(E.T.salio) + '</td>' + (E.conSaldo ? '<td>' + pesos(E.saldoFin) + '</td>' : '') + '</tr></tfoot></table>'
      + '<footer class="ec-pie">Generado el ' + fLarga(ymd(ahora)) + ' a las ' + p2(ahora.getHours()) + ':' + p2(ahora.getMinutes()) + (quien ? ' por ' + esc(quien) : '') + ' desde el panel DKAS. Montos en pesos mexicanos (MXN). Solo incluye lo registrado en el panel.</footer>';
    let d = document.getElementById('dn-ec'); if (!d) { d = document.createElement('div'); d.id = 'dn-ec'; document.body.appendChild(d); }
    d.innerHTML = html;
    const titulo = document.title; document.title = 'DKAS estado de cuenta ' + (E.desde ? E.desde + ' a ' + E.hasta : hoy());
    document.body.classList.add('dn-imprime');
    // la hoja solo se ve al imprimir (#dn-ec está oculto en pantalla), así que se queda lista hasta que se salga de Movimientos
    const fin = () => { document.body.classList.remove('dn-imprime'); document.title = titulo; removeEventListener('afterprint', fin); removeEventListener('hashchange', fin); };
    addEventListener('afterprint', fin); addEventListener('hashchange', fin);
    const img = d.querySelector('img'); const ir = () => setTimeout(() => print(), 60);
    if (img.complete) ir(); else { img.onload = img.onerror = ir; }
  }
  const fCortaPDF = f => { const d = dte(f); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear(); };
  function enlazar() {
    $('#dn-reg').onclick = () => hoja();
    $$('[data-mov]').forEach(b => b.onclick = () => hoja(movs.find(x => x.id === b.dataset.mov)));
  }
  const repintar = () => { const sub = location.hash.slice(8); if (sub === 'todos') todos(); else if (sub && CU()) CU().pantalla(sub, estadoCU()); else tablero(); };

  // ---------- registrar / editar: tipo → cantidad → categoría → (nota, fecha) → Guardar ----------
  function hoja(ed, pre) {
    pre = pre || {};
    const destinoDe = x => x.cliente ? 'c:' + x.cliente : x.deuda ? 'd:' + x.deuda : x.revisar ? '' : 'g';
    const d = ed ? { tipo: ed.tipo, monto: String(ed.monto), cat: ed.cat, nota: ed.nota || '', fecha: ed.fecha, quien: quienDe(ed), metodo: ed.metodo || '', destino: destinoDe(ed) }
      : { tipo: pre.tipo || '', monto: '', cat: '', nota: '', fecha: hoy(), quien: ultimoQuien(), metodo: '', destino: pre.cliente ? 'c:' + pre.cliente : '' };
    const gente = [...new Set(PERSONAS0.concat(movs.map(quienDe)))];
    const destinos = [['g', 'General (sin cliente)']].concat(clientes.filter(c => !c.cerrado || 'c:' + c.id === d.destino).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(c => ['c:' + c.id, c.nombre]), deudas.map(x => ['d:' + x.id, 'Deuda: ' + x.nombre]));
    const cap = document.createElement('div'); cap.className = 'dn-capa'; document.body.appendChild(cap); document.body.classList.add('dn-sin-scroll');
    const cerrar = () => { cap.remove(); document.body.classList.remove('dn-sin-scroll'); };
    cap.onclick = e => { if (e.target === cap) cerrar(); };
    // todo es obligatorio menos la nota: no se guarda hasta que esté completo
    const falta = () => [!monto(d.monto) && 'cantidad', !d.cat && 'categoría', !d.destino && 'de qué cliente', !d.quien && (d.tipo === 'in' ? 'quién lo recibió' : 'quién lo pagó'), !d.metodo && 'cómo', !d.fecha && 'fecha'].filter(Boolean);
    const pintar = foco => {
      const extra = d.tipo === 'out' && /^d:/.test(d.destino) ? ['Pago de deuda'] : [];
      const lista = d.tipo ? [...new Set(cats[d.tipo].concat(extra, d.cat ? [d.cat] : []))] : [];
      const f = d.tipo ? falta() : [];
      cap.innerHTML = '<div class="dn-hoja" role="dialog" aria-label="' + (ed ? 'Editar movimiento' : 'Registrar') + '"><div class="dn-hoja-c"><h2>' + (ed ? 'Editar movimiento' : 'Registrar') + '</h2><button class="dn-x" aria-label="Cerrar">✕</button></div>'
        + (ed && ed.revisar ? '<p class="cu-aviso">Este movimiento está por aclarar. Complétalo y guárdalo para quitarle la marca.</p>' : '')
        + '<div class="dn-tipo"><button data-t="in" class="in' + (d.tipo === 'in' ? ' on' : '') + '">🟢 Entró dinero</button><button data-t="out" class="out' + (d.tipo === 'out' ? ' on' : '') + '">🔴 Salió dinero</button></div>'
        + (d.tipo ? '<label class="dn-cant">Cantidad<span><i>$</i><input id="dn-m" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0" value="' + esc(d.monto) + '"></span></label>'
          + '<div class="dn-chips-c"><p class="dn-k">¿De qué cliente?</p><a class="lnk gris" href="#dinero/nuevo" id="dn-nc">＋ Cliente nuevo</a></div><div class="dn-chips dn-d">' + destinos.map(([k, t]) => '<button data-d="' + esc(k) + '"' + (d.destino === k ? ' class="on"' : '') + '>' + esc(t) + '</button>').join('') + '</div>'
          + '<div class="dn-chips-c"><p class="dn-k">Categoría</p><button class="lnk gris" id="dn-ec">Editar</button></div><div class="dn-chips">' + lista.map(c => '<button data-c="' + esc(c) + '"' + (d.cat === c ? ' class="on"' : '') + '>' + esc(c) + '</button>').join('') + '</div>'
          + '<div class="dn-chips-c"><p class="dn-k">' + (d.tipo === 'in' ? '¿Quién lo recibió?' : '¿Quién lo pagó?') + '</p></div><div class="dn-chips dn-q">' + gente.map(q => '<button data-q="' + esc(q) + '"' + (d.quien === q ? ' class="on"' : '') + '>' + esc(q) + '</button>').join('') + '</div>'
          + '<div class="dn-chips-c"><p class="dn-k">' + (d.tipo === 'in' ? '¿Cómo pagó?' : '¿Con qué se pagó?') + '</p></div><div class="dn-chips dn-me">' + ['Efectivo', 'Transferencia', 'Tarjeta'].map(q => '<button data-me="' + q + '"' + (d.metodo === q ? ' class="on"' : '') + '>' + q + '</button>').join('') + '</div>'
          + '<div class="dn-mas"><label>Nota (opcional)<input id="dn-n" maxlength="80" placeholder="ej. flete de ida" value="' + esc(d.nota) + '"></label><label>Fecha<input id="dn-f" type="date" value="' + d.fecha + '" max="' + mas(hoy(), 366) + '"></label></div>'
          + '<p class="cu-falta" id="dn-falta"' + (f.length ? '' : ' hidden') + '>Falta: ' + esc(f.join(', ')) + '</p>'
          + '<button class="btn negro grande" id="dn-g"' + (f.length ? ' disabled' : '') + '>Guardar</button>' + (ed ? '<button class="dn-borrar" id="dn-b">Borrar este movimiento</button>' : '')
          : '<p class="sub dn-hint">¿Entró o salió dinero?</p>') + '</div>';
      $('.dn-x', cap).onclick = cerrar;
      $$('[data-t]', cap).forEach(b => b.onclick = () => { if (d.tipo !== b.dataset.t) { d.tipo = b.dataset.t; if (!cats[d.tipo].includes(d.cat)) d.cat = ''; } pintar('m'); });
      if (!d.tipo) return;
      const m = $('#dn-m', cap), g = $('#dn-g', cap), listo = () => { const f2 = falta(); g.disabled = f2.length > 0; const fe = $('#dn-falta', cap); fe.hidden = !f2.length; fe.textContent = 'Falta: ' + f2.join(', '); };
      const elegir = (sel, campo, alElegir) => $$('[' + sel + ']', cap).forEach(b => b.onclick = () => { d[campo] = b.getAttribute(sel); $$('[' + sel + ']', cap).forEach(o => o.classList.toggle('on', o === b)); m.blur(); if (alElegir) alElegir(); listo(); });
      m.oninput = () => { d.monto = m.value.replace(/[^\d.,]/g, ''); if (m.value !== d.monto) m.value = d.monto; listo(); };
      m.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); m.blur(); } };
      elegir('data-c', 'cat'); elegir('data-q', 'quien'); elegir('data-me', 'metodo');
      elegir('data-d', 'destino', () => { if (d.tipo === 'out' && /^d:/.test(d.destino) && !d.cat) d.cat = 'Pago de deuda'; if (d.tipo === 'out' && /^d:/.test(d.destino)) pintar(); });
      $('#dn-nc', cap).onclick = () => cerrar();
      $('#dn-n', cap).oninput = e => { d.nota = e.target.value; };
      $('#dn-f', cap).onchange = e => { d.fecha = e.target.value; listo(); };
      $('#dn-ec', cap).onclick = () => editarCats(d.tipo, ren => { if (ren[d.cat]) d.cat = ren[d.cat]; pintar(); });
      g.onclick = async () => {
        if (falta().length) return listo();
        const x = { tipo: d.tipo, monto: monto(d.monto), cat: d.cat.slice(0, 30), fecha: d.fecha, quien: (d.quien || 'Zury').slice(0, 30), metodo: d.metodo, cliente: /^c:/.test(d.destino) ? d.destino.slice(2) : null, deuda: /^d:/.test(d.destino) ? d.destino.slice(2) : null };
        try { localStorage.setItem('dkas-dinero-quien', x.quien); } catch (e) {} const nota = d.nota.trim().slice(0, 80);
        if (!/^20\d\d-\d\d-\d\d$/.test(x.fecha)) return X.alerta('Revisa la fecha.');
        const dest = (destinos.find(([k]) => k === d.destino) || [, ''])[1];
        if (CU() && !await CU().pedirClave((ed ? 'Guardar cambios: ' : '') + (x.tipo === 'in' ? 'Entró dinero' : 'Salió dinero'), [['Cantidad', pesos(x.monto)], ['Cliente', dest], ['Categoría', x.cat], [x.tipo === 'in' ? 'Lo recibió' : 'Lo pagó', x.quien], ['Cómo', x.metodo], ['Fecha', fCorta(x.fecha)], ['Nota', nota || '—']])) return;
        g.disabled = true; g.textContent = 'Guardando…';
        try {
          if (ed) await A.nodoCambia('dinero/movs/' + ed.id, Object.assign(x, { nota: nota || null, revisar: null }));
          else { if (!x.cliente) delete x.cliente; if (!x.deuda) delete x.deuda; await A.nodoAgrega('dinero/movs', nota ? Object.assign(x, { nota }) : x); }
          cerrar(); X.toast((d.tipo === 'in' ? 'Entrada' : 'Salida') + ' de ' + pesos(x.monto) + ' guardada'); await cargar(); repintar();
        } catch (e) { g.disabled = false; g.textContent = 'Guardar'; X.alerta(e.message); }
      };
      if (ed) $('#dn-b', cap).onclick = async () => {
        if (CU() && !await CU().pedirClave('Borrar movimiento', [['Movimiento', (ed.tipo === 'in' ? 'Entrada' : 'Salida') + ' de ' + pesos(ed.monto)], ['Categoría', ed.cat], ['Fecha', fCorta(ed.fecha)], ['Ojo', 'no se puede deshacer']])) return;
        try { await A.nodoBorra('dinero/movs/' + ed.id); cerrar(); X.toast('Movimiento borrado'); await cargar(); repintar(); } catch (e) { X.alerta(e.message); }
      };
      if (foco === 'm' && !d.monto) setTimeout(() => m.focus(), 30);
    };
    pintar(ed || d.tipo ? null : '');
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

/* DKAS · Admin nuevo · núcleo de cuentas (sin pantalla; también corre en Node para las pruebas).
   Todo se conecta aquí: clientes → pedidos → movimientos → fondos (de qué dinero sale cada gasto) → deudas/prestamistas
   → agenda → "lo que no cuadra" → sobrantes de piedra.
   Datos en Firebase (dinero/…):
     clientes/<id>  { nombre, telefono, email, direccion, notas }
     pedidos/<id>   { folio, cliente, fecha, entrega, vendedor, forma, tipo, largo, ancho, cantidad, altura, material, marca, color,
                      acabado, canto, espesor, refuerzo, obsCubierta, base, pintura, pacabado, ptipo, niveladores, placasm, obsBase,
                      precio, anticipo, costos{placa,base,mdf,flete,entrega,material,otros}, pasos{placa,base,armado,entregado}, pend{}, notas, cerrado,
                      fallas{<id>:{fecha, motivo, paga, nota, creado}} }  (falla técnica: el pedido se repone; lo gastado antes queda como pérdida)
     deudas/<id>    { nombre, tipo:'prestamo'|'proveedor'|'otro', inicial, vence, telefono, notas }   (a quién se le debe)
     movs/<id>      { tipo:'in'|'out', monto, cat, fecha, quien, metodo, nota, pedido, deuda, fondo, revisar }
                    in  + pedido = pago de un cliente · in + deuda = préstamo que nos dieron · in solo = otro ingreso
                    out + pedido = gasto de esa mesa · out + deuda = pago a esa deuda · out solo = gasto general
                    fondo (de qué dinero sale un out): 'p:<pedido>' dinero de ese cliente · 'd:<deuda>' dinero que prestó · 'caja' · 'pd:<deuda>' lo pagó él directo (sube la deuda)
     sobrantes/<id> { piedra, w, h, pedido, fecha, estado:'disponible'|'usado', usadoEn, nota }
     agenda/<id>    { fecha, texto, hecho, pedido }
     bitacora/<id>  { accion, detalle, por, creado } */
(function (root) {
  const p2 = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const dte = s => new Date(s + 'T12:00:00');
  const mas = (s, n) => { const d = dte(s); d.setDate(d.getDate() + n); return ymd(d); };
  const entre = (a, b) => Math.round((dte(b) - dte(a)) / 864e5);
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  const vacio = v => v === undefined || v === null || v === '';
  const pesos = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-MX');
  const pct = n => n == null || !isFinite(n) ? '—' : Math.round(n * 100) + '%';
  const esIn = m => m.tipo === 'in';

  // ---------- catálogos (los de la hoja de papel "Formato de pedido") ----------
  const COST = [['placa', 'Placa / piedra'], ['base', 'Base (herrería)'], ['corte', 'Corte / canto (ala de avión)'], ['mdf', 'MDF y demás'], ['flete', 'Fletes'], ['entrega', 'Entrega / gasolina'], ['material', 'Tornillos, pegamento, discos'], ['otros', 'Otros']];
  const C = {
    FORMAS: ['Rectangular', 'Cuadrada', 'Redonda', 'Ovalada', 'Irregular'],
    TIPOS: ['Comedor', 'Exterior', 'Centro', 'Lateral', 'Escritorio', 'Periquera', 'Otra'],
    MATERIALES: ['Piedra sinterizada', 'Mármol', 'Granito', 'Cuarzo', 'Otro'],
    PIEDRAS: ['Taj Mahal', 'Mont Blanc', 'Statuario', 'Peacock', 'Cardenaskin', 'Classic Bulgar', 'Bulgaria Dark Grey', 'Saloran Grey', 'Travertine', 'Pure White', 'Limestone', 'Otra'],
    ACABADOS: ['Mate', 'Brillante', 'Texturizado'], CANTOS: ['Recto', 'Biselado', 'Ala de avión', 'Otro'], SINO: ['Sí', 'No'],
    BASES: ['Patas rectas', 'En U', 'En X', 'Patas inclinadas', 'Pedestal central', 'Doble pedestal', 'Geométrica', 'Circular', 'Tipo araña', 'Otra'],
    METODOS: ['Efectivo', 'Transferencia', 'Tarjeta'],
    FALLAS: ['Se rompió en el flete', 'Se rompió en el taller', 'Se rompió al instalar', 'Defecto de la placa', 'Error de medidas', 'Otro'],
    PAGA: ['Nosotros', 'El transportista', 'El proveedor', 'El herrero', 'Por definir'],
    GASTO_PEDIDO: ['Placa', 'Base', 'Corte ala de avión', 'MDF', 'Flete', 'Entrega', 'Material', 'Otro'],
    GASTO_GENERAL: ['Renta', 'Sueldo', 'Gasolina', 'Comisión', 'Herramienta', 'Otro'],
    PASOS: [['pedido', 'Pedido confirmado'], ['anticipo', 'Anticipo recibido'], ['placa', 'Placa comprada'], ['base', 'Base hecha'], ['armado', 'Armada y lista'], ['entregado', 'Entregada'], ['liquidado', 'Liquidada']]
  };
  // lo que el sistema pide en el alta (paso del asistente, campo, etiqueta); si no se tiene se marca "No lo tengo aún" y queda pendiente
  const CAMPOS = [
    [0, 'telefono', 'Teléfono'], [0, 'direccion', 'Dirección'],
    [1, 'vendedor', 'Vendedor'], [1, 'fecha', 'Fecha del pedido'], [1, 'entrega', 'Fecha de entrega'],
    [2, 'forma', 'Forma'], [2, 'tipo', 'Tipo de mesa'], [2, 'medidas', 'Largo y ancho'], [2, 'altura', 'Altura'],
    [3, 'material', 'Tipo de cubierta'], [3, 'marca', 'Marca / proveedor'], [3, 'color', 'Color de la piedra'], [3, 'acabado', 'Acabado'], [3, 'canto', 'Tipo de canto'], [3, 'espesor', 'Espesor'], [3, 'refuerzo', 'Refuerzo inferior'],
    [4, 'base', 'Diseño de la base'], [4, 'pintura', 'Color de pintura'], [4, 'pacabado', 'Acabado de pintura'], [4, 'ptipo', 'Tipo de pintura'], [4, 'niveladores', 'Niveladores'], [4, 'placasm', 'Placas de montaje'],
    [5, 'precio', 'Precio de venta'], [5, 'anticipo', 'Anticipo acordado'],
    [6, 'c.placa', 'Costo de la placa'], [6, 'c.base', 'Costo de la base'], [6, 'c.mdf', 'Costo del MDF'], [6, 'c.flete', 'Costo de fletes'], [6, 'c.entrega', 'Costo de entrega'], [6, 'c.material', 'Costo de material']];
  function lleno(o, k) {
    if (k === 'medidas') return num(o.largo) > 0 && (o.forma === 'Redonda' || num(o.ancho) > 0);
    if (k === 'precio' || k === 'altura' || k === 'espesor') return num(o[k]) > 0;
    if (k.slice(0, 2) === 'c.') return !vacio((o.costos || {})[k.slice(2)]);
    return !vacio(o[k]);
  }
  // pendientes de un pedido (incluye los datos de su cliente)
  const pendientes = (p, cli) => CAMPOS.filter(([, k]) => !lleno(['telefono', 'direccion'].includes(k) ? (cli || {}) : p, k)).map(x => x[2]);

  // placa 3.20×1.60 = $9,000 + $500 de corte; MDF $650; base de comedor $6,000–7,000; flete $2,000 si no cabe en la minivan; regla de precio ×1.6
  const PLACA = { w: 320, h: 160, precio: 9000, corte: 500 }, REGLA = 1.6, PRECIOS = { alaDeAvion: 3500, mdfYDemas: 1500 };
  function fraccionPlaca(L, W) { const a = Math.max(L, W), b = Math.min(L, W); if (!a || !b) return 0; if (a <= 80 && b <= 80) return 0.25; if ((a <= 160 && b <= 160) || (a <= 320 && b <= 80)) return 0.5; if (a <= 320 && b <= 160) return 1; return Math.ceil(a * b / (320 * 160) * 1.15); }
  function costosSugeridos(p) {
    const L = num(p.largo), W = p.forma === 'Redonda' ? num(p.largo) : num(p.ancho), q = Math.max(1, num(p.cantidad) || 1), f = fraccionPlaca(L, W), grande = Math.max(L, W) >= 140 || p.tipo === 'Comedor';
    const base = p.tipo === 'Comedor' ? (Math.max(L, W) >= 240 ? 7000 : 6000) : p.tipo === 'Periquera' ? 3000 : p.tipo === 'Escritorio' ? 3500 : 1500;
    return { placa: Math.round(f * PLACA.precio + PLACA.corte) * q, base: base * q, corte: (p.canto === 'Ala de avión' ? PRECIOS.alaDeAvion : 0) * q, mdf: (grande ? PRECIOS.mdfYDemas : 0) * q, flete: grande ? 2000 : 0, entrega: grande ? 0 : 300, material: grande ? 0 : 300 * q, otros: 0, fraccion: f };
  }
  // a qué costo va un gasto (por su categoría y, si no, por la nota)
  function catCosto(m) {
    const prueba = s => [[/ala de avi|corte|canto/i, 'corte'], [/placa|piedra|quarmol/i, 'placa'], [/base|herrer|acero|enrique|soldad/i, 'base'], [/mdf/i, 'mdf'], [/flete/i, 'flete'], [/entrega|gasolina/i, 'entrega'], [/tornill|pegamento|disco|pintura|material/i, 'material']].find(([r]) => r.test(s));
    const r = prueba(m.cat || '') || prueba((m.cat || '') + ' ' + (m.nota || '')); return r ? r[1] : 'otros';
  }
  // sobrantes que deja una pieza rectangular cortada de una placa entera (dos cortes de lado a lado)
  function sobrantesDe(L, W, placa) {
    placa = placa || PLACA; let a = Math.max(L, W), b = Math.min(L, W); if (!a || !b || a > placa.w || b > placa.h) return [];
    const out = []; if (placa.w - a >= 15) out.push({ w: placa.w - a, h: placa.h }); if (placa.h - b >= 15) out.push({ w: a, h: placa.h - b });
    return out;
  }
  // cuántas piezas de w×h caben en un sobrante (cortes rectos, con 0.5 cm de disco)
  function cuantasCaben(sw, sh, w, h, kerf) {
    kerf = kerf == null ? 0.5 : kerf; const f = (A, B, a, b) => Math.floor((A + kerf) / (a + kerf)) * Math.floor((B + kerf) / (b + kerf));
    return Math.max(f(sw, sh, w, h), f(sw, sh, h, w));
  }

  // ---------- el modelo armado: todo conectado ----------
  function modelo(d, hoy) {
    const lista = o => Object.entries(o || {}).map(([id, x]) => Object.assign({ id }, x));
    const M = { hoy, clientes: lista(d.clientes), pedidos: lista(d.pedidos), deudas: lista(d.deudas), movs: lista(d.movs), sobrantes: lista(d.sobrantes), agendaMan: lista(d.agenda) };
    M.movs.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.creado || 0) - (b.creado || 0));
    M.cli = id => M.clientes.find(c => c.id === id);
    M.ped = id => M.pedidos.find(p => p.id === id);
    M.deu = id => M.deudas.find(x => x.id === id);
    const nomP = p => p ? ((M.cli(p.cliente) || {}).nombre || 'Sin cliente') + (p.folio ? ' #' + p.folio : '') : '';
    M.nomPed = id => nomP(M.ped(id));
    // fondos: cada pedido, cada préstamo y la caja general
    M.fondoDe = m => m.fondo || null;
    M.nomFondo = f => !f ? 'sin decir' : f === 'caja' ? 'Caja general' : f.slice(0, 2) === 'p:' ? 'Dinero de ' + M.nomPed(f.slice(2)) : f.slice(0, 3) === 'pd:' ? 'Lo pagó directo ' + ((M.deu(f.slice(3)) || {}).nombre || '') : f.slice(0, 2) === 'd:' ? 'Préstamo de ' + ((M.deu(f.slice(2)) || {}).nombre || '') : f;
    M.saldoFondo = f => {
      const entra = f === 'caja' ? M.movs.filter(m => esIn(m) && !m.pedido && !m.deuda) : f.slice(0, 2) === 'p:' ? M.movs.filter(m => esIn(m) && m.pedido === f.slice(2)) : f.slice(0, 2) === 'd:' ? M.movs.filter(m => esIn(m) && m.deuda === f.slice(2)) : [];
      const sale = M.movs.filter(m => !esIn(m) && m.fondo === f);
      return entra.reduce((a, m) => a + num(m.monto), 0) - sale.reduce((a, m) => a + num(m.monto), 0);
    };
    M.fondos = () => [].concat(M.pedidos.map(p => 'p:' + p.id), M.deudas.filter(x => x.tipo === 'prestamo' || M.movs.some(m => esIn(m) && m.deuda === x.id)).map(x => 'd:' + x.id), ['caja'])
      .map(f => ({ f, nombre: M.nomFondo(f), saldo: M.saldoFondo(f) }));
    // deudas: lo que debíamos de antes + lo que nos prestó + lo que pagó directo por nosotros − lo que le pagamos
    M.statsDeuda = x => {
      const prest = M.movs.filter(m => esIn(m) && m.deuda === x.id), directo = M.movs.filter(m => !esIn(m) && m.fondo === 'pd:' + x.id), pagos = M.movs.filter(m => !esIn(m) && m.deuda === x.id);
      const prestado = num(x.inicial) + prest.reduce((a, m) => a + num(m.monto), 0) + directo.reduce((a, m) => a + num(m.monto), 0), pagado = pagos.reduce((a, m) => a + num(m.monto), 0);
      const usado = M.movs.filter(m => !esIn(m) && (m.fondo === 'd:' + x.id || m.fondo === 'pd:' + x.id));
      return { prestado, pagado, falta: prestado - pagado, prest, directo, pagos, usado, dias: x.vence ? entre(hoy, x.vence) : null };
    };
    M.statsPedido = p => statsPedido(p, M);
    M.statsCliente = c => {
      const ps = M.pedidos.filter(p => p.cliente === c.id).map(p => [p, M.statsPedido(p)]);
      const precio = ps.reduce((a, [, s]) => a + s.precio, 0), pagado = ps.reduce((a, [, s]) => a + s.ent, 0);
      return { ps, precio, pagado, debe: ps.reduce((a, [, s]) => a + Math.max(s.porCobrar || 0, 0), 0), frecuente: ps.length >= 2, activos: ps.filter(([p]) => !p.cerrado).length };
    };
    M.totales = () => totales(M);
    M.agenda = () => agenda(M);
    M.noCuadra = () => noCuadra(M);
    M.nomPedido = nomP;
    return M;
  }

  function statsPedido(p, M) {
    const hoy = M.hoy, ms = M.movs.filter(m => m.pedido === p.id), ents = ms.filter(esIn), salsTodas = ms.filter(m => !esIn(m));
    // falla técnica: lo gastado antes de la última falla es pérdida; el seguimiento de la mesa vuelve a empezar desde la placa
    const fallas = Object.entries(p.fallas || {}).map(([id, f]) => Object.assign({ id }, f)).sort((a, b) => (a.creado || 0) - (b.creado || 0)), ult = fallas[fallas.length - 1];
    const antes = ult ? salsTodas.filter(m => (m.creado || 0) <= (ult.creado || 0)) : [], sals = ult ? salsTodas.filter(m => (m.creado || 0) > (ult.creado || 0)) : salsTodas;
    const perdida = antes.reduce((a, m) => a + num(m.monto), 0);
    const ent = ents.reduce((a, m) => a + num(m.monto), 0), salMesa = sals.reduce((a, m) => a + num(m.monto), 0), sal = salMesa + perdida;
    const precio = num(p.precio), costo = COST.reduce((a, [k]) => a + num((p.costos || {})[k]), 0);
    const real = {}; COST.forEach(([k]) => { real[k] = 0; }); sals.forEach(m => { real[catCosto(m)] += num(m.monto); });
    const antAc = !vacio(p.anticipo) ? num(p.anticipo) : precio * 0.5, costoFinal = Math.max(costo, salMesa) + perdida;
    const ganancia = precio && costo ? precio - costoFinal : null;
    const primera = l => l.map(m => m.fecha).filter(Boolean).sort()[0] || '';
    const de = k => sals.filter(m => catCosto(m) === k), P = p.pasos || {}, liq = precio > 0 && ent >= precio;
    const hecho = { pedido: true, anticipo: ent > 0, placa: !!P.placa || de('placa').length > 0, base: !!P.base || de('base').length > 0, armado: !!P.armado, entregado: !!P.entregado, liquidado: liq };
    const fecha = { pedido: p.fecha || '', anticipo: primera(ents), placa: P.placa || primera(de('placa')), base: P.base || primera(de('base')), armado: P.armado || '', entregado: P.entregado || '', liquidado: liq ? ents.map(m => m.fecha).sort().slice(-1)[0] : '' };
    const pasos = C.PASOS.map(([k, n]) => ({ k, n, done: hecho[k], fecha: fecha[k], auto: ['pedido', 'anticipo', 'liquidado'].includes(k) }));
    const hechos = pasos.filter(x => x.done).length, actual = pasos.find(x => !x.done);
    // de dónde salió el dinero que se gastó en esta mesa, y a dónde se fue el dinero de este cliente
    const deDonde = {}; sals.forEach(m => { const f = m.fondo || ''; deDonde[f] = (deDonde[f] || 0) + num(m.monto); });
    const suDinero = M.movs.filter(m => !esIn(m) && m.fondo === 'p:' + p.id), aOtros = {};
    suDinero.filter(m => m.pedido !== p.id).forEach(m => { const k = m.pedido ? 'p:' + m.pedido : m.deuda ? 'd:' + m.deuda : 'gen'; aOtros[k] = (aOtros[k] || 0) + num(m.monto); });
    const saldoSuyo = M.saldoFondo('p:' + p.id);
    const estado = p.cerrado ? 'Finalizado' : !actual ? 'Listo para finalizar' : (ult && !hecho.entregado ? 'Reposición · ' : '') + { anticipo: 'Falta anticipo', placa: 'Falta comprar placa', base: 'Falta la base', armado: 'En el taller', entregado: 'Lista, falta entregar', liquidado: 'Entregada, falta cobrar' }[actual.k];
    return { ms, ents, sals, ent, sal, precio, costo, real, antAc, ganancia, pasos, hechos, actual, estado,
      porCobrar: precio ? precio - ent : null, porGastar: costo ? Math.max(costo - salMesa, 0) : null, fallas, perdida, salMesa,
      margen: ganancia != null && precio ? ganancia / precio : null, veces: precio && costo ? precio / costoFinal : null,
      cobradoPct: precio ? ent / precio : null, gastadoPct: costo ? salMesa / costo : null,
      necesita: costo ? Math.max(Math.max(costo - salMesa, 0) - Math.max(saldoSuyo, 0), 0) : null,
      diasEntrega: p.entrega ? entre(hoy, p.entrega) : null, precioSug: costo ? Math.ceil(costo * REGLA / 100) * 100 : null,
      gananciaReal: ent - sal, deDonde, aOtros, saldoSuyo, aclarar: ms.filter(m => m.revisar).length, pend: pendientes(p, M.cli(p.cliente)) };
  }

  function totales(M) {
    let ent = 0, sal = 0; const porQuien = {}, porMetodo = { Efectivo: 0, Banco: 0, 'Sin decir': 0 }, porMes = {}, porCat = {};
    M.movs.forEach(m => {
      if (!esIn(m) && (m.fondo || '').slice(0, 3) === 'pd:') return; // lo pagó otro directo: no salió de nuestro dinero
      const v = num(m.monto), s = esIn(m) ? v : -v; esIn(m) ? ent += v : sal += v;
      const q = m.quien || 'Sin decir'; porQuien[q] = (porQuien[q] || 0) + s;
      porMetodo[m.metodo === 'Efectivo' ? 'Efectivo' : m.metodo ? 'Banco' : 'Sin decir'] += s;
      const mes = (m.fecha || '').slice(0, 7); porMes[mes] = porMes[mes] || { ent: 0, sal: 0 }; esIn(m) ? porMes[mes].ent += v : porMes[mes].sal += v;
      if (!esIn(m)) { const c = m.cat || 'Otro'; porCat[c] = (porCat[c] || 0) + v; }
    });
    const ps = M.pedidos.map(p => [p, M.statsPedido(p)]), act = ps.filter(([p]) => !p.cerrado);
    const porCobrar = act.reduce((a, [, s]) => a + Math.max(s.porCobrar || 0, 0), 0), porGastar = act.reduce((a, [, s]) => a + (s.porGastar || 0), 0);
    const debemos = M.deudas.reduce((a, x) => a + Math.max(M.statsDeuda(x).falta, 0), 0);
    const perdidas = ps.reduce((a, [, s]) => a + s.perdida, 0);
    const conG = act.filter(([, s]) => s.ganancia != null), ganEsp = conG.reduce((a, [, s]) => a + s.ganancia, 0), ventaG = conG.reduce((a, [, s]) => a + s.precio, 0);
    const fin = ps.filter(([p]) => p.cerrado), ganReal = fin.reduce((a, [, s]) => a + s.gananciaReal, 0);
    const gastoGeneral = M.movs.filter(m => !esIn(m) && !m.pedido && !m.deuda && (m.fondo || '').slice(0, 3) !== 'pd:').reduce((a, m) => a + num(m.monto), 0);
    return { perdidas, ent, sal, caja: ent - sal, porQuien, porMetodo, porMes, porCat, ps, act, fin, porCobrar, porGastar, debemos, ganEsp, ventaG, conG: conG.length, ganReal, gastoGeneral,
      posicion: ent - sal + porCobrar - porGastar - debemos, margenProm: ventaG ? ganEsp / ventaG : null, sinDeudas: !M.deudas.length,
      porAclarar: M.movs.filter(m => m.revisar).length };
  }

  // ---------- agenda: sale sola de cada pedido y deuda, más las tareas que se anotan a mano ----------
  function agenda(M) {
    const hoy = M.hoy, l = [];
    M.pedidos.filter(p => !p.cerrado).forEach(p => {
      const s = M.statsPedido(p), n = M.nomPedido(p), fe = p.entrega, h = k => s.pasos.find(x => x.k === k).done;
      if (s.precio && s.ent < s.antAc && !h('entregado')) { if (p.anticipoCuando === 'base' && !h('base')) l.push({ fecha: fe ? mas(fe, -7) < hoy ? hoy : mas(fe, -7) : hoy, texto: 'Cuando el herrero entregue la base: cobrar anticipo a ' + n + ' (' + pesos(s.antAc - s.ent) + ')', tipo: 'cobro', pedido: p.id, sinFecha: !fe }); else l.push({ fecha: hoy, texto: 'Cobrar anticipo a ' + n + ': ' + pesos(s.antAc - s.ent), tipo: 'cobro', pedido: p.id }); }
      if (fe && !h('placa')) l.push({ fecha: mas(fe, -10) < hoy ? hoy : mas(fe, -10), texto: 'Comprar la placa · ' + n, tipo: 'compra', pedido: p.id });
      if (fe && !h('base')) l.push({ fecha: mas(fe, -7) < hoy ? hoy : mas(fe, -7), texto: 'Mandar hacer la base · ' + n, tipo: 'compra', pedido: p.id });
      if (fe && !h('armado')) l.push({ fecha: mas(fe, -2) < hoy && fe >= hoy ? hoy : mas(fe, -2), texto: 'Armar la mesa · ' + n, tipo: 'taller', pedido: p.id });
      if (fe && !h('entregado')) l.push({ fecha: fe, texto: 'Entregar la mesa de ' + n, tipo: 'entrega', pedido: p.id });
      if (s.porCobrar > 0) l.push({ fecha: h('entregado') ? hoy : (fe || hoy), texto: 'Cobrar saldo a ' + n + ': ' + pesos(s.porCobrar), tipo: 'cobro', pedido: p.id, sinFecha: !fe && !h('entregado') });
      if (!fe && !h('entregado')) l.push({ fecha: hoy, texto: 'Poner fecha de entrega · ' + n, tipo: 'dato', pedido: p.id });
      if (h('entregado') && s.porCobrar <= 0 && s.precio) l.push({ fecha: hoy, texto: 'Finalizar el pedido de ' + n, tipo: 'cierre', pedido: p.id });
    });
    M.deudas.forEach(x => { const s = M.statsDeuda(x); if (s.falta > 0 && x.vence) l.push({ fecha: x.vence, texto: 'Pagar a ' + x.nombre + ': ' + pesos(s.falta), tipo: 'deuda', deuda: x.id }); });
    M.agendaMan.forEach(a => l.push({ fecha: a.fecha || hoy, texto: a.texto, tipo: 'manual', id: a.id, hecho: !!a.hecho, pedido: a.pedido }));
    l.forEach(a => { a.dias = entre(hoy, a.fecha); a.grupo = a.hecho ? 'hecho' : a.dias < 0 ? 'vencido' : a.dias === 0 ? 'hoy' : a.dias <= 7 ? 'semana' : 'despues'; });
    return l.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // ---------- lo que no cuadra: cada dato que no concuerda, con su detalle ----------
  function noCuadra(M) {
    const hoy = M.hoy, l = [], add = (g, t, d, ref) => l.push({ g, t, d, ref });
    M.pedidos.forEach(p => {
      const s = M.statsPedido(p), n = M.nomPedido(p), ref = { pedido: p.id };
      if (s.precio && s.ent > s.precio) add(1, n + ': pagó de más', 'Precio ' + pesos(s.precio) + ' y lleva pagado ' + pesos(s.ent) + ' (' + pesos(s.ent - s.precio) + ' de más). Revisa el precio o algún pago repetido.', ref);
      if (!s.precio && s.ent > 0) add(2, n + ': tiene pagos pero no tiene precio', 'Lleva ' + pesos(s.ent) + ' pagados. Sin precio no se sabe cuánto falta.', ref);
      if (s.fallas.length && !p.cerrado) { const f = s.fallas[s.fallas.length - 1]; add(1, n + ': mesa en reposición por falla técnica', (f.motivo || 'Falla') + ' el ' + f.fecha + '. Pérdida hasta hoy ' + pesos(s.perdida) + ' · la paga: ' + (f.paga || 'por definir') + '.', ref); }
      if (s.costo && s.salMesa > s.costo * 1.1) add(2, n + ': se gastó más de lo estimado', 'Estimado ' + pesos(s.costo) + ', gastado ' + pesos(s.salMesa) + ' (' + pesos(s.salMesa - s.costo) + ' más).', ref);
      if (s.ganancia != null && s.ganancia < 0) add(1, n + ': esta mesa deja pérdida', 'Cuesta ' + pesos(Math.max(s.costo, s.sal)) + ' y se vende en ' + pesos(s.precio) + '.', ref);
      if (s.pasos[5].done && s.porCobrar > 0 && !p.cerrado) add(1, n + ': entregada sin liquidar', 'Falta cobrar ' + pesos(s.porCobrar) + '.', ref);
      if (s.diasEntrega != null && s.diasEntrega < 0 && !s.pasos[5].done && !p.cerrado) add(1, n + ': entrega atrasada ' + -s.diasEntrega + ' días', 'Se prometió para el ' + p.entrega + '.', ref);
      if ((s.pasos[2].done || s.pasos[3].done) && s.precio && s.ent < s.precio * 0.5 && !p.cerrado && !(p.anticipoCuando === 'base' && !s.pasos[3].done)) add(2, n + ': se compró material sin el 50% de anticipo', 'Pagó ' + pesos(s.ent) + ' de ' + pesos(s.precio) + ' (' + pct(s.cobradoPct) + '). La regla es 50% antes de fabricar.', ref);
      if (s.saldoSuyo < 0) add(2, 'El dinero de ' + n + ' quedó en ' + pesos(s.saldoSuyo), 'Se sacó más dinero de este cliente del que ha pagado. Revisa de qué dinero salieron sus gastos.', ref);
      if (p.cerrado && s.porCobrar > 0) add(1, n + ': finalizado pero debe ' + pesos(s.porCobrar), 'Se cerró sin cobrar todo.', ref);
      s.ms.forEach(m => { if (p.fecha && m.fecha < p.fecha) add(3, n + ': movimiento antes de la fecha del pedido', m.fecha + ' · ' + (m.cat || '') + ' ' + pesos(m.monto) + ' es anterior al pedido (' + p.fecha + ').', { mov: m.id }); });
    });
    M.deudas.forEach(x => { const s = M.statsDeuda(x); if (s.falta < 0) add(1, x.nombre + ': se le pagó de más', 'Se le debía ' + pesos(s.prestado) + ' y se le pagó ' + pesos(s.pagado) + '.', { deuda: x.id }); if (s.dias != null && s.dias < 0 && s.falta > 0) add(1, x.nombre + ': deuda vencida', 'Venció hace ' + -s.dias + ' días y faltan ' + pesos(s.falta) + '.', { deuda: x.id }); });
    M.fondos().forEach(f => { if (f.f.slice(0, 2) === 'd:' && f.saldo < 0) add(2, f.nombre + ' quedó en ' + pesos(f.saldo), 'Se gastó más de lo que prestó.', { fondo: f.f }); });
    const cj = M.saldoFondo('caja'); if (cj < 0 && M.movs.some(m => m.fondo === 'caja')) add(3, 'Gastos generales pagados con dinero de clientes: ' + pesos(-cj), 'No ha entrado dinero propio del negocio; los gastos del taller (material, propinas, comisiones) salieron de los anticipos.', { fondo: 'caja' });
    const T = totales(M); Object.entries(T.porQuien).forEach(([q, v]) => { if (v < 0 && q !== 'Sin decir') add(3, q + ' puso ' + pesos(-v) + ' de su bolsa', 'Pagó más de lo que recibió. Si es un préstamo, regístralo como préstamo para que quede como deuda.', { quien: q }); });
    const vistos = {};
    M.movs.forEach(m => {
      const k = [m.tipo, num(m.monto), m.fecha, m.quien || ''].join('|');
      if (vistos[k] && (m.nota || '') === (vistos[k].nota || '')) add(2, 'Posible movimiento repetido', m.fecha + ' · ' + (esIn(m) ? 'entrada' : 'salida') + ' de ' + pesos(m.monto) + ' aparece dos veces igual' + (m.nota ? ' ("' + m.nota + '")' : '') + '.', { mov: m.id });
      vistos[k] = m;
      if (m.fecha > hoy) add(3, 'Movimiento con fecha futura', m.fecha + ' · ' + pesos(m.monto) + ' ' + (m.cat || ''), { mov: m.id });
      if (!esIn(m) && !m.fondo && !m.revisar) add(3, 'Salida sin decir de qué dinero salió', m.fecha + ' · ' + pesos(m.monto) + ' ' + (m.cat || '') + (m.nota ? ' · ' + m.nota : ''), { mov: m.id });
      if (m.deuda && !M.deu(m.deuda)) add(2, 'Movimiento de una deuda que ya no existe', m.fecha + ' · ' + pesos(m.monto), { mov: m.id });
      if (m.pedido && !M.ped(m.pedido)) add(2, 'Movimiento de un pedido que ya no existe', m.fecha + ' · ' + pesos(m.monto), { mov: m.id });
    });
    const porAcl = M.movs.filter(m => m.revisar).length; if (porAcl) add(3, porAcl + ' movimiento(s) por aclarar', 'Están marcados en amarillo en Dinero.', { aclarar: true });
    M.sobrantes.forEach(s => { if (Math.max(num(s.w), num(s.h)) > 320 || Math.min(num(s.w), num(s.h)) > 160) add(3, 'Sobrante más grande que una placa', s.piedra + ' ' + s.w + '×' + s.h, { sobrante: s.id }); });
    return l.sort((a, b) => a.g - b.g);
  }

  const N = { PRECIOS, C, COST, CAMPOS, PLACA, REGLA, lleno, pendientes, fraccionPlaca, costosSugeridos, catCosto, sobrantesDe, cuantasCaben, modelo, num, vacio, pesos, pct, ymd, mas, entre, esIn };
  if (typeof module !== 'undefined' && module.exports) module.exports = N; else root.DKAS_N = N;
})(this);

;
/* DKAS · Admin nuevo (pantallas). Menú: Dashboard · Pedidos · Dinero · Sobrantes · Ajustes. Todo sale de DKAS_N (nucleo.js).
   Rutas: #inicio · #pedidos · #pedidos/clientes · #pedidos/deudas · #p=<pedido> · #c=<cliente> · #d=<deuda> · #dinero · #sobrantes · #ajustes */
(function () {
  const N = window.DKAS_N, A = window.DAZK_API, C = N.C;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-MX');
  const num = N.num, vacio = N.vacio, pct = N.pct;
  const hoy = () => N.ymd(new Date());
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fC = f => { if (!f) return ''; if (f.slice(0, 4) === '9999') return 'sin fecha'; const [y, m, d] = f.split('-'); return +d + ' ' + MES[+m - 1] + (y !== hoy().slice(0, 4) ? ' ' + y.slice(2) : ''); };
  const enDias = n => n == null ? '' : n === 0 ? 'hoy' : n === 1 ? 'mañana' : n === -1 ? 'ayer' : n > 0 ? 'en ' + n + ' días' : 'hace ' + -n + ' días';
  const cls = n => n > 0 ? 'v' : n < 0 ? 'r' : '';
  const otra = (v, o) => (v === 'Otra' || v === 'Otro') && o ? o : v;
  const CLAVE = '55'; // confirma lo importante; no es seguridad (está en el código de la página)
  let me = null, D = {}, M = null, piezas = [], main = null;

  // ---------- arranque y datos ----------
  async function arrancar() {
    main = $('#app');
    try { me = await A.yo(); } catch (e) { me = null; }
    if (!me) return login();
    if (!me.nombre) return nombre();
    document.body.classList.add('dentro');
    main.innerHTML = '<p class="cargando">Cargando…</p>';
    await cargar(); if (!location.hash) history.replaceState(null, '', '#inicio'); ruta();
  }
  function login(err) {
    document.body.classList.remove('dentro');
    main.innerHTML = '<div class="login"><img src="img/dkas-oscuro.png" alt="DKAS"><h1>Admin</h1><p class="sub">Escribe el código de 6 números.</p><input id="cod" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••"><p class="err"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</p></div>';
    const i = $('#cod'); i.focus();
    i.oninput = async () => { i.value = i.value.replace(/\D/g, ''); if (i.value.length === 6) { i.disabled = true; try { await A.entrarConCodigo(i.value); arrancar(); } catch (e) { login(e.message); } } };
  }
  function nombre() {
    main.innerHTML = '<div class="login"><h1>¿Quién eres?</h1><p class="sub">Tu nombre queda en todo lo que registres.</p><input id="nom" placeholder="Tu nombre"><button class="b negro grande" id="nok">Entrar</button></div>';
    $('#nok').onclick = async () => { try { await A.ponerNombre($('#nom').value); arrancar(); } catch (e) { aviso(e.message); } };
  }
  let firma = '', ultimaSync = 0, syncMal = false, pendienteSync = false;
  async function cargar() {
    const [d, pz] = await Promise.all([A.nodo('dinero'), piezas.length ? Promise.resolve(null) : A.nodo('piedra/piezas').catch(() => null)]);
    D = d || {}; if (pz) piezas = Object.values(pz).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    M = N.modelo(D, hoy()); firma = JSON.stringify(D); ultimaSync = Date.now(); syncMal = false; pintarSync();
  }
  // sincronizado en vivo: cada 12 s (y al volver a la app) revisa si alguien más registró algo; si cambió, se redibuja solo
  async function sincronizar() {
    if (!M || document.hidden || ocupadoGuardando) return;
    try {
      const d = await A.nodo('dinero'), f = JSON.stringify(d || {}); ultimaSync = Date.now(); syncMal = false;
      if (f !== firma) { if ($('#capa') || $('.capa')) { pendienteSync = true; } else { D = d || {}; M = N.modelo(D, hoy()); firma = f; const y = scrollY; ruta(true); scrollTo(0, y); aviso('Se actualizó: hay cambios nuevos'); } }
    } catch (e) { syncMal = true; }
    pintarSync();
  }
  function pintarSync() { const t = syncMal ? 'Sin conexión · reintentando' : 'Sincronizado' + (ultimaSync ? ' · ' + new Date(ultimaSync).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''); $$('.sync').forEach(e => { e.classList.toggle('mal', syncMal); e.innerHTML = '<i></i>' + t; }); }
  setInterval(sincronizar, 12000); addEventListener('focus', sincronizar); document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
  const recargar = async () => { await cargar(); ruta(); };
  async function bitacora(accion, detalle) { try { await A.nodoAgrega('dinero/bitacora', { accion, detalle: String(detalle || '').slice(0, 300) }); } catch (e) {} }

  // ---------- rutas y menú ----------
  const MENU = [['inicio', 'Dashboard', 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z'], ['pedidos', 'Pedidos', 'M4 4h16v4H4zm0 6h16v10H4zm4 3v2h8v-2z'], ['dinero', 'Dinero', 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15v2h-2v-2c-1.7-.3-3-1.4-3-3h2c0 .6.9 1 2 1s2-.4 2-1-.6-1-2-1.3c-2.2-.4-4-1.1-4-3 0-1.4 1.3-2.5 3-2.8V5h2v1.9c1.7.3 3 1.4 3 3h-2c0-.6-.9-1-2-1s-2 .4-2 1 .6.8 2 1.1c2.2.5 4 1.2 4 3.2 0 1.4-1.3 2.5-3 2.8z'], ['sobrantes', 'Sobrantes', 'M3 17l6-6 4 4 8-8v4h-2V9.4l-6 6-4-4-4.6 4.6z'], ['ajustes', 'Ajustes', 'M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7 7 0 00-1.7-1L15 3h-4l-.3 2.7a7 7 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 001.7 1L11 21h4l.3-2.7a7 7 0 001.7-1l2.5 1 2-3.5zM13 15a3 3 0 110-6 3 3 0 010 6z']];
  function menu(sec) {
    $('#menu').innerHTML = '<div class="m-logo"><img src="img/dkas-oscuro.png" alt="DKAS"></div>' + MENU.map(([k, t, d]) => '<a href="#' + k + '"' + (k === sec ? ' class="on" aria-current="page"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg><span>' + t + '</span></a>').join('')
      + '<button class="m-reg" id="m-reg"><b>＋</b><span>Registrar dinero</span></button><div class="m-sync"><span class="sync"></span></div>';
    $('#m-reg').onclick = () => registrar(); pintarSync();
  }
  function ruta(quieto) {
    if (!M) return;
    const h = location.hash.slice(1) || 'inicio', sec = /^p=|^c=|^d=|^pedidos/.test(h) ? 'pedidos' : MENU.some(m => m[0] === h) ? h : 'inicio';
    menu(sec); if (!quieto) window.scrollTo(0, 0);
    setTimeout(pintarSync, 0);
    if (h === 'inicio') return inicio();
    if (h === 'pedidos') return pedidos('pedidos');
    if (h === 'pedidos/clientes') return pedidos('clientes');
    if (h === 'pedidos/deudas') return pedidos('deudas');
    if (/^p=/.test(h)) { const p = M.ped(h.slice(2)); return p ? pedido(p) : pedidos('pedidos'); }
    if (/^c=/.test(h)) { const c = M.cli(h.slice(2)); return c ? cliente(c) : pedidos('clientes'); }
    if (/^d=/.test(h)) { const x = M.deu(h.slice(2)); return x ? deuda(x) : pedidos('deudas'); }
    if (h === 'dinero') return dinero();
    if (h === 'sobrantes') return sobrantes();
    if (h === 'ajustes') return ajustes();
    inicio();
  }
  addEventListener('hashchange', ruta);

  // ---------- piezas de pantalla ----------
  const tit = (t, sub, der) => '<header class="tit"><div><span class="sync"></span><h1>' + t + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (der || '') + '</header>';
  const kpi = (lbl, v, c, sub, href, extra) => '<' + (href ? 'a href="' + href + '"' : 'div') + ' class="kpi' + (extra ? ' ' + extra : '') + '"><span>' + lbl + '</span><b class="' + (c || '') + '">' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</' + (href ? 'a' : 'div') + '>';
  const prog = (n, tot, v) => '<i class="prog' + (v ? ' v' : '') + '"><em style="width:' + Math.round(n / tot * 100) + '%"></em></i>';
  const pill = (t, c) => '<em class="pill ' + (c || '') + '">' + esc(t) + '</em>';
  const vacioTxt = t => '<p class="vacio">' + t + '</p>';
  const piezaTxt = p => {
    const med = p.forma === 'Redonda' ? (num(p.largo) ? 'Ø' + num(p.largo) : '') : (num(p.largo) ? num(p.largo) + '×' + num(p.ancho) : '');
    return [num(p.cantidad) > 1 ? num(p.cantidad) + '×' : '', otra(p.tipo, p.tipoOtra) || '', p.forma ? p.forma.toLowerCase() : '', med ? med + ' cm' : '', otra(p.color, p.colorOtra) || '', p.base ? '· base ' + otra(p.base, p.baseOtra).toLowerCase() : ''].filter(Boolean).join(' ') || 'Falta decir qué mesa es';
  };
  const colorEstado = (p, s) => p.cerrado ? 'v' : s.diasEntrega != null && s.diasEntrega < 0 && !s.pasos[5].done ? 'r' : s.pasos[5].done ? 'a' : '';

  // ================= DASHBOARD =================
  function inicio() {
    const T = M.totales(), nc = M.noCuadra(), ag = M.agenda().filter(a => a.grupo !== 'hecho' && a.grupo !== 'despues');
    const saludo = (new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches') + ', ' + esc((me.nombre || '').split(' ')[0]);
    const grupos = [['vencido', 'Atrasado'], ['hoy', 'Hoy'], ['semana', 'Esta semana']];
    main.innerHTML = tit(saludo, fC(hoy()) + ' · todo el negocio en una pantalla', '<div class="tit-b"><button class="b" id="x-pdf">Exportar PDF</button><button class="b" id="x-xls">Exportar Excel</button></div>')
      + '<section class="kpis">' + kpi('Dinero con nosotros', pesos(T.caja), T.caja < 0 ? 'r' : '', Object.entries(T.porQuien).filter(([, v]) => v).map(([q, v]) => esc(q) + ' ' + pesos(v)).join(' · '), '#dinero', 'hero')
        + kpi('Nos deben clientes', pesos(T.porCobrar), 'v', T.act.length + ' pedidos activos', '#pedidos')
        + kpi('Falta gastar en pedidos', pesos(T.porGastar), 'r', 'para terminar las mesas', '#pedidos')
        + (T.sinDeudas ? kpi('Debemos', 'Sin anotar', 'a', 'Anota las deudas →', '#pedidos/deudas') : kpi('Debemos', pesos(T.debemos), 'r', M.deudas.length + ' deudas', '#pedidos/deudas'))
        + kpi('Posición real', pesos(T.posicion), cls(T.posicion), T.sinDeudas ? 'sin contar deudas' : 'si todo se cobra y se paga')
        + kpi('Ganancia esperada', T.conG ? pesos(T.ganEsp) : '—', cls(T.ganEsp), T.conG ? 'margen ' + pct(T.margenProm) + ' · ' + T.conG + ' de ' + T.act.length + ' pedidos' : 'faltan precios y costos') + '</section>'
      + '<p class="leccion"><b>Posición real</b> = dinero con nosotros + lo que nos deben − lo que falta gastar − lo que debemos. Positiva: alcanza, falta efectivo hoy. Negativa: aunque se cobre todo no alcanza.</p>'
      + '<div class="dos">'
      + '<section class="caja"><div class="caja-t"><h2>Agenda</h2><button class="b chico" id="ag-n">＋ Tarea</button></div>'
        + (ag.length ? grupos.map(([g, t]) => { const l = ag.filter(a => a.grupo === g); return l.length ? '<h3 class="' + (g === 'vencido' ? 'r' : '') + '">' + t + ' · ' + l.length + '</h3><ul class="agenda">' + l.map(itemAgenda).join('') + '</ul>' : ''; }).join('') : vacioTxt('Nada pendiente esta semana.'))
        + '<p class="nota">La agenda se llena sola con cada pedido (comprar placa, base, armar, entregar, cobrar) y con las deudas que vencen.</p></section>'
      + '<section class="caja ' + (nc.length ? 'mal' : '') + '"><div class="caja-t"><h2>Lo que no cuadra · ' + nc.length + '</h2></div>'
        + (nc.length ? '<ul class="nocuadra">' + nc.slice(0, 8).map(itemNoCuadra).join('') + '</ul>' + (nc.length > 8 ? '<button class="b chico" id="nc-todo">Ver los ' + nc.length + '</button>' : '') : vacioTxt('Todo cuadra.')) + '</section>'
      + '</div>'
      + '<section class="caja"><div class="caja-t"><h2>Pedidos activos · ' + T.act.length + '</h2><a class="lnk" href="#pedidos">Ver todos</a></div>' + (T.act.length ? '<div class="lista">' + T.act.sort((a, b) => (a[0].entrega || '9999').localeCompare(b[0].entrega || '9999')).slice(0, 6).map(([p, s]) => filaPedido(p, s)).join('') + '</div>' : vacioTxt('No hay pedidos activos.')) + '</section>';
    $('#x-pdf').onclick = () => pdfGeneral(); $('#x-xls').onclick = () => xlsGeneral();
    $('#ag-n').onclick = () => tarea();
    if ($('#nc-todo')) $('#nc-todo').onclick = () => { $('.nocuadra').innerHTML = nc.map(itemNoCuadra).join(''); $('#nc-todo').remove(); enlazarNC(); };
    enlazarAgenda(); enlazarNC(); enlazarFilas();
  }
  function itemAgenda(a) {
    const ic = { cobro: '$', compra: '◆', taller: '▲', entrega: '➜', deuda: '!', manual: '•', dato: '?', cierre: '✓' }[a.tipo] || '•';
    const href = a.pedido ? '#p=' + a.pedido : a.deuda ? '#d=' + a.deuda : '';
    return '<li class="t-' + a.tipo + (a.hecho ? ' hecho' : '') + '">' + (a.tipo === 'manual' ? '<button class="chk" data-ag="' + esc(a.id) + '" aria-label="Marcar hecha">' + (a.hecho ? '✓' : '') + '</button>' : '<i>' + ic + '</i>')
      + (href ? '<a href="' + href + '">' : '<span>') + '<b>' + esc(a.texto) + '</b><small>' + (a.sinFecha ? 'sin fecha de entrega' : fC(a.fecha) + ' · ' + enDias(a.dias)) + '</small>' + (href ? '</a>' : '</span>') + '</li>';
  }
  function enlazarAgenda() { $$('[data-ag]').forEach(b => b.onclick = async () => { const a = M.agendaMan.find(x => x.id === b.dataset.ag); try { await A.nodoCambia('dinero/agenda/' + a.id, { hecho: !a.hecho }); await recargar(); } catch (e) { aviso(e.message); } }); }
  function itemNoCuadra(x) {
    const r = x.ref || {}, href = r.pedido ? '#p=' + r.pedido : r.deuda ? '#d=' + r.deuda : r.aclarar || r.mov ? '#dinero' : '';
    return '<li class="g' + x.g + '">' + (href ? '<a href="' + href + '"' + (r.mov ? ' data-nmov="' + esc(r.mov) + '"' : '') + '>' : '<span>') + '<b>' + esc(x.t) + '</b><small>' + esc(x.d) + '</small>' + (href ? '</a>' : '</span>') + '</li>';
  }
  function enlazarNC() { $$('[data-nmov]').forEach(a => a.onclick = e => { e.preventDefault(); const m = M.movs.find(x => x.id === a.dataset.nmov); if (m) registrar(m); }); }

  // ================= PEDIDOS =================
  function filaPedido(p, s) {
    s = s || M.statsPedido(p); const c = M.cli(p.cliente) || {}, col = colorEstado(p, s), sig = s.actual;
    const rapido = !p.cerrado && sig ? (['anticipo', 'liquidado'].includes(sig.k) ? '<button class="b chico" data-cobrar="' + esc(p.id) + '">Cobrar</button>' : '<button class="b chico" data-rap="' + esc(p.id) + '" data-k="' + sig.k + '">✓ ' + esc(sig.n) + '</button>') : '';
    return '<div class="fila ' + (p.cerrado ? 'fin' : '') + '"><a href="#p=' + esc(p.id) + '" class="fila-a"><span class="folio">#' + esc(p.folio || '—') + '</span><span class="fila-c"><b>' + esc(c.nombre || 'Sin cliente') + '</b><small>' + esc(piezaTxt(p)) + '</small>'
      + '<span class="puntos">' + s.pasos.map(x => '<i class="' + (x.done ? 'si' : '') + '" title="' + esc(x.n) + '"></i>').join('') + '</span></span>'
      + '<span class="fila-d"><em class="pill ' + col + '">' + esc(s.estado) + '</em><small>' + (p.entrega ? 'Entrega ' + fC(p.entrega) : '<span class="a">sin entrega</span>') + '</small><small>' + (s.precio ? (s.porCobrar > 0 ? 'Debe <b>' + pesos(s.porCobrar) + '</b>' : '<span class="v">Pagado</span>') : '<span class="a">sin precio</span>') + '</small></span></a>'
      + (rapido ? '<div class="fila-r">' + rapido + '</div>' : '') + '</div>';
  }
  function enlazarFilas() {
    $$('[data-cobrar]').forEach(b => b.onclick = () => registrar(null, { tipo: 'in', origen: 'pedido', pedido: b.dataset.cobrar }));
    $$('[data-rap]').forEach(b => b.onclick = () => marcarPaso(M.ped(b.dataset.rap), b.dataset.k));
  }
  function pedidos(tab) {
    const T = M.totales();
    const tabs = '<nav class="tabs">' + [['pedidos', 'Pedidos', T.act.length], ['clientes', 'Clientes', M.clientes.length], ['deudas', 'A quién le debemos', M.deudas.length]].map(([k, t, n]) => '<a href="#pedidos' + (k === 'pedidos' ? '' : '/' + k) + '"' + (k === tab ? ' class="on"' : '') + '>' + t + ' <small>' + n + '</small></a>').join('') + '</nav>';
    if (tab === 'clientes') {
      const l = M.clientes.map(c => [c, M.statsCliente(c)]).sort((a, b) => b[1].activos - a[1].activos || (a[0].nombre || '').localeCompare(b[0].nombre || ''));
      main.innerHTML = tit('Pedidos', 'Clientes registrados. Frecuente = 2 pedidos o más.', '<button class="b negro" id="nuevo">＋ Nuevo pedido</button>') + tabs
        + '<section class="caja">' + (l.length ? '<div class="lista">' + l.map(([c, s]) => '<a class="fila fila-a" href="#c=' + esc(c.id) + '"><span class="fila-c"><b>' + esc(c.nombre) + (s.frecuente ? ' ' + pill('frecuente', 'v') : '') + '</b><small>' + s.ps.length + ' pedido' + (s.ps.length === 1 ? '' : 's') + (s.activos ? ' · ' + s.activos + ' activo' + (s.activos === 1 ? '' : 's') : '') + (c.telefono ? ' · ' + esc(c.telefono) : '') + '</small></span><span class="fila-d"><small>Pagó ' + pesos(s.pagado) + '</small><small>' + (s.debe ? 'Debe <b>' + pesos(s.debe) + '</b>' : '<span class="v">Al corriente</span>') + '</small></span></a>').join('') + '</div>' : vacioTxt('Sin clientes.')) + '</section>';
    } else if (tab === 'deudas') {
      const l = M.deudas.map(x => [x, M.statsDeuda(x)]).sort((a, b) => b[1].falta - a[1].falta);
      main.innerHTML = tit('Pedidos', 'A quién le debe el negocio: prestamistas, proveedores, herreros.', '<button class="b negro" id="nueva-d">＋ Deuda o prestamista</button>') + tabs
        + '<section class="kpis tres">' + kpi('Debemos en total', T.sinDeudas ? 'Sin anotar' : pesos(T.debemos), T.sinDeudas ? 'a' : 'r') + kpi('Nos han prestado', pesos(l.reduce((a, [, s]) => a + s.prestado, 0))) + kpi('Ya pagamos', pesos(l.reduce((a, [, s]) => a + s.pagado, 0)), 'v') + '</section>'
        + (T.sinDeudas ? '<p class="aviso">Todavía no hay ninguna deuda anotada. Toca <b>＋ Deuda o prestamista</b>. Si alguien presta dinero, regístralo en <b>Registrar dinero → Entró → Préstamo</b> y se le crea su panel solo.</p>' : '')
        + '<section class="caja">' + (l.length ? '<div class="lista">' + l.map(([x, s]) => '<a class="fila fila-a" href="#d=' + esc(x.id) + '"><span class="fila-c"><b>' + esc(x.nombre) + ' ' + pill(x.tipo === 'prestamo' ? 'prestamista' : x.tipo === 'proveedor' ? 'proveedor' : 'otro') + '</b><small>Prestado ' + pesos(s.prestado) + ' · pagado ' + pesos(s.pagado) + (x.vence ? ' · vence ' + fC(x.vence) : '') + '</small></span><span class="fila-d"><b class="' + (s.falta > 0 ? 'r' : 'v') + '">' + (s.falta > 0 ? pesos(s.falta) : 'Pagada') + '</b></span></a>').join('') + '</div>' : vacioTxt('Sin deudas.')) + '</section>';
      $('#nueva-d').onclick = () => hojaDeuda();
    } else {
      let filtro = 'activos';
      const pintar = () => {
        const todos = M.pedidos.map(p => [p, M.statsPedido(p)]);
        const F = { activos: ([p]) => !p.cerrado, cobrar: ([p, s]) => !p.cerrado && s.porCobrar > 0, atrasados: ([p, s]) => !p.cerrado && s.diasEntrega != null && s.diasEntrega < 0 && !s.pasos[5].done, finalizados: ([p]) => p.cerrado, todos: () => true };
        const l = todos.filter(F[filtro]).sort((a, b) => (a[0].entrega || '9999').localeCompare(b[0].entrega || '9999') || num(a[0].folio) - num(b[0].folio));
        $('#lista-p').innerHTML = l.length ? l.map(([p, s]) => filaPedido(p, s)).join('') : vacioTxt('Nada aquí.');
        $$('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === filtro)); enlazarFilas();
      };
      main.innerHTML = tit('Pedidos', 'Toca un pedido para ver todo. El botón de la derecha avanza el siguiente paso rápido.', '<div class="tit-b"><button class="b" id="reg-p">Registrar dinero</button><button class="b negro" id="nuevo">＋ Nuevo pedido</button></div>') + tabs
        + '<div class="chips filtros">' + [['activos', 'Activos'], ['cobrar', 'Por cobrar'], ['atrasados', 'Atrasados'], ['finalizados', 'Finalizados'], ['todos', 'Todos']].map(([k, t]) => '<button data-f="' + k + '">' + t + '</button>').join('') + '</div>'
        + '<section class="caja"><div class="lista" id="lista-p"></div></section>';
      $$('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; pintar(); });
      $('#reg-p').onclick = () => registrar(); pintar();
    }
    if ($('#nuevo')) $('#nuevo').onclick = () => alta();
  }

  function pedido(p) {
    const s = M.statsPedido(p), c = M.cli(p.cliente) || {}, cs = M.statsCliente(c), fin = s.pasos[5].done && s.pasos[6].done;
    const filas = N.COST.map(([k, n]) => { const e = !vacio((p.costos || {})[k]) ? num(p.costos[k]) : null, r = s.real[k]; if (e == null && !r) return ''; const d = r - (e || 0);
      return '<tr><td>' + esc(n) + '</td><td>' + (e != null ? pesos(e) : '<span class="a">pendiente</span>') + '</td><td>' + (r ? pesos(r) : '—') + '</td><td class="' + (e != null && r ? (d > 0 ? 'r' : 'v') : '') + '">' + (e != null && r ? (d > 0 ? '+' : '') + pesos(d) : e != null ? 'por gastar' : '') + '</td></tr>'; }).join('');
    const deDonde = Object.entries(s.deDonde), aOtros = Object.entries(s.aOtros);
    const nc = M.noCuadra().filter(x => x.ref && x.ref.pedido === p.id);
    main.innerHTML = '<a class="volver" href="#pedidos">← Pedidos</a>'
      + tit(esc(c.nombre || 'Sin cliente') + ' <span class="folio">#' + esc(p.folio || '—') + '</span>', esc(piezaTxt(p)) + '<br>' + [c.telefono, c.direccion].filter(Boolean).map(esc).join(' · ') + (p.vendedor ? ' · vendió ' + esc(otra(p.vendedor, p.vendedorOtro)) : ''),
        '<div class="tit-b"><button class="b negro" id="reg">＋ Registrar dinero</button><button class="b" id="edit">Editar pedido</button>' + (p.cerrado ? '' : '<button class="b rojo-b" id="falla">⚠ Falla / reponer</button>') + '</div>')
      + (s.fallas.length ? '<section class="caja mal"><div class="caja-t"><h2>⚠ Reposición por falla técnica</h2><button class="b chico" id="sob-rota">＋ Guardar pedazos como sobrante</button></div><ul class="nocuadra">' + s.fallas.map((f, i) => '<li class="g1"><span><b>Falla ' + (i + 1) + ' · ' + esc(f.motivo || '') + ' · ' + fC(f.fecha) + '</b><small>La paga: ' + esc(f.paga || 'por definir') + (f.rehacer ? ' · se rehace: ' + esc(f.rehacer) : '') + (f.nota ? ' · ' + esc(f.nota) : '') + '</small></span></li>').join('') + '</ul><p class="nota">Lo gastado antes de la falla (<b class="r">' + pesos(s.perdida) + '</b>) cuenta como pérdida de este pedido. El seguimiento volvió a empezar desde la placa.</p></section>' : '')
      + (cs.frecuente ? '<p class="aviso v">Cliente frecuente: ' + cs.ps.length + ' pedidos · pagó ' + pesos(cs.pagado) + ' en total · debe ' + pesos(cs.debe) + '. <a href="#c=' + esc(c.id) + '">Ver su perfil</a></p>' : '')
      + '<section class="caja seg ' + (p.cerrado ? 'ok' : '') + '"><div class="caja-t"><h2>' + (p.cerrado ? 'Pedido finalizado ✓' : 'Seguimiento · ' + esc(s.estado)) + '</h2><span class="sub">' + s.hechos + ' de 7</span></div>'
        + '<ol class="pasos">' + s.pasos.map((x, i) => '<li class="' + (x.done ? 'si' : '') + (s.actual === x ? ' ya' : '') + '"><i>' + (x.done ? '✓' : i + 1) + '</i><span><b>' + esc(x.n) + '</b><small>' + (x.done ? (x.fecha ? fC(x.fecha) : 'hecho') : x.auto ? 'se marca solo al registrar el dinero' : 'pendiente') + '</small></span>'
          + (p.cerrado ? '' : x.auto ? (x.done || x.k === 'pedido' ? '' : '<button class="b chico" data-cob="1">Cobrar</button>') : '<button class="b chico" data-paso="' + x.k + '">' + ((p.pasos || {})[x.k] ? 'Desmarcar' : x.done ? 'Poner fecha' : 'Marcar') + '</button>') + '</li>').join('') + '</ol>'
        + (p.cerrado ? '<button class="b" id="reabrir">Reabrir pedido</button>' : '<button class="b ' + (fin ? 'verde' : '') + ' grande" id="finalizar"' + (fin ? '' : ' disabled') + '>' + (fin ? 'Finalizar pedido ✓' : 'Finalizar (cuando esté entregada y liquidada)') + '</button>') + '</section>'
      + (nc.length ? '<section class="caja mal"><h2>No cuadra en este pedido</h2><ul class="nocuadra">' + nc.map(itemNoCuadra).join('') + '</ul></section>' : '')
      + (s.pend.length ? '<section class="caja pend"><div class="caja-t"><h2>Datos pendientes · ' + s.pend.length + '</h2><button class="b chico" data-edit2="1">Completar</button></div><p>' + s.pend.map(esc).join(' · ') + '</p></section>' : '')
      + '<section class="kpis">' + kpi('Precio', s.precio ? pesos(s.precio) : 'Pendiente', s.precio ? '' : 'a') + kpi('Ya pagó', pesos(s.ent), 'v', s.cobradoPct != null ? pct(s.cobradoPct) + ' del precio' : '') + kpi('Le falta pagar', s.porCobrar != null ? pesos(Math.max(s.porCobrar, 0)) : '—', s.porCobrar > 0 ? 'r' : '', 'anticipo acordado ' + (s.precio ? pesos(s.antAc) : '—'))
        + kpi('Gastado', pesos(s.sal), 'r', (s.perdida ? pesos(s.perdida) + ' perdidos en la falla · ' : '') + (s.costo ? pct(s.gastadoPct) + ' de ' + pesos(s.costo) + ' estimado' : 'sin costo estimado')) + kpi('Ganancia esperada', s.ganancia != null ? pesos(s.ganancia) : '—', s.ganancia != null ? cls(s.ganancia) : '', s.margen != null ? 'margen ' + pct(s.margen) + ' · ×' + s.veces.toFixed(2) + ' (regla ×1.6 = ' + pesos(s.precioSug) + ')' : '')
        + kpi('Su dinero que queda', pesos(s.saldoSuyo), cls(s.saldoSuyo), s.necesita > 0 ? 'faltan ' + pesos(s.necesita) + ' para terminarla' : s.porGastar ? 'faltan ' + pesos(s.porGastar) + ' de gastos' : '') + '</section>'
      + '<div class="dos"><section class="caja"><h2>Costos: estimado contra real</h2>' + (filas ? '<div class="tabla"><table><thead><tr><th>Concepto</th><th>Estimado</th><th>Real</th><th>Diferencia</th></tr></thead><tbody>' + filas + '</tbody><tfoot><tr><td>Total</td><td>' + (s.costo ? pesos(s.costo) : '—') + '</td><td>' + pesos(s.sal) + '</td><td class="' + (s.costo && s.sal > s.costo ? 'r' : '') + '">' + (s.costo ? (s.sal > s.costo ? '+' : '') + pesos(s.sal - s.costo) : '—') + '</td></tr></tfoot></table></div>' : vacioTxt('Sin costos todavía.')) + '</section>'
      + '<section class="caja"><h2>De dónde salió y a dónde se fue el dinero</h2>'
        + '<h3>Gastos de esta mesa, pagados con</h3>' + (deDonde.length ? '<ul class="fondos">' + deDonde.map(([f, v]) => '<li><span>' + (f ? esc(M.nomFondo(f)) : '<span class="a">sin decir de qué dinero</span>') + '</span><b>' + pesos(v) + '</b></li>').join('') + '</ul>' : vacioTxt('Sin gastos.'))
        + '<h3>El dinero de ' + esc(c.nombre || 'este cliente') + ' se usó para</h3>' + (aOtros.length ? '<ul class="fondos">' + aOtros.map(([k, v]) => '<li><span>' + (k === 'gen' ? 'Gastos generales' : k.slice(0, 2) === 'p:' ? 'Pagar el pedido de ' + esc(M.nomPed(k.slice(2))) : 'Pagar a ' + esc((M.deu(k.slice(2)) || {}).nombre || '')) + '</span><b class="r">' + pesos(v) + '</b></li>').join('') + '</ul>' : vacioTxt('Solo para su propia mesa (o todavía no se ha usado).')) + '</section></div>'
      + '<section class="caja"><div class="caja-t"><h2>Formato de pedido</h2><div class="tit-b"><button class="b chico" id="fp">PDF del formato</button><button class="b chico" data-edit2="1">Editar</button></div></div>' + specsHTML(p, c) + '</section>'
      + (p.notas ? '<section class="caja"><h2>Notas</h2><p class="notas">' + esc(p.notas) + '</p></section>' : '')
      + '<section class="caja"><h2>Movimientos de este pedido</h2>' + (s.ms.length ? '<div class="lista">' + s.ms.slice().reverse().map(filaMov).join('') + '</div>' : vacioTxt('Sin movimientos.')) + '</section>'
      + sobrantesDePedido(p);
    $('#reg').onclick = () => registrar(null, { pedido: p.id }); $$('#edit,[data-edit2]').forEach(b => b.onclick = () => alta(p));
    $$('[data-cob]').forEach(b => b.onclick = () => registrar(null, { tipo: 'in', origen: 'pedido', pedido: p.id }));
    $$('[data-paso]').forEach(b => b.onclick = () => marcarPaso(p, b.dataset.paso));
    $('#fp').onclick = () => pdfFormato(p);
    if ($('#falla')) $('#falla').onclick = () => hojaFalla(p, s);
    if ($('#sob-rota')) $('#sob-rota').onclick = () => hojaSobrante(null, { piedra: otra(p.color, p.colorOtra), pedido: p.id });
    if ($('#finalizar')) $('#finalizar').onclick = async () => { if (!await clave('Finalizar pedido', [['Pedido', M.nomPedido(p)], ['Cobrado', pesos(s.ent)], ['Gastado', pesos(s.sal)], ['Ganancia real', pesos(s.ent - s.sal)]])) return; await guardarYa(() => A.nodoCambia('dinero/pedidos/' + p.id, { cerrado: true }), 'Pedido finalizado', 'Finalizó ' + M.nomPedido(p)); };
    if ($('#reabrir')) $('#reabrir').onclick = async () => { if (!await clave('Reabrir pedido', [['Pedido', M.nomPedido(p)]])) return; await guardarYa(() => A.nodoCambia('dinero/pedidos/' + p.id, { cerrado: false }), 'Pedido reabierto', 'Reabrió ' + M.nomPedido(p)); };
    enlazarMovs(); enlazarNC(); enlazarSobrantesPedido(p);
  }
  function hojaFalla(p, s) {
    let motivo = '', paga = 'Por definir', base = false;
    const ch = (id, l, v) => '<div class="chips" id="' + id + '">' + l.map(x => '<button data-v="' + esc(x) + '"' + (x === v ? ' class="on"' : '') + '>' + esc(x) + '</button>').join('') + '</div>';
    hoja('Falla técnica · reponer mesa', '<p class="aviso r">El pedido de ' + esc(M.nomPedido(p)) + ' vuelve a "Falta comprar placa". Lo que ya se gastó (' + pesos(s.salMesa) + ') queda como pérdida de este pedido. No se borra nada.</p>'
      + '<div class="campo">¿Qué pasó?' + ch('f-m', C.FALLAS, motivo) + '</div>'
      + '<div class="campo">¿Quién paga la pérdida?' + ch('f-p', C.PAGA, paga) + '</div>'
      + '<label class="campo" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="f-b" style="width:auto"> También hay que rehacer la base</label>'
      + '<div class="dos-i"><label class="campo">¿Cuándo pasó?<input id="f-f" type="date" value="' + hoy() + '"></label><label class="campo">Nota<input id="f-n" maxlength="120" placeholder="ej. se rompió una esquina al bajarla"></label></div>'
      + '<button class="b negro grande" id="f-ok">Registrar falla y reponer</button>', h => {
      const sel = (id, fn) => $$('#' + id + ' [data-v]', h).forEach(b => b.onclick = () => { fn(b.dataset.v); $$('#' + id + ' [data-v]', h).forEach(o => o.classList.toggle('on', o === b)); });
      sel('f-m', v => { motivo = v; }); sel('f-p', v => { paga = v; });
      $('#f-ok', h).onclick = async () => {
        if (!motivo) return aviso('Elige qué pasó.');
        base = $('#f-b', h).checked; const f = { fecha: $('#f-f', h).value || hoy(), motivo, paga, rehacer: base ? 'placa y base' : 'placa', nota: $('#f-n', h).value.trim() || null };
        if (!await clave('Registrar falla técnica', [['Pedido', M.nomPedido(p)], ['Qué pasó', motivo], ['Cuándo', fC(f.fecha)], ['La paga', paga], ['Se rehace', f.rehacer], ['Pérdida hasta hoy', pesos(s.salMesa)]])) return;
        cerrarHoja();
        const bp = s.pasos.find(x => x.k === 'base'), P = {}; if (!base && bp && bp.done) P.base = bp.fecha || f.fecha;
        await guardarYa(async () => { await A.nodoAgrega('dinero/pedidos/' + p.id + '/fallas', f); await A.nodoPon('dinero/pedidos/' + p.id + '/pasos', Object.keys(P).length ? P : null); }, 'Falla registrada: el pedido vuelve a empezar', 'Falla técnica en ' + M.nomPedido(p) + ': ' + motivo + ' · paga ' + paga + ' · pérdida ' + pesos(s.salMesa));
      };
    });
  }
  async function marcarPaso(p, k) {
    const P = Object.assign({}, p.pasos || {}), quitar = !!P[k], n = (C.PASOS.find(x => x[0] === k) || [, k])[1];
    if (!await clave(quitar ? 'Desmarcar paso' : 'Marcar paso', [['Pedido', M.nomPedido(p)], ['Paso', n], ['Fecha', quitar ? 'se quita' : fC(hoy())]])) return;
    if (quitar) delete P[k]; else P[k] = hoy();
    await guardarYa(() => A.nodoPon('dinero/pedidos/' + p.id + '/pasos', Object.keys(P).length ? P : null), n + (quitar ? ' desmarcado' : ' ✓'), (quitar ? 'Desmarcó ' : 'Marcó ') + n + ' · ' + M.nomPedido(p));
  }
  function specs(p, c) {
    const P_ = v => vacio(v) ? 'pendiente' : String(v);
    const med = p.forma === 'Redonda' ? (num(p.largo) ? 'Ø ' + num(p.largo) + ' cm' : '') : (num(p.largo) ? num(p.largo) + ' × ' + num(p.ancho) + ' cm' : '');
    return [['1 · Datos del cliente', [['Nº de pedido', String(p.folio || '—')], ['Nombre', c.nombre || ''], ['Teléfono', P_(c.telefono)], ['Email', c.email || '—'], ['Dirección', P_(c.direccion)], ['Vendedor', P_(otra(p.vendedor, p.vendedorOtro))], ['Fecha del pedido', P_(p.fecha)], ['Fecha de entrega', P_(p.entrega)]]],
      ['2 · Tipo, forma y medidas', [['Forma', P_(p.forma)], ['Uso', P_(otra(p.tipo, p.tipoOtra))], ['Medidas', P_(med)], ['Altura', num(p.altura) ? num(p.altura) + ' cm' : 'pendiente'], ['Cuántas', String(num(p.cantidad) || 1)]]],
      ['3 · Cubierta', [['Tipo', P_(otra(p.material, p.materialOtro))], ['Marca / proveedor', P_(p.marca)], ['Color', P_(otra(p.color, p.colorOtra))], ['Acabado', P_(p.acabado)], ['Canto', P_(otra(p.canto, p.cantoOtro))], ['Espesor', num(p.espesor) ? num(p.espesor) + ' mm' : 'pendiente'], ['Refuerzo inferior', P_(p.refuerzo)], ['Observaciones', p.obsCubierta || '—']]],
      ['4 · Base de herrería', [['Diseño', P_(otra(p.base, p.baseOtra))], ['Color de pintura', P_(p.pintura)], ['Acabado', P_(p.pacabado)], ['Tipo de pintura', P_(p.ptipo)], ['Niveladores', P_(p.niveladores)], ['Placas de montaje', P_(p.placasm)], ['Observaciones', p.obsBase || '—']]]];
  }
  const specsHTML = (p, c) => '<div class="specs">' + specs(p, c).map(([t, l]) => '<div><h3>' + esc(t) + '</h3><dl>' + l.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd' + (v === 'pendiente' ? ' class="a"' : '') + '>' + esc(v) + '</dd>').join('') + '</dl></div>').join('') + '</div>';

  function cliente(c) {
    const s = M.statsCliente(c);
    main.innerHTML = '<a class="volver" href="#pedidos/clientes">← Clientes</a>' + tit(esc(c.nombre) + (s.frecuente ? ' ' + pill('frecuente', 'v') : ''), [c.telefono, c.email, c.direccion].filter(Boolean).map(esc).join(' · ') || 'Sin datos de contacto', '<div class="tit-b"><button class="b" id="ed-c">Editar datos</button><button class="b negro" id="np">＋ Nuevo pedido para ' + esc(c.nombre.split(' ')[0]) + '</button></div>')
      + '<section class="kpis tres">' + kpi('Ha comprado', pesos(s.precio), '', s.ps.length + ' pedido' + (s.ps.length === 1 ? '' : 's')) + kpi('Nos ha pagado', pesos(s.pagado), 'v') + kpi('Nos debe', pesos(s.debe), s.debe ? 'r' : 'v') + '</section>'
      + '<section class="caja"><h2>Sus pedidos</h2><div class="lista">' + (s.ps.map(([p, x]) => filaPedido(p, x)).join('') || vacioTxt('Sin pedidos.')) + '</div></section>'
      + '<section class="caja"><h2>Todos sus pagos</h2>' + (() => { const ms = M.movs.filter(m => N.esIn(m) && s.ps.some(([p]) => p.id === m.pedido)); return ms.length ? '<div class="lista">' + ms.slice().reverse().map(filaMov).join('') + '</div>' : vacioTxt('Sin pagos.'); })() + '</section>';
    $('#np').onclick = () => alta(null, c.id); $('#ed-c').onclick = () => hojaCliente(c); enlazarFilas(); enlazarMovs();
  }
  function hojaCliente(c) {
    hoja('Datos del cliente', '<label class="campo">Nombre<input id="c-n" value="' + esc(c.nombre) + '"></label><label class="campo">Teléfono<input id="c-t" inputmode="tel" value="' + esc(c.telefono || '') + '"></label><label class="campo">Email<input id="c-e" value="' + esc(c.email || '') + '"></label><label class="campo">Dirección<input id="c-d" value="' + esc(c.direccion || '') + '"></label><button class="b negro grande" id="c-ok">Guardar</button>', h => {
      $('#c-ok', h).onclick = async () => { const x = { nombre: $('#c-n', h).value.trim(), telefono: $('#c-t', h).value.trim() || null, email: $('#c-e', h).value.trim() || null, direccion: $('#c-d', h).value.trim() || null }; if (!x.nombre) return aviso('Escribe el nombre.');
        if (!await clave('Guardar datos del cliente', [['Cliente', x.nombre], ['Teléfono', x.telefono || '—'], ['Dirección', x.direccion || '—']])) return; cerrarHoja(); await guardarYa(() => A.nodoCambia('dinero/clientes/' + c.id, x), 'Cliente guardado', 'Editó cliente ' + x.nombre); };
    });
  }

  function deuda(x) {
    const s = M.statsDeuda(x);
    main.innerHTML = '<a class="volver" href="#pedidos/deudas">← A quién le debemos</a>' + tit(esc(x.nombre) + ' ' + pill(x.tipo === 'prestamo' ? 'prestamista' : x.tipo || 'otro'), (x.telefono ? esc(x.telefono) + ' · ' : '') + (x.vence ? 'vence ' + fC(x.vence) + ' (' + enDias(s.dias) + ')' : 'sin fecha para pagar') + (x.notas ? ' · ' + esc(x.notas) : ''),
      '<div class="tit-b"><button class="b" id="ed-d">Editar</button><button class="b negro" id="pagar">Pagarle</button></div>')
      + '<section class="kpis tres">' + kpi(x.tipo === 'prestamo' ? 'Nos ha prestado' : 'Le debíamos', pesos(s.prestado)) + kpi('Le hemos pagado', pesos(s.pagado), 'v') + kpi('Le debemos', pesos(s.falta), s.falta > 0 ? 'r' : 'v') + '</section>'
      + '<button class="b" id="prestar">＋ Nos prestó más</button>'
      + '<div class="dos"><section class="caja"><h2>Lo que nos ha prestado</h2>' + ((num(x.inicial) ? '<div class="fila"><span class="fila-c"><b>Deuda de antes</b><small>la que ya había al anotarla</small></span><span class="fila-d"><b>' + pesos(x.inicial) + '</b></span></div>' : '') + s.prest.concat(s.directo).map(filaMov).join('') || vacioTxt('Nada todavía.')) + '</section>'
      + '<section class="caja"><h2>Lo que le hemos pagado</h2>' + (s.pagos.map(filaMov).join('') || vacioTxt('Nada todavía.')) + '</section></div>'
      + '<section class="caja"><h2>En qué se usó su dinero</h2>' + (s.usado.length ? '<div class="lista">' + s.usado.map(filaMov).join('') + '</div>' : vacioTxt('Todavía no se usa.')) + '</section>';
    $('#ed-d').onclick = () => hojaDeuda(x); $('#pagar').onclick = () => registrar(null, { tipo: 'out', para: 'deuda', deuda: x.id }); $('#prestar').onclick = () => registrar(null, { tipo: 'in', origen: 'prestamo', deuda: x.id }); enlazarMovs();
  }
  function hojaDeuda(x) {
    x = x || {}; let tipo = x.tipo || 'proveedor';
    hoja(x.id ? 'Editar deuda' : 'Nueva deuda o prestamista', '<label class="campo">¿A quién se le debe?<input id="d-n" maxlength="60" value="' + esc(x.nombre || '') + '" placeholder="ej. Quarmol, Isaac, tarjeta…"></label>'
      + '<div class="campo">¿Qué es?<div class="chips" id="d-t">' + [['prestamo', 'Prestamista'], ['proveedor', 'Proveedor / herrero'], ['otro', 'Otro']].map(([k, t]) => '<button data-v="' + k + '"' + (tipo === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div></div>'
      + '<div class="dos-i"><label class="campo">Lo que ya se le debía<input id="d-i" inputmode="decimal" value="' + esc(x.inicial || '') + '" placeholder="$0"></label><label class="campo">¿Para cuándo?<input id="d-v" type="date" value="' + esc(x.vence || '') + '"></label></div>'
      + '<label class="campo">Teléfono (opcional)<input id="d-tel" inputmode="tel" value="' + esc(x.telefono || '') + '"></label><label class="campo">Notas (intereses, acuerdos…)<textarea id="d-o">' + esc(x.notas || '') + '</textarea></label>'
      + '<p class="nota">Si alguien nos presta dinero después, se registra en <b>Registrar dinero → Entró → Préstamo</b> y se suma solo.</p><button class="b negro grande" id="d-ok">Guardar</button>' + (x.id ? '<button class="b rojo" id="d-b">Borrar</button>' : ''), h => {
      $$('#d-t [data-v]', h).forEach(b => b.onclick = () => { tipo = b.dataset.v; $$('#d-t [data-v]', h).forEach(o => o.classList.toggle('on', o === b)); });
      $('#d-ok', h).onclick = async () => {
        const d = { nombre: $('#d-n', h).value.trim().slice(0, 60), tipo, inicial: num($('#d-i', h).value) || null, vence: $('#d-v', h).value || null, telefono: $('#d-tel', h).value.trim() || null, notas: $('#d-o', h).value.trim() || null };
        if (!d.nombre) return aviso('Escribe a quién.');
        if (!await clave(x.id ? 'Guardar deuda' : 'Anotar deuda', [['A quién', d.nombre], ['Qué es', tipo], ['Ya se le debía', pesos(d.inicial || 0)], ['Vence', d.vence ? fC(d.vence) : 'sin fecha']])) return;
        cerrarHoja(); let id = x.id; await guardarYa(async () => { if (id) await A.nodoCambia('dinero/deudas/' + id, d); else id = await A.nodoAgrega('dinero/deudas', d); }, 'Deuda guardada', (x.id ? 'Editó deuda ' : 'Anotó deuda ') + d.nombre + ' ' + pesos(d.inicial || 0)); location.hash = '#d=' + id;
      };
      if (x.id) $('#d-b', h).onclick = async () => { if (M.movs.some(m => m.deuda === x.id || (m.fondo || '').endsWith(':' + x.id))) return aviso('Tiene movimientos. Bórralos o cámbialos primero.'); if (!await clave('Borrar deuda', [['A quién', x.nombre]])) return; cerrarHoja(); await guardarYa(() => A.nodoBorra('dinero/deudas/' + x.id), 'Deuda borrada', 'Borró deuda ' + x.nombre); location.hash = '#pedidos/deudas'; };
    });
  }

  // ================= DINERO =================
  let perDin = 'mes', filDin = 'todos', qDin = '';
  function dinero() {
    const T = M.totales(), h = hoy(), y = h.slice(0, 4), mes = h.slice(0, 7), pm = (() => { const d = new Date(+y, +h.slice(5, 7) - 2, 1); return N.ymd(d).slice(0, 7); })();
    const enPer = m => perDin === 'todo' || (perDin === 'mes' ? m.fecha.slice(0, 7) === mes : perDin === 'pasado' ? m.fecha.slice(0, 7) === pm : m.fecha.slice(0, 4) === y);
    const ms = M.movs.filter(enPer), e = ms.filter(N.esIn).reduce((a, m) => a + num(m.monto), 0), sa = ms.filter(m => !N.esIn(m) && (m.fondo || '').slice(0, 3) !== 'pd:').reduce((a, m) => a + num(m.monto), 0);
    const cats = Object.entries(ms.filter(m => !N.esIn(m)).reduce((o, m) => { o[m.cat || 'Otro'] = (o[m.cat || 'Otro'] || 0) + num(m.monto); return o; }, {})).sort((a, b) => b[1] - a[1]), totC = cats.reduce((a, [, v]) => a + v, 0);
    const fondos = M.fondos().filter(f => f.saldo || M.movs.some(m => m.fondo === f.f));
    const ganancias = T.ps.filter(([, s]) => s.ent || s.sal || s.precio);
    main.innerHTML = tit('Dinero', 'Todo el dinero: cuánto hay, quién lo tiene, de dónde vino, en qué se fue y cuánto se gana o se pierde.', '<button class="b negro" id="reg-d">＋ Registrar dinero</button>')
      + '<section class="kpis">' + kpi('Dinero con nosotros hoy', pesos(T.caja), cls(T.caja), 'entró ' + pesos(T.ent) + ' − salió ' + pesos(T.sal)) + Object.entries(T.porQuien).map(([q, v]) => kpi('Lo tiene ' + esc(q), pesos(v), cls(v), v < 0 ? 'puso de su bolsa' : '')).join('')
        + kpi('En efectivo', pesos(T.porMetodo.Efectivo)) + kpi('En banco', pesos(T.porMetodo.Banco)) + (T.porMetodo['Sin decir'] ? kpi('Sin decir cómo', pesos(T.porMetodo['Sin decir']), 'a', 'aclara si fue efectivo o banco') : '') + '</section>'
      + '<section class="caja"><div class="caja-t"><h2>Por periodo</h2><div class="chips" id="per">' + [['mes', 'Este mes'], ['pasado', 'Mes pasado'], ['anio', 'Este año'], ['todo', 'Todo']].map(([k, t]) => '<button data-v="' + k + '"' + (perDin === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div></div>'
        + '<div class="kpis tres sin">' + kpi('Entró', pesos(e), 'v') + kpi('Salió', pesos(sa), 'r') + kpi('Resultado', pesos(e - sa), cls(e - sa)) + '</div>'
        + '<h3>En qué se fue el dinero</h3>' + (cats.length ? '<ul class="barras">' + cats.map(([k, v]) => '<li><span>' + esc(k) + '</span><i><em style="width:' + Math.max(2, v / totC * 100) + '%"></em></i><b>' + pesos(v) + '</b></li>').join('') + '</ul>' : vacioTxt('Sin salidas en este periodo.')) + '</section>'
      + '<div class="dos"><section class="caja"><h2>Ganancias y pérdidas por pedido</h2>' + (ganancias.length ? '<div class="tabla"><table><thead><tr><th>Pedido</th><th>Precio</th><th>Cobrado</th><th>Gastado</th><th>Ganancia</th></tr></thead><tbody>'
          + ganancias.map(([p, s]) => { const g = p.cerrado ? s.gananciaReal : s.ganancia; return '<tr><td><a href="#p=' + esc(p.id) + '">' + esc(M.nomPedido(p)) + '</a>' + (p.cerrado ? ' ' + pill('real', 'v') : '') + '</td><td>' + (s.precio ? pesos(s.precio) : '<span class="a">—</span>') + '</td><td>' + pesos(s.ent) + '</td><td>' + pesos(s.sal) + '</td><td class="' + (g != null ? cls(g) : '') + '">' + (g != null ? pesos(g) : '<span class="a">falta dato</span>') + '</td></tr>'; }).join('')
          + '</tbody><tfoot><tr><td>Gastos generales</td><td></td><td></td><td>' + pesos(T.gastoGeneral) + '</td><td class="r">' + pesos(-T.gastoGeneral) + '</td></tr><tr><td>Ganancia esperada (activos)</td><td></td><td></td><td></td><td class="' + cls(T.ganEsp) + '">' + pesos(T.ganEsp) + '</td></tr><tr><td>Pérdidas por fallas (ya incluidas arriba)</td><td></td><td></td><td></td><td class="r">' + pesos(-T.perdidas) + '</td></tr><tr><td>Ganancia real (finalizados)</td><td></td><td></td><td></td><td class="' + cls(T.ganReal) + '">' + pesos(T.ganReal) + '</td></tr></tfoot></table></div>' : vacioTxt('Sin pedidos con dinero.')) + '</section>'
      + '<section class="caja"><h2>De quién es el dinero que hay</h2><p class="nota">Cada cliente, préstamo y la caja general es una "bolsa". Si una bolsa queda en negativo, se usó dinero de otro.</p>'
        + (fondos.length ? '<ul class="fondos">' + fondos.map(f => '<li><span>' + esc(f.nombre) + '</span><b class="' + cls(f.saldo) + '">' + pesos(f.saldo) + '</b></li>').join('') + '</ul>' : vacioTxt('Sin bolsas.')) + '</section></div>'
      + '<section class="caja"><div class="caja-t"><h2>Movimientos</h2><input id="q" type="search" placeholder="Buscar" value="' + esc(qDin) + '"></div><div class="chips" id="fil">' + [['todos', 'Todos'], ['in', 'Entradas'], ['out', 'Salidas'], ['aclarar', 'Por aclarar · ' + T.porAclarar]].map(([k, t]) => '<button data-v="' + k + '"' + (filDin === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div><div class="lista" id="movs"></div></section>';
    const pintar = () => { const q = qDin.trim().toLowerCase(); const l = M.movs.filter(m => (filDin === 'todos' || (filDin === 'aclarar' ? m.revisar : m.tipo === filDin)) && (!q || [m.cat, m.nota, m.quien, M.nomPed(m.pedido), (M.deu(m.deuda) || {}).nombre].join(' ').toLowerCase().includes(q))).slice().reverse();
      $('#movs').innerHTML = l.length ? l.map(filaMov).join('') : vacioTxt('Nada aquí.'); enlazarMovs(); };
    $$('#per [data-v]').forEach(b => b.onclick = () => { perDin = b.dataset.v; dinero(); });
    $$('#fil [data-v]').forEach(b => b.onclick = () => { filDin = b.dataset.v; $$('#fil [data-v]').forEach(o => o.classList.toggle('on', o === b)); pintar(); });
    $('#q').oninput = e => { qDin = e.target.value; pintar(); };
    $('#reg-d').onclick = () => registrar(); pintar();
  }
  function filaMov(m) {
    const de = m.pedido ? M.nomPed(m.pedido) : m.deuda ? ((M.deu(m.deuda) || {}).nombre || '') : 'General', i = N.esIn(m);
    return '<button class="mov ' + (i ? 'in' : 'out') + '" data-mov="' + esc(m.id) + '"><i>' + (i ? '+' : '−') + '</i><span><b>' + (m.revisar ? pill('aclarar', 'a') + ' ' : '') + esc(m.cat || '') + ' · ' + esc(de) + '</b><small>' + [m.quien, m.metodo || 'sin decir cómo', !i ? 'de: ' + M.nomFondo(m.fondo) : '', m.nota].filter(Boolean).map(esc).join(' · ') + '</small></span><em>' + (i ? '+' : '−') + pesos(m.monto).replace('−', '') + '<small>' + fC(m.fecha) + '</small></em></button>';
  }
  function enlazarMovs() { $$('[data-mov]').forEach(b => b.onclick = () => registrar(M.movs.find(m => m.id === b.dataset.mov))); }

  // ================= SOBRANTES =================
  let medDisp = '';
  function sobrantes() {
    const disp = M.sobrantes.filter(s => s.estado !== 'usado'), usados = M.sobrantes.filter(s => s.estado === 'usado');
    const porPiedra = {}; disp.forEach(s => { (porPiedra[s.piedra || 'Sin piedra'] = porPiedra[s.piedra || 'Sin piedra'] || []).push(s); });
    const area = disp.reduce((a, s) => a + num(s.w) * num(s.h), 0) / 10000;
    main.innerHTML = tit('Sobrantes de piedra', 'Los pedazos que van quedando de cada placa, y para cuántas grapas alcanzan.', '<button class="b negro" id="ns">＋ Agregar sobrante</button>')
      + '<section class="kpis tres">' + kpi('Sobrantes disponibles', String(disp.length)) + kpi('Piedra guardada', area.toFixed(2) + ' m²') + kpi('Ya usados', String(usados.length)) + '</section>'
      + '<section class="caja"><h2>¿Me alcanza?</h2><p class="nota">Escribe una medida (cm) y te digo en qué sobrantes cabe y cuántas salen.</p><div class="dos-i"><input id="mq" placeholder="ej. 60×60 o Ø70" value="' + esc(medDisp) + '"><span id="mr" class="sub"></span></div></section>'
      + (Object.keys(porPiedra).length ? Object.entries(porPiedra).map(([pi, l]) => '<section class="caja"><h2>' + esc(pi) + ' · ' + l.length + '</h2><div class="sobs">' + l.map(tarjetaSobrante).join('') + '</div></section>').join('') : '<section class="caja">' + vacioTxt('No hay sobrantes anotados. Al marcar la placa de un pedido como comprada, te sugiero los sobrantes que deja.') + '</section>')
      + (usados.length ? '<section class="caja"><h2>Usados · ' + usados.length + '</h2><div class="sobs">' + usados.map(tarjetaSobrante).join('') + '</div></section>' : '');
    $('#ns').onclick = () => hojaSobrante();
    const calc = () => { medDisp = $('#mq').value; const m = medDisp.match(/(ø|o)?\s*(\d+(?:\.\d+)?)\s*(?:[x×*]\s*(\d+(?:\.\d+)?))?/i); if (!m) { $('#mr').textContent = ''; $$('.sob').forEach(x => x.classList.remove('cabe', 'nocabe')); return; }
      const w = +m[2], h = m[3] ? +m[3] : w; let tot = 0; disp.forEach(s => { const n = N.cuantasCaben(num(s.w), num(s.h), w, h), el = $('[data-sob="' + s.id + '"]'); if (el) { el.classList.toggle('cabe', n > 0); el.classList.toggle('nocabe', !n); const q = $('.sob-q', el); if (q) q.textContent = n ? 'Salen ' + n : 'No cabe'; } tot += n; });
      $('#mr').innerHTML = tot ? '<b class="v">Salen ' + tot + ' de ' + w + '×' + h + '</b> en total' : '<b class="r">No cabe en ningún sobrante</b>'; };
    $('#mq').oninput = calc; calc();
    $$('[data-sob]').forEach(el => el.onclick = e => { if (e.target.closest('button')) return; hojaSobrante(M.sobrantes.find(s => s.id === el.dataset.sob)); });
    $$('[data-usar]').forEach(b => b.onclick = () => usarSobrante(M.sobrantes.find(s => s.id === b.dataset.usar)));
  }
  function alcanza(s) { return piezas.map(p => { const w = p.forma === 'red' ? +p.d : +p.w, h = p.forma === 'red' ? +p.d : +p.h; return { et: p.nombre + ' ' + (p.forma === 'red' ? 'Ø' + p.d : p.w + '×' + p.h), n: N.cuantasCaben(num(s.w), num(s.h), w, h) }; }).filter(x => x.n > 0); }
  function tarjetaSobrante(s) {
    const al = alcanza(s), W = 200, esc2 = W / 320, sw = num(s.w) * esc2, sh = num(s.h) * esc2;
    return '<div class="sob' + (s.estado === 'usado' ? ' usado' : '') + '" data-sob="' + esc(s.id) + '"><svg viewBox="0 0 ' + W + ' 100" aria-hidden="true"><rect x="0.5" y="0.5" width="' + (W - 1) + '" height="99" class="placa"/><rect x="0.5" y="0.5" width="' + Math.max(2, sw - 1) + '" height="' + Math.max(2, sh - 1) + '" class="pieza"/></svg>'
      + '<b>' + num(s.w) + ' × ' + num(s.h) + ' cm</b><small>' + (s.pedido ? 'De ' + esc(M.nomPed(s.pedido)) : 'Sin pedido de origen') + (s.fecha ? ' · ' + fC(s.fecha) : '') + '</small>'
      + (s.estado === 'usado' ? '<small>Usado' + (s.usadoEn ? ' en ' + esc(s.usadoEn) : '') + '</small>' : '<small class="sob-q"></small><p class="alc">' + (al.length ? 'Alcanza para: ' + al.map(x => '<b>' + x.n + '</b> ' + esc(x.et)).join(' · ') : 'No alcanza para ninguna grapa del catálogo') + '</p><button class="b chico" data-usar="' + esc(s.id) + '">Marcar usado</button>') + '</div>';
  }
  function hojaSobrante(s, pre) {
    s = s || {}; pre = pre || {}; let piedra = s.piedra || pre.piedra || '';
    hoja(s.id ? 'Editar sobrante' : 'Agregar sobrante', '<div class="campo">Piedra<div class="chips" id="sp">' + C.PIEDRAS.map(x => '<button data-v="' + esc(x) + '"' + (piedra === x ? ' class="on"' : '') + '>' + esc(x) + '</button>').join('') + '</div></div>'
      + '<div class="dos-i"><label class="campo">Largo (cm)<input id="s-w" inputmode="decimal" value="' + esc(s.w || pre.w || '') + '"></label><label class="campo">Ancho (cm)<input id="s-h" inputmode="decimal" value="' + esc(s.h || pre.h || '') + '"></label></div>'
      + '<label class="campo">¿De qué pedido sobró?<select id="s-p"><option value="">Ninguno</option>' + M.pedidos.map(p => '<option value="' + esc(p.id) + '"' + ((s.pedido || pre.pedido) === p.id ? ' selected' : '') + '>' + esc(M.nomPedido(p)) + '</option>').join('') + '</select></label>'
      + '<label class="campo">Nota<input id="s-n" value="' + esc(s.nota || '') + '"></label><button class="b negro grande" id="s-ok">Guardar</button>' + (s.id ? '<button class="b rojo" id="s-b">Borrar</button>' : ''), h => {
      $$('#sp [data-v]', h).forEach(b => b.onclick = () => { piedra = b.dataset.v; $$('#sp [data-v]', h).forEach(o => o.classList.toggle('on', o === b)); });
      $('#s-ok', h).onclick = async () => {
        const x = { piedra, w: num($('#s-w', h).value), h: num($('#s-h', h).value), pedido: $('#s-p', h).value || null, nota: $('#s-n', h).value.trim() || null, fecha: s.fecha || hoy(), estado: s.estado || 'disponible' };
        if (!x.piedra || !x.w || !x.h) return aviso('Pon la piedra y las dos medidas.');
        if (!await clave('Guardar sobrante', [['Piedra', x.piedra], ['Medida', x.w + ' × ' + x.h + ' cm'], ['De', x.pedido ? M.nomPed(x.pedido) : '—']])) return;
        cerrarHoja(); await guardarYa(() => s.id ? A.nodoCambia('dinero/sobrantes/' + s.id, x) : A.nodoAgrega('dinero/sobrantes', x), 'Sobrante guardado', 'Sobrante ' + x.piedra + ' ' + x.w + '×' + x.h);
      };
      if (s.id) $('#s-b', h).onclick = async () => { if (!await clave('Borrar sobrante', [['Sobrante', s.piedra + ' ' + s.w + '×' + s.h]])) return; cerrarHoja(); await guardarYa(() => A.nodoBorra('dinero/sobrantes/' + s.id), 'Sobrante borrado', 'Borró sobrante ' + s.piedra + ' ' + s.w + '×' + s.h); };
    });
  }
  async function usarSobrante(s) {
    hoja('Usar sobrante', '<p>' + esc(s.piedra) + ' ' + num(s.w) + ' × ' + num(s.h) + ' cm</p><label class="campo">¿En qué se usó?<input id="u-t" placeholder="ej. 2 grapas Equilibrio Ø60 · pedido de Saúl"></label><button class="b negro grande" id="u-ok">Marcar usado</button>', h => {
      $('#u-ok', h).onclick = async () => { const t = $('#u-t', h).value.trim(); if (!t) return aviso('Escribe en qué se usó.'); if (!await clave('Marcar sobrante usado', [['Sobrante', s.piedra + ' ' + s.w + '×' + s.h], ['Usado en', t]])) return; cerrarHoja(); await guardarYa(() => A.nodoCambia('dinero/sobrantes/' + s.id, { estado: 'usado', usadoEn: t }), 'Sobrante usado', 'Usó sobrante ' + s.piedra + ' en ' + t); };
    });
  }
  function sobrantesDePedido(p) {
    const ya = M.sobrantes.filter(s => s.pedido === p.id), sug = N.sobrantesDe(num(p.largo), p.forma === 'Redonda' ? num(p.largo) : num(p.ancho));
    if (!ya.length && !(sug.length && M.statsPedido(p).pasos[2].done)) return '';
    return '<section class="caja"><div class="caja-t"><h2>Sobrantes de su placa</h2></div>' + (ya.length ? '<div class="sobs">' + ya.map(tarjetaSobrante).join('') + '</div>' : '<p class="nota">De una placa de 320×160 cortando ' + num(p.largo) + '×' + num(p.ancho) + ' sobran:</p><div class="chips">' + sug.map((r, i) => '<button data-sug="' + i + '">＋ ' + r.w + ' × ' + r.h + ' cm</button>').join('') + '</div>') + '</section>';
  }
  function enlazarSobrantesPedido(p) { const sug = N.sobrantesDe(num(p.largo), p.forma === 'Redonda' ? num(p.largo) : num(p.ancho)); $$('[data-sug]').forEach(b => b.onclick = () => hojaSobrante(null, Object.assign({ piedra: otra(p.color, p.colorOtra), pedido: p.id }, sug[+b.dataset.sug]))); $$('.sobs [data-usar]').forEach(b => b.onclick = () => usarSobrante(M.sobrantes.find(s => s.id === b.dataset.usar))); }

  // ================= AJUSTES =================
  function ajustes() {
    const bit = Object.entries(D.bitacora || {}).map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => (b.creado || 0) - (a.creado || 0));
    main.innerHTML = tit('Ajustes', esc(me.nombre || '') + (A.demo ? ' · modo prueba (no toca datos reales)' : ''), '<button class="b" id="salir">Salir</button>')
      + '<div class="dos"><section class="caja"><h2>Pendientes de arreglar</h2><ul class="links">'
        + '<li><a href="taller.html#cotizar">Cotizaciones<small>Hay que ajustar los precios y conectarlas con los clientes reales. Es lo siguiente.</small></a></li>'
        + '<li><a href="taller.html#clientes">Solicitudes de la página<small>Lo que piden los clientes en dkas.mx (va aparte de los pedidos).</small></a></li>'
        + '<li><a href="taller.html#piedra">Inventario de placas (viejo)<small>Se va a juntar con Sobrantes.</small></a></li>'
        + '<li><a href="taller.html#equipo">Administradores<small>Quién más puede entrar.</small></a></li>'
        + '<li><a href="taller.html">Panel anterior<small>Todo lo viejo sigue ahí mientras terminamos de pasarlo.</small></a></li></ul></section>'
      + '<section class="caja"><h2>Clave para confirmar</h2><p class="nota">Todo lo importante pide la clave antes de guardarse: registrar o borrar dinero, dar de alta o editar pedidos, marcar pasos, deudas y sobrantes. Es una confirmación para que nada se guarde por error; lo que protege el panel es el código de 6 números para entrar.</p></section></div>'
      + '<section class="caja"><h2>Auditoría · ' + bit.length + '</h2><p class="nota">Cada cosa que se confirma con la clave queda aquí: quién, cuándo y qué.</p>'
        + (bit.length ? '<div class="tabla"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th></tr></thead><tbody>' + bit.slice(0, 200).map(b => { const d = new Date(b.creado || 0); return '<tr><td>' + fC(N.ymd(d)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</td><td>' + esc(b.por || '') + '</td><td><b>' + esc(b.accion) + '</b><br><small>' + esc(b.detalle || '') + '</small></td></tr>'; }).join('') + '</tbody></table></div>' : vacioTxt('Todavía no hay nada registrado.')) + '</section>';
    $('#salir').onclick = () => { A.logout(); location.hash = ''; arrancar(); };
  }

  // ================= REGISTRAR DINERO (lo central: todo se conecta aquí) =================
  function registrar(ed, pre) {
    pre = pre || {};
    const d = ed ? { tipo: ed.tipo, monto: String(ed.monto), cat: ed.cat || '', fecha: ed.fecha, quien: ed.quien || '', metodo: ed.metodo || '', nota: ed.nota || '', pedido: ed.pedido || '', deuda: ed.deuda || '', fondo: ed.fondo || '',
      origen: ed.tipo === 'in' ? (ed.pedido ? 'pedido' : ed.deuda ? 'prestamo' : ed.revisar ? '' : 'otro') : '', para: ed.tipo === 'out' ? (ed.pedido ? 'pedido' : ed.deuda ? 'deuda' : ed.revisar ? '' : 'general') : '', nuevoPrest: '' }
      : { tipo: pre.tipo || '', monto: '', cat: '', fecha: hoy(), quien: (() => { try { return localStorage.getItem('dkas-quien') || ''; } catch (e) { return ''; } })(), metodo: '', nota: '', pedido: pre.pedido || '', deuda: pre.deuda || '', fondo: '', origen: pre.origen || (pre.pedido && pre.tipo === 'in' ? 'pedido' : ''), para: pre.para || (pre.pedido ? 'pedido' : ''), nuevoPrest: '' };
    if (pre.pedido && !pre.tipo) d.tipo = '';
    const gente = [...new Set(['Zury', 'David'].concat(M.movs.filter(m => (m.fondo || '').slice(0, 3) !== 'pd:').map(m => m.quien).filter(Boolean)))];
    const activos = M.pedidos.filter(p => !p.cerrado || p.id === d.pedido);
    const chips = (k, l, val) => '<div class="chips" data-k="' + k + '">' + l.map(([v, t, sub]) => '<button data-v="' + esc(v) + '"' + (val === v ? ' class="on"' : '') + '>' + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>').join('') + '</div>';
    const falta = () => [!N.num(d.monto) && 'cantidad', d.tipo === 'in' && !d.origen && 'de dónde viene', d.tipo === 'in' && d.origen === 'pedido' && !d.pedido && 'de qué pedido', d.tipo === 'in' && d.origen === 'prestamo' && !d.deuda && !d.nuevoPrest.trim() && 'quién prestó',
      d.tipo === 'out' && !d.para && 'para qué es', d.tipo === 'out' && d.para === 'pedido' && !d.pedido && 'de qué pedido', d.tipo === 'out' && d.para === 'deuda' && !d.deuda && 'a qué deuda', !d.cat && 'concepto',
      d.tipo === 'out' && !d.fondo && 'de qué dinero sale', d.tipo === 'out' && d.fondo === 'pd:' && !d.nuevoPrest.trim() && 'quién lo pagó', !d.quien && (d.tipo === 'in' ? 'quién lo recibió' : 'quién lo pagó'), !d.metodo && 'cómo', !d.fecha && 'fecha'].filter(Boolean);
    hoja(ed ? 'Corregir movimiento' : 'Registrar dinero', '<div id="rg"></div>', h => {
      const pintar = () => {
        const S = (d.pedido && M.ped(d.pedido)) ? M.statsPedido(M.ped(d.pedido)) : null;
        if (d.tipo === 'in' && d.origen === 'pedido' && S && !d.cat) d.cat = S.ent === 0 ? 'Anticipo' : (S.precio && S.ent + N.num(d.monto) >= S.precio ? 'Liquidación' : 'Abono');
        const conceptos = d.tipo === 'in' ? (d.origen === 'pedido' ? ['Anticipo', 'Abono', 'Liquidación'] : d.origen === 'prestamo' ? ['Préstamo'] : ['Otro ingreso', 'Saldo inicial'])
          : d.para === 'deuda' ? ['Pago de deuda'] : d.para === 'general' ? C.GASTO_GENERAL : C.GASTO_PEDIDO;
        if (conceptos.length === 1) d.cat = conceptos[0];
        const fondos = M.fondos().filter(f => f.saldo > 0 || f.f === d.fondo).sort((a, b) => (b.f === 'p:' + d.pedido) - (a.f === 'p:' + d.pedido) || b.saldo - a.saldo);
        const montoN = N.num(d.monto), fSel = fondos.find(f => f.f === d.fondo), sobregiro = d.tipo === 'out' && fSel && montoN > fSel.saldo + (ed && ed.fondo === d.fondo ? N.num(ed.monto) : 0);
        const f = d.tipo ? falta() : [];
        $('#rg', h).innerHTML = (ed && ed.revisar ? '<p class="aviso">Este movimiento está por aclarar. Complétalo y guárdalo para quitarle la marca.</p>' : '')
          + '<div class="tipo"><button data-t="in" class="' + (d.tipo === 'in' ? 'on in' : '') + '">↓ Entró dinero</button><button data-t="out" class="' + (d.tipo === 'out' ? 'on out' : '') + '">↑ Salió dinero</button></div>'
          + (!d.tipo ? '' : '<label class="campo monto">Cantidad<input id="r-m" inputmode="decimal" placeholder="$0" value="' + esc(d.monto) + '"></label>'
          + (d.tipo === 'in'
            ? '<div class="campo">¿De dónde viene?' + chips('origen', [['pedido', 'Pago de un cliente'], ['prestamo', 'Préstamo'], ['otro', 'Otro ingreso']], d.origen) + '</div>'
              + (d.origen === 'pedido' ? '<div class="campo">¿De qué pedido?' + chips('pedido', activos.map(p => { const s = M.statsPedido(p); return [p.id, M.nomPedido(p), s.precio ? 'debe ' + pesos(Math.max(s.porCobrar, 0)) : 'sin precio']; }), d.pedido) + '</div>' : '')
              + (d.origen === 'prestamo' ? '<div class="campo">¿Quién nos prestó?' + chips('deuda', M.deudas.map(x => [x.id, x.nombre, 'le debemos ' + pesos(M.statsDeuda(x).falta)]).concat([['__nuevo', '＋ Prestamista nuevo']]), d.deuda || (d.nuevoPrest ? '__nuevo' : '')) + (d.deuda === '__nuevo' || (!d.deuda && d.nuevoPrest) ? '<input id="r-np" placeholder="Nombre de quien prestó (se le crea su panel)" value="' + esc(d.nuevoPrest) + '">' : '') + '</div>' : '')
            : '<div class="campo">¿Para qué es?' + chips('para', [['pedido', 'Gasto de un pedido'], ['deuda', 'Pagar una deuda'], ['general', 'Gasto general']], d.para) + '</div>'
              + (d.para === 'pedido' ? '<div class="campo">¿De qué pedido?' + chips('pedido', activos.map(p => [p.id, M.nomPedido(p), piezaTxt(p).slice(0, 34)]), d.pedido) + '</div>' : '')
              + (d.para === 'deuda' ? '<div class="campo">¿A quién le pagamos?' + chips('deuda', M.deudas.map(x => [x.id, x.nombre, 'le debemos ' + pesos(M.statsDeuda(x).falta)]), d.deuda) + (M.deudas.length ? '' : '<p class="nota">No hay deudas anotadas. Anótala primero en Pedidos → A quién le debemos.</p>') + '</div>' : ''))
          + '<div class="campo">Concepto' + chips('cat', conceptos.map(x => [x, x]), d.cat) + '</div>'
          + (d.tipo === 'out' ? '<div class="campo">¿De qué dinero sale?' + chips('fondo', fondos.map(x => [x.f, x.nombre, 'hay ' + pesos(x.saldo)]).concat([['caja', 'Caja general', 'hay ' + pesos(M.saldoFondo('caja'))], ['pd:', 'Lo pagó alguien directo (préstamo)', 'se suma a lo que le debemos']]).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i), d.fondo.slice(0, 3) === 'pd:' ? 'pd:' : d.fondo)
              + (d.fondo.slice(0, 3) === 'pd:' ? chips('pdq', M.deudas.map(x => ['pd:' + x.id, x.nombre]).concat([['pd:__nuevo', '＋ Alguien nuevo']]), d.fondo === 'pd:' && d.nuevoPrest ? 'pd:__nuevo' : d.fondo) + (d.fondo === 'pd:' || d.fondo === 'pd:__nuevo' ? '<input id="r-np" placeholder="¿Quién lo pagó? (se le crea su panel de deuda)" value="' + esc(d.nuevoPrest) + '">' : '') : '')
              + (sobregiro ? '<p class="aviso r">' + esc(fSel.nombre) + ' solo tiene ' + pesos(fSel.saldo) + '. Quedaría en ' + pesos(fSel.saldo - montoN) + ': se estaría usando dinero de otro.</p>' : '')
              + (d.para === 'pedido' && d.pedido && d.fondo && d.fondo !== 'p:' + d.pedido && d.fondo.slice(0, 2) === 'p:' ? '<p class="aviso">Quedará anotado: <b>' + esc(M.nomFondo(d.fondo)) + ' se usó para pagar el pedido de ' + esc(M.nomPed(d.pedido)) + '</b>.</p>' : '') + '</div>' : '')
          + '<div class="campo">' + (d.tipo === 'in' ? '¿Quién lo recibió?' : '¿Quién lo pagó?') + chips('quien', gente.map(x => [x, x]), d.quien) + '</div>'
          + '<div class="campo">' + (d.tipo === 'in' ? '¿Cómo pagó?' : '¿Con qué se pagó?') + chips('metodo', C.METODOS.map(x => [x, x]), d.metodo) + '</div>'
          + '<div class="dos-i"><label class="campo">Fecha<input id="r-f" type="date" value="' + esc(d.fecha) + '"></label><label class="campo">Nota (opcional)<input id="r-n" maxlength="80" value="' + esc(d.nota) + '" placeholder="ej. flete de ida"></label></div>'
          + (f.length ? '<p class="falta">Falta: ' + esc(f.join(', ')) + '</p>' : '')
          + '<button class="b negro grande" id="r-ok"' + (f.length ? ' disabled' : '') + '>Guardar</button>' + (ed ? '<button class="b rojo" id="r-b">Borrar este movimiento</button>' : ''));
        $$('[data-t]', h).forEach(b => b.onclick = () => { d.tipo = b.dataset.t; d.cat = ''; d.fondo = ''; if (d.tipo === 'in') { d.para = ''; } else { d.origen = ''; if (d.pedido) d.para = 'pedido'; } pintar(); if ($('#r-m', h) && !d.monto) $('#r-m', h).focus(); });
        if (!d.tipo) return;
        $$('[data-k]', h).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const k = g.dataset.k, v = b.dataset.v;
          if (k === 'pdq') { d.fondo = v === 'pd:__nuevo' ? 'pd:' : v; if (v !== 'pd:__nuevo') d.nuevoPrest = ''; }
          else if (k === 'deuda' && v === '__nuevo') { d.deuda = ''; d.nuevoPrest = d.nuevoPrest || ' '; }
          else { d[k] = v; if (k === 'origen' || k === 'para') { d.cat = ''; if (v !== 'pedido' && k === 'origen') d.pedido = ''; } if (k === 'pedido' && d.tipo === 'in') d.cat = ''; }
          pintar(); const np = $('#r-np', h); if (np) { np.value = d.nuevoPrest.trim(); np.focus(); } });
        const m = $('#r-m', h); m.oninput = () => { d.monto = m.value.replace(/[^\d.,]/g, ''); const f2 = falta(); $('#r-ok', h).disabled = f2.length > 0; };
        m.onchange = () => pintar();
        $('#r-f', h).onchange = e => { d.fecha = e.target.value; };
        $('#r-n', h).oninput = e => { d.nota = e.target.value; };
        const np = $('#r-np', h); if (np) np.oninput = () => { d.nuevoPrest = np.value; $('#r-ok', h).disabled = falta().length > 0; };
        $('#r-ok', h).onclick = guardar;
        if (ed) $('#r-b', h).onclick = async () => { if (!await clave('Borrar movimiento', [['Movimiento', (ed.tipo === 'in' ? 'Entrada' : 'Salida') + ' de ' + pesos(ed.monto)], ['Concepto', ed.cat || ''], ['Fecha', fC(ed.fecha)]])) return; cerrarHoja(); await guardarYa(() => A.nodoBorra('dinero/movs/' + ed.id), 'Movimiento borrado', 'Borró ' + (ed.tipo === 'in' ? 'entrada' : 'salida') + ' ' + pesos(ed.monto) + ' ' + (ed.cat || '')); };
      };
      async function guardar() {
        if (falta().length) return pintar();
        const monto = N.num(d.monto); if (!(monto > 0)) return aviso('Escribe la cantidad.');
        let deudaId = d.deuda && d.deuda !== '__nuevo' ? d.deuda : '', fondo = d.fondo;
        const nuevo = d.nuevoPrest.trim(), quien = d.tipo === 'in' ? (d.origen === 'pedido' ? M.nomPed(d.pedido) : d.origen === 'prestamo' ? (deudaId ? M.deu(deudaId).nombre : nuevo + ' (nuevo)') : 'Otro ingreso') : (d.para === 'pedido' ? 'Pedido de ' + M.nomPed(d.pedido) : d.para === 'deuda' ? 'Pago a ' + M.deu(d.deuda).nombre : 'Gasto general');
        const lin = [['Cantidad', pesos(monto)], [d.tipo === 'in' ? 'De' : 'Para', quien], ['Concepto', d.cat]];
        if (d.tipo === 'out') lin.push(['Sale de', fondo === 'pd:' ? 'Lo pagó ' + nuevo + ' directo (nuevo)' : M.nomFondo(fondo)]);
        lin.push([d.tipo === 'in' ? 'Lo recibió' : 'Lo pagó', d.quien], ['Cómo', d.metodo], ['Fecha', fC(d.fecha)]);
        if (!await clave((ed ? 'Corregir: ' : '') + (d.tipo === 'in' ? 'Entró dinero' : 'Salió dinero'), lin)) return;
        cerrarHoja();
        await guardarYa(async () => {
          // prestamista nuevo: se le crea su panel de deuda en este momento
          if (d.tipo === 'in' && d.origen === 'prestamo' && !deudaId) deudaId = await A.nodoAgrega('dinero/deudas', { nombre: nuevo.slice(0, 60), tipo: 'prestamo' });
          if (d.tipo === 'out' && fondo === 'pd:') { const id = await A.nodoAgrega('dinero/deudas', { nombre: nuevo.slice(0, 60), tipo: 'prestamo' }); fondo = 'pd:' + id; }
          const x = { tipo: d.tipo, monto, cat: d.cat.slice(0, 30), fecha: d.fecha, quien: d.quien.slice(0, 30), metodo: d.metodo, nota: d.nota.trim().slice(0, 80) || null,
            pedido: (d.tipo === 'in' ? d.origen === 'pedido' : d.para === 'pedido') ? d.pedido : null, deuda: (d.tipo === 'in' ? d.origen === 'prestamo' : d.para === 'deuda') ? deudaId : null, fondo: d.tipo === 'out' ? fondo : null, revisar: null, cliente: null };
          try { localStorage.setItem('dkas-quien', x.quien); } catch (e) {}
          if (ed) await A.nodoCambia('dinero/movs/' + ed.id, x); else { Object.keys(x).forEach(k => x[k] == null && delete x[k]); await A.nodoAgrega('dinero/movs', x); }
        }, (d.tipo === 'in' ? 'Entrada' : 'Salida') + ' de ' + pesos(monto) + ' guardada', (ed ? 'Corrigió ' : 'Registró ') + (d.tipo === 'in' ? 'entrada ' : 'salida ') + pesos(monto) + ' · ' + d.cat + ' · ' + quien);
      }
      pintar();
    });
  }

  // ================= ALTA / EDICIÓN DE PEDIDO (igual que la hoja de papel) =================
  const NUMS = ['largo', 'ancho', 'cantidad', 'altura', 'espesor', 'precio', 'anticipo'];
  const PASOS_ALTA = ['Cliente', 'Pedido', 'Tipo, forma y medidas', 'Cubierta', 'Base de herrería', 'Precio y anticipo', 'Costos'];
  function alta(p0, cliId) {
    p0 = p0 || {}; const w = JSON.parse(JSON.stringify(p0)); w.costos = w.costos || {}; w.pend = w.pend || {};
    if (!w.fecha) w.fecha = hoy(); if (!w.cantidad) w.cantidad = 1; if (!w.folio) w.folio = M.pedidos.reduce((m, p) => Math.max(m, num(p.folio)), 0) + 1;
    let cli = Object.assign({}, M.cli(w.cliente || cliId) || {}), nuevoCli = !cli.id, paso = cli.id && !p0.id ? 1 : 0;
    const costoW = () => N.COST.reduce((a, [k]) => a + num(w.costos[k]), 0);
    const vivo = () => { const co = costoW(), pr = num(w.precio), g = pr && co ? pr - co : null; return '<div class="vivo"><div>Costo<b>' + (co ? pesos(co) : '—') + '</b></div><div>Precio<b>' + (pr ? pesos(pr) : '—') + '</b></div><div>Ganancia<b class="' + (g != null ? cls(g) : '') + '">' + (g != null ? pesos(g) + ' · ' + pct(g / pr) : '—') + '</b></div></div>'; };
    const noTengo = k => '<button type="button" class="nt' + (w.pend[k] ? ' on' : '') + '" data-nt="' + k + '">' + (w.pend[k] ? 'Pendiente ✓' : 'No lo tengo aún') + '</button>';
    const caja = (k, lbl, html) => '<div class="campo-a" data-req="' + k + '"><div class="campo-t"><span>' + lbl + '</span>' + (k ? noTengo(k) : '') + '</div>' + html + '</div>';
    const inp = (k, extra, obj) => '<input data-' + (obj ? 'ck' : 'k') + '="' + k + '" value="' + esc(((obj || w)[k]) == null ? '' : (obj || w)[k]) + '" ' + (extra || '') + '>';
    const area = (k, ph) => '<textarea data-k="' + k + '" maxlength="300" placeholder="' + (ph || '') + '">' + esc(w[k] || '') + '</textarea>';
    const ch = (k, l, otraK, ph) => '<div class="chips" data-g="' + k + '">' + l.map(x => '<button type="button" data-v="' + esc(x) + '"' + (w[k] === x ? ' class="on"' : '') + '>' + esc(x) + '</button>').join('') + '</div>' + (otraK && /^Otr[ao]$/.test(w[k] || '') ? '<input data-k="' + otraK + '" value="' + esc(w[otraK] || '') + '" maxlength="60" placeholder="' + (ph || '¿Cuál?') + '" class="otra">' : '');
    function cuerpo() {
      if (paso === 0) return (p0.id ? '' : '<div class="campo">¿Cliente nuevo o uno que ya tenemos?<div class="chips" id="a-cli"><button data-v="nuevo"' + (nuevoCli ? ' class="on"' : '') + '>＋ Cliente nuevo</button>' + M.clientes.map(c => '<button data-v="' + esc(c.id) + '"' + (cli.id === c.id ? ' class="on"' : '') + '>' + esc(c.nombre) + (M.statsCliente(c).frecuente ? ' ★' : '') + '</button>').join('') + '</div></div>')
        + caja('', 'Nombre del cliente', '<input id="c-nom" value="' + esc(cli.nombre || '') + '" maxlength="80" placeholder="ej. Becky Zaga">')
        + caja('telefono', 'Teléfono / WhatsApp', '<input id="c-tel" inputmode="tel" value="' + esc(cli.telefono || '') + '">') + caja('', 'Email (opcional)', '<input id="c-em" value="' + esc(cli.email || '') + '">') + caja('direccion', 'Dirección de entrega', '<input id="c-dir" value="' + esc(cli.direccion || '') + '">');
      if (paso === 1) return '<p class="folio-g">Nº de pedido <b>' + esc(w.folio) + '</b></p>' + caja('vendedor', 'Vendedor', ch('vendedor', [...new Set(['Zury', 'David'].concat(M.pedidos.map(p => p.vendedor).filter(v => v && v !== 'Otro')))].concat(['Otro']), 'vendedorOtro', 'Nombre del vendedor'))
        + '<div class="dos-i">' + caja('fecha', 'Fecha del pedido', inp('fecha', 'type="date"')) + caja('entrega', 'Fecha de entrega', inp('entrega', 'type="date"')) + '</div>';
      if (paso === 2) { const red = w.forma === 'Redonda'; return caja('forma', 'Forma', ch('forma', C.FORMAS)) + caja('tipo', 'Uso', ch('tipo', C.TIPOS, 'tipoOtra'))
        + caja('medidas', 'Medidas finales (cm)', '<div class="tres-i">' + inp('largo', 'inputmode="decimal" placeholder="' + (red ? 'Diámetro' : 'Largo') + '" aria-label="Largo"') + (red ? '' : inp('ancho', 'inputmode="decimal" placeholder="Ancho" aria-label="Ancho"')) + inp('cantidad', 'inputmode="numeric" placeholder="Cuántas" aria-label="Cuántas"') + '</div><small class="nota">' + (red ? 'Diámetro' : 'Largo · ancho') + ' · cuántas. 3 m = 300.</small>')
        + caja('altura', 'Altura (cm)', inp('altura', 'inputmode="decimal" placeholder="75"') + '<button type="button" class="sug" data-pon="altura" data-val="75">Comedor estándar: 75 cm · usar</button>'); }
      if (paso === 3) return caja('material', 'Tipo de cubierta', ch('material', C.MATERIALES, 'materialOtro')) + caja('marca', 'Marca / proveedor', inp('marca', 'maxlength="60" placeholder="ej. Quarmol"')) + caja('color', 'Color / piedra', ch('color', C.PIEDRAS, 'colorOtra', 'Nombre de la piedra'))
        + caja('acabado', 'Acabado', ch('acabado', C.ACABADOS)) + caja('canto', 'Tipo de canto', ch('canto', C.CANTOS, 'cantoOtro', 'ej. Pulido'))
        + '<div class="dos-i">' + caja('espesor', 'Espesor (mm)', inp('espesor', 'inputmode="decimal" placeholder="12"') + (w.material === 'Piedra sinterizada' && !w.espesor ? '<button type="button" class="sug" data-pon="espesor" data-val="12">Sinterizada: 12 mm · usar</button>' : '')) + caja('refuerzo', 'Refuerzo inferior', ch('refuerzo', C.SINO)) + '</div>'
        + caja('', 'Observaciones (opcional)', area('obsCubierta', 'ej. canto pulido'));
      if (paso === 4) return caja('base', 'Diseño de la base', ch('base', C.BASES, 'baseOtra', 'ej. especial, Base Maestra')) + caja('pintura', 'Color de pintura', inp('pintura', 'maxlength="40" placeholder="ej. Negro"')) + caja('pacabado', 'Acabado de pintura', ch('pacabado', C.ACABADOS))
        + caja('ptipo', 'Tipo de pintura', inp('ptipo', 'maxlength="40" placeholder="ej. Electrostática"')) + '<div class="dos-i">' + caja('niveladores', 'Niveladores', ch('niveladores', C.SINO)) + caja('placasm', 'Placas de montaje', ch('placasm', C.SINO)) + '</div>' + caja('', 'Observaciones (opcional)', area('obsBase'));
      if (paso === 5) { const co = costoW(), sug = co ? Math.ceil(co * N.REGLA / 100) * 100 : null;
        return caja('precio', 'Precio de venta total', inp('precio', 'inputmode="decimal" class="grande" placeholder="$0"') + (sug ? '<button type="button" class="sug" data-pon="precio" data-val="' + sug + '">Con la regla ×1.6 serían ' + pesos(sug) + ' · usar</button>' : ''))
          + caja('anticipo', 'Anticipo acordado', inp('anticipo', 'inputmode="decimal" placeholder="$0"') + (num(w.precio) ? '<button type="button" class="sug" data-pon="anticipo" data-val="' + num(w.precio) / 2 + '">Usar el 50%: ' + pesos(num(w.precio) / 2) + '</button>' : '')) + caja('', 'Notas (opcional)', area('notas')); }
      const sg = N.costosSugeridos(w), f = sg.fraccion;
      return '<p class="nota">' + (num(w.largo) ? 'Con esas medidas usa ' + (f === 0.25 ? '¼ de placa' : f === 0.5 ? 'media placa' : f === 1 ? 'una placa' : f + ' placas') + ' de 320×160.' : 'Pon las medidas para calcular la placa.') + '</p><button type="button" class="b" id="calc">Calcular costos sugeridos</button>'
        + '<div class="dos-i">' + N.COST.map(([k, n]) => caja(k === 'otros' ? '' : 'c.' + k, n + (k === 'otros' ? ' (opcional)' : ''), inp(k, 'inputmode="decimal" placeholder="' + (sg[k] ? pesos(sg[k]) : '$0') + '"', w.costos))).join('') + '</div>'
        + '<p class="nota">Sugeridos con los costos del negocio: placa $9,000 + $500 de corte, corte ala de avión $3,500, MDF y demás $1,500, base de comedor $6,000–7,000, flete $2,000 si no cabe en la minivan. Si un costo no aplica, pon 0.</p>';
    }
    const leer = h => {
      $$('[data-k]', h).forEach(i => { const k = i.dataset.k, v = i.value.trim(); w[k] = NUMS.includes(k) ? (v === '' ? '' : num(v)) : v; });
      $$('[data-ck]', h).forEach(i => { const v = i.value.trim(); w.costos[i.dataset.ck] = v === '' ? '' : num(v); });
      if ($('#c-nom', h)) { cli.nombre = $('#c-nom', h).value.trim(); cli.telefono = $('#c-tel', h).value.trim(); cli.email = $('#c-em', h).value.trim(); cli.direccion = $('#c-dir', h).value.trim(); }
    };
    const faltan = () => N.CAMPOS.filter(([pp, k]) => pp === paso && !N.lleno(paso === 0 ? cli : w, k) && !w.pend[k]).map(x => x[1]);
    hoja(p0.id ? 'Editar pedido' : 'Nuevo pedido', '<div id="al"></div>', h => {
      const pintar = () => {
        $('#al', h).innerHTML = '<div class="pasos-w">' + PASOS_ALTA.map((x, i) => '<span class="' + (i <= paso ? 'on' : '') + '"></span>').join('') + '</div><p class="eti">' + (paso + 1) + ' de ' + PASOS_ALTA.length + ' · ' + PASOS_ALTA[paso] + '</p>'
          + cuerpo() + '<p class="err" id="a-err" hidden></p>' + vivo()
          + '<div class="botones">' + (paso > 0 ? '<button class="b" id="atras">← Atrás</button>' : '') + (paso < PASOS_ALTA.length - 1 ? '<button class="b negro" id="sig">Siguiente →</button>' : '<button class="b negro" id="ok">' + (p0.id ? 'Guardar cambios' : 'Dar de alta') + '</button>') + '</div>'
          + (p0.id && paso === 0 ? '<button class="b rojo" id="borrar">Borrar este pedido</button>' : '');
        $$('#a-cli [data-v]', h).forEach(b => b.onclick = () => { leer(h); if (b.dataset.v === 'nuevo') { cli = {}; nuevoCli = true; } else { cli = Object.assign({}, M.cli(b.dataset.v)); nuevoCli = false; } pintar(); });
        $$('[data-g]', h).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; leer(h); w[g.dataset.g] = b.dataset.v; delete w.pend[g.dataset.g]; pintar(); const o = /^Otr[ao]$/.test(b.dataset.v) && $('.otra', h); if (o) o.focus(); });
        $$('[data-nt]', h).forEach(b => b.onclick = () => { leer(h); const k = b.dataset.nt; if (w.pend[k]) delete w.pend[k]; else w.pend[k] = true; pintar(); });
        $$('[data-pon]', h).forEach(b => b.onclick = () => { leer(h); w[b.dataset.pon] = num(b.dataset.val); delete w.pend[b.dataset.pon]; pintar(); });
        $$('input,textarea', h).forEach(i => i.addEventListener('input', () => { leer(h); const v = $('.vivo', h); if (v) v.outerHTML = vivo(); }));
        if ($('#calc', h)) $('#calc', h).onclick = () => { leer(h); const sg = N.costosSugeridos(w); N.COST.forEach(([k]) => { if (vacio(w.costos[k])) w.costos[k] = sg[k]; }); pintar(); aviso('Costos sugeridos puestos: corrígelos con lo real'); };
        if ($('#atras', h)) $('#atras', h).onclick = () => { leer(h); paso--; pintar(); h.scrollTop = 0; };
        const validar = () => { leer(h); if (paso === 0 && !cli.nombre) { marcar([], true); return false; } const f = faltan(); if (!f.length) return true; marcar(f); return false; };
        const marcar = (f, sinNom) => { $$('.campo-a', h).forEach(el => el.classList.toggle('falta', f.includes(el.dataset.req) || (sinNom && !!el.querySelector('#c-nom')))); const e = $('#a-err', h); e.hidden = false;
          e.textContent = sinNom ? 'Escribe el nombre del cliente.' : 'Faltan ' + f.length + ' dato(s). Llénalos o toca "No lo tengo aún" y quedan pendientes.'; const x = $('.campo-a.falta', h); if (x) x.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
        if ($('#sig', h)) $('#sig', h).onclick = () => { if (validar()) { paso++; pintar(); h.scrollTop = 0; } };
        if ($('#ok', h)) $('#ok', h).onclick = async () => {
          if (!validar()) return;
          Object.keys(w.pend).forEach(k => { if (N.lleno(['telefono', 'direccion'].includes(k) ? cli : w, k)) delete w.pend[k]; });
          const pd = {}; ['folio', 'fecha', 'entrega', 'vendedor', 'vendedorOtro', 'forma', 'tipo', 'tipoOtra', 'largo', 'ancho', 'cantidad', 'altura', 'material', 'materialOtro', 'marca', 'color', 'colorOtra', 'acabado', 'canto', 'cantoOtro', 'espesor', 'refuerzo', 'obsCubierta', 'base', 'baseOtra', 'pintura', 'pacabado', 'ptipo', 'niveladores', 'placasm', 'obsBase', 'precio', 'anticipo', 'notas'].forEach(k => { pd[k] = vacio(w[k]) ? null : w[k]; });
          pd.costos = Object.fromEntries(N.COST.map(([k]) => [k, vacio(w.costos[k]) ? null : num(w.costos[k])])); pd.pend = Object.keys(w.pend).length ? w.pend : null;
          const pend = N.pendientes(Object.assign({}, pd, { costos: w.costos }), cli);
          if (!await clave(p0.id ? 'Guardar cambios del pedido' : 'Dar de alta el pedido', [['Nº de pedido', String(pd.folio)], ['Cliente', cli.nombre + (nuevoCli ? ' (nuevo)' : '')], ['Mesa', piezaTxt(pd)], ['Entrega', pd.entrega ? fC(pd.entrega) : 'pendiente'], ['Precio', pd.precio ? pesos(pd.precio) : 'pendiente'], ['Costo estimado', costoW() ? pesos(costoW()) : 'pendiente'], ['Datos pendientes', pend.length ? String(pend.length) : 'ninguno']])) return;
          cerrarHoja(); let id = p0.id;
          await guardarYa(async () => {
            const cd = { nombre: cli.nombre.slice(0, 80), telefono: cli.telefono || null, email: cli.email || null, direccion: cli.direccion || null };
            let cid = cli.id; if (cid) await A.nodoCambia('dinero/clientes/' + cid, cd); else cid = await A.nodoAgrega('dinero/clientes', cd);
            pd.cliente = cid;
            if (id) await A.nodoCambia('dinero/pedidos/' + id, pd); else { Object.keys(pd).forEach(k => pd[k] == null && delete pd[k]); id = await A.nodoAgrega('dinero/pedidos', pd); }
          }, p0.id ? 'Pedido guardado' : 'Pedido dado de alta', (p0.id ? 'Editó pedido #' : 'Alta de pedido #') + pd.folio + ' · ' + cli.nombre);
          location.hash = '#p=' + id;
        };
        if ($('#borrar', h)) $('#borrar', h).onclick = async () => { if (M.movs.some(m => m.pedido === p0.id)) return aviso('Este pedido tiene movimientos de dinero. Cámbialos o bórralos primero.'); if (!await clave('Borrar pedido', [['Pedido', M.nomPedido(p0)]])) return; cerrarHoja(); await guardarYa(() => A.nodoBorra('dinero/pedidos/' + p0.id), 'Pedido borrado', 'Borró pedido ' + M.nomPedido(p0)); location.hash = '#pedidos'; };
        if (paso === 0 && !p0.id && $('#c-nom', h) && nuevoCli) $('#c-nom', h).focus();
      };
      pintar();
    });
  }

  function tarea() {
    hoja('Nueva tarea', '<label class="campo">¿Qué hay que hacer?<input id="t-t" maxlength="120"></label><div class="dos-i"><label class="campo">¿Cuándo?<input id="t-f" type="date" value="' + hoy() + '"></label><label class="campo">Pedido (opcional)<select id="t-p"><option value="">Ninguno</option>' + M.pedidos.filter(p => !p.cerrado).map(p => '<option value="' + esc(p.id) + '">' + esc(M.nomPedido(p)) + '</option>').join('') + '</select></label></div><button class="b negro grande" id="t-ok">Agregar a la agenda</button>', h => {
      $('#t-ok', h).onclick = async () => { const x = { texto: $('#t-t', h).value.trim(), fecha: $('#t-f', h).value || hoy(), pedido: $('#t-p', h).value || null, hecho: false }; if (!x.texto) return aviso('Escribe la tarea.'); cerrarHoja(); await guardarYa(() => A.nodoAgrega('dinero/agenda', x), 'Tarea agregada', 'Tarea: ' + x.texto); };
    });
  }

  // ---------- hoja (ventana de abajo), clave, avisos ----------
  function hoja(titulo, html, listo) {
    cerrarHoja(); const cap = document.createElement('div'); cap.className = 'capa'; cap.id = 'capa';
    cap.innerHTML = '<div class="hoja" role="dialog" aria-label="' + esc(titulo) + '"><div class="hoja-t"><h2>' + esc(titulo) + '</h2><button class="x" aria-label="Cerrar">✕</button></div><div class="hoja-c">' + html + '</div></div>';
    document.body.appendChild(cap); document.body.classList.add('sin-scroll');
    $('.x', cap).onclick = cerrarHoja; cap.onclick = e => { if (e.target === cap) cerrarHoja(); };
    listo($('.hoja-c', cap));
  }
  function cerrarHoja() { const c = $('#capa'); if (c) c.remove(); document.body.classList.remove('sin-scroll'); if (pendienteSync) { pendienteSync = false; setTimeout(sincronizar, 50); } }
  function clave(titulo, lineas) {
    return new Promise(ok => {
      const cap = document.createElement('div'); cap.className = 'capa arriba';
      cap.innerHTML = '<div class="hoja chica" role="dialog" aria-label="Confirmar"><div class="hoja-t"><h2>' + esc(titulo) + '</h2><button class="x" aria-label="Cerrar">✕</button></div><div class="hoja-c">'
        + '<dl class="conf">' + lineas.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl><p class="nota">Revisa que todo sea correcto y escribe la clave para confirmar.</p>'
        + '<input id="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="Clave" class="pin"><p class="err" id="perr" hidden>Clave incorrecta. No se guardó nada.</p><button class="b negro grande" id="pok">Confirmar</button></div></div>';
      document.body.appendChild(cap);
      const fin = v => { cap.remove(); ok(v); }, pin = $('#pin', cap), probar = () => { if (pin.value.trim() === CLAVE) fin(true); else { $('#perr', cap).hidden = false; pin.value = ''; pin.classList.remove('sacude'); void pin.offsetWidth; pin.classList.add('sacude'); if (navigator.vibrate) navigator.vibrate(80); pin.focus(); } };
      $('.x', cap).onclick = () => fin(false); cap.onclick = e => { if (e.target === cap) fin(false); };
      $('#pok', cap).onclick = probar; pin.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); probar(); } };
      setTimeout(() => pin.focus(), 40);
    });
  }
  let ocupadoGuardando = false;
  async function guardarYa(fn, ok, bit) {
    if (ocupadoGuardando) return; ocupadoGuardando = true;
    try { await fn(); if (bit) await bitacora(ok, bit); await recargar(); aviso(ok); }
    catch (e) { aviso('No se guardó: ' + e.message, true); try { await recargar(); } catch (x) {} }
    finally { ocupadoGuardando = false; }
  }
  function aviso(t, mal) { const e = $('#aviso'); e.textContent = t; e.className = mal ? 'mal' : ''; e.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => { e.hidden = true; }, 3200); }

  // ================= EXPORTAR (PDF y Excel de todo) y FORMATO DE PEDIDO =================
  const lib = (src, ya) => ya() ? Promise.resolve() : new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('No se pudo cargar el generador. Revisa tu internet.')); document.head.appendChild(s); });
  const libPDF = async () => { await lib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => window.jspdf); await lib('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', () => window.jspdf && window.jspdf.jsPDF.API.autoTable); };
  const libXLS = () => lib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => window.XLSX);
  async function bajar(blob, nombre) {
    try { const f = new File([blob], nombre, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: nombre }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); aviso('Listo: ' + nombre);
  }
  const ocupado = async fn => { aviso('Preparando archivo…'); try { await fn(); } catch (e) { aviso(e.message || String(e), true); } };
  function tablas() {
    const T = M.totales(), nc = M.noCuadra();
    return { T, nc,
      resumen: [['Dinero con nosotros', T.caja]].concat(Object.entries(T.porQuien).map(([q, v]) => ['  Lo tiene ' + q, v]), [['  En efectivo', T.porMetodo.Efectivo], ['  En banco', T.porMetodo.Banco], ['  Sin decir cómo', T.porMetodo['Sin decir']],
        ['Entró en total', T.ent], ['Salió en total', T.sal], ['Nos deben clientes', T.porCobrar], ['Falta gastar en pedidos', T.porGastar], ['Debemos', T.sinDeudas ? 'sin anotar' : T.debemos], ['Posición real', T.posicion], ['Ganancia esperada (activos)', T.ganEsp], ['Ganancia real (finalizados)', T.ganReal], ['Gastos generales', T.gastoGeneral], ['Movimientos por aclarar', String(T.porAclarar)], ['Cosas que no cuadran', String(nc.length)]]),
      pedidosH: ['#', 'Cliente', 'Mesa', 'Estado', 'Entrega', 'Precio', 'Pagó', 'Debe', 'Costo est.', 'Gastado', 'Ganancia', 'Margen', 'Pendientes'],
      pedidos: T.ps.map(([p, s]) => [String(p.folio || ''), (M.cli(p.cliente) || {}).nombre || '', piezaTxt(p), s.estado, p.entrega || '', s.precio || '', s.ent, s.porCobrar != null ? Math.max(s.porCobrar, 0) : '', s.costo || '', s.sal, p.cerrado ? s.gananciaReal : s.ganancia != null ? s.ganancia : '', s.margen != null ? pct(s.margen) : '', s.pend.join(', ')]),
      deudasH: ['A quién', 'Tipo', 'Prestado / debía', 'Pagado', 'Falta', 'Vence'], deudas: M.deudas.map(x => { const s = M.statsDeuda(x); return [x.nombre, x.tipo || '', s.prestado, s.pagado, s.falta, x.vence || '']; }),
      fondosH: ['Bolsa', 'Saldo'], fondos: M.fondos().map(f => [f.nombre, f.saldo]),
      movsH: ['Fecha', 'Tipo', 'Concepto', 'Pedido / deuda', 'Sale de', 'Quién', 'Cómo', 'Nota', 'Entrada', 'Salida', 'Estado'],
      movs: M.movs.map(m => [m.fecha, N.esIn(m) ? 'Entrada' : 'Salida', m.cat || '', m.pedido ? M.nomPed(m.pedido) : m.deuda ? ((M.deu(m.deuda) || {}).nombre || '') : 'General', N.esIn(m) ? '' : M.nomFondo(m.fondo), m.quien || '', m.metodo || 'sin decir', m.nota || '', N.esIn(m) ? num(m.monto) : '', N.esIn(m) ? '' : num(m.monto), m.revisar ? 'Por aclarar' : 'Claro']),
      ncH: ['Gravedad', 'Qué', 'Detalle'], ncL: nc.map(x => [x.g === 1 ? 'Urgente' : x.g === 2 ? 'Revisar' : 'Aviso', x.t, x.d]),
      sobH: ['Piedra', 'Medida', 'De pedido', 'Estado'], sob: M.sobrantes.map(s => [s.piedra, num(s.w) + '×' + num(s.h), s.pedido ? M.nomPed(s.pedido) : '', s.estado === 'usado' ? 'Usado ' + (s.usadoEn || '') : 'Disponible']) };
  }
  function xlsGeneral() {
    return ocupado(async () => {
      await libXLS(); const XL = window.XLSX, T = tablas(), wb = XL.utils.book_new();
      const h = (cab, filas, an) => { const ws = XL.utils.aoa_to_sheet([cab].concat(filas)); ws['!cols'] = an.map(x => ({ wch: x })); Object.keys(ws).forEach(k => { if (k[0] !== '!' && ws[k].t === 'n') ws[k].z = '"$"#,##0;[Red]-"$"#,##0'; }); return ws; };
      XL.utils.book_append_sheet(wb, h(['Concepto', 'Monto'], [['Reporte DKAS al ' + hoy(), '']].concat(T.resumen), [40, 16]), 'Resumen');
      XL.utils.book_append_sheet(wb, h(T.pedidosH, T.pedidos, [5, 20, 40, 20, 11, 12, 12, 12, 12, 12, 12, 8, 50]), 'Pedidos');
      XL.utils.book_append_sheet(wb, h(T.movsH, T.movs, [11, 9, 14, 22, 24, 10, 13, 40, 12, 12, 12]), 'Movimientos');
      XL.utils.book_append_sheet(wb, h(T.deudasH, T.deudas, [24, 12, 15, 12, 12, 11]), 'Deudas');
      XL.utils.book_append_sheet(wb, h(T.fondosH, T.fondos, [36, 14]), 'Bolsas de dinero');
      XL.utils.book_append_sheet(wb, h(T.ncH, T.ncL, [10, 50, 80]), 'No cuadra');
      XL.utils.book_append_sheet(wb, h(T.sobH, T.sob, [20, 12, 24, 30]), 'Sobrantes');
      await bajar(new Blob([XL.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'DKAS reporte ' + hoy() + '.xlsx');
    });
  }
  const sinRaros = s => String(s == null ? '' : s).replace(/−/g, '-').replace(/[✓✕→←★]/g, '').replace(/[^\x00-\xFF€…–—‘’“”•]/g, '');
  const $p = n => n === '' || n == null ? '' : typeof n === 'number' ? N.pesos(n) : sinRaros(n);
  async function imgData(src) { try { const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; }); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); return { d: cv.toDataURL('image/png'), r: img.naturalWidth / img.naturalHeight }; } catch (e) { return null; } }
  function pdfGeneral() {
    return ocupado(async () => {
      await libPDF(); const T = tablas(), { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' }), W = 279.4, Mg = 14, L = await imgData('img/dkas-oscuro.png');
      if (L) doc.addImage(L.d, 'PNG', Mg, 10, 9 * L.r, 9); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Reporte de cuentas', W - Mg, 15, { align: 'right' }); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(sinRaros('Al ' + hoy() + ' · ' + M.pedidos.length + ' pedidos · ' + M.movs.length + ' movimientos'), W - Mg, 20, { align: 'right' }); doc.setTextColor(0); doc.setLineWidth(0.5); doc.line(Mg, 24, W - Mg, 24);
      let y = 31, n = 0; const sec = t => { if (y > 180) { doc.addPage(); y = 18; } doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(sinRaros(++n + '. ' + t), Mg, y); y += 2; };
      const tabla = (cab, filas, opt) => { if (!filas.length) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.text('Sin datos.', Mg, y + 4); y += 10; return; } doc.autoTable(Object.assign({ startY: y, head: [cab.map(sinRaros)], body: filas.map(r => r.map($p)), margin: { left: Mg, right: Mg, bottom: 14 }, theme: 'grid', styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.5, lineColor: [210, 210, 210], lineWidth: 0.1, textColor: [17, 17, 17] }, headStyles: { fillColor: [17, 17, 17], textColor: 255 }, alternateRowStyles: { fillColor: [246, 246, 246] } }, opt || {})); y = doc.lastAutoTable.finalY + 8; };
      sec('Resumen'); tabla(['Concepto', 'Monto'], T.resumen, { tableWidth: 130, columnStyles: { 1: { halign: 'right' } } });
      sec('Lo que no cuadra'); tabla(T.ncH, T.ncL, { columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 80 } } });
      sec('Pedidos'); tabla(T.pedidosH, T.pedidos, { columnStyles: { 2: { cellWidth: 55 }, 12: { cellWidth: 45 } } });
      sec('A quién le debemos'); tabla(T.deudasH, T.deudas);
      sec('Bolsas de dinero (de quién es el dinero que hay)'); tabla(T.fondosH, T.fondos, { tableWidth: 130 });
      sec('Movimientos'); tabla(T.movsH, T.movs, { columnStyles: { 7: { cellWidth: 50 } } });
      sec('Sobrantes de piedra'); tabla(T.sobH, T.sob, { tableWidth: 180 });
      const pags = doc.internal.getNumberOfPages(); for (let i = 1; i <= pags; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(sinRaros('Generado el ' + hoy() + ' por ' + (me.nombre || '') + ' desde el admin DKAS · pesos mexicanos (MXN) · solo incluye lo registrado'), Mg, 208); doc.text('Página ' + i + ' de ' + pags, W - Mg, 208, { align: 'right' }); }
      await bajar(doc.output('blob'), 'DKAS reporte ' + hoy() + '.pdf');
    });
  }
  function pdfFormato(p) {
    return ocupado(async () => {
      await libPDF(); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'letter' }), W = 215.9, Mg = 12, s = M.statsPedido(p), c = M.cli(p.cliente) || {}, L = await imgData('img/dkas-claro.png');
      const T = v => sinRaros(v == null ? '' : v), fD = f => f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : '';
      doc.setFillColor(17, 17, 17); doc.rect(Mg, 10, W - 2 * Mg, 24, 'F'); if (L) doc.addImage(L.d, 'PNG', Mg + 6, 14, 16 * L.r, 16);
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('FORMATO DE PEDIDO', 82, 21); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text('M E S A   P E R S O N A L I Z A D A', 82, 27);
      doc.setFillColor(255); doc.rect(W - Mg - 52, 13, 48, 18, 'F'); doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.text('Nº PEDIDO:', W - Mg - 49, 20); doc.text('FECHA:', W - Mg - 49, 27); doc.setFont('helvetica', 'normal'); doc.text(T(p.folio || ''), W - Mg - 30, 20); doc.text(fD(p.fecha), W - Mg - 36, 27);
      let y = 40;
      const barra = (n, t) => { doc.setFillColor(17, 17, 17); doc.rect(Mg, y, W - 2 * Mg, 6.5, 'F'); doc.setFillColor(210, 210, 210); doc.rect(Mg, y, 8, 6.5, 'F'); doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(String(n), Mg + 4, y + 4.7, { align: 'center' }); doc.setTextColor(255); doc.text(T(t), Mg + 11, y + 4.7); doc.setTextColor(17); y += 11; };
      const campo = (x, w, lbl, v) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(17); doc.text(T(lbl), x, y); const lw = doc.getTextWidth(T(lbl)) + 2; doc.setDrawColor(150); doc.setLineWidth(0.2); doc.line(x + lw, y + 0.8, x + w, y + 0.8); const pe = vacio(v); doc.setFont('helvetica', pe ? 'italic' : 'bold'); if (pe) doc.setTextColor(180, 40, 30); doc.text(T(pe ? 'pendiente' : v), x + lw + 1, y - 0.3, { maxWidth: w - lw - 2 }); doc.setTextColor(17); doc.setFont('helvetica', 'normal'); };
      const caja = (x, lbl, on) => { doc.setDrawColor(60); doc.setLineWidth(0.3); doc.rect(x, y - 3, 3.4, 3.4); if (on) { doc.setLineWidth(0.6); doc.line(x + 0.6, y - 1.3, x + 1.5, y - 0.2); doc.line(x + 1.5, y - 0.2, x + 3, y - 2.6); } doc.setFont('helvetica', on ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.text(T(lbl), x + 5, y); doc.setFont('helvetica', 'normal'); };
      const fila = (opc, val, x0, an, otraV) => { const st = an / opc.length; opc.forEach((o, i) => caja(x0 + i * st, o + (o === val && /^Otr[ao]$/.test(o) && otraV ? ': ' + otraV : ''), o === val)); };
      barra(1, 'DATOS DEL CLIENTE'); campo(Mg + 2, 105, 'Nombre:', c.nombre); campo(Mg + 112, W - 2 * Mg - 112, 'Email:', c.email || '—'); y += 7; campo(Mg + 2, 105, 'Dirección:', c.direccion); campo(Mg + 112, W - 2 * Mg - 112, 'Vendedor:', otra(p.vendedor, p.vendedorOtro)); y += 7; campo(Mg + 2, 105, 'Teléfono:', c.telefono); campo(Mg + 112, W - 2 * Mg - 112, 'Fecha de entrega:', fD(p.entrega)); y += 9;
      barra(2, 'TIPO Y FORMA DE MESA'); fila(C.FORMAS, p.forma, Mg + 2, W - 2 * Mg - 4); y += 7; fila(C.TIPOS, p.tipo, Mg + 2, W - 2 * Mg - 4, p.tipoOtra); y += 9;
      barra(3, 'MEDIDAS DEL PEDIDO TERMINADO'); const red = p.forma === 'Redonda'; campo(Mg + 2, 45, red ? 'Diámetro (cm):' : 'Largo (cm):', num(p.largo) || ''); campo(Mg + 52, 40, 'Ancho (cm):', red ? '—' : (num(p.ancho) || '')); campo(Mg + 97, 40, 'Altura (cm):', num(p.altura) || ''); campo(Mg + 142, 40, 'Cuántas:', String(num(p.cantidad) || 1)); y += 9;
      barra(4, 'ESPECIFICACIONES DE LA CUBIERTA'); fila(C.MATERIALES, p.material, Mg + 2, W - 2 * Mg - 4, p.materialOtro); y += 7; campo(Mg + 2, 92, 'Marca / Modelo:', p.marca); campo(Mg + 98, W - 2 * Mg - 98, 'Color:', otra(p.color, p.colorOtra)); y += 7;
      doc.text('Acabado:', Mg + 2, y); fila(C.ACABADOS, p.acabado, Mg + 20, 75); doc.text('Tipo de canto:', Mg + 100, y); fila(C.CANTOS, p.canto, Mg + 124, W - 2 * Mg - 124, p.cantoOtro); y += 7;
      campo(Mg + 2, 50, 'Espesor (mm):', num(p.espesor) || ''); doc.text('Refuerzo inferior:', Mg + 60, y); fila(C.SINO, p.refuerzo, Mg + 88, 30); y += 7; campo(Mg + 2, W - 2 * Mg - 4, 'Observaciones:', p.obsCubierta || '—'); y += 9;
      barra(5, 'DISEÑO DE LA BASE DE HERRERÍA'); fila(C.BASES.slice(0, 5), p.base, Mg + 2, W - 2 * Mg - 4); y += 7; fila(C.BASES.slice(5), p.base, Mg + 2, W - 2 * Mg - 4, p.baseOtra); y += 7;
      campo(Mg + 2, 92, 'Color de pintura:', p.pintura); campo(Mg + 98, W - 2 * Mg - 98, 'Tipo de pintura:', p.ptipo); y += 7; doc.text('Acabado:', Mg + 2, y); fila(C.ACABADOS, p.pacabado, Mg + 20, 75); doc.text('Niveladores:', Mg + 100, y); fila(C.SINO, p.niveladores, Mg + 120, 26); doc.text('Placas:', Mg + 150, y); fila(C.SINO, p.placasm, Mg + 162, 26); y += 7;
      campo(Mg + 2, W - 2 * Mg - 4, 'Observaciones:', p.obsBase || '—'); y += 9;
      barra(6, 'PRECIO Y PAGOS'); campo(Mg + 2, 60, 'Precio total:', s.precio ? N.pesos(s.precio) : ''); campo(Mg + 66, 60, 'Anticipo acordado:', s.precio ? N.pesos(s.antAc) : ''); campo(Mg + 130, W - 2 * Mg - 130, 'Pagado:', N.pesos(s.ent)); y += 7; campo(Mg + 2, 60, 'Saldo:', s.precio ? N.pesos(Math.max(s.porCobrar, 0)) : ''); campo(Mg + 66, W - 2 * Mg - 66, 'Notas:', p.notas || '—'); y += 12;
      if (s.pend.length) { doc.setFontSize(8); doc.setTextColor(180, 40, 30); doc.text(doc.splitTextToSize(T('Datos pendientes (' + s.pend.length + '): ' + s.pend.join(', ') + '.'), W - 2 * Mg), Mg + 2, y); doc.setTextColor(17); }
      doc.setDrawColor(120); doc.line(Mg + 10, 255, Mg + 80, 255); doc.line(W - Mg - 80, 255, W - Mg - 10, 255); doc.setFontSize(8); doc.text('Firma del cliente', Mg + 45, 260, { align: 'center' }); doc.text('Firma DKAS', W - Mg - 45, 260, { align: 'center' });
      await bajar(doc.output('blob'), 'DKAS formato de pedido ' + (p.folio || '') + ' ' + (c.nombre || '') + '.pdf');
    });
  }

  addEventListener('DOMContentLoaded', arrancar);
})();

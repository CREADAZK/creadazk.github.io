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
    PIEDRAS: ['Statuario', 'Mont Blanc', 'Pure White', 'Taj Mahal Light', 'Classic Bulgar', 'Peacock', 'Cardenaskin', 'Travertine', 'Limestone Cream', 'Saloran Grey', 'Bulgaria Dark Grey', 'Otra'], // las 11 del catálogo DKAS
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
    [6, 'c_placa', 'Costo de la placa'], [6, 'c_base', 'Costo de la base'], [6, 'c_mdf', 'Costo del MDF'], [6, 'c_flete', 'Costo de fletes'], [6, 'c_entrega', 'Costo de entrega'], [6, 'c_material', 'Costo de material']];
  function lleno(o, k) {
    if ((k === 'medidas' || k === 'altura') && (o.piezas || []).length) return true;
    if (k === 'medidas') return num(o.largo) > 0 && (o.forma === 'Redonda' || num(o.ancho) > 0);
    if (k === 'precio' || k === 'altura' || k === 'espesor') return num(o[k]) > 0;
    if (k.slice(0, 2) === 'c_' || k.slice(0, 2) === 'c.') return !vacio((o.costos || {})[k.slice(2)]);
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
    const M = { hoy, clientes: lista(d.clientes), pedidos: lista(d.pedidos).map(p => p.piezas && !Array.isArray(p.piezas) ? Object.assign(p, { piezas: Object.values(p.piezas) }) : p), deudas: lista(d.deudas), movs: lista(d.movs), sobrantes: lista(d.sobrantes), agendaMan: lista(d.agenda), bitacora: lista(d.bitacora).sort((a, b) => (b.creado || 0) - (a.creado || 0)) };
    M.movs.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.creado || 0) - (b.creado || 0));
    M.cli = id => M.clientes.find(c => c.id === id);
    M.ped = id => M.pedidos.find(p => p.id === id);
    M.deu = id => M.deudas.find(x => x.id === id);
    const nomP = p => p ? ((M.cli(p.cliente) || {}).nombre || 'Sin cliente') + (p.folio ? ' #' + p.folio : '') : '';
    M.nomPed = id => nomP(M.ped(id));
    // fondos: cada pedido, cada préstamo y la caja general
    M.fondoDe = m => m.fondo || null;
    M.nomFondo = f => !f ? 'sin decir' : f === 'caja' ? 'Caja general' : f.slice(0, 2) === 'p:' ? 'Dinero de ' + M.nomPed(f.slice(2)) : f.slice(0, 3) === 'pd:' ? 'A crédito: se le debe a ' + ((M.deu(f.slice(3)) || {}).nombre || '') : f.slice(0, 2) === 'd:' ? 'Préstamo de ' + ((M.deu(f.slice(2)) || {}).nombre || '') : f;
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
    M.socio = (foco, ahora) => socio(M, foco, ahora);
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

  // ---------- el socio: qué sigue (en orden), cosas raras y consejos ----------
  const AREAS = [['cobrar', 'Cobrar'], ['entregar', 'Entregar'], ['producir', 'Producir'], ['vender', 'Vender'], ['cuentas', 'Ordenar cuentas']];
  function socio(M, foco, ahora) {
    const hoy = M.hoy, T = totales(M), raros = noCuadra(M), ag = agenda(M).filter(a => !a.hecho && a.dias <= 3), pasos = [];
    const areaDe = { cobro: 'cobrar', entrega: 'entregar', compra: 'producir', taller: 'producir', deuda: 'cuentas', dato: 'cuentas', cierre: 'cuentas', manual: '' };
    const base = { cobro: 80, entrega: 78, compra: 66, taller: 60, deuda: 72, dato: 45, cierre: 30, manual: 62 };
    ag.forEach(a => {
      const m = /\$([\d,]+)/.exec(a.texto), monto = m ? num(m[1]) : 0;
      let sc = base[a.tipo] || 50; if (a.dias < 0) sc += Math.min(-a.dias * 3, 20); else sc -= a.dias * 6; if (a.tipo === 'cobro') sc += Math.min(monto / 2000, 12); const cuando = /^Cuando /.test(a.texto); if (cuando) sc = 40;
      pasos.push({ k: 'ag:' + a.tipo + ':' + (a.pedido || a.deuda || a.id || a.texto), area: areaDe[a.tipo] || '', titulo: a.texto, porque: cuando ? 'Cuando pase eso; todavía no' : a.tipo === 'cobro' && a.pedido && M.ped(a.pedido) && (M.ped(a.pedido).pasos || {}).entregado ? 'Ya se le entregó y no ha liquidado' : a.tipo === 'cobro' && /anticipo/i.test(a.texto) ? 'Falta para completar el 50% de anticipo' : a.dias < 0 ? 'Atrasado ' + -a.dias + ' día' + (a.dias === -1 ? '' : 's') : a.dias === 0 ? 'Es para hoy' : 'En ' + a.dias + ' día' + (a.dias === 1 ? '' : 's'), href: a.pedido ? '#p=' + a.pedido : a.deuda ? '#d=' + a.deuda : '', manual: a.tipo === 'manual' ? a.id : '', sc });
    });
    // banco: ¿se cuadró hoy?
    const cu = M.bitacora.find(x => x.accion === 'Cuadre de banco' && x.sistema != null), cuHoy = cu && ymd(new Date(cu.creado)) === hoy;
    if (cu && cu.banco !== cu.sistema) pasos.push({ k: 'banco-mal', area: 'cuentas', titulo: 'El banco no cuadra por ' + pesos(Math.abs(cu.banco - cu.sistema)), porque: 'Falta registrar ' + (cu.banco < cu.sistema ? 'una salida' : 'una entrada') + '. Revisa Tkash y regístrala.', accion: 'cuadre', sc: 92 });
    else if (!cuHoy) pasos.push({ k: 'banco', area: 'cuentas', titulo: 'Cuadrar el banco con Tkash', porque: cu ? 'Último cuadre: ' + ymd(new Date(cu.creado)) : 'Nunca se ha cuadrado', accion: 'cuadre', sc: (ahora || 12) >= 18 ? 74 : 52 });
    if (T.porAclarar) pasos.push({ k: 'aclarar', area: 'cuentas', titulo: 'Aclarar ' + T.porAclarar + ' movimiento' + (T.porAclarar > 1 ? 's' : '') + ' dudoso' + (T.porAclarar > 1 ? 's' : ''), porque: 'Están en amarillo en Dinero. Mientras no se aclaren, los números pueden estar mal.', href: '#dinero', sc: 48 });
    raros.filter(r => r.g === 1).forEach(r => { if (!pasos.some(p => r.ref.pedido && p.href === '#p=' + r.ref.pedido && /cobr/i.test(p.titulo) && /liquidar|debe/.test(r.t))) pasos.push({ k: 'raro:' + r.t, area: /cobr|liquidar|debe/i.test(r.t) ? 'cobrar' : /entrega/i.test(r.t) ? 'entregar' : 'cuentas', titulo: r.t, porque: r.d, href: r.ref.pedido ? '#p=' + r.ref.pedido : r.ref.deuda ? '#d=' + r.ref.deuda : '', sc: 70, raro: true }); });
    const vistos = {}; const lista = pasos.filter(p => !vistos[p.k] && (vistos[p.k] = 1)).map(p => Object.assign(p, { sc: p.sc + (foco && p.area === foco ? 25 : 0) })).sort((a, b) => b.sc - a.sc);
    lista.forEach(p => { p.nivel = p.sc >= 80 ? 'urgente' : p.sc >= 60 ? 'importante' : 'normal'; });
    // consejos: lo que un socio te diría viendo los números
    const c = [], deben = T.act.map(([p, st]) => [p, st]).filter(([, st]) => st.porCobrar > 0).sort((a, b) => b[1].porCobrar - a[1].porCobrar);
    const nombres = l => l.slice(0, 2).map(([p, st]) => M.nomPedido(p) + ' (' + pesos(st.porCobrar) + ')').join(' y ');
    if (T.porGastar > T.caja) c.push({ t: 'No alcanza para terminar los pedidos', d: 'Falta gastar ' + pesos(T.porGastar) + ' y tienes ' + pesos(T.caja) + '. Cobra antes de comprar: ' + (nombres(deben) || 'nadie debe ahorita') + '.', area: 'cobrar' });
    if (T.debemos > 0 && T.debemos > T.caja - T.porGastar) c.push({ t: 'Ojo con lo que debemos', d: 'Debemos ' + pesos(T.debemos) + '. Después de terminar los pedidos te quedarían ' + pesos(T.caja - T.porGastar) + '. No tomes pedidos nuevos sin 50% de anticipo.', area: 'cuentas' });
    const entregadas = T.act.filter(([, st]) => st.pasos[5].done && st.porCobrar > 0);
    if (entregadas.length) c.push({ t: 'Cobra antes de entregar', d: entregadas.length + ' mesa' + (entregadas.length > 1 ? 's' : '') + ' entregada' + (entregadas.length > 1 ? 's' : '') + ' todavía debe' + (entregadas.length > 1 ? 'n' : '') + ' ' + pesos(entregadas.reduce((a, [, st]) => a + st.porCobrar, 0)) + '. Regla: liquidar al entregar, o antes de que salga el flete.', area: 'cobrar' });
    if (T.perdidas > 0) c.push({ t: 'Las fallas ya costaron ' + pesos(T.perdidas), d: 'Protege mejor la piedra en el flete (esquineros, cobija, 2 personas) y cobra el flete aparte al cliente.', area: 'producir' });
    const sinCosto = T.act.filter(([, st]) => st.precio && !st.costo); if (sinCosto.length) c.push({ t: sinCosto.length + ' pedido' + (sinCosto.length > 1 ? 's' : '') + ' sin costos estimados', d: 'Sin costos no se sabe cuánto ganas: ' + sinCosto.slice(0, 3).map(([p]) => M.nomPedido(p)).join(', ') + '.', area: 'cuentas' });
    if (T.margenProm != null && T.margenProm < 0.3) c.push({ t: 'Ganas poco por mesa (' + pct(T.margenProm) + ')', d: 'Lo sano es 35% o más. Cotiza con la regla costo × ' + REGLA + ' y cobra flete, maniobras y cortes especiales aparte.', area: 'vender' });
    const cj = M.saldoFondo('caja'); if (cj < 0) c.push({ t: 'Los gastos del taller salen de anticipos', d: pesos(-cj) + ' de material, propinas y comisiones se pagaron con dinero de clientes. Aparta un % de cada liquidación para gastos generales.', area: 'cuentas' });
    Object.entries(T.porQuien).filter(([q, v]) => v > 0).forEach(([q, v]) => { const ef = M.movs.filter(m => (m.quien || '') === q && m.metodo === 'Efectivo').length; if (ef && q !== 'Zury') c.push({ t: q + ' debería tener ' + pesos(v), d: 'Pídele que cuente su efectivo y compáralo. Si no cuadra, algo falta por registrar.', area: 'cuentas' }); });
    const ultPed = M.pedidos.map(p => p.fecha || '').sort().slice(-1)[0]; if (ultPed && entre(ultPed, hoy) >= 7) c.push({ t: 'Sin pedidos nuevos en ' + entre(ultPed, hoy) + ' días', d: 'Dedica un rato hoy a vender: contesta solicitudes, manda fotos de mesas entregadas y pide recomendaciones a clientes contentos.', area: 'vender' });
    c.forEach(x => { x.sc = foco && x.area === foco ? 1 : 0; }); c.sort((a, b) => b.sc - a.sc);
    return { pasos: lista, raros, consejos: c, T, cuadre: cu || null, cuadroHoy: !!(cuHoy && cu.banco === cu.sistema) };
  }

  const N = { AREAS, PRECIOS, C, COST, CAMPOS, PLACA, REGLA, lleno, pendientes, fraccionPlaca, costosSugeridos, catCosto, sobrantesDe, cuantasCaben, modelo, num, vacio, pesos, pct, ymd, mas, entre, esIn };
  if (typeof module !== 'undefined' && module.exports) module.exports = N; else root.DKAS_N = N;
})(this);

;
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
/* DKAS · Admin · PIEDRAS (botón del menú de abajo): las placas y pedazos que tenemos, cortar (se dibuja y se descuenta),
   historial de cada pedazo, cotizar (calculadora automática conectada al stock) y la cotización en PDF para el cliente.
   Los precios y el acomodo salen de precios.js (DKAS_PRECIOS) y cortes.js (DKAS_CORTES): los mismos del cotizador anterior.
   Datos (Firebase):
     dinero/sobrantes/<id>    { piedra, w, h, tipo:'placa'|'sobrante', costo, proveedor, fecha, origen, pedido, estado:'disponible'|'usado',
                                usadoEn, usadoFecha, nota, foto:true }       (todas las piedras: placas completas y pedazos)
     piedra/fotos/<id>        foto (jpg en base64, chica) — aparte para que no pese en la sincronización
     dinero/piedraHist/<id>   { accion:'Entró'|'Corte'|'Editó'|'Borró'|'Foto', fecha, pieza, piedra, detalle, cortadas[], quedan[], pedido, por, creado }
     dinero/cotizaciones/<id> { folio, fecha, cliente, tel, clienteId, items[{desc,cant,precio,uso,forma,w,h,alto,piedra,base}], entrega, descuento, vigencia, tiempo, notas, total, por, creado }
     dinero/precios           { placa, extra, mdfHoja, mdfCorte, corteRecto, corteCurvo, canto, margen, flete, minivanComedor, minivanChica, chiquita, baseF }
   Rutas: #piedras · #piedras/s=<id> · #piedras/cotizar · #piedras/cliente · #piedras/cliente=<id> · #piedras/historial · #piedras/precios */
(function (root) {
  root.DKAS_PIEDRAS_MOD = function (X) {
    const P = root.DKAS_PRECIOS, K = root.DKAS_CORTES, N = X.N, A = X.A;
    const { esc, pesos, fC, hoy, $, $$ } = X;
    const num = N.num;
    const CFG = { kerf: 0.5, refilado: 1, minSob: 15 };
    const PLACA = () => ({ w: P.C.placa.w, h: P.C.placa.h });
    const nid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const TS = { '.sv': 'timestamp' };
    const sinAc = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const mismoColor = (a, b) => { const ca = catDe(a), cb = catDe(b); if (ca && cb) return ca === cb; a = sinAc(a); b = sinAc(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
    const r1 = n => Math.round(n * 10) / 10;
    const cm = v => { let n = num(v); if (n > 0 && n < 4) n = Math.round(n * 100); return n; };
    // medidas que más se venden (las del catálogo de precios), por uso y forma
    const USO_DE = { Comedor: 'comedor', Exterior: 'comedor', Centro: 'centro', Lateral: 'lateral', Escritorio: 'escritorio', Periquera: 'periquera' }, FORMA_DE = { Rectangular: 'rect', Cuadrada: 'rect', Redonda: 'red', Ovalada: 'oval', Irregular: 'org' };
    const comunes = (uso, forma, cuad) => (P.CATALOGO || []).filter(x => x.uso === uso && x.forma === forma && (cuad == null || (x.w === x.h) === cuad)).sort((a, b) => (a.w === a.h) - (b.w === b.h));
    const comunesH = (l, attr) => l.length ? '<div class="chips comunes">' + l.map(x => '<button type="button" ' + attr + '="' + x.w + ',' + x.h + '">' + (x.forma === 'red' ? 'Ø' + x.w : x.w + '×' + x.h) + (x.pers ? '<small>' + x.pers + ' personas</small>' : '') + '</button>').join('') + '</div>' : '';
    const medComunes = w => { const u = USO_DE[w.tipo], f = FORMA_DE[w.forma]; return u && f ? comunesH(comunes(u, f, w.forma === 'Cuadrada' ? true : w.forma === 'Rectangular' ? false : null), 'data-med') : ''; };
    const altoDe = tipo => P.ALTO[USO_DE[tipo]] || 75;
    const medTxt = x => x.forma === 'red' ? 'Ø' + r1(x.d || x.w) : r1(x.w) + '×' + r1(x.h);

    // ---------- precios editables (se guardan en dinero/precios y se aplican al motor) ----------
    const BASE0 = Object.assign({}, P.BASE);
    const CAMPOS_P = [
      ['placa', 'Placa completa 320 × 160', () => P.C.placa.precio, v => { P.C.placa.precio = v; }],
      ['extra', 'Extra por pieza (taller)', () => P.C.extra, v => { P.C.extra = v; }],
      ['corteRecto', 'Corte recto · por metro', () => P.C.corteRecto, v => { P.C.corteRecto = v; }],
      ['corteCurvo', 'Corte curvo · por metro', () => P.C.corteCurvo, v => { P.C.corteCurvo = v; }],
      ['canto', 'Canto pulido · por metro', () => P.C.canto, v => { P.C.canto = v; }],
      ['mdfHoja', 'Hoja de MDF', () => P.C.mdf.hoja, v => { P.C.mdf.hoja = v; }],
      ['mdfCorte', 'Corte de MDF', () => P.C.mdf.corte, v => { P.C.mdf.corte = v; }],
      ['baseF', 'Bases de herrería · ajuste %', () => baseF, v => { baseF = v; aplicarBase(); }],
      ['flete', 'Flete en camión', () => P.C.flete, v => { P.C.flete = v; }],
      ['minivanComedor', 'Entrega en minivan · comedor', () => P.C.minivanComedor, v => { P.C.minivanComedor = v; }],
      ['minivanChica', 'Entrega en minivan · mesa chica', () => P.C.minivanChica, v => { P.C.minivanChica = v; }],
      ['chiquita', 'Valor de una mesita 80×80 del sobrante', () => P.C.chiquita, v => { P.C.chiquita = v; }],
      ['margen', 'Multiplicador de precio (costo × …)', () => P.C.margen, v => { P.C.margen = v; }]];
    let baseF = 100;
    const aplicarBase = () => Object.keys(BASE0).forEach(k => { P.BASE[k] = a => BASE0[k](a) * baseF / 100; });
    const DEF_P = {}; CAMPOS_P.forEach(([k, , g]) => { DEF_P[k] = g(); });
    let firmaP = '';
    function aplicarPrecios() {
      const g = (X.D().precios) || {}, f = JSON.stringify(g); if (f === firmaP) return; firmaP = f;
      CAMPOS_P.forEach(([k, , , s]) => s(num(g[k]) > 0 ? num(g[k]) : DEF_P[k]));
    }

    // ---------- stock ----------
    const todas = () => X.M().sobrantes.map(s => Object.assign({ tipo: 'sobrante' }, s));
    const disponibles = () => todas().filter(s => s.estado !== 'usado');
    const usadas = () => todas().filter(s => s.estado === 'usado');
    const arr = v => Array.isArray(v) ? v.filter(x => x != null) : v && typeof v === 'object' ? Object.values(v) : [];
    const hist = () => Object.entries(X.D().piedraHist || {}).map(([id, x]) => Object.assign({ id }, x, { quedan: arr(x.quedan), cortadas: arr(x.cortadas) })).sort((a, b) => (b.creado || 0) - (a.creado || 0));
    const pieza = id => todas().find(s => s.id === id);
    // las 11 piedras del catálogo DKAS (mismos nombres y fotos que dkas.mx: img/piedras/<id>.jpg) · placa 320 × 160
    const CAT = [['statuario', 'Statuario', '#ecebe8', '#111'], ['mont-blanc', 'Mont Blanc', '#cfc8bb', '#111'], ['pure-white', 'Pure White', '#f3f2ee', '#111'], ['taj-mahal-light', 'Taj Mahal Light', '#e8dcc6', '#111'],
      ['classic-bulgar', 'Classic Bulgar', '#e6e1dc', '#111'], ['peacock', 'Peacock', '#dfe0e2', '#111'], ['cardenaskin', 'Cardenaskin', '#eee5d6', '#111'], ['travertine', 'Travertine', '#d8c7a8', '#111'],
      ['limestone-cream', 'Limestone Cream', '#ddd2bd', '#111'], ['saloran-grey', 'Saloran Grey', '#8f8a84', '#fff'], ['bulgaria-dark-grey', 'Bulgaria Dark Grey', '#3d3d3f', '#fff']];
    // "negra", "dark negra", "dark grey", "oscura" = nuestra piedra negra: Bulgaria Dark Grey (no existe otra negra)
    const catDe = n => { n = sinAc(n); if (!n) return null; if (/negr|dark|oscur/.test(n)) return CAT.find(c => c[0] === 'bulgaria-dark-grey'); return CAT.find(c => sinAc(c[1]) === n) || CAT.find(c => n.includes(sinAc(c[1])) || sinAc(c[1]).includes(n)) || null; };
    const PROPIAS = []; // ya no hay "Negra" aparte: es la Bulgaria Dark Grey
    const extrasStock = () => [...new Set(todas().map(x => x.piedra).filter(p => p && !catDe(p) && !PROPIAS.some(q => mismoColor(q, p))))];
    const colores = () => CAT.map(c => c[1]).concat(extrasStock());
    const OTRA = '__otra', limpiaP = v => v === OTRA ? '' : String(v || '').trim();
    // botones de piedra con su muestra; conOtra = botón "Otra…" (abre el campo para escribir)
    const chipsPiedra = (k, val, op) => { op = op || {}; const ex = extrasStock();
      return '<div class="chips pied" data-q="' + k + '">' + (op.cualquiera ? '<button type="button" data-v=""' + (!val ? ' class="on"' : '') + '>Cualquiera</button>' : '')
        + CAT.map(([id, n]) => '<button type="button" data-v="' + esc(n) + '"' + (catDe(val) && catDe(val)[1] === n ? ' class="on"' : '') + '><img src="img/piedras/' + id + '.jpg" alt="" loading="lazy">' + esc(n) + '</button>').join('')
        + PROPIAS.map(n => '<button type="button" data-v="' + esc(n) + '"' + (mismoColor(val, n) && !catDe(val) ? ' class="on"' : '') + '><i class="sw" style="background:' + tono(n)[0] + '"></i>' + esc(n) + '</button>').join('')
        + ex.map(n => '<button type="button" data-v="' + esc(n) + '"' + (val === n ? ' class="on"' : '') + '><i class="sw" style="background:' + tono(n)[0] + '"></i>' + esc(n) + ' <small>(otra)</small></button>').join('')
        + (op.conOtra ? '<button type="button" data-v="' + OTRA + '"' + (val === OTRA ? ' class="on"' : '') + '>Otra…</button>' : '') + '</div>'; };
    const otraAbierta = v => v === OTRA || (!!v && !catDe(v) && !PROPIAS.includes(v) && !extrasStock().includes(v));
    const espacio = s => ({ tipo: s.tipo === 'placa' ? 'placa' : 'retazo', id: s.id, w: num(s.w), h: num(s.h) });
    const tipoTxt = s => s.tipo === 'placa' ? 'Placa completa' : 'Pedazo';
    const nomPieza = s => (s.piedra || 'Piedra') + ' · ' + r1(num(s.w)) + '×' + r1(num(s.h));
    // reqs: [{forma:'red'|'rect', d | w,h, cant, nombre}] → lista de piezas para el motor
    const items = reqs => K.expandir(reqs.map(r => ({ pieza: { nombre: r.nombre || '', forma: r.forma, d: num(r.d), w: num(r.w), h: num(r.h) }, cant: Math.max(1, Math.floor(num(r.cant) || 1)) })));
    const corte = (s, reqs) => K.cortarEn(items(reqs), espacio(s), CFG);
    // ¿en qué piedras cabe todo? (primero las del color pedido y las más chicas, para no gastar placas completas)
    function buscar(reqs, color) {
      if (!reqs.length) return [];
      let its; try { its = items(reqs); } catch (e) { return []; }
      return disponibles().map(s => { const r = K.cortarEn(its, espacio(s), CFG); return { s, r, cabe: !r.faltan.length, color: !color || mismoColor(s.piedra, color) }; })
        .filter(x => x.cabe).sort((a, b) => (b.color - a.color) || (a.s.tipo === 'placa') - (b.s.tipo === 'placa') || num(a.s.w) * num(a.s.h) - num(b.s.w) * num(b.s.h));
    }
    // cuántas de una medida salen de una piedra
    const cuantas = (s, req) => { const ref = s.tipo === 'placa' ? 2 * CFG.refilado : 0, a = req.forma === 'red' ? num(req.d) : num(req.w), b = req.forma === 'red' ? num(req.d) : num(req.h); return a > 0 && b > 0 ? N.cuantasCaben(num(s.w) - ref, num(s.h) - ref, a, b, CFG.kerf) : 0; };
    const alcanza = s => (X.piezas() || []).map(p => ({ et: K.etiqueta(p), a: p.forma === 'red' ? num(p.d) * num(p.d) : num(p.w) * num(p.h), n: cuantas(s, { forma: p.forma === 'red' ? 'red' : 'rect', d: p.d, w: p.w, h: p.h }) })).filter(x => x.n > 0);

    // ---------- dibujo de una piedra con sus piezas (SVG) ----------
    const tono = c => { const k = catDe(c); if (k) return [k[2], k[3], k[0]]; c = sinAc(c); return /negr|black|nero|dark negra/.test(c) ? ['#2a2a2c', '#f2f2f2'] : /grey|gris|gray/.test(c) ? ['#6e6f73', '#fff'] : /blanc|white|statuar|calacat|carrara|taj/.test(c) ? ['#ecebe7', '#111'] : ['#b9b2a6', '#111']; };
    function dibujo(s, r, op) {
      op = op || {}; const W = num(s.w), H = num(s.h), [bg, fg, cid] = tono(s.piedra), fs = Math.max(5, Math.min(W, H) / 9), pid = 'pt' + Math.random().toString(36).slice(2, 8);
      // piedra del catálogo: se pinta con su foto (textura real); si no, con su tono
      let h = '<svg class="pz-svg' + (fg === '#fff' ? ' oscura' : '') + '" viewBox="-2 -2 ' + (W + 4) + ' ' + (H + 4) + '" role="img" aria-label="' + esc(nomPieza(s)) + '">' + (cid ? '<defs><pattern id="' + pid + '" patternUnits="userSpaceOnUse" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="' + bg + '"/><image href="img/piedras/' + cid + '.jpg" width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid slice"/></pattern></defs>' : '')
        + '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="1.5" fill="' + (cid ? 'url(#' + pid + ')' : bg) + '" stroke="#111" stroke-width="0.6"/>';
      if (r) {
        (r.libres || []).forEach(l => { const sob = l.w >= CFG.minSob && l.h >= CFG.minSob; h += '<rect x="' + l.x + '" y="' + l.y + '" width="' + l.w + '" height="' + l.h + '" fill="' + (sob ? 'rgba(52,199,89,.28)' : 'rgba(255,255,255,.12)') + '" stroke="' + (sob ? '#34c759' : 'none') + '" stroke-width="0.8" stroke-dasharray="3 2"/>' + (sob && l.w >= 24 && l.h >= 12 ? '<text x="' + (l.x + l.w / 2) + '" y="' + (l.y + l.h / 2) + '" font-size="' + Math.min(fs, l.h / 2.6, l.w / 6) + '" fill="' + fg + '" text-anchor="middle" dominant-baseline="middle">queda ' + r1(l.w) + '×' + r1(l.h) + '</text>' : ''); });
        r.puestas.forEach(p => {
          const cx = p.x + p.w / 2, cy = p.y + p.h / 2, f = Math.min(fs, p.w / 4.5, p.h / 3);
          h += p.forma === 'red' ? '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" fill="none" stroke="' + fg + '" stroke-opacity=".35" stroke-width="0.4"/><circle cx="' + cx + '" cy="' + cy + '" r="' + (p.w / 2) + '" fill="#fff" stroke="#0a84ff" stroke-width="1"/>'
            : '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" fill="#fff" stroke="#0a84ff" stroke-width="1"/>';
          h += '<text x="' + cx + '" y="' + cy + '" font-size="' + f + '" font-weight="700" fill="#0a84ff" text-anchor="middle" dominant-baseline="middle">' + esc(p.forma === 'red' ? 'Ø' + r1(p.w) : r1(p.w) + '×' + r1(p.h)) + '</text>';
        });
      } else if (op.etiqueta !== false) h += '<text x="' + W / 2 + '" y="' + H / 2 + '" font-size="' + fs + '" fill="' + fg + '" text-anchor="middle" dominant-baseline="middle">' + r1(W) + ' × ' + r1(H) + '</text>';
      return h + '</svg>';
    }

    // ---------- fotos (se cargan aparte, una por una) ----------
    const FOTOS = {};
    async function foto(id) { if (FOTOS[id] !== undefined) return FOTOS[id]; try { FOTOS[id] = (await A.nodo('piedra/fotos/' + id)) || ''; } catch (e) { FOTOS[id] = ''; } return FOTOS[id]; }
    function pintarFotos(cont) { $$('[data-foto]', cont).forEach(async el => { const f = await foto(el.dataset.foto); if (f) { el.style.backgroundImage = 'url(' + f + ')'; el.classList.add('con'); } }); }
    // achica la foto del teléfono: máx 1100 px, jpg 0.72 (≈ 100–200 KB)
    const achicar = file => new Promise((ok, bad) => { const rd = new FileReader(); rd.onerror = () => bad(new Error('No se pudo leer la foto.')); rd.onload = () => { const img = new Image(); img.onerror = () => bad(new Error('Esa foto no se pudo abrir. Prueba con otra.')); img.onload = () => { const m = 1100, k = Math.min(1, m / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); ok(cv.toDataURL('image/jpeg', 0.72)); }; img.src = rd.result; }; rd.readAsDataURL(file); });

    // ---------- piezas de pantalla ----------
    const tabs = sel => '<nav class="tabs">' + [['', 'Mis piedras', ''], ['cotizar', 'Cotizar', ''], ['historial', 'Historial', '']].map(([k, t, n]) => '<a href="#piedras' + (k ? '/' + k : '') + '"' + (k === sel ? ' class="on"' : '') + '>' + t + (n !== '' ? ' <small>' + n + '</small>' : '') + '</a>').join('') + '</nav>';
    const chipsH = (k, l, val, cls) => '<div class="chips' + (cls ? ' ' + cls : '') + '" data-q="' + k + '">' + l.map(([v, t, sub]) => '<button type="button" data-v="' + esc(v) + '"' + (String(val) === String(v) ? ' class="on"' : '') + '>' + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>').join('') + '</div>';
    function tarjeta(s, extra) {
      const al = s.estado === 'usado' ? [] : alcanza(s).slice(0, 4);
      return '<a class="pz' + (s.estado === 'usado' ? ' usada' : '') + '" href="#piedras/s=' + esc(s.id) + '">' + (s.foto ? '<i class="pz-foto" data-foto="' + esc(s.id) + '"></i>' : '') + dibujo(s)
        + '<span><b>' + esc(s.piedra || 'Piedra') + '</b><small>' + esc(tipoTxt(s)) + ' · ' + r1(num(s.w)) + ' × ' + r1(num(s.h)) + ' cm</small>'
        + (s.estado === 'usado' ? '<small>Usada' + (s.usadoEn ? ': ' + esc(s.usadoEn) : '') + '</small>' : al.length ? '<small class="alc">Salen: ' + al.map(x => x.n + '× ' + esc(x.et)).join(' · ') + '</small>' : '<small class="alc">Muy chica para el catálogo</small>')
        + (extra || '') + '</span></a>';
    }
    // lo que se pide (forma + medida + cuántas) en una sola línea de campos
    const pideH = (q, id) => '<div class="pide" id="' + id + '">' + chipsH('forma', [['red', 'Redonda Ø'], ['rect', 'Cuadrada / rect.']], q.forma)
      + '<div class="tres-i">' + (q.forma === 'red' ? '<input data-c="d" inputmode="decimal" placeholder="Ø cm" value="' + esc(q.d || '') + '">' : '<input data-c="w" inputmode="decimal" placeholder="Largo" value="' + esc(q.w || '') + '"><input data-c="h" inputmode="decimal" placeholder="Ancho" value="' + esc(q.h || '') + '">')
      + '<input data-c="cant" inputmode="numeric" placeholder="Cuántas" value="' + esc(q.cant || '') + '"></div></div>';
    const leerPide = (box, q) => { $$('[data-c]', box).forEach(i => { q[i.dataset.c] = i.value.replace(/[^\d.,]/g, '').replace(',', '.'); }); };
    const reqDe = q => { const n = Math.max(1, Math.floor(num(q.cant) || 1)); if (q.forma === 'red') return cm(q.d) > 0 ? [{ forma: 'red', d: cm(q.d), cant: n }] : []; return cm(q.w) > 0 && cm(q.h) > 0 ? [{ forma: 'rect', w: cm(q.w), h: cm(q.h), cant: n }] : []; };
    const reqTxt = reqs => reqs.map(r => (num(r.cant) > 1 ? num(r.cant) + '× ' : '') + (r.nombre ? r.nombre + ' ' : '') + medTxt(r)).join(' + ');

    // ================= MIS PIEDRAS (simple: lo que hay que hacer · 2 botones · lista) =================
    let qB = (() => { try { return JSON.parse(localStorage.getItem('dkas-pz-busca')) || null; } catch (e) { return null; } })() || { forma: 'red', d: '', w: '', h: '', cant: '1', color: '' };
    const muestra = s => { const c = catDe(s.piedra); return s.foto ? '<i class="pz-mini" data-foto="' + esc(s.id) + '"' + (c ? ' style="background-image:url(img/piedras/' + c[0] + '.jpg)"' : ' style="background:' + tono(s.piedra)[0] + '"') + '></i>' : c ? '<i class="pz-mini" style="background-image:url(img/piedras/' + c[0] + '.jpg)"></i>' : '<i class="pz-mini" style="background:' + tono(s.piedra)[0] + '"></i>'; };
    const filaPz = s => '<a class="pz-row' + (s.estado === 'usado' ? ' usada' : '') + '" href="#piedras/s=' + esc(s.id) + '">' + muestra(s) + '<span><b>' + esc(s.piedra || 'Piedra') + '</b><small>' + (s.tipo === 'placa' ? 'Placa completa' : 'Pedazo') + ' · ' + r1(num(s.w)) + ' × ' + r1(num(s.h)) + ' cm' + (s.estado === 'usado' ? ' · usada' : '') + '</small></span><em>›</em></a>';
    function inicio() {
      const disp = disponibles(), placas = disp.filter(s => s.tipo === 'placa').length, ped = disp.length - placas;
      const por = {}; disp.forEach(s => { (por[s.piedra || 'Sin nombre'] = por[s.piedra || 'Sin nombre'] || []).push(s); });
      X.main().innerHTML = X.tit('Piedras', placas + (placas === 1 ? ' placa completa' : ' placas completas') + ' · ' + ped + (ped === 1 ? ' pedazo' : ' pedazos'), '') + tabs('')
        + '<a class="b grande pl-boton" href="#piedras/planes">🧩 Planeación<small>acomoda pedidos en placas · ' + planes().length + ' guardada' + (planes().length === 1 ? '' : 's') + '</small></a>'
        + '<div class="pz-acc"><button class="b negro grande" id="pz-placa">＋ Llegó una placa</button><button class="b grande" id="pz-pedazo">＋ Anotar un pedazo</button></div>'
        + alertasHTML()
        + '<section class="caja"><div class="caja-t"><h2>Mis piedras</h2><span class="sub">' + disp.length + '</span></div>'
          + (disp.length ? Object.entries(por).sort((a, b) => b[1].length - a[1].length).map(([c, l]) => '<div class="pz-lista">' + l.sort((a, b) => (b.tipo === 'placa') - (a.tipo === 'placa') || num(b.w) * num(b.h) - num(a.w) * num(a.h)).map(filaPz).join('') + '</div>').join('')
            : X.vacioTxt('Todavía no hay piedras. Toca “＋ Llegó una placa”.')) + '</section>'
        + X.plegable('¿Tengo piedra para…?', 'buscar una medida', '<div id="pz-q"></div><div id="pz-r"></div>')
        + (usadas().length ? X.plegable('Ya usadas', usadas().length + '', '<div class="pz-lista">' + usadas().sort((a, b) => (b.usadoFecha || '').localeCompare(a.usadoFecha || '')).map(filaPz).join('') + '</div>') : '');
      $('#pz-placa').onclick = () => agregar(null, { tipo: 'placa' }); $('#pz-pedazo').onclick = () => agregar(null, { tipo: 'sobrante' });
      enlazarAlertas(); pintarBusca(); pintarFotos(X.main());
    }
    function pintarBusca() {
      const box = $('#pz-q'); if (!box) return;
      box.innerHTML = pideH(qB, 'pz-pide') + '<div class="campo">Piedra' + chipsPiedra('color', qB.color, { cualquiera: true }) + '</div>';
      const out = () => {
        try { localStorage.setItem('dkas-pz-busca', JSON.stringify(qB)); } catch (e) {}
        const reqs = reqDe(qB), r = $('#pz-r'); if (!r) return;
        if (!reqs.length) { r.innerHTML = '<p class="nota">Escribe la medida y te digo si la tienes.</p>'; return; }
        const l = buscar(reqs, qB.color), mismo = l.filter(x => x.color), txt = reqTxt(reqs) + (qB.color ? ' ' + qB.color : '');
        r.innerHTML = (mismo.length ? '<p class="ok-g">✓ Sí tienes ' + esc(txt) + '</p>' : '<p class="aviso r">✕ No tienes ' + esc(txt) + '. Hay que comprar placa.</p>')
          + (mismo.length ? '<div class="pz-lista">' + mismo.slice(0, 4).map(x => '<div class="pz-row">' + muestra(x.s) + '<span><b>' + esc(x.s.piedra) + '</b><small>' + (x.s.tipo === 'placa' ? 'Placa completa' : 'Pedazo') + ' · ' + r1(num(x.s.w)) + ' × ' + r1(num(x.s.h)) + '</small></span><button class="b chico verde" data-cortar="' + esc(x.s.id) + '">✂ Cortar</button></div>').join('') + '</div>' : '');
        $$('[data-cortar]', r).forEach(b => b.onclick = () => cortar(pieza(b.dataset.cortar), { reqs }));
      };
      $$('[data-q]', box).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; leerPide(box, qB); qB[g.dataset.q] = b.dataset.v; pintarBusca(); });
      $$('[data-c]', box).forEach(i => i.oninput = () => { leerPide(box, qB); out(); });
      out();
    }

    // ---------- llegó una placa / anotar un pedazo / editar (solo 3 cosas: piedra, medida, foto) ----------
    function agregar(s0, pre) {
      s0 = s0 || {}; pre = pre || {};
      const esPlaca = () => d.tipo === 'placa';
      const d = { tipo: s0.tipo || pre.tipo || 'placa', piedra: s0.piedra || pre.piedra || '', w: s0.w || pre.w || '', h: s0.h || pre.h || '', cant: 1, otraMedida: !!s0.id, costo: s0.costo != null ? s0.costo : '', proveedor: s0.proveedor || '', fecha: s0.fecha || hoy(), nota: s0.nota || '', pedido: s0.pedido || pre.pedido || '', foto: null };
      if (!s0.id && esPlaca()) { d.w = PLACA().w; d.h = PLACA().h; d.costo = P.C.placa.precio; }
      X.hoja(s0.id ? 'Editar piedra' : esPlaca() ? 'Llegó una placa' : 'Anotar un pedazo', '<div id="ag"></div>', h => {
        const pintar = () => {
          const medidaH = esPlaca() && !d.otraMedida
            ? '<div class="pz-fija"><b>320 × 160 cm</b><span>placa completa</span><div class="cuantas"><button type="button" id="ag-m">−</button><b>' + d.cant + '</b><button type="button" id="ag-p1">＋</button></div></div><button type="button" class="lnk" id="ag-om">Es de otra medida</button>'
            : '<div class="dos-i"><label class="campo">Largo (cm)<input id="ag-w" inputmode="decimal" placeholder="ej. 120" value="' + esc(d.w) + '"></label><label class="campo">Ancho (cm)<input id="ag-h" inputmode="decimal" placeholder="ej. 37" value="' + esc(d.h) + '"></label></div>' + '<p class="nota">Con el flexómetro: <b>largo</b> = el lado más grande, <b>ancho</b> = el corto. En centímetros (si pones 1.20 lo tomo como 120).' + (esPlaca() ? '' : ' Mide solo la parte buena, sin lo roto.') + '</p><div id="ag-prev"></div>';
          $('#ag', h).innerHTML = '<div class="campo"><span class="num">1</span> ¿Qué piedra?' + chipsPiedra('piedra', d.piedra, { conOtra: true }) + (otraAbierta(d.piedra) ? '<input id="ag-p" maxlength="40" placeholder="Nombre de la piedra" value="' + esc(limpiaP(d.piedra)) + '">' : '') + '</div>'
            + '<div class="campo"><span class="num">2</span> Medida' + medidaH + '</div>'
            + '<div class="campo"><span class="num">3</span> Foto' + (d.foto ? '<img class="ag-foto" src="' + d.foto + '" alt="">' : '') + '<label class="b grande foto-b">📷 ' + (d.foto || s0.foto ? 'Cambiar foto' : 'Tomar foto') + '<input id="ag-foto" type="file" accept="image/*" hidden></label></div>'
            + '<details class="plegable"><summary><span>Más datos (opcional)</span><small>costo, proveedor</small></summary><div class="pl-c"><div class="dos-i"><label class="campo">Costo' + (esPlaca() && !s0.id ? ' c/u' : '') + '<input id="ag-c" inputmode="decimal" placeholder="$0" value="' + esc(d.costo) + '"></label><label class="campo">Proveedor<input id="ag-pr" maxlength="40" placeholder="ej. Jaime" value="' + esc(d.proveedor) + '"></label></div><div class="dos-i"><label class="campo">Fecha<input id="ag-f" type="date" value="' + esc(d.fecha) + '"></label><label class="campo">Nota<input id="ag-no" maxlength="80" value="' + esc(d.nota) + '"></label></div></div></details>'
            + '<button class="b negro grande" id="ag-ok">' + (s0.id ? 'Guardar cambios' : 'Guardar') + '</button>' + (s0.id ? '<button class="b rojo" id="ag-b">Borrar esta piedra</button>' : '');
          const leer = () => { if ($('#ag-p', h)) d.piedra = $('#ag-p', h).value.trim() || OTRA; if ($('#ag-w', h)) { d.w = $('#ag-w', h).value; d.h = $('#ag-h', h).value; } d.costo = $('#ag-c', h).value; d.proveedor = $('#ag-pr', h).value.trim(); d.fecha = $('#ag-f', h).value || hoy(); d.nota = $('#ag-no', h).value.trim(); };
          $$('[data-q]', h).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; leer(); d[g.dataset.q] = b.dataset.v; pintar(); });
          if ($('#ag-m', h)) { $('#ag-m', h).onclick = () => { leer(); d.cant = Math.max(1, d.cant - 1); pintar(); }; $('#ag-p1', h).onclick = () => { leer(); d.cant = Math.min(20, d.cant + 1); pintar(); }; $('#ag-om', h).onclick = () => { leer(); d.otraMedida = true; d.w = ''; d.h = ''; pintar(); }; }
          const prev = () => { const box = $('#ag-prev', h); if (!box) return; const w = cm($('#ag-w', h).value), hh = cm($('#ag-h', h).value); if (!(w >= 5 && hh >= 5)) { box.innerHTML = ''; return; } const s = { piedra: limpiaP(d.piedra), w: Math.max(w, hh), h: Math.min(w, hh), tipo: d.tipo }, al = alcanza(s);
            box.innerHTML = '<div class="dib chico">' + dibujo(s) + '</div><p class="' + (al.length ? 'ok-g' : 'aviso') + '">' + (al.length ? 'De aquí salen: ' + al.slice(0, 5).map(x => x.n + '× ' + esc(x.et)).join(' · ') : 'No sale ninguna grapa del catálogo, pero sí una pieza de hasta <b>Ø' + Math.floor(s.h) + '</b> (redonda) o <b>' + Math.floor(s.w) + ' × ' + Math.floor(s.h) + '</b>. Se guarda igual.') + '</p>'; };
          if ($('#ag-w', h)) { $('#ag-w', h).oninput = prev; $('#ag-h', h).oninput = prev; prev(); }
          $('#ag-foto', h).onchange = async e => { const f = e.target.files && e.target.files[0]; if (!f) return; leer(); try { X.aviso('Preparando foto…'); d.foto = await achicar(f); pintar(); } catch (er) { X.aviso(er.message, true); } };
          $('#ag-ok', h).onclick = async () => {
            leer(); const w = cm(d.w), hh = cm(d.h), n = s0.id ? 1 : d.cant;
            if (!limpiaP(d.piedra)) return X.aviso('Toca qué piedra es.', true); d.piedra = limpiaP(d.piedra);
            if (!(w >= 5 && hh >= 5)) return X.aviso('Escribe el largo y el ancho en cm.', true);
            if (w > 400 || hh > 400) return X.aviso('Esa medida es muy grande. Va en centímetros (ej. 120, no 1.20).', true);
            const W_ = Math.max(w, hh), H_ = Math.min(w, hh);
            if (!await X.clave(s0.id ? 'Guardar cambios' : 'Guardar piedra', [['Qué', (n > 1 ? n + ' × ' : '') + (esPlaca() ? 'Placa' : 'Pedazo')], ['Piedra', d.piedra], ['Medida', W_ + ' × ' + H_ + ' cm'], ['Foto', d.foto ? 'sí' : s0.foto ? 'la que ya tiene' : 'sin foto']])) return;
            X.cerrarHoja();
            await X.guardarYa(async () => {
              const u = {}, me = X.me().nombre || '', hId = nid('h');
              if (s0.id) {
                Object.assign(u, { ['dinero/sobrantes/' + s0.id + '/piedra']: d.piedra.slice(0, 40), ['dinero/sobrantes/' + s0.id + '/w']: W_, ['dinero/sobrantes/' + s0.id + '/h']: H_, ['dinero/sobrantes/' + s0.id + '/costo']: num(d.costo) || null, ['dinero/sobrantes/' + s0.id + '/proveedor']: d.proveedor || null, ['dinero/sobrantes/' + s0.id + '/fecha']: d.fecha, ['dinero/sobrantes/' + s0.id + '/nota']: d.nota || null, ['dinero/sobrantes/' + s0.id + '/editado']: TS });
                if (d.foto) { u['piedra/fotos/' + s0.id] = d.foto; u['dinero/sobrantes/' + s0.id + '/foto'] = true; FOTOS[s0.id] = d.foto; }
                u['dinero/piedraHist/' + hId] = { accion: 'Editó', fecha: hoy(), pieza: s0.id, piedra: d.piedra.slice(0, 40), detalle: 'Corrigió ' + nomPieza(s0) + ' → ' + d.piedra + ' ' + W_ + '×' + H_ + (d.foto ? ' (foto nueva)' : ''), por: me, creado: TS };
              } else {
                const ids = [];
                for (let i = 0; i < n; i++) {
                  const id = nid('pz'); ids.push(id);
                  u['dinero/sobrantes/' + id] = { piedra: d.piedra.slice(0, 40), w: W_, h: H_, tipo: d.tipo, costo: num(d.costo) || null, proveedor: d.proveedor || null, fecha: d.fecha, nota: d.nota || null, pedido: d.pedido || null, estado: 'disponible', foto: d.foto ? true : null, por: me, creado: TS };
                  if (d.foto) { u['piedra/fotos/' + id] = d.foto; FOTOS[id] = d.foto; }
                }
                u['dinero/piedraHist/' + hId] = { accion: 'Entró', fecha: d.fecha, pieza: ids[0], quedan: ids, piedra: d.piedra.slice(0, 40), pedido: d.pedido || null, detalle: (n > 1 ? n + ' × ' : '') + (esPlaca() ? 'Placa ' : 'Pedazo ') + d.piedra + ' ' + W_ + '×' + H_ + (num(d.costo) ? ' · ' + pesos(num(d.costo)) + (n > 1 ? ' c/u' : '') : '') + (d.proveedor ? ' · ' + d.proveedor : ''), por: me, creado: TS };
              }
              await A.nodoVarios(u);
            }, s0.id ? 'Piedra guardada' : (n > 1 ? n + ' placas guardadas' : 'Guardada en tus piedras'), (s0.id ? 'Editó piedra ' : 'Agregó ') + (n > 1 ? n + ' × ' : '') + d.piedra + ' ' + W_ + '×' + H_);
          };
          if (s0.id) $('#ag-b', h).onclick = async () => {
            if (!await X.clave('Borrar piedra', [['Piedra', nomPieza(s0)], ['Ojo', 'Se borra del stock; el historial se queda']])) return;
            X.cerrarHoja(); await X.guardarYa(async () => { const u = { ['dinero/sobrantes/' + s0.id]: null, ['piedra/fotos/' + s0.id]: null }; u['dinero/piedraHist/' + nid('h')] = { accion: 'Borró', fecha: hoy(), pieza: s0.id, piedra: s0.piedra || '', detalle: 'Borró ' + tipoTxt(s0).toLowerCase() + ' ' + nomPieza(s0), por: X.me().nombre || '', creado: TS }; await A.nodoVarios(u); }, 'Piedra borrada', 'Borró piedra ' + nomPieza(s0));
            location.hash = '#piedras';
          };
        };
        pintar();
      });
    }

    // ---------- una piedra: foto, dibujo, de dónde salió, en qué se usó ----------
    function detalle(s) {
      const H = hist().filter(x => x.pieza === s.id || (x.quedan || []).includes(s.id)), hijos = todas().filter(x => x.origen === s.id), madre = s.origen ? pieza(s.origen) : null, al = s.estado === 'usado' ? [] : alcanza(s);
      X.main().innerHTML = '<a class="volver" href="#piedras">‹ Piedras</a>' + X.tit(esc(s.piedra || 'Piedra'), esc(tipoTxt(s)) + ' · ' + r1(num(s.w)) + ' × ' + r1(num(s.h)) + ' cm' + (s.estado === 'usado' ? ' · ya usada' : ''), s.estado === 'usado' ? '' : '<div class="tit-b"><button class="b negro" id="d-cut">✂ Cortar</button><button class="b" id="d-ed">Editar</button></div>')
        + '<section class="caja det"><i class="pz-foto grande" ' + (s.foto ? 'data-foto="' + esc(s.id) + '"' : '') + '>' + (s.foto ? '' : '<button class="b" id="d-foto">📷 Agregar foto</button>') + '</i>' + dibujo(s) + '</section>'
        + '<section class="caja"><dl class="conf">' + [['Medida', r1(num(s.w)) + ' × ' + r1(num(s.h)) + ' cm (' + (num(s.w) * num(s.h) / 1e4).toFixed(2) + ' m²)'], ['Tipo', tipoTxt(s)], ['Estado', s.estado === 'usado' ? 'Usada' + (s.usadoEn ? ': ' + s.usadoEn : '') : 'Disponible'], ['Fecha', fC(s.fecha) || '—'], ['Costo', num(s.costo) ? pesos(num(s.costo)) : '—'], ['Proveedor', s.proveedor || '—'], ['Salió de', madre ? nomPieza(madre) : s.origen ? 'otra piedra' : '—'], ['Pedido', s.pedido ? X.M().nomPed(s.pedido) : '—'], ['Nota', s.nota || '—']].map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>'
        + (madre ? '<a class="lnk" href="#piedras/s=' + esc(madre.id) + '">Ver la piedra de donde salió ›</a>' : '') + '</section>'
        + (al.length ? '<section class="caja"><h2>De aquí salen</h2><p>' + al.map(x => '<b>' + x.n + '</b> ' + esc(x.et)).join(' · ') + '</p><p class="nota">Cada medida por separado (si cortas solo esa).</p></section>' : '')
        + (hijos.length ? '<section class="caja"><h2>Pedazos que quedaron de esta</h2><div class="pzs">' + hijos.map(x => tarjeta(x)).join('') + '</div></section>' : '')
        + '<section class="caja"><h2>Historial de esta piedra</h2>' + (H.length ? '<ul class="hist">' + H.map(filaHist).join('') + '</ul>' : X.vacioTxt('Sin movimientos todavía.')) + '</section>';
      if ($('#d-cut')) $('#d-cut').onclick = () => cortar(s);
      if ($('#d-ed')) $('#d-ed').onclick = () => agregar(s);
      if ($('#d-foto')) $('#d-foto').onclick = () => agregar(s);
      pintarFotos(X.main());
    }

    // ================= CORTAR (simple: si viene de un pedido ya va lleno; solo confirmas) =================
    function cortar(s, pre) {
      if (!s) return X.aviso('Esa piedra ya no está.', true);
      pre = pre || {};
      let reqs = (pre.reqs || []).map(r => Object.assign({}, r)), pedido = pre.pedido || '', q = { forma: 'red', d: '', w: '', h: '', cant: '1' }, conCortes = false, editar = !reqs.length;
      const activos = X.M().pedidos.filter(p => !p.cerrado);
      X.hoja('Cortar', '<div id="ct"></div>', h => {
        const pintar = () => {
          const r = reqs.length ? corte(s, reqs) : null, sob = r ? r.sobrantes.map(x => ({ w: Math.floor(x.w), h: Math.floor(x.h) })).filter(x => x.w >= CFG.minSob && x.h >= CFG.minSob) : [];
          const pn = pedido ? X.M().nomPed(pedido) : '';
          $('#ct', h).innerHTML = '<div class="ct-res"><span>De</span><b>' + esc(nomPieza(s)) + '</b><small>' + esc(tipoTxt(s)) + '</small>'
              + (reqs.length ? '<span>Sale</span><b>' + esc(reqTxt(reqs)) + '</b>' + (pn ? '<small>para ' + esc(pn) + '</small>' : '<small>para tu stock</small>') : '') + '</div>'
            + (r ? '<div class="dib">' + dibujo(s, r) + '</div>' + (r.faltan.length ? '<p class="aviso r">✕ No cabe: ' + esc(r.faltan.map(x => x.et).join(', ')) + '. Esta piedra no alcanza.</p>'
              : '<p class="ok-g">✓ Cabe. Quedan ' + sob.length + ' pedazo' + (sob.length === 1 ? '' : 's') + (sob.length ? ': ' + sob.map(x => x.w + '×' + x.h).join(' · ') : '') + ' (se guardan solos)</p>') : '<p class="nota">Elige qué vas a sacar de esta piedra.</p>')
            + '<button class="b negro grande" id="ct-ok"' + (!r || r.faltan.length ? ' disabled' : '') + '>✂ Cortar</button>'
            + (r && !r.faltan.length ? '<button class="b grande" id="ct-img">🖼 Imagen para compartir</button><div id="ct-vp"></div>' : '')
            + '<details class="plegable"' + (editar ? ' open' : '') + '><summary><span>' + (reqs.length ? 'Cambiar piezas o pedido' : 'Piezas') + '</span></summary><div class="pl-c">'
              + (reqs.length ? '<ul class="corta">' + reqs.map((x, i) => '<li><b>' + (num(x.cant) > 1 ? num(x.cant) + ' × ' : '') + esc((x.nombre ? x.nombre + ' ' : '') + medTxt(x)) + '</b><button type="button" class="x" data-del="' + i + '" aria-label="Quitar">✕</button></li>').join('') + '</ul>' : '')
              + '<div class="campo">Del catálogo<div class="chips">' + (X.piezas() || []).map((p, i) => '<button type="button" data-cat="' + i + '">＋ ' + esc(K.etiqueta(p)) + '</button>').join('') + '</div></div>'
              + '<div class="campo">Otra medida' + pideH(q, 'ct-pide') + '<button type="button" class="b chico" id="ct-add">＋ Agregar</button></div>'
              + '<div class="campo">¿Para qué pedido?' + chipsH('pedido', [['', 'Stock']].concat(activos.map(p => [p.id, X.M().nomPedido(p)])), pedido) + '</div>'
              + (r ? '<details class="plegable"><summary><span>Orden de los cortes (taller)</span><small>' + r.cortes.length + '</small></summary><div class="pl-c"><ol class="cola-ins">' + K.pasos(r).map(t => '<li>' + esc(t) + '</li>').join('') + '</ol></div></details>' : '')
            + '</div></details>';
          const pl = $('details.plegable', h); if (pl) pl.ontoggle = () => { editar = pl.open; };
          $$('[data-del]', h).forEach(b => b.onclick = () => { reqs.splice(+b.dataset.del, 1); pintar(); });
          $$('[data-cat]', h).forEach(b => b.onclick = () => { const p = X.piezas()[+b.dataset.cat], ya = reqs.find(x => x.nombre === p.nombre && x.forma === (p.forma === 'red' ? 'red' : 'rect') && num(x.d) === num(p.d) && num(x.w) === num(p.w) && num(x.h) === num(p.h)); if (ya) ya.cant = num(ya.cant) + 1; else reqs.push({ nombre: p.nombre, forma: p.forma === 'red' ? 'red' : 'rect', d: num(p.d), w: num(p.w), h: num(p.h), cant: 1 }); pintar(); });
          const box = $('#ct-pide', h);
          $$('[data-q]', h).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; if (g.dataset.q === 'forma') { leerPide(box, q); q.forma = b.dataset.v; } else pedido = b.dataset.v; pintar(); });
          $('#ct-add', h).onclick = () => { leerPide(box, q); const rq = reqDe(q); if (!rq.length) return X.aviso('Escribe la medida.', true); reqs.push(rq[0]); q = { forma: q.forma, d: '', w: '', h: '', cant: '1' }; pintar(); };
          if ($('#ct-img', h)) $('#ct-img', h).onclick = async () => { const cv = await lienzoPlaca({ piedra: s.piedra, w: num(s.w), h: num(s.h), r, titulo: (s.tipo === 'placa' ? 'Placa ' : 'Pedazo ') + nomPieza(s), sub: subPlan(r), nombre: p => pn ? limpiaN(pn) : (p.nombre || 'Pieza') }); $('#ct-vp', h).innerHTML = '<img class="vp-img" src="' + cv.toDataURL('image/jpeg', 0.9) + '" alt=""><button class="b verde grande" id="ct-share">📤 Mandar imagen (WhatsApp)</button>'; $('#ct-share', h).onclick = () => cv.toBlob(bl => X.bajar(bl, 'Placa ' + (s.piedra || '') + '.png'), 'image/png'); };
          $('#ct-ok', h).onclick = async () => {
            if (!r || r.faltan.length || conCortes) return;
            const cort = reqTxt(reqs);
            if (!await X.clave('Cortar piedra', [['De', nomPieza(s)], ['Sale', cort], ['Para', pn || 'stock'], ['Quedan', sob.length ? sob.map(x => x.w + '×' + x.h).join(' · ') : 'nada que sirva']])) return;
            conCortes = true; X.cerrarHoja();
            await X.guardarYa(async () => {
              const u = {}, me = X.me().nombre || '', ids = [], f = hoy(), pre_ = 'dinero/sobrantes/' + s.id + '/';
              sob.forEach(x => { const id = nid('pz'); ids.push(id); u['dinero/sobrantes/' + id] = { piedra: s.piedra || 'Sin nombre', w: Math.max(x.w, x.h), h: Math.min(x.w, x.h), tipo: 'sobrante', origen: s.id, fecha: f, estado: 'disponible', nota: 'Quedó al cortar ' + cort + (pn ? ' (' + pn + ')' : '') + ' de ' + nomPieza(s), por: me, creado: TS }; });
              u[pre_ + 'estado'] = 'usado'; u[pre_ + 'usadoEn'] = (cort + (pn ? ' · ' + pn : '')).slice(0, 120); u[pre_ + 'usadoFecha'] = f; u[pre_ + 'editado'] = TS;
              u['dinero/piedraHist/' + nid('h')] = { accion: 'Corte', fecha: f, pieza: s.id, piedra: s.piedra || '', pedido: pedido || null, grupos: pedido && pedido === pre.pedido && pre.grupos ? pre.grupos : null, cortadas: reqs.map(x => (num(x.cant) > 1 ? num(x.cant) + '× ' : '') + (x.nombre ? x.nombre + ' ' : '') + medTxt(x)), quedan: ids.length ? ids : null,
                detalle: 'De ' + tipoTxt(s).toLowerCase() + ' ' + nomPieza(s) + ' se cortó ' + cort + (pn ? ' para ' + pn : '') + '. Quedó: ' + (sob.length ? sob.map(x => x.w + '×' + x.h).join(', ') : 'nada que sirva'), por: me, creado: TS };
              await A.nodoVarios(u);
            }, 'Cortado ✓ · quedan ' + sob.length + ' pedazo' + (sob.length === 1 ? '' : 's') + ' en tus piedras', 'Cortó ' + cort + ' de ' + nomPieza(s) + (pn ? ' · ' + pn : ''));
          };
        };
        pintar();
      });
    }

    // ================= HISTORIAL =================
    const ICON = { 'Entró': '＋', 'Corte': '✂', 'Editó': '✎', 'Borró': '✕', 'Foto': '📷' };
    function filaHist(x) {
      const ped = x.pedido ? X.M().ped(x.pedido) : null;
      return '<li class="h-' + esc((x.accion || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) + '"><i>' + (ICON[x.accion] || '•') + '</i><span><b>' + esc(x.accion || '') + ' · ' + esc(x.piedra || '') + '</b><small>' + esc(x.detalle || '') + '</small><small>' + esc(fC(x.fecha)) + (x.por ? ' · ' + esc(x.por) : '') + (ped ? ' · <a href="#p=' + esc(ped.id) + '">' + esc(X.M().nomPedido(ped)) + '</a>' : '') + (x.pieza && pieza(x.pieza) ? ' · <a href="#piedras/s=' + esc(x.pieza) + '">ver piedra</a>' : '') + '</small></span></li>';
    }
    let filtroH = '';
    function historial() {
      const H = hist(), cols = [...new Set(H.map(x => x.piedra).filter(Boolean))], L = H.filter(x => !filtroH || x.piedra === filtroH);
      const entraron = H.filter(x => x.accion === 'Entró').length, cortes = H.filter(x => x.accion === 'Corte').length;
      X.main().innerHTML = X.tit('Piedras', 'Todo lo que entra, se corta y queda', '') + tabs('historial')
        + '<section class="kpis cuatro">' + X.kpi('Entradas', String(entraron)) + X.kpi('Cortes', String(cortes)) + X.kpi('Disponibles', String(disponibles().length), 'v', '', '#piedras') + X.kpi('Ya usadas', String(usadas().length)) + '</section>'
        + (cols.length > 1 ? '<div class="chips filtros" id="hf"><button data-v=""' + (!filtroH ? ' class="on"' : '') + '>Todas</button>' + cols.map(c => '<button data-v="' + esc(c) + '"' + (filtroH === c ? ' class="on"' : '') + '>' + esc(c) + '</button>').join('') + '</div>' : '')
        + '<section class="caja">' + (L.length ? '<ul class="hist">' + L.map(filaHist).join('') + '</ul>' : X.vacioTxt('Todavía no hay movimientos de piedra. Cuando agregues una placa o cortes, queda aquí.')) + '</section>';
      $$('#hf [data-v]').forEach(b => b.onclick = () => { filtroH = b.dataset.v; historial(); });
    }

    // ================= PRECIOS (editables) =================
    function precios() {
      const g = X.D().precios || {};
      X.main().innerHTML = X.tit('Piedras', 'Precios: el cotizador calcula con estos', '') + tabs('precios')
        + '<section class="caja"><h2>Precios y costos</h2><p class="nota">Cámbialos cuando cambien tus costos. La calculadora y la cotización al cliente se actualizan solas.</p><div class="precios">'
        + CAMPOS_P.map(([k, t, gt]) => '<label class="campo">' + esc(t) + '<input data-p="' + k + '" inputmode="decimal" value="' + esc(gt()) + '">' + (String(DEF_P[k]) !== String(gt()) ? '<small class="nota">Antes: ' + esc(k === 'margen' ? '×' + DEF_P[k] : k === 'baseF' ? DEF_P[k] + '%' : pesos(DEF_P[k])) + '</small>' : '') + '</label>').join('') + '</div>'
        + '<div id="pr-ej" class="vivo"></div><button class="b negro grande" id="pr-ok">Guardar precios</button>' + (Object.keys(g).length ? '<button class="b" id="pr-def">Volver a los precios de antes</button>' : '') + '</section>'
        + '<section class="caja"><h2>Cómo calcula</h2><p class="nota">Costo = parte de la placa que usa (si de la placa salen 2, cada una paga la mitad; lo que sobra para mesitas de 80×80 se descuenta) + corte y canto por metro + MDF + base + pegamento y empaque + extra por pieza. Precio = costo × ' + esc(P.C.margen) + ', redondeado a $100. Mesas grandes: se suma la entrega. Si tienes la piedra en stock, la parte de la placa ya está pagada y la ganancia sube.</p></section>';
      const ej = () => { const v = {}; $$('[data-p]').forEach(i => { v[i.dataset.p] = num(i.value); }); const viejo = {}; CAMPOS_P.forEach(([k, , gt, st]) => { viejo[k] = gt(); if (v[k] > 0) st(v[k]); });
        const ms = [['centro', 'red', 80, 80, 'Centro Ø80'], ['lateral', 'red', 60, 60, 'Lateral Ø60'], ['comedor', 'rect', 200, 100, 'Comedor 200×100']].map(([u, f, w, hh, n]) => { const m = P.calcular({ uso: u, forma: f, w, h: hh }); return '<div>' + n + '<b>' + pesos(m.precio) + '</b><small>costo ' + pesos(m.costo) + '</small></div>'; }).join('');
        CAMPOS_P.forEach(([k, , , st]) => st(viejo[k])); $('#pr-ej').innerHTML = ms; };
      $$('[data-p]').forEach(i => i.oninput = ej); ej();
      $('#pr-ok').onclick = async () => {
        const v = {}, cam = []; $$('[data-p]').forEach(i => { const k = i.dataset.p, n = num(i.value); if (!(n > 0)) return; v[k] = n; if (String(n) !== String(DEF_P[k])) cam.push([CAMPOS_P.find(c => c[0] === k)[1], String(n)]); });
        if (v.margen && (v.margen < 1 || v.margen > 5)) return X.aviso('El multiplicador va entre 1 y 5 (ej. 1.6).', true);
        if (!await X.clave('Guardar precios', cam.length ? cam.slice(0, 8) : [['Precios', 'los de siempre']])) return;
        await X.guardarYa(() => A.nodoPon('dinero/precios', v), 'Precios guardados', 'Cambió precios: ' + cam.map(x => x[0] + ' ' + x[1]).join(', '));
      };
      if ($('#pr-def')) $('#pr-def').onclick = async () => { if (!await X.clave('Volver a los precios de antes', [['Precios', 'los originales']])) return; await X.guardarYa(() => A.nodoPon('dinero/precios', null), 'Precios de antes', 'Regresó los precios originales'); };
    }

    // ================= COTIZAR: calculadora automática conectada al stock =================
    const USOS = [['comedor', 'Comedor'], ['centro', 'Centro'], ['lateral', 'Lateral'], ['periquera', 'Periquera'], ['consola', 'Consola'], ['escritorio', 'Escritorio']];
    const FORMAS = [['rect', 'Rectangular'], ['red', 'Redonda'], ['oval', 'Ovalada'], ['org', 'Orgánica']];
    const nomUso = u => (USOS.find(x => x[0] === u) || [, 'Mesa'])[1];
    const nomForma = f => (FORMAS.find(x => x[0] === f) || [, ''])[1].toLowerCase();
    let qc = (() => { try { return JSON.parse(localStorage.getItem('dkas-pz-coti')) || null; } catch (e) { return null; } })() || { uso: 'centro', forma: 'red', w: '80', h: '', alto: '', cant: '1', piedra: '' };
    // calcula una mesa: precio normal y, si hay piedra en stock de ese color donde quepa, el costo con esa piedra
    function calcula(q) {
      const forma = q.forma, w = cm(q.w), h = forma === 'red' ? w : cm(q.h), cant = Math.max(1, Math.floor(num(q.cant) || 1));
      const r = P.cotizar({ uso: q.uso, forma, w, h, cant }); if (r.error) return r;
      const req = [{ forma: forma === 'red' ? 'red' : 'rect', d: w, w, h, cant }]; // ovalada/orgánica: su rectángulo
      const st = buscar(req, limpiaP(q.piedra)), m = r.m, conStock = st.length && st[0].color ? st[0] : null;
      r.stock = st; r.conStock = conStock; r.costoTotal = m.costo * cant; r.costoStock = (m.costo - m.piedra) * cant;
      r.alto = num(q.alto) || m.alto; r.req = req;
      return r;
    }
    function cotizar() {
      X.main().innerHTML = X.tit('Piedras', 'Cotizar', '') + tabs('cotizar')
        + '<a class="b verde grande coti-cli" href="#piedras/cliente">📄 Cotizar al cliente <small>arma la cotización y mándala en PDF</small></a>'
        + '<section class="caja"><h2>Calculadora rápida</h2><div id="qc"></div></section><div id="qc-r"></div>'
        + cotisGuardadas() + '<a class="b grande" href="#piedras/precios">⚙ Cambiar precios</a>';
      pintarQC();
      $$('[data-cot]').forEach(a => a.onclick = e => { e.preventDefault(); location.hash = '#piedras/cliente=' + a.dataset.cot; });
    }
    function pintarQC() {
      const box = $('#qc'); if (!box) return;
      box.innerHTML = '<div class="campo">¿Qué mesa?' + chipsH('uso', USOS, qc.uso) + '</div><div class="campo">Forma' + chipsH('forma', FORMAS, qc.forma) + '</div>'
        + '<div class="campo">Medidas (cm)<div class="tres-i"><input data-k="w" inputmode="decimal" placeholder="' + (qc.forma === 'red' ? 'Diámetro' : 'Largo') + '" value="' + esc(qc.w) + '">' + (qc.forma === 'red' ? '' : '<input data-k="h" inputmode="decimal" placeholder="Ancho" value="' + esc(qc.h) + '">') + '<input data-k="alto" inputmode="decimal" placeholder="Alto (' + (P.ALTO[qc.uso] || 75) + ')" value="' + esc(qc.alto) + '"><input data-k="cant" inputmode="numeric" placeholder="Cuántas" value="' + esc(qc.cant) + '"></div></div>' + (comunes(qc.uso, qc.forma).length ? '<div class="campo">Medidas que más se venden (toca una)' + comunesH(comunes(qc.uso, qc.forma), 'data-qmed') + '</div>' : '')
        + '<div class="campo">Piedra' + chipsPiedra('piedra', qc.piedra, { conOtra: true }) + (otraAbierta(qc.piedra) ? '<input data-k="piedra" maxlength="40" placeholder="Nombre de la piedra" value="' + esc(limpiaP(qc.piedra)) + '">' : '') + '</div>';
      $$('[data-q]', box).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; leerQC(box); qc[g.dataset.q] = b.dataset.v; pintarQC(); });
      $$('[data-k]', box).forEach(i => i.oninput = () => { leerQC(box); resultadoQC(); });
      $$('[data-qmed]', box).forEach(b => b.onclick = () => { const [a, c] = b.dataset.qmed.split(','); qc.w = a; qc.h = qc.forma === 'red' ? '' : c; pintarQC(); });
      resultadoQC();
    }
    const leerQC = box => { $$('[data-k]', box).forEach(i => { qc[i.dataset.k] = i.dataset.k === 'piedra' ? (i.value.trim() || OTRA) : i.value.replace(/[^\d.,]/g, '').replace(',', '.'); }); };
    function resultadoQC() {
      try { localStorage.setItem('dkas-pz-coti', JSON.stringify(qc)); } catch (e) {}
      const out = $('#qc-r'); if (!out) return;
      if (!num(qc.w) || (qc.forma !== 'red' && !num(qc.h))) { out.innerHTML = ''; return; }
      const r = calcula(qc);
      if (r.error) { out.innerHTML = '<section class="caja"><p class="aviso r">' + esc(r.error) + '</p></section>'; return; }
      const m = r.m, cant = r.cant, sem = P.semaforo(r.pct10), cs = r.conStock;
      const fila = (t, v) => '<tr><td>' + t + '</td><td>' + pesos(v * cant) + '</td></tr>';
      out.innerHTML = '<section class="caja precio-g"><small>' + esc(nomUso(qc.uso) + ' ' + nomForma(qc.forma) + ' ' + (qc.forma === 'red' ? 'Ø' + num(qc.w) : num(qc.w) + '×' + num(qc.h)) + ' cm' + (cant > 1 ? ' · ' + cant + ' piezas' : '')) + '</small><b>' + pesos(r.total) + '</b><p>' + (m.chico ? 'Precio con entrega incluida' : pesos(r.precio) + ' la mesa + ' + pesos(r.entrega) + ' de entrega (' + (m.minivan ? 'minivan' : 'flete') + ')') + '</p>'
        + '<div class="vivo"><div>Costo<b>' + pesos(r.costoTotal) + '</b></div><div>Ganancia<b class="v">' + pesos(r.precio - r.costoTotal) + '</b></div><div>Con 10%<b class="' + (sem === 'ok' ? 'v' : sem === 'no' ? 'r' : '') + '">' + pesos(r.d10) + '</b></div></div></section>'
        + (cs ? '<section class="caja ok"><h2>✓ Tienes la piedra en stock</h2><p>' + esc(nomPieza(cs.s)) + ' (' + esc(tipoTxt(cs.s).toLowerCase()) + '). La placa ya está pagada: tu costo baja a <b>' + pesos(r.costoStock) + '</b> y ganas <b class="v">' + pesos(r.precio - r.costoStock) + '</b> (' + pesos(m.piedra * cant) + ' más).</p><div class="dib chico">' + dibujo(cs.s, cs.r) + '</div><button class="b chico verde" id="qc-cut">✂ Cortar de ahí</button></section>'
          : '<section class="caja"><h2>' + (r.stock.length ? 'Hay piedra de otro color donde cabe' : 'No tienes esa piedra en stock') + '</h2><p class="nota">Hay que comprar placa (' + pesos(P.C.placa.precio) + '). De una placa salen ' + m.ac.n + ' de esta medida' + (r.placas > 1 ? '; para ' + cant + ' necesitas ' + r.placas + ' placas' : '') + '.</p>' + (r.stock.length ? '<div class="pzs">' + r.stock.slice(0, 3).map(x => tarjeta(x.s)).join('') + '</div>' : '') + '</section>')
        + X.plegable('Desglose del costo', pesos(r.costoTotal), '<div class="tabla"><table><tbody>' + fila('Piedra (parte de la placa)', m.piedra) + fila('Corte y canto', m.corte) + fila('MDF', m.mdf) + fila('Base de herrería', m.base) + fila('Pegamento', m.pegamento) + fila('Empaque', m.empaque) + fila('Extra por pieza (taller)', P.C.extra) + '</tbody><tfoot><tr><td>Costo</td><td>' + pesos(r.costoTotal) + '</td></tr><tr><td>Precio (× ' + P.C.margen + ')</td><td>' + pesos(r.precio) + '</td></tr></tfoot></table></div><p class="nota">Pesa ≈ ' + m.peso * cant + ' kg · alto sugerido ' + m.alto + ' cm' + (m.pers ? ' · ' + m.pers + ' personas' : '') + '.</p>')
        + X.plegable('Cómo sale de la placa', m.ac.n + ' por placa', '<div class="dib">' + dibujo({ piedra: qc.piedra, w: PLACA().w, h: PLACA().h }, { puestas: r.puestas.map(p => Object.assign({}, p, { forma: p.k === 'm' && qc.forma === 'red' ? 'red' : p.forma })), libres: [] }) + '</div>' + (r.extras.length ? '<p class="nota">Con lo que sobra salen además: ' + esc(P.agrupar(r.extras).map(([x, n]) => n + '× ' + x.nom + ' ' + (x.forma === 'red' ? 'Ø' + x.w : x.w + '×' + x.h)).join(' · ')) + (r.paquete && r.paquete.reco ? '. Ofrécelas en paquete por ' + pesos(r.paquete.reco.p) + ' (−' + Math.round(r.paquete.reco.d * 100) + '%).' : '.') + '</p>' : ''))
        + (r.parecidas.length ? X.plegable('Medidas parecidas más baratas', r.parecidas.length + '', '<ul class="fondos">' + r.parecidas.map(x => '<li><span>' + (x.forma === 'red' ? 'Ø' + x.w : x.w + '×' + x.h) + ' cm</span><b>' + pesos(x.precio) + '</b></li>').join('') + '</ul>') : '')
        + '<div class="botones"><button class="b negro" id="qc-cli">＋ A la cotización del cliente</button><button class="b" id="qc-ped">Pasar a pedido</button></div>';
      if ($('#qc-cut')) $('#qc-cut').onclick = () => cortar(cs.s, { reqs: r.req });
      $('#qc-cli').onclick = () => { const b = borrador(); b.items.push(itemDe(qc, r)); guardarBorrador(b); location.hash = '#piedras/cliente'; X.aviso('Agregada a la cotización'); };
      $('#qc-ped').onclick = () => aPedido([itemDe(qc, r)], {}, r.total);
    }
    const itemDe = (q, r) => ({ uso: q.uso, forma: q.forma, w: num(q.w), h: q.forma === 'red' ? num(q.w) : num(q.h), alto: r.alto, piedra: limpiaP(q.piedra), base: '', cant: r.cant, precio: r.m.precio, auto: r.m.precio, desc: descDe(q.uso, q.forma, num(q.w), q.forma === 'red' ? num(q.w) : num(q.h), r.alto, limpiaP(q.piedra), '') });
    const descDe = (uso, forma, w, h, alto, piedra, base) => 'Mesa ' + ({ comedor: 'de comedor', centro: 'de centro', lateral: 'lateral', periquera: 'periquera', consola: 'consola', escritorio: 'escritorio' }[uso] || '') + ' ' + nomForma(forma) + ' ' + (forma === 'red' ? 'Ø ' + w + ' cm' : w + ' × ' + h + ' cm') + (alto ? ', ' + alto + ' cm de alto' : '') + '. Cubierta de piedra sinterizada 12 mm' + (piedra ? ' ' + piedra.trim() : '') + (base ? '. Base: ' + base : '') + '.';

    // ================= COTIZACIÓN AL CLIENTE (PDF) =================
    const vacia = () => ({ cliente: '', tel: '', clienteId: '', items: [], entrega: '', entregaAuto: true, descuento: '', vigencia: 15, tiempo: '7 a 10 días hábiles después del anticipo', notas: '', fecha: hoy() });
    const borrador = () => { try { return Object.assign(vacia(), JSON.parse(localStorage.getItem('dkas-pz-cot')) || {}); } catch (e) { return vacia(); } };
    const guardarBorrador = b => { try { localStorage.setItem('dkas-pz-cot', JSON.stringify(b)); } catch (e) {} };
    const cotis = () => Object.entries(X.D().cotizaciones || {}).map(([id, x]) => Object.assign({ id }, x, { items: arr(x.items) })).sort((a, b) => (b.creado || 0) - (a.creado || 0));
    function cotisGuardadas() {
      const l = cotis(); if (!l.length) return '';
      return X.plegable('Cotizaciones guardadas', l.length + '', '<div class="lista">' + l.slice(0, 40).map(c => '<a class="fila-a" href="#piedras/cliente=' + esc(c.id) + '" data-cot="' + esc(c.id) + '"><span class="fila-c"><b>' + esc(c.cliente || 'Sin nombre') + ' <span class="folio">C-' + esc(c.folio) + '</span></b><small>' + esc(fC(c.fecha)) + ' · ' + (c.items || []).length + ' mesa(s)</small></span><span class="fila-d"><b>' + pesos(c.total) + '</b></span></a>').join('') + '</div>', false);
    }
    function entregaAuto(b) {
      const ms = b.items.map(it => { try { return P.calcular({ uso: it.uso, forma: it.forma, w: num(it.w), h: num(it.h) }); } catch (e) { return null; } }).filter(Boolean);
      return ms.some(m => !m.chico) ? (ms.some(m => !m.minivan) ? P.C.flete : P.C.minivanComedor) : 0;
    }
    const totales = b => { const sub = b.items.reduce((a, it) => a + num(it.precio) * Math.max(1, num(it.cant) || 1), 0), ent = b.entregaAuto ? entregaAuto(b) : num(b.entrega), des = num(b.descuento), tot = Math.max(0, sub - des + ent); return { sub, ent, des, tot, ant: Math.round(tot / 2) }; };
    // ===== IMAGEN DE LA PLACA (para ver y mandar por WhatsApp): textura real, cliente y medida en cada pieza, lo que sobra =====
    const carga = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    const limpiaN = n => String(n || '').replace(/ #\d+$/, '').trim();
    async function lienzoPlaca(op) {
      const k = 4, ox = 74, oy = 150, W = op.w * k, H = op.h * k, cv = document.createElement('canvas'), c = cv.getContext('2d'), F = '"Segoe UI",-apple-system,system-ui,Arial,sans-serif';
      cv.width = Math.max(W + 150, 900); cv.height = H + 300;
      c.fillStyle = '#f2f2f7'; c.fillRect(0, 0, cv.width, cv.height); c.textBaseline = 'middle';
      const [bg, , cid] = tono(op.piedra), tex = cid ? await carga('img/piedras/' + cid + '.jpg') : null, logo = await carga('img/dkas-oscuro.png');
      let tx0 = ox; if (logo) { const lw = 44 * logo.width / logo.height; c.drawImage(logo, ox, 30, lw, 44); tx0 = ox + lw + 24; }
      const ajusta = (t, max, peso, tam) => { let s = tam; c.font = peso + ' ' + s + 'px ' + F; while (s > 11 && c.measureText(t).width > max) { s--; c.font = peso + ' ' + s + 'px ' + F; } return s; };
      c.fillStyle = '#111'; ajusta(op.titulo, cv.width - tx0 - 30, 800, 36); c.textAlign = 'left'; c.fillText(op.titulo, tx0, 52);
      c.fillStyle = '#555'; ajusta(op.sub, cv.width - tx0 - 30, 400, 22); c.fillText(op.sub, tx0, 92);
      const rr = (x, y, w, h, r0) => { c.beginPath(); c.moveTo(x + r0, y); c.arcTo(x + w, y, x + w, y + h, r0); c.arcTo(x + w, y + h, x, y + h, r0); c.arcTo(x, y + h, x, y, r0); c.arcTo(x, y, x + w, y, r0); c.closePath(); };
      // la piedra
      c.save(); rr(ox, oy, W, H, 6); c.clip(); c.fillStyle = bg; c.fillRect(ox, oy, W, H);
      if (tex) { const s = Math.max(W / tex.width, H / tex.height), tw = tex.width * s, th = tex.height * s; c.drawImage(tex, ox + (W - tw) / 2, oy + (H - th) / 2, tw, th); }
      c.restore(); c.lineWidth = 3; c.strokeStyle = '#111'; rr(ox, oy, W, H, 6); c.stroke();
      c.textAlign = 'center';
      // lo que sobra (verde)
      (op.r.libres || []).filter(l => l.w >= CFG.minSob && l.h >= CFG.minSob).forEach(l => { const x = ox + l.x * k, y = oy + l.y * k, w = l.w * k, h = l.h * k;
        c.fillStyle = 'rgba(52,199,89,.30)'; c.fillRect(x, y, w, h); c.setLineDash([10, 7]); c.lineWidth = 2.5; c.strokeStyle = '#4cd27c'; c.strokeRect(x, y, w, h); c.setLineDash([]);
        if (w > 90 && h > 60) { c.fillStyle = '#fff'; ajusta('SOBRA', w - 10, 800, 24); c.fillText('SOBRA', x + w / 2, y + h / 2 - 15); ajusta(Math.floor(l.w) + ' × ' + Math.floor(l.h) + ' cm', w - 10, 700, 26); c.fillText(Math.floor(l.w) + ' × ' + Math.floor(l.h) + ' cm', x + w / 2, y + h / 2 + 15); } });
      // las piezas con su cliente y medida
      op.r.puestas.forEach(p => { const x = ox + p.x * k, y = oy + p.y * k, w = p.w * k, h = p.h * k, cx = x + w / 2, cy = y + h / 2;
        if (p.forma === 'red') { c.setLineDash([6, 5]); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.4)'; c.strokeRect(x, y, w, h); c.setLineDash([]); c.beginPath(); c.arc(cx, cy, w / 2, 0, Math.PI * 2); }
        else { c.beginPath(); c.rect(x, y, w, h); }
        c.fillStyle = 'rgba(255,255,255,.94)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#111'; c.stroke();
        const nom = op.nombre(p), med = p.forma === 'red' ? 'Ø ' + r1(p.w) + ' cm' : r1(p.w) + ' × ' + r1(p.h) + ' cm', ancho = (p.forma === 'red' ? w * 0.78 : w) - 12;
        const t1 = ajusta(nom, ancho, 800, Math.min(32, h / 4)); c.fillStyle = '#111'; c.fillText(nom, cx, cy - t1 * 0.55);
        const t2 = ajusta(med, ancho, 600, Math.min(25, h / 5)); c.fillStyle = '#333'; c.fillText(med, cx, cy + t2 * 0.85); });
      // medidas de la placa
      const flecha = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = 2; c.strokeStyle = '#111'; c.stroke(); [[x1, y1, x2, y2], [x2, y2, x1, y1]].forEach(([a, b2, d, e]) => { const ang = Math.atan2(b2 - e, a - d); c.beginPath(); c.moveTo(a, b2); c.lineTo(a - 12 * Math.cos(ang - 0.4), b2 - 12 * Math.sin(ang - 0.4)); c.lineTo(a - 12 * Math.cos(ang + 0.4), b2 - 12 * Math.sin(ang + 0.4)); c.closePath(); c.fillStyle = '#111'; c.fill(); }); };
      flecha(ox, oy - 22, ox + W, oy - 22); c.fillStyle = '#f2f2f7'; c.fillRect(ox + W / 2 - 62, oy - 38, 124, 32); c.fillStyle = '#111'; c.font = '700 24px ' + F; c.fillText(r1(op.w) + ' cm', ox + W / 2, oy - 22);
      flecha(ox - 26, oy, ox - 26, oy + H); c.save(); c.translate(ox - 26, oy + H / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#f2f2f7'; c.fillRect(-62, -16, 124, 32); c.fillStyle = '#111'; c.fillText(r1(op.h) + ' cm', 0, 0); c.restore();
      // leyenda
      c.textAlign = 'left'; c.fillStyle = '#333'; const ley = op.r.puestas.map(p => op.nombre(p) + ' ' + (p.forma === 'red' ? 'Ø ' + r1(p.w) : r1(p.w) + '×' + r1(p.h))).join('   ·   ');
      ajusta(ley, cv.width - ox - 30, 400, 21); c.fillText(ley, ox, oy + H + 48);
      const sob = (op.r.sobrantes || []).map(s => Math.floor(s.w) + ' × ' + Math.floor(s.h) + ' cm');
      const ley2 = 'Se usa el ' + op.r.pct + '% · ' + (sob.length ? 'verde = lo que sobra y se queda en tus piedras: ' + sob.join(' y ') : 'no sobra nada que sirva') + ' · disco 0.5 cm por corte' + (op.r.esp && op.r.esp.tipo === 'placa' ? ', 1 cm de orilla por lado' : '');
      ajusta(ley2, cv.width - ox - 30, 400, 20); c.fillText(ley2, ox, oy + H + 86);
      return cv;
    }
    // planes = [{ piedra, w, h, r, titulo }] → hoja con la(s) imagen(es) y botón para mandarla(s)
    async function verPlaca(planes, nombre) {
      X.aviso('Dibujando la placa…');
      const cvs = []; for (const pl of planes) cvs.push(await lienzoPlaca({ piedra: pl.piedra, w: pl.w, h: pl.h, r: pl.r, titulo: pl.titulo, sub: pl.sub, nombre }));
      X.hoja('Así queda la placa', cvs.map((cv, i) => '<img class="vp-img" src="' + cv.toDataURL('image/jpeg', 0.9) + '" alt="Placa ' + (i + 1) + '">').join('') + cvs.map((cv, i) => '<button class="b verde grande" data-vp="' + i + '">📤 Mandar ' + (cvs.length > 1 ? 'placa ' + (i + 1) : 'imagen') + ' (WhatsApp)</button>').join(''), h => {
        $$('[data-vp]', h).forEach(b => b.onclick = () => { const i = +b.dataset.vp; cvs[i].toBlob(bl => X.bajar(bl, 'Placa ' + (planes[i].piedra || '') + (cvs.length > 1 ? ' ' + (i + 1) : '') + '.png'), 'image/png'); });
      });
    }
    const subPlan = (r, piedra) => (r.puestas.length) + (r.puestas.length === 1 ? ' pieza' : ' piezas') + ' · se usa el ' + r.pct + '%' + (r.sobrantes.length ? ' · sobra ' + r.sobrantes.map(s => Math.floor(s.w) + '×' + Math.floor(s.h)).join(' y ') : '');
    // de "Lo que hay que hacer" / aviso del pedido: la compra c (alertas)
    function verCompra(c) { verPlaca(c.placas.map((r, i) => ({ piedra: c.nombre, w: PLACA().w, h: PLACA().h, r, titulo: 'Placa ' + c.nombre + ' · ' + PLACA().w + ' × ' + PLACA().h + ' cm' + (c.placas.length > 1 ? ' (' + (i + 1) + ' de ' + c.placas.length + ')' : ''), sub: subPlan(r) })), p => limpiaN(p.nombre) || 'Pieza'); }
    // ===== APROVECHAR PLACAS: la cotización completa, junta por color =====
    // por cada color: ¿sale del stock? (piedra ya pagada → $0) · si no, cuántas placas nuevas para TODAS las mesas de ese color,
    // junto con otros pedidos que esperan esa piedra (se reparte), y lo que sobra cuenta como valor (se queda en stock, al 50%)
    function analizarCot(its, AL, cli) {
      AL = AL || alertas(); const area = PLACA().w * PLACA().h, precioP = P.C.placa.precio, G = [];
      its.forEach((it, i) => { const col = limpiaP(it.piedra); let g = G.find(x => col ? x.color && mismoColor(x.color, col) : !x.color); if (!g) G.push(g = { color: col, idx: [] }); g.idx.push(i); });
      const pzU = new Array(its.length).fill(null);
      G.forEach(g => {
        if (!g.color) { g.sin = true; return; }
        g.nombre = (catDe(g.color) || [])[1] || (/negr/.test(sinAc(g.color)) ? 'Negra' : g.color);
        const ped = g.idx.map(i => { const it = its[i], red = it.forma === 'red'; return { pieza: { nombre: cli || 'Mesa nueva', forma: red ? 'red' : 'rect', d: num(it.w), w: num(it.w), h: red ? num(it.w) : num(it.h) }, cant: Math.max(1, num(it.cant) || 1) }; });
        const st = disponibles().filter(s => mismoColor(s.piedra, g.color)), inv = { placas: st.filter(s => s.tipo === 'placa').map(s => ({ id: s.id, w: num(s.w), h: num(s.h), cant: 1 })), retazos: st.filter(s => s.tipo !== 'placa').map(s => ({ id: s.id, w: num(s.w), h: num(s.h) })) };
        let r; try { r = K.meCabe(ped, inv, CFG, PLACA()); } catch (e) { r = { estado: 'error', msg: e.message }; }
        if (r.estado === 'error') { g.error = r.msg; return; }
        const aQ = g.idx.reduce((a, i) => a + huellaIt(its[i]) * Math.max(1, num(its[i].cant) || 1), 0);
        g.planes = r.espacios; if (r.estado !== 'falta') { g.stock = true; g.costo = 0; g.de = r.espacios.map(e => pieza(e.esp.id)).filter(Boolean); }
        else {
          const nuevas = r.espacios.filter(e => e.esp.nueva); g.placas = r.placasFaltan; g.deStock = r.espacios.filter(e => !e.esp.nueva).map(e => pieza(e.esp.id)).filter(Boolean);
          g.usa = Math.round(nuevas.reduce((a, e) => a + e.pct, 0) / Math.max(1, nuevas.length));
          const sob = [].concat(...nuevas.map(e => e.sobrantes)).filter(x => Math.min(x.w, x.h) >= 40); g.sobra = sob.sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
          const credito = sob.reduce((a, x) => a + x.w * x.h, 0) / area * precioP * 0.5;
          g.costo = Math.max(0, g.placas * precioP - credito);
          // ¿otros pedidos esperan esa piedra? si caben en las mismas placas, se reparte
          const comp = AL.compras.find(c => mismoColor(c.color, g.color));
          if (comp) { const otros = [].concat(...comp.l.map(f => f.g.reqs.map(q => ({ pieza: { nombre: X.M().nomPedido(f.p), forma: q.forma, d: q.d, w: q.w, h: q.h }, cant: q.cant || 1 }))));
            let r2; try { r2 = K.meCabe(ped.concat(otros), inv, CFG, PLACA()); } catch (e) { r2 = null; }
            if (r2 && r2.estado === 'falta' && r2.placasFaltan === g.placas) { const aO = comp.l.reduce((a, f) => a + f.g.reqs.reduce((b2, q) => b2 + (q.forma === 'red' ? q.d * q.d : q.w * q.h) * (q.cant || 1), 0), 0); g.junta = comp.l.map(f => X.M().nomPedido(f.p).replace(/ #\d+$/, '') + ' ' + f.g.t.replace(/^Mesa (de )?/i, '')); g.costo = g.costo * aQ / (aQ + aO); g.planes = r2.espacios; } }
        }
        g.idx.forEach(i => { pzU[i] = g.costo * huellaIt(its[i]) / aQ; });
      });
      let total = 0;
      its.forEach((it, i) => { let m; try { m = P.calcular({ uso: it.uso || 'centro', forma: it.forma || 'rect', w: num(it.w), h: it.forma === 'red' ? num(it.w) : num(it.h) }); } catch (e) { m = null; }
        if (!m || !(num(it.w) > 0)) return; const ns = m.costo - m.piedra, pz = pzU[i] == null ? m.piedra : pzU[i];
        it.normal = m.precio; it.auto = P.up100((ns + pz) * P.C.margen); if (!it.manual) it.precio = it.auto; total += it.auto * Math.max(1, num(it.cant) || 1); });
      return { G, total };
    }
    const huellaIt = it => it.forma === 'red' ? num(it.w) * num(it.w) : num(it.w) * num(it.h);
    // consejo: ¿y si todas fueran de un solo color? (uno que ya tengas o que comparta placa)
    function mejorColor(its, actual, AL) {
      if (its.length < 2) return null;
      const cands = [...new Set(disponibles().map(s => s.piedra).concat(its.map(it => limpiaP(it.piedra))).filter(Boolean))];
      let mejor = null;
      cands.forEach(c => { const cl = JSON.parse(JSON.stringify(its)).map(it => Object.assign(it, { piedra: c, manual: false })); const t = analizarCot(cl, AL).total; if (!mejor || t < mejor.t) mejor = { c, t }; });
      return mejor && mejor.t < actual - 300 ? { color: mejor.c, total: mejor.t, ahorro: actual - mejor.t } : null;
    }
    function panelPiedraCot(b, AN, sug) {
      if (!b.items.length) return '';
      const nuevosColores = AN.G.filter(g => g.placas).length;
      const filas = AN.G.map(g => {
        const n = g.idx.reduce((a, i) => a + Math.max(1, num(b.items[i].cant) || 1), 0), cual = g.idx.map(i => '#' + (i + 1)).join(', ');
        if (g.sin) return '<li class="mala"><i>!</i><span><b>Mesas ' + cual + ': elige la piedra</b><small>Sin color no puedo revisar tu stock. Toca la mesa → piedra.</small></span></li>';
        if (g.error) return '<li class="mala"><i>!</i><span><b>' + esc(g.nombre) + '</b><small>' + esc(g.error) + '</small></span>' + verB + '</li>';
        const verB = g.planes && g.planes.length ? '<button class="b chico" data-cplaca="' + AN.G.indexOf(g) + '">🖼 Ver placa</button>' : '';
        if (g.stock) return '<li class="corta"><i>✓</i><span><b>' + esc(g.nombre) + ' · ' + n + (n === 1 ? ' mesa' : ' mesas') + ': sale de tu stock</b><small>De ' + esc(g.de.map(nomPieza).join(' + ')) + '. La piedra ya está pagada: el precio baja.</small></span></li>';
        return '<li class="compra"><i>🛒</i><span><b>' + esc(g.nombre) + ' · ' + n + (n === 1 ? ' mesa' : ' mesas') + ': comprar ' + g.placas + ' placa' + (g.placas > 1 ? 's' : '') + '</b><small>' + (n > 1 ? 'Todas salen de la misma placa' + (g.placas > 1 ? 's' : '') + '. ' : '') + 'Se usa ' + g.usa + '%' + (g.sobra ? '; sobra ' + Math.floor(Math.max(g.sobra.w, g.sobra.h)) + '×' + Math.floor(Math.min(g.sobra.w, g.sobra.h)) + ' que se queda en tu stock' : '') + '. A esta cotización le toca ≈ ' + pesos(g.costo) + ' de piedra.'
          + (g.deStock && g.deStock.length ? ' Parte sale de tu ' + esc(g.deStock.map(nomPieza).join(', ')) + '.' : '') + (g.junta ? '<br>💡 Júntala con ' + esc(g.junta.join(' + ')) + ': esperan esa misma piedra, la placa se reparte y baja el precio.' : '') + '</small></span>' + verB + '</li>';
      }).join('');
      return '<section class="caja hacer' + (AN.G.some(g => g.sin || g.error) ? ' mal' : nuevosColores ? ' pend' : ' ok') + '"><div class="caja-t"><h2>Piedra de esta cotización</h2></div><ul class="hacer-l">' + filas + '</ul>'
        + (nuevosColores > 1 ? '<p class="nota">Son ' + nuevosColores + ' colores distintos: cada uno necesita su propia placa, por eso sube el precio.</p>' : '')
        + (sug ? '<div class="compra"><b>💡 Si todas son ' + esc(sug.color) + ': ' + pesos(sug.total) + ' (ahorras ' + pesos(sug.ahorro) + ')</b><p>Se aprovecha mejor la placa' + (disponibles().some(s => mismoColor(s.piedra, sug.color)) ? ' y ya tienes esa piedra' : '') + '.</p><button class="b chico negro" id="cc-sug">Usar ' + esc(sug.color) + ' en todas</button></div>' : '')
        + '</section>';
    }
    let entregaVista = 0;
    function cliente(id) {
      let b = id ? (() => { const c = cotis().find(x => x.id === id); return c ? Object.assign(vacia(), JSON.parse(JSON.stringify(c)), { entregaAuto: false }) : null; })() : borrador();
      if (b && id) b.items.forEach(it => { it.manual = true; });
      if (!b) { location.hash = '#piedras/cotizar'; return; }
      const guardar = () => { if (!id) guardarBorrador(b); };
      const pintar = () => {
        const AL = alertas(), AN = analizarCot(b.items, AL, b.cliente), sug = mejorColor(b.items, AN.total, AL); guardar();
        const T = totales(b), clientes = X.M().clientes; entregaVista = T.ent;
        X.main().innerHTML = '<a class="volver" href="#piedras/cotizar">‹ Cotizar</a>' + X.tit('Cotizar al cliente', id ? 'Cotización C-' + esc(b.folio) + ' · ' + esc(fC(b.fecha)) : 'Llena, revisa y manda el PDF', '')
          + '<section class="caja"><h2>1 · Cliente</h2><div class="dos-i"><label class="campo">Nombre<input id="cc-n" maxlength="80" value="' + esc(b.cliente) + '" placeholder="ej. David Shamy"></label><label class="campo">WhatsApp<input id="cc-t" inputmode="tel" maxlength="20" value="' + esc(b.tel) + '" placeholder="55 1234 5678"></label></div>'
            + (clientes.length ? '<details class="plegable"><summary><span>Elegir un cliente que ya tenemos</span></summary><div class="pl-c"><div class="chips" id="cc-cl">' + clientes.map(c => '<button type="button" data-v="' + esc(c.id) + '">' + esc(c.nombre) + '</button>').join('') + '</div></div></details>' : '') + '</section>'
          + '<section class="caja"><div class="caja-t"><h2>2 · Mesas</h2><span class="sub" id="cc-suma">' + piezasTxt(b) + '</span></div>'
            + (b.items.length ? '<ol class="cot-items">' + b.items.map((it, i) => '<li><div class="ci-t"><b>' + (i + 1) + '</b><textarea data-i="' + i + '" data-f="desc" maxlength="300">' + esc(it.desc) + '</textarea><button type="button" class="x" data-del="' + i + '" aria-label="Quitar">✕</button></div>'
              + '<div class="dos-i"><label class="campo">Cuántas<input data-i="' + i + '" data-f="cant" inputmode="numeric" value="' + esc(it.cant) + '"></label><label class="campo">Precio c/u<input data-i="' + i + '" data-f="precio" inputmode="decimal" value="' + esc(it.precio) + '"></label></div>'
              + '<div class="ci-sub"><span data-sub="' + i + '">' + subTxt(it) + '</span><button type="button" class="b chico" data-dup="' + i + '">⧉ Duplicar</button></div>'
              + (num(it.auto) && num(it.auto) !== num(it.precio) ? '<button type="button" class="sug" data-auto="' + i + '">El sistema sugiere ' + pesos(it.auto) + (num(it.normal) && num(it.normal) !== num(it.auto) ? ' (normal ' + pesos(it.normal) + ')' : '') + ' · usar</button>' : '') + '</li>').join('') + '</ol>' : X.vacioTxt('Agrega las mesas que quiere el cliente.'))
            + '<button class="b negro grande" id="cc-add">＋ Agregar mesas</button><p class="nota">Puedes meter varias seguidas: en la hoja toca “＋ Agregar y meter otra”.</p></section>'
          + panelPiedraCot(b, AN, sug)
          + '<section class="caja"><h2>3 · Entrega, descuento y condiciones</h2><div class="dos-i"><label class="campo">Entrega e instalación' + (b.entregaAuto ? ' <small>(automática)</small>' : '') + '<input id="cc-e" inputmode="decimal" value="' + esc(b.entregaAuto ? T.ent : b.entrega) + '"></label><label class="campo">Descuento ($)<input id="cc-d" inputmode="decimal" placeholder="$0" value="' + esc(b.descuento) + '"></label></div>'
            + '<div class="dos-i"><label class="campo">Tiempo de entrega<input id="cc-ti" maxlength="80" value="' + esc(b.tiempo) + '"></label><label class="campo">Vigencia (días)<input id="cc-v" inputmode="numeric" value="' + esc(b.vigencia) + '"></label></div>'
            + '<label class="campo">Notas para el cliente (opcional)<textarea id="cc-no" maxlength="400" placeholder="ej. Incluye instalación en CDMX">' + esc(b.notas) + '</textarea></label></section>'
          + '<section class="caja precio-g"><small>Total</small><b>' + pesos(T.tot) + '</b><p>Mesas ' + pesos(T.sub) + (T.des ? ' − descuento ' + pesos(T.des) : '') + (T.ent ? ' + entrega ' + pesos(T.ent) : ' · entrega incluida') + '</p><p>Anticipo 50%: <b>' + pesos(T.ant) + '</b> · saldo contra entrega ' + pesos(T.tot - T.ant) + '</p></section>'
          + '<div class="botones col"><button class="b verde grande" id="cc-pdf"' + (b.items.length && b.cliente ? '' : ' disabled') + '>📄 PDF para el cliente</button><button class="b negro grande" id="cc-g"' + (b.items.length && b.cliente ? '' : ' disabled') + '>' + (id ? 'Guardar cambios' : 'Guardar cotización') + '</button>' + (b.tel ? '<button class="b grande" id="cc-wa">Mandar mensaje por WhatsApp</button>' : '') + (b.items.length ? '<button class="b grande" id="cc-ped">Pasar a pedido</button>' : '') + (id ? '' : '<button class="b" id="cc-nueva">Empezar una nueva</button>') + (id ? '<button class="b rojo" id="cc-b">Borrar cotización</button>' : '') + '</div>'
          + (!b.cliente || !b.items.length ? '<p class="nota">Para sacar el PDF: pon el nombre del cliente y al menos una mesa.</p>' : '');
        const leer = () => { b.cliente = $('#cc-n').value.trim(); b.tel = $('#cc-t').value.trim(); b.descuento = $('#cc-d').value.replace(/[^\d.]/g, ''); b.tiempo = $('#cc-ti').value; b.vigencia = Math.max(1, Math.floor(num($('#cc-v').value) || 15)); b.notas = $('#cc-no').value; $$('[data-i]').forEach(x => { const it = b.items[+x.dataset.i]; if (!it) return; const v = x.dataset.f === 'desc' ? x.value : x.value.replace(/[^\d.]/g, ''); if (x.dataset.f === 'precio' && num(v) !== num(it.precio)) it.manual = true; it[x.dataset.f] = v; }); const e = $('#cc-e').value.replace(/[^\d.]/g, ''); if (!b.entregaAuto || num(e) !== entregaVista) { b.entregaAuto = false; b.entrega = e; } guardar(); };
        const vivo = () => { leer(); const T2 = totales(b), pg = $('.precio-g'); if (pg) { pg.querySelector('b').textContent = pesos(T2.tot); pg.querySelectorAll('p')[0].textContent = 'Mesas ' + pesos(T2.sub) + (T2.des ? ' − descuento ' + pesos(T2.des) : '') + (T2.ent ? ' + entrega ' + pesos(T2.ent) : ' · entrega incluida'); pg.querySelectorAll('p')[1].innerHTML = 'Anticipo 50%: <b>' + pesos(T2.ant) + '</b> · saldo contra entrega ' + pesos(T2.tot - T2.ant); } $$('[data-sub]').forEach(x => { const it = b.items[+x.dataset.sub]; if (it) x.textContent = subTxt(it); }); if ($('#cc-suma')) $('#cc-suma').textContent = piezasTxt(b); const ok = b.items.length && b.cliente; ['#cc-pdf', '#cc-g'].forEach(s => { if ($(s)) $(s).disabled = !ok; }); };
        $$('#app input, #app textarea').forEach(i => i.addEventListener('input', vivo));
        $$('#cc-cl [data-v]').forEach(x => x.onclick = () => { leer(); const c = X.M().cli(x.dataset.v); b.cliente = c.nombre; b.tel = c.telefono || b.tel; b.clienteId = c.id; guardar(); pintar(); });
        $$('[data-del]').forEach(x => x.onclick = () => { leer(); b.items.splice(+x.dataset.del, 1); guardar(); pintar(); });
        $$('[data-f="cant"]').forEach(x => x.addEventListener('change', () => { leer(); pintar(); }));
        $$('[data-cplaca]').forEach(x => x.onclick = () => { const g = AN.G[+x.dataset.cplaca]; verPlaca(g.planes.map((e, i) => { const sp = e.esp.id ? pieza(e.esp.id) : null; return { piedra: g.nombre, w: e.esp.w, h: e.esp.h, r: e, titulo: (sp ? 'Tu ' + nomPieza(sp) : 'Placa nueva ' + g.nombre + ' · ' + e.esp.w + ' × ' + e.esp.h + ' cm') + (g.planes.length > 1 ? ' (' + (i + 1) + ' de ' + g.planes.length + ')' : ''), sub: subPlan(e) }; }), p => limpiaN(p.nombre) || 'Mesa nueva'); });
        if ($('#cc-sug')) $('#cc-sug').onclick = () => { leer(); b.items.forEach(it => { it.piedra = sug.color; it.manual = false; if (it.uso) it.desc = descDe(it.uso, it.forma, num(it.w), num(it.h), num(it.alto), sug.color, it.base || ''); }); guardar(); pintar(); X.aviso('Todas en ' + sug.color + ': precios recalculados'); };
        $$('[data-auto]').forEach(x => x.onclick = () => { leer(); const it = b.items[+x.dataset.auto]; it.manual = false; it.precio = it.auto; guardar(); pintar(); });
        $$('[data-dup]').forEach(x => x.onclick = () => { leer(); const i = +x.dataset.dup; b.items.splice(i + 1, 0, JSON.parse(JSON.stringify(b.items[i]))); guardar(); pintar(); X.aviso('Mesa duplicada: cámbiale lo que necesites'); });
        $('#cc-add').onclick = () => { leer(); mesaNueva(it => { b.items.push(it); guardar(); pintar(); }, () => ({ n: b.items.length, t: piezasTxt(b) })); };
        $('#cc-pdf').onclick = () => { leer(); pdfCliente(b); };
        $('#cc-g').onclick = async () => {
          leer(); const T2 = totales(b);
          if (!await X.clave(id ? 'Guardar cambios de la cotización' : 'Guardar cotización', [['Cliente', b.cliente], ['Mesas', String(b.items.length)], ['Total', pesos(T2.tot)]])) return;
          const folio = b.folio || cotis().reduce((m, c) => Math.max(m, num(c.folio)), 0) + 1;
          const x = { folio, fecha: b.fecha || hoy(), cliente: b.cliente.slice(0, 80), tel: b.tel || null, clienteId: b.clienteId || null, items: b.items.map(it => ({ desc: String(it.desc || '').slice(0, 300), cant: Math.max(1, num(it.cant) || 1), precio: num(it.precio), auto: num(it.auto) || null, uso: it.uso || null, forma: it.forma || null, w: num(it.w) || null, h: num(it.h) || null, alto: num(it.alto) || null, piedra: it.piedra || null, base: it.base || null })), entrega: T2.ent, descuento: T2.des || null, vigencia: b.vigencia, tiempo: b.tiempo || null, notas: b.notas || null, total: T2.tot };
          let nuevo = id;
          await X.guardarYa(async () => { if (id) await A.nodoCambia('dinero/cotizaciones/' + id, x); else nuevo = await A.nodoAgrega('dinero/cotizaciones', x); }, 'Cotización C-' + folio + ' guardada', 'Cotización C-' + folio + ' · ' + b.cliente + ' · ' + pesos(T2.tot));
          if (!id) { try { localStorage.removeItem('dkas-pz-cot'); } catch (e) {} if (nuevo) location.hash = '#piedras/cliente=' + nuevo; }
        };
        if ($('#cc-wa')) $('#cc-wa').onclick = () => { leer(); const T2 = totales(b), tel = b.tel.replace(/\D/g, ''), n = tel.length === 10 ? '52' + tel : tel;
          const txt = 'Hola ' + b.cliente.split(' ')[0] + ', te comparto tu cotización de DKAS:\n\n' + b.items.map((it, i) => (i + 1) + '. ' + it.desc + (num(it.cant) > 1 ? ' (' + num(it.cant) + ' piezas)' : '') + ' — ' + pesos(num(it.precio) * Math.max(1, num(it.cant) || 1))).join('\n') + (T2.des ? '\nDescuento: −' + pesos(T2.des) : '') + (T2.ent ? '\nEntrega e instalación: ' + pesos(T2.ent) : '') + '\n\nTotal: ' + pesos(T2.tot) + '\nAnticipo para iniciar (50%): ' + pesos(T2.ant) + '\nTiempo de entrega: ' + b.tiempo + '\n\nTe mando también el PDF. ¡Cualquier duda aquí estoy!';
          open('https://wa.me/' + n + '?text=' + encodeURIComponent(txt), '_blank'); };
        if ($('#cc-ped')) $('#cc-ped').onclick = () => { leer(); aPedido(b.items, { nombre: b.cliente, telefono: b.tel, id: b.clienteId }, totales(b).tot, b.folio); };
        if ($('#cc-nueva')) $('#cc-nueva').onclick = () => { if (b.items.length && !confirmar()) return; b = vacia(); guardar(); pintar(); };
        if ($('#cc-b')) $('#cc-b').onclick = async () => { if (!await X.clave('Borrar cotización', [['Cotización', 'C-' + b.folio + ' · ' + b.cliente]])) return; await X.guardarYa(() => A.nodoBorra('dinero/cotizaciones/' + id), 'Cotización borrada', 'Borró cotización C-' + b.folio); location.hash = '#piedras/cotizar'; };
      };
      const confirmar = () => { const e = $('#cc-nueva'); if (e.dataset.seguro) return true; e.dataset.seguro = '1'; e.textContent = 'Toca otra vez para borrar esta y empezar otra'; return false; };
      pintar();
    }
    // una mesa para la cotización del cliente (con el calculador)
    const subTxt = it => { const n = Math.max(1, num(it.cant) || 1); return n + ' × ' + pesos(num(it.precio)) + ' = ' + pesos(n * num(it.precio)); };
    const piezasTxt = b => { const n = b.items.reduce((a, it) => a + Math.max(1, num(it.cant) || 1), 0); return n + (n === 1 ? ' mesa' : ' mesas') + ' · ' + pesos(b.items.reduce((a, it) => a + Math.max(1, num(it.cant) || 1) * num(it.precio), 0)); };
    function mesaNueva(listo, cuenta) {
      const q = Object.assign({}, qc, { base: '' });
      X.hoja('Agregar mesa', '<div id="mn"></div>', h => {
        const pintar = () => {
          const ok = num(q.w) && (q.forma === 'red' || num(q.h)), r = ok ? calcula(q) : null;
          const c0 = cuenta ? cuenta() : null;
          $('#mn', h).innerHTML = (c0 && c0.n ? '<p class="ok-g">Ya van ' + esc(c0.t) + '</p>' : '') + '<div class="campo">¿Qué mesa?' + chipsH('uso', USOS, q.uso) + '</div><div class="campo">Forma' + chipsH('forma', FORMAS, q.forma) + '</div>'
            + '<div class="campo">Medidas (cm)<div class="tres-i"><input data-k="w" inputmode="decimal" placeholder="' + (q.forma === 'red' ? 'Diámetro' : 'Largo') + '" value="' + esc(q.w) + '">' + (q.forma === 'red' ? '' : '<input data-k="h" inputmode="decimal" placeholder="Ancho" value="' + esc(q.h) + '">') + '<input data-k="alto" inputmode="decimal" placeholder="Alto (' + (P.ALTO[q.uso] || 75) + ')" value="' + esc(q.alto) + '"><input data-k="cant" inputmode="numeric" placeholder="Cuántas" value="' + esc(q.cant) + '"></div></div>' + (comunes(q.uso, q.forma).length ? '<div class="campo">Medidas que más se venden (toca una)' + comunesH(comunes(q.uso, q.forma), 'data-mmed') + '</div>' : '')
            + '<div class="campo">¿De qué piedra? <small class="nota">(para revisar tu stock)</small>' + chipsPiedra('piedra', q.piedra, { conOtra: true }) + (otraAbierta(q.piedra) ? '<input data-k="piedra" maxlength="40" placeholder="Nombre de la piedra" value="' + esc(limpiaP(q.piedra)) + '">' : '') + '</div>'
            + '<label class="campo">Base (opcional)<input data-k="base" maxlength="60" placeholder="ej. estructura oro mate" value="' + esc(q.base) + '"></label>'
            + (r ? (r.error ? '<p class="aviso r">' + esc(r.error) + '</p>' : '<div class="vivo"><div>Precio c/u<b>' + pesos(r.m.precio) + '</b></div><div>Costo<b>' + pesos(r.conStock ? r.m.costo - r.m.piedra : r.m.costo) + '</b></div><div>' + (r.conStock ? 'Piedra<b class="v">en stock ✓</b>' : 'Piedra<b>hay que comprar</b>') + '</div></div>') : '')
            + (limpiaP(q.piedra) ? '' : '<p class="aviso">Elige de qué piedra es para poder agregarla.</p>') + '<button class="b verde grande" id="mn-otra"' + (r && !r.error && limpiaP(q.piedra) ? '' : ' disabled') + '>＋ Agregar y meter otra</button><button class="b negro grande" id="mn-ok"' + (r && !r.error && limpiaP(q.piedra) ? '' : ' disabled') + '>Agregar y terminar</button>';
          $$('[data-q]', h).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; leerMN(); q[g.dataset.q] = b.dataset.v; pintar(); });
          $$('[data-k]', h).forEach(i => i.onchange = () => { leerMN(); pintar(); });
          $$('[data-mmed]', h).forEach(b => b.onclick = () => { leerMN(); const [a, c] = b.dataset.mmed.split(','); q.w = a; q.h = q.forma === 'red' ? '' : c; pintar(); });
          $$('[data-k]', h).forEach(i => i.oninput = () => { leerMN(); const ok2 = num(q.w) && (q.forma === 'red' || num(q.h)) && limpiaP(q.piedra); $('#mn-ok', h).disabled = !ok2; $('#mn-otra', h).disabled = !ok2; });
          const hacer = () => { leerMN(); const r2 = calcula(q); if (r2.error) { X.aviso(r2.error, true); return null; } const it = itemDe(q, r2); it.base = q.base.trim(); it.desc = descDe(q.uso, q.forma, it.w, it.h, it.alto, it.piedra, it.base); return it; };
          $('#mn-ok', h).onclick = () => { const it = hacer(); if (!it) return; X.cerrarHoja(); listo(it); };
          // se queda abierta: misma mesa, piedra y base; solo cambias la medida
          $('#mn-otra', h).onclick = () => { const it = hacer(); if (!it) return; listo(it); X.aviso('Mesa agregada ✓ · mete la siguiente'); q.w = ''; q.h = ''; q.alto = ''; q.cant = '1'; pintar(); const c = $('.hoja-c'); if (c) c.scrollTop = 0; };
        };
        const leerMN = () => { $$('[data-k]', h).forEach(i => { q[i.dataset.k] = i.dataset.k === 'piedra' ? (i.value.trim() || OTRA) : i.dataset.k === 'base' ? i.value : i.value.replace(/[^\d.,]/g, '').replace(',', '.'); }); };
        pintar();
      });
    }
    // pasar mesas (de la calculadora o de una cotización) al alta de pedido, ya llenas
    function aPedido(its, cli, total, folio) {
      const FM = { rect: 'Rectangular', red: 'Redonda', oval: 'Ovalada', org: 'Irregular' }, TP = { comedor: 'Comedor', centro: 'Centro', lateral: 'Lateral', periquera: 'Periquera', escritorio: 'Escritorio' };
      const a = its[0] || {}, una = its.length === 1 && Math.max(1, num(a.cant)) >= 1, forma = a.forma === 'rect' && num(a.w) === num(a.h) ? 'Cuadrada' : FM[a.forma] || '';
      const piedras = [...new Set(its.map(x => (x.piedra || '').trim()).filter(Boolean))];
      const p0 = { forma, tipo: TP[a.uso] || 'Otra', tipoOtra: TP[a.uso] ? '' : nomUso(a.uso), material: 'Piedra sinterizada', espesor: 12, color: piedras.length ? 'Otra' : '', colorOtra: piedras.join(', '), base: its.some(x => x.base) ? 'Otra' : '', baseOtra: [...new Set(its.map(x => x.base).filter(Boolean))].join(', '),
        precio: Math.round(num(total)) || null, anticipo: num(total) ? Math.round(num(total) / 2) : null, notas: (folio ? 'De la cotización C-' + folio + '. ' : '') + its.map(x => x.desc + (num(x.cant) > 1 ? ' (' + num(x.cant) + ')' : '')).join(' ').slice(0, 280) };
      if (una) Object.assign(p0, { largo: num(a.w), ancho: a.forma === 'red' ? null : num(a.h), altura: num(a.alto) || null, cantidad: Math.max(1, num(a.cant) || 1) });
      else Object.assign(p0, { cantidad: its.reduce((s, x) => s + Math.max(1, num(x.cant) || 1), 0), piezas: [].concat(...its.map(x => Array.from({ length: Math.max(1, num(x.cant) || 1) }, () => ({ n: 'Mesa ' + nomUso(x.uso).toLowerCase(), forma: x.forma === 'red' ? 'red' : 'rect', d: x.forma === 'red' ? num(x.w) : null, w: x.forma === 'red' ? null : num(x.w), h: x.forma === 'red' ? null : num(x.h), a: num(x.alto) || null, piedra: x.piedra || null })))) });
      const c = cli && cli.id ? X.M().cli(cli.id) : null;
      X.alta(p0, c ? c.id : null, c ? null : (cli && cli.nombre ? { nombre: cli.nombre, telefono: cli.telefono || '' } : null));
    }

    // ---------- PDF de la cotización para el cliente ----------
    function pdfCliente(b) {
      return X.ocupado(async () => {
        await X.libPDF(); const { jsPDF } = root.jspdf, doc = new jsPDF({ unit: 'mm', format: 'letter' }), W = 215.9, Hh = 279.4, Mg = 16, T = totales(b), L = await X.imgData('img/dkas-claro.png'), S = X.sinRaros;
        const folio = b.folio || (cotis().reduce((m, c) => Math.max(m, num(c.folio)), 0) + 1), f0 = b.fecha || hoy(), fD = f => f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4), vence = N.mas(f0, num(b.vigencia) || 15);
        const $p = n => N.pesos(n);
        // encabezado
        doc.setFillColor(17, 17, 17); doc.rect(0, 0, W, 38, 'F'); if (L) doc.addImage(L.d, 'PNG', Mg, 9, 20 * L.r, 20);
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('COTIZACIÓN', W - Mg, 18, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(200); doc.text(S('Nº C-' + folio + '   ·   ' + fD(f0) + '   ·   válida hasta el ' + fD(vence)), W - Mg, 26, { align: 'right' });
        doc.setTextColor(17); let y = 52;
        doc.setFontSize(8); doc.setTextColor(120); doc.text('PREPARADA PARA', Mg, y); doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(S(b.cliente), Mg, y + 7);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90); if (b.tel) doc.text(S('WhatsApp ' + b.tel), Mg, y + 13);
        doc.text(doc.splitTextToSize('Gracias por considerar DKAS. Esta es la propuesta para tus mesas de piedra sinterizada hechas a la medida.', 80), W - Mg, y + 2, { align: 'right' });
        y += 22; doc.setTextColor(17);
        // dibujos de las mesas (vista de arriba con medidas)
        const nD = Math.min(b.items.length, 4);
        if (nD) {
          const bw = (W - 2 * Mg) / nD, bh = 34, mx = Math.max(...b.items.slice(0, nD).map(it => Math.max(num(it.w), num(it.h)))) || 1;
          b.items.slice(0, nD).forEach((it, i) => {
            const cx = Mg + bw * i + bw / 2, cy = y + bh / 2 - 2, k = Math.min((bw - 14) / mx, (bh - 12) / mx), ww = num(it.w) * k, hh = (it.forma === 'red' ? num(it.w) : num(it.h)) * k;
            const tc = tono(it.piedra)[0], rgb = [1, 3, 5].map(j => parseInt(tc.slice(j, j + 2), 16));
            doc.setDrawColor(17); doc.setLineWidth(0.5); doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            if (it.forma === 'red') doc.circle(cx, cy, ww / 2, 'FD'); else if (it.forma === 'oval' || it.forma === 'org') doc.ellipse(cx, cy, ww / 2, hh / 2, 'FD'); else doc.rect(cx - ww / 2, cy - hh / 2, ww, hh, 'FD');
            doc.setFontSize(8); doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.text(S((i + 1) + '  ' + (it.forma === 'red' ? 'Ø ' + num(it.w) + ' cm' : num(it.w) + ' × ' + num(it.h) + ' cm')), cx, y + bh + 1, { align: 'center' });
            doc.setFont('helvetica', 'normal'); doc.setTextColor(110); if (num(it.alto)) doc.text(S('alto ' + num(it.alto) + ' cm'), cx, y + bh + 5, { align: 'center' });
          });
          y += bh + 12; doc.setTextColor(17);
        }
        // partidas
        doc.autoTable({ startY: y, margin: { left: Mg, right: Mg }, head: [['#', 'Descripción', 'Cant.', 'Precio unitario', 'Importe']],
          body: b.items.map((it, i) => [String(i + 1), S(it.desc), String(Math.max(1, num(it.cant) || 1)), $p(num(it.precio)), $p(num(it.precio) * Math.max(1, num(it.cant) || 1))]),
          theme: 'plain', styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, textColor: [17, 17, 17], lineColor: [225, 225, 225], lineWidth: { bottom: 0.2 } },
          headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: 'bold', fontSize: 8.5 }, didParseCell: c => { if (c.section === 'head' && c.column.index >= 2) c.cell.styles.halign = c.column.index === 2 ? 'center' : 'right'; }, columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' } } });
        y = doc.lastAutoTable.finalY + 6;
        // totales
        const fila = (t, v, fuerte) => { doc.setFont('helvetica', fuerte ? 'bold' : 'normal'); doc.setFontSize(fuerte ? 13 : 9.5); doc.text(S(t), W - Mg - 42, y, { align: 'right' }); doc.text(S(v), W - Mg, y, { align: 'right' }); y += fuerte ? 8 : 5.5; };
        fila('Subtotal', $p(T.sub)); if (T.des) fila('Descuento', '−' + $p(T.des)); fila('Entrega e instalación', T.ent ? $p(T.ent) : 'Incluida');
        doc.setDrawColor(17); doc.setLineWidth(0.4); doc.line(W - Mg - 80, y - 2, W - Mg, y - 2); y += 3; fila('TOTAL', $p(T.tot), true);
        doc.setFillColor(242, 242, 247); doc.roundedRect(Mg, y - 2, W - 2 * Mg, 14, 2, 2, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(S('Anticipo para iniciar (50%): ' + $p(T.ant)), Mg + 5, y + 6.5); doc.setFont('helvetica', 'normal'); doc.text(S('Saldo contra entrega: ' + $p(T.tot - T.ant)), W - Mg - 5, y + 6.5, { align: 'right' }); y += 22;
        // condiciones
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text('Condiciones', Mg, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(60);
        const cond = ['Precios en pesos mexicanos (MXN).', 'Para iniciar la fabricación se paga el 50% de anticipo; el saldo se paga contra entrega.', 'Tiempo de entrega: ' + (b.tiempo || 'por confirmar') + '.', 'Cubiertas de piedra sinterizada de 12 mm, hechas a la medida. Cada placa tiene sus propias vetas y tonos: pueden variar un poco de las fotos.', 'Esta cotización es válida hasta el ' + fD(vence) + '.'].concat(b.notas ? [b.notas] : []);
        cond.forEach(c => { const l = doc.splitTextToSize(S('•  ' + c), W - 2 * Mg); if (y + l.length * 4.2 > Hh - 22) { doc.addPage(); y = 20; } doc.text(l, Mg, y); y += l.length * 4.2 + 1.2; });
        // pie
        const wa = (root.DKAS_WA || [])[0], pags = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pags; i++) { doc.setPage(i); doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(Mg, Hh - 16, W - Mg, Hh - 16); doc.setFontSize(8.5); doc.setTextColor(90); doc.text(S('DKAS · mesas de piedra a la medida · dkas.mx' + (wa ? ' · WhatsApp ' + wa.label : '')), Mg, Hh - 10); doc.text(S('C-' + folio + (pags > 1 ? ' · ' + i + '/' + pags : '')), W - Mg, Hh - 10, { align: 'right' }); }
        await X.bajar(doc.output('blob'), 'DKAS cotizacion C-' + folio + ' ' + S(b.cliente).replace(/[^\w ]+/g, '') + '.pdf');
      });
    }

    // ================= EN PEDIDOS: ¿tengo piedra para este pedido? =================
    function reqsPedido(p) {
      if ((p.piezas || []).length) return p.piezas.map(x => num(x.w) && num(x.h) ? { forma: 'rect', w: num(x.w), h: num(x.h), cant: 1, nombre: x.n || '' } : { forma: 'red', d: num(x.d), cant: 1, nombre: x.n || '' }).filter(x => num(x.d) || num(x.w));
      const L = num(p.largo), W = num(p.ancho), n = Math.max(1, num(p.cantidad) || 1);
      if (!L) return []; if (p.forma === 'Redonda') return [{ forma: 'red', d: L, cant: n }];
      return W ? [{ forma: 'rect', w: L, h: W, cant: n }] : [];
    }
    const colorPedido = p => ((p.color === 'Otra' || p.color === 'Otro') ? p.colorOtra : p.color) || '';
    // grupos de piedra de un pedido: una mesa = un grupo; varias mesas (piezas) = un grupo por mesa, cada una con su piedra
    function gruposPedido(p) {
      const reqs = reqsPedido(p);
      if ((p.piezas || []).length) return p.piezas.map((x, i) => ({ gi: i, t: (x.n || 'Mesa ' + (i + 1)) + ' ' + (num(x.w) ? num(x.w) + '×' + num(x.h) : 'Ø' + num(x.d)), color: x.piedra || colorPedido(p), reqs: [reqs[i]].filter(Boolean) })).filter(g => g.reqs.length);
      return reqs.length ? [{ gi: 0, t: reqTxt(reqs), color: colorPedido(p), reqs }] : [];
    }
    // ¿este grupo todavía necesita piedra? (no se ha cortado, no se ha comprado, no lo marcaste "ya la tengo", pedido activo sin entregar)
    function estadoGrupo(p, g) {
      const ok = p.piedraOk || {}, multi = (p.piezas || []).length > 0, s = X.M().statsPedido(p);
      if (ok[g.gi]) return { listo: 'Ya la tienes (marcado)' };
      const c = hist().find(x => x.pedido === p.id && x.accion === 'Corte' && (!x.grupos || !multi || arr(x.grupos).includes(g.gi)));
      if (c) return { listo: 'Cortada ' + fC(c.fecha) + ' de ' + (c.piedra || '') };
      if (!multi && s.pasos[2] && s.pasos[2].done) return { listo: 'Placa comprada' };
      return { falta: true };
    }
    const pedidoActivo = p => { if (p.cerrado) return false; const s = X.M().statsPedido(p); return !(s.pasos[5] && s.pasos[5].done); };
    // ALERTAS: cruza cada pedido activo con el stock real; agrupa lo que hay que comprar por piedra y ve qué sale de una placa
    function alertas() {
      const L = [], faltan = [];
      X.M().pedidos.filter(pedidoActivo).forEach(p => gruposPedido(p).forEach(g => {
        const e = estadoGrupo(p, g); if (!e.falta) return;
        const np = X.M().nomPedido(p), col = g.color ? ' ' + g.color.toLowerCase() : '';
        const ap = p.stock && !(p.piezas || []).length ? pieza(p.stock) : null;
        if (ap) {
          if (ap.estado === 'usado') L.push({ n: 'r', p, g, t: np + ': la piedra que apartaste ya se usó', d: nomPieza(ap) + ' se usó en ' + (ap.usadoEn || 'otra cosa') + '. Busca otra o compra placa.' });
          else if (corte(ap, g.reqs).faltan.length) L.push({ n: 'r', p, g, t: np + ': la piedra apartada NO alcanza', d: g.t + ' no cabe en ' + nomPieza(ap) + '. Revisa la medida o compra placa.' });
          else return;
        }
        const l = buscar(g.reqs, g.color).filter(x => x.color);
        if (l.length) { if (!ap) L.push({ n: 'a', p, g, s: l[0].s, t: np + ': sí hay piedra en stock', d: g.t + col + ' sale de ' + nomPieza(l[0].s) + '. Córtala para apartarla.' }); }
        else { faltan.push({ p, g }); if (!ap) L.push({ n: 'r', p, g, t: np + ': no hay piedra que alcance', d: g.t + col + ' no cabe en ninguna piedra del stock. Hay que comprar placa.' }); }
      }));
      // compras: lo que falta, junto por piedra; cuántas placas de 320×160 y qué pedidos salen de cada una
      const C_ = [];
      faltan.forEach(f => { let c = C_.find(c => mismoColor(c.color, f.g.color)); if (!c) C_.push(c = { color: f.g.color, l: [] }); c.l.push(f); });
      C_.forEach(c => {
        let quedan; try { quedan = items([].concat(...c.l.map(f => f.g.reqs.map(r => Object.assign({}, r, { nombre: X.M().nomPedido(f.p) }))))); } catch (e) { quedan = []; }
        c.placas = []; for (let i = 0; i < 8 && quedan.length; i++) { const r = K.cortarEn(quedan, { tipo: 'placa', w: PLACA().w, h: PLACA().h }, CFG); if (!r.puestas.length) break; c.placas.push(r); quedan = r.faltan; }
        c.nombre = (catDe(c.color) || [])[1] || (/negr/.test(sinAc(c.color)) ? 'Negra' : c.color || 'Piedra');
        const ult = c.placas[c.placas.length - 1]; c.usado = ult ? Math.round(c.placas.reduce((a, r) => a + r.pct, 0) / c.placas.length) : 0;
        const sob = ult ? ult.sobrantes.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] : null; c.sobra = sob ? { w: Math.floor(Math.max(sob.w, sob.h)), h: Math.floor(Math.min(sob.w, sob.h)) } : null;
        c.saleSobra = c.sobra ? alcanza(Object.assign({ tipo: 'sobrante' }, c.sobra)).sort((a, b) => b.a - a.a).slice(0, 3) : [];
        c.pedidos = [...new Set(c.l.map(f => f.p.id))]; c.costoC = Math.round(P.C.placa.precio * c.placas.length / c.pedidos.length);
      });
      return { L, compras: C_.filter(c => c.placas.length) };
    }
    // "Lo que hay que hacer": cada pedido en una línea con UN botón (cortar · ya la compré); igual en Piedras y en el Dashboard
    let ALERT = { L: [], compras: [] };
    function alertasHTML(corta) {
      ALERT = alertas(); const { L, compras } = ALERT;
      if (!L.length) return corta ? '' : '<section class="caja ok hacer"><h2>✓ Todos los pedidos tienen su piedra</h2></section>';
      const fila = (ic, cls, t, sub, btn) => '<li class="' + cls + '"><i>' + ic + '</i><span><b>' + t + '</b><small>' + sub + '</small></span>' + (btn || '') + '</li>';
      const conStock = L.filter(x => x.n === 'a'), malas = L.filter(x => x.n === 'r' && !compras.some(c => c.l.some(f => f.p === x.p && f.g === x.g)));
      return '<section class="caja hacer' + (compras.length || malas.length ? ' mal' : ' pend') + '"><div class="caja-t"><h2>Lo que hay que hacer</h2><span class="sub">' + (conStock.length + malas.length + compras.length) + '</span></div><ul class="hacer-l">'
        + compras.map((c, i) => fila('🛒', 'compra', 'Comprar ' + c.placas.length + ' placa' + (c.placas.length > 1 ? 's' : '') + ' ' + esc(c.nombre), 'Para: ' + esc(c.l.map(f => X.M().nomPedido(f.p).replace(/ #\d+$/, '') + ' ' + f.g.t.replace(/^Mesa (de )?/i, '')).join(' + ')) + ' · usa ' + c.usado + '%' + (c.sobra ? ' · sobra ' + c.sobra.w + '×' + c.sobra.h + (c.saleSobra.length ? ' (ahí salen ' + esc(c.saleSobra.map(x => x.n + '× ' + x.et).join(', ')) + ')' : '') : ''), '<div class="hacer-b"><button class="b chico" data-verpl="' + i + '">🖼 Ver placa</button><button class="b chico negro" data-comprar="' + i + '">Ya la compré</button></div>')).join('')
        + conStock.map(x => { const i = L.indexOf(x); return fila('✂', 'corta', esc(X.M().nomPedido(x.p).replace(/ #\d+$/, '')) + ' · ' + esc(x.g.t), 'Sale de tu ' + esc(nomPieza(x.s)) + ' (' + (x.s.tipo === 'placa' ? 'placa' : 'pedazo') + ')', '<button class="b chico verde" data-hcut="' + i + '">✂ Cortar</button>'); }).join('')
        + malas.map(x => fila('!', 'mala', '<a href="#p=' + esc(x.p.id) + '">' + esc(x.t) + '</a>', esc(x.d))).join('')
        + '</ul>' + (corta ? '<a class="lnk" href="#piedras">Ir a Piedras ›</a>' : '') + '</section>';
    }
    function enlazarAlertas() {
      $$('[data-verpl]').forEach(b => b.onclick = () => verCompra(ALERT.compras[+b.dataset.verpl]));
      $$('[data-comprar]').forEach(b => b.onclick = () => { const c = ALERT.compras[+b.dataset.comprar]; agregar(null, { tipo: 'placa', piedra: c.nombre }); });
      $$('[data-hcut]').forEach(b => b.onclick = () => { const x = ALERT.L[+b.dataset.hcut]; cortar(x.s, { reqs: x.g.reqs, pedido: x.p.id, grupos: [x.g.gi] }); });
    }
    // AVISO GRANDE arriba del pedido: ¿tengo la piedra o no?, y el consejo (qué comprar, con quién juntarlo, qué sobra)
    function avisoPedido(p) {
      if (!pedidoActivo(p)) return '';
      const G = gruposPedido(p); if (!G.length) return '<section class="caja pend pz-aviso"><b>Piedra: faltan las medidas</b><p>Pon las medidas del pedido y te digo si tienes la piedra o hay que comprar.</p></section>';
      ALERT = alertas(); const mios = ALERT.L.filter(x => x.p.id === p.id), faltan = G.filter(g => estadoGrupo(p, g).falta);
      if (!faltan.length) return '<section class="caja ok pz-aviso"><b>✓ La piedra de este pedido ya está</b><p>' + esc(G.map(g => g.t + ': ' + estadoGrupo(p, g).listo.toLowerCase()).join(' · ')) + '</p></section>';
      const con = mios.filter(x => x.n === 'a'), compra = ALERT.compras.map((c, i) => ({ c, i })).filter(({ c }) => c.l.some(f => f.p.id === p.id));
      let h = '';
      con.forEach(x => { h += '<div class="pz-av-l ok"><b>✓ Tienes la piedra en stock</b><p>' + esc(x.g.t + (x.g.color ? ' ' + x.g.color : '') + ' sale de tu ' + nomPieza(x.s) + ' (' + (x.s.tipo === 'placa' ? 'placa' : 'pedazo') + ')') + '</p><button class="b verde grande" data-hcut="' + ALERT.L.indexOf(x) + '">✂ Cortar ahora</button></div>'; });
      compra.forEach(({ c, i }) => { const mias = c.l.filter(f => f.p.id === p.id), otros = c.l.filter(f => f.p.id !== p.id);
        h += '<div class="pz-av-l no"><b>✕ No tienes piedra: necesitas ' + esc(mias.map(f => f.g.t.replace(/^Mesa (de )?/i, '')).join(' + ') + ' ' + c.nombre) + '</b>'
          + '<p>👉 Compra <b>' + c.placas.length + ' placa' + (c.placas.length > 1 ? 's' : '') + ' ' + esc(c.nombre) + '</b> (320 × 160, ≈ ' + pesos(P.C.placa.precio * c.placas.length) + ').</p>'
          + (otros.length ? '<p>💡 Júntalo: de esa misma placa sale también <b>' + esc(otros.map(f => X.M().nomPedido(f.p).replace(/ #\d+$/, '') + ' ' + f.g.t.replace(/^Mesa (de )?/i, '')).join(' + ')) + '</b>. Así la placa sale a ≈ ' + pesos(c.costoC) + ' por pedido.</p>' : '<p>Solo este pedido usa esa placa por ahora.</p>')
          + '<p>Se usa ' + c.usado + '% de la placa' + (c.sobra ? '; sobra un pedazo de ' + c.sobra.w + '×' + c.sobra.h + (c.saleSobra.length ? ' para vender después (salen ' + esc(c.saleSobra.map(x => x.n + '× ' + x.et).join(', ')) + ')' : '') : '') + '.</p>'
          + '<button class="b grande" data-verpl="' + i + '">🖼 Ver cómo queda la placa</button><button class="b negro grande" data-comprar="' + i + '">Ya la compré: agregarla</button></div>'; });
      mios.filter(x => x.n === 'r' && !compra.some(({ c }) => c.l.some(f => f.g === x.g))).forEach(x => { h += '<div class="pz-av-l no"><b>⚠ ' + esc(x.t) + '</b><p>' + esc(x.d) + '</p></div>'; });
      return '<section class="caja pz-aviso ' + (compra.length ? 'mal' : 'pend') + '"><h2>Piedra de este pedido</h2>' + h + '</section>';
    }
    function seccionPedido(p) {
      const G = gruposPedido(p); if (!G.length) return X.plegable('Piedra de este pedido', '', '<p class="nota">Pon las medidas del pedido y te digo si tienes piedra.</p>');
      const activo = pedidoActivo(p), ap = p.stock && !(p.piezas || []).length ? pieza(p.stock) : null;
      const filas = G.map(g => {
        const e = estadoGrupo(p, g), cab = '<b>' + esc(g.t) + (g.color ? ' · ' + esc(g.color) : '') + '</b>';
        if (!e.falta) return { ok: 1, h: '<div class="pz-g">' + cab + '<p class="ok-g">✓ ' + esc(e.listo) + '</p>' + ((p.piedraOk || {})[g.gi] ? '<button class="lnk" data-pzok="' + g.gi + '">Quitar marca</button>' : '') + '</div>' };
        const l = buscar(g.reqs, g.color), m = l.filter(y => y.color), apNo = ap && g.gi === 0 && (ap.estado === 'usado' || corte(ap, g.reqs).faltan.length);
        return { ok: 0, h: '<div class="pz-g">' + cab + (apNo ? '<p class="aviso r">⚠ La piedra apartada (' + esc(nomPieza(ap)) + ') ' + (ap.estado === 'usado' ? 'ya se usó' : 'no alcanza') + '.</p>' : '')
          + (m.length ? '<p class="ok-g">✓ Hay en stock: ' + esc(nomPieza(m[0].s)) + '</p><button class="b chico verde" data-pzcut="' + esc(m[0].s.id) + '" data-gi="' + g.gi + '">✂ Cortar de ' + esc(tipoTxt(m[0].s).toLowerCase()) + ' ' + esc(r1(num(m[0].s.w)) + '×' + r1(num(m[0].s.h))) + '</button>'
            : '<p class="aviso r">⚠ No hay piedra que alcance' + (l.length ? ' de ese color (sí de otro: ' + esc(nomPieza(l[0].s)) + ')' : '') + ': hay que comprar placa. <a href="#piedras">Ver qué comprar ›</a></p>')
          + (activo ? ' <button class="b chico" data-pzok="' + g.gi + '">Ya tengo esta piedra</button>' : '') + '</div>' };
      });
      const faltan = filas.filter(f => !f.ok).length;
      return X.plegable('Piedra de este pedido', !activo ? '' : faltan ? '⚠ falta para ' + faltan + ' de ' + G.length : 'lista ✓', filas.map(f => f.h).join('') + (ap && ap.estado !== 'usado' && !corte(ap, G[0].reqs).faltan.length && estadoGrupo(p, G[0]).falta ? '<p class="aviso">Apartaste ' + esc(nomPieza(ap)) + '. <button class="b chico verde" data-pzcut="' + esc(ap.id) + '" data-gi="0">✂ Cortar ahora</button></p>' : ''), activo && faltan > 0, activo && faltan ? 'mal' : '');
    }
    function enlazarPedido(p) {
      const G = gruposPedido(p);
      $$('[data-pzcut]').forEach(b => b.onclick = () => { const gi = +b.dataset.gi, g = G.find(x => x.gi === gi) || G[0]; cortar(pieza(b.dataset.pzcut), { reqs: g.reqs, pedido: p.id, grupos: [g.gi] }); });
      $$('[data-pzok]').forEach(b => b.onclick = async () => { const gi = +b.dataset.pzok, g = G.find(x => x.gi === gi), quitar = !!(p.piedraOk || {})[gi];
        if (!await X.clave(quitar ? 'Quitar "ya tengo la piedra"' : 'Ya tengo esta piedra', [['Pedido', X.M().nomPedido(p)], ['Mesa', g ? g.t : ''], ['Qué pasa', quitar ? 'vuelve a revisarse contra el stock' : 'ya no te avisa que falta piedra']])) return;
        await X.guardarYa(() => A.nodoPon('dinero/pedidos/' + p.id + '/piedraOk/' + gi, quitar ? null : true), quitar ? 'Marca quitada' : 'Listo: esa piedra ya está', (quitar ? 'Quitó ' : 'Marcó ') + '"ya tengo la piedra" · ' + X.M().nomPedido(p) + ' · ' + (g ? g.t : '')); });
    }
    // en el alta del pedido (paso Cubierta): piedras del stock donde cabe esta mesa
    function stockAlta(w) {
      const reqs = reqsPedido(w); if (!reqs.length) return '<p class="nota">Pon las medidas (paso anterior) y aquí te salen las piedras que tienes donde cabe.</p>';
      const l = buscar(reqs, colorPedido(w)).slice(0, 8);
      return l.length ? '<div class="chips" id="a-stock">' + l.map(x => '<button type="button" data-v="' + esc(x.s.id) + '"' + (w.stock === x.s.id ? ' class="on"' : '') + '>' + esc(x.s.piedra) + '<small>' + esc(tipoTxt(x.s).toLowerCase() + ' ' + r1(num(x.s.w)) + '×' + r1(num(x.s.h))) + '</small></button>').join('') + '</div><p class="nota">Tócala para apartarla: la piedra del pedido queda con ese color y en el pedido te sale “Cortar ahora”.</p>'
        : '<p class="nota">No tienes piedra en stock donde quepa ' + esc(reqTxt(reqs)) + '. Hay que comprar placa.</p>';
    }

    // ================= PLANEACIÓN: acomodar pedidos en placas, guardar, editar y dar seguimiento =================
    // dinero/planes/<id> { nombre, piedra, fuente:'nueva'|<id de piedra>, piezas:[{ n, pedido, gi, forma, d, w, h, cant }], nota, estado:'idea'|'comprar'|'hecho', pct, por, creado, editado }
    const ESTADOS_PL = [['idea', 'Idea'], ['comprar', 'Por comprar'], ['hecho', 'Hecho']];
    const planes = () => Object.entries(X.D().planes || {}).map(([id, x]) => Object.assign({ id }, x, { piezas: arr(x.piezas) })).sort((a, b) => (b.editado || b.creado || 0) - (a.editado || a.creado || 0));
    const reqsPlan = pl => pl.piezas.filter(z => num(z.d) || num(z.w)).map(z => ({ nombre: z.n || 'Pieza', forma: z.forma === 'red' ? 'red' : 'rect', d: num(z.d), w: num(z.w), h: num(z.h), cant: Math.max(1, num(z.cant) || 1) }));
    const espPlan = pl => { const s = pl.fuente && pl.fuente !== 'nueva' ? pieza(pl.fuente) : null; return s ? { tipo: s.tipo === 'placa' ? 'placa' : 'retazo', id: s.id, w: num(s.w), h: num(s.h) } : { tipo: 'placa', w: PLACA().w, h: PLACA().h }; };
    const corrPlan = pl => { const rq = reqsPlan(pl); if (!rq.length) return null; try { return K.cortarEn(items(rq), espPlan(pl), CFG); } catch (e) { return null; } };
    const medZ = z => z.forma === 'red' ? 'Ø' + num(z.d) : num(z.w) + '×' + num(z.h);
    // lo que falta de piedra en los pedidos activos (para meterlo al plan con un toque)
    const pendientesPz = () => { const L = []; X.M().pedidos.filter(pedidoActivo).forEach(p => gruposPedido(p).forEach(g => { if (estadoGrupo(p, g).falta) L.push({ p, g }); })); return L; };
    const segPlan = pl => { const ids = pl.piezas.filter(z => z.pedido); if (!ids.length) return ''; const pend = pendientesPz(), siguen = ids.filter(z => pend.some(x => x.p.id === z.pedido && x.g.gi === (z.gi || 0))).length; return siguen ? '⏳ ' + siguen + ' de ' + ids.length + ' pedido' + (ids.length > 1 ? 's' : '') + ' siguen esperando piedra' : '✓ Sus pedidos ya tienen piedra'; };
    function listaPlanes() {
      const L = planes(), pend = pendientesPz();
      X.main().innerHTML = '<a class="volver" href="#piedras">‹ Piedras</a>' + X.tit('Planeación', 'Acomoda pedidos en placas · se guarda todo', '<div class="tit-b"><a class="b negro" href="#piedras/plan=nuevo">＋ Nueva</a></div>')
        + (pend.length ? '<section class="caja pend"><h2>Esperan piedra: ' + pend.length + '</h2><p class="nota">' + esc(pend.map(x => X.M().nomPedido(x.p).replace(/ #\d+$/, '') + ' ' + x.g.t.replace(/^Mesa (de )?/i, '') + (x.g.color ? ' (' + x.g.color + ')' : '')).join(' · ')) + '</p><a class="b grande negro" href="#piedras/plan=nuevo">🧩 Planear una placa para ellos</a></section>' : '')
        + '<section class="caja"><div class="caja-t"><h2>Mis planeaciones</h2><span class="sub">' + L.length + '</span></div>'
          + (L.length ? '<div class="pl-lista">' + L.map(pl => { const e = espPlan(pl), r = corrPlan(pl), seg = segPlan(pl);
            return '<a class="pl-card" href="#piedras/plan=' + esc(pl.id) + '"><div class="dib chico">' + dibujo({ piedra: pl.piedra, w: e.w, h: e.h }, r) + '</div><span><b>' + esc(pl.nombre || 'Sin nombre') + '</b><small>' + esc((pl.piedra || 'Sin piedra') + ' · ' + (pl.fuente && pl.fuente !== 'nueva' ? 'de tu stock' : 'placa nueva') + ' · ' + pl.piezas.length + ' pieza' + (pl.piezas.length === 1 ? '' : 's') + (r ? ' · usa ' + r.pct + '%' + (r.faltan.length ? ' · ⚠ no caben ' + r.faltan.length : '') : '') + ' · ' + fC(N.ymd(new Date(pl.editado || pl.creado || Date.now()))) + (pl.por ? ' · ' + pl.por : '')) + '</small>' + (seg ? '<small>' + esc(seg) + '</small>' : '') + '</span>' + X.pill((ESTADOS_PL.find(x => x[0] === pl.estado) || ESTADOS_PL[0])[1], pl.estado === 'hecho' ? 'v' : pl.estado === 'comprar' ? 'a' : '') + '</a>'; }).join('') + '</div>'
            : X.vacioTxt('Todavía no hay planeaciones. Toca “＋ Nueva”, elige la piedra y mete los pedidos.')) + '</section>';
    }
    const BORR = {};
    function editorPlan(id) {
      const pl0 = id ? planes().find(x => x.id === id) : null; if (id && !pl0) { location.hash = '#piedras/planes'; return; }
      const llave = id || 'nuevo';
      const pl = BORR[llave] || (BORR[llave] = pl0 ? JSON.parse(JSON.stringify(pl0)) : { nombre: '', piedra: '', fuente: 'nueva', piezas: [], nota: '', estado: 'idea' });
      let q = { forma: 'red', d: '', w: '', h: '', cant: '1' }, nomL = '';
      const pintar = () => {
        const col = limpiaP(pl.piedra), stock = col ? disponibles().filter(s => mismoColor(s.piedra, col)) : [], e = espPlan(pl), r = corrPlan(pl), pend = pendientesPz();
        if (pl.fuente !== 'nueva' && !stock.some(s => s.id === pl.fuente)) pl.fuente = 'nueva';
        const enPlan = x => pl.piezas.some(z => z.pedido === x.p.id && (z.gi || 0) === x.g.gi);
        X.main().innerHTML = '<a class="volver" href="#piedras/planes">‹ Planeación</a>' + X.tit(esc(pl.nombre || (id ? 'Planeación' : 'Nueva planeación')), id ? 'Guardada · ' + esc(fC(N.ymd(new Date(pl0.editado || pl0.creado || Date.now())))) : 'Todavía no se guarda', '')
          + '<section class="caja"><label class="campo">Nombre (opcional)<input id="pl-nom" maxlength="80" placeholder="ej. Placa Bulgaria · Shamy + Shely" value="' + esc(pl.nombre) + '"></label>'
            + '<div class="campo"><span class="num">1</span> Piedra' + chipsPiedra('piedra', pl.piedra, { conOtra: true }) + (otraAbierta(pl.piedra) ? '<input id="pl-p" maxlength="40" placeholder="Nombre de la piedra" value="' + esc(limpiaP(pl.piedra)) + '">' : '') + '</div>'
            + '<div class="campo"><span class="num">2</span> ¿En qué placa?' + chipsH('fuente', [['nueva', 'Placa nueva', PLACA().w + ' × ' + PLACA().h + ' (comprar)']].concat(stock.map(s => [s.id, 'Tu ' + (s.tipo === 'placa' ? 'placa' : 'pedazo'), r1(num(s.w)) + ' × ' + r1(num(s.h))])), pl.fuente) + (col && !stock.length ? '<p class="nota">No tienes ' + esc(col) + ' en stock: se planea en una placa nueva.</p>' : '') + '</div></section>'
          + '<section class="caja"><h2><span class="num">3</span> Pedidos que esperan piedra</h2>' + (pend.length ? '<ul class="hacer-l">' + pend.map((x, i) => { const ya = enPlan(x), otro = col && x.g.color && !mismoColor(x.g.color, col);
              return '<li class="' + (ya ? 'corta' : '') + '"><i>' + (ya ? '✓' : '＋') + '</i><span><b>' + esc(X.M().nomPedido(x.p).replace(/ #\d+$/, '')) + ' · ' + esc(x.g.t.replace(/^Mesa (de )?/i, '')) + '</b><small>' + esc(x.g.color || 'sin piedra') + (otro ? ' · ⚠ el pedido dice otra piedra' : '') + '</small></span><button class="b chico ' + (ya ? '' : 'verde') + '" data-plp="' + i + '">' + (ya ? 'Quitar' : 'Agregar') + '</button></li>'; }).join('') + '</ul>' : X.vacioTxt('Ningún pedido espera piedra ahorita.')) + '</section>'
          + '<section class="caja"><h2><span class="num">4</span> Otra pieza (mesa nueva, cliente que estás cotizando)</h2><label class="campo">¿Para quién?<input id="pl-nl" maxlength="40" placeholder="ej. Cliente nuevo, Mesa para ofrecer" value="' + esc(nomL) + '"></label>' + pideH(q, 'pl-pide') + '<button type="button" class="b grande" id="pl-add">＋ Agregar pieza</button></section>'
          + '<section class="caja"><div class="caja-t"><h2>Así queda</h2><span class="sub">' + (r ? 'usa ' + r.pct + '%' : '') + '</span></div>'
            + (pl.piezas.length ? '<ul class="corta">' + pl.piezas.map((z, i) => '<li><b>' + esc((z.n || 'Pieza') + ' · ' + medZ(z)) + (num(z.cant) > 1 ? ' × ' + num(z.cant) : '') + '</b><button type="button" class="x" data-plx="' + i + '" aria-label="Quitar">✕</button></li>').join('') + '</ul>' : '<p class="nota">Agrega pedidos o piezas y aquí se dibujan.</p>')
            + (r ? '<div class="dib">' + dibujo({ piedra: col, w: e.w, h: e.h }, r) + '</div>' + (r.faltan.length ? '<p class="aviso r">✕ No caben: ' + esc(r.faltan.map(x => x.et).join(', ')) + '. Quita algo o usa otra placa.</p>' : '<p class="ok-g">✓ Cabe todo · se usa ' + r.pct + '%' + (r.sobrantes.length ? ' · sobra ' + r.sobrantes.map(s => Math.floor(s.w) + '×' + Math.floor(s.h)).join(' y ') : '') + '</p>') + '<button class="b grande" id="pl-img">🖼 Imagen para WhatsApp</button><div id="pl-vp"></div>' : '') + '</section>'
          + '<section class="caja"><label class="campo">Notas y seguimiento<textarea id="pl-nota" maxlength="600" placeholder="ej. Ofrecerle a David la Bulgaria; llamar el lunes; si no, usar Negra">' + esc(pl.nota) + '</textarea></label><div class="campo">Estado' + chipsH('estado', ESTADOS_PL, pl.estado || 'idea') + '</div></section>'
          + '<div class="botones col"><button class="b negro grande" id="pl-ok">' + (id ? 'Guardar cambios' : 'Guardar planeación') + '</button>' + (id ? '<button class="b grande" id="pl-dup">⧉ Duplicar (probar otra piedra)</button><button class="b rojo" id="pl-b">Borrar planeación</button>' : '') + '</div>';
        const leer = () => { pl.nombre = $('#pl-nom').value.trim(); if ($('#pl-p')) pl.piedra = $('#pl-p').value.trim() || OTRA; pl.nota = $('#pl-nota').value; nomL = $('#pl-nl').value.trim(); leerPide($('#pl-pide'), q); };
        $$('[data-q]').forEach(g => g.onclick = ev => { const b = ev.target.closest('[data-v]'); if (!b) return; leer(); if (g.dataset.q === 'forma') q.forma = b.dataset.v; else pl[g.dataset.q] = b.dataset.v; pintar(); });
        $$('[data-plp]').forEach(b => b.onclick = () => { leer(); const x = pend[+b.dataset.plp], i = pl.piezas.findIndex(z => z.pedido === x.p.id && (z.gi || 0) === x.g.gi);
          if (i >= 0) pl.piezas = pl.piezas.filter(z => !(z.pedido === x.p.id && (z.gi || 0) === x.g.gi)); else x.g.reqs.forEach(rq => pl.piezas.push({ n: X.M().nomPedido(x.p).replace(/ #\d+$/, ''), pedido: x.p.id, gi: x.g.gi, forma: rq.forma, d: num(rq.d) || null, w: num(rq.w) || null, h: num(rq.h) || null, cant: num(rq.cant) || 1 }));
          if (!limpiaP(pl.piedra) && x.g.color) pl.piedra = (catDe(x.g.color) || [])[1] || (/negr/.test(sinAc(x.g.color)) ? 'Negra' : x.g.color); pintar(); });
        $('#pl-add').onclick = () => { leer(); const rq = reqDe(q); if (!rq.length) return X.aviso('Escribe la medida.', true); pl.piezas.push({ n: nomL || 'Mesa nueva', forma: rq[0].forma, d: num(rq[0].d) || null, w: num(rq[0].w) || null, h: num(rq[0].h) || null, cant: rq[0].cant }); q = { forma: q.forma, d: '', w: '', h: '', cant: '1' }; pintar(); };
        $$('[data-plx]').forEach(b => b.onclick = () => { leer(); pl.piezas.splice(+b.dataset.plx, 1); pintar(); });
        $$('#pl-nom, #pl-nota, #pl-nl').forEach(i => i.addEventListener('input', leer));
        if ($('#pl-img')) $('#pl-img').onclick = async () => { leer(); const cv = await lienzoPlaca({ piedra: limpiaP(pl.piedra), w: e.w, h: e.h, r, titulo: (pl.nombre || ((pl.fuente !== 'nueva' ? 'Tu ' : 'Placa ') + (limpiaP(pl.piedra) || 'piedra'))) + ' · ' + e.w + ' × ' + e.h + ' cm', sub: subPlan(r), nombre: p => limpiaN(p.nombre) || 'Pieza' });
          $('#pl-vp').innerHTML = '<img class="vp-img" src="' + cv.toDataURL('image/jpeg', 0.9) + '" alt=""><button class="b verde grande" id="pl-share">📤 Mandar imagen (WhatsApp)</button>'; $('#pl-share').onclick = () => cv.toBlob(bl => X.bajar(bl, (pl.nombre || 'Planeación') + '.png'), 'image/png'); };
        $('#pl-ok').onclick = async () => {
          leer(); const pi = limpiaP(pl.piedra); if (!pi) return X.aviso('Elige la piedra.', true); if (!pl.piezas.length) return X.aviso('Agrega al menos una pieza.', true);
          const nombre = (pl.nombre || ('Placa ' + pi + ' · ' + [...new Set(pl.piezas.map(z => z.n))].join(' + '))).slice(0, 80), r2 = corrPlan(pl);
          const x = { nombre, piedra: pi.slice(0, 40), fuente: pl.fuente || 'nueva', piezas: pl.piezas.map(z => ({ n: String(z.n || 'Pieza').slice(0, 40), pedido: z.pedido || null, gi: z.pedido ? (z.gi || 0) : null, forma: z.forma === 'red' ? 'red' : 'rect', d: num(z.d) || null, w: num(z.w) || null, h: num(z.h) || null, cant: Math.max(1, num(z.cant) || 1) })), nota: (pl.nota || '').slice(0, 600) || null, estado: pl.estado || 'idea', pct: r2 ? r2.pct : null };
          let nuevo = id;
          await X.guardarYa(async () => { if (id) await A.nodoCambia('dinero/planes/' + id, x); else nuevo = await A.nodoAgrega('dinero/planes', x); }, 'Planeación guardada', (id ? 'Editó' : 'Guardó') + ' planeación: ' + nombre);
          delete BORR[llave]; if (!id && nuevo) location.hash = '#piedras/plan=' + nuevo;
        };
        if ($('#pl-dup')) $('#pl-dup').onclick = () => { leer(); BORR.nuevo = Object.assign(JSON.parse(JSON.stringify(pl)), { nombre: '' }); location.hash = '#piedras/plan=nuevo'; X.aviso('Copia lista: cámbiale la piedra o la placa y guárdala'); };
        if ($('#pl-b')) $('#pl-b').onclick = async () => { if (!await X.clave('Borrar planeación', [['Planeación', pl0.nombre || '']])) return; await X.guardarYa(() => A.nodoBorra('dinero/planes/' + id), 'Planeación borrada', 'Borró planeación: ' + (pl0.nombre || '')); delete BORR[llave]; location.hash = '#piedras/planes'; };
      };
      pintar();
    }
    // ---------- rutas de la sección ----------
    function ruta(h) {
      aplicarPrecios();
      if (h === 'piedras') return inicio();
      if (h === 'piedras/cotizar') return cotizar();
      if (h === 'piedras/historial') return historial();
      if (h === 'piedras/precios') return precios();
      if (h === 'piedras/planes') return listaPlanes();
      if (/^piedras\/plan=/.test(h)) { const k = h.slice(13); return editorPlan(k === 'nuevo' ? null : k); }
      if (h === 'piedras/cliente') return cliente();
      if (/^piedras\/cliente=/.test(h)) return cliente(h.slice(16));
      if (/^piedras\/s=/.test(h)) { const s = pieza(h.slice(10)); return s ? detalle(s) : inicio(); }
      inicio();
    }
    return { avisoPedido, medComunes, altoDe, cm, alertasHTML, enlazarAlertas, ruta, aplicarPrecios, seccionPedido, enlazarPedido, stockAlta, agregar, cortar, pieza, buscar, reqsPedido, disponibles };
  };
})(typeof window !== 'undefined' ? window : globalThis);

;
/* DKAS · Admin nuevo (pantallas). Menú: Dashboard · Pedidos · Piedras · Dinero · Ajustes (Piedras vive en piedras.js). Todo sale de DKAS_N (nucleo.js).
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
  let me = null, D = {}, M = null, piezas = [], main = null, PZ = null;

  // ---------- arranque y datos ----------
  async function arrancar() {
    main = $('#app');
    try { me = await A.yo(); } catch (e) { me = null; }
    if (!me) return login();
    if (!me.nombre) return nombre();
    if (!PZ) PZ = window.DKAS_PIEDRAS_MOD({ N, A, esc, pesos, fC, hoy, $, $$, M: () => M, D: () => D, me: () => me, main: () => main, piezas: () => piezas, tit, kpi, pill, plegable, vacioTxt, hoja, cerrarHoja, clave, guardarYa, aviso, alta, ocupado, libPDF, imgData, bajar, sinRaros });
    document.body.classList.add('dentro');
    main.innerHTML = '<p class="cargando">Cargando…</p>';
    await cargar(); if (!location.hash) history.replaceState(null, '', '#inicio'); ruta();
    A.listar().then(l => { SOL = l; }).catch(() => {});
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
  // versión nueva publicada en dkas.mx → la app se recarga sola (si no hay una hoja abierta ni se está guardando)
  let ultVer = 0;
  async function revisarVersion() {
    if (A.demo || document.hidden || Date.now() - ultVer < 60000) return; ultVer = Date.now();
    try {
      const mio = ((document.querySelector('script[src*="js/admin.js"]') || {}).src || '').split('v=')[1], h = await (await fetch(location.pathname + '?ver=' + Date.now(), { cache: 'no-store' })).text(), nueva = (h.match(/js\/admin\.js\?v=([a-f0-9]+)/) || [])[1];
      if (mio && nueva && nueva !== mio) { if ($('#capa') || $('.capa') || ocupadoGuardando) { ultVer = 0; return; } location.reload(); }
    } catch (e) {}
  }
  setInterval(revisarVersion, 15000); addEventListener('focus', revisarVersion); document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarVersion(); });
  setInterval(sincronizar, 12000); addEventListener('focus', sincronizar); document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
  const recargar = async () => { await cargar(); ruta(); };
  if ('serviceWorker' in navigator && !A.demo) { navigator.serviceWorker.register('panel-sw.js').catch(() => {}); navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.ir) location.hash = e.data.ir; }); }
  async function bitacora(accion, detalle) { try { await A.nodoAgrega('dinero/bitacora', { accion, detalle: String(detalle || '').slice(0, 300) }); } catch (e) {} }

  // ---------- rutas y menú ----------
  const MENU = [['inicio', 'Dashboard', 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z'], ['pedidos', 'Pedidos', 'M4 4h16v4H4zm0 6h16v10H4zm4 3v2h8v-2z'], ['piedras', 'Piedras', 'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z'], ['dinero', 'Dinero', 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15v2h-2v-2c-1.7-.3-3-1.4-3-3h2c0 .6.9 1 2 1s2-.4 2-1-.6-1-2-1.3c-2.2-.4-4-1.1-4-3 0-1.4 1.3-2.5 3-2.8V5h2v1.9c1.7.3 3 1.4 3 3h-2c0-.6-.9-1-2-1s-2 .4-2 1 .6.8 2 1.1c2.2.5 4 1.2 4 3.2 0 1.4-1.3 2.5-3 2.8z'], ['ajustes', 'Ajustes', 'M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7 7 0 00-1.7-1L15 3h-4l-.3 2.7a7 7 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 001.7 1L11 21h4l.3-2.7a7 7 0 001.7-1l2.5 1 2-3.5zM13 15a3 3 0 110-6 3 3 0 010 6z']];
  function menu(sec) {
    $('#menu').innerHTML = '<div class="m-logo"><img src="img/dkas-oscuro.png" alt="DKAS"></div>' + MENU.map(([k, t, d]) => '<a href="#' + k + '"' + (k === sec ? ' class="on" aria-current="page"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg><span>' + t + '</span></a>').join('')
      + '<button class="m-reg" id="m-reg"><b>＋</b><span>Registrar dinero</span></button><div class="m-sync"><span class="sync"></span></div>';
    $('#m-reg').onclick = () => registrar(); pintarSync();
  }
  function ruta(quieto) {
    if (!M) return;
    const h = location.hash.slice(1) || 'inicio', sec = /^v\//.test(h) ? seccionVieja(h.slice(2)) : /^piedras|^sobrantes|^pedidos\/sobrantes/.test(h) ? 'piedras' : /^p=|^c=|^d=|^pedidos/.test(h) ? 'pedidos' : MENU.some(m => m[0] === h) ? h : 'inicio';
    menu(sec); if (!quieto) window.scrollTo(0, 0);
    setTimeout(pintarSync, 0);
    if (/^v\//.test(h)) return viejo(h.slice(2));
    if (h === 'inicio') return inicio();
    if (h === 'pedidos') return pedidos('pedidos');
    if (h === 'pedidos/clientes') return pedidos('clientes');
    if (h === 'pedidos/deudas') return pedidos('deudas');
    if (h === 'pedidos/solicitudes') return solicitudes();
    if (h === 'pedidos/sobrantes' || h === 'sobrantes') { location.replace('#piedras'); return; }
    if (/^piedras/.test(h)) return PZ.ruta(h);
    if (/^p=/.test(h)) { const p = M.ped(h.slice(2)); return p ? pedido(p) : pedidos('pedidos'); }
    if (/^c=/.test(h)) { const c = M.cli(h.slice(2)); return c ? cliente(c) : pedidos('clientes'); }
    if (/^d=/.test(h)) { const x = M.deu(h.slice(2)); return x ? deuda(x) : pedidos('deudas'); }
    if (h === 'dinero') return dinero();
    if (h === 'ajustes') return ajustes();
    inicio();
  }
  addEventListener('hashchange', ruta);

  // ---------- piezas de pantalla ----------
  const tit = (t, sub, der) => '<header class="tit"><div><span class="sync"></span><h1>' + t + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (der || '') + '</header>';
  const kpi = (lbl, v, c, sub, href, extra) => '<' + (href ? 'a href="' + href + '"' : 'div') + ' class="kpi' + (extra ? ' ' + extra : '') + '"><span>' + lbl + '</span><b class="' + (c || '') + '">' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</' + (href ? 'a' : 'div') + '>';
  const prog = (n, tot, v) => '<i class="prog' + (v ? ' v' : '') + '"><em style="width:' + Math.round(n / tot * 100) + '%"></em></i>';
  const pill = (t, c) => '<em class="pill ' + (c || '') + '">' + esc(t) + '</em>';
  const plegable = (t, resumen, html, abierto, cls2) => '<details class="plegable' + (cls2 ? ' ' + cls2 : '') + '"' + (abierto ? ' open' : '') + '><summary><span>' + t + '</span>' + (resumen ? '<small>' + resumen + '</small>' : '') + '</summary><div class="pl-c">' + html + '</div></details>';
  const vacioTxt = t => '<p class="vacio">' + t + '</p>';
  const medMesa = x => num(x.w) && num(x.h) ? num(x.w) + ' × ' + num(x.h) : 'Ø ' + num(x.d);
  const mesaTxt = x => [x.n || 'Mesa', medMesa(x) + (num(x.a) ? ' cm × ' + num(x.a) + ' alto' : '') + ' cm', x.piedra ? 'piedra ' + x.piedra : ''].filter(Boolean).join(' · ');
  const piezaTxt = p => {
    if ((p.piezas || []).length) return p.piezas.length + ' mesas: ' + p.piezas.map(x => (x.n || 'mesa').toLowerCase() + ' ' + medMesa(x).replace(/ /g, '') + (num(x.a) ? '×' + num(x.a) : '') + (x.piedra ? ' ' + x.piedra.toLowerCase() : '')).join(' · ') + (p.base ? ' · base ' + otra(p.base, p.baseOtra).toLowerCase() : '');
    const med = p.forma === 'Redonda' ? (num(p.largo) ? 'Ø' + num(p.largo) : '') : (num(p.largo) ? num(p.largo) + '×' + num(p.ancho) : '');
    return [num(p.cantidad) > 1 ? num(p.cantidad) + '×' : '', otra(p.tipo, p.tipoOtra) || '', p.forma ? p.forma.toLowerCase() : '', med ? med + ' cm' : '', otra(p.color, p.colorOtra) || '', p.base ? '· base ' + otra(p.base, p.baseOtra).toLowerCase() : ''].filter(Boolean).join(' ') || 'Falta decir qué mesa es';
  };
  const colorEstado = (p, s) => p.cerrado ? 'v' : s.diasEntrega != null && s.diasEntrega < 0 && !s.pasos[5].done ? 'r' : s.pasos[5].done ? 'a' : '';

  // ================= DASHBOARD: el socio =================
  const focoHoy = () => { const f = (M.bitacora || []).find(x => x.accion === 'Prioridad del día' && x.dia === hoy()); return f ? f.valor : ''; };
  function inicio() {
    const foco = focoHoy(), S = M.socio(foco, new Date().getHours()), T = S.T, P = S.pasos, sem = M.agenda().filter(a => a.grupo === 'semana' && !a.hecho);
    const h0 = new Date().getHours(), saludo = (h0 < 12 ? 'Buenos días' : h0 < 19 ? 'Buenas tardes' : 'Buenas noches') + ', ' + esc((me.nombre || '').split(' ')[0]);
    const urg = P.filter(p => p.nivel === 'urgente').length, focoN = (N.AREAS.find(a => a[0] === foco) || [])[1];
    const paso = (p, i) => '<li class="n-' + p.nivel + '"><button class="paso" data-paso="' + i + '"><i>' + (i + 1) + '</i><span><b>' + esc(p.titulo) + '</b><small>' + esc(p.porque) + '</small></span>' + (p.manual ? '' : '<em>›</em>') + '</button>' + (p.manual ? '<button class="chk" data-ag="' + esc(p.manual) + '" aria-label="Marcar hecha"></button>' : '') + '</li>';
    const sig = P[0];
    main.innerHTML = tit(saludo, fC(hoy()), '<button class="b chico" id="x-todo">Exportar</button>')
      + '<section class="socio">'
        + '<div class="socio-t"><span class="socio-ic">◆</span><div><b>Tu socio</b><small>' + (P.length ? (urg ? urg + ' urgente' + (urg > 1 ? 's' : '') + ' · ' : '') + P.length + ' pendiente' + (P.length > 1 ? 's' : '') : 'Todo en orden') + (S.raros.length ? ' · ' + S.raros.length + ' cosa' + (S.raros.length > 1 ? 's' : '') + ' rara' + (S.raros.length > 1 ? 's' : '') : '') + '</small></div></div>'
        + (foco ? '<p class="foco">Hoy nos enfocamos en <b>' + esc(focoN) + '</b> <button class="lnk" id="foco-c">cambiar</button></p>'
          : '<div class="preg"><b>¿Qué prioridad tenemos hoy?</b><div class="chips" id="focos">' + N.AREAS.map(([k, t]) => '<button data-foco="' + k + '">' + t + '</button>').join('') + '</div></div>')
        + (sig ? '<div class="sig n-' + sig.nivel + '"><small>Siguiente paso</small><b>' + esc(sig.titulo) + '</b><p>' + esc(sig.porque) + '</p><button class="b verde" data-paso="0">' + (sig.accion === 'cuadre' ? 'Cuadrar ahora' : sig.manual ? 'Ver' : 'Hacerlo ahora') + ' →</button></div>'
          : '<div class="sig ok"><small>Siguiente paso</small><b>Nada urgente. Buen momento para vender.</b><p>Contesta solicitudes y manda fotos de mesas entregadas.</p></div>')
        + (P.length > 1 ? '<ol class="cola">' + P.slice(1, 6).map((p, i) => paso(p, i + 1)).join('') + '</ol>' : '')
        + (P.length > 6 ? plegable('Ver los otros ' + (P.length - 6), '', '<ol class="cola">' + P.slice(6).map((p, i) => paso(p, i + 6)).join('') + '</ol>') : '')
        + '<div class="socio-b"><button class="b chico" id="ag-n">＋ Tarea</button><a class="lnk" href="#v/agenda">Agenda completa ›</a></div>'
      + '</section>'
      + avisoPush()
      + '<section class="kpis">' + kpi('Dinero hoy', pesos(T.caja), T.caja < 0 ? 'r' : '', Object.entries(T.porQuien).filter(([, v]) => v).map(([q, v]) => esc(q) + ' ' + pesos(v)).join(' · '), '#dinero', 'hero')
        + kpi('Nos deben', pesos(T.porCobrar), 'v', '', '#pedidos') + kpi('Debemos', T.sinDeudas ? 'Sin anotar' : pesos(T.debemos), T.sinDeudas ? 'a' : 'r', '', '#pedidos/deudas')
        + kpi('Falta gastar', pesos(T.porGastar), '', '', '#pedidos') + kpi('Posición real', pesos(T.posicion), cls(T.posicion), '', '#dinero') + '</section>' + lineaCuadre(T)
      + (S.consejos.length ? plegable('💡 Consejos del socio', S.consejos.length + '', '<ul class="consejos">' + S.consejos.map(c => '<li><b>' + esc(c.t) + '</b><small>' + esc(c.d) + '</small></li>').join('') + '</ul>', true) : '')
      + (S.raros.length ? plegable('⚠ Cosas raras', S.raros.length + '', '<p class="nota">Datos que no concuerdan. Tócalos para revisarlos.</p><ul class="nocuadra">' + S.raros.map(itemNoCuadra).join('') + '</ul>', false, 'mal') : '')
      + (sem.length ? plegable('Esta semana', sem.length + '', '<ul class="agenda">' + sem.map(itemAgenda).join('') + '</ul>') : '');
    { const al = PZ.alertasHTML(true), so = $('.socio'); if (al && so) { so.insertAdjacentHTML('afterend', al); PZ.enlazarAlertas(); } }
    $('#x-todo').onclick = () => hoja('Exportar todo', '<p class="nota">Todo lo del sistema en un archivo, para los socios.</p><button class="b negro grande" id="x-pdf">PDF</button><button class="b grande" id="x-xls">Excel</button>', h => { $('#x-pdf', h).onclick = () => { cerrarHoja(); pdfGeneral(); }; $('#x-xls', h).onclick = () => { cerrarHoja(); xlsGeneral(); }; });
    $('#ag-n').onclick = () => tarea(); $('#cuadre').onclick = () => cuadrarBanco();
    $$('[data-paso]').forEach(b => b.onclick = () => { const p = P[+b.dataset.paso]; if (!p) return; if (p.accion === 'cuadre') cuadrarBanco(); else if (p.href) location.hash = p.href; else if (p.manual) location.hash = '#v/agenda'; });
    $$('[data-foco]').forEach(b => b.onclick = () => ponerFoco(b.dataset.foco));
    if ($('#foco-c')) $('#foco-c').onclick = () => hoja('Prioridad de hoy', '<p class="nota">¿En qué nos enfocamos hoy? Lo de esa área sube al principio de la lista.</p><div class="chips grandes">' + N.AREAS.map(([k, t]) => '<button data-foco2="' + k + '"' + (k === foco ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div>', h => { $$('[data-foco2]', h).forEach(b => b.onclick = () => { cerrarHoja(); ponerFoco(b.dataset.foco2); }); });
    enlazarAgenda(); enlazarNC(); enlazarPush();
  }
  function ponerFoco(k) { guardarYa(() => A.nodoAgrega('dinero/bitacora', { accion: 'Prioridad del día', valor: k, dia: hoy(), detalle: 'Hoy nos enfocamos en ' + ((N.AREAS.find(a => a[0] === k) || [])[1] || k) }), 'Listo: hoy nos enfocamos en ' + ((N.AREAS.find(a => a[0] === k) || [])[1] || k)); }

  // ---------- avisos al iPhone (notificaciones push) ----------
  const VAPID = 'BBu3yk2spGhkcGZ8VzUv_nuQA5FewT3sbRDDc1Z3vskuSvWisKDyDz6zl06F4PDfNna88fk9IhEAf_3-5-CoQvY';
  const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function estadoPush() {
    if (A.demo) return 'demo';
    if (esIOS() && !instalada()) return 'instalar';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no';
    if (Notification.permission === 'denied') return 'bloqueado';
    try { if (Notification.permission === 'granted' && localStorage.getItem('dkas-push') === '1') return 'activo'; } catch (e) {}
    return 'apagado';
  }
  function avisoPush() {
    const e = estadoPush(); let oculto = false; try { oculto = localStorage.getItem('dkas-push-oculto') === hoy(); } catch (x) {}
    if (e === 'activo' || e === 'demo' || e === 'no' || oculto) return '';
    return '<div class="push-card"><i>🔔</i><span><b>' + (e === 'bloqueado' ? 'Los avisos están bloqueados' : 'Activa los avisos en este teléfono') + '</b><small>' + (e === 'instalar' ? 'Primero agrega el panel a tu pantalla de inicio.' : e === 'bloqueado' ? 'Ve a Ajustes del iPhone → Notificaciones → DKAS.' : 'Tu socio te avisa qué sigue, cobros, cosas raras y el cuadre del banco.') + '</small></span><button class="b negro chico" id="push-on">' + (e === 'instalar' ? 'Cómo' : 'Activar') + '</button><button class="x" id="push-x" aria-label="Ahora no">✕</button></div>';
  }
  function enlazarPush() {
    if ($('#push-on')) $('#push-on').onclick = () => activarPush();
    if ($('#push-x')) $('#push-x').onclick = () => { try { localStorage.setItem('dkas-push-oculto', hoy()); } catch (e) {} ruta(); };
  }
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  const ab64 = b => btoa(String.fromCharCode.apply(null, new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function activarPush() {
    const e = estadoPush();
    if (e === 'instalar') return hoja('Activar avisos en el iPhone', '<ol class="pasos-ins"><li>Abre <b>dkas.mx/taller.html</b> en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> (el cuadrito con la flecha ↑).</li><li>Elige <b>"Agregar a inicio"</b> y luego <b>Agregar</b>.</li><li>Abre el panel desde el ícono nuevo <b>DKAS</b> de tu pantalla.</li><li>Vuelve a tocar <b>Activar avisos</b> y acepta.</li></ol><p class="nota">Apple solo deja mandar avisos a las apps que están en la pantalla de inicio.</p>', () => {});
    if (e === 'bloqueado') return hoja('Avisos bloqueados', '<p class="nota">El iPhone tiene bloqueados los avisos del panel. Ve a <b>Ajustes → Notificaciones → DKAS</b> y activa "Permitir notificaciones". Luego vuelve aquí.</p>', () => {});
    if (e === 'no') return aviso('Este navegador no permite avisos', true);
    // el iPhone solo muestra la pregunta si se pide en el mismo toque, antes de cualquier espera
    const pidiendo = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    let paso = 'pedir permiso';
    try {
      const perm = await pidiendo;
      if (perm !== 'granted') { if (perm === 'denied') hoja('Avisos bloqueados', '<p class="nota">El iPhone guardó que no quieres avisos del panel. Para activarlos: <b>Ajustes del iPhone → Notificaciones → DKAS → Permitir notificaciones</b>. Luego vuelve aquí y toca Activar otra vez.</p>', () => {}); else aviso('No salió la pregunta. Toca Activar otra vez.', true); return; }
      paso = 'registrar el servicio'; const reg = await navigator.serviceWorker.register('panel-sw.js');
      paso = 'esperar el servicio'; await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('tardó demasiado')), 12000))]);
      paso = 'suscribir'; let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) });
      paso = 'guardar en el sistema';
      const id = ab64(new TextEncoder().encode(sub.endpoint).slice(-24)).replace(/[^A-Za-z0-9_-]/g, '').slice(-30) || String(Date.now());
      await A.nodoPon('dinero/push/subs/' + id, { endpoint: sub.endpoint, p256dh: ab64(sub.getKey('p256dh')), auth: ab64(sub.getKey('auth')), quien: me.nombre || '', equipo: esIOS() ? 'iPhone' : 'Computadora', creado: Date.now() });
      try { localStorage.setItem('dkas-push', '1'); localStorage.setItem('dkas-push-id', id); } catch (x) {}
      reg.showNotification('DKAS · Avisos activados', { body: 'Listo. Tu socio te va a avisar qué sigue.', icon: 'img/panel-icono.png', data: { url: 'taller.html#inicio' } });
      aviso('Avisos activados en este teléfono'); ruta();
    } catch (x) {
      const det = 'Paso: ' + paso + ' · ' + (x.name || '') + ': ' + (x.message || x) + ' · ' + (navigator.userAgent.match(/OS [d_]+/) || [''])[0] + (instalada() ? ' · app instalada' : ' · navegador');
      bitacora('Avisos: no se activaron', det);
      hoja('No se activaron los avisos', '<p class="nota">Ya quedó anotado el detalle para revisarlo:</p><p class="aviso">' + esc(det) + '</p>', () => {});
    }
  }
  async function probarPush() {
    try { const reg = await navigator.serviceWorker.ready; const S = M.socio(focoHoy(), new Date().getHours()), p = S.pasos[0]; reg.showNotification(p ? 'Siguiente paso' : 'DKAS', { body: p ? p.titulo : 'Todo en orden', icon: 'img/panel-icono.png', data: { url: 'taller.html' + (p && p.href ? p.href : '#inicio') } }); } catch (e) { aviso('No se pudo: ' + e.message, true); }
  }

  // ---------- cuadrar el banco: lo que dice Tkash vs lo que dice el sistema ----------
  function ultimoCuadre() { return Object.values(D.bitacora || {}).filter(x => x.accion === 'Cuadre de banco' && x.sistema != null).sort((a, b) => (b.creado || 0) - (a.creado || 0))[0]; }
  function lineaCuadre(T) {
    const banco = T.porMetodo.Banco, u = ultimoCuadre(), hoyU = u && N.ymd(new Date(u.creado)) === hoy();
    const ok = u && hoyU && u.banco === u.sistema && u.sistema === banco;
    const txt = !u ? 'Nunca se ha cuadrado. Toca para comparar con tu banco.'
      : ok ? 'Cuadró al peso hoy ' + new Date(u.creado).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) + ' ✓'
      : u.banco !== u.sistema ? 'El último cuadre NO cuadró por ' + pesos(Math.abs(u.banco - u.sistema)) + '. Toca para revisar.'
      : u.sistema !== banco ? 'Hubo movimientos después del último cuadre. Toca para cuadrar otra vez.'
      : 'Último cuadre ' + fC(N.ymd(new Date(u.creado))) + '. Toca para cuadrar hoy.';
    return '<button class="cuadre ' + (ok ? 'ok' : u && u.banco !== u.sistema ? 'mal' : 'pend') + '" id="cuadre"><i>' + (ok ? '✓' : '⇄') + '</i><span><b>Banco (Tkash) según el sistema</b><small>' + esc(txt) + '</small></span><em>' + pesos(banco) + '</em></button>';
  }
  function cuadrarBanco() {
    const sis = M.totales().porMetodo.Banco;
    hoja('Cuadrar con el banco', '<p class="nota">Abre Tkash y escribe el saldo exacto que te sale ahorita. El sistema te dice si falta registrar algo.</p>'
      + '<dl class="conf"><dt>El sistema dice</dt><dd>' + pesos(sis) + '</dd></dl>'
      + '<label class="campo monto">¿Cuánto dice tu banco?<input id="cb-b" inputmode="decimal" placeholder="$0"></label><div id="cb-r"></div>', h => {
      const inp = $('#cb-b', h), res = $('#cb-r', h);
      const pintar = () => {
        const v = N.num(inp.value); if (!inp.value.trim()) { res.innerHTML = ''; return; }
        const dif = Math.round((v - sis) * 100) / 100;
        res.innerHTML = dif === 0 ? '<p class="ok-g">✓ Cuadra al peso. Todo lo del banco está registrado.</p><button class="b negro grande" id="cb-g">Guardar cuadre</button>'
          : '<p class="aviso mal-g">' + (dif < 0 ? 'En el banco hay <b>' + pesos(-dif) + ' MENOS</b>. Falta registrar una <b>salida</b> (un pago, un gasto o una comisión).' : 'En el banco hay <b>' + pesos(dif) + ' MÁS</b>. Falta registrar una <b>entrada</b> (un pago de cliente, un préstamo…).') + '</p>'
            + '<p class="nota">Revisa en Tkash los movimientos desde el último cuadre y registra el que falta. Ojo: si le pagaste a alguien a quien le debíamos, elige <b>"Pagar una deuda"</b> para que la deuda baje. Anotar que debemos algo NO saca dinero del banco; pagarlo sí.</p>'
            + '<button class="b negro grande" id="cb-reg">Registrar ' + (dif < 0 ? 'salida' : 'entrada') + ' de ' + pesos(Math.abs(dif)) + '</button><button class="b grande" id="cb-g">Guardar cuadre así (queda marcado que no cuadró)</button>';
        const g = $('#cb-g', h); if (g) g.onclick = () => guardarYa(() => A.nodoAgrega('dinero/bitacora', { accion: 'Cuadre de banco', detalle: 'Banco ' + pesos(v) + ' · sistema ' + pesos(sis) + (dif ? ' · NO cuadra por ' + pesos(Math.abs(dif)) : ' · cuadra'), banco: v, sistema: sis }).then(cerrarHoja), dif ? 'Cuadre guardado: no cuadra por ' + pesos(Math.abs(dif)) : 'Cuadre guardado: cuadra al peso');
        const r = $('#cb-reg', h); if (r) r.onclick = () => registrar(null, { tipo: dif < 0 ? 'out' : 'in', monto: Math.abs(dif), metodo: 'Transferencia' });
      };
      inp.oninput = pintar; setTimeout(() => inp.focus(), 40);
    });
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
    const tabs = '<nav class="tabs">' + [['pedidos', 'Pedidos', T.act.length], ['solicitudes', 'Solicitudes', solicitudesN()], ['clientes', 'Clientes', M.clientes.length], ['deudas', 'Deudas', M.deudas.length]].map(([k, t, n]) => '<a href="#pedidos' + (k === 'pedidos' ? '' : '/' + k) + '"' + (k === tab ? ' class="on"' : '') + '>' + t + ' <small>' + n + '</small></a>').join('') + '</nav>';
    if (tab === 'clientes') {
      const l = M.clientes.map(c => [c, M.statsCliente(c)]).sort((a, b) => b[1].activos - a[1].activos || (a[0].nombre || '').localeCompare(b[0].nombre || ''));
      main.innerHTML = tit('Pedidos', '', '<button class="b negro" id="nuevo">＋ Nuevo</button>') + tabs
        + '<section class="caja">' + (l.length ? '<div class="lista">' + l.map(([c, s]) => '<a class="fila fila-a" href="#c=' + esc(c.id) + '"><span class="fila-c"><b>' + esc(c.nombre) + (s.frecuente ? ' ' + pill('frecuente', 'v') : '') + '</b><small>' + s.ps.length + ' pedido' + (s.ps.length === 1 ? '' : 's') + (s.activos ? ' · ' + s.activos + ' activo' + (s.activos === 1 ? '' : 's') : '') + (c.telefono ? ' · ' + esc(c.telefono) : '') + '</small></span><span class="fila-d"><small>Pagó ' + pesos(s.pagado) + '</small><small>' + (s.debe ? 'Debe <b>' + pesos(s.debe) + '</b>' : '<span class="v">Al corriente</span>') + '</small></span></a>').join('') + '</div>' : vacioTxt('Sin clientes.')) + '</section>';
    } else if (tab === 'deudas') {
      const l = M.deudas.map(x => [x, M.statsDeuda(x)]).sort((a, b) => b[1].falta - a[1].falta);
      main.innerHTML = tit('Pedidos', '', '<button class="b negro" id="nueva-d">＋ Deuda</button>') + tabs
        + '<section class="kpis tres">' + kpi('Debemos en total', T.sinDeudas ? 'Sin anotar' : pesos(T.debemos), T.sinDeudas ? 'a' : 'r') + kpi('Nos han prestado', pesos(l.reduce((a, [, s]) => a + s.prestado, 0))) + kpi('Ya pagamos', pesos(l.reduce((a, [, s]) => a + s.pagado, 0)), 'v') + '</section>'
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
      main.innerHTML = tit('Pedidos', '', '<button class="b negro" id="nuevo">＋ Nuevo</button>') + tabs
        + '<div class="chips filtros">' + [['activos', 'Activos'], ['cobrar', 'Por cobrar'], ['atrasados', 'Atrasados'], ['finalizados', 'Finalizados'], ['todos', 'Todos']].map(([k, t]) => '<button data-f="' + k + '">' + t + '</button>').join('') + '</div>'
        + '<section class="caja"><div class="lista" id="lista-p"></div></section>';
      $$('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; pintar(); });
      pintar();
    }
    if ($('#nuevo')) $('#nuevo').onclick = () => alta();
  }

  function pedido(p) {
    const s = M.statsPedido(p), c = M.cli(p.cliente) || {}, cs = M.statsCliente(c), fin = s.pasos[5].done && s.pasos[6].done;
    const filas = N.COST.map(([k, n]) => { const e = !vacio((p.costos || {})[k]) ? num(p.costos[k]) : null, r = s.real[k]; if (e == null && !r) return ''; const d = r - (e || 0);
      return '<tr><td>' + esc(n) + '</td><td>' + (e != null ? pesos(e) : '<span class="a">pendiente</span>') + '</td><td>' + (r ? pesos(r) : '—') + '</td><td class="' + (e != null && r ? (d > 0 ? 'r' : 'v') : '') + '">' + (e != null && r ? (d > 0 ? '+' : '') + pesos(d) : e != null ? 'por gastar' : '') + '</td></tr>'; }).join('');
    const deDonde = Object.entries(s.deDonde), aOtros = Object.entries(s.aOtros);
    const nc = M.noCuadra().filter(x => x.ref && x.ref.pedido === p.id);
    const tablaCostos = filas ? '<div class="tabla"><table><thead><tr><th>Concepto</th><th>Estimado</th><th>Real</th><th>Dif.</th></tr></thead><tbody>' + filas + '</tbody><tfoot><tr><td>Total</td><td>' + (s.costo ? pesos(s.costo) : '—') + '</td><td>' + pesos(s.sal) + '</td><td class="' + (s.costo && s.sal > s.costo ? 'r' : '') + '">' + (s.costo ? (s.sal > s.costo ? '+' : '') + pesos(s.sal - s.costo) : '—') + '</td></tr></tfoot></table></div>' : vacioTxt('Sin costos todavía.');
    const dinero2 = '<h3>Gastos de esta mesa, pagados con</h3>' + (deDonde.length ? '<ul class="fondos">' + deDonde.map(([f, v]) => '<li><span>' + (f ? esc(M.nomFondo(f)) : '<span class="a">sin decir de qué dinero</span>') + '</span><b>' + pesos(v) + '</b></li>').join('') + '</ul>' : vacioTxt('Sin gastos.'))
      + '<h3>Su dinero se usó para</h3>' + (aOtros.length ? '<ul class="fondos">' + aOtros.map(([k, v]) => '<li><span>' + (k === 'gen' ? 'Gastos generales' : k.slice(0, 2) === 'p:' ? 'Pedido de ' + esc(M.nomPed(k.slice(2))) : 'Pagar a ' + esc((M.deu(k.slice(2)) || {}).nombre || '')) + '</span><b class="r">' + pesos(v) + '</b></li>').join('') + '</ul>' : vacioTxt('Solo su propia mesa.'));
    main.innerHTML = '<a class="volver" href="#pedidos">‹ Pedidos</a>'
      + tit(esc(c.nombre || 'Sin cliente') + ' <span class="folio">#' + esc(p.folio || '—') + '</span>', esc(piezaTxt(p)) + (p.entrega ? ' · entrega ' + fC(p.entrega) : ''), '<div class="tit-b"><button class="b negro" id="reg">＋ Dinero</button><button class="b" id="mas">•••</button></div>')
      + (s.fallas.length ? '<p class="aviso r">⚠ Reposición por falla: ' + esc(s.fallas[s.fallas.length - 1].motivo || '') + ' (' + fC(s.fallas[s.fallas.length - 1].fecha) + ') · pérdida ' + pesos(s.perdida) + '</p>' : '')
      + PZ.avisoPedido(p)
      + '<section class="kpis cuatro">' + kpi('Precio', s.precio ? pesos(s.precio) : 'Pendiente', s.precio ? '' : 'a') + kpi('Pagó', pesos(s.ent), 'v') + kpi('Debe', s.porCobrar != null ? pesos(Math.max(s.porCobrar, 0)) : '—', s.porCobrar > 0 ? 'r' : '') + kpi('Ganancia', s.ganancia != null ? pesos(s.ganancia) : '—', s.ganancia != null ? cls(s.ganancia) : '', s.margen != null ? pct(s.margen) : '') + '</section>'
      + '<section class="caja seg ' + (p.cerrado ? 'ok' : '') + '"><div class="caja-t"><h2>' + (p.cerrado ? 'Finalizado ✓' : esc(s.estado)) + '</h2><span class="sub">' + s.hechos + ' de 7</span></div>'
        + '<ol class="cola">' + s.pasos.map((x, i) => '<li class="' + (x.done ? 'si' : '') + (s.actual === x ? ' ya' : '') + '"><i>' + (x.done ? '✓' : i + 1) + '</i><span><b>' + esc(x.n) + '</b><small>' + (x.done ? (x.fecha ? fC(x.fecha) : 'hecho') : 'pendiente') + '</small></span>'
          + (p.cerrado || (x.done && !(p.pasos || {})[x.k]) ? '' : x.auto ? (x.k === 'pedido' ? '' : '<button class="b chico" data-cob="1">Cobrar</button>') : '<button class="b chico" data-paso="' + x.k + '">' + ((p.pasos || {})[x.k] ? 'Quitar' : x.done ? 'Fecha' : 'Marcar') + '</button>') + '</li>').join('') + '</ol>'
        + (p.cerrado ? '<button class="b" id="reabrir">Reabrir pedido</button>' : fin ? '<button class="b verde grande" id="finalizar">Finalizar pedido ✓</button>' : '') + '</section>'
      + ((p.piezas || []).length ? '<section class="caja"><div class="caja-t"><h2>Las mesas de este pedido</h2><span class="sub">' + p.piezas.length + '</span></div><ol class="cola">' + p.piezas.map((x, i) => '<li><i>' + (i + 1) + '</i><span><b>' + esc(x.n || 'Mesa') + ' · ' + medMesa(x) + ' cm' + (num(x.a) ? ' × ' + num(x.a) + ' cm de alto' : '') + '</b><small>Piedra: ' + esc(x.piedra || 'pendiente') + '</small></span></li>').join('') + '</ol></section>' : '')
      + (s.pend.length ? plegable('Datos pendientes', s.pend.length + '', '<p class="a">' + s.pend.map(esc).join(' · ') + '</p><button class="b chico" data-edit2="1">Completar</button>', false, 'pend') : '')
      + (nc.length ? plegable('⚠ No cuadra', nc.length + '', '<ul class="nocuadra">' + nc.map(itemNoCuadra).join('') + '</ul>', false, 'mal') : '')
      + plegable('Movimientos', s.ms.length + '', s.ms.length ? '<div class="lista">' + s.ms.slice().reverse().map(filaMov).join('') + '</div>' : vacioTxt('Sin movimientos.'))
      + plegable('Costos', s.costo ? pesos(s.sal) + ' de ' + pesos(s.costo) : pesos(s.sal), tablaCostos)
      + plegable('De dónde salió el dinero', '', dinero2)
      + plegable('Formato de pedido', '', specsHTML(p, c) + '<button class="b chico" id="fp" style="margin-top:12px">PDF del formato</button>')
      + (p.notas ? plegable('Notas', '', '<p class="notas">' + esc(p.notas) + '</p>') : '')
      + (cs.frecuente ? plegable('Cliente frecuente', cs.ps.length + ' pedidos', '<p>Pagó ' + pesos(cs.pagado) + ' en total · debe ' + pesos(cs.debe) + '. <a class="lnk" href="#c=' + esc(c.id) + '">Ver su perfil</a></p>') : '')
      + PZ.seccionPedido(p);
    $('#mas').onclick = () => hoja('Más opciones', '<button class="b grande" id="o-ed">Editar pedido</button><button class="b grande" id="o-fp">PDF del formato de pedido</button>' + (p.cerrado ? '' : '<button class="b rojo-b grande" id="o-fa">⚠ Falla técnica / reponer</button>') + (s.fallas.length ? '<button class="b grande" id="o-sob">Guardar pedazos rotos como sobrante</button>' : ''), h => {
      $('#o-ed', h).onclick = () => { cerrarHoja(); alta(p); }; $('#o-fp', h).onclick = () => { cerrarHoja(); pdfFormato(p); };
      if ($('#o-fa', h)) $('#o-fa', h).onclick = () => { cerrarHoja(); hojaFalla(p, s); }; if ($('#o-sob', h)) $('#o-sob', h).onclick = () => { cerrarHoja(); PZ.agregar(null, { tipo: 'sobrante', piedra: otra(p.color, p.colorOtra) || '', pedido: p.id }); }; });
    $('#reg').onclick = () => registrar(null, { pedido: p.id }); $$('[data-edit2]').forEach(b => b.onclick = () => alta(p));
    $$('[data-cob]').forEach(b => b.onclick = () => registrar(null, { tipo: 'in', origen: 'pedido', pedido: p.id }));
    $$('[data-paso]').forEach(b => b.onclick = () => marcarPaso(p, b.dataset.paso));
    $('#fp').onclick = () => pdfFormato(p);
    if ($('#finalizar')) $('#finalizar').onclick = async () => { if (!await clave('Finalizar pedido', [['Pedido', M.nomPedido(p)], ['Cobrado', pesos(s.ent)], ['Gastado', pesos(s.sal)], ['Ganancia real', pesos(s.ent - s.sal)]])) return; await guardarYa(() => A.nodoCambia('dinero/pedidos/' + p.id, { cerrado: true }), 'Pedido finalizado', 'Finalizó ' + M.nomPedido(p)); };
    if ($('#reabrir')) $('#reabrir').onclick = async () => { if (!await clave('Reabrir pedido', [['Pedido', M.nomPedido(p)]])) return; await guardarYa(() => A.nodoCambia('dinero/pedidos/' + p.id, { cerrado: false }), 'Pedido reabierto', 'Reabrió ' + M.nomPedido(p)); };
    enlazarMovs(); enlazarNC(); PZ.enlazarPedido(p); PZ.enlazarAlertas();
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
      ['2 · Tipo, forma y medidas', [['Forma', P_(p.forma)], ['Uso', P_(otra(p.tipo, p.tipoOtra))], ].concat((p.piezas || []).length ? p.piezas.map((x, i) => ['Mesa ' + (i + 1), mesaTxt(x)]) : [['Medidas', P_(med)], ['Altura', num(p.altura) ? num(p.altura) + ' cm' : 'pendiente']]).concat([ ['Cuántas', String((p.piezas || []).length || num(p.cantidad) || 1)]])],
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

  // ================= SOLICITUDES (lo que piden en dkas.mx) =================
  let SOL = null, filSol = 'nuevo';
  const solicitudesN = () => SOL ? SOL.filter(x => x.estado === 'nuevo' && !M.pedidos.some(p => p.solicitud === x.id)).length : '';
  const spec = (x, k) => { const it = (x.items || [])[0] || {}; const f = (it.specs || []).find(z => z[0] === k); return f ? f[1] : ''; };
  async function solicitudes() {
    const T = M.totales();
    const tabs = '<nav class="tabs">' + [['pedidos', 'Pedidos', T.act.length], ['solicitudes', 'Solicitudes', ''], ['clientes', 'Clientes', M.clientes.length], ['deudas', 'Deudas', M.deudas.length]].map(([k, t, n]) => '<a href="#pedidos' + (k === 'pedidos' ? '' : '/' + k) + '"' + (k === 'solicitudes' ? ' class="on"' : '') + '>' + t + (n !== '' ? ' <small>' + n + '</small>' : '') + '</a>').join('') + '</nav>';
    main.innerHTML = tit('Pedidos', '') + tabs + '<div class="chips filtros" id="fs">' + [['nuevo', 'Por cotizar'], ['cotizado', 'Esperan respuesta'], ['todas', 'Todas']].map(([k, t]) => '<button data-v="' + k + '"' + (filSol === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '<a class="b chico" href="#v/clientes">Por aprobar y diseños ›</a></div><section class="caja"><div class="lista" id="sl"><p class="cargando">Cargando…</p></div></section>';
    $$('#fs [data-v]').forEach(b => b.onclick = () => { filSol = b.dataset.v; $$('#fs [data-v]').forEach(o => o.classList.toggle('on', o === b)); pintar(); });
    try { SOL = await A.listar(); } catch (e) { $('#sl').innerHTML = '<p class="err">No se pudieron cargar: ' + esc(e.message) + '</p>'; return; }
    function pintar() {
      if (!SOL) return;
      const ya = id => M.pedidos.find(p => p.solicitud === id);
      const l = SOL.filter(x => x.estado !== 'cancelado' && (filSol === 'todas' || x.estado === filSol)).sort((a, b) => (b.creado || 0) - (a.creado || 0));
      $('#sl').innerHTML = l.length ? l.map(x => { const it = (x.items || [])[0] || {}, p = ya(x.id), tel = String(x.tel || '').replace(/\D/g, ''), d = new Date(x.creado || 0);
        return '<div class="fila"><div class="fila-a sol"><span class="fila-c"><b>' + esc(x.nombre || 'Sin nombre') + ' <span class="folio">#' + esc(x.folio || '') + '</span></b><small>' + esc(it.titulo || 'Sin mesa') + [spec(x, 'Piedra').split(' · ')[0], spec(x, 'Base')].filter(Boolean).map(z => ' · ' + esc(z)).join('') + '</small><small>' + d.getDate() + ' ' + MES[d.getMonth()] + (tel ? ' · ' + esc(x.tel) : '') + '</small></span></div>'
          + '<div class="fila-r sol-b">' + (tel ? '<a class="b chico" target="_blank" rel="noopener" href="https://wa.me/52' + tel.slice(-10) + '">WhatsApp</a>' : '') + '<a class="b chico" href="#v/p=' + esc(x.id) + '">Cotizar</a>' + (p ? '<a class="b chico verde" href="#p=' + esc(p.id) + '">Pedido #' + esc(p.folio) + '</a>' : '<button class="b chico negro" data-pasar="' + esc(x.id) + '">Pasar a pedido</button>') + '</div></div>'; }).join('') : vacioTxt('Nada aquí.');
      $$('[data-pasar]').forEach(b => b.onclick = () => pasarAPedido(SOL.find(x => x.id === b.dataset.pasar)));
    }
    pintar();
    const n = $$('.tabs a')[1]; if (n) n.innerHTML = 'Solicitudes <small>' + solicitudesN() + '</small>';
  }
  // una solicitud de la página se vuelve pedido: el formato ya sale lleno con lo que escogió el cliente
  function pasarAPedido(x) {
    const med = spec(x, 'Medidas'), nums = (med.match(/\d+(?:\.\d+)?/g) || []).map(Number), red = /Ø/.test(med) || /redond/i.test(spec(x, 'Forma'));
    const forma = (C.FORMAS.find(f => new RegExp(f.slice(0, 5), 'i').test(spec(x, 'Forma'))) || (red ? 'Redonda' : '')), uso = C.TIPOS.find(t => new RegExp(t, 'i').test(spec(x, 'Uso'))) || '';
    const piedraTxt = spec(x, 'Piedra').split(' · ')[0], piedra = C.PIEDRAS.find(pi => pi.toLowerCase() === piedraTxt.toLowerCase());
    const tel = String(x.tel || '').replace(/\D/g, '').slice(-10), cli = M.clientes.find(c => String(c.telefono || '').replace(/\D/g, '').slice(-10) === tel && tel);
    const p0 = { solicitud: x.id, forma, tipo: uso, largo: nums[0] || '', ancho: red ? '' : (nums[1] || ''), altura: num(spec(x, 'Altura')) || '', cantidad: num((x.items || [])[0] && x.items[0].cantidad) || 1,
      material: 'Piedra sinterizada', color: piedra || (piedraTxt ? 'Otra' : ''), colorOtra: piedra ? '' : piedraTxt, base: spec(x, 'Base') ? 'Otra' : '', baseOtra: spec(x, 'Base'), pintura: spec(x, 'Color de base'),
      notas: 'Viene de la solicitud #' + (x.folio || '') + ' de dkas.mx: ' + ((x.items || [])[0] || {}).titulo };
    alta(p0, cli ? cli.id : null, cli ? null : { nombre: x.nombre || '', telefono: x.tel || '' });
  }

  // ================= DINERO =================
  let perDin = 'mes', filDin = 'todos', qDin = '', verTodos = false;
  function dinero() {
    const T = M.totales(), h = hoy(), y = h.slice(0, 4), mes = h.slice(0, 7), pm = (() => { const d = new Date(+y, +h.slice(5, 7) - 2, 1); return N.ymd(d).slice(0, 7); })();
    const enPer = m => perDin === 'todo' || (perDin === 'mes' ? m.fecha.slice(0, 7) === mes : perDin === 'pasado' ? m.fecha.slice(0, 7) === pm : m.fecha.slice(0, 4) === y);
    const ms = M.movs.filter(enPer), e = ms.filter(N.esIn).reduce((a, m) => a + num(m.monto), 0), sa = ms.filter(m => !N.esIn(m) && (m.fondo || '').slice(0, 3) !== 'pd:').reduce((a, m) => a + num(m.monto), 0);
    const cats = Object.entries(ms.filter(m => !N.esIn(m)).reduce((o, m) => { o[m.cat || 'Otro'] = (o[m.cat || 'Otro'] || 0) + num(m.monto); return o; }, {})).sort((a, b) => b[1] - a[1]), totC = cats.reduce((a, [, v]) => a + v, 0);
    const fondos = M.fondos().filter(f => f.saldo || M.movs.some(m => m.fondo === f.f));
    const ganancias = T.ps.filter(([, s]) => s.ent || s.sal || s.precio);
    main.innerHTML = tit('Dinero', '', '<button class="b negro" id="reg-d">＋ Registrar</button>')
      + '<section class="kpis">' + kpi('Dinero hoy', pesos(T.caja), T.caja < 0 ? 'r' : '', Object.entries(T.porQuien).filter(([, v]) => v).map(([q, v]) => 'Lo tiene ' + esc(q) + ' ' + pesos(v)).join(' · '), '', 'hero')
        + kpi('Ganancia esperada', T.conG ? pesos(T.ganEsp) : '—', cls(T.ganEsp), T.conG ? 'margen ' + pct(T.margenProm) : '') + kpi('Pérdidas', pesos(T.perdidas), T.perdidas ? 'r' : '', 'por fallas') + '</section>'
      + '<section class="caja"><div class="chips filtros" id="per">' + [['mes', 'Este mes'], ['pasado', 'Mes pasado'], ['anio', 'Este año'], ['todo', 'Todo']].map(([k, t]) => '<button data-v="' + k + '"' + (perDin === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div>'
        + '<div class="kpis tres sin">' + kpi('Entró', pesos(e), 'v') + kpi('Salió', pesos(sa), 'r') + kpi('Quedó', pesos(e - sa), cls(e - sa)) + '</div></section>'
      + plegable('En qué se fue', pesos(totC), cats.length ? '<ul class="barras">' + cats.map(([k, v]) => '<li><span>' + esc(k) + '</span><i><em style="width:' + Math.max(2, v / totC * 100) + '%"></em></i><b>' + pesos(v) + '</b></li>').join('') + '</ul>' : vacioTxt('Sin salidas en este periodo.'))
      + plegable('Ganancia por pedido', '', ganancias.length ? '<div class="tabla"><table><thead><tr><th>Pedido</th><th>Precio</th><th>Cobrado</th><th>Gastado</th><th>Ganancia</th></tr></thead><tbody>'
          + ganancias.map(([p, s]) => { const g = p.cerrado ? s.gananciaReal : s.ganancia; return '<tr><td><a href="#p=' + esc(p.id) + '">' + esc(M.nomPedido(p)) + '</a></td><td>' + (s.precio ? pesos(s.precio) : '—') + '</td><td>' + pesos(s.ent) + '</td><td>' + pesos(s.sal) + '</td><td class="' + (g != null ? cls(g) : '') + '">' + (g != null ? pesos(g) : '—') + '</td></tr>'; }).join('')
          + '</tbody><tfoot><tr><td>Gastos generales</td><td></td><td></td><td>' + pesos(T.gastoGeneral) + '</td><td class="r">' + pesos(-T.gastoGeneral) + '</td></tr></tfoot></table></div>' : vacioTxt('Sin pedidos con dinero.'))
      + plegable('De quién es el dinero', '', '<p class="nota">Cada cliente y cada préstamo es una "bolsa". En negativo = se usó dinero de otro.</p>' + (fondos.length ? '<ul class="fondos">' + fondos.map(f => '<li><span>' + esc(f.nombre) + '</span><b class="' + cls(f.saldo) + '">' + pesos(f.saldo) + '</b></li>').join('') + '</ul>' : vacioTxt('Sin bolsas.')))
      + plegable('Dinero anterior', 'archivo', '<p class="nota">Gastos e ingresos que se anotaron antes del sistema nuevo, solo para consultar.</p><a class="b chico" href="#v/dinero-anterior">Abrir el archivo</a>')
      + '<section class="caja"><div class="caja-t"><h2>Movimientos</h2><input id="q" type="search" placeholder="Buscar" value="' + esc(qDin) + '"></div><div class="chips filtros" id="fil">' + [['todos', 'Todos'], ['in', 'Entradas'], ['out', 'Salidas'], ['aclarar', 'Aclarar · ' + T.porAclarar]].map(([k, t]) => '<button data-v="' + k + '"' + (filDin === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div><div class="lista" id="movs"></div></section>';
    const pintar = () => { const q = qDin.trim().toLowerCase(); const l = M.movs.filter(m => (filDin === 'todos' || (filDin === 'aclarar' ? m.revisar : m.tipo === filDin)) && (!q || [m.cat, m.nota, m.quien, M.nomPed(m.pedido), (M.deu(m.deuda) || {}).nombre].join(' ').toLowerCase().includes(q))).slice().reverse();
      $('#movs').innerHTML = l.length ? l.slice(0, verTodos ? l.length : 12).map(filaMov).join('') + (l.length > 12 && !verTodos ? '<button class="b chico" id="ver-todos" style="margin-top:10px">Ver los ' + l.length + '</button>' : '') : vacioTxt('Nada aquí.'); enlazarMovs(); const vt = $('#ver-todos'); if (vt) vt.onclick = () => { verTodos = true; pintar(); }; };
    $$('#per [data-v]').forEach(b => b.onclick = () => { perDin = b.dataset.v; dinero(); });
    $$('#fil [data-v]').forEach(b => b.onclick = () => { filDin = b.dataset.v; $$('#fil [data-v]').forEach(o => o.classList.toggle('on', o === b)); pintar(); });
    $('#q').oninput = e => { qDin = e.target.value; pintar(); };
    $('#reg-d').onclick = () => registrar(); pintar();
  }
  function filaMov(m) {
    const de = m.pedido ? M.nomPed(m.pedido) : m.deuda ? ((M.deu(m.deuda) || {}).nombre || '') : 'General', i = N.esIn(m);
    const cred = !i && (m.fondo || '').slice(0, 3) === 'pd:';
    return '<button class="mov ' + (i ? 'in' : 'out') + '" data-mov="' + esc(m.id) + '"><i>' + (i ? '+' : '−') + '</i><span><b>' + (m.revisar ? pill('aclarar', 'a') + ' ' : '') + (cred ? pill('se debe · no salió dinero', 'a') + ' ' : '') + esc(m.cat || '') + ' · ' + esc(de) + '</b><small>' + (cred ? [M.nomFondo(m.fondo), m.nota] : [m.quien, m.metodo || 'sin decir cómo', !i ? 'de: ' + M.nomFondo(m.fondo) : '', m.nota]).filter(Boolean).map(esc).join(' · ') + '</small></span><em>' + (i ? '+' : '−') + pesos(m.monto).replace('−', '') + '<small>' + fC(m.fecha) + '</small></em></button>';
  }
  function enlazarMovs() { $$('[data-mov]').forEach(b => b.onclick = () => registrar(M.movs.find(m => m.id === b.dataset.mov))); }

  // ================= SOBRANTES =================
  let medDisp = '';
  function sobrantes() {
    const disp = M.sobrantes.filter(s => s.estado !== 'usado'), usados = M.sobrantes.filter(s => s.estado === 'usado');
    const porPiedra = {}; disp.forEach(s => { (porPiedra[s.piedra || 'Sin piedra'] = porPiedra[s.piedra || 'Sin piedra'] || []).push(s); });
    const area = disp.reduce((a, s) => a + num(s.w) * num(s.h), 0) / 10000;
    const T = M.totales(), tabs = '<nav class="tabs">' + [['pedidos', 'Pedidos', T.act.length], ['solicitudes', 'Solicitudes', solicitudesN()], ['clientes', 'Clientes', M.clientes.length], ['deudas', 'Deudas', M.deudas.length], ['sobrantes', 'Sobrantes', disp.length]].map(([k, t, n]) => '<a href="#pedidos' + (k === 'pedidos' ? '' : '/' + k) + '"' + (k === 'sobrantes' ? ' class="on"' : '') + '>' + t + ' <small>' + n + '</small></a>').join('') + '</nav>';
    main.innerHTML = tit('Pedidos', '', '<button class="b negro" id="ns">＋ Sobrante</button>') + tabs
      + '<section class="caja"><h2>¿Me alcanza?</h2><div class="dos-i"><input id="mq" placeholder="Medida, ej. 60×60 o Ø70" value="' + esc(medDisp) + '"><span id="mr" class="sub"></span></div><p class="nota">' + area.toFixed(2) + ' m² de piedra guardada en ' + disp.length + ' sobrantes. <a class="lnk" href="#v/piedra">Inventario de placas completas ›</a></p></section>'
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
    return plegable('Sobrantes de su placa', ya.length ? ya.length + '' : '', (ya.length ? '<div class="sobs">' + ya.map(tarjetaSobrante).join('') + '</div>' : '<p class="nota">De una placa de 320×160 cortando ' + num(p.largo) + '×' + num(p.ancho) + ' sobran:</p><div class="chips">' + sug.map((r, i) => '<button data-sug="' + i + '">＋ ' + r.w + ' × ' + r.h + ' cm</button>').join('') + '</div>'));
  }
  function enlazarSobrantesPedido(p) { const sug = N.sobrantesDe(num(p.largo), p.forma === 'Redonda' ? num(p.largo) : num(p.ancho)); $$('[data-sug]').forEach(b => b.onclick = () => hojaSobrante(null, Object.assign({ piedra: otra(p.color, p.colorOtra), pedido: p.id }, sug[+b.dataset.sug]))); $$('.sobs [data-usar]').forEach(b => b.onclick = () => usarSobrante(M.sobrantes.find(s => s.id === b.dataset.usar))); }

  // ================= LO DEL PANEL VIEJO, DENTRO DEL NUEVO =================
  // cada pantalla vieja vive en uno de los 4 botones; se abre aquí mismo, sin los botones de arriba del panel viejo
  const VIEJAS = { agenda: ['inicio', 'Agenda completa', '#inicio'], clientes: ['pedidos', 'Solicitudes · por aprobar y diseños', '#pedidos/solicitudes'], piedra: ['piedras', 'Inventario de placas (anterior)', '#piedras'],
    'dinero-anterior': ['dinero', 'Dinero anterior (archivo)', '#dinero'], cotizar: ['ajustes', 'Cotizador rápido', '#ajustes'], precios: ['ajustes', 'Precios', '#ajustes'], taller: ['ajustes', 'Mesas en el taller', '#ajustes'],
    bases: ['ajustes', 'Diseñar bases', '#ajustes'], estudio: ['ajustes', 'Estudio de diseño', '#ajustes'], portada: ['ajustes', 'Presentación de la página', '#ajustes'], visitas: ['ajustes', 'Auditoría y bloqueos', '#ajustes'],
    accesos: ['ajustes', 'Links de acceso al 3D', '#ajustes'], equipo: ['ajustes', 'Administradores', '#ajustes'], '': ['pedidos', 'Pedidos web', '#pedidos/solicitudes'] };
  const claveVieja = r0 => /^p=|^t=/.test(r0) ? 'cotiz' : /^piedra/.test(r0) ? 'piedra' : r0;
  function seccionVieja(r0) { const k = claveVieja(r0); return k === 'cotiz' ? 'pedidos' : (VIEJAS[k] || ['ajustes'])[0]; }
  function viejo(r0) {
    const k = claveVieja(r0), v = k === 'cotiz' ? ['pedidos', 'Cotizar', '#pedidos/solicitudes'] : VIEJAS[k] || ['ajustes', 'Panel', '#ajustes'];
    main.innerHTML = '<a class="volver" href="' + v[2] + '">‹ ' + ({ inicio: 'Dashboard', pedidos: 'Pedidos', piedras: 'Piedras', dinero: 'Dinero', ajustes: 'Ajustes' }[v[0]]) + '</a><h1 class="h-viejo">' + esc(v[1]) + '</h1>'
      + '<iframe class="viejo" src="panel-viejo.html?embed=1#' + esc(r0) + '" title="' + esc(v[1]) + '"></iframe>';
  }

  // ================= AJUSTES =================
  function ajustes() {
    const bit = Object.entries(D.bitacora || {}).map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => (b.creado || 0) - (a.creado || 0));
    main.innerHTML = tit('Ajustes', esc(me.nombre || '') + (A.demo ? ' · modo prueba (no toca datos reales)' : ''), '<button class="b" id="salir">Salir</button>')
      + plegable('Ventas', 'cotizar y precios', '<ul class="links"><li><a href="#piedras/cliente">Cotizar al cliente<small>PDF para mandar</small></a></li><li><a href="#piedras/cotizar">Calculadora de precios</a></li><li><a href="#piedras/precios">Precios<small>editables</small></a></li><li><a href="#v/cotizar">Cotizador anterior</a></li></ul>', true)
      + plegable('Taller', 'mesas, bases y diseño', '<ul class="links"><li><a href="#v/taller">Mesas en el taller<small>cortes, croquis y orden de compra</small></a></li><li><a href="#v/bases">Diseñar bases</a></li><li><a href="#v/estudio">Estudio de diseño</a></li></ul>')
      + plegable('Página web', 'portada, visitas y links', '<ul class="links"><li><a href="#v/portada">Presentación de la página</a></li><li><a href="#v/visitas">Auditoría y bloqueos<small>quién entra a dkas.mx</small></a></li><li><a href="#v/accesos">Links de acceso al 3D</a></li></ul>')
      + plegable('Avisos al teléfono', { activo: 'activados', apagado: 'apagados', instalar: 'falta instalar', bloqueado: 'bloqueados', no: 'no disponible', demo: 'modo prueba' }[estadoPush()], '<p class="nota">Tu socio te manda avisos: en la mañana la prioridad del día, al mediodía lo que sigue, en la noche el cuadre del banco, y al momento cuando alguien registra dinero o aparece algo raro.</p>' + (estadoPush() === 'activo' ? '<p class="ok-g">✓ Activados en este teléfono</p><button class="b grande" id="push-prueba">Mandar aviso de prueba</button>' : '<button class="b negro grande" id="push-aj">Activar avisos aquí</button>'), estadoPush() !== 'activo')
      + plegable('Equipo', 'quién entra al panel', '<ul class="links"><li><a href="#v/equipo">Administradores</a></li></ul><p class="nota">Todo lo importante pide la clave 55 antes de guardarse. Para entrar al panel se usa el código de 6 números.</p>')
      + plegable('Registro de cambios', bit.length + '', (bit.length ? '<div class="tabla"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th></tr></thead><tbody>' + bit.slice(0, 200).map(b => { const d = new Date(b.creado || 0); return '<tr><td>' + fC(N.ymd(d)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</td><td>' + esc(b.por || '') + '</td><td><b>' + esc(b.accion) + '</b><br><small>' + esc(b.detalle || '') + '</small></td></tr>'; }).join('') + '</tbody></table></div>' : vacioTxt('Todavía no hay nada registrado.')));
    $('#salir').onclick = () => { A.logout(); location.hash = ''; arrancar(); };
    if ($('#push-aj')) $('#push-aj').onclick = () => activarPush(); if ($('#push-prueba')) $('#push-prueba').onclick = () => probarPush();
  }

  // ================= REGISTRAR DINERO (lo central: todo se conecta aquí) =================
  function registrar(ed, pre) {
    pre = pre || {};
    const d = ed ? { tipo: ed.tipo, monto: String(ed.monto), cat: ed.cat || '', fecha: ed.fecha, quien: ed.quien || '', metodo: ed.metodo || '', nota: ed.nota || '', pedido: ed.pedido || '', deuda: ed.deuda || '', fondo: ed.fondo || '',
      origen: ed.tipo === 'in' ? (ed.pedido ? 'pedido' : ed.deuda ? 'prestamo' : ed.revisar ? '' : 'otro') : '', para: ed.tipo === 'out' ? (ed.pedido ? 'pedido' : ed.deuda ? 'deuda' : ed.revisar ? '' : 'general') : '', nuevoPrest: '' }
      : { tipo: pre.tipo || '', monto: pre.monto ? String(pre.monto) : '', cat: '', fecha: hoy(), quien: (() => { try { return localStorage.getItem('dkas-quien') || ''; } catch (e) { return ''; } })(), metodo: pre.metodo || '', nota: pre.nota || '', pedido: pre.pedido || '', deuda: pre.deuda || '', fondo: '', origen: pre.origen || (pre.pedido && pre.tipo === 'in' ? 'pedido' : ''), para: pre.para || (pre.pedido ? 'pedido' : ''), nuevoPrest: '' };
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
          + (d.tipo === 'out' ? '<div class="campo">¿De qué dinero sale?' + chips('fondo', fondos.map(x => [x.f, x.nombre, 'hay ' + pesos(x.saldo)]).concat([['caja', 'Caja general', 'hay ' + pesos(M.saldoFondo('caja'))], ['pd:', 'A crédito / lo pagó alguien por nosotros', 'NO sale del banco: queda como deuda']]).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i), d.fondo.slice(0, 3) === 'pd:' ? 'pd:' : d.fondo)
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
        if (d.tipo === 'out') lin.push(['Sale de', fondo === 'pd:' ? 'A crédito: se le deberá a ' + nuevo + ' (nuevo)' : M.nomFondo(fondo)]);
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
  function alta(p0, cliId, cliPre) {
    p0 = p0 || {}; const w = JSON.parse(JSON.stringify(p0)); w.costos = w.costos || {}; w.pend = w.pend || {};
    if (!w.fecha) w.fecha = hoy(); if (!w.cantidad) w.cantidad = 1; if (!w.folio) w.folio = M.pedidos.reduce((m, p) => Math.max(m, num(p.folio)), 0) + 1;
    let cli = Object.assign({}, M.cli(w.cliente || cliId) || cliPre || {}), nuevoCli = !cli.id, paso = cli.id && !p0.id ? 1 : 0;
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
        + caja('medidas', 'Medidas finales (cm)', '<div class="tres-i">' + inp('largo', 'inputmode="decimal" placeholder="' + (red ? 'Diámetro' : 'Largo') + '" aria-label="Largo"') + (red ? '' : inp('ancho', 'inputmode="decimal" placeholder="Ancho" aria-label="Ancho"')) + inp('cantidad', 'inputmode="numeric" placeholder="Cuántas" aria-label="Cuántas"') + '</div><small class="nota">' + (red ? 'Diámetro' : 'Largo · ancho') + ' · cuántas, en cm (si pones 1.80 lo tomo como 180).</small>') + (PZ.medComunes(w) ? caja('', 'Medidas que más se venden (toca una)', PZ.medComunes(w)) : '')
        + caja('altura', 'Altura (cm)', inp('altura', 'inputmode="decimal" placeholder="75"') + '<button type="button" class="sug" data-pon="altura" data-val="75">Comedor estándar: 75 cm · usar</button>'); }
      if (paso === 3) return caja('material', 'Tipo de cubierta', ch('material', C.MATERIALES, 'materialOtro')) + caja('marca', 'Marca / proveedor', inp('marca', 'maxlength="60" placeholder="ej. Quarmol"')) + caja('color', 'Color / piedra', ch('color', C.PIEDRAS, 'colorOtra', 'Nombre de la piedra'))
        + caja('acabado', 'Acabado', ch('acabado', C.ACABADOS)) + caja('canto', 'Tipo de canto', ch('canto', C.CANTOS, 'cantoOtro', 'ej. Pulido'))
        + '<div class="dos-i">' + caja('espesor', 'Espesor (mm)', inp('espesor', 'inputmode="decimal" placeholder="12"') + (w.material === 'Piedra sinterizada' && !w.espesor ? '<button type="button" class="sug" data-pon="espesor" data-val="12">Sinterizada: 12 mm · usar</button>' : '')) + caja('refuerzo', 'Refuerzo inferior', ch('refuerzo', C.SINO)) + '</div>'
        + caja('', 'Observaciones (opcional)', area('obsCubierta', 'ej. canto pulido')) + caja('', 'De mis piedras (stock)', PZ.stockAlta(w));
      if (paso === 4) return caja('base', 'Diseño de la base', ch('base', C.BASES, 'baseOtra', 'ej. especial, Base Maestra')) + caja('pintura', 'Color de pintura', inp('pintura', 'maxlength="40" placeholder="ej. Negro"')) + caja('pacabado', 'Acabado de pintura', ch('pacabado', C.ACABADOS))
        + caja('ptipo', 'Tipo de pintura', inp('ptipo', 'maxlength="40" placeholder="ej. Electrostática"')) + '<div class="dos-i">' + caja('niveladores', 'Niveladores', ch('niveladores', C.SINO)) + caja('placasm', 'Placas de montaje', ch('placasm', C.SINO)) + '</div>' + caja('', 'Observaciones (opcional)', area('obsBase'));
      if (paso === 5) { const co = costoW(), sug = co ? Math.ceil(co * N.REGLA / 100) * 100 : null;
        return caja('precio', 'Precio de venta total', inp('precio', 'inputmode="decimal" class="grande" placeholder="$0"') + (sug ? '<button type="button" class="sug" data-pon="precio" data-val="' + sug + '">Con la regla ×1.6 serían ' + pesos(sug) + ' · usar</button>' : ''))
          + caja('anticipo', 'Anticipo acordado', inp('anticipo', 'inputmode="decimal" placeholder="$0"') + (num(w.precio) ? '<button type="button" class="sug" data-pon="anticipo" data-val="' + num(w.precio) / 2 + '">Usar el 50%: ' + pesos(num(w.precio) / 2) + '</button>' : '')) + caja('', 'Notas (opcional)', area('notas')); }
      const sg = N.costosSugeridos(w), f = sg.fraccion;
      return '<p class="nota">' + (num(w.largo) ? 'Con esas medidas usa ' + (f === 0.25 ? '¼ de placa' : f === 0.5 ? 'media placa' : f === 1 ? 'una placa' : f + ' placas') + ' de 320×160.' : 'Pon las medidas para calcular la placa.') + '</p><button type="button" class="b" id="calc">Calcular costos sugeridos</button>'
        + '<div class="dos-i">' + N.COST.map(([k, n]) => caja(k === 'otros' ? '' : 'c_' + k, n + (k === 'otros' ? ' (opcional)' : ''), inp(k, 'inputmode="decimal" placeholder="' + (sg[k] ? pesos(sg[k]) : '$0') + '"', w.costos))).join('') + '</div>'
        + '<p class="nota">Sugeridos con los costos del negocio: placa $9,000 + $500 de corte, corte ala de avión $3,500, MDF y demás $1,500, base de comedor $6,000–7,000, flete $2,000 si no cabe en la minivan. Si un costo no aplica, pon 0.</p>';
    }
    const leer = h => {
      $$('[data-k]', h).forEach(i => { const k = i.dataset.k, v = i.value.trim(); w[k] = NUMS.includes(k) ? (v === '' ? '' : ['largo', 'ancho', 'altura'].includes(k) ? PZ.cm(v) : num(v)) : v; });
      $$('[data-ck]', h).forEach(i => { const v = i.value.trim(); w.costos[i.dataset.ck] = v === '' ? '' : num(v); });
      if ($('#c-nom', h)) { cli.nombre = $('#c-nom', h).value.trim(); cli.telefono = $('#c-tel', h).value.trim(); cli.email = $('#c-em', h).value.trim(); cli.direccion = $('#c-dir', h).value.trim(); }
    };
    const faltan = () => paso === 6 ? [] : N.CAMPOS.filter(([pp, k]) => pp === paso && !N.lleno(paso === 0 ? cli : w, k) && !w.pend[k]).map(x => x[1]);
    hoja(p0.id ? 'Editar pedido' : 'Nuevo pedido', '<div id="al"></div>', h => {
      const pintar = () => {
        $('#al', h).innerHTML = '<div class="pasos-w">' + PASOS_ALTA.map((x, i) => '<span class="' + (i <= paso ? 'on' : '') + '"></span>').join('') + '</div><p class="eti">' + (paso + 1) + ' de ' + PASOS_ALTA.length + ' · ' + PASOS_ALTA[paso] + '</p>'
          + cuerpo() + '<p class="err" id="a-err" hidden></p>' + vivo()
          + '<div class="botones">' + (paso > 0 ? '<button class="b" id="atras">← Atrás</button>' : '') + (paso < PASOS_ALTA.length - 1 ? '<button class="b negro" id="sig">Siguiente →</button>' : '<button class="b negro" id="ok">' + (p0.id ? 'Guardar cambios' : 'Dar de alta') + '</button>') + '</div>'
          + (p0.id && paso < PASOS_ALTA.length - 1 ? '<button class="b verde grande" id="ok">Guardar cambios ya</button>' : '')
          + (p0.id && paso === 0 ? '<button class="b rojo" id="borrar">Borrar este pedido</button>' : '');
        $$('#a-cli [data-v]', h).forEach(b => b.onclick = () => { leer(h); if (b.dataset.v === 'nuevo') { cli = {}; nuevoCli = true; } else { cli = Object.assign({}, M.cli(b.dataset.v)); nuevoCli = false; } pintar(); });
        $$('[data-g]', h).forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; leer(h); w[g.dataset.g] = b.dataset.v; delete w.pend[g.dataset.g]; pintar(); const o = /^Otr[ao]$/.test(b.dataset.v) && $('.otra', h); if (o) o.focus(); });
        $$('[data-nt]', h).forEach(b => b.onclick = () => { leer(h); const k = b.dataset.nt; if (w.pend[k]) delete w.pend[k]; else w.pend[k] = true; pintar(); });
        $$('#a-stock [data-v]', h).forEach(b => b.onclick = e => { e.stopPropagation(); leer(h); const s = PZ.pieza(b.dataset.v); if (w.stock === s.id) delete w.stock; else { w.stock = s.id; w.color = 'Otra'; w.colorOtra = s.piedra; delete w.pend.color; } pintar(); });
        $$('[data-med]', h).forEach(b => b.onclick = () => { leer(h); const [a, c] = b.dataset.med.split(','); w.largo = +a; w.ancho = w.forma === 'Redonda' ? '' : +c; if (!num(w.altura)) w.altura = PZ.altoDe(w.tipo); delete w.pend.medidas; delete w.pend.altura; pintar(); });
        $$('[data-pon]', h).forEach(b => b.onclick = () => { leer(h); w[b.dataset.pon] = num(b.dataset.val); delete w.pend[b.dataset.pon]; pintar(); });
        $$('input,textarea', h).forEach(i => i.addEventListener('input', () => { leer(h); const v = $('.vivo', h); if (v) v.outerHTML = vivo(); }));
        if ($('#calc', h)) $('#calc', h).onclick = () => { leer(h); const sg = N.costosSugeridos(w); N.COST.forEach(([k]) => { if (vacio(w.costos[k])) w.costos[k] = sg[k]; }); pintar(); aviso('Costos sugeridos puestos: corrígelos con lo real'); };
        if ($('#atras', h)) $('#atras', h).onclick = () => { leer(h); paso--; pintar(); h.scrollTop = 0; };
        const validar = () => { leer(h); if (paso === 0 && !cli.nombre) { marcar([], true); return false; } const f = faltan(); if (!f.length) return true; marcar(f); return false; };
        const marcar = (f, sinNom) => { $$('.campo-a', h).forEach(el => el.classList.toggle('falta', f.includes(el.dataset.req) || (sinNom && !!el.querySelector('#c-nom')))); const e = $('#a-err', h); e.hidden = false;
          e.textContent = sinNom ? 'Escribe el nombre del cliente.' : 'Faltan ' + f.length + ' dato(s). Llénalos o toca "No lo tengo aún" y quedan pendientes.'; const x = $('.campo-a.falta', h); if (x) x.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
        if ($('#sig', h)) $('#sig', h).onclick = () => { if (validar()) { paso++; pintar(); h.scrollTop = 0; } };
        if ($('#ok', h)) $('#ok', h).onclick = async () => {
          // al editar se guarda al momento: lo que falte queda como pendiente solo (no frena)
          if (p0.id && cli.nombre) { leer(h); N.CAMPOS.forEach(([pp, k]) => { if (!N.lleno(pp === 0 ? cli : w, k)) w.pend[k] = true; }); } else if (!validar()) return;
          Object.keys(w.pend).forEach(k => { if (N.lleno(['telefono', 'direccion'].includes(k) ? cli : w, k)) delete w.pend[k]; });
          const pd = {}; ['solicitud', 'folio', 'fecha', 'entrega', 'vendedor', 'vendedorOtro', 'forma', 'tipo', 'tipoOtra', 'largo', 'ancho', 'cantidad', 'altura', 'material', 'materialOtro', 'marca', 'color', 'colorOtra', 'acabado', 'canto', 'cantoOtro', 'espesor', 'refuerzo', 'obsCubierta', 'base', 'baseOtra', 'pintura', 'pacabado', 'ptipo', 'niveladores', 'placasm', 'obsBase', 'precio', 'anticipo', 'notas', 'piezas', 'stock'].forEach(k => { pd[k] = vacio(w[k]) ? null : w[k]; });
          pd.costos = Object.fromEntries(N.COST.map(([k]) => [k, vacio(w.costos[k]) ? null : num(w.costos[k])])); const pl = Object.fromEntries(Object.keys(w.pend).filter(k => w.pend[k]).map(k => [k.replace(/[.#$\[\]\/]/g, '_'), true])); pd.pend = Object.keys(pl).length ? pl : null;
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

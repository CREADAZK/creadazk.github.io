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

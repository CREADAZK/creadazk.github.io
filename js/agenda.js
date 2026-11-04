/* DKAS · Mi agenda (pantalla principal del panel) + Dinero.
   Escribes lo que sea, como lo dirías ("gasté 3,500 en la placa de Ana", "llamar a Pedro mañana a las 5",
   "me pagaron 8 mil de anticipo #1005") y el sistema entiende si es un pendiente, un gasto o un ingreso,
   encuentra el pedido, la fecha, la hora y la categoría, te pide lo que falte y lo apunta donde va:
   · pendiente → agenda/ (y una nota en el historial del pedido)
   · ingreso de un pedido → pagos/ de ese pedido (avanza solo: anticipo → Confirmado)
   · ingreso suelto → ingresos/ · gasto → gastos/ (ligado a su pedido si se sabe)
   Además junta lo que el sistema ya sabe (entregas, clientes por cotizar, saldos) en la misma lista del día. */
(function () {
  let X = null; // contexto que pasa el panel (init)
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sin = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ms = v => typeof v === 'number' ? v : Date.parse(v) || 0;
  const pesos = n => '$' + Math.round(+n || 0).toLocaleString('es-MX');
  let tareas = [], gastos = [], ingresos = [], sols = [], vista = 'agenda', mes = '', verHechos = false, editando = null, draft = null, toco = {}, tEnt = 0;

  // ---------- entender lo que se escribe ----------
  const DIAS_S = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, veinte: 20 };
  const CAT_G = [
    ['Piedra', /\b(piedra|placa|placas|sinterizad\w*|cubierta|corte de piedra|marmol|cuarzo)\b/],
    ['Herrería', /\b(herrer\w*|base|bases|soldad\w*|ptr|acero|fierro|metal|electrostatic\w*|pintura de la base)\b/],
    ['MDF y madera', /\b(mdf|madera|triplay|aglomerado)\b/],
    ['Flete y gasolina', /\b(flete|fletes|envio|gasolina|uber|didi|camioneta|transporte|caseta\w*|estacionamiento|mudanza)\b/],
    ['Sueldos y ayudantes', /\b(sueldo\w*|nomina|raya|ayudante\w*|maniobra\w*|mano de obra|instalador\w*|chalan\w*|propina\w*)\b/],
    ['Taller y servicios', /\b(renta|luz|agua|internet|telefono|celular|local|bodega|taller|predial|limpieza)\b/],
    ['Publicidad', /\b(publicidad|anuncio\w*|facebook|instagram|meta|google|ads|catalogo|impresion\w*|tarjetas|lona|volantes|pagina|dominio)\b/],
    ['Herramienta y material', /\b(herramienta\w*|disco\w*|lija\w*|pegamento|silicon\w*|tornillo\w*|material|resina|pulid\w*|broca\w*|cinta)\b/],
    ['Comida', /\b(comida|desayuno|cena|cafe|tacos|refresco\w*|agua para)\b/],
    ['Impuestos y banco', /\b(impuesto\w*|sat|iva|isr|contador|comision\w*|banco)\b/]
  ];
  const CATS_G = CAT_G.map(c => c[0]).concat(['Otros gastos']);
  const CATS_I = ['Anticipo', 'Abono', 'Liquidación', 'Venta', 'Otro ingreso'];
  const METODOS = ['Transferencia', 'Efectivo', 'Tarjeta'];
  const MATERIAL = ['Piedra', 'Herrería', 'MDF y madera', 'Flete y gasolina', 'Sueldos y ayudantes'];
  const TIPOS_T = [['llamar', 'Llamar', /\b(llamar\w*|marcar\w*|hablar\w* (a|con)|telefonear)\b/], ['mensaje', 'Mensaje', /\b(whats\w*|wa|mensaje|escribir\w*|mandar\w*|enviar\w*|contestar\w*)\b/],
    ['cita', 'Cita', /\b(cita|visita\w*|ir a|ir con|medir|junta|reunion|ver a)\b/], ['entrega', 'Entrega', /\b(entregar\w*|instalar\w*|llevar\w* la mesa|entrega)\b/],
    ['cobrar', 'Cobrar', /\b(cobrar\w*|cobranza)\b/], ['pagar', 'Pagar', /\b(pagar\w*|depositar\w*|transferir\w*)\b/], ['comprar', 'Comprar', /\b(comprar\w*|pedir\w* (la|el|las|los)? ?(piedra|placa|mdf|material)|surtir)\b/]];
  const TIPO_N = Object.fromEntries(TIPOS_T.map(x => [x[0], x[1]]).concat([['pendiente', 'Pendiente']]));
  const INF = /\b(pagar|cobrar|comprar|llamar|marcar|mandar|enviar|ir|visitar|entregar|instalar|recoger|revisar|cotizar|hablar|escribir|agendar|medir|preguntar|confirmar|hacer|terminar|pedir|recordar|checar|buscar|llevar|traer|depositar|transferir)\b/;
  const ING_V = /\b(me pagaron|me pago|me deposito|me depositaron|cobre|recibi|me dieron|me dio|me transfirio|me transfirieron|me abono|abonaron|abono|liquido|liquidaron|vendi|vendimos|entraron|entro|nos pagaron|nos pago|nos deposito|nos depositaron|dejo de anticipo|dejaron de anticipo|dio de anticipo|dieron de anticipo|ingreso|ingresaron)\b/;
  const GAS_V = /\b(gaste|gastamos|gasto|pague|pagamos|compre|compramos|me cobraron|nos cobraron|le pague|le pagamos|se pago|se le pago|deposite|transferi|le di|le dimos|di)\b/;

  function fechaMas(n) { return X.hoy(n); }
  function fechaDe(d) { const z = new Date(d - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
  function entender(txt, base) {
    const r = { tipo: 'pendiente', texto: String(txt || '').trim() }; let t = ' ' + sin(txt).replace(/\s+/g, ' ') + ' ';
    const quita = m => { t = t.replace(m, ' '); };
    // pedido por folio
    let m = t.match(/(?:#|\bpedido\s*#?|\bfolio\s*#?)\s*(\d{3,6})\b/);
    if (m) { const p = X.todos().find(q => String(q.folio) === m[1]); if (p) r.pedido = p.id; quita(m[0]); }
    // hora
    m = t.match(/\b(?:a las|a la|alas|como a las|tipo|antes de las|despues de las)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.\s?m\.?|p\.\s?m\.?|de la manana|de la tarde|de la noche|hrs|hr|h)?/) || t.match(/\b(\d{1,2}):(\d{2})\s*(am|pm|hrs|hr|h)?/) || t.match(/\b(\d{1,2})()\s*(am|pm|hrs)\b/);
    if (m) { let h = +m[1]; const mi = m[2] ? +m[2] : 0, s = m[3] || ''; if (/p|tarde|noche/.test(s) && h < 12) h += 12; else if (/a\.?\s?m|manana/.test(s) && h === 12) h = 0; else if (!s && h >= 1 && h <= 7) h += 12;
      if (h < 24 && mi < 60) r.hora = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); quita(m[0]); }
    else if (/\bmedio ?dia\b/.test(t)) { r.hora = '12:00'; quita(/\bmedio ?dia\b/); }
    // urgente
    if (/\b(urgente|urge|urgentisimo|importante|asap|ya mismo|sin falta)\b|!!/.test(t)) { r.urgente = true; t = t.replace(/\b(urgente|urge|urgentisimo|importante|asap|ya mismo|sin falta)\b|!+/g, ' '); }
    // ¿ya pasó? (pagué, me pagaron…) o ¿hay que hacerlo? (pagar, llamar…)
    const pasoI = ING_V.test(t), pasoG = GAS_V.test(t), pasado = pasoI || pasoG || /\b(ayer|antier|antes de ayer)\b/.test(t);
    // fecha
    const d0 = new Date(fechaMas(0) + 'T12:00');
    if ((m = t.match(/\bpasado manana\b/))) { r.fecha = fechaMas(2); quita(m[0]); }
    else if ((m = t.match(/\b(antier|antes de ayer)\b/))) { r.fecha = fechaMas(-2); quita(m[0]); }
    else if ((m = t.match(/\bayer\b/))) { r.fecha = fechaMas(-1); quita(m[0]); }
    else if (/\bmanana\b/.test(t.replace(/\bla manana\b/g, ' '))) { r.fecha = fechaMas(1); t = t.replace(/\bla manana\b/g, ' ').replace(/\bmanana\b/, ' '); }
    else if ((m = t.match(/\b(hoy|ahorita|ahora)\b/))) { r.fecha = fechaMas(0); quita(m[0]); }
    if (!r.fecha && (m = t.match(/\b(?:el |este |esta |proximo |el proximo |la proxima |para el )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/))) {
      const w = DIAS_S.indexOf(m[1]), hw = d0.getDay(); let n = (w - hw + 7) % 7; if (pasado) n = n ? n - 7 : -7; else if (!n) n = 7; if (/proxim/.test(m[0]) && n < 7 && !pasado && n <= 2) n += 7 * 0;
      r.fecha = fechaMas(n); quita(m[0]);
    }
    if (!r.fecha && (m = t.match(/\ben (\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|diez|quince) (dia|dias|semana|semanas|mes|meses)\b/))) {
      const n = /^\d+$/.test(m[1]) ? +m[1] : NUM[m[1]]; r.fecha = fechaMas(n * (/semana/.test(m[2]) ? 7 : /mes/.test(m[2]) ? 30 : 1)); quita(m[0]);
    }
    if (!r.fecha && (m = t.match(/\b(la proxima semana|la otra semana|la semana que entra|la siguiente semana)\b/))) { r.fecha = fechaMas((8 - d0.getDay()) % 7 || 7); quita(m[0]); }
    if (!r.fecha && (m = t.match(/\bfin de mes\b/))) { r.fecha = fechaDe(new Date(d0.getFullYear(), d0.getMonth() + 1, 0, 12)); quita(m[0]); }
    if (!r.fecha && (m = t.match(/\b(este )?fin de semana\b/))) { r.fecha = fechaMas((6 - d0.getDay() + 7) % 7); quita(m[0]); }
    if (!r.fecha && (m = t.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/))) {
      let d = new Date(d0.getFullYear(), MESES.indexOf(m[2]), +m[1], 12); if (!pasado && d < d0 - 86400000 * 30) d.setFullYear(d.getFullYear() + 1); r.fecha = fechaDe(d); quita(m[0]);
    }
    if (!r.fecha && (m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)) && +m[2] <= 12 && +m[1] <= 31) {
      const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : d0.getFullYear(); r.fecha = fechaDe(new Date(y, +m[2] - 1, +m[1], 12)); quita(m[0]);
    }
    if (!r.fecha && (m = t.match(/\b(?:el|para el|este|el dia|para el dia|dia) (\d{1,2})\b(?!\s*(?:mil|k|pesos|\$|:|\d))/)) && +m[1] >= 1 && +m[1] <= 31) {
      let d = new Date(d0.getFullYear(), d0.getMonth(), +m[1], 12); if (!pasado && d < d0) d = new Date(d0.getFullYear(), d0.getMonth() + 1, +m[1], 12); if (pasado && d > d0) d = new Date(d0.getFullYear(), d0.getMonth() - 1, +m[1], 12); r.fecha = fechaDe(d); quita(m[0]);
    }
    // monto
    const aNum = s => { s = String(s).trim(); if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); return parseFloat(s.replace(/,/g, '')); };
    m = t.match(/\$\s*([\d][\d.,]*)\s*(k|mil)?(?:\s*(\d{1,3})\b)?/) || t.match(/\b(\d[\d.,]*)\s*(k|mil)\b(?:\s*(\d{1,3})\b)?/) || t.match(/\b(\d[\d.,]*)\s*(pesos|varos|mxn|mx)\b/);
    if (m) { let n = aNum(m[1]); if (/k|mil/.test(m[2] || '')) n = n * 1000 + (m[3] ? +m[3] : 0); if (n > 0) r.monto = Math.round(n * 100) / 100; quita(m[0]); }
    else if ((m = t.match(/\bmil\b(?:\s*(\d{1,3}))?/))) { r.monto = 1000 + (m[1] ? +m[1] : 0); quita(m[0]); }
    else { const ns = (t.match(/\b\d[\d.,]*\b/g) || []).map(aNum).filter(n => n >= 20); if (ns.length) r.monto = Math.max(...ns); }
    // pedido por el nombre del cliente
    if (!r.pedido) { const op = buscarCliente(t); if (op.length) { r.pedido = op[0].id; if (op.length > 1) r.opciones = op.slice(0, 4).map(p => p.id); } }
    if (base && base.pedido && !r.pedido) r.pedido = base.pedido;
    // ¿qué es?
    const catG = CAT_G.find(c => c[1].test(t)), inf = INF.test(t) && !pasado;
    const fuerteG = /\b(gaste|gastamos|pague|pagamos|compre|compramos|me cobraron|nos cobraron|le pague|le pagamos)\b/.test(t);
    if (pasoI && (r.monto || !inf)) r.tipo = 'ingreso';
    else if (pasoG && (r.monto || fuerteG)) r.tipo = 'gasto';
    else if (inf) r.tipo = 'pendiente';
    else if (r.monto) r.tipo = r.pedido && !catG && !/\b(gasto|compra|renta)\b/.test(t) ? 'ingreso' : (/\b(anticipo|abono|liquidacion|vendi|venta)\b/.test(t) ? 'ingreso' : 'gasto');
    if (r.tipo === 'gasto') r.categoria = catG ? catG[0] : 'Otros gastos';
    if (r.tipo === 'ingreso') {
      r.metodo = /\b(efectivo|cash|contado|billete\w*)\b/.test(t) ? 'Efectivo' : /\b(tarjeta|terminal|clip)\b/.test(t) ? 'Tarjeta' : 'Transferencia';
      const p = r.pedido && X.todos().find(q => q.id === r.pedido), n = p && X.numeros(p);
      r.categoria = /\banticipo\b/.test(t) ? 'Anticipo' : /\b(liquid\w*|saldo|resto|finiquit\w*)\b/.test(t) ? 'Liquidación' : /\babono\b/.test(t) ? 'Abono' : /\b(vendi|venta)\b/.test(t) ? 'Venta'
        : n ? (!n.pagado ? 'Anticipo' : r.monto >= n.pactado - n.pagado ? 'Liquidación' : 'Abono') : 'Otro ingreso';
    }
    if (r.tipo === 'pendiente') { const tt = TIPOS_T.find(x => x[2].test(t)); r.tarea = tt ? tt[0] : 'pendiente'; delete r.monto; }
    if (r.tipo !== 'pendiente') { delete r.hora; delete r.urgente; if (!r.fecha) r.fecha = fechaMas(0); }
    return r;
  }
  const NO_NOM = new Set(['mesa', 'base', 'piedra', 'placa', 'para', 'pago', 'pagar', 'cobrar', 'llamar', 'manana', 'hoy', 'herrero', 'anticipo', 'saldo', 'cliente', 'senor', 'senora', 'sr', 'sra', 'don', 'dona', 'que', 'con', 'del', 'los', 'las', 'una', 'uno']);
  function buscarCliente(t) {
    const pal = new Set(t.split(/[^a-z0-9ñ]+/).filter(w => w.length >= 3 && !NO_NOM.has(w)));
    const res = [];
    X.todos().forEach(p => {
      const ws = sin(p.nombre).split(/\s+/).filter(w => w.length >= 3 && !NO_NOM.has(w)); if (!ws.length) return;
      let s = ws.filter(w => pal.has(w)).length; if (!s) return; if (pal.has(ws[0])) s += 1;
      res.push({ p, s: s + (p.estado !== 'cancelado' && p.estado !== 'entregado' ? 0.5 : 0) + ms(p.creado) / 1e15 });
    });
    res.sort((a, b) => b.s - a.s);
    const top = res.length ? Math.floor(res[0].s) : 0;
    return res.filter(x => Math.floor(x.s) === top).map(x => x.p);
  }

  // ---------- lo que el sistema ya sabe: entregas, clientes, cobros ----------
  function delSistema() {
    const h = fechaMas(0), l = [];
    const ped = X.todos().filter(p => p.estado !== 'cancelado');
    ped.forEach(p => {
      const e = X.entrega(p), x = X.numeros(p), saldo = x.pactado - x.pagado;
      if (p.estado !== 'entregado' && e.f && e.d <= 7) l.push({ k: 'ent' + p.id, fecha: e.d < 0 ? h : e.f, tarde: e.d < 0, txt: (e.d < 0 ? 'Entrega atrasada ' + -e.d + ' d · ' : 'Entregar mesa de ') + p.nombre, sub: '#' + p.folio + ' · ' + X.sigue(p), ir: '#p=' + p.id, p, tipo: 'Entrega' });
      if (p.estado === 'confirmado' && x.pactado && x.pagado < Math.ceil(x.pactado / 2)) l.push({ k: 'ant' + p.id, fecha: h, txt: 'Cobrar anticipo a ' + p.nombre + ' · ' + pesos(Math.ceil(x.pactado / 2) - x.pagado), sub: '#' + p.folio, ir: '#p=' + p.id, p, tipo: 'Cobrar' });
      if (p.estado === 'entregado' && saldo > 0) l.push({ k: 'deb' + p.id, fecha: h, tarde: true, txt: p.nombre + ' te debe ' + pesos(saldo), sub: '#' + p.folio + ' · ya se entregó', ir: '#p=' + p.id, p, tipo: 'Cobrar' });
      if (p.estado === 'cotizado') { const c = p.cotizacion && p.cotizacion.enviada || p.actualizado; const dd = c ? Math.floor((Date.now() - ms(c)) / 86400000) : 0; if (dd >= 3) l.push({ k: 'seg' + p.id, fecha: h, txt: 'Darle seguimiento a ' + p.nombre, sub: '#' + p.folio + ' · tiene su cotización hace ' + dd + ' días', ir: '#p=' + p.id, p, tipo: 'Mensaje' }); }
    });
    const nuevos = ped.filter(p => p.estado === 'nuevo');
    if (nuevos.length) l.push({ k: 'nuevos', fecha: h, txt: nuevos.length === 1 ? 'Cotizarle a ' + nuevos[0].nombre : 'Cotizarle a ' + nuevos.length + ' clientes', sub: nuevos.slice(0, 4).map(p => p.nombre.split(' ')[0]).join(', ') + (nuevos.length > 4 ? '…' : ''), ir: '#clientes', tipo: 'Clientes' });
    const sp = sols.filter(s => s.estado === 'pendiente');
    if (sp.length) l.push({ k: 'sol', fecha: h, txt: sp.length === 1 ? 'Aprobar la solicitud de ' + sp[0].nombre : 'Aprobar ' + sp.length + ' solicitudes de acceso', sub: 'Quieren diseñar su mesa', ir: '#clientes', tipo: 'Clientes' });
    return l;
  }
  const urgente = t => !t.hecho && t.fecha && t.fecha <= fechaMas(0);
  function contar(l) {
    if (l) tareas = l;
    const n = tareas.filter(urgente).length + (X ? delSistema().filter(s => s.fecha <= fechaMas(0) && s.k.slice(0, 3) === 'ent').length : 0), b = $('#nb-age');
    if (b) { b.textContent = n; b.hidden = !n; }
  }

  // ---------- pantalla ----------
  async function cargar() {
    const [t, g, i, s] = await Promise.all([X.A.agenda(), X.A.gastos().catch(() => []), X.A.ingresos().catch(() => []), X.A.solicitudes().catch(() => [])]);
    tareas = t; gastos = g; ingresos = i; sols = s;
  }
  async function pantalla(v) {
    vista = v === 'dinero' ? 'dinero' : 'agenda'; if (!mes) mes = fechaMas(0).slice(0, 7);
    const main = X.main;
    if (!$('.ag2')) main.innerHTML = '<div class="ag2"><p class="sub">Cargando…</p></div>';
    try { await cargar(); } catch (e) { main.innerHTML = '<h1>Agenda</h1><p class="err">' + X.esc(e.message) + '</p>'; return; }
    pintar();
  }
  function pintar() {
    contar();
    const main = X.main, nom = String((X.me() || {}).nombre || 'Zury').split(' ')[0], hoyTxt = new Date(fechaMas(0) + 'T12:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
    const borr = $('#ag-tx') ? $('#ag-tx').value : '';
    main.innerHTML = '<div class="ag2"><div class="ag2-cab"><div><p class="ag2-fecha">' + hoyTxt + '</p><h1>Hola, ' + X.esc(nom) + '</h1><p class="sub" id="ag-res"></p></div>'
      + '<div class="ag2-tabs"><a href="#agenda"' + (vista === 'agenda' ? ' class="on"' : '') + '>Agenda</a><a href="#dinero"' + (vista === 'dinero' ? ' class="on"' : '') + '>Dinero</a></div></div>'
      + caja() + '<div id="ag-cuerpo"></div></div>';
    bindCaja(); if (borr && !editando) { $('#ag-tx').value = borr; leer(); }
    if (vista === 'agenda') pintarAgenda(); else pintarDinero();
  }

  // ---------- la caja: escribe lo que sea ----------
  function caja(pedido) {
    const voz = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    return '<div class="ag2-caja' + (pedido ? ' en-ped' : '') + '"><div class="ag2-in"><textarea id="ag-tx" rows="2" maxlength="400" placeholder="' + (pedido ? 'Algo de este pedido: «pagué 2,800 al herrero», «llamarle el viernes»…' : 'Escribe lo que pasó o lo que hay que hacer…') + '"></textarea>'
      + (voz ? '<button class="ag2-mic" id="ag-mic" aria-label="Dictar" title="Dictar"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' : '') + '</div>'
      + (pedido ? '' : '<div class="ag2-ej">' + ['Llamar a Pedro mañana a las 5', 'Gasté 3,500 en la placa', 'Me pagaron 8 mil de anticipo', 'Pagar la renta el día 1'].map(e => '<button data-ej="' + e + '">' + e + '</button>').join('') + '</div>')
      + '<div id="ag-ent" hidden></div></div>';
  }
  function bindCaja(pedido) {
    const tx = $('#ag-tx'); if (!tx) return;
    tx.oninput = () => { clearTimeout(tEnt); tEnt = setTimeout(() => leer(pedido), 220); };
    tx.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); const b = $('#ag-ok'); if (b) b.click(); } };
    $$('[data-ej]').forEach(b => b.onclick = () => { tx.value = b.dataset.ej; toco = {}; leer(pedido); tx.focus(); });
    const mic = $('#ag-mic'); if (mic) mic.onclick = () => {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition, r = new R(); r.lang = 'es-MX'; r.interimResults = false;
      mic.classList.add('on'); r.onresult = e => { tx.value = (tx.value ? tx.value.trim() + ' ' : '') + e.results[0][0].transcript; leer(pedido); };
      r.onend = r.onerror = () => mic.classList.remove('on'); try { r.start(); } catch (e) { mic.classList.remove('on'); }
    };
  }
  function leer(pedido) {
    const tx = $('#ag-tx'), el = $('#ag-ent'); if (!tx || !el) return;
    const v = tx.value.trim(); if (!v) { el.hidden = true; draft = null; return; }
    const r = entender(v, pedido ? { pedido: pedido.id } : null);
    if (!draft) draft = {}; const viejo = draft; draft = r;
    Object.keys(toco).forEach(k => { draft[k] = viejo[k]; });
    if (pedido) draft.pedido = pedido.id;
    pintarEnt(pedido);
  }
  const opsPed = sel => {
    const l = X.todos().filter(p => p.estado !== 'cancelado').sort((a, b) => ms(b.creado) - ms(a.creado)).slice(0, 80);
    return '<option value="">— Ninguno —</option>' + l.map(p => '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>#' + p.folio + ' · ' + X.esc(p.nombre) + ' (' + X.esc(X.A.estado(p.estado)) + ')</option>').join('');
  };
  const sel = (id, l, v) => '<select id="' + id + '">' + l.map(x => '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>';
  function pintarEnt(pedido) {
    const el = $('#ag-ent'), d = draft; el.hidden = false;
    const p = d.pedido && X.todos().find(q => q.id === d.pedido), h = fechaMas(0);
    const cuando = f => !f ? 'sin fecha' : f === h ? 'hoy' : f === fechaMas(1) ? 'mañana' : f === fechaMas(-1) ? 'ayer' : X.fechaCorta(f);
    const quien = p ? ' · <a href="#p=' + p.id + '">#' + p.folio + ' ' + X.esc(p.nombre) + '</a>' : '';
    const frase = d.tipo === 'gasto' ? 'Un <b>gasto</b>' + (d.monto ? ' de <b>' + pesos(d.monto) + '</b>' : '') + ' en <b>' + X.esc(d.categoria) + '</b>, ' + cuando(d.fecha) + quien
      : d.tipo === 'ingreso' ? 'Un <b>ingreso</b>' + (d.monto ? ' de <b>' + pesos(d.monto) + '</b>' : '') + ' · ' + X.esc(d.categoria).toLowerCase() + ' en ' + X.esc(d.metodo).toLowerCase() + ', ' + cuando(d.fecha) + quien
      : 'Un <b>pendiente</b>' + (d.tarea !== 'pendiente' ? ' (' + TIPO_N[d.tarea].toLowerCase() + ')' : '') + ' para <b>' + cuando(d.fecha) + '</b>' + (d.hora ? ' a las <b>' + d.hora.replace(/^0/, '') + '</b>' : '') + (d.urgente ? ' · <b class="r">urgente</b>' : '') + quien;
    const falta = [];
    if (d.tipo !== 'pendiente' && !d.monto) falta.push(['monto', d.tipo === 'gasto' ? '¿Cuánto fue?' : '¿Cuánto entró?']);
    if (d.tipo === 'ingreso' && !d.pedido && !toco.pedido) falta.push(['pedido', '¿De qué pedido es? (si no es de uno, déjalo en Ninguno)']);
    if (d.tipo === 'gasto' && !d.pedido && MATERIAL.includes(d.categoria) && !toco.pedido) falta.push(['pedido', '¿Para qué mesa fue? Así sabes cuánto te quedó de cada una (opcional)']);
    if (d.tipo === 'pendiente' && !d.fecha && !toco.fecha) falta.push(['fecha', '¿Para cuándo?']);
    if (d.opciones && !toco.pedido) falta.push(['pedido', 'Hay varios clientes con ese nombre, ¿cuál es?']);
    const f1 = '<label>Fecha<input type="date" id="e-f" value="' + (d.fecha || '') + '"></label>';
    const fP = '<label class="e-ped">Pedido<select id="e-p">' + opsPed(d.pedido) + '</select></label>';
    const campos = d.tipo === 'pendiente'
      ? '<div class="e-rap">' + [[h, 'Hoy'], [fechaMas(1), 'Mañana'], [fechaMas((8 - new Date(h + 'T12:00').getDay()) % 7 || 7), 'Próx. lunes'], ['', 'Sin fecha']].map(([f, t]) => '<button data-ef="' + f + '"' + ((d.fecha || '') === f && (f || toco.fecha) ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div>'
        + '<div class="e-g">' + f1 + '<label>Hora<input type="time" id="e-h" value="' + (d.hora || '') + '"></label><label>Tipo' + sel('e-t', Object.values(TIPO_N), TIPO_N[d.tarea]) + '</label>' + fP + '<label class="e-u"><input type="checkbox" id="e-u"' + (d.urgente ? ' checked' : '') + '> Urgente</label></div>'
      : '<div class="e-g"><label>Monto<input id="e-m" inputmode="decimal" value="' + (d.monto || '') + '" placeholder="$"></label>' + f1
        + '<label>' + (d.tipo === 'gasto' ? 'En qué' : 'Qué fue') + sel('e-c', d.tipo === 'gasto' ? CATS_G : CATS_I, d.categoria) + '</label>'
        + (d.tipo === 'ingreso' ? '<label>Cómo' + sel('e-me', METODOS, d.metodo) + '</label>' : '') + fP + '</div>';
    el.innerHTML = '<div class="agx ' + d.tipo + '"><div class="ent-top"><p class="ent-t">Entendí: ' + frase + '</p>'
      + '<div class="ent-tipo">' + [['pendiente', 'Pendiente'], ['gasto', 'Gasto'], ['ingreso', 'Ingreso']].map(([k, t]) => '<button data-et="' + k + '"' + (d.tipo === k ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div></div>'
      + (falta.length ? '<ul class="ent-falta">' + falta.map(f => '<li data-fal="' + f[0] + '">' + f[1] + '</li>').join('') + '</ul>' : '')
      + campos
      + (d.tipo === 'ingreso' && p ? '<p class="ent-n">Se registra como pago del pedido #' + p.folio + (X.numeros(p).pactado ? ' (precio ' + pesos(X.numeros(p).pactado) + ', ya pagó ' + pesos(X.numeros(p).pagado) + ')' : '') + '. Si completa el 50%, el pedido pasa solo a Confirmado.</p>' : '')
      + (d.tipo === 'pendiente' && p ? '<p class="ent-n">Queda también en el historial del pedido #' + p.folio + '.</p>' : '')
      + '<div class="ent-bot"><button class="btn negro" id="ag-ok">' + (editando ? 'Guardar cambios' : 'Guardar') + '</button><button class="btn" id="ag-no">' + (editando ? 'Cancelar' : 'Borrar') + '</button></div></div>';
    falta.forEach(f => { const i = f[0] === 'monto' ? $('#e-m') : f[0] === 'pedido' ? $('#e-p') : $('#e-f'); if (i) i.closest('label').classList.add('pide'); });
    const set = (k, v) => { draft[k] = v; toco[k] = 1; };
    el.querySelectorAll('[data-et]').forEach(b => b.onclick = () => { const t = b.dataset.et; draft.tipo = t; toco.tipo = 1;
      if (t === 'gasto' && !CATS_G.includes(draft.categoria)) draft.categoria = (CAT_G.find(c => c[1].test(sin(draft.texto))) || ['Otros gastos'])[0];
      if (t === 'ingreso' && !CATS_I.includes(draft.categoria)) { draft.categoria = 'Otro ingreso'; draft.metodo = draft.metodo || 'Transferencia'; }
      if (t !== 'pendiente' && !draft.monto) { const r = entender(draft.texto.replace(/^/, 'pague '), null); draft.monto = r.monto; }
      if (t !== 'pendiente' && !draft.fecha) draft.fecha = fechaMas(0);
      if (t === 'pendiente' && !draft.tarea) draft.tarea = 'pendiente';
      pintarEnt(pedido); });
    el.querySelectorAll('[data-ef]').forEach(b => b.onclick = () => { set('fecha', b.dataset.ef); pintarEnt(pedido); });
    // listas: se vuelve a dibujar; lo que se teclea (monto, fecha, hora) solo se guarda, para que el clic en Guardar no se pierda
    const on = (id, k, f) => { const i = $(id); if (i) i.onchange = () => { set(k, f ? f(i.value) : i.value); pintarEnt(pedido); }; };
    const tec = (id, k, f) => { const i = $(id); if (i) i.oninput = i.onchange = () => { set(k, f ? f(i.value) : i.value); i.closest('label').classList.remove('pide'); }; };
    tec('#e-f', 'fecha'); tec('#e-h', 'hora'); on('#e-c', 'categoria'); on('#e-me', 'metodo'); on('#e-p', 'pedido');
    on('#e-t', 'tarea', v => Object.keys(TIPO_N).find(k => TIPO_N[k] === v)); tec('#e-m', 'monto', v => +String(v).replace(/[$,\s]/g, '') || 0);
    const u = $('#e-u'); if (u) u.onchange = () => { set('urgente', u.checked); pintarEnt(pedido); };
    $('#ag-no').onclick = () => { $('#ag-tx').value = ''; editando = null; draft = null; toco = {}; el.hidden = true; if (!pedido) pintar(); };
    $('#ag-ok').onclick = () => guardar(pedido);
  }

  // ---------- guardar donde va ----------
  async function guardar(pedido) {
    const d = draft, A = X.A, me = X.me() || {}, b = $('#ag-ok'); if (!d) return;
    const p = d.pedido && X.todos().find(q => q.id === d.pedido);
    if (d.tipo !== 'pendiente' && !(d.monto > 0)) { const i = $('#e-m'); if (i) { i.focus(); i.closest('label').classList.add('pide'); } return X.alerta(d.tipo === 'gasto' ? 'Escribe cuánto fue el gasto.' : 'Escribe cuánto entró.'); }
    b.disabled = true;
    const texto = d.texto.slice(0, 400), conc = (texto.charAt(0).toUpperCase() + texto.slice(1)).slice(0, 120);
    try {
      if (d.tipo === 'pendiente') {
        const id = editando || Date.now().toString(36) + A.rnd().slice(0, 6), viejo = editando && tareas.find(t => t.id === editando);
        const x = { texto, hecho: viejo ? !!viejo.hecho : false, creado: viejo ? viejo.creado : Date.now() };
        const por = String(viejo ? viejo.por || '' : me.nombre || '').slice(0, 60); if (por) x.por = por;
        if (d.fecha) x.fecha = d.fecha; if (d.hora) x.hora = d.hora; if (d.urgente) x.urgente = true; if (p) x.pedido = p.id; if (d.tarea && d.tarea !== 'pendiente') x.tipo = d.tarea;
        await A.guardarTarea(id, x); tareas = tareas.filter(t => t.id !== id).concat([Object.assign({ id }, x)]);
        if (p && !viejo) A.staffMensaje(p.id, 'Agenda: ' + texto + (d.fecha ? ' · ' + X.fechaCorta(d.fecha) : '') + (d.hora ? ' ' + d.hora : ''), true).catch(() => {});
        X.toast(viejo ? 'Cambios guardados' : d.fecha === fechaMas(0) ? 'Anotado para hoy' : d.fecha ? 'Anotado para el ' + X.fechaCorta(d.fecha) : 'Anotado');
      } else if (d.tipo === 'gasto') {
        const x = { fecha: d.fecha || fechaMas(0), monto: +d.monto, concepto: conc, categoria: d.categoria.slice(0, 30) }; if (p) x.pedido = p.id;
        await A.agregarGasto(x); gastos = await A.gastos().catch(() => gastos);
        if (p) A.staffMensaje(p.id, 'Gasto de ' + pesos(d.monto) + ' en ' + d.categoria.toLowerCase() + ': ' + conc, true).catch(() => {});
        X.toast('Gasto de ' + pesos(d.monto) + ' guardado' + (p ? ' en #' + p.folio : ''));
      } else if (p) {
        await A.agregarPago(p.id, { monto: +d.monto, metodo: d.metodo || 'Transferencia', fecha: d.fecha || fechaMas(0), nota: (d.categoria + ' · ' + conc).slice(0, 200) });
        await X.recargar(); const q = X.todos().find(z => z.id === p.id); if (q) await X.avanzar(q);
        X.toast('Pago de ' + pesos(d.monto) + ' guardado en #' + p.folio);
      } else {
        await A.agregarIngreso({ fecha: d.fecha || fechaMas(0), monto: +d.monto, concepto: conc, categoria: d.categoria.slice(0, 30), metodo: d.metodo || 'Transferencia' }); ingresos = await A.ingresos().catch(() => ingresos);
        X.toast('Ingreso de ' + pesos(d.monto) + ' guardado');
      }
      const tx = $('#ag-tx'); if (tx) tx.value = ''; editando = null; draft = null; toco = {};
      if (pedido) { if (d.tipo === 'pendiente') return enPedido(pedido, $('#ag-ped')); await X.recargar(); const y = scrollY; X.ruta(); return scrollTo(0, y); }
      pintar();
    } catch (e) { b.disabled = false; X.alerta(e.message); }
  }

  // ---------- agenda: lo mío y lo del sistema, por día ----------
  function pintarAgenda() {
    const h = fechaMas(0), m1 = fechaMas(1), el = $('#ag-cuerpo'), sis = delSistema();
    const pend = tareas.filter(t => !t.hecho), hechos = tareas.filter(t => t.hecho).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.creado - a.creado);
    const items = pend.map(t => ({ t, fecha: t.fecha && t.fecha < h ? h : t.fecha || '', tarde: t.fecha && t.fecha < h, orden: (t.urgente ? 0 : 1) + (t.hora || '99') })).concat(sis.map(s => ({ s, fecha: s.fecha, tarde: s.tarde, orden: (s.tarde ? 0 : 2) + '99' })));
    const grupos = {}; items.forEach(i => { const k = !i.fecha ? 'z' : i.fecha <= h ? h : i.fecha; (grupos[k] = grupos[k] || []).push(i); });
    Object.values(grupos).forEach(l => l.sort((a, b) => (b.tarde ? 1 : 0) - (a.tarde ? 1 : 0) || a.orden.localeCompare(b.orden)));
    const nHoy = (grupos[h] || []).length, nTarde = items.filter(i => i.tarde).length;
    const mesAct = h.slice(0, 7), mv = movimientos(mesAct), ent = mv.filter(x => x.k === 'in').reduce((a, x) => a + x.monto, 0), sal = mv.filter(x => x.k === 'out').reduce((a, x) => a + x.monto, 0);
    $('#ag-res').innerHTML = (nHoy ? 'Hoy tienes <b>' + nHoy + '</b> ' + (nHoy === 1 ? 'cosa' : 'cosas') : 'Hoy no tienes nada pendiente') + (nTarde ? ', <b class="r">' + nTarde + ' atrasada' + (nTarde > 1 ? 's' : '') + '</b>' : '') + '. Este mes: <b class="v">+' + pesos(ent) + '</b> · <b>−' + pesos(sal) + '</b>.';
    const fila = i => {
      if (i.s) { const s = i.s; return '<a class="tarea sis' + (s.tarde ? ' tarde' : '') + '" href="' + s.ir + '"><span class="ic">' + icono(s.tipo) + '</span><div class="tx"><p>' + X.esc(s.txt) + '</p><small><i class="et">' + s.tipo + '</i> ' + X.esc(s.sub) + '</small></div><span class="ir">Abrir ›</span></a>'; }
      const t = i.t, p = t.pedido && X.todos().find(q => q.id === t.pedido), tel = p && p.tel ? X.A.waNum(p.tel) : '';
      return '<div class="tarea' + (t.hecho ? ' hecha' : '') + (t.urgente && !t.hecho ? ' urg' : '') + '" data-id="' + t.id + '"><button class="chk" data-a="hecho" aria-label="' + (t.hecho ? 'Marcar pendiente' : 'Marcar hecho') + '"></button>'
        + '<div class="tx"><p>' + X.esc(t.texto).replace(/\n/g, '<br>') + '</p><small>' + [t.tipo ? '<i class="et">' + TIPO_N[t.tipo] + '</i>' : '', t.hora ? '<b class="hr">' + t.hora.replace(/^0/, '') + ' h</b>' : '', t.urgente && !t.hecho ? '<b>Urgente</b>' : '', i.tarde ? '<b>era para el ' + X.fechaCorta(t.fecha) + '</b>' : t.hecho && t.fecha ? X.fechaCorta(t.fecha) : '', p ? '<a href="#p=' + p.id + '">#' + p.folio + ' ' + X.esc(p.nombre) + '</a>' : '', t.por ? 'anotó ' + X.esc(t.por) : ''].filter(Boolean).join(' · ') + '</small>'
        + (tel && !t.hecho && ['llamar', 'mensaje', 'cobrar', 'cita', 'entrega'].includes(t.tipo) ? '<div class="t-acc">' + (t.tipo === 'llamar' ? '<a class="btn chico" href="tel:' + X.esc(p.tel) + '">Llamar</a>' : '') + '<a class="btn chico verde" target="_blank" rel="noopener" href="https://wa.me/' + tel + '">WhatsApp</a></div>' : '') + '</div>'
        + '<div class="acc"><button class="lnk" data-a="editar">editar</button>' + (t.fecha && !t.hecho ? '<button class="lnk" data-a="manana">mañana</button>' : '') + '<button class="lnk gris" data-a="borrar">borrar</button></div></div>';
    };
    const tit = k => k === h ? 'Hoy' : k === m1 ? 'Mañana · ' + X.fechaCorta(k) : k === 'z' ? 'Sin fecha' : X.fechaCorta(k);
    const keys = Object.keys(grupos).sort((a, b) => a < b ? -1 : 1);
    if (!grupos[h]) keys.unshift(h);
    el.innerHTML = keys.map(k => '<h3 class="ag-g' + (k === h ? ' ag-hoy' : k === 'z' ? ' gris' : '') + '">' + tit(k) + ' <i>' + (grupos[k] || []).length + '</i></h3>'
      + ((grupos[k] || []).length ? '<div class="lista">' + grupos[k].map(fila).join('') + '</div>' : '<p class="sub ag-vacio">Nada para hoy. Escribe arriba lo que tengas en la cabeza.</p>')).join('')
      + (hechos.length ? '<h3 class="ag-g"><button class="lnk gris" id="ag-ver">' + (verHechos ? 'Ocultar' : 'Ver') + ' hechos (' + hechos.length + ')</button></h3>' + (verHechos ? '<div class="lista">' + hechos.slice(0, 60).map(t => fila({ t })).join('') + '</div>' : '') : '');
    if ($('#ag-ver')) $('#ag-ver').onclick = () => { verHechos = !verHechos; pintarAgenda(); };
    el.onclick = e => accionTarea(e, pintarAgenda);
  }
  async function accionTarea(e, luego) {
    const b = e.target.closest('[data-a]'), r = b && b.closest('.tarea'); if (!r) return;
    const t = tareas.find(z => z.id === r.dataset.id); if (!t) return; const A = X.A;
    const sinId = o => { const n = Object.assign({}, o); delete n.id; return n; };
    if (b.dataset.a === 'editar') {
      editando = t.id; toco = { fecha: 1, hora: 1, urgente: 1, pedido: 1, tarea: 1, tipo: 1 };
      draft = { tipo: 'pendiente', texto: t.texto, fecha: t.fecha || '', hora: t.hora || '', urgente: !!t.urgente, pedido: t.pedido || '', tarea: t.tipo || 'pendiente' };
      const tx = $('#ag-tx'); tx.value = t.texto; tx.focus(); scrollTo({ top: 0, behavior: 'smooth' }); pintarEnt(); return;
    }
    if (b.dataset.a === 'borrar') { if (!confirm('¿Borrar este pendiente?')) return; try { await A.borrarTarea(t.id); tareas = tareas.filter(z => z.id !== t.id); luego(); contar(); } catch (x) { X.alerta(x.message); } return; }
    if (b.dataset.a === 'manana') { const n = sinId(t); n.fecha = fechaMas(1); try { await A.guardarTarea(t.id, n); t.fecha = n.fecha; X.toast('Pasado a mañana'); luego(); contar(); } catch (x) { X.alerta(x.message); } return; }
    if (b.dataset.a === 'hecho') {
      const n = sinId(t); n.hecho = !t.hecho; r.classList.toggle('hecha', n.hecho);
      try { await A.guardarTarea(t.id, n); t.hecho = n.hecho; if (n.hecho) { X.toast('Hecho ✓'); if (t.pedido) A.staffMensaje(t.pedido, 'Hecho: ' + t.texto, true).catch(() => {}); } setTimeout(() => { luego(); contar(); }, n.hecho ? 400 : 0); }
      catch (x) { r.classList.toggle('hecha', t.hecho); X.alerta(x.message); }
    }
  }
  function icono(t) {
    const P = { Entrega: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.1M17 19a2 2 0 1 0 0-.1', Cobrar: 'M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6', Mensaje: 'M4 5h16v11H8l-4 4z', Clientes: 'M8 11a4 4 0 1 0 0-.1M2 20c1-4 11-4 12 0M16 7a3 3 0 1 1 0 6M18 14c2 .5 4 2 4 5' };
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + (P[t] || P.Mensaje) + '"/></svg>';
  }

  // ---------- dinero: lo que entra, lo que sale, y lo que el sistema detecta ----------
  function movimientos(mm) {
    const l = [];
    X.todos().forEach(p => (p.pagos || []).forEach(q => l.push({ k: 'in', src: 'pago', id: q.id, q, p, fecha: q.fecha, monto: +q.monto || 0, cat: /^(Anticipo|Abono|Liquidación)/.test(q.nota || '') ? q.nota.split(' · ')[0] : 'Pago de pedido', txt: 'Pago de ' + p.nombre + (q.nota && q.nota.includes(' · ') ? ' · ' + q.nota.split(' · ').slice(1).join(' · ') : ''), met: q.metodo })));
    ingresos.forEach(x => l.push({ k: 'in', src: 'ing', id: x.id, x, fecha: x.fecha, monto: +x.monto || 0, cat: x.categoria, txt: x.concepto, met: x.metodo }));
    gastos.forEach(x => l.push({ k: 'out', src: 'gas', id: x.id, x, p: x.pedido && X.todos().find(p => p.id === x.pedido), fecha: x.fecha, monto: +x.monto || 0, cat: x.categoria, txt: x.concepto }));
    return (mm ? l.filter(x => (x.fecha || '').slice(0, 7) === mm) : l).sort((a, b) => b.fecha.localeCompare(a.fecha) || ms((b.x || b.q || {}).creado) - ms((a.x || a.q || {}).creado));
  }
  const mesTxt = mm => { const [y, m] = mm.split('-'); return MESES[+m - 1].replace(/^./, c => c.toUpperCase()) + ' ' + y; };
  const mesMas = (mm, n) => { const [y, m] = mm.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  function gastosDe(p) { return gastos.filter(g => g.pedido === p.id).reduce((a, g) => a + (+g.monto || 0), 0); }
  function detectar(mm, mv) {
    const l = [], ant = movimientos(mesMas(mm, -1)), suma = (xs, k) => xs.filter(x => x.k === k).reduce((a, x) => a + x.monto, 0);
    const ent = suma(mv, 'in'), sal = suma(mv, 'out'), es = mm === fechaMas(0).slice(0, 7), dia = +fechaMas(0).slice(8);
    if (ent || sal) {
      if (sal > ent && ent > 0) l.push(['mal', 'Este mes salió más de lo que entró: vas ' + pesos(sal - ent) + ' abajo.']);
      else if (sal > 0 && ent === 0) l.push(['mal', 'Este mes solo hay gastos (' + pesos(sal) + ') y ningún ingreso registrado.']);
      else if (ent > 0) l.push(['bien', 'De cada $100 que entraron, te quedaron $' + Math.round((ent - sal) / ent * 100) + '.']);
    }
    const porCat = {}, porCatA = {}; mv.filter(x => x.k === 'out').forEach(x => { porCat[x.cat] = (porCat[x.cat] || 0) + x.monto; }); ant.filter(x => x.k === 'out').forEach(x => { porCatA[x.cat] = (porCatA[x.cat] || 0) + x.monto; });
    Object.entries(porCat).forEach(([c, v]) => { const a = porCatA[c] || 0; if (a > 0 && v > a * 1.3 && v - a >= 1000) l.push(['ambar', 'Gastaste ' + Math.round((v / a - 1) * 100) + '% más en ' + c.toLowerCase() + ' que el mes pasado (' + pesos(v) + ' contra ' + pesos(a) + ').']); });
    const top = Object.entries(porCat).sort((a, b) => b[1] - a[1])[0]; if (top && sal > 0 && top[1] / sal >= 0.4 && Object.keys(porCat).length > 1) l.push(['', top[0] + ' es ' + Math.round(top[1] / sal * 100) + '% de lo que gastaste.']);
    const sinP = mv.filter(x => x.src === 'gas' && !x.x.pedido && MATERIAL.includes(x.cat)); if (sinP.length) l.push(['ambar', sinP.length + (sinP.length === 1 ? ' gasto de material no dice' : ' gastos de material no dicen') + ' de qué mesa fue' + (sinP.length === 1 ? '' : 'ron') + '. Tócalos abajo en «¿de qué mesa?» para saber cuánto te dejó cada una.']);
    const vistos = {}; mv.filter(x => x.src === 'gas').forEach(x => { const k = x.fecha + '|' + x.monto + '|' + x.cat; if (vistos[k]) l.push(['ambar', '¿Repetido? Hay dos gastos de ' + pesos(x.monto) + ' en ' + x.cat.toLowerCase() + ' el ' + X.fechaCorta(x.fecha) + '.']); vistos[k] = 1; });
    X.todos().filter(p => p.estado !== 'cancelado').forEach(p => { const n = X.numeros(p), g = gastosDe(p); if (n.pactado && g > n.pactado * 0.8) l.push(['mal', 'Pedido #' + p.folio + ' de ' + p.nombre + ': ya gastaste ' + pesos(g) + ' de un precio de ' + pesos(n.pactado) + ' (' + Math.round(g / n.pactado * 100) + '%).']); });
    const deben = X.todos().filter(p => p.estado === 'entregado' && X.numeros(p).pactado > X.numeros(p).pagado); if (deben.length) l.push(['mal', 'Ya entregadas y sin liquidar: ' + deben.map(p => p.nombre.split(' ')[0] + ' (' + pesos(X.numeros(p).pactado - X.numeros(p).pagado) + ')').join(', ') + '.']);
    if (es && dia >= 7 && dia < 28 && (ent || sal)) { const dm = new Date(+mm.slice(0, 4), +mm.slice(5), 0).getDate(), f = dm / dia; l.push(['', 'A este ritmo cierras ' + mesTxt(mm).split(' ')[0].toLowerCase() + ' con ' + pesos(ent * f) + ' de entradas y ' + pesos(sal * f) + ' de gastos.']); }
    return l;
  }
  function pintarDinero() {
    const el = $('#ag-cuerpo'), mv = movimientos(mes), suma = k => mv.filter(x => x.k === k).reduce((a, x) => a + x.monto, 0), ent = suma('in'), sal = suma('out'), q = ent - sal;
    const porCobrar = X.todos().filter(p => p.estado !== 'cancelado').reduce((a, p) => { const n = X.numeros(p); return a + Math.max(0, n.pactado - n.pagado); }, 0);
    $('#ag-res').innerHTML = 'Escribe arriba cualquier gasto o cobro como lo dirías; aquí se ordena solo.';
    const cats = {}; mv.filter(x => x.k === 'out').forEach(x => { cats[x.cat] = (cats[x.cat] || 0) + x.monto; });
    const cl = Object.entries(cats).sort((a, b) => b[1] - a[1]), mx = cl.length ? cl[0][1] : 1;
    const det = detectar(mes, mv);
    const peds = X.todos().filter(p => p.estado !== 'cancelado' && X.numeros(p).pactado > 0 && (p.estado !== 'entregado' || (p.actualizado && Date.now() - ms(p.actualizado) < 75 * 86400000))).sort((a, b) => ms(b.creado) - ms(a.creado)).slice(0, 12);
    el.innerHTML = '<div class="din-mes"><button data-mes="-1" aria-label="Mes anterior">‹</button><b>' + mesTxt(mes) + '</b><button data-mes="1" aria-label="Mes siguiente"' + (mes >= fechaMas(0).slice(0, 7) ? ' disabled' : '') + '>›</button></div>'
      + '<div class="din-kpi"><div class="v"><span>Entró</span><b>' + pesos(ent) + '</b></div><div class="r"><span>Salió</span><b>' + pesos(sal) + '</b></div><div class="' + (q < 0 ? 'r' : 'q') + '"><span>Te quedó</span><b>' + (q < 0 ? '−' : '') + pesos(Math.abs(q)) + '</b></div><div><span>Te deben (todos los pedidos)</span><b>' + pesos(porCobrar) + '</b></div></div>'
      + '<section class="sec din-det"><h2>Lo que veo</h2>' + (det.length ? '<ul>' + det.map(([c, t]) => '<li class="' + c + '">' + X.esc(t) + '</li>').join('') + '</ul>' : '<p class="sub">' + (mv.length ? 'Todo en orden este mes.' : 'Aún no hay movimientos en ' + mesTxt(mes).toLowerCase() + '. Escribe arriba, por ejemplo «gasté 3,500 en la placa».') + '</p>') + '</section>'
      + (cl.length ? '<section class="sec"><h2>En qué se fue el dinero</h2><div class="din-bar">' + cl.map(([c, v]) => '<div><span>' + X.esc(c) + '</span><i><em style="width:' + Math.max(2, v / mx * 100) + '%"></em></i><b>' + pesos(v) + '</b></div>').join('') + '</div></section>' : '')
      + (peds.length ? '<section class="sec"><h2>Cuánto te deja cada mesa</h2><p class="sub">Precio pactado menos los gastos ligados a ese pedido.</p><div class="din-ped">' + peds.map(p => { const n = X.numeros(p), g = gastosDe(p), qq = n.pactado - g, pc = Math.round(qq / n.pactado * 100);
          return '<a href="#p=' + p.id + '"><div><b>#' + p.folio + ' ' + X.esc(p.nombre) + '</b><small>' + X.esc(X.A.estado(p.estado)) + ' · cobrado ' + pesos(n.pagado) + ' de ' + pesos(n.pactado) + '</small></div><div class="n"><span>gastado ' + pesos(g) + '</span><b class="' + (pc < 30 ? 'r' : 'v') + '">' + pesos(qq) + (g ? ' · ' + pc + '%' : '') + '</b></div></a>'; }).join('') + '</div></section>' : '')
      + '<section class="sec"><h2>Movimientos de ' + mesTxt(mes).toLowerCase() + ' <i class="cnt">' + mv.length + '</i></h2>' + (mv.length ? '<div class="din-mov">' + mv.map(x => '<div class="mv ' + x.k + '" data-src="' + x.src + '" data-id="' + x.id + '"' + (x.q ? ' data-p="' + x.p.id + '"' : '') + '><div class="tx"><p>' + X.esc(x.txt) + '</p><small>' + [X.fechaCorta(x.fecha), x.cat, x.met, x.p ? '<a href="#p=' + x.p.id + '">#' + x.p.folio + ' ' + X.esc(x.p.nombre.split(' ')[0]) + '</a>' : x.src === 'gas' && MATERIAL.includes(x.cat) ? '<button class="lnk" data-ligar="' + x.id + '">¿de qué mesa?</button>' : ''].filter(Boolean).map(s => String(s).startsWith('<') ? s : X.esc(s)).join(' · ') + '</small></div><b>' + (x.k === 'in' ? '+' : '−') + pesos(x.monto) + '</b><button class="lnk gris" data-quitar>quitar</button></div>').join('') + '</div>' : '<p class="sub">Sin movimientos.</p>') + '</section>';
    el.onclick = async e => {
      const mb = e.target.closest('[data-mes]'); if (mb) { mes = mesMas(mes, +mb.dataset.mes); return pintarDinero(); }
      const lg = e.target.closest('[data-ligar]'); if (lg) { const g = gastos.find(z => z.id === lg.dataset.ligar); const s = document.createElement('select'); s.innerHTML = opsPed(''); lg.replaceWith(s); s.focus();
        s.onchange = async () => { if (!s.value) return; const n = Object.assign({}, g, { pedido: s.value }); delete n.id; try { await X.A.guardarGasto(g.id, n); g.pedido = s.value; const p = X.todos().find(z => z.id === s.value); X.toast('Ligado a #' + p.folio); X.A.staffMensaje(p.id, 'Gasto de ' + pesos(g.monto) + ' en ' + String(g.categoria).toLowerCase() + ': ' + g.concepto, true).catch(() => {}); pintarDinero(); } catch (x) { X.alerta(x.message); } }; return; }
      const qb = e.target.closest('[data-quitar]'); if (!qb) return; const r = qb.closest('.mv'), A = X.A;
      if (!confirm('¿Quitar este movimiento?')) return;
      try {
        if (r.dataset.src === 'gas') { await A.borrarGasto(r.dataset.id); gastos = gastos.filter(z => z.id !== r.dataset.id); }
        else if (r.dataset.src === 'ing') { await A.borrarIngreso(r.dataset.id); ingresos = ingresos.filter(z => z.id !== r.dataset.id); }
        else { const p = X.todos().find(z => z.id === r.dataset.p), q = p.pagos.find(z => z.id === r.dataset.id); await A.borrarPago(p.id, q.id, q); await X.recargar(); }
        X.toast('Quitado'); pintarDinero();
      } catch (x) { X.alerta(x.message); }
    };
  }

  // ---------- dentro de cada pedido: su agenda y lo que se ha gastado en él ----------
  async function enPedido(p, el) {
    if (!el) return;
    try { if (!tareas.length || !gastos.length) await cargar(); } catch (e) {}
    const ts = tareas.filter(t => t.pedido === p.id).sort((a, b) => (a.hecho ? 1 : 0) - (b.hecho ? 1 : 0) || (a.fecha || '9').localeCompare(b.fecha || '9')), gs = gastos.filter(g => g.pedido === p.id), n = X.numeros(p), g = gs.reduce((a, x) => a + (+x.monto || 0), 0);
    el.innerHTML = caja(p)
      + (n.pactado || g ? '<div class="cifras"><div><span>Precio</span><b>' + pesos(n.pactado) + '</b></div><div><span>Gastado en esta mesa</span><b>' + pesos(g) + '</b></div><div><span>Te queda</span><b class="' + (n.pactado - g < n.pactado * 0.3 ? 'mal' : 'bien') + '">' + pesos(n.pactado - g) + '</b></div></div>' : '')
      + (ts.length ? '<div class="lista ag-ped-l">' + ts.map(t => '<div class="tarea' + (t.hecho ? ' hecha' : '') + (t.urgente && !t.hecho ? ' urg' : '') + '" data-id="' + t.id + '"><button class="chk" data-a="hecho"></button><div class="tx"><p>' + X.esc(t.texto) + '</p><small>' + [t.fecha ? X.fechaCorta(t.fecha) : 'sin fecha', t.hora ? t.hora.replace(/^0/, '') + ' h' : ''].filter(Boolean).join(' · ') + '</small></div><div class="acc"><button class="lnk gris" data-a="borrar">borrar</button></div></div>').join('') + '</div>' : '')
      + (gs.length ? '<ul class="pagos">' + gs.map(x => '<li><span>' + X.fechaCorta(x.fecha) + ' · ' + X.esc(x.categoria) + ' · ' + X.esc(x.concepto) + '</span><b>−' + pesos(x.monto) + '</b></li>').join('') + '</ul>' : '');
    bindCaja(p);
    el.onclick = e => accionTarea(e, () => enPedido(p, el));
  }

  window.DKAS_AGENDA = { init: c => { X = c; }, pantalla, contar, enPedido, entender, _delSistema: () => delSistema() };
})();

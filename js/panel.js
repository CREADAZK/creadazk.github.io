/* DKAS · panel del taller. Dos secciones:
   · Pedidos y logística: todo lo que pidieron los clientes, en orden de entrega (lo atrasado primero), con herrero, cotización y pagos.
   · Taller y creación: medidas y cortes, lo que cuesta cada mesa y cuánto ganamos, croquis y la orden de compra con logo y precio.
   Todo lo calcula DKAS (dkas-data.js); aquí solo se captura lo que cuesta, lo que se pactó, quién la hace, cuándo se entrega y lo que se cobró.
   El sistema camina solo: con el anticipo pasa a Confirmado y se pone la fecha de entrega; con herrero pasa a En fabricación. */
(function () {
  const D = window.DKAS, A = window.DAZK_API, CQ = window.DKAS_CQ, WA = window.DKAS_WA, SITE = 'https://dkas.mx/';
  const $ = s => document.querySelector(s), esc = A.esc, main = $('#m');
  const $$ = s => [...document.querySelectorAll(s)];
  const pesos = n => '$' + Math.round(+n || 0).toLocaleString('es-MX');
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isNaN(n) ? '' : n; };
  const hoy = (mas) => { const d = new Date(Date.now() + (mas || 0) * 86400000); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }; // fecha local, no UTC
  const ESTADOS = A.ESTADOS.map(e => e[0]);
  const DIAS = 21; // días de fabricación si no se configuró otro número
  let me = null, todos = [], cfg = {}, filtro = 'activos', busca = '';

  // ---------- la mesa de un pedido ----------
  const deCodigo = s => { const p = String(s || '').split('.'); return p.length >= 6 && p.length <= 8 ? { uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5], H: +p[6] || 0, color: p[7] || 'negro' } : null; };
  function mesaOriginal(p) {
    const it = (p.items || []).find(x => x.tipo === 'mesa') || {}, sp = Object.fromEntries((it.specs || []).map(x => [x[0], x[1]]));
    const c = deCodigo(sp['Código']); if (c) return c;
    // pedidos de antes del sistema nuevo: se toma lo que se pueda de su ficha
    const txt = JSON.stringify(it).toLowerCase(), m = { uso: /periquera|barra/.test(txt) ? 'periquera' : /centro/.test(txt) ? 'centro' : 'comedor' };
    const md = (sp.Medidas || sp.Medida || it.titulo || '').match(/(\d{2,3})\s*[×x]\s*(\d{2,3})/), dm = (sp.Medidas || it.titulo || '').match(/Ø\s*(\d{2,3})/);
    if (dm) Object.assign(m, { forma: 'round', L: +dm[1], W: +dm[1] }); else if (md) Object.assign(m, { forma: /oval/.test(txt) ? 'oval' : 'rect', L: +md[1], W: +md[2] });
    const pi = D.PIEDRAS.find(x => txt.includes(x.nombre.toLowerCase())); if (pi) m.piedra = pi.id;
    return m;
  }
  const ficha = p => (p.fichas && p.fichas.dkas) || {};
  const mesaDe = p => D.normalizar(Object.assign({}, mesaOriginal(p), ficha(p).m || {}));
  // pedidos que el cliente mandó juntos (varias mesas distintas): cada diseño es su pedido, con esta marca
  const conjunto = p => { const it = (p.items || []).find(x => x.tipo === 'mesa') || {}, x = (it.specs || []).find(y => y[0] === 'Pedido conjunto'); return x ? x[1] : ''; };
  const cantidad = p => ((p.items || []).find(x => x.tipo === 'mesa') || {}).cantidad || 1;
  const pagado = p => (p.pagos || []).reduce((a, x) => a + (+x.monto || 0), 0);
  // modelo (de catálogo o personalizado) y color de la base
  const COLORES = ['Negro mate', 'Blanco mate', 'Gris grafito', 'Dorado', 'Champagne', 'Bronce'];
  function modeloDe(p) {
    const f = ficha(p), m = mesaDe(p);
    // si no se eligió, se reconoce solo: mismo uso, forma, medidas y base que un modelo del catálogo (la piedra puede cambiar)
    const mod = f.modelo ? D.MODELOS.find(x => x.id === f.modelo) : D.MODELOS.find(x => x.uso === m.uso && x.forma === m.forma && x.L === m.L && (D.redonda(m.forma) || x.W === m.W) && x.base === m.base);
    if (f.modelo === 'otro') return { txt: (f.modeloOtro || 'Personalizado') + ' · fuera de catálogo', nuestro: false };
    return mod ? { txt: mod.nombre + ' · de catálogo', nuestro: true, nombre: mod.nombre } : { txt: 'Personalizado · diseño del cliente', nuestro: false };
  }
  const colorDe = p => ficha(p).color || D.color(mesaDe(p).color).nombre;
  // base: una de las nuestras, u "otra" que se escribe a mano (los cortes se calculan con la nuestra como referencia)
  const baseDe = p => ficha(p).baseOtra || D.BASES[mesaDe(p).base].nombre;
  const conBase = (p, b) => /^base\b/i.test(baseDe(p)) ? baseDe(p) : (b || 'Base') + ' ' + baseDe(p);
  const resumenP = p => D.resumen(mesaDe(p)).map(r => r[0] === 'Base' ? ['Base', baseDe(p) + (ficha(p).baseOtra ? ' (otra)' : '')] : r[0] === 'Color de base' ? ['Color de base', colorDe(p)] : r);
  const opcBases = (m, otra) => opts(Object.fromEntries(D.basesPara(m).map(k => [k, D.BASES[k].nombre]).concat([['__otra', 'Otra base…']])), otra ? '__otra' : m.base);
  const activo = p => !['entregado', 'cancelado'].includes(p.estado);
  function numeros(p) {
    const f = ficha(p), k = D.costear(f.lin, cfg), n = cantidad(p), costo = k.costo * n;
    const pactado = +f.pactado || (p.cotizacion && +p.cotizacion.total) || 0, minimo = cfg.minimo != null ? +cfg.minimo : D.CFG.minimo;
    return { k, n, costo, pactado, minimo, sugerido: D.sugerido(costo, minimo), g: D.ganancia(pactado, costo, minimo), pagado: pagado(p) };
  }
  function sigue(p) {
    const x = numeros(p), anticipo = Math.ceil(x.pactado / 2), f = ficha(p);
    return { nuevo: !f.bienvenida && p.tel ? 'Mandarle la bienvenida por WhatsApp' : x.pactado ? 'Mandar la cotización al cliente' : 'Poner el precio (Taller y creación)',
      cotizado: 'Esperar que acepte y cobrar anticipo (50%)',
      confirmado: x.pagado >= anticipo && anticipo ? (f.herrero ? 'Mandar a fabricar' : 'Asignar herrero') : 'Cobrar anticipo de ' + pesos(anticipo - x.pagado),
      fabricacion: 'Terminar y avisar que está lista', listo: x.pagado < x.pactado ? 'Entregar y cobrar saldo de ' + pesos(x.pactado - x.pagado) : 'Entregar',
      entregado: 'Terminado', cancelado: 'Cancelado' }[p.estado] || '';
  }

  // ---------- entregas: el orden de todo ----------
  const dias = () => +cfg.dias || DIAS;
  const faltan = f => Math.round((new Date(f + 'T12:00') - new Date(hoy() + 'T12:00')) / 86400000);
  const fechaCorta = f => new Date(f + 'T12:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  function entrega(p) {
    const f = ficha(p).entrega;
    if (p.estado === 'entregado') return { g: 'fin', txt: 'Entregada', cls: 'bien' };
    if (p.estado === 'cancelado') return { g: 'fin', txt: 'Cancelado', cls: '' };
    if (!f) return { g: 'sin', txt: 'Sin fecha de entrega', cls: 'gris' };
    const d = faltan(f);
    if (d < 0) return { g: 'tarde', d, txt: 'Atrasada ' + -d + (d === -1 ? ' día' : ' días'), cls: 'mal', f };
    if (d <= 7) return { g: 'semana', d, txt: d === 0 ? 'Se entrega HOY' : d === 1 ? 'Mañana' : 'En ' + d + ' días', cls: 'ambar', f };
    return { g: 'despues', d, txt: 'En ' + d + ' días', cls: '', f };
  }
  const GRUPOS = [['tarde', 'Atrasadas'], ['semana', 'Esta semana'], ['despues', 'Próximas'], ['sin', 'Sin fecha de entrega'], ['fin', 'Terminadas']];
  function ordenados(l) {
    return l.slice().sort((a, b) => {
      const fa = ficha(a).entrega || '9999', fb = ficha(b).entrega || '9999';
      return fa < fb ? -1 : fa > fb ? 1 : (b.creado || 0) - (a.creado || 0);
    });
  }
  // todos los herreros: los de Precios y los que ya se usaron
  function herreros() {
    const s = new Set((cfg.herreros || []).filter(Boolean));
    todos.forEach(p => { const h = ficha(p).herrero; if (h) s.add(h); });
    return [...s].sort();
  }

  // ---------- el sistema camina solo ----------
  async function avanzar(p) {
    const x = numeros(p), anticipo = Math.ceil(x.pactado / 2), f = Object.assign({}, ficha(p));
    let est = p.estado, cambio = false;
    if (['nuevo', 'cotizado'].includes(est) && x.pactado && x.pagado >= anticipo) est = 'confirmado';
    if (est === 'confirmado' && f.herrero) est = 'fabricacion';
    if (['confirmado', 'fabricacion'].includes(est) && !f.entrega) { f.entrega = hoy(dias()); cambio = true; }
    if (cambio) { await A.guardarFicha(p.id, 'dkas', f, 'Fecha de entrega puesta sola: ' + fechaCorta(f.entrega) + ' (' + dias() + ' días).'); p.fichas = Object.assign({}, p.fichas, { dkas: f }); }
    if (est !== p.estado) { await A.staffEstado(p.id, est); p.estado = est; toast('Pasó solo a: ' + A.estado(est)); }
  }

  // ---------- entrar ----------
  async function arrancar() {
    try { me = await A.yo(); } catch (e) { me = null; }
    if (!me) return login();
    if (!me.nombre) return nombre();
    $('#top-nav').hidden = false;
    main.innerHTML = '<p class="cargando">Cargando…</p>';
    await recargar(); if (!location.hash) history.replaceState(null, '', '#clientes'); ruta(); barraAvisos(); vigilar();
  }
  function login(err) {
    $('#top-nav').hidden = true;
    main.innerHTML = '<div class="login"><h1>Panel DKAS</h1><p class="sub">Escribe el código de 6 números.</p><input id="cod" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••"><p class="err" id="lerr"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</p></div>';
    const i = $('#cod'); i.focus();
    i.addEventListener('input', async () => { i.value = i.value.replace(/\D/g, ''); if (i.value.length === 6) { i.disabled = true; try { await A.entrarConCodigo(i.value); arrancar(); } catch (e) { login(e.message); } } });
  }
  function nombre() {
    main.innerHTML = '<div class="login"><h1>¿Quién eres?</h1><p class="sub">Tu nombre queda en lo que registres.</p><input id="nom" placeholder="Tu nombre"><button class="btn negro grande" id="nok">Entrar</button></div>';
    $('#nok').onclick = async () => { try { await A.ponerNombre($('#nom').value); arrancar(); } catch (e) { alerta(e.message); } };
  }
  async function recargar() {
    const [l, c] = await Promise.all([A.listar(), A.config().catch(() => ({}))]);
    todos = l; cfg = c || {};
    // las bases diseñadas en el panel (Diseñar bases) entran al sistema como cualquier otra
    try { const bs = await A.basesPublicas(); Object.entries(bs || {}).forEach(([id, b]) => D.registrarBase(id, b)); } catch (e) {}
    // las bases que dibujaron los clientes (cada una solo para su mesa)
    try { const bc = await A.basesClientes(); Object.entries(bc || {}).forEach(([k, b]) => D.registrarBase('c-' + k.slice(0, 10), Object.assign({ desc: 'Diseñada por el cliente.' }, b, { cli: true }))); } catch (e) {}
  }

  // ---------- rutas: # (pedidos y logística) · #taller · #p=id · #t=id · #precios · #nuevo ----------
  function ruta() {
    const h = location.hash, sec = /^#(taller|t=)/.test(h) ? 'taller' : h === '#precios' ? 'precios' : h === '#bases' ? 'bases' : h === '#visitas' ? 'visitas' : h === '#agenda' ? 'agenda' : h === '#mas' || h === '#visitas' || h === '#bases' || h === '#precios' ? 'mas' : h === '#clientes' || h === '#accesos' || /^#prop=/.test(h) ? 'clientes' : h === '#accesos' ? 'accesos' : 'log';
    if (h !== '#bases' && window.DKAS_DISENA) DKAS_DISENA.salir();
    $$('#top-nav a[data-sec]').forEach(a => { a.classList.toggle('on', a.dataset.sec === sec); if (a.dataset.sec === sec && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    if (h === '#precios') return precios();
    main.onclick = null; contarSolicitudes(); if (h !== '#agenda') { editando = null; contarAgenda(); }
    if (h === '#clientes') return clientes();
    if (h === '#mas') return mas();
    if (/^#prop=[0-9a-f]{32}$/.test(h)) return propuesta(h.slice(6));
    if (h === '#agenda') return agenda();
    if (h === '#visitas') return visitas();
    if (h === '#accesos') return accesos();
    if (h === '#bases') return DKAS_DISENA.pantalla(main, { toast, alerta });
    if (h === '#nuevo') return nuevo();
    if (h === '#taller') return lista('taller');
    const id = (h.match(/^#([pt])=([\w-]+)/) || []);
    if (id[2]) { const p = todos.find(x => x.id === id[2]); if (p) return pedido(p, id[1] === 't' ? 'taller' : 'log'); }
    lista('log');
  }
  window.addEventListener('hashchange', () => { if (me && me.nombre) { ruta(); scrollTo(0, 0); } });

  // ---------- las listas ----------
  function lista(modo) {
    const tall = modo === 'taller';
    const ver = ordenados(todos.filter(p => filtro === 'todos' || (filtro === 'activos' ? activo(p) : p.estado === 'entregado'))
      .filter(p => !busca || (p.nombre + ' ' + p.folio + ' ' + (p.tel || '') + ' ' + (ficha(p).herrero || '') + ' ' + JSON.stringify(p.items)).toLowerCase().includes(busca.toLowerCase())));
    const act = todos.filter(activo), cuenta = g => act.filter(p => entrega(p).g === g).length;
    let html = '<div class="cab"><div><h1>' + (tall ? 'Taller y creación' : 'Pedidos y logística') + '</h1><p class="sub">'
      + (tall ? 'Lo que cuesta cada mesa, cuánto ganamos, quién la hace y su orden de compra.' : 'Todo lo que pidieron los clientes. Lo que se entrega primero, arriba.') + '</p></div>'
      + (tall ? '' : '<a class="btn negro" href="#nuevo">+ Nuevo pedido</a>') + '</div>';
    if (!tall) html += '<div class="resumen-g">' + [['tarde', 'Atrasadas', 'mal'], ['semana', 'Esta semana', 'ambar'], ['despues', 'Próximas', ''], ['sin', 'Sin fecha', 'gris']]
      .map(([g, t, c]) => '<div class="rg ' + c + '"><b>' + cuenta(g) + '</b><span>' + t + '</span></div>').join('') + '</div>';
    else {
      const sinCosto = act.filter(p => !numeros(p).k.usaReal).length, bajo = act.filter(p => { const x = numeros(p); return x.pactado && !x.g.ok; }).length, sinH = act.filter(p => !ficha(p).herrero).length;
      html += '<div class="resumen-g"><div class="rg ' + (bajo ? 'mal' : '') + '"><b>' + bajo + '</b><span>Ganancia baja</span></div><div class="rg ' + (sinCosto ? 'ambar' : '') + '"><b>' + sinCosto + '</b><span>Sin costos reales</span></div><div class="rg ' + (sinH ? 'ambar' : '') + '"><b>' + sinH + '</b><span>Sin herrero</span></div><div class="rg"><b>' + act.length + '</b><span>Mesas activas</span></div></div>';
    }
    html += '<div class="filtros">' + [['activos', 'Activos'], ['entregado', 'Entregados'], ['todos', 'Todos']].map(([k, t]) => '<button class="pill' + (filtro === k ? ' sel' : '') + '" data-f="' + k + '">' + t + '</button>').join('')
      + '<input id="busca" placeholder="Buscar cliente, folio o herrero" value="' + esc(busca) + '"></div>';
    if (!tall && filtro === 'activos' && !busca) {
      const tareas = ordenados(act).filter(p => accion(p) && p.estado !== 'cotizado').slice(0, 6);
      if (tareas.length) html += '<div class="hoy"><h3>Para hoy</h3><ol>' + tareas.map(p => { const e = entrega(p); return '<li><button data-hacer="' + p.id + '"><b>' + esc(accion(p).txt) + '</b><span>' + esc(p.nombre) + ' · #' + p.folio + '</span><em class="ent ' + e.cls + '">' + esc(e.txt) + '</em></button></li>'; }).join('') + '</ol></div>';
    }
    if (!ver.length) html += '<p class="vacio">No hay pedidos aquí.</p>';
    else html += tall ? '<div class="thead ft"><span></span><span>Cliente y mesa</span><span>Herrero</span><span>Nos cuesta</span><span>Precio y ganancia</span></div>'
      : '<div class="thead fl"><span></span><span>Cliente y mesa</span><span>Entrega</span><span>Herrero</span><span>Estado</span></div>';
    GRUPOS.forEach(([g, t]) => {
      const l = ver.filter(p => entrega(p).g === g); if (!l.length) return;
      html += '<h3 class="grupo g-' + g + '">' + t + ' <small>' + l.length + '</small></h3><div class="lista">' + l.map(p => tall ? filaTaller(p) : filaLog(p)).join('') + '</div>';
    });
    main.innerHTML = html;
    $$('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; lista(modo); });
    $$('[data-hacer]').forEach(b => b.onclick = () => accion(todos.find(z => z.id === b.dataset.hacer)).run('log'));
    const bi = $('#busca'); bi.oninput = () => { busca = bi.value; clearTimeout(lista.t); lista.t = setTimeout(() => { lista(modo); const n = $('#busca'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
    fotos();
  }
  function filaLog(p) {
    const m = mesaDe(p), e = entrega(p), f = ficha(p), n = cantidad(p);
    return '<a class="fila fl" href="#p=' + p.id + '"><img data-foto="' + p.token + '" alt="">'
      + '<div class="c-cli"><b>' + esc(p.nombre) + ' <small>#' + p.folio + '</small></b>'
      + '<span>' + esc(D.medida(m)) + ' · ' + esc(D.FORMAS[m.forma]) + (n > 1 ? ' · ' + n + ' mesas' : '') + ' · ' + esc(D.piedra(m.piedra).nombre) + '</span>'
      + '<span>' + esc(conBase(p)) + ' ' + esc(colorDe(p).toLowerCase()) + ' · <i class="mod' + (modeloDe(p).nuestro ? ' cat' : '') + '">' + esc(modeloDe(p).txt) + '</i></span></div>'
      + '<div class="c-ent"><span class="ent ' + e.cls + '">' + esc(e.txt) + '</span>' + (e.f ? '<small>' + fechaCorta(e.f) + '</small>' : '') + '</div>'
      + '<div class="c-her"><span class="herr' + (f.herrero ? '' : ' falta') + '">' + (f.herrero ? esc(f.herrero) : 'Sin herrero') + '</span></div>'
      + '<div class="c-est"><span class="est e-' + p.estado + '">' + A.estado(p.estado) + '</span><em class="sigue">' + esc(sigue(p)) + '</em></div></a>';
  }
  function filaTaller(p) {
    const m = mesaDe(p), x = numeros(p), f = ficha(p), e = entrega(p);
    return '<a class="fila ft" href="#t=' + p.id + '"><img data-foto="' + p.token + '" alt="">'
      + '<div class="c-cli"><b>' + esc(p.nombre) + ' <small>#' + p.folio + '</small></b>'
      + '<span>' + esc(D.medida(m)) + ' · ' + esc(D.piedra(m.piedra).nombre) + ' · ' + esc(conBase(p, 'base')) + ' ' + esc(colorDe(p).toLowerCase()) + '</span>'
      + '<span><i class="mod' + (modeloDe(p).nuestro ? ' cat' : '') + '">' + esc(modeloDe(p).txt) + '</i> · ' + esc(e.txt) + '</span></div>'
      + '<div class="c-her"><span class="herr' + (f.herrero ? '' : ' falta') + '">' + (f.herrero ? esc(f.herrero) : 'Sin herrero') + '</span></div>'
      + '<div class="c-cos"><b>' + pesos(x.costo) + '</b><small>' + (x.k.usaReal ? 'costos reales' : 'aproximado') + '</small></div>'
      + '<div class="c-pre">' + (x.pactado ? '<b>' + pesos(x.pactado) + '</b><span class="marg ' + (x.g.ok ? 'bien' : 'mal') + '">' + x.g.pct + '% ganancia</span>' : '<span class="marg mal">Sin precio</span>') + '</div></a>';
  }
  const fcache = {};
  function fotos() {
    $$('img[data-foto]').forEach(async im => {
      const t = im.dataset.foto;
      if (!(t in fcache)) fcache[t] = A.verFoto(t).catch(() => null);
      const u = await fcache[t]; if (u) im.src = u; else im.classList.add('sin');
    });
  }

  // ---------- un pedido: dos vistas del mismo pedido ----------
  // la piedra que eligió el cliente: foto de la placa, nombre y acabado (toca la foto para verla grande)
  const piedraCard = m => { const q = D.piedra(m.piedra);
    return '<a class="pied" href="tex/piedras/' + q.id + '.jpg" target="_blank" rel="noopener"><img src="img/piedras/' + q.id + '.jpg" alt="Piedra ' + esc(q.nombre) + '"><span><small>Piedra que eligió</small><b>' + esc(q.nombre) + '</b><i>' + esc(q.desc) + (q.acabado ? ' · ' + esc(q.acabado.toLowerCase()) : '') + ' · 12 mm</i></span></a>'; };
  const sec = (n, t, html, cls) => '<section class="sec ' + (cls || '') + '"><h2><span>' + n + '</span>' + t + '</h2>' + html + '</section>';
  const opts = (o, v) => Object.entries(o).map(([k, t]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  function pedido(p, modo) {
    const m = mesaDe(p), x = numeros(p), f = ficha(p), tel = p.tel ? A.waNum(p.tel) : '', e = entrega(p), tall = modo === 'taller';
    const ac = accion(p);
    const cab = '<a class="volver" href="' + (tall ? '#taller' : '#') + '">← ' + (tall ? 'Taller y creación' : 'Pedidos y logística') + '</a>'
      + '<div class="hcab"><div><p class="folio">Pedido #' + p.folio + ' · ' + A.fecha(p.creado) + (p.canal ? ' · ' + esc(p.canal) : '') + (f.bienvenida ? ' · bienvenida enviada ' + A.fecha(f.bienvenida) : '') + '</p><h1>' + esc(p.nombre) + '</h1>'
      + '<p class="sub">' + esc(D.titulo(m)) + (p.tel ? ' · ' + esc(p.tel) : '') + '</p></div>'
      + (tel ? '<div class="botones"><a class="btn verde" target="_blank" rel="noopener" href="https://wa.me/' + tel + '">WhatsApp</a><a class="btn" target="_blank" rel="noopener" title="Le manda su link para ver cómo va su mesa" href="https://wa.me/' + tel + '?text=' + encodeURIComponent('Hola ' + p.nombre.split(' ')[0] + ', aquí puedes ver cómo va tu mesa DKAS (pedido #' + p.folio + '): ' + SITE + 'pedido.html#t=' + p.token) + '">Mandarle su link</a></div>' : '') + '</div>'
      + etapas(p)
      + (ac ? '<div class="paso-sig"><div><span>Siguiente paso</span><b>' + esc(sigue(p)) + '</b>' + (e.g !== 'fin' ? '<em class="ent ' + e.cls + '">Entrega: ' + esc(e.txt) + (e.f ? ' · ' + fechaCorta(e.f) : '') + '</em>' : '') + '</div><button class="btn oro" id="accion">' + esc(ac.txt) + ' →</button></div>' : '')
      + '<div class="tabs"><a href="#p=' + p.id + '"' + (tall ? '' : ' class="on"') + '>Pedido y logística</a><a href="#t=' + p.id + '"' + (tall ? ' class="on"' : '') + '>Taller y creación</a></div>'
      + (p.notas ? '<p class="nota-cli"><b>El cliente escribió:</b> “' + esc(p.notas) + '”</p>' : '');
    const pie = '<div class="pie-ped">' + (p.estado === 'cancelado' ? '' : '<button class="lnk gris" id="cancelar">Cancelar este pedido</button>') + '</div>';
    const resumen = '<ul class="res">' + resumenP(p).concat([['Modelo', modeloDe(p).txt]]).map(([k, v]) => '<li><span>' + k + '</span><b>' + esc(v) + '</b></li>').join('') + (x.n > 1 ? '<li><span>Cantidad</span><b>' + x.n + ' mesas</b></li>' : '') + '</ul>';
    const hdl = '<datalist id="hlist">' + herreros().map(h => '<option value="' + esc(h) + '">').join('') + '</datalist>';
    if (!tall) {
      main.innerHTML = cab
        + sec(1, 'La mesa', '<div class="mesa"><img id="foto"' + (f.m ? '' : ' data-foto="' + p.token + '"') + ' alt="La mesa del cliente"><div><p class="tit">' + esc(D.titulo(m)) + '</p>' + piedraCard(m) + resumen
          + '<a class="lnk" href="#t=' + p.id + '">Medidas, costos y orden de compra →</a></div></div>')
        + sec(2, 'Entrega y herrero', '<div class="grid2">'
          + '<label>Fecha de entrega<input type="date" data-ent="entrega" value="' + esc(f.entrega || '') + '"></label>'
          + '<label>Herrero que la hace<input data-ent="herrero" list="hlist" placeholder="Escribe o elige" value="' + esc(f.herrero || '') + '"></label>'
          + '<label class="full">Dirección de entrega<input data-ent="dir" placeholder="Calle, número, colonia, ciudad" value="' + esc(f.dir || '') + '"></label>'
          + '<label class="full">Notas de entrega<input data-ent="notaEnt" placeholder="Piso, horario, quién recibe…" value="' + esc(f.notaEnt || '') + '"></label></div>' + hdl
          + '<p class="nota">Se guarda solo. Si no pones fecha, al cobrar el anticipo se pone sola a ' + dias() + ' días.</p>')
        + sec(3, 'Cotización al cliente', '<div id="coti"></div>')
        + sec(4, 'Pagos', '<div id="pagos"></div>')
        + pie + '<div class="guardar" id="gbar" hidden><span>Tienes cambios sin guardar</span><button class="btn negro" id="guardar">Guardar</button></div>';
      pintarCoti(p); pintarPagos(p);
    } else {
      const c = D.calcular(m), lim = D.limites(m.uso, m.forma, m.L), red = D.redonda(m.forma);
      main.innerHTML = cab
        // 1 · la mesa: piedra, base, medidas y herrero
        + sec(1, 'La mesa', '<div class="mesa"><img id="foto"' + (f.m ? '' : ' data-foto="' + p.token + '"') + ' alt="La mesa del cliente"><div><p class="tit">' + esc(D.titulo(m)) + '</p>' + piedraCard(m)
          + '<p class="modelo-l"><i class="mod' + (modeloDe(p).nuestro ? ' cat' : '') + '">' + esc(modeloDe(p).txt) + '</i> · ' + esc(conBase(p, 'base')) + ' ' + esc(colorDe(p).toLowerCase()) + '</p>' + (conjunto(p) ? '<p class="nota">Pedido conjunto: ' + esc(conjunto(p)) + '. Búscalo por nombre para ver los demás.</p>' : '')
          + '<div class="grid2">'
          + '<label>Piedra<select data-m="piedra">' + opts(Object.fromEntries(D.PIEDRAS.map(q => [q.id, q.nombre])), m.piedra) + '</select></label>'
          + '<label>Base<select data-m="base">' + opcBases(m, f.baseOtra) + '</select></label>'
          + (f.baseOtra ? '<label class="full">¿Qué base es?<input data-ent="baseOtra" placeholder="Ej. base de madera del cliente" value="' + esc(f.baseOtra) + '"></label>'
            + '<label class="full">Se parece más a (para calcular cortes y 3D)<select data-m="base">' + opts(Object.fromEntries(D.basesPara(m).map(k => [k, D.BASES[k].nombre])), m.base) + '</select></label>' : '')
          + '<label>Color de la base<select data-ent="color">' + opts(Object.fromEntries(COLORES.map(c => [c, c]).concat(COLORES.includes(colorDe(p)) ? [] : [[colorDe(p), colorDe(p)]]).concat([['__otro', 'Otro color…']])), colorDe(p)) + '</select></label>'
          + '<label>Modelo<select data-ent="modelo">' + opts(Object.fromEntries([['', 'Automático: ' + (!f.modelo && modeloDe(p).nuestro ? modeloDe(p).nombre : (f.modelo ? 'reconocer solo' : 'personalizado'))]].concat(D.MODELOS.map(z => [z.id, z.nombre + ' (catálogo)'])).concat([['otro', 'Otro / fuera de catálogo']])), f.modelo || '') + '</select></label>'
          + (f.modelo === 'otro' ? '<label class="full">Nombre del modelo<input data-ent="modeloOtro" placeholder="Ej. la del cliente con patas cruzadas" value="' + esc(f.modeloOtro || '') + '"></label>' : '')
          + '<label>Herrero<input data-ent="herrero" list="hlist" placeholder="Escribe o elige" value="' + esc(f.herrero || '') + '"></label>'
          + '<label>Entrega<input type="date" data-ent="entrega" value="' + esc(f.entrega || '') + '"></label></div>' + hdl
          + '<details class="cambiar"' + (f.m ? ' open' : '') + '><summary>Cambiar forma o medidas</summary><div class="grid2">'
          + '<label>Uso<select data-m="uso">' + opts(Object.fromEntries(Object.entries(D.USOS).map(([k, u]) => [k, u.nombre])), m.uso) + '</select></label>'
          + '<label>Forma<select data-m="forma">' + opts(Object.fromEntries(D.formasDe(m.uso).map(k => [k, D.FORMAS[k]])), m.forma) + '</select></label>'
          + '<label>' + (red ? (m.forma === 'round' ? 'Diámetro' : 'Lado') : 'Largo') + ' (usual ' + lim.L.join('–') + ')<input type="number" step="1" data-m="L" value="' + m.L + '"></label>'
          + (red ? '' : '<label>Ancho (usual ' + lim.W.join('–') + ')<input type="number" step="1" data-m="W" value="' + m.W + '"></label>')
          + '<label>Altura (estándar ' + D.USOS[m.uso].H + ')<input type="number" step="1" data-m="H" value="' + m.H + '"></label>'
          + '<p class="nota" style="grid-column:1/-1">Factibilidad: <b>' + c.viab.t + '</b>' + (c.viab.pts.length ? ' · ' + c.viab.pts.map(x => esc(x.txt)).join(' · ') : '') + '</p>'
          + '</div><p class="nota">Las medidas son libres; el sistema marca qué tan difícil es. Toca Guardar abajo para que se quede.</p></details></div></div>')
        // 2 · lo que cuesta y lo que ganamos
        + sec(2, 'Costos y ganancia', '<div class="precio"><div class="costos"><p class="nota">Lo que nos cuesta hacer <b>una</b> mesa. Si no sabes un costo, déjalo vacío: se usa el aproximado.</p>'
          + '<label class="lin"><span>Costo aproximado <small>(piedra + base + flete)</small></span><input data-lin="aprox" inputmode="decimal" placeholder="' + (cfg.aprox || D.CFG.aprox) + '" value="' + esc(f.lin && f.lin.aprox != null ? f.lin.aprox : '') + '"></label>'
          + '<p class="o">o captura los costos reales:</p>'
          + D.COSTOS.map(([k, t]) => '<label class="lin"><span>' + t + (k === 'base' && f.herrero ? ' <small>· ' + esc(f.herrero) + '</small>' : k === 'piedra' ? ' <small><i class="mu" style="background-image:url(img/piedras/' + m.piedra + '.jpg)"></i>' + esc(D.piedra(m.piedra).nombre) + '</small>' : '') + '</span><input data-lin="' + k + '" inputmode="decimal" placeholder="' + esc(cfg.costos && cfg.costos[k] ? cfg.costos[k] : '—') + '" value="' + esc(f.lin && f.lin[k] != null ? f.lin[k] : '') + '"></label>').join('')
          + '</div><div class="calc" id="calc"></div></div>')
        // 3 · medidas para el taller
        + sec(3, 'Medidas y cortes', '<div class="kpis">'
          + kpi('Piedra', D.medida(m), c.piedra.m2 + ' m² · ' + c.piedra.aprov + '% de la placa')
          + kpi('MDF negro', m.forma === 'round' ? 'Ø ' + c.mdf.L + ' cm' : c.mdf.L + ' × ' + c.mdf.W + ' cm', '12 mm' + (c.mdf.r ? ' · esquinas r ' + c.mdf.r : ''))
          + kpi('Base ' + baseDe(p), c.base.L + ' × ' + c.base.W + ' cm', 'altura ' + c.base.H + ' cm' + (m.base === 'ped' ? ' · plato Ø ' + c.base.plato : ''))
          + kpi('Volado', m.forma === 'round' ? c.volado.L + ' cm' : c.volado.L + ' / ' + c.volado.W + ' cm', 'cabeceras / lados')
          + kpi('Personas', c.personas || '—', '70 cm por persona') + kpi('PTR', c.metros + ' m', c.piedra.peso + ' kg de piedra') + '</div>'
          + (f.baseOtra ? '<p class="aviso-rojo">Base especial: "' + esc(f.baseOtra) + '". Los cortes y medidas de abajo son de la base ' + esc(D.BASES[m.base].nombre) + ' como referencia; confírmalos con el herrero.</p>' : '')
          + (c.avisos.length ? '<ul class="avisos">' + c.avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '')
          + '<table class="cortes"><tr><th>Pieza</th><th>Cant.</th><th>Medida</th><th>Material</th></tr>' + c.cortes.map(z => '<tr><td>' + esc(z.pieza) + '</td><td>' + z.cant + '</td><td>' + z.med + ' cm</td><td>' + esc(z.mat) + '</td></tr>').join('') + '</table>')
        // 4 · croquis
        + sec(4, 'Croquis', '<div class="croquis" id="croquis">' + CQ.svg(m, { folio: p.folio, cliente: p.nombre }) + '</div><div class="botones"><button class="btn" id="cq-bajar">Descargar croquis</button><button class="btn verde" id="cq-wa">Mandar croquis por WhatsApp</button></div>', 'ancho')
        // 5 · orden de compra
        + sec(5, 'Orden de compra', '<p class="nota">La hoja con nuestro logo, la foto de la mesa, el croquis, las medidas, el herrero, la entrega y el precio. Para el cliente, el herrero o el archivo.</p>'
          + '<div class="grid2"><label>Precio en la orden<input id="oc-precio" inputmode="decimal" placeholder="Si lo dejas vacío: el precio pactado" value="' + esc(f.ocPrecio != null ? f.ocPrecio : '') + '"></label>'
          + '<label>Para<select id="oc-para">' + opts({ cliente: 'El cliente (precio de venta)', herrero: 'El herrero (lo que le pagamos)' }, f.ocPara || 'cliente') + '</select></label></div>'
          + '<div class="oc-vista"><img id="oc-img" alt="Orden de compra"></div>'
          + '<div class="botones"><button class="btn negro" id="oc-bajar">Descargar</button><button class="btn verde" id="oc-wa">Mandar por WhatsApp</button><button class="btn" id="oc-print">Imprimir / PDF</button></div>', 'ancho')
        + pie + '<div class="guardar" id="gbar" hidden><span>Tienes cambios sin guardar</span><button class="btn negro" id="guardar">Guardar</button></div>';
      pintarPrecio(p);
      $$('[data-lin],#pactado').forEach(el => el.oninput = () => leerPrecio(p));
      $$('[data-m]').forEach(el => el.onchange = () => {
        if (el.value === '__otra') return guardarEntrega(p, 'baseOtra', 'Otra base', 'taller', '[data-ent="baseOtra"]');
        if (el.dataset.m === 'base' && el.closest('label').textContent.indexOf('Se parece') < 0 && f.baseOtra) { const fi = Object.assign({}, ficha(p)); delete fi.baseOtra; p.fichas = Object.assign({}, p.fichas, { dkas: fi }); }
        const nm = D.normalizar(Object.assign({}, m, { [el.dataset.m]: el.type === 'number' ? +el.value : el.value }));
        p.fichas = Object.assign({}, p.fichas, { dkas: Object.assign({}, ficha(p), { m: { uso: nm.uso, forma: nm.forma, L: nm.L, W: nm.W, base: nm.base, piedra: nm.piedra } }) });
        const y = scrollY; pedido(p, 'taller'); scrollTo(0, y); $('#gbar').hidden = false;
      });
      $('#cq-bajar').onclick = async () => bajar(await CQ.png(m, { folio: p.folio, cliente: p.nombre }), 'croquis-' + p.folio + '.jpg');
      $('#cq-wa').onclick = async () => compartir([new File([await CQ.png(m, { folio: p.folio, cliente: p.nombre })], 'croquis-' + p.folio + '.jpg', { type: 'image/jpeg' })], 'Croquis de la mesa DKAS (pedido #' + p.folio + '): ' + D.titulo(m), tel);
      // orden de compra: se dibuja al momento y se guarda el precio y para quién
      const oc = () => { const fi = Object.assign({}, ficha(p)); const v = num($('#oc-precio').value); if (v === '') delete fi.ocPrecio; else fi.ocPrecio = v; fi.ocPara = $('#oc-para').value; p.fichas = Object.assign({}, p.fichas, { dkas: fi }); $('#gbar').hidden = false; clearTimeout(oc.t); oc.t = setTimeout(() => pintarOC(p), 400); };
      $('#oc-precio').oninput = oc; $('#oc-para').onchange = oc;
      $('#oc-bajar').onclick = async () => bajar(await ordenCompra(p), 'orden-' + p.folio + '.jpg');
      $('#oc-wa').onclick = async () => compartir([new File([await ordenCompra(p)], 'orden-' + p.folio + '.jpg', { type: 'image/jpeg' })], 'Orden de compra DKAS · pedido #' + p.folio + ' · ' + D.titulo(m), ficha(p).ocPara === 'herrero' ? '' : tel);
      $('#oc-print').onclick = async () => imprimir(await ordenCompra(p), p);
      pintarOC(p);
    }
    fotos();
    // entrega y herrero: se guardan solos
    $$('[data-ent]').forEach(el => el.onchange = () => {
      if (el.value === '__otro') { const c = (prompt('¿Qué color?') || '').trim(); if (!c) { el.value = colorDe(p); return; } return guardarEntrega(p, 'color', c, modo); }
      guardarEntrega(p, el.dataset.ent, el.value.trim(), modo);
    });
    $$('[data-etapa]').forEach(b => b.onclick = () => ponerEstado(p, b.dataset.etapa, modo));
    if ($('#accion')) $('#accion').onclick = () => ac.run(modo);
    if ($('#cancelar')) $('#cancelar').onclick = () => { if (confirm('¿Cancelar el pedido #' + p.folio + '?')) ponerEstado(p, 'cancelado', modo); };
    if (enfocar) { const q = enfocar; enfocar = null; setTimeout(() => { const el = $(q); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (el.tagName === 'BUTTON') el.click(); else el.focus(); el.classList.add('brilla'); setTimeout(() => el.classList.remove('brilla'), 2200); }, 150); }
    $('#guardar').onclick = () => guardar(p);
    if (f.m) fotoNueva(p); // la mesa se cambió en el taller: la foto se dibuja de nuevo
  }
  // la barra de avance del pedido: se toca una etapa para moverlo
  const ETAPAS = ['nuevo', 'cotizado', 'confirmado', 'fabricacion', 'listo', 'entregado'];
  function etapas(p) {
    if (p.estado === 'cancelado') return '<div class="cancelado">Este pedido está cancelado. <button class="lnk" data-etapa="nuevo">Reactivarlo</button></div>';
    const i = ETAPAS.indexOf(p.estado);
    return '<ol class="etapas" data-estado="' + p.estado + '">' + ETAPAS.map((s, k) => '<li class="' + (k < i ? 'hecho' : k === i ? 'on' : '') + '"><button data-etapa="' + s + '"><i>' + (k < i ? '✓' : k + 1) + '</i><span>' + A.estado(s) + '</span></button></li>').join('') + '</ol>';
  }
  async function ponerEstado(p, s, modo) {
    if (s === p.estado) return;
    try { await A.staffEstado(p.id, s); p.estado = s; toast('Ahora: ' + A.estado(s)); if (modo) { const y = scrollY; pedido(p, modo); scrollTo(0, y); } } catch (z) { alerta(z.message); }
  }
  // el botón grande: hace el siguiente paso o te lleva justo donde se hace
  let enfocar = null;
  function accion(p) {
    const x = numeros(p), f = ficha(p), anticipo = Math.ceil(x.pactado / 2);
    const ir = (tab, sel) => modo => { enfocar = sel; const h = '#' + tab + '=' + p.id; if (location.hash === h) pedido(p, modo); else location.hash = h; };
    const est = s => modo => ponerEstado(p, s, location.hash.startsWith('#t=') ? 'taller' : location.hash.startsWith('#p=') ? 'log' : null).then(() => { if (!location.hash.match(/^#[pt]=/)) ruta(); });
    switch (p.estado) {
      case 'nuevo': if (!f.bienvenida && p.tel) return { txt: 'Mandar bienvenida', run: modo => bienvenida(p, modo) };
        return x.pactado ?{ txt: 'Mandar cotización', run: ir('p', '#mandar') } : { txt: 'Poner precio', run: ir('t', '#pactado') };
      case 'cotizado': return { txt: 'Registrar anticipo', run: ir('p', '#pmonto') };
      case 'confirmado': return x.pagado < anticipo ? { txt: 'Registrar anticipo', run: ir('p', '#pmonto') } : !f.herrero ? { txt: 'Asignar herrero', run: ir('p', '[data-ent="herrero"]') } : { txt: 'Mandar a fabricar', run: est('fabricacion') };
      case 'fabricacion': return { txt: 'Marcar como lista', run: est('listo') };
      case 'listo': return x.pagado < x.pactado ? { txt: 'Cobrar saldo', run: ir('p', '#pmonto') } : { txt: 'Marcar entregada', run: est('entregado') };
    }
    return null;
  }
  // el primer mensaje al cliente: profesional, sin detalles del pedido, y solo una vez
  function textoBienvenida(p) {
    const h = new Date().getHours(), saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const n = String(p.nombre || '').trim().split(/\s+/)[0] || '', nombre = n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
    const hola = '¡Hola' + (nombre ? ', ' + nombre : '') + '!';
    // tres versiones; al mandar, el dueño escoge cuál
    return [
      { t: 'Cálida', txt: hola + ' Soy Zury, de DKAS 👋\n\nMe llegó la mesa que diseñaste. Me encantaría platicarla contigo para afinar los detalles y que quede exactamente como la imaginas.\n\n¿Cuándo te queda bien? Quedo pendiente.' },
      { t: 'Profesional', txt: saludo + (nombre ? ', ' + nombre : '') + '. Soy Zury, de DKAS · Piedra Sinterizada.\n\nGracias por diseñar tu mesa con nosotros. Antes de prepararte la propuesta, me gustaría conocer un poco más tu espacio y lo que tienes en mente.\n\n¿Cuándo lo platicamos? Cuando tú puedas, aquí estoy.' },
      { t: 'Corta', txt: hola + ' Soy Zury, de DKAS. Ya vi tu diseño 🙌\n\n¿Cuándo lo platicamos para dejarla perfecta? Quedo pendiente.' },
    ];
  }
  function bienvenida(p, modo) {
    const ops = textoBienvenida(p), v = document.createElement('div');
    v.className = 'bv-fondo';
    v.innerHTML = '<div class="bv" role="dialog" aria-modal="true"><h3>¿Cuál le mandas a ' + esc(String(p.nombre || '').split(' ')[0]) + '?</h3>'
      + ops.map((o, i) => '<button class="bv-op" data-i="' + i + '"><b>' + o.t + '</b><span>' + esc(o.txt).replace(/\n/g, '<br>') + '</span></button>').join('')
      + '<button class="lnk gris" data-x>Cancelar</button></div>';
    document.body.appendChild(v);
    v.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { v.remove(); mandarBienvenida(p, modo, ops[+b.dataset.i].txt); } else if (e.target === v || e.target.closest('[data-x]')) v.remove(); };
  }
  async function mandarBienvenida(p, modo, txt) {
    window.open('https://wa.me/' + A.waNum(p.tel) + '?text=' + encodeURIComponent(txt), '_blank'); // antes de cualquier await, para que no lo bloquee el navegador
    try { await navigator.clipboard.writeText(txt); } catch (e) {}
    const f = Object.assign({}, ficha(p), { bienvenida: Date.now() });
    try {
      await A.guardarFicha(p.id, 'dkas', JSON.parse(JSON.stringify(f)), 'Se le mandó la bienvenida por WhatsApp.');
      p.fichas = Object.assign({}, p.fichas, { dkas: f });
      toast('Bienvenida lista en WhatsApp. También quedó copiada: si no se abrió, pégala en el chat.');
      if (location.hash.match(/^#[pt]=/)) { const y = scrollY; pedido(p, modo === 'taller' ? 'taller' : 'log'); scrollTo(0, y); } else ruta();
    } catch (e) { alerta(e.message); }
  }
  const kpi = (t, v, s) => '<div class="kpi"><span>' + t + '</span><b>' + esc(v) + '</b><small>' + esc(s) + '</small></div>';
  async function guardarEntrega(p, k, v, modo, foco) {
    const f = Object.assign({}, ficha(p)); if (v) f[k] = v; else delete f[k];
    const txt = { entrega: v ? 'Fecha de entrega: ' + fechaCorta(v) : 'Quitó la fecha de entrega', herrero: v ? 'Herrero: ' + v : 'Quitó el herrero', dir: 'Dirección de entrega: ' + v, notaEnt: 'Notas de entrega: ' + v, baseOtra: v ? 'Base: ' + v + ' (otra)' : 'Base de las nuestras', color: 'Color de base: ' + v, modelo: 'Modelo: ' + (v ? (D.MODELOS.find(z => z.id === v) || { nombre: 'fuera de catálogo' }).nombre : 'automático'), modeloOtro: 'Nombre del modelo: ' + v }[k];
    try {
      await A.guardarFicha(p.id, 'dkas', JSON.parse(JSON.stringify(Object.assign({}, f, { actualizado: Date.now() }))), txt + '.');
      p.fichas = Object.assign({}, p.fichas, { dkas: f }); toast('Guardado');
      if (k === 'herrero') await avanzar(p);
      if (foco) enfocar = foco;
      const y = scrollY; pedido(p, modo); scrollTo(0, y); // lo que estaba sin guardar se guardó junto
    } catch (e) { alerta(e.message); }
  }
  // si se cambió la mesa, la foto se vuelve a dibujar en 3D
  async function fotoNueva(p) {
    const url = await foto3d(mesaDe(p)); const im = $('#foto'); if (im && url) { im.src = url; im.classList.remove('sin'); }
  }
  let visor = null;
  function foto3d(m) {
    if (!window.DKAS3D) return Promise.resolve(null);
    if (!visor) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:-2000px;top:0;width:600px;height:400px'; document.body.appendChild(d); visor = DKAS3D.crear(d, { tex: 'tex/piedras/1k/', fondo: 0xf3f1ed }); }
    return Promise.resolve(visor.mostrar(m)).then(() => visor.listo && visor.listo()).then(() => visor.foto(1200, 800)).catch(() => null);
  }
  const fotoMesa = async p => (ficha(p).m ? await foto3d(mesaDe(p)) : null) || (await A.verFoto(p.token).catch(() => null)) || await foto3d(mesaDe(p));

  function leerPrecio(p) {
    const f = Object.assign({}, ficha(p)), lin = {};
    $$('[data-lin]').forEach(i => { const v = num(i.value); if (v !== '') lin[i.dataset.lin] = v; });
    f.lin = lin; const pa = $('#pactado'); if (pa) f.pactado = num(pa.value) || '';
    p.fichas = Object.assign({}, p.fichas, { dkas: f }); $('#gbar').hidden = false;
    pintarPrecio(p, true); clearTimeout(leerPrecio.t); leerPrecio.t = setTimeout(() => { if ($('#oc-img')) pintarOC(p); }, 500);
  }
  function pintarPrecio(p, sinPactado) {
    const x = numeros(p), f = ficha(p), el = $('#calc');
    const pact = sinPactado && $('#pactado') ? null : '<label class="pactado"><span>Precio que pactamos con el cliente' + (x.n > 1 ? ' (las ' + x.n + ' mesas)' : '') + '</span><input id="pactado" inputmode="decimal" placeholder="' + x.sugerido + '" value="' + esc(f.pactado || (p.cotizacion && p.cotizacion.total) || '') + '"></label>';
    const res = '<div class="cifras"><div><span>Nos cuesta' + (x.n > 1 ? ' (' + x.n + ' mesas)' : '') + '</span><b>' + pesos(x.costo) + '</b><small>' + (x.k.usaReal ? 'costos reales' + (x.k.faltan.length ? ' · falta: ' + esc(x.k.faltan.join(', ')) : '') : 'aproximado') + '</small></div>'
      + '<div><span>Precio sugerido (' + x.minimo + '%)</span><b>' + pesos(x.sugerido) + '</b><button class="lnk" id="usar">Usar este precio</button></div>'
      + '<div class="gan ' + (x.pactado ? (x.g.ok ? 'bien' : 'mal') : '') + '"><span>Ganancia</span><b>' + (x.pactado ? pesos(x.g.pesos) : '—') + '</b><small>' + (x.pactado ? x.g.pct + '% sobre el costo' + (x.g.ok ? '' : ' · menos de ' + x.minimo + '%') : 'pon el precio pactado') + '</small></div></div>';
    if (pact) { el.innerHTML = pact + '<div id="cifras">' + res + '</div>'; $('#pactado').oninput = () => leerPrecio(p); }
    else $('#cifras').innerHTML = res;
    $('#usar').onclick = () => { $('#pactado').value = x.sugerido; leerPrecio(p); };
  }
  async function guardar(p) {
    const b = $('#guardar'); b.disabled = true;
    try {
      const f = ficha(p), x = numeros(p);
      await A.guardarFicha(p.id, 'dkas', JSON.parse(JSON.stringify(Object.assign({}, f, { actualizado: Date.now() }))), 'Actualizó la mesa y el precio' + (x.pactado ? ': ' + pesos(x.pactado) + ' (' + x.g.pct + '% de ganancia)' : '') + '.');
      $('#gbar').hidden = true; toast('Guardado');
    } catch (e) { alerta(e.message); }
    b.disabled = false;
  }

  // ---------- cotización: se guarda en el pedido (el cliente la ve en su link) y se manda por WhatsApp con la foto ----------
  function pintarCoti(p) {
    const x = numeros(p), m = mesaDe(p), c = p.cotizacion, el = $('#coti'), anticipo = Math.ceil(x.pactado / 2);
    el.innerHTML = piedraCard(m) + (c ? '<p class="ok-c">Enviada el ' + A.fecha(c.enviada) + ' por ' + pesos(c.total) + (c.aceptada ? ' · <b>el cliente la aceptó</b>' : ' · esperando respuesta') + '</p>' : '')
      + (x.pactado ? '<div class="cifras"><div><span>Total</span><b>' + pesos(x.pactado) + '</b></div><div><span>Anticipo 50%</span><b>' + pesos(anticipo) + '</b><small>para empezar a fabricar</small></div><div><span>Saldo al entregar</span><b>' + pesos(x.pactado - anticipo) + '</b></div></div>'
        + (x.g.ok ? '' : '<p class="aviso-rojo">Ojo: la ganancia es de ' + x.g.pct + '%, menos del ' + x.minimo + '%. Puedes mandarla igual.</p>')
        + '<div class="botones"><button class="btn negro" id="mandar">' + (c ? 'Mandar de nuevo' : 'Mandar cotización') + ' por WhatsApp</button><button class="btn" id="cimg">Descargar imagen</button></div>'
        : '<p class="nota">Primero pon el precio en <a class="lnk" href="#t=' + p.id + '">Taller y creación</a>.</p>');
    if (!x.pactado) return;
    $('#cimg').onclick = async () => bajar(await imagenCoti(p), 'cotizacion-' + p.folio + '.jpg');
    $('#mandar').onclick = async () => {
      const b = $('#mandar'); b.disabled = true;
      try {
        const cot = { total: x.pactado, anticipo, mesa: [m.uso, m.forma, m.L, m.W, m.base, m.piedra].join('.'), items: [{ titulo: D.titulo(m), cantidad: x.n, precio: Math.round(x.pactado / x.n) }],
          detalle: resumenP(p).map(([k, v]) => k + ': ' + v).join(' · '), condiciones: 'Anticipo del 50% para empezar a fabricar; el saldo se paga al entregar.' };
        await A.enviarCotizacion(p.id, cot); p.cotizacion = Object.assign({}, cot, { enviada: Date.now() }); if (p.estado === 'nuevo') p.estado = 'cotizado';
        const tel = p.tel ? A.waNum(p.tel) : '';
        const txt = 'Hola ' + p.nombre.split(' ')[0] + ', te mando la cotización de tu mesa DKAS (pedido #' + p.folio + '):\n• ' + D.titulo(m) + '\n• Piedra ' + D.piedra(m.piedra).nombre + ' · base ' + baseDe(p)
          + (x.n > 1 ? '\n• ' + x.n + ' mesas' : '') + '\nTotal: ' + pesos(x.pactado) + '\nAnticipo para empezar: ' + pesos(anticipo) + '\nAquí la ves y la aceptas: ' + SITE + 'pedido.html#t=' + p.token;
        const files = [new File([await imagenCoti(p)], 'cotizacion-' + p.folio + '.jpg', { type: 'image/jpeg' }), new File([await CQ.png(m, { folio: p.folio, cliente: p.nombre })], 'croquis-' + p.folio + '.jpg', { type: 'image/jpeg' })];
        pedido(p, 'log'); await compartir(files, txt, tel); // primero se ve como cotizado; luego se abre WhatsApp
      } catch (e) { alerta(e.message); }
      if ($('#mandar')) $('#mandar').disabled = false;
    };
  }
  const cargarImg = src => new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  // imagen de la cotización (1080 × 1350): logo, foto de la mesa, datos y precio
  async function imagenCoti(p) {
    const x = numeros(p), m = mesaDe(p), cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1080, 1350);
    const logo = await cargarImg('img/dkas-oscuro.png'); if (logo) g.drawImage(logo, 70, 60, logo.width * 70 / logo.height, 70);
    g.fillStyle = '#6e6962'; g.font = '600 26px Inter,Arial'; g.textAlign = 'right'; g.fillText('COTIZACIÓN · PEDIDO #' + p.folio, 1010, 108); g.textAlign = 'left';
    const fi = await cargarImg(await fotoMesa(p)); if (fi) { g.save(); g.beginPath(); g.roundRect ? g.roundRect(70, 170, 940, 627, 24) : g.rect(70, 170, 940, 627); g.clip(); g.drawImage(fi, 70, 170, 940, 627); g.restore(); }
    g.fillStyle = '#1a1917'; g.font = '500 44px "Cormorant Garamond",Georgia,serif'; g.fillText('Para ' + p.nombre, 70, 875);
    g.font = '400 27px Inter,Arial'; g.fillStyle = '#1a1917';
    const filas = resumenP(p).concat(x.n > 1 ? [['Cantidad', x.n + ' mesas']] : []);
    filas.forEach(([k, v], i) => { const y = 935 + Math.floor(i / 2) * 44, xx = i % 2 ? 560 : 70; g.fillStyle = '#6e6962'; g.fillText(k, xx, y); g.fillStyle = '#1a1917'; g.fillText(String(v), xx + 140, y); });
    g.fillStyle = '#f6f4f0'; g.fillRect(70, 1110, 940, 160);
    g.fillStyle = '#6e6962'; g.font = '600 24px Inter,Arial'; g.fillText('TOTAL', 110, 1160); g.fillText('ANTICIPO 50%', 600, 1160);
    g.fillStyle = '#1a1917'; g.font = '700 56px Inter,Arial'; g.fillText(pesos(x.pactado), 110, 1230); g.fillText(pesos(Math.ceil(x.pactado / 2)), 600, 1230);
    g.fillStyle = '#6e6962'; g.font = '400 22px Inter,Arial'; g.fillText('WhatsApp ' + WA.map(w => w.label).join(' · ') + '  ·  dkas.mx', 70, 1315);
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.9));
  }

  // ---------- orden de compra (1240 × 1754, tamaño carta vertical): logo, foto, croquis, medidas, herrero, entrega y precio ----------
  function precioOC(p) {
    const f = ficha(p), x = numeros(p), para = f.ocPara || 'cliente';
    if (f.ocPrecio != null && f.ocPrecio !== '') return +f.ocPrecio;
    return para === 'herrero' ? (x.k.val('base') || 0) * x.n : x.pactado;
  }
  async function ordenCompra(p) {
    const m = mesaDe(p), c = D.calcular(m), f = ficha(p), x = numeros(p), para = f.ocPara || 'cliente', W = 1240, H = 1754;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const txt = (t, xx, y, font, color, al) => { g.font = font; g.fillStyle = color; g.textAlign = al || 'left'; g.fillText(t, xx, y); g.textAlign = 'left'; };
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    // encabezado
    g.fillStyle = '#0e0c0a'; g.fillRect(0, 0, W, 170);
    const logo = await cargarImg('img/dkas-claro.png'); if (logo) g.drawImage(logo, 70, 45, logo.width * 80 / logo.height, 80);
    txt('ORDEN DE COMPRA', W - 70, 82, '600 30px Inter,Arial', '#c2a273', 'right');
    txt('Pedido #' + p.folio + ' · ' + new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }), W - 70, 124, '400 24px Inter,Arial', '#d9d1c3', 'right');
    // datos
    const datos = [['Cliente', p.nombre], ['Teléfono', p.tel || '—'], ['Herrero', f.herrero || 'Por asignar'], ['Entrega', f.entrega ? fechaCorta(f.entrega) : 'Por definir'], ['Dirección', f.dir || '—']];
    datos.forEach(([k, v], i) => { const y = 225 + Math.floor(i / 2) * 64, xx = i % 2 ? 660 : 70; txt(k.toUpperCase(), xx, y, '600 18px Inter,Arial', '#8a8378'); txt(String(v).slice(0, 44), xx, y + 30, '500 26px Inter,Arial', '#1a1917'); });
    // foto y medidas
    const y0 = 420, fi = await cargarImg(await fotoMesa(p));
    if (fi) { g.save(); g.beginPath(); g.roundRect ? g.roundRect(70, y0, 560, 373, 18) : g.rect(70, y0, 560, 373); g.clip(); g.drawImage(fi, 70, y0, 560, 373); g.restore(); }
    txt(D.titulo(m), 660, y0 + 30, '500 30px "Cormorant Garamond",Georgia,serif', '#1a1917');
    const filas = resumenP(p).filter(r => r[0] !== 'Uso').concat([['Modelo', modeloDe(p).nuestro ? modeloDe(p).nombre + ' (catálogo)' : (f.modelo === 'otro' ? (f.modeloOtro || 'Personalizado') : 'Personalizado')], ['MDF', m.forma === 'round' ? 'Ø ' + c.mdf.L + ' cm' : c.mdf.L + ' × ' + c.mdf.W + ' cm'], ['Base (medida)', c.base.L + ' × ' + c.base.W + ' × ' + c.base.H + ' cm']]).concat(x.n > 1 ? [['Cantidad', x.n + ' mesas']] : []);
    filas.forEach(([k, v], i) => { const y = y0 + 74 + i * 30; txt(k, 660, y, '400 21px Inter,Arial', '#8a8378'); txt(String(v), 840, y, '500 21px Inter,Arial', '#1a1917'); });
    // muestra de la piedra que eligió, junto a su renglón
    { const ip = filas.findIndex(r => r[0] === 'Piedra'), mp = await cargarImg('img/piedras/' + m.piedra + '.jpg');
      if (ip >= 0 && mp) { const y = y0 + 74 + ip * 30; g.font = '500 21px Inter,Arial'; const xp = Math.min(W - 110, 840 + g.measureText(String(filas[ip][1])).width + 18); g.save(); g.beginPath(); g.rect(xp, y - 24, 70, 32); g.clip(); g.drawImage(mp, xp, y - 24, 70, 32); g.restore(); g.strokeStyle = '#d9d3c8'; g.strokeRect(xp, y - 24, 70, 32); } }
    // croquis
    const cq = await cargarImg(URL.createObjectURL(await CQ.png(m, { folio: p.folio, cliente: p.nombre })));
    if (cq) { const h = 670, w = h * cq.width / cq.height, x0 = (W - w) / 2; g.strokeStyle = '#e7e3dc'; g.lineWidth = 2; g.strokeRect(x0, 825, w, h); g.drawImage(cq, x0, 825, w, h); }
    // precio
    const pr = precioOC(p), yb = 1520;
    g.fillStyle = '#f6f4f0'; g.fillRect(70, yb, W - 140, 150);
    txt(para === 'herrero' ? 'PAGO AL HERRERO' : 'PRECIO', 110, yb + 52, '600 22px Inter,Arial', '#8a8378');
    txt(pr ? pesos(pr) : '—', 110, yb + 118, '700 58px Inter,Arial', '#1a1917');
    if (para === 'cliente' && pr) { txt('ANTICIPO 50%', 640, yb + 52, '600 22px Inter,Arial', '#8a8378'); txt(pesos(Math.ceil(pr / 2)), 640, yb + 118, '700 58px Inter,Arial', '#1a1917'); }
    else if (para === 'herrero') { txt('BASE', 640, yb + 52, '600 22px Inter,Arial', '#8a8378'); txt(baseDe(p) + ' · PTR ' + c.metros + ' m', 640, yb + 112, '600 30px Inter,Arial', '#1a1917'); }
    txt('DKAS · Piedra sinterizada · WhatsApp ' + WA.map(w => w.label).join(' · ') + ' · dkas.mx', W / 2, H - 40, '400 20px Inter,Arial', '#8a8378', 'center');
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.9));
  }
  async function pintarOC(p) {
    const im = $('#oc-img'); if (!im) return;
    const b = await ordenCompra(p); if (!$('#oc-img')) return;
    if (im.src) URL.revokeObjectURL(im.src); $('#oc-img').src = URL.createObjectURL(b);
  }
  function imprimir(blob, p) {
    const u = URL.createObjectURL(blob), w = window.open('', '_blank');
    if (!w) return bajar(blob, 'orden-' + p.folio + '.jpg');
    w.document.write('<!doctype html><title>Orden de compra #' + p.folio + '</title><style>@page{size:letter;margin:0}body{margin:0}img{width:100%;display:block}</style><img src="' + u + '" onload="setTimeout(()=>print(),200)">');
    w.document.close();
  }

  // ---------- pagos: al cobrar el anticipo el pedido avanza solo ----------
  function pintarPagos(p) {
    const x = numeros(p), el = $('#pagos'), saldo = x.pactado - x.pagado;
    el.innerHTML = '<div class="cifras"><div><span>Cobrado</span><b>' + pesos(x.pagado) + '</b></div><div><span>Falta</span><b class="' + (saldo > 0 ? 'mal' : 'bien') + '">' + pesos(Math.max(0, saldo)) + '</b></div></div>'
      + ((p.pagos || []).length ? '<ul class="pagos">' + p.pagos.map(q => '<li><span>' + A.dia(q.fecha) + ' · ' + esc(q.metodo || '') + '</span><b>' + pesos(q.monto) + '</b><button class="lnk" data-borra="' + q.id + '">quitar</button></li>').join('') + '</ul>' : '')
      + '<div class="nuevo-pago"><input id="pmonto" inputmode="decimal" placeholder="' + (saldo > 0 ? (x.pagado ? saldo : Math.ceil(x.pactado / 2) || 'Monto') : 'Monto') + '"><select id="pmet"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option></select><input id="pfecha" type="date" value="' + hoy() + '"><button class="btn negro" id="pagar">Registrar pago</button></div>';
    $('#pagar').onclick = async () => {
      const monto = num($('#pmonto').value) || num($('#pmonto').placeholder); if (!monto) return alerta('Escribe el monto.');
      try { await A.agregarPago(p.id, { monto, metodo: $('#pmet').value, fecha: $('#pfecha').value || hoy(), nota: '' }); await recargar(); toast('Pago registrado'); const q = todos.find(z => z.id === p.id); await avanzar(q); pedido(q, 'log'); } catch (e) { alerta(e.message); }
    };
    $$('[data-borra]').forEach(b => b.onclick = async () => { if (!confirm('¿Quitar este pago?')) return; const q = p.pagos.find(z => z.id === b.dataset.borra); try { await A.borrarPago(p.id, q.id, q); await recargar(); pedido(todos.find(z => z.id === p.id), 'log'); } catch (e) { alerta(e.message); } });
  }

  // ---------- nuevo pedido (capturado en el taller) ----------
  function nuevo() {
    let m = D.normalizar({ uso: 'comedor', forma: 'rect', L: 210, W: 100 });
    const pinta = () => {
      const lim = D.limites(m.uso, m.forma, m.L), red = D.redonda(m.forma);
      main.innerHTML = '<a class="volver" href="#">← Pedidos y logística</a><h1>Nuevo pedido</h1><div class="sec"><div class="grid2">'
        + '<label>Nombre del cliente<input id="nnom" value="' + esc(nuevo.nom || '') + '"></label><label>WhatsApp<input id="ntel" inputmode="tel" value="' + esc(nuevo.tel || '') + '"></label>'
        + '<label>Uso<select data-n="uso">' + opts(Object.fromEntries(Object.entries(D.USOS).map(([k, u]) => [k, u.nombre])), m.uso) + '</select></label>'
        + '<label>Forma<select data-n="forma">' + opts(Object.fromEntries(D.formasDe(m.uso).map(k => [k, D.FORMAS[k]])), m.forma) + '</select></label>'
        + '<label>' + (red ? 'Medida' : 'Largo') + ' (usual ' + lim.L.join('–') + ')<input type="number" step="1" data-n="L" value="' + m.L + '"></label>'
        + (red ? '' : '<label>Ancho (usual ' + lim.W.join('–') + ')<input type="number" step="1" data-n="W" value="' + m.W + '"></label>')
        + '<label>Altura<input type="number" step="1" data-n="H" value="' + m.H + '"></label>'
        + '<label>Base<select data-n="base">' + opcBases(m, nuevo.otra != null) + '</select></label>'
        + (nuevo.otra != null ? '<label>¿Qué base es?<input id="notra" placeholder="Ej. base de madera" value="' + esc(nuevo.otra) + '"></label>' : '')
        + '<label>Piedra<select data-n="piedra">' + opts(Object.fromEntries(D.PIEDRAS.map(q => [q.id, q.nombre])), m.piedra) + '</select></label>'
        + '<label>Cantidad<input type="number" id="ncant" min="1" max="20" value="' + (nuevo.cant || 1) + '"></label>'
        + '<label>Fecha de entrega<input type="date" id="nent" value="' + esc(nuevo.ent || '') + '"></label></div>'
        + '<p class="tit">' + esc(D.titulo(m)) + (D.personas(m) ? ' · ' + D.personas(m) + ' personas' : '') + '</p>'
        + '<button class="btn negro grande" id="crear">Crear pedido</button></div>';
      const keep = () => { if ($('#notra')) nuevo.otra = $('#notra').value; nuevo.nom = $('#nnom').value; nuevo.tel = $('#ntel').value; nuevo.cant = $('#ncant').value; nuevo.ent = $('#nent').value; };
      $$('[data-n]').forEach(el => el.onchange = () => { keep();
        if (el.dataset.n === 'base') { if (el.value === '__otra') { nuevo.otra = nuevo.otra || ''; return pinta(); } nuevo.otra = null; }
        m = D.normalizar(Object.assign({}, m, { [el.dataset.n]: el.type === 'number' ? +el.value : el.value })); pinta(); });
      $('#crear').onclick = async () => {
        keep(); const b = $('#crear'); b.disabled = true;
        try {
          const cod = [m.uso, m.forma, m.L, m.W, m.base, m.piedra].join('.');
          const r = await A.crearPedido({ nombre: nuevo.nom, tel: nuevo.tel, items: [{ tipo: 'mesa', titulo: D.titulo(m), cantidad: Math.max(1, +nuevo.cant || 1), uso: m.uso, specs: D.resumen(m).concat([['Código', cod]]), link: SITE + '#d=' + cod }] }, true);
          const f = await foto3d(m); if (f) { try { await A.guardarFoto(r.token, await chica(f), true); } catch (e) {} }
          await recargar(); const p = todos.find(q => q.token === r.token);
          const fi = {}; if (nuevo.ent) fi.entrega = nuevo.ent; if (nuevo.otra) fi.baseOtra = nuevo.otra.trim();
          if (p && Object.keys(fi).length) { try { await A.guardarFicha(p.id, 'dkas', fi, (fi.entrega ? 'Fecha de entrega: ' + fechaCorta(fi.entrega) + '. ' : '') + (fi.baseOtra ? 'Base: ' + fi.baseOtra + ' (otra).' : '')); await recargar(); } catch (e) {} }
          nuevo.nom = nuevo.tel = nuevo.ent = ''; nuevo.otra = null; nuevo.cant = 1;
          location.hash = p ? '#p=' + p.id : '';
        } catch (e) { alerta(e.message); b.disabled = false; }
      };
    };
    pinta();
  }
  function chica(url) { return new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 1000; c.height = Math.round(1000 * im.height / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.8)); }; im.src = url; }); }

  // ---------- quién ha entrado a la página de clientes (dan su nombre al entrar y la página los recuerda) ----------
  async function visitas() {
    main.innerHTML = '<h1>Visitas</h1><p class="sub">Cargando…</p>';
    let l; try { l = await A.visitas(); } catch (e) { main.innerHTML = '<h1>Visitas</h1><p class="err">' + esc(e.message) + '</p>'; return; }
    // una fila por persona (mismo navegador = misma persona)
    const per = {};
    l.slice().sort((a, b) => (a.ult || a.t) - (b.ult || b.t)).forEach(x => { const k = x.v || x.t; const a = per[k] = per[k] || { nombre: '', veces: 0, primera: x.t, ult: 0, disp: x.disp, origen: x.origen, max: 0, folio: 0, tel: '', interes: '', ints: [], vs: [], diseno: '' };
      a.veces++; a.primera = Math.min(a.primera, x.t); a.ult = Math.max(a.ult, x.ult || x.t); if (x.nombre) a.nombre = x.nombre; a.max = Math.max(a.max, x.paso || 0); if (x.folio) a.folio = x.folio; if (x.tel) a.tel = x.tel; if (x.interes) { a.interes = x.interes; if (!a.ints.includes(x.interes)) a.ints.push(x.interes); } if (x.diseno) a.diseno = x.diseno; a.vs.push(x); });
    // su WhatsApp: el que dejó en la página o, si no, el de su pedido o su solicitud de acceso con el mismo nombre
    const sols = await A.solicitudes().catch(() => []), llave = s => String(s || '').trim().toLowerCase();
    const telDe = {}; todos.forEach(p => { if (p.tel) telDe[llave(p.nombre)] = p.tel; }); sols.forEach(s => { if (s.tel) { telDe[llave(s.nombre)] = telDe[llave(s.nombre)] || s.tel; telDe[llave(s.nombre + ' ' + (s.apellido === '(web)' ? '' : s.apellido || ''))] = s.tel; } });
    Object.values(per).forEach(g => { if (!g.tel && g.nombre) g.tel = telDe[llave(g.nombre)] || '';
      g.sol = sols.filter(x => (g.tel && x.tel === g.tel) || (g.nombre && llave(x.nombre) === llave(g.nombre))).sort((a, b) => b.creado - a.creado)[0] || null; });
    // la mesa que le gustó: foto y ficha (de la Revista, Proyectos o la piedra)
    const FI = window.DKAS_INTERES || {}, mesaDe = t => FI[String(t).replace(/^(Quiero una así|Crear mi mesa en): /, '').replace(/^Crear mi mesa en /, 'Piedra ')] || null;
    const QUE = t => /^Quiero una así/.test(t) ? 'Tocó «Quiero una así» en' : /^Crear mi mesa/.test(t) ? 'Tocó «Crear mi mesa» con' : 'Vio';
    const tarj = t => { const m = mesaDe(t), n = String(t).replace(/^(Quiero una así|Crear mi mesa en): ?/, '').replace(/^Crear mi mesa en /, '');
      return '<div class="v-int">' + (m ? '<img src="' + m.img + '" alt="" loading="lazy">' : '') + '<div><small>' + QUE(t) + '</small><b>' + esc(n) + '</b>' + (m && m.d ? '<span>' + esc(m.d) + '</span>' : '') + '</div></div>'; };
    const SITIO = 'https://dkas.mx/';
    const mesaCod = cod => { try { const [u, f, L, W, b, p] = cod.split('.'); const pi = D.PIEDRAS.find(z => z.id === p); return [pi && pi.nombre, D.BASES[b] && 'Base ' + D.BASES[b].nombre, D.redonda(f) ? L + ' cm' : L + ' × ' + W + ' cm', D.USOS[u] && D.USOS[u].nombre].filter(Boolean).join(' · '); } catch (e) { return ''; } };
    const hora = t => new Date(t).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
    const dia = t => { const d = new Date(t); return d.toDateString() === hoy ? 'Hoy' : d.toDateString() === new Date(Date.now() - 864e5).toDateString() ? 'Ayer' : d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }); };
    function historia(g) {
      const ev = [];
      g.vs.forEach(x => {
        ev.push([x.t, 'Entró a la página' + (x.origen && x.origen !== 'directo' ? ' desde ' + x.origen : '') + (x.disp ? ' · ' + x.disp : '')]);
        const vio = x.vio ? x.vio.split(' | ') : x.interes ? [x.interes] : [];
        vio.forEach(t => ev.push([x.t + 1, tarj(t), 1]));
        if (vio.some(t => /^Quiero una así/.test(t)) && !x.folio && !g.folio) ev.push([x.t + 1, '<b class="pend">Abrió la cotización pero no la mandó</b>', 1]);
        if (x.paso >= 1 && !g.vs.some(z => z !== x && z.t < x.t && z.paso >= 1) && !vio.some(t => /^Crear mi mesa/.test(t))) ev.push([x.t + 2, 'Abrió el diseñador 3D']);
        if (x.paso >= 2) ev.push([x.ult || x.t, 'Armó su mesa en 3D' + (x.diseno ? ': <b>' + esc(mesaCod(x.diseno)) + '</b> <a class="lnk" target="_blank" rel="noopener" href="' + SITIO + '#d=' + encodeURIComponent(x.diseno) + '">ver su mesa →</a>' : '')]);
        if (x.folio) ev.push([x.ult || x.t, '<b>Mandó su pedido #' + x.folio + '</b>' + (todos.find(p => p.folio === x.folio) ? ' <a class="lnk" href="#p=' + todos.find(p => p.folio === x.folio).id + '">abrir →</a>' : '')]);
      });
      if (g.sol) { ev.push([g.sol.creado, 'Pidió acceso para diseñar en 3D']); if (g.sol.decidido) ev.push([g.sol.decidido, g.sol.estado === 'aprobada' ? 'Le aprobaste el acceso' : 'Se le negó el acceso']); else if (g.sol.estado === 'pendiente') ev.push([Date.now(), '<b class="pend">Espera que le aprueben el acceso</b> <a class="lnk" href="#accesos">aprobar →</a>']); }
      ev.sort((a, b) => a[0] - b[0]);
      let ult = '', html = '';
      ev.forEach(([t, txt, card]) => { const d = dia(t); if (d !== ult) { html += '<li class="h-dia">' + d + '</li>'; ult = d; } html += '<li' + (card ? ' class="h-card"' : '') + '><time>' + (card ? '' : hora(t)) + '</time><div>' + txt + '</div></li>'; });
      return '<ol class="hist">' + html + '</ol>';
    }
    const ESOL = { pendiente: 'Pidió acceso al 3D · <b class="pend">por aprobar</b>', aprobada: 'Pidió acceso al 3D · <b>aprobado</b>', rechazada: 'Pidió acceso al 3D · rechazado' };
    const gente = Object.values(per).sort((a, b) => b.ult - a.ult), hoy = new Date().toDateString();
    const yoN = String((me && me.nombre) || 'DKAS').split(' ')[0];
    const msjWA = g => { const n = (g.nombre || '').split(' ')[0];
      const m = g.interes && mesaDe(g.interes), cual = m && m.d ? ' (' + m.d.split(' · ').slice(0, 2).join(', ') + ')' : '';
      const que = g.folio ? 'Vi que nos mandaste tu pedido #' + g.folio + '. ¿Tienes alguna duda?' : g.max >= 2 ? 'Vi que armaste tu mesa en nuestro diseñador 3D' + (g.interes ? ' (' + g.interes + ')' : '') + '. ¿Te ayudo a terminarla o te paso la cotización?'
        : 'Vi que estuviste viendo ' + (g.interes ? g.interes.replace(/^Quiero una así: /, 'la mesa «') + (/^Quiero una así: /.test(g.interes) ? '»' + cual : '') : 'nuestras mesas de piedra') + ' en dkas.mx. ¿Qué te interesó? ¿En qué te puedo ayudar?';
      return 'Hola' + (n ? ' ' + n : '') + ', soy ' + yoN + ' de DKAS 👋\n' + que; };
    const botonWA = g => g.tel ? '<a class="btn chico wa-v" target="_blank" rel="noopener" href="https://wa.me/' + A.waNum(g.tel) + '?text=' + encodeURIComponent(msjWA(g)) + '">WhatsApp</a>' : '<small class="sin-tel">sin WhatsApp</small>';
    const PASO = ['Vio la página', 'Abrió el 3D', 'Armó su mesa', 'Mandó su diseño'];
    const cuando = t => { const d = new Date(t); return d.toDateString() === hoy ? 'hoy ' + d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : A.fecha(t); };
    main.innerHTML = '<h1>Visitas</h1><p class="sub">Quién ha entrado a dkas.mx. Al entrar se les pide su nombre y la página los recuerda.</p>'
      + '<div class="resumen-g"><div><b>' + gente.length + '</b><span>personas</span></div><div><b>' + gente.filter(g => new Date(g.ult).toDateString() === hoy).length + '</b><span>hoy</span></div><div><b>' + gente.filter(g => g.folio).length + '</b><span>mandaron pedido</span></div></div>'
      + '<div class="sec">' + (gente.length ? gente.map(g => '<div class="vis-p"><div class="fila vis"><div><b>' + esc(g.nombre || 'Sin nombre') + '</b><small>' + esc([g.disp, g.origen].filter(Boolean).join(' · ')) + '</small>' + (g.sol ? '<small class="v-sol">' + (ESOL[g.sol.estado] || 'Pidió acceso al 3D') + ' · ' + cuando(g.sol.creado) + '</small>' : '') + '</div>'
        + '<div><span>' + (g.folio ? 'Mandó pedido #' + g.folio : PASO[Math.min(2, g.max)]) + '</span><small>' + g.veces + (g.veces === 1 ? ' visita' : ' visitas') + ' · última ' + cuando(g.ult) + '</small>' + (g.nombre ? botonWA(g) : '') + '</div></div>' + ((g.nombre && (g.ints.length || g.max || g.sol || g.folio)) ? '<div class="q-hizo"><p class="et-h">Qué hizo</p>' + historia(g) + '</div>' : '<details class="q-hizo"><summary>Qué hizo</summary>' + historia(g) + '</details>') + '</div>').join('') : '<p class="sub">Todavía nadie.</p>') + '</div>';
  }

  // ---------- agenda: los pendientes del equipo, con fecha y en orden ----------
  let tareas = [], editando = null, verHechos = false;
  const urgente = t => !t.hecho && t.fecha && t.fecha <= hoy();
  function contarAgenda(l) {
    const pinta = x => { const n = x.filter(urgente).length, b = $('#nb-age'); if (b) { b.textContent = n; b.hidden = !n; } };
    if (l) return pinta(l);
    A.agenda().then(x => { tareas = x; pinta(x); }).catch(() => {});
  }
  async function agenda() {
    main.innerHTML = '<h1>Agenda</h1><p class="sub">Cargando…</p>';
    try { tareas = await A.agenda(); } catch (e) { main.innerHTML = '<h1>Agenda</h1><p class="err">' + esc(e.message) + '</p>'; return; }
    pintarAgenda();
  }
  function pintarAgenda() {
    contarAgenda(tareas);
    const h = hoy(), m = hoy(1), ed = editando && tareas.find(t => t.id === editando);
    const orden = (a, b) => (a.fecha || '9').localeCompare(b.fecha || '9') || (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0) || (a.hora || '99').localeCompare(b.hora || '99') || a.creado - b.creado;
    const pend = tareas.filter(t => !t.hecho).sort(orden), hechos = tareas.filter(t => t.hecho).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.creado - a.creado);
    const grupos = [];
    const meter = (k, tit, cls, t) => { let g = grupos.find(x => x.k === k); if (!g) grupos.push(g = { k, tit, cls, l: [] }); g.l.push(t); };
    pend.forEach(t => !t.fecha ? meter('z', 'Sin fecha', 'gris', t) : t.fecha < h ? meter('0', 'Atrasados', 'mal', t) : t.fecha === h ? meter('1', 'Hoy · ' + fechaCorta(h), 'ag-hoy', t) : t.fecha === m ? meter('2', 'Mañana · ' + fechaCorta(m), '', t) : meter(t.fecha, fechaCorta(t.fecha), '', t));
    grupos.sort((a, b) => a.k < b.k ? -1 : 1);
    const fila = t => '<div class="tarea' + (t.hecho ? ' hecha' : '') + (t.urgente && !t.hecho ? ' urg' : '') + '" data-id="' + t.id + '"><button class="chk" data-a="hecho" aria-label="' + (t.hecho ? 'Marcar pendiente' : 'Marcar hecho') + '"></button>'
      + '<div class="tx"><p>' + esc(t.texto).replace(/\n/g, '<br>') + '</p><small>' + [t.hora ? t.hora.replace(/^0/, '') + ' h' : '', t.urgente && !t.hecho ? '<b>Urgente</b>' : '', (t.hecho || (t.fecha && t.fecha < h)) && t.fecha ? fechaCorta(t.fecha) : '', t.por ? 'anotó ' + esc(t.por) : ''].filter(Boolean).join(' · ') + '</small></div>'
      + '<div class="acc"><button class="lnk" data-a="editar">editar</button><button class="lnk gris" data-a="borrar">borrar</button></div></div>';
    const cuenta = k => (grupos.find(g => g.k === k) || { l: [] }).l.length;
    main.innerHTML = '<div class="cab"><div><h1>Agenda</h1><p class="sub">Los pendientes en orden: lo atrasado y lo de hoy, arriba.</p></div></div>'
      + '<div class="resumen-g"><div class="rg mal"><b>' + cuenta('0') + '</b><span>Atrasados</span></div><div class="rg ambar"><b>' + cuenta('1') + '</b><span>Hoy</span></div><div class="rg"><b>' + pend.length + '</b><span>Pendientes</span></div><div class="rg gris"><b>' + hechos.length + '</b><span>Hechos</span></div></div>'
      + '<div class="sec ag-nueva"><textarea id="ag-tx" rows="2" maxlength="400" placeholder="¿Qué hay que hacer? Ej. Llamar a Manuel para la fecha de entrega">' + esc(ed ? ed.texto : '') + '</textarea>'
      + '<div class="ag-campos"><label>Fecha<input type="date" id="ag-f" value="' + esc(ed ? ed.fecha || '' : h) + '"></label><label>Hora (opcional)<input type="time" id="ag-h" value="' + esc(ed ? ed.hora || '' : '') + '"></label>'
      + '<label class="ag-urg"><input type="checkbox" id="ag-u"' + (ed && ed.urgente ? ' checked' : '') + '> Urgente</label></div>'
      + '<div class="ag-rapido"><button class="btn chico" data-agf="' + h + '">Hoy</button><button class="btn chico" data-agf="' + m + '">Mañana</button><button class="btn chico" data-agf="' + hoy(7) + '">En una semana</button><button class="btn chico" data-agf="">Sin fecha</button></div>'
      + '<div class="ag-bot"><button class="btn negro" id="ag-ok">' + (ed ? 'Guardar cambios' : '+ Agregar pendiente') + '</button>' + (ed ? '<button class="btn" id="ag-cancel">Cancelar</button>' : '') + '</div></div>'
      + (grupos.length ? grupos.map(g => '<h3 class="ag-g ' + g.cls + '">' + esc(g.tit) + ' <i>' + g.l.length + '</i></h3><div class="lista">' + g.l.map(fila).join('') + '</div>').join('') : '<p class="sub ag-vacio">No hay pendientes.</p>')
      + (hechos.length ? '<h3 class="ag-g"><button class="lnk gris" id="ag-ver">' + (verHechos ? 'Ocultar' : 'Ver') + ' hechos (' + hechos.length + ')</button></h3>' + (verHechos ? '<div class="lista">' + hechos.slice(0, 60).map(fila).join('') + '</div>' : '') : '');
    $$('.ag-rapido [data-agf]').forEach(b => b.onclick = () => { $('#ag-f').value = b.dataset.agf; $$('.ag-rapido [data-agf]').forEach(z => z.classList.toggle('on', z === b)); });
    const tx = $('#ag-tx'); if (ed) { tx.focus(); tx.scrollIntoView({ block: 'center' }); }
    tx.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); $('#ag-ok').click(); } };
    if ($('#ag-cancel')) $('#ag-cancel').onclick = () => { editando = null; pintarAgenda(); };
    if ($('#ag-ver')) $('#ag-ver').onclick = () => { verHechos = !verHechos; pintarAgenda(); };
    $('#ag-ok').onclick = async () => {
      const texto = tx.value.trim(); if (!texto) { tx.focus(); return alerta('Escribe el pendiente.'); }
      const x = Object.assign({}, ed ? { hecho: ed.hecho, creado: ed.creado } : { hecho: false, creado: Date.now() }, { texto: texto.slice(0, 400) });
      const por = String(ed ? ed.por || '' : (me && me.nombre) || '').slice(0, 60); if (por) x.por = por;
      const f = $('#ag-f').value, hr = $('#ag-h').value; if (f) x.fecha = f; if (hr) x.hora = hr; if ($('#ag-u').checked) x.urgente = true;
      const id = ed ? ed.id : Date.now().toString(36) + A.rnd().slice(0, 6), b = $('#ag-ok'); b.disabled = true;
      try { await A.guardarTarea(id, x); tareas = tareas.filter(t => t.id !== id).concat([Object.assign({ id }, x)]); editando = null; toast(ed ? 'Cambios guardados' : 'Pendiente agregado'); pintarAgenda(); }
      catch (e) { b.disabled = false; alerta(e.message); }
    };
    main.onclick = async e => {
      const b = e.target.closest('[data-a]'), r = b && b.closest('.tarea'); if (!r) return;
      const t = tareas.find(z => z.id === r.dataset.id); if (!t) return;
      if (b.dataset.a === 'editar') { editando = t.id; return pintarAgenda(); }
      if (b.dataset.a === 'borrar') { if (!confirm('¿Borrar este pendiente?')) return; try { await A.borrarTarea(t.id); tareas = tareas.filter(z => z.id !== t.id); pintarAgenda(); } catch (x) { alerta(x.message); } return; }
      if (b.dataset.a === 'hecho') {
        const n = Object.assign({}, t, { hecho: !t.hecho }); delete n.id; r.classList.toggle('hecha', n.hecho);
        try { await A.guardarTarea(t.id, n); t.hecho = n.hecho; if (n.hecho) toast('Hecho ✓'); setTimeout(pintarAgenda, n.hecho ? 400 : 0); } catch (x) { r.classList.toggle('hecha', t.hecho); alerta(x.message); }
      }
    };
  }
  function mas() {
    main.innerHTML = '<h1>Más</h1><div class="mas">' + [['#visitas', 'Visitas', 'Quién entra a dkas.mx'], ['#bases', 'Diseñar bases', 'Bases nuevas para el catálogo'], ['#precios', 'Precios', 'Costos y margen'], ['#accesos', 'Links de acceso al 3D', 'Para arquitectos o clientes de confianza'], ['https://dkas.mx/cotiza.html', 'Cotizador express', 'Lo que ven los clientes']]
      .map(([h, t, d]) => '<a href="' + h + '"' + (/^http/.test(h) ? ' target="_blank" rel="noopener"' : '') + '><b>' + t + '</b><small>' + d + '</small></a>').join('') + '<a href="#" id="salir2"><b>Salir</b><small>Cerrar sesión en este aparato</small></a></div>';
    $('#salir2').onclick = e => { e.preventDefault(); $('#salir').click(); };
  }
  // ---------- Clientes: todo el camino de cada cliente en un solo lugar ----------
  // solicitud (nombre + WhatsApp) → apruebas → diseña (su mesa se guarda sola) → la envía (pedido). El sistema nunca le pone precio.
  async function clientes() {
    main.innerHTML = '<h1>Clientes</h1><p class="sub">Cargando…</p>';
    let sols, accs, dis, seg;
    try { [sols, accs, dis, seg] = await Promise.all([A.solicitudes(), A.accesos().catch(() => []), A.disenos().catch(() => ({})), A.escritos().catch(() => ({}))]); }
    catch (e) { main.innerHTML = '<h1>Clientes</h1><p class="err">' + esc(e.message) + '</p>'; return; }
    const FI = window.DKAS_INTERES || {}, yoN = String((me && me.nombre) || 'Zury').split(' ')[0];
    const nom = x => (x.nombre + ' ' + (x.apellido === '(web)' ? '' : x.apellido || '')).trim();
    const lista = sols.map(x => ({ k: x.id, nombre: nom(x), tel: x.tel || '', quiere: x.quiere || '', estado: x.estado, creado: x.creado, decidido: x.decidido, por: x.por, d: dis[x.id] || null }))
      .concat(accs.map(a => ({ k: a.token, nombre: a.nombre, tel: '', quiere: 'Link de acceso directo', estado: a.activo ? 'aprobada' : 'rechazada', creado: a.creado, link: true, d: dis[a.token] || null })));
    lista.forEach(c => {
      c.p = c.d && c.d.enviado ? todos.find(p => p.token === c.d.enviado.token) || { folio: c.d.enviado.folio, estado: 'nuevo' } : null;
      if (!c.p && c.tel && c.estado === 'aprobada') c.p = todos.filter(p => p.tel === c.tel && p.creado >= c.creado).sort((a, b) => b.creado - a.creado)[0] || null;
      c.etapa = c.estado === 'pendiente' ? 'aprobar' : c.estado === 'rechazada' ? 'rech' : c.p ? (c.p.estado === 'nuevo' ? 'oculto' : 'envio') : c.d ? 'disena' : 'espera';
      c.ult = Math.max(c.creado || 0, c.decidido || 0, (c.d && c.d.actualizado) || 0);
    });
    const ETAPAS = [['aprobar', 'Por aprobar', 'Pidieron diseñar su mesa. Revisa y aprueba.'], ['disena', 'Diseñaron y no han enviado', 'Su mesa está guardada. Escríbeles para que la envíen.'],
      ['espera', 'Aprobados, todavía no diseñan', 'Ya tienen acceso. Un mensaje les ayuda a empezar.'], ['envio', 'Ya cotizados', 'Su pedido ya avanzó. Dale seguimiento en Pedidos.']];
    const cuando = t => { if (!t) return ''; const d = new Date(t); return d.toDateString() === new Date().toDateString() ? 'hoy ' + d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : A.fecha(t); };
    const sinPref = t => String(t || '').replace(/^Quiero una así: /, '');
    // varias formas de escribirle, según en qué paso va (nunca con precios): cálido, directo, para ayudarle/agendar y formal
    const opciones = c => {
      const n = c.nombre.split(' ')[0], f = c.p && c.p.folio, q = c.quiere && !/^Link|^Diseñar/.test(c.quiere) ? sinPref(c.quiere) : '';
      let mesa = c.d && c.d.titulo || ''; try { if (c.d && c.d.cod) { const pi = D.PIEDRAS.find(z => z.id === String(c.d.cod).split('.')[5]); if (pi) mesa += ' en ' + pi.nombre; } } catch (e) {}
      const deMesa = mesa ? ' (' + mesa + ')' : '', laQue = q ? ' como la «' + q + '»' : '';
      if (c.etapa === 'disena') return [
        ['Directo', 'Hola ' + n + ', esta es la mesa que estás creando' + (mesa ? ': ' + mesa : '') + '. Te mando el plano; dime si está correcta y cuándo podemos vernos para personalizártela más y darte el mejor servicio posible. 🙌'],
        ['Cálido', 'Hola ' + n + ', ¿cómo estás? 😊 Soy ' + yoN + ' de DKAS. Vi que armaste tu mesa' + deMesa + ' en nuestra página, ¡quedó muy bonita! ¿Te ayudo a terminarla para prepararte tu cotización?'],
        ['Ayudarle / llamada', 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Vi tu diseño' + deMesa + '. Si quieres te ayudo a armarla: medidas, piedra o base. ¿Cuándo te queda bien que hablemos, hoy o mañana?'],
        ['Formal', 'Buen día, ' + n + '. Le saluda ' + yoN + ', de DKAS. Notamos que diseñó una mesa en nuestro configurador' + deMesa + '. Con gusto le preparamos una cotización formal. ¿Podría indicarnos un buen momento para comentarla?'], ['Cita con muestras', 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Si quieres, te visitamos con muestras reales de las piedras y medimos tu espacio para recomendarte la mesa que más te conviene. Estamos disponibles cuando gustes, ¿qué día te acomoda?']];
      if (c.etapa === 'aprobar') return [
        ['Cálido', 'Hola ' + n + ', ¿cómo estás? 😊 Soy ' + yoN + ' de DKAS. Recibí tu solicitud para diseñar tu mesa' + laQue + '. En un momento te doy acceso y me dices si te ayudo con algo.'],
        ['Directo', n + ', recibí tu solicitud' + (q ? ' (te gustó la «' + q + '»)' : '') + '. ¿Para cuántas personas la buscas y qué medida tiene tu espacio? Así te ayudo a armarla.'],
        ['Formal', 'Buen día, ' + n + '. Le saluda ' + yoN + ', de DKAS. Recibimos su solicitud para el diseñador de mesas. En breve le damos acceso; quedamos a sus órdenes.'], ['Cita con muestras', 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Si quieres, te visitamos con muestras reales de las piedras y medimos tu espacio para recomendarte la mesa que más te conviene. Estamos disponibles cuando gustes, ¿qué día te acomoda?']];
      if (c.etapa === 'envio') return [
        ['Cálido', 'Hola ' + n + ', ¿cómo estás? 😊 Soy ' + yoN + ' de DKAS. Ya recibí tu mesa' + (f ? ' (pedido #' + f + ')' : '') + deMesa + '. Te preparo tu cotización y te la mando por aquí.'],
        ['Directo', n + ', recibí tu pedido' + (f ? ' #' + f : '') + (mesa ? ': ' + mesa : '') + '. ¿Quieres que revisemos juntos algún detalle antes de la cotización? ¿Cuándo podemos hablar?'],
        ['Formal', 'Buen día, ' + n + '. Le saluda ' + yoN + ', de DKAS. Confirmamos la recepción de su pedido' + (f ? ' #' + f : '') + deMesa + '. En breve le compartimos la cotización formal.']];
      return [ // aprobado, todavía no diseña
        ['Directo', 'Hola ' + n + ', ' + (q ? 'esta es la mesa que te gustó: «' + q + '». Te mando el plano con medidas estándar; dime si te late y cuándo podemos vernos para personalizártela y darte el mejor servicio posible. 🙌' : 'ya tienes acceso para diseñar tu mesa en dkas.mx. Si prefieres, la armamos juntos: dime cuándo podemos vernos para personalizártela y darte el mejor servicio posible. 🙌')],
        ['Cálido', 'Hola ' + n + ', ¿cómo estás? 😊 Soy ' + yoN + ' de DKAS. Ya tienes acceso para diseñar tu mesa' + laQue + ' en dkas.mx. Entra desde este mismo celular y ármala a tu medida. ¡Aquí estoy para lo que necesites!'],
        ['Ayudarle / llamada', 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Si prefieres, armamos tu mesa juntos por aquí: dime para cuántas personas, la medida de tu espacio y la piedra que te gustó. ¿Cuándo podemos hablar?'],
        ['Formal', 'Buen día, ' + n + '. Le saluda ' + yoN + ', de DKAS. Su acceso al diseñador de mesas en dkas.mx ya está activo. Quedamos a sus órdenes para acompañarle en el diseño y la cotización.'], ['Cita con muestras', 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Si quieres, te visitamos con muestras reales de las piedras y medimos tu espacio para recomendarte la mesa que más te conviene. Estamos disponibles cuando gustes, ¿qué día te acomoda?']];
    };
    const msj = c => opciones(c)[0][1];
    const wa = c => c.tel ? '<button class="btn chico wa-v" data-wa-op="' + c.k + '">WhatsApp</button>' : '';
    // la mesa del cliente para el plano: la que armó o, si no, la que le gustó (medidas estándar)
    const mesaCli = c => { try {
      if (c.d && c.d.cod) { const p = String(c.d.cod).split('.'); return D.normalizar({ uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5], H: +p[6] || undefined, color: p[7] || 'negro' }); }
      const g = FI[sinPref(c.quiere)]; if (g && g.m) return D.normalizar(Object.assign({}, g.m, D.tamanoPara(g.m.uso, g.m.forma, g.m.uso === 'comedor' ? 8 : 4)));
    } catch (e) {} return null; };
    // elegir el mensaje: tocas una opción, la puedes editar y se manda por WhatsApp (con foto y plano si hay mesa)
    function elegirMensaje(c) {
      const ops = opciones(c), v = document.createElement('div'); v.className = 'vm';
      v.innerHTML = '<div class="vm-caja"><button class="vm-x" aria-label="Cerrar">×</button><div class="vm-tx"><p class="vm-et">Mensaje para ' + esc(c.nombre) + '</p><h2>¿Cómo le escribes?</h2>'
        + '<div class="m-ops">' + ops.map(([t, x], i) => '<button class="m-op' + (i ? '' : ' on') + '" data-op="' + i + '"><b>' + t + '</b><span>' + esc(x) + '</span></button>').join('') + '</div>'
        + '<label class="m-ed">Puedes cambiarlo antes de mandarlo<textarea rows="5">' + esc(ops[0][1]) + '</textarea></label>'
        + (mesaCli(c) ? '<p class="m-adj">📎 Se adjuntan la foto de su mesa y el plano con medidas</p><div class="vm-bot"><button class="btn verde" data-adj>Mandar con foto y plano por WhatsApp</button><a class="btn" target="_blank" rel="noopener" data-abrir>Solo el texto</a></div>' : '<div class="vm-bot"><a class="btn verde" target="_blank" rel="noopener" data-abrir>Abrir WhatsApp con este mensaje</a>' + (/^[0-9a-f]{32}$/.test(c.k) ? '<a class="btn" href="#prop=' + c.k + '">Armarle su mesa para mandarle plano</a>' : '') + '</div>') + '</div></div>';
      document.body.appendChild(v); document.body.style.overflow = 'hidden';
      const ta = v.querySelector('textarea'), a = v.querySelector('[data-abrir]'), liga = () => { a.href = 'https://wa.me/' + A.waNum(c.tel) + '?text=' + encodeURIComponent(ta.value); };
      liga(); ta.oninput = liga;
      const cerrar = () => { v.remove(); document.body.style.overflow = ''; };
      v.onclick = async e => {
        if (e.target === v || e.target.closest('.vm-x')) return cerrar();
        const o = e.target.closest('[data-op]'); if (o) { v.querySelectorAll('.m-op').forEach(z => z.classList.toggle('on', z === o)); ta.value = ops[+o.dataset.op][1]; liga(); return; }
        if (e.target.closest('a[href^="#prop="]')) return cerrar();
        const adj = e.target.closest('[data-adj]');
        if (adj) { adj.disabled = true; adj.textContent = 'Preparando…';
          try { const m = mesaCli(c), info = { cliente: c.nombre, plano: true }, files = [];
            const f = c.d && c.d.img ? c.d.img : await foto3d(m); if (f) files.push(new File([await (await fetch(f)).blob()], 'mesa-' + c.nombre.split(' ')[0].toLowerCase() + '.jpg', { type: 'image/jpeg' }));
            files.push(new File([await CQ.png(m, info)], 'plano-mesa.jpg', { type: 'image/jpeg' }));
            await compartir(files, ta.value, A.waNum(c.tel)); } catch (x) { alerta(x.message); }
          cerrar(); if (!seg[c.k]) { try { await A.marcarEscrito(c.k, true); seg[c.k] = { escrito: Date.now(), por: me.nombre }; setTimeout(clientes, 900); } catch (x) {} } return; }
        if (e.target.closest('[data-abrir]')) { setTimeout(cerrar, 300); if (!seg[c.k]) { try { await A.marcarEscrito(c.k, true); seg[c.k] = { escrito: Date.now(), por: me.nombre }; setTimeout(clientes, 900); } catch (x) {} } }
      };
    }
    const quiereCard = c => { const m = FI[sinPref(c.quiere)]; if (!c.quiere || /^Link|^Diseñar/.test(c.quiere)) return ''; return '<div class="v-int">' + (m ? '<img src="' + m.img + '" alt="" loading="lazy">' : '') + '<div><small>Quiere una así</small><b>' + esc(sinPref(c.quiere)) + '</b>' + (m && m.d ? '<span>' + esc(m.d) + '</span>' : '') + '</div></div>'; };
    const mesaCard = c => c.d ? '<button class="c-mesa" data-mesa="' + c.k + '">' + (c.d.img ? '<img src="' + c.d.img + '" alt="">' : '<span class="ph"></span>') + '<div><small>' + (c.p ? 'Su mesa enviada' : c.d.prop ? 'Propuesta que le mandó ' + esc(c.d.por || '') + ' · ' + cuando(c.d.prop) : 'Su mesa (guardada ' + cuando(c.d.actualizado) + ')') + '</small><b>' + esc(c.d.titulo || 'Mesa') + '</b><span>Ver con plano y medidas →</span></div></button>' : '';
    const ficha = c => '<div class="lead cli e-' + c.etapa + (seg[c.k] && c.etapa !== 'aprobar' ? ' hecho' : '') + '"><div class="l-cab"><div><b>' + esc(c.nombre) + '</b><small>' + (c.tel ? esc(c.tel) + ' · ' : '') + 'pidió ' + cuando(c.creado) + (c.decidido ? ' · ' + (c.estado === 'aprobada' ? 'aprobó ' : 'rechazó ') + esc(c.por || '') + ' ' + cuando(c.decidido) : '') + '</small></div>'
      + (seg[c.k] && c.etapa !== 'aprobar' ? '<span class="l-ok">✓ Le escribió ' + esc(seg[c.k].por || '') + ' ' + cuando(seg[c.k].escrito) + '</span>' : '') + '</div>'
      + (c.d ? mesaCard(c) : quiereCard(c))
      + (c.p ? '<a class="c-ped" href="#p=' + (c.p.id || '') + '">Pedido #' + c.p.folio + ' · ' + esc(A.estado(c.p.estado)) + ' →</a>' : '')
      + '<div class="l-bot">' + (c.etapa === 'aprobar' ? '<button class="btn verde chico" data-dec="' + c.k + '|aprobada">Aprobar</button><button class="btn chico" data-dec="' + c.k + '|rechazada">Rechazar</button>' : '')
      + (c.etapa !== 'rech' ? wa(c) : '') + (c.etapa !== 'rech' && c.etapa !== 'aprobar' && /^[0-9a-f]{32}$/.test(c.k) ? '<a class="btn chico oro" href="#prop=' + c.k + '">' + (c.d && c.d.prop ? 'Cambiar su mesa' : 'Armarle su mesa') + '</a>' : '') + (c.etapa !== 'aprobar' && c.etapa !== 'rech' && c.tel ? '<button class="btn chico" data-marca="' + c.k + '">' + (seg[c.k] ? 'Deshacer' : 'Ya le escribí') + '</button>' : '') + '</div></div>';
    function porCotizar() {
      const l = todos.filter(p => p.estado === 'nuevo').sort((a, b) => b.creado - a.creado); if (!l.length) return '';
      const pid = p => ((p.items[0] || {}).specs || []).find(z => z[0] === 'Pidió');
      return '<h3 class="l-tit" id="c-cotizar">Por cotizar <i>' + l.length + '</i></h3><p class="sub l-sub">Ya escogieron su mesa y dejaron su WhatsApp. Ábrelos, ponles precio y mándales la cotización.</p><div class="leads">'
        + l.map(p => '<a class="lead cli e-aprobar c-cot" href="#p=' + p.id + '"><div class="l-cab"><div><b>' + esc(p.nombre) + ' · #' + p.folio + '</b><small>' + esc(p.tel || '') + ' · ' + cuando(p.creado) + (pid(p) ? ' · ' + esc(pid(p)[1]) : '') + '</small></div></div><p class="c-cot-t">' + esc((p.items[0] || {}).titulo || '') + '</p><span class="c-ped">Cotizar →</span></a>').join('') + '</div>';
    }
    const resumenCorto = p => { try { const m = mesaDe(p); return [D.piedra(m.piedra).nombre, baseDe(p) + ' ' + colorDe(p).toLowerCase(), D.personas(m) ? D.personas(m) + ' personas' : D.medida(m)].join(' · '); } catch (e) { return ''; } };
    const de = e => lista.filter(c => c.etapa === e).sort((a, b) => (seg[a.k] ? 1 : 0) - (seg[b.k] ? 1 : 0) || b.ult - a.ult);
    // pedidos: por cotizar (nuevo) y esperando respuesta (cotizado)
    const porCot = todos.filter(p => p.estado === 'nuevo').sort((a, b) => b.creado - a.creado), espRes = todos.filter(p => p.estado === 'cotizado').sort((a, b) => (b.cotizacion ? b.cotizacion.enviada : 0) - (a.cotizacion ? a.cotizacion.enviada : 0));
    const sinTerminar = de('disena').concat(de('espera')), TABS = [['cotizar', 'Por cotizar', porCot.length], ['respuesta', 'Esperan respuesta', espRes.length], ['aprobar', 'Por aprobar', de('aprobar').length], ['pend', 'Sin terminar', sinTerminar.length]];
    if (!clientes.tab || (!TABS.find(t => t[0] === clientes.tab)[2] && TABS.some(t => t[2]))) clientes.tab = (TABS.find(t => t[2]) || TABS[0])[0];
    const pidio = p => ((p.items[0] || {}).specs || []).find(z => z[0] === 'Pidió');
    const tarjPed = (p, modo) => { const c2 = p.cotizacion;
      return '<div class="lead cli ' + (modo === 'cotizar' ? 'e-aprobar' : 'e-disena') + '"><div class="l-cab"><div><b>' + esc(p.nombre) + ' · #' + p.folio + '</b><small>' + esc(p.tel || 'sin WhatsApp') + ' · ' + cuando(p.creado) + (pidio(p) ? ' · ' + esc(pidio(p)[1]) : '') + '</small></div></div>'
        + '<button class="c-mesa" data-cotp="' + p.id + '"><img data-foto="' + p.token + '" alt=""><div><small>' + (modo === 'cotizar' ? 'Lo que escogió' : 'Cotizada ' + (c2 ? cuando(c2.enviada) + ' · ' + pesos(c2.total) : '')) + '</small><b>' + esc((p.items[0] || {}).titulo || 'Mesa') + '</b><span>' + esc(resumenCorto(p)) + '</span></div></button>'
        + '<div class="l-bot">' + (modo === 'cotizar' ? '<button class="btn oro chico" data-cotp="' + p.id + '">Cotizar</button>' : '<button class="btn chico" data-segp="' + p.id + '">Darle seguimiento</button><a class="btn chico" href="#p=' + p.id + '">Aceptó → anticipo</a>')
        + (p.tel ? '<button class="btn chico" data-cita="' + p.id + '">Agendar cita</button>' : '') + '</div></div>'; };
    const cuerpo = { cotizar: () => porCot.length ? '<p class="sub l-sub">Ya escogieron su mesa y dejaron su WhatsApp. Toca <b>Cotizar</b>: ves lo que eligieron, pones precio y se lo mandas.</p><div class="leads">' + porCot.map(p => tarjPed(p, 'cotizar')).join('') + '</div>' : '<p class="sub l-sub">Nada por cotizar. 🎉</p>',
      respuesta: () => espRes.length ? '<p class="sub l-sub">Ya tienen su cotización. Escríbeles para cerrar o agenda una cita con muestras.</p><div class="leads">' + espRes.map(p => tarjPed(p, 'respuesta')).join('') + '</div>' : '<p class="sub l-sub">Nadie esperando respuesta.</p>',
      aprobar: () => de('aprobar').length ? '<p class="sub l-sub">Pidieron el diseñador 3D. Aprueba o escríbeles.</p><div class="leads">' + de('aprobar').map(ficha).join('') + '</div>' : '<p class="sub l-sub">Nadie por aprobar.</p>',
      pend: () => (sinTerminar.length ? '<p class="sub l-sub">Tienen acceso o armaron su mesa pero no la enviaron. Ármasela tú o escríbeles.</p><div class="leads">' + sinTerminar.map(ficha).join('') + '</div>' : '<p class="sub l-sub">Nadie pendiente.</p>')
        + (de('rech').length ? '<details class="c-rech"><summary>Rechazados (' + de('rech').length + ')</summary><div class="leads">' + de('rech').map(ficha).join('') + '</div></details>' : '') };
    main.innerHTML = '<div class="cab"><div><h1>Clientes</h1></div></div>'
      + '<details class="c-nuevo"><summary>+ Me escribió alguien por WhatsApp</summary><p class="sub">Mándale el cotizador de 1 minuto, o ármale tú la mesa.</p><div class="acc-nuevo"><input id="cn-nom" placeholder="Nombre" maxlength="60"><input id="cn-tel" inputmode="tel" placeholder="WhatsApp (10 dígitos)" maxlength="16"><button class="btn verde" id="cn-link">Mandarle el cotizador</button><button class="btn negro" id="cn-ok">Armarle su mesa yo</button></div><p class="nota">El cotizador le abre con su nombre y WhatsApp ya puestos: escoge tamaño, piedra y base y te llega como pedido.</p></details>'
      + '<div class="c-tabs">' + TABS.map(([k2, t, n]) => '<button class="' + (clientes.tab === k2 ? 'on' : '') + '" data-tab="' + k2 + '">' + t + (n ? ' <i>' + n + '</i>' : '') + '</button>').join('') + '</div>'
      + '<div id="c-cuerpo">' + cuerpo[clientes.tab]() + '</div>'
      + '<p class="c-pie"><a class="lnk" href="#accesos">Links de acceso directo al 3D →</a></p>';
    cargarFotos();
    main.onclick = async e => {
      const d = e.target.closest('[data-dec]'), w = e.target.closest('[data-escrito]'), mk = e.target.closest('[data-marca]'), ms = e.target.closest('[data-mesa]');
      if (ms) { const c = lista.find(z => z.k === ms.dataset.mesa); if (c) verMesa(c, msj(c)); return; }
      const tb = e.target.closest('[data-tab]'); if (tb) { clientes.tab = tb.dataset.tab; return clientes(); }
      const cp = e.target.closest('[data-cotp]'); if (cp) { const p = todos.find(z => z.id === cp.dataset.cotp); if (p) cotizarRapido(p); return; }
      const sp = e.target.closest('[data-segp]'); if (sp) { const p = todos.find(z => z.id === sp.dataset.segp); if (p) cotizarRapido(p, true); return; }
      const ct = e.target.closest('[data-cita]'); if (ct) { const p = todos.find(z => z.id === ct.dataset.cita); if (p) agendarCita({ nombre: p.nombre, tel: p.tel, folio: p.folio }); return; }
      if (e.target.closest('#cn-link')) { const n = $('#cn-nom').value.trim(), t = $('#cn-tel').value.replace(/\D/g, ''); if (t.length < 10) return alerta('Escribe su WhatsApp a 10 dígitos.');
        const url = 'https://dkas.mx/cotiza.html?' + new URLSearchParams(Object.assign({ c: 'whatsapp' }, n ? { n } : {}, { w: t }));
        window.open('https://wa.me/' + A.waNum(t) + '?text=' + encodeURIComponent('Hola' + (n ? ' ' + n.split(' ')[0] : '') + ', soy ' + yoN + ' de DKAS 👋 Aquí cotizas tu mesa en 1 minuto: escoges tamaño, piedra y base, y te mando tu cotización por aquí.\n' + url), '_blank'); return; }
      if (e.target.closest('#cn-ok')) { const [n0, ...ap] = $('#cn-nom').value.trim().split(/\s+/), id = A.rnd(), b0 = e.target.closest('#cn-ok'); b0.disabled = true;
        try { await A.solicitarAcceso(id, { nombre: n0 || '', apellido: ap.join(' ') || '(web)', tel: $('#cn-tel').value, quiere: 'Escribió por WhatsApp' }); await A.decidirSolicitud(id, 'aprobada'); location.hash = '#prop=' + id; } catch (x) { b0.disabled = false; alerta(x.message); } return; }
      const wo = e.target.closest('[data-wa-op]'); if (wo) { const c = lista.find(z => z.k === wo.dataset.waOp); if (c) elegirMensaje(c); return; }
      if (d) { const [id, est] = d.dataset.dec.split('|'); if (est === 'rechazada' && !confirm('¿Rechazar esta solicitud?')) return; d.disabled = true;
        try { await A.decidirSolicitud(id, est); toast(est === 'aprobada' ? 'Aprobado: ya puede diseñar. Avísale por WhatsApp.' : 'Rechazada'); contarSolicitudes(true); clientes(); } catch (x) { d.disabled = false; alerta(x.message); } return; }
      const k = (w && w.dataset.escrito) || (mk && mk.dataset.marca); if (!k) return;
      if (w && seg[k]) return; const si = w ? true : !seg[k];
      try { await A.marcarEscrito(k, si); if (si) seg[k] = { escrito: Date.now(), por: me.nombre }; else delete seg[k]; setTimeout(clientes, w ? 600 : 0); } catch (x) { alerta(x.message); }
    };
  }
  function cargarFotos() { $$('img[data-foto]').forEach(async im => { const p = todos.find(z => z.token === im.dataset.foto); if (!p) return; try { const u = await fotoMesa(p); if (u) im.src = u; } catch (e) {} }); }

  // ---------- Cotizar en una sola pantalla: lo que escogió, precio (opcional), mensaje y WhatsApp ----------
  async function cotizarRapido(p, seguimiento) {
    const m = mesaDe(p), x = numeros(p), n = p.nombre.split(' ')[0], yoN = String(me.nombre || 'Zury').split(' ')[0], col = D.color(m.color || 'negro');
    const spec = k => (((p.items[0] || {}).specs || []).find(z => z[0] === k) || [])[1] || '', otraP = /^Otra:/.test(spec('Piedra')) ? spec('Piedra').replace(/^Otra:\s*/, '') : '', otraB = /^Otra:/.test(spec('Base')) ? spec('Base').replace(/^Otra:\s*/, '') : '', ayudaP = /ayudemos/.test(spec('Piedra'));
    const nomP = otraP ? 'Otra: ' + otraP : ayudaP ? 'Que le ayudemos a elegir' : D.piedra(m.piedra).nombre, nomB = otraB ? 'Otra: ' + otraB : baseDe(p);
    const v = document.createElement('div'); v.className = 'vm';
    const lin = () => ['Mesa de ' + D.USOS[m.uso].nombre.toLowerCase() + ' ' + D.FORMAS[m.forma].toLowerCase() + ' · ' + D.medida(m) + (D.personas(m) ? ' (' + D.personas(m) + ' personas)' : ''), 'Piedra ' + nomP, 'Base ' + nomB + ', color ' + colorDe(p).toLowerCase(), 'Altura ' + m.H + ' cm'];
    const ligaPed = SITE + 'pedido.html#t=' + p.token, citaTxt = '¿Te gustaría que te visitemos con muestras de las piedras y midamos tu espacio? Estamos disponibles cuando gustes.';
    const mensajes = precio => { const ant = precio ? Math.ceil(precio / 2) : 0, lista = lin().map(z => '• ' + z).join('\n');
      if (seguimiento) return [
        ['Seguimiento', 'Hola ' + n + ', ¿pudiste ver la cotización de tu mesa (#' + p.folio + ')? Si quieres ajustamos medidas, piedra o base. Aquí la ves: ' + ligaPed],
        ['Cita con muestras', 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Para que elijas con calma, te visitamos con muestras reales de las piedras y medimos tu espacio. Estamos disponibles cuando gustes, ¿qué día te acomoda?'],
        ['Directo', n + ', ¿avanzamos con tu mesa? Con el anticipo empezamos a fabricarla. ¿Te paso los datos para el depósito?'],
        ['Formal', 'Buen día, ' + n + '. Le saluda ' + yoN + ', de DKAS. Damos seguimiento a la cotización de su mesa (#' + p.folio + '). Quedamos a sus órdenes para cualquier ajuste o para agendar una visita con muestras.']];
      if (precio) return [
        ['Cotización', 'Hola ' + n + ', esta es la cotización de tu mesa:\n' + lista + '\n\nTotal: ' + pesos(precio) + '\nAnticipo para empezar (50%): ' + pesos(ant) + '\nAquí la ves y la aceptas: ' + ligaPed + '\n\n' + citaTxt],
        ['Formal', 'Buen día, ' + n + '. Le saluda ' + yoN + ', de DKAS. Le compartimos la cotización de su mesa:\n' + lista + '\n\nTotal: ' + pesos(precio) + ' · anticipo del 50%: ' + pesos(ant) + '.\nPuede verla y aceptarla aquí: ' + ligaPed + '\nCon gusto le visitamos con muestras de las piedras para medir su espacio.']];
      return [
        ['Directo', 'Hola ' + n + ', este es el pedido que me llegó:\n' + lista + '\n\nTe mando el plano; dime si está correcto y cuándo podemos vernos para personalizarlo más y darte el mejor servicio posible. 🙌'],
        ['Esto es lo que escogiste', 'Hola ' + n + ', ¿cómo estás? 😊 Soy ' + yoN + ' de DKAS. Esta es la mesa que escogiste:\n' + lista + '\n\n¿Es correcto? Si quieres ajustamos algo y te preparo tu cotización.'],
        ['Cita con muestras', 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Recibí tu mesa (' + D.piedra(m.piedra).nombre + ', base ' + baseDe(p) + '). Para recomendarte la medida ideal, te visitamos con muestras reales de las piedras y medimos tu espacio. Estamos disponibles cuando gustes, ¿qué día te acomoda?'],
        ['Formal', 'Buen día, ' + n + '. Le saluda ' + yoN + ', de DKAS. Recibimos su solicitud:\n' + lista + '\n\nEn breve le compartimos la cotización formal. Si lo prefiere, le visitamos con muestras de las piedras para medir su espacio.']]; };
    const tile = (img, t, sub) => '<div class="cr-t">' + (img ? '<img src="' + img + '" alt="">' : '<span class="cr-ico">✏️</span>') + '<div><small>' + t + '</small><b>' + esc(sub) + '</b></div></div>';
    v.innerHTML = '<div class="vm-caja"><button class="vm-x" aria-label="Cerrar">×</button><div class="vm-foto"><img id="cr-foto" alt=""></div><div class="vm-tx">'
      + '<p class="vm-et">' + (seguimiento ? 'Seguimiento' : 'Cotizar') + ' · ' + esc(p.nombre) + ' · #' + p.folio + '</p><h2>' + esc(D.titulo(m)) + '</h2>'
      + (otraP || otraB ? '<p class="cr-otra">⚠ Pidió algo que no está en el catálogo: <b>' + esc([otraP && 'piedra — ' + otraP, otraB && 'base — ' + otraB].filter(Boolean).join(' · ')) + '</b>. Escríbele para ayudarle.</p>' : '')
      + '<div class="cr-tiles">' + tile(otraP ? null : 'img/piedras/' + m.piedra + '.jpg', otraP ? 'Piedra (otra)' : 'Piedra', nomP) + tile(D.BASES[m.base].cli || otraB ? null : D.BASES[m.base].foto || 'img/bases/' + m.base + '.jpg', otraB ? 'Base (otra)' : D.BASES[m.base].cli ? 'Base (la dibujó)' : 'Base', nomB + ' · ' + colorDe(p).toLowerCase())
      + '<div class="cr-t cr-m"><div><small>Medidas</small><b>' + esc(D.medida(m)) + ' · h ' + m.H + '</b>' + (D.personas(m) ? '<span>' + D.personas(m) + ' personas</span>' : '') + '</div></div></div>'
      + '<p class="cr-ed"><a class="lnk" href="#t=' + p.id + '">Cambiar la mesa o ver costos →</a></p>'
      + (seguimiento ? '' : '<label class="cr-precio">Precio total <small>(opcional: si lo dejas vacío le mandas lo que escogió, sin precio)</small><div><input id="cr-p" inputmode="decimal" placeholder="$" value="' + (x.pactado || '') + '">' + (x.sugerido ? '<button class="btn chico" id="cr-sug">Sugerido ' + pesos(x.sugerido) + '</button>' : '') + '</div></label>')
      + '<h3>Mensaje</h3><div class="m-ops" id="cr-ops"></div><label class="m-ed">Puedes cambiarlo<textarea id="cr-tx" rows="7"></textarea></label>'
      + '<div class="vm-bot"><button class="btn verde" id="cr-wa">Mandar por WhatsApp</button><button class="btn" id="cr-cita">Agendar cita con muestras</button></div></div></div>';
    document.body.appendChild(v); document.body.style.overflow = 'hidden';
    fotoMesa(p).then(u => { if (u) v.querySelector('#cr-foto').src = u; }).catch(() => {});
    let elegido = 0, editado = false;
    const precio = () => seguimiento ? 0 : num((v.querySelector('#cr-p') || {}).value) || 0;
    const pintaOps = () => { const ops = mensajes(precio()); if (elegido >= ops.length) elegido = 0;
      v.querySelector('#cr-ops').innerHTML = ops.map(([t], i) => '<button class="m-op' + (i === elegido ? ' on' : '') + '" data-op="' + i + '"><b>' + t + '</b></button>').join('');
      if (!editado) v.querySelector('#cr-tx').value = ops[elegido][1];
      v.querySelector('#cr-wa').textContent = seguimiento ? 'Mandar por WhatsApp' : precio() ? 'Mandar cotización por WhatsApp' : 'Mandar lo que escogió (sin precio)'; };
    pintaOps();
    v.querySelector('#cr-tx').oninput = () => { editado = true; };
    if (v.querySelector('#cr-p')) v.querySelector('#cr-p').oninput = () => { editado = false; pintaOps(); };
    const cerrar = () => { v.remove(); document.body.style.overflow = ''; };
    v.onclick = async e => {
      if (e.target === v || e.target.closest('.vm-x')) return cerrar();
      if (e.target.closest('.cr-ed a')) return cerrar();
      const o = e.target.closest('[data-op]'); if (o) { elegido = +o.dataset.op; editado = false; return pintaOps(); }
      if (e.target.closest('#cr-sug')) { v.querySelector('#cr-p').value = x.sugerido; editado = false; return pintaOps(); }
      if (e.target.closest('#cr-cita')) { cerrar(); return agendarCita({ nombre: p.nombre, tel: p.tel, folio: p.folio }); }
      const b = e.target.closest('#cr-wa'); if (!b) return;
      if (!p.tel) return alerta('Este pedido no tiene WhatsApp.');
      b.disabled = true; const pr = precio(), tx = v.querySelector('#cr-tx').value;
      try {
        let files = [];
        if (pr) {
          const f = Object.assign({}, ficha(p), { pactado: pr }); await A.guardarFicha(p.id, 'dkas', f, 'Precio pactado: ' + pesos(pr)); p.fichas = Object.assign({}, p.fichas, { dkas: f });
          const x2 = numeros(p), cot = { total: pr, anticipo: Math.ceil(pr / 2), mesa: [m.uso, m.forma, m.L, m.W, m.base, m.piedra].join('.'), items: [{ titulo: D.titulo(m), cantidad: x2.n, precio: Math.round(pr / x2.n) }],
            detalle: resumenP(p).map(([k, w]) => k + ': ' + w).join(' · '), condiciones: 'Anticipo del 50% para empezar a fabricar; el saldo se paga al entregar.' };
          await A.enviarCotizacion(p.id, cot); p.cotizacion = Object.assign({}, cot, { enviada: Date.now() }); p.estado = 'cotizado';
          files.push(new File([await imagenCoti(p)], 'cotizacion-' + p.folio + '.jpg', { type: 'image/jpeg' }));
        } else if (!seguimiento) files.push(new File([await imagenEleccion(p)], 'tu-mesa-' + p.folio + '.jpg', { type: 'image/jpeg' }));
        if (!seguimiento) files.push(new File([await CQ.png(m, { cliente: p.nombre, plano: true })], 'plano-' + p.folio + '.jpg', { type: 'image/jpeg' }));
        await compartir(files, tx, A.waNum(p.tel));
        if (pr) toast('Cotización enviada: pasa a «Esperan respuesta»');
        cerrar(); await recargar(); if (location.hash === '#clientes') clientes();
      } catch (x3) { b.disabled = false; alerta(x3.message); }
    };
  }
  // la imagen de lo que escogió (sin precio): foto, piedra, base y plano
  async function imagenEleccion(p) {
    const m = mesaDe(p), ld = s2 => cargarImg(s2);
    const [f, pi, ba, logo] = await Promise.all([fotoMesa(p).then(ld), ld('img/piedras/' + m.piedra + '.jpg'), ld(D.BASES[m.base].foto || 'img/bases/' + m.base + '.jpg'), ld('img/dkas-claro.png')]);
    const Wd = 1080, cv = document.createElement('canvas'); cv.width = Wd; cv.height = 1500; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, Wd, 1500); g.fillStyle = '#14110e'; g.fillRect(0, 0, Wd, 110);
    if (logo) g.drawImage(logo, 50, 28, 54 * logo.width / logo.height, 54);
    g.fillStyle = '#c2a273'; g.font = '600 28px Inter,Arial'; g.textAlign = 'right'; g.fillText('Tu mesa, ' + p.nombre.split(' ')[0], Wd - 50, 66); g.textAlign = 'left';
    if (f) g.drawImage(f, 0, 110, Wd, 720);
    const tile = (im, x0, t, sub) => { if (im) { g.save(); g.beginPath(); g.rect(x0, 870, 200, 200); g.clip(); const r = Math.max(200 / im.width, 200 / im.height); g.drawImage(im, x0 + (200 - im.width * r) / 2, 870 + (200 - im.height * r) / 2, im.width * r, im.height * r); g.restore(); }
      g.fillStyle = '#8f7043'; g.font = '600 22px Inter,Arial'; g.fillText(t, x0 + 220, 910); g.fillStyle = '#14110e'; g.font = '600 30px Inter,Arial'; g.fillText(sub, x0 + 220, 952); };
    tile(pi, 50, 'PIEDRA', D.piedra(m.piedra).nombre);
    const tile2 = (im, y0, t, sub) => { if (im) { g.save(); g.beginPath(); g.rect(50, y0, 200, 200); g.clip(); const r = Math.max(200 / im.width, 200 / im.height); g.drawImage(im, 50 + (200 - im.width * r) / 2, y0 + (200 - im.height * r) / 2, im.width * r, im.height * r); g.restore(); }
      g.fillStyle = '#8f7043'; g.font = '600 22px Inter,Arial'; g.fillText(t, 270, y0 + 40); g.fillStyle = '#14110e'; g.font = '600 30px Inter,Arial'; g.fillText(sub, 270, y0 + 82); };
    tile2(ba, 1090, 'BASE', baseDe(p) + ' · ' + colorDe(p).toLowerCase());
    g.fillStyle = '#14110e'; g.font = '700 34px Inter,Arial'; g.fillText(D.medida(m) + (D.personas(m) ? ' · ' + D.personas(m) + ' personas' : '') + ' · altura ' + m.H + ' cm', 50, 1360);
    g.fillStyle = '#6e6962'; g.font = '400 24px Inter,Arial'; g.fillText('DKAS · mesas de piedra sinterizada · dkas.mx', 50, 1450);
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.88));
  }
  // ---------- agendar cita: muestras de piedras y medir su espacio; queda en la Agenda y se le confirma por WhatsApp ----------
  function agendarCita(c) {
    const v = document.createElement('div'), n = c.nombre.split(' ')[0], yoN = String(me.nombre || 'Zury').split(' ')[0]; v.className = 'vm';
    const TIPOS = [['visita', 'Visita con muestras y medir su espacio'], ['taller', 'Viene al taller a ver las piedras'], ['llamada', 'Llamada o videollamada']];
    v.innerHTML = '<div class="vm-caja"><button class="vm-x" aria-label="Cerrar">×</button><div class="vm-tx"><p class="vm-et">Cita · ' + esc(c.nombre) + (c.folio ? ' · #' + c.folio : '') + '</p><h2>Agendar cita</h2>'
      + '<div class="m-ops">' + TIPOS.map(([k2, t], i) => '<button class="m-op' + (i ? '' : ' on') + '" data-tipo="' + k2 + '"><b>' + t + '</b></button>').join('') + '</div>'
      + '<div class="ag-campos"><label>Día<input type="date" id="ci-f" value="' + hoy(1) + '"></label><label>Hora<input type="time" id="ci-h" value="11:00"></label></div>'
      + '<label class="m-ed">Mensaje de confirmación<textarea id="ci-tx" rows="5"></textarea></label>'
      + '<div class="vm-bot"><button class="btn verde" id="ci-ok">Guardar en la Agenda y confirmarle por WhatsApp</button><button class="btn" id="ci-solo">Solo guardar en la Agenda</button></div></div></div>';
    document.body.appendChild(v); document.body.style.overflow = 'hidden';
    let tipo = 'visita', editado = false;
    const fechaTxt = () => { const f = v.querySelector('#ci-f').value, h = v.querySelector('#ci-h').value; return (f ? new Date(f + 'T12:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : '') + (h ? ' a las ' + new Date('2000-01-01T' + h).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }).replace(/.$/, '') : ''); };
    const texto = () => ({ visita: 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Te confirmo la visita el ' + fechaTxt() + '. Te llevamos muestras reales de las piedras y medimos tu espacio para recomendarte la mesa ideal. ¿Me compartes tu dirección?',
      taller: 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Te esperamos en el taller el ' + fechaTxt() + ' para que veas las piedras en persona. Te mando la ubicación.',
      llamada: 'Hola ' + n + ', soy ' + yoN + ' de DKAS 👋 Te llamo el ' + fechaTxt() + ' para platicar de tu mesa. Si prefieres otra hora, dime.' })[tipo];
    const pinta = () => { if (!editado) v.querySelector('#ci-tx').value = texto(); };
    pinta(); v.querySelector('#ci-tx').oninput = () => { editado = true; }; v.querySelector('#ci-f').onchange = v.querySelector('#ci-h').onchange = () => { editado = false; pinta(); };
    const cerrar = () => { v.remove(); document.body.style.overflow = ''; };
    v.onclick = async e => {
      if (e.target === v || e.target.closest('.vm-x')) return cerrar();
      const t = e.target.closest('[data-tipo]'); if (t) { tipo = t.dataset.tipo; v.querySelectorAll('[data-tipo]').forEach(z => z.classList.toggle('on', z === t)); editado = false; return pinta(); }
      const ok = e.target.closest('#ci-ok, #ci-solo'); if (!ok) return;
      const f = v.querySelector('#ci-f').value, h = v.querySelector('#ci-h').value; if (!f) return alerta('Escoge el día.');
      ok.disabled = true;
      try {
        const id = Date.now().toString(36) + A.rnd().slice(0, 6), tt = TIPOS.find(z => z[0] === tipo)[1];
        await A.guardarTarea(id, Object.assign({ texto: ('Cita con ' + c.nombre + (c.tel ? ' (' + c.tel + ')' : '') + ': ' + tt.toLowerCase() + (c.folio ? ' · pedido #' + c.folio : '')).slice(0, 400), fecha: f, hecho: false, creado: Date.now(), urgente: true, por: String(me.nombre || '').slice(0, 60) }, h ? { hora: h } : {}));
        toast('Cita guardada en la Agenda'); contarAgenda();
        if (ok.id === 'ci-ok' && c.tel) window.open('https://wa.me/' + A.waNum(c.tel) + '?text=' + encodeURIComponent(v.querySelector('#ci-tx').value), '_blank');
        cerrar();
      } catch (x) { ok.disabled = false; alerta(x.message); }
    };
  }

  // la mesa del cliente: su foto, el plano con medidas exactas y mandarla por WhatsApp (sin precios)
  function verMesa(c, texto) {
    const p = String(c.d.cod).split('.'), m = D.normalizar({ uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5], H: +p[6] || undefined, color: p[7] || 'negro' });
    const info = { cliente: c.nombre, plano: true }, v = document.createElement('div'); v.className = 'vm';
    v.innerHTML = '<div class="vm-caja"><button class="vm-x" aria-label="Cerrar">×</button>' + (c.d.img ? '<div class="vm-foto"><img src="' + c.d.img + '" alt=""></div>' : '')
      + '<div class="vm-tx"><p class="vm-et">La mesa de ' + esc(c.nombre) + (c.p ? ' · enviada' : ' · guardada, sin enviar') + '</p><h2>' + esc(D.titulo(m)) + '</h2>'
      + '<div class="vm-cq" role="button">' + CQ.plano(m, info) + '<span>Tocar para ver en grande</span></div>'
      + '<ul class="vm-med">' + D.resumen(m).map(([k, x]) => '<li><span>' + esc(k) + '</span><b>' + esc(x) + '</b></li>').join('') + '</ul>'
      + '<div class="vm-bot">' + (c.tel ? '<button class="btn verde" data-vm="wa">Mandarle foto y plano por WhatsApp</button>' : '') + '<a class="btn" target="_blank" rel="noopener" href="' + SITE + '#d=' + encodeURIComponent(c.d.cod) + '">Abrirla en el 3D</a><button class="btn" data-vm="bajar">Descargar plano</button></div></div></div>';
    document.body.appendChild(v); document.body.style.overflow = 'hidden';
    const cerrar = () => { v.remove(); document.body.style.overflow = ''; };
    v.onclick = async e => {
      if (e.target === v || e.target.closest('.vm-x')) return cerrar();
      if (e.target.closest('.vm-cq')) { const u = URL.createObjectURL(await CQ.png(m, info)), w = window.open(u, '_blank'); if (!w) location.href = u; return; }
      const b = e.target.closest('[data-vm]'); if (!b) return;
      if (b.dataset.vm === 'bajar') return bajar(await CQ.png(m, info), 'plano-' + c.nombre + '.jpg');
      const fs = [new File([await CQ.png(m, info)], 'plano-mesa.jpg', { type: 'image/jpeg' })];
      if (c.d.img) try { fs.unshift(new File([await (await fetch(c.d.img)).blob()], 'mi-mesa.jpg', { type: 'image/jpeg' })); } catch (x) {}
      await compartir(fs, texto + '\n\n' + D.resumen(m).filter(z => z[0] !== 'Fabricación').map(z => z[0] + ': ' + z[1]).join('\n'), A.waNum(c.tel));
      A.marcarEscrito(c.k, true).catch(() => {});
    };
  }

  // ---------- Armarle su mesa: tú escoges piedra, base, color y medidas; se la mandas por WhatsApp para que diga sí o no ----------
  async function propuesta(k) {
    main.innerHTML = '<p class="cargando">Cargando…</p>';
    let sols, d; try { [sols, d] = await Promise.all([A.solicitudes(), A.verDiseno(k).catch(() => null)]); } catch (e) { main.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; return; }
    const x = sols.find(z => z.id === k); if (!x) { main.innerHTML = '<a class="volver" href="#clientes">← Clientes</a><p class="err">No encontramos a ese cliente.</p>'; return; }
    const c = { k, nombre: (x.nombre + ' ' + (x.apellido === '(web)' ? '' : x.apellido || '')).trim(), tel: x.tel || '', quiere: x.quiere || '' }, n1 = c.nombre.split(' ')[0], yoN = String(me.nombre || 'Zury').split(' ')[0];
    const deCod = cod => { const p = String(cod).split('.'); return { uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5], H: +p[6] || undefined, color: p[7] || 'negro' }; };
    const FI = window.DKAS_INTERES || {}, gusto = FI[String(c.quiere).replace(/^Quiero una así: /, '')];
    let m = d && d.cod ? D.normalizar(deCod(d.cod)) : gusto && gusto.m ? D.normalizar(Object.assign({}, gusto.m, D.tamanoPara(gusto.m.uso, gusto.m.forma, gusto.m.uso === 'comedor' ? 8 : 4))) : D.normalizar(Object.assign({ uso: 'comedor', forma: 'rect', base: 'patas', piedra: 'statuario' }, D.tamanoPara('comedor', 'rect', 8)));
    const codDe = m => [m.uso, m.forma, m.L, m.W, m.base, m.piedra, m.H].concat(m.color && m.color !== 'negro' ? [m.color] : []).join('.');
    const lineas = m => { const n = D.personas(m), col = D.COLORES.find(z => z.id === (m.color || 'negro'));
      return ['Mesa de ' + D.USOS[m.uso].nombre.toLowerCase() + ' ' + D.FORMAS[m.forma].toLowerCase() + ' · ' + D.medida(m) + (n ? ' (' + n + ' personas)' : ''), 'Piedra ' + D.piedra(m.piedra).nombre, 'Base ' + D.BASES[m.base].nombre + ', color ' + (col ? col.nombre.toLowerCase() : 'negro mate'), 'Altura ' + m.H + ' cm']; };
    const texto = m => 'Hola ' + n1 + ', soy ' + yoN + ' de DKAS 👋 Te armé esta mesa con lo que me comentaste:\n' + lineas(m).map(z => '• ' + z).join('\n') + '\n\n¿Es lo que buscas? Respóndeme sí, o dime qué le cambiamos y te preparo tu cotización.';
    const chip = (attr, v, t, on) => '<button class="pp-chip' + (on ? ' on' : '') + '" data-' + attr + '="' + v + '">' + t + '</button>';
    const pinta = () => {
      const red = D.redonda(m.forma), ops = D.opcionesPersonas(m.uso, m.forma), n = D.personas(m);
      main.innerHTML = '<a class="volver" href="#clientes">← Clientes</a><h1>Mesa para ' + esc(c.nombre) + '</h1><p class="sub">' + (c.quiere ? esc(c.quiere) + ' · ' : '') + esc(c.tel) + '</p>'
        + '<div class="pp"><div class="pp-ver"><div class="pp-img"><img id="pp-img" alt=""><span id="pp-carga">Preparando la foto…</span></div><p class="pp-tit">' + esc(D.titulo(m)) + '</p><ul class="pp-lin">' + lineas(m).map(z => '<li>' + esc(z) + '</li>').join('') + '</ul></div>'
        + '<div class="pp-ctl"><h3>¿Para qué?</h3><div class="pp-chips">' + Object.keys(D.USOS).map(u => chip('uso', u, D.USOS[u].nombre, m.uso === u)).join('') + '</div>'
        + '<h3>Forma</h3><div class="pp-chips">' + D.formasDe(m.uso).map(f => chip('forma', f, D.FORMAS[f], m.forma === f)).join('') + '</div>'
        + (ops.length ? '<h3>Personas</h3><div class="pp-chips">' + ops.map(p => chip('pers', p, p, n === p)).join('') + '</div>' : '')
        + '<h3>Medidas (cm)</h3><div class="pp-med"><label>' + (red ? 'Diámetro' : 'Largo') + '<input type="number" data-dim="L" value="' + m.L + '"></label>' + (red ? '' : '<label>Ancho<input type="number" data-dim="W" value="' + m.W + '"></label>') + '<label>Altura<input type="number" data-dim="H" value="' + m.H + '"></label></div>'
        + '<h3>Piedra</h3><div class="pp-fotos">' + D.PIEDRAS.map(p => '<button class="pp-f' + (m.piedra === p.id ? ' on' : '') + '" data-piedra="' + p.id + '"><img src="img/piedras/' + p.id + '.jpg" alt="" loading="lazy"><span>' + p.nombre + '</span></button>').join('') + '</div>'
        + '<h3>Base</h3><div class="pp-fotos">' + D.basesPara(m).map(b => '<button class="pp-f' + (m.base === b ? ' on' : '') + '" data-base="' + b + '"><img src="' + (D.BASES[b].foto || 'img/bases/' + b + '.jpg') + '" alt="" loading="lazy"><span>' + D.BASES[b].nombre + '</span></button>').join('') + '</div>'
        + '<h3>Color de la base</h3><div class="pp-chips">' + D.COLORES.map(k2 => '<button class="pp-chip pp-col' + ((m.color || 'negro') === k2.id ? ' on' : '') + '" data-color="' + k2.id + '"><i style="background:' + k2.hex + '"></i>' + k2.nombre + '</button>').join('') + '</div></div></div>'
        + '<div class="pp-bot"><button class="btn verde grande" id="pp-wa">Mandársela por WhatsApp</button><button class="btn" id="pp-guarda">Solo guardar en su ficha</button><button class="btn oro" id="pp-si">Dijo que sí: crear pedido</button></div>';
      foto();
    };
    let fotoUrl = null, tFoto = 0;
    function foto() { const im = $('#pp-img'), sp = $('#pp-carga'); clearTimeout(tFoto); if (sp) sp.hidden = false;
      tFoto = setTimeout(async () => { const u = await foto3d(m); if (u && $('#pp-img')) { fotoUrl = u; $('#pp-img').src = u; if ($('#pp-carga')) $('#pp-carga').hidden = true; } }, 250); }
    const cambia = cm => { if ((cm.uso && cm.uso !== m.uso) && !cm.H) cm.H = D.USOS[cm.uso].H; m = D.normalizar(Object.assign({}, m, cm)); if (!D.basesPara(m).includes(m.base)) m.base = D.basesPara(m)[0]; pinta(); };
    // la imagen que se manda: foto, datos y plano en una sola hoja
    async function hoja() {
      const fu = fotoUrl || await foto3d(m), cq = await CQ.png(m, { cliente: c.nombre, plano: true });
      const ld = s2 => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = s2; });
      const [f, p, logo] = await Promise.all([fu ? ld(fu) : null, ld(URL.createObjectURL(cq)), ld('img/dkas-claro.png')]);
      const Wd = 1200, lin = lineas(m), Hp = p ? Math.round(Wd * p.height / p.width) : 0, Hd = 120 + (f ? 800 : 0) + 70 + lin.length * 48 + 40 + Hp + 30;
      const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Hd; const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, Wd, Hd); g.fillStyle = '#14110e'; g.fillRect(0, 0, Wd, 120);
      if (logo) g.drawImage(logo, 40, 30, 60 * logo.width / logo.height, 60);
      g.fillStyle = '#c2a273'; g.font = '600 30px Arial'; g.textAlign = 'right'; g.fillText('Propuesta para ' + c.nombre, Wd - 40, 72); g.textAlign = 'left';
      let y = 120; if (f) { g.drawImage(f, 0, y, Wd, 800); y += 800; }
      g.fillStyle = '#14110e'; g.font = '700 38px Arial'; g.fillText(D.titulo(m), 40, y + 60); y += 70;
      g.font = '30px Arial'; g.fillStyle = '#3d3a35'; lin.forEach(z => { y += 48; g.fillText('• ' + z, 40, y); }); y += 40;
      if (p) g.drawImage(p, 0, y, Wd, Hp);
      return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.88));
    }
    async function guardar(extra) { const img = fotoUrl ? await chica(fotoUrl).catch(() => null) : null;
      const x2 = Object.assign({ cod: codDe(m), titulo: D.titulo(m), por: String(me.nombre || 'DKAS').slice(0, 60), prop: Date.now() }, extra || {});
      if (img) { const cv = await new Promise(ok => { const i = new Image(); i.onload = () => { const q = document.createElement('canvas'); q.width = 480; q.height = 320; q.getContext('2d').drawImage(i, 0, 0, 480, 320); ok(q.toDataURL('image/jpeg', 0.7)); }; i.src = img; }); x2.img = cv; }
      await A.guardarDiseno(k, x2); }
    pinta();
    main.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.uso) { const f = D.formasDe(b.dataset.uso).includes(m.forma) ? m.forma : D.formasDe(b.dataset.uso)[0], o = D.opcionesPersonas(b.dataset.uso, f); return cambia(Object.assign({ uso: b.dataset.uso, forma: f }, o.length ? D.tamanoPara(b.dataset.uso, f, o[Math.floor(o.length / 2)]) : {})); }
      if (b.dataset.forma) { const n = D.personas(m); return cambia(Object.assign({ forma: b.dataset.forma }, n ? D.tamanoPara(m.uso, b.dataset.forma, n) : {})); }
      if (b.dataset.pers) return cambia(D.tamanoPara(m.uso, m.forma, +b.dataset.pers));
      if (b.dataset.piedra) return cambia({ piedra: b.dataset.piedra });
      if (b.dataset.base) return cambia({ base: b.dataset.base });
      if (b.dataset.color) return cambia({ color: b.dataset.color });
      if (b.id === 'pp-guarda') { b.disabled = true; try { await guardar(); toast('Guardada en su ficha. Si entra a dkas.mx, la ve así.'); } catch (x) { alerta(x.message); } b.disabled = false; return; }
      if (b.id === 'pp-wa') { b.disabled = true; b.textContent = 'Preparando…';
        try { const blob = await hoja(); await guardar(); A.marcarEscrito(k, true).catch(() => {});
          await compartir([new File([blob], 'mesa-' + n1.toLowerCase() + '.jpg', { type: 'image/jpeg' })], texto(m), A.waNum(c.tel)); }
        catch (x) { alerta(x.message); } b.disabled = false; b.textContent = 'Mandársela por WhatsApp'; return; }
      if (b.id === 'pp-si') { if (!confirm('¿' + c.nombre + ' dijo que sí? Se crea su pedido con esta mesa.')) return; b.disabled = true;
        try { const cod = codDe(m), r2 = await A.crearPedido({ nombre: c.nombre, tel: c.tel, items: [{ tipo: 'mesa', titulo: D.titulo(m), cantidad: 1, uso: m.uso, specs: D.resumen(m).concat([['Código', cod]]), link: SITE + '#d=' + cod }] }, true);
          if (fotoUrl) { try { await A.guardarFoto(r2.token, await chica(fotoUrl), true); } catch (x) {} }
          await guardar({ enviado: { folio: r2.folio, token: r2.token } }); await recargar(); const p = todos.find(q => q.token === r2.token); toast('Pedido #' + r2.folio + ' creado'); location.hash = p ? '#p=' + p.id : '';
        } catch (x) { b.disabled = false; alerta(x.message); } }
    };
    main.onchange = e => { const k2 = e.target.dataset.dim; if (!k2) return; const v = Math.round(+e.target.value); if (!(v > 0)) return; const cm = { [k2]: v }; if (k2 === 'L' && D.redonda(m.forma)) cm.W = v; cambia(cm); };
  }

  // ---------- accesos al diseñador 3D: solicitudes por aprobar y links de acceso directo ----------
  let ultCuenta = 0;
  function contarSolicitudes(forzar) {
    if (!forzar && Date.now() - ultCuenta < 30000) return; ultCuenta = Date.now();
    A.solicitudes().then(l => { const n = l.filter(s => s.estado === 'pendiente').length, b = $('#nb-acc'); if (b) { b.textContent = n; b.hidden = !n; } }).catch(() => {});
  }
  setInterval(() => { if (me && me.nombre) contarSolicitudes(true); }, 60000);

  // ---------- avisos: pedido nuevo, mensaje de un cliente o solicitud de acceso al 3D ----------
  // el panel revisa cada 30 s y avisa con sonido y notificación del sistema (si se dio permiso).
  // No hay servidor que mande "push": avisa mientras el panel está abierto (en el iPhone, instalado en la pantalla de inicio).
  const AV_K = 'dkas-avisos';
  let swReg = null, sinVer = 0, ctxAudio = null, vigilando = false;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('panel-sw.js').then(r => { swReg = r; }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.ir) location.hash = e.data.ir; });
  }
  const hayNotif = () => 'Notification' in window;
  function barraAvisos() {
    const b = $('#avisos'); if (!b) return;
    // solo aparece si este aparato puede activar avisos y todavía no lo ha hecho; con la × no vuelve a salir
    const h = hayNotif() && Notification.permission === 'default' && !A.load('dkas-av-x', false) ? '<span>Activa los avisos y te sonará cada pedido nuevo, mensaje de cliente o solicitud de acceso.</span><button class="btn oro chico" id="av-on">Activar notificaciones</button><button class="btn chico" id="av-x" aria-label="Cerrar">×</button>' : '';
    b.innerHTML = h; b.hidden = !h;
    const x = $('#av-x'); if (x) x.onclick = () => { A.save('dkas-av-x', true); barraAvisos(); };
    const on = $('#av-on'); if (on) on.onclick = async () => { try { await Notification.requestPermission(); } catch (e) {} barraAvisos(); if (Notification.permission === 'granted') { sonido(); avisar('Avisos activados', 'Te aviso de pedidos nuevos, mensajes y solicitudes.', ''); } };
  }
  // el sonido necesita que antes hayan tocado la pantalla una vez
  document.addEventListener('pointerdown', () => { try { ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)(); ctxAudio.resume(); } catch (e) {} }, { once: true });
  function sonido() {
    try { ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)(); const t = ctxAudio.currentTime;
      [880, 1320].forEach((f, i) => { const o = ctxAudio.createOscillator(), g = ctxAudio.createGain(), s = t + i * .18; o.frequency.value = f; g.gain.setValueAtTime(.0001, s); g.gain.exponentialRampToValueAtTime(.25, s + .02); g.gain.exponentialRampToValueAtTime(.0001, s + .35); o.connect(g); g.connect(ctxAudio.destination); o.start(s); o.stop(s + .4); });
    } catch (e) {}
  }
  function avisar(titulo, cuerpo, ir, callado) {
    if (!callado) toast(titulo + (cuerpo ? ' · ' + cuerpo : ''));
    if (document.hidden) { sinVer++; document.title = '(' + sinVer + ') DKAS · Panel'; }
    if (!hayNotif() || Notification.permission !== 'granted') return;
    const op = { body: cuerpo, icon: 'img/panel-icono.png', badge: 'img/panel-icono.png', tag: 'dkas-' + titulo + '-' + cuerpo, data: { url: 'taller.html' + (ir || '') } };
    if (swReg && swReg.showNotification) return swReg.showNotification(titulo, op).catch(() => {});
    try { const n = new Notification(titulo, op); n.onclick = () => { focus(); if (ir) location.hash = ir; n.close(); }; } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { sinVer = 0; document.title = 'DKAS · Panel'; vigilar(); } });
  async function vigilar() {
    if (!me || !me.nombre || vigilando) return; vigilando = true;
    try {
      const [l, s] = await Promise.all([A.listar(), A.solicitudes()]);
      const ahora = { ped: {}, msg: {}, sol: {} }, pend = s.filter(x => x.estado === 'pendiente');
      l.forEach(p => { ahora.ped[p.id] = 1; ahora.msg[p.id] = p.eventos.filter(e => e.autor === 'cliente' && e.tipo !== 'creado').length; });
      pend.forEach(x => { ahora.sol[x.id] = 1; });
      const antes = A.load(AV_K, null);
      if (antes) {
        const hay = [];
        l.filter(p => !antes.ped[p.id]).forEach(p => hay.push(['Pedido nuevo #' + p.folio, p.nombre + ' · ' + ((p.items[0] || {}).titulo || 'Mesa'), '#p=' + p.id]));
        l.filter(p => antes.ped[p.id] && ahora.msg[p.id] > (antes.msg[p.id] || 0)).forEach(p => hay.push(['Mensaje de ' + p.nombre, 'Pedido #' + p.folio, '#p=' + p.id]));
        pend.filter(x => !antes.sol[x.id]).forEach(x => hay.push(['Solicitud nueva · por aprobar', (x.nombre + ' ' + (x.apellido === '(web)' ? '' : x.apellido || '')).trim() + (x.quiere ? ' · ' + x.quiere : ''), '#clientes']));
        hay.slice(0, 5).forEach(a => avisar(a[0], a[1], a[2], true)); if (hay.length) toast(hay.length === 1 ? hay[0][0] + ' · ' + hay[0][1] : hay.length + ' avisos: ' + hay.map(a => a[0]).join(' · ')); if (hay.length > 5) avisar('Y ' + (hay.length - 5) + ' avisos más', 'Abre el panel', '');
        if (hay.length) { sonido(); todos = l; if (['', '#', '#taller', '#accesos', '#clientes'].includes(location.hash)) ruta(); }
      }
      A.save(AV_K, ahora);
      const b = $('#nb-acc'); if (b) { b.textContent = pend.length; b.hidden = !pend.length; }
    } catch (e) {}
    // la mesa que un cliente aprobado guarda (sin enviar): avisa una vez por cliente
    try {
      const [ds, ss] = await Promise.all([A.disenos(), A.solicitudes()]), K = 'dkas-dis', antes = A.load(K, null), ahora = {};
      Object.entries(ds).forEach(([k, d]) => { ahora[k] = 1; if (antes && !antes[k] && !d.enviado) { const x = ss.find(z => z.id === k); avisar((x ? x.nombre : 'Un cliente') + ' está diseñando su mesa', (d.titulo || 'Mesa') + ' · todavía no la envía', '#clientes'); } });
      A.save(K, ahora);
    } catch (e) {}
    // agenda: avisa cuando llega la hora de un pendiente (una vez por pendiente)
    try {
      const ag = await A.agenda(), d = new Date(), hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), ya = A.load('dkas-ag-av', {});
      contarAgenda(ag); if (location.hash !== '#agenda') tareas = ag;
      ag.filter(t => !t.hecho && t.hora && t.fecha === hoy() && t.hora <= hhmm && !ya[t.id]).forEach(t => { ya[t.id] = 1; avisar('Pendiente · ' + t.hora.replace(/^0/, '') + ' h', t.texto.slice(0, 120), '#agenda'); sonido(); });
      Object.keys(ya).forEach(k => { if (!ag.some(t => t.id === k && !t.hecho)) delete ya[k]; }); A.save('dkas-ag-av', ya);
    } catch (e) {}
    vigilando = false;
  }
  setInterval(vigilar, 30000);
  const LINK_ACC = t => 'https://dkas.mx/?acceso=' + t;
  async function accesos() {
    main.innerHTML = '<h1>Accesos al 3D</h1><p class="sub">Cargando…</p>';
    let sol, acc; try { [sol, acc] = await Promise.all([A.solicitudes(), A.accesos()]); } catch (e) { main.innerHTML = '<h1>Accesos al 3D</h1><p class="err">' + esc(e.message) + '</p>'; return; }
    const pend = sol.filter(s => s.estado === 'pendiente'), resto = sol.filter(s => s.estado !== 'pendiente'), hoy = new Date().toDateString();
    const cuando = t => { const d = new Date(t); return d.toDateString() === hoy ? 'hoy ' + d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : A.fecha(t); };
    const quien = s => esc((s.nombre + ' ' + (s.apellido === '(web)' ? '' : s.apellido || '')).trim());
    const avisar = s => s.tel ? '<a class="btn chico" target="_blank" rel="noopener" href="https://wa.me/' + A.waNum(s.tel) + '?text=' + encodeURIComponent('Hola ' + s.nombre + ', ya tienes acceso al diseñador 3D de DKAS. Entra aquí desde el mismo teléfono o computadora: https://dkas.mx/#app') + '">Avisarle por WhatsApp</a>' : '';
    const datos = s => '<div><b>' + quien(s) + '</b><small>' + esc([s.despacho, s.tel, 'pidió ' + cuando(s.creado)].filter(Boolean).join(' · ')) + '</small></div>';
    main.innerHTML = '<h1>Accesos al 3D</h1><p class="sub">El diseñador 3D de dkas.mx es privado. Solo entra quien apruebes aquí o quien abra un link que generes.</p>'
      + '<div class="resumen-g"><div><b>' + pend.length + '</b><span>por aprobar</span></div><div><b>' + resto.filter(s => s.estado === 'aprobada').length + '</b><span>aprobadas</span></div><div><b>' + acc.filter(a => a.activo).length + '</b><span>links activos</span></div></div>'
      + sec(1, 'Solicitudes por aprobar', pend.length ? pend.map(s => '<div class="fila vis acc-fila">' + datos(s) + '<div class="acc-bot"><button class="btn negro chico" data-dec="' + s.id + '|aprobada">Aprobar</button><button class="btn chico" data-dec="' + s.id + '|rechazada">Rechazar</button></div></div>').join('') : '<p class="sub">No hay solicitudes nuevas.</p>')
      + sec(2, 'Link de acceso directo', '<p class="nota">Para alguien en especial (un arquitecto, un cliente). Con abrir el link entra directo al 3D, sin pedir acceso. Lo puedes desactivar cuando quieras.</p>'
        + '<div class="acc-nuevo"><input id="acc-n" maxlength="80" placeholder="Para quién · Ej. Arq. Laura Méndez"><button class="btn negro" id="acc-crear">Generar link</button></div><div id="acc-res"></div>'
        + (acc.length ? acc.map(a => '<div class="fila vis acc-fila' + (a.activo ? '' : ' apagado') + '"><div><b>' + esc(a.nombre) + '</b><small>' + esc((a.activo ? 'Activo' : 'Desactivado') + ' · creado ' + cuando(a.creado) + (a.por ? ' por ' + a.por : '')) + '</small></div>'
          + '<div class="acc-bot"><button class="btn chico" data-copiar="' + a.token + '">Copiar link</button><a class="btn chico" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Hola, este es tu acceso al diseñador 3D de DKAS: ' + LINK_ACC(a.token)) + '">Mandar por WhatsApp</a>'
          + '<button class="btn chico" data-acc="' + a.token + '|' + (a.activo ? 0 : 1) + '">' + (a.activo ? 'Desactivar' : 'Activar') + '</button></div></div>').join('') : ''))
      + sec(3, 'Historial', resto.length ? resto.map(s => '<div class="fila vis acc-fila"><div><b>' + quien(s) + ' <i class="est-acc ' + s.estado + '">' + (s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada') + '</i></b><small>' + esc([s.despacho, s.tel, (s.estado === 'aprobada' ? 'aprobó ' : 'rechazó ') + (s.por || '') + ' ' + (s.decidido ? cuando(s.decidido) : '')].filter(Boolean).join(' · ')) + '</small></div>'
        + '<div class="acc-bot">' + (s.estado === 'aprobada' ? avisar(s) + '<button class="btn chico" data-dec="' + s.id + '|rechazada">Quitar acceso</button>' : '<button class="btn chico" data-dec="' + s.id + '|aprobada">Aprobar</button>') + '</div></div>').join('') : '<p class="sub">Todavía nada.</p>');
    main.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      try {
        if (b.dataset.dec) { const [id, est] = b.dataset.dec.split('|'); b.disabled = true; await A.decidirSolicitud(id, est); toast(est === 'aprobada' ? 'Aprobada: ya puede entrar al 3D' : 'Listo: sin acceso'); contarSolicitudes(true); return accesos(); }
        if (b.dataset.acc) { const [t, v] = b.dataset.acc.split('|'); b.disabled = true; await A.cambiarAcceso(t, v === '1'); toast(v === '1' ? 'Link activado' : 'Link desactivado'); return accesos(); }
        if (b.dataset.copiar) { await copiar(LINK_ACC(b.dataset.copiar)); return toast('Link copiado'); }
        if (b.id === 'acc-crear') {
          b.disabled = true; const nombre = $('#acc-n').value.trim() || 'Sin nombre', t = await A.crearAcceso(nombre), url = LINK_ACC(t);
          await accesos(); await copiar(url).catch(() => {});
          $('#acc-res').innerHTML = '<p class="ok-c">Link para <b>' + esc(nombre) + '</b> (ya está copiado):<br><a href="' + url + '" target="_blank" rel="noopener">' + url + '</a></p>';
        }
      } catch (x) { alerta(x.message); b.disabled = false; }
    };
  }
  async function copiar(t) { try { await navigator.clipboard.writeText(t); } catch (e) { const i = document.createElement('textarea'); i.value = t; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); } }

  // ---------- precios, herreros y días de fabricación ----------
  function precios() {
    const k = cfg.costos || {};
    main.innerHTML = '<h1>Precios</h1><p class="sub">Se usan en todos los pedidos. Cada pedido los puede cambiar.</p><div class="sec"><div class="grid2">'
      + '<label>Costo aproximado por mesa (con flete y base)<input id="caprox" inputmode="decimal" value="' + esc(cfg.aprox != null ? cfg.aprox : D.CFG.aprox) + '"></label>'
      + '<label>Ganancia mínima (%)<input id="cmin" inputmode="decimal" value="' + esc(cfg.minimo != null ? cfg.minimo : D.CFG.minimo) + '"></label>'
      + '<label>Días de fabricación (para la fecha de entrega)<input id="cdias" inputmode="numeric" value="' + esc(dias()) + '"></label></div>'
      + '<h3>Herreros</h3><p class="nota">Uno por renglón. Salen para elegir en cada pedido.</p><textarea id="cherr" rows="4" placeholder="Don Juan&#10;Herrería López">' + esc((cfg.herreros || []).join('\n')) + '</textarea>'
      + '<h3>Costos de siempre (opcional)</h3><p class="nota">Si un costo casi no cambia (por ejemplo el flete), ponlo aquí y ya sale en cada pedido.</p><div class="grid2">'
      + D.COSTOS.map(([id, t]) => '<label>' + t + '<input data-c="' + id + '" inputmode="decimal" value="' + esc(k[id] != null ? k[id] : '') + '"></label>').join('')
      + '</div><button class="btn negro grande" id="cguardar">Guardar</button></div>';
    $('#cguardar').onclick = async () => {
      const costos = {}; $$('[data-c]').forEach(i => { const v = num(i.value); if (v !== '') costos[i.dataset.c] = v; });
      const n = Object.assign({}, cfg, { aprox: num($('#caprox').value) || D.CFG.aprox, minimo: num($('#cmin').value) === '' ? D.CFG.minimo : num($('#cmin').value), dias: num($('#cdias').value) || DIAS });
      const hs = $('#cherr').value.split('\n').map(s => s.trim()).filter(Boolean); if (hs.length) n.herreros = hs; else delete n.herreros;
      if (Object.keys(costos).length) n.costos = costos; else delete n.costos; delete n.actualizado;
      try { await A.guardarConfig(n); cfg = n; toast('Guardado'); } catch (e) { alerta(e.message); }
    };
  }

  // ---------- utilidades ----------
  async function compartir(files, texto, tel) {
    try { if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, text: texto }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    // en compu: se descargan las imágenes y se abre el chat con el texto
    files.forEach(f => bajar(f, f.name));
    window.open('https://wa.me/' + (tel || '') + '?text=' + encodeURIComponent(texto), '_blank');
    toast('Se descargaron las imágenes: adjúntalas en el chat');
  }
  function bajar(blob, nombre) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 3000); }
  function alerta(t) { toast('⚠ ' + t); }
  $('#salir').onclick = e => { e.preventDefault(); A.logout(); try { localStorage.removeItem('dazk-cache'); } catch (x) {} location.hash = ''; arrancar(); };
  window.addEventListener('beforeunload', e => { const g = $('#gbar'); if (g && !g.hidden) { e.preventDefault(); e.returnValue = ''; } });
  arrancar();
})();

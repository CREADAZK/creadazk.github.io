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
  const deCodigo = s => { const p = String(s || '').split('.'); return p.length === 6 || p.length === 7 ? { uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5], H: +p[6] || 0 } : null; };
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
  const colorDe = p => ficha(p).color || COLORES[0];
  // base: una de las nuestras, u "otra" que se escribe a mano (los cortes se calculan con la nuestra como referencia)
  const baseDe = p => ficha(p).baseOtra || D.BASES[mesaDe(p).base].nombre;
  const conBase = (p, b) => /^base\b/i.test(baseDe(p)) ? baseDe(p) : (b || 'Base') + ' ' + baseDe(p);
  const resumenP = p => D.resumen(mesaDe(p)).map(r => r[0] === 'Base' ? ['Base', baseDe(p) + (ficha(p).baseOtra ? ' (otra)' : '')] : r);
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
    await recargar(); ruta();
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
  }

  // ---------- rutas: # (pedidos y logística) · #taller · #p=id · #t=id · #precios · #nuevo ----------
  function ruta() {
    const h = location.hash, sec = /^#(taller|t=)/.test(h) ? 'taller' : h === '#precios' ? 'precios' : h === '#bases' ? 'bases' : h === '#visitas' ? 'visitas' : 'log';
    if (h !== '#bases' && window.DKAS_DISENA) DKAS_DISENA.salir();
    $$('#top-nav a[data-sec]').forEach(a => a.classList.toggle('on', a.dataset.sec === sec));
    if (h === '#precios') return precios();
    if (h === '#visitas') return visitas();
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
    const resumen = '<ul class="res">' + resumenP(p).concat([['Color de base', colorDe(p)], ['Modelo', modeloDe(p).txt]]).map(([k, v]) => '<li><span>' + k + '</span><b>' + esc(v) + '</b></li>').join('') + (x.n > 1 ? '<li><span>Cantidad</span><b>' + x.n + ' mesas</b></li>' : '') + '</ul>';
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
    return saludo + (nombre ? ', ' + nombre : '') + '. 👋 Soy Zury, de *DKAS · Piedra Sinterizada*.\n\n'
      + 'Vi la mesa que diseñaste (folio #' + p.folio + '). ¡Muchas gracias por escribirnos!\n\n'
      + 'Me gustaría platicar contigo para entender bien lo que buscas y prepararte la mejor propuesta. ¿Cuándo lo platicamos? Cuando tú quieras, quedo pendiente.\n\n'
      + 'Zury · DKAS';
  }
  async function bienvenida(p, modo) {
    const txt = textoBienvenida(p);
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
    return Promise.resolve(visor.mostrar(m)).then(() => visor.foto(1200, 800)).catch(() => null);
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
    const filas = resumenP(p).filter(r => r[0] !== 'Uso').concat([['Color base', colorDe(p)], ['Modelo', modeloDe(p).nuestro ? modeloDe(p).nombre + ' (catálogo)' : (f.modelo === 'otro' ? (f.modeloOtro || 'Personalizado') : 'Personalizado')], ['MDF', m.forma === 'round' ? 'Ø ' + c.mdf.L + ' cm' : c.mdf.L + ' × ' + c.mdf.W + ' cm'], ['Base (medida)', c.base.L + ' × ' + c.base.W + ' × ' + c.base.H + ' cm']]).concat(x.n > 1 ? [['Cantidad', x.n + ' mesas']] : []);
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
    l.forEach(x => { const k = x.v || x.t; const a = per[k] = per[k] || { nombre: '', veces: 0, primera: x.t, ult: 0, disp: x.disp, origen: x.origen, max: 0, folio: 0 };
      a.veces++; a.primera = Math.min(a.primera, x.t); a.ult = Math.max(a.ult, x.ult || x.t); if (x.nombre) a.nombre = x.nombre; a.max = Math.max(a.max, x.paso || 0); if (x.folio) a.folio = x.folio; });
    const gente = Object.values(per).sort((a, b) => b.ult - a.ult), hoy = new Date().toDateString();
    const PASO = ['Vio la página', 'Abrió el 3D', 'Armó su mesa', 'Mandó su diseño'];
    const cuando = t => { const d = new Date(t); return d.toDateString() === hoy ? 'hoy ' + d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : A.fecha(t); };
    main.innerHTML = '<h1>Visitas</h1><p class="sub">Quién ha entrado a dkas.mx. Al entrar se les pide su nombre y la página los recuerda.</p>'
      + '<div class="resumen-g"><div><b>' + gente.length + '</b><span>personas</span></div><div><b>' + gente.filter(g => new Date(g.ult).toDateString() === hoy).length + '</b><span>hoy</span></div><div><b>' + gente.filter(g => g.max >= 3).length + '</b><span>mandaron diseño</span></div></div>'
      + '<div class="sec">' + (gente.length ? gente.map(g => '<div class="fila vis"><div><b>' + esc(g.nombre || 'Sin nombre') + '</b><small>' + esc([g.disp, g.origen].filter(Boolean).join(' · ')) + '</small></div>'
        + '<div><span>' + PASO[Math.min(3, g.max)] + (g.folio ? ' · pedido #' + g.folio : '') + '</span><small>' + g.veces + (g.veces === 1 ? ' visita' : ' visitas') + ' · última ' + cuando(g.ult) + '</small></div></div>').join('') : '<p class="sub">Todavía nadie.</p>') + '</div>';
  }

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

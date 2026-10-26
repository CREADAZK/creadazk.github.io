/* DKAS · panel del taller. Pocas pantallas: Pedidos → un pedido en 6 pasos (mesa, croquis, medidas, precio, cotización, pagos) y Mis precios.
   Todo lo calcula DKAS (dkas-data.js); aquí solo se captura lo que cuesta, lo que se pactó y lo que se cobró. */
(function () {
  const D = window.DKAS, A = window.DAZK_API, CQ = window.DKAS_CQ, WA = window.DKAS_WA, SITE = 'https://creadazk.github.io/';
  const $ = s => document.querySelector(s), esc = A.esc, main = $('#m');
  const $$ = s => [...document.querySelectorAll(s)];
  const pesos = n => '$' + Math.round(+n || 0).toLocaleString('es-MX');
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isNaN(n) ? '' : n; };
  const hoy = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }; // fecha local, no UTC
  const ESTADOS = A.ESTADOS.map(e => e[0]);
  let me = null, todos = [], cfg = {}, filtro = 'activos', busca = '';

  // ---------- la mesa de un pedido ----------
  const deCodigo = s => { const p = String(s || '').split('.'); return p.length === 6 ? { uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5] } : null; };
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
  const cantidad = p => ((p.items || []).find(x => x.tipo === 'mesa') || {}).cantidad || 1;
  const pagado = p => (p.pagos || []).reduce((a, x) => a + (+x.monto || 0), 0);
  function numeros(p) {
    const f = ficha(p), k = D.costear(f.lin, cfg), n = cantidad(p), costo = k.costo * n;
    const pactado = +f.pactado || (p.cotizacion && +p.cotizacion.total) || 0, minimo = cfg.minimo != null ? +cfg.minimo : D.CFG.minimo;
    return { k, n, costo, pactado, minimo, sugerido: D.sugerido(costo, minimo), g: D.ganancia(pactado, costo, minimo), pagado: pagado(p) };
  }
  function sigue(p) {
    const x = numeros(p), anticipo = Math.ceil(x.pactado / 2);
    return { nuevo: x.pactado ? 'Mandar la cotización al cliente' : 'Revisar la mesa y poner el precio',
      cotizado: 'Esperar que acepte y cobrar anticipo (50%)',
      confirmado: x.pagado >= anticipo && anticipo ? 'Mandar a fabricar' : 'Cobrar anticipo de ' + pesos(anticipo - x.pagado),
      fabricacion: 'Terminar y avisar que está lista', listo: x.pagado < x.pactado ? 'Entregar y cobrar saldo de ' + pesos(x.pactado - x.pagado) : 'Entregar',
      entregado: 'Terminado', cancelado: 'Cancelado' }[p.estado] || '';
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
  }

  // ---------- rutas ----------
  function ruta() {
    const h = location.hash;
    $$('#top-nav a:not(#salir)').forEach(a => a.classList.toggle('on', (a.getAttribute('href') === '#precios') === (h === '#precios')));
    if (h === '#precios') return precios();
    if (h === '#nuevo') return nuevo();
    const id = (h.match(/p=([\w-]+)/) || [])[1];
    if (id) { const p = todos.find(x => x.id === id); if (p) return pedido(p); }
    lista();
  }
  window.addEventListener('hashchange', () => { if (me && me.nombre) { ruta(); scrollTo(0, 0); } });

  // ---------- lista ----------
  function lista() {
    const act = p => !['entregado', 'cancelado'].includes(p.estado);
    const ver = todos.filter(p => filtro === 'todos' || (filtro === 'activos' ? act(p) : p.estado === 'entregado'))
      .filter(p => !busca || (p.nombre + ' ' + p.folio + ' ' + (p.tel || '') + ' ' + JSON.stringify(p.items)).toLowerCase().includes(busca.toLowerCase()));
    main.innerHTML = '<div class="cab"><h1>Pedidos</h1><a class="btn negro" href="#nuevo">+ Nuevo pedido</a></div>'
      + '<div class="filtros">' + [['activos', 'Activos'], ['entregado', 'Entregados'], ['todos', 'Todos']].map(([k, t]) => '<button class="pill' + (filtro === k ? ' sel' : '') + '" data-f="' + k + '">' + t + '</button>').join('')
      + '<input id="busca" placeholder="Buscar nombre o folio" value="' + esc(busca) + '"></div>'
      + (ver.length ? '<div class="lista">' + ver.map(p => {
        const x = numeros(p), m = mesaDe(p);
        return '<a class="fila" href="#p=' + p.id + '"><img data-foto="' + p.token + '" alt=""><div><b>#' + p.folio + ' · ' + esc(p.nombre) + '</b><span>' + esc(D.titulo(m)) + '</span>'
          + '<em class="sigue">Sigue: ' + esc(sigue(p)) + '</em></div><div class="der"><span class="est e-' + p.estado + '">' + A.estado(p.estado) + '</span>'
          + (x.pactado ? '<b>' + pesos(x.pactado) + '</b><small class="' + (x.g.ok ? 'bien' : 'mal') + '">' + x.g.pct + '% ganancia</small>' : '<small class="mal">sin precio</small>') + '</div></a>';
      }).join('') + '</div>' : '<p class="vacio">No hay pedidos aquí.</p>');
    $$('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; lista(); });
    const bi = $('#busca'); bi.oninput = () => { busca = bi.value; clearTimeout(lista.t); lista.t = setTimeout(() => { lista(); const n = $('#busca'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
    fotos();
  }
  const fcache = {};
  function fotos() {
    $$('img[data-foto]').forEach(async im => {
      const t = im.dataset.foto;
      if (!(t in fcache)) fcache[t] = A.verFoto(t).catch(() => null);
      const u = await fcache[t]; if (u) im.src = u; else im.classList.add('sin');
    });
  }

  // ---------- un pedido ----------
  function pedido(p) {
    const m = mesaDe(p), c = D.calcular(m), x = numeros(p), f = ficha(p), tel = p.tel ? A.waNum(p.tel) : '';
    const sec = (n, t, html, cls) => '<section class="sec ' + (cls || '') + '"><h2><span>' + n + '</span>' + t + '</h2>' + html + '</section>';
    const opts = (o, v) => Object.entries(o).map(([k, t]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
    const lim = D.limites(m.uso, m.forma, m.L), red = D.redonda(m.forma);
    main.innerHTML = '<a class="volver" href="#">← Pedidos</a>'
      + '<div class="cab"><div><h1>#' + p.folio + ' · ' + esc(p.nombre) + '</h1><p class="sub">' + A.fecha(p.creado) + (p.canal ? ' · llegó por ' + esc(p.canal) : '') + (p.tel ? ' · ' + esc(p.tel) : '') + '</p></div>'
      + '<div class="acc">' + (tel ? '<a class="btn verde" target="_blank" rel="noopener" href="https://wa.me/' + tel + '">WhatsApp</a>' : '')
      + '<select id="estado">' + ESTADOS.map(e => '<option value="' + e + '"' + (e === p.estado ? ' selected' : '') + '>' + A.estado(e) + '</option>').join('') + '</select></div></div>'
      + '<div class="banner">Sigue: <b>' + esc(sigue(p)) + '</b></div>'
      + (p.notas ? '<p class="nota-cli">“' + esc(p.notas) + '”</p>' : '')
      // 1 · la mesa
      + sec(1, 'La mesa del cliente', '<div class="mesa"><img id="foto"' + (f.m ? '' : ' data-foto="' + p.token + '"') + ' alt="Diseño del cliente"><div><p class="tit">' + esc(D.titulo(m)) + '</p><ul class="res">'
        + D.resumen(m).map(([k, v]) => '<li><span>' + k + '</span><b>' + esc(v) + '</b></li>').join('') + (x.n > 1 ? '<li><span>Cantidad</span><b>' + x.n + ' mesas</b></li>' : '') + '</ul>'
        + '<details class="cambiar"' + (f.m ? ' open' : '') + '><summary>Cambiar la mesa</summary><div class="grid2">'
        + '<label>Uso<select data-m="uso">' + opts(Object.fromEntries(Object.entries(D.USOS).map(([k, u]) => [k, u.nombre])), m.uso) + '</select></label>'
        + '<label>Forma<select data-m="forma">' + opts(Object.fromEntries(D.formasDe(m.uso).map(k => [k, D.FORMAS[k]])), m.forma) + '</select></label>'
        + '<label>' + (red ? (m.forma === 'round' ? 'Diámetro' : 'Lado') : 'Largo') + ' (' + lim.L.join('–') + ')<input type="number" step="5" data-m="L" value="' + m.L + '"></label>'
        + (red ? '' : '<label>Ancho (' + lim.W.join('–') + ')<input type="number" step="5" data-m="W" value="' + m.W + '"></label>')
        + '<label>Base<select data-m="base">' + opts(Object.fromEntries(D.basesPara(m).map(k => [k, D.BASES[k].nombre])), m.base) + '</select></label>'
        + '<label>Piedra<select data-m="piedra">' + opts(Object.fromEntries(D.PIEDRAS.map(q => [q.id, q.nombre])), m.piedra) + '</select></label>'
        + '</div><p class="nota">El sistema no deja poner medidas que no se pueden hacer. Toca Guardar abajo para que se quede.</p></details></div></div>')
      // 2 · croquis
      + sec(2, 'Croquis', '<div class="croquis" id="croquis">' + CQ.svg(m, { folio: p.folio, cliente: p.nombre }) + '</div><div class="botones"><button class="btn" id="cq-bajar">Descargar croquis</button><button class="btn verde" id="cq-wa">Mandar croquis por WhatsApp</button></div>', 'ancho')
      // 3 · medidas
      + sec(3, 'Medidas para el taller', '<div class="kpis">'
        + kpi('Piedra', D.medida(m), c.piedra.m2 + ' m² · ' + c.piedra.aprov + '% de la placa')
        + kpi('MDF negro', m.forma === 'round' ? 'Ø ' + c.mdf.L + ' cm' : c.mdf.L + ' × ' + c.mdf.W + ' cm', '12 mm' + (c.mdf.r ? ' · esquinas r ' + c.mdf.r : ''))
        + kpi('Base ' + D.BASES[m.base].nombre, c.base.L + ' × ' + c.base.W + ' cm', 'altura ' + c.base.H + ' cm' + (m.base === 'ped' ? ' · plato Ø ' + c.base.plato : ''))
        + kpi('Volado', m.forma === 'round' ? c.volado.L + ' cm' : c.volado.L + ' / ' + c.volado.W + ' cm', 'cabeceras / lados')
        + kpi('Personas', c.personas || '—', '70 cm por persona') + kpi('PTR', c.metros + ' m', c.piedra.peso + ' kg de piedra') + '</div>'
        + (c.avisos.length ? '<ul class="avisos">' + c.avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '')
        + '<table class="cortes"><tr><th>Pieza</th><th>Cant.</th><th>Medida</th><th>Material</th></tr>' + c.cortes.map(z => '<tr><td>' + esc(z.pieza) + '</td><td>' + z.cant + '</td><td>' + z.med + ' cm</td><td>' + esc(z.mat) + '</td></tr>').join('') + '</table>')
      // 4 · precio
      + sec(4, 'Precio y ganancia', '<div class="precio"><div class="costos"><p class="nota">Lo que nos cuesta hacer <b>una</b> mesa. Si no sabes un costo, déjalo vacío: se usa el aproximado.</p>'
        + '<label class="lin"><span>Costo aproximado <small>(piedra + base + flete)</small></span><input data-lin="aprox" inputmode="decimal" placeholder="' + (cfg.aprox || D.CFG.aprox) + '" value="' + esc(f.lin && f.lin.aprox != null ? f.lin.aprox : '') + '"></label>'
        + '<p class="o">o captura los costos reales:</p>'
        + D.COSTOS.map(([k, t]) => '<label class="lin"><span>' + t + '</span><input data-lin="' + k + '" inputmode="decimal" placeholder="' + esc(cfg.costos && cfg.costos[k] ? cfg.costos[k] : '—') + '" value="' + esc(f.lin && f.lin[k] != null ? f.lin[k] : '') + '"></label>').join('')
        + '</div><div class="calc" id="calc"></div></div>')
      // 5 · cotización
      + sec(5, 'Cotización al cliente', '<div id="coti"></div>')
      // 6 · pagos
      + sec(6, 'Pagos', '<div id="pagos"></div>')
      + '<div class="guardar" id="gbar" hidden><span>Tienes cambios sin guardar</span><button class="btn negro" id="guardar">Guardar</button></div>';
    fotos();
    pintarPrecio(p); pintarCoti(p); pintarPagos(p);
    // cambios en la mesa: se recalcula todo al momento
    $$('[data-m]').forEach(el => el.onchange = () => {
      const nm = D.normalizar(Object.assign({}, m, { [el.dataset.m]: el.type === 'number' ? +el.value : el.value }));
      p.fichas = Object.assign({}, p.fichas, { dkas: Object.assign({}, ficha(p), { m: { uso: nm.uso, forma: nm.forma, L: nm.L, W: nm.W, base: nm.base, piedra: nm.piedra } }) });
      const y = scrollY; pedido(p); scrollTo(0, y); $('#gbar').hidden = false;
    });
    $$('[data-lin],#pactado').forEach(el => el.oninput = () => leerPrecio(p));
    $('#estado').onchange = async e => { try { await A.staffEstado(p.id, e.target.value); p.estado = e.target.value; toast('Estado: ' + A.estado(p.estado)); pedido(p); } catch (x) { alerta(x.message); } };
    $('#guardar').onclick = () => guardar(p);
    $('#cq-bajar').onclick = async () => bajar(await CQ.png(m, { folio: p.folio, cliente: p.nombre }), 'croquis-' + p.folio + '.jpg');
    $('#cq-wa').onclick = async () => compartir([new File([await CQ.png(m, { folio: p.folio, cliente: p.nombre })], 'croquis-' + p.folio + '.jpg', { type: 'image/jpeg' })], 'Croquis de tu mesa DKAS (pedido #' + p.folio + '): ' + D.titulo(m), tel);
    if (f.m) fotoNueva(p); // la mesa se cambió en el taller: la foto se dibuja de nuevo
  }
  const kpi = (t, v, s) => '<div class="kpi"><span>' + t + '</span><b>' + esc(v) + '</b><small>' + esc(s) + '</small></div>';
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

  function leerPrecio(p) {
    const f = Object.assign({}, ficha(p)), lin = {};
    $$('[data-lin]').forEach(i => { const v = num(i.value); if (v !== '') lin[i.dataset.lin] = v; });
    f.lin = lin; const pa = $('#pactado'); if (pa) f.pactado = num(pa.value) || '';
    p.fichas = Object.assign({}, p.fichas, { dkas: f }); $('#gbar').hidden = false;
    pintarPrecio(p, true); pintarCoti(p);
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
    el.innerHTML = (c ? '<p class="ok-c">Enviada el ' + A.fecha(c.enviada) + ' por ' + pesos(c.total) + (c.aceptada ? ' · <b>el cliente la aceptó</b>' : ' · esperando respuesta') + '</p>' : '')
      + (x.pactado ? '<div class="cifras"><div><span>Total</span><b>' + pesos(x.pactado) + '</b></div><div><span>Anticipo 50%</span><b>' + pesos(anticipo) + '</b><small>para empezar a fabricar</small></div><div><span>Saldo al entregar</span><b>' + pesos(x.pactado - anticipo) + '</b></div></div>'
        + (x.g.ok ? '' : '<p class="aviso-rojo">Ojo: la ganancia es de ' + x.g.pct + '%, menos del ' + x.minimo + '%. Puedes mandarla igual.</p>')
        + '<div class="botones"><button class="btn negro" id="mandar">' + (c ? 'Mandar de nuevo' : 'Mandar cotización') + ' por WhatsApp</button><button class="btn" id="cimg">Descargar imagen</button></div>'
        : '<p class="nota">Pon el precio pactado en el paso 4 para armar la cotización.</p>');
    if (!x.pactado) return;
    $('#cimg').onclick = async () => bajar(await imagenCoti(p), 'cotizacion-' + p.folio + '.jpg');
    $('#mandar').onclick = async () => {
      const b = $('#mandar'); b.disabled = true;
      try {
        if (!$('#gbar').hidden) await guardar(p);
        const cot = { total: x.pactado, anticipo, mesa: [m.uso, m.forma, m.L, m.W, m.base, m.piedra].join('.'), items: [{ titulo: D.titulo(m), cantidad: x.n, precio: Math.round(x.pactado / x.n) }],
          detalle: D.resumen(m).map(([k, v]) => k + ': ' + v).join(' · '), condiciones: 'Anticipo del 50% para empezar a fabricar; el saldo se paga al entregar.' };
        await A.enviarCotizacion(p.id, cot); p.cotizacion = Object.assign({}, cot, { enviada: Date.now() }); if (p.estado === 'nuevo') p.estado = 'cotizado';
        const tel = p.tel ? A.waNum(p.tel) : '';
        const txt = 'Hola ' + p.nombre.split(' ')[0] + ', te mando la cotización de tu mesa DKAS (pedido #' + p.folio + '):\n• ' + D.titulo(m) + '\n• Piedra ' + D.piedra(m.piedra).nombre + ' · base ' + D.BASES[m.base].nombre
          + (x.n > 1 ? '\n• ' + x.n + ' mesas' : '') + '\nTotal: ' + pesos(x.pactado) + '\nAnticipo para empezar: ' + pesos(anticipo) + '\nAquí la ves y la aceptas: ' + SITE + 'pedido.html#t=' + p.token;
        const files = [new File([await imagenCoti(p)], 'cotizacion-' + p.folio + '.jpg', { type: 'image/jpeg' }), new File([await CQ.png(m, { folio: p.folio, cliente: p.nombre })], 'croquis-' + p.folio + '.jpg', { type: 'image/jpeg' })];
        pedido(p); await compartir(files, txt, tel); // primero se ve como cotizado; luego se abre WhatsApp
      } catch (e) { alerta(e.message); }
      if ($('#mandar')) $('#mandar').disabled = false;
    };
  }
  // imagen de la cotización (1080 × 1350): logo, foto de la mesa, datos y precio
  async function imagenCoti(p) {
    const x = numeros(p), m = mesaDe(p), cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const g = cv.getContext('2d');
    const img = src => new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1080, 1350);
    const logo = await img('img/dkas-oscuro.png'); if (logo) g.drawImage(logo, 70, 60, logo.width * 70 / logo.height, 70);
    g.fillStyle = '#6e6962'; g.font = '600 26px Inter,Arial'; g.textAlign = 'right'; g.fillText('COTIZACIÓN · PEDIDO #' + p.folio, 1010, 108); g.textAlign = 'left';
    const f = (ficha(p).m ? await foto3d(m) : null) || (await A.verFoto(p.token).catch(() => null)) || await foto3d(m);
    const fi = await img(f); if (fi) { g.save(); g.beginPath(); g.roundRect ? g.roundRect(70, 170, 940, 627, 24) : g.rect(70, 170, 940, 627); g.clip(); g.drawImage(fi, 70, 170, 940, 627); g.restore(); }
    g.fillStyle = '#1a1917'; g.font = '500 44px "Cormorant Garamond",Georgia,serif'; g.fillText('Para ' + p.nombre, 70, 875);
    g.font = '400 27px Inter,Arial'; g.fillStyle = '#1a1917';
    const filas = D.resumen(m).concat(x.n > 1 ? [['Cantidad', x.n + ' mesas']] : []);
    filas.forEach(([k, v], i) => { const y = 935 + Math.floor(i / 2) * 44, xx = i % 2 ? 560 : 70; g.fillStyle = '#6e6962'; g.fillText(k, xx, y); g.fillStyle = '#1a1917'; g.fillText(String(v), xx + 140, y); });
    g.fillStyle = '#f6f4f0'; g.fillRect(70, 1110, 940, 160);
    g.fillStyle = '#6e6962'; g.font = '600 24px Inter,Arial'; g.fillText('TOTAL', 110, 1160); g.fillText('ANTICIPO 50%', 600, 1160);
    g.fillStyle = '#1a1917'; g.font = '700 56px Inter,Arial'; g.fillText(pesos(x.pactado), 110, 1230); g.fillText(pesos(Math.ceil(x.pactado / 2)), 600, 1230);
    g.fillStyle = '#6e6962'; g.font = '400 22px Inter,Arial'; g.fillText('WhatsApp ' + WA.map(w => w.label).join(' · ') + '  ·  creadazk.github.io', 70, 1315);
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.9));
  }

  // ---------- pagos ----------
  function pintarPagos(p) {
    const x = numeros(p), el = $('#pagos'), saldo = x.pactado - x.pagado;
    el.innerHTML = '<div class="cifras"><div><span>Cobrado</span><b>' + pesos(x.pagado) + '</b></div><div><span>Falta</span><b class="' + (saldo > 0 ? 'mal' : 'bien') + '">' + pesos(Math.max(0, saldo)) + '</b></div></div>'
      + ((p.pagos || []).length ? '<ul class="pagos">' + p.pagos.map(q => '<li><span>' + A.dia(q.fecha) + ' · ' + esc(q.metodo || '') + '</span><b>' + pesos(q.monto) + '</b><button class="lnk" data-borra="' + q.id + '">quitar</button></li>').join('') + '</ul>' : '')
      + '<div class="nuevo-pago"><input id="pmonto" inputmode="decimal" placeholder="' + (saldo > 0 ? (x.pagado ? saldo : Math.ceil(x.pactado / 2) || 'Monto') : 'Monto') + '"><select id="pmet"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option></select><input id="pfecha" type="date" value="' + hoy() + '"><button class="btn negro" id="pagar">Registrar pago</button></div>';
    $('#pagar').onclick = async () => {
      const monto = num($('#pmonto').value) || num($('#pmonto').placeholder); if (!monto) return alerta('Escribe el monto.');
      try { await A.agregarPago(p.id, { monto, metodo: $('#pmet').value, fecha: $('#pfecha').value || hoy(), nota: '' }); await recargar(); toast('Pago registrado'); pedido(todos.find(q => q.id === p.id)); } catch (e) { alerta(e.message); }
    };
    $$('[data-borra]').forEach(b => b.onclick = async () => { if (!confirm('¿Quitar este pago?')) return; const q = p.pagos.find(z => z.id === b.dataset.borra); try { await A.borrarPago(p.id, q.id, q); await recargar(); pedido(todos.find(z => z.id === p.id)); } catch (e) { alerta(e.message); } });
  }

  // ---------- nuevo pedido (capturado en el taller) ----------
  function nuevo() {
    let m = D.normalizar({ uso: 'comedor', forma: 'rect', L: 210, W: 100 });
    const pinta = () => {
      const lim = D.limites(m.uso, m.forma, m.L), red = D.redonda(m.forma);
      const opts = (o, v) => Object.entries(o).map(([k, t]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
      main.innerHTML = '<a class="volver" href="#">← Pedidos</a><h1>Nuevo pedido</h1><div class="sec"><div class="grid2">'
        + '<label>Nombre del cliente<input id="nnom" value="' + esc(nuevo.nom || '') + '"></label><label>WhatsApp<input id="ntel" inputmode="tel" value="' + esc(nuevo.tel || '') + '"></label>'
        + '<label>Uso<select data-n="uso">' + opts(Object.fromEntries(Object.entries(D.USOS).map(([k, u]) => [k, u.nombre])), m.uso) + '</select></label>'
        + '<label>Forma<select data-n="forma">' + opts(Object.fromEntries(D.formasDe(m.uso).map(k => [k, D.FORMAS[k]])), m.forma) + '</select></label>'
        + '<label>' + (red ? 'Medida' : 'Largo') + ' (' + lim.L.join('–') + ')<input type="number" step="5" data-n="L" value="' + m.L + '"></label>'
        + (red ? '' : '<label>Ancho (' + lim.W.join('–') + ')<input type="number" step="5" data-n="W" value="' + m.W + '"></label>')
        + '<label>Base<select data-n="base">' + opts(Object.fromEntries(D.basesPara(m).map(k => [k, D.BASES[k].nombre])), m.base) + '</select></label>'
        + '<label>Piedra<select data-n="piedra">' + opts(Object.fromEntries(D.PIEDRAS.map(q => [q.id, q.nombre])), m.piedra) + '</select></label>'
        + '<label>Cantidad<input type="number" id="ncant" min="1" max="20" value="' + (nuevo.cant || 1) + '"></label></div>'
        + '<p class="tit">' + esc(D.titulo(m)) + (D.personas(m) ? ' · ' + D.personas(m) + ' personas' : '') + '</p>'
        + '<button class="btn negro grande" id="crear">Crear pedido</button></div>';
      const keep = () => { nuevo.nom = $('#nnom').value; nuevo.tel = $('#ntel').value; nuevo.cant = $('#ncant').value; };
      $$('[data-n]').forEach(el => el.onchange = () => { keep(); m = D.normalizar(Object.assign({}, m, { [el.dataset.n]: el.type === 'number' ? +el.value : el.value })); pinta(); });
      $('#crear').onclick = async () => {
        keep(); const b = $('#crear'); b.disabled = true;
        try {
          const cod = [m.uso, m.forma, m.L, m.W, m.base, m.piedra].join('.');
          const r = await A.crearPedido({ nombre: nuevo.nom, tel: nuevo.tel, items: [{ tipo: 'mesa', titulo: D.titulo(m), cantidad: Math.max(1, +nuevo.cant || 1), uso: m.uso, specs: D.resumen(m).concat([['Código', cod]]), link: SITE + '#d=' + cod }] }, true);
          const f = await foto3d(m); if (f) { try { await A.guardarFoto(r.token, await chica(f), true); } catch (e) {} }
          nuevo.nom = nuevo.tel = ''; nuevo.cant = 1; await recargar(); const p = todos.find(q => q.token === r.token);
          location.hash = p ? '#p=' + p.id : '';
        } catch (e) { alerta(e.message); b.disabled = false; }
      };
    };
    pinta();
  }
  function chica(url) { return new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 1000; c.height = Math.round(1000 * im.height / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.8)); }; im.src = url; }); }

  // ---------- mis precios ----------
  function precios() {
    const k = cfg.costos || {};
    main.innerHTML = '<h1>Mis precios</h1><p class="sub">Se usan en todos los pedidos. Cada pedido los puede cambiar.</p><div class="sec"><div class="grid2">'
      + '<label>Costo aproximado por mesa (con flete y base)<input id="caprox" inputmode="decimal" value="' + esc(cfg.aprox != null ? cfg.aprox : D.CFG.aprox) + '"></label>'
      + '<label>Ganancia mínima (%)<input id="cmin" inputmode="decimal" value="' + esc(cfg.minimo != null ? cfg.minimo : D.CFG.minimo) + '"></label></div>'
      + '<h3>Costos de siempre (opcional)</h3><p class="nota">Si un costo casi no cambia (por ejemplo el flete), ponlo aquí y ya sale en cada pedido.</p><div class="grid2">'
      + D.COSTOS.map(([id, t]) => '<label>' + t + '<input data-c="' + id + '" inputmode="decimal" value="' + esc(k[id] != null ? k[id] : '') + '"></label>').join('')
      + '</div><button class="btn negro grande" id="cguardar">Guardar</button></div>';
    $('#cguardar').onclick = async () => {
      const costos = {}; $$('[data-c]').forEach(i => { const v = num(i.value); if (v !== '') costos[i.dataset.c] = v; });
      const n = Object.assign({}, cfg, { aprox: num($('#caprox').value) || D.CFG.aprox, minimo: num($('#cmin').value) === '' ? D.CFG.minimo : num($('#cmin').value) });
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

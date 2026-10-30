/* DKAS · Crea tu mesa: el cliente arma su mesa en 6 pasos y solo puede elegir mesas que el taller sí hace. */
(function () {
  const D = window.DKAS, A = window.DAZK_API, WA = window.DKAS_WA, SITE = 'https://dkas.mx/';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const PASOS = ['Mesa', 'Tamaño', 'Piedra', 'Base', 'Enviar'];
  // título de cada paso al estilo del catálogo: número, etiqueta y la palabra clave en dorado
  const tit = (i, et, h) => '<div class="tt"><span class="num">0' + (i + 1) + '</span><p class="et">' + et + '</p><h2>' + h + '</h2></div>';

  // de dónde llegó (para saber qué canal vende)
  try {
    const c = new URLSearchParams(location.search).get('c'), ref = document.referrer ? new URL(document.referrer).hostname : '';
    if (!A.load('dazk-canal', '')) A.save('dazk-canal', A.canal(c || (!ref || ref === location.hostname ? 'directo' : ref)) || 'directo');
  } catch (e) {}

  const codigo = m => [m.uso, m.forma, m.L, m.W, m.base, m.piedra].concat(m.H !== D.USOS[m.uso].H ? [m.H] : []).join('.');
  function deCodigo(s) { const p = String(s || '').split('.'); return p.length === 6 || p.length === 7 ? { uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5], H: +p[6] || 0 } : null; }
  const esp = m => { const e = D.espacio(m); return e.L + ' × ' + e.W + ' cm'; };

  let st = D.normalizar(Object.assign({ uso: 'comedor', forma: 'rect', base: 'patas', piedra: 'statuario' }, D.tamanoPara('comedor', 'rect', 8)));
  let paso = 0, enviado = null;
  const enlace = (location.hash.match(/d=([a-z0-9.\-]+)/) || [])[1];
  if (enlace && deCodigo(enlace)) { st = D.normalizar(deCodigo(enlace)); paso = 4; }

  const V = DKAS3D.crear($('#v3d'), { tex: Math.min(innerWidth, innerHeight) < 900 ? 'tex/piedras/1k/' : 'tex/piedras/', fondo: 0xe7e1d7 });

  function set(cambios, saltar) {
    const prev = st;
    // otro uso u otro modelo: vuelve a la altura estándar de ese uso
    if ((cambios.uso && cambios.uso !== st.uso || cambios.modelo) && !cambios.H) cambios = Object.assign({}, cambios, { H: D.USOS[cambios.uso || st.uso].H });
    st = D.normalizar(Object.assign({}, st, cambios));
    if (!cambios.modelo && st.modelo && (prev.L !== st.L || prev.W !== st.W || prev.H !== st.H || prev.forma !== st.forma || prev.base !== st.base || prev.uso !== st.uso)) delete st.modelo;
    V.mostrar(st); pintar();
    if (saltar != null) ir(saltar);
  }

  // ---------- íconos ----------
  const svgForma = f => {
    const s = { rect: '<rect x="6" y="16" width="52" height="32" rx="1.5"/>', ovcuad: '<rect x="6" y="16" width="52" height="32" rx="12"/>', oval: '<ellipse cx="32" cy="32" rx="27" ry="16"/>',
      square: '<rect x="14" y="14" width="36" height="36" rx="1.5"/>', round: '<circle cx="32" cy="32" r="19"/>' }[f];
    return '<svg viewBox="0 0 64 64" class="ico">' + s + '</svg>';
  };
  const svgUso = u => '<svg viewBox="0 0 64 64" class="ico">' + {
    comedor: '<rect x="8" y="22" width="48" height="4" rx="1"/><path d="M14 26v22M50 26v22"/><path d="M4 34h8v14M60 34h-8v14" class="f"/>',
    centro: '<rect x="10" y="34" width="44" height="4" rx="1"/><path d="M16 38v10M48 38v10"/>',
    periquera: '<rect x="18" y="14" width="28" height="4" rx="1"/><path d="M32 18v30M24 50h16"/><path d="M8 30h6v20M56 30h-6v20" class="f"/>' }[u] + '</svg>';

  // ---------- pasos ----------
  function pintar() {
    const n = D.personas(st);
    vivo();
    $('#pasos').innerHTML = PASOS.map((p, i) => '<button data-ir="' + i + '" class="' + (i === paso ? 'on' : i < paso ? 'hecho' : '') + '"><span>0' + (i + 1) + '</span>' + p + (i === 4 && lista.length && !enviado ? ' <i class="cuenta-l">' + (lista.length + 1) + '</i>' : '') + '</button>').join('');
    // 1 · la mesa: uso, forma y modelos listos
    $('#p0').innerHTML = (lista.length && !enviado ? '<p class="aviso-l">Diseñando la mesa ' + (lista.length + 1) + ' de tu pedido · <button data-ir="4">Ver mi pedido (' + piezas(lista) + (piezas(lista) === 1 ? ' mesa' : ' mesas') + ')</button></p>' : '') + tit(0, 'Tu mesa', '¿Qué mesa <em>buscas?</em>') + '<div class="seg">' + Object.keys(D.USOS).map(u =>
      '<button class="' + (st.uso === u ? 'sel' : '') + '" data-uso="' + u + '">' + svgUso(u) + '<b>' + D.USOS[u].nombre + '</b><small>' + D.USO_DESC[u] + '</small></button>').join('') + '</div>'
      + '<h3>Forma</h3><div class="cards">' + D.formasDe(st.uso).map(f =>
        '<button class="card' + (st.forma === f ? ' sel' : '') + '" data-forma="' + f + '">' + svgForma(f) + '<b>' + D.FORMAS[f] + '</b><small>' + D.FORMA_DESC[f] + '</small></button>').join('') + '</div>'
      + '<h3>O elige un modelo listo</h3><div class="modelos">' + D.MODELOS.filter(m => m.uso === st.uso).map(m =>
        '<button class="modelo' + (st.modelo === m.id ? ' sel' : '') + '" data-modelo="' + m.id + '"><img src="img/modelos/' + m.id + '.jpg" alt="" loading="lazy"><b>' + m.nombre + '</b><small>' + esc(D.medida(m)) + ' · ' + D.BASES[m.base].nombre + '</small></button>').join('') + '</div>';
    // 2 · tamaño: la medida exacta que el cliente escriba, sin topes; el sistema le dice qué tan fácil es de hacer
    const red = D.redonda(st.forma), lim = D.limites(st.uso, st.forma, Math.min(st.L, D.USOS[st.uso].formas[st.forma].L[1])), ops = D.opcionesPersonas(st.uso, st.forma);
    $('#p1').innerHTML = tit(1, 'Tamaño', 'Pon tu <em>medida.</em>')
      + '<p class="sub">Escribe la medida exacta en centímetros. No hay límites: si algo es difícil de fabricar te lo marcamos y aun así la puedes cotizar.</p>'
      + (ops.length ? '<div class="pers"><span>Rápido, para</span>' + ops.filter(x => x % 2 === 0 || ops.length < 6).map(x => '<button data-pers="' + x + '" class="' + (x === n ? 'sel' : '') + '">' + x + '</button>').join('') + '<span>personas</span></div>' : '')
      + '<div class="dims">'
      + campo('L', red ? (st.forma === 'round' ? 'Diámetro' : 'Lado') : 'Largo', st.L, 'Usual ' + lim.L.join('–'))
      + (red ? '' : campo('W', 'Ancho', st.W, 'Usual ' + lim.W.join('–')))
      + campo('H', 'Altura', st.H, 'Estándar ' + D.USOS[st.uso].H)
      + '</div><div id="viab"></div><div id="tec"></div>';
    vivo();
    // 4 · piedra
    $('#p2').innerHTML = tit(2, 'La piedra', 'Elige tu <em>piedra.</em>') + '<p class="sub">Fotos reales de cada placa. Así se verá tu mesa.</p><div class="piedras">' + D.PIEDRAS.map(p =>
      '<button class="piedra' + (st.piedra === p.id ? ' sel' : '') + '" data-piedra="' + p.id + '"><img src="img/piedras/' + p.id + '.jpg" alt="" loading="lazy"><b>' + p.nombre + '</b><small>' + p.desc + (p.acabado ? ' · ' + p.acabado.toLowerCase() : '') + '</small></button>').join('') + '</div><p class="nota">Todas en placa de 320 × 160 cm y 12 mm de grosor.</p>';
    // 5 · base
    $('#p3').innerHTML = tit(3, 'El acero', 'Elige la <em>base.</em>') + '<p class="sub">Solo te mostramos las bases que funcionan con tu mesa.</p><div class="bases">' + D.basesPara(st).map(b =>
      '<button class="base' + (st.base === b ? ' sel' : '') + '" data-base="' + b + '"><img src="' + (D.BASES[b].foto || 'img/bases/' + b + '.jpg') + '" alt="" loading="lazy"><b>' + D.BASES[b].nombre + '</b><small>' + D.BASES[b].desc + '</small></button>').join('') + '</div>';
    // 5 · enviar
    if (!enviado) { $('#p5res').innerHTML = D.resumen(st).filter(r => r[0] !== 'Fabricación').map(([k, v]) => '<li><span>' + k + '</span><b>' + esc(v) + '</b></li>').join(''); vivo(); pintarLista(); }
    $('#atras').disabled = paso === 0; $('#sig').hidden = paso === PASOS.length - 1; $('#cuenta').textContent = (paso + 1) + ' / ' + PASOS.length;
    $('#sig').textContent = paso === 3 ? 'Ver mi mesa' : 'Siguiente';
  }
  function campo(k, label, v, nota) {
    return '<div class="dim"><label for="d-' + k + '">' + label + '</label><div class="ctl"><button type="button" data-paso="' + k + '" data-d="-5" aria-label="Menos">−</button>'
      + '<input id="d-' + k + '" data-dim="' + k + '" type="number" inputmode="numeric" min="1" step="1" value="' + v + '"><em>cm</em>'
      + '<button type="button" data-paso="' + k + '" data-d="5" aria-label="Más">+</button></div><small>' + nota + '</small></div>';
  }
  // lo que cambia en vivo mientras escribe (sin volver a pintar los campos, para no perder el cursor)
  function vivo() {
    const n = D.personas(st), c = D.calcular(st), v = c.viab;
    $('#chip').innerHTML = '<i class="sem n' + v.nivel + '"></i><b>' + esc(D.medida(st)) + '</b>' + (st.H !== D.USOS[st.uso].H ? ' · h ' + st.H : '') + (n ? ' · ' + n + ' personas' : '') + ' · ' + esc(D.piedra(st.piedra).nombre);
    $$('[data-pers]').forEach(b => b.classList.toggle('sel', +b.dataset.pers === n));
    const vb = $('#viab'); if (vb) vb.innerHTML = semaforo(v);
    const tc = $('#tec'); if (tc) tc.innerHTML = tecnica(c);
    const v5 = $('#p5viab'); if (v5) v5.innerHTML = semaforo(v, true);
  }
  function semaforo(v, corto) {
    return '<div class="viab n' + v.nivel + '"><div class="vb-top"><div class="metro"><i></i><i></i><i></i></div><div><p class="et">Factibilidad</p><b>' + v.t + '</b></div></div>'
      + (corto ? '' : '<p>' + v.d + '</p>' + (v.pts.length ? '<ul>' + v.pts.map(p => '<li class="n' + p.n + '">' + esc(p.txt) + '</li>').join('') + '</ul>' : ''))
      + '<p class="cot">✓ La puedes cotizar tal cual' + (v.nivel ? '; te confirmamos los detalles en la cotización.' : '.') + '</p></div>';
  }
  function tecnica(c) {
    const v = c.viab, n = c.personas;
    return '<div class="fic">' + [['Superficie', v.m2 + ' m²'], ['Peso de la piedra', '≈ ' + v.peso + ' kg'], ['Placas', v.placas > 1 ? v.placas + ' piezas · ' + v.uniones + (v.uniones === 1 ? ' unión' : ' uniones') : '1 · sin uniones'],
      ['Espacio libre', esp(st)], ['Cubierta', '2.5 cm · piedra 12 mm'], [n ? 'Personas' : 'Altura', n ? n + ' · 70 cm c/u' : st.H + ' cm']].map(([k, x]) => '<div><span>' + k + '</span><b>' + x + '</b></div>').join('') + '</div>'
      + '<button type="button" class="lnk-g" data-ficha>Descargar ficha técnica y plano <span>→</span></button>';
  }
  function ir(i) {
    paso = Math.max(0, Math.min(PASOS.length - 1, i));
    if (paso >= 3 && window.DKAS_VISITA) DKAS_VISITA(2); // para el panel: ya armó su mesa
    $$('.paso').forEach((p, k) => { p.hidden = k !== paso; });
    if (paso === 4 && !enviado) setTimeout(foto, 60);
    pintar(); if (ir.listo) { const y = $('#app').getBoundingClientRect().top + scrollY - 62; if (Math.abs(scrollY - y) > 4 && (innerWidth < 980 || scrollY < y)) scrollTo({ top: y, behavior: 'smooth' }); }
    ir.listo = true;
  }
  function foto() { const l = V.listo(); (l || Promise.resolve()).then(() => { $('#p5img').src = V.foto(1200, 800); pintarLista(); }); }

  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ir) return ir(+b.dataset.ir);
    if (b.dataset.uso) { const f = D.formasDe(b.dataset.uso).includes(st.forma) ? st.forma : D.formasDe(b.dataset.uso)[0], ops = D.opcionesPersonas(b.dataset.uso, f);
      return set(Object.assign({ uso: b.dataset.uso, forma: f }, ops.length ? D.tamanoPara(b.dataset.uso, f, ops[Math.floor(ops.length / 2)]) : { L: Math.round((D.USOS[b.dataset.uso].formas[f].L[0] + D.USOS[b.dataset.uso].formas[f].L[1]) / 20) * 10, W: null })); }
    if (b.dataset.modelo) { const m = D.MODELOS.find(x => x.id === b.dataset.modelo); return set(Object.assign({}, m, { modelo: m.id }), 2); }
    if (b.dataset.forma) { const n = D.personas(st), t = n && D.tamanoPara(st.uso, b.dataset.forma, n); return set(Object.assign({ forma: b.dataset.forma }, t || { L: st.L, W: null })); }
    if (b.dataset.pers) return set(D.tamanoPara(st.uso, st.forma, +b.dataset.pers));
    if (b.dataset.piedra) return set({ piedra: b.dataset.piedra });
    if (b.dataset.base) return set({ base: b.dataset.base });
    if (b.dataset.paso) { const k = b.dataset.paso, c = { [k]: st[k] + +b.dataset.d }; if (k === 'L' && D.redonda(st.forma)) c.W = c.L; set(c); return; }
    if (b.dataset.ficha != null) return ficha();
    if (b.dataset.vista) { $$('[data-vista]').forEach(x => x.classList.toggle('on', x === b)); return V.vista(b.dataset.vista); }
  });
  // medidas escritas: en vivo mientras escribe; al salir del campo se acomoda (largo y ancho al revés, números imposibles)
  function medidaEscrita(el, final) {
    const k = el.dataset.dim, x = parseFloat(el.value); if (!k || !(x > 0)) return;
    const c = { [k]: Math.round(x) }; if (k === 'L' && D.redonda(st.forma)) c.W = c.L;
    const antes = [st.L, st.W, st.H].join();
    st = D.normalizar(Object.assign({}, st, c)); delete st.modelo; V.mostrar(st); vivo();
    if (final && (st[k] !== Math.round(x) || [st.L, st.W, st.H].join() !== antes)) pintar();
  }
  document.addEventListener('input', e => { if (!e.target.dataset.dim) return; clearTimeout(medidaEscrita.t); medidaEscrita.t = setTimeout(() => medidaEscrita(e.target), 450); });
  document.addEventListener('change', e => { if (!e.target.dataset.dim) return; clearTimeout(medidaEscrita.t); medidaEscrita(e.target, true); });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.dim) e.target.blur(); });
  $('#atras').addEventListener('click', () => ir(paso - 1));
  $('#sig').addEventListener('click', () => ir(paso + 1));
  $('#sillas').addEventListener('change', e => V.sillas(e.target.checked));
  $('#cotas').addEventListener('change', e => V.cotas(e.target.checked));

  // ---------- la lista del pedido: varias mesas, cada una con su cantidad, en un solo envío ----------
  // cada diseño entra al taller como su propio pedido (su croquis, su herrero, su cotización), marcado como parte del mismo pedido conjunto
  let lista = A.load('dkas-lista', []).filter(x => x && x.m && D.USOS[x.m.uso]), cantAct = 1, enviados = null;
  const guardaLista = () => A.save('dkas-lista', lista);
  const todas = () => lista.concat([{ m: st, cant: cantAct, img: $('#p5img').getAttribute('src'), actual: true }]);
  const piezas = t => t.reduce((a, x) => a + x.cant, 0);
  const altura = m => m.H !== D.USOS[m.uso].H ? ' · altura ' + m.H + ' cm' : '';
  function pintarLista() {
    const t = todas(), n = piezas(t), box = $('#lista'); if (!box) return;
    box.innerHTML = '<div class="lista-cab"><p class="et">Tu pedido</p><b>' + n + (n === 1 ? ' mesa' : ' mesas') + (t.length > 1 ? ' · ' + t.length + ' diseños' : '') + '</b></div>'
      + t.map((x, i) => { const v = D.viabilidad(x.m);
        return '<div class="it' + (x.actual ? ' act' : '') + '">' + (x.img ? '<img src="' + x.img + '" alt="">' : '<span class="ph"></span>')
          + '<div class="tx"><b>' + esc(D.titulo(x.m)) + '</b><small><i class="sem n' + v.nivel + '"></i>' + esc(D.piedra(x.m.piedra).nombre) + ' · ' + esc(D.BASES[x.m.base].nombre) + esc(altura(x.m)) + '</small>'
          + (x.actual ? '<small class="ed">La que estás viendo</small>' : '<span class="acc-l"><button type="button" data-editar="' + i + '">Editar</button><button type="button" data-quitar="' + i + '">Quitar</button></span>') + '</div>'
          + '<label class="q"><span>Cant.</span><input type="number" inputmode="numeric" min="1" max="99" value="' + x.cant + '" data-cant="' + (x.actual ? 'a' : i) + '"></label></div>'; }).join('')
      + (t.length < 12 ? '<button type="button" class="btn agregar" id="agregar">+ Agregar otra mesa al pedido</button><p class="nota">Arma cada mesa distinta (comedor, periqueras, centro…) y ponle cuántas son. Todo se manda junto.</p>' : '<p class="nota">Máximo 12 diseños por envío.</p>');
  }
  async function agregar() {
    const img = await chica(V.foto(1200, 800), 640);
    lista.push({ m: st, cant: cantAct, img }); cantAct = 1; guardaLista();
    ir(0);
  }
  async function editar(i) {
    // la mesa en pantalla se guarda en su lugar y la elegida pasa al configurador
    const x = lista[i], img = await chica(V.foto(1200, 800), 640);
    lista[i] = { m: st, cant: cantAct, img }; guardaLista();
    st = D.normalizar(x.m); cantAct = x.cant; V.mostrar(st); ir(1);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'agregar') agregar();
    else if (b.dataset.editar) editar(+b.dataset.editar);
    else if (b.dataset.quitar) { lista.splice(+b.dataset.quitar, 1); guardaLista(); pintarLista(); pintar(); }
  });
  document.addEventListener('change', e => {
    const k = e.target.dataset.cant; if (k == null) return;
    const v = Math.max(1, Math.min(99, Math.round(+e.target.value || 1))); e.target.value = v;
    if (k === 'a') cantAct = v; else if (lista[+k]) { lista[+k].cant = v; guardaLista(); }
    pintarLista();
  });

  // ---------- mensaje de WhatsApp: una mesa o el pedido completo ----------
  function mensaje() {
    const t = enviados || todas(), proyecto = $('#proyecto').value.trim();
    const linea = x => { const v = D.viabilidad(x.m), n = D.personas(x.m);
      return (x.cant > 1 ? x.cant + ' × ' : '') + D.titulo(x.m) + altura(x.m) + '\n   Piedra ' + D.piedra(x.m.piedra).nombre + ' · base ' + D.BASES[x.m.base].nombre + (n ? ' · ' + n + ' personas' : '') + ' · ' + v.t
        + (x.folio ? '\n   Pedido #' + x.folio + ': ' + SITE + 'pedido.html#t=' + x.token : '\n   Ver diseño: ' + SITE + '#d=' + codigo(x.m)); };
    if (t.length === 1) return 'Hola DKAS, diseñé mi mesa' + (t[0].folio ? ' (pedido #' + t[0].folio + ')' : '') + (proyecto ? ' para ' + proyecto : '') + ':\n• ' + linea(t[0]);
    return 'Hola DKAS, les mando mi pedido' + (proyecto ? ' para ' + proyecto : '') + ': ' + piezas(t) + ' mesas en ' + t.length + ' diseños.\n' + t.map((x, i) => '\n' + (i + 1) + '. ' + linea(x)).join('');
  }
  const waLink = (num, txt) => 'https://wa.me/' + num + '?text=' + encodeURIComponent(txt);
  $$('[data-wa]').forEach(a => a.addEventListener('click', () => { a.href = waLink(WA[+a.dataset.wa].num, mensaje()); }));

  // ---------- enviar el pedido ----------
  function chica(url, w0) {
    // la foto que se guarda: JPEG de máximo ~280 KB
    return new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); let w = w0 || 1000; for (let q = 0.84; ; q -= 0.08) { c.width = w; c.height = Math.round(w * im.height / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); const u = c.toDataURL('image/jpeg', q); if (u.length < 380000 || q < 0.5) return ok(u); w = 800; } }; im.src = url; });
  }
  $('#form').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#enviar'), err = $('#err'); err.hidden = true; b.disabled = true; b.textContent = 'Enviando…';
    const t = todas(), hechos = [], proyecto = $('#proyecto').value.trim().slice(0, 80);
    try {
      // datos del despacho u obra (opcionales) viajan en la ficha de cada pedido
      const extra = [['Despacho / empresa', $('#despacho').value], ['Proyecto', $('#proyecto').value], ['Correo', $('#correo').value]].map(([k, v]) => [k, v.trim().slice(0, 120)]).filter(x => x[1]);
      for (let i = 0; i < t.length; i++) {
        const x = t[i], cod = codigo(x.m);
        if (t.length > 1) b.textContent = 'Enviando ' + (i + 1) + ' de ' + t.length + '…';
        const conj = t.length > 1 ? [['Pedido conjunto', 'Diseño ' + (i + 1) + ' de ' + t.length + ' · ' + piezas(t) + ' mesas' + (proyecto ? ' · ' + proyecto : '')]] : [];
        const it = { tipo: 'mesa', titulo: D.titulo(x.m), cantidad: x.cant, uso: x.m.uso, specs: D.resumen(x.m).concat(extra, conj, [['Código', cod]]), link: SITE + '#d=' + cod };
        const r = await A.crearPedido({ nombre: $('#nombre').value, tel: $('#tel').value, notas: $('#notas').value, items: [it], canal: A.load('dazk-canal', '') });
        const img = x.actual ? await chica($('#p5img').src || V.foto(1200, 800)) : x.img;
        try { if (img) await A.guardarFoto(r.token, img); } catch (y) { console.warn('foto', y); }
        A.save('dazk-pedidos', [{ folio: r.folio, token: r.token, fecha: new Date().toISOString() }].concat(A.load('dazk-pedidos', [])));
        hechos.push(Object.assign({ img, m: x.m, cant: x.cant }, r));
        if (!x.actual) { lista = lista.filter(z => z !== x); guardaLista(); }
      }
      A.save('dazk-yo', Object.assign(A.load('dazk-yo', {}), { nombre: $('#nombre').value.trim(), tel: $('#tel').value.trim(), correo: $('#correo').value.trim(), despacho: $('#despacho').value.trim() }));
      enviados = hechos; enviado = hechos[0]; lista = []; guardaLista();
      if (window.DKAS_VISITA) DKAS_VISITA(3, enviado.folio);
      $('#form').hidden = true; $('#lista').hidden = true; $('#listo').hidden = false;
      $('#folio').textContent = hechos.map(h => '#' + h.folio).join(' · ');
      $('#seguir').href = hechos.length === 1 ? A.seguimiento(enviado.token) : 'pedido.html'; $('#seguir').textContent = hechos.length === 1 ? 'Ver mi pedido' : 'Ver mis pedidos';
    } catch (x) {
      err.textContent = x.message + (hechos.length ? ' Ya se enviaron ' + hechos.length + ' de ' + t.length + ' (folio ' + hechos.map(h => '#' + h.folio).join(', ') + '); toca Enviar otra vez para mandar las que faltan.' : '');
      err.hidden = false; pintarLista();
    }
    b.disabled = false; b.textContent = 'Enviar y cotizar';
  });
  // compartir las fotos de las mesas por WhatsApp (en celular manda las imágenes; en compu abre el chat con el texto)
  $('#mandar').addEventListener('click', async () => {
    const txt = mensaje();
    try {
      const fs = await Promise.all(enviados.filter(h => h.img).map(async h => new File([await (await fetch(h.img)).blob()], 'mesa-dkas-' + h.folio + '.jpg', { type: 'image/jpeg' })));
      if (fs.length && navigator.canShare && navigator.canShare({ files: fs })) { await navigator.share({ files: fs, text: txt }); return; }
    } catch (x) { if (x && x.name === 'AbortError') return; }
    location.href = waLink(WA[0].num, txt);
  });
  const y = A.load('dazk-yo', {}); ['nombre', 'tel', 'correo', 'despacho'].forEach(k => { if (y[k]) $('#' + k).value = y[k]; });
  const mis = A.load('dazk-pedidos', []); if (mis.length) { const a = $('#mis'); a.hidden = false; a.href = mis.length === 1 ? A.seguimiento(mis[0].token) : 'pedido.html'; }

  // ---------- ficha técnica: render con medidas, datos, factibilidad y plano; se imprime o se guarda como PDF ----------
  function ficha() {
    const c = D.calcular(st), v = c.viab, hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    let box = $('#ficha-print'); if (!box) { box = document.createElement('div'); box.id = 'ficha-print'; document.body.appendChild(box); }
    const filas = D.resumen(st).filter(r => r[0] !== 'Fabricación').concat([['Superficie', v.m2 + ' m²'], ['Peso de la piedra', '≈ ' + v.peso + ' kg'],
      ['Placas', v.placas > 1 ? v.placas + ' piezas (' + v.nL + ' × ' + v.nW + ') · ' + v.uniones + (v.uniones === 1 ? ' unión' : ' uniones') : '1 placa de 320 × 160 cm · sin uniones'],
      ['Cubierta', 'Piedra sinterizada 12 mm sobre MDF 12 mm · 2.5 cm'], ['Espacio libre recomendado', esp(st)], ['Código de diseño', codigo(st)]]);
    const pie = '<div class="pie"><span>dkas.mx</span>' + WA.map(w => '<span>WhatsApp ' + w.label + '</span>').join('') + '<span>' + hoy + '</span></div>';
    const render = V.foto(1800, 1000, true);
    box.innerHTML = '<section class="hoja"><div class="hd"><img src="img/dkas-oscuro.png" alt="DKAS"><div><p>Ficha técnica' + (enviado ? ' · Pedido #' + enviado.folio : '') + '</p><h1>' + esc(D.titulo(st)) + '</h1></div></div>'
      + '<img class="render" src="' + render + '" alt="">'
      + '<div class="cols"><table>' + filas.map(([k, x]) => '<tr><th>' + esc(k) + '</th><td>' + esc(x) + '</td></tr>').join('') + '</table>'
      + '<div class="fv n' + v.nivel + '"><p class="hk">Factibilidad</p><h2>' + v.t + '</h2><p>' + v.d + '</p>' + (v.pts.length ? '<ul>' + v.pts.map(p => '<li>' + esc(p.txt) + '</li>').join('') + '</ul>' : '')
      + '<p class="hk" style="margin-top:14px">Precio y fecha de entrega</p><p>Se confirman en la cotización formal.</p></div></div>' + pie + '</section>'
      + '<section class="hoja"><div class="hd"><img src="img/dkas-oscuro.png" alt="DKAS"><div><p>Plano · medidas en cm</p><h1>' + esc(D.titulo(st)) + '</h1></div></div>'
      + '<div class="plano"><img alt="Plano" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.DKAS_CQ.plano(st, { titulo: D.medida(st) + ' · h ' + st.H, fecha: hoy })) + '"></div>' + pie + '</section>';
    const im = box.querySelector('.render');
    const imprime = () => setTimeout(() => window.print(), 150);
    if (im.complete) imprime(); else im.onload = imprime;
  }

  // ---------- ver en tu espacio (realidad aumentada) ----------
  function carga(src, mod) { return new Promise((ok, bad) => { const s = document.createElement('script'); if (mod) s.type = 'module'; s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }); }
  let arUrl = null;
  $('#ar').addEventListener('click', () => {
    const m = $('#arm'), box = $('#ar-box'), msg = $('#ar-msg'); m.hidden = false; document.body.style.overflow = 'hidden';
    box.querySelectorAll('model-viewer,.ar-desk').forEach(x => x.remove()); msg.hidden = false; msg.textContent = 'Preparando tu mesa…'; $('#ar-tit').textContent = D.titulo(st);
    Promise.all([THREE.GLTFExporter ? 0 : carga('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js'),
      customElements.get('model-viewer') ? 0 : carga('https://unpkg.com/@google/model-viewer@3.4.0/dist/model-viewer.min.js', true)])
      .then(() => customElements.whenDefined('model-viewer')).then(() => V.listo()).then(() => V.glb()).then(glb => {
        if (arUrl) URL.revokeObjectURL(arUrl); arUrl = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
        const mv = document.createElement('model-viewer');
        [['src', arUrl], ['ar', ''], ['ar-modes', 'webxr quick-look scene-viewer'], ['ar-scale', 'fixed'], ['ar-placement', 'floor'], ['camera-controls', ''], ['touch-action', 'pan-y'],
          ['shadow-intensity', '1'], ['exposure', '1.1'], ['tone-mapping', 'aces'], ['camera-orbit', '35deg 70deg auto'], ['alt', 'Tu mesa DKAS en 3D']].forEach(a => mv.setAttribute(a[0], a[1]));
        const b = document.createElement('button'); b.slot = 'ar-button'; b.className = 'btn negro ar-go'; b.textContent = 'Ponerla en mi espacio'; mv.appendChild(b);
        mv.addEventListener('load', () => { msg.hidden = true; if (!mv.canActivateAR) { const d = document.createElement('p'); d.className = 'ar-desk'; d.textContent = 'Para verla en tu espacio abre esta página desde tu celular. Aquí puedes girarla.'; box.appendChild(d); } });
        box.appendChild(mv);
      }).catch(x => { console.warn('ar', x); msg.textContent = 'No se pudo preparar la vista. Revisa tu conexión e intenta de nuevo.'; });
  });
  $('#ar-x').addEventListener('click', () => { $('#arm').hidden = true; document.body.style.overflow = ''; });

  // el encabezado se vuelve sólido al bajar; la barra Atrás/Siguiente aparece en el configurador
  function alBajar() {
    $('#top').classList.toggle('solido', scrollY > 40);
    const r = $('#app').getBoundingClientRect(); $('#bar').classList.toggle('ver', r.top < innerHeight * 0.6 && r.bottom > innerHeight * 0.5);
  }
  addEventListener('scroll', alBajar, { passive: true }); addEventListener('resize', alBajar);
  if (enlace) setTimeout(() => $('#app').scrollIntoView(), 50);
  V.mostrar(st); ir(paso); alBajar();
  // bases nuevas que el taller diseñó y subió: aparecen solas en el paso de la base
  A.basesPublicas().then(bs => {
    Object.entries(bs || {}).forEach(([id, b]) => D.registrarBase(id, b));
    if (enlace && deCodigo(enlace)) st = D.normalizar(deCodigo(enlace));
    V.mostrar(st); pintar();
  }).catch(() => {});
  // la página principal manda aquí lo que el cliente eligió (un modelo, una piedra o una foto)
  window.DKAS_PONER = (cambios, p) => set(cambios || {}, p);
  window.DKAS_ST = () => st; window.DKAS_V = V; // pruebas y fotos de los modelos
})();

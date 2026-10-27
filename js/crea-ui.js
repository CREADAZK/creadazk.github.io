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

  const codigo = m => [m.uso, m.forma, m.L, m.W, m.base, m.piedra].join('.');
  function deCodigo(s) { const p = String(s || '').split('.'); return p.length === 6 ? { uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5] } : null; }

  let st = D.normalizar(Object.assign({ uso: 'comedor', forma: 'rect', base: 'patas', piedra: 'statuario' }, D.tamanoPara('comedor', 'rect', 8)));
  let paso = 0, enviado = null;
  const enlace = (location.hash.match(/d=([a-z0-9.\-]+)/) || [])[1];
  if (enlace && deCodigo(enlace)) { st = D.normalizar(deCodigo(enlace)); paso = 4; }

  const V = DKAS3D.crear($('#v3d'), { tex: Math.min(innerWidth, innerHeight) < 900 ? 'tex/piedras/1k/' : 'tex/piedras/', fondo: 0xe7e1d7 });

  function set(cambios, saltar) {
    const prev = st;
    st = D.normalizar(Object.assign({}, st, cambios));
    if (!cambios.modelo && st.modelo && (prev.L !== st.L || prev.W !== st.W || prev.forma !== st.forma || prev.base !== st.base || prev.uso !== st.uso)) delete st.modelo;
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
    $('#chip').innerHTML = '<b>' + esc(D.medida(st)) + '</b>' + (n ? ' · ' + n + ' personas' : '') + ' · ' + esc(D.piedra(st.piedra).nombre);
    $('#pasos').innerHTML = PASOS.map((p, i) => '<button data-ir="' + i + '" class="' + (i === paso ? 'on' : i < paso ? 'hecho' : '') + '"><span>0' + (i + 1) + '</span>' + p + '</button>').join('');
    // 1 · la mesa: uso, forma y modelos listos
    $('#p0').innerHTML = tit(0, 'Tu mesa', '¿Qué mesa <em>buscas?</em>') + '<div class="seg">' + Object.keys(D.USOS).map(u =>
      '<button class="' + (st.uso === u ? 'sel' : '') + '" data-uso="' + u + '">' + svgUso(u) + '<b>' + D.USOS[u].nombre + '</b><small>' + D.USO_DESC[u] + '</small></button>').join('') + '</div>'
      + '<h3>Forma</h3><div class="cards">' + D.formasDe(st.uso).map(f =>
        '<button class="card' + (st.forma === f ? ' sel' : '') + '" data-forma="' + f + '">' + svgForma(f) + '<b>' + D.FORMAS[f] + '</b><small>' + D.FORMA_DESC[f] + '</small></button>').join('') + '</div>'
      + '<h3>O elige un modelo listo</h3><div class="modelos">' + D.MODELOS.filter(m => m.uso === st.uso).map(m =>
        '<button class="modelo' + (st.modelo === m.id ? ' sel' : '') + '" data-modelo="' + m.id + '"><img src="img/modelos/' + m.id + '.jpg" alt="" loading="lazy"><b>' + m.nombre + '</b><small>' + esc(D.medida(m)) + ' · ' + D.BASES[m.base].nombre + '</small></button>').join('') + '</div>';
    // 3 · tamaño
    const red = D.redonda(st.forma), lim = D.limites(st.uso, st.forma, st.L);
    // el cliente mueve la medida y las personas se van sumando solas
    $('#p1').innerHTML = tit(1, 'Tamaño', 'Pon tu <em>medida.</em>')
      + (st.uso === 'centro' ? '' : '<div class="cupo"><b id="cupo-n">' + n + '</b><span>personas<small>Calculamos 70 cm por persona. Mueve la medida y se van sumando.</small></span></div>')
      + '<div class="medidas">'
      + rango('L', red ? (st.forma === 'round' ? 'Diámetro' : 'Lado') : 'Largo', lim.L, st.L)
      + (red ? '' : rango('W', 'Ancho', lim.W, st.W))
      + '<div class="total"><b id="total-m">' + esc(D.medida(st)) + '</b><span>Altura ' + st.H + ' cm</span></div>'
      + '<p class="nota">Medida máxima 320 × 160 cm: el tamaño de una placa completa de piedra.</p></div>';
    // 4 · piedra
    $('#p2').innerHTML = tit(2, 'La piedra', 'Elige tu <em>piedra.</em>') + '<p class="sub">Fotos reales de cada placa. Así se verá tu mesa.</p><div class="piedras">' + D.PIEDRAS.map(p =>
      '<button class="piedra' + (st.piedra === p.id ? ' sel' : '') + '" data-piedra="' + p.id + '"><img src="img/piedras/' + p.id + '.jpg" alt="" loading="lazy"><b>' + p.nombre + '</b><small>' + p.desc + '</small></button>').join('') + '</div>';
    // 5 · base
    $('#p3').innerHTML = tit(3, 'El acero', 'Elige la <em>base.</em>') + '<p class="sub">Solo te mostramos las bases que funcionan con tu mesa.</p><div class="bases">' + D.basesPara(st).map(b =>
      '<button class="base' + (st.base === b ? ' sel' : '') + '" data-base="' + b + '"><img src="img/bases/' + b + '.jpg" alt="" loading="lazy"><b>' + D.BASES[b].nombre + '</b><small>' + D.BASES[b].desc + '</small></button>').join('') + '</div>';
    // 5 · enviar
    if (!enviado) $('#p5res').innerHTML = D.resumen(st).map(([k, v]) => '<li><span>' + k + '</span><b>' + esc(v) + '</b></li>').join('');
    $('#atras').disabled = paso === 0; $('#sig').hidden = paso === PASOS.length - 1; $('#cuenta').textContent = (paso + 1) + ' / ' + PASOS.length;
    $('#sig').textContent = paso === 3 ? 'Ver mi mesa' : 'Siguiente';
  }
  function rango(k, label, [a, b], v) {
    return '<label class="rango"><span>' + label + '<b>' + v + ' cm</b></span><input type="range" min="' + a + '" max="' + b + '" step="5" value="' + v + '" data-rango="' + k + '"><i><em>' + a + '</em><em>' + b + '</em></i></label>';
  }
  function ir(i) {
    paso = Math.max(0, Math.min(PASOS.length - 1, i));
    $$('.paso').forEach((p, k) => { p.hidden = k !== paso; });
    if (paso === 4 && !enviado) setTimeout(foto, 60);
    pintar(); if (ir.listo) { const y = $('#app').getBoundingClientRect().top + scrollY - 62; if (Math.abs(scrollY - y) > 4 && (innerWidth < 980 || scrollY < y)) scrollTo({ top: y, behavior: 'smooth' }); }
    ir.listo = true;
  }
  function foto() { const l = V.listo(); (l || Promise.resolve()).then(() => { $('#p5img').src = V.foto(1200, 800); }); }

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
    if (b.dataset.vista) { $$('[data-vista]').forEach(x => x.classList.toggle('on', x === b)); return V.vista(b.dataset.vista); }
  });
  document.addEventListener('input', e => {
    const k = e.target.dataset.rango; if (!k) return;
    e.target.previousElementSibling.querySelector('b').textContent = e.target.value + ' cm';
    const c = { [k]: +e.target.value }; if (k === 'L' && D.redonda(st.forma)) c.W = +e.target.value;
    st = D.normalizar(Object.assign({}, st, c)); delete st.modelo; V.mostrar(st);
    const cn = $('#cupo-n'); if (cn) cn.textContent = D.personas(st); $('#total-m').textContent = D.medida(st);
    clearTimeout(ir.t); ir.t = setTimeout(pintar, 250);
  });
  $('#atras').addEventListener('click', () => ir(paso - 1));
  $('#sig').addEventListener('click', () => ir(paso + 1));
  $('#sillas').addEventListener('change', e => V.sillas(e.target.checked));

  // ---------- mensaje de WhatsApp ----------
  function mensaje(folio, token) {
    const n = D.personas(st);
    return 'Hola DKAS, diseñé mi mesa' + (folio ? ' (pedido #' + folio + ')' : '') + ':\n• ' + D.titulo(st) + '\n• Piedra ' + D.piedra(st.piedra).nombre + ' · base ' + D.BASES[st.base].nombre
      + (n ? '\n• ' + n + ' personas' : '') + '\nVer mi diseño: ' + SITE + '#d=' + codigo(st) + (token ? '\nMi pedido: ' + SITE + 'pedido.html#t=' + token : '');
  }
  const waLink = (num, txt) => 'https://wa.me/' + num + '?text=' + encodeURIComponent(txt);
  $$('[data-wa]').forEach(a => a.addEventListener('click', () => { a.href = waLink(WA[+a.dataset.wa].num, enviado ? mensaje(enviado.folio, enviado.token) : mensaje()); }));

  // ---------- enviar el pedido ----------
  function chica(url) {
    // la foto que se guarda: JPEG de máximo ~280 KB
    return new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); let w = 1000; for (let q = 0.84; ; q -= 0.08) { c.width = w; c.height = Math.round(w * im.height / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); const u = c.toDataURL('image/jpeg', q); if (u.length < 380000 || q < 0.5) return ok(u); w = 800; } }; im.src = url; });
  }
  $('#form').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#enviar'), err = $('#err'); err.hidden = true; b.disabled = true; b.textContent = 'Enviando…';
    try {
      const it = { tipo: 'mesa', titulo: D.titulo(st), cantidad: 1, uso: st.uso, specs: D.resumen(st).concat([['Código', codigo(st)]]), link: SITE + '#d=' + codigo(st) };
      const r = await A.crearPedido({ nombre: $('#nombre').value, tel: $('#tel').value, notas: $('#notas').value, items: [it], canal: A.load('dazk-canal', '') });
      const img = await chica($('#p5img').src || V.foto(1200, 800));
      try { await A.guardarFoto(r.token, img); } catch (x) { console.warn('foto', x); }
      A.save('dazk-yo', { nombre: $('#nombre').value.trim(), tel: $('#tel').value.trim() });
      A.save('dazk-pedidos', [{ folio: r.folio, token: r.token, fecha: new Date().toISOString() }].concat(A.load('dazk-pedidos', [])));
      enviado = Object.assign({ img }, r);
      $('#form').hidden = true; $('#listo').hidden = false;
      $('#folio').textContent = '#' + r.folio; $('#seguir').href = A.seguimiento(r.token);
    } catch (x) { err.textContent = x.message; err.hidden = false; }
    b.disabled = false; b.textContent = 'Enviar mi diseño';
  });
  // compartir la foto de la mesa por WhatsApp (en celular manda la imagen; en compu abre el chat con el texto)
  $('#mandar').addEventListener('click', async () => {
    const txt = mensaje(enviado.folio, enviado.token);
    try {
      const blob = await (await fetch(enviado.img)).blob(), f = new File([blob], 'mesa-dkas-' + enviado.folio + '.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: txt }); return; }
    } catch (x) { if (x && x.name === 'AbortError') return; }
    location.href = waLink(WA[0].num, txt);
  });
  const y = A.load('dazk-yo', {}); if (y.nombre) $('#nombre').value = y.nombre; if (y.tel) $('#tel').value = y.tel;
  const mis = A.load('dazk-pedidos', []); if (mis.length) { const a = $('#mis'); a.hidden = false; a.href = mis.length === 1 ? A.seguimiento(mis[0].token) : 'pedido.html'; }

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
  window.DKAS_ST = () => st; window.DKAS_V = V; // pruebas y fotos de los modelos
})();

/* DKAS · lo interactivo de la página: menú, portada, piedras, proyectos, visor y atajos al configurador */
(function () {
  const D = window.DKAS, A = window.DAZK_API;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  // manda al configurador con algo ya elegido
  // sin acceso al diseñador, lleva directo al formulario para pedirlo (con el nombre ya escrito si lo tenemos)
  // lo último que le interesó (el panel lo muestra en Visitas y lo usa en el WhatsApp de seguimiento)
  const paso2D = false; // el 3D queda como "Diseño avanzado" (sección #app); lo demás cotiza en 1 minuto
  function interesa(t) { if (!t) return; window.DKAS_INT = t; if (window.DKAS_VISITA) try { DKAS_VISITA(0); } catch (e) {} }
  function disenar(cambios, paso) {
    if (cambios && cambios.modelo && !paso2D) { location.href = 'cotiza.html?m=' + encodeURIComponent(cambios.modelo); return; }
    if (cambios && cambios.piedra && !cambios.uso && !paso2D) { location.href = 'cotiza.html?u=comedor&f=rect&p=' + encodeURIComponent(cambios.piedra); return; }
    if (cambios && (cambios.modelo || cambios.piedra)) interesa(cambios.modelo ? 'Modelo ' + ((D.MODELOS.find(m => m.id === cambios.modelo) || {}).nombre || cambios.modelo) : 'Piedra ' + D.piedra(cambios.piedra).nombre);
    try { if (window.DKAS_PONER) window.DKAS_PONER(cambios, paso); } catch (e) {}
    cerrarVisor();
    if (location.hash !== '#app') location.hash = '#app'; else scrollTo({ top: 0, behavior: 'smooth' });
    if (!document.body.classList.contains('con-acceso')) setTimeout(() => { const n = $('#acc-nom'), t = $('#acc-tel'), yo = A.load('dazk-yo', {});
      if (n && yo.nombre && (!n.value || yo.nombre.startsWith(n.value))) n.value = yo.nombre; if (t && yo.tel && !t.value) t.value = yo.tel; const f = n && !n.value ? n : t && !t.value ? t : null; if (f) f.focus({ preventScroll: true }); }, 400);
  }

  // "Crear mi mesa": abre el diseñador con esa piedra, base y forma; sin acceso, ahí mismo pide acceso y el admin lo aprueba
  function crearMia(x) {
    const qs = new URLSearchParams(Object.assign({}, x.u ? { u: x.u } : {}, x.f ? { f: x.f } : {}, x.p ? { p: x.p } : {}, x.b ? { b: x.b } : {}, x.t ? { t: x.t } : {}));
    if (x.u) { location.href = 'cotiza.html?' + qs; return; }
    const cambios = Object.assign({}, x.u ? { uso: x.u } : {}, x.f ? { forma: x.f } : {}, x.u && x.f ? D.tamanoPara(x.u, x.f, x.u === 'comedor' ? 8 : 4) : {}, x.p ? { piedra: x.p } : {}, x.b ? { base: x.b } : {});
    window.DKAS_QUIERE = 'Quiero una así: ' + (x.t || (x.p ? 'mesa en ' + D.piedra(x.p).nombre : 'mesa de la página')); interesa(DKAS_QUIERE);
    disenar(cambios, 1); repintaAcceso();
  }
  // el formulario de acceso se vuelve a pintar para decir qué mesa quiere (sin borrar lo que ya escribió)
  function repintaAcceso() { if (document.body.classList.contains('con-acceso')) return; const p = document.querySelector('#acceso .sub'); if (p && window.DKAS_QUIERE) p.textContent = 'Te gustó «' + DKAS_QUIERE.replace(/^Quiero una así: /, '') + '». Para diseñarla a tu medida déjanos tu nombre y tu WhatsApp. Te damos acceso y un asesor te acompaña con tu cotización.'; }
  // todos los "Quiero una así" y "Crear mi mesa" llevan al diseñador con esa mesa; sin acceso, primero la solicitud (nombre y WhatsApp)
  document.addEventListener('click', e => {
    const rf = e.target.closest('[data-rf]'); // filtros de la galería de la Revista
    if (rf) { const k = rf.dataset.rf; rf.parentNode.querySelectorAll('[data-rf]').forEach(x => x.classList.toggle('on', x === rf));
      document.querySelectorAll('.rev-g .rev-c').forEach(f => { f.hidden = k !== 'todas' && f.dataset.uso !== k; if (!f.hidden) f.classList.add('in'); }); return; }
    const c = e.target.closest('[data-crea]');
    if (c) { e.preventDefault(); e.stopPropagation(); return crearMia(JSON.parse(c.dataset.crea)); }
    const b = e.target.closest('[data-v]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const x = JSON.parse(b.dataset.v), caja = b.closest('article, figure, .sl'), h = caja && caja.querySelector('h3'), im = caja && caja.querySelector('img');
    quieroUna(Object.assign({}, x, { t: h ? h.textContent.trim() : '', img: im ? (im.currentSrc || im.src || '') : '' }));
  }, true);

  // ---------- "Quiero una así": lo único público además de la presentación; nombre + WhatsApp y llega al panel como pedido ----------
  function quieroUna(x) {
    let mo = $('#qa');
    if (!mo) { mo = document.createElement('div'); mo.className = 'modal'; mo.id = 'qa'; document.body.appendChild(mo); }
    const esc = A.esc, yo = A.load('dazk-yo', {}), pz = x.p ? D.piedra(x.p).nombre : '', bs = x.b && D.BASES[x.b] ? D.BASES[x.b].nombre : '';
    const tit = x.t || (pz ? 'Mesa en ' + pz : 'Mesa DKAS');
    mo.innerHTML = '<div class="caja qa-c"><header><b>Quiero una así</b><button class="btn chico" data-qx>Cerrar</button></header><div class="qa-b">'
      + (x.img ? '<img class="qa-img" src="' + esc(x.img) + '" alt="">' : '')
      + '<p class="qa-t">' + esc(tit) + '</p><p class="qa-s">' + esc([pz && 'Piedra ' + pz, bs && 'Base ' + bs].filter(Boolean).join(' · ')) + '</p>'
      + '<form id="qa-f"><div class="f2"><label>Tu nombre<input id="qa-n" required minlength="2" maxlength="80" autocomplete="name" value="' + esc(yo.nombre || '') + '"></label>'
      + '<label>Tu WhatsApp<input id="qa-w" required inputmode="tel" maxlength="16" autocomplete="tel" placeholder="10 dígitos" value="' + esc(yo.tel || '') + '"></label></div>'
      + '<p class="err" id="qa-e" hidden></p><button class="btn oro form-btn" id="qa-ok">Quiero que me contacten</button></form></div></div>';
    mo.hidden = false; document.body.style.overflow = 'hidden';
    const cerrar = () => { mo.hidden = true; document.body.style.overflow = ''; };
    mo.onclick = e => { if (e.target === mo || e.target.closest('[data-qx]')) cerrar(); };
    interesa('Quiero una así: ' + tit);
    $('#qa-f').onsubmit = async e => {
      e.preventDefault(); const bt = $('#qa-ok'), er = $('#qa-e'); er.hidden = true;
      const nombre = $('#qa-n').value.trim(), tel = $('#qa-w').value.replace(/\D/g, '');
      if (nombre.length < 2) { er.textContent = 'Escribe tu nombre.'; er.hidden = false; return; }
      if (tel.length < 10 || tel.length > 13) { er.textContent = 'Escribe tu WhatsApp a 10 dígitos.'; er.hidden = false; return; }
      bt.disabled = true; bt.textContent = 'Enviando…';
      try {
        const specs = [['Pidió', 'Quiero una así: ' + tit.slice(0, 90)]].concat(pz ? [['Piedra', pz]] : [], bs ? [['Base', bs]] : [], x.f && D.FORMAS[x.f] ? [['Forma', D.FORMAS[x.f]]] : []);
        const it = { tipo: 'mesa', titulo: ('Quiero una así: ' + tit).slice(0, 160), cantidad: 1, uso: x.u || 'comedor', specs };
        const ruta = x.img && /\/img\//.test(x.img) ? x.img.slice(x.img.indexOf('/img/') + 1) : ''; if (ruta) it.link = 'https://dkas.mx/' + ruta;
        const r = await A.crearPedido({ nombre, tel, notas: '', items: [it], canal: A.load('dazk-canal', '') });
        A.save('dazk-yo', Object.assign(A.load('dazk-yo', {}), { nombre, tel }));
        if (window.DKAS_VISITA) try { DKAS_VISITA(1); } catch (y) {}
        $('.qa-b').innerHTML = '<p class="qa-t">¡Gracias, ' + esc(nombre.split(' ')[0]) + '!</p><p class="qa-s">Recibimos tu solicitud <b>#' + r.folio + '</b>. Un asesor de DKAS te escribe por WhatsApp.</p><button class="btn oro form-btn" data-qx>Listo</button>';
      } catch (y) { er.textContent = y.message || 'No se pudo enviar. Intenta de nuevo.'; er.hidden = false; bt.disabled = false; bt.textContent = 'Quiero que me contacten'; }
    };
  }

  // ---------- menú del celular ----------
  const menu = $('#menu');
  const abrirMenu = v => { menu.classList.toggle('ver', v); menu.setAttribute('aria-hidden', !v); document.body.style.overflow = v ? 'hidden' : ''; };
  $('#menu-b').onclick = () => abrirMenu(true);
  $('#menu-x').onclick = () => abrirMenu(false);
  $$('#menu a').forEach(a => a.addEventListener('click', () => abrirMenu(false)));

  // ---------- portada: las fotos se van turnando ----------
  // portada: la presentación que el dueño escoge en el panel (clasica / revista / mosaico); se recuerda para que no parpadee
  const portada = $('#portada');
  const ponPres = p => { if (!portada || !/^(clasica|revista|mosaico)$/.test(p || '')) return; portada.dataset.pres = p; $$('#portada > .pv').forEach(s => s.classList.toggle('act', s.dataset.p === p)); };
  try { ponPres(localStorage.getItem('dkas-pres')); } catch (e) {}
  if (A && A.publico) A.publico().then(c => { if (c && c.presentacion) { ponPres(c.presentacion); try { localStorage.setItem('dkas-pres', c.presentacion); } catch (e) {} } }).catch(() => {});
  const vp = new URLSearchParams(location.search).get('portada'); if (vp) ponPres(vp); // vista previa desde el panel
  const slides = $$('.hero .slides img');
  let si = 0;
  if (slides.length > 1 && !matchMedia('(prefers-reduced-motion:reduce)').matches) setInterval(() => {
    if (document.hidden || scrollY > innerHeight) return;
    slides[si].classList.remove('on'); si = (si + 1) % slides.length; slides[si].loading = 'eager'; slides[si].classList.add('on');
  }, 7000);

  // ---------- aparece al bajar ----------
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.rv').forEach(el => io ? io.observe(el) : el.classList.add('in'));

  // ---------- rieles: colección, piedras y proyectos (una pantalla por foto, de lado) ----------
  $$('.riel').forEach(r => {
    const pista = r.querySelector('.pista'), sls = [...pista.children], cnt = r.querySelector('.cnt b'), barra = r.querySelector('.barra i');
    const ir = d => pista.scrollBy({ left: d * pista.clientWidth, behavior: 'smooth' });
    r.querySelectorAll('[data-r]').forEach(b => b.onclick = () => ir(+b.dataset.r));
    const marcar = () => {
      const i = Math.round(pista.scrollLeft / pista.clientWidth);
      cnt.textContent = String(i + 1).padStart(2, '0'); barra.style.width = ((i + 1) / sls.length * 100) + '%';
      sls.forEach((s, k) => s.classList.toggle('on', k === i));
    };
    pista.addEventListener('scroll', () => requestAnimationFrame(marcar), { passive: true }); marcar();
    pista.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.modelo) { const m = D.MODELOS.find(x => x.id === b.dataset.modelo); return disenar(Object.assign({}, m, { modelo: m.id }), 2); }
      if (b.dataset.piedra) return disenar({ piedra: b.dataset.piedra }, 0);
    });
  });
  // con el teclado: flechas mueven el riel que está en pantalla
  addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || document.querySelector('.visor.ver')) return;
    const r = $$('.riel').find(x => { const b = x.getBoundingClientRect(); return b.top < innerHeight / 2 && b.bottom > innerHeight / 2; });
    if (r) r.querySelector('[data-r="' + (e.key === 'ArrowLeft' ? -1 : 1) + '"]').click();
  });

  // ---------- bases diseñadas en el taller ----------
  A.basesPublicas().then(bs => {
    const otra = $('#bs .otra');
    Object.values(bs || {}).forEach(b => {
      if (!b || !b.nombre) return;
      const a = document.createElement('article');
      a.innerHTML = (b.foto ? '<img alt="" loading="lazy">' : '') + '<div><span class="nueva">Nueva</span><b></b><small></small></div>';
      if (b.foto) { a.querySelector('img').src = b.foto; a.querySelector('img').alt = 'Base ' + b.nombre; }
      a.querySelector('b').textContent = b.nombre; a.querySelector('small').textContent = b.desc || 'Diseño DKAS hecho en el taller.';
      otra.before(a);
    });
  }).catch(() => {});

  const visor = $('#visor');
  let lista = [], vi = 0;
  function pintarVisor() {
    const x = lista[vi], img = $('#vi-img');
    img.src = 'img/l/' + x.k + (innerWidth < 800 ? '-m' : '') + '.jpg'; img.alt = x.t || 'Mesa DKAS';
    $('#vi-t').textContent = x.t || 'Mesa DKAS';
    $('#vi-p').textContent = x.p ? 'Piedra ' + D.piedra(x.p).nombre : 'Hecha a la medida';
    $('#vi-btn').textContent = x.p ? 'Quiero una así' : 'Diseñar la mía'; $('#vi-crea').hidden = !x.p;
  }
  function abrirVisor(l, i) { lista = l; vi = i; pintarVisor(); visor.classList.add('ver'); visor.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
  function cerrarVisor() { if (!visor.classList.contains('ver')) return; visor.classList.remove('ver'); visor.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
  const mover = d => { vi = (vi + d + lista.length) % lista.length; pintarVisor(); };
  $('#vi-x').onclick = cerrarVisor; $('#vi-a').onclick = () => mover(-1); $('#vi-s').onclick = () => mover(1);
  addEventListener('keydown', e => { if (!visor.classList.contains('ver')) return; if (e.key === 'Escape') cerrarVisor(); if (e.key === 'ArrowLeft') mover(-1); if (e.key === 'ArrowRight') mover(1); });
  let x0 = null;
  visor.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  visor.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1); x0 = null; });
  $('#vi-btn').onclick = () => {
    const x = lista[vi];
    if (x.p) return crearMia({ p: x.p, u: x.u, f: x.f, b: x.b, t: x.t });
    const cambios = Object.assign({ uso: x.u, forma: x.f }, D.tamanoPara(x.u, x.f, x.u === 'comedor' ? 8 : 4));
    if (x.p) cambios.piedra = x.p;
    disenar(cambios, 1);
  };
  // ---------- botón flotante: se esconde en el configurador ----------
  const flota = $('#flota');
  // en Inicio aparece en cuanto pasas la portada; en Crea tu mesa no hace falta
  // también se esconde cuando en pantalla ya hay otro botón principal (así nunca tapa títulos ni botones) y al llegar al final
  const ctas = new Set();
  const ioCta = 'IntersectionObserver' in window ? new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? ctas.add(e.target) : ctas.delete(e.target)); verFlota(); }, { rootMargin: '0px 0px -40px 0px' }) : null;
  if (ioCta) $$('.dos-b, [data-modelo], [data-piedra], .hero .btn, .sig-pant, .rev .lnk-g').forEach(el => ioCta.observe(el));
  const verFlota = () => flota.classList.toggle('fuera', document.body.dataset.p === 'crea' || (document.body.dataset.p === 'inicio' && scrollY < innerHeight * 0.55)
    || [...ctas].some(el => el.offsetParent !== null) || innerHeight + scrollY > document.documentElement.scrollHeight - 160);
  addEventListener('scroll', verFlota, { passive: true }); verFlota();

  // ---------- dibuja tu idea: un lienzo que se manda por WhatsApp ----------
  const dib = $('#dib'), cv = $('#dib-c'), cx = cv.getContext('2d');
  const limpiar = () => { cx.fillStyle = '#f3efe8'; cx.fillRect(0, 0, cv.width, cv.height); cx.fillStyle = '#9a8f80'; cx.font = '26px sans-serif'; cx.fillText('DKAS · mi idea de mesa', 24, 44); };
  limpiar();
  let traz = null;
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); traz = pt(e); });
  cv.addEventListener('pointermove', e => { if (!traz) return; const p = pt(e); cx.strokeStyle = '#1b1713'; cx.lineWidth = 6; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(traz[0], traz[1]); cx.lineTo(p[0], p[1]); cx.stroke(); traz = p; });
  ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { traz = null; }));
  $$('[data-dibuja]').forEach(b => b.onclick = () => { dib.hidden = false; document.body.style.overflow = 'hidden'; });
  $('#dib-x').onclick = () => { dib.hidden = true; document.body.style.overflow = ''; };
  $('#dib-b').onclick = limpiar;
  $('#dib-m').onclick = () => cv.toBlob(async blob => {
    const txt = 'Hola DKAS, les mando el dibujo de la mesa que quiero.', num = window.DKAS_WA[0].num, f = new File([blob], 'mi-mesa-dkas.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) return await navigator.share({ files: [f], text: txt }); } catch (e) { if (e.name === 'AbortError') return; }
    // sin compartir archivos (compu): se descarga el dibujo y se abre WhatsApp para adjuntarlo
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mi-mesa-dkas.png'; a.click();
    open('https://wa.me/' + num + '?text=' + encodeURIComponent(txt + ' (te adjunto el dibujo)'), '_blank');
  }, 'image/png');

  // ---------- pantallas: cada sección se abre sola (con el #) ----------
  const PANT = { inicio: ['#portada', '#accesos', '.sellos', '#revista'], crea: ['#disena', '#acceso', '#app'], coleccion: ['#coleccion'], piedras: ['#piedras', '#porque'],
    bases: ['#bases'], proyectos: ['#proyectos'], arquitectos: ['#arquitectos'], como: ['#casa', '#como', '#preguntas'], contacto: ['#contacto'] };
  const ALIAS = { app: 'crea', disena: 'crea', casa: 'como', preguntas: 'como', porque: 'piedras', espacios: 'proyectos', revista: 'inicio' };
  const ORDEN = ['inicio', 'crea', 'coleccion', 'piedras', 'bases', 'proyectos', 'arquitectos', 'como', 'contacto'];
  const NOMBRE = { inicio: 'Inicio', crea: 'Crea tu mesa', coleccion: 'Colección', piedras: 'Piedras', bases: 'Bases', proyectos: 'Proyectos', arquitectos: 'Arquitectos', como: 'Nosotros', contacto: 'Contacto' };
  const HREF = p => p === 'crea' ? '#app' : p === 'inicio' ? '#' : '#' + p;
  const todas = [...new Set(Object.values(PANT).flat())].map(s => $(s)).filter(Boolean);
  // al final de cada pantalla: ir a la siguiente o volver al inicio
  ORDEN.forEach((p, i) => {
    const ult = $(PANT[p][PANT[p].length - 1]), sig = ORDEN[(i + 1) % ORDEN.length]; if (!ult) return;
    const n = document.createElement('nav'); n.className = 'sig-pant';
    n.innerHTML = (p === 'inicio' ? '' : '<a href="#">← Inicio</a>') + '<a class="sig" href="' + HREF(sig) + '"><small>Siguiente</small>' + NOMBRE[sig] + ' →</a>';
    ult.after(n); PANT[p].push(n);
  });
  function pantalla() {
    const h = location.hash.slice(1);
    let p = h.startsWith('d=') ? 'crea' : (ALIAS[h] || h || 'inicio'); if (!PANT[p]) p = 'inicio';
    document.body.dataset.p = p;
    const bar = $('#bar'); if (bar) bar.hidden = p !== 'crea'; // la barra Atrás/Siguiente solo en Crea tu mesa
    const ver = new Set(PANT[p].map(s => typeof s === 'string' ? $(s) : s));
    todas.concat($$('.sig-pant')).forEach(el => { el.hidden = !ver.has(el); });
    $$('.top nav .ln').forEach(a => a.classList.toggle('on', a.getAttribute('href') === (h === 'revista' ? '#revista' : HREF(p))));
    // la revista vive en la pantalla de inicio: su link baja hasta ella; lo demás abre arriba
    const sube = () => h === 'revista' ? $('#revista').scrollIntoView() : scrollTo(0, 0);
    sube(); setTimeout(sube, 0); requestAnimationFrame(sube); // el navegador salta al # después
    ver.forEach(el => el.querySelectorAll && el.querySelectorAll('.rv').forEach(x => x.classList.add('in')));
    verFlota();
  }
  addEventListener('hashchange', pantalla); pantalla();

  // ---------- bienvenida y registro de visitas: pide el nombre una vez; el panel ve quién entró ----------
  (function () {
    const yo = A.load('dazk-yo', {}), staff = A.load('dazk-ses', null);
    let v = A.load('dazk-v', null); if (!v) { v = A.rnd(); A.save('dazk-v', v); }
    const id = A.rnd(), w = Math.min(screen.width, screen.height), ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
    const origen = A.canal(new URLSearchParams(location.search).get('c') || (!ref || ref === location.hostname ? 'directo' : ref)) || 'directo';
    let primera = true, enviado = '', paso = 0, folio = 0; const vio = [];
    function registra() {
      if (staff) return; // el taller viendo su propia página no cuenta
      const yo = A.load('dazk-yo', {}), n = (yo.nombre || '').slice(0, 80), tel = String(yo.tel || '').replace(/\D/g, ''), interes = String(window.DKAS_INT || '').slice(0, 80);
      if (interes && vio[vio.length - 1] !== interes) vio.push(interes);
      let diseno = ''; try { if (paso >= 2 && window.DKAS_COD) diseno = String(DKAS_COD()).toLowerCase(); } catch (e) {}
      if (document.body.dataset.p === 'crea') paso = Math.max(paso, 1);
      if (window.DKAS_ST && DKAS_ST().modelo) paso = Math.max(paso, 1);
      const d = Object.assign({ v, disp: w < 600 ? 'celular' : w < 1000 ? 'tablet' : 'computadora', origen, paso }, n ? { nombre: n } : {}, folio ? { folio } : {}, /^[0-9]{10,13}$/.test(tel) ? { tel } : {}, interes ? { interes } : {}, vio.length > 1 ? { vio: vio.join(' | ').slice(-400) } : {}, /^[a-z0-9.-]{3,80}$/.test(diseno) ? { diseno } : {});
      const s = JSON.stringify(d); if (s === enviado) return; enviado = s;
      A.visita(id, d, primera).catch(() => {}); primera = false;
    }
    window.DKAS_VISITA = (p, f) => { paso = Math.max(paso, p); if (f) folio = f; registra(); }; // crea-ui avisa: 2 = armó su mesa, 3 = la mandó
    addEventListener('hashchange', () => setTimeout(registra, 300));
    const caja = $('#bienv');
    if (!yo.nombre && !staff) {
      caja.hidden = false; document.body.style.overflow = 'hidden'; setTimeout(() => $('#bienv-n').focus(), 300);
      $('#bienv-f').onsubmit = e => {
        e.preventDefault(); const n = $('#bienv-n').value.trim().replace(/\s+/g, ' ');
        if (n.length < 2) return;
        A.save('dazk-yo', Object.assign(A.load('dazk-yo', {}), { nombre: n })); const f = $('#nombre'); if (f && !f.value) f.value = n;
        caja.hidden = true; document.body.style.overflow = ''; registra();
      };
    } else registra();
  })();
})();

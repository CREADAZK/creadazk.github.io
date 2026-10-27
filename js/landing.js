/* DKAS · lo interactivo de la página: menú, portada, piedras, proyectos, visor y atajos al configurador */
(function () {
  const D = window.DKAS, A = window.DAZK_API;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  // manda al configurador con algo ya elegido
  function disenar(cambios, paso) {
    if (window.DKAS_PONER) window.DKAS_PONER(cambios, paso);
    cerrarVisor(); if (location.hash !== '#app') location.hash = '#app'; else scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- menú del celular ----------
  const menu = $('#menu');
  const abrirMenu = v => { menu.classList.toggle('ver', v); menu.setAttribute('aria-hidden', !v); document.body.style.overflow = v ? 'hidden' : ''; };
  $('#menu-b').onclick = () => abrirMenu(true);
  $('#menu-x').onclick = () => abrirMenu(false);
  $$('#menu a').forEach(a => a.addEventListener('click', () => abrirMenu(false)));

  // ---------- portada: las fotos se van turnando ----------
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
      if (b.dataset.v) { const x = JSON.parse(b.dataset.v), c = Object.assign({ uso: x.u, forma: x.f }, D.tamanoPara(x.u, x.f, x.u === 'comedor' ? 8 : 4)); if (x.p) c.piedra = x.p; if (x.b) c.base = x.b; disenar(c, 1); }
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
    $('#vi-btn').textContent = x.p ? 'Quiero una así' : 'Diseñar la mía';
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
    const cambios = Object.assign({ uso: x.u, forma: x.f }, D.tamanoPara(x.u, x.f, x.u === 'comedor' ? 8 : 4));
    if (x.p) cambios.piedra = x.p;
    disenar(cambios, 1);
  };
  // ---------- botón flotante: se esconde en el configurador ----------
  const flota = $('#flota');
  const verFlota = () => flota.classList.toggle('fuera', ['crea', 'inicio'].includes(document.body.dataset.p));
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
  const PANT = { inicio: ['.hero', '#accesos', '.sellos'], crea: ['#disena', '#app'], coleccion: ['#coleccion'], piedras: ['#piedras', '#porque'],
    bases: ['#bases'], proyectos: ['#proyectos'], como: ['#casa', '#como', '#preguntas'], contacto: ['#contacto'] };
  const ALIAS = { app: 'crea', disena: 'crea', casa: 'como', preguntas: 'como', porque: 'piedras', espacios: 'proyectos' };
  const ORDEN = ['inicio', 'crea', 'coleccion', 'piedras', 'bases', 'proyectos', 'como', 'contacto'];
  const NOMBRE = { inicio: 'Inicio', crea: 'Crea tu mesa', coleccion: 'Colección', piedras: 'Piedras', bases: 'Bases', proyectos: 'Proyectos', como: 'Nosotros', contacto: 'Contacto' };
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
    $$('.top nav .ln').forEach(a => a.classList.toggle('on', a.getAttribute('href') === HREF(p)));
    scrollTo(0, 0); setTimeout(() => scrollTo(0, 0), 0); requestAnimationFrame(() => scrollTo(0, 0)); // el navegador salta al # después
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
    let primera = true, enviado = '', paso = 0, folio = 0;
    function registra() {
      if (staff) return; // el taller viendo su propia página no cuenta
      const n = (A.load('dazk-yo', {}).nombre || '').slice(0, 80);
      if (document.body.dataset.p === 'crea') paso = Math.max(paso, 1);
      if (window.DKAS_ST && DKAS_ST().modelo) paso = Math.max(paso, 1);
      const d = Object.assign({ v, disp: w < 600 ? 'celular' : w < 1000 ? 'tablet' : 'computadora', origen, paso }, n ? { nombre: n } : {}, folio ? { folio } : {});
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

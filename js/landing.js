/* DKAS · lo interactivo de la página: menú, portada, piedras, proyectos, visor y atajos al configurador */
(function () {
  const D = window.DKAS, A = window.DAZK_API;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  // manda al configurador con algo ya elegido
  // sin acceso al diseñador, lleva directo al formulario para pedirlo (con el nombre ya escrito si lo tenemos)
  function disenar(cambios, paso) {
    try { if (window.DKAS_PONER) window.DKAS_PONER(cambios, paso); } catch (e) {}
    cerrarVisor(); cerrarCoti();
    if (location.hash !== '#app') location.hash = '#app'; else scrollTo({ top: 0, behavior: 'smooth' });
    if (!document.body.classList.contains('con-acceso')) setTimeout(() => { const n = $('#acc-nom'), t = $('#acc-tel'); const f = n && !n.value ? n : t && !t.value ? t : null; if (f) f.focus({ preventScroll: true }); }, 400);
  }

  // ---------- mini cotización por WhatsApp ("Quiero una así") ----------
  const coti = $('#coti');
  let cotX = null, cotP = 6;
  function cotizar(x) {
    cotX = x; cotP = x.u === 'centro' || x.u === 'periquera' ? 4 : x.f === 'square' || x.f === 'round' ? 4 : 6;
    $('#coti-img').src = x.img || ''; $('#coti-img').alt = x.t || 'Mesa DKAS'; $('#coti-img').hidden = !x.img;
    $('#coti-t').textContent = x.t || 'Una mesa así';
    $('#coti-d').textContent = [x.p && D.piedra(x.p).nombre, x.b && D.BASES[x.b] && 'Base ' + D.BASES[x.b].nombre, x.f && D.FORMAS[x.f]].filter(Boolean).join(' · ');
    $$('#coti-p button').forEach(b => b.classList.toggle('on', +b.dataset.n === cotP));
    const yo = A.load('dazk-yo', {}); if (yo.nombre && !$('#coti-n').value) $('#coti-n').value = yo.nombre;
    cerrarVisor(); coti.hidden = false; document.body.style.overflow = 'hidden';
    setTimeout(() => { const n = $('#coti-n'); if (!n.value) n.focus(); }, 60);
  }
  function cerrarCoti() { if (!coti || coti.hidden) return; coti.hidden = true; document.body.style.overflow = ''; }
  if (coti) {
    $('#coti-x').onclick = cerrarCoti;
    coti.addEventListener('mousedown', e => { if (e.target === coti) cerrarCoti(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') cerrarCoti(); });
    $('#coti-p').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cotP = +b.dataset.n; $$('#coti-p button').forEach(z => z.classList.toggle('on', z === b)); });
    $('#coti-f').onsubmit = e => {
      e.preventDefault(); const x = cotX || {}, nombre = $('#coti-n').value.trim();
      const lin = ['Hola DKAS, soy ' + nombre + '.', 'Me gustó la mesa "' + (x.t || 'de su página') + '" y quiero una así:'];
      if (x.p) lin.push('• Piedra: ' + D.piedra(x.p).nombre); if (x.b && D.BASES[x.b]) lin.push('• Base: ' + D.BASES[x.b].nombre); if (x.f) lin.push('• Forma: ' + D.FORMAS[x.f]);
      lin.push('• Para ' + (cotP >= 10 ? '10 o más' : cotP) + ' personas', '¿Me pueden cotizar?');
      A.save('dazk-yo', Object.assign(A.load('dazk-yo', {}), { nombre }));
      open('https://wa.me/' + window.DKAS_WA[0].num + '?text=' + encodeURIComponent(lin.join('\n')), '_blank');
      cerrarCoti();
    };
  }
  // todos los "Quiero una así" de la página (revista, proyectos y galería) abren la mini cotización
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const x = JSON.parse(b.dataset.v), caja = b.closest('article, figure, .sl'), im = caja && caja.querySelector('img'), h = caja && caja.querySelector('h3');
    cotizar(Object.assign({}, x, { t: h ? h.textContent.trim() : '', img: im ? (im.currentSrc || im.src) : '' }));
  }, true);

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
    if (x.p) return cotizar({ p: x.p, u: x.u, f: x.f, b: x.b, t: x.t, img: $('#vi-img').src });
    const cambios = Object.assign({ uso: x.u, forma: x.f }, D.tamanoPara(x.u, x.f, x.u === 'comedor' ? 8 : 4));
    if (x.p) cambios.piedra = x.p;
    disenar(cambios, 1);
  };
  // ---------- botón flotante: se esconde en el configurador ----------
  const flota = $('#flota');
  // en Inicio aparece en cuanto pasas la portada; en Crea tu mesa no hace falta
  const verFlota = () => flota.classList.toggle('fuera', document.body.dataset.p === 'crea' || (document.body.dataset.p === 'inicio' && scrollY < innerHeight * 0.55));
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
  const PANT = { inicio: ['.hero', '#accesos', '.sellos', '#revista'], crea: ['#disena', '#acceso', '#app'], coleccion: ['#coleccion'], piedras: ['#piedras', '#porque'],
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

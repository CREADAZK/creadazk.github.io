/* DKAS · lo interactivo de la página: menú, portada, piedras, proyectos, visor y atajos al configurador */
(function () {
  const D = window.DKAS, A = window.DAZK_API;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  // manda al configurador con algo ya elegido
  function disenar(cambios, paso) {
    if (window.DKAS_PONER) window.DKAS_PONER(cambios, paso);
    cerrarVisor(); $('#app').scrollIntoView({ behavior: 'smooth' });
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

  // ---------- colección ----------
  const carr = $('#carr');
  $$('[data-carr]').forEach(b => b.onclick = () => carr.scrollBy({ left: +b.dataset.carr * (carr.querySelector('.mod').offsetWidth + 18), behavior: 'smooth' }));
  carr.addEventListener('click', e => {
    const b = e.target.closest('[data-modelo]'); if (!b) return;
    const m = D.MODELOS.find(x => x.id === b.dataset.modelo);
    disenar(Object.assign({}, m, { modelo: m.id }), 2);
  });

  // ---------- piedras ----------
  const vista = $('#pz-vista');
  $('#muestras').addEventListener('click', e => {
    const b = e.target.closest('[data-pz]'); if (!b) return;
    const p = D.piedra(b.dataset.pz), viejo = vista.querySelector('img');
    $$('#muestras button').forEach(x => x.classList.toggle('on', x === b));
    const nuevo = viejo.cloneNode(); nuevo.style.opacity = 0; nuevo.loading = 'eager';
    nuevo.srcset = 'img/l/p-' + p.id + '-m.jpg 700w, img/l/p-' + p.id + '.jpg 1400w'; nuevo.src = 'img/l/p-' + p.id + '.jpg'; nuevo.alt = 'Placa ' + p.nombre;
    nuevo.onload = () => { requestAnimationFrame(() => { nuevo.style.opacity = 1; }); setTimeout(() => viejo.remove(), 650); };
    vista.appendChild(nuevo);
    $('#pz-n').textContent = p.nombre; $('#pz-a').textContent = p.acabado || '—'; $('#pz-d').textContent = p.desc + '.'; $('#pz-btn').dataset.piedra = p.id;
  });
  $('#pz-btn').onclick = () => disenar({ piedra: $('#pz-btn').dataset.piedra }, 0);

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

  // ---------- proyectos: filtro y visor ----------
  const figs = $$('#mas-g figure');
  $$('[data-f]').forEach(b => b.onclick = () => {
    $$('[data-f]').forEach(x => x.classList.toggle('on', x === b));
    figs.forEach(f => { f.hidden = !!b.dataset.f && f.dataset.c !== b.dataset.f; if (!f.hidden) f.classList.add('in'); });
  });

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
  $('#mas-g').addEventListener('click', e => {
    const f = e.target.closest('figure'); if (!f) return;
    const vis = figs.filter(x => !x.hidden);
    abrirVisor(vis.map(x => JSON.parse(x.dataset.v)), vis.indexOf(f));
  });

  // ---------- botón flotante: se esconde en el configurador ----------
  const flota = $('#flota');
  const verFlota = () => { const r = $('#app').getBoundingClientRect(); flota.classList.toggle('fuera', scrollY < innerHeight * 0.6 || (r.top < innerHeight && r.bottom > 0)); };
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
})();

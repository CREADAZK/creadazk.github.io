/* DKAS · lo interactivo de la página: menú, portada, piedras, comparación, espacios, visor y atajos al configurador */
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
  }, 6500);

  // ---------- aparece al bajar ----------
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.rv').forEach(el => io ? io.observe(el) : el.classList.add('in'));

  // ---------- colección ----------
  const carr = $('#carr');
  $$('[data-carr]').forEach(b => b.onclick = () => carr.scrollBy({ left: +b.dataset.carr * (carr.querySelector('.mod').offsetWidth + 14), behavior: 'smooth' }));
  carr.addEventListener('click', e => {
    const b = e.target.closest('[data-modelo]');
    if (b) { const m = D.MODELOS.find(x => x.id === b.dataset.modelo); return disenar(Object.assign({}, m, { modelo: m.id }), 2); }
    const card = e.target.closest('.mod'); if (card) card.classList.toggle('amb'); // en celular: tocar la foto la muestra en un espacio
  });

  // ---------- piedras ----------
  const vista = $('#pz-vista');
  $('#muestras').addEventListener('click', e => {
    const b = e.target.closest('[data-pz]'); if (!b) return;
    const p = D.piedra(b.dataset.pz), viejo = vista.querySelector('img');
    $$('#muestras button').forEach(x => x.classList.toggle('on', x === b));
    const nuevo = viejo.cloneNode(); nuevo.style.opacity = 0; nuevo.loading = 'eager';
    nuevo.srcset = 'img/l/p-' + p.id + '-m.jpg 700w, img/l/p-' + p.id + '.jpg 1400w'; nuevo.src = 'img/l/p-' + p.id + '.jpg'; nuevo.alt = 'Placa ' + p.nombre;
    nuevo.onload = () => { requestAnimationFrame(() => { nuevo.style.opacity = 1; }); setTimeout(() => viejo.remove(), 750); };
    vista.insertBefore(nuevo, $('#pz-placa'));
    $('#pz-placa').style.backgroundImage = 'url(img/piedras/' + p.id + '.jpg)';
    $('#pz-n').textContent = p.nombre; $('#pz-d').textContent = p.desc + '.'; $('#pz-btn').dataset.piedra = p.id;
  });
  $('#pz-btn').onclick = () => disenar({ piedra: $('#pz-btn').dataset.piedra }, 0);

  // ---------- comparación ----------
  $$('[data-cmp]').forEach(b => b.onclick = () => {
    const c = +b.dataset.cmp;
    $$('[data-cmp]').forEach(x => x.classList.toggle('on', x === b)); $('#cmp-t').textContent = b.textContent;
    $$('.compara tbody tr').forEach(tr => { tr.lastElementChild.innerHTML = JSON.parse(tr.dataset.r)[c]; });
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

  // ---------- espacios: filtro y visor ----------
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
    $('#vi-p').textContent = x.p ? 'Piedra ' + D.piedra(x.p).nombre : 'Hecha en nuestro taller';
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
    if (!x.p) return disenar({}, 0);
    disenar(Object.assign({ uso: x.u, forma: x.f, piedra: x.p }, D.tamanoPara(x.u, x.f, x.u === 'comedor' ? 8 : 4)), 1);
  };
  $('#mas-g').addEventListener('click', e => {
    const f = e.target.closest('figure'); if (!f) return;
    const vis = figs.filter(x => !x.hidden);
    abrirVisor(vis.map(x => JSON.parse(x.dataset.v)), vis.indexOf(f));
  });
  $('#tira').addEventListener('click', e => {
    const im = e.target.closest('img'); if (!im) return;
    const l = $$('#tira img:not([aria-hidden])').map(x => ({ k: x.dataset.k }));
    abrirVisor(l, l.findIndex(x => x.k === im.dataset.k));
  });
})();

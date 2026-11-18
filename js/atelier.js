/* DKAS · Atelier: lo interactivo de la versión clara (portada que rota, riel de espacios, arma tu medida, piedra del día, lupa, paralaje) */
(function () {
  const D = window.DKAS, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const quieto = matchMedia('(prefers-reduced-motion:reduce)').matches, fino = matchMedia('(hover:hover) and (pointer:fine)').matches;

  // ---------- cada día cambia: el orden de las secciones rota y la portada empieza en otra foto (hora CDMX) ----------
  const DIA = (() => { try { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date()).split('-').map(Number); return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); } catch (e) { return Math.floor(Date.now() / 864e5); } })();
  (function rotar() {
    const ids = [['#atelier'], ['#espacios', '.at-dos'], ['#piedras'], ['#medida'], ['#dia'], ['#showroom'], ['#taller'], ['#bases'], ['#grapas'], ['#proyectos']];
    const bloques = ids.map(g => g.map(s => document.querySelector(s)).filter(Boolean)).filter(g => g.length), fin = document.querySelector('#disena');
    if (!fin || bloques.length < 2) return;
    const k = DIA % bloques.length, orden = bloques.slice(k).concat(bloques.slice(0, k));
    orden.forEach(g => g.forEach(el => fin.parentNode.insertBefore(el, fin)));
    let n = 0; orden.forEach(g => g.forEach(el => { const e = el.querySelector('.at-k'); if (e && /^\d\d —/.test(e.textContent)) e.textContent = e.textContent.replace(/^\d\d/, String(++n).padStart(2, '0')); }));
  })();

  // ---------- encabezado y barra de avance ----------
  const top = $('#top'), av = document.createElement('div'); av.className = 'at-avance'; document.body.appendChild(av);
  let pide = false;
  function alBajar() {
    pide = false; const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    top.classList.toggle('solido', y > innerHeight * 0.75 || document.body.dataset.p === 'crea');
    av.style.transform = 'scaleX(' + (h > 0 ? y / h : 0) + ')';
    if (!quieto) $$('.at-full-f,.at-d3-f,.at-fin-f').forEach(f => { const r = f.parentNode.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; f.style.transform = 'translate3d(0,' + ((r.top + r.height / 2 - innerHeight / 2) * -0.12).toFixed(1) + 'px,0)'; });
  }
  addEventListener('scroll', () => { if (!pide) { pide = true; requestAnimationFrame(alBajar); } }, { passive: true });
  addEventListener('hashchange', () => setTimeout(alBajar, 50)); alBajar();

  // ---------- portada: fotos que se turnan con barra de avance ----------
  const figs = $$('.at-sl figure'), caps = $$('.at-cap p'), bars = $$('.at-prog button'), cnt = $('.at-cnt b'), DUR = 7000;
  let si = 0, t = null;
  function ir(i) {
    si = (i + figs.length) % figs.length;
    figs.forEach((f, k) => { f.classList.toggle('on', k === si); if (k === si) { const im = f.querySelector('img'); im.loading = 'eager'; } });
    caps.forEach((c, k) => c.classList.toggle('on', k === si));
    bars.forEach((b, k) => { b.classList.remove('on'); b.classList.toggle('hecho', k < si); });
    void bars[si].offsetWidth; bars[si].classList.add('on'); cnt.textContent = String(si + 1).padStart(2, '0');
    // la siguiente se va bajando antes
    const sig = figs[(si + 1) % figs.length].querySelector('img'); if (sig) sig.loading = 'eager';
    clearTimeout(t); if (!quieto) t = setTimeout(() => ir(si + 1), DUR);
  }
  document.documentElement.style.setProperty('--dur', DUR / 1000 + 's');
  bars.forEach((b, k) => b.onclick = () => ir(k));
  if (figs.length) ir(DIA % figs.length);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(t); else ir(si); });

  // ---------- fotos que se revelan al llegar ----------
  $$('.at-man-f,.at-card .ph,.at-tal-f,.at-tal-d,.at-pro-g figure,.at-bs-g .ph,.at-gc .ph,.at-dos-c').forEach(el => el.classList.add('at-rev'));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  $$('.at-rev').forEach(el => quieto ? el.classList.add('in') : io.observe(el));

  // ---------- espacios: filtros, flechas, arrastre y avance ----------
  const pista = $('#at-pista'), barra = $('.at-barra i');
  if (pista) {
    const marca = () => { const m = pista.scrollWidth - pista.clientWidth; barra.style.width = Math.max(8, m > 0 ? (pista.scrollLeft / m) * 100 : 100) + '%'; };
    pista.addEventListener('scroll', () => requestAnimationFrame(marca), { passive: true }); marca();
    $$('[data-ag]').forEach(b => b.onclick = () => pista.scrollBy({ left: +b.dataset.ag * (pista.querySelector('.at-card:not([hidden])') || pista).offsetWidth * 1.05, behavior: 'smooth' }));
    $$('[data-af]').forEach(b => b.onclick = () => {
      $$('[data-af]').forEach(x => x.classList.toggle('on', x === b));
      $$('.at-card').forEach(c => { c.hidden = b.dataset.af !== 'todo' && c.dataset.g !== b.dataset.af; if (!c.hidden) c.querySelector('.ph').classList.add('in'); });
      pista.scrollTo({ left: 0, behavior: 'smooth' }); setTimeout(marca, 400);
    });
    if (fino) { // con mouse se arrastra como en el celular
      let x0 = null, s0 = 0, movio = false;
      pista.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.target.closest('a,button')) return; x0 = e.clientX; s0 = pista.scrollLeft; movio = false; });
      addEventListener('pointermove', e => { if (x0 == null) return; const dx = e.clientX - x0; if (Math.abs(dx) > 4) { movio = true; pista.classList.add('arrastra'); } pista.scrollLeft = s0 - dx; });
      addEventListener('pointerup', () => { if (x0 == null) return; x0 = null; pista.classList.remove('arrastra'); });
      pista.addEventListener('click', e => { if (movio) { e.preventDefault(); e.stopPropagation(); movio = false; } }, true);
    }
  }

  // ---------- grapas: filtros, flechas, avance y medida elegida → WhatsApp ----------
  const gr = $('#at-gr'), grb = $('.at-gr-b i');
  if (gr) {
    const marcaG = () => { const m = gr.scrollWidth - gr.clientWidth; grb.style.width = Math.max(8, m > 0 ? gr.scrollLeft / m * 100 : 100) + '%'; };
    gr.addEventListener('scroll', () => requestAnimationFrame(marcaG), { passive: true }); marcaG();
    $$('[data-gg]').forEach(b => b.onclick = () => gr.scrollBy({ left: +b.dataset.gg * ((gr.querySelector('.at-gc:not([hidden])') || gr).offsetWidth + 20), behavior: 'smooth' }));
    $$('[data-gf]').forEach(b => b.onclick = () => {
      $$('[data-gf]').forEach(x => x.classList.toggle('on', x === b));
      $$('.at-gc').forEach(c => { c.hidden = b.dataset.gf !== 'todo' && c.dataset.g !== b.dataset.gf; if (!c.hidden) c.querySelector('.ph').classList.add('in'); });
      gr.scrollTo({ left: 0, behavior: 'smooth' }); setTimeout(marcaG, 400);
    });
    const num = (window.DKAS_WA && DKAS_WA[0] && DKAS_WA[0].num) || '';
    const link = c => {
      const on = c.querySelector('.at-gm .on'), m = on ? on.dataset.m : '';
      const t = 'Hola DKAS, me interesa el modelo ' + c.dataset.cod + ' (' + c.dataset.t + ')' + (m ? ' en ' + m + ' cm' : '') + '. ¿Me pasan precio?';
      c.querySelector('.lk a').href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(t);
    };
    $$('.at-gc').forEach(c => {
      link(c);
      c.querySelectorAll('.at-gm button').forEach(b => b.onclick = () => { c.querySelectorAll('.at-gm button').forEach(x => x.classList.toggle('on', x === b)); link(c); window.DKAS_INT = 'Grapa ' + c.dataset.cod + ' ' + b.dataset.m; });
    });
  }

  // ---------- piedras: lista, foto grande y lupa ----------
  let piedraSel = D.PIEDRAS[0].id;
  const img = $('#at-pd-img'), vis = $('.at-pd-v');
  function piedra(b) {
    if (!b) return; piedraSel = b.dataset.ap;
    $$('[data-ap]').forEach(x => x.classList.toggle('on', x === b));
    img.classList.add('cambia');
    const url = 'tex/piedras/1k/' + piedraSel + '.jpg', pre = new Image();
    pre.onload = pre.onerror = () => { img.style.backgroundImage = 'url(' + url + ')'; lupa.style.backgroundImage = 'url(tex/piedras/' + piedraSel + '.jpg)'; img.classList.remove('cambia'); };
    pre.src = url;
    $('#at-pd-n').textContent = b.dataset.n; $('#at-pd-d').textContent = b.dataset.d;
    $('#at-pd-go').href = 'cotiza.html?u=comedor&f=rect&p=' + piedraSel;
    if (window.DKAS_INT !== undefined || true) window.DKAS_INT = 'Piedra ' + b.dataset.n;
    medida();
  }
  const lupa = document.createElement('div'); lupa.className = 'at-lupa'; if (vis) vis.appendChild(lupa);
  lupa.style.backgroundImage = 'url(tex/piedras/' + piedraSel + '.jpg)';
  $$('[data-ap]').forEach(b => { b.onclick = () => piedra(b); if (fino) b.onmouseenter = () => { clearTimeout(b._t); b._t = setTimeout(() => piedra(b), 140); }; if (fino) b.onmouseleave = () => clearTimeout(b._t); });
  if (vis) {
    const mueve = e => { const r = vis.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; if (y > r.height - 90) { vis.classList.remove('lupa'); return; }
      vis.classList.add('lupa'); lupa.style.left = x + 'px'; lupa.style.top = y + 'px'; const z = 3; lupa.style.backgroundSize = r.width * z + 'px ' + r.height * z + 'px'; lupa.style.backgroundPosition = (-(x * z) + 95) + 'px ' + (-(y * z) + 95) + 'px'; };
    vis.addEventListener('pointermove', mueve); vis.addEventListener('pointerdown', mueve);
    vis.addEventListener('pointerleave', () => vis.classList.remove('lupa')); vis.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') vis.classList.remove('lupa'); });
  }

  // ---------- arma tu medida: la mesa crece con las personas ----------
  const svg = $('#at-med-svg'), rng = $('#at-med-i');
  let forma = 'rect';
  const redonda = f => f === 'round' || f === 'square';
  function medida() {
    if (!svg) return;
    // hasta cuántas personas da esa forma con una mesa que sí hacemos
    let mx = 2; for (let k = 2; k <= 16; k++) if (D.tamanoPara('comedor', forma, k)) mx = k;
    rng.max = mx; if (+rng.value > mx) rng.value = mx;
    const n = +rng.value, t = D.tamanoPara('comedor', forma, n) || { L: 240, W: 100 }, L = t.L, W = redonda(forma) ? t.L : t.W;
    rng.style.setProperty('--p', ((n - 2) / Math.max(1, mx - 2) * 100) + '%');
    $('#at-med-n').textContent = n;
    $('#at-med-m').textContent = redonda(forma) && forma === 'round' ? 'Ø ' + L + ' cm' : L + ' × ' + W + ' cm';
    const pz = D.PIEDRAS.find(p => p.id === piedraSel); $('#at-med-p').textContent = pz ? pz.nombre : '';
    const pzs = Math.ceil(L / 320), sale = W <= 160 ? (pzs === 1 ? 'Sale de <b>una sola placa</b>, sin uniones.' : 'Lleva <b>' + pzs + ' piezas</b> de placa con una unión fina.') : 'Más ancha que la placa: te la diseñamos con unión.';
    $('#at-med-x').innerHTML = sale + ' Cubierta terminada de 2.5 cm.';
    $('#at-med-go').href = 'cotiza.html?' + new URLSearchParams({ u: 'comedor', f: forma, p: piedraSel, n });
    // dibujo: escala fija (la mesa más grande cabe), sillas alrededor cada 70 cm
    const E = 1.35, cx = 300, cy = 210, w = L * E, h = W * E, x = cx - w / 2, y = cy - h / 2;
    const tex = 'tex/piedras/1k/' + piedraSel + '.jpg';
    let s = '<defs><pattern id="atp" patternUnits="userSpaceOnUse" width="600" height="300"><image href="' + tex + '" width="600" height="300" preserveAspectRatio="xMidYMid slice"/></pattern>'
      + '<filter id="ats" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity=".22"/></filter></defs>';
    const silla = (sx, sy, ang) => '<g class="silla" transform="translate(' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ') rotate(' + ang + ')"><rect x="-21" y="-19" width="42" height="38" rx="9" fill="#d9d2c6"/><rect x="-21" y="12" width="42" height="9" rx="4" fill="#b9b0a2"/></g>';
    const sillas = [];
    if (forma === 'round' || forma === 'oval' || forma === 'ovcuad' && false) {
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 - Math.PI / 2, rx = w / 2 + 30, ry = h / 2 + 30; sillas.push(silla(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, a * 180 / Math.PI - 90)); }
    } else {
      const ladoL = Math.max(1, Math.floor(L / 70)), cab = Math.max(0, n - ladoL * 2);
      let arr = Math.ceil((n - Math.min(cab, 2)) / 2), aba = n - Math.min(cab, 2) - arr; const cabs = Math.min(cab, 2);
      if (redonda(forma)) { const k4 = Math.ceil(n / 4); arr = Math.ceil(n / 4); aba = arr; const lados = [arr, aba, Math.ceil((n - arr - aba) / 2), n - arr - aba - Math.ceil((n - arr - aba) / 2)];
        lados.forEach((m, li) => { for (let k = 0; k < m; k++) { const f = (k + .5) / m; if (li === 0) sillas.push(silla(x + w * f, y - 30, 180)); if (li === 1) sillas.push(silla(x + w * f, y + h + 30, 0)); if (li === 2) sillas.push(silla(x - 30, y + h * f, 90)); if (li === 3) sillas.push(silla(x + w + 30, y + h * f, -90)); } }); }
      else {
        for (let k = 0; k < arr; k++) sillas.push(silla(x + w * (k + .5) / arr, y - 30, 180));
        for (let k = 0; k < aba; k++) sillas.push(silla(x + w * (k + .5) / aba, y + h + 30, 0));
        if (cabs > 0) sillas.push(silla(x - 30, cy, 90)); if (cabs > 1) sillas.push(silla(x + w + 30, cy, -90));
      }
    }
    const rr = forma === 'rect' || forma === 'square' ? 3 : forma === 'ovcuad' ? Math.min(h / 2.4, 60) : 0;
    const mesa = forma === 'round' ? '<circle class="mesa" cx="' + cx + '" cy="' + cy + '" r="' + w / 2 + '" fill="url(#atp)" filter="url(#ats)" stroke="rgba(0,0,0,.18)"/>'
      : forma === 'oval' ? '<ellipse class="mesa" cx="' + cx + '" cy="' + cy + '" rx="' + w / 2 + '" ry="' + h / 2 + '" fill="url(#atp)" filter="url(#ats)" stroke="rgba(0,0,0,.18)"/>'
      : '<rect class="mesa" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rr + '" fill="url(#atp)" filter="url(#ats)" stroke="rgba(0,0,0,.18)"/>';
    const cota = forma === 'round' ? '' : '<g font-family="Inter,sans-serif" font-size="12" fill="#6b655b" text-anchor="middle"><line x1="' + x + '" x2="' + (x + w) + '" y1="' + (y + h + 66) + '" y2="' + (y + h + 66) + '" stroke="#6b655b" stroke-width=".8"/><text x="' + cx + '" y="' + (y + h + 84) + '">' + L + ' cm</text></g>';
    svg.innerHTML = s + sillas.join('') + mesa + cota;
    if (window.DKAS_INT !== undefined) window.DKAS_INT = 'Arma tu medida: ' + n + ' personas';
  }
  if (svg) { rng.oninput = medida; $$('[data-mf]').forEach(b => b.onclick = () => { forma = b.dataset.mf; $$('[data-mf]').forEach(x => x.classList.toggle('on', x === b)); medida(); }); medida(); }

  // ---------- piedra del día: cambia sola cada día (hora de la Ciudad de México) ----------
  (function () {
    const hoy = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
    const dia = Math.floor(Date.UTC(+hoy.year, +hoy.month - 1, +hoy.day) / 864e5), p = D.PIEDRAS[dia % D.PIEDRAS.length];
    const sw = $('#at-dia-sw'); if (!sw) return;
    sw.style.backgroundImage = 'url(tex/piedras/1k/' + p.id + '.jpg)';
    $('#at-dia-n').textContent = p.nombre; $('#at-dia-d').textContent = p.desc + (p.acabado ? ' · acabado ' + p.acabado.toLowerCase() : '') + '.';
    $('#at-dia-f').textContent = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    $('#at-dia-go').href = 'cotiza.html?u=comedor&f=rect&p=' + p.id;
  })();

  // ---------- botones magnéticos y cursor (solo con mouse) ----------
  if (fino && !quieto) {
    $$('.ab:not(.chico), .at-flechas button').forEach(b => {
      b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .18).toFixed(1) + 'px,' + ((e.clientY - r.top - r.height / 2) * .28).toFixed(1) + 'px)'; });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
    const cur = document.createElement('div'); cur.className = 'at-cursor'; document.body.appendChild(cur);
    let mx = -100, my = -100, cx = -100, cy = -100;
    addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; cur.classList.toggle('grande', !!e.target.closest('a,button,.at-card .ph,label')); }, { passive: true });
    (function loop() { cx += (mx - cx) * .22; cy += (my - cy) * .22; cur.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)'; requestAnimationFrame(loop); })();
  }
})();

/* DKAS · Atelier: lo interactivo de la versión clara (portada que rota, riel de espacios, arma tu medida, piedra del día, lupa, paralaje) */
(function () {
  const D = window.DKAS, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const quieto = matchMedia('(prefers-reduced-motion:reduce)').matches, fino = matchMedia('(hover:hover) and (pointer:fine)').matches;

  // ---------- cada día cambia: el orden de las secciones rota y la portada empieza en otra foto (hora CDMX) ----------
  const DIA = (() => { try { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date()).split('-').map(Number); return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); } catch (e) { return Math.floor(Date.now() / 864e5); } })();
  (function rotar() {
    const ids = [['#espacios', '.at-dos'], ['#piedras'], ['#medida'], ['#dia'], ['#showroom'], ['#taller'], ['#bases'], ['#grapas'], ['#proyectos'], ['#coleccion'], ['#ciencia']];
    const bloques = ids.map(g => g.map(s => document.querySelector(s)).filter(Boolean)).filter(g => g.length), fin = document.querySelector('#disena');
    if (!fin || bloques.length < 2) return;
    const k = DIA % bloques.length, at = document.querySelector('#atelier'), orden = (at ? [[at]] : []).concat(bloques.slice(k), bloques.slice(0, k)); // 'El atelier' siempre va primero
    orden.forEach(g => g.forEach(el => fin.parentNode.insertBefore(el, fin)));
    let n = 0; orden.forEach(g => g.forEach(el => { const e = el.querySelector('.at-k'); if (e && /^\d\d —/.test(e.textContent)) e.textContent = e.textContent.replace(/^\d\d/, String(++n).padStart(2, '0')); }));
  })();

  // ---------- encabezado y barra de avance ----------
  const top = $('#top'), av = document.createElement('div'); av.className = 'at-avance'; document.body.appendChild(av);
  const mani = $('#at-mani');
  let pide = false;
  function alBajar() {
    if (mani) { const r = mani.getBoundingClientRect(); mani.style.setProperty('--p', quieto ? 1 : Math.min(1, Math.max(0, (innerHeight * .88 - r.top) / (r.height + innerHeight * .4))).toFixed(3)); }
    pide = false; const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    top.classList.toggle('solido', y > innerHeight * 0.75 || document.body.dataset.p === 'crea');
    av.style.transform = 'scaleX(' + (h > 0 ? y / h : 0) + ')';
    if (!quieto && fino) $$('.at-full-f,.at-d3-f,.at-fin-f').forEach(f => { const r = f.parentNode.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; f.style.transform = 'translate3d(0,' + ((r.top + r.height / 2 - innerHeight / 2) * -0.12).toFixed(1) + 'px,0)'; });
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

  // ---------- colección: la foto sigue al cursor (solo con mouse) ----------
  const colV = $('.at-col-v'), colI = colV && colV.querySelector('img');
  if (colV && fino && !quieto) {
    let vx = 0, vy = 0, tx = 0, ty = 0, anda = false;
    const mueve = () => { vx += (tx - vx) * .14; vy += (ty - vy) * .14; colV.style.transform = 'translate3d(' + vx.toFixed(1) + 'px,' + vy.toFixed(1) + 'px,0)'; if (anda) requestAnimationFrame(mueve); };
    $$('.at-col-r').forEach(a => a.addEventListener('mouseenter', () => { if (colI.getAttribute('src') !== a.dataset.img) colI.src = a.dataset.img; colV.classList.add('ver'); }));
    $('.at-col-l').addEventListener('mouseleave', () => { colV.classList.remove('ver'); anda = false; });
    $('.at-col-l').addEventListener('mousemove', e => { tx = e.clientX + 28; ty = e.clientY - colV.offsetHeight / 2; if (!anda) { anda = true; vx = tx; vy = ty; requestAnimationFrame(mueve); } });
  }

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

;
/* DKAS · Atelier "wow" (2026-11-18): capa de efectos sobre atelier.js.
   Portada en WebGL (las fotos se disuelven como veta de piedra, profundidad con el mouse), mesa 3D en vivo,
   títulos que suben letra por letra, contadores, luz que corre sobre la piedra, tarjetas con relieve,
   cursor con texto y cinta que acelera al bajar. Nada fija el scroll: en celular se baja normal. */
(function () {
  const D = window.DKAS, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const quieto = matchMedia('(prefers-reduced-motion:reduce)').matches, fino = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const cel = !fino || innerWidth < 760;
  document.documentElement.classList.add('wow');
  if (quieto) document.documentElement.classList.add('wow-quieto');
  const intro0 = document.getElementById('at-intro'); document.documentElement.style.setProperty('--t0', (intro0 ? 1750 : 150) + 'ms');
  const intro = document.getElementById('at-intro'), T0 = intro ? 1750 : 150; // si está el telón de entrada, los títulos esperan a que se abra

  // ================= 1. Portada en WebGL =================
  (function portada() {
    const hero = $('#portada'), sl = hero && hero.querySelector('.at-sl'), figs = sl ? [...sl.querySelectorAll('figure')] : [];
    if (!figs.length || quieto) return;
    const cv = document.createElement('canvas'); cv.className = 'at-gl'; cv.setAttribute('aria-hidden', 'true');
    let gl; try { gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch (e) {}
    if (!gl) return;
    const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
    const FS = `precision highp float;varying vec2 v;uniform sampler2D a,b;uniform vec2 ra,rb,res,m;uniform float p,t,za,zb,sc;
float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 q){float s=0.,k=.5;for(int i=0;i<5;i++){s+=n(q)*k;q=q*2.03+vec2(1.7,9.2);k*=.5;}return s;}
vec2 cover(vec2 u,vec2 im){float rs=res.x/res.y,ri=im.x/im.y;vec2 s=rs>ri?vec2(1.,ri/rs):vec2(rs/ri,1.);return (u-.5)*s+.5;}
void main(){
  vec2 u=v;u.y=1.-u.y;
  // veta: ruido estirado en diagonal, como la veta de una placa
  vec2 q=vec2(u.x*1.6+u.y*.9,u.y*3.2-u.x*.4);
  float ve=fbm(q*2.2+vec2(0.,t*.03));
  float s=clamp((u.x*.55+(1.-u.y)*.25)*.55+ve*.75-.12,0.,1.);
  float w=smoothstep(s-.07,s+.07,p*1.25-.1);
  vec2 dir=normalize(vec2(1.,-.35));
  float pa=w*(1.-w);
  vec2 ua=cover((u-.5)/za+.5+m*.012,ra);ua=(ua-.5)*(1.-w*.05)+.5+dir*w*.05*ve;
  vec2 ub=cover((u-.5)/zb+.5+m*.012,rb);ub=(ub-.5)*(1.+(1.-w)*.05)+.5-dir*(1.-w)*.05*ve;
  vec3 ca=texture2D(a,ua).rgb;
  float ab=pa*.012;
  vec3 cb=vec3(texture2D(b,ub+vec2(ab,0.)).r,texture2D(b,ub).g,texture2D(b,ub-vec2(ab,0.)).b);
  vec3 c=mix(ca,cb,w);
  // filo de luz dorada donde se encuentran las dos fotos (como el canto pulido)
  float e=pow(pa*4.,6.);
  c+=vec3(.95,.84,.64)*e*.28;
  // al bajar: se oscurece suave
  c*=1.-sc*.45;
  gl_FragColor=vec4(c,1.);
}`;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    let pr;
    try { pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link'); } catch (e) { return; }
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ['a', 'b', 'ra', 'rb', 'res', 'm', 'p', 't', 'za', 'zb', 'sc'].forEach(k => U[k] = gl.getUniformLocation(pr, k));
    gl.uniform1i(U.a, 0); gl.uniform1i(U.b, 1);
    const grande = (Math.min(devicePixelRatio || 1, 2) * innerWidth) > 1300;
    const tex = figs.map(f => { const im = f.querySelector('img'), src = im.getAttribute('src'); return { url: grande ? src : src.replace(/\.jpg$/, '-m.jpg'), t: null, w: 1, h: 1, p: null }; });
    function cargar(i) {
      const x = tex[i]; if (x.p) return x.p;
      return x.p = new Promise(ok => { const im = new Image(); im.decoding = 'async'; im.onload = () => {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        x.t = t; x.w = im.naturalWidth; x.h = im.naturalHeight; ok(x); }; im.onerror = () => ok(null); im.src = x.url; });
    }
    const actual = () => Math.max(0, figs.findIndex(f => f.classList.contains('on')));
    let A = actual(), B = A, p = 1, t0 = 0, sA = performance.now(), sB = sA, listo = false, vis = true, mx = 0, my = 0, tx = 0, ty = 0, scv = 0;
    const DUR = 1900, KB = 9000;
    const zoom = s => 1.1 - 0.1 * (1 - Math.pow(1 - Math.min(1, (performance.now() - s) / KB), 3)); // acercamiento lento tipo cine
    function medir() { const d = Math.min(devicePixelRatio || 1, cel ? 1.25 : 1.6); cv.width = Math.round(hero.clientWidth * d); cv.height = Math.round(hero.clientHeight * d); gl.viewport(0, 0, cv.width, cv.height); }
    function frame(now) {
      if (!vis || document.hidden) { corre = false; return; }
      requestAnimationFrame(frame);
      if (p < 1) p = Math.min(1, (now - t0) / DUR);
      const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      mx += (tx - mx) * .05; my += (ty - my) * .05;
      const a = tex[A], b = tex[B];
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.t); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.t);
      gl.uniform2f(U.ra, a.w, a.h); gl.uniform2f(U.rb, b.w, b.h); gl.uniform2f(U.res, cv.width, cv.height); gl.uniform2f(U.m, mx, my);
      gl.uniform1f(U.p, A === B ? 1 : e); gl.uniform1f(U.t, now / 1000); gl.uniform1f(U.za, zoom(sA)); gl.uniform1f(U.zb, zoom(sB)); gl.uniform1f(U.sc, scv);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (p >= 1 && A !== B) { A = B; sA = sB; }
    }
    let corre = false; const arranca = () => { if (!corre && listo && vis && !document.hidden) { corre = true; requestAnimationFrame(frame); } };
    function ir(i) {
      cargar(i).then(x => { if (!x) return;
        if (!listo) { A = B = i; sA = sB = performance.now(); p = 1; listo = true; medir(); hero.classList.add('gl'); sl.appendChild(cv); arranca(); return; }
        if (i === B) return;
        if (p < 1) { A = B; sA = sB; } // si cambian a media transición, se parte de la que ya iba entrando
        B = i; sB = performance.now(); p = 0; t0 = performance.now(); arranca();
        cargar((i + 1) % figs.length);
      });
    }
    ir(A);
    new MutationObserver(() => { const i = actual(); if (i !== B) ir(i); }).observe(sl, { subtree: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', () => { if (listo) medir(); });
    new IntersectionObserver(es => { vis = es[0].isIntersecting; arranca(); }).observe(hero);
    document.addEventListener('visibilitychange', arranca);
    if (fino) hero.addEventListener('pointermove', e => { tx = (e.clientX / innerWidth - .5); ty = (e.clientY / innerHeight - .5); });
    addEventListener('scroll', () => { scv = Math.min(1, Math.max(0, scrollY / (hero.clientHeight || 1))); }, { passive: true });
    // el texto de la portada se va despacio al bajar
    const hx = hero.querySelector('.at-hx');
    if (hx && !cel) addEventListener('scroll', () => { const k = Math.min(1, scrollY / hero.clientHeight); hx.style.transform = 'translate3d(0,' + (k * -90).toFixed(1) + 'px,0)'; hx.style.opacity = (1 - k * 1.3).toFixed(3); }, { passive: true });
  })();

  // ================= 2. Títulos que suben palabra por palabra / letra por letra =================
  function partir(el, porLetra) {
    let k = 0;
    const walk = nodo => [...nodo.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const f = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(w => {
          if (!w) return; if (/^\s+$/.test(w)) { f.appendChild(document.createTextNode(' ')); return; }
          const o = document.createElement('span'); o.className = 'wd';
          if (porLetra) [...w].forEach(ch => { const i = document.createElement('span'); i.className = 'wi'; i.style.setProperty('--i', k++); i.textContent = ch; o.appendChild(i); });
          else { const i = document.createElement('span'); i.className = 'wi'; i.style.setProperty('--i', k++); i.textContent = w; o.appendChild(i); }
          f.appendChild(o);
        });
        c.replaceWith(f);
      } else if (c.nodeType === 1 && c.tagName !== 'BR' && c.tagName !== 'SVG') walk(c);
    });
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el); [...el.querySelectorAll('.wd')].forEach(w => w.setAttribute('aria-hidden', 'true'));
    el.classList.add('wow-t'); return k;
  }
  if (!quieto) {
    const h1 = $('.at-hero h1');
    if (h1) { partir(h1, true); h1.style.setProperty('--d', T0 + 'ms'); requestAnimationFrame(() => requestAnimationFrame(() => h1.classList.add('vis'))); }
    const ioT = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); ioT.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
    $$('html.vb h2').forEach(h => { if (h.closest('#acceso,#app,.menu,.at-hero')) return; partir(h, h.closest('.at-pdd')); ioT.observe(h); });
  }

  // ================= 3. Etiquetas que se "decodifican" al aparecer =================
  if (!quieto) {
    const AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const ioK = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; ioK.unobserve(e.target); const el = e.target, fin = el.textContent, t1 = performance.now(), L = 650;
      (function paso(now) { const k = Math.min(1, (now - t1) / L), n = Math.floor(fin.length * k);
        el.textContent = fin.slice(0, n) + [...fin.slice(n)].map(c => /\s|—|·/.test(c) ? c : AB[(Math.random() * AB.length) | 0]).join('');
        if (k < 1) requestAnimationFrame(paso); else el.textContent = fin; })(t1); }), { rootMargin: '0px 0px -10% 0px' });
    $$('.at-k').forEach(k => { if (k.children.length || !k.textContent.trim() || k.closest('#acceso,#app')) return; ioK.observe(k); });
  }

  // ================= 4. Números que cuentan =================
  (function () {
    const nums = [];
    $$('.at-num dt, .at-prop .num').forEach(el => { const tn = [...el.childNodes].find(c => c.nodeType === 3 && /\d/.test(c.textContent)); if (!tn) return; const m = tn.textContent.match(/^(\D*)(\d+)(.*)$/); if (!m) return; nums.push({ tn, a: m[1], n: +m[2], z: m[3], el }); });
    if (quieto) return;
    nums.forEach(x => x.tn.textContent = x.a + '0' + x.z);
    const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); const x = nums.find(y => y.el === e.target); if (!x) return; const t1 = performance.now(), L = 1700;
      (function paso(now) { const k = Math.min(1, (now - t1) / L), ez = 1 - Math.pow(2, -10 * k); x.tn.textContent = x.a + Math.round(x.n * (k >= 1 ? 1 : ez)) + x.z; if (k < 1) requestAnimationFrame(paso); })(t1); }), { threshold: .4 });
    nums.forEach(x => io.observe(x.el));
  })();

  // ================= 5. Luz que corre sobre la piedra (como mover una lámpara sobre la placa pulida) =================
  $$('.at-pdd-placa, .at-pd-v, .at-vivo-p').forEach(el => {
    if (el.classList.contains('at-vivo-p')) return;
    const luz = document.createElement('i'); luz.className = 'wow-luz'; luz.setAttribute('aria-hidden', 'true'); el.prepend(luz);
    if (!fino || quieto) return;
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el.style.setProperty('--lx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%'); el.style.setProperty('--ly', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%'); el.classList.add('wow-lamp'); });
    el.addEventListener('pointerleave', () => el.classList.remove('wow-lamp'));
  });

  // ================= 6. Tarjetas con relieve y brillo (solo con mouse) =================
  if (fino && !quieto) {
    $$('.at-card .ph, .at-bs-g article .ph, .at-gc .ph, .at-pro-g figure, .at-dos-c, .at-pdd-mo .pl').forEach(el => {
      const br = document.createElement('i'); br.className = 'wow-br'; br.setAttribute('aria-hidden', 'true'); el.appendChild(br); el.classList.add('wow-tilt');
      let raf = 0;
      el.addEventListener('pointermove', e => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', ((.5 - y) * 7).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((x - .5) * 9).toFixed(2) + 'deg'); el.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--gy', (y * 100).toFixed(1) + '%'); el.classList.add('wow-on'); }); });
      el.addEventListener('pointerleave', () => { el.classList.remove('wow-on'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  // ================= 7. Cursor con palabra =================
  const cur = $('.at-cursor');
  if (cur && fino && !quieto) {
    const tx = document.createElement('span'); cur.appendChild(tx);
    const PAL = [['.at-vivo-3d', 'Gira'], ['#at-pista .ph, #at-gr .ph', 'Arrastra'], ['.at-pd-v', 'Lupa'], ['.at-pro-g figure, .at-dos-c, .at-col-r, .at-pdd-mo', 'Ver']];
    addEventListener('pointermove', e => { const h = PAL.find(([s]) => e.target.closest(s)); cur.classList.toggle('txt', !!h); if (h && tx.textContent !== h[1]) tx.textContent = h[1]; }, { passive: true });
  }

  // ================= 8. Cinta que acelera y se inclina con la velocidad del scroll =================
  (function () {
    const mq = $('.at-marq>div'); if (!mq || quieto) return;
    mq.style.animation = 'none';
    let x = 0, v = 0, ly = scrollY, vis = false, corre = false;
    new IntersectionObserver(es => { vis = es[0].isIntersecting; if (vis && !corre) { corre = true; requestAnimationFrame(paso); } }).observe(mq.parentNode);
    function paso() {
      if (!vis) { corre = false; return; } requestAnimationFrame(paso);
      const dy = scrollY - ly; ly = scrollY; v += (Math.max(-60, Math.min(60, dy)) - v) * .1;
      const w = mq.scrollWidth / 2; x -= .55 + Math.abs(v) * .35; if (x <= -w) x += w;
      mq.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0) skewX(' + (-v * .12).toFixed(2) + 'deg)';
    }
  })();

  // ================= 9. Secciones a sangre que se abren al llegar (con mouse, ligado al scroll; en celular, una sola vez) =================
  (function () {
    const els = $$('.at-full, .at-d3, .at-fin, .at-dos'); if (!els.length || quieto) return;
    els.forEach(e => e.classList.add('wow-abre'));
    if (cel) { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('abierta'); io.unobserve(e.target); } }), { threshold: .15 }); els.forEach(e => io.observe(e)); return; }
    let pide = false;
    const pinta = () => { pide = false; els.forEach(el => { const r = el.getBoundingClientRect(); if (r.bottom < -50 || r.top > innerHeight + 50) return; const k = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * .75))); const e = 1 - Math.pow(1 - k, 3);
      el.style.setProperty('--ab', ((1 - e) * 7).toFixed(2) + '%'); el.style.setProperty('--ar', ((1 - e) * 28).toFixed(1) + 'px'); }); };
    addEventListener('scroll', () => { if (!pide) { pide = true; requestAnimationFrame(pinta); } }, { passive: true }); pinta();
  })();

  // ================= 10. La mesa en vivo (3D real que gira sola) =================
  (function () {
    const sec = $('#en-vivo'), el = $('#at-vivo-3d'); if (!sec || !el) return;
    if (!window.DKAS3D || !window.THREE) { sec.remove(); return; }
    const hoy = (() => { try { const q = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date()).split('-').map(Number); return Math.floor(Date.UTC(q[0], q[1] - 1, q[2]) / 864e5); } catch (e) { return 0; } })();
    let piedra = D.PIEDRAS[hoy % D.PIEDRAS.length].id, mb = $('[data-vm].on'), V = null, visible = false;
    $$('[data-vp]').forEach(b => b.classList.toggle('on', b.dataset.vp === piedra));
    const modelo = () => D.normalizar({ uso: mb.dataset.u, forma: mb.dataset.f, base: mb.dataset.b, L: +mb.dataset.l, W: +mb.dataset.w, piedra });
    function pon() {
      const m = modelo(); el.classList.add('cambia');
      V.mostrar(m); V.acercar(cel ? 0.9 : 0.78);
      Promise.resolve(V.listo && V.listo()).then(() => { el.classList.remove('cambia'); el.classList.add('listo'); });
      const pz = D.PIEDRAS.find(p => p.id === piedra);
      $('#at-vivo-n').textContent = mb.querySelector('b').textContent + ' · ' + (pz ? pz.nombre : '');
      $('#at-vivo-go').href = 'cotiza.html?' + new URLSearchParams({ u: mb.dataset.u, f: mb.dataset.f, p: piedra, b: mb.dataset.b });
      window.DKAS_INT = 'En vivo 3D: ' + $('#at-vivo-n').textContent;
    }
    function crear() {
      if (V) return;
      try { V = DKAS3D.crear(el, { tex: cel ? 'tex/piedras/1k/' : 'tex/piedras/', fondo: 0x151412 }); } catch (e) { sec.remove(); return; }
      V.sillas(false); pon(); V.girar(visible && !quieto ? 0.0024 : 0);
      el.addEventListener('pointerdown', () => sec.classList.add('tocada'), { once: true });
    }
    new IntersectionObserver(es => { if (es[0].isIntersecting) crear(); }, { rootMargin: '600px 0px' }).observe(sec);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (V) V.girar(visible && !quieto ? 0.0024 : 0); }).observe(sec);
    $$('[data-vm]').forEach(b => b.onclick = () => { mb = b; $$('[data-vm]').forEach(x => x.classList.toggle('on', x === b)); if (V) pon(); });
    $$('[data-vp]').forEach(b => b.onclick = () => { piedra = b.dataset.vp; $$('[data-vp]').forEach(x => x.classList.toggle('on', x === b)); if (V) pon(); });
  })();
})();

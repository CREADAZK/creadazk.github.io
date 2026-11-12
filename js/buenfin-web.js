/* DKAS · Buen Fin 2026, página completa (dueño, 2026-11-12: "rediseña totalmente la página, que se sienta el Buen Fin en todos lados;
   que el reloj se mueva en segundos; al acabar regresamos a la página de ahora").
   Todo vive en este archivo: portada nueva con reloj en segundos (la portada normal solo se esconde), ofertas con fotos reales,
   sello en cada sección, botones con -10%, barra fija en el celular, aviso al entrar, banda antes del contacto y en el cotizador.
   WhatsApp sale diciendo "Buen Fin 10%" y cada pedido nuevo lleva la nota del descuento.
   Se apaga SOLO el lunes 16 de noviembre a las 00:00 (CDMX) y la página vuelve a ser la de antes (tag git: pagina-antes-buen-fin).
   Para quitarlo del todo: BUEN_FIN = false en build.js y publicar. */
(function () {
  const FIN = Date.parse('2026-11-16T06:00:00Z'), PCT = 10;
  if (Date.now() >= FIN || /[?&]sinbf\b/.test(location.search)) return;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const WA = (window.DKAS_WA && window.DKAS_WA[0] && window.DKAS_WA[0].num) || '525535977670';
  const enCotiza = /cotiza\.html/.test(location.pathname), enPedido = /pedido\.html/.test(location.pathname), enInicio = !!document.getElementById('portada');
  const css = document.createElement('style');
  css.textContent = `
:root{--bfr:#D7352C;--bfr2:#9e2620;--bfg:#C9A46A;--bfh:38px}
.bf-cinta{position:fixed;top:0;left:0;right:0;height:var(--bfh);z-index:2147483000;background:linear-gradient(90deg,var(--bfr2),var(--bfr) 50%,var(--bfr2));color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;padding:0 10px;font:500 11px/1 'Jost','Segoe UI',sans-serif;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;overflow:hidden}
.bf-cinta b{font-weight:600;letter-spacing:.2em}.bf-cinta .bf-t{font-variant-numeric:tabular-nums;letter-spacing:.06em}.bf-cinta a{color:#fff;border:1px solid rgba(255,255,255,.7);padding:6px 10px;border-radius:3px;text-decoration:none}
.bf-cinta .bf-l,.bf-cinta .bf-w,.bf-cinta a{display:none}
@media(min-width:760px){.bf-cinta{font-size:12.5px;gap:16px;letter-spacing:.14em}.bf-cinta .bf-l,.bf-cinta .bf-w{display:inline}.bf-cinta a{display:inline-block}}
body.bf-on .top{top:var(--bfh)!important}
body.bf-on .menu{padding-top:calc(80px + var(--bfh))}
body.bf-on #portada{display:none!important}
.bf-reloj{display:flex;gap:10px;font-variant-numeric:tabular-nums}
.bf-reloj div{min-width:74px;padding:14px 8px 10px;text-align:center;background:rgba(14,12,10,.55);border:1px solid rgba(239,231,218,.18);backdrop-filter:blur(8px)}
.bf-reloj b{display:block;font:400 44px/1 'Cormorant Garamond',Garamond,serif;color:#fff}.bf-reloj span{display:block;margin-top:7px;font:500 9.5px/1 'Jost',sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#cbbfae}
.bf-reloj div.s b{color:#ff8f86}
.bf-hero h1,.bf-of h2,.bf-c h3,.bf-banda h2,.bf-cz h3,.bf-av h2{letter-spacing:-.005em!important;text-transform:none!important}
.bf-hero .bf-k .lg{display:none}@media(min-width:700px){.bf-hero .bf-k .lg{display:inline}}
@media(min-width:980px){.bf-reloj div{min-width:96px;padding:18px 10px 13px}.bf-reloj b{font-size:58px}}
.bf-hero{position:relative;min-height:100svh;display:flex;align-items:flex-end;overflow:hidden;color:#efe7da;padding:calc(var(--bfh) + 96px) 22px 54px}
.bf-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:60% 50%;transform:scale(1.04);animation:bfz 18s ease-out forwards}
@keyframes bfz{to{transform:scale(1)}}
.bf-hero::before{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(0deg,rgba(12,10,9,.96) 0%,rgba(12,10,9,.72) 38%,rgba(12,10,9,.15) 72%,rgba(12,10,9,.45) 100%)}
@media(min-width:980px){.bf-hero::before{background:linear-gradient(90deg,rgba(12,10,9,.9) 0%,rgba(12,10,9,.55) 45%,rgba(12,10,9,.1) 75%),linear-gradient(0deg,rgba(12,10,9,.92) 0%,rgba(12,10,9,0) 55%)}}
.bf-hero .in{position:relative;z-index:2;width:100%;max-width:1240px;margin:0 auto}
.bf-k{font:500 11.5px/1.4 'Jost',sans-serif;letter-spacing:.42em;text-transform:uppercase;color:var(--bfg)}
.bf-hero h1{font:300 clamp(76px,15vw,200px)/.86 'Cormorant Garamond',Garamond,serif;letter-spacing:-.015em;margin:18px 0 0}.bf-hero h1 span{color:var(--bfr)}.bf-hero h1 em{color:var(--bfg)}
.bf-pct{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin:22px 0 26px}.bf-pct b{font:500 clamp(54px,9vw,96px)/1 'Cormorant Garamond',serif;color:#fff}.bf-pct span{font:400 clamp(20px,2.6vw,28px)/1.25 'Cormorant Garamond',serif;font-style:italic;color:#ddd2c2}
.bf-bot{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.bf-btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 26px;border-radius:40px;font:500 13px/1 'Jost',sans-serif;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;border:1px solid rgba(239,231,218,.35);color:#efe7da;background:transparent;cursor:pointer}
.bf-btn.r{background:var(--bfr);border-color:var(--bfr);color:#fff}.bf-btn.r:hover{background:#e8443a}
.bf-fin{margin-top:16px;font:400 12.5px/1.4 'Jost',sans-serif;letter-spacing:.06em;color:#b7ab9b}
@media(min-width:980px){.bf-hero{padding:0 6vw 80px}.bf-hero .row{display:flex;justify-content:space-between;align-items:flex-end;gap:40px}}
.bf-of{background:#0e0c0a;color:#efe7da;padding:80px 20px 90px}
.bf-of .in{max-width:1240px;margin:0 auto}
.bf-of h2{font:300 clamp(46px,7vw,84px)/.95 'Cormorant Garamond',serif;margin:14px 0 0}.bf-of h2 em{color:var(--bfg)}.bf-of h2 span{color:var(--bfr)}
.bf-of .sub{font:300 16px/1.6 'Jost',sans-serif;color:#a99f92;max-width:560px;margin-top:16px}
.bf-g{display:grid;grid-template-columns:1fr;gap:18px;margin-top:40px}
@media(min-width:700px){.bf-g{grid-template-columns:1fr 1fr}}
@media(min-width:1080px){.bf-g{grid-template-columns:repeat(3,1fr)}.bf-g .x2{grid-column:span 2}}
.bf-c{position:relative;background:#15120f;border:1px solid rgba(239,231,218,.08);overflow:hidden}
.bf-c .ph{position:relative;aspect-ratio:3/2;overflow:hidden}
.bf-c img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s}.bf-c:hover img{transform:scale(1.03)}
.bf-c .tg{position:absolute;left:14px;top:14px;background:var(--bfr);color:#fff;font:600 12px/1 'Jost',sans-serif;letter-spacing:.14em;padding:8px 10px 7px}
.bf-c .tx{padding:20px 20px 22px}
@media(min-width:1080px){.bf-c.x2 .ph{aspect-ratio:auto;height:100%;min-height:420px}.bf-c.x2 .tx{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,rgba(10,9,8,.92),rgba(10,9,8,0));padding-top:90px}}
.bf-c .p{font:500 10.5px/1 'Jost',sans-serif;letter-spacing:.3em;text-transform:uppercase;color:var(--bfg)}
.bf-c h3{font:400 30px/1.05 'Cormorant Garamond',serif;margin:10px 0 0;color:#fff}.bf-c .m{font:400 13px/1.5 'Jost',sans-serif;color:#a99f92;margin-top:6px}
.bf-c .b{display:flex;gap:16px;margin-top:16px}.bf-c .b a{font:500 12px/1 'Jost',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#efe7da;text-decoration:none;border-bottom:1px solid rgba(239,231,218,.35);padding-bottom:5px}.bf-c .b a.r{color:#ff8f86;border-color:#ff8f86}
.bf-chip{display:inline-flex;align-items:center;gap:6px;margin-right:12px;vertical-align:middle;background:var(--bfr);color:#fff!important;font:600 10px/1 'Jost',sans-serif!important;letter-spacing:.18em!important;text-transform:uppercase;padding:6px 8px 5px;border-radius:2px}
.bf-banda{position:relative;overflow:hidden;color:#efe7da;padding:70px 22px;text-align:center;background:#0e0c0a}
.bf-banda>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.35}
.bf-banda .in{position:relative;max-width:820px;margin:0 auto;display:flex;flex-direction:column;align-items:center}
.bf-banda h2{font:300 clamp(44px,7vw,80px)/.95 'Cormorant Garamond',serif;margin:14px 0 22px}.bf-banda h2 span{color:var(--bfr)}.bf-banda h2 em{color:var(--bfg)}
.bf-banda .bf-bot{justify-content:center}
.bf-pie{position:fixed;left:0;right:0;bottom:0;z-index:2147482999;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(14,12,10,.95);backdrop-filter:blur(10px);border-top:1px solid rgba(215,53,44,.6);color:#efe7da;font:500 11px/1.3 'Jost',sans-serif;letter-spacing:.08em;text-transform:uppercase}
.bf-pie b{color:#ff8f86;font-variant-numeric:tabular-nums;letter-spacing:.04em}.bf-pie a{background:var(--bfr);color:#fff;text-decoration:none;padding:12px 14px;border-radius:30px;white-space:nowrap;letter-spacing:.12em}
@media(min-width:900px){.bf-pie{display:none}}
body.bf-on{padding-bottom:64px}@media(min-width:900px){body.bf-on{padding-bottom:0}}
.bf-cz{max-width:1100px;margin:calc(var(--bfh) + 70px) 16px 0;padding:18px 20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;border:1px solid rgba(215,53,44,.55);background:linear-gradient(90deg,rgba(215,53,44,.14),rgba(215,53,44,.04));color:#efe7da}
@media(min-width:1140px){.bf-cz{margin-left:auto;margin-right:auto}}
.bf-cz h3{font:300 34px/1 'Cormorant Garamond',serif;margin:0}.bf-cz h3 span{color:var(--bfr)}.bf-cz p{font:400 13px/1.4 'Jost',sans-serif;color:#cbbfae;margin:6px 0 0}
.bf-cz .bf-reloj div{min-width:56px;padding:10px 6px 8px}.bf-cz .bf-reloj b{font-size:30px}.bf-cz .bf-reloj span{font-size:8.5px}
.bf-av{position:fixed;inset:0;z-index:2147483001;background:rgba(8,7,6,.74);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .35s}
.bf-av.on{opacity:1}
.bf-av .c{position:relative;width:min(460px,100%);background:#0e0c0b;color:#efe7da;border:1px solid rgba(201,164,106,.35);border-radius:6px;overflow:hidden;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.bf-av .f{height:170px;background:center/cover}.bf-av .t2{padding:24px 24px 26px}
.bf-av .x{position:absolute;right:8px;top:6px;background:rgba(0,0,0,.35);border:0;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:6px 10px;border-radius:50%}
.bf-av h2{font:300 54px/.95 'Cormorant Garamond',Garamond,serif;margin:12px 0 0}.bf-av h2 span{color:var(--bfr)}.bf-av h2 em{color:var(--bfg)}
.bf-av .p{font:600 46px/1 'Cormorant Garamond',serif;color:#fff;margin:12px 0 4px}.bf-av .p small{display:block;font:400 12px/1.4 'Jost',sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#d6ccbd;margin-top:6px}
.bf-av .bf-reloj{justify-content:center;margin:18px 0 0}.bf-av .bf-reloj div{min-width:62px;padding:10px 4px 8px}.bf-av .bf-reloj b{font-size:32px}
.bf-av .b{display:flex;flex-direction:column;gap:10px;margin-top:22px}
.bf-av .b a{display:block;padding:15px;border-radius:3px;font:500 13px/1 'Jost',sans-serif;letter-spacing:.12em;text-transform:uppercase;text-decoration:none}
.bf-av .b a.r{background:var(--bfr);color:#fff}.bf-av .b a.s{border:1px solid rgba(239,231,218,.25);color:#efe7da}`;
  document.head.appendChild(css);

  // ---------- reloj en segundos ----------
  const partes = () => { const s = Math.max(0, Math.floor((FIN - Date.now()) / 1000)); return [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60]; };
  const dos = n => String(n).padStart(2, '0');
  const corto = () => { const [d, h, m, s] = partes(); return (d ? d + 'd ' : '') + dos(h) + ':' + dos(m) + ':' + dos(s); };
  const reloj = () => '<div class="bf-reloj">' + [['d', 'Días'], ['h', 'Horas'], ['m', 'Min'], ['s', 'Seg']].map(([k, t]) => '<div class="' + k + '"><b data-r="' + k + '">00</b><span>' + t + '</span></div>').join('') + '</div>';
  function tic() {
    if (Date.now() >= FIN) { location.reload(); return; }
    const [d, h, m, s] = partes(), v = { d, h, m, s };
    $$('[data-r]').forEach(e => { const t = dos(v[e.dataset.r]); if (e.textContent !== t) e.textContent = t; });
    $$('.bf-t').forEach(e => { e.textContent = corto(); });
  }
  const wa = t => 'https://wa.me/' + WA + '?text=' + encodeURIComponent(t + ' (Vengo por el Buen Fin, ' + PCT + '% de descuento.)');
  const cotiza = enCotiza ? '#' : 'cotiza.html';

  // escenas reales para la portada y las ofertas
  const ESC = [['maestra', 'Mesa Maestra', 'Bulgaria Dark Grey', '2.80 × 1.00 m · Base Maestra, nuestra insignia', 1], ['terraza', 'Terraza', 'Taj Mahal', '3.00 × 1.50 m · Base U de PTR'],
    ['cruzada', 'Cruzada', 'Mont Blanc', '2.50 × 1.00 m · Base X'], ['doble', 'Doble altura', 'Bulgaria Dark Grey', '2.80 m · Base T doble', 1], ['boveda', 'Bajo la bóveda', 'Taj Mahal', 'Ovalada · Base T doble'],
    ['patio', 'El patio', 'Cardenaskin', 'Esquinas redondeadas · Base marco'], ['copas', 'Entre las copas', 'Statuario', 'Para ocho · Cuatro patas'], ['cuatro', 'Para cuatro', 'Mont Blanc', 'Cuadrada · Cuatro patas'], ['fuente', 'Junto a la fuente', 'Limestone', 'Redonda · Pedestal']];

  function montar() {
    document.body.classList.add('bf-on');
    const c = document.createElement('div'); c.className = 'bf-cinta';
    c.innerHTML = '<b>Buen Fin 2026</b><span>-' + PCT + '%<span class="bf-l"> en todas nuestras mesas</span></span><span><span class="bf-w">Termina en </span><span class="bf-t"></span></span>' + (enCotiza ? '' : '<a href="cotiza.html">Cotizar</a>');
    document.body.prepend(c);

    if (enInicio) {
      // portada Buen Fin (la normal queda escondida)
      const h = document.createElement('section'); h.className = 'bf-hero'; h.id = 'buen-fin';
      h.innerHTML = '<img src="img/bf/maestra.jpg" srcset="img/bf/maestra-m.jpg 760w, img/bf/maestra.jpg 1600w" sizes="100vw" alt="Mesa Maestra DKAS en Bulgaria Dark Grey" fetchpriority="high">'
        + '<div class="in"><div class="bf-k">Solo este fin de semana<span class="lg"> · Edición especial</span></div><h1><span>Buen Fin</span> <em>2026</em></h1>'
        + '<div class="row"><div><div class="bf-pct"><b>-' + PCT + '%</b><span>en todas nuestras mesas<br>de piedra sinterizada, hechas a tu medida.</span></div>'
        + '<div class="bf-bot"><a class="bf-btn r" href="' + cotiza + '">Cotiza con ' + PCT + '% de descuento</a><a class="bf-btn" href="#ofertas-bf">Ver las mesas</a></div></div>'
        + '<div><div class="bf-k" style="margin:30px 0 12px">Termina en</div>' + reloj() + '<div class="bf-fin">Hasta el domingo 15 de noviembre a las 11:59 p. m.</div></div></div></div>';
      const p = $('#portada'); p.parentNode.insertBefore(h, p);
      // ofertas con fotos reales
      const o = document.createElement('section'); o.className = 'bf-of'; o.id = 'ofertas-bf';
      o.innerHTML = '<div class="in"><div class="bf-k"><span class="bf-chip">-' + PCT + '%</span>Ofertas del Buen Fin</div><h2><span>Buen Fin</span> en <em>cada mesa.</em></h2>'
        + '<p class="sub">El descuento aplica a cualquier mesa DKAS: estas o la que armes a tu medida, en la piedra y la base que tú escojas.</p><div class="bf-g">'
        + ESC.map(([k, t, pi, m, x2]) => '<article class="bf-c' + (x2 ? ' x2' : '') + '"><div class="ph"><img loading="lazy" src="img/bf/' + k + (x2 ? '' : '-m') + '.jpg" alt="' + t + ' · mesa DKAS en ' + pi + '"><span class="tg">-' + PCT + '% Buen Fin</span></div>'
          + '<div class="tx"><div class="p">' + pi + '</div><h3>' + t + '</h3><div class="m">' + m + '</div><div class="b"><a class="r" href="' + wa('Hola DKAS, me interesa una mesa como «' + t + '» (' + pi + ').') + '" target="_blank" rel="noopener">La quiero</a><a href="' + cotiza + '">Cotizar a mi medida</a></div></div></article>').join('')
        + '</div></div>';
      h.parentNode.insertBefore(o, h.nextSibling);
      // banda antes del contacto
      const fin = $('#contacto');
      if (fin) { const b = document.createElement('section'); b.className = 'bf-banda';
        b.innerHTML = '<img src="img/bf/doble-m.jpg" alt="" loading="lazy"><div class="in"><div class="bf-k">Última llamada</div><h2>Aparta tu mesa <span>este Buen Fin</span></h2>' + reloj()
          + '<div class="bf-bot"><a class="bf-btn r" href="' + cotiza + '">Cotiza con ' + PCT + '%</a><a class="bf-btn" href="' + wa('Hola DKAS, quiero apartar una mesa.') + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a></div>'
          + '<div class="bf-fin">' + PCT + '% sobre el precio de cotización de cualquier mesa apartada con anticipo hasta el domingo 15 de noviembre de 2026.</div></div>';
        fin.parentNode.insertBefore(b, fin); }
      // el Buen Fin en cada sección y en cada botón
      $$('section').forEach(s => { if (s.closest('#portada') || /bf-/.test(s.className)) return;
        const e = s.querySelector('.et'); if (e && !e.querySelector('.bf-chip')) e.insertAdjacentHTML('afterbegin', '<span class="bf-chip">Buen Fin -' + PCT + '%</span>'); });
      $$('button[data-modelo], button[data-piedra], .lnk-g[data-v], button[data-v]').forEach(b => { if (/-\d+%/.test(b.textContent)) return; const sp = b.querySelector('span:last-child'); const t = document.createTextNode(' · -' + PCT + '%'); if (sp && sp.textContent.trim() === '→') b.insertBefore(t, sp); else b.appendChild(t); });
      $$('a.btn.oro[href="cotiza.html"]').forEach(a => { if (!a.closest('.top')) a.textContent = 'Cotiza con ' + PCT + '% de descuento'; });
      const cot = $('.top .cot'); if (cot) cot.textContent = 'Cotizar -' + PCT + '%';
    }
    if (enCotiza) {
      const box = document.createElement('div'); box.className = 'bf-cz';
      box.innerHTML = '<div><h3><span>Buen Fin</span> · -' + PCT + '%</h3><p>Tu cotización llega con el ' + PCT + '% ya aplicado.</p></div>' + reloj();
      const top = $('header.top'); if (top) top.parentNode.insertBefore(box, top.nextSibling); else document.body.appendChild(box);
    }
    if (!enCotiza) { const pie = document.createElement('div'); pie.className = 'bf-pie';
      pie.innerHTML = '<div>Buen Fin -' + PCT + '%<br><b class="bf-t"></b></div><a href="cotiza.html">Cotizar con ' + PCT + '%</a>'; document.body.appendChild(pie); }
    tic(); setInterval(tic, 1000);
    let visto = false; try { visto = sessionStorage.getItem('dkas-bf') === '1'; } catch (e) {}
    if (!visto && !enPedido) setTimeout(aviso, 1200);
  }
  function aviso() {
    try { sessionStorage.setItem('dkas-bf', '1'); } catch (e) {}
    const v = document.createElement('div'); v.className = 'bf-av'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
    v.innerHTML = '<div class="c"><button class="x" aria-label="Cerrar">×</button><div class="f" style="background-image:url(img/bf/maestra-m.jpg)"></div><div class="t2"><p class="bf-k">Solo este fin de semana</p><h2><span>Buen Fin</span> <em>2026</em></h2>'
      + '<p class="p">-' + PCT + '%<small>en todas nuestras mesas</small></p>' + reloj()
      + '<div class="b"><a class="r" href="' + (enCotiza ? '#' : 'cotiza.html') + '" data-cerrar>Cotiza con ' + PCT + '% de descuento</a><a class="s" href="#" data-cerrar>Ver las mesas</a></div></div></div>';
    document.body.appendChild(v); tic(); requestAnimationFrame(() => v.classList.add('on'));
    const cerrar = () => { v.classList.remove('on'); setTimeout(() => v.remove(), 350); };
    v.addEventListener('click', e => { if (e.target === v || e.target.closest('.x')) return cerrar(); const a = e.target.closest('[data-cerrar]'); if (a) { if (a.getAttribute('href') === '#') e.preventDefault(); cerrar(); } });
  }

  // WhatsApp: el mensaje sale diciendo que viene por el Buen Fin
  const conBF = u => { try { const x = new URL(u, location.href); if (!/^(wa\.me|api\.whatsapp\.com)$/.test(x.hostname)) return u; const t = (x.searchParams.get('text') || '').trim(); if (/Buen Fin/.test(t)) return u;
    const otros = [...x.searchParams].filter(([k]) => k !== 'text').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v));
    return x.origin + x.pathname + '?' + otros.concat('text=' + encodeURIComponent((t || 'Hola DKAS, me interesa una mesa.') + ' (Vengo por el Buen Fin, ' + PCT + '% de descuento.)')).join('&'); } catch (e) { return u; } };
  const fijar = a => { const n = conBF(a.href); if (n !== a.href) a.href = n; };
  const todosWA = () => document.querySelectorAll('a[href*="wa.me"], a[href*="api.whatsapp.com"]').forEach(fijar);
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'attributes' && m.target.matches && m.target.matches('a[href*="wa.me"]')) fijar(m.target); else if (m.addedNodes.length) todosWA(); } }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
  document.addEventListener('DOMContentLoaded', todosWA);
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"]'); if (a) a.href = conBF(a.href); }, true);
  const abrir0 = window.open; window.open = function (u, ...r) { return abrir0.call(window, typeof u === 'string' ? conBF(u) : u, ...r); };

  // cada pedido nuevo lleva la nota del descuento (la ve el taller en el panel)
  const A = window.DAZK_API;
  if (A && A.crearPedido && !A.crearPedido.bf) {
    const c0 = A.crearPedido.bind(A);
    A.crearPedido = function (p, staff) { if (!staff && p) p = Object.assign({}, p, { notas: ('Buen Fin 2026: ' + PCT + '% de descuento. ' + (p.notas || '')).trim().slice(0, 1000) }); return c0(p, staff); };
    A.crearPedido.bf = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();

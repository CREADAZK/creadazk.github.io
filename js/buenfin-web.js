/* DKAS · Buen Fin 2026 en toda la página pública (dueño, 2026-11-12: "10% de descuento… solo por este fin de semana, luego lo quitamos").
   Un solo archivo: cinta roja con cuenta regresiva, sello -10% en las portadas, etiqueta -10% en cada foto de mesa, aviso al entrar,
   los WhatsApp salen diciendo "Buen Fin 10%" y cada pedido nuevo lleva la nota del descuento para el panel.
   Se apaga SOLO el lunes 16 de noviembre a las 00:00 (hora de CDMX). Para quitarlo del todo: BUEN_FIN = false en build.js y publicar. */
(function () {
  const FIN = Date.parse('2026-11-16T06:00:00Z'), PCT = 10;
  if (Date.now() >= FIN || /[?&]sinbf\b/.test(location.search)) return;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const css = document.createElement('style');
  css.textContent = `
:root{--bfr:#E5332A;--bfh:38px}
.bf-cinta{position:fixed;top:0;left:0;right:0;height:var(--bfh);z-index:2147483000;background:linear-gradient(90deg,#9e2620,#C8312A 50%,#9e2620);color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;padding:0 10px;font:500 11px/1 'Jost','Segoe UI',sans-serif;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;overflow:hidden}
.bf-cinta b{font-weight:600;letter-spacing:.2em}.bf-cinta .bf-t{font-variant-numeric:tabular-nums;opacity:.92}.bf-cinta a{color:#fff;border:1px solid rgba(255,255,255,.7);padding:6px 10px;border-radius:3px;text-decoration:none}
.bf-cinta .bf-l,.bf-cinta .bf-w,.bf-cinta a{display:none}
@media(min-width:760px){.bf-cinta{font-size:12.5px;gap:16px;letter-spacing:.14em}.bf-cinta .bf-l,.bf-cinta .bf-w{display:inline}.bf-cinta a{display:inline-block}}
body.bf-on .top{top:var(--bfh)!important}body.bf-on{padding-top:0}
body.bf-on .menu{padding-top:calc(80px + var(--bfh))}
body.bf-on .hero,body.bf-on .pv,body.bf-on .acceso.pag,body.bf-on .cz-top{scroll-margin-top:var(--bfh)}
.bf-sello{position:absolute!important;z-index:6;left:auto!important;bottom:auto!important;margin:0!important;right:20px;top:calc(var(--bfh) + 78px);padding:14px 16px 12px;background:rgba(14,12,10,.72);backdrop-filter:blur(8px);border:1px solid rgba(229,51,42,.7);color:#fff;display:flex;flex-direction:column;align-items:center;pointer-events:none;text-align:center}
.bf-sello b{font:500 34px/1 'Cormorant Garamond',Garamond,serif}.bf-sello small{font:500 9.5px/1.3 'Jost',sans-serif;letter-spacing:.26em;text-transform:uppercase;margin-top:6px;color:#f0b9b3}
@media(min-width:980px){.bf-sello{right:5vw;top:calc(var(--bfh) + 120px);padding:20px 24px 16px}.bf-sello b{font-size:48px}.bf-sello small{font-size:11px}}
.bf-tag{position:absolute;z-index:3;left:12px;top:12px;background:var(--bfr);color:#fff;font:600 12px/1 'Jost',sans-serif;letter-spacing:.12em;padding:7px 9px 6px;border-radius:2px;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.bf-tag i{font-style:normal;font-weight:400;opacity:.9;margin-left:6px;letter-spacing:.18em;font-size:10px}
.bf-pos{position:relative}
.bf-av{position:fixed;inset:0;z-index:2147483001;background:rgba(8,7,6,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .35s}
.bf-av.on{opacity:1}
.bf-av .c{position:relative;width:min(440px,100%);background:#0e0c0b;color:#efe7da;border:1px solid rgba(201,164,106,.35);border-radius:6px;padding:40px 30px 30px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.bf-av .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#bfb4a6;font-size:28px;line-height:1;cursor:pointer;padding:6px}
.bf-av .k{font:500 11px/1 'Jost',sans-serif;letter-spacing:.42em;text-transform:uppercase;color:#C9A46A}
.bf-av h2{font:300 58px/.95 'Cormorant Garamond',Garamond,serif;margin:16px 0 0}.bf-av h2 span{color:var(--bfr)}.bf-av h2 em{color:#C9A46A}
.bf-av .p{font:600 64px/1 'Cormorant Garamond',serif;color:#fff;margin:18px 0 0}.bf-av .p small{display:block;font:400 13px/1.4 'Jost',sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#d6ccbd;margin-top:8px}
.bf-av .l{width:60px;height:1px;background:#C9A46A;margin:22px auto}
.bf-av .d{font:400 19px/1.4 'Cormorant Garamond',serif;font-style:italic;color:#d6ccbd}
.bf-av .t{font:500 12px/1 'Jost',sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#fff;background:rgba(229,51,42,.16);border:1px solid rgba(229,51,42,.5);display:inline-block;padding:9px 12px;margin-top:20px;font-variant-numeric:tabular-nums}
.bf-av .b{display:flex;flex-direction:column;gap:10px;margin-top:24px}
.bf-av .b a{display:block;padding:15px;border-radius:3px;font:500 14px/1 'Jost',sans-serif;letter-spacing:.08em;text-decoration:none}
.bf-av .b a.r{background:var(--bfr);color:#fff}.bf-av .b a.s{border:1px solid rgba(239,231,218,.25);color:#efe7da}`;
  document.head.appendChild(css);

  // cuenta regresiva
  const falta = () => { const s = Math.max(0, Math.floor((FIN - Date.now()) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return (d ? d + 'd ' : '') + String(h).padStart(2, '0') + 'h ' + String(m).padStart(2, '0') + 'm'; };
  const enCotiza = /cotiza\.html/.test(location.pathname), enPedido = /pedido\.html/.test(location.pathname);

  function montar() {
    document.body.classList.add('bf-on');
    const c = document.createElement('div'); c.className = 'bf-cinta';
    c.innerHTML = '<b>Buen Fin 2026</b><span>-' + PCT + '% de descuento<span class="bf-l"> en todas nuestras mesas</span></span><span><span class="bf-w">Termina en </span><span class="bf-t">' + falta() + '</span></span>' + (enCotiza ? '' : '<a href="cotiza.html">Cotizar</a>');
    document.body.prepend(c);
    setInterval(() => { if (Date.now() >= FIN) { location.reload(); return; } const t = c.querySelector('.bf-t'); if (t) t.textContent = falta(); }, 30000);

    // sello en las portadas y botones principales
    $$('.hero, .pv').forEach(s => { if (s.querySelector('.bf-sello')) return; const d = document.createElement('aside'); d.className = 'bf-sello'; d.innerHTML = '<b>-' + PCT + '%</b><small>Buen Fin 2026</small><small style="margin-top:3px;color:#d8cdbd">en todas las mesas</small>'; s.appendChild(d); });
    $$('.hero .btn.oro, .pv .btn.oro').forEach(b => { if (/cotiza/.test(b.getAttribute('href') || '')) b.textContent = 'Cotiza con ' + PCT + '% de descuento'; });


    // aviso una vez por visita (no en el pedido del cliente)
    let visto = false; try { visto = sessionStorage.getItem('dkas-bf') === '1'; } catch (e) {}
    if (!visto && !enPedido) setTimeout(aviso, 900);
  }
  function aviso() {
    try { sessionStorage.setItem('dkas-bf', '1'); } catch (e) {}
    const v = document.createElement('div'); v.className = 'bf-av'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
    v.innerHTML = '<div class="c"><button class="x" aria-label="Cerrar">×</button><p class="k">Solo este fin de semana</p><h2><span>Buen Fin</span> <em>2026</em></h2>'
      + '<p class="p">-' + PCT + '%<small>en todas nuestras mesas</small></p><div class="l"></div>'
      + '<p class="d">Piedra sinterizada de 12 mm y acero de nuestro taller, hecha a la medida de tu casa.</p>'
      + '<span class="t">Termina en ' + falta() + '</span>'
      + '<div class="b"><a class="r" href="' + (enCotiza ? '#' : 'cotiza.html') + '" data-cerrar>Cotiza con ' + PCT + '% de descuento</a><a class="s" href="#" data-cerrar>Ver las mesas</a></div></div>';
    document.body.appendChild(v); requestAnimationFrame(() => v.classList.add('on'));
    const cerrar = () => { v.classList.remove('on'); setTimeout(() => v.remove(), 350); };
    v.addEventListener('click', e => { if (e.target === v || e.target.closest('.x')) return cerrar(); const a = e.target.closest('[data-cerrar]'); if (a) { if (a.getAttribute('href') === '#') e.preventDefault(); cerrar(); } });
  }

  // WhatsApp: el mensaje sale diciendo que viene por el Buen Fin
  const conBF = u => { try { const x = new URL(u, location.href); if (!/^(wa.me|api.whatsapp.com)$/.test(x.hostname)) return u; const t = (x.searchParams.get('text') || '').trim(); if (/Buen Fin/.test(t)) return u;
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

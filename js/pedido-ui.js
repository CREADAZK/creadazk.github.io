/* DKAS · lo que ve el cliente en su link (pedido.html#t=<token>): cómo va su mesa, su cotización con croquis, y aceptarla. */
(function () {
  const D = window.DKAS, A = window.DAZK_API, CQ = window.DKAS_CQ, WA = window.DKAS_WA;
  const $ = s => document.querySelector(s), esc = A.esc, main = $('#m');
  const pesos = n => '$' + Math.round(+n || 0).toLocaleString('es-MX');
  const PASOS = [['nuevo', 'Recibido'], ['cotizado', 'Cotizado'], ['confirmado', 'Confirmado'], ['fabricacion', 'En taller'], ['listo', 'Lista'], ['entregado', 'Entregada']];
  const token = () => (location.hash.match(/t=([0-9a-f]{16,64})/) || [])[1];
  const deCodigo = s => { const p = String(s || '').split('.'); return p.length === 6 ? D.normalizar({ uso: p[0], forma: p[1], L: +p[2], W: +p[3], base: p[4], piedra: p[5] }) : null; };

  async function pintar() {
    const t = token();
    if (!t) return mios();
    let p;
    try { p = await A.verPedido(t); } catch (e) { main.innerHTML = '<div class="tt"><p class="et">Tu pedido</p><h2>No lo <em>encontramos.</em></h2></div><p class="sub">' + esc(e.message) + '</p><a class="btn oro" href="./">Diseñar una mesa</a>'; return; }
    const it = (p.items || [])[0] || {}, sp = Object.fromEntries((it.specs || []).map(x => [x[0], x[1]]));
    const c = p.cotizacion, m = deCodigo(c && c.mesa) || deCodigo(sp['Código']);
    const i = Math.max(0, PASOS.findIndex(x => x[0] === p.estado));
    const foto = await A.verFoto(t).catch(() => null);
    const wa = WA[0].num, txt = 'Hola DKAS, te escribo por mi pedido #' + p.folio;
    main.innerHTML = '<div class="tt"><p class="et">Pedido #' + p.folio + '</p><h2>Hola, <em>' + esc(p.nombre.split(' ')[0]) + '.</em></h2></div>'
      + (p.estado === 'cancelado' ? '<p class="sub">Este pedido está cancelado.</p>' : '<ol class="linea">' + PASOS.map((x, k) => '<li class="' + (k < i ? 'hecho' : k === i ? 'on' : '') + '"><span></span>' + x[1] + '</li>').join('') + '</ol>')
      + (foto ? '<img class="foto" src="' + foto + '" alt="Tu mesa">' : '')
      + '<ul class="res">' + (m ? D.resumen(m) : (it.specs || []).filter(x => x[0] !== 'Código')).map(([k, v]) => '<li><span>' + esc(k) + '</span><b>' + esc(v) + '</b></li>').join('') + '</ul>'
      + (c ? '<section class="coti"><p class="et">Tu cotización</p><div class="cifras"><div><span>Total</span><b>' + pesos(c.total) + '</b></div>'
        + (c.anticipo ? '<div><span>Anticipo para empezar</span><b>' + pesos(c.anticipo) + '</b></div>' : '') + '</div>'
        + (c.condiciones ? '<p class="sub">' + esc(c.condiciones) + '</p>' : '')
        + (c.aceptada ? '<p class="ok">✓ Aceptaste esta cotización el ' + A.fecha(c.aceptada) + '.</p>' : '<button class="btn oro grande" id="acepto">Acepto la cotización</button>')
        + (m ? '<p class="et" style="margin-top:28px">Croquis de tu mesa</p><div class="croquis">' + CQ.svg(m, { folio: p.folio, cliente: p.nombre }) + '</div>' : '') + '</section>'
        : '<p class="sub espera">Estamos revisando tu diseño. Te mandamos la cotización por WhatsApp.</p>')
      + '<a class="btn grande" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(txt) + '">Escribirnos por WhatsApp</a>';
    const b = $('#acepto');
    if (b) b.onclick = async () => { b.disabled = true; b.textContent = 'Guardando…'; try { await A.aceptarCotizacion(p); pintar(); } catch (e) { b.disabled = false; b.textContent = 'Acepto la cotización'; alert(e.message); } };
  }
  function mios() {
    const l = A.load('dazk-pedidos', []);
    main.innerHTML = '<div class="tt"><p class="et">Tus pedidos</p><h2>Mis <em>mesas.</em></h2></div>'
      + (l.length ? '<ul class="res">' + l.map(x => '<li><a href="#t=' + x.token + '">Pedido #' + x.folio + '</a><b>' + new Date(x.fecha).toLocaleDateString('es-MX') + '</b></li>').join('') + '</ul>' : '<p class="sub">En este celular no hay pedidos. Abre el link que te mandamos por WhatsApp.</p>')
      + '<a class="btn oro grande" href="./">Diseñar una mesa</a>';
  }
  addEventListener('hashchange', pintar);
  // si la mesa lleva una base diseñada en el taller, primero se conoce esa base
  A.basesPublicas().then(bs => Object.entries(bs || {}).forEach(([id, b]) => D.registrarBase(id, b))).catch(() => {}).then(pintar);
})();

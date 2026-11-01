/* DKAS · Cotiza tu mesa en 1 minuto: sin solicitud, sin 3D. El cliente toca opciones con fotos y deja su WhatsApp; llega al panel como pedido nuevo.
   Nunca muestra precios: la cotización la manda el taller por WhatsApp.
   Entradas: ?m=<modelo> (catálogo), ?p=&u=&f=&b=&t= ("Quiero una así" de una foto), ?n=<nombre>&w=<whatsapp> (link mandado desde el panel). */
(function () {
  const D = window.DKAS, A = window.DAZK_API, WA = window.DKAS_WA, SITE = 'https://dkas.mx/';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], esc = A.esc;
  const q = new URLSearchParams(location.search), yo = A.load('dazk-yo', {});
  const nomQ = (q.get('n') || '').trim().slice(0, 60), telQ = (q.get('w') || '').replace(/\D/g, '').slice(0, 13);
  try { const c = q.get('c'), ref = document.referrer ? new URL(document.referrer).hostname : ''; if (!A.load('dazk-canal', '')) A.save('dazk-canal', A.canal(c || (nomQ ? 'whatsapp' : !ref || ref === location.hostname ? 'directo' : ref)) || 'directo'); } catch (e) {}

  const box = $('#cz'), res = $('#cz-res');
  let m = null, ruta = [], i = 0, origen = '', ayuda = false, enviado = null;
  const tamano = (uso, forma, n) => { const o = D.opcionesPersonas(uso, forma); return o.length ? D.tamanoPara(uso, forma, n && o.includes(n) ? n : o[Math.floor(o.length / 2)]) : (() => { const l = D.limites(uso, forma, 0).L; return { L: Math.round((l[0] + l[1]) / 20) * 10, W: null }; })(); };
  const nueva = (uso, forma) => D.normalizar(Object.assign({ uso, forma, base: D.basesPara({ uso, forma, L: 200, W: 100 })[0] || 'patas', piedra: 'statuario' }, tamano(uso, forma, uso === 'comedor' ? 8 : 4)));

  // ---------- de dónde viene ----------
  const mod = D.MODELOS.find(x => x.id === q.get('m'));
  if (mod) { m = D.normalizar(Object.assign({}, mod, { modelo: mod.id })); origen = 'Modelo ' + mod.nombre; ruta = ['personas', 'piedra', 'base', 'datos']; }
  else if (q.get('u') && D.USOS[q.get('u')]) {
    const u = q.get('u'), f = D.formasDe(u).includes(q.get('f')) ? q.get('f') : D.formasDe(u)[0];
    m = D.normalizar(Object.assign({ uso: u, forma: f, base: q.get('b') || 'patas', piedra: D.PIEDRAS.some(p => p.id === q.get('p')) ? q.get('p') : 'statuario' }, tamano(u, f, u === 'comedor' ? 8 : 4)));
    origen = 'Quiero una así: ' + (q.get('t') || 'foto de la página').slice(0, 60); ruta = ['personas', 'piedra', 'base', 'datos'];
  } else ruta = ['inicio', 'uso', 'personas', 'forma', 'piedra', 'base', 'datos'];

  const svgForma = f => '<svg viewBox="0 0 64 64" class="ico">' + { rect: '<rect x="6" y="16" width="52" height="32" rx="1.5"/>', ovcuad: '<rect x="6" y="16" width="52" height="32" rx="12"/>', oval: '<ellipse cx="32" cy="32" rx="27" ry="16"/>', square: '<rect x="14" y="14" width="36" height="36" rx="1.5"/>', round: '<circle cx="32" cy="32" r="19"/>' }[f] + '</svg>';
  const USO_TXT = { comedor: ['Comedor', 'Para comer en casa'], centro: ['Mesa de centro', 'Para la sala'], periquera: ['Barra o periquera', 'Alta, para cocina o terraza'] };
  const tit = (et, h, sub) => '<p class="et">' + et + '</p><h1>' + h + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '');
  const sig = (txt) => '<button class="btn oro cz-sig" data-sig>' + (txt || 'Siguiente') + ' →</button>';

  // ---------- cada pantalla ----------
  const PANTALLA = {
    inicio: () => tit('Cotiza en 1 minuto', (nomQ ? 'Hola ' + esc(nomQ.split(' ')[0]) + ', ¿te gusta <em>alguna?</em>' : '¿Te gusta <em>alguna?</em>'), 'Tócala y la ajustamos a tu medida. Si no, escoge tú en 5 toques.')
      + '<div class="cz-mod">' + D.MODELOS.map(x => '<button data-mod="' + x.id + '"><img src="img/modelos/' + x.id + '.jpg" alt="" loading="lazy"><b>' + x.nombre + '</b><small>' + USO_TXT[x.uso][0] + ' · ' + esc(D.medida(x)) + '</small></button>').join('') + '</div>'
      + '<button class="btn cz-yo" data-yo>Prefiero escogerla yo →</button>',
    uso: () => tit('Paso 1', '¿Para <em>qué</em> es?') + '<div class="cz-ops">' + Object.keys(D.USOS).map(u => '<button class="cz-op' + (m && m.uso === u ? ' on' : '') + '" data-uso="' + u + '"><b>' + USO_TXT[u][0] + '</b><small>' + USO_TXT[u][1] + '</small></button>').join('') + '</div>',
    personas: () => { const o = D.opcionesPersonas(m.uso, m.forma), n = D.personas(m), l = D.limites(m.uso, m.forma, 0).L;
      const tams = o.length ? o.filter(x => x % 2 === 0 || o.length < 6).map(x => '<button class="cz-chip' + (x === n ? ' on' : '') + '" data-pers="' + x + '">' + x + '</button>').join('')
        : [['Chica', l[0]], ['Mediana', Math.round((l[0] + l[1]) / 20) * 10], ['Grande', l[1]]].map(([t, L]) => '<button class="cz-chip' + (m.L === L ? ' on' : '') + '" data-tam="' + L + '">' + t + '<small>' + L + ' cm</small></button>').join('');
      return tit(o.length ? 'Tamaño' : 'Tamaño', o.length ? '¿Para cuántas <em>personas?</em>' : '¿De qué <em>tamaño?</em>', 'La medida sale sola. Si ya tienes una medida exacta, escríbela abajo.')
        + '<div class="cz-chips">' + tams + '</div><p class="cz-med">Ahorita: <b>' + esc(D.medida(m)) + '</b></p>'
        + '<details class="cz-exacta"' + (o.length ? '' : '') + '><summary>Tengo una medida exacta</summary><div class="cz-dims"><label>' + (D.redonda(m.forma) ? 'Diámetro' : 'Largo') + '<input type="number" inputmode="numeric" data-dim="L" value="' + m.L + '"><em>cm</em></label>'
        + (D.redonda(m.forma) ? '' : '<label>Ancho<input type="number" inputmode="numeric" data-dim="W" value="' + m.W + '"><em>cm</em></label>') + '</div></details>' + sig(); },
    forma: () => tit('Forma', '¿Qué <em>forma?</em>') + '<div class="cz-ops cz-formas">' + D.formasDe(m.uso).map(f => '<button class="cz-op' + (m.forma === f ? ' on' : '') + '" data-forma="' + f + '">' + svgForma(f) + '<b>' + D.FORMAS[f] + '</b></button>').join('') + '</div>',
    piedra: () => tit('Piedra', 'Escoge tu <em>piedra.</em>', 'Fotos reales de cada placa.') + '<div class="cz-fotos">' + D.PIEDRAS.map(p => '<button class="' + (!ayuda && m.piedra === p.id ? 'on' : '') + '" data-piedra="' + p.id + '"><img src="img/piedras/' + p.id + '.jpg" alt="" loading="lazy"><b>' + p.nombre + '</b></button>').join('') + '</div>'
      + '<button class="btn cz-yo' + (ayuda ? ' on' : '') + '" data-ayuda>No sé, ayúdame a elegir</button>',
    base: () => tit('Base', 'Escoge la <em>base.</em>', 'Acero hecho en nuestro taller.') + '<div class="cz-fotos">' + D.basesPara(m).map(b => '<button class="' + (m.base === b ? 'on' : '') + '" data-base="' + b + '"><img src="' + (D.BASES[b].foto || 'img/bases/' + b + '.jpg') + '" alt="" loading="lazy"><b>' + D.BASES[b].nombre + '</b></button>').join('') + '</div>'
      + '<h2 class="cz-h2">Color de la base</h2><div class="cz-chips">' + D.COLORES.map(k => '<button class="cz-chip cz-col' + ((m.color || 'negro') === k.id ? ' on' : '') + '" data-color="' + k.id + '"><i style="background:' + k.hex + '"></i>' + k.nombre + '</button>').join('') + '</div>' + sig('Listo'),
    datos: () => tit('Último paso', '¿A dónde te mandamos tu <em>cotización?</em>', 'Un asesor de DKAS revisa tu mesa y te escribe por WhatsApp. Sin compromiso.')
      + '<div class="cz-resumen"><img src="img/piedras/' + m.piedra + '.jpg" alt=""><ul>' + lineas().map(z => '<li>' + esc(z) + '</li>').join('') + '</ul></div>'
      + '<form id="cz-f"><label>Tu nombre<input id="cz-n" required minlength="2" maxlength="80" autocomplete="name" value="' + esc(nomQ || yo.nombre || '') + '"></label>'
      + '<label>Tu WhatsApp<input id="cz-w" required inputmode="tel" maxlength="16" autocomplete="tel" placeholder="10 dígitos" value="' + esc(telQ || yo.tel || '') + '"></label>'
      + '<details class="cz-exacta"><summary>¿Algo más? (opcional)</summary><textarea id="cz-notas" rows="3" maxlength="1000" placeholder="Medida de tu espacio, fecha, dudas…"></textarea></details>'
      + '<p class="err" id="cz-e" hidden></p><button class="btn oro cz-env" id="cz-b">Pedir mi cotización</button></form>',
    listo: () => '<div class="cz-listo"><p class="et">Listo</p><h1>¡Gracias, ' + esc(enviado.nombre.split(' ')[0]) + '!</h1><p class="sub">Recibimos tu solicitud <b>#' + enviado.folio + '</b>. Un asesor de DKAS te escribe por WhatsApp con tu cotización.</p>'
      + '<div class="cz-resumen"><img src="img/piedras/' + m.piedra + '.jpg" alt=""><ul>' + lineas().map(z => '<li>' + esc(z) + '</li>').join('') + '</ul></div>'
      + '<a class="btn oro cz-env" target="_blank" rel="noopener" href="https://wa.me/' + WA[0].num + '?text=' + encodeURIComponent('Hola DKAS, soy ' + enviado.nombre + '. Acabo de pedir cotización (#' + enviado.folio + '):\n' + lineas().map(z => '• ' + z).join('\n')) + '">¿Prisa? Escríbenos por WhatsApp</a>'
      + '<a class="btn cz-yo" href="' + A.seguimiento(enviado.token) + '">Ver mi solicitud</a></div>'
  };
  function lineas() { const n = D.personas(m), col = D.color(m.color || 'negro');
    return [D.USOS[m.uso].nombre + ' ' + D.FORMAS[m.forma].toLowerCase() + ' · ' + D.medida(m) + (n ? ' · ' + n + ' personas' : ''), ayuda ? 'Piedra: que me ayuden a elegir' : 'Piedra ' + D.piedra(m.piedra).nombre, 'Base ' + D.BASES[m.base].nombre + ' · ' + col.nombre.toLowerCase()]; }

  function pinta() {
    const p = ruta[i]; box.innerHTML = '<div class="cz-prog">' + ruta.filter(x => x !== 'inicio').map((x, k) => '<i class="' + (k < ruta.filter(z => z !== 'inicio').indexOf(p) ? 'h' : x === p ? 'on' : '') + '"></i>').join('') + '</div>' + PANTALLA[p]();
    $('#cz-atras').hidden = i === 0 || p === 'listo';
    res.innerHTML = m && p !== 'listo' && p !== 'inicio' && p !== 'datos' ? '<span>' + esc(lineas().join(' · ')) + '</span>' : '';
    scrollTo({ top: 0, behavior: 'smooth' });
    if (p === 'datos') $('#cz-f').onsubmit = enviar;
  }
  const ir = d => { i = Math.max(0, Math.min(ruta.length - 1, i + d)); pinta(); };
  const cambia = (c, avanza) => { m = D.normalizar(Object.assign({}, m, c)); delete m.modelo; if (!D.basesPara(m).includes(m.base)) m.base = D.basesPara(m)[0]; if (avanza) setTimeout(() => ir(1), 180); pinta(); };

  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mod) { const x = D.MODELOS.find(z => z.id === b.dataset.mod); m = D.normalizar(Object.assign({}, x)); origen = 'Modelo ' + x.nombre; ruta = ['inicio', 'personas', 'piedra', 'base', 'datos']; return ir(1); }
    if (b.dataset.yo != null) { m = m || nueva('comedor', 'rect'); return ir(1); }
    if (b.dataset.uso) { m = nueva(b.dataset.uso, D.formasDe(b.dataset.uso)[0]); pinta(); return setTimeout(() => ir(1), 180); }
    if (b.dataset.pers) return cambia(D.tamanoPara(m.uso, m.forma, +b.dataset.pers), true);
    if (b.dataset.tam) return cambia({ L: +b.dataset.tam, W: D.redonda(m.forma) ? +b.dataset.tam : null }, true);
    if (b.dataset.forma) { const n = D.personas(m); return cambia(Object.assign({ forma: b.dataset.forma }, tamano(m.uso, b.dataset.forma, n)), true); }
    if (b.dataset.piedra) { ayuda = false; return cambia({ piedra: b.dataset.piedra }, true); }
    if (b.dataset.ayuda != null) { ayuda = true; pinta(); return setTimeout(() => ir(1), 180); }
    if (b.dataset.base) return cambia({ base: b.dataset.base });
    if (b.dataset.color) return cambia({ color: b.dataset.color });
    if (b.dataset.sig != null) return ir(1);
  });
  box.addEventListener('change', e => { const k = e.target.dataset.dim; if (!k) return; const v = Math.round(+e.target.value); if (!(v > 0)) return; const c = { [k]: v }; if (k === 'L' && D.redonda(m.forma)) c.W = v; m = D.normalizar(Object.assign({}, m, c)); const t = $('.cz-med b'); if (t) t.textContent = D.medida(m); res.innerHTML = '<span>' + esc(lineas().join(' · ')) + '</span>'; });
  $('#cz-atras').onclick = () => ir(-1);

  async function enviar(e) {
    e.preventDefault(); const b = $('#cz-b'), err = $('#cz-e'); err.hidden = true;
    const nombre = $('#cz-n').value.trim(), tel = $('#cz-w').value.replace(/\D/g, '');
    if (tel.length < 10 || tel.length > 13) { err.textContent = 'Escribe tu WhatsApp a 10 dígitos: ahí te mandamos tu cotización.'; err.hidden = false; return; }
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const cod = [m.uso, m.forma, m.L, m.W, m.base, m.piedra, m.H].concat(m.color && m.color !== 'negro' ? [m.color] : []).join('.');
      const specs = D.resumen(m).filter(r => r[0] !== 'Fabricación' && !(ayuda && r[0] === 'Piedra')).concat([['Pidió', 'Cotizador express' + (origen ? ' · ' + origen : '')]], ayuda ? [['Piedra', 'Quiere que le ayudemos a elegir']] : [], [['Código', cod]]);
      const r = await A.crearPedido({ nombre, tel, notas: ($('#cz-notas') || {}).value || '', items: [{ tipo: 'mesa', titulo: D.titulo(m), cantidad: 1, uso: m.uso, specs, link: SITE + '#d=' + cod }], canal: A.load('dazk-canal', '') });
      A.save('dazk-yo', Object.assign(A.load('dazk-yo', {}), { nombre, tel }));
      A.save('dazk-pedidos', [{ folio: r.folio, token: r.token, fecha: new Date().toISOString() }].concat(A.load('dazk-pedidos', [])));
      enviado = Object.assign({ nombre }, r); ruta = ruta.concat(['listo']); i = ruta.length - 1; pinta();
    } catch (x) { err.textContent = x.message || 'No se pudo enviar. Intenta de nuevo.'; err.hidden = false; b.disabled = false; b.textContent = 'Pedir mi cotización'; }
  }
  if (!m && ruta[0] !== 'inicio') m = nueva('comedor', 'rect');
  pinta();
})();

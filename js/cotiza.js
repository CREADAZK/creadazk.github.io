/* DKAS · Cotiza tu mesa en 1 minuto: sin solicitud. El cliente toca opciones con fotos, ve su mesa EXACTA en 3D con sus medidas,
   confirma que así la quiere y deja su WhatsApp; llega al panel como pedido nuevo.
   Nunca muestra precios: la cotización la manda el taller por WhatsApp.
   Entradas: ?m=<modelo> (catálogo), ?p=&u=&f=&b=&t= ("Quiero una así" de una foto), ?n=<nombre>&w=<whatsapp> (link mandado desde el panel). */
(function () {
  const D = window.DKAS, A = window.DAZK_API, WA = window.DKAS_WA, SITE = 'https://dkas.mx/';
  const $ = s => document.querySelector(s), esc = A.esc;
  const q = new URLSearchParams(location.search), yo = A.load('dazk-yo', {});
  const nomQ = (q.get('n') || '').trim().slice(0, 60), telQ = (q.get('w') || '').replace(/\D/g, '').slice(0, 13);
  try { const c = q.get('c'), ref = document.referrer ? new URL(document.referrer).hostname : ''; if (!A.load('dazk-canal', '')) A.save('dazk-canal', A.canal(c || (nomQ ? 'whatsapp' : !ref || ref === location.hostname ? 'directo' : ref)) || 'directo'); } catch (e) {}

  const box = $('#cz'), res = $('#cz-res'), MIA = 'c-nueva';
  let m = null, modSel = null, ruta = [], i = 0, origen = '', ayuda = false, enviado = null, otraP = null, otraB = null;
  let miBase = null, fotoMiBase = null, tab = null, fotoFinal = null;
  const tamano = (uso, forma, n) => { const o = D.opcionesPersonas(uso, forma); return o.length ? D.tamanoPara(uso, forma, n && o.includes(n) ? n : o[Math.floor(o.length / 2)]) : (() => { const l = D.limites(uso, forma, 0).L; return { L: Math.round((l[0] + l[1]) / 20) * 10, W: null }; })(); };
  const nueva = (uso, forma) => D.normalizar(Object.assign({ uso, forma, base: D.basesPara({ uso, forma, L: 200, W: 100 })[0] || 'patas', piedra: 'statuario' }, tamano(uso, forma, uso === 'comedor' ? 8 : 4)));
  const nomBase = b => b === MIA ? 'que dibujaste' : (D.BASES[b] || {}).nombre || b;
  const fotoBase = b => b === MIA ? fotoMiBase : D.BASES[b].foto || 'img/bases/' + b + '.jpg';
  const ifoto = (src, cls) => src ? '<img src="' + src + '" alt="" loading="lazy"' + (cls ? ' class="' + cls + '"' : '') + '>' : '<span class="cz-sinfoto">✏️</span>';

  // ---------- la base manda: si con esa medida no se puede, se busca la medida más cercana que sí ----------
  function ajustaBase(mm, b) {
    const c0 = Object.assign({}, mm, { base: b }); delete c0.modelo;
    if (D.basesPara(c0).includes(b)) return D.normalizar(c0);
    const f = (D.USOS[mm.uso] || {}).formas && D.USOS[mm.uso].formas[mm.forma]; if (!f) return null;
    let best = null;
    for (let L = f.L[0]; L <= f.L[1]; L += 10) {
      const Ws = []; if (f.W) for (let W = f.W[0]; W <= Math.min(L, f.W[1]); W += 10) Ws.push(W); else Ws.push(L);
      Ws.forEach(W => { const c = Object.assign({}, c0, { L, W }); if (D.basesPara(c).includes(b)) { const k = Math.abs(L - mm.L) + Math.abs(W - mm.W); if (!best || k < best[0]) best = [k, c]; } });
    }
    return best ? D.normalizar(best[1]) : null;
  }
  // todas las bases que se pueden hacer en esta forma (a esta medida o a otra)
  const basesPosibles = () => Object.keys(D.BASES).filter(b => b !== MIA && !/^zz-|^c-/.test(b) && ajustaBase(m, b));

  // ---------- avisos (se ven arriba de la barra) ----------
  let tAviso = 0;
  function aviso(t) { let a = $('#cz-aviso'); if (!a) { a = document.createElement('div'); a.id = 'cz-aviso'; a.className = 'cz-toast'; document.body.appendChild(a); }
    a.innerHTML = t; a.classList.add('on'); clearTimeout(tAviso); tAviso = setTimeout(() => a.classList.remove('on'), 5200); }

  // ---------- 3D: se carga solo cuando hace falta (la primera pantalla abre rápido) ----------
  const J3D = window.DKAS_3DJS || [];
  const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } })();
  let carga3d = null;
  function cargar3D() {
    if (window.DKAS3D) return Promise.resolve(true); if (!webgl || J3D.length < 2) return Promise.resolve(false); if (carga3d) return carga3d;
    const sc = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
    return (carga3d = (window.THREE ? Promise.resolve() : sc(J3D[0])).then(() => sc(J3D[1])).then(() => !!window.DKAS3D).catch(() => { carga3d = null; return false; }));
  }
  // el visor vive siempre en el mismo div (aunque la pantalla se vuelva a pintar, no se pierde)
  const vivo = document.createElement('div'); vivo.className = 'cz-3d-in'; let visor = null;
  const vivoB = document.createElement('div'); vivoB.className = 'cz-3d-in'; let visorB = null;
  async function mesa3d() {
    if (!(await cargar3D())) return null;
    if (!visor) visor = DKAS3D.crear(vivo, { tex: 'tex/piedras/', fondo: 0xeeeae3 });
    return visor;
  }
  // foto grande y nítida de la mesa exacta (para el plano, el resumen y el pedido)
  async function fotoDe(v, w, h) { try { await (v.listo && v.listo()); await new Promise(r => setTimeout(r, 60)); const s = (document.querySelector('[data-sillas]') || {}).classList, con = !!(s && s.contains('on')); v.sillas(false); const u = v.foto(w || 1600, h || 1067, false, 0.64); v.sillas(con); return u; } catch (e) { return null; } }
  function chica(url, max) {
    return new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); let w = 900, qq = 0.84, u; do { c.width = w; c.height = Math.round(w * im.height / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); u = c.toDataURL('image/jpeg', qq); qq -= 0.07; w -= 90; } while (u.length > (max || 150000) && w > 320); ok(u); }; im.onerror = () => ok(null); im.src = url; });
  }

  // ---------- de dónde viene ----------
  const mod = D.MODELOS.find(x => x.id === q.get('m'));
  if (mod) { modSel = mod; m = D.normalizar(Object.assign({}, mod, { modelo: mod.id })); origen = 'Modelo ' + mod.nombre; ruta = ['personas', 'piedra', 'base', 'revisa', 'datos']; }
  else if (q.get('u') && D.USOS[q.get('u')]) {
    const u = q.get('u'), f = D.formasDe(u).includes(q.get('f')) ? q.get('f') : D.formasDe(u)[0];
    m = D.normalizar(Object.assign({ uso: u, forma: f, base: q.get('b') || 'patas', piedra: D.PIEDRAS.some(p => p.id === q.get('p')) ? q.get('p') : 'statuario' }, tamano(u, f, u === 'comedor' ? 8 : 4)));
    origen = 'Quiero una así: ' + (q.get('t') || 'foto de la página').slice(0, 60); ruta = ['personas', 'piedra', 'base', 'revisa', 'datos'];
  } else ruta = ['inicio', 'uso', 'personas', 'forma', 'piedra', 'base', 'revisa', 'datos'];

  const svgForma = f => '<svg viewBox="0 0 64 64" class="ico">' + { rect: '<rect x="6" y="16" width="52" height="32" rx="1.5"/>', ovcuad: '<rect x="6" y="16" width="52" height="32" rx="12"/>', oval: '<ellipse cx="32" cy="32" rx="27" ry="16"/>', square: '<rect x="14" y="14" width="36" height="36" rx="1.5"/>', round: '<circle cx="32" cy="32" r="19"/>' }[f] + '</svg>';
  const USO_TXT = { comedor: ['Comedor', 'Para comer en casa', 'img/modelos/maestra.jpg'], centro: ['Mesa de centro', 'Para la sala', 'img/modelos/origen.jpg'], periquera: ['Barra o periquera', 'Alta, para cocina o terraza', 'img/modelos/alta.jpg'] };
  const tit = (et, h, sub) => '<p class="et">' + et + '</p><h1>' + h + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '');
  const sig = (txt) => '<button class="btn oro cz-sig" data-sig>' + (txt || 'Siguiente') + ' →</button>';
  const exacta = () => modSel && ['uso', 'forma', 'L', 'W', 'base', 'piedra'].every(k => m[k] === modSel[k]) && (m.color || 'negro') === 'negro' && !otraP && !otraB && !ayuda;

  // vista de arriba con sillas (para que vea cuántos caben)
  function planta() {
    const n = D.personas(m) || 0, R = m.forma === 'round', S = 300 / Math.max(m.L + 120, 1), a = m.L / 2 * S, b = (R ? m.L : m.W) / 2 * S, cx = 160, cy = 92, sep = 26, out = [];
    const silla = (x, y, g) => '<rect x="-11" y="-9" width="22" height="18" rx="5" transform="translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' + g.toFixed(1) + ')"/>';
    if (n && m.uso !== 'centro') {
      if (R || m.forma === 'oval') for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2 - Math.PI / 2; out.push(silla(cx + (a + sep * .7) * Math.cos(t), cy + (b + sep * .7) * Math.sin(t), t * 180 / Math.PI + 90)); }
      else { const cab = n >= 8 && m.W >= 90 || m.forma === 'square' ? 2 : 0, s = Math.max(1, Math.floor((n - cab) / 2)); for (let k = 0; k < s; k++) { const f = (k + .5) / s; out.push(silla(cx - a + 2 * a * f, cy - b - 15, 0), silla(cx - a + 2 * a * f, cy + b + 15, 0)); } if (cab) out.push(silla(cx - a - 15, cy, 90), silla(cx + a + 15, cy, 90)); }
    }
    const top = R ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + a + '"/>' : m.forma === 'oval' ? '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + a + '" ry="' + b + '"/>' : '<rect x="' + (cx - a) + '" y="' + (cy - b) + '" width="' + 2 * a + '" height="' + 2 * b + '" rx="' + (m.forma === 'ovcuad' ? Math.min(b, 22 * S) : 2) + '"/>';
    return '<svg viewBox="0 0 320 184" class="cz-planta"><defs><pattern id="pz" patternUnits="objectBoundingBox" width="1" height="1"><image href="img/piedras/' + m.piedra + '.jpg" width="320" height="184" preserveAspectRatio="xMidYMid slice"/></pattern></defs><g class="sl">' + out.join('') + '</g><g class="tp" fill="url(#pz)">' + top + '</g>'
      + '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" class="md">' + esc(D.medida(m)) + '</text></svg>';
  }

  // ---------- cada pantalla ----------
  const PANTALLA = {
    inicio: () => tit('Cotiza en 1 minuto', (nomQ ? 'Hola ' + esc(nomQ.split(' ')[0]) + ', ¿te gusta <em>alguna?</em>' : '¿Te gusta <em>alguna?</em>'), 'Toca la que te guste y la ajustamos a tu medida.')
      + '<div class="cz-mod">' + D.MODELOS.map(x => '<button data-mod="' + x.id + '"><img src="img/modelos/' + x.id + '.jpg" alt="" loading="lazy"><b>' + x.nombre + '</b><small>' + USO_TXT[x.uso][0] + ' · ' + esc(D.medida(x)) + '</small></button>').join('') + '</div>'
      + '<button class="cz-grande" data-yo><b>✍️ Prefiero armarla yo</b><small>Escoge tamaño, forma, piedra y base en 5 toques</small></button>',
    uso: () => tit('Paso 1', '¿Para <em>qué</em> es?') + '<div class="cz-usos">' + Object.keys(D.USOS).map(u => '<button class="' + (m && m.uso === u ? 'on' : '') + '" data-uso="' + u + '"><img src="' + USO_TXT[u][2] + '" alt="" loading="lazy"><span><b>' + USO_TXT[u][0] + '</b><small>' + USO_TXT[u][1] + '</small></span></button>').join('') + '</div>',
    personas: () => { const o = D.opcionesPersonas(m.uso, m.forma), n = D.personas(m), l = D.limites(m.uso, m.forma, 0).L;
      const tams = o.length ? o.filter(x => x % 2 === 0 || o.length < 6).map(x => '<button class="cz-chip' + (x === n ? ' on' : '') + '" data-pers="' + x + '">' + x + '<small>personas</small></button>').join('')
        : [['Chica', l[0]], ['Mediana', Math.round((l[0] + l[1]) / 20) * 10], ['Grande', l[1]]].map(([t, L]) => '<button class="cz-chip' + (m.L === L ? ' on' : '') + '" data-tam="' + L + '">' + t + '<small>' + L + ' cm</small></button>').join('');
      return tit('Tamaño', o.length ? '¿Para cuántas <em>personas?</em>' : '¿De qué <em>tamaño?</em>', 'Toca un número y la medida sale sola.')
        + '<div class="cz-chips">' + tams + '</div>'
        + '<div class="cz-pl">' + planta() + '<p class="cz-med">Tu mesa: <b>' + esc(D.medida(m)) + '</b>' + (n ? ' · ' + n + ' personas' : '') + '</p></div>'
        + '<details class="cz-exacta cz-mia"><summary><b>📏 Poner mis propias medidas</b><small>¿Ya mediste tu espacio? Escribe el largo y ancho exactos</small></summary><div class="cz-dims"><label>' + (D.redonda(m.forma) ? 'Diámetro' : 'Largo') + '<input type="number" inputmode="numeric" data-dim="L" value="' + m.L + '"><em>cm</em></label>'
        + (D.redonda(m.forma) ? '' : '<label>Ancho<input type="number" inputmode="numeric" data-dim="W" value="' + m.W + '"><em>cm</em></label>') + '</div><button class="btn cz-ok-med" data-okmed>Usar estas medidas ✓</button></details>' + sig(); },
    forma: () => tit('Forma', '¿Qué <em>forma?</em>') + '<div class="cz-ops cz-formas">' + D.formasDe(m.uso).map(f => '<button class="cz-op' + (m.forma === f ? ' on' : '') + '" data-forma="' + f + '">' + svgForma(f) + '<b>' + D.FORMAS[f] + '</b></button>').join('') + '</div>',
    piedra: () => tit('Piedra', 'Escoge tu <em>piedra.</em>', 'Fotos reales de cada placa.') + '<div class="cz-fotos">' + D.PIEDRAS.map(p => '<button class="' + (!ayuda && !otraP && m.piedra === p.id ? 'on' : '') + '" data-piedra="' + p.id + '"><img src="img/piedras/' + p.id + '.jpg" alt="" loading="lazy"><b>' + p.nombre + '</b></button>').join('') + '</div>'
      + '<button class="cz-otra' + (otraP != null ? ' on' : '') + '" data-otrap><b>Otra piedra</b><small>¿Buscas una que no está aquí? Dinos cuál</small></button>'
      + (otraP != null ? '<div class="cz-otra-f"><textarea id="cz-op" rows="2" maxlength="110" placeholder="Ej. mármol negro con vetas doradas, o la que vi en tal lugar…">' + esc(otraP) + '</textarea>' + sig() + '</div>' : '')
      + '<button class="btn cz-yo' + (ayuda ? ' on' : '') + '" data-ayuda>No sé, ayúdame a elegir</button>'
      + (otraP == null ? sig(ayuda ? 'Siguiente' : 'Seguir con ' + esc(D.piedra(m.piedra).nombre)) : ''),
    base: () => { const bs = basesPosibles(), ok = D.basesPara(m), sel = otraB == null ? m.base : null;
      const tarjeta = b => { const aj = ok.includes(b) ? null : ajustaBase(m, b);
        return '<button class="' + (sel === b ? 'on' : '') + '" data-base="' + b + '">' + ifoto(fotoBase(b)) + '<b>' + esc(D.BASES[b].nombre) + '</b>' + (aj ? '<em class="cz-tag">Mesa de ' + esc(D.medida(aj)) + '</em>' : '') + '</button>'; };
      const puedeDibujar = ['rect', 'ovcuad', 'oval'].includes(m.forma);
      return tit('Base', 'Escoge la <em>base.</em>', 'Acero hecho en nuestro taller. Toca la que te guste.')
        + (miBase && puedeDibujar ? '<div class="cz-fotos cz-mibase"><button class="' + (sel === MIA ? 'on' : '') + '" data-base="' + MIA + '">' + ifoto(fotoMiBase) + '<b>Tu base dibujada</b><small class="cz-sub2">Así la imaginamos</small></button></div>' : '')
        + '<div class="cz-fotos">' + ok.filter(b => bs.includes(b)).concat(bs.filter(b => !ok.includes(b))).map(tarjeta).join('') + '</div>'
        + (puedeDibujar ? '<button class="cz-grande cz-dibuja" data-dibuja><b>✏️ ' + (miBase ? 'Volver a dibujar mi base' : 'Dibuja tu propia base') + '</b><small>Dibuja las patas con el dedo; nosotros la volvemos una base que sí se fabrica y la ves en 3D</small></button>' : '')
        + '<button class="cz-otra' + (otraB != null ? ' on' : '') + '" data-otrab><b>Otra base · contárnosla</b><small>¿Te imaginas otra? Escríbenos cómo es</small></button>'
        + (otraB != null ? '<div class="cz-otra-f"><textarea id="cz-ob" rows="2" maxlength="110" placeholder="Ej. de madera, en forma de arco, una sola pata al centro…">' + esc(otraB) + '</textarea></div>' : '')
        + '<h2 class="cz-h2">Color de la base</h2><div class="cz-chips">' + D.COLORES.map(k => '<button class="cz-chip cz-col' + ((m.color || 'negro') === k.id ? ' on' : '') + '" data-color="' + k.id + '"><i style="background:' + k.hex + '"></i>' + k.nombre + '</button>').join('') + '</div>' + sig('Ver mi mesa'); },
    revisa: () => { const n = D.personas(m), col = D.color(m.color || 'negro'), real = exacta(), p3 = webgl && J3D.length > 1;
      if (!tab || (tab === 'real' && !real) || (tab === '3d' && !p3)) tab = real ? 'real' : p3 ? '3d' : 'plano';
      const avisos = [otraP ? 'Piedra: pediste <b>' + esc(otraP) + '</b>. En el dibujo va una de ejemplo.' : ayuda ? 'Piedra: te ayudamos a elegirla. En el dibujo va una de ejemplo.' : '', otraB ? 'Base: pediste <b>' + esc(otraB) + '</b>. En el dibujo va una de ejemplo.' : ''].filter(Boolean);
      const ficha = (img, et, val, sub, ir) => '<button class="cz-ficha" data-ir="' + ir + '">' + img + '<span><small>' + et + '</small><b>' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</span><i>Cambiar</i></button>';
      return tit('Revisa tu mesa', '¿Así la <em>quieres?</em>', 'Esta es tu mesa exacta, con tus medidas. Revísala con calma.')
        + '<div class="cz-tabs">' + (real ? '<button data-tab="real" class="' + (tab === 'real' ? 'on' : '') + '">Foto</button>' : '') + (p3 ? '<button data-tab="3d" class="' + (tab === '3d' ? 'on' : '') + '">En 3D</button>' : '') + '<button data-tab="plano" class="' + (tab === 'plano' ? 'on' : '') + '">Plano con medidas</button></div>'
        + '<div class="cz-ver">'
        + (real ? '<div class="cz-real" data-t="real"' + (tab === 'real' ? '' : ' hidden') + '><img src="img/modelos/' + modSel.id + '.jpg" alt=""><span class="cz-pie">Foto real del modelo ' + esc(modSel.nombre) + ' · igual a la tuya</span></div>' : '')
        + (p3 ? '<div class="cz-3d" data-t="3d"' + (tab === '3d' ? '' : ' hidden') + '><div id="cz-3d-slot"></div><div class="cz-carga" id="cz-carga"><i></i>Armando tu mesa en 3D…</div><span class="cz-mano" id="cz-mano">👆 Desliza para girarla</span>'
          + '<div class="cz-vbar"><button data-v="tres" class="on">3/4</button><button data-v="frente">Frente</button><button data-v="lado">Lado</button><button data-v="arriba">Arriba</button><button data-cotas class="on">📏 Medidas</button>' + (m.uso !== 'centro' ? '<button data-sillas>🪑 Sillas</button>' : '') + '</div></div>' : '')
        + '<div class="cz-lam" data-t="plano"' + (tab === 'plano' ? '' : ' hidden') + '><div id="cz-lam-in"></div><span class="cz-pie">Toca el plano para verlo en grande</span></div>'
        + '</div>'
        + (avisos.length ? '<p class="cz-aviso">' + avisos.join('<br>') + '</p>' : '')
        + '<div class="cz-fichas">'
        + ficha('<span class="cz-ico">📏</span>', 'Medidas', esc(D.medida(m)), (n ? n + ' personas · ' : '') + 'altura ' + m.H + ' cm', 'personas')
        + ficha(otraP || ayuda ? '<span class="cz-ico">🪨</span>' : '<img src="img/piedras/' + m.piedra + '.jpg" alt="">', 'Piedra', otraP ? 'Otra: ' + esc(otraP) : ayuda ? 'Que me ayuden a elegir' : esc(D.piedra(m.piedra).nombre), 'Piedra sinterizada de 12 mm', 'piedra')
        + ficha(otraB ? '<span class="cz-ico">✍️</span>' : ifoto(fotoBase(m.base)), 'Base', otraB ? 'Otra: ' + esc(otraB) : esc(m.base === MIA ? 'Tu base dibujada' : D.BASES[m.base].nombre), '<i class="cz-dot" style="background:' + col.hex + '"></i>' + esc(col.nombre), 'base')
        + '</div>'
        + '<button class="btn oro cz-sig cz-si" data-si>✓ Sí, así la quiero</button>'
        + '<p class="cz-nota">¿Algo no está bien? Toca <b>Cambiar</b> en lo que quieras.</p>'; },
    datos: () => tit('Último paso', '¿A dónde te mandamos tu <em>cotización?</em>', 'Un asesor de DKAS revisa tu mesa y te escribe por WhatsApp. Sin compromiso.')
      + resumen()
      + '<form id="cz-f"><label>Tu nombre<input id="cz-n" required minlength="2" maxlength="80" autocomplete="name" value="' + esc(nomQ || yo.nombre || '') + '"></label>'
      + '<label>Tu WhatsApp<input id="cz-w" required inputmode="tel" maxlength="16" autocomplete="tel" placeholder="10 dígitos" value="' + esc(telQ || yo.tel || '') + '"></label>'
      + '<details class="cz-exacta"><summary>¿Algo más? (opcional)</summary><textarea id="cz-notas" rows="3" maxlength="1000" placeholder="Fecha, dudas, cómo es tu espacio…"></textarea></details>'
      + '<p class="err" id="cz-e" hidden></p><button class="btn oro cz-env" id="cz-b">Pedir mi cotización</button></form>',
    listo: () => '<div class="cz-listo"><p class="et">Listo</p><h1>¡Gracias, ' + esc(enviado.nombre.split(' ')[0]) + '!</h1><p class="sub">Recibimos tu solicitud <b>#' + enviado.folio + '</b>. Un asesor de DKAS te escribe por WhatsApp con tu cotización.</p>'
      + resumen()
      + '<a class="btn oro cz-env" target="_blank" rel="noopener" href="https://wa.me/' + WA[0].num + '?text=' + encodeURIComponent('Hola DKAS, soy ' + enviado.nombre + '. Acabo de pedir cotización (#' + enviado.folio + '):\n' + lineas().map(z => '• ' + z).join('\n')) + '">¿Prisa? Escríbenos por WhatsApp</a>'
      + '<a class="btn cz-yo" href="' + A.seguimiento(enviado.token) + '">Ver mi solicitud</a></div>'
  };
  function resumen() {
    const img = fotoFinal || (exacta() ? 'img/modelos/' + modSel.id + '.jpg' : 'img/piedras/' + m.piedra + '.jpg');
    return '<div class="cz-resumen' + (fotoFinal || exacta() ? ' grande' : '') + '"><img src="' + img + '" alt=""><ul>' + lineas().map(z => '<li>' + esc(z) + '</li>').join('') + '</ul></div>';
  }
  function lineas() { const n = D.personas(m), col = D.color(m.color || 'negro');
    return [D.USOS[m.uso].nombre + ' ' + D.FORMAS[m.forma].toLowerCase() + ' · ' + D.medida(m) + (n ? ' · ' + n + ' personas' : ''), otraP ? 'Piedra: otra — ' + otraP : ayuda ? 'Piedra: que me ayuden a elegir' : 'Piedra ' + D.piedra(m.piedra).nombre, (otraB ? 'Base: otra — ' + otraB : m.base === MIA ? 'Base dibujada por mí' : 'Base ' + D.BASES[m.base].nombre) + ' · ' + col.nombre.toLowerCase()]; }

  function pinta() {
    const p = ruta[i], pasos = ruta.filter(x => x !== 'inicio' && x !== 'listo');
    box.innerHTML = (p === 'listo' ? '' : '<div class="cz-prog">' + pasos.map((x, k) => '<i class="' + (k < pasos.indexOf(p) ? 'h' : x === p ? 'on' : '') + '"></i>').join('') + '</div>') + PANTALLA[p]();
    $('#cz-atras').hidden = i === 0 || p === 'listo';
    res.innerHTML = m && !['listo', 'inicio', 'datos', 'revisa'].includes(p) ? '<span>' + esc(lineas().join(' · ')) + '</span>' : '';
    scrollTo({ top: 0, behavior: 'smooth' });
    if (p === 'datos') $('#cz-f').onsubmit = enviar;
    if (p === 'revisa') revisar();
    if (p === 'base' || p === 'piedra') cargar3D(); // se adelanta la carga del 3D mientras escoge
  }
  const ir = d => { i = Math.max(0, Math.min(ruta.length - 1, i + d)); const a = document.getElementById('cz-aviso'); if (a) a.classList.remove('on'); pinta(); };

  // cambia la mesa sin perder la base que le gustó; si no se puede, le avisa qué pasó
  function cambia(c, avanza, respetaMedida) {
    const prev = m.base, cand = Object.assign({}, m, c); delete cand.modelo;
    let nm = D.normalizar(cand);
    if (nm.base !== prev && !c.base) {
      const aj = !respetaMedida && ajustaBase(cand, prev);
      if (aj) { nm = aj; aviso('La base <b>' + esc(nomBase(prev)) + '</b> necesita una mesa de <b>' + esc(D.medida(aj)) + '</b>: la dejamos así.'); }
      else aviso('La base <b>' + esc(nomBase(prev)) + '</b> no se puede con ' + (c.forma ? 'forma ' + D.FORMAS[c.forma].toLowerCase() : 'esa medida') + '. Te pusimos <b>' + esc(nomBase(nm.base)) + '</b>; puedes cambiarla en el paso Base.');
    }
    m = nm; if (avanza) { pinta(); setTimeout(() => ir(1), 200); } else pinta();
  }
  function ponerMedidas() {
    const L = Math.round(+($('[data-dim="L"]') || {}).value), W = Math.round(+(($('[data-dim="W"]') || {}).value || L));
    if (!(L > 0) || !(W > 0)) return aviso('Escribe el largo' + (D.redonda(m.forma) ? '' : ' y el ancho') + ' en centímetros.');
    const r = D.normalizar(Object.assign({}, m, { L, W: D.redonda(m.forma) ? L : W }));
    if (r.L !== L || (!D.redonda(m.forma) && r.W !== W && r.W !== L)) aviso('Ajustamos tu medida a <b>' + esc(D.medida(r)) + '</b>.');
    cambia({ L, W: D.redonda(m.forma) ? L : W }, false, true);
    aviso('Listo: tu mesa mide <b>' + esc(D.medida(m)) + '</b>.');
  }

  // ---------- revisa: la mesa exacta en 3D, la foto real si es igual al modelo, y el plano con medidas ----------
  async function revisar() {
    fotoFinal = null;
    const lam = async (foto) => { const el = $('#cz-lam-in'); if (el && window.DKAS_CQ) el.innerHTML = DKAS_CQ.lamina(m, { foto: foto || (exacta() ? 'img/modelos/' + modSel.id + '.jpg' : undefined), titulo: 'Tu mesa' }); };
    lam();
    const slot = $('#cz-3d-slot'); if (!slot) return;
    const v = await mesa3d(); if (ruta[i] !== 'revisa') return;
    if (!v) { tab = 'plano'; const t3 = document.querySelector('[data-t="3d"]'), b3 = document.querySelector('[data-tab="3d"]'); if (t3) t3.remove(); if (b3) b3.remove(); verTab(exacta() ? 'real' : 'plano'); return; }
    slot.appendChild(vivo); v.sillas(false); v.cotas(true); v.vista('tres');
    await v.mostrar(m); await (v.listo && v.listo());
    const c = $('#cz-carga'); if (c) c.hidden = true;
    const f = await fotoDe(v, 1600, 1067); if (ruta[i] !== 'revisa') return;
    if (f) { fotoFinal = await chica(f, 260000); lam(f); }
  }
  function verTab(t) {
    tab = t; document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('.cz-ver [data-t]').forEach(d => { d.hidden = d.dataset.t !== t; });
  }
  // el plano en grande (pantalla completa, se puede hacer zoom con los dedos)
  function planoGrande() {
    const el = $('#cz-lam-in'); if (!el || !el.innerHTML) return;
    const v = document.createElement('div'); v.className = 'cz-full'; v.innerHTML = '<button class="btn chico" data-cerrar>Cerrar ✕</button><div class="cz-full-in">' + el.innerHTML + '</div>';
    v.onclick = e => { if (e.target.closest('[data-cerrar]')) { v.remove(); document.body.style.overflow = ''; } };
    document.body.appendChild(v); document.body.style.overflow = 'hidden';
  }

  // ---------- dibujar su propia base ----------
  async function dibujar() {
    if (!window.DKAS_DISENA) return aviso('No se pudo abrir el dibujo. Recarga la página.');
    const ok3d = await cargar3D();
    DKAS_DISENA.abrirCliente(p => {
      DKAS_DISENA.registrarCli(MIA, { nombre: 'Tu base dibujada', segs: p.segs, perfil: p.perfil });
      miBase = { segs: p.segs, perfil: p.perfil, nombre: 'Base de ' + ((A.load('dazk-yo', {}).nombre || nomQ || 'cliente').split(' ')[0]).slice(0, 30) };
      fotoMiBase = visorB ? visorB.foto(900, 675, false, 0.8) : null; otraB = null;
      const r = ajustaBase(m, MIA); m = r || D.normalizar(Object.assign({}, m, { base: MIA }));
      aviso('¡Listo! Tu base ya está en tu mesa.'); pinta();
    }, ok3d ? {
      tresD: async (el, r) => {
        el.innerHTML = ''; el.appendChild(vivoB);
        if (!visorB) visorB = DKAS3D.crear(vivoB, { tex: 'tex/piedras/', fondo: 0xeeeae3 });
        D.registrarBase('zz-cli', { nombre: 'Prueba', segs: r.segs, perfil: r.perfil, cli: true });
        visorB.sillas(false); visorB.cotas(false); visorB.vista('frente');
        const mm = Object.assign({}, m, { base: 'zz-cli' }); if (!['rect', 'ovcuad', 'oval'].includes(mm.forma)) mm.forma = 'rect';
        Promise.resolve(visorB.mostrar(D.normalizar(mm))).then(() => visorB.listo && visorB.listo()).then(() => visorB.vista('tres'), () => visorB.vista('tres'));
      },
      cerrar: () => { if (D.BASES['zz-cli']) D.quitarBase('zz-cli'); }
    } : {});
  }

  // ---------- toques ----------
  box.addEventListener('click', e => {
    if (e.target.closest('.cz-lam')) return planoGrande();
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mod) { const x = D.MODELOS.find(z => z.id === b.dataset.mod); modSel = x; m = D.normalizar(Object.assign({}, x)); origen = 'Modelo ' + x.nombre; ruta = ['inicio', 'personas', 'piedra', 'base', 'revisa', 'datos']; return ir(1); }
    if (b.dataset.yo != null) { modSel = null; m = m || nueva('comedor', 'rect'); ruta = ['inicio', 'uso', 'personas', 'forma', 'piedra', 'base', 'revisa', 'datos']; return ir(1); }
    if (b.dataset.uso) { m = nueva(b.dataset.uso, D.formasDe(b.dataset.uso)[0]); pinta(); return setTimeout(() => ir(1), 200); }
    if (b.dataset.pers) return cambia(D.tamanoPara(m.uso, m.forma, +b.dataset.pers));
    if (b.dataset.tam) return cambia({ L: +b.dataset.tam, W: D.redonda(m.forma) ? +b.dataset.tam : null });
    if (b.dataset.okmed != null) return ponerMedidas();
    if (b.dataset.forma) { const n = D.personas(m); return cambia(Object.assign({ forma: b.dataset.forma }, tamano(m.uso, b.dataset.forma, n)), true); }
    if (b.dataset.piedra) { ayuda = false; otraP = null; return cambia({ piedra: b.dataset.piedra }, true); }
    if (b.dataset.otrap != null) { ayuda = false; otraP = otraP == null ? '' : otraP; pinta(); const t = $('#cz-op'); if (t) t.focus(); return; }
    if (b.dataset.otrab != null) { otraB = otraB == null ? '' : null; pinta(); const t = $('#cz-ob'); if (t) t.focus(); return; }
    if (b.dataset.ayuda != null) { ayuda = true; otraP = null; pinta(); return setTimeout(() => ir(1), 200); }
    if (b.dataset.dibuja != null) return dibujar();
    if (b.dataset.base) { otraB = null; const aj = ajustaBase(m, b.dataset.base); if (!aj) return; const antes = D.medida(m); m = aj; if (D.medida(m) !== antes) aviso('Con la base <b>' + esc(nomBase(m.base)) + '</b> tu mesa queda de <b>' + esc(D.medida(m)) + '</b>.'); return pinta(); }
    if (b.dataset.color) return cambia({ color: b.dataset.color });
    if (b.dataset.tab) return verTab(b.dataset.tab);
    if (b.dataset.v) { document.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x === b)); const mn = $('#cz-mano'); if (mn) mn.hidden = true; return visor && visor.vista(b.dataset.v); }
    if (b.dataset.cotas != null) { b.classList.toggle('on'); return visor && visor.cotas(b.classList.contains('on')); }
    if (b.dataset.sillas != null) { b.classList.toggle('on'); return visor && visor.sillas(b.classList.contains('on')); }
    if (b.dataset.ir) { const k = ruta.indexOf(b.dataset.ir); if (k >= 0) { i = k; pinta(); } return; }
    if (b.dataset.si != null) return ir(1);
    if (b.dataset.sig != null) {
      if (otraP === '' && ruta[i] === 'piedra') { const t = $('#cz-op'); if (t) t.focus(); return aviso('Escribe qué piedra buscas, o escoge una de las fotos.'); }
      if (otraB === '' && ruta[i] === 'base') { const t = $('#cz-ob'); if (t) t.focus(); return aviso('Escribe cómo es la base que quieres, o escoge una de las fotos.'); }
      return ir(1);
    }
  });
  box.addEventListener('pointerdown', e => { if (e.target.closest('.cz-3d')) { const mn = $('#cz-mano'); if (mn) mn.hidden = true; } });
  box.addEventListener('input', e => { if (e.target.id === 'cz-op') otraP = e.target.value.slice(0, 110); if (e.target.id === 'cz-ob') otraB = e.target.value.slice(0, 110); if (e.target.id === 'cz-op' || e.target.id === 'cz-ob') res.innerHTML = '<span>' + esc(lineas().join(' · ')) + '</span>'; });
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.dim) { e.preventDefault(); ponerMedidas(); } });
  $('#cz-atras').onclick = () => ir(-1);

  async function enviar(e) {
    e.preventDefault(); const b = $('#cz-b'), err = $('#cz-e'); err.hidden = true;
    const nombre = $('#cz-n').value.trim(), tel = $('#cz-w').value.replace(/\D/g, '');
    if (nombre.length < 2) { err.textContent = 'Escribe tu nombre.'; err.hidden = false; $('#cz-n').focus(); return; }
    if (tel.length < 10 || tel.length > 13) { err.textContent = 'Escribe tu WhatsApp a 10 dígitos: ahí te mandamos tu cotización.'; err.hidden = false; $('#cz-w').focus(); return; }
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const dib = m.base === MIA && miBase;
      const cod = [m.uso, m.forma, m.L, m.W, m.base, m.piedra, m.H].concat(m.color && m.color !== 'negro' ? [m.color] : []).join('.');
      const specs = D.resumen(m).filter(r => r[0] !== 'Fabricación' && !((ayuda || otraP) && r[0] === 'Piedra') && !((otraB || dib) && r[0] === 'Base'))
        .concat(otraP ? [['Piedra', ('Otra: ' + otraP).slice(0, 120)]] : [], otraB ? [['Base', ('Otra: ' + otraB).slice(0, 120)]] : [], dib ? [['Base', 'Dibujada por el cliente (' + D.PERFILES[miBase.perfil].nombre + ')']] : [])
        .concat([['Pidió', 'Cotizador express' + (origen ? ' · ' + origen : '')], ['Confirmó', 'Revisó su mesa en 3D y su plano con medidas']], ayuda ? [['Piedra', 'Quiere que le ayudemos a elegir']] : [], [['Código', cod]]);
      const r = await A.crearPedido(Object.assign({ nombre, tel, notas: ($('#cz-notas') || {}).value || '', items: [{ tipo: 'mesa', titulo: D.titulo(m), cantidad: 1, uso: m.uso, specs, link: SITE + '#d=' + cod }], canal: A.load('dazk-canal', '') }, dib ? { baseCli: Object.assign({}, miBase, { nombre: ('Base de ' + nombre.split(' ')[0]).slice(0, 40) }) } : {}));
      if (fotoFinal) try { await A.guardarFoto(r.token, await chica(fotoFinal, 150000)); } catch (y) {}
      A.save('dazk-yo', Object.assign(A.load('dazk-yo', {}), { nombre, tel }));
      A.save('dazk-pedidos', [{ folio: r.folio, token: r.token, fecha: new Date().toISOString() }].concat(A.load('dazk-pedidos', [])));
      enviado = Object.assign({ nombre }, r); ruta = ruta.concat(['listo']); i = ruta.length - 1; pinta();
    } catch (x) { err.textContent = x.message || 'No se pudo enviar. Intenta de nuevo.'; err.hidden = false; b.disabled = false; b.textContent = 'Pedir mi cotización'; }
  }
  if (!m && ruta[0] !== 'inicio') m = nueva('comedor', 'rect');
  // bases diseñadas en el taller (las que se suben desde el panel)
  if (A.basesPublicas) A.basesPublicas().then(bs => { Object.entries(bs || {}).forEach(([id, b]) => D.registrarBase(id, b)); if (ruta[i] === 'base') pinta(); }).catch(() => {});
  pinta();
})();

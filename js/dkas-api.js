/* DAZK · pedidos: one data layer for the client page, the client's tracking page and the workshop panel.
   With window.DAZK_FB = { apiKey, db } it talks to Firebase (Realtime Database + Auth over REST; rules in firebase/database.rules.json).
   Without it, it runs in demo mode: everything stays in this browser's localStorage.
   Clients are anonymous: an order lives at pedidos/<secret token>, readable only by whoever has the token.
   DAZK staff enter with just their email: Firebase sends a one-time sign-in link that opens taller.html, and the device stays signed in.
   The owner's email is fixed (OWNER) and the owner adds or removes admins in admins/<email with . as ,>. The link also confirms the email, which the rules require. */
(function () {
  const FB = window.DAZK_FB || null, SITE = 'https://creadazk.github.io/';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const ESTADOS = [['nuevo', 'Recibido'], ['cotizado', 'Cotizado'], ['confirmado', 'Confirmado'], ['fabricacion', 'En fabricación'], ['listo', 'Listo'], ['entregado', 'Entregado'], ['cancelado', 'Cancelado']];
  const estado = k => (ESTADOS.find(e => e[0] === k) || [k, k])[1];
  const digits = t => String(t || '').replace(/\D/g, '');
  // Mexican numbers are stored as typed; WhatsApp links need the country code
  const waNum = t => { const d = digits(t); return d.length === 10 ? '52' + d : d; };
  const sortP = p => { p.items = (p.items || []).slice().sort((a, b) => a.pos - b.pos); p.eventos = (p.eventos || []).slice().sort((a, b) => a.id - b.id); return p; };
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  // where a visitor came from, as a short channel name: a campaign link (?c=instagram) or the site that sent them
  function canalDe(x) {
    const s = String(x || '').toLowerCase();
    if (/instagram/.test(s)) return 'instagram'; if (/facebook|fb\.(com|me)|messenger/.test(s)) return 'facebook'; if (/whatsapp|wa\.me/.test(s)) return 'whatsapp';
    if (/tiktok/.test(s)) return 'tiktok'; if (/google/.test(s)) return 'google'; if (s === 'link compartido') return 'compartido';
    return s.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30);
  }
  // first name and last initial for public reviews
  const pesos = n => '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const corto = n => { const w = String(n).trim().split(/\s+/); return w[0] + (w[1] ? ' ' + w[1][0].toUpperCase() + '.' : ''); };
  function cliente(p) {
    const nombre = String(p.nombre || '').trim().slice(0, 80), tel = digits(p.tel);
    if (nombre.length < 2) throw new Error('Escribe a nombre de quién apartamos la mesa.');
    if (tel && (tel.length < 10 || tel.length > 13)) throw new Error('Revisa tu número de WhatsApp (10 dígitos) o déjalo vacío.');
    if (!p.items || !p.items.length || p.items.length > 12) throw new Error('El pedido debe tener entre 1 y 12 productos.');
    const canal = canalDe(p.canal);
    return Object.assign({ nombre, notas: String(p.notas || '').trim().slice(0, 1000) }, tel ? { tel } : {}, canal ? { canal } : {});
  }

  // ---------- Firebase ----------
  const TS = { '.sv': 'timestamp' };
  let ses = load('dazk-ses', null), yoCache = null;
  async function jfetch(url, opt) {
    let r;
    try { r = await fetch(url, opt); } catch (e) { throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.'); }
    const j = await r.json().catch(() => null);
    if (!r.ok) { const m = j && j.error && (j.error.message || j.error); const e = new Error(m || 'Error ' + r.status); e.status = r.status; e.code = String(m || ''); throw e; }
    return j;
  }
  const idp = (path, body) => jfetch('https://' + path + '?key=' + FB.apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const setSes = j => { ses = j && { idToken: j.idToken, refreshToken: j.refreshToken, uid: j.localId, email: j.email, exp: Date.now() + j.expiresIn * 1000 }; yoCache = null; save('dazk-ses', ses); };
  async function idToken() {
    if (!ses) throw new Error('Tu sesión terminó. Vuelve a entrar.');
    if (Date.now() > ses.exp - 60000) {
      try { const j = await idp('securetoken.googleapis.com/v1/token', { grant_type: 'refresh_token', refresh_token: ses.refreshToken }); Object.assign(ses, { idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + j.expires_in * 1000 }); save('dazk-ses', ses); }
      // only a rejected session signs you out; no signal just means try again later
      catch (e) { if (!e.status || e.status >= 500) throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.'); setSes(null); throw new Error('Tu sesión terminó. Vuelve a entrar.'); }
    }
    return ses.idToken;
  }
  async function db(path, method, body, auth) {
    const q = auth ? '?auth=' + await idToken() : '';
    return jfetch(FB.db + '/' + path + '.json' + q, { method: method || 'GET', body: body === undefined ? undefined : JSON.stringify(body) });
  }
  const denied = e => e.status === 401 || e.status === 403;
  // one order as the pages expect it; internal notes (staff only) are merged into the history
  function shape(t, p, notas) {
    const ev = Object.entries(p.eventos || {}).map(([k, e]) => Object.assign({ key: k, interno: false }, e))
      .concat(Object.entries(notas || {}).map(([k, e]) => Object.assign({ key: k }, e, { interno: true })))
      .sort((a, b) => a.creado - b.creado || (a.key < b.key ? -1 : 1));
    return Object.assign({}, p, { id: t, token: t, notas: p.notas || '', items: Object.values(p.items || {}).map((it, i) => Object.assign({ cantidad: 1 }, it, { pos: i + 1 })), eventos: ev.map((e, i) => Object.assign(e, { id: i + 1 })) });
  }
  // the shared panel account: its password is the panel code, and the rules give its uid the same access as the team
  const PANEL_EMAIL = 'panel@creadazk.github.io', PANEL_UID = 'sSOabJv4HySaB6vyQAdNgzew65l1';
  const OWNER = 'i55969072@gmail.com', ekey = e => String(e).trim().toLowerCase().replace(/\./g, ',');
  const emailOk = e => { e = String(e || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error('Revisa el correo.'); return e; };
  const itemsDe = l => l.map(it => Object.assign({ tipo: ['mesa', 'sillas', 'bancos'].includes(it.tipo) ? it.tipo : 'mesa', titulo: String(it.titulo || 'Mesa').slice(0, 160), cantidad: Math.max(1, Math.min(99, +it.cantidad || 1)),
    specs: (it.specs || []).slice(0, 20).map(s => [String(s[0]).slice(0, 120), String(s[1]).slice(0, 120)]) }, it.uso ? { uso: String(it.uso).slice(0, 20) } : {},
    // only links to our own configurator are stored, so staff never open a foreign URL; dkas.mx links are kept as creadazk.github.io (the database rule wants it, and it redirects)
    /^https:\/\/(dkas\.mx|creadazk\.github\.io)\//.test(it.link || '') ? { link: (SITE + it.link.replace(/^https:\/\/[^/]+\//, '')).slice(0, 600) } : {}));
  const authErr = e => /QUOTA_EXCEEDED/.test(e.code) ? 'Por hoy ya se mandaron todos los correos de entrada que permite el plan gratis de Firebase (5 al día). Mañana vuelve a funcionar; si ya entraste en otro aparato, úsalo ahí.' : /TOO_MANY_ATTEMPTS/.test(e.code) ? 'Demasiados intentos. Espera unos minutos.' : /INVALID_LOGIN|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|USER_DISABLED/.test(e.code) ? 'Correo o contraseña incorrectos.'
    : /EXPIRED_OOB|INVALID_OOB/.test(e.code) ? 'Este enlace ya se usó o caducó. Escribe tu correo otra vez y te mandamos otro.' : /WEAK_PASSWORD/.test(e.code) ? 'Esa contraseña es muy débil: usa al menos 8 caracteres.' : e.message;
  // Spanish email with a one-time sign-in link; Google's page sends it on to taller.html?mode=signIn&oobCode=… (creadazk.github.io is an authorized domain)
  const enviarLink = email => jfetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FB.apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'es' }, body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: SITE + 'taller.html?e=' + encodeURIComponent(email), canHandleCodeInApp: true }) });
  const real = {
    async crearPedido(p, staff) {
      const c = cliente(p), items = itemsDe(p.items), me = staff && await this.yo();
      // the folio counter and the order are written together; if someone else took the number first the rules reject it and we try the next one
      for (let i = 0; i < 6; i++) {
        const folio = ((await db('folio')) || 1000) + 1, t = rnd();
        const ped = Object.assign({ folio, estado: 'nuevo', creado: TS, actualizado: TS, items, eventos: { e0: staff ? { creado: TS, autor: 'dazk', autor_nombre: me.nombre, tipo: 'creado', texto: 'Pedido capturado en el panel.' } : { creado: TS, autor: 'cliente', autor_nombre: c.nombre, tipo: 'creado', texto: 'Pedido enviado desde Crea tu mesa.' } } }, c);
        try { await db('', 'PATCH', { folio, ['pedidos/' + t]: ped }, !!staff); return { folio, token: t }; }
        catch (e) { if (!denied(e)) throw e; }
      }
      throw new Error('No se pudo guardar el pedido. Intenta de nuevo en un momento.');
    },
    async verPedido(t) { const p = await db('pedidos/' + t); if (!p) throw new Error('No encontramos ese pedido.'); return shape(t, p); },
    async clienteMensaje(t, texto) {
      const nombre = await db('pedidos/' + t + '/nombre'); if (!nombre) throw new Error('No encontramos ese pedido.');
      await db('pedidos/' + t + '/eventos', 'POST', { creado: TS, autor: 'cliente', autor_nombre: nombre, tipo: 'mensaje', texto: String(texto).slice(0, 2000) });
      await db('pedidos/' + t + '/actualizado', 'PUT', TS);
    },
    // entry link by email (new admins); everyone can then set a password with crearClave and sign in with entrarConClave
    async pedirEnlace(email) { email = emailOk(email); save('dazk-correo', email); try { await enviarLink(email); } catch (e) { throw new Error(authErr(e)); } return null; },
    async reenviar(email) { try { await enviarLink(emailOk(email)); } catch (e) { throw new Error(authErr(e)); } },
    async entrarConCodigo(code) {
      try { setSes(await idp('identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', { email: PANEL_EMAIL, password: String(code || ''), returnSecureToken: true })); }
      catch (e) { throw new Error(/INVALID_LOGIN|INVALID_PASSWORD|MISSING_PASSWORD/.test(e.code) ? 'Código incorrecto.' : authErr(e)); }
      return this.yo();
    },
    async entrarConClave(email, pass) {
      email = emailOk(email); save('dazk-correo', email);
      try { setSes(await idp('identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', { email, password: pass, returnSecureToken: true })); }
      catch (e) { throw new Error(/INVALID_LOGIN|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(e.code) ? 'Correo o contraseña incorrectos. Si todavía no tienes contraseña, toca «Crear o cambiar mi contraseña».' : authErr(e)); }
      const me = await this.yo(); if (!me) { setSes(null); throw new Error('Este correo no tiene acceso al panel de DAZK. Pídele al dueño que te agregue.'); }
      return me;
    },
    // Google's own page lets the person type the new password; an email that never signed in has no account yet, so it gets the entry link instead
    async crearClave(email) {
      email = emailOk(email); save('dazk-correo', email);
      try { await jfetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FB.apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'es' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email, continueUrl: SITE + 'taller.html' }) }); }
      catch (e) { if (!/EMAIL_NOT_FOUND/.test(e.code)) throw new Error(authErr(e)); try { await enviarLink(email); } catch (x) { throw new Error(authErr(x)); } }
    },
    async conEnlace(email, oob) {
      email = emailOk(email);
      try { setSes(await idp('identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink', { email, oobCode: oob })); } catch (e) { throw new Error(authErr(e)); }
      const me = await this.yo(); if (!me) { setSes(null); throw new Error('Este correo no tiene acceso al panel de DAZK. Pídele al dueño que te agregue.'); }
      return me;
    },
    logout() { setSes(null); },
    async yo() {
      if (!ses) return null;
      // the panel account has no admins/ entry; each device keeps the name of whoever uses it
      if (ses.uid === PANEL_UID) return { uid: ses.uid, email: ses.email, key: 'panel', duenio: false, panel: true, nombre: load('dazk-nombre', '') };
      if (!yoCache) {
        const k = ekey(ses.email), duenio = ses.email.toLowerCase() === OWNER;
        const s = await db('admins/' + k, 'GET', undefined, true).catch(e => { if (denied(e)) return false; throw e; });
        yoCache = s === false ? null : (s || duenio) ? { uid: ses.uid, email: ses.email, key: k, duenio, nombre: s ? s.nombre : '' } : null;
      }
      return yoCache;
    },
    // the owner's own name (asked once, it signs the history)
    async ponerNombre(nombre) {
      const me = await this.yo(); nombre = String(nombre || '').trim().slice(0, 60); if (nombre.length < 2) throw new Error('Escribe tu nombre.');
      if (me.panel) return save('dazk-nombre', nombre);
      await db('admins/' + me.key, 'PUT', { nombre, email: me.email.toLowerCase(), agregado: TS }, true); yoCache = null;
    },
    async admins() { return Object.entries((await db('admins', 'GET', undefined, true)) || {}).map(([k, a]) => Object.assign({ key: k, duenio: a.email === OWNER }, a)).sort((a, b) => a.agregado - b.agregado); },
    // owner only: the person is added and gets their entry link by email right away
    async agregarAdmin(email, nombre) {
      email = emailOk(email); nombre = String(nombre || '').trim().slice(0, 60); if (nombre.length < 2) throw new Error('Escribe el nombre de la persona.');
      await db('admins/' + ekey(email), 'PUT', { nombre, email, agregado: TS }, true);
      await enviarLink(email).catch(() => {});
    },
    async quitarAdmin(k) { await db('admins/' + k, 'DELETE', undefined, true); },
    async listar() {
      const [ps, ns, fs, rp, pg] = await Promise.all(['pedidos', 'interno', 'fichas', 'resenas_publicas', 'pagos'].map(n => db(n, 'GET', undefined, true)));
      return Object.entries(ps || {}).map(([t, p]) => Object.assign(shape(t, p, (ns || {})[t]), { fichas: (fs || {})[t] || {}, resenaPublica: !!(rp || {})[t],
        pagos: Object.entries((pg || {})[t] || {}).map(([k, x]) => Object.assign({ id: k }, x)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado - b.creado) })).sort((a, b) => b.actualizado - a.actualizado);
    },
    // money that came in for an order, and what DAZK spends
    async agregarPago(id, x) { const me = await this.yo(); await db('pagos/' + id, 'POST', Object.assign({}, x, { por: me.nombre, creado: TS }), true); await this.staffMensaje(id, 'Registró un pago de ' + pesos(x.monto) + ' (' + x.metodo + ').', true); },
    async borrarPago(id, pid, x) { await db('pagos/' + id + '/' + pid, 'DELETE', undefined, true); await this.staffMensaje(id, 'Borró el pago de ' + pesos(x.monto) + ' del ' + x.fecha + '.', true); },
    async gastos() { return Object.entries((await db('gastos', 'GET', undefined, true)) || {}).map(([k, x]) => Object.assign({ id: k }, x)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado); },
    async agregarGasto(x) { const me = await this.yo(); await db('gastos', 'POST', Object.assign({}, x, { por: me.nombre, creado: TS }), true); },
    async borrarGasto(id) { await db('gastos/' + id, 'DELETE', undefined, true); },
    // what the public page shows: notice, WhatsApp numbers, hidden models and stones
    // the owner's costs and monthly goal (staff only)
    async config() { return (await db('config/tarifa', 'GET', undefined, true)) || {}; },
    async guardarConfig(c) { await db('config/tarifa', 'PUT', Object.assign({}, c, { actualizado: TS }), true); },
    async publico() { return (await db('publico')) || {}; },
    async guardarPublico(c) { await db('publico', 'PUT', Object.assign({}, c, { actualizado: TS }), true); },
    async staffMensaje(id, texto, interno) {
      const me = await this.yo(), ev = { creado: TS, autor: 'dazk', autor_nombre: me.nombre, tipo: interno ? 'nota' : 'mensaje', texto: String(texto).slice(0, 4000) };
      await db((interno ? 'interno/' + id : 'pedidos/' + id + '/eventos'), 'POST', ev, true);
      await db('pedidos/' + id + '/actualizado', 'PUT', TS, true);
    },
    // the quote the client sees in their link; sending it marks the order as quoted
    async enviarCotizacion(id, cot) {
      const me = await this.yo(), k = Date.now().toString(36) + rnd().slice(0, 6);
      await db('pedidos/' + id, 'PATCH', { cotizacion: Object.assign({}, cot, { enviada: TS }), estado: 'cotizado', actualizado: TS,
        ['eventos/' + k]: { creado: TS, autor: 'dazk', autor_nombre: me.nombre, tipo: 'estado', texto: 'Cotizado' },
        ['eventos/' + k + 'm']: { creado: TS, autor: 'dazk', autor_nombre: me.nombre, tipo: 'mensaje', texto: 'Te enviamos tu cotización. Revísala arriba y, si estás de acuerdo, toca «Acepto la cotización».' } }, true);
    },
    async dejarResena(t, r) { await db('pedidos/' + t, 'PATCH', { resena: Object.assign({}, r, { creado: TS }), actualizado: TS }); },
    async publicarResena(p) { await db('resenas_publicas/' + p.id, 'PUT', { nombre: corto(p.nombre), estrellas: p.resena.estrellas, texto: p.resena.texto || '', fecha: TS }, true); },
    async quitarResena(id) { await db('resenas_publicas/' + id, 'DELETE', undefined, true); },
    async resenas() { return Object.values((await jfetch(FB.db + '/resenas_publicas.json?orderBy=' + encodeURIComponent('"fecha"') + '&limitToLast=12')) || {}).sort((a, b) => b.fecha - a.fecha); },
    async aceptarCotizacion(p) {
      const k = Date.now().toString(36) + rnd().slice(0, 6);
      await db('pedidos/' + p.token, 'PATCH', Object.assign({ 'cotizacion/aceptada': TS, actualizado: TS,
        ['eventos/' + k]: { creado: TS, autor: 'cliente', autor_nombre: p.nombre, tipo: 'acepto', texto: 'Aceptó la cotización.' } }, p.estado === 'cotizado' ? { estado: 'confirmado' } : {}));
    },
    async staffEstado(id, est) {
      const me = await this.yo();
      await db('pedidos/' + id, 'PATCH', { estado: est, actualizado: TS }, true);
      await db('pedidos/' + id + '/eventos', 'POST', { creado: TS, autor: 'dazk', autor_nombre: me.nombre, tipo: 'estado', texto: estado(est) }, true);
    },
    // fabrication sheet of one piece ('i0', 'i1'…) or the order's price and delivery ('pago'); staff only, and every save is noted in the history
    async guardarFicha(id, key, data, nota) {
      await db('fichas/' + id + '/' + key, Object.keys(data).length ? 'PUT' : 'DELETE', Object.keys(data).length ? data : undefined, true);
      await this.staffMensaje(id, nota, true);
    },
    // one record per visit to the client page (no personal data unless that device already sent an order); only staff can read them
    async visita(id, data, primera) { await db('visitas/' + id, 'PATCH', Object.assign({ ult: TS }, primera ? { t: TS } : {}, data)); },
    // the picture of the client's design: fotos/<token>, written once when the order is sent
    async guardarFoto(t, url, staff) { await db('fotos/' + t, 'PUT', url, !!staff); },
    async verFoto(t) { return db('fotos/' + t); },
    // bases diseñadas en el panel: todos las leen (la página de clientes también), solo el taller las escribe
    async basesPublicas() { return (await db('catalogo/bases')) || {}; },
    async guardarBase(id, b) { await db('catalogo/bases/' + id, 'PUT', b, true); },
    async borrarBase(id) { await db('catalogo/bases/' + id, 'DELETE', undefined, true); },
    async visitas() { const q = '?orderBy=' + encodeURIComponent('"t"') + '&limitToLast=1000&auth=' + await idToken(); return Object.values((await jfetch(FB.db + '/visitas.json' + q)) || {}).sort((a, b) => b.t - a.t); },
  };

  // ---------- demo (this browser only) ----------
  const ddb = () => load('dazk-demo-db', { folio: 1000, pedidos: [] });
  const now = () => new Date().toISOString();
  function edit(find, fn) {
    const d = ddb(), p = d.pedidos.find(find); if (!p) throw new Error('No encontramos ese pedido.');
    fn(p, t => p.eventos.push(Object.assign({ id: p.eventos.length + 1, creado: now(), interno: false }, t)));
    p.actualizado = now(); save('dazk-demo-db', d);
  }
  const who = () => load('dazk-demo-yo', null);
  const demo = {
    async crearPedido(p, staff) {
      const c = cliente(p), d = ddb(), ped = Object.assign({ id: rnd(), folio: ++d.folio, token: rnd(), estado: 'nuevo', creado: now(), actualizado: now(),
        items: p.items.map((it, i) => Object.assign({ cantidad: 1 }, it, { pos: i + 1 })),
        eventos: [staff ? { id: 1, creado: now(), autor: 'dazk', autor_nombre: who().nombre, tipo: 'creado', texto: 'Pedido capturado en el panel.', interno: false } : { id: 1, creado: now(), autor: 'cliente', autor_nombre: c.nombre, tipo: 'creado', texto: 'Pedido enviado desde Crea tu mesa.', interno: false }] }, c);
      d.pedidos.push(ped); save('dazk-demo-db', d);
      return { folio: ped.folio, token: ped.token };
    },
    async verPedido(t) {
      const p = ddb().pedidos.find(x => x.token === t); if (!p) throw new Error('No encontramos ese pedido.');
      return sortP(Object.assign({}, p, { eventos: p.eventos.filter(e => !e.interno) }));
    },
    async clienteMensaje(t, texto) { edit(x => x.token === t, (p, ev) => ev({ autor: 'cliente', autor_nombre: p.nombre, tipo: 'mensaje', texto })); },
    // demo: no emails are sent; the owner's email or an added admin enters right away
    async pedirEnlace(email) { email = emailOk(email); const a = load('dazk-demo-admins', {})[ekey(email)], duenio = email === OWNER;
      if (!a && !duenio) throw new Error('Este correo no tiene acceso al panel de DAZK. Pídele al dueño que te agregue.');
      const me = { email, key: ekey(email), duenio, nombre: a ? a.nombre : '' }; save('dazk-demo-yo', me); return me; },
    async conEnlace() { return who(); },
    async entrarConClave(email) { return this.pedirEnlace(email); },
    // demo: any 6 digits; the real code lives only in Firebase
    async entrarConCodigo(code) { if (!/^[0-9]{6}$/.test(String(code))) throw new Error('Código incorrecto.'); return this.pedirEnlace(OWNER); },
    async crearClave(email) { emailOk(email); },
    async reenviar(email) { emailOk(email); },
    async ponerNombre(nombre) { const me = who(); nombre = String(nombre || '').trim(); if (nombre.length < 2) throw new Error('Escribe tu nombre.'); const d = load('dazk-demo-admins', {}); d[me.key] = { nombre, email: me.email, agregado: Date.now() }; save('dazk-demo-admins', d); save('dazk-demo-yo', Object.assign(me, { nombre })); },
    async admins() { return Object.entries(load('dazk-demo-admins', {})).map(([k, a]) => Object.assign({ key: k, duenio: a.email === OWNER }, a)).sort((a, b) => a.agregado - b.agregado); },
    async agregarAdmin(email, nombre) { email = emailOk(email); nombre = String(nombre || '').trim(); if (nombre.length < 2) throw new Error('Escribe el nombre de la persona.'); const d = load('dazk-demo-admins', {}); d[ekey(email)] = { nombre, email, agregado: Date.now() }; save('dazk-demo-admins', d); },
    async quitarAdmin(k) { const d = load('dazk-demo-admins', {}); delete d[k]; save('dazk-demo-admins', d); },
    async agregarPago(id, x) { edit(q => q.id === id, (p, ev) => { p.pagos = (p.pagos || []).concat(Object.assign({ id: rnd() }, x, { por: who().nombre, creado: Date.now() })); ev({ autor: 'dazk', autor_nombre: who().nombre, tipo: 'nota', texto: 'Registró un pago de ' + pesos(x.monto) + ' (' + x.metodo + ').', interno: true }); }); },
    async borrarPago(id, pid, x) { edit(q => q.id === id, (p, ev) => { p.pagos = (p.pagos || []).filter(y => y.id !== pid); ev({ autor: 'dazk', autor_nombre: who().nombre, tipo: 'nota', texto: 'Borró el pago de ' + pesos(x.monto) + ' del ' + x.fecha + '.', interno: true }); }); },
    async gastos() { return load('dazk-demo-gastos', []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado); },
    async agregarGasto(x) { save('dazk-demo-gastos', load('dazk-demo-gastos', []).concat(Object.assign({ id: rnd() }, x, { por: who().nombre, creado: Date.now() }))); },
    async borrarGasto(id) { save('dazk-demo-gastos', load('dazk-demo-gastos', []).filter(x => x.id !== id)); },
    async config() { return load('dazk-demo-config', {}); },
    async guardarConfig(c) { save('dazk-demo-config', c); },
    async publico() { return load('dazk-demo-publico', {}); },
    async guardarPublico(c) { save('dazk-demo-publico', Object.assign({}, c, { actualizado: Date.now() })); },
    logout() { save('dazk-demo-yo', null); },
    async yo() { return who(); },
    async listar() { const rp = load('dazk-demo-resenas', {}); return ddb().pedidos.map(p => Object.assign(sortP(p), { resenaPublica: !!rp[p.id], pagos: (p.pagos || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)) })).sort((a, b) => b.actualizado.localeCompare(a.actualizado)); },
    async staffMensaje(id, texto, interno) { edit(x => x.id === id, (p, ev) => ev({ autor: 'dazk', autor_nombre: who().nombre, tipo: interno ? 'nota' : 'mensaje', texto, interno: !!interno })); },
    async guardarFicha(id, key, data, nota) { edit(x => x.id === id, (p, ev) => { p.fichas = p.fichas || {}; p.fichas[key] = data; ev({ autor: 'dazk', autor_nombre: who().nombre, tipo: 'nota', texto: nota, interno: true }); }); },
    async visita(id, data, primera) { const d = load('dazk-demo-visitas', {}); d[id] = Object.assign({}, d[id], primera ? { t: Date.now() } : {}, { ult: Date.now() }, data); save('dazk-demo-visitas', d); },
    async visitas() { return Object.values(load('dazk-demo-visitas', {})).sort((a, b) => b.t - a.t); },
    async enviarCotizacion(id, cot) { edit(x => x.id === id, (p, ev) => { p.cotizacion = Object.assign({}, cot, { enviada: Date.now() }); p.estado = 'cotizado'; ev({ autor: 'dazk', autor_nombre: who().nombre, tipo: 'estado', texto: 'Cotizado' }); ev({ autor: 'dazk', autor_nombre: who().nombre, tipo: 'mensaje', texto: 'Te enviamos tu cotización. Revísala arriba y, si estás de acuerdo, toca «Acepto la cotización».' }); }); },
    async dejarResena(t, r) { edit(x => x.token === t, p => { p.resena = Object.assign({}, r, { creado: Date.now() }); }); },
    async publicarResena(q) { const d = load('dazk-demo-resenas', {}); d[q.id] = { nombre: corto(q.nombre), estrellas: q.resena.estrellas, texto: q.resena.texto || '', fecha: Date.now() }; save('dazk-demo-resenas', d); },
    async quitarResena(id) { const d = load('dazk-demo-resenas', {}); delete d[id]; save('dazk-demo-resenas', d); },
    async resenas() { return Object.values(load('dazk-demo-resenas', {})).sort((a, b) => b.fecha - a.fecha); },
    async aceptarCotizacion(q) { edit(x => x.token === q.token, (p, ev) => { p.cotizacion.aceptada = Date.now(); if (p.estado === 'cotizado') p.estado = 'confirmado'; ev({ autor: 'cliente', autor_nombre: p.nombre, tipo: 'acepto', texto: 'Aceptó la cotización.' }); }); },
    async guardarFoto(t, url) { const d = load('dazk-demo-fotos', {}); d[t] = url; save('dazk-demo-fotos', d); },
    async verFoto(t) { return load('dazk-demo-fotos', {})[t] || null; },
    async basesPublicas() { return load('dazk-demo-bases', {}); },
    async guardarBase(id, b) { const d = load('dazk-demo-bases', {}); d[id] = b; save('dazk-demo-bases', d); },
    async borrarBase(id) { const d = load('dazk-demo-bases', {}); delete d[id]; save('dazk-demo-bases', d); },
    async staffEstado(id, est) { edit(x => x.id === id, (p, ev) => { p.estado = est; ev({ autor: 'dazk', autor_nombre: who().nombre, tipo: 'estado', texto: estado(est) }); }); },
  };

  window.DAZK_API = Object.assign(FB ? real : demo, { demo: !FB, rnd, canal: canalDe, ESTADOS, estado, waNum, load, save,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    fecha: t => new Date(t).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    pesos, OWNER,
    dia: d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
    seguimiento: t => new URL('pedido.html#t=' + t, location.href).href });
})();

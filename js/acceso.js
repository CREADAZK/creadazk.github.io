/* DKAS · acceso privado al diseñador 3D. Solo entra quien el taller aprueba en el panel (Accesos) o quien abre un link especial
   (https://dkas.mx/?acceso=<token>). El visitante pide acceso con nombre y apellido; la solicitud vive en solicitudes/<id> y la página
   revisa sola si ya se aprobó. El taller (sesión del panel en este navegador) siempre entra. */
(function () {
  const A = window.DAZK_API, WA = window.DKAS_WA, $ = s => document.querySelector(s), esc = A.esc;
  const caja = $('#acceso'); if (!caja) return;
  const staff = !!A.load('dazk-ses', null);
  let mio = A.load('dkas-acceso', null); // { tipo: 'sol' | 'link', id, nombre }
  let espera = null;

  function abrir() {
    window.DKAS_ACC_ID = mio && mio.id; document.dispatchEvent(new Event('dkas-acceso'));
    document.body.classList.add('con-acceso'); clearTimeout(espera);
    // el 3D se midió escondido: que se vuelva a acomodar
    setTimeout(() => dispatchEvent(new Event('resize')), 50);
  }
  function cerrar() { document.body.classList.remove('con-acceso'); }
  const waTxt = n => 'https://wa.me/' + WA[0].num + '?text=' + encodeURIComponent('Hola DKAS, soy ' + n + '. Pedí acceso para cotizar en dkas.mx.');

  // ---------- lo que ve quien todavía no tiene acceso ----------
  const BENEFICIOS = ['Cotizador rápido en 1 minuto', 'Tu mesa en 3D a escala real', 'Medidas libres al centímetro', 'Factibilidad al instante', 'Ficha técnica y plano en PDF', 'Archivos DXF, OBJ y GLB', 'Verla en tu espacio desde el celular'];
  function pintar(estado, s) {
    const lista = '<ul class="acc-ben">' + BENEFICIOS.map(b => '<li>' + b + '</li>').join('') + '</ul>';
    const cab = '<p class="et">Acceso privado</p><h2>Cotiza y diseña <em>con DKAS.</em></h2>';
    if (estado === 'pendiente') {
      caja.innerHTML = '<div class="acc-w">' + cab + '<div class="acc-est"><span class="pulso"></span><div><b>Solicitud enviada, ' + esc(s.nombre) + '.</b><p>La estamos revisando. En cuanto la aprobemos, esta página se abre sola en este dispositivo.</p></div></div>'
        + '<a class="btn" href="' + waTxt((s.nombre + ' ' + (s.apellido === '(web)' ? '' : s.apellido || '')).trim()) + '" target="_blank" rel="noopener">¿Prisa? Escríbenos por WhatsApp</a>' + lista + '</div>';
      return;
    }
    caja.innerHTML = '<div class="acc-w">' + cab
      + (estado === 'rechazada' ? '<div class="acc-est no"><div><b>No pudimos aprobar tu solicitud.</b><p>Escríbenos por WhatsApp y lo vemos contigo, o envía otra solicitud.</p></div></div>'
        : '<p class="sub">' + (window.DKAS_QUIERE && /^Quiero una así: /.test(DKAS_QUIERE) ? 'Te gustó «' + esc(DKAS_QUIERE.replace(/^Quiero una así: /, '')) + '». ' : '') + 'Para cotizar y diseñar tu mesa necesitas acceso. Déjanos tu nombre, apellido y WhatsApp; en cuanto lo aprobemos, esta página se abre sola.</p>')
      + '<form id="acc-f" class="acc-f"><div class="f2"><label>Nombre<input id="acc-nom" required minlength="2" maxlength="60" autocomplete="given-name" placeholder="Tu nombre"></label>'
      + '<label>Apellido<input id="acc-ap" required minlength="2" maxlength="60" autocomplete="family-name" placeholder="Tu apellido"></label>'
      + '<label>WhatsApp<input id="acc-tel" required inputmode="tel" maxlength="16" autocomplete="tel" placeholder="10 dígitos"></label></div>'
      + '<p class="err" id="acc-err" hidden></p><button class="btn oro form-btn" id="acc-b">Solicitar acceso</button></form>'
      + lista + '<p class="nota">¿Te mandamos un link de acceso? Ábrelo y entras directo.</p></div>';
    const yo = A.load('dazk-yo', {}); if (yo.nombre && !$('#acc-nom').value) { const [a0, ...a1] = yo.nombre.trim().split(/\s+/); $('#acc-nom').value = a0; if (a1.length) $('#acc-ap').value = a1.join(' '); }
    if (yo.tel) $('#acc-tel').value = yo.tel;
    $('#acc-f').onsubmit = async e => {
      e.preventDefault(); const b = $('#acc-b'), err = $('#acc-err'); err.hidden = true; b.disabled = true; b.textContent = 'Enviando…';
      try {
        const n0 = $('#acc-nom').value.trim(), ap = $('#acc-ap').value.trim(), tel = $('#acc-tel').value.replace(/\D/g, '');
        if (n0.length < 2) throw new Error('Escribe tu nombre.');
        if (ap.length < 2) throw new Error('Escribe tu apellido.');
        if (tel.length < 10) throw new Error('Escribe tu WhatsApp a 10 dígitos para mandarte el acceso.');
        const id = A.rnd(), s = { nombre: n0, apellido: ap, tel, despacho: '', quiere: String(window.DKAS_QUIERE || 'Cotizar y diseñar su mesa').slice(0, 80), v: A.load('dazk-v', null) };
        await A.solicitarAcceso(id, s);
        mio = { tipo: 'sol', id, nombre: (s.nombre + ' ' + (s.apellido === '(web)' ? '' : s.apellido)).trim() }; A.save('dkas-acceso', mio);
        A.save('dazk-yo', Object.assign(A.load('dazk-yo', {}), { nombre: mio.nombre }, s.tel.trim() ? { tel: s.tel.trim() } : {}, s.despacho.trim() ? { despacho: s.despacho.trim() } : {}));
        if (window.DKAS_VISITA) try { DKAS_VISITA(1); } catch (y) {} // la visita guarda su WhatsApp para que el panel le pueda escribir
        pintar('pendiente', { nombre: s.nombre.trim(), apellido: s.apellido === '(web)' ? '' : s.apellido }); revisar();
      } catch (x) { err.textContent = x.message; err.hidden = false; b.disabled = false; b.textContent = 'Solicitar acceso'; }
    };
  }

  // ---------- revisar el acceso guardado contra la base de datos ----------
  async function revisar() {
    clearTimeout(espera);
    if (!mio) return pintar('nuevo');
    try {
      if (mio.tipo === 'link') {
        const a = await A.verAcceso(mio.id);
        if (a && a.activo) { mio.ok = true; A.save('dkas-acceso', mio); return abrir(); }
        mio = null; A.save('dkas-acceso', null); cerrar(); return pintar('nuevo');
      }
      const s = await A.verSolicitud(mio.id);
      if (!s) { mio = null; A.save('dkas-acceso', null); cerrar(); return pintar('nuevo'); }
      if (s.estado === 'aprobada') { mio.ok = true; A.save('dkas-acceso', mio); return abrir(); }
      cerrar();
      if (s.estado === 'rechazada') { mio = null; A.save('dkas-acceso', null); return pintar('rechazada'); }
      pintar('pendiente', s);
      espera = setTimeout(revisar, 15000); // se abre sola cuando la aprueban
    } catch (e) {
      // sin conexión: quien ya tenía acceso sigue adentro; los demás vuelven a intentar
      if (!document.body.classList.contains('con-acceso')) espera = setTimeout(revisar, 20000);
    }
  }

  (async function () {
    if (staff) { window.DKAS_STAFF = true; return abrir(); }
    // Mi pedido: el link que le mandamos (pedido.html#t=<token>) ya es su llave; entra directo, sin pedir acceso
    if (/pedido\.html$/.test(location.pathname) && (/t=[0-9a-f]{16,64}/.test(location.hash) || A.load('dazk-pedidos', []).length)) return abrir();
    // link especial: ?acceso=<token>
    const q = new URLSearchParams(location.search), t = (q.get('acceso') || '').toLowerCase();
    if (/^[0-9a-f]{32}$/.test(t)) {
      q.delete('acceso'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + (location.hash || '#app'));
      try {
        const a = await A.verAcceso(t);
        if (a && a.activo) {
          mio = { tipo: 'link', id: t, nombre: a.nombre }; A.save('dkas-acceso', mio); abrir();
          if (!location.hash || location.hash === '#') location.hash = '#app';
          return;
        }
      } catch (e) {}
    }
    // quien ya tenía acceso entra de inmediato; se confirma por detrás
    if (mio && mio.ok) abrir();
    await revisar();
    if (document.body.classList.contains('con-acceso') && mio) { mio.ok = true; A.save('dkas-acceso', mio); }
  })();
})();

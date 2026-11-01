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
    document.body.classList.add('con-acceso'); clearTimeout(espera);
    // el 3D se midió escondido: que se vuelva a acomodar
    setTimeout(() => dispatchEvent(new Event('resize')), 50);
  }
  function cerrar() { document.body.classList.remove('con-acceso'); }
  const waTxt = n => 'https://wa.me/' + WA[0].num + '?text=' + encodeURIComponent('Hola DKAS, soy ' + n + '. Pedí acceso al diseñador 3D en dkas.mx.');

  // ---------- lo que ve quien todavía no tiene acceso ----------
  const BENEFICIOS = ['Tu mesa en 3D a escala real', 'Medidas libres al centímetro', 'Factibilidad al instante', 'Ficha técnica y plano en PDF', 'Archivos DXF, OBJ y GLB', 'Verla en tu espacio desde el celular'];
  function pintar(estado, s) {
    const lista = '<ul class="acc-ben">' + BENEFICIOS.map(b => '<li>' + b + '</li>').join('') + '</ul>';
    const cab = '<p class="et">Acceso privado</p><h2>Diseñador 3D <em>DKAS.</em></h2>';
    if (estado === 'pendiente') {
      caja.innerHTML = '<div class="acc-w">' + cab + '<div class="acc-est"><span class="pulso"></span><div><b>Solicitud enviada, ' + esc(s.nombre) + '.</b><p>La estamos revisando. En cuanto la aprobemos, esta página se abre sola en este dispositivo.</p></div></div>'
        + '<a class="btn" href="' + waTxt(s.nombre + ' ' + s.apellido) + '" target="_blank" rel="noopener">¿Prisa? Escríbenos por WhatsApp</a>' + lista + '</div>';
      return;
    }
    caja.innerHTML = '<div class="acc-w">' + cab
      + (estado === 'rechazada' ? '<div class="acc-est no"><div><b>No pudimos aprobar tu solicitud.</b><p>Escríbenos por WhatsApp y lo vemos contigo, o envía otra solicitud.</p></div></div>'
        : '<p class="sub">El configurador 3D, con medidas, ficha técnica y archivos para tu proyecto, es exclusivo para clientes y arquitectos de DKAS. Déjanos tus datos y te damos acceso.</p>')
      + '<form id="acc-f" class="acc-f"><div class="f2"><label>Nombre<input id="acc-nom" required minlength="2" maxlength="60" autocomplete="given-name"></label>'
      + '<label>Apellido<input id="acc-ape" required minlength="2" maxlength="60" autocomplete="family-name"></label>'
      + '<label>WhatsApp <small>(opcional)</small><input id="acc-tel" inputmode="tel" maxlength="16" autocomplete="tel" placeholder="10 dígitos"></label>'
      + '<label>Despacho o empresa <small>(opcional)</small><input id="acc-des" maxlength="120" autocomplete="organization"></label></div>'
      + '<p class="err" id="acc-err" hidden></p><button class="btn oro form-btn" id="acc-b">Solicitar acceso</button></form>'
      + lista + '<p class="nota">¿Te mandamos un link de acceso? Ábrelo y entras directo.</p></div>';
    const yo = A.load('dazk-yo', {}); if (yo.nombre && !$('#acc-nom').value) { const [n, ...ap] = yo.nombre.split(' '); $('#acc-nom').value = n; if (ap.length) $('#acc-ape').value = ap.join(' '); }
    if (yo.tel) $('#acc-tel').value = yo.tel; if (yo.despacho) $('#acc-des').value = yo.despacho;
    $('#acc-f').onsubmit = async e => {
      e.preventDefault(); const b = $('#acc-b'), err = $('#acc-err'); err.hidden = true; b.disabled = true; b.textContent = 'Enviando…';
      try {
        const id = A.rnd(), s = { nombre: $('#acc-nom').value, apellido: $('#acc-ape').value, tel: $('#acc-tel').value, despacho: $('#acc-des').value };
        await A.solicitarAcceso(id, s);
        mio = { tipo: 'sol', id, nombre: s.nombre.trim() + ' ' + s.apellido.trim() }; A.save('dkas-acceso', mio);
        A.save('dazk-yo', Object.assign(A.load('dazk-yo', {}), { nombre: mio.nombre }, s.tel.trim() ? { tel: s.tel.trim() } : {}, s.despacho.trim() ? { despacho: s.despacho.trim() } : {}));
        pintar('pendiente', { nombre: s.nombre.trim(), apellido: s.apellido.trim() }); revisar();
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
    if (staff) return abrir();
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

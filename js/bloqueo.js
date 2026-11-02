/* DKAS · bloqueo desde el panel. Si el taller bloquea a alguien (bloqueos/<id>: su dispositivo, su solicitud o su link),
   esa persona ya no ve nada de la página, solo "No puedes entrar en este momento. Intenta más tarde.".
   El aviso se pone en el <head> antes de pintar (dkas-bq en este dispositivo); aquí se confirma contra la base de datos
   y se quita solo cuando el taller lo desbloquea. Quien tiene sesión del panel nunca se bloquea. */
(function () {
  const A = window.DAZK_API; if (!A || A.load('dazk-ses', null)) return;
  let v = A.load('dazk-v', null); if (!v) { v = A.rnd(); A.save('dazk-v', v); }
  window.DKAS_DISP = v;
  const raiz = document.documentElement;
  async function revisar() {
    const acc = A.load('dkas-acceso', null), ids = [...new Set([v, acc && acc.id].concat(A.load('dkas-bq', []) || []).filter(x => /^[0-9a-f]{32}$/.test(x || '')))];
    let si;
    try { si = (await Promise.all(ids.map(id => A.bloqueo(id).then(b => b ? id : null)))).filter(Boolean); }
    catch (e) { return setTimeout(revisar, 60000); } // sin conexión: se queda como estaba
    const antes = raiz.classList.contains('bloq');
    A.save('dkas-bq', si);
    if (si.length) { raiz.classList.add('bloq'); setTimeout(revisar, 60000); }
    else if (antes) location.reload();
    else setTimeout(revisar, 120000);
  }
  revisar();
})();

/* DKAS · el socio manda avisos al teléfono (corre en GitHub Actions cada 30 min, 8:00–22:59 hora de CDMX).
   Lee /dinero con la cuenta del robot, arma el mismo modelo que el panel (nucleo.js) y manda push a los teléfonos activados.
   No imprime datos del negocio en el log (el repositorio es público). */
const N = require('./nucleo.js'), webpush = require('web-push');
const E = process.env, KEY = E.FB_API_KEY, DB = E.FB_DB;
const tz = (d, o) => new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: 'America/Mexico_City' }, o)).format(d);
async function j(url, o) { const r = await fetch(url, o); const t = await r.text(); if (!r.ok) throw new Error(r.status + ''); return t ? JSON.parse(t) : null; }
(async () => {
  if (E.PRUEBA) return prueba();
  const ses = await j('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: E.BOT_EMAIL, password: E.BOT_PASS, returnSecureToken: true }) });
  const q = '?auth=' + ses.idToken, get = p => j(DB + '/' + p + '.json' + q), patch = (p, x) => j(DB + '/' + p + '.json' + q, { method: 'PATCH', body: JSON.stringify(x) }), del = p => j(DB + '/' + p + '.json' + q, { method: 'DELETE' });
  await correr((await get('dinero')) || {}, patch, del);
})().catch(e => { console.log('error ' + e.message); process.exit(1); });
function prueba() { const d = JSON.parse(require('fs').readFileSync(E.PRUEBA, 'utf8')); if (E.ESTADO) d.push = Object.assign({}, d.push, { estado: JSON.parse(E.ESTADO) }); return correr(d, async (p, x) => console.log('PATCH', p, JSON.stringify(x).slice(0, 200)), async () => {}, true); }
async function correr(d, patch, del, seco) {
  const ahora = E.HORA ? new Date(E.HORA) : new Date(), hoy = tz(ahora), hora = +tz(ahora, { hour: '2-digit', hourCycle: 'h23' });
  if (hora < 8 || hora > 22) return console.log('fuera de horario');
  const M = N.modelo(d, hoy), fo = M.bitacora.find(x => x.accion === 'Prioridad del día' && x.dia === hoy), foco = fo ? fo.valor : '';
  const S = M.socio(foco, hora), P = S.pasos, urg = P.filter(p => p.nivel === 'urgente').length, pesos = N.pesos;
  const est = Object.assign({}, (d.push || {}).estado), subs = Object.entries((d.push || {}).subs || {}), msgs = [];
  const primera = !est.ultMov;
  // 1) mañana: la prioridad del día
  if (hora < 13 && est.manana !== hoy) { msgs.push({ title: foco ? 'Buenos días · hoy: ' + (N.AREAS.find(a => a[0] === foco) || [])[1] : 'Buenos días · ¿qué prioridad tenemos hoy?', body: (P[0] ? 'Siguiente paso: ' + P[0].titulo + '. ' : 'Nada urgente. ') + (P.length ? (urg ? urg + ' urgente' + (urg > 1 ? 's' : '') + ' de ' : '') + P.length + ' pendientes.' : ''), url: 'taller.html#inicio', tag: 'manana' }); est.manana = hoy; }
  // 2) tarde: lo que sigue, solo si hay algo urgente
  if (hora >= 14 && hora < 19 && est.tarde !== hoy) { if (urg) msgs.push({ title: 'Siguiente paso', body: P[0].titulo + (P[0].porque ? ' · ' + P[0].porque : '') + (urg > 1 ? ' (y ' + (urg - 1) + ' urgente' + (urg > 2 ? 's' : '') + ' más)' : ''), url: 'taller.html' + (P[0].href || '#inicio'), tag: 'tarde' }); est.tarde = hoy; }
  // 3) noche: cuadrar el banco
  if (hora >= 20 && est.noche !== hoy) {
    const ms = M.movs.filter(m => m.fecha === hoy && (m.fondo || '').slice(0, 3) !== 'pd:'), e = ms.filter(N.esIn).reduce((a, m) => a + N.num(m.monto), 0), s = ms.filter(m => !N.esIn(m)).reduce((a, m) => a + N.num(m.monto), 0);
    if (!S.cuadroHoy) msgs.push({ title: 'Antes de cerrar: cuadra el banco', body: 'Abre Tkash y compara. El sistema dice ' + pesos(S.T.porMetodo.Banco) + ' en el banco.' + (ms.length ? ' Hoy entraron ' + pesos(e) + ' y salieron ' + pesos(s) + '.' : ''), url: 'taller.html#inicio', tag: 'noche' });
    est.noche = hoy;
  }
  // 4) dinero nuevo que registró alguien
  const ult = Math.max(0, ...M.movs.map(m => m.creado || 0));
  if (!primera) M.movs.filter(m => (m.creado || 0) > est.ultMov).forEach(m => { const de = m.pedido ? M.nomPed(m.pedido) : m.deuda ? ((M.deu(m.deuda) || {}).nombre || '') : 'general'; msgs.push({ title: (m.por || 'Alguien') + ' registró ' + (N.esIn(m) ? 'una entrada' : 'una salida'), body: (N.esIn(m) ? '+' : '−') + pesos(m.monto).replace('−', '') + ' · ' + (m.cat || '') + ' · ' + de + ((m.fondo || '').slice(0, 3) === 'pd:' ? ' (a crédito, se debe)' : ''), url: 'taller.html#dinero', tag: 'mov-' + m.id, excluir: m.por }); });
  est.ultMov = Math.max(ult, est.ultMov || 0);
  // 5) cosas raras nuevas (las graves)
  const raros = S.raros.filter(r => r.g === 1).map(r => r.t), antes = est.raros || [];
  if (!primera) raros.filter(t => !antes.includes(t)).forEach(t => msgs.push({ title: '⚠ Algo no cuadra', body: t, url: 'taller.html#inicio', tag: 'raro' }));
  est.raros = raros;
  // mandar (máximo 4 por vuelta; si hay más, se juntan)
  let envio = msgs; if (msgs.length > 4) envio = msgs.slice(0, 3).concat([{ title: 'Y ' + (msgs.length - 3) + ' avisos más', body: 'Abre el panel para verlos.', url: 'taller.html#inicio', tag: 'mas' }]);
  if (seco) { envio.forEach(m => console.log('→', m.title, '|', m.body, '|', m.url, m.excluir ? '(no a ' + m.excluir + ')' : '')); await patch('dinero/push/estado', est); return; }
  webpush.setVapidDetails('mailto:avisos@dkas.mx', E.VAPID_PUBLIC, E.VAPID_PRIVATE);
  let ok = 0, mal = 0;
  for (const [id, s] of subs) for (const m of envio) {
    if (m.excluir && s.quien && m.excluir === s.quien) continue;
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }), { TTL: 3600 * 6 }); ok++; }
    catch (e) { mal++; if (e.statusCode === 404 || e.statusCode === 410) { await del('dinero/push/subs/' + id).catch(() => {}); break; } }
  }
  await patch('dinero/push/estado', est);
  console.log('avisos: ' + envio.length + ' · enviados ' + ok + ' · fallidos ' + mal + ' · telefonos ' + subs.length);
}

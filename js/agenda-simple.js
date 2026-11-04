/* DKAS · Mi agenda, versión simple (pedido del dueño 2026-11-04: "sin tantos datos… que yo pueda escribir rápido y me lo ordene").
   Tres listas: Pedidos · Pendientes · Clientes pendientes. Escribes lo que sea y Enter: se guarda tal cual, sin preguntas.
   Si el texto trae fecha u hora ("mañana a las 5", "viernes", "10 de nov", "12/11") se ordena por ahí; si no, va abajo en "Sin fecha".
   Todo se edita tocando el texto. Se guarda en agenda/<id> con tipo pedido | pendiente | cliente.
   No toca agenda.js (lo hizo otra sesión): solo reemplaza la pantalla #agenda; #dinero sigue siendo el de agenda.js. */
(function () {
  const AG = window.DKAS_AGENDA; if (!AG) return;
  let X = null, tareas = [], lista = 'pedido', verHechos = false;
  const initOrig = AG.init, pantallaOrig = AG.pantalla;
  AG.init = c => { X = c; initOrig(c); };
  const LISTAS = [['pedido', 'Pedidos', 'Ej. Mesa Taj 2.40 de Shany, entregar el viernes'], ['pendiente', 'Pendientes', 'Ej. Comprar discos mañana'], ['cliente', 'Clientes pendientes', 'Ej. Llamarle a Pedro el lunes a las 5']];
  const deLista = t => ['pedido', 'pendiente', 'cliente'].includes(t.tipo) ? t.tipo : t.pedido || t.tipo === 'entrega' ? 'pedido' : /^(cita|llamar|seguimiento|cliente)$/.test(t.tipo || '') ? 'cliente' : 'pendiente';
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const sin = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // fecha y hora sacadas del texto, sin preguntar nada
  function fechaHora(txt) {
    let r = {}; try { const e = AG.entender(txt) || {}; if (e.fecha) r.fecha = e.fecha; if (e.hora) r.hora = e.hora; } catch (e) {}
    if (!r.fecha) {
      const t = sin(txt), hoy = X.hoy(), y = +hoy.slice(0, 4); let m, d, mo;
      if ((m = t.match(/\b(\d{1,2}) de (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\w*/))) { d = +m[1]; mo = MES.indexOf(m[2]) + 1; }
      else if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/))) { d = +m[1]; mo = +m[2]; }
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) { let f = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'); if (f < X.hoy(-60)) f = (y + 1) + f.slice(4); r.fecha = f; }
    }
    return r;
  }
  const corta = f => { const [y, m, d] = f.split('-'); return +d + ' ' + MES[+m - 1]; };
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function grupo(f) {
    if (!f) return ['z', 'Sin fecha'];
    const h = X.hoy(); if (f < h) return ['0', 'Atrasado']; if (f === h) return ['1', 'Hoy']; if (f === X.hoy(1)) return ['2', 'Mañana'];
    return ['3' + f, DIAS[new Date(f + 'T12:00').getDay()] + ' ' + corta(f)];
  }

  async function pantalla(v) {
    if (v !== 'agenda') return pantallaOrig(v);
    X.main.innerHTML = '<h1>Mi agenda</h1><p class="sub">Cargando…</p>';
    try { tareas = await X.A.agenda(); } catch (e) { X.main.innerHTML = '<h1>Mi agenda</h1><p class="err">' + X.esc(e.message) + '</p>'; return; }
    pintar();
  }

  function pintar(foco) {
    const esc = X.esc, main = X.main;
    AG.contar(tareas);
    const de = l => tareas.filter(t => deLista(t) === l);
    const pend = de(lista).filter(t => !t.hecho).sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9') || (a.hora || '99').localeCompare(b.hora || '99') || a.creado - b.creado);
    const hechos = de(lista).filter(t => t.hecho).sort((a, b) => b.creado - a.creado);
    const grupos = []; pend.forEach(t => { const [k, tit] = grupo(t.fecha); let g = grupos.find(x => x.k === k); if (!g) grupos.push(g = { k, tit, l: [] }); g.l.push(t); });
    grupos.sort((a, b) => a.k < b.k ? -1 : 1);
    const fila = t => '<div class="as-it' + (t.hecho ? ' hecho' : '') + (t.fecha && t.fecha < X.hoy() && !t.hecho ? ' tarde' : '') + '" data-id="' + t.id + '"><button class="as-chk" data-a="hecho" aria-label="Hecho"></button>'
      + '<div class="as-tx" contenteditable="true" spellcheck="false">' + esc(t.texto) + '</div>'
      + (t.fecha || t.hora ? '<span class="as-f">' + [t.fecha ? corta(t.fecha) : '', t.hora ? t.hora.replace(/^0/, '') : ''].filter(Boolean).join(' · ') + '</span>' : '')
      + '<button class="as-x" data-a="borrar" aria-label="Borrar">×</button></div>';
    const L = LISTAS.find(x => x[0] === lista);
    main.innerHTML = '<div class="as"><h1>Mi agenda</h1>'
      + '<div class="as-tabs">' + LISTAS.map(([k, t]) => '<button data-l="' + k + '"' + (k === lista ? ' class="on"' : '') + '>' + t + ' <i>' + de(k).filter(x => !x.hecho).length + '</i></button>').join('') + '</div>'
      + '<div class="as-nuevo"><textarea id="ag-tx" rows="2" maxlength="400" placeholder="' + esc(L[2]) + '"></textarea><button class="btn negro" id="as-ok">Agregar</button></div>'
      + (grupos.length ? grupos.map(g => '<h3 class="as-g' + (g.k === '0' ? ' tarde' : g.k === '1' ? ' hoy' : '') + '">' + esc(g.tit) + '</h3>' + g.l.map(fila).join('')).join('') : '<p class="sub as-vacio">Nada por aquí. Escribe arriba y presiona Enter.</p>')
      + (hechos.length ? '<button class="lnk gris as-ver" id="as-ver">' + (verHechos ? 'Ocultar' : 'Ver') + ' hechos (' + hechos.length + ')</button>' + (verHechos ? hechos.slice(0, 50).map(fila).join('') : '') : '')
      + '</div>';
    const inp = $('#ag-tx'); if (foco !== false) inp.focus();
    inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agregar(); } };
    $('#as-ok').onclick = agregar;
    main.onclick = async e => {
      const tab = e.target.closest('[data-l]'); if (tab) { lista = tab.dataset.l; verHechos = false; return pintar(); }
      if (e.target.closest('#as-ver')) { verHechos = !verHechos; return pintar(false); }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const t = tareas.find(x => x.id === b.closest('[data-id]').dataset.id); if (!t) return;
      if (b.dataset.a === 'hecho') { const n = Object.assign({}, t, { hecho: !t.hecho }); delete n.id; await guardar(t.id, n); }
      if (b.dataset.a === 'borrar') { try { await X.A.borrarTarea(t.id); tareas = tareas.filter(x => x !== t); } catch (y) { return X.alerta(y.message); } }
      pintar(false);
    };
    // editar tocando el texto: se guarda al salir (o con Enter); si lo dejas vacío, se borra
    $$('.as-tx').forEach(el => {
      el.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); } };
      el.onblur = async () => {
        const t = tareas.find(x => x.id === el.closest('[data-id]').dataset.id), txt = el.innerText.trim().slice(0, 400); if (!t || txt === t.texto) return;
        if (!txt) { try { await X.A.borrarTarea(t.id); tareas = tareas.filter(x => x !== t); } catch (y) { X.alerta(y.message); } return pintar(false); }
        const n = Object.assign({}, t, { texto: txt }); delete n.id; delete n.fecha; delete n.hora; Object.assign(n, fechaHora(txt));
        await guardar(t.id, n); pintar(false);
      };
    });
  }
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  async function guardar(id, x) {
    try { await X.A.guardarTarea(id, x); tareas = tareas.filter(t => t.id !== id).concat([Object.assign({ id }, x)]); }
    catch (e) { X.alerta(e.message); }
  }
  async function agregar() {
    const inp = $('#ag-tx'), txt = inp.value.trim().slice(0, 400); if (!txt) return inp.focus();
    const me = X.me && X.me(), x = Object.assign({ texto: txt, hecho: false, creado: Date.now(), tipo: lista }, fechaHora(txt));
    const por = String((me && me.nombre) || '').slice(0, 60); if (por) x.por = por;
    inp.value = ''; await guardar(Date.now().toString(36) + X.A.rnd().slice(0, 6), x); pintar();
  }

  AG.pantalla = pantalla;

  const css = document.createElement('style');
  css.textContent = `.as{max-width:760px}
.as-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 14px}
.as-tabs button{font:inherit;font-size:15px;padding:10px 16px;border-radius:999px;border:1px solid #d8d2c8;background:#fff;cursor:pointer}
.as-tabs button.on{background:#141210;color:#fff;border-color:#141210}.as-tabs i{font-style:normal;opacity:.6;margin-left:4px}
.as-nuevo{display:flex;gap:8px;align-items:stretch;margin-bottom:18px}.as-nuevo textarea{flex:1;font:inherit;font-size:16px;padding:12px;border:1px solid #d8d2c8;border-radius:10px;resize:vertical;min-height:52px}
.as-g{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a8175;margin:18px 0 6px}.as-g.tarde{color:#c0392b}.as-g.hoy{color:#a07a2c}
.as-it{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#fff;border:1px solid #ece7df;border-radius:10px;margin-bottom:6px}
.as-it.tarde{border-left:3px solid #c0392b}.as-it.hecho{opacity:.5}.as-it.hecho .as-tx{text-decoration:line-through}
.as-chk{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid #b9ae9e;background:#fff;cursor:pointer;margin-top:1px}.as-it.hecho .as-chk{background:#141210;border-color:#141210}
.as-tx{flex:1;font-size:16px;line-height:1.4;outline:none;min-height:22px;white-space:pre-wrap;word-break:break-word}.as-tx:focus{background:#faf6ee;border-radius:4px}
.as-f{flex:none;font-size:12.5px;color:#7a7064;background:#f3eee6;border-radius:999px;padding:3px 9px;margin-top:1px}
.as-x{flex:none;border:0;background:none;font-size:20px;line-height:1;color:#b9ae9e;cursor:pointer;padding:0 2px}.as-x:hover{color:#c0392b}
.as-ver{margin:16px 0 8px;display:block}.as-vacio{margin-top:10px}`;
  document.head.appendChild(css);
})();

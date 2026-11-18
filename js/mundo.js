/* DKAS · Mundo DKAS: lo interactivo de la versión de lunes, miércoles y viernes.
   Portada = mesa 3D real (three.js) que se arma al bajar: placa 320×160 → 12 mm → corte a tu medida → base Maestra de acero → tu mesa. */
(function () {
  const D = window.DKAS, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const quieto = matchMedia('(prefers-reduced-motion:reduce)').matches, fino = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const cl = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, suave = t => t * t * (3 - 2 * t), tramo = (p, a, b) => suave(cl((p - a) / (b - a), 0, 1));
  const cel = () => innerWidth < 900;

  // ---------- intro: la cortina se abre cuando la mesa ya cargó ----------
  const intro = $('#mu-intro'), nIntro = $('#mi-n'), barIntro = $('.mi-l i');
  let listo3d = false, t0 = performance.now();
  function arranca() { document.body.classList.add('arranca'); }
  if (intro) {
    let n = 0; const paso = () => {
      const min = (performance.now() - t0) / 1400, meta = listo3d ? 1 : Math.min(.9, min);
      n = Math.min(meta, n + 0.02 + (meta - n) * 0.08); nIntro.textContent = String(Math.round(n * 100)).padStart(3, '0'); barIntro.style.width = n * 100 + '%';
      if (n >= 1 || performance.now() - t0 > 3800) { intro.classList.add('fuera'); setTimeout(arranca, 250); setTimeout(() => intro.remove(), 1400); } else requestAnimationFrame(paso);
    }; requestAnimationFrame(paso);
  } else requestAnimationFrame(arranca);

  // ---------- cursor y botones magnéticos ----------
  if (fino && !quieto) {
    const c = $('#mu-cur'); let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener('mousemove', e => { x = e.clientX; y = e.clientY; c.classList.add('ver'); }, { passive: true });
    document.addEventListener('mouseleave', () => c.classList.remove('ver'));
    document.addEventListener('mouseover', e => c.classList.toggle('gr', !!e.target.closest('a,button,summary,.mu-card,input,label')));
    (function mueve() { cx += (x - cx) * .2; cy += (y - cy) * .2; c.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)'; requestAnimationFrame(mueve); })();
    $$('.mag').forEach(b => {
      b.addEventListener('mousemove', e => { const r = b.getBoundingClientRect(); b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .25).toFixed(1) + 'px,' + ((e.clientY - r.top - r.height / 2) * .35).toFixed(1) + 'px)'; });
      b.addEventListener('mouseleave', () => { b.style.transform = ''; });
    });
    $$('.mu-b').forEach(b => b.addEventListener('mousemove', e => { const r = b.getBoundingClientRect(); b.style.setProperty('--mx', (e.clientX - r.left) + 'px'); b.style.setProperty('--my', (e.clientY - r.top) + 'px'); }));
  }

  // ---------- portada 3D ----------
  const hero = $('#portada'), caja = $('#mu-gl'), ets = $$('.mu-et'), barras = $$('.mu-prog b'), hudL = $('#mu-l'), hudA = $('#mu-a'), hudP = $('#mu-pn');
  let P = 0, mesa = null; // P = avance de la portada (0..1)
  const ROUGH = { Pulido: .1, 'Mate suave': .48, Aterciopelado: .58, Cepillado: .52 };
  function mesa3D() {
    if (!window.THREE || !caja) return null;
    const T = THREE; let r;
    try { r = new T.WebGLRenderer({ antialias: !cel(), alpha: true, powerPreference: 'high-performance' }); } catch (e) { return null; }
    if (!r.getContext()) return null;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, cel() ? 1 : 2)); r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = .74;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.physicallyCorrectLights = false;
    caja.appendChild(r.domElement);
    const esc = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .05, 60);
    // estudio: cajas de luz suaves para los reflejos de la piedra pulida
    const pm = new T.PMREMGenerator(r), env = new T.Scene();
    env.add(new T.Mesh(new T.BoxGeometry(30, 30, 30), new T.MeshBasicMaterial({ color: 0x0b0a09, side: T.BackSide })));
    [[0, 9, 0, 14, 6, -Math.PI / 2, 0, 1.6], [-9, 4, 3, 6, 10, 0, Math.PI / 2, 1], [9, 3, -2, 4, 8, 0, -Math.PI / 2, .7], [0, 4, -10, 12, 4, 0, 0, .5]].forEach(([x, y, z, w, h, rx, ry, k]) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k * .96, k * .9), side: T.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m); });
    esc.environment = pm.fromScene(env, .04).texture;
    esc.add(new T.HemisphereLight(0xfff4e2, 0x101010, .35));
    const key = new T.DirectionalLight(0xfff0da, 1.6); key.position.set(3.5, 7, 4.5); key.castShadow = true;
    key.shadow.mapSize.set(cel() ? 1024 : 2048, cel() ? 1024 : 2048); Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 }); key.shadow.radius = 6; key.shadow.bias = -.0004; esc.add(key);
    const rim = new T.DirectionalLight(0xd9b57a, 1.3); rim.position.set(-6, 2.5, -4); esc.add(rim);
    const piso = new T.Mesh(new T.PlaneGeometry(30, 30), new T.ShadowMaterial({ opacity: .55 })); piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; esc.add(piso);
    // halo dorado en el piso
    const hc = document.createElement('canvas'); hc.width = hc.height = 256; const hx = hc.getContext('2d'), g = hx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(201,169,110,.35)'); g.addColorStop(1, 'rgba(201,169,110,0)'); hx.fillStyle = g; hx.fillRect(0, 0, 256, 256);
    const halo = new T.Mesh(new T.PlaneGeometry(7, 5), new T.MeshBasicMaterial({ map: new T.CanvasTexture(hc), transparent: true, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = .002; esc.add(halo);

    // la placa: caja 1×1×1 escalada a la medida real (m)
    const tl = new T.TextureLoader(), anis = r.capabilities.getMaxAnisotropy();
    const caraM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .2, metalness: 0, envMapIntensity: 1 });
    const bajoM = new T.MeshStandardMaterial({ color: 0x777777, roughness: .6, metalness: 0 });
    const cantoM = new T.MeshStandardMaterial({ color: 0xd8d2c8, roughness: .35, metalness: 0 });
    const placa = new T.Mesh(new T.BoxGeometry(1, 1, 1), [cantoM, cantoM, caraM, bajoM, cantoM, cantoM]); placa.castShadow = true; placa.receiveShadow = true; placa.rotation.order = 'YXZ'; esc.add(placa);
    const linea = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)), new T.LineBasicMaterial({ color: 0xe7d1a2, transparent: true, opacity: 0 })); placa.add(linea);
    // MDF bajo la piedra (2.20 × 0.90, no se ve desde el canto)
    const mdf = new T.Mesh(new T.BoxGeometry(2.2, .013, .9), new T.MeshStandardMaterial({ color: 0x1d1a17, roughness: .9 })); mdf.position.y = .7375; mdf.castShadow = true; esc.add(mdf);
    // base Maestra: 16 tubos (patas en trapecio invertido, V arriba y abajo, espinazo arriba y abajo, 2 largueros)
    const acero = new T.MeshStandardMaterial({ color: 0x161616, roughness: .38, metalness: .75, envMapIntensity: .8 });
    const base = new T.Group(), tubos = [], S = .055, yA = .731 - S / 2, yB = S / 2, X = 1.0, ZA = .4, ZB = .24, XV = .76, XVB = .8;
    const tubo = (a, b) => { const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A), m = new T.Mesh(new T.BoxGeometry(S, d.length() + S * .9, S), acero);
      m.position.copy(A.clone().add(B).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; base.add(m); tubos.push(m); };
    [-1, 1].forEach(s => { [-1, 1].forEach(z => tubo([s * X, yA, z * ZA], [s * X, yB, z * ZB])); });                    // 4 patas
    [-1, 1].forEach(s => { [-1, 1].forEach(z => tubo([s * X, yA, z * ZA], [s * XV, yA, 0])); });                      // V de arriba
    [-1, 1].forEach(s => { [-1, 1].forEach(z => tubo([s * X, yB, z * ZB], [s * XVB, yB, 0])); });                     // V del piso
    tubo([-XV, yA, 0], [XV, yA, 0]); tubo([-XVB, yB, 0], [XVB, yB, 0]);                                             // espinazos
    [-1, 1].forEach(z => tubo([-X, yA, z * ZA], [X, yA, z * ZA]));                                                   // largueros
    esc.add(base);

    // cotas de plano (líneas doradas con la medida en mm) que siguen a la placa
    const cotaM = new T.LineBasicMaterial({ color: 0xe7d1a2, transparent: true, opacity: 0, depthTest: false });
    const mkC = () => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(18), 3)); const l = new T.LineSegments(g, cotaM); l.renderOrder = 5; l.frustumCulled = false; esc.add(l); return l; };
    const cL = mkC(), cW = mkC(), pin = caja.parentNode;
    const lbl = c => { const d = document.createElement('div'); d.className = 'mu-cota ' + c; d.setAttribute('aria-hidden', 'true'); pin.appendChild(d); return d; };
    const eL = lbl('l'), eW = lbl('w'), eE = lbl('e'); eE.innerHTML = '<i></i><b>12</b> mm';
    const V = (x, y, z) => placa.localToWorld(new T.Vector3(x, y, z));
    function setC(l, a, b, off) {
      const arr = l.geometry.attributes.position.array, A = a.clone().add(off), B = b.clone().add(off), t = off.clone().normalize().multiplyScalar(.05);
      [A, B, A.clone().sub(t), A.clone().add(t), B.clone().sub(t), B.clone().add(t)].forEach((v, i) => { arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; });
      l.geometry.attributes.position.needsUpdate = true; return A.add(B).multiplyScalar(.5);
    }
    function pon(el, v, op, dx) { v.project(cam); el.style.transform = 'translate(-50%,-50%) translate(' + ((v.x * .5 + .5) * w + (dx || 0)).toFixed(1) + 'px,' + ((-v.y * .5 + .5) * h).toFixed(1) + 'px)'; el.style.opacity = op.toFixed(3); }
    function cotas(p, L, Wd) {
      placa.updateMatrixWorld(true);
      const op = Math.max(tramo(p, .1, .15) * (1 - tramo(p, .23, .27)), tramo(p, .47, .52) * (1 - tramo(p, .6, .64)), tramo(p, .84, .9));
      cotaM.opacity = op * .85;
      const o = V(0, 0, 0), dz = V(0, 0, 1).sub(o).normalize().multiplyScalar(.2), dx = V(1, 0, 0).sub(o).normalize().multiplyScalar(.2);
      const mL = setC(cL, V(-.5, .5, .5), V(.5, .5, .5), dz), mW = setC(cW, V(.5, .5, -.5), V(.5, .5, .5), dx);
      eL.innerHTML = '<b>' + Math.round(L * 1000) + '</b> mm'; eW.innerHTML = '<b>' + Math.round(Wd * 1000) + '</b> mm';
      pon(eL, mL, op); pon(eW, mW, op); pon(eE, o.clone(), tramo(p, .3, .34) * (1 - tramo(p, .41, .45)), 70);
    }
    function ponPiedra(id, n) {
      const p = D && D.piedra ? D.piedra(id) : null, ac = p && p.acabado;
      tl.load('tex/piedras/' + (cel() ? '1k/' : '') + id + '.jpg', tx => {
        tx.encoding = T.sRGBEncoding; tx.anisotropy = anis; tx.wrapS = tx.wrapT = T.ClampToEdgeWrapping;
        const viejo = caraM.map; caraM.map = tx; bajoM.map = tx; caraM.roughness = ROUGH[ac] != null ? ROUGH[ac] : .14; caraM.needsUpdate = bajoM.needsUpdate = true; if (viejo) viejo.dispose();
        try { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(tx.image, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; cantoM.color.setRGB(d[0] / 255, d[1] / 255, d[2] / 255).convertSRGBToLinear(); } catch (e) {}
        listo3d = true; caja.classList.add('listo'); ajustaTex();
      }, undefined, () => { listo3d = true; });
      if (hudP && n) hudP.textContent = n;
    }
    let texRX = 1, texRY = 1;
    function ajustaTex() { const tx = caraM.map; if (!tx) return; tx.repeat.set(texRX, texRY); tx.offset.set((1 - texRX) / 2, (1 - texRY) / 2); }

    // cámara: puntos clave [avance, posición, mira]
    const K = [[0, [0, 1.5, 8.4], [0, .95, 0]], [.2, [.6, 1.3, 7.6], [0, .95, 0]], [.36, [.5, 1.2, 5.4], [0, .98, 0]], [.55, [0, 4.8, 5.6], [0, .62, 0]],
      [.72, [-3.1, .85, 3.7], [0, .42, 0]], [.88, [4.2, 2.3, 5.4], [0, .5, 0]], [1, [4.8, 2.5, 4.4], [0, .48, 0]]];
    const vP = new T.Vector3(), vM = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3();
    function camara(p, t, mx, my) {
      let i = 0; while (i < K.length - 2 && p > K[i + 1][0]) i++;
      const [p0, c0, m0] = K[i], [p1, c1, m1] = K[i + 1], k = suave(cl((p - p0) / (p1 - p0), 0, 1));
      vP.copy(a.set(...c0)).lerp(b.set(...c1), k); vM.copy(a.set(...m0)).lerp(b.set(...m1), k);
      if (cel()) { vP.sub(vM).multiplyScalar(innerHeight > innerWidth ? 1.85 : 1.3).add(vM); vP.y = Math.max(vP.y, .6); }
      const giro = p > .88 && !quieto ? (t * .05) % (Math.PI * 2) * 0 + Math.sin(t * .15) * .35 : 0;
      if (giro) { const x = vP.x, z = vP.z, c = Math.cos(giro), s = Math.sin(giro); vP.x = x * c - z * s; vP.z = x * s + z * c; }
      vP.x += mx * .35; vP.y += my * .2;
      cam.position.copy(vP); cam.lookAt(vM);
    }
    let w = 0, h = 0;
    function tam() {
      const W = caja.clientWidth, H = caja.clientHeight; if (W === w && H === h) return; w = W; h = H;
      r.setSize(W, H, false); cam.aspect = W / H; cam.fov = W < 900 ? 38 : 30;
      if (W >= 900) cam.setViewOffset(W, H, -W * .2, 0, W, H); else cam.setViewOffset(W, H, 0, H * .2, W, H);
      cam.updateProjectionMatrix();
    }
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    if (fino) addEventListener('mousemove', e => { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });
    let anda = false, reloj = 0, ult = performance.now();
    function cuadro(now) {
      if (!anda) return; requestAnimationFrame(cuadro); tam();
      const dt = Math.min(.05, (now - ult) / 1000); ult = now; if (!quieto) reloj += dt;
      mx += (tmx - mx) * .05; my += (tmy - my) * .05;
      const p = P, t = reloj;
      // placa parada (de frente) → se acuesta y se corta → queda a 75 cm
      const acuesta = tramo(p, .44, .58), corte = tramo(p, .47, .62), aire = (1 - acuesta) * .045 * Math.sin(t * 1.1);
      const L = lerp(3.2, 2.8, corte), Wd = lerp(1.6, 1.5, corte);
      placa.scale.set(L, .012, Wd); const canto = tramo(p, .26, .35) * (1 - tramo(p, .4, .47));
      placa.rotation.set(lerp(Math.PI / 2, 0, acuesta), (1 - acuesta) * ((quieto ? 0 : Math.sin(t * .35) * .2) * (1 - canto) + canto * 1.53), 0);
      placa.position.set(0, lerp(.98, .7505, acuesta) + aire, 0);
      texRX = L / 3.2; texRY = Wd / 1.6; ajustaTex();
      linea.material.opacity = tramo(p, .44, .5) * (1 - tramo(p, .62, .68)) * .9;
      // el acero aparece tubo por tubo, luego el MDF
      tubos.forEach((m, i) => { const k = tramo(p, .6 + i * .009, .64 + i * .009); m.scale.set(k, k, k); m.visible = k > .001; });
      mdf.visible = p > .7; mdf.scale.set(1, 1, 1);
      halo.material.opacity = .6 + .4 * tramo(p, .6, .8);
      if (hudL) { hudL.textContent = (L * 100).toFixed(1); hudA.textContent = (Wd * 100).toFixed(1); }
      camara(p, t, mx, my); cotas(p, L, Wd); r.render(esc, cam);
    }
    function enciende(v) { if (v === anda) return; anda = v; if (v) { ult = performance.now(); requestAnimationFrame(cuadro); } }
    return { ponPiedra, enciende };
  }

  if (hero) {
    try { mesa = mesa3D(); } catch (e) { console.warn('[DKAS] 3D', e); mesa = null; }
    if (mesa) { const on = $('.mu-chips button.on'); mesa.ponPiedra(on ? on.dataset.mp : 'classic-bulgar', on && on.dataset.n); } else listo3d = true;
  } else listo3d = true;

  function piedra(id, n, desde) {
    if (mesa) mesa.ponPiedra(id, n);
    $$('.mu-chips button').forEach(b => b.classList.toggle('on', b.dataset.mp === id));
    if (desde !== 'lista') { const b = $('.mu-pd-l [data-pp="' + id + '"]'); if (b) verPiedra(b, true); }
  }
  $$('.mu-chips button').forEach(b => b.onclick = () => piedra(b.dataset.mp, b.dataset.n));

  // ---------- al bajar: portada, encabezado, espacios, paralaje ----------
  const top = $('#top'), hz = $('#mu-espacios'), hzT = $('#mu-hz-t'), hzN = $('#mu-hz-n'), hzB = $('#mu-hz-b'), cards = hzT ? [...hzT.children] : [];
  let hzLargo = 0;
  function medirHz() {
    if (!hz) return; if (cel() || quieto) { hz.style.height = ''; hzLargo = 0; return; }
    hzLargo = Math.max(0, hzT.scrollWidth - innerWidth); hz.style.height = (innerHeight + hzLargo) + 'px';
  }
  let pide = false;
  function alBajar() {
    pide = false; const y = scrollY, enInicio = document.body.dataset.p !== 'crea';
    if (hero && enInicio) {
      const r = hero.getBoundingClientRect(), largo = r.height - innerHeight;
      // en el teléfono la portada ya no se queda fija: se ve la mesa terminada y se baja normal
      P = cel() ? 1 : cl(-r.top / (largo || 1), 0, 1);
      hero.classList.toggle('paso', !cel() && P > .06);
      const e = P < .1 ? 0 : Math.min(4, Math.floor((P - .1) / .18));
      ets.forEach((el, i) => el.classList.toggle('on', i === e));
      barras.forEach((b, i) => { b.style.height = cl((P - .1 - i * .18) / .18, 0, 1) * 100 + '%'; });
      if (mesa) mesa.enciende(r.bottom > 0 && r.top < innerHeight && !document.hidden);
      top.classList.toggle('solido', r.bottom < 90);
    } else { if (mesa) mesa.enciende(false); top.classList.add('solido'); }
    if (hz && hzLargo && enInicio) {
      const r = hz.getBoundingClientRect(), k = cl(-r.top / hzLargo, 0, 1);
      hzT.style.transform = 'translate3d(' + (-k * hzLargo).toFixed(1) + 'px,0,0)'; hzB.style.width = k * 100 + '%';
      hzN.textContent = String(Math.min(cards.length - 1, Math.round(k * (cards.length - 2))) + 1).padStart(2, '0');
    }
    if (!quieto) $$('.mu-d3-f,.mu-fin-f').forEach(f => { const r = f.parentNode.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; f.style.transform = 'translate3d(0,' + ((r.top + r.height / 2 - innerHeight / 2) * -.1).toFixed(1) + 'px,0)'; });
  }
  const pedir = () => { if (!pide) { pide = true; requestAnimationFrame(alBajar); } };
  addEventListener('scroll', pedir, { passive: true });
  addEventListener('resize', () => { medirHz(); pedir(); });
  addEventListener('hashchange', () => setTimeout(() => { medirHz(); alBajar(); }, 60));
  document.addEventListener('visibilitychange', pedir);
  addEventListener('load', () => { medirHz(); alBajar(); });
  if (hzT) hzT.addEventListener('scroll', () => { if (!cel()) return; const k = hzT.scrollLeft / Math.max(1, hzT.scrollWidth - hzT.clientWidth); hzB.style.width = k * 100 + '%'; hzN.textContent = String(Math.round(k * (cards.length - 2)) + 1).padStart(2, '0'); }, { passive: true });
  medirHz(); alBajar();

  // ---------- piedras: visor con lupa ----------
  const pv = $('#mu-pd-v'), pimg = $('#mu-pd-img'), lupa = $('#mu-lupa');
  let pid = (($('.mu-pd-l button.on') || {}).dataset || {}).pp;
  function verPiedra(b, sinMesa) {
    pid = b.dataset.pp; $$('.mu-pd-l button').forEach(x => x.classList.toggle('on', x === b));
    pimg.classList.add('cambia');
    const i = new Image(); i.onload = () => { pimg.style.backgroundImage = 'url(' + i.src + ')'; pimg.classList.remove('cambia'); }; i.src = 'tex/piedras/1k/' + pid + '.jpg';
    $('#mu-pd-n').textContent = b.dataset.n; $('#mu-pd-d').textContent = b.dataset.d; $('#mu-pd-ac').textContent = b.dataset.ac;
    $('#mu-pd-go').href = 'cotiza.html?u=comedor&f=rect&p=' + pid;
    lupa.style.backgroundImage = 'url(tex/piedras/' + pid + '.jpg)';
    if (!sinMesa) piedra(pid, b.dataset.n, 'lista');
  }
  $$('.mu-pd-l button').forEach(b => b.onclick = () => verPiedra(b));
  if (pv && fino) {
    if (pid) lupa.style.backgroundImage = 'url(tex/piedras/' + pid + '.jpg)';
    pv.addEventListener('mouseenter', () => pv.classList.add('lupa'));
    pv.addEventListener('mouseleave', () => pv.classList.remove('lupa'));
    pv.addEventListener('mousemove', e => {
      if (e.target.closest('figcaption a')) { pv.classList.remove('lupa'); return; } pv.classList.add('lupa');
      const r = pv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, Z = 2.6;
      const iw = Math.max(r.width, r.height * 2), ih = iw / 2, ox = (r.width - iw) / 2, oy = (r.height - ih) / 2;
      lupa.style.left = x + 'px'; lupa.style.top = y + 'px';
      lupa.style.backgroundSize = (iw * Z) + 'px ' + (ih * Z) + 'px';
      lupa.style.backgroundPosition = (-(x - ox) * Z + 95) + 'px ' + (-(y - oy) * Z + 95) + 'px';
    });
  }

  // ---------- cifras que cuentan ----------
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; io.unobserve(e.target); const el = e.target, fin = +el.dataset.cuenta; if (quieto || !fin) return;
    const t1 = performance.now(), dur = 1600; (function cuenta(now) { const k = Math.min(1, (now - t1) / dur), v = Math.round(fin * (1 - Math.pow(1 - k, 4))); el.textContent = v; if (k < 1) requestAnimationFrame(cuenta); })(t1);
  }), { threshold: .6 }) : null;
  if (io) $$('[data-cuenta]').forEach(el => io.observe(el));
})();

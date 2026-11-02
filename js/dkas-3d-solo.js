( function () {

	const _tempNormal = new THREE.Vector3();

	function getUv( faceDirVector, normal, uvAxis, projectionAxis, radius, sideLength ) {

		const totArcLength = 2 * Math.PI * radius / 4; // length of the planes between the arcs on each axis

		const centerLength = Math.max( sideLength - 2 * radius, 0 );
		const halfArc = Math.PI / 4; // Get the vector projected onto the Y plane

		_tempNormal.copy( normal );

		_tempNormal[ projectionAxis ] = 0;

		_tempNormal.normalize(); // total amount of UV space alloted to a single arc


		const arcUvRatio = 0.5 * totArcLength / ( totArcLength + centerLength ); // the distance along one arc the point is at

		const arcAngleRatio = 1.0 - _tempNormal.angleTo( faceDirVector ) / halfArc;

		if ( Math.sign( _tempNormal[ uvAxis ] ) === 1 ) {

			return arcAngleRatio * arcUvRatio;

		} else {

			// total amount of UV space alloted to the plane between the arcs
			const lenUv = centerLength / ( totArcLength + centerLength );
			return lenUv + arcUvRatio + arcUvRatio * ( 1.0 - arcAngleRatio );

		}

	}

	class RoundedBoxGeometry extends THREE.BoxGeometry {

		constructor( width = 1, height = 1, depth = 1, segments = 2, radius = 0.1 ) {

			// ensure segments is odd so we have a plane connecting the rounded corners
			segments = segments * 2 + 1; // ensure radius isn't bigger than shortest side

			radius = Math.min( width / 2, height / 2, depth / 2, radius );
			super( 1, 1, 1, segments, segments, segments ); // if we just have one segment we're the same as a regular box

			if ( segments === 1 ) return;
			const geometry2 = this.toNonIndexed();
			this.index = null;
			this.attributes.position = geometry2.attributes.position;
			this.attributes.normal = geometry2.attributes.normal;
			this.attributes.uv = geometry2.attributes.uv; //

			const position = new THREE.Vector3();
			const normal = new THREE.Vector3();
			const box = new THREE.Vector3( width, height, depth ).divideScalar( 2 ).subScalar( radius );
			const positions = this.attributes.position.array;
			const normals = this.attributes.normal.array;
			const uvs = this.attributes.uv.array;
			const faceTris = positions.length / 6;
			const faceDirVector = new THREE.Vector3();
			const halfSegmentSize = 0.5 / segments;

			for ( let i = 0, j = 0; i < positions.length; i += 3, j += 2 ) {

				position.fromArray( positions, i );
				normal.copy( position );
				normal.x -= Math.sign( normal.x ) * halfSegmentSize;
				normal.y -= Math.sign( normal.y ) * halfSegmentSize;
				normal.z -= Math.sign( normal.z ) * halfSegmentSize;
				normal.normalize();
				positions[ i + 0 ] = box.x * Math.sign( position.x ) + normal.x * radius;
				positions[ i + 1 ] = box.y * Math.sign( position.y ) + normal.y * radius;
				positions[ i + 2 ] = box.z * Math.sign( position.z ) + normal.z * radius;
				normals[ i + 0 ] = normal.x;
				normals[ i + 1 ] = normal.y;
				normals[ i + 2 ] = normal.z;
				const side = Math.floor( i / faceTris );

				switch ( side ) {

					case 0:
						// right
						// generate UVs along Z then Y
						faceDirVector.set( 1, 0, 0 );
						uvs[ j + 0 ] = getUv( faceDirVector, normal, 'z', 'y', radius, depth );
						uvs[ j + 1 ] = 1.0 - getUv( faceDirVector, normal, 'y', 'z', radius, height );
						break;

					case 1:
						// left
						// generate UVs along Z then Y
						faceDirVector.set( - 1, 0, 0 );
						uvs[ j + 0 ] = 1.0 - getUv( faceDirVector, normal, 'z', 'y', radius, depth );
						uvs[ j + 1 ] = 1.0 - getUv( faceDirVector, normal, 'y', 'z', radius, height );
						break;

					case 2:
						// top
						// generate UVs along X then Z
						faceDirVector.set( 0, 1, 0 );
						uvs[ j + 0 ] = 1.0 - getUv( faceDirVector, normal, 'x', 'z', radius, width );
						uvs[ j + 1 ] = getUv( faceDirVector, normal, 'z', 'x', radius, depth );
						break;

					case 3:
						// bottom
						// generate UVs along X then Z
						faceDirVector.set( 0, - 1, 0 );
						uvs[ j + 0 ] = 1.0 - getUv( faceDirVector, normal, 'x', 'z', radius, width );
						uvs[ j + 1 ] = 1.0 - getUv( faceDirVector, normal, 'z', 'x', radius, depth );
						break;

					case 4:
						// front
						// generate UVs along X then Y
						faceDirVector.set( 0, 0, 1 );
						uvs[ j + 0 ] = 1.0 - getUv( faceDirVector, normal, 'x', 'y', radius, width );
						uvs[ j + 1 ] = 1.0 - getUv( faceDirVector, normal, 'y', 'x', radius, height );
						break;

					case 5:
						// back
						// generate UVs along X then Y
						faceDirVector.set( 0, 0, - 1 );
						uvs[ j + 0 ] = getUv( faceDirVector, normal, 'x', 'y', radius, width );
						uvs[ j + 1 ] = 1.0 - getUv( faceDirVector, normal, 'y', 'x', radius, height );
						break;

				}

			}

		}

	}

	THREE.RoundedBoxGeometry = RoundedBoxGeometry;

} )();

;
/* DKAS · visor 3D (three.js r128). Dibuja la mesa a escala real con la foto de la placa de piedra,
   el MDF negro y la base de PTR redondeado con pintura electrostática (no un bloque perfecto). */
(function () {
  const D = window.DKAS, T = THREE;
  const cm = v => v / 100;

  // calibración de la piedra contra las fotos reales (se midió el color promedio de cada placa contra el 3D)
  const PIEDRA_LUZ = Object.assign({ k: 0.75, env: 0.05, cc: 0.2 }, window.DKAS_CAL || {});

  function ruido(n, a, b) {
    const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), im = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = a + Math.random() * (b - a); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3); return t;
  }

  // barra de sección w × h entre dos puntos (cm); 'lado' indica hacia dónde va el ancho w
  function barra(g, mat, p1, p2, w, h, lado, r) {
    const a = new T.Vector3(...p1), b = new T.Vector3(...p2), len = a.distanceTo(b);
    const x = b.clone().sub(a).normalize();
    // si 'lado' va en la misma dirección que la barra se usa otro eje que no lo sea
    let z = null;
    for (const l of [lado || [0, 0, 1], [0, 1, 0], [1, 0, 0], [0, 0, 1]]) { z = new T.Vector3(...l); z.sub(x.clone().multiplyScalar(z.dot(x))); if (z.lengthSq() > 1e-4) break; }
    z.normalize(); const y = new T.Vector3().crossVectors(z, x);
    const geo = new T.RoundedBoxGeometry(cm(len), cm(h), cm(w), 2, cm(r == null ? Math.min(w, h) * 0.09 : r));
    const mesh = new T.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.copy(a.add(b).multiplyScalar(0.5)).multiplyScalar(0.01);
    mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
    g.add(mesh); return mesh;
  }

  // ---------- bases (cm; x = largo, z = ancho, y = arriba) ----------
  // ---------- bases (cm; x = largo, z = ancho, y = arriba): las piezas salen de DKAS.piezas ----------
  function base(g, c, mat, piso) {
    const P = D.piezas(c);
    P.barras.forEach(([p1, p2, w, h, lado]) => barra(g, mat, p1, p2, w, h, lado));
    P.pies.forEach(([x, z]) => { const m = new T.Mesh(new T.CylinderGeometry(cm(1.6), cm(1.8), cm(0.8), 20), piso); m.position.set(cm(x), cm(0.4), cm(z)); g.add(m); });
    if (P.ped) {
      const plato = new T.Mesh(new T.CylinderGeometry(cm(P.ped.plato / 2 - .4), cm(P.ped.plato / 2), cm(1.3), 64), mat); plato.position.y = cm(0.65); plato.castShadow = plato.receiveShadow = true; g.add(plato);
      const col = new T.Mesh(new T.CylinderGeometry(cm(P.ped.columna / 2), cm(P.ped.columna / 2), cm(P.ped.H - 1.3), 48), mat); col.position.y = cm(1.3 + (P.ped.H - 1.3) / 2); col.castShadow = true; g.add(col);
    }
  }

  // ---------- forma de la cubierta (cm, centrada) ----------
  function forma(fm, L, W, r, pts) {
    const sh = new T.Shape(), a = L / 2, b = W / 2;
    // Estudio: cualquier contorno (puntos [x, z] en cm); en la figura y = -z
    if (pts && pts.length > 2) { pts.forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)); sh.closePath(); return sh; }
    if (fm === 'round') sh.absarc(0, 0, a, 0, Math.PI * 2, false);
    else if (fm === 'oval') sh.absellipse(0, 0, a, b, 0, Math.PI * 2, false);
    else {
      r = Math.max(fm === 'ovcuad' ? r : 0.6, 0.3);
      sh.moveTo(-a + r, -b); sh.lineTo(a - r, -b); sh.quadraticCurveTo(a, -b, a, -b + r); sh.lineTo(a, b - r); sh.quadraticCurveTo(a, b, a - r, b);
      sh.lineTo(-a + r, b); sh.quadraticCurveTo(-a, b, -a, b - r); sh.lineTo(-a, -b + r); sh.quadraticCurveTo(-a, -b, -a + r, -b);
      if (fm === 'ovcuad') { // esquinas de arco real, no curva cuadrática
        const s2 = new T.Shape(); s2.moveTo(-a + r, -b); s2.lineTo(a - r, -b); s2.absarc(a - r, -b + r, r, -Math.PI / 2, 0, false); s2.lineTo(a, b - r); s2.absarc(a - r, b - r, r, 0, Math.PI / 2, false);
        s2.lineTo(-a + r, b); s2.absarc(-a + r, b - r, r, Math.PI / 2, Math.PI, false); s2.lineTo(-a, -b + r); s2.absarc(-a + r, -b + r, r, Math.PI, Math.PI * 1.5, false); return s2;
      }
    }
    return sh;
  }
  // uL, uW: lo que mide la imagen en metros (la placa de 320 × 160, o la mesa entera si se arma con varias piezas)
  function placa(fm, L, W, r, esp, bisel, uL, uW, pts) {
    const geo = new T.ExtrudeGeometry(forma(fm, L, W, r, pts), { depth: esp, bevelEnabled: !!bisel, bevelThickness: bisel || 0, bevelSize: bisel || 0, bevelSegments: 3, curveSegments: 72 });
    geo.rotateX(-Math.PI / 2); geo.scale(0.01, 0.01, 0.01);
    // la foto de la placa completa (320 × 160) se acomoda a escala: la mesa se corta del centro de la placa
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (uL || 3.2), 0.5 - p.getZ(i) / (uW || 1.6));
    geo.computeVertexNormals(); return geo;
  }

  // ---------- sillas (para ver cuántas personas caben) ----------
  function silla(alta, tela, metal) {
    const g = new T.Group(), h = alta ? 75 : 46;
    const asiento = new T.Mesh(new T.RoundedBoxGeometry(cm(44), cm(7), cm(44), 3, cm(3)), tela); asiento.position.y = cm(h - 3.5); g.add(asiento);
    if (!alta) { const resp = new T.Mesh(new T.RoundedBoxGeometry(cm(42), cm(40), cm(6), 3, cm(2.5)), tela); resp.position.set(0, cm(h + 22), cm(-19)); resp.rotation.x = -0.1; g.add(resp); }
    else { const resp = new T.Mesh(new T.RoundedBoxGeometry(cm(38), cm(14), cm(4), 3, cm(1.5)), tela); resp.position.set(0, cm(h + 16), cm(-20)); g.add(resp); }
    [-1, 1].forEach(a => [-1, 1].forEach(b => { const p = new T.Mesh(new T.CylinderGeometry(cm(1.2), cm(1), cm(h - 7), 10), metal); p.position.set(cm(a * 18), cm((h - 7) / 2), cm(b * 18)); g.add(p); }));
    if (alta) { const aro = new T.Mesh(new T.TorusGeometry(cm(25), cm(0.8), 8, 4), metal); aro.rotation.set(Math.PI / 2, 0, Math.PI / 4); aro.position.y = cm(28); g.add(aro); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  // puntos sobre la orilla, repartidos parejo, con su dirección hacia afuera
  function lugares(m, c) {
    const est = c && c.estudio, n = est ? c.personas : D.personas(m), L = m.L, W = m.W, out = [], sep = 14;
    if (!n) return out;
    if (!est || !(m.forma === 'libre' || (+m.r > 5 && m.forma !== 'ovcuad'))) if (m.forma === 'rect' || m.forma === 'square') {
      const k = m.forma === 'square' ? Math.max(1, Math.floor(L / D.POR_PERSONA)) : Math.floor(L / D.POR_PERSONA);
      for (let i = 0; i < k; i++) { const x = -L / 2 + L / k * (i + 0.5); out.push([x, W / 2 + sep, Math.PI], [x, -W / 2 - sep, 0]); }
      if (m.forma === 'square') for (let i = 0; i < k; i++) { const z = -W / 2 + W / k * (i + 0.5); out.push([L / 2 + sep, z, -Math.PI / 2], [-L / 2 - sep, z, Math.PI / 2]); }
      else if (W >= 90) out.push([L / 2 + sep, 0, -Math.PI / 2], [-L / 2 - sep, 0, Math.PI / 2]);
      return out;
    }
    // orilla curva: se muestrea la forma y se reparte por longitud
    const pts = (est ? forma('libre', L, W, 0, c.contorno) : forma(m.forma, L, W, D.radio(m))).getSpacedPoints(400);
    const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const tot = acc[acc.length - 1];
    // en la ovalada cuadrada se empieza a la mitad de un lado largo para que queden simétricas
    for (let i = 0; i < n; i++) {
      const d = (tot / n) * (i + 0.5); let j = acc.findIndex(v => v >= d); if (j < 1) j = 1;
      const p = pts[j], q = pts[j - 1], tx = p.x - q.x, ty = p.y - q.y, ln = Math.hypot(tx, ty) || 1;
      let nx = ty / ln, ny = -tx / ln; if (nx * p.x + ny * p.y < 0) { nx = -nx; ny = -ny; }
      out.push([p.x + nx * sep, -(p.y + ny * sep), Math.atan2(-nx, ny)]);
    }
    return out;
  }

  // ---------- visor ----------
  function crear(el, op) {
    op = Object.assign({ tex: 'tex/piedras/', fondo: 0xf4f2ee }, op || {});
    const R = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 0.82;
    R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
    el.appendChild(R.domElement); R.domElement.style.display = 'block';
    // en celular, deslizar hacia arriba o abajo mueve la página (el dedo no se queda atorado en el 3D); de lado gira la mesa y con dos dedos se acerca
    R.domElement.style.touchAction = matchMedia('(pointer:coarse)').matches ? 'pan-y' : 'none';
    const scene = new T.Scene(); scene.background = new T.Color(op.fondo);
    const cam = new T.PerspectiveCamera(32, 1, 0.05, 60);

    // reflejos de estudio: un cuarto blanco con paneles de luz
    const pm = new T.PMREMGenerator(R), env = new T.Scene();
    env.add(new T.Mesh(new T.BoxGeometry(12, 6, 12), new T.MeshBasicMaterial({ color: 0x8a8580, side: T.BackSide })));
    [[0, 2.9, 0, 6, 0.1, 3, 6], [-5.9, 1.5, 0, 0.1, 2, 5, 3], [5.9, 1.8, 1, 0.1, 2.5, 4, 2.2], [0, 1.5, -5.9, 5, 2, 0.1, 1.6]].forEach(([x, y, z, w, h, d, k]) => {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color: new T.Color(k, k, k) })); m.position.set(x, y, z); env.add(m); });
    scene.environment = pm.fromScene(env, 0.035).texture; // reflejos suaves, sin quemar la piedra blanca

    scene.add(new T.HemisphereLight(0xffffff, 0xd8d2c8, 0.3));
    const sol = new T.DirectionalLight(0xffffff, 0.95); sol.position.set(2.2, 5, 2.8); sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048); sol.shadow.radius = 6; sol.shadow.bias = -0.0004; Object.assign(sol.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 12 });
    scene.add(sol);
    const piso = new T.Mesh(new T.PlaneGeometry(30, 30), new T.ShadowMaterial({ opacity: 0.16 })); piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; scene.add(piso);

    const acero = new T.MeshStandardMaterial({ color: 0x1c1c1d, metalness: 0.55, roughness: 0.48, roughnessMap: ruido(256, 150, 215), bumpMap: ruido(256, 110, 145), bumpScale: 0.00035, envMapIntensity: 0.9 });
    const hule = new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const mdfMat = new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
    const tela = new T.MeshStandardMaterial({ color: 0x6f665b, roughness: 0.95, envMapIntensity: 0.3 });
    const metalS = new T.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.5, roughness: 0.45 });
    const loader = new T.TextureLoader(), cache = {};
    function textura(id) {
      if (cache[id]) return cache[id];
      const c = { tex: null, color: new T.Color(0xdddddd), listo: null };
      c.listo = new Promise(ok => {
        c.tex = loader.load(op.tex + id + '.jpg', t => {
          try { const k = document.createElement('canvas'); k.width = k.height = 1; const x = k.getContext('2d'); x.drawImage(t.image, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; c.color.setRGB(d[0] / 255, d[1] / 255, d[2] / 255).convertSRGBToLinear(); } catch (e) {}
          pinta(); ok();
        }, undefined, () => ok());
        c.tex.encoding = T.sRGBEncoding; c.tex.anisotropy = R.capabilities.getMaxAnisotropy();
      });
      return (cache[id] = c);
    }

    // mesa más grande que una placa: se arma la imagen con las piezas reales (cada una cortada del centro de la placa,
    // en espejo alternado) y se marca la unión con una línea fina, como queda en el taller
    let comp = null;
    function compuesta(id, M, v) {
      const key = [id, M.L, M.W, v.nL, v.nW].join('|');
      if (comp && comp.key === key) return comp;
      if (comp) comp.tex.dispose();
      const base = textura(id), k = Math.min(6.4, 4096 / M.L, 4096 / M.W), cv = document.createElement('canvas');
      cv.width = Math.round(M.L * k); cv.height = Math.round(M.W * k);
      const c = { key, tex: new T.CanvasTexture(cv), color: base.color };
      c.tex.encoding = T.sRGBEncoding; c.tex.anisotropy = R.capabilities.getMaxAnisotropy();
      c.listo = base.listo.then(() => {
        const im = base.tex.image; if (!im || !im.width) return;
        const x = cv.getContext('2d'), pL = M.L / v.nL, pW = M.W / v.nW, sx = im.width / 320, sy = im.height / 160;
        for (let i = 0; i < v.nL; i++) for (let j = 0; j < v.nW; j++) {
          const sw = Math.min(im.width, pL * sx), sh = Math.min(im.height, pW * sy);
          x.save(); x.translate((i + i % 2) * pL * k, (j + j % 2) * pW * k); x.scale(i % 2 ? -1 : 1, j % 2 ? -1 : 1);
          x.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, 0, 0, pL * k, pW * k); x.restore();
        }
        x.beginPath();
        for (let i = 1; i < v.nL; i++) { x.moveTo(i * pL * k, 0); x.lineTo(i * pL * k, cv.height); }
        for (let j = 1; j < v.nW; j++) { x.moveTo(0, j * pW * k); x.lineTo(cv.width, j * pW * k); }
        // línea doble (clara y oscura) para que se vea en piedras claras y oscuras
        x.strokeStyle = 'rgba(255,250,240,.45)'; x.lineWidth = Math.max(2.5, k * 0.45); x.stroke();
        x.strokeStyle = 'rgba(50,45,40,.7)'; x.lineWidth = Math.max(1.2, k * 0.18); x.stroke(); c.tex.needsUpdate = true; pinta();
      });
      return (comp = c);
    }

    // ---------- cotas: las medidas dibujadas junto a la mesa, como en un plano ----------
    const cotas = new T.Group(), rejilla = new T.GridHelper(30, 60, 0x9c8a70, 0xb9ad9b);
    rejilla.material.transparent = true; rejilla.material.opacity = 0.22; rejilla.material.depthWrite = false; rejilla.position.y = 0.001;
    scene.add(cotas, rejilla);
    let conCotas = true;
    const lineaMat = new T.LineBasicMaterial({ color: 0x8a6a3a, depthTest: false, transparent: true });
    function etiqueta(txt, alto) {
      const cv = document.createElement('canvas'), x = cv.getContext('2d'), f = '500 52px Jost, "Segoe UI", sans-serif';
      x.font = f; const w = Math.ceil(x.measureText(txt).width) + 56; cv.width = w; cv.height = 84;
      x.font = f; x.fillStyle = 'rgba(14,12,10,.88)'; x.beginPath(); x.moveTo(42, 0); x.arcTo(w, 0, w, 84, 42); x.arcTo(w, 84, 0, 84, 42); x.arcTo(0, 84, 0, 0, 42); x.arcTo(0, 0, w, 0, 42); x.fill();
      x.fillStyle = '#f1e6d2'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, w / 2, 45);
      const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
      sp.scale.set(alto * w / 84, alto, 1); sp.renderOrder = 20; return sp;
    }
    function linea(pts) { const l = new T.Line(new T.BufferGeometry().setFromPoints(pts.map(p => new T.Vector3(...p))), lineaMat); l.renderOrder = 19; return l; }
    function hacerCotas(M) {
      while (cotas.children.length) { const o = cotas.children.pop(); if (o.geometry) o.geometry.dispose(); if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }
      const L = cm(M.L), W = cm(M.W), H = cm(M.H), y = 0.004, off = conSillas && M.uso !== 'centro' ? 0.82 : 0.3, t = 0.06;
      const recta = M.forma === 'rect' || M.forma === 'square';
      const alto = Math.max(0.1, Math.min(0.26, Math.max(L, H * 1.5) * 0.05));
      // largo (o diámetro) al frente, sobre el piso
      const zf = W / 2 + off;
      cotas.add(linea([[-L / 2, y, zf], [L / 2, y, zf]]), linea([[-L / 2, y, recta ? W / 2 : 0], [-L / 2, y, zf + t]]), linea([[L / 2, y, recta ? W / 2 : 0], [L / 2, y, zf + t]]));
      const e1 = etiqueta((M.forma === 'round' ? 'Ø ' : '') + M.L + ' cm', alto); e1.position.set(0, y + alto * 0.7, zf); cotas.add(e1);
      // ancho a la derecha
      if (M.forma !== 'round') {
        const xd = L / 2 + off;
        cotas.add(linea([[xd, y, -W / 2], [xd, y, W / 2]]), linea([[recta ? L / 2 : 0, y, -W / 2], [xd + t, y, -W / 2]]), linea([[recta ? L / 2 : 0, y, W / 2], [xd + t, y, W / 2]]));
        const e2 = etiqueta(M.W + ' cm', alto); e2.position.set(xd, y + alto * 0.7, 0); cotas.add(e2);
      }
      // altura en la esquina de enfrente
      const xa = -L / 2 - 0.12, za = recta ? W / 2 : 0;
      cotas.add(linea([[xa, 0, za], [xa, H, za]]), linea([[xa - t / 2, H, za], [-L / 2, H, za]]), linea([[xa - t / 2, 0, za], [xa + t / 2, 0, za]]));
      const e3 = etiqueta('h ' + M.H + ' cm', alto); e3.position.set(xa - alto * 0.4, H / 2, za); cotas.add(e3);
      cotas.visible = rejilla.visible = conCotas;
    }

    let mesa = new T.Group(), sillas = new T.Group(), actual = null, conSillas = true;
    scene.add(mesa, sillas);
    function construir(m) {
      actual = m; const c = D.calcular(m), M = c.m;
      [mesa, sillas].forEach(g => { while (g.children.length) { const o = g.children.pop(); o.traverse(x => x.geometry && x.geometry.dispose()); } });
      const v = c.viab || D.viabilidad(M), varias = v.placas > 1;
      // color de la base: los metálicos (dorado, champagne, bronce) brillan un poco más
      const col = D.color(M.color), metal = ['dorado', 'champagne', 'bronce'].includes(col.id);
      acero.color.set(col.hex).convertSRGBToLinear(); acero.metalness = metal ? 0.8 : 0.55; acero.roughness = metal ? 0.34 : 0.48;
      const tx = varias ? compuesta(M.piedra, M, v) : textura(M.piedra), rug = (D.RUGOSIDAD || {})[M.piedra] ?? 0.45, pul = rug < 0.3;
      // la piedra se ve con el color de su foto: sin el filtro de cine (tone mapping) que la deslava, y con poco reflejo
      const K = PIEDRA_LUZ.k, cara = new T.MeshPhysicalMaterial({ map: tx.tex, color: new T.Color(K, K, K), roughness: rug, clearcoat: pul ? PIEDRA_LUZ.cc : 0.04, clearcoatRoughness: 0.2, envMapIntensity: PIEDRA_LUZ.env, toneMapped: false });
      const canto = new T.MeshStandardMaterial({ color: tx.color.clone().multiplyScalar(K), roughness: 0.45, toneMapped: false });
      const top = new T.Mesh(placa(M.forma, M.L, M.W, D.radio(M), 1.2 - 0.3, 0.15, varias ? cm(M.L) : 0, varias ? cm(M.W) : 0, c.estudio ? c.contorno : null), [cara, canto]); top.position.y = cm(M.H - 1.2 + 0.15); top.castShadow = top.receiveShadow = true; top.name = 'piedra';
      top.userData.canto = canto;
      const mdf = new T.Mesh(placa(c.mdf.forma, c.mdf.L, c.mdf.W, c.mdf.r, 1.2, 0, 0, 0, c.estudio ? c.mdf.contorno : null), mdfMat); mdf.position.y = cm(M.H - 2.5 + 0.05); mdf.castShadow = true;
      mesa.add(top, mdf);
      const g = new T.Group(); base(g, c, acero, hule); mesa.add(g);
      if (M.uso !== 'centro') lugares(M, c).forEach(([x, z, a]) => { const s = silla(M.uso === 'periquera', tela, metalS); s.position.set(cm(x), 0, cm(z)); s.rotation.y = a; sillas.add(s); });
      sillas.visible = conSillas; hacerCotas(M);
      encuadre(); pinta();
      return tx.listo;
    }

    // cámara orbital sencilla
    let az = 0.7, pol = 1.12, dist = 4, meta = null, ancho = 1, alto = 1;
    const pt = new Map(); let d0 = 0, vel = 0, tMov = 0; // dedos en pantalla, pellizco e impulso del giro
    const VISTAS = { tres: [0.7, 1.12], frente: [0, 1.42], arriba: [0, 0.02], lado: [Math.PI / 2, 1.38] };
    function encuadre() {
      if (!actual) return; const ext = Math.max(actual.L + (conSillas && actual.uso !== 'centro' ? 70 : 10) + (conCotas ? 50 : 0), actual.H * 1.5) / 100;
      dist = ext * (ancho / alto < 1 ? 2.6 : 1.85) + 0.6; sol.shadow.camera.left = -ext; sol.shadow.camera.right = ext; sol.shadow.camera.top = ext; sol.shadow.camera.bottom = -ext; sol.shadow.camera.updateProjectionMatrix();
    }
    function colocar() {
      const y = cm(actual ? actual.H * 0.45 : 40);
      cam.position.set(dist * Math.sin(pol) * Math.sin(az), y + dist * Math.cos(pol), dist * Math.sin(pol) * Math.cos(az)); cam.lookAt(0, y, 0);
    }
    let pend = false;
    function pinta() { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; anim(); }); }
    function anim() {
      // al soltar, la mesa sigue girando un poco y frena suave
      if (vel && !pt.size && !meta) { az -= vel; vel *= 0.92; if (Math.abs(vel) < 0.0004) vel = 0; else pinta(); }
      if (meta) { az += (meta[0] - az) * 0.18; pol += (meta[1] - pol) * 0.18; if (Math.abs(meta[0] - az) + Math.abs(meta[1] - pol) < 0.002) meta = null; else pinta(); }
      colocar(); R.render(scene, cam);
    }
    function medir() { ancho = el.clientWidth || 1; alto = el.clientHeight || 1; R.setSize(ancho, alto, false); R.domElement.style.width = '100%'; R.domElement.style.height = '100%'; cam.aspect = ancho / alto; cam.updateProjectionMatrix(); encuadre(); pinta(); }
    if (window.ResizeObserver) new ResizeObserver(medir).observe(el); else window.addEventListener('resize', medir);
    medir();

    // arrastrar para girar, rueda o pellizco para acercar
    R.domElement.addEventListener('pointerdown', e => { pt.set(e.pointerId, [e.clientX, e.clientY]); R.domElement.setPointerCapture(e.pointerId); meta = null; vel = 0; });
    R.domElement.addEventListener('pointermove', e => {
      if (!pt.has(e.pointerId)) return; const [x0, y0] = pt.get(e.pointerId); pt.set(e.pointerId, [e.clientX, e.clientY]);
      if (pt.size === 2) { const [a, b] = [...pt.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d0) dist = Math.max(1, Math.min(30, dist * d0 / d)); d0 = d; }
      else { const dx = (e.clientX - x0) * 0.008; az -= dx; vel = vel * 0.5 + dx * 0.5; tMov = performance.now(); pol = Math.max(0.02, Math.min(1.5, pol - (e.clientY - y0) * 0.006)); }
      pinta();
    });
    // si el dedo se quedó quieto antes de soltar, no hay impulso; con dos dedos (pellizco) tampoco
    const suelta = e => { const dos = pt.size > 1; pt.delete(e.pointerId); d0 = 0; if (dos || performance.now() - tMov > 80) vel = 0; vel = Math.max(-0.12, Math.min(0.12, vel)); pinta(); };
    R.domElement.addEventListener('pointerup', suelta); R.domElement.addEventListener('pointercancel', suelta);
    R.domElement.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(1, Math.min(30, dist * (1 + Math.sign(e.deltaY) * 0.08))); pinta(); }, { passive: false });

    return {
      mostrar: construir, _mesa: () => mesa,
      vista(k) { meta = VISTAS[k] ? VISTAS[k].slice() : null; if (meta && k !== 'arriba') meta[0] += Math.round((az - meta[0]) / (2 * Math.PI)) * 2 * Math.PI; pinta(); },
      sillas(v) { conSillas = !!v; sillas.visible = conSillas; if (actual) hacerCotas(actual.estudio ? D.calcular(actual).m : D.normalizar(actual)); encuadre(); pinta(); },
      cotas(v) { conCotas = !!v; cotas.visible = rejilla.visible = conCotas; pinta(); },
      // foto de la mesa (JPEG) para el pedido, el panel y WhatsApp
      // conMedidas: la foto lleva las cotas (para la ficha técnica); la del pedido sale limpia
      foto(w, h, conMedidas, zoom) {
        w = w || 1200; h = h || 800; const keep = [az, pol, dist, ancho, alto, R.getPixelRatio()];
        const ver = conCotas; cotas.visible = rejilla.visible = !!conMedidas;
        az = 0.72; pol = 1.2; ancho = w; alto = h; R.setPixelRatio(1); R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); encuadre(); dist *= zoom || 0.92;
        colocar(); R.render(scene, cam); const url = R.domElement.toDataURL('image/jpeg', 0.86);
        cotas.visible = rejilla.visible = ver; [az, pol, dist] = keep; R.setPixelRatio(keep[5]); medir(); return url;
      },
      // la mesa sola (sin sillas) en GLB a escala real, para verla en tu espacio
      glb() {
        return new Promise((ok, bad) => {
          if (!T.GLTFExporter) return bad(new Error('falta GLTFExporter'));
          const r = mesa.clone(true); r.name = 'Mesa DKAS';
          r.traverse(o => { if (o.isMesh && o.name === 'piedra') o.material = o.material.map(m => { const k = new T.MeshStandardMaterial({ map: m.map || null, color: m.map ? 0xffffff : m.color, roughness: m.map ? 0.2 : 0.4 }); return k; }); });
          new T.GLTFExporter().parse(r, ok, { binary: true, embedImages: true, maxTextureSize: 2048 });
        });
      },
      // la mesa sola en OBJ (solo geometría, en metros) para SketchUp, Rhino, Revit o 3ds Max
      obj() { if (!T.OBJExporter) throw new Error('falta OBJExporter'); const r = mesa.clone(true); r.updateMatrixWorld(true); return new T.OBJExporter().parse(r); },
      listo: () => actual && (comp && comp.key.startsWith(actual.piedra + '|' + actual.L + '|' + actual.W + '|') ? comp.listo : textura(actual.piedra).listo),
    };
  }

  window.DKAS3D = { crear };
})();

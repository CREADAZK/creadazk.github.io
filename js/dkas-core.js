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
/* DKAS · el maestro de mesas. Una sola lógica para la página de clientes, el panel y el croquis.
   Todo en centímetros. Solo existen mesas que el taller puede hacer fácil y bien:
   5 formas, 7 bases de PTR, 11 piedras sinterizadas (placa de 320 × 160 cm, 12 mm) y 70 cm por persona. */
(function (root) {
  const PLACA = { L: 320, W: 160, esp: 1.2, m2: 5.12 };
  const MDF_ESP = 1.2, CUBIERTA = 2.5; // piedra 12 mm + MDF 12 mm + pegamento: la base mide la altura menos 2.5 cm
  const POR_PERSONA = 70;

  // las 11 piedras, descritas como se ven en la placa real (fotos de la fábrica, oct 2026); acabado = lo que dice la etiqueta del canto
  // rugosidad para el 3D: pulida brilla, mate y velvet no
  const PIEDRAS = [
    ['statuario', 'Statuario', 'Blanco con veta gris fina', ''],
    ['mont-blanc', 'Mont Blanc', 'Blanco con veta gris suave', ''],
    ['pure-white', 'Pure White', 'Blanco liso, textura cepillada', 'Cepillado'],
    ['taj-mahal-light', 'Taj Mahal Light', 'Hueso cálido con veta muy suave', 'Mate suave'],
    ['classic-bulgar', 'Classic Bulgar', 'Blanco con veta gris vino y toques cobre', ''],
    ['peacock', 'Peacock', 'Blanco con manchas azul acero y chocolate', 'Pulido'],
    ['cardenaskin', 'Cardenaskin', 'Blanco cálido con veta dorada', 'Mate suave'],
    ['travertine', 'Travertine', 'Beige arena con nubes suaves', 'Aterciopelado'],
    ['limestone-cream', 'Limestone Cream', 'Crema tipo cantera, textura natural', ''],
    ['saloran-grey', 'Saloran Grey', 'Gris cemento, textura de gamuza', 'Aterciopelado'],
    ['bulgaria-dark-grey', 'Bulgaria Dark Grey', 'Gris oscuro con veta blanca', 'Aterciopelado'],
  ].map(([id, nombre, desc, acabado]) => ({ id, nombre, desc, acabado }));
  const RUGOSIDAD = { statuario: 0.2, 'mont-blanc': 0.2, 'classic-bulgar': 0.2, peacock: 0.16, 'pure-white': 0.55, 'taj-mahal-light': 0.45, cardenaskin: 0.45, travertine: 0.6, 'limestone-cream': 0.7, 'saloran-grey': 0.6, 'bulgaria-dark-grey': 0.6 };

  const FORMAS = {
    rect: 'Rectangular', ovcuad: 'Ovalada cuadrada', oval: 'Ovalada', square: 'Cuadrada', round: 'Redonda',
  };
  const FORMA_DESC = {
    rect: 'Esquinas rectas', ovcuad: 'Rectangular con esquinas bien redondas: caben más personas', oval: 'Óvalo completo',
    square: 'Mismo largo y ancho', round: 'Círculo',
  };

  // PTR de 2" (5 × 5 cm) pintado negro, salvo donde se dice otra cosa
  const BASES = {
    patas: { nombre: '4 patas', desc: 'Cuatro patas rectas y bastidor. La más sencilla y firme.' },
    marco: { nombre: 'Marco rectangular', desc: 'Un marco cerrado en cada extremo, unido por largueros.' },
    trapecio: { nombre: 'Trapecio', desc: 'Un marco en cada extremo que se abre hacia el piso.' },
    x: { nombre: 'X', desc: 'Dos patas cruzadas en X en cada extremo.' },
    zeta: { nombre: 'Z', desc: 'Una Z de PTR en cada esquina: ligera y moderna.' },
    t: { nombre: 'T doble', desc: 'Un poste con pie en cada extremo y viga central. Deja libres los lados.' },
    ym: { nombre: 'Y maestra', desc: 'Una Y de PTR en cada extremo sobre un pie al piso, unidas por una viga baja. Nuestra insignia.' },
    ped: { nombre: 'Pedestal', desc: 'Una columna al centro con plato al piso y cruz arriba.' },
  };

  // colores de la base (pintura electrostática); los mismos nombres que usa el panel
  const COLORES = [['negro', 'Negro mate', '#1f1e1d'], ['blanco', 'Blanco mate', '#ecebe6'], ['grafito', 'Gris grafito', '#4b4b4b'],
    ['dorado', 'Dorado', '#b8954f'], ['champagne', 'Champagne', '#cdbb97'], ['bronce', 'Bronce', '#7a5a3a']].map(([id, nombre, hex]) => ({ id, nombre, hex }));
  const color = id => COLORES.find(c => c.id === id) || COLORES[0];

  // medidas que el taller sí puede hacer, por uso y forma (L = largo o diámetro, W = ancho)
  const USOS = {
    comedor: { nombre: 'Comedor', H: 75, formas: {
      rect: { L: [140, 320], W: [80, 160] }, ovcuad: { L: [140, 320], W: [80, 160] }, oval: { L: [160, 320], W: [90, 160] },
      square: { L: [90, 160] }, round: { L: [90, 160] } } },
    centro: { nombre: 'Centro', H: 40, formas: {
      rect: { L: [90, 160], W: [50, 100] }, ovcuad: { L: [90, 160], W: [50, 100] }, oval: { L: [100, 160], W: [50, 100] },
      square: { L: [60, 120] }, round: { L: [60, 120] } } },
    periquera: { nombre: 'Periquera', H: 105, formas: {
      rect: { L: [100, 240], W: [50, 80] }, ovcuad: { L: [100, 240], W: [50, 80] }, square: { L: [60, 100] }, round: { L: [60, 100] } } },
  };
  const USO_DESC = { comedor: 'Altura 75 cm', centro: 'Para sala · altura 40 cm', periquera: 'Barra o terraza · altura 105 cm' };

  const MODELOS = [
    { id: 'maestra', nombre: 'Maestra', uso: 'comedor', forma: 'rect', L: 280, W: 150, base: 'ym', piedra: 'statuario' },
    { id: 'aura', nombre: 'Aura', uso: 'comedor', forma: 'ovcuad', L: 240, W: 110, base: 'marco', piedra: 'mont-blanc' },
    { id: 'valor', nombre: 'Valor', uso: 'comedor', forma: 'rect', L: 210, W: 100, base: 'patas', piedra: 'taj-mahal-light' },
    { id: 'terra', nombre: 'Terra', uso: 'comedor', forma: 'oval', L: 260, W: 120, base: 't', piedra: 'cardenaskin' },
    { id: 'zeta', nombre: 'Zeta', uso: 'comedor', forma: 'rect', L: 220, W: 100, base: 'zeta', piedra: 'bulgaria-dark-grey' },
    { id: 'cruce', nombre: 'Cruce', uso: 'comedor', forma: 'ovcuad', L: 200, W: 100, base: 'x', piedra: 'classic-bulgar' },
    { id: 'nexo', nombre: 'Nexo', uso: 'comedor', forma: 'round', L: 140, W: 140, base: 'ped', piedra: 'statuario' },
    { id: 'cuadra', nombre: 'Cuadra', uso: 'comedor', forma: 'square', L: 140, W: 140, base: 'patas', piedra: 'saloran-grey' },
    { id: 'origen', nombre: 'Origen', uso: 'centro', forma: 'rect', L: 120, W: 70, base: 'patas', piedra: 'travertine' },
    { id: 'luna', nombre: 'Luna', uso: 'centro', forma: 'round', L: 90, W: 90, base: 'ped', piedra: 'peacock' },
    { id: 'alta', nombre: 'Alta', uso: 'periquera', forma: 'round', L: 70, W: 70, base: 'ped', piedra: 'pure-white' },
    { id: 'barra', nombre: 'Barra', uso: 'periquera', forma: 'rect', L: 180, W: 60, base: 'marco', piedra: 'limestone-cream' },
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r5 = v => Math.round(v / 5) * 5, r1 = v => Math.round(v * 10) / 10;
  const redonda = f => f === 'round' || f === 'square';
  const piedra = id => PIEDRAS.find(p => p.id === id) || PIEDRAS[0];

  // radio de las esquinas de la ovalada cuadrada
  const radio = m => m.forma === 'ovcuad' ? clamp(Math.round(m.W * 0.3), 20, 50) : 0;

  function formasDe(uso) { return Object.keys(USOS[uso].formas); }

  // límites para el ancho, que dependen del largo (una rectangular nunca es casi cuadrada; un óvalo es alargado)
  function limites(uso, forma, L) {
    const f = USOS[uso].formas[forma];
    if (redonda(forma)) return { L: f.L, W: f.L };
    const prop = forma === 'oval' ? 1.4 : uso === 'centro' ? 1.2 : 1.15;
    const Wmax = Math.min(f.W[1], Math.floor((L || f.L[1]) / prop / 5) * 5);
    return { L: f.L, W: [f.W[0], Math.max(f.W[0], Wmax)] };
  }

  // ancho natural para un largo (las mesas que mejor se ven y se usan)
  function anchoPara(uso, forma, L) {
    let W;
    if (uso === 'comedor') W = L <= 170 ? 90 : L <= 220 ? 100 : L <= 250 ? 110 : L <= 270 ? 120 : 150;
    else if (uso === 'centro') W = clamp(r5(L * 0.6), 50, 100);
    else W = L <= 140 ? 60 : 70;
    const lim = limites(uso, forma, L).W;
    return clamp(W, lim[0], lim[1]);
  }

  // personas: 70 cm de orilla por persona
  function perimetro(m) {
    if (m.forma === 'round') return Math.PI * m.L;
    if (m.forma === 'oval') { const a = m.L / 2, b = m.W / 2; return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); }
    const r = radio(m);
    return 2 * (m.L + m.W) - 8 * r + 2 * Math.PI * r;
  }
  function personas(m) {
    if (m.uso === 'centro') return 0;
    const recta = 2 * Math.floor(m.L / POR_PERSONA) + (m.W >= 90 ? 2 : 0);
    if (m.forma === 'rect') return recta;
    if (m.forma === 'square') return 4 * Math.max(1, Math.floor(m.L / POR_PERSONA));
    // sin esquinas se aprovecha toda la orilla, nunca caben menos que en la rectangular
    return Math.max(m.forma === 'ovcuad' ? recta : 0, Math.floor(perimetro(m) / POR_PERSONA));
  }

  // la mesa más chica de esa forma donde caben n personas
  function tamanoPara(uso, forma, n) {
    const f = USOS[uso].formas[forma];
    for (let L = f.L[0]; L <= f.L[1]; L += 10) {
      const W = redonda(forma) ? L : anchoPara(uso, forma, L);
      if (personas({ uso, forma, L, W }) >= n) return { L, W };
    }
    return null;
  }
  function opcionesPersonas(uso, forma) {
    if (uso === 'centro') return [];
    // cuántas personas caben en cada tamaño natural de esa forma, sin repetir
    const f = USOS[uso].formas[forma], out = [];
    for (let L = f.L[0]; L <= f.L[1]; L += 10) {
      const n = personas({ uso, forma, L, W: redonda(forma) ? L : anchoPara(uso, forma, L) });
      if (n && !out.includes(n)) out.push(n);
    }
    return out;
  }

  // ---------- bases diseñadas en el panel ----------
  // segs: tramos de la vista de frente [x1, y1, x2, y2]; x de -1 a 1 (punta a punta de la base), y de 0 (piso) a 1 (arriba)
  const PERFILES = { ligero: { nombre: 'PTR 2" × 2"', fondo: 5, alto: 5, mat: 'PTR 2" × 2" cal. 14' }, robusto: { nombre: 'PTR 4" × 2"', fondo: 5, alto: 10, mat: 'PTR 4" × 2" cal. 14' }, solera: { nombre: 'Solera 6" × 1/2"', fondo: 15, alto: 1.27, mat: 'Solera 6" × 1/2"' } };
  const propias = [];
  function registrarBase(id, b) {
    if (!b || !Array.isArray(b.segs) || !b.segs.length) return;
    BASES[id] = { nombre: String(b.nombre || 'Base nueva').slice(0, 40), desc: String(b.desc || 'Diseño DKAS hecho en el taller.').slice(0, 140), segs: b.segs.map(q => q.map(Number)), perfil: PERFILES[b.perfil] ? b.perfil : 'ligero', foto: b.foto || null, propia: true, cli: !!b.cli };
    if (!b.cli && !propias.includes(id)) propias.push(id); // la base de un cliente es solo para su mesa: no entra a la lista
  }
  function quitarBase(id) { const i = propias.indexOf(id); if (i >= 0) propias.splice(i, 1); delete BASES[id]; }

  // qué bases sí funcionan para esa mesa
  function basesPara(m) {
    const extra = ['rect', 'ovcuad', 'oval'].includes(m.forma) ? propias.concat(BASES[m.base] && BASES[m.base].cli ? [m.base] : []) : [];
    return basesNuestras(m).concat(extra);
  }
  function basesNuestras(m) {
    const { uso, forma, L, W } = m;
    if (uso === 'comedor') {
      if (forma === 'round') return L >= 110 ? ['ped', 'patas'] : ['ped'];
      if (forma === 'square') return L <= 130 ? ['patas', 'ped'] : ['patas'];
      if (forma === 'oval') return ['t', 'x', 'patas'];
      return ['patas', 'marco', 'trapecio', 'x', 'zeta', 't'].concat(L >= 220 && W >= 100 ? ['ym'] : []);
    }
    if (uso === 'centro') {
      if (forma === 'round') return L >= 80 ? ['ped', 'patas'] : ['ped'];
      if (forma === 'square') return ['patas', 'ped'];
      if (forma === 'oval') return ['patas', 'x'];
      return ['patas', 'marco', 'trapecio', 'x'];
    }
    if (redonda(forma)) return ['ped'];
    return ['patas', 'marco', 'trapecio', 't'];
  }

  // medidas libres: el cliente pone la que quiera; solo se descartan números imposibles (viabilidad() le dice qué tan difícil es)
  const ABS = { L: [30, 1200], W: [30, 400], H: [30, 120] };
  function normalizar(m) {
    const uso = USOS[m.uso] ? m.uso : 'comedor';
    const forma = USOS[uso].formas[m.forma] ? m.forma : formasDe(uso)[0];
    const f = USOS[uso].formas[forma];
    let L = clamp(Math.round(+m.L || f.L[0]), ...ABS.L);
    let W = redonda(forma) ? L : clamp(Math.round(+m.W || anchoPara(uso, forma, L)), ...ABS.W);
    if (W > L) [L, W] = [clamp(W, ...ABS.L), L]; // 100 × 250 es la misma mesa que 250 × 100
    const H = +m.H ? clamp(Math.round(+m.H), ...ABS.H) : USOS[uso].H;
    const out = { uso, forma, L, W, H, piedra: piedra(m.piedra).id, color: color(m.color).id };
    const bs = basesPara(Object.assign({}, out, { base: m.base }));
    out.base = bs.includes(m.base) ? m.base : bs[0];
    if (m.modelo && MODELOS.some(x => x.id === m.modelo && x.uso === uso && x.forma === forma && x.L === L && x.W === W && x.base === out.base)) out.modelo = m.modelo;
    return out;
  }

  // ---------- qué tan difícil es de fabricar (nunca se bloquea: siempre se puede cotizar) ----------
  const NIVELES = [
    { id: 'estandar', t: 'Fabricación estándar', d: 'Sale de una sola placa y la hacemos sin complicaciones.' },
    { id: 'especial', t: 'Proyecto especial', d: 'Se puede hacer. Tiene detalles que revisamos contigo al cotizar.' },
    { id: 'reto', t: 'Alta complejidad', d: 'Es un reto de fabricación. Cotízala y la revisamos juntos antes de confirmar.' },
  ];
  function area(m) {
    const { forma, L, W } = m;
    return forma === 'round' ? Math.PI * L * L / 4 : forma === 'oval' ? Math.PI * L * W / 4 : forma === 'ovcuad' ? L * W - (4 - Math.PI) * radio(m) ** 2 : L * W;
  }
  function viabilidad(m0) {
    const m = m0.H ? m0 : normalizar(m0), { uso, forma, L, W, H } = m, red = redonda(forma), U = USOS[uso], pts = [];
    let nivel = 0;
    const sube = (n, txt) => { pts.push({ n, txt }); nivel = Math.max(nivel, n); };
    // la placa mide 320 × 160: lo que pase de ahí se arma con piezas
    const nL = Math.ceil(L / PLACA.L), nW = Math.ceil(W / PLACA.W), placas = nL * nW, uniones = (nL - 1) + (nW - 1);
    const m2 = Math.round(area(m) / 1000) / 10, peso = Math.round(m2 * 28.8);
    if (placas > 1) {
      sube(1, 'Pasa de una placa (320 × 160 cm): se arma con ' + placas + ' piezas y ' + (uniones === 1 ? 'una unión' : uniones + ' uniones') + '. La unión se pega y se pule a ras; se nota como una línea fina.');
      if (forma !== 'rect' && forma !== 'square') sube(2, 'Forma curva en varias piezas: el corte y la unión de las curvas son más delicados.');
    }
    if (L > 480 || W > 200) sube(2, 'Medida fuera de lo común: lleva base reforzada con apoyos intermedios, maniobra y flete especiales.');
    // una placa completa pesa ~147 kg: el peso solo complica cuando son varias piezas
    if (peso > 200) sube(2, 'La piedra pesa cerca de ' + peso + ' kg: se sube por piezas entre varias personas; revisamos puertas, escaleras y elevador.');
    const f = U.formas[forma], lim = limites(uso, forma, Math.min(L, f.L[1]));
    if (L < f.L[0]) sube(1, (red ? 'Chica' : 'Corta') + ' para ' + (uso === 'periquera' ? 'periquera' : U.nombre.toLowerCase()) + ': lo usual empieza en ' + f.L[0] + ' cm.');
    if (!red && W < lim.W[0]) sube(1, uso === 'comedor' ? 'Angosta: con menos de ' + lim.W[0] + ' cm los platos de enfrente quedan muy juntos.' : 'Angosta: lo usual empieza en ' + lim.W[0] + ' cm.');
    if (!red && L <= f.L[1] && W > lim.W[1] && W <= PLACA.W) sube(1, 'El ancho está muy cerca del largo: una forma cuadrada o redonda puede verse mejor.');
    if (forma === 'round' && L > 180 && uso === 'comedor') sube(1, 'Redonda de más de 180 cm: el centro queda lejos de todos los lugares.');
    if (Math.abs(H - U.H) > 4) sube(1, 'Altura de ' + H + ' cm: lo usual para ' + (uso === 'periquera' ? 'periquera' : U.nombre.toLowerCase()) + ' es ' + U.H + ' cm. La base se hace a tu altura.');
    return Object.assign({ nivel, pts, placas, nL, nW, uniones, m2, peso }, NIVELES[nivel]);
  }
  // espacio que conviene dejar libre alrededor (sillas y paso): 90 cm por lado en comedor, 75 en periquera, 45 en centro
  function espacio(m) {
    const k = m.uso === 'comedor' ? 90 : m.uso === 'periquera' ? 75 : 45;
    return { L: m.L + 2 * k, W: m.W + 2 * k, k };
  }

  const medida = m =>redonda(m.forma) ? (m.forma === 'round' ? 'Ø ' + m.L + ' cm' : m.L + ' × ' + m.L + ' cm') : m.L + ' × ' + m.W + ' cm';
  function titulo(m) {
    const mod = m.modelo && MODELOS.find(x => x.id === m.modelo);
    return (mod ? mod.nombre + ' · ' : '') + 'Mesa ' + (m.uso === 'periquera' ? 'periquera' : 'de ' + USOS[m.uso].nombre.toLowerCase()) + ' ' + FORMAS[m.forma].toLowerCase() + ' ' + medida(m);
  }
  function resumen(m) {
    const n = personas(m), v = viabilidad(m);
    return [['Uso', USOS[m.uso].nombre], ['Forma', FORMAS[m.forma]], ['Medidas', medida(m)], ['Altura', m.H + ' cm'],
      ['Piedra', piedra(m.piedra).nombre + (piedra(m.piedra).acabado ? ' · ' + piedra(m.piedra).acabado.toLowerCase() : '')], ['Base', BASES[m.base].nombre], ['Color de base', color(m.color).nombre]].concat(n ? [['Personas', n + ' personas']] : [])
      .concat([['Fabricación', v.t + (v.placas > 1 ? ' · ' + v.placas + ' piezas de placa' : '')]]);
  }

  // ---------- el cálculo del taller: MDF, base, cortes, piedra ----------
  function calcular(m0) {
    if (m0 && m0.estudio) return calcularEstudio(m0);
    const m = normalizar(m0), { uso, forma, L, W, H } = m, red = redonda(forma), avisos = [];
    // volado: de la orilla de la piedra a la orilla del MDF (la maestra 280 × 150 lleva 30 cm por lado)
    let vL, vW;
    if (uso === 'comedor') { vL = clamp(Math.round(L * 0.107), 15, 30); vW = clamp(Math.round(W * 0.2), 15, 30); }
    else if (uso === 'centro') { vL = clamp(Math.round(L * 0.1), 8, 15); vW = clamp(Math.round(W * 0.15), 8, 15); }
    else { vL = clamp(Math.round(L * 0.1), 10, 25); vW = clamp(Math.round(W * 0.2), 10, 15); }
    if (red) vL = vW = uso === 'comedor' ? clamp(Math.round(L * 0.2), 15, 30) : uso === 'centro' ? clamp(Math.round(L * 0.15), 8, 15) : clamp(Math.round(L * 0.2), 10, 20);
    const mdf = { L: L - 2 * vL, W: W - 2 * vW, forma: forma === 'ovcuad' ? 'ovcuad' : forma, r: forma === 'ovcuad' ? Math.max(0, radio(m) - Math.min(vL, vW)) : 0, esp: MDF_ESP };
    const Hb = r1(H - CUBIERTA);
    let base;
    if (m.base === 'ped') {
      const plato = uso === 'comedor' ? clamp(r5(L * 0.5), 45, 70) : uso === 'periquera' ? clamp(r5(L * 0.65), 45, 60) : clamp(r5(L * 0.5), 35, 50);
      const cruz = (forma === 'square' ? Math.round(mdf.L * 1.3) : mdf.L) - 10;
      base = { L: cruz, W: cruz, H: Hb, plato, columna: uso === 'comedor' ? 11.4 : 8.9 };
    } else if (forma === 'oval') base = { L: r5(mdf.L * 0.7), W: r5(mdf.W * 0.65), H: Hb };
    else if (forma === 'round') base = { L: r5(mdf.L * 0.65), W: r5(mdf.L * 0.65), H: Hb };
    else base = { L: mdf.L - 10, W: mdf.W - 10, H: Hb };
    const { cortes, metros } = cortesDe(m, base);
    // piedra
    const v = viabilidad(m), m2 = v.m2, aprov = Math.round(m2 / (PLACA.m2 * v.placas) * 100);
    const peso = v.peso; // 12 mm de piedra sinterizada ≈ 28.8 kg por m²
    // revisiones (las medidas ya vienen limitadas; esto explica lo que el taller debe cuidar)
    const libreLado = red ? null : (W - base.W) / 2, libreCab = red ? null : (L - base.L) / 2;
    if (uso === 'comedor' && libreLado !== null && libreLado < 20 && !['t', 'ped'].includes(m.base)) avisos.push('Quedan ' + r1(libreLado) + ' cm de la orilla a la base por los lados: las rodillas pueden pegar. Considera base T doble.');
    if (m.base === 'ped' && uso === 'comedor' && L >= 150) avisos.push('Pedestal con Ø ' + L + ': el plato de ' + base.plato + ' cm debe ir lastrado o atornillado para que no se ladee.');
    if (v.placas > 1) avisos.push('Lleva ' + v.placas + ' piezas de placa (' + v.nL + ' × ' + v.nW + '): planear dónde caen las uniones.');
    if (base.L > 300 && m.base !== 'ped') avisos.push('Base de más de 3 m: agregar apoyo o patas intermedias.');
    return { m, volado: { L: vL, W: vW }, mdf, base, cortes, metros, piedra: { L, W, esp: PLACA.esp, m2, aprov, peso, placas: v.placas },
      personas: personas(m), libre: { lado: libreLado, cabecera: libreCab }, avisos, radio: radio(m), viab: v };
  }

  // lista de cortes de la base (la usan el pedido y el Estudio)
  function cortesDe(m, base) {
    const s = 5, cortes = [];
    const c = (pieza, cant, med, mat) => cortes.push({ pieza, cant, med: r1(med), mat: mat || 'PTR 2" × 2" cal. 14' });
    const B = base, cent = B.L > 150 ? 1 : 0;
    if (m.base === 'patas') { c('Patas', 4, B.H - s); c('Largueros', 2, B.L); c('Travesaños', 2 + cent, B.W - 2 * s); }
    if (m.base === 'marco') { c('Postes del marco', 4, B.H - 2 * s); c('Travesaños del marco (arriba y abajo)', 4, B.W); c('Largueros', 2, B.L - 2 * s); if (cent) c('Travesaño central', 1, B.W - 2 * s); }
    if (m.base === 'trapecio') { const d = 12; c('Patas inclinadas', 4, Math.hypot(d, B.H - 2 * s)); c('Travesaños de arriba', 2, B.W - 2 * d); c('Travesaños al piso', 2, B.W); c('Largueros', 2, B.L - 2 * s); if (cent) c('Travesaño central', 1, B.W - 2 * d - 2 * s); }
    if (m.base === 'x') { c('Patas en X (diagonal)', 4, Math.hypot(B.W - s, B.H - s)); c('Travesaños de arriba', 2, B.W); c('Largueros', 2, B.L - 2 * s); if (cent) c('Travesaño central', 1, B.W - 2 * s); }
    if (m.base === 'zeta') { const a = r5(B.H * 0.4); B.z = a; c('Diagonales de la Z', 4, Math.hypot(a, B.H - 2 * s)); c('Pies de la Z (al piso)', 4, a); c('Travesaños (arriba y abajo)', 4, B.W - 2 * s); c('Largueros', 2, B.L); }
    if (m.base === 't') { c('Postes', 2, B.H - 2 * s, 'PTR 4" × 2" cal. 14'); c('Pies (al piso)', 2, B.W, 'PTR 4" × 2" cal. 14'); c('Travesaños de arriba', 2, B.W); c('Viga central', 1, B.L - 2 * s, 'PTR 4" × 2" cal. 14'); c('Largueros', 2, B.L); }
    if (m.base === 'ym') {
      // en cada extremo: dos brazos del bastidor bajan a un nudo, de ahí un poste al pie; una viga baja une los dos postes
      const y = ymMedidas(B);
      c('Largueros', 2, B.L); c('Travesaños (puntas y sobre la Y)', 4, B.W - 2 * s);
      c('Brazos de la Y (corte a inglete)', 4, y.brazo, 'PTR 4" × 2" cal. 14');
      c('Postes (del nudo al pie)', 2, y.nudo - y.pieH, 'PTR 4" × 4" cal. 14');
      c('Pies al piso', 2, 2 * y.fz, 'PTR 4" × 2" cal. 14 (acostado)');
      c('Viga baja', 1, 2 * y.xe - 10, 'PTR 3" × 2" cal. 14');
    }
    if ((BASES[m.base] && BASES[m.base].propia) || m.base === 'planta') {
      const P = piezas({ base: B, m }), pf = PERFILES[m.base === 'planta' ? (m.planta || {}).perfil : BASES[m.base].perfil] || PERFILES.ligero, grupos = {};
      P.barras.forEach(([a, b, w, h, , tag]) => {
        if (tag === 'aro') return;
        const len = r1(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), dz = Math.abs(b[2] - a[2]);
        const hor = Math.hypot(dx, dz), ang = Math.round(Math.atan2(dy, hor) * 180 / Math.PI);
        const tipo = dy < 0.5 ? (dz > dx ? 'Travesaños' : len >= B.L * 0.85 ? 'Largueros' : 'Horizontales') : hor < 0.5 ? 'Postes' : 'Diagonales a ' + ang + '° del piso';
        const mat = w === 5 && h === 5 ? 'PTR 2" × 2" cal. 14' : pf.mat, k = tipo + '|' + len + '|' + mat;
        grupos[k] = grupos[k] || { pieza: tipo, cant: 0, med: len, mat }; grupos[k].cant++;
      });
      Object.values(grupos).sort((a, b) => b.med - a.med).forEach(g => c(g.pieza, g.cant, g.med, g.mat));
    }
    if (m.base === 'ped') { c('Columna', 1, B.H - s - 1.3, 'Tubo ' + (B.columna > 10 ? '4 1/2"' : '3 1/2"') + ' cal. 12'); c('Plato al piso (Ø ' + B.plato + ')', 1, B.plato, 'Placa 1/2"'); c('Brazos de la cruz', 2, B.L); c('Placa de arriba', 1, 20, 'Placa 1/4" 20 × 20'); }
    if (m.base === 'planta' && m.planta) {
      (m.planta.aros || []).forEach(a => c('Aro rolado Ø ' + r1(2 * a.r) + ' cm (' + (a.nivel === 'piso' ? 'al piso' : 'arriba') + ')', 1, Math.PI * 2 * a.r, 'PTR 2" × 2" cal. 14 rolado'));
      if (m.planta.columna) { const pc = m.planta.columna; c('Columna', 1, B.H - 5 - 1.3, 'Tubo ' + (pc.d > 10 ? '4 1/2"' : '3 1/2"') + ' cal. 12'); c('Plato al piso (Ø ' + pc.plato + ')', 1, pc.plato, 'Placa 1/2"'); }
    }
    const metros = r1(cortes.filter(x => /^PTR/.test(x.mat)).reduce((a, x) => a + x.cant * x.med, 0) / 100);
    return { cortes, metros };
  }

  // la Y maestra: dónde va cada cosa (cm)
  function ymMedidas(B) {
    const s = 5, hz = B.W / 2, xe = B.L / 2 - 12, nudo = r5(B.H * 0.42), pieH = 6, fz = r1(hz * 0.95), yv = 16;
    return { s, xe, nudo, pieH, fz, yv, brazo: r1(Math.hypot(hz - s / 2 - 5, B.H - s / 2 - nudo)) };
  }

  // ---------- las piezas de la base (cm; x = largo, z = ancho, y = arriba): las usan el 3D y el croquis ----------
  function piezas(c) {
    const barras = [], pies = []; let ped = null;
    const B = c.base, s = 5, Hb = B.H, L = B.L, W = B.W, hx = L / 2, hz = W / 2, k = c.m.base;
    const bar = (p1, p2, w, h, lado) => barras.push([p1, p2, w || s, h || s, lado]);
    const pie = (x, z) => pies.push([x, z]);
    const rieles = (desde) => { [-1, 1].forEach(sz => bar([-hx + desde, Hb - s / 2, sz * (hz - s / 2)], [hx - desde, Hb - s / 2, sz * (hz - s / 2)])); };
    const cent = () => { if (L > 150) bar([0, Hb - s / 2, -hz + s], [0, Hb - s / 2, hz - s]); };
    if (k === 'patas') {
      [-1, 1].forEach(sx => [-1, 1].forEach(sz => { bar([sx * (hx - s / 2), 0.8, sz * (hz - s / 2)], [sx * (hx - s / 2), Hb - s, sz * (hz - s / 2)], s, s, [0, 0, 1]); pie(sx * (hx - s / 2), sz * (hz - s / 2)); }));
      rieles(0); [-1, 1].forEach(sx => bar([sx * (hx - s / 2), Hb - s / 2, -hz + s], [sx * (hx - s / 2), Hb - s / 2, hz - s])); cent();
    }
    if (k === 'marco') {
      [-1, 1].forEach(sx => { const x = sx * (hx - s / 2);
        [-1, 1].forEach(sz => bar([x, s, sz * (hz - s / 2)], [x, Hb - s, sz * (hz - s / 2)], s, s, [1, 0, 0]));
        bar([x, Hb - s / 2, -hz], [x, Hb - s / 2, hz]); bar([x, s / 2, -hz], [x, s / 2, hz]); });
      rieles(s); cent();
    }
    if (k === 'trapecio') {
      const d = 12, zt = hz - s / 2 - d, zb = hz - s / 2;
      [-1, 1].forEach(sx => { const x = sx * (hx - s / 2);
        [-1, 1].forEach(sz => bar([x, s, sz * zb], [x, Hb - s, sz * zt], s, s, [1, 0, 0]));
        bar([x, Hb - s / 2, -zt - s / 2], [x, Hb - s / 2, zt + s / 2]); bar([x, s / 2, -zb - s / 2], [x, s / 2, zb + s / 2]); pie(x, -zb); pie(x, zb); });
      [-1, 1].forEach(sz => bar([-hx + s, Hb - s / 2, sz * zt], [hx - s, Hb - s / 2, sz * zt]));
      if (L > 150) bar([0, Hb - s / 2, -zt + s / 2], [0, Hb - s / 2, zt - s / 2]);
    }
    if (k === 'x') {
      [-1, 1].forEach(sx => { const x = sx * (hx - s / 2);
        bar([x, 1.2, -hz + s / 2], [x, Hb - s, hz - s / 2], s, s, [1, 0, 0]); bar([x, 1.2, hz - s / 2], [x, Hb - s, -hz + s / 2], s, s, [1, 0, 0]);
        bar([x, Hb - s / 2, -hz], [x, Hb - s / 2, hz]); });
      rieles(s); cent();
    }
    if (k === 'zeta') {
      const a = B.z || 25;
      [-1, 1].forEach(sx => { const xo = sx * (hx - s / 2), xi = xo - sx * a;
        [-1, 1].forEach(sz => { const z = sz * (hz - s / 2);
          bar([xo, Hb - s, z], [xi, s, z], s, s, [0, 0, 1]); bar([xi - sx * s / 2, s / 2, z], [xo + sx * s / 2, s / 2, z], s, s, [0, 0, 1]); });
        bar([xo, Hb - s / 2, -hz + s], [xo, Hb - s / 2, hz - s]); bar([xo, s / 2, -hz + s], [xo, s / 2, hz - s]); });
      rieles(0);
    }
    if (k === 't') {
      const xe = hx - 12;
      [-1, 1].forEach(sx => { const x = sx * xe;
        bar([x, 2.5, -hz], [x, 2.5, hz], 10, 5, [1, 0, 0]); bar([x, 5, 0], [x, Hb - s, 0], 10, 5, [1, 0, 0]);
        bar([x, Hb - s / 2, -hz + s], [x, Hb - s / 2, hz - s]);
        [-1, 1].forEach(sz => pie(x + 0, sz * (hz - 4))); });
      bar([-xe, Hb - 18, 0], [xe, Hb - 18, 0], 5, 10, [0, 0, 1]);
      rieles(0); [-1, 1].forEach(sx => bar([sx * (hx - s / 2), Hb - s / 2, -hz + s], [sx * (hx - s / 2), Hb - s / 2, hz - s]));
    }
    if (k === 'ym') {
      const y = ymMedidas(B), xe = y.xe;
      rieles(0); [-1, 1].forEach(sx => bar([sx * (hx - s / 2), Hb - s / 2, -hz + s], [sx * (hx - s / 2), Hb - s / 2, hz - s]));
      [-1, 1].forEach(sx => { const x = sx * xe;
        bar([x, Hb - s / 2, -hz + s], [x, Hb - s / 2, hz - s]);                                   // travesaño sobre la Y
        bar([x, y.pieH / 2 + 0.8, -y.fz], [x, y.pieH / 2 + 0.8, y.fz], 10, y.pieH, [1, 0, 0]);    // pie al piso
        bar([x, y.pieH + 0.8, 0], [x, y.nudo + 3, 0], 10, 10, [1, 0, 0]);                          // poste
        [-1, 1].forEach(sz => {
          bar([x, Hb - s / 2, sz * (hz - s / 2 - 5)], [x, y.nudo, sz * 2.5], 10, 5, [1, 0, 0]);     // brazo de la Y
          pie(x, sz * (y.fz - 4));
        });
      });
      bar([-xe + 5, y.yv, 0], [xe - 5, y.yv, 0], 5, 7.6, [0, 0, 1]);                              // viga baja
    }
    if (BASES[k] && BASES[k].propia) {
      const pf = PERFILES[BASES[k].perfil], z0 = hz - s / 2, X = x => x * (hx - s / 2), Y = y => 0.8 + y * (Hb - s - 0.8);
      rieles(0); [-1, 1].forEach(sx => bar([sx * (hx - s / 2), Hb - s / 2, -hz + s], [sx * (hx - s / 2), Hb - s / 2, hz - s]));
      const piso = new Set();
      BASES[k].segs.forEach(([x1, y1, x2, y2]) => {
        [-1, 1].forEach(sz => bar([X(x1), Y(y1), sz * z0], [X(x2), Y(y2), sz * z0], pf.fondo, pf.alto, [0, 0, 1]));
        [[x1, y1], [x2, y2]].forEach(([x, y]) => { if (y < 0.03) piso.add(Math.round(X(x) * 10) / 10); });
      });
      // donde la base toca el piso: un travesaño de lado a lado y regatones
      piso.forEach(x => { bar([x, 0.8 + s / 2, -z0 + s / 2], [x, 0.8 + s / 2, z0 - s / 2]); [-1, 1].forEach(sz => pie(x, sz * z0)); });
    }
    // base diseñada vista desde arriba (Estudio): patas, barras arriba y al piso, aros y columna, en cm reales
    if (k === 'planta' && c.m.planta) {
      const pl = c.m.planta, pf = PERFILES[pl.perfil] || PERFILES.ligero, yA = Hb - s / 2, yP = 0.8 + s / 2;
      (pl.postes || []).forEach(([x, z]) => { bar([x, 0.8, z], [x, Hb - s, z], pf.fondo, pf.alto, [0, 0, 1]); pie(x, z); });
      (pl.arriba || []).forEach(([x1, z1, x2, z2]) => bar([x1, yA, z1], [x2, yA, z2]));
      (pl.piso || []).forEach(([x1, z1, x2, z2]) => { bar([x1, yP, z1], [x2, yP, z2]); pie(x1, z1); pie(x2, z2); });
      (pl.aros || []).forEach(a => { const n = 40, y = a.nivel === 'piso' ? yP : yA, p = i => [a.r * Math.cos(i / n * 2 * Math.PI), y, a.r * Math.sin(i / n * 2 * Math.PI)];
        for (let i = 0; i < n; i++) barras.push([p(i), p(i + 1), s, s, [0, 1, 0], 'aro']);
        if (a.nivel === 'piso') [0, 1, 2, 3].forEach(i => pie(a.r * Math.cos(i * Math.PI / 2 + Math.PI / 4), a.r * Math.sin(i * Math.PI / 2 + Math.PI / 4))); });
      if (pl.columna) {
        ped = { plato: pl.columna.plato, columna: pl.columna.d, H: Hb - s };
        if (!(pl.arriba || []).length && !(pl.aros || []).some(a => a.nivel !== 'piso')) { const ar = Math.max(15, Math.min(L, W) / 2 - 5); [0, Math.PI / 2].forEach(a => bar([-ar * Math.cos(a), yA, -ar * Math.sin(a)], [ar * Math.cos(a), yA, ar * Math.sin(a)])); }
      }
    }
    if (k === 'ped') {
      ped = { plato: B.plato, columna: B.columna, H: Hb - s };
      const ar = B.L / 2, gira = c.m.forma === 'square' ? Math.PI / 4 : 0;
      [0, Math.PI / 2].forEach(a => { const an = a + gira; bar([-ar * Math.cos(an), Hb - s / 2, -ar * Math.sin(an)], [ar * Math.cos(an), Hb - s / 2, ar * Math.sin(an)]); });
    }
    return { barras, pies, ped };
  }

  // ---------- Estudio de diseño (solo administración): piedra con cualquier forma y base hecha a mano ----------
  // contorno = puntos [x, z] en cm, centrado; x a lo largo, z a lo ancho
  const G = {
    area(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return a / 2; },
    perim(p) { let l = 0; for (let i = 0; i < p.length; i++) l += Math.hypot(p[(i + 1) % p.length][0] - p[i][0], p[(i + 1) % p.length][1] - p[i][1]); return l; },
    caja(p) { const xs = p.map(q => q[0]), zs = p.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs); return { x0, x1, z0, z1, w: x1 - x0, h: z1 - z0 }; },
    dentro(q, p) { let d = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > q[1]) !== (zj > q[1]) && q[0] < (xj - xi) * (q[1] - zi) / (zj - zi) + xi) d = !d; } return d; },
    dSeg(q, a, b) { const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1e-9, t = clamp(((q[0] - a[0]) * vx + (q[1] - a[1]) * vz) / l2, 0, 1); return Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vz); },
    dBorde(q, p) { let m = Infinity; for (let i = 0; i < p.length; i++) m = Math.min(m, G.dSeg(q, p[i], p[(i + 1) % p.length])); return m; },
    envolvente(pts) { // casco convexo
      const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
      const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
      p.forEach(q => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
      p.slice().reverse().forEach(q => { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
      return lo.slice(0, -1).concat(up.slice(0, -1));
    },
    // esquina redondeada en cada vértice (radio en cm)
    filete(p, rs) {
      const out = [];
      p.forEach((b, i) => {
        const a = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length], r = +(rs && rs[i]) || 0;
        const la = Math.hypot(a[0] - b[0], a[1] - b[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
        if (r <= 0.05 || !la || !lc) return out.push([b[0], b[1]]);
        const u1 = [(a[0] - b[0]) / la, (a[1] - b[1]) / la], u2 = [(c[0] - b[0]) / lc, (c[1] - b[1]) / lc];
        const th = Math.acos(clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1)); if (th > Math.PI - 0.01) return out.push([b[0], b[1]]);
        const t = Math.min(r / Math.tan(th / 2), la * 0.5, lc * 0.5), t1 = [b[0] + u1[0] * t, b[1] + u1[1] * t], t2 = [b[0] + u2[0] * t, b[1] + u2[1] * t];
        const n = 14; for (let k = 0; k <= n; k++) { const s = k / n, w = (1 - s) * (1 - s), v = 2 * s * (1 - s), y = s * s; out.push([w * t1[0] + v * b[0] + y * t2[0], w * t1[1] + v * b[1] + y * t2[1]]); }
      });
      return out;
    },
    // orilla curva que pasa por los puntos (Catmull-Rom cerrada)
    curva(p, n) {
      n = n || 16; const out = [];
      for (let i = 0; i < p.length; i++) {
        const p0 = p[(i - 1 + p.length) % p.length], p1 = p[i], p2 = p[(i + 1) % p.length], p3 = p[(i + 2) % p.length];
        for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t;
          out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); }
      }
      return out;
    },
    // el mismo contorno metido d cm hacia adentro (para el MDF)
    adentro(p, d) {
      const sg = G.area(p) > 0 ? 1 : -1, n = p.length, out = [];
      const nor = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l * sg, (b[0] - a[0]) / l * sg]; };
      for (let i = 0; i < n; i++) {
        const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], n1 = nor(a, b), n2 = nor(b, c);
        let m = [n1[0] + n2[0], n1[1] + n2[1]]; const ml = Math.hypot(m[0], m[1]);
        if (ml < 1e-6) { out.push([b[0] + n1[0] * d, b[1] + n1[1] * d]); continue; }
        m = [m[0] / ml, m[1] / ml]; const k = Math.min(3, 1 / Math.max(0.2, m[0] * n1[0] + m[1] * n1[1]));
        out.push([b[0] + m[0] * d * k, b[1] + m[1] * d * k]);
      }
      return out;
    },
  };
  function centroide(p) { let a = 0, x = 0, z = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length], k = x1 * z2 - x2 * z1; a += k; x += (x1 + x2) * k; z += (z1 + z2) * k; } return a ? [x / (3 * a), z / (3 * a)] : [0, 0]; }
  const VOLADO_EST = { comedor: 25, centro: 12, periquera: 15 };
  // el contorno de la piedra del Estudio (denso, listo para 3D, planos y revisiones)
  function contornoEstudio(m) {
    const L = +m.L, W = m.forma === 'round' || m.forma === 'square' ? +m.L : +m.W, a = L / 2, b = W / 2;
    if (m.forma === 'libre' && m.libre && m.libre.pts && m.libre.pts.length >= 3) {
      const p = m.libre.pts.map(q => [+q[0], +q[1]]);
      return m.libre.curva ? G.curva(p, 16) : G.filete(p, m.libre.radios);
    }
    if (m.forma === 'round' || m.forma === 'oval') { const n = 160, out = []; for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI; out.push([a * Math.cos(t), b * Math.sin(t)]); } return out; }
    const r = m.forma === 'ovcuad' ? (m.r != null && m.r !== '' ? +m.r : radio({ forma: 'ovcuad', W })) : +(m.r || 0), rr = clamp(r, 0, Math.min(a, b));
    return G.filete([[-a, -b], [a, -b], [a, b], [-a, b]], [rr, rr, rr, rr]);
  }
  // pasar la forma de siempre a puntos que se pueden mover a mano
  function aLibre(m) {
    const L = +m.L, W = m.forma === 'round' || m.forma === 'square' ? +m.L : +m.W, a = L / 2, b = W / 2;
    if (m.forma === 'round' || m.forma === 'oval') { const pts = []; for (let i = 0; i < 8; i++) { const t = i / 8 * 2 * Math.PI; pts.push([r1(a * Math.cos(t)), r1(b * Math.sin(t))]); } return { pts, radios: pts.map(() => 0), curva: true }; }
    const r = m.forma === 'ovcuad' ? (m.r != null && m.r !== '' ? +m.r : radio({ forma: 'ovcuad', W })) : +(m.r || 0);
    return { pts: [[-a, -b], [a, -b], [a, b], [-a, b]], radios: [r, r, r, r], curva: false };
  }
  function calcularEstudio(m0) {
    const m = Object.assign({}, m0), uso = USOS[m.uso] ? m.uso : 'comedor', U = USOS[uso];
    m.uso = uso; m.H = clamp(Math.round(+m.H || U.H), ...ABS.H); m.piedra = piedra(m.piedra).id; m.color = color(m.color).id;
    if (m.forma === 'round' || m.forma === 'square') m.W = m.L;
    const ct = contornoEstudio(m), bb = G.caja(ct);
    m.L = r1(bb.w); m.W = r1(bb.h);
    const Hb = r1(m.H - CUBIERTA), chico = Math.min(m.L, m.W);
    const fijo = m.volado != null && m.volado !== '', red = m.forma === 'round' || m.forma === 'square';
    let vL, vW;
    if (fijo || m.forma === 'libre') vL = vW = fijo ? +m.volado : VOLADO_EST[uso];
    else if (uso === 'comedor') { vL = red ? clamp(Math.round(m.L * 0.2), 15, 30) : clamp(Math.round(m.L * 0.107), 15, 30); vW = red ? vL : clamp(Math.round(m.W * 0.2), 15, 30); }
    else if (uso === 'centro') { vL = clamp(Math.round(m.L * 0.1), 8, 15); vW = red ? vL : clamp(Math.round(m.W * 0.15), 8, 15); }
    else { vL = clamp(Math.round(m.L * 0.1), 10, 25); vW = red ? vL : clamp(Math.round(m.W * 0.2), 10, 15); }
    vL = clamp(vL, 0, Math.max(0, m.L / 2 - 10)); vW = clamp(vW, 0, Math.max(0, m.W / 2 - 10)); const vol = Math.min(vL, vW);
    const rBase = m.forma === 'ovcuad' ? (m.r != null && m.r !== '' ? +m.r : radio({ forma: 'ovcuad', W: m.W })) : +(m.r || 0);
    const mct = m.forma === 'libre' ? G.adentro(ct, vol) : contornoEstudio(Object.assign({}, m, { L: m.L - 2 * vL, W: m.W - 2 * vW, r: Math.max(0, rBase - vol) }));
    const mb = G.caja(mct);
    const mdf = { forma: 'libre', contorno: mct, L: r1(mb.w), W: r1(mb.h), r: 0, esp: MDF_ESP, volado: vol, vL: r1(vL), vW: r1(vW) };
    // la base
    if (m.base === 'frente' && m.frente && m.frente.segs) { registrarBase('zz-estudio', { nombre: m.frente.nombre || 'Dibujada de frente', segs: m.frente.segs, perfil: m.frente.perfil, cli: true }); m.base = 'zz-estudio'; }
    if (!BASES[m.base] && m.base !== 'planta') m.base = 'patas';
    let B;
    if (m.base === 'ped') {
      const plato = uso === 'comedor' ? clamp(r5(m.L * 0.5), 45, 70) : uso === 'periquera' ? clamp(r5(m.L * 0.65), 45, 60) : clamp(r5(m.L * 0.5), 35, 50);
      const cruz = Math.round(Math.min(mb.w, mb.h) * (m.forma === 'square' ? 1.3 : 1)) - 10;
      B = { L: cruz, W: cruz, H: Hb, plato, columna: uso === 'comedor' ? 11.4 : 8.9 };
    } else if (m.base === 'planta') B = { L: r1(mb.w), W: r1(mb.h), H: Hb };
    else {
      const curva = m.forma === 'oval' || m.forma === 'round';
      let aL = curva ? r5(mb.w * 0.7) : r1(mb.w - 10), aW = curva ? r5(mb.h * 0.65) : r1(mb.h - 10);
      if (m.forma === 'libre') { const cabe = (l, w) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].every(([i, j]) => G.dentro([i * l / 2, j * w / 2], mct) && G.dBorde([i * l / 2, j * w / 2], mct) >= 2);
        for (let k = 0; k < 60 && !cabe(aL, aW); k++) { aL *= 0.97; aW *= 0.97; } aL = r1(aL); aW = r1(aW); }
      B = { L: +m.baseL > 20 ? +m.baseL : aL, W: +m.baseW > 20 ? +m.baseW : aW, H: Hb, auto: { L: aL, W: aW } };
    }
    const { cortes, metros } = cortesDe(m, B);
    const P = piezas({ base: B, m });
    // piedra: cuántas placas de 320 × 160 (se acuesta como convenga)
    const n1 = [Math.ceil(m.L / PLACA.L), Math.ceil(m.W / PLACA.W)], n2 = [Math.ceil(m.L / PLACA.W), Math.ceil(m.W / PLACA.L)];
    const rot = n1[0] * n1[1] > n2[0] * n2[1], [nL, nW] = rot ? n2 : n1, placas = nL * nW, uniones = (nL - 1) + (nW - 1);
    const a2 = Math.abs(G.area(ct)), m2 = Math.round(a2 / 100) / 100, peso = Math.round(m2 * 28.8), per = G.perim(ct);
    const aprov = Math.round(a2 / (PLACA.L * PLACA.W * placas) * 100);
    // ---- revisiones: que la base y la piedra tengan lógica ----
    const rev = [], ok = t => rev.push({ n: 0, t }), av = t => rev.push({ n: 1, t }), mal = t => rev.push({ n: 2, t });
    const arriba = [], piso = [], piernas = [];
    P.barras.forEach(([a, b]) => {
      [a, b].forEach(q => { if (q[1] >= Hb - 8) arriba.push([q[0], q[2]]); if (q[1] <= 8) piso.push([q[0], q[2]]); });
      const yMin = Math.min(a[1], b[1]), yMax = Math.max(a[1], b[1]);
      if (yMax > 15 && yMin < Hb - 10) piernas.push([[a[0], a[2]], [b[0], b[2]]]);
    });
    P.pies.forEach(([x, z]) => piso.push([x, z]));
    if (P.ped) { for (let i = 0; i < 24; i++) { const t = i / 24 * 2 * Math.PI; piso.push([P.ped.plato / 2 * Math.cos(t), P.ped.plato / 2 * Math.sin(t)]); } arriba.push([0, 0]); piernas.push([[0, 0], [0, 0.01]]); }
    if (!P.barras.length && !P.ped) mal('La base está vacía: agrega patas o escoge una base.');
    // 1) la base debajo de la piedra
    const fuera = arriba.filter(q => !G.dentro(q, ct) || G.dBorde(q, ct) < 3);
    if (fuera.length) mal('La base se sale de la piedra (' + fuera.length + ' punto' + (fuera.length > 1 ? 's' : '') + ', p. ej. en x ' + r1(fuera[0][0]) + ', z ' + r1(fuera[0][1]) + '). Hazla más chica o agranda la piedra.');
    else if (arriba.some(q => !G.dentro(q, mct))) av('La base pasa por fuera del MDF: baja el volado del MDF o mete la base.');
    else if (arriba.length) ok('La base queda completa debajo de la piedra.');
    // 2) apoyo en el piso: que no se voltee
    const casco = G.envolvente(piso);
    let volReal = null;
    if (casco.length < 3 || Math.abs(G.area(casco)) < 100) { if (P.barras.length || P.ped) mal('La base casi no se apoya en el piso: necesita patas o pies separados para no voltearse.'); }
    else {
      // ¿se voltea si alguien se recarga en la orilla? (40 kg en el punto más salido, contra el peso de la piedra y la base)
      const sg = G.area(casco) > 0 ? 1 : -1, cen = centroide(ct), FZ = 40;
      const kgBase = metros * 2.86 + (P.ped ? Math.PI * (P.ped.plato / 2) ** 2 * 1.27 * 7.85 / 1000 + P.ped.H * 0.2 : 0);
      const kgPiedra = Math.abs(G.area(ct)) / 1e4 * 28.8;
      volReal = 0; let aguanta = Infinity;
      for (let i = 0; i < casco.length; i++) {
        const a = casco[i], b = casco[(i + 1) % casco.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const fuera = q => -sg * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / l;
        let pal = 0; ct.forEach(q => { pal = Math.max(pal, fuera(q)); }); volReal = Math.max(volReal, pal);
        const est = kgPiedra * -fuera(cen) + kgBase * -fuera([0, 0]);
        if (pal > 0.5) aguanta = Math.min(aguanta, est / pal);
      }
      volReal = r1(volReal); aguanta = Math.round(aguanta);
      if (!G.dentro(cen, casco)) mal('El centro de la piedra no cae sobre la base: se voltea sola.');
      else if (aguanta < FZ) mal('Se voltea si alguien se recarga en la orilla: la piedra sobresale ' + volReal + ' cm de donde la base pisa y solo aguanta ' + Math.max(0, aguanta) + ' kg. Abre la base, agrega patas o un plato más grande.');
      else if (aguanta < FZ * 1.5) av('Aguanta ' + aguanta + ' kg recargados en la orilla más salida (sobresale ' + volReal + ' cm de donde pisa): poco margen. Conviene abrir la base o lastrarla.');
      else ok('Firme: sobresale máximo ' + volReal + ' cm de donde la base pisa' + (aguanta < 999 ? ' y aguanta ' + aguanta + ' kg recargados en la orilla.' : '.'));
    }
    // 3) el MDF apoyado arriba
    if (arriba.length) {
      const sop = []; P.barras.forEach(([a, b]) => { if (a[1] >= Hb - 8 && b[1] >= Hb - 8) sop.push([[a[0], a[2]], [b[0], b[2]]]); });
      let claro = 0; mct.forEach(q => { let d = Infinity; sop.forEach(([a, b]) => { d = Math.min(d, G.dSeg(q, a, b)); }); arriba.forEach(p => { d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1])); }); claro = Math.max(claro, d); });
      claro = r1(claro);
      if (claro > 60) av('El MDF queda ' + claro + ' cm sin nada abajo: agrega un travesaño o un aro arriba.');
    }
    // 4) rodillas
    if (uso !== 'centro' && piernas.length) {
      let rod = Infinity; ct.forEach(q => piernas.forEach(([a, b]) => { rod = Math.min(rod, G.dSeg(q, a, b)); })); rod = r1(rod);
      if (rod < 15) av('Solo quedan ' + rod + ' cm de la orilla a una pata: ahí se pegan las rodillas.'); else ok('Espacio para piernas: mínimo ' + rod + ' cm de la orilla a la base.');
    }
    // 5) piedra
    if (placas > 1) av('La piedra pasa de una placa (320 × 160): se arma con ' + placas + ' piezas y ' + uniones + (uniones === 1 ? ' unión.' : ' uniones.'));
    else ok('Sale de una sola placa de 320 × 160 · aprovechas ' + aprov + '% de la placa.');
    if (m.forma === 'libre' && m.libre && !m.libre.curva) {
      const p = m.libre.pts, sg = G.area(p) > 0 ? 1 : -1;
      const hund = p.filter((b, i) => { const a = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length]; return sg * ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 0 && !(+(m.libre.radios || [])[i] >= 1); }).length;
      if (hund) av(hund + ' esquina' + (hund > 1 ? 's' : '') + ' hacia adentro sin radio: la piedra se puede romper ahí; ponles radio de 1 cm o más.');
    }
    if (chico < 30) mal('La piedra es muy angosta (' + chico + ' cm).');
    if (Math.abs(m.H - U.H) > 4) av('Altura de ' + m.H + ' cm: lo usual para ' + U.nombre.toLowerCase() + ' es ' + U.H + ' cm.');
    if (peso > 200) av('La piedra pesa cerca de ' + peso + ' kg: se sube por piezas.');
    const personasN = uso === 'centro' ? 0 : m.forma === 'libre' ? Math.floor(per / POR_PERSONA) : personas({ uso, forma: m.forma, L: m.L, W: m.W });
    // volados de la caja de la piedra a la caja de la base (frente, atrás, cabeceras)
    const bxs = arriba.concat(piso), bc = bxs.length ? G.caja(bxs) : null;
    const volados = bc ? { izq: r1(bc.x0 - bb.x0), der: r1(bb.x1 - bc.x1), atras: r1(bc.z0 - bb.z0), frente: r1(bb.z1 - bc.z1), baseL: r1(bc.w), baseW: r1(bc.h) } : null;
    const nivel = rev.some(r => r.n === 2) ? 2 : rev.some(r => r.n === 1) ? 1 : 0;
    return { m, estudio: true, contorno: ct, mdf, base: B, cortes, metros, P, volados, volReal,
      piedra: { L: m.L, W: m.W, esp: PLACA.esp, m2, aprov, peso, placas, perim: Math.round(per) / 100 },
      personas: personasN, rev, nivel, avisos: rev.filter(r => r.n).map(r => r.t), radio: 0, libre: { lado: null, cabecera: null },
      viab: { placas, nL, nW, rot, uniones, m2, peso, nivel: Math.min(nivel, 2) } };
  }

  // ---------- precios: lo que cuesta, lo que pactamos y cuánto ganamos ----------
  const COSTOS = [['piedra', 'Piedra (placa)'], ['base', 'Base (herrería)'], ['mdf', 'MDF'], ['mano', 'Corte y mano de obra'], ['flete', 'Flete'], ['otros', 'Otros']];
  const CFG = { aprox: 8000, minimo: 30 };
  // costo por mesa: si ya escribiste costos reales se usan; si no, el aproximado (8,000 con flete y base)
  function costear(lin, cfg) {
    cfg = Object.assign({}, CFG, cfg || {}); lin = lin || {};
    const def = cfg.costos || {};
    const val = k => lin[k] !== undefined && lin[k] !== '' && lin[k] !== null ? +lin[k] : def[k] !== undefined && def[k] !== '' ? +def[k] : null;
    const llenos = COSTOS.filter(([k]) => val(k) !== null && !isNaN(val(k)));
    const real = llenos.reduce((a, [k]) => a + val(k), 0);
    const aprox = lin.aprox !== undefined && lin.aprox !== '' ? +lin.aprox : +cfg.aprox;
    const usaReal = llenos.length > 0;
    return { real, aprox, costo: usaReal ? real : aprox, usaReal, faltan: COSTOS.filter(([k]) => k !== 'otros' && (val(k) === null || isNaN(val(k)))).map(x => x[1]), val };
  }
  // ganancia sobre lo que nos cuesta: (precio − costo) / costo
  function ganancia(precio, costo, minimo) {
    minimo = minimo == null ? CFG.minimo : minimo;
    if (!precio || !costo) return { pesos: 0, pct: null, ok: false };
    const pct = Math.round((precio - costo) / costo * 1000) / 10;
    return { pesos: precio - costo, pct, ok: pct >= minimo };
  }
  const sugerido = (costo, pct) => Math.ceil(costo * (1 + (pct == null ? CFG.minimo : pct) / 100) / 100) * 100;

  const DKAS = { PLACA, POR_PERSONA, CUBIERTA, PIEDRAS, RUGOSIDAD, FORMAS, FORMA_DESC, BASES, USOS, USO_DESC, MODELOS, COSTOS, CFG,
    piedra, radio, formasDe, limites, anchoPara, personas, perimetro, tamanoPara, opcionesPersonas, basesPara, normalizar,
    medida, titulo, resumen, calcular, COLORES, color, viabilidad, espacio, area, NIVELES, ABS, piezas, costear, ganancia, sugerido, redonda, registrarBase, quitarBase, PERFILES, propias, G, contornoEstudio, aLibre, calcularEstudio, cortesDe, VOLADO_EST };
  if (typeof module !== 'undefined') module.exports = DKAS; else root.DKAS = DKAS;
})(typeof window !== 'undefined' ? window : globalThis);

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

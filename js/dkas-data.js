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
    x: { nombre: 'X', desc: 'Dos patas cruzadas en X en cada extremo.' },
    zeta: { nombre: 'Z', desc: 'Una Z de PTR en cada esquina: ligera y moderna.' },
    t: { nombre: 'T doble', desc: 'Un poste con pie en cada extremo y viga central. Deja libres los lados.' },
    ym: { nombre: 'Y maestra', desc: 'Una Y de PTR en cada extremo sobre un pie al piso, unidas por una viga baja. Nuestra insignia.' },
    ped: { nombre: 'Pedestal', desc: 'Una columna al centro con plato al piso y cruz arriba.' },
  };

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
    BASES[id] = { nombre: String(b.nombre || 'Base nueva').slice(0, 40), desc: String(b.desc || 'Diseño DKAS hecho en el taller.').slice(0, 140), segs: b.segs.map(q => q.map(Number)), perfil: PERFILES[b.perfil] ? b.perfil : 'ligero', foto: b.foto || null, propia: true };
    if (!propias.includes(id)) propias.push(id);
  }
  function quitarBase(id) { const i = propias.indexOf(id); if (i >= 0) propias.splice(i, 1); delete BASES[id]; }

  // qué bases sí funcionan para esa mesa
  function basesPara(m) {
    const extra = ['rect', 'ovcuad', 'oval'].includes(m.forma) ? propias.slice() : [];
    return basesNuestras(m).concat(extra);
  }
  function basesNuestras(m) {
    const { uso, forma, L, W } = m;
    if (uso === 'comedor') {
      if (forma === 'round') return L >= 110 ? ['ped', 'patas'] : ['ped'];
      if (forma === 'square') return L <= 130 ? ['patas', 'ped'] : ['patas'];
      if (forma === 'oval') return ['t', 'x', 'patas'];
      return ['patas', 'marco', 'x', 'zeta', 't'].concat(L >= 220 && W >= 100 ? ['ym'] : []);
    }
    if (uso === 'centro') {
      if (forma === 'round') return L >= 80 ? ['ped', 'patas'] : ['ped'];
      if (forma === 'square') return ['patas', 'ped'];
      if (forma === 'oval') return ['patas', 'x'];
      return ['patas', 'marco', 'x'];
    }
    if (redonda(forma)) return ['ped'];
    return ['patas', 'marco', 't'];
  }

  // deja la mesa dentro de lo que se puede hacer
  function normalizar(m) {
    const uso = USOS[m.uso] ? m.uso : 'comedor';
    const forma = USOS[uso].formas[m.forma] ? m.forma : formasDe(uso)[0];
    const f = USOS[uso].formas[forma];
    let L = clamp(Math.round(+m.L || f.L[0]), f.L[0], f.L[1]);
    let W = redonda(forma) ? L : clamp(Math.round(+m.W || anchoPara(uso, forma, L)), ...limites(uso, forma, L).W);
    const out = { uso, forma, L, W, H: USOS[uso].H, piedra: piedra(m.piedra).id };
    const bs = basesPara(out);
    out.base = bs.includes(m.base) ? m.base : bs[0];
    if (m.modelo && MODELOS.some(x => x.id === m.modelo && x.uso === uso && x.forma === forma && x.L === L && x.W === W && x.base === out.base)) out.modelo = m.modelo;
    return out;
  }

  const medida = m => redonda(m.forma) ? (m.forma === 'round' ? 'Ø ' + m.L + ' cm' : m.L + ' × ' + m.L + ' cm') : m.L + ' × ' + m.W + ' cm';
  function titulo(m) {
    const mod = m.modelo && MODELOS.find(x => x.id === m.modelo);
    return (mod ? mod.nombre + ' · ' : '') + 'Mesa ' + (m.uso === 'periquera' ? 'periquera' : 'de ' + USOS[m.uso].nombre.toLowerCase()) + ' ' + FORMAS[m.forma].toLowerCase() + ' ' + medida(m);
  }
  function resumen(m) {
    const n = personas(m);
    return [['Uso', USOS[m.uso].nombre], ['Forma', FORMAS[m.forma]], ['Medidas', medida(m)], ['Altura', m.H + ' cm'],
      ['Piedra', piedra(m.piedra).nombre + (piedra(m.piedra).acabado ? ' · ' + piedra(m.piedra).acabado.toLowerCase() : '')], ['Base', BASES[m.base].nombre]].concat(n ? [['Personas', n + ' personas']] : []);
  }

  // ---------- el cálculo del taller: MDF, base, cortes, piedra ----------
  function calcular(m0) {
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
    const s = 5, cortes = [];
    const c = (pieza, cant, med, mat) => cortes.push({ pieza, cant, med: r1(med), mat: mat || 'PTR 2" × 2" cal. 14' });
    const B = base, cent = B.L > 150 ? 1 : 0;
    if (m.base === 'patas') { c('Patas', 4, B.H - s); c('Largueros', 2, B.L); c('Travesaños', 2 + cent, B.W - 2 * s); }
    if (m.base === 'marco') { c('Postes del marco', 4, B.H - 2 * s); c('Travesaños del marco (arriba y abajo)', 4, B.W); c('Largueros', 2, B.L - 2 * s); if (cent) c('Travesaño central', 1, B.W - 2 * s); }
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
    if (BASES[m.base] && BASES[m.base].propia) {
      const P = piezas({ base: B, m }), pf = PERFILES[BASES[m.base].perfil], grupos = {};
      P.barras.forEach(([a, b, w, h]) => {
        const len = r1(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), dz = Math.abs(b[2] - a[2]);
        const tipo = dy < 0.5 ? (dz > dx ? 'Travesaños' : len >= B.L * 0.85 ? 'Largueros' : 'Horizontales') : dx < 0.5 && dz < 0.5 ? 'Postes' : 'Diagonales';
        const mat = w === 5 && h === 5 ? 'PTR 2" × 2" cal. 14' : pf.mat, k = tipo + '|' + len + '|' + mat;
        grupos[k] = grupos[k] || { pieza: tipo, cant: 0, med: len, mat }; grupos[k].cant++;
      });
      Object.values(grupos).sort((a, b) => b.med - a.med).forEach(g => c(g.pieza, g.cant, g.med, g.mat));
    }
    if (m.base === 'ped') { c('Columna', 1, B.H - s - 1.3, 'Tubo ' + (B.columna > 10 ? '4 1/2"' : '3 1/2"') + ' cal. 12'); c('Plato al piso (Ø ' + B.plato + ')', 1, B.plato, 'Placa 1/2"'); c('Brazos de la cruz', 2, B.L); c('Placa de arriba', 1, 20, 'Placa 1/4" 20 × 20'); }
    const metros = r1(cortes.filter(x => /^PTR/.test(x.mat)).reduce((a, x) => a + x.cant * x.med, 0) / 100);
    // piedra
    const area = forma === 'round' ? Math.PI * L * L / 4 : forma === 'oval' ? Math.PI * L * W / 4 : forma === 'ovcuad' ? L * W - (4 - Math.PI) * radio(m) ** 2 : L * W;
    const m2 = Math.round(area / 1000) / 10, aprov = Math.round(m2 / PLACA.m2 * 100);
    const peso = Math.round(m2 * 28.8); // 12 mm de piedra sinterizada ≈ 28.8 kg por m²
    // revisiones (las medidas ya vienen limitadas; esto explica lo que el taller debe cuidar)
    const libreLado = red ? null : (W - base.W) / 2, libreCab = red ? null : (L - base.L) / 2;
    if (uso === 'comedor' && libreLado !== null && libreLado < 20 && !['t', 'ped'].includes(m.base)) avisos.push('Quedan ' + r1(libreLado) + ' cm de la orilla a la base por los lados: las rodillas pueden pegar. Considera base T doble.');
    if (m.base === 'ped' && uso === 'comedor' && L >= 150) avisos.push('Pedestal con Ø ' + L + ': el plato de ' + base.plato + ' cm debe ir lastrado o atornillado para que no se ladee.');
    if (L > PLACA.L || W > PLACA.W) avisos.push('No cabe en una placa de 320 × 160.');
    return { m, volado: { L: vL, W: vW }, mdf, base, cortes, metros, piedra: { L, W, esp: PLACA.esp, m2, aprov, peso, placas: 1 },
      personas: personas(m), libre: { lado: libreLado, cabecera: libreCab }, avisos, radio: radio(m) };
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
    if (k === 'ped') {
      ped = { plato: B.plato, columna: B.columna, H: Hb - s };
      const ar = B.L / 2, gira = c.m.forma === 'square' ? Math.PI / 4 : 0;
      [0, Math.PI / 2].forEach(a => { const an = a + gira; bar([-ar * Math.cos(an), Hb - s / 2, -ar * Math.sin(an)], [ar * Math.cos(an), Hb - s / 2, ar * Math.sin(an)]); });
    }
    return { barras, pies, ped };
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
    medida, titulo, resumen, calcular, piezas, costear, ganancia, sugerido, redonda, registrarBase, quitarBase, PERFILES, propias };
  if (typeof module !== 'undefined') module.exports = DKAS; else root.DKAS = DKAS;
})(typeof window !== 'undefined' ? window : globalThis);

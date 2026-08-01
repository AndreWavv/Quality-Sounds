// ===== Beats Galaxy =====
// Overview mode is unchanged: all genre suns visible, free drag/orbit,
// scroll to zoom, click a sun or its pill to focus a genre.
//
// Focusing a genre no longer locks the camera into a fixed "tunnel" —
// that was the wrong shape for what was actually asked for. Instead:
// every OTHER genre hides, and this genre's beats appear as real 3D
// planets (textured, lit spheres — not flat DOM cards) arranged around
// the sun at diagonal offsets (upper/lower/middle, left/right). The
// camera and controls behave EXACTLY like overview mode the whole time
// — same free drag-to-orbit, same damped scroll-to-zoom, no separate
// system — because that consistency was the actual point being made:
// browsing one genre should feel like browsing all of them, just
// focused and decluttered.
//
// Planets use a real lit material (MeshStandardMaterial) with a shared
// moon texture (from the same public three.js example assets used in
// an uploaded reference component) tinted per genre, which needs actual
// scene lighting to render — added below. Clicking a planet raycasts
// exactly like clicking a sun already did.
//
// Note on scale: with 12 beats total (2 per genre) it's fine for every
// planet to exist as a real mesh all the time, just hidden via group
// visibility. At hundreds of beats per genre, the 6 diagonal slots
// below would need to become a proper pool (cycle which beat occupies
// which slot, similar in spirit to how the previous attempt pooled DOM
// cards) rather than literally one mesh per beat — flagged here for
// whenever that's the next problem to solve, not solved yet.
//
// Reuses the exact star-shader pattern proven working in nebula-bg.js:
// vertexColors:true (Three.js auto-injects the `color` attribute — do NOT
// declare it again, that caused a real compile failure earlier in this
// project) and correctly-ordered smoothstep (backwards edges are
// undefined behavior in GLSL and silently broke rendering earlier too).
(function () {
  if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') return;

  const container = document.getElementById('galaxy-viewport');
  const flashEl = document.getElementById('galaxy-flash');
  if (!container) return;

  const GENRES = [
    { id: 'trap', name: 'Trap', color: 0xff6b6b, pos: [-34, 8, -10] },
    { id: 'rnb', name: 'R&B', color: 0x9d5cff, pos: [32, -6, -20] },
    { id: 'indie-pop', name: 'Indie Pop', color: 0x6bffb8, pos: [-10, -20, 24] },
    { id: '2000s-swag', name: "2000's Swag", color: 0xffe66b, pos: [22, 22, 16] },
    { id: 'cinematic', name: 'Cinematic', color: 0x6b9bff, pos: [2, 2, -38] },
    { id: 'house', name: 'House', color: 0xff6bd6, pos: [-24, -24, -16] },
  ];

  // Demo beats — 2 per genre. Admin-uploaded beats (via admin.html) are
  // layered in asynchronously further down, once their audio is resolved.
  const BEATS = [
    { genre: 'trap', title: 'Track Title One', meta: '140 BPM · F Minor', licenses: { mp3: 35, trackout: 80, exclusive: null } },
    { genre: 'trap', title: 'Track Title Seven', meta: '128 BPM · G Minor', licenses: { mp3: 30, trackout: 70, exclusive: null } },
    { genre: 'rnb', title: 'Track Title Two', meta: '92 BPM · C# Minor', licenses: { mp3: 30, trackout: 75, exclusive: null } },
    { genre: 'rnb', title: 'Track Title Eight', meta: '85 BPM · E Minor', licenses: { mp3: 32, trackout: 78, exclusive: null } },
    { genre: 'indie-pop', title: 'Track Title Three', meta: '102 BPM · G Major', licenses: { mp3: 25, trackout: 65, exclusive: null } },
    { genre: 'indie-pop', title: 'Track Title Nine', meta: '110 BPM · D Major', licenses: { mp3: 28, trackout: 68, exclusive: null } },
    { genre: '2000s-swag', title: 'Track Title Four', meta: '98 BPM · D Minor', licenses: { mp3: 30, trackout: 72, exclusive: null } },
    { genre: '2000s-swag', title: 'Track Title Ten', meta: '95 BPM · A Minor', licenses: { mp3: 30, trackout: 72, exclusive: null } },
    { genre: 'cinematic', title: 'Track Title Five', meta: '70 BPM · A Minor', licenses: { mp3: 45, trackout: 95, exclusive: null } },
    { genre: 'cinematic', title: 'Track Title Eleven', meta: '65 BPM · F Minor', licenses: { mp3: 48, trackout: 98, exclusive: null } },
    { genre: 'house', title: 'Track Title Six', meta: '124 BPM · A Minor', licenses: { mp3: 30, trackout: 70, exclusive: null } },
    { genre: 'house', title: 'Track Title Twelve', meta: '126 BPM · C Minor', licenses: { mp3: 32, trackout: 72, exclusive: null } },
  ];

  let width = container.clientWidth || 800;
  let height = container.clientHeight || 620;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
  camera.position.set(0, 40, 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x030307, 1);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // Real lighting — needed for the planets' lit material to render with
  // actual shading instead of flat black. Suns/stars use unlit materials
  // and are unaffected by this either way.
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.3);
  sunLight.position.set(60, 90, 60);
  scene.add(sunLight);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 160;
  controls.target.set(0, 0, 0);

  // Custom damped zoom (OrbitControls' own wheel-zoom applies each tick
  // instantly with no glide, unlike its drag damping) — this is the ONE
  // scroll system, used identically whether in overview or focused on a
  // genre. No separate "tunnel scroll."
  controls.enableZoom = false;
  let zoomVelocity = 0;
  const ZOOM_FRICTION = 0.90;

  let engaged = false;
  const engageHint = document.getElementById('galaxy-engage-hint');
  function engage() {
    if (engaged) return;
    engaged = true;
    if (engageHint) engageHint.classList.add('hidden');
  }
  renderer.domElement.addEventListener('pointerdown', engage, { once: true });

  renderer.domElement.addEventListener('wheel', (e) => {
    if (!engaged) return;
    e.preventDefault();
    zoomVelocity += e.deltaY * 0.05;
  }, { passive: false });

  // ---- Two-part star shader: tiny hard bright core + softer glow ----
  const starMaterials = [];
  function starMaterial() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aSize;
        attribute float aTwinkle;
        uniform float uTime;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vColor = color;
          vTwinkle = 0.7 + 0.3 * sin(uTime * 1.6 + aTwinkle);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (280.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          if (d > 1.0) discard;
          float hardCore = 1.0 - smoothstep(0.0, 0.18, d);
          float softGlow = 1.0 - smoothstep(0.18, 1.0, d);
          float alpha = clamp(hardCore + softGlow * 0.55, 0.0, 1.0) * vTwinkle;
          gl_FragColor = vec4(vColor * vTwinkle * (1.0 + hardCore * 1.6), alpha);
        }
      `,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    starMaterials.push(mat);
    return mat;
  }

  function buildStarGeometry(count, positions, colors, sizes) {
    const twinkles = new Float32Array(count);
    for (let i = 0; i < count; i++) twinkles[i] = Math.random() * Math.PI * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));
    return geo;
  }

  const fieldStars = (function addFieldStars() {
    const count = 1600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 300;
      positions[i3 + 1] = (Math.random() - 0.5) * 300;
      positions[i3 + 2] = (Math.random() - 0.5) * 300;
      c.setHSL(0.6, Math.random() * 0.2, 0.75 + Math.random() * 0.2);
      colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      sizes[i] = 0.5 + Math.random() * 0.6;
    }
    const points = new THREE.Points(buildStarGeometry(count, positions, colors, sizes), starMaterial());
    scene.add(points);
    return points;
  })();

  // Shared planet texture — loaded once, reused (with per-genre color
  // tint via each material's own `color`) across every planet mesh.
  // Same public three.js example asset an uploaded reference component
  // used for its moon.
  const textureLoader = new THREE.TextureLoader();
  textureLoader.crossOrigin = 'anonymous';
  const planetTexture = textureLoader.load(
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg'
  );

  const genreGroups = {};
  const sunMeshes = [];
  const rotatingClusters = [];
  const pulsingHalos = [];
  const planetMeshes = []; // for raycasting clicks
  const rotatingPlanets = []; // gentle self-rotation each frame

  // 6 named diagonal slots around a sun, per request — not a straight
  // line in front of the camera. Cycles for however many beats a genre
  // has (currently always <= 6; see the scaling note in the file header
  // for when a genre eventually has more than 6).
  const ORBIT_RADIUS = 13;
  const SLOT_OFFSETS = [
    { x: -ORBIT_RADIUS, y: ORBIT_RADIUS * 0.55, z: 3 },   // upper left
    { x: ORBIT_RADIUS, y: ORBIT_RADIUS * 0.55, z: -3 },   // upper right
    { x: -ORBIT_RADIUS * 1.25, y: 0, z: 0 },              // middle left
    { x: ORBIT_RADIUS * 1.25, y: 0, z: 0 },               // middle right
    { x: -ORBIT_RADIUS, y: -ORBIT_RADIUS * 0.55, z: -3 }, // lower left
    { x: ORBIT_RADIUS, y: -ORBIT_RADIUS * 0.55, z: 3 },   // lower right
  ];

  function addPlanetForBeat(beat, group, slotIndex) {
    const genre = GENRES.find((g) => g.id === beat.genre);
    const offset = SLOT_OFFSETS[slotIndex % SLOT_OFFSETS.length];
    const mat = new THREE.MeshStandardMaterial({
      map: planetTexture,
      color: genre.color,
      roughness: 0.85,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.6, 28, 28), mat);
    mesh.position.set(offset.x, offset.y, offset.z);
    mesh.userData.beat = beat;
    group.add(mesh);
    planetMeshes.push(mesh);
    rotatingPlanets.push(mesh);
  }

  GENRES.forEach((genre) => {
    const group = new THREE.Group();
    group.position.set(genre.pos[0], genre.pos[1], genre.pos[2]);
    scene.add(group);
    genreGroups[genre.id] = group;

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 24, 24),
      new THREE.MeshBasicMaterial({ color: genre.color })
    );
    core.userData.genreId = genre.id;
    group.add(core);
    sunMeshes.push(core);

    [3.6, 5.2, 7.4].forEach((r, i) => {
      const baseOpacity = 0.16 - i * 0.045;
      const haloMat = new THREE.MeshBasicMaterial({
        color: genre.color,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), haloMat);
      group.add(halo);
      pulsingHalos.push({ mesh: halo, baseOpacity, phase: Math.random() * Math.PI * 2 });
    });

    // Denser, flattened-disk star cluster — meant to read as an actual
    // small galaxy/cluster around the sun (like a mini Milky Way) rather
    // than a sparse handful of stars. Biased toward the center and
    // flattened on Y, instead of a uniform sphere.
    const count = 220;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const c = new THREE.Color(genre.color);
    const pale = new THREE.Color(0xffffff);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const radiusFactor = Math.pow(Math.random(), 0.55); // denser near center
      const r = 6 + radiusFactor * 24;
      const thickness = 3.5 * (1 - radiusFactor * 0.4);
      positions[i3] = Math.cos(theta) * r;
      positions[i3 + 1] = (Math.random() - 0.5) * thickness;
      positions[i3 + 2] = Math.sin(theta) * r;

      const closeness = 1 - radiusFactor;
      const tinted = Math.random() < 0.45;
      const mixed = tinted ? c : pale;
      colors[i3] = mixed.r; colors[i3 + 1] = mixed.g; colors[i3 + 2] = mixed.b;
      sizes[i] = 0.5 + closeness * 1.2 + Math.random() * 0.5;
    }
    const points = new THREE.Points(buildStarGeometry(count, positions, colors, sizes), starMaterial());
    group.add(points);
    rotatingClusters.push(points);

    const beats = BEATS.filter((b) => b.genre === genre.id);
    beats.forEach((beat, i) => addPlanetForBeat(beat, group, i));
  });

  // ===== Genre navigation: pills + clicking a sun both call this =====
  let activeGenreId = 'all';
  let flightId = 0;

  function flyTo(targetPos, targetLookAt, duration) {
    const myFlight = ++flightId;
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startTime = performance.now();
    function step(now) {
      if (myFlight !== flightId) return;
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      camera.position.lerpVectors(startPos, targetPos, ease);
      controls.target.lerpVectors(startTarget, targetLookAt, ease);
      controls.update();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function triggerFlash() {
    if (!flashEl) return;
    flashEl.classList.remove('active');
    void flashEl.offsetWidth;
    flashEl.classList.add('active');
  }

  function activateGenre(id) {
    document.querySelectorAll('.galaxy-section .pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.genre === id);
    });
    triggerFlash();

    if (id === 'all') {
      activeGenreId = 'all';
      Object.keys(genreGroups).forEach((gid) => { genreGroups[gid].visible = true; });
      flyTo(new THREE.Vector3(0, 40, 100), new THREE.Vector3(0, 0, 0), 420);
    } else {
      const genre = GENRES.find((g) => g.id === id);
      if (!genre) return;
      activeGenreId = id;
      Object.keys(genreGroups).forEach((gid) => { genreGroups[gid].visible = gid === id; });
      const center = new THREE.Vector3(genre.pos[0], genre.pos[1], genre.pos[2]);
      // Further back than the sun itself so the surrounding planets
      // (which sit up to ~ORBIT_RADIUS*1.25 away) are comfortably in frame.
      const camPos = center.clone().add(new THREE.Vector3(0, 10, 34));
      flyTo(camPos, center, 420);
      // Controls stay fully enabled the entire time — same free
      // drag/orbit/zoom as overview mode, no locked camera.
    }
  }

  document.querySelectorAll('.galaxy-section .pill').forEach((pill) => {
    pill.addEventListener('click', () => activateGenre(pill.dataset.genre));
  });

  // ===== Click a sun or a planet to act on it =====
  const raycaster = new THREE.Raycaster();
  const mouseVec = new THREE.Vector2();
  let dragDistance = 0;
  renderer.domElement.addEventListener('pointerdown', () => { dragDistance = 0; });
  renderer.domElement.addEventListener('pointermove', (e) => { dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY); });
  renderer.domElement.addEventListener('click', (e) => {
    if (dragDistance > 6) return; // was a drag/orbit, not a click
    const rect = renderer.domElement.getBoundingClientRect();
    mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);

    const planetHits = raycaster.intersectObjects(planetMeshes);
    if (planetHits.length) {
      showBeatInfo(planetHits[0].object.userData.beat);
      return;
    }
    const sunHits = raycaster.intersectObjects(sunMeshes);
    if (sunHits.length) activateGenre(sunHits[0].object.userData.genreId);
  });

  // ===== Beat licensing panel =====
  const panel = document.getElementById('beat-info-panel');
  const biGenre = document.getElementById('bi-genre');
  const biTitle = document.getElementById('bi-title');
  const biMeta = document.getElementById('bi-meta');
  const biPlay = document.getElementById('bi-play');
  const biBuy = document.getElementById('bi-buy');
  const biSelectedPrice = document.getElementById('bi-selected-price');
  const closeBtn = document.getElementById('beat-info-close');
  const licenseButtons = document.querySelectorAll('#bi-license-options .license-option');

  let selectedTier = 'mp3';
  let currentPanelBeat = null;

  function formatPrice(v) {
    return v === null || v === undefined ? 'Inquire' : `$${v}`;
  }

  function updateSelectedPrice() {
    if (!currentPanelBeat) return;
    const v = currentPanelBeat.licenses[selectedTier];
    if (biSelectedPrice) biSelectedPrice.textContent = formatPrice(v);
  }

  function showBeatInfo(beat) {
    currentPanelBeat = beat;
    selectedTier = 'mp3';
    const genre = GENRES.find((g) => g.id === beat.genre);
    if (biGenre) biGenre.textContent = genre ? genre.name : beat.genre;
    if (biTitle) biTitle.textContent = beat.title;
    if (biMeta) biMeta.textContent = beat.meta;
    if (biPlay) {
      biPlay.dataset.name = beat.title;
      biPlay.dataset.audioUrl = beat.audioUrl || '';
    }

    licenseButtons.forEach((btn) => {
      const tier = btn.dataset.tier;
      btn.classList.toggle('active', tier === selectedTier);
      const priceEl = btn.querySelector('.license-price');
      if (priceEl) priceEl.textContent = formatPrice(beat.licenses[tier]);
    });
    updateSelectedPrice();
    if (panel) panel.classList.add('visible');
  }

  licenseButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTier = btn.dataset.tier;
      licenseButtons.forEach((b) => b.classList.toggle('active', b === btn));
      updateSelectedPrice();
    });
  });

  if (biBuy) {
    biBuy.addEventListener('click', () => {
      alert('Checkout isn\'t connected to real payment processing yet — this is where Stripe Checkout will go once that\'s wired up.');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => panel.classList.remove('visible'));
  }

  // ===== Layer in admin-uploaded beats (async — audio lives in IndexedDB) =====
  // Beats saved through admin.html BEFORE this version won't have
  // playable audio (that admin page only remembered the filename, not
  // the audio data, until this update) — those will still appear here
  // as planets, just without a working Preview button, until re-uploaded.
  function openAdminDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('qs-admin-db', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('audioFiles')) {
          req.result.createObjectStore('audioFiles');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAudioBlob(db, key) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('audioFiles', 'readonly');
        const getReq = tx.objectStore('audioFiles').get(key);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function loadAdminBeats() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem('qs-admin-beats')) || [];
    } catch (e) {
      saved = [];
    }
    if (!saved.length) return;

    let db = null;
    try {
      db = await openAdminDB();
    } catch (e) {
      db = null;
    }

    for (const b of saved) {
      if (!b.title || !GENRES.some((g) => g.id === b.genre)) continue;
      let audioUrl = '';
      if (db && b.audioKey) {
        const blob = await getAudioBlob(db, b.audioKey);
        if (blob) audioUrl = URL.createObjectURL(blob);
      }
      const priceNum = Number(b.price) || 30;
      const beat = {
        genre: b.genre,
        title: b.title,
        meta: `${b.bpm || '—'} BPM · ${b.key || '—'}`,
        licenses: { mp3: priceNum, trackout: Math.round(priceNum * 2.2), exclusive: null },
        audioUrl,
      };
      BEATS.push(beat);
      const group = genreGroups[b.genre];
      const existingCount = BEATS.filter((x) => x.genre === b.genre).length - 1;
      addPlanetForBeat(beat, group, existingCount);
    }
  }
  loadAdminBeats();

  window.addEventListener('resize', () => {
    width = container.clientWidth || width;
    height = container.clientHeight || height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const t = clock.getElapsedTime();

    if (Math.abs(zoomVelocity) > 0.001) {
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      const dist = offset.length();
      const newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, dist + zoomVelocity));
      offset.setLength(newDist);
      camera.position.copy(controls.target).add(offset);
      zoomVelocity *= ZOOM_FRICTION;
    } else {
      zoomVelocity = 0;
    }
    controls.update();

    fieldStars.rotation.y += delta * 0.01;
    rotatingClusters.forEach((pts) => { pts.rotation.y += delta * 0.15; pts.rotation.x += delta * 0.03; });
    pulsingHalos.forEach(({ mesh, baseOpacity, phase }) => {
      mesh.material.opacity = baseOpacity + Math.sin(t * 1.4 + phase) * baseOpacity * 0.3;
    });
    rotatingPlanets.forEach((mesh) => { mesh.rotation.y += delta * 0.12; });
    starMaterials.forEach((m) => { m.uniforms.uTime.value = t; });

    renderer.render(scene, camera);
  }
  animate();
})();

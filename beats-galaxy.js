// ===== Beats Galaxy =====
// Two modes:
//  1. Overview — all genre suns visible at once, browsable by drag/click,
//     exactly as before.
//  2. Tunnel — entered by clicking a sun or its pill. Every OTHER genre
//     hides, the camera holds a fixed position looking at this genre's
//     sun, and scrolling moves you PAST that genre's beats arranged in
//     depth — the "looking out a spaceship window at passing planets"
//     feel that was asked for (this is only an analogy for the motion;
//     nothing here is styled like a spaceship).
//
// Tunnel mode ports the actual pooling/wrapping architecture from an
// uploaded reference component (an "infinite gallery" of images spaced
// along Z, cycling through a fixed-size pool of visible slots as you
// scroll, rather than creating one element per item). That's not just
// borrowed style — it's the specific technique needed so this still
// performs once a genre has hundreds of beats instead of 2: at most
// TUNNEL_POOL_SIZE DOM cards ever exist for a tunnel, and which beat
// each slot displays advances only when that slot wraps past the end.
//
// Design note for future changes: createBeatCardElement() below is the
// ONLY place that builds a beat's visual. If these become 3D planet
// meshes instead of flat cards later, that's the one function to
// replace — the projection/pooling/warp logic doesn't need to change.
//
// Reuses the exact star-shader pattern proven working in nebula-bg.js:
// vertexColors:true (Three.js auto-injects the `color` attribute — do NOT
// declare it again, that caused a real compile failure earlier in this
// project) and correctly-ordered smoothstep (backwards edges are
// undefined behavior in GLSL and silently broke rendering earlier too).
(function () {
  if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') return;

  const container = document.getElementById('galaxy-viewport');
  const cardsLayer = document.getElementById('galaxy-cards-layer');
  const flashEl = document.getElementById('galaxy-flash');
  if (!container || !cardsLayer) return;

  const GENRES = [
    { id: 'trap', name: 'Trap', color: 0xff6b6b, pos: [-34, 8, -10] },
    { id: 'rnb', name: 'R&B', color: 0x9d5cff, pos: [32, -6, -20] },
    { id: 'indie-pop', name: 'Indie Pop', color: 0x6bffb8, pos: [-10, -20, 24] },
    { id: '2000s-swag', name: "2000's Swag", color: 0xffe66b, pos: [22, 22, 16] },
    { id: 'cinematic', name: 'Cinematic', color: 0x6b9bff, pos: [2, 2, -38] },
    { id: 'house', name: 'House', color: 0xff6bd6, pos: [-24, -24, -16] },
  ];

  // Two beats per genre for now (per request, to see multiple-card
  // layout before hundreds get uploaded). Each has its own license
  // pricing — some genres priced higher (cinematic) than others,
  // demonstrating that this is already per-beat, not a flat sitewide
  // price. exclusive:null renders as "Inquire", matching the site's
  // existing pattern on the general licensing tiers page.
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

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 160;
  controls.target.set(0, 0, 0);

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

  // Wheel routes to one of two places depending on mode: the overview's
  // damped zoom, or (once inside a genre) the tunnel's damped scroll.
  // Not engaged yet: do nothing at all, so it scrolls the page normally.
  renderer.domElement.addEventListener('wheel', (e) => {
    if (!engaged) return;
    e.preventDefault();
    if (tunnelActive) {
      tunnelVelocity += e.deltaY * 0.08;
      tunnelVelocity = Math.max(-40, Math.min(40, tunnelVelocity));
    } else {
      zoomVelocity += e.deltaY * 0.05;
    }
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

  const genreGroups = {};
  const sunMeshes = [];
  const rotatingClusters = [];
  const pulsingHalos = [];

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

    const count = 18;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const c = new THREE.Color(genre.color);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const r = 9 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);
      const closeness = 1.0 - (r - 9) / 10;
      colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      sizes[i] = 0.7 + closeness * 1.4 + Math.random() * 0.4;
    }
    const points = new THREE.Points(buildStarGeometry(count, positions, colors, sizes), starMaterial());
    group.add(points);
    rotatingClusters.push(points);
  });

  // ===== Beat card DOM element (shared shape for overview + tunnel) =====
  function hexToCss(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  function createBeatCardElement() {
    const pos = document.createElement('div');
    pos.className = 'galaxy-beat-card-pos';
    const el = document.createElement('div');
    el.className = 'galaxy-beat-card';
    el.innerHTML = `
      <div class="galaxy-beat-thumb"></div>
      <div class="galaxy-beat-title"></div>
    `;
    pos.appendChild(el);
    cardsLayer.appendChild(pos);
    return { pos, el, thumb: el.querySelector('.galaxy-beat-thumb'), titleEl: el.querySelector('.galaxy-beat-title') };
  }

  function beatsForGenre(genreId) {
    return BEATS.filter((b) => b.genre === genreId);
  }

  // ===== Tunnel mode =====
  const TUNNEL_POOL_SIZE = 8; // matches the reference component's visibleCount idea
  const Z_SPACING = 16;
  const NEAR_OFFSET = 5;
  const tunnelPool = Array.from({ length: TUNNEL_POOL_SIZE }, () => {
    const card = createBeatCardElement();
    const slot = { ...card, z: 0, beatIndex: 0, currentBeat: null };
    slot.el.addEventListener('click', () => {
      if (slot.currentBeat) showBeatInfo(slot.currentBeat);
    });
    return slot;
  });

  let tunnelActive = false;
  let tunnelGenreId = null;
  let tunnelVelocity = 0;
  const TUNNEL_FRICTION = 0.90;
  let tunnelCamPos = new THREE.Vector3();
  let tunnelForward = new THREE.Vector3();
  let tunnelRight = new THREE.Vector3();
  let tunnelUp = new THREE.Vector3();

  function enterTunnel(genreId) {
    tunnelActive = true;
    tunnelGenreId = genreId;
    tunnelVelocity = 0;

    Object.keys(genreGroups).forEach((gid) => {
      genreGroups[gid].visible = gid === genreId;
    });

    const beats = beatsForGenre(genreId);
    const poolSize = Math.max(1, Math.min(TUNNEL_POOL_SIZE, beats.length));
    tunnelPool.forEach((slot, i) => {
      if (i < poolSize) {
        slot.z = i * Z_SPACING;
        slot.beatIndex = i % beats.length;
      } else {
        slot.el.classList.remove('visible');
      }
    });
  }

  function exitTunnel() {
    tunnelActive = false;
    tunnelGenreId = null;
    Object.keys(genreGroups).forEach((gid) => { genreGroups[gid].visible = true; });
    tunnelPool.forEach((slot) => slot.el.classList.remove('visible'));
  }

  function updateTunnel(delta) {
    if (!tunnelActive) return;
    const beats = beatsForGenre(tunnelGenreId);
    const n = beats.length;
    if (n === 0) return;
    const poolSize = Math.max(1, Math.min(TUNNEL_POOL_SIZE, n));
    const totalLength = poolSize * Z_SPACING;
    // How far a slot's beatIndex should jump forward/back each time it
    // wraps — ported directly from the reference component's imageAdvance
    // formula, so a slot always advances to the next beat that isn't
    // already showing in another slot.
    const advance = poolSize % n || n;

    for (let i = 0; i < poolSize; i++) {
      const slot = tunnelPool[i];
      let newZ = slot.z + tunnelVelocity * delta;
      let wrapsForward = 0;
      let wrapsBackward = 0;

      if (newZ >= totalLength) {
        wrapsForward = Math.floor(newZ / totalLength);
        newZ -= totalLength * wrapsForward;
      } else if (newZ < 0) {
        wrapsBackward = Math.ceil(-newZ / totalLength);
        newZ += totalLength * wrapsBackward;
      }

      if (wrapsForward > 0) {
        slot.beatIndex = (slot.beatIndex + wrapsForward * advance) % n;
      }
      if (wrapsBackward > 0) {
        const step = slot.beatIndex - wrapsBackward * advance;
        slot.beatIndex = ((step % n) + n) % n;
      }

      slot.z = ((newZ % totalLength) + totalLength) % totalLength;

      const beat = beats[slot.beatIndex];
      if (slot.currentBeat !== beat) {
        slot.currentBeat = beat;
        const genre = GENRES.find((g) => g.id === beat.genre);
        slot.titleEl.textContent = beat.title;
        slot.thumb.style.background = `linear-gradient(160deg, ${hexToCss(genre.color)}, #0a0a0d)`;
        slot.thumb.textContent = '♫';
      }

      if (slot.jitterX == null) slot.jitterX = (Math.random() - 0.5) * 6;
      if (slot.jitterY == null) slot.jitterY = (Math.random() - 0.5) * 4;

      const worldPos = tunnelCamPos.clone()
        .addScaledVector(tunnelForward, slot.z + NEAR_OFFSET)
        .addScaledVector(tunnelRight, slot.jitterX)
        .addScaledVector(tunnelUp, slot.jitterY);

      const p = worldPos.clone().project(camera);
      const behind = p.z > 1 || p.z < -1;
      const x = (p.x * 0.5 + 0.5) * width;
      const y = (-p.y * 0.5 + 0.5) * height;
      // Card distance from camera is ~(slot.z + NEAR_OFFSET) — the small
      // perpendicular jitter barely affects it, close enough for scaling
      // purposes. Same distance-scale idea as the overview fix, so a
      // card doesn't stay a fixed screen size regardless of how "far
      // away" it currently is in the tunnel.
      const cardDistance = slot.z + NEAR_OFFSET;
      const cardScale = Math.max(0.4, Math.min(1.4, (Z_SPACING * 0.9) / cardDistance));

      // Fade + blur near both ends of this slot's local cycle — ported
      // from the reference's fadeSettings/blurSettings pattern (blurred
      // and faded at the extremes, sharp and opaque through the middle).
      const norm = slot.z / totalLength;
      let opacity = 1;
      if (norm < 0.15) opacity = norm / 0.15;
      else if (norm > 0.85) opacity = (1 - norm) / 0.15;
      opacity = Math.max(0, Math.min(1, opacity));

      let blurPx = 0;
      if (norm < 0.12) blurPx = (1 - norm / 0.12) * 6;
      else if (norm > 0.88) blurPx = ((norm - 0.88) / 0.12) * 6;

      slot.pos.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${cardScale.toFixed(3)})`;
      slot.el.style.filter = blurPx > 0.05 ? `blur(${blurPx.toFixed(1)}px)` : 'none';
      slot.el.classList.toggle('visible', !behind && opacity > 0.03);
      slot.el.style.opacity = String(opacity);
    }

    tunnelVelocity *= TUNNEL_FRICTION;
    if (Math.abs(tunnelVelocity) < 0.02) tunnelVelocity = 0;
  }

  // ===== Genre navigation: pills + clicking a sun both call this =====
  let activeGenreId = 'all';
  let flightId = 0;

  function flyTo(targetPos, targetLookAt, duration, onDone) {
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
      if (t < 1) {
        requestAnimationFrame(step);
      } else if (onDone) {
        onDone();
      }
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
      exitTunnel();
      controls.enabled = true;
      flyTo(new THREE.Vector3(0, 40, 100), new THREE.Vector3(0, 0, 0), 650);
    } else {
      const genre = GENRES.find((g) => g.id === id);
      if (!genre) return;
      activeGenreId = id;
      const center = new THREE.Vector3(genre.pos[0], genre.pos[1], genre.pos[2]);
      const camPos = center.clone().add(new THREE.Vector3(0, 5, 20));
      flyTo(camPos, center, 650, () => {
        // Camera holds this exact position/orientation for the whole
        // tunnel — OrbitControls is disabled so drag/orbit input can't
        // fight the fixed "looking down the tunnel" framing.
        controls.enabled = false;
        tunnelCamPos.copy(camPos);
        tunnelForward.subVectors(center, camPos).normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        tunnelRight.crossVectors(tunnelForward, worldUp).normalize();
        tunnelUp.crossVectors(tunnelRight, tunnelForward).normalize();
        enterTunnel(id);
      });
    }
  }

  document.querySelectorAll('.galaxy-section .pill').forEach((pill) => {
    pill.addEventListener('click', () => activateGenre(pill.dataset.genre));
  });

  // ===== Click a sun directly (only matters in overview mode) =====
  const raycaster = new THREE.Raycaster();
  const mouseVec = new THREE.Vector2();
  let dragDistance = 0;
  renderer.domElement.addEventListener('pointerdown', () => { dragDistance = 0; });
  renderer.domElement.addEventListener('pointermove', (e) => { dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY); });
  renderer.domElement.addEventListener('click', (e) => {
    if (tunnelActive || dragDistance > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);
    const hits = raycaster.intersectObjects(sunMeshes);
    if (hits.length) activateGenre(hits[0].object.userData.genreId);
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
    if (biPlay) biPlay.dataset.name = beat.title;

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

    if (!tunnelActive) {
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
    }

    fieldStars.rotation.y += delta * 0.01;
    rotatingClusters.forEach((pts) => { pts.rotation.y += delta * 0.15; pts.rotation.x += delta * 0.03; });
    pulsingHalos.forEach(({ mesh, baseOpacity, phase }) => {
      mesh.material.opacity = baseOpacity + Math.sin(t * 1.4 + phase) * baseOpacity * 0.3;
    });
    starMaterials.forEach((m) => { m.uniforms.uTime.value = t; });

    updateTunnel(delta);

    renderer.render(scene, camera);
  }
  animate();
})();

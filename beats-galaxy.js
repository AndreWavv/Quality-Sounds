// ===== Beats Galaxy =====
// Ported the SPIRIT of an uploaded React/@react-three/fiber "stellar card
// gallery" component into plain Three.js (no React/fiber/drei). Each genre
// is its OWN big bright sun (a lit sphere + layered glow halos) — that's
// the genre/solar-system identity, not a card. Each beat is a floating
// placeholder card (genre-colored gradient thumbnail — real cover art can
// replace these later) positioned near its genre's sun, projected from 3D
// world space onto the 2D overlay layer every frame. Clicking a sun (or
// its genre pill) triggers a fast "warp" — a quick flash + rapid zoom —
// into that solar system, and the beat cards for that genre pop in once
// the camera arrives.
//
// Design note for future changes: createBeatCardElement() below is the
// ONLY place that builds a beat's visual. If these become 3D planet
// meshes instead of flat cards later, that's the one function to replace
// — the projection/visibility/warp logic around it doesn't need to change.
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
    { id: 'rnb', name: 'R&B', color: 0xffb86b, pos: [32, -6, -20] },
    { id: 'indie-pop', name: 'Indie Pop', color: 0x6bffb8, pos: [-10, -20, 24] },
    { id: '2000s-swag', name: "2000's Swag", color: 0xffe66b, pos: [22, 22, 16] },
    { id: 'cinematic', name: 'Cinematic', color: 0x6b9bff, pos: [2, 2, -38] },
  ];

  const BEATS = [
    { genre: 'trap', title: 'Track Title One', meta: '140 BPM · F Minor', price: '$30+' },
    { genre: 'rnb', title: 'Track Title Two', meta: '92 BPM · C# Minor', price: '$30+' },
    { genre: 'indie-pop', title: 'Track Title Three', meta: '102 BPM · G Major', price: '$30+' },
    { genre: '2000s-swag', title: 'Track Title Four', meta: '98 BPM · D Minor', price: '$30+' },
    { genre: 'cinematic', title: 'Track Title Five', meta: '70 BPM · A Minor', price: '$30+' },
  ];

  let width = container.clientWidth || 800;
  let height = container.clientHeight || 620;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
  camera.position.set(0, 40, 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  // Opaque space background owned by this renderer — not relying on the
  // site-wide background canvas showing through, which was blending
  // confusingly with this scene.
  renderer.setClearColor(0x030307, 1);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 160;
  controls.target.set(0, 0, 0);

  // ---- Sharp star shader (same fix already proven in nebula-bg.js) ----
  function starMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (280.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float core = 1.0 - smoothstep(0.35, 1.0, d);
          if (d > 1.0) discard;
          gl_FragColor = vec4(vColor * (1.3 + core), core);
        }
      `,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  // A sparse field of distant background stars for this scene specifically
  // (this canvas is opaque now, so it needs its own — it can no longer
  // borrow the site-wide background through transparency).
  (function addFieldStars() {
    const count = 500;
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    scene.add(new THREE.Points(geo, starMaterial()));
  })();

  const genreGroups = {};
  const sunMeshes = []; // clickable core sphere per genre

  GENRES.forEach((genre) => {
    const group = new THREE.Group();
    group.position.set(genre.pos[0], genre.pos[1], genre.pos[2]);
    scene.add(group);
    genreGroups[genre.id] = group;

    // The sun — the genre's actual identity. A solid bright core plus
    // layered soft glow halos (a cheap stand-in for a real bloom pass).
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 24, 24),
      new THREE.MeshBasicMaterial({ color: genre.color })
    );
    core.userData.genreId = genre.id;
    group.add(core);
    sunMeshes.push(core);

    [3.6, 5.2, 7.4].forEach((r, i) => {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(r, 20, 20),
        new THREE.MeshBasicMaterial({
          color: genre.color,
          transparent: true,
          opacity: 0.16 - i * 0.045,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      group.add(halo);
    });

    // A modest scatter of small ambient stars around the sun for texture
    // — dimmer and smaller than the sun itself, not competing with it.
    const count = 16;
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
      colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      sizes[i] = 0.9 + Math.random() * 1.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    group.add(new THREE.Points(geo, starMaterial()));
  });

  // ===== Beat cards (DOM overlay, projected from 3D world positions) =====
  function hexToCss(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  function createBeatCardElement(beat, genre) {
    const el = document.createElement('div');
    el.className = 'galaxy-beat-card';
    el.innerHTML = `
      <div class="galaxy-beat-thumb" style="background: linear-gradient(160deg, ${hexToCss(genre.color)}, #0a0a0d);">♫</div>
      <div class="galaxy-beat-title">${beat.title}</div>
    `;
    el.addEventListener('click', () => showBeatInfo(beat));
    cardsLayer.appendChild(el);
    return el;
  }

  const beatEntries = BEATS.map((beat) => {
    const genre = GENRES.find((g) => g.id === beat.genre);
    const group = genreGroups[genre.id];
    const localOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14
    );
    const worldPos = group.position.clone().add(localOffset);
    const el = createBeatCardElement(beat, genre);
    return { beat, genre, worldPos, el };
  });

  function projectToScreen(worldPos) {
    const p = worldPos.clone().project(camera);
    return {
      x: (p.x * 0.5 + 0.5) * width,
      y: (-p.y * 0.5 + 0.5) * height,
      behind: p.z > 1 || p.z < -1,
    };
  }

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
      const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // easeOutExpo — fast start, quick settle, "jump" feel
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
    void flashEl.offsetWidth; // force reflow so the animation restarts
    flashEl.classList.add('active');
  }

  function activateGenre(id) {
    document.querySelectorAll('.galaxy-section .pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.genre === id);
    });
    triggerFlash();
    if (id === 'all') {
      activeGenreId = 'all';
      flyTo(new THREE.Vector3(0, 40, 100), new THREE.Vector3(0, 0, 0), 650);
    } else {
      const genre = GENRES.find((g) => g.id === id);
      if (!genre) return;
      const center = new THREE.Vector3(genre.pos[0], genre.pos[1], genre.pos[2]);
      const camPos = center.clone().add(new THREE.Vector3(0, 5, 20));
      flyTo(camPos, center, 650);
      // Cards "pop up" once the warp has mostly landed, not before.
      setTimeout(() => { activeGenreId = id; }, 480);
    }
  }

  document.querySelectorAll('.galaxy-section .pill').forEach((pill) => {
    pill.addEventListener('click', () => activateGenre(pill.dataset.genre));
  });

  // ===== Click a sun directly (not just its pill) to warp there =====
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
    const hits = raycaster.intersectObjects(sunMeshes);
    if (hits.length) activateGenre(hits[0].object.userData.genreId);
  });

  // ===== Beat info panel =====
  const panel = document.getElementById('beat-info-panel');
  const biGenre = document.getElementById('bi-genre');
  const biTitle = document.getElementById('bi-title');
  const biMeta = document.getElementById('bi-meta');
  const biPrice = document.getElementById('bi-price');
  const biPlay = document.getElementById('bi-play');
  const closeBtn = document.getElementById('beat-info-close');

  function showBeatInfo(beat) {
    const genre = GENRES.find((g) => g.id === beat.genre);
    if (biGenre) biGenre.textContent = genre ? genre.name : beat.genre;
    if (biTitle) biTitle.textContent = beat.title;
    if (biMeta) biMeta.textContent = beat.meta;
    if (biPrice) biPrice.textContent = beat.price;
    if (biPlay) biPlay.dataset.name = beat.title;
    if (panel) panel.classList.add('visible');
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

  function animate() {
    requestAnimationFrame(animate);
    controls.update();

    beatEntries.forEach(({ el, beat, worldPos }) => {
      const { x, y, behind } = projectToScreen(worldPos);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      const shouldShow = !behind && beat.genre === activeGenreId;
      el.classList.toggle('visible', shouldShow);
    });

    renderer.render(scene, camera);
  }
  animate();
})();

// ===== Beats Galaxy =====
// Ported the SPIRIT of an uploaded React/@react-three/fiber "stellar card
// gallery" component into plain Three.js (no React/fiber/drei — none of
// that exists in this static site). Each genre is a cluster of stars
// ("solar system") positioned in 3D space; each beat is a bright,
// clickable sphere within its genre's cluster. Genre buttons fly the
// camera to that cluster; clicking a beat sphere opens an info panel
// wired into the site's existing floating audio player.
//
// Reuses the exact star-shader pattern already proven working in
// nebula-bg.js: vertexColors:true (Three.js auto-injects the `color`
// attribute — do NOT declare it again, that caused a real compile
// failure earlier in this project) and correctly-ordered smoothstep
// (backwards edges are undefined behavior in GLSL and silently broke
// rendering on some GPUs earlier in this project too).
(function () {
  if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') return;

  const container = document.getElementById('galaxy-viewport');
  if (!container) return;

  const GENRES = [
    { id: 'trap', name: 'Trap', color: 0xff6b6b, pos: [-30, 8, -10] },
    { id: 'rnb', name: 'R&B', color: 0xffb86b, pos: [28, -6, -18] },
    { id: 'indie-pop', name: 'Indie Pop', color: 0x6bffb8, pos: [-8, -18, 22] },
    { id: '2000s-swag', name: "2000's Swag", color: 0xffe66b, pos: [20, 20, 14] },
    { id: 'cinematic', name: 'Cinematic', color: 0x6b9bff, pos: [2, 2, -34] },
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

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 160;
  controls.target.set(0, 0, 0);

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
          float core = 1.0 - smoothstep(0.0, 1.0, d);
          if (d > 1.0) discard;
          gl_FragColor = vec4(vColor * (1.1 + core), core);
        }
      `,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  const genreGroups = {};
  const beatMeshes = [];
  const tmpColor = new THREE.Color();

  GENRES.forEach((genre) => {
    const group = new THREE.Group();
    group.position.set(genre.pos[0], genre.pos[1], genre.pos[2]);
    scene.add(group);
    genreGroups[genre.id] = group;

    // Bright cluster stars — "brighter stars, like a different solar system"
    const count = 26;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    tmpColor.setHex(genre.color);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const r = 3 + Math.random() * 7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);
      colors[i3] = tmpColor.r; colors[i3 + 1] = tmpColor.g; colors[i3 + 2] = tmpColor.b;
      sizes[i] = 1.4 + Math.random() * 1.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    group.add(new THREE.Points(geo, starMaterial()));
  });

  // Beats as real meshes (not points) — far more reliable to raycast/click
  const beatGeo = new THREE.SphereGeometry(0.9, 20, 20);
  BEATS.forEach((beat) => {
    const genre = GENRES.find((g) => g.id === beat.genre);
    if (!genre) return;
    const group = genreGroups[genre.id];

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.9, 16, 16),
      new THREE.MeshBasicMaterial({ color: genre.color, transparent: true, opacity: 0.25, depthWrite: false })
    );
    const mesh = new THREE.Mesh(beatGeo, new THREE.MeshBasicMaterial({ color: genre.color }));
    const offset = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    mesh.position.copy(offset);
    halo.position.copy(offset);
    mesh.userData.beat = beat;
    group.add(halo);
    group.add(mesh);
    beatMeshes.push(mesh);
  });

  // ===== Genre nav — flies the camera to that cluster =====
  let flightId = 0;
  function flyTo(targetPos, targetLookAt, duration) {
    const myFlight = ++flightId;
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startTime = performance.now();
    function step(now) {
      if (myFlight !== flightId) return; // a newer flight superseded this one
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.lerpVectors(startPos, targetPos, ease);
      controls.target.lerpVectors(startTarget, targetLookAt, ease);
      controls.update();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  document.querySelectorAll('.galaxy-section .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.galaxy-section .pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const id = pill.dataset.genre;
      if (id === 'all') {
        flyTo(new THREE.Vector3(0, 40, 100), new THREE.Vector3(0, 0, 0), 1400);
      } else {
        const genre = GENRES.find((g) => g.id === id);
        if (!genre) return;
        const center = new THREE.Vector3(genre.pos[0], genre.pos[1], genre.pos[2]);
        const camPos = center.clone().add(new THREE.Vector3(0, 4, 18));
        flyTo(camPos, center, 1400);
      }
    });
  });

  // ===== Click a beat sphere to open its info panel =====
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
    const hits = raycaster.intersectObjects(beatMeshes);
    if (hits.length) showBeatInfo(hits[0].object.userData.beat);
  });

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
    renderer.render(scene, camera);
  }
  animate();
})();

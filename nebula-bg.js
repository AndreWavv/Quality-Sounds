// ===== Background particle nebula =====
// Ported from an uploaded React + Three.js component (which used a
// 50,000-particle CPU simulation plus an UnrealBloomPass post-processing
// pass) into plain JS for this static site. Deliberately scaled way down:
// this runs continuously behind every page, so it needs to be cheap.
// Changes from the original:
//   - ~1,800 particles instead of 50,000
//   - no per-frame Vector3 allocation inside the loop (the original
//     created several `new THREE.Vector3()` per particle, per frame —
//     50,000 of those every frame is a lot of garbage collection)
//   - no bloom post-processing pass (AdditiveBlending alone gives a
//     similar glow-where-particles-overlap look for far less cost)
//   - simple trig-based drift instead of curl noise, matching what the
//     original code actually fell back to anyway (its own comments note
//     real curl noise in JS "is too slow")
//   - respects prefers-reduced-motion, and fails silently if the
//     Three.js CDN script didn't load, so a slow/blocked CDN never
//     breaks the rest of the page
(function () {
  if (typeof THREE === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('nebula-bg');
  if (!canvas) return;

  const PARTICLE_COUNT = 1800;
  const BOX = 6;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 4;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const speeds = new Float32Array(PARTICLE_COUNT);
  const tmpColor = new THREE.Color();

  // Blue-to-purple, matching the site's --blue / --purple palette
  const paletteHues = [224, 262];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * BOX;
    positions[i3 + 1] = (Math.random() - 0.5) * BOX;
    positions[i3 + 2] = (Math.random() - 0.5) * BOX;

    const hue = paletteHues[Math.floor(Math.random() * paletteHues.length)] / 360;
    tmpColor.setHSL(hue, 0.85, 0.65);
    colors[i3] = tmpColor.r;
    colors[i3 + 1] = tmpColor.g;
    colors[i3 + 2] = tmpColor.b;

    speeds[i] = 0.2 + Math.random() * 0.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.028,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const mouse = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }, { passive: true });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  function animate() {
    const t = clock.getElapsedTime();
    const pos = geometry.attributes.position.array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      pos[i3 + 1] += Math.sin(t * speeds[i] + i) * 0.0006;
      pos[i3] += Math.cos(t * speeds[i] * 0.7 + i) * 0.0004;

      // Wrap around the box instead of ever "running out" of particles
      if (pos[i3] > BOX / 2) pos[i3] -= BOX;
      if (pos[i3] < -BOX / 2) pos[i3] += BOX;
      if (pos[i3 + 1] > BOX / 2) pos[i3 + 1] -= BOX;
      if (pos[i3 + 1] < -BOX / 2) pos[i3 + 1] += BOX;
    }
    geometry.attributes.position.needsUpdate = true;

    // Gentle parallax toward the cursor, eased rather than snapped
    camera.position.x += (mouse.x * 0.3 - camera.position.x) * 0.02;
    camera.position.y += (mouse.y * 0.3 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
})();

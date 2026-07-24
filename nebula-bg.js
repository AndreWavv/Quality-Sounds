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
  const sizes = new Float32Array(PARTICLE_COUNT);
  const twinklePhase = new Float32Array(PARTICLE_COUNT);

  // Mostly pale/white like real starlight, with a faint blue/purple tint —
  // fully saturated colors read as "gamey" rather than realistic.
  const paletteHues = [224, 262];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * BOX;
    positions[i3 + 1] = (Math.random() - 0.5) * BOX;
    positions[i3 + 2] = (Math.random() - 0.5) * BOX;

    const hue = paletteHues[Math.floor(Math.random() * paletteHues.length)] / 360;
    const tinted = Math.random() < 0.35; // most stars stay near-white
    tmpColor.setHSL(hue, tinted ? 0.55 : 0.08, tinted ? 0.75 : 0.9);
    colors[i3] = tmpColor.r;
    colors[i3 + 1] = tmpColor.g;
    colors[i3 + 2] = tmpColor.b;

    speeds[i] = 0.2 + Math.random() * 0.4;
    // A few bigger/brighter "near" stars among many small distant ones
    sizes[i] = Math.random() < 0.12 ? (1.8 + Math.random() * 1.6) : (0.5 + Math.random() * 0.7);
    twinklePhase[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinklePhase, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aTwinkle;
      attribute vec3 color;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = color;
        // Gentle brightness pulse per-star, offset so they don't sync up
        vTwinkle = 0.7 + 0.3 * sin(uTime * 1.6 + aTwinkle);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (60.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        // Soft circular falloff from center instead of a flat square.
        // IMPORTANT: smoothstep(edge0, edge1, x) requires edge0 < edge1 —
        // calling it backwards is undefined behavior per the GLSL spec.
        // (An earlier version did smoothstep(0.5, 0.0, d), which is
        // exactly that mistake — it happened to work on some GPUs but
        // silently returned 0 everywhere on others, discarding every
        // fragment and making the whole star field disappear.)
        float d = length(gl_PointCoord - vec2(0.5)) * 2.0; // 0 at center, 1 at edge
        float core = 1.0 - smoothstep(0.0, 1.0, d);
        if (d > 1.0) discard;
        gl_FragColor = vec4(vColor * vTwinkle * (1.1 + core), core * vTwinkle);
      }
    `,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
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
    material.uniforms.uTime.value = t;
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

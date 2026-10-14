// ===== Beats page: genre rings scene, catalog grid, checkout =====
// The 3D scene is the approved "genre rings" design (see
// genre-rings-preview.html): seven glowing rings, one per genre, each
// carrying that genre's real beat cards.
//
// - Cards are CSS3DObjects (real DOM elements), so the play and buy
//   buttons are ordinary, reliably clickable <button>s.
// - The glowing soundwave tracks are drawn by a TRANSPARENT WebGL canvas
//   layered under the cards, so the day/night cloud video behind the
//   scene stays visible.
// - Hold a card to pause its ring and drag sideways to scrub it. A tap
//   (no real drag) lets the ring carry on; a real drag parks it.
// - Phone: one finger orbits, two fingers pinch to zoom; the starting
//   distance fits both side wheels and the top halo on screen.
//
// The catalog grid and checkout below the scene do NOT depend on the 3D
// library: if three.js fails to load, the scene shows a short note and
// everything else on the page still works.
(function () {
  const has3D = typeof THREE !== 'undefined' && typeof THREE.CSS3DRenderer !== 'undefined';
  const container = document.getElementById('galaxy-viewport');
  const flashEl = document.getElementById('galaxy-flash');
  const sceneWrap = document.getElementById('cloud-scene-wrap');
  const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  // ===== Day/night theme =====
  // Follows the local clock (day = 06:00–19:00) unless the visitor picked
  // one with the sun/moon toggle, which is remembered.
  const THEME_STORAGE_KEY = 'qs-theme';

  function setTheme(theme) {
    if (sceneWrap) sceneWrap.dataset.theme = theme;
    document.documentElement.dataset.siteTheme = theme;
  }

  function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { /* storage blocked — fall back to the clock */ }
    if (stored === 'day' || stored === 'night') {
      setTheme(stored);
      return;
    }
    const hour = new Date().getHours();
    setTheme(hour >= 6 && hour < 19 ? 'day' : 'night');
  }
  initTheme();

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = sceneWrap && sceneWrap.dataset.theme === 'day' ? 'night' : 'day';
      setTheme(next);
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (e) { /* not remembered, still switches */ }
    });
  }

  // A scattering of small stars above the cloud line — night theme only
  // (CSS fades the container in/out based on data-theme).
  const starsContainer = document.getElementById('cloud-stars');
  if (starsContainer) {
    for (let i = 0; i < 60; i++) {
      const star = document.createElement('div');
      star.className = 'cloud-star';
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 45}%`;
      star.style.opacity = String(0.3 + Math.random() * 0.6);
      starsContainer.appendChild(star);
    }
  }

  // Hints: touch screens pinch instead of scroll.
  const sceneHint = document.getElementById('galaxy-hint');
  const engageHint = document.getElementById('galaxy-engage-hint');
  if (isTouch) {
    if (sceneHint) sceneHint.textContent = 'Drag to look around · Pinch to zoom · Hold a card to pause and scrub its ring';
    if (engageHint) engageHint.textContent = 'Drag to look around · pinch to zoom';
  }

  // ===== Genres and the approved ring layout =====
  // polar = angle of the ring's axis from vertical (0 = lying flat,
  // PI/2 = standing up); azimuthal = turn around the vertical axis.
  // Order here is also the order of the catalog filter tabs.
  const MAIN_RADIUS = 260;
  const WHEEL_RADIUS = 170;
  const WHEEL_OFFSET = MAIN_RADIUS + WHEEL_RADIUS + 60; // 490 — a real gap, so the side wheels aren't chained to the middle
  const HALO_HEIGHT = 340;
  const HALF_PI = Math.PI / 2;
  const QUARTER_PI = Math.PI / 4;

  const GENRES = [
    { id: 'trap', name: 'Trap', color: 0xff6b6b,
      ring: { polar: 0, azimuthal: 0, center: [0, 0, 0], radius: MAIN_RADIUS, phase: 0 } },              // flat "Saturn" ring
    { id: 'rnb', name: 'R&B', color: 0x9d5cff,
      ring: { polar: QUARTER_PI, azimuthal: Math.PI, center: [0, 0, 0], radius: MAIN_RADIUS, phase: 3.6 } }, // House's exact opposite
    { id: 'indie-pop', name: 'Indie Pop', color: 0x6bffb8,
      ring: { polar: HALF_PI, azimuthal: 0, center: [0, 0, 0], radius: MAIN_RADIUS, phase: 0.9 } },       // vertical
    { id: '2000s-swag', name: "2000's Swag", color: 0xffe66b,
      ring: { polar: 0, azimuthal: 0, center: [0, HALO_HEIGHT, 0], radius: MAIN_RADIUS * 0.75, phase: 5.4 } }, // halo on top
    { id: 'cinematic', name: 'Cinematic', color: 0x6b9bff,
      ring: { polar: HALF_PI, azimuthal: 0, center: [-WHEEL_OFFSET, 0, 0], radius: WHEEL_RADIUS, phase: 1.8 } }, // left wheel
    { id: 'house', name: 'House', color: 0xff6bd6,
      ring: { polar: QUARTER_PI, azimuthal: 0, center: [0, 0, 0], radius: MAIN_RADIUS, phase: 2.7 } },    // diagonal
    { id: 'synthwave', name: 'Synthwave', color: 0x00e5ff,
      ring: { polar: HALF_PI, azimuthal: 0, center: [WHEEL_OFFSET, 0, 0], radius: WHEEL_RADIUS, phase: 4.5 } }, // right wheel
  ];

  // Populated from Supabase (loadBeatsFromSupabase, below).
  const BEATS = [];

  function hexToCss(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  function triggerFlash() {
    if (!flashEl) return;
    flashEl.classList.remove('active');
    void flashEl.offsetWidth;
    flashEl.classList.add('active');
  }

  // Scroll-to-zoom only kicks in after the first click/touch in the
  // scene, so scrolling down the page never gets hijacked by accident.
  let engaged = false;
  function engage() {
    if (engaged) return;
    engaged = true;
    if (engageHint) engageHint.classList.add('hidden');
  }

  function showSceneMessage(text) {
    if (!sceneWrap) return;
    const msg = document.createElement('p');
    msg.className = 'galaxy-scene-message';
    msg.textContent = text;
    sceneWrap.appendChild(msg);
    if (engageHint) engageHint.classList.add('hidden');
  }

  let ringScene = null;
  if (container && has3D) {
    try {
      ringScene = createRingScene();
    } catch (err) {
      console.error('Genre rings failed to start:', err);
      if (container) container.innerHTML = '';
      ringScene = null;
    }
  }
  if (container && !ringScene) {
    showSceneMessage("The 3D view couldn't load on this connection. The full catalog is just below.");
  }

  // ===== The 3D rings scene =====
  function createRingScene() {
    const FOV = 55;
    const TARGET_Y = 60;                // middle of the structure (bottom of the main rings to the halo)
    const CARD_WORLD_WIDTH = 54;        // card width in scene units — about the approved preview's card size
    const PORTRAIT_CARD_BOOST = 1.6;    // cards scale up on tall screens so they stay visible at the wider fit distance
    const WAVE_REPEATS = 10;            // soundwave pattern repeats per ring
    const SCRUB_RAD_PER_PX = 0.012;
    const TAP_SLOP_PX = 6;              // less movement than this counts as a tap, not a scrub
    const ROT_SENSITIVITY = 0.004;
    const ROT_FRICTION = 0.92;
    const MAX_ROT_VELOCITY = 0.3;
    const MIN_PHI = 0.2;
    const MAX_PHI = Math.PI - 0.2;
    const PHI_CUSHION = 0.5;            // eases rotation to a stop near the top/bottom instead of hitting a wall
    const ZOOM_FRICTION = 0.9;
    const MAX_ZOOM_VELOCITY = 0.05;
    const ZOOM_CUSHION = 150;

    const size = () => ({ w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight) });
    let { w: width, h: height } = size();

    const cardScene = new THREE.Scene();
    const glowScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, width / height, 1, 6000);

    container.innerHTML = '';

    function pinToCorner(el) {
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
    }

    // Glow layer. alpha:true + a fully transparent clear color keeps the
    // cloud video visible underneath; the glow adds light on top of it.
    // If WebGL is unavailable the cards still ride their rings, just
    // without the glowing tracks.
    let glowRenderer = null;
    try {
      glowRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      glowRenderer.setClearColor(0x000000, 0);
      glowRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      glowRenderer.setSize(width, height);
      pinToCorner(glowRenderer.domElement);
      glowRenderer.domElement.style.pointerEvents = 'none';
      container.appendChild(glowRenderer.domElement);
    } catch (err) {
      console.warn('WebGL unavailable — showing the rings without glow.', err);
      glowRenderer = null;
    }

    const cardRenderer = new THREE.CSS3DRenderer();
    cardRenderer.setSize(width, height);
    pinToCorner(cardRenderer.domElement);
    container.appendChild(cardRenderer.domElement);

    // ---- Glowing soundwave rings ----
    // Three flat strips per ring, all additive so they read as light: a
    // wide soft haze, a tighter glow, and the bright soundwave core.
    function lighten(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const mix = (c) => Math.round(c + (255 - c) * amt);
      return 'rgb(' + mix(n >> 16) + ',' + mix((n >> 8) & 255) + ',' + mix(n & 255) + ')';
    }

    function makeWaveformTexture(colorHex) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const mid = canvas.height / 2;
      ctx.fillStyle = colorHex;
      ctx.fillRect(0, mid - 1.5, canvas.width, 3); // continuous center line so each ring reads as one loop
      const barCount = 40;
      const barWidth = canvas.width / barCount;
      for (let i = 0; i < barCount; i++) {
        const barH = (0.2 + Math.random() * 0.75) * canvas.height;
        const x = i * barWidth;
        const w = barWidth * 0.68;
        ctx.fillStyle = colorHex;
        ctx.fillRect(x, mid - barH / 2, w, barH);
        ctx.fillStyle = lighten(colorHex, 0.6);
        ctx.fillRect(x + w * 0.3, mid - barH * 0.4, w * 0.4, barH * 0.8);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = Math.min(4, glowRenderer.capabilities.getMaxAnisotropy());
      return texture;
    }

    // Soft white falloff across a strip's width, tinted per ring.
    function makeGlowTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 4; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(4, 128);
      for (let y = 0; y < 128; y++) {
        const d = (y / 127 - 0.5) / 0.22;
        const a = Math.round(255 * Math.exp(-d * d));
        for (let x = 0; x < 4; x++) {
          const k = (y * 4 + x) * 4;
          img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
          img.data[k + 3] = a;
        }
      }
      ctx.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(canvas);
      t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    }
    const glowTexture = glowRenderer ? makeGlowTexture() : null;

    function ringStrip(basis, center, radius, halfWidth, repeats) {
      const SEGMENTS = 128;
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let s = 0; s <= SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const cx = Math.cos(a);
        const sx = Math.sin(a);
        const inner = new THREE.Vector3()
          .addScaledVector(basis.t1, cx * (radius - halfWidth))
          .addScaledVector(basis.t2, sx * (radius - halfWidth)).add(center);
        const outer = new THREE.Vector3()
          .addScaledVector(basis.t1, cx * (radius + halfWidth))
          .addScaledVector(basis.t2, sx * (radius + halfWidth)).add(center);
        positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
        const u = (s / SEGMENTS) * repeats;
        uvs.push(u, 0, u, 1);
      }
      for (let s = 0; s < SEGMENTS; s++) {
        const a0 = s * 2, b0 = s * 2 + 1, a1 = (s + 1) * 2, b1 = (s + 1) * 2 + 1;
        indices.push(a0, b0, a1, b0, b1, a1);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setIndex(indices);
      return geom;
    }

    function lightMaterial(map, color, opacity) {
      return new THREE.MeshBasicMaterial({
        map, color: new THREE.Color(color), transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
    }

    function buildGlowRing(basis, center, radius, colorHex) {
      const haze = new THREE.Mesh(ringStrip(basis, center, radius, radius * 0.40, 1), lightMaterial(glowTexture, colorHex, 0.38));
      const glow = new THREE.Mesh(ringStrip(basis, center, radius, radius * 0.17, 1), lightMaterial(glowTexture, colorHex, 1));
      const texture = makeWaveformTexture(colorHex);
      const core = new THREE.Mesh(ringStrip(basis, center, radius, radius * 0.055, WAVE_REPEATS), lightMaterial(texture, '#ffffff', 1));
      [haze, glow, core].forEach((m) => glowScene.add(m));
      return { texture, hazeMat: haze.material, glowMat: glow.material, coreMat: core.material };
    }

    // Ring plane from spherical coordinates. NEVER Euler(tilt, spin):
    // that puts rings with the same tilt on the same plane.
    function ringBasis(polar, azimuthal) {
      const normal = new THREE.Vector3(
        Math.sin(polar) * Math.cos(azimuthal),
        Math.cos(polar),
        Math.sin(polar) * Math.sin(azimuthal)
      );
      const ref = Math.abs(normal.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const t1 = new THREE.Vector3().crossVectors(normal, ref).normalize();
      const t2 = new THREE.Vector3().crossVectors(normal, t1);
      return { t1, t2 };
    }

    const rings = GENRES.map((genre) => {
      const layout = genre.ring;
      const basis = ringBasis(layout.polar, layout.azimuthal);
      const center = new THREE.Vector3(layout.center[0], layout.center[1], layout.center[2]);
      return {
        id: genre.id,
        name: genre.name,
        basis,
        center,
        radius: layout.radius,
        phase: layout.phase,
        angle: Math.random() * Math.PI * 2,     // staggered start, so rings don't look synchronized
        autoSpeed: 0.16 + Math.random() * 0.06, // ~30 s per turn
        paused: false,
        dim: 1,
        dimTarget: 1,
        glow: glowRenderer ? buildGlowRing(basis, center, layout.radius, hexToCss(genre.color)) : null,
        cards: [], // { obj, beat, angleOffset, tiltZ, cssWidth }
      };
    });

    // ---- Camera: damped orbit around the structure ----
    let theta = 0.4;
    let phi = Math.PI / 2.6; // a little above the halo, so it opens up as a ring instead of a flat line
    let velTheta = 0;
    let velPhi = 0;
    let dist = 1050;
    let minDist = 250;
    let maxDist = 1600;
    let zoomVelocity = 0;
    let userZoomed = false;

    function cardWorldWidth() {
      return width / height < 1 ? CARD_WORLD_WIDTH * PORTRAIT_CARD_BOOST : CARD_WORLD_WIDTH;
    }

    // Distance that fits both side wheels and the halo in the viewport.
    function fitDistance() {
      const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const aspect = width / height;
      const halfW = WHEEL_OFFSET + WHEEL_RADIUS + cardWorldWidth() * 0.8;
      const halfH = 420;
      return Math.max(halfW / (t * aspect) + 120, halfH / t + 260);
    }
    function applyFit() {
      const fit = fitDistance();
      maxDist = Math.max(1600, fit * 1.35);
      if (!userZoomed) dist = Math.min(maxDist, Math.max(700, fit));
      dist = Math.max(minDist, Math.min(maxDist, dist));
    }
    applyFit();

    function setDist(d) {
      dist = Math.max(minDist, Math.min(maxDist, d));
      userZoomed = true;
    }

    function updateCamera() {
      if (Math.abs(velTheta) > 0.00001 || Math.abs(velPhi) > 0.00001) {
        theta += velTheta;
        let appliedPhi = velPhi;
        if (velPhi < 0 && phi - MIN_PHI < PHI_CUSHION) {
          appliedPhi *= Math.max(0, (phi - MIN_PHI) / PHI_CUSHION);
        } else if (velPhi > 0 && MAX_PHI - phi < PHI_CUSHION) {
          appliedPhi *= Math.max(0, (MAX_PHI - phi) / PHI_CUSHION);
        }
        phi = Math.max(MIN_PHI, Math.min(MAX_PHI, phi + appliedPhi));
        velTheta *= ROT_FRICTION;
        velPhi *= ROT_FRICTION;
      } else {
        velTheta = 0;
        velPhi = 0;
      }

      // Zoom glides to a stop and eases off near both limits.
      if (Math.abs(zoomVelocity) > 0.00001) {
        let applied = zoomVelocity;
        if (zoomVelocity < 0 && dist - minDist < ZOOM_CUSHION) {
          applied *= Math.max(0, (dist - minDist) / ZOOM_CUSHION);
        } else if (zoomVelocity > 0 && maxDist - dist < ZOOM_CUSHION) {
          applied *= Math.max(0, (maxDist - dist) / ZOOM_CUSHION);
        }
        dist = Math.max(minDist, Math.min(maxDist, dist * (1 + applied)));
        zoomVelocity *= ZOOM_FRICTION;
      } else {
        zoomVelocity = 0;
      }

      camera.position.set(
        dist * Math.sin(phi) * Math.sin(theta),
        TARGET_Y + dist * Math.cos(phi),
        dist * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(0, TARGET_Y, 0);
    }

    // ---- Camera input: drag to orbit, wheel or pinch to zoom ----
    const pointers = new Map();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinchStartSpread = 0;
    let pinchStartDist = 0;
    const spread = () => {
      const p = [...pointers.values()];
      return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
    };

    container.addEventListener('pointerdown', (e) => {
      engage();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      } else if (pointers.size === 2) {
        dragging = false;
        zoomVelocity = 0;
        pinchStartSpread = spread();
        pinchStartDist = dist;
      }
    });

    function clampRot(v) { return Math.max(-MAX_ROT_VELOCITY, Math.min(MAX_ROT_VELOCITY, v)); }

    window.addEventListener('pointermove', (e) => {
      if (scrub && e.pointerId === scrub.pointerId) {
        const delta = e.clientX - scrub.startX;
        scrub.moved = Math.max(scrub.moved, Math.abs(delta));
        scrub.ring.angle = scrub.startAngle + delta * SCRUB_RAD_PER_PX;
        return;
      }
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        setDist(pinchStartDist * (pinchStartSpread / spread()));
      } else if (dragging) {
        // Grab-the-world direction: the structure turns the way you drag.
        velTheta = clampRot(velTheta - (e.clientX - lastX) * ROT_SENSITIVITY);
        velPhi = clampRot(velPhi - (e.clientY - lastY) * ROT_SENSITIVITY);
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });

    function endPointer(e) {
      if (scrub && e.pointerId === scrub.pointerId) endScrub();
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 1) {
        // One finger lifted mid-pinch: keep orbiting with the other, without a jump.
        const p = [...pointers.values()][0];
        dragging = true;
        lastX = p.x;
        lastY = p.y;
      } else if (pointers.size === 0) {
        dragging = false;
      }
    }
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    container.addEventListener('wheel', (e) => {
      if (!engaged) return; // until the scene is clicked, the wheel scrolls the page as normal
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 33 : 1; // Firefox reports wheel steps in lines
      const k = e.ctrlKey ? 0.0006 : 0.00015;   // ctrlKey = trackpad pinch
      zoomVelocity = Math.max(-MAX_ZOOM_VELOCITY, Math.min(MAX_ZOOM_VELOCITY, zoomVelocity + e.deltaY * lines * k));
      userZoomed = true;
    }, { passive: false });

    // Stop iOS Safari from zooming the whole page when pinching the scene.
    ['gesturestart', 'gesturechange'].forEach((t) => container.addEventListener(t, (e) => e.preventDefault()));

    // ---- Cards: hold to pause, drag sideways to scrub that ring ----
    let scrub = null;            // { ring, pointerId, startX, startAngle, moved, el }
    let suppressClickOn = null;  // card whose next click is swallowed after a real scrub
    let activeFilter = 'all';
    let needsScale = false;

    function endScrub() {
      if (!scrub) return;
      if (scrub.moved < TAP_SLOP_PX) {
        scrub.ring.paused = false; // a tap resumes the ring
      } else {
        // A real drag parks the ring where you let go. If the drag started
        // and ended on the Buy or play button, the browser would still fire
        // a click on it — swallow that one click so scrubbing never opens
        // checkout or starts audio by accident.
        suppressClickOn = scrub.el;
        setTimeout(() => { suppressClickOn = null; }, 0);
      }
      scrub = null;
    }

    function addBeat(beat, el) {
      const ring = rings.find((r) => r.id === beat.genre);
      if (!ring) return;

      el.addEventListener('pointerdown', (e) => {
        // stopPropagation keeps this press from also orbiting the camera.
        e.stopPropagation();
        engage();
        if (scrub) return;
        scrub = { ring, pointerId: e.pointerId, startX: e.clientX, startAngle: ring.angle, moved: 0, el };
        ring.paused = true;
      });
      el.addEventListener('click', (e) => {
        if (suppressClickOn === el) {
          e.stopPropagation();
          e.preventDefault();
          suppressClickOn = null;
        }
      }, true);

      const obj = new THREE.CSS3DObject(el);
      // Hide/show through obj.visible: CSS3DRenderer rewrites each card's
      // style.display from it on every frame, so setting display directly
      // gets undone (that's why the old genre pills never hid any cards).
      obj.visible = activeFilter === 'all' || activeFilter === ring.id;
      cardScene.add(obj);
      const tiltZ = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8) * (Math.PI / 180);
      ring.cards.push({ obj, beat, angleOffset: 0, tiltZ, cssWidth: 0 });
    }

    // Called once every beat is added: space each ring's cards evenly.
    function finishLoading() {
      rings.forEach((ring) => {
        const n = ring.cards.length;
        ring.cards.forEach((card, i) => { card.angleOffset = (i / n) * Math.PI * 2; });
      });
      needsScale = true;
    }

    // Card size in the scene. A crowded ring shrinks its cards so they
    // don't overlap. cssWidth is measured from the real element (210px on
    // desktop, 150px on phones per styles.css) once it's on the page.
    function applyCardScales() {
      const target = cardWorldWidth();
      rings.forEach((ring) => {
        const n = ring.cards.length;
        if (!n) return;
        const fit = Math.min(1, (2 * Math.PI * ring.radius) / (n * target * 1.25));
        ring.cards.forEach((c) => {
          const measured = c.obj.element.offsetWidth;
          if (measured) c.cssWidth = measured;
          c.obj.scale.setScalar((target * fit) / (c.cssWidth || 210));
        });
      });
    }

    function setFilter(id) {
      activeFilter = id;
      rings.forEach((ring) => {
        const show = id === 'all' || ring.id === id;
        ring.dimTarget = show ? 1 : 0.08;
        ring.cards.forEach(({ obj }) => { obj.visible = show; });
      });
      needsScale = true;
    }

    // ---- Render loop (skipped while the scene is off screen) ----
    let onScreen = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; }).observe(container);
    }

    const clock = new THREE.Clock();
    let elapsed = 0;
    function animate() {
      requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      if (!onScreen || document.hidden) return;
      elapsed += dt;
      updateCamera();

      rings.forEach((ring) => {
        if (!ring.paused) ring.angle += ring.autoSpeed * dt;
        ring.dim += (ring.dimTarget - ring.dim) * Math.min(1, dt * 8); // ~0.3 s fade when a genre pill is picked
        if (ring.glow) {
          // Soundwaves are locked to the ring angle, so they move with the cards (and while scrubbing).
          ring.glow.texture.offset.x = -(ring.angle / (Math.PI * 2)) * WAVE_REPEATS;
          const pulse = 0.85 + 0.15 * Math.sin(elapsed * 1.6 + ring.phase);
          ring.glow.hazeMat.opacity = 0.38 * pulse * ring.dim;
          ring.glow.glowMat.opacity = pulse * ring.dim;
          ring.glow.coreMat.opacity = ring.dim;
        }
        ring.cards.forEach((c) => {
          const a = ring.angle + c.angleOffset;
          c.obj.position.copy(ring.center)
            .addScaledVector(ring.basis.t1, Math.cos(a) * ring.radius)
            .addScaledVector(ring.basis.t2, Math.sin(a) * ring.radius);
          // Face the camera so the buy button is always readable, with the card's small fixed tilt on top.
          c.obj.quaternion.copy(camera.quaternion);
          c.obj.rotateZ(c.tiltZ);
        });
      });

      if (glowRenderer) glowRenderer.render(glowScene, camera);
      cardRenderer.render(cardScene, camera);
      // Cards only exist on the page after their first render, so sizes are measured here.
      if (needsScale) {
        needsScale = false;
        applyCardScales();
      }
    }
    animate();

    function onResize() {
      const next = size();
      if (next.w === width && next.h === height) return;
      width = next.w;
      height = next.h;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      cardRenderer.setSize(width, height);
      if (glowRenderer) glowRenderer.setSize(width, height);
      applyFit();
      needsScale = true;
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(container);

    return { addBeat, finishLoading, setFilter };
  }

  // ===== Cards =====
  // Shared by the rings AND the catalog grid further down the page — one
  // definition of what a card looks like, so the two can't drift apart.
  function buildCloudCard(beat, genreLabel) {
    const genreObj = GENRES.find((g) => g.id === beat.genre);
    const genreColorCss = genreObj ? hexToCss(genreObj.color) : '';

    const el = document.createElement('div');
    el.className = 'cloud-card';
    el.innerHTML = `
      <div class="cloud-card-cover">
        ${beat.coverArtUrl ? `<img src="${beat.coverArtUrl}" alt="">` : ''}
        <span class="cloud-card-genre-badge" style="border-color: ${genreColorCss || 'var(--cloud-accent)'}; color: ${genreColorCss || 'var(--cloud-accent)'};">${genreLabel}</span>
      </div>
      <div class="cloud-card-title">${beat.title}</div>
      <div class="cloud-card-meta">${beat.meta}</div>
      <div class="cloud-card-row">
        <span class="cloud-card-price">$${beat.licenses.mp3}</span>
        <button type="button" class="cloud-card-playbtn beat-play" data-name="${beat.title}" data-audio-url="${beat.audioUrl || ''}" data-genre-color="${genreColorCss}" data-cover-url="${beat.coverArtUrl || ''}" aria-label="Preview"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg></button>
      </div>
      <button type="button" class="cloud-card-buy">Buy beat &rarr;</button>
    `;
    el.querySelector('.cloud-card-buy').addEventListener('click', () => showBeatInfo(beat));
    const cardPlayBtn = el.querySelector('.cloud-card-playbtn');
    if (cardPlayBtn && window.qsWireBeatPlayButton) window.qsWireBeatPlayButton(cardPlayBtn);
    return el;
  }

  // ===== Genre filter pills (above the scene) =====
  // Each genre is exactly one ring: the chosen ring stays lit with its
  // cards, the others dim and hide their cards.
  let activeGenreId = 'all';

  function activateGenre(id) {
    document.querySelectorAll('.galaxy-section .pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.genre === id);
    });
    triggerFlash();
    activeGenreId = id;
    if (ringScene) ringScene.setFilter(id);

    const emptyHint = document.getElementById('galaxy-empty-hint');
    if (emptyHint) {
      if (id === 'all') {
        emptyHint.classList.remove('visible');
      } else {
        const genre = GENRES.find((g) => g.id === id);
        const count = BEATS.filter((b) => b.genre === id).length;
        emptyHint.textContent = `No ${genre ? genre.name : id} beats yet — check back soon.`;
        emptyHint.classList.toggle('visible', count === 0);
      }
    }
  }

  document.querySelectorAll('.galaxy-section .pill').forEach((pill) => {
    pill.addEventListener('click', () => activateGenre(pill.dataset.genre));
  });

  // ===== License terms (confirmed terms) =====
  const LICENSE_TERMS = {
    mp3: { name: 'MP3 Lease', streams: '30,000', downloads: '2,000', videos: '1', files: 'a high-quality MP3' },
    wav: { name: 'WAV Lease', streams: '100,000', downloads: '5,000', videos: '2', files: 'MP3 and WAV files' },
    stems: { name: 'Stems Lease', streams: '250,000', downloads: '10,000', videos: '3', files: 'MP3, trackout stems, and WAV files' },
  };

  function buildContractText(beat, tierKey, buyerName, dateStr) {
    const t = LICENSE_TERMS[tierKey];
    return `NON-EXCLUSIVE MUSIC LICENSE AGREEMENT

This Non-Exclusive License Agreement ("Agreement") is entered into as of ${dateStr}, by and between Andre.Wavv ("Licensor") and ${buyerName} ("Licensee").

1. GRANT OF LICENSE
Licensor grants Licensee a non-exclusive, non-transferable, revocable license to use the instrumental composition titled "${beat.title}" ("Beat") under the ${t.name} tier, according to the terms below.

2. RIGHTS GRANTED
Licensee may:
- Record vocals and create one new song ("Licensed Work") using the Beat.
- Distribute and monetize the Licensed Work up to ${t.streams} streams and/or ${t.downloads} downloads.
- Use the Licensed Work in up to ${t.videos} music video(s).
- Perform the Licensed Work publicly, including live performances for profit.
- Use the Licensed Work for monetized YouTube and DSP distribution (Spotify, Apple Music, etc.).

3. RESTRICTIONS
Licensee may not:
- Register the Beat or Licensed Work with any Content ID system or copyright office as their own.
- Sell, sublicense, or transfer rights to any third party.
- Use the Beat for TV, film, commercial ads, or games without additional written permission.
- Claim exclusive rights or remove producer tags/credits.

4. OWNERSHIP
Licensor retains 100% ownership and copyright of the composition and sound recording. Licensee receives only the usage rights stated above.

5. PUBLISHING & ROYALTIES
If the Licensed Work is commercially released, publishing shall be split 50% Writer (Licensee) / 50% Producer (Licensor) unless otherwise agreed in writing. Both parties shall register their respective shares with their PROs. Licensee shall credit the producer as "Produced by Andre.Wavv" in all distributions and metadata.

6. TERM
This license is valid for 2 years from the Effective Date and expires automatically unless renewed. Continued use of the Licensed Work beyond this term requires purchasing a new license at the then-current price.

7. DELIVERY
Upon payment, Licensor shall deliver ${t.files}.

8. TERMINATION
This license terminates automatically upon breach of any condition herein. Licensor reserves the right to revoke the license if these terms are violated.

9. GOVERNING LAW
This Agreement is governed by the laws of the State of Illinois, USA.

By typing your name below and checking the agreement box, you are electronically signing this Agreement.`;
  }

  // ===== Checkout screen =====
  // One full-screen overlay (position:fixed, so nothing inside the scene
  // can clip it): license tiers, preview, and the full contract in its
  // own scroll box directly above the checkout button.
  const panel = document.getElementById('checkout-screen');
  const biGenre = document.getElementById('bi-genre');
  const biTitle = document.getElementById('bi-title');
  const biMeta = document.getElementById('bi-meta');
  const biPlay = document.getElementById('bi-play');
  const biSelectedPrice = document.getElementById('bi-selected-price');
  const closeBtn = document.getElementById('beat-info-close');
  const licenseButtons = document.querySelectorAll('#bi-license-options .license-option');

  const agreementText = document.getElementById('agreement-text');
  const agreementTierLabel = document.getElementById('agreement-tier-label');
  const agreementPriceLabel = document.getElementById('agreement-price-label');
  const agreementNameInput = document.getElementById('agreement-name');
  const agreementCheckbox = document.getElementById('agreement-checkbox');
  const checkoutBuyBtn = document.getElementById('checkout-buy');
  const checkoutBuyLabel = document.getElementById('checkout-buy-label');

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

  // Regenerates the visible contract for the selected tier — price and
  // terms differ per tier, and the contract is always on screen.
  function refreshAgreementText() {
    if (!currentPanelBeat) return;
    const t = LICENSE_TERMS[selectedTier];
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (agreementTierLabel) agreementTierLabel.textContent = t.name;
    if (agreementPriceLabel) agreementPriceLabel.textContent = formatPrice(currentPanelBeat.licenses[selectedTier]);
    if (agreementText) agreementText.textContent = buildContractText(currentPanelBeat, selectedTier, '_________________', today);
  }

  function updateCheckoutButtonState() {
    if (!checkoutBuyBtn) return;
    const nameOk = agreementNameInput && agreementNameInput.value.trim().length > 1;
    const checkOk = agreementCheckbox && agreementCheckbox.checked;
    checkoutBuyBtn.disabled = !(nameOk && checkOk);
  }
  if (agreementNameInput) agreementNameInput.addEventListener('input', updateCheckoutButtonState);
  if (agreementCheckbox) agreementCheckbox.addEventListener('change', updateCheckoutButtonState);

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
      biPlay.dataset.genreColor = genre ? hexToCss(genre.color) : '';
      biPlay.dataset.coverUrl = beat.coverArtUrl || '';
    }
    const biWaveform = document.getElementById('bi-waveform');
    if (biWaveform && window.qsDrawWaveform) {
      window.qsDrawWaveform(biWaveform, beat.audioUrl);
    }

    licenseButtons.forEach((btn) => {
      const tier = btn.dataset.tier;
      btn.classList.toggle('active', tier === selectedTier);
      const priceEl = btn.querySelector('.license-price');
      if (priceEl) priceEl.textContent = formatPrice(beat.licenses[tier]);
    });
    updateSelectedPrice();

    if (agreementNameInput) agreementNameInput.value = '';
    if (agreementCheckbox) agreementCheckbox.checked = false;
    refreshAgreementText();
    updateCheckoutButtonState();

    if (panel) panel.classList.add('visible');
    refreshLikeAndFavoriteUI(beat);
  }

  function closeCheckoutScreen() {
    if (panel) panel.classList.remove('visible');
  }

  const biLikeBtn = document.getElementById('bi-like');
  const biLikeCount = document.getElementById('bi-like-count');
  const biFavoriteBtn = document.getElementById('bi-favorite');
  const biAddPlaylistBtn = document.getElementById('bi-add-playlist');

  async function refreshLikeAndFavoriteUI(beat) {
    if (!window.qsLibrary || !beat.id) return;
    const { count, likedByMe } = await window.qsLibrary.getLikeState(beat.id);
    if (biLikeCount) biLikeCount.textContent = count;
    if (biLikeBtn) biLikeBtn.classList.toggle('active', likedByMe);
    if (biLikeBtn) biLikeBtn.dataset.liked = likedByMe ? 'true' : 'false';

    const favorited = await window.qsLibrary.isFavorited(beat.id);
    if (biFavoriteBtn) biFavoriteBtn.checked = favorited;
  }

  if (biLikeBtn) {
    biLikeBtn.addEventListener('click', async () => {
      if (!currentPanelBeat || !currentPanelBeat.id || !window.qsLibrary) return;
      const currentlyLiked = biLikeBtn.dataset.liked === 'true';
      const result = await window.qsLibrary.toggleLike(currentPanelBeat.id, currentlyLiked);
      if (result) {
        biLikeCount.textContent = result.count;
        biLikeBtn.classList.toggle('active', result.likedByMe);
        biLikeBtn.dataset.liked = result.likedByMe ? 'true' : 'false';
      }
    });
  }
  if (biFavoriteBtn) {
    biFavoriteBtn.addEventListener('change', async () => {
      if (!currentPanelBeat || !currentPanelBeat.id || !window.qsLibrary) return;
      const wantsFavorited = biFavoriteBtn.checked;
      const currentlyFavorited = !wantsFavorited;
      const nowFavorited = await window.qsLibrary.toggleFavorite(currentPanelBeat.id, currentlyFavorited);
      biFavoriteBtn.checked = nowFavorited;
    });
  }
  if (biAddPlaylistBtn) {
    biAddPlaylistBtn.addEventListener('click', () => {
      if (!currentPanelBeat || !currentPanelBeat.id || !window.qsLibrary) return;
      window.qsLibrary.addBeatToPlaylist(currentPanelBeat.id);
    });
  }

  licenseButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTier = btn.dataset.tier;
      licenseButtons.forEach((b) => b.classList.toggle('active', b === btn));
      updateSelectedPrice();
      refreshAgreementText();
    });
  });

  const biExclusive = document.getElementById('bi-exclusive-inquire');
  if (biExclusive) {
    biExclusive.addEventListener('click', (e) => {
      e.preventDefault();
      if (!currentPanelBeat) return;
      const subject = encodeURIComponent(`Exclusive inquiry — ${currentPanelBeat.title}`);
      const body = encodeURIComponent(`Hi Andre,\n\nI'm interested in exclusive rights for "${currentPanelBeat.title}". Let's talk terms.\n\n`);
      window.location.href = `mailto:andre.wavbusiness@gmail.com?subject=${subject}&body=${body}`;
    });
  }
  const biExclusiveCopy = document.getElementById('bi-exclusive-copy');
  if (biExclusiveCopy) {
    biExclusiveCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('andre.wavbusiness@gmail.com');
        const original = biExclusiveCopy.textContent;
        biExclusiveCopy.textContent = 'Copied!';
        setTimeout(() => { biExclusiveCopy.textContent = original; }, 2000);
      } catch (e) {
        // Clipboard can fail (older browser, permissions) — the email is visible as text either way.
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeCheckoutScreen);

  if (checkoutBuyBtn) {
    checkoutBuyBtn.addEventListener('click', async () => {
      if (checkoutBuyBtn.disabled || !currentPanelBeat) return;
      const fullName = agreementNameInput.value.trim();
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      if (!window.qsClient) {
        alert('Something went wrong loading the checkout system — please refresh and try again.');
        return;
      }
      const { data: sessionData } = await window.qsClient.auth.getSession();
      if (!sessionData || !sessionData.session) {
        alert('Please sign in first — checkout requires an account so you can access your license and receive renewal reminders.');
        closeCheckoutScreen();
        const trigger = document.querySelector('[data-open-auth]');
        if (trigger) trigger.click();
        return;
      }
      const buyerId = sessionData.session.user.id;

      // IP is part of the signature record. Client-side JS can't read the
      // visitor's public IP directly, so this asks a public lookup
      // service; if that fails, the agreement still goes ahead.
      let ip = 'unavailable';
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        if (data && data.ip) ip = data.ip;
      } catch (e) {
        // proceed without it
      }

      checkoutBuyBtn.disabled = true;
      if (checkoutBuyLabel) checkoutBuyLabel.textContent = 'Redirecting...';

      const { data: order, error: orderError } = await window.qsClient
        .from('orders')
        .insert({
          buyer_id: buyerId,
          beat_id: currentPanelBeat.id,
          license_type: selectedTier,
          price_paid: currentPanelBeat.licenses[selectedTier],
          status: 'pending',
          agreed_full_name: fullName,
          agreed_at: new Date().toISOString(),
          agreed_ip: ip,
          license_agreement_snapshot: buildContractText(currentPanelBeat, selectedTier, fullName, today),
        })
        .select()
        .single();

      if (orderError || !order) {
        checkoutBuyBtn.disabled = false;
        if (checkoutBuyLabel) checkoutBuyLabel.textContent = 'Confirm & Checkout';
        alert(`Something went wrong creating your order: ${orderError ? orderError.message : 'unknown error'}. Please try again.`);
        return;
      }

      const { data: checkoutData, error: checkoutError } = await window.qsClient.functions.invoke('create-checkout-session', {
        body: { order_id: order.id },
      });

      if (checkoutError || !checkoutData || !checkoutData.url) {
        checkoutBuyBtn.disabled = false;
        if (checkoutBuyLabel) checkoutBuyLabel.textContent = 'Confirm & Checkout';
        alert(`Something went wrong starting checkout: ${checkoutError ? checkoutError.message : 'no checkout URL returned'}. Please try again.`);
        return;
      }

      closeCheckoutScreen();
      window.location.href = checkoutData.url;
    });
  }

  // ===== Real beats data from Supabase =====
  async function loadBeatsFromSupabase() {
    const simpleGridEl = document.getElementById('simple-grid');
    if (!window.qsClient) {
      console.error('Supabase client not available — check supabase-client.js loaded correctly.');
      if (simpleGridEl) simpleGridEl.innerHTML = '<p class="meta">Beats couldn\'t load right now — please refresh the page.</p>';
      return;
    }
    const { data, error } = await window.qsClient.from('beats').select('*');
    if (error) {
      console.error('Failed to load beats from Supabase:', error.message);
      if (simpleGridEl) simpleGridEl.innerHTML = '<p class="meta">Beats couldn\'t load right now — please refresh the page.</p>';
      return;
    }
    (data || []).forEach((row) => {
      if (!row.title || !GENRES.some((g) => g.id === row.genre)) return; // skip rows with an unrecognized genre slug rather than crash
      const beat = {
        id: row.id,
        genre: row.genre,
        title: row.title,
        meta: `${row.bpm || '—'} BPM · ${row.key || '—'}`,
        licenses: {
          mp3: Number(row.mp3_price),
          wav: Number(row.wav_price),
          stems: Number(row.stems_price),
        },
        audioUrl: row.audio_file_url || '',
        coverArtUrl: row.cover_art_url || '',
      };
      BEATS.push(beat);
      if (ringScene) {
        const genre = GENRES.find((g) => g.id === beat.genre);
        ringScene.addBeat(beat, buildCloudCard(beat, genre.name));
      }
    });
    if (ringScene) ringScene.finishLoading();
    if (activeGenreId !== 'all') activateGenre(activeGenreId); // a pill clicked before loading finished: refresh its empty-ring hint

    // Catalog grid — filter tabs over ONE result area (the BeatStars
    // pattern: click a genre, the same grid swaps to just those beats).
    const filterTabsEl = document.getElementById('catalog-filter-tabs');
    let activeCatalogFilter = 'all';

    function renderCatalogGrid() {
      if (!simpleGridEl) return;
      const filtered = activeCatalogFilter === 'all'
        ? BEATS
        : BEATS.filter((b) => b.genre === activeCatalogFilter);
      if (!filtered.length) {
        simpleGridEl.innerHTML = '<p class="meta">No beats in this genre yet — check back soon.</p>';
        return;
      }
      simpleGridEl.innerHTML = '';
      filtered.forEach((beat) => {
        const genreObj = GENRES.find((g) => g.id === beat.genre);
        simpleGridEl.appendChild(buildCloudCard(beat, genreObj ? genreObj.name : beat.genre));
      });
    }

    if (filterTabsEl) {
      if (!BEATS.length) {
        filterTabsEl.style.display = 'none';
        if (simpleGridEl) simpleGridEl.innerHTML = '<p class="meta">No beats in the catalog yet — check back soon.</p>';
      } else {
        const presentGenreIds = new Set(BEATS.map((b) => b.genre));
        const tabs = [{ id: 'all', name: 'All' }, ...GENRES.filter((g) => presentGenreIds.has(g.id))];
        filterTabsEl.innerHTML = tabs.map((t) =>
          `<button type="button" class="catalog-filter-tab${t.id === 'all' ? ' active' : ''}" data-genre="${t.id}">${t.name}</button>`
        ).join('');
        filterTabsEl.querySelectorAll('.catalog-filter-tab').forEach((tab) => {
          tab.addEventListener('click', () => {
            activeCatalogFilter = tab.dataset.genre;
            filterTabsEl.querySelectorAll('.catalog-filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
            renderCatalogGrid();
          });
        });
        renderCatalogGrid();
      }
    }
    // script.js (a separate file) drives the floating player's
    // prev/next/shuffle and needs a flat list of the loaded beats.
    window.qsBeatsQueue = BEATS.map((b) => {
      const g = GENRES.find((genre) => genre.id === b.genre);
      return {
        name: b.title,
        audioUrl: b.audioUrl,
        coverUrl: b.coverArtUrl,
        genreColor: g ? hexToCss(g.color) : '',
      };
    });

    // The page just got taller — Lenis measured it once at startup and
    // has to re-measure, or it won't scroll all the way to the bottom.
    if (window.qsLenisResize) window.qsLenisResize();
  }
  loadBeatsFromSupabase();
})();

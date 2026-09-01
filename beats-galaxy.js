// ===== Beats Cloud Scene =====
// Replaces the galaxy/planets/starfield theme with a cinematic cloud
// scene, per the reskin — the underlying reason was usability, not
// aesthetics: clicking a small orbiting 3D planet to reach the buy
// button was unreliable. Beats are now CSS3DObjects (real DOM
// elements, positioned in 3D space) instead of raycasted WebGL meshes,
// so the buy button is a genuine clickable <button> at all times.
//
// The free camera drag/zoom/orbit feel carries over completely
// unchanged from the galaxy — same custom damped-zoom and damped-
// rotation physics, same tuning. Only the visual theme and the beat
// representation changed.
//
// Day/night theming: two looping cloud videos crossfade based on
// data-theme on .galaxy-wrap, driven by local hour on load and
// overridable via the dock's sun/moon toggle (persisted to
// localStorage). See initTheme() below.
(function () {
  if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined' || typeof THREE.CSS3DRenderer === 'undefined') return;

  const container = document.getElementById('galaxy-viewport');
  const flashEl = document.getElementById('galaxy-flash');
  if (!container) return;

  // ===== Day/night theme =====
  const sceneWrap = document.getElementById('cloud-scene-wrap');
  const THEME_STORAGE_KEY = 'qs-theme';

  function setTheme(theme) {
    if (sceneWrap) sceneWrap.dataset.theme = theme;
    document.documentElement.dataset.siteTheme = theme;
  }

  function initTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
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
      localStorage.setItem(THEME_STORAGE_KEY, next);
    });
  }

  // A scattering of small stars above the cloud line, per spec —
  // night theme only (controlled by CSS opacity on the container based
  // on data-theme, this just needs to exist once).
  const starsContainer = document.getElementById('cloud-stars');
  if (starsContainer) {
    for (let i = 0; i < 60; i++) {
      const star = document.createElement('div');
      star.className = 'cloud-star';
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 45}%`; // upper portion only — "above the cloud line"
      star.style.opacity = String(0.3 + Math.random() * 0.6);
      starsContainer.appendChild(star);
    }
  }

  const GENRES = [
    { id: 'trap', name: 'Trap', color: 0xff6b6b, pos: [-70, 15, -20] },
    { id: 'rnb', name: 'R&B', color: 0x9d5cff, pos: [65, -10, -40] },
    { id: 'indie-pop', name: 'Indie Pop', color: 0x6bffb8, pos: [-20, -40, 55] },
    { id: '2000s-swag', name: "2000's Swag", color: 0xffe66b, pos: [45, 45, 30] },
    { id: 'cinematic', name: 'Cinematic', color: 0x6b9bff, pos: [5, 5, -85] },
    { id: 'house', name: 'House', color: 0xff6bd6, pos: [-50, -50, -35] },
    { id: 'synthwave', name: 'Synthwave', color: 0x00e5ff, pos: [85, -40, 45] },
  ];

  // Demo beats — 2 per genre. Admin-uploaded beats (via admin.html) are
  // layered in asynchronously further down, once their audio is resolved.
  // Populated asynchronously from Supabase (loadBeatsFromSupabase, below)
  // — no more hardcoded demo tracks. Until real beats exist in the
  // `beats` table, genres will correctly show zero planets rather than
  // fake placeholder data a real visitor could be confused by.
  let BEATS = [];

  let width = container.clientWidth || 800;
  let height = container.clientHeight || 620;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
  camera.position.set(0, 220, 900);

  // CSS3DRenderer — renders real DOM elements positioned in 3D space,
  // not WebGL meshes. This is the actual fix for "the buy button was
  // unreliable to click": a genuine <button> in the DOM always receives
  // real clicks, no raycast hit-testing against a 3D hitbox involved.
  // No scene lighting needed — CSS3DObjects aren't affected by
  // Three.js lights at all, they're just transformed HTML.
  const renderer = new THREE.CSS3DRenderer();
  renderer.setSize(width, height);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 60;
  controls.maxDistance = 1300;
  controls.target.set(0, 0, 0);

  // Custom damped zoom (OrbitControls' own wheel-zoom applies each tick
  // instantly with no glide, unlike its drag damping) — this is the ONE
  // scroll system, used identically whether in overview or focused on a
  // genre. No separate "tunnel scroll."
  controls.enableZoom = false;
  let zoomVelocity = 0;
  const ZOOM_FRICTION = 0.90;
  const MAX_ZOOM_VELOCITY = 8;

  // Rotation is fully custom too now, not OrbitControls' own drag
  // handling — OrbitControls' internal polar-angle clamp is a hard
  // stop with no easing at all (pulling the range in from the exact
  // poles didn't fix the "wall" feeling, it only moved where the wall
  // was). This mirrors the zoom fix's architecture exactly: accumulate
  // velocity from input, decay it every frame, and soften it near the
  // limits instead of hard-clamping.
  controls.enableRotate = false;
  const MIN_POLAR = 0.06;
  const MAX_POLAR = Math.PI - 0.06;
  const ROT_SENSITIVITY = 0.0035;
  const ROT_FRICTION = 0.90;
  const MAX_ROT_VELOCITY = 0.3;
  let rotVelocityTheta = 0;
  let rotVelocityPhi = 0;
  let isRotDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    isRotDragging = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (!isRotDragging) return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    rotVelocityTheta = Math.max(-MAX_ROT_VELOCITY, Math.min(MAX_ROT_VELOCITY, rotVelocityTheta - dx * ROT_SENSITIVITY));
    rotVelocityPhi = Math.max(-MAX_ROT_VELOCITY, Math.min(MAX_ROT_VELOCITY, rotVelocityPhi - dy * ROT_SENSITIVITY));
  });
  window.addEventListener('pointerup', () => { isRotDragging = false; });

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
    zoomVelocity = Math.max(-MAX_ZOOM_VELOCITY, Math.min(MAX_ZOOM_VELOCITY, zoomVelocity));
  }, { passive: false });

  function hexToCss(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  function triggerFlash() {
    if (!flashEl) return;
    flashEl.classList.remove('active');
    void flashEl.offsetWidth;
    flashEl.classList.add('active');
  }

  // ===== Cards (CSS3DObject wrapping real DOM elements) =====
  // ===== Genre rings =====
  // Not a scattered field to fly through anymore — one contained
  // composition of rings, one per genre, cycling through three fixed
  // orientations (horizontal/vertical/diagonal) for visual variety.
  // Each ring auto-rotates on its own axis; pressing and holding on any
  // card in a ring pauses that ring and lets you scrub it left/right to
  // find a specific beat, without affecting the other rings or the
  // overall camera. The free camera drag (rotate the whole view) still
  // works exactly as before — see the stopPropagation() call below for
  // how the two interactions stay independent of each other.
  const RING_ORIENTATIONS = ['horizontal', 'vertical', 'diagonal'];
  const RING_TILT = Math.PI / 4;
  const RING_LAYOUT_RADIUS = 150;

  const rings = GENRES.map((genre, i) => {
    const orientation = RING_ORIENTATIONS[i % RING_ORIENTATIONS.length];
    const layoutAngle = (i / GENRES.length) * Math.PI * 2;
    return {
      id: genre.id,
      name: genre.name,
      orientation,
      center: {
        x: Math.cos(layoutAngle) * RING_LAYOUT_RADIUS,
        y: (i % 2 === 0 ? 1 : -1) * 12, // slight height stagger so rings read as distinct, not stacked flat
        z: Math.sin(layoutAngle) * RING_LAYOUT_RADIUS,
      },
      radius: 45,
      angle: Math.random() * Math.PI * 2, // staggered starting position — avoids every ring looking synchronized
      autoSpeed: 0.05 + Math.random() * 0.035,
      paused: false,
      cards: [], // { obj, beat, angleOffset, tiltZ }
    };
  });

  function ringLocalOffset(ring, angleOffset) {
    const a = ring.angle + angleOffset;
    if (ring.orientation === 'horizontal') {
      return { x: Math.cos(a) * ring.radius, y: 0, z: Math.sin(a) * ring.radius };
    }
    if (ring.orientation === 'vertical') {
      return { x: Math.cos(a) * ring.radius, y: Math.sin(a) * ring.radius, z: 0 };
    }
    // diagonal — same parametric circle as vertical, with the plane
    // itself tilted 45 degrees toward the Z axis
    return {
      x: Math.cos(a) * ring.radius,
      y: Math.sin(a) * ring.radius * Math.cos(RING_TILT),
      z: Math.sin(a) * ring.radius * Math.sin(RING_TILT),
    };
  }

  // Pause+scrub state — global (not per-ring) since only one ring can
  // be actively dragged at a time.
  let activeDragRing = null;
  let ringDragStartX = 0;
  let ringDragStartAngle = 0;

  // Shared by both the rings AND the simple grid section further down
  // the page — one definition of what a card looks like, so there's no
  // risk of the two silently diverging over time.
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

  function addCardForBeat(beat, ring) {
    const el = buildCloudCard(beat, ring.name);

    // Ring pause+scrub — stopPropagation prevents this same pointerdown
    // from also bubbling up to the renderer.domElement listener that
    // drives the free camera drag, so pressing on a card scrubs its
    // ring instead of also spinning the whole scene at the same time.
    // engage() is called directly here (not relying on that same
    // bubbling) so the "click to engage" hint and zoom still activate
    // correctly even if someone's very first click lands on a card
    // rather than empty space.
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      engage();
      activeDragRing = ring;
      ring.paused = true;
      ringDragStartX = e.clientX;
      ringDragStartAngle = ring.angle;
    });

    const obj = new THREE.CSS3DObject(el);
    obj.scale.setScalar(0.2); // still reported as far too large at 0.48 — going significantly smaller this time rather than incrementing again
    scene.add(obj);

    const tiltZ = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8) * (Math.PI / 180);
    ring.cards.push({ obj, beat, angleOffset: 0, tiltZ });
    return obj;
  }

  window.addEventListener('pointermove', (e) => {
    if (!activeDragRing) return;
    const dx = e.clientX - ringDragStartX;
    activeDragRing.angle = ringDragStartAngle + dx * 0.012;
  });
  window.addEventListener('pointerup', () => {
    // Deliberately stays paused wherever it's released, per spec — the
    // whole point of scrubbing is landing on a specific beat, and
    // resuming auto-rotation immediately would undo that.
    activeDragRing = null;
  });

  // ===== Genre filtering =====
  // Each genre already maps to exactly one ring, so filtering is just
  // showing/hiding whole rings — no separate lookup needed.
  let activeGenreId = 'all';

  function activateGenre(id) {
    document.querySelectorAll('.galaxy-section .pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.genre === id);
    });
    triggerFlash();
    activeGenreId = id;

    rings.forEach((ring) => {
      const show = id === 'all' || ring.id === id;
      ring.cards.forEach(({ obj }) => { obj.element.style.display = show ? '' : 'none'; });
    });

    const emptyHint = document.getElementById('galaxy-empty-hint');
    if (emptyHint) {
      if (id === 'all') {
        emptyHint.classList.remove('visible');
      } else {
        const ring = rings.find((r) => r.id === id);
        emptyHint.textContent = `No ${ring ? ring.name : id} beats in the catalog yet — check back soon.`;
        emptyHint.classList.toggle('visible', !ring || ring.cards.length === 0);
      }
    }
  }

  document.querySelectorAll('.galaxy-section .pill').forEach((pill) => {
    pill.addEventListener('click', () => activateGenre(pill.dataset.genre));
  });

  // No raycasting/click-handling section needed here anymore — the buy
  // and play buttons are real DOM <button> elements created above, each
  // with its own addEventListener, exactly like any other button on the
  // site. That's the entire point of switching to CSS3DObject: normal
  // DOM events instead of a raycast hit-test against a 3D hitbox.

  // ===== License terms (confirmed terms — see chat for the full negotiation) =====
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
  // One unified full-screen overlay now, not a sidebar panel plus a
  // separate agreement modal — the contract is visible on the same
  // screen, in its own scrollbox, directly above the checkout button.
  // This also directly fixes the earlier bug: the old sidebar was
  // position:absolute inside .galaxy-wrap's overflow:hidden box, and
  // had grown too tall for it — the real buy button was very likely
  // being clipped out of reach while the visually-identical
  // exclusive-inquire button (same .btn.solid styling) remained
  // reachable and absorbed the click instead.
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

  // Regenerates the visible contract text for whichever tier is
  // currently selected — called both when the screen first opens and
  // whenever the visitor switches tiers, since price/terms differ per
  // tier and the contract is always visible now, not generated once
  // behind a separate "open agreement" click.
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
      refreshAgreementText(); // price/terms differ per tier — regenerate since the contract is always visible now
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
        // Clipboard API can fail (older browser, permissions) — the
        // email is already visible as plain text either way.
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

      // IP is part of the signature record we agreed on. Client-side JS
      // has no direct way to read the visitor's public IP — this calls a
      // public lookup service for it, same technique most sites use for
      // this. If it fails (network blocked, offline, etc.) we still let
      // the agreement proceed rather than block a sale over it.
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
    if (!window.qsClient) {
      console.error('Supabase client not available — check supabase-client.js loaded correctly.');
      return;
    }
    const { data, error } = await window.qsClient.from('beats').select('*');
    if (error) {
      console.error('Failed to load beats from Supabase:', error.message);
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
      const ring = rings.find((r) => r.id === beat.genre);
      if (ring) addCardForBeat(beat, ring);
    });
    // Now that every ring's real card count is known, size each ring
    // to fit its cards comfortably and space them evenly around it —
    // during the loop above every card was pushed with angleOffset 0,
    // since the final count per ring wasn't known yet.
    rings.forEach((ring) => {
      if (!ring.cards.length) return;
      ring.radius = Math.max(40, Math.min(115, 25 + ring.cards.length * 15));
      ring.cards.forEach((card, i) => {
        card.angleOffset = (i / ring.cards.length) * Math.PI * 2;
      });
    });

    // Simple grid section — filter tabs over ONE result area (the
    // actual BeatStars pattern: click a genre, the same grid swaps to
    // show only those beats), not separate stacked sections per genre.
    const filterTabsEl = document.getElementById('catalog-filter-tabs');
    const simpleGridEl = document.getElementById('simple-grid');
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
    // script.js (a separate closure) drives the floating player's
    // prev/next/shuffle controls and needs a flat, navigable list —
    // it can't reach into this IIFE's own BEATS array directly.
    window.qsBeatsQueue = BEATS.map((b) => {
      const g = GENRES.find((genre) => genre.id === b.genre);
      return {
        name: b.title,
        audioUrl: b.audioUrl,
        coverUrl: b.coverArtUrl,
        genreColor: g ? hexToCss(g.color) : '',
      };
    });

    // This content just changed the page's real scrollable height —
    // Lenis measured it once at init, before any of this existed, and
    // has no way to know it needs to re-measure on its own.
    if (window.qsLenisResize) window.qsLenisResize();
  }
  loadBeatsFromSupabase();

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

      // Soft cushion near both limits instead of a hard clamp — the old
      // version let velocity keep existing even after distance was
      // clamped, so it felt like slamming into a wall with leftover
      // momentum going nowhere. This scales the applied velocity down
      // smoothly as distance approaches either limit.
      const CUSHION = 70; // NOT 9 — simulated that value and it reintroduced the wall (~117ms to hit the limit, no visible easing). 70 gives ~700ms of real deceleration at velocity=8.
      let applied = zoomVelocity;
      if (zoomVelocity < 0 && dist - controls.minDistance < CUSHION) {
        applied *= Math.max(0, (dist - controls.minDistance) / CUSHION);
      } else if (zoomVelocity > 0 && controls.maxDistance - dist < CUSHION) {
        applied *= Math.max(0, (controls.maxDistance - dist) / CUSHION);
      }

      const newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, dist + applied));
      offset.setLength(newDist);
      camera.position.copy(controls.target).add(offset);
      zoomVelocity *= ZOOM_FRICTION;
      if (newDist <= controls.minDistance || newDist >= controls.maxDistance) {
        zoomVelocity *= 0.5; // extra bleed-off right at the limit so it settles instead of feeling stuck
      }
    } else {
      zoomVelocity = 0;
    }

    if (Math.abs(rotVelocityTheta) > 0.00005 || Math.abs(rotVelocityPhi) > 0.00005) {
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);

      spherical.theta += rotVelocityTheta;

      // Same soft-cushion idea as zoom: ease the applied velocity down
      // as the polar angle approaches either limit, instead of a hard
      // clamp with no easing at all (which is what OrbitControls' own
      // built-in polar limit does, and why moving that limit's exact
      // position didn't fix the "wall" feeling before).
      const POLAR_CUSHION = 0.6;
      let appliedPhi = rotVelocityPhi;
      if (rotVelocityPhi < 0 && spherical.phi - MIN_POLAR < POLAR_CUSHION) {
        appliedPhi *= Math.max(0, (spherical.phi - MIN_POLAR) / POLAR_CUSHION);
      } else if (rotVelocityPhi > 0 && MAX_POLAR - spherical.phi < POLAR_CUSHION) {
        appliedPhi *= Math.max(0, (MAX_POLAR - spherical.phi) / POLAR_CUSHION);
      }
      spherical.phi = Math.max(MIN_POLAR, Math.min(MAX_POLAR, spherical.phi + appliedPhi));

      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);

      rotVelocityTheta *= ROT_FRICTION;
      rotVelocityPhi *= ROT_FRICTION;
      if (spherical.phi <= MIN_POLAR || spherical.phi >= MAX_POLAR) {
        rotVelocityPhi *= 0.5; // extra bleed-off right at the limit, same as zoom
      }
    } else {
      rotVelocityTheta = 0;
      rotVelocityPhi = 0;
    }

    controls.update();

    // Advance each ring's rotation (unless paused mid-scrub), then
    // reposition its cards along the ring and billboard each toward
    // the camera with its fixed tilt applied on top — this is what
    // keeps the buy button facing the viewer regardless of the ring's
    // rotation or how the camera's been dragged around. Vertical float
    // drift is handled by the .cloud-card CSS animation directly on
    // the real DOM element, not here.
    rings.forEach((ring) => {
      if (!ring.paused) {
        ring.angle += ring.autoSpeed * delta;
      }
      ring.cards.forEach(({ obj, angleOffset, tiltZ }) => {
        const local = ringLocalOffset(ring, angleOffset);
        obj.position.set(ring.center.x + local.x, ring.center.y + local.y, ring.center.z + local.z);
        obj.quaternion.copy(camera.quaternion);
        obj.rotateZ(tiltZ);
      });
    });

    renderer.render(scene, camera);
  }
  animate();
})();

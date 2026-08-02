// ===== Sine-wave ticker (Home + Mixing/Mastering pages) =====
// A real traveling wave: y depends on BOTH position (x) and time (t) in a
// single sine term, y = BASE_Y + AMPLITUDE*sin(k*x + ω*t) — the same
// equation that describes an actual water wave, rebuilt every animation
// frame. The words ride an invisible copy of that same live curve via
// <textPath>, with their position along it (startOffset) advancing at the
// SAME speed as the wave — so both move together, not independently.
//
// Loop correctness: startOffset is wrapped with modulo against
// oneRepeatLen — the EXACT measured length of one pass through the word
// list (via getComputedTextLength, not an estimate). Since the text
// content is that exact string repeated verbatim with no forced
// stretching, wrapping by that exact length is a mathematically perfect
// loop: the content at the wrap point is byte-for-byte identical to the
// start, so there is no seam to be seen, regardless of speed.
const PERIOD = 180; // px, spatial wavelength
const AMPLITUDE = 28; // px, true vertical peak
const BASE_Y = 70; // px, centerline of the wave within the SVG
const SVG_HEIGHT = 150;
const SPEED = 26; // px/second — deliberately slow; 70 read as "too fast" last time
const SEPARATOR = '   ◆   ';
const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT_RAISE = 16; // px, how far above the curve the words sit
const K = (2 * Math.PI) / PERIOD;
const OMEGA = K * SPEED; // temporal frequency, chosen so phase velocity = SPEED

function buildWaveD(width, baseY, t) {
  let d = '';
  const step = 8;
  for (let x = 0; x <= width; x += step) {
    const y = baseY + AMPLITUDE * Math.sin(K * x + OMEGA * t);
    d += (x === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  return d;
}

// Tracks each ticker's last-built width and a "generation" counter, so a
// spurious resize (e.g. a mobile browser's address bar collapsing on
// scroll) doesn't tear down and restart an otherwise-unaffected ticker,
// and a genuine rebuild cleanly cancels its predecessor's animation loop
// (avoiding two competing rAF loops running on the same ticker at once).
const tickerWidths = new WeakMap();
const tickerGenerations = new WeakMap();

function initTicker(tickerEl) {
  const words = (tickerEl.dataset.words || '').split(',').map((w) => w.trim().toUpperCase()).filter(Boolean);
  if (!words.length) return;

  const width = tickerEl.clientWidth || 600;
  const prevWidth = tickerWidths.get(tickerEl);
  if (prevWidth !== undefined && Math.abs(prevWidth - width) < 24) {
    return; // width barely changed — not worth tearing down and restarting
  }
  tickerWidths.set(tickerEl, width);

  const generation = (tickerGenerations.get(tickerEl) || 0) + 1;
  tickerGenerations.set(tickerEl, generation);

  const uid = Math.random().toString(36).slice(2);

  tickerEl.innerHTML = '';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ticker-svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', SVG_HEIGHT);
  svg.setAttribute('viewBox', `0 0 ${width} ${SVG_HEIGHT}`);

  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', `waveGrad-${uid}`);
  grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
  grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '0%');
  const stop1 = document.createElementNS(SVG_NS, 'stop');
  stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', '#6C8CFF');
  const stop2 = document.createElementNS(SVG_NS, 'stop');
  stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', '#B885FF');
  grad.appendChild(stop1); grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', buildWaveD(width, BASE_Y, 0));
  path.setAttribute('stroke', `url(#waveGrad-${uid})`);
  path.setAttribute('stroke-width', '5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);

  const guidePath = document.createElementNS(SVG_NS, 'path');
  const guideId = `waveGuide-${uid}`;
  guidePath.setAttribute('id', guideId);
  guidePath.setAttribute('d', buildWaveD(width, BASE_Y - TEXT_RAISE, 0));
  guidePath.setAttribute('fill', 'none');
  guidePath.setAttribute('stroke', 'none');
  svg.appendChild(guidePath);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'wave-text');
  const textPath = document.createElementNS(SVG_NS, 'textPath');
  textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${guideId}`);
  textPath.setAttribute('href', `#${guideId}`);
  const joined = words.join(SEPARATOR) + SEPARATOR;
  textPath.textContent = joined; // temporary, just to measure one repeat's length
  text.appendChild(textPath);
  svg.appendChild(text);
  tickerEl.appendChild(svg);

  let oneRepeatLen = textPath.getComputedTextLength();
  if (!oneRepeatLen || !isFinite(oneRepeatLen) || oneRepeatLen <= 0) {
    oneRepeatLen = joined.length * 9; // fallback estimate if measurement fails
  }
  const repeatCount = Math.max(6, Math.ceil((width * 3) / oneRepeatLen));
  textPath.textContent = joined.repeat(repeatCount);

  let start = null;
  function frame(now) {
    if (tickerGenerations.get(tickerEl) !== generation) return; // superseded by a rebuild — stop
    if (start === null) start = now;
    const t = (now - start) / 1000;
    path.setAttribute('d', buildWaveD(width, BASE_Y, t));
    guidePath.setAttribute('d', buildWaveD(width, BASE_Y - TEXT_RAISE, t));
    // Always non-positive (never leaves a blank gap at the path's start),
    // and increases within each cycle so it moves the SAME direction as
    // the wave (verified: both track leftward together).
    const cyclePos = (((t * SPEED) % oneRepeatLen) + oneRepeatLen) % oneRepeatLen;
    const offset = cyclePos - oneRepeatLen;
    textPath.setAttribute('startOffset', offset.toFixed(1));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

let tickerResizeTimeout;
function initAllTickers() {
  document.querySelectorAll('.ticker').forEach(initTicker);
}
initAllTickers();
window.addEventListener('resize', () => {
  clearTimeout(tickerResizeTimeout);
  tickerResizeTimeout = setTimeout(initAllTickers, 250);
});

// Note: genre-pill click handling for the beats page now lives entirely
// in beats-galaxy.js (it flies the 3D camera to that genre's cluster).
// The old flat-grid version used to filter .beat-card elements here, but
// those no longer exist on the page — leaving that logic in would have
// attached a second, redundant click handler to the same .pill buttons.

// ===== Floating player (beats page) =====
// Real playback now (previously cosmetic-only — the "playing" pulse
// animation existed but there was no actual <audio> element anywhere).
// One shared Audio() instance so starting a new preview always properly
// stops whatever was playing before.
const floatingPlayer = document.getElementById('floating-player');
const fpName = document.getElementById('fp-name');
const fpClose = document.getElementById('fp-close');
const fpCover = document.getElementById('fp-cover');
const fpPlayPause = document.getElementById('fp-playpause');
const fpSeekBar = document.getElementById('fp-seek-bar');
const fpSeekFill = document.getElementById('fp-seek-fill');
const fpSeekHandle = document.getElementById('fp-seek-handle');
const fpTimeCurrent = document.getElementById('fp-time-current');
const fpTimeDuration = document.getElementById('fp-time-duration');
const previewAudio = new Audio();
let activePlayBtn = null;
let isSeekDragging = false;

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function stopPreview() {
  previewAudio.pause();
  previewAudio.removeAttribute('src');
  if (activePlayBtn) {
    activePlayBtn.classList.remove('playing');
    activePlayBtn.textContent = '▶';
    activePlayBtn = null;
  }
  if (fpPlayPause) fpPlayPause.textContent = '▶';
  if (fpSeekFill) fpSeekFill.style.width = '0%';
  if (fpSeekHandle) fpSeekHandle.style.left = '0%';
  if (fpTimeCurrent) fpTimeCurrent.textContent = '0:00';
  if (fpTimeDuration) fpTimeDuration.textContent = '0:00';
  if (floatingPlayer) floatingPlayer.classList.remove('visible');
}

previewAudio.addEventListener('ended', stopPreview);

previewAudio.addEventListener('timeupdate', () => {
  if (isSeekDragging || !previewAudio.duration) return;
  const pct = (previewAudio.currentTime / previewAudio.duration) * 100;
  if (fpSeekFill) fpSeekFill.style.width = `${pct}%`;
  if (fpSeekHandle) fpSeekHandle.style.left = `${pct}%`;
  if (fpTimeCurrent) fpTimeCurrent.textContent = formatTime(previewAudio.currentTime);
});

previewAudio.addEventListener('loadedmetadata', () => {
  if (fpTimeDuration) fpTimeDuration.textContent = formatTime(previewAudio.duration);
});

// Seek bar — click to jump, drag to scrub. pointermove/up are attached
// to the document (not just the bar) so dragging still tracks correctly
// even if the pointer moves outside the bar's bounds mid-drag.
function seekToClientX(clientX) {
  if (!fpSeekBar || !previewAudio.duration) return;
  const rect = fpSeekBar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  if (fpSeekFill) fpSeekFill.style.width = `${pct * 100}%`;
  if (fpSeekHandle) fpSeekHandle.style.left = `${pct * 100}%`;
  if (fpTimeCurrent) fpTimeCurrent.textContent = formatTime(pct * previewAudio.duration);
  return pct;
}

if (fpSeekBar) {
  fpSeekBar.addEventListener('pointerdown', (e) => {
    if (!previewAudio.duration) return;
    isSeekDragging = true;
    seekToClientX(e.clientX);
  });
}
document.addEventListener('pointermove', (e) => {
  if (!isSeekDragging) return;
  seekToClientX(e.clientX);
});
document.addEventListener('pointerup', (e) => {
  if (!isSeekDragging) return;
  isSeekDragging = false;
  const pct = seekToClientX(e.clientX);
  if (pct !== undefined && previewAudio.duration) {
    previewAudio.currentTime = pct * previewAudio.duration;
  }
});

function togglePlayPause() {
  if (!previewAudio.src) return;
  if (previewAudio.paused) {
    previewAudio.play().catch(() => {});
    if (fpPlayPause) fpPlayPause.textContent = '❚❚';
    if (activePlayBtn) { activePlayBtn.classList.add('playing'); activePlayBtn.textContent = '❚❚'; }
  } else {
    previewAudio.pause();
    if (fpPlayPause) fpPlayPause.textContent = '▶';
    if (activePlayBtn) { activePlayBtn.classList.remove('playing'); activePlayBtn.textContent = '▶'; }
  }
}
if (fpPlayPause) fpPlayPause.addEventListener('click', togglePlayPause);

document.querySelectorAll('.beat-play').forEach((btn) => {
  btn.addEventListener('click', () => {
    const isThisAlreadyPlaying = btn === activePlayBtn && !previewAudio.paused;
    if (isThisAlreadyPlaying) {
      stopPreview();
      return;
    }

    // dataset is read fresh here (not captured at page load), so this
    // always reflects whichever beat was most recently shown — matters
    // for #bi-play specifically, since beats-galaxy.js updates its
    // audioUrl every time a different beat's panel opens.
    const url = btn.dataset.audioUrl || '';
    if (!url) {
      alert('No audio file is attached yet.');
      return;
    }

    if (activePlayBtn && activePlayBtn !== btn) {
      activePlayBtn.classList.remove('playing');
      activePlayBtn.textContent = '▶';
    }

    activePlayBtn = btn;
    btn.classList.add('playing');
    btn.textContent = '❚❚';

    if (floatingPlayer && fpName) {
      fpName.textContent = btn.dataset.name || 'Now Playing';
      floatingPlayer.classList.add('visible');
    }
    if (fpCover) {
      const color = btn.dataset.genreColor || 'var(--blue)';
      fpCover.style.background = `linear-gradient(160deg, ${color}, #0a0a0d)`;
    }
    if (fpPlayPause) fpPlayPause.textContent = '❚❚';

    previewAudio.src = url;
    previewAudio.currentTime = 0;
    previewAudio.play().catch(() => {
      // Playback blocked or failed to load — don't leave the UI stuck
      // showing "playing" when nothing is actually audible.
      stopPreview();
    });
  });
});

if (fpClose) {
  fpClose.addEventListener('click', stopPreview);
}

// ===== Booking form placeholder =====
const bookingForm = document.getElementById('booking-form');
if (bookingForm) {
  bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('This form isn\'t connected to anything yet — hook it up to Formspree, a mailto link, or your own backend to start receiving requests.');
  });
}

// ===== Custom beat inquiry form — real Supabase wiring =====
const customInquiryForm = document.getElementById('custom-inquiry-form');
if (customInquiryForm) {
  customInquiryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('ci-status');
    const submitBtn = customInquiryForm.querySelector('button[type="submit"]');
    if (!window.qsClient) {
      if (statusEl) { statusEl.textContent = 'Something went wrong loading the form — please try again shortly.'; statusEl.style.display = 'block'; }
      return;
    }
    const name = document.getElementById('ci-name').value.trim();
    const email = document.getElementById('ci-email').value.trim();
    const description = document.getElementById('ci-description').value.trim();
    const deal = document.getElementById('ci-deal').value;

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

    const { error } = await window.qsClient.from('custom_inquiries').insert({
      name,
      email,
      project_description: description,
      deal_preference: deal,
    });

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Inquiry'; }
    if (statusEl) {
      statusEl.style.display = 'block';
      if (error) {
        statusEl.textContent = `Something went wrong: ${error.message}. Please try again.`;
      } else {
        statusEl.textContent = 'Sent! You\'ll hear back soon.';
        customInquiryForm.reset();
      }
    }
  });
}

// ===== Button spotlight glow =====
// Tracks the cursor position relative to each button and feeds it into
// --mx/--my (used by the .btn::before radial-gradient in styles.css).
// Only targets .btn elements, so the nav tabs at the top (a completely
// separate .nav-links class) are unaffected.
document.querySelectorAll('.btn').forEach((btn) => {
  btn.addEventListener('pointermove', (e) => {
    const rect = btn.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    btn.style.setProperty('--mx', `${mx}%`);
    btn.style.setProperty('--my', `${my}%`);
  });
});

// ===== Reactive card tilt =====
// Cards/tiers tilt slightly toward the cursor, matching the same
// mouse-reactive feel as the star background and buttons. Transition is
// swapped to instant-response while the cursor is moving, then eased back
// to neutral on leave — otherwise a lagging transition fights every
// pointermove update and it feels sluggish instead of reactive.
function setupTilt(selector, liftPx, tiltMax) {
  document.querySelectorAll(selector).forEach((el) => {
    const restTransition = getComputedStyle(el).transition;
    el.addEventListener('pointerenter', () => {
      el.style.transition = 'box-shadow 0.35s ease';
    });
    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `translateY(${liftPx}px) rotateX(${(-py * tiltMax).toFixed(2)}deg) rotateY(${(px * tiltMax).toFixed(2)}deg)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transition = restTransition;
      el.style.transform = '';
    });
  });
}
setupTilt('.card', -8, 6);
setupTilt('.beat-card', -8, 6);
setupTilt('.tier', -6, 5);

// ===== Reactive blob parallax =====
// Shifts the decorative background blobs via margin (not transform, since
// their own CSS keyframe animation already owns transform) so they drift
// toward the cursor slightly — echoing the same parallax the star
// background's camera does.
(function () {
  const blobs = document.querySelectorAll('.blob');
  if (!blobs.length) return;
  window.addEventListener('pointermove', (e) => {
    const cx = (e.clientX / window.innerWidth - 0.5) * 2;
    const cy = (e.clientY / window.innerHeight - 0.5) * 2;
    blobs.forEach((blob, i) => {
      const strength = blob.classList.contains('blob-blue') ? 18 : 24;
      const dir = i % 2 === 0 ? 1 : -1;
      blob.style.marginLeft = `${(cx * strength * dir).toFixed(1)}px`;
      blob.style.marginTop = `${(cy * strength * dir).toFixed(1)}px`;
    });
  }, { passive: true });
})();

// Note: momentum scrolling was previously added here, site-wide — removed.
// It affected normal page scrolling on every page, which wasn't the
// intent; the actual ask was for the galaxy's own scroll-to-zoom to feel
// as smooth as its drag-to-look does. That's implemented in
// beats-galaxy.js instead, scoped to just that interaction. The rest of
// the site now scrolls natively again.

// ===== Home page CTA popup =====
// Shows 5s after arrival, once per browser session (sessionStorage) —
// not on every single page load, which would get naggy fast.
(function () {
  const popup = document.getElementById('cta-popup');
  if (!popup) return; // only exists on index.html

  const closeBtn = document.getElementById('cta-popup-close');
  const STORAGE_KEY = 'qs-cta-seen';

  if (sessionStorage.getItem(STORAGE_KEY)) return;

  const timer = setTimeout(() => {
    popup.classList.add('visible');
    sessionStorage.setItem(STORAGE_KEY, '1');
  }, 5000);

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      clearTimeout(timer);
      popup.classList.remove('visible');
    });
  }
})();

// ===== Nav hide-on-scroll, reveal near top =====
(function () {
  const nav = document.getElementById('site-nav');
  if (!nav) return;

  let lastScrollY = window.scrollY;
  let hidden = false;
  const HIDE_THRESHOLD = 120; // don't hide until scrolled at least this far, so it doesn't flicker right at the top

  function setHidden(next) {
    if (next === hidden) return;
    hidden = next;
    nav.classList.toggle('nav-hidden', hidden);
  }

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > lastScrollY && y > HIDE_THRESHOLD) {
      setHidden(true);
    } else if (y < lastScrollY) {
      setHidden(false);
    }
    lastScrollY = y;
  }, { passive: true });

  // Hovering near the very top of the viewport reveals it even mid-scroll,
  // like a drawer you can peek back out.
  window.addEventListener('mousemove', (e) => {
    if (e.clientY < 60) setHidden(false);
  }, { passive: true });
})();

// ===== Nav tubelight indicator =====
// Slides a glowing bar to sit above whichever nav item is hovered,
// falling back to the active page's item when nothing is hovered.
(function () {
  const nav = document.getElementById('site-nav');
  const tubelight = document.getElementById('nav-tubelight');
  const navLinksWrap = nav ? nav.querySelector('.nav-links') : null;
  if (!nav || !tubelight || !navLinksWrap) return;

  const items = Array.from(nav.querySelectorAll('.nav-item'));
  const activeItem = nav.querySelector('.nav-item.active') || items[0];

  function moveTubelightTo(item) {
    if (!item) return;
    const itemRect = item.getBoundingClientRect();
    const wrapRect = navLinksWrap.getBoundingClientRect();
    tubelight.style.left = `${itemRect.left - wrapRect.left}px`;
    tubelight.style.width = `${itemRect.width}px`;
    tubelight.classList.add('visible');
  }

  items.forEach((item) => {
    item.addEventListener('mouseenter', () => moveTubelightTo(item));
  });
  nav.addEventListener('mouseleave', () => moveTubelightTo(activeItem));

  // Position on load once layout has settled, and again on resize.
  function initPosition() { moveTubelightTo(activeItem); }
  requestAnimationFrame(initPosition);
  window.addEventListener('resize', initPosition);
})();

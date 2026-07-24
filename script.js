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

// ===== Genre filter pills (beats page) =====
const pills = document.querySelectorAll('.pill');
const beatCards = document.querySelectorAll('.beat-card');

pills.forEach((pill) => {
  pill.addEventListener('click', () => {
    pills.forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    const filter = pill.dataset.filter;

    beatCards.forEach((card) => {
      const match = filter === 'all' || card.dataset.genre === filter;
      card.style.display = match ? '' : 'none';
    });
  });
});

// ===== Floating player (beats page) =====
const floatingPlayer = document.getElementById('floating-player');
const fpName = document.getElementById('fp-name');
const fpClose = document.getElementById('fp-close');

document.querySelectorAll('.beat-play').forEach((btn) => {
  btn.addEventListener('click', () => {
    const isPlaying = btn.classList.contains('playing');

    document.querySelectorAll('.beat-play.playing').forEach((other) => {
      other.classList.remove('playing');
      other.textContent = '▶';
    });

    if (isPlaying) {
      if (floatingPlayer) floatingPlayer.classList.remove('visible');
      return;
    }

    btn.classList.add('playing');
    btn.textContent = '❚❚';

    if (floatingPlayer && fpName) {
      fpName.textContent = btn.dataset.name || 'Now Playing';
      floatingPlayer.classList.add('visible');
    }
    // TODO: replace with real audio playback once track files are hosted
    // const audio = new Audio(btn.dataset.audio);
    // audio.play();
  });
});

if (fpClose) {
  fpClose.addEventListener('click', () => {
    floatingPlayer.classList.remove('visible');
    document.querySelectorAll('.beat-play.playing').forEach((btn) => {
      btn.classList.remove('playing');
      btn.textContent = '▶';
    });
  });
}

// ===== Booking form placeholder =====
const bookingForm = document.getElementById('booking-form');
if (bookingForm) {
  bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('This form isn\'t connected to anything yet — hook it up to Formspree, a mailto link, or your own backend to start receiving requests.');
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

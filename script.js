// ===== Sine-wave ticker (Home + Mixing/Mastering pages) =====
// Builds an SVG per ticker: a stroked wavy <path>, and the words rendered
// with <textPath> so they are literal glyphs sitting on that curve —
// tilting with its slope — rather than a separate bounce animation layered
// on top. The whole SVG is built twice as wide as the container and
// scrolled left by exactly half its width, so the loop is seamless: the
// wave is a repeating shape by construction, and textLength forces both
// halves of the (identical, duplicated) word string to exactly the same
// rendered width, so the seam lines up perfectly at any screen size.
const PERIOD = 180; // px, one full sine cycle
const AMPLITUDE = 28; // px, true vertical peak (matches the wave size you approved before)
const BASE_Y = 70; // px, centerline of the wave within the SVG
const SVG_HEIGHT = 150;
const SPEED = 70; // px/second scroll speed
const SEPARATOR = '   ◆   ';
const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT_RAISE = 16; // px, how far above the curve the words sit

// A plain, unmodulated sine wave — just scrolls, no secondary motion.
// Accepts baseY so we can build two parallel copies: one visible (the
// stroked line) and one invisible "guide" shifted up by TEXT_RAISE, which
// the text follows — this keeps the text on a completely normal, single
// textPath (no nested tspan), so textLength/lengthAdjust works correctly.
function buildWaveD(totalWidth, baseY) {
  let d = '';
  const step = 6;
  for (let x = 0; x <= totalWidth; x += step) {
    const y = baseY + AMPLITUDE * Math.sin((2 * Math.PI * x) / PERIOD);
    d += (x === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  return d;
}

function initTicker(tickerEl) {
  const words = (tickerEl.dataset.words || '').split(',').map((w) => w.trim().toUpperCase()).filter(Boolean);
  if (!words.length) return;

  const containerWidth = tickerEl.clientWidth || 600;
  const uid = Math.random().toString(36).slice(2);
  // halfWidth is always an exact multiple of PERIOD, so the sine wave
  // tiles perfectly at that boundary — no seam when it loops.
  const halfWidth = Math.ceil((containerWidth + 300) / PERIOD) * PERIOD;
  const fullWidth = halfWidth * 2;

  tickerEl.innerHTML = '';
  const svg = document.createElementNS(SVG_NS, 'svg');
  // Note: the 'ticker-svg' class (which triggers the CSS animation) is
  // intentionally NOT added yet — see bottom of this function for why.
  svg.setAttribute('width', fullWidth);
  svg.setAttribute('height', SVG_HEIGHT);
  svg.setAttribute('viewBox', `0 0 ${fullWidth} ${SVG_HEIGHT}`);

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
  const pathId = `wavePath-${uid}`;
  path.setAttribute('id', pathId);
  path.setAttribute('d', buildWaveD(fullWidth, BASE_Y)); // built once — a fixed, unmodulated shape
  path.setAttribute('stroke', `url(#waveGrad-${uid})`);
  path.setAttribute('stroke-width', '5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);

  // Invisible guide path, same shape, shifted up by TEXT_RAISE — the text
  // follows this one, so it sits above the visible line instead of on it.
  const guidePath = document.createElementNS(SVG_NS, 'path');
  const guideId = `waveGuide-${uid}`;
  guidePath.setAttribute('id', guideId);
  guidePath.setAttribute('d', buildWaveD(fullWidth, BASE_Y - TEXT_RAISE));
  guidePath.setAttribute('fill', 'none');
  guidePath.setAttribute('stroke', 'none');
  svg.appendChild(guidePath);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'wave-text');
  const textPath = document.createElementNS(SVG_NS, 'textPath');
  textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${guideId}`);
  textPath.setAttribute('href', `#${guideId}`);
  const joined = words.join(SEPARATOR) + SEPARATOR;
  textPath.textContent = joined;
  text.appendChild(textPath);
  svg.appendChild(text);
  tickerEl.appendChild(svg);

  let naturalLen = textPath.getComputedTextLength();
  if (!naturalLen || !isFinite(naturalLen) || naturalLen <= 0) {
    naturalLen = joined.length * 9; // fallback estimate if measurement fails
  }
  const repeats = Math.max(1, Math.round(halfWidth / naturalLen));
  const halfText = joined.repeat(repeats);
  textPath.textContent = halfText + halfText;
  textPath.setAttribute('textLength', fullWidth);
  textPath.setAttribute('lengthAdjust', 'spacing');

  // Explicit pixel distance — percentage transforms don't reliably resolve
  // against an SVG element's own box the way they do on HTML elements.
  svg.style.setProperty('--scroll-distance', `-${halfWidth}px`);
  svg.style.setProperty('--scroll-duration', `${Math.max(4, halfWidth / SPEED).toFixed(1)}s`);

  // Only NOW add the class that triggers the CSS animation — everything
  // it depends on (--scroll-distance, --scroll-duration) is already set,
  // so the very first frame of the animation uses the correct values
  // instead of momentarily locking in the CSS fallback (-50%, 20s).
  svg.classList.add('ticker-svg');
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

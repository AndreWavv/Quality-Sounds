// ===== Sine-wave ticker (Home + Mixing/Mastering pages) =====
// Builds an SVG per ticker: a stroked wavy <path>, and the words rendered
// with <textPath> so they are literal glyphs sitting on that curve —
// tilting with its slope — rather than a separate bounce animation layered
// on top. The whole SVG is built twice as wide as the container and
// scrolled left by exactly half its width, so the loop is seamless: the
// wave is a repeating shape by construction, and textLength forces both
// halves of the (identical, duplicated) word string to exactly the same
// rendered width, so the seam lines up perfectly at any screen size.
const HALF_PERIOD = 90; // px, horizontal span of one hump
const AMPLITUDE = 55; // px, vertical deviation from the centerline
const BASE_Y = 80; // px, centerline of the wave within the SVG
const SVG_HEIGHT = 170;
const SPEED = 70; // px/second scroll speed
const SEPARATOR = '   ◆   ';
const SVG_NS = 'http://www.w3.org/2000/svg';

function buildWaveD(totalWidth) {
  const firstCx = HALF_PERIOD / 2;
  const firstCy = BASE_Y - AMPLITUDE;
  let d = `M0,${BASE_Y} Q${firstCx},${firstCy} ${HALF_PERIOD},${BASE_Y}`;
  let x = HALF_PERIOD;
  while (x < totalWidth) {
    x += HALF_PERIOD;
    d += ` T${x},${BASE_Y}`;
  }
  return { d, width: x };
}

function initTicker(tickerEl) {
  const words = (tickerEl.dataset.words || '').split(',').map((w) => w.trim().toUpperCase()).filter(Boolean);
  if (!words.length) return;

  const containerWidth = tickerEl.clientWidth || 600;
  const uid = Math.random().toString(36).slice(2);

  // Size one filled "half" of wave comfortably wider than the container.
  const { width: halfWidth } = buildWaveD(containerWidth + 300);
  const { d: fullD } = buildWaveD(halfWidth * 2);

  tickerEl.innerHTML = '';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ticker-svg');
  svg.setAttribute('width', halfWidth * 2);
  svg.setAttribute('height', SVG_HEIGHT);
  svg.setAttribute('viewBox', `0 0 ${halfWidth * 2} ${SVG_HEIGHT}`);

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
  path.setAttribute('id', `wavePath-${uid}`);
  path.setAttribute('d', fullD);
  path.setAttribute('stroke', `url(#waveGrad-${uid})`);
  path.setAttribute('stroke-width', '5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'wave-text');
  const textPath = document.createElementNS(SVG_NS, 'textPath');
  textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#wavePath-${uid}`);
  textPath.setAttribute('href', `#wavePath-${uid}`);
  const joined = words.join(SEPARATOR) + SEPARATOR;
  textPath.textContent = joined;
  text.appendChild(textPath);
  svg.appendChild(text);
  tickerEl.appendChild(svg);

  // Measure the natural (unstretched) rendered length of one copy of the
  // word list, so we repeat it roughly enough times to fill one half —
  // then force the exact fit with textLength so both halves match exactly.
  const naturalLen = textPath.getComputedTextLength() || joined.length * 9;
  const repeats = Math.max(1, Math.round(halfWidth / naturalLen));
  const halfText = joined.repeat(repeats);
  textPath.textContent = halfText + halfText;
  textPath.setAttribute('textLength', halfWidth * 2);
  textPath.setAttribute('lengthAdjust', 'spacing');

  svg.style.setProperty('--scroll-distance', `-${halfWidth}px`);
  const duration = Math.max(4, halfWidth / SPEED);
  svg.style.setProperty('--scroll-duration', `${duration.toFixed(1)}s`);
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

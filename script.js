// ===== Sine-wave ticker (Home + Mixing/Mastering pages) =====
// MOTION SHELVED FOR NOW: this renders one static frame — words sitting on
// a curved wave, raised above the visible line — with no scrolling and no
// animation loop. The animated version kept causing issues (speed, loop
// seams), so for now this is deliberately frozen until revisited.
const PERIOD = 180; // px, spatial wavelength
const AMPLITUDE = 28; // px, true vertical peak
const BASE_Y = 70; // px, centerline of the wave within the SVG
const SVG_HEIGHT = 150;
const SEPARATOR = '   ◆   ';
const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT_RAISE = 16; // px, how far above the curve the words sit

function buildWaveD(width, baseY) {
  let d = '';
  const step = 8;
  for (let x = 0; x <= width; x += step) {
    const y = baseY + AMPLITUDE * Math.sin((2 * Math.PI * x) / PERIOD);
    d += (x === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  return d;
}

function initTicker(tickerEl) {
  const words = (tickerEl.dataset.words || '').split(',').map((w) => w.trim().toUpperCase()).filter(Boolean);
  if (!words.length) return;

  const width = tickerEl.clientWidth || 600;
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
  path.setAttribute('d', buildWaveD(width, BASE_Y));
  path.setAttribute('stroke', `url(#waveGrad-${uid})`);
  path.setAttribute('stroke-width', '5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);

  const guidePath = document.createElementNS(SVG_NS, 'path');
  const guideId = `waveGuide-${uid}`;
  guidePath.setAttribute('id', guideId);
  guidePath.setAttribute('d', buildWaveD(width, BASE_Y - TEXT_RAISE));
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

  let oneRepeatLen = textPath.getComputedTextLength();
  if (!oneRepeatLen || !isFinite(oneRepeatLen) || oneRepeatLen <= 0) {
    oneRepeatLen = joined.length * 9;
  }
  const repeatCount = Math.max(2, Math.ceil((width * 1.2) / oneRepeatLen));
  textPath.textContent = joined.repeat(repeatCount);
  // Static — no requestAnimationFrame loop, startOffset stays at 0.
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

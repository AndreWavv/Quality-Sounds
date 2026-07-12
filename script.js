// ===== Sine-wave ticker (Home + Mixing/Mastering pages) =====
// The word list in the HTML is short, so on wide screens a single copy is
// narrower than the viewport — looping it with just one duplicate leaves a
// stretch of blank space before it repeats. To fix that for real, we clone
// the original words enough times to comfortably exceed the container's
// width, THEN duplicate that whole filled block once more so the -50% loop
// has no gap at any screen size.
//
// These two constants must match the CSS: WAVELENGTH is the width of one
// cycle of the background wave pattern (.ticker::before background-size),
// and SPEED is the scroll speed used for --scroll-duration below. Keeping
// both here in sync with the wave means a word's horizontal position maps
// directly onto a point on the curve, so its "ride-wave" animation delay
// can be set to exactly the phase of the curve at that point — the word
// then travels along the curve rather than bouncing independently of it.
const WAVELENGTH = 140; // px, matches .ticker::before background-size width
const SPEED = 70; // px/second, matches .ticker::before wave-flow speed (140px / 2s)
const RIDE_DURATION = WAVELENGTH / SPEED; // seconds for one full sine cycle

function initTicker(tickerEl) {
  const track = tickerEl.querySelector('.ticker-track');
  if (!track) return;

  const originalSpans = Array.from(track.children).map((s) => s.cloneNode(true));
  const containerWidth = tickerEl.clientWidth;

  track.innerHTML = '';
  originalSpans.forEach((s) => track.appendChild(s));

  // Keep appending clones of the original sequence until one filled
  // "half" is comfortably wider than the visible container.
  let guard = 0;
  while (track.scrollWidth < containerWidth + 400 && guard < 40) {
    originalSpans.forEach((s) => track.appendChild(s.cloneNode(true)));
    guard++;
  }

  const halfWidth = track.scrollWidth;
  const halfSpans = Array.from(track.children);

  // Duplicate the filled half once more — this is what the -50% loop
  // animates across, so both halves are pixel-identical and the seam
  // between them is invisible.
  halfSpans.forEach((s) => track.appendChild(s.cloneNode(true)));

  // Give each word a negative animation-delay equal to how far "into" the
  // wave cycle its starting x-position already is. A negative delay starts
  // the animation already in progress at that phase, so at t=0 the word
  // sits at the correct height for its position — and since the word and
  // the wave move at the same speed, it stays locked to the curve forever.
  Array.from(track.children).forEach((span) => {
    const x = span.offsetLeft + span.offsetWidth / 2;
    const phaseSeconds = (x % WAVELENGTH) / SPEED;
    span.style.setProperty('--wave-delay', `-${phaseSeconds.toFixed(3)}s`);
  });

  // Keep scroll speed visually consistent regardless of how much content
  // ended up in one half, and matched to the same SPEED as the wave curve.
  const duration = Math.max(4, halfWidth / SPEED);
  track.style.setProperty('--scroll-duration', `${duration.toFixed(1)}s`);
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

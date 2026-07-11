// Generate the ambient waveform bars in the hero
const waveform = document.getElementById('waveform');
if (waveform) {
  const barCount = 48;
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('span');
    const height = 12 + Math.random() * 48;
    const delay = Math.random() * 1.6;
    bar.style.height = `${height}px`;
    bar.style.animationDelay = `${delay}s`;
    waveform.appendChild(bar);
  }
}

// Beat preview play/pause toggle (placeholder audio — wire up real src later)
document.querySelectorAll('.beat-play').forEach((btn) => {
  btn.addEventListener('click', () => {
    const isPlaying = btn.classList.contains('playing');

    document.querySelectorAll('.beat-play.playing').forEach((other) => {
      other.classList.remove('playing');
      other.textContent = '▶';
    });

    if (!isPlaying) {
      btn.classList.add('playing');
      btn.textContent = '❚❚';
      // TODO: replace with real audio playback once track files are hosted
      // const audio = new Audio(btn.dataset.audio);
      // audio.play();
    }
  });
});

// Booking form — placeholder submit handler until a backend/email service is wired up
const bookingForm = document.getElementById('booking-form');
if (bookingForm) {
  bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('This form isn\'t connected to anything yet — hook it up to Formspree, a mailto link, or your own backend to start receiving requests.');
  });
}

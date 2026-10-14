// ===== Beats page: sea-of-clouds background playback =====
// Load AFTER beats-galaxy.js (which sets data-theme on #cloud-scene-wrap
// and owns the day/night toggle). This file only reacts to that.
//
// Performance:
// - Only the visible clip plays. The hidden one is paused once the
//   crossfade finishes (two full-screen videos decoding at once was the
//   cause of the night-mode lag).
// - Both pause while the scene is scrolled off screen or the tab is hidden.
// - Phones and small screens get the 720p files (about 3 MB each instead of 8-10 MB).
// - Visitors with reduced motion or data saver on get the still poster only.
(function () {
  const wrap = document.getElementById('cloud-scene-wrap');
  if (!wrap) return;
  const vids = {
    day: document.getElementById('cloud-video-day'),
    night: document.getElementById('cloud-video-night'),
  };
  if (!vids.day || !vids.night) return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const canPlay = !reduceMotion && !saveData;
  const smallScreen = Math.min(window.screen.width, window.screen.height) <= 820 || window.innerWidth <= 820;
  const FADE_MS = 1600; // a little longer than the 1.4 s CSS opacity fade

  const themeNow = () => (wrap.dataset.theme === 'night' ? 'night' : 'day');
  const other = (t) => (t === 'day' ? 'night' : 'day');

  // Sources are attached by JS (not in the HTML) so the page never
  // downloads a clip it isn't going to show.
  function ensureSource(v) {
    if (!canPlay || v.getAttribute('src')) return;
    v.src = (smallScreen && v.dataset.srcMobile) || v.dataset.src;
    v.preload = 'auto';
  }

  function play(v) {
    if (!canPlay) return;
    ensureSource(v);
    const p = v.play();
    if (p && p.catch) p.catch(() => { /* autoplay refused: the poster stays up */ });
  }

  function pauseBoth() {
    vids.day.pause();
    vids.night.pause();
  }

  // Put `to` on the same frame as `from`, now or as soon as it can seek.
  function syncFrame(to, from) {
    const apply = () => { try { to.currentTime = from.currentTime; } catch (e) { /* not seekable yet */ } };
    if (to.readyState >= 1) apply();
    else to.addEventListener('loadedmetadata', apply, { once: true });
  }

  let current = themeNow();
  let onScreen = true;
  let pauseTimer = null;

  function switchTo(next) {
    if (next === current) return;
    const prev = current;
    current = next;
    if (!canPlay) return; // posters crossfade on their own via CSS
    ensureSource(vids[next]);
    syncFrame(vids[next], vids[prev]);
    if (onScreen && !document.hidden) play(vids[next]);
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { if (current !== prev) vids[prev].pause(); }, FADE_MS);
  }

  // beats-galaxy.js changes data-theme when the toggle is clicked.
  new MutationObserver(() => switchTo(themeNow()))
    .observe(wrap, { attributes: true, attributeFilter: ['data-theme'] });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      if (onScreen && !document.hidden) play(vids[current]);
      else pauseBoth();
    }).observe(wrap);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseBoth();
    else if (onScreen) play(vids[current]);
  });

  // Start the visible clip, then quietly load the other one a few seconds
  // later so the first toggle is instant.
  play(vids[current]);
  if (canPlay) {
    vids[current].addEventListener('playing', () => {
      setTimeout(() => ensureSource(vids[other(current)]), 3000);
    }, { once: true });
  }
})();

// ===== Parallax scrolling (Lenis + GSAP ScrollTrigger) =====
// An original implementation of the same general technique shown in a
// 21st.dev reference component — smooth momentum scrolling driving
// scroll-linked parallax offsets — not copied from their (paywalled)
// source. Deliberately excludes the beats galaxy entirely (via
// data-lenis-prevent on .galaxy-wrap): that canvas already owns its own
// wheel handling (damped zoom, engage-gate) and this must not fight it,
// the same lesson learned earlier when a custom smooth-scroll
// implementation briefly hijacked scrolling site-wide by mistake.
(function () {
  if (typeof Lenis === 'undefined' || typeof gsap === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const lenis = new Lenis({
    autoRaf: false, // driven by gsap.ticker instead, see below — keeps one single rAF loop in sync with ScrollTrigger
    anchors: true, // site already has #section links (License button, Contact nav link) — let Lenis own those too, rather than risking its internal scroll position desyncing from a native anchor jump
  });

  if (typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    lenis.on('scroll', ScrollTrigger.update);
  }

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // Each .parallax-layer wraps a decorative element (currently the blobs)
  // and gets its OWN scroll-linked offset — never the element itself,
  // since blobs already own `transform` for their drift animation and
  // `margin` for cursor parallax (script.js). A third system fighting
  // over the same properties is exactly the kind of bug already run
  // into twice before in this project.
  if (typeof ScrollTrigger !== 'undefined') {
    document.querySelectorAll('.parallax-layer').forEach((layer) => {
      const speed = parseFloat(layer.dataset.parallaxSpeed || '0.4');
      gsap.to(layer, {
        y: () => window.innerHeight * speed,
        ease: 'none',
        scrollTrigger: {
          trigger: layer.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
    });
  }
})();

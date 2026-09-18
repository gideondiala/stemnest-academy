/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — HOME.JS
   Word rotation in hero, scroll-reveal animations.
═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initWordRotation();
  initScrollReveal();
});

/* ── HERO WORD ROTATION ── */
function initWordRotation() {
  const el = document.querySelector('.word-rotate');
  if (!el) return;

  const words = ['Code', 'Lead', 'Grow', 'Think', 'Build'];
  let idx = 0;

  setInterval(() => {
    idx = (idx + 1) % words.length;

    el.style.transition = 'all 0.3s ease';
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(-20px)';

    setTimeout(() => {
      el.textContent      = words[idx];
      el.style.transition = 'none';
      el.style.opacity    = '0';
      el.style.transform  = 'translateY(20px)';

      setTimeout(() => {
        el.style.transition = 'all 0.4s ease';
        el.style.opacity    = '1';
        el.style.transform  = 'translateY(0)';
      }, 50);
    }, 300);
  }, 2800);
}

/* ── SCROLL REVEAL ── */
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

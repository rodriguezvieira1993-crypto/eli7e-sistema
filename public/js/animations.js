// ─── animations.js — Motor de animaciones GSAP para Eli7e ───────────────────
// Requiere: gsap (CDN) cargado antes de este archivo

const ELI7E = {

  // ─── CONFIG ─────────────────────────────────────────
  dur: { fast: 0.2, normal: 0.35, slow: 0.55 },
  ease: {
    smooth: 'power2.out',
    snappy: 'power3.out',
    bounce: 'back.out(1.4)',
    modal: 'back.out(1.2)',
    exit: 'power2.in',
  },

  // ─── PAGE ENTRANCE ──────────────────────────────────
  initDashboard() {
    const tl = gsap.timeline({ defaults: { ease: this.ease.snappy } });

    // Sidebar
    const sb = document.querySelector('.sidebar');
    if (sb) {
      gsap.set(sb, { x: -60, opacity: 0 });
      tl.to(sb, { x: 0, opacity: 1, duration: this.dur.slow });
    }

    // Topbar
    const tb = document.querySelector('.topbar');
    if (tb) {
      gsap.set(tb, { y: -16, opacity: 0 });
      tl.to(tb, { y: 0, opacity: 1, duration: this.dur.normal }, '-=0.35');
    }

    // Active view
    const av = document.querySelector('.view.active');
    if (av) {
      gsap.set(av, { opacity: 0, y: 12 });
      tl.to(av, { opacity: 1, y: 0, duration: this.dur.normal }, '-=0.2');
      tl.call(() => this.animateViewContent(av), null, '-=0.1');
    }

    // Status dot glow
    const dot = document.querySelector('.status-dot');
    if (dot) {
      gsap.to(dot, {
        boxShadow: '0 0 12px #00DD00, 0 0 24px rgba(0,221,0,0.3)',
        duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1,
      });
    }
  },

  // ─── VIEW CONTENT ANIMATIONS ────────────────────────
  animateViewContent(viewEl) {
    if (!viewEl) return;

    // KPI cards
    const kpis = viewEl.querySelectorAll('.kpi-card');
    if (kpis.length) {
      gsap.fromTo(kpis,
        { y: 18, opacity: 0, scale: 0.96 },
        { y: 0, opacity: 1, scale: 1, duration: this.dur.normal, stagger: 0.08, ease: this.ease.bounce }
      );
    }

    // Cards
    const cards = viewEl.querySelectorAll('.card');
    if (cards.length) {
      gsap.fromTo(cards,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: this.dur.normal, stagger: 0.06, ease: this.ease.smooth, delay: 0.1 }
      );
    }

    // Moto cards
    const motos = viewEl.querySelectorAll('.moto-card');
    if (motos.length) {
      gsap.fromTo(motos,
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: this.dur.normal, stagger: { amount: 0.35, from: 'center' }, ease: this.ease.bounce }
      );
    }

    // Tipo chips
    const chips = viewEl.querySelectorAll('.tipo-chip, .monto-chip');
    if (chips.length) {
      gsap.fromTo(chips,
        { y: 10, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: this.dur.fast, stagger: 0.05, ease: this.ease.bounce, delay: 0.1 }
      );
    }
  },

  // ─── TABLE ROW STAGGER ──────────────────────────────
  staggerRows(tbodySelector) {
    const rows = document.querySelectorAll(tbodySelector + ' tr');
    if (!rows.length) return;
    gsap.fromTo(rows,
      { x: -10, opacity: 0 },
      { x: 0, opacity: 1, duration: this.dur.fast, stagger: 0.03, ease: this.ease.smooth }
    );
  },

  // ─── NEW ITEM ENTRANCE ──────────────────────────────
  animateNewItem(el) {
    if (!el) return;
    gsap.fromTo(el,
      { x: -16, opacity: 0, scale: 0.97 },
      { x: 0, opacity: 1, scale: 1, duration: this.dur.normal, ease: this.ease.bounce }
    );
  },

  // ─── KPI COUNTER ────────────────────────────────────
  animateCounter(el, targetValue, isCurrency) {
    if (!el) return;
    const obj = { val: 0 };
    gsap.to(obj, {
      val: targetValue,
      duration: 1,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = isCurrency
          ? '$' + obj.val.toFixed(2)
          : Math.round(obj.val);
      },
    });
  },

  // ─── CHIP SELECTION PULSE ───────────────────────────
  pulseChip(el) {
    gsap.fromTo(el,
      { scale: 1 },
      { scale: 1.08, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' }
    );
  },

  // ─── HOVER INTERACTIONS ─────────────────────────────
  initHovers() {
    // Buttons
    document.querySelectorAll('.btn-primary').forEach(btn => {
      btn.addEventListener('mouseenter', () =>
        gsap.to(btn, { y: -2, boxShadow: '0 4px 20px rgba(0,221,0,0.35)', duration: 0.25, ease: 'power2.out' })
      );
      btn.addEventListener('mouseleave', () =>
        gsap.to(btn, { y: 0, boxShadow: 'none', duration: 0.2, ease: 'power2.out' })
      );
      btn.addEventListener('mousedown', () =>
        gsap.to(btn, { scale: 0.97, duration: 0.08 })
      );
      btn.addEventListener('mouseup', () =>
        gsap.to(btn, { scale: 1, duration: 0.2, ease: 'back.out(1.7)' })
      );
    });

    // KPI / Moto / Chip cards
    document.querySelectorAll('.kpi-card, .moto-card, .tipo-chip, .monto-chip, .ultimo-card').forEach(card => {
      card.addEventListener('mouseenter', () =>
        gsap.to(card, { y: -3, scale: 1.015, duration: 0.25, ease: 'power2.out' })
      );
      card.addEventListener('mouseleave', () =>
        gsap.to(card, { y: 0, scale: 1, duration: 0.25, ease: 'power2.out' })
      );
    });

    // Sidebar links
    document.querySelectorAll('.sb-link').forEach(link => {
      link.addEventListener('mouseenter', () => {
        if (!link.classList.contains('active'))
          gsap.to(link, { x: 4, duration: 0.2, ease: 'power2.out' });
      });
      link.addEventListener('mouseleave', () => {
        if (!link.classList.contains('active'))
          gsap.to(link, { x: 0, duration: 0.15, ease: 'power2.out' });
      });
    });

    // Icon buttons
    document.querySelectorAll('.btn-icon').forEach(btn => {
      btn.addEventListener('mouseenter', () =>
        gsap.to(btn, { scale: 1.12, duration: 0.15, ease: 'power2.out' })
      );
      btn.addEventListener('mouseleave', () =>
        gsap.to(btn, { scale: 1, duration: 0.15, ease: 'power2.out' })
      );
    });

    // Role pills (login page)
    document.querySelectorAll('.role-pill').forEach(pill => {
      pill.addEventListener('mouseenter', () =>
        gsap.to(pill, { y: -2, scale: 1.05, duration: 0.2, ease: 'power2.out' })
      );
      pill.addEventListener('mouseleave', () =>
        gsap.to(pill, { y: 0, scale: 1, duration: 0.2, ease: 'power2.out' })
      );
    });
  },

  // ─── SIDEBAR ACTIVE LINK TRANSITION ─────────────────
  animateSidebarSwitch(oldLink, newLink) {
    if (oldLink) gsap.to(oldLink, { x: 0, duration: 0.15 });
    if (newLink) {
      gsap.fromTo(newLink,
        { x: -4, opacity: 0.7 },
        { x: 0, opacity: 1, duration: 0.25, ease: this.ease.smooth }
      );
    }
  },

  // ─── LOADING SHIMMER ────────────────────────────────
  shimmer(el) {
    if (!el) return;
    gsap.fromTo(el,
      { opacity: 0.3 },
      { opacity: 1, duration: 0.6, yoyo: true, repeat: 3, ease: 'sine.inOut' }
    );
  },

  // ─── INIT ALL ───────────────────────────────────────
  init() {
    if (typeof gsap === 'undefined') return;
    gsap.defaults({ overwrite: 'auto' });
    this.initDashboard();
    // Defer hover init to catch dynamically rendered elements
    setTimeout(() => this.initHovers(), 500);
  },
};

// Auto-init
document.addEventListener('DOMContentLoaded', () => ELI7E.init());

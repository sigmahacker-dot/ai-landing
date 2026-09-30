/* ================= NOVEXA — app.js ================= */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- navbar ---------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  burger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
  });
  mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    burger.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  }));

  const glowToggle = document.getElementById('glowToggle');
  glowToggle.addEventListener('click', () => {
    document.body.classList.toggle('low-glow');
  });

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---------- GSAP hero entrance ---------- */
  let currentP = 0;
  if (window.gsap && !reduceMotion) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.from('.hero-copy > *', { y: 44, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out', delay: 0.15 });
    gsap.from('#heroRobot', { scale: 0.82, opacity: 0, duration: 1.4, ease: 'power3.out', delay: 0.35 });
    gsap.from('.stat-card', { scale: 0.6, opacity: 0, duration: 0.9, stagger: 0.14, ease: 'back.out(1.6)', delay: 0.9 });
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  /* ================= SCROLL-SHATTER ================= */
  const section = document.getElementById('shatter');
  const stage = document.getElementById('shatterStage');
  const canvas = document.getElementById('shatterCanvas');
  const ctx = canvas.getContext('2d');
  const docked = document.getElementById('shatterDocked');
  const copy = document.getElementById('shatterCopy');
  const hint = document.getElementById('shatterHint');
  const items = Array.from(copy.querySelectorAll('.sh-item'));

  const img = new Image();
  img.src = 'assets/robot-hero.webp';

  const S = {
    ready: false, tiles: [], off: null,
    W: 0, H: 0, homeX: 0, homeY: 0, homeW: 0, homeH: 0,
    dockX: 0, dockY: 0, dockScale: 0.42, mobile: false, diag: 0
  };

  function layout() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    S.W = W; S.H = H;
    S.mobile = W < 640;
    S.diag = Math.hypot(W, H);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ar = img.naturalWidth / img.naturalHeight;
    let homeH = H * (S.mobile ? 0.52 : 0.76);
    let homeW = homeH * ar;
    const maxW = W * (S.mobile ? 0.62 : 0.5);
    if (homeW > maxW) { homeW = maxW; homeH = homeW / ar; }
    S.homeW = homeW; S.homeH = homeH;
    S.homeX = (W - homeW) / 2;
    S.homeY = (H - homeH) / 2 - (S.mobile ? H * 0.06 : 0);

    // offscreen: image fitted exactly to home rect
    const off = document.createElement('canvas');
    const odpr = 1.5;
    off.width = Math.round(homeW * odpr);
    off.height = Math.round(homeH * odpr);
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 0, off.width, off.height);
    S.off = off;

    // tile grid
    const cols = S.mobile ? 14 : 26;
    const rows = S.mobile ? 16 : 30;
    const tw = homeW / cols, th = homeH / rows;
    const sw = off.width / cols, sh = off.height / rows;
    let px;
    try { px = octx.getImageData(0, 0, off.width, off.height).data; }
    catch (e) { px = null; }
    const rnd = mulberry32(1337);
    const tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (px) {
          // sample center brightness; skip near-black tiles for a cleaner shard silhouette
          const sx = Math.min(off.width - 1, Math.floor((c + 0.5) * sw));
          const sy = Math.min(off.height - 1, Math.floor((r + 0.5) * sh));
          const i = (sy * off.width + sx) * 4;
          const bright = (px[i] + px[i + 1] + px[i + 2]) / 3;
          if (bright < 14) continue;
        }
        tiles.push({
          c, r,
          sx: c * sw, sy: r * sh, sw, sh, tw, th,
          ang: rnd() * Math.PI * 2,
          dist: 0.18 + rnd() * 0.55,
          rot: (rnd() - 0.5) * 5,
          sdir: rnd() > 0.5 ? 1 : -1,
          samt: (0.5 + rnd() * 1.1) * Math.PI
        });
      }
    }
    S.tiles = tiles;

    // dock rect (must match the #shatterDocked img we crossfade to)
    const dw = homeW * S.dockScale, dh = homeH * S.dockScale;
    if (S.mobile) {
      S.dockX = (W - dw) / 2;
      S.dockY = H * 0.09;
    } else {
      S.dockX = W * 0.07;
      S.dockY = (H - dh) / 2;
    }
    docked.style.left = S.dockX + 'px';
    docked.style.top = S.dockY + 'px';
    docked.style.width = dw + 'px';
    docked.style.transform = 'none';
    S.ready = true;
  }

  function render(p, now) {
    if (!S.ready) return;
    const { W, H, tiles, off } = S;
    const eT = easeIO(smooth(0.15, 0.45, p));   // explode
    const sT = easeIO(smooth(0.45, 0.72, p));   // swirl
    const dT = easeIO(smooth(0.72, 0.94, p));   // dock / reassemble
    const cx = W / 2, cy = H / 2;

    ctx.clearRect(0, 0, W, H);
    const canvasAlpha = 1 - smooth(0.94, 1.0, p);
    const glow = eT * (1 - dT);

    for (let k = 0; k < tiles.length; k++) {
      const t = tiles[k];
      const hx = S.homeX + (t.c + 0.5) * t.tw;
      const hy = S.homeY + (t.r + 0.5) * t.th;

      // idle float before the shatter begins
      const fy = p < 0.15 ? Math.sin(now * 0.0012 + t.c * 0.35 + t.r * 0.2) * 6 * (1 - p / 0.15) : 0;

      // explode outward + downward drift
      const ex = Math.cos(t.ang) * t.dist * S.diag;
      const ey = Math.sin(t.ang) * t.dist * S.diag * 0.72 + eT * eT * H * 0.26;
      let x = hx + ex * eT;
      let y = hy + ey * eT + fy;

      // swirl around stage center
      if (sT > 0) {
        const a = sT * t.samt * t.sdir;
        const pull = 1 - 0.28 * sT;
        const dx = (x - cx) * pull, dy = (y - cy) * pull;
        const ca = Math.cos(a), sa = Math.sin(a);
        x = cx + dx * ca - dy * sa;
        y = cy + dx * sa + dy * ca;
      }

      // converge to docked rect
      const tx = S.dockX + (t.c + 0.5) * t.tw * S.dockScale;
      const ty = S.dockY + (t.r + 0.5) * t.th * S.dockScale;
      x = lerp(x, tx, dT);
      y = lerp(y, ty, dT);

      const sc = (1 + eT * 0.22) * lerp(1, S.dockScale, dT);
      const rot = eT * t.rot + sT * t.sdir * 1.7;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      ctx.globalAlpha = canvasAlpha;
      if (glow > 0.02) {
        ctx.shadowColor = 'rgba(255,45,45,' + (0.85 * glow).toFixed(3) + ')';
        ctx.shadowBlur = 16 * glow;
      }
      ctx.drawImage(off, t.sx, t.sy, t.sw, t.sh, -t.tw / 2, -t.th / 2, t.tw, t.th);
      ctx.restore();
    }

    // crossfade to clean docked image + reveal copy
    docked.style.opacity = smooth(0.93, 1.0, p).toFixed(3);
    copy.style.opacity = smooth(0.76, 0.85, p).toFixed(3);
    copy.style.visibility = p > 0.74 ? 'visible' : 'hidden';
    for (let i = 0; i < items.length; i++) {
      const it = smooth(0.78 + i * 0.03, 0.88 + i * 0.03, p);
      items[i].style.opacity = it.toFixed(3);
      items[i].style.transform = 'translateY(' + ((1 - it) * 36).toFixed(1) + 'px)';
    }
    hint.style.opacity = (1 - smooth(0.03, 0.16, p)).toFixed(3);
  }

  function fallbackStatic() {
    // reduced-motion / no-GSAP / image-fail: show the end state, no pin
    canvas.style.display = 'none';
    docked.style.opacity = '1';
    docked.style.left = ''; docked.style.top = ''; docked.style.width = ''; docked.style.transform = '';
    copy.style.opacity = '1'; copy.style.visibility = 'visible';
    items.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
    hint.style.display = 'none';
  }

  let rafId = 0;
  function loop(now) {
    const r = stage.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) render(currentP, now);
    rafId = requestAnimationFrame(loop);
  }

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (S.ready) { layout(); render(currentP, performance.now()); } }, 220);
  });

  img.onload = () => {
    layout();
    if (reduceMotion || !window.gsap || !window.ScrollTrigger) {
      fallbackStatic();
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    const proxy = { p: 0 };
    gsap.to(proxy, {
      p: 1, ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=280%',
        pin: true,
        scrub: 1,
        anticipatePin: 1,
        onUpdate: self => { currentP = self.progress; }
      }
    });
    render(0, performance.now());
    rafId = requestAnimationFrame(loop);
    ScrollTrigger.refresh();
  };
  img.onerror = () => fallbackStatic();
  // cached image edge case
  if (img.complete && img.naturalWidth) img.onload();

})();

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
  const hasGSAP = !!(window.gsap && !reduceMotion);
  const hasST = hasGSAP && !!window.ScrollTrigger;
  if (hasGSAP) {
    if (hasST) gsap.registerPlugin(ScrollTrigger);
    gsap.from('.hero-copy > *', { y: 44, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out', delay: 0.15 });
    gsap.from('#heroRobot', { scale: 0.82, opacity: 0, duration: 1.4, ease: 'power3.out', delay: 0.35 });
    gsap.from('.stat-card', { scale: 0.6, opacity: 0, duration: 0.9, stagger: 0.14, ease: 'back.out(1.6)', delay: 0.9 });
    /* gentle idle float AFTER the entrance, in GSAP only — the old CSS
       keyframe floats fought GSAP's inline transforms and made the hero
       image/cards shake oddly */
    gsap.to('#heroRobot', { y: -14, duration: 2.75, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 2 });
    gsap.to('.stat-card', { y: -9, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut', stagger: { each: 0.65 }, delay: 2.4 });
    /* safety net: gsap.from() hides the hero instantly (immediateRender) and
       only the GSAP ticker makes it visible again. If the ticker ever stalls
       (background tab, throttled mobile WebView, stalled CDN) the hero would
       stay a black empty space — so force it visible after 3.5s no matter what */
    setTimeout(() => {
      gsap.set('.hero-copy > *, #heroRobot, .stat-card', { clearProps: 'opacity,visibility,transform' });
    }, 3500);
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  /* ================= SCROLL-SHATTER =================
     Tight scrub sequence: idle -> shatter -> swirl -> reassemble ->
     dock-left + copy-right. Fine glowing shards (baked sprite atlas).
     End state is fully JS-driven so it is deterministic on every viewport.
  */
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

  // phase windows as fractions of scrub progress p — deliberately tight and
  // slightly overlapping, so something is always animating between 0.05 and 0.86
  const PH = {
    idleEnd: 0.05,
    ex0: 0.05, ex1: 0.32,   // shatter / explode (per-shard stagger adds +0..0.08 to ex0)
    sw0: 0.28, sw1: 0.54,   // swirl (overlaps explode tail)
    dk0: 0.50, dk1: 0.80,   // reassemble / converge to dock (overlaps swirl tail)
    cf0: 0.76, cf1: 0.86,   // crossfade canvas -> clean docked image
    cp0: 0.64, cp1: 0.84,   // copy stagger reveal (starts while reassembling)
    hint0: 0.02, hint1: 0.09
  };
  const MOBILE_BP = 920; // must match the CSS breakpoint

  const S = {
    ready: false, shards: [], atlas: null,
    W: 0, H: 0, homeX: 0, homeY: 0, homeW: 0, homeH: 0,
    dockX: 0, dockY: 0, dockW: 0, dockH: 0, dockScale: 0.42,
    mobile: false, diag: 0, tw: 0, th: 0, padCss: 0
  };

  function layout() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H || !img.naturalWidth) return false;
    S.W = W; S.H = H;
    S.mobile = W < MOBILE_BP;
    S.diag = Math.hypot(W, H);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ar = img.naturalWidth / img.naturalHeight;
    let homeH = H * (S.mobile ? 0.46 : 0.78);
    let homeW = homeH * ar;
    const maxW = W * (S.mobile ? 0.66 : 0.46);
    if (homeW > maxW) { homeW = maxW; homeH = homeW / ar; }
    S.homeW = homeW; S.homeH = homeH;
    S.homeX = (W - homeW) / 2;
    S.homeY = (H - homeH) / 2 - (S.mobile ? H * 0.04 : 0);

    // ---- fine shard grid ----
    const cols = S.mobile ? 30 : 54;
    const rows = S.mobile ? 34 : 62;
    const tw = homeW / cols, th = homeH / rows;
    S.tw = tw; S.th = th;

    // full-res source for brightness sampling + atlas painting
    const AA = 2;
    const off = document.createElement('canvas');
    off.width = Math.max(2, Math.round(homeW * AA));
    off.height = Math.max(2, Math.round(homeH * AA));
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 0, off.width, off.height);
    let px = null;
    try { px = octx.getImageData(0, 0, off.width, off.height).data; }
    catch (e) { px = null; }

    // ---- sprite atlas with baked red-glow shard edges ----
    // (glow is baked once at layout time so per-frame rendering stays cheap)
    const PAD = 8; // atlas-px padding around each tile for glow bleed
    const cwA = Math.ceil(tw * AA) + PAD * 2;
    const chA = Math.ceil(th * AA) + PAD * 2;
    const atlas = document.createElement('canvas');
    atlas.width = cols * cwA;
    atlas.height = rows * chA;
    const actx = atlas.getContext('2d');
    S.padCss = PAD / AA;

    const rnd = mulberry32(20261001);
    const shards = [];
    const swA = off.width / cols, shA = off.height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (px) {
          const sx = Math.min(off.width - 1, Math.floor((c + 0.5) * swA));
          const sy = Math.min(off.height - 1, Math.floor((r + 0.5) * shA));
          const i = (sy * off.width + sx) * 4;
          if ((px[i] + px[i + 1] + px[i + 2]) / 3 < 12) continue; // skip near-black
        }
        const ax = c * cwA, ay = r * chA;
        actx.drawImage(off, c * swA, r * shA, swA, shA,
          ax + PAD, ay + PAD, cwA - PAD * 2, chA - PAD * 2);
        // baked red glow edge
        actx.save();
        actx.shadowColor = 'rgba(255,45,45,0.95)';
        actx.shadowBlur = 9;
        actx.strokeStyle = 'rgba(255,96,96,0.9)';
        actx.lineWidth = 2.5;
        actx.strokeRect(ax + PAD + 1, ay + PAD + 1, cwA - PAD * 2 - 2, chA - PAD * 2 - 2);
        actx.restore();
        actx.strokeStyle = 'rgba(255,130,130,0.5)';
        actx.lineWidth = 1;
        actx.strokeRect(ax + PAD + 1, ay + PAD + 1, cwA - PAD * 2 - 2, chA - PAD * 2 - 2);

        shards.push({
          c, r, ax, ay, aw: cwA, ah: chA,
          ang: rnd() * Math.PI * 2,
          dist: 0.10 + rnd() * 0.38,
          rot: (rnd() - 0.5) * 6,
          sdir: rnd() > 0.5 ? 1 : -1,
          samt: (0.6 + rnd() * 1.2) * Math.PI,
          dly: rnd() // deterministic per-shard stagger for the shatter cascade
        });
      }
    }
    S.atlas = atlas;
    S.shards = shards;

    // ---- deterministic end-state geometry (JS is the single source of truth) ----
    const dw = homeW * S.dockScale, dh = homeH * S.dockScale;
    S.dockW = dw; S.dockH = dh;
    if (S.mobile) {
      // docked top-center, copy centered below it
      S.dockX = (W - dw) / 2;
      S.dockY = H * 0.08;
      setDocked(S.dockX, S.dockY, dw);
      const cwCopy = Math.min(W * 0.88, 520);
      copy.style.width = cwCopy + 'px';
      copy.style.left = ((W - cwCopy) / 2) + 'px';
      copy.style.right = 'auto';
      copy.style.top = (S.dockY + dh + Math.min(28, H * 0.035)) + 'px';
      copy.style.transform = 'none';
      copy.style.textAlign = 'center';
    } else {
      // robot reassembles SMALL on the LEFT, copy reveals on the RIGHT
      S.dockX = W * 0.07;
      S.dockY = (H - dh) / 2;
      setDocked(S.dockX, S.dockY, dw);
      const cwCopy = Math.min(W * 0.44, 560);
      copy.style.width = cwCopy + 'px';
      copy.style.left = (W * 0.94 - cwCopy) + 'px';
      copy.style.right = 'auto';
      copy.style.top = '50%';
      copy.style.transform = 'translateY(-50%)';
      copy.style.textAlign = 'left';
    }
    S.ready = true;
    return true;
  }

  function setDocked(x, y, w) {
    docked.style.left = x + 'px';
    docked.style.top = y + 'px';
    docked.style.width = w + 'px';
    docked.style.transform = 'none';
    docked.style.right = 'auto';
  }

  function render(p, now) {
    if (!S.ready) return;
    const { W, H, shards, atlas } = S;
    const tw = S.tw, th = S.th, padC = S.padCss;
    const cx = W / 2, cy = H / 2;

    const sT = easeIO(smooth(PH.sw0, PH.sw1, p)); // swirl
    const dT = easeIO(smooth(PH.dk0, PH.dk1, p)); // dock / reassemble

    ctx.clearRect(0, 0, W, H);
    const canvasAlpha = 1 - smooth(PH.cf0, PH.cf1, p);
    ctx.globalAlpha = canvasAlpha;

    for (let k = 0; k < shards.length; k++) {
      const s = shards[k];
      const eT = easeIO(smooth(PH.ex0 + s.dly * 0.08, PH.ex1, p)); // staggered shatter
      const hx = S.homeX + (s.c + 0.5) * tw;
      const hy = S.homeY + (s.r + 0.5) * th;

      // idle float before the shatter begins
      const fy = p < PH.idleEnd
        ? Math.sin(now * 0.0012 + s.c * 0.35 + s.r * 0.2) * 6 * (1 - p / PH.idleEnd)
        : 0;

      // explode outward + downward drift
      const ex = Math.cos(s.ang) * s.dist * S.diag;
      const ey = Math.sin(s.ang) * s.dist * S.diag * 0.7 + eT * eT * H * 0.22;
      let x = hx + ex * eT;
      let y = hy + ey * eT + fy;

      // swirl around stage center
      if (sT > 0) {
        const a = sT * s.samt * s.sdir;
        const pull = 1 - 0.30 * sT;
        const dx = (x - cx) * pull, dy = (y - cy) * pull;
        const ca = Math.cos(a), sa = Math.sin(a);
        x = cx + dx * ca - dy * sa;
        y = cy + dx * sa + dy * ca;
      }

      // converge onto the docked rect (smaller, left side)
      const tx = S.dockX + (s.c + 0.5) * tw * S.dockScale;
      const ty = S.dockY + (s.r + 0.5) * th * S.dockScale;
      x = lerp(x, tx, dT);
      y = lerp(y, ty, dT);

      const sc = (1 + eT * 0.25) * lerp(1, S.dockScale, dT);
      const rot = eT * s.rot + sT * s.sdir * 1.6;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      ctx.drawImage(atlas, s.ax, s.ay, s.aw, s.ah,
        -tw / 2 - padC, -th / 2 - padC, tw + padC * 2, th + padC * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // crossfade to the clean docked image + stagger-reveal the copy
    docked.style.opacity = smooth(PH.cf0, PH.cf1, p).toFixed(3);
    const cpO = smooth(PH.cp0, PH.cp1, p);
    copy.style.opacity = cpO.toFixed(3);
    copy.style.visibility = p > PH.cp0 ? 'visible' : 'hidden';
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const t0 = PH.cp0 + (i / n) * (PH.cp1 - PH.cp0) * 0.7;
      const it = smooth(t0, Math.min(PH.cp1, t0 + 0.12), p);
      items[i].style.opacity = it.toFixed(3);
      items[i].style.transform = 'translateY(' + ((1 - it) * 34).toFixed(1) + 'px)';
    }
    hint.style.opacity = (1 - smooth(PH.hint0, PH.hint1, p)).toFixed(3);
  }

  function fallbackStatic() {
    // reduced-motion / no-GSAP / image-fail: show the composed end state, no pin
    canvas.style.display = 'none';
    ['left', 'top', 'width', 'transform', 'right', 'textAlign'].forEach(k => {
      docked.style[k] = ''; copy.style[k] = '';
    });
    docked.style.opacity = '1';
    copy.style.opacity = '1'; copy.style.visibility = 'visible';
    items.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
    hint.style.display = 'none';
  }

  let rafId = 0, layoutTries = 0;
  function loop(now) {
    // safety net: if layout never succeeded (e.g. zero-size stage on load),
    // retry for a short while instead of leaving a black canvas
    if (!S.ready && layoutTries < 90) { layoutTries++; layout(); }
    if (S.ready) {
      const r = stage.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) render(currentP, now);
    }
    rafId = requestAnimationFrame(loop);
  }

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (layout()) render(currentP, performance.now()); }, 220);
  });

  let booted = false; // img.onload can fire twice for cached images (manual call + load event); boot exactly once
  function boot() {
    if (booted) return;
    booted = true;
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
        end: '+=160%',
        pin: true,
        scrub: 1,
        anticipatePin: 1,
        onUpdate: self => { currentP = self.progress; }
      }
    });
    render(0, performance.now());
    rafId = requestAnimationFrame(loop);
    ScrollTrigger.refresh();
  }
  img.onload = boot;
  img.onerror = () => { if (!booted) { booted = true; fallbackStatic(); } };
  // cached image edge case
  if (img.complete && img.naturalWidth) boot();

})();

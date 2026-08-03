/* ================================================================
   JIAN GUAN — motion & interaction layer  (v2)

   Loaded after main.js. Purely additive: remove this file and
   css/motion.css and the site behaves exactly as it did before.
   No dependencies, no build step.
   ================================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var isReduced = function () { return reduced.matches; };

  /* rAF-coalesced scroll subscription, so every feature below shares
     one listener and one layout read per frame. */
  var scrollFns = [];
  var ticking = false;
  function onScroll(fn) { scrollFns.push(fn); }
  function flush() {
    ticking = false;
    for (var i = 0; i < scrollFns.length; i++) scrollFns[i]();
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(flush); }
  }, { passive: true });
  window.addEventListener('resize', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(flush); }
  }, { passive: true });

  /* ── Entrance flag ────────────────────────────────────────────
     A couple of hero details are transitions rather than keyframes
     (they need to survive theme changes), so they wait for this. */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.body.classList.add('is-entered');
    });
  });

  /* ── Nav: condensed state + reading progress ─────────────────── */
  (function () {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var root = document.documentElement;

    onScroll(function () {
      var y = window.scrollY || root.scrollTop;
      nav.classList.toggle('is-scrolled', y > 8);

      var max = root.scrollHeight - window.innerHeight;
      var p = max > 40 ? Math.min(1, Math.max(0, y / max)) : 0;
      root.style.setProperty('--scroll-progress', p.toFixed(4));
    });
    flush();
  })();

  /* ── Magnetic icon buttons ───────────────────────────────────
     The button leans a few pixels toward the cursor. Small enough
     that you feel it rather than see it. */
  (function () {
    var row = document.querySelector('.hero__icons');
    if (!row || !window.matchMedia('(hover: hover)').matches) return;

    var btns = Array.prototype.slice.call(row.querySelectorAll('.icon-btn'));
    var raf = null, pending = null;

    function apply() {
      raf = null;
      var e = pending;
      btns.forEach(function (b) {
        var r = b.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = e.clientX - cx;
        var dy = e.clientY - cy;
        var dist = Math.hypot(dx, dy);
        var reach = 76;
        if (dist < reach) {
          var pull = (1 - dist / reach) * 0.32;
          b.style.setProperty('--mx', (dx * pull).toFixed(2) + 'px');
          b.style.setProperty('--my', (dy * pull).toFixed(2) + 'px');
        } else {
          b.style.setProperty('--mx', '0px');
          b.style.setProperty('--my', '0px');
        }
      });
    }

    window.addEventListener('pointermove', function (e) {
      if (isReduced()) return;
      pending = e;
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      btns.forEach(function (b) {
        b.style.setProperty('--mx', '0px');
        b.style.setProperty('--my', '0px');
      });
    });
  })();

  /* ── Figures: draw themselves, then click to enlarge ──────────
     Each figure is revealed along its own reading axis, declared by
     data-wipe on the <img>: "right" for a time series, "up" for an
     altitude profile, "down" for a stack of panels.

     One rule, deliberately: if any part of the figure is in the
     viewport, play a fixed 1.1s draw, once. An earlier version tried to
     scrub the draw against scroll position and decided whether to play
     from a threshold — which meant a figure that never crossed the
     threshold stayed masked out, i.e. invisible, forever. The failure
     mode here is "no animation", never "no figure". */
  var SAFETY_MS = 2500;

  function setUpWipe(wrap, img) {
    var dir = img.getAttribute('data-wipe');
    if (!dir || isReduced()) return;       /* no attribute => no mask at all */

    wrap.setAttribute('data-wipe', dir);
    wrap.style.setProperty('--wipe', '0');
    var started = false;

    function inViewport() {
      var r = wrap.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }

    function start() {
      if (started) return;
      started = true;
      var t0 = performance.now(), dur = 1100;
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur);
        wrap.style.setProperty('--wipe', (1 - Math.pow(1 - k, 3)).toFixed(4));
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    }

    function check() { if (!started && inViewport()) start(); }

    onScroll(check);   /* shared rAF-coalesced scroll + resize listener */
    check();           /* and once right now, for whatever is already on screen */

    /* Last resort: if anything above went wrong and the figure is sitting
       on screen still masked, just show it. */
    setTimeout(function () {
      if (!started && inViewport()) wrap.removeAttribute('data-wipe');
    }, SAFETY_MS);
  }

  /* ── Figures: click to enlarge ───────────────────────────────── */
  (function () {
    var figs = document.querySelectorAll('.figure-zoom');
    if (!figs.length) return;

    var box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Enlarged figure');
    box.innerHTML = '<img alt=""><span class="lightbox__hint">Click anywhere or press Esc to close</span>';
    document.body.appendChild(box);
    var bigImg = box.querySelector('img');
    var lastFocus = null;

    function open(src, alt) {
      lastFocus = document.activeElement;
      bigImg.src = src;
      bigImg.alt = alt || '';
      box.classList.add('is-open');
      box.tabIndex = -1;
      box.focus();
    }
    function close() {
      box.classList.remove('is-open');
      if (lastFocus) lastFocus.focus();
    }

    Array.prototype.forEach.call(figs, function (f) {
      /* Wrap at runtime so the badge affordance costs nothing in the markup. */
      var wrap = document.createElement('span');
      wrap.className = 'figure-zoom-wrap';
      f.parentNode.insertBefore(wrap, f);
      wrap.appendChild(f);
      var badge = document.createElement('span');
      badge.className = 'figure-zoom-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = 'Enlarge';
      wrap.appendChild(badge);

      setUpWipe(wrap, f);

      f.addEventListener('click', function () { open(f.currentSrc || f.src, f.alt); });
      f.setAttribute('tabindex', '0');
      f.setAttribute('role', 'button');
      f.setAttribute('aria-label', 'Enlarge figure');
      f.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(f.currentSrc || f.src, f.alt); }
      });
    });

    box.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && box.classList.contains('is-open')) close();
    });
  })();

  /* ================================================================
     OZONE ARTICLE — "emergence from noise" schematic

     One idea, one control. The forced trend is fixed; the slider only
     changes the internal variability of the background. The detection
     year moves anyway — which is the paper's point.
     ================================================================ */
  (function () {
    var canvas = document.getElementById('emergence-canvas');
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext('2d');
    var slider = document.getElementById('emergence-sigma');
    var readout = document.getElementById('emergence-readout');
    var yearOut = readout.querySelector('[data-year]');
    var sigmaOut = readout.querySelector('[data-sigma]');

    var Y0 = 1950, Y1 = 2000, START = 1955, AMP = 7, EXP = 1.8, K = 2;
    var W = 660, H = 290, narrow = false;
    var PAD = { l: 52, r: 18, t: 16, b: 34 };
    var YMIN = -10, YMAX = 4;
    var NENS = 10;

    /* Size the drawing surface in real CSS pixels rather than scaling a fixed
       660px canvas down — otherwise the labels become unreadable on a phone. */
    function measure() {
      var host = canvas.parentNode;
      var avail = host.getBoundingClientRect().width -
        parseFloat(getComputedStyle(host).paddingLeft) -
        parseFloat(getComputedStyle(host).paddingRight);
      W = Math.max(260, Math.round(avail));
      narrow = W < 440;
      H = narrow ? 230 : 290;
      PAD.l = narrow ? 34 : 52;
      PAD.r = narrow ? 10 : 18;
      PAD.b = narrow ? 28 : 34;
      PAD.t = narrow ? 14 : 16;
    }

    /* Deterministic noise, so the figure is the same on every visit. */
    function lcg(seed) {
      return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    }
    function gauss(rnd) {
      var u = 0, v = 0;
      while (u === 0) u = rnd();
      while (v === 0) v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    /* AR(1) series with unit marginal variance. */
    var ENS = (function () {
      var rnd = lcg(20260629), phi = 0.55, s = Math.sqrt(1 - phi * phi), out = [];
      for (var m = 0; m < NENS; m++) {
        var x = gauss(rnd), row = [];
        for (var y = Y0; y <= Y1; y++) { x = phi * x + s * gauss(rnd); row.push(x); }
        out.push(row);
      }
      return out;
    })();

    function forced(y) {
      if (y <= START) return 0;
      return -AMP * Math.pow((y - START) / (Y1 - START), EXP);
    }
    function emergenceYear(sigma) {
      for (var y = START; y <= Y1; y += 0.05) {
        if (-forced(y) >= K * sigma) return y;
      }
      return null;
    }

    var sx = function (y) { return PAD.l + (y - Y0) / (Y1 - Y0) * (W - PAD.l - PAD.r); };
    var sy = function (v) { return PAD.t + (YMAX - v) / (YMAX - YMIN) * (H - PAD.t - PAD.b); };

    function css(name, fallback) {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    }

    /* draw() takes a 0..1 reveal factor so the trend can draw itself in. */
    var sigma = 1.2, progress = 0;

    function draw() {
      measure();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        canvas.style.width = '100%'; canvas.style.height = H + 'px';
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var cText = css('--text-2', '#475569');
      var cFaint = css('--text-3', '#94a3b8');
      var cBorder = css('--border', '#e2e8f0');
      var cTeal = css('--teal', '#1b9aaa');
      var cAmber = css('--amber', '#d97706');

      /* Grid + axes */
      ctx.strokeStyle = cBorder; ctx.lineWidth = 1;
      ctx.fillStyle = cFaint;
      ctx.font = '500 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (var v = 4; v >= -10; v -= (narrow ? 4 : 2)) {
        var yy = Math.round(sy(v)) + 0.5;
        ctx.globalAlpha = v === 0 ? 1 : 0.45;
        ctx.beginPath(); ctx.moveTo(PAD.l, yy); ctx.lineTo(W - PAD.r, yy); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(v > 0 ? '+' + v : String(v), PAD.l - 6, yy);
      }
      ctx.textBaseline = 'top';
      for (var yr = 1950; yr <= 2000; yr += (narrow ? 25 : 10)) {
        /* Keep the first and last labels inside the plot instead of centring
           them on the axis ends, where they would be clipped. */
        ctx.textAlign = yr === Y0 ? 'left' : (yr === Y1 ? 'right' : 'center');
        ctx.fillText(String(yr), sx(yr), H - PAD.b + 8);
      }

      /* Axis title — dropped on phones, where it would eat the plot area. */
      if (!narrow) {
        ctx.save();
        ctx.translate(13, (H - PAD.b + PAD.t) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = cFaint;
        ctx.font = '600 9.5px Inter, system-ui, sans-serif';
        ctx.fillText('OZONE ANOMALY (%)', 0, 0);
        ctx.restore();
      }

      /* ±Kσ noise band around zero */
      ctx.fillStyle = cFaint;
      ctx.globalAlpha = 0.13;
      ctx.fillRect(PAD.l, sy(K * sigma), W - PAD.l - PAD.r, sy(-K * sigma) - sy(K * sigma));
      ctx.globalAlpha = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = cFaint; ctx.globalAlpha = 0.6;
      [K * sigma, -K * sigma].forEach(function (b) {
        ctx.beginPath(); ctx.moveTo(PAD.l, sy(b)); ctx.lineTo(W - PAD.r, sy(b)); ctx.stroke();
      });
      ctx.setLineDash([]); ctx.globalAlpha = 1;

      /* Ensemble members: forced trend + internal variability */
      ctx.lineWidth = 1;
      ctx.strokeStyle = cText;
      ctx.globalAlpha = 0.16;
      ENS.forEach(function (row) {
        ctx.beginPath();
        for (var i = 0; i < row.length; i++) {
          var y = Y0 + i;
          var val = forced(y) + row[i] * sigma;
          if (i === 0) ctx.moveTo(sx(y), sy(val)); else ctx.lineTo(sx(y), sy(val));
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      /* The forced trend */
      var endYear = Y0 + (Y1 - Y0) * progress;
      ctx.strokeStyle = cTeal; ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var y2 = Y0; y2 <= endYear; y2 += 0.5) {
        var p = sy(forced(y2));
        if (y2 === Y0) ctx.moveTo(sx(y2), p); else ctx.lineTo(sx(y2), p);
      }
      ctx.stroke();

      /* Detection marker */
      var ey = emergenceYear(sigma);
      if (ey && ey <= endYear) {
        var ex = sx(ey);
        ctx.strokeStyle = cAmber; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(ex, PAD.t); ctx.lineTo(ex, H - PAD.b); ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = cAmber;
        ctx.beginPath(); ctx.arc(ex, sy(forced(ey)), 4, 0, Math.PI * 2); ctx.fill();

        var label = narrow ? String(Math.round(ey)) : Math.round(ey) + ' — detected';
        ctx.font = '700 10px Inter, system-ui, sans-serif';
        var tw = ctx.measureText(label).width;
        var bx = Math.min(ex + 8, W - PAD.r - tw - 14);
        ctx.fillStyle = cAmber; ctx.globalAlpha = 0.14;
        roundRect(bx, PAD.t + 2, tw + 12, 17, 5); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = cAmber;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 6, PAD.t + 11);
      }

      /* Legend — the readout below the chart already names both series on phones. */
      if (narrow) return;
      ctx.font = '500 9.5px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      var lx = PAD.l + 6, ly = H - PAD.b - 12;
      ctx.strokeStyle = cTeal; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke();
      ctx.fillStyle = cText; ctx.fillText('forced trend', lx + 21, ly);
      var lx2 = lx + 21 + ctx.measureText('forced trend').width + 16;
      ctx.strokeStyle = cText; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx2, ly); ctx.lineTo(lx2 + 16, ly); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = cText; ctx.fillText('individual realizations', lx2 + 21, ly);
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function syncReadout() {
      var ey = emergenceYear(sigma);
      yearOut.textContent = ey ? String(Math.round(ey)) : 'not in this century';
      sigmaOut.textContent = sigma.toFixed(2);
    }

    function update() {
      sigma = parseInt(slider.value, 10) / 100;
      syncReadout();
      draw();
    }

    slider.addEventListener('input', update);
    document.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var target = parseInt(b.dataset.preset, 10);
        if (isReduced()) { slider.value = target; update(); return; }
        var from = parseInt(slider.value, 10), t0 = performance.now(), dur = 620;
        (function step(now) {
          var k = Math.min(1, (now - t0) / dur);
          var e = 1 - Math.pow(1 - k, 3);
          slider.value = Math.round(from + (target - from) * e);
          update();
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      });
    });

    /* Draw the trend in when the figure first scrolls into view. */
    function animateIn() {
      if (isReduced()) { progress = 1; update(); return; }
      var t0 = performance.now(), dur = 1000;
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur);
        progress = 1 - Math.pow(1 - k, 3);
        draw();
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    }

    syncReadout();
    draw();
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); animateIn(); } });
      }, { threshold: 0.25 });
      io.observe(canvas);
    } else {
      progress = 1; draw();
    }

    /* Repaint on theme change — the canvas reads CSS custom properties. */
    new MutationObserver(function () { draw(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', draw, { passive: true });
  })();

  /* ================================================================
     EASTER EGG — "the ascent"
     Type  o-z-o-n-e  anywhere on the site and the window becomes a
     camera flying up out of the atmosphere, past the tropopause and
     through the ozone layer, until the curve of the planet rises into
     frame. Also reachable by clicking the footer line five times, for
     touch. The scene itself is built in build() below and laid out by
     the .limbview rules in motion.css.
     Non-blocking: pointer-events are off and any key or click ends it.
     ================================================================ */
  (function () {
    var CODE = 'ozone';
    var buf = '';
    var view = null;
    var timer = null;

    function build() {
      /* The altitude scale: one tick per 10 km, 1 km == 1% of the camera. */
      var ticks = '';
      for (var km = 10; km <= 90; km += 10) {
        ticks += '<span class="limbview__tick" style="bottom:' + km + '%"><i></i><b>' + km + ' km</b></span>';
      }

      var el = document.createElement('div');
      el.className = 'limbview';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML =
        '<div class="limbview__scene">' +
          '<div class="limbview__camera">' +
            '<div class="limbview__strip"></div>' +
            '<div class="limbview__ozone"></div>' +
            '<div class="limbview__rule limbview__rule--tropopause"></div>' +
            '<div class="limbview__rule limbview__rule--stratopause"></div>' +
            ticks +
            '<div class="limbview__band limbview__band--meso">Mesosphere</div>' +
            '<div class="limbview__band limbview__band--strat">Stratosphere · O₃</div>' +
            '<div class="limbview__band limbview__band--tropo">Troposphere</div>' +
          '</div>' +
        '</div>' +
        '<div class="limbview__horizon"></div>' +
        '<div class="limbview__caption">You just flew out of the atmosphere. The bright band you passed through at 15–35 km is the ozone layer.</div>';
      document.body.appendChild(el);
      return el;
    }

    function show() {
      if (view && view.classList.contains('is-on')) return;
      if (!view) view = build();
      /* Rebuild the animated subtree so a repeat trigger replays the flight
         from the ground rather than resuming a finished animation. */
      view.classList.remove('is-on', 'is-off', 'is-static');
      var fresh = build();
      view.parentNode.replaceChild(fresh, view);
      view = fresh;
      void view.offsetWidth;

      var still = isReduced();
      view.classList.add('is-on');
      if (still) view.classList.add('is-static');

      clearTimeout(timer);
      timer = setTimeout(hide, still ? 5000 : 8200);
      document.addEventListener('keydown', dismiss, { once: true });
      document.addEventListener('pointerdown', dismiss, { once: true });
    }

    function hide() {
      if (view) { view.classList.remove('is-on'); view.classList.add('is-off'); }
      clearTimeout(timer);
    }
    function dismiss() { hide(); }

    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-CODE.length);
      if (buf === CODE) { buf = ''; show(); }
    });

    /* Touch route: five taps on the footer line. */
    var foot = document.querySelector('.footer .container');
    if (foot) {
      var taps = 0, tapTimer = null;
      foot.addEventListener('click', function () {
        taps++;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(function () { taps = 0; }, 1200);
        if (taps >= 5) { taps = 0; show(); }
      });
    }
  })();
})();

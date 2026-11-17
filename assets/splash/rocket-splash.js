/*!
 * rocket-splash.js — minimal line-art rocket launch intro for the home page.
 *
 * Builds its own overlay, plays once per browser session, and stays skippable
 * by click or Esc. It also respects the user's reduced-motion preference.
 */
(function () {
    'use strict';

    if (window.__sjRocketSplash) return;
    window.__sjRocketSplash = true;

    // respect system reduced-motion preference: no splash at all
    var reduceMotion = false;
    try {
        reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { /* ignore */ }
    if (reduceMotion) return;

    // once per browser session
    try {
        if (sessionStorage.getItem('sjrocket.v1')) return;
        sessionStorage.setItem('sjrocket.v1', '1');
    } catch (e) { /* play anyway */ }

    var overlay = document.createElement('div');
    overlay.className = 'sj-splash';
    overlay.innerHTML =
        '<canvas class="sj-splash-canvas"></canvas>' +
        '<div class="sj-splash-hud">' +
        '  <div class="sj-splash-top">' +
        '    <span class="sj-splash-tag">LAUNCH SEQUENCE</span>' +
        '    <span class="sj-splash-skip">CLICK / ESC TO SKIP</span>' +
        '  </div>' +
        '  <div class="sj-splash-bottom">' +
        '    <div class="sj-splash-progress"><i></i></div>' +
        '    <span class="sj-splash-phase">STANDBY</span>' +
        '  </div>' +
        '</div>';
    document.body.appendChild(overlay);
    document.documentElement.classList.add('sj-splash-active');
    document.body.classList.add('sj-splash-active');

    var canvas = overlay.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var bar = overlay.querySelector('.sj-splash-progress i');
    var phaseEl = overlay.querySelector('.sj-splash-phase');

    var TAU = Math.PI * 2;
    var DURATION = 3.2;
    var IGNITION = 0.18;
    var LIFTOFF = 0.34;
    var FLIGHT_END = 2.25;
    var FADE_START = 2.72;

    // palette: ink lines, one green accent, faint blue grid
    var INK = '31, 45, 61';
    var SOFT = '94, 112, 128';
    var ACCENT = '#0b7a52';
    var GRID = 'rgba(70, 120, 200, 0.06)';

    var W = 0, H = 0, DPR = 1;
    var startTime = 0, lastTime = 0;
    var rafId = 0, running = false;
    var trail = [];
    var dots = [];
    var dotAcc = 0;
    var vanishDone = false;
    var rocket = { x: 0, y: 0, scale: 1, angle: 0, alpha: 1, p: 0 };

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function smoothstep(a, b, x) {
        var t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    }

    /* ------------------------------------------------------------------ *
     * Setup
     * ------------------------------------------------------------------ */
    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    /* ------------------------------------------------------------------ *
     * Rocket path
     * ------------------------------------------------------------------ */
    function rocketState(t) {
        var p = clamp((t - LIFTOFF) / (FLIGHT_END - LIFTOFF), 0, 1);
        var e = Math.pow(p, 1.6);
        // Keep the enlarged ignition frame clear of the viewport edge.
        var x0 = W * 0.5, y0 = H - 112;
        var x1 = W * 0.55, y1 = H * 0.12;
        var x = x0 + (x1 - x0) * e + Math.sin(e * Math.PI) * 12;
        var y = y0 + (y1 - y0) * e;
        if (p === 0) y += Math.sin(t * 2.4) * 1.5;

        var pe = Math.min(1, p + 0.006);
        var e2 = Math.pow(pe, 1.6);
        var x2 = x0 + (x1 - x0) * e2 + Math.sin(e2 * Math.PI) * 12;
        var y2 = y0 + (y1 - y0) * e2;
        var angle = Math.atan2(x2 - x, -(y2 - y)) * 0.8 + 0.03;

        return {
            x: x,
            y: y,
            scale: 3.2 * (1 - 0.82 * e),
            angle: angle,
            alpha: 1 - smoothstep(0.86, 1, p),
            p: p
        };
    }

    /* ------------------------------------------------------------------ *
     * Update
     * ------------------------------------------------------------------ */
    function update(t, dt) {
        rocket = rocketState(t);

        // record the line trail
        if (t >= LIFTOFF && t <= FLIGHT_END + 0.02) {
            trail.push({ x: rocket.x, y: rocket.y });
            if (trail.length > 300) trail.splice(0, trail.length - 300);
        }

        // stardust dots
        if (t > IGNITION - 0.02 && t < FLIGHT_END) {
            dotAcc += dt * 30;
            while (dotAcc >= 1) {
                dotAcc -= 1;
                dots.push({
                    x: rocket.x + (Math.random() - 0.5) * 7 * rocket.scale,
                    y: rocket.y + 3 * rocket.scale,
                    vx: (Math.random() - 0.5) * 48,
                    vy: 16 + Math.random() * 70,
                    life: 0,
                    max: 0.5 + Math.random() * 0.8,
                    size: 1.5 + Math.random() * 1.8
                });
            }
            if (dots.length > 220) dots.splice(0, dots.length - 220);
        }

        // radial burst the moment the rocket vanishes
        if (!vanishDone && t >= FLIGHT_END) {
            vanishDone = true;
            for (var b = 0; b < 30; b++) {
                var ang = Math.random() * TAU;
                var sp = 60 + Math.random() * 260;
                dots.push({
                    x: rocket.x,
                    y: rocket.y,
                    vx: Math.cos(ang) * sp,
                    vy: Math.sin(ang) * sp,
                    life: 0,
                    max: 0.7 + Math.random() * 1.0,
                    size: 1.8 + Math.random() * 1.8
                });
            }
        }

        for (var i = dots.length - 1; i >= 0; i--) {
            var d = dots[i];
            d.life += dt;
            if (d.life >= d.max) { dots.splice(i, 1); continue; }
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.vx *= Math.pow(0.4, dt);
            d.vy *= Math.pow(0.7, dt);
        }
    }

    /* ------------------------------------------------------------------ *
     * Render
     * ------------------------------------------------------------------ */
    function drawBackground() {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, W, H);

        // faint blueprint grid, matching the site's paper grid
        var step = 28;
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (var y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();

        // ground hairline
        ctx.strokeStyle = 'rgba(' + SOFT + ',0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H - 56);
        ctx.lineTo(W, H - 56);
        ctx.stroke();
    }

    function drawTrail(t) {
        var n = trail.length;
        if (n < 2) return;
        ctx.lineCap = 'round';
        ctx.setLineDash([3, 7]);
        ctx.lineDashOffset = -(t * 20);
        for (var i = 1; i < n; i++) {
            var k = i / n;
            ctx.strokeStyle = 'rgba(' + SOFT + ',' + (0.58 * k).toFixed(3) + ')';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
            ctx.lineTo(trail[i].x, trail[i].y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    function drawRocket(t) {
        if (rocket.alpha <= 0.01) return;

        ctx.save();
        ctx.translate(rocket.x, rocket.y);
        ctx.rotate(rocket.angle);
        ctx.scale(rocket.scale, rocket.scale);
        ctx.globalAlpha = rocket.alpha;
        ctx.strokeStyle = 'rgba(' + INK + ',0.90)';
        ctx.fillStyle = 'rgba(' + INK + ',0.90)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // flame — a short wavy accent line
        var flick = 0.72 + 0.28 * Math.sin(t * 36);
        var len = 14 + 11 * flick + Math.random() * 5;
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.globalAlpha = rocket.alpha * 0.9;
        ctx.beginPath();
        ctx.moveTo(0, 3);
        ctx.quadraticCurveTo(-3.4, 3 + len * 0.42, 0, 3 + len * 0.66);
        ctx.quadraticCurveTo(3.4, 3 + len * 0.86, 0, 3 + len);
        ctx.stroke();
        ctx.globalAlpha = rocket.alpha;
        ctx.lineWidth = 1.6;

        // fins — two thin swept lines
        ctx.strokeStyle = 'rgba(' + INK + ',0.90)';
        ctx.beginPath();
        ctx.moveTo(-5, -3);
        ctx.lineTo(-13.5, 7);
        ctx.moveTo(5, -3);
        ctx.lineTo(13.5, 7);
        ctx.stroke();

        // body — tapered outline
        ctx.beginPath();
        ctx.moveTo(-5.5, 1);
        ctx.quadraticCurveTo(-5.8, -16, -4.4, -29);
        ctx.quadraticCurveTo(-3.4, -36.5, 0, -39);
        ctx.quadraticCurveTo(3.4, -36.5, 4.4, -29);
        ctx.quadraticCurveTo(5.8, -16, 5.5, 1);
        ctx.closePath();
        ctx.stroke();

        // nozzle — two short ticks
        ctx.beginPath();
        ctx.moveTo(-4.2, 0);
        ctx.lineTo(-3.2, 4);
        ctx.moveTo(4.2, 0);
        ctx.lineTo(3.2, 4);
        ctx.stroke();

        // window — a small open ring
        ctx.beginPath();
        ctx.arc(0, -25, 3.2, 0, TAU);
        ctx.stroke();

        // hairline stripe across the body
        ctx.strokeStyle = 'rgba(' + INK + ',0.45)';
        ctx.beginPath();
        ctx.moveTo(-5.1, -15);
        ctx.lineTo(5.1, -15);
        ctx.stroke();

        ctx.restore();
    }

    function drawDots() {
        for (var i = 0; i < dots.length; i++) {
            var d = dots[i];
            var k = 1 - d.life / d.max;
            ctx.fillStyle = 'rgba(' + SOFT + ',' + (0.55 * k).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size, 0, TAU);
            ctx.fill();
        }
    }

    function drawFlash(t) {
        var ft = (t - (FLIGHT_END - 0.18)) / 1.2;
        if (ft < 0 || ft > 1) return;
        var k = clamp(ft, 0, 1);
        var a = 1 - k;
        var ease = 1 - Math.pow(1 - k, 2.2);           // fast start, gentle settle
        var x = rocket.x, y = rocket.y;
        var maxR = Math.min(W * 0.24, H * 0.42);       // ring diameter ~ half the screen width
        var r = 4 + ease * maxR;

        // faint diffusion wash, so it reads as an expanding wave
        var wash = ctx.createRadialGradient(x, y, 0, x, y, r);
        wash.addColorStop(0, 'rgba(11, 122, 82, ' + (0.15 * a) + ')');
        wash.addColorStop(0.7, 'rgba(11, 122, 82, ' + (0.06 * a) + ')');
        wash.addColorStop(1, 'rgba(11, 122, 82, 0)');
        ctx.fillStyle = wash;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();

        // outer + two inner rings
        ctx.strokeStyle = ACCENT;
        ctx.globalAlpha = a * 0.85;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = a * 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.62, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = a * 0.28;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.28, 0, TAU);
        ctx.stroke();

        // starburst ticks along the outer ring
        ctx.globalAlpha = a * 0.6;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 0; i < 16; i++) {
            var ang = i / 16 * TAU + k * 0.35;
            var l1 = r * 0.98;
            var l2 = r * 1.07 + 14 * k;
            ctx.moveTo(x + Math.cos(ang) * l1, y + Math.sin(ang) * l1);
            ctx.lineTo(x + Math.cos(ang) * l2, y + Math.sin(ang) * l2);
        }
        ctx.stroke();

        // center dot
        ctx.globalAlpha = a;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function render(t) {
        drawBackground();
        drawTrail(t);
        drawDots();

        // tiny camera shake right after ignition
        var shake = Math.max(0, 0.05 - Math.max(0, t - IGNITION) * 0.045);
        ctx.save();
        if (shake > 0) {
            ctx.translate((Math.random() - 0.5) * shake * 26, (Math.random() - 0.5) * shake * 26);
        }
        drawRocket(t);
        drawFlash(t);
        ctx.restore();
    }

    /* ------------------------------------------------------------------ *
     * Timeline / controls
     * ------------------------------------------------------------------ */
    function phaseLabel(t) {
        if (t < IGNITION) return 'STANDBY';
        if (t < LIFTOFF) return 'IGNITION';
        if (t < FLIGHT_END) return 'ASCENT';
        if (t < FADE_START) return 'OPENING SITE';
        if (t < DURATION) return 'ENTERING SITE';
        return 'REPLAY';
    }

    function frame(now) {
        rafId = 0;
        var t = (now - startTime) / 1000;
        var dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        if (t >= 0) {
            update(t, dt);
            render(t);
        }

        bar.style.width = Math.min(100, Math.max(0, (t / DURATION) * 100)) + '%';
        phaseEl.textContent = phaseLabel(t);

        if (t < DURATION) {
            rafId = requestAnimationFrame(frame);
        } else {
            running = false;
            finish();
        }
    }

    function finish() {
        overlay.classList.add('sj-splash-done');
        setTimeout(function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.documentElement.classList.remove('sj-splash-active');
            document.body.classList.remove('sj-splash-active');
        }, 650);
    }

    function skip() {
        if (!running) return;
        // jump to the tail so the fade starts right away
        startTime = performance.now() - (DURATION - 0.15) * 1000;
    }

    function reset() {
        startTime = performance.now();
        lastTime = startTime;
        trail = [];
        dots = [];
        dotAcc = 0;
        vanishDone = false;
        rocket = rocketState(0);
        bar.style.width = '0%';
        phaseEl.textContent = 'STANDBY';
        overlay.classList.remove('sj-splash-done');
        if (!running) {
            running = true;
            rafId = requestAnimationFrame(frame);
        }
    }

    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') skip();
    });

    window.addEventListener('pointerdown', skip);

    window.addEventListener('resize', resize);

    resize();
    reset();
})();

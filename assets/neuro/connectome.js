/* Interactive connectome: the 7 Yeo networks placed at their cortical centroids (lateral view),
   linked by how strongly the atlas white-matter bundles connect them. Hover or tap a network. */
(function () {
  "use strict";
  const root = document.getElementById("connectome");
  if (!root) return;
  const canvas = root.querySelector("canvas"), ctx = canvas.getContext("2d");
  const panel = root.querySelector(".cx-panel");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const base = root.dataset.base || "";

  Promise.all([
    fetch(base + "/assets/neuro/connectome.json").then((r) => r.json()),
    fetch(base + "/assets/neuro/hero.bin").then((r) => r.arrayBuffer()).catch(() => null)
  ]).then(([M, buf]) => init(M, buf)).catch(() => root.classList.add("is-failed"));

  function init(M, buf) {
    const N = M.networks.length;
    const col = (k, a) => `rgba(${M.colors[k].join(",")},${a})`;
    const lite = M.colors.map((c) => { const m = Math.max(...c); return c.map((v) => Math.round(90 + 165 * v / m)); });
    const lcol = (k, a) => `rgba(${lite[k].join(",")},${a})`;

    // node layout: lateral projection (anterior to the right), then gentle repulsion so labels don't collide
    const nodes = M.centroids.map((c, k) => ({ k, x: c[1], y: -c[2] }));
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const nx0 = Math.min(...xs), nx1 = Math.max(...xs), ny0 = Math.min(...ys), ny1 = Math.max(...ys);
    nodes.forEach((n) => { n.u = (n.x - nx0) / (nx1 - nx0) * 2 - 1; n.v = (n.y - ny0) / (ny1 - ny0) * 2 - 1; });
    for (let it = 0; it < 400; it++) for (const a of nodes) for (const b of nodes) {
      if (a === b) continue; const dx = a.u - b.u, dy = (a.v - b.v) * 1.6, d = Math.hypot(dx, dy) || 0.01;
      if (d < 1.0) { const f = (1.0 - d) * 0.04; a.u += dx / d * f; a.v += dy / d * f * 0.7; }
    }
    { // re-normalise to fill the frame after relaxation
      const us = nodes.map((n) => n.u), vs = nodes.map((n) => n.v), u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
      nodes.forEach((n) => { n.u = (n.u - u0) / (u1 - u0) * 2 - 1; n.v = (n.v - v0) / (v1 - v0) * 2 - 1; });
    }
    nodes.forEach((n) => { n.u = Math.max(-1, Math.min(1, n.u)); n.v = Math.max(-1, Math.min(1, n.v)); });
    const strength = M.W.map((r) => r.reduce((s, v) => s + v, 0));
    const smax = Math.max(...strength);

    const edges = [];
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) if (M.W[a][b] > 0.12) edges.push({ a, b, w: M.W[a][b] });

    // faint tractogram backdrop, same lateral projection
    let backdrop = null;
    if (buf) {
      const h = new Int32Array(buf, 0, 2), NS = h[0], NP = h[1], SP = new Int16Array(buf, 8, NS * NP * 3);
      backdrop = []; for (let s = 0; s < NS; s += 3) { const l = []; for (let p = 0; p < NP; p++) { const j = (s * NP + p) * 3; l.push(SP[j + 1] / 10, -SP[j + 2] / 10); } backdrop.push(l); }
    }

    let W = 0, H = 0, dpr = 1, sel = -1, hover = -1, t = 0, visible = false;
    const pulses = edges.flatMap((e, i) => Array.from({ length: 1 + Math.round(e.w * 3) }, () => ({ e: i, t: Math.random(), v: 0.08 + e.w * 0.18, dir: Math.random() < 0.5 ? 1 : -1 })));

    function layout() {
      const r = canvas.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mx = W * 0.16, my = H * 0.18;
      nodes.forEach((n) => { n.px = W / 2 + n.u * (W / 2 - mx); n.py = H / 2 + n.v * (H / 2 - my); n.r = 7 + 13 * strength[n.k] / smax; });
      // map backdrop (mm) into the same frame as the node centroids
      if (backdrop) {
        const sx = (W - 2 * mx) / (nx1 - nx0), sy = (H - 2 * my) / (ny1 - ny0), s = Math.min(sx, sy) * 1.0;
        const cx = W / 2 - ((nx0 + nx1) / 2) * s, cy = H / 2 - ((ny0 + ny1) / 2) * s;
        backdrop.map2 = backdrop.map((l) => l.map((v, i) => (i % 2 ? cy + v * s : cx + v * s)));
      }
    }
    function curve(e) {
      const A = nodes[e.a], B = nodes[e.b], mx = (A.px + B.px) / 2, my = (A.py + B.py) / 2;
      const dx = B.px - A.px, dy = B.py - A.py, d = Math.hypot(dx, dy) || 1, bow = 0.18 * d;
      return [A.px, A.py, mx - dy / d * bow, my + dx / d * bow, B.px, B.py];
    }
    const qpt = (c, u) => { const v = 1 - u; return [v * v * c[0] + 2 * v * u * c[2] + u * u * c[4], v * v * c[1] + 2 * v * u * c[3] + u * u * c[5]]; };

    function draw(dt) {
      t += dt; ctx.clearRect(0, 0, W, H);
      const focus = hover >= 0 ? hover : sel;
      if (backdrop && backdrop.map2) {
        ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(140,170,230,0.055)"; ctx.beginPath();
        for (const l of backdrop.map2) { ctx.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]); }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "lighter";
      edges.forEach((e) => {
        const on = focus < 0 || e.a === focus || e.b === focus, c = curve(e);
        const g = ctx.createLinearGradient(c[0], c[1], c[4], c[5]);
        const a = on ? 0.18 + 0.55 * e.w : 0.04;
        g.addColorStop(0, lcol(e.a, a)); g.addColorStop(1, lcol(e.b, a));
        ctx.strokeStyle = g; ctx.lineWidth = 0.8 + 5 * e.w * (on && focus >= 0 ? 1.3 : 1);
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(c[2], c[3], c[4], c[5]); ctx.stroke();
      });
      if (!reduce) pulses.forEach((p) => {
        const e = edges[p.e], on = focus < 0 || e.a === focus || e.b === focus;
        p.t += p.v * dt * p.dir; if (p.t > 1) p.t -= 1; if (p.t < 0) p.t += 1;
        const [x, y] = qpt(curve(e), p.t), k = p.t < 0.5 ? e.a : e.b;
        const r = on ? 2.4 + e.w * 2 : 1.2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, lcol(k, on ? 0.95 : 0.25)); g.addColorStop(1, lcol(k, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 6.283); ctx.fill();
      });
      nodes.forEach((n) => {
        const dim = focus >= 0 && n.k !== focus && !(M.W[focus][n.k] > 0.12);
        const beat = reduce ? 1 : 1 + 0.08 * Math.sin(t * 2 + n.k);
        const R = n.r * beat * (n.k === focus ? 1.25 : 1);
        const g = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, R * 3.2);
        g.addColorStop(0, lcol(n.k, dim ? 0.15 : 0.55)); g.addColorStop(1, lcol(n.k, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.px, n.py, R * 3.2, 0, 6.283); ctx.fill();
        ctx.fillStyle = col(n.k, dim ? 0.35 : 1); ctx.beginPath(); ctx.arc(n.px, n.py, R, 0, 6.283); ctx.fill();
        ctx.strokeStyle = lcol(n.k, dim ? 0.2 : 0.9); ctx.lineWidth = 1.5; ctx.stroke();
      });
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      nodes.forEach((n) => {
        const dim = focus >= 0 && n.k !== focus && !(M.W[focus][n.k] > 0.12);
        const label = M.networks[n.k].toUpperCase(), tw = ctx.measureText(label).width, ly = n.py + n.r + 20;
        ctx.fillStyle = "rgba(6,9,18,0.82)"; ctx.strokeStyle = lcol(n.k, dim ? 0.12 : 0.35); ctx.lineWidth = 1;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(n.px - tw / 2 - 8, ly - 10, tw + 16, 20, 10); else ctx.rect(n.px - tw / 2 - 8, ly - 10, tw + 16, 20);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = dim ? "rgba(200,210,230,0.35)" : "rgba(226,233,245,0.95)";
        ctx.fillText(label, n.px, ly + 0.5);
      });
    }

    function describe(k) {
      if (k < 0) { panel.innerHTML = panel.dataset.intro; return; }
      const partners = M.W[k].map((w, j) => ({ j, w })).filter((o) => o.j !== k && o.w > 0.12).sort((a, b) => b.w - a.w);
      const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
      panel.innerHTML = `<p class="cx-kicker" style="color:rgb(${lite[k].join(",")})">Network</p><h3>${M.networks[k]}</h3>` +
        `<p class="cx-note">Strongest white-matter links, and the atlas bundles that carry them:</p><ol class="cx-list">` +
        partners.slice(0, 4).map((o) => `<li><span class="cx-dot" style="background:rgb(${lite[o.j].join(",")})"></span><b>${M.networks[o.j]}</b>` +
          `<span class="cx-bar"><i style="width:${Math.round(o.w * 100)}%;background:rgb(${lite[o.j].join(",")})"></i></span>` +
          `<small>${(M.topTracts[key(k, o.j)] || []).slice(0, 3).map((n) => n.replace(/_([LR])$/, " $1").replace(/_/g, "-")).join(" · ")}</small></li>`).join("") + `</ol>`;
    }
    panel.dataset.intro = panel.innerHTML;

    function hit(e) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = -1, bd = 1e9; nodes.forEach((n) => { const d = Math.hypot(n.px - x, n.py - y); if (d < n.r + 22 && d < bd) { bd = d; best = n.k; } });
      return best;
    }
    canvas.addEventListener("pointermove", (e) => { const h = hit(e); if (h !== hover) { hover = h; canvas.style.cursor = h >= 0 ? "pointer" : "default"; describe(h >= 0 ? h : sel); if (reduce) draw(0); } });
    canvas.addEventListener("pointerleave", () => { hover = -1; describe(sel); if (reduce) draw(0); });
    canvas.addEventListener("click", (e) => { const h = hit(e); sel = h === sel ? -1 : h; describe(sel); if (reduce) draw(0); });

    let last = 0, raf = 0;
    function frame(now) { raf = 0; const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; draw(dt); if (visible && !document.hidden && !reduce) raf = requestAnimationFrame(frame); }
    function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }, { rootMargin: "100px" }).observe(canvas);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && visible) start(); });
    window.addEventListener("resize", () => { layout(); draw(0); });
    layout(); draw(0); root.classList.add("is-ready");
  }
})();

/* Site-wide background: 700 HCP-1065 atlas streamlines (2D lateral projection) drawn faintly,
   with light particles flowing along them. Pauses when the tab is hidden; static for reduced motion. */
(function () {
  "use strict";
  const me = document.currentScript;
  const src = document.documentElement.dataset.fibres || (me && me.dataset.src);
  if (!src || !window.HTMLCanvasElement) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // tract families: association, limbic, projection, commissural, cerebellar/brainstem
  const NET = [[95, 224, 168], [242, 166, 90], [122, 162, 255], [232, 106, 138], [196, 155, 255]];
  const cv = document.createElement("canvas");
  cv.className = "neuro-bg"; cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const ctx = cv.getContext("2d"), layer = document.createElement("canvas"), lctx = layer.getContext("2d");

  fetch(src).then((r) => r.arrayBuffer()).then((buf) => {
    const h = new Int32Array(buf, 0, 2), NS = h[0], NP = h[1];
    const P = new Int16Array(buf, 8, NS * NP * 2), TOP = new Uint8Array(buf, 8 + NS * NP * 4, NS);
    let W, H, dpr, pts;
    const parts = Array.from({ length: reduce ? 0 : 260 }, () => ({ s: (Math.random() * NS) | 0, t: Math.random(), v: (0.03 + Math.random() * 0.06) * (Math.random() < 0.5 ? 1 : -1) }));

    function layout() {
      W = window.innerWidth; H = window.innerHeight; dpr = Math.min(1.5, window.devicePixelRatio || 1);
      for (const c of [cv, layer]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      cv.style.width = W + "px"; cv.style.height = H + "px";
      // fit the brain on the right side on wide screens, centred on narrow ones
      const S = Math.min(W * (W > 900 ? 0.36 : 0.48), H * 0.46), cx = W > 900 ? W * 0.7 : W * 0.5, cy = H * 0.52;
      pts = new Float32Array(NS * NP * 2);
      for (let i = 0; i < NS * NP; i++) { pts[i * 2] = cx + P[i * 2] / 32000 * S * 1.15; pts[i * 2 + 1] = cy - P[i * 2 + 1] / 32000 * S * 0.82; }
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0); lctx.clearRect(0, 0, W, H); lctx.lineWidth = 0.7; lctx.globalCompositeOperation = "lighter";
      for (let s = 0; s < NS; s++) {
        const c = NET[TOP[s]]; lctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.05)`; lctx.beginPath();
        for (let p = 0; p < NP; p++) { const j = (s * NP + p) * 2; p ? lctx.lineTo(pts[j], pts[j + 1]) : lctx.moveTo(pts[j], pts[j + 1]); }
        lctx.stroke();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(layer, 0, 0);
    }
    layout();
    let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
    if (reduce) return;

    let last = performance.now(), raf = 0;
    function frame(now) {
      raf = 0; if (document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(layer, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        p.t += p.v * dt; if (p.t > 1 || p.t < 0) { p.s = (Math.random() * NS) | 0; p.t = p.v > 0 ? 0 : 1; }
        const f = p.t * (NP - 1), i0 = Math.min(NP - 2, f | 0), w = f - i0, j = (p.s * NP + i0) * 2;
        const x = pts[j] + (pts[j + 2] - pts[j]) * w, y = pts[j + 1] + (pts[j + 3] - pts[j + 1]) * w, c = NET[TOP[p.s]];
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.55)`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = g; ctx.fillRect(x - 7, y - 7, 14, 14);
      }
      raf = requestAnimationFrame(frame);
    }
    const go = () => { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener("visibilitychange", go); go();
  }).catch(() => {});
})();

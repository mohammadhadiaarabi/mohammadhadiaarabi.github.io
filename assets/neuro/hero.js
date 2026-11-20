/* Hero: live 3D tractography (4,180 streamlines from the HCP-1065 population tractography atlas, Yeh 2022)
   with light pulses and particles flowing along the fibres. Colour by fibre direction or by tract family.
   Needs THREE (r128). */
(function () {
  "use strict";
  const stage = document.getElementById("hero-stage");
  if (!stage || !window.THREE) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // tract families: association, limbic, projection, commissural, cerebellar/brainstem
  const NET = [[0.37, 0.88, 0.66], [0.95, 0.65, 0.35], [0.48, 0.64, 1.0], [0.91, 0.42, 0.54], [0.77, 0.61, 1.0]];
  const glow = (c) => { const m = Math.max(...c); return c.map((v) => 0.35 + 0.65 * v / m); };

  fetch(stage.dataset.src).then((r) => r.arrayBuffer()).then(build).catch(() => stage.classList.add("is-failed"));

  function build(buf) {
    const hdr = new Int32Array(buf, 0, 2), NS = hdr[0], NP = hdr[1];
    const SP = new Int16Array(buf, 8, NS * NP * 3);
    const off = 8 + NS * NP * 6, TOP = new Uint8Array(buf, off + NS, NS);
    const toV = (j) => [SP[j] / 1000, SP[j + 2] / 1000, -SP[j + 1] / 1000];

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    camera.position.set(-3.4, 0.55, -0.55);
    camera.lookAt(0, 0.08, 0.12);
    const brain = new THREE.Group();
    brain.position.set(0, -0.02, 0);
    scene.add(brain);

    // ---- streamlines
    const nv = NS * NP, pos = new Float32Array(nv * 3), aU = new Float32Array(nv), aSeed = new Float32Array(nv);
    const aDec = new Float32Array(nv * 3), aNet = new Float32Array(nv * 3), idx = new Uint32Array(NS * (NP - 1) * 2);
    let q = 0;
    for (let s = 0; s < NS; s++) {
      const seed = Math.random(), nc = glow(NET[TOP[s]]);
      for (let p = 0; p < NP; p++) {
        const i = s * NP + p, j = i * 3, v = toV(j);
        pos[j] = v[0]; pos[j + 1] = v[1]; pos[j + 2] = v[2];
        aU[i] = p / (NP - 1); aSeed[i] = seed;
        const a = (s * NP + Math.max(0, p - 1)) * 3, c = (s * NP + Math.min(NP - 1, p + 1)) * 3;
        let dx = Math.abs(SP[c] - SP[a]), dy = Math.abs(SP[c + 1] - SP[a + 1]), dz = Math.abs(SP[c + 2] - SP[a + 2]);
        const m = Math.max(dx, dy, dz) || 1;
        aDec[j] = 0.08 + 0.92 * dx / m; aDec[j + 1] = 0.08 + 0.92 * dy / m; aDec[j + 2] = 0.08 + 0.92 * dz / m;
        aNet[j] = nc[0]; aNet[j + 1] = nc[1]; aNet[j + 2] = nc[2];
        if (p < NP - 1) { idx[q++] = i; idx[q++] = i + 1; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aU", new THREE.BufferAttribute(aU, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    g.setAttribute("aDec", new THREE.BufferAttribute(aDec, 3));
    g.setAttribute("aNet", new THREE.BufferAttribute(aNet, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const U = { uTime: { value: 0 }, uMix: { value: 0 }, uFade: { value: 0 }, uPulse: { value: reduce ? 0 : 1 } };
    const fibreMat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aU; attribute float aSeed; attribute vec3 aDec; attribute vec3 aNet;
        varying float vU; varying float vSeed; varying vec3 vCol; uniform float uMix;
        void main(){ vU=aU; vSeed=aSeed; vCol=mix(aDec,aNet,uMix);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uFade; uniform float uPulse;
        varying float vU; varying float vSeed; varying vec3 vCol;
        void main(){
          float ph=fract(vSeed*13.0+uTime*(0.05+0.07*vSeed));
          float d=vU-ph; float pulse=exp(-d*d*260.0)*uPulse;
          float ends=smoothstep(0.0,0.12,vU)*smoothstep(1.0,0.88,vU);
          float a=(0.085+0.05*ends+pulse*0.85)*uFade;
          gl_FragColor=vec4(vCol*a,1.0);
        }`
    });
    brain.add(new THREE.LineSegments(g, fibreMat));

    // ---- particles riding along streamlines
    const NPART = reduce ? 0 : Math.min(2200, Math.round(NS * 0.5));
    const pS = new Uint32Array(NPART), pT = new Float32Array(NPART), pV = new Float32Array(NPART);
    const ppos = new Float32Array(NPART * 3), pcolD = new Float32Array(NPART * 3), pcolN = new Float32Array(NPART * 3), psz = new Float32Array(NPART);
    for (let k = 0; k < NPART; k++) {
      const s = (Math.random() * NS) | 0; pS[k] = s; pT[k] = Math.random(); pV[k] = (0.05 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1);
      const j = (s * NP + (NP >> 1)) * 3; pcolD[k * 3] = aDec[j]; pcolD[k * 3 + 1] = aDec[j + 1]; pcolD[k * 3 + 2] = aDec[j + 2];
      pcolN[k * 3] = aNet[j]; pcolN[k * 3 + 1] = aNet[j + 1]; pcolN[k * 3 + 2] = aNet[j + 2]; psz[k] = 0.6 + Math.random() * 1.2;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
    pg.setAttribute("aColD", new THREE.BufferAttribute(pcolD, 3));
    pg.setAttribute("aColN", new THREE.BufferAttribute(pcolN, 3));
    pg.setAttribute("aSize", new THREE.BufferAttribute(psz, 1));
    const UP = { uMix: U.uMix, uFade: U.uFade, uPx: { value: renderer.getPixelRatio() } };
    const partMat = new THREE.ShaderMaterial({
      uniforms: UP, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColD; attribute vec3 aColN; attribute float aSize; uniform float uMix; uniform float uPx; varying vec3 vC;
        void main(){ vC=mix(aColD,aColN,uMix); vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=aSize*uPx*9.0/(-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `
        uniform float uFade; varying vec3 vC;
        void main(){ vec2 c=gl_PointCoord-0.5; float r=dot(c,c); if(r>0.25) discard;
          float a=exp(-r*16.0)*uFade; gl_FragColor=vec4((vC*0.9+0.25)*a,1.0); }`
    });
    const points = new THREE.Points(pg, partMat);
    if (NPART) brain.add(points);

    function stepParticles(dt) {
      for (let k = 0; k < NPART; k++) {
        let t = pT[k] + pV[k] * dt;
        if (t > 1 || t < 0) { pS[k] = (Math.random() * NS) | 0; t = pV[k] > 0 ? 0 : 1; }
        pT[k] = t;
        const f = t * (NP - 1), p0 = Math.min(NP - 2, f | 0), w = f - p0, b = (pS[k] * NP + p0) * 3;
        ppos[k * 3] = pos[b] + (pos[b + 3] - pos[b]) * w;
        ppos[k * 3 + 1] = pos[b + 1] + (pos[b + 4] - pos[b + 1]) * w;
        ppos[k * 3 + 2] = pos[b + 2] + (pos[b + 5] - pos[b + 2]) * w;
      }
      pg.attributes.position.needsUpdate = true;
    }

    // ---- layout, interaction
    let W = 1, H = 1;
    function resize() {
      W = stage.clientWidth || 1; H = stage.clientHeight || 1;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      // wide screens: brain to the right of the headline; narrow screens: brain in the upper part, above the text
      const sx = W > 900 ? -W * 0.2 : 0, sy = W > 900 ? 0 : H * 0.2;
      camera.setViewOffset(W, H, sx, sy, W, H);
      camera.zoom = W > 900 ? 1.0 : (W > 600 ? 0.95 : 0.8);
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize); resize();

    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener("pointermove", (e) => { ptr.tx = e.clientX / window.innerWidth - 0.5; ptr.ty = e.clientY / window.innerHeight - 0.5; }, { passive: true });

    let mixTarget = 0;
    document.querySelectorAll("[data-fibre-mode]").forEach((btn) => btn.addEventListener("click", () => {
      mixTarget = btn.dataset.fibreMode === "family" ? 1 : 0;
      document.body.dataset.fibreMode = btn.dataset.fibreMode;
      document.querySelectorAll("[data-fibre-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    }));

    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) loop(); }, { threshold: 0 }).observe(stage);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) loop(); });

    let last = performance.now(), spin = 0, running = false;
    stage.classList.add("is-ready");
    function frame(now) {
      running = false;
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      U.uTime.value += dt;
      U.uFade.value = Math.min(1, U.uFade.value + dt * 0.6);
      U.uMix.value += (mixTarget - U.uMix.value) * Math.min(1, dt * 3);
      const sc = Math.min(1, window.scrollY / (H * 0.9));
      ptr.x += (ptr.tx - ptr.x) * 0.04; ptr.y += (ptr.ty - ptr.y) * 0.04;
      if (!reduce) spin += dt * 0.07;
      brain.rotation.y = spin + ptr.x * 0.5 + sc * 0.6;
      brain.rotation.x = ptr.y * 0.18;
      stage.style.opacity = String(1 - sc * 0.75);
      if (NPART) stepParticles(dt);
      renderer.render(scene, camera);
      if (reduce && U.uFade.value >= 1 && Math.abs(mixTarget - U.uMix.value) < 0.001) return;   // static frame
      schedule();
    }
    function schedule() { if (!running) { running = true; requestAnimationFrame(frame); } }
    function loop() { last = performance.now(); schedule(); }
    window.addEventListener("pointermove", () => { if (reduce) loop(); }, { passive: true });
    loop();
  }
})();

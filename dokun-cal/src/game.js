/* Dokun Çal — oyun
 * Kural: şarkıyı oyuncu çalar. Ses, en son açılan dokunuş noktasına kadar kesintisiz akar,
 * sıradaki noktanın tam başında durur ve bekler. Dokunuş o noktayı açar:
 *  - erken basılırsa nota yine TAM ZAMANINDA çalar (şarkı asla orijinal hızından hızlı akmaz)
 *  - geç basılırsa şarkı o ana kadar susmuş olur, dokununca kaldığı yerden devam eder
 * Başta bir dokunuş uzun bir parçayı açar, şarkı ilerledikçe parçalar küçülüp tek tek seslere iner.
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv'), g = cv.getContext('2d');
  const TAU = Math.PI * 2, rnd = Math.random;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dokuncal_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dokuncal_' + k, JSON.stringify(v)); } catch (e) {} }
  };

  let W = 0, H = 0, DPR = 1, SC = 1, CX = 0, CY = 0, R = 0;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    SC = clamp(Math.min(W, H) / 420, 0.75, 1.5);
    CX = W / 2; CY = H * 0.52; R = Math.min(W * 0.44, H * 0.36);
    initAmbient();
  }

  // ================= SES MOTORU =================
  let ctx = null, master = null;
  function ensureCtx() {
    if (!ctx) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = 0.95;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && !paused) ctx.resume();
    return ctx;
  }
  const PRE = 0.014;     // her nokta, atağı kaçırmamak için notadan biraz önce başlar
  const FADE = 0.018;    // durma noktasında yumuşak kısılma
  let latMs = store.get('lat', 0);
  const outLat = () => (ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0) + latMs / 1000;

  let song = null;       // {buffer, name, events, taps, duration}
  let k = 0;             // açılmış dokunuş noktası sayısı; sıradaki = taps[k]
  let seg = null;        // çalan parça {src, gn, startCtx, startPos}
  let holdPos = 0, holdCtx = 0;
  const boundary = () => (k < song.taps.length ? song.taps[k].t - PRE : song.duration + 1);
  const rawPos = (t) => seg.startPos + (t - seg.startCtx);
  function songPos(t) { return seg ? Math.min(boundary(), rawPos(t)) : holdPos; }
  function boundaryCtx() { return seg ? seg.startCtx + (boundary() - seg.startPos) : holdCtx; }

  function startSeg(pos, when) {
    const src = ctx.createBufferSource(); src.buffer = song.buffer;
    const gn = ctx.createGain();
    src.connect(gn); gn.connect(master);
    const realWhen = when + Math.max(0, -pos);
    gn.gain.setValueAtTime(0, realWhen);
    gn.gain.linearRampToValueAtTime(1, realWhen + 0.003);
    src.start(realWhen, Math.max(0, pos));
    seg = { src, gn, startCtx: when, startPos: pos };
    scheduleStop();
  }
  function scheduleStop() {
    if (k >= song.taps.length) return;
    const bc = boundaryCtx(), now = ctx.currentTime;
    const a = Math.max(now + 0.006, bc - FADE);
    seg.gn.gain.setValueAtTime(1, a);
    seg.gn.gain.linearRampToValueAtTime(0, Math.max(a + 0.004, bc));
  }
  function extendSeg() {
    const now = ctx.currentTime, gp = seg.gn.gain;
    if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(now);
    else { gp.cancelScheduledValues(now); gp.setValueAtTime(gp.value, now); }
    gp.linearRampToValueAtTime(1, now + 0.005);
    scheduleStop();
  }
  function killSeg(fast) {
    if (!seg) return;
    const now = ctx.currentTime, s = seg;
    try {
      s.gn.gain.cancelScheduledValues(now);
      s.gn.gain.setValueAtTime(s.gn.gain.value, now);
      s.gn.gain.linearRampToValueAtTime(0, now + (fast ? 0.006 : 0.03));
      s.src.stop(now + (fast ? 0.01 : 0.04));
    } catch (e) {}
    seg = null;
  }

  // ================= DOKUNUŞ NOKTALARI =================
  // Rahat / Normal / Usta: iki dokunuş arası en kısa süre
  const DIFF = [{ min: 0.30, name: 'Rahat' }, { min: 0.165, name: 'Normal' }, { min: 0.11, name: 'Usta' }];
  let diff = store.get('diff', 1);
  function buildTaps(events, dur) {
    const minG = DIFF[diff].min, startG = Math.max(1.05, minG);
    const rampT = clamp(dur * 0.45, 18, 80);
    const t0 = events.length ? events[0].t : 0;
    const gapAt = (t) => minG + (startG - minG) * Math.max(0, 1 - (t - t0) / rampT);
    const score = (e) => e.strength * (1 + 0.45 * (e.bands.indexOf(0) >= 0 || e.bands.indexOf(1) >= 0 ? 1 : 0));
    const order = events.slice().sort((a, b) => score(b) - score(a));
    const acc = []; // zamana göre sıralı
    const find = (t) => { let lo = 0, hi = acc.length; while (lo < hi) { const m = (lo + hi) >> 1; if (acc[m].t < t) lo = m + 1; else hi = m; } return lo; };
    for (const e of order) {
      const G = gapAt(e.t), i = find(e.t);
      if (i > 0 && e.t - acc[i - 1].t < G) continue;
      if (i < acc.length && acc[i].t - e.t < G) continue;
      acc.splice(i, 0, e);
    }
    return acc.map((e) => ({ t: e.t, arm: e.main <= 1 ? 0 : e.main <= 3 ? 1 : 2, s: clamp(e.strength / 1.4, 0.25, 1), h: null, glyph: null }));
  }

  // ================= TEMALAR =================
  const THEMES = [
    { id: 'aero', name: 'Aero', chip: 'linear-gradient(160deg,#1f8fd6,#9fe0fb 60%,#dfffd0)', hues: [195, 160, 215], light: true },
    { id: 'neon', name: 'Neon', chip: 'linear-gradient(160deg,#10041f,#ff2bd6 55%,#19e7ff)', hues: [312, 186, 262], light: false },
    { id: 'galaxy', name: 'Galaksi', chip: 'linear-gradient(160deg,#02040f,#4a1d96 60%,#2f6bff)', hues: [228, 276, 196], light: false },
    { id: 'sakura', name: 'Sakura', chip: 'linear-gradient(160deg,#fff0f5,#ffb3cf 60%,#d9b8ff)', hues: [336, 352, 296], light: true }
  ];
  let themeIdx = clamp(store.get('theme', 0) | 0, 0, THEMES.length - 1);
  const TH = () => THEMES[themeIdx];

  // ================= OYUN DURUMU =================
  let state = 'home', paused = false;
  let score = 0, combo = 0, maxCombo = 0, lastMult = 1;
  let cnt = { p: 0, gr: 0, go: 0, late: 0, miss: 0, stray: 0 };
  let missFlag = -1, lastAccept = -9, lastS = -9, flow = 0, spin = 0, pulse = 0, energy = 0;
  let bubbles = [], pops = [], floaters = [], parts = [], callout = null, flash = 0, redA = 0, shake = 0;
  let evCursor = 0;
  const mult = () => Math.min(8, 1 + Math.floor(combo / 5));
  const tier = () => { const m = mult(); return m < 3 ? 0 : m < 5 ? 1 : m < 7 ? 2 : 3; };

  function resetRun() {
    killSeg(true);
    score = 0; combo = 0; maxCombo = 0; lastMult = 1; missFlag = -1; lastAccept = -9;
    cnt = { p: 0, gr: 0, go: 0, late: 0, miss: 0, stray: 0 };
    bubbles = []; pops = []; floaters = []; parts = []; callout = null; flash = 0; redA = 0; shake = 0; energy = 0;
    k = 0; evCursor = 0;
    for (const tp of song.taps) { tp.h = null; tp.glyph = null; }
    const first = song.taps.length ? song.taps[0].t : 0;
    const pre = first < 2.4 ? -(2.4 - first) : 0;   // ilk nokta çok erkense kısa bir sessiz giriş
    holdPos = pre; lastS = pre;
    ensureCtx();
    startSeg(pre, ctx.currentTime + 0.05);
    updateHud(true);
  }

  // ================= DOKUNUŞ =================
  const GLYPHS = ['♪', '♫', '♬', '♩'];
  function onTap(x, y) {
    if (state !== 'play' || paused || !song) return;
    ensureCtx();
    const now = ctx.currentTime;
    if (k >= song.taps.length) { spawnBubble(x, y, 'free'); return; }
    const onset = boundaryCtx() + PRE;
    const d = now - onset - outLat();          // <0 erken, >0 geç
    if (d < -0.2) {
      if (now - lastAccept < 0.08) { spawnBubble(x, y, 'chord'); return; }  // aynı anda birden çok parmak
      cnt.stray++; score = Math.max(0, score - 50);
      breakCombo('BOŞ', x, y);
      spawnBubble(x, y, 'stray');
      vib(4);
      updateHud();
      return;
    }
    const tp = song.taps[k];
    const wasPlaying = seg && rawPos(now) < boundary();
    const oldB = boundary();
    k++; lastAccept = now;
    if (wasPlaying) extendSeg();
    else { killSeg(true); startSeg(oldB, now + 0.002); }
    // puan
    const ad = Math.abs(d);
    let grade;
    if (ad <= 0.045) grade = 'p';
    else if (ad <= 0.09) grade = 'gr';
    else if (d < 0 || d <= 0.15) grade = 'go';
    else grade = 'late';
    const m = mult();
    if (grade === 'late') { cnt.late++; score += 30; breakCombo('GEÇ', x, y); }
    else {
      cnt[grade]++; combo++; maxCombo = Math.max(maxCombo, combo);
      score += (grade === 'p' ? 300 : grade === 'gr' ? 200 : 100) * m;
      const txt = grade === 'p' ? 'MÜKEMMEL' : grade === 'gr' ? 'HARİKA' : d < 0 ? 'ERKEN' : 'İYİ';
      floaters.push({ text: txt, x, y: y - 64 * SC, t0: performance.now() / 1000, col: grade === 'p' ? '#fff2a8' : '#d8f6ff', size: grade === 'p' ? 17 : 15 });
      milestone();
    }
    if (missFlag === k - 1) missFlag = -1;
    spawnBubble(x, y, grade, tp);
    popMarker(tp, grade);
    vib(grade === 'p' ? 10 : 6);
    hideTapHint();
    updateHud();
  }
  function breakCombo(text, x, y) {
    const had = combo;
    combo = 0; lastMult = 1;
    floaters.push({ text, x, y: y - 64 * SC, t0: performance.now() / 1000, col: '#ffc2cc', size: 14 });
    if (had >= 10) { callout = { text: 'SERİ BİTTİ', t0: performance.now() / 1000, small: true, col: '#ffd0d8' }; redA = 0.35; }
  }
  function milestone() {
    const m = mult();
    if (m > lastMult) {
      lastMult = m;
      const el = $('#mult'); el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 160);
      flash = Math.max(flash, 0.12);
    }
    const ms = [10, 25, 50, 100, 200, 400], tx = ['SÜPER!', 'HARİKA SERİ!', 'EFSANE!', 'DURDURULAMAZ!', 'İNANILMAZ!', 'KUSURSUZ!'];
    const i = ms.indexOf(combo);
    if (i >= 0) {
      callout = { text: tx[i], t0: performance.now() / 1000, big: true };
      flash = 0.28; confetti(26 + i * 10); shake = Math.max(shake, 5); vib(25);
    }
  }
  function vib(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  // ================= ÇİZİM: SPİRAL =================
  const K = 1.25, SWIRL = 2.05, NA = 3, LOOK = 2.7;
  function armPos(a, tau) {
    const r = R * Math.exp(-K * tau), th = (a * TAU) / NA + spin + SWIRL * tau;
    return [CX + Math.cos(th) * r, CY + Math.sin(th) * r, r];
  }
  function hueFor(a, tn) {
    const t = tier();
    let h = TH().hues[a % 3] + t * 10 * Math.sin(tn * 0.8 + a);
    if (t >= 3) h = (h + tn * 50) % 360;
    return h;
  }
  function armCol(h, al) {
    const th = TH(), t = tier();
    if (th.light) return 'hsla(' + h + ',100%,' + (97 - t * 4) + '%,' + al + ')';
    return 'hsla(' + h + ',100%,' + (66 + t * 4) + '%,' + al + ')';
  }
  function drawSpiral(tn) {
    const th = TH(), light = th.light, t = tier();
    const boost = 1 + 0.25 * t + 0.6 * pulse;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // tünel halkaları: şarkı akarken dışa doğru akar, beklerken durur
    const SPAN = LOOK + 0.8, J = 9;
    for (let j = 0; j < J; j++) {
      let u = ((j / J) * SPAN + flow * 0.5) % SPAN;
      const tau = SPAN - u - 0.6, r = R * Math.exp(-K * tau);
      if (r < 2) continue;
      const al = clamp(1 - tau / LOOK, 0, 1) * clamp((tau + 0.6) / 0.5, 0, 1) * (light ? 0.22 : 0.16) * boost;
      g.lineWidth = clamp(0.6 + 1.6 * r / R, 0.5, 2.6);
      g.strokeStyle = armCol(hueFor(j % 3, tn), al);
      g.beginPath(); g.arc(CX, CY, r, 0, TAU); g.stroke();
    }
    // ince ara kollar
    for (let f = 0; f < 6; f++) {
      const a = f / 2 + 0.25;
      g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const tau = -0.5 + (i / 60) * (LOOK + 0.7), p = armPos(a, tau);
        if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
      }
      g.lineWidth = 1; g.strokeStyle = armCol(hueFor(f % 3, tn), (light ? 0.25 : 0.14) * boost);
      g.stroke();
    }
    // ana kollar (parlama + çizgi)
    const STEP = 0.045, N0 = Math.round((LOOK + 0.85) / STEP);
    for (let a = 0; a < NA; a++) {
      const h = hueFor(a, tn), pts = [];
      for (let i = 0; i <= N0; i++) pts.push(armPos(a, -0.5 + i * STEP));
      for (let pass = 0; pass < 2; pass++) {
        g.globalCompositeOperation = pass === 0 && !light ? 'lighter' : 'source-over';
        for (let c = 0; c < pts.length - 1; c += 8) {
          const end = Math.min(pts.length - 1, c + 8), tau = -0.5 + c * STEP, r = pts[c][2];
          const al = clamp(1 - (tau - 1.2) / (LOOK - 1.2), 0.08, 1) * clamp((tau + 0.5) / 0.45, 0, 1);
          const w = clamp(0.8 + 3.6 * r / R, 0.8, 5.5);
          g.lineWidth = pass === 0 ? w * 4 : w;
          g.strokeStyle = pass === 0 ? armCol(h, 0.12 * al * boost) : armCol(h, clamp(0.85 * al * (0.8 + 0.2 * boost), 0, 1));
          g.beginPath(); g.moveTo(pts[c][0], pts[c][1]);
          for (let i = c + 1; i <= end; i++) g.lineTo(pts[i][0], pts[i][1]);
          g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over';
      // akış parçacıkları: şarkının kendisi. Ses akarken dışa akar, beklerken donar.
      const M = 11;
      for (let i = 0; i < M; i++) {
        let u = ((i / M) * (LOOK + 0.5) + flow + a * 0.37) % (LOOK + 0.5);
        const tau = LOOK - u, p = armPos(a, tau);
        const al = clamp(1 - tau / LOOK, 0, 1) * clamp((tau + 0.5) / 0.5, 0, 1);
        g.fillStyle = armCol(h, 0.75 * al);
        g.beginPath(); g.arc(p[0], p[1], Math.max(0.8, 2.4 * p[2] / R) * SC, 0, TAU); g.fill();
      }
      // kolun ucu: notanın varacağı nokta (sabit halka değil, kolun kendi parlak ucu)
      const tip = armPos(a, 0);
      const tg = g.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 22 * SC * (1 + 0.5 * pulse));
      tg.addColorStop(0, armCol(h, light ? 0.9 : 0.75)); tg.addColorStop(1, armCol(h, 0));
      g.fillStyle = tg; g.beginPath(); g.arc(tip[0], tip[1], 22 * SC * (1 + 0.5 * pulse), 0, TAU); g.fill();
    }
  }

  // ---- kabarcık gövdesi (Frutiger Aero camı / neon halka) ----
  function bubbleBody(x, y, r, h, al) {
    if (r < 0.5 || al <= 0) return;
    const id = TH().id;
    if (id === 'neon') {
      g.save();
      g.globalAlpha = al;
      g.shadowColor = 'hsl(' + h + ',100%,60%)'; g.shadowBlur = r * 0.9;
      g.lineWidth = Math.max(1.5, r * 0.12); g.strokeStyle = 'hsl(' + h + ',100%,72%)';
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = 'hsla(' + h + ',100%,60%,.16)'; g.fill();
      g.restore();
      return;
    }
    g.save(); g.globalAlpha = al;
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
    gr.addColorStop(0, 'hsla(' + h + ',100%,98%,.9)');
    gr.addColorStop(0.5, 'hsla(' + h + ',95%,74%,.38)');
    gr.addColorStop(0.86, 'hsla(' + h + ',95%,58%,.5)');
    gr.addColorStop(1, 'hsla(' + h + ',100%,92%,.85)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.lineWidth = Math.max(1, r * 0.05); g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
    // üst parlama
    const gl = g.createLinearGradient(x, y - r * 0.9, x, y - r * 0.15);
    gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.beginPath(); g.ellipse(x - r * 0.08, y - r * 0.5, r * 0.58, r * 0.32, -0.15, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x + r * 0.45, y + r * 0.45, r * 0.09, 0, TAU); g.fill();
    g.restore();
  }
  function glyph(ch, x, y, r, al, h) {
    g.save(); g.globalAlpha = al;
    g.font = '400 ' + Math.round(r * 1.15) + 'px "Noto Music","Segoe UI Symbol","Apple Symbols",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = TH().id === 'neon' ? 'hsl(' + h + ',100%,60%)' : 'hsla(' + h + ',90%,30%,.55)'; g.shadowBlur = r * 0.25;
    g.fillStyle = '#fff'; g.fillText(ch, x, y + r * 0.04);
    g.restore();
  }

  // ---- spiraldeki sıradaki noktalar ----
  function drawMarkers(tn, S) {
    if (!song) return;
    const now = ctx ? ctx.currentTime : 0;
    const waiting = state === 'play' && k < song.taps.length && (!seg || rawPos(now) >= boundary());
    for (let i = Math.min(song.taps.length - 1, k + 40); i >= k; i--) {
      const tp = song.taps[i], tau = tp.t - S;
      if (tau > LOOK) continue;
      if (tp.h == null) { tp.h = hueFor(tp.arm, tn) + (rnd() - 0.5) * 20; tp.glyph = GLYPHS[(rnd() * 4) | 0]; }
      const p = armPos(tp.arm, Math.max(0, tau));
      const base = (17 + 10 * tp.s) * SC, r = Math.max(2.5, base * Math.pow(clamp(p[2] / R, 0, 1.2), 0.9));
      const al = clamp((LOOK - tau) / 0.7, 0, 1);
      const head = i === k;
      if (head) {
        const near = clamp(1 - tau / 0.6, 0, 1), wob = waiting ? 0.5 + 0.5 * Math.sin(tn * 10) : 0;
        const ar = r * (2.2 + 0.8 * near + 0.6 * wob);
        const ag = g.createRadialGradient(p[0], p[1], r * 0.4, p[0], p[1], ar);
        ag.addColorStop(0, armCol(tp.h, 0.55 * near + 0.2)); ag.addColorStop(1, armCol(tp.h, 0));
        g.globalCompositeOperation = TH().light ? 'source-over' : 'lighter';
        g.fillStyle = ag; g.beginPath(); g.arc(p[0], p[1], ar, 0, TAU); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      bubbleBody(p[0], p[1], r * (head ? 1.12 : 1), tp.h, al);
      if (r > 9) glyph(tp.glyph, p[0], p[1], r * 0.8, al * 0.95, tp.h);
    }
  }

  // ---- dokunuş baloncukları ----
  function spawnBubble(x, y, kind, tp) {
    const tn = performance.now() / 1000;
    const stray = kind === 'stray', chord = kind === 'chord';
    const h = tp && tp.h != null ? tp.h : hueFor((rnd() * 3) | 0, tn) + (rnd() - 0.5) * 30;
    const size = (stray ? 22 : chord ? 26 : kind === 'p' ? 44 : 38) * SC * (0.9 + rnd() * 0.25);
    bubbles.push({ x, y, t0: tn, h, size, glyph: GLYPHS[(rnd() * 4) | 0], stray, life: stray ? 0.42 : 0.82, popAt: stray ? 0.2 : 0.5, vx: (rnd() - 0.5) * 30, rot: (rnd() - 0.5) * 0.5 });
    if (bubbles.length > 60) bubbles.shift();
  }
  function popMarker(tp, grade) {
    const S = songPos(ctx.currentTime), p = armPos(tp.arm, Math.max(0, tp.t - S));
    pops.push({ x: p[0], y: p[1], t0: performance.now() / 1000, h: tp.h == null ? 200 : tp.h, big: grade === 'p' });
  }
  function drawBubbles(tn) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], a = tn - b.t0;
      if (a > b.life) { bubbles.splice(i, 1); continue; }
      const sat = b.stray ? 0.35 : 1;
      if (a < b.popAt) {
        const s = easeOutBack(Math.min(1, a / 0.14));
        const y = b.y - a * 46 * SC, x = b.x + b.vx * a;
        const r = b.size * s * (1 + 0.035 * Math.sin(a * 22));
        bubbleBody(x, y, r, b.h, sat);
        glyph(b.glyph, x, y, r * 0.85, sat, b.h);
      } else {
        const p = (a - b.popAt) / (b.life - b.popAt), e = 1 - Math.pow(1 - p, 3);
        const y = b.y - b.popAt * 46 * SC - p * 30 * SC, x = b.x + b.vx * b.popAt;
        const r = b.size;
        g.save();
        g.globalAlpha = (1 - p) * sat;
        g.lineWidth = Math.max(0.6, r * 0.08 * (1 - p));
        g.strokeStyle = TH().id === 'neon' ? 'hsl(' + b.h + ',100%,70%)' : 'rgba(255,255,255,.95)';
        g.beginPath(); g.arc(x, y, r * (1 + e * 0.75), 0, TAU); g.stroke();
        g.fillStyle = TH().id === 'neon' ? 'hsl(' + b.h + ',100%,75%)' : 'hsla(' + b.h + ',100%,90%,1)';
        for (let j = 0; j < 9; j++) {
          const an = (j / 9) * TAU + b.rot * 3, rr = r * (1 + e * 1.3);
          g.beginPath(); g.arc(x + Math.cos(an) * rr, y + Math.sin(an) * rr, Math.max(0.5, r * 0.11 * (1 - p)), 0, TAU); g.fill();
        }
        g.restore();
        glyph(b.glyph, x, y - p * 18 * SC, r * 0.85 * (1 + p * 0.5), (1 - p) * sat, b.h);
      }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i], p = (tn - q.t0) / 0.45;
      if (p >= 1) { pops.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - p, 3);
      g.save(); g.globalAlpha = 1 - p;
      g.globalCompositeOperation = TH().light ? 'source-over' : 'lighter';
      g.lineWidth = 3 * SC * (1 - p); g.strokeStyle = armCol(q.h, 1);
      g.beginPath(); g.arc(q.x, q.y, (14 + e * (q.big ? 46 : 30)) * SC, 0, TAU); g.stroke();
      g.restore();
    }
  }
  function confetti(n) {
    if (reduced) return;
    const tn = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = (140 + rnd() * 320) * SC;
      parts.push({ x: CX, y: CY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: tn, life: 0.9 + rnd() * 0.7, h: hueFor(i % 3, tn) + rnd() * 40, s: (3 + rnd() * 5) * SC });
    }
  }
  function drawParts(tn, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], a = (tn - p.t0) / p.life;
      if (a >= 1) { parts.splice(i, 1); continue; }
      p.vx *= 1 - dt * 1.6; p.vy *= 1 - dt * 1.6; p.x += p.vx * dt; p.y += p.vy * dt;
      bubbleBody(p.x, p.y, p.s * (1 - a * 0.5), p.h, 1 - a);
    }
  }
  function drawFloaters(tn) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i], a = (tn - f.t0) / 0.7;
      if (a >= 1) { floaters.splice(i, 1); continue; }
      g.globalAlpha = 1 - a * a;
      g.font = '900 ' + Math.round(f.size * SC) + 'px Nunito, system-ui, sans-serif';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,30,60,.35)'; g.strokeText(f.text, f.x, f.y - a * 26 * SC);
      g.fillStyle = f.col; g.fillText(f.text, f.x, f.y - a * 26 * SC);
    }
    g.globalAlpha = 1;
    if (callout) {
      const a = (tn - callout.t0) / 1.3;
      if (a >= 1) callout = null;
      else {
        const s = callout.big ? easeOutBack(Math.min(1, a / 0.18)) : 1;
        g.globalAlpha = a < 0.75 ? 1 : 1 - (a - 0.75) / 0.25;
        g.font = '400 ' + Math.round((callout.big ? 46 : 26) * SC * s) + 'px "Varela Round", Nunito, sans-serif';
        g.lineWidth = 6; g.strokeStyle = 'rgba(0,30,70,.35)';
        const y = H * 0.2;
        g.strokeText(callout.text, W / 2, y);
        g.fillStyle = callout.col || '#fff'; g.fillText(callout.text, W / 2, y);
        g.globalAlpha = 1;
      }
    }
  }

  // ================= ARKA PLANLAR =================
  let amb = [];
  function initAmbient() {
    amb = [];
    const id = TH().id, n = id === 'galaxy' ? 140 : id === 'sakura' ? 26 : id === 'aero' ? 10 : 30;
    for (let i = 0; i < n; i++) amb.push({ x: rnd() * W, y: rnd() * H, s: rnd(), p: rnd() * TAU, v: 0.3 + rnd() * 0.7 });
  }
  function drawBg(tn, dt) {
    const id = TH().id, t = tier(), e = energy;
    let gr;
    if (id === 'aero') {
      gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'hsl(' + (204 - e * 6) + ',78%,' + (44 + e * 4) + '%)');
      gr.addColorStop(0.55, 'hsl(196,85%,72%)'); gr.addColorStop(1, 'hsl(170,80%,88%)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const gg = g.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, H * 0.6);
      gg.addColorStop(0, 'rgba(170,240,110,.55)'); gg.addColorStop(1, 'rgba(170,240,110,0)');
      g.fillStyle = gg; g.fillRect(0, 0, W, H);
      for (const b of amb) {
        b.y -= dt * 12 * b.v * (1 + e); if (b.y < -60) { b.y = H + 60; b.x = rnd() * W; }
        bubbleBody(b.x + Math.sin(tn * 0.5 + b.p) * 12, b.y, (6 + b.s * 18) * SC, 195 + b.s * 30, 0.16);
      }
    } else if (id === 'neon') {
      g.fillStyle = '#0a0316'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'hsla(' + (300 + t * 15) + ',100%,60%,' + (0.1 + 0.08 * pulse) + ')'; g.lineWidth = 1;
      const hz = H * 0.72;
      for (let i = 0; i < 12; i++) { const y = hz + Math.pow(i / 12, 1.8) * (H - hz) + ((flow * 30) % 1); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let i = -10; i <= 10; i++) { g.beginPath(); g.moveTo(W / 2 + i * 14, hz); g.lineTo(W / 2 + i * W * 0.2, H); g.stroke(); }
      for (const b of amb) { b.y += dt * 8 * b.v; if (b.y > H) b.y = 0; g.fillStyle = 'hsla(' + (180 + b.s * 140) + ',100%,70%,' + (0.25 + 0.35 * Math.sin(tn * 2 + b.p) ** 2) + ')'; g.fillRect(b.x, b.y, 2, 2); }
    } else if (id === 'galaxy') {
      g.fillStyle = '#03051a'; g.fillRect(0, 0, W, H);
      const n1 = g.createRadialGradient(W * 0.25, H * 0.3, 0, W * 0.25, H * 0.3, W * 0.7);
      n1.addColorStop(0, 'rgba(110,50,200,.32)'); n1.addColorStop(1, 'rgba(110,50,200,0)');
      g.fillStyle = n1; g.fillRect(0, 0, W, H);
      const n2 = g.createRadialGradient(W * 0.8, H * 0.75, 0, W * 0.8, H * 0.75, W * 0.6);
      n2.addColorStop(0, 'rgba(40,110,255,.26)'); n2.addColorStop(1, 'rgba(40,110,255,0)');
      g.fillStyle = n2; g.fillRect(0, 0, W, H);
      for (const b of amb) {
        // yıldızlar merkezden dışa akar (şarkı akarken)
        const dx = b.x - CX, dy = b.y - CY; b.x += dx * b.v * 0.4 * flowDt; b.y += dy * b.v * 0.4 * flowDt;
        if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) { b.x = CX + (rnd() - 0.5) * 60; b.y = CY + (rnd() - 0.5) * 60; }
        const tw = 0.4 + 0.6 * Math.sin(tn * 3 + b.p) ** 2;
        g.fillStyle = 'rgba(220,230,255,' + tw + ')'; g.fillRect(b.x, b.y, 1 + b.s * 1.6, 1 + b.s * 1.6);
      }
    } else {
      gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#ffe3ee'); gr.addColorStop(0.6, '#ffc9dd'); gr.addColorStop(1, '#ecd6ff');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (const b of amb) {
        b.y += dt * 22 * b.v * (1 + e); b.x += Math.sin(tn + b.p) * dt * 20;
        if (b.y > H + 20) { b.y = -20; b.x = rnd() * W; }
        g.save(); g.translate(b.x, b.y); g.rotate(tn * b.v + b.p);
        g.fillStyle = 'rgba(255,' + (150 + b.s * 60 | 0) + ',190,.75)';
        g.beginPath(); g.ellipse(0, 0, (5 + b.s * 5) * SC, (3 + b.s * 2.5) * SC, 0, 0, TAU); g.fill();
        g.restore();
      }
    }
    // merkez parıltısı: seri büyüdükçe güçlenir, her seste nabız atar
    const cg = g.createRadialGradient(CX, CY, 0, CX, CY, R * (0.9 + 0.2 * pulse));
    const h = hueFor(0, tn), al = (TH().light ? 0.22 : 0.18) * (0.5 + e) + 0.15 * pulse;
    cg.addColorStop(0, armCol(h, al)); cg.addColorStop(1, armCol(h, 0));
    g.fillStyle = cg; g.fillRect(0, 0, W, H);
  }

  // ================= ANA DÖNGÜ =================
  let lastT = performance.now() / 1000, flowDt = 0;
  function frame() {
    requestAnimationFrame(frame);
    const tn = performance.now() / 1000, dt = Math.min(0.05, tn - lastT); lastT = tn;
    let S = lastS;
    if (song && (state === 'play' || state === 'result') && ctx) {
      const now = ctx.currentTime;
      S = songPos(now - outLat());   // ekranda kulağa gelen an gösterilir
      if (state === 'play' && !paused) tick(now);
    }
    flowDt = Math.max(0, Math.min(0.1, S - lastS));
    flow += flowDt; lastS = S;
    // her ses çıktığında görsel nabız (şarkıyı değiştirmez)
    if (song && state === 'play') {
      const ev = song.events;
      while (evCursor < ev.length && ev[evCursor].t <= S) { pulse = Math.min(1, pulse + 0.25 + 0.35 * clamp(ev[evCursor].strength / 1.4, 0, 1)); evCursor++; }
    }
    pulse = Math.max(0, pulse - dt * 3.2);
    spin += dt * (0.16 + 0.1 * tier()) + flowDt * 0.25;
    energy += ((state === 'play' ? tier() / 3 : 0) - energy) * Math.min(1, dt * 2);
    flash = Math.max(0, flash - dt * 1.6); redA = Math.max(0, redA - dt * 1.3); shake = Math.max(0, shake - dt * 16);

    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.save();
    if (shake > 0.1 && !reduced) g.translate((rnd() - 0.5) * shake * 2, (rnd() - 0.5) * shake * 2);
    drawBg(tn, dt);
    drawSpiral(tn);
    if (state === 'play' || state === 'result') drawMarkers(tn, S);
    drawParts(tn, dt);
    drawBubbles(tn);
    drawFloaters(tn);
    g.restore();
    if (redA > 0) {
      const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      rg.addColorStop(0, 'rgba(255,60,90,0)'); rg.addColorStop(1, 'rgba(255,60,90,' + redA + ')');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
    if (flash > 0 && !reduced) { g.fillStyle = 'rgba(255,255,255,' + flash + ')'; g.fillRect(0, 0, W, H); }
    if (song && state === 'play') $('#prog i').style.width = (clamp(S / song.duration, 0, 1) * 100).toFixed(2) + '%';
  }
  function tick(now) {
    if (!song) return;
    // durma noktasına gelindiyse sesi kapat, bekle
    if (seg && k < song.taps.length && rawPos(now) >= boundary() + 0.03) {
      holdCtx = boundaryCtx(); holdPos = boundary();
      try { seg.src.stop(); } catch (e) {}
      seg = null;
    }
    // çok uzun beklenirse kaçırıldı sayılır (şarkı yine de bekler)
    if (k < song.taps.length && !seg && now - holdCtx > 0.6 && missFlag !== k) {
      missFlag = k; cnt.miss++; score = Math.max(0, score - 100);
      breakCombo('KAÇTI', CX, CY + R * 0.2);
      showTapHint();
      updateHud();
    }
    if (k >= song.taps.length && seg && rawPos(now) >= song.duration - 0.02) finish();
  }

  // ================= ARAYÜZ =================
  let hudCache = '';
  function updateHud(force) {
    const key = score + '|' + mult() + '|' + combo;
    if (!force && key === hudCache) return;
    hudCache = key;
    $('#score').textContent = score.toLocaleString('tr-TR');
    $('#mult').textContent = 'x' + mult();
    $('#combo').textContent = 'seri ' + combo;
  }
  function show(id) {
    ['home', 'busy', 'pause', 'result'].forEach((n) => { $('#' + n).hidden = n !== id; });
    $('#hud').classList.toggle('off', !(state === 'play'));
  }
  let hintT = 0;
  function showTapHint(first) {
    const el = $('#tapHint');
    el.innerHTML = first
      ? 'Işık kolun ucuna varınca dokun<small>ekranın her yeri, istediğin kadar parmak. Erken bassan da nota tam zamanında çalar.</small>'
      : 'Şarkı seni bekliyor · dokun';
    el.hidden = false; el.style.opacity = 1;
    clearTimeout(hintT); hintT = setTimeout(hideTapHint, first ? 4500 : 2500);
  }
  function hideTapHint() { const el = $('#tapHint'); el.style.opacity = 0; clearTimeout(hintT); hintT = setTimeout(() => { el.hidden = true; }, 600); }

  function startPlay() {
    paused = false; state = 'play'; show(null);
    resetRun();
    showTapHint(true);
  }
  function finish() {
    if (state !== 'play') return;
    state = 'result';
    const n = Math.max(1, song.taps.length);
    const acc = (cnt.p + cnt.gr * 0.85 + cnt.go * 0.6 + cnt.late * 0.25) / n;
    const pen = (cnt.miss + cnt.stray * 0.5) / n;
    const v = acc - pen;
    const rank = v >= 0.95 ? 'S' : v >= 0.85 ? 'A' : v >= 0.7 ? 'B' : v >= 0.5 ? 'C' : 'D';
    $('#rRank').textContent = rank;
    const row = (a, b, c) => '<span' + (c ? ' class="big"' : '') + '>' + a + '</span><b' + (c ? ' class="big"' : '') + '>' + b + '</b>';
    $('#rStats').innerHTML = row('Puan', score.toLocaleString('tr-TR'), 1) + row('En uzun seri', maxCombo) +
      row('Mükemmel', cnt.p) + row('Harika', cnt.gr) + row('İyi / erken', cnt.go) + row('Geç', cnt.late) + row('Kaçan', cnt.miss) + row('Boş dokunuş', cnt.stray) +
      row('Doğruluk', Math.round(clamp(acc, 0, 1) * 100) + '%');
    setTimeout(() => show('result'), 900);
    if (store.get('best_' + song.name, 0) < score) store.set('best_' + song.name, score);
  }
  function pause() {
    if (state !== 'play' || paused) return;
    paused = true; if (ctx) ctx.suspend();
    show('pause'); renderChips();
  }
  function resume() {
    paused = false; show(null);
    if (ctx) ctx.resume();
  }

  function renderChips() {
    ['#chips1', '#chips2'].forEach((sel) => {
      const box = $(sel); box.innerHTML = '';
      THEMES.forEach((th, i) => {
        const b = document.createElement('button');
        b.className = 'chip' + (i === themeIdx ? ' on' : ''); b.type = 'button';
        b.innerHTML = '<i style="background:' + th.chip + '"></i>' + th.name;
        b.addEventListener('click', () => { themeIdx = i; store.set('theme', i); initAmbient(); renderChips(); });
        box.appendChild(b);
      });
    });
  }

  // ---- yükleme ----
  function busy(title, p, sub) { $('#busyT').textContent = title; $('#busyB').style.width = Math.round(p * 100) + '%'; if (sub) $('#busyS').textContent = sub; }
  async function decode(ab) {
    return new Promise((res, rej) => {
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }
  async function prepare(name, buffer) {
    busy('Şarkı hazırlanıyor', 0.25, 'Sesler ayrılıyor…');
    const chs = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chs.push(buffer.getChannelData(c));
    const an = await Analysis.analyze(chs, buffer.sampleRate, (p) => busy('Şarkı hazırlanıyor', 0.25 + 0.7 * p, 'Sesler ayrılıyor…'), { play: true, floorK: 0.2, kLm: 1.25, kP: 0.1 });
    if (an.events.length < 4) throw new Error('Bu dosyada ayırt edilebilir ses bulunamadı');
    const taps = buildTaps(an.events, buffer.duration);
    song = { buffer, name, events: an.events, taps, duration: buffer.duration };
    busy('Hazır', 1, taps.length + ' dokunuş noktası');
    startPlay();
  }
  async function loadFile(file) {
    $('#err').textContent = '';
    state = 'busy'; show('busy'); busy('Şarkı açılıyor', 0.05, file.name);
    try {
      ensureCtx();
      const ab = await file.arrayBuffer();
      busy('Şarkı çözülüyor', 0.15, file.name);
      let buffer;
      try { buffer = await decode(ab); }
      catch (e) { throw new Error('Bu cihaz bu dosya biçimini açamadı. MP3 veya M4A olarak dene.'); }
      await prepare(file.name.replace(/\.[^.]+$/, ''), buffer);
    } catch (e) {
      state = 'home'; show('home');
      $('#err').textContent = (e && e.message) || 'Dosya açılamadı.';
    }
  }
  async function loadDemo() {
    $('#err').textContent = '';
    state = 'busy'; show('busy'); busy('Örnek parça', 0.08, 'Üretiliyor…');
    try {
      ensureCtx();
      await new Promise((r) => setTimeout(r, 20));
      const s = DemoSong.make(ctx.sampleRate);
      const buffer = ctx.createBuffer(2, s.channels[0].length, s.sr);
      buffer.copyToChannel(s.channels[0], 0); buffer.copyToChannel(s.channels[1], 1);
      await prepare('Örnek parça', buffer);
    } catch (e) {
      state = 'home'; show('home'); $('#err').textContent = 'Örnek parça açılamadı: ' + ((e && e.message) || e);
    }
  }

  // ---- olaylar ----
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(e.clientX, e.clientY); }, { passive: false });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Escape') { if (paused) resume(); else pause(); return; }
    if (state === 'play' && !paused && e.key.length === 1) { e.preventDefault(); onTap(CX + (rnd() - 0.5) * W * 0.6, CY + (rnd() - 0.5) * H * 0.5); }
  });
  $('#pick').addEventListener('click', () => { ensureCtx(); $('#file').click(); });
  $('#file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) loadFile(f); });
  $('#demo').addEventListener('click', loadDemo);
  $('#menuBtn').addEventListener('click', pause);
  $('#resume').addEventListener('click', resume);
  $('#restart').addEventListener('click', () => { if (ctx) ctx.resume(); startPlay(); });
  $('#newSong').addEventListener('click', () => { if (ctx) ctx.resume(); killSeg(true); paused = false; state = 'home'; show('home'); });
  $('#again').addEventListener('click', () => { if (song) { song.taps = buildTaps(song.events, song.duration); startPlay(); } });
  $('#menu2').addEventListener('click', () => { killSeg(true); state = 'home'; show('home'); });
  $('#diff').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    diff = +b.dataset.v; store.set('diff', diff);
    document.querySelectorAll('#diff button').forEach((x) => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('#diff button').forEach((x) => x.classList.toggle('on', +x.dataset.v === diff));
  const lat = $('#lat');
  lat.value = latMs; $('#latO').textContent = latMs + ' ms';
  lat.addEventListener('input', () => { latMs = +lat.value; $('#latO').textContent = latMs + ' ms'; store.set('lat', latMs); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('resize', resize);

  resize();
  renderChips();
  requestAnimationFrame(frame);

  // test kancası
  window.__dc = {
    get state() { return state; }, get k() { return k; }, get song() { return song; }, get ctx() { return ctx; },
    get cnt() { return cnt; }, get score() { return score; }, get combo() { return combo; },
    tap: onTap, demo: loadDemo, songPos: () => songPos(ctx.currentTime), boundaryCtx: () => boundaryCtx(), outLat
  };
})();

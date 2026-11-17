/* Dokun Çal — oyun
 *
 * Kural: şarkıyı oyuncu çalar, ekranın her yeri çalgıdır.
 *  - Dokununca ses ANINDA çıkar: şarkının sıradaki sesi, parmağın değdiği an.
 *  - Şarkının kendi saati vardır ve gerçek zamandan hızlı akmaz. Sıradaki sese ancak
 *    zamanına EW saniye kalmışken basılabilir; daha erken dokunuş ses açmaz.
 *    Saat dokunuşla ileri itilemez, bu yüzden deli gibi basmak şarkıyı hızlandırmaz.
 *  - Geç kalınırsa ses o sesin başında susar, saat de bekler; dokununca kaldığı yerden akar.
 *  - Zamanlama ipucu: spiral sıradaki sesin anı yaklaştıkça nefes alır, an geldiğinde en parlaktır.
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv'), g = cv.getContext('2d');
  const TAU = Math.PI * 2, rnd = Math.random;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (x) => x * x * (3 - 2 * x);
  const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nowS = () => performance.now() / 1000;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dokuncal_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dokuncal_' + k, JSON.stringify(v)); } catch (e) {} }
  };

  let W = 0, H = 0, DPR = 1, SC = 1, CX = 0, CY = 0, M = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    SC = clamp(Math.min(W, H) / 420, 0.75, 1.5);
    CX = W / 2; CY = H * 0.5; M = Math.min(W, H);
    glResize();
    initAmbient();
  }

  // ================= TEMALAR =================
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const THEMES = [
    { id: 'aero', name: 'Aero', chip: 'linear-gradient(160deg,#1f8fd6,#9fe0fb 60%,#dfffd0)', light: 1,
      bg1: '#d9f6ff', bg2: '#1677c4', c: ['#ffffff', '#8ff0ff', '#c9ffad'], hue: [195, 175, 105] },
    { id: 'neon', name: 'Neon', chip: 'linear-gradient(160deg,#10041f,#ff2bd6 55%,#19e7ff)', light: 0,
      bg1: '#1d0736', bg2: '#04010b', c: ['#ff2bd6', '#19e7ff', '#8a5cff'], hue: [312, 186, 262] },
    { id: 'galaxy', name: 'Galaksi', chip: 'linear-gradient(160deg,#02040f,#4a1d96 60%,#2f6bff)', light: 0,
      bg1: '#151c52', bg2: '#020310', c: ['#9fb4ff', '#d08cff', '#5fe3ff'], hue: [228, 280, 192] },
    { id: 'sakura', name: 'Sakura', chip: 'linear-gradient(160deg,#fff0f5,#ffb3cf 60%,#d9b8ff)', light: 1,
      bg1: '#fff6fa', bg2: '#f29abf', c: ['#ffffff', '#ffd2e6', '#e8d2ff'], hue: [336, 350, 285] }
  ];
  let themeIdx = clamp(store.get('theme', 0) | 0, 0, THEMES.length - 1);
  const TH = () => THEMES[themeIdx];

  // ================= SPİRAL (WebGL) =================
  const glc = $('#gl');
  let gl = null, prog = null, U = {};
  const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const FS = [
    'precision highp float;',
    'uniform vec2 uRes, uCenter;',
    'uniform float uTime, uSpin, uTravel, uBreath, uPulse, uEnergy, uWait, uLight, uHueT;',
    'uniform vec3 uC1, uC2, uC3, uBg1, uBg2;',
    'uniform vec4 uR0, uR1, uR2, uR3;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'vec2 rip(vec2 p, vec4 r){',
    '  if (r.w <= 0.0) return vec2(0.0);',
    '  vec2 d = p - r.xy; float L = length(d) + 1e-4; float f = r.z * 0.8;',
    '  float env = exp(-r.z * 2.4) * exp(-pow((L - f) * 6.0, 2.0));',
    '  return d / L * sin((L - f) * 34.0) * env * 0.022 * r.w;',
    '}',
    'vec3 pal(float t){ t = fract(t) * 3.0; return t < 1.0 ? mix(uC1, uC2, t) : t < 2.0 ? mix(uC2, uC3, t - 1.0) : mix(uC3, uC1, t - 2.0); }',
    'void main(){',
    '  float m = min(uRes.x, uRes.y);',
    '  vec2 p = (gl_FragCoord.xy - uCenter) / m;',
    '  p += rip(p, uR0) + rip(p, uR1) + rip(p, uR2) + rip(p, uR3);',
    '  float r = length(p), a = atan(p.y, p.x);',
    '  float lr = log(max(r, 1e-3)) - 0.06 * uBreath;',
    '  float v1 = 3.0 * (a + uSpin) / 6.2831853 + 2.1 * lr + uTravel;',
    '  float l1 = pow(0.5 + 0.5 * cos(6.2831853 * v1), mix(9.0, 4.5, uEnergy));',
    '  float v2 = 5.0 * (a - uSpin * 0.55) / 6.2831853 - 1.3 * lr + uTravel * 0.6;',
    '  float l2 = pow(0.5 + 0.5 * cos(6.2831853 * v2), 16.0);',
    '  float v3 = 1.5 * lr + uTravel * 1.25;',
    '  float l3 = pow(0.5 + 0.5 * cos(6.2831853 * v3), 22.0);',
    '  float nearF = smoothstep(0.012, 0.17, r);',
    '  float farF = 1.0 - 0.45 * smoothstep(0.7, 1.3, r);',
    '  float br = 0.42 + 0.58 * uBreath + 0.55 * uPulse + 0.3 * uEnergy;',
    '  br *= mix(1.0, 0.8 + 0.2 * sin(uTime * 7.0), uWait);',
    '  float L = (l1 + l2 * 0.3 + l3 * (0.12 + 0.3 * uBreath)) * nearF * farF * br;',
    '  vec3 lc = pal(lr * 0.22 + uHueT);',
    '  vec3 bg = mix(uBg1, uBg2, smoothstep(0.0, 1.15, r));',
    '  float core = exp(-r * r * 38.0) * (0.55 + 0.45 * uBreath + 0.7 * uPulse);',
    '  vec3 col;',
    '  if (uLight > 0.5) {',
    '    col = mix(bg, mix(lc, vec3(1.0), 0.45), clamp(L, 0.0, 1.0) * 0.72);',
    '    col = mix(col, vec3(1.0), clamp(core, 0.0, 1.0) * 0.8);',
    '  } else {',
    '    col = bg + lc * L * 1.05 + lc * core * 0.9 + lc * exp(-r * 2.6) * 0.07 * br;',
    '  }',
    '  col *= 1.0 - (0.28 - 0.18 * uLight) * smoothstep(0.55, 1.45, r);',
    '  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');
  function glInit() {
    try {
      gl = glc.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
      if (!gl) return;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['uRes', 'uCenter', 'uTime', 'uSpin', 'uTravel', 'uBreath', 'uPulse', 'uEnergy', 'uWait', 'uLight', 'uHueT', 'uC1', 'uC2', 'uC3', 'uBg1', 'uBg2', 'uR0', 'uR1', 'uR2', 'uR3']
        .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    } catch (e) { gl = null; }
  }
  let GDPR = 1;
  function glResize() {
    if (!gl) return;
    GDPR = Math.min(1.5, window.devicePixelRatio || 1);
    glc.width = Math.round(W * GDPR); glc.height = Math.round(H * GDPR);
    gl.viewport(0, 0, glc.width, glc.height);
  }
  const ripples = [];   // {x, y, t0, s}
  function glDraw(tn) {
    if (!gl) return;
    const th = TH();
    gl.uniform2f(U.uRes, glc.width, glc.height);
    gl.uniform2f(U.uCenter, CX * GDPR, (H - CY) * GDPR);
    gl.uniform1f(U.uTime, tn % 1000);
    gl.uniform1f(U.uSpin, vis.spin); gl.uniform1f(U.uTravel, vis.travel);
    gl.uniform1f(U.uBreath, vis.breath); gl.uniform1f(U.uPulse, vis.pulse);
    gl.uniform1f(U.uEnergy, vis.energy); gl.uniform1f(U.uWait, vis.wait);
    gl.uniform1f(U.uLight, th.light); gl.uniform1f(U.uHueT, vis.hueT);
    gl.uniform3fv(U.uC1, hex(th.c[0])); gl.uniform3fv(U.uC2, hex(th.c[1])); gl.uniform3fv(U.uC3, hex(th.c[2]));
    gl.uniform3fv(U.uBg1, hex(th.bg1)); gl.uniform3fv(U.uBg2, hex(th.bg2));
    for (let i = 0; i < 4; i++) {
      const r = ripples[i];
      if (r && tn - r.t0 < 2.2) gl.uniform4f(U['uR' + i], (r.x - CX) / M, (CY - r.y) / M, tn - r.t0, r.s);
      else gl.uniform4f(U['uR' + i], 0, 0, 0, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function addRipple(x, y, s) { if (reduced) return; ripples.unshift({ x, y, t0: nowS(), s }); if (ripples.length > 4) ripples.pop(); }

  // ================= SES MOTORU =================
  let ctx = null, master = null;
  let paused = false;
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
  const PRE = 0.008;   // sesin atağını kaçırmamak için çok az önceden başla
  const EW = 0.16;     // sıradaki sese en fazla bu kadar erken basılabilir
  let latMs = store.get('lat2', 0);

  let song = null;     // {buffer, name, events, taps, duration}
  let k = 0;           // sıradaki dokunuş noktası
  const clock = { ctx0: 0, pos0: 0 };    // şarkı saati
  let voice = null;    // çalan ses {src, gn, ctx0, pos0, end, endCtx}
  const tK = () => song.taps[k].t;
  // saat sıradaki noktaya vardığı an (ctx zamanı)
  const hitCtx = () => clock.ctx0 + (tK() - clock.pos0);
  function clockPos(now) {
    const p = clock.pos0 + (now - clock.ctx0);
    return k < song.taps.length ? Math.min(tK(), p) : p;
  }
  const waiting = (now) => k < song.taps.length && now >= hitCtx();

  function stopVoice(fade) {
    if (!voice) return;
    const now = ctx.currentTime, v = voice;
    try {
      v.gn.gain.cancelScheduledValues(now);
      v.gn.gain.setValueAtTime(v.gn.gain.value, now);
      v.gn.gain.linearRampToValueAtTime(0, now + fade);
      v.src.stop(now + fade + 0.01);
    } catch (e) {}
    voice = null;
  }
  // from..to aralığını "when" anında çal; sonda yumuşakça kıs
  function playRange(from, to, when) {
    const src = ctx.createBufferSource(); src.buffer = song.buffer;
    const gn = ctx.createGain(); src.connect(gn); gn.connect(master);
    const realWhen = when + Math.max(0, -from), off = Math.max(0, from);
    const dur = Math.max(0.03, to - off);
    gn.gain.setValueAtTime(0, realWhen);
    gn.gain.linearRampToValueAtTime(1, realWhen + 0.003);
    const fade = Math.min(0.02, dur * 0.3);
    gn.gain.setValueAtTime(1, realWhen + dur - fade);
    gn.gain.linearRampToValueAtTime(0, realWhen + dur);
    src.start(realWhen, off, dur + 0.01);
    voice = { src, gn, ctx0: when, pos0: from, end: to, endCtx: realWhen + dur };
  }
  const voicePos = (now) => (voice ? Math.min(voice.end, voice.pos0 + (now - voice.ctx0)) : -1);

  // ================= DOKUNUŞ NOKTALARI =================
  const DIFF = [{ min: 0.30 }, { min: 0.165 }, { min: 0.11 }];
  let diff = store.get('diff', 1);
  function buildTaps(events, dur) {
    const minG = DIFF[diff].min, startG = Math.max(0.9, minG);
    const t0 = events.length ? events[0].t : 0;
    const rampT = clamp(dur * 0.35, 14, 60);
    const gapAt = (t) => minG + (startG - minG) * Math.max(0, 1 - (t - t0) / rampT);
    const score = (e) => e.strength * (1 + 0.45 * (e.bands.indexOf(0) >= 0 || e.bands.indexOf(1) >= 0 ? 1 : 0));
    const order = events.slice().sort((a, b) => score(b) - score(a));
    const acc = [];
    const find = (t) => { let lo = 0, hi = acc.length; while (lo < hi) { const m = (lo + hi) >> 1; if (acc[m].t < t) lo = m + 1; else hi = m; } return lo; };
    for (const e of order) {
      const G = gapAt(e.t), i = find(e.t);
      if (i > 0 && e.t - acc[i - 1].t < G) continue;
      if (i < acc.length && acc[i].t - e.t < G) continue;
      acc.splice(i, 0, e);
    }
    return acc.map((e) => ({ t: e.t, s: clamp(e.strength / 1.4, 0.25, 1), band: e.main }));
  }

  // ================= OYUN DURUMU =================
  let state = 'home';
  let score = 0, combo = 0, maxCombo = 0, lastMult = 1;
  let cnt = { p: 0, gr: 0, go: 0, late: 0, miss: 0, stray: 0 };
  let missFlag = -1, lastAccept = -9, evCursor = 0, finishAt = 0;
  let bubbles = [], drops = [], floaters = [], callout = null, flash = 0, redA = 0;
  const vis = { spin: 0, travel: 0, breath: 0, pulse: 0, energy: 0, wait: 0, hueT: 0, speed: 0 };
  const mult = () => Math.min(8, 1 + Math.floor(combo / 5));
  const tier = () => { const m = mult(); return m < 3 ? 0 : m < 5 ? 1 : m < 7 ? 2 : 3; };

  function resetRun() {
    if (voice) stopVoice(0.01);
    score = 0; combo = 0; maxCombo = 0; lastMult = 1; missFlag = -1; lastAccept = -9; evCursor = 0; finishAt = 0;
    cnt = { p: 0, gr: 0, go: 0, late: 0, miss: 0, stray: 0 };
    bubbles = []; drops = []; floaters = []; callout = null; flash = 0; redA = 0;
    k = 0;
    ensureCtx();
    const first = song.taps.length ? song.taps[0].t : 0;
    const start = first < 2.6 ? -(2.6 - first) : 0;   // ilk ses çok erkense kısa bir sessiz nefes
    const when = ctx.currentTime + 0.06;
    clock.ctx0 = when; clock.pos0 = start;
    if (first - PRE > Math.max(0, start) + 0.05) playRange(start, first - PRE, when);   // giriş kendiliğinden çalar
    updateHud(true);
  }

  // ================= DOKUNUŞ =================
  const GLYPHS = ['♪', '♫', '♬', '♩'];
  function onTap(x, y) {
    if (state !== 'play' || paused || !song) return;
    ensureCtx();
    const now = ctx.currentTime;
    if (k >= song.taps.length) { spawnBubble(x, y, 'soft'); return; }
    const d = now - latMs / 1000 - hitCtx();   // <0 erken, >0 geç
    if (d < -EW) {
      if (now - lastAccept < 0.075) { spawnBubble(x, y, 'soft'); return; }  // birden çok parmak aynı anda
      cnt.stray++; score = Math.max(0, score - 50);
      breakCombo('ERKEN', x, y);
      spawnBubble(x, y, 'stray');
      updateHud();
      return;
    }
    const tp = song.taps[k];
    // saat: geç kaldıysa beklediği yerden şimdi yeniden akar; erken basışta saate dokunulmaz
    if (waiting(now)) { clock.ctx0 = now; clock.pos0 = tp.t; }
    k++; lastAccept = now;
    // ses: hemen
    stopVoice(0.008);
    const to = k < song.taps.length ? song.taps[k].t - PRE : song.duration;
    playRange(tp.t - PRE, to, now + 0.001);
    // puan
    const ad = Math.abs(d);
    let grade = ad <= 0.045 ? 'p' : ad <= 0.09 ? 'gr' : d < 0 || d <= 0.15 ? 'go' : 'late';
    const m = mult();
    if (grade === 'late') { cnt.late++; score += 30; breakCombo('GEÇ', x, y); }
    else {
      cnt[grade]++; combo++; maxCombo = Math.max(maxCombo, combo);
      score += (grade === 'p' ? 300 : grade === 'gr' ? 200 : 100) * m;
      if (grade === 'p') floaters.push({ text: 'MÜKEMMEL', x, y: y - 70 * SC, t0: nowS(), col: '#fffbe0', size: 14 });
      milestone();
    }
    if (missFlag === k - 1) missFlag = -1;
    spawnBubble(x, y, grade, tp);
    addRipple(x, y, grade === 'p' ? 1 : grade === 'late' ? 0.5 : 0.8);
    vis.pulse = Math.min(1, vis.pulse + 0.5 + 0.4 * tp.s);
    hideTapHint();
    updateHud();
  }
  function breakCombo(text, x, y) {
    const had = combo;
    combo = 0; lastMult = 1;
    floaters.push({ text, x, y: y - 70 * SC, t0: nowS(), col: '#ffd4dc', size: 13 });
    if (had >= 10) { callout = { text: 'seri bitti', t0: nowS(), small: true }; redA = 0.22; }
  }
  function milestone() {
    const m = mult();
    if (m > lastMult) { lastMult = m; const el = $('#mult'); el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 160); }
    const ms = [10, 25, 50, 100, 200, 400], tx = ['Süper', 'Harika seri', 'Efsane', 'Durdurulamaz', 'İnanılmaz', 'Kusursuz'];
    const i = ms.indexOf(combo);
    if (i >= 0) { callout = { text: tx[i], t0: nowS(), big: true }; flash = 0.14; burstConfetti(18 + i * 8); }
  }

  // ================= BALONCUKLAR =================
  function spawnBubble(x, y, kind, tp) {
    const th = TH(), soft = kind === 'soft', stray = kind === 'stray';
    const h = th.hue[(rnd() * 3) | 0] + (rnd() - 0.5) * 40;
    const base = soft ? 24 : stray ? 20 : kind === 'p' ? 42 : 36;
    bubbles.push({
      x, y, t0: nowS(), h, r: base * SC * (0.9 + rnd() * 0.25), glyph: GLYPHS[(rnd() * 4) | 0],
      life: stray ? 0.5 : 1.0, popAt: stray ? 0.22 : 0.6, dim: stray ? 0.4 : soft ? 0.7 : 1,
      drift: (rnd() - 0.5) * 36, wob: rnd() * TAU, spinG: (rnd() - 0.5) * 0.6, popped: false
    });
    if (bubbles.length > 48) bubbles.shift();
  }
  function bubbleBody(x, y, rx, ry, h, al, irid) {
    if (rx < 0.5 || al <= 0.002) return;
    const neon = TH().id === 'neon';
    g.save(); g.globalAlpha = al;
    g.translate(x, y); g.scale(1, ry / rx);
    const r = rx;
    if (neon) {
      g.shadowColor = 'hsl(' + h + ',100%,62%)'; g.shadowBlur = r * 0.8;
      g.lineWidth = Math.max(1.2, r * 0.09); g.strokeStyle = 'hsl(' + h + ',100%,74%)';
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      g.shadowBlur = 0;
      const f = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      f.addColorStop(0, 'hsla(' + h + ',100%,60%,0)'); f.addColorStop(1, 'hsla(' + h + ',100%,65%,.28)');
      g.fillStyle = f; g.fill();
    } else {
      // cam gövde
      const b = g.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r);
      b.addColorStop(0, 'hsla(' + h + ',100%,99%,.55)');
      b.addColorStop(0.55, 'hsla(' + h + ',90%,80%,.16)');
      b.addColorStop(0.85, 'hsla(' + h + ',95%,62%,.32)');
      b.addColorStop(1, 'hsla(' + h + ',100%,95%,.75)');
      g.fillStyle = b; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      // yanardöner kenar
      if (g.createConicGradient) {
        const c = g.createConicGradient(irid, 0, 0);
        c.addColorStop(0, 'hsla(' + (h + 40) + ',100%,75%,.55)'); c.addColorStop(0.33, 'hsla(' + (h - 60) + ',100%,78%,.5)');
        c.addColorStop(0.66, 'hsla(' + (h + 140) + ',100%,80%,.5)'); c.addColorStop(1, 'hsla(' + (h + 40) + ',100%,75%,.55)');
        g.lineWidth = Math.max(1, r * 0.075); g.strokeStyle = c;
      } else { g.lineWidth = Math.max(1, r * 0.06); g.strokeStyle = 'rgba(255,255,255,.8)'; }
      g.beginPath(); g.arc(0, 0, r * 0.97, 0, TAU); g.stroke();
      // parlamalar
      const s = g.createLinearGradient(0, -r * 0.92, 0, -r * 0.2);
      s.addColorStop(0, 'rgba(255,255,255,.95)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = s; g.beginPath(); g.ellipse(-r * 0.12, -r * 0.52, r * 0.55, r * 0.3, -0.25, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(r * 0.42, r * 0.5, r * 0.12, r * 0.07, -0.7, 0, TAU); g.fill();
    }
    g.restore();
  }
  function glyph(ch, x, y, size, al, h, rot) {
    if (al <= 0.002) return;
    g.save(); g.globalAlpha = al; g.translate(x, y); g.rotate(rot);
    g.font = Math.round(size) + 'px "Noto Music","Segoe UI Symbol","Apple Symbols",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = TH().id === 'neon' ? 'hsl(' + h + ',100%,60%)' : 'hsla(' + h + ',80%,30%,.45)'; g.shadowBlur = size * 0.2;
    g.fillStyle = '#fff'; g.fillText(ch, 0, size * 0.04);
    g.restore();
  }
  function drawBubbles(tn, dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], a = tn - b.t0;
      if (a > b.life) { bubbles.splice(i, 1); continue; }
      const rise = easeOutCubic(Math.min(1, a / b.life)) * 60 * SC;
      const x = b.x + b.drift * easeOutCubic(Math.min(1, a / b.life)), y = b.y - rise;
      const rot = Math.sin(a * 5 + b.wob) * 0.12 + b.spinG * a;
      if (a < b.popAt) {
        const s = easeOutBack(Math.min(1, a / 0.22));
        // yumuşak sallantı: genişlik/yükseklik birbirine karşı salınır, giderek söner
        const w = Math.sin(a * 16 + b.wob) * 0.07 * Math.exp(-a * 5);
        const r = b.r * (0.35 + 0.65 * s);
        bubbleBody(x, y, r * (1 + w), r * (1 - w), b.h, b.dim * Math.min(1, a / 0.05), b.wob + a * 2);
        glyph(b.glyph, x, y, r * 0.95, b.dim * Math.min(1, a / 0.08), b.h, rot);
      } else {
        if (!b.popped) {
          b.popped = true;
          const n = b.dim < 0.5 ? 5 : 10;
          for (let j = 0; j < n; j++) {
            const an = (j / n) * TAU + rnd() * 0.4, sp = (90 + rnd() * 110) * SC;
            drops.push({ x: x + Math.cos(an) * b.r, y: y + Math.sin(an) * b.r, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t0: tn, life: 0.35 + rnd() * 0.2, s: (2 + rnd() * 2.5) * SC, h: b.h, al: b.dim });
          }
        }
        const p = (a - b.popAt) / (b.life - b.popAt), e = easeOutCubic(p);
        // zar hızla genişleyip incelir
        const ma = Math.max(0, 1 - p * 3.2) * b.dim;
        if (ma > 0) {
          g.save(); g.globalAlpha = ma;
          g.strokeStyle = TH().id === 'neon' ? 'hsl(' + b.h + ',100%,72%)' : 'rgba(255,255,255,.95)';
          g.lineWidth = Math.max(0.5, b.r * 0.06 * (1 - p * 2));
          g.beginPath(); g.arc(x, y, b.r * (1 + e * 0.35), 0, TAU); g.stroke();
          g.restore();
        }
        // nota yükselip söner
        glyph(b.glyph, x, y - e * 22 * SC, b.r * 0.95 * (1 + e * 0.18), (1 - e) * b.dim, b.h, rot);
      }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i], p = (tn - d.t0) / d.life;
      if (p >= 1) { drops.splice(i, 1); continue; }
      d.vx *= 1 - dt * 5; d.vy *= 1 - dt * 5; d.vy += dt * 60; d.x += d.vx * dt; d.y += d.vy * dt;
      bubbleBody(d.x, d.y, d.s * (1 - p * 0.6), d.s * (1 - p * 0.6), d.h, (1 - p) * d.al, 0);
    }
  }
  function burstConfetti(n) {
    if (reduced) return;
    const tn = nowS(), th = TH();
    for (let i = 0; i < n; i++) {
      const an = rnd() * TAU, sp = (160 + rnd() * 300) * SC;
      drops.push({ x: CX, y: CY, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, t0: tn, life: 0.8 + rnd() * 0.6, s: (4 + rnd() * 6) * SC, h: th.hue[i % 3] + rnd() * 30, al: 1 });
    }
  }
  function drawText(tn) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const light = TH().light;
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i], a = (tn - f.t0) / 0.75;
      if (a >= 1) { floaters.splice(i, 1); continue; }
      g.globalAlpha = (1 - a) * (1 - a) * 0.95;
      g.font = '900 ' + Math.round(f.size * SC) + 'px Nunito, system-ui, sans-serif';
      if (light) { g.fillStyle = 'rgba(0,50,90,.25)'; g.fillText(f.text, f.x, f.y - easeOutCubic(a) * 22 * SC + 1.5); }
      g.fillStyle = f.col; g.fillText(f.text, f.x, f.y - easeOutCubic(a) * 22 * SC);
    }
    g.globalAlpha = 1;
    if (callout) {
      const a = (tn - callout.t0) / 1.6;
      if (a >= 1) { callout = null; return; }
      const s = callout.big ? 0.85 + 0.15 * easeOutBack(Math.min(1, a / 0.25)) : 1;
      g.globalAlpha = a < 0.15 ? a / 0.15 : a > 0.7 ? 1 - (a - 0.7) / 0.3 : 1;
      g.font = '400 ' + Math.round((callout.big ? 40 : 22) * SC * s) + 'px "Varela Round", Nunito, sans-serif';
      const y = H * 0.2 - easeOutCubic(a) * 10;
      if (light) { g.fillStyle = 'rgba(0,50,90,.25)'; g.fillText(callout.text, W / 2, y + 2); }
      g.fillStyle = '#fff'; g.fillText(callout.text, W / 2, y);
      g.globalAlpha = 1;
    }
  }

  // ---- ortam (spiralin üstünde, hafif) ----
  let amb = [];
  function initAmbient() {
    amb = [];
    const id = TH().id, n = id === 'galaxy' ? 110 : id === 'sakura' ? 18 : id === 'aero' ? 8 : 24;
    for (let i = 0; i < n; i++) amb.push({ x: rnd() * W, y: rnd() * H, s: rnd(), p: rnd() * TAU, v: 0.3 + rnd() * 0.7 });
  }
  function drawAmbient(tn, dt) {
    const id = TH().id, sp = 0.4 + vis.speed;
    for (const b of amb) {
      if (id === 'aero') {
        b.y -= dt * 14 * b.v * sp; if (b.y < -50) { b.y = H + 50; b.x = rnd() * W; }
        bubbleBody(b.x + Math.sin(tn * 0.4 + b.p) * 14, b.y, (5 + b.s * 12) * SC, (5 + b.s * 12) * SC, 195, 0.32, tn * 0.3 + b.p);
      } else if (id === 'sakura') {
        b.y += dt * 24 * b.v * sp; b.x += Math.sin(tn * 0.9 + b.p) * dt * 22;
        if (b.y > H + 20) { b.y = -20; b.x = rnd() * W; }
        g.save(); g.translate(b.x, b.y); g.rotate(tn * b.v + b.p); g.globalAlpha = 0.75;
        g.fillStyle = 'hsl(' + (340 + b.s * 15) + ',100%,' + (84 + b.s * 8) + '%)';
        g.beginPath(); g.ellipse(0, 0, (4 + b.s * 4) * SC, (2.5 + b.s * 2) * SC, 0, 0, TAU); g.fill(); g.restore();
      } else if (id === 'galaxy') {
        // yıldızlar sonsuzluğa, merkeze doğru akar
        const dx = b.x - CX, dy = b.y - CY;
        const f = 1 - dt * 0.35 * b.v * sp;
        b.x = CX + dx * f; b.y = CY + dy * f;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { const an = rnd() * TAU, rr = Math.max(W, H) * 0.6; b.x = CX + Math.cos(an) * rr; b.y = CY + Math.sin(an) * rr; }
        const dist = Math.hypot(dx, dy) / M;
        g.globalAlpha = clamp(dist * 2, 0, 1) * (0.4 + 0.6 * Math.sin(tn * 2.5 + b.p) ** 2);
        g.fillStyle = '#dfe6ff'; g.fillRect(b.x, b.y, 1 + b.s * 1.4, 1 + b.s * 1.4);
      } else {
        const dx = b.x - CX, dy = b.y - CY, f = 1 - dt * 0.25 * b.v * sp;
        b.x = CX + dx * f; b.y = CY + dy * f;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { const an = rnd() * TAU, rr = Math.max(W, H) * 0.6; b.x = CX + Math.cos(an) * rr; b.y = CY + Math.sin(an) * rr; }
        g.globalAlpha = clamp(Math.hypot(dx, dy) / M * 2, 0, 1) * 0.6;
        g.fillStyle = b.s > 0.5 ? '#ff6be6' : '#5ff0ff'; g.fillRect(b.x, b.y, 2, 2);
      }
    }
    g.globalAlpha = 1;
  }

  // ================= ANA DÖNGÜ =================
  let lastT = nowS();
  function frame() {
    requestAnimationFrame(frame);
    const tn = nowS(), dt = Math.min(0.05, tn - lastT); lastT = tn;
    let breathT = 0, waitT = 0, flowing = false;
    if (song && state === 'play' && ctx) {
      const now = ctx.currentTime;
      if (!paused) tick(now);
      const vp = voicePos(now - (ctx.outputLatency || ctx.baseLatency || 0));
      flowing = !!voice && now < voice.endCtx;
      // her ses duyulduğunda spiral nabız atar
      if (voice) {
        const ev = song.events;
        while (evCursor < ev.length && ev[evCursor].t < voice.pos0) evCursor++;
        while (evCursor < ev.length && ev[evCursor].t <= vp) { vis.pulse = Math.min(1, vis.pulse + 0.18 + 0.3 * clamp(ev[evCursor].strength / 1.4, 0, 1)); evCursor++; }
      }
      // nefes: sıradaki sesin anına yaklaştıkça dolar, anında en dolu
      if (k < song.taps.length) {
        const c = clockPos(now), t = tK(), prev = k > 0 ? song.taps[k - 1].t : t - 1;
        const span = clamp(t - prev, 0.3, 1.1);
        const amp = clamp((t - prev - 0.12) / 0.5, 0.35, 1);
        breathT = smooth(clamp(1 - (t - c) / span, 0, 1)) * amp;
        if (waiting(now)) { breathT = 1; waitT = clamp((now - hitCtx()) / 0.3, 0, 1); }
      }
      $('#prog i').style.width = (clamp(clockPos(now) / song.duration, 0, 1) * 100).toFixed(2) + '%';
    }
    // görsel durum yumuşak geçişlerle
    vis.breath += (breathT - vis.breath) * Math.min(1, dt * (breathT < vis.breath ? 9 : 22));
    vis.wait += (waitT - vis.wait) * Math.min(1, dt * 6);
    vis.pulse = Math.max(0, vis.pulse - dt * 2.6);
    const targetSpeed = state === 'play' ? (flowing ? 1 : 0.08) : 0.35;
    vis.speed += (targetSpeed - vis.speed) * Math.min(1, dt * (targetSpeed > vis.speed ? 6 : 2.5));
    vis.energy += ((state === 'play' ? tier() / 3 : 0) - vis.energy) * Math.min(1, dt * 1.5);
    vis.travel += dt * vis.speed * (0.32 + 0.22 * vis.energy) * (reduced ? 0.3 : 1);
    vis.spin += dt * (0.06 + vis.speed * (0.12 + 0.12 * vis.energy)) * (reduced ? 0.3 : 1);
    vis.hueT += dt * (0.01 + 0.05 * vis.energy * vis.energy);
    flash = Math.max(0, flash - dt * 1.4); redA = Math.max(0, redA - dt * 1.2);

    glDraw(tn);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!gl) {
      const th = TH(), bgr = g.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.7);
      bgr.addColorStop(0, th.bg1); bgr.addColorStop(1, th.bg2); g.fillStyle = bgr; g.fillRect(0, 0, W, H);
    }
    drawAmbient(tn, dt);
    drawBubbles(tn, dt);
    drawText(tn);
    if (redA > 0) {
      const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      rg.addColorStop(0, 'rgba(255,70,100,0)'); rg.addColorStop(1, 'rgba(255,70,100,' + redA + ')');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
    if (flash > 0 && !reduced) { g.fillStyle = 'rgba(255,255,255,' + flash + ')'; g.fillRect(0, 0, W, H); }
  }
  function tick(now) {
    if (k < song.taps.length) {
      if (waiting(now) && now - hitCtx() > 0.6 && missFlag !== k) {
        missFlag = k; cnt.miss++; score = Math.max(0, score - 100);
        breakCombo('KAÇTI', CX, CY);
        showTapHint();
        updateHud();
      }
    } else if (!finishAt && (!voice || now >= voice.endCtx)) finishAt = now;
    if (finishAt && now - finishAt > 0.4) finish();
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
    $('#hud').classList.toggle('off', state !== 'play');
  }
  let hintT = 0;
  function showTapHint(first) {
    const el = $('#tapHint');
    el.innerHTML = first
      ? 'Ekranın her yeri çalgı<small>Spiral nefes alıp en parlak olduğunda dokun. Ses parmağının değdiği an çıkar.</small>'
      : 'Şarkı seni bekliyor';
    el.hidden = false; el.style.opacity = 1;
    clearTimeout(hintT); hintT = setTimeout(hideTapHint, first ? 5000 : 2200);
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
    const v = acc - (cnt.miss + cnt.stray * 0.5) / n;
    $('#rRank').textContent = v >= 0.95 ? 'S' : v >= 0.85 ? 'A' : v >= 0.7 ? 'B' : v >= 0.5 ? 'C' : 'D';
    const row = (a, b, c) => '<span' + (c ? ' class="big"' : '') + '>' + a + '</span><b' + (c ? ' class="big"' : '') + '>' + b + '</b>';
    $('#rStats').innerHTML = row('Puan', score.toLocaleString('tr-TR'), 1) + row('En uzun seri', maxCombo) +
      row('Mükemmel', cnt.p) + row('Harika', cnt.gr) + row('İyi', cnt.go) + row('Geç', cnt.late) + row('Kaçan', cnt.miss) + row('Çok erken', cnt.stray) +
      row('Doğruluk', Math.round(clamp(acc, 0, 1) * 100) + '%');
    show('result');
  }
  function pause() {
    if (state !== 'play' || paused) return;
    paused = true; if (ctx) ctx.suspend();
    show('pause'); renderChips();
  }
  function resume() { paused = false; show(null); if (ctx) ctx.resume(); }

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
  function decode(ab) {
    return new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
  }
  async function prepare(name, buffer) {
    busy('Şarkı hazırlanıyor', 0.25, 'Sesler ayrılıyor…');
    const chs = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chs.push(buffer.getChannelData(c));
    const an = await Analysis.analyze(chs, buffer.sampleRate, (p) => busy('Şarkı hazırlanıyor', 0.25 + 0.7 * p, 'Sesler ayrılıyor…'), { play: true, floorK: 0.2, kLm: 1.25, kP: 0.1 });
    if (an.events.length < 4) throw new Error('Bu dosyada ayırt edilebilir ses bulunamadı.');
    song = { buffer, name, events: an.events, taps: buildTaps(an.events, buffer.duration), duration: buffer.duration };
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
      try { buffer = await decode(ab); } catch (e) { throw new Error('Bu cihaz bu dosya biçimini açamadı. MP3 veya M4A olarak dene.'); }
      await prepare(file.name.replace(/\.[^.]+$/, ''), buffer);
    } catch (e) { state = 'home'; show('home'); $('#err').textContent = (e && e.message) || 'Dosya açılamadı.'; }
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
    } catch (e) { state = 'home'; show('home'); $('#err').textContent = 'Örnek parça açılamadı: ' + ((e && e.message) || e); }
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
  $('#newSong').addEventListener('click', () => { if (ctx) ctx.resume(); stopVoice(0.02); paused = false; state = 'home'; show('home'); });
  $('#again').addEventListener('click', () => { if (song) { song.taps = buildTaps(song.events, song.duration); startPlay(); } });
  $('#menu2').addEventListener('click', () => { stopVoice(0.02); state = 'home'; show('home'); });
  $('#diff').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    diff = +b.dataset.v; store.set('diff', diff);
    document.querySelectorAll('#diff button').forEach((x) => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('#diff button').forEach((x) => x.classList.toggle('on', +x.dataset.v === diff));
  const lat = $('#lat');
  lat.value = latMs; $('#latO').textContent = latMs + ' ms';
  lat.addEventListener('input', () => { latMs = +lat.value; $('#latO').textContent = latMs + ' ms'; store.set('lat2', latMs); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('resize', resize);

  glInit();
  resize();
  renderChips();
  requestAnimationFrame(frame);

  // test kancası
  window.__dc = {
    get state() { return state; }, get k() { return k; }, get song() { return song; }, get ctx() { return ctx; },
    get cnt() { return cnt; }, get score() { return score; }, get gl() { return !!gl; }, get vis() { return vis; },
    tap: onTap, demo: loadDemo, clockPos: () => clockPos(ctx.currentTime), hitCtx: () => hitCtx(),
    voicePos: () => voicePos(ctx.currentTime)
  };
})();

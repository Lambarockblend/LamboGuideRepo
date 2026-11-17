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
    'uniform float uTime, uSpin, uTravel, uBreath, uPulse, uEnergy, uWait, uLight, uHueT, uDrum, uHold, uPunch;',
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
    '  float lr = log(max(r, 1e-3)) - 0.06 * uBreath - 0.16 * uPunch + 0.05 * uDrum;',
    '  float v1 = 3.0 * (a + uSpin) / 6.2831853 + 2.1 * lr + uTravel;',
    '  float sharp = mix(9.0, 4.5, uEnergy) * (1.0 + 1.6 * uDrum) / (1.0 + 2.2 * uHold);',
    '  float l1 = pow(0.5 + 0.5 * cos(6.2831853 * v1), sharp);',
    '  float v2 = 5.0 * (a - uSpin * 0.55) / 6.2831853 - 1.3 * lr + uTravel * 0.6;',
    '  float l2 = pow(0.5 + 0.5 * cos(6.2831853 * v2), 16.0);',
    '  float v3 = 1.5 * lr + uTravel * 1.25;',
    '  float l3 = pow(0.5 + 0.5 * cos(6.2831853 * v3), 22.0);',
    '  float nearF = smoothstep(0.012, 0.17, r);',
    '  float farF = 1.0 - 0.45 * smoothstep(0.7, 1.3, r);',
    '  float br = 0.42 + 0.58 * uBreath + 0.55 * uPulse + 0.3 * uEnergy + 0.9 * uPunch + 0.25 * uHold;',
    '  br *= mix(1.0, 0.8 + 0.2 * sin(uTime * 7.0), uWait);',
    '  float L = (l1 + l2 * 0.3 + l3 * (0.12 + 0.3 * uBreath)) * nearF * farF * br;',
    '  vec3 lc = pal(lr * 0.22 + uHueT);',
    '  vec3 bg = mix(uBg1, uBg2, smoothstep(0.0, 1.15, r));',
    '  float core = exp(-r * r * (38.0 - 22.0 * uPunch)) * (0.55 + 0.45 * uBreath + 0.7 * uPulse + 1.2 * uPunch);',
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
      ['uRes', 'uCenter', 'uTime', 'uSpin', 'uTravel', 'uBreath', 'uPulse', 'uEnergy', 'uWait', 'uLight', 'uHueT', 'uDrum', 'uHold', 'uPunch', 'uC1', 'uC2', 'uC3', 'uBg1', 'uBg2', 'uR0', 'uR1', 'uR2', 'uR3']
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
    gl.uniform1f(U.uDrum, vis.drum); gl.uniform1f(U.uHold, vis.hold); gl.uniform1f(U.uPunch, vis.punch);
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

  // ================= DOKUNUŞ NOKTALARI (vuruş ızgarası) =================
  // Seviye: 0 = iki vuruşta bir, 1 = her vuruş, 2 = yarım vuruş (sekizlik), 3 = çeyrek vuruş (onaltılık)
  // Şarkı ilerledikçe seviye yükselir: aralık önce uzun, sonra kısalır.
  const DIFF = [{ from: 0, to: 1 }, { from: 0, to: 2 }, { from: 1, to: 3 }];
  let diff = store.get('diff', 1);
  function buildTaps(events, beats, dur) {
    const cfg = DIFF[diff];
    const first = beats.findIndex((b) => b >= (events.length ? events[0].t - 0.1 : 0));
    const t0 = beats[Math.max(0, first)] || 0;
    const steps = cfg.to - cfg.from + 1;
    const stepLen = clamp((dur - t0) * 0.5 / steps, 12, 40);    // her seviye en az 12 sn sürer
    const levelAt = (t) => Math.min(cfg.to, cfg.from + Math.floor(Math.max(0, t - t0) / stepLen));
    // ızgara noktaları
    const grid = [];
    for (let i = 0; i < beats.length - 1; i++) {
      const b = beats[i], p = beats[i + 1] - b;
      grid.push({ t: b, lvl: i % 2 === 0 ? 0 : 1 });
      grid.push({ t: b + p / 2, lvl: 2 });
      grid.push({ t: b + p / 4, lvl: 3 }); grid.push({ t: b + (3 * p) / 4, lvl: 3 });
    }
    grid.sort((a, b) => a.t - b.t);
    const per = beats.length > 1 ? beats[1] - beats[0] : 0.5;
    const tol = [0.08, 0.08, per * 0.15, per * 0.09];
    // her ızgara noktasına en yakın gerçek sesi bul
    const ev = events;
    let j = 0;
    const taps = [];
    const used = new Set();
    for (const gp of grid) {
      if (gp.lvl > levelAt(gp.t)) continue;
      while (j < ev.length && ev[j].t < gp.t - tol[gp.lvl]) j++;
      let best = -1, bd = Infinity;
      for (let q = j; q < ev.length && ev[q].t <= gp.t + tol[gp.lvl]; q++) {
        const d = Math.abs(ev[q].t - gp.t) - 0.02 * ev[q].strength;
        if (d < bd && !used.has(q)) { bd = d; best = q; }
      }
      if (best < 0) continue;            // ızgara noktasında ses yoksa orası es
      const e = ev[best];
      if (taps.length && e.t - taps[taps.length - 1].t < 0.09) continue;
      used.add(best);
      taps.push({ t: e.t, s: clamp(e.strength / 1.4, 0.25, 1), kind: e.kind || 'note', sub: e.sub || 'snare', dur: 0, sus: e.sustain || 0, lvl: gp.lvl });
    }
    for (let i = 0; i < taps.length; i++) {
      const tp = taps[i];
      if (tp.kind !== 'hold') continue;
      const nx = i + 1 < taps.length ? taps[i + 1].t : tp.t + 4;
      tp.dur = Math.min(tp.sus, nx - tp.t - 0.08);
      if (tp.dur < 0.4) tp.kind = 'note';
    }
    return taps;
  }

  // ================= OYUN DURUMU =================
  let state = 'home';
  let score = 0, combo = 0, maxCombo = 0, lastMult = 1;
  let cnt = { p: 0, gr: 0, go: 0, late: 0, miss: 0, stray: 0 };
  let missFlag = -1, lastAccept = -9, evCursor = 0, finishAt = 0, beatCur = 0;
  let bubbles = [], drops = [], floaters = [], callout = null, flash = 0, redA = 0;
  const vis = { spin: 0, travel: 0, breath: 0, pulse: 0, energy: 0, wait: 0, hueT: 0, speed: 0, drum: 0, hold: 0, punch: 0 };
  const mult = () => Math.min(8, 1 + Math.floor(combo / 5));
  const tier = () => { const m = mult(); return m < 3 ? 0 : m < 5 ? 1 : m < 7 ? 2 : 3; };

  function resetRun() {
    if (voice) stopVoice(0.01);
    score = 0; combo = 0; maxCombo = 0; lastMult = 1; missFlag = -1; lastAccept = -9; evCursor = 0; finishAt = 0;
    cnt = { p: 0, gr: 0, go: 0, late: 0, miss: 0, stray: 0 };
    bubbles = []; drops = []; floaters = []; callout = null; flash = 0; redA = 0;
    hold = null; rings.length = 0;
    k = 0;
    ensureCtx();
    const first = song.taps.length ? song.taps[0].t : 0;
    const per = song.beats.length > 1 ? song.beats[1] - song.beats[0] : 0.5;
    const start = Math.min(0, first - 4 * per);   // ilk dokunuştan önce en az 4 vuruşluk sayım
    beatCur = 0; while (beatCur < song.beats.length && song.beats[beatCur] < start + 0.01) beatCur++;
    const when = ctx.currentTime + 0.06;
    clock.ctx0 = when; clock.pos0 = start;
    if (first - PRE > Math.max(0, start) + 0.05) playRange(start, first - PRE, when);   // giriş kendiliğinden çalar
    updateHud(true);
  }

  // ================= DOKUNUŞ =================
  const GLYPHS = ['♪', '♫', '♬', '♩'];
  let hold = null;     // basılı tutulan uzun ses {pid, idx, tStart, dur, x, y, path, held, done}
  let holdHinted = false;
  function onTap(x, y, pid) {
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
    endHold(now, true);
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
      if (grade === 'p' && tp.kind !== 'drum') floaters.push({ text: 'MÜKEMMEL', x, y: y - 70 * SC, t0: nowS(), col: '#fffbe0', size: 14 });
      milestone();
    }
    if (missFlag === k - 1) missFlag = -1;
    // sesin türüne göre his
    if (tp.kind === 'drum') {
      drumHit(x, y, tp.sub, grade);
    } else if (tp.kind === 'hold') {
      hold = { pid, idx: k - 1, tStart: now, dur: tp.dur, x, y, path: [{ x, y, t: nowS() }], held: 0, slide: 0, done: false, h: TH().hue[(rnd() * 3) | 0], glyph: GLYPHS[(rnd() * 4) | 0], t0: nowS() };
      addRipple(x, y, 0.7);
      vis.pulse = Math.min(1, vis.pulse + 0.4);
      if (!holdHinted) { holdHinted = true; showTapHint('hold'); }
    } else {
      spawnBubble(x, y, grade, tp);
      addRipple(x, y, grade === 'p' ? 1 : grade === 'late' ? 0.5 : 0.8);
      vis.pulse = Math.min(1, vis.pulse + 0.5 + 0.4 * tp.s);
    }
    if (tp.kind !== 'hold') hideTapHint();
    updateHud();
  }
  // ---- basılı tutma ----
  function moveHold(x, y, pid) {
    if (!hold || hold.done || hold.pid !== pid) return;
    const last = hold.path[hold.path.length - 1], dist = Math.hypot(x - last.x, y - last.y);
    if (dist < 2) return;
    hold.slide += dist; hold.x = x; hold.y = y;
    hold.path.push({ x, y, t: nowS() });
    if (hold.path.length > 90) hold.path.shift();
    if (rnd() < Math.min(0.6, dist / 30)) drops.push({ x, y, vx: (rnd() - 0.5) * 40, vy: -20 - rnd() * 40, t0: nowS(), life: 0.6 + rnd() * 0.4, s: (2 + rnd() * 3) * SC, h: hold.h + (rnd() - 0.5) * 40, al: 0.9 });
  }
  function releaseHold(pid) {
    if (!hold || hold.done || hold.pid !== pid) return;
    endHold(ctx.currentTime, false);
  }
  // uzun sesi bitir: parmak kalktı, başka dokunuş geldi ya da ses doğal sonuna vardı
  function endHold(now, interrupted) {
    if (!hold || hold.done) return;
    const h = hold; h.done = true; h.tEnd = nowS();
    const ratio = clamp((now - h.tStart) / h.dur, 0, 1);
    const m = mult();
    if (ratio >= 0.85 || interrupted) {
      const bonus = Math.round((150 + Math.min(150, h.slide / 4)) * m);
      score += bonus;
      floaters.push({ text: h.slide > 60 ? 'AKIŞ +' + bonus : 'UZUN +' + bonus, x: h.x, y: h.y - 70 * SC, t0: nowS(), col: '#fffbe0', size: 14 });
      spawnBubble(h.x, h.y, 'p');
      addRipple(h.x, h.y, 1);
    } else {
      // erken bırakıldı: ses o an yumuşakça kesilir
      if (voice) stopVoice(0.12);
      score += Math.round(ratio * 120 * m);
      if (ratio < 0.4) breakCombo('ERKEN BIRAKTIN', h.x, h.y);
      else floaters.push({ text: 'KISA', x: h.x, y: h.y - 70 * SC, t0: nowS(), col: '#d8f6ff', size: 13 });
      spawnBubble(h.x, h.y, 'soft');
    }
    updateHud();
  }
  // ---- davul vuruşu ----
  const rings = [];
  let shake = 0;
  function drumHit(x, y, sub, grade) {
    const kick = sub === 'kick', tn = nowS(), th = TH();
    const h = th.hue[kick ? 0 : 1] + (rnd() - 0.5) * 20;
    rings.push({ x, y, t0: tn, kick, h, s: grade === 'p' ? 1.15 : 1, seed: rnd() * TAU });
    if (rings.length > 24) rings.shift();
    addRipple(x, y, kick ? 1.7 : 1.0);
    if (kick) { vis.punch = 1; shake = Math.max(shake, 7); vib(18); }
    else { vis.punch = Math.max(vis.punch, 0.35); shake = Math.max(shake, 2.5); vib(8); }
    vis.pulse = Math.min(1, vis.pulse + 0.6);
  }
  function vib(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  function drawRings(tn) {
    const light = TH().light, neon = TH().id === 'neon';
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], a = tn - r.t0, life = r.kick ? 0.55 : 0.38;
      if (a > life) { rings.splice(i, 1); continue; }
      const p = a / life, e = easeOutCubic(p);
      g.save();
      g.globalCompositeOperation = light ? 'source-over' : 'lighter';
      if (r.kick) {
        // bas davul: derinden gelen kalın şok dalgası + içte sönen parlama (deri titreşimi)
        const R0 = 150 * SC * r.s;
        const fl = Math.max(0, 1 - a / 0.12);
        if (fl > 0) {
          const fg = g.createRadialGradient(r.x, r.y, 0, r.x, r.y, 70 * SC);
          fg.addColorStop(0, 'hsla(' + r.h + ',100%,' + (light ? 98 : 75) + '%,' + 0.8 * fl + ')'); fg.addColorStop(1, 'hsla(' + r.h + ',100%,70%,0)');
          g.fillStyle = fg; g.beginPath(); g.arc(r.x, r.y, 70 * SC, 0, TAU); g.fill();
        }
        for (let j = 0; j < 2; j++) {
          const pe = easeOutCubic(clamp((a - j * 0.07) / (life - j * 0.07), 0, 1));
          if (pe <= 0) continue;
          g.globalAlpha = Math.min(1, (1 - pe) * 1.4) * (j ? 0.6 : 1);
          g.lineWidth = (j ? 4 : 18) * SC * (1 - pe * 0.8) + 1.5;
          g.strokeStyle = neon ? 'hsl(' + r.h + ',100%,65%)' : 'hsla(' + r.h + ',100%,' + (light ? 97 : 78) + '%,1)';
          if (neon) { g.shadowColor = 'hsl(' + r.h + ',100%,60%)'; g.shadowBlur = 18; }
          // deri: hafif dalgalı çember
          g.beginPath();
          for (let q = 0; q <= 48; q++) {
            const an = (q / 48) * TAU, wob = 1 + 0.035 * Math.sin(an * 6 + r.seed + a * 30) * (1 - pe);
            const rr = R0 * pe * wob, px = r.x + Math.cos(an) * rr, py = r.y + Math.sin(an) * rr;
            if (q === 0) g.moveTo(px, py); else g.lineTo(px, py);
          }
          g.stroke();
        }
      } else {
        // trampet / zil: keskin kıvılcım çizgileri + ince halka
        const n = 12;
        g.strokeStyle = neon ? 'hsl(' + r.h + ',100%,72%)' : 'hsla(' + r.h + ',100%,' + (light ? 98 : 82) + '%,1)';
        g.lineCap = 'round';
        g.globalAlpha = 1 - p;
        g.lineWidth = 2.6 * SC * (1 - p) + 0.5;
        for (let q = 0; q < n; q++) {
          const an = (q / n) * TAU + r.seed, r1 = (14 + 70 * e) * SC * r.s, r2 = r1 - (26 * (1 - p) + 4) * SC;
          g.beginPath(); g.moveTo(r.x + Math.cos(an) * Math.max(6 * SC, r2), r.y + Math.sin(an) * Math.max(6 * SC, r2)); g.lineTo(r.x + Math.cos(an) * r1, r.y + Math.sin(an) * r1); g.stroke();
        }
        g.lineWidth = 1.5 * SC; g.globalAlpha = (1 - p) * 0.8;
        g.beginPath(); g.arc(r.x, r.y, (10 + 46 * e) * SC, 0, TAU); g.stroke();
        const fl = Math.max(0, 1 - a / 0.08);
        if (fl > 0) { g.globalAlpha = fl; g.fillStyle = '#fff'; g.beginPath(); g.arc(r.x, r.y, 9 * SC, 0, TAU); g.fill(); }
      }
      g.restore();
    }
  }
  // ---- basılı tutulan baloncuk + kaydırma izi ----
  function drawHold(tn) {
    if (!hold) return;
    const h = hold, neon = TH().id === 'neon', light = TH().light;
    const fadeOut = h.done ? clamp((tn - h.tEnd) / 0.5, 0, 1) : 0;
    if (h.done && fadeOut >= 1) { hold = null; return; }
    // iz: kuyruğu incelen, zamanla solan şerit
    const pts = h.path.filter((q) => tn - q.t < 0.7);
    if (pts.length > 1) {
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      g.globalCompositeOperation = light ? 'source-over' : 'lighter';
      for (let i = 1; i < pts.length; i++) {
        const age = (tn - pts[i].t) / 0.7, w = (1 - age) * 16 * SC * (1 - fadeOut);
        if (w <= 0.3) continue;
        g.strokeStyle = 'hsla(' + (h.h + i * 2) + ',100%,' + (light ? 94 : 70) + '%,' + (0.65 * (1 - age)) + ')';
        if (neon) { g.shadowColor = 'hsl(' + h.h + ',100%,60%)'; g.shadowBlur = 14; }
        g.lineWidth = w; g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
      }
      g.restore();
    }
    if (h.done) return;
    // parmağın altında büyüyen baloncuk; dolum halkası ne kadar tutulacağını gösterir
    const a = tn - h.t0, prog = clamp((ctx.currentTime - h.tStart) / h.dur, 0, 1);
    const r = (30 + 22 * prog) * SC * (0.4 + 0.6 * easeOutBack(Math.min(1, a / 0.25)));
    const w = Math.sin(a * 9) * 0.05;
    bubbleBody(h.x, h.y, r * (1 + w), r * (1 - w), h.h, 1, a * 1.5);
    glyph(h.glyph, h.x, h.y, r * 0.9, 1, h.h, Math.sin(a * 3) * 0.15);
    g.save();
    g.lineCap = 'round'; g.lineWidth = 4 * SC;
    g.strokeStyle = light ? 'rgba(255,255,255,.95)' : 'hsl(' + h.h + ',100%,75%)';
    if (!light) { g.shadowColor = 'hsl(' + h.h + ',100%,60%)'; g.shadowBlur = 12; }
    g.beginPath(); g.arc(h.x, h.y, r + 9 * SC, -Math.PI / 2, -Math.PI / 2 + prog * TAU); g.stroke();
    g.restore();
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
    let breathT = 0, waitT = 0, flowing = false, drumT = 0, holdT = 0;
    if (song && state === 'play' && ctx) {
      const now = ctx.currentTime;
      if (!paused) tick(now);
      const vp = voicePos(now - (ctx.outputLatency || ctx.baseLatency || 0));
      flowing = !!voice && now < voice.endCtx;
      // metronom: spiral şarkının her vuruşunda atar (şarkı beklerken susar). Ölçü başı daha güçlü.
      const cHeard = clockPos(now - (ctx.outputLatency || ctx.baseLatency || 0)), bts = song.beats;
      while (beatCur < bts.length && bts[beatCur] <= cHeard) {
        const onTapBeat = k < song.taps.length && Math.abs(bts[beatCur] - tK()) < 0.08;
        vis.pulse = Math.min(1, vis.pulse + (beatCur % 4 === 0 ? 0.55 : 0.35) + (onTapBeat ? 0.2 : 0));
        beatCur++;
      }
      // nefes: sıradaki sesin anına yaklaştıkça dolar, anında en dolu
      if (k < song.taps.length) {
        const c = clockPos(now), t = tK(), prev = k > 0 ? song.taps[k - 1].t : t - 1;
        const per = song.beats.length > 1 ? song.beats[1] - song.beats[0] : 0.5;
        const span = clamp(Math.min(t - prev, per), 0.2, 1.1);   // nefes tam bir vuruş boyunca dolar
        const amp = clamp((t - prev - 0.12) / 0.5, 0.35, 1);
        const x = clamp(1 - (t - c) / span, 0, 1), kind = song.taps[k].kind;
        breathT = (kind === 'drum' ? x * x * x : smooth(x)) * amp;   // davulda gerilim sona doğru birden artar
        drumT = kind === 'drum' ? x * x : 0;
        holdT = kind === 'hold' ? smooth(x) * 0.6 : 0;
        if (waiting(now)) { breathT = 1; waitT = clamp((now - hitCtx()) / 0.3, 0, 1); }
      }
      $('#prog i').style.width = (clamp(clockPos(now) / song.duration, 0, 1) * 100).toFixed(2) + '%';
    }
    // görsel durum yumuşak geçişlerle
    vis.breath += (breathT - vis.breath) * Math.min(1, dt * (breathT < vis.breath ? 9 : 22));
    vis.wait += (waitT - vis.wait) * Math.min(1, dt * 6);
    if (hold && !hold.done) holdT = 1;
    vis.drum += (drumT - vis.drum) * Math.min(1, dt * (drumT < vis.drum ? 14 : 20));
    vis.hold += (holdT - vis.hold) * Math.min(1, dt * 5);
    vis.punch = Math.max(0, vis.punch - dt * 4.5);
    shake = Math.max(0, shake - dt * 30);
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
    g.save();
    if (shake > 0.2 && !reduced) g.translate((rnd() - 0.5) * shake, (rnd() - 0.5) * shake);
    drawAmbient(tn, dt);
    drawRings(tn);
    drawHold(tn);
    drawBubbles(tn, dt);
    drawText(tn);
    g.restore();
    if (redA > 0) {
      const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      rg.addColorStop(0, 'rgba(255,70,100,0)'); rg.addColorStop(1, 'rgba(255,70,100,' + redA + ')');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
    if (flash > 0 && !reduced) { g.fillStyle = 'rgba(255,255,255,' + flash + ')'; g.fillRect(0, 0, W, H); }
  }
  function tick(now) {
    if (hold && !hold.done && now >= hold.tStart + hold.dur) endHold(now, false);
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
    el.innerHTML = first === 'hold'
      ? 'Uzun ses: parmağını kaldırma<small>Halka dolana kadar basılı tut, istersen gezdir.</small>'
      : first
        ? 'Ekranın her yeri çalgı<small>Spiral nefes alıp en parlak olduğunda dokun. Ses parmağının değdiği an çıkar.</small>'
        : 'Şarkı seni bekliyor';
    el.hidden = false; el.style.opacity = 1;
    clearTimeout(hintT); hintT = setTimeout(hideTapHint, first ? 4500 : 2200);
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
    const an = await Analysis.analyze(chs, buffer.sampleRate, (p) => busy('Şarkı hazırlanıyor', 0.2 + 0.35 * p, 'Sesler ayrılıyor…'), { play: true, floorK: 0.2, kLm: 1.25, kP: 0.1 });
    if (an.events.length < 4) throw new Error('Bu dosyada ayırt edilebilir ses bulunamadı.');
    await Classify.classify(chs, buffer.sampleRate, an.events, (p) => busy('Şarkı hazırlanıyor', 0.55 + 0.42 * p, 'Davullar ve uzun sesler bulunuyor…'));
    for (const e of an.events) { e.kind = Classify.kindOf(e); e.sub = Classify.drumSub(e); }
    const beats = Beats.track(an.env, an.hopSec, an.bpm, an.envOff, buffer.duration);
    song = { buffer, name, events: an.events, beats, taps: buildTaps(an.events, beats, buffer.duration), duration: buffer.duration };
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
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    onTap(e.clientX, e.clientY, e.pointerId);
  }, { passive: false });
  cv.addEventListener('pointermove', (e) => { if (hold) moveHold(e.clientX, e.clientY, e.pointerId); });
  const up = (e) => { if (hold && ctx) releaseHold(e.pointerId); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Escape') { if (paused) resume(); else pause(); return; }
    if (state === 'play' && !paused && e.key.length === 1) { e.preventDefault(); onTap(CX + (rnd() - 0.5) * W * 0.6, CY + (rnd() - 0.5) * H * 0.5, 'key:' + e.key); }
  });
  window.addEventListener('keyup', (e) => { if (hold && ctx) releaseHold('key:' + e.key); });
  $('#pick').addEventListener('click', () => { ensureCtx(); $('#file').click(); });
  $('#file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) loadFile(f); });
  $('#demo').addEventListener('click', loadDemo);
  $('#menuBtn').addEventListener('click', pause);
  $('#resume').addEventListener('click', resume);
  $('#restart').addEventListener('click', () => { if (ctx) ctx.resume(); startPlay(); });
  $('#newSong').addEventListener('click', () => { if (ctx) ctx.resume(); stopVoice(0.02); paused = false; state = 'home'; show('home'); });
  $('#again').addEventListener('click', () => { if (song) { song.taps = buildTaps(song.events, song.beats, song.duration); startPlay(); } });
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
    tap: onTap, release: (pid) => releaseHold(pid), move: (x, y, pid) => moveHold(x, y, pid), get hold() { return hold; }, demo: loadDemo, clockPos: () => clockPos(ctx.currentTime), hitCtx: () => hitCtx(),
    voicePos: () => voicePos(ctx.currentTime)
  };
})();

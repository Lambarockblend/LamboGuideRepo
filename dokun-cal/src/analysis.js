/* Analiz motoru: PCM -> vuruş olayları (zaman, halka/bant, güç), tempo, periyot */
(function (root) {
  'use strict';
  const N = 1024, HOP = 512;
  const EDGES = [0, 120, 300, 700, 1600, 4000, Infinity];
  const NB = 6;
  const FLOORK = 0.3;
  const cfg = { TIME_BIAS: 0, MAX_PER_SEC: 5.5, MIN_GAP: 0.11 };

  function makeFFT(n) {
    const bits = Math.log2(n) | 0;
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      rev[i] = r;
    }
    const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    return function (re, im) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const a = i + j, b = a + half;
            const xr = re[b] * cos[k] - im[b] * sin[k];
            const xi = re[b] * sin[k] + im[b] * cos[k];
            re[b] = re[a] - xr; im[b] = im[a] - xi;
            re[a] += xr; im[a] += xi;
          }
        }
      }
    };
  }

  function toMono(channels, sr) {
    const factor = Math.max(1, Math.round(sr / 22050));
    const len = channels[0].length;
    const n = Math.floor(len / factor);
    const out = new Float32Array(n);
    const nch = channels.length;
    for (let i = 0; i < n; i++) {
      let s = 0;
      const base = i * factor;
      for (let c = 0; c < nch; c++) {
        const ch = channels[c];
        for (let f = 0; f < factor; f++) s += ch[base + f];
      }
      out[i] = s / (factor * nch);
    }
    return { mono: out, sr2: sr / factor };
  }

  function p95of(x) { const a = Float32Array.from(x).sort(); return a.length ? a[Math.floor(0.95 * (a.length - 1))] : 0; }

  function pickPeaks(x, hopSec, kLm, kP, floor) {
    const n = x.length;
    if (n < 8) return [];
    const W = Math.max(4, Math.round(0.4 / hopSec));
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
    const sorted = Float32Array.from(x).sort();
    const p90 = sorted[Math.floor(0.9 * (n - 1))];
    const p95 = sorted[Math.floor(0.95 * (n - 1))];
    if (p95 < 1e-3) return [];
    const peaks = [];
    const R = 2;
    for (let t = R; t < n - R; t++) {
      const v = x[t];
      let isMax = true;
      for (let j = -R; j <= R; j++) {
        if (j === 0) continue;
        const o = x[t + j];
        if (j < 0 ? o >= v : o > v) { isMax = false; break; }
      }
      if (!isMax) continue;
      const a = Math.max(0, t - W), b = Math.min(n, t + W + 1);
      const lm = (pre[b] - pre[a]) / (b - a);
      if (v > lm * kLm + kP * p90 && v - lm > floor) peaks.push({ f: t, s: Math.min(2, (v - lm) / (p95 + 1e-9)) });
    }
    return peaks;
  }

  function estimateTempo(env, hopSec) {
    const n = env.length;
    const e = new Float32Array(n);
    const W = Math.round(1 / hopSec);
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + env[i];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - W), b = Math.min(n, i + W + 1);
      e[i] = Math.max(0, env[i] - (pre[b] - pre[a]) / (b - a));
    }
    const score = (bpm) => {
      const lag = 60 / bpm / hopSec;
      let s = 0, c = 0;
      for (let t = 0; t + Math.ceil(lag) + 1 < n; t++) {
        const p = t + lag, i = Math.floor(p), fr = p - i;
        s += e[t] * (e[i] * (1 - fr) + e[i + 1] * fr);
        c++;
      }
      return c ? s / c : 0;
    };
    let best = -1, bestBpm = 120;
    for (let bpm = 70; bpm <= 190; bpm += 0.5) {
      const s = score(bpm) * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.7, 2));
      if (s > best) { best = s; bestBpm = bpm; }
    }
    // ince ayar: 1-2-3-4 vuruş katlarının toplamıyla
    const fine = (bpm) => score(bpm) + score(bpm / 2) * 0.5 + score(bpm * 2) * 0.5;
    let fb = -1, fbpm = bestBpm;
    for (let bpm = bestBpm - 2.5; bpm <= bestBpm + 2.5; bpm += 0.05) {
      const s = fine(bpm);
      if (s > fb) { fb = s; fbpm = bpm; }
    }
    return fbpm;
  }


  function rankEvents(events) {
    // şarkıya eşit dağılsın diye 2.5 sn'lik pencerelerde sıralanır: her pencerenin en iyisi ilk açılır
    const n = events.length;
    const sc = events.map((e) => e.strength * (1 + 0.5 * (e.bands[0] <= 1 ? 1 : 0)));
    const maxSc = Math.max(1e-9, ...sc);
    const bins = new Map();
    events.forEach((e, i) => {
      const k = Math.floor(e.t / 2.5);
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(i);
    });
    const key = new Array(n).fill(0);
    bins.forEach((idxs, k) => {
      idxs.sort((a, b) => sc[b] - sc[a]);
      idxs.forEach((i, r) => { key[i] = r / idxs.length + 0.0004 * k + 0.0001 * (1 - sc[i] / maxSc); });
    });
    events.map((e, i) => i).sort((a, b) => key[a] - key[b])
      .forEach((i, r) => { events[i].pct = n > 1 ? r / (n - 1) : 0; });

  }

  const tick = () => new Promise((r) => setTimeout(r, 0));

  // ---- Superflux tabanlı vuruş bulucu (yankılı / sürekli ses için) ----
  async function superfluxEvents(mono, sr2, onProgress, opts) {
    const NX = 2048, HX = 441, MU = 2;
    const hopSec = HX / sr2;
    const nF = Math.max(0, Math.floor((mono.length - NX) / HX) + 1);
    const fft = makeFFT(NX);
    const win = new Float32Array(NX);
    for (let i = 0; i < NX; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (NX - 1));
    const binHz = sr2 / NX, K = NX / 2 + 1;
    const bands = [];
    let b0 = Math.max(2, Math.round(40 / binHz));
    const maxHz = Math.min(6000, sr2 / 2 * 0.9);
    for (;;) {
      const next = Math.max(b0 + 1, Math.round((b0 * binHz * Math.pow(2, 1 / 6)) / binHz));
      if (next * binHz > maxHz) break;
      bands.push([b0, next]); b0 = next;
    }
    const nB = bands.length;
    const grp = bands.map(([k0, k1]) => { const hz = ((k0 + k1) / 2) * binHz; let g = 0; while (g < 5 && hz > EDGES[g + 1]) g++; return g; });
    const L = new Float32Array(nF * nB);
    const re = new Float32Array(NX), im = new Float32Array(NX);
    const norm = 4 / NX;
    for (let f = 0; f < nF; f++) {
      const off = f * HX;
      for (let i = 0; i < NX; i++) { re[i] = mono[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let b = 0; b < nB; b++) {
        const [k0, k1] = bands[b];
        let sum = 0;
        for (let k = k0; k < k1; k++) sum += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        L[f * nB + b] = Math.log1p((sum / (k1 - k0)) * norm * 300);
      }
      if (onProgress && (f & 511) === 511) { onProgress(0.6 * f / nF); await tick(); }
    }
    // superflux: önceki (MU kare) çerçevenin frekans-maksimumuna göre artış
    const sf = new Float32Array(nF), gsf = [];
    for (let g = 0; g < NB; g++) gsf.push(new Float32Array(nF));
    for (let f = MU; f < nF; f++) {
      let tot = 0;
      for (let b = 0; b < nB; b++) {
        const pb = (f - MU) * nB;
        const ref = Math.max(L[pb + b], b > 0 ? L[pb + b - 1] : 0, b < nB - 1 ? L[pb + b + 1] : 0);
        const d = L[f * nB + b] - ref;
        if (d > 0) { tot += d; gsf[grp[b]][f] += d; }
      }
      sf[f] = tot;
    }
    // tepe seçimi
    const W = Math.round(0.5 / hopSec), R = 3;
    const pre = new Float64Array(nF + 1);
    for (let i = 0; i < nF; i++) pre[i + 1] = pre[i] + sf[i];
    const sorted = Float32Array.from(sf).sort();
    const p90 = sorted[Math.floor(0.9 * (nF - 1))] || 0, p95 = sorted[Math.floor(0.95 * (nF - 1))] || 1e-9;
    const kLm = (opts && opts.kLm) || 1.25, kP = (opts && opts.kP) != null ? opts.kP : 0.1, fl = (opts && opts.floorK) != null ? opts.floorK : 0.2;
    const evs = [];
    for (let t = R; t < nF - R; t++) {
      const v = sf[t];
      let isMax = true;
      for (let j = -R; j <= R; j++) { if (!j) continue; const o = sf[t + j]; if (j < 0 ? o >= v : o > v) { isMax = false; break; } }
      if (!isMax) continue;
      const a = Math.max(0, t - W), b2 = Math.min(nF, t + W + 1), lm = (pre[b2] - pre[a]) / (b2 - a);
      if (!(v > lm * kLm + kP * p90 && v - lm > fl * p95 * 0.5)) continue;
      // hangi frekans grupları yükseldi
      const gv = []; let gmax = 0, main = 0;
      for (let g = 0; g < NB; g++) { let m = 0; for (let j = -1; j <= 1; j++) m = Math.max(m, gsf[g][t + j]); gv.push(m); if (m > gmax) { gmax = m; main = g; } }
      const bandsHit = []; for (let g = 0; g < NB; g++) if (gv[g] >= 0.35 * gmax && gmax > 0) bandsHit.push(g);
      evs.push({ f: t, t: 0, bands: bandsHit.length ? bandsHit : [main], main, strength: Math.min(2, (v - lm) / (p95 + 1e-9)) });
    }
    // zaman düzeltme: ince çözünürlüklü zarf ile atak anına yaklaştır
    const NF2 = 512, HF = 128;
    const fft2 = makeFFT(NF2), w2 = new Float32Array(NF2);
    for (let i = 0; i < NF2; i++) w2[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (NF2 - 1));
    const r2 = new Float32Array(NF2), i2 = new Float32Array(NF2);
    const k0f = Math.round(150 / (sr2 / NF2));
    const prevM = new Float32Array(NF2 / 2 + 1);
    const fineFor = (tc) => {
      // tc: kaba tepe zamanı (çerçeve merkezi). [tc-0.09, tc+0.02] içinde ince akı maksimumu
      const s0 = Math.max(0, Math.round((tc - 0.09) * sr2)), s1 = Math.min(mono.length - NF2, Math.round((tc + 0.02) * sr2));
      let best = tc, bv = -1; prevM.fill(0);
      for (let s = s0 - HF; s <= s1; s += HF) {
        if (s < 0) continue;
        for (let i = 0; i < NF2; i++) { r2[i] = mono[s + i] * w2[i]; i2[i] = 0; }
        fft2(r2, i2);
        let fl2 = 0;
        for (let k = k0f; k < NF2 / 2; k++) { const m = Math.log1p(Math.sqrt(r2[k] * r2[k] + i2[k] * i2[k]) * (4 / NF2) * 300); const d = m - prevM[k]; if (d > 0) fl2 += d; prevM[k] = m; }
        if (s >= s0 && fl2 > bv) { bv = fl2; best = (s + NF2 * 0.25) / sr2; }
      }
      return best;
    };
    for (const e of evs) {
      const tc = (e.f * HX + NX / 2) / sr2;
      e.t = fineFor(tc) + cfg.TIME_BIAS;
    }
    evs.sort((a, b) => a.t - b.t);
    if (onProgress) onProgress(0.9);
    return { events: evs, env: sf, hopSec };
  }


  async function analyze(channels, sr, onProgress, opts) {
    const play = !!(opts && opts.play);
    const kLm = play ? ((opts && opts.kLm) || 1.3) : 1.5, kP = play ? 0.18 : 0.3;
    const minGap = play ? 0.05 : cfg.MIN_GAP, perSec = play ? 14 : cfg.MAX_PER_SEC;
    const clGap = play ? 0.035 : 0.06, clSpan = play ? 0.05 : 0.09;
    const dur = channels[0].length / sr;
    const { mono, sr2 } = toMono(channels, sr);
    if (play) {
      const sfr = await superfluxEvents(mono, sr2, onProgress, opts);
      let events = sfr.events.filter((e) => e.t > 0.2 && e.t < dur - 0.2);
      // minimum aralık
      const spaced = [];
      for (const e of events) {
        const last = spaced[spaced.length - 1];
        if (last && e.t - last.t < minGap) { if (e.strength > last.strength) spaced[spaced.length - 1] = e; }
        else spaced.push(e);
      }
      events = spaced;
      const cap = Math.floor(dur * perSec);
      if (events.length > cap) events = events.slice().sort((a, b) => b.strength - a.strength).slice(0, cap).sort((a, b) => a.t - b.t);
      const bpm = estimateTempo(sfr.env, sfr.hopSec);
      let period = (60 / bpm) * 4; while (period < 1.6) period *= 2; while (period > 3.4) period /= 2;
      rankEvents(events);
      if (onProgress) onProgress(1);
      return { events, period, bpm, duration: dur };
    }
    const hopSec = HOP / sr2;
    const nF = Math.max(0, Math.floor((mono.length - N) / HOP) + 1);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const fft = makeFFT(N);
    const re = new Float32Array(N), im = new Float32Array(N);
    const K = N / 2 + 1;
    const prev = new Float32Array(K), cur = new Float32Array(K);
    const binHz = sr2 / N;
    const range = [];
    for (let b = 0; b < NB; b++) {
      const k0 = Math.max(1, Math.ceil(EDGES[b] / binHz));
      let k1 = Math.min(K, Math.ceil(EDGES[b + 1] / binHz));
      if (k1 <= k0) k1 = Math.min(K, k0 + 1);
      range.push([k0, k1]);
    }
    const flux = [];
    for (let b = 0; b < NB; b++) flux.push(new Float32Array(nF));
    const env = new Float32Array(nF);
    const norm = 4 / N;
    for (let f = 0; f < nF; f++) {
      const off = f * HOP;
      for (let i = 0; i < N; i++) { re[i] = mono[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 1; k < K; k++) cur[k] = Math.log1p(Math.sqrt(re[k] * re[k] + im[k] * im[k]) * norm * 200);
      let tot = 0;
      for (let b = 0; b < NB; b++) {
        const [k0, k1] = range[b];
        let s = 0;
        for (let k = k0; k < k1; k++) { const d = cur[k] - prev[k]; if (d > 0) s += d; }
        s /= Math.sqrt(k1 - k0);
        flux[b][f] = s;
        tot += s;
      }
      env[f] = tot;
      prev.set(cur);
      if (onProgress && (f & 255) === 255) { onProgress(f / nF); await tick(); }
    }

    // bant başına tepe noktaları
    const raw = [];
    const gmax = Math.max(...flux.map(p95of));
    const floorK = play ? ((opts && opts.floorK) != null ? opts.floorK : FLOORK) : 0;
    for (let b = 0; b < NB; b++) {
      const pk = pickPeaks(flux[b], hopSec, kLm, kP, floorK * gmax);
      for (const p of pk) raw.push({ t: (p.f * HOP + N / 2) / sr2 + cfg.TIME_BIAS, b, s: p.s });
    }
    raw.sort((a, b) => a.t - b.t);

    // kümeleme: yakın bant tepeleri tek olay (akor)
    let events = [];
    let cl = null;
    const flush = () => {
      if (!cl) return;
      let mx = 0, best = cl[0];
      for (const p of cl) if (p.s > mx) { mx = p.s; best = p; }
      const bands = [];
      for (const p of cl) if (p.s >= 0.35 * mx && bands.indexOf(p.b) < 0) bands.push(p.b);
      bands.sort((a, b) => a - b);
      events.push({ t: best.t, bands, main: best.b, strength: mx + 0.15 * (bands.length - 1) });
      cl = null;
    };
    for (const p of raw) {
      if (cl && (p.t - cl[cl.length - 1].t > clGap || p.t - cl[0].t > clSpan)) flush();
      if (!cl) cl = [];
      cl.push(p);
    }
    flush();

    // minimum aralık
    const spaced = [];
    for (const e of events) {
      const last = spaced[spaced.length - 1];
      if (last && e.t - last.t < minGap) {
        const keep = e.strength > last.strength ? e : last;
        const bands = Array.from(new Set(last.bands.concat(e.bands))).sort((a, b) => a - b);
        spaced[spaced.length - 1] = { t: keep.t, bands, main: keep.main, strength: keep.strength };
      } else spaced.push(e);
    }
    events = spaced;

    // yoğunluk sınırı
    const cap = Math.floor(dur * perSec);
    if (events.length > cap) {
      const ord = events.slice().sort((a, b) => b.strength - a.strength).slice(0, cap);
      events = ord.sort((a, b) => a.t - b.t);
    }
    events = events.filter((e) => e.t > 0.3 && e.t < dur - 0.2);

    // tempo / periyot
    const bpm = estimateTempo(env, hopSec);
    let period = (60 / bpm) * 4;
    while (period < 1.6) period *= 2;
    while (period > 3.4) period /= 2;

    // önem sırası (yüzdelik): güçlü ve bas içeren olaylar önce açılır
    rankEvents(events);

    if (onProgress) onProgress(1);
    return { events, period, bpm, duration: dur };
  }

  const api = { analyze, config: cfg, NB, EDGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Analysis = api;
})(typeof window !== 'undefined' ? window : globalThis);

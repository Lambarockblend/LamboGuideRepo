/* Groove (ritim deseni) çıkarıcı.
 * Ses dört banda ayrılır: bas davul (30–150 Hz), melodi/vokal (150–2000 Hz),
 * trampet çıtırtısı (2–6 kHz), zil (6 kHz üstü). Her bandın "ani artış" eğrisi çıkarılır.
 * Vuruş ızgarasının her 16'lık noktasında her bandın vuruş gücü ölçülür.
 * Şarkılar ölçü ölçü aynı deseni tekrar eder; bu yüzden her ölçüdeki 16 noktanın
 * yakın ölçülerdeki ortalaması (desen şablonu) da hesaplanır. Dokunuşlar, hem o an gerçekten
 * vurgulu olan hem de desende sürekli vurgulanan noktalara konur: kulağın hissettiği ritim.
 */
(function (root) {
  'use strict';
  const N = 1024, HOP = 256;
  function fftFactory(n) {
    const bits = Math.log2(n) | 0, rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
    const cs = new Float32Array(n / 2), sn = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos((2 * Math.PI * i) / n); sn[i] = -Math.sin((2 * Math.PI * i) / n); }
    return (re, im) => {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half, xr = re[b] * cs[k] - im[b] * sn[k], xi = re[b] * sn[k] + im[b] * cs[k];
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const BANDS = [[30, 150], [150, 2000], [2000, 6000], [6000, 11000]];   // bas, melodi, trampet, zil

  // dört bandın ani artış (flux) eğrisi
  async function bandFlux(channels, sr, onProgress) {
    const f = Math.max(1, Math.round(sr / 22050)), len = Math.floor(channels[0].length / f), sr2 = sr / f, nch = channels.length;
    const x = new Float32Array(len);
    for (let i = 0; i < len; i++) { let s = 0; for (let c = 0; c < nch; c++) for (let q = 0; q < f; q++) s += channels[c][i * f + q]; x[i] = s / (f * nch); }
    const nF = Math.max(1, Math.floor((len - N) / HOP) + 1), binHz = sr2 / N;
    const rng = BANDS.map(([a, b]) => [Math.max(1, Math.round(a / binHz)), Math.min(N / 2, Math.round(b / binHz))]);
    const fft = fftFactory(N), win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const re = new Float32Array(N), im = new Float32Array(N), prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
    const flux = BANDS.map(() => new Float32Array(nF));
    for (let fr = 0; fr < nF; fr++) {
      const off = fr * HOP;
      for (let i = 0; i < N; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 1; k < N / 2; k++) cur[k] = Math.log1p(Math.sqrt(re[k] * re[k] + im[k] * im[k]) * 50);
      for (let b = 0; b < BANDS.length; b++) {
        const [k0, k1] = rng[b]; let s = 0;
        for (let k = k0; k < k1; k++) { const d = cur[k] - prev[k]; if (d > 0) s += d; }
        flux[b][fr] = s / Math.sqrt(k1 - k0);
      }
      prev.set(cur);
      if (onProgress && (fr & 2047) === 2047) { onProgress(fr / nF); await tick(); }
    }
    return { flux, fps: sr2 / HOP, off: (N / 2) / sr2, nF };
  }

  // classify'ın vurmalı / harmonik ayrıştırmasından bant ani artışları (808 tonu ve vokal dışarıda kalır)
  function fromFrames(fr) {
    const { bands, fps, off, nF } = fr;
    const flux = bands.map((E) => {
      const out = new Float32Array(nF);
      for (let i = 2; i < nF; i++) {
        const cur = Math.log1p(E[i] * 1e4), ref = Math.log1p(Math.max(E[i - 1], E[i - 2]) * 1e4);
        out[i] = Math.max(0, cur - ref);
      }
      return out;
    });
    return { flux, fps, off, nF };
  }

  // her 16'lık noktada bant vuruş güçleri + desen şablonu
  function slots(bf, beats, duration) {
    const { flux, fps, off, nF } = bf, NB = flux.length;
    const frameOf = (t) => Math.round((t - off) * fps);
    // her bant için yerel taban (±1 sn medyan yerine hızlı yaklaşık: kayan ortalama) ve ölçek
    const norm = flux.map((fl) => {
      const n = fl.length, W = Math.round(fps), pre = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + fl[i];
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const a = Math.max(0, i - W), b = Math.min(n, i + W + 1); out[i] = Math.max(0, fl[i] - (pre[b] - pre[a]) / (b - a)); }
      const srt = Float32Array.from(out).sort(), p97 = srt[Math.floor(0.97 * (n - 1))] || 1;
      for (let i = 0; i < n; i++) out[i] = Math.min(1.5, out[i] / p97);
      return out;
    });
    const per = beats.length > 1 ? beats[1] - beats[0] : 0.5;
    const win = Math.max(2, Math.round(0.03 * fps));
    const list = [];
    for (let i = 0; i < beats.length - 1; i++) {
      const p = beats[i + 1] - beats[i];
      for (let s = 0; s < 4; s++) {
        const t = beats[i] + (s * p) / 4;
        if (t < 0 || t > duration) continue;
        const f0 = frameOf(t), v = new Float32Array(NB);
        let peakF = f0, peakV = -1;
        for (let q = f0 - win; q <= f0 + win; q++) {
          if (q < 0 || q >= nF) continue;
          let tot = 0;
          for (let b = 0; b < NB; b++) { v[b] = Math.max(v[b], norm[b][q]); tot += norm[b][q]; }
          if (tot > peakV) { peakV = tot; peakF = q; }
        }
        list.push({ t, beat: i, sub: s, v, at: peakF / fps + off });
      }
    }
    // toplam vurgu: bas ve trampet ritmin omurgası, zil hafif, melodi orta
    const W8 = NB === 5 ? [1.0, 0.6, 0.8, 0.3, 0.45] : [1.0, 0.55, 1.0, 0.35];
    for (const sl of list) { let a = 0; for (let b = 0; b < NB; b++) a += W8[b] * sl.v[b]; sl.acc = a; }
    // desen şablonu: ölçüdeki konumuna göre (16 nokta), ±4 ölçülük pencerede ortalama
    const pos = (sl) => ((sl.beat % 4) + 4) % 4 * 4 + sl.sub;
    const barOf = (sl) => Math.floor(sl.beat / 4);
    const byBar = new Map();
    for (const sl of list) { const b = barOf(sl); if (!byBar.has(b)) byBar.set(b, new Float32Array(16)); byBar.get(b)[pos(sl)] = sl.acc; }
    for (const sl of list) {
      const b = barOf(sl), p = pos(sl); let s = 0, c = 0;
      for (let d = -4; d <= 4; d++) { const row = byBar.get(b + d); if (row) { s += row[p] * (d === 0 ? 0.5 : 1); c += d === 0 ? 0.5 : 1; } }
      sl.tmpl = c ? s / c : 0;
      sl.pos = p; sl.bar = b;
    }
    return { list, per };
  }


  // Dokunuş haritası: her ölçüde, seviyesine göre en vurgulu N nokta.
  // Seviye 0: ölçüde 2, 1: 4, 2: 6, 3: 10 dokunuş (yalnızca gerçekten ses olan yerlerde).
  const COUNTS = [2, 4, 6, 10];
  function chart(list, events, levelAt) {
    const bars = new Map();
    for (const sl of list) { if (!bars.has(sl.bar)) bars.set(sl.bar, []); bars.get(sl.bar).push(sl); }
    const keys = [...bars.keys()].sort((a, b) => a - b);
    const picks = [];
    let lastT = -9;
    const evNear = (t, tol) => { let best = null, bd = tol; for (const e of events) { const d = Math.abs(e.t - t); if (d < bd) { bd = d; best = e; } if (e.t > t + tol) break; } return best; };
    for (const b of keys) {
      const sl = bars.get(b).slice().sort((x, y) => x.pos - y.pos);
      const lvl = levelAt(sl[0].t), Nn = COUNTS[lvl];
      const mx = Math.max(...sl.map((x) => x.acc)), tmx = Math.max(...sl.map((x) => x.tmpl));
      if (mx < 0.15) continue;                                   // sessiz ölçü
      const minGap = Nn <= 6 ? 2 : 1;                            // 16'lık cinsinden en az aralık
      const cand = sl.filter((x) => x.acc >= Math.max(0.15, 0.3 * mx)).map((x) => ({
        x, score: 0.55 * x.acc / mx + 0.45 * (tmx > 0 ? x.tmpl / tmx : 0) + (x.sub === 0 ? 0.08 : x.sub === 2 ? 0.04 : 0)
      })).sort((a, c) => c.score - a.score);
      const chosen = [];
      for (const c of cand) {
        if (chosen.length >= Nn) break;
        if (chosen.some((o) => Math.abs(o.pos - c.x.pos) < minGap)) continue;
        chosen.push(c.x);
      }
      chosen.sort((a, c) => a.pos - c.pos);
      for (const x of chosen) {
        const e = evNear(x.at, 0.035), t = e ? e.t : x.at;
        if (t - lastT < 0.09) continue;
        lastT = t;
        const v = x.v, kick = v[0], snare = Math.max(v[1] || 0, v[2] || 0), hat = (v[3] || 0) * 0.7, mel = (v[4] || 0) * 0.8;
        let kind = 'drum', sub = kick >= snare && kick >= hat ? 'kick' : 'snare';
        if (mel > Math.max(kick, snare, hat) * 1.2) kind = 'note';
        if (e && e.kind === 'hold') kind = 'hold';
        picks.push({ t, kind, sub, s: Math.min(1, Math.max(0.25, x.acc / mx)), sus: e ? e.sustain || 0 : 0, lvl, pos: x.pos, bar: b });
      }
    }
    // uzayan sesler: önü boşsa basılı tutma noktası olarak ekle (vurmalı seçim bunları kaçırır)
    for (const e of events) {
      if (e.kind !== 'hold') continue;
      const span = Math.min(e.sustain || 0, 0.8);
      if (picks.some((p) => p.t > e.t - 0.15 && p.t < e.t + span)) continue;
      picks.push({ t: e.t, kind: 'hold', sub: 'snare', s: 0.7, sus: e.sustain || 0, lvl: levelAt(e.t), pos: -1, bar: -1 });
    }
    picks.sort((x, y) => x.t - y.t);
    return picks;
  }

  const api = { bandFlux, fromFrames, slots, chart, COUNTS, BANDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Groove = api;
})(typeof window !== 'undefined' ? window : globalThis);

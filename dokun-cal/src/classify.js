/* Ses türü ayırıcı: her vuruşun davul mu, uzayan ses mi, normal nota mı olduğunu bulur.
 * Yöntem: harmonik / vurmalı ayrıştırma (HPSS, medyan süzgeç).
 *  - Spektrogramda zaman boyunca düz uzanan çizgiler = harmonik (melodi, akor, uzayan ses)
 *  - Frekans boyunca dikey uzanan çizgiler = vurmalı (davul, el çırpma, zil)
 * Her olay için: başlangıç anındaki vurmalı payı, sonrasında harmonik enerjinin ne kadar sürdüğü.
 */
(function (root) {
  'use strict';
  const N = 1024, HOP = 512;

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
  // küçük dizilerde medyan (yerinde sıralama, uzunluk ≤ 17)
  function med(buf, n) {
    for (let i = 1; i < n; i++) { const v = buf[i]; let j = i - 1; while (j >= 0 && buf[j] > v) { buf[j + 1] = buf[j]; j--; } buf[j + 1] = v; }
    return buf[n >> 1];
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  async function classify(channels, sr, events, onProgress) {
    // mono, ~22 kHz
    const f = Math.max(1, Math.round(sr / 22050)), len = Math.floor(channels[0].length / f), sr2 = sr / f;
    const x = new Float32Array(len), nch = channels.length;
    for (let i = 0; i < len; i++) { let s = 0; for (let c = 0; c < nch; c++) for (let q = 0; q < f; q++) s += channels[c][i * f + q]; x[i] = s / (f * nch); }
    const K = 256;                       // ilk 256 kutu (≈ 0–5.5 kHz) + üst bant tek kutuda toplanır
    const nF = Math.max(1, Math.floor((len - N) / HOP) + 1);
    const S = new Float32Array(nF * (K + 1));
    const fft = fftFactory(N), win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let fr = 0; fr < nF; fr++) {
      const off = fr * HOP;
      for (let i = 0; i < N; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      const row = fr * (K + 1);
      for (let k = 0; k < K; k++) S[row + k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      let hi = 0; for (let k = K; k < N / 2; k++) hi += re[k] * re[k] + im[k] * im[k];
      S[row + K] = Math.sqrt(hi / (N / 2 - K)) * 4;
      if (onProgress && (fr & 1023) === 1023) { onProgress(0.4 * fr / nF); await tick(); }
    }
    // HPSS: zaman yönünde medyan = harmonik, frekans yönünde medyan = vurmalı
    const LT = 17, LF = 17, ht = LT >> 1, hf = LF >> 1, buf = new Float32Array(32);
    const Hf = new Float32Array(nF), Pf = new Float32Array(nF), Lo = new Float32Array(nF), Hi = new Float32Array(nF);
    const PMid = new Float32Array(nF), PHi = new Float32Array(nF), HMel = new Float32Array(nF);
    const midK = Math.round(2000 / (sr2 / N));
    const loK = Math.round(150 / (sr2 / N));
    for (let fr = 0; fr < nF; fr++) {
      const row = fr * (K + 1);
      let he = 0, pe = 0, lo = 0, pm = 0, ph = 0, hm = 0;
      for (let k = 1; k < K; k++) {
        let n = 0;
        for (let d = -ht; d <= ht; d++) { const q = fr + d; if (q >= 0 && q < nF) buf[n++] = S[q * (K + 1) + k]; }
        const h = med(buf, n);
        n = 0;
        for (let d = -hf; d <= hf; d++) { const q = k + d; if (q >= 1 && q < K) buf[n++] = S[row + q]; }
        const p = med(buf, n);
        const v = S[row + k], v2 = v * v;
        // yumuşak maske (Wiener)
        const mh = h * h / (h * h + p * p + 1e-12);
        he += v2 * mh; pe += v2 * (1 - mh);
        if (k <= loK) lo += v2 * (1 - mh);
        else if (k <= midK) { pm += v2 * (1 - mh); hm += v2 * mh; }
        else ph += v2 * (1 - mh);
      }
      Hf[fr] = he; Pf[fr] = pe; Lo[fr] = lo; Hi[fr] = S[row + K] * S[row + K];
      PMid[fr] = pm; PHi[fr] = ph; HMel[fr] = hm;
      if (onProgress && (fr & 511) === 511) { onProgress(0.4 + 0.55 * fr / nF); await tick(); }
    }
    const fps = sr2 / HOP, at = (t) => Math.max(0, Math.min(nF - 1, Math.round(t * fps - 0.5 * N / HOP)));
    const sumR = (A, a, b) => { let s = 0; for (let i = Math.max(0, a); i <= Math.min(nF - 1, b); i++) s += A[i]; return s; };
    const maxR = (A, a, b) => { let s = 0; for (let i = Math.max(0, a); i <= Math.min(nF - 1, b); i++) s = Math.max(s, A[i]); return s; };
    // şarkı geneli ölçekler
    const sortedHi = Float32Array.from(Hi).sort(), hiRef = sortedHi[Math.floor(0.9 * (nF - 1))] + 1e-12;
    const sortedLo = Float32Array.from(Lo).sort(), loRef = sortedLo[Math.floor(0.9 * (nF - 1))] + 1e-12;

    for (let i = 0; i < events.length; i++) {
      const e = events[i], f0 = at(e.t);
      // başlangıç anı: vurmalı artışı / harmonik artışı
      const pPre = sumR(Pf, f0 - 4, f0 - 2) / 3, hPre = sumR(Hf, f0 - 4, f0 - 2) / 3;
      const pOn = maxR(Pf, f0 - 1, f0 + 2), hOn = maxR(Hf, f0 - 1, f0 + 2);
      const dP = Math.max(0, pOn - pPre), dH = Math.max(0, hOn - hPre);
      e.perc = dP / (dP + dH + 1e-12);
      e.kick = Math.max(0, maxR(Lo, f0 - 1, f0 + 2) - sumR(Lo, f0 - 4, f0 - 2) / 3) / loRef;
      e.hat = Math.max(0, maxR(Hi, f0 - 1, f0 + 2) - sumR(Hi, f0 - 4, f0 - 2) / 3) / hiRef;
      // uzama: sonraki olaya kadar harmonik enerji ne kadar ayakta kalıyor
      const next = i + 1 < events.length ? events[i + 1].t : e.t + 3;
      const gap = next - e.t;
      const ref = maxR(Hf, f0, f0 + 4) + 1e-12;
      let sus = 0;
      const fEnd = at(Math.min(next, e.t + 4));
      for (let q = f0 + 4; q <= fEnd; q++) { if (Hf[q] < ref * 0.3) break; sus = (q - f0) / fps; }
      e.gap = gap; e.sustain = sus;
    }
    if (onProgress) onProgress(1);
    // ritim deseni için: vurmalı bantlar (bas davul, trampet gövdesi, trampet çıtırtısı, zil) + melodi
    events.frames = { bands: [Lo, PMid, PHi, Hi, HMel], fps, off: (N / 2) / sr2, nF };
    return events;
  }

  // olay türü: 'drum' | 'hold' | 'note'
  function kindOf(e) {
    if (e.gap >= 0.6 && e.sustain >= 0.45 && e.perc < 0.6 && e.kick < 2.5) return 'hold';
    // tonlu bas davul (808) harmonik görünür; alçak banttaki ani artışla yakalanır
    if (e.perc >= 0.62 || e.kick >= 2.5 || e.hat >= 1.0) return 'drum';
    return 'note';
  }
  // davulun rengi: bas davul mu, trampet / zil mi
  const drumSub = (e) => (e.kick >= 1.5 && e.kick >= e.hat * 2 ? 'kick' : 'snare');

  const api = { classify, kindOf, drumSub };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Classify = api;
})(typeof window !== 'undefined' ? window : globalThis);

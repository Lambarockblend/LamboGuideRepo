/* Vuruş ızgarası: şarkının her vuruşunun (dörtlük) tam zamanı.
 * Ellis'in dinamik programlama yöntemi: vuruşlar hem ses başlangıçlarına denk gelmeli
 * hem de tempoya (bir vuruşluk aralığa) mümkün olduğunca sadık kalmalı.
 */
(function (root) {
  'use strict';
  function track(env, hopSec, bpm, off, duration) {
    const n = env.length;
    if (n < 8) return [];
    let mean = 0; for (let i = 0; i < n; i++) mean += env[i]; mean /= n;
    let sd = 0; for (let i = 0; i < n; i++) sd += (env[i] - mean) * (env[i] - mean); sd = Math.sqrt(sd / n) || 1;
    const e = new Float32Array(n);
    for (let i = 0; i < n; i++) e[i] = Math.max(0, (env[i] - mean) / sd);
    const P = 60 / bpm / hopSec;
    const score = new Float32Array(n), back = new Int32Array(n).fill(-1);
    const TIGHT = 100, lo = Math.round(P * 0.5), hi = Math.round(P * 2);
    for (let t = 0; t < n; t++) {
      let best = -Infinity, bi = -1;
      for (let p = t - hi; p <= t - lo; p++) {
        if (p < 0) continue;
        const l = Math.log((t - p) / P), v = score[p] - TIGHT * l * l;
        if (v > best) { best = v; bi = p; }
      }
      score[t] = e[t] + (bi >= 0 ? best : 0);
      back[t] = bi;
    }
    // son vuruş: son bir vuruşluk aralıkta en yüksek skor
    let end = n - 1, bv = -Infinity;
    for (let t = Math.max(0, n - Math.round(P)); t < n; t++) if (score[t] > bv) { bv = score[t]; end = t; }
    const fr = [];
    for (let t = end; t >= 0; t = back[t]) { fr.push(t); if (back[t] < 0) break; }
    fr.reverse();
    let beats = fr.map((f) => f * hopSec + off);
    // stüdyo kaydında tempo sabittir: vuruşları düz bir çizgiye oturt (titreşimi temizler)
    if (beats.length > 16) {
      const m = beats.length; let si = 0, st = 0, sii = 0, sit = 0;
      for (let i = 0; i < m; i++) { si += i; st += beats[i]; sii += i * i; sit += i * beats[i]; }
      const bb = (m * sit - si * st) / (m * sii - si * si), aa = (st - bb * si) / m;
      let res = 0; for (let i = 0; i < m; i++) res += Math.pow(beats[i] - (aa + bb * i), 2);
      res = Math.sqrt(res / m);
      if (res < 0.03) {
        // faz ince ayarı: ızgarayı ses başlangıçlarının en yoğun olduğu yere kaydır
        const at = (t) => { const i = Math.round((t - off) / hopSec); return i >= 0 && i < n ? e[i] : 0; };
        let bestO = 0, bestV = -1;
        for (let o = -0.04; o <= 0.04; o += 0.005) { let v = 0; for (let i = 0; i < m; i++) v += at(aa + bb * i + o); if (v > bestV) { bestV = v; bestO = o; } }
        beats = beats.map((_, i) => aa + bb * i + bestO);
        bpm = 60 / bb;
      }
    }
    // başı ve sonu tempoyla doldur (sessiz giriş / çıkış)
    const per = 60 / bpm;
    while (beats.length && beats[0] - per > -8 * per) beats.unshift(beats[0] - per);
    while (beats.length && beats[beats.length - 1] + per < duration) beats.push(beats[beats.length - 1] + per);
    return beats;
  }
  const api = { track };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Beats = api;
})(typeof window !== 'undefined' ? window : globalThis);

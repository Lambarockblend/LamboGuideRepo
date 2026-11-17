/* Örnek parça: dosyası olmayanlar için tarayıcıda üretilen 28 saniyelik kısa bir piyano + bas parçası */
(function (root) {
  'use strict';
  function make(sr) {
    const bpm = 96, beat = 60 / bpm, bars = 11, dur = bars * 4 * beat + 2;
    const n = Math.floor(dur * sr);
    const L = new Float32Array(n), R = new Float32Array(n);
    const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function note(t, m, len, vel, pan) {
      const s0 = Math.floor(t * sr), ln = Math.floor((len + 0.8) * sr), fr = f(m);
      const pl = 1 - Math.max(0, pan), pr = 1 + Math.min(0, pan);
      for (let i = 0; i < ln && s0 + i < n; i++) {
        const x = i / sr;
        const env = Math.min(1, x / 0.004) * Math.exp(-x * (2.2 + m / 40)) * (x > len ? Math.exp(-(x - len) * 9) : 1);
        const ph = 2 * Math.PI * fr * x;
        const v = (Math.sin(ph) + 0.45 * Math.sin(2 * ph) * Math.exp(-x * 3) + 0.2 * Math.sin(3 * ph) * Math.exp(-x * 5) + 0.08 * Math.sin(5 * ph) * Math.exp(-x * 8)) * env * vel;
        L[s0 + i] += v * pl; R[s0 + i] += v * pr;
      }
    }
    function kick(t, vel) {
      const s0 = Math.floor(t * sr), ln = Math.floor(0.35 * sr);
      let ph = 0;
      for (let i = 0; i < ln && s0 + i < n; i++) {
        const x = i / sr, fr = 48 + 110 * Math.exp(-x * 28);
        ph += 2 * Math.PI * fr / sr;
        const v = Math.sin(ph) * Math.exp(-x * 9) * vel;
        L[s0 + i] += v; R[s0 + i] += v;
      }
    }
    // akorlar: C G Am F
    const prog = [[48, 64, 67, 72], [43, 62, 67, 71], [45, 64, 69, 72], [41, 65, 69, 72]];
    const mel = [
      [0, 76, 1], [1, 74, .5], [1.5, 72, .5], [2, 74, 1], [3, 79, 1],
      [4, 79, .5], [4.5, 77, .5], [5, 76, 1], [6, 74, 1.5], [7.5, 71, .5],
      [8, 72, .5], [8.5, 74, .5], [9, 76, 1], [10, 81, .5], [10.5, 79, .5], [11, 76, 1],
      [12, 77, .75], [12.75, 76, .25], [13, 74, .5], [13.5, 72, .5], [14, 74, 2]
    ];
    const t0 = 1.0;
    for (let b = 0; b < bars; b++) {
      const ch = prog[b % 4], bt = t0 + b * 4 * beat;
      note(bt, ch[0] - 12 + 12, beat * 3.5, 0.32, 0);
      if (b > 0) for (let k = 0; k < 4; k++) kick(bt + k * beat, k === 0 ? 0.5 : 0.32);
      if (b < bars - 1) {
        // arpej (sekizlik)
        const arp = [ch[1], ch[2], ch[3], ch[2], ch[1], ch[2], ch[3], ch[2] + 12];
        if (b >= 1) arp.forEach((m, k) => { if (b < 3 && k % 2) return; note(bt + k * beat / 2, m - 12, beat * 0.45, 0.14, -0.4); });
      }
    }
    for (let rep = 0; rep < 2; rep++) {
      const off = t0 + (3 + rep * 4) * 4 * beat;
      mel.forEach(([b, m, l]) => note(off + b * beat, m, l * beat, 0.26, 0.35));
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const g = 0.85 / (peak || 1);
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return { channels: [L, R], sr };
  }
  root.DemoSong = { make };
})(typeof window !== 'undefined' ? window : globalThis);

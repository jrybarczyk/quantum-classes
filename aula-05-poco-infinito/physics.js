(function (root) {
  "use strict";
  // Unidades reduzidas: largura L (L = 1 por padrão), ħ = 1, E_n = n²/L² em unidades de E₁(L = 1),
  // tempo em ħ/E₁. Na estação de física médica, SI (energias em eV, comprimentos em nm).

  // ---------- autoestados ----------
  const boxWave = (x, n, length = 1) =>
    x < 0 || x > length ? 0 : Math.sqrt(2 / length) * Math.sin(n * Math.PI * x / length);
  const boxEnergy = (n, length = 1) => n * n / (length * length);
  const intervalProbability = (n, left, right, length = 1) => {
    const a = Math.max(0, Math.min(length, left));
    const b = Math.max(0, Math.min(length, right));
    if (b <= a) return 0;
    return (b - a) / length - (Math.sin(2 * n * Math.PI * b / length) - Math.sin(2 * n * Math.PI * a / length)) / (2 * n * Math.PI);
  };
  // Δx do n-ésimo estado (L = 1): √(1/12 − 1/(2n²π²)); Δp = nπ (ħ = 1).
  const deltaX = (n) => Math.sqrt(1 / 12 - 1 / (2 * n * n * Math.PI * Math.PI));
  const deltaP = (n) => n * Math.PI;

  // ---------- medida de posição (regra de Born) ----------
  // Sorteio de x em [0,1] com densidade |ψ_n|² = 2 sen²(nπx), por rejeição (máximo 2).
  function samplePosition(n, random = Math.random) {
    for (;;) { const x = random(); if (random() * 2 <= 2 * Math.sin(n * Math.PI * x) ** 2) return x; }
  }
  function histogram(samples, bins) {
    const counts = new Array(bins).fill(0);
    for (const s of samples) counts[Math.min(bins - 1, Math.floor(s * bins))] += 1;
    const n = Math.max(1, samples.length);
    return counts.map((c) => (c / n) * bins);  // densidade (área total 1)
  }

  // ---------- superposição de dois níveis ----------
  // Ψ = √(1−p) ψ_m e^{−iE_m t} + √p e^{iα} ψ_n e^{−iE_n t}  (L = 1)
  function twoLevel(u, t, m, n, p, alpha) {
    const a = Math.sqrt(1 - p) * boxWave(u, m), b = Math.sqrt(p) * boxWave(u, n);
    const fm = -boxEnergy(m) * t, fn = alpha - boxEnergy(n) * t;
    const re = a * Math.cos(fm) + b * Math.cos(fn), im = a * Math.sin(fm) + b * Math.sin(fn);
    return { re, im, density: re * re + im * im };
  }
  // x_mn = ∫₀¹ ψ_m x ψ_n du = −8mn/[π²(m²−n²)²] se m+n é ímpar, 0 se par (m ≠ n).
  function xElement(m, n) {
    if (m === n) return 0.5;
    if ((m + n) % 2 === 0) return 0;
    return -8 * m * n / (Math.PI * Math.PI * (m * m - n * n) ** 2);
  }
  function twoLevelMeanX(t, m, n, p, alpha) {
    const omega = boxEnergy(n) - boxEnergy(m);
    return 0.5 + 2 * Math.sqrt((1 - p) * p) * xElement(m, n) * Math.cos(omega * t - alpha);
  }

  // ---------- pacote gaussiano no poço e revivência ----------
  // Ψ(u,0) ∝ exp[−(u−u₀)²/(4w²) + ik₀u], projetado nos primeiros nMax autoestados (Simpson).
  function packetCoefficients(u0, w, k0, nMax = 70, points = 800) {
    const h = 1 / points, re = [], im = [];
    for (let n = 1; n <= nMax; n += 1) {
      let sr = 0, si = 0;
      for (let i = 0; i <= points; i += 1) {
        const u = i * h, wgt = i === 0 || i === points ? 1 : i % 2 ? 4 : 2;
        const env = Math.exp(-((u - u0) ** 2) / (4 * w * w)) * boxWave(u, n);
        sr += wgt * env * Math.cos(k0 * u); si += wgt * env * Math.sin(k0 * u);
      }
      re.push(sr * h / 3); im.push(si * h / 3);
    }
    const norm = Math.sqrt(re.reduce((s, v, i) => s + v * v + im[i] * im[i], 0));
    return re.map((v, i) => ({ n: i + 1, re: v / norm, im: im[i] / norm }));
  }
  // Ψ(u,t) = Σ c_n ψ_n(u) e^{−i n² t}; revivência em t = 2π (T_rev = 2πħ/E₁).
  function packetPsi(coeffs, u, t) {
    let re = 0, im = 0;
    for (const c of coeffs) {
      const s = boxWave(u, c.n), ph = -c.n * c.n * t, cr = Math.cos(ph), ci = Math.sin(ph);
      re += s * (c.re * cr - c.im * ci); im += s * (c.re * ci + c.im * cr);
    }
    return { re, im, density: re * re + im * im };
  }
  const revivalTime = () => 2 * Math.PI;
  // Tapete quântico: |Ψ(u,t)|² numa grade nu × nt, t de 0 a tMax.
  function carpet(coeffs, nu, nt, tMax) {
    const data = new Float32Array(nu * nt), basis = [];
    for (let i = 0; i < nu; i += 1) { const u = (i + .5) / nu; basis.push(coeffs.map((c) => boxWave(u, c.n))); }
    for (let j = 0; j < nt; j += 1) {
      const t = tMax * j / (nt - 1), ph = coeffs.map((c) => { const a = -c.n * c.n * t, cr = Math.cos(a), ci = Math.sin(a); return [c.re * cr - c.im * ci, c.re * ci + c.im * cr]; });
      for (let i = 0; i < nu; i += 1) {
        let re = 0, im = 0; const b = basis[i];
        for (let k = 0; k < ph.length; k += 1) { re += b[k] * ph[k][0]; im += b[k] * ph[k][1]; }
        data[j * nu + i] = re * re + im * im;
      }
    }
    return data;
  }

  // ---------- física médica ----------
  const SI = Object.freeze({ h: 6.62607015e-34, me: 9.1093837015e-31, c: 299792458, e: 1.602176634e-19 });
  const levelEV = (n, lengthNm, massRatio = 1) => (SI.h * SI.h * n * n) / (8 * massRatio * SI.me * (lengthNm * 1e-9) ** 2) / SI.e;
  const wavelengthNm = (energyEV) => (SI.h * SI.c) / (energyEV * SI.e) * 1e9;

  // Corante conjugado (modelo do elétron livre, Kuhn): N elétrons π num poço de largura
  // L = N·ℓ, ℓ = 0,139 nm. Cada nível comporta 2 elétrons; HOMO = N/2, LUMO = N/2 + 1;
  // ΔE = h²(N+1)/(8mL²).
  const BOND_NM = 0.139;
  function dye(electrons, bondNm = BOND_NM) {
    const length = electrons * bondNm, homo = electrons / 2, lumo = homo + 1;
    const gap = levelEV(lumo, length) - levelEV(homo, length);
    return { electrons, length, homo, lumo, gap, wavelength: wavelengthNm(gap) };
  }
  // Laser de poço quântico de GaAs (barreiras tratadas como infinitas): o fóton leva
  // E_g + E₁(elétron, m*_e) + E₁(buraco pesado, m*_hh).
  const GAAS = Object.freeze({ gap: 1.424, me: 0.067, mh: 0.51 });
  function quantumWellLaser(widthNm, material = GAAS) {
    const electron = levelEV(1, widthNm, material.me), hole = levelEV(1, widthNm, material.mh);
    const photon = material.gap + electron + hole;
    return { width: widthNm, electron, hole, photon, wavelength: wavelengthNm(photon), bulk: wavelengthNm(material.gap) };
  }
  // Referências ópticas aproximadas (nm) para comparar com os modelos.
  const OPTICAL = Object.freeze({
    window: [650, 950],          // janela óptica do tecido biológico (baixa absorção de Hb e água)
    pdt: [630, 690],             // faixa típica de ativação em terapia fotodinâmica
    dyes: [["Cy3", 550], ["Cy5", 649], ["Cy7", 750], ["ICG", 790]],
    lasers: [["diodo 808 nm", 808]],
  });

  const api = { boxWave, boxEnergy, intervalProbability, deltaX, deltaP, samplePosition, histogram,
    twoLevel, xElement, twoLevelMeanX, packetCoefficients, packetPsi, revivalTime, carpet,
    SI, levelEV, wavelengthNm, BOND_NM, dye, GAAS, quantumWellLaser, OPTICAL };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

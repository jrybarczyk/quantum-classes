(function (root) {
  "use strict";
  // Unidades: ħ = 1. No poço, L = 1 e E₁ = 1 (Eₙ = n²); no domínio periódico, Eₙ ∝ n².
  // Na estação E > V_min, ħ = m = 1 e H = −½ d²/dx² + V(x).

  // ---------- estados estacionários ----------
  const phase = (energy, time) => ({ re: Math.cos(energy * time), im: -Math.sin(energy * time) });
  const boxWave = (u, n) => Math.sqrt(2) * Math.sin(Math.PI * n * u);
  const densityStationary = (u, n) => boxWave(u, n) ** 2;
  const energyLevel = (n, length = 1) => n * n / (length * length);
  const ringWave = (theta, n) => Math.cos(n * theta) / Math.sqrt(Math.PI);
  const ringDensity = (theta, n) => ringWave(theta, n) ** 2;

  // ---------- superposição de dois níveis do poço (exercício da Aula 4) ----------
  // Ψ = c₁ψ₁e^(−iE₁t) + c₂e^(iα)ψ₂e^(−iE₂t), com |c₁|² = 1 − p₂ e |c₂|² = p₂.
  function twoLevel(u, t, p2, alpha, n1 = 1, n2 = 2) {
    const a1 = Math.sqrt(1 - p2), a2 = Math.sqrt(p2);
    const f1 = -energyLevel(n1) * t, f2 = alpha - energyLevel(n2) * t;
    const s1 = boxWave(u, n1), s2 = boxWave(u, n2);
    const re = a1 * s1 * Math.cos(f1) + a2 * s2 * Math.cos(f2), im = a1 * s1 * Math.sin(f1) + a2 * s2 * Math.sin(f2);
    return { re, im, density: re * re + im * im };
  }
  // ⟨x⟩(t)/L = 1/2 + 2|c₁||c₂| x₁₂ cos(ω₂₁t − α), x₁₂ = ∫ψ₁ x ψ₂ du = −16/(9π²).
  const x12 = -16 / (9 * Math.PI * Math.PI);
  function twoLevelMeanX(t, p2, alpha) {
    const omega = energyLevel(2) - energyLevel(1);
    return .5 + 2 * Math.sqrt((1 - p2) * p2) * x12 * Math.cos(omega * t - alpha);
  }
  function twoLevelEnergy(p2, n1 = 1, n2 = 2) {
    const e1 = energyLevel(n1), e2 = energyLevel(n2), mean = (1 - p2) * e1 + p2 * e2;
    const spread = Math.sqrt(Math.max(0, (1 - p2) * e1 * e1 + p2 * e2 * e2 - mean * mean));
    const omega = e2 - e1;
    return { e1, e2, p1: 1 - p2, p2, mean, spread, omega, period: 2 * Math.PI / omega };
  }
  // Uma medida de energia: devolve 1 ou 2 com probabilidades |c₁|², |c₂|².
  const measureEnergy = (p2, random = Math.random) => (random() < p2 ? 2 : 1);

  // ---------- E > V_min: função de teste e relaxação em tempo imaginário ----------
  const potentials = Object.freeze({
    harmonic: { name: "oscilador harmônico", formula: "V = x²/2", V: x => x * x / 2, ground: .5 },
    linear: { name: "poço em V", formula: "V = |x|", V: x => Math.abs(x), ground: .808616517 },
    doubleWell: { name: "poço duplo", formula: "V = (x² − 1)²", V: x => (x * x - 1) ** 2, ground: null },
  });

  function makeGrid(xMin = -6, xMax = 6, points = 241) {
    const dx = (xMax - xMin) / (points - 1);
    return { xMin, xMax, points, dx, xs: Array.from({ length: points }, (_, i) => xMin + i * dx) };
  }
  function normalize(psi, dx) {
    const norm = Math.sqrt(psi.reduce((s, v) => s + v * v, 0) * dx);
    return psi.map(v => v / norm);
  }
  // Função de teste gaussiana real centrada em x₀ com largura w; zera nas bordas da grade.
  function trialGaussian(grid, x0, width) {
    const psi = grid.xs.map(x => Math.exp(-((x - x0) ** 2) / (4 * width * width)));
    psi[0] = 0; psi[psi.length - 1] = 0;
    return normalize(psi, grid.dx);
  }
  // E = T + ⟨V⟩, T = ½∫|ψ′|²dx (forma da integração por partes da nota, sempre ≥ 0).
  function energyParts(psi, V, grid) {
    let kinetic = 0, potential = 0, norm = 0;
    for (let i = 0; i < psi.length; i += 1) {
      potential += V(grid.xs[i]) * psi[i] * psi[i] * grid.dx; norm += psi[i] * psi[i] * grid.dx;
      if (i < psi.length - 1) kinetic += .5 * ((psi[i + 1] - psi[i]) / grid.dx) ** 2 * grid.dx;
    }
    return { kinetic: kinetic / norm, potential: potential / norm, total: (kinetic + potential) / norm };
  }
  function potentialMinimum(V, grid) { return Math.min(...grid.xs.map(V)); }
  // Passos de tempo imaginário: ∂ψ/∂τ = −Hψ, renormalizando. As componentes de energia
  // mais alta decaem mais rápido e sobra o estado fundamental. dτ < dx² garante estabilidade.
  function relax(psi, V, grid, steps, dtau = .4 * grid.dx * grid.dx) {
    let current = psi.slice();
    const potential = grid.xs.map(V), dx2 = grid.dx * grid.dx;
    for (let s = 0; s < steps; s += 1) {
      const next = current.slice();
      for (let i = 1; i < current.length - 1; i += 1) {
        const laplacian = (current[i + 1] - 2 * current[i] + current[i - 1]) / dx2;
        next[i] = current[i] - dtau * (-.5 * laplacian + potential[i] * current[i]);
      }
      next[0] = 0; next[next.length - 1] = 0;
      current = normalize(next, grid.dx);
    }
    return current;
  }

  const api = { phase, boxWave, densityStationary, energyLevel, ringWave, ringDensity,
    twoLevel, twoLevelMeanX, twoLevelEnergy, measureEnergy, x12,
    potentials, makeGrid, normalize, trialGaussian, energyParts, potentialMinimum, relax };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

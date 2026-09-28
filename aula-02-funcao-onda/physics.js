(function (root, factory) { const api = factory(); if (typeof module === "object" && module.exports) module.exports = api; root.WavePhysics = api; })(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Unidades reduzidas m=ℏ=1 nos gráficos, salvo nas funções em SI.
  const constants = Object.freeze({ hbar: 1.054571817e-34, h: 6.62607015e-34, electronMass: 9.1093837015e-31, e: 1.602176634e-19, c: 299792458 });

  // ---------- relação de dispersão e velocidades ----------
  function freeOmega(k, mass = 1) { return k * k / (2 * mass); }
  function phaseVelocity(k, omega) { return omega / k; }
  function groupVelocity(k, mass = 1) { return k / mass; }

  // ---------- onda plana Ψ=e^{i(kx−ωt)} ----------
  function plane(x, t, k, omega = freeOmega(k)) {
    const phase = k * x - omega * t;
    return { re: Math.cos(phase), im: Math.sin(phase), density: 1, omega, phase };
  }
  // Posição de uma crista que em t=0 estava em x0, reduzida a [0, λ) com λ=2π/k:
  // somar outro múltiplo (ex.: 2π com k não inteiro) cairia fora de uma crista.
  function crestPosition(t, k, omega, x0 = 0, period = 2 * Math.PI / k) {
    const x = x0 + phaseVelocity(k, omega) * t;
    return ((x % period) + period) % period;
  }

  // Velocidade da crista a partir de instantes marcados em ordem, {t, x} com x em
  // [0, λ). Entre marcas consecutivas a crista anda menos de um período espacial se
  // Δt < λ/v_f; acima disso não dá para saber quantas cristas passaram: devolve null.
  function measuredCrestVelocity(marks, k, omega) {
    if (marks.length < 2) return null;
    const lambda = 2 * Math.PI / k, periodTime = lambda / phaseVelocity(k, omega);
    let distance = 0;
    for (let i = 1; i < marks.length; i += 1) {
      const dt = marks[i].t - marks[i - 1].t;
      if (!(dt > 0) || dt >= periodTime) return null;
      distance += ((marks[i].x - marks[i - 1].x) % lambda + lambda) % lambda;
    }
    return distance / (marks[marks.length - 1].t - marks[0].t);
  }
  // ---------- pacote gaussiano livre exato (ℏ=1, massa m) ----------
  // Ψ(x,0) ∝ exp[−x²/4σ² + ik₀x]; inclui o termo quadrático (chirp) na fase.
  function gaussian(x, t, sigma, k0, mass = 1) {
    const tau = t / (2 * mass * sigma * sigma), width = sigma * Math.sqrt(1 + tau * tau), center = k0 * t / mass, dx = x - center;
    const density = Math.exp(-(dx * dx) / (2 * width * width)) / (Math.sqrt(2 * Math.PI) * width);
    const phase = k0 * (x - center / 2) - Math.atan(tau) / 2 + tau * dx * dx / (4 * width * width);
    return { density, re: Math.sqrt(density) * Math.cos(phase), im: Math.sqrt(density) * Math.sin(phase), width, center, phase };
  }
  // Mesmo pacote num meio SEM dispersão (ω=ck, c=k₀/m): translada rígido, sem alargar.
  function rigidPacket(x, t, sigma, k0, mass = 1) {
    const c = k0 / mass, g = gaussian(x - c * t, 0, sigma, k0, mass);
    return { density: g.density, re: g.re, im: g.im, width: sigma, center: c * t, phase: g.phase };
  }
  // Crista que em t=0 estava em x=0: ponto onde a fase (contínua, sem módulo 2π)
  // do pacote exato vale zero. Com u = x − x_c, a fase é a·u² + k₀u + C, onde
  // a = τ/(4σ(t)²) e C = k₀x_c/2 − arctan(τ)/2; a raiz que tende à de onda plana
  // (x = k₀t/2m) é u = −2C/(k₀ + sgn(k₀)√(k₀² − 4aC)). Sem k₀ não há crista móvel.
  function packetCrest(t, sigma, k0, mass = 1) {
    if (Math.abs(k0) < 1e-9) return null;
    const tau = t / (2 * mass * sigma * sigma), width = sigma * Math.sqrt(1 + tau * tau), center = k0 * t / mass;
    const a = tau / (4 * width * width), C = k0 * center / 2 - Math.atan(tau) / 2, disc = k0 * k0 - 4 * a * C;
    if (disc < 0) return null;
    return center - 2 * C / (k0 + Math.sign(k0) * Math.sqrt(disc));
  }
  function packetWidth(t, sigma, mass = 1) { return sigma * Math.sqrt(1 + (t / (2 * mass * sigma * sigma)) ** 2); }
  function momentumGaussian(k, sigma, k0) { const width = 1 / (2 * sigma); return Math.exp(-((k - k0) ** 2) / (2 * width * width)) / (Math.sqrt(2 * Math.PI) * width); }

  // ---------- construtor de pacote: soma finita de N ondas planas ----------
  // k_j = k₀ + (j − (N−1)/2)·dk, pesos gaussianos centrados em k₀. Normalizado para |Ψ(0,0)|=1.
  function superpositionComponents(N, k0, dk) {
    const list = [];
    const sigmaK = Math.max(dk * (N - 1) / 4, 1e-9);
    for (let j = 0; j < N; j += 1) {
      const k = k0 + (j - (N - 1) / 2) * dk;
      const w = N === 1 ? 1 : Math.exp(-((k - k0) ** 2) / (2 * sigmaK * sigmaK));
      list.push({ k, w });
    }
    const total = list.reduce((s, c) => s + c.w, 0);
    return list.map(c => ({ k: c.k, w: c.w / total, omega: freeOmega(c.k) }));
  }
  function superposition(x, t, components) {
    let re = 0, im = 0;
    for (const c of components) { const ph = c.k * x - c.omega * t; re += c.w * Math.cos(ph); im += c.w * Math.sin(ph); }
    return { re, im, density: re * re + im * im };
  }
  // Espaçamento entre réplicas do pacote construído com passo dk.
  function replicaSpacing(dk) { return 2 * Math.PI / dk; }

  // ---------- Born e interferência ----------
  // Ψ=A(e^{ikx}+r·e^{−ikx+iφ}) ⇒ |Ψ|²/|A|² = 1+r²+2r·cos(2kx−φ). Aqui k=1.
  function interference(x, phase, ratio = 1) { return 1 + ratio * ratio + 2 * ratio * Math.cos(2 * x - phase); }
  // Densidade normalizada em um período 0≤x≤2π: ∫₀^{2π}|Ψ|²dx = 2π(1+r²).
  function bornDensity(x, phase, ratio = 1) { return interference(x, phase, ratio) / (2 * Math.PI * (1 + ratio * ratio)); }
  function bornInterval(a, b, phase, ratio = 1) {
    const r2 = 1 + ratio * ratio;
    return ((r2) * (b - a) + ratio * (Math.sin(2 * b - phase) - Math.sin(2 * a - phase))) / (2 * Math.PI * r2);
  }
  // Sorteio de posições de detecção a partir de |Ψ|² (rejeição em 0≤x≤2π).
  function sampleBorn(n, phase, ratio = 1, random = Math.random) {
    const out = [], top = (1 + ratio) ** 2;
    while (out.length < n) {
      const x = random() * 2 * Math.PI;
      if (random() * top <= interference(x, phase, ratio)) out.push(x);
    }
    return out;
  }
  function histogram(samples, bins, xmin, xmax) {
    const counts = new Array(bins).fill(0), width = (xmax - xmin) / bins;
    for (const s of samples) { const i = Math.min(bins - 1, Math.max(0, Math.floor((s - xmin) / width))); counts[i] += 1; }
    const n = Math.max(1, samples.length);
    return counts.map((c, i) => ({ x0: xmin + i * width, x1: xmin + (i + 1) * width, count: c, density: c / (n * width) }));
  }
  function fractionInInterval(samples, a, b) { return samples.length ? samples.filter(x => x >= a && x <= b).length / samples.length : 0; }

  // ---------- teste da equação de Schrödinger livre por diferenças finitas ----------
  // Candidatas: "complex" e^{i(kx−ωt)}, "real" cos(kx−ωt), "gaussian" pacote exato.
  function candidate(kind, x, t, p) {
    if (kind === "gaussian") { const g = gaussian(x, t, p.sigma, p.k, p.mass); return { re: g.re, im: g.im }; }
    const ph = p.k * x - p.omega * t;
    if (kind === "real") return { re: Math.cos(ph), im: 0 };
    return { re: Math.cos(ph), im: Math.sin(ph) };
  }
  // Devolve, em cada x, lhs = i∂ₜΨ e rhs = −∂ₓ²Ψ/(2m) (ℏ=1) e o módulo do residual.
  function schrodingerTest(kind, xs, t, p, dt = 1e-4, dx = 1e-3) {
    const rows = [];
    let sumSq = 0, maxRhs = 0;
    for (const x of xs) {
      const fp = candidate(kind, x, t + dt, p), fm = candidate(kind, x, t - dt, p);
      const dre = (fp.re - fm.re) / (2 * dt), dim = (fp.im - fm.im) / (2 * dt);
      const lhs = { re: -dim, im: dre };                       // i·(dre + i·dim)
      const c0 = candidate(kind, x, t, p), cp = candidate(kind, x + dx, t, p), cm = candidate(kind, x - dx, t, p);
      const d2re = (cp.re - 2 * c0.re + cm.re) / (dx * dx), d2im = (cp.im - 2 * c0.im + cm.im) / (dx * dx);
      const rhs = { re: -d2re / (2 * p.mass), im: -d2im / (2 * p.mass) };
      const residual = Math.hypot(lhs.re - rhs.re, lhs.im - rhs.im);
      sumSq += residual * residual; maxRhs = Math.max(maxRhs, Math.hypot(rhs.re, rhs.im));
      rows.push({ x, lhs, rhs, residual, psi: c0 });
    }
    const rms = Math.sqrt(sumSq / Math.max(1, xs.length));
    return { rows, rms, relative: maxRhs > 0 ? rms / maxRhs : 0 };
  }
  // Residual analítico da onda plana complexa (para leitura e testes).
  function schrodingerResidual(k, mass, omega = freeOmega(k, mass)) { return omega - freeOmega(k, mass); }

  // ---------- tradução para SI ----------
  function electronSI(wavelength) {
    const k = 2 * Math.PI / wavelength, p = constants.hbar * k, m = constants.electronMass;
    const energyJ = p * p / (2 * m);
    return { wavelength, k, p, energyJ, energyEV: energyJ / constants.e, voltage: energyJ / constants.e, groupVelocity: p / m, phaseVelocity: p / (2 * m), beta: p / m / constants.c };
  }
  function electronFromVoltage(volts) { return electronSI(constants.h / Math.sqrt(2 * constants.electronMass * constants.e * volts)); }

  return { constants, freeOmega, phaseVelocity, groupVelocity, plane, crestPosition, measuredCrestVelocity, gaussian, rigidPacket, packetCrest, packetWidth, momentumGaussian, superpositionComponents, superposition, replicaSpacing, interference, bornDensity, bornInterval, sampleBorn, histogram, fractionInInterval, candidate, schrodingerTest, schrodingerResidual, electronSI, electronFromVoltage };
});

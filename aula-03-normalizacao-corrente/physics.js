(function (root) {
  "use strict";
  const gaussianDensity = (x, sigma, center = 0) =>
    Math.exp(-((x - center) ** 2) / (2 * sigma ** 2)) / (Math.sqrt(2 * Math.PI) * sigma);
  const erf = x => {
    const sign = Math.sign(x) || 1;
    const z = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * z);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return sign * y;
  };
  const gaussianInterval = (left, right, sigma, center = 0) =>
    0.5 * (erf((right - center) / (Math.sqrt(2) * sigma)) - erf((left - center) / (Math.sqrt(2) * sigma)));
  const uncertaintyProduct = sigma => sigma * (1 / (2 * sigma));
  const continuityRate = (jLeft, jRight) => jLeft - jRight;

  // ---------- pacote gaussiano livre exato (ħ = m = 1) ----------
  // Ψ(x,0) ∝ exp[−(x−x₀)²/4σ₀² + ik₀(x−x₀)]. A fase inclui o termo quadrático
  // (chirp) que faz o pacote alargar; ver Aula 3, seção 4.
  function freePacket(x, t, sigma0, k0, x0 = 0) {
    const tau = t / (2 * sigma0 * sigma0), width = sigma0 * Math.sqrt(1 + tau * tau);
    const center = x0 + k0 * t, dx = x - center;
    const density = Math.exp(-(dx * dx) / (2 * width * width)) / (Math.sqrt(2 * Math.PI) * width);
    const phase = k0 * (x - x0) - k0 * k0 * t / 2 - Math.atan(tau) / 2 + tau * dx * dx / (4 * width * width);
    const amplitude = Math.sqrt(density);
    return { re: amplitude * Math.cos(phase), im: amplitude * Math.sin(phase), density, width, center, tau };
  }

  // J = (ħ/m) Im(Ψ* ∂ₓΨ), com ∂ₓΨ por diferença centrada: a corrente sai da
  // função de onda, não de uma velocidade imposta.
  function currentFromPsi(x, t, sigma0, k0, x0 = 0, h = 1e-4) {
    const psi = freePacket(x, t, sigma0, k0, x0), plus = freePacket(x + h, t, sigma0, k0, x0), minus = freePacket(x - h, t, sigma0, k0, x0);
    const dRe = (plus.re - minus.re) / (2 * h), dIm = (plus.im - minus.im) / (2 * h);
    return psi.re * dIm - psi.im * dRe;
  }

  // Forma analítica J = ρv, v = k₀ + (σ̇/σ)(x − x_c), com σ̇/σ = τ/(2σ²).
  function currentExact(x, t, sigma0, k0, x0 = 0) {
    const psi = freePacket(x, t, sigma0, k0, x0);
    const velocity = k0 + psi.tau * (x - psi.center) / (2 * psi.width * psi.width);
    return { density: psi.density, velocity, current: psi.density * velocity };
  }

  // P(a ≤ x ≤ b; t) por Simpson sobre ρ(x,t).
  function packetInterval(a, b, t, sigma0, k0, x0 = 0, intervals = 400) {
    const n = intervals + (intervals % 2), h = (b - a) / n;
    let sum = freePacket(a, t, sigma0, k0, x0).density + freePacket(b, t, sigma0, k0, x0).density;
    for (let i = 1; i < n; i += 1) sum += (i % 2 ? 4 : 2) * freePacket(a + i * h, t, sigma0, k0, x0).density;
    return sum * h / 3;
  }

  // ∂ₜρ + ∂ₓJ por diferenças finitas, com J calculada de Ψ.
  function continuityResidual(x, t, sigma0, k0, x0 = 0, dt = 1e-4, dx = 1e-3) {
    const dtRho = (freePacket(x, t + dt, sigma0, k0, x0).density - freePacket(x, t - dt, sigma0, k0, x0).density) / (2 * dt);
    const dxJ = (currentFromPsi(x + dx, t, sigma0, k0, x0) - currentFromPsi(x - dx, t, sigma0, k0, x0)) / (2 * dx);
    return dtRho + dxJ;
  }

  // Posição inicial: o pacote parte do lado de onde vem.
  const startPosition = k0 => (k0 > 0.025 ? -4 : k0 < -0.025 ? 4 : 0);

  // ---------- estados para a relação de incerteza (ħ = 1) ----------
  // Três formas reais e pares, todas parametrizadas pelo mesmo Δx; depois
  // ψ → ψ·exp(ip₀x + iβx²). p₀ desloca φ(p); β (fase quadrática) alarga φ(p)
  // sem mudar ρ(x): ⟨p²⟩ = ∫|ψ′|²dx + 4β²⟨x²⟩.
  const uncertaintyShapes = Object.freeze({
    gaussian: { name: "gaussiana", dpBase: dx => 1 / (2 * dx), support: dx => 7 * dx,
      amplitude: (x, dx) => Math.exp(-x * x / (4 * dx * dx)) / Math.pow(2 * Math.PI * dx * dx, .25) },
    exponential: { name: "exponencial", dpBase: dx => 1 / (Math.SQRT2 * dx), support: dx => 14 * dx,
      amplitude: (x, dx) => { const lambda = 1 / (Math.SQRT2 * dx); return Math.sqrt(lambda) * Math.exp(-lambda * Math.abs(x)); } },
    triangular: { name: "triangular", dpBase: dx => Math.sqrt(.3) / dx, support: dx => Math.sqrt(10) * dx,
      amplitude: (x, dx) => { const a = Math.sqrt(10) * dx; return Math.abs(x) < a ? Math.sqrt(1.5 / a) * (1 - Math.abs(x) / a) : 0; } },
  });

  function uncertaintyState(kind, dx, p0 = 0, beta = 0) {
    const shape = uncertaintyShapes[kind] || uncertaintyShapes.gaussian;
    const dpBase = shape.dpBase(dx), dp = Math.sqrt(dpBase * dpBase + 4 * beta * beta * dx * dx);
    return { kind, name: shape.name, dx, dp, dpBase, meanP: p0, beta, product: dx * dp, support: shape.support(dx),
      psi: x => { const a = shape.amplitude(x, dx), phase = p0 * x + beta * x * x; return { re: a * Math.cos(phase), im: a * Math.sin(phase) }; },
      density: x => shape.amplitude(x, dx) ** 2 };
  }

  // |φ(p)|² com φ(p) = (2π)^(−1/2) ∫ψ(x)e^(−ipx)dx por Simpson; o passo
  // acompanha a oscilação local de e^(i(p₀−p)x+iβx²).
  function momentumDensity(state, ps) {
    const L = state.support;
    const pMax = Math.max(...ps.map(Math.abs)) + Math.abs(state.meanP);
    const kMax = pMax + 2 * Math.abs(state.beta) * L;
    let n = Math.min(12000, Math.max(600, Math.ceil(2 * L * kMax / .2)));
    n += n % 2;
    const h = 2 * L / n, xs = [], re = [], im = [];
    for (let i = 0; i <= n; i += 1) { const x = -L + i * h, v = state.psi(x); xs.push(x); re.push(v.re); im.push(v.im); }
    return ps.map(p => {
      let sr = 0, si = 0;
      for (let i = 0; i <= n; i += 1) {
        const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2, c = Math.cos(p * xs[i]), s = Math.sin(p * xs[i]);
        sr += w * (re[i] * c + im[i] * s); si += w * (im[i] * c - re[i] * s);
      }
      sr *= h / 3 / Math.sqrt(2 * Math.PI); si *= h / 3 / Math.sqrt(2 * Math.PI);
      return sr * sr + si * si;
    });
  }

  const api = { gaussianDensity, gaussianInterval, uncertaintyProduct, continuityRate, freePacket, currentFromPsi, currentExact, packetInterval, continuityResidual, startPosition, uncertaintyShapes, uncertaintyState, momentumDensity };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

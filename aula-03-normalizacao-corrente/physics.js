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
  // Só com |norma − 1| < 5·10⁻⁴ o peso ∫|Ψ|²dx de um intervalo pode ser chamado de probabilidade.
  const isNormalized = (norm, tolerance = 5e-4) => Math.abs(norm - 1) < tolerance;
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
    gaussian: { name: "gaussiana", adjective: "gaussiano", dpBase: dx => 1 / (2 * dx), support: dx => 7 * dx,
      amplitude: (x, dx) => Math.exp(-x * x / (4 * dx * dx)) / Math.pow(2 * Math.PI * dx * dx, .25) },
    exponential: { name: "exponencial", adjective: "exponencial", dpBase: dx => 1 / (Math.SQRT2 * dx), support: dx => 14 * dx,
      amplitude: (x, dx) => { const lambda = 1 / (Math.SQRT2 * dx); return Math.sqrt(lambda) * Math.exp(-lambda * Math.abs(x)); } },
    triangular: { name: "triangular", adjective: "triangular", dpBase: dx => Math.sqrt(.3) / dx, support: dx => Math.sqrt(10) * dx,
      amplitude: (x, dx) => { const a = Math.sqrt(10) * dx; return Math.abs(x) < a ? Math.sqrt(1.5 / a) * (1 - Math.abs(x) / a) : 0; } },
  });

  function uncertaintyState(kind, dx, p0 = 0, beta = 0) {
    const shape = uncertaintyShapes[kind] || uncertaintyShapes.gaussian;
    const dpBase = shape.dpBase(dx), dp = Math.sqrt(dpBase * dpBase + 4 * beta * beta * dx * dx);
    return { kind, name: shape.name, adjective: shape.adjective, dx, dp, dpBase, meanP: p0, beta, product: dx * dp, support: shape.support(dx),
      psi: x => { const a = shape.amplitude(x, dx), phase = p0 * x + beta * x * x; return { re: a * Math.cos(phase), im: a * Math.sin(phase) }; },
      density: x => shape.amplitude(x, dx) ** 2 };
  }

  // Meia largura do eixo p/ℏ da estação de incerteza: simétrica em 0 e fixa em p₀ ∈ [−2, 2]
  // (o slider vai até |p₀| = 2), para que a distribuição se desloque na tela quando p₀ muda.
  const momentumAxisHalf = (dp, p0Max = 2) => Math.ceil(p0Max + 4 * dp);
  // Meia largura do eixo x da estação de corrente: cobre o centro e ±2σ(t) em todo o
  // intervalo de tempo [0, tMax] (o eixo não anda durante a animação); mínimo 10, máximo 16.
  function currentAxisHalf(sigma0, k0, tMax, x0 = startPosition(k0)) {
    const width = sigma0 * Math.sqrt(1 + (tMax / (2 * sigma0 * sigma0)) ** 2);
    const reach = Math.max(Math.abs(x0), Math.abs(x0 + k0 * tMax)) + 2 * width;
    return Math.min(16, Math.max(10, 2 * Math.ceil(reach / 2)));
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

  // ---------- apresentação: marcas "bonitas" de eixo e números em pt-BR ----------
  // Marcas em múltiplos de 1, 2 ou 5 × 10ᵏ, sempre incluindo o 0 quando ele está no
  // intervalo; os rótulos usam as casas decimais do passo (passo 0,2 → 1 casa).
  // (Extensão de apresentação: não vem da nota; ver GUIA-DIDATICO.md, "Apresentação".)
  function niceTicks(min, max, target = 5) {
    const span = max - min;
    if (!(span > 0) || !Number.isFinite(span)) return { step: 1, digits: 0, ticks: Number.isFinite(min) ? [min] : [] };
    const raw = span / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, ticks = [];
    const first = Math.ceil(min / step - 1e-9), last = Math.floor(max / step + 1e-9);
    for (let i = first; i <= last; i += 1) { const v = i * step; ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(12))); }
    return { step, digits: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)), ticks };
  }
  // Número em pt-BR: vírgula decimal, "−" tipográfico, sem separador de milhar e sem
  // "−0": valor cujo módulo é menor que meia casa mostrada vira 0.
  function formatNumber(value, digits = 3) {
    let n = Number(value);
    if (!Number.isFinite(n)) return Number.isNaN(n) ? "—" : n > 0 ? "∞" : "−∞";
    if (Math.abs(n) < 0.5 * 10 ** -digits) n = 0;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).replace(/-/g, "−");
  }
  // Notação científica em HTML com vírgula decimal: 6,2×10<sup>−8</sup>.
  function formatScientific(value, digits = 3) {
    if (!Number.isFinite(value)) return "—";
    if (value === 0) return formatNumber(0, digits);
    return scientificFromLog10(Math.log10(Math.abs(value)), digits, value < 0);
  }
  // Mesma coisa a partir de log₁₀|v| (para valores abaixo de 10⁻³⁰⁰, que não cabem num double).
  function scientificFromLog10(log10Value, digits = 3, negative = false) {
    let exponent = Math.floor(log10Value), mantissa = 10 ** (log10Value - exponent);
    if (Number(mantissa.toFixed(digits)) >= 10) { mantissa /= 10; exponent += 1; }
    return `${negative ? "−" : ""}${formatNumber(mantissa, digits)}×10<sup>${String(exponent).replace("-", "−")}</sup>`;
  }

  const api = { isNormalized, niceTicks, formatNumber, formatScientific, scientificFromLog10, gaussianDensity, gaussianInterval, uncertaintyProduct, continuityRate, freePacket, currentFromPsi, currentExact, packetInterval, continuityResidual, startPosition, uncertaintyShapes, uncertaintyState, momentumDensity, momentumAxisHalf, currentAxisHalf };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

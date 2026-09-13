(function (root, factory) { const api = factory(); if (typeof module === "object" && module.exports) module.exports = api; root.WavePhysics = api; })(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Unidades reduzidas m=ℏ=1, salvo em electronSI.
  const constants = Object.freeze({ hbar: 1.054571817e-34, electronMass: 9.1093837139e-31, e: 1.602176634e-19 });
  function freeOmega(k, mass = 1) { return k * k / (2 * mass); }
  // Onda plana Ψ=e^{i(kx−ωt)}; por padrão ω segue a relação de dispersão livre com m=1.
  function plane(x, t, k, omega = freeOmega(k)) { return { re: Math.cos(k * x - omega * t), im: Math.sin(k * x - omega * t), density: 1, omega }; }
  // Pacote gaussiano livre exato (m=ℏ=1): Ψ(x,0) ∝ exp[−x²/4σ² + ik₀x]. Inclui o termo quadrático (chirp) na fase.
  function gaussian(x, t, sigma, k0) {
    const tau = t / (2 * sigma * sigma), width = sigma * Math.sqrt(1 + tau * tau), center = k0 * t, dx = x - center;
    const density = Math.exp(-(dx * dx) / (2 * width * width)) / (Math.sqrt(2 * Math.PI) * width);
    const phase = k0 * (x - center / 2) - Math.atan(tau) / 2 + tau * dx * dx / (4 * width * width);
    return { density, re: Math.sqrt(density) * Math.cos(phase), im: Math.sqrt(density) * Math.sin(phase), width, center, phase };
  }
  function momentumGaussian(k, sigma, k0) { const width = 1 / (2 * sigma); return Math.exp(-((k - k0) ** 2) / (2 * width * width)) / (Math.sqrt(2 * Math.PI) * width); }
  // Ψ=A(e^{ikx}+e^{−ikx+iφ}) ⇒ |Ψ|²/|A|² = 2+2cos(2kx−φ). Normalização sobre um período 0≤x≤2π/k (integral = 4π/k).
  function interference(x, phase, k = 1) { return 2 + 2 * Math.cos(2 * k * x - phase); }
  function bornInterval(right, phase, k = 1) {
    const integral = 2 * right + (Math.sin(2 * k * right - phase) - Math.sin(-phase)) / k;
    return integral / (4 * Math.PI / k);
  }
  // Lados da equação de Schrödinger livre aplicados a e^{i(kx−ωt)}: iℏ∂tΨ = ℏωΨ e −ℏ²∂x²Ψ/(2m) = (ℏ²k²/2m)Ψ.
  function schrodingerSides(k, mass, omega = freeOmega(k, mass)) { return { left: omega, right: freeOmega(k, mass), residual: omega - freeOmega(k, mass) }; }
  function schrodingerResidual(k, mass, omega = freeOmega(k, mass)) { return schrodingerSides(k, mass, omega).residual; }
  // Exemplo em SI (slide): elétron livre não relativístico com comprimento de onda dado.
  function electronSI(wavelength) {
    const k = 2 * Math.PI / wavelength, p = constants.hbar * k, m = constants.electronMass;
    const energyJ = p * p / (2 * m);
    return { k, p, energyJ, energyEV: energyJ / constants.e, groupVelocity: p / m, phaseVelocity: p / (2 * m) };
  }
  return { constants, freeOmega, plane, gaussian, momentumGaussian, interference, bornInterval, schrodingerSides, schrodingerResidual, electronSI };
});

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
  const currentGaussian = (x, sigma, center, velocity) => velocity * gaussianDensity(x, sigma, center);
  const continuityResidual = (x, sigma, center, velocity, dt = 1e-4, dx = 1e-3) => {
    const dtRho = (gaussianDensity(x, sigma, center + velocity * dt) - gaussianDensity(x, sigma, center - velocity * dt)) / (2 * dt);
    const dxJ = (currentGaussian(x + dx, sigma, center, velocity) - currentGaussian(x - dx, sigma, center, velocity)) / (2 * dx);
    return dtRho + dxJ;
  };
  const api = { gaussianDensity, gaussianInterval, uncertaintyProduct, continuityRate, currentGaussian, continuityResidual };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

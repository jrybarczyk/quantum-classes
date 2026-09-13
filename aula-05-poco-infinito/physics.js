(function (root) {
  "use strict";
  const boxWave = (x, n, length = 1) =>
    x < 0 || x > length ? 0 : Math.sqrt(2 / length) * Math.sin(n * Math.PI * x / length);
  const boxEnergy = (n, length = 1) => n * n / (length * length);
  const intervalProbability = (n, left, right, length = 1) => {
    const a = Math.max(0, Math.min(length, left));
    const b = Math.max(0, Math.min(length, right));
    if (b <= a) return 0;
    return (b - a) / length - (Math.sin(2 * n * Math.PI * b / length) - Math.sin(2 * n * Math.PI * a / length)) / (2 * n * Math.PI);
  };
  const superpositionDensity = (u, nA, nB, weightB, phase) => {
    const a = Math.sqrt(1 - weightB) * boxWave(u, nA);
    const b = Math.sqrt(weightB) * boxWave(u, nB);
    return a * a + b * b + 2 * a * b * Math.cos(phase);
  };
  const api = { boxWave, boxEnergy, intervalProbability, superpositionDensity };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

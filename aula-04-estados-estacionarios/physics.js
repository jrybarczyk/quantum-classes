(function (root) {
  "use strict";
  const phase = (energy, time) => ({ re: Math.cos(energy * time), im: -Math.sin(energy * time) });
  const boxWave = (u, n) => Math.sqrt(2) * Math.sin(Math.PI * n * u);
  const densityStationary = (u, n) => boxWave(u, n) ** 2;
  const energyLevel = (n, length = 1) => n * n / (length * length);
  const ringWave = (theta, n) => Math.cos(n * theta) / Math.sqrt(Math.PI);
  const ringDensity = (theta, n) => ringWave(theta, n) ** 2;
  const api = { phase, boxWave, densityStationary, energyLevel, ringWave, ringDensity };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

(function (root) {
  "use strict";
  const normalize = weights => {
    const sum = weights.reduce((acc, value) => acc + Math.max(0, value), 0);
    return sum ? weights.map(value => Math.max(0, value) / sum) : weights.map(() => 1 / weights.length);
  };
  const expectation = (values, probabilitiesList) => values.reduce((acc, value, i) => acc + value * probabilitiesList[i], 0);
  const variance = (values, probabilitiesList) => {
    const mean = expectation(values, probabilitiesList);
    return expectation(values.map(value => (value - mean) ** 2), probabilitiesList);
  };
  const probabilities = (dominant, mixing) => {
    const raw = Array.from({ length: 6 }, (_, i) => Math.exp(-Math.abs(i + 1 - dominant) / Math.max(0.18, mixing)));
    return normalize(raw);
  };
  const projectState = (kind, center = .5, width = .18, modes = 6) => {
    const points = 2401, step = 1 / (points - 1);
    const raw = u => {
      if (kind === "flat") return 1;
      if (kind === "triangular") return Math.max(0, 1 - Math.abs(u - center) / Math.max(.04, width));
      return Math.exp(-((u - center) ** 2) / (4 * Math.max(.035, width) ** 2));
    };
    const integrate = fn => {
      let sum = 0;
      for (let i = 0; i < points; i += 1) sum += fn(i * step) * (i === 0 || i === points - 1 ? .5 : 1);
      return sum * step;
    };
    const norm = Math.sqrt(integrate(u => raw(u) ** 2));
    const wave = u => raw(u) / norm;
    const coefficients = Array.from({ length: modes }, (_, i) => integrate(u => wave(u) * Math.sqrt(2) * Math.sin((i + 1) * Math.PI * u)));
    const projectedProbabilities = coefficients.map(value => value * value);
    const capturedNorm = projectedProbabilities.reduce((a, b) => a + b, 0);
    return { coefficients, probabilities: projectedProbabilities, capturedNorm, normalizedProbabilities: projectedProbabilities.map(value => value / capturedNorm), wave };
  };
  const sample = probabilitiesList => {
    let random = Math.random();
    for (let i = 0; i < probabilitiesList.length; i += 1) {
      random -= probabilitiesList[i];
      if (random <= 0) return i;
    }
    return probabilitiesList.length - 1;
  };
  const api = { normalize, expectation, variance, probabilities, projectState, sample };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

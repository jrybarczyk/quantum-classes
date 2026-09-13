(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.OriginsPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const constants = Object.freeze({
    h: 6.62607015e-34,
    hbar: 1.054571817e-34,
    c: 299792458,
    kB: 1.380649e-23,
    e: 1.602176634e-19,
    electronMass: 9.1093837139e-31,
    electronRestEnergyEV: 510998.95,
    wien: 2.897771955e-3,
    radiation: 7.565733250e-16,
    comptonElectron: 2.42631023867e-12,
  });

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function planckFrequency(frequency, temperature) {
    if (!(frequency > 0) || !(temperature > 0)) return 0;
    const x = constants.h * frequency / (constants.kB * temperature);
    if (x > 700) return 0;
    return 8 * Math.PI * constants.h * frequency ** 3 /
      (constants.c ** 3 * Math.expm1(x));
  }

  function rayleighJeansFrequency(frequency, temperature) {
    if (!(frequency >= 0) || !(temperature > 0)) return 0;
    return 8 * Math.PI * frequency ** 2 * constants.kB * temperature / constants.c ** 3;
  }

  function planckWavelength(wavelength, temperature) {
    if (!(wavelength > 0) || !(temperature > 0)) return 0;
    const x = constants.h * constants.c / (wavelength * constants.kB * temperature);
    if (x > 700) return 0;
    return 8 * Math.PI * constants.h * constants.c /
      (wavelength ** 5 * Math.expm1(x));
  }

  function blackbody(temperature) {
    return {
      lambdaPeak: constants.wien / temperature,
      energyDensity: constants.radiation * temperature ** 4,
      radiatedFlux: constants.c * constants.radiation * temperature ** 4 / 4,
    };
  }

  function photoelectric(frequency, workFunctionEV, intensityRelative = 1) {
    const photonEnergyEV = constants.h * frequency / constants.e;
    const kineticEV = Math.max(0, photonEnergyEV - workFunctionEV);
    const thresholdFrequency = workFunctionEV * constants.e / constants.h;
    return {
      photonEnergyEV,
      kineticEV,
      stoppingVoltage: kineticEV,
      thresholdFrequency,
      emitted: frequency >= thresholdFrequency,
      relativeCurrent: frequency >= thresholdFrequency ? Math.max(0, intensityRelative) : 0,
    };
  }

  function compton(wavelength, angleDegrees) {
    const theta = clamp(angleDegrees, 0, 180) * Math.PI / 180;
    const shift = constants.comptonElectron * (1 - Math.cos(theta));
    const scatteredWavelength = wavelength + shift;
    const incidentEnergyEV = constants.h * constants.c / (wavelength * constants.e);
    const scatteredEnergyEV = constants.h * constants.c / (scatteredWavelength * constants.e);
    const electronKineticEV = incidentEnergyEV - scatteredEnergyEV;
    const electronMomentum = Math.sqrt(Math.max(0,
      (electronKineticEV + constants.electronRestEnergyEV) ** 2 - constants.electronRestEnergyEV ** 2
    )) * constants.e / constants.c;
    return { shift, scatteredWavelength, incidentEnergyEV, scatteredEnergyEV, electronKineticEV, electronMomentum };
  }

  function deBroglieElectron(voltage) {
    const kineticEV = Math.max(0, voltage);
    const kineticJ = kineticEV * constants.e;
    const classicalMomentum = Math.sqrt(2 * constants.electronMass * kineticJ);
    const classicalWavelength = kineticJ > 0 ? constants.h / classicalMomentum : Infinity;
    const totalEnergyJ = constants.electronMass * constants.c ** 2 + kineticJ;
    const relativisticMomentum = Math.sqrt(Math.max(0,
      totalEnergyJ ** 2 - (constants.electronMass * constants.c ** 2) ** 2
    )) / constants.c;
    const relativisticWavelength = relativisticMomentum > 0 ? constants.h / relativisticMomentum : Infinity;
    return {
      kineticEV,
      classicalWavelength,
      relativisticWavelength,
      relativeError: relativisticWavelength > 0 ?
        Math.abs(classicalWavelength - relativisticWavelength) / relativisticWavelength : 0,
    };
  }

  function braggAngle(wavelength, spacing, order = 1) {
    const argument = order * wavelength / (2 * spacing);
    return argument <= 1 ? Math.asin(argument) * 180 / Math.PI : null;
  }

  return {
    constants,
    planckFrequency,
    rayleighJeansFrequency,
    planckWavelength,
    blackbody,
    photoelectric,
    compton,
    deBroglieElectron,
    braggAngle,
  };
});

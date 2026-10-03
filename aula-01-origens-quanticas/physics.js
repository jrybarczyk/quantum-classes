(function (root, factory) {
  const xcom = typeof module === "object" && module.exports ? require("./xcom-data.js") : root.OriginsXCOM;
  const api = factory(xcom);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.OriginsPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (XCOM) {
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
    electronRestEnergyMeV: .51099895,
    classicalElectronRadiusCm: 2.8179403262e-13,
    avogadro: 6.02214076e23,
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

  // Pico de u_ν: x = hν/kT resolve 3(1 − e^(−x)) = x, x ≈ 2,821439 (Wien em frequência).
  const wienFrequencyX = 2.821439372122079;
  function blackbodyPeakFrequency(temperature) { return wienFrequencyX * constants.kB * temperature / constants.h; }

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

  // Fotocorrente em função da tensão V do anodo em relação ao catodo. Modelo
  // didático: energias cinéticas distribuídas uniformemente entre 0 e K_máx. Com V ≥ 0
  // todos os elétrons chegam (saturação ∝ intensidade); com V < 0 só chegam os que têm
  // K ≥ e|V|; a corrente zera em V = −V_s, que não depende da intensidade.
  function photocurrent(voltage, frequency, workFunctionEV, intensityRelative = 1) {
    const result = photoelectric(frequency, workFunctionEV, intensityRelative);
    if (!result.emitted || result.stoppingVoltage === 0) return 0;
    if (voltage >= 0) return result.relativeCurrent;
    return result.relativeCurrent * Math.max(0, 1 + voltage / result.stoppingVoltage);
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
    // Recuo: cot φ = (1 + Eγ/mₑc²)·tan(θ/2), com φ medido a partir da direção
    // incidente, do lado oposto ao fóton espalhado. Em θ = 0 não há colisão.
    const electronAngle = theta === 0 ? null :
      Math.atan2(1, (1 + incidentEnergyEV / constants.electronRestEnergyEV) * Math.tan(theta / 2)) * 180 / Math.PI;
    const incidentMomentum = constants.h / wavelength, scatteredMomentum = constants.h / scatteredWavelength;
    return { shift, scatteredWavelength, incidentEnergyEV, scatteredEnergyEV, electronKineticEV, electronMomentum, electronAngle, incidentMomentum, scatteredMomentum };
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

  // Controles em escala log: o slider guarda log10 da grandeza e o valor usado é
  // arredondado (unidades inteiras abaixo de 1000, dezenas acima), para que um botão
  // de "54 V" dê exatamente 54 V mesmo depois do passo do slider.
  function fromLogSlider(logValue) {
    const value = 10 ** logValue;
    return value < 1000 ? Math.round(value) : Math.round(value / 10) * 10;
  }

  function braggAngle(wavelength, spacing, order = 1) {
    const argument = order * wavelength / (2 * spacing);
    return argument <= 1 ? Math.asin(argument) * 180 / Math.PI : null;
  }

  // Atenuação de fótons: seções de choque tabeladas do NIST XCOM (xcom-data.js),
  // interpoladas em log-log por canal. Densidades: água 1,00; osso cortical
  // ICRU-44 1,92; chumbo 11,35 g/cm³.
  const radiationMaterials = Object.freeze({
    water: { name: "Água", density: 1, table: XCOM.water },
    bone: { name: "Osso cortical", density: 1.92, table: XCOM.bone },
    lead: { name: "Chumbo", density: 11.35, table: XCOM.lead },
  });
  const channelKeys = ["coherent", "compton", "photoelectric", "pairNuclear", "pairElectron"];

  function kleinNishinaTotalPerElectron(energyMeV) {
    const alpha = energyMeV / constants.electronRestEnergyMeV;
    const term = (1 + alpha) / (alpha * alpha) *
      (2 * (1 + alpha) / (1 + 2 * alpha) - Math.log(1 + 2 * alpha) / alpha) +
      Math.log(1 + 2 * alpha) / (2 * alpha) - (1 + 3 * alpha) / ((1 + 2 * alpha) ** 2);
    return 2 * Math.PI * constants.classicalElectronRadiusCm ** 2 * term;
  }

  // Interpolação log-log entre linhas vizinhas; numa borda (energia repetida)
  // vale o lado de cima. Canal nulo numa das pontas (pares perto do limiar):
  // interpolação linear.
  function interpolateChannels(table, energy) {
    const E = clamp(energy, table[0][0], table[table.length - 1][0]);
    let i = 0;
    while (i < table.length - 2 && table[i + 1][0] <= E) i += 1;
    while (i < table.length - 2 && table[i + 1][0] === table[i][0]) i += 1;
    const a = table[i], b = table[i + 1];
    const edge = b[0] === a[0];
    const fLog = edge ? 1 : Math.log(E / a[0]) / Math.log(b[0] / a[0]), fLin = edge ? 1 : (E - a[0]) / (b[0] - a[0]);
    const values = {};
    channelKeys.forEach((key, k) => {
      const ya = a[k + 1], yb = b[k + 1];
      values[key] = ya > 0 && yb > 0 ? ya * (yb / ya) ** fLog : ya + fLin * (yb - ya);
    });
    return values;
  }

  function radiationInteraction(materialKey, energyMeV, thicknessCm) {
    const material = radiationMaterials[materialKey] || radiationMaterials.water;
    const v = interpolateChannels(material.table, energyMeV);
    const coherent = v.coherent, compton = v.compton, photoelectric = v.photoelectric, pair = v.pairNuclear + v.pairElectron;
    const totalMass = coherent + photoelectric + compton + pair;
    const linear = totalMass * material.density;
    const transmission = Math.exp(-linear * Math.max(0, thicknessCm));
    const channels = { coherent, photoelectric, compton, pair };
    const dominant = Object.keys(channels).reduce((best, key) => channels[key] > channels[best] ? key : best, "coherent");
    return { material, coherent, photoelectric, compton, pair, totalMass, linear, transmission, dominant };
  }

  // Bordas de absorção da tabela (energias repetidas), em MeV.
  function absorptionEdges(materialKey) {
    const table = (radiationMaterials[materialKey] || radiationMaterials.water).table;
    return table.filter((row, i) => i > 0 && row[0] === table[i - 1][0]).map(row => row[0]);
  }

  return {
    constants,
    planckFrequency,
    rayleighJeansFrequency,
    planckWavelength,
    blackbody,
    photoelectric,
    photocurrent,
    blackbodyPeakFrequency,
    compton,
    deBroglieElectron,
    braggAngle,
    fromLogSlider,
    radiationMaterials,
    radiationInteraction,
    absorptionEdges,
    kleinNishinaTotalPerElectron,
  };
});

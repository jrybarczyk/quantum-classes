(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BarrierPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Unidades naturais: m = hbar = 1. Energias e V0 na mesma escala arbitraria.

  function kOf(E) { return Math.sqrt(2 * E); }

  // Degrau em x=0, altura V0. Retorna R, T e os numeros de onda/decaimento.
  function step(E, V0) {
    if (E <= 0) return { R: 1, T: 0, regime: "abaixo" };
    if (E > V0) {
      const k1 = Math.sqrt(2 * E), k2 = Math.sqrt(2 * (E - V0));
      const R = ((k1 - k2) / (k1 + k2)) ** 2;
      const T = 4 * k1 * k2 / (k1 + k2) ** 2;
      return { R, T, k1, k2, regime: "acima" };
    }
    const k1 = Math.sqrt(2 * E), kappa = Math.sqrt(2 * (V0 - E));
    return { R: 1, T: 0, k1, kappa, delta: 1 / kappa, regime: "evanescente" };
  }

  // Barreira retangular de altura V0 e largura a, valida para qualquer E>0
  // (sub-barreira via senh, acima da barreira via seno, mesma formula por
  // continuacao analitica kappa -> i q).
  function barrierT(E, V0, a) {
    if (E <= 0) return 0;
    if (Math.abs(E - V0) < 1e-9) {
      // limite kappa,q -> 0: sinh(kappa a)/kappa -> a, formula reduz a
      // T = [1 + V0 m a^2/(2 hbar^2)]^-1 (aqui m=hbar=1)
      return 1 / (1 + V0 * a * a / 2);
    }
    if (E < V0) {
      const kappa = Math.sqrt(2 * (V0 - E));
      const s = Math.sinh(kappa * a);
      return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
    }
    const q = Math.sqrt(2 * (E - V0));
    const s = Math.sin(q * a);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
  }

  // Aproximacao de barreira larga/alta (kappa*a >> 1), valida so para E<V0.
  function barrierTWide(E, V0, a) {
    if (E >= V0) return NaN;
    const kappa = Math.sqrt(2 * (V0 - E));
    return 16 * E * (V0 - E) / (V0 * V0) * Math.exp(-2 * kappa * a);
  }

  // Proximo zero de ressonancia (T=1) acima da barreira: q*a = n*pi.
  function resonanceEnergy(V0, a, n) {
    const q = n * Math.PI / a;
    return V0 + q * q / 2;
  }

  // ---------------------------------------------------------------- Física médica
  // Unidades nucleares, com a unidade no nome: energia em MeV, distância em fm.
  // Nota 07, exemplo resolvido "decaimento alfa do ²²³Ra: da barreira retangular ao
  // fator de Gamow". Constantes: e²/4πε₀ = 1,44 MeV·fm; ħc = 197,3 MeV·fm;
  // m_α c² = 3727 MeV; filho ²¹⁹Rn com Z = 86.
  const NUC = { e2MeVFm: 1.43996, hbarcMeVFm: 197.327, mAlphaMeV: 3727.379, cFmPerS: 2.99792458e23 };
  // V(r) = 2Ze²/(4πε₀ r), em MeV.
  function coulombMeV(rFm, Z = 86) { return 2 * Z * NUC.e2MeVFm / rFm; }
  // Ponto clássico de saída: V(b) = E_α.
  function turningPointFm(EMeV, Z = 86) { return 2 * Z * NUC.e2MeVFm / EMeV; }
  // Raio de contato R = 1,2 (A_filho^(1/3) + 4^(1/3)) fm.
  function contactRadiusFm(Adaughter = 219) { return 1.2 * (Math.cbrt(Adaughter) + Math.cbrt(4)); }
  // Barreira retangular de altura V(R) − E e largura b − R: expoente 2κa da Eq. (aprox).
  function rectangleExponent(EMeV, RFm, Z = 86) {
    const V0 = coulombMeV(RFm, Z), b = turningPointFm(EMeV, Z);
    if (V0 <= EMeV) return 0;
    const kappa = Math.sqrt(2 * NUC.mAlphaMeV * (V0 - EMeV)) / NUC.hbarcMeVFm;
    return 2 * kappa * (b - RFm);
  }
  // Fator de Gamow (nota 07): T ≈ e^(−G), G = 2∫_R^b κ(r) dr
  //   = (2b√(2m_αE_α)/ħ) [arccos√(R/b) − √((R/b)(1 − R/b))].
  function gamowExponent(EMeV, RFm, Z = 86) {
    const b = turningPointFm(EMeV, Z);
    if (RFm >= b) return 0;
    const x = RFm / b;
    return 2 * b * Math.sqrt(2 * NUC.mAlphaMeV * EMeV) / NUC.hbarcMeVFm * (Math.acos(Math.sqrt(x)) - Math.sqrt(x * (1 - x)));
  }
  // Frequência de colisão com a parede: v/2R, v = c√(2E_α/m_αc²), em s⁻¹.
  function assaultRatePerS(EMeV, RFm) { return NUC.cFmPerS * Math.sqrt(2 * EMeV / NUC.mAlphaMeV) / (2 * RFm); }
  // λ = (v/2R) e^(−G); T½ = ln 2/λ, em dias.
  function alphaHalfLifeDays(EMeV, RFm, Z = 86) {
    const lambda = assaultRatePerS(EMeV, RFm) * Math.exp(-gamowExponent(EMeV, RFm, Z));
    return Math.LN2 / lambda / 86400;
  }
  // Ultrassom (nota 07, "o análogo é o ultrassom"): R = ((Z₁−Z₂)/(Z₁+Z₂))²,
  // T = 4Z₁Z₂/(Z₁+Z₂)², as Eqs. de R e T do degrau com k → Z. Z em MRayl.
  function acousticR(Z1MRayl, Z2MRayl) { return ((Z1MRayl - Z2MRayl) / (Z1MRayl + Z2MRayl)) ** 2; }
  function acousticT(Z1MRayl, Z2MRayl) { return 4 * Z1MRayl * Z2MRayl / (Z1MRayl + Z2MRayl) ** 2; }
  // Impedâncias acústicas (MRayl) usadas na nota.
  const TISSUES = { ar: 4e-4, gordura: 1.38, tecido: 1.63, musculo: 1.70, osso: 7.8 };

  return { kOf, step, barrierT, barrierTWide, resonanceEnergy,
    NUC, coulombMeV, turningPointFm, contactRadiusFm, rectangleExponent, gamowExponent, assaultRatePerS, alphaHalfLifeDays,
    acousticR, acousticT, TISSUES };
});

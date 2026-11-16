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

  // ------------------------------------------------------------ ln T contra a
  // Nota 07, "Barreira larga ou alta": ln T ≃ ln[16E(V₀−E)/V₀²] − 2κa (reta de inclinação −2κ).
  function lnBarrierT(E, V0, a) {
    // mesma fórmula de barrierT, escrita com log1p para não perder T < 1e-300
    if (E <= 0) return -Infinity;
    if (Math.abs(E - V0) < 1e-9) return -Math.log1p(V0 * a * a / 2);
    if (E < V0) { const s = Math.sinh(Math.sqrt(2 * (V0 - E)) * a); return -Math.log1p(V0 * V0 * s * s / (4 * E * (V0 - E))); }
    const s = Math.sin(Math.sqrt(2 * (E - V0)) * a);
    return -Math.log1p(V0 * V0 * s * s / (4 * E * (E - V0)));
  }
  function lnBarrierTWide(E, V0, a) {
    if (E <= 0 || E >= V0) return NaN;
    return Math.log(16 * E * (V0 - E) / (V0 * V0)) - 2 * Math.sqrt(2 * (V0 - E)) * a;
  }

  // ------------------------------------------------- função de onda nas três regiões
  // Aritmética complexa mínima, par [re, im].
  const cAdd = (u, v) => [u[0] + v[0], u[1] + v[1]];
  const cSub = (u, v) => [u[0] - v[0], u[1] - v[1]];
  const cMul = (u, v) => [u[0] * v[0] - u[1] * v[1], u[0] * v[1] + u[1] * v[0]];
  const cDiv = (u, v) => { const d = v[0] * v[0] + v[1] * v[1]; return [(u[0] * v[0] + u[1] * v[1]) / d, (u[1] * v[0] - u[0] * v[1]) / d]; };
  const cExp = (u) => { const m = Math.exp(u[0]); return [m * Math.cos(u[1]), m * Math.sin(u[1])]; };
  const cAbs2 = (u) => u[0] * u[0] + u[1] * u[1];
  // Densidade de corrente (nota 07, Eq. J, ħ = m = 1): J = Im(ψ* ψ′).
  function current(psi, dpsi) { return psi[0] * dpsi[1] - psi[1] * dpsi[0]; }

  // Degrau (nota 07, seções "energia acima/abaixo do degrau"), onda incidente A = 1:
  //   x < 0: ψ = e^{ik₁x} + r e^{−ik₁x};  x ≥ 0: ψ = t e^{ik₂x} (E > V₀) ou t e^{−κx} (E ≤ V₀)
  //   r = (k₁ − k₂)/(k₁ + k₂), t = 2k₁/(k₁ + k₂);  abaixo: r = (k₁ − iκ)/(k₁ + iκ), t = 1 + r.
  function stepWave(E, V0) {
    const k1 = Math.sqrt(2 * E);
    let r, t, k2 = 0, kappa = 0, R, T;
    const above = E > V0;
    if (above) {
      k2 = Math.sqrt(2 * (E - V0));
      r = [(k1 - k2) / (k1 + k2), 0]; t = [2 * k1 / (k1 + k2), 0];
      R = r[0] * r[0]; T = 4 * k1 * k2 / (k1 + k2) ** 2;
    } else {
      kappa = Math.sqrt(2 * (V0 - E));
      r = cDiv([k1, -kappa], [k1, kappa]); t = [1 + r[0], r[1]];
      R = 1; T = 0;
    }
    const eL = (x) => cExp([0, k1 * x]), eLm = (x) => cExp([0, -k1 * x]);
    function eval_(x) {
      if (x < 0) {
        const p = cAdd(eL(x), cMul(r, eLm(x)));
        const d = cMul([0, k1], cSub(eL(x), cMul(r, eLm(x))));
        return [p, d];
      }
      if (above) { const e = cExp([0, k2 * x]); return [cMul(t, e), cMul([0, k2], cMul(t, e))]; }
      const e = Math.exp(-kappa * x); return [[t[0] * e, t[1] * e], [-kappa * t[0] * e, -kappa * t[1] * e]];
    }
    // componentes: incidente (x<0), refletida (x<0), transmitida/evanescente (x≥0)
    function parts(x) {
      if (x < 0) return { inc: eL(x), ref: cMul(r, eLm(x)) };
      return { trans: eval_(x)[0] };
    }
    return { k1, k2, kappa, r, t, R, T, above, parts, psi: (x) => eval_(x)[0], dpsi: (x) => eval_(x)[1] };
  }

  // Barreira retangular (nota 07, "Conexão na segunda e na primeira interface"):
  //   I: A e^{ikx} + B e^{−ikx};  II: C e^{κx} + D e^{−κx};  III: F e^{ikx}.
  // Parte-se de F e^{ika} e ψ′ = ik F e^{ika} em x = a, obtém-se C, D (Eqs. "C = ½(1 + ik/κ)…")
  // e depois A, B por continuidade em x = 0; tudo é dividido por A (A = 1).
  // Para E > V₀, κ → iq (continuação analítica da nota); em E = V₀, ψ é linear na região II.
  function barrierWave(E, V0, a) {
    const k = Math.sqrt(2 * E);
    const mode = Math.abs(E - V0) < 1e-9 ? "linear" : E < V0 ? "tunel" : "acima";
    const kap = mode === "tunel" ? [Math.sqrt(2 * (V0 - E)), 0] : mode === "acima" ? [0, Math.sqrt(2 * (E - V0))] : [0, 0];
    const P = cExp([0, k * a]), Q = cMul([0, k], P);          // F = 1: ψ(a), ψ′(a)
    function inside(x) {                                       // [ψ, ψ′] na região II, F = 1
      if (mode === "linear") return [cAdd(P, [Q[0] * (x - a), Q[1] * (x - a)]), Q];
      const qk = cDiv(Q, kap), sum = [(P[0] + qk[0]) / 2, (P[1] + qk[1]) / 2], dif = [(P[0] - qk[0]) / 2, (P[1] - qk[1]) / 2];
      const e1 = cExp([kap[0] * (x - a), kap[1] * (x - a)]), e2 = cExp([kap[0] * (a - x), kap[1] * (a - x)]);
      const t1 = cMul(sum, e1), t2 = cMul(dif, e2);
      return [cAdd(t1, t2), cMul(kap, cSub(t1, t2))];
    }
    const [p0, d0] = inside(0), ik = [0, k];
    const A0 = [ (p0[0] + cDiv(d0, ik)[0]) / 2, (p0[1] + cDiv(d0, ik)[1]) / 2 ];
    const B0 = [ (p0[0] - cDiv(d0, ik)[0]) / 2, (p0[1] - cDiv(d0, ik)[1]) / 2 ];
    const inv = (u) => cDiv(u, A0);
    const B = inv(B0), F = inv([1, 0]);
    function eval_(x) {
      let p, d;
      if (x < 0) {
        const ea = cExp([0, k * x]), eb = cExp([0, -k * x]);
        p = cAdd(cMul(A0, ea), cMul(B0, eb)); d = cMul(ik, cSub(cMul(A0, ea), cMul(B0, eb)));
      } else if (x <= a) { [p, d] = inside(x); }
      else { const e = cExp([0, k * x]); p = e; d = cMul(ik, e); }
      return [inv(p), inv(d)];
    }
    // componentes: incidente e refletida em I; transmitida em III
    function parts(x) {
      if (x < 0) return { inc: cDiv(cExp([0, k * x]), [1, 0]), ref: cMul(B, cExp([0, -k * x])) };
      if (x > a) return { trans: cMul(F, cExp([0, k * x])) };
      return {};
    }
    return { k, kappa: kap[0], q: kap[1], mode, B, F, R: cAbs2(B), T: cAbs2(F), parts, psi: (x) => eval_(x)[0], dpsi: (x) => eval_(x)[1] };
  }

  // ------------------------------------------------------------------ eixos e texto
  // Marcas "redondas" (passos 1, 2, 5 × 10ᵏ), incluindo 0 quando está no intervalo.
  // Casas decimais do rótulo: max(0, −floor(log10(step))).
  function niceTicks(min, max, target = 5) {
    const span = max - min, raw = span / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(12)));
    return { step, ticks: out, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) };
  }
  // Número em pt-BR: vírgula decimal, "−" tipográfico, sem separador de milhar,
  // e |v| menor que meia casa mostrada vira 0 (nunca "−0,0").
  function formatPt(x, n = 3) {
    if (!Number.isFinite(x)) return x === Infinity ? "∞" : x === -Infinity ? "−∞" : "—";
    let v = Number(x);
    if (Math.abs(v) < 0.5 * 10 ** -n) v = 0;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: n, maximumFractionDigits: n, useGrouping: false }).replace("-", "−");
  }
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const supText = (e) => String(e).replace("-", "⁻").replace(/\d/g, (d) => SUP[d]);
  // Notação científica com vírgula: 5,1×10⁻⁵.
  function sciPt(x, n = 1) {
    if (x === 0) return "0";
    if (!Number.isFinite(x)) return "—";
    let e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e;
    if (Math.abs(Number(m.toFixed(n))) >= 10) { m /= 10; e += 1; }
    return `${formatPt(m, n)}×10${supText(e)}`;
  }
  // `sig` algarismos significativos; científica para |x| < 10⁻³ ou ≥ 10⁵.
  function sigPt(x, sig = 3) {
    if (x === 0) return "0";
    if (!Number.isFinite(x)) return "—";
    const ax = Math.abs(x);
    if (ax < 1e-3 || ax >= 1e5) return sciPt(x, sig - 1);
    const dec = Math.max(0, sig - 1 - Math.floor(Math.log10(ax)));
    return Number(x.toFixed(dec)).toLocaleString("pt-BR", { maximumFractionDigits: dec, useGrouping: false }).replace("-", "−");
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

  return { kOf, step, barrierT, barrierTWide, resonanceEnergy, lnBarrierT, lnBarrierTWide,
    stepWave, barrierWave, current, niceTicks, formatPt, sciPt, sigPt,
    NUC, coulombMeV, turningPointFm, contactRadiusFm, rectangleExponent, gamowExponent, assaultRatePerS, alphaHalfLifeDays,
    acousticR, acousticT, TISSUES };
});

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DeltaPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Nucleo fisico da Aula 9 (fontes/aulas/aula_09_potenciais_delta.tex).
  // Estacoes 1-3: unidades reduzidas hbar = m = 1. Com isso kappa = alpha,
  // gamma = g, k = sqrt(2E) e E = k^2/2.
  // Estacao 4 (SI, sufixo EV/Nm/K no nome): hbar^2/(2 m_e) = 0,0381 eV nm^2,
  // k_B = 8,617e-5 eV/K, celula unitaria do Ge = 0,57 nm (exemplo resolvido da nota);
  // dados do Ge (E_g, N_c, N_v, eps_r) sao extensao, citados do Sze.

  const HBAR2_OVER_2ME_EV_NM2 = 0.0381;
  const KB_EV_PER_K = 8.617e-5;
  const GE_CELL_NM = 0.57;

  // ---------------------------------------------------------------- estado ligado (secao 3)
  // Eq. (kappa): kappa = m alpha / hbar^2  ->  kappa = alpha.
  function boundKappa(alpha) { return alpha; }
  // Eq. (Ebound): E = -m alpha^2 / (2 hbar^2)  ->  E = -alpha^2/2 = -kappa^2/2.
  function boundEnergy(alpha) { const k = boundKappa(alpha); return -k * k / 2; }
  // Eq. (psinorm): psi(x) = sqrt(kappa) e^{-kappa|x|}.
  function boundPsi(x, alpha) { const k = boundKappa(alpha); return Math.sqrt(k) * Math.exp(-k * Math.abs(x)); }
  // psi'(x) = -kappa sign(x) psi(x) para x != 0; em x = 0 a derivada nao existe
  // (devolve 0, o valor medio dos dois limites laterais; use psiPrimeJump).
  function boundPsiPrime(x, alpha) { const k = boundKappa(alpha); return -k * Math.sign(x) * boundPsi(x, alpha); }
  // Salto da derivada no estado ligado: psi'(0+) - psi'(0-) = -2 kappa psi(0) (secao 3).
  function psiPrimeJump(alpha) { return -2 * boundKappa(alpha) * boundPsi(0, alpha); }
  // Eq. (salto), potencial geral V = g delta(x): psi'(0+) - psi'(0-) = (2 m g / hbar^2) psi(0) = 2 g psi(0).
  function jumpCondition(g, psi0) { return 2 * g * psi0; }
  // Secao 3.2: <x^2> = 1/(2 kappa^2), sigma_x = 1/(sqrt2 kappa); <p^2> = hbar^2 kappa^2, sigma_p = hbar kappa.
  // (a nota usa sigma_x, sigma_p, forma de Griffiths; as Aulas 3 e 5 escreveram Delta x)
  function meanX2(alpha) { const k = boundKappa(alpha); return 1 / (2 * k * k); }
  function deltaX(alpha) { return 1 / (Math.SQRT2 * boundKappa(alpha)); }
  function deltaP(alpha) { return boundKappa(alpha); }
  // Produto sigma_x sigma_p = hbar/sqrt2 (independe de alpha).
  function uncertaintyProduct(alpha) { return deltaX(alpha) * deltaP(alpha); }

  // ---------------------------------------------------------------- espalhamento (secao 4)
  // k = sqrt(2 m E)/hbar = sqrt(2E).
  function kOf(E) { return Math.sqrt(2 * E); }
  // Eq. (rt): r = gamma/(ik - gamma), t = ik/(ik - gamma). Multiplicando por (-ik - gamma):
  //   r = (-gamma^2 - i gamma k)/(k^2 + gamma^2),  t = (k^2 - i gamma k)/(k^2 + gamma^2).
  // Eq. (RT): R = gamma^2/(k^2+gamma^2), T = k^2/(k^2+gamma^2). phaseT = arg t = -arctan(gamma/k).
  function scatter(E, gamma) {
    const k = kOf(E), D = k * k + gamma * gamma;
    const r = { re: -gamma * gamma / D, im: -gamma * k / D };
    const t = { re: k * k / D, im: -gamma * k / D };
    return { k, r, t, R: gamma * gamma / D, T: k * k / D, phaseT: Math.atan2(t.im, t.re), phaseR: Math.atan2(r.im, r.re) };
  }
  // Forma em energia: T = [1 + m g^2/(2 hbar^2 E)]^-1 = [1 + g^2/(2E)]^-1 (g = gamma com hbar = m = 1).
  // Para a delta atrativa, T = E/(E + |E_lig|): a energia de ligacao e a escala de T(E), sem pico.
  function transmissionOfEnergy(E, g) { return 1 / (1 + g * g / (2 * E)); }

  // ---------------------------------------------------------------- polo (secao 5)
  // Com gamma = -kappa0 (delta atrativa) o polo de t(k) = ik/(ik + kappa0) esta em k = i kappa0.
  function poleKappa(gamma) { return gamma < 0 ? -gamma : NaN; }
  // Continuacao analitica k = iq (q real): t(iq) = -q/(-q - gamma) = q/(q + gamma) = q/(q - kappa0).
  // |t|^2 = q^2/(q - kappa0)^2, que diverge em q = kappa0.
  function transmissionImaginaryAxis(q, gamma) { const d = q + gamma; return (q * q) / (d * d); }
  // Energia do polo: E = hbar^2 k^2/(2m) com k = i kappa0  ->  E = -kappa0^2/2.
  function poleEnergy(gamma) { const k0 = poleKappa(gamma); return -k0 * k0 / 2; }

  // ---------------------------------------------------------------- doador raso no HPGe (exemplo resolvido, SI)
  // kappa = sqrt(2 m* E_b)/hbar = sqrt(E_b / (hbar^2/2m*)), com hbar^2/2m* = 0,0381/(m*/m_e) eV nm^2.
  function kappaNmInv(EbEV, massRatio) { return Math.sqrt(EbEV / (HBAR2_OVER_2ME_EV_NM2 / massRatio)); }
  function deltaXNm(kappaNm) { return 1 / (Math.SQRT2 * kappaNm); }
  function cellsSpanned(deltaXnm) { return deltaXnm / GE_CELL_NM; }
  // Intensidade da delta equivalente: alpha = hbar^2 kappa / m* = 2 (hbar^2/2m_e) kappa / (m*/m_e).
  function alphaEVnm(kappaNm, massRatio) { return 2 * HBAR2_OVER_2ME_EV_NM2 * kappaNm / massRatio; }
  // psi(x) = sqrt(kappa) e^{-kappa|x|} com kappa em nm^-1 e x em nm (unidade nm^-1/2).
  function boundPsiNm(xNm, kappaNm) { return Math.sqrt(kappaNm) * Math.exp(-kappaNm * Math.abs(xNm)); }

  // Dados do germanio (Sze, Physics of Semiconductor Devices, apendice; 300 K). Extensao em relacao
  // a nota: a estatistica de ocupacao e o gap sao dados do semicondutor, nao saem da delta.
  const EG_GE_EV = 0.66, NC_GE_300 = 1.04e19, NV_GE_300 = 6.0e18, EPS_R_GE = 16;
  const E_CHARGE_C = 1.602177e-19, EPS0_F_PER_M = 8.8541878e-12;
  // Densidades efetivas de estados escalam com T^{3/2}; resultado em cm^-3.
  function Nc(TK) { return NC_GE_300 * Math.pow(TK / 300, 1.5); }
  function Nv(TK) { return NV_GE_300 * Math.pow(TK / 300, 1.5); }
  // Fator de Boltzmann do doador, e^{-E_b/k_BT}: so a escala E_b/k_BT. NAO e a fracao ionizada.
  function donorBoltzmann(EbEV, TK) { return Math.exp(-EbEV / (KB_EV_PER_K * TK)); }
  // Fracao de doadores ionizados n/N_D pela lei de acao de massas com degenerescencia g = 2:
  //   n^2/(N_D - n) = K,  K = (N_c/2) e^{-E_b/k_BT}   ->   n = 2 N_D / (1 + sqrt(1 + 4 N_D/K)).
  // (forma racionalizada, estavel quando N_D << K, que e o caso do HPGe: N_D ~ 1e10, K ~ 1e18 cm^-3)
  function ionizedDonorFraction(EbEV, TK, ND) {
    const K = 0.5 * Nc(TK) * donorBoltzmann(EbEV, TK);
    return 2 / (1 + Math.sqrt(1 + 4 * ND / K));
  }
  // Fracao neutra (N_D - n)/N_D = n^2/(K N_D), calculada sem a subtracao 1 - n/N_D (que perde os digitos).
  // Para N_D << K reduz-se a 2 N_D e^{+E_b/k_BT}/N_c.
  function neutralDonorFraction(EbEV, TK, ND) {
    const K = 0.5 * Nc(TK) * donorBoltzmann(EbEV, TK), f = ionizedDonorFraction(EbEV, TK, ND);
    return f * f * ND / K;
  }
  // Portadores intrinsecos n_i = sqrt(N_c N_v) e^{-E_g/2k_BT}, E_g fixo em 0,66 eV (cm^-3).
  // (a 77 K o gap real e 0,73 eV, Varshni: n_i so cai mais; o cruzamento n_i = N_D sobe de ~193 K para ~204 K)
  function intrinsicDensity(TK) { return Math.sqrt(Nc(TK) * Nv(TK)) * Math.exp(-EG_GE_EV / (2 * KB_EV_PER_K * TK)); }
  // Temperatura em que n_i(T) = N_D (bissecao em [77, 300] K; NaN se nao cruza na faixa).
  function intrinsicCrossoverK(ND) {
    if (intrinsicDensity(77) > ND || intrinsicDensity(300) < ND) return NaN;
    let lo = 77, hi = 300;
    for (let i = 0; i < 60; i += 1) { const m = (lo + hi) / 2; if (intrinsicDensity(m) < ND) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // Tensao de deplecao planar: V = e N_D d^2 / (2 eps_r eps0); N_D em cm^-3, d em cm, resultado em V.
  function depletionVoltage(ND, dCm) { return E_CHARGE_C * ND * 1e6 * (dCm * 1e-2) ** 2 / (2 * EPS_R_GE * EPS0_F_PER_M); }

  return {
    HBAR2_OVER_2ME_EV_NM2, KB_EV_PER_K, GE_CELL_NM,
    boundKappa, boundEnergy, boundPsi, boundPsiPrime, psiPrimeJump, jumpCondition,
    meanX2, deltaX, deltaP, uncertaintyProduct,
    kOf, scatter, transmissionOfEnergy,
    poleKappa, transmissionImaginaryAxis, poleEnergy,
    kappaNmInv, deltaXNm, cellsSpanned, alphaEVnm, boundPsiNm,
    EG_GE_EV, NC_GE_300, NV_GE_300, EPS_R_GE, Nc, Nv,
    donorBoltzmann, ionizedDonorFraction, neutralDonorFraction, intrinsicDensity, intrinsicCrossoverK, depletionVoltage,
  };
});

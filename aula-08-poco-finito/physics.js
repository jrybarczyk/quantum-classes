(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FiniteWellPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Poço quadrado finito, convenção simétrica da Aula 8 (eq. poco):
  //   V(x) = -V0 em |x| < a, 0 fora;  -V0 < E < 0.
  // Estações 1–3: unidades reduzidas. Energias em V0, comprimentos em a,
  //   z = k a,  z0 = a sqrt(2 m V0)/hbar,  (kappa a)^2 = z0^2 - z^2  (eq. circulo).
  // Estação 4 (ponto quântico): SI com sufixo no nome (…EV, …Nm).

  const HALF_PI = Math.PI / 2;

  // Lado direito das eqs. zpar/zimpar: sqrt(z0^2/z^2 - 1), 0 < z < z0.
  function rhsZ(z, z0) {
    if (z <= 0 || z >= z0) return z <= 0 ? Infinity : 0;
    return Math.sqrt((z0 * z0) / (z * z) - 1);
  }

  // Número de estados ligados (§ "Existência do estado fundamental"): um
  // estado para cada ramo j com j pi/2 < z0 (desigualdade estrita), logo
  // N = ceil(2 z0/pi). Em z0 = n pi/2 exato o candidato z = z0 tem kappa = 0,
  // E = 0 e psi constante fora do poço: não é normalizável, não é ligado
  // (parecer prof-formalismo, C1). Math.PI/HALF_PI é exatamente 2 em ponto
  // flutuante, então o múltiplo exato não precisa de caso especial.
  function countBoundStates(z0) {
    if (!(z0 > 0)) return 0;
    return Math.ceil(z0 / HALF_PI);
  }

  // Bisseção de f em [lo, hi] supondo f(lo) < 0 < f(hi).
  function bisect(f, lo, hi, iterations) {
    let a = lo, b = hi;
    for (let i = 0; i < (iterations || 120); i += 1) {
      const m = 0.5 * (a + b);
      if (f(m) < 0) a = m; else b = m;
    }
    return 0.5 * (a + b);
  }

  // Raízes z_n das equações de quantização (eqs. zpar e zimpar), uma por
  // ramo [j pi/2, (j+1) pi/2) com j < 2 z0/pi. Ramo par (j par):
  //   g(z) = tan z - sqrt(z0^2/z^2 - 1); ramo ímpar (j ímpar):
  //   g(z) = -cot z - sqrt(z0^2/z^2 - 1). Em cada ramo g vai de -inf a +inf
  //   (ou a um valor positivo em z = z0), logo há exatamente uma raiz.
  // Retorna [{ n, z, parity: "par" | "impar", branch }], n = 1, 2, ...
  function rootsZ(z0) {
    const out = [];
    if (!(z0 > 0)) return out;
    const N = countBoundStates(z0);
    for (let j = 0; j < N; j += 1) {
      const even = j % 2 === 0;
      const lo = j * HALF_PI, hi = Math.min((j + 1) * HALF_PI, z0);
      const g = even
        ? (z) => Math.tan(z) - rhsZ(z, z0)
        : (z) => -1 / Math.tan(z) - rhsZ(z, z0);
      const eps = 1e-12 * Math.max(1, hi);
      const z = bisect(g, lo + eps, hi - eps, 200);
      out.push({ n: j + 1, z, parity: even ? "par" : "impar", branch: j });
    }
    return out;
  }

  // Eq. En em unidades de V0: E_n + V0 = hbar^2 z^2/(2 m a^2) = V0 z^2/z0^2.
  // Retorna { aboveBottom: (E+V0)/V0, energy: E/V0 }.
  function energyFromZ(z, z0) {
    const aboveBottom = (z * z) / (z0 * z0);
    return { aboveBottom, energy: aboveBottom - 1 };
  }

  // kappa a = sqrt(z0^2 - z^2)  (eq. circulo em forma adimensional).
  function kappaA(z, z0) { return Math.sqrt(Math.max(0, z0 * z0 - z * z)); }

  // Normalização (eqs. normpar / normimpar), em unidades de a:
  //   par:   A_+^{-2}/a = 1 + sin(2z)/(2z) + cos^2 z/(kappa a)
  //   ímpar: A_-^{-2}/a = 1 - sin(2z)/(2z) + sin^2 z/(kappa a)
  // Retorna A^2 a (adimensional).
  function normalization(z, z0, parity) {
    const ka = kappaA(z, z0);
    const inv = parity === "par"
      ? 1 + Math.sin(2 * z) / (2 * z) + Math.cos(z) ** 2 / ka
      : 1 - Math.sin(2 * z) / (2 * z) + Math.sin(z) ** 2 / ka;
    return 1 / inv;
  }

  // P_fora (§ Normalização): par A_+^2 cos^2(ka)/kappa; ímpar A_-^2 sin^2(ka)/kappa.
  function outsideProbability(z, z0, parity) {
    const A2a = normalization(z, z0, parity), ka = kappaA(z, z0);
    return parity === "par" ? A2a * Math.cos(z) ** 2 / ka : A2a * Math.sin(z) ** 2 / ka;
  }

  // Forma fechada sobre as raízes (Griffiths 2.30; eq. normfechada e eq. pfora
  // propostas para a nota, parecer prof-formalismo A1): usando a própria
  // condição de quantização, os três termos de normpar/normimpar colapsam em
  //   A^{-2} = a + 1/kappa  e  P_fora = (z^2/z0^2)/(1 + kappa a),
  // para as duas paridades. Vale só nas energias permitidas.
  function normalizationClosed(z, z0) { return 1 / (1 + 1 / kappaA(z, z0)); }
  function outsideProbabilityClosed(z, z0) { return (z * z) / (z0 * z0) / (1 + kappaA(z, z0)); }

  // Fração da probabilidade contida na janela |x| <= xmax (em unidades de a),
  // por quadratura do ponto médio de |psi|^2. Usada só para a legenda da
  // estação 2 (a janela adaptativa); não é equação da nota.
  function probabilityInWindow(root, z0, xmax, steps) {
    const N = steps || 4000, h = 2 * xmax / N;
    let s = 0;
    for (let i = 0; i < N; i += 1) s += wavefunctionRoot(-xmax + (i + 0.5) * h, root, z0) ** 2 * h;
    return s;
  }

  // Autofunção normalizada (eqs. par e impar), x em unidades de a; retorna
  // psi * sqrt(a). Dentro: A cos(kx) ou A sin(kx); fora: A cos(ka) e^{-kappa(|x|-a)}
  // ou A sgn(x) sin(ka) e^{-kappa(|x|-a)}.
  function wavefunctionRoot(x, root, z0) {
    const A = Math.sqrt(normalization(root.z, z0, root.parity)), ka = kappaA(root.z, z0);
    const ax = Math.abs(x);
    if (root.parity === "par") {
      return ax <= 1 ? A * Math.cos(root.z * x) : A * Math.cos(root.z) * Math.exp(-ka * (ax - 1));
    }
    return ax <= 1 ? A * Math.sin(root.z * x) : A * Math.sign(x) * Math.sin(root.z) * Math.exp(-ka * (ax - 1));
  }
  function wavefunction(x, z0, n) {
    const roots = rootsZ(z0);
    if (n < 1 || n > roots.length) return NaN;
    return wavefunctionRoot(x, roots[n - 1], z0);
  }

  // Número de nós de psi_n: n - 1 (par: cos tem (n-1) zeros em |x|<a etc.).
  function nodeCount(n) { return n - 1; }

  // Limite do poço profundo (§ Limites físicos): k_n -> n pi/(2a), z_n -> n pi/2,
  // E_n + V0 -> n^2 pi^2 hbar^2/(8 m a^2) = V0 (n pi/2)^2 / z0^2.
  function infiniteWellZ(n) { return n * HALF_PI; }
  function infiniteWellAboveBottom(n, z0) { return infiniteWellZ(n) ** 2 / (z0 * z0); }

  // ----- Estação 4: ponto quântico de CdSe (exemplo resolvido da nota), SI -----
  const HBAR2_OVER_2ME_EV_NM2 = 0.0381; // hbar^2/(2 m_e) em eV nm^2
  // m* do elétron 0,13 m_e e do buraco 0,45 m_e (Brus/Ekimov; parecer
  // prof-fisica-medica, achado 7); E_gap = 1,74 eV a 300 K; hc = 1239,84 eV nm.
  const CDSE = { mStar: 0.13, mHole: 0.45, gapEV: 1.74, hc_eVnm: 1239.84 };

  // hbar^2/(2 m*) em eV nm^2.
  function hbar2Over2mEVnm2(mStar) { return HBAR2_OVER_2ME_EV_NM2 / mStar; }

  // z0 = a sqrt(2 m* V0)/hbar = a sqrt(V0 / (hbar^2/2m*)), a em nm, V0 em eV.
  function z0FromSI(aNm, V0EV, mStar) {
    return aNm * Math.sqrt(V0EV / hbar2Over2mEVnm2(mStar || CDSE.mStar));
  }

  // Níveis do ponto quântico: E_n + V0 = (hbar^2/2m*) z_n^2/a^2 em eV.
  function dotLevelsEV(diameterNm, V0EV, mStar) {
    const m = mStar || CDSE.mStar, aNm = diameterNm / 2, z0 = z0FromSI(aNm, V0EV, m);
    const c = hbar2Over2mEVnm2(m) / (aNm * aNm);
    const levels = rootsZ(z0).map((r) => ({ n: r.n, z: r.z, parity: r.parity, aboveBottomEV: c * r.z * r.z, energyEV: c * r.z * r.z - V0EV }));
    return { z0, aNm, levels, count: levels.length };
  }

  // Extensões (fora da nota; GUIA-DIDATICO, "extensão para o professor"):
  //  (a) buraco: a vaga na banda de valência, confinada no mesmo poço com
  //      m_h* = 0,45 m_e — é dotLevelsEV(D, V0, 0.45).
  //  (b) esfera de raio R = a, estado l = 0: u(r) = r R(r) obedece à equação 1D
  //      com u(0) = 0, isto é, ao ramo ÍMPAR da nota com a = R (Griffiths 2.29).
  //      O fundamental 3D é o n = 2 do poço 1D; só existe se z0 > pi/2.
  //      Retorna null quando não há estado ligado.
  function sphereGroundEV(diameterNm, V0EV, mStar) {
    const d = dotLevelsEV(diameterNm, V0EV, mStar);
    return d.count >= 2 ? d.levels[1].aboveBottomEV : null;
  }

  // Poço infinito de largura 2a (Aula 5): pi^2 hbar^2/(8 m* a^2) em eV.
  function infiniteWellGroundEV(aNm, mStar) {
    return hbar2Over2mEVnm2(mStar || CDSE.mStar) * Math.PI ** 2 / (4 * aNm * aNm);
  }

  // Fóton ≈ E_gap + confinamento do elétron (buraco e atração e–b ignorados,
  // como na nota). lambda = hc/E.
  function photonEV(confinementEV) { return CDSE.gapEV + confinementEV; }
  function lambdaNm(energyEV) { return CDSE.hc_eVnm / energyEV; }

  // Nome aproximado da cor para a faixa do visível.
  function colorName(lambda) {
    if (lambda < 380) return "ultravioleta";
    if (lambda < 450) return "violeta";
    if (lambda < 495) return "azul";
    if (lambda < 570) return "verde";
    if (lambda < 590) return "amarelo";
    if (lambda < 620) return "laranja";
    if (lambda <= 750) return "vermelho";
    return "infravermelho";
  }

  return {
    HALF_PI, rhsZ, countBoundStates, rootsZ, energyFromZ, kappaA, normalization,
    outsideProbability, normalizationClosed, outsideProbabilityClosed, probabilityInWindow,
    wavefunction, wavefunctionRoot, nodeCount, infiniteWellZ,
    infiniteWellAboveBottom, HBAR2_OVER_2ME_EV_NM2, CDSE, hbar2Over2mEVnm2, z0FromSI,
    dotLevelsEV, sphereGroundEV, infiniteWellGroundEV, photonEV, lambdaNm, colorName,
  };
});

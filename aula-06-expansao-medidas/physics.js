(function (root) {
  "use strict";
  // Núcleo físico da Aula 6 — postulado de medida (fontes/aulas/aula_06_postulado_expansao_medidas.tex).
  // Estações 1 a 4 em unidades reduzidas: largura do poço a = 1 (x em unidades de a) e
  // energias em E₁ (Eₙ = n²E₁); a estação 2 usa o exemplo resolvido da nota em eV
  // (funções com sufixo EV). A estação 5 (RM) usa SI, com o sufixo da unidade no nome
  // (kPerM, xM, gammaHzPerT, gradTPerM, tS). Nada de DOM aqui.
  const PI = Math.PI;

  // ------------------------------------------------------------------ utilidades
  // Regra do trapézio em [lo, hi] com n intervalos.
  function integrate(fn, lo, hi, n = 2000) {
    const h = (hi - lo) / n;
    let s = 0.5 * (fn(lo) + fn(hi));
    for (let i = 1; i < n; i += 1) s += fn(lo + i * h);
    return s * h;
  }
  // Autofunção do poço 0 < u < 1 (u = x/a): ψₙ(u) = √2 sen(nπu)  (Aula 5; nota 06, §3).
  const boxWave = (n, u) => (u <= 0 || u >= 1 ? 0 : Math.SQRT2 * Math.sin(n * PI * u));

  // ------------------------------------------------------------------ estação 1: H → x → H
  // Coeficiente da "caixa" de largura ε centrada em x₀ (nota 06, §3, Eq. eq:caixa), a = 1:
  //   cₙ = √(2/ε) · (2/nπ) · sen(nπx₀) · sen(nπε/2).
  // Válida se o intervalo [x₀ − ε/2, x₀ + ε/2] está dentro do poço.
  function boxCoefficient(n, x0, eps) {
    return Math.sqrt(2 / eps) * (2 / (n * PI)) * Math.sin(n * PI * x0) * Math.sin(n * PI * eps / 2);
  }
  // P(Eₙ) = |cₙ|² para n = 1..N (regra de Born, nota 06, Eq. eq:born).
  function boxProbabilities(x0, eps, N) {
    return Array.from({ length: N }, (_, i) => boxCoefficient(i + 1, x0, eps) ** 2);
  }
  // Menor n tal que Σ_{k ≤ n} P(E_k) ≥ alvo (a "cauda lenta" da nota: 0,98 em n ≈ 100 para ε = a/10).
  function boxTailIndex(x0, eps, target = 0.98, nMax = 200000) {
    let s = 0;
    for (let n = 1; n <= nMax; n += 1) {
      s += boxCoefficient(n, x0, eps) ** 2;
      if (s >= target) return n;
    }
    return NaN;
  }
  // P(E₁ | I) = ⟨ψ₁|P̂_I|ψ₁⟩ = ∫_I |ψ₁|² dx (nota 06, §3, depois de eq:caixa-prob), a = 1:
  //   ∫ 2 sen²(πu) du = u − sen(2πu)/(2π).
  function intervalProbability(n, x0, eps) {
    const F = (u) => u - Math.sin(2 * n * PI * u) / (2 * n * PI);
    return F(x0 + eps / 2) - F(x0 - eps / 2);
  }
  // Patamar para n ímpar e n ≪ a/ε: P(Eₙ) ≈ 2ε/a (nota 06, §3).
  const boxPlateau = (eps) => 2 * eps;

  // ------------------------------------------------------------------ estação 2: ⟨H⟩ e σ_H
  // Normaliza pesos |cₙ|² (Parseval, Σ|cₙ|² = 1, nota 06, Eq. eq:base).
  function normalize(weights) {
    const s = weights.reduce((acc, w) => acc + Math.max(0, w), 0);
    return s > 0 ? weights.map((w) => Math.max(0, w) / s) : weights.map((_, i) => (i === 0 ? 1 : 0));
  }
  // ⟨Q⟩ = Σ|cₙ|² qₙ (Eq. eq:media); σ_Q² = Σ|cₙ|² qₙ² − ⟨Q⟩² (Eq. eq:variancia).
  const expectation = (values, probs) => values.reduce((acc, q, i) => acc + q * probs[i], 0);
  function sigma(values, probs) {
    const m = expectation(values, probs);
    return Math.sqrt(Math.max(0, expectation(values.map((q) => q * q), probs) - m * m));
  }
  // Constantes SI (CODATA 2018) para o exemplo resolvido em eV.
  const SI = { h: 6.62607015e-34, hbar: 6.62607015e-34 / (2 * PI), me: 9.1093837015e-31, e: 1.602176634e-19 };
  // Eₙ = n²h²/(8mₑa²) em eV, a em nm (Aula 5; nota 06, exemplo "três níveis do poço de 0,5 nm").
  const levelEV = (n, aNm) => (SI.h * SI.h * n * n) / (8 * SI.me * (aNm * 1e-9) ** 2) / SI.e;
  // Período do batimento entre Eₘ e Eₙ: 2πħ/(Eₙ − Eₘ), em fs.
  const beatPeriodFs = (dEEV) => (2 * PI * SI.hbar) / (dEEV * SI.e) * 1e15;
  // Sorteio de um resultado k com probabilidade probs[k]; u ∈ [0,1) é o número aleatório.
  function sample(probs, u) {
    let r = u;
    for (let i = 0; i < probs.length; i += 1) { r -= probs[i]; if (r < 0) return i; }
    return probs.length - 1;
  }

  // ------------------------------------------------------------------ estação 3: degenerescência 2D
  // Poço quadrado de lado a: E_{nx,ny} = (nx² + ny²)E₁ (nota 06, §5, nota de dois minutos).
  const energy2D = (nx, ny) => nx * nx + ny * ny;
  // ψ_{nx,ny}(u,v) = ψ_nx(u) ψ_ny(v), com u = x/a, v = y/a.
  const wave2D = (nx, ny, u, v) => boxWave(nx, u) * boxWave(ny, v);
  // Estado real Ψ = Σ c_{nx,ny}|nx,ny⟩ (lista de {nx, ny, c}); normaliza as amplitudes.
  function normalizeState(terms) {
    const s = Math.sqrt(terms.reduce((acc, t) => acc + t.c * t.c, 0));
    if (!(s > 0)) return terms.map((t, i) => ({ ...t, c: i === 0 ? 1 : 0 }));
    return terms.map((t) => ({ ...t, c: t.c / s }));
  }
  // Regra de Born degenerada (Eq. eq:born-degen): P(q) = Σ_α |⟨q,α|Ψ⟩|² = ⟨Ψ|P̂_q|Ψ⟩,
  // e estado pós-medida P̂_qΨ/√P(q) (Eq. eq:colapso-degen). q em unidades de E₁.
  function measureDegenerate(terms, q) {
    const st = normalizeState(terms);
    const inSpace = st.filter((t) => energy2D(t.nx, t.ny) === q);
    const P = inSpace.reduce((acc, t) => acc + t.c * t.c, 0);
    const post = P > 0 ? inSpace.map((t) => ({ ...t, c: t.c / Math.sqrt(P) })) : [];
    return { P, post, degeneracy: inSpace.length };
  }
  // Densidade |Ψ(u,v)|² de um estado real dado por termos.
  const density2D = (terms, u, v) => terms.reduce((acc, t) => acc + t.c * wave2D(t.nx, t.ny, u, v), 0) ** 2;

  // ------------------------------------------------------------------ estação 4: paridade Π̂
  // Poço simétrico −1/2 < s < 1/2 (s = x/a; convenção da nota 06, §6):
  // ψₙ(s) = √2 sen(nπ(s + 1/2)), paridade (−1)^(n+1).
  const symWave = (n, s) => (Math.abs(s) >= 0.5 ? 0 : Math.SQRT2 * Math.sin(n * PI * (s + 0.5)));
  const parityOf = (n) => (n % 2 ? 1 : -1);
  // Estados de teste. "packet": pacote gaussiano de centro s₀ e largura σ (unidades de a),
  // multiplicado por cos(πs) para se anular nas paredes; "superposition": (ψ₁ + ψ₂)/√2 (nota).
  function parityState(kind, s0 = 0, w = 0.1) {
    if (kind === "superposition") return (s) => (symWave(1, s) + symWave(2, s)) / Math.SQRT2;
    const raw = (s) => (Math.abs(s) >= 0.5 ? 0 : Math.exp(-((s - s0) ** 2) / (4 * w * w)) * Math.cos(PI * s));
    const norm = Math.sqrt(integrate((s) => raw(s) ** 2, -0.5, 0.5, 4000));
    return (s) => raw(s) / norm;
  }
  // (Π̂ψ)(s) = ψ(−s); ψ_par = ½[ψ(s) + ψ(−s)], ψ_ímpar = ½[ψ(s) − ψ(−s)] (nota 06, §6);
  // P(±1) = ∫|ψ_par/ímpar|² ds = ⟨ψ|P̂_±|ψ⟩, P̂_± = ½(Î ± Π̂).
  function parityProbabilities(psi, n = 4000) {
    const even = (s) => 0.5 * (psi(s) + psi(-s)), odd = (s) => 0.5 * (psi(s) - psi(-s));
    const pPlus = integrate((s) => even(s) ** 2, -0.5, 0.5, n);
    const pMinus = integrate((s) => odd(s) ** 2, -0.5, 0.5, n);
    return { pPlus, pMinus, even, odd, mean: pPlus - pMinus };
  }
  // cₙ = ∫ψₙ ψ ds na base de energia do poço simétrico (Eq. eq:base).
  function symCoefficients(psi, N = 12, n = 4000) {
    return Array.from({ length: N }, (_, i) => integrate((s) => symWave(i + 1, s) * psi(s), -0.5, 0.5, n));
  }

  // ------------------------------------------------------------------ estação 5: espaço k da RM (SI)
  // k = (γ/2π) G t (nota 06, §7.2); γ/2π = 42,58 MHz/T para o ¹H.
  const GAMMA_BAR_H = 42.58e6; // Hz/T
  const kMaxPerM = (gradTPerM, tS, gammaHzPerT = GAMMA_BAR_H) => gammaHzPerT * gradTPerM * tS;
  // Menor detalhe reconstruído: Δx = 1/(2k_max) (nota 06, §7.2), em m.
  const resolutionM = (kPerM) => 1 / (2 * kPerM);
  // Integral seno Si(z) = ∫₀^z sen(t)/t dt: série de Taylor para |z| < 4 e as aproximações
  // racionais de Abramowitz & Stegun 5.2.38–5.2.39 (erro < 5×10⁻⁷) para |z| ≥ 4.
  // (Extensão: não está na nota; usada para truncar a expansão do objeto em |k| ≤ k_max.)
  function sineIntegral(z) {
    const sgn = z < 0 ? -1 : 1, x = Math.abs(z);
    if (x < 4) {
      let term = x, sum = x;
      for (let k = 1; k < 30; k += 1) {
        term *= -x * x / ((2 * k) * (2 * k + 1));
        sum += term / (2 * k + 1);
      }
      return sgn * sum;
    }
    const x2 = x * x;
    const f = (x2 ** 4 + 38.027264 * x2 ** 3 + 265.187033 * x2 ** 2 + 335.677320 * x2 + 38.102495) /
      (x * (x2 ** 4 + 40.021433 * x2 ** 3 + 322.624911 * x2 ** 2 + 570.236280 * x2 + 157.105423));
    const g = (x2 ** 4 + 42.242855 * x2 ** 3 + 302.757865 * x2 ** 2 + 352.018498 * x2 + 21.821899) /
      (x2 * (x2 ** 4 + 48.196927 * x2 ** 3 + 482.485984 * x2 ** 2 + 1114.978885 * x2 + 449.690326));
    return sgn * (PI / 2 - f * Math.cos(x) - g * Math.sin(x));
  }
  // Objeto 1D de teste: soma de faixas retangulares {centerM, widthM, height}.
  // Fantoma padrão: tecido de 16 mm (densidade 0,5) com duas estruturas de 0,5 mm
  // (densidade +0,5) separadas por sepM (centro a centro).
  function phantom(sepM) {
    return [
      { centerM: 0, widthM: 16e-3, height: 0.5 },
      { centerM: -sepM / 2, widthM: 0.5e-3, height: 0.5 },
      { centerM: sepM / 2, widthM: 0.5e-3, height: 0.5 },
    ];
  }
  const rho = (bands, xM) => bands.reduce((acc, b) => acc + (Math.abs(xM - b.centerM) < b.widthM / 2 ? b.height : 0), 0);
  // S(k) = ∫ρ(x) e^{−2πikx} dx (nota 06, §7.2). Para o fantoma simétrico S é real:
  // faixa → h·w·sen(πkw)/(πkw)·cos(2πkc).
  function signal(bands, kPerM) {
    return bands.reduce((acc, b) => {
      const z = PI * kPerM * b.widthM;
      const sinc = Math.abs(z) < 1e-12 ? 1 : Math.sin(z) / z;
      return acc + b.height * b.widthM * sinc * Math.cos(2 * PI * kPerM * b.centerM);
    }, 0);
  }
  // Reconstrução truncada: ρ_K(x) = ∫_{−K}^{K} S(k) e^{2πikx} dk. Para uma faixa retangular
  // de altura h, a integral fecha em h/π [Si(2πK(x − c + w/2)) − Si(2πK(x − c − w/2))].
  function reconstruct(bands, kMax, xM) {
    return bands.reduce((acc, b) => acc + (b.height / PI) *
      (sineIntegral(2 * PI * kMax * (xM - b.centerM + b.widthM / 2)) - sineIntegral(2 * PI * kMax * (xM - b.centerM - b.widthM / 2))), 0);
  }
  // Critério de "dois picos": a reconstrução em x = 0 (entre as estruturas) fica abaixo
  // do valor nos centros ±sep/2, isto é, há um vale (critério operacional da aplicação,
  // não da nota). dip = 1 − ρ_K(0)/ρ_K(sep/2).
  function resolved(bands, kMax, sepM) {
    const mid = reconstruct(bands, kMax, 0), peak = reconstruct(bands, kMax, sepM / 2);
    const dip = peak > 0 ? 1 - mid / peak : 0;
    return { dip, resolved: dip > 0 };
  }

  const api = {
    integrate, boxWave, boxCoefficient, boxProbabilities, boxTailIndex, intervalProbability, boxPlateau,
    normalize, expectation, sigma, SI, levelEV, beatPeriodFs, sample,
    energy2D, wave2D, normalizeState, measureDegenerate, density2D,
    symWave, parityOf, parityState, parityProbabilities, symCoefficients,
    GAMMA_BAR_H, kMaxPerM, resolutionM, sineIntegral, phantom, rho, signal, reconstruct, resolved,
  };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

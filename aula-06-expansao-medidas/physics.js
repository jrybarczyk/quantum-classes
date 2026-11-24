(function (root) {
  "use strict";
  // Núcleo físico da Aula 6 — postulado de medida (fontes/aulas/aula_06_postulado_expansao_medidas.tex).
  // Estação 1 ("Caixas e fichas"): mundo-brinquedo Quarteto, ħ = 1, energias em E₁ (Eₙ = n²E₁) e tempos em ħ/E₁.
  // Estações 2 a 5 em unidades reduzidas: largura do poço a = 1 (x em unidades de a) e energias em E₁;
  // a estação 3 (média e σ_H) usa o exemplo resolvido da nota em eV (funções com sufixo EV). A estação 6
  // (RM) usa SI, com o sufixo da unidade no nome (kPerM, xM, gammaHzPerT, gradTPerM, tS). Nada de DOM aqui.
  const PI = Math.PI;

  // ------------------------------------------------------------------ utilidades
  // Regra do trapézio em [lo, hi] com n intervalos.
  function integrate(fn, lo, hi, n = 2000) {
    const h = (hi - lo) / n;
    let s = 0.5 * (fn(lo) + fn(hi));
    for (let i = 1; i < n; i += 1) s += fn(lo + i * h);
    return s * h;
  }
  // Autofunção do poço 0 < u < 1 (u = x/a): ψₙ(u) = √2 sen(nπu)  (Aula 5).
  const boxWave = (n, u) => (u <= 0 || u >= 1 ? 0 : Math.SQRT2 * Math.sin(n * PI * u));

  // ------------------------------------------------------------------ estação 2: H → x → H
  // Coeficiente da "caixa" de largura ε centrada em x₀ (nota 06, §8 leitura dirigida, Eq. eq:caixa; uso em §3, H→x→H), a = 1:
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
  // P(E₁ | I) = ⟨ψ₁|P̂_I|ψ₁⟩ = ∫_I |ψ₁|² dx (nota 06, §3, H→x→H, depois de eq:caixa-prob), a = 1:
  //   ∫ 2 sen²(πu) du = u − sen(2πu)/(2π).
  function intervalProbability(n, x0, eps) {
    const F = (u) => u - Math.sin(2 * n * PI * u) / (2 * n * PI);
    return F(x0 + eps / 2) - F(x0 - eps / 2);
  }
  // Patamar para n ímpar e n ≪ a/ε: P(Eₙ) ≈ 2ε/a (nota 06, §3).
  const boxPlateau = (eps) => 2 * eps;

  // ------------------------------------------------------------------ estação 3: ⟨H⟩ e σ_H
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

  // ------------------------------------------------------------------ estação 4: degenerescência 2D
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

  // ------------------------------------------------------------------ estação 5: paridade Π̂
  // Poço simétrico −1/2 < s < 1/2 (s = x/a; convenção da nota 06, §5.1, paridade):
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
  // (Π̂ψ)(s) = ψ(−s); ψ_par = ½[ψ(s) + ψ(−s)], ψ_ímpar = ½[ψ(s) − ψ(−s)] (nota 06, §5.1);
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

  // ------------------------------------------------------------------ estação 6: espaço k da RM (SI)
  // k = (γ/2π) G t (nota 06, §8, leitura dirigida: espaço k da RM); γ/2π = 42,58 MHz/T para o ¹H.
  const GAMMA_BAR_H = 42.58e6; // Hz/T
  const kMaxPerM = (gradTPerM, tS, gammaHzPerT = GAMMA_BAR_H) => gammaHzPerT * gradTPerM * tS;
  // Menor detalhe reconstruído: Δx = 1/(2k_max) (nota 06, §8, leitura dirigida: espaço k da RM), em m.
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
  // S(k) = ∫ρ(x) e^{−2πikx} dx (nota 06, §8, leitura dirigida: espaço k da RM). Para o fantoma simétrico S é real:
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
  // Critério de "dois picos" (critério operacional da aplicação, não da nota), revisto em 2026-11-15:
  // a reconstrução tem de ter um máximo local interior perto de cada estrutura (em x ∈ [s/4, 3s/4],
  // e por simetria em −x) e um vale em x = 0 mais fundo que 2 % do pico: dip = 1 − ρ_K(0)/ρ_K(x_pico) > 0,02.
  // Antes bastava dip > 0, e o ripple de Gibbs da faixa de 16 mm dava "vale" espúrio num platô liso.
  function resolved(bands, kMax, sepM) {
    const lo = sepM / 4, hi = 3 * sepM / 4, n = 240, mid = reconstruct(bands, kMax, 0);
    const y = Array.from({ length: n + 1 }, (_, i) => reconstruct(bands, kMax, lo + (hi - lo) * i / n));
    let peak = -Infinity, hasPeak = false;
    for (let i = 1; i < n; i += 1) if (y[i] > y[i - 1] && y[i] >= y[i + 1] && y[i] > peak) { peak = y[i]; hasPeak = true; }
    const dip = hasPeak && peak > 0 ? 1 - mid / peak : 0;
    return { dip, resolved: hasPeak && dip > 0.02, hasPeak };
  }


  // ------------------------------------------------------------------ estação 1: caixas e fichas
  // Estrutura didática do desenho de 2026-11-17 (testes/relatorios/2026-11-17_caixas-fichas_desenho.md):
  // ficha = vetor de estado |ψ⟩ = Σ cₙ|n⟩ (um ponteiro de relógio por caixa); caixa = autoespaço de um jogo;
  // leitor = bra; porta = projetor; medida = regra de Born + estado pós-medida de Lüders P̂_q|ψ⟩/√P(q)
  // (nota 06, §2, Eq. eq:born, e §5, eq:born-degen; completeza: kit de caixas). EXTENSÃO em relação à nota:
  // o mundo-brinquedo Quarteto (tabela B escolhida a dedo), os "dois sacos", o jogo L/R de 4 caixas e o
  // sorteio por semente. Unidades reduzidas: ħ = 1, energias em E₁, tempos em ħ/E₁ (nunca misturar com eV).
  // Números complexos são pares [re, im].
  const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cConj = (a) => [a[0], -a[1]];
  const cAbs2 = (a) => a[0] * a[0] + a[1] * a[1];
  const cScale = (a, r) => [a[0] * r, a[1] * r];
  // e^{iθ} com θ em graus; múltiplos de 90° exatos (sem 6×10⁻¹⁷ nas leituras).
  function cisDeg(deg) {
    const d = ((deg % 360) + 360) % 360;
    if (d === 0) return [1, 0];
    if (d === 90) return [0, 1];
    if (d === 180) return [-1, 0];
    if (d === 270) return [0, -1];
    return [Math.cos(d * PI / 180), Math.sin(d * PI / 180)];
  }
  // Jogo A (energia): rótulos Eₙ = 1, 4, 9, 16 (em E₁).
  const QUARTETO = { E: [1, 4, 9, 16], names: ["A1", "A2", "A3", "A4"] };
  // Jogo B: tabela de conversão ⟨B_k|A_n⟩ (linhas B_k, colunas A_n), unitária e real (desenho; nota 06, §1 e §3).
  const TABELA_B = [[0.5, 0.5, 0.5, 0.5], [0.5, -0.5, 0.5, -0.5], [0.5, 0.5, -0.5, -0.5], [0.5, -0.5, -0.5, 0.5]];
  // Jogo L/R (esquerda/direita) entre as caixas de paridade: L₁₂ = (A1+A2)/√2, R₁₂ = (A1−A2)/√2, idem para A3, A4.
  // Com ψ₁ par e ψ₂ ímpar no poço simétrico, (ψ₁+ψ₂)/√2 fica de um lado NO MODELO de duas caixas (nota 06, §5.1); no poço real o peso de um lado é 0,924, não 1.
  const S2 = Math.SQRT1_2;
  const TABELA_LR = [[S2, S2, 0, 0], [S2, -S2, 0, 0], [0, 0, S2, S2], [0, 0, S2, -S2]];
  const TABELA_A = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const TABELAS = { A: TABELA_A, B: TABELA_B, LR: TABELA_LR };
  // Paridade do Quarteto: Π̂ rotula A1, A3 com +1 e A2, A4 com −1 (ψₙ tem paridade (−1)^(n+1); nota 06, §5.1).
  const PARIDADE_A = [1, -1, 1, -1];

  // Ficha a partir de módulos brutos e fases em graus: cₙ = mₙ e^{iφₙ}/√Σm². Ficha nula vira A1 (sem NaN).
  function fichaDePolar(mods, phasesDeg) {
    const norm = Math.sqrt(mods.reduce((a, m) => a + m * m, 0));
    if (!(norm > 0)) return mods.map((_, i) => (i === 0 ? [1, 0] : [0, 0]));
    return mods.map((m, i) => cScale(cisDeg(phasesDeg[i] || 0), m / norm));
  }
  const fichaNula = (mods) => !(mods.reduce((a, m) => a + m * m, 0) > 0);
  const fichaBase = (n, dim = 4) => Array.from({ length: dim }, (_, i) => (i === n ? [1, 0] : [0, 0]));
  const normaFicha = (c) => Math.sqrt(c.reduce((a, x) => a + cAbs2(x), 0));
  // Produto interno (bracket) ⟨a|b⟩ = Σ aₙ* bₙ: o leitor conjuga a fase (a "leitura pelo avesso do relógio").
  const bracket = (a, b) => a.reduce((acc, x, i) => cAdd(acc, cMul(cConj(x), b[i])), [0, 0]);
  // c'_k = Σ_n ⟨T_k|A_n⟩ cₙ (tabela de conversão: a completeza em uso, "1 inserido"); T real.
  const ampsTabela = (T, c) => T.map((row) => row.reduce((acc, t, n) => cAdd(acc, cScale(c[n], t)), [0, 0]));
  const probsJogo = (c, T = TABELA_A) => ampsTabela(T, c).map(cAbs2);
  const probsA = (c) => c.map(cAbs2);
  const ampsB = (c) => ampsTabela(TABELA_B, c);
  const probsB = (c) => probsJogo(c, TABELA_B);
  // Medida ideal no jogo de tabela T que deu a caixa k: P = |c'_k|², parte projetada P̂_k|ψ⟩ = c'_k|T_k⟩ (escrita nas
  // caixas A) e estado pós-medida P̂_k|ψ⟩/√P (regra de Lüders). Com T = A reduz a c_k|k⟩.
  function medirJogo(c, T, k) {
    const ck = ampsTabela(T, c)[k], Pk = cAbs2(ck);
    const proj = T[k].map((t) => cScale(ck, t));
    return { P: Pk, proj, post: Pk > 0 ? proj.map((x) => cScale(x, 1 / Math.sqrt(Pk))) : null };
  }
  // Sala = conjunto de caixas com o mesmo rótulo q (degenerescência g = nº de caixas): P(q) = Σ|cₙ|²,
  // pós-medida P̂_q|ψ⟩/√P(q) (nota 06, §5, Eq. eq:born-degen e eq:colapso-degen).
  function salasPorRotulo(rotulos) {
    const salas = [];
    rotulos.forEach((q, i) => {
      const s = salas.find((x) => x.q === q);
      if (s) s.indices.push(i); else salas.push({ q, indices: [i] });
    });
    return salas;
  }
  function medirSala(c, indices) {
    const P = indices.reduce((a, i) => a + cAbs2(c[i]), 0);
    const proj = c.map((x, i) => (indices.includes(i) ? x : [0, 0]));
    return { P, proj, post: P > 0 ? proj.map((x) => cScale(x, 1 / Math.sqrt(P))) : null };
  }
  // ⟨Q⟩ = Σ qₙ|cₙ|² e σ_Q (nota 06, §4); Q̂|ψ⟩ = ficha com cada ponteiro multiplicado pelo rótulo (não é o resultado).
  const mediaRotulos = (c, rotulos) => expectation(rotulos, probsA(c));
  const sigmaRotulos = (c, rotulos) => sigma(rotulos, probsA(c));
  const aplicaRotulos = (c, rotulos) => c.map((x, i) => cScale(x, rotulos[i]));
  // Paridade: ⟨Π⟩ = Σ πₙ|cₙ|², P(±) = ½(1 ± ⟨Π⟩), σ_Π² = 1 − ⟨Π⟩² (nota 06, §5.1; P̂_± = (1 ± Π̂)/2).
  const valorPi = (c) => expectation(PARIDADE_A, probsA(c));
  const probsPi = (c) => { const m = valorPi(c); return { mais: 0.5 * (1 + m), menos: 0.5 * (1 - m), mean: m, sigma: Math.sqrt(Math.max(0, 1 - m * m)) }; };
  // Esquerda/direita: P(L) = P(L₁₂) + P(L₃₄) (índices 0 e 2 das linhas de TABELA_LR).
  const probLado = (c) => { const p = probsJogo(c, TABELA_LR); return { esq: p[0] + p[2], dir: p[1] + p[3], p }; };
  // Medida de "lado": P̂_L = |L₁₂⟩⟨L₁₂| + |L₃₄⟩⟨L₃₄| (lado 0, esquerda) e P̂_R (lado 1): duas salas de g = 2 no jogo L/R.
  // Devolve P, a parte projetada P̂|ψ⟩ (escrita nas caixas A) e o estado pós-medida P̂|ψ⟩/√P.
  function medirLado(c, lado) {
    const cp = ampsTabela(TABELA_LR, c), idx = lado === 0 ? [0, 2] : [1, 3];
    const Pk = idx.reduce((a, k) => a + cAbs2(cp[k]), 0);
    const proj = c.map((_, n) => idx.reduce((acc, k) => cAdd(acc, cScale(cp[k], TABELA_LR[k][n])), [0, 0]));
    return { P: Pk, proj, post: Pk > 0 ? proj.map((x) => cScale(x, 1 / Math.sqrt(Pk))) : null };
  }
  // Mistura (saco de fichas): P(k) = Σ_i w_i P_i(k) no jogo de tabela T. Frequências de A iguais às da ficha
  // (½, ½, 0, 0); em B diferem (desenho, atividade A).
  function probsMistura(fichas, pesos, T) {
    const tot = pesos.reduce((a, w) => a + w, 0), out = [0, 0, 0, 0];
    fichas.forEach((f, i) => probsJogo(f, T).forEach((p, k) => { out[k] += (pesos[i] / tot) * p; }));
    return out;
  }
  const SACO_M = { fichas: [fichaBase(0), fichaBase(1)], pesos: [0.5, 0.5] };       // ½ de A1, ½ de A2 (mistura)
  const FICHA_S = fichaDePolar([1, 1, 0, 0], [0, 0, 0, 0]);                          // (A1 + A2)/√2 (estado puro)
  // Retira uma ficha do saco (peso wᵢ) e mede no jogo T; u1, u2 ∈ [0,1) são os números aleatórios.
  function sacoMedir(saco, T, u1, u2) {
    const i = sample(saco.pesos.map((w) => w / saco.pesos.reduce((a, x) => a + x, 0)), u1);
    return sample(probsJogo(saco.fichas[i], T), u2);
  }
  // Evolução: cₙ(t) = cₙ e^{−iEₙt/ħ} (nota 06, §3, fase e tempo; batimento = Aula 5). ħ = 1, E em E₁, t em ħ/E₁.
  function evoluir(c, E, t) { return c.map((x, n) => cMul(x, [Math.cos(E[n] * t), -Math.sin(E[n] * t)])); }
  // Batimento da ficha (1, e^{iφ₀}, 0, 0)/√2 no jogo B: com θ = φ₀ − (E₂ − E₁)t/ħ,
  // P_B = ((1 + cos θ)/4, (1 − cos θ)/4, (1 + cos θ)/4, (1 − cos θ)/4). E₂ − E₁ = 3E₁.
  const DELTA_E_BATIMENTO = 3;
  function probsBBatimento(phi0Deg, t) {
    const th = phi0Deg * PI / 180 - DELTA_E_BATIMENTO * t, a = (1 + Math.cos(th)) / 4, b = (1 - Math.cos(th)) / 4;
    return [a, b, a, b];
  }
  const TEMPO_MEIO_BATIMENTO = PI / DELTA_E_BATIMENTO;   // t = πħ/(3E₁): (½,0,½,0) → (0,½,0,½)
  // Caixas contínuas (p em unidades de p₀): |Φ(p)|² = 1/(2p₀) em [0, 2p₀] (nota 06, §6, caixas contínuas; exemplo de |Φ|² uniforme da aplicação).
  const densidadeUniforme = (p) => (p >= 0 && p <= 2 ? 0.5 : 0);
  // P(p₁ < p < p₂) = ∫|Φ|² dp (área, não altura), com o intervalo recortado em [0, 2].
  const probIntervalo = (p1, p2) => Math.max(0, Math.min(2, Math.max(p1, p2)) - Math.max(0, Math.min(p1, p2))) * 0.5;
  // Histograma teórico de caixas de largura dp: P = |Φ|² · (largura) por caixa; a última pode ser mais estreita.
  function histogramaUniforme(dp) {
    const n = Math.max(1, Math.ceil(2 / dp - 1e-9)), out = [];
    for (let i = 0; i < n; i += 1) { const lo = i * dp, hi = Math.min(2, (i + 1) * dp); out.push({ lo, hi, P: (hi - lo) * 0.5 }); }
    return out;
  }
  const MEDIA_UNIFORME = 1, SIGMA_UNIFORME = 1 / Math.sqrt(3);   // ⟨p⟩ = p₀ e σ_p = p₀/√3
  // Gerador pseudoaleatório com semente (mulberry32): testes e ?seed= da aplicação reprodutíveis.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ------------------------------------------------------------------ eixos
  // Marcas "redondas" (passos 1, 2, 5 × 10ᵏ), incluindo 0 quando está no intervalo.
  // Casas decimais do rótulo: max(0, −floor(log10(step))).
  function niceTicks(min, max, target = 5) {
    const span = max - min, raw = span / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(12)));
    return { step, ticks: out, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) };
  }

  // Número em pt-BR: vírgula decimal, "−" tipográfico, sem separador de milhar e sem zero negativo
  // (|v| menor que meia casa mostrada vira 0). Mesma convenção das aplicações 4, 5 e 7.
  function formatPt(x, digits = 2) {
    const v = Number(x);
    if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "—";
    const z = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
    return z.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).replace(/-/g, "−");
  }

  const api = {
    niceTicks, formatPt,
    integrate, boxWave, boxCoefficient, boxProbabilities, boxTailIndex, intervalProbability, boxPlateau,
    normalize, expectation, sigma, SI, levelEV, beatPeriodFs, sample,
    energy2D, wave2D, normalizeState, measureDegenerate, density2D,
    symWave, parityOf, parityState, parityProbabilities, symCoefficients,
    GAMMA_BAR_H, kMaxPerM, resolutionM, sineIntegral, phantom, rho, signal, reconstruct, resolved,
    cAdd, cMul, cConj, cAbs2, cScale, cisDeg, QUARTETO, TABELA_A, TABELA_B, TABELA_LR, TABELAS, PARIDADE_A,
    fichaDePolar, fichaNula, fichaBase, normaFicha, bracket, ampsTabela, ampsB, probsJogo, probsA, probsB, medirJogo,
    salasPorRotulo, medirSala, mediaRotulos, sigmaRotulos, aplicaRotulos, valorPi, probsPi, probLado, medirLado,
    probsMistura, SACO_M, FICHA_S, sacoMedir, evoluir, DELTA_E_BATIMENTO, probsBBatimento, TEMPO_MEIO_BATIMENTO,
    densidadeUniforme, probIntervalo, histogramaUniforme, MEDIA_UNIFORME, SIGMA_UNIFORME, mulberry32,
  };
  root.QuantumPhysics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

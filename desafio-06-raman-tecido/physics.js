/* Desafio 6 — Que tecido é este? Raman (Aulas 1, 5 e 10).
 *
 * Núcleo físico e "regras do jogo" em funções puras (sem DOM), testadas por tests.js.
 * Origem das fórmulas:
 *   - oscilador harmônico, ν̃ = (1/2πc)√(k/μ), ħω = hcν̃, estado fundamental e população térmica
 *     P₁/P₀ = e<sup>−ħω/k_BT</sup>: Aula 10, exemplo "a ligação C=O na espectroscopia vibracional de tecidos"
 *     (ħω = 0,2108 eV em 1700 cm⁻¹; massa reduzida do C–O, 6,86 u). P₁/P₀ = e^(−0,2108/0,02673) = 3,76×10⁻⁴ ≈ 3,8×10⁻⁴ a 37 °C:
 *     a nota escreve 3,7×10⁻⁴ por truncar k_BT = 0,0267 eV (a corrigir na nota); este desafio usa 3,8×10⁻⁴ (3,76) em todo lugar;
 *   - energia do fóton E = hc/λ e janela óptica do tecido (≈ 650–950 nm): Aulas 1 e 5;
 *   - Raman Stokes e anti-Stokes: o fóton perde ou ganha ħω de uma ligação (Aula 10 e Aula 1, fóton).
 * EXTENSÕES (não estão nas notas; declaradas no GUIA-DIDATICO.md): razão anti-Stokes/Stokes com o fator
 * de frequência, perfis lorentzianos, bandas e amplitudes SINTÉTICAS por tecido, fluorescência, detectores
 * (QE do CCD de Si e do InGaAs), aquecimento do ponto iluminado e limite de dano, cor e estado da amostra (SINTÉTICOS).
 * Segurança: a exposição máxima permitida (MPE) em pele, ANSI Z136.1, CW (t > 10 s), é MPE = 0,2·10^(0,002(λ−700)) W/cm² em 700–1050 nm
 * (0,30 W/cm² a 785 nm), 0,2 W/cm² a 532 nm e 1,0 W/cm² em 1050–1400 nm (valores de memória: conferir na norma). Os 200 mW do app são de bancada.
 * Razão anti-Stokes/Stokes: I_AS/I_S = ((ν₀+ν̃)/(ν₀−ν̃))^n · e<sup>−hcν̃/k_BT</sup>, com n = 4 para a POTÊNCIA espalhada
 * (dipolo oscilante: ∝ ω⁴) e n = 3 para a CONTAGEM DE FÓTONS (potência/ħω_espalhado). O detector deste desafio
 * (CCD e InGaAs) conta fotoelétrons, logo n = 3 (EXPOENTE_FOTONS). A razão não depende da seção de choque:
 * ela é a mesma para Stokes e anti-Stokes da mesma ligação e se cancela.
 * Unidades: deslocamento Raman ν̃ em cm⁻¹; comprimento de onda em nm; temperatura em K (T_C em °C na
 * interface do aluno, sufixo C); energia em eV; potência em mW; tempo em s; aquecimento em K.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ constantes
  const C2_CM_K = 1.438777;            // cm·K, segunda constante de radiação, hc/k_B
  const EV_PER_CM = 1.239841984e-4;    // eV por cm⁻¹, hc
  const KB_EV = 8.617333262e-5;        // eV/K
  const C_CM_S = 2.99792458e10;        // cm/s
  const U_KG = 1.66053907e-27;         // kg
  const EXP_FOTONS = 3, EXP_POTENCIA = 4;
  const DS = 4, S_MIN = -1300, NPX = 1250;   // grade do espectrômetro: −1300 a 3700 cm⁻¹, 4 cm⁻¹ por pixel
  const NOTCH = 120;                   // cm⁻¹: o filtro notch bloqueia |ν̃| < 120 (Rayleigh)
  const NU_REF = 11739;                // cm⁻¹: referência da escala de sinal (785 nm, ν̃ = 1000)
  const KR = 5000;                      // contagens por mW·s de uma banda de amplitude 1 em NU_REF, QE = 1 (sintético)
  const KF = 1.2e4;                    // escala da fluorescência (sintético)
  const T_LIM_K = 5;                   // limite de aquecimento do ponto iluminado
  const TAU_TH = 4;                    // s, constante de tempo térmica
  const HINT_PENALTY = [4, 6, 10], REDELIVERY_COST = 5;
  const hintCost = (n) => HINT_PENALTY.slice(0, Math.max(0, Math.min(3, n || 0))).reduce((a, b) => a + b, 0);

  // ------------------------------------------------------------------ gerador pseudoaleatório
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash3(a, b, c) {
    let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B) ^ Math.imul((c | 0) + 0x165667B1, 0xC2B2AE35)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D); h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function normal(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
  function poisson(lambda, rng) {
    if (!(lambda > 0)) return 0;
    if (lambda < 30) { const L = Math.exp(-lambda); let k = 0, p = 1; do { k += 1; p *= rng(); } while (p > L); return k - 1; }
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng)));
  }

  // ------------------------------------------------------------------ oscilador harmônico (Aula 10)
  const reducedMassU = (m1, m2) => m1 * m2 / (m1 + m2);                                  // u
  // ν̃ = (1/2πc)√(k/μ): k em N/m, μ em u → cm⁻¹
  const wavenumberFromK = (kNm, muU) => Math.sqrt(kNm / (muU * U_KG)) / (2 * Math.PI * C_CM_S);
  const forceConstantFromWavenumber = (nu, muU) => muU * U_KG * Math.pow(2 * Math.PI * C_CM_S * nu, 2);   // N/m
  const hbarOmegaEV = (nu) => EV_PER_CM * nu;                                              // ħω = hcν̃
  const kelvin = (TC) => TC + 273.15;
  const thermalPopulationRatio = (nu, TK) => Math.exp(-hbarOmegaEV(nu) / (KB_EV * TK));   // P₁/P₀
  const zeroPointEV = (nu) => 0.5 * hbarOmegaEV(nu);
  // Razão de contagens anti-Stokes/Stokes de uma banda de deslocamento ν̃ (laser ν₀, ambos em cm⁻¹)
  function asOverS(nu0, nu, TK, n = EXP_FOTONS) { return Math.pow((nu0 + nu) / (nu0 - nu), n) * Math.exp(-C2_CM_K * nu / TK); }
  // Inversão: T = (hcν̃/k)/(n·ln((ν₀+ν̃)/(ν₀−ν̃)) − ln R), em K
  function temperatureFromRatio(nu0, nu, ratio, n = EXP_FOTONS) {
    const d = n * Math.log((nu0 + nu) / (nu0 - nu)) - Math.log(ratio);
    return d > 0 ? C2_CM_K * nu / d : NaN;
  }
  const wavenumberOfLaser = (nm) => 1e7 / nm;
  const stokesWavelengthNm = (nm, shift) => 1e7 / (1e7 / nm - shift);

  // ------------------------------------------------------------------ bandas e tecidos (SINTÉTICOS)
  // Posições próximas dos valores de literatura (bandas didáticas); larguras e amplitudes relativas inventadas.
  const BANDS = [
    { id: "dna785", s: 785, w: 16, key: "dna", name: "DNA/RNA: O–P–O e anel de pirimidina" },
    { id: "col855", s: 855, w: 14, key: "col", name: "colágeno: prolina (C–C)" },
    { id: "col938", s: 938, w: 16, key: "col", name: "colágeno: C–C do esqueleto" },
    { id: "po4", s: 960, w: 10, key: "po4", name: "fosfato PO₄ (hidroxiapatita)" },
    { id: "phe", s: 1004, w: 10, key: "phe", name: "fenilalanina: respiração do anel" },
    { id: "lip1066", s: 1066, w: 20, key: "ccs", name: "lipídio: C–C (esqueleto)" },
    { id: "lip1260", s: 1260, w: 20, key: "ch1260", name: "lipídio: =C–H (deformação)" },
    { id: "ch2tw", s: 1300, w: 22, key: "ch2tw", name: "CH₂ (twist)" },
    { id: "ch2sc", s: 1440, w: 26, key: "ch2sc", name: "CH₂ (tesoura)" },
    { id: "dna1578", s: 1578, w: 18, key: "dna", name: "DNA: anéis de guanina e adenina" },
    { id: "wbend", s: 1640, w: 70, key: "water", name: "água: flexão H–O–H" },
    { id: "cc", s: 1655, w: 12, key: "cc", name: "C=C lipídica" },
    { id: "amide", s: 1668, w: 34, key: "amide", name: "amida I (C=O, proteína)" },
    { id: "ester", s: 1743, w: 14, key: "ester", name: "C=O de éster (lipídio)" },
    { id: "ch2s", s: 2850, w: 22, key: "chst", name: "C–H: estiramento do CH₂" },
    { id: "ch2a", s: 2885, w: 24, key: "chst", name: "C–H: estiramento assimétrico do CH₂" },
    { id: "ch3", s: 2935, w: 30, key: "chst", name: "C–H: estiramento do CH₃ e de proteínas" },
    { id: "woh", s: 3400, w: 320, key: "water", name: "água: estiramento O–H (banda larga)" },
  ];
  const ASSIGN = [
    ["phe", "Fenilalanina (anel aromático)"], ["amide", "Amida I (C=O, proteína)"], ["ch2sc", "CH₂ (tesoura)"], ["ch2tw", "CH₂ (twist)"],
    ["cc", "C=C lipídica"], ["ccs", "C–C lipídica (esqueleto)"], ["ch1260", "=C–H lipídica"], ["ester", "C=O de éster"], ["col", "Colágeno (prolina, C–C)"], ["po4", "Fosfato PO₄ (hidroxiapatita)"],
    ["dna", "DNA/RNA (bases, O–P–O)"], ["chst", "C–H (estiramento)"], ["water", "Água (O–H)"],
  ];
  const assignName = (key) => (ASSIGN.find((a) => a[0] === key) || [0, "?"])[1];
  // amplitude relativa de cada banda por tecido (a mais forte da região 600–1800 vale ≈ 1) e fluorescência φ (sintéticos).
  // O tecido `hifluor` tem φ = 2,5 (≈ 800× o do adiposo): valor INVENTADO para criar o caso "fluorescência domina em 785 nm"; não há base de literatura
  // para atribuí-lo a um tipo de tecido (a autofluorescência sobe com pigmento e fixação). A assinatura de DNA/RNA (785 e 1578 cm⁻¹) é uma propriedade separada da fluorescência.
  const TISSUES = {
    fat: { name: "tecido adiposo", phi: 0.003, amp: { ch2sc: 1.0, lip1066: 0.65, ch2tw: 0.55, lip1260: 0.35, cc: 0.6, ester: 0.3, ch2s: 2.6, ch2a: 1.6, ch3: 1.1, wbend: 0.02, woh: 0.03, amide: 0.05 } },
    muscle: { name: "músculo", phi: 0.012, amp: { amide: 0.9, ch2sc: 0.7, phe: 0.55, ch2tw: 0.5, ch2s: 0.8, ch3: 1.8, ch2a: 0.9, wbend: 0.12, woh: 0.8, col855: 0.05, lip1066: 0.1 } },
    bone: { name: "osso (hidroxiapatita)", phi: 0.006, amp: { po4: 1.0, amide: 0.6, ch2sc: 0.5, phe: 0.3, col938: 0.2, col855: 0.15, ch3: 0.6, ch2s: 0.3, wbend: 0.03, woh: 0.08 } },
    skin: { name: "pele (colágeno)", phi: 0.015, amp: { col855: 0.65, col938: 0.5, amide: 0.85, ch2sc: 0.8, phe: 0.35, ch2tw: 0.45, ch3: 1.6, ch2s: 0.9, ch2a: 0.7, wbend: 0.1, woh: 0.55, lip1066: 0.2 } },
    hifluor: { name: "tecido com autofluorescência alta (pigmentado ou fixado)", phi: 2.5, amp: { dna785: 0.75, dna1578: 0.6, phe: 0.65, amide: 0.7, ch2sc: 0.75, ch2tw: 0.35, ch3: 1.7, ch2s: 0.7, wbend: 0.14, woh: 0.95 } },
  };
  const TISSUE_KEYS = Object.keys(TISSUES);
  const bandById = (id) => BANDS.find((b) => b.id === id);
  const bandAmp = (tissue, id) => (TISSUES[tissue].amp[id] || 0);
  const STRONG = 0.5;                  // banda "forte": amplitude ≥ 0,5
  const strongBands = (tissue) => BANDS.filter((b) => bandAmp(tissue, b.id) >= STRONG);

  // ------------------------------------------------------------------ lasers, detectores e aquecimento
  const LASERS = {
    532: { nm: 532, detector: "si", fluor: 1, kPerMW: 0.15, absorb: "hemoglobina e melanina absorvem forte" },
    785: { nm: 785, detector: "si", fluor: 0.06, kPerMW: 0.015, absorb: "janela óptica do tecido" },
    1064: { nm: 1064, detector: "ingaas", fluor: 0.0005, kPerMW: 0.06, absorb: "a água começa a absorver" },
  };
  const LASER_KEYS = ["532", "785", "1064"];
  const OPTICAL_WINDOW = [650, 950];                                       // nm (Aula 5)
  // eficiência quântica: CCD de Si (corta perto de 1000 nm) e InGaAs (≈ 900–1620 nm); parametrizações didáticas
  const qeSi = (nm) => 0.9 / (1 + Math.exp((nm - 960) / 30));
  const qeInGaAs = (nm) => 0.7 / (1 + Math.exp((900 - nm) / 25)) / (1 + Math.exp((nm - 1620) / 20));
  const qeOf = (laser, nm) => (LASERS[laser].detector === "si" ? qeSi(nm) : qeInGaAs(nm));
  const DARK = { si: { rate: 0.02, read: 6 }, ingaas: { rate: 25, read: 25 } };   // contagens/pixel/s e ruído de leitura
  // Aquecimento do ponto iluminado: ΔT = c·P·(1 − e^(−t/τ)), com c em K/mW. O coeficiente c depende da COR da amostra
  // (absorção do pigmento em 532 nm) e do laser; é informação do caso (a cor é visível ao aluno e a tabela está na tela).
  // Valores SINTÉTICOS (ordens de grandeza). `k` é o coeficiente do caso: { 532, 785, 1064 } em K/mW.
  const COLORS = ["clara", "média", "escura"];
  const K_TABLE = { clara: { 532: 0.015, 785: 0.010, 1064: 0.06 }, "média": { 532: 0.04, 785: 0.015, 1064: 0.06 }, escura: { 532: 0.30, 785: 0.020, 1064: 0.06 } };
  const kOf = (laser, caso) => (caso && caso.k ? caso.k[laser] : LASERS[laser].kPerMW);
  const heatingSteadyK = (laser, powerMW, k = LASERS[laser].kPerMW) => k * powerMW;
  const heatingAt = (laser, powerMW, t, k = LASERS[laser].kPerMW) => heatingSteadyK(laser, powerMW, k) * (1 - Math.exp(-t / TAU_TH));

  // ------------------------------------------------------------------ níveis
  const LEVELS = {
    1: { name: "Nível 1 · guiado", budgetS: 180, thermalMax: 4, powerCap: 200, tolT: 2, hints: true, runS: 20 },
    2: { name: "Nível 2 · livre", budgetS: 120, thermalMax: 3, powerCap: 200, tolT: 1, hints: false, runS: 20 },
    3: { name: "Nível 3 · desafio", budgetS: 72, thermalMax: 2, powerCap: 150, tolT: 1, hints: false, runS: 12 },
  };
  const TOL_T_BASE = 5;                 // K
  // Acerto 50 = restrições 40 (tecido 10, temperatura 10, laser 10, bandas 10) + valores calculados 10 (λ Stokes de 3400 cm⁻¹ 5, P₁/P₀ 5).
  const WEIGHTS = { tissue: 10, temperature: 10, laser: 10, bands: 10, lambda: 5, pop: 5, prediction: 10, efficiency: 15, c1: 8, c2: 8, c3: 9 };
  // Previsão (10 pontos): uma escolha qualitativa (4) e depois o número (6). Qualitativa: razão anti-Stokes/Stokes da banda de 1004 cm⁻¹ a 37 °C
  // com 785 nm (1,5×10⁻² = perto de 1 %). Numérica: P₁/P₀ do C=O (1700 cm⁻¹) a 37 °C em unidades de 10⁻⁴ (3,76, tolerância de 0,15 década).
  const PREDICTION = { nu: 1700, TC: 37, truthE4: 1e4 * thermalPopulationRatio(1700, kelvin(37)), tolLog: 0.15,                       // em unidades de 10⁻⁴
    qual: { band: 1004, laser: 785, TC: 37, correct: "c", options: [["a", "perto de 50 %"], ["b", "perto de 10 %"], ["c", "perto de 1 %"], ["d", "bem abaixo de 0,1 %"]], truth: asOverS(1e7 / 785, 1004, kelvin(37)) } };
  const PRED_PARTS = { qual: 4, num: 6 };                                              // soma = WEIGHTS.prediction
  const efficiencyFactor = (f) => (f <= 0.5 ? 1 : Math.max(0, (1 - f) / 0.5));         // regra comum dos seis desafios

  // ------------------------------------------------------------------ espectro esperado (contagens por pixel)
  const pixShift = (i) => S_MIN + DS * (i + 0.5);                          // centro do pixel
  const pixelOf = (s) => (s - S_MIN) / DS - 0.5;
  const lorentz = (s, s0, gam) => (gam / (2 * Math.PI)) / ((s - s0) * (s - s0) + gam * gam / 4);
  // fluorescência: contínua e suave em ν̃; ∝ φ·f_λ·P·t·QE(λ)
  function fluorPerPixel(caso, laser, powerMW, tSec, s) {
    const nu0 = wavenumberOfLaser(LASERS[laser].nm), nm = 1e7 / (nu0 - s);
    if (!(nm > 0) || nm > 3000) return 0;
    return caso.phi * LASERS[laser].fluor * KF * powerMW * tSec * qeOf(laser, nm) * Math.exp(-Math.max(s, 0) / 6000);
  }
  // Taxa esperada (por segundo) em cada pixel, para o ponto iluminado à temperatura T_K e potência P.
  function expectedPerSecond(caso, laser, powerMW, TK, burnt) {
    const L = LASERS[laser], nu0 = wavenumberOfLaser(L.nm), out = new Float64Array(NPX);
    const amp = burnt ? 0.04 : 1, fl = burnt ? 40 : 1;
    for (const b of BANDS) {
      const A = bandAmp(caso.tissue, b.id) * amp; if (A <= 0) continue;
      for (const side of [1, -1]) {
        const s0 = side * b.s; if (s0 < S_MIN || s0 > S_MIN + DS * NPX) continue;
        const nuPhoton = side > 0 ? nu0 - b.s : nu0 + b.s, nm = 1e7 / nuPhoton; if (!(nm > 0 && nm < 3000)) continue;
        const area = A * KR * powerMW * Math.pow(nuPhoton / NU_REF, EXP_FOTONS) * qeOf(laser, nm) * (side > 0 ? 1 : Math.exp(-C2_CM_K * b.s / TK));
        const i0 = Math.max(0, Math.floor(pixelOf(s0 - 12 * b.w))), i1 = Math.min(NPX - 1, Math.ceil(pixelOf(s0 + 12 * b.w)));
        for (let i = i0; i <= i1; i += 1) out[i] += area * lorentz(pixShift(i), s0, b.w) * DS;
      }
    }
    for (let i = 0; i < NPX; i += 1) out[i] += fl * fluorPerPixel(caso, laser, powerMW, 1, pixShift(i));
    for (let i = 0; i < NPX; i += 1) if (Math.abs(pixShift(i)) < NOTCH) out[i] = 0;
    return out;
  }
  const darkPerSecond = (laser) => DARK[LASERS[laser].detector].rate;
  const readNoise = (laser) => DARK[LASERS[laser].detector].read;

  // ------------------------------------------------------------------ caso escondido por semente
  // σ_T esperado (analítico, sem sorteio) de uma medida (laser, P, t) usando a banda `b` com ROI ±1,5Γ.
  function expectedSigmaT(caso, laser, powerMW, tSec, band) {
    const TK = kelvin(caso.TC) + heatingAt(laser, powerMW, tSec, kOf(laser, caso)) * 0.8, nu0 = wavenumberOfLaser(LASERS[laser].nm);
    const A = bandAmp(caso.tissue, band.id); if (A <= 0 || band.s > 1090) return Infinity;
    const nuS = nu0 - band.s, nuAS = nu0 + band.s, nmS = 1e7 / nuS, nmAS = 1e7 / nuAS;
    const frac = (2 / Math.PI) * Math.atan(3);                                      // fração da lorentziana em ±1,5Γ
    const aS = A * KR * powerMW * tSec * Math.pow(nuS / NU_REF, EXP_FOTONS) * qeOf(laser, nmS) * frac;
    const aAS = A * KR * powerMW * tSec * Math.pow(nuAS / NU_REF, EXP_FOTONS) * qeOf(laser, nmAS) * Math.exp(-C2_CM_K * band.s / TK) * frac;
    const n = Math.ceil(3 * band.w / DS) + 1, bgAS = fluorPerPixel(caso, laser, powerMW, tSec, -band.s) + darkPerSecond(laser) * tSec;
    const varPix = bgAS + readNoise(laser) ** 2, m = 4;
    const varAS = aAS + n * varPix * (1 + n / (2 * m)), varS = aS + n * (fluorPerPixel(caso, laser, powerMW, tSec, band.s) + darkPerSecond(laser) * tSec + readNoise(laser) ** 2) * (1 + n / (2 * m));
    const sigLn = Math.sqrt(varS / (aS * aS) + varAS / (aAS * aAS)), x = C2_CM_K * band.s / TK;
    return (TK / x) * sigLn;
  }
  const safePower = (laser, level, caso) => Math.min(LEVELS[level].powerCap, Math.floor((0.6 * T_LIM_K) / kOf(laser, caso)));   // ΔT estacionário = 3 K (60 % do limite)
  // figura de mérito de um laser: σ_T combinado (média ponderada por 1/σ²) das bandas de ν̃ < 1090 cm⁻¹ do tecido
  function bestSigmaT(caso, laser) {
    const P = safePower(laser, caso.level, caso), t = LEVELS[caso.level].runS;
    let inv = 0, best = Infinity, bandBest = null;
    for (const b of BANDS) { const s = expectedSigmaT(caso, laser, P, t, b); if (Number.isFinite(s)) { inv += 1 / (s * s); if (s < best) { best = s; bandBest = b; } } }
    return { sigma: inv > 0 ? 1 / Math.sqrt(inv) : Infinity, band: bandBest, power: P, t };
  }
  const SIGMA_MAX_K = 2.0;                                                            // o melhor laser deve medir T com σ_T ≤ 2,0 K (o caso tem solução)
  const TC_MIN = 30, TC_MAX = 42;                                                     // °C: temperaturas fisiológicas (tecido ex vivo ou superficial)
  const COLOR_P = [0.68, 0.88];                                                         // sorteio da cor: clara < 0,68 ≤ média < 0,88 ≤ escura (ajustado para que 785 nm vença em menos de 50 % das sementes)
  // estado da amostra: multiplica a autofluorescência φ do tecido (SINTÉTICO). A fixação em formalina e o envelhecimento a aumentam;
  // a pré-exposição ao laser (fotobranqueamento) a reduz. É informação oculta do caso, revelada na auditoria.
  const CONDITIONS = { fotobranqueado: { factor: 0.05, label: "fotobranqueada (pré-exposta ao laser)" }, fresco: { factor: 1, label: "fresca" }, fixado: { factor: 30, label: "fixada (formalina) ou envelhecida" } };
  const CONDITION_P = [0.36, 0.66];                                                   // fotobranqueado < 0,36 ≤ fresco < 0,66 ≤ fixado
  function rankLasers(caso) {
    const res = LASER_KEYS.map((l) => ({ l, ...bestSigmaT(caso, l) })).sort((a, b) => a.sigma - b.sigma);
    caso.bestLaser = res[0].l; caso.sigmaBest = res[0].sigma; caso.bestBand = res[0].band.id; caso.sigmaByLaser = Object.fromEntries(res.map((x) => [x.l, x.sigma]));
    caso.powerByLaser = Object.fromEntries(LASER_KEYS.map((l) => [l, safePower(l, caso.level, caso)]));
    return res;
  }
  // Caso por semente: tecido, temperatura fisiológica (30–42 °C), COR da amostra (clara, média, escura: decide o aquecimento por mW e a
  // potência segura em cada laser) e ESTADO (fotobranqueado, fresco, fixado: decide a fluorescência φ = φ_tecido × fator × jitter).
  // O melhor laser sai do σ_T esperado de cada um na sua potência segura; a razão (cor e estado) aparece na auditoria.
  function makeCase(seed, level = 2) {
    seed = Math.trunc(Number(seed)) || 1; level = [1, 2, 3].includes(level) ? level : 2;
    const r = mulberry32(seed * 2246822519 + 7);
    r(); r(); r();
    const tissue = TISSUE_KEYS[Math.floor(r() * TISSUE_KEYS.length)];
    const TC = Math.round((TC_MIN + (TC_MAX - TC_MIN) * r()) * 10) / 10;
    let caso = null;
    for (let t = 0; t < 60; t += 1) {                                                   // re-sorteia cor, estado e jitter até a melhor escolha de laser ter folga (σ₂/σ₁ ≥ 1,3) e solução (σ₁ ≤ 2,0 K)
      const u = r(), color = u < COLOR_P[0] ? "clara" : u < COLOR_P[1] ? "média" : "escura";
      const v = r(), condition = v < CONDITION_P[0] ? "fotobranqueado" : v < CONDITION_P[1] ? "fresco" : "fixado";
      const jitter = Math.exp((r() - 0.5) * 0.8);                                       // ×(0,67 a 1,5)
      caso = { seed, level, tissue, TC, color, k: { ...K_TABLE[color] }, condition, phi: TISSUES[tissue].phi * CONDITIONS[condition].factor * jitter };
      const res = rankLasers(caso);
      if (res[1].sigma / res[0].sigma >= 1.3 && res[0].sigma <= SIGMA_MAX_K) return caso;
    }
    return caso;
  }

  // ------------------------------------------------------------------ bancada: medidas, tempo e dano térmico
  class Lab {
    constructor(caso) { this.caso = caso; this.params = LEVELS[caso.level]; this.runs = []; this.timeS = 0; this.thermal = 0; this.burnt = false; }
    get budgetS() { return this.params.budgetS; }
    get thermalMax() { return this.params.thermalMax; }
    costFraction() { return Math.min(1, Math.max(this.timeS / this.params.budgetS, this.thermal / this.params.thermalMax)); }
    canStart(seconds) { return this.timeS + seconds <= this.params.budgetS + 1e-9 && this.thermal < this.params.thermalMax; }
    // inicia uma medida; os segundos são acrescentados por step()
    begin(laser, powerMW, tSec) {
      laser = String(laser); powerMW = Math.max(1, Math.min(this.params.powerCap, Number(powerMW)));
      tSec = Math.max(1, Math.min(60, Math.round(tSec)));
      const run = { id: this.runs.length + 1, laser, powerMW, tSec, done: 0, counts: new Float32Array(NPX), dTsum: 0, dTmax: 0, burnt: this.burnt, dTmean: 0 };
      this.runs.push(run); return run;
    }
    step(run) {
      if (run.done >= run.tSec || this.timeS + 1 > this.params.budgetS + 1e-9) return false;
      const k = run.done + 0.5, dT = heatingAt(run.laser, run.powerMW, k + 0.5, kOf(run.laser, this.caso));
      if (dT > T_LIM_K && !this.burnt) { this.burnt = true; run.burnt = true; }
      if (this.burnt) run.burnt = true;
      const TK = kelvin(this.caso.TC) + dT, lam = expectedPerSecond(this.caso, run.laser, run.powerMW, TK, this.burnt);
      const rng = mulberry32(hash3(this.caso.seed * 17 + this.caso.level, run.id * 7 + Number(run.laser), run.done)), rd = readNoise(run.laser), dk = darkPerSecond(run.laser);
      for (let i = 0; i < NPX; i += 1) { if (Math.abs(pixShift(i)) < NOTCH) continue; run.counts[i] += poisson(lam[i] + dk, rng) + rd * normal(rng) / Math.sqrt(run.tSec); }
      run.done += 1; run.dTsum += dT; run.dTmax = Math.max(run.dTmax, dT); run.dTmean = run.dTsum / run.done;
      this.timeS += 1; this.thermal += Math.pow(dT / T_LIM_K, 2) / 10;
      if (this.burnt) this.thermal = this.params.thermalMax;
      return true;
    }
    run(laser, powerMW, tSec) { const r = this.begin(laser, powerMW, tSec); while (this.step(r)) { /* acumula */ } return r; }
  }

  // ------------------------------------------------------------------ análise (ferramentas oferecidas ao aluno)
  const sumPx = (counts, lo, hi) => { let s = 0; for (let i = Math.max(0, lo); i <= Math.min(NPX - 1, hi); i += 1) s += counts[i]; return s; };
  // ROI em deslocamento Raman [s1, s2] (cm⁻¹): líquida com fundo trapezoidal de m pixels de cada lado e σ² = G + (n/2m)²(B_e + B_d)
  function roiNet(counts, s1, s2, m = 4, readVar = 0) {
    let lo = Math.round(pixelOf(Math.min(s1, s2))), hi = Math.round(pixelOf(Math.max(s1, s2)));
    lo = Math.max(m, lo); hi = Math.min(NPX - 1 - m, Math.max(lo, hi));
    const n = hi - lo + 1, gross = sumPx(counts, lo, hi), bl = sumPx(counts, lo - m, lo - 1), br = sumPx(counts, hi + 1, hi + m);
    const base = n * (bl + br) / (2 * m), net = gross - base;
    const varBase = Math.pow(n / (2 * m), 2) * (Math.max(0, bl + br) + 2 * m * readVar);
    return { lo, hi, n, gross, base, net, sigma: Math.sqrt(Math.max(1, Math.max(0, gross) + n * readVar + varBase)), s1: pixShift(lo) - DS / 2, s2: pixShift(hi) + DS / 2 };
  }
  // Temperatura pelo par Stokes/anti-Stokes da banda em ν̃ (janela ±w cm⁻¹); devolve T em K com σ por propagação
  // `qeCorrect`: divide a razão pela resposta espectral relativa QE(λ_AS)/QE(λ_S) (correção de intensidade do espectrômetro)
  function thermometer(counts, laser, shift, w, readVar = 0, qeCorrect = true) {
    const nu0 = wavenumberOfLaser(LASERS[laser].nm), S = roiNet(counts, shift - w, shift + w, 4, readVar), A = roiNet(counts, -shift - w, -shift + w, 4, readVar);
    if (!(S.net > 0) || !(A.net > 0)) return { S, A, ratio: NaN, TK: NaN, sigmaK: NaN };
    const qeRel = qeCorrect ? qeOf(laser, 1e7 / (nu0 + shift)) / qeOf(laser, 1e7 / (nu0 - shift)) : 1;
    const ratio = A.net / S.net / qeRel, TK = temperatureFromRatio(nu0, shift, ratio), sLn = Math.sqrt((S.sigma / S.net) ** 2 + (A.sigma / A.net) ** 2);
    const x = C2_CM_K * shift / TK;
    return { S, A, ratio, TK, sigmaK: (TK / x) * sLn, corr: Math.pow((nu0 + shift) / (nu0 - shift), EXP_FOTONS), qeRel, expected: Math.exp(-x) };
  }
  // picos do lado Stokes (suavizado, máximos locais acima do fundo); devolve [{s, height, net}] por significância
  function findBands(counts, laser, opts = {}) {
    const minSig = opts.minSig || 8, out = [], sm = new Float64Array(NPX);
    for (let i = 0; i < NPX; i += 1) { let a = 0, c = 0; for (let j = -1; j <= 1; j += 1) { const k = i + j; if (k >= 0 && k < NPX) { a += counts[k]; c += 1; } } sm[i] = a / c; }
    for (let i = Math.ceil(pixelOf(NOTCH + 40)); i < NPX - 12; i += 1) {
      if (!(sm[i] >= sm[i - 1] && sm[i] > sm[i + 1])) continue;
      let ok = true; for (let j = -5; j <= 5; j += 1) if (i + j >= 0 && i + j < NPX && sm[i + j] > sm[i]) ok = false;
      if (!ok) continue;
      const net = roiNet(counts, pixShift(i) - 18, pixShift(i) + 18, 5);
      if (net.net / net.sigma >= minSig) out.push({ s: pixShift(i), net: net.net, sig: net.net / net.sigma });
    }
    return out;
  }

  // ------------------------------------------------------------------ pontuação (0–100), mesmo sistema dos outros desafios
  const partial = (rel) => Math.max(0, 1 - 4 * Math.max(0, rel));                       // restrição: zero a 25 % de violação
  const valueCredit = (got, want, tol) => (Number.isFinite(got) && want > 0 ? Math.max(0, Math.min(1, 1 - (Math.abs(got - want) / want - tol) / (3 * tol))) : 0);
  const numScore = (err, tol) => Math.max(0, Math.min(1, (3 - Math.abs(err) / tol) / 2));
  const tempTol = (level) => TOL_T_BASE * LEVELS[level].tolT;
  const BAND_TOL = 18;                                      // cm⁻¹ na posição de cada banda
  // Opções de mesmo tamanho e mesma forma; cada distrator é uma concepção alternativa verdadeira (banda depende do laser, da temperatura ou da seção
  // de choque; anti-Stokes fraca por seção de choque, notch ou detector; laser escolhido só pelo sinal, só pela fluorescência ou pela ressonância).
  // A ordem muda por semente e a cada entrega; a letra exibida é a da posição.
  const CONCEPTS = [
    { id: "c1", weight: WEIGHTS.c1, question: "O que determina a posição (deslocamento Raman) de uma banda de uma ligação?",
      options: [["a", "a constante de força e a massa reduzida da ligação, ν̃ = (1/2πc)√(k/μ) do oscilador, sem depender do laser"],
        ["b", "a energia do fóton do laser, porque a banda aparece sempre a uma fração fixa de ν₀ abaixo da linha de excitação usada"],
        ["c", "a temperatura da amostra, porque ν̃ cresce com a população dos estados excitados da ligação, ħω comparável a k_BT"],
        ["d", "a seção de choque Raman da ligação, que desloca a banda quando a polarizabilidade da ligação é maior no tecido"]], correct: "a",
      lesson: "Aula 10: ν̃ = (1/2πc)√(k/μ); a banda não muda com o laser" },
    { id: "c2", weight: WEIGHTS.c2, question: "Por que a anti-Stokes é mais fraca e o Raman de tecido é essencialmente Stokes?",
      options: [["a", "a anti-Stokes parte do estado n = 1, de população e^(−ħω/k_BT) muito menor que 1, e a razão não depende da seção de choque"],
        ["b", "a seção de choque anti-Stokes é menor que a Stokes, porque o fóton espalhado precisa ganhar ħω de uma ligação do tecido"],
        ["c", "o filtro notch bloqueia boa parte do lado anti-Stokes, porque ele fica em energias próximas da linha do laser (Rayleigh)"],
        ["d", "a QE do detector cai no lado anti-Stokes, porque os fótons espalhados têm comprimento de onda menor que o do laser incidente"]], correct: "a",
      lesson: "Aula 10: P₁/P₀ = e<sup>−ħω/k_BT</sup> ≈ 3,8×10⁻⁴ para C=O a 37 °C" },
    { id: "c3", weight: WEIGHTS.c3, question: "O que decide a escolha do laser para este tecido?",
      options: [["a", "o σ_T medido de cada laser na potência segura, que junta fluorescência, detector, sinal ∝ (ν₀−ν̃)³ e limite térmico"],
        ["b", "o sinal: o laser de menor comprimento de onda dá mais fótons Raman por mW, ∝ (ν₀−ν̃)³, e por isso sempre vence no tecido"],
        ["c", "a fluorescência: o laser de maior comprimento de onda tem menos fundo de fluorescência, e por isso sempre vence no tecido"],
        ["d", "a ressonância: o laser cuja energia coincide com a da ligação excita mais a banda, e por isso sempre vence no tecido"]], correct: "a",
      lesson: "Aulas 1 e 5: janela óptica (≈ 650–950 nm), energia do fóton hc/λ, e o compromisso medido" },
  ];
  // ordem das opções determinística por semente e por entrega (delivery = 0, 1, 2, …)
  function shuffledOptions(seed, concept, delivery = 0) {
    const r = mulberry32(hash3(seed, concept.id.charCodeAt(1), 11 + 1013 * Math.max(0, delivery | 0))), a = concept.options.slice();
    for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const conceptsCorrect = (input) => CONCEPTS.filter((c) => input[c.id] === c.correct).length;
  // input: { tissue, temperatureC, laser, bands:[{shift, key}×3], predQual, prediction (em 10⁻⁴), c1,c2,c3, hintsUsed, deliveries }
  function scoreBands(caso, rows) {
    const strong = strongBands(caso.tissue), used = new Set(); let pts = 0; const notes = [];
    for (const row of rows || []) {
      if (!row || !Number.isFinite(row.shift)) { notes.push("em branco"); continue; }
      const b = strong.filter((x) => !used.has(x.id)).sort((a, c) => Math.abs(a.s - row.shift) - Math.abs(c.s - row.shift))[0];
      if (b && Math.abs(b.s - row.shift) <= BAND_TOL) { used.add(b.id); pts += row.key === b.key ? 1 : 0.5; notes.push(`${fmtShift(row.shift)}: ${row.key === b.key ? "certa" : "posição certa, atribuição errada"}`); }
      else notes.push(`${fmtShift(row.shift)}: não é uma banda forte deste tecido`);
    }
    return { frac: pts / 3, notes };
  }
  const fmtShift = (x) => formatPt(x, 0);
  // input: { tissue, temperatureC, laser, bands:[{shift,key}×3], lambdaNm, popE4, prediction (10⁻⁴), c1,c2,c3, hintsUsed (0–3), deliveries }
  function score(caso, lab, input) {
    const L = LEVELS[caso.level], parts = [], add = (key, label, pts, max, note, reveals = false) => parts.push({ key, label, pts, max, note, reveals, group: key[0] === "c" && key.length === 2 ? "concept" : "item" });   // reveals: a nota deixa o valor verdadeiro à mostra
    const ok = (a, b) => (a === b ? 1 : 0), tolF = L.tolT;
    add("tissue", "Tecido", WEIGHTS.tissue * ok(input.tissue, caso.tissue), WEIGHTS.tissue, input.tissue === caso.tissue ? "correto" : "incorreto");
    // temperatura: erro em kelvin (invariante de escala: °C e K têm a mesma diferença); violação relativa a T em kelvin ABSOLUTO (caso.TC + 273,15)
    let sT = 0, eT = null; if (Number.isFinite(input.temperatureC)) { eT = input.temperatureC - caso.TC; sT = partial(Math.max(0, Math.abs(eT) - tempTol(caso.level)) / kelvin(caso.TC)); }
    add("temperature", "Temperatura do tecido", WEIGHTS.temperature * sT, WEIGHTS.temperature, eT === null ? "sem resposta" : `diferença de ${eT >= 0 ? "+" : "−"}${formatPt(Math.abs(eT), 1)} K (tolerância ${formatPt(tempTol(caso.level), 1)} K)`, true);
    add("laser", "Laser escolhido", WEIGHTS.laser * ok(String(input.laser), caso.bestLaser), WEIGHTS.laser, String(input.laser) === caso.bestLaser ? "correto" : "incorreto");
    const sb = scoreBands(caso, input.bands); add("bands", "Três bandas atribuídas", WEIGHTS.bands * sb.frac, WEIGHTS.bands, sb.notes.join("; "));
    const mission = parts.reduce((s, p) => s + p.pts, 0), missionMax = parts.reduce((s, p) => s + p.max, 0);
    const lamTruth = LASERS[String(input.laser)] ? stokesWavelengthNm(LASERS[String(input.laser)].nm, 3400) : NaN;
    const popTruth = Number.isFinite(input.temperatureC) ? 1e4 * thermalPopulationRatio(1700, kelvin(input.temperatureC)) : NaN;
    const lc = valueCredit(input.lambdaNm, lamTruth, 0.02 * tolF), pc = valueCredit(input.popE4, popTruth, 0.08 * tolF);
    add("lambda", "Valor calculado: λ Stokes de 3400 cm⁻¹ (nm)", WEIGHTS.lambda * lc, WEIGHTS.lambda, `tolerância ${formatPt(2 * tolF, 1)} %`);
    add("pop", "Valor calculado: P₁/P₀ do C=O na sua temperatura (10⁻⁴)", WEIGHTS.pop * pc, WEIGHTS.pop, `tolerância ${formatPt(8 * tolF, 1)} %`);
    let sP = 0; if (Number.isFinite(input.prediction) && input.prediction > 0) sP = numScore(Math.log10(input.prediction / PREDICTION.truthE4), PREDICTION.tolLog);
    const sQ = input.predQual === PREDICTION.qual.correct ? 1 : 0;
    add("prediction", "Previsão registrada (escolha qualitativa e P₁/P₀ numérico)", PRED_PARTS.qual * sQ + PRED_PARTS.num * sP, WEIGHTS.prediction, Number.isFinite(input.prediction) ? `escolha qualitativa ${sQ ? "certa" : "errada"}; P₁/P₀ previsto ${formatPt(input.prediction, 1)}×10⁻⁴` : "não registrada");
    const f = lab.costFraction(), frac = missionMax > 0 ? mission / missionMax : 0, eff = efficiencyFactor(f);
    add("efficiency", "Eficiência do orçamento", WEIGHTS.efficiency * eff * frac * frac, WEIGHTS.efficiency, lab.burnt ? "a amostra queimou: orçamento esgotado" : `uso do orçamento ${formatPt(f * 100, 0)} %, ponderado pela missão cumprida ao quadrado`);
    CONCEPTS.forEach((c) => add(c.id, `Conceito: ${c.question}`, c.weight * ok(input[c.id], c.correct), c.weight, input[c.id] === c.correct ? "correto" : "incorreto"));
    const sub = parts.reduce((s, p) => s + p.pts, 0), acerto = mission + lc * WEIGHTS.lambda + pc * WEIGHTS.pop;
    const hints = L.hints ? hintCost(input.hintsUsed) : 0, redo = REDELIVERY_COST * Math.max(0, (input.deliveries || 1) - 1);
    return { total: Math.max(0, Math.min(100, sub - hints - redo)), parts, acerto, mission: frac, hintsPenalty: hints, redeliveryPenalty: redo, costFraction: f, deliveries: input.deliveries || 1, conceptsRight: conceptsCorrect(input) };
  }

  // ------------------------------------------------------------------ solver de referência
  // Mede os três lasers, escolhe o de menor σ_T medido (sem queimar), estima T, identifica o tecido e três bandas.
  function solveReference(caso) {
    const lab = new Lab(caso), L = LEVELS[caso.level], runs = {};
    for (const l of LASER_KEYS) runs[l] = lab.run(l, safePower(l, caso.level, caso), L.runS);
    // temperatura: média ponderada (1/σ²) das bandas de ν̃ < 1090 cm⁻¹ com razão medida, por laser; o melhor laser é o de menor σ combinado
    const combine = (l) => {
      let wsum = 0, tsum = 0, best = null;
      for (const b of BANDS) {
        if (b.s > 1090) continue;
        const th = thermometer(runs[l].counts, l, b.s, 1.5 * b.w, readNoise(l) ** 2);
        if (Number.isFinite(th.TK) && th.sigmaK > 0) { if (!best || th.sigmaK < best) best = th.sigmaK; }
      }
      for (const b of BANDS) {
        if (b.s > 1090) continue;
        const th = thermometer(runs[l].counts, l, b.s, 1.5 * b.w, readNoise(l) ** 2);
        if (Number.isFinite(th.TK) && th.sigmaK > 0 && th.sigmaK < 4 * best) { wsum += 1 / (th.sigmaK ** 2); tsum += th.TK / (th.sigmaK ** 2); }
      }
      return wsum > 0 ? { TK: tsum / wsum, sigmaK: 1 / Math.sqrt(wsum) } : null;
    };
    const ev = Object.fromEntries(LASER_KEYS.map((l) => [l, combine(l)]));
    const ranked = LASER_KEYS.filter((l) => ev[l] && !runs[l].burnt).sort((a, b) => ev[a].sigmaK - ev[b].sigmaK);
    const laser = ranked[0] || "785";
    const TC = ev[laser] ? ev[laser].TK - 273.15 - runs[laser].dTmean : NaN;
    // tecido: amplitude estimada de cada banda (ROI líquida ÷ resposta do laser) comparada às assinaturas
    const run = runs[laser], nu0 = wavenumberOfLaser(LASERS[laser].nm), est = {};
    for (const b of BANDS) {
      const nuS = nu0 - b.s, nm = 1e7 / nuS; if (!(nm > 0)) continue;
      const resp = KR * run.powerMW * run.tSec * Math.pow(nuS / NU_REF, EXP_FOTONS) * qeOf(laser, nm);
      if (resp < 2e3) { est[b.id] = null; continue; }
      const net = roiNet(run.counts, b.s - 1.5 * b.w, b.s + 1.5 * b.w, 4, readNoise(laser) ** 2), frac = (2 / Math.PI) * Math.atan(3);
      est[b.id] = Math.max(0, net.net / (resp * frac));
    }
    let bestT = null, bestC = -2;
    for (const k of TISSUE_KEYS) {
      let dot = 0, na = 0, nb = 0;
      for (const b of BANDS) { if (est[b.id] === null || b.id === "woh" || b.id === "wbend") continue; const a = est[b.id], r = bandAmp(k, b.id); dot += a * r; na += a * a; nb += r * r; }
      const c = dot / Math.sqrt(Math.max(1e-12, na * nb)); if (c > bestC) { bestC = c; bestT = k; }
    }
    // três bandas: as três de maior amplitude estimada na região de 600 a 1800 (picos separados)
    const peaks = BANDS.filter((b) => b.s >= 600 && b.s <= 1800 && est[b.id] !== null && b.id !== "wbend").map((b) => ({ b, a: est[b.id] })).sort((x, y) => y.a - x.a);
    const bandsPick = []; for (const p of peaks) { if (bandsPick.every((q) => Math.abs(q.b.s - p.b.s) > 25)) bandsPick.push(p); if (bandsPick.length === 3) break; }
    const bandsAns = bandsPick.map((p) => ({ shift: p.b.s, key: p.b.key }));
    return { lab, runs, ev, laser, TC, tissue: bestT, bands: bandsAns, answers: { tissue: bestT, temperatureC: TC, laser, bands: bandsAns, lambdaNm: stokesWavelengthNm(LASERS[laser].nm, 3400), popE4: 1e4 * thermalPopulationRatio(1700, kelvin(TC)), predQual: PREDICTION.qual.correct, prediction: PREDICTION.truthE4, c1: "a", c2: "a", c3: "a", hintsUsed: 0, deliveries: 1 } };
  }

  // ------------------------------------------------------------------ auditoria: cadeia física com números
  const fmt = (x, d = 1) => formatPt(x, d);
  const sci = (x, d = 2) => { const [m, e] = x.toExponential(d).split("e"), n = String(Math.abs(Number(e))).replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]); return Number(e) === 0 ? m.replace(".", ",") : `${m.replace(".", ",")}×10${Number(e) < 0 ? "⁻" : ""}${n}`; };
  // exposição máxima permitida na pele, CW (t > 10 s), ANSI Z136.1 (valores de memória; conferir na norma), em W/cm²
  const mpeWcm2 = (nm) => (nm < 700 ? 0.2 : nm <= 1050 ? 0.2 * Math.pow(10, 0.002 * (nm - 700)) : 1.0);
  // área mínima do ponto (cm²) e diâmetro equivalente (mm) para P mW sem passar da MPE
  const minSpot = (nm, powerMW) => { const A = (powerMW / 1000) / mpeWcm2(nm); return { areaCm2: A, diamMm: 20 * Math.sqrt(A / Math.PI) }; };
  const razaoLaser = (caso) => {
    const st = CONDITIONS[caso.condition].label.split(" (")[0], col = caso.color, best = caso.bestLaser, sg = caso.sigmaByLaser, P = caso.powerByLaser, phi = sci(caso.phi, 1);
    if (best === "532") return `a amostra é ${col} (pouco pigmento: ${fmt(caso.k["532"], 3)} K/mW em 532 nm, logo ${fmt(P["532"], 0)} mW seguros) e ${st}: a fluorescência (φ = ${phi}) é baixa, e o sinal Raman de 532 nm, ≈ 3,6× maior por mW, vence.`;
    if (best === "1064") return `a amostra é ${st} (φ = ${phi}): a fluorescência em 785 nm domina o fundo e o σ_T de 785 nm fica em ${fmt(sg["785"], 2)} K; em 1064 nm quase não há fluorescência, e o σ_T cai a ${fmt(sg["1064"], 2)} K apesar do InGaAs ruidoso.`;
    const why532 = P["532"] < 60 ? `a amostra ${col} limita 532 nm a ${fmt(P["532"], 0)} mW (${fmt(caso.k["532"], 3)} K/mW)` : `a fluorescência de 532 nm (17× a de 785 nm) pesa mais que o ganho de sinal`;
    return `a amostra é ${col} e ${st} (φ = ${phi}): ${why532}; em 1064 nm o InGaAs é mais ruidoso e o sinal por mW é menor, e a fluorescência em 785 nm ainda é tolerável.`;
  };
  function auditChain(caso, ctx = {}) {
    const T = TISSUES[caso.tissue], TK = kelvin(caso.TC), b = bandById(caso.bestBand);
    const ratio = asOverS(wavenumberOfLaser(LASERS[caso.bestLaser].nm), b.s, TK), pop = thermalPopulationRatio(b.s, TK);
    const nmBest = LASERS[caso.bestLaser].nm, pBest = caso.powerByLaser[caso.bestLaser], spot = minSpot(nmBest, pBest);
    return [
      { step: "1 · Oscilador e posição das bandas", formula: "ν̃ = (1/2πc)·√(k/μ); ħω = hcν̃",
        generic: "C=O: μ = 12×16/28 = 6,86 u; ν̃ = 1700 cm⁻¹ dá k ≈ 1170 N/m e ħω = 0,2108 eV. C–H: μ = 0,923 u; ν̃ = 2900 cm⁻¹ dá k ≈ 457 N/m e ħω = 0,360 eV (Aula 5: o poço da ligação fixa a escala de energia).",
        caso: `Neste caso, as bandas fortes: ${strongBands(caso.tissue).filter((x) => x.s < 1800).map((x) => `${fmtShift(x.s)} cm⁻¹ (${assignName(x.key)})`).join("; ")}; tecido: ${T.name}.` },
      { step: "2 · População térmica", formula: "P₁/P₀ = e<sup>−ħω/k_BT</sup>",
        generic: "C=O a 37 °C: k_BT = 0,02673 eV; P₁/P₀ = e<sup>−0,2108/0,02673</sup> = 3,8×10⁻⁴ (3,76×10⁻⁴); C–H (2900 cm⁻¹): 1,4×10⁻⁶. Por isso o Raman de tecido é quase só Stokes.",
        caso: `Neste caso: T = ${fmt(caso.TC, 1)} °C = ${fmt(TK, 1)} K; para ${fmtShift(b.s)} cm⁻¹, ħω = ${fmt(hbarOmegaEV(b.s), 4)} eV e P₁/P₀ = ${sci(pop)}.` },
      { step: "3 · Razão anti-Stokes/Stokes", formula: "I_AS/I_S = ((ν₀+ν̃)/(ν₀−ν̃))³ · e<sup>−hcν̃/k_BT</sup>  (contagem de fótons; potência: expoente 4)",
        generic: "785 nm (ν₀ = 12739 cm⁻¹), banda de 1004 cm⁻¹ a 37 °C: fator de frequência (13743/11735)³ = 1,606; e<sup>−4,658</sup> = 9,5×10⁻³; razão = 1,5×10⁻². A razão não depende da seção de choque: ela se cancela entre Stokes e anti-Stokes.",
        caso: `Neste caso (${nmBest} nm, banda de ${fmtShift(b.s)} cm⁻¹, T = ${fmt(caso.TC, 1)} °C): razão esperada = ${sci(ratio)}. Invertendo: T = (hcν̃/k_B)/[3 ln((ν₀+ν̃)/(ν₀−ν̃)) − ln R]; some o aquecimento do ponto (ΔT mostrado na medida).` },
      { step: "4 · Laser e detector", formula: "λ_Stokes = 1/(1/λ₀ − ν̃); sinal ∝ (ν₀−ν̃)³ · QE(λ); vence o menor σ_T",
        generic: "Com 785 nm, a banda de 3400 cm⁻¹ cai em 1071 nm (fora do CCD de Si) e a de 2900 em 1016 nm (QE baixa). Com 532 nm o sinal por mW é ≈ 3,6× o de 785 nm, mas a fluorescência é 17× maior e o pigmento aquece. Com 1064 nm o InGaAs é mais ruidoso e o sinal é menor. Nenhum laser vence sempre: depende da cor (aquecimento) e do estado da amostra (fluorescência).",
        caso: `Neste caso, σ_T esperado por laser (potência segura de cada um, ${LEVELS[caso.level].runS} s): 532 nm: ${fmt(caso.sigmaByLaser["532"], 2)} K (${fmt(caso.powerByLaser["532"], 0)} mW); 785 nm: ${fmt(caso.sigmaByLaser["785"], 2)} K (${fmt(caso.powerByLaser["785"], 0)} mW); 1064 nm: ${fmt(caso.sigmaByLaser["1064"], 2)} K (${fmt(caso.powerByLaser["1064"], 0)} mW); melhor: ${caso.bestLaser} nm. Estado: cor ${caso.color}, amostra ${CONDITIONS[caso.condition].label}. Razão: ${razaoLaser(caso)}` },
      { step: "5 · Janela óptica, limite térmico e segurança (MPE)", formula: "janela óptica ≈ 650–950 nm; ΔT = c·P·(1 − e<sup>−t/τ</sup>) ≤ 5 K; irradiância E = P/A ≤ MPE = 0,2·10<sup>0,002(λ−700)</sup> W/cm² (700–1050 nm)",
        generic: "A janela óptica (Aula 5) é onde hemoglobina e água absorvem pouco: 785 nm cabe nela. Segurança em pele (ANSI Z136.1, CW): MPE = 0,30 W/cm² a 785 nm (0,2·10^0,17), 0,2 W/cm² a 532 nm e 1,0 W/cm² a 1064 nm (valores de memória: conferir na norma). 200 mW a 785 nm exigem A ≥ 0,2/0,30 = 0,67 cm², cerca de 9 mm de diâmetro: os 200 mW do app são de BANCADA (amostra ex vivo); in vivo, uma sonda de 1 a 3 mm excederia a MPE. A termometria Raman em tecido é um conceito didático; o uso clínico do Raman é diagnóstico por impressão espectral.",
        caso: ctx.extra || `Neste caso, com ${fmt(pBest, 0)} mW a ${nmBest} nm: MPE = ${fmt(mpeWcm2(nmBest), 2)} W/cm², logo A ≥ ${fmt(pBest / 1000, 3)} W/(${fmt(mpeWcm2(nmBest), 2)} W/cm²) = ${fmt(spot.areaCm2, 2)} cm² (diâmetro ≥ ${fmt(spot.diamMm, 1)} mm) para ser seguro em pele.` },
      { step: "Limite do modelo", formula: "oscilador harmônico; dados sintéticos",
        generic: "Oscilador harmônico (anarmonicidade de ≈ 3 % no C=O, Aula 10), bandas e amplitudes sintéticas, fluorescência φ inventada (o tecido de autofluorescência alta tem φ ≈ 800× a do adiposo: sem base de literatura), cor e estado da amostra sintéticos, sem Raman ressonante, sem espalhamento múltiplo no tecido, sem fotodegradação além do estado fotobranqueado e sem efeitos de profundidade.",
        caso: "" },
    ];
  }

  // ------------------------------------------------------------------ apresentação
  function niceTicks(min, max, target = 5) {
    const span = max - min, raw = span / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(12)));
    return { step, ticks: out };
  }
  const tickDigits = (step) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  function listDigits(ticks) {
    let d = 0;
    for (const t of ticks) while (d < 3 && Math.abs(t * 10 ** d - Math.round(t * 10 ** d)) > 1e-7) d += 1;
    return d;
  }
  function mergeTicks(ticks, refs, gap) {
    const kept = ticks.filter((t) => refs.every((r) => Math.abs(t - r) >= gap));
    return [...new Set([...kept, ...refs])].sort((a, b) => a - b);
  }
  function formatPt(x, digits = 2) {
    const v = Number(x);
    if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "—";
    const z = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
    return z.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).replace(/-/g, "−");
  }

  const api = {
    C2_CM_K, EV_PER_CM, KB_EV, EXP_FOTONS, EXP_POTENCIA, DS, S_MIN, NPX, NOTCH, T_LIM_K, TAU_TH, HINT_PENALTY, hintCost, REDELIVERY_COST, KR, KF, NU_REF,
    BANDS, ASSIGN, assignName, TISSUES, TISSUE_KEYS, bandById, bandAmp, strongBands, STRONG, LASERS, LASER_KEYS, OPTICAL_WINDOW, LEVELS, WEIGHTS, PREDICTION, PRED_PARTS, efficiencyFactor, conceptsCorrect, CONCEPTS, BAND_TOL, TOL_T_BASE,
    mulberry32, hash3, poisson, reducedMassU, wavenumberFromK, forceConstantFromWavenumber, hbarOmegaEV, zeroPointEV, kelvin, thermalPopulationRatio, asOverS, temperatureFromRatio,
    wavenumberOfLaser, stokesWavelengthNm, qeSi, qeInGaAs, qeOf, heatingSteadyK, heatingAt, kOf, K_TABLE, COLORS, CONDITIONS, TC_MIN, TC_MAX, rankLasers, safePower, pixShift, pixelOf, lorentz, fluorPerPixel, expectedPerSecond, darkPerSecond, readNoise,
    expectedSigmaT, bestSigmaT, makeCase, mpeWcm2, minSpot, Lab, roiNet, thermometer, findBands, numScore, partial, valueCredit, tempTol, shuffledOptions, score, scoreBands, solveReference, auditChain,
    niceTicks, tickDigits, listDigits, mergeTicks, formatPt,
  };
  root.ChallengePhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

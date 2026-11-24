(function (root) {
  "use strict";
  // Desafio 5 — Resfrie o detector de germânio (Aulas 8, 9 e 10).
  // Unidades: SI/práticas com sufixo no nome (TK, cm3, V, W). Nenhuma função mistura sistemas.
  // Cada função cita a equação da nota (aula_08 poço fino/delta, aula_09 doador raso, aula_10 Boltzmann)
  // ou diz que é EXTENSÃO (dados do semicondutor e modelo de operação, que a nota não contém).
  const SALT = 0x5eed05;

  // ======================================================================
  // Núcleo comum dos desafios (mesmo texto em todos os desafio-*/physics.js)
  // ======================================================================
  // Gerador pseudoaleatório determinístico mulberry32 (domínio público, Tommy Ettinger).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // A semente do aluno e o "sal" do desafio dão a sequência; as primeiras saídas são descartadas.
  function makeRng(seed, salt) {
    const r = mulberry32((Math.imul(Math.trunc(seed) >>> 0, 2654435761) + salt) >>> 0);
    for (let i = 0; i < 4; i += 1) r();
    return r;
  }
  const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  function shuffle(rng, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const parseSeed = (value) => { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n >= 1 && n <= 999999 ? n : 1; };

  // ---------- pontuação (0–100), igual nos seis desafios ----------
  // acerto 50 (restrições 40 + valores calculados 10) · previsão 10 · eficiência 15 × (fração da missão cumprida)²
  // · justificativa 25 (8 + 8 + 9) · dicas −4, −6, −10 · −5 por entrega adicional.
  const WEIGHTS = Object.freeze({ acerto: 50, restricoes: 40, valores: 10, previsao: 10, eficiencia: 15, justificativa: 25 });
  const CONCEPT_WEIGHTS = Object.freeze([8, 8, 9]);
  const HINT_COST = Object.freeze([4, 6, 10]);
  const REDELIVERY_PENALTY = 5;
  // Violação relativa `rel` (≥ 0) de uma restrição: perda linear, zero a 25 %.
  const partial = (rel) => Math.max(0, 1 - 4 * Math.max(0, Number.isFinite(rel) ? rel : 1));
  // Fração 1 enquanto o erro está dentro da tolerância `tol`; cai linearmente até 0 em `zero`.
  function ramp(err, tol, zero) {
    if (!Number.isFinite(err)) return 0;
    const e = Math.abs(err);
    return e <= tol ? 1 : e >= zero ? 0 : 1 - (e - tol) / (zero - tol);
  }
  // Eficiência (regra comum dos seis desafios): cheia enquanto se usa até 50 % do orçamento; depois cai
  // linearmente até zero quando o orçamento acaba (100 %).
  function efficiencyFraction(used, budget) {
    if (!(budget > 0)) return 0;
    const u = clamp((Number(used) || 0) / budget, 0, 1);
    return u <= 0.5 ? 1 : 2 * (1 - u);
  }
  // Política de revelação (regra comum): os números do caso (auditoria, limites exatos, conceitos certos, resposta
  // da previsão) só aparecem com nota ≥ 90, na 3ª entrega ou no modo professor. Antes disso: "n de 3 conceitos".
  const REVEAL_SCORE = 90, REVEAL_DELIVERY = 3;
  const revealPolicy = (total, deliveryNumber, prof = false) => Boolean(prof) || Number(total) >= REVEAL_SCORE || Number(deliveryNumber) >= REVEAL_DELIVERY;
  const conceptsCorrect = (items, picked) => items.filter((it) => { const o = it.options.find((x) => x.id === (picked || {})[it.id]); return o && o.ok; }).length;
  // p = { acerto, mission, previsao, eficiencia, justificativa (0..1), hints, deliveryNumber }
  function totalScore(p) {
    const a = clamp(p.acerto, 0, 1), m = clamp(p.mission === undefined ? a : p.mission, 0, 1), pr = clamp(p.previsao, 0, 1), ef = clamp(p.eficiencia, 0, 1), j = clamp(p.justificativa, 0, 1);
    const parts = { acerto: WEIGHTS.acerto * a, previsao: WEIGHTS.previsao * pr, eficiencia: WEIGHTS.eficiencia * ef * m * m, justificativa: WEIGHTS.justificativa * j };
    const hints = clamp(Math.trunc(p.hints || 0), 0, HINT_COST.length), dicas = HINT_COST.slice(0, hints).reduce((s, x) => s + x, 0);
    const reentrega = REDELIVERY_PENALTY * Math.max(0, Math.trunc(p.deliveryNumber || 1) - 1);
    const raw = parts.acerto + parts.previsao + parts.eficiencia + parts.justificativa - dicas - reentrega;
    return { parts, dicas, reentrega, total: clamp(Math.round(raw * 10) / 10, 0, 100) };
  }
  // Justificativa: fração de itens de escolha certos; `picked` = { idDoItem: idDaOpção }.
  function justificationFraction(items, picked) {
    if (!items.length) return 0;
    const tot = CONCEPT_WEIGHTS.reduce((s, x) => s + x, 0);
    return items.reduce((s, it, i) => { const o = it.options.find((x) => x.id === picked[it.id]); return s + (o && o.ok ? CONCEPT_WEIGHTS[i] : 0); }, 0) / tot;
  }

  // ---------- eixos e formatação (apresentação; sem física) ----------
  // niceTicks: marcas em passos 1, 2, 5 × 10^k, incluindo 0 quando ele cai no intervalo (cópia da aula 4).
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
  // Número em pt-BR: vírgula decimal, "−" tipográfico, sem separador de milhar e sem zero negativo.
  function formatPt(x, digits = 2) {
    const v = Number(x);
    if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "—";
    const z = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
    return z.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).replace(/-/g, "−");
  }
  const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const superscript = (n) => String(n).replace(/-/g, "⁻").replace(/\d/g, (d) => SUPER[d]);
  // Notação científica pt-BR: 2,3×10¹³ (mantissa com `digits` casas).
  function formatSci(x, digits = 1) {
    const v = Number(x);
    if (!Number.isFinite(v)) return "—";
    if (v === 0) return "0";
    let e = Math.floor(Math.log10(Math.abs(v))), m = v / 10 ** e;
    if (Math.abs(Number(m.toFixed(digits))) >= 10) { m /= 10; e += 1; }
    return `${formatPt(m, digits)}×10${superscript(e)}`;
  }

  // ---------------------------------------------------------------- constantes (referências)
  // Sze & Ng, Physics of Semiconductor Devices (3ª ed., ap. F/G); Thurmond, J. Electrochem. Soc. 122, 1133 (1975).
  const KB_EV_K = 8.617333262e-5;       // eV/K (CODATA 2018)
  const E_CHARGE_C = 1.602176634e-19;   // C
  const EPS0_F_M = 8.8541878128e-12;    // F/m
  const EPS_R_GE = 16;                  // permissividade relativa do Ge (Sze)
  const NC_300 = 1.04e19, NV_300 = 6.0e18; // cm⁻³ a 300 K (Sze); ∝ T^{3/2}
  const EG0_EV = 0.744, VARSHNI_ALPHA = 4.774e-4, VARSHNI_BETA = 235; // Eg(T) = 0,744 − 4,774×10⁻⁴ T²/(T+235) eV
  const EB_AS_EV = 0.0127;              // As em Ge (Sze: 12,7 meV) — dado da Aula 9
  const M_STAR_DONOR = 0.12;            // massa efetiva de condutividade usada na Aula 9 (κ = 0,200 nm⁻¹)
  const HBAR2_OVER_2ME_EV_NM2 = 0.0381; // ħ²/(2mₑ)
  const T_AMB_K = 300;
  const AREA_CM2 = 10;                  // área do contato do detector (ensaio C–V)
  // Refrigeração (EXTENSÃO didática): carga térmica Q_p (condução + radiação no criostato) e eficiência φ
  // de um refrigerador criogênico em fração do ciclo de Carnot: P_el = Q_p (T_amb − T)/(φ T). P_el diverge quando T → 0.
  // Q_p = 2 W corresponde a ≈ 1,1 L/dia de N₂ líquido só pelo calor latente; detectores reais gastam de 1 a 3 L/dia,
  // contando o próprio dewar.
  const Q_P_W = 2.0, PHI_CARNOT = 0.1;
  const LN2_J_PER_L = 1.61e5;           // 199 kJ/kg × 0,808 kg/L (calor latente do N₂ líquido)
  const T_LN2_K = 77;                   // N₂ líquido: temperatura de projeto do HPGe
  // Corrente de geração no volume depletado (EXTENSÃO; Sze & Ng, cap. 2 e 3; Knoll, Radiation Detection and Measurement, cap. 11):
  //   I_ger = e n_i V/(2τ_g),  V = A·d (volume do cristal), τ_g = 1 ms (tempo de vida de geração, valor didático).
  const TAU_GEN_S = 1e-3;
  const PRED_VOLUMES_CM3 = [5, 10, 15, 20, 30]; // cristais-exemplo da previsão (A = 10 cm²)
  const QUAL_SHARE = 0.4;               // fração dos 10 pontos de previsão que vem da escolha qualitativa

  // ---------------------------------------------------------------- semicondutor
  // Eg(T) de Varshni (Thurmond 1975).
  const gapEV = (TK) => EG0_EV - VARSHNI_ALPHA * TK * TK / (TK + VARSHNI_BETA);
  const Nc = (TK) => NC_300 * Math.pow(TK / 300, 1.5);
  const Nv = (TK) => NV_300 * Math.pow(TK / 300, 1.5);
  // n_i(T) = √(N_c N_v) exp(−E_g(T)/2k_B T)  [cm⁻³] (nota da aula 9, doador raso no HPGe; Eg(T) é extensão).
  const intrinsicCm3 = (TK) => Math.sqrt(Nc(TK) * Nv(TK)) * Math.exp(-gapEV(TK) / (2 * KB_EV_K * TK));
  // Fator de Boltzmann do doador e^{−E_b/k_B T} (nota da aula 10): 0,61 a 300 K; 0,15 a 77 K.
  const boltzmannDonor = (TK, EbEV = EB_AS_EV) => Math.exp(-EbEV / (KB_EV_K * TK));

  // Neutralidade de carga com ionização incompleta (extensão; degenerescência g = 2 como na aula 9):
  //   n + N_A⁻ = p + N_D⁺,  N_D⁺ = N_D/(1 + 2 (n/N_c) e^{E_b/k_B T}),  p = n_i²/n,  N_A = 0.
  // Em ln n a função é crescente: um só zero, achado por bisseção.
  function carriers(TK, NDcm3, EbEV = EB_AS_EV) {
    const ni = intrinsicCm3(TK), ncT = Nc(TK), eb = Math.exp(EbEV / (KB_EV_K * TK));
    const residual = (ln) => { const n = Math.exp(ln); return n - ni * ni / n - NDcm3 / (1 + 2 * n / ncT * eb); };
    let lo = -120, hi = 60;
    for (let i = 0; i < 90; i += 1) { const m = 0.5 * (lo + hi); if (residual(m) < 0) lo = m; else hi = m; }
    const n = Math.exp(0.5 * (lo + hi)), ionized = NDcm3 / (1 + 2 * n / ncT * eb);
    return { n, p: ni * ni / n, ni, ionized, fraction: ionized / NDcm3, ratioNi: ni / NDcm3 };
  }
  // Fração ionizada da aula 9 (lei de ação de massas, sem buracos): n = 2N_D/(1 + √(1 + 4N_D/K)), K = (N_c/2)e^{−E_b/k_B T}.
  function ionizedFractionSimple(TK, NDcm3, EbEV = EB_AS_EV) {
    const K = 0.5 * Nc(TK) * boltzmannDonor(TK, EbEV);
    return 2 / (1 + Math.sqrt(1 + 4 * NDcm3 / K));
  }
  // Bisseção monótona: menor T em [lo, hi] com g(T) ≥ 0 (g crescente).
  function solveIncreasing(g, lo, hi) {
    if (g(hi) < 0) return NaN;
    if (g(lo) >= 0) return lo;
    for (let i = 0; i < 45; i += 1) { const m = 0.5 * (lo + hi); if (g(m) < 0) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  }
  // T em que n_i(T) = alvo (cm⁻³). n_i cresce com T.
  const temperatureForIntrinsic = (target) => solveIncreasing((T) => Math.log(intrinsicCm3(T)) - Math.log(target), 20, 700);
  // T de congelamento: menor T com fração ionizada ≥ fMin.
  const freezeTemperature = (NDcm3, fMin = 0.99) => solveIncreasing((T) => carriers(T, NDcm3).fraction - fMin, 4, 300);

  // Doador raso como delta (aula 9): κ = √(2m*E_b)/ħ, σ_x = 1/(√2 κ); modelo hidrogenoide (NÃO é a previsão da delta).
  function donorDelta(EbEV = EB_AS_EV, mStar = M_STAR_DONOR) {
    const kappaNm = Math.sqrt(EbEV / (HBAR2_OVER_2ME_EV_NM2 / mStar));
    return { kappaNm, sigmaXNm: 1 / (Math.SQRT2 * kappaNm), bohrNm: 0.0529 * EPS_R_GE / mStar, hydrogenicMeV: 13605.693 * mStar / (EPS_R_GE * EPS_R_GE) };
  }

  // ---------------------------------------------------------------- depleção e eletrônica
  // V_dep = e N_D d²/(2ε), ε = 16 ε₀ (N_D em cm⁻³, d em cm → V). 565 V para N_D = 10¹⁰ cm⁻³, d = 1 cm.
  const depletionVoltage = (NDcm3, dCm) => E_CHARGE_C * NDcm3 * 1e6 * (dCm * 1e-2) ** 2 / (2 * EPS_R_GE * EPS0_F_M);
  // N_D máximo para V_dep (1 + sobretensão) ≤ V_máx.
  const maxDoping = (Vmax, dCm, over = 0) => 2 * EPS_R_GE * EPS0_F_M * Vmax / (E_CHARGE_C * (dCm * 1e-2) ** 2 * (1 + over)) / 1e6;
  // Largura depletada x(V) = √(2εV/(eN_D)) (cm), limitada a d; C = εA/x (pF).
  const depletionWidthCm = (V, NDcm3, dCm) => Math.min(dCm, Math.sqrt(2 * EPS_R_GE * EPS0_F_M * Math.max(0, V) / (E_CHARGE_C * NDcm3 * 1e6)) * 100);
  const capacitancePF = (V, NDcm3, dCm, areaCm2 = AREA_CM2) => {
    const x = depletionWidthCm(V, NDcm3, dCm);
    return x > 0 ? EPS_R_GE * EPS0_F_M * areaCm2 * 1e-4 / (x * 1e-2) * 1e12 : Infinity;
  };
  // d = εA/C_sat (cm): como o aluno lê o cristal no ensaio C–V.
  const thicknessFromCapacitanceCm = (CsatPF, areaCm2 = AREA_CM2) => EPS_R_GE * EPS0_F_M * areaCm2 * 1e-4 / (CsatPF * 1e-12) * 100;
  // Refrigeração (extensão): P_el(T) em W e T mínimo atingível com P_máx.
  const coolingPowerW = (TK) => TK >= T_AMB_K ? 0 : Q_P_W * (T_AMB_K - TK) / (PHI_CARNOT * TK);
  const coolingMinTemperatureK = (PW) => T_AMB_K / (1 + PHI_CARNOT * PW / Q_P_W);
  const ln2LitersPerDay = (QW = Q_P_W) => QW * 86400 / LN2_J_PER_L;
  // Corrente de geração (extensão): I_ger = e n_i V/(2τ_g) em pA, com V = A·d (cm³). 1 pA = 10⁻¹² A.
  const crystalVolumeCm3 = (dCm, areaCm2 = AREA_CM2) => areaCm2 * dCm;
  const generationCurrentPA = (TK, volumeCm3) => E_CHARGE_C * intrinsicCm3(TK) * volumeCm3 / (2 * TAU_GEN_S) * 1e12;
  // T em que a corrente de geração de um cristal de volume V vale I (pA): n_i(T) = 2τ_g I/(eV).
  const temperatureForGeneration = (IpA, volumeCm3) => temperatureForIntrinsic(2 * TAU_GEN_S * IpA * 1e-12 / (E_CHARGE_C * volumeCm3));

  // ---------------------------------------------------------------- níveis, caso e solução de referência
  // Três níveis. O limite superior de T é a corrente de geração I_ger ≤ I_máx (100, 10 e 1 pA); o inferior, o
  // congelamento dos doadores (fração ionizada ≥ f_mín) ou o orçamento de refrigeração.
  const LEVELS = Object.freeze({
    1: { id: 1, name: "Nível 1 · guiado", iMaxPA: 100, fMin: 0.95, over: 0, budget: 12, hints: true, predTol: [20, 60], dTol: 0.15, vTol: 0.10, rTol: 0.7 },
    2: { id: 2, name: "Nível 2 · livre", iMaxPA: 10, fMin: 0.99, over: 0, budget: 8, hints: false, predTol: [10, 40], dTol: 0.10, vTol: 0.05, rTol: 0.4 },
    3: { id: 3, name: "Nível 3 · bônus", iMaxPA: 1, fMin: 0.999, over: 0.10, budget: 5, hints: false, predTol: [6, 25], dTol: 0.05, vTol: 0.03, rTol: 0.25 },
  });
  const roundSig = (x, s) => Number(x.toPrecision(s));
  // Pesos das cinco restrições (soma 40): a depleção e a refrigeração pesam mais porque um chute aleatório as acerta menos
  // (o teste de chutes de tests.js usa esses pesos; mais peso em gen/ion/vmax eleva a média dos chutes acima de 30).
  const CHECK_MAX = Object.freeze({ gen: 5, ion: 2, depl: 16, vmax: 3, cool: 14 });

  // Janela de operação para uma dopagem: T entre max(T_congelamento, T_refrigeração) e T_ger (I_ger = I_máx).
  // T_ger depende do volume do cristal (da espessura d), não de N_D.
  function operatingWindow(NDcm3, caso, dCm = caso.d) {
    const L = caso.level, Tf = freezeTemperature(NDcm3, L.fMin), Tg = temperatureForGeneration(L.iMaxPA, crystalVolumeCm3(dCm)), Tc = coolingMinTemperatureK(caso.Pmax);
    const Tlow = Math.max(Tf, Tc);
    return { Tf, Tg, Tc, Tlow, Thigh: Tg, ok: Tlow < Tg };
  }

  const PRED_DOPINGS = [1e10, 2e10, 5e10, 1e11, 2e11];
  // Caso por semente (determinístico). Cristal (d, V_máx) só depende da semente; o orçamento de refrigeração e as
  // tolerâncias dependem do nível. Três tipos de orçamento: "tight" (77 K não cabe), "ln2" (cabe o N₂ líquido de 77 K)
  // e "rich" (criostato folgado: a tentação de esfriar até o congelamento). A solução oculta é construída DENTRO da
  // janela, mas o solver abaixo não a usa: ele reenumera o espaço de projeto.
  function makeCase(seed, levelId = 2) {
    const level = LEVELS[levelId] || LEVELS[2], rng = makeRng(seed, SALT);
    const d = roundSig(0.5 + 0.1 * randInt(rng, 0, 25), 3), Vmax = 2000 + 250 * randInt(rng, 0, 12);
    const rc = rng(), uN = 0.4 + 0.5 * rng(), uT = 0.82 + 0.12 * rng(), slack = 1.0 + 0.04 * rng(), ln2P = 60 + Math.round(30 * rng()), richP = 200 + Math.round(1300 * rng());
    const kind = rc < 0.78 ? "tight" : rc < 0.95 ? "ln2" : "rich";
    const predVolume = pick(rng, PRED_VOLUMES_CM3), qualOrder = shuffle(rng, [0, 1, 2, 3]);
    const itemOrder = [shuffle(rng, [0, 1, 2, 3]), shuffle(rng, [0, 1, 2, 3]), shuffle(rng, [0, 1, 2, 3])];
    const hiddenND = roundSig(maxDoping(Vmax, d, level.over) * uN, 2), Tg = temperatureForGeneration(level.iMaxPA, crystalVolumeCm3(d));
    const Th = kind === "tight" ? uT * Tg : T_LN2_K;
    const Pmax = kind === "tight" ? Math.ceil(coolingPowerW(Th) * slack) : kind === "ln2" ? ln2P : richP;
    const caso = { seed: parseSeed(seed), levelId: level.id, level, d, Vmax, Pmax, kind, rich: kind === "rich", predVolume, qualOrder, itemOrder, hidden: { ND: hiddenND, T: roundSig(Th, 4) } };
    caso.predAnswerK = temperatureForGeneration(level.iMaxPA, predVolume);
    caso.items = conceptItems(caso, 1);
    return caso;
  }

  // ---------------------------------------------------------------- avaliação de um projeto
  // answer = { T (K), ND (cm⁻³), V (V) }; devolve cada restrição com valor, limite e fração 0..1.
  function evaluateDesign(caso, answer) {
    const L = caso.level, T = Number(answer.T), ND = Number(answer.ND), V = Number(answer.V);
    if (!(T >= 3 && T <= 600 && ND >= 1e5 && ND <= 1e17 && V >= 0 && V <= 1e5)) return { valid: false };
    const c = carriers(T, ND), vdep = depletionVoltage(ND, caso.d), vneed = vdep * (1 + L.over), P = coolingPowerW(T), iger = generationCurrentPA(T, crystalVolumeCm3(caso.d));
    const win = operatingWindow(ND, caso);
    const checks = [
      { key: "gen", label: "corrente de geração: I_ger ≤ I_máx", value: iger, limit: L.iMaxPA, ok: iger <= L.iMaxPA, frac: partial(iger / L.iMaxPA - 1), max: CHECK_MAX.gen },
      { key: "ion", label: "não congelado: fração ionizada", value: c.fraction, limit: L.fMin, ok: c.fraction >= L.fMin, frac: partial((L.fMin - c.fraction) / L.fMin), max: CHECK_MAX.ion },
      { key: "depl", label: "depleção cobre d: V ≥ V_dep", value: V, limit: vneed, ok: V >= vneed, frac: partial((vneed - V) / vneed), max: CHECK_MAX.depl },
      { key: "vmax", label: "isolamento: V ≤ V_máx", value: V, limit: caso.Vmax, ok: V <= caso.Vmax, frac: partial((V - caso.Vmax) / caso.Vmax), max: CHECK_MAX.vmax },
      { key: "cool", label: "refrigeração: P(T) ≤ P_máx", value: P, limit: caso.Pmax, ok: P <= caso.Pmax, frac: partial((P - caso.Pmax) / caso.Pmax), max: CHECK_MAX.cool },
    ];
    return { valid: true, T, ND, V, carriers: c, vdep, vneed, power: P, iger, window: win, checks, allOk: checks.every((k) => k.ok) };
  }

  // Valores que o aluno entrega em "leituras": d (cm), V_dep (V) e log₁₀(I_ger/pA), conferidos no projeto entregue.
  function reportedTruth(caso, design) {
    return { d: caso.d, vdep: design.vdep, logI: Math.log10(Math.max(design.iger, 1e-300)) };
  }
  function evaluateAnswer(caso, answer) {
    const design = evaluateDesign(caso, answer), L = caso.level;
    if (!design.valid) return { design, components: [], acerto: 0 };
    const truth = reportedTruth(caso, design), rep = answer.rep || {};
    const rpart = (key, label, got, want, tol, max, rel) => {
      const err = rel ? Math.abs(got - want) / Math.abs(want) : Math.abs(got - want);
      const frac = Number.isFinite(err) ? ramp(err, tol, 3 * tol) : 0; return { key, label, value: got, limit: want, ok: err <= tol, frac, max, got: max * frac };
    };
    const comps = design.checks.map((k) => ({ ...k, got: k.max * k.frac }));
    comps.push(rpart("rep-d", "d lido do ensaio C–V (cm)", Number(rep.d), truth.d, L.dTol, 4, false));
    comps.push(rpart("rep-v", "V_dep do seu projeto (V)", Number(rep.vdep), truth.vdep, L.vTol, 3, true));
    comps.push(rpart("rep-i", "log₁₀(I_ger/pA) do seu projeto", Number(rep.logI), truth.logI, L.rTol, 3, false));
    const got = comps.reduce((s, k) => s + (Number.isFinite(k.got) ? k.got : 0), 0), max = comps.reduce((s, k) => s + k.max, 0), cons = design.checks.reduce((s, k) => s + k.max * k.frac, 0), consMax = design.checks.reduce((s, k) => s + k.max, 0);
    return { design, truth, components: comps, acerto: got / max, mission: cons / consMax };
  }
  const predictionNumericFraction = (caso, predK) => ramp(Math.abs(Number(predK) - caso.predAnswerK), caso.level.predTol[0], caso.level.predTol[1]);
  // Previsão (10 pontos): 40 % da escolha qualitativa (feita antes da conta) + 60 % da previsão numérica.
  const predictionFraction = (caso, predK, qualId) => QUAL_SHARE * (qualId === qualPrediction(caso).correctId ? 1 : 0) + (1 - QUAL_SHARE) * predictionNumericFraction(caso, predK);

  // Pontuação completa de uma entrega. state = { used (ensaios), hints, picked, prediction, predQual, deliveryNumber }.
  function scoreAnswer(caso, answer, state) {
    const ev = evaluateAnswer(caso, answer);
    const items = caso.items, jf = justificationFraction(items, state.picked || {});
    const hasNum = Number.isFinite(Number(state.prediction)) && state.prediction !== "" && state.prediction !== null;
    const pf = QUAL_SHARE * (state.predQual === qualPrediction(caso).correctId ? 1 : 0) + (hasNum ? (1 - QUAL_SHARE) * predictionNumericFraction(caso, state.prediction) : 0);
    const used = state.used || 0, ef = efficiencyFraction(used, caso.level.budget);
    const score = totalScore({ acerto: ev.acerto, mission: ev.mission, previsao: pf, eficiencia: ef, justificativa: jf, hints: state.hints, deliveryNumber: state.deliveryNumber });
    return { ev, score, previsaoFrac: pf, justificativaFrac: jf, eficienciaFrac: ef, used };
  }

  // Solver de referência (independente da solução oculta): varre N_D (0,04 dex e refino de 0,004 dex), usa a janela
  // [max(T_f, T_c), T_ger] e a faixa de tensão [V_dep(1 + sobretensão), V_máx]; escolhe a dopagem de janela mais larga
  // (em ln T; empate: a mais próxima de 10¹⁰ cm⁻³, a do HPGe real). T de projeto: 77 K (N₂ líquido) quando o
  // orçamento o permite; senão o centro geométrico da janela. Devolve null se a janela fechar.
  function solveReference(caso) {
    const L = caso.level;
    let best = null;
    const scan = (from, to, step) => {
      for (let x = from; x <= to + 1e-9; x += step) {
        const ND = roundSig(10 ** x, 3), vneed = depletionVoltage(ND, caso.d) * (1 + L.over);
        if (vneed * 1.03 > caso.Vmax) break;
        const w = operatingWindow(ND, caso);
        if (!w.ok) continue;
        const width = Math.log(w.Thigh / w.Tlow), near = Math.abs(x - 10);
        if (!best || width > best.width + 1e-9 || (Math.abs(width - best.width) <= 1e-9 && near < best.near)) best = { ND, width, w, vneed, x, near };
      }
    };
    scan(9, 12.5, 0.04);                       // varredura grossa (0,04 dex)
    if (best) scan(Math.max(9, best.x - 0.04), best.x + 0.04, 0.004); // refino em torno do melhor
    if (!best) return null;
    const useLn2 = best.w.Tlow <= T_LN2_K && T_LN2_K <= best.w.Thigh;
    const T = useLn2 ? T_LN2_K : Math.round(Math.sqrt(best.w.Tlow * best.w.Thigh) * 10) / 10;
    const V = Math.round(Math.min(caso.Vmax, Math.max(best.vneed * 1.05, (best.vneed + caso.Vmax) / 2)));
    const answer = { T, ND: best.ND, V };
    const design = evaluateDesign(caso, answer), truth = reportedTruth(caso, design);
    answer.rep = { d: caso.d, vdep: Math.round(truth.vdep), logI: Math.round(truth.logI * 10) / 10 };
    answer.window = best.w;
    return answer;
  }

  // ---------------------------------------------------------------- previsão qualitativa e conceitos
  // Previsão qualitativa (antes de qualquer conta; a opção certa muda de letra por semente).
  function qualPrediction(caso) {
    const opts = [
      { id: "a", text: "por mais de dez ordens de grandeza: nᵢ ∝ exp(−E_g/2k_B T) é exponencial em 1/T", ok: true },
      { id: "b", text: "por um fator ≈ 4: nᵢ cai com T e a razão das temperaturas é 300/77 ≈ 4", ok: false },
      { id: "c", text: "por cerca de três ordens de grandeza, como o fator de Boltzmann do doador", ok: false },
      { id: "d", text: "não cai: nᵢ depende só da dopagem N_D e não da temperatura do cristal", ok: false }];
    return { id: "qual", q: "Esfriando o cristal de 300 K para 77 K, por quanto cai a concentração de pares térmicos nᵢ?", options: caso.qualOrder.map((i) => opts[i]), correctId: "a" };
  }
  // Os três itens de justificativa: opções de tamanho e forma parecidos, com a concepção alternativa como distrator.
  // A ordem das opções vem da semente na 1ª entrega e é sorteada de novo a cada entrega seguinte.
  function itemOrders(caso, deliveryNumber) {
    if (!(deliveryNumber > 1)) return caso.itemOrder;
    const rng = makeRng(caso.seed * 7 + Math.trunc(deliveryNumber), SALT ^ 0xc0ffee);
    return [shuffle(rng, [0, 1, 2, 3]), shuffle(rng, [0, 1, 2, 3]), shuffle(rng, [0, 1, 2, 3])];
  }
  function conceptItems(caso, deliveryNumber = 1) {
    const make = (id, q, opts, order) => ({ id, q, options: order.map((i) => opts[i]) });
    const orders = itemOrders(caso, deliveryNumber);
    return [
      make("tmax", "O que impõe a temperatura MÁXIMA de operação?", [
        { id: "a", text: "a corrente de geração e·nᵢ·V/2τ: nᵢ cresce com T como exp(−E_g/2k_B T) e a fuga encobre o sinal", ok: true },
        { id: "b", text: "a perda do regime extrínseco: acima de certa T os pares térmicos igualam N_D e o cristal muda de tipo", ok: false },
        { id: "c", text: "a ionização dos doadores: acima de certa T o fator e^{−E_b/k_B T} ioniza doadores demais", ok: false },
        { id: "d", text: "a largura depletada x(V), que encolhe com a temperatura e deixa uma zona neutra no cristal", ok: false }], orders[0]),
      make("tmin", "O que impõe a temperatura MÍNIMA (esfriar demais prejudica)?", [
        { id: "a", text: "o congelamento (k_B T ≪ E_b prende os elétrons) e o custo: P_el = Q_p(300 − T)/(φT) diverge ao esfriar", ok: true },
        { id: "b", text: "só o custo da refrigeração: P_el = Q_p(300 − T)/(φT) cresce, mas os doadores seguem ionizados em T baixa", ok: false },
        { id: "c", text: "o gap E_g, que diminui ao esfriar e reabre a banda de condução aos portadores intrínsecos", ok: false },
        { id: "d", text: "a permissividade ε, que cai ao esfriar e faz V_dep ultrapassar a tensão máxima de isolamento", ok: false }], orders[1]),
      make("vdep", "O que fixa a tensão para depletar o cristal?", [
        { id: "a", text: "V_dep = eN_D d²/(2ε): a carga dos doadores ionizados cresce com N_D e com o quadrado da espessura", ok: true },
        { id: "b", text: "V_dep = eN_D d/ε: a carga por área dos doadores dividida por ε, linear na espessura do cristal", ok: false },
        { id: "c", text: "V_dep ∝ exp(−E_g/2k_B T), como os portadores intrínsecos: esfriar reduz a tensão necessária", ok: false },
        { id: "d", text: "V_dep = E_b/e: a energia de ligação do doador raso, que o campo elétrico precisa vencer", ok: false }], orders[2]),
    ];
  }
  // Três dicas graduadas (nível 1): método, limite de N_D, janela de T para uma dopagem boa.
  function hintsFor(caso) {
    const L = caso.level, ref = solveReference(caso), Nmax = maxDoping(caso.Vmax, caso.d, L.over);
    return [
      "Dica 1: a espessura vem do ensaio C–V. Use uma dopagem baixa (N_D ≈ 10⁹–10¹⁰ cm⁻³) e T moderada para que a capacitância sature em C_sat; então d = εA/C_sat, com ε = 16ε₀ e A = " + AREA_CM2 + " cm². O volume do cristal é V = A·d.",
      `Dica 2: a depleção cobre d se V ≥ V_dep = eN_D d²/(2ε) e V ≤ V_máx = ${Math.round(caso.Vmax)} V. Com d = ${formatPt(caso.d, 1)} cm isso dá N_D ≤ ${formatSci(Nmax, 1)} cm⁻³.`,
      ref ? `Dica 3: para N_D = ${formatSci(ref.ND, 2)} cm⁻³ a janela de T é de ${formatPt(ref.window.Tlow, 0)} K (congelamento ou refrigeração) até ${formatPt(ref.window.Thigh, 0)} K (I_ger = ${formatPt(L.iMaxPA, 0)} pA).` : "Dica 3: sem janela para este caso.",
    ];
  }

  // ---------------------------------------------------------------- auditoria: cadeia física com os números do caso
  function auditRows(caso, answer) {
    const L = caso.level, ev = evaluateDesign(caso, answer);
    if (!ev.valid) return [{ titulo: "Projeto inválido", formula: "T, N_D e V fora dos limites do modelo", conta: "—" }];
    const c = ev.carriers, kT = KB_EV_K * ev.T, g = gapEV(ev.T), dl = donorDelta(), w = ev.window, vol = crystalVolumeCm3(caso.d);
    const sci = (x) => formatSci(x, 2);
    return [
      { titulo: "1. Doador raso como delta (Aula 9)", formula: "κ = √(2m*E_b)/ħ; σₓ = 1/(√2 κ); E_b é dado (medido), não vem do modelo hidrogenoide",
        conta: `κ = √(${formatPt(EB_AS_EV, 4)} eV/(0,0381 eV nm²/${formatPt(M_STAR_DONOR, 2)})) = ${formatPt(dl.kappaNm, 3)} nm⁻¹; σₓ = ${formatPt(dl.sigmaXNm, 2)} nm. O hidrogenoide daria ${formatPt(dl.hydrogenicMeV, 1)} meV e a* = ${formatPt(dl.bohrNm, 1)} nm: não é a previsão da delta.` },
      { titulo: "2. Fator de Boltzmann (Aula 10)", formula: "e^{−E_b/k_B T} compara a energia de ligação com k_B T",
        conta: `k_B T = ${formatPt(kT * 1000, 2)} meV a ${formatPt(ev.T, 0)} K; E_b/k_B T = ${formatPt(EB_AS_EV / kT, 2)}; e^{−E_b/k_B T} = ${formatPt(boltzmannDonor(ev.T), 4)} (300 K: ${formatPt(boltzmannDonor(300), 2)}; 77 K: ${formatPt(boltzmannDonor(77), 2)}).` },
      { titulo: "3. Portadores intrínsecos (gap volumétrico)", formula: "nᵢ = √(N_cN_v) exp(−E_g(T)/2k_B T), E_g(T) = 0,744 − 4,774×10⁻⁴T²/(T+235)",
        conta: `E_g = ${formatPt(g, 4)} eV; √(N_cN_v) = ${sci(Math.sqrt(Nc(ev.T) * Nv(ev.T)))} cm⁻³; nᵢ = ${sci(c.ni)} cm⁻³ (nᵢ/N_D = ${sci(c.ratioNi)}). nᵢ = N_D só em ${formatPt(temperatureForIntrinsic(ev.ND), 0)} K, bem acima do limite que importa.` },
      { titulo: "4. Corrente de geração (limite superior de T)", formula: "I_ger = e nᵢ V/(2τ), V = A·d, τ = 1 ms (extensão; Knoll, cap. 11)",
        conta: `V = ${formatPt(AREA_CM2, 0)} cm² × ${formatPt(caso.d, 2)} cm = ${formatPt(vol, 1)} cm³; I_ger = 1,602×10⁻¹⁹ C × ${sci(c.ni)} cm⁻³ × ${formatPt(vol, 1)} cm³/(2×10⁻³ s) = ${sci(ev.iger * 1e-12)} A = ${sci(ev.iger)} pA (limite ${formatPt(L.iMaxPA, 0)} pA). I_ger = ${formatPt(L.iMaxPA, 0)} pA em ${formatPt(w.Tg, 0)} K.` },
      { titulo: "5. Ionização e congelamento", formula: "n − nᵢ²/n = N_D/(1 + 2(n/N_c)e^{E_b/k_B T}) (neutralidade, g = 2)",
        conta: `n = ${sci(c.n)} cm⁻³; fração ionizada = ${formatPt(c.fraction * 100, 3)} % (mínimo ${formatPt(L.fMin * 100, 1)} %). T de congelamento (${formatPt(L.fMin * 100, 1)} %) = ${formatPt(w.Tf, 1)} K.` },
      { titulo: "6. Depleção", formula: "V_dep = eN_D d²/(2ε), ε = 16ε₀",
        conta: `V_dep = ${sci(E_CHARGE_C)} C × ${sci(ev.ND * 1e6)} m⁻³ × (${formatPt(caso.d * 1e-2, 4)} m)² / (2×16×8,854×10⁻¹² F/m) = ${formatPt(ev.vdep, 0)} V; precisa de V ≥ ${formatPt(ev.vneed, 0)} V e V ≤ ${formatPt(caso.Vmax, 0)} V. N_D máximo para esse cristal: ${sci(maxDoping(caso.Vmax, caso.d, L.over))} cm⁻³.` },
      { titulo: "7. Refrigeração (e o custo de esfriar)", formula: "P_el = Q_p(T_amb − T)/(φT), Q_p = 2 W, φ = 0,1",
        conta: `P_el(${formatPt(ev.T, 0)} K) = ${formatPt(ev.power, 1)} W (orçamento ${formatPt(caso.Pmax, 0)} W ⇒ T ≥ ${formatPt(w.Tc, 0)} K). A 77 K: ${formatPt(coolingPowerW(77), 1)} W (N₂ líquido, ≈ ${formatPt(ln2LitersPerDay(), 1)} L/dia só pelo calor latente); a ${formatPt(w.Tf, 0)} K (congelamento): ${formatPt(coolingPowerW(Math.max(w.Tf, 3)), 0)} W. P_el diverge quando T → 0.` },
      { titulo: "8. Janela deste projeto", formula: "T entre max(T_congelamento, T_refrigeração) e T_ger",
        conta: w.ok ? `${formatPt(w.Tlow, 0)} K ≤ T ≤ ${formatPt(w.Thigh, 0)} K para N_D = ${sci(ev.ND)} cm⁻³. Você operou em ${formatPt(ev.T, 0)} K.` : `sem janela para N_D = ${sci(ev.ND)} cm⁻³ (T_baixo = ${formatPt(w.Tlow, 0)} K > T_ger = ${formatPt(w.Thigh, 0)} K).` },
    ];
  }
  const LIMITS = "Limite do modelo: dados sintéticos e didáticos (E_b, τ = 1 ms, Q_p, φ). Um só tipo de impureza (As): N_D é a impureza líquida, e há compensação parcial em cristais reais (zona-refinados); geometria planar, T uniforme, ε constante, sem armadilhas profundas. A corrente de geração é só a de volume (e n_i V/2τ), sem fuga de superfície; a refrigeração é Carnot × φ, e a conta do N₂ líquido (≈ 1,1 L/dia pelo calor latente) subestima o consumo real de 1 a 3 L/dia, que inclui o próprio dewar.";

  const api = {
    SALT, mulberry32, makeRng, randInt, pick, shuffle, clamp, parseSeed, WEIGHTS, HINT_COST, ramp, efficiencyFraction, totalScore, justificationFraction, revealPolicy, conceptsCorrect, REVEAL_SCORE, REVEAL_DELIVERY,
    niceTicks, tickDigits, listDigits, formatPt, formatSci, superscript, partial, CONCEPT_WEIGHTS, REDELIVERY_PENALTY,
    KB_EV_K, E_CHARGE_C, EPS0_F_M, EPS_R_GE, NC_300, NV_300, EB_AS_EV, M_STAR_DONOR, T_AMB_K, AREA_CM2, Q_P_W, PHI_CARNOT, TAU_GEN_S, T_LN2_K, QUAL_SHARE, PRED_VOLUMES_CM3,
    gapEV, Nc, Nv, intrinsicCm3, boltzmannDonor, carriers, ionizedFractionSimple, temperatureForIntrinsic, freezeTemperature, donorDelta,
    depletionVoltage, maxDoping, depletionWidthCm, capacitancePF, thicknessFromCapacitanceCm, coolingPowerW, coolingMinTemperatureK, ln2LitersPerDay,
    crystalVolumeCm3, generationCurrentPA, temperatureForGeneration,
    LEVELS, CHECK_MAX, PRED_DOPINGS, roundSig, operatingWindow, makeCase, evaluateDesign, evaluateAnswer, predictionFraction, predictionNumericFraction, scoreAnswer, solveReference, qualPrediction, conceptItems, hintsFor, auditRows, LIMITS,
  };
  root.DesafioPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ScannerPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Desafio 2 — Scanner de RM sob medida (Aulas 2, 4 e 6).
  // Núcleo físico e de pontuação, sem DOM. Unidades SI com sufixo no nome (B0T, GmTm, tReadMs, dxMm, fovCm).
  //   Aula 4 (nota 04): Larmor ν₀ = γ̄B₀ e ΔE = hν₀ (Zeeman do próton).
  //   Aula 6 (nota 06, §7.2 e exercício de Física Médica): S(k) = ∫ρ(x)e^{−2πikx}dx, k = γ̄Gt,
  //     k_max e Δx = 1/(2k_max); amostragem em passos Δk, FOV = 1/Δk, aliasing.
  //   Aula 2 (nota 02, regra de Born): ruído de contagem relativo 1/√N.
  //   Extensões (não estão nas notas): SNR didático, tempo e custo; estimulação periférica por dB/dt = S·r (ver GUIA, "Limite do modelo").
  // Convenção de t_read: é a janela TOTAL de leitura (o que o técnico configura), amostrada de −t_read/2
  // a +t_read/2 em torno do centro do eco. Logo k_max = γ̄·G·t_read/2. O "t" da nota (§7.2) é o semi-tempo:
  // G = 10 mT/m e t = 1 ms da nota correspondem a t_read = 2 ms aqui (k_max = 426 m⁻¹, Δx = 1,17 mm).
  const PI = Math.PI;
  const CONST = { gammaBarHzPerT: 42.577e6, hEVs: 4.135667696e-15, kBEVperK: 8.617333262e-5, bodyK: 310 };

  // ------------------------------------------------------------------ Aula 4: Larmor, Zeeman, polarização
  const larmorHz = (B0T) => CONST.gammaBarHzPerT * B0T;                       // ν₀ = γ̄B₀
  const zeemanEV = (B0T) => CONST.hEVs * larmorHz(B0T);                       // ΔE = hν₀ (eV)
  // P ≈ ΔE/(2k_BT) (dado das Aulas 4 e 6: ≈ 5×10⁻⁶ a 1,5 T e 310 K; regime de alta temperatura, linear em B₀)
  const polarization = (B0T) => zeemanEV(B0T) / (2 * CONST.kBEVperK * CONST.bodyK);

  // ------------------------------------------------------------------ Aula 6: espaço k
  const kMaxPerM = (GmTm, tReadMs) => CONST.gammaBarHzPerT * (GmTm * 1e-3) * (tReadMs * 1e-3) / 2;
  const resolutionMm = (GmTm, tReadMs) => 1e3 / (2 * kMaxPerM(GmTm, tReadMs));  // Δx = 1/(2k_max)
  const deltaKPerM = (GmTm, tReadMs, N) => 2 * kMaxPerM(GmTm, tReadMs) / N;      // Δk = γ̄Gt_read/N
  const fovCm = (GmTm, tReadMs, N) => 1e2 / deltaKPerM(GmTm, tReadMs, N);        // FOV = 1/Δk = NΔx
  const bandwidthHz = (tReadMs, N) => N / (tReadMs * 1e-3);                      // largura de banda do receptor

  // ------------------------------------------------------------------ SNR, tempo, custo (modelo didático; ver GUIA)
  // SNR = SNR_REF · [P(B₀)/P(1,5 T)] · (Δx/1 mm) · √NEX · √[(t_read/4 ms)/(N/256)]
  //   sinal ∝ P·(volume do voxel ∝ Δx), ruído por amostra ∝ √(largura de banda) = √(N/t_read), média sobre NEX ∝ 1/√NEX.
  const SNR_REF = 8;       // SNR didático em B₀ = 1,5 T, Δx = 1 mm, t_read = 4 ms, N = 256, NEX = 1
  const NS = [64, 96, 128, 192, 256, 384, 512, 768, 1024];
  const B0S = [0.5, 1.5, 3, 7];
  const snr = (B0T, dxMm, tReadMs, N, NEX) => SNR_REF * (polarization(B0T) / polarization(1.5)) * dxMm * Math.sqrt(NEX) * Math.sqrt((tReadMs / 4) / (N / 256));
  // TR = TR₀ + t_read + 2G/S (duas rampas; S em T/m/s = mT/m por ms, logo 2G/S sai em ms); t_exame = NEX·N·TR (N linhas de fase).
  // Com TR₀ = 600 ms a rampa pesa menos de 0,3 % do TR (≤ 1,6 ms com G = 40 mT/m e S = 50 T/m/s): S baixo quase não custa tempo.
  const TR0_MS = 600, SLEW_DEFAULT = 100, S_MIN = 50, S_MAX = 200, S_STEP = 5;
  const trMs = (GmTm, tReadMs, S = SLEW_DEFAULT) => TR0_MS + tReadMs + 2 * GmTm / S;
  const examMin = (GmTm, tReadMs, N, NEX, S = SLEW_DEFAULT) => NEX * N * trMs(GmTm, tReadMs, S) / 1000 / 60;
  // Estimulação periférica (extensão, didática): o limiar depende de dB/dt, não de G. Na borda da região de interesse, a r = 0,25 m do
  // isocentro, dB/dt ≈ S·r (T/s); o limite por caso é um dB/dt máximo (nível 1: 40; nível 2: 30; nível 3: 16 a 24 T/s por semente).
  // G_máx = 40 mT/m é só limite de hardware (o gradiente máximo do equipamento), não de segurança.
  const R_STIM_M = 0.25;
  const dBdtTs = (S) => S * R_STIM_M;
  const slewMaxFor = (dBdtMaxTs) => Math.max(S_MIN, Math.min(S_MAX, Math.floor(dBdtMaxTs / R_STIM_M / S_STEP + 1e-9) * S_STEP));
  // custo do exame (unidades de custo): aluguel do magneto por B₀ + 0,4 por minuto de exame
  const COST_B0 = { 0.5: 1, 1.5: 3, 3: 6, 7: 14 };
  const costUnits = (B0T, tMin) => COST_B0[B0T] + 0.4 * tMin;
  const LOCALIZER_MIN = 0.5;   // custo (min de sessão) do localizador que estima L

  // ------------------------------------------------------------------ objeto 1D, sinal e reconstrução (aula 6)
  function sineIntegral(z) {   // Si(z); A&S 5.2.38–39 para |z| ≥ 4 (erro < 5×10⁻⁷) — extensão, como na aplicação da Aula 6
    const sgn = z < 0 ? -1 : 1, x = Math.abs(z);
    if (x < 4) { let term = x, sum = x; for (let k = 1; k < 30; k += 1) { term *= -x * x / ((2 * k) * (2 * k + 1)); sum += term / (2 * k + 1); } return sgn * sum; }
    const x2 = x * x;
    const f = (x2 ** 4 + 38.027264 * x2 ** 3 + 265.187033 * x2 ** 2 + 335.677320 * x2 + 38.102495) / (x * (x2 ** 4 + 40.021433 * x2 ** 3 + 322.624911 * x2 ** 2 + 570.236280 * x2 + 157.105423));
    const g = (x2 ** 4 + 42.242855 * x2 ** 3 + 302.757865 * x2 ** 2 + 352.018498 * x2 + 21.821899) / (x2 * (x2 ** 4 + 48.196927 * x2 ** 3 + 482.485984 * x2 ** 2 + 1114.978885 * x2 + 449.690326));
    return sgn * (PI / 2 - f * Math.cos(x) - g * Math.sin(x));
  }
  const LESION_WIDTH_M = 0.5e-3, TISSUE_RHO = 0.5, LESION_EXTRA = 0.5;
  // Objeto: tecido de largura L (densidade 0,5) com duas lesões de 0,5 mm (densidade +0,5) separadas por s (centro a centro).
  function phantom(LCm, sMm) {
    return [
      { centerM: 0, widthM: LCm * 1e-2, height: TISSUE_RHO },
      { centerM: -sMm * 1e-3 / 2, widthM: LESION_WIDTH_M, height: LESION_EXTRA },
      { centerM: sMm * 1e-3 / 2, widthM: LESION_WIDTH_M, height: LESION_EXTRA },
    ];
  }
  const rho = (bands, xM) => bands.reduce((a, b) => a + (Math.abs(xM - b.centerM) < b.widthM / 2 ? b.height : 0), 0);
  // S(k) (real, objeto simétrico): faixa → h·w·sen(πkw)/(πkw)·cos(2πkc)
  function signal(bands, kPerM) {
    return bands.reduce((a, b) => { const z = PI * kPerM * b.widthM; return a + b.height * b.widthM * (Math.abs(z) < 1e-12 ? 1 : Math.sin(z) / z) * Math.cos(2 * PI * kPerM * b.centerM); }, 0);
  }
  // Reconstrução com k contínuo truncado em |k| ≤ k_max (integral seno), x em m.
  function reconstruct(bands, kMax, xM) {
    return bands.reduce((a, b) => a + (b.height / PI) * (sineIntegral(2 * PI * kMax * (xM - b.centerM + b.widthM / 2)) - sineIntegral(2 * PI * kMax * (xM - b.centerM - b.widthM / 2))), 0);
  }
  // Critério de "vale" (aplicação da Aula 6, corrigida em 2026-11-15): máximo local interior em x ∈ [s/4, 3s/4]
  // e dip = 1 − ρ_K(0)/ρ_K(pico) > 0,02. `f(x)` é a reconstrução (analítica ou discreta); x em m.
  function resolvedFn(f, sepM) {
    const lo = sepM / 4, hi = 3 * sepM / 4, n = 240, mid = f(0);
    const y = Array.from({ length: n + 1 }, (_, i) => f(lo + (hi - lo) * i / n));
    let peak = -Infinity, hasPeak = false;
    for (let i = 1; i < n; i += 1) if (y[i] > y[i - 1] && y[i] >= y[i + 1] && y[i] > peak) { peak = y[i]; hasPeak = true; }
    const dip = hasPeak && peak > 0 ? 1 - mid / peak : 0;
    return { dip, resolved: hasPeak && dip > 0.02, hasPeak };
  }
  const resolvedAt = (bands, kMax, sepM) => resolvedFn((x) => reconstruct(bands, kMax, x), sepM);
  // k_max crítico para separar as lesões: menor k tal que resolved vale em toda a faixa [k, 12/s] (varredura de 1 %, de cima para baixo
  // até a primeira falha). Logo abaixo de k_crit (~6 %) o ripple de Gibbs faz o dip oscilar em torno de 2 %; o veredito do desafio
  // usa o limiar: lesões separadas ⇔ k_max ≥ k_crit (Δx ≤ Δx_crit, com s/Δx_crit entre 1,42 e 1,54 conforme s;
  // regra segura para o aluno: Δx ≤ s/1,55).
  const critCache = new Map();
  function criticalKMax(sMm) {
    const key = Math.round(sMm * 1000);
    if (critCache.has(key)) return critCache.get(key);
    const bands = phantom(20, sMm), sepM = sMm * 1e-3;
    let k = 12 / sepM, last = k;
    while (k > 0.05 / sepM && resolvedAt(bands, k, sepM).resolved) { last = k; k *= 0.99; }
    critCache.set(key, last); return last;
  }
  const criticalDxMm = (sMm) => 1e3 / (2 * criticalKMax(sMm));

  // Reconstrução discreta (o que o scanner faz): ρ(x) = Δk Σ_{j=−N/2}^{N/2−1} S(jΔk)e^{2πijΔkx} (parte real).
  // É periódica com período FOV = 1/Δk: o aliasing sai da própria soma (exercício de Física Médica da nota 06).
  function kSamples(bands, N, dkPerM) {
    const ks = new Array(N), S = new Array(N);
    for (let i = 0; i < N; i += 1) { ks[i] = (i - N / 2) * dkPerM; S[i] = signal(bands, ks[i]); }
    return { ks, S };
  }
  function discreteRecon(ks, S, dkPerM, xsM) {
    return xsM.map((x) => { let a = 0; for (let i = 0; i < ks.length; i += 1) a += S[i] * Math.cos(2 * PI * ks[i] * x); return a * dkPerM; });
  }

  // ------------------------------------------------------------------ gerador pseudoaleatório
  function mulberry32(a) {
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rngFor(seed, salt = 0) { const r = mulberry32((Math.imul(seed | 0, 0x9E3779B1) + Math.imul(salt + 1, 0x85EBCA6B)) >>> 0); r(); r(); r(); return r; }
  function gaussian(rng) { const u = Math.max(rng(), 1e-12), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * v); }
  const round = (x, step) => Math.round(x / step) * step;
  const clean = (x) => Number(x.toFixed(6));

  // ------------------------------------------------------------------ níveis e avaliação
  const LEVELS = {
    1: { name: "Nível 1 — guiado", snrFrac: 0.55, timeFrac: 2.2, costAdd: 5, budgetK: 7, tol: 0.10, hints: true, showDerived: true, locErr: 0.03, stimTs: 40 },
    2: { name: "Nível 2 — livre", snrFrac: 0.8, timeFrac: 1.35, costAdd: 2, budgetK: 5, tol: 0.05, hints: false, showDerived: true, locErr: 0.05, stimTs: 30 },
    3: { name: "Nível 3 — restrições extras", snrFrac: 0.93, timeFrac: 1.12, costAdd: 0.5, budgetK: 4, tol: 0.05, hints: false, showDerived: false, locErr: 0.08, stimTs: null },
  };
  const HINT_PENALTY = [4, 6, 10], REDELIVERY_PENALTY = 5;
  const G_MAX = 40, T_MIN = 0.5, T_MAX = 10, S_DESIGN = 60;   // S_DESIGN ≤ 64 T/m/s: cabe no limite mais apertado do nível 3 (16 T/s)
const REVEAL_SCORE = 90, REVEAL_DELIVERY = 3;   // números do caso e conceitos corretos só aparecem com nota ≥ 90, na 3ª entrega ou com ?prof=1
const revealCase = (total, deliveryNumber, prof = false) => !!prof || total >= REVEAL_SCORE || deliveryNumber >= REVEAL_DELIVERY;

  // Todas as grandezas de um protocolo cfg = { B0, G (mT/m), S (T/m/s), t (ms), N, NEX } para o caso c.
  // Ponte técnico ↔ aluno: BW total = N/t_read (± BW/2 no receptor), BW/pixel = 1/t_read, G = BW/(γ̄·FOV).
  function evaluate(c, cfg) {
    const { B0, G, t, N, NEX } = cfg, S = cfg.S ?? SLEW_DEFAULT;
    const k = kMaxPerM(G, t), dx = resolutionMm(G, t), dk = deltaKPerM(G, t, N), fov = fovCm(G, t, N);
    const tm = examMin(G, t, N, NEX, S), bw = bandwidthHz(t, N);
    return { nuMHz: larmorHz(B0) / 1e6, zeemanEV: zeemanEV(B0), P: polarization(B0), kMax: k, dxMm: dx, dkPerM: dk, fovCm: fov,
      bwHz: bw, bwPerPixelHz: bw / N, snr: snr(B0, dx, t, N, NEX), trMs: trMs(G, t, S), tMin: tm, cost: costUnits(B0, tm),
      slew: S, dBdtTs: dBdtTs(S), stimOK: dBdtTs(S) <= (c.dBdtMaxTs ?? Infinity) + 1e-9,
      resolvedOK: dx <= c.dxCritMm, aliased: fov < c.LCm };
  }

  // Caso escondido por semente: s, L, e os limites derivados de um "protocolo de projeto" que garante solução.
  function makeCase(seed, level = 2) {
    const lv = LEVELS[level] || LEVELS[2];
    const rng = rngFor(seed, 11);
    const sMm = clean(round(1.5 + 4.5 * rng(), 0.1)), LCm = Math.round(12 + 18 * rng());
    const dxCritMm = criticalDxMm(sMm);
    // projeto quase ótimo: Δx a 95–98 % do crítico, t_read entre 7 e 10 ms (G pequeno, como convém ao SNR), N mínimo com FOV ≥ 1,05 L
    const dxTarget = dxCritMm * (0.95 + 0.03 * rng());
    let t = clean(round(7 + 3 * rng(), 0.1));
    let G = clean(Math.max(1, Math.ceil(1e3 / (CONST.gammaBarHzPerT * dxTarget * 1e-3 * t * 1e-3) / 0.5) * 0.5));
    if (G === 1) { t = clean(Math.ceil(1e3 / (CONST.gammaBarHzPerT * dxTarget * 1e-3 * G * 1e-3) / 0.1) * 0.1); }
    t = Math.min(T_MAX, t);
    const dx = resolutionMm(G, t);
    const N = NS.find((n) => n * dx >= 1.05 * LCm * 10) || NS[NS.length - 1];
    // B₀ e NEX do projeto: SNR alvo entre 25 e 40
    const snrTarget = 20 + 15 * rng();
    const NEXS = [1, 2, 3, 4, 6, 8, 12, 16];
    const order = [0.5, 1.5, 1.5, 3, 3, 7];
    let B0 = order[Math.floor(rng() * order.length)], NEX = null;
    while (B0 > 0.5 && snr(B0S[B0S.indexOf(B0) - 1], dx, t, N, 1) >= snrTarget) B0 = B0S[B0S.indexOf(B0) - 1];   // B₀ mais baixo que ainda dá o SNR alvo com 1 média
    for (let tries = 0; tries < 4 && NEX === null; tries += 1) {
      NEX = NEXS.find((n) => snr(B0, dx, t, N, n) >= snrTarget) || null;
      if (NEX === null || examMin(G, t, N, NEX, S_DESIGN) > 25) { NEX = null; B0 = B0S[Math.min(3, B0S.indexOf(B0) + 1)]; }
    }
    if (NEX === null) NEX = 16;
    const design = { B0, G, S: S_DESIGN, t, N, NEX };
    const dd = evaluate({ dxCritMm, LCm }, design);
    const rs = rngFor(seed, 29), dBdtMaxTs = lv.stimTs ?? 16 + 2 * Math.floor(5 * rs());   // nível 3: 16, 18, 20, 22 ou 24 T/s por semente
    const c = { seed, level, sMm, LCm, dxCritMm, design, dBdtMaxTs, slewMaxTmS: slewMaxFor(dBdtMaxTs),
      snrMin: clean(Math.floor(lv.snrFrac * dd.snr)), tMaxMin: Math.max(1, Math.ceil(lv.timeFrac * dd.tMin * 2) / 2),
      costMax: Math.ceil(dd.cost + lv.costAdd),
      sessionMin: clean(Math.ceil(lv.budgetK * Math.max(1, Math.ceil(lv.timeFrac * dd.tMin * 2) / 2))) };
    c.snrMin = Math.max(5, c.snrMin);
    const rc = rngFor(seed, 23); c.locEst = Math.round(LCm * (1 + lv.locErr * (2 * rc() - 1)));
    c.concepts = makeConcepts(seed, 0);
    return c;
  }
  // Perguntas "qual conceito decidiu?". As quatro opções de cada pergunta têm o mesmo tamanho e a mesma forma ("afirmação: razão");
  // três delas são concepções alternativas comuns, escritas na mesma linguagem da certa (a resposta certa não é a mais longa).
  // A ordem é embaralhada pela semente e muda a cada entrega (`delivery` = 0 para a 1ª, 1 para a 2ª, ...).
  const CONCEPT_BASE = [
    { q: "O que fixou a menor separação resolvida entre as lesões?", opts: [
      "O k_max = γ̄·G·t_read/2: o espaço k medido vai até k_max e Δx = 1/(2k_max)",
      "O passo Δk entre amostras: com Δk menor a amostragem é mais densa e Δx = 1/Δk",
      "O campo B₀: a frequência de Larmor ν₀ = γ̄B₀ maior afina o detalhe da imagem",
      "O número de médias NEX: com menos ruído o vale entre as lesões fica mais fundo"] },
    { q: "O que impediu o aliasing (dobra da imagem)?", opts: [
      "O FOV = 1/Δk ≥ L: com N maior o passo Δk fica menor e o objeto cabe no campo",
      "O k_max grande: com resolução alta o detalhe fino não dobra e o objeto cabe",
      "O B₀ alto: com o sinal mais forte as bordas do objeto deixam de se dobrar",
      "O SNR acima do limiar: sem ruído o excedente do objeto não dobra para dentro"] },
    { q: "Para que serviu aumentar o campo B₀?", opts: [
      "Aumenta a polarização P ∝ B₀ e o SNR, sem mudar Δx, FOV nem o tempo de exame",
      "Reduz o Δx, porque a frequência de Larmor ν₀ maior afina o detalhe da imagem",
      "Reduz Δk e, portanto, aumenta o FOV, porque o campo maior amostra mais denso",
      "Reduz a banda N/t_read e, portanto, o ruído, sem mudar a polarização dos spins"] },
  ];
  function makeConcepts(seed, delivery = 0) {
    const rng = rngFor(seed, 37 + 101 * delivery);
    return CONCEPT_BASE.map((b) => { const idx = [0, 1, 2, 3]; for (let i = 3; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return { q: b.q, opts: idx.map((i) => b.opts[i]), correct: idx.indexOf(0) }; });
  }
  function caseDescription(c) { return { s: c.sMm, L: c.LCm, dxCrit: c.dxCritMm }; }

  // Busca de referência (força bruta): protocolos que cumprem todas as restrições; devolve o de menor custo.
  function solve(c) {
    let best = null;
    const S = c.slewMaxTmS, gs = []; for (let g = 1; g <= G_MAX + 1e-9; g += 0.5) gs.push(g);   // S no máximo permitido (rampa mais curta; o efeito no tempo é < 0,3 %)
    const ts = []; for (let i = 5; i <= 100; i += 1) ts.push(i / 10);
    for (const B0 of B0S) for (const G of gs) for (const t of ts) {
      const dx = resolutionMm(G, t); if (dx > c.dxCritMm) continue;
      for (const N of NS) {
        if (fovCm(G, t, N) < c.LCm) continue;
        for (const NEX of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]) {
          const tm = examMin(G, t, N, NEX, S); if (tm > c.tMaxMin) break;
          if (snr(B0, dx, t, N, NEX) < c.snrMin) continue;
          const cost = costUnits(B0, tm); if (cost > c.costMax) break;
          if (!best || cost < best.cost) best = { cfg: { B0, G, S, t, N, NEX }, cost };
          break;
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ pontuação (0–100)
  // Acerto 50 = restrições 40 (resolução 10, aliasing 8, SNR 6, tempo 8, custo 6, estimulação dB/dt 2) + valores 10 (4 × 2,5)
  // Previsão 10 · Eficiência 15 (regra comum dos desafios: cheia até 50 % da sessão usada, linear até zero em 100 %, vezes a fração da
  // missão cumprida ao quadrado) · Justificativa 25 (8 + 8 + 9) − dicas (4, 6 e 10) − 5 por entrega adicional. Cada restrição violada perde
  // pontos linearmente com a violação relativa (zero a 25 %): a nota é monótona no erro. Tolerância dos valores: 5 % (10 % no nível 1).
  const EFF_FULL_USED = 0.5;   // fração do orçamento usada até a qual a eficiência é cheia
  const W = { res: 10, alias: 8, snr: 6, time: 8, cost: 6, grad: 2, values: 10, pred: 10, eff: 15, concepts: [8, 8, 9] };
  const partial = (rel) => Math.max(0, 1 - 4 * Math.max(0, rel));
  const valueCredit = (got, want, tol) => {
    if (!Number.isFinite(got) || !(want > 0)) return 0;
    const e = Math.abs(got - want) / want; return Math.max(0, Math.min(1, 1 - (e - tol) / (3 * tol)));
  };
  const predictionCredit = (pred, truth) => {
    if (!(pred > 0) || !(truth > 0)) return 0;
    const e = Math.abs(Math.log(pred / truth)), e0 = Math.log(1.15), e1 = Math.log(4);
    return Math.max(0, Math.min(1, 1 - (e - e0) / (e1 - e0)));
  };
  // ans = { cfg, values:{dxMm,fovCm,snr,tMin}, concepts:[i,i,i], predDxMm, predTrueDxMm, sessionUsedMin, hintsUsed:[bool,bool,bool] }
  function score(c, ans) {
    const lv = LEVELS[c.level] || LEVELS[2], ev = evaluate(c, ans.cfg), items = [];
    const add = (name, got, max, note) => items.push({ name, got: Math.round(got * 100) / 100, max, note });
    add("Resolução: lesões separadas", W.res * partial(ev.dxMm / c.dxCritMm - 1), W.res, ev.resolvedOK ? "Δx dentro do limite" : "Δx acima do limite");
    add("Sem aliasing (FOV ≥ L)", W.alias * partial(c.LCm / ev.fovCm - 1), W.alias, ev.aliased ? "imagem dobrada" : "sem dobra");
    add("SNR ≥ limiar", W.snr * partial(c.snrMin / ev.snr - 1), W.snr, ev.snr >= c.snrMin ? "SNR suficiente" : "SNR insuficiente");
    add("Tempo de exame ≤ T_max", W.time * partial(ev.tMin / c.tMaxMin - 1), W.time, ev.tMin <= c.tMaxMin ? "dentro do orçamento" : "tempo excedido");
    add("Custo do exame ≤ C_max", W.cost * partial(ev.cost / c.costMax - 1), W.cost, ev.cost <= c.costMax ? "dentro do orçamento" : "custo excedido");
    add("Estimulação: dB/dt ≤ limite", W.grad * partial(ev.dBdtTs / c.dBdtMaxTs - 1), W.grad, ev.stimOK ? "dentro do limite" : "dB/dt acima do limite");
    const v = ans.values || {}, tol = lv.tol;
    const vc = [valueCredit(v.dxMm, ev.dxMm, tol), valueCredit(v.fovCm, ev.fovCm, tol), valueCredit(v.snr, ev.snr, tol), valueCredit(v.tMin, ev.tMin, tol)];
    add("Valores calculados (Δx, FOV, SNR, tempo)", W.values / 4 * vc.reduce((a, b) => a + b, 0), W.values, `tolerância ${Math.round(tol * 100)} %`);
    add("Previsão de Δx", W.pred * predictionCredit(ans.predDxMm, ans.predTrueDxMm), W.pred, "comparada com o Δx da primeira aquisição");
    const remaining = Math.max(0, c.sessionMin - (ans.sessionUsedMin || 0)) / c.sessionMin;
    const cFrac = items.slice(0, 6).reduce((a, it) => a + it.got, 0) / items.slice(0, 6).reduce((a, it) => a + it.max, 0);   // fração da missão cumprida
    add("Eficiência (sessão restante)", W.eff * Math.min(1, remaining / (1 - EFF_FULL_USED)) * cFrac * cFrac, W.eff, `${Math.round((1 - remaining) * 100)} % da sessão usada, ponderada pela missão cumprida`);
    const cq = makeConcepts(c.seed, Math.max(0, (ans.deliveryNumber || 1) - 1));   // ordem das opções mostrada nesta entrega
    const cons = (ans.concepts || []).map((a, i) => (a === cq[i].correct ? W.concepts[i] : 0));
    for (let i = 0; i < 3; i += 1) add(`Conceito ${i + 1}`, cons[i] || 0, W.concepts[i], cons[i] ? "correto" : "incorreto");
    const hintPen = (ans.hintsUsed || []).reduce((a, u, i) => a + (u ? HINT_PENALTY[i] : 0), 0);
    const redeliver = REDELIVERY_PENALTY * Math.max(0, (ans.deliveryNumber || 1) - 1);
    const gross = items.reduce((a, it) => a + it.got, 0);
    const total = Math.max(0, Math.min(100, gross - hintPen - redeliver));
    const nConcepts = cons.filter((x) => x > 0).length;
    return { items, hintPenalty: hintPen, redeliveryPenalty: redeliver, total: Math.round(total * 10) / 10, nConcepts, feasible: ev.resolvedOK && !ev.aliased && ev.snr >= c.snrMin && ev.tMin <= c.tMaxMin && ev.cost <= c.costMax && ev.stimOK, ev };
  }
  // Resposta "perfeita" a partir de um protocolo (usada pelo modo professor e pelos testes).
  function perfectAnswer(c, cfg, deliveryNumber = 1) {
    const ev = evaluate(c, cfg);
    return { cfg, deliveryNumber, values: { dxMm: ev.dxMm, fovCm: ev.fovCm, snr: ev.snr, tMin: ev.tMin }, concepts: makeConcepts(c.seed, deliveryNumber - 1).map((q) => q.correct), predDxMm: ev.dxMm, predTrueDxMm: ev.dxMm, sessionUsedMin: LOCALIZER_MIN + ev.tMin, hintsUsed: [false, false, false] };
  }
  // Dicas graduadas do Nível 1 (cada uma custa pontos).
  function hints(c) {
    const lo = Math.max(1, Math.floor(c.sMm - 0.6)), hi = Math.ceil(c.sMm + 0.6);
    const dxAlvo = clean(Math.floor(c.dxCritMm * 0.9 * 100) / 100);
    const d = c.design;
    return [
      `Dica 1 (−${HINT_PENALTY[0]}): a separação s está entre ${formatPt(lo, 0)} e ${formatPt(hi, 0)} mm; regra segura: as lesões se separam se Δx ≤ s/1,55 (o limiar exato varia de s/1,42 a s/1,54).`,
      `Dica 2 (−${HINT_PENALTY[1]}): use Δx ≈ ${formatPt(dxAlvo, 2)} mm (G·t_read = 1/(γ̄Δx)); o FOV = N·Δx tem de passar de L = ${c.LCm} cm (aqui sem a margem de erro do localizador).`,
      `Dica 3 (−${HINT_PENALTY[2]}): G = ${formatPt(d.G, 1)} mT/m e t_read = ${formatPt(d.t, 1)} ms resolvem; N = ${d.N} cobre o objeto; S ≤ ${formatPt(c.slewMaxTmS, 0)} T/m/s respeita a estimulação. Falta escolher B₀ e NEX para o SNR e o tempo.`,
    ];
  }

  // ------------------------------------------------------------------ eixos e texto (padrão das aulas 4–10)
  function niceTicks(min, max, target = 5) {
    const span = max - min, raw = span / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(12)));
    return { step, ticks: out, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) };
  }
  function formatPt(x, n = 3) {
    if (!Number.isFinite(x)) return x === Infinity ? "∞" : x === -Infinity ? "−∞" : "—";
    let v = Number(x);
    if (Math.abs(v) < 0.5 * 10 ** -n) v = 0;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: n, maximumFractionDigits: n, useGrouping: false }).replace("-", "−");
  }
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const supText = (e) => String(e).replace("-", "⁻").replace(/\d/g, (d) => SUP[d]);
  function sciPt(x, n = 1) {
    if (x === 0) return "0";
    if (!Number.isFinite(x)) return "—";
    let e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e;
    if (Math.abs(Number(m.toFixed(n))) >= 10) { m /= 10; e += 1; }
    return `${formatPt(m, n)}×10${supText(e)}`;
  }

  return { CONST, PI, larmorHz, zeemanEV, polarization, kMaxPerM, resolutionMm, deltaKPerM, fovCm, bandwidthHz, SNR_REF, NS, B0S, snr, trMs, examMin, costUnits, COST_B0, TR0_MS, SLEW_DEFAULT, S_MIN, S_MAX, S_STEP, R_STIM_M, dBdtTs, slewMaxFor, S_DESIGN, REVEAL_SCORE, REVEAL_DELIVERY, revealCase, EFF_FULL_USED, CONCEPT_BASE, LOCALIZER_MIN,
    sineIntegral, phantom, rho, signal, reconstruct, resolvedFn, resolvedAt, criticalKMax, criticalDxMm, kSamples, discreteRecon,
    mulberry32, rngFor, gaussian, LEVELS, HINT_PENALTY, REDELIVERY_PENALTY, G_MAX, T_MIN, T_MAX, W, evaluate, makeCase, makeConcepts, caseDescription, solve, score, perfectAnswer, hints, valueCredit, predictionCredit,
    niceTicks, formatPt, sciPt, supText };
});

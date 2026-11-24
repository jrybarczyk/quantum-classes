(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.UltrasoundPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Desafio 4 — Casamento de impedância no ultrassom (Aulas 2, 3 e 7). Núcleo físico e de pontuação, sem DOM.
  // Unidades: Z em MRayl (10⁶ kg m⁻² s⁻¹), c em m/s, espessuras em µm, frequências em MHz.
  //   Aula 7 (nota 07, "o análogo é o ultrassom"): R = ((Z₁−Z₂)/(Z₁+Z₂))², T = 4Z₁Z₂/(Z₁+Z₂)² (k → Z);
  //     ressonância da barreira (T = 1 quando q a = nπ ↔ k_m d = nπ/… ) → camada de quarto de onda.
  //   Aula 3 (nota 03): T como razão de correntes, T = J_t/J_i; aqui, razão de intensidades (fluxos).
  //   Aula 2 (nota 02): ψ é a amplitude; aqui, a pressão p(x) com onda incidente, refletida e transmitida.
  // Extensão (não está na nota): matriz de transferência de camadas acústicas e a camada de quarto de onda com Z_m = √(Z₁Z₂).
  // O desafio é didático: impedâncias do catálogo, tecidos e custos são valores de projeto, não de um transdutor comercial.
  const PI = Math.PI;
  const Z1 = 33, C1 = 4000;                      // PZT (cerâmica piezoelétrica): ≈ 33 MRayl; c ≈ 4000 m/s
  const TISSUES = [                              // tecido-alvo (Z em MRayl, c em m/s): valores de tabela padrão (nota 07; Hoskins)
    { key: "gordura", name: "gordura", Z: 1.38, c: 1450 },
    { key: "mole", name: "tecido mole", Z: 1.63, c: 1540 },
    { key: "musculo", name: "músculo", Z: 1.70, c: 1580 },
  ];
  // Catálogo (didático): resinas epóxi carregadas (alumina/tungstênio); Z = ρc. Custo em unidades por camada.
  // Tungstênio: percentual em VOLUME pela regra das misturas, ρ = ρ_epóxi(1 − φ) + ρ_W φ com ρ_epóxi = 1,15 e ρ_W = 19,3 g/cm³ e c ≈ 2100 m/s
  // (valor didático; compósitos carregados têm c menor que o do epóxi puro): Z = 7, 8, 9 MRayl ⇒ ρ = 3,33, 3,81, 4,29 g/cm³ ⇒ φ = 12, 15, 17 %.
  // Alumina: o percentual é a carga nominal e Z e c são valores didáticos (não derivados da regra das misturas). Poliuretano: c = 2000 m/s é didático.
  const CATALOG = [
    { id: 0, name: "poliuretano", Z: 2.0, c: 2000, cost: 1 },
    { id: 1, name: "epóxi puro", Z: 3.0, c: 2650, cost: 1.5 },
    { id: 2, name: "epóxi + alumina 10 %", Z: 4.0, c: 2800, cost: 2 },
    { id: 3, name: "epóxi + alumina 25 %", Z: 5.0, c: 2900, cost: 2.5 },
    { id: 4, name: "epóxi + alumina 40 %", Z: 6.0, c: 3000, cost: 3.5 },
    { id: 5, name: "epóxi + tungstênio 12 % vol.", Z: 7.0, c: 2100, cost: 4.5 },
    { id: 6, name: "epóxi + tungstênio 15 % vol.", Z: 8.0, c: 2100, cost: 6 },
    { id: 7, name: "epóxi + tungstênio 17 % vol.", Z: 9.0, c: 2100, cost: 8 },
  ];
  // Densidade e fração em volume de tungstênio de uma linha do catálogo (regra das misturas, extensão).
  const RHO_EPOXY = 1.15, RHO_W = 19.3;
  const catalogRhoGcm3 = (m) => m.Z / m.c * 1e3;
  const tungstenVolFrac = (m) => (catalogRhoGcm3(m) - RHO_EPOXY) / (RHO_W - RHO_EPOXY);
  // Projeto de banda larga com duas camadas de quarto de onda (Desilets, Fraser e Kino, 1978; extensão, de memória): Z_a = Z_p^(4/7) Z_t^(3/7), Z_b = Z_p^(1/7) Z_t^(6/7).
  const twoLayerOptimumZ = (Zp, Zt) => ({ Za: Zp ** (4 / 7) * Zt ** (3 / 7), Zb: Zp ** (1 / 7) * Zt ** (6 / 7) });
  const BANDS = [{ lo: 2, hi: 4, label: "2–4 MHz (abdome)" }, { lo: 3, hi: 7, label: "5 ± 2 MHz (geral)" }, { lo: 4, hi: 10, label: "7 ± 3 MHz (superficial)" }];

  // ------------------------------------------------------------------ Aula 7: interface única
  const acousticR = (Za, Zb) => ((Za - Zb) / (Za + Zb)) ** 2;
  const acousticT = (Za, Zb) => 4 * Za * Zb / (Za + Zb) ** 2;
  const quarterWaveZ = (Za, Zb) => Math.sqrt(Za * Zb);                       // Z_m = √(Z₁Z₂)
  const quarterWaveUm = (cMps, fMHz) => cMps / (4 * fMHz * 1e6) * 1e6;       // d = c_m/(4f₀), em µm
  const FREE_TISSUE_T = (tissue) => acousticT(Z1, tissue.Z);

  // ------------------------------------------------------------------ matriz de transferência (aritmética complexa mínima)
  const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const ca = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const cabs2 = (a) => a[0] * a[0] + a[1] * a[1];
  // Camada (Z, c, d): [p; u](direita) = M [p; u](esquerda), M = [[cos kd, iZ sen kd],[i sen kd/Z, cos kd]], k = 2πf/c.
  function layerMatrix(Z, cMps, dUm, fMHz) {
    const kd = 2 * PI * fMHz * 1e6 * dUm * 1e-6 / cMps, c = Math.cos(kd), s = Math.sin(kd);
    return [[[c, 0], [0, Z * s]], [[0, s / Z], [c, 0]]];
  }
  const mmul = (A, B) => [[ca(cm(A[0][0], B[0][0]), cm(A[0][1], B[1][0])), ca(cm(A[0][0], B[0][1]), cm(A[0][1], B[1][1]))], [ca(cm(A[1][0], B[0][0]), cm(A[1][1], B[1][0])), ca(cm(A[1][0], B[0][1]), cm(A[1][1], B[1][1]))]];
  // layers = [{Z, c, d}] do transdutor para o tecido. T = 4Z₁Z_t/|A Z_t + B + C Z₁Z_t + D Z₁|² (fluxo de intensidade transmitido / incidente).
  function transmission(layers, Zt, fMHz) {
    let M = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
    for (const L of layers) M = mmul(M, layerMatrix(L.Z, L.c, L.d, fMHz));
    const den = ca(ca(cm(M[0][0], [Zt, 0]), M[0][1]), ca(cm(cm(M[1][0], [Zt, 0]), [Z1, 0]), cm(M[1][1], [Z1, 0])));
    return 4 * Z1 * Zt / cabs2(den);
  }
  // Método alternativo (impedância de entrada), usado nos testes como conferência independente.
  function transmissionByImpedance(layers, Zt, fMHz) {
    let Zin = [Zt, 0];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const L = layers[i], kd = 2 * PI * fMHz * 1e6 * L.d * 1e-6 / L.c, t = Math.tan(kd);
      const num = ca([Zin[0], Zin[1]], [0, L.Z * t]), den = ca([L.Z, 0], [-Zin[1] * t, Zin[0] * t]);
      const q = cm(num, [den[0] / cabs2(den), -den[1] / cabs2(den)]);
      Zin = [L.Z * q[0], L.Z * q[1]];
    }
    const gnum = [Zin[0] - Z1, Zin[1]], gden = [Zin[0] + Z1, Zin[1]];
    return 1 - cabs2(gnum) / cabs2(gden);
  }
  const bandMean = (layers, Zt, lo, hi, n = 41) => { let s = 0; for (let i = 0; i < n; i += 1) s += transmission(layers, Zt, lo + (hi - lo) * i / (n - 1)); return s / n; };
  // Pulso-eco (extensão): o feixe cruza a pilha na ida e na volta (reciprocidade: T de volta = T de ida), então o eco carrega ≈ T²; média de T² na banda.
  const bandMeanEcho = (layers, Zt, lo, hi, n = 41) => { let s = 0; for (let i = 0; i < n; i += 1) { const t = transmission(layers, Zt, lo + (hi - lo) * i / (n - 1)); s += t * t; } return s / n; };
  const gainDB = (tMean, tDirect) => 10 * Math.log10(tMean / tDirect);
  // Largura de banda a −3 dB: o pico é o máximo de T(f) DENTRO da banda do exame (band = {lo, hi}; sem band, em todo [0,5; 15] MHz);
  // a largura é a da faixa contígua em torno dele, varrida em [0,5; 15] MHz, onde T ≥ T_pico/2.
  function bandwidth3dB(layers, Zt, band) {
    const fs = [], ts = []; for (let f = 0.5; f <= 15.0001; f += 0.05) { fs.push(f); ts.push(transmission(layers, Zt, f)); }
    let im = band ? fs.findIndex((f) => f >= band.lo - 1e-9) : 0; ts.forEach((t, i) => { if ((!band || (fs[i] >= band.lo - 1e-9 && fs[i] <= band.hi + 1e-9)) && t > ts[im]) im = i; });
    let a = im, b = im; while (a > 0 && ts[a - 1] >= ts[im] / 2) a -= 1; while (b < ts.length - 1 && ts[b + 1] >= ts[im] / 2) b += 1;
    return { lo: fs[a], hi: fs[b], width: fs[b] - fs[a], peakF: fs[im], peakT: ts[im] };
  }

  // ------------------------------------------------------------------ pressão p(x) com onda incidente, refletida e transmitida
  // Onda incidente de amplitude 1 no transdutor (x < 0). Volta-se do tecido (p = 1, u = 1/Z_t) até x = 0 com a matriz inversa.
  // Devolve p(x) complexo em µm e as amplitudes incidente, refletida e transmitida.
  function pressureField(layers, Zt, fMHz, ct = 1540) {
    const bounds = []; let x = 0; layers.forEach((L) => { bounds.push(x); x += L.d; }); const D = x;
    // do tecido para trás: (p,u) em x = D
    let pu = [[1, 0], [1 / Zt, 0]];
    const atLeft = [];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const M = layerMatrix(layers[i].Z, layers[i].c, layers[i].d, fMHz), inv = [[M[1][1], [-M[0][1][0], -M[0][1][1]]], [[-M[1][0][0], -M[1][0][1]], M[0][0]]];
      pu = [ca(cm(inv[0][0], pu[0]), cm(inv[0][1], pu[1])), ca(cm(inv[1][0], pu[0]), cm(inv[1][1], pu[1]))];
      atLeft[i] = pu;
    }
    const p0 = pu[0], u0 = pu[1], pinc = [(p0[0] + Z1 * u0[0]) / 2, (p0[1] + Z1 * u0[1]) / 2], pref = [(p0[0] - Z1 * u0[0]) / 2, (p0[1] - Z1 * u0[1]) / 2];
    const ai = Math.hypot(pinc[0], pinc[1]);
    const norm = (z) => [(z[0] * pinc[0] + z[1] * pinc[1]) / (ai * ai), (z[1] * pinc[0] - z[0] * pinc[1]) / (ai * ai)];   // divide por p_inc
    const k1 = 2 * PI * fMHz * 1e6 / C1, kt = 2 * PI * fMHz * 1e6 / ct, ph = (k, xm) => [Math.cos(k * xm * 1e-6), Math.sin(k * xm * 1e-6)];
    function p(xUm) {
      if (xUm < 0) return norm(ca(cm(pinc, ph(k1, xUm)), cm(pref, ph(k1, -xUm))));
      if (xUm >= D) return norm(cm([1, 0], ph(kt, xUm - D)));
      let i = 0; while (i < layers.length - 1 && xUm >= bounds[i] + layers[i].d) i += 1;
      const s = xUm - bounds[i];
      const Ms = layerMatrix(layers[i].Z, layers[i].c, s, fMHz), pl = atLeft[i];
      return norm(ca(cm(Ms[0][0], pl[0]), cm(Ms[0][1], pl[1])));
    }
    const T = transmission(layers, Zt, fMHz), R = cabs2(norm(pref));
    return { p, D, T, R, incAmp: 1, refAmp: Math.sqrt(R), transAmp: Math.sqrt(cabs2(norm([1, 0]))), bounds };
  }

  // ------------------------------------------------------------------ pilha (cfg) e avaliação
  // cfg = { layers: [{mat: id, d: µm}, ...] } (0, 1 ou 2 camadas). band = {lo, hi}.
  const toLayers = (cfg, catalog = CATALOG) => cfg.layers.map((l) => ({ Z: catalog[l.mat].Z, c: catalog[l.mat].c, d: l.d }));
  const stackCost = (cfg) => cfg.layers.reduce((a, l) => a + CATALOG[l.mat].cost, 0);
  const stackThickness = (cfg) => cfg.layers.reduce((a, l) => a + l.d, 0);
  function evaluate(c, cfg) {
    const L = toLayers(cfg), t = c.tissue, bw = bandwidth3dB(L, t.Z, c.band), tm = bandMean(L, t.Z, c.band.lo, c.band.hi), t0 = FREE_TISSUE_T(t);
    return { layers: L, tMean: tm, tEcho: bandMeanEcho(L, t.Z, c.band.lo, c.band.hi), tDirect: t0, gainDB: gainDB(tm, t0), bw, thickness: stackThickness(cfg), cost: stackCost(cfg), nLayers: cfg.layers.length };
  }

  // ------------------------------------------------------------------ gerador pseudoaleatório
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function rngFor(seed, salt = 0) { const r = mulberry32((Math.imul(seed | 0, 0x9E3779B1) + Math.imul(salt + 1, 0x85EBCA6B)) >>> 0); r(); r(); r(); return r; }

  const LEVELS = {
    1: { name: "Nível 1 — guiado", tFrac: 0.75, dFac: 1.6, costAdd: 5, benchMin: 40, tol: 0.10, hints: true, catalogIds: [0, 1, 2, 3, 4, 5, 6, 7] },
    2: { name: "Nível 2 — livre", tFrac: 0.92, dFac: 1.15, costAdd: 1.5, benchMin: 24, tol: 0.05, hints: false, catalogIds: [0, 1, 2, 3, 4, 5, 6, 7] },
    3: { name: "Nível 3 — restrições extras", tFrac: 0.97, dFac: 1.0, costAdd: 0.5, benchMin: 14, tol: 0.05, hints: false, catalogIds: [0, 1, 3, 5, 7] },
  };
  const HINT_PENALTY = [4, 6, 10], REDELIVERY_PENALTY = 5, SWEEP_MIN = 2, DIRECT_MIN = 1, D_STEP = 5, D_MAX_UM = 400, NMAX_LAYERS = 2;

  // Busca exaustiva (passo `step` µm), em aritmética real: M = [[A, iB],[iC, D]] com A, D, B, C reais para camadas sem perda;
  // então T = 4Z₁Z_t/[(A Z_t + D Z₁)² + (B + C Z₁Z_t)²]. Lista (cacheada) de todas as pilhas de 1 e 2 camadas do catálogo.
  const stackCache = new Map();
  function allStacks(tissue, band, catalogIds, step = 10) {
    const key = [tissue.key, band.lo, band.hi, catalogIds.join(""), step].join("|");
    if (stackCache.has(key)) return stackCache.get(key);
    const NF = 13, fs = Array.from({ length: NF }, (_, i) => band.lo + (band.hi - band.lo) * i / (NF - 1)), ds = [];
    for (let d = step; d <= D_MAX_UM; d += step) ds.push(d);
    const quad = new Map();
    for (const id of catalogIds) for (const d of ds) quad.set(id * 1000 + d, fs.map((f) => { const m = CATALOG[id], kd = 2 * PI * f * 1e6 * d * 1e-6 / m.c; return [Math.cos(kd), m.Z * Math.sin(kd), Math.sin(kd) / m.Z, Math.cos(kd)]; }));
    const Zt = tissue.Z, tf = (q) => 4 * Z1 * Zt / ((q[0] * Zt + q[3] * Z1) ** 2 + (q[1] + q[2] * Z1 * Zt) ** 2);
    const out = [];
    for (const a of catalogIds) for (const d1 of ds) {
      const q1 = quad.get(a * 1000 + d1);
      out.push({ cfg: { layers: [{ mat: a, d: d1 }] }, tMean: q1.reduce((s, q) => s + tf(q), 0) / NF, cost: CATALOG[a].cost, thickness: d1 });
      for (const b2 of catalogIds) for (const d2 of ds) {
        const q2 = quad.get(b2 * 1000 + d2); let sum = 0;
        for (let i = 0; i < NF; i += 1) { const x = q1[i], y = q2[i]; sum += tf([x[0] * y[0] - x[1] * y[2], x[0] * y[1] + x[1] * y[3], x[2] * y[0] + x[3] * y[2], x[3] * y[3] - x[2] * y[1]]); }
        out.push({ cfg: { layers: [{ mat: a, d: d1 }, { mat: b2, d: d2 }] }, tMean: sum / NF, cost: CATALOG[a].cost + CATALOG[b2].cost, thickness: d1 + d2 });
      }
    }
    stackCache.set(key, out); return out;
  }
  // Melhor T̄ com espessura total ≤ dMax, e (se tMin) a lista das pilhas com T̄ ≥ tMin.
  function search(tissue, band, catalogIds, dMax, tMin, step = 10) {
    const all = allStacks(tissue, band, catalogIds, step).filter((x) => x.thickness <= dMax);
    let best = null; for (const x of all) if (!best || x.tMean > best.tMean) best = x;
    return { best: { tMean: best.tMean, cfg: best.cfg }, ok: tMin === undefined ? [] : all.filter((x) => x.tMean >= tMin) };
  }
  const bestFor = (tissue, band, catalogIds, dMax) => search(tissue, band, catalogIds, dMax);

  // Caso escondido por semente: tecido (Z escondido), banda, e limites derivados da melhor pilha do catálogo (garante solução).
  function makeCase(seed, level = 2) {
    const lv = LEVELS[level] || LEVELS[2], rng = rngFor(seed, 41);
    const tissue = TISSUES[Math.floor(rng() * 3)], band = BANDS[Math.floor(rng() * 3)];
    const ids = lv.catalogIds;
    const glob = bestFor(tissue, band, ids, D_MAX_UM), dStar = stackThickness(glob.best.cfg);
    const dMax = Math.min(D_MAX_UM, Math.max(150, Math.ceil(lv.dFac * dStar / 10) * 10));
    const sol = bestFor(tissue, band, ids, dMax), tMin = Math.floor(lv.tFrac * sol.best.tMean * 100) / 100;
    const feas = search(tissue, band, ids, dMax, tMin).ok, minCost = Math.min(...feas.map((x) => x.cost));
    return { seed, level, tissue, band, catalogIds: ids, dMaxUm: dMax, tMinMean: tMin, costMax: Math.ceil((minCost + lv.costAdd) * 2) / 2, benchMin: lv.benchMin, nMax: NMAX_LAYERS, bestMean: sol.best.tMean, bestCfg: sol.best.cfg, concepts: makeConcepts(seed, 0), bonus: makeBonus(seed) };
  }
  // Perguntas "qual conceito decidiu?". As quatro opções têm o mesmo tamanho e a mesma forma ("afirmação: razão"); três são concepções
  // alternativas comuns na mesma linguagem da certa. A ordem é embaralhada pela semente e muda a cada entrega (`delivery` = 0 para a 1ª).
  const CONCEPT_BASE = [
    { q: "O que fixou a espessura de cada camada de casamento?", opts: [
      "d = c_m/(4f₀): um quarto do comprimento de onda dentro do material da camada",
      "d = c_t/(4f₀): um quarto do comprimento de onda dentro do tecido que se ilumina",
      "d = λ₀/4 com a velocidade da luz: o quarto de onda vale para toda onda e meio",
      "d = λ_m/2: meia onda no material, para a camada ficar transparente na banda"] },
    { q: "Como se escolhe a impedância de uma camada única de casamento?", opts: [
      "Z_m = √(Z₁Z₂): média geométrica, pois as duas interfaces refletem igual",
      "Z_m = (Z₁ + Z₂)/2: média aritmética, pois fica no meio entre os dois lados",
      "Z_m = Z₂: igual à do tecido, pois assim a segunda interface não reflete",
      "Z_m = Z₁: igual à do transdutor, pois assim a primeira não reflete nada"] },
    { q: "O que é a transmissão T de uma interface ou pilha?", opts: [
      "A razão entre o fluxo de intensidade transmitido e o incidente, pois R + T = 1",
      "O quadrado da razão de pressões |p_t/p_i|², pois a intensidade segue a pressão",
      "A razão entre a pressão transmitida e a incidente, pois a pressão é o que cruza",
      "Só depende de Z₂ e não de Z₁, pois é o tecido que decide quanto atravessa"] },
  ];
  function makeConcepts(seed, delivery = 0) {
    const rng = rngFor(seed, 53 + 101 * delivery);
    return CONCEPT_BASE.map((b) => { const idx = [0, 1, 2, 3]; for (let i = 3; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return { q: b.q, opts: idx.map((i) => b.opts[i]), correct: idx.indexOf(0) }; });
  }

  // ------------------------------------------------------------------ pontuação (0–100), mesmo esquema do desafio 2
  // Acerto 50 = restrições 40 (T̄ ≥ alvo 22, espessura 10, custo 8) + valores 10 (T̄ %, banda −3 dB, ganho dB)
  // Previsão 10 (T sem camada) · Eficiência 15 (regra comum dos desafios: cheia até 50 % da bancada usada, linear até zero em 100 %, vezes a
  // missão cumprida ao quadrado) · Justificativa 25 (8 + 8 + 9) − dicas (4, 6, 10) − 5 por entrega adicional.
  // Tolerância das restrições: zero a 25 % de violação (T̄, espessura e custo). A estação extra (aba 04, Gamow) NÃO vale pontos.
  const W = { mean: 22, thick: 10, cost: 8, values: 10, pred: 10, eff: 15, concepts: [8, 8, 9] };
  const EFF_FULL_USED = 0.5, TOL_ZERO = 0.25;
  const REVEAL_SCORE = 90, REVEAL_DELIVERY = 3;   // números do caso (tecido, Z, gabarito) e conceitos certos: nota ≥ 90, 3ª entrega ou ?prof=1
  const revealCase = (total, deliveryNumber, prof = false) => !!prof || total >= REVEAL_SCORE || deliveryNumber >= REVEAL_DELIVERY;
  const partial = (rel, zero) => Math.max(0, 1 - Math.max(0, rel) / zero);
  const valueCredit = (got, want, tol) => { if (!Number.isFinite(got) || !(want > 0)) return 0; const e = Math.abs(got - want) / want; return Math.max(0, Math.min(1, 1 - (e - tol) / (3 * tol))); };
  const predictionCredit = (pred, truth) => { if (!(pred > 0) || !(truth > 0)) return 0; const e = Math.abs(Math.log(pred / truth)), e0 = Math.log(1.2), e1 = Math.log(4); return Math.max(0, Math.min(1, 1 - (e - e0) / (e1 - e0))); };
  // ans = { cfg, values:{tMeanPct, bwMHz, gainDB}, concepts, predT0, predTrueT0, benchUsedMin, hintsUsed, deliveryNumber }
  function score(c, ans) {
    const lv = LEVELS[c.level] || LEVELS[2], ev = evaluate(c, ans.cfg), items = [];
    const add = (name, got, max, note) => items.push({ name, got: Math.round(got * 100) / 100, max, note });
    add("T̄ na banda ≥ alvo", W.mean * partial((c.tMinMean - ev.tMean) / c.tMinMean, TOL_ZERO), W.mean, ev.tMean >= c.tMinMean ? "transmissão suficiente" : "transmissão abaixo do alvo");
    add("Espessura total ≤ limite", W.thick * partial(ev.thickness / c.dMaxUm - 1, TOL_ZERO), W.thick, ev.thickness <= c.dMaxUm ? "cabe no limite" : "espessura excedida");
    add("Custo do material ≤ orçamento", W.cost * partial(ev.cost / c.costMax - 1, TOL_ZERO), W.cost, ev.cost <= c.costMax ? "dentro do orçamento" : "custo excedido");
    const v = ans.values || {}, tol = lv.tol;
    const vc = [valueCredit(v.tMeanPct, ev.tMean * 100, tol), valueCredit(v.bwMHz, ev.bw.width, 2 * tol), valueCredit(v.gainDB, ev.gainDB, tol)];
    add("Valores calculados (T̄, banda −3 dB, ganho)", W.values / 3 * vc.reduce((a, b) => a + b, 0), W.values, `tolerância ${Math.round(tol * 100)} % (banda: ${Math.round(2 * tol * 100)} %)`);
    add("Previsão de T sem camada", W.pred * predictionCredit(ans.predT0, ans.predTrueT0), W.pred, "comparada com a medida do acoplamento direto");
    const remaining = Math.max(0, c.benchMin - (ans.benchUsedMin || 0)) / c.benchMin;
    const cFrac = items.slice(0, 3).reduce((a, it) => a + it.got, 0) / items.slice(0, 3).reduce((a, it) => a + it.max, 0);
    add("Eficiência (bancada restante)", W.eff * Math.min(1, remaining / (1 - EFF_FULL_USED)) * cFrac * cFrac, W.eff, `${Math.round((1 - remaining) * 100)} % do tempo de bancada usado, ponderada pela missão cumprida`);
    const cq = makeConcepts(c.seed, Math.max(0, (ans.deliveryNumber || 1) - 1));   // ordem das opções mostrada nesta entrega
    const cons = (ans.concepts || []).map((a, i) => (a === cq[i].correct ? W.concepts[i] : 0));
    for (let i = 0; i < 3; i += 1) add(`Conceito ${i + 1}`, cons[i] || 0, W.concepts[i], cons[i] ? "correto" : "incorreto");
    const hintPen = (ans.hintsUsed || []).reduce((a, u, i) => a + (u ? HINT_PENALTY[i] : 0), 0);
    const redeliver = REDELIVERY_PENALTY * Math.max(0, (ans.deliveryNumber || 1) - 1);
    const gross = items.reduce((a, it) => a + it.got, 0);
    const total = Math.max(0, Math.min(100, gross - hintPen - redeliver));
    const nConcepts = cons.filter((x) => x > 0).length;
    return { items, hintPenalty: hintPen, redeliveryPenalty: redeliver, nConcepts, total: Math.round(total * 10) / 10, feasible: ev.tMean >= c.tMinMean && ev.thickness <= c.dMaxUm && ev.cost <= c.costMax, ev };
  }
  function perfectAnswer(c, cfg, deliveryNumber = 1) {
    const ev = evaluate(c, cfg);
    return { cfg, values: { tMeanPct: ev.tMean * 100, bwMHz: ev.bw.width, gainDB: ev.gainDB }, concepts: makeConcepts(c.seed, deliveryNumber - 1).map((q) => q.correct), predT0: ev.tDirect, predTrueT0: ev.tDirect, benchUsedMin: DIRECT_MIN + SWEEP_MIN, hintsUsed: [false, false, false], deliveryNumber };
  }
  // Solução de referência: menor custo entre as pilhas que cumprem T̄ ≥ alvo e espessura ≤ limite (passo 10 µm).
  function solve(c) {
    const ok = search(c.tissue, c.band, c.catalogIds, c.dMaxUm, c.tMinMean).ok.filter((x) => x.cost <= c.costMax);
    return ok.reduce((a, x) => (!a || x.cost < a.cost || (x.cost === a.cost && x.tMean > a.tMean) ? x : a), null);
  }
  function hints(c) {
    const f0 = (c.band.lo + c.band.hi) / 2, Zid = quarterWaveZ(Z1, c.tissue.Z), b = c.bestCfg;
    return [
      `Dica 1 (−${HINT_PENALTY[0]}): meça o acoplamento direto para obter Z do tecido; uma camada única ideal tem Z_m = √(Z₁Z₂) ≈ ${fmtP(Zid, 1)} MRayl.`,
      `Dica 2 (−${HINT_PENALTY[1]}): a espessura de um quarto de onda é d = c_m/(4f₀) com f₀ = ${fmtP(f0, 1)} MHz; para c_m = 2100 m/s (compósito de tungstênio) dá ${fmtP(quarterWaveUm(2100, f0), 0)} µm. Duas camadas alargam a banda.`,
      `Dica 3 (−${HINT_PENALTY[2]}): uma pilha que serve: ${b.layers.map((l, i) => `camada ${i + 1} = ${CATALOG[l.mat].name} (${CATALOG[l.mat].Z} MRayl), ${l.d} µm`).join("; ")}. Refine as espessuras.`,
    ];
  }
  const fmtP = (x, n) => formatPt(x, n);

  // ------------------------------------------------------------------ Estação extra: emissor alfa por meia-vida alvo (nota 07, fator de Gamow)
  // Liga-se ao ultrassom pela Aula 7: a barreira do ultrassom é a impedância Z (degrau em Z); a do núcleo é o potencial V (barreira coulombiana).
  // T½(²²³Ra) do modelo: 8,4 d com R = 9,138 fm (raio de contato 1,2(A^(1/3) + 4^(1/3))) e 9,7 d com R = 9,1 fm; medido 11,4 d. O modelo erra por
  // fatores de 1,3 a 11 nos oito emissores (pior: ²²⁷Th, 1,7 d contra 18,7 d).
  // Funções iguais às da aplicação da Aula 7: energias em MeV, distâncias em fm, tempos em dias.
  const NUC = { e2MeVFm: 1.43996, hbarcMeVFm: 197.327, mAlphaMeV: 3727.379, cFmPerS: 2.99792458e23 };
  const turningPointFm = (EMeV, Z) => 2 * Z * NUC.e2MeVFm / EMeV;
  const contactRadiusFm = (Ad) => 1.2 * (Math.cbrt(Ad) + Math.cbrt(4));
  function gamowExponent(EMeV, RFm, Z) {
    const b = turningPointFm(EMeV, Z); if (RFm >= b) return 0; const x = RFm / b;
    return 2 * b * Math.sqrt(2 * NUC.mAlphaMeV * EMeV) / NUC.hbarcMeVFm * (Math.acos(Math.sqrt(x)) - Math.sqrt(x * (1 - x)));
  }
  const assaultRatePerS = (EMeV, RFm) => NUC.cFmPerS * Math.sqrt(2 * EMeV / NUC.mAlphaMeV) / (2 * RFm);
  const alphaHalfLifeDays = (EMeV, RFm, Z) => Math.LN2 / (assaultRatePerS(EMeV, RFm) * Math.exp(-gamowExponent(EMeV, RFm, Z))) / 86400;
  const EMITTERS = [
    { name: "²¹²Po", parent: "²¹²Po", Zd: 82, Ad: 208, E: 8.785, measured: "0,3 µs" },
    { name: "²¹¹At", parent: "²¹¹At", Zd: 83, Ad: 207, E: 5.870, measured: "7,2 h" },
    { name: "²²⁷Th", parent: "²²⁷Th", Zd: 88, Ad: 223, E: 6.038, measured: "18,7 d" },
    { name: "²²³Ra", parent: "²²³Ra", Zd: 86, Ad: 219, E: 5.72, measured: "11,4 d" },
    { name: "²²⁵Ac", parent: "²²⁵Ac", Zd: 87, Ad: 221, E: 5.830, measured: "10 d" },
    { name: "²¹⁰Po", parent: "²¹⁰Po", Zd: 82, Ad: 206, E: 5.304, measured: "138 d" },
    { name: "²⁴¹Am", parent: "²⁴¹Am", Zd: 93, Ad: 237, E: 5.486, measured: "432 anos" },
    { name: "²³⁸U", parent: "²³⁸U", Zd: 90, Ad: 234, E: 4.198, measured: "4,5×10⁹ anos" },
  ];
  const emitterHalfLifeDays = (em, RFm) => alphaHalfLifeDays(em.E, RFm ?? contactRadiusFm(em.Ad), em.Zd);
  // Bônus por semente: emissor-alvo e 3 concorrentes com T½ do modelo ≥ 4 vezes diferente de todos os outros (janela de ±2× é inequívoca).
  function makeBonus(seed) {
    const rng = rngFor(seed, 67), k = Math.floor(rng() * EMITTERS.length), th = EMITTERS.map((e) => emitterHalfLifeDays(e));
    const pool = EMITTERS.map((_, i) => i).filter((i) => i !== k).sort(() => rng() - 0.5), cands = [k];
    for (const i of pool) if (cands.length < 4 && cands.every((j) => Math.max(th[i], th[j]) / Math.min(th[i], th[j]) > 4)) cands.push(i);
    for (let i = cands.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    return { target: k, cands, tHalfDays: th[k], windowLo: th[k] / 2, windowHi: th[k] * 2 };
  }
  const SENS_OPTS = ["≈ 1,5 vezes (exponencial em R)", "não muda (R só entra no fator pré-exponencial)", "≈ 100 vezes", "≈ 10⁻⁵ vezes"];
  // Estação extra (sem pontos na nota): autoavaliação de 0 a 10 = emissor (6) + log₁₀ T½ previsto dentro de ±0,5 (2) + sensibilidade a R (2).
  function scoreBonus(c, ans) {
    const b = c.bonus, ok = ans.pick === b.target, logOk = Number.isFinite(ans.logT) && Math.abs(ans.logT - Math.log10(b.tHalfDays)) <= 0.5, sens = ans.sens === 0;
    return { pts: (ok ? 6 : 0) + (logOk ? 2 : 0) + (sens ? 2 : 0), ok, logOk, sens };
  }

  // ------------------------------------------------------------------ eixos e texto
  function niceTicks(min, max, target = 5) {
    const span = max - min, raw = span / Math.max(1, target), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(12)));
    return { step, ticks: out, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) };
  }
  function formatPt(x, n = 3) {
    if (!Number.isFinite(x)) return x === Infinity ? "∞" : x === -Infinity ? "−∞" : "—";
    let v = Number(x); if (Math.abs(v) < 0.5 * 10 ** -n) v = 0;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: n, maximumFractionDigits: n, useGrouping: false }).replace("-", "−");
  }
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", supText = (e) => String(e).replace("-", "⁻").replace(/\d/g, (d) => SUP[d]);
  function sciPt(x, n = 1) {
    if (x === 0) return "0"; if (!Number.isFinite(x)) return "—";
    let e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; if (Math.abs(Number(m.toFixed(n))) >= 10) { m /= 10; e += 1; }
    return `${formatPt(m, n)}×10${supText(e)}`;
  }

  return { PI, Z1, C1, TISSUES, CATALOG, BANDS, acousticR, acousticT, quarterWaveZ, quarterWaveUm, FREE_TISSUE_T, layerMatrix, transmission, transmissionByImpedance, bandMean, bandMeanEcho, gainDB, bandwidth3dB, pressureField,
    toLayers, stackCost, stackThickness, evaluate, mulberry32, rngFor, LEVELS, HINT_PENALTY, REDELIVERY_PENALTY, SWEEP_MIN, DIRECT_MIN, D_STEP, D_MAX_UM, NMAX_LAYERS, search, bestFor, makeCase, makeConcepts, W, valueCredit, predictionCredit, score, perfectAnswer, solve, hints,
    NUC, turningPointFm, contactRadiusFm, gamowExponent, assaultRatePerS, alphaHalfLifeDays, EMITTERS, emitterHalfLifeDays, makeBonus, SENS_OPTS, scoreBonus, niceTicks, formatPt, sciPt, supText,
    EFF_FULL_USED, TOL_ZERO, REVEAL_SCORE, REVEAL_DELIVERY, revealCase, CONCEPT_BASE, RHO_EPOXY, RHO_W, catalogRhoGcm3, tungstenVolFrac, twoLayerOptimumZ };
});

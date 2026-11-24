(function (root) {
  "use strict";
  // Desafio 3 — Emissor para imagem profunda: ponto quântico núcleo/casca (Aulas 5, 7, 8 e 10).
  // Unidades: energias em eV, comprimentos em nm, massas em mₑ (SI com sufixo no nome: …EV, …Nm).
  // Cada função cita a equação da nota (aula_05 poço infinito, aula_07 barreira, aula_08 poço finito)
  // ou diz que é EXTENSÃO (modelo do ponto núcleo/casca, que a nota não contém).
  const SALT = 0x5eed03;

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

  // ---------------------------------------------------------------- constantes e catálogo didático
  const HBAR2_OVER_2ME_EV_NM2 = 0.0381;   // ħ²/(2mₑ) em eV nm² (aula 8)
  const HC_EV_NM = 1239.84;               // hc em eV nm
  const WINDOW_NM = Object.freeze([650, 950]); // janela óptica do tecido (aula 5)
  const ML_NM = 0.31;                     // 1 monocamada de ZnS (≈ a/√3 · …; 0,31 nm, Sze/Adachi)
  const ETA_MAX = 0.90, LEAK_HALF = 0.05; // rendimento máximo e fuga que o reduz à metade (extensão)
  const RELEASE_LENGTH_NM = 0.8;          // escape de íons ∝ exp(−d/0,8 nm) (extensão)
  // Limites DIDÁTICOS do projeto (o modelo calcula além deles; o desafio não): núcleo de CdSe ≤ 8 nm (os maiores CdSe reais
  // emissores têm ≈ 6–8 nm) e casca ≤ 6 monocamadas (cascas grossas de ZnS sobre núcleos com descasamento de rede de 8 a 16 %
  // exigem camadas intermediárias de CdS ou ZnSe, que o modelo não tem).
  const D_MIN_NM = 2.5, D_MAX_NM = 10, ML_MAX = 6;
  const D_MAX_BY_MATERIAL = Object.freeze({ CdSe: 8, CdTe: 10, InP: 10 });
  const ZNS_LATTICE_NM = 0.541;           // parâmetro de rede do ZnS (blenda)
  // ZnS (casca; blenda): E_g = 3,6 eV, afinidade χ = 3,9 eV, m*ₑ = 0,28, m*h = 0,50 (valores de tabela: Ioffe;
  // Adachi, Properties of Group-IV, III-V and II-VI Semiconductors, 2005).
  const ZNS = Object.freeze({ gapEV: 3.6, chiEV: 3.9, me: 0.28, mh: 0.50 });
  // Núcleos. V₀ pela regra de Anderson (didática; incerteza ≈ ±0,3 eV na literatura):
  //   V₀ₑ = χ_núcleo − χ_ZnS ;  V₀ₕ = E_g(ZnS) − E_g(núcleo) − V₀ₑ.
  // Afinidades χ: CdSe 4,95; CdTe 4,28; InP 4,38 eV. Massas: CdSe 0,13/0,45 (aula 8); CdTe 0,10/0,40; InP 0,08/0,60.
  // Rede (blenda): a = 0,608 / 0,648 / 0,587 nm → cátions por nm³ = 4/a³; descasamento com o ZnS (a = 0,541 nm): (a − a_ZnS)/a.
  // Pesos de toxicidade: DIDÁTICOS (Cd = 1, In = 0,05). TODOS os parâmetros de memória deste catálogo (afinidades, m*ₕ do CdTe,
  // m*ₑ e m*ₕ do ZnS, gap do CdSe wurtzita com rede de blenda) são DIDÁTICOS, com incerteza ≈ ±0,3 eV em V₀.
  function material(key, name, gapEV, me, mh, chiEV, aNm, toxWeight, toxElement) {
    const V0e = chiEV - ZNS.chiEV, V0h = ZNS.gapEV - gapEV - V0e;
    return Object.freeze({ key, name, gapEV, me, mh, chiEV, V0e: Math.round(V0e * 100) / 100, V0h: Math.round(V0h * 100) / 100, aNm, mismatchPct: (aNm - ZNS_LATTICE_NM) / aNm * 100, dMaxNm: D_MAX_BY_MATERIAL[key], cationsPerNm3: 4 / aNm ** 3, toxWeight, toxElement, bulkNm: HC_EV_NM / gapEV });
  }
  const CATALOG = Object.freeze({
    CdSe: material("CdSe", "CdSe", 1.74, 0.13, 0.45, 4.95, 0.608, 1, "Cd"),
    CdTe: material("CdTe", "CdTe", 1.50, 0.10, 0.40, 4.28, 0.648, 1, "Cd"),
    InP: material("InP", "InP", 1.35, 0.08, 0.60, 4.38, 0.587, 0.05, "In"),
  });
  const MATERIAL_KEYS = Object.freeze(["CdSe", "CdTe", "InP"]);

  // ---------------------------------------------------------------- poço finito (aula 8)
  // Funções copiadas da aula 8 (poço finito, convenção V(x) = −V₀ em |x| < a): rhsZ, rootsZ, κa e P_{fora}.
  const HALF_PI = Math.PI / 2;
  const rhsZ = (z, z0) => (z <= 0 ? Infinity : z >= z0 ? 0 : Math.sqrt((z0 * z0) / (z * z) - 1));
  const countBoundStates = (z0) => (z0 > 0 ? Math.ceil(z0 / HALF_PI) : 0);
  function bisect(f, lo, hi, it = 200) { let a = lo, b = hi; for (let i = 0; i < it; i += 1) { const m = 0.5 * (a + b); if (f(m) < 0) a = m; else b = m; } return 0.5 * (a + b); }
  // Raízes z_n de tan z = √(z₀²/z² − 1) (ramos pares) e −cot z = √(z₀²/z² − 1) (ímpares); n = 1, 2, …
  function rootsZ(z0, maxRoots = Infinity) {
    const out = [], N = Math.min(countBoundStates(z0), maxRoots);
    for (let j = 0; j < N; j += 1) {
      const even = j % 2 === 0, lo = j * HALF_PI, hi = Math.min((j + 1) * HALF_PI, z0);
      const g = even ? (z) => Math.tan(z) - rhsZ(z, z0) : (z) => -1 / Math.tan(z) - rhsZ(z, z0), eps = 1e-12 * Math.max(1, hi);
      out.push({ n: j + 1, z: bisect(g, lo + eps, hi - eps), parity: even ? "par" : "ímpar" });
    }
    return out;
  }
  const kappaA = (z, z0) => Math.sqrt(Math.max(0, z0 * z0 - z * z));
  // P_{fora} = (z²/z₀²)/(1 + κa), forma fechada da aula 8 (vale nas energias permitidas).
  const outsideProbabilityClosed = (z, z0) => (z * z) / (z0 * z0) / (1 + kappaA(z, z0));
  const hbar2Over2m = (mStar) => HBAR2_OVER_2ME_EV_NM2 / mStar;

  // Níveis do poço de meia-largura a = R (largura D = 2R), E_n + V₀ = (ħ²/2m*) z_n²/a² (aula 8, dotLevelsEV).
  function wellLevelsEV(Rnm, V0EV, mStar) {
    const z0 = Rnm * Math.sqrt(V0EV / hbar2Over2m(mStar)), c = hbar2Over2m(mStar) / (Rnm * Rnm);
    return { z0, levels: rootsZ(z0).map((r) => ({ n: r.n, z: r.z, parity: r.parity, aboveBottomEV: c * r.z * r.z })) };
  }
  // ESFERA (extensão documentada na aula 8): estado l = 0 de raio R: u(r) = r·R(r) obedece ao ramo ÍMPAR do
  // poço de meia-largura R. O fundamental 3D é o n = 2 do poço 1D e só existe se z₀ > π/2.
  function carrierSphere(Rnm, V0EV, mStar) {
    const z0 = Rnm * Math.sqrt(V0EV / hbar2Over2m(mStar));
    if (!(z0 > HALF_PI)) return { bound: false, z0, EV: NaN, pOut: NaN, kappaCoreNm: NaN };
    const z = rootsZ(z0, 2)[1].z, ka = kappaA(z, z0);
    return { bound: true, z0, z, EV: hbar2Over2m(mStar) * z * z / (Rnm * Rnm), pOut: outsideProbabilityClosed(z, z0), kappaCoreNm: ka / Rnm };
  }
  // Poço infinito (aula 5) para a mesma esfera: u = sen(πr/R) ⇒ E = π²ħ²/(2mR²) = 4 × (π²ħ²/(8m R²)).
  const infiniteSphereEV = (Rnm, mStar) => hbar2Over2m(mStar) * Math.PI ** 2 / (Rnm * Rnm);
  const wavelengthNm = (energyEV) => HC_EV_NM / energyEV;

  // ---------------------------------------------------------------- emissor núcleo/casca
  const carrierCache = new Map();
  function carriersOf(key, Dnm) {
    const id = key + "|" + Dnm.toFixed(4);
    if (!carrierCache.has(id)) {
      const m = CATALOG[key], R = Dnm / 2;
      carrierCache.set(id, { e: carrierSphere(R, m.V0e, m.me), h: carrierSphere(R, m.V0h, m.mh) });
      if (carrierCache.size > 4000) carrierCache.clear();
    }
    return carrierCache.get(id);
  }
  // Barreira de ZnS (aula 7): κ = √(2 m*_{ZnS} (V₀ − E₁))/ħ; fração que chega à superfície ∝ e^{−2κd}.
  const shellKappaNm = (aboveBottomEV, V0EV, mZns) => Math.sqrt(Math.max(0, V0EV - aboveBottomEV) / hbar2Over2m(mZns));
  // design = { material, D (nm), ml (monocamadas de ZnS) }.
  function emitter(design) {
    const m = CATALOG[design.material], D = Number(design.D), ml = Math.trunc(Number(design.ml));
    if (!m || !(D >= 1) || !(ml >= 0)) return { valid: false, reason: "projeto fora dos limites" };
    const { e, h } = carriersOf(m.key, D);
    const d = ml * ML_NM, Dtot = D + 2 * d;
    if (!e.bound || !h.bound) return { valid: false, reason: !e.bound ? `elétron sem estado ligado (z₀ = ${formatPt(e.z0, 2)} < π/2)` : `buraco sem estado ligado (z₀ = ${formatPt(h.z0, 2)} < π/2)`, material: m, D, ml, d, Dtot, e, h };
    const photonEV = m.gapEV + e.EV + h.EV, infE = infiniteSphereEV(D / 2, m.me), infH = infiniteSphereEV(D / 2, m.mh), photonInfEV = m.gapEV + infE + infH;
    const ke = shellKappaNm(e.EV, m.V0e, ZNS.me), kh = shellKappaNm(h.EV, m.V0h, ZNS.mh);
    const escE = Math.exp(-2 * ke * d), escH = Math.exp(-2 * kh * d), leakE = e.pOut * escE, leakH = h.pOut * escH, leak = leakE + leakH;
    const eta = ETA_MAX / (1 + leak / LEAK_HALF), release = Math.exp(-d / RELEASE_LENGTH_NM), volume = Math.PI / 6 * D ** 3;
    const tox = volume * m.cationsPerNm3 * m.toxWeight * release / 1000;
    return {
      valid: true, material: m, D, ml, d, Dtot, e, h, photonEV, lambdaNm: wavelengthNm(photonEV), bulkNm: m.bulkNm,
      infiniteEV: { e: infE, h: infH }, photonInfEV, lambdaInfNm: wavelengthNm(photonInfEV), errInfE: (infE - e.EV) / e.EV * 100,
      ke, kh, escE, escH, leakE, leakH, leak, eta, release, volume, cations: volume * m.cationsPerNm3, tox, inWindow: wavelengthNm(photonEV) >= WINDOW_NM[0] && wavelengthNm(photonEV) <= WINDOW_NM[1],
    };
  }


  // Limites didáticos do projeto (ver D_MAX_BY_MATERIAL e ML_MAX): o desafio recusa o que o modelo ainda calcularia.
  function limitReason(design) {
    const m = CATALOG[design.material], D = Number(design.D), ml = Math.trunc(Number(design.ml));
    if (!m) return "material fora do catálogo";
    if (D > m.dMaxNm + 1e-9) return `núcleo de ${m.name} acima de ${formatPt(m.dMaxNm, 0)} nm: fora do limite didático (os maiores pontos reais emitem com ≈ 6–8 nm)`;
    if (ml > ML_MAX) return `casca acima de ${ML_MAX} monocamadas: cascas grossas exigem camadas intermediárias (CdS, ZnSe) que o modelo não tem`;
    return "";
  }
  // Síntese = limites didáticos + física (emitter).
  function synthesize(design) {
    const why = limitReason(design);
    if (why) return { valid: false, reason: why, limited: true };
    return emitter(design);
  }

  // Estimativas "de bolso" (grátis): geometria, toxicidade, gap volumétrico e a cor do poço INFINITO (Aula 5).
  function freeEstimate(design) {
    const m = CATALOG[design.material], D = Number(design.D), ml = Math.trunc(Number(design.ml)), d = ml * ML_NM;
    const infE = infiniteSphereEV(D / 2, m.me), infH = infiniteSphereEV(D / 2, m.mh), photonInfEV = m.gapEV + infE + infH;
    const volume = Math.PI / 6 * D ** 3;
    return { d, Dtot: D + 2 * d, tox: volume * m.cationsPerNm3 * m.toxWeight * Math.exp(-d / RELEASE_LENGTH_NM) / 1000, bulkNm: m.bulkNm, lambdaInfNm: wavelengthNm(photonInfEV), photonInfEV, infE, infH };
  }

  // ---------------------------------------------------------------- níveis, caso e solução de referência
  const LEVELS = Object.freeze({
    1: { id: 1, name: "Nível 1 · guiado", tolNm: 25, etaSlack: 0.10, toxSlack: 1.6, sizeSlack: 2.0, budget: 12, hints: true, repLam: 15, repP: 5, repEta: 10 },
    2: { id: 2, name: "Nível 2 · livre", tolNm: 10, etaSlack: 0.92, toxSlack: 1.3, sizeSlack: 1.0, budget: 8, hints: false, repLam: 5, repP: 2, repEta: 5 },
    3: { id: 3, name: "Nível 3 · bônus", tolNm: 5, etaSlack: 0.97, toxSlack: 1.1, sizeSlack: 0.3, budget: 5, hints: false, repLam: 3, repP: 1, repEta: 3 },
  });
  // Erro (%) do poço infinito na energia do elétron de um ponto de CdSe com diâmetro D (usado na auditoria e nos testes).
  function predictionAnswer(Dnm) {
    const m = CATALOG.CdSe, e = carrierSphere(Dnm / 2, m.V0e, m.me);
    return (infiniteSphereEV(Dnm / 2, m.me) - e.EV) / e.EV * 100;
  }
  const floorTo = (x, step) => Math.floor(x / step + 1e-9) * step, ceilTo = (x, step) => Math.ceil(x / step - 1e-9) * step;

  // Caso por semente: o projeto oculto (material, D, ML) fixa a cor-alvo e as margens; o solver não o usa.
  function makeCase(seed, levelId = 2) {
    const L = LEVELS[levelId] || LEVELS[2], rng = makeRng(seed, SALT);
    // O CdSe de até 8 nm emite no máximo em 644 nm (< 650 nm da janela): nenhum alvo da janela é de CdSe, e ele fica no
    // catálogo como o material que o gap permite mas o tamanho realista não alcança.
    const r1 = rng(), key = r1 < 0.45 ? "CdTe" : "InP";
    let design = null, em = null;
    for (let attempt = 0; attempt < 400 && !em; attempt += 1) {
      const lo = 3.5, hi = 9.5;
      const D = Math.round((lo + (hi - lo) * rng()) * 20) / 20, ml = randInt(rng, 2, ML_MAX), t = synthesize({ material: key, D, ml });
      if (t.valid && t.lambdaNm >= 655 && t.lambdaNm <= 850) { design = { material: key, D, ml }; em = t; }
    }
    if (!em) { design = { material: "InP", D: 6, ml: 4 }; em = emitter(design); }
    const qualOrder = [shuffle(rng, [0, 1, 2]), shuffle(rng, [0, 1, 2])], itemOrder = [shuffle(rng, [0, 1, 2, 3]), shuffle(rng, [0, 1, 2, 3]), shuffle(rng, [0, 1, 2, 3])];
    const etaMin = L.etaSlack < 0.5 ? Math.max(0.1, floorTo(em.eta - L.etaSlack, 0.05)) : floorTo(em.eta * L.etaSlack, L.id === 3 ? 0.01 : 0.05);
    const toxMax = roundSig(em.tox * L.toxSlack, 2), sizeMax = ceilTo(em.Dtot + L.sizeSlack, 0.5);
    const caso = { seed: parseSeed(seed), levelId: L.id, level: L, targetNm: Math.round(em.lambdaNm), etaMin, toxMax, sizeMax, qualOrder, itemOrder, hidden: design, hiddenEval: em };
    caso.items = conceptItems(caso, 1);
    return caso;
  }
  const roundSig = (x, s) => Number(x.toPrecision(s));

  // ---------------------------------------------------------------- avaliação
  function evaluateDesign(caso, design) {
    const em = synthesize(design);
    if (!em.valid) return { valid: false, em, reason: em.reason };
    const L = caso.level, dl = Math.abs(em.lambdaNm - caso.targetNm);
    const checks = [
      { key: "lam", label: "cor: |λ − λ_alvo|", value: dl, limit: L.tolNm, ok: dl <= L.tolNm, frac: ramp(dl, L.tolNm, 4 * L.tolNm), max: 20 },
      { key: "eta", label: "brilho: rendimento η", value: em.eta, limit: caso.etaMin, ok: em.eta >= caso.etaMin, frac: partial((caso.etaMin - em.eta) / caso.etaMin), max: 8 },
      { key: "tox", label: "toxicidade", value: em.tox, limit: caso.toxMax, ok: em.tox <= caso.toxMax, frac: partial(em.tox / caso.toxMax - 1), max: 6 },
      { key: "size", label: "diâmetro total D + 2d (extravasamento, EPR)", value: em.Dtot, limit: caso.sizeMax, ok: em.Dtot <= caso.sizeMax, frac: partial((em.Dtot - caso.sizeMax) / caso.sizeMax), max: 6 },
    ];
    return { valid: true, em, checks, allOk: checks.every((k) => k.ok) };
  }
  function evaluateAnswer(caso, answer) {
    const design = evaluateDesign(caso, answer), L = caso.level;
    if (!design.valid) return { design, components: [], acerto: 0 };
    const em = design.em, rep = answer.rep || {};
    const rpart = (key, label, got, want, tol, max) => { const err = Math.abs(got - want); const frac = Number.isFinite(err) ? ramp(err, tol, 3 * tol) : 0; return { key, label, value: got, limit: want, ok: err <= tol, frac, max, got: max * frac }; };
    const comps = design.checks.map((k) => ({ ...k, got: k.max * k.frac }));
    comps.push(rpart("rep-lam", "λ lido (nm)", Number(rep.lambdaNm), em.lambdaNm, L.repLam, 4));
    comps.push(rpart("rep-p", "P_{fora} do elétron (%)", Number(rep.pOutPct), em.e.pOut * 100, L.repP, 3));
    comps.push(rpart("rep-eta", "rendimento η (%)", Number(rep.etaPct), em.eta * 100, L.repEta, 3));
    const got = comps.reduce((s, k) => s + (Number.isFinite(k.got) ? k.got : 0), 0), max = comps.reduce((s, k) => s + k.max, 0), cons = design.checks.reduce((s, k) => s + k.max * k.frac, 0), consMax = design.checks.reduce((s, k) => s + k.max, 0);
    return { design, components: comps, acerto: got / max, mission: cons / consMax };
  }
  // Previsão (10 pontos) = escolhas qualitativas feitas ANTES de qualquer conta; cada pergunta certa vale a mesma fração.
  // `picked` = { sinal: id, tamanho: id }.
  const predictionFraction = (caso, picked) => { const q = qualPrediction(caso); return q.reduce((s, it) => s + ((picked || {})[it.id] === it.correctId ? 1 : 0), 0) / q.length; };
  // state = { used (sínteses), hints, picked, prediction }
  function scoreAnswer(caso, answer, state) {
    const ev = evaluateAnswer(caso, answer), jf = justificationFraction(caso.items, state.picked || {});
    const pf = predictionFraction(caso, state.predQual);
    const ef = efficiencyFraction(state.used || 0, caso.level.budget);
    return { ev, score: totalScore({ acerto: ev.acerto, mission: ev.mission, previsao: pf, eficiencia: ef, justificativa: jf, hints: state.hints, deliveryNumber: state.deliveryNumber }), previsaoFrac: pf, justificativaFrac: jf, eficienciaFrac: ef, used: state.used || 0 };
  }

  // Solver de referência: enumera material × D (0,05 nm) × monocamadas; entre os projetos que cumprem TODAS as
  // restrições escolhe o de maior folga (menor valor de max{|Δλ|/tol, η_min/η, T/T_máx, D_{tot}/D_máx}).
  function solveReference(caso) {
    let best = null;
    for (const key of MATERIAL_KEYS) {
      for (let D = D_MIN_NM; D <= CATALOG[key].dMaxNm + 1e-9; D += 0.05) {
        const Dr = Math.round(D * 100) / 100;
        for (let ml = 0; ml <= ML_MAX; ml += 1) {
          const em = synthesize({ material: key, D: Dr, ml });
          if (!em.valid) break;
          const dl = Math.abs(em.lambdaNm - caso.targetNm);
          if (dl > caso.level.tolNm || em.eta < caso.etaMin || em.tox > caso.toxMax || em.Dtot > caso.sizeMax) continue;
          const slack = Math.max(dl / caso.level.tolNm, caso.etaMin / em.eta, em.tox / caso.toxMax, em.Dtot / caso.sizeMax);
          if (!best || slack < best.slack) best = { material: key, D: Dr, ml, slack, em };
        }
      }
    }
    if (!best) return null;
    const em = best.em;
    return { material: best.material, D: best.D, ml: best.ml, slack: best.slack, rep: { lambdaNm: Math.round(em.lambdaNm), pOutPct: Math.round(em.e.pOut * 1000) / 10, etaPct: Math.round(em.eta * 1000) / 10 } };
  }
  // Materiais cujo gap volumétrico permite o alvo (λ_alvo < hc/E_g).
  const reachableMaterials = (targetNm) => MATERIAL_KEYS.filter((k) => CATALOG[k].bulkNm > targetNm);

  // ---------------------------------------------------------------- conceitos e dicas
  // Previsão qualitativa (antes de qualquer conta). A ordem das opções vem da semente.
  function qualPrediction(caso) {
    const base = [
      { id: "sinal", q: "Para o MESMO ponto, o comprimento de onda calculado com o poço infinito (Aula 5) é maior, menor ou igual ao do poço finito (Aula 8)?",
        opts: [{ id: "a", text: "menor (mais azul): o poço infinito dá E₁ maior que o finito", ok: true }, { id: "b", text: "maior (mais vermelho): o poço infinito dá E₁ menor que o finito", ok: false }, { id: "c", text: "igual: a cor só depende do tamanho e do gap, não do tipo de poço", ok: false }] },
      { id: "tamanho", q: "Para um ponto MENOR, a diferença de cor entre o poço infinito e o finito (em nm) cresce, cai ou fica igual?",
        opts: [{ id: "a", text: "cresce: no ponto menor a função de onda vaza mais e o erro do infinito aumenta", ok: true }, { id: "b", text: "cai: no ponto menor o confinamento domina, e os dois poços ficam mais parecidos", ok: false }, { id: "c", text: "fica igual: a diferença depende só da profundidade V₀ da barreira, não do tamanho", ok: false }] }];
    return base.map((it, k) => ({ id: it.id, q: it.q, options: caso.qualOrder[k].map((i) => it.opts[i]), correctId: "a" }));
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
      make("gap", "O que decide QUAIS materiais podem emitir no seu λ-alvo?", [
        { id: "a", text: "o gap volumétrico: o confinamento só soma energia ao gap, logo λ ≤ hc/E_g (limite vermelho)", ok: true },
        { id: "b", text: "a massa efetiva: o confinamento cresce com m* pequena, então qualquer λ se alcança com o D certo", ok: false },
        { id: "c", text: "a espessura da casca de ZnS: uma casca grossa reduz o gap do núcleo e leva a emissão ao vermelho do núcleo", ok: false },
        { id: "d", text: "a janela óptica do tecido: ela fixa o gap do material, e o gap fixa o λ de qualquer ponto", ok: false }], orders[0]),
      make("poco", "Por que o cálculo da cor usa o poço FINITO e não o infinito?", [
        { id: "a", text: "no finito a função de onda vaza para a barreira, a curvatura cai e E₁ fica menor que π²ħ²/(2mR²)", ok: true },
        { id: "b", text: "o poço infinito dá a energia correta do elétron e só falha para o buraco, que é bem mais pesado", ok: false },
        { id: "c", text: "o poço finito tem Eₙ ∝ n² exatos, como na Aula 5, e o infinito só vale para partículas livres", ok: false },
        { id: "d", text: "o poço infinito ignora o spin do elétron, e o poço finito o inclui no cálculo da energia E₁", ok: false }], orders[1]),
      make("casca", "Por que uma casca mais grossa aumenta o brilho (até um limite)?", [
        { id: "a", text: "tunelamento: a fração que chega à superfície cai como e^{−2κd} e a superfície captura menos", ok: true },
        { id: "b", text: "a casca desloca o gap do núcleo para o vermelho e leva a emissão a onde o detector é mais sensível", ok: false },
        { id: "c", text: "a casca aumenta a massa efetiva do elétron, que fica mais confinado no núcleo e recombina mais depressa", ok: false },
        { id: "d", text: "a casca absorve o fóton emitido pelo núcleo e o reemite com maior rendimento, como um fósforo", ok: false }], orders[2]),
    ];
  }
  function hintsFor(caso) {
    const ref = solveReference(caso), reach = reachableMaterials(caso.targetNm);
    return [
      `Dica 1: o confinamento só soma energia, então λ ≤ hc/E_g. Para λ_alvo = ${caso.targetNm} nm, os materiais que o gap permite são: ${reach.map((k) => `${k} (${formatPt(CATALOG[k].bulkNm, 0)} nm)`).join(", ") || "nenhum"}. O gap é condição necessária, não suficiente: núcleos de CdSe de até 8 nm só chegam a 644 nm.`,
      ref ? `Dica 2: no poço finito, ${ref.material} com núcleo entre ${formatPt(ref.D - 0.5, 1)} e ${formatPt(ref.D + 0.5, 1)} nm fica perto do alvo.` : "Dica 2: sem projeto viável.",
      ref ? `Dica 3: com a casca, η = ${formatPt(caso.etaMin * 100, 0)} % ou mais pede cerca de ${ref.ml - 1} a ${ref.ml + 1} monocamadas de ZnS (0,31 nm cada), sem passar de D_{tot} = ${formatPt(caso.sizeMax, 1)} nm.` : "Dica 3: sem projeto viável.",
    ];
  }

  // ---------------------------------------------------------------- auditoria
  function auditRows(caso, design) {
    const em = emitter(design);
    if (!em.valid) return [{ titulo: "Projeto sem estado ligado", formula: "o poço esférico precisa de z₀ > π/2 (Aula 8)", conta: em.reason || "—" }];
    const m = em.material, sci = (x) => formatSci(x, 2), pt = formatPt;
    return [
      { titulo: "1. Gap volumétrico (limite)", formula: "λ_máx = hc/E_g: o confinamento só soma energia",
        conta: `${m.name}: hc/E_g = 1239,84/${pt(m.gapEV, 2)} = ${pt(m.bulkNm, 0)} nm. Alvo ${pt(caso.targetNm, 0)} nm ${m.bulkNm > caso.targetNm ? "cabe" : "NÃO cabe"} neste material. Catálogo: ${MATERIAL_KEYS.map((k) => `${k} ${pt(CATALOG[k].bulkNm, 0)} nm`).join(", ")}.` },
      { titulo: "2. Poço finito (Aula 8, esfera l = 0)", formula: "z₀ = R√(2mV₀)/ħ; −cot z = √(z₀²/z² − 1) (ramo ímpar); E₁ = (ħ²/2m)(z/R)²",
        conta: `elétron: z₀ = ${pt(em.D / 2, 2)} nm × √(${pt(m.V0e, 2)}/(0,0381/${pt(m.me, 2)})) = ${pt(em.e.z0, 3)}; z = ${pt(em.e.z, 3)}; E₁ₑ = ${pt(em.e.EV, 3)} eV. Buraco: z₀ = ${pt(em.h.z0, 3)}; z = ${pt(em.h.z, 3)}; E₁ₕ = ${pt(em.h.EV, 3)} eV.` },
      { titulo: "3. Energia e cor do fóton", formula: "E = E_g + E₁ₑ + E₁ₕ; λ = hc/E",
        conta: `E = ${pt(m.gapEV, 2)} + ${pt(em.e.EV, 3)} + ${pt(em.h.EV, 3)} = ${pt(em.photonEV, 3)} eV; λ = ${pt(em.lambdaNm, 0)} nm.` },
      { titulo: "4. O poço infinito (Aula 5) erra", formula: "E₁ = π²ħ²/(2mR²) (mesma esfera)",
        conta: `elétron: ${pt(em.infiniteEV.e, 3)} eV contra ${pt(em.e.EV, 3)} eV: erra ${pt(em.errInfE, 0)} %; fóton ${pt(em.photonInfEV, 3)} eV ⇒ λ = ${pt(em.lambdaInfNm, 0)} nm (diferença ${pt(Math.abs(em.lambdaInfNm - em.lambdaNm), 0)} nm).` },
      { titulo: "5. Casca como barreira (Aula 7) e brilho", formula: "κ = √(2m*_{ZnS}(V₀ − E₁))/ħ; fuga = P_{fora} e^{−2κd}; η = η_{máx}/(1 + fuga/0,05)",
        conta: `d = ${em.ml} × 0,31 = ${pt(em.d, 2)} nm. Elétron: P_{fora} = ${pt(em.e.pOut * 100, 1)} %, κ = ${pt(em.ke, 2)} nm⁻¹, e^{−2κd} = ${sci(em.escE)}, fuga = ${sci(em.leakE)}. Buraco: P_{fora} = ${pt(em.h.pOut * 100, 1)} %, e^{−2κd} = ${sci(em.escH)}, fuga = ${sci(em.leakH)}. η = 0,90/(1 + ${sci(em.leak)}/0,05) = ${pt(em.eta * 100, 1)} %.` },
      { titulo: "6. Toxicidade e tamanho (EPR)", formula: "tox = N_{cátions} · peso · e^{−d/0,8 nm}; D_{tot} = D + 2d (tamanho para extravasamento e biodistribuição, EPR)",
        conta: `N = ${pt(em.cations, 0)} cátions; tox = ${pt(em.tox, 3)} (milhares de íons-equivalentes); D_{tot} = ${pt(em.D, 2)} + 2×${pt(em.d, 2)} = ${pt(em.Dtot, 2)} nm. Limiar de depuração renal: 5,5 nm HIDRODINÂMICO (Choi et al., Nat. Biotechnol. 25, 1165, 2007); o D_{tot} acima é inorgânico (o hidrodinâmico, com ligante e proteínas, passa de 15 nm). Nenhum projeto deste desafio cumpre a depuração renal, e nenhum ponto quântico de Cd está aprovado para uso humano.` },
      { titulo: "7. Casca, rede e limite didático", formula: "descasamento = (a_{núcleo} − a_{ZnS})/a_{núcleo}, com a_{ZnS} = 0,541 nm",
        conta: `${m.name}: a = ${pt(m.aNm, 3)} nm, descasamento ${pt(m.mismatchPct, 1)} % com o ZnS. Cascas grossas de ZnS exigem camadas intermediárias (CdS, ZnSe): por isso o desafio limita a casca a ${ML_MAX} ML e o núcleo de CdSe a ${pt(CATALOG.CdSe.dMaxNm, 0)} nm. Os níveis E₁ não dependem de d: a barreira de ZnS é tratada como infinita na energia (massa m*_{ZnS} = ${pt(ZNS.me, 2)} só entra na fuga e^{−2κd}).` },
    ];
  }
  const LIMITS = "Limite do modelo: catálogo sintético e didático (afinidades, massas e gaps de memória, incerteza ≈ ±0,3 eV em V₀). A esfera é o estado l = 0 do poço finito (aula 8) a T = 0, sem éxciton (atração elétron–buraco), sem estados de superfície nem desordem; a massa dos níveis é a do núcleo, sem condição de BenDaniel–Duke, e a massa da barreira de ZnS (m* = 0,28) só entra na fuga e^{−2κd}; a espessura da casca não entra nos níveis (barreira infinita), e a população térmica de níveis excitados (a 300 K o 1P do elétron e vários níveis do buraco estão povoados) não é tratada: o modelo emite só do fundamental. O escape de íons e o rendimento são modelos didáticos. Os diâmetros do modelo não coincidem com os de pontos reais (que emitem mais para o vermelho para o mesmo tamanho). D_{tot} indica o tamanho para extravasamento/biodistribuição (EPR), sem depuração renal (limiar de 5,5 nm hidrodinâmico, Choi et al. 2007); nenhum ponto quântico de Cd está aprovado para uso humano.";

  const api = {
    SALT, mulberry32, makeRng, randInt, pick, shuffle, clamp, parseSeed, WEIGHTS, HINT_COST, ramp, efficiencyFraction, totalScore, justificationFraction,
    niceTicks, tickDigits, listDigits, formatPt, formatSci, superscript, partial, CONCEPT_WEIGHTS, REDELIVERY_PENALTY,
    HBAR2_OVER_2ME_EV_NM2, HC_EV_NM, WINDOW_NM, ML_NM, ETA_MAX, LEAK_HALF, RELEASE_LENGTH_NM, D_MIN_NM, D_MAX_NM, ML_MAX, ZNS, CATALOG, MATERIAL_KEYS,
    freeEstimate, limitReason, synthesize, D_MAX_BY_MATERIAL, ZNS_LATTICE_NM, revealPolicy, conceptsCorrect, REVEAL_SCORE, REVEAL_DELIVERY, rhsZ, rootsZ, kappaA, outsideProbabilityClosed, wellLevelsEV, carrierSphere, infiniteSphereEV, wavelengthNm, shellKappaNm, emitter,
    LEVELS, predictionAnswer, qualPrediction, makeCase, evaluateDesign, evaluateAnswer, predictionFraction, scoreAnswer, solveReference, reachableMaterials, conceptItems, hintsFor, auditRows, LIMITS,
  };
  root.DesafioPhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

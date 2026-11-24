/* Desafio 1 — Espectrômetro misterioso (Aulas 1, 3 e 4).
 *
 * Núcleo físico e "regras do jogo" em funções puras (sem DOM), testadas por tests.js.
 * Origem das fórmulas:
 *   - efeito Compton, E' = E/(1 + (E/m_e c²)(1 − cos θ)), borda Compton (θ = 180° do fóton,
 *     elétron com T_max = E − E') e pico de retroespalhamento: Aula 1, exemplo "retroespalhamento
 *     em medicina nuclear" (Tc-99m: 49,8 keV e 90,7 keV; PET: 170,3 keV);
 *   - atenuação exponencial N = N₀ e^(−μx) com μ/ρ do NIST XCOM: Aula 1 (xcom-data.js);
 *   - largura natural de um nível, ħ/τ = 2Γ (Aula 4, exemplo do Tc-99m: 2,4×10⁻⁶ eV, 1,7×10⁻¹¹ de E);
 *   - estatística de Poisson (σ = √N): Aula 3 (incerteza como desvio padrão de uma distribuição).
 * EXTENSÕES (não estão nas notas; declaradas no GUIA-DIDATICO.md): forma do contínuo Compton pela
 * fórmula de Klein–Nishina, resolução do NaI EMPÍRICA R(E) = R₆₆₂·(E/661,7)^(−0,23) (7 % a 661,7 keV,
 * 10,0 % a 140,5 keV; o limite poissoniano daria E^(−1/2) e 15 % a 140 keV), eficiência de pico
 * parametrizada, retroespalhamento de 5 % dos eventos fora do fotopico, fundo, ruído.
 * Unidades: energia em keV, comprimento em cm, μ em 1/cm, μ/ρ em cm²/g, taxa em contagens/s (cps),
 * atividade em MBq, dose em µSv. Nenhuma função mistura sistemas de unidades.
 */
(function (root) {
  "use strict";
  const XCOM = typeof module === "object" && module.exports ? require("./xcom-data.js") : root.OriginsXCOM;

  // ------------------------------------------------------------------ constantes
  const MEC2 = 510.999;                 // keV, m_e c²
  const HBAR_EVS = 6.582119569e-16;     // eV·s
  const R_E_CM = 2.8179403262e-13;      // cm, raio clássico do elétron
  const NCH = 512;                      // canais do analisador
  const LLD_KEV = 12;                   // limiar inferior de discriminação (didático)
  const EPS_TOT = 0.01;                 // eficiência total (geometria × intrínseca), didática
  const BACKSCATTER_SHARE = 0.05;       // fração dos eventos não-fotopico que cai no pico de retroespalhamento (pico menor que o fotopico do Co-60)
  const DOSE_K = 0.13;                  // µSv·m²/(MBq·h·MeV): ordem de grandeza do kerma no ar (didático)
  const BENCH_M = 0.3;                  // distância fonte-operador (m)
  const CAL_ACTIVITY_MBQ = 0.2;         // atividade das fontes de calibração
  const R662_NOMINAL = 0.07;            // resolução nominal do NaI(Tl) a 661,7 keV (7 %)

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
  function erf(x) { // Abramowitz–Stegun 7.1.26, erro < 1,5×10⁻⁷
    const s = x < 0 ? -1 : 1, t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

  // ------------------------------------------------------------------ radionuclídeos e materiais
  // Energias e intensidades: valores de referência de tabelas padrão de decaimento (NNDC/DDEP),
  // arredondados; usados como "tabela de linhas" do desafio.
  const NUCLIDES = {
    tc99m: { name: "Tc-99m", lines: [{ E: 140.5, y: 0.89 }], main: 0, tauNs: 0.28 },
    i123: { name: "I-123", lines: [{ E: 159.0, y: 0.83 }], main: 0 },
    i131: { name: "I-131", lines: [{ E: 364.5, y: 0.815 }, { E: 637.0, y: 0.072 }, { E: 722.9, y: 0.0177 }], main: 0 },
    f18: { name: "F-18", lines: [{ E: 511.0, y: 1.934 }], main: 0 },
    cs137: { name: "Cs-137", lines: [{ E: 661.657, y: 0.851 }], main: 0 },
    co60: { name: "Co-60", lines: [{ E: 1173.2, y: 0.9985 }, { E: 1332.5, y: 0.9998 }], main: 1 },
  };
  const NUCLIDE_KEYS = Object.keys(NUCLIDES);
  const MATERIALS = {
    water: { name: "Água", rho: 1.0 },
    al: { name: "Alumínio", rho: 2.699 },
    fe: { name: "Ferro", rho: 7.874 },
    bone: { name: "Osso cortical", rho: 1.92 },
    lead: { name: "Chumbo", rho: 11.35 },
  };
  const MATERIAL_KEYS = Object.keys(MATERIALS);
  const MATERIAL_ORDER_BY_MU = ["water", "bone", "al", "fe", "lead"];
  // μ/ρ total (com espalhamento coerente), cm²/g, do NIST (Hubbell & Seltzer; XCOM), tabelas
  // elementares Z = 13 e Z = 26 (physics.nist.gov/PhysRefData/XrayMassCoef/ElemTab), 0,08–2 MeV.
  // Água, osso cortical (ICRU-44) e chumbo vêm de xcom-data.js (soma dos canais). Energia em MeV.
  const MUρ_EXTRA = {
    al: [[0.08, 0.2018], [0.1, 0.1704], [0.15, 0.1378], [0.2, 0.1223], [0.3, 0.1042], [0.4, 0.09276], [0.5, 0.08445], [0.6, 0.07802], [0.8, 0.06841], [1, 0.06146], [1.25, 0.05496], [1.5, 0.05006], [2, 0.04324]],
    fe: [[0.08, 0.5952], [0.1, 0.3717], [0.15, 0.1964], [0.2, 0.1460], [0.3, 0.1099], [0.4, 0.0940], [0.5, 0.08414], [0.6, 0.07704], [0.8, 0.06699], [1, 0.05995], [1.25, 0.0535], [1.5, 0.04883], [2, 0.04265]],
  };
  const MU_TABLES = {};
  const sumChannels = (rows) => rows.filter((r) => r[0] >= 0.08 && r[0] <= 2).map((r) => [r[0], r[1] + r[2] + r[3] + r[4] + r[5]]);
  if (XCOM) { MU_TABLES.water = sumChannels(XCOM.water); MU_TABLES.bone = sumChannels(XCOM.bone); MU_TABLES.lead = sumChannels(XCOM.lead); }
  MU_TABLES.al = MUρ_EXTRA.al; MU_TABLES.fe = MUρ_EXTRA.fe;

  // Interpolação log–log; numa borda de absorção (energia repetida) vale o lado de cima.
  function interpLogLog(table, E) {
    const e = Math.min(Math.max(E, table[0][0]), table[table.length - 1][0]);
    let i = 0; while (i < table.length - 2 && table[i + 1][0] <= e) i += 1;
    while (i < table.length - 2 && table[i + 1][0] === table[i][0]) i += 1;
    const a = table[i], b = table[i + 1];
    if (b[0] === a[0]) return b[1];
    return a[1] * Math.pow(b[1] / a[1], Math.log(e / a[0]) / Math.log(b[0] / a[0]));
  }
  const massAttenuation = (mat, EkeV) => interpLogLog(MU_TABLES[mat], EkeV / 1000);   // cm²/g
  const linearAttenuation = (mat, EkeV) => massAttenuation(mat, EkeV) * MATERIALS[mat].rho; // 1/cm

  // ------------------------------------------------------------------ cinemática Compton e Klein–Nishina
  // Aula 1: E' = E/(1 + (E/m_e c²)(1 − cos θ)); θ = 180°: E' = E/(1 + 2E/m_e c²).
  const backscatterEnergy = (E) => E / (1 + 2 * E / MEC2);
  const comptonEdge = (E) => E - backscatterEnergy(E);            // = E·2α/(1 + 2α), α = E/m_e c²
  // Extensão: dσ/dT por elétron (Klein–Nishina), s = T/E, α = E/m_e c². Fórmula do espectro do elétron
  // de recuo (p. ex. Knoll); ∫₀^{T_max} dσ/dT dT = σ_KN (teste).
  function kleinNishinaDsDT(E, T) {
    const a = E / MEC2, s = T / E;
    if (s <= 0 || s >= 2 * a / (1 + 2 * a)) return s <= 0 ? kleinNishinaDsDT(E, 1e-6) : 0;
    return Math.PI * R_E_CM * R_E_CM / (MEC2 * a * a) * (2 + s * s / (a * a * (1 - s) * (1 - s)) + s / (1 - s) * (s - 2 / a));
  }
  function kleinNishinaTotal(E) { // cm² por elétron
    const a = E / MEC2, l = Math.log(1 + 2 * a);
    return 2 * Math.PI * R_E_CM * R_E_CM * ((1 + a) / (a * a) * (2 * (1 + a) / (1 + 2 * a) - l / a) + l / (2 * a) - (1 + 3 * a) / ((1 + 2 * a) ** 2));
  }

  // ------------------------------------------------------------------ largura natural (Aula 4)
  const naturalWidthEV = (tauSeconds) => HBAR_EVS / tauSeconds;      // ħ/τ = 2Γ (largura a meia altura)

  // ------------------------------------------------------------------ resolução e eficiência do NaI (extensão)
  // Parametrização EMPÍRICA (extensão; não está nas notas): FWHM/E = R₆₆₂·(E/661,7)^(−0,23), isto é,
  // 7 % a 661,7 keV, 10,0 % a 140,5 keV, 8,1 % a 364,5 keV e 5,8 % a 1332 keV para R₆₆₂ = 7 %. O limite poissoniano
  // (estatística de fotoelétrons) daria E^(−1/2) e 15 % a 140 keV; o NaI(Tl) real fica entre os dois (9 a 12 %).
  const RES_EXP = 0.23;
  const fwhmRelative = (E, r662) => r662 * Math.pow(E / 661.657, -RES_EXP);
  const fwhmKeV = (E, r662) => E * fwhmRelative(E, r662);
  const sigmaKeV = (E, r662) => fwhmKeV(E, r662) / (2 * Math.sqrt(2 * Math.log(2)));
  const photoFraction = (E) => 1 / (1 + Math.pow(E / 700, 1.2));  // fração de pico, parametrização didática

  // ------------------------------------------------------------------ níveis e orçamentos
  const LEVELS = {
    1: { name: "Nível 1 · guiado", budgetS: 900, doseMaxUSv: 0.25, tol: 2, rateFactor: 1, hints: true },
    2: { name: "Nível 2 · livre", budgetS: 600, doseMaxUSv: 0.15, tol: 1, rateFactor: 1, hints: false },
    3: { name: "Nível 3 · desafio", budgetS: 300, doseMaxUSv: 0.08, tol: 0.8, rateFactor: 0.5, hints: false },
  };
  const HINT_PENALTY = [4, 6, 10], REDELIVERY_COST = 5;
  const hintCost = (n) => HINT_PENALTY.slice(0, Math.max(0, Math.min(3, n || 0))).reduce((a, b) => a + b, 0);
  const CONFIGS = {
    src0: { label: "fonte sem lâmina", plates: 0, kind: "src" },
    src1: { label: "fonte + 1 lâmina", plates: 1, kind: "src" },
    src2: { label: "fonte + 2 lâminas", plates: 2, kind: "src" },
    bg: { label: "fundo (sem fonte)", kind: "bg" },
    calCs: { label: "calibração Cs-137", kind: "cal", nuclide: "cs137" },
    calCo: { label: "calibração Co-60", kind: "cal", nuclide: "co60" },
    calF: { label: "calibração F-18", kind: "cal", nuclide: "f18" },
  };
  const CONFIG_KEYS = Object.keys(CONFIGS);

  // ------------------------------------------------------------------ caso escondido por semente
  function makeCase(seed, level = 2) {
    seed = Math.trunc(Number(seed)) || 1;
    const r = mulberry32(seed * 2654435761 + 12345);
    r(); r(); r();
    const nuclide = NUCLIDE_KEYS[Math.floor(r() * NUCLIDE_KEYS.length)];
    const material = MATERIAL_KEYS[Math.floor(r() * MATERIAL_KEYS.length)];
    const baseA = Math.pow(10, Math.log10(0.05) + r() * (Math.log10(0.4) - Math.log10(0.05)));   // MBq
    const gain = 3.0 + 0.8 * r();                                                                  // keV/canal
    const offset = -12 + 24 * r();                                                                 // keV
    const r662 = 0.066 + 0.012 * r();
    const bgCps = 6 + 8 * r();
    const u = 0.45 + 0.55 * r();                                                                   // μd de cada lâmina na linha principal
    const nuc = NUCLIDES[nuclide], mainLine = nuc.lines[nuc.main];
    const muMain = linearAttenuation(material, mainLine.E);
    const raw = u / muMain, mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
    const plateCm = Math.max(0.01, Math.round(raw / mag) * mag);                                  // 2 algarismos significativos
    const activity = baseA * LEVELS[level].rateFactor;
    return { seed, level, nuclide, material, activityMBq: activity, gain, offset, r662, bgCps, plateCm, mainLine, mu: muMain };
  }

  // ------------------------------------------------------------------ espectro esperado (cps por canal)
  const chanEnergy = (caso, x) => caso.offset + caso.gain * x;      // x: coordenada de canal (canal i cobre [i, i+1))
  function addGaussian(out, caso, E0, area) {
    const sg = sigmaKeV(E0, caso.r662), g = caso.gain;
    const iLo = Math.max(0, Math.floor((E0 - 5 * sg - caso.offset) / g)), iHi = Math.min(NCH - 1, Math.ceil((E0 + 5 * sg - caso.offset) / g));
    for (let i = iLo; i <= iHi; i += 1) {
      const lo = chanEnergy(caso, i), hi = lo + g;
      out[i] += area * (Phi((hi - E0) / sg) - Phi((lo - E0) / sg));
    }
  }
  function addContinuum(out, caso, E, area) {
    const Tmax = comptonEdge(E), n = Math.ceil(Tmax / 0.5), g = caso.gain;
    const f = new Float64Array(n); let norm = 0;
    const step = Tmax / n;
    for (let k = 0; k < n; k += 1) { f[k] = kleinNishinaDsDT(E, (k + 0.5) * step); norm += f[k] * step; }
    for (let k = 0; k < n; k += 1) {
      const T = (k + 0.5) * step, w = area * f[k] * step / norm, sg = sigmaKeV(Math.max(T, 5), caso.r662);
      const iLo = Math.max(0, Math.floor((T - 4.5 * sg - caso.offset) / g)), iHi = Math.min(NCH - 1, Math.ceil((T + 4.5 * sg - caso.offset) / g));
      for (let i = iLo; i <= iHi; i += 1) { const lo = chanEnergy(caso, i); out[i] += w * (Phi((lo + g - T) / sg) - Phi((lo - T) / sg)); }
    }
  }
  function lineRates(caso, config) { // [{E, y, rate}] em cps no detector (já com blindagem)
    const c = CONFIGS[config];
    if (c.kind === "bg") return [];
    const nuc = NUCLIDES[c.kind === "cal" ? c.nuclide : caso.nuclide];
    const A = (c.kind === "cal" ? CAL_ACTIVITY_MBQ : caso.activityMBq) * 1e6;
    const atten = (E) => c.kind === "src" ? Math.exp(-linearAttenuation(caso.material, E) * c.plates * caso.plateCm) : 1;
    return nuc.lines.map((l) => ({ E: l.E, y: l.y, rate: A * l.y * EPS_TOT * atten(l.E) }));
  }
  const rateCache = new Map();
  function modelRates(caso, config) {
    const key = `${caso.seed}|${caso.level}|${config}`;
    if (rateCache.has(key)) return rateCache.get(key);
    const out = new Float64Array(NCH);
    for (const l of lineRates(caso, config)) {
      const fp = photoFraction(l.E), rest = 1 - fp;
      addGaussian(out, caso, l.E, l.rate * fp);
      addGaussian(out, caso, backscatterEnergy(l.E), l.rate * rest * BACKSCATTER_SHARE);
      addContinuum(out, caso, l.E, l.rate * rest * (1 - BACKSCATTER_SHARE));
    }
    // fundo ambiente: contínuo decrescente + pico do K-40 (1460,8 keV, 3 % da taxa de fundo)
    const bg = new Float64Array(NCH); let sum = 0;
    for (let i = 0; i < NCH; i += 1) { const E = chanEnergy(caso, i + 0.5); bg[i] = E < LLD_KEV ? 0 : Math.exp(-E / 300) + 0.25 * Math.exp(-E / 1000); sum += bg[i]; }
    const bgArea = caso.bgCps * 0.97; for (let i = 0; i < NCH; i += 1) out[i] += bgArea * bg[i] / sum;
    addGaussian(out, caso, 1460.82, caso.bgCps * 0.03);
    for (let i = 0; i < NCH; i += 1) if (chanEnergy(caso, i + 0.5) < LLD_KEV) out[i] = 0;
    rateCache.set(key, out);
    return out;
  }
  // Um segundo de aquisição: contagens de Poisson por canal, semente = (caso, configuração, segundo).
  function acquireSecond(caso, config, secondIndex) {
    const lam = modelRates(caso, config), rng = mulberry32(hash3(caso.seed * 31 + caso.level, CONFIG_KEYS.indexOf(config) + 1, secondIndex));
    const out = new Int32Array(NCH);
    for (let i = 0; i < NCH; i += 1) out[i] = poisson(lam[i], rng);
    return out;
  }
  function doseRateUSvh(caso, config) {
    const c = CONFIGS[config];
    if (c.kind === "bg") return 0;
    const nuc = NUCLIDES[c.kind === "cal" ? c.nuclide : caso.nuclide], A = c.kind === "cal" ? CAL_ACTIVITY_MBQ : caso.activityMBq;
    return DOSE_K * A * nuc.lines.reduce((s, l) => s + l.y * l.E / 1000, 0) / (BENCH_M * BENCH_M);
  }

  // ------------------------------------------------------------------ bancada: orçamento e aquisições
  class Lab {
    constructor(caso) {
      this.caso = caso; this.params = LEVELS[caso.level];
      this.spectra = {}; this.live = {}; this.timeS = 0; this.doseUSv = 0; this.count = 0;
      CONFIG_KEYS.forEach((k) => { this.spectra[k] = new Int32Array(NCH); this.live[k] = 0; });
    }
    get budgetS() { return this.params.budgetS; }
    get doseMax() { return this.params.doseMaxUSv; }
    costFraction() { return Math.max(this.timeS / this.params.budgetS, this.doseUSv / this.params.doseMaxUSv); }
    remainingS() { return Math.max(0, Math.floor(Math.min(this.params.budgetS - this.timeS, (this.params.doseMaxUSv - this.doseUSv) / (Math.max(1e-12, doseRateUSvh(this.caso, "src0")) / 3600)))); }
    canAcquire(config, seconds) {
      return this.timeS + seconds <= this.params.budgetS + 1e-9 && this.doseUSv + doseRateUSvh(this.caso, config) * seconds / 3600 <= this.params.doseMaxUSv + 1e-12;
    }
    // adiciona 1 s (para a animação); devolve false se estourar o orçamento
    step(config) {
      if (!this.canAcquire(config, 1)) return false;
      const s = acquireSecond(this.caso, config, this.live[config]), a = this.spectra[config];
      for (let i = 0; i < NCH; i += 1) a[i] += s[i];
      this.live[config] += 1; this.timeS += 1; this.doseUSv += doseRateUSvh(this.caso, config) / 3600; this.count += 1;
      return true;
    }
    acquire(config, seconds) { let done = 0; for (let k = 0; k < seconds; k += 1) { if (!this.step(config)) break; done += 1; } return done; }
    total(config) { let s = 0; const a = this.spectra[config]; for (let i = 0; i < NCH; i += 1) s += a[i]; return s; }
  }

  // ------------------------------------------------------------------ análise (o que a bancada oferece ao aluno)
  const sumRange = (counts, lo, hi) => { let s = 0; for (let i = Math.max(0, lo); i <= Math.min(NCH - 1, hi); i += 1) s += counts[i]; return s; };
  function smooth(counts, w) {
    if (w <= 1) return Float64Array.from(counts);
    const h = (w - 1) >> 1, out = new Float64Array(counts.length);
    for (let i = 0; i < counts.length; i += 1) { let s = 0, n = 0; for (let j = i - h; j <= i + h; j += 1) if (j >= 0 && j < counts.length) { s += counts[j]; n += 1; } out[i] = s / n; }
    return out;
  }
  // Contagem líquida na ROI [lo, hi] (canais inclusivos): fundo = trapézio entre as médias de m canais
  // de cada lado; σ² = G + (n/2m)²(B_esq + B_dir) (propagação de Poisson).
  function roiNet(counts, lo, hi, m = 3) {
    lo = Math.max(m, Math.min(lo, hi)); hi = Math.min(NCH - 1 - m, Math.max(lo, hi));
    const n = hi - lo + 1, gross = sumRange(counts, lo, hi), bl = sumRange(counts, lo - m, lo - 1), br = sumRange(counts, hi + 1, hi + m);
    const base = n * (bl + br) / (2 * m), net = gross - base, sigma = Math.sqrt(Math.max(1, gross + Math.pow(n / (2 * m), 2) * (bl + br)));
    return { lo, hi, n, gross, base, net, sigma };
  }
  function solve3(A, b) { // eliminação de Gauss 3×3
    const M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < 3; c += 1) {
      let p = c; for (let r = c + 1; r < 3; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-14) return null;
      for (let r = 0; r < 3; r += 1) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k += 1) M[r][k] -= f * M[c][k]; }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }
  function nelderMead(f, x0, steps, iters = 120) {
    const n = x0.length, pts = [x0.slice()];
    for (let i = 0; i < n; i += 1) { const p = x0.slice(); p[i] += steps[i]; pts.push(p); }
    let vals = pts.map(f);
    for (let it = 0; it < iters; it += 1) {
      const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]); const P = idx.map((i) => pts[i]), V = idx.map((i) => vals[i]);
      const c = P[0].map((_, k) => (P[0][k] + P[1][k]) / 2), w = P[n];
      const refl = c.map((v, k) => v + (v - w[k])), fr = f(refl);
      let next, nv;
      if (fr < V[0]) { const ex = c.map((v, k) => v + 2 * (v - w[k])), fe = f(ex); if (fe < fr) { next = ex; nv = fe; } else { next = refl; nv = fr; } }
      else if (fr < V[n - 1]) { next = refl; nv = fr; }
      else { const co = c.map((v, k) => v + 0.5 * (w[k] - v)), fc = f(co); if (fc < V[n]) { next = co; nv = fc; } else { for (let i = 1; i <= n; i += 1) { P[i] = P[0].map((v, k) => v + 0.5 * (P[i][k] - v)); V[i] = f(P[i]); } next = null; } }
      if (next) { P[n] = next; V[n] = nv; }
      pts.length = 0; vals = []; P.forEach((p, i) => { pts.push(p); vals.push(V[i]); });
    }
    let b = 0; vals.forEach((v, i) => { if (v < vals[b]) b = i; }); return pts[b];
  }
  // Ajuste gaussiano + fundo linear na ROI (mínimos quadrados ponderados por 1/max(y,1); amplitude e
  // fundo resolvidos linearmente, μ e σ por Nelder–Mead). Devolve μ e σ em coordenadas de canal.
  function fitGauss(counts, lo, hi, bgOrder = 1) {   // bgOrder 0: fundo constante (janelas estreitas, p. ex. dubleto do Co-60); 1: fundo linear
    lo = Math.max(0, lo); hi = Math.min(NCH - 1, hi);
    const n = hi - lo + 1; if (n < 6) return null;
    // pesos 1/y com y = média móvel de 5 canais: o peso 1/contagem bruta (χ² de Neyman) enviesa a largura para baixo
    const sm = smooth(counts, 5), wsm = sm; let mx = lo; for (let i = lo; i <= hi; i += 1) if (sm[i] > sm[mx]) mx = i;
    const basis = (mu, sg) => { const g = new Float64Array(n); for (let k = 0; k < n; k += 1) { const x0 = lo + k; g[k] = Phi((x0 + 1 - mu) / sg) - Phi((x0 - mu) / sg); } return g; };
    const lsq = (mu, sg) => {
      const g = basis(mu, sg), A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
      for (let k = 0; k < n; k += 1) {
        const w = 1 / Math.max(1, wsm[lo + k]), t = bgOrder ? (k - n / 2) / n : 0, v = [g[k], 1, t];
        for (let r = 0; r < 3; r += 1) { b[r] += w * v[r] * counts[lo + k]; for (let c = 0; c < 3; c += 1) A[r][c] += w * v[r] * v[c]; }
      }
      if (!bgOrder) A[2][2] = 1;
      const sol = solve3(A, b); if (!sol) return { chi: 1e30, sol: [0, 0, 0], g };
      let chi = 0; for (let k = 0; k < n; k += 1) { const t = bgOrder ? (k - n / 2) / n : 0, mdl = sol[0] * g[k] + sol[1] + sol[2] * t, d = counts[lo + k] - mdl; chi += d * d / Math.max(1, wsm[lo + k]); }
      return { chi, sol, g };
    };
    const obj = (p) => { const sg = Math.exp(p[1]); return (sg < 0.4 || sg > n) ? 1e30 : lsq(p[0], sg).chi; };
    const sg0 = Math.max(1.2, n / 7), best = nelderMead(obj, [mx + 0.5, Math.log(sg0)], [1, 0.25]);
    const mu = best[0], sigma = Math.exp(best[1]), r = lsq(mu, sigma), area = r.sol[0];
    let bsum = 0; for (let k = 0; k < n; k += 1) { const x = lo + k + 0.5; if (Math.abs(x - mu) < 2.5 * sigma) bsum += r.sol[1] + r.sol[2] * (k - n / 2) / n; }
    return { mu, sigma, fwhm: 2.354820045 * sigma, area, b0: r.sol[1], b1: r.sol[2], nroi: n, areaErr: Math.sqrt(Math.max(1, Math.abs(area) + Math.max(0, bsum))), chi2: r.chi / Math.max(1, n - 5), lo, hi };
  }

  // calibração em dois pontos: E = E₀ + g·x
  function calibrate(x1, E1, x2, E2) {
    if (!(x1 !== x2) || !Number.isFinite(x1 + x2 + E1 + E2)) return null;
    const g = (E2 - E1) / (x2 - x1); return { g, E0: E1 - g * x1 };
  }
  const energyOf = (cal, x) => cal.E0 + cal.g * x;
  const channelOf = (cal, E) => (E - cal.E0) / cal.g;

  // Picos significativos (janela central ± w canais; fundo dos dois lados), ordenados por área líquida.
  function findPeaks(counts, cal, opts = {}) {
    const minSig = opts.minSig || 6, r662 = opts.r662 || R662_NOMINAL, found = [];
    const net = new Float64Array(NCH), sig = new Float64Array(NCH);
    for (let i = 8; i < NCH - 8; i += 1) {
      const E = energyOf(cal, i + 0.5); if (E < 30) continue;
      const w = Math.max(2, Math.round(fwhmKeV(E, r662) / cal.g * 0.6)), m = Math.max(3, Math.round(w / 2) + 1);
      if (i - w - m < 0 || i + w + m >= NCH) continue;
      const r = roiNet(counts, i - w, i + w, m); net[i] = r.net; sig[i] = r.net / r.sigma;
    }
    for (let i = 9; i < NCH - 9; i += 1) {
      if (sig[i] < minSig || net[i] < net[i - 1] || net[i] <= net[i + 1]) continue;
      let ok = true; for (let j = -4; j <= 4; j += 1) if (net[i + j] > net[i]) ok = false;
      if (ok) found.push({ x: i + 0.5, net: net[i], sig: sig[i] });
    }
    return found.sort((a, b) => b.net - a.net);
  }
  // Leitura da borda Compton: ponto de maior queda do espectro suavizado (derivada mínima) numa janela
  // [lo, hi] em keV (o aluno olha onde a fórmula manda olhar e confirma no espectro).
  function readEdge(counts, cal, loKeV, hiKeV, r662 = R662_NOMINAL) {
    const Emid = (loKeV + hiKeV) / 2, sgCh = Math.max(1.5, 0.7 * sigmaKeV(Emid, r662) / cal.g), half = Math.ceil(3 * sgCh);
    const ker = []; let ks = 0; for (let j = -half; j <= half; j += 1) { const v = Math.exp(-j * j / (2 * sgCh * sgCh)); ker.push(v); ks += v; }
    const sm = new Float64Array(NCH); for (let i = 0; i < NCH; i += 1) { let s = 0, w = 0; for (let j = -half; j <= half; j += 1) { const k = i + j; if (k >= 0 && k < NCH) { s += ker[j + half] * counts[k]; w += ker[j + half]; } } sm[i] = s / w; }
    const a = Math.max(half + 1, Math.floor(channelOf(cal, loKeV))), b = Math.min(NCH - 2, Math.ceil(channelOf(cal, hiKeV)));
    let best = a, bd = Infinity;
    for (let i = a; i <= b; i += 1) { const d = sm[i + 1] - sm[i - 1]; if (d < bd) { bd = d; best = i; } }
    return energyOf(cal, best + 0.5);
  }
  // atenuação: μ = ln(R₀/R₁)/Δx, com R = N/t (taxas líquidas); σ_μ pela propagação de σ_N.
  function muFromNets(n0, s0, t0, n1, s1, t1, dx) {
    const r0 = n0 / t0, r1 = n1 / t1; if (!(r0 > 0) || !(r1 > 0) || !(dx > 0)) return null;
    return { mu: Math.log(r0 / r1) / dx, sigma: Math.sqrt((s0 / n0) ** 2 + (s1 / n1) ** 2) / dx };
  }
  const muTable = (E) => MATERIAL_KEYS.map((k) => ({ key: k, name: MATERIALS[k].name, rho: MATERIALS[k].rho, massMu: massAttenuation(k, E), mu: linearAttenuation(k, E) }));
  function nearestMaterial(mu, E) { let best = null, bd = Infinity; for (const m of muTable(E)) { const d = Math.abs(Math.log(mu / m.mu)); if (d < bd) { bd = d; best = m.key; } } return best; }
  function nearestNuclide(E) {
    let best = null, bd = Infinity;
    NUCLIDE_KEYS.forEach((k) => NUCLIDES[k].lines.forEach((l) => { const d = Math.abs(l.E - E); if (d < bd) { bd = d; best = k; } }));
    return best;
  }
  // bordas aceitas como resposta: linhas com y ≥ 0,5 (Co-60: 963,2 e 1118,1 keV)
  const acceptedEdges = (nuclide) => NUCLIDES[nuclide].lines.filter((l) => l.y >= 0.5).map((l) => comptonEdge(l.E));

  // ------------------------------------------------------------------ pontuação (0–100), padrão comum dos seis desafios
  // Acerto 50 = restrições 40 (radionuclídeo 12, material 12, borda Compton 8, FWHM/E 8; perda linear, zero a 25 % de erro)
  //           + valores calculados 10 (ganho g 5, μ medido 5; crédito 1 até a tolerância, zero a 4× a tolerância).
  // Previsão 10 (2 + 2 qualitativas e 6 numérica; ver PRED_PARTS) · Eficiência 15 (regra comum: cheia até 50 % do orçamento
  // usado, linear até zero em 100 %, × fração da missão cumprida ao QUADRADO) · Justificativa 25 (8 + 8 + 9)
  // − dicas (4, 6 e 10) − 5 por entrega adicional. A nota é monótona no erro. Regra comum dos seis desafios:
  // tolerância de zero a 25 % de violação (partial), eficiência cheia até 50 % do orçamento (efficiencyFactor).
  const WEIGHTS = { nuclide: 12, material: 12, edge: 8, fwhm: 8, gain: 5, mu: 5, prediction: 10, efficiency: 15, c1: 8, c2: 8, c3: 9 };
  const PRED_PARTS = { q1: 2, q2: 2, num: 6 };                                           // soma = WEIGHTS.prediction
  const PRED_TOL = 0.05;                                                                 // tolerância relativa da previsão numérica
  const GUIDE_LINES = [140.5, 159.0, 364.5, 511.0, 637.0, 661.657, 722.9, 1173.2, 1332.5];   // linhas das tabelas e dos calibradores
  // Previsão da semente: energia E de um fóton HIPOTÉTICO (não é a linha da fonte escondida: afasta-se ≥ 25 keV de
  // qualquer linha da tabela e ≥ 30 keV de E = m_ec²/2 = 255,5 keV, onde a borda e o retroespalhamento valem E/2).
  // O lado (E acima ou abaixo de 255,5 keV) é sorteado primeiro, para que os dois resultados qualitativos apareçam.
  //   q1: a borda Compton E_c fica acima ou abaixo de E/2?  (E_c > E/2 ⇔ E > m_ec²/2)
  //   q2: o retroespalhamento E′ fica acima ou abaixo de E/2? (E′ = E − E_c: sempre o oposto de q1)
  //   num: valor da borda E_c em keV (tolerância de 5 %).
  function predictionFor(seed) {
    const r = mulberry32(hash3(Math.trunc(Number(seed)) || 1, 91, 5)), ok = (E) => GUIDE_LINES.every((L) => Math.abs(E - L) >= 25) && Math.abs(E - MEC2 / 2) >= 30;
    const lowSide = r() < 0.4, cand = [];
    for (let E = 60; E <= 1000; E += 5) if (ok(E) && (E < MEC2 / 2) === lowSide) cand.push(E);
    const E = cand[Math.floor(r() * cand.length)], edge = comptonEdge(E), bs = backscatterEnergy(E);
    return { E, edge, bs, q1: edge > E / 2 ? "above" : "below", q2: bs > E / 2 ? "above" : "below" };
  }
  const efficiencyFactor = (f) => (f <= 0.5 ? 1 : Math.max(0, (1 - f) / 0.5));         // regra comum dos seis desafios
  const partial = (rel) => Math.max(0, 1 - 4 * Math.max(0, rel));                       // restrição: zero a 25 % de violação
  const valueCredit = (got, want, tol) => (Number.isFinite(got) && want > 0 ? Math.max(0, Math.min(1, 1 - (Math.abs(got - want) / want - tol) / (3 * tol))) : 0);
  const numScore = (err, tol) => Math.max(0, Math.min(1, (3 - Math.abs(err) / tol) / 2));   // usado na previsão
  const edgeTol = (nuclide, level) => LEVELS[level].tol * Math.max(10, 0.06 * comptonEdge(NUCLIDES[nuclide].lines[NUCLIDES[nuclide].main].E));
  const fwhmTolRel = (level) => 0.10 * LEVELS[level].tol;          // erro relativo aceito em FWHM/E
  const gainTolRel = (level) => 0.02 * LEVELS[level].tol, muTolRel = (level) => 0.10 * LEVELS[level].tol;
  function trueFwhmPct(caso) { return 100 * fwhmRelative(caso.mainLine.E, caso.r662); }
  // FWHM/E verdadeira (%) em cada linha forte (y ≥ 0,5): o Co-60 tem duas (1173,2 e 1332,5 keV: 6,6 % de diferença), e quem mede qualquer uma acerta
  const trueFwhmPcts = (caso) => NUCLIDES[caso.nuclide].lines.filter((l) => l.y >= 0.5).map((l) => 100 * fwhmRelative(l.E, caso.r662));
  // μ verdadeiro em cada linha forte do radionuclídeo (o aluno pode ter medido numa delas)
  const trueMus = (caso) => NUCLIDES[caso.nuclide].lines.filter((l) => l.y >= 0.5).map((l) => linearAttenuation(caso.material, l.E));
  // Opções de mesmo tamanho e mesma forma ("grandeza medida, qualificador, comparada com a referência"); cada distrator é
  // uma concepção alternativa verdadeira (altura = identidade; borda = pico; deslocamento do pico; largura natural).
  // A ordem muda por semente e a cada entrega (shuffledOptions); a letra exibida é a da posição.
  const CONCEPTS = [
    { id: "c1", weight: WEIGHTS.c1, question: "O que identificou o radionuclídeo?",
      options: [["a", "a posição do fotopico, lida depois de calibrar canal em keV com duas linhas, comparada com a tabela de linhas"],
        ["b", "a altura do pico mais intenso, lida sem precisar de calibração, comparada com a tabela de intensidades de emissão"],
        ["c", "a posição da borda Compton, tomada como o pico principal e lida em keV após calibrar, comparada com a tabela de linhas"],
        ["d", "a largura do fotopico, lida em keV depois do ajuste gaussiano, comparada com a tabela de larguras dos níveis"]], correct: "a",
      lesson: "Aula 1: o fotopico mede a energia do fóton; a borda Compton é só a energia máxima do elétron de recuo" },
    { id: "c2", weight: WEIGHTS.c2, question: "O que identificou o material da blindagem?",
      options: [["a", "a razão das taxas do fotopico com e sem lâmina, ln(R₀/R₁)/d, comparada com μ(E) do XCOM na energia do fotopico"],
        ["b", "o deslocamento da energia do fotopico com e sem lâmina, em keV, comparado com a perda de energia por cm de cada material"],
        ["c", "o alargamento da FWHM do fotopico com e sem lâmina, em %, comparado com o espalhamento angular de cada material"],
        ["d", "a variação da energia da borda Compton com e sem lâmina, em keV, comparada com a energia de ligação de cada material"]], correct: "a",
      lesson: "Aula 1: atenuação exponencial com μ/ρ do XCOM; a blindagem de feixe estreito reduz a taxa, não a energia" },
    { id: "c3", weight: WEIGHTS.c3, question: "A largura natural do nível (Aula 4: ħ/τ ≈ 2×10⁻⁶ eV no Tc-99m) explica a largura do fotopico?",
      options: [["a", "sim: a largura medida é a largura natural ħ/τ do nível, que o NaI apenas registra sem alargar, em qualquer energia"],
        ["b", "não: ħ/τ é ≈ 10⁻¹¹ de E; a largura medida vem da estatística de fotoelétrons e da coleta de luz do cristal de NaI"],
        ["c", "não: ħ/τ é ≈ 10⁻¹¹ de E; a largura medida vem do efeito Doppler da agitação térmica dos núcleos da fonte selada"],
        ["d", "sim: a largura medida é ħ/τ alargada pelo Doppler da fonte, e por isso é uma característica de cada núcleo"]], correct: "b",
      lesson: "Aula 4: Γ = ħ/τ é minúscula frente à resolução do detector; Aula 3: a largura medida é estatística" },
  ];
  // ordem das opções determinística por semente e por entrega (delivery = 0, 1, 2, …)
  function shuffledOptions(seed, concept, delivery = 0) {
    const r = mulberry32(hash3(seed, concept.id.charCodeAt(1), 7 + 1009 * Math.max(0, delivery | 0))), a = concept.options.slice();
    for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const conceptsCorrect = (input) => CONCEPTS.filter((c) => input[c.id] === c.correct).length;
  // input: { nuclide, material, edgeKeV, fwhmPct, gainKeV, muCm, c1, c2, c3, predQ1, predQ2, prediction (keV), hintsUsed (0–3), deliveries }
  function score(caso, lab, input) {
    const L = LEVELS[caso.level], parts = [];
    const add = (key, label, pts, max, note, reveals = false) => parts.push({ key, label, pts, max, note, reveals, group: key[0] === "c" && key.length === 2 ? "concept" : "item" });   // reveals: a nota deixa o valor verdadeiro à mostra
    const ok = (a, b) => (a === b ? 1 : 0);
    const sgn = (e) => `${e >= 0 ? "+" : "−"}${formatPt(Math.abs(e), 1)}`;
    add("nuclide", "Radionuclídeo", WEIGHTS.nuclide * ok(input.nuclide, caso.nuclide), WEIGHTS.nuclide, input.nuclide === caso.nuclide ? "correto" : "incorreto");
    add("material", "Material da blindagem", WEIGHTS.material * ok(input.material, caso.material), WEIGHTS.material, input.material === caso.material ? "correto" : "incorreto");
    let sEdge = 0, note = "sem resposta";
    if (Number.isFinite(input.edgeKeV)) {
      const tol = edgeTol(caso.nuclide, caso.level), edges = acceptedEdges(caso.nuclide), errs = edges.map((E) => input.edgeKeV - E);
      const i = errs.reduce((b, e, k) => (Math.abs(e) < Math.abs(errs[b]) ? k : b), 0);
      sEdge = partial(Math.max(0, Math.abs(errs[i]) - tol) / edges[i]); note = `diferença de ${sgn(errs[i])} keV (tolerância ${formatPt(tol, 1)} keV)`;
    }
    add("edge", "Borda Compton lida", WEIGHTS.edge * sEdge, WEIGHTS.edge, note, true);
    let sF = 0, nF = "sem resposta";
    if (Number.isFinite(input.fwhmPct)) { const es = trueFwhmPcts(caso).map((t) => input.fwhmPct / t - 1), e = es.reduce((b, v) => (Math.abs(v) < Math.abs(b) ? v : b), es[0]); sF = partial(Math.max(0, Math.abs(e) - fwhmTolRel(caso.level))); nF = `erro relativo ${sgn(100 * e)} % (tolerância ${formatPt(100 * fwhmTolRel(caso.level), 0)} %)`; }
    add("fwhm", "Largura relativa FWHM/E", WEIGHTS.fwhm * sF, WEIGHTS.fwhm, nF, true);
    const mission = parts.reduce((s, p) => s + p.pts, 0), missionMax = parts.reduce((s, p) => s + p.max, 0);
    const gc = valueCredit(input.gainKeV, caso.gain, gainTolRel(caso.level));
    add("gain", "Valor calculado: ganho g (keV/canal)", WEIGHTS.gain * gc, WEIGHTS.gain, `tolerância ${formatPt(100 * gainTolRel(caso.level), 1)} %`);
    const mc = Math.max(0, ...trueMus(caso).map((m) => valueCredit(input.muCm, m, muTolRel(caso.level))));
    add("mu", "Valor calculado: μ medido (cm⁻¹)", WEIGHTS.mu * mc, WEIGHTS.mu, `tolerância ${formatPt(100 * muTolRel(caso.level), 0)} %`);
    const pr = predictionFor(caso.seed);
    const sQ1 = input.predQ1 === pr.q1 ? 1 : 0, sQ2 = input.predQ2 === pr.q2 ? 1 : 0;
    const sP = Number.isFinite(input.prediction) && input.prediction > 0 ? numScore(input.prediction / pr.edge - 1, PRED_TOL) : 0;
    add("prediction", "Previsão registrada (2 qualitativas e a borda numérica)", PRED_PARTS.q1 * sQ1 + PRED_PARTS.q2 * sQ2 + PRED_PARTS.num * sP, WEIGHTS.prediction,
      Number.isFinite(input.prediction) ? `${sQ1 + sQ2} de 2 qualitativas certas; borda prevista ${formatPt(input.prediction, 0)} keV` : "não registrada");
    const f = lab.costFraction(), frac = missionMax > 0 ? mission / missionMax : 0, eff = efficiencyFactor(f);
    add("efficiency", "Eficiência do orçamento", WEIGHTS.efficiency * eff * frac * frac, WEIGHTS.efficiency, `uso do orçamento ${formatPt(f * 100, 0)} %, ponderado pela missão cumprida ao quadrado`);
    CONCEPTS.forEach((c) => add(c.id, `Conceito: ${c.question}`, c.weight * ok(input[c.id], c.correct), c.weight, input[c.id] === c.correct ? "correto" : "incorreto"));
    const sub = parts.reduce((s, p) => s + p.pts, 0), acerto = mission + gc * WEIGHTS.gain + mc * WEIGHTS.mu;
    const hints = L.hints ? hintCost(input.hintsUsed) : 0, redo = REDELIVERY_COST * Math.max(0, (input.deliveries || 1) - 1);
    return { total: Math.max(0, Math.min(100, sub - hints - redo)), parts, acerto, mission: frac, hintsPenalty: hints, redeliveryPenalty: redo, costFraction: f, deliveries: input.deliveries || 1, conceptsRight: conceptsCorrect(input) };
  }

  // ------------------------------------------------------------------ solver de referência (independente da verdade do caso)
  // Usa só o que o aluno tem: aquisições da bancada, calibração com Cs-137 e Co-60, ajustes e tabelas.
  // Calibração automática: 15 s de Cs-137 e 15 s de Co-60, centroides por ajuste gaussiano e reta por dois pontos.
  // O solver a usa dentro do orçamento; a aplicação a oferece PRÉ-FEITA no nível 1 (sem gastar orçamento).
  function autoCalibrate(lab, seconds = 15) {
    lab.acquire("calCs", seconds); lab.acquire("calCo", seconds);
    const peakOf = (cfg) => { // picos locais fortes do espectro suavizado; o de maior canal é o de maior energia
      const sp = lab.spectra[cfg], sm = smooth(sp, 7), loc = [];
      for (let i = 20; i < NCH - 10; i += 1) if (sm[i] > sm[i - 1] && sm[i] >= sm[i + 1] && sm[i] > 15) { let ok = true; for (let j = -12; j <= 12; j += 1) if (i + j >= 0 && i + j < NCH && sm[i + j] > sm[i]) ok = false; if (ok) loc.push(i); }
      loc.sort((a, b) => b - a); return { sp, loc };
    };
    const cs = peakOf("calCs"), co = peakOf("calCo");
    const fitAround = (sp, x, Eexp) => { const w = Math.round(1.0 * fwhmKeV(Eexp, R662_NOMINAL) / 3.4); return fitGauss(sp, Math.round(x - w), Math.round(x + w)); };   // janela ≈ ±1 FWHM (3,4 keV/canal nominal): evita o dubleto do Co-60
    // Cs: o pico de maior energia; Co: o de maior energia (1332,5)
    const csFit = fitAround(cs.sp, cs.loc[0], 661.657), coFit = fitAround(co.sp, co.loc[0], 1332.5);
    return calibrate(csFit.mu, 661.657, coFit.mu, 1332.5);
  }
  const presetCalibration = (caso) => autoCalibrate(new Lab(caso));      // nível 1: calibração pré-feita (não gasta o orçamento do aluno)
  function solveReference(caso) {
    const lab = new Lab(caso), log = [];
    const cal = autoCalibrate(lab);
    log.push({ step: "calibração", g: cal.g, E0: cal.E0 });
    // fonte: aquisições de 10 s até 3000 contagens líquidas no pico principal (ou 80 s)
    const measureMain = (cfg) => findPeaks(lab.spectra[cfg], cal, { minSig: 6 });
    for (let k = 0; k < 10; k += 1) { lab.acquire("src0", 10); const pk = measureMain("src0"); if (lab.live.src0 >= 30 && pk.length && pk[0].net >= 3000) break; }
    const pks = measureMain("src0");
    if (!pks.length) return { lab, failed: "sem picos" };
    // fotopico de referência: entre os picos com ≥ 50 % da área do maior, o de maior energia (no Co-60, a linha de 1332,5 keV: a de 1173,2 keV fica sobre a cauda do contínuo da outra)
    const peak0 = pks.filter((p) => p.net >= 0.5 * pks[0].net).sort((a, b) => b.x - a.x)[0];   // entre os picos com ≥ 50 % da área do maior, o de maior energia (Co-60: 1332,5 keV, sobre fundo limpo)
    const Ept = energyOf(cal, peak0.x), doublet = Ept > 1100;   // acima de 1100 keV: Co-60, dubleto separado por ≈ 2 FWHM
    const peak = peak0, half = Math.max(5, Math.round(fwhmKeV(Ept, R662_NOMINAL) / cal.g * (doublet ? 1.2 : 1.3)));   // janela: ±1,3 FWHM (±1,2 no dubleto, onde a janela larga alcança a outra linha)
    const fit = fitGauss(lab.spectra.src0, Math.round(peak.x - half), Math.round(peak.x + half), doublet ? 0 : 1);   // dubleto: fundo constante (o linear come as caudas)
    const Epk = energyOf(cal, fit.mu), fwhmPct = 100 * fit.fwhm * cal.g / Epk;
    const nuclide = nearestNuclide(Epk);
    // linha "principal" para a borda: a de maior energia entre as de y ≥ 0,5 do radionuclídeo identificado
    const lines = NUCLIDES[nuclide].lines.filter((l) => l.y >= 0.5), Eline = lines[lines.length - 1].E, Ec = comptonEdge(Eline);
    const lowestLine = NUCLIDES[nuclide].lines.reduce((m, l) => Math.min(m, l.E), Infinity);
    const Ebs = backscatterEnergy(Eline), loWin = Ebs < Ec ? Math.max(0.8 * Ec, Ebs + 1.5 * fwhmKeV(Ebs, R662_NOMINAL)) : 0.8 * Ec;   // fora do pico de retroespalhamento
    const edge = readEdge(lab.spectra.src0, cal, loWin, Math.min(1.05 * Ec, lowestLine - fwhmKeV(lowestLine, R662_NOMINAL)));
    // atenuação: mesma ROI, mesmo tempo vivo (src1 com o tempo de src0)
    lab.acquire("src1", lab.live.src0);
    const lo = Math.round(fit.mu - 2.2 * fit.sigma), hi = Math.round(fit.mu + 2.2 * fit.sigma);
    let mu = null;
    for (let k = 0; k < 12; k += 1) {   // soma 10 s às duas aquisições até σ_μ/μ ≤ 4 % (ou 60 % do orçamento)
      const n0 = roiNet(lab.spectra.src0, lo, hi, 4), n1 = roiNet(lab.spectra.src1, lo, hi, 4);
      mu = muFromNets(n0.net, n0.sigma, lab.live.src0, n1.net, n1.sigma, lab.live.src1, caso.plateCm);
      if ((mu && mu.sigma / mu.mu <= 0.04) || lab.costFraction() > 0.55) break;
      lab.acquire("src0", 10); lab.acquire("src1", 10);
    }
    const material = mu ? nearestMaterial(mu.mu, Epk) : "water";
    return { lab, cal, Epk, fwhmPct, nuclide, edge, mu, material,
      answers: { nuclide, material, edgeKeV: edge, fwhmPct, gainKeV: cal.g, muCm: mu ? mu.mu : NaN, predQ1: predictionFor(caso.seed).q1, predQ2: predictionFor(caso.seed).q2, prediction: predictionFor(caso.seed).edge, c1: "a", c2: "a", c3: "b", hintsUsed: 0, deliveries: 1 } };
  }

  // ------------------------------------------------------------------ auditoria: cadeia física com números
  const fmt = (x, d = 1) => formatPt(x, d);
  function auditChain(caso, ctx = {}) {
    const nuc = NUCLIDES[caso.nuclide], E = caso.mainLine.E, Ec = comptonEdge(E), Ebs = backscatterEnergy(E), alpha = E / MEC2;
    const muT = linearAttenuation(caso.material, E), massMu = massAttenuation(caso.material, E), rho = MATERIALS[caso.material].rho;
    const gamma = naturalWidthEV(0.28e-9), relNat = gamma / (E * 1000);
    return [
      { step: "1 · Calibração", formula: "E = E₀ + g · canal (reta por dois picos conhecidos)",
        generic: "Cs-137 (661,7 keV) no canal 190 e Co-60 (1332,5 keV) no canal 385 dão g = 3,44 keV/canal e E₀ = 8 keV.",
        caso: `Neste caso: g = ${fmt(caso.gain, 3)} keV/canal e E₀ = ${fmt(caso.offset, 1)} keV.` },
      { step: "2 · Identificação", formula: "o fotopico dá a energia do fóton; compare com a tabela de linhas",
        generic: "Linhas: Tc-99m 140,5; I-123 159; I-131 364,5 (e 637, 723 fracas); F-18 511; Cs-137 661,7; Co-60 1173 e 1332 keV.",
        caso: `Neste caso: fotopico em ${fmt(E, 1)} keV: ${nuc.name}.` },
      { step: "3 · Compton", formula: "E<sub>c</sub> = E·[1 − 1/(1 + 2E/m<sub>e</sub>c²)] (borda) e E' = E/(1 + 2E/m<sub>e</sub>c²) (retroespalhamento)",
        generic: "Tc-99m: E<sub>c</sub> = 49,8 keV e E' = 90,7 keV; F-18 (511 keV): E' = 170,3 keV, E<sub>c</sub> = 340,7 keV; Cs-137: E<sub>c</sub> = 477,3 keV.",
        caso: `Neste caso: 2E/m<sub>e</sub>c² = ${fmt(2 * alpha, 3)}; E<sub>c</sub> = ${fmt(Ec, 1)} keV; retroespalhamento em ${fmt(Ebs, 1)} keV (o pico existe mesmo numa fonte pontual: o fóton espalha na blindagem, no suporte e no próprio detector).` },
      { step: "4 · Largura", formula: "FWHM/E = R₆₆₂·(E/661,7)<sup>−0,23</sup> (parametrização empírica do NaI); largura natural ħ/τ",
        generic: "Tc-99m: ħ/τ = 6,58×10⁻¹⁶ eV·s / 0,28 ns = 2,4×10⁻⁶ eV, 1,7×10⁻¹¹ de E; o NaI mede ≈ 10 % a 140,5 keV (14 keV) e 7 % a 661,7 keV: nada tem a ver com o nível.",
        caso: `Neste caso: R₆₆₂ = ${fmt(100 * caso.r662, 1)} % → FWHM/E = ${fmt(100 * fwhmRelative(E, caso.r662), 1)} % em ${fmt(E, 1)} keV (FWHM = ${fmt(fwhmKeV(E, caso.r662), 1)} keV); largura natural: ${fmt(gamma * 1e6, 1)}×10⁻⁶ eV para τ = 0,28 ns, ${fmt(relNat * 1e11, 1)}×10⁻¹¹ de E.` },
      { step: "5 · Atenuação", formula: "μ = ln(R₀/R₁)/d, comparar com μ = (μ/ρ)·ρ do XCOM na energia do fotopico",
        generic: "A 661,7 keV: água 0,086, osso 0,153, alumínio 0,201, ferro 0,578 e chumbo 1,254 cm⁻¹.",
        caso: `Neste caso: ${MATERIALS[caso.material].name}, μ/ρ = ${fmt(massMu, 4)} cm²/g × ρ = ${fmt(rho, 3)} g/cm³ → μ = ${fmt(muT, 4)} cm⁻¹; d = ${fmt(caso.plateCm, 2)} cm por lâmina, μd = ${fmt(muT * caso.plateCm, 2)}, transmissão de uma lâmina ${fmt(100 * Math.exp(-muT * caso.plateCm), 0)} %.` },
      { step: "Limite do modelo", formula: "NaI idealizado",
        generic: "NaI com resolução empírica R(E) = R₆₆₂·(E/661,7)^(−0,23) (didática; o limite poissoniano daria E^(−1/2)), geometria pontual, feixe estreito (espalhado na blindagem desprezado), sem raios X característicos (K<sub>α</sub> do Pb, 75 keV; ¹²³I, 27 keV), sem soma de coincidências nem empilhamento; dados sintéticos.",
        caso: ctx.extra || "" },
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
    MEC2, NCH, LLD_KEV, EPS_TOT, R662_NOMINAL, RES_EXP, BACKSCATTER_SHARE, CAL_ACTIVITY_MBQ, DOSE_K, BENCH_M, HINT_PENALTY, hintCost, REDELIVERY_COST, WEIGHTS, PRED_PARTS, PRED_TOL, predictionFor, efficiencyFactor, conceptsCorrect, trueFwhmPcts, autoCalibrate, presetCalibration,
    NUCLIDES, NUCLIDE_KEYS, MATERIALS, MATERIAL_KEYS, MATERIAL_ORDER_BY_MU, LEVELS, CONFIGS, CONFIG_KEYS, CONCEPTS,
    mulberry32, hash3, poisson, erf, Phi,
    massAttenuation, linearAttenuation, muTable, nearestMaterial, nearestNuclide, acceptedEdges,
    backscatterEnergy, comptonEdge, kleinNishinaDsDT, kleinNishinaTotal, naturalWidthEV,
    fwhmKeV, fwhmRelative, sigmaKeV, photoFraction,
    makeCase, chanEnergy, modelRates, lineRates, acquireSecond, doseRateUSvh, Lab,
    sumRange, smooth, roiNet, fitGauss, calibrate, energyOf, channelOf, findPeaks, readEdge, muFromNets,
    numScore, partial, valueCredit, gainTolRel, muTolRel, trueMus, edgeTol, fwhmTolRel, trueFwhmPct, shuffledOptions, score, solveReference, auditChain,
    niceTicks, tickDigits, listDigits, mergeTicks, formatPt,
  };
  root.ChallengePhysics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

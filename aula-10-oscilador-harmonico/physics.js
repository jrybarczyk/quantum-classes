(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LessonPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Nucleo fisico da Aula 10 (oscilador harmonico, solucao analitica).
  // Estacoes 1-3: unidades reduzidas da nota, secao 2:
  //   xi = x/l, l = sqrt(hbar/(m omega)), eps = E/(hbar omega).
  // Estacao 4: SI com sufixo no nome (EV, Pm, Cm, U).

  // ---------------------------------------------------------------
  // Estacao 1 - quantizacao por tiro
  // Integra psi'' = (xi^2 - 2 eps) psi (nota, eq. adim, secao 2) de 0 ate
  // xiMax por Runge-Kutta de 4a ordem com passo h. Paridade "par":
  // psi(0)=1, psi'(0)=0; "impar": psi(0)=0, psi'(0)=1 (nota, secao 4: a
  // recorrencia separa uma serie par iniciada por a_0 e uma impar por a_1).
  // Devolve os pontos em 0..xiMax, o valor final, o pico central, o
  // numero de cruzamentos de zero em |xi| < xiMax (nodes; contando os dois
  // lados e a origem) e o numero de cruzamentos na regiao classicamente
  // permitida xi^2 < 2 eps (nodesInner). Para eps = n + 1/2 os dois
  // coincidem com os n nos de psi_n; para eps nao permitido a solucao
  // divergente ganha cruzamentos extras na cauda (teorema de oscilacao de
  // Sturm: o contador salta ao cruzar cada eps permitido da paridade).
  // O pico e o maximo de |psi| em xi^2 <= 2 eps: todo extremo de |psi|
  // exige psi psi'' < 0, isto e, xi^2 < 2 eps; na regiao proibida |psi| e
  // convexa e nao tem maximo local. Se a regiao permitida nao contem
  // extremo (solucao impar com eps pequeno) usa-se |psi| na borda dela.
  function shoot(eps, parity, xiMax, h) {
    xiMax = xiMax || 6; h = h || 1 / 100;
    const odd = parity === "impar" || parity === "odd";
    let y = odd ? 0 : 1, dy = odd ? 1 : 0, xi = 0;
    const f = (x, v) => (x * x - 2 * eps) * v;
    const steps = Math.round(xiMax / h);
    const points = [{ xi: 0, psi: y }];
    const xiTurn2 = Math.max(0, 2 * eps);
    let peak = Math.abs(y), edge = Math.abs(y), nodesHalf = 0, innerHalf = 0, last = y;
    for (let i = 0; i < steps; i += 1) {
      const k1y = dy, k1d = f(xi, y);
      const k2y = dy + h / 2 * k1d, k2d = f(xi + h / 2, y + h / 2 * k1y);
      const k3y = dy + h / 2 * k2d, k3d = f(xi + h / 2, y + h / 2 * k2y);
      const k4y = dy + h * k3d, k4d = f(xi + h, y + h * k3y);
      y += h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y);
      dy += h / 6 * (k1d + 2 * k2d + 2 * k3d + k4d);
      xi += h;
      points.push({ xi, psi: y });
      const inside = xi * xi <= xiTurn2;
      if (inside) { edge = Math.abs(y); if (Math.abs(y) > peak) peak = Math.abs(y); }
      if (last !== 0 && y * last < 0) { nodesHalf += 1; if (inside) innerHalf += 1; }
      if (y !== 0) last = y;
    }
    if (!(peak > 0)) peak = edge > 0 ? edge : Math.abs(points[1].psi);
    const nodes = 2 * nodesHalf + (odd ? 1 : 0), nodesInner = 2 * innerHalf + (odd ? 1 : 0);
    return { points, psiEnd: y, peak, nodes, nodesInner, parity: odd ? "impar" : "par" };
  }

  // eps permitido mais proximo: eps_n = n + 1/2 (nota, eq. En), respeitando
  // a paridade (n par para solucao par, n impar para solucao impar).
  function nearestAllowed(eps, parity) {
    const odd = parity === "impar" || parity === "odd";
    let n = Math.round(eps - 1 / 2);
    if (n < 0) n = 0;
    if ((n % 2 === 1) !== odd) {
      const below = n - 1, above = n + 1;
      n = below >= 0 && Math.abs(eps - energy(below)) <= Math.abs(eps - energy(above)) ? below : above;
    }
    return n;
  }

  // ---------------------------------------------------------------
  // Estacao 2 - polinomios de Hermite e autofuncoes
  // H_0 = 1, H_1 = 2 xi, H_{n+1} = 2 xi H_n - 2 n H_{n-1} (Griffiths 2.17;
  // reproduz H_2..H_4 da nota, secao 5).
  function hermite(n, xi) {
    if (n === 0) return 1;
    let h0 = 1, h1 = 2 * xi;
    for (let k = 1; k < n; k += 1) {
      const h2 = 2 * xi * h1 - 2 * k * h0;
      h0 = h1; h1 = h2;
    }
    return h1;
  }

  // Autofuncao normalizada em xi (nota, eq. psin, com l = 1):
  //   psi_n(xi) = pi^(-1/4) (2^n n!)^(-1/2) H_n(xi) exp(-xi^2/2).
  // Calculada pela recorrencia ja normalizada
  //   psi_{n+1} = sqrt(2/(n+1)) xi psi_n - sqrt(n/(n+1)) psi_{n-1},
  // que evita o overflow de 2^n n! e vale ate n = 60 sem perda de norma.
  function psi(n, xi) {
    const p0 = Math.pow(Math.PI, -1 / 4) * Math.exp(-xi * xi / 2);
    if (n === 0) return p0;
    let a = p0, b = Math.SQRT2 * xi * p0;
    for (let k = 1; k < n; k += 1) {
      const c = Math.sqrt(2 / (k + 1)) * xi * b - Math.sqrt(k / (k + 1)) * a;
      a = b; b = c;
    }
    return b;
  }

  function density(n, xi) { const p = psi(n, xi); return p * p; }

  // eps_n = E_n/(hbar omega) = n + 1/2 (nota, eq. En).
  function energy(n) { return n + 1 / 2; }

  // Ponto de retorno classico em unidades de l: x_cl/l = sqrt(2n+1)
  // (nota, secao "Pontos de retorno e limite classico").
  function turningPoint(n) { return Math.sqrt(2 * n + 1); }

  // Densidade classica rho_cl(xi) = 1/(pi sqrt(x_cl^2 - xi^2)) para
  // |xi| < x_cl; zero fora (nota, mesma secao).
  function classicalDensity(n, xi) {
    const xc2 = 2 * n + 1 - xi * xi;
    return xc2 > 0 ? 1 / (Math.PI * Math.sqrt(xc2)) : 0;
  }

  // Regra de Simpson composta em [a, b] com N (par) subintervalos.
  function simpson(fn, a, b, N) {
    N = N || 2000; if (N % 2) N += 1;
    const h = (b - a) / N;
    let s = fn(a) + fn(b);
    for (let i = 1; i < N; i += 1) s += (i % 2 ? 4 : 2) * fn(a + i * h);
    return s * h / 3;
  }

  // Probabilidade na regiao classicamente proibida |xi| > x_cl:
  // P_fora = 2 * integral_{x_cl}^{xi_max} |psi_n|^2 dxi (numerica).
  // Para n = 0 vale erfc(1) = 0,1573.
  function outsideProbability(n, xiMax, N) {
    const xc = turningPoint(n);
    const top = xiMax || xc + 8;
    return 2 * simpson((x) => density(n, x), xc, top, N || 4000);
  }

  // Norma numerica e produto interno ⟨m|n⟩ em [-xiMax, xiMax] (testes de
  // ortonormalidade, nota eq. ortH).
  function overlap(m, n, xiMax, N) {
    const top = xiMax || Math.max(turningPoint(m), turningPoint(n)) + 8;
    return simpson((x) => psi(m, x) * psi(n, x), -top, top, N || 6000);
  }
  function norm(n, xiMax, N) { return overlap(n, n, xiMax, N); }

  // Valor esperado <xi^2> no estado n (nota: <x^2>_0 = hbar/(2 m omega),
  // isto e, <xi^2>_0 = 1/2).
  function meanXi2(n) {
    const top = turningPoint(n) + 8;
    return simpson((x) => x * x * density(n, x), -top, top, 6000);
  }

  // Numero de nos de psi_n contados numericamente em |xi| < x_cl + 3.
  function countNodes(n, h) {
    const top = turningPoint(n) + 3, step = h || 1 / 200;
    let nodes = 0, last = psi(n, -top);
    for (let x = -top + step; x <= top; x += step) {
      const v = psi(n, x);
      if (v * last < 0) nodes += 1;
      if (v !== 0) last = v;
    }
    return nodes;
  }

  // ---------------------------------------------------------------
  // Estacao 3 - limite classico
  // Media local de |psi_n|^2 numa janela de largura w (em l) centrada em
  // xi; w = 0 devolve a propria densidade. E a "media em escala maior que
  // o comprimento das oscilacoes" da nota (secao final).
  function localAverage(n, xi, width, N) {
    if (!(width > 0)) return density(n, xi);
    return simpson((x) => density(n, x), xi - width / 2, xi + width / 2, N || 40) / width;
  }

  // ---------------------------------------------------------------
  // Estacao 4 - espectroscopia vibracional (SI). Constantes:
  const HC_EV_NM = 1239.84;          // h c em eV nm
  const HBARC_EV_NM = 197.327;       // hbar c em eV nm
  const U_C2_EV = 931.494e6;         // u c^2 em eV
  const KB_EV_K = 8.617e-5;          // k_B em eV/K

  // Pares de atomos: massas em u e comprimento da ligacao em pm.
  const PAIRS = {
    "C=O": { m1: 12, m2: 16, bondPm: 123, label: "C=O (amida I ≈ 1655, éster ≈ 1740 cm⁻¹)" },
    "C-H": { m1: 12, m2: 1, bondPm: 109, label: "C–H (lipídios, proteínas)" },
    "O-H": { m1: 16, m2: 1, bondPm: 96, label: "O–H (água)" },
    "H2": { m1: 1, m2: 1, bondPm: 74, label: "H₂ (molécula livre)" },
  };

  // hbar omega = h c nu~ (nota, exemplo resolvido): nu~ em cm^-1 -> nm^-1.
  function hbarOmegaEV(nuCm) { return HC_EV_NM * nuCm * 1e-7; }

  // Massa reduzida mu = m1 m2/(m1 + m2) em u.
  function reducedMassU(pair) {
    const p = typeof pair === "string" ? PAIRS[pair] : pair;
    return p.m1 * p.m2 / (p.m1 + p.m2);
  }

  function bondLengthPm(pair) { return PAIRS[pair].bondPm; }

  // l = hbar c / sqrt(mu c^2 hbar omega), em pm (nota, exemplo resolvido).
  function lengthPm(muU, hbarOmegaEV_) {
    return HBARC_EV_NM / Math.sqrt(muU * U_C2_EV * hbarOmegaEV_) * 1e3;
  }

  // Incerteza do fundamental sigma_x = l/sqrt(2) (nota, <x^2>_0 = hbar/(2 m omega)).
  function sigmaXPm(lPm) { return lPm / Math.SQRT2; }

  // Razao de populacao P_1/P_0 = exp(-hbar omega / k_B T) (nota, exemplo resolvido).
  function thermalRatio(hbarOmegaEV_, T) { return Math.exp(-hbarOmegaEV_ / (KB_EV_K * T)); }

  // Populacoes normalizadas P_n = (1 - q) q^n, q = exp(-hbar omega/k_B T)
  // (soma geometrica sobre todos os niveis do oscilador; extensao da nota).
  function thermalPopulations(hbarOmegaEV_, T, nMax) {
    const q = thermalRatio(hbarOmegaEV_, T), out = [];
    for (let n = 0; n <= nMax; n += 1) out.push((1 - q) * Math.pow(q, n));
    return out;
  }

  // Potencial V(x) = (1/2) mu omega^2 x^2 = (1/2) hbar omega (x/l)^2, em eV.
  function potentialEV(xPm, lPm, hbarOmegaEV_) { return hbarOmegaEV_ / 2 * (xPm / lPm) ** 2; }

  return {
    shoot, nearestAllowed, hermite, psi, density, energy, turningPoint, classicalDensity,
    simpson, outsideProbability, overlap, norm, meanXi2, countNodes, localAverage,
    PAIRS, HC_EV_NM, HBARC_EV_NM, U_C2_EV, KB_EV_K,
    hbarOmegaEV, reducedMassU, bondLengthPm, lengthPm, sigmaXPm, thermalRatio, thermalPopulations, potentialEV,
  };
});

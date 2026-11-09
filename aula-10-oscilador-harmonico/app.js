(function () {
  "use strict";
  // Coordena controles, canvas e textos da Aula 10. Toda a física está em physics.js.
  const P = window.LessonPhysics, $ = (id) => document.getElementById(id);
  const C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", blue: "#457b9d", purple: "#7b5ea7", gray: "#6f7171", grid: "#dce5dc", shade: "rgba(111,113,113,.13)" };
  const VIEWS = ["tiro", "hermite", "classico", "medica"];
  let view = new URLSearchParams(location.search).get("view") || "tiro";
  // Estações 3 e 4 só mostram o que responde à previsão depois do primeiro
  // movimento de controle (ou do botão "mostrar"); Reiniciar esconde de novo.
  const revealed = { classico: false, medica: false };

  const f = (x, n = 3) => Number(x).toLocaleString("pt-BR", { maximumFractionDigits: n, minimumFractionDigits: n });
  const fi = (x) => Number(x).toLocaleString("pt-BR", { maximumFractionDigits: 0, useGrouping: false });
  function sci(x, n = 1) {
    if (!(Math.abs(x) > 0)) return "0";
    const e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e);
    const sup = String(e).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]);
    return `${f(m, n)}×10${sup}`;
  }
  function set(id, text) { $(id).textContent = text; }
  function html(id, content) { $(id).innerHTML = content; }
  function metrics(rows) { html("metrics", rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")); }
  function prompts(rows) { html("prompts", rows.map((x) => `<li>${x}</li>`).join("")); }
  function legend(rows) { html("legend", rows.map(([color, label, dash]) => `<span><i style="border-color:${color};${dash ? "border-top-style:dashed" : ""}"></i>${label}</span>`).join("")); }
  function canvas() {
    const e = $("mainCanvas"), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = e.clientWidth || 900, h = Math.max(300, w * 560 / 1100);
    e.width = w * ratio; e.height = h * ratio;
    const c = e.getContext("2d"); c.scale(ratio, ratio); c.clearRect(0, 0, w, h);
    return { c, w, h };
  }
  function samples(a, b, n, fn) { return Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; }); }

  // Eixos, grade, regiões sombreadas, marcas verticais e curvas (recortadas à área do gráfico).
  function plot(c, box, series, xr, yr, labels, extras) {
    const { l, r, t, b } = box, [min, max] = xr, [ymin, ymax] = yr;
    const X = (x) => l + (x - min) * (r - l) / (max - min), Y = (y) => b - (y - ymin) * (b - t) / (ymax - ymin);
    const ex = extras || {};
    (ex.fills || []).forEach((z) => { c.fillStyle = z.color || C.shade; c.fillRect(X(Math.max(min, z.from)), t, X(Math.min(max, z.to)) - X(Math.max(min, z.from)), b - t); });
    c.strokeStyle = C.grid; c.lineWidth = 1; c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui";
    const nx = ex.nx || 6, ny = ex.ny || 5;
    for (let i = 0; i <= nx; i += 1) {
      const x = min + i * (max - min) / nx;
      c.beginPath(); c.moveTo(X(x), t); c.lineTo(X(x), b); c.stroke();
      c.textAlign = "center"; c.fillText(ex.xfmt ? ex.xfmt(x) : f(x, 1), X(x), b + 15);
    }
    for (let i = 0; i <= ny; i += 1) {
      const y = ymin + i * (ymax - ymin) / ny;
      c.beginPath(); c.moveTo(l, Y(y)); c.lineTo(r, Y(y)); c.stroke();
      c.textAlign = "right"; c.fillText(ex.yfmt ? ex.yfmt(y) : f(y, 2), l - 6, Y(y) + 3);
    }
    c.strokeStyle = C.gray; c.beginPath(); c.moveTo(l, b); c.lineTo(r, b); c.moveTo(l, t); c.lineTo(l, b); c.stroke();
    c.fillStyle = C.gray; c.font = "11px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(labels[0], (l + r) / 2, b + 32);
    c.save(); c.translate(l - 44, (t + b) / 2); c.rotate(-Math.PI / 2); c.fillText(labels[1], 0, 0); c.restore();
    c.save(); c.beginPath(); c.rect(l, t, r - l, b - t); c.clip();
    (ex.marks || []).forEach((m) => {
      c.strokeStyle = m.color || C.gray; c.lineWidth = 1.4; c.setLineDash(m.dash || [4, 4]);
      c.beginPath(); c.moveTo(X(m.x), t); c.lineTo(X(m.x), b); c.stroke(); c.setLineDash([]);
      if (m.label) { c.fillStyle = m.color || C.gray; c.font = "10px Ubuntu,system-ui"; c.textAlign = "left"; c.fillText(m.label, X(m.x) + 4, t + 12); }
    });
    (ex.hlines || []).forEach((m) => {
      c.strokeStyle = m.color || C.gray; c.lineWidth = 1.4; c.setLineDash(m.dash || []);
      c.beginPath(); c.moveTo(X(m.from === undefined ? min : m.from), Y(m.y)); c.lineTo(X(m.to === undefined ? max : m.to), Y(m.y)); c.stroke(); c.setLineDash([]);
      if (m.label) { c.fillStyle = m.color || C.gray; c.font = "10px Ubuntu,system-ui"; c.textAlign = "left"; c.fillText(m.label, X(m.to === undefined ? max : m.to) + 4, Y(m.y) + 3); }
    });
    series.forEach((s) => {
      c.strokeStyle = s.color; c.lineWidth = s.width || 2.4; c.setLineDash(s.dash || []); c.globalAlpha = s.alpha || 1;
      c.beginPath(); let pen = false;
      s.points.forEach((p) => { if (!Number.isFinite(p.y)) { pen = false; return; } const y = Math.max(ymin - (ymax - ymin), Math.min(ymax + (ymax - ymin), p.y)); if (pen) c.lineTo(X(p.x), Y(y)); else c.moveTo(X(p.x), Y(y)); pen = true; });
      c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    });
    c.restore();
    return { X, Y };
  }

  // ---------------------------------------------------------------- Estação 1
  function drawTiro() {
    const eps = +$("tiroEps").value, parity = $("tiroParity").value, odd = parity === "impar";
    const s = P.shoot(eps, parity, 6, 0.01), n = P.nearestAllowed(eps, parity), epsN = P.energy(n);
    const scale = 1 / (s.peak || 1);
    const half = s.points.map((p) => ({ x: p.xi, y: p.psi * scale }));
    const mirror = half.slice(1).reverse().map((p) => ({ x: -p.x, y: odd ? -p.y : p.y }));
    const shot = mirror.concat(half);
    // Pico de |ψₙ| só na região permitida ξ² ≤ 2ε_n (extremos de |ψ| exigem ψψ″ < 0).
    let refPeak = 0; for (let x = 0; x * x <= 2 * n + 1; x += 0.01) refPeak = Math.max(refPeak, Math.abs(P.psi(n, x)));
    const ref = samples(-6, 6, 481, (x) => P.psi(n, x) / refPeak);
    const d = canvas(), box = { l: 62, r: d.w - 20, t: 24, b: d.h - 56 };
    plot(d.c, box, [{ points: ref, color: C.blue, dash: [6, 4], width: 1.8 }, { points: shot, color: C.red }], [-6, 6], [-2.5, 2.5], ["ξ = x/ℓ", "ψ (pico central = 1)"], { marks: [{ x: -6, color: C.gray }, { x: 6, color: C.gray }], nx: 6, ny: 5 });
    legend([[C.red, "ψ(ξ) integrada com este ε"], [C.blue, `ψ${sub(n)} de Hermite (ε = ${f(epsN, 1)})`, true]]);
    const ratioEnd = Math.abs(s.psiEnd) * scale, allowed = Math.abs(eps - epsN) < 0.005;
    set("tiroEpsOut", f(eps, 2));
    set("statusTitle", allowed ? `ε = ${f(epsN, 1)}: solução normalizável` : "Solução divergente");
    set("statusDetail", `|ψ(6)|/pico = ${sci(ratioEnd)}`);
    set("mainTitle", "Integração de ψ″ = (ξ² − 2ε)ψ a partir da origem");
    set("mainSubtitle", `paridade ${parity}; o eixo vertical corta em ±2,5 para que a divergência saia do gráfico`);
    const extraCross = s.nodes > n;
    set("caption", allowed
      ? "Com ε = n + ½ a série de h(ξ) termina: a curva integrada cai para zero e cola na autofunção de Hermite tracejada."
      : (extraCross
        ? `Para este ε a série de h(ξ) não termina e ψ cresce como e^{+ξ²/2}: a cauda estoura a escala. O último cruzamento de zero está na cauda que estoura — entrou pelo infinito quando ε cruzou ε${sub(n)} = ${f(epsN, 1)} (teorema de oscilação de Sturm) e só vira nó de verdade em ε${sub(n + 2)}; só para ε = n + ½ os cruzamentos são os n nós de ψₙ.`
        : `Para este ε a série de h(ξ) não termina e ψ cresce como e^{+ξ²/2}: a cauda estoura a escala. Os cruzamentos de zero coincidem com os ${n} nós de ψ${sub(n)}, mas a cauda não volta a zero: a solução é rejeitada.`));
    set("prediction", "Para ε = 1,0 (entre o fundamental e o primeiro excitado), a cauda em ξ = 6 será ~1, ~10³ ou ~10⁶ vezes o pico? A solução é normalizável?");
    html("calculation", `ψ″ = (ξ² − 2ε)ψ = (ξ² − ${f(2 * eps, 2)})ψ<br>ε permitido mais próximo: n + ½ = ${f(epsN, 1)} (n = ${n})<br><b>|ψ(ξ<sub>máx</sub>)|/pico = ${sci(ratioEnd)} → log₁₀ = ${f(Math.log10(ratioEnd || 1e-300), 1)}</b><small>${allowed ? "cauda ≈ zero: solução aceita" : `<span class="warn">cauda ${sci(ratioEnd)} vezes o pico: rejeitada</span>`}</small>`);
    metrics([["ε = E/ħω", f(eps, 2)], ["|ψ(6)|/pico", sci(ratioEnd)], ["log₁₀ |ψ(6)|/pico", f(Math.log10(ratioEnd || 1e-300), 1)], ["cruzamentos de zero em |ξ| < 6", fi(s.nodes)], ["cruzamentos em |ξ| < √(2ε)", fi(s.nodesInner)], ["ε permitido mais próximo", `${f(epsN, 1)} (n = ${n}; |ε − ε${sub(n)}| = ${f(Math.abs(eps - epsN), 2)})`]]);
    set("conceptTitle", "Quantização pela normalizabilidade");
    set("conceptText", "A energia não foi imposta: ela surge porque, nos dois extremos, só sobrevive a solução cuja série termina — a recorrência a_{j+2} = (2j + 1 − 2ε)a_j/((j+2)(j+1)) para em j = n exatamente quando ε = n + ½.");
    prompts(["Parta de ε = 0,40 e suba de 0,01 em 0,01: em que valor a cauda muda de sinal? (A leitura é o módulo; a troca de sinal aparece na curva, que sai do gráfico por cima ou por baixo.) O que isso diz sobre a solução com ε = 0,5?", "Troque a paridade com ε = 1,5 fixo: a solução par diverge? Conte os nós em cada caso.", "Compare log₁₀|ψ(6)| para ε = 1,0 e ε = 1,49: a divergência é gradual ou abrupta perto do valor permitido?"]);
  }
  function sub(n) { return String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[+d]); }

  // ---------------------------------------------------------------- Estação 2
  function drawHermite() {
    const n = +$("hermN").value, xc = P.turningPoint(n), epsN = P.energy(n), pOut = P.outsideProbability(n);
    const xmax = Math.max(4, Math.ceil(xc + 2.5));
    const dens = samples(-xmax, xmax, 801, (x) => P.density(n, x));
    const ymax = Math.max(...dens.map((p) => p.y)) * 1.15;
    const rho = samples(-xmax, xmax, 801, (x) => { const v = P.classicalDensity(n, x); return v > 0 ? v : NaN; });
    const d = canvas(), box = { l: 62, r: d.w - 20, t: 24, b: d.h - 56 };
    plot(d.c, box, [{ points: rho, color: C.gold, dash: [6, 4], width: 1.8 }, { points: dens, color: C.red }], [-xmax, xmax], [0, ymax], ["ξ = x/ℓ", `|ψ${sub(n)}|² (1/ℓ)`],
      { fills: [{ from: -xmax, to: -xc }, { from: xc, to: xmax }], marks: [{ x: -xc, color: C.gray, label: `−x_cl = −${f(xc, 2)}` }, { x: xc, color: C.gray, label: `x_cl = ${f(xc, 2)}` }], yfmt: (y) => f(y, 2) });
    legend([[C.red, `|ψ${sub(n)}(ξ)|²`], [C.gold, "ρ_cl (mesma energia)", true], [C.shade, "região proibida"]]);
    set("hermNOut", fi(n));
    set("statusTitle", `ψ${sub(n)}: ε${sub(n)} = ${f(epsN, 1)}`); set("statusDetail", `x_cl = ${f(xc, 2)} ℓ · P_fora = ${f(100 * pOut, 1)} %`);
    set("mainTitle", `Densidade de probabilidade do estado n = ${n}`); set("mainSubtitle", "sombreado: |ξ| > x_cl, onde a partícula clássica nunca chega");
    set("caption", n === 0 ? "No fundamental a gaussiana não tem nós e 15,7 % da probabilidade está fora dos pontos de retorno clássicos." : `${n} nó${n > 1 ? "s" : ""}, paridade ${n % 2 ? "ímpar" : "par"}; a densidade cresce perto dos pontos de retorno, como ρ_cl, mas ainda vaza para a região proibida.`);
    set("prediction", "Ao aumentar n, a probabilidade de encontrar a partícula na região classicamente proibida (P_fora) cresce ou diminui?");
    html("calculation", `x<sub>cl</sub> = √(2n + 1) ℓ = √${fi(2 * n + 1)} ℓ = ${f(xc, 3)} ℓ<br>H${sub(n)} pela recorrência H<sub>n+1</sub> = 2ξH<sub>n</sub> − 2nH<sub>n−1</sub>${n <= 4 ? `; H${sub(n)}(0,7) = ${f(P.hermite(n, 0.7), 4)}` : ""}<br><b>P<sub>fora</sub> = ∫<sub>|ξ|>x_cl</sub>|ψ${sub(n)}|² dξ = ${f(pOut, 4)}</b><small>${n === 0 ? "= erfc(1) = 0,1573" : `n = 0: 0,1573 · n = 1: 0,1116`}</small>`);
    metrics([["ε_n = n + ½", f(epsN, 1)], ["x_cl/ℓ", f(xc, 3)], ["número de nós", fi(P.countNodes(n))], ["P_fora", `${f(pOut, 4)} (${f(100 * pOut, 1)} %)`], ["paridade", n % 2 ? "ímpar, ψ(−ξ) = −ψ(ξ)" : "par, ψ(−ξ) = ψ(ξ)"], ["|ψ_n(0)|²", f(P.density(n, 0), 3)]]);
    set("conceptTitle", "Autofunções de Hermite");
    set("conceptText", "ψₙ = (polinômio de grau n) × gaussiana: o polinômio dá os n nós e a paridade (−1)ⁿ; a gaussiana e^{−ξ²/2} dá as caudas que entram na região proibida, cada vez menos relevantes quando n cresce.");
    prompts(["Registre P_fora para n = 0, 1, 2, 4 e 8. Que tendência aparece?", "Confira que o número de nós é n e que o gráfico é simétrico ou antissimétrico conforme a paridade.", "Onde |ψₙ|² é maior para n = 8: no centro ou perto de x_cl? Compare com ρ_cl tracejada."]);
  }

  // ---------------------------------------------------------------- Estação 3
  function drawClassico() {
    const n = +$("clasN").value, w = +$("clasW").value, xc = P.turningPoint(n), xmax = Math.ceil(xc + 1.5), show = revealed.classico;
    const dens = samples(-xmax, xmax, 1201, (x) => P.density(n, x));
    const avg = w > 0 ? samples(-xmax, xmax, 401, (x) => P.localAverage(n, x, w, 60)) : null;
    const rho = samples(-xmax, xmax, 1201, (x) => { const v = P.classicalDensity(n, x); return v > 0 ? v : NaN; });
    const ymax = Math.max(...dens.map((p) => p.y)) * 1.12;
    const x8 = 0.8 * xc, rc0 = P.classicalDensity(n, 0), rc8 = P.classicalDensity(n, x8);
    const a0 = P.localAverage(n, 0, w, 200), a8 = P.localAverage(n, x8, w, 200);
    const series = show ? [{ points: dens, color: C.blue, width: 1.1, alpha: w > 0 ? 0.45 : 1 }, { points: rho, color: C.gold, dash: [6, 4], width: 2 }] : [];
    if (show && avg) series.push({ points: avg, color: C.red, width: 2.6 });
    const d = canvas(), box = { l: 62, r: d.w - 20, t: 24, b: d.h - 56 };
    plot(d.c, box, series, [-xmax, xmax], [0, ymax], ["ξ = x/ℓ", "densidade (1/ℓ)"],
      { fills: [{ from: -xmax, to: -xc }, { from: xc, to: xmax }], marks: [{ x: 0, color: C.gray, label: "ξ = 0" }, { x: x8, color: C.purple, label: "0,8 x_cl" }, { x: -x8, color: C.purple }], yfmt: (y) => f(y, 2) });
    if (!show) { d.c.fillStyle = C.gray; d.c.font = "13px Ubuntu,system-ui"; d.c.textAlign = "center"; d.c.fillText("escreva a previsão no roteiro e mova um controle (ou clique em \"mostrar as curvas\")", (box.l + box.r) / 2, (box.t + box.b) / 2); }
    legend(show ? [[C.blue, `|ψ${sub(n)}|²`], [C.red, `média local (largura ${f(w, 2)} ℓ)`], [C.gold, "ρ_cl", true]] : [[C.shade, "região proibida |ξ| > x_cl"]]);
    set("clasNOut", fi(n)); set("clasWOut", f(w, 2));
    // Período das oscilações de |ψₙ|² no centro: π/√(2n+1) (número de onda local
    // √(2ε − ξ²) em ξ = 0 dá a ψ o comprimento de onda 2π/√(2n+1); |ψ|² ~ cos² tem metade).
    const lam = Math.PI / Math.sqrt(2 * n + 1), hid = "—";
    set("statusTitle", `n = ${n}: ${n} nós`); set("statusDetail", show ? `média/ρ_cl em 0: ${f(a0 / rc0, 2)} · em 0,8 x_cl: ${f(a8 / rc8, 2)}` : `x_cl = ${f(xc, 2)} ℓ · razões após o primeiro movimento`);
    set("mainTitle", "Limite clássico: média local de |ψₙ|² contra ρ_cl"); set("mainSubtitle", !show ? "escreva a previsão e mova o controle" : (w > 0 ? `janela de ${f(w, 2)} ℓ, cerca de ${f(w / lam, 1)} oscilações de |ψ${sub(n)}|²` : "largura 0: sem média — mova o segundo controle"));
    set("caption", show ? "A partícula clássica passa mais tempo onde é mais lenta, perto dos pontos de retorno; a densidade quântica, depois de uma média em escala maior que as oscilações, faz o mesmo." : "Sombreado: região classicamente proibida para a energia ε_n = n + ½. As curvas aparecem depois da previsão.");
    set("prediction", "Para n = 20, a razão |ψ₂₀(0)|²/ρ_cl(0) sem média (largura 0) vale ~0, ~1 ou ~2? E para n = 21?");
    html("calculation", `ρ<sub>cl</sub>(0) = 1/(π√(2n + 1)) = 1/(π√${fi(2 * n + 1)}) = ${f(rc0, 4)}<br>ρ<sub>cl</sub>(0,8 x<sub>cl</sub>) = 1/(π√(x<sub>cl</sub>² − 0,64 x<sub>cl</sub>²)) = ${f(rc8, 4)}<br><b>média local(0)/ρ<sub>cl</sub>(0) = ${show ? f(a0 / rc0, 3) : hid}</b><small>período das oscilações de |ψ${sub(n)}|² no centro: π/√(2n+1) = ${f(lam, 3)} ℓ (ψ oscila com o dobro, 2π/√(2n+1) = ${f(2 * lam, 3)} ℓ)</small>`);
    metrics([["ε_n = n + ½", f(P.energy(n), 1)], ["x_cl/ℓ", f(xc, 3)], ["ρ_cl(0)", f(rc0, 4)], ["média/ρ_cl em ξ = 0", show ? f(a0 / rc0, 3) : hid], ["média/ρ_cl em 0,8 x_cl", show ? f(a8 / rc8, 3) : hid], ["período de |ψₙ|² no centro (ℓ)", f(lam, 3)]]);
    set("conceptTitle", "Princípio da correspondência");
    set("conceptText", "Para n ≫ 1, |ψₙ|² oscila com período π/√(2n+1) (número de onda local √(2ε − ξ²) em ξ = 0; ψ tem comprimento de onda 2π/√(2n+1)); a média sobre uma janela maior que esse período reproduz ρ_cl = 1/(π√(x_cl² − x²)), exceto nas vizinhanças de x_cl, onde a função de onda penetra suavemente a região proibida. No centro a razão vale 1 + sin(kw)/(kw), com k = √(2n+1) e w a largura da janela: a correspondência depende de n e de a janela cobrir um número inteiro de meios-períodos.");
    prompts(["Com largura 0, leia a razão média/ρ_cl em ξ = 0 para n = 20, 21 e 60: por que oscila tanto entre ~0 e ~2?", "Aumente a largura até ~1 ℓ com n = 20: as duas razões aproximam-se de 1? Onde a concordância é pior?", "Com n = 60, compare a razão no centro com largura 1,0 ℓ e 1,5 ℓ: quantas oscilações de |ψ₆₀|² cabem em cada janela (período π/√121 = 0,286 ℓ)? Qual largura dá a melhor razão e por quê?"]);
  }

  // ---------------------------------------------------------------- Estação 4
  function drawMedica() {
    const nu = +$("medNu").value, pair = $("medPair").value, T = +$("medT").value, show = revealed.medica;
    const hw = P.hbarOmegaEV(nu), mu = P.reducedMassU(pair), l = P.lengthPm(mu, hw), sx = P.sigmaXPm(l), dBond = P.bondLengthPm(pair);
    const kT = P.KB_EV_K * T, ratio = P.thermalRatio(hw, T), pops = P.thermalPopulations(hw, T, 3);
    // Limites do modelo (parecer prof-fisica-medica): sigma_x/d > 10 % -> anarmonicidade forte;
    // hbar omega/k_BT < 5 -> P1/P0 > ~1 % e a linha anti-Stokes é mensurável.
    const ratioSd = sx / dBond, warnAnh = ratioSd > 0.10, warnT = hw / kT < 5;
    const d = canvas();
    const gap = 26, wl = Math.round((d.w - gap) * 0.64), boxL = { l: 62, r: wl, t: 24, b: d.h - 56 }, boxR = { l: wl + gap + 46, r: d.w - 16, t: 24, b: d.h - 56 };
    // Poço parabólico em pm, níveis n = 0..3 e |ψ₀|² à escala da ligação.
    const xmax = Math.max(4.5 * l, 0.55 * dBond), ymax = 4.5 * hw;
    const V = samples(-xmax, xmax, 401, (x) => P.potentialEV(x, l, hw));
    const psi0 = samples(-xmax, xmax, 601, (x) => { const xi = x / l; return 0.5 * hw + 1.6 * hw * P.density(0, xi) / P.density(0, 0); });
    const levels = [0, 1, 2, 3].map((n) => { const E = hw * P.energy(n), xt = l * P.turningPoint(n); return { y: E, from: -xt, to: xt, color: C.green, label: `n = ${n}` }; });
    const { X, Y } = plot(d.c, boxL, [{ points: V, color: C.gray, width: 2 }, { points: psi0, color: C.red, width: 2.2 }], [-xmax, xmax], [0, ymax], ["x (pm)", "energia (eV)"],
      { hlines: levels, marks: [{ x: -sx, color: C.red, dash: [3, 3] }, { x: sx, color: C.red, dash: [3, 3], label: "±σ_x" }], nx: 4, ny: 4, xfmt: (x) => fi(x), yfmt: (y) => f(y, 2) });
    // Barra do comprimento da ligação.
    const c = d.c, yb = boxL.b - 14;
    c.strokeStyle = C.purple; c.fillStyle = C.purple; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X(-dBond / 2), yb); c.lineTo(X(dBond / 2), yb); c.stroke();
    [-1, 1].forEach((sg) => { c.beginPath(); c.moveTo(X(sg * dBond / 2), yb - 6); c.lineTo(X(sg * dBond / 2), yb + 6); c.stroke(); });
    c.font = "10px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(`comprimento da ligação d = ${fi(dBond)} pm`, X(0), yb - 8);
    c.fillStyle = C.red; c.fillText(`σ_x = ${f(sx, 1)} pm`, X(0), Y(0.5 * hw + 1.6 * hw) - 6);
    // Populações térmicas em escala log (só depois da previsão).
    const floor = -12, lbl = boxR, Yp = (p) => lbl.b - (Math.log10(Math.max(p, 1e-300)) - floor) / (0 - floor) * (lbl.b - lbl.t);
    c.strokeStyle = C.grid; c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui";
    for (let e = 0; e >= floor; e -= 3) { const y = Yp(Math.pow(10, e)); c.beginPath(); c.moveTo(lbl.l, y); c.lineTo(lbl.r, y); c.stroke(); c.textAlign = "right"; c.fillText(e === 0 ? "1" : `10${String(e).replace("-", "⁻").replace(/\d/g, (q) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+q])}`, lbl.l - 5, y + 3); }
    c.strokeStyle = C.gray; c.beginPath(); c.moveTo(lbl.l, lbl.b); c.lineTo(lbl.r, lbl.b); c.moveTo(lbl.l, lbl.t); c.lineTo(lbl.l, lbl.b); c.stroke();
    const bw = (lbl.r - lbl.l) / 4;
    if (show) pops.forEach((p, n) => {
      const x0 = lbl.l + n * bw + bw * 0.2, y = Yp(p);
      c.fillStyle = n === 0 ? C.green : C.blue; c.fillRect(x0, y, bw * 0.6, lbl.b - y);
      c.fillStyle = C.gray; c.textAlign = "center"; c.fillText(`n = ${n}`, x0 + bw * 0.3, lbl.b + 15);
      const txt = p < 1e-12 ? "< 10⁻¹²" : (p > 0.01 ? f(p, 3) : sci(p));
      if (y - 5 < lbl.t + 10) { c.fillStyle = "#fff"; c.fillText(txt, x0 + bw * 0.3, y + 14); } else c.fillText(txt, x0 + bw * 0.3, y - 5);
    });
    else { c.fillStyle = C.gray; c.font = "11px Ubuntu,system-ui"; c.textAlign = "center"; ["população térmica:", "escreva a previsão e mova T", "(ou clique em \"mostrar\")"].forEach((t, k) => c.fillText(t, (lbl.l + lbl.r) / 2, (lbl.t + lbl.b) / 2 + 14 * (k - 1))); }
    c.fillStyle = C.gray; c.font = "11px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(`população térmica a T = ${fi(T)} K`, (lbl.l + lbl.r) / 2, lbl.b + 32);
    legend([[C.gray, "V = ½μω²x²"], [C.green, "níveis E_n"], [C.red, "|ψ₀|² (escala arbitrária, deslocada até E₀)"], [C.purple, "comprimento da ligação"], [C.blue, "P_n = (1 − q)qⁿ, q = e^{−ħω/k_BT}"]]);
    set("medNuOut", `${fi(nu)} cm⁻¹`); set("medTOut", `${fi(T)} K (${f(T - 273.15, 0)} °C)`);
    const hid = "—";
    set("statusTitle", `${P.PAIRS[pair].label}`); set("statusDetail", show ? `ħω = ${f(hw, 3)} eV · P₁/P₀ = ${sci(ratio)}` : `ħω = ${f(hw, 3)} eV · P₁/P₀ após a previsão`);
    set("mainTitle", "Vibração de uma ligação como oscilador harmônico"); set("mainSubtitle", show ? "esquerda: poço em pm com os quatro primeiros níveis; direita: população de Boltzmann (escala log)" : "escreva a previsão e mova o controle: a população térmica aparece depois");
    set("caption", warnAnh
      ? `σ_x/d = ${f(100 * ratioSd, 0)} %: o núcleo já explora a região onde V(x) não é parabólico — a expansão em 2ª ordem não se justifica bem (anarmonicidade forte; para H₂, ω_e x_e/ω_e = 2,8 %, e a linha medida 0 → 1 fica em 4159 cm⁻¹, 5,8 % abaixo de ω_e = 4401). |ψ₀|² está deslocada até E₀ só para leitura; o eixo vertical não vale para ela.`
      : `σ_x/d = ${f(100 * ratioSd, 1)} %: o poço parabólico ocupa só uma fração minúscula do comprimento da ligação — o núcleo mal sai do fundo, o que justifica truncar V(x) na segunda ordem. |ψ₀|² está deslocada até E₀ só para leitura; o eixo vertical não vale para ela. A barra de n = 1 mostra quantas ligações poderiam emitir uma linha anti-Stokes.`);
    set("prediction", "A 37 °C, que fração das ligações C=O está no primeiro estado excitado: ~30 %, ~3 % ou menos de 0,1 %?");
    html("calculation", `ħω = hcν̃ = 1239,84 eV·nm × ${fi(nu)} × 10⁻⁷ nm⁻¹ = ${f(hw, 3)} eV<br>ℓ = ħc/√(μc²·ħω) = 197,3 eV·nm/√(${f(mu * P.U_C2_EV / 1e9, 2)}×10⁹ × ${f(hw, 3)}) eV = ${f(l, 1)} pm<br><b>P₁/P₀ = e^{−ħω/k_BT} = e^{−${f(hw, 3)}/${f(kT, 4)}} = ${show ? sci(ratio) : hid}</b><small>σ_x = ℓ/√2 = ${f(sx, 1)} pm = ${f(100 * ratioSd, 1)} % de d = ${fi(dBond)} pm · ħω/k_BT = ${f(hw / kT, 1)}</small>`);
    metrics([["ħω = hcν̃", `${f(hw, 3)} eV`], ["E₀ = ħω/2", `${f(hw / 2, 3)} eV`], ["μ", `${f(mu, 2)} u (${f(mu * P.U_C2_EV / 1e9, 2)} GeV/c²)`], ["ℓ = √(ħ/μω)", `${f(l, 2)} pm`], ["σ_x = ℓ/√2", `${f(sx, 2)} pm (${f(100 * ratioSd, 1)} % de d)`], ["P₁/P₀ a T", show ? sci(ratio) : hid]]);
    set("conceptTitle", warnT ? "Quando a anti-Stokes aparece" : "Por que o Raman de tecido é quase só Stokes");
    set("conceptText", (warnT
      ? `Aqui ħω/k_BT = ${f(hw / kT, 1)} < 5: P₁/P₀ = ${sci(ratio)} já é da ordem de 1 % ou mais e a linha anti-Stokes é mensurável — é a base da termometria Raman (I_aS/I_S = ((ν̃₀ + ν̃)/(ν̃₀ − ν̃))⁴ e^{−ħω/k_BT}; a 800 cm⁻¹ com laser de 785 nm dá 4 %, contra 0,11 % a 1700 cm⁻¹). `
      : "Com ħω ≫ k_BT praticamente toda ligação está em n = 0: o fóton só pode perder ħω (linha Stokes, 0 → 1); a anti-Stokes exigiria partir de n = 1. ")
      + "O ponto zero E₀ = ħω/2 e a largura σ_x = ℓ/√2 são a mesma física do fundamental da aula. O que o clínico lê: um espectro Raman de tecido (excitação em 785 nm) é um conjunto de picos Stokes — 1004 cm⁻¹ (fenilalanina), 1450 (CH₂), 1655 (amida I), 1740 (éster), 2850–2940 (C–H) — e o diagnóstico vem das razões entre picos (tumor tem mais ácido nucleico e menos lipídio); uma sonda Raman intraoperatória separa cérebro normal de glioma com sensibilidade 93 % e especificidade 91 % (Jermyn et al., 2015). Limite do modelo: o potencial real é anarmônico (Morse): para a amida I a transição 1 → 2 fica 16 cm⁻¹ (1 %) abaixo de 0 → 1; para o CO livre ω_e x_e = 13,3 cm⁻¹ e para H₂, 121 cm⁻¹ (2,8 % de ω_e). O sobretom 0 → 2 é fraco porque no oscilador harmônico só Δn = ±1 é permitido (Aula 17).");
    prompts(["Com C=O e 1700 cm⁻¹, leia ħω, E₀, ℓ, σ_x e P₁/P₀ e compare com o exemplo da nota (0,211 eV; 0,105 eV; 5,4 pm; 3,8 pm; 3,7×10⁻⁴). Depois troque para amida I (1655) e éster (1740): o que muda e o que o espectrômetro consegue separar (resolução ~5 cm⁻¹)?", "Troque para H₂ (4401 cm⁻¹): o ponto zero chega a 0,27 eV e σ_x/d passa de 10 %. Por que ℓ cresce quando μ diminui, mesmo com ħω maior? O que o aviso da legenda diz sobre o modelo?", "Baixe T até 77 K (nitrogênio líquido): quantas ordens de grandeza P₁/P₀ cai? E se ν̃ fosse 800 cm⁻¹ (dobras de esqueleto): ħω/k_BT fica abaixo de 5 — o que acontece com a linha anti-Stokes?"]);
  }

  // ---------------------------------------------------------------- Navegação
  function render() { ({ tiro: drawTiro, hermite: drawHermite, classico: drawClassico, medica: drawMedica })[view](); }
  function switchView(next) {
    view = VIEWS.includes(next) ? next : "tiro";
    document.querySelectorAll("[data-view]").forEach((b) => { const active = b.dataset.view === view; b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { /* file:// sem history */ }
    render();
  }
  const DEFAULTS = { tiro: { tiroEps: 0.5, tiroParity: "par" }, hermite: { hermN: 0 }, classico: { clasN: 20, clasW: 0 }, medica: { medNu: 1700, medPair: "C=O", medT: 310 } };
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input, select").forEach((e) => e.addEventListener("input", () => { if (view in revealed) revealed[view] = true; render(); }));
  [["clasShow", "classico"], ["medShow", "medica"]].forEach(([id, v]) => $(id).addEventListener("click", () => { revealed[v] = true; render(); }));
  document.querySelectorAll("[data-eps]").forEach((b) => b.addEventListener("click", () => { const e = +b.dataset.eps; $("tiroEps").value = e; $("tiroParity").value = Math.round(e - 0.5) % 2 ? "impar" : "par"; render(); }));
  document.querySelectorAll("[data-med]").forEach((b) => b.addEventListener("click", () => { const [nu, pair, T] = b.dataset.med.split(","); $("medNu").value = nu; $("medPair").value = pair; $("medT").value = T; revealed.medica = true; render(); }));
  $("resetBtn").addEventListener("click", () => { Object.entries(DEFAULTS[view]).forEach(([id, v]) => { $(id).value = v; }); if (view in revealed) revealed[view] = false; render(); });
  window.addEventListener("resize", render);
  switchView(view);
})();

(function () {
  "use strict";
  const P = window.BarrierPhysics, $ = (id) => document.getElementById(id), C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", gray: "#6f7171", grid: "#dce5dc" };
  let view = new URLSearchParams(location.search).get("view") || "degrau";
  const f = (x, n = 3) => Number(x).toLocaleString("pt-BR", { maximumFractionDigits: n, minimumFractionDigits: n });
  function set(id, text) { $(id).textContent = text; } function html(id, content) { $(id).innerHTML = content; }
  function metrics(rows) { html("metrics", rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")); }
  function prompts(rows) { html("prompts", rows.map((x) => `<li>${x}</li>`).join("")); }
  function canvas() { const e = $("mainCanvas"), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = e.clientWidth || 900, h = w * 590 / 1100; e.width = w * ratio; e.height = h * ratio; const c = e.getContext("2d"); c.scale(ratio, ratio); c.clearRect(0, 0, w, h); return { c, w, h }; }
  function legend(rows) { html("legend", rows.map(([color, label]) => `<span><i style="border-color:${color}"></i>${label}</span>`).join("")); }
  function samples(a, b, n, fn) { return Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; }); }
  function plot(c, w, h, series, min, max, ymin, ymax, xlabel, ylabel, marks) {
    const l = 58, r = w - 20, t = 25, b = h - 52, X = (x) => l + (x - min) * (r - l) / (max - min), Y = (y) => b - (y - ymin) * (b - t) / (ymax - ymin);
    c.strokeStyle = C.grid; c.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const x = min + i * (max - min) / 5, y = ymin + i * (ymax - ymin) / 5;
      c.beginPath(); c.moveTo(X(x), t); c.lineTo(X(x), b); c.stroke();
      c.beginPath(); c.moveTo(l, Y(y)); c.lineTo(r, Y(y)); c.stroke();
      c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(f(x, 2), X(x), b + 16);
      c.textAlign = "right"; c.fillText(f(y, 2), l - 7, Y(y) + 3);
    }
    (marks || []).forEach((m) => { c.strokeStyle = m.color || C.gray; c.setLineDash(m.dash || [4, 4]); c.beginPath(); c.moveTo(X(m.x), t); c.lineTo(X(m.x), b); c.stroke(); c.setLineDash([]); });
    c.strokeStyle = C.gray; c.beginPath(); c.moveTo(l, b); c.lineTo(r, b); c.moveTo(l, t); c.lineTo(l, b); c.stroke();
    c.fillStyle = C.gray; c.font = "11px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(xlabel, (l + r) / 2, h - 10);
    c.save(); c.translate(13, (t + b) / 2); c.rotate(-Math.PI / 2); c.fillText(ylabel, 0, 0); c.restore();
    series.forEach((s) => { c.strokeStyle = s.color; c.lineWidth = 2.6; c.setLineDash(s.dash || []); c.beginPath(); s.points.forEach((p, i) => i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))); c.stroke(); c.setLineDash([]); });
    return { X, Y };
  }

  function drawDegrau() {
    const ratio = +$("degrauE").value, V0 = +$("degrauV0").value, E = ratio * V0;
    const s = P.step(E, V0), d = canvas();
    const R = samples(.05, 2.5, 260, (x) => P.step(x * V0, V0).R);
    const T = samples(.05, 2.5, 260, (x) => P.step(x * V0, V0).T);
    plot(d.c, d.w, d.h, [{ points: R, color: C.red }, { points: T, color: C.green, dash: [7, 4] }], .05, 2.5, 0, 1.05, "E/V₀", "R, T", [{ x: 1, color: C.gray }, { x: ratio, color: C.gold, dash: [] }]);
    legend([[C.red, "R(E)"], [C.green, "T(E)", true], [C.gold, "E atual"]]);
    set("degrauEOut", f(ratio, 2)); set("degrauV0Out", f(V0, 2));
    set("statusTitle", s.regime === "evanescente" ? "Reflexão total" : "Degrau com E>V₀");
    set("statusDetail", `E/V₀=${f(ratio, 2)}`);
    set("mainTitle", "Coeficientes de reflexão e transmissão"); set("mainSubtitle", "R+T=1 sempre que E>V₀; abaixo, R=1");
    set("caption", "Mesmo com E>V₀ há reflexão parcial: a onda muda de número de onda na descontinuidade, sem análogo clássico.");
    set("prediction", "Quando E se aproxima de V₀ por cima, T tende a zero ou a um valor finito?");
    if (s.regime === "evanescente") {
      html("calculation", `κ = √[2(V₀−E)] = ${f(s.kappa, 3)}<br><b>δ = 1/κ = ${f(s.delta, 3)}</b><small>R=1, T=0: só há penetração evanescente, sem corrente</small>`);
      metrics([["R", "1,000"], ["T", "0,000"], ["κ", f(s.kappa)], ["δ=1/κ", f(s.delta)]]);
    } else {
      html("calculation", `r = (k₁−k₂)/(k₁+k₂) = ${f((s.k1 - s.k2) / (s.k1 + s.k2), 3)}<br><b>R = ${f(s.R, 3)}, T = ${f(s.T, 3)}</b><small>R+T = ${f(s.R + s.T, 6)}</small>`);
      metrics([["k₁", f(s.k1)], ["k₂", f(s.k2)], ["R", f(s.R)], ["T", f(s.T)]]);
    }
    set("conceptTitle", "Reflexão quântica num degrau"); set("conceptText", "A conexão de ψ e ψ' numa descontinuidade sempre produz onda refletida quando os números de onda mudam, mesmo sem barreira de energia.");
    prompts(["Leve E/V₀ de baixo para cima de 1 e acompanhe R e T.", "Verifique R+T=1 para E>V₀.", "Explique por que T=0 abaixo do degrau apesar de ψ≠0 em x>0."]);
  }

  function drawBarreira() {
    const ratio = +$("barreiraE").value, V0 = +$("barreiraV0").value, a = +$("barreiraA").value, E = ratio * V0;
    const T = P.barrierT(E, V0, a), Twide = E < V0 ? P.barrierTWide(E, V0, a) : NaN;
    const curve = samples(.02, 1.98, 300, (x) => P.barrierT(x * V0, V0, a));
    const d = canvas();
    plot(d.c, d.w, d.h, [{ points: curve, color: C.green }], .02, 1.98, 0, 1.05, "E/V₀", "T(E)", [{ x: 1, color: C.gray }, { x: ratio, color: C.gold, dash: [] }]);
    legend([[C.green, "T exato"], [C.gold, "E atual"]]);
    set("barreiraEOut", f(ratio, 2)); set("barreiraV0Out", f(V0, 2)); set("barreiraAOut", f(a, 2));
    set("statusTitle", "Barreira retangular"); set("statusDetail", `E/V₀=${f(ratio, 2)} · a=${f(a, 2)}`);
    set("mainTitle", "Transmissão através da barreira"); set("mainSubtitle", "sub-barreira (senh) à esquerda de E=V₀, ressonâncias (sen) à direita");
    set("caption", "T nunca é zero abaixo de V₀: a partícula atravessa uma região classicamente proibida (tunelamento).");
    set("prediction", "Dobrar a largura a divide T pela metade ou o afeta exponencialmente?");
    const kappa = E < V0 ? Math.sqrt(2 * (V0 - E)) : NaN;
    html("calculation", E < V0
      ? `κa = ${f(kappa * a, 3)}<br><b>T = [1+V₀²senh²(κa)/4E(V₀−E)]⁻¹ = ${f(T, 5)}</b><small>aproximação de barreira larga: T≈${f(Twide, 5)}</small>`
      : `T = [1+V₀²sen²(qa)/4E(E−V₀)]⁻¹ = ${f(T, 5)}<small>acima da barreira: ressonâncias em qa=nπ</small>`);
    metrics([["E/V₀", f(ratio)], ["a", f(a)], ["T exato", f(T, 5)], ["T aprox.", isNaN(Twide) ? "—" : f(Twide, 5)]]);
    set("conceptTitle", "Tunelamento"); set("conceptText", "T decai aproximadamente como e^{−2κa}: a sensibilidade exponencial à largura e à massa está por trás do decaimento alfa e da microscopia de tunelamento.");
    prompts(["Aumente a e observe a escala do eixo T.", "Compare T exato e a aproximação de barreira larga para κa grande e pequeno.", "Verifique que T→1 quando a→0."]);
  }

  function drawRessonancia() {
    const ratio = +$("ressonanciaE").value, V0 = +$("ressonanciaV0").value, a = +$("ressonanciaA").value, E = ratio * V0;
    const T = P.barrierT(E, V0, a);
    const q = Math.sqrt(2 * (E - V0));
    const curve = samples(1.005, 4, 320, (x) => P.barrierT(x * V0, V0, a));
    const marks = [{ x: ratio, color: C.gold, dash: [] }];
    for (let n = 1; n <= 6; n += 1) { const En = P.resonanceEnergy(V0, a, n) / V0; if (En > 1 && En < 4) marks.push({ x: En, color: C.red }); }
    const d = canvas();
    plot(d.c, d.w, d.h, [{ points: curve, color: C.green }], 1.005, 4, 0, 1.05, "E/V₀", "T(E)", marks);
    legend([[C.green, "T(E)"], [C.red, "ressonâncias qa=nπ"], [C.gold, "E atual"]]);
    set("ressonanciaEOut", f(ratio, 2)); set("ressonanciaV0Out", f(V0, 2)); set("ressonanciaAOut", f(a, 2));
    set("statusTitle", "Transmissão ressonante"); set("statusDetail", `qa=${f(q * a, 3)}`);
    set("mainTitle", "Ressonâncias acima da barreira"); set("mainSubtitle", "T=1 sempre que qa=nπ");
    set("caption", "Reflexões múltiplas nas duas interfaces interferem construtivamente quando a largura contém um número inteiro de meios-comprimentos de onda internos.");
    set("prediction", "Entre duas ressonâncias consecutivas, T chega a cair até quanto?");
    html("calculation", `q = √[2(E−V₀)] = ${f(q, 3)}<br><b>qa = ${f(q * a, 3)} · T = ${f(T, 5)}</b><small>T=1 em qa = π, 2π, 3π, ...</small>`);
    metrics([["q", f(q)], ["qa", f(q * a)], ["T", f(T, 5)], ["próxima ressonância", `qa=${f(Math.ceil(q * a / Math.PI) * Math.PI, 2)}`]]);
    set("conceptTitle", "Interferência de múltiplas reflexões"); set("conceptText", "O mesmo mecanismo de camadas antirreflexo ópticas: a barreira se torna invisível quando sua largura casa com o comprimento de onda interno.");
    prompts(["Mova E até T=1 e leia qa no painel.", "Aumente a e veja as ressonâncias ficarem mais próximas.", "Compare com o limite clássico (T=1 sempre) para V₀→0."]);
  }

  function render() { if (view === "degrau") drawDegrau(); else if (view === "barreira") drawBarreira(); else drawRessonancia(); }
  function switchView(next) {
    view = ["degrau", "barreira", "ressonancia"].includes(next) ? next : "degrau";
    document.querySelectorAll("[data-view]").forEach((b) => { const active = b.dataset.view === view; b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view));
    try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) { }
    render();
  }
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("input").forEach((e) => e.addEventListener("input", render));
  $("resetBtn").addEventListener("click", () => {
    const d = { degrau: ["degrauE", 1.4, "degrauV0", 1], barreira: ["barreiraE", .4, "barreiraV0", 1, "barreiraA", 1.5], ressonancia: ["ressonanciaE", 1.4, "ressonanciaV0", 1, "ressonanciaA", 2] }[view];
    for (let i = 0; i < d.length; i += 2) $(d[i]).value = d[i + 1];
    render();
  });
  window.addEventListener("resize", render);
  switchView(view);
})();

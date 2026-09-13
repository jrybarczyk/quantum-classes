(function () {
  "use strict";
  const P = window.WavePhysics, $ = (id) => document.getElementById(id), C = { green: "#619b60", lime: "#83c44e", red: "#c65c4b", gold: "#e9a23b", gray: "#6f7171", grid: "#dce5dc" };
  let view = new URLSearchParams(location.search).get("view") || "plane";
  const f = (x, n = 3) => Number(x).toLocaleString("pt-BR", { maximumFractionDigits: n, minimumFractionDigits: n });
  const sci = (x, n = 3) => { if (!Number.isFinite(x) || x === 0) return f(x, n); const e = Math.floor(Math.log10(Math.abs(x))); return `${f(x / 10 ** e, n)}×10<sup>${e}</sup>`; };
  function set(id, text) { $(id).textContent = text; } function html(id, content) { $(id).innerHTML = content; }
  function metrics(rows) { html("metrics", rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")); }
  function prompts(rows) { html("prompts", rows.map((x) => `<li>${x}</li>`).join("")); }
  function canvasFor(id, aspect = 590 / 1100) { const e = $(id), ratio = Math.max(1, Math.min(2, devicePixelRatio || 1)), w = e.clientWidth || 900, h = w * aspect; e.width = w * ratio; e.height = h * ratio; const c = e.getContext("2d"); c.scale(ratio, ratio); c.clearRect(0, 0, w, h); return { c, w, h }; }
  function canvas() { return canvasFor("mainCanvas"); }
  function showSecondary(show) { document.querySelector(".secondary-panel").hidden = !show; }
  document.querySelector(".tabs").addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; const tabs = [...document.querySelectorAll("[data-view]")], current = tabs.findIndex(tab => tab.dataset.view === view), index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; event.preventDefault(); tabs[index].focus(); switchView(tabs[index].dataset.view); });
  function plot(c, w, h, series, min, max, ymin, ymax, xlabel, ylabel) { const l = 58, r = w - 20, t = 25, b = h - 52, X = (x) => l + (x - min) * (r - l) / (max - min), Y = (y) => b - (y - ymin) * (b - t) / (ymax - ymin); c.strokeStyle = C.grid; c.lineWidth = 1; for (let i = 0; i <= 5; i += 1) { const x = min + i * (max - min) / 5, y = ymin + i * (ymax - ymin) / 5; c.beginPath(); c.moveTo(X(x), t); c.lineTo(X(x), b); c.stroke(); c.beginPath(); c.moveTo(l, Y(y)); c.lineTo(r, Y(y)); c.stroke(); c.fillStyle = C.gray; c.font = "10px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(f(x, 1), X(x), b + 16); c.textAlign = "right"; c.fillText(f(y, 1), l - 7, Y(y) + 3); } c.strokeStyle = C.gray; c.beginPath(); c.moveTo(l, b); c.lineTo(r, b); c.moveTo(l, t); c.lineTo(l, b); c.stroke(); c.fillStyle = C.gray; c.font = "11px Ubuntu,system-ui"; c.textAlign = "center"; c.fillText(xlabel, (l + r) / 2, h - 10); c.save(); c.translate(13, (t + b) / 2); c.rotate(-Math.PI / 2); c.fillText(ylabel, 0, 0); c.restore(); series.forEach((s) => { c.strokeStyle = s.color; c.lineWidth = 2.6; c.setLineDash(s.dash || []); c.beginPath(); s.points.forEach((p, i) => i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))); c.stroke(); c.setLineDash([]); }); return { X, Y, l, r, t, b }; }
  function samples(a, b, n, fn) { return Array.from({ length: n }, (_, i) => { const x = a + i * (b - a) / (n - 1); return { x, y: fn(x) }; }); }
  function legend(rows) { html("legend", rows.map(([color, label]) => `<span><i style="border-color:${color}"></i>${label}</span>`).join("")); }
  function drawPlane() { const k = +$("planeK").value, t = +$("planeT").value, d = canvas(), p = plot(d.c, d.w, d.h, [{ points: samples(0, 2 * Math.PI, 260, (x) => P.plane(x, t, k).re), color: C.green }, { points: samples(0, 2 * Math.PI, 260, (x) => P.plane(x, t, k).density), color: C.red, dash: [8, 5] }], 0, 2 * Math.PI, -1.1, 1.2, "posição x", "amplitude / densidade"); legend([[C.green, "Re Ψ"], [C.red, "|Ψ|²", true]]); set("planeKOut", f(k, 2)); set("planeTOut", f(t, 2)); set("statusTitle", "Onda plana"); set("statusDetail", `k = ${f(k, 2)} · t = ${f(t, 2)}`); set("mainTitle", "Onda plana e densidade"); set("mainSubtitle", "a fase oscila; |Ψ|² permanece constante"); set("caption", "Uma onda plana tem momento definido, mas não é localizada nem normalizável em toda a reta. O eixo mostra x de 0 a 2π; com k=2 cabem dois períodos."); set("prediction", "Se t mudar, |Ψ|² muda de forma ou apenas a fase?"); const si = P.electronSI(0.10e-9); html("calculation", `ω = k²/2 = ${f(k * k / 2, 3)}<small>vf = ω/k = ${f(k / 2, 3)} · vg = dω/dk = ${f(k, 3)}</small><small>Em SI (exemplo do slide), elétron com λ=0,10 nm: k=${sci(si.k, 3)} m⁻¹, E=${f(si.energyEV, 1)} eV, vg=${sci(si.groupVelocity, 3)} m/s, vf=${sci(si.phaseVelocity, 3)} m/s</small>`); metrics([["ω", f(k * k / 2)], ["vf/v", "0,500"], ["vg/v", "1,000"], ["|Ψ|²", "constante"]]); set("conceptTitle", "Momento definido não localiza"); set("conceptText", "A uniformidade de |Ψ|² é a contrapartida espacial de Δp=0: para localizar, precisamos superpor muitos k."); prompts(["Mude k sem alterar a amplitude.", "Varie t e acompanhe uma crista: ela anda com vf. A velocidade de grupo só aparece num pacote (estação 2).", "Explique por que uma onda plana é um estado generalizado."]); }
  function drawBorn() { const phase = +$("bornPhase").value, right = +$("bornRight").value, d = canvas(), data = samples(0, 2 * Math.PI, 300, (x) => P.interference(x, phase)); plot(d.c, d.w, d.h, [{ points: data, color: C.green }], 0, 2 * Math.PI, 0, 4.2, "posição x (k=1, logo kx=x)", "|Ψ|²/|A|²"); legend([[C.green, `φ=${f(phase / Math.PI, 2)}π`]]); set("bornPhaseOut", `${f(phase / Math.PI, 2)}π`); set("bornRightOut", f(right, 2)); const probability = P.bornInterval(right, phase); set("statusTitle", "Born e interferência"); set("statusDetail", `φ=${f(phase / Math.PI, 2)}π`); set("mainTitle", "Densidade de probabilidade"); set("mainSubtitle", "amplitudes somam antes do módulo ao quadrado"); set("caption", "O termo cruzado desloca máximos e mínimos. A fase global desaparece; a fase relativa permanece observável. A probabilidade é calculada com Ψ normalizada no período 0≤x≤2π."); set("prediction", "Aumentar φ muda a probabilidade no intervalo ou apenas a fase complexa?"); html("calculation", `P(0≤x≤b) = ∫₀ᵇ |Ψ|²dx<br><b>= ${f(probability, 3)}</b><small>|Ψ₁+Ψ₂|² = |Ψ₁|²+|Ψ₂|²+2Re(Ψ₁*Ψ₂)</small><small>Normalização em um período: ∫₀^{2π}|Ψ|²dx=1 ⇒ |A|²=1/(4π). Na reta inteira esta Ψ não é normalizável.</small>`); metrics([["fase relativa", `${f(phase, 2)} rad`], ["intervalo b", f(right, 2)], ["P(0,b)", f(probability, 3)], ["fase global", "não observável"]]); set("conceptTitle", "Born transforma amplitude em probabilidade"); set("conceptText", "A regra |Ψ|² preserva interferência e exige normalização. Probabilidade não é amplitude nem intensidade clássica."); prompts(["Compare φ=0 e φ=π/2.", "Aumente b até conter um máximo.", "Explique o sinal do termo de interferência."]); }
  function drawSchrodinger() {
    const k = +$("schrodingerK").value, m = +$("schrodingerM").value, t = +$("schrodingerT").value, ratio = +$("schrodingerOmega").value;
    const free = P.freeOmega(k, m), omega = ratio * free, sides = P.schrodingerSides(k, m, omega), d = canvas();
    const scale = Math.max(free, omega) * 1.15;
    plot(d.c, d.w, d.h, [
      { points: samples(0, 2 * Math.PI, 260, (x) => sides.left * P.plane(x, t, k, omega).re), color: C.green },
      { points: samples(0, 2 * Math.PI, 260, (x) => sides.right * P.plane(x, t, k, omega).re), color: C.gold, dash: [7, 4] }
    ], 0, 2 * Math.PI, -scale, scale, "posição x", "Re dos dois lados (ℏ=1)");
    legend([[C.green, "Re[iℏ∂ₜΨ] = ω·ReΨ"], [C.gold, "Re[−ℏ²∂ₓ²Ψ/2m] = (k²/2m)·ReΨ", true]]);
    set("schrodingerKOut", f(k, 2)); set("schrodingerMOut", f(m, 2)); set("schrodingerTOut", f(t, 2)); set("schrodingerOmegaOut", f(ratio, 2));
    const ok = Math.abs(sides.residual) < 1e-9;
    set("statusTitle", "Teste de Schrödinger"); set("statusDetail", `ω=${f(omega, 3)} · residual=${f(sides.residual, 3)}`);
    set("mainTitle", ok ? "A onda plana satisfaz Schrödinger" : "Com este ω a onda plana não satisfaz Schrödinger");
    set("mainSubtitle", ok ? "as duas curvas coincidem: a relação de dispersão cancela o residual" : "as duas curvas têm amplitudes diferentes: o residual não se anula");
    set("caption", "Aplicar iℏ∂ₜ e −ℏ²∂ₓ²/(2m) à mesma exponencial e^{i(kx−ωt)} produz ℏωΨ e (ℏ²k²/2m)Ψ. Os lados só coincidem quando ω=ℏk²/(2m), isto é, E=p²/(2m).");
    set("prediction", "Se ω for 30% maior que ℏk²/(2m), qual dos dois lados muda e qual permanece? O residual depende de t?");
    html("calculation", `iℏ∂<sub>t</sub>Ψ = ℏωΨ, ω = ${f(omega, 3)}<br>−ℏ²∂<sub>x</sub>²Ψ/(2m) = (ℏ²k²/2m)Ψ, k²/2m = ${f(free, 3)}<br><b>residual = ω − k²/2m = ${f(sides.residual, 3)}</b>`);
    metrics([["ω escolhido", f(omega)], ["ℏk²/(2m)", f(free)], ["E=ℏω", f(omega)], ["p=ℏk", f(k)], ["residual", f(sides.residual)]]);
    set("conceptTitle", "Motivação não é dedução"); set("conceptText", "As correspondências entre derivadas e E,p motivam a equação; sua validade é um postulado testado experimentalmente. O residual nulo só confirma a relação de dispersão da partícula livre.");
    prompts(["Com ω livre, varie m e confirme ω∝1/m.", "Fixe k e m e afaste ω do valor livre: meça o residual.", "Identifique a ordem temporal e espacial da equação e explique por que ela precisa de uma condição inicial."]);
  }
  function drawPacketImproved() {
    const sigma = +$("packetSigma").value, k0 = +$("packetK").value, t = +$("packetT").value;
    const state = P.gaussian(0, t, sigma, k0), span = Math.max(4, 4.2 * state.width);
    const xMin = state.center - span, xMax = state.center + span;
    const densityPeak = 1 / (Math.sqrt(2 * Math.PI) * state.width);
    const wavePeak = Math.sqrt(densityPeak), main = canvas();
    plot(main.c, main.w, main.h, [
      { points: samples(xMin, xMax, 340, x => P.gaussian(x, t, sigma, k0).density), color: C.green },
      { points: samples(xMin, xMax, 340, x => P.gaussian(x, t, sigma, k0).re), color: C.gold, dash: [7, 4] }
    ], xMin, xMax, -1.12 * wavePeak, Math.max(1.12 * densityPeak, 1.12 * wavePeak), "posição x", "ρ e Re Ψ");
    const deltaK = 1 / (2 * sigma), kSpan = Math.max(3, 4.2 * deltaK);
    const momentumPeak = 1 / (Math.sqrt(2 * Math.PI) * deltaK), secondary = canvasFor("secondaryCanvas", .34);
    plot(secondary.c, secondary.w, secondary.h, [
      { points: samples(k0 - kSpan, k0 + kSpan, 340, k => P.momentumGaussian(k, sigma, k0)), color: C.red }
    ], k0 - kSpan, k0 + kSpan, 0, momentumPeak * 1.12, "número de onda k", "|Φ(k)|²");
    legend([[C.green, "|Ψ(x)|²"], [C.gold, "Re Ψ", true], [C.red, "|Φ(k)|² abaixo"]]);
    set("secondaryTitle", "Distribuição em número de onda");
    set("secondarySubtitle", "a largura Δk não muda durante a evolução livre");
    set("secondaryCaption", "Estreitar o pacote inicialmente em x exige uma distribuição mais larga em k.");
    set("packetSigmaOut", f(sigma, 2)); set("packetKOut", f(k0, 2)); set("packetTOut", f(t, 2));
    set("statusTitle", "Pacote gaussiano"); set("statusDetail", `σ=${f(sigma, 2)} · t=${f(t, 2)}`);
    set("mainTitle", "Pacote viajante e dispersivo"); set("mainSubtitle", "os eixos acompanham o centro e a largura");
    set("caption", "Os limites do gráfico se ajustam ao movimento e à dispersão. Em t>0 a fase ganha um termo quadrático: a frente do pacote oscila mais rápido que a cauda, porque as componentes de k maior se adiantam.");
    set("prediction", "Diminuir σ estreita ou alarga a distribuição em k? O produto pode ficar menor que ℏ/2?");
    html("calculation", `σ(t)=√[σ₀²+t²/(4σ₀²)]<br><b>= ${f(state.width, 3)}</b><small>Δk=1/(2σ₀)=${f(deltaK, 3)} · Δx₀Δp=0,500 ℏ</small>`);
    metrics([["centro x(t)", f(state.center)], ["Δx(t)", f(state.width)], ["Δk", f(deltaK)], ["Δx₀Δp/ℏ", "0,500"]]);
    set("conceptTitle", "Superposição localiza"); set("conceptText", "A faixa de números de onda produz uma envoltória localizada; a dispersão nasce da curvatura de ω(k).");
    prompts(["Fixe t e varie σ.", "Meça a velocidade do centro.", "Compare as duas larguras sem misturar seus eixos."]);
  }
  function render() { showSecondary(view === "packet"); if (view === "plane") drawPlane(); else if (view === "packet") drawPacketImproved(); else if (view === "born") drawBorn(); else drawSchrodinger(); }
  function switchView(next) { view = ["plane", "packet", "born", "schrodinger"].includes(next) ? next : "plane"; document.querySelectorAll("[data-view]").forEach((b) => { const active = b.dataset.view === view; b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active)); }); document.querySelectorAll("[data-controls]").forEach((s) => s.classList.toggle("active", s.dataset.controls === view)); try { const u = new URL(location.href); u.searchParams.set("view", view); history.replaceState(null, "", u); } catch (_) {} render(); }
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view))); document.querySelectorAll("input").forEach((e) => e.addEventListener("input", render)); document.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.set).value = b.dataset.value; render(); })); $("resetBtn").addEventListener("click", () => { const d = { plane: ["planeK", 2, "planeT", 0], packet: ["packetSigma", .7, "packetK", 2, "packetT", 0], born: ["bornPhase", 0, "bornRight", 3.14], schrodinger: ["schrodingerK", 2, "schrodingerM", 1, "schrodingerT", 1, "schrodingerOmega", 1] }[view]; for (let i = 0; i < d.length; i += 2) $(d[i]).value = d[i + 1]; render(); }); window.addEventListener("resize", render); switchView(view);
})();

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BarrierPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Unidades naturais: m = hbar = 1. Energias e V0 na mesma escala arbitraria.

  function kOf(E) { return Math.sqrt(2 * E); }

  // Degrau em x=0, altura V0. Retorna R, T e os numeros de onda/decaimento.
  function step(E, V0) {
    if (E <= 0) return { R: 1, T: 0, regime: "abaixo" };
    if (E > V0) {
      const k1 = Math.sqrt(2 * E), k2 = Math.sqrt(2 * (E - V0));
      const R = ((k1 - k2) / (k1 + k2)) ** 2;
      const T = 4 * k1 * k2 / (k1 + k2) ** 2;
      return { R, T, k1, k2, regime: "acima" };
    }
    const k1 = Math.sqrt(2 * E), kappa = Math.sqrt(2 * (V0 - E));
    return { R: 1, T: 0, k1, kappa, delta: 1 / kappa, regime: "evanescente" };
  }

  // Barreira retangular de altura V0 e largura a, valida para qualquer E>0
  // (sub-barreira via senh, acima da barreira via seno, mesma formula por
  // continuacao analitica kappa -> i q).
  function barrierT(E, V0, a) {
    if (E <= 0) return 0;
    if (Math.abs(E - V0) < 1e-9) {
      // limite kappa,q -> 0: sinh(kappa a)/kappa -> a, formula reduz a
      // T = [1 + V0 m a^2/(2 hbar^2)]^-1 (aqui m=hbar=1)
      return 1 / (1 + V0 * a * a / 2);
    }
    if (E < V0) {
      const kappa = Math.sqrt(2 * (V0 - E));
      const s = Math.sinh(kappa * a);
      return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
    }
    const q = Math.sqrt(2 * (E - V0));
    const s = Math.sin(q * a);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
  }

  // Aproximacao de barreira larga/alta (kappa*a >> 1), valida so para E<V0.
  function barrierTWide(E, V0, a) {
    if (E >= V0) return NaN;
    const kappa = Math.sqrt(2 * (V0 - E));
    return 16 * E * (V0 - E) / (V0 * V0) * Math.exp(-2 * kappa * a);
  }

  // Proximo zero de ressonancia (T=1) acima da barreira: q*a = n*pi.
  function resonanceEnergy(V0, a, n) {
    const q = n * Math.PI / a;
    return V0 + q * q / 2;
  }

  // Perfil espacial (parte real de psi, ate uma normalizacao arbitraria A=1)
  // para a barreira, usado so para desenhar a decaimento/oscilacao dentro
  // dela; nao pretende reproduzir a onda completa nas tres regioes com as
  // fases exatas de conexao (isso exigiria as amplitudes complexas C,D,F).
  function barrierProfile(x, E, V0, a) {
    if (x < 0) return Math.cos(kOf(E) * x);
    if (x <= a) {
      if (E < V0) {
        const kappa = Math.sqrt(2 * (V0 - E));
        return Math.exp(-kappa * x) / Math.exp(-kappa * 0);
      }
      const q = Math.sqrt(2 * (E - V0));
      return Math.cos(q * x);
    }
    return null;
  }

  return { kOf, step, barrierT, barrierTWide, resonanceEnergy, barrierProfile };
});

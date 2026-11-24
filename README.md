# Mecânica Quântica — aplicações interativas

Laboratórios de apoio à disciplina de Mecânica Quântica do curso de Física
Médica, Instituto de Biociências de Botucatu, UNESP.

Site publicado: <https://jrybarczyk.github.io/quantum-classes/>

| Aula | Aplicação | Conteúdo |
|---:|---|---|
| 01 | [Laboratório das Origens Quânticas](aula-01-origens-quanticas/) | Corpo negro, efeito fotoeletrico, efeito Compton e ondas de materia. |
| 02 | [Estúdio da Função de Onda](aula-02-funcao-onda/) | Onda plana, pacote gaussiano, regra de Born e equacao de Schrodinger. |
| 03 | [Aula 3 · Normalização e incerteza](aula-03-normalizacao-corrente/) | Normalizacao, corrente de probabilidade e relacoes de incerteza. |
| 04 | [Aula 4 · Estados estacionários](aula-04-estados-estacionarios/) | Separacao temporal, estados estacionarios, autovalores e operadores hermitianos. |
| 05 | [Aula 5 · Poço infinito](aula-05-poco-infinito/) | Espectro, medida de posicao, truque de Fourier, revivencia e fisica medica. |
| 06 | [Aula 6 · Postulado de medida](aula-06-expansao-medidas/) | Caixas e fichas: brackets e operadores; postulado de medida (H, x, H); media e variancia; degenerescencia com projetor; paridade e espaco k da RM. |
| 07 | [Aula 7 · Degraus e barreiras](aula-07-degraus-barreiras/) | Degrau e barreira de potencial, reflexao, tunelamento, alfa do Ra-223 pelo fator de Gamow e eco de ultrassom. |
| 08 | [Aula 8 · Poço quadrado finito](aula-08-poco-finito/) | Poco finito: solucao grafica, caudas evanescentes, limite infinito e ponto quantico de CdSe. |
| 09 | [Aula 9 · Potenciais delta de Dirac](aula-09-potenciais-delta/) | Delta de Dirac: salto de psi', estado ligado, espalhamento, polo e doador raso no HPGe. |
| 10 | [Aula 10 · Oscilador harmônico](aula-10-oscilador-harmonico/) | Oscilador harmonico: quantizacao por tiro, autofuncoes de Hermite, limite classico e vibracao C=O em tecidos. |


## Desafios

Missões com caso escondido (use `?seed=N` para dar um caso a cada dupla), orçamento
limitado e pontuação de 0 a 100. Combinam conceitos das aulas 1 a 10.

| Desafio | Aplicação | Missão |
|---:|---|---|
| D1 | [Desafio 1 · Espectrômetro misterioso](desafio-01-espectrometro/) | Identifique o radionuclideo e a blindagem a partir de um espectro de NaI: bordas Compton, calibracao e atenuacao. |
| D2 | [Desafio 2 · Scanner de RM sob medida](desafio-02-scanner-rm/) | Configure um exame de RM: espaco k, resolucao, aliasing, SNR e tempo de exame. |
| D3 | [Desafio 3 · Emissor para imagem profunda](desafio-03-emissor-nir/) | Projete um ponto quantico nucleo/casca para a janela optica do tecido: poco finito e tunelamento na casca. |
| D4 | [Desafio 4 · Casamento de impedância no ultrassom](desafio-04-ultrassom/) | Case a impedancia do transdutor com o tecido: matriz de transferencia, quarto de onda e fator de Gamow. |
| D5 | [Desafio 5 · Resfrie o detector de germânio](desafio-05-detector-germanio/) | Escolha temperatura, dopagem e tensao de um detector HPGe: doador raso, ionizacao e portadores intrinsecos. |
| D6 | [Desafio 6 · Que tecido é este? Raman](desafio-06-raman-tecido/) | Identifique o tecido por espectro Raman: oscilador harmonico, razao Stokes/anti-Stokes e escolha do laser. |

## Como usar

Tudo roda no navegador, sem instalação, sem dependências externas e sem enviar
dados para fora da máquina do usuário. Basta abrir o endereço acima e escolher
a aula. Cada aplicação mantém o mesmo ciclo didático: prever antes de medir,
alterar uma variável por vez, ler a conta aberta e registrar os resultados.

## Sobre este repositório

Esta pasta é **gerada**. As fontes, os testes numéricos, os guias didáticos e o
material de avaliação ficam em um repositório separado, e o conteúdo aqui é
produzido por `make publicar`. Correções devem ser feitas na origem, nunca
diretamente nestes arquivos.

O arquivo `.nojekyll` desativa o Jekyll no GitHub Pages. Sem ele a pasta
`_shared` seria ignorada por começar com sublinhado, e as aulas 3 a 6
deixariam de carregar.

## Licença

Este material está sob a licença [Creative Commons Atribuição-NãoComercial-
CompartilhaIgual 4.0 Internacional (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br).
Você pode usar, copiar e redistribuir, e também adaptar, desde que dê o crédito
ao autor e ao IB/UNESP, não faça uso comercial e distribua as versões
modificadas sob esta mesma licença, indicando o que mudou. O texto completo
está em [`LICENSE`](LICENSE).

---

Prof. Assoc. José L. Rybarczyk-Filho · Depto. de Biofísica e Farmacologia · IB/UNESP

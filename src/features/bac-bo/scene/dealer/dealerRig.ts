/**
 * Geometria do rig da crupiê (arte nova em `public/dealernova/`).
 *
 * ESPAÇO DE CENA — a arte veio em peças soltas, cada SVG com o seu
 * próprio artboard e a sua própria escala: não havia canvas comum. O
 * espaço adotado aqui é o do `Corpo-base` (o desenho mais completo, e o
 * único com cabeça, tronco e vestido juntos), e todas as demais peças
 * foram MEDIDAS e encaixadas nele — varredura de pixel dos SVGs, não
 * chute: cada âncora abaixo (ombro, cotovelo, olho) saiu do centro real
 * da peça na linha correspondente.
 *
 * Por isso as peças aparecem com `w`/`h` que não são o viewBox nativo:
 * o número já traz a ESCALA de encaixe embutida (ex.: os olhos entram a
 * 0,99 do tamanho nativo, o cabelo de trás a 1,0). Um `<image>` com x/y/w/h
 * explícitos é a forma mais barata de compor — sem transform por peça,
 * sem reflow.
 *
 * AS PROPORÇÕES SÃO AS DA MODELO de referência do rig, medidas sobre
 * ela, e duas delas são RELAÇÕES entre peças (o que dá para acertar por
 * conta, sem depender de estimar escala numa imagem pequena):
 *
 * - o DELINEADO do olho quase encosta na borda do rosto: as pontas do
 *   cílio vão de orelha a orelha (x 1398 → 1577 na arte do corpo), e é
 *   isso que fixa a escala dos olhos;
 * - a FRANJA desce até bater no cílio: a borda de baixo dela cruza a
 *   linha do topo do olho, e é isso que fixa o y dela;
 * - o cabelo de trás é mais largo que os ombros e cai até o peito;
 * - a boca fica em tamanho natural (~1/3 da largura dos olhos);
 * - os braços deixam uma faixa de pele à mostra por fora do vestido.
 *
 * Mexer numa dessas medidas isoladamente desmancha a semelhança — elas
 * foram calibradas juntas.
 *
 * ENQUADRAMENTO: `VIEWBOX` recorta da franja até um palmo abaixo da
 * cintura, na mesma proporção 1:2 do rig antigo — a crupiê nova entra
 * exatamente no mesmo lugar e no mesmo tamanho da anterior (linha dos
 * olhos a ~21% da altura, ombros a ~40%, como na arte antiga).
 */

const BASE = `${import.meta.env.BASE_URL}dealernova/`;

export interface RigPart {
  /** Caminho do SVG, relativo a `public/dealernova/`. */
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const part = (src: string, x: number, y: number, w: number, h: number): RigPart => ({
  src: `${BASE}${src}`,
  x,
  y,
  w,
  h,
});

/**
 * Recorte da cena — mesma proporção (1:2) do rig anterior, e por isso
 * nenhuma regra de CSS muda com ele.
 *
 * O topo subiu de 40 para 6 em dois tempos: primeiro quando a FRANJA
 * cresceu e virou o ponto mais alto da figura; depois para dar TETO ao
 * PULO da comemoração — o corpo sobe até 20 unidades no celebrate, e a
 * franja (repouso em y≈27) precisa continuar dentro do quadro no ápice,
 * senão telas cujo recorte encosta no topo do palco decapitavam a
 * crupiê no meio do salto. A folga de baixo comporta o deslocamento: o
 * vestido termina em y≈879 e o quadro vai até 886.
 */
export const RIG_VIEWBOX = '1269 6 440 880';

/**
 * A proporção que o CSS reserva para a crupiê (`.dealer-rig`),
 * DERIVADA do viewBox: são duas escritas do mesmo número, e a única
 * forma de elas não saírem de sincronia é uma nascer da outra.
 */
export const RIG_ASPECT = RIG_VIEWBOX.split(' ').slice(2).join(' / ');

export const PARTS = {
  /* CABELO: a peça entra em tamanho NATURAL (escala 1,0) e é a maior da
     montagem — mais larga que os ombros, descendo até a altura do peito.
     Foi assim que a modelo de referência foi desenhada, e é o que dá o
     volume que emoldura o rosto; encolhido, o cabelo virava um chanel
     curto e a cabeça parecia grande demais para o corpo. */
  cabeloTras: part('semvar/cabelo-tras.svg', 1290.9, 43, 396.85, 458.15),
  /* BRAÇOS: por FORA do vestido, com uma faixa larga de pele à mostra em
     toda a lateral — é assim na modelo. Recuados, o braço entra por
     dentro do corpo e some; a versão anterior errava por aí. */
  bracoDir: part('semvar/braco-dir.svg', 1314.7, 390, 92.18, 197.31),
  bracoEsq: part('semvar/braco-esq.svg', 1570.0, 390, 92.36, 197.55),
  corpo: part('semvar/Corpo-base.svg', 1342.37, 80.33, 290.83, 798.41),
  /* COTOVELO — o y destes dois não é escolha de gosto: é o único valor
     em que o EIXO do antebraço passa pelo CENTRO da calota do braço
     (`PIVOTS.cotovelo*`). Aí a borda do antebraço fica tangente ao
     círculo da calota, o contorno de um continua no do outro e a
     articulação some; a calota que sobra em volta vira a ponta
     arredondada do cotovelo, que é o que se vê num braço de verdade.
     Encostados topo a topo (ou baixos demais), os dois contornos se
     cruzavam em ângulo e abriam um degrau visível no cotovelo.
     Como o eixo passa pelo centro, a tangência se mantém em QUALQUER
     ângulo de flexão — o cotovelo dobra sem nunca desencaixar. */
  antebracoDir: part('semvar/anteb-dir.svg', 1313.9, 546.5, 239.96, 216.62),
  antebracoEsq: part('semvar/anteb-esq.svg', 1423.1, 546.5, 239.86, 216.17),

  /* POSES PRONTAS DE BRAÇO (docs/antebraco.md, solução B) — peças da
     pasta varantebraco, desenhadas pelo designer JÁ MONTADAS, com o
     cotovelo resolvido dentro da própria arte (até o vinco do cotovelo
     vem desenhado). Os nomes de arquivo são do designer e não seguem a
     convenção dir/esq da tela — o que manda é a geometria medida:

     - apresenta: ANTEBRAÇO+MÃO estendidos, nascendo no cotovelo DIREITO
       da tela (o braço superior de repouso continua no lugar);
     - palmas: dois BRAÇOS COMPLETOS (ombro→mão), um por lado, mãos
       erguidas à frente do peito — substituem as quatro peças de
       repouso por inteiro. */
  bracoApresenta: part('varantebraco/braco-dir-vari.svg', 1603.2, 335.3, 201.76, 253.69),
  /* As duas peças de palma são ANTEBRAÇOS (montá-las como braços
     inteiros, escondendo o braço superior, deixava o ombro sem conexão).
     O `y` das duas é o que faz a PONTA delas cair ~7 abaixo do fim da
     calota do braço superior (que termina em y≈587): assim o antebraço
     COBRE a calota inteira e o contorno dele vira o contorno do
     cotovelo. Parando acima dela — como estava —, a calota sobrava por
     baixo como uma bolha separada, com o próprio contorno cruzando o do
     antebraço: era o desencaixe visível na comemoração. */
  bracoPalmasDir: part('varantebraco/braco-esq-vari.svg', 1314.4, 384.9, 223.77, 209.13),
  bracoPalmasEsq: part('varantebraco/braco-dir-vari-2.svg', 1495.7, 390.6, 166.06, 203.42),

  sobrancelha: part('semvar/sobrancelha-padrao.svg', 1403.94, 168, 170.7, 20.95),
  sobrancelhaTriste: part('vartriste/sombrancelha-triste.svg', 1403.94, 166, 170.7, 22.7),

  /* OLHOS: a escala sai de uma RELAÇÃO, não de um chute — as pontas do
     delineado vão de orelha a orelha (1398 → 1577 na arte do corpo),
     praticamente encostando na borda do rosto. É a medida que mais muda
     a leitura da personagem: o mesmo desenho com olhos a 62% lê como
     outra pessoa. */
  olho: part('semvar/olho-padrao.svg', 1399.49, 194.35, 179.6, 61.4),
  /* A ÍRIS enche o olho quase todo: sobra branco só como duas foices
     finas nos cantos, que é o que se vê na modelo. A arte da pupila é um
     oval ALTO e o olho é largo, então ela entra esticada na horizontal —
     em escala uniforme, ou sobrava branco demais dos lados, ou a íris
     vazava por baixo da pálpebra. */
  pupilaDir: part('semvar/pupila-padrao-dir.svg', 1421.07, 197.35, 43, 55),
  pupilaEsq: part('semvar/pupila-padrao-esq.svg', 1514.29, 197.35, 43, 55),
  pupilaTristeDir: part('vartriste/pupila-triste-dir.svg', 1421.07, 218, 43, 34),
  pupilaTristeEsq: part('vartriste/pupila-triste-esq.svg', 1514.29, 218, 42.6, 33.6),

  /* BOCA em tamanho natural: um terço da largura dos olhos. Aumentada,
     ela puxa o rosto para baixo e desmancha a proporção da modelo. */
  bocaPadrao: part('semvar/boca-padrao.svg', 1464.2, 288.5, 50.26, 20.46),
  bocaFeliz: part('varfeliz/boca-feliz.svg', 1455.0, 286.5, 68.74, 41.9),
  bocaTriste: part('vartriste/boca-triste.svg', 1466.8, 294, 45.14, 15.62),

  lagrimaDir: part('vartriste/lagrima-triste.svg', 1416, 257, 14.67, 20.68),
  lagrimaEsq: part('vartriste/lagrima-triste.svg', 1548, 257, 14.67, 20.68),

  /* A FRANJA é GRANDE: na modelo é ela que domina o alto da cabeça, e o
     cabelo de trás só aparece pelos lados e por baixo. Reduzida, sobrava
     um platô liso de cabelo de trás no cocuruto e a cabeça lia como
     grande demais. O y sai de outra RELAÇÃO: a borda de baixo da franja
     desce até BATER NO CÍLIO (a linha do topo do olho, y≈194) — é o que
     fecha o rosto por cima, como na modelo. */
  cabeloFrente: part('semvar/cabelo-frente.svg', 1328.0, 27, 314.6, 224.7),
} as const;

/**
 * Pivôs das articulações, em coordenadas de cena.
 *
 * Cada pivô é o CENTRO DO CÍRCULO da calota da peça, não a ponta dela —
 * a diferença decide se a articulação funciona. As larguras medidas por
 * varredura dão o raio: a calota do ombro é um círculo de raio ~19,5 e
 * a do cotovelo, ~30. Girar em torno do centro desses círculos faz as
 * duas peças deslizarem uma DENTRO da outra e o contorno continuar
 * inteiro; girar em torno da ponta (20 abaixo, no caso do cotovelo)
 * arrancava a peça de dentro da calota e abria um degrau visível assim
 * que o braço saía do repouso.
 */
export const PIVOTS = {
  /** Quadril: giro daqui balança a figura inteira como um corpo só. */
  raiz: { x: 1489, y: 830 },
  /** Base do pescoço, dentro da faixa preta do queixo (ver CORTE_*). */
  cabeca: { x: 1489, y: 338 },
  ombroDir: { x: 1385.7, y: 409.6 },
  ombroEsq: { x: 1591.4, y: 409.6 },
  cotoveloDir: { x: 1343.8, y: 557.3 },
  cotoveloEsq: { x: 1633.1, y: 557.3 },
  olhos: { x: 1489.29, y: 225.05 },
  /** Centro da boca: é daqui que a ênfase do sorriso cresce. */
  bocaCentro: { x: 1489.33, y: 298.73 },
} as const;

/**
 * CORTE CABEÇA/CORPO — o `Corpo-base` é uma peça só (cabeça, tronco e
 * vestido no mesmo desenho), então a cabeça só se move se for RECORTADA
 * do resto. O corte não pode aparecer, e o lugar onde ele some é a
 * sombra preta e chapada sob o queixo: entre y≈337 e y≈341 a faixa
 * atravessa o pescoço inteiro em preto sólido.
 *
 * Os dois recortes se SOBREPÕEM de propósito (corpo a partir de 335,
 * cabeça até 341): com o recorte fixo no espaço da CENA — e não dentro
 * do grupo que gira —, a borda de baixo da cabeça cai sempre na mesma
 * linha, aconteça o que acontecer com a rotação. Nunca abre fresta; o
 * que muda de lugar é preto de um lado e preto do outro.
 *
 * O orçamento de movimento da cabeça sai daí: ±6° de giro e ±4 de
 * deslocamento mantêm a faixa preta cobrindo a emenda (ver
 * `CABECA_VARIANTS`, cujos valores respeitam esse limite).
 */
export const CORTE_CABECA = 341;
export const CORTE_CORPO = 335;

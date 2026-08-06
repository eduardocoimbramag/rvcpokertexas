export interface BrandCardProps {
  /** Largura do SVG (px); a altura acompanha a proporção do par. */
  size?: number;
  className?: string;
}

/**
 * Marca da Home: as DUAS CARTAS FECHADAS do Hold'em, abertas em leque —
 * um Ás de espadas por cima de um Ás de copas.
 *
 * O ícone acompanhou o jogo. Era um Ás sozinho, herdado do blackjack, e
 * um Ás sozinho não diz Hold'em: o que diz é o PAR — a mão fechada com
 * que se entra em toda mão de poker, e a única imagem que se reconhece
 * de longe como "isto é poker".
 *
 * É a única arte que NÃO herda `currentColor`: como o brasão e o
 * logotipo, é uma peça de marca com as cores oficiais gravadas. A face
 * percorre a rampa de metal da casa (marfim → champagne → âmbar →
 * bronze) e os naipes são cravados em vinho profundo. A carta de trás
 * entra girada e em tinta rebaixada, como uma carta que está de fato
 * atrás; a sombra elíptica assenta o par na mesa, que é a mesma
 * perspectiva que a peça sempre teve — ele repousa, não flutua.
 */
export function BrandCard({ size = 76, className = '' }: BrandCardProps) {
  return (
    <svg
      viewBox="0 0 34 30"
      width={size}
      height={(size * 30) / 34}
      aria-hidden="true"
      className={className}
    >
      <defs>
        {/* Rampa de metal oficial, na diagonal da luz (alto-esquerda). */}
        <linearGradient id="brand-card-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4e8" />
          <stop offset="0.38" stopColor="#fcd9a0" />
          <stop offset="0.72" stopColor="#f5b76f" />
          <stop offset="1" stopColor="#c67e38" />
        </linearGradient>
        {/* A carta de TRÁS é a mesma rampa, rebaixada: ela está na sombra
            da da frente, e é isso que dá profundidade ao par. */}
        <linearGradient id="brand-card-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8d3b8" />
          <stop offset="0.55" stopColor="#d9a86a" />
          <stop offset="1" stopColor="#a8652c" />
        </linearGradient>
        {/* Canto da carta na sombra: a "espessura" que dá corpo à peça. */}
        <linearGradient id="brand-card-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b06a30" />
          <stop offset="1" stopColor="#82441c" />
        </linearGradient>
        {/* Lustre especular: banda fria que morre antes do meio da face. */}
        <linearGradient id="brand-card-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4e8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff4e8" stopOpacity="0" />
        </linearGradient>
        <clipPath id="brand-card-clip">
          <rect x="13" y="4" width="16" height="22" rx="2.2" />
        </clipPath>
      </defs>

      {/* Sombra assentando o par na mesa (não flutua). */}
      <ellipse cx="17" cy="28.4" rx="12" ry="1.5" fill="rgba(20,4,4,0.35)" />

      {/* ---- Carta de TRÁS: o Ás de copas, girado para fora ---- */}
      <g transform="rotate(-20 19 15)">
        <rect x="5.5" y="4.6" width="15" height="21" rx="2.1" fill="url(#brand-card-edge)" />
        <rect x="5" y="4" width="15" height="21" rx="2.1" fill="url(#brand-card-back)" />
        {/* Copas em vinho: o naipe que identifica a carta de baixo. */}
        <path
          d="M12.5 18.6c-2.6-2-4.1-3.3-4.1-5a2.3 2.3 0 0 1 4.1-1.4 2.3 2.3 0 0 1 4.1 1.4c0 1.7-1.5 3-4.1 5z"
          fill="#4c0a15"
          opacity="0.9"
        />
        <rect
          x="5"
          y="4"
          width="15"
          height="21"
          rx="2.1"
          fill="none"
          stroke="#fcd9a0"
          strokeWidth="0.5"
          opacity="0.6"
        />
      </g>

      {/* ---- Carta da FRENTE: o Ás de espadas, com a inclinação da marca ---- */}
      <g transform="rotate(6 21 15)">
        {/* Espessura do baralho por baixo, deslocada para a sombra. */}
        <rect x="13.7" y="4.9" width="16" height="22" rx="2.2" fill="url(#brand-card-edge)" />

        {/* Face da carta em ouro. */}
        <rect x="13" y="4" width="16" height="22" rx="2.2" fill="url(#brand-card-face)" />

        {/* Lustre varrendo o canto da luz, contido pela própria face. */}
        <g clipPath="url(#brand-card-clip)">
          <path d="M10.4 9.8 20.2 2l3.4 1.2L12.4 13.4z" fill="url(#brand-card-sheen)" />
        </g>

        {/* Filete interno em vinho: a moldura clássica da carta de luxo. */}
        <rect
          x="14.4"
          y="5.4"
          width="13.2"
          height="19.2"
          rx="1.3"
          fill="none"
          stroke="#4c0a15"
          strokeWidth="0.35"
          opacity="0.45"
        />

        {/* Índice "A" do canto (traço, sem fonte: a marca não depende de
            tipografia carregada) e sua réplica girada no canto oposto. */}
        <g
          stroke="#4c0a15"
          strokeWidth="0.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M15.5 9.6 16.6 6.8l1.1 2.8M15.85 8.7h1.5" />
          <path d="M15.5 9.6 16.6 6.8l1.1 2.8M15.85 8.7h1.5" transform="rotate(180 21 15)" />
        </g>

        {/* Espada central em vinho profundo, o pip-mestre da marca. */}
        <path
          d="M21 10.3c-2.2 2.5-4 3.7-4 5.6a1.9 1.9 0 0 0 3.2 1.4c-.15 1.1-.55 1.9-1.25 2.55h4.1c-.7-.65-1.1-1.45-1.25-2.55a1.9 1.9 0 0 0 3.2-1.4c0-1.9-1.8-3.1-4-5.6z"
          fill="#4c0a15"
        />

        {/* Aresta em champagne: o fio de luz que faz a carta ler "metal". */}
        <rect
          x="13"
          y="4"
          width="16"
          height="22"
          rx="2.2"
          fill="none"
          stroke="#fcd9a0"
          strokeWidth="0.55"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}

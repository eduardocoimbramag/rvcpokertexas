export interface BrandCardProps {
  /** Largura do SVG (px); a altura acompanha a proporção da carta. */
  size?: number;
  className?: string;
}

/**
 * Marca da Home: Ás de espadas em ouro lapidado, herdeiro direto do
 * antigo dado isométrico da marca.
 * É a única arte que NÃO herda `currentColor` — como o brasão e o
 * logotipo, é uma peça de marca com as cores oficiais gravadas: a face
 * percorre a rampa de metal da casa (marfim → champagne → âmbar →
 * bronze) e o naipe é cravado em vinho profundo, como os pips do dado.
 * A leve rotação e o canto de espessura mantêm o mesmo "assentado em
 * perspectiva" que o dado tinha — a carta repousa na mesa, não flutua.
 */
export function BrandCard({ size = 76, className = '' }: BrandCardProps) {
  return (
    <svg
      viewBox="0 0 26 30"
      width={size}
      height={(size * 30) / 26}
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
          <rect x="5" y="2.6" width="16" height="22" rx="2.2" />
        </clipPath>
      </defs>

      {/* Sombra assentando a carta na mesa (não flutua). */}
      <ellipse cx="13" cy="27.6" rx="8.6" ry="1.5" fill="rgba(20,4,4,0.35)" />

      {/* Inclinação sutil no sentido do antigo dado: perspectiva de marca. */}
      <g transform="rotate(-8 13 13.6)">
        {/* Espessura do baralho por baixo, deslocada para a sombra. */}
        <rect x="5.7" y="3.5" width="16" height="22" rx="2.2" fill="url(#brand-card-edge)" />

        {/* Face da carta em ouro. */}
        <rect x="5" y="2.6" width="16" height="22" rx="2.2" fill="url(#brand-card-face)" />

        {/* Lustre varrendo o canto da luz, contido pela própria face. */}
        <g clipPath="url(#brand-card-clip)">
          <path d="M2.4 8.4 12.2.6l3.4 1.2L4.4 12z" fill="url(#brand-card-sheen)" />
        </g>

        {/* Filete interno em vinho: a moldura clássica da carta de luxo. */}
        <rect
          x="6.4"
          y="4"
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
        <g stroke="#4c0a15" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M7.5 8.2 8.6 5.4l1.1 2.8M7.85 7.3h1.5" />
          <path d="M7.5 8.2 8.6 5.4l1.1 2.8M7.85 7.3h1.5" transform="rotate(180 13 13.6)" />
        </g>

        {/* Espada central em vinho profundo, o pip-mestre da marca. */}
        <path
          d="M13 8.9c-2.2 2.5-4 3.7-4 5.6a1.9 1.9 0 0 0 3.2 1.4c-.15 1.1-.55 1.9-1.25 2.55h4.1c-.7-.65-1.1-1.45-1.25-2.55a1.9 1.9 0 0 0 3.2-1.4c0-1.9-1.8-3.1-4-5.6z"
          fill="#4c0a15"
        />

        {/* Aresta em champagne: o fio de luz que faz a carta ler "metal". */}
        <rect
          x="5"
          y="2.6"
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

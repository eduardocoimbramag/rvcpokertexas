export interface BrandDieProps {
  /** Lado do quadrado do SVG (px). */
  size?: number;
  className?: string;
}

/**
 * Marca da Home: dado isométrico em ouro lapidado, no lugar do antigo
 * emoji de dado.
 * É a única arte que NÃO herda `currentColor` — como o brasão e o
 * logotipo, é uma peça de marca com as cores oficiais gravadas:
 * champagne no topo (a face que pega o lustre), âmbar na face da luz e
 * terracota tostada na sombra, com pips em vinho profundo.
 */
export function BrandDie({ size = 76, className = '' }: BrandDieProps) {
  return (
    <svg
      viewBox="0 0 24 26"
      width={size}
      height={(size * 26) / 24}
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="brand-die-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4e8" />
          <stop offset="1" stopColor="#f5cf92" />
        </linearGradient>
        <linearGradient id="brand-die-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2b269" />
          <stop offset="1" stopColor="#cf8a4b" />
        </linearGradient>
        <linearGradient id="brand-die-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b06a30" />
          <stop offset="1" stopColor="#82441c" />
        </linearGradient>
      </defs>

      {/* Sombra assentando o dado (não flutua). */}
      <ellipse cx="12" cy="24.2" rx="8.2" ry="1.6" fill="rgba(20,4,4,0.35)" />

      {/* Face de cima (1). */}
      <path d="M12 1.2 21.4 6.6 12 12 2.6 6.6z" fill="url(#brand-die-top)" />
      <ellipse cx="12" cy="6.6" rx="1.7" ry="1" fill="#4c0a15" />

      {/* Face esquerda (3), na luz. */}
      <path d="M2.6 6.6 12 12v10.8L2.6 17.4z" fill="url(#brand-die-left)" />
      <ellipse cx="5.2" cy="10.6" rx="1" ry="1.35" fill="#4c0a15" transform="rotate(-14 5.2 10.6)" />
      <ellipse cx="7.3" cy="14.4" rx="1" ry="1.35" fill="#4c0a15" transform="rotate(-14 7.3 14.4)" />
      <ellipse cx="9.4" cy="18.2" rx="1" ry="1.35" fill="#4c0a15" transform="rotate(-14 9.4 18.2)" />

      {/* Face direita (5), na sombra. */}
      <path d="M21.4 6.6 12 12v10.8l9.4-5.4z" fill="url(#brand-die-right)" />
      <ellipse cx="14.6" cy="12.6" rx="1" ry="1.3" fill="#2e0810" transform="rotate(14 14.6 12.6)" />
      <ellipse cx="18.8" cy="10.2" rx="1" ry="1.3" fill="#2e0810" transform="rotate(14 18.8 10.2)" />
      <ellipse cx="16.7" cy="15.9" rx="1" ry="1.3" fill="#2e0810" transform="rotate(14 16.7 15.9)" />
      <ellipse cx="14.6" cy="19.4" rx="1" ry="1.3" fill="#2e0810" transform="rotate(14 14.6 19.4)" />
      <ellipse cx="18.8" cy="17" rx="1" ry="1.3" fill="#2e0810" transform="rotate(14 18.8 17)" />

      {/* Arestas em champagne: o fio de luz que faz o dado ler "metal". */}
      <path
        d="M12 1.2 21.4 6.6 12 12 2.6 6.6zM12 12v10.8M2.6 6.6v10.8L12 22.8l9.4-5.4V6.6"
        fill="none"
        stroke="#fcd9a0"
        strokeWidth="0.55"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

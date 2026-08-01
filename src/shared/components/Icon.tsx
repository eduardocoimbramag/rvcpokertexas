import type { ReactNode, SVGProps } from 'react';

/**
 * Ícones do Royal VIP Club — conjunto próprio, desenhado numa grade
 * única de 24×24 com traço 1.8 e cantos arredondados, no lugar dos
 * emojis (que variam por plataforma e destoam do acabamento do jogo).
 *
 * Regra de cor: `stroke`/`fill` são SEMPRE `currentColor` — o ícone
 * herda a cor do texto ao lado (texto marfim → ícone marfim, tinta
 * escura do botão dourado → ícone escuro). Nunca fixar cor aqui; quem
 * decide é o contexto tipográfico, como manda o manual.
 *
 * Tamanho: `1em` por padrão, escalando com o font-size do pai — um
 * ícone dentro de um botão `text-sm` sai menor que no título, sozinho.
 */
export type IconName =
  | 'dice'
  | 'trophy'
  | 'scroll'
  | 'help'
  | 'gear'
  | 'chip'
  | 'swords'
  | 'check'
  | 'crown'
  | 'chevron-left'
  | 'close'
  | 'plus'
  | 'send'
  | 'globe'
  | 'lock'
  | 'users'
  | 'flag'
  | 'user'
  | 'search'
  | 'warning'
  | 'speaker'
  | 'speaker-off'
  | 'music'
  | 'vibration'
  | 'scene'
  | 'timer'
  | 'wrench'
  | 'flame'
  | 'coins'
  | 'club'
  | 'bolt'
  | 'target'
  | 'moon'
  | 'gem'
  | 'medal'
  | 'eye-off'
  | 'feather';

/* Partes preenchidas (pips, pupilas) usam fill=currentColor sem traço,
   para manterem peso visual ao lado das linhas de 1.8. */
const dot = (cx: number, cy: number, r: number) => (
  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

const GLYPHS: Record<IconName, ReactNode> = {
  dice: (
    <>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.2" />
      {dot(8.3, 8.3, 1.35)}
      {dot(15.7, 8.3, 1.35)}
      {dot(12, 12, 1.35)}
      {dot(8.3, 15.7, 1.35)}
      {dot(15.7, 15.7, 1.35)}
    </>
  ),
  trophy: (
    <>
      <path d="M7 3.5h10v6.2a5 5 0 0 1-10 0z" />
      <path d="M7 5.2H4.2c.1 2.5 1.3 4 3.2 4.4" />
      <path d="M17 5.2h2.8c-.1 2.5-1.3 4-3.2 4.4" />
      <path d="M12 14.7v3" />
      <path d="M8.6 20.5c.4-1.8 1.7-2.8 3.4-2.8s3 1 3.4 2.8z" />
    </>
  ),
  scroll: (
    <>
      <path d="M6.5 3.5H18a2 2 0 0 1 2 2v11" />
      <path d="M6.5 3.5a2 2 0 0 0-2 2V7h4V5.5a2 2 0 0 0-2-2z" />
      <path d="M20 16.5v2a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2v-13" />
      <path d="M10 8.5h6M10 12h6M10 15.5h3.5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.4 9.4a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 3.7" />
      {dot(12, 16.9, 1.15)}
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M10.8 2.6h2.4l.4 2.4a7.4 7.4 0 0 1 1.9.8l2-1.4 1.7 1.7-1.4 2a7.4 7.4 0 0 1 .8 1.9l2.4.4v2.4l-2.4.4a7.4 7.4 0 0 1-.8 1.9l1.4 2-1.7 1.7-2-1.4a7.4 7.4 0 0 1-1.9.8l-.4 2.4h-2.4l-.4-2.4a7.4 7.4 0 0 1-1.9-.8l-2 1.4-1.7-1.7 1.4-2a7.4 7.4 0 0 1-.8-1.9l-2.4-.4v-2.4l2.4-.4a7.4 7.4 0 0 1 .8-1.9l-1.4-2L6.5 4.4l2 1.4a7.4 7.4 0 0 1 1.9-.8z" />
    </>
  ),
  chip: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.6" />
      <path d="M12 3.4v4M12 16.6v4M3.4 12h4M16.6 12h4M5.9 5.9l2.85 2.85M15.25 15.25l2.85 2.85M18.1 5.9l-2.85 2.85M8.75 15.25 5.9 18.1" />
    </>
  ),
  swords: (
    <>
      {/* Lâminas cruzadas com guarda e punho em cada canto inferior. */}
      <path d="M14.3 17.3 3.2 6.2V3.2h3l11.1 11.1" />
      <path d="m12.9 18.7 5.8-5.8" />
      <path d="m15.8 15.8 4 4" />
      <path d="m18.7 20.7 2-2" />
      <path d="M9.7 17.3 20.8 6.2V3.2h-3L11 10" />
      <path d="M11.1 18.7 5.3 12.9" />
      <path d="m8.2 15.8-4 4" />
      <path d="m5.3 20.7-2-2" />
    </>
  ),
  check: <path d="M4.8 12.6 10 17.8 19.2 6.6" />,
  crown: (
    <>
      <path d="M4.4 17 3.2 7.6l4.9 3.4L12 4.8l3.9 6.2 4.9-3.4L19.6 17z" />
      <path d="M5.4 20.2h13.2" />
    </>
  ),
  'chevron-left': <path d="M14.6 5.4 8 12l6.6 6.6" />,
  close: <path d="M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  send: (
    <>
      <path d="m21 3-7 20-4-9-9-4z" />
      <path d="M21 3 10 13" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.4 12h17.2" />
      <path d="M12 3.4c2.5 2.3 3.8 5.3 3.8 8.6s-1.3 6.3-3.8 8.6c-2.5-2.3-3.8-5.3-3.8-8.6s1.3-6.3 3.8-8.6z" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.8" width="14" height="9.6" rx="2.6" />
      <path d="M8.2 10.8V7.6a3.8 3.8 0 0 1 7.6 0v3.2" />
      {dot(12, 15.6, 1.3)}
    </>
  ),
  users: (
    <>
      <circle cx="9.2" cy="8.2" r="3.4" />
      <path d="M3.4 20.2c.3-3.2 2.7-5.2 5.8-5.2s5.5 2 5.8 5.2" />
      <path d="M15.6 5.1a3.4 3.4 0 0 1 0 6.3" />
      <path d="M17.4 15.4c2 .8 3.1 2.5 3.3 4.8" />
    </>
  ),
  flag: (
    <>
      <path d="M5.4 21V3.8" />
      <path d="M5.4 4.6c4.2-2 7 1.8 13.2.2v9c-6.2 1.6-9-2.2-13.2-.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.4 20.4c.4-3.6 3-5.8 6.6-5.8s6.2 2.2 6.6 5.8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m15.9 15.9 5 5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.8 2.9 19.3a1 1 0 0 0 .87 1.5h16.46a1 1 0 0 0 .87-1.5z" />
      <path d="M12 9.6v4.6" />
      {dot(12, 17.4, 1.15)}
    </>
  ),
  speaker: (
    <>
      <path d="M11.2 5.4 6.8 9H3.6v6h3.2l4.4 3.6z" />
      <path d="M14.6 9.6a3.4 3.4 0 0 1 0 4.8" />
      <path d="M17.2 7a7 7 0 0 1 0 10" />
    </>
  ),
  'speaker-off': (
    <>
      <path d="M11.2 5.4 6.8 9H3.6v6h3.2l4.4 3.6z" />
      <path d="m15.4 9.6 4.8 4.8M20.2 9.6l-4.8 4.8" />
    </>
  ),
  music: (
    <>
      <path d="M9.2 18.4V6.2l10-2.2v12.2" />
      <circle cx="6.9" cy="18.4" r="2.3" />
      <circle cx="16.9" cy="16.2" r="2.3" />
    </>
  ),
  vibration: (
    <>
      <rect x="8.6" y="4.8" width="6.8" height="14.4" rx="2" />
      <path d="M4.8 9.2c-1 1.9-1 3.7 0 5.6M19.2 9.2c1 1.9 1 3.7 0 5.6" />
      <path d="M11 16.6h2" />
    </>
  ),
  scene: (
    <>
      <rect x="3.4" y="4.8" width="17.2" height="14.4" rx="2.6" />
      <circle cx="9" cy="9.8" r="1.7" />
      <path d="m6.2 17.6 4.3-4.8 2.9 3.2 2.4-2.7 3.9 4.3" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.4" r="7.2" />
      <path d="M12 13.4V9.6" />
      <path d="M9.8 3h4.4M12 3v3.2" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.9 6a4.6 4.6 0 0 0-6.1 5.7l-5.4 5.4a2 2 0 1 0 2.9 2.9l5.4-5.4A4.6 4.6 0 0 0 17.4 8.4l-2.9 2.9-2.4-.6-.6-2.4z" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3c.6 3.2-3.6 5.4-3.6 9.4a5.6 5.6 0 0 0 11.2 0c0-2-1-3.7-2.1-5.3-.4 1.3-1.1 2.1-2.2 2.6.4-2.6-.9-5.5-3.3-6.7z" />
    </>
  ),
  coins: (
    <>
      <circle cx="9" cy="9" r="5.6" />
      <path d="M13.1 5.8a5.6 5.6 0 1 1-2.8 10.6" />
      <path d="M9 6.6v4.8M6.9 9h4.2" />
    </>
  ),
  club: (
    <>
      <path
        d="M12 3.6a3.35 3.35 0 0 1 3.1 4.6 3.35 3.35 0 1 1-1.9 6l.9 4.4a.5.5 0 0 1-.5.6h-3.2a.5.5 0 0 1-.5-.6l.9-4.4a3.35 3.35 0 1 1-1.9-6A3.35 3.35 0 0 1 12 3.6z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  bolt: <path d="M13.2 2.8 5.4 13.6h4.8L10.8 21.2l7.8-10.8h-4.8z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.8" />
      {dot(12, 12, 1.5)}
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />,
  gem: (
    <>
      <path d="M7.2 3.8h9.6L20.6 9 12 20.6 3.4 9z" />
      <path d="M3.4 9h17.2M9.6 3.8 8 9l4 11.6L16 9l-1.6-5.2" />
    </>
  ),
  feather: (
    <>
      <path d="M20.2 3.8a6.1 6.1 0 0 0-8.6 0L5 10.4V19h8.6l6.6-6.6a6.1 6.1 0 0 0 0-8.6z" />
      <path d="M15.8 8.2 3.5 20.5" />
      <path d="M17.3 14.6H9.4" />
    </>
  ),
  /* Olho cortado: "isto não está sendo visto". A amêndoa é simétrica e a
     pupila, cheia — a ~14px (o selo da carta velada) o traço da íris
     sumiria e sobraria um anel vazio. O corte atravessa a amêndoa inteira,
     de canto a canto, porque é ele que carrega o sentido do ícone. */
  'eye-off': (
    <>
      <path d="M2.6 12c2-3.6 5.3-5.9 9.4-5.9s7.4 2.3 9.4 5.9c-2 3.6-5.3 5.9-9.4 5.9S4.6 15.6 2.6 12z" />
      {dot(12, 12, 2.5)}
      <path d="M4.2 19.8 19.8 4.2" />
    </>
  ),
  /* Medalha do pódio: as duas fitas e o disco. Sem estrela nem número
     dentro — a colocação já está escrita ao lado, e no tamanho em que
     ela aparece (≈14px) qualquer detalhe a mais vira borrão. */
  medal: (
    <>
      <path d="M8.2 2.8 10.9 8.8" />
      <path d="M15.8 2.8 13.1 8.8" />
      <circle cx="12" cy="14.9" r="6.1" />
      <circle cx="12" cy="14.9" r="2.5" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Lado do ícone. O padrão (1.2em) acompanha o font-size do texto ao
      lado, um pouco acima da altura de caixa — ícone 1:1 com a letra
      parece menor do que ela por causa do respiro interno do traço. */
  size?: number | string;
}

export function Icon({ name, size = '1.2em', className = '', ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      /* shrink-0: dentro dos botões flex, o ícone nunca é comprimido
         pelo texto; o alinhamento vertical fino fica com o flexbox. */
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {GLYPHS[name]}
    </svg>
  );
}

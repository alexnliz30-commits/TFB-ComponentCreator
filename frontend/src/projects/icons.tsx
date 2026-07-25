/**
 * Iconografía de la pantalla inicial.
 *
 * Trazo de 1.5 y rejilla de 24, para que todos los iconos tengan el mismo peso
 * visual a cualquier tamaño. Van como SVG en línea y no como glifos Unicode
 * (`◻`, `▤`, `⚠`) porque estos últimos los dibuja la fuente del sistema: cambian
 * de forma, de peso y de alineación vertical entre Windows, macOS y Linux, y no
 * se pueden ajustar. Son la diferencia entre una interfaz cuidada y una que
 * parece un prototipo.
 */

type IconProps = { className?: string };

const base = 'w-4 h-4 shrink-0';

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className ?? base}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Componentes sueltos: piezas independientes. */
export const IconComponents = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Svg>
);

/** Librería: colección publicada. */
export const IconLibrary = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H8v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M8 4h4v16H8z" />
    <path d="m14.2 4.9 3.1-.8a1.5 1.5 0 0 1 1.8 1.1l3 12a1.5 1.5 0 0 1-1.1 1.8l-1.6.4" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="m4.5 12.5 5 5 10-11" /></Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 4.3a2 2 0 0 1 3.4 0l7.1 12.2A2 2 0 0 1 19.1 19.5H4.9a2 2 0 0 1-1.7-3zM12 9v4" />
    <path d="M12 16.5h.01" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Svg>
);

export const IconCube = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z" />
    <path d="M4 7.6 12 12l8-4.4M12 12v8.8" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9z" />
  </Svg>
);

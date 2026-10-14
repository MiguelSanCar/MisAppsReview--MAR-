// Logotipo «MAR»: letras de bloque propias (cuadrícula 40×50 por letra), en SVG para que herede el color del texto.
export function Logo({ height = 20, className }: { height?: number; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 136 50"
      height={height}
      width={(height * 136) / 50}
      fill="currentColor"
      role="img"
      aria-label="MAR"
    >
      <path d="M0 0H40V50H27V17L20 27L13 17V50H0Z" />
      <path fillRule="evenodd" transform="translate(48 0)" d="M0 50V12L12 0H28L40 12V50H27V35H13V50ZM13 14V24H27V14Z" />
      <path fillRule="evenodd" transform="translate(96 0)" d="M0 0H28L40 10V25L33 32L40 50H26L20 35H13V50H0ZM13 12V24H27V12Z" />
    </svg>
  );
}

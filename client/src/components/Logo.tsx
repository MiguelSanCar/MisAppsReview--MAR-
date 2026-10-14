// Logotipo «MAR»: trazados de los glifos M, A y R de la fuente Lock Block (Sronstudio, demo de uso personal;
// ver docs/THIRD_PARTY_LICENSES.md), convertidos a SVG. Es un trazado, no texto: no necesita la fuente y hereda el color.
const PATH =
  'M3.86-47.61L6.45-44.34L6.45-0.05L66.55-0.05L66.55-75.34L61.38-75.34L36.52-53.61C19.92-68.12 28.22-60.84 11.62-75.34L3.86-75.34ZM69.78-0.05L124.95-0.05L104.88-75.34L87.99-75.34L80.57-47.61L81.59-44.34C73.73-14.79 77.64-29.59 69.78-0.05ZM126.12-47.61L128.71-44.34L128.71-0.05L175-0.05L161.87-32.32C169.58-35.89 175-43.75 175-52.83C175-65.19 164.94-75.34 152.64-75.34L126.12-75.34Z';

export function Logo({ height = 20, className }: { height?: number; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="3.86 -75.34 171.14 75.29"
      height={height}
      width={height * 2.2731}
      fill="currentColor"
      role="img"
      aria-label="MAR"
    >
      <path d={PATH} />
    </svg>
  );
}

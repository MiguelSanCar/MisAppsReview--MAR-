import { Emoji } from './Emoji';
import { useTheme } from '../theme/ThemeContext';

/** Interruptor oscuro/claro: luna y sol de contorno blanco; la bolita marca el tema activo. */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const light = theme === 'light';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label="Tema claro"
      title={light ? 'Cambiar al tema oscuro' : 'Cambiar al tema claro'}
      className={`theme-switch ${className}`}
      onClick={toggle}
    >
      <span className="ts-track">
        <Emoji name="luna" size={15} className="ts-ico" />
        <Emoji name="sol" size={15} className="ts-ico" />
        <span className="ts-knob" />
      </span>
    </button>
  );
}

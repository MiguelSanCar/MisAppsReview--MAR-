// «Emojis» de línea: contorno blanco (el color del texto) y transparentes por dentro, con Lucide
// (https://lucide.dev, licencia ISC; ver docs/THIRD_PARTY_LICENSES.md). Se pintan como SVG con trazo
// `currentColor` y sin relleno, así que se ven igual en cualquier sistema y toman el color de su botón o texto.
import {
  CalendarDays, Check, ClipboardList, Eye, Folders, Moon, NotebookPen, Repeat, Search, Sun, Users, type LucideIcon,
} from 'lucide-react';

const ICONS = {
  lista: ClipboardList, // 📋 (sin lápiz)
  ojo: Eye, //             👁
  tick: Check, //          ✔
  notas: NotebookPen, //   📝
  carpetas: Folders, //    🗂
  amigos: Users, //        👥
  repetir: Repeat, //      🔁
  calendario: CalendarDays, // 📅
  lupa: Search, //         🔍
  luna: Moon, //           🌙
  sol: Sun, //             ☀
} satisfies Record<string, LucideIcon>;

export type EmojiName = keyof typeof ICONS;

/** Icono decorativo (el texto del botón o del enlace ya describe la acción). */
export function Emoji({ name, size = 18, className = '', strokeWidth = 2 }: { name: EmojiName; size?: number; className?: string; strokeWidth?: number }) {
  const Icon = ICONS[name];
  return <Icon className={`emoji ${className}`} width={size} height={size} strokeWidth={strokeWidth} fill="none" aria-hidden="true" focusable="false" />;
}

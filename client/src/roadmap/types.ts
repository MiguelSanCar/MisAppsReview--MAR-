export type Status = 'pendiente' | 'en_progreso' | 'hecho';
export type Category = 'Backend' | 'Frontend' | 'Datos' | 'Infra';

export interface Task {
  id: string;
  title: string;
  status: Status;
  note?: string;
  /** Fecha (AAAA-MM-DD): la real de finalización si está hecha, o la estimada. null = sin fecha posible. */
  eta?: string | null;
  /** Motivo y esfuerzo estimado cuando no hay fecha (depende de algo externo). */
  etaNote?: string;
}
export interface Feature { id: string; title: string; category: Category; tasks: Task[] }
export interface Phase { id: string; name: string; summary: string; release?: string; features: Feature[] }
export interface Roadmap {
  version: number;
  updatedAt: string;
  title: string;
  subtitle: string;
  release?: string;
  phases: Phase[];
}

export const STATUS_LABEL: Record<Status, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  hecho: 'Hecho',
};

export function countTasks(tasks: Task[]) {
  const done = tasks.filter((t) => t.status === 'hecho').length;
  const doing = tasks.filter((t) => t.status === 'en_progreso').length;
  return { done, doing, total: tasks.length };
}

export function featureStatus(f: Feature): Status {
  const { done, doing, total } = countTasks(f.tasks);
  if (total > 0 && done === total) return 'hecho';
  if (done > 0 || doing > 0) return 'en_progreso';
  return 'pendiente';
}

export const allTasks = (features: Feature[]) => features.flatMap((f) => f.tasks);

/** Fecha de entrega de una tarea, de una tarjeta o de una columna. */
export interface Eta {
  kind: 'done' | 'date' | 'none';
  /** AAAA-MM-DD */
  date?: string;
  note?: string;
}

const maxDate = (dates: (string | null | undefined)[]) => dates.filter((d): d is string => !!d).sort().pop();

export function taskEta(t: Task): Eta {
  if (t.status === 'hecho') return { kind: 'done', date: t.eta ?? undefined };
  if (t.eta) return { kind: 'date', date: t.eta, note: t.etaNote };
  return { kind: 'none', note: t.etaNote };
}

/**
 * Fecha de un conjunto de tareas (tarjeta o columna): si está todo hecho, el día en que se terminó la última;
 * si no, la fecha estimada de la última pendiente; si alguna pendiente no tiene fecha, «sin fecha».
 */
export function groupEta(tasks: Task[]): Eta {
  const pending = tasks.filter((t) => t.status !== 'hecho');
  if (!pending.length) return { kind: 'done', date: maxDate(tasks.map((t) => t.eta)) };
  const undated = pending.find((t) => !t.eta);
  if (undated) return { kind: 'none', note: undated.etaNote };
  return { kind: 'date', date: maxDate(pending.map((t) => t.eta)) };
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function shortDate(iso: string, today: Date) {
  const d = new Date(`${iso}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) };
  return d.toLocaleDateString('es-ES', opts).replace('.', '');
}

/** Texto y estilo para mostrar una fecha de entrega. */
export function describeEta(e: Eta, today = new Date()): { text: string; tone: 'done' | 'today' | 'soon' | 'late' | 'none' } {
  const now = isoDay(today);
  if (e.kind === 'done') return { text: e.date ? `Hecho el ${shortDate(e.date, today)}` : 'Hecho', tone: 'done' };
  if (e.kind === 'none') return { text: 'Sin fecha', tone: 'none' };
  if (e.date! < now) return { text: `Retrasado (previsto ${shortDate(e.date!, today)})`, tone: 'late' };
  if (e.date === now) return { text: 'Listo hoy', tone: 'today' };
  return { text: `Listo ~ ${shortDate(e.date!, today)}`, tone: 'soon' };
}

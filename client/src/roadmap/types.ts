export type Status = 'pendiente' | 'en_progreso' | 'hecho';
export type Category = 'Backend' | 'Frontend' | 'Datos' | 'Infra';

export interface Task { id: string; title: string; status: Status; note?: string }
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

export type DurationUnit = 'horas' | 'días' | 'semanas' | 'meses' | 'años';

export interface FormattedDuration {
  value: number;
  unit: DurationUnit;
  text: string;
}

const SINGULAR: Record<DurationUnit, string> = {
  horas: 'hora',
  días: 'día',
  semanas: 'semana',
  meses: 'mes',
  años: 'año',
};

const DAYS_PER_MONTH = 30.4375;
const DAYS_PER_YEAR = 365.25;

/**
 * Formato escalonado del tiempo total:
 * horas hasta 24 h; después días hasta 7; semanas hasta 4; meses hasta 12; después años.
 * Un decimal como máximo y coma decimal (estilo español).
 */
export function formatDuration(totalMinutes: number): FormattedDuration {
  const minutes = Number.isFinite(totalMinutes) ? Math.max(0, totalMinutes) : 0;
  const hours = minutes / 60;

  let value: number;
  let unit: DurationUnit;

  if (hours < 24) {
    value = hours;
    unit = 'horas';
  } else {
    const days = hours / 24;
    if (days < 7) {
      value = days;
      unit = 'días';
    } else if (days / 7 < 4) {
      value = days / 7;
      unit = 'semanas';
    } else if (days / DAYS_PER_MONTH < 12) {
      // A partir de 4 semanas se muestra en meses; nunca menos de 1 mes.
      value = Math.max(1, days / DAYS_PER_MONTH);
      unit = 'meses';
    } else {
      value = days / DAYS_PER_YEAR;
      unit = 'años';
    }
  }

  const rounded = Math.round(value * 10) / 10;
  const label = rounded === 1 ? SINGULAR[unit] : unit;
  const num = String(rounded).replace('.', ',');
  return { value: rounded, unit, text: `${num} ${label}` };
}

/**
 * Búsqueda al escribir (sin pulsar Enter). Si resulta demasiado lenta, poner `LIVE_SEARCH = false`
 * y se vuelve al comportamiento anterior: la búsqueda solo se lanza con Enter o con el botón.
 * Las sugerencias mientras se escribe no dependen de este interruptor.
 */
export const LIVE_SEARCH = true;

/** Espera tras la última letra antes de lanzar la búsqueda. */
export const LIVE_DEBOUNCE_MS = 300;

/** Espera tras la última letra antes de pedir sugerencias. */
export const SUGGEST_DEBOUNCE_MS = 200;

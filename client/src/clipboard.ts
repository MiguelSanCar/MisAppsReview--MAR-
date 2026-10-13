/**
 * Copia texto al portapapeles. `navigator.clipboard` solo existe en contextos seguros (https o localhost),
 * y no en `http://IP-de-la-red`; en ese caso se usa la vía antigua y, como último recurso, un cuadro con el texto.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* se prueba la alternativa */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return true;
  } catch { /* último recurso */ }

  window.prompt('Copia este enlace (Ctrl + C):', text);
  return false;
}

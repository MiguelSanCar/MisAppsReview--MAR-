/* Aplica el tema guardado antes de que se pinte la página (evita el parpadeo). Lo mantiene client/src/theme. */
(function () {
  try {
    var t = localStorage.getItem('mar-theme');
    if (t !== 'light' && t !== 'dark') return;
    document.documentElement.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f3f5fa' : '#0b0f1a');
  } catch (e) { /* sin almacenamiento: tema por defecto (oscuro) */ }
})();

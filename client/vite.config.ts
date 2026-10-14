import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// La versión (0.x según el roadmap) se lee del package.json de la raíz.
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Sustituye __BUILD__ en dist/sw.js por un identificador de la compilación: cada despliegue cambia el fichero
// y los navegadores detectan la versión nueva del service worker.
function stampServiceWorker(): Plugin {
  return {
    name: 'mar-stamp-sw',
    apply: 'build',
    closeBundle() {
      const file = fileURLToPath(new URL('./dist/sw.js', import.meta.url));
      const id = `${version}-${Date.now().toString(36)}`;
      writeFileSync(file, readFileSync(file, 'utf8').split('__BUILD__').join(id));
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});

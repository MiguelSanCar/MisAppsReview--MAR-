// Compartir la app que YA está corriendo con `npm run dev` (misma base de datos, mismo servidor):
// compila el cliente (el servidor de la API, puerto 3001, sirve client/dist) y abre un túnel HTTPS
// temporal de cloudflared hacia ese puerto para probar desde otras redes.
//   Terminal 1: npm run dev        Terminal 2: npm run share
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const PORT = process.env.SHARE_PORT || '3001';
const envFile = path.join(root, '.env');
const cloudflared = path.join(root, 'tools', 'cloudflared', 'cloudflared.exe');
const fail = (msg) => { console.error(`\n\x1b[31m✖ ${msg}\x1b[0m\n`); process.exit(1); };

// 1. JWT_SECRET propio en .env (el de por defecto es público: no se puede exponer así)
let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
let generated = false;
if (!/^JWT_SECRET=.+/m.test(env)) {
  env += `${env && !env.endsWith('\n') ? '\n' : ''}JWT_SECRET=${crypto.randomBytes(32).toString('hex')}\n`;
  fs.writeFileSync(envFile, env);
  generated = true;
}

// 2. El servidor de desarrollo debe estar arrancado y usando ese secreto
function health() {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 3000 }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    }).on('error', () => resolve(null)).on('timeout', function () { this.destroy(); });
  });
}

(async () => {
  const h = await health();
  if (!h) fail(`No hay servidor en el puerto ${PORT}. Arranca primero "npm run dev" en otra terminal.`);
  if (h.devSecret || generated) {
    fail('El servidor está usando el secreto de sesión por defecto (público). Reinícialo con "npm run dev" para que lea JWT_SECRET de .env y vuelve a lanzar "npm run share".');
  }

  // 3. Compilar el cliente: es lo que sirve el puerto 3001
  console.log('Compilando el cliente…');
  const build = spawnSync('npm', ['run', 'build', '-w', 'client'], { cwd: root, shell: true, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status || 1);

  // 4. Direcciones
  console.log('\n\x1b[32m  MAR compartido\x1b[0m  (misma base de datos que "npm run dev")');
  console.log(`  Este equipo:  http://localhost:${PORT}/`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || [])
      if (i.family === 'IPv4' && !i.internal) console.log(`  Misma red:    http://${i.address}:${PORT}/   (si Windows pregunta por el firewall, permite redes privadas)`);

  if (!fs.existsSync(cloudflared)) {
    console.log('\n(Sin túnel: para otras redes descarga cloudflared, ver README → "Probar desde otras máquinas")');
    return;
  }
  const tunnel = spawn(cloudflared, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let shown = false;
  const scan = (d) => {
    const m = !shown && /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d));
    if (m) {
      shown = true;
      console.log(`\n\x1b[32m  Otras redes (túnel temporal):\x1b[0m ${m[0]}/\n  La URL cambia cada vez. Ctrl + C cierra el túnel (el servidor de desarrollo sigue).\n`);
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);
  const stop = () => {
    try { spawn('taskkill', ['/pid', String(tunnel.pid), '/t', '/f'], { shell: true }); } catch (_) {}
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  tunnel.on('exit', stop);
})();

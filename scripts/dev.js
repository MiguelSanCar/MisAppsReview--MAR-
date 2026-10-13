// Levanta servidor (3001) y cliente (5173) a la vez e imprime las URLs.
const { spawn } = require('child_process');
const caEnv = require('./ca')();

const procs = [
  { name: 'server', color: '\x1b[36m', args: ['run', 'dev', '-w', 'server'] },
  { name: 'client', color: '\x1b[35m', args: ['run', 'dev', '-w', 'client'] },
].map(({ name, color, args }) => {
  const p = spawn('npm', args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...caEnv } });
  const out = (d) =>
    String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`${color}[${name}]\x1b[0m ${l}`));
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', (code) => {
    console.log(`[${name}] terminó con código ${code}`);
    stopAll();
  });
  return p;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  procs.forEach((p) => {
    try {
      // En Windows hay que matar el árbol de procesos
      spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { shell: true });
    } catch (_) {}
  });
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

setTimeout(() => {
  console.log('\n\x1b[32m  MAR en local\x1b[0m');
  console.log('  App:      http://localhost:5173/');
  console.log('  Roadmap:  http://localhost:5173/roadmap');
  console.log('  API:      http://localhost:3001/api/health\n');
}, 2500);

// Genera las capturas de docs/img (las del README) con el servidor simulado en modo demo.
//
//   MOCK_DEMO=1 MOCK_PORT=3102 npm run dev:mock -w server     (tras `npm run build`)
//   npm install --no-save puppeteer-core@21                    (no es dependencia del proyecto)
//   BROWSER_PATH="ruta/a/chrome-o-edge" node scripts/capturas.js [http://localhost:3102]
//
// Móvil: 390×844 a 2×; escritorio: 1280×800 a 1×. Todo con datos ficticios y carátulas generadas.
const path = require('path');
const fs = require('fs');

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { console.error('Falta puppeteer-core: npm install --no-save puppeteer-core@21'); process.exit(1); }

const BASE = process.argv[2] || 'http://localhost:3102';
const BROWSER = process.env.BROWSER_PATH;
if (!BROWSER) { console.error('Indica el navegador con BROWSER_PATH (Chrome o Edge).'); process.exit(1); }
const out = path.resolve(__dirname, '../docs/img');
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const mobile = () => page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const desktop = () => page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const theme = (t) => page.evaluate((t) => { localStorage.setItem('mar-theme', t); document.documentElement.setAttribute('data-theme', t); }, t);
  const shot = async (name) => { await sleep(900); await page.screenshot({ path: path.join(out, name + '.png') }); console.log('captura', name); };

  await mobile();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  await page.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'demo', password: 'Prueba-12345' }) }));
  const sev = await page.evaluate(async () => (await (await fetch('/api/library?q=Severance')).json()).items[0].id);

  await page.goto(BASE + '/home', { waitUntil: 'networkidle0' }); await theme('dark'); await shot('inicio-movil');
  await page.goto(BASE + '/list', { waitUntil: 'networkidle0' }); await theme('dark'); await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((t) => t.textContent.includes('Viendo')).click());
  await shot('mi-lista-movil');
  await page.goto(`${BASE}/content/${sev}`, { waitUntil: 'networkidle0' }); await theme('dark'); await sleep(500);
  await page.evaluate(() => window.scrollTo(0, 560)); await shot('ficha-temporadas-movil');
  await page.goto(BASE + '/perfil/lucia/comparar', { waitUntil: 'networkidle0' }); await theme('dark'); await sleep(600);
  await page.evaluate(() => window.scrollTo(0, 90)); await shot('comparar-movil');
  await page.goto(BASE + '/profile', { waitUntil: 'networkidle0' }); await theme('light'); await sleep(500);
  await shot('perfil-movil-claro');

  await desktop();
  await page.goto(BASE + '/home', { waitUntil: 'networkidle0' }); await theme('dark'); await shot('inicio-escritorio');
  await page.goto(BASE + '/search?type=serie&minRating=8&sort=rating', { waitUntil: 'networkidle0' }); await theme('light'); await sleep(700); await shot('busqueda-escritorio-claro');
  await page.goto(BASE + '/roadmap', { waitUntil: 'networkidle0' }); await theme('dark'); await sleep(800); await shot('roadmap-escritorio');

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

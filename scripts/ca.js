// Redes corporativas que inspeccionan HTTPS: Node no usa el almacén de Windows y rechaza el certificado de la empresa.
// Si existe certs/corporate-ca.pem (o EXTRA_CA_CERTS en .env) se pasa a Node con NODE_EXTRA_CA_CERTS.
// Se AÑADE confianza en esa CA; no se desactiva ninguna verificación.
const fs = require('fs');
const path = require('path');

module.exports = function caEnv() {
  const root = path.resolve(__dirname, '..');
  let file = process.env.NODE_EXTRA_CA_CERTS || process.env.EXTRA_CA_CERTS;
  try {
    const m = /^EXTRA_CA_CERTS=(.+)$/m.exec(fs.readFileSync(path.join(root, '.env'), 'utf8'));
    if (!file && m) file = m[1].trim();
  } catch (_) {}
  if (!file) file = path.join(root, 'certs', 'corporate-ca.pem');
  file = path.resolve(root, file);
  return fs.existsSync(file) ? { NODE_EXTRA_CA_CERTS: file } : {};
};

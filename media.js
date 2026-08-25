const axios = require('axios');
const crypto = require('crypto');

const MEDIA_INFO = {
  image:    'WhatsApp Image Keys',
  video:    'WhatsApp Video Keys',
  audio:    'WhatsApp Audio Keys',
  ptt:      'WhatsApp Audio Keys',
  document: 'WhatsApp Document Keys',
  sticker:  'WhatsApp Image Keys',
};

// Descarga la media directo del CDN de WhatsApp y la desencripta en Node,
// sin usar el navegador (bypass del downloadMedia roto de la librería).
async function descargarMediaManual(msg) {
  const d = msg._data || {};
  const mediaKeyB64 = d.mediaKey;
  const directPath  = d.directPath;
  const url = d.deprecatedMms3Url || (directPath ? `https://mmg.whatsapp.net${directPath}` : null);
  const tipo = d.type;
  const mimetype = d.mimetype || '';

  if (!mediaKeyB64 || !url) throw new Error('El mensaje no trae mediaKey o URL de media');

  const info = MEDIA_INFO[tipo]
    || (mimetype.startsWith('image/') ? MEDIA_INFO.image : MEDIA_INFO.document);

  // Expandir la mediaKey con HKDF-SHA256 → iv (16) + cipherKey (32) + resto
  const mediaKey = Buffer.from(mediaKeyB64, 'base64');
  const expanded = Buffer.from(
    crypto.hkdfSync('sha256', mediaKey, Buffer.alloc(32), Buffer.from(info), 112)
  );
  const iv = expanded.subarray(0, 16);
  const cipherKey = expanded.subarray(16, 48);

  // Bajar el blob encriptado del CDN
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  const enc = Buffer.from(resp.data);
  const cuerpo = enc.subarray(0, enc.length - 10); // últimos 10 bytes = MAC

  // Desencriptar AES-256-CBC
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  const dec = Buffer.concat([decipher.update(cuerpo), decipher.final()]);

  return { data: dec.toString('base64'), mimetype };
}

module.exports = { descargarMediaManual };

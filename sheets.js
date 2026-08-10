const axios = require('axios');

/**
 * Agrega una fila de comprobante en Google Sheets
 * vía Apps Script publicado como Web App
 * @param {object} fila - Datos del comprobante
 */
async function appendSheets(fila) {
  try {
    const resp = await axios.post(
      process.env.GOOGLE_APPS_SCRIPT_URL,
      fila,
      { headers: { 'Content-Type': 'application/json' } }
    );
    return resp.data;
  } catch (err) {
    console.error('[ERROR SHEETS]', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { appendSheets };

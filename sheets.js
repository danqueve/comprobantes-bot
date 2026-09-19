const axios = require('axios');

async function appendSheets(fila, intento = 1) {
  try {
    const resp = await axios.post(
      process.env.GOOGLE_APPS_SCRIPT_URL,
      fila,
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    return resp.data;
  } catch (err) {
    if (intento < 3) {
      console.log(`[SHEETS] Intento ${intento} falló (${err.response ? err.response.status : err.message}), reintentando en 3s...`);
      await new Promise(r => setTimeout(r, 3000));
      return appendSheets(fila, intento + 1);
    }
    throw err;
  }
}

module.exports = { appendSheets };

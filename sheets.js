const axios = require('axios');

async function appendSheets(fila) {
  const resp = await axios.post(
    process.env.GOOGLE_APPS_SCRIPT_URL,
    fila,
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  return resp.data;
}

module.exports = { appendSheets };

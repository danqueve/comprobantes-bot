const axios = require('axios');

const SYSTEM_PROMPT = `Eres un extractor de datos de comprobantes de pago argentinos.
Analizás imágenes o PDFs y devolvés SOLO un JSON con los datos.

Reconocés comprobantes de: Mercado Pago, Ualá, Naranja X, Brubank, MODO, Galicia, Macro, Santander, BBVA, Nación, y cualquier medio de pago electrónico argentino.

REGLAS:
1. Responder ÚNICAMENTE JSON válido, sin markdown ni explicaciones.
2. Si NO es un comprobante de pago: {"es_comprobante": false}
3. Campo ilegible → null. Monto como número puro (45000.50). Fecha DD/MM/YYYY. Hora HH:MM.

ESQUEMA:
{"es_comprobante": true, "fecha": "DD/MM/YYYY", "hora": "HH:MM", "monto": 0.00, "banco_billetera": "", "nro_operacion": "", "titular_origen": "", "cuit_cbu_origen": "", "titular_destino": "", "tipo": "transferencia|pago|otro"}`;

async function procesarComprobante(base64, tipo, mimetype) {
  try {
    const content = tipo === 'pdf'
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
         { type: 'text', text: 'Extraé los datos de este comprobante.' }]
      : [{ type: 'image', source: { type: 'base64', media_type: mimetype || 'image/jpeg', data: base64 } },
         { type: 'text', text: 'Extraé los datos de este comprobante.' }];

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }]
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 60000
      }
    );

    const texto = response.data.content[0]?.text || '';
    const datos = JSON.parse(texto.replace(/```json|```/g, '').trim());

    const uso = response.data.usage;
    console.log(`[CLAUDE] Tokens in:${uso.input_tokens} out:${uso.output_tokens} cache:${uso.cache_read_input_tokens || 0}`);

    return datos;
  } catch (err) {
    console.error('[ERROR CLAUDE]', err.response?.data ? JSON.stringify(err.response.data) : err.message);
    return null;
  }
}

module.exports = { procesarComprobante };

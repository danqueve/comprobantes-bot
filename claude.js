const axios = require('axios');

// Prompt del sistema — se cachea en Claude API (ahorra tokens)
const SYSTEM_PROMPT = `Eres un extractor de datos de comprobantes de pago argentinos.
Tu única tarea es analizar imágenes o PDFs de comprobantes y devolver un JSON con los datos extraídos.

Reconocés comprobantes de: Mercado Pago, Ualá, Naranja X, Brubank, MODO, Banco Galicia, Banco Macro, Banco Santander, BBVA, HSBC, Banco Nación, Banco Provincia, Banco Ciudad, Lemon Cash, Prex, transferencias bancarias CBU/CVU, y cualquier otro medio de pago electrónico argentino.

REGLAS ESTRICTAS:
1. Responder ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin explicaciones.
2. Si la imagen NO es un comprobante de pago, devolver: {"es_comprobante": false}
3. Si no podés leer claramente un campo, usar null en ese campo.
4. El monto siempre como número (sin símbolos ni puntos de miles). Ejemplo: 45000.50
5. La fecha en formato DD/MM/YYYY si es posible.
6. La hora en formato HH:MM.

ESQUEMA JSON A DEVOLVER:
{
  "es_comprobante": true,
  "fecha": "DD/MM/YYYY",
  "hora": "HH:MM",
  "monto": 0.00,
  "banco_billetera": "nombre del banco o billetera",
  "nro_operacion": "número de operación o referencia",
  "titular_origen": "nombre del que envía",
  "cuit_cbu_origen": "CBU, CVU o alias si aparece",
  "titular_destino": "nombre del destinatario si aparece",
  "tipo": "transferencia|pago|cobro|otro"
}`;

/**
 * Procesa un comprobante (imagen o PDF) con Claude API
 * @param {string} base64 - Contenido en base64 (sin el prefijo data:...)
 * @param {string} tipo - 'image' o 'pdf'
 * @returns {object|null} Datos extraídos o null si falla
 */
async function procesarComprobante(base64, tipo) {
  try {
    // Determinar el media_type correcto
    const mediaType = tipo === 'pdf' ? 'application/pdf' : 'image/jpeg';

    const content = tipo === 'pdf'
      ? [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          },
          { type: 'text', text: 'Extraé los datos de este comprobante de pago.' }
        ]
      : [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
          },
          { type: 'text', text: 'Extraé los datos de este comprobante de pago.' }
        ];

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' } // Cachear el system prompt
          }
        ],
        messages: [{ role: 'user', content }]
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'content-type': 'application/json'
        }
      }
    );

    const texto = response.data.content[0]?.text || '';

    // Limpiar posibles markdown fences y parsear
    const limpio = texto.replace(/```json|```/g, '').trim();
    const datos = JSON.parse(limpio);

    // Log de uso de tokens (para monitorear costos)
    const uso = response.data.usage;
    console.log(`[CLAUDE] Tokens — input: ${uso.input_tokens} | output: ${uso.output_tokens} | cache: ${uso.cache_read_input_tokens || 0}`);

    return datos;

  } catch (err) {
    if (err.response?.data) {
      console.error('[ERROR CLAUDE]', JSON.stringify(err.response.data));
    } else {
      console.error('[ERROR CLAUDE]', err.message);
    }
    return null;
  }
}

module.exports = { procesarComprobante };

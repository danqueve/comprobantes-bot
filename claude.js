const axios = require('axios');

const SYSTEM_PROMPT = `Eres un extractor de datos de comprobantes de pago argentinos.
Analizás imágenes o PDFs y devolvés SOLO un JSON con los datos.

Reconocés comprobantes de: Mercado Pago, Ualá, Naranja X, Brubank, MODO, Galicia, Macro, Santander, BBVA, Nación, y cualquier medio de pago electrónico argentino.

REGLAS:
1. Responder ÚNICAMENTE JSON válido, sin markdown ni explicaciones.
2. Si NO es un comprobante de pago: {"es_comprobante": false, "que_es": "descripción de 3 a 8 palabras de lo que se ve"}
3. Campo ilegible → null. Monto como número puro (45000.50). Fecha DD/MM/YYYY. Hora HH:MM.
4. Revisá si hay señales de edición digital, buscando INCONSISTENCIAS DENTRO DE LA MISMA IMAGEN (nunca compares contra otros bancos o diseños que no conocés):
   - Un número o texto con tipografía, tamaño o alineación distinta al resto de campos similares
   - Nitidez o pixelado diferente SOLO alrededor de un campo puntual, mientras el resto está uniforme
   - Bordes rectos o sombras que sugieren un recorte pegado sobre el fondo original
   - Un tono de fondo levemente distinto en un sector puntual
   NO marques sospechoso solo por ser un diseño que no reconocés, ni por la compresión pareja de toda la imagen (normal en WhatsApp). Marcá "revision_manual": true SOLO ante una inconsistencia clara y localizada. Ante la duda, no marques.

CAMPOS DE QUIÉN PAGÓ Y QUIÉN COBRA (importante, no los confundas):
- "titular_origen": nombre de quien ENVIÓ el dinero (el ordenante). Aparece como "Origen", "De", "Cuenta origen", "Titular" dentro del bloque de origen, o el primer bloque de "Origen y destino".
- "cuit_cbu_origen": el CUIT/CUIL de 11 dígitos de quien envió, solo dígitos (ej: 27282236333). Si el comprobante no muestra el CUIT/CUIL del origen, poné el CBU/CVU o alias del origen. Si no muestra NADA del origen → null.
- "titular_destino": nombre de quien RECIBE.
- Quien recibe casi siempre es "Imperio Comercial SAS" (CUIT 30-71907246-8, Banco Macro, CBU 2850143330094248924171). Ese nombre, ese CUIT y ese CBU NUNCA van en los campos de origen.
- REGLA CLAVE: como quien cobra es siempre Imperio Comercial, si el comprobante muestra UNA sola persona o titular (con su nombre y CUIT/CUIL) y no es Imperio Comercial, esa persona es el ORIGEN, aunque la etiqueta diga solo "Titular" o no haya bloques de origen y destino. Ejemplo: una pantalla "Detalle del movimiento" con "+ 8.000,00", "Titular: Maria Laura Quintero" y "CUIT/CUIL: 27-30498142-9" → titular_origen "Maria Laura Quintero", cuit_cbu_origen "27304981429".
- Algunos comprobantes muestran SOLO al destinatario y nada de quien envió (por ejemplo BNA+ y PREX). En ese caso "titular_origen" y "cuit_cbu_origen" van null. No copies el destinatario al origen. Es preferible null a un dato inventado o equivocado.

DÓNDE ESTÁ EL NÚMERO DE OPERACIÓN ("nro_operacion"), según el banco:
- Mercado Pago: "N.º de operación de Mercado Pago" (no el "Código de identificación").
- BNA+: "Número de transacción".
- PREX: "COELSA ID".
- Naranja X: "Código de transacción".
- Otros bancos: el número, código o ID de la operación o transacción. Si no hay ninguno, null.

ESQUEMA:
{"es_comprobante": true, "fecha": "DD/MM/YYYY", "hora": "HH:MM", "monto": 0.00, "banco_billetera": "", "nro_operacion": "", "titular_origen": "", "cuit_cbu_origen": "", "titular_destino": "", "tipo": "transferencia|pago|otro", "revision_manual": false, "motivo_revision": null}`;

// Datos de Imperio Comercial: es quien COBRA, nunca quien pagó
const CUIT_PROPIO = '30719072468';
const CBU_PROPIO = '2850143330094248924171';

/**
 * Red de seguridad: aunque la lectura se equivoque, el destinatario (Imperio Comercial)
 * no puede quedar como origen del pago.
 */
function limpiarOrigen(datos) {
  if (!datos || typeof datos !== 'object') return datos;

  if (datos.cuit_cbu_origen) {
    let t = String(datos.cuit_cbu_origen);
    t = t.replace(/30-?71907246-?8/g, ' ').replace(new RegExp(CBU_PROPIO, 'g'), ' ');
    t = t.replace(/\s+/g, ' ').replace(/^[\s,;/|-]+|[\s,;/|-]+$/g, '');
    datos.cuit_cbu_origen = /\d/.test(t) || /[a-z]/i.test(t.replace(/\b(cbu|cvu|cuit|cuil|alias)\b/gi, '')) ? t : null;
  }

  const normal = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const origen = normal(datos.titular_origen);
  if (origen && (/imperio comercial/.test(origen) || origen === normal(datos.titular_destino))) {
    datos.titular_origen = null;
  }
  return datos;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Las caídas pasajeras del servicio (503, 529 sobrecargado, 429 límite, cortes de red) no deben
 * hacer perder el comprobante: se reintenta hasta 3 veces esperando un poco más cada vez.
 */
async function postConReintentos(url, cuerpo, opciones, intentos = 3) {
  for (let intento = 1; ; intento++) {
    try {
      return await axios.post(url, cuerpo, opciones);
    } catch (err) {
      const status = err.response?.status;
      const pasajero = !status || status === 429 || status >= 500;
      if (!pasajero || intento >= intentos) throw err;
      console.log(`[CLAUDE] Intento ${intento} falló (${status || err.message}), reintentando en ${intento * 4}s...`);
      await esperar(intento * 4000);
    }
  }
}

async function procesarComprobante(base64, tipo, mimetype) {
  try {
    const content = tipo === 'pdf'
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
         { type: 'text', text: 'Extraé los datos de este comprobante.' }]
      : [{ type: 'image', source: { type: 'base64', media_type: mimetype || 'image/jpeg', data: base64 } },
         { type: 'text', text: 'Extraé los datos de este comprobante.' }];

    const response = await postConReintentos(
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

    // Limpieza básica de markdown, y fallback de seguridad: si Claude
    // agrega alguna palabra de más antes o después, extraemos solo lo
    // que está entre la primera '{' y la última '}'.
    let limpio = texto.replace(/```json|```/g, '').trim();
    const inicio = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    if (inicio !== -1 && fin !== -1) {
      limpio = limpio.substring(inicio, fin + 1);
    }
    const datos = limpiarOrigen(JSON.parse(limpio));
    if (datos && datos.es_comprobante === false) {
      console.log(`[CLAUDE] Descartado: ${datos.que_es || 'sin descripción'}`);
    }

    const uso = response.data.usage;
    console.log(`[CLAUDE] Tokens in:${uso.input_tokens} out:${uso.output_tokens} cache:${uso.cache_read_input_tokens || 0}`);

    return datos;
  } catch (err) {
    console.error('[ERROR CLAUDE]', err.response?.data ? JSON.stringify(err.response.data) : err.message);
    // No es lo mismo que "no es un comprobante": quien llama puede avisar que hay que reenviarlo
    return { es_comprobante: false, error_lectura: true };
  }
}

module.exports = { procesarComprobante, limpiarOrigen };

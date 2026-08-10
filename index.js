require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { procesarComprobante } = require('./claude');
const { appendSheets } = require('./sheets');

const app = express();
app.use(express.json({ limit: '20mb' }));

// ─── Configuración ───────────────────────────────────────────────
const PORT = process.env.WEBHOOK_PORT || 3000;
const GRUPOS_PERMITIDOS = process.env.GRUPOS_PERMITIDOS
  ? process.env.GRUPOS_PERMITIDOS.split(',').map(g => g.trim())
  : [];

// IDs de mensajes ya procesados (deduplicación en memoria)
const procesados = new Set();

// ─── Webhook principal ───────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  // Responder rápido a Evolution API para que no reintente
  res.sendStatus(200);

  try {
    const body = req.body;

    // Solo procesar eventos de mensajes nuevos
    if (body.event !== 'messages.upsert') return;

    const mensaje = body.data;
    if (!mensaje) return;

    const msgId    = mensaje.key?.id;
    const remoto   = mensaje.key?.remoteJid; // ID del chat/grupo
    const fromMe   = mensaje.key?.fromMe;
    const pushName = mensaje.pushName || 'Desconocido';

    // Ignorar mensajes propios
    if (fromMe) return;

    // Solo grupos (terminan en @g.us)
    if (!remoto?.endsWith('@g.us')) return;

    // Lista blanca de grupos
    if (GRUPOS_PERMITIDOS.length > 0 && !GRUPOS_PERMITIDOS.includes(remoto)) {
      console.log(`[IGNORADO] Grupo no permitido: ${remoto}`);
      return;
    }

    // Deduplicación
    if (procesados.has(msgId)) {
      console.log(`[DUPLICADO] Mensaje ya procesado: ${msgId}`);
      return;
    }
    procesados.add(msgId);
    // Limpiar set cada 1000 mensajes para no acumular memoria
    if (procesados.size > 1000) procesados.clear();

    // Detectar tipo de mensaje con media
    const tipoMedia = detectarTipoMedia(mensaje);
    if (!tipoMedia) return;

    console.log(`[NUEVO] ${tipoMedia} de ${pushName} en grupo ${remoto}`);

    // Descargar la media
    const mediaBase64 = await descargarMedia(msgId, remoto, tipoMedia);
    if (!mediaBase64) {
      console.error(`[ERROR] No se pudo descargar la media del mensaje ${msgId}`);
      return;
    }

    // Extraer datos con Claude API
    const datos = await procesarComprobante(mediaBase64, tipoMedia);

    if (!datos || !datos.es_comprobante) {
      console.log(`[IGNORADO] No es un comprobante de pago (${pushName})`);
      return;
    }

    console.log(`[COMPROBANTE] Monto: $${datos.monto} | ${datos.banco_billetera} | ${datos.nro_operacion}`);

    // Cargar en Google Sheets
    const fila = {
      fecha_recepcion:   new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
      grupo:             remoto,
      remitente:         pushName,
      fecha_comprobante: datos.fecha || '',
      hora_comprobante:  datos.hora || '',
      monto:             datos.monto || '',
      banco_billetera:   datos.banco_billetera || '',
      nro_operacion:     datos.nro_operacion || '',
      titular_origen:    datos.titular_origen || '',
      cuit_cbu:          datos.cuit_cbu_origen || '',
      estado:            'ok',
      msg_id:            msgId,
    };

    await appendSheets(fila);
    console.log(`[SHEETS] Fila agregada correctamente`);

    // Confirmar en el grupo de WhatsApp
    await confirmarEnGrupo(remoto, datos, pushName);

  } catch (err) {
    console.error('[ERROR WEBHOOK]', err.message);
  }
});

// ─── Detectar tipo de media ──────────────────────────────────────
function detectarTipoMedia(mensaje) {
  const msg = mensaje.message;
  if (!msg) return null;

  if (msg.imageMessage)    return 'image';
  if (msg.documentMessage) {
    const mime = msg.documentMessage.mimetype || '';
    if (mime === 'application/pdf') return 'pdf';
  }
  // Algunos PDFs llegan como documentWithCaptionMessage
  if (msg.documentWithCaptionMessage?.message?.documentMessage) {
    const mime = msg.documentWithCaptionMessage.message.documentMessage.mimetype || '';
    if (mime === 'application/pdf') return 'pdf';
  }
  return null;
}

// ─── Descargar media de Evolution API ───────────────────────────
async function descargarMedia(msgId, remoteJid, tipo) {
  try {
    const endpoint = tipo === 'image' ? 'base64FromMediaMessage' : 'base64FromMediaMessage';
    const resp = await axios.post(
      `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${process.env.EVOLUTION_INSTANCE}`,
      { message: { key: { id: msgId, remoteJid } }, convertToMp4: false },
      { headers: { apikey: process.env.EVOLUTION_API_KEY } }
    );
    return resp.data?.base64 || null;
  } catch (err) {
    console.error('[ERROR] Descarga de media:', err.response?.data || err.message);
    return null;
  }
}

// ─── Confirmar en el grupo ───────────────────────────────────────
async function confirmarEnGrupo(grupoId, datos, remitente) {
  try {
    const texto = `✅ *Comprobante registrado*\n` +
      `👤 ${remitente}\n` +
      `💰 $${Number(datos.monto).toLocaleString('es-AR')}\n` +
      `🏦 ${datos.banco_billetera}\n` +
      `🔢 Op: ${datos.nro_operacion}`;

    await axios.post(
      `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      { number: grupoId, text: texto },
      { headers: { apikey: process.env.EVOLUTION_API_KEY } }
    );
  } catch (err) {
    console.error('[ERROR] Confirmación en grupo:', err.message);
  }
}

// ─── Health check ────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Iniciar servidor ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🤖 Comprobantes Bot iniciado en puerto ${PORT}`);
  console.log(`📋 Grupos monitoreados: ${GRUPOS_PERMITIDOS.length > 0 ? GRUPOS_PERMITIDOS.join(', ') : 'TODOS (sin filtro)'}`);
  console.log(`⏳ Esperando mensajes de Evolution API...\n`);
});

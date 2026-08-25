require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { procesarComprobante } = require('./claude');
const { appendSheets } = require('./sheets');
const { descargarMediaManual } = require('./media');

const GRUPOS_PERMITIDOS = process.env.GRUPOS_PERMITIDOS
  ? process.env.GRUPOS_PERMITIDOS.split(',').map(g => g.trim()).filter(Boolean)
  : [];
const NOMBRES_GRUPOS = process.env.NOMBRES_GRUPOS
  ? process.env.NOMBRES_GRUPOS.split(',').map(n => n.trim())
  : [];

const NOMBRE_POR_GRUPO = {};
GRUPOS_PERMITIDOS.forEach((id, i) => { NOMBRE_POR_GRUPO[id] = NOMBRES_GRUPOS[i] || id; });

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '/opt/comprobantes-bot/.wwebjs_auth' }),
  webVersionCache: { type: 'none' },
  puppeteer: {
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }
});

function parsearMonto(monto) {
  if (typeof monto === 'number' && !isNaN(monto)) return monto;
  const limpio = String(monto ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const num = Number(limpio);
  return isNaN(num) ? null : num;
}

client.on('qr', (qr) => {
  console.log('\n📱 Escaneá este QR desde WhatsApp → Dispositivos vinculados:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('\n✅ Bot conectado a WhatsApp');
  if (GRUPOS_PERMITIDOS.length === 0) {
    console.log('⚠️  GRUPOS_PERMITIDOS está vacío.\n');
  } else {
    console.log(`👀 Monitoreando ${GRUPOS_PERMITIDOS.length} grupo(s):`);
    GRUPOS_PERMITIDOS.forEach(id => console.log(`   - ${NOMBRE_POR_GRUPO[id]}  (${id})`));
    console.log('');
  }
});

client.on('message', async (msg) => {
  const from = msg.from || '';
  if (!from.endsWith('@g.us')) return;

  if (!GRUPOS_PERMITIDOS.includes(from)) {
    console.log(`[GRUPO NO CONFIGURADO] "${msg.body}"   ID: ${from}`);
    return;
  }

  if (!msg.hasMedia) return;

  let remitente = msg.author || msg.from;
  const nombreGrupo = NOMBRE_POR_GRUPO[from];

  let media = null;
  for (let intento = 1; intento <= 2 && !media; intento++) {
    try { media = await msg.downloadMedia(); }
    catch (err) {
      console.error(`[ERROR downloadMedia intento ${intento}]`, err.message || err);
      if (intento < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (!media) {
    try {
      console.log('[INFO] downloadMedia falló — usando descarga manual...');
      media = await descargarMediaManual(msg);
      console.log('[INFO] Descarga manual OK');
    } catch (err) {
      console.error('[ERROR descarga manual]', err.message || err, '| from:', from);
      return;
    }
  }

  try {
    const mime = media.mimetype || '';
    const esImagen = mime.startsWith('image/');
    const esPdf = mime === 'application/pdf';
    if (!esImagen && !esPdf) return;

    try {
      const contacto = await msg.getContact();
      remitente = contacto.pushname || contacto.number || remitente;
    } catch (e) {}

    console.log(`[NUEVO] ${esPdf ? 'PDF' : 'Imagen'} de ${remitente} en "${nombreGrupo}"`);

    const datos = await procesarComprobante(media.data, esPdf ? 'pdf' : 'image', mime);
    if (!datos || !datos.es_comprobante) {
      console.log(`[IGNORADO] No es un comprobante (${remitente})`);
      return;
    }

    const montoNumerico = parsearMonto(datos.monto);
    const montoTexto = montoNumerico !== null
      ? montoNumerico.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : (datos.monto ?? 'sin dato');

    console.log(`[COMPROBANTE] $${montoTexto} | ${datos.banco_billetera} | Op: ${datos.nro_operacion}`);

    try {
      const resultado = await appendSheets({
        hoja:              nombreGrupo,
        fecha_recepcion:   new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
        grupo:             nombreGrupo,
        remitente:         remitente,
        fecha_comprobante: datos.fecha || '',
        hora_comprobante:  datos.hora || '',
        monto:             montoNumerico ?? datos.monto ?? '',
        banco_billetera:   datos.banco_billetera || '',
        nro_operacion:     datos.nro_operacion || '',
        titular_origen:    datos.titular_origen || '',
        cuit_cbu:          datos.cuit_cbu_origen || '',
        estado:            'ok',
        msg_id:            msg.id._serialized,
      });
      console.log('[SHEETS] Fila agregada ✅');

      if (resultado && resultado.duplicado) {
        const orig = resultado.original || {};
        console.log(`[DUPLICADO] Nro operación ya usado. Original en "${orig.grupo}" (${orig.fecha})`);
        await msg.reply(
          `🚨 *ATENCIÓN: comprobante duplicado*\n` +
          `El número de operación *${datos.nro_operacion}* ya fue registrado antes.\n` +
          `📍 Zona original: ${orig.grupo || 'desconocida'}\n` +
          `📅 Fecha original: ${orig.fecha || 'desconocida'}\n` +
          `💰 $${montoTexto}\n\n` +
          `Verificar antes de acreditar el pago.`
        );
      } else {
        await msg.reply(`✅ *Comprobante registrado*\n💰 $${montoTexto}\n🏦 ${datos.banco_billetera}\n🔢 Op: ${datos.nro_operacion}`);
      }
    } catch (sheetsErr) {
      console.error('[ERROR SHEETS]', sheetsErr.message || sheetsErr);
      try {
        await msg.reply(`⚠️ *No se pudo registrar el comprobante*\nEl monto ($${montoTexto}) se leyó bien, pero falló el guardado. Reenviá en unos minutos.`);
      } catch (e) {}
    }
  } catch (err) {
    console.error('[ERROR procesando mensaje]', err.message || err, '| from:', from);
  }
});

client.on('disconnected', (reason) => {
  console.log('❌ Desconectado:', reason, '— cerrando para que PM2 reinicie limpio...');
  setTimeout(() => process.exit(1), 3000);
});

process.on('unhandledRejection', (err) => console.error('[UNHANDLED]', err && err.message ? err.message : err));

console.log('🤖 Iniciando Comprobantes Bot...');
client.initialize();

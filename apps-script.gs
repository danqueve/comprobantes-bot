/**
 * COMPROBANTES BOT — Google Apps Script
 * 
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Abrí tu Google Sheet
 * 2. Extensiones → Apps Script
 * 3. Pegá este código completo
 * 4. Guardá (Ctrl+S)
 * 5. Implementar → Nueva implementación
 * 6. Tipo: Aplicación web
 *    Ejecutar como: Yo (tu cuenta)
 *    Quién tiene acceso: Cualquier usuario
 * 7. Implementar → Copiar la URL generada
 * 8. Pegá esa URL en tu .env como GOOGLE_APPS_SCRIPT_URL
 */

// Nombre de la hoja donde se guardan los comprobantes
const NOMBRE_HOJA = 'Comprobantes';

// Columnas en orden
const COLUMNAS = [
  'Fecha Recepción',
  'Grupo',
  'Remitente',
  'Fecha Comprobante',
  'Hora',
  'Monto',
  'Banco/Billetera',
  'Nro Operación',
  'Titular Origen',
  'CBU/CVU/Alias',
  'Estado',
  'ID Mensaje'
];

/**
 * Recibe el POST del bot y agrega la fila
 */
function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);
    const hoja  = obtenerOCrearHoja();

    const fila = [
      datos.fecha_recepcion  || '',
      datos.grupo            || '',
      datos.remitente        || '',
      datos.fecha_comprobante|| '',
      datos.hora_comprobante || '',
      datos.monto            || '',
      datos.banco_billetera  || '',
      datos.nro_operacion    || '',
      datos.titular_origen   || '',
      datos.cuit_cbu         || '',
      datos.estado           || 'ok',
      datos.msg_id           || '',
    ];

    hoja.appendRow(fila);

    // Formatear la columna de monto como moneda argentina
    const ultimaFila = hoja.getLastRow();
    hoja.getRange(ultimaFila, 6).setNumberFormat('$ #,##0.00');

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, fila: ultimaFila }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET para verificar que el script está activo
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, mensaje: 'Comprobantes Bot activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Obtiene la hoja o la crea con encabezados si no existe
 */
function obtenerOCrearHoja() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let hoja   = ss.getSheetByName(NOMBRE_HOJA);

  if (!hoja) {
    hoja = ss.insertSheet(NOMBRE_HOJA);
    // Crear encabezados
    hoja.appendRow(COLUMNAS);
    // Estilo encabezados
    const encabezado = hoja.getRange(1, 1, 1, COLUMNAS.length);
    encabezado.setBackground('#1a73e8');
    encabezado.setFontColor('#ffffff');
    encabezado.setFontWeight('bold');
    encabezado.setHorizontalAlignment('center');
    // Congelar primera fila
    hoja.setFrozenRows(1);
    // Ancho de columnas
    hoja.setColumnWidth(1, 160); // Fecha Recepción
    hoja.setColumnWidth(2, 180); // Grupo
    hoja.setColumnWidth(3, 140); // Remitente
    hoja.setColumnWidth(7, 150); // Banco/Billetera
    hoja.setColumnWidth(8, 160); // Nro Operación
    hoja.setColumnWidth(9, 160); // Titular Origen
  }

  return hoja;
}

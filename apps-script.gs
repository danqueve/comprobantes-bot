/**
 * COMPROBANTES BOT — Google Apps Script
 * Cada grupo de WhatsApp tiene su propia pestaña dentro de esta
 * misma planilla. El nombre de la pestaña llega en el campo "hoja".
 */

const COLUMNAS = [
  'Fecha Recepción', 'Grupo', 'Remitente', 'Fecha Comprobante', 'Hora',
  'Monto', 'Banco/Billetera', 'Nro Operación', 'Titular Origen',
  'CBU/CVU/Alias', 'Estado', 'ID Mensaje'
];

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);
    const nombreHoja = sanitizarNombreHoja(datos.hoja || datos.grupo || 'Comprobantes');
    const hoja = obtenerOCrearHoja(nombreHoja);

    const fila = [
      datos.fecha_recepcion   || '', datos.grupo             || '',
      datos.remitente         || '', datos.fecha_comprobante || '',
      datos.hora_comprobante  || '', datos.monto             || '',
      datos.banco_billetera   || '', datos.nro_operacion     || '',
      datos.titular_origen    || '', datos.cuit_cbu          || '',
      datos.estado            || 'ok', datos.msg_id          || '',
    ];

    hoja.appendRow(fila);
    hoja.getRange(hoja.getLastRow(), 6).setNumberFormat('$ #,##0.00');

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, hoja: nombreHoja, fila: hoja.getLastRow() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, mensaje: 'Comprobantes Bot activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Sheets no admite estos caracteres en nombres de pestaña: [ ] * ? / \ :
function sanitizarNombreHoja(nombre) {
  return String(nombre).replace(/[\[\]\*\?\/\\:]/g, '_').substring(0, 100);
}

function obtenerOCrearHoja(nombreHoja) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja);
    hoja.appendRow(COLUMNAS);
    const enc = hoja.getRange(1, 1, 1, COLUMNAS.length);
    enc.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    hoja.setFrozenRows(1);
    hoja.setColumnWidth(1, 160); hoja.setColumnWidth(2, 180); hoja.setColumnWidth(3, 140);
    hoja.setColumnWidth(7, 150); hoja.setColumnWidth(8, 160); hoja.setColumnWidth(9, 160);
  }
  return hoja;
}

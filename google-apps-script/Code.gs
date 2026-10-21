/**
 * =========================================================================
 * LAUSTORE - SISTEMA CENTRAL DE INVENTARIO CON GOOGLE APPS SCRIPT
 * =========================================================================
 * 
 * Este script corre directamente bajo tu cuenta personal de Google (sin
 * necesidad de cuentas de servicio, tarjetas de crédito ni Google Cloud).
 * 
 * INSTRUCCIONES DE INSTALACIÓN RÁPIDA:
 * 1. Abre https://script.google.com/
 * 2. Crea un "Nuevo proyecto" y nómbralo "LauStore Inventario Backend".
 * 3. Reemplaza todo el contenido con este archivo.
 * 4. Configura los IDs de tu Google Sheet y Google Drive abajo en CONFIG.
 * 5. Haz clic en "Implementar" -> "Nueva implementación":
 *    - Tipo: "Aplicación web"
 *    - Ejecutar como: "Yo (tu cuenta de Google)"
 *    - Quién tiene acceso: "Cualquier persona" (Anyone)
 * 6. Copia la URL resultante (terminada en /exec) y pégala en GOOGLE_APPS_SCRIPT_URL en Netlify.
 */

const CONFIG = {
  // Pega aquí el ID de tu Google Sheet (lo encuentras en la URL de tu hoja)
  // Ejemplo: https://docs.google.com/spreadsheets/d/TU_ID_AQUI/edit
  SPREADSHEET_ID: "12LBYBy6BsIfnlEFMH-NLJPYgddDfO-3JyYhB8K7uj2o",
  
  // Nombre de la pestaña de la hoja (si no existe, se creará automáticamente)
  SHEET_NAME: "Inventario_LauStore",

  // Pega aquí el ID de la carpeta de Google Drive donde se guardarán las fotos
  // Ejemplo: https://drive.google.com/drive/folders/TU_ID_CARPETA_AQUI
  DRIVE_FOLDER_ID: "1kWzfgJCfdDzRbO_2Jdn08MfmQIySloMj",

  // Prefijo para códigos secuenciales automáticos
  CODE_PREFIX: "LAU-",
  
  // Número de ceros de relleno (ej: LAU-0001)
  CODE_DIGITS: 4,

  // Token secreto opcional para verificar solicitudes legítimas de Netlify
  SECRET_TOKEN: "laustore_secret_token_2026"
};

/**
 * Encabezados oficiales para la hoja de Google Sheets
 */
const HEADERS = [
  "Código Principal",
  "Código Auxiliar Proveedor",
  "Proveedor",
  "Cantidad",
  "Descripción",
  "Talla",
  "Color",
  "Características / Tela",
  "Precio Compra (USD)",
  "Precio Venta (USD)",
  "Operador",
  "Sucursal",
  "Fecha y Hora",
  "Enlace Fotografía Drive",
  "ID Archivo Drive"
];

/**
 * Maneja solicitudes GET (Health check y redirección a exportar Excel)
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "status";
  var excelUrl = "https://docs.google.com/spreadsheets/d/" + CONFIG.SPREADSHEET_ID + "/export?format=xlsx";

  if (action === "export") {
    // Redirección directa al archivo XLSX de Excel
    return HtmlService.createHtmlOutput(
      '<html><head><meta http-equiv="refresh" content="0; url=' + excelUrl + '" /></head>' +
      '<body><p>Descargando inventario LauStore en Excel...</p></body></html>'
    );
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "LauStore Central Inventory API",
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    excelExportUrl: excelUrl,
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Maneja solicitudes POST (Recepción de prendas, subida de foto y guardado en Sheet)
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  
  // Esperar hasta 15 segundos para garantizar exclusión mutua y evitar colisiones entre operadores
  var hasLock = lock.tryLock(15000);
  if (!hasLock) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "El servidor central de inventario está ocupado registrando otra prenda. Por favor reintenta en unos segundos."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No se recibieron datos en la solicitud (cuerpo vacío).");
    }

    var payload = JSON.parse(e.postData.contents);

    // Validación de token secreto si está configurado
    if (CONFIG.SECRET_TOKEN && payload.secretToken && payload.secretToken !== CONFIG.SECRET_TOKEN) {
      throw new Error("Token de autenticación no válido para el servicio de inventario.");
    }

    // 1. Obtener o inicializar la Hoja de Cálculo
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    }

    // Asegurar encabezados en la primera fila con formato editorial
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setBackground("#6b1426"); // Color institucional LauStore (Vino Borgoña)
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      headerRange.setFontFamily("Arial");
      sheet.setFrozenRows(1);
    }

    // 2. El código principal identifica un modelo; puede repetirse en colores distintos.
    // La combinación modelo + color + sucursal se controla bajo el LockService.
    var codigoPrincipal = (payload.codigoPrincipal || "").toString().trim();

    if (!codigoPrincipal) {
      codigoPrincipal = getNextSequentialCode(sheet);
    } else {
      if (!String(payload.color || "").trim()) {
        throw new Error("Confirma el color antes de guardar un modelo con código existente.");
      }
      if (checkVariantExists(sheet, codigoPrincipal, payload.color, payload.sucursal)) {
        throw new Error("El modelo '" + codigoPrincipal + "' en color '" + payload.color +
          "' ya figura en la sucursal '" + payload.sucursal +
          "'. Revisa la fila existente antes de volver a registrarlo.");
      }
    }

    // 3. Procesar y guardar fotografía en Google Drive
    var driveFileUrl = "";
    var driveFileId = "";
    
    if (payload.imageBase64) {
      var folder;
      try {
        folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
      } catch (err) {
        // Fallback: usar carpeta raíz si el ID no es válido
        folder = DriveApp.getRootFolder();
      }

      // Limpiar prefijo data:image/...;base64, si viene incluido
      var cleanBase64 = payload.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
      var bytes = Utilities.base64Decode(cleanBase64);
      var nowStr = Utilities.formatDate(new Date(), "GMT-5", "yyyyMMdd_HHmmss");
      var fileName = codigoPrincipal + "_" + nowStr + ".jpg";
      
      var blob = Utilities.newBlob(bytes, "image/jpeg", fileName);
      var file = folder.createFile(blob);
      
      // Habilitar visualización para que cualquier operador o el sheet puedan ver la imagen
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        // En dominios empresariales podría estar restringido, ignorar si falla
      }

      driveFileId = file.getId();
      // Enlace de vista directa
      driveFileUrl = "https://drive.google.com/uc?export=view&id=" + driveFileId;
    }

    // 4. Formatear Fecha y Hora actual (Zona horaria de Ecuador GMT-5)
    var fechaHora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

    // 5. Preparar la fila con todos los campos requeridos
    var rowData = [
      codigoPrincipal,
      payload.codigoAuxiliar || "",
      payload.proveedor || "",
      Number(payload.cantidad) || 1,
      payload.descripcion || "",
      payload.talla || "",
      payload.color || "",
      payload.caracteristicas || "",
      payload.precioCompra !== null && payload.precioCompra !== "" ? Number(payload.precioCompra) : "",
      payload.precioVenta !== null && payload.precioVenta !== "" ? Number(payload.precioVenta) : "",
      payload.operador || "No especificado",
      payload.sucursal || "Norte - Kennedy",
      fechaHora,
      driveFileUrl,
      driveFileId
    ];

    // 6. Insertar en la Hoja
    sheet.appendRow(rowData);

    // Conservar los ceros iniciales en códigos como 001 o 013.
    var lastRow = sheet.getLastRow();
    var codeCell = sheet.getRange(lastRow, 1);
    codeCell.setNumberFormat("@");
    codeCell.setValue(String(codigoPrincipal));

    // Formatear columnas de precios como moneda si tienen datos
    if (rowData[8] !== "") {
      sheet.getRange(lastRow, 9).setNumberFormat("$#,##0.00");
    }
    if (rowData[9] !== "") {
      sheet.getRange(lastRow, 10).setNumberFormat("$#,##0.00");
    }

    var excelExportUrl = "https://docs.google.com/spreadsheets/d/" + CONFIG.SPREADSHEET_ID + "/export?format=xlsx";

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      codigoPrincipal: codigoPrincipal,
      driveFileUrl: driveFileUrl,
      driveFileId: driveFileId,
      excelExportUrl: excelExportUrl,
      sheetRow: lastRow,
      timestamp: fechaHora
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message || error.toString()
    })).setMimeType(ContentService.MimeType.JSON);

  } finally {
    // Liberar siempre el bloqueo de concurrencia
    lock.releaseLock();
  }
}

/**
 * Calcula el siguiente número correlativo de forma segura
 */
function getNextSequentialCode(sheet) {
  var props = PropertiesService.getScriptProperties();
  var storedCount = props.getProperty("LAST_SEQ_NUM");
  var nextNum = 1;

  if (storedCount) {
    nextNum = parseInt(storedCount, 10) + 1;
  } else {
    // Si no está en ScriptProperties, revisar las filas existentes en la columna A
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var maxFound = 0;
      for (var i = 0; i < codes.length; i++) {
        var str = (codes[i][0] || "").toString();
        var match = str.match(/\d+$/);
        if (match) {
          var num = parseInt(match[0], 10);
          if (num > maxFound) maxFound = num;
        }
      }
      nextNum = maxFound + 1;
    }
  }

  // Guardar en ScriptProperties atómicamente
  props.setProperty("LAST_SEQ_NUM", nextNum.toString());

  // Rellenar con ceros a la izquierda (ej: LAU-0001)
  var padded = nextNum.toString();
  while (padded.length < CONFIG.CODE_DIGITS) {
    padded = "0" + padded;
  }

  return CONFIG.CODE_PREFIX + padded;
}

/**
 * Normaliza claves para comparar sin diferencias por mayúsculas/acentos.
 * Los códigos puramente numéricos 013 y 13 se consideran el mismo modelo.
 */
function normalizeInventoryKey(value, numericCode) {
  var text = String(value == null ? "" : value).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  if (numericCode && /^\d+$/.test(text)) text = text.replace(/^0+(?=\d)/, "");
  return text;
}

/**
 * Un mismo modelo puede tener distintos colores y repetirse entre sucursales.
 * Evita únicamente una segunda captura del mismo modelo/color/sucursal.
 */
function checkVariantExists(sheet, code, color, branch) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  var values = sheet.getRange(2, 1, lastRow - 1, 12).getDisplayValues();
  var codeKey = normalizeInventoryKey(code, true);
  var colorKey = normalizeInventoryKey(color, false);
  var branchKey = normalizeInventoryKey(branch, false);

  for (var i = 0; i < values.length; i++) {
    if (normalizeInventoryKey(values[i][0], true) === codeKey &&
        normalizeInventoryKey(values[i][6], false) === colorKey &&
        normalizeInventoryKey(values[i][11], false) === branchKey) {
      return true;
    }
  }
  return false;
}

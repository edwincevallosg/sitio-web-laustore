/**
 * Netlify Function: save-item.js
 * Envía la prenda confirmada y la fotografía hacia Google Apps Script,
 * el cual genera el código secuencial con LockService, sube la foto a Drive
 * y añade la fila a Google Sheets.
 */

exports.handler = async (event) => {
  // CORS Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Pin",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Método no permitido. Utiliza POST." })
    };
  }

  try {
    const payload = JSON.parse(event.body || "{}");

    // 1. Validar PIN del operador
    const serverPin = process.env.INVENTORY_PIN || "1234";
    if (!payload.pin || payload.pin.toString().trim() !== serverPin.toString().trim()) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "PIN no autorizado para registrar prendas en el inventario." })
      };
    }

    // 2. Validar URL del Apps Script
    const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
    if (!appsScriptUrl) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Falta configurar la variable GOOGLE_APPS_SCRIPT_URL en Netlify.",
          hint: "Publica tu Web App en Google Apps Script y pega la URL en las variables de entorno de Netlify."
        })
      };
    }

    // 3. Adjuntar token secreto de comunicación
    payload.secretToken = process.env.APPS_SCRIPT_SECRET || "laustore_secret_token_2026";

    // 4. Invocar el backend de Google Apps Script
    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Apps Script Error Response:", errText);
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Error devuelto por Google Apps Script.",
          details: errText
        })
      };
    }

    const scriptResult = await response.json();

    if (!scriptResult.success) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: scriptResult.error || "No se pudo guardar la prenda en Google Sheets."
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scriptResult)
    };

  } catch (error) {
    console.error("Error en save-item:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Error inesperado al guardar la prenda.",
        message: error.message
      })
    };
  }
};

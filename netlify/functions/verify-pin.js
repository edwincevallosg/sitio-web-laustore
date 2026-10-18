/**
 * Netlify Function: verify-pin.js
 * Valida el PIN de seguridad del operador antes de conceder acceso al módulo de inventario.
 */

exports.handler = async (event) => {
  // Manejo de pre-flight CORS
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
    const { pin } = JSON.parse(event.body || "{}");
    const serverPin = process.env.INVENTORY_PIN || "1234";

    if (!pin || pin.toString().trim() !== serverPin.toString().trim()) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valid: false,
          error: "PIN de operador incorrecto. Por favor verifícalo."
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valid: true,
        message: "PIN verificado correctamente."
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valid: false, error: "Error en el servidor al verificar PIN." })
    };
  }
};

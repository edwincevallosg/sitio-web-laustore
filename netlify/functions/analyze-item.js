/**
 * Netlify Function: analyze-item.js
 * Procesa conjuntamente la fotografía de la prenda y el audio grabado del operador
 * utilizando Google Gemini Multimodal para extraer datos estructurados de inventario.
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
    const { pin, imageBase64, imageMimeType, audioBase64, audioMimeType, operador, sucursal } = JSON.parse(event.body || "{}");

    // 1. Validar PIN del operador
    const serverPin = process.env.INVENTORY_PIN || "1234";
    if (!pin || pin.toString().trim() !== serverPin.toString().trim()) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "PIN no autorizado para ejecutar análisis de IA." })
      };
    }

    // 2. Validar que exista imagen
    if (!imageBase64) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Es obligatorio capturar al menos una fotografía de la prenda." })
      };
    }

    // 3. Validar API Key de Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Falta configurar la variable de entorno GEMINI_API_KEY en Netlify.",
          hint: "Obtén tu API Key gratuita en https://aistudio.google.com/ y colócala en las variables de Netlify."
        })
      };
    }

    // 4. Preparar partes multimodales para Gemini
    const parts = [];

    // Parte de imagen
    const cleanImageBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    parts.push({
      inline_data: {
        mime_type: imageMimeType || "image/jpeg",
        data: cleanImageBase64
      }
    });

    // Parte de audio (si fue grabado)
    if (audioBase64) {
      const cleanAudioBase64 = audioBase64.replace(/^data:audio\/[a-z0-9_-]+;base64,/, "");
      // Determinar tipo mime de audio limpio
      let audioMime = audioMimeType || "audio/mp4";
      if (audioMime.includes(";")) {
        audioMime = audioMime.split(";")[0]; // Ej: audio/webm;codecs=opus -> audio/webm
      }
      parts.push({
        inline_data: {
          mime_type: audioMime,
          data: cleanAudioBase64
        }
      });
    }

    // Prompt con directrices estrictas
    const promptText = `
Eres el asistente de levantamiento de inventario de LauStore, boutique de moda femenina en Quito, Ecuador.
Tu tarea es analizar la fotografía de la prenda y, si existe audio, escuchar atentamente las indicaciones habladas del operador (${operador || "operador"} en ${sucursal || "tienda"}).

EL OPERADOR PUEDE HABER DICHO: cantidades, precios de compra, precios de venta, nombre del proveedor, código de etiqueta o características de la prenda.
EN LA FOTOGRAFÍA PUEDES OBSERVAR: el tipo de prenda (blazer, blusa, vestido, falda, etc.), corte, colores principales, texturas visibles de tela y etiquetas colgantes o cosidas.

REGLAS ESTRICTAS DE CONFIANZA:
1. NO inventes información. Si no puedes determinar con certeza un dato a partir de la foto o el audio, debes dejarlo como cadena vacía ("") o null.
2. Si se menciona una cantidad en el audio (ej: "tenemos 8 unidades"), pon ese número; de lo contrario, el valor por defecto es 1.
3. Si se mencionan precios en dólares (ej: "costó 12 y se vende en 32"), pon los valores numéricos correspondientes; si no se dijeron ni aparecen claros en etiqueta, déjalos como null.
4. Identifica códigos de barras o alfanuméricos impresos en etiquetas como "codigoAuxiliar".

Debes responder ÚNICAMENTE un JSON con esta estructura exacta:
{
  "codigoAuxiliar": "código de proveedor visible en etiqueta o dicho en audio, o vacío",
  "proveedor": "nombre del proveedor si se identificó, o vacío",
  "cantidad": 1,
  "descripcion": "nombre o descripción clara de la prenda (ej: Blazer entallado de corte sastre)",
  "talla": "talla o tallas identificadas (ej: S, M, L, XL, Talla Única), o vacío",
  "color": "color principal y variantes observadas (ej: Vino, Negro, Camel)",
  "caracteristicas": "detalles como tipo de tela (Punto Roma, Seda, Cuerina, etc.), forro, botones o textura",
  "precioCompra": null,
  "precioVenta": null
}
`;

    parts.push({ text: promptText });

    // 5. Llamar a la API de Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.1
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API Error:", errorText);
      return {
        statusCode: geminiResponse.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Error al comunicarse con Gemini API.",
          details: errorText
        })
      };
    }

    const geminiData = await geminiResponse.json();
    const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Gemini no devolvió una respuesta válida." })
      };
    }

    let parsedItem;
    try {
      parsedItem = JSON.parse(candidateText);
    } catch (e) {
      // Limpieza de posibles bloques ```json ... ``` si la API no respetó response_mime_type
      const cleanJson = candidateText.replace(/```json/g, "").replace(/```/g, "").trim();
      parsedItem = JSON.parse(cleanJson);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        item: parsedItem
      })
    };

  } catch (error) {
    console.error("Error en analyze-item:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Ocurrió un error inesperado al procesar la prenda.",
        message: error.message
      })
    };
  }
};

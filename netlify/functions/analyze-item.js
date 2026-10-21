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
    const cleanImageBase64 = imageBase64.replace(/^data:[^,]+;base64,/i, "");
    parts.push({
      inline_data: {
        mime_type: imageMimeType || "image/jpeg",
        data: cleanImageBase64
      }
    });

    // Parte de audio (si fue grabado)
    if (audioBase64) {
      const cleanAudioBase64 = audioBase64.replace(/^data:[^,]+;base64,/i, "");
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

    // Confirmar que el audio enviado por el iPhone contiene señal real.
    // No registrar contenido de audio ni información personal en logs.
    if (audioBase64 && (audioMimeType || "").startsWith("audio/wav")) {
      const wavBytes = Buffer.from(audioBase64.replace(/^data:[^,]+;base64,/i, ""), "base64");
      if (wavBytes.length < 32044 || wavBytes.toString("ascii", 0, 4) !== "RIFF" ||
          wavBytes.toString("ascii", 8, 12) !== "WAVE") {
        return {
          statusCode: 422,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "La grabación de voz está vacía o dañada. Vuelve a grabarla antes de analizar." })
        };
      }
      // PCM mono de 16 bits. Muestreo espaciado para detectar archivos totalmente silenciosos.
      let sumSquares = 0;
      let samples = 0;
      for (let i = 44; i + 1 < wavBytes.length; i += 64) {
        const amp = wavBytes.readInt16LE(i) / 32768;
        sumSquares += amp * amp;
        samples++;
      }
      if (!samples || Math.sqrt(sumSquares / samples) < 0.00015) {
        return {
          statusCode: 422,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "La grabación no contiene sonido suficiente. Comprueba el micrófono y vuelve a grabarla." })
        };
      }
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
4. Si el operador dicta un "código principal", consérvalo exactamente como texto en codigoPrincipal, incluidos los ceros iniciales; si no lo dicta, déjalo vacío para generación central.
5. Si dicta "código de proveedor", consérvalo en codigoAuxiliar. No inventes separadores: si dice "20 25" y no es clara la escritura, conserva "20 25" para confirmación humana.
6. Si menciona varias tallas (por ejemplo "S, M, L") y una cantidad total, NO infieras cuántas unidades hay por talla. Devuelve "S, M, L" en talla. Si dicta cantidades individuales como "S uno, M uno, L uno, XL uno" o "S1, M1, L1, XL1", normaliza SIEMPRE a "S:1, M:1, L:1, XL:1" en talla y usa la suma de unidades explícitas en cantidad.
7. Prioriza el dato expresamente dictado sobre conjeturas visuales; no atribuyas composición textil precisa solo por apariencia.
8. El código principal identifica al MODELO y se reutiliza entre distintos colores. Mantén el mismo código principal si cambia solamente el color; no generes códigos diferentes por color.
9. PRIORIDAD CRÍTICA: si se adjunta audio, escúchalo y transcribe LITERALMENTE las palabras del operador en "transcripcionVoz" antes de extraer campos. No inventes una transcripción ni utilices este prompt como fuente de voz. Si el audio no puede oírse o no contiene palabras inteligibles, devuelve "" en transcripcionVoz.
10. Extrae código de proveedor, distribución por talla y precios del contenido realmente dictado. Un código como "3048" y un precio como "doce dólares" deben conservarse en sus respectivos campos. Si no aparecen en el audio o una etiqueta legible, déjalos vacíos.
11. NO asumas "talla única" a partir de la fotografía. Solo escribe ÚNICA si se escuchó explícitamente "talla única" o aparece en una etiqueta legible. Diferencia entre cantidad total y cantidades por talla.
12. Si el audio no fue adjuntado, transcripcionVoz debe ser "" y ningún campo debe atribuirse a una voz inexistente.

Debes responder ÚNICAMENTE un JSON con esta estructura exacta:
{
  "transcripcionVoz": "palabras realmente escuchadas en el audio, o vacío si no hay audio o no se entiende",
  "codigoPrincipal": "código principal de tienda dicho por el operador, conservando ceros iniciales, o vacío",
  "codigoAuxiliar": "código de proveedor visible en etiqueta o dicho en audio, o vacío",
  "proveedor": "nombre del proveedor si se identificó, o vacío",
  "cantidad": 1,
  "descripcion": "nombre o descripción clara de la prenda (ej: Blazer entallado de corte sastre)",
  "talla": "distribución explícita S:1, M:1, L:1, XL:1 si se dictan unidades por talla; de otro modo tallas sueltas, o vacío",
  "color": "color principal y variantes observadas (ej: Vino, Negro, Camel)",
  "caracteristicas": "detalles como tipo de tela (Punto Roma, Seda, Cuerina, etc.), forro, botones o textura",
  "precioCompra": null,
  "precioVenta": null
}
`;

    parts.push({ text: promptText });

    // 5. Llamar a la API de Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

    // Mantener un margen frente al límite de respuesta síncrona de Netlify.
    // Devolver JSON legible al operador en lugar de dejar que venza la conexión.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 23000);
    let geminiResponse;
    const startedAt = Date.now();
    try {
      geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1
          }
        })
      });
      console.info("Gemini terminó en", Date.now() - startedAt, "ms; HTTP", geminiResponse.status);
    } catch (requestError) {
      if (requestError.name === "AbortError") {
        console.warn("Gemini excedió 23 segundos.");
        return {
          statusCode: 504,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Gemini tardó demasiado en analizar la prenda. Vuelve a intentarlo con un dictado más breve si el problema persiste."
          })
        };
      }
      throw requestError;
    } finally {
      clearTimeout(timeoutId);
    }

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

    const transcript = typeof parsedItem.transcripcionVoz === "string"
      ? parsedItem.transcripcionVoz.trim() : "";

    // Un resultado visual no basta si el operador grabó voz.
    if (audioBase64 && !transcript) {
      return {
        statusCode: 422,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Gemini reconoció la fotografía, pero no logró interpretar la voz. Comprueba que puedas escuchar el audio y vuelve a analizar o grabar.",
          audioRecibido: true,
          audioInterpretado: false
        })
      };
    }

    // La transcripción se muestra al operador, no se guarda en la hoja.
    delete parsedItem.transcripcionVoz;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        audioRecibido: Boolean(audioBase64),
        audioInterpretado: Boolean(transcript),
        transcripcionVoz: transcript,
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

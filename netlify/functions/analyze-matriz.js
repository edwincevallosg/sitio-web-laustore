"use strict";
// LauStore Matriz: el audio es la única fuente de datos; no se recibe fotografía.
const MODEL = "gemini-3.5-flash-lite";
const json = (statusCode, body) => ({
  statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405,{error:"Método no permitido"});
  try {
    const v = JSON.parse(event.body || "{}");
    if (!process.env.INVENTORY_PIN || String(v.pin || "") !== process.env.INVENTORY_PIN) {
      return json(401,{error:"PIN no autorizado"});
    }
    if (!process.env.GEMINI_API_KEY) return json(503,{error:"Gemini no está configurado"});
    const transcribe = v.mode === "transcribe";
    if (!transcribe && v.mode !== "extract") return json(400,{error:"Operación desconocida"});
    let parts;
    if (transcribe) {
      const type = String(v.audioMimeType || "audio/wav");
      const data = String(v.audioBase64 || "").replace(/^data:[^,]+;base64,/i,"");
      if (!/^(audio\/wav|audio\/x-wav|audio\/mp4|audio\/webm)$/.test(type) ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length < 1000 || data.length > 5800000) {
        return json(422,{error:"La grabación está vacía o tiene un formato no válido"});
      }
      const bytes = Buffer.from(data,"base64");
      if (type.includes("wav") && (bytes.toString("ascii",0,4)!=="RIFF" ||
          bytes.toString("ascii",8,12)!=="WAVE" || bytes.length < 32044)) {
        return json(422,{error:"No se pudo validar el audio WAV grabado"});
      }
      parts = [
        {inline_data:{mime_type:type,data}},
        {text:"Transcribe COMPLETAMENTE este dictado en español de Ecuador, del inicio al final, sin resumir. Conserva los números, valores decimales y el nombre largo del producto. No adivines lo inaudible, escribe [inaudible]. Devuelve SOLAMENTE JSON: {\"transcripcion\":\"texto íntegro\"}."}
      ];
    } else {
      const transcript = String(v.transcripcion || "").trim().slice(0,14000);
      if (transcript.length < 3) return json(422,{error:"No hay transcripción suficiente para analizar"});
      parts = [{text:
        "Extrae solo los campos que el operador DIJO en el siguiente dictado de inventario de tienda. No inventes ni completes con suposiciones. " +
        "Si no dijo un campo, deja cadena vacía para textos o null para números. " +
        "Si dijo un valor decimal como 'doce con cincuenta' interprétalo como 12.50. " +
        "La categoría es una clasificación, no un proveedor. " +
        "El inventario inicial debe ser un entero no negativo. " +
        "NO generes código de barras ni Precio 2 ni Precio 3. " +
        "Devuelve solamente JSON con claves exactas nombreProducto, categoria, costoReferencia, inventarioInicial, precio1. " +
        "Transcripción íntegra del operador:\n" + transcript
      }];
    }
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),23000);
    let response;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent?key="+encodeURIComponent(process.env.GEMINI_API_KEY),{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contents:[{role:"user",parts}],generationConfig:{responseMimeType:"application/json",temperature:0}}),
        signal:controller.signal
      });
    } finally {clearTimeout(timer);}
    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini Matriz HTTP",response.status,detail.slice(0,260));
      return json(response.status===429?429:502,{error:response.status===429?"Se alcanzó temporalmente el límite gratuito de Gemini":"Gemini no pudo procesar esta solicitud (HTTP "+response.status+")"});
    }
    const content = await response.json();
    const answer = content.candidates?.[0]?.content?.parts?.map(p=>p.text || "").join("") || "";
    let item;
    try {item=JSON.parse(answer.trim());}catch(_) {return json(502,{error:"Gemini respondió con un formato no válido; intenta analizar nuevamente"});}
    if (transcribe) {
      const transcript = String(item.transcripcion || "").trim();
      if (!transcript) return json(422,{error:"No se reconocieron palabras en la grabación"});
      return json(200,{success:true,transcripcion:transcript});
    }
    function decimal(x) {
      if(x===null||x===undefined||String(x).trim()==="")return null;
      const s=String(x).trim().replace(/[$\s]/g,"").replace(",",".");
      if(!/^-?\d+(\.\d+)?$/.test(s))return null;
      const n=Number(s);
      return Number.isFinite(n)?n:null;
    }
    const stock=decimal(item.inventarioInicial);
    return json(200,{success:true,item:{
      nombreProducto:String(item.nombreProducto||"").trim(),
      categoria:String(item.categoria||"").trim(),
      costoReferencia:decimal(item.costoReferencia),
      inventarioInicial:Number.isInteger(stock) && stock>=0?stock:null,
      precio1:decimal(item.precio1)
    }});
  } catch(e) {
    console.error("analyze-matriz:",e.name,e.message);
    return json(e.name==="AbortError"?504:500,{error:e.name==="AbortError"?"Gemini tardó demasiado. Reintenta con la misma grabación":"No se pudo analizar el dictado"});
  }
};

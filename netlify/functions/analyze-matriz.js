"use strict";
// LauStore Matriz: el audio es la única fuente de datos; no se recibe fotografía.
const MODEL = "gemini-3.5-flash-lite";
const json = (statusCode, body) => ({
  statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

function cleanKey(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}
function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}
function lookUp(source, aliases) {
  if(!source || typeof source !== "object" || Array.isArray(source))return undefined;
  const dict=Object.create(null);
  for(const [k,v] of Object.entries(source))dict[cleanKey(k)]=v;
  for(const k of aliases)if(hasValue(dict[cleanKey(k)]))return dict[cleanKey(k)];
  return undefined;
}
function parseSpanishAmount(input) {
  if(input === undefined || input === null)return null;
  if(typeof input === "number")return Number.isFinite(input)?input:null;
  const str=String(input).trim().toLowerCase();
  if(!str)return null;
  const numeric=str.replace(/(?:usd|d[oó]lares?|\$)/gi,"").trim().replace(",",".");
  const direct=numeric.match(/^[-+]?\d+(?:\.\d+)?$/);
  if(direct)return Number(numeric);
  const n=numeric.match(/^(\d+)(?:\s+(?:con|punto|coma)\s+)(\d{1,2})$/);
  if(n)return Number(n[1]+"."+n[2].padStart(2,"0"));
  const numbers={cero:0,un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,veinte:20,treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90};
  const normalized=str.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  if(Object.hasOwn(numbers,normalized))return numbers[normalized];
  const words=normalized.match(/^(.+?)\s+con\s+(.+)$/);
  if(words && Object.hasOwn(numbers,words[1]) && Object.hasOwn(numbers,words[2]))
    return Number((numbers[words[1]] + numbers[words[2]] / 100).toFixed(2));
  return null;
}
function parseLabelledTranscript(transcript) {
  const source=String(transcript||"").trim();
  const r=/\bnombre\s+(?:del\s+)?producto\b|\bdescripci[oó]n(?:\s+del\s+producto)?\b|\bcategor[ií]a\b|\bcosto\s+(?:de\s+)?referencia\b|\binventario\s+inicial\b|\bprecio\s*(?:1|uno)\b|\bprecio\b/giu;
  const matches=[...source.matchAll(r)];
  const data={};
  const key=label=>{
    const s=cleanKey(label);
    if(s.startsWith("nombre")||s.startsWith("descripcion"))return "nombreProducto";
    if(s.startsWith("categoria"))return "categoria";
    if(s.startsWith("costo"))return "costoReferencia";
    if(s.startsWith("inventario"))return "inventarioInicial";
    return "precio1";
  };
  if(matches.length && matches[0].index>0){
    const prefix=source.slice(0,matches[0].index).trim().replace(/^[\s,.;:]+|[\s,.;:]+$/g,"");
    if(prefix)data.nombreProducto=prefix;
  }
  matches.forEach((match,i)=>{
    const field=key(match[0]);
    const next=matches[i+1];
    const raw=source.slice(match.index+match[0].length,next?next.index:source.length)
      .trim().replace(/^[\s:=,-]+|[\s,.;:]+$/g,"");
    if(!raw)return;
    if(field==="nombreProducto"||field==="categoria")data[field]=raw;
    else {
      // No suponer que "precio 135" signifique 35 o 135: necesita revisión.
      if(field==="precio1" && cleanKey(match[0])==="precio" && /^1\d{2}$/.test(raw)){
        data.precioAmbiguo=raw;
      }else{
        const value=parseSpanishAmount(raw);
        if(value!==null)data[field]=value;
      }
    }
  });
  return data;
}
function normalizeExtractedItem(item,transcript){
  const base=(item && typeof item==="object" && !Array.isArray(item))?item:{};
  const nested=base.item||base.datos||base.producto;
  const sources=[base,typeof nested==="object"?nested:{}];
  const aliases={
    nombreProducto:["nombreProducto","nombre_del_producto","nombre","descripcion","descripción","productoNombre","nombre producto"],
    categoria:["categoria","categoría","tipo","category"],
    costoReferencia:["costoReferencia","costo_referencia","costo","precioCompra","costo referencia"],
    inventarioInicial:["inventarioInicial","inventario_inicial","cantidad","stockInicial","stock","inventario inicial"],
    precio1:["precio1","precio_1","precioUno","precioVenta","precio","precio 1"]
  };
  const fallback=parseLabelledTranscript(transcript);
  const field=key=>{
    for(const source of sources){
      const found=lookUp(source,aliases[key]);
      if(hasValue(found))return found;
    }
    return fallback[key];
  };
  const cost=parseSpanishAmount(field("costoReferencia"));
  const stock=parseSpanishAmount(field("inventarioInicial"));
  const price=parseSpanishAmount(field("precio1"));
  const result={
    nombreProducto:String(field("nombreProducto")||"").trim(),
    categoria:String(field("categoria")||"").trim(),
    costoReferencia:cost!==null&&cost>=0?cost:null,
    inventarioInicial:Number.isSafeInteger(stock)&&stock>=0?stock:null,
    precio1:price!==null&&price>=0?price:null
  };
  const missing=Object.entries(result).filter(([k,v])=>!hasValue(v)).map(([k])=>k);
  const warnings=[];
  if(fallback.precioAmbiguo && !hasValue(lookUp(base,aliases.precio1)))
    warnings.push("Precio 1 ambiguo en la transcripción («precio "+fallback.precioAmbiguo+"»). Confirma el valor real.");
  if(missing.length)warnings.push("Revisa y completa los campos pendientes: "+missing.join(", ")+".");
  return {item:result,missing,warnings};
}

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
        {text:"Transcribe COMPLETAMENTE este dictado en español de Ecuador, del inicio al final, sin resumir. Conserva los números, valores decimales y el nombre largo del producto. Diferencia el número del campo del precio: si se dice 'precio uno treinta y cinco', escribe 'precio 1: 35', NO 'precio 135'. No adivines lo inaudible, escribe [inaudible]. Devuelve SOLAMENTE JSON: {\"transcripcion\":\"texto íntegro\"}."}
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
    const structured = normalizeExtractedItem(item,String(v.transcripcion||""));
    const captured = Object.values(structured.item).some(hasValue);
    if(!captured) return json(422,{error:"Gemini devolvió campos vacíos. La transcripción se conservó; revisa o repite el análisis."});
    return json(200,{success:true,item:structured.item,missing:structured.missing,warnings:structured.warnings});
  } catch(e) {
    console.error("analyze-matriz:",e.name,e.message);
    return json(e.name==="AbortError"?504:500,{error:e.name==="AbortError"?"Gemini tardó demasiado. Reintenta con la misma grabación":"No se pudo analizar el dictado"});
  }
};

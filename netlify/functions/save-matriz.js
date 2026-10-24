"use strict";
// Guardado aislado: este endpoint jamás llama al Apps Script del inventario anterior.
const reply=(statusCode,body)=>({statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)});
exports.handler=async event=>{
  if(event.httpMethod!=="POST") return reply(405,{error:"Método no permitido"});
  try{
    const body=JSON.parse(event.body||"{}");
    const pin=process.env.INVENTORY_PIN;
    if(!pin||String(body.pin||"")!==pin)return reply(401,{error:"PIN no autorizado"});
    const url=process.env.GOOGLE_APPS_SCRIPT_MATRIZ_URL;
    const secret=process.env.APPS_SCRIPT_SECRET;
    if(!url||!secret) return reply(503,{error:"El guardado de Inventario Matriz aún no está conectado. Configura GOOGLE_APPS_SCRIPT_MATRIZ_URL y APPS_SCRIPT_SECRET en Netlify."});
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))return reply(503,{error:"URL del backend Matriz inválida"});
    const name=String(body.nombreProducto||"").trim();
    const category=String(body.categoria||"").trim();
    const cost=Number(body.costoReferencia),stock=Number(body.inventarioInicial),price1=Number(body.precio1);
    const cents=Math.round((price1+Number.EPSILON)*100);
    if(!name||name.length>1500||!category||category.length>180||
      body.costoReferencia===""||!Number.isFinite(cost)||cost<0||
      body.inventarioInicial===""||!Number.isInteger(stock)||stock<0||
      body.precio1===""||!Number.isFinite(price1)||price1<2||
      !Number.isSafeInteger(cents)){
      return reply(422,{error:"Revisa nombre, categoría, costo, inventario entero y Precio 1 (mínimo $2)."});
    }
    const normalized={
      nombreProducto:name,categoria:category,
      costoReferencia:Math.round((cost+Number.EPSILON)*100)/100,
      inventarioInicial:stock,precio1:cents/100,
      requestId:String(body.requestId||"").slice(0,90),
      secretToken:secret
    };
    // Verificar primero que el servicio independiente existe. Nunca escribir al backend viejo.
    const statusUrl=url+"?action=matriz-status";
    const check=await fetch(statusUrl,{redirect:"follow",signal:AbortSignal.timeout(12000)});
    if(!check.ok)return reply(503,{error:"No se pudo contactar el backend Matriz"});
    let meta;
    try{meta=await check.json();}catch(_){return reply(503,{error:"El backend Matriz no devolvió una respuesta válida"});}
    if(meta.service!=="LauStore Inventario Matriz"||meta.ready!==true){
      return reply(503,{error:"El enlace configurado no es el backend independiente de Inventario Matriz; no se guardaron datos."});
    }
    const res=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(normalized),redirect:"follow",signal:AbortSignal.timeout(20000)});
    if(!res.ok)return reply(502,{error:"No se pudo conectar con Google Sheets"});
    let saved;
    try{saved=await res.json();}catch(_){return reply(502,{error:"El backend devolvió una respuesta no válida. Revisa la hoja antes de reintentar."});}
    if(saved.success!==true||!/^LS\d{10}$/.test(saved.codigoBarras||"")){
      return reply(422,{error:saved.error||"El guardado no fue confirmado. Comprueba la hoja antes de reintentar."});
    }
    return reply(200,{success:true,codigoBarras:saved.codigoBarras,fila:saved.fila,precios:{precio1:cents/100,precio2:(cents-100)/100,precio3:(cents-200)/100}});
  }catch(e){
    console.error("save-matriz",e.name,e.message);
    return reply(e.name==="TimeoutError"?504:500,{error:"No se pudo confirmar el guardado. Antes de reintentar, revisa la hoja Inventario Matriz."});
  }
};

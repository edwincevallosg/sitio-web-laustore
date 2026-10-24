/**
 * Apps Script NUEVO e independiente: LauStore Inventario Matriz.
 * Publicar como nueva aplicación web (Ejecutar como: Yo).
 * En Configuración del proyecto > Propiedades del script:
 * MATRIZ_API_SECRET = MISMO valor que APPS_SCRIPT_SECRET de Netlify.
 * No copiar este código encima del backend antiguo.
 */
const MATRIZ_SHEET_ID = "12LBYBy6BsIfnlEFMH-NLJPYgddDfO-3JyYhB8K7uj2o";
const MATRIZ_TAB = "Inventario Matriz";
const MATRIZ_HEADERS = [
  "Nombre del producto","Código de barras","Categoría",
  "Costo referencia","Inventario inicial","Precio 1","Precio 2","Precio 3"
];
function matrizJson(object) {
  return ContentService.createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || "");
  if (action !== "matriz-status") return matrizJson({ready:false,error:"Ruta no encontrada"});
  return matrizJson({
    service:"LauStore Inventario Matriz",
    ready:Boolean(PropertiesService.getScriptProperties().getProperty("MATRIZ_API_SECRET"))
  });
}
function matrizText(s,maxLen) {
  let value=String(s==null?"":s).trim();
  if(!value || value.length>maxLen)throw Error("Texto faltante o demasiado largo");
  // Evitar fórmulas introducidas por dictado.
  if (/^[=+@]/.test(value)) value="'"+value;
  return value;
}
function matrizDecimal(v,label) {
  if(v===null||v===undefined||String(v).trim()==="")throw Error(label+" es obligatorio");
  const n=Number(v);
  if(!isFinite(n) || n<0) throw Error(label+" debe ser un valor decimal no negativo");
  return Math.round((n+Number.EPSILON)*100)/100;
}
function doPost(e) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))return matrizJson({success:false,error:"Otro operador está guardando. Reintenta."});
  try {
    const payload=JSON.parse(e && e.postData && e.postData.contents || "{}");
    const key=PropertiesService.getScriptProperties().getProperty("MATRIZ_API_SECRET");
    if(!key||!payload.secretToken||String(payload.secretToken)!==key)throw Error("Acceso denegado");
    const id=String(payload.requestId||"");
    if(!/^[\w-]{12,90}$/.test(id))throw Error("Identificador de solicitud inválido");
    const cache=CacheService.getScriptCache(), cached=cache.get("MZ_"+id);
    if(cached)return matrizJson(JSON.parse(cached));
    const name=matrizText(payload.nombreProducto,1500);
    const category=matrizText(payload.categoria,180);
    const cost=matrizDecimal(payload.costoReferencia,"Costo referencia");
    const quantity=Number(payload.inventarioInicial);
    if(!Number.isSafeInteger(quantity)||quantity<0)throw Error("Inventario inicial debe ser entero positivo o cero");
    const price1=matrizDecimal(payload.precio1,"Precio 1");
    if(price1<2)throw Error("Precio 1 debe ser al menos 2 para obtener precios no negativos");
    const cents=Math.round(price1*100);
    const ss=SpreadsheetApp.openById(MATRIZ_SHEET_ID);
    const sheet=ss.getSheetByName(MATRIZ_TAB);
    if(!sheet)throw Error("No se encontró la pestaña Inventario Matriz");
    const headers=sheet.getRange(1,1,1,8).getDisplayValues()[0];
    if(MATRIZ_HEADERS.some((h,i)=>headers[i]!==h))throw Error("Los encabezados de Inventario Matriz no coinciden. No se guardó.");
    const props=PropertiesService.getScriptProperties();
    const savedSequence=Number(props.getProperty("MATRIZ_LAST_SEQUENCE")||"0");
    let maxExisting=0;
    if(sheet.getLastRow()>1){
      const codes=sheet.getRange(2,2,sheet.getLastRow()-1,1).getDisplayValues();
      for(let i=0;i<codes.length;i++) {
        const m=String(codes[i][0]).match(/^LS(\d{10})$/);
        if(m)maxExisting=Math.max(maxExisting,Number(m[1]));
      }
    }
    const seq=Math.max(savedSequence,maxExisting)+1;
    if(seq>9999999999)throw Error("Se agotó el rango de códigos");
    const barcode="LS"+String(seq).padStart(10,"0");
    sheet.appendRow([name,barcode,category,cost,quantity,cents/100,(cents-100)/100,(cents-200)/100]);
    const row=sheet.getLastRow();
    sheet.getRange(row,2).setNumberFormat("@").setValue(barcode);
    props.setProperty("MATRIZ_LAST_SEQUENCE",String(seq));
    const result={success:true,codigoBarras:barcode,fila:row};
    cache.put("MZ_"+id,JSON.stringify(result),21600);
    return matrizJson(result);
  } catch(err) {
    return matrizJson({success:false,error:String(err.message||err)});
  } finally {
    lock.releaseLock();
  }
}

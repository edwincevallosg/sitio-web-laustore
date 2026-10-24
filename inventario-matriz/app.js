(() => {
"use strict";
const $ = id => document.getElementById(id);
const state = {pin:"",recorder:null,phase:"idle",timer:null,audioData:"",audioUrl:"",transcript:"",requestId:"",saved:false};
const formFields = ["nombre","categoria","costo","cantidad","precio1"];
const round = n => Math.round((n+Number.EPSILON)*100)/100;
const msg=(id,text,type)=>{ const el=$(id);el.className=type||"";el.textContent=text||""; };
function setRecordingUI() {
  $("recordButton").disabled=state.phase==="starting"||state.phase==="stopping";
  $("recordButton").classList.toggle("active",state.phase==="recording");
  $("recordButton").textContent=state.phase==="recording"?"Detener grabación":(state.phase==="stopping"?"Preparando audio...":"Iniciar dictado");
  $("analyzeButton").disabled=!state.audioData||state.phase!=="idle";
  $("discardButton").disabled=!state.audioData||state.phase!=="idle";
}
function getNewId(){
  return "mz-"+(typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2));
}
function resetAudio(){
  state.audioData="";state.transcript="";
  if(state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl="";
  $("playback").pause();
  $("playback").removeAttribute("src");
  $("playback").style.display="none";
  $("transcriptPanel").hidden=true;
  msg("analyzeStatus","");
  setRecordingUI();
}
function encodeWav(chunks,rate) {
  const count=chunks.reduce((n,c)=>n+c.length,0);
  if(count<rate)throw Error("La grabación dura menos de un segundo");
  const data=new Float32Array(count);
  let off=0;for(const chunk of chunks){data.set(chunk,off);off+=chunk.length;}
  const sampleRate=16000, ratio=rate/sampleRate, frames=Math.floor(count/ratio);
  const buffer=new ArrayBuffer(44+frames*2),v=new DataView(buffer);
  const ascii=(at,str)=>{for(let i=0;i<str.length;i++)v.setUint8(at+i,str.charCodeAt(i));};
  ascii(0,"RIFF");v.setUint32(4,buffer.byteLength-8,true);ascii(8,"WAVE");
  ascii(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,"data");v.setUint32(40,frames*2,true);
  for(let i=0;i<frames;i++){
    const pos=i*ratio,j=Math.min(Math.floor(pos),count-1),k=Math.min(j+1,count-1);
    const p=Math.max(-1,Math.min(1,data[j]+(data[k]-data[j])*(pos-j)));
    v.setInt16(44+i*2,p<0?p*32768:p*32767,true);
  }
  return new Blob([buffer],{type:"audio/wav"});
}
function blobDataUrl(blob){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error("Error leyendo audio"));r.readAsDataURL(blob);});
}
async function startRecording(){
  if(state.phase!=="idle")return;
  state.phase="starting";setRecordingUI();resetAudio();
  let stream=null,context=null;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true}});
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)throw Error("El navegador no admite grabación");
    context=new C();
    await context.resume();
    if(context.state!=="running")throw Error("El micrófono está suspendido. Abre el portal en Safari o Chrome.");
    const input=context.createMediaStreamSource(stream);
    const node=context.createScriptProcessor(4096,1,1);
    const mute=context.createGain();mute.gain.value=0;
    const chunks=[];
    node.onaudioprocess=e=>{if(state.phase==="recording")chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));};
    input.connect(node);node.connect(mute);mute.connect(context.destination);
    state.recorder={stream,context,input,node,mute,chunks,started:Date.now()};
    state.phase="recording";setRecordingUI();
    msg("recordStatus","Grabando: 00:00");
    state.timer=setInterval(()=>{
      const elapsed=Math.floor((Date.now()-state.recorder.started)/1000);
      msg("recordStatus","Grabando: "+String(Math.floor(elapsed/60)).padStart(2,"0")+":"+String(elapsed%60).padStart(2,"0"));
      if(elapsed>=90)stopRecording();
    },250);
  }catch(e){
    if(stream)stream.getTracks().forEach(t=>t.stop());
    if(context)context.close().catch(()=>{});
    state.phase="idle";state.recorder=null;setRecordingUI();
    msg("recordStatus",e.message||"No fue posible utilizar el micrófono","error");
  }
}
async function stopRecording(){
  if(state.phase!=="recording"||!state.recorder)return;
  state.phase="stopping";setRecordingUI();
  clearInterval(state.timer);
  const r=state.recorder;state.recorder=null;
  r.node.onaudioprocess=null;
  for(const node of [r.input,r.node,r.mute])node.disconnect();
  r.stream.getTracks().forEach(t=>t.stop());
  r.context.close().catch(()=>{});
  try{
    const secs=r.chunks.reduce((n,c)=>n+c.length,0)/r.context.sampleRate;
    const wav=encodeWav(r.chunks,r.context.sampleRate);
    state.audioData=await blobDataUrl(wav);
    state.audioUrl=URL.createObjectURL(wav);
    $("playback").src=state.audioUrl;
    $("playback").style.display="block";
    msg("recordStatus","Audio de "+Math.round(secs)+" segundos preparado. Reprodúcelo antes de analizar.");
  }catch(e){state.audioData="";msg("recordStatus",e.message,"error");}
  state.phase="idle";setRecordingUI();
}
async function request(url,payload,timeoutMs=28000){
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:c.signal});
    let data;
    try{data=await response.json();}catch(_){throw Error("Respuesta del servidor no válida");}
    if(!response.ok||data.success===false)throw Error(data.error||"Error HTTP "+response.status);
    return data;
  }catch(e){
    if(e.name==="AbortError")throw Error("La operación tardó demasiado. Comprueba la conexión y vuelve a intentar.");
    throw e;
  }finally{clearTimeout(tm);}
}
function calcPrices(){
  const value=$("precio1").value;
  if(value===""){ $("precio2").value="";$("precio3").value="";return;}
  const cents=Math.round((Number(value)+Number.EPSILON)*100);
  $("precio2").value=((cents-100)/100).toFixed(2);
  $("precio3").value=((cents-200)/100).toFixed(2);
}
function assign(item){
  if(!item)return;
  $("nombre").value=item.nombreProducto||"";
  $("categoria").value=item.categoria||"";
  $("costo").value=item.costoReferencia===null||item.costoReferencia===undefined?"":Number(item.costoReferencia).toFixed(2);
  $("cantidad").value=item.inventarioInicial===null||item.inventarioInicial===undefined?"":item.inventarioInicial;
  $("precio1").value=item.precio1===null||item.precio1===undefined?"":Number(item.precio1).toFixed(2);
  calcPrices();
}
function reviewPayload(){
  const name=$("nombre").value.trim(),category=$("categoria").value.trim();
  const costRaw=$("costo").value,stockRaw=$("cantidad").value,priceRaw=$("precio1").value;
  const cost=Number(costRaw),stock=Number(stockRaw),price=Number(priceRaw);
  if(!name||!category||costRaw===""||!Number.isFinite(cost)||cost<0||
      stockRaw===""||!Number.isSafeInteger(stock)||stock<0||
      priceRaw===""||!Number.isFinite(price)||price<2){
    throw Error("Completa nombre, categoría, costo, inventario entero y Precio 1 (mínimo $2).");
  }
  return {nombreProducto:name,categoria:category,costoReferencia:round(cost),inventarioInicial:stock,precio1:round(price)};
}
function setSaved(flag){
  state.saved=flag;$("saveButton").disabled=flag;
  $("newButton").hidden=!flag;
}
$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const pin=$("pin").value.trim();$("loginButton").disabled=true;msg("loginStatus","Verificando acceso...");
  try{
    const data=await request("/.netlify/functions/verify-pin",{pin},14000);
    if(!data.valid)throw Error("PIN incorrecto");
    state.pin=pin;$("loginPanel").hidden=true;$("application").hidden=false;
    msg("loginStatus","");
  }catch(err){msg("loginStatus",err.message,"error");}
  finally{$("loginButton").disabled=false;}
});
$("recordButton").addEventListener("click",()=>{if(state.phase==="recording")stopRecording();else if(state.phase==="idle")startRecording();});
$("discardButton").addEventListener("click",()=>{if(state.phase==="idle"){resetAudio();msg("recordStatus","Micrófono listo.");}});
$("analyzeButton").addEventListener("click",async ()=>{
  if(!state.audioData)return;
  $("analyzeButton").disabled=true;msg("analyzeStatus","Transcribiendo todo el dictado...");
  try{
    if(!state.transcript){
      const t=await request("/.netlify/functions/analyze-matriz",{pin:state.pin,mode:"transcribe",audioBase64:state.audioData,audioMimeType:"audio/wav"},28000);
      state.transcript=t.transcripcion;
    }
    $("transcriptPanel").hidden=false;$("transcript").textContent=state.transcript;
    msg("analyzeStatus","Extrayendo los datos...");
    const p=await request("/.netlify/functions/analyze-matriz",{pin:state.pin,mode:"extract",transcripcion:state.transcript},28000);
    assign(p.item);
    state.requestId=getNewId();setSaved(false);
    msg("analyzeStatus","Información interpretada. Revisa los campos antes de guardar.","good");
    $("productForm").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){msg("analyzeStatus",err.message,"error");}
  finally{setRecordingUI();}
});
$("precio1").addEventListener("input",calcPrices);
$("productForm").addEventListener("submit",async e=>{
  e.preventDefault();if(state.saved)return;
  let item;
  try{item=reviewPayload();}catch(err){msg("saveStatus",err.message,"error");return;}
  if(!state.requestId)state.requestId=getNewId();
  const btn=$("saveButton");btn.disabled=true;msg("saveStatus","Guardando en Inventario Matriz...");
  try{
    const data=await request("/.netlify/functions/save-matriz",Object.assign({pin:state.pin,requestId:state.requestId},item),35000);
    $("barcode").value=data.codigoBarras;
    setSaved(true);
    msg("saveStatus","Guardado exitoso. Código "+data.codigoBarras+" (fila "+data.fila+").","good");
  }catch(err){msg("saveStatus",err.message,"error");btn.disabled=false;}
});
$("newButton").addEventListener("click",()=>{
  $("productForm").reset();
  $("barcode").value="Se asignará al guardar";
  state.requestId="";state.transcript="";setSaved(false);resetAudio();
  msg("recordStatus","Micrófono listo.");msg("saveStatus","");
  window.scrollTo({top:0,behavior:"smooth"});
});
setRecordingUI();
})();

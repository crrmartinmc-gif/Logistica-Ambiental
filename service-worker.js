/* ============================================================
   DIA VERDE - APP CHOFERES
   SERVICE WORKER WEB V32
   Cola en segundo plano para INICIOS y FINALIZACIONES
   SIN FIREBASE / SIN FCM
   ============================================================ */

const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbz0n4ZlW2p--nP2Wx0SnytyCRt_pL6RFxliEan0j1vUdSSrBrVNCbsTI7VC0JQWl5k9/exec';
const DB_NAME = 'DiaVerdeChoferBG';
const DB_VERSION = 1;
const STORE = 'salidas';
let procesoEnCurso = null;

self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

function abrirDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'opId'});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('No se pudo abrir IndexedDB.'));
  });
}
function leerPendientes(){
  return abrirDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error||new Error('No se pudo leer la cola.'));
  }));
}
function borrarPendiente(opId){
  return abrirDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(opId);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('No se pudo borrar la cola.'));
  }));
}
function validarConfirmacionInicio(data){
  if(data?.ok===false||data?.resultado?.ok===false)throw new Error(data.error||data.resultado?.error||'El backend rechazó la salida.');
  const fotos=data?.resultado?.FOTOS_SALIDA;
  if(!fotos||Number(fotos.registradas)!==4||(Array.isArray(fotos.errores)&&fotos.errores.length)||(Array.isArray(fotos.faltantes)&&fotos.faltantes.length)){
    const detalle=[...(Array.isArray(fotos?.errores)?fotos.errores:[]),...(Array.isArray(fotos?.faltantes)?fotos.faltantes:[])].join(' | ');
    throw new Error('No se confirmaron las cuatro fotos. La salida sigue pendiente.'+(detalle?' '+detalle:''));
  }
  return data;
}
function validarConfirmacionFinalizacion(data){
  if(data?.ok===false||data?.resultado?.ok===false||data?.data?.ok===false){
    throw new Error(data.error||data.resultado?.error||data.data?.error||'El backend rechazó la finalización.');
  }
  return data;
}
async function avisarClientes(mensaje){
  const clientes=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clientes.forEach(client=>client.postMessage(mensaje));
}
async function procesarSalidasInterno(){
  const pendientes=await leerPendientes();
  // Se mantiene el orden de persistencia: cada operación se confirma antes de borrar.
  for(const item of pendientes){
    try{
      const response=await fetch(BACKEND_URL,{
        method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(item.payload),cache:'no-store'
      });
      const text=await response.text();
      if(!response.ok)throw new Error('Backend HTTP '+response.status);
      let data;try{data=JSON.parse(text);}catch(e){throw new Error('Respuesta del backend no válida.');}
      const esFinalizacion=item.tipo==='FINALIZACION'||String(item.payload?.accion||'').startsWith('finalizarViaje');
      if(esFinalizacion){
        validarConfirmacionFinalizacion(data);
        await borrarPendiente(item.opId);
        await avisarClientes({type:'FINALIZACION_GUARDADA',opId:item.opId,data});
      }else{
        validarConfirmacionInicio(data);
        await borrarPendiente(item.opId);
        await avisarClientes({type:'SALIDA_GUARDADA',opId:item.opId,data});
      }
    }catch(error){
      const esFinalizacion=item.tipo==='FINALIZACION'||String(item.payload?.accion||'').startsWith('finalizarViaje');
      console.warn('[Dia Verde SW] operación pendiente:',item.opId,error);
      await avisarClientes({type:esFinalizacion?'FINALIZACION_PENDIENTE':'SALIDA_PENDIENTE',opId:item.opId,error:String(error.message||error)});
      throw error;
    }
  }
}
function procesarSalidas(){
  if(procesoEnCurso)return procesoEnCurso;
  procesoEnCurso=procesarSalidasInterno().finally(()=>{procesoEnCurso=null;});
  return procesoEnCurso;
}
self.addEventListener('sync',event=>{
  if(event.tag==='dia-verde-salidas')event.waitUntil(procesarSalidas().catch(()=>{}));
});
self.addEventListener('message',event=>{
  if(event.data?.type==='PROCESAR_SALIDAS_AHORA')event.waitUntil(procesarSalidas().catch(()=>{}));
});

importScripts('./operaciones-viaje.js?v=4','./cola-viajes.js','./cola-fotos-salida.js?v=2');
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
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await self.clients.claim();
    if(self.registration.sync && (await ColaFotosSalida.pendientes()).length){
      await self.registration.sync.register('chofer-fotos-salida');
    }
  })().catch(error=>console.warn('No se pudo reanudar el envío de fotos:',error.message)));
});

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
function validarConfirmacionInicio(data){return validarRespuestaViaje(data,true);}
function validarConfirmacionFinalizacion(data){return validarRespuestaViaje(data,false);}
async function avisarClientes(mensaje){
  const clientes=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clientes.forEach(client=>client.postMessage(mensaje));
}
async function procesarSalidasInterno(){
  const pendientes=(await leerPendientes()).sort((a,b)=>a.createdAt-b.createdAt);
  // Se mantiene el orden de persistencia: cada operación se confirma antes de borrar.
  for(const item of pendientes){
    try{
      const data=await enviarOperacionViaje(item.payload);
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
  procesoEnCurso=conBloqueoColaViajes(procesarSalidasInterno).finally(()=>{procesoEnCurso=null;});
  return procesoEnCurso;
}
self.addEventListener('sync',event=>{
  if(event.tag==='dia-verde-salidas')event.waitUntil(procesarSalidas());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='PROCESAR_SALIDAS_AHORA')event.waitUntil(procesarSalidas());
});


self.addEventListener('sync',event=>{if(event.tag==='chofer-viajes-v33')event.waitUntil(ColaViajes.procesar(registro=>avisarClientes({type:'VIAJE_LOCAL_ACTUALIZADO',registro})));});

const avisarInicioSalida=salida=>avisarClientes({type:'INICIO_SALIDA_CONFIRMADO',salida});
function enviarFotosPendientes(){
  return ColaFotosSalida.procesar(salida=>avisarClientes({type:'FOTOS_SALIDA_GUARDADAS',salida}),undefined,
    opId=>ColaFotosSalida.enviar(opId,{alConfirmarInicio:avisarInicioSalida}));
}
self.addEventListener('sync',event=>{
  if(event.tag==='chofer-fotos-salida')event.waitUntil(enviarFotosPendientes());
});
self.addEventListener('message',event=>{
  if(event.data?.type!=='ENVIAR_FOTOS_SALIDA' || !event.ports[0])return;
  const puerto=event.ports[0];
  puerto.postMessage({recibido:true});
  event.waitUntil((async()=>{
    try{
      const salida=await ColaFotosSalida.enviar(event.data.opId,{alConfirmarInicio:avisarInicioSalida});
      puerto.postMessage({salida});
      if(salida && !salida.ocupada)await avisarClientes({type:'FOTOS_SALIDA_GUARDADAS',salida});
    }catch(error){puerto.postMessage({error:error.message});}
  })());
});

// Solo recursos de la interfaz; nunca respuestas del backend ni documentos de Drive.
const APP_CACHE='chofer-interfaz-v46';
const APP_FILES=['./','./index.html','./operaciones-viaje.js?v=4','./cola-viajes.js?v=33','./cola-fotos-salida.js?v=2','./viajes-locales.js?v=20261124-bg','./recorridos-chofer.js?v=20261124-recuperar','./documentos-unidad.js?v=2','./documentos-unidad.css?v=4','./manifest.webmanifest','./ordenes-secretaria.js?v=5','./ordenes-secretaria.css?v=2'];
self.addEventListener('install',event=>event.waitUntil(caches.open(APP_CACHE).then(c=>c.addAll(APP_FILES))));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
  const allowed=APP_FILES.some(p=>new URL(p,self.registration.scope).href===u.href);
  if(!allowed)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(APP_CACHE).then(c=>c.put(event.request,copy)));}
    return response;
  }).catch(async()=>{const cached=await caches.match(event.request);if(cached)return cached;throw Error('Recurso no disponible sin conexión.');}));
});

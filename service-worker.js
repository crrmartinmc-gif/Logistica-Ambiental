importScripts('./operaciones-viaje.js?v=5','./salidas-pendientes.js?v=1','./cola-viajes.js?v=34','./cola-fotos-salida.js?v=2');

const BACKEND_URL='https://script.google.com/macros/s/AKfycbz0n4ZlW2p--nP2Wx0SnytyCRt_pL6RFxliEan0j1vUdSSrBrVNCbsTI7VC0JQWl5k9/exec';
const APP_CACHE='chofer-interfaz-v47';
const APP_FILES=['./','./index.html','./operaciones-viaje.js?v=5','./salidas-pendientes.js?v=1',
  './documentos-unidad.js?v=2','./documentos-unidad.css?v=5','./manifest.webmanifest','./ambiente-lomas.png'];
const etiquetas=['dia-verde-salidas','chofer-viajes-v33','chofer-fotos-salida'];
const procesando=new Map();

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(APP_CACHE);
  await cache.addAll(APP_FILES.map(url=>new Request(new URL(url,self.registration.scope),{cache:'reload'})));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const nombre of await caches.keys()){
    if(nombre.startsWith('chofer-interfaz-') && nombre!==APP_CACHE)await caches.delete(nombre);
  }
  await self.clients.claim();
})()));

async function avisarSalida(payload,inicio){
  const {idChofer,idServicio,idAsignacion,idVehiculo,horaInicio}=payload;
  const clientes=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clientes.forEach(cliente=>cliente.postMessage({type:'SALIDA_GUARDADA',
    payload:{idChofer,idServicio,idAsignacion,idVehiculo,horaInicio},...inicio}));
}

function procesarSalidas(){
  return conBloqueoColaViajes(async()=>{
    let fallo;
    for(const {opId,payload} of (await leerSalidasGuardadas()).sort((a,b)=>a.createdAt-b.createdAt)){
      // Las operaciones de un circuito retirado se conservan sin reenviarlas.
      if(!['iniciarViaje','finalizarViaje'].includes(payload?.accion))continue;
      try{
        const respuesta=await enviarOperacionViaje(payload);
        const inicio=payload.accion==='iniciarViaje'?confirmacionInicioViaje(respuesta,payload):null;
        await borrarSalidaGuardada(opId);
        if(inicio)await avisarSalida(payload,inicio);
      }catch(error){fallo=error;}
    }
    if(fallo)throw fallo;
  });
}

function procesarPendientes(etiqueta){
  if(procesando.has(etiqueta))return procesando.get(etiqueta);
  let tarea;
  // Se reintentan datos ya guardados con versiones anteriores de la aplicación.
  if(etiqueta==='chofer-viajes-v33')tarea=ColaViajes.procesar(r=>{
    if(r.inicioConfirmado && !r.cierreConfirmado)return avisarSalida(r.payload,{idViaje:r.idViaje});
  });
  else if(etiqueta==='chofer-fotos-salida')tarea=ColaFotosSalida.procesar(salida=>
    avisarSalida(salida,salida),r=>r.payload?.accion==='iniciarViaje');
  else tarea=procesarSalidas();

  const pendiente=tarea.finally(()=>procesando.delete(etiqueta));
  procesando.set(etiqueta,pendiente);
  return pendiente;
}

self.addEventListener('sync',event=>{
  if(etiquetas.includes(event.tag))event.waitUntil(procesarPendientes(event.tag));
});

self.addEventListener('message',event=>{
  if(!['REANUDAR_ENVIOS_CHOFERES','PROCESAR_SALIDAS_AHORA'].includes(event.data?.type))return;
  event.waitUntil((async()=>{
    const resultados=await Promise.allSettled(etiquetas.map(procesarPendientes));
    for(const [i,resultado] of resultados.entries()){
      if(resultado.status==='rejected'){
        console.warn('Envío pendiente:',resultado.reason?.message);
        await self.registration.sync?.register(etiquetas[i]).catch(()=>{});
      }
    }
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET' || !APP_FILES.some(path=>new URL(path,self.registration.scope).href===event.request.url))return;
  event.respondWith(fetch(event.request).then(async respuesta=>{
    if(respuesta.ok){
      const cache=await caches.open(APP_CACHE);
      await cache.put(event.request,respuesta.clone()).catch(()=>{});
    }
    return respuesta;
  }).catch(async()=>{
    const cache=await caches.open(APP_CACHE);
    const archivo=await cache.match(event.request);
    if(archivo)return archivo;
    throw Error('Recurso no disponible sin conexión.');
  }));
});

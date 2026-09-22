/* ============================================================
   DIA VERDE - APP CHOFERES
   SERVICE WORKER WEB V30
   SIN FIREBASE / SIN FCM
   Solo Background Sync de salidas
   ============================================================ */

const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbz0n4ZlW2p--nP2Wx0SnytyCRt_pL6RFxliEan0j1vUdSSrBrVNCbsTI7VC0JQWl5k9/exec';
const DB_NAME = 'DiaVerdeChoferBG';
const DB_VERSION = 1;
const STORE = 'salidas';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function abrirDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE)){
        db.createObjectStore(STORE,{keyPath:'opId'});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB.'));
  });
}

async function leerPendientes(){
  const db = await abrirDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE,'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('No se pudo leer la cola.'));
  });
}

async function borrarPendiente(opId){
  const db = await abrirDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(opId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('No se pudo borrar la cola.'));
  });
}

async function procesarSalidas(){
  const pendientes = await leerPendientes();

  for(const item of pendientes){
    try{
      const response = await fetch(BACKEND_URL,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(item.payload),
        cache:'no-store'
      });

      const text = await response.text();
      if(!response.ok) throw new Error('Backend HTTP '+response.status);

      let data;
      try{
        data = JSON.parse(text);
      }catch(e){
        throw new Error('Respuesta del backend no válida.');
      }

      if(data?.ok === false){
        throw new Error(data.error || data.resultado?.error || 'El backend rechazó la salida.');
      }

      await borrarPendiente(item.opId);

      const clientes = await self.clients.matchAll({type:'window',includeUncontrolled:true});
      clientes.forEach(client=>{
        client.postMessage({
          type:'SALIDA_GUARDADA',
          opId:item.opId,
          data
        });
      });
    }catch(error){
      console.warn('[Dia Verde SW] salida pendiente:',item.opId,error);
      // No borramos el registro. Background Sync volverá a intentarlo.
      throw error;
    }
  }
}

self.addEventListener('sync',event=>{
  if(event.tag === 'dia-verde-salidas'){
    event.waitUntil(procesarSalidas().catch(()=>{}));
  }
});

self.addEventListener('message',event=>{
  if(event.data?.type === 'PROCESAR_SALIDAS_AHORA'){
    event.waitUntil(procesarSalidas().catch(()=>{}));
  }
});

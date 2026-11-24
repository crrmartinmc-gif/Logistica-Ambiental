/* Almacén compartido con las versiones anteriores de App Choferes. */
function abrirDBSegundoPlano(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('DiaVerdeChoferBG',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('salidas',{keyPath:'opId'});
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('No se pudo abrir la cola de salidas.'));
  });
}

const BG_STORE='salidas';

async function leerSalidasGuardadas(){
  const db=await abrirDBSegundoPlano();
  try{
    return await new Promise((resolve,reject)=>{
      const req=db.transaction(BG_STORE).objectStore(BG_STORE).getAll();
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }finally{db.close();}
}

async function borrarSalidaGuardada(opId){
  const db=await abrirDBSegundoPlano();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(BG_STORE,'readwrite');
      tx.objectStore(BG_STORE).delete(opId);
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(tx.error||new Error('No se pudo limpiar la salida confirmada.'));
    });
  }finally{db.close();}
}

/* Cola durable V33. No modifica ni elimina operaciones de la cola anterior. */
const ColaViajes = (() => {
  function db(){return new Promise((ok,no)=>{const r=indexedDB.open('ChoferViajesV33',1);r.onupgradeneeded=()=>r.result.createObjectStore('viajes',{keyPath:'key'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}
  async function todos(){const d=await db();return new Promise((ok,no)=>{const t=d.transaction('viajes'),r=t.objectStore('viajes').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);t.oncomplete=()=>d.close();});}
  async function editar(key,fn){const d=await db();return new Promise((ok,no)=>{const t=d.transaction('viajes','readwrite'),s=t.objectStore('viajes'),r=s.get(key);let result;r.onsuccess=()=>{try{result=fn(r.result);if(result)s.put(result);else s.delete(key);}catch(e){t.abort();no(e);}};t.oncomplete=()=>{d.close();ok(result);};t.onerror=t.onabort=()=>{d.close();no(t.error||new Error('No se pudo guardar en este celular.'));};});}
  async function iniciar(payload,servicio,unidad){
    const key='ASIG-'+payload.idAsignacion;
    return editar(key,old=>old||{key,payload,servicio,unidad,createdAt:Date.now(),inicioConfirmado:false,cierre:null,cierreConfirmado:false,error:''});
  }
  async function cerrar(key,payload){return editar(key,r=>{if(!r)throw Error('No se encontró el viaje guardado.');return {...r,cierre:r.cierre||payload,error:''};});}
  async function procesar(notificar=()=>{}){
    return conBloqueoColaViajes(async()=>{
      let fallo=null;
      for(const initial of (await todos()).sort((a,b)=>a.createdAt-b.createdAt)){
        if(initial.cierreConfirmado || initial.payload?.accion!=='iniciarViaje')continue;
        let r=initial;
        try{
          if(!r.inicioConfirmado){
            const data=await enviarOperacionViaje(r.payload),res=resultadoOperacionViaje(data),v=res.viaje||res;
            const id=v.ID_VIAJE||v.idViaje;
            if(!id)throw Error('El servidor no confirmó el identificador del viaje.');
            r=await editar(r.key,actual=>({...actual,inicioConfirmado:true,idViaje:id,error:'',payload:{...actual.payload,fotos:undefined}}));
            await notificar(r);
          }
          // Volver a leer: el chofer puede haber cerrado mientras se enviaba el inicio.
          r=(await todos()).find(x=>x.key===r.key);
          if(r?.cierre?.accion==='finalizarViaje' && !r.cierreConfirmado){
            await enviarOperacionViaje({...r.cierre,idViaje:r.idViaje});
            r=await editar(r.key,actual=>({...actual,cierreConfirmado:true,error:''}));
            await notificar(r);
          }
        }catch(e){
          await editar(initial.key,actual=>({...actual,error:String(e.message||e)}));
          await notificar({...r,error:String(e.message||e)});
          fallo=e;break;
        }
      }
      if(fallo)throw fallo;
    });
  }
  return {todos,editar,iniciar,cerrar,procesar};
})();

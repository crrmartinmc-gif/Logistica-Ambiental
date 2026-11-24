/* Contrato compartido por la app y el Service Worker. */
function resultadoOperacionViaje(data){
  return data?.resultado||data?.data?.resultado||data?.datos?.resultado||data?.datos||data?.data||data;
}
function confirmacionInicioViaje(data,payload){
  const resultado=resultadoOperacionViaje(data);
  const viaje=resultado?.viaje||resultado;
  const idViaje=viaje?.ID_VIAJE||viaje?.idViaje||payload.idViaje;
  if(!idViaje)throw Error('El servidor no devolvió el ID del viaje.');
  if(payload.etapaSalida==='INICIO' && viaje.INICIO_CONFIRMADO!==true){
    throw Error('El servidor todavía no confirmó el inicio separado de las fotos.');
  }
  if(payload.etapaSalida==='FOTOS' && idViaje!==payload.idViaje)throw Error('El servidor confirmó otro viaje.');
  const fotos=resultado?.FOTOS_SALIDA||viaje?.FOTOS_SALIDA||data?.FOTOS_SALIDA;
  if(payload.fotosPorViaje===true && (fotos?.reutilizadas===true ||
      (fotos?.ID_VIAJE_ORIGEN && String(fotos.ID_VIAJE_ORIGEN)!==String(idViaje)))){
    throw Error('El servidor confirmó fotos de otro viaje.');
  }
  return {idViaje,kmInicial:viaje?.KM_INICIAL??viaje?.kmInicial,estado:viaje?.ESTADO,activo:viaje?.VIAJE_ACTIVO};
}
function validarRespuestaViaje(data,esInicio){
  const resultado=resultadoOperacionViaje(data);
  const capas=[data,data?.resultado,data?.datos,data?.data,data?.data?.resultado,data?.datos?.resultado];
  const rechazo=capas.find(c=>c && c.ok===false);
  if(rechazo) throw new Error(rechazo.error||rechazo.mensaje||'El servidor rechazó la operación.');
  if(!data || typeof data!=='object' || !capas.some(c=>c?.ok===true)) throw new Error('El servidor no confirmó la operación.');
  if(esInicio){
    const fotos=resultado?.FOTOS_SALIDA||resultado?.viaje?.FOTOS_SALIDA||data?.FOTOS_SALIDA;
    if(!fotos || Number(fotos.registradas)!==4 || fotos.errores?.length || fotos.faltantes?.length){
      const detalle=[...(Array.isArray(fotos?.errores)?fotos.errores:[]),...(Array.isArray(fotos?.faltantes)?fotos.faltantes:[])].join(' | ');
      throw new Error('El servidor no confirmó las 4 fotos de salida. Se conserva la copia local.'+(detalle?' '+detalle:''));
    }
  }
  return data;
}
async function enviarOperacionViaje(payload){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90000);
  try{
    // Las fotos superan el límite de 64 KiB de fetch con keepalive.
    const response=await fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store',signal:controller.signal});
    const text=await response.text();
    if(!response.ok)throw new Error('Servidor HTTP '+response.status);
    let data;try{data=JSON.parse(text);}catch(e){throw new Error('El servidor no devolvió una confirmación válida.');}
    return validarRespuestaViaje(data,payload.etapaSalida!=='INICIO' && !String(payload.accion||'').startsWith('finalizarViaje'));
  }catch(e){
    if(e?.name==='AbortError')throw new Error('El servidor está demorando. La operación sigue pendiente de confirmación.');
    throw e;
  }finally{clearTimeout(timer);}
}
function conBloqueoColaViajes(callback){
  if(globalThis.navigator?.locks?.request) return navigator.locks.request('dia-verde-envio-viajes',callback);
  return callback();
}

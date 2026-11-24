/* Confirmación de viajes y recuperación de la cola anterior. */
let envioLocalEnCurso=null;
async function fetchConTiempo(url,options={}){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),45000);
  try{const response=await fetch(url,{...options,signal:c.signal});const body=await response.text();return {ok:response.ok,status:response.status,text:async()=>body};}
  catch(e){if(e.name==='AbortError')throw Error('La conexión está demorando. Volvé a intentar.');throw e;}finally{clearTimeout(timer);}
}
// Los viajes nuevos se confirman directamente con el servidor. La cola antigua
// se conserva únicamente para recuperar operaciones ya pendientes.
async function guardarInicioLocal(payload,servicio=servicioEnInspeccion){
  const data=await enviarOperacionViaje(payload);
  const inicio=confirmacionInicioViaje(data,payload);
  servicio.idViaje=inicio.idViaje;
  servicio.localKey='';
  limpiarCacheAPI('listarViajes','listarAsignaciones','listarServicios','listarVehiculos');
  return inicio;
}
function actualizarIdViajeLocal(r){
  if(String(r.payload.idChofer)!==String(session?.idChofer))return;
  if(servicioEnInspeccion?.localKey===r.key && r.idViaje)servicioEnInspeccion.idViaje=r.idViaje;
}
function lanzarEnvioLocal(){
  if(!envioLocalEnCurso){
    envioLocalEnCurso=ColaViajes.procesar(async r=>{
      if(!session)return;
      limpiarCacheAPI();actualizarIdViajeLocal(r);
      if(r.cierreConfirmado && $('inspectionScreen').classList.contains('hidden'))cargarDashboard({force:true}).catch(()=>{});
    }).catch(e=>console.warn('Sincronización local pendiente:',e.message)).finally(()=>{envioLocalEnCurso=null;});
  }
  registrarServiceWorkerWeb().then(reg=>{if(reg?.sync) return reg.sync.register('chofer-viajes-v33');}).catch(()=>{});
}
// Identifica cierres guardados para evitar que una respuesta antigua del servidor
// vuelva a mostrar como activo el mismo servicio o asignación.
async function cierresLocalesPendientesChofer(){
  if(esChoferSecretaria()||!session?.idChofer)return {asignaciones:new Set(),viajes:new Set()};
  const filas=await ColaViajes.todos();
  const propios=filas.filter(r=>r.cierre&&!r.cierreConfirmado&&String(r.payload?.idChofer)===String(session.idChofer));
  return {
    asignaciones:new Set(propios.map(r=>String(r.payload?.idAsignacion||r.servicio?.idAsignacion||'')).filter(Boolean)),
    viajes:new Set(propios.map(r=>String(r.idViaje||r.payload?.idViaje||'')).filter(Boolean))
  };
}
async function recuperarViajeLocal(incluirConfirmado=false){
  if(!session?.idChofer)return false;
  const identidad=String(session.idChofer);
  let registros;try{registros=await ColaViajes.todos();}catch(e){return false;}
  if(identidad!==String(session?.idChofer)||window.__iniciandoViajeDiaVerde)return false;
  // En Logística/Reserva, un cierre guardado no bloquea la agenda mientras se sincroniza.
  // Secretaría conserva el flujo restringido de recuperación y cierre.
  const r=registros.filter(x=>String(x.payload.idChofer)===identidad&&!x.cierreConfirmado&&
    (esChoferSecretaria() || !x.cierre)&&
    (incluirConfirmado||!x.inicioConfirmado||x.cierre)).sort((a,b)=>b.createdAt-a.createdAt)[0];
  if(!r)return false;
  $('dashboardScreen').classList.remove('hidden');
  if(!esChoferSecretaria()){
    const dominio=r.unidad?.DOMINIO||r.servicio?.dominio||r.payload.dominio||'';
    renderVehicle({dominio},r.unidad||r.servicio,{km:r.payload.kmInicial});
  }
  if(r.cierre){
    $('inspectionScreen').classList.add('hidden');$('serviceBox').classList.remove('hidden');
    $('serviceBox').innerHTML='<div class="empty"><strong>Viaje finalizado</strong></div>';
  }else{
    if(servicioEnInspeccion?.localKey===r.key&&!$('inspectionScreen').classList.contains('hidden')){
      actualizarIdViajeLocal(r);
      return true;
    }
    servicioEnInspeccion={...r.servicio,localKey:r.key,idViaje:r.idViaje||r.payload.idViaje||'',estado:'EN VIAJE'};
    if(r.unidad)vehiculoSecretariaSeleccionado=r.unidad;
    window.__servicioActual=servicioEnInspeccion;
    $('serviceBox').classList.add('hidden');$('inspectionScreen').classList.remove('hidden');
    mostrarModoViajeActivo();
  }
  actualizarIdViajeLocal(r);
  return true;
}
// Cierres nuevos: siempre se envían por la ruta de servidor del index.
// Los viajes antiguos pendientes conservan su cola para no perder registros.
// Compatibilidad para viajes antiguos del teléfono: cerrar contra el servidor,
// sin depender de que la cola local termine de sincronizar el inicio.
async function cerrarViajeLocal(cerrarRecorrido){
  const actual=servicioEnInspeccion;
  if(!actual?.localKey || !session)return false;
  const registros=await ColaViajes.todos();
  const r=registros.find(x=>!x.cierreConfirmado && x.key===actual.localKey &&
    String(x.payload?.idChofer)===String(session.idChofer));
  if(!r)return false;
  const km=parsearKilometraje($('finalKm')?.value);
  const a=$('inspectionAlert'),btn=$('finishInspectionBtn');
  if(km===null || km<Number(r.payload.kmInicial)){
    a.textContent='Ingresá un KM final igual o mayor al inicial.';a.style.display='block';return true;
  }
  btn.disabled=true;btn.textContent='GUARDANDO CIERRE…';a.style.display='none';
  try{
    let id=String(r.idViaje||actual.idViaje||r.payload.idViaje||'').trim();
    // Cuando una respuesta se perdió, recuperar el ID real del viaje del chofer.
    if(!id){
      const respuesta=await getJson('listarViajes',{}, {force:true});
      const viajes=Array.isArray(respuesta.viajes)?respuesta.viajes:[];
      const propios=viajes.filter(v=>String(v.ID_CHOFER||'')===String(session.idChofer) &&
        ['EN CURSO','ACTIVO','INICIADO'].includes(String(v.ESTADO||'').trim().toUpperCase()));
      const servicio=String(r.payload.idServicio||actual.idServicio||'');
      const compatibles=servicio?propios.filter(v=>String(v.ID_SERVICIO||'')===servicio):propios;
      if(compatibles.length===1)id=String(compatibles[0].ID_VIAJE||'');
    }
    if(!id)throw Error('No se pudo identificar el viaje en el servidor. No se realizó el cierre.');
    const secretaria=r.payload.accion==='iniciarViajeSecretaria';
    const payload={accion:secretaria?'finalizarViajeSecretaria':'finalizarViaje',
      usuario:session.usuario,idChofer:session.idChofer,
      idVehiculo:r.payload.idVehiculo,idServicio:r.payload.idServicio||'',
      idViaje:id,kmFinal:km,horaFin:new Date().toISOString(),
      finalizarRecorrido:cerrarRecorrido===true,
      ...(r.payload.idSolicitud?{idSolicitud:r.payload.idSolicitud,
        idAsignacionLocal:r.payload.idAsignacionLocal,
        tokenOrdenes:session.tokenOrdenes||r.payload.tokenOrdenes}:{})};
    await enviarOperacionViaje(payload);
    await ColaViajes.editar(r.key,anterior=>({...anterior,idViaje:id,
      inicioConfirmado:true,cierre:payload,cierreConfirmado:true,error:''}));
    actual.estado='FINALIZADO';actual.localKey='';actual.idViaje=id;
    limpiarCacheAPI('listarViajes','listarAsignaciones','listarServicios','listarVehiculos');
    volverInicioSinEsperar();
  }catch(e){
    a.textContent=e.message||'No se pudo confirmar el cierre. Intentá nuevamente.';
    a.style.display='block';console.warn('Cierre de viaje recuperado:',e);
  }finally{
    btn.disabled=false;btn.textContent='FINALIZAR SERVICIO';
  }
  return true;
}

window.addEventListener('load',()=>{
  if(session)lanzarEnvioLocal();
  navigator.serviceWorker?.addEventListener('message',ev=>{if(ev.data?.type==='VIAJE_LOCAL_ACTUALIZADO'){limpiarCacheAPI();actualizarIdViajeLocal(ev.data.registro);if(ev.data.registro.cierreConfirmado&&session&&$('inspectionScreen').classList.contains('hidden'))cargarDashboard({force:true}).catch(()=>{});}});
  setInterval(()=>{if(session&&navigator.onLine)lanzarEnvioLocal();},30000);
});
window.addEventListener('online',()=>{if(session)lanzarEnvioLocal();});
window.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)lanzarEnvioLocal();});

/* La pantalla avanza solamente después de confirmar la transacción local. */
let envioLocalEnCurso=null;
async function fetchConTiempo(url,options={}){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),45000);
  try{const response=await fetch(url,{...options,signal:c.signal});const body=await response.text();return {ok:response.ok,status:response.status,text:async()=>body};}
  catch(e){if(e.name==='AbortError')throw Error('La conexión está demorando. Volvé a intentar.');throw e;}finally{clearTimeout(timer);}
}
// Los viajes nuevos se confirman directamente con el servidor. La cola antigua
// se conserva únicamente para recuperar operaciones ya pendientes.
async function guardarInicioLocal(payload){
  const data=await enviarOperacionViaje(payload);
  const resultado=resultadoOperacionViaje(data);
  const viaje=resultado?.viaje||resultado;
  const id=viaje?.ID_VIAJE||viaje?.idViaje||payload.idViaje;
  if(!id)throw Error('El servidor no devolvió el ID del viaje. Consultá el estado antes de reintentar.');
  servicioEnInspeccion.idViaje=id;
  servicioEnInspeccion.localKey='';
  limpiarCacheAPI('listarViajes','listarAsignaciones','listarServicios','listarVehiculos');
  return {idViaje:id};
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
  if(identidad!==String(session?.idChofer))return false;
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
async function cerrarViajeLocal(cerrarRecorrido){
  const actual=servicioEnInspeccion;
  if(!actual?.localKey || !session)return false;
  const registros=await ColaViajes.todos();
  const r=registros.find(x=>!x.cierreConfirmado && x.key===actual.localKey &&
    String(x.payload?.idChofer)===String(session.idChofer));
  if(!r)return false;
  const km=parsearKilometraje($('finalKm')?.value);
  const a=$('inspectionAlert');
  if(km===null || km<Number(r.payload.kmInicial)){
    a.textContent='Ingresá un KM final igual o mayor al inicial.';a.style.display='block';return true;
  }
  try{
    const secretaria=r.payload.accion==='iniciarViajeSecretaria';
    await ColaViajes.cerrar(r.key,{accion:secretaria?'finalizarViajeSecretaria':'finalizarViaje',
      usuario:session.usuario,idChofer:session.idChofer,idVehiculo:r.payload.idVehiculo,
      idServicio:r.payload.idServicio||'',kmFinal:km,horaFin:new Date().toISOString(),
      finalizarRecorrido:cerrarRecorrido===true,
      ...(r.payload.idSolicitud?{idSolicitud:r.payload.idSolicitud,idAsignacionLocal:r.payload.idAsignacionLocal,
        tokenOrdenes:session.tokenOrdenes||r.payload.tokenOrdenes}:{})});
    // No declarar éxito ni abandonar la pantalla hasta confirmar el backend.
    await ColaViajes.procesar();
    actual.estado='FINALIZADO';actual.localKey='';
    limpiarCacheAPI('listarViajes','listarAsignaciones','listarServicios','listarVehiculos');
    volverInicioSinEsperar();
  }catch(e){a.textContent='El servidor todavía no confirmó el cierre. Volvé a intentar con conexión.';
    a.style.display='block';console.warn('Cierre anterior pendiente:',e);}
  return true;
}
window.addEventListener('load',()=>{
  if(session)lanzarEnvioLocal();
  navigator.serviceWorker?.addEventListener('message',ev=>{if(ev.data?.type==='VIAJE_LOCAL_ACTUALIZADO'){limpiarCacheAPI();actualizarIdViajeLocal(ev.data.registro);if(ev.data.registro.cierreConfirmado&&session&&$('inspectionScreen').classList.contains('hidden'))cargarDashboard({force:true}).catch(()=>{});}});
  setInterval(()=>{if(session&&navigator.onLine)lanzarEnvioLocal();},30000);
});
window.addEventListener('online',()=>{if(session)lanzarEnvioLocal();});
window.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)lanzarEnvioLocal();});

/* La pantalla avanza solamente después de confirmar la transacción local. */
let envioLocalEnCurso=null;
async function fetchConTiempo(url,options={}){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),45000);
  try{const response=await fetch(url,{...options,signal:c.signal});const body=await response.text();return {ok:response.ok,status:response.status,text:async()=>body};}
  catch(e){if(e.name==='AbortError')throw Error('La conexión está demorando. Volvé a intentar.');throw e;}finally{clearTimeout(timer);}
}
async function guardarInicioLocal(payload){
  let r;
  try{r=await ColaViajes.iniciar(payload,{...servicioEnInspeccion,kmInicial:payload.kmInicial,estado:'EN VIAJE'},esChoferSecretaria()?vehiculoSecretariaSeleccionado:null);}
  catch(e){throw Error('No se pudo guardar la salida en este celular. No cierres la pantalla; volvé a intentar.');}
  servicioEnInspeccion.localKey=r.key;
  mostrarEstadoLocal(r);
  // No esperar ninguna solicitud de red para liberar al chofer.
  lanzarEnvioLocal();
}
function mostrarEstadoLocal(r){
  if(String(r.payload.idChofer)!==String(session?.idChofer))return;
  const conflictoUnidad=/vehículo tiene un servicio en curso de otro chofer/i.test(String(r.error||''));
  const texto=conflictoUnidad?'Sin sincronizar: la unidad tiene otro servicio abierto. Avisá a Logística.':r.error?'Guardado en este celular · Pendiente de sincronizar. Si persiste, avisá a Logística.':r.cierreConfirmado?'Viaje finalizado · Sincronizado':r.cierre?'Viaje finalizado en este celular · Pendiente de sincronizar':r.inicioConfirmado?'En viaje · Sincronizado':'En viaje · Pendiente de sincronizar';
  mostrarAvisoOperacion(texto);
  if(servicioEnInspeccion?.localKey===r.key){
    if(r.idViaje)servicioEnInspeccion.idViaje=r.idViaje;
    const a=$('inspectionAlert');if(a){a.textContent=texto;a.style.display='block';}
  }
}
function lanzarEnvioLocal(){
  if(!envioLocalEnCurso){
    envioLocalEnCurso=ColaViajes.procesar(async r=>{
      if(!session)return;
      limpiarCacheAPI();mostrarEstadoLocal(r);
      if(r.cierreConfirmado && $('inspectionScreen').classList.contains('hidden'))cargarDashboard({force:true}).catch(()=>{});
    }).catch(e=>console.warn('Sincronización local pendiente:',e.message)).finally(()=>{envioLocalEnCurso=null;});
  }
  registrarServiceWorkerWeb().then(reg=>{if(reg?.sync) return reg.sync.register('chofer-viajes-v33');}).catch(()=>{});
}
async function recuperarViajeLocal(incluirConfirmado=false){
  if(!session?.idChofer)return false;
  const identidad=String(session.idChofer);
  let registros;try{registros=await ColaViajes.todos();}catch(e){return false;}
  if(identidad!==String(session?.idChofer))return false;
  const r=registros.filter(x=>String(x.payload.idChofer)===identidad&&!x.cierreConfirmado&&(incluirConfirmado||!x.inicioConfirmado||x.cierre)).sort((a,b)=>b.createdAt-a.createdAt)[0];
  if(!r)return false;
  $('dashboardScreen').classList.remove('hidden');
  if(!esChoferSecretaria()){
    const dominio=r.unidad?.DOMINIO||r.servicio?.dominio||r.payload.dominio||'';
    renderVehicle({dominio},r.unidad||r.servicio,{km:r.payload.kmInicial});
  }
  if(r.cierre){
    $('inspectionScreen').classList.add('hidden');$('serviceBox').classList.remove('hidden');
    $('serviceBox').innerHTML='<div class="empty"><strong>Viaje finalizado en este celular.</strong><br>El cierre está pendiente de sincronizar. La agenda se actualizará al confirmarse.</div>';
  }else{
    if(servicioEnInspeccion?.localKey===r.key&&!$('inspectionScreen').classList.contains('hidden')){mostrarEstadoLocal(r);return true;}
    servicioEnInspeccion={...r.servicio,localKey:r.key,idViaje:r.idViaje||r.payload.idViaje||'',estado:'EN VIAJE'};
    if(r.unidad)vehiculoSecretariaSeleccionado=r.unidad;
    window.__servicioActual=servicioEnInspeccion;
    $('serviceBox').classList.add('hidden');$('inspectionScreen').classList.remove('hidden');
    mostrarModoViajeActivo();
  }
  mostrarEstadoLocal(r);return true;
}
async function cerrarViajeLocal(cerrarRecorrido){
  const s=servicioEnInspeccion;if(!s||!session)return false;
  let r;try{r=(await ColaViajes.todos()).find(x=>!x.cierreConfirmado&&String(x.payload.idChofer)===String(session.idChofer)&&(x.key===s.localKey||(s.idViaje&&x.idViaje===s.idViaje)));}catch(e){if(s.localKey){mostrarAvisoOperacion('No se pudo leer el viaje guardado. Volvé a intentar.');return true;}return false;}
  if(!r)return false;
  const km=parsearKilometraje($('finalKm')?.value);
  if(km===null || km<Number(r.payload.kmInicial)){const a=$('inspectionAlert');a.textContent='Ingresá un KM final igual o mayor al inicial.';a.style.display='block';return true;}
  const secretaria=r.payload.accion==='iniciarViajeSecretaria';
  try{
    r=await ColaViajes.cerrar(r.key,{accion:secretaria?'finalizarViajeSecretaria':'finalizarViaje',usuario:session.usuario,idChofer:session.idChofer,idVehiculo:r.payload.idVehiculo,idServicio:r.payload.idServicio||'',kmFinal:km,horaFin:new Date().toISOString(),finalizarRecorrido:cerrarRecorrido===true,
      ...(r.payload.idSolicitud?{idSolicitud:r.payload.idSolicitud,idAsignacionLocal:r.payload.idAsignacionLocal,tokenOrdenes:session.tokenOrdenes||r.payload.tokenOrdenes}:{} )});
    s.estado='FINALIZADO';mostrarEstadoLocal(r);await recuperarViajeLocal();lanzarEnvioLocal();
  }catch(e){mostrarAvisoOperacion('No se pudo guardar el cierre en este celular. Volvé a intentar.');}
  return true;
}
window.addEventListener('load',()=>{
  if(session)lanzarEnvioLocal();
  navigator.serviceWorker?.addEventListener('message',ev=>{if(ev.data?.type==='VIAJE_LOCAL_ACTUALIZADO'){limpiarCacheAPI();mostrarEstadoLocal(ev.data.registro);if(ev.data.registro.cierreConfirmado&&session&&$('inspectionScreen').classList.contains('hidden'))cargarDashboard({force:true}).catch(()=>{});}});
  setInterval(()=>{if(session&&navigator.onLine)lanzarEnvioLocal();},30000);
});
window.addEventListener('online',()=>{if(session)lanzarEnvioLocal();});
window.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)lanzarEnvioLocal();});

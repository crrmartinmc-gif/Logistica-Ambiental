/* La vigencia siempre se consulta al servidor; no se confirman fotos desde caché local. */
let estadoRecorridoServidor=null;
let inspeccionReutilizable=null;
let consultaInspeccionActual=0;
let bloqueoOtroServicio=false;
function recSesionActual(){return String(session?.usuario||'')+'|'+String(session?.idChofer||'');}
function recPuedeReutilizar(){
  const r=inspeccionReutilizable;
  return !!r && String(r.ID_CHOFER)===String(session?.idChofer) && String(r.ID_VEHICULO)===String(servicioEnInspeccion?.idUnidad) && r.DIA===hoyArgentinaISO() && r.ESTADO==='ABIERTO';
}
async function consultarRecorridoActual(idVehiculo=''){
  if(!session?.idChofer||!session?.usuario)return null;
  const sesion=recSesionActual();
  const r=await getJson('estadoRecorridoChofer',{usuario:session.usuario,idChofer:session.idChofer,...(idVehiculo?{idVehiculo}:{})},{force:true});
  if(sesion!==recSesionActual())return null;
  if(r.versionRecorridos!==1)throw new Error('No se pudo verificar la inspección del recorrido.');
  estadoRecorridoServidor=r;dibujarEstadoRecorrido();return r;
}
function dibujarEstadoRecorrido(){
  const box=$('recorridoActualBox');if(!box)return;
  const r=estadoRecorridoServidor?.recorrido;
  if(!r || r.DIA!==hoyArgentinaISO() || String(r.ID_CHOFER)!==String(session?.idChofer)){box.classList.add('hidden');return;}
  box.classList.remove('hidden');
  const activo=!!estadoRecorridoServidor.viajeActivo;
  box.innerHTML='<div class="card-title"><div><div class="eyebrow">Recorrido de hoy</div><h2>'+escapeHtml(r.DOMINIO||'Unidad')+'</h2></div></div><p>La inspección inicial respalda los servicios con esta unidad hasta que finalices el recorrido o cambies de vehículo.</p><button type="button" class="secondary" id="cerrarRecorridoBtn" onclick="cerrarRecorridoActual()" '+(activo?'disabled':'')+'>FINALIZAR RECORRIDO</button>'+(activo?'<p style="font-size:12px">Finalizá el servicio en curso para cerrar el recorrido.</p>':'');
}
function restablecerPreparacionRecorrido(){
  inspeccionReutilizable=null;bloqueoOtroServicio=false;consultaInspeccionActual++;
  document.querySelectorAll('#inspectionScreen .check-section').forEach(s=>s.classList.remove('hidden'));
  const actions=document.querySelector('#inspectionScreen .inspection-actions');
  if(actions)actions.innerHTML='<button class="secondary" type="button" onclick="volverServicio()">VOLVER</button><button class="primary" type="button" id="finishInspectionBtn" onclick="iniciarViaje()" disabled>▶ INICIAR VIAJE</button>';
  const h=document.querySelector('#inspectionScreen .inspection-head h2');if(h)h.textContent='Preparar salida';
  document.querySelector('#inspectionScreen .vehicle-control-section')?.classList.remove('hidden');
}
async function verificarInspeccionRecorrido(){
  const consulta=++consultaInspeccionActual,idVehiculo=servicioEnInspeccion?.idUnidad,idServicio=servicioEnInspeccion?.idServicio||'',sesion=recSesionActual();
  inspeccionReutilizable=null;bloqueoOtroServicio=false;
  try{
    const r=await consultarRecorridoActual(idVehiculo);
    if(!r||consulta!==consultaInspeccionActual||sesion!==recSesionActual()||String(servicioEnInspeccion?.idUnidad)!==String(idVehiculo))return;
    if(['EN VIAJE','EN CURSO','ACTIVO','INICIADO'].includes(String(servicioEnInspeccion?.estado||'').toUpperCase()))return;
    bloqueoOtroServicio=!!r.viajeActivo && (String(r.viajeActivo.ID_SERVICIO||'')!==String(idServicio)||!idServicio);
    if(r.reutilizable)inspeccionReutilizable=r.recorrido;
    document.querySelector('#inspectionScreen .check-section')?.classList.toggle('hidden',recPuedeReutilizar());
    actualizarEstadoInicio();
  }catch(e){console.warn('Inspección sin verificar:',e.message);/* Ante error se mantienen las cuatro fotos obligatorias. */}
}
async function cerrarRecorridoActual(){
  const r=estadoRecorridoServidor?.recorrido,btn=$('cerrarRecorridoBtn');
  if(!r||!session?.idChofer)return;
  if(btn){btn.disabled=true;btn.textContent='CERRANDO RECORRIDO…';}
  try{
    const respuesta=await postJson({accion:'finalizarRecorridoChofer',usuario:session.usuario,idChofer:session.idChofer,idRecorrido:r.ID_RECORRIDO});
    const datos=resultadoOperacionViaje(respuesta);
    if(respuesta?.ok!==true||datos?.ok===false||datos?.recorrido?.ESTADO!=='CERRADO')throw new Error(respuesta?.error||datos?.error||'El servidor no confirmó el cierre del recorrido.');
    inspeccionReutilizable=null;estadoRecorridoServidor=null;$('recorridoActualBox')?.classList.add('hidden');
    mostrarAvisoOperacion('✅ Recorrido finalizado. La próxima salida requerirá cuatro fotos nuevas.');
    await consultarRecorridoActual();
  }catch(e){mostrarAvisoOperacion('No se pudo cerrar el recorrido: '+e.message,true);if(btn){btn.disabled=false;btn.textContent='FINALIZAR RECORRIDO';}}
}
function invalidarInspeccionReutilizada(error){
  if(!/inspección.*vigente|cuatro fotos.*recorrido/i.test(String(error?.message||'')))return;
  inspeccionReutilizable=null;document.querySelector('#inspectionScreen .check-section')?.classList.remove('hidden');actualizarEstadoInicio();
}

async function finalizarViaje(cerrarRecorrido=false){
  if(window.__cerrandoRecorridoOperacion)return;
  window.__cerrandoRecorridoOperacion=true;
  const botones=[...document.querySelectorAll('#inspectionScreen .inspection-actions button')];
  botones.forEach(b=>b.disabled=true);
  try{return await finalizarViajeInterno(cerrarRecorrido===true);}
  finally{window.__cerrandoRecorridoOperacion=false;botones.forEach(b=>{if(b.isConnected)b.disabled=false;});}
}

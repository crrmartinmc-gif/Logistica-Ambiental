/* Fase 5B.1. Órdenes confirmadas de APPSECRETARIA para CHOFER_SECRETARIA.
 * El viaje independiente y las fotos/KM NO cambian en esta etapa.
 */
(function(){
'use strict';
if(window.__ORDENES_SECRETARIA_F5B__)return;window.__ORDENES_SECRETARIA_F5B__=true;
const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let consultando=false,aceptando=false,preparando=false,ultimoId='',ultimasOrdenes=[];
function seccion(){
  const service=document.getElementById('serviceBox');
  if(!service)return null;
  let box=document.getElementById('ordenesSecretariaBox');
  if(!box){
    box=document.createElement('section');box.id='ordenesSecretariaBox';box.className='ordenes-secretaria-box';
    service.parentElement.insertBefore(box,service);
    box.addEventListener('click',accion);
  }
  return box;
}
function nota(texto){
  const n=document.getElementById('ordenesSecretariaNotice');
  if(n)n.textContent=texto;
}
async function pintar(){
  if(!session || typeof esChoferSecretaria!=='function' || !esChoferSecretaria())return;
  const box=seccion();if(!box||consultando)return;
  const identidad=String(session.idChofer||'');
  box.innerHTML='<div class="ord-sec-head"><h3>📋 Mis traslados asignados</h3><button type="button" id="ordenesSecretariaRefresh">Actualizar</button></div>'
    +'<div id="ordenesSecretariaNotice" class="ord-sec-note" aria-live="polite">Consultando órdenes…</div>'
    +'<div id="ordenesSecretariaLista"></div>';
  box.querySelector('#ordenesSecretariaRefresh').onclick=pintar;
  if(!session.tokenOrdenes){
    nota(session.errorOrdenes||'Para recibir órdenes, cerrá sesión y volvé a ingresar con tu usuario de Secretaría.');
    return;
  }
  consultando=true;
  try{
    const res=await postJson({accion:'listarOrdenesSecretaria',tokenOrdenes:session.tokenOrdenes});
    const data=res?.resultado||res;
    if(!data?.ok||!Array.isArray(data.items))throw Error(data?.error||'Respuesta inválida de órdenes.');
    if(String(session?.idChofer||'')!==identidad)return;
    ultimoId=identidad;
    const lista=data.items;
    ultimasOrdenes=lista;
    nota(lista.length ? 'Solo aparecen los traslados confirmados que Secretaría te asignó.' :
      'Por ahora no tenés traslados confirmados para los próximos 7 días.');
    box.querySelector('#ordenesSecretariaLista').innerHTML=lista.map(o=>{
      const estado=String(o.estado||'').toUpperCase();
      const aceptada=estado==='ACEPTADA',enCurso=estado==='EN_CURSO',finalizada=estado==='FINALIZADA';
      const horario=Date.parse(String(o.fecha||'')+'T'+String(o.hora||'00:00').slice(0,5)+':00-03:00');
      const demasiadoPronto=Number.isFinite(horario)&&Date.now()<horario-90*60000;
      const vencida=Number.isFinite(horario)&&Date.now()>horario+24*60*60000;
      const listo=aceptada&&!demasiadoPronto&&!vencida;
      const leyenda=finalizada?'✓ FINALIZADO':enCurso?'🚐 EN VIAJE':aceptada?'✓ ACEPTADO':'PENDIENTE DE TU CONFIRMACIÓN';
      return '<div class="ord-sec-card"><div class="ord-sec-title">'+clean(o.origen)+' → '+clean(o.destino)+'</div>'
      +'<div class="ord-sec-detail">'+clean(o.fecha)+' · '+clean(o.hora)+' · '+Number(o.pasajeros||0)+' pasajero(s) · '+Number(o.duracion||0)+' min</div>'
      +'<div class="ord-sec-detail">Vehículo asignado: <strong>'+clean(o.dominio)+' · '+clean(o.interno)+'</strong></div>'
      +'<div class="ord-sec-bottom"><span class="ord-sec-status">'+leyenda+'</span>'
      +(listo?'<button type="button" class="ord-sec-start" data-id="'+clean(o.id)+'">▶ Iniciar traslado</button>':'')
      +(!aceptada&&!enCurso&&!finalizada?'<button type="button" class="ord-sec-accept" data-id="'+clean(o.id)+'">Aceptar traslado</button>':'')
      +(aceptada&&demasiadoPronto?'<small>Podés iniciar hasta 90 minutos antes del horario programado.</small>':'')
      +(aceptada&&vencida?'<small>Consultá a Secretaría: la ventana de inicio finalizó.</small>':'')
      +'</div></div>';
    }).join('');
  }catch(err){
    nota('No se pudieron consultar las órdenes: '+(err?.message||String(err))+
      '. Los viajes habituales siguen disponibles.');
  }finally{consultando=false}
}
async function accion(event){
  const start=event.target.closest('.ord-sec-start');
  if(start){
    if(preparando||!session?.tokenOrdenes)return;
    preparando=true;start.disabled=true;
    try{await prepararTraslado(start.dataset.id);}
    catch(err){nota('No se pudo preparar el traslado: '+(err?.message||String(err)));start.disabled=false}
    finally{preparando=false}
    return;
  }
  const btn=event.target.closest('.ord-sec-accept');
  if(!btn||aceptando||!session?.tokenOrdenes)return;
  const id=btn.dataset.id;
  if(!id||!confirm('¿Confirmás que podés realizar este traslado de Secretaría?'))return;
  aceptando=true;btn.disabled=true;nota('Registrando aceptación…');
  try{
    const res=await postJson({accion:'aceptarOrdenSecretaria',tokenOrdenes:session.tokenOrdenes,idSolicitud:id});
    const data=res?.resultado||res;
    if(!data?.ok||data.estado!=='ACEPTADA')throw Error(data?.error||'No se confirmó la aceptación.');
    nota('¡Traslado aceptado correctamente!');await pintar();
  }catch(err){nota('No se pudo aceptar: '+(err?.message||String(err)));btn.disabled=false}
  finally{aceptando=false}
}
async function prepararTraslado(id){
  if(!session||!esChoferSecretaria())throw Error('Ingresá con tu usuario de Secretaría.');
  const orden=ultimasOrdenes.find(x=>String(x.id)===String(id));
  if(!orden||String(orden.estado).toUpperCase()!=='ACEPTADA')throw Error('Primero aceptá esta orden.');
  if(viajeSecretariaActivo||await recuperarViajeLocal(true))
    throw Error('Ya hay un viaje abierto o pendiente de sincronizar. Terminá ese viaje primero.');
  const unidad=(window.__vehiculosSecretaria||[]).find(x=>String(x.ID_VEHICULO)===String(orden.idVehiculo));
  if(!unidad)throw Error('El vehículo de la orden no figura habilitado. Consultá a Secretaría.');
  if(!confirm('¿Preparar traslado '+orden.origen+' → '+orden.destino+' con '+orden.dominio+'?'))return;
  seleccionarVehiculoSecretaria(orden.idVehiculo);
  if(String(servicioEnInspeccion?.idUnidad)!==String(orden.idVehiculo))
    throw Error('No se pudo seleccionar el vehículo asignado.');
  window.__ordenSecretariaEnPreparacion={...orden,idChofer:String(session.idChofer)};
  servicioEnInspeccion.idSolicitud=orden.id;
  servicioEnInspeccion.idAsignacionLocal=orden.idAsignacion;
  $('inspectionServiceLabel').textContent=orden.origen+' → '+orden.destino+' · '+orden.dominio;
  const box=document.getElementById('ordenesSecretariaBox');
  if(box)box.style.display='none';
  window.scrollTo({top:0,behavior:'smooth'});
}
window.ordenesSecretariaOrdenActiva=function(){
  const id=String(servicioEnInspeccion?.idSolicitud||'').trim();
  if(!id||!session||!esChoferSecretaria())return null;
  const local=window.__ordenSecretariaEnPreparacion;
  if(local && String(local.id)===id && String(local.idChofer)===String(session.idChofer))return local;
  return ultimasOrdenes.find(x=>String(x.id)===id &&
    String(x.idVehiculo)===String(servicioEnInspeccion?.idUnidad||''))||
    {id,idAsignacion:servicioEnInspeccion?.idAsignacionLocal,
     idVehiculo:servicioEnInspeccion?.idUnidad};
};
window.ordenesSecretariaPorViaje=function(idViaje){
  return ultimasOrdenes.find(o=>String(o.idViaje||'')===String(idViaje||'')&&!!idViaje)||null;
};
window.ordenesSecretariaActualizarCola=async function(){
  if(!session?.tokenOrdenes||typeof ColaViajes==='undefined')return;
  const lista=await ColaViajes.todos();
  for(const item of lista){
    if(item.cierreConfirmado||!item.payload?.idSolicitud||
      String(item.payload?.idChofer)!==String(session.idChofer))continue;
    await ColaViajes.editar(item.key,r=>r?{
      ...r,payload:{...r.payload,tokenOrdenes:session.tokenOrdenes},
      cierre:r.cierre?{...r.cierre,tokenOrdenes:session.tokenOrdenes}:null
    }:r);
  }
};

window.ordenesSecretariaRender=function(){pintar().catch(err=>console.warn('Órdenes de Secretaría:',err))};
window.ordenesSecretariaLogin=async function(usuario,password){
  try{
    const res=await postJson({accion:'loginOrdenSecretaria',usuario,contrasena:password});
    const data=res?.resultado||res;
    if(!data?.ok||!data.token)throw Error(data?.error||'No se pudo abrir la sesión de órdenes.');
    return {tokenOrdenes:data.token,errorOrdenes:''};
  }catch(err){return {tokenOrdenes:'',errorOrdenes:'Órdenes no disponibles: '+(err?.message||String(err))}}
};
})();
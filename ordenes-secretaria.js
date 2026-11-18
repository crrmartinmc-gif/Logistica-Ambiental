/* Fase 5B.1. Órdenes confirmadas de APPSECRETARIA para CHOFER_SECRETARIA.
 * El viaje independiente y las fotos/KM NO cambian en esta etapa.
 */
(function(){
'use strict';
if(window.__ORDENES_SECRETARIA_F5B__)return;window.__ORDENES_SECRETARIA_F5B__=true;
const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let consultando=false,aceptando=false,ultimoId='';
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
  if(!window.session || !window.esChoferSecretaria?.())return;
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
    nota(lista.length ? 'Solo aparecen los traslados confirmados que Secretaría te asignó.' :
      'Por ahora no tenés traslados confirmados para los próximos 7 días.');
    box.querySelector('#ordenesSecretariaLista').innerHTML=lista.map(o=>{
      const aceptada=String(o.estado).toUpperCase()==='ACEPTADA';
      return '<div class="ord-sec-card"><div class="ord-sec-title">'+clean(o.origen)+' → '+clean(o.destino)+'</div>'
      +'<div class="ord-sec-detail">'+clean(o.fecha)+' · '+clean(o.hora)+' · '+Number(o.pasajeros||0)+' pasajero(s) · '+Number(o.duracion||0)+' min</div>'
      +'<div class="ord-sec-detail">Vehículo asignado: <strong>'+clean(o.dominio)+' · '+clean(o.interno)+'</strong></div>'
      +'<div class="ord-sec-bottom"><span class="ord-sec-status">'+(aceptada?'✓ ACEPTADA':'PENDIENTE DE TU CONFIRMACIÓN')+'</span>'
      +(aceptada?'':'<button type="button" class="ord-sec-accept" data-id="'+clean(o.id)+'">Aceptar traslado</button>')
      +'</div></div>';
    }).join('');
  }catch(err){
    nota('No se pudieron consultar las órdenes: '+(err?.message||String(err))+
      '. Los viajes habituales siguen disponibles.');
  }finally{consultando=false}
}
async function accion(event){
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
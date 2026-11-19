/* Impide iniciar nuevos viajes de Secretaría sin una orden aceptada.
   No afecta fotos, kilometrajes, cierres ni las salidas generales de Logística. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const index=fs.readFileSync('index.html','utf8'),
      orders=fs.readFileSync('ordenes-secretaria.js','utf8'),
      worker=fs.readFileSync('service-worker.js','utf8');
let n=0;const ok=(test,message)=>{assert.ok(test,message);n++};
const header=index.indexOf('function seleccionarVehiculoSecretaria(id){');
const trailer=index.indexOf('async function continuarViajeSecretaria()',header);
ok(header!==-1&&trailer>header,'existe selector de vehículos de Secretaría');
const selector=index.slice(header,trailer);
ok(selector.includes('window.__ordenSecretariaEnPreparacion'),'selección solo a partir de orden preparada');
ok(selector.includes('String(orden.idVehiculo)!==String(id)'),'obliga mismo vehículo asignado');
ok(selector.includes("String(orden.estado||'').toUpperCase()!=='ACEPTADA'"),'exige orden aceptada');
const state={auth:true,token:'token-valido',chofer:'chofer-1',orden:null};
let llamadas=0,avisos=0;
const ctx={
  window:{__ordenSecretariaEnPreparacion:null},
  session:{tokenOrdenes:state.token,idChofer:state.chofer},
  String,
  esChoferSecretaria:()=>state.auth,
  mostrarAvisoOperacion:()=>{avisos++;},
  restablecerPreparacionRecorrido:()=>{llamadas++;throw Error('SELECTOR_AUTORIZADO')},
};
vm.createContext(ctx);vm.runInContext(selector,ctx);
const probar=(orden,id,autorizar)=>{
  ctx.window.__ordenSecretariaEnPreparacion=orden;
  let permitida=false;
  try{ctx.seleccionarVehiculoSecretaria(id)}catch(e){
    if(e.message!=='SELECTOR_AUTORIZADO')throw e;
    permitida=true;
  }
  ok(permitida===autorizar,'validación de selección '+String(id)+', permiso '+autorizar);
};
probar(null,'veh-1',false);
probar({idVehiculo:'veh-2',idChofer:'chofer-1',estado:'ACEPTADA'},'veh-1',false);
probar({idVehiculo:'veh-1',idChofer:'chofer-2',estado:'ACEPTADA'},'veh-1',false);
probar({idVehiculo:'veh-1',idChofer:'chofer-1',estado:'CONFIRMADA'},'veh-1',false);
state.auth=false;probar({idVehiculo:'veh-1',idChofer:'chofer-1',estado:'ACEPTADA'},'veh-1',false);state.auth=true;
ctx.session.tokenOrdenes='';probar({idVehiculo:'veh-1',idChofer:'chofer-1',estado:'ACEPTADA'},'veh-1',false);
ctx.session.tokenOrdenes='token-valido';
probar({idVehiculo:'veh-1',idChofer:'chofer-1',estado:'ACEPTADA'},'veh-1',true);
ok(llamadas===1,'no prepara inspección sin orden');
ok(avisos===6,'informa bloqueo al chofer');
ok(!index.includes('UNIDADES DISPONIBLES'),'no aparece la lista de vehículos en Secretaría');
ok(selector.includes('DOMINIO:dominioUnidad(orden.dominio)'),'la patente se toma de la orden');
const bodyIndex=index.indexOf('async function iniciarViajeSecretaria(){');
const nextIndex=index.indexOf('async function finalizarViajeSecretaria(',bodyIndex);
const start=index.slice(bodyIndex,nextIndex);
ok(start.includes('if(!orden || !orden.id || !orden.idAsignacion || !session?.tokenOrdenes'),'inicio requiere ID de solicitud, asignación y token');
ok(start.indexOf('if(!orden ||')<start.indexOf('await guardarInicioLocal('),'no crea inicio local sin asignación');
ok(start.includes('idSolicitud:orden.id,idAsignacionLocal:orden.idAsignacion,tokenOrdenes:session.tokenOrdenes'),'se envía ID de orden aceptada');
ok(index.includes('async function finalizarViajeSecretaria('),'no se modifica cierre de viajes previos');
ok(index.includes('if(esChoferSecretaria()) return iniciarViajeSecretaria();'),'restricción aislada a Secretaría');
ok(orders.includes('window.__ordenSecretariaEnPreparacion={...orden,idChofer:String(session.idChofer)};'),'marca orden validada');
ok(orders.indexOf('window.__ordenSecretariaEnPreparacion={...orden')<orders.indexOf('seleccionarVehiculoSecretaria(orden.idVehiculo);'),'preparación autorizada ANTES de seleccionar unidad');
ok(orders.includes("String(orden.estado).toUpperCase()!=='ACEPTADA'"),'ordenes tienen estado aceptado');
ok(worker.includes("APP_CACHE='chofer-interfaz-v38'"),'PWA cambia versión de cache para no ofrecer inicio libre');
ok(worker.includes("'./ordenes-secretaria.js?v=5'"),'cachea módulo correcto');
console.log('OK '+n+' controles aislados de App Choferes: solo iniciar con orden aceptada.');

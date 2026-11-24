const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('recorridos-chofer.js','utf8'),html=fs.readFileSync('index.html','utf8');
function fixture(get,secretaria=false){
 const nodes=new Map(),classes=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
 const element=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',style:{},classList:classes(),textContent:'',innerHTML:'',disabled:false});return nodes.get(id);};
 const $=id=>id==='reintentarInspeccionSecretaria'?null:element(id);
 const c={session:{usuario:'chofer',idChofer:'C1'},servicioEnInspeccion:{idUnidad:'V1',idServicio:'S2',estado:'PENDIENTE'},esChoferSecretaria:()=>secretaria,hoyArgentinaISO:()=> '2026-11-13',$,document:{querySelector:()=>({classList:classes()}),querySelectorAll:()=>[]},getJson:get,console:{warn(){}},escapeHtml:String,resultadoOperacionViaje:x=>x.resultado||x,mostrarAvisoOperacion:()=>{},contarFotosSalida:()=>0,parsearKilometraje:v=>v===''?null:Number(v)};
 vm.createContext(c);vm.runInContext(script,c);
 const a=html.indexOf('function actualizarEstadoInicio(){'),b=html.indexOf('function parsearKilometraje(',a);vm.runInContext(html.slice(a,b),c);
 return {c,element};
}
const response={ok:true,versionRecorridos:1,recorrido:{ID_RECORRIDO:'R1',ID_INSPECCION:'I1',ID_CHOFER:'C1',ID_VEHICULO:'V1',DIA:'2026-11-13',ESTADO:'ABIERTO'},reutilizable:true,viajeActivo:null};
test('Logística y Reserva requieren cuatro fotos aunque el recorrido tenga una inspección anterior',async()=>{
 const {c,element}=fixture(async()=>response);
 await c.verificarInspeccionRecorrido();
 element('currentKm').value='120';
 c.actualizarEstadoInicio();
 assert.equal(c.recPuedeReutilizar(),false);
 assert.equal(element('finishInspectionBtn').disabled,true);
 c.contarFotosSalida=()=>4;
 c.actualizarEstadoInicio();
 assert.equal(element('finishInspectionBtn').disabled,false);
});
test('Secretaría conserva la inspección vigente y exige kilometraje',async()=>{
 const {c,element}=fixture(async()=>response,true);
 await c.verificarInspeccionRecorrido();
 assert.equal(c.recPuedeReutilizar(),true);
 assert.equal(element('finishInspectionBtn').disabled,true);
 element('currentKm').value='120';
 c.actualizarEstadoInicio();
 assert.equal(element('finishInspectionBtn').disabled,false);
 assert.match(element('inspectionStatus').textContent,/Fotos ya registradas/);
});
test('sin confirmación del servidor se mantienen las cuatro fotos obligatorias',async()=>{const {c,element}=fixture(async()=>{throw Error('sin red');});await c.verificarInspeccionRecorrido();element('currentKm').value='120';c.actualizarEstadoInicio();assert.equal(c.recPuedeReutilizar(),false);assert.equal(element('finishInspectionBtn').disabled,true);});
test('una consulta tardía no habilita la inspección de otro vehículo',async()=>{let release;const {c}=fixture(()=>new Promise(r=>release=r),true);const task=c.verificarInspeccionRecorrido();c.servicioEnInspeccion.idUnidad='V2';release(response);await task;assert.equal(c.recPuedeReutilizar(),false);});
test('otro servicio activo mantiene deshabilitado el nuevo inicio',async()=>{const {c,element}=fixture(async()=>({...response,viajeActivo:{ID_SERVICIO:'S1'}}));await c.verificarInspeccionRecorrido();element('currentKm').value='120';c.actualizarEstadoInicio();assert.equal(element('finishInspectionBtn').disabled,true);assert.match(element('inspectionStatus').textContent,/otro servicio/);});
test('cambiar de día invalida la inspección de Secretaría aunque siga en memoria',async()=>{const {c}=fixture(async()=>response,true);await c.verificarInspeccionRecorrido();c.hoyArgentinaISO=()=> '2026-11-14';assert.equal(c.recPuedeReutilizar(),false);});
test('el cierre total conserva la intención en los payloads en segundo plano',()=>{assert.match(html,/accion:'finalizarViaje',finalizarRecorrido:cerrarRecorrido===true/);assert.match(html,/accion:'finalizarViajeSecretaria',finalizarRecorrido:cerrarRecorrido===true/);assert.match(html,/FINALIZAR SERVICIO Y RECORRIDO/);});
test('viaje ya en curso no cambia automáticamente a una pantalla que exige fotos',async()=>{const {c,element}=fixture(async()=>({...response,reutilizable:false,recorrido:null,viajeActivo:{ID_VIAJE:'VIA-PANEL',ID_SERVICIO:'S2',ID_VEHICULO:'V1',inspeccionCompleta:false}}));c.servicioEnInspeccion.estado='EN VIAJE';element('finishInspectionBtn').disabled=false;await c.verificarFotosDeViajeActivo();assert.equal(c.servicioEnInspeccion.completandoInspeccion,undefined);assert.equal(element('finishInspectionBtn').disabled,false);});

test('recupera un viaje iniciado desde el Panel mientras la app muestra la preparación',async()=>{
 const activo={ID_VIAJE:'VIA-PANEL',ID_SERVICIO:'S2',ID_ASIGNACION:'A2',ID_VEHICULO:'V1',KM_INICIAL:60007};
 const {c}=fixture(async()=>({...response,viajeActivo:activo}));
 c.servicioEnInspeccion.idAsignacion='A2';
 let inicio;
 c.aplicarInicioConfirmado=(servicio,confirmacion)=>{inicio=confirmacion;};
 await c.verificarInspeccionRecorrido();
 assert.equal(inicio.idViaje,'VIA-PANEL');
 assert.equal(inicio.kmInicial,60007);
});

test('la recuperación compara servicio, asignación y unidad',()=>{
 const {c}=fixture(async()=>response);
 const servicio={idServicio:'S2',idAsignacion:'A2',idUnidad:'V1'};
 const activo={ID_VIAJE:'VIA-PANEL',ID_SERVICIO:'S2',ID_ASIGNACION:'A2',ID_VEHICULO:'V1'};
 assert.equal(c.recViajeCoincideConServicio(activo,servicio),true);
 assert.equal(c.recViajeCoincideConServicio({...activo,ID_ASIGNACION:'OTRA'},servicio),false);
 assert.equal(c.recViajeCoincideConServicio({...activo,ID_VEHICULO:'V2'},servicio),false);
});

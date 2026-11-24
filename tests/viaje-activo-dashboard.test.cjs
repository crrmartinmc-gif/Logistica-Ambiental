const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const codigo=html.slice(html.indexOf('async function cargarDashboard('),html.indexOf('function iniciarActualizacionAutomatica('));
const estado=html.slice(html.indexOf('function esViajeActivo('),html.indexOf('async function verServicio('));
const fecha=html.slice(html.indexOf('function fechaArgentinaISO('),html.indexOf('function hoyArgentinaISO('));
const dia='2026-11-24';

function fixture(estadoViaje){
  const data={
    listarServicios:{servicios:[
      {ID_SERVICIO:'S1',FECHA:'24/11/2026',NOMBRE_SERVICIO:'Primer servicio',ESTADO:estadoViaje==='EN CURSO'?'EN CURSO':'FINALIZADO'},
      {ID_SERVICIO:'S2',FECHA:dia,NOMBRE_SERVICIO:'Siguiente servicio',ESTADO:'PENDIENTE'}
    ]},
    listarAsignaciones:{asignaciones:[
      {ID_SERVICIO:'S1',ID_ASIGNACION:'A1',ID_VEHICULO:'UN1',ID_CHOFER:'C1',ESTADO:'FINALIZADA',FECHA:dia},
      {ID_SERVICIO:'S2',ID_ASIGNACION:'A2',ID_VEHICULO:'UN2',ID_CHOFER:'C1',ESTADO:'ACTIVA',FECHA:dia}
    ]},
    listarViajes:{viajes:[
      {ID_VIAJE:'V1',ID_SERVICIO:'S1',ID_ASIGNACION:'A1',ID_VEHICULO:'UN1',ID_CHOFER:'C1',
        ESTADO:estadoViaje,HORA_INICIO:dia+'T14:00:00Z',KM_INICIAL:100},
      {ID_VIAJE:'SEC1',ID_CHOFER:'C1',ESTADO:'EN CURSO',HORA_INICIO:dia+'T15:00:00Z'}
    ]},
    listarVehiculos:{vehiculos:[{ID_VEHICULO:'UN1',DOMINIO:'TEST01'},{ID_VEHICULO:'UN2',DOMINIO:'TEST02'}]},
    rutas:{rutas:[]}
  };
  let servicio;
  const context=vm.createContext({session:{idChofer:'C1'},dashboardCargando:false,console,
    getJson:async a=>data[a],hoyArgentinaISO:()=>dia,mananaArgentinaISO:()=> '2026-11-25',
    renderService:s=>{servicio=s;},renderVehicle(){},$:()=>({})});
  vm.runInContext(codigo+estado+fecha,context);
  return {c:context,verServicio:()=>servicio};
}

test('el viaje de una asignación cerrada se puede recuperar antes del siguiente servicio',async()=>{
  const {c,verServicio}=fixture('EN CURSO');
  await c.cargarDashboard();
  const viaje=verServicio();
  assert.equal(viaje.estado,'EN VIAJE');
  assert.equal(viaje.idViaje,'V1');
  assert.equal(viaje.idUnidad,'UN1');
  assert.equal(viaje.kmInicial,100);
});

test('la agenda muestra el siguiente servicio después del cierre',async()=>{
  const {c,verServicio}=fixture('FINALIZADO');
  await c.cargarDashboard({force:true});
  const servicio=verServicio();
  assert.equal(servicio.idServicio,'S2');
  assert.equal(servicio.idAsignacion,'A2');
  assert.equal(servicio.estado,'PENDIENTE');
});

test('la fecha de las hojas mantiene la jornada de Buenos Aires',()=>{
  const {c}=fixture('EN CURSO');
  assert.equal(c.fechaArgentinaISO('24/11/2026'),dia);
  assert.equal(c.fechaArgentinaISO('2026-11-25T01:00:00Z'),dia);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fixture(rol='CHOFER'){
 let nodo={textContent:'error anterior visible',dataset:{},remove(){nodo=null;}},created=0;
 const c={session:{rol},console:{warn(){}},$:()=>nodo,document:{createElement:()=>{created++;nodo={setAttribute(){},style:{},dataset:{}};return nodo;},querySelector:()=>({after(){}})}};
 vm.createContext(c);const a=html.indexOf('function puedeVerDiagnosticosOperacion()'),b=html.indexOf('async function intentarEnviarOperacionDirecta(',a);vm.runInContext(html.slice(a,b),c);
 return {c,nodo:()=>nodo,created:()=>created};
}
const error='DriveApp.getFolderById: No tienes permiso. https://www.googleapis.com/auth/drive SALIDA_FRENTE SALIDA_TRASERA';
test('chofer no ve banner técnico al continuar ni en reintentos y retira uno anterior',()=>{for(const rol of ['CHOFER','CHOFER_SECRETARIA','ADMIN_KM_REPORTES']){const f=fixture(rol);f.c.mostrarAvisoOperacion(error,true);assert.equal(f.nodo(),null);assert.equal(f.created(),0);}});
test('fallo de envío conserva estado sin confirmar y no expone permisos, rutas o excepciones',()=>{const f=fixture();for(const accion of ['salida','cierre','reporte']){const m=f.c.mensajeErrorOperacion(new Error(error),accion);assert.doesNotMatch(m,/DriveApp|googleapis|permiso|SALIDA_/);assert.match(m,/confirm/);}});
test('kilometraje inválido conserva instrucción útil al chofer',()=>{assert.match(fixture().c.mensajeErrorOperacion(new Error('KM_FINAL no puede ser menor que el KM actual del vehículo (73330 km).'),'cierre'),/kilometraje/);});
test('administrador conserva acceso a detalles técnicos',()=>{const f=fixture('ADMINISTRADOR');f.c.mostrarAvisoOperacion(error,true);assert.equal(f.nodo().textContent,error);assert.equal(f.c.mensajeErrorOperacion(new Error(error),'salida'),error);});
test('confirmación real de éxito sigue visible al chofer',()=>{const f=fixture();f.c.mostrarAvisoOperacion('Viaje finalizado y confirmado.',false);assert.match(f.nodo().textContent,/confirmado/);});

test('la sincronización actualiza el viaje sin generar carteles ni pisar el aviso de kilometraje', () => {
  const inspectionAlert = { textContent: 'Ingresá un KM final igual o mayor al inicial.', style: { display: 'block' } };
  const context = vm.createContext({
    session: { idChofer: 'C1' },
    servicioEnInspeccion: { localKey: 'ASIG-A1', estado: 'EN VIAJE' },
    window: { addEventListener() {} },
    $: () => inspectionAlert,
    mostrarAvisoOperacion: () => assert.fail('El envío en segundo plano no debe mostrar un cartel')
  });
  vm.runInContext(fs.readFileSync('viajes-locales.js', 'utf8'), context);
  const viaje = { key: 'ASIG-A1', payload: { idChofer: 'C1' } };
  context.actualizarIdViajeLocal({ ...viaje, error: 'Servidor sin conexión' });
  context.actualizarIdViajeLocal({ ...viaje, idViaje: 'VIA-1', inicioConfirmado: true });
  assert.equal(context.servicioEnInspeccion.idViaje, 'VIA-1');
  assert.equal(context.servicioEnInspeccion.estado, 'EN VIAJE');
  assert.equal(inspectionAlert.textContent, 'Ingresá un KM final igual o mayor al inicial.');
  assert.equal(inspectionAlert.style.display, 'block');
});

test('un cierre guardado devuelve al chofer a la agenda aunque el envío siga pendiente', async () => {
  const servicio = { localKey: 'ASIG-A1', estado: 'EN VIAJE' };
  let registro = { key: servicio.localKey, payload: { idChofer: 'C1', kmInicial: 100 } };
  const serviceBox = {};
  let volvio = false;
  const context = vm.createContext({
    servicioEnInspeccion: servicio,
    session: { idChofer: 'C1' },
    window: { addEventListener() {} },
    ColaViajes: {
      todos: async () => [registro],
      cerrar: async (_, cierre) => {
        registro = { ...registro, cierre };
        return registro;
      }
    },
    $: id => id === 'finalKm' ? { value: '110' } : serviceBox,
    parsearKilometraje: Number,
    esChoferSecretaria: () => false,
    volverInicioSinEsperar: () => { volvio = true; },
    mostrarAvisoOperacion: () => assert.fail('El cierre guardado no necesita un cartel')
  });
  vm.runInContext(fs.readFileSync('viajes-locales.js', 'utf8'), context);
  context.lanzarEnvioLocal = () => {};
  await context.cerrarViajeLocal(false);
  assert.equal(volvio, true);
  assert.equal(servicio.estado, 'FINALIZADO');
  assert.match(serviceBox.innerHTML, /Viaje finalizado/);
});

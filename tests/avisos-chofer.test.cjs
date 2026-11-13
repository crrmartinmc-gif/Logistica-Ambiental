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

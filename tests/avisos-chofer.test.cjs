const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function fixture(rol='CHOFER'){
 const c={session:{rol},console:{warn(){}}};
 vm.createContext(c);
 const a=html.indexOf('function puedeVerDiagnosticosOperacion()'),b=html.indexOf('async function getJson(',a);
 vm.runInContext(html.slice(a,b),c);
 return c;
}
const error='DriveApp.getFolderById: No tienes permiso. https://www.googleapis.com/auth/drive SALIDA_FRENTE SALIDA_TRASERA';
test('fallo de envío conserva estado sin confirmar y no expone permisos, rutas o excepciones',()=>{const f=fixture();for(const accion of ['salida','cierre','reporte']){const m=f.mensajeErrorOperacion(new Error(error),accion);assert.doesNotMatch(m,/DriveApp|googleapis|permiso|SALIDA_/);assert.match(m,/confirm/);}});
test('kilometraje inválido conserva instrucción útil al chofer',()=>{assert.match(fixture().mensajeErrorOperacion(new Error('KM_FINAL no puede ser menor que el KM actual del vehículo (73330 km).'),'cierre'),/kilometraje/);});
test('administrador conserva acceso a detalles técnicos',()=>{const f=fixture('ADMINISTRADOR');assert.equal(f.mensajeErrorOperacion(new Error(error),'salida'),error);});

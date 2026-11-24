const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(send){
 const rows=new Map();let source=fs.readFileSync('cola-viajes.js','utf8');
 // Adaptador de almacenamiento para probar el protocolo con fallos y carreras controladas.
 source=source.slice(0,source.indexOf('  function db()'))+`async function todos(){return [...rows.values()].map(x=>structuredClone(x));} async function editar(key,fn){const value=fn(structuredClone(rows.get(key)));if(value)rows.set(key,structuredClone(value));else rows.delete(key);return structuredClone(value);}\n`+source.slice(source.indexOf('  async function iniciar('));
 const c=vm.createContext({rows,structuredClone,Date,Error,conBloqueoColaViajes:fn=>fn(),enviarOperacionViaje:send,resultadoOperacionViaje:d=>d.resultado||d});vm.runInContext(source+'\nglobalThis.cola=ColaViajes;',c);return c.cola;
}
const payload={accion:'iniciarViaje',idAsignacion:'A1',idChofer:'C1',kmInicial:100,horaInicio:'2026-11-17T10:00:00Z',fotos:{frente:'foto'}};
test('inicio durable no envía y reintento conserva fotos e identidad',async()=>{let calls=0;const q=fixture(async()=>{calls++;throw Error('Sin red');});const r=await q.iniciar(payload,{},null);await q.iniciar({...payload,kmInicial:999},{},null);assert.equal(calls,0);await assert.rejects(q.procesar());const [saved]=await q.todos();assert.equal(saved.key,r.key);assert.equal(saved.payload.kmInicial,100);assert.equal(saved.payload.fotos.frente,'foto');assert.equal(saved.inicioConfirmado,false);});
test('cierre antes de enviar espera inicio, usa ID confirmado y no reenvía confirmados',async()=>{const calls=[];const q=fixture(async p=>{calls.push(p);return {ID_VIAJE:'SERVER-1'};});const r=await q.iniciar(payload,{},null);await q.cerrar(r.key,{accion:'finalizarViaje',kmFinal:120,horaFin:'hora-original',finalizarRecorrido:true});await q.procesar();await q.procesar();assert.equal(calls.length,2);assert.equal(calls[1].idViaje,'SERVER-1');assert.equal(calls[1].horaFin,'hora-original');assert.equal(calls[1].finalizarRecorrido,true);assert.equal((await q.todos())[0].cierreConfirmado,true);});
test('cierre agregado durante envío no se pierde',async()=>{let unblock;const waiting=new Promise(r=>unblock=r);const q=fixture(async p=>{if(p.accion==='iniciarViaje')await waiting;return {ID_VIAJE:'SERVER'};});const r=await q.iniciar(payload,{},null);const sending=q.procesar();await q.cerrar(r.key,{accion:'finalizarViaje',kmFinal:130});unblock();await sending;assert.equal((await q.todos())[0].cierreConfirmado,true);});
test('fallo de cierre conserva cierre y no vuelve a subir fotos',async()=>{let fail=true;const calls=[];const q=fixture(async p=>{calls.push(p.accion);if(p.accion==='finalizarViaje'&&fail)throw Error('Sin red');return {ID_VIAJE:'SERVER'};});const r=await q.iniciar(payload,{},null);await q.cerrar(r.key,{accion:'finalizarViaje'});await assert.rejects(q.procesar());fail=false;await q.procesar();assert.deepEqual(calls,['iniciarViaje','finalizarViaje','finalizarViaje']);});
test('Secretaría conserva identidad de viaje entre reintentos',async()=>{const q=fixture(async()=>({ID_VIAJE:'SEC1'}));const p={...payload,accion:'iniciarViajeSecretaria',idViaje:'SEC1'};await q.iniciar(p,{},{});await q.iniciar(p,{},{});assert.equal((await q.todos()).length,1);});

function interfazInicio({enviar,recorrido=null,viajes=[]}){
 const html=fs.readFileSync('index.html','utf8');
 const codigo=html.slice(html.indexOf('async function consultarInicioRegistrado('),html.indexOf('async function iniciarViajeSecretaria(){'));
 const nodos=new Map();
 const clases=new Set();
 const titulo={textContent:'Preparar salida'};
 const $=id=>{
  if(!nodos.has(id))nodos.set(id,{value:id==='currentKm'?'100':'',style:{},focus(){},
   querySelector:()=>titulo,classList:{add:c=>clases.add(c),remove:c=>clases.delete(c)}});
  return nodos.get(id);
 };
 const fotos={frente:{dataUrl:'FRENTE'},trasera:{dataUrl:'TRASERA'},
  lateral_derecho:{dataUrl:'DERECHA'},lateral_izquierdo:{dataUrl:'IZQUIERDA'}};
 const contexto=vm.createContext({$,window:{__salidaFotos:fotos},consultaInspeccionActual:0,
  servicioEnInspeccion:{idAsignacion:'A1',idServicio:'S1',idUnidad:'U1',estado:'PENDIENTE'},
  session:{idChofer:'C1'},esChoferSecretaria:()=>false,parsearKilometraje:Number,
  recPuedeReutilizar:()=>false,contarFotosSalida:()=>4,guardarInicioLocal:enviar,
  consultarRecorridoActual:async()=>({viajeActivo:recorrido}),getJson:async()=>({viajes}),
  mostrarModoViajeActivo:()=>{$('finishInspectionBtn').textContent='FINALIZAR SERVICIO';},
  renderService(){},invalidarInspeccionReutilizada(){},limpiarCacheAPI(){},
  actualizarEstadoInicio:()=>{$('finishInspectionBtn').disabled=false;},
  mensajeErrorOperacion:e=>e.message,console:{warn(){}}});
 vm.runInContext(codigo,contexto);
 return {contexto,clases,titulo,$,fotos};
}

const viajeRegistrado={ID_VIAJE:'V1',ID_ASIGNACION:'A1',ID_SERVICIO:'S1',ID_VEHICULO:'U1',
 ID_CHOFER:'C1',ESTADO:'EN CURSO',KM_INICIAL:99};

test('muestra la pantalla del viaje durante el envío y un doble toque no duplica el inicio',async()=>{
 let confirmar;
 const envio=new Promise(resolve=>{confirmar=resolve;});
 let solicitudes=0;
 const {contexto,clases,titulo,$}=interfazInicio({enviar:()=>{solicitudes++;return envio;}});
 const inicio=contexto.iniciarViaje();
 await contexto.iniciarViaje();
 assert.equal(titulo.textContent,'Viaje en curso');
 assert.ok(clases.has('inicio-en-progreso'));
 assert.equal($('finishInspectionBtn').disabled,true);
 assert.equal(solicitudes,1);
 confirmar({idViaje:'V1',kmInicial:99});
 await inicio;
 assert.equal(contexto.servicioEnInspeccion.estado,'EN VIAJE');
 assert.equal(contexto.servicioEnInspeccion.kmInicial,99);
 assert.equal($('finishInspectionBtn').textContent,'FINALIZAR SERVICIO');
 assert.ok(!clases.has('inicio-en-progreso'));
});

test('recupera el mismo viaje si se pierde la respuesta del inicio',async()=>{
 const {contexto,$}=interfazInicio({recorrido:{...viajeRegistrado,fotosViajeCompletas:true},
  enviar:async()=>{throw Error('Falló la conexión');}});
 await contexto.iniciarViaje();
 assert.equal(contexto.servicioEnInspeccion.idViaje,'V1');
 assert.equal($('finishInspectionBtn').textContent,'FINALIZAR SERVICIO');
 assert.equal($('inspectionAlert').style.display,'none');
});

test('reintenta fotos parciales con los datos originales y permite finalizar aunque sigan pendientes',async()=>{
 const solicitudes=[];
 const {contexto,$}=interfazInicio({recorrido:{...viajeRegistrado,inspeccionCompleta:true,fotosViajeCompletas:false},
  enviar:async datos=>{solicitudes.push(datos);throw Error('El servidor no confirmó las 4 fotos de salida.');}});
 await contexto.iniciarViaje();
 assert.equal(solicitudes.length,2);
 assert.equal(solicitudes[0],solicitudes[1]);
 assert.equal(solicitudes[1].fotos.frente,'FRENTE');
 assert.equal(solicitudes[1].fotosPorViaje,true);
 assert.equal(contexto.servicioEnInspeccion.idViaje,'V1');
 assert.match($('inspectionAlert').textContent,/fotos de salida sin confirmar/);
 assert.equal($('finishInspectionBtn').textContent,'FINALIZAR SERVICIO');
});

test('con tres fotos no se envía el inicio aunque el recorrido anterior tenga fotos',async()=>{
 const {contexto,$}=interfazInicio({enviar:()=>assert.fail('El inicio no debe enviarse')});
 contexto.recPuedeReutilizar=()=>true;
 contexto.contarFotosSalida=()=>3;
 await contexto.iniciarViaje();
 assert.match($('inspectionAlert').textContent,/cuatro fotos/);
 assert.equal(contexto.servicioEnInspeccion.estado,'PENDIENTE');
});

test('si el inicio sigue sin confirmarse, restaura la preparación con sus fotos',async()=>{
 const {contexto,clases,titulo,$,fotos}=interfazInicio({
  recorrido:{...viajeRegistrado,ID_ASIGNACION:'OTRA'},viajes:[{...viajeRegistrado,ID_CHOFER:'OTRO'}],
  enviar:async()=>{throw Error('Falló la conexión');}});
 await contexto.iniciarViaje();
 assert.equal(contexto.servicioEnInspeccion.estado,'PENDIENTE');
 assert.equal(contexto.window.__salidaFotos,fotos);
 assert.equal($('currentKm').value,'100');
 assert.equal(titulo.textContent,'Preparar salida');
 assert.equal($('finishInspectionBtn').disabled,false);
 assert.ok(!clases.has('inicio-en-progreso'));
});

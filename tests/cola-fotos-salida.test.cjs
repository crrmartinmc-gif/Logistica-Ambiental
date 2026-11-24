const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');

const source=fs.readFileSync('cola-fotos-salida.js','utf8');
const contrato=fs.readFileSync('operaciones-viaje.js','utf8');
const worker=fs.readFileSync('service-worker.js','utf8');
const datos={idChofer:'C1',idServicio:'S1',idAsignacion:'A1',idVehiculo:'U1',
 accion:'iniciarViaje',fotosPorViaje:true,horaInicio:'2026-11-24T13:00:00Z',
 fotos:{frente:'FRENTE',trasera:'TRASERA',lateral_derecho:'DERECHA',lateral_izquierdo:'IZQUIERDA'}};
const respuesta={ok:true,resultado:{ID_VIAJE:'V1',KM_INICIAL:100,ESTADO:'EN CURSO',
 FOTOS_SALIDA:{registradas:4,ID_VIAJE_ORIGEN:'V1'}}};

function contexto(rows,enviar,{now=()=>Date.now()}={}){
 const inicio=source.indexOf('  function abrir('),fin=source.indexOf('  function guardar(');
 // Cada contexto representa una página o un worker con acceso a la misma base.
 const memoria=`async function editar(id,editar){
   const fila=editar(structuredClone(rows.get(id)));
   if(fila)rows.set(id,structuredClone(fila));else rows.delete(id);
   return fila;
 } async function pendientes(){return structuredClone([...rows.values()]);}\n`;
 const c=vm.createContext({rows,structuredClone,crypto:{randomUUID},Date:class extends Date{static now(){return now();}},enviar});
 vm.runInContext(contrato+'\nenviarOperacionViaje=async payload=>validarRespuestaViaje(await enviar(payload),payload.etapaSalida!=="INICIO");\n'+
  source.slice(0,inicio)+memoria+source.slice(fin)+'\nglobalThis.cola=ColaFotosSalida;',c);
 return c;
}

test('el worker puede confirmar la salida que guardó la página aunque no haya ventanas abiertas',async()=>{
 const rows=new Map();
 const pagina=contexto(rows,()=>assert.fail('La página se cerró antes del envío'));
 await pagina.cola.guardar(datos);
 assert.equal(rows.size,1);
 let post;
 const sw=contexto(rows,async payload=>{post=payload;return respuesta;});
 const llamadas=new Map();
 Object.assign(sw,{importScripts(){},self:{addEventListener:(nombre,fn)=>llamadas.set(nombre,[...(llamadas.get(nombre)||[]),fn]),
  clients:{matchAll:async()=>[]}}});
 vm.runInContext(worker,sw);
 const promesas=[];
 for(const handler of llamadas.get('sync'))handler({tag:'chofer-fotos-salida',waitUntil:p=>promesas.push(p)});
 await Promise.all(promesas);
 assert.equal(post.fotos.lateral_derecho,'DERECHA');
 assert.equal(post.horaInicio,datos.horaInicio);
 assert.equal(rows.size,0);
});

test('una reserva evita dos POST y otro contexto recupera un envío interrumpido',async()=>{
 const rows=new Map();
 let reloj=1000,solicitudes=0;
 const primera=contexto(rows,()=>{solicitudes++;return new Promise(()=>{});},{now:()=>reloj});
 const segunda=contexto(rows,async()=>{solicitudes++;return respuesta;},{now:()=>reloj});
 const {opId}=await primera.cola.guardar(datos);
 void primera.cola.enviar(opId);
 await new Promise(setImmediate);
 assert.equal((await segunda.cola.enviar(opId)).ocupada,true);
 assert.equal(solicitudes,1);
 reloj+=120001;
 assert.equal((await segunda.cola.enviar(opId)).idViaje,'V1');
 assert.equal(solicitudes,2);
 assert.equal(rows.size,0);
});

test('conserva fotos incompletas, conserva el primer inicio y permite reusar la asignación otro día',async()=>{
 const rows=new Map();
 const c=contexto(rows,async()=>({ok:true,resultado:{ID_VIAJE:'V1',FOTOS_SALIDA:{registradas:3}}}));
 const {opId}=await c.cola.guardar(datos);
 await assert.rejects(c.cola.enviar(opId),/4 fotos/);
 const misma=await c.cola.guardar({...datos,horaInicio:'2026-11-24T17:00:00Z'});
 assert.equal(misma.opId,opId);
 assert.equal(misma.payload.horaInicio,datos.horaInicio);
 assert.equal(misma.payload.fotos.trasera,'TRASERA');
 const otroDia=await c.cola.guardar({...datos,horaInicio:'2026-11-25T13:00:00Z'});
 assert.notEqual(otroDia.opId,opId);
});

test('las fotos de otro viaje nunca vacían la cola',async()=>{
 const c=contexto(new Map(),async()=>({ok:true,resultado:{ID_VIAJE:'V1',
  FOTOS_SALIDA:{registradas:4,ID_VIAJE_ORIGEN:'OTRO'}}}));
 const {opId}=await c.cola.guardar(datos);
 await assert.rejects(c.cola.enviar(opId),/fotos de otro viaje/);
 assert.equal((await c.cola.pendientes()).length,1);
});

test('el inicio se confirma y queda persistido antes de cualquier envío de fotos',async()=>{
 const rows=new Map(),solicitudes=[];
 const c=contexto(rows,async payload=>{
  solicitudes.push(payload);
  return payload.etapaSalida==='INICIO'
   ?{ok:true,resultado:{ID_VIAJE:'V1',INICIO_CONFIRMADO:true,ESTADO:'EN CURSO',KM_INICIAL:100}}
   :respuesta;
 });
 const fila=await c.cola.guardar({...datos,usuario:'chofer'});
 const inicio=await c.cola.enviar(fila.opId,{soloInicio:true});
 assert.equal(inicio.idViaje,'V1');
 assert.equal(inicio.fotosPendientes,true);
 assert.equal(solicitudes.length,1);
 assert.equal(solicitudes[0].fotos,undefined);
 assert.equal((await c.cola.pendientes())[0].inicio.idViaje,'V1');
 const fotos=await c.cola.enviar(fila.opId);
 assert.equal(solicitudes.length,2);
 assert.equal(solicitudes[1].etapaSalida,'FOTOS');
 assert.equal(solicitudes[1].idViaje,'V1');
 assert.equal(solicitudes[1].fotos.frente,'FRENTE');
 assert.equal(fotos.fotosPendientes,false);
 assert.equal(rows.size,0);
});

test('un fallo al subir fotos conserva el ID y el reintento repite solo las fotos',async()=>{
 const rows=new Map(),etapas=[];
 let fallarFotos=true;
 const c=contexto(rows,async payload=>{
  etapas.push(payload.etapaSalida);
  if(payload.etapaSalida==='INICIO')return {ok:true,resultado:{ID_VIAJE:'V1',INICIO_CONFIRMADO:true}};
  if(fallarFotos)throw Error('Sin conexión');
  return respuesta;
 });
 const {opId}=await c.cola.guardar({...datos,usuario:'chofer'});
 let notificado;
 await assert.rejects(c.cola.enviar(opId,{alConfirmarInicio:salida=>{notificado=salida.idViaje;}}),/Sin conexión/);
 assert.equal(notificado,'V1');
 assert.equal((await c.cola.pendientes())[0].inicio.idViaje,'V1');
 fallarFotos=false;
 await c.cola.enviar(opId);
 assert.deepEqual(etapas,['INICIO','FOTOS','FOTOS']);
 assert.equal(rows.size,0);
});

test('una salida guardada antes de actualizar adopta el inicio separado al volver el mismo chofer',async()=>{
 const rows=new Map(),solicitudes=[];
 const c=contexto(rows,async payload=>{
  solicitudes.push(payload);
  return {ok:true,resultado:{ID_VIAJE:'V1',INICIO_CONFIRMADO:true}};
 });
 const {opId}=await c.cola.guardar(datos);
 await c.cola.completarUsuario(opId,'OTRO','otro');
 assert.equal((await c.cola.pendientes())[0].payload.usuario,undefined);
 await c.cola.completarUsuario(opId,'C1','chofer');
 await c.cola.enviar(opId,{soloInicio:true});
 assert.equal(solicitudes[0].etapaSalida,'INICIO');
 assert.equal(solicitudes[0].fotos,undefined);
 assert.equal((await c.cola.pendientes())[0].payload.fotos.frente,'FRENTE');
});

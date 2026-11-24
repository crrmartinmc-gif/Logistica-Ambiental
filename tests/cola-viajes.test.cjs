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
test('las operaciones retiradas se conservan y no bloquean viajes pendientes',async()=>{
 const calls=[];
 const q=fixture(async p=>{calls.push(p.accion);return {ID_VIAJE:'SERVER'};});
 await q.editar('SEC-S1',()=>({key:'SEC-S1',payload:{accion:'iniciarViajeSecretaria'},createdAt:0}));
 await q.iniciar(payload,{},null);
 await q.procesar();
 assert.deepEqual(calls,['iniciarViaje']);
 assert.equal((await q.todos()).find(r=>r.key==='SEC-S1').inicioConfirmado,undefined);
});

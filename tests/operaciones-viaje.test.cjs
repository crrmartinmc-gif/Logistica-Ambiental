const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function runtime(fetch){
 const ctx=vm.createContext({fetch,AbortController,setTimeout,clearTimeout,BACKEND_URL:'https://example.test/exec',navigator:{}});
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../operaciones-viaje.js'),'utf8'),ctx);
 return ctx;
}
const valid={ok:true,ID_VIAJE:'V1',FOTOS_SALIDA:{registradas:4,errores:[],faltantes:[]}};
for(const wrapper of ['resultado','datos','data'])test('confirma inicio con sobre '+wrapper,()=>{
 const ctx=runtime();assert.equal(ctx.validarRespuestaViaje({ok:true,[wrapper]:valid},true).ok,true);
});
test('no acepta éxito aparente con rechazo interno',()=>{
 const ctx=runtime();assert.throws(()=>ctx.validarRespuestaViaje({ok:true,datos:{ok:false,error:'Rechazado'}},false),/Rechazado/);
});
test('no acepta confirmación sin las cuatro fotos',()=>{
 const ctx=runtime();for(const fotos of [undefined,{registradas:3},{registradas:4,errores:['Error Drive']}]){
 assert.throws(()=>ctx.validarRespuestaViaje({ok:true,resultado:{FOTOS_SALIDA:fotos}},true),/4 fotos/);
 }
});
test('no inventa confirmación ante respuestas vacías',()=>{
 const ctx=runtime();for(const value of [null,{},'OK']) assert.throws(()=>ctx.validarRespuestaViaje(value,false),/no confirmó/);
});
test('envía fotos grandes sin keepalive y valida el servidor',async()=>{
 let received;
 const ctx=runtime(async(url,options)=>{received=options;return {ok:true,text:async()=>JSON.stringify({ok:true,resultado:valid})};});
 await ctx.enviarOperacionViaje({accion:'iniciarViaje',fotos:{frente:'x'.repeat(100000)}});
 assert.ok(received.body.length>65536);assert.equal(received.keepalive,undefined);assert.equal(received.method,'POST');
});
test('el cierre requiere confirmación explícita y propaga fallos HTTP',async()=>{
 let response={ok:true,text:async()=>JSON.stringify({ok:true,datos:{ok:true}})};
 const ctx=runtime(async()=>response);await ctx.enviarOperacionViaje({accion:'finalizarViaje'});
 response={ok:false,status:503,text:async()=>''};await assert.rejects(ctx.enviarOperacionViaje({accion:'finalizarViaje'}),/503/);
});

// Pruebas con IndexedDB real; no envía datos a producción.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.route('https://**/*',r=>r.abort());const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  session={idChofer:'C-TEST',usuario:'test',nombre:'Prueba',rol:'CHOFER'};guardarSesionLocal();
  servicioEnInspeccion={idServicio:'S-TEST',idAsignacion:'A-TEST',idUnidad:'U-TEST',estado:'PENDIENTE'};
  window.__salidaFotos=Object.fromEntries(['frente','trasera','lateral_derecho','lateral_izquierdo'].map(x=>[x,{dataUrl:'data:image/jpeg;base64,TEST'}]));
  $('currentKm').value='100';
  // Envío deliberadamente detenido: iniciar no debe esperarlo.
  lanzarEnvioLocal=()=>{};
  await iniciarViaje();const rows=await ColaViajes.todos();
  return {estado:servicioEnInspeccion.estado,fotos:rows[0].payload.fotos.frente,pendiente:!rows[0].inicioConfirmado};
 });assert.equal(result.estado,'EN VIAJE');assert.equal(result.pendiente,true);assert.ok(result.fotos);
 await page.reload();await page.waitForFunction(()=>servicioEnInspeccion?.estado==='EN VIAJE');
 const outcome=await page.evaluate(async()=>{
  lanzarEnvioLocal=()=>{};$('finalKm').value='125';await finalizarViaje(true);
  let rows=await ColaViajes.todos();const hora=rows[0].payload.horaInicio;
  const calls=[];enviarOperacionViaje=async p=>{calls.push(p);return {ok:true,resultado:{ok:true,ID_VIAJE:'V-SERVER',FOTOS_SALIDA:{registradas:4}}};};
  await ColaViajes.procesar();await ColaViajes.procesar();rows=await ColaViajes.todos();
  return {calls,record:rows[0],hora};
 });assert.equal(outcome.calls.length,2);assert.equal(outcome.calls[0].accion,'iniciarViaje');assert.equal(outcome.calls[1].accion,'finalizarViaje');assert.equal(outcome.calls[1].idViaje,'V-SERVER');assert.equal(outcome.calls[1].finalizarRecorrido,true);assert.equal(outcome.calls[0].horaInicio,outcome.hora);assert.equal(outcome.record.cierreConfirmado,true);
 console.log('OK: inicio sin esperar red, persistencia de fotos, recuperación tras recarga, cierre pendiente, orden inicio/cierre, ID del servidor y ausencia de reenvío tras confirmar.');
 await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});

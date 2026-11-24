// La prueba usa el servicio web y el Service Worker reales contra un servidor de prueba.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const fotos = ['frente', 'trasera', 'lateral_derecho', 'lateral_izquierdo'];
const dia = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Argentina/Buenos_Aires'}).format(new Date());

async function probarFlujo() {
  const servicios = [
    {ID_SERVICIO:'S1', FECHA:dia, NOMBRE_SERVICIO:'Primera salida', ESTADO:'PENDIENTE', HORA_PROGRAMADA:'08:00'},
    {ID_SERVICIO:'S2', FECHA:dia, NOMBRE_SERVICIO:'Segunda salida', ESTADO:'PENDIENTE', HORA_PROGRAMADA:'10:00'}
  ];
  const asignaciones = servicios.map((s,i)=>({
    ID_ASIGNACION:'A'+(i+1),ID_SERVICIO:s.ID_SERVICIO,ID_VEHICULO:'U1',ID_CHOFER:'C1',FECHA:dia,ESTADO:'ACTIVA'
  }));
  const vehiculos = [{ID_VEHICULO:'U1',DOMINIO:'TEST01',KM_ACTUAL:100}];
  const viajes = [];
  const guardados = [];
  const tipos = {'.js':'application/javascript','.css':'text/css','.png':'image/png','.html':'text/html','.webmanifest':'application/manifest+json'};
  let inicioRetenido;
  let permitirInicio;
  let salidaSinRed = false;
  let rol = 'CHOFER';
  const server = http.createServer(async (req,res)=>{
    const tag = new URL(req.url,'http://localhost');
    if(tag.pathname==='/backend'){
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET'){
        const lecturas = {listarViajes:viajes,listarServicios:servicios,listarAsignaciones:asignaciones,listarVehiculos:vehiculos,rutas:[]};
        return res.end(JSON.stringify({ok:true,datos:lecturas[tag.searchParams.get('accion')]}));
      }
      const chunks = [];
      for await(const chunk of req)chunks.push(chunk);
      const datos = JSON.parse(Buffer.concat(chunks));
      if(datos.accion==='login')return res.end(JSON.stringify({ok:true,resultado:{ok:true,usuario:{ID_CHOFER:'C1',NOMBRE:'Prueba',USUARIO:'chofer',ROL:rol}}}));
      if(datos.accion==='iniciarViaje' && salidaSinRed){
        res.writeHead(503);
        return res.end();
      }
      guardados.push(datos);
      if(datos.accion==='iniciarViaje'){
        await inicioRetenido;
        const servicio = servicios.find(s=>s.ID_SERVICIO===datos.idServicio);
        servicio.ESTADO = 'EN CURSO';
        const viaje = {ID_VIAJE:'V'+viajes.length,ID_SERVICIO:datos.idServicio,ID_ASIGNACION:datos.idAsignacion,
          ID_VEHICULO:datos.idVehiculo,ID_CHOFER:datos.idChofer,HORA_INICIO:datos.horaInicio,KM_INICIAL:datos.kmInicial,ESTADO:'EN CURSO'};
        viajes.push(viaje);
        return res.end(JSON.stringify({ok:true,resultado:{...viaje,FOTOS_SALIDA:{registradas:4,errores:[],faltantes:[],ID_VIAJE_ORIGEN:viaje.ID_VIAJE}}}));
      }
      if(datos.accion==='finalizarViaje'){
        const viaje = viajes.find(v=>v.ID_VIAJE===datos.idViaje);
        if(!viaje)return res.end(JSON.stringify({ok:false,error:'Viaje inexistente'}));
        viaje.ESTADO = 'FINALIZADO';
        viaje.KM_FINAL = datos.kmFinal;
        servicios.find(s=>s.ID_SERVICIO===viaje.ID_SERVICIO).ESTADO = 'FINALIZADO';
        return res.end(JSON.stringify({ok:true,resultado:viaje}));
      }
      return res.end(JSON.stringify({ok:false,error:'Acción no prevista'}));
    }
    const archivo = path.join(root,tag.pathname==='/'?'index.html':tag.pathname);
    try{
      let contenido = fs.readFileSync(archivo);
      if(['index.html','service-worker.js'].includes(path.basename(archivo))){
        contenido = contenido.toString().replace(/https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/g,
          'http://127.0.0.1:'+server.address().port+'/backend');
      }
      res.setHeader('Content-Type',tipos[path.extname(archivo)]||'application/octet-stream');
      res.end(contenido);
    }catch{res.writeHead(404).end();}
  }).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));

  let browser;
  try{
    const systemChromium = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
    browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||systemChromium});
    const context = await browser.newContext({viewport:{width:390,height:844}});
    await context.route('https://**/*',r=>r.abort());
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror',e=>errores.push(e.message));
    const url = 'http://127.0.0.1:'+server.address().port;
    async function ingresar(){
      await page.fill('#usuario','chofer');
      await page.fill('#contrasena','test');
      await page.click('#loginBtn');
    }
    await page.goto(url);
    await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    rol = 'CHOFER_SECRETARIA';
    await ingresar();
    await page.waitForFunction(()=>document.getElementById('loginError').textContent.includes('deshabilitado'));
    assert.equal(await page.locator('#dashboardScreen').isVisible(),false);

    rol = 'CHOFER';
    await ingresar();
    await page.getByRole('button',{name:'VER SERVICIO'}).click();
    await page.fill('#currentKm','100');
    await page.evaluate(keys=>{
      window.__salidaFotos=Object.fromEntries(keys.slice(0,3).map(k=>[k,{dataUrl:'data:image/jpeg;base64,TEST'}]));
      actualizarEstadoInicio();
    },fotos);
    assert.equal(await page.locator('#finishInspectionBtn').isDisabled(),true);
    await page.evaluate(k=>{
      window.__salidaFotos[k]={dataUrl:'data:image/jpeg;base64,TEST'};
      actualizarEstadoInicio();
    },fotos[3]);
    inicioRetenido = new Promise(resolve=>{permitirInicio=resolve;});
    await page.locator('#finishInspectionBtn').click();
    await page.waitForFunction(()=>document.getElementById('inspectionStatus').textContent.includes('EN VIAJE'));
    assert.equal(await page.locator('#finishInspectionBtn').isDisabled(),true);
    await page.evaluate(()=>iniciarViaje());
    permitirInicio();
    await page.waitForFunction(()=>document.getElementById('finishInspectionBtn').disabled===false);
    assert.equal(guardados.filter(x=>x.accion==='iniciarViaje').length,1);
    assert.ok(fotos.every(k=>guardados[0].fotos[k]));
    assert.equal(guardados[0].kmInicial,100);
    assert.equal(guardados[0].etapaSalida,undefined);

    // El viaje abierto sigue siendo el primero aunque el Panel haya cerrado su asignación.
    asignaciones[0].ESTADO = 'FINALIZADA';
    await page.reload();
    await page.getByRole('button',{name:'CONTINUAR SERVICIO'}).click();
    assert.equal(await page.locator('#vehiclePhotosGrid').isVisible(),false);
    await page.fill('#finalKm','125');
    await page.getByRole('button',{name:'FINALIZAR SERVICIO'}).click();
    await page.getByRole('button',{name:'VOLVER AL INICIO'}).click();
    await page.getByRole('button',{name:'VER SERVICIO'}).click();
    assert.equal(guardados[1].kmFinal,125);
    await page.locator('#vehiclePhotosGrid').waitFor({state:'visible'});
    assert.equal(await page.locator('#finishInspectionBtn').isDisabled(),true);

    // El segundo envío conserva sus fotos durante una caída y se recupera en segundo plano.
    await page.fill('#currentKm','125');
    await page.evaluate(keys=>{
      window.__salidaFotos=Object.fromEntries(keys.map(k=>[k,{dataUrl:'data:image/jpeg;base64,TEST'}]));
      actualizarEstadoInicio();
    },fotos);
    salidaSinRed = true;
    await page.locator('#finishInspectionBtn').click();
    await page.waitForFunction(async()=> (await leerSalidasGuardadas()).length===1);
    await page.waitForFunction(()=>document.getElementById('inspectionAlert').textContent.includes('Enviando la salida'));
    salidaSinRed = false;
    await page.evaluate(()=>reanudarEnviosChoferes());
    await page.waitForFunction(async()=> (await leerSalidasGuardadas()).length===0);
    await page.waitForFunction(()=>document.getElementById('finishInspectionBtn').disabled===false);
    assert.equal(guardados.filter(x=>x.accion==='iniciarViaje').length,2);

    // Una sesión de Secretaría que quedó guardada vuelve al ingreso.
    await page.evaluate(()=>localStorage.setItem('diaVerdeChofer',JSON.stringify({idChofer:'C1',rol:'CHOFER_SECRETARIA'})));
    await page.reload();
    await page.locator('#loginForm').waitFor();
    assert.equal(await page.locator('#dashboardScreen').isVisible(),false);
    assert.deepEqual(errores,[]);
    await context.close();
    console.log('App Choferes: acceso, cuatro fotos, inicio, recuperación, cierre, siguiente salida y reintento verificados.');
  }finally{
    await browser?.close();
    server.close();
  }
}
probarFlujo().catch(e=>{console.error(e);process.exitCode=1;});

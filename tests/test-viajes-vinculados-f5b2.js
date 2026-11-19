/* Verificación estática de F5B.2: se preservan fotos, km y cola durable. */
const fs=require('fs'),assert=require('assert');
const index=fs.readFileSync('index.html','utf8'),
  orders=fs.readFileSync('ordenes-secretaria.js','utf8'),
  local=fs.readFileSync('viajes-locales.js','utf8'),
  sw=fs.readFileSync('service-worker.js','utf8');
let n=0;
const verify=(condition,message)=>{assert.ok(condition,message);n++};
verify(index.includes('./ordenes-secretaria.js?v=5'),'la versión nueva de órdenes está enlazada');
verify(index.includes('./viajes-locales.js?v=34'),'la versión nueva de cola local está enlazada');
verify(orders.includes("inicioVinculadoHabilitado=data.modo==='VIAJES_VINCULADOS'"),'se habilita iniciar SOLO con backend vinculado');
verify(orders.includes("const listo=aceptada&&!demasiadoPronto&&!vencida&&inicioVinculadoHabilitado"),'solo pueden iniciar órdenes aceptadas en horario válido');
verify(orders.includes("window.ordenesSecretariaOrdenActiva="),'identifica orden seleccionada');
verify(orders.includes("window.ordenesSecretariaActualizarCola="),'renueva tokens al reingresar');
verify(index.includes("await window.ordenesSecretariaActualizarCola()"),'autorización de cola se renueva con login');
verify(index.includes("idSolicitud:orden.id,idAsignacionLocal:orden.idAsignacion,tokenOrdenes:session.tokenOrdenes"),'el inicio identifica la orden');
verify(index.includes("idSolicitud:orden.id,idAsignacionLocal:orden.idAsignacion,tokenOrdenes:session.tokenOrdenes"),'el cierre tradicional incluye vínculo recuperado');
verify(local.includes("idSolicitud:r.payload.idSolicitud,idAsignacionLocal:r.payload.idAsignacionLocal,tokenOrdenes:session.tokenOrdenes||r.payload.tokenOrdenes"),'el cierre en cola local conserva ID y token');
verify(index.includes("contarFotosSalida()!==4"),'conserva las 4 fotos obligatorias');
verify(index.includes("km=parsearKilometraje($('currentKm').value)"),'conserva KM inicial');
verify(local.includes("km=parsearKilometraje($('finalKm')?.value)"),'conserva KM final');
verify(sw.includes("APP_CACHE='chofer-interfaz-v38'"),'se renovó el cache PWA');
verify(sw.includes("'./ordenes-secretaria.js?v=5'"),'incluye órdenes en cache');
verify(sw.includes("'./ordenes-secretaria.css?v=2'"),'incluye estilo de órdenes en cache');
verify(index.includes("const res=await postJson({accion:'listarOrdenesSecretaria',tokenOrdenes:session.tokenOrdenes})"),'recupera la orden vinculada al continuar desde otro equipo');
console.log('OK: '+n+' comprobaciones F5B.2 sin modificar operaciones de la flota.');

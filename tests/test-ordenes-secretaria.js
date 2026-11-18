/* Comprobaciones F5B: no necesitan backend ni datos personales. */
const fs=require('fs'),assert=require('assert');
const index=fs.readFileSync('index.html','utf8');
const orders=fs.readFileSync('ordenes-secretaria.js','utf8');
const css=fs.readFileSync('ordenes-secretaria.css','utf8');
const service=fs.readFileSync('viajes-locales.js','utf8');
let tests=0;
function check(x,msg){assert.ok(x,msg);tests++}
check(index.includes('./ordenes-secretaria.js?v=2'),'el módulo está enlazado');
check(index.includes('./ordenes-secretaria.css?v=2'),'el estilo está enlazado');
check(index.includes('await window.ordenesSecretariaLogin('),'obtiene sesión de órdenes al ingresar');
check(index.includes("window.ordenesSecretariaRender()"),'carga traslados con dashboard Secretaría');
check(orders.includes("accion:'listarOrdenesSecretaria'"),'consulta órdenes en endpoint separado');
check(orders.includes("accion:'aceptarOrdenSecretaria'"),'acepta con autorización separada');
check(orders.includes("tokenOrdenes:session.tokenOrdenes"),'envía token del chofer');
check(orders.includes('if(!session ||'),'verifica sesión del navegador');
check(!orders.includes("accion:'iniciarViajeSecretaria'"),'no altera inicio de viaje');
check(!orders.includes('kmInicial'),'no altera kilometrajes');
check(!orders.includes('fotos:'),'no altera evidencia fotográfica');
check(index.includes('async function iniciarViajeSecretaria()'),'conserva circuito original de salida');
check(index.includes('async function finalizarViajeSecretaria('),'conserva circuito original de cierre');
check(service.includes('async function guardarInicioLocal'),'conserva cola local');
check(css.includes('#ordenesSecretariaBox'),'estilos aislados del resto de la app');
console.log('OK: '+tests+' verificaciones estáticas F5B del frontend.');

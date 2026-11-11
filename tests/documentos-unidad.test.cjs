const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const unidades=JSON.parse(fs.readFileSync(path.join(__dirname,'../documentos-unidad.json'),'utf8')).unidades;
test('los documentos pertenecen a la patente indicada y usan identificadores de Drive válidos',()=>{
 for(const [patente,documentos] of Object.entries(unidades)){
  assert.match(patente,/^[A-Z0-9]+$/);
  assert.ok(documentos.length>0);
  for(const doc of documentos){
   assert.ok(['cedula','poliza','titulo'].includes(doc.tipo));
   assert.match(doc.id,/^[a-zA-Z0-9_-]+$/);
   assert.ok(doc.nombre.toUpperCase().replace(/[^A-Z0-9]/g,'').startsWith(patente),doc.nombre+' no coincide con '+patente);
  }
 }
});
test('Zanella AF846XY dispone de cédula y póliza separadas del título',()=>{
 const docs=unidades.AF846XY;
 assert.equal(docs.find(d=>d.tipo==='cedula').id,'1S8oZMx7gTEZxpPTjjBhh63Mf7TKcAysK');
 assert.equal(docs.find(d=>d.tipo==='poliza').id,'12L25cT3-v8nvcpLgZp-EKHD-mnZAY285');
 assert.ok(docs.find(d=>d.tipo==='titulo').nombre.includes('TITULO'));
});
test('el Cronos tiene los documentos de la patente real AE807UI',()=>{
 assert.ok(unidades.AE807UI.some(d=>d.tipo==='cedula'));
 assert.ok(unidades.AE807UI.some(d=>d.tipo==='poliza'));
 assert.equal(unidades.AF807UI,undefined);
});

/* Índice de los archivos de Drive por patente, sin copiar documentos al repositorio.
   Actualizar documentos-unidad.json cuando se agreguen o reemplacen archivos. */
(function(){
  let unidadActual='';
  let dominioAbierto='';
  let indice=null;
  let dialogo=null;
  let focoAnterior=null;
  const boton=document.getElementById('unitDocumentsButton');
  function patente(valor){
    const real=typeof window.dominioUnidad==='function'?window.dominioUnidad(valor):valor;
    return String(real||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  }
  window.configurarDocumentosUnidad=function(dominio){
    const nueva=patente(dominio);
    if(nueva!==unidadActual && dialogo?.open)dialogo.close();
    unidadActual=nueva==='SINDOMINIO'?'':nueva;
    boton.hidden=!unidadActual;
    boton.setAttribute('aria-label','Documentos de la unidad '+unidadActual);
  };
  function crearDialogo(){
    if(dialogo)return dialogo;
    dialogo=document.createElement('dialog');
    dialogo.className='unit-documents-dialog';
    dialogo.setAttribute('aria-labelledby','unitDocumentsTitle');
    dialogo.innerHTML='<div class="unit-documents-head"><div><h2 id="unitDocumentsTitle">Documentos de la unidad</h2><p id="unitDocumentsPlate"></p></div><button type="button" class="unit-documents-close" aria-label="Cerrar documentos">×</button></div><div class="unit-documents-body"><p id="unitDocumentsStatus" role="status" aria-live="polite"></p><div id="unitDocumentsLinks" class="unit-documents-links"></div></div>';
    dialogo.querySelector('.unit-documents-close').addEventListener('click',()=>dialogo.close());
    dialogo.addEventListener('close',()=>{if(focoAnterior?.isConnected)focoAnterior.focus({preventScroll:true});});
    dialogo.addEventListener('click',e=>{if(e.target!==dialogo)return;const r=dialogo.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialogo.close();});
    document.body.appendChild(dialogo);
    return dialogo;
  }
  async function cargarIndice(){
    if(!indice)indice=fetch('./documentos-unidad.json',{cache:'no-store'})
      .then(r=>{if(!r.ok)throw new Error('No se pudo consultar la documentación.');return r.json();})
      .then(data=>{if(!data?.unidades || typeof data.unidades!=='object')throw new Error('Índice de documentos no disponible.');return data.unidades;})
      .catch(error=>{indice=null;throw error;});
    return indice;
  }
  window.abrirDocumentosUnidad=async function(valor){
    const dominio=patente(valor);
    if(!dominio || dominio==='SINDOMINIO')return;
    dominioAbierto=dominio;
    const modal=crearDialogo();
    focoAnterior=document.activeElement;
    document.getElementById('unitDocumentsPlate').textContent='Unidad '+dominio;
    const estado=document.getElementById('unitDocumentsStatus'),links=document.getElementById('unitDocumentsLinks');
    estado.textContent='Consultando documentos…';links.replaceChildren();
    if(!modal.open)modal.showModal();
    try{
      const unidades=await cargarIndice();
      if(!modal.open || dominioAbierto!==dominio)return;
      const documentos=(Array.isArray(unidades[dominio])?unidades[dominio]:[])
        .filter(d=>['cedula','poliza','titulo'].includes(d.tipo)&&/^[a-zA-Z0-9_-]+$/.test(d.id));
      const tipos={cedula:'Cédula',poliza:'Póliza de seguro',titulo:'Título de la unidad'};
      documentos.sort((a,b)=>['cedula','poliza','titulo'].indexOf(a.tipo)-['cedula','poliza','titulo'].indexOf(b.tipo));
      for(const documento of documentos){
        const link=document.createElement('a');
        link.href='https://drive.google.com/file/d/'+encodeURIComponent(documento.id)+'/view';
        link.target='_blank';link.rel='noopener noreferrer';
        const titulo=document.createElement('strong');titulo.textContent=tipos[documento.tipo];
        const icono=document.createElementNS('http://www.w3.org/2000/svg','svg');
        icono.setAttribute('viewBox','0 0 24 24');icono.setAttribute('fill','none');icono.setAttribute('stroke','currentColor');icono.setAttribute('stroke-width','1.8');icono.setAttribute('aria-hidden','true');
        icono.innerHTML='<path d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>';titulo.appendChild(icono);
        const nombre=document.createElement('span');nombre.textContent=documento.nombre;
        link.append(titulo,nombre);links.appendChild(link);
      }
      const faltantes=['cedula','poliza'].filter(tipo=>!documentos.some(d=>d.tipo===tipo));
      estado.textContent=!documentos.length?'Todavía no hay documentación vinculada a esta patente.':
        faltantes.length?'Disponible en Drive. Falta vincular: '+faltantes.map(tipo=>tipos[tipo].toLowerCase()).join(' y ')+'.':
        'Abrí el documento que necesitás consultar.';
    }catch(e){
      if(modal.open && dominioAbierto===dominio)estado.textContent='No se pudieron cargar los documentos. Revisá la conexión y volvé a intentar.';
    }
  };
  boton.addEventListener('click',()=>window.abrirDocumentosUnidad(unidadActual));
  document.addEventListener('click',event=>{
    const acceso=event.target.closest?.('[data-unit-documents]');
    if(acceso){event.preventDefault();window.abrirDocumentosUnidad(acceso.dataset.unitDocuments);}
  });
})();

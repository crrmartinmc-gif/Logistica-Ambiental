/* Solo conserva envíos. El servidor determina el estado de cada viaje. */
const ColaFotosSalida=(()=>{
  function abrir(){
    return new Promise((resolve,reject)=>{
      const pedido=indexedDB.open('ChoferFotosSalida',1);
      pedido.onupgradeneeded=()=>pedido.result.createObjectStore('pendientes',{keyPath:'opId'});
      pedido.onsuccess=()=>resolve(pedido.result);
      pedido.onerror=()=>reject(pedido.error);
    });
  }

  async function transaccion(modo,accion){
    const db=await abrir();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('pendientes',modo);
      let resultado;
      tx.oncomplete=()=>{db.close();resolve(resultado);};
      tx.onabort=()=>{db.close();reject(tx.error||new Error('No se pudieron guardar las fotos en este celular.'));};
      accion(tx.objectStore('pendientes'),valor=>{resultado=valor;});
    });
  }

  function editar(opId,cambio){
    return transaccion('readwrite',(almacen,resultado)=>{
      const lectura=almacen.get(opId);
      lectura.onsuccess=()=>{
        const actual=lectura.result;
        const siguiente=cambio(actual);
        if(siguiente!==actual){
          if(siguiente)almacen.put(siguiente);
          else almacen.delete(opId);
        }
        resultado(siguiente);
      };
    });
  }

  function pendientes(){
    return transaccion('readonly',(almacen,resultado)=>{
      const lectura=almacen.getAll();
      lectura.onsuccess=()=>resultado(lectura.result);
    });
  }

  function guardar(payload){
    const dia=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short'}).format(new Date(payload.horaInicio));
    const opId=JSON.stringify([dia,payload.idChofer,payload.idServicio,payload.idAsignacion,payload.idVehiculo]);
    return editar(opId,anterior=>anterior||{opId,payload,creada:Date.now()});
  }

  function completarUsuario(opId,idChofer,usuario){
    return editar(opId,actual=>{
      if(!actual||actual.payload.usuario||actual.payload.idChofer!==idChofer||!usuario)return actual;
      return {...actual,payload:{...actual.payload,usuario}};
    });
  }

  function resultadoSalida(fila,inicio,fotosPendientes){
    const {idChofer,idServicio,idAsignacion,idVehiculo,horaInicio}=fila.payload;
    return {opId:fila.opId,idChofer,idServicio,idAsignacion,idVehiculo,horaInicio,...inicio,fotosPendientes};
  }

  async function enviar(opId,{soloInicio=false,alConfirmarInicio=()=>{}}={}){
    const token=crypto.randomUUID();
    const fila=await editar(opId,actual=>{
      if(!actual || (soloInicio && actual.inicio) || actual.enviandoHasta>Date.now())return actual;
      // La reserva sobrevive a la página y caduca si el navegador termina el envío.
      return {...actual,token,enviandoHasta:Date.now()+120000};
    });
    if(!fila)return null;
    if(soloInicio && fila.inicio)return resultadoSalida(fila,fila.inicio,true);
    if(fila.token!==token)return {ocupada:true};
    try{
      const separada=!!fila.payload.usuario && fila.payload.fotosPorViaje===true;
      let inicio=fila.inicio;
      if(separada && !inicio){
        const {fotos,...datos}=fila.payload;
        const payload={...datos,etapaSalida:'INICIO'};
        inicio=confirmacionInicioViaje(await enviarOperacionViaje(payload),payload);
        const guardada=await editar(opId,actual=>actual?.token===token?{...actual,inicio,enviandoHasta:Date.now()+120000}:actual);
        if(guardada?.token!==token)return {ocupada:true};
      }
      if(separada){
        const salida=resultadoSalida(fila,inicio,true);
        if(soloInicio)return salida;
        await alConfirmarInicio(salida);
      }
      const payload=separada?{...fila.payload,idViaje:inicio.idViaje,etapaSalida:'FOTOS'}:fila.payload;
      const confirmacion=confirmacionInicioViaje(await enviarOperacionViaje(payload),payload);
      await editar(opId,actual=>actual?.token===token?undefined:actual);
      return resultadoSalida(fila,{...confirmacion,kmInicial:confirmacion.kmInicial??inicio?.kmInicial},false);
    }finally{
      await editar(opId,actual=>actual?.token===token?{...actual,token:null,enviandoHasta:0}:actual);
    }
  }

  async function procesar(notificar,filtrar=()=>true,enviarFila=enviar){
    let pendiente;
    const filas=(await pendientes()).filter(filtrar).sort((a,b)=>a.creada-b.creada);
    for(const fila of filas){
      try{
        const salida=await enviarFila(fila.opId);
        if(salida?.ocupada)pendiente=new Error('El envío ya está en proceso.');
        else if(salida)await notificar(salida);
      }catch(error){pendiente=error;}
    }
    if(pendiente)throw pendiente;
  }

  return {guardar,completarUsuario,pendientes,enviar,procesar};
})();

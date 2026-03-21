process.on("uncaughtException", function(err) {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
});
process.on("unhandledRejection", function(reason) {
  console.error("UNHANDLED REJECTION:", reason);
});

const express = require("express");
const axios   = require("axios");
const path    = require("path");
const app     = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const conversations = {};
const orderState    = {};
let   orderCounter  = 100;

// ── COLA PARALELA ─────────────────────────────────────────────────────────────
const colasPorCliente = new Map();
function procesarEnCola(from, tarea) {
  if (!colasPorCliente.has(from)) colasPorCliente.set(from, Promise.resolve());
  var cola = colasPorCliente.get(from);
  var nueva = cola.then(function() {
    return tarea().catch(function(err) { console.error("Error cola " + from + ":", err.message); });
  });
  colasPorCliente.set(from, nueva);
  nueva.then(function() { if (colasPorCliente.get(from) === nueva) colasPorCliente.delete(from); });
  return nueva;
}

function nextOrderNumber() { return ++orderCounter; }

function limpiarNumero(str) {
  if (!str) return "0";
  var s = String(str).toLowerCase().trim();
  if (s === "pendiente") return "0";
  return s.replace(/[^0-9]/g, "") || "0";
}

// ── HORA COLOMBIA UTC-5 ───────────────────────────────────────────────────────
function getHoraColombia() {
  var ahora = new Date();
  return new Date(ahora.getTime() + ahora.getTimezoneOffset() * 60000 - 5 * 60 * 60 * 1000);
}
function getDiaColombiaStr() {
  return ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][getHoraColombia().getDay()];
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vbxuwzcfzfjwhllkppkg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_I5lP9lq6-6t0B0K0PmjyWQ_RiIxiJM5";

function sbH(svc) {
  var k = svc ? (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY) : SUPABASE_KEY;
  return { "apikey": k, "Authorization": "Bearer " + k };
}

// ── RESTAURANTE ───────────────────────────────────────────────────────────────
async function getRestaurante(phoneNumberId) {
  try {
    if (phoneNumberId) {
      var r = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?whatsapp_phone_id=eq." + phoneNumberId + "&select=*", { headers: sbH(false) });
      if (r.data && r.data.length > 0) return r.data[0];
    }
    var fb = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=*&limit=1", { headers: sbH(false) });
    return fb.data && fb.data.length > 0 ? fb.data[0] : null;
  } catch (e) { console.error("getRestaurante:", e.message); return null; }
}

// ── SILENCIO ──────────────────────────────────────────────────────────────────
async function estaEnSilencio(restauranteId, telefono) {
  try {
    var r = await axios.get(SUPABASE_URL + "/rest/v1/silencio_conversacion?restaurante_id=eq." + restauranteId + "&telefono=eq." + encodeURIComponent(telefono) + "&activo=eq.true&select=id", { headers: sbH(true) });
    return r.data && r.data.length > 0;
  } catch (e) { return false; }
}

// ── DIRECCIÓN FRECUENTE ───────────────────────────────────────────────────────
async function getDireccionFrecuente(restauranteId, telefono) {
  try {
    var r = await axios.get(SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restauranteId + "&telefono=eq." + encodeURIComponent(telefono) + "&select=ultima_direccion", { headers: sbH(true) });
    if (r.data && r.data.length > 0 && r.data[0].ultima_direccion) return r.data[0].ultima_direccion;
    return null;
  } catch (e) { return null; }
}

async function guardarDireccionFrecuente(restauranteId, telefono, direccion) {
  if (!direccion || direccion === "Por confirmar") return;
  try {
    await axios.post(SUPABASE_URL + "/rest/v1/clientes_frecuentes?on_conflict=restaurante_id,telefono",
      { restaurante_id: restauranteId, telefono, ultima_direccion: direccion, updated_at: new Date().toISOString() },
      { headers: { ...sbH(true), "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } });
  } catch (e) { console.error("guardarDireccion:", e.message); }
}

// ── MENÚ DINÁMICO ─────────────────────────────────────────────────────────────
async function getMenuDinamico(restauranteId) {
  try {
    var r = await axios.get(SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restauranteId + "&disponible=eq.true&order=categoria,orden&select=*", { headers: sbH(false) });
    var items = r.data || [];
    if (!items.length) return MENU_FALLBACK;
    var grupos = {};
    items.forEach(function(i) { if (!grupos[i.categoria]) grupos[i.categoria] = []; grupos[i.categoria].push(i); });
    var lines = ["\nMENU ACTIVO (solo estos productos disponibles hoy):\n"];
    Object.keys(grupos).forEach(function(cat) {
      lines.push("\n" + cat.toUpperCase() + ":");
      grupos[cat].forEach(function(i) {
        var precio = "$" + Number(i.precio).toLocaleString("es-CO");
        var desc = i.descripcion ? " (" + i.descripcion + ")" : "";
        var tipo = i.es_bebida ? " [bebida]" : (i.es_arepa ? " [arepa]" : "");
        lines.push("- " + i.nombre + ": " + precio + desc + tipo);
      });
    });
    lines.push("\nSi el cliente pide algo que NO esta en esta lista, dile que hoy no esta disponible y ofrece alternativas.\n");
    return lines.join("\n");
  } catch (e) { console.error("getMenuDinamico:", e.message); return MENU_FALLBACK; }
}

// ── GUARDAR PEDIDO ────────────────────────────────────────────────────────────
async function guardarPedidoSupabase(restauranteId, pedidoData) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var subtotal = Number(pedidoData.total) - Number(pedidoData.desechables||0) - Number(pedidoData.domicilio||0);
    var payload = {
      restaurante_id: restauranteId, numero_pedido: pedidoData.orderNumber,
      cliente_tel: pedidoData.phone, items: pedidoData.items,
      subtotal, desechables: pedidoData.desechables, domicilio: pedidoData.domicilio,
      total: pedidoData.total, direccion: pedidoData.address,
      metodo_pago: pedidoData.paymentMethod, estado: "confirmado",
      notas_especiales: pedidoData.notasEspeciales || null,
      pedido_adicional_de: pedidoData.pedidoAdicionalDe || null,
      comprobante_url: pedidoData.comprobanteUrl || null,
      comprobante_media_id: pedidoData.comprobanteMediaId || null
    };
    var response = await axios.post(SUPABASE_URL + "/rest/v1/pedidos", payload, {
      headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=representation" }
    });
    console.log("Pedido #" + pedidoData.orderNumber + " guardado. ID:", response.data[0]?.id || "?");
    notificarDashboard(response.data[0]);
    // Guardar dirección frecuente
    if (pedidoData.address && pedidoData.address !== "Por confirmar") {
      guardarDireccionFrecuente(restauranteId, pedidoData.phone, pedidoData.address);
    }
  } catch (err) {
    console.error("Error guardando pedido:", err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

function notificarDashboard(pedido) {
  var url = process.env.DASHBOARD_WEBHOOK_URL;
  if (!url || !pedido) return;
  axios.post(url, { evento: "nuevo_pedido", pedido }, { timeout: 4000 })
    .then(function() { console.log("Dashboard notificado #" + pedido.numero_pedido); })
    .catch(function(e) { console.error("Error dashboard:", e.message); });
}

async function guardarMensajeSupabase(restauranteId, telefono, mensaje, tipo, comprobanteMediaId) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/mensajes",
      { restaurante_id: restauranteId, telefono, mensaje, tipo, comprobante_media_id: comprobanteMediaId || null },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
  } catch (e) { console.error("guardarMensaje:", e.message); }
}

async function getOrderState(telefono) {
  try {
    var r = await axios.get(SUPABASE_URL + "/rest/v1/order_state?telefono=eq." + encodeURIComponent(telefono) + "&select=*", { headers: sbH(true) });
    return r.data && r.data.length > 0 ? r.data[0].estado : null;
  } catch (e) { return null; }
}
async function setOrderState(telefono, estado) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/order_state?on_conflict=telefono",
      { telefono, estado, updated_at: new Date().toISOString() },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } });
  } catch (e) { console.error("setOrderState:", e.message); }
}
async function deleteOrderState(telefono) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.delete(SUPABASE_URL + "/rest/v1/order_state?telefono=eq." + encodeURIComponent(telefono), { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
  } catch (e) { console.error("deleteOrderState:", e.message); }
}

function getMenuUrl() { return process.env.MENU_PAGE_URL || "https://bit.ly/LaCurvaStreetFood"; }

async function descargarImagenMeta(mediaId) {
  try {
    var token = process.env.WHATSAPP_TOKEN;
    if (!token) return null;
    var urlRes = await axios.get("https://graph.facebook.com/v19.0/" + mediaId, { headers: { "Authorization": "Bearer " + token } });
    var mediaUrl = urlRes.data?.url;
    if (!mediaUrl) return null;
    var imgRes = await axios.get(mediaUrl, { headers: { "Authorization": "Bearer " + token }, responseType: "arraybuffer" });
    return "data:" + (imgRes.headers["content-type"] || "image/jpeg") + ";base64," + Buffer.from(imgRes.data).toString("base64");
  } catch (e) { console.error("descargarImagen:", e.message); return null; }
}

async function sendWhatsAppMessage(to, message, phoneNumberId) {
  var token = process.env.WHATSAPP_TOKEN;
  var pid   = phoneNumberId || process.env.WHATSAPP_PHONE_ID;
  if (!token || !pid) { console.error("Faltan WHATSAPP_TOKEN o PHONE_ID"); return; }
  var toNum = to.replace(/[^0-9]/g, "");
  if (!toNum.startsWith("57") && toNum.length === 10) toNum = "57" + toNum;
  try {
    await axios.post("https://graph.facebook.com/v19.0/" + pid + "/messages",
      { messaging_product: "whatsapp", to: toNum, type: "text", text: { body: message } },
      { headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" } });
    console.log("Enviado a " + toNum);
  } catch (e) { console.error("sendWA:", e.response ? JSON.stringify(e.response.data) : e.message); }
}

function estaEnHorario(restaurante) {
  try {
    var col = getHoraColombia();
    var hora = col.getHours() * 60 + col.getMinutes();
    var ap = (restaurante.hora_apertura || "16:00:00").split(":").map(Number);
    var ci = (restaurante.hora_cierre   || "00:00:00").split(":").map(Number);
    var minAp = ap[0] * 60 + ap[1], minCi = ci[0] * 60 + ci[1];
    var dias = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    var diaHoy = dias[col.getDay()];
    var diasAct = (restaurante.dias_activos || "lunes,martes,miercoles,jueves,viernes,sabado,domingo").split(",");
    if (!diasAct.includes(diaHoy)) return false;
    if (minCi <= minAp) return hora >= minAp || hora <= minCi;
    return hora >= minAp && hora <= minCi;
  } catch (e) { return true; }
}

function getMenuConfig(restaurante) {
  var modoDia = restaurante.modo_dia || false;
  if (modoDia && restaurante.menu_dia && restaurante.menu_dia.trim().length > 10) return restaurante.menu_dia;
  if (!modoDia && restaurante.menu_noche && restaurante.menu_noche.trim().length > 10) return restaurante.menu_noche;
  return null;
}

function getMensaje(restaurante, clave, fallback) {
  return (restaurante && restaurante[clave] && restaurante[clave].trim()) ? restaurante[clave].trim() : fallback;
}

const MENU_FALLBACK = `
HAMBURGUESAS TRADICIONALES:
- La especial: $18.900 - La sencilla: $16.900 - La curva: $29.900
- La Mega especial: $37.900 - La doble carne: $24.900 - La super queso: $22.900 - La de pollo: $19.900

HAMBURGUESAS ANGUS (papa rustica, chipotle, tocineta, queso cheddar, cebolla morada):
- Angus Especial: $26.900 - Angus Doble: $36.900 - Angus Mixta: $37.900 - Madurita: $29.900
- Montanera: $35.900 - Celestina: $31.900 - BBQ King: $30.900 - La mela: $29.400 - Mexicana: $32.900

HOT DOGS:
- Italiano: $16.900 - Italo-ranchero: $17.900 - Mexicano: $18.400 - Perro la Curva: $29.400
- Chuzo-pan: $19.900 - Chori-perro: $18.900 - Americano: $19.900 - La perra: $18.900

SALCHIPAPAS:
- Sencilla: $17.400 - Criolla: $22.400 - Especial: $36.400 - Mega costena: $58.900

COMBOS: Aplastado especial: $22.900 | Hamburguesa: $23.900 | Perro italiano: $21.900 | 3 Angus+Coca: $81.900

DESGRANADOS: Gratinados $18.900 | Rancheros $22.900 | Especial pollo/tocineta $26.400 | Hawaiano $16.900 | Mixto $34.900 | Mega $39.900

CHUZOS (papa amarilla y ensalada): Lomo viche $29.400 | Pollo $22.400 | Mixto $24.900 | Costilla $20.900

ALITAS: x6 $21.900 | x12 $39.900 | x18 $55.900 | x24+limonada $68.900

ASADOS (papa amarilla y ensalada): Caracho 380gr $39.900 | Punta anca $39.900 | Lomo cerdo $34.900 | Pollo $32.900 | Tabla curva $41.900 | Costilla BBQ $42.900
ASADOS JUNIOR: Caracho $24.900 | Punta anca $25.900 | Lomo cerdo $20.900 | Pollo $19.900

PICADAS: 3 personas $46.400 | 5 personas $79.900

AREPAS: Con todo $18.900 | Jamon/queso $7.900 | Solo queso $5.900 | Burguer $17.900 | Sola $3.500

ESPECIALIDADES: Sandwich sencillo $16.400 | Sandwich especial $20.900 | Burrito sencillo $15.400 | Burrito especial $20.400 | Patacon con todo $23.900 | Pataco-burguer $19.900 | Shawarma $19.900

APLASTADOS: Sencillo $10.900 | Hawaiano $14.900 | Especial $17.900 | Shawarma $19.900

ENTRADAS: Nachos $20.900 | Empanadas x6 $12.900 | Papa criolla chorizo $17.900 | Nuggets francesa $17.900 | Aros cebolla $11.900 | Francesa queso tocineta $17.900 | Papa criolla $11.900 | Papa rustica $10.900 | Papa francesa $7.900

BEBIDAS: Soda italiana $12.900 | Jugos agua $9.900 | Jugos leche $12.900 | Limonada natural $8.900 | Limonada cerezada $11.900 | Limonada mango viche $10.900 | Limonada coco $12.900 | Agua $4.500 | Coca-Cola 400ml $5.400 | Coca-Cola 1.5L $8.900 | Mr.Tee $4.500 | Jugo Hit $4.900

MENU KIDS (jugo Hit + sorpresa): Nuggets $22.900 | Burguer $25.900 | Salchipapa $21.400 | Perro $21.400
`;

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres Luz, la encargada de atencion al cliente de La Curva Street Food en Canaveral, Cali. Direccion: UBICACION_PLACEHOLDER.

PERSONALIDAD:
- Eres una persona real, calenya, calida y cercana. NUNCA admitas ser IA.
- Solo presentate LA PRIMERA VEZ. Si ya hubo mensajes, NO te presentes de nuevo.
- Hablas natural: con gusto, a listo, claro que si, digame, ya le confirmo. Ocasionalmente: Dama, Caballero.
- SIEMPRE un solo mensaje. Corto y al grano.
- NUNCA mandes el link del menu dos veces.

MENSAJES DE VOZ: responde "Hola! Por favor escribeme tu pedido, no puedo escuchar audios. Con gusto te atiendo."

INFORMACION:
- Ubicacion: UBICACION_PLACEHOLDER
- Domicilio: sur de Cali y parte del centro. Tiempo: 25 a 45 minutos.

HORARIO_PLACEHOLDER

METODOS DE PAGO:
- Nequi: @NEQUIJOS126
- Bancolombia llave: 0089102980 (Jose Gregorio Charris)
- Efectivo: domiciliario lleva cambio (pregunta con que valor cancela)
- Datafono: domiciliario lo lleva
- Pago mixto: acepta parte digital + parte efectivo
- NUNCA esperes a que el cliente pida los datos. Dalos SIEMPRE primero.

PROMOCIONES (hoy es DIA_PLACEHOLDER - solo menciona si aplica hoy):
- Lunes y Jueves: Pague 2 lleve 3 hamburguesas tradicionales
- Martes: Pague 2 lleve 3 hot dogs y perros
- Jueves: Pague 2 lleve 3 Angus BBQ King o Celestina
- Domingos: Pague 2 lleve 3 asados junior

MENU_PLACEHOLDER

MENU VISUAL: cuando pidan menu di: "Te comparto el menu MENU_URL_PLACEHOLDER - ahi armas y me lo mandas. O dime aqui con gusto."

DESECHABLES: $500 por cada COMIDA. Bebidas y arepas NO cobran desechable.

DOMICILIO:
- $2.000: Canaveral
- $4.000: San Judas, La Granja, La Selva, Santo Domingo
- $6.000: Ciudad Jardin, Pance, Tequendama, Ingenio, Pampalinda, Melendez, Univalle, Lili, Mojica, Poblado, Mario Correa, Valle del Lili, Calipso, Compartir, Capri, Niza, Caney, Santa Barbara, San Joaquin, centro, extremos
- Barrio desconocido: $4.000 y avisa que puede variar $1.000

CALCULO - muestra siempre:
Productos:    $XX.XXX
Desechables:  $XXX
Domicilio:    $X.XXX
TOTAL:        $XX.XXX

DIRECCION FRECUENTE:
DIRECCION_FRECUENTE_PLACEHOLDER

CUPONES:
CUPONES_PLACEHOLDER

RECOMENDACIONES Y NOTAS ESPECIALES DEL CLIENTE:
- Si el cliente pide algo especial como salsas extras, sin ingrediente, doble porcion, nota especial, instruccion de preparacion o cualquier preferencia personal: incluirlo en los ITEMS del pedido entre parentesis. Ejemplo: "La Especial $18.900 (sin cebolla, extra chimichurri)"
- Esto es MUY importante para que el restaurante vea la nota en el panel.

PEDIDO ADICIONAL A ORDEN YA CONFIRMADA:
- Si el cliente ya tiene un pedido confirmado (status entregado o cerrado) y quiere agregar algo mas, es un PEDIDO ADICIONAL.
- Escribe al final: PEDIDO_ADICIONAL_DE:[numero del pedido original]
- Ejemplo: si su pedido original fue #104 y quiere agregar algo, escribe PEDIDO_ADICIONAL_DE:104

IMAGENES:
- Si el cliente envia una imagen Y tiene un pedido activo esperando pago: es probablemente un comprobante. Confirma el pedido.
- Si el cliente envia una imagen SIN pedido activo o en medio de una conversacion normal: NO asumas que es comprobante. Responde: "Hola! Vi que enviaste una imagen. Puedes contarme que necesitas o que quieres pedir?"
- NUNCA confirmes un pedido por una imagen si no hay pedido activo pendiente de pago.

PREGUNTAS SIN RESPUESTA:
- Si el cliente pregunta algo que no puedes responder con certeza (disponibilidad especial, precio de algo que no esta en el menu, tiempo exacto de entrega, si pueden hacer algo especial, disponibilidad de ingrediente especifico):
  Responde: "Un momento, ya te confirmo ese detalle."
  Y escribe al final: ALERTA_PREGUNTA:[la pregunta del cliente]

FLUJO:
1. Saludo -> mensaje amable + link menu
2. Cliente pide -> confirma con precios. Incluye notas especiales en los items.
3. Pregunta direccion COMPLETA: calle, numero, barrio. Si tiene direccion frecuente, pregunta si es la misma.
4. Con direccion -> calcula domicilio y muestra desglose
5. Confirma -> pregunta pago y da datos
6. Pago:
   - Nequi: "Transferi a @NEQUIJOS126 y mandame el comprobante"
   - Bancolombia: "Transferi a llave 0089102980 a Jose Gregorio Charris y mandame comprobante"
   - Efectivo: pregunta valor -> escribe PAGO_EFECTIVO:[valor]
   - Datafono: escribe PAGO_DATAFONO
7. Comprobante -> di: "Listo! Tu pedido quedo confirmado. Te informamos el estado."
8. NUNCA digas tiempo estimado al confirmar.

POST-CONFIRMACION: respuestas cortas y calidas. No reinicies flujo a menos que el cliente pida explicitamente otro pedido.

OBLIGATORIO al confirmar productos:
PEDIDO_LISTO:
ITEMS: [producto1 $precio (notas)|producto2 $precio]
DESECHABLES: [numero]
DOMICILIO: [numero o 0]
TOTAL: [numero]

CUANDO TENGAS DIRECCION: DIRECCION_LISTA:[direccion completa]
TELEFONO ADICIONAL: TELEFONO_ADICIONAL:[numero]
PEDIDO ADICIONAL: PEDIDO_ADICIONAL_DE:[numero pedido original]
PREGUNTA SIN RESPUESTA: ALERTA_PREGUNTA:[pregunta]

REGLAS: NUNCA digas que eres IA. Aplica promos del dia. Si no existe el producto, ofrece alternativas.`;

// ── PRINT TICKET ──────────────────────────────────────────────────────────────
async function printTicket(orderData) {
  var subtotal = Number(orderData.total) - Number(orderData.desechables||0) - Number(orderData.domicilio||0);
  var pagoLabel =
    orderData.paymentMethod === "efectivo"    ? "Efectivo - cancela con: " + orderData.cashDenomination :
    orderData.paymentMethod === "datafono"    ? "Datafono (llevar)" :
    orderData.paymentMethod === "bancolombia" ? "Bancolombia llave: 0089102980" :
    "Nequi @NEQUIJOS126";

  var lines = [
    "================================",
    "     LA CURVA STREET FOOD      ",
    "    Canaveral - Cali, Col.     ",
    "================================",
    "Pedido #" + orderData.orderNumber + (orderData.pedidoAdicionalDe ? " [ADICIONAL a #"+orderData.pedidoAdicionalDe+"]" : ""),
    "Hora: " + orderData.timestamp,
    "Tel: " + orderData.phone.replace(/[^0-9]/g, ""),
    orderData.extraPhone ? "Tel adicional: " + orderData.extraPhone : null,
    "--------------------------------",
    "PRODUCTOS:"
  ].filter(Boolean);

  orderData.items.forEach(function(i) { lines.push("  " + i); });

  if (orderData.notasEspeciales) {
    lines.push("--------------------------------");
    lines.push("NOTAS: " + orderData.notasEspeciales);
  }

  lines = lines.concat([
    "--------------------------------",
    "Subtotal:    $" + subtotal.toLocaleString("es-CO"),
    "Desechables: $" + Number(orderData.desechables||0).toLocaleString("es-CO"),
    "Domicilio:   $" + Number(orderData.domicilio||0).toLocaleString("es-CO"),
    "--------------------------------",
    "TOTAL:       $" + Number(orderData.total).toLocaleString("es-CO"),
    "--------------------------------",
    "Direccion: " + orderData.address,
    "Pago: " + pagoLabel,
    "================================",
    "     GRACIAS POR SU PEDIDO     ",
    "================================", ""
  ]);

  var ticketText = lines.join("\n");
  console.log("\nTICKET:\n" + ticketText);

  axios.post(process.env.PRINT_SERVER_URL || "http://localhost:3001/print", {
    secret: process.env.PRINT_SECRET || "lacurva2024",
    orderNumber: orderData.orderNumber, timestamp: orderData.timestamp,
    phone: orderData.phone.replace(/[^0-9]/g, ""), extraPhone: orderData.extraPhone || null,
    items: orderData.items, subtotal,
    desechables: Number(orderData.desechables||0), domicilio: Number(orderData.domicilio||0),
    total: Number(orderData.total), address: orderData.address,
    paymentMethod: orderData.paymentMethod, cashDenomination: orderData.cashDenomination || null,
    notasEspeciales: orderData.notasEspeciales || null,
    pedidoAdicionalDe: orderData.pedidoAdicionalDe || null
  }, { timeout: 6000 })
    .then(function() { console.log("Ticket #" + orderData.orderNumber + " enviado a impresora"); })
    .catch(function(e) { console.error("Error impresora:", e.message); });

  return ticketText;
}

// ── PARSE REPLY ───────────────────────────────────────────────────────────────
function parseReply(reply, from) {
  var cleanReply = reply;
  var sideEffect = null;

  if (reply.indexOf("PEDIDO_LISTO:") !== -1) {
    var itemsMatch  = reply.match(/ITEMS:\s*(.+)/);
    var totalMatch  = reply.match(/TOTAL:\s*([^\n]+)/);
    var desechMatch = reply.match(/DESECHABLES:\s*([^\n]+)/);
    var domMatch    = reply.match(/DOMICILIO:\s*([^\n]+)/);

    if (itemsMatch && totalMatch) {
      var items = itemsMatch[1].split("|").map(function(i) { return i.trim(); });
      var total = limpiarNumero(totalMatch[1]);
      var desech = limpiarNumero(desechMatch ? desechMatch[1] : "0");
      var domicilio = limpiarNumero(domMatch ? domMatch[1] : "0");

      // Extraer notas especiales de los items (texto entre parentesis)
      var notasArr = [];
      items.forEach(function(item) {
        var m = item.match(/\(([^)]+)\)/);
        if (m) notasArr.push(m[1]);
      });

      orderState[from] = {
        status: "esperando_direccion",
        orderNumber: nextOrderNumber(),
        items, desechables: desech, domicilio, total,
        notasEspeciales: notasArr.length > 0 ? notasArr.join(" | ") : null
      };
      console.log("orderState #" + orderState[from].orderNumber + " para:", from);
      sideEffect = "pedido_registrado";
    }
    cleanReply = cleanReply.replace(/PEDIDO_LISTO:[\s\S]*?(?=DIRECCION_LISTA:|TELEFONO_ADICIONAL:|PAGO_|PEDIDO_ADICIONAL_DE:|ALERTA_PREGUNTA:|$)/g, "").trim();
  }

  if (reply.indexOf("DIRECCION_LISTA:") !== -1) {
    var dirMatch = reply.match(/DIRECCION_LISTA:(.+)/);
    if (dirMatch && orderState[from]) { orderState[from].address = dirMatch[1].trim(); orderState[from].status = "esperando_pago"; sideEffect = "direccion_registrada"; }
    cleanReply = cleanReply.replace(/DIRECCION_LISTA:.+/g, "").trim();
  }

  if (reply.indexOf("TELEFONO_ADICIONAL:") !== -1) {
    var telMatch = reply.match(/TELEFONO_ADICIONAL:(.+)/);
    if (telMatch && orderState[from]) orderState[from].extraPhone = telMatch[1].trim();
    cleanReply = cleanReply.replace(/TELEFONO_ADICIONAL:.+/g, "").trim();
  }

  if (reply.indexOf("PEDIDO_ADICIONAL_DE:") !== -1) {
    var addMatch = reply.match(/PEDIDO_ADICIONAL_DE:(.+)/);
    if (addMatch && orderState[from]) orderState[from].pedidoAdicionalDe = addMatch[1].trim();
    cleanReply = cleanReply.replace(/PEDIDO_ADICIONAL_DE:.+/g, "").trim();
  }

  if (reply.indexOf("ALERTA_PREGUNTA:") !== -1) {
    var pregMatch = reply.match(/ALERTA_PREGUNTA:(.+)/);
    if (pregMatch) {
      sideEffect = "alerta_pregunta";
      if (orderState[from]) orderState[from].alertaPregunta = pregMatch[1].trim();
      else orderState[from] = { alertaPregunta: pregMatch[1].trim() };
    }
    cleanReply = cleanReply.replace(/ALERTA_PREGUNTA:.+/g, "").trim();
  }

  if (reply.indexOf("PAGO_EFECTIVO:") !== -1) {
    var cashMatch = reply.match(/PAGO_EFECTIVO:(.+)/);
    if (cashMatch && orderState[from]) { orderState[from].paymentMethod = "efectivo"; orderState[from].cashDenomination = cashMatch[1].trim(); orderState[from].status = "confirmado"; sideEffect = "pago_confirmado"; }
    cleanReply = cleanReply.replace(/PAGO_EFECTIVO:.+/g, "").trim();
  }

  if (reply.indexOf("PAGO_DATAFONO") !== -1) {
    if (orderState[from]) { orderState[from].paymentMethod = "datafono"; orderState[from].status = "confirmado"; sideEffect = "pago_confirmado"; }
    cleanReply = cleanReply.replace("PAGO_DATAFONO", "").trim();
  }

  if (reply.indexOf("PAGO_CONFIRMADO") !== -1) {
    if (orderState[from]) { orderState[from].paymentMethod = orderState[from].paymentMethod || "digital"; orderState[from].status = "confirmado"; sideEffect = "pago_confirmado"; }
    cleanReply = cleanReply.replace("PAGO_CONFIRMADO", "").trim();
  }

  return { cleanReply, sideEffect };
}

// ── RUTAS ─────────────────────────────────────────────────────────────────────
app.get("/menu",        function(req, res) { res.sendFile(path.join(__dirname, "menu.html")); });
app.get("/admin",       function(req, res) { res.sendFile(path.join(__dirname, "admin.html")); });
app.get("/restaurante", function(req, res) { res.sendFile(path.join(__dirname, "restaurante.html")); });

app.post("/api/pedido-estado", async function(req, res) {
  var { id, estado, telefono_cliente, numero_pedido, restaurante_id } = req.body;
  if (!id || !estado) return res.status(400).json({ error: "Faltan datos" });
  var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id, { estado },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
    if (telefono_cliente) {
      var restaurante = null;
      if (restaurante_id) {
        try { var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id + "&select=*", { headers: sbH(false) }); if (rr.data?.length) restaurante = rr.data[0]; } catch(e) {}
      }
      var numStr = numero_pedido ? " #" + numero_pedido : "";
      var pid = process.env.WHATSAPP_PHONE_ID;
      if (estado === "en_preparacion") {
        var msg = getMensaje(restaurante, "msg_en_preparacion", "Tu pedido" + numStr + " ya esta en preparacion! En breve estara listo.");
        await sendWhatsAppMessage(telefono_cliente, msg, pid);
        if (restaurante_id) guardarMensajeSupabase(restaurante_id, telefono_cliente, msg, "estado_luz", null);
      }
      if (estado === "listo") {
        var msg = getMensaje(restaurante, "msg_listo", "Tu pedido" + numStr + " esta listo y esperando al domiciliario!");
        await sendWhatsAppMessage(telefono_cliente, msg, pid);
        if (restaurante_id) guardarMensajeSupabase(restaurante_id, telefono_cliente, msg, "estado_luz", null);
      }
      if (estado === "en_camino") {
        var msg = getMensaje(restaurante, "msg_en_camino", "Tu pedido" + numStr + " ya va en camino. Llega en 25-35 minutos. Que lo disfrutes!");
        await sendWhatsAppMessage(telefono_cliente, msg, pid);
        if (restaurante_id) guardarMensajeSupabase(restaurante_id, telefono_cliente, msg, "estado_luz", null);
      }
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.response ? JSON.stringify(err.response.data) : err.message }); }
});

app.post("/api/menu-toggle", async function(req, res) {
  if (!req.body.id) return res.status(400).json({ error: "Falta id" });
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/menu_items?id=eq." + req.body.id, { disponible: req.body.disponible },
      { headers: { ...sbH(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/menu-add", async function(req, res) {
  try {
    await axios.post(SUPABASE_URL + "/rest/v1/menu_items", req.body, { headers: { ...sbH(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/restaurante-config", async function(req, res) {
  if (!req.body.restaurante_id || !req.body.config) return res.status(400).json({ error: "Faltan datos" });
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id, req.body.config,
      { headers: { ...sbH(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.response ? JSON.stringify(e.response.data) : e.message }); }
});

app.post("/enviar-mensaje-cliente", async function(req, res) {
  if (!req.body.telefono || !req.body.mensaje) return res.status(400).json({ error: "Faltan datos" });
  try {
    await sendWhatsAppMessage(req.body.telefono, req.body.mensaje, process.env.WHATSAPP_PHONE_ID);
    if (req.body.restaurante_id) guardarMensajeSupabase(req.body.restaurante_id, req.body.telefono, req.body.mensaje, "restaurante", null);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── PEDIDO MANUAL DESDE PANEL ─────────────────────────────────────────────────
app.post("/api/pedido-manual", async function(req, res) {
  var { restaurante_id, telefono, items, total, desechables, domicilio, direccion, metodo_pago, notas_especiales } = req.body;
  if (!restaurante_id || !telefono || !items || !total) return res.status(400).json({ error: "Faltan datos" });
  try {
    var num = ++orderCounter;
    var subtotal = Number(total) - Number(desechables||0) - Number(domicilio||0);
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var payload = {
      restaurante_id, numero_pedido: num,
      cliente_tel: telefono,
      items: Array.isArray(items) ? items : items.split("\n").filter(function(l){return l.trim();}),
      subtotal, desechables: Number(desechables||0), domicilio: Number(domicilio||0),
      total: Number(total), direccion: direccion || "Por confirmar",
      metodo_pago: metodo_pago || "digital", estado: "confirmado",
      notas_especiales: notas_especiales || null
    };
    var response = await axios.post(SUPABASE_URL + "/rest/v1/pedidos", payload, {
      headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=representation" }
    });
    if (direccion) guardarDireccionFrecuente(restaurante_id, telefono, direccion);
    res.json({ ok: true, numero_pedido: num, id: response.data[0]?.id });
  } catch (e) { res.status(500).json({ ok: false, error: e.response ? JSON.stringify(e.response.data) : e.message }); }
});

app.post("/notificar-cliente", async function(req, res) {
  if (!req.body.telefono) return res.status(400).json({ error: "Telefono requerido" });
  var restaurante = null;
  if (req.body.restaurante_id) {
    try { var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id + "&select=*", { headers: sbH(false) }); if (rr.data?.length) restaurante = rr.data[0]; } catch(e) {}
  }
  var numStr = req.body.numero_pedido ? " #" + req.body.numero_pedido : "";
  try {
    var msg = getMensaje(restaurante, "msg_en_camino", "Tu pedido" + numStr + " ya va en camino. Llega en 25-35 minutos. Que lo disfrutes!");
    await sendWhatsAppMessage(req.body.telefono, msg, process.env.WHATSAPP_PHONE_ID);
    if (req.body.restaurante_id) guardarMensajeSupabase(req.body.restaurante_id, req.body.telefono, msg, "estado_luz", null);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/enviar-promo", async function(req, res) {
  if (!req.body.restaurante_id || !req.body.mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var hace30 = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    var resp = await axios.get(SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + req.body.restaurante_id + "&created_at=gte." + hace30 + "&select=cliente_tel",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
    var unicos = {};
    (resp.data||[]).forEach(function(p) { if (p.cliente_tel) unicos[p.cliente_tel] = true; });
    var telefonos = Object.keys(unicos);
    if (!telefonos.length) return res.json({ ok: true, enviados: 0, fallidos: 0, total: 0 });
    var enviados = 0, fallidos = 0;
    for (var i = 0; i < telefonos.length; i++) {
      try { await sendWhatsAppMessage(telefonos[i], req.body.mensaje, process.env.WHATSAPP_PHONE_ID); enviados++; }
      catch (e) { fallidos++; }
      if (i < telefonos.length - 1) await new Promise(function(r) { setTimeout(r, 300); });
    }
    res.json({ ok: true, enviados, fallidos, total: telefonos.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.response ? JSON.stringify(e.response.data) : e.message }); }
});

app.get("/api/comprobante/:mediaId", async function(req, res) {
  try {
    var imgData = await descargarImagenMeta(req.params.mediaId);
    if (!imgData) return res.status(404).json({ error: "No se pudo obtener imagen" });
    var matches = imgData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches) return res.status(500).json({ error: "Formato invalido" });
    res.setHeader("Content-Type", matches[1]);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(matches[2], "base64"));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/chat/:telefono", async function(req, res) {
  if (!req.query.restaurante_id) return res.json({ ok: true, mensajes: [] });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/mensajes?restaurante_id=eq." + req.query.restaurante_id + "&telefono=eq." + encodeURIComponent(req.params.telefono) + "&order=created_at.asc&limit=150",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
    res.json({ ok: true, mensajes: r.data || [] });
  } catch (e) { res.json({ ok: true, mensajes: [] }); }
});

// API para obtener direccion frecuente del cliente
app.get("/api/cliente/:telefono", async function(req, res) {
  if (!req.query.restaurante_id) return res.json({ ok: true, cliente: null });
  try {
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + req.query.restaurante_id + "&telefono=eq." + encodeURIComponent(req.params.telefono) + "&select=*",
      { headers: sbH(true) });
    res.json({ ok: true, cliente: r.data && r.data.length > 0 ? r.data[0] : null });
  } catch (e) { res.json({ ok: true, cliente: null }); }
});

app.delete("/api/pedido/:id", async function(req, res) {
  var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  try {
    await axios.delete(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + req.params.id, { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// API para guardar alerta de pregunta sin respuesta
app.post("/api/alerta-pregunta", async function(req, res) {
  var { restaurante_id, telefono, pregunta, numero_pedido } = req.body;
  if (!restaurante_id || !pregunta) return res.status(400).json({ error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/mensajes",
      { restaurante_id, telefono, mensaje: "ALERTA_PREGUNTA: " + pregunta, tipo: "alerta_pregunta" },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/webhook", function(req, res) {
  var mode = req.query["hub.mode"], token = req.query["hub.verify_token"], challenge = req.query["hub.challenge"];
  var VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "luz_verify_token_2026";
  if (mode === "subscribe" && token === VERIFY_TOKEN) { console.log("Webhook verificado"); return res.status(200).send(challenge); }
  if (!mode) return res.send("LUZ esta activa - La Curva Street Food");
  res.sendStatus(403);
});

app.post("/webhook", function(req, res) {
  res.sendStatus(200);
  try {
    var body = req.body;
    if (!body.object || body.object !== "whatsapp_business_account") return;
    var entry = body.entry?.[0], changes = entry?.changes?.[0], value = changes?.value;
    if (!value?.messages?.length) return;
    var msg = value.messages[0];
    var from = msg.from;
    var phoneNumberId = value.metadata?.phone_number_id;
    procesarEnCola(from, function() { return procesarMensaje(msg, from, phoneNumberId); });
  } catch (e) { console.error("Error webhook:", e.message); }
});

async function procesarMensaje(msg, from, phoneNumberId) {
  try {
    var msgType = msg.type;

    if (msgType === "audio") {
      await sendWhatsAppMessage(from, "Hola! Por favor escribeme tu pedido, no puedo escuchar audios. Con gusto te atiendo.", phoneNumberId);
      return;
    }

    var userText = "", mediaId = null, esImagen = false;

    if (msgType === "text") {
      userText = msg.text?.body?.trim() || "";
    } else if (msgType === "image" || msgType === "document" || msgType === "sticker") {
      mediaId = msg.image?.id || msg.document?.id || null;
      esImagen = true;
      var caption = msg.image?.caption || msg.document?.caption || "";
      userText = caption
        ? caption + " [El cliente envio una imagen]"
        : "[El cliente envio una imagen]";
    } else if (msgType === "location") {
      var loc = msg.location;
      userText = "Mi ubicacion es: lat " + loc.latitude + ", lng " + loc.longitude + (loc.name ? " (" + loc.name + ")" : "");
    } else if (msgType === "interactive") {
      userText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
    } else if (msgType === "reaction") {
      return; // ignorar reacciones
    } else {
      console.log("Tipo no soportado: " + msgType); return;
    }

    if (!userText) return;

    // Recuperar orderState
    if (!orderState[from]) {
      var saved = await getOrderState(from);
      if (saved) { orderState[from] = saved; console.log("orderState recuperado para:", from); }
    }

    var restaurante = await getRestaurante(phoneNumberId);
    if (restaurante) {
      if (restaurante.estado !== "activo") { console.log("Restaurante inactivo"); return; }
      if (!estaEnHorario(restaurante)) { console.log("Fuera de horario"); return; }

      var silencio = await estaEnSilencio(restaurante.id, from);
      if (silencio) {
        console.log("SILENCIO para:", from);
        guardarMensajeSupabase(restaurante.id, from, userText, "cliente", esImagen ? mediaId : null).catch(function(){});
        return;
      }
    }

    // Determinar si imagen es comprobante o no
    var esComprobante = false;
    if (esImagen && mediaId) {
      // Solo es comprobante si hay pedido activo esperando pago
      var hayPedidoActivo = orderState[from] && (orderState[from].status === "esperando_pago" || orderState[from].status === "confirmado");
      if (hayPedidoActivo) {
        esComprobante = true;
        userText = "[El cliente envio una imagen, posiblemente comprobante de pago]";
      }
      // Si no hay pedido activo, Luz preguntara que es
    }

    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: userText });
    if (conversations[from].length > 20) conversations[from] = conversations[from].slice(-20);

    // Obtener menu
    var menuParaPrompt;
    if (restaurante) {
      var menuConfig = getMenuConfig(restaurante);
      menuParaPrompt = menuConfig || await getMenuDinamico(restaurante.id);
    } else {
      menuParaPrompt = MENU_FALLBACK;
    }

    var ubicacion = restaurante?.direccion || "Cl. 16 #56-40, Canaveral, Cali";
    var horaCol = getHoraColombia();
    var horaStr = horaCol.getHours().toString().padStart(2,"0") + ":" + horaCol.getMinutes().toString().padStart(2,"0");
    var diaHoy = getDiaColombiaStr();

    // Obtener direccion frecuente
    var dirFrecuente = null;
    if (restaurante) dirFrecuente = await getDireccionFrecuente(restaurante.id, from);

    var dirFrecuenteTexto = dirFrecuente
      ? "Este cliente ya ha pedido antes. Su ultima direccion fue: " + dirFrecuente + ". Si pide de nuevo, preguntale: 'Te lo mando a " + dirFrecuente + " igual que la vez anterior?' Espera confirmacion antes de asumir."
      : "No hay direccion previa registrada para este cliente.";

    // Obtener cupones activos
    var cuponesTexto = "No hay cupones activos en este momento.";
    if (restaurante && restaurante.cupones_activos) {
      try {
        var cupones = JSON.parse(restaurante.cupones_activos);
        if (cupones && cupones.length > 0) {
          cuponesTexto = "Cupones activos:\n" + cupones.map(function(c) {
            var desc = c.tipo === "porcentaje" ? c.valor + "% de descuento" : "$" + Number(c.valor).toLocaleString("es-CO") + " de descuento";
            return "- Codigo: " + c.codigo + " -> " + desc + (c.descripcion ? " (" + c.descripcion + ")" : "");
          }).join("\n");
          cuponesTexto += "\nSi el cliente menciona un codigo valido, aplica el descuento al total y mencionalo en los items del PEDIDO_LISTO.";
        }
      } catch(e) {}
    }

    var bienvenidaExtra = "";
    var msgBienvenida = getMensaje(restaurante, "msg_bienvenida", "");
    if (msgBienvenida && conversations[from].length === 1) {
      bienvenidaExtra = "\n\nMENSAJE DE BIENVENIDA PERSONALIZADO:\n" + msgBienvenida;
    }

    var horarioInfo = restaurante
      ? "Atiendes de " + (restaurante.hora_apertura||"16:00").substring(0,5) + " a " + (restaurante.hora_cierre||"00:00").substring(0,5) + ". Hora actual en Colombia: " + horaStr + ". Estas en horario activo ahora."
      : "Atiendes de 4:00pm a 12:00am. Hora actual: " + horaStr;

    var systemFinal = SYSTEM_PROMPT
      .replace(/MENU_URL_PLACEHOLDER/g, getMenuUrl())
      .replace(/MENU_PLACEHOLDER/g, "MENU ACTIVO:\n" + menuParaPrompt)
      .replace(/UBICACION_PLACEHOLDER/g, ubicacion)
      .replace(/HORARIO_PLACEHOLDER/g, "HORARIO: " + horarioInfo)
      .replace(/DIA_PLACEHOLDER/g, diaHoy)
      .replace(/DIRECCION_FRECUENTE_PLACEHOLDER/g, dirFrecuenteTexto)
      .replace(/CUPONES_PLACEHOLDER/g, cuponesTexto)
      + bienvenidaExtra;

    var claudeResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: "claude-haiku-4-5-20251001", max_tokens: 2000, system: systemFinal, messages: conversations[from] },
      { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } }
    );

    if (!claudeResponse.data?.content?.[0]) {
      await sendWhatsAppMessage(from, "Hola! Tengo un problemita tecnico. Escribeme en un momento.", phoneNumberId);
      return;
    }

    var rawReply = claudeResponse.data.content[0].text;
    console.log("RAW:", rawReply.substring(0, 300));
    var parsed = parseReply(rawReply, from);
    var cleanReply = parsed.cleanReply;
    var sideEffect = parsed.sideEffect;

    // Comprobante confirmado
    if (esComprobante && mediaId && orderState[from]) {
      orderState[from].comprobanteMediaId = mediaId;
      orderState[from].comprobanteUrl = "/api/comprobante/" + mediaId;
      orderState[from].paymentMethod = orderState[from].paymentMethod || "digital";
      orderState[from].status = "confirmado";
      sideEffect = "pago_confirmado";
    }

    // Alerta pregunta sin respuesta
    if (sideEffect === "alerta_pregunta" && restaurante && orderState[from]?.alertaPregunta) {
      guardarMensajeSupabase(restaurante.id, from, "ALERTA_PREGUNTA: " + orderState[from].alertaPregunta, "alerta_pregunta", null).catch(function(){});
    }

    conversations[from].push({ role: "assistant", content: rawReply });
    await sendWhatsAppMessage(from, cleanReply, phoneNumberId);

    console.log("De " + from + ": " + userText.substring(0, 80));
    console.log("Luz: " + cleanReply.substring(0, 100));

    if (restaurante) {
      guardarMensajeSupabase(restaurante.id, from, userText, "cliente", esImagen && !esComprobante ? mediaId : null).catch(function(){});
      guardarMensajeSupabase(restaurante.id, from, cleanReply, "restaurante", null).catch(function(){});
    }

    if (orderState[from] && sideEffect !== "pago_confirmado") {
      await setOrderState(from, orderState[from]);
    }

    console.log("sideEffect:", sideEffect, "| orderState:", !!orderState[from]);

    if (sideEffect === "pago_confirmado" && orderState[from]) {
      var state = orderState[from];
      var timestamp = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

      await printTicket({
        orderNumber: state.orderNumber, items: state.items,
        desechables: state.desechables, domicilio: state.domicilio, total: state.total,
        address: state.address || "Por confirmar", paymentMethod: state.paymentMethod || "digital",
        cashDenomination: state.cashDenomination || null, extraPhone: state.extraPhone || null,
        phone: from, timestamp,
        notasEspeciales: state.notasEspeciales || null,
        pedidoAdicionalDe: state.pedidoAdicionalDe || null
      });

      var restId = restaurante?.id || null;
      if (!restId) {
        try {
          var svcKey2 = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
          var rf = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=id&limit=1", { headers: { "apikey": svcKey2, "Authorization": "Bearer " + svcKey2 } });
          if (rf.data?.length) restId = rf.data[0].id;
        } catch (e) {}
      }

      if (restId) {
        await guardarPedidoSupabase(restId, {
          orderNumber: state.orderNumber, phone: from, items: state.items,
          subtotal: Number(state.total) - Number(state.desechables||0) - Number(state.domicilio||0),
          desechables: Number(state.desechables||0), domicilio: Number(state.domicilio||0),
          total: Number(state.total), address: state.address || "Por confirmar",
          paymentMethod: state.paymentMethod || "digital",
          comprobanteUrl: state.comprobanteUrl || null, comprobanteMediaId: state.comprobanteMediaId || null,
          notasEspeciales: state.notasEspeciales || null,
          pedidoAdicionalDe: state.pedidoAdicionalDe || null
        });
      }

      delete orderState[from];
      await deleteOrderState(from);
    }

  } catch (err) {
    console.error("Error procesando " + from + ":", err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

app.get("/pedidos", function(req, res) {
  res.json({ activos: Object.keys(orderState).length, pedidos: orderState, colas_activas: colasPorCliente.size });
});

app.get("/", function(req, res) {
  res.json({
    status: "La Curva Bot activo",
    hora_colombia: getHoraColombia().toLocaleString("es-CO"),
    dia_colombia: getDiaColombiaStr(),
    conversaciones: Object.keys(conversations).length,
    pedidos_activos: Object.keys(orderState).length,
    colas: colasPorCliente.size
  });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("LUZ corriendo en puerto " + PORT);
  console.log("Dia Colombia:", getDiaColombiaStr(), "| Hora:", getHoraColombia().toLocaleTimeString("es-CO"));
});

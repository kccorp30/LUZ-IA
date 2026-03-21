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

// ── HORA COLOMBIA (UTC-5, sin DST) ────────────────────────────────────────────
function getHoraColombia() {
  var ahora = new Date();
  var utc   = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
  return new Date(utc - (5 * 60 * 60 * 1000));
}
function getDiaColombiaStr() {
  var dias = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  return dias[getHoraColombia().getDay()];
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vbxuwzcfzfjwhllkppkg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_I5lP9lq6-6t0B0K0PmjyWQ_RiIxiJM5";

function sbHeaders(useService) {
  var key = useService ? (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY) : SUPABASE_KEY;
  return { "apikey": key, "Authorization": "Bearer " + key };
}

async function getRestaurante(phoneNumberId) {
  try {
    if (phoneNumberId) {
      var res = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?whatsapp_phone_id=eq." + phoneNumberId + "&select=*",
        { headers: sbHeaders(false) });
      if (res.data && res.data.length > 0) return res.data[0];
    }
    var fb = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=*&limit=1",
      { headers: sbHeaders(false) });
    return fb.data && fb.data.length > 0 ? fb.data[0] : null;
  } catch (err) { console.error("Error Supabase getRestaurante:", err.message); return null; }
}

// ── SILENCIO ──────────────────────────────────────────────────────────────────
async function estaEnSilencio(restauranteId, telefono) {
  try {
    var res = await axios.get(
      SUPABASE_URL + "/rest/v1/silencio_conversacion?restaurante_id=eq." + restauranteId +
        "&telefono=eq." + encodeURIComponent(telefono) + "&activo=eq.true&select=id",
      { headers: sbHeaders(true) }
    );
    return res.data && res.data.length > 0;
  } catch (e) { return false; }
}

// ── MENÚ DINÁMICO DESDE SUPABASE ─────────────────────────────────────────────
async function getMenuActivo(restauranteId) {
  try {
    var res = await axios.get(
      SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restauranteId +
        "&disponible=eq.true&order=categoria,orden&select=*",
      { headers: sbHeaders(false) }
    );
    var items = res.data || [];
    if (!items.length) return MENU_TEXT_FALLBACK;

    var grupos = {};
    items.forEach(function(i) {
      if (!grupos[i.categoria]) grupos[i.categoria] = [];
      grupos[i.categoria].push(i);
    });

    var lines = ["\nMENU ACTIVO (solo estos productos están disponibles ahora):\n"];
    Object.keys(grupos).forEach(function(cat) {
      lines.push("\n" + cat.toUpperCase() + ":");
      grupos[cat].forEach(function(i) {
        var precio = "$" + Number(i.precio).toLocaleString("es-CO");
        var desc = i.descripcion ? " (" + i.descripcion + ")" : "";
        var tipo = i.es_bebida ? " [bebida]" : (i.es_arepa ? " [arepa]" : "");
        lines.push("- " + i.nombre + ": " + precio + desc + tipo);
      });
    });
    lines.push("\nIMPORTANTE: Si el cliente pide un producto que NO aparece en esta lista, dile amablemente que no está disponible hoy y ofrece alternativas de lo que SÍ está disponible.\n");
    return lines.join("\n");
  } catch (e) {
    console.error("Error cargando menu desde Supabase:", e.message);
    return MENU_TEXT_FALLBACK;
  }
}

async function guardarPedidoSupabase(restauranteId, pedidoData) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var subtotal = Number(pedidoData.total) - Number(pedidoData.desechables||0) - Number(pedidoData.domicilio||0);
    var payload = {
      restaurante_id: restauranteId, numero_pedido: pedidoData.orderNumber,
      cliente_tel: pedidoData.phone, items: pedidoData.items,
      subtotal: subtotal, desechables: pedidoData.desechables,
      domicilio: pedidoData.domicilio, total: pedidoData.total,
      direccion: pedidoData.address, metodo_pago: pedidoData.paymentMethod,
      estado: "confirmado",
      comprobante_url: pedidoData.comprobanteUrl || null,
      comprobante_media_id: pedidoData.comprobanteMediaId || null
    };
    console.log("Guardando pedido:", JSON.stringify(payload));
    var response = await axios.post(SUPABASE_URL + "/rest/v1/pedidos", payload, {
      headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey,
        "Content-Type": "application/json", "Prefer": "return=representation" }
    });
    console.log("Pedido #" + pedidoData.orderNumber + " guardado. ID:", response.data[0]?.id || "?");
    notificarDashboard(response.data[0]);
  } catch (err) {
    console.error("Error guardando pedido:", err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

function notificarDashboard(pedido) {
  var url = process.env.DASHBOARD_WEBHOOK_URL;
  if (!url || !pedido) return;
  axios.post(url, { evento: "nuevo_pedido", pedido }, { timeout: 4000 })
    .then(function() { console.log("Dashboard notificado #" + pedido.numero_pedido); })
    .catch(function(err) { console.error("Error notificando dashboard:", err.message); });
}

async function guardarMensajeSupabase(restauranteId, telefono, mensaje, tipo, comprobanteMediaId) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/mensajes",
      { restaurante_id: restauranteId, telefono, mensaje, tipo,
        comprobante_media_id: comprobanteMediaId || null },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey,
        "Content-Type": "application/json", "Prefer": "return=minimal" } });
  } catch (e) { console.error("Error guardando mensaje:", e.message); }
}

async function getOrderState(telefono) {
  try {
    var res = await axios.get(
      SUPABASE_URL + "/rest/v1/order_state?telefono=eq." + encodeURIComponent(telefono) + "&select=*",
      { headers: sbHeaders(true) });
    return res.data && res.data.length > 0 ? res.data[0].estado : null;
  } catch (e) { return null; }
}

async function setOrderState(telefono, estado) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/order_state?on_conflict=telefono",
      { telefono, estado, updated_at: new Date().toISOString() },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal" } });
  } catch (e) { console.error("Error setOrderState:", e.message); }
}

async function deleteOrderState(telefono) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.delete(SUPABASE_URL + "/rest/v1/order_state?telefono=eq." + encodeURIComponent(telefono),
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
  } catch (e) { console.error("Error deleteOrderState:", e.message); }
}

function getMenuUrl() { return process.env.MENU_PAGE_URL || "https://bit.ly/LaCurvaStreetFood"; }

async function descargarImagenMeta(mediaId) {
  try {
    var token = process.env.WHATSAPP_TOKEN;
    if (!token) return null;
    var urlRes = await axios.get("https://graph.facebook.com/v19.0/" + mediaId,
      { headers: { "Authorization": "Bearer " + token } });
    var mediaUrl = urlRes.data?.url;
    if (!mediaUrl) return null;
    var imgRes = await axios.get(mediaUrl,
      { headers: { "Authorization": "Bearer " + token }, responseType: "arraybuffer" });
    var base64   = Buffer.from(imgRes.data).toString("base64");
    var mimeType = imgRes.headers["content-type"] || "image/jpeg";
    return "data:" + mimeType + ";base64," + base64;
  } catch (e) { console.error("Error descargando imagen Meta:", e.message); return null; }
}

async function sendWhatsAppMessage(to, message, phoneNumberId) {
  var token = process.env.WHATSAPP_TOKEN;
  var pid   = phoneNumberId || process.env.WHATSAPP_PHONE_ID;
  if (!token || !pid) { console.error("Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID"); return; }
  var toNum = to.replace(/[^0-9]/g, "");
  if (!toNum.startsWith("57") && toNum.length === 10) toNum = "57" + toNum;
  try {
    await axios.post("https://graph.facebook.com/v19.0/" + pid + "/messages",
      { messaging_product: "whatsapp", to: toNum, type: "text", text: { body: message } },
      { headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" } });
    console.log("Mensaje enviado a " + toNum);
  } catch (err) {
    console.error("Error enviando WhatsApp:", err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

function estaEnHorario(restaurante) {
  try {
    var col        = getHoraColombia();
    var horaActual = col.getHours() * 60 + col.getMinutes();
    var apertura   = restaurante.hora_apertura || "16:00:00";
    var cierre     = restaurante.hora_cierre   || "00:00:00";
    var partsA     = apertura.split(":").map(Number);
    var partsC     = cierre.split(":").map(Number);
    var minApertura = partsA[0] * 60 + partsA[1];
    var minCierre   = partsC[0] * 60 + partsC[1];
    var dias    = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    var diaHoy  = dias[col.getDay()];
    var diasAct = (restaurante.dias_activos || "lunes,martes,miercoles,jueves,viernes,sabado,domingo").split(",");
    if (!diasAct.includes(diaHoy)) return false;
    if (minCierre <= minApertura) return horaActual >= minApertura || horaActual <= minCierre;
    return horaActual >= minApertura && horaActual <= minCierre;
  } catch (e) { return true; }
}

function getMenuActivo_config(restaurante) {
  var modoDia = restaurante.modo_dia || false;
  if (modoDia && restaurante.menu_dia && restaurante.menu_dia.trim().length > 10) return restaurante.menu_dia;
  if (!modoDia && restaurante.menu_noche && restaurante.menu_noche.trim().length > 10) return restaurante.menu_noche;
  return null;
}

function getMensaje(restaurante, clave, fallback) {
  return (restaurante && restaurante[clave] && restaurante[clave].trim())
    ? restaurante[clave].trim() : fallback;
}

const MENU_TEXT_FALLBACK = `
HAMBURGUESAS TRADICIONALES:
- La especial: $18.900 (carne artesanal, pan brioche, ripio, queso, tocineta, jamon, lechuga)
- La sencilla: $16.900
- La curva: $29.900
- La Mega especial: $37.900
- La doble carne: $24.900
- La super queso: $22.900
- La de pollo: $19.900

HAMBURGUESAS ANGUS:
- Angus Especial: $26.900
- Angus Doble: $36.900
- Angus Mixta: $37.900
- Madurita: $29.900
- Montanera: $35.900
- Celestina: $31.900
- BBQ King: $30.900
- La mela: $29.400
- Mexicana: $32.900

HOT DOGS:
- Italiano: $16.900
- Italo-ranchero: $17.900
- Mexicano: $18.400
- Perro la Curva: $29.400
- Chuzo-pan: $19.900
- Chori-perro: $18.900
- Americano: $19.900
- La perra: $18.900

SALCHIPAPAS:
- Sencilla: $17.400
- Criolla: $22.400
- Especial: $36.400
- Mega costena: $58.900

COMBOS DEL DIA:
- Aplastado especial combo: $22.900
- Hamburguesa tradicional combo: $23.900
- Perro italiano combo: $21.900
- Tres Angus + Coca 1.5L: $81.900

DESGRANADOS Y MAICITOS:
- Gratinados: $18.900
- Rancheros: $22.900
- Especial pollo y tocineta: $26.400
- Hawaiano: $16.900
- Mixto carne y pollo: $34.900
- Mega desgranado: $39.900

CHUZOS (con papa amarilla y ensalada):
- De lomo viche: $29.400
- De pollo: $22.400
- Mixto: $24.900
- De costilla ahumada: $20.900

ALITAS:
- x6: $21.900
- x12: $39.900
- x18: $55.900
- x24 + limonada: $68.900

ASADOS (con papa amarilla y ensalada):
- Caracho 380gr: $39.900
- Punta de anca 380gr: $39.900
- Lomo de cerdo 350gr: $34.900
- Filete de pollo 350gr: $32.900
- Tabla curva: $41.900
- Costilla San Luis BBQ 500gr: $42.900

ASADOS JUNIOR (250gr):
- Caracho: $24.900
- Punta de anca: $25.900
- Lomo de cerdo: $20.900
- Filete de pollo: $19.900

PICADAS:
- Para 3 personas: $46.400
- Para 5 personas: $79.900

AREPAS:
- Con todo: $18.900
- Jamon y queso: $7.900
- Solo queso: $5.900
- Arepa burguer: $17.900
- Arepa sola: $3.500

ESPECIALIDADES:
- Sandwich Sencillo: $16.400
- Sandwich Especial: $20.900
- Burrito Sencillo: $15.400
- Burrito Especial: $20.400
- Patacon con todo: $23.900
- Pataco-burguer: $19.900
- Shawarma a la curva: $19.900

APLASTADOS:
- Sencillo: $10.900
- Hawaiano: $14.900
- Especial: $17.900
- Shawarma: $19.900

ENTRADAS:
- Nachos: $20.900
- Empanadas x6: $12.900
- Papa criolla con chorizo: $17.900
- Nuggets con francesa: $17.900
- Aros de cebolla: $11.900
- Papa francesa con queso y tocineta: $17.900
- Papa criolla: $11.900
- Papa rustica: $10.900
- Papa francesa: $7.900

BEBIDAS:
- Soda italiana (vaso): $12.900
- Jugos en agua (vaso): $9.900
- Jugos en leche (vaso): $12.900
- Limonada natural (vaso): $8.900
- Limonada cerezada (vaso): $11.900
- Limonada mango viche (vaso): $10.900
- Limonada de coco (vaso): $12.900
- Agua: $4.500
- Coca-Cola 400ml: $5.400
- Coca-Cola 1.5L: $8.900 (litro y cuarto)
- Mr. Tee: $4.500
- Jugo Hit: $4.900

MENU KIDS:
- Nuggets con francesa: $22.900
- Burguer con francesa: $25.900
- Salchipapa con ranchera: $21.400
- Perro con francesa: $21.400
`;

const SYSTEM_PROMPT = `Eres Luz, la encargada de atencion al cliente de La Curva Street Food, restaurante de comida callejera en Canaveral, Cali. Direccion: UBICACION_PLACEHOLDER.

PERSONALIDAD:
- Eres una persona real, calenya, calida y cercana. Nunca admitas ser IA.
- Tu nombre es Luz. Solo presentate LA PRIMERA VEZ. Si ya hubo mensajes antes, NO te presentes.
- Hablas natural. Usas: con gusto, a listo, claro que si, digame, ya le confirmo. Ocasionalmente Dama o Caballero.
- SIEMPRE responde en UN SOLO mensaje.
- Respuestas cortas y al grano.
- NUNCA mandes el link del menu dos veces. Solo la primera vez.
- Nunca seas fria ni cortante. Siempre calida y cercana.

MENSAJES DE VOZ: responde: Hola! Por favor escribeme tu pedido, no puedo escuchar audios por aca. Con gusto te atiendo.

INFORMACION:
- Ubicacion: UBICACION_PLACEHOLDER
- Domicilio: sur de Cali y parte del centro
- Tiempo estimado: 25 a 45 minutos

HORARIO_PLACEHOLDER

METODOS DE PAGO:
- Nequi: @NEQUIJOS126
- Bancolombia llave: 0089102980 (Jose Gregorio Charris)
- Efectivo: domiciliario lleva cambio (pregunta con que valor cancela)
- Datafono: domiciliario lo lleva
- Pago mixto: acepta parte digital + parte efectivo.
- NUNCA esperes a que el cliente pida los datos de pago. Delos siempre tu primero.

PROMOCIONES SEMANALES (aplica segun el dia de hoy — DIA_PLACEHOLDER):
- Lunes y Jueves: Pague 2 lleve 3 hamburguesas tradicionales
- Martes: Pague 2 lleve 3 en todos los hot dogs y perros
- Jueves: Pague 2 lleve 3 en Angus BBQ King o Celestina
- Domingos: Pague 2 lleve 3 en asados junior
IMPORTANTE: Solo menciona la promocion si corresponde al dia de hoy (DIA_PLACEHOLDER). Si hoy no hay promocion para lo que pide el cliente, NO menciones otras promociones.

MENU_PLACEHOLDER

PAGINA VISUAL DEL MENU:
Cuando un cliente pida el menu o diga que quiere pedir, ofrece:
Te comparto nuestro menu completo MENU_URL_PLACEHOLDER - ahi armas tu pedido y me lo mandas. O me dices aqui mismo con gusto.

DESECHABLES - REGLA CRITICA:
- $500 por cada producto de COMIDA.
- BEBIDAS NO cobran desechable.
- AREPAS tampoco cobran desechable.

DOMICILIO - pregunta siempre la direccion completa:
- $2.000: Canaveral
- $4.000: San Judas, La Granja, La Selva, Santo Domingo
- $6.000: Ciudad Jardin, Pance, Tequendama, El Ingenio, Pampalinda, Melendez, Univalle, Lili, Mojica, Poblado, Mario Correa, Valle del Lili, Calipso, Compartir, Capri, Niza, Caney, Santa Barbara, San Joaquin, centro, extremos norte, extremos sur
- Si no reconoces el barrio: $4.000 y avisa que puede variar $1.000.

CALCULO - SIEMPRE muestra este desglose:
Productos:    $XX.XXX
Desechables:  $XXX
Domicilio:    $X.XXX
TOTAL:        $XX.XXX

REGLA ANTI-DUPLICADOS: Si el cliente corrige, toma SOLO la version corregida.

REGLA DE ORO: Si el cliente ya dio producto + direccion + pago en el mismo mensaje, confirma TODO de una vez.

PEDIDO DESDE PAGINA DE MENU: Si el mensaje ya incluye productos con precios, escribe INMEDIATAMENTE PEDIDO_LISTO con esos productos.

MODIFICAR PEDIDO EN CURSO: Si agrega algo, escribe PEDIDO_LISTO completo con TODOS los productos anteriores MAS el nuevo.

MODIFICACIONES: acepta sin queso, extra salsa, etc.
QUEJAS POR FALTANTES: ofrecelo de inmediato sin preguntar.
JERGA: litro y cuarto = Coca-Cola 1.5L. perro o perrito = hot dog.

VENTAS:
- Cuando el cliente confirme su pedido, SIEMPRE ofrece algo adicional de forma natural.
- Solo ofrece UNA cosa adicional.
- Menciona la promocion del dia si aplica HOY (DIA_PLACEHOLDER).

FLUJO:
1. Saludo -> UN mensaje amable + ofrece link del menu
2. Cliente pide -> confirma productos con precios
3. Pide la direccion completa: calle, numero, barrio
4. Con direccion -> calcula domicilio y muestra desglose completo
5. Cliente confirma -> pregunta pago Y da datos de inmediato
6. Pago:
- Nequi: Transferi a @NEQUIJOS126 y mandame el comprobante
- Bancolombia: Transferi a la llave 0089102980 a nombre de Jose Gregorio Charris y mandame el comprobante
- Efectivo: pregunta con que valor cancela -> escribe PAGO_EFECTIVO:[valor]
- Datafono: confirma -> escribe PAGO_DATAFONO
7. Cliente envia comprobante -> di: Listo! Tu pedido quedo confirmado. Te estaremos informando el estado
8. NUNCA digas que va en camino ni des tiempo estimado al confirmar.

MENSAJES POST-CONFIRMACION:
- Para mensajes cortos post-confirmacion (ok, gracias, emojis) responde SOLO con algo breve y calido.
- SOLO inicia nuevo flujo si el cliente dice explicitamente que quiere otro pedido.

OBLIGATORIO - escribe SIEMPRE al confirmar productos:
PEDIDO_LISTO:
ITEMS: [producto1 $precio|producto2 $precio]
DESECHABLES: [numero sin puntos ni $]
DOMICILIO: [numero sin puntos ni $ - si no sabes escribe 0]
TOTAL: [numero sin puntos ni $]

CUANDO TENGAS DIRECCION: DIRECCION_LISTA:[direccion completa]
TELEFONO ADICIONAL: TELEFONO_ADICIONAL:[numero]

REGLAS FINALES:
- NUNCA digas que eres IA.
- Si piden algo que no esta en el MENU ACTIVO, dile amablemente que hoy no esta disponible y ofrece alternativas del menu actual.
- Si piden hablar con una persona real, asesor o encargado, di: Un momento, ya te comunico con un encargado.`;

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
    "Pedido #" + orderData.orderNumber,
    "Hora: " + orderData.timestamp,
    "Tel: " + orderData.phone.replace(/[^0-9]/g, ""),
    orderData.extraPhone ? "Tel adicional: " + orderData.extraPhone : null,
    "----------------",
    "PRODUCTOS:",
  ].filter(Boolean);
  orderData.items.forEach(function(i) { lines.push("  " + i); });
  lines = lines.concat([
    "----------------",
    "Subtotal:    $" + subtotal.toLocaleString("es-CO"),
    "Desechables: $" + Number(orderData.desechables||0).toLocaleString("es-CO"),
    "Domicilio:   $" + Number(orderData.domicilio||0).toLocaleString("es-CO"),
    "----------------",
    "TOTAL:       $" + Number(orderData.total).toLocaleString("es-CO"),
    "----------------",
    "Direccion: " + orderData.address,
    "Pago: " + pagoLabel,
    "================================",
    "     GRACIAS POR SU PEDIDO     ",
    "================================", ""
  ]);

  var ticketText = lines.join("\n");
  console.log("\nTICKET PARA COCINA:\n" + ticketText);

  var PRINT_SERVER = process.env.PRINT_SERVER_URL || "http://localhost:3001/print";
  var PRINT_SECRET = process.env.PRINT_SECRET     || "lacurva2024";
  axios.post(PRINT_SERVER, {
    secret: PRINT_SECRET, orderNumber: orderData.orderNumber, timestamp: orderData.timestamp,
    phone: orderData.phone.replace(/[^0-9]/g, ""), extraPhone: orderData.extraPhone || null,
    items: orderData.items, subtotal,
    desechables: Number(orderData.desechables||0), domicilio: Number(orderData.domicilio||0),
    total: Number(orderData.total), address: orderData.address,
    paymentMethod: orderData.paymentMethod, cashDenomination: orderData.cashDenomination || null
  }, { timeout: 6000 })
    .then(function() { console.log("Ticket #" + orderData.orderNumber + " enviado a impresora"); })
    .catch(function(err) { console.error("Error impresora:", err.message); });
  return ticketText;
}

function parseReply(reply, from) {
  var cleanReply = reply;
  var sideEffect = null;

  if (reply.indexOf("PEDIDO_LISTO:") !== -1) {
    var itemsMatch  = reply.match(/ITEMS:\s*(.+)/);
    var totalMatch  = reply.match(/TOTAL:\s*([^\n]+)/);
    var desechMatch = reply.match(/DESECHABLES:\s*([^\n]+)/);
    var domMatch    = reply.match(/DOMICILIO:\s*([^\n]+)/);
    if (itemsMatch && totalMatch) {
      var items   = itemsMatch[1].split("|").map(function(i) { return i.trim(); });
      var total   = limpiarNumero(totalMatch[1]);
      var desech  = limpiarNumero(desechMatch ? desechMatch[1] : "0");
      var domicilio = limpiarNumero(domMatch ? domMatch[1] : "0");
      orderState[from] = { status: "esperando_direccion", orderNumber: nextOrderNumber(), items, desechables: desech, domicilio, total };
      console.log("orderState creado para:", from, "#" + orderState[from].orderNumber);
      sideEffect = "pedido_registrado";
    }
    cleanReply = cleanReply.replace(/PEDIDO_LISTO:[\s\S]*?(?=DIRECCION_LISTA:|TELEFONO_ADICIONAL:|PAGO_|$)/g, "").trim();
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
        try {
          var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id + "&select=*",
            { headers: sbHeaders(false) });
          if (rr.data && rr.data.length > 0) restaurante = rr.data[0];
        } catch(e) {}
      }
      var numStr = numero_pedido ? " #" + numero_pedido : "";
      var pid = process.env.WHATSAPP_PHONE_ID;
      if (estado === "en_preparacion") {
        var msg = getMensaje(restaurante, "msg_en_preparacion", "Tu pedido" + numStr + " ya esta en preparacion! En breve estara listo.");
        await sendWhatsAppMessage(telefono_cliente, msg, pid);
        if (restaurante_id) guardarMensajeSupabase(restaurante_id, telefono_cliente, msg, "estado_luz", null);
      }
      if (estado === "listo") {
        var msg = getMensaje(restaurante, "msg_listo", "Tu pedido" + numStr + " esta listo y esperando al domiciliario! Pronto va en camino");
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
      { headers: { ...sbHeaders(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/menu-add", async function(req, res) {
  try {
    await axios.post(SUPABASE_URL + "/rest/v1/menu_items", req.body,
      { headers: { ...sbHeaders(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/restaurante-config", async function(req, res) {
  if (!req.body.restaurante_id || !req.body.config) return res.status(400).json({ error: "Faltan datos" });
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id, req.body.config,
      { headers: { ...sbHeaders(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.response ? JSON.stringify(err.response.data) : err.message }); }
});

app.post("/enviar-mensaje-cliente", async function(req, res) {
  if (!req.body.telefono || !req.body.mensaje) return res.status(400).json({ error: "Faltan datos" });
  try {
    await sendWhatsAppMessage(req.body.telefono, req.body.mensaje, process.env.WHATSAPP_PHONE_ID);
    // Guardar mensaje del panel en Supabase para que aparezca en el chat
    if (req.body.restaurante_id) {
      guardarMensajeSupabase(req.body.restaurante_id, req.body.telefono, req.body.mensaje, "restaurante", null);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/notificar-cliente", async function(req, res) {
  if (!req.body.telefono) return res.status(400).json({ error: "Telefono requerido" });
  var restaurante = null;
  if (req.body.restaurante_id) {
    try {
      var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id + "&select=*", { headers: sbHeaders(false) });
      if (rr.data && rr.data.length > 0) restaurante = rr.data[0];
    } catch(e) {}
  }
  var numStr = req.body.numero_pedido ? " #" + req.body.numero_pedido : "";
  try {
    var msg = getMensaje(restaurante, "msg_en_camino", "Tu pedido" + numStr + " ya va en camino. Llega en 25-35 minutos. Que lo disfrutes!");
    await sendWhatsAppMessage(req.body.telefono, msg, process.env.WHATSAPP_PHONE_ID);
    if (req.body.restaurante_id) guardarMensajeSupabase(req.body.restaurante_id, req.body.telefono, msg, "estado_luz", null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
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
  } catch (err) { res.status(500).json({ ok: false, error: err.response ? JSON.stringify(err.response.data) : err.message }); }
});

app.get("/api/comprobante/:mediaId", async function(req, res) {
  try {
    var imgData = await descargarImagenMeta(req.params.mediaId);
    if (!imgData) return res.status(404).json({ error: "No se pudo obtener la imagen" });
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
      SUPABASE_URL + "/rest/v1/mensajes?restaurante_id=eq." + req.query.restaurante_id +
        "&telefono=eq." + encodeURIComponent(req.params.telefono) + "&order=created_at.asc&limit=150",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
    res.json({ ok: true, mensajes: r.data || [] });
  } catch (e) { res.json({ ok: true, mensajes: [] }); }
});

app.delete("/api/pedido/:id", async function(req, res) {
  var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  try {
    await axios.delete(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + req.params.id,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
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
  } catch (err) { console.error("Error parseando webhook:", err.message); }
});

async function procesarMensaje(msg, from, phoneNumberId) {
  try {
    var msgType = msg.type;

    if (msgType === "audio") {
      await sendWhatsAppMessage(from, "Hola! Por favor escribeme tu pedido, no puedo escuchar audios por aca. Con gusto te atiendo.", phoneNumberId);
      return;
    }

    var userText = "", mediaId = null, esComprobante = false;

    if (msgType === "text") {
      userText = msg.text?.body?.trim() || "";
    } else if (msgType === "image" || msgType === "document" || msgType === "sticker") {
      mediaId = msg.image?.id || msg.document?.id || null;
      esComprobante = true;
      var caption = msg.image?.caption || msg.document?.caption || "";
      userText = caption
        ? caption + " [El cliente envio una imagen, posiblemente comprobante de pago]"
        : "[El cliente envio una imagen, posiblemente comprobante de pago de Nequi o Bancolombia]";
    } else if (msgType === "location") {
      var loc = msg.location;
      userText = "Mi ubicacion es: lat " + loc.latitude + ", lng " + loc.longitude + (loc.name ? " (" + loc.name + ")" : "");
    } else if (msgType === "interactive") {
      userText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
    } else { console.log("Tipo no soportado: " + msgType); return; }

    if (!userText) return;

    // Recuperar orderState de Supabase si no está en memoria
    if (!orderState[from]) {
      var saved = await getOrderState(from);
      if (saved) { orderState[from] = saved; console.log("orderState recuperado para:", from); }
    }

    var restaurante = await getRestaurante(phoneNumberId);
    if (restaurante) {
      if (restaurante.estado !== "activo") { console.log("Restaurante inactivo"); return; }
      if (!estaEnHorario(restaurante)) { console.log("Fuera de horario"); return; }

      // ── MODO SILENCIO: si el restaurante intervino, Luz no responde ──────
      var silencio = await estaEnSilencio(restaurante.id, from);
      if (silencio) {
        console.log("SILENCIO activo para:", from, "— Luz no responde");
        // Guardar mensaje del cliente en Supabase aunque Luz no responda
        guardarMensajeSupabase(restaurante.id, from, userText, "cliente", esComprobante ? mediaId : null);
        return;
      }
    }

    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: userText });
    if (conversations[from].length > 20) conversations[from] = conversations[from].slice(-20);

    // ── MENÚ DINÁMICO — cargar desde Supabase ─────────────────────────────
    var menuParaPrompt;
    if (restaurante) {
      // Primero intentar menú día/noche configurado en texto
      var menuConfig = getMenuActivo_config(restaurante);
      if (menuConfig) {
        menuParaPrompt = menuConfig;
      } else {
        // Cargar desde menu_items con disponible=true
        menuParaPrompt = await getMenuActivo(restaurante.id);
      }
    } else {
      menuParaPrompt = MENU_TEXT_FALLBACK;
    }

    var ubicacion   = (restaurante?.direccion) || "Cl. 16 #56-40, Canaveral, Cali";
    var horarioInfo = restaurante
      ? "Atiendes de " + (restaurante.hora_apertura||"16:00").substring(0,5) + " a " + (restaurante.hora_cierre||"00:00").substring(0,5) + ". Estas en horario activo ahora."
      : "Atiendes de 4:00pm a 12:00am.";

    // FIX: inyectar día real de Colombia en el prompt
    var diaHoy = getDiaColombiaStr();
    var horaCol = getHoraColombia();
    var horaStr = horaCol.getHours().toString().padStart(2,"0") + ":" + horaCol.getMinutes().toString().padStart(2,"0");

    var bienvenidaExtra = "";
    var msgBienvenida = getMensaje(restaurante, "msg_bienvenida", "");
    if (msgBienvenida && conversations[from].length === 1) {
      bienvenidaExtra = "\n\nMENSAJE DE BIENVENIDA PERSONALIZADO:\n" + msgBienvenida;
    }

    var menuSeccion = "MENU ACTIVO:\n" + menuParaPrompt;

    var systemFinal = SYSTEM_PROMPT
      .replace(/MENU_URL_PLACEHOLDER/g, getMenuUrl())
      .replace(/MENU_PLACEHOLDER/g, menuSeccion)
      .replace(/UBICACION_PLACEHOLDER/g, ubicacion)
      .replace(/HORARIO_PLACEHOLDER/g, "HORARIO: " + horarioInfo + " Son las " + horaStr + " en Colombia.")
      .replace(/DIA_PLACEHOLDER/g, diaHoy)
      + bienvenidaExtra;

    var claudeResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: "claude-haiku-4-5-20251001", max_tokens: 2000, system: systemFinal, messages: conversations[from] },
      { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } }
    );

    if (!claudeResponse.data?.content?.[0]) {
      await sendWhatsAppMessage(from, "Hola! En este momento tengo un problemita tecnico. Escribeme en un momento.", phoneNumberId);
      return;
    }

    var rawReply   = claudeResponse.data.content[0].text;
    console.log("RAW:", rawReply.substring(0, 300));
    var parsed     = parseReply(rawReply, from);
    var cleanReply = parsed.cleanReply;
    var sideEffect = parsed.sideEffect;

    // Comprobante recibido
    if (esComprobante && mediaId && orderState[from]) {
      orderState[from].comprobanteMediaId = mediaId;
      orderState[from].comprobanteUrl     = "/api/comprobante/" + mediaId;
      orderState[from].paymentMethod      = orderState[from].paymentMethod || "digital";
      orderState[from].status             = "confirmado";
      sideEffect = "pago_confirmado";
      console.log("Comprobante recibido — forzando pago_confirmado para:", from);
    }

    conversations[from].push({ role: "assistant", content: rawReply });
    await sendWhatsAppMessage(from, cleanReply, phoneNumberId);

    console.log("De " + from + ": " + userText.substring(0, 80));
    console.log("Luz: " + cleanReply.substring(0, 100));

    if (restaurante) {
      guardarMensajeSupabase(restaurante.id, from, userText, "cliente", esComprobante ? mediaId : null).catch(function(){});
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
        phone: from, timestamp
      });

      var restId = restaurante?.id || null;
      if (!restId) {
        try {
          var rf = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=id&limit=1",
            { headers: sbHeaders(true) });
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
          comprobanteUrl: state.comprobanteUrl || null,
          comprobanteMediaId: state.comprobanteMediaId || null
        });
      }

      delete orderState[from];
      await deleteOrderState(from);
    }

  } catch (err) {
    console.error("Error procesando mensaje de " + from + ":", err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

app.get("/pedidos", function(req, res) {
  res.json({ activos: Object.keys(orderState).length, pedidos: orderState, colas_activas: colasPorCliente.size });
});

app.get("/", function(req, res) {
  res.json({
    status: "La Curva Bot activo - WhatsApp Cloud API (Meta)",
    menu_url: getMenuUrl(), hora_colombia: getHoraColombia().toLocaleString("es-CO"),
    dia_colombia: getDiaColombiaStr(),
    conversaciones_activas: Object.keys(conversations).length,
    pedidos_activos: Object.keys(orderState).length,
    colas_activas: colasPorCliente.size
  });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("La Curva Street Food - LUZ corriendo en puerto " + PORT);
  console.log("WhatsApp Cloud API (Meta) — Menu dinamico + Silencio + Cola paralela");
  console.log("Dia Colombia:", getDiaColombiaStr(), "| Hora:", getHoraColombia().toLocaleTimeString("es-CO"));
});

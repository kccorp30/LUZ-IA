process.on("uncaughtException", function(err) {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
});
process.on("unhandledRejection", function(reason) {
  console.error("UNHANDLED REJECTION:", reason);
});

const express = require("express");
const axios   = require("axios");
const path    = require("path");
const webpush = require("web-push");
const app     = express();

// ── WEB PUSH SETUP ────────────────────────────────────────────────────────────
// Generate VAPID keys once: node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(k)"
// Then set as env vars VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
var VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || "BAiEnD8bWwsFfBgwf4EIxJVLDJP2bQzE4xw_kLvwSGXyZmDnA0STk9SBlnGOI2sMG6Ij8-XFmbpAPPnA-UN2Nvk";
var VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "ZmDnA0STk9SBlnGOI2sMG6Ij8-XFmbpAPPnA-UN2Nvk";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:admin@luzia.app", VAPID_PUBLIC, VAPID_PRIVATE);
  console.log("Web Push configurado OK");
} else {
  console.warn("VAPID keys no configuradas — notificaciones push desactivadas");
}

async function enviarPushSuscripcion(sub, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (e) {
    if (e.statusCode === 410) return "expired";
    console.error("Push error:", e.message);
  }
}

async function enviarPushPorRol(restauranteId, rol, payload) {
  if (!VAPID_PUBLIC) return;
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/push_subscriptions?restaurante_id=eq." + restauranteId + "&rol=eq." + rol + "&activo=eq.true&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    var subs = r.data || [];
    for (var sub of subs) {
      var result = await enviarPushSuscripcion(JSON.parse(sub.subscription), payload);
      if (result === "expired") {
        await axios.patch(
          SUPABASE_URL + "/rest/v1/push_subscriptions?id=eq." + sub.id,
          { activo: false },
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json" } }
        );
      }
    }
  } catch (e) { console.error("enviarPush error:", e.message); }
}
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
// Forzar HTTPS en Railway
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
  }
  next();
});

const conversations = {};
const orderState    = {};
let   orderCounter  = 100;

// ── COLA PARALELA ─────────────────────────────────────────────────────────────
const colasPorCliente = new Map();
var DELAY_RESPUESTA_MS = 10000; // 10 segundos para simular persona real

function procesarEnCola(from, tarea) {
  if (!colasPorCliente.has(from)) colasPorCliente.set(from, Promise.resolve());
  var cola = colasPorCliente.get(from);
  var nueva = cola.then(function() {
    return new Promise(function(resolve) { setTimeout(resolve, DELAY_RESPUESTA_MS); })
      .then(function() { return tarea(); })
      .catch(function(err) { console.error("Error cola " + from + ":", err.message); });
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
    // Buscar con y sin indicativo para cubrir ambos formatos
    var telLocal = stripCountryCode(telefono);
    var telFull = telefono.replace(/[^0-9]/g,"");
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/silencio_conversacion?restaurante_id=eq." + restauranteId +
      "&telefono=in.(" + encodeURIComponent(telLocal) + "," + encodeURIComponent(telFull) + ")&activo=eq.true&select=id",
      { headers: sbH(true) }
    );
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

function stripCountryCode(tel) {
  // Remove country codes to get local number
  var t = String(tel).replace(/[^0-9]/g, "");
  if (t.startsWith("57") && t.length === 12) return t.substring(2); // Colombia
  if (t.startsWith("1") && t.length === 11) return t.substring(1);  // USA
  return t;
}

async function guardarDireccionFrecuente(restauranteId, telefono, direccion) {
  if (!direccion || direccion === "Por confirmar") return;
  try {
    var telLocal = stripCountryCode(telefono);
    await axios.post(SUPABASE_URL + "/rest/v1/clientes_frecuentes?on_conflict=restaurante_id,telefono",
      { restaurante_id: restauranteId, telefono: telLocal, ultima_direccion: direccion, updated_at: new Date().toISOString() },
      { headers: { ...sbH(true), "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } });
  } catch (e) { console.error("guardarDireccion:", e.message); }
}

// ── MENÚ DINÁMICO ─────────────────────────────────────────────────────────────
var menuCache = {};
async function getMenuDinamico(restauranteId) {
  // Cache menu for 5 minutes to avoid repeated DB calls
  var now = Date.now();
  if (menuCache[restauranteId] && (now - menuCache[restauranteId].ts) < 5*60*1000) {
    return menuCache[restauranteId].menu;
  }
  try {
    var r = await axios.get(SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restauranteId + "&disponible=eq.true&order=categoria,orden&select=nombre,precio,categoria,es_bebida,es_arepa", { headers: sbH(false) });
    var items = r.data || [];
    if (!items.length) return "(Sin productos cargados en el sistema. Informa al cliente que el menu esta siendo actualizado.)";
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
    // Detectar combos - solo los que estan explicitamente en el menu
    var combos = items.filter(function(i){ return (i.nombre||"").toLowerCase().includes("combo") || (i.categoria||"").toLowerCase().includes("combo"); });
    if(combos.length > 0){
      lines.push("\nREGLA COMBOS IMPORTANTE:");
      lines.push("Solo puedes ofrecer los combos que aparecen EXACTAMENTE en este menu.");
      lines.push("NO puedes armar combos personalizados con productos que no sean combo.");
      lines.push("Si el cliente pide 'combo de X' y X no tiene combo en el menu, dile que solo tienes los combos listados arriba.");
    }
    var menuFinal = lines.join("\n");
    menuCache[restauranteId] = { menu: menuFinal, ts: Date.now() };
    console.log("Menu cargado y cacheado: " + items.length + " productos");
    return menuFinal;
  } catch (e) { console.error("getMenuDinamico:", e.message); return "(Error cargando menu. Indica al cliente que escriba lo que desea y lo atiendes manualmente.)"; }
}

// ── SYSTEM PROMPT DINÁMICO POR RESTAURANTE ────────────────────────────────────
function buildSystemPrompt(restaurante) {
  var nombreRest     = restaurante ? (restaurante.nombre || "el restaurante") : "el restaurante";
  var nombreLuz      = restaurante ? (restaurante.nombre_luz || "Luz") : "Luz";
  var ciudad         = restaurante ? (restaurante.ciudad || "Colombia") : "Colombia";
  var direccion      = restaurante ? (restaurante.direccion || "") : "";
  var personalidad   = restaurante ? (restaurante.personalidad_luz || "") : "";
  if (!personalidad) {
    personalidad = "Eres una persona real, calida y cercana. NUNCA admitas ser IA. Hablas natural: con gusto, a listo, claro que si, digame, con mucho gusto. NUNCA uses amigo, amiga, Dama ni Caballero. Si necesitas dirigirte al cliente usa: mi amor, corazon, o simplemente habla sin apelativo.";
  }

  var nequi      = restaurante ? (restaurante.metodo_pago_nequi  || "@NEQUIJOS126")     : "@NEQUIJOS126";
  var banco      = restaurante ? (restaurante.metodo_pago_banco  || "0089102980")     : "0089102980";
  var bancoNombre= restaurante ? (restaurante.metodo_pago_nombre || "Jose Gregorio Charris") : "Jose Gregorio Charris";

  var zonasText  = restaurante ? (restaurante.zonas_domicilio || "") : "";
  if (!zonasText) {
    zonasText = "El domiciliario confirma el valor del domicilio según la distancia.";
  }

var promosText = restaurante ? (restaurante.promos_semanales || "") : "";
  if (!promosText) {
    promosText = "No hay promociones activas en este momento.";
  }
  var infoAdicional = restaurante ? (restaurante.info_adicional || "") : "";

  return `Eres ${nombreLuz}, la encargada de atencion al cliente de ${nombreRest} en ${ciudad}.${direccion ? " Direccion: " + direccion + "." : ""}

PERSONALIDAD:
${personalidad}
- Solo presentate LA PRIMERA VEZ. Si ya hubo mensajes anteriores, NO te presentes de nuevo.
- SIEMPRE un solo mensaje. Corto y al grano.
- NUNCA mandes el link del menu dos veces seguidas.

MENSAJES DE VOZ: responde "Hola! Por favor escribeme tu pedido, no puedo escuchar audios. Con gusto te atiendo."

${infoAdicional ? "INFORMACION ADICIONAL DEL NEGOCIO:\n" + infoAdicional + "\n" : ""}
PROGRAMA DE FIDELIDAD (explica si te preguntan):
- Este sistema se implemento el FECHA_INICIO_PLACEHOLDER. Los pedidos cuentan desde esa fecha.
- Los clientes acumulan niveles segun cuantos pedidos han hecho desde FECHA_INICIO_PLACEHOLDER.
- BRONCE (1-9 pedidos): acceso al menu completo, sin descuento adicional.
- PLATA (10-24 pedidos): 5% de descuento en todos los productos automaticamente en el menu web.
- ORO (25+ pedidos): 10% de descuento en todos los productos automaticamente en el menu web.
- Los descuentos se aplican AUTOMATICAMENTE cuando el cliente entra al menu web. El cliente NO necesita mencionar su nivel ni descuento — el sistema ya lo aplica solo.
- Si un cliente menciona su nivel en el chat (ej: "soy cliente Oro"): NO apliques ningun descuento manualmente. El descuento ya fue aplicado en el menu antes de que enviara el pedido, o no le corresponde.
- Si el cliente pregunta como subir de nivel: "Cada pedido cuenta. Con 10 pedidos llegas a Plata con 5% de descuento, y con 25 pedidos llegas a Oro con 10% en todo."
- Si preguntan donde ver su nivel: "En nuestro menu online puedes ver tu nivel al registrarte con tu numero."
- Cuando un cliente confirme un pedido, puedes felicitarlo si subio de nivel o esta cerca: ej: "Por cierto, ya llevas X pedidos con nosotros — te faltan Y para llegar a nivel Plata con 5% de descuento en todo!"

HORARIO_PLACEHOLDER

METODOS DE PAGO:
- Nequi: llave ${nequi}. Es una LLAVE de Nequi. Si el cliente pregunta como pagar, di: "Busca la llave ${nequi} en tu app Nequi en la opcion transferir".
- Bancolombia: llave ${banco} a nombre de ${bancoNombre}. NUNCA des el numero de celular como dato Bancolombia, SIEMPRE la llave.
- Efectivo: el domiciliario lleva cambio (pregunta con que valor cancela)
- Datafono: el domiciliario lo lleva
- Pago mixto: acepta parte digital + parte efectivo
- NUNCA esperes a que el cliente pida los datos. Dalos SIEMPRE primero.

IMPORTANTE - PEDIDOS DE MESA:
- Si el mensaje empieza con "🪑 *PEDIDO DE MESA X*", es un pedido fisico de la mesa X del restaurante.
- Para pedidos de mesa: NO preguntes direccion ni domicilio. El cliente esta en el local.
- Confirma el pedido y di: "Perfecto, tu pedido para la Mesa X ya entro a preparacion. Te lo llevamos enseguida."
- Escribe DIRECCION_LISTA:MESA X (con el numero de mesa correspondiente).
- El pago se hace en el local, no pidas comprobante de transferencia salvo que digan Nequi.

IMPORTANTE - METODO DE PAGO DESDE EL MENU WEB:
- Si el cliente llega con un mensaje que incluye "Metodo de pago elegido:" al inicio, ya eligio su metodo desde la pagina del menu.
- En ese caso NO preguntes como quiere pagar. Procede directamente segun el metodo indicado.
- CRITICO: El mensaje del menu ya trae el TOTAL calculado con todos los descuentos aplicados (cupones, nivel de fidelidad). USA ESE TOTAL exactamente como viene en el mensaje. NO recalcules los precios. NO uses los precios del menu para calcular de nuevo. El total que el cliente envia ES el total correcto.
- Al escribir PEDIDO_LISTO, el TOTAL debe ser el SUBTOTAL del mensaje del cliente (sin domicilio) mas el domicilio que corresponda a su zona. NO sumes desechables nuevamente si ya vienen en el mensaje.
- Si el mensaje del cliente incluye una linea "Subtotal: $X" y "Desechables: $Y" y "TOTAL: $Z", usa esos valores exactos. El TOTAL del PEDIDO_LISTO = $Z + domicilio.
- NUNCA recalcules multiplicando precios del menu. El cliente ya hizo ese calculo en el menu web.
- Si dijo Nequi: llave ${nequi} (busca en la app Nequi → transferir → llave). Pide comprobante.
- Si dijo Bancolombia: llave ${banco} a nombre de ${bancoNombre}. Pide comprobante.
- Si dijo Efectivo: pregunta con que billete cancela y escribe PAGO_EFECTIVO:[valor].
- Si el cliente dice "sencilla", "exacto", "con el valor exacto", "pago completo", "sin cambio", "justo", "con lo justo" o similar: el cliente paga el total exacto, NO necesita cambio. Escribe directamente PAGO_EFECTIVO:exacto y confirma el pedido sin pedir mas informacion.
- Si dijo Datafono: confirma que el domiciliario lo lleva y escribe PAGO_DATAFONO.

PROMOCIONES (hoy es DIA_PLACEHOLDER):
IMPORTANTE: Si hay promocion activa HOY debes mencionarla proactivamente cuando el cliente pida ese producto. Ejemplo: si es martes y piden alitas, di "Por cierto, hoy martes tenemos promo de Alitas: paga 2 lleva 3!"
Lista de promos por dia:
${promosText}

MENU_PLACEHOLDER

MENU VISUAL:
- En el primer mensaje SIEMPRE comparte el link del menu: MENU_URL_PLACEHOLDER y convence al cliente con una razon clara. Ejemplos (varía la frase):
  * "Te comparto el menu MENU_URL_PLACEHOLDER — si pides ahi tu pedido llega directo a cocina sin intermediarios, mucho mas rapido!"
  * "Mira el menu aqui MENU_URL_PLACEHOLDER — pedir ahi es mas rapido porque tu pedido entra directo a preparacion y puedes ver el estado en tiempo real."
  * "Te mando el menu MENU_URL_PLACEHOLDER — ahi ves fotos de todo y tu pedido va directo a cocina. Mucho mas agil!"
- Si el cliente prefiere pedir por chat: atiendelo con toda la disposicion, sin mencionar el link de nuevo.
- NUNCA repitas el link mas de una vez en la misma conversacion.
- Si ya mandaron el pedido desde el menu (mensaje incluye "Metodo de pago elegido:"): NO menciones el link.

COMBOS: disponibles todos los dias. Estan en el menu activo — ofrecelos cuando pidan combos. NUNCA armes combos que no esten en el menu.

ADICIONALES (cobro extra por ingrediente adicional):
- Queso (tajado o rallado): $1.600
- Tocineta: $2.000
- Jamón: $2.000
- Maduro calado: $3.000
- Jalapeños: $2.000
- Maíz: $6.000
- Salchicha: $6.000
- Ranchera (salsa): $4.000
REGLA ADICIONALES: Si el cliente pide "con queso extra", "con tocineta", etc., cobrar el adicional correspondiente y sumarlo al total. Ejemplo: Hamburguesa $18.900 + Tocineta $2.000 = $20.900. Siempre confirmar el costo extra antes de agregar.

DESECHABLES: $500 por cada COMIDA. Bebidas y arepas NO cobran desechable.

DOMICILIO (valores internos, NO menciones zonas al cliente):
${zonasText}
- Barrio desconocido o que no reconoces: NO preguntes al cliente en que zona queda ni le pidas que confirme la zona. Simplemente dile: "El valor del domicilio te lo confirmamos antes de que salga el pedido, depende de la distancia." Y continua con el flujo normalmente.
- NUNCA menciones "zona 1", "zona 2" ni nombres de zonas al cliente. Solo usa los valores en pesos. El cliente no sabe ni le interesa en que zona queda.

CALCULO - muestra siempre el desglose:
Productos:    $XX.XXX
Desechables:  $XXX
Domicilio:    $X.XXX
TOTAL:        $XX.XXX

CLIENTE:
NOMBRE_CLIENTE_PLACEHOLDER
NIVEL_CLIENTE_PLACEHOLDER

DIRECCION FRECUENTE:
DIRECCION_FRECUENTE_PLACEHOLDER

CUPONES:
CUPONES_PLACEHOLDER

RECOMENDACIONES Y NOTAS ESPECIALES DEL CLIENTE:
- Si el cliente pide algo especial como salsas extras, sin ingrediente, doble porcion, instruccion de preparacion o cualquier preferencia: incluirlo en los ITEMS del pedido entre parentesis.
- Ejemplo: "La Especial $18.900 (sin cebolla, extra chimichurri)"

PEDIDO ADICIONAL O MODIFICACION DE ORDEN YA CONFIRMADA:
- Si el cliente ya tiene un pedido confirmado y quiere agregar algo, NO crees un pedido nuevo.
- Escribe MODIFICAR_PEDIDO:[numero]|AGREGAR:[item y precio]
- Si el cliente pide una preferencia, nota o instruccion especial (salsas aparte, sin cebolla, bien cocido, etc.) escribe MODIFICAR_PEDIDO:[numero]|NOTA:[instruccion exacta del cliente]
- Ejemplo notas: "salsas aparte" -> MODIFICAR_PEDIDO:123|NOTA:salsas aparte | "sin cebolla" -> MODIFICAR_PEDIDO:123|NOTA:sin cebolla | "bbq y ajo aparte" -> MODIFICAR_PEDIDO:123|NOTA:bbq y ajo aparte
- SIEMPRE usa MODIFICAR_PEDIDO para cualquier cambio o nota en pedido ya confirmado. NUNCA digas "anotado" sin escribir el tag.

IMAGENES:
- Si el cliente envia una imagen Y tiene un pedido activo esperando pago: es probablemente un comprobante. Confirma el pedido.
- Si el cliente envia una imagen SIN pedido activo: responde "Hola! Vi que enviaste una imagen. Puedes contarme que necesitas?"
- NUNCA confirmes un pedido por una imagen si no hay pedido activo pendiente de pago.

PREGUNTAS SIN RESPUESTA:
- Si no puedes responder con certeza: "Un momento, ya te confirmo ese detalle." y escribe: ALERTA_PREGUNTA:[la pregunta]

FLUJO:
1. Saludo -> mensaje amable + link menu
2. Cliente pide -> confirma con precios. Incluye notas especiales en los items.
3. Pregunta direccion COMPLETA: calle, numero, barrio. Si tiene direccion frecuente, pregunta si es la misma. Si el cliente menciona conjunto, edificio, urbanizacion o unidad residencial: pide apartamento Y bloque/torre SOLO si no lo ha dicho. Si el cliente dice "porteria", "portería", "en portería", "dejalo en porteria" o similar: eso es suficiente como punto de entrega, NO pidas apartamento. Acepta porteria como direccion completa.
   - SOLO escribe DIRECCION_LISTA:[direccion] cuando el cliente te haya dado una direccion real y completa. SIEMPRE escribe DIRECCION_LISTA en el MISMO mensaje donde confirmas la direccion, no en un mensaje separado.
   - Si el cliente dice solo "ahi mismo", "la misma", "igual que antes": confirma la direccion frecuente en voz alta y luego escribe DIRECCION_LISTA con esa direccion.
   - NUNCA escribas DIRECCION_LISTA si el cliente no ha dado ninguna direccion todavia.
   - Si no tienes direccion del cliente NO confirmes el pedido, sigue preguntando.
   EXCEPCION RECOGER: Si el cliente dice que va a recoger, pasa a buscar, lo recojo, para llevar, voy por el:
   - NO preguntes direccion
   - Responde: "Perfecto! Te esperamos. No hay costo de domicilio."
   - Escribe OBLIGATORIO: DIRECCION_LISTA:RECOGER EN TIENDA
   - En el PEDIDO_LISTO escribe DOMICILIO: 0
4. Con direccion -> calcula domicilio y muestra desglose
5. Confirma -> si el cliente NO indico metodo de pago desde el menu, pregunta como quiere pagar y da datos
6. Pago:
   - Nequi o Bancolombia: da los datos.
     * Si el cliente dice que paga AHORA: pide comprobante, cuando lo mande escribe PAGO_CONFIRMADO
     * Si el cliente dice "cuando llegue el pedido", "al recibirlo", "a la entrega":
       Responde confirmando y escribe PAGO_DATAFONO
   - Efectivo: pregunta valor -> escribe PAGO_EFECTIVO:[valor del billete]
   - Datafono: confirma que el domiciliario lo lleva -> escribe PAGO_DATAFONO
7. Comprobante recibido -> di EXACTAMENTE: "Listo! Recibimos tu comprobante, tu pedido entra a preparacion ahora mismo. Te avisamos cuando este listo y cuando salga el domiciliario." -> escribe PAGO_CONFIRMADO
8. NUNCA digas "el domiciliario ya va en camino" al confirmar. El pedido va a PREPARACION primero, luego LISTO, luego EN CAMINO.
9. NUNCA inventes tiempos. Si el cliente pregunta cuanto demora ANTES de confirmar: "Normalmente entre 30 y 50 minutos desde que confirmamos." Si ya confirmo: "Tu pedido esta en preparacion, te avisamos cada paso."

POST-CONFIRMACION:
- Respuestas cortas y calidas.
- Si el cliente pregunta cuanto demora: di "Tu pedido esta en preparacion, en cuanto este listo te avisamos y el domiciliario sale de inmediato. Normalmente entre 30 y 50 minutos desde que confirmas."
- NUNCA digas "va en camino" o "el domiciliario ya salio" a menos que el sistema te haya enviado el mensaje de estado "en_camino". Solo el sistema puede confirmar ese estado.
- NUNCA inventes tiempos exactos. Si insisten: "Dependera del trafico y la preparacion, pero te avisamos cada paso."
- NO reinicies el flujo ni tomes un nuevo pedido si el cliente ya tiene un pedido activo confirmado. Si el cliente saluda de nuevo o pregunta algo, responde en contexto del pedido activo.
- Si el cliente quiere AGREGAR productos a su pedido activo: di "Claro, que quieres agregar?" y cuando lo diga escribe MODIFICAR_PEDIDO:[numero_pedido]|AGREGAR:[producto y precio]
- Si el cliente quiere CANCELAR su pedido: di "Entendido, voy a avisar al equipo para cancelar tu pedido #[numero]. Ten en cuenta que si ya esta en preparacion puede que no sea posible." y escribe CANCELAR_PEDIDO:[numero_pedido]
- Si el cliente quiere cambiar la direccion de entrega: toma la nueva direccion y escribe MODIFICAR_PEDIDO:[numero_pedido]|DIRECCION:[nueva direccion]

OBLIGATORIO - escribe estos tags al final de tu respuesta (el cliente NO los ve):

Al confirmar productos:
PEDIDO_LISTO:
ITEMS: [categoria producto1 $precio (notas)|categoria producto2 $precio] — SIEMPRE incluye la categoria antes del nombre. Ejemplo: 'Hamburguesa La Especial $18.900|Bebida Gaseosa $3.000'
DESECHABLES: [valor total en pesos, ej: 500 si hay 1 comida, 1000 si hay 2]
DOMICILIO: [numero sin puntos ni signos, o 0]
TOTAL: [numero sin puntos ni signos]

Al confirmar direccion: DIRECCION_LISTA:[direccion completa]
Telefono adicional: TELEFONO_ADICIONAL:[numero]
Pedido adicional: PEDIDO_ADICIONAL_DE:[numero pedido original]
Pregunta sin respuesta: ALERTA_PREGUNTA:[pregunta]
Modificar pedido activo: MODIFICAR_PEDIDO:[numero_pedido]|AGREGAR:[items] o MODIFICAR_PEDIDO:[numero_pedido]|DIRECCION:[nueva direccion]
Cancelar pedido: CANCELAR_PEDIDO:[numero_pedido]

PAGO - escribe el tag correspondiente SOLO en estos casos exactos:
- Cliente MANDA UNA IMAGEN (comprobante de transferencia): PAGO_CONFIRMADO
- Cliente dice que va a pagar en EFECTIVO y da el valor del billete: PAGO_EFECTIVO:[valor]
- Cliente dice que va a pagar con DATAFONO o paga al recibir: PAGO_DATAFONO

MUY IMPORTANTE:
- Si el cliente solo dice "Nequi" o "Bancolombia" = NO escribas ningun tag. Solo dale los datos y pide el comprobante.
- PAGO_CONFIRMADO solo va cuando el cliente MANDA LA IMAGEN del comprobante, nunca antes.
- Aplica promos del dia. Si no existe el producto, ofrece alternativas.
- NO seas insistente ni repitas preguntas que el cliente ya respondio. Si dio una respuesta (aunque sea parcial), acéptala y avanza. Ser fastidioso espanta clientes.
- Si el cliente dice "porteria", "conjunto", "casa", "el mismo de siempre" o cualquier referencia de entrega: acepta y confirma, no sigas preguntando detalles innecesarios.
- Una sola pregunta por mensaje. Si necesitas barrio Y apartamento, pregunta solo el barrio primero.

SI EL CLIENTE PREGUNTA SI ERES IA O UN BOT:
- Responde con honestidad y calidez. Ejemplo: "Si, soy una IA. Me llamo ${nombreLuz}, fui creada por KCCorp para hacer tu experiencia de pedido mas rapida y agradable. Puedo tomar tu pedido, resolver tus dudas y avisarte en cada paso. Y si prefieres hablar con alguien del equipo, con mucho gusto te comunico."
- NO niegues ser IA si te preguntan directamente. La honestidad genera mas confianza.
- Puedes destacar que eres IA de KCCorp pero con intencion genuina de ayudar, no como disculpa.
- Si preguntan quien te creo o quien esta detras: "Fui desarrollada por KCCorp, una empresa estadounidense especializada en soluciones de IA para negocios."`;
}

// ── GUARDAR PEDIDO ────────────────────────────────────────────────────────────
async function guardarPedidoSupabase(restauranteId, pedidoData) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var subtotal = Number(pedidoData.total) - Number(pedidoData.desechables||0) - Number(pedidoData.domicilio||0);
    // Buscar nombre y nivel del cliente
    var nombreClientePedido = null, nivelClientePedido = null;
    try {
      var telLocalPedido = stripCountryCode(pedidoData.phone);
      var cfResp = await axios.get(SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restauranteId + "&telefono=eq." + telLocalPedido + "&select=nombre_cliente,nivel_fidelidad,total_pedidos", { headers: sbH(true) });
      if (cfResp.data && cfResp.data.length) {
        nombreClientePedido = cfResp.data[0].nombre_cliente || null;
        nivelClientePedido = cfResp.data[0].nivel_fidelidad || null;
      }
    } catch(e) {}
    var payload = {
      restaurante_id: restauranteId, numero_pedido: pedidoData.orderNumber,
      cliente_tel: stripCountryCode(pedidoData.phone), items: pedidoData.items,
      subtotal, desechables: pedidoData.desechables, domicilio: pedidoData.domicilio,
      total: pedidoData.total, direccion: pedidoData.address,
      metodo_pago: pedidoData.paymentMethod, estado: "confirmado",
      notas_especiales: pedidoData.notasEspeciales || null,
      pedido_adicional_de: pedidoData.pedidoAdicionalDe || null,
      comprobante_url: pedidoData.comprobanteUrl || null,
      comprobante_media_id: pedidoData.comprobanteMediaId || null,
      cliente_nombre: nombreClientePedido,
      cliente_nivel: nivelClientePedido
    };
    var response = await axios.post(SUPABASE_URL + "/rest/v1/pedidos", payload, {
      headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=representation" }
    });
    console.log("Pedido #" + pedidoData.orderNumber + " guardado. ID:", response.data[0]?.id || "?");
    if (pedidoData.address && pedidoData.address !== "Por confirmar") {
      guardarDireccionFrecuente(restauranteId, pedidoData.phone, pedidoData.address);
    }
    // Actualizar conteo de pedidos en clientes_frecuentes
    try {
      var svcKey2 = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
      // Contar pedidos reales de este cliente
      var countResp = await axios.get(SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restauranteId + "&cliente_tel=eq." + encodeURIComponent(pedidoData.phone) + "&select=id", { headers: { "apikey": svcKey2, "Authorization": "Bearer " + svcKey2 } });
      var totalPedidos = (countResp.data || []).length;
      var nivel = totalPedidos >= 25 ? "oro" : totalPedidos >= 10 ? "plata" : "bronce";
      var telLocal = stripCountryCode(pedidoData.phone);
      await axios.post(SUPABASE_URL + "/rest/v1/clientes_frecuentes?on_conflict=restaurante_id,telefono",
        { restaurante_id: restauranteId, telefono: telLocal, total_pedidos: totalPedidos, nivel_fidelidad: nivel, updated_at: new Date().toISOString() },
        { headers: { "apikey": svcKey2, "Authorization": "Bearer " + svcKey2, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } });
      console.log("Cliente " + pedidoData.phone + " -> " + totalPedidos + " pedidos, nivel: " + nivel);
      // Guardar nivel en orderState para que Luz pueda felicitar
      if (pedidoData.phone) {
        if (!global.clienteNiveles) global.clienteNiveles = {};
        global.clienteNiveles[pedidoData.phone] = { total: totalPedidos, nivel };
      }
    } catch(e) { console.error("updateClienteNivel:", e.message); }
  } catch (err) {
    console.error("Error guardando pedido:", err.response ? JSON.stringify(err.response.data) : err.message);
  }
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

function getMenuUrl(restaurante) {
  var base = process.env.MENU_PAGE_URL || "https://luz-ia-production-4cff.up.railway.app/menu";
  if (restaurante && restaurante.id) return base + "?rest=" + restaurante.id;
  return base;
}

async function descargarImagenMeta(mediaId) {
  try {
    var token = process.env.WHATSAPP_TOKEN;
    if (!token) return null;
    var urlRes = await axios.get("https://graph.facebook.com/v20.0/" + mediaId, { headers: { "Authorization": "Bearer " + token } });
    var mediaUrl = urlRes.data?.url;
    if (!mediaUrl) return null;
    var imgRes = await axios.get(mediaUrl, { headers: { "Authorization": "Bearer " + token }, responseType: "arraybuffer" });
    return "data:" + (imgRes.headers["content-type"] || "image/jpeg") + ";base64," + Buffer.from(imgRes.data).toString("base64");
  } catch (e) { console.error("descargarImagen:", e.message); return null; }
}

async function sendWhatsAppImage(to, imageUrl, caption, phoneId) {
  var pid = phoneId || process.env.WHATSAPP_PHONE_ID;
  var token = process.env.WHATSAPP_TOKEN;
  var payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "image",
    image: { link: imageUrl, caption: caption || "" }
  };
  var r = await axios.post("https://graph.facebook.com/v20.0/" + pid + "/messages", payload, {
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }
  });
  return r.data;
}

async function verificarComprobante(mediaId, totalEsperado) {
  try {
    var imgData = await descargarImagenMeta(mediaId);
    if (!imgData) return { valido: null };
    // descargarImagenMeta returns a data URL like "data:image/jpeg;base64,..."
    var base64, mediaType;
    if (typeof imgData === "string" && imgData.startsWith("data:")) {
      var parts = imgData.split(",");
      base64 = parts[1];
      mediaType = (parts[0].split(":")[1] || "image/jpeg").split(";")[0];
    } else {
      base64 = Buffer.from(imgData).toString("base64");
      mediaType = "image/jpeg";
    }
    console.log("Verificando comprobante, base64 length:", base64 ? base64.length : 0);
    var totalFmt = Number(totalEsperado).toLocaleString("es-CO");
    var prompt = "Analiza esta imagen cuidadosamente. ";
    prompt += "¿Es un comprobante oficial de transferencia bancaria exitosa de Nequi o Bancolombia? ";
    prompt += "Para que sea valido DEBE mostrar: (1) interfaz de app bancaria, (2) monto en pesos colombianos, (3) mensaje de transferencia exitosa. ";
    prompt += "Si es una foto de comida, cocina, personas, objetos, o cualquier cosa que NO sea pantalla de app bancaria, responde valido:false. ";
    prompt += "Responde SOLO con JSON: {valido:true o false, razon:string breve}. ";
    prompt += "Monto esperado: aproximadamente $" + totalFmt + " COP.";
    var resp = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: prompt }
          ]
        }]
      },
      { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } }
    );
    var text = (resp.data && resp.data.content && resp.data.content[0]) ? resp.data.content[0].text : "{}";
    var start = text.indexOf("{");
    var end2 = text.lastIndexOf("}");
    if (start === -1 || end2 === -1) return { valido: null };
    return JSON.parse(text.substring(start, end2 + 1));
  } catch(e) {
    console.error("verificarComprobante:", e.message);
    return { valido: null };
  }
}

async function sendWhatsAppMessage(to, message, phoneNumberId) {
  var token = process.env.WHATSAPP_TOKEN;
  var pid   = phoneNumberId || process.env.WHATSAPP_PHONE_ID;
  if (!token || !pid) { console.error("Faltan WHATSAPP_TOKEN o PHONE_ID"); return; }
  var toNum = to.replace(/[^0-9]/g, "");
  if (!toNum.startsWith("57") && toNum.length === 10) toNum = "57" + toNum;
  try {
    var resp = await axios.post("https://graph.facebook.com/v20.0/" + pid + "/messages",
      { messaging_product: "whatsapp", to: toNum, type: "text", text: { body: message } },
      { headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" } });
    console.log("Enviado a " + toNum + " OK - id:", resp.data?.messages?.[0]?.id || "?");
  } catch (e) {
    var errData = e.response ? e.response.data : null;
    console.error("sendWA ERROR a " + toNum + ":", JSON.stringify(errData) || e.message);
    console.error("sendWA status:", e.response?.status, "| pid:", pid, "| token inicio:", token ? token.substring(0,10) : "null");
  }
}

function estaEnHorario(restaurante) {
  try {
    var col = getHoraColombia();
    var hora = col.getHours() * 60 + col.getMinutes();
    var ap = (restaurante.hora_apertura || "16:00:00").split(":").map(Number);
    var ci = (restaurante.hora_cierre   || "00:00:00").split(":").map(Number);
    var minAp = ap[0] * 60 + ap[1];
    var minCi = ci[0] * 60 + ci[1];
    // FIX: 00:00 means end of day (23:59), not start of day (0)
    if (minCi === 0) minCi = 1439;
    var dias = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    var diaHoy = dias[col.getDay()];
    var diasAct = (restaurante.dias_activos || "lunes,martes,miercoles,jueves,viernes,sabado,domingo").split(",");
    if (!diasAct.includes(diaHoy)) return false;
    // Schedule crosses midnight (e.g. 20:00 - 02:00)
    if (minCi < minAp) return hora >= minAp || hora <= minCi;
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

// ── PRINT TICKET ──────────────────────────────────────────────────────────────
async function printTicket(orderData) {
  var subtotal = Number(orderData.total) - Number(orderData.desechables||0) - Number(orderData.domicilio||0);
  var pagoLabel =
    orderData.paymentMethod === "efectivo"    ? "Efectivo - cancela con: " + (orderData.cashDenomination || "?") :
    orderData.paymentMethod === "datafono"    ? "Datafono (llevar)" :
    orderData.paymentMethod === "bancolombia" ? "Bancolombia llave: " + (orderData.bancoCuenta || "0089102980") :
    "Nequi " + (orderData.nequiNum || "3177269578");

  var restNombre = orderData.restauranteNombre || "LA CURVA STREET FOOD";
  var restCiudad = orderData.restauranteCiudad || "Cali";

  var lines = [
    "================================",
    "  " + restNombre.toUpperCase().substring(0, 30),
    "  " + restCiudad,
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
    pedidoAdicionalDe: orderData.pedidoAdicionalDe || null,
    restauranteNombre: restNombre, restauranteCiudad: restCiudad
  }, { timeout: 6000 })
    .then(function() { console.log("Ticket #" + orderData.orderNumber + " enviado a impresora"); })
    .catch(function(e) { console.error("Error impresora:", e.message); });

  return ticketText;
}

// ── PARSE REPLY ───────────────────────────────────────────────────────────────
function parseReply(reply, from) {
  var cleanReply = reply;
  var sideEffect = null;

  var preParsedDir = null;
  if (reply.indexOf("DIRECCION_LISTA:") !== -1) {
    var preDir = reply.match(/DIRECCION_LISTA:(.+)/);
    if (preDir) preParsedDir = preDir[1].trim();
  }

  if (reply.indexOf("PEDIDO_LISTO:") !== -1) {
    var itemsMatch  = reply.match(/ITEMS:\s*(.+)/);
    var totalMatch  = reply.match(/TOTAL:\s*([^\n]+)/);
    var desechMatch = reply.match(/DESECHABLES:\s*([^\n]+)/);
    var domMatch    = reply.match(/DOMICILIO:\s*([^\n]+)/);

    if (itemsMatch && totalMatch) {
      var items = itemsMatch[1].split("|").map(function(i) { return i.trim(); });
      var total = limpiarNumero(totalMatch[1]);
      var desechRaw = limpiarNumero(desechMatch ? desechMatch[1] : "0");
      var desech = Number(desechRaw) < 50 ? String(Number(desechRaw) * 500) : desechRaw;
      var domicilio = limpiarNumero(domMatch ? domMatch[1] : "0");

      var notasArr = [];
      items.forEach(function(item) {
        var m = item.match(/\(([^)]+)\)/);
        if (m) notasArr.push(m[1]);
      });

      var prevAddress = (orderState[from] ? orderState[from].address : null) || preParsedDir;
      var prevPayment = orderState[from] ? orderState[from].paymentMethod : null;
      orderState[from] = {
        status: prevAddress ? "esperando_pago" : "esperando_direccion",
        orderNumber: nextOrderNumber(),
        items, desechables: desech, domicilio, total,
        notasEspeciales: notasArr.length > 0 ? notasArr.join(" | ") : null,
        address: prevAddress || null,
        paymentMethod: prevPayment || null
      };
      console.log("orderState #" + orderState[from].orderNumber + " creado para:", from);
      sideEffect = "pedido_registrado";
    }
    cleanReply = cleanReply.replace(/PEDIDO_LISTO:[\s\S]*?(?=DIRECCION_LISTA:|TELEFONO_ADICIONAL:|PAGO_|PEDIDO_ADICIONAL_DE:|ALERTA_PREGUNTA:|$)/g, "").trim();
  }

  if (reply.indexOf("DIRECCION_LISTA:") !== -1) {
    var dirMatch = reply.match(/DIRECCION_LISTA:(.+)/);
    if (dirMatch && orderState[from]) {
      orderState[from].address = dirMatch[1].trim();
      orderState[from].status = "esperando_pago";
      sideEffect = "direccion_registrada";
    }
    cleanReply = cleanReply.replace(/DIRECCION_LISTA:.+/g, "").trim();
  }

  if (reply.indexOf("TELEFONO_ADICIONAL:") !== -1) {
    var telMatch = reply.match(/TELEFONO_ADICIONAL:(.+)/);
    if (telMatch && orderState[from]) orderState[from].extraPhone = telMatch[1].trim();
    cleanReply = cleanReply.replace(/TELEFONO_ADICIONAL:.+/g, "").trim();
  }

  if (reply.indexOf("PEDIDO_ADICIONAL_DE:") !== -1) {
    var addMatch = reply.match(/PEDIDO_ADICIONAL_DE:(.+)/);
    if (addMatch) {
      var numAdicional = addMatch[1].trim();
      // Redirect to MODIFICAR_PEDIDO instead of creating new order
      if (orderState[from] && orderState[from].orderNumber) {
        // Convert to modification - extract new items from current orderState
        var itemsNuevos = Array.isArray(orderState[from].items) ? orderState[from].items.filter(function(i){ return i.toString().indexOf('➕') !== 0; }) : [];
        sideEffect = "modificar_pedido";
        if (!orderState[from].modificarPedido) {
          orderState[from].modificarPedido = { numero: numAdicional || orderState[from].orderNumber, accion: "AGREGAR:" + itemsNuevos.slice(-3).join(", ") };
        }
        console.log("PEDIDO_ADICIONAL_DE interceptado y convertido a MODIFICAR_PEDIDO");
      }
      if (orderState[from]) orderState[from].pedidoAdicionalDe = numAdicional;
      else orderState[from] = { pedidoAdicionalDe: numAdicional, status: "esperando_direccion" };
    }
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

  if (reply.indexOf("MODIFICAR_PEDIDO:") !== -1) {
    var modMatch = reply.match(/MODIFICAR_PEDIDO:([^|\n]+)[|]([^\n]+)/);
    if (modMatch) {
      sideEffect = "modificar_pedido";
      if (!orderState[from]) orderState[from] = {};
      var modNumero = modMatch[1].trim();
      var modAccion = modMatch[2].trim();
      // If no order number, use current active order
      if (!modNumero && orderState[from] && orderState[from].orderNumber) modNumero = String(orderState[from].orderNumber);
      orderState[from].modificarPedido = { numero: modNumero, accion: modAccion };
      console.log("MODIFICAR parsed:", modNumero, modAccion);
    }
    cleanReply = cleanReply.replace(/MODIFICAR_PEDIDO:.+/g, "").trim();
  }

  if (reply.indexOf("CANCELAR_PEDIDO:") !== -1) {
    var cancelMatch = reply.match(/CANCELAR_PEDIDO:(.+)/);
    if (cancelMatch) {
      sideEffect = "cancelar_pedido";
      if (!orderState[from]) orderState[from] = {};
      orderState[from].cancelarPedido = cancelMatch[1].trim();
    }
    cleanReply = cleanReply.replace(/CANCELAR_PEDIDO:.+/g, "").trim();
  }

  if (reply.indexOf("PAGO_EFECTIVO:") !== -1) {
    var cashMatch = reply.match(/PAGO_EFECTIVO:(.+)/);
    if (cashMatch && orderState[from]) {
      orderState[from].paymentMethod = "efectivo";
      orderState[from].cashDenomination = cashMatch[1].trim();
      orderState[from].status = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = cleanReply.replace(/PAGO_EFECTIVO:.+/g, "").trim();
  }

  if (reply.indexOf("PAGO_DATAFONO") !== -1) {
    if (orderState[from]) {
      orderState[from].paymentMethod = "datafono";
      orderState[from].status = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = cleanReply.replace("PAGO_DATAFONO", "").trim();
  }

  if (reply.indexOf("PAGO_CONFIRMADO") !== -1) {
    if (orderState[from]) {
      orderState[from].paymentMethod = orderState[from].paymentMethod || "digital";
      orderState[from].status = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = cleanReply.replace("PAGO_CONFIRMADO", "").trim();
  }

  return { cleanReply, sideEffect };
}

// ── RUTAS ─────────────────────────────────────────────────────────────────────
app.get("/menu",        function(req, res) { res.sendFile(path.join(__dirname, "menu.html")); });
app.get("/mapa",        function(req, res) { res.sendFile(path.join(__dirname, "mapa_zonas.html")); });
app.get("/admin",       function(req, res) { res.sendFile(path.join(__dirname, "admin.html")); });
app.get("/restaurante", function(req, res) { res.sendFile(path.join(__dirname, "restaurante.html")); });
app.get("/cocina",      function(req, res) { res.sendFile(path.join(__dirname, "cocina.html")); });
app.get("/domi",        function(req, res) { res.sendFile(path.join(__dirname, "domiciliario.html")); });
app.get("/mesero",      function(req, res) { res.sendFile(path.join(__dirname, "mesero2.html")); });
app.get("/sw.js",       function(req, res) { res.setHeader("Content-Type","application/javascript"); res.setHeader("Service-Worker-Allowed","/"); res.sendFile(path.join(__dirname, "sw.js")); });
app.get("/offline.html",function(req, res) { res.sendFile(path.join(__dirname, "offline.html")); });
app.get("/manifest-cocina.json",  function(req, res) { res.sendFile(path.join(__dirname, "manifest-cocina.json")); });
app.get("/manifest-mesero.json",  function(req, res) { res.sendFile(path.join(__dirname, "manifest-mesero.json")); });
app.get("/manifest-domi.json",    function(req, res) { res.sendFile(path.join(__dirname, "manifest-domi.json")); });
app.get("/vapid-public-key",      function(req, res) { res.json({ key: VAPID_PUBLIC }); });

// ── PUSH SUBSCRIPTIONS ───────────────────────────────────────────────────────
app.post("/api/push-subscribe", async function(req, res) {
  var { restaurante_id, rol, subscription, nombre, telefono } = req.body;
  nombre = telefono || nombre || rol;
  if (!restaurante_id || !rol || !subscription) return res.status(400).json({ error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(
      SUPABASE_URL + "/rest/v1/push_subscriptions?on_conflict=restaurante_id,endpoint",
      { restaurante_id, rol, nombre: nombre || rol, subscription: JSON.stringify(subscription), endpoint: subscription.endpoint, activo: true, updated_at: new Date().toISOString() },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/push-test", async function(req, res) {
  var { restaurante_id, rol, title, body } = req.body;
  if (!restaurante_id) return res.status(400).json({ error: "Falta restaurante_id" });
  await enviarPushPorRol(restaurante_id, rol || "cocina", {
    title: title || "🔔 LUZ IA",
    body: body || "Notificación de prueba",
    icon: "/icons/icon-192.png",
    url: "/" + (rol || "cocina")
  });
  res.json({ ok: true });
});

app.post("/api/pedido-estado", async function(req, res) {
  var { id, estado, telefono_cliente, numero_pedido, restaurante_id } = req.body;
  if (!id || !estado) return res.status(400).json({ error: "Faltan datos" });
  var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  // listo_entrega = cocina cerró su vista, pero el panel de restaurante lo sigue viendo
  var estadoReal = estado === "listo_entrega" ? "listo_entrega" : estado;
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id, { estado: estadoReal },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
    if (estado === "listo_entrega") { return res.json({ ok: true }); } // no WhatsApp, no panel sound
    if (telefono_cliente) {
      var restaurante = null;
      if (restaurante_id) {
        try { var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id + "&select=*", { headers: sbH(false) }); if (rr.data?.length) restaurante = rr.data[0]; } catch(e) {}
      }
      var numStr = numero_pedido ? " #" + numero_pedido : "";
      var pid = restaurante?.whatsapp_phone_id || process.env.WHATSAPP_PHONE_ID;
      if (estado === "en_preparacion") {
        var msg = getMensaje(restaurante, "msg_en_preparacion", "Tu pedido" + numStr + " ya esta en preparacion! En breve estara listo.");
        await sendWhatsAppMessage(telefono_cliente, msg, pid);
        if (restaurante_id) guardarMensajeSupabase(restaurante_id, telefono_cliente, msg, "estado_luz", null);
        // Push a meseros: pedido en preparacion
        if (restaurante_id) enviarPushPorRol(restaurante_id, "mesero", { title: "🟡 Preparando", body: "Pedido" + numStr + " en preparacion", icon: "/icons/icon-192.png", vibrate: [100,50,100], tag: "pedido-" + id, url: "/mesero" });
      }
      if (estado === "listo") {
        var esMesaPedido = req.body.direccion && req.body.direccion.toUpperCase().indexOf("MESA") !== -1;
        var meseroNombre = req.body.domiciliario_nombre || null;
        var msgListoDefault = esMesaPedido
          ? "Tu pedido" + numStr + " esta listo!" + (meseroNombre ? " " + meseroNombre + " te lo lleva enseguida." : " Ya te lo llevamos.")
          : "Tu pedido" + numStr + " esta listo y esperando al domiciliario!";
        var msg = getMensaje(restaurante, "msg_listo", msgListoDefault);
        await sendWhatsAppMessage(telefono_cliente, msg, pid);
        if (restaurante_id) guardarMensajeSupabase(restaurante_id, telefono_cliente, msg, "estado_luz", null);
        // Push a meseros y domis: pedido listo
        var esMesaStr = req.body.direccion && req.body.direccion.toUpperCase().indexOf("MESA") !== -1;
        if (restaurante_id && esMesaStr) {
          enviarPushPorRol(restaurante_id, "mesero", { title: "✅ ¡Listo para servir!", body: "Pedido" + numStr + " está listo — llévalo a la mesa", icon: "/icons/icon-192.png", vibrate: [200,100,200,100,200], tag: "listo-" + id, url: "/mesero" });
        } else if (restaurante_id) {
          enviarPushPorRol(restaurante_id, "domiciliario", { title: "✅ Pedido listo", body: "Pedido" + numStr + " listo para entregar", icon: "/icons/icon-192.png", vibrate: [200,100,200], tag: "listo-" + id, url: "/domi" });
        }
      }
      if (estado === "en_camino") {
        var msg = getMensaje(restaurante, "msg_en_camino", "Tu pedido" + numStr + " ya va en camino. Que lo disfrutes!");
        try { await sendWhatsAppMessage(telefono_cliente, msg, pid); } catch(e) {}
        if (restaurante_id) guardarMensajeSupabase(restaurante_id, telefono_cliente, msg, "estado_luz", null);
        // Push al cliente
        enviarPushClientePorTel(restaurante_id, telefono_cliente, {
          title: "🛵 ¡Tu pedido va en camino!",
          body: "El domiciliario ya salió" + numStr + ". ¡Que lo disfrutes!",
          tag: "estado-"+id
        });
      }
    }

    // ── ACTUALIZAR FIDELIDAD AL ENTREGAR ─────────────────────────────────────
    // Runs for ALL pedidos (mesa + domicilio) when marked entregado
    if (estado === "entregado" && restaurante_id && telefono_cliente) {
      try {
        var telFid = stripCountryCode(telefono_cliente);
        // Count total delivered orders for this client
        var countR = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante_id +
          "&cliente_tel=eq." + encodeURIComponent(telFid) +
          "&estado=eq.entregado&select=id",
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
        );
        var totalPed = (countR.data || []).length;
        var nivelFid = totalPed >= 25 ? "oro" : totalPed >= 10 ? "plata" : "bronce";
        // Upsert into clientes_frecuentes
        await axios.post(
          SUPABASE_URL + "/rest/v1/clientes_frecuentes?on_conflict=restaurante_id,telefono",
          { restaurante_id: restaurante_id, telefono: telFid, total_pedidos: totalPed, nivel_fidelidad: nivelFid, updated_at: new Date().toISOString() },
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } }
        );
        console.log("Fidelidad actualizada:", telFid, "->", totalPed, "pedidos, nivel:", nivelFid);
      } catch(eFid) { console.error("fidelidad update error:", eFid.message); }
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

app.post("/enviar-imagen-cliente", async function(req, res) {
  var { telefono, restaurante_id, imagen, mime } = req.body;
  if (!telefono || !imagen) return res.status(400).json({ error: "Faltan datos" });
  try {
    var token = process.env.WHATSAPP_TOKEN;
    var pid = process.env.WHATSAPP_PHONE_ID;
    if (!token || !pid) return res.status(500).json({ error: "Sin credenciales WA" });
    var buf = Buffer.from(imagen, "base64");
    var FormData = require("form-data");
    var form = new FormData();
    form.append("file", buf, { filename: "imagen.jpg", contentType: mime || "image/jpeg" });
    form.append("messaging_product", "whatsapp");
    var uploadRes = await axios.post(
      "https://graph.facebook.com/v20.0/" + pid + "/media",
      form, { headers: { "Authorization": "Bearer " + token, ...form.getHeaders() } }
    );
    var mediaId = uploadRes.data?.id;
    if (!mediaId) return res.status(500).json({ error: "No se pudo subir imagen" });
    var toNum = telefono.replace(/[^0-9]/g, "");
    if (!toNum.startsWith("57") && toNum.length === 10) toNum = "57" + toNum;
    await axios.post("https://graph.facebook.com/v20.0/" + pid + "/messages",
      { messaging_product: "whatsapp", to: toNum, type: "image", image: { id: mediaId } },
      { headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" } }
    );
    if (restaurante_id) guardarMensajeSupabase(restaurante_id, telefono, "📷 Imagen enviada desde el panel", "restaurante", null);
    res.json({ ok: true });
  } catch (e) {
    console.error("enviarImagen:", e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/enviar-mensaje-cliente", async function(req, res) {
  if (!req.body.telefono || !req.body.mensaje) return res.status(400).json({ error: "Faltan datos" });
  try {
    var pid = process.env.WHATSAPP_PHONE_ID;
    if (req.body.restaurante_id) {
      try {
        var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id + "&select=whatsapp_phone_id", { headers: sbH(false) });
        if (rr.data?.length && rr.data[0].whatsapp_phone_id) pid = rr.data[0].whatsapp_phone_id;
      } catch(e) {}
    }
    // Guardar en Supabase siempre, independiente de WhatsApp
    if (req.body.restaurante_id) guardarMensajeSupabase(req.body.restaurante_id, req.body.telefono, req.body.mensaje, "restaurante", null);
    // Intentar WhatsApp sin bloquear si falla
    try { await sendWhatsAppMessage(req.body.telefono, req.body.mensaje, pid); } catch(e) { console.error("WA:", e.message); }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/pedido-manual", async function(req, res) {
  var { restaurante_id, telefono, items, total, desechables, domicilio, direccion, metodo_pago, notas_especiales } = req.body;
  if (!restaurante_id || !telefono || !items || !total) return res.status(400).json({ error: "Faltan datos" });
  try {
    var num = ++orderCounter;
    var subtotal = Number(total) - Number(desechables||0) - Number(domicilio||0);
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var payload = {cliente_nombre: req.body.nombre_cliente || null,
comprobante_url: req.body.comprobante_url || null,
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
    var msg = getMensaje(restaurante, "msg_en_camino", "Tu pedido" + numStr + " ya va en camino. Que lo disfrutes!");
    var pid = restaurante?.whatsapp_phone_id || process.env.WHATSAPP_PHONE_ID;
    await sendWhatsAppMessage(req.body.telefono, msg, pid);
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
    // Obtener phone_id del restaurante
    var pid = process.env.WHATSAPP_PHONE_ID;
    try {
      var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id + "&select=whatsapp_phone_id", { headers: sbH(false) });
      if (rr.data?.length && rr.data[0].whatsapp_phone_id) pid = rr.data[0].whatsapp_phone_id;
    } catch(e) {}
    var enviados = 0, fallidos = 0;
    for (var i = 0; i < telefonos.length; i++) {
      try {
          if (req.body.imagen_url) {
            // Send image first then text
            await sendWhatsAppImage(telefonos[i], req.body.imagen_url, req.body.mensaje, pid);
          } else {
            await sendWhatsAppMessage(telefonos[i], req.body.mensaje, pid);
          }
          enviados++;
        }
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

app.get("/api/mis-pedidos/:telefono", async function(req, res) {
  if (!req.query.restaurante_id) return res.json({ ok: true, pedidos: [] });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var tel = req.params.telefono.replace(/[^0-9]/g,"");
    if(tel.startsWith("57") && tel.length===12) tel=tel.slice(2);
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + req.query.restaurante_id +
      "&cliente_tel=eq." + encodeURIComponent(tel) +
      "&estado=not.in.(entregado,cancelado)&order=created_at.desc&limit=10&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
    res.json({ ok: true, pedidos: r.data || [] });
  } catch (e) { res.json({ ok: true, pedidos: [] }); }
});

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

app.post("/api/alerta-pregunta", async function(req, res) {
  var { restaurante_id, telefono, pregunta } = req.body;
  if (!restaurante_id || !pregunta) return res.status(400).json({ error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/mensajes",
      { restaurante_id, telefono, mensaje: "ALERTA_PREGUNTA: " + pregunta, tipo: "alerta_pregunta" },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/menu", async function(req, res) {
  if (!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + req.query.restaurante_id +
      "&order=categoria,orden&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch(e) { res.json([]); }
});

app.delete("/api/menu-item/:id", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.delete(SUPABASE_URL + "/rest/v1/menu_items?id=eq." + req.params.id,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.patch("/api/menu-item/:id", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.patch(SUPABASE_URL + "/rest/v1/menu_items?id=eq." + req.params.id,
      req.body,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/zonas", async function(req, res) {
  if (!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/zonas_domicilio?restaurante_id=eq." + req.query.restaurante_id + "&order=precio.asc",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch(e) { res.json([]); }
});

app.get("/webhook", function(req, res) {
  var mode = req.query["hub.mode"], token = req.query["hub.verify_token"], challenge = req.query["hub.challenge"];
  var VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "luz_verify_token_2026";
  if (mode === "subscribe" && token === VERIFY_TOKEN) { console.log("Webhook verificado"); return res.status(200).send(challenge); }
  if (!mode) return res.send("LUZ esta activa");
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
      userText = caption ? caption + " [El cliente envio una imagen]" : "[El cliente envio una imagen]";
    } else if (msgType === "location") {
      var loc = msg.location;
      userText = "Mi ubicacion es: lat " + loc.latitude + ", lng " + loc.longitude + (loc.name ? " (" + loc.name + ")" : "");
    } else if (msgType === "interactive") {
      userText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
    } else if (msgType === "reaction") {
      return;
    } else {
      console.log("Tipo no soportado: " + msgType); return;
    }

    if (!userText) return;

    if (!orderState[from]) {
      var saved = await getOrderState(from);
      if (saved) { orderState[from] = saved; console.log("orderState recuperado para:", from); }
    }

    var restaurante = await getRestaurante(phoneNumberId);
    if (restaurante) {
      if (restaurante.estado !== "activo") { console.log("Restaurante inactivo"); return; }
      if (!estaEnHorario(restaurante)) {
        console.log("Fuera de horario - avisando cliente");
        var horaAp = (restaurante.hora_apertura||"16:00:00").substring(0,5);
        var horaCi = (restaurante.hora_cierre||"00:00:00").substring(0,5);
        var diasAct = (restaurante.dias_activos||"lunes a domingo").replace(/,/g," | ");
        var msgFuera = getMensaje(restaurante, "msg_fuera_horario",
          "Hola! En este momento estamos cerrados. Nuestro horario de atencion es de " + horaAp + " a " + horaCi + " (" + diasAct + "). Con mucho gusto te atendemos en ese horario!");
        await sendWhatsAppMessage(from, msgFuera, phoneNumberId);
        if (restaurante) guardarMensajeSupabase(restaurante.id, stripCountryCode(from), userText, "cliente", null).catch(function(){});
        if (restaurante) guardarMensajeSupabase(restaurante.id, stripCountryCode(from), msgFuera, "restaurante", null).catch(function(){});
        return;
      }
      var silencio = await estaEnSilencio(restaurante.id, from);
      if (silencio) {
        console.log("SILENCIO para:", from);
        guardarMensajeSupabase(restaurante.id, stripCountryCode(from), userText, "cliente", esImagen ? mediaId : null).catch(function(){});
        return;
      }
    }

    var esComprobante = false;
    if (esImagen && mediaId) {
      var estadoActual = orderState[from] ? orderState[from].status : null;
      
      if (estadoActual === "esperando_pago") {
        // ONLY here do we verify as comprobante
        esComprobante = true;
        userText = "[El cliente envio una imagen mientras espera pagar. Probablemente es su comprobante.]";
      } else {
        // Any other state: browsing, asking, confirmed, etc.
        // Just tell Luz an image was sent and let her respond naturally
        esComprobante = false;
        userText = "[El cliente envio una imagen. Puede ser una foto del menu, un producto, o referencia visual. Responde con naturalidad segun el contexto de la conversacion.]";
      }
    }

    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: userText });
    if (conversations[from].length > 20) conversations[from] = conversations[from].slice(-20);

    var menuParaPrompt;
    if (restaurante) {
      var menuConfig = getMenuConfig(restaurante);
      menuParaPrompt = menuConfig || await getMenuDinamico(restaurante.id);
    } else {
      menuParaPrompt = "(Sin menu configurado. Atiende al cliente manualmente.)";
    }

    var ubicacion = restaurante?.direccion || "";
    var horaCol = getHoraColombia();
    var horaStr = horaCol.getHours().toString().padStart(2,"0") + ":" + horaCol.getMinutes().toString().padStart(2,"0");
    var diaHoy = getDiaColombiaStr();

    var dirFrecuente = null;
    var nombreCliente = null;
    var nivelCliente = null;
    if (restaurante) {
      dirFrecuente = await getDireccionFrecuente(restaurante.id, from);
      // Obtener nombre y nivel del cliente
      try {
        var clienteInfo = await axios.get(SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restaurante.id + "&telefono=eq." + encodeURIComponent(from) + "&select=nombre_cliente,nivel_fidelidad,total_pedidos", { headers: sbH(true) });
        if (clienteInfo.data && clienteInfo.data.length > 0) {
          nombreCliente = clienteInfo.data[0].nombre_cliente || null;
          nivelCliente = clienteInfo.data[0].nivel_fidelidad || null;
        }
      } catch(e) {}
    }
    var dirFrecuenteTexto = dirFrecuente
      ? "Este cliente ya ha pedido antes. Su ultima direccion fue: " + dirFrecuente + ". Si pide de nuevo, preguntale: '¿Te lo mando a " + dirFrecuente + " igual que la vez anterior?' Espera confirmacion antes de asumir."
      : "No hay direccion previa registrada para este cliente.";
    var nombreClienteTexto = nombreCliente
      ? "El cliente se llama " + nombreCliente + ". Usalo naturalmente en la conversacion cuando sea apropiado, no en cada mensaje."
      : "No tenemos el nombre de este cliente registrado.";

    var nivelClienteTexto = nivelCliente && nivelCliente !== "bronce"
      ? "Este cliente es nivel " + nivelCliente.toUpperCase() + " en el programa de fidelidad."
      : "";

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

    // Check if closing soon (within 20 minutes)
  var cierreProximo = false;
  try {
    var horaColNow = getHoraColombia();
    var horaActMin = horaColNow.getHours() * 60 + horaColNow.getMinutes();
    var ciParts = (restaurante.hora_cierre||"00:00:00").split(":").map(Number);
    var minCierre = ciParts[0] * 60 + ciParts[1];
    var diff = minCierre - horaActMin;
    if (diff < 0) diff += 1440;
    cierreProximo = diff <= 20 && diff >= 0;
  } catch(e) {}
  var horarioInfo = restaurante
      ? "Atiendes de " + (restaurante.hora_apertura||"16:00").substring(0,5) + " a " + (restaurante.hora_cierre||"00:00").substring(0,5) + ". Hora actual en Colombia: " + horaStr + "." + (cierreProximo ? " IMPORTANTE: Cierras en menos de 20 minutos. Si el cliente esta pidiendo, avisale amablemente que cierras pronto y que su pedido debe confirmarse rapido para alcanzar. Si ya no es posible tomar el pedido, disculpate y di el horario de manana." : " Estas en horario activo.")
      : "Hora actual: " + horaStr;
    // After-hours with active order - override horarioInfo
    var fueraConOrden = !estaEnHorario(restaurante) && (orderState[from] || (conversations[from] && conversations[from].length > 0));
    if (fueraConOrden) {
      horarioInfo = "Atiendes de " + (restaurante.hora_apertura||"16:00").substring(0,5) + " a " + (restaurante.hora_cierre||"00:00").substring(0,5) + ". Hora actual: " + horaStr + ". IMPORTANTE: El horario ya cerro PERO este cliente tiene un pedido o consulta activa. NO le digas que estas cerrado. Si pregunta por su pedido, dile que vas a verificar con el equipo y que en breve le confirmas. Si tiene pedido activo, atiendelo con normalidad hasta que se resuelva.";
    }

    // ── BUILD SYSTEM PROMPT DINAMICO ──────────────────────────────────────────
    var fechaInicioFidelidad = restaurante.fecha_inicio_fidelidad
      ? new Date(restaurante.fecha_inicio_fidelidad).toLocaleDateString("es-CO", {day:"numeric",month:"long",year:"numeric"})
      : "29 de marzo de 2025";
    // Inject active order info so Luz knows order number for modifications
    var pedidoActivoTexto = "";
    if (orderState[from] && orderState[from].orderNumber && orderState[from].status !== "entregado") {
      var st = orderState[from];
      // Only inject if relevant (waiting for payment or confirmed - might want to add items)
      if (st.status === "esperando_pago" || st.status === "confirmado" || st.status === "en_proceso") {
        pedidoActivoTexto = "\nPEDIDO ACTIVO #" + st.orderNumber + " ($" + (st.total||0).toLocaleString("es-CO") + ", estado:" + (st.status||"?") + "). Si agrega algo: MODIFICAR_PEDIDO:" + st.orderNumber + "|AGREGAR:[item $precio]";
      }
    }

    var systemFinal = buildSystemPrompt(restaurante)
      .replace(/MENU_URL_PLACEHOLDER/g, getMenuUrl(restaurante))
      .replace(/MENU_PLACEHOLDER/g, "MENU ACTIVO:\n" + menuParaPrompt)
      .replace(/HORARIO_PLACEHOLDER/g, "HORARIO: " + horarioInfo)
      .replace(/DIA_PLACEHOLDER/g, diaHoy)
      .replace(/DIRECCION_FRECUENTE_PLACEHOLDER/g, dirFrecuenteTexto)
      .replace(/CUPONES_PLACEHOLDER/g, cuponesTexto)
      .replace(/NOMBRE_CLIENTE_PLACEHOLDER/g, nombreClienteTexto)
      .replace(/NIVEL_CLIENTE_PLACEHOLDER/g, nivelClienteTexto)
      .replace(/FECHA_INICIO_PLACEHOLDER/g, fechaInicioFidelidad)
      + bienvenidaExtra + pedidoActivoTexto;

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
    console.log("RAW:", rawReply.substring(0, 400));
    var parsed = parseReply(rawReply, from);
    var cleanReply = parsed.cleanReply;
    var sideEffect = parsed.sideEffect;

    if (esComprobante && mediaId && orderState[from]) {
      var totalPedido = orderState[from].total || 0;
      var verificacion = await verificarComprobante(mediaId, totalPedido);
      console.log("Verificacion comprobante resultado:", JSON.stringify(verificacion), "| valido:", verificacion.valido);
      if (verificacion.valido === false) {
        // NOT a comprobante - Luz asks again naturally, no aggressive message
        userText = "[El cliente envio una imagen en la etapa de pago pero no parece ser un comprobante bancario. Sin mencionarlo de forma brusca, dile amablemente que necesitas el comprobante de la transferencia para confirmar su pedido.]";
        esComprobante = false;
      } else if (verificacion.valido === true) {
        // Confirmed valid comprobante
        orderState[from].comprobanteMediaId = mediaId;
        orderState[from].comprobanteUrl = "/api/comprobante/" + mediaId;
        orderState[from].paymentMethod = orderState[from].paymentMethod || "digital";
        orderState[from].status = "confirmado";
        sideEffect = "pago_confirmado";
        userText = "[El cliente envio su comprobante de pago verificado. Confirma el pedido con calidez.]";
      } else {
        // null = verification failed/error - ask for comprobante again to be safe
        userText = "[El cliente envio una imagen en la etapa de pago pero no pudimos verificarla bien. Pidele amablemente que envie el comprobante de la transferencia de forma mas clara.]";
        esComprobante = false;
      }
    }

    if (sideEffect === "alerta_pregunta" && restaurante && orderState[from]?.alertaPregunta) {
      guardarMensajeSupabase(restaurante.id, stripCountryCode(from), "ALERTA_PREGUNTA: " + orderState[from].alertaPregunta, "alerta_pregunta", null).catch(function(){});
    }

    if (sideEffect === "modificar_pedido") { console.log("MODIFICAR intent:", JSON.stringify(orderState[from]?.modificarPedido)); }
    if (sideEffect === "modificar_pedido" && orderState[from]?.modificarPedido && restaurante) {
      var mod = orderState[from].modificarPedido;
      try {
        var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
        var pedResp = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante.id + "&numero_pedido=eq." + mod.numero + "&select=id,items,total,subtotal,desechables,domicilio",
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
        );
        if (pedResp.data && pedResp.data.length > 0) {
          var ped = pedResp.data[0];
          var patch = {};
          if (mod.accion.startsWith("AGREGAR:")) {
            var nuevoItem = mod.accion.replace("AGREGAR:", "").trim();
            var itemsActuales = Array.isArray(ped.items) ? [...ped.items] : [];
            itemsActuales.push("➕ " + nuevoItem);
            // Extract price from item string e.g. "Gaseosa $4.000"
            var precioMatch = nuevoItem.match(/\$([0-9.,]+)/);
            var precioExtra = 0;
            if (precioMatch) {
              var precioStr = precioMatch[1];
              // Colombian format: $4.000 = 4000, $18.900 = 18900
              if (precioStr.indexOf('.') !== -1 && precioStr.indexOf(',') === -1) {
                // Has dots but no comma = Colombian thousands separator
                precioExtra = Number(precioStr.replace(/\./g, ''));
              } else {
                precioExtra = Number(precioStr.replace(/[.,]/g, ''));
              }
            }
            var nuevoTotal = Number(ped.total || 0) + precioExtra;
            patch.items = itemsActuales;
            patch.total = nuevoTotal;
            patch.subtotal = nuevoTotal - Number(ped.desechables || 0) - Number(ped.domicilio || 0);
            patch.notas_especiales = "✏️ MODIFICADO: +" + nuevoItem;
          } else if (mod.accion.startsWith("DIRECCION:")) {
            patch.direccion = mod.accion.replace("DIRECCION:", "").trim();
          } else if (mod.accion.startsWith("NOTA:")) {
            var nota = mod.accion.replace("NOTA:", "").trim();
            var notaActual = ped.notas_especiales || "";
            patch.notas_especiales = (notaActual ? notaActual + " | " : "") + "📝 " + nota;
          }
          await axios.patch(
            SUPABASE_URL + "/rest/v1/pedidos?id=eq." + ped.id, patch,
            { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
          );
          console.log("Pedido #" + mod.numero + " modificado en Supabase:", mod.accion);
          guardarMensajeSupabase(restaurante.id, stripCountryCode(from), "✏️ Pedido #" + mod.numero + " modificado: +" + mod.accion.replace("AGREGAR:",""), "alerta_pregunta", null).catch(function(){});
        }
      } catch(e) { console.error("modificar_pedido error:", e.message); }
    }

    if (sideEffect === "cancelar_pedido" && orderState[from]?.cancelarPedido && restaurante) {
      var numCancel = orderState[from].cancelarPedido;
      guardarMensajeSupabase(restaurante.id, stripCountryCode(from), "⚠️ CLIENTE SOLICITA CANCELAR PEDIDO #" + numCancel, "alerta_pregunta", null).catch(function(){});
      console.log("Solicitud cancelacion pedido #" + numCancel + " de:", from);
    }

    conversations[from].push({ role: "assistant", content: rawReply });
    await sendWhatsAppMessage(from, cleanReply, phoneNumberId);

    console.log("De " + from + ": " + userText.substring(0, 80));
    console.log("Luz: " + cleanReply.substring(0, 100));

    if (restaurante) {
      guardarMensajeSupabase(restaurante.id, stripCountryCode(from), esComprobante ? "📎 Comprobante de pago" : userText, "cliente", esImagen ? mediaId : null).catch(function(){});
      guardarMensajeSupabase(restaurante.id, stripCountryCode(from), cleanReply, "restaurante", null).catch(function(){});
    }

    if (orderState[from] && sideEffect !== "pago_confirmado") {
      await setOrderState(from, orderState[from]);
    }

    console.log("sideEffect:", sideEffect, "| orderState:", !!orderState[from]);

    // If pago_confirmado but no orderState, try to recover from Supabase
    if (sideEffect === "pago_confirmado" && !orderState[from] && restaurante) {
      try {
        var svcRec = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
        // Look for recent pedido from this client that has no comprobante yet
        var recResp = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante.id +
          "&cliente_tel=eq." + encodeURIComponent(from) +
          "&estado=eq.confirmado&order=created_at.desc&limit=1&select=*",
          { headers: { "apikey": svcRec, "Authorization": "Bearer " + svcRec } }
        );
        if (recResp.data && recResp.data.length > 0) {
          var recPed = recResp.data[0];
          // Update with comprobante if we have it
          if (mediaId) {
            await axios.patch(
              SUPABASE_URL + "/rest/v1/pedidos?id=eq." + recPed.id,
              { comprobante_media_id: mediaId, comprobante_url: "/api/comprobante/" + mediaId },
              { headers: { "apikey": svcRec, "Authorization": "Bearer " + svcRec, "Content-Type": "application/json", "Prefer": "return=minimal" } }
            );
          }
          console.log("Pedido #" + recPed.numero_pedido + " ya existia en Supabase - comprobante actualizado");
        }
      } catch(e) { console.error("recover pedido:", e.message); }
    }

    if (sideEffect === "pago_confirmado" && orderState[from]) {
      var state = orderState[from];
      var timestamp = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

      await printTicket({
        orderNumber: state.orderNumber, items: state.items,
        desechables: state.desechables, domicilio: state.domicilio, total: state.total,
        address: state.address || "Por confirmar",
        paymentMethod: state.paymentMethod || "digital",
        cashDenomination: state.cashDenomination || null,
        extraPhone: state.extraPhone || null,
        phone: from, timestamp,
        notasEspeciales: state.notasEspeciales || null,
        pedidoAdicionalDe: state.pedidoAdicionalDe || null,
        restauranteNombre: restaurante?.nombre || "Restaurante",
        restauranteCiudad: restaurante?.ciudad || "Colombia",
        nequiNum: restaurante?.metodo_pago_nequi || "3177269578",
        bancoCuenta: restaurante?.metodo_pago_banco || "0089102980"
      });

      var restId = restaurante?.id || null;
      if (!restId) {
        try {
          var svcKey2 = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
          var rf = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=id&limit=1",
            { headers: { "apikey": svcKey2, "Authorization": "Bearer " + svcKey2 } });
          if (rf.data?.length) restId = rf.data[0].id;
        } catch (e) {}
      }

      if (restId) {
        // Try to recover address from conversation if missing
      if (!state.address || state.address === "Por confirmar") {
        var convText = (conversations[from]||[]).map(function(m){return m.content;}).join(" ");
        var dirMatch2 = convText.match(/DIRECCION_LISTA:([^\n]+)/);
        if (dirMatch2) state.address = dirMatch2[1].trim();
      }
      await guardarPedidoSupabase(restId, {
          orderNumber: state.orderNumber, phone: from, items: state.items,
          subtotal: Number(state.total) - Number(state.desechables||0) - Number(state.domicilio||0),
          desechables: Number(state.desechables||0), domicilio: Number(state.domicilio||0),
          total: Number(state.total), address: state.address || "Por confirmar",
          paymentMethod: state.paymentMethod || "digital",
          comprobanteUrl: state.comprobanteUrl || null,
          comprobanteMediaId: state.comprobanteMediaId || null,
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
    status: "LUZ IA activa",
    hora_colombia: getHoraColombia().toLocaleString("es-CO"),
    dia_colombia: getDiaColombiaStr(),
    conversaciones: Object.keys(conversations).length,
    pedidos_activos: Object.keys(orderState).length,
    colas: colasPorCliente.size
  });
});

// Enviar push al cliente por teléfono
async function enviarPushClientePorTel(restauranteId, telefono, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    var tel = (telefono||"").replace(/[^0-9]/g,"");
    if (tel.startsWith("57") && tel.length===12) tel=tel.slice(2);
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/push_subscriptions?restaurante_id=eq." + restauranteId +
      "&nombre=eq." + encodeURIComponent(tel) + "&activo=eq.true&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    for (var sub of (r.data||[])) {
      try { await webpush.sendNotification(JSON.parse(sub.subscription), JSON.stringify(payload)); }
      catch(e) {
        if (e.statusCode===410) axios.patch(SUPABASE_URL+"/rest/v1/push_subscriptions?id=eq."+sub.id,
          {activo:false},{headers:{...sbH(true),"Content-Type":"application/json","Prefer":"return=minimal"}}).catch(()=>{});
      }
    }
  } catch(e) { console.log("pushCliente err:", e.message); }
}

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("LUZ IA corriendo en puerto " + PORT);
  console.log("Dia Colombia:", getDiaColombiaStr(), "| Hora:", getHoraColombia().toLocaleTimeString("es-CO"));
});

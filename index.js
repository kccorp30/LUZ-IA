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
// Raw body parser for storage upload proxy (must be before json parser)
app.use("/api/storage-upload", express.raw({ type: "*/*", limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
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
// Inicializar orderCounter desde el máximo en Supabase para evitar duplicados al redeployar
async function initOrderCounter() {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/pedidos?select=numero_pedido&order=numero_pedido.desc&limit=1",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    if (r.data && r.data.length && r.data[0].numero_pedido) {
      var maxNum = parseInt(r.data[0].numero_pedido) || 100;
      orderCounter = maxNum;
      console.log("[init] orderCounter iniciado desde Supabase: " + orderCounter);
    }
  } catch(e) {
    console.warn("[init] No se pudo leer max numero_pedido, usando 100:", e.message);
  }
}
// Llamar al iniciar — no bloqueante
initOrderCounter();

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

// ── PLANES Y PRECIOS LUZ IA ────────────────────────────────────────────────
var PLANES_LUZ = {
  basico:       { nombre: "Básico",       precio: 159000, pago15: 79500,  charr: 0, sucursales: 1, tablets: 0 },
  emprendedor:  { nombre: "Emprendedor",  precio: 320000, pago15: 160000, charr: 3, sucursales: 1, tablets: 0 },
  dominante:    { nombre: "Dominante",    precio: 460000, pago15: 230000, charr: 5, sucursales: 1, tablets: 1 },
  empresarial:  { nombre: "Empresarial",  precio: 760000, pago15: 380000, charr: 10,sucursales: 3, tablets: 2 }
};
// Funciones por plan (qué está INCLUIDO)
var PLAN_FEATURES = {
  basico:      ["menu","whatsapp","pedidos"],
  emprendedor: ["menu","whatsapp","pedidos","cocina","domiciliarios","meseros","charr"],
  dominante:   ["menu","whatsapp","pedidos","cocina","domiciliarios","meseros","charr","tablet_cocina"],
  empresarial: ["menu","whatsapp","pedidos","cocina","domiciliarios","meseros","charr","tablet_cocina","multi_sucursal","promos","fidelizacion","reportes"]
};
function planTieneFeature(plan, feature) {
  var feats = PLAN_FEATURES[plan] || PLAN_FEATURES.basico;
  return feats.includes(feature);
}

function limpiarNumero(str) {
  if (!str) return "0";
  var s = String(str).toLowerCase().trim();
  if (s === "pendiente") return "0";
  return s.replace(/[^0-9]/g, "") || "0";
}

// ── HORA COLOMBIA UTC-5 ───────────────────────────────────────────────────────
function getHoraColombia() {
  // Colombia es siempre UTC-5 (sin horario de verano)
  var ahora = new Date();
  return new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
}
function getDiaColombiaStr() {
  return ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][getHoraColombia().getDay()];
}
function getMedionocheColombiaISO() {
  var col = getHoraColombia();
  // Medianoche Colombia = 05:00 UTC
  var medianoche = new Date();
  medianoche.setUTCHours(5, 0, 0, 0);
  // Si ya pasó las 5am UTC de hoy, es la medianoche de hoy Colombia
  // Si no, es la medianoche de ayer Colombia
  if(new Date().getUTCHours() < 5) medianoche.setUTCDate(medianoche.getUTCDate() - 1);
  return medianoche.toISOString();
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vbxuwzcfzfjwhllkppkg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_I5lP9lq6-6t0B0K0PmjyWQ_RiIxiJM5";

function sbH(svc) {
  var k = svc ? (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY) : SUPABASE_KEY;
  return { "apikey": k, "Authorization": "Bearer " + k };
}

// ── RESTAURANTE ───────────────────────────────────────────────────────────────
var restCache = {};
var REST_CACHE_TTL = 60000; // 1 min cache — refreshes on every new message after 1 min

async function getRestaurante(phoneNumberId) {
  try {
    var cacheKey = phoneNumberId || "_default";
    var now = Date.now();
    if (restCache[cacheKey] && (now - restCache[cacheKey].ts) < REST_CACHE_TTL) {
      return restCache[cacheKey].data;
    }
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var headers = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    if (phoneNumberId) {
      var r = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?whatsapp_phone_id=eq." + phoneNumberId + "&select=*", { headers: headers });
      if (r.data && r.data.length > 0) {
        restCache[cacheKey] = { data: r.data[0], ts: now };
        return r.data[0];
      }
    }
    var fb = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=*&limit=1", { headers: headers });
    var result = fb.data && fb.data.length > 0 ? fb.data[0] : null;
    if (result) restCache[cacheKey] = { data: result, ts: now };
    return result;
  } catch (e) { console.error("getRestaurante:", e.message); return null; }
}

// Invalidar cache cuando se actualiza config
function invalidarCacheRestaurante() {
  restCache = {};
}

// ── SILENCIO ──────────────────────────────────────────────────────────────────
async function estaEnSilencio(restauranteId, telefono) {
  try {
    var telLocal = stripCountryCode(telefono);
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    // Query with local number (panel saves without country code)
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/silencio_conversacion?restaurante_id=eq." + restauranteId +
      "&telefono=eq." + encodeURIComponent(telLocal) + "&activo=eq.true&limit=1&select=id",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    if (r.data && r.data.length > 0) return true;
    // Also try with full number just in case
    var telFull = telefono.replace(/[^0-9]/g, "");
    if (telFull !== telLocal) {
      var r2 = await axios.get(
        SUPABASE_URL + "/rest/v1/silencio_conversacion?restaurante_id=eq." + restauranteId +
        "&telefono=eq." + encodeURIComponent(telFull) + "&activo=eq.true&limit=1&select=id",
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
      );
      if (r2.data && r2.data.length > 0) return true;
    }
    return false;
  } catch (e) { console.error("estaEnSilencio error:", e.message); return false; }
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
    personalidad = "Eres una persona real, profesional y atenta. NUNCA admitas ser IA. Hablas de manera cordial pero directa: con gusto, claro que sí, listo, digame, perfecto, entendido. NUNCA uses apelativos cariñosos como: mi amor, corazón, cariño, bb, mami, linda, hermoso, rey, reina. NUNCA uses: amigo, amiga, dama, caballero. Dirígete al cliente por su nombre si lo sabes, o simplemente habla sin apelativo. Tu tono es el de un asesor profesional de restaurante: cordial, eficiente, amable pero sin familiaridades. No uses emojis en exceso (máximo 1 por mensaje si es necesario). No uses signos de admiración dobles. Mantén respuestas cortas y al grano.";
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

  // ── LUZ AUTO-LEARNING: cargar aprendizajes dinámicos ──
  var aprendizajesText = "";
  // placeholder — se inyecta dinámicamente en systemFinal
  
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

REGLAS DE CALCULO DE PROMOS - OBLIGATORIO SEGUIRLAS:
- "Pague 2 lleve 3": el cliente PAGA 2 unidades y RECIBE 3. En el desglose cobras el precio de 2 unidades, NO de 3. Ejemplo: La Sencilla $16.900 con promo "pague 2 lleve 3" = $33.800 (2 x $16.900). NUNCA cobres las 3 unidades.
- "Pague 1 lleve 2": el cliente PAGA 1 unidad y RECIBE 2. Cobras el precio de 1 sola unidad.
- "Combo especial a precio fijo": cobras exactamente el precio del combo, sin sumar productos individuales.
- Cuando confirmes un pedido con promo, el desglose debe mostrar: "[Producto] x[unidades que recibe] (promo [descripcion]) $[precio que PAGA]"

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

RESERVAS DE MESA:
- Si el cliente pregunta por reservar mesa, apartar mesa, o quiere saber disponibilidad: responde de forma amable que pueden venir directamente, que las mesas se atienden por orden de llegada.
- Si el cliente INSISTE en reservar o dice que viene con grupo grande (4+ personas): pide nombre, fecha, hora y número de personas. Responde: "Listo [nombre], te tenemos en cuenta para [fecha] a las [hora] con [personas] personas. Te esperamos! 🪑"
- NO confirmes una "reserva oficial" — es solo una nota informal para el equipo.

COMBOS: disponibles todos los dias. Estan en el menu activo — ofrecelos cuando pidan combos. NUNCA armes combos que no esten en el menu.

REGLA OBLIGATORIA — GASEOSA DE COMBO:
- Los combos VIENEN con gaseosa de 250ml incluida (NO de 400ml). La de 400ml es la que se vende SOLA por aparte, NUNCA viene en un combo.
- SIEMPRE que el cliente pida un combo, DEBES preguntarle: "¿De qué gaseosa de 250ml lo prefieres? Tenemos Coca-Cola, Postobon, Sprite, Quatro" (ajusta segun los sabores disponibles en el restaurante).
- Si el cliente pide "combo con gaseosa de 400ml" o "gaseosa grande", aclara: "El combo trae gaseosa de 250ml. Si la quieres de 400ml, la sumamos por aparte" y le das el precio extra.
- En el desglose final del pedido, ESPECIFICA siempre el sabor de la gaseosa que eligio. Ejemplo: "Combo La Curva (gaseosa Coca-Cola 250ml) $XX.XXX".
- NUNCA confirmes un combo sin haber preguntado primero el sabor de la gaseosa. Si el cliente no responde, repregunta antes de cerrar el pedido.

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
METODO_PAGO: [nequi|bancolombia|efectivo|datafono — el que el cliente menciono, o "pendiente" si no ha dicho]

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
// ── ACTUALIZAR ESTADO MESA AUTOMÁTICAMENTE ───────────────────────────────────
// Se llama cada vez que entra o cambia un pedido de mesa
async function actualizarEstadoMesa(restauranteId, direccion, estadoPedido) {
  if (!restauranteId || !direccion) return;
  var dir = (direccion||"").toUpperCase();
  var m = dir.match(/MESA\s*(\d+)/);
  if (!m) return;
  var mesaNum = parseInt(m[1]);
  if (!mesaNum) return;
  // Mapear estado del pedido → estado del LED
  var estadoLed = {
    "confirmado":    "ocupada",
    "en_preparacion":"en_preparacion",
    "listo":         "listo",
    "en_camino":     "listo",
    "entregado":     "libre",
    "cancelado":     "libre"
  }[estadoPedido] || "ocupada";
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json" };
    // Actualizar memoria
    if (!mesaEstados[restauranteId]) mesaEstados[restauranteId] = {};
    mesaEstados[restauranteId]["mesa_" + mesaNum] = estadoLed;
    // Actualizar Supabase
    await axios.post(
      SUPABASE_URL + "/rest/v1/mesas?on_conflict=restaurante_id,numero",
      { restaurante_id: restauranteId, numero: mesaNum, estado: estadoLed, updated_at: new Date().toISOString() },
      { headers: { ...h, "Prefer": "resolution=merge-duplicates,return=minimal" } }
    );
    console.log("[mesa-auto] Mesa " + mesaNum + " → " + estadoLed + " (pedido " + estadoPedido + ")");
  } catch(e) { console.error("[mesa-auto]", e.message); }
}

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
    // Auto-actualizar LED de mesa si es pedido de mesa
    if (pedidoData.address) {
      actualizarEstadoMesa(restauranteId, pedidoData.address, "confirmado").catch(function(){});
    }
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
    // Truncar a 2000 chars para evitar errores de columna
    var mensajeSafe = String(mensaje||"").substring(0, 2000);
    await axios.post(SUPABASE_URL + "/rest/v1/mensajes",
      { restaurante_id: restauranteId, telefono, mensaje: mensajeSafe, tipo, comprobante_media_id: comprobanteMediaId || null },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
  } catch (e) { console.error("guardarMensaje:", e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LUZ AUTO-LEARNING SYSTEM
// Tabla: luz_aprendizajes (restaurante_id, tipo, contenido, fuente, activo, created_at)
// Tipos: correccion, faq, preferencia_cliente, regla_negocio, producto_info
// ═══════════════════════════════════════════════════════════════════════════════
var aprendizajesCache = {};
var APRENDIZAJES_TTL = 10 * 60 * 1000; // 10 min cache

async function cargarAprendizajes(restauranteId) {
  var now = Date.now();
  if (aprendizajesCache[restauranteId] && (now - aprendizajesCache[restauranteId].ts) < APRENDIZAJES_TTL) {
    return aprendizajesCache[restauranteId].data;
  }
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/luz_aprendizajes?restaurante_id=eq." + restauranteId +
      "&activo=eq.true&order=created_at.desc&limit=50&select=tipo,contenido,fuente",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    var data = r.data || [];
    aprendizajesCache[restauranteId] = { data: data, ts: now };
    return data;
  } catch (e) {
    console.error("cargarAprendizajes:", e.message);
    return [];
  }
}

function formatearAprendizajes(aprendizajes) {
  if (!aprendizajes || !aprendizajes.length) return "";
  var secciones = { correccion: [], faq: [], regla_negocio: [], preferencia_cliente: [], producto_info: [] };
  aprendizajes.forEach(function(a) {
    var tipo = a.tipo || "regla_negocio";
    if (!secciones[tipo]) secciones[tipo] = [];
    secciones[tipo].push(a.contenido);
  });
  var texto = "\n\nAPRENDIZAJES Y REGLAS APRENDIDAS (sigue estas instrucciones con prioridad):";
  if (secciones.correccion.length) texto += "\n\nCORRECCIONES (errores que NO debes cometer):\n" + secciones.correccion.map(function(c) { return "- " + c; }).join("\n");
  if (secciones.regla_negocio.length) texto += "\n\nREGLAS DEL NEGOCIO:\n" + secciones.regla_negocio.map(function(c) { return "- " + c; }).join("\n");
  if (secciones.faq.length) texto += "\n\nPREGUNTAS FRECUENTES (responde con esta info):\n" + secciones.faq.map(function(c) { return "- " + c; }).join("\n");
  if (secciones.producto_info.length) texto += "\n\nINFO DE PRODUCTOS:\n" + secciones.producto_info.map(function(c) { return "- " + c; }).join("\n");
  if (secciones.preferencia_cliente.length) texto += "\n\nPREFERENCIAS DE CLIENTES:\n" + secciones.preferencia_cliente.map(function(c) { return "- " + c; }).join("\n");
  return texto;
}

async function guardarAprendizaje(restauranteId, tipo, contenido, fuente) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/luz_aprendizajes",
      { restaurante_id: restauranteId, tipo: tipo, contenido: contenido, fuente: fuente || "auto", activo: true },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    // Invalidate cache
    delete aprendizajesCache[restauranteId];
    console.log("[aprendizaje] ✅ Guardado:", tipo, "->", contenido.substring(0, 60));
  } catch (e) { console.error("[aprendizaje] Error:", e.message); }
}

// Auto-detectar aprendizajes de las alertas de pregunta (preguntas que LUZ no supo responder)
async function autoAprendizajeDePregunta(restauranteId, pregunta) {
  if (!pregunta || pregunta.length < 10) return;
  // Guardar como FAQ pendiente para que el admin la resuelva
  await guardarAprendizaje(restauranteId, "faq", "PREGUNTA SIN RESPUESTA: " + pregunta + " (pendiente de respuesta del admin)", "alerta_pregunta");
}

// Auto-detectar cuando el admin interviene en un chat (respuesta tipo "restaurante_manual")
async function autoAprendizajeDeCorreccion(restauranteId, mensajeAdmin, contextoCliente) {
  if (!mensajeAdmin || mensajeAdmin.length < 5) return;
  // Solo guardar si parece una corrección o info nueva (no saludos genéricos)
  var lower = mensajeAdmin.toLowerCase();
  var esChatNormal = ["hola","ok","listo","gracias","perfecto","dale","ya","si","no"].some(function(p) { return lower === p || lower === p + "!"; });
  if (esChatNormal) return;
  // Guardar como posible corrección/regla
  await guardarAprendizaje(restauranteId, "correccion", "El admin le dijo al cliente: \"" + mensajeAdmin.substring(0, 200) + "\"" + (contextoCliente ? " (contexto: " + contextoCliente.substring(0, 100) + ")" : ""), "chat_admin");
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
    if (!token) { console.error("[comprobante] WHATSAPP_TOKEN no configurado"); return null; }
    // Intentar con v21.0 primero, luego v20.0 como fallback
    var mediaUrl = null;
    for (var ver of ["v21.0", "v20.0", "v22.0"]) {
      try {
        var urlRes = await axios.get("https://graph.facebook.com/" + ver + "/" + mediaId, {
          headers: { "Authorization": "Bearer " + token },
          timeout: 8000
        });
        mediaUrl = urlRes.data?.url;
        if (mediaUrl) break;
      } catch(ev) {
        console.warn("[comprobante] Meta API " + ver + " falló:", ev.response?.status, ev.message?.substring(0,60));
      }
    }
    if (!mediaUrl) { console.error("[comprobante] No se obtuvo URL del mediaId:", mediaId); return null; }
    var imgRes = await axios.get(mediaUrl, {
      headers: { "Authorization": "Bearer " + token },
      responseType: "arraybuffer",
      timeout: 15000
    });
    return "data:" + (imgRes.headers["content-type"] || "image/jpeg") + ";base64," + Buffer.from(imgRes.data).toString("base64");
  } catch (e) {
    console.error("[comprobante] descargarImagenMeta error:", e.response?.status, e.message?.substring(0,80));
    return null;
  }
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
    if (minCi === 0) minCi = 1439; // 00:00 = fin del día
    var dias = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    var diaHoy = dias[col.getDay()];
    var diasActRaw = (restaurante.dias_activos || "lunes,martes,miercoles,jueves,viernes,sabado,domingo");
    // Normalizar acentos: miércoles→miercoles, sábado→sabado
    var diasAct = diasActRaw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().split(",").map(function(d){return d.trim();});
    console.log("[horario] Día Colombia:", diaHoy, "| Días activos:", diasAct, "| Hora:", col.getHours()+":"+String(col.getMinutes()).padStart(2,"0"), "| Apertura:", minAp, "| Cierre:", minCi, "| HoraMin:", hora);
    if (!diasAct.includes(diaHoy)) { console.log("[horario] ❌ Día no activo"); return false; }
    if (minCi < minAp) return hora >= minAp || hora <= minCi; // cruza medianoche
    var abierto = hora >= minAp && hora <= minCi;
    console.log("[horario]", abierto ? "✅ Abierto" : "❌ Cerrado");
    return abierto;
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
    var pagoMatch   = reply.match(/METODO_PAGO:\s*([^\n]+)/);

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
app.get("/admin",       function(req, res) { res.sendFile(path.join(__dirname, "admin.html")); });
app.get("/vendedor",    function(req, res) { res.sendFile(path.join(__dirname, "vendedor.html")); });
app.get("/mapa",        function(req, res) { res.sendFile(path.join(__dirname, "mapa_zonas.html")); });
app.get("/admin",       function(req, res) { res.sendFile(path.join(__dirname, "admin.html")); });
app.get("/vendedor",   function(req, res) { res.sendFile(path.join(__dirname, "vendedor.html")); });
app.get("/restaurante", function(req, res) { res.sendFile(path.join(__dirname, "restaurante.html")); });

// ═══════════════════════════════════════════════════════════
// MESA LED — Sistema de control de LEDs por mesa (ESP32)
// ═══════════════════════════════════════════════════════════

// Cache de estados por restaurante: { restaurante_id: { mesa_1: "libre", mesa_2: "ocupada" } }
var mesaEstados = {};

// GET /api/mesa-estado — ESP32 consulta cada 2 segundos
app.get("/api/mesa-estado", function(req, res) {
  var restauranteId = req.query.restaurante_id;
  var mesa = req.query.mesa;
  if (!restauranteId || !mesa) return res.json({ estado: "libre" });
  var estados = mesaEstados[restauranteId] || {};
  var estado = estados["mesa_" + mesa] || "libre";
  res.json({ estado: estado, mesa: mesa, restaurante_id: restauranteId });
});

// POST /api/mesa-led — Panel actualiza el LED de una mesa
app.post("/api/mesa-led", async function(req, res) {
  var { restaurante_id, mesa, estado } = req.body;
  if (!restaurante_id || !mesa || !estado) {
    return res.status(400).json({ ok: false, error: "Faltan datos: restaurante_id, mesa, estado" });
  }
  var estadosValidos = ["libre", "ocupada", "confirmado", "en_preparacion", "listo", "cuenta", "en_camino"];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ ok: false, error: "Estado inválido. Válidos: " + estadosValidos.join(", ") });
  }
  if (!mesaEstados[restaurante_id]) mesaEstados[restaurante_id] = {};
  mesaEstados[restaurante_id]["mesa_" + mesa] = estado;
  console.log("[mesa-led] Mesa " + mesa + " → " + estado + " (rest: " + restaurante_id.substring(0,8) + "...)");
  res.json({ ok: true, mesa: mesa, estado: estado });
});

// GET /api/mesa-estados — Panel obtiene todos los estados de mesas de un restaurante
app.get("/api/mesa-estados", function(req, res) {
  var restauranteId = req.query.restaurante_id;
  if (!restauranteId) return res.json({});
  res.json(mesaEstados[restauranteId] || {});
});
// ── HEALTH CHECK — Fly.io lo usa para saber si el servidor está vivo ──
// ── MESAS ESTADO — para ESP32 ─────────────────────────────────────
// ── ESP32 REGISTRO — dispositivo se registra al encender ──
// ── ESP32 ASIGNACION — panel le asigna mesa a un dispositivo por MAC ──
app.get("/api/esp32-asignacion", async function(req, res) {
  var { mac, restaurante_id } = req.query;
  if (!mac || !restaurante_id) return res.status(400).json({ error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var macClean = mac.toUpperCase().trim();
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/esp32_dispositivos?mac=eq." + macClean + "&restaurante_id=eq." + restaurante_id + "&select=mesa",
      { headers: h }
    );
    var data = r.data || [];
    if (data.length && data[0].mesa > 0) {
      res.json({ mesa: data[0].mesa });
    } else {
      res.json({ mesa: 0 });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/esp32-asignar", async function(req, res) {
  var { restaurante_id, mac, mesa } = req.body;
  if (!restaurante_id || !mac) return res.status(400).json({ error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json" };
    var macClean = mac.toUpperCase().trim();
    var mesaNum = parseInt(mesa)||0;
    await axios.patch(
      SUPABASE_URL + "/rest/v1/esp32_dispositivos?mac=eq." + macClean + "&restaurante_id=eq." + restaurante_id,
      { mesa: mesaNum },
      { headers: { ...h, "Prefer": "return=minimal" } }
    );
    if (mesaNum > 0) {
      await axios.post(
        SUPABASE_URL + "/rest/v1/mesas?on_conflict=restaurante_id,numero",
        { restaurante_id, numero: mesaNum, estado: "libre" },
        { headers: { ...h, "Prefer": "resolution=merge-duplicates,return=minimal" } }
      ).catch(function(){});
    }
    console.log("[ESP32] Mesa " + mesaNum + " asignada a MAC " + macClean);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/esp32-dispositivos", async function(req, res) {
  var restaurante_id = req.query.restaurante_id;
  if (!restaurante_id) return res.status(400).json({ error: "Falta restaurante_id" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/esp32_dispositivos?restaurante_id=eq." + restaurante_id + "&order=mesa",
      { headers: h }
    );
    res.json(r.data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Cola de resets pendientes — el ESP32 la consulta en cada heartbeat
var resetPendiente = {};
app.post("/api/esp32-reset", async function(req, res) {
  var { restaurante_id, mac } = req.body;
  if (!restaurante_id || !mac) return res.status(400).json({ error: "Faltan datos" });
  var macClean = mac.toUpperCase().trim();
  resetPendiente[macClean] = Date.now();
  console.log("[ESP32 reset] Solicitado para MAC:", macClean);
  res.json({ ok: true });
});

// El ESP32 consulta esto en cada heartbeat (modificar /api/esp32-registro para incluirlo)
app.get("/api/esp32-cmd", async function(req, res) {
  var mac = (req.query.mac || "").toUpperCase().trim();
  if (!mac) return res.json({ cmd: null });
  if (resetPendiente[mac] && (Date.now() - resetPendiente[mac]) < 60000) {
    delete resetPendiente[mac];
    console.log("[ESP32 cmd] Reset enviado a:", mac);
    return res.json({ cmd: "reset" });
  }
  res.json({ cmd: null });
});

app.post("/api/esp32-registro", async function(req, res) {
  var { restaurante_id, mesa, mac, ip, num_leds } = req.body;
  if (!restaurante_id || !mac) return res.status(400).json({ error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json" };
    var macClean = mac.toUpperCase().trim();
    console.log("[ESP32 registro] MAC recibida:", macClean, "IP:", ip, "Mesa:", mesa);
    // Buscar si ya existe por MAC — sin encodeURIComponent para que los : pasen bien
    var existR = await axios.get(
      SUPABASE_URL + "/rest/v1/esp32_dispositivos?mac=eq." + macClean + "&restaurante_id=eq." + restaurante_id + "&select=id,mesa",
      { headers: h }
    ).catch(function(e){ console.log("[ESP32] Error buscando:", e.message); return { data: [] }; });
    var existe = existR.data && existR.data.length > 0;
    if (existe) {
      var mesaActual = existR.data[0].mesa || parseInt(mesa)||0;
      await axios.patch(
        SUPABASE_URL + "/rest/v1/esp32_dispositivos?mac=eq." + macClean + "&restaurante_id=eq." + restaurante_id,
        { ip: ip||null, num_leds: parseInt(num_leds)||20, online: true, last_seen: new Date().toISOString() },
        { headers: { ...h, "Prefer": "return=minimal" } }
      );
      console.log("[ESP32] ✅ Actualizado — Mesa:" + mesaActual + " IP:" + ip);
    } else {
      await axios.post(SUPABASE_URL + "/rest/v1/esp32_dispositivos",
        { restaurante_id, mesa: parseInt(mesa)||0, mac: macClean, ip: ip||null, num_leds: parseInt(num_leds)||20, online: true, last_seen: new Date().toISOString() },
        { headers: { ...h, "Prefer": "return=minimal" } }
      );
      console.log("[ESP32] ✅ NUEVO dispositivo registrado — MAC:" + macClean + " IP:" + ip);
    }
    res.json({ ok: true });
  } catch(e) {
    console.error("[ESP32 registro ERROR]", e.message, e.response?.data);
    res.status(500).json({ error: e.message });
  }
});

// ── SERVICE WORKER — requerido para instalación PWA ───────────────────────────
app.get("/sw.js", function(req, res) {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "no-cache");
  res.send(`
const CACHE = 'luz-ia-v1';
self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e) {
  // Solo cachear GET, no API calls
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(function() {
    return caches.match(e.request);
  }));
});
  `.trim());
});

// ── PWA ICONS ─────────────────────────────────────────────────────────────────
var PWA_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#7c3aed"/><text x="96" y="120" font-size="96" text-anchor="middle" font-family="Arial,sans-serif">🍔</text></svg>';
app.get("/icon-192.png", function(req, res) {
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(PWA_ICON_SVG);
});
app.get("/icon-512.png", function(req, res) {
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(PWA_ICON_SVG.replace(/192/g, "512").replace("96", "256").replace("120", "320"));
});
app.get("/icons/icon-192.png", function(req, res) { res.redirect("/icon-192.png"); });
app.get("/icons/icon-512.png", function(req, res) { res.redirect("/icon-512.png"); });

// ── RESET PASSWORD ─────────────────────────────────────────────────────────
app.post("/api/admin/reset-password", requireAdmin, async function(req, res) {
  try {
    var { id, password } = req.body;
    if (!id || !password) return res.status(400).json({ ok: false, error: "Faltan datos" });
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.patch(SUPABASE_URL + "/rest/v1/usuarios_sistema?id=eq." + id,
      { password_hash: hashPassword(password) },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── SOPORTE INTERNO — mensajes del restaurante al admin ──────────────────────
app.post("/api/soporte-mensaje", async function(req, res) {
  try {
    var { restaurante_id, restaurante_nombre, mensaje, tipo } = req.body;
    if (!restaurante_id || !mensaje) return res.status(400).json({ ok: false });
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/mensajes",
      { restaurante_id, telefono: "SOPORTE_" + restaurante_id, mensaje: "[" + (tipo||"soporte").toUpperCase() + "] " + mensaje, tipo: "alerta_pregunta" },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── PLAN FEATURES — verifica qué funciones tiene el restaurante ───────────────
app.get("/api/plan-features", async function(req, res) {
  var restaurante_id = req.query.restaurante_id;
  if (!restaurante_id) return res.json({ plan: "basico", features: PLAN_FEATURES.basico });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id + "&select=plan,estado,suscripcion_estado,fecha_vencimiento", {
      headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey }
    });
    var rest = r.data && r.data[0];
    if (!rest) return res.json({ plan: "basico", features: PLAN_FEATURES.basico });
    var plan = rest.plan_id || rest.plan || "basico";
    // Si está suspendido o vencido, solo menú básico
    if (rest.estado === "suspendido" || rest.estado === "vencido") {
      return res.json({ plan: plan, features: [], bloqueado: true, razon: "cuenta_suspendida" });
    }
    res.json({ plan: plan, features: PLAN_FEATURES[plan] || PLAN_FEATURES.basico, planes: PLANES_LUZ });
  } catch(e) {
    res.json({ plan: "basico", features: PLAN_FEATURES.basico });
  }
});

// ── PWA MANIFESTS ─────────────────────────────────────────────────────────────
var PWA_BASE = { start_url: "/", display: "standalone", background_color: "#0d0a1a", theme_color: "#7c3aed", icons: [{ src: "https://luz-ia-production-4cff.up.railway.app/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "https://luz-ia-production-4cff.up.railway.app/icon-512.png", sizes: "512x512", type: "image/png" }] };
app.get("/manifest-admin.json", function(req, res) {
  res.json(Object.assign({}, PWA_BASE, { name: "Admin LUZ IA", short_name: "Admin", start_url: "/admin", theme_color: "#0d0a1a" }));
});
app.get("/manifest-vendedor.json", function(req, res) {
  res.json(Object.assign({}, PWA_BASE, { name: "Vendedor LUZ IA", short_name: "Vendedor", start_url: "/vendedor", theme_color: "#0d0a1a" }));
});
app.get("/manifest-menu.json", function(req, res) {
  res.json(Object.assign({}, PWA_BASE, { name: "La Curva Menú", short_name: "Menú", start_url: "/menu", theme_color: "#0A0710", background_color: "#0A0710" }));
});
app.get("/manifest-mesero.json", function(req, res) {
  res.json(Object.assign({}, PWA_BASE, { name: "Mesero · La Curva", short_name: "Mesero", start_url: "/mesero2" }));
});
app.get("/manifest-cocina.json", function(req, res) {
  res.json(Object.assign({}, PWA_BASE, { name: "Cocina · La Curva", short_name: "Cocina", start_url: "/cocina", theme_color: "#f97316" }));
});
app.get("/manifest-restaurante.json", function(req, res) {
  res.json(Object.assign({}, PWA_BASE, { name: "Panel · La Curva", short_name: "Panel", start_url: "/restaurante" }));
});

// ── GEOCODIFICACIÓN — Nominatim OpenStreetMap (gratuito, sin API key) ─────────
app.get("/api/geocode", async function(req, res) {
  var q = req.query.q;
  if (!q) return res.json({ results: [] });
  try {
    var url = "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(q) + "&format=json&limit=5&countrycodes=co";
    var r = await axios.get(url, {
      headers: { "User-Agent": "LUZ-IA/1.0 restaurante" },
      timeout: 6000
    });
    var results = (r.data || []).map(function(item) {
      return { display_name: item.display_name, lat: parseFloat(item.lat), lon: parseFloat(item.lon) };
    });
    res.json({ results: results });
  } catch(e) {
    console.error("[geocode]", e.message);
    res.json({ results: [] });
  }
});

app.get("/api/mesas-estado", async function(req, res) {
  var restaurante_id = req.query.restaurante_id;
  if (!restaurante_id) return res.status(400).json({ error: "Falta restaurante_id" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    // Leer estado de mesas de la tabla
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/mesas?restaurante_id=eq." + restaurante_id + "&select=numero,estado&order=numero",
      { headers: h }
    );
    var mesas = (r.data || []).map(function(m) {
      return { mesa: m.numero, estado: m.estado || "libre" };
    });
    // Si no hay tabla mesas, derivar del estado de pedidos activos
    if (!mesas.length) {
      var pedR = await axios.get(
        SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante_id +
        "&estado=in.(confirmado,en_preparacion,listo)&select=direccion,estado,numero_pedido",
        { headers: h }
      );
      var pedidos = pedR.data || [];
      var mesasMap = {};
      for (var p of pedidos) {
        var dir = (p.direccion || "").toUpperCase();
        var m = dir.match(/MESA\s*(\d+)/);
        if (m) {
          var num = parseInt(m[1]);
          var est = p.estado === "listo" ? "lista" : "ocupada";
          mesasMap[num] = est;
        }
      }
      // Generar array para hasta 10 mesas
      for (var i = 1; i <= 10; i++) {
        mesas.push({ mesa: i, estado: mesasMap[i] || "libre" });
      }
    }
    res.json(mesas);
  } catch (e) {
    console.error("[mesas-estado]", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mesa-estado", async function(req, res) {
  var { restaurante_id, mesa, estado } = req.body;
  if (!restaurante_id || !mesa || !estado) return res.status(400).json({ error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json" };
    // ── Actualizar memoria inmediatamente — CHARR TOWER lo lee en 3s
    if (!mesaEstados[restaurante_id]) mesaEstados[restaurante_id] = {};
    mesaEstados[restaurante_id]["mesa_" + mesa] = estado;
    console.log("[mesa-estado] Mesa " + mesa + " → " + estado + " (mem+db)");
    // ── Upsert en Supabase con on_conflict — siempre funciona
    await axios.post(
      SUPABASE_URL + "/rest/v1/mesas?on_conflict=restaurante_id,numero",
      { restaurante_id, numero: parseInt(mesa), estado, updated_at: new Date().toISOString() },
      { headers: { ...h, "Prefer": "resolution=merge-duplicates,return=minimal" } }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[mesa-estado]", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", function(req, res) {
  res.json({ ok: true, status: "alive", ts: new Date().toISOString(), app: "LUZ IA" });
});

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

// ═══════════════════════════════════════════════════════════
// ADMIN AUTH + DASHBOARD API
// ═══════════════════════════════════════════════════════════
var crypto = require("crypto");
var ADMIN_SECRET = process.env.ADMIN_SECRET || "luzia_admin_2025_secret";

function hashPassword(pw) {
  return crypto.createHash("sha256").update(pw + ADMIN_SECRET).digest("hex");
}
function generateToken(userId, rol) {
  var payload = JSON.stringify({ id: userId, rol: rol, ts: Date.now() });
  var sig = crypto.createHmac("sha256", ADMIN_SECRET).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64") + "." + sig;
}
function verifyToken(token) {
  try {
    var parts = token.split(".");
    if (parts.length !== 2) return null;
    var payload = Buffer.from(parts[0], "base64").toString();
    var sig = crypto.createHmac("sha256", ADMIN_SECRET).update(payload).digest("hex");
    if (sig !== parts[1]) return null;
    var data = JSON.parse(payload);
    // Token valid for 24h
    if (Date.now() - data.ts > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch (e) { return null; }
}

// Auth middleware
function requireAdmin(req, res, next) {
  var token = (req.headers.authorization || "").replace("Bearer ", "");
  var user = verifyToken(token);
  if (!user || (user.rol !== "superadmin" && user.rol !== "vendedor")) {
    return res.status(401).json({ ok: false, error: "No autorizado" });
  }
  req.adminUser = user;
  next();
}

app.post("/api/admin/login", async function(req, res) {
  var { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    // Buscar por email O por teléfono
    var query = email.includes("@")
      ? "email=eq." + encodeURIComponent(email)
      : "telefono=eq." + encodeURIComponent(email.replace(/[^0-9]/g,""));
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/usuarios_sistema?" + query + "&activo=eq.true&select=*&limit=1",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    if (!r.data || !r.data.length) return res.json({ ok: false, error: "Usuario no encontrado" });
    var user = r.data[0];
    if (user.password_hash !== hashPassword(password)) return res.json({ ok: false, error: "Contraseña incorrecta" });
    var token = generateToken(user.id, user.rol);
    res.json({ ok: true, token: token, user: { id: user.id, nombre: user.nombre, email: user.email, telefono: user.telefono, rol: user.rol } });
  } catch (e) {
    console.error("[admin/login]", e.message);
    res.status(500).json({ ok: false, error: "Error del servidor" });
  }
});

// Fallback login for initial setup (before usuarios_sistema table exists)
app.post("/api/admin/login-legacy", function(req, res) {
  var { user, password } = req.body;
  var LEGACY = { "admin": process.env.ADMIN_PASSWORD || "luzia2024" };
  if (LEGACY[user] && LEGACY[user] === password) {
    var token = generateToken("legacy_admin", "superadmin");
    res.json({ ok: true, token: token, user: { id: "legacy", nombre: "Admin", email: user, rol: "superadmin" } });
  } else {
    res.json({ ok: false, error: "Credenciales incorrectas" });
  }
});

app.get("/api/admin/verify", function(req, res) {
  var token = (req.headers.authorization || "").replace("Bearer ", "");
  var user = verifyToken(token);
  if (user) res.json({ ok: true, user: user });
  else res.json({ ok: false });
});

app.get("/api/admin/dashboard", requireAdmin, async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    // Restaurantes
    var rests = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?select=id,nombre,estado,plan,fecha_vencimiento,suscripcion_estado,ciudad_restaurante,created_at&order=created_at.desc", { headers: h });
    // Pedidos hoy
    var hoy = new Date().toISOString().split("T")[0];
    var pedidos = await axios.get(SUPABASE_URL + "/rest/v1/pedidos?created_at=gte." + hoy + "T00:00:00&select=total,restaurante_id", { headers: h });
    // Planes
    var planes = await axios.get(SUPABASE_URL + "/rest/v1/planes?activo=eq.true&order=orden&select=*", { headers: h });

    var data = rests.data || [];
    var activos = data.filter(function(r) { return r.estado === "activo"; }).length;
    var suspendidos = data.filter(function(r) { return r.estado === "suspendido"; }).length;
    var trials = data.filter(function(r) { return r.suscripcion_estado === "trial"; }).length;
    var pedidosHoy = (pedidos.data || []).length;
    var ventasHoy = (pedidos.data || []).reduce(function(s, p) { return s + Number(p.total || 0); }, 0);

    // MRR calculation
    var preciosPlan = {};
    (planes.data || []).forEach(function(p) { preciosPlan[p.nombre] = p.precio_mensual; });
    var mrr = data.filter(function(r) { return r.estado === "activo"; }).reduce(function(s, r) {
      return s + (preciosPlan[r.plan_id] || preciosPlan[r.plan] || 0);
    }, 0);

    // Vencen en 7 días
    var en7 = new Date(); en7.setDate(en7.getDate() + 7);
    var vencen = data.filter(function(r) {
      if (!r.fecha_vencimiento || r.estado !== "activo") return false;
      return new Date(r.fecha_vencimiento) <= en7;
    });

    res.json({
      ok: true,
      restaurantes: data,
      planes: planes.data || [],
      stats: {
        total: data.length, activos: activos, suspendidos: suspendidos, trials: trials,
        pedidosHoy: pedidosHoy, ventasHoy: ventasHoy, mrr: mrr,
        vencen: vencen.length, vencenNombres: vencen.map(function(r) { return r.nombre; })
      }
    });
  } catch (e) {
    console.error("[admin/dashboard]", e.message);
    res.json({ ok: false, error: e.message });
  }
});

// Admin Supabase proxy (same as restaurante proxy)
app.all("/api/admin/sb/*", requireAdmin, async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var restPath = req.params[0];
    if (!restPath || restPath.indexOf("..") !== -1) return res.status(400).json({ error: "Invalid path" });
    var targetUrl = SUPABASE_URL + "/rest/v1/" + restPath;
    var qs = require("url").parse(req.url).query;
    if (qs) targetUrl += (targetUrl.indexOf("?") === -1 ? "?" : "&") + qs;
    var headers = { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json" };
    if (req.method === "POST" || req.method === "PATCH") headers["Prefer"] = req.headers["prefer"] || "return=minimal";
    if (req.method === "POST" && req.headers["prefer"]) headers["Prefer"] = req.headers["prefer"];
    var axiosConfig = { method: req.method.toLowerCase(), url: targetUrl, headers: headers };
    if (req.method !== "GET" && req.method !== "DELETE" && req.body) axiosConfig.data = req.body;
    var r = await axios(axiosConfig);
    res.json(r.data !== undefined && r.data !== null && r.data !== "" ? r.data : { ok: true });
  } catch (e) {
    var status = e.response ? e.response.status : 500;
    if (status === 201 || status === 204) return res.json({ ok: true });
    res.status(status >= 400 ? status : 500).json({ error: e.message, ok: false });
  }
});

// ═══════════════════════════════════════════════════════════
// VENDEDOR API
// ═══════════════════════════════════════════════════════════
app.get("/api/vendedor/dashboard", requireAdmin, async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var vendedorId = req.adminUser.id;
    // All restaurants (for superadmin) or assigned to vendedor
    var filter = req.adminUser.rol === "superadmin" ? "" : "&vendedor_id=eq." + vendedorId;
    var rests = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?select=*&order=created_at.desc" + filter, { headers: h });
    // Activity log
    var actFilter = req.adminUser.rol === "superadmin" ? "" : "&vendedor_id=eq." + vendedorId;
    var actividad = await axios.get(SUPABASE_URL + "/rest/v1/actividad_vendedor?select=*&order=created_at.desc&limit=20" + actFilter, { headers: h });
    var data = rests.data || [];
    var activos = data.filter(function(r) { return r.estado === "activo"; }).length;
    var trials = data.filter(function(r) { return r.suscripcion_estado === "trial"; }).length;
    var hoy = new Date(); var en3 = new Date(); en3.setDate(en3.getDate() + 3);
    var trialsPorVencer = data.filter(function(r) {
      if (r.suscripcion_estado !== "trial" || !r.fecha_vencimiento) return false;
      var fv = new Date(r.fecha_vencimiento);
      return fv <= en3 && fv >= hoy;
    });
    // Onboarding status per restaurant
    data.forEach(function(r) {
      r._onboarding = {
        info: !!(r.nombre && r.direccion),
        whatsapp: !!r.whatsapp_phone_id,
        horario: !!(r.hora_apertura && r.hora_cierre),
        menu: false, // checked below
        logo: !!r.logo_url,
        reglas: false
      };
    });
    // Check menu counts
    try {
      var restIds = data.map(function(r) { return r.id; });
      if (restIds.length > 0) {
        var menuCounts = await axios.get(SUPABASE_URL + "/rest/v1/menu_items?select=restaurante_id&disponible=eq.true&restaurante_id=in.(" + restIds.join(",") + ")", { headers: h });
        var mc = {};
        (menuCounts.data || []).forEach(function(m) { mc[m.restaurante_id] = (mc[m.restaurante_id] || 0) + 1; });
        data.forEach(function(r) { r._onboarding.menu = (mc[r.id] || 0) > 0; r._menuCount = mc[r.id] || 0; });
      }
    } catch(e) {}
    // Check reglas counts
    try {
      if (data.length > 0) {
        var restIds2 = data.map(function(r) { return r.id; });
        var reglasCounts = await axios.get(SUPABASE_URL + "/rest/v1/luz_aprendizajes?select=restaurante_id&activo=eq.true&restaurante_id=in.(" + restIds2.join(",") + ")", { headers: h });
        var rc = {};
        (reglasCounts.data || []).forEach(function(a) { rc[a.restaurante_id] = (rc[a.restaurante_id] || 0) + 1; });
        data.forEach(function(r) { r._onboarding.reglas = (rc[r.id] || 0) > 0; r._reglasCount = rc[r.id] || 0; });
      }
    } catch(e) {}
    res.json({ ok: true, restaurantes: data, actividad: actividad.data || [],
      stats: { total: data.length, activos: activos, trials: trials, trialsPorVencer: trialsPorVencer.length }
    });
  } catch (e) { console.error("[vendedor/dashboard]", e.message); res.json({ ok: false, error: e.message }); }
});

app.post("/api/vendedor/crear-restaurante", requireAdmin, async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var b = req.body;
    var pin = Math.floor(1000 + Math.random() * 9000).toString();
    var trialFin = new Date(); trialFin.setDate(trialFin.getDate() + 15);
    // Solo campos que existen en CUALQUIER versión de la tabla restaurantes
    var restData = {
      nombre: b.nombre,
      ciudad: b.ciudad || "Cali",
      ciudad_restaurante: b.ciudad || "Cali",
      estado: "activo",
      suscripcion_estado: "trial",
      fecha_vencimiento: trialFin.toISOString().split("T")[0],
      pin: pin,
      hora_apertura: (b.hora_apertura || "10:00") + ":00",
      hora_cierre: (b.hora_cierre || "22:00") + ":00"
    };
    // Campos opcionales — solo si la columna puede existir
    var optFields = {
      direccion: b.direccion,
      contacto_nombre: b.contacto_nombre,
      contacto_telefono: b.contacto_telefono,
      whatsapp: b.whatsapp,
      whatsapp_phone_id: b.whatsapp_phone_id,
      plan_id: b.plan || "basico",
      vendedor_id: req.adminUser.id,
      tipo_comida: b.tipo_comida || null
    };
    // Intentar con campos opcionales primero
    var fullData = Object.assign({}, restData, optFields);
    // Quitar nulls/undefined
    Object.keys(fullData).forEach(function(k){ if(fullData[k]==null||fullData[k]==="")delete fullData[k]; });
    var r;
    try {
      r = await axios.post(SUPABASE_URL + "/rest/v1/restaurantes", fullData,
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=representation" } });
    } catch(e1) {
      console.warn("[crear-restaurante] full insert failed:", e1.response?.data, "— retrying with base only");
      // Fallback: solo nombre + estado + pin
      r = await axios.post(SUPABASE_URL + "/rest/v1/restaurantes", restData,
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=representation" } });
    }
    var created = (Array.isArray(r.data) ? r.data[0] : r.data) || {};
    // Intentar guardar campos extra que pueden no existir en la tabla
    if (created.id) {
      var extras = {};
      if (b.nombre_luz) extras.nombre_luz = b.nombre_luz;
      if (b.personalidad_luz) extras.personalidad_luz = b.personalidad_luz;
      if (Object.keys(extras).length) {
        await axios.patch(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + created.id, extras,
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
        ).catch(function(){});
      }
      // Log actividad
      await axios.post(SUPABASE_URL + "/rest/v1/actividad_vendedor",
        { vendedor_id: req.adminUser.id, tipo: "cierre", restaurante_id: created.id, restaurante_nombre: b.nombre, notas: "Trial 15 días. PIN: " + pin },
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
      ).catch(function(){});
    }
    res.json({ ok: true, restaurante: created, pin: pin });
  } catch (e) {
    console.error("[vendedor/crear]", e.message, JSON.stringify(e.response?.data));
    res.status(500).json({ ok: false, error: e.message, detail: e.response?.data });
  }
});

app.post("/api/admin/crear-usuario", requireAdmin, async function(req, res) {
  try {
    var { nombre, email, password, telefono, rol } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, error: "Email y contraseña requeridos" });
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    // Verificar si ya existe
    var check = await axios.get(SUPABASE_URL + "/rest/v1/usuarios_sistema?email=eq." + encodeURIComponent(email) + "&select=id",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
    if (check.data && check.data.length) return res.json({ ok: false, error: "Email ya registrado" });
    var r = await axios.post(SUPABASE_URL + "/rest/v1/usuarios_sistema",
      { nombre: nombre || null, email: email, password_hash: hashPassword(password), telefono: telefono || null, rol: rol || "vendedor", activo: true },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=representation" } }
    );
    res.json({ ok: true, usuario: r.data && r.data[0] });
  } catch(e) {
    console.error("[crear-usuario]", e.message, e.response?.data);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/vendedor/notificar-creacion", requireAdmin, async function(req, res) {
  try {
    var { restaurante_id, telefono, pin, nombre } = req.body;
    if (!telefono || !pin) return res.json({ ok: false });
    var tel = "57" + String(telefono).replace(/^57/, "").replace(/[^0-9]/g, "");
    var pid = process.env.WHATSAPP_PHONE_ID;
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    try {
      var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id + "&select=whatsapp_phone_id",
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
      if (rr.data && rr.data[0] && rr.data[0].whatsapp_phone_id) pid = rr.data[0].whatsapp_phone_id;
    } catch(e) {}
    var msg = "¡Bienvenido a LUZ IA! 🤖🎉\n\n" +
      "Tu restaurante *" + nombre + "* ya está activo con 15 días de trial gratuito.\n\n" +
      "📱 *Tu panel de control:*\n" +
      process.env.MENU_PAGE_URL?.replace("/menu","") + "/restaurante\n\n" +
      "🔑 *Tu PIN de acceso:* " + pin + "\n\n" +
      "¿Dudas? Responde este mensaje y te ayudo. ¡Éxitos! 🚀";
    await sendWhatsAppMessage(tel, msg, pid);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post("/api/vendedor/actividad", requireAdmin, async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/actividad_vendedor",
      { vendedor_id: req.adminUser.id, tipo: req.body.tipo, restaurante_id: req.body.restaurante_id || null, restaurante_nombre: req.body.restaurante_nombre || null, notas: req.body.notas || null },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false }); }
});

// ═══════════════════════════════════════════════════════════
// MENU FROM PHOTO — Claude Vision extracts menu from image
// ═══════════════════════════════════════════════════════════
app.post("/api/menu-from-photo", requireAdmin, async function(req, res) {
  try {
    var { image_base64, restaurante_id, media_type } = req.body;
    if (!image_base64 || !restaurante_id) return res.status(400).json({ ok: false, error: "Faltan datos" });
    var CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!CLAUDE_KEY) return res.status(500).json({ ok: false, error: "API key de Claude no configurada" });
    var claudeResp = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: image_base64 } },
          { type: "text", text: "Extrae TODOS los productos del menú de esta imagen. Para cada producto devuelve: nombre, descripcion (ingredientes si se ven), precio (número sin símbolo), categoria (agrupa por tipo: Hamburguesas, Bebidas, Acompañantes, Postres, etc). Si no ves precio, pon 0. Si no ves descripción, pon cadena vacía. Responde SOLO con un JSON array, sin markdown ni backticks ni texto adicional. Ejemplo: [{\"nombre\":\"La Especial\",\"descripcion\":\"Carne, queso, tocineta\",\"precio\":18900,\"categoria\":\"Hamburguesas\"}]" }
        ]
      }]
    }, {
      headers: { "x-api-key": CLAUDE_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
    });
    var content = claudeResp.data.content[0].text;
    // Clean response - remove markdown backticks if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    var items = JSON.parse(content);
    if (!Array.isArray(items)) throw new Error("Respuesta no es un array");
    // Insert into menu_items
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var inserted = 0;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      try {
        await axios.post(SUPABASE_URL + "/rest/v1/menu_items",
          { restaurante_id: restaurante_id, nombre: item.nombre, descripcion: item.descripcion || null, precio: Number(item.precio) || 0, categoria: item.categoria || "General", disponible: true, es_bebida: (item.categoria || "").toLowerCase().indexOf("bebida") !== -1, orden: i },
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
        );
        inserted++;
      } catch (eIns) { console.error("[menu-photo] Insert error:", eIns.message); }
    }
    console.log("[menu-photo] ✅ " + inserted + "/" + items.length + " productos insertados para " + restaurante_id);
    res.json({ ok: true, items: items, inserted: inserted });
  } catch (e) {
    console.error("[menu-photo] Error:", e.message);
    res.json({ ok: false, error: "Error procesando imagen: " + e.message });
  }
});

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
  var estadoReal = estado === "listo_entrega" ? "listo_entrega" : estado;
  // Auto-actualizar LED de mesa si viene la dirección
  if (restaurante_id && req.body.direccion) {
    actualizarEstadoMesa(restaurante_id, req.body.direccion, estado).catch(function(){});
  }
  try {
    try {
      await axios.patch(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id, { estado: estadoReal },
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
    } catch(ePatch) {
      // Si el estado no está en el CHECK constraint, usar el más cercano
      var fallbackEstado = null;
      if (estadoReal === "listo_entrega") fallbackEstado = "entregado";
      if (estadoReal === "servido" || estadoReal === "sirviendo") fallbackEstado = "listo";
      if (fallbackEstado) {
        await axios.patch(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id, { estado: fallbackEstado },
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
        console.log("[pedido-estado] " + estadoReal + " fallback → " + fallbackEstado + " para pedido " + id);
      } else {
        throw ePatch;
      }
    }
    // servido y listo_entrega: solo actualizar estado, no mandar WhatsApp
    if (estado === "listo_entrega" || estado === "servido" || estado === "sirviendo") { return res.json({ ok: true }); }
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

        // Solicitar valoración del pedido por WhatsApp (con 30 segundos de delay)
        setTimeout(async function() {
          try {
            var restInfo = await getRestaurante(null);
            var pidRating = restInfo ? restInfo.whatsapp_phone_id : process.env.WHATSAPP_PHONE_ID;
            var nombreRest = restInfo ? restInfo.nombre : "nosotros";
            var pedNumStr = req.body.numero_pedido ? " #" + req.body.numero_pedido : "";
            var msgRating = "¡Hola! 😊 Esperamos que hayas disfrutado tu pedido" + pedNumStr + " de " + nombreRest + ".\n\n"
              + "¿Cómo estuvo tu experiencia? Responde con un número:\n\n"
              + "⭐ 1 - Muy malo\n"
              + "⭐⭐ 2 - Malo\n"
              + "⭐⭐⭐ 3 - Regular\n"
              + "⭐⭐⭐⭐ 4 - Bueno\n"
              + "⭐⭐⭐⭐⭐ 5 - Excelente\n\n"
              + "Tu opinión nos ayuda a mejorar 🙏";
            await sendWhatsAppMessage("57" + telFid, msgRating, pidRating);
            console.log("[rating] Solicitud de valoración enviada a:", telFid);
          } catch(eRating) { console.error("[rating] Error:", eRating.message); }
        }, 30000); // 30 segundos después de marcar como entregado

      } catch(eFid) { console.error("fidelidad update error:", eFid.message); }
    }

    // ── SYNC LED MESA AUTOMÁTICO ──────────────────────────────────────────────
    // Si el pedido es de mesa, sincroniza el LED automáticamente
    if (restaurante_id && req.body.mesa) {
      var mesaNum = req.body.mesa;
      var estadoLed = estado;
      if (estado === "entregado") estadoLed = "libre";
      else if (estado === "listo_entrega") estadoLed = "listo";
      if (!mesaEstados[restaurante_id]) mesaEstados[restaurante_id] = {};
      mesaEstados[restaurante_id]["mesa_" + mesaNum] = estadoLed;
      console.log("[led-sync] Mesa " + mesaNum + " → " + estadoLed);
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.response ? JSON.stringify(err.response.data) : err.message }); }
});

app.post("/api/menu-toggle", async function(req, res) {
  if (!req.body.id) return res.status(400).json({ error: "Falta id" });
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/menu_items?id=eq." + req.body.id, { disponible: req.body.disponible },
      { headers: { ...sbH(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    if (req.body.restaurante_id) delete menuCache[req.body.restaurante_id];
    else menuCache = {};
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/menu-add", async function(req, res) {
  try {
    await axios.post(SUPABASE_URL + "/rest/v1/menu_items", req.body, { headers: { ...sbH(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    if (req.body.restaurante_id) delete menuCache[req.body.restaurante_id];
    else menuCache = {};
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/restaurante-config", async function(req, res) {
  if (!req.body.restaurante_id || !req.body.config) return res.status(400).json({ error: "Faltan datos" });
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id, req.body.config,
      { headers: { ...sbH(true), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    invalidarCacheRestaurante();
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
    var tel = req.body.telefono.replace(/[^0-9]/g, "");
    var telLocal = tel.length === 12 && tel.startsWith("57") ? tel.slice(2) : tel;
    var telWA = tel.length === 10 && !tel.startsWith("57") ? "57" + tel : tel;
    
    var pid = process.env.WHATSAPP_PHONE_ID;
    if (req.body.restaurante_id) {
      try {
        var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
        var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id + "&select=whatsapp_phone_id", { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
        if (rr.data?.length && rr.data[0].whatsapp_phone_id) pid = rr.data[0].whatsapp_phone_id;
      } catch(e) {}
    }
    // Save with local format (same as how client messages are stored)
    if (req.body.restaurante_id) guardarMensajeSupabase(req.body.restaurante_id, telLocal, req.body.mensaje, "restaurante", null);
    // Send WhatsApp with country code
    try { await sendWhatsAppMessage(telWA, req.body.mensaje, pid); } catch(e) { console.error("WA enviar:", e.message); }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});



// ── UBICACIÓN DOMICILIARIO ─────────────────────────────────────────────────
app.post("/api/domi-ubicacion", async function(req, res) {
  // Alias de /api/ubicacion-domiciliario — mismo handler
  req.url = "/api/ubicacion-domiciliario";
  var { pedido_id, restaurante_id, domiciliario_id, lat, lng } = req.body;
  if(!domiciliario_id || !lat || !lng) return res.status(400).json({error:"Faltan datos"});
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var headers = {"apikey":svcKey,"Authorization":"Bearer "+svcKey,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"};
    var body = { domiciliario_id, restaurante_id: restaurante_id||null, lat, lng, pedido_id: pedido_id||null, updated_at: new Date().toISOString() };
    await axios.post(SUPABASE_URL+"/rest/v1/domiciliario_ubicacion?on_conflict=domiciliario_id", body, {headers}).catch(async function(){
      await axios.post(SUPABASE_URL+"/rest/v1/domiciliario_ubicacion", body, {headers});
    });
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/ubicacion-domiciliario", async function(req, res) {
  try {
    var { pedido_id, restaurante_id, domiciliario_id, lat, lng } = req.body;
    if (!lat || !lng || !domiciliario_id) return res.status(400).json({ error: "Faltan datos" });
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var headers = { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" };
    // Guardar/actualizar ubicación — upsert por domiciliario_id
    var body = { domiciliario_id, restaurante_id: restaurante_id || null, lat, lng, updated_at: new Date().toISOString() };
    if (pedido_id) body.pedido_id = pedido_id;
    // Intentar upsert por domiciliario_id
    await axios.post(SUPABASE_URL + "/rest/v1/domiciliario_ubicacion?on_conflict=domiciliario_id", body, { headers }).catch(async function() {
      // Si falla por constraint, intentar con pedido_id
      if (pedido_id) {
        await axios.post(SUPABASE_URL + "/rest/v1/domiciliario_ubicacion?on_conflict=pedido_id", body, { headers });
      }
    });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.response?.data || e.message });
  }
});

// ── UBICACIONES EN TIEMPO REAL DE DOMICILIARIOS ─────────────────
app.get("/api/domi-ubicaciones", async function(req, res) {
  var { restaurante_id } = req.query;
  if (!restaurante_id) return res.status(400).json({ error: "Falta restaurante_id" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    // Ubicaciones actualizadas en los últimos 30 minutos
    var hace30 = new Date(Date.now() - 30*60*1000).toISOString();
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/domiciliario_ubicacion?restaurante_id=eq." + restaurante_id +
      "&updated_at=gte." + hace30 + "&select=domiciliario_id,lat,lng,updated_at,pedido_id",
      { headers: h }
    );
    // Enriquecer con nombre del domi
    var ubicaciones = r.data || [];
    if (ubicaciones.length > 0) {
      var ids = [...new Set(ubicaciones.map(function(u){ return u.domiciliario_id; }))].filter(Boolean);
      var domisR = await axios.get(
        SUPABASE_URL + "/rest/v1/domiciliarios?id=in.(" + ids.join(",") + ")&select=id,nombre",
        { headers: h }
      ).catch(function(){ return { data: [] }; });
      var domisMap = {};
      (domisR.data || []).forEach(function(d){ domisMap[d.id] = d.nombre; });
      ubicaciones = ubicaciones.map(function(u){
        return Object.assign({}, u, { nombre: domisMap[u.domiciliario_id] || "Domi" });
      });
    }
    res.json(ubicaciones);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ESTADÍSTICAS DEL DOMICILIARIO ─────────────────────────────────────────
app.get("/api/domi-stats", async function(req, res) {
  var { domiciliario_id, restaurante_id } = req.query;
  if (!domiciliario_id || !restaurante_id) return res.json({ entregas: 0, hoy: 0, semana: 0, total_ganado: 0, pedidos_activos: [] });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var semana = new Date(Date.now() - 7*24*60*60*1000);
    // Pedidos entregados por este domiciliario
    var [todosR, pedActR] = await Promise.all([
      axios.get(SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante_id +
        "&domiciliario_id=eq." + domiciliario_id + "&estado=eq.entregado&select=id,total,created_at", { headers: h }),
      axios.get(SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante_id +
        "&domiciliario_id=eq." + domiciliario_id + "&estado=in.(en_camino,listo)&select=id,numero_pedido,total,cliente_tel,direccion,items,estado,created_at&order=created_at.desc", { headers: h })
    ]);
    var todos = todosR.data || [];
    var hoyCount = todos.filter(function(p) { return new Date(p.created_at) >= hoy; }).length;
    var semanaCount = todos.filter(function(p) { return new Date(p.created_at) >= semana; }).length;
    var totalGanado = todos.reduce(function(s, p) { return s + Number(p.total || 0); }, 0);
    res.json({
      entregas: todos.length,
      hoy: hoyCount,
      semana: semanaCount,
      total_ganado: totalGanado,
      pedidos_activos: pedActR.data || []
    });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── FOTO DE ENTREGA ────────────────────────────────────────────────────────
app.post("/api/foto-entrega", async function(req, res) {
  var { pedido_id, restaurante_id, imagen_base64, domiciliario_id } = req.body;
  if (!pedido_id || !imagen_base64) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    var matches = imagen_base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Formato inválido" });
    var mimeType = matches[1];
    var buffer = Buffer.from(matches[2], "base64");
    var ext = mimeType.includes("png") ? "png" : "jpg";
    var fileName = "entrega_" + pedido_id + "_" + Date.now() + "." + ext;
    var filePath = (restaurante_id || "general") + "/" + fileName;
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    // Subir foto a Supabase Storage bucket 'entregas'
    await axios.post(
      SUPABASE_URL + "/storage/v1/object/media/" + filePath,
      buffer,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": mimeType, "x-upsert": "true" }, maxBodyLength: Infinity }
    );
    var fotoUrl = SUPABASE_URL + "/storage/v1/object/public/media/" + filePath;
    // Guardar URL en el pedido
    await axios.patch(
      SUPABASE_URL + "/rest/v1/pedidos?id=eq." + pedido_id,
      { foto_entrega: fotoUrl, updated_at: new Date().toISOString() },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    console.log("[foto-entrega] ✅ Pedido " + pedido_id + " → " + fotoUrl);
    res.json({ ok: true, url: fotoUrl });
  } catch(e) {
    console.error("[foto-entrega] Error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── SUBIR COMPROBANTE A SUPABASE STORAGE ──────────────────────────────────
app.post("/api/subir-comprobante", async function(req, res) {
  try {
    var { imagen_base64, restaurante_id } = req.body;
    if (!imagen_base64) return res.status(400).json({ error: "Sin imagen" });
    
    var matches = imagen_base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Formato inválido - debe empezar con data:image/..." });
    
    var mimeType = matches[1];
    var base64Data = matches[2];
    var buffer = Buffer.from(base64Data, "base64");
    var ext = mimeType.includes("png") ? "png" : "jpg";
    var fileName = "comprobante_" + Date.now() + "_" + Math.random().toString(36).substr(2,6) + "." + ext;
    var filePath = (restaurante_id || "general") + "/" + fileName;
    
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    
    console.log("[subir-comp] Subiendo", (buffer.length/1024).toFixed(1) + "KB a comprobantes/" + filePath);
    
    var uploadResp = await axios.post(
      SUPABASE_URL + "/storage/v1/object/comprobantes/" + filePath,
      buffer,
      {
        headers: {
          "apikey": svcKey,
          "Authorization": "Bearer " + svcKey,
          "Content-Type": mimeType,
          "x-upsert": "true"
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );
    
    var publicUrl = SUPABASE_URL + "/storage/v1/object/public/comprobantes/" + filePath;
    console.log("[subir-comp] ✅ Subido:", publicUrl);
    res.json({ ok: true, url: publicUrl });
  } catch(e) {
    console.error("[subir-comp] ❌ Error:", e.response?.data || e.message);
    // Si el error es que el bucket no existe, intentar crear
    if (e.response?.status === 404 || (e.response?.data?.message || "").includes("not found")) {
      console.error("[subir-comp] 🚨 El bucket 'comprobantes' probablemente no existe en Supabase Storage");
      console.error("[subir-comp] Crea el bucket manualmente en Supabase → Storage → New bucket → nombre: comprobantes → público");
    }
    res.status(500).json({ ok: false, error: e.response?.data?.message || e.message });
  }
});

app.post("/api/pedido-manual", async function(req, res) {
  var restaurante_id = req.body.restaurante_id;
  var telefono = req.body.telefono || req.body.cliente_tel;
  var items = req.body.items;
  var total = req.body.total;
  var desechables = req.body.desechables || 0;
  var domicilio = req.body.domicilio || 0;
  var direccion = req.body.direccion || "Por confirmar";
  var metodo_pago = req.body.metodo_pago || "digital";
  var notas_especiales = req.body.notas_especiales || null;
  var nombre_cliente = req.body.nombre_cliente || null;
  var comprobante_url = req.body.comprobante_url || null;
  var descuento = req.body.descuento || 0;
  var descuento_rango = req.body.descuento_rango || 0; // % de descuento por nivel
  var nivel_fidelidad = req.body.nivel_fidelidad || null;
  var barrio = req.body.barrio || null;
  var tipo_pedido = req.body.tipo_pedido || "domicilio";
  // Agregar nota de descuento por rango si aplica
  if (descuento_rango > 0 && nivel_fidelidad) {
    var notaDesc = "💎 DESCUENTO " + nivel_fidelidad.toUpperCase() + " " + descuento_rango + "%";
    notas_especiales = notas_especiales ? notas_especiales + " | " + notaDesc : notaDesc;
  }

  if (!restaurante_id || !telefono || !items || !total) return res.status(400).json({ ok: false, error: "Faltan datos: restaurante_id, telefono, items, total" });
  try {
    var num = ++orderCounter;
    var subtotal = req.body.subtotal || (Number(total) - Number(desechables) - Number(domicilio) + Number(descuento));
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var itemsArr = Array.isArray(items) ? items : items.split("\n").filter(function(l){return l.trim();});
    var payload = {
      restaurante_id: restaurante_id,
      numero_pedido: num,
      cliente_tel: telefono,
      items: itemsArr,
      subtotal: subtotal,
      desechables: Number(desechables),
      domicilio: Number(domicilio),
      total: Number(total),
      direccion: direccion + (barrio ? " (" + barrio + ")" : ""),
      metodo_pago: metodo_pago,
      estado: "confirmado",
      notas_especiales: notas_especiales,
      canal: "web"
    };
    if (nombre_cliente) payload.cliente_nombre = nombre_cliente;
    if (comprobante_url) payload.comprobante_url = comprobante_url;
    if (descuento) payload.descuento = Number(descuento);
    if (tipo_pedido) payload.tipo_pedido = tipo_pedido;
    
    var response = await axios.post(SUPABASE_URL + "/rest/v1/pedidos", payload, {
      headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=representation" }
    });
    if (direccion && direccion !== "Por confirmar") guardarDireccionFrecuente(restaurante_id, telefono, direccion);
    console.log("[pedido-manual] ✅ Pedido #" + num + " desde WEB | " + nombre_cliente + " | " + metodo_pago + " | $" + total);
    // Auto-actualizar LED de mesa si es pedido de mesa
    if (direccion) actualizarEstadoMesa(restaurante_id, direccion, "confirmado").catch(function(){});

    // ══ SUMAR PUNTOS al cliente ══
    try {
      var telLocal = telefono.replace(/^57/, "");
      // Contar pedidos del cliente (buscar con y sin indicativo)
      var countResp = await axios.get(SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante_id + "&or=(cliente_tel.eq." + encodeURIComponent(telefono) + ",cliente_tel.eq." + encodeURIComponent(telLocal) + ")&select=id", { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
      var totalPedidos = (countResp.data || []).length;
      var nivel = totalPedidos >= 25 ? "oro" : totalPedidos >= 10 ? "plata" : "bronce";
      var puntosNuevos = Math.floor(Number(total) / 1000);
      // Leer puntos actuales para SUMAR (no sobrescribir)
      var cliActual = await axios.get(SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restaurante_id + "&telefono=eq." + encodeURIComponent(telLocal) + "&select=puntos", { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
      var puntosActuales = (cliActual.data && cliActual.data[0] && cliActual.data[0].puntos) ? cliActual.data[0].puntos : 0;
      var puntosTotal = puntosActuales + puntosNuevos;
      await axios.post(SUPABASE_URL + "/rest/v1/clientes_frecuentes?on_conflict=restaurante_id,telefono",
        { restaurante_id: restaurante_id, telefono: telLocal, nombre_cliente: nombre_cliente, total_pedidos: totalPedidos, nivel_fidelidad: nivel, puntos: puntosTotal, updated_at: new Date().toISOString() },
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } });
      console.log("[pedido-manual] ✅ Cliente " + telLocal + " -> " + totalPedidos + " pedidos, nivel: " + nivel + ", puntos: " + puntosActuales + " + " + puntosNuevos + " = " + puntosTotal);
    } catch(e) { console.error("[pedido-manual] Error actualizando cliente:", e.message); }

    // ══ ENVIAR CONFIRMACIÓN POR WHATSAPP ══
    try {
      var restData = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id + "&select=whatsapp_phone_id,nombre", { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } });
      var restInfo = restData.data && restData.data[0];
      if (restInfo && restInfo.whatsapp_phone_id) {
        // Ensure phone has country code for WhatsApp API
        var telWA = String(telefono).replace(/[^0-9]/g, "");
        if (telWA.length === 10 && !telWA.startsWith("57")) telWA = "57" + telWA;
        var itemsResumen = itemsArr.slice(0, 5).join("\n• ");
        var msgCliente = "✅ *Pedido #" + num + " confirmado*\n\n"
          + "Hola" + (nombre_cliente ? " " + nombre_cliente.split(" ")[0] : "") + ", tu pedido ha sido recibido.\n\n"
          + "📋 *Resumen:*\n• " + itemsResumen + "\n\n"
          + "💰 *Total:* $" + Number(total).toLocaleString("es-CO") + "\n"
          + "💳 *Pago:* " + metodo_pago + "\n"
          + (tipo_pedido === "domicilio" ? "🛵 *Domicilio a:* " + direccion + (barrio ? " (" + barrio + ")" : "") + "\n" : "🏪 *Para recoger en el local*\n")
          + "\nTe avisaremos cuando esté listo. Si necesitas algo, escríbenos por aquí.";
        await sendWhatsAppMessage(telWA, msgCliente, restInfo.whatsapp_phone_id);
        console.log("[pedido-manual] ✅ WhatsApp enviado a " + telWA);
        // Guardar mensaje en historial de chat
        guardarMensajeSupabase(restaurante_id, telefono, msgCliente, "estado_luz", null).catch(function(){});
      } else {
        console.warn("[pedido-manual] ⚠️ Sin whatsapp_phone_id — confirmación no enviada");
      }
    } catch(e) { console.error("[pedido-manual] Error enviando WhatsApp:", e.message); }

    res.json({ ok: true, numero: num, numero_pedido: num, id: response.data[0]?.id });
  } catch (e) {
    console.error("[pedido-manual] ❌ Error:", e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(500).json({ ok: false, error: e.response ? JSON.stringify(e.response.data) : e.message });
  }
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
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var telefonos = [];

    // Fuente 1: clientes_frecuentes (TODA la base, no solo 30 días)
    try {
      var cliResp = await axios.get(
        SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + req.body.restaurante_id + "&select=telefono",
        { headers: h }
      );
      (cliResp.data || []).forEach(function(c) { if (c.telefono) telefonos.push(c.telefono); });
    } catch(e) { console.error("[promo] Error clientes_frecuentes:", e.message); }

    // Fuente 2: pedidos históricos (complementa si hay clientes sin registro)
    try {
      var pedResp = await axios.get(
        SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + req.body.restaurante_id + "&select=cliente_tel&limit=10000",
        { headers: { ...h, "Range-Unit": "items", "Range": "0-9999", "Prefer": "count=none" } }
      );
      (pedResp.data || []).forEach(function(p) { if (p.cliente_tel) telefonos.push(p.cliente_tel); });
    } catch(e) { console.error("[promo] Error pedidos:", e.message); }

    // Fuente 3: mensajes — todos los que han escrito alguna vez (sin importar si pidieron)
    // IMPORTANTE: agregar limit alto para no cortar en 1000 filas (default de Supabase)
    try {
      var msgResp = await axios.get(
        SUPABASE_URL + "/rest/v1/mensajes?restaurante_id=eq." + req.body.restaurante_id + "&select=telefono&limit=10000",
        { headers: { ...h, "Range-Unit": "items", "Range": "0-9999", "Prefer": "count=none" } }
      );
      (msgResp.data || []).forEach(function(m) { if (m.telefono) telefonos.push(m.telefono); });
      console.log("[promo] Fuente mensajes:", (msgResp.data||[]).length, "registros");
    } catch(e) { console.error("[promo] Error mensajes:", e.message); }
    
    // Fuente 4: clientes_frecuentes sin filtro de fecha (todos sin excepcion)
    try {
      var cliAll = await axios.get(
        SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + req.body.restaurante_id + "&select=telefono&limit=10000",
        { headers: { ...h, "Range-Unit": "items", "Range": "0-9999", "Prefer": "count=none" } }
      );
      (cliAll.data || []).forEach(function(c) { if (c.telefono) telefonos.push(c.telefono); });
      console.log("[promo] Fuente clientes_frecuentes:", (cliAll.data||[]).length, "registros");
    } catch(e) { console.error("[promo] Error clientes_frecuentes extra:", e.message); }

    // Normalizar y deduplicar
    var unicos = {};
    telefonos.forEach(function(t) {
      var clean = t.replace(/[^0-9]/g, "");
      if (clean.length === 10 && !clean.startsWith("57")) clean = "57" + clean;
      if (clean.length >= 10) unicos[clean] = true;
    });
    var lista = Object.keys(unicos);

    if (!lista.length) return res.json({ ok: true, enviados: 0, fallidos: 0, total: 0, msg: "No hay clientes en la base" });

    // Phone ID del restaurante
    var pid = process.env.WHATSAPP_PHONE_ID;
    try {
      var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + req.body.restaurante_id + "&select=whatsapp_phone_id", { headers: h });
      if (rr.data?.length && rr.data[0].whatsapp_phone_id) pid = rr.data[0].whatsapp_phone_id;
    } catch(e) {}

    console.log("[promo] Enviando a " + lista.length + " clientes del restaurante " + req.body.restaurante_id);

    var enviados = 0, fallidos = 0;
    for (var i = 0; i < lista.length; i++) {
      try {
        if (req.body.imagen_url) {
          await sendWhatsAppImage(lista[i], req.body.imagen_url, req.body.mensaje, pid);
        } else {
          await sendWhatsAppMessage(lista[i], req.body.mensaje, pid);
        }
        enviados++;
      } catch(e) { fallidos++; }
      // 350ms entre mensajes para respetar rate limits de Meta
      if (i < lista.length - 1) await new Promise(function(r) { setTimeout(r, 350); });
    }
    console.log("[promo] ✅ Enviados: " + enviados + " | Fallidos: " + fallidos + " | Total: " + lista.length);
    res.json({ ok: true, enviados: enviados, fallidos: fallidos, total: lista.length });
  } catch (e) {
    console.error("[promo] Error:", e.message);
    res.status(500).json({ ok: false, error: e.response ? JSON.stringify(e.response.data) : e.message });
  }
});

// Cache en memoria para comprobantes — evita re-descargar de Meta cuando expira el URL
var comprobanteCache = {};

app.get("/api/comprobante/:mediaId", async function(req, res) {
  var mediaId = req.params.mediaId;
  try {
    // Servir desde cache si existe
    if (comprobanteCache[mediaId]) {
      var cached = comprobanteCache[mediaId];
      res.setHeader("Content-Type", cached.mime);
      res.setHeader("Cache-Control", "public, max-age=604800"); // 7 días
      return res.send(cached.buffer);
    }
    // Descargar de Meta
    var imgData = await descargarImagenMeta(mediaId);
    if (!imgData) return res.status(404).send("Imagen no encontrada");
    var matches = imgData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches) return res.status(500).send("Formato inválido");
    var mime = matches[1];
    var buffer = Buffer.from(matches[2], "base64");
    // Guardar en cache
    comprobanteCache[mediaId] = { mime: mime, buffer: buffer, ts: Date.now() };
    // Limpiar cache > 200 entradas
    var keys = Object.keys(comprobanteCache);
    if (keys.length > 200) {
      keys.sort(function(a,b){ return comprobanteCache[a].ts - comprobanteCache[b].ts; });
      keys.slice(0,50).forEach(function(k){ delete comprobanteCache[k]; });
    }
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.send(buffer);
  } catch(e) {
    // Si Meta expiró y tenemos cache, servir cache aunque sea vieja
    if (comprobanteCache[mediaId]) {
      var cached = comprobanteCache[mediaId];
      res.setHeader("Content-Type", cached.mime);
      return res.send(cached.buffer);
    }
    res.status(500).send("Error: " + e.message);
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// LUZ MENÚ CHAT — Asistente IA dentro del menú del cliente
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// LUZ PANEL AGENT — Asistente IA dentro del panel web del restaurante
// ═══════════════════════════════════════════════════════════════════════════
app.post("/api/luz-panel-agent", async function(req, res) {
  var { restaurante_id, mensaje, historial } = req.body;
  if(!restaurante_id||!mensaje) return res.status(400).json({ok:false,error:"Faltan datos"});
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };

    // Cargar contexto completo en paralelo — incluyendo canjes y mensajes
    var [pedidosR, clientesR, menuR, domisR, zonasR, promosR, valorR, canjesR, mensajesSinR, restInfoR] = await Promise.all([
      axios.get(SUPABASE_URL+"/rest/v1/pedidos?restaurante_id=eq."+restaurante_id+"&order=created_at.desc&limit=50&select=numero_pedido,estado,total,cliente_tel,items,metodo_pago,created_at,valoracion,domiciliario_id",{headers:h}).catch(function(){return{data:[]};}),
      // Todos los clientes — sin límite de fecha ni cantidad
      axios.get(SUPABASE_URL+"/rest/v1/clientes_frecuentes?restaurante_id=eq."+restaurante_id+"&order=total_pedidos.desc&limit=1000&select=nombre_cliente,telefono,total_pedidos,puntos,nivel_fidelidad",{headers:h}).catch(function(){return{data:[]};}),
      axios.get(SUPABASE_URL+"/rest/v1/menu_items?restaurante_id=eq."+restaurante_id+"&select=id,nombre,precio,categoria,disponible&order=categoria",{headers:h}).catch(function(){return{data:[]};}),
      axios.get(SUPABASE_URL+"/rest/v1/domiciliarios?restaurante_id=eq."+restaurante_id+"&select=id,nombre,telefono,activo",{headers:h}).catch(function(){return{data:[]};}),
      axios.get(SUPABASE_URL+"/rest/v1/zonas_domicilio?restaurante_id=eq."+restaurante_id+"&select=id,nombre,precio_domicilio",{headers:h}).catch(function(){return{data:[]};}),
      axios.get(SUPABASE_URL+"/rest/v1/promos_programadas?restaurante_id=eq."+restaurante_id+"&select=id,titulo,descripcion,dia,activa",{headers:h}).catch(function(){return{data:[]};}),
      axios.get(SUPABASE_URL+"/rest/v1/pedidos?restaurante_id=eq."+restaurante_id+"&valoracion=not.is.null&order=updated_at.desc&limit=10&select=numero_pedido,valoracion,cliente_tel,updated_at",{headers:h}).catch(function(){return{data:[]};}),
      axios.get(SUPABASE_URL+"/rest/v1/canjes?restaurante_id=eq."+restaurante_id+"&created_at=gte."+new Date(Date.now()-24*60*60*1000).toISOString()+"&order=created_at.desc&select=*",{headers:h}).catch(function(){return{data:[]};}),
      axios.get(SUPABASE_URL+"/rest/v1/mensajes?restaurante_id=eq."+restaurante_id+"&tipo=eq.alerta_pregunta&created_at=gte."+new Date(Date.now()-2*60*60*1000).toISOString()+"&order=created_at.desc&limit=10&select=telefono,mensaje,created_at",{headers:h}).catch(function(){return{data:[]};}),
      // Info del restaurante — incluyendo cupones_activos
      axios.get(SUPABASE_URL+"/rest/v1/restaurantes?id=eq."+restaurante_id+"&select=nombre,cupones_activos,whatsapp_phone_id",{headers:h}).catch(function(){return{data:[]};})
    ]);

    var pedidos = pedidosR.data||[];
    var clientes = clientesR.data||[];
    var menu = menuR.data||[];
    var domis = domisR.data||[];
    var zonas = zonasR.data||[];
    var promos = promosR.data||[];
    var valoraciones = valorR.data||[];
    var canjes = canjesR.data||[];
    var mensajesSin = mensajesSinR.data||[];
    var restInfoData = (restInfoR.data||[])[0]||{};
    // Cupones activos del restaurante
    var cuponesActivos = [];
    try{ cuponesActivos = JSON.parse(restInfoData.cupones_activos||"[]"); }catch(e){}
    var cuponesActivosStr = cuponesActivos.filter(function(c){return c.activo;}).map(function(c){
      return "✅ "+c.codigo+" — "+(c.tipo==="porcentaje"?c.valor+"%":"$"+Number(c.valor).toLocaleString("es-CO"))+" descuento | Usos: "+c.usos_actual+"/"+c.usos_max;
    }).join("\n")||"Sin cupones activos";
    var cuponesInactivosStr = cuponesActivos.filter(function(c){return !c.activo;}).map(function(c){
      return "❌ "+c.codigo+" (inactivo)";
    }).join(", ")||"";

    // Pedidos de hoy en Colombia
    var pedidosHoy = pedidos.filter(function(p){return p.created_at >= getMedionocheColombiaISO();});
    var ventasHoy = pedidosHoy.filter(function(p){return p.estado!=="cancelado";}).reduce(function(s,p){return s+Number(p.total||0);},0);
    var porMetodo = {};
    pedidosHoy.forEach(function(p){porMetodo[p.metodo_pago]=(porMetodo[p.metodo_pago]||0)+Number(p.total||0);});
    var valorProm = valoraciones.length ? (valoraciones.reduce(function(s,v){return s+Number(v.valoracion||0);},0)/valoraciones.length).toFixed(1) : "N/A";
    // Top productos
    var prodCount = {};
    pedidosHoy.forEach(function(p){
      try{var its=Array.isArray(p.items)?p.items:JSON.parse(p.items||"[]");
        its.forEach(function(i){var n=typeof i==="string"?i.replace(/^\d+[xX]\s*/,""):i.nombre;if(n)prodCount[n]=(prodCount[n]||0)+1;});}catch(e){}
    });
    var topProds = Object.entries(prodCount).sort(function(a,b){return b[1]-a[1];}).slice(0,5);

    var systemPrompt = `Eres LUZ, la asistente ejecutiva IA del restaurante "${pedidos[0]?.restaurante_id ? "La Curva Street Food" : ""}". Eres inteligente, proactiva, directa y hablas como una persona real — no como un bot.

DATOS EN TIEMPO REAL (${getHoraColombia().toLocaleString("es-CO")}):

📊 VENTAS:
- Hoy: $${ventasHoy.toLocaleString("es-CO")} | Pedidos: ${pedidosHoy.length}
- Efectivo: $${(porMetodo.efectivo||0).toLocaleString("es-CO")} | Nequi: $${(porMetodo.nequi||0).toLocaleString("es-CO")} | Bancolombia: $${(porMetodo.bancolombia||0).toLocaleString("es-CO")}
- Top productos hoy: ${topProds.map(function(p){return p[0]+"(×"+p[1]+")";}).join(", ")||"Sin pedidos aún"}
- Valoración promedio: ${valorProm}/5

📦 ESTADO ACTUAL:
- Pedidos activos ahora: ${pedidos.filter(function(p){return["confirmado","en_preparacion","listo","en_camino"].indexOf(p.estado)!==-1;}).length}
- Últimos pedidos: ${pedidos.slice(0,5).map(function(p){return "#"+p.numero_pedido+" "+p.estado+" $"+Number(p.total||0).toLocaleString("es-CO");}).join(" | ")}

⭐ CANJES (últimas 24h):
${canjes.length>0 ? canjes.map(function(c){return "- "+c.telefono+" canjeó "+c.producto_nombre+" ("+c.puntos_usados+" pts) · Estado: "+c.estado+" · "+(c.created_at?new Date(c.created_at).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}):"");}).join("\n") : "Sin canjes en las últimas 24 horas"}

⚠️ ALERTAS SIN RESOLVER:
${mensajesSin.length>0 ? mensajesSin.map(function(m){
  var mins=Math.floor((Date.now()-new Date(m.created_at))/60000);
  var urgencia=mins>60?"🔴 URGENTE ("+mins+"min sin atender)":mins>20?"🟡 "+mins+"min":"🟢 "+mins+"min";
  return urgencia+" | "+m.telefono+": \""+m.mensaje+"\"";
}).join("\n") : "✅ Sin alertas pendientes"}

👥 CLIENTES:
- Total registrados: ${clientes.length}
- Top 5: ${clientes.slice(0,5).map(function(c){return (c.nombre_cliente||c.telefono)+"("+c.total_pedidos+"ped, "+c.puntos+"pts)";}).join(" | ")}

🎟️ CUPONES ACTIVOS:
${cuponesActivosStr}
${cuponesInactivosStr ? "Inactivos: "+cuponesInactivosStr : ""}

🍔 MENÚ: ${menu.length} productos | ${menu.filter(function(p){return p.disponible===false;}).length} desactivados
📣 PROMOS: ${promos.filter(function(p){return p.activa;}).length} activas — ${promos.map(function(p){return p.titulo+(p.activa?" ✅":" ❌");}).join(", ")||"Ninguna"}
🛵 DOMIS: ${domis.map(function(d){return d.nombre+(d.activo?" ✅":" ❌");}).join(", ")||"Ninguno registrado"}
🗺️ ZONAS: ${zonas.map(function(z){return z.nombre+"($"+Number(z.precio_domicilio).toLocaleString("es-CO")+")";}).join(", ")||"Sin zonas"}

IDs PARA ACCIONES:
Menú: ${menu.slice(0,8).map(function(p){return p.nombre+"="+p.id;}).join(" | ")}
Promos: ${promos.map(function(p){return p.titulo+"="+p.id;}).join(" | ")}
Zonas: ${zonas.map(function(z){return z.nombre+"="+z.id;}).join(" | ")}

ACCIONES DISPONIBLES:
ACTION:CREAR_ZONA:{"nombre":"...","precio":0,"barrios":"b1,b2"}
ACTION:CREAR_PROMO:{"titulo":"...","descripcion":"...","dia":"lunes|todos","activa":true}
ACTION:ACTIVAR_PROMO:{"promo_id":"...","activa":true}
ACTION:CREAR_DOMI:{"nombre":"...","telefono":"..."}
ACTION:ACTUALIZAR_PRECIO:{"producto_id":"...","precio":0}
ACTION:TOGGLE_PRODUCTO:{"producto_id":"...","disponible":true}
ACTION:CREAR_CUPON:{"codigo":"NOMBRE20","descuento":20,"tipo":"porcentaje","usos":100}
ACTION:ENVIAR_PROMO_MASIVA:{"mensaje":"texto"}
ACTION:ENVIAR_MENSAJE_CLIENTE:{"telefono":"...","mensaje":"..."}
ACTION:MODIFICAR_PEDIDO:{"pedido_id":"uuid","numero":134,"estado":"listo"}
ACTION:SILENCIAR_CLIENTE:{"telefono":"..."}

CÓMO DEBES COMPORTARTE:
1. SIEMPRE di lo que ves en los datos reales — si hay canjes, dilo. Si hay alertas, dilo. No inventes.
2. Sé PROACTIVA — si ves algo que mejorar, dilo sin que te pregunten. Por ejemplo:
   - Si hay pocas promos activas → sugiere crear una para aumentar ventas
   - Si hay clientes con muchos puntos sin canjear → sugiere contactarlos
   - Si las valoraciones bajaron → sugiere qué hacer
   - Si un producto no se ha pedido hoy → sugiere activar una promo para él
3. HABLA como persona real, colombiana, directa. Usa frases como "mira", "te cuento", "la verdad es que"
4. RESPUESTAS COMPLETAS — no te cortes. Da el análisis completo, las recomendaciones y las acciones.
5. Si ejecutas una acción, confirma exactamente qué hiciste.
6. Formatea con **negritas** para los datos importantes.`;


    var messages = (historial||[]).slice(-14).map(function(m){return{role:m.role,content:m.content};});
    messages.push({role:"user",content:mensaje});

    var claudeR = await axios.post("https://api.anthropic.com/v1/messages",{
      model:"claude-sonnet-4-20250514",max_tokens:800,
      system:systemPrompt,messages:messages
    },{headers:{"x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01","Content-Type":"application/json"}});

    var respuestaRaw = claudeR.data.content[0].text||"";
    var respuesta = respuestaRaw;
    var accionesEjecutadas = [];

    // Ejecutar acciones — mismo patrón que el agente WhatsApp
    var acciones = [
      {re:/ACTION:CREAR_ZONA:(\{[^}]+\})/,fn:async function(d){
        await axios.post(SUPABASE_URL+"/rest/v1/zonas_domicilio",
          {restaurante_id,nombre:d.nombre,precio_domicilio:Number(d.precio),barrios:d.barrios?d.barrios.split(",").map(function(b){return b.trim();}):[]},
          {headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        return "✅ Zona '"+d.nombre+"' creada ($"+Number(d.precio).toLocaleString("es-CO")+")";
      }},
      {re:/ACTION:CREAR_PROMO:(\{[^}]+\})/,fn:async function(d){
        await axios.post(SUPABASE_URL+"/rest/v1/promos_programadas",
          {restaurante_id,titulo:d.titulo,descripcion:d.descripcion,dia:d.dia||"todos",activa:true},
          {headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        return "✅ Promo '"+d.titulo+"' creada para "+d.dia;
      }},
      {re:/ACTION:CREAR_DOMI:(\{[^}]+\})/,fn:async function(d){
        await axios.post(SUPABASE_URL+"/rest/v1/domiciliarios",
          {restaurante_id,nombre:d.nombre,telefono:d.telefono,activo:true},
          {headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        return "✅ Domiciliario "+d.nombre+" registrado";
      }},
      {re:/ACTION:ACTUALIZAR_PRECIO:(\{[^}]+\})/,fn:async function(d){
        await axios.patch(SUPABASE_URL+"/rest/v1/menu_items?id=eq."+d.producto_id,
          {precio:Number(d.precio)},{headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        menuCache={};
        return "✅ Precio actualizado a $"+Number(d.precio).toLocaleString("es-CO");
      }},
      {re:/ACTION:TOGGLE_PRODUCTO:(\{[^}]+\})/,fn:async function(d){
        await axios.patch(SUPABASE_URL+"/rest/v1/menu_items?id=eq."+d.producto_id,
          {disponible:d.disponible},{headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        menuCache={};
        return "✅ Producto "+(d.disponible?"activado":"desactivado");
      }},
      {re:/ACTION:ACTIVAR_PROMO:(\{[^}]+\})/,fn:async function(d){
        await axios.patch(SUPABASE_URL+"/rest/v1/promos_programadas?id=eq."+d.promo_id,
          {activa:d.activa},{headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        return "✅ Promo "+(d.activa?"activada":"desactivada");
      }},
      {re:/ACTION:CREAR_CUPON:(\{[^}]+\})/,fn:async function(d){
        // Los cupones se guardan en restaurante.cupones_activos como JSON array
        var restR2=await axios.get(SUPABASE_URL+"/rest/v1/restaurantes?id=eq."+restaurante_id+"&select=cupones_activos",{headers:h});
        var restData=restR2.data&&restR2.data[0]?restR2.data[0]:{};
        var cups=[];
        try{cups=JSON.parse(restData.cupones_activos||"[]");}catch(e){}
        var nuevoCupon={id:Date.now(),codigo:(d.codigo||"CUPON"+Date.now()).toUpperCase(),valor:Number(d.descuento||10),tipo:d.tipo||"porcentaje",usos_max:Number(d.usos||100),usos_actual:0,activo:true,descripcion:d.descripcion||""};
        cups.push(nuevoCupon);
        await axios.patch(SUPABASE_URL+"/rest/v1/restaurantes?id=eq."+restaurante_id,
          {cupones_activos:JSON.stringify(cups)},
          {headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        return "✅ Cupón "+nuevoCupon.codigo+" creado ("+d.descuento+"% descuento) — ya aparece en la pestaña Cupones";
      }},
      {re:/ACTION:ENVIAR_PROMO_MASIVA:(\{[^}]+\})/,fn:async function(d){
        // Cargar TODOS los clientes — sin límite
        var allClis=[];var offset=0;var pageSize=1000;
        while(true){
          var cliR2=await axios.get(SUPABASE_URL+"/rest/v1/clientes_frecuentes?restaurante_id=eq."+restaurante_id+"&select=telefono&offset="+offset+"&limit="+pageSize,{headers:h});
          var page=cliR2.data||[];
          allClis=allClis.concat(page);
          if(page.length<pageSize)break;
          offset+=pageSize;
        }
        // Usar phone_id del restaurante directamente
        var restR3=await axios.get(SUPABASE_URL+"/rest/v1/restaurantes?id=eq."+restaurante_id+"&select=whatsapp_phone_id",{headers:h});
        var phoneId=(restR3.data&&restR3.data[0])?restR3.data[0].whatsapp_phone_id:process.env.WHATSAPP_PHONE_ID;
        var tels=allClis.map(function(c){return "57"+stripCountryCode(c.telefono);}).filter(function(t){return t.length>=12;});
        var enviados=0;var fallidos=0;
        for(var i=0;i<tels.length;i++){
          try{await sendWhatsAppMessage(tels[i],d.mensaje,phoneId);enviados++;}catch(e){fallidos++;}
          if(i<tels.length-1)await new Promise(function(r){setTimeout(r,400);});
        }
        return "✅ Promo enviada a "+enviados+" clientes"+(fallidos>0?" ("+fallidos+" fallidos)":"")+" de "+tels.length+" en total";
      }},
      {re:/ACTION:MODIFICAR_PEDIDO:(\{[^}]+\})/,fn:async function(d){
        var patch={updated_at:new Date().toISOString()};
        if(d.estado)patch.estado=d.estado;
        if(d.notas)patch.notas_especiales=d.notas;
        if(d.domiciliario_id)patch.domiciliario_id=d.domiciliario_id;
        await axios.patch(SUPABASE_URL+"/rest/v1/pedidos?id=eq."+d.pedido_id,patch,
          {headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        return "✅ Pedido #"+d.numero+" actualizado";
      }},
      {re:/ACTION:SILENCIAR_CLIENTE:(\{[^}]+\})/,fn:async function(d){
        await axios.post(SUPABASE_URL+"/rest/v1/silencio_conversacion",
          {restaurante_id,telefono:d.telefono,activo:true},
          {headers:{...h,"Content-Type":"application/json","Prefer":"return=minimal"}});
        return "✅ Conversación con "+d.telefono+" silenciada";
      }},
      {re:/ACTION:ENVIAR_MENSAJE_CLIENTE:(\{[^}]+\})/,fn:async function(d){
        var restInfo=await getRestaurante(null);
        var phoneId=restInfo?restInfo.whatsapp_phone_id:process.env.WHATSAPP_PHONE_ID;
        await sendWhatsAppMessage("57"+stripCountryCode(d.telefono),d.mensaje,phoneId);
        return "✅ Mensaje enviado al "+d.telefono;
      }}
    ];

    for(var accion of acciones){
      var match=respuestaRaw.match(accion.re);
      if(match){
        try{
          var datos=JSON.parse(match[1]);
          var resultado=await accion.fn(datos);
          accionesEjecutadas.push(resultado);
        }catch(eA){accionesEjecutadas.push("❌ Error: "+eA.message);}
        respuesta=respuesta.replace(accion.re,"").trim();
      }
    }

    // Determinar qué tab recargar
    var reloadTab = null;
    if(accionesEjecutadas.some(function(a){return a.includes("Zona")||a.includes("zona");})) reloadTab="config";
    if(accionesEjecutadas.some(function(a){return a.includes("Promo")||a.includes("promo");})) reloadTab="promo";
    if(accionesEjecutadas.some(function(a){return a.includes("Cupón")||a.includes("cupon");})) reloadTab="cupones";
    if(accionesEjecutadas.some(function(a){return a.includes("Domiciliario")||a.includes("domi");})) reloadTab="domis";
    if(accionesEjecutadas.some(function(a){return a.includes("precio")||a.includes("Producto")||a.includes("producto");})) reloadTab="menu";
    if(accionesEjecutadas.some(function(a){return a.includes("Pedido")||a.includes("pedido");})) reloadTab="pedidos";

    console.log("[luz-panel] '"+mensaje.substring(0,40)+"' | acciones: "+accionesEjecutadas.length+(reloadTab?" | reload: "+reloadTab:""));
    res.json({ok:true,respuesta:respuesta.trim(),acciones_ejecutadas:accionesEjecutadas,reload_tab:reloadTab});
  }catch(e){
    console.error("[luz-panel]",e.response?JSON.stringify(e.response.data):e.message);
    res.json({ok:true,respuesta:"Tuve un problema técnico. Intenta de nuevo en un momento.",acciones_ejecutadas:[]});
  }
});

app.post("/api/luz-menu-chat", async function(req, res) {
  var { restaurante_id, mensaje, telefono, historial, pedido_activo } = req.body;
  if (!restaurante_id || !mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };

    // ── CARGAR TODO DESDE LA DB EN PARALELO ────────────────────────────────
    var [restR, promosR, aprendR, cliR] = await Promise.all([
      // Info del restaurante
      axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id +
        "&select=nombre,horario_apertura,horario_cierre,domicilio_base,metodo_pago_nequi,metodo_pago_banco,metodo_pago_nombre",
        { headers: h }).catch(function(){ return { data: [] }; }),
      // Promos activas hoy
      axios.get(SUPABASE_URL + "/rest/v1/promos_programadas?restaurante_id=eq." + restaurante_id +
        "&activa=eq.true&select=titulo,descripcion,dia,descuento",
        { headers: h }).catch(function(){ return { data: [] }; }),
      // Aprendizajes del cerebro de Luz
      axios.get(SUPABASE_URL + "/rest/v1/luz_aprendizajes?restaurante_id=eq." + restaurante_id +
        "&activo=eq.true&select=contenido,tipo",
        { headers: h }).catch(function(){ return { data: [] }; }),
      // Datos del cliente si tiene teléfono
      telefono ? axios.get(SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restaurante_id +
        "&telefono=eq." + encodeURIComponent(stripCountryCode(telefono)) + "&select=nombre_cliente,puntos,nivel_fidelidad,total_pedidos",
        { headers: h }).catch(function(){ return { data: [] }; }) : Promise.resolve({ data: [] })
    ]);

    // Cargar menú usando la función que ya funciona para WhatsApp
    var menuTextoWhatsApp = await getMenuDinamico(restaurante_id);
    var menuItemsEstructurado = [];
    try {
      var menuRaw = await axios.get(
        SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restaurante_id +
        "&order=categoria,orden&select=id,nombre,precio,descripcion,categoria",
        { headers: sbH(false) }
      );
      menuItemsEstructurado = (menuRaw.data || []).filter(function(p){ return p.disponible !== false; });
    } catch(eM){ console.error("[luz-agente] menu estructurado:", eM.message); }

    var restInfo = (restR.data || [])[0] || {};
    var promos = promosR.data || [];
    var aprendizajes = (aprendR.data || []).map(function(a){ return "["+a.tipo+"] "+a.contenido; }).join("\n");
    var cliente = (cliR.data || [])[0] || null;
    var diaHoy = getDiaColombiaStr();
    // Para acciones estructuradas (chips de agregar)
    var menuItems = menuItemsEstructurado;
    console.log("[luz-agente] menú whatsapp: "+(menuTextoWhatsApp.length)+"chars | items: "+menuItems.length+" | rest: "+(restInfo.nombre||"?"));

    // Filtrar promos del día
    var promosHoy = promos.filter(function(p){
      return !p.dia || p.dia === "todos" || p.dia === diaHoy;
    });

    // System prompt de Luz — agente real
    var systemPrompt = `Eres LUZ, la asistente de IA de "${restInfo.nombre || "el restaurante"}". Eres joven, carismática, eficiente y hablas como una persona real en español colombiano — tuteo natural, sin sonar a robot ni a formal.

INFORMACIÓN DEL RESTAURANTE:
- Nombre: ${restInfo.nombre || ""}
- Domicilio base (mínimo): $${Number(restInfo.domicilio_base||0).toLocaleString("es-CO")}
- Pagos: Nequi ${restInfo.metodo_pago_nequi||""}, Bancolombia ${restInfo.metodo_pago_banco||""}, titular: ${restInfo.metodo_pago_nombre||""}

REGLA DOMICILIO — MUY IMPORTANTE:
- Si el cliente da su barrio y está en una zona: cobra el precio de esa zona.
- Si el cliente NO da barrio o el barrio NO está en ninguna zona: cobra el domicilio base de $${Number(restInfo.domicilio_base||0).toLocaleString("es-CO")} y dile "El domicilio son $${Number(restInfo.domicilio_base||0).toLocaleString("es-CO")} para tu zona".
- NUNCA cierres un pedido con domicilio $0 si es a domicilio. Si no sabes el barrio, usa el mínimo.
- NUNCA asumas que el domicilio es gratis.

CLIENTE ACTUAL:
${cliente ? `- Nombre: ${cliente.nombre_cliente || ""}
- Puntos: ${cliente.puntos || 0} puntos (nivel ${cliente.nivel_fidelidad || "bronce"})
- Pedidos totales: ${cliente.total_pedidos || 0}` : "- Cliente nuevo o sin historial"}

${pedido_activo ? `⚠️ IMPORTANTE — ${pedido_activo}
El cliente YA tiene un pedido activo. NO le pidas datos de nuevo (dirección, teléfono, nombre). 
Si quiere agregar algo, dile que puede usar el campo de notas o que se lo comunique al restaurante.` : ""}

PROMOS DE HOY (${diaHoy}):
${promosHoy.length ? promosHoy.map(function(p){ return "🔥 "+p.titulo+": "+p.descripcion+(p.descuento?" ("+p.descuento+"% off)":""); }).join("\n") : "Sin promos especiales hoy"}

MENÚ COMPLETO DISPONIBLE:
${menuTextoWhatsApp}

CONOCIMIENTO ADICIONAL (aprendido por Luz):
${aprendizajes || "Sin notas adicionales"}

HORA ACTUAL: ${getHoraColombia().toLocaleTimeString("es-CO")}

═══ CÓMO DEBES COMPORTARTE ═══

1. PERSONALIZACIÓN Y NOTAS:
Cuando el cliente pida algo especial (sin cebolla, extra queso, bien cocido, salsa aparte, sin tomate) dile SIEMPRE: "Escríbelo en el campo de Notas al confirmar el pedido, por ejemplo: sin cebolla, extra queso. El cocinero lo lee antes de preparar."

2. RECOMENDAR PRODUCTOS:
Cuando recomiendes un producto usa EXACTAMENTE este formato al final de tu respuesta:
ACTION:ADD_PRODUCT:{"id":"PRODUCT_ID","nombre":"NOMBRE EXACTO","precio":PRECIO}
(Usa el ID y nombre EXACTO del menú. Puedes recomendar hasta 3 productos.)

3. NOTIFICAR AL PANEL cuando sea importante:
ACTION:NOTIFY_PANEL:{"motivo":"descripción corta"}
Usa esto para: alergias, quejas, pedidos especiales, cliente frustrado. NO para preguntas normales.

4. ESTILO:
- Respuestas de 2-3 líneas máximo. Directa y cálida.
- Habla como una persona real, no como un bot
- Si el cliente ya tiene puntos suficientes dile que puede canjear
- Si hay promo hoy, menciónala de forma natural en la conversación
- Termina siempre con una pregunta o acción concreta`;

    // Construir historial
    var messages = [];
    if (historial && Array.isArray(historial)) {
      historial.slice(-10).forEach(function(m){
        messages.push({ role: m.rol === "luz" ? "assistant" : "user", content: m.texto });
      });
    }
    messages.push({ role: "user", content: mensaje });

    // Llamar a Claude Sonnet (más inteligente para este rol)
    var claudeR = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      system: systemPrompt,
      messages: messages
    }, {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      }
    });

    var respuestaRaw = claudeR.data.content[0].text || "";

    // ── PROCESAR ACCIONES ───────────────────────────────────────────────────
    var productosAgregar = [];
    var notificaciones = [];
    var respuesta = respuestaRaw;

    // Extraer ACTION:ADD_PRODUCT
    var reAddProd = /ACTION:ADD_PRODUCT:(\{[^}]+\})/gi;
    var matchProd;
    while ((matchProd = reAddProd.exec(respuestaRaw)) !== null) {
      try {
        var prodData = JSON.parse(matchProd[1]);
        // Buscar el producto en el menú real para obtener datos completos
        var prodReal = menuItems.find(function(p){
          return p.id === prodData.id ||
            (p.nombre && p.nombre.toLowerCase() === (prodData.nombre||"").toLowerCase());
        });
        if (prodReal) {
          productosAgregar.push({
            id: prodReal.id,
            nombre: prodReal.nombre,
            precio: Number(prodReal.precio),
            descripcion: prodReal.descripcion || "",
            categoria: prodReal.categoria || ""
          });
        }
      } catch(ep) {}
    }
    respuesta = respuesta.replace(/ACTION:ADD_PRODUCT:\{[^}]+\}/gi, "").trim();

    // Extraer ACTION:NOTIFY_PANEL
    var reNotif = /ACTION:NOTIFY_PANEL:(\{[^}]+\})/gi;
    var matchNotif;
    while ((matchNotif = reNotif.exec(respuestaRaw)) !== null) {
      try {
        var notifData = JSON.parse(matchNotif[1]);
        notificaciones.push(notifData.motivo || "Alerta del menú");
      } catch(en) {}
    }
    respuesta = respuesta.replace(/ACTION:NOTIFY_PANEL:\{[^}]+\}/gi, "").trim();

    // Guardar notificaciones al panel
    for (var notif of notificaciones) {
      if (telefono) {
        await guardarMensajeSupabase(restaurante_id, stripCountryCode(telefono),
          "🤖 LUZ MENÚ: " + notif + " — cliente: " + (telefono||"anónimo") + " — dijo: \"" + mensaje.substring(0,80) + "\"",
          "alerta_pregunta", null
        ).catch(function(){});
      }
      console.log("[luz-agente] 📢 Panel notificado:", notif);
    }

    // Limpiar respuesta final
    respuesta = respuesta
      .replace(/\s{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    console.log("[luz-agente] " + (telefono||"anon") + " → '" + mensaje.substring(0,40) +
      "' | productos: " + productosAgregar.length + " | notifs: " + notificaciones.length);

    res.json({
      ok: true,
      respuesta: respuesta,
      productos: productosAgregar,      // array completo con id, nombre, precio
      notificado: notificaciones.length > 0
    });

  } catch(e) {
    console.error("[luz-agente] Error:", e.response ? JSON.stringify(e.response.data) : e.message);
    res.json({ ok: true, respuesta: "Uy, tuve un momentico de falla. Escríbenos por WhatsApp y te ayudamos enseguida 😊", productos: [] });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COCINA — Endpoints dedicados
// ═══════════════════════════════════════════════════════════════════════════
app.get("/api/domi-login", async function(req, res) {
  var {restaurante_id, telefono, nombre} = req.query;
  if(!restaurante_id) return res.status(400).json({error:"Falta restaurante_id"});
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = {"apikey":svcKey,"Authorization":"Bearer "+svcKey};
    var url;
    if(nombre) {
      // Buscar por nombre (case-insensitive)
      url = SUPABASE_URL+"/rest/v1/domiciliarios?restaurante_id=eq."+restaurante_id+
        "&nombre=ilike."+encodeURIComponent("%"+nombre.trim()+"%")+"&select=*";
    } else if(telefono) {
      var tel10 = telefono.replace(/^57/,"");
      var tel12 = "57"+tel10;
      url = SUPABASE_URL+"/rest/v1/domiciliarios?restaurante_id=eq."+restaurante_id+
        "&or=(telefono.eq."+encodeURIComponent(tel10)+",telefono.eq."+encodeURIComponent(tel12)+",telefono.eq."+encodeURIComponent(telefono)+")&select=*";
    } else {
      return res.status(400).json({error:"Falta nombre o teléfono"});
    }
    var r = await axios.get(url, {headers:h});
    res.json(r.data||[]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/domi-pedido-activo", async function(req, res) {
  var {restaurante_id, domiciliario_id, telefono} = req.query;
  if(!restaurante_id) return res.status(400).json({error:"Falta restaurante_id"});
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = {"apikey":svcKey,"Authorization":"Bearer "+svcKey};
    // Buscar por domiciliario_id
    var r = await axios.get(
      SUPABASE_URL+"/rest/v1/pedidos?restaurante_id=eq."+restaurante_id+
      "&domiciliario_id=eq."+encodeURIComponent(domiciliario_id)+
      "&estado=in.(listo,en_camino)&order=created_at.desc&limit=1&select=*",
      {headers:h}
    );
    if(r.data&&r.data.length>0) return res.json(r.data[0]);
    res.json(null);
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/domi-historial", async function(req, res) {
  var {restaurante_id, domiciliario_id} = req.query;
  if(!restaurante_id||!domiciliario_id) return res.status(400).json({error:"Faltan datos"});
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = {"apikey":svcKey,"Authorization":"Bearer "+svcKey};
    var hace8h = new Date(Date.now()-8*60*60*1000).toISOString();
    var r = await axios.get(
      SUPABASE_URL+"/rest/v1/pedidos?restaurante_id=eq."+restaurante_id+
      "&domiciliario_id=eq."+encodeURIComponent(domiciliario_id)+
      "&estado=eq.entregado&created_at=gte."+hace8h+
      "&order=created_at.desc&limit=15&select=numero_pedido,total,direccion,created_at",
      {headers:h}
    );
    res.json(r.data||[]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/cocina-pedidos", async function(req, res) {
  var restaurante_id = req.query.restaurante_id;
  if(!restaurante_id) return res.status(400).json({error:"Falta restaurante_id"});
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = {"apikey":svcKey,"Authorization":"Bearer "+svcKey};
    // Solo pedidos de las últimas 18 horas — evita mostrar pedidos viejos atascados
    var hace18h = new Date(Date.now() - 18*60*60*1000).toISOString();
    var r = await axios.get(
      SUPABASE_URL+"/rest/v1/pedidos?restaurante_id=eq."+restaurante_id+
      "&estado=in.(confirmado,en_preparacion,listo)"+
      "&created_at=gte."+hace18h+
      "&order=created_at.asc&select=*",
      {headers:h}
    );
    res.json(r.data||[]);
  } catch(e) {
    console.error("[cocina-pedidos]",e.message);
    res.status(500).json({error:e.message});
  }
});

app.get("/api/cocina-stats", async function(req, res) {
  var restaurante_id = req.query.restaurante_id;
  if(!restaurante_id) return res.status(400).json({error:"Falta restaurante_id"});
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = {"apikey":svcKey,"Authorization":"Bearer "+svcKey};
    // Medianoche en Colombia (UTC-5)
    var hoy = new Date();
    hoy.setUTCHours(5, 0, 0, 0); // 00:00 Colombia = 05:00 UTC
    if(new Date().getUTCHours() < 5) hoy.setUTCDate(hoy.getUTCDate() - 1); // si es antes de 5am UTC, es ayer en Colombia
    var r = await axios.get(
      SUPABASE_URL+"/rest/v1/pedidos?restaurante_id=eq."+restaurante_id+
      "&created_at=gte."+hoy.toISOString()+"&select=total,tipo_pedido,direccion,estado",
      {headers:h}
    );
    var data = r.data||[];
    // Solo contar pedidos que no son cancelados
    var validos = data.filter(function(p){return p.estado!=="cancelado";});
    var domis = validos.filter(function(p){return (p.direccion||"").toUpperCase().indexOf("MESA")===-1&&p.tipo_pedido!=="recoger";}).length;
    var mesas = validos.filter(function(p){return (p.direccion||"").toUpperCase().indexOf("MESA")!==-1;}).length;
    var recoger = validos.filter(function(p){return p.tipo_pedido==="recoger";}).length;
    res.json({ok:true,total:validos.length,domis:domis,mesas:mesas,recoger:recoger});
  } catch(e) {
    res.status(500).json({error:e.message});
  }
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
    // Normalizar categoria_slug en el servidor
    var items = (r.data || []).map(function(item) {
      return Object.assign({}, item, {
        categoria_slug: (item.categoria || "").toLowerCase().trim()
          .normalize("NFD").replace(/[̀-ͯ]/g, "")
      });
    });
    res.json(items);
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
    // Invalidar cache del menú para que Luz lea los cambios inmediatamente
    if (req.body.restaurante_id) delete menuCache[req.body.restaurante_id];
    else { menuCache = {}; } // si no viene restaurante_id, limpiar todo
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// Endpoint: productos destacados (Top vendidos + manuales)
// Devuelve hasta 3 top automáticos + hasta 2 manuales
// ═══════════════════════════════════════════════════════════
app.get("/api/destacados", async function(req, res) {
  if (!req.query.restaurante_id) return res.json({ top_vendidos: [], manuales: [] });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var restId = req.query.restaurante_id;

    // 1. Obtener top vendidos (máx 3)
    var topP = axios.get(
      SUPABASE_URL + "/rest/v1/v_productos_top_vendidos?restaurante_id=eq." + restId + "&limit=3&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    ).catch(function(e) { 
      console.warn("[destacados] vista no disponible:", e.message);
      return { data: [] }; 
    });

    // 2. Obtener destacados manuales (máx 2, excluyendo los que ya están en top)
    var manP = axios.get(
      SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restId +
      "&es_destacado=eq.true&disponible=eq.true&order=orden_destacado.asc&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );

    var results = await Promise.all([topP, manP]);
    var topVendidos = results[0].data || [];
    var manualesTodos = results[1].data || [];

    // IDs ya en top para filtrar de manuales
    var idsEnTop = topVendidos.map(function(t) { return t.id; });
    var manuales = manualesTodos
      .filter(function(m) { return idsEnTop.indexOf(m.id) === -1; })
      .slice(0, 2);

    res.json({
      top_vendidos: topVendidos,
      manuales: manuales
    });
  } catch(e) {
    console.error("[destacados] error:", e.message);
    res.json({ top_vendidos: [], manuales: [] });
  }
});

// ═══════════════════════════════════════════════════════════
// Endpoint: productos "Clásicas" (tradicionales editables)
// Devuelve todos los productos de la categoría "Clásicas de La Curva"
// ═══════════════════════════════════════════════════════════
app.get("/api/clasicas", async function(req, res) {
  if (!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    // Search both possible category names
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + req.query.restaurante_id +
      "&or=(categoria.eq.Hamburguesas%20Tradicionales,categoria.eq.Cl%C3%A1sicas%20de%20La%20Curva)" +
      "&disponible=eq.true&order=orden_destacado.asc,precio.asc&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch(e) {
    console.error("[clasicas] error:", e.message);
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════
// LUZ AUTO-LEARNING API
// ═══════════════════════════════════════════════════════════
app.get("/api/aprendizajes", async function(req, res) {
  if (!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/luz_aprendizajes?restaurante_id=eq." + req.query.restaurante_id +
      "&order=created_at.desc&limit=100&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch (e) { res.json([]); }
});

app.post("/api/aprendizajes", async function(req, res) {
  if (!req.body.restaurante_id || !req.body.contenido) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/luz_aprendizajes",
      { restaurante_id: req.body.restaurante_id, tipo: req.body.tipo || "regla_negocio", contenido: req.body.contenido, fuente: req.body.fuente || "admin", activo: true },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    delete aprendizajesCache[req.body.restaurante_id];
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.patch("/api/aprendizajes/:id", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var patch = {};
    if (req.body.contenido !== undefined) patch.contenido = req.body.contenido;
    if (req.body.activo !== undefined) patch.activo = req.body.activo;
    if (req.body.tipo !== undefined) patch.tipo = req.body.tipo;
    await axios.patch(SUPABASE_URL + "/rest/v1/luz_aprendizajes?id=eq." + req.params.id, patch,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    if (req.body.restaurante_id) delete aprendizajesCache[req.body.restaurante_id];
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete("/api/aprendizajes/:id", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.delete(SUPABASE_URL + "/rest/v1/luz_aprendizajes?id=eq." + req.params.id,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// ZONAS CRUD API (editar barrios y precios inline)
// ═══════════════════════════════════════════════════════════
app.get("/api/zonas", async function(req, res) {
  if (!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/zonas_domicilio?restaurante_id=eq." + req.query.restaurante_id +
      "&order=precio_domicilio.asc&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch (e) { res.json([]); }
});

app.patch("/api/zonas/:id", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var patch = {};
    if (req.body.nombre !== undefined) patch.nombre = req.body.nombre;
    if (req.body.precio_domicilio !== undefined) patch.precio_domicilio = Number(req.body.precio_domicilio);
    if (req.body.barrios !== undefined) {
      // Normalizar barrios: puede llegar como string "A, B, C" o array
      if (Array.isArray(req.body.barrios)) {
        patch.barrios = req.body.barrios;
      } else if (typeof req.body.barrios === "string") {
        patch.barrios = req.body.barrios.split(",").map(function(b) { return b.trim(); }).filter(Boolean);
      }
    }
    if (req.body.color !== undefined) patch.color = req.body.color;
    await axios.patch(SUPABASE_URL + "/rest/v1/zonas_domicilio?id=eq." + req.params.id, patch,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// CANJE DE PUNTOS API
// Tabla: productos_canje (restaurante_id, nombre, descripcion, emoji, puntos_requeridos, activo, stock)
// ═══════════════════════════════════════════════════════════
app.get("/api/productos-canje", async function(req, res) {
  if (!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/productos_canje?restaurante_id=eq." + req.query.restaurante_id +
      "&activo=eq.true&order=puntos_requeridos.asc&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch (e) { res.json([]); }
});

app.post("/api/productos-canje", async function(req, res) {
  if (!req.body.restaurante_id || !req.body.nombre || !req.body.puntos_requeridos) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(SUPABASE_URL + "/rest/v1/productos_canje",
      { restaurante_id: req.body.restaurante_id, nombre: req.body.nombre, descripcion: req.body.descripcion || null, emoji: req.body.emoji || "🎁", puntos_requeridos: Number(req.body.puntos_requeridos), activo: true, stock: req.body.stock || null },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete("/api/productos-canje/:id", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.delete(SUPABASE_URL + "/rest/v1/productos_canje?id=eq." + req.params.id,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── PANEL CLIENTES — ranking, historial canjes, ajuste puntos ─────────────────
app.get("/api/clientes-ranking", async function(req, res) {
  var restaurante_id = req.query.restaurante_id;
  if (!restaurante_id) return res.status(400).json({ error: "Falta restaurante_id" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restaurante_id +
      "&order=puntos.desc&limit=200&select=id,telefono,nombre_cliente,puntos,nivel_fidelidad,total_pedidos,ultimo_pedido,created_at",
      { headers: h }
    );
    res.json(r.data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/clientes-canjes", async function(req, res) {
  var restaurante_id = req.query.restaurante_id;
  var telefono = req.query.telefono;
  if (!restaurante_id) return res.status(400).json({ error: "Falta restaurante_id" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var q = SUPABASE_URL + "/rest/v1/canjes?restaurante_id=eq." + restaurante_id;
    if (telefono) q += "&telefono=eq." + encodeURIComponent(telefono);
    q += "&order=created_at.desc&limit=100&select=*";
    var r = await axios.get(q, { headers: h });
    res.json(r.data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ajustar-puntos", async function(req, res) {
  var { restaurante_id, telefono, puntos_delta, motivo } = req.body;
  if (!restaurante_id || !telefono || puntos_delta === undefined) return res.status(400).json({ error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var telLocal = stripCountryCode(telefono);
    var cliR = await axios.get(
      SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restaurante_id + "&telefono=eq." + encodeURIComponent(telLocal) + "&select=id,puntos,nombre_cliente",
      { headers: h }
    );
    if (!cliR.data || !cliR.data.length) return res.status(404).json({ error: "Cliente no encontrado" });
    var cli = cliR.data[0];
    var nuevosPuntos = Math.max(0, (cli.puntos || 0) + Number(puntos_delta));
    await axios.patch(SUPABASE_URL + "/rest/v1/clientes_frecuentes?id=eq." + cli.id,
      { puntos: nuevosPuntos, updated_at: new Date().toISOString() },
      { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
    // Registrar en canjes como ajuste manual
    try {
      await axios.post(SUPABASE_URL + "/rest/v1/canjes",
        { restaurante_id, telefono: telLocal, producto_nombre: "Ajuste manual: " + (motivo||"sin motivo"), puntos_usados: -Number(puntos_delta), estado: "ajuste" },
        { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } }
      );
    } catch(e) {}
    console.log("[ajuste-puntos] " + telLocal + ": " + (cli.puntos||0) + " → " + nuevosPuntos + " (" + (motivo||"-") + ")");
    res.json({ ok: true, puntos_anteriores: cli.puntos || 0, puntos_nuevos: nuevosPuntos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PEDIDOS CON DESCUENTO — endpoint para panel ───────────────────────────────
app.get("/api/pedidos-con-descuento", async function(req, res) {
  var restaurante_id = req.query.restaurante_id;
  if (!restaurante_id) return res.status(400).json({ error: "Falta restaurante_id" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    // Pedidos que tienen descuento (notas_especiales contiene DESCUENTO o items con precio_original)
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante_id +
      "&notas_especiales=like.*DESCUENTO*&order=created_at.desc&limit=100&select=id,numero_pedido,cliente_tel,total,notas_especiales,estado,created_at",
      { headers: h }
    );
    res.json(r.data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/canjear", async function(req, res) {
  var { restaurante_id, telefono, producto_canje_id } = req.body;
  if (!restaurante_id || !telefono || !producto_canje_id) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var telLocal = stripCountryCode(telefono);
    var telWA = "57" + telLocal;

    // 1. Producto
    var prodR = await axios.get(SUPABASE_URL + "/rest/v1/productos_canje?id=eq." + producto_canje_id + "&select=*", { headers: h });
    if (!prodR.data || !prodR.data.length) return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    var prod = prodR.data[0];

    // 2. Cliente
    var cliR = await axios.get(SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restaurante_id + "&telefono=eq." + encodeURIComponent(telLocal) + "&select=*", { headers: h });
    if (!cliR.data || !cliR.data.length) return res.status(404).json({ ok: false, error: "No tienes puntos aun. Completa un pedido primero." });
    var cli = cliR.data[0];
    var nombreCli = cli.nombre_cliente || cli.nombre || telLocal;
    var puntosActuales = cli.puntos || 0;

    // 3. Validar puntos y stock
    if (puntosActuales < prod.puntos_requeridos) return res.json({ ok: false, error: "Puntos insuficientes. Tienes " + puntosActuales + " y necesitas " + prod.puntos_requeridos });
    if (prod.stock !== null && prod.stock !== undefined && prod.stock <= 0) return res.json({ ok: false, error: "Producto agotado por ahora" });

    // 4. Descontar puntos
    var nuevosPuntos = puntosActuales - prod.puntos_requeridos;
    await axios.patch(SUPABASE_URL + "/rest/v1/clientes_frecuentes?id=eq." + cli.id,
      { puntos: nuevosPuntos, updated_at: new Date().toISOString() },
      { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );

    // 5. Reducir stock
    if (prod.stock !== null && prod.stock !== undefined) {
      await axios.patch(SUPABASE_URL + "/rest/v1/productos_canje?id=eq." + prod.id,
        { stock: Math.max(0, prod.stock - 1) },
        { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } }
      );
    }

    // 6. Guardar registro
    var canjeId = null;
    try {
      var canjeR = await axios.post(SUPABASE_URL + "/rest/v1/canjes",
        { restaurante_id, telefono: telLocal, producto_canje_id: prod.id, producto_nombre: prod.nombre, puntos_usados: prod.puntos_requeridos, estado: "pendiente" },
        { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=representation" } }
      );
      canjeId = canjeR.data && canjeR.data[0] ? canjeR.data[0].id : null;
    } catch(eLog) { console.error("[canje] log:", eLog.message); }

    // 7. Agregar al pedido activo
    var pedidoActualizado = false;
    var pedidoNumero = null;
    try {
      var pedR = await axios.get(
        SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante_id +
        "&cliente_tel=eq." + encodeURIComponent(telLocal) +
        "&estado=in.(confirmado,en_preparacion,listo,en_camino)&order=created_at.desc&limit=1&select=*",
        { headers: h }
      );
      var alertMsg;
      if (pedR.data && pedR.data.length > 0) {
        var ped = pedR.data[0];
        pedidoNumero = ped.numero_pedido;
        var itemsAct = Array.isArray(ped.items) ? [...ped.items] : [];
        itemsAct.push((prod.emoji||"\uD83C\uDF81") + " CANJE: " + prod.nombre + " ($0)");
        var notaAct = ped.notas_especiales || "";
        await axios.patch(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + ped.id,
          { items: itemsAct, notas_especiales: (notaAct ? notaAct + " | " : "") + "\u2B50 CANJE: " + prod.nombre + " (" + prod.puntos_requeridos + " pts)", updated_at: new Date().toISOString() },
          { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } }
        );
        pedidoActualizado = true;
        alertMsg = "\u2B50 CANJE: " + nombreCli + " canje\u00f3 " + prod.puntos_requeridos + " pts por " + (prod.emoji||"\uD83C\uDF81") + " " + prod.nombre + " → agregado al Pedido #" + pedidoNumero;
        console.log("[canje] \u2705 Agregado al pedido #" + pedidoNumero);
      } else {
        alertMsg = "\u2B50 CANJE sin pedido activo: " + nombreCli + " canje\u00f3 " + prod.puntos_requeridos + " pts por " + (prod.emoji||"\uD83C\uDF81") + " " + prod.nombre + " (pendiente de entregar)";
      }
      await guardarMensajeSupabase(restaurante_id, telLocal, alertMsg, "alerta_pregunta", null);
    } catch(ePed) { console.error("[canje] pedido:", ePed.message); }

    // 8. WhatsApp al cliente
    try {
      var restInfoR = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id + "&select=whatsapp_phone_id,nombre", { headers: h });
      var restInfo = restInfoR.data && restInfoR.data[0];
      if (restInfo && restInfo.whatsapp_phone_id) {
        var primerNombre = (nombreCli.split(" ")[0] || "amigo");
        var msgWA = (prod.emoji||"\uD83C\uDF81") + " *\u00a1Canje exitoso, " + primerNombre + "!*\n\n"
          + "Canjeaste *" + prod.nombre + "* por *" + prod.puntos_requeridos + " puntos*.\n"
          + "Te quedan *" + nuevosPuntos + " puntos* \uD83C\uDF1F\n\n"
          + (pedidoActualizado
            ? "\u2705 Ya est\u00e1 agregado a tu pedido #" + pedidoNumero + ". \u00a1Disfrut\u00e1lo!"
            : "\uD83D\uDCDD Mu\u00e9straselo al restaurante en tu pr\u00f3ximo pedido.");
        await sendWhatsAppMessage(telWA, msgWA, restInfo.whatsapp_phone_id);
        console.log("[canje] \u2705 WA enviado a " + telWA);
      }
    } catch(eWA) { console.error("[canje] WA:", eWA.message); }

    console.log("[canje] \u2705 " + telLocal + " -> " + prod.nombre + " | pts: " + puntosActuales + " - " + prod.puntos_requeridos + " = " + nuevosPuntos);
    res.json({ ok: true, puntos_restantes: nuevosPuntos, pedido_actualizado: pedidoActualizado, pedido_numero: pedidoNumero });
  } catch(e) {
    console.error("[canje] Error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// Endpoint: productos para UPSELL
// Devuelve mezcla de: fijos (es_upsell=true) + top vendidos
// Filtrado por categorías: Bebidas, Papas, Postres
// ═══════════════════════════════════════════════════════════
app.get("/api/upsell", async function(req, res) {
  if (!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var restId = req.query.restaurante_id;

    // Items que ya están en el carrito (ignorar estos)
    var enCarrito = (req.query.in_cart || "").split(",").filter(function(x){ return x; });

    // 1. FIJOS: productos con es_upsell=true
    var fijosP = axios.get(
      SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restId +
      "&es_upsell=eq.true&disponible=eq.true&order=precio.asc&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    ).catch(function() { return { data: [] }; });

    // 2. TOP VENDIDOS dentro de categorías Bebidas/Papas/Postres
    var topP = axios.get(
      SUPABASE_URL + "/rest/v1/v_productos_top_vendidos?restaurante_id=eq." + restId +
      "&or=(categoria.ilike.*bebida*,categoria.ilike.*papa*,categoria.ilike.*postre*,categoria.ilike.*juego*,categoria.ilike.*gaseosa*)" +
      "&limit=8&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    ).catch(function() { return { data: [] }; });

    var results = await Promise.all([fijosP, topP]);
    var fijos = (results[0].data || []).map(function(x) { x.origen = "fijo"; return x; });
    var topVendidos = (results[1].data || []).map(function(x) { x.origen = "top_vendido"; return x; });

    // Combinar: fijos primero, luego top vendidos (sin duplicar)
    var combinado = [];
    var seen = {};
    
    fijos.forEach(function(p) {
      if (!seen[p.id] && enCarrito.indexOf(p.id) === -1) {
        seen[p.id] = true;
        combinado.push(p);
      }
    });
    
    topVendidos.forEach(function(p) {
      if (!seen[p.id] && enCarrito.indexOf(p.id) === -1 && combinado.length < 6) {
        seen[p.id] = true;
        combinado.push(p);
      }
    });

    // Fallback: si no hay suficientes top vendidos, buscar cualquier bebida/papa/postre disponible
    if (combinado.length < 3) {
      var fallbackP = await axios.get(
        SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restId +
        "&disponible=eq.true&or=(categoria.ilike.*bebida*,categoria.ilike.*papa*,categoria.ilike.*postre*,categoria.ilike.*gaseosa*)" +
        "&order=precio.asc&limit=8&select=*",
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
      ).catch(function() { return { data: [] }; });

      (fallbackP.data || []).forEach(function(p) {
        if (!seen[p.id] && enCarrito.indexOf(p.id) === -1 && combinado.length < 6) {
          seen[p.id] = true;
          p.origen = "fallback";
          combinado.push(p);
        }
      });
    }

    res.json(combinado.slice(0, 6)); // Máximo 6 productos
  } catch(e) {
    console.error("[upsell] error:", e.message);
    res.json([]);
  }
});

// Endpoint para registrar eventos de upsell (analytics)
app.post("/api/upsell-event", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var payload = {
      restaurante_id: req.body.restaurante_id,
      pedido_id: req.body.pedido_id || null,
      producto_id: req.body.producto_id,
      producto_nombre: req.body.producto_nombre,
      producto_precio: req.body.producto_precio,
      origen: req.body.origen || "fijo",
      accepted: req.body.accepted === true
    };
    await axios.post(SUPABASE_URL + "/rest/v1/upsell_events", payload, {
      headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" }
    });
    res.json({ ok: true });
  } catch(e) {
    console.error("[upsell-event] error:", e.message);
    res.json({ ok: false });
  }
});

app.get("/api/zonas", async function(req, res) {
  if (!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/zonas_domicilio?restaurante_id=eq." + req.query.restaurante_id + "&order=precio_domicilio.asc",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch(e) { res.json([]); }
});

app.get("/api/restaurante", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var q = req.query.id ? "id=eq."+req.query.id : "estado=eq.activo&limit=1";
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/restaurantes?" + q + "&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch(e) { res.json([]); }
});

// ═══════════════════════════════════════════════════════════
// SUPABASE PROXY — Route ALL panel Supabase calls through backend
// Fixes ERR_NETWORK_IO_SUSPENDED / CORS / network blocks
// ═══════════════════════════════════════════════════════════
app.all("/api/supabase/*", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var restPath = req.params[0]; // everything after /api/supabase/
    if (!restPath || restPath.indexOf("..") !== -1) return res.status(400).json({ error: "Invalid path" });
    var targetUrl = SUPABASE_URL + "/rest/v1/" + restPath;
    // Preserve query string
    var qs = require("url").parse(req.url).query;
    if (qs) targetUrl += (targetUrl.indexOf("?") === -1 ? "?" : "&") + qs;

    var headers = {
      "apikey": svcKey,
      "Authorization": "Bearer " + svcKey,
      "Content-Type": "application/json"
    };
    // Forward Prefer header if present in request
    var prefer = req.headers["prefer"] || req.body?._prefer;
    if (prefer) headers["Prefer"] = prefer;
    // Check common Prefer patterns from the frontend
    if (req.method === "POST" || req.method === "PATCH") {
      if (!headers["Prefer"]) headers["Prefer"] = "return=minimal";
    }

    var axiosConfig = { method: req.method.toLowerCase(), url: targetUrl, headers: headers };
    if (req.method !== "GET" && req.method !== "DELETE" && req.body) {
      // Remove internal proxy keys
      var body = Object.assign({}, req.body);
      delete body._prefer;
      axiosConfig.data = body;
    }

    var r = await axios(axiosConfig);
    if (r.data !== undefined && r.data !== null && r.data !== "") {
      res.json(r.data);
    } else {
      res.json({ ok: true });
    }
  } catch(e) {
    var status = e.response ? e.response.status : 500;
    console.error("[supabase-proxy " + req.method + "]", req.params[0], e.message);
    if (status === 201 || status === 204) return res.json({ ok: true });
    res.status(status).json({ error: e.message, ok: false });
  }
});

// Legacy proxy-db for get() function
app.get("/api/proxy-db", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var q = decodeURIComponent(req.query.q || "");
    if (!q) return res.json([]);
    if (q.indexOf("..") !== -1) return res.status(400).json({ error: "Invalid query" });
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/" + q,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch(e) {
    console.error("[proxy-db GET]", e.message);
    res.json([]);
  }
});

// Storage proxy for image uploads
app.post("/api/storage-upload/:path(*)", async function(req, res) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var filePath = req.params.path;
    if (!filePath || filePath.indexOf("..") !== -1) return res.status(400).json({ error: "Invalid path" });
    var r = await axios.post(
      SUPABASE_URL + "/storage/v1/object/media/" + filePath,
      req.body,
      {
        headers: {
          "apikey": svcKey,
          "Authorization": "Bearer " + svcKey,
          "Content-Type": req.headers["content-type"] || "application/octet-stream",
          "x-upsert": "true"
        },
        maxBodyLength: 10 * 1024 * 1024
      }
    );
    res.json(r.data || { ok: true });
  } catch(e) {
    console.error("[storage-upload]", e.message);
    res.status(500).json({ error: e.message });
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// LUZ AGENTE DUEÑO — Responde WhatsApp del dueño con acceso total al sistema
// ═══════════════════════════════════════════════════════════════════════════
var historialDueno = {}; // { restaurante_id: [{role, content}] }

async function procesarMensajeDueno(texto, from, phoneNumberId, restaurante) {
  var restId = restaurante.id;
  var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };

  // Indicador de "procesando"
  await sendWhatsAppMessage(from, "⏳ Procesando...", phoneNumberId);

  try {
    // Cargar contexto del restaurante en paralelo
    var [pedidosR, clientesR, menuR, domisR, zonasR, promosR] = await Promise.all([
      axios.get(SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restId +
        "&order=created_at.desc&limit=20&select=numero_pedido,estado,total,cliente_tel,items,metodo_pago,created_at,domiciliario_id",
        { headers: h }).catch(function(){ return { data: [] }; }),
      axios.get(SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restId +
        "&order=total_pedidos.desc&limit=10&select=nombre_cliente,telefono,total_pedidos,puntos,nivel_fidelidad",
        { headers: h }).catch(function(){ return { data: [] }; }),
      axios.get(SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restId +
        "&order=categoria&select=id,nombre,precio,categoria,disponible",
        { headers: h }).catch(function(){ return { data: [] }; }),
      axios.get(SUPABASE_URL + "/rest/v1/domiciliarios?restaurante_id=eq." + restId +
        "&select=id,nombre,telefono,activo",
        { headers: h }).catch(function(){ return { data: [] }; }),
      axios.get(SUPABASE_URL + "/rest/v1/zonas_domicilio?restaurante_id=eq." + restId +
        "&select=id,nombre,precio_domicilio,barrios",
        { headers: h }).catch(function(){ return { data: [] }; }),
      axios.get(SUPABASE_URL + "/rest/v1/promos_programadas?restaurante_id=eq." + restId +
        "&select=id,titulo,descripcion,dia,activa",
        { headers: h }).catch(function(){ return { data: [] }; })
    ]);

    var pedidos = pedidosR.data || [];
    var clientes = clientesR.data || [];
    var menu = menuR.data || [];
    var domis = domisR.data || [];
    var zonas = zonasR.data || [];
    var promos = promosR.data || [];

    // Calcular ventas del día
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var pedidosHoy = pedidos.filter(function(p){ return new Date(p.created_at) >= hoy; });
    var ventasHoy = pedidosHoy.filter(function(p){ return p.estado==="entregado"||p.estado==="confirmado"||p.estado==="en_preparacion"; })
      .reduce(function(s,p){ return s+Number(p.total||0); }, 0);

    // Historial de conversación con el dueño
    if (!historialDueno[restId]) historialDueno[restId] = [];
    historialDueno[restId].push({ role: "user", content: texto });
    if (historialDueno[restId].length > 20) historialDueno[restId] = historialDueno[restId].slice(-20);

    var systemPrompt = `Eres LUZ, la asistente ejecutiva de IA del restaurante "${restaurante.nombre}". 
Estás hablando con EL DUEÑO por WhatsApp. Tienes acceso TOTAL al sistema.

CONTEXTO ACTUAL DEL NEGOCIO:
📊 Pedidos hoy: ${pedidosHoy.length} | Ventas hoy: $${ventasHoy.toLocaleString("es-CO")}
📦 Pedidos activos: ${pedidos.filter(function(p){ return ["confirmado","en_preparacion","listo","en_camino"].indexOf(p.estado)!==-1; }).length}
👥 Clientes top: ${clientes.slice(0,3).map(function(c){ return c.nombre_cliente+"("+c.total_pedidos+" pedidos)"; }).join(", ")}
🍔 Menú: ${menu.length} productos (${menu.filter(function(p){ return p.disponible===false; }).length} inactivos)
🛵 Domiciliarios: ${domis.length} registrados
🗺️ Zonas: ${zonas.map(function(z){ return z.nombre+"($"+Number(z.precio_domicilio).toLocaleString("es-CO")+")"; }).join(", ")}
📣 Promos activas: ${promos.filter(function(p){ return p.activa; }).length}

ÚLTIMOS PEDIDOS:
${pedidos.slice(0,5).map(function(p){ return "#"+p.numero_pedido+" "+p.estado+" $"+Number(p.total||0).toLocaleString("es-CO")+" - "+p.cliente_tel; }).join("\n")}

PUEDES EJECUTAR ESTAS ACCIONES (úsalas cuando el dueño lo pida):
ACTION:CREAR_ZONA:{"nombre":"...","precio":0,"barrios":"barrio1,barrio2"}
ACTION:CREAR_PROMO:{"titulo":"...","descripcion":"...","dia":"lunes|martes|...|todos","activa":true}
ACTION:CREAR_DOMI:{"nombre":"...","telefono":"..."}
ACTION:ACTUALIZAR_PRECIO:{"producto_id":"...","precio":0}
ACTION:TOGGLE_PRODUCTO:{"producto_id":"...","disponible":true}
ACTION:ENVIAR_PROMO_MASIVA:{"mensaje":"..."}
ACTION:VER_REPORTE:{"tipo":"ventas_hoy|ventas_semana|mejores_clientes|productos_top"}
ACTION:ENVIAR_MENSAJE_CLIENTE:{"telefono":"...","mensaje":"..."}
ACTION:CREAR_CUPON:{"codigo":"...","descuento":0,"tipo":"porcentaje|fijo"}

REGLAS:
- Habla como una asistente profesional y eficiente, colombiana
- Cuando el dueño pida algo ejecutable, hazlo con ACTION: y confirma
- Si necesitas un dato para ejecutar, pregunta SOLO lo que falta
- Respuestas cortas y directas — el dueño está ocupado
- Si hay problemas urgentes en el sistema, avísale aunque no pregunte
- Puedes combinar múltiples acciones si el dueño pide varias cosas
- NUNCA inventes datos — usa solo la info real del contexto

HORA COLOMBIA: ${getHoraColombia().toLocaleTimeString("es-CO")}`;

    var claudeR = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: historialDueno[restId].slice(-16)
    }, {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      }
    });

    var respuestaRaw = claudeR.data.content[0].text || "";
    var respuesta = respuestaRaw;
    var accionesEjecutadas = [];

    // ── EJECUTAR ACCIONES ──────────────────────────────────────────────────
    // CREAR ZONA
    var mZona = respuestaRaw.match(/ACTION:CREAR_ZONA:(\{[^}]+\})/);
    if (mZona) {
      try {
        var zona = JSON.parse(mZona[1]);
        await axios.post(SUPABASE_URL + "/rest/v1/zonas_domicilio",
          { restaurante_id: restId, nombre: zona.nombre, precio_domicilio: Number(zona.precio),
            barrios: zona.barrios ? zona.barrios.split(",").map(function(b){ return b.trim(); }) : [] },
          { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } });
        accionesEjecutadas.push("✅ Zona '"+zona.nombre+"' creada con precio $"+Number(zona.precio).toLocaleString("es-CO"));
      } catch(e){ accionesEjecutadas.push("❌ Error creando zona: "+e.message); }
      respuesta = respuesta.replace(/ACTION:CREAR_ZONA:\{[^}]+\}/g, "").trim();
    }

    // CREAR PROMO
    var mPromo = respuestaRaw.match(/ACTION:CREAR_PROMO:(\{[^}]+\})/);
    if (mPromo) {
      try {
        var promo = JSON.parse(mPromo[1]);
        await axios.post(SUPABASE_URL + "/rest/v1/promos_programadas",
          { restaurante_id: restId, titulo: promo.titulo, descripcion: promo.descripcion,
            dia: promo.dia || "todos", activa: true },
          { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } });
        accionesEjecutadas.push("✅ Promo '"+promo.titulo+"' creada para "+promo.dia);
      } catch(e){ accionesEjecutadas.push("❌ Error creando promo: "+e.message); }
      respuesta = respuesta.replace(/ACTION:CREAR_PROMO:\{[^}]+\}/g, "").trim();
    }

    // CREAR DOMICILIARIO
    var mDomi = respuestaRaw.match(/ACTION:CREAR_DOMI:(\{[^}]+\})/);
    if (mDomi) {
      try {
        var domi = JSON.parse(mDomi[1]);
        await axios.post(SUPABASE_URL + "/rest/v1/domiciliarios",
          { restaurante_id: restId, nombre: domi.nombre, telefono: domi.telefono, activo: true },
          { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } });
        accionesEjecutadas.push("✅ Domiciliario "+domi.nombre+" registrado");
      } catch(e){ accionesEjecutadas.push("❌ Error: "+e.message); }
      respuesta = respuesta.replace(/ACTION:CREAR_DOMI:\{[^}]+\}/g, "").trim();
    }

    // ACTUALIZAR PRECIO
    var mPrecio = respuestaRaw.match(/ACTION:ACTUALIZAR_PRECIO:(\{[^}]+\})/);
    if (mPrecio) {
      try {
        var upd = JSON.parse(mPrecio[1]);
        await axios.patch(SUPABASE_URL + "/rest/v1/menu_items?id=eq." + upd.producto_id,
          { precio: Number(upd.precio) },
          { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } });
        menuCache = {};
        accionesEjecutadas.push("✅ Precio actualizado a $"+Number(upd.precio).toLocaleString("es-CO"));
      } catch(e){ accionesEjecutadas.push("❌ Error actualizando precio: "+e.message); }
      respuesta = respuesta.replace(/ACTION:ACTUALIZAR_PRECIO:\{[^}]+\}/g, "").trim();
    }

    // TOGGLE PRODUCTO
    var mToggle = respuestaRaw.match(/ACTION:TOGGLE_PRODUCTO:(\{[^}]+\})/);
    if (mToggle) {
      try {
        var tog = JSON.parse(mToggle[1]);
        await axios.patch(SUPABASE_URL + "/rest/v1/menu_items?id=eq." + tog.producto_id,
          { disponible: tog.disponible },
          { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } });
        menuCache = {};
        accionesEjecutadas.push("✅ Producto "+(tog.disponible?"activado":"desactivado"));
      } catch(e){ accionesEjecutadas.push("❌ Error: "+e.message); }
      respuesta = respuesta.replace(/ACTION:TOGGLE_PRODUCTO:\{[^}]+\}/g, "").trim();
    }

    // ENVIAR PROMO MASIVA
    var mMasiva = respuestaRaw.match(/ACTION:ENVIAR_PROMO_MASIVA:(\{[^}]+\})/);
    if (mMasiva) {
      try {
        var pm = JSON.parse(mMasiva[1]);
        // Todos los clientes — paginado sin límite
        var allClis2=[]; var off2=0;
        while(true){
          var cliR2=await axios.get(SUPABASE_URL+"/rest/v1/clientes_frecuentes?restaurante_id=eq."+restId+"&select=telefono&offset="+off2+"&limit=1000",{headers:h});
          var pg=cliR2.data||[];allClis2=allClis2.concat(pg);
          if(pg.length<1000)break;off2+=1000;
        }
        var tels = allClis2.map(function(c){ return "57"+stripCountryCode(c.telefono); }).filter(function(t){return t.length>=12;});
        var enviados = 0;
        for (var i = 0; i < tels.length; i++) {
          try { await sendWhatsAppMessage(tels[i], pm.mensaje, phoneNumberId); enviados++; } catch(e){}
          if (i < tels.length-1) await new Promise(function(r){ setTimeout(r, 400); });
        }
        accionesEjecutadas.push("✅ Promo enviada a "+enviados+" de "+tels.length+" clientes");
      } catch(e){ accionesEjecutadas.push("❌ Error enviando promo: "+e.message); }
      respuesta = respuesta.replace(/ACTION:ENVIAR_PROMO_MASIVA:\{[^}]+\}/g, "").trim();
    }

    // ENVIAR MENSAJE A CLIENTE
    var mMsg = respuestaRaw.match(/ACTION:ENVIAR_MENSAJE_CLIENTE:(\{[^}]+\})/);
    if (mMsg) {
      try {
        var mc = JSON.parse(mMsg[1]);
        await sendWhatsAppMessage("57"+stripCountryCode(mc.telefono), mc.mensaje, phoneNumberId);
        accionesEjecutadas.push("✅ Mensaje enviado al cliente "+mc.telefono);
      } catch(e){ accionesEjecutadas.push("❌ Error: "+e.message); }
      respuesta = respuesta.replace(/ACTION:ENVIAR_MENSAJE_CLIENTE:\{[^}]+\}/g, "").trim();
    }

    // Limpiar respuesta y agregar resultados de acciones
    respuesta = respuesta.trim();
    if (accionesEjecutadas.length > 0) {
      respuesta += "\n\n" + accionesEjecutadas.join("\n");
    }

    // Guardar respuesta en historial
    historialDueno[restId].push({ role: "assistant", content: respuesta });

    // Enviar respuesta al dueño (dividir si es muy largo)
    if (respuesta.length > 1500) {
      var partes = respuesta.match(/.{1,1500}(\s|$)/g) || [respuesta];
      for (var parte of partes) {
        await sendWhatsAppMessage(from, parte.trim(), phoneNumberId);
        await new Promise(function(r){ setTimeout(r, 300); });
      }
    } else {
      await sendWhatsAppMessage(from, respuesta, phoneNumberId);
    }

    console.log("[DUEÑO] ✅ Respondido | acciones: " + accionesEjecutadas.length);

  } catch(e) {
    console.error("[DUEÑO] Error:", e.message);
    await sendWhatsAppMessage(from, "❌ Tuve un error procesando eso. Intenta de nuevo en un momento.", phoneNumberId);
  }
}

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

    // ── DETECTAR SI ES EL DUEÑO ESCRIBIENDO ──────────────────────────────────
    var restaurante = await getRestaurante(phoneNumberId);
    if (restaurante && restaurante.telefono_dueno) {
      var telDueno = stripCountryCode(restaurante.telefono_dueno);
      var telFrom  = stripCountryCode(from);
      if (telFrom === telDueno) {
        console.log("[DUEÑO] Mensaje del dueño: " + userText.substring(0, 60));
        await procesarMensajeDueno(userText, from, phoneNumberId, restaurante);
        return;
      }
    }

    // ── CAPTURA DE VALORACIÓN ─────────────────────────────────────────────────
    // Si el cliente responde 1-5, podría ser una valoración del pedido
    var trimmedText = userText.trim();
    if (/^[1-5]$/.test(trimmedText)) {
      try {
        var svcRating = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
        var telRating = stripCountryCode(from);
        var restauranteRating = await getRestaurante(phoneNumberId);
        if (restauranteRating) {
          // Buscar pedido entregado reciente — últimas 24 horas (más tiempo para valorar)
          var hace24h = new Date(Date.now() - 24*60*60*1000).toISOString();
          var pedRating = await axios.get(
            SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restauranteRating.id +
            "&or=(cliente_tel.eq." + encodeURIComponent(telRating) + ",cliente_tel.eq." + encodeURIComponent("57"+telRating) + ")" +
            "&estado=eq.entregado&valoracion=is.null&created_at=gte." + hace24h +
            "&order=created_at.desc&limit=1&select=id,numero_pedido",
            { headers: { "apikey": svcRating, "Authorization": "Bearer " + svcRating } }
          ).catch(function() { return { data: [] }; });

          if (pedRating.data && pedRating.data.length > 0) {
            var pedId = pedRating.data[0].id;
            var pedNum = pedRating.data[0].numero_pedido;
            var estrellas = parseInt(trimmedText);
            await axios.patch(
              SUPABASE_URL + "/rest/v1/pedidos?id=eq." + pedId,
              { valoracion: estrellas, updated_at: new Date().toISOString() },
              { headers: { "apikey": svcRating, "Authorization": "Bearer " + svcRating, "Content-Type": "application/json", "Prefer": "return=minimal" } }
            ).catch(function(){});
            var estrellasStr = "⭐".repeat(estrellas);
            var respRating = estrellas >= 4
              ? "¡Gracias " + estrellasStr + "! Nos alegra mucho que hayas disfrutado. ¡Te esperamos pronto! 😊"
              : estrellas === 3
              ? "Gracias " + estrellasStr + ". Tomamos nota para mejorar. ¡La próxima será mejor! 💪"
              : "Lamentamos que no fue lo esperado " + estrellasStr + ". ¿Qué podemos mejorar?";
            await sendWhatsAppMessage(from, respRating, restauranteRating.whatsapp_phone_id || phoneNumberId);
            guardarMensajeSupabase(restauranteRating.id, telRating, trimmedText, "cliente", null).catch(function(){});
            guardarMensajeSupabase(restauranteRating.id, telRating, respRating, "restaurante", null).catch(function(){});
            console.log("[rating] ⭐ Pedido #" + pedNum + " = " + estrellas + "★ por " + telRating);
            return;
          }
        }
      } catch(eRatingCapture) { console.error("[rating-capture]", eRatingCapture.message); }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!orderState[from]) {
      var saved = await getOrderState(from);
      if (saved) { orderState[from] = saved; console.log("orderState recuperado para:", from); }
    }

    var restaurante = await getRestaurante(phoneNumberId);
    if (restaurante) {
      if (restaurante.estado !== "activo") { console.log("Restaurante inactivo"); return; }
      if (!estaEnHorario(restaurante)) {
        // Check if client has an active order — if so, let LUZ respond
        var tieneOrdenActiva = false;
        if (orderState[from] && orderState[from].orderNumber && orderState[from].status !== "entregado") {
          tieneOrdenActiva = true;
        }
        if (!tieneOrdenActiva) {
          // Also check Supabase for active orders
          try {
            var telCheck = stripCountryCode(from);
            var svcCheck = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
            var actCheck = await axios.get(
              SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante.id +
              "&cliente_tel=eq." + encodeURIComponent(telCheck) +
              "&estado=in.(confirmado,en_preparacion,listo,en_camino)&limit=1&select=id",
              { headers: { "apikey": svcCheck, "Authorization": "Bearer " + svcCheck } }
            );
            if (actCheck.data && actCheck.data.length > 0) tieneOrdenActiva = true;
          } catch(eOrdChk) {}
        }
        if (tieneOrdenActiva) {
          console.log("Fuera de horario PERO cliente tiene pedido activo — LUZ atiende:", from);
          // Fall through to normal LUZ processing
        } else {
          var col = getHoraColombia();
          console.log("Fuera de horario - avisando cliente. Hora Colombia:", col.getHours()+":"+String(col.getMinutes()).padStart(2,"0"), "| Apertura:", restaurante.hora_apertura, "| Cierre:", restaurante.hora_cierre, "| Días:", restaurante.dias_activos);
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
    // ── CONTEXTO COMPLETO DEL PEDIDO ACTIVO ───────────────────────────────────
    var pedidoActivoTexto = "";

    // Mapa de estados → qué sabe LUZ y cómo debe responder
    var ESTADO_CONTEXTO = {
      "esperando_pago": {
        label: "esperando pago",
        instruccion: "El cliente aún NO ha pagado. Si escribe, recuérdale amablemente que envíe el comprobante de pago para que el pedido entre a preparación."
      },
      "confirmado": {
        label: "confirmado/recibido",
        instruccion: "El pedido fue recibido y confirmado. Ya está en la cola de preparación. Si el cliente pregunta, dile que lo recibimos y pronto empieza la preparación."
      },
      "en_preparacion": {
        label: "en preparación en cocina",
        instruccion: "El pedido está siendo preparado ahora mismo en cocina. Si el cliente escribe, dile que ya está en preparación y que en breve estará listo. NO digas tiempos exactos a menos que el restaurante los tenga configurados."
      },
      "listo": {
        label: "listo para entrega o recogida",
        instruccion: "El pedido ya está listo. Si es domicilio, el domiciliario va a recogerlo. Si es para recoger en el local, dile que puede pasar. Si el cliente escribe, dile que su pedido ya está listo."
      },
      "en_camino": {
        label: "en camino con el domiciliario",
        instruccion: "El domiciliario ya lleva el pedido. El cliente probablemente está respondiendo al mensaje automático que le enviamos. Si escribe 'gracias', 'ok', 'perfecto' o algo similar, respóndele con calidez, dile que disfrute y que estás a la orden. NO repitas información que ya sabe. NO preguntes si quiere algo más a menos que él lo inicie."
      },
      "entregado": {
        label: "entregado",
        instruccion: "El pedido ya fue entregado. Si el cliente escribe, probablemente es para agradecer o dar retroalimentación. Responde con calidez, agradece su preferencia e invítalo a volver."
      }
    };

    // Primero revisar orderState en memoria
    if (orderState[from] && orderState[from].orderNumber) {
      var st = orderState[from];
      var ctx = ESTADO_CONTEXTO[st.status] || { label: st.status, instruccion: "Atiende al cliente con normalidad." };
      var itemsResumen = Array.isArray(st.items) ? st.items.slice(0,3).join(", ") : "";
      pedidoActivoTexto = "\n\n═══ PEDIDO ACTIVO ═══"
        + "\nPedido #" + st.orderNumber
        + " | Total: $" + Number(st.total||0).toLocaleString("es-CO")
        + " | Estado ACTUAL: " + ctx.label.toUpperCase()
        + (itemsResumen ? " | Items: " + itemsResumen : "")
        + (st.direccion ? " | Dirección: " + st.direccion : "")
        + "\n\nQUÉ DEBE HACER LUZ: " + ctx.instruccion
        + "\n\nNOTA: Si el cliente dice 'gracias', 'ok', 'perfecto', 'listo', 'ah está bien' u otras respuestas cortas de cortesía, es porque está respondiendo a un mensaje automático de estado que ya le enviamos. Responde con calidez y brevedad, sin repetir la info del pedido."
        + (st.status !== "entregado" ? "\nSi quiere agregar algo al pedido: MODIFICAR_PEDIDO:" + st.orderNumber + "|AGREGAR:[item $precio]" : "")
        + "\n═══════════════════════";
    }

    // Si no hay orderState, consultar Supabase
    if (!pedidoActivoTexto && restaurante) {
      try {
        var telBuscar = stripCountryCode(from);
        var svcPA = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
        var pedActResp = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante.id +
          "&cliente_tel=eq." + encodeURIComponent(telBuscar) +
          "&estado=in.(confirmado,en_preparacion,listo,en_camino,entregado)&order=created_at.desc&limit=1&select=numero_pedido,estado,total,items,direccion,tipo_pedido,updated_at",
          { headers: { "apikey": svcPA, "Authorization": "Bearer " + svcPA } }
        );
        if (pedActResp.data && pedActResp.data.length > 0) {
          var pa = pedActResp.data[0];
          var ctxDB = ESTADO_CONTEXTO[pa.estado] || { label: pa.estado, instruccion: "Atiende al cliente con normalidad." };
          var itemsDB = Array.isArray(pa.items) ? pa.items.slice(0,3).join(", ") : (pa.items || "");
          // Check if recent (last 3 hours) to determine if still relevant
          var minutosDesdeUpdate = pa.updated_at ? Math.floor((Date.now() - new Date(pa.updated_at))/60000) : 999;
          if (minutosDesdeUpdate < 180) { // Only inject if updated in last 3 hours
            pedidoActivoTexto = "\n\n═══ PEDIDO ACTIVO (desde DB) ═══"
              + "\nPedido #" + pa.numero_pedido
              + " | Total: $" + Number(pa.total||0).toLocaleString("es-CO")
              + " | Estado ACTUAL: " + ctxDB.label.toUpperCase()
              + (itemsDB ? " | Items: " + itemsDB : "")
              + (pa.direccion ? " | Dirección: " + pa.direccion : "")
              + (pa.tipo_pedido ? " | Tipo: " + pa.tipo_pedido : "")
              + "\n\nQUÉ DEBE HACER LUZ: " + ctxDB.instruccion
              + "\n\nNOTA: Si el cliente dice 'gracias', 'ok', 'perfecto', 'listo' u otras respuestas cortas, está respondiendo a un mensaje automático. Responde con calidez y brevedad."
              + (pa.estado !== "entregado" ? "\nSi quiere agregar algo: MODIFICAR_PEDIDO:" + pa.numero_pedido + "|AGREGAR:[item $precio]" : "")
              + "\n════════════════════════════════";
          }
        }
      } catch(ePA) { console.error("pedidoActivo Supabase check:", ePA.message); }
    }

    // ── CARGAR APRENDIZAJES DE LUZ ─────────────────────────────────────────────
    var aprendizajesTexto = "";
    if (restaurante) {
      try {
        var aprendizajes = await cargarAprendizajes(restaurante.id);
        aprendizajesTexto = formatearAprendizajes(aprendizajes);
      } catch(eAp) { console.error("aprendizajes:", eAp.message); }
    }

    // ── CARGAR HISTORIAL DE CONVERSACIÓN DE SUPABASE (continuidad entre reinicios) ──
    if (conversations[from].length <= 1 && restaurante) {
      try {
        var telHist = stripCountryCode(from);
        var svcHist = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
        var histResp = await axios.get(
          SUPABASE_URL + "/rest/v1/mensajes?restaurante_id=eq." + restaurante.id +
          "&telefono=eq." + encodeURIComponent(telHist) +
          "&tipo=in.(cliente,restaurante,estado_luz)&order=created_at.desc&limit=10&select=mensaje,tipo,created_at",
          { headers: { "apikey": svcHist, "Authorization": "Bearer " + svcHist } }
        );
        if (histResp.data && histResp.data.length > 1) {
          var histMsgs = histResp.data.reverse();
          var resumenHist = histMsgs.map(function(m) {
            return (m.tipo === "cliente" ? "CLIENTE" : "TU") + ": " + (m.mensaje || "").substring(0, 120);
          }).join("\n");
          aprendizajesTexto += "\n\nHISTORIAL RECIENTE DE ESTE CLIENTE (para contexto, no lo repitas):\n" + resumenHist;
        }
      } catch(eHist) { console.error("historial:", eHist.message); }
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
      + bienvenidaExtra + pedidoActivoTexto + aprendizajesTexto;

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
      // Auto-learning: guardar pregunta sin respuesta
      autoAprendizajeDePregunta(restaurante.id, orderState[from].alertaPregunta).catch(function(){});
    }

    if (sideEffect === "modificar_pedido") { console.log("MODIFICAR intent:", JSON.stringify(orderState[from]?.modificarPedido)); }
    if (sideEffect === "modificar_pedido" && restaurante) {
      // Support modification even without in-memory orderState (e.g. after server restart)
      var mod = orderState[from]?.modificarPedido;
      if (!mod) {
        // Try to extract from the raw reply again
        var modRetry = rawReply.match(/MODIFICAR_PEDIDO:([^|\n]+)[|]([^\n]+)/);
        if (modRetry) {
          mod = { numero: modRetry[1].trim(), accion: modRetry[2].trim() };
        }
      }
      if (mod) {
      try {
        var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
        var pedResp = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante.id + "&numero_pedido=eq." + mod.numero + "&select=id,items,total,subtotal,desechables,domicilio",
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
        );
        if (pedResp.data && pedResp.data.length > 0) {
          var ped = pedResp.data[0];
          var patch = {};
          var notaAnterior = ped.notas_especiales || "";
          if (mod.accion.startsWith("AGREGAR:")) {
            var nuevoItem = mod.accion.replace("AGREGAR:", "").trim();
            var itemsActuales = Array.isArray(ped.items) ? [...ped.items] : [];
            itemsActuales.push("➕ " + nuevoItem);
            var precioMatch = nuevoItem.match(/\$([0-9.,]+)/);
            var precioExtra = 0;
            if (precioMatch) {
              var precioStr = precioMatch[1];
              if (precioStr.indexOf('.') !== -1 && precioStr.indexOf(',') === -1) {
                precioExtra = Number(precioStr.replace(/\./g, ''));
              } else {
                precioExtra = Number(precioStr.replace(/[.,]/g, ''));
              }
            }
            var nuevoTotal = Number(ped.total || 0) + precioExtra;
            patch.items = itemsActuales;
            patch.total = nuevoTotal;
            patch.subtotal = nuevoTotal - Number(ped.desechables || 0) - Number(ped.domicilio || 0);
            patch.notas_especiales = (notaAnterior ? notaAnterior + " | " : "") + "✏️ MODIFICADO: +" + nuevoItem;
          } else if (mod.accion.startsWith("DIRECCION:")) {
            var nuevaDir = mod.accion.replace("DIRECCION:", "").trim();
            patch.direccion = nuevaDir;
            patch.notas_especiales = (notaAnterior ? notaAnterior + " | " : "") + "📍 Dirección cambiada: " + nuevaDir;
          } else if (mod.accion.startsWith("NOTA:")) {
            var nota = mod.accion.replace("NOTA:", "").trim();
            patch.notas_especiales = (notaAnterior ? notaAnterior + " | " : "") + "📝 " + nota;
          } else if (mod.accion.startsWith("ELIMINAR:") || mod.accion.startsWith("QUITAR:")) {
            var itemQuitar = mod.accion.replace(/^(ELIMINAR|QUITAR):/, "").trim().toLowerCase();
            var itemsAct2 = Array.isArray(ped.items) ? [...ped.items] : [];
            var idx = itemsAct2.findIndex(function(it) { return it.toLowerCase().indexOf(itemQuitar) !== -1; });
            if (idx !== -1) {
              var removido = itemsAct2.splice(idx, 1)[0];
              patch.items = itemsAct2;
              patch.notas_especiales = (notaAnterior ? notaAnterior + " | " : "") + "✏️ Removido: " + removido;
            }
          }
          if (Object.keys(patch).length > 0) {
            patch.updated_at = new Date().toISOString();
            await axios.patch(
              SUPABASE_URL + "/rest/v1/pedidos?id=eq." + ped.id, patch,
              { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
            );
            console.log("Pedido #" + mod.numero + " modificado en Supabase:", JSON.stringify(patch));
            // Save as modification alert so panel sees it immediately
            guardarMensajeSupabase(restaurante.id, stripCountryCode(from), "✏️ PEDIDO #" + mod.numero + " MODIFICADO POR CLIENTE: " + mod.accion, "alerta_pregunta", null).catch(function(){});
          }
        }
      } catch(e) { console.error("modificar_pedido error:", e.message); }
      } // end if (mod)
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
        var telBuscar = stripCountryCode(from);
        var recResp = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante.id +
          "&cliente_tel=eq." + encodeURIComponent(telBuscar) +
          "&estado=in.(confirmado,en_preparacion,listo)&order=created_at.desc&limit=1&select=*",
          { headers: { "apikey": svcRec, "Authorization": "Bearer " + svcRec } }
        );
        if (recResp.data && recResp.data.length > 0) {
          var recPed = recResp.data[0];
          // Actualizar comprobante
          var patchData = { metodo_pago: orderState[from]?.paymentMethod || recPed.metodo_pago || "digital" };
          if (mediaId) {
            patchData.comprobante_media_id = mediaId;
            patchData.comprobante_url = "/api/comprobante/" + mediaId;
          }
          await axios.patch(
            SUPABASE_URL + "/rest/v1/pedidos?id=eq." + recPed.id,
            patchData,
            { headers: { "apikey": svcRec, "Authorization": "Bearer " + svcRec, "Content-Type": "application/json", "Prefer": "return=minimal" } }
          );
          console.log("Pedido #" + recPed.numero_pedido + " - comprobante y metodo_pago actualizados");
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
        comprobanteUrl: state.comprobanteUrl || null,
        comprobanteMediaId: state.comprobanteMediaId || null,
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

      // ── SUMAR PUNTOS (flujo WhatsApp) ──────────────────────────────────
      if (restId && state.total) {
        try {
          var telPuntos = stripCountryCode(from);
          var svcPuntos = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
          var hPuntos = { "apikey": svcPuntos, "Authorization": "Bearer " + svcPuntos };
          var countPR = await axios.get(SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restId +
            "&or=(cliente_tel.eq." + encodeURIComponent(telPuntos) + ",cliente_tel.eq." + encodeURIComponent(from) + ")&select=id", { headers: hPuntos });
          var totalPeds = (countPR.data || []).length;
          var nivelP = totalPeds >= 25 ? "oro" : totalPeds >= 10 ? "plata" : "bronce";
          var puntosNuevosP = Math.floor(Number(state.total) / 1000);
          var cliActualP = await axios.get(SUPABASE_URL + "/rest/v1/clientes_frecuentes?restaurante_id=eq." + restId +
            "&telefono=eq." + encodeURIComponent(telPuntos) + "&select=puntos,nombre_cliente", { headers: hPuntos });
          var puntosActP = (cliActualP.data && cliActualP.data[0] && cliActualP.data[0].puntos) ? cliActualP.data[0].puntos : 0;
          var puntosTotalP = puntosActP + puntosNuevosP;
          var nombreWA = (cliActualP.data && cliActualP.data[0] && cliActualP.data[0].nombre_cliente) || null;
          await axios.post(SUPABASE_URL + "/rest/v1/clientes_frecuentes?on_conflict=restaurante_id,telefono",
            { restaurante_id: restId, telefono: telPuntos, nombre_cliente: nombreWA, total_pedidos: totalPeds, nivel_fidelidad: nivelP, puntos: puntosTotalP, updated_at: new Date().toISOString() },
            { headers: { ...hPuntos, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } }
          );
          console.log("[puntos-WA] ✅ " + telPuntos + ": " + puntosActP + " + " + puntosNuevosP + " = " + puntosTotalP + " pts | nivel: " + nivelP);
        } catch(ePuntos) { console.error("[puntos-WA]", ePuntos.message); }
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

// ── NOTIFICAR PANEL DESDE MENÚ (usado por LUZ asistente) ──────────────────
// ═══════════════════════════════════════════════════════════════════════════
// ELEVENLABS TTS — Voz humana de Luz
// ═══════════════════════════════════════════════════════════════════════════
app.post("/api/luz-voz", async function(req, res) {
  var texto = (req.body.texto || "").trim();
  if (!texto) return res.status(400).json({ ok: false, error: "Falta texto" });

  var apiKey  = process.env.ELEVENLABS_API_KEY || "sk_7334068384a49aea870bf8e50c3e08a1822357af555233fa";
  var voiceId = process.env.ELEVENLABS_VOICE_ID || "qBvury71WUJfVeT1STkG";

  if (!apiKey) return res.status(503).json({ ok: false, error: "ElevenLabs no configurado" });

  // Limpiar texto — quitar markdown, emojis, símbolos
  var limpio = texto
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, "")
    .replace(/[⭐🎁🍔🛵💳📱⚠️✅❌🔥💰👋🌟📝💜🤖•]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  // Solo primera oración — más natural
  var primera = limpio.split(/[.!?]\s/)[0];
  if (primera.length > 150) primera = primera.substring(0, 150);
  if (!primera || primera.length < 2) return res.status(400).json({ ok: false, error: "Texto vacío" });

  try {
    var elR = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voiceId + "/stream",
      {
        text: primera,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.80,
          style: 0.25,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg"
        },
        responseType: "arraybuffer",
        timeout: 8000
      }
    );

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(elR.data));
    console.log("[ElevenLabs] ✅ TTS: '" + primera.substring(0, 40) + "'");
  } catch(e) {
    var status = e.response ? e.response.status : 500;
    console.error("[ElevenLabs] Error:", status, e.message);
    res.status(503).json({ ok: false, error: "ElevenLabs error: " + status });
  }
});

app.post("/api/notificar-panel", async function(req, res) {
  var { restaurante_id, telefono, mensaje, tipo } = req.body;
  if (!restaurante_id || !mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    await guardarMensajeSupabase(restaurante_id, telefono || "menu_anonimo", mensaje, tipo || "alerta_pregunta", null);
    console.log("[notificar-panel] ✅ Alerta guardada:", mensaje.substring(0, 60));
    res.json({ ok: true });
  } catch(e) {
    console.error("[notificar-panel]", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// LUZ AGENT — Sistema de monitoreo proactivo
// Revisa cambios en la BD cada 15s y actúa automáticamente
// ═══════════════════════════════════════════════════════════════════════════
var agentState = {
  ultimoChequeo: new Date().toISOString(),
  pedidosVistosHoy: new Set(),
  canjesVistosHoy: new Set(),
  alertasEnviadas: new Set()
};

async function luzAgentTick() {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var h = { "apikey": svcKey, "Authorization": "Bearer " + svcKey };
    var desde = agentState.ultimoChequeo;
    agentState.ultimoChequeo = new Date().toISOString();

    // Cargar todos los restaurantes activos
    var restsR = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=id,nombre,whatsapp_phone_id,telefono_dueno", { headers: h })
      .catch(function(){ return { data: [] }; });
    var rests = restsR.data || [];

    for (var rest of rests) {
      var restId = rest.id;
      var phoneId = rest.whatsapp_phone_id || process.env.WHATSAPP_PHONE_ID;
      var telDueno = rest.telefono_dueno ? "57" + String(rest.telefono_dueno).replace(/^57/,"") : null;
      // Solo loguear NO CONFIGURADO UNA vez — evita spam en logs
      if (!global._telWarnLogged) global._telWarnLogged = {};
      if (!telDueno && !global._telWarnLogged[rest.id]) {
        global._telWarnLogged[rest.id] = true;
        console.log("[AGENTE] ⚠️  Tel dueño NO CONFIGURADO para:", rest.nombre, "— ve a Config > Teléfono dueño");
      } else if (telDueno && global._telWarnLogged[rest.id]) {
        delete global._telWarnLogged[rest.id];
        console.log("[AGENTE] ✅ Tel dueño configurado para:", rest.nombre);
      }

      // Helper para alertar al dueño — clave única por restaurante + contenido completo
      var makeAlertarDueno = function(tDueno, pId, rId) {
        return async function(msg, claveUnica) {
          if (!tDueno || !pId) {
            console.log("[AGENTE] Sin tel dueño para restaurante " + rId + " — alerta no enviada: " + msg.substring(0,60));
            return;
          }
          var clave = "wa_" + rId + "_" + (claveUnica || msg.substring(0,50)).replace(/\s/g,"_").replace(/[^a-zA-Z0-9_]/g,"");
          if (agentState.alertasEnviadas.has(clave)) {
            console.log("[AGENTE] Alerta ya enviada: " + clave);
            return;
          }
          agentState.alertasEnviadas.add(clave);
          try {
            await sendWhatsAppMessage(tDueno, "🤖 *LUZ ALERTA*\n" + msg, pId);
            console.log("[AGENTE→DUEÑO] ✅ WA enviado a " + tDueno + ": " + msg.substring(0,60));
          } catch(eWA) {
            console.error("[AGENTE→DUEÑO] ❌ Error WA:", eWA.message);
          }
        };
      };
      var alertarDueno = makeAlertarDueno(telDueno, phoneId, restId);

      // 1. CANJES NUEVOS sin procesar
      try {
        var canjesR = await axios.get(
          SUPABASE_URL + "/rest/v1/canjes?estado=eq.pendiente&restaurante_id=eq." + restId + "&created_at=gte." + desde + "&select=*",
          { headers: h }
        );
        for (var canje of (canjesR.data || [])) {
          if (agentState.canjesVistosHoy.has(canje.id)) continue;
          agentState.canjesVistosHoy.add(canje.id);
          var msgClave = "canje_" + canje.id;
          if (agentState.alertasEnviadas.has(msgClave)) continue;
          agentState.alertasEnviadas.add(msgClave);
          // Buscar pedido activo
          var pedR = await axios.get(
            SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restId +
            "&cliente_tel=eq." + encodeURIComponent(canje.telefono) +
            "&estado=in.(confirmado,en_preparacion,listo)&order=created_at.desc&limit=1&select=id,numero_pedido,items,notas_especiales",
            { headers: h }
          ).catch(function(){ return { data: [] }; });
          if (pedR.data && pedR.data.length > 0) {
            var ped = pedR.data[0];
            var itemsStr = JSON.stringify(ped.items || []);
            if (itemsStr.indexOf("CANJE: " + canje.producto_nombre) === -1) {
              var items = Array.isArray(ped.items) ? [...ped.items] : [];
              items.push("🎁 CANJE: " + canje.producto_nombre + " ($0)");
              await axios.patch(SUPABASE_URL + "/rest/v1/pedidos?id=eq." + ped.id,
                { items: items, notas_especiales: (ped.notas_especiales||"") + " | ⭐ CANJE: " + canje.producto_nombre, updated_at: new Date().toISOString() },
                { headers: { ...h, "Content-Type": "application/json", "Prefer": "return=minimal" } }
              ).catch(function(){});
              await guardarMensajeSupabase(restId, canje.telefono, "⭐ CANJE: " + canje.producto_nombre + " agregado al pedido #" + ped.numero_pedido, "alerta_pregunta", null).catch(function(){});
              await alertarDueno("⭐ Canje de " + canje.producto_nombre + " aplicado al pedido #" + ped.numero_pedido + " del cliente " + canje.telefono, "canje_"+canje.id+"_ok");
            }
          } else {
            await alertarDueno("⭐ Canje pendiente: " + canje.telefono + " canjeó " + canje.producto_nombre + " pero no tiene pedido activo. Pendiente de entregar.", "canje_"+canje.id+"_pending");
          }
        }
      } catch(eCanjes) { console.error("[AGENTE] canjes:", eCanjes.message); }

      // 2. PEDIDOS CON COMPROBANTE SIN CONFIRMAR > 20 min
      try {
        var hace20 = new Date(Date.now() - 20*60*1000).toISOString();
        var pedsPagR = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?estado=eq.esperando_pago&restaurante_id=eq." + restId +
          "&updated_at=lte." + hace20 + "&select=id,numero_pedido,cliente_tel",
          { headers: h }
        );
        for (var p of (pedsPagR.data || [])) {
          var cl = "pago_pendiente_" + p.id;
          if (agentState.alertasEnviadas.has(cl)) continue;
          agentState.alertasEnviadas.add(cl);
          await guardarMensajeSupabase(restId, p.cliente_tel, "⚠️ Pedido #" + p.numero_pedido + " lleva +20min esperando confirmación de pago.", "alerta_pregunta", null).catch(function(){});
          await alertarDueno("⚠️ Pedido #" + p.numero_pedido + " del cliente " + p.cliente_tel + " lleva más de 20 minutos sin confirmar pago. Revisar.");
        }
      } catch(ePag) {}

      // 3. VALORACIONES BAJAS — alertar y sugerir acción
      try {
        var valsR = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?valoracion=lte.2&restaurante_id=eq." + restId +
          "&valoracion=not.is.null&updated_at=gte." + desde + "&select=id,numero_pedido,cliente_tel,valoracion",
          { headers: h }
        );
        for (var v of (valsR.data || [])) {
          var clv = "val_baja_" + v.id;
          if (agentState.alertasEnviadas.has(clv)) continue;
          agentState.alertasEnviadas.add(clv);
          await guardarMensajeSupabase(restId, v.cliente_tel, "⚠️ Pedido #" + v.numero_pedido + " valorado con " + v.valoracion + "⭐. Considera contactar al cliente.", "alerta_pregunta", null).catch(function(){});
          await alertarDueno("😟 Valoración baja: pedido #" + v.numero_pedido + " recibió " + v.valoracion + "⭐ de " + v.cliente_tel + ". ¿Le escribimos para mejorar su experiencia?");
        }
      } catch(eVal) {}

      // 4. PREGUNTAS SIN RESPONDER — escalamiento por tiempo
      try {
        var hace2h = new Date(Date.now() - 2*60*60*1000).toISOString();
        var pregR = await axios.get(
          SUPABASE_URL + "/rest/v1/mensajes?restaurante_id=eq." + restId +
          "&tipo=eq.alerta_pregunta&created_at=gte." + hace2h +
          "&order=created_at.asc&select=telefono,mensaje,created_at",
          { headers: h }
        ).catch(function(){ return { data: [] }; });

        for (var preg of (pregR.data || [])) {
          var mins = Math.floor((Date.now() - new Date(preg.created_at)) / 60000);
          var base = "preg_" + preg.telefono + "_" + new Date(preg.created_at).getTime();
          var msgCompleto = (preg.mensaje||"").replace(/^ALERTA_PREGUNTA:\s*/,"");

          if (mins >= 10 && !agentState.alertasEnviadas.has(base+"_10")) {
            agentState.alertasEnviadas.add(base+"_10");
            await alertarDueno("❓ Cliente sin respuesta (10min)\n📱 "+preg.telefono+":\n\""+msgCompleto+"\"\n\nAbre el panel → Chats para responder.", base+"_10");
          }
          if (mins >= 30 && !agentState.alertasEnviadas.has(base+"_30")) {
            agentState.alertasEnviadas.add(base+"_30");
            await alertarDueno("⚠️ "+mins+"min SIN RESPUESTA\n📱 "+preg.telefono+":\n\""+msgCompleto+"\"\n\nEl cliente puede irse si no responden pronto.", base+"_30");
          }
          if (mins >= 60 && !agentState.alertasEnviadas.has(base+"_60")) {
            agentState.alertasEnviadas.add(base+"_60");
            await alertarDueno("🔴 CRÍTICO — "+mins+"min sin atender\n📱 "+preg.telefono+":\n\""+msgCompleto+"\"\n\nMás de 1 hora. Riesgo de reseña negativa.", base+"_60");
          }
        }
      } catch(ePreg) { console.error("[AGENTE] preguntas:", ePreg.message); }


      // 5. REPORTE DIARIO — a las 10pm Colombia
      var horaCol = getHoraColombia().getHours();
      var diaCol = getHoraColombia().toISOString().split("T")[0];
      var claveReporte = "reporte_" + diaCol;
      if (horaCol === 22 && !agentState.alertasEnviadas.has(claveReporte)) {
        agentState.alertasEnviadas.add(claveReporte);
        try {
          var hoyStart = new Date(); hoyStart.setHours(0,0,0,0);
          var pedHoyR = await axios.get(
            SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restId +
            "&created_at=gte." + hoyStart.toISOString() + "&select=estado,total,metodo_pago",
            { headers: h }
          );
          var pedHoy = pedHoyR.data || [];
          var totalVentas = pedHoy.filter(function(p){ return p.estado!=="cancelado"; }).reduce(function(s,p){ return s+Number(p.total||0); }, 0);
          var entregados = pedHoy.filter(function(p){ return p.estado==="entregado"; }).length;
          var reporteMsg = "📊 *Reporte del día — " + rest.nombre + "*\n\n"
            + "💰 Ventas: $" + totalVentas.toLocaleString("es-CO") + "\n"
            + "📦 Pedidos: " + pedHoy.length + " | ✅ Entregados: " + entregados + "\n"
            + "💳 Nequi/Digital: " + pedHoy.filter(function(p){ return p.metodo_pago!=="efectivo"; }).length + "\n"
            + "💵 Efectivo: " + pedHoy.filter(function(p){ return p.metodo_pago==="efectivo"; }).length + "\n\n"
            + "¡Buen trabajo hoy! 🌟";
          await alertarDueno(reporteMsg);
        } catch(eRep) {}
      }
    }

    // Reset a las 4am
    var hora4 = getHoraColombia().getHours();
    if (hora4 === 4) {
      agentState.pedidosVistosHoy = new Set();
      agentState.canjesVistosHoy = new Set();
      agentState.alertasEnviadas = new Set();
    }

  } catch(eAgent) { console.error("[AGENTE] tick:", eAgent.message); }
}

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("LUZ IA corriendo en puerto " + PORT);
  console.log("Dia Colombia:", getDiaColombiaStr(), "| Hora:", getHoraColombia().toLocaleTimeString("es-CO"));

  // Iniciar el agente LUZ (cada 15 segundos)
  setTimeout(function() {
    luzAgentTick(); // primer tick inmediato
    setInterval(luzAgentTick, 15000);
    console.log("[AGENTE] ✅ LUZ Agent iniciado — monitoreando cada 15s");
  }, 5000); // esperar 5s al arrancar
  
  // Auto-reset silencios diariamente a las 6am Colombia
  var ultimoResetDia = "";
  setInterval(function() {
    var col = getHoraColombia();
    var dia = col.toISOString().split("T")[0];
    var hora = col.getHours();
    if (hora === 6 && dia !== ultimoResetDia) {
      ultimoResetDia = dia;
      var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
      axios.patch(SUPABASE_URL + "/rest/v1/silencio_conversacion?activo=eq.true",
        { activo: false, updated_at: new Date().toISOString() },
        { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
      ).then(function() { console.log("[silencio] ✅ Reset diario de silencios completado"); })
      .catch(function(e) { console.error("[silencio] Reset error:", e.message); });
    }
  }, 60000);
});

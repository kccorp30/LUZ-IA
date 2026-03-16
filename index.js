process.on("uncaughtException", function(err) {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
});

process.on("unhandledRejection", function(reason, promise) {
  console.error("UNHANDLED REJECTION:", reason);
});

const express = require("express");
const axios = require("axios");
const path = require("path");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const conversations = {};
const orderState = {};
let orderCounter = 100;

function nextOrderNumber() {
  return ++orderCounter;
}

function limpiarNumero(str) {
  if (!str) return "0";
  var s = String(str).toLowerCase().trim();
  if (s === "pendiente") return "0";
  return s.replace(/[^0-9]/g, "") || "0";
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vbxuwzcfzfjwhllkppkg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_I5lP9lq6-6t0B0K0PmjyWQ_RiIxiJM5";

async function getRestaurante(phoneNumberId) {
  try {
    if (phoneNumberId) {
      var res = await axios.get(
        SUPABASE_URL + "/rest/v1/restaurantes?whatsapp_phone_id=eq." + phoneNumberId + "&select=*",
        { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } }
      );
      if (res.data && res.data.length > 0) return res.data[0];
    }
    var fallback = await axios.get(
      SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=*&limit=1",
      { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } }
    );
    return fallback.data && fallback.data.length > 0 ? fallback.data[0] : null;
  } catch (err) {
    console.error("Error Supabase:", err.message);
    return null;
  }
}

async function guardarPedidoSupabase(restauranteId, pedidoData) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY;
    if (!svcKey) {
      console.error("ADVERTENCIA: SUPABASE_SERVICE_KEY no definida");
      svcKey = SUPABASE_KEY;
    }

    var subtotal = Number(pedidoData.total)
      - Number(pedidoData.desechables || 0)
      - Number(pedidoData.domicilio   || 0);

    var payload = {
      restaurante_id:       restauranteId,
      numero_pedido:        pedidoData.orderNumber,
      cliente_tel:          pedidoData.phone,
      items:                pedidoData.items,
      subtotal:             subtotal,
      desechables:          pedidoData.desechables,
      domicilio:            pedidoData.domicilio,
      total:                pedidoData.total,
      direccion:            pedidoData.address,
      metodo_pago:          pedidoData.paymentMethod,
      estado:               "confirmado",
      comprobante_url:      pedidoData.comprobanteUrl     || null,
      comprobante_media_id: pedidoData.comprobanteMediaId || null
    };

    console.log("Guardando pedido en Supabase:", JSON.stringify(payload));

    var response = await axios.post(
      SUPABASE_URL + "/rest/v1/pedidos",
      payload,
      {
        headers: {
          "apikey":        svcKey,
          "Authorization": "Bearer " + svcKey,
          "Content-Type":  "application/json",
          "Prefer":        "return=representation"
        }
      }
    );

    console.log("✅ Pedido #" + pedidoData.orderNumber + " guardado. ID:", response.data[0] ? response.data[0].id : "sin id");
    notificarDashboard(response.data[0]);

  } catch (err) {
    var errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("❌ Error guardando pedido:", errData);
    if (err.response) console.error("HTTP Status:", err.response.status);
  }
}

function notificarDashboard(pedido) {
  var DASHBOARD_WEBHOOK = process.env.DASHBOARD_WEBHOOK_URL;
  if (!DASHBOARD_WEBHOOK || !pedido) return;
  axios.post(DASHBOARD_WEBHOOK, { evento: "nuevo_pedido", pedido: pedido }, { timeout: 4000 })
    .then(function () { console.log("Dashboard notificado #" + pedido.numero_pedido); })
    .catch(function (err) { console.error("Error notificando dashboard:", err.message); });
}

async function guardarMensajeSupabase(restauranteId, telefono, mensaje, tipo) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(
      SUPABASE_URL + "/rest/v1/mensajes",
      { restaurante_id: restauranteId, telefono: telefono, mensaje: mensaje, tipo: tipo },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );
  } catch (e) { console.error("Error guardando mensaje:", e.message); }
}

async function obtenerMensajesSupabase(restauranteId, telefono) {
  try {
    var res = await axios.get(
      SUPABASE_URL + "/rest/v1/mensajes?restaurante_id=eq." + restauranteId + "&telefono=eq." + encodeURIComponent(telefono) + "&order=created_at.asc&limit=100",
      { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } }
    );
    return res.data || [];
  } catch (e) { return []; }
}

async function getOrderState(telefono) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var res = await axios.get(
      SUPABASE_URL + "/rest/v1/order_state?telefono=eq." + encodeURIComponent(telefono) + "&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    if (res.data && res.data.length > 0) return res.data[0].estado;
    return null;
  } catch (e) { console.error("Error getOrderState:", e.message); return null; }
}

async function setOrderState(telefono, estado) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(
      SUPABASE_URL + "/rest/v1/order_state",
      { telefono: telefono, estado: estado, updated_at: new Date().toISOString() },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } }
    );
  } catch (e) { console.error("Error setOrderState:", e.message); }
}

async function deleteOrderState(telefono) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.delete(
      SUPABASE_URL + "/rest/v1/order_state?telefono=eq." + encodeURIComponent(telefono),
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
  } catch (e) { console.error("Error deleteOrderState:", e.message); }
}

async function sb_get(pathPart) {
  try {
    var res = await axios.get(SUPABASE_URL + "/rest/v1/" + pathPart, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    return res.data;
  } catch (e) { return null; }
}

function getMenuUrl() {
  return process.env.MENU_PAGE_URL || "https://bit.ly/LaCurvaStreetFood";
}

async function descargarImagenMeta(mediaId) {
  try {
    var token = process.env.WHATSAPP_TOKEN;
    if (!token) return null;
    var urlRes = await axios.get(
      "https://graph.facebook.com/v19.0/" + mediaId,
      { headers: { "Authorization": "Bearer " + token } }
    );
    var mediaUrl = urlRes.data && urlRes.data.url;
    if (!mediaUrl) return null;
    var imgRes = await axios.get(mediaUrl, {
      headers: { "Authorization": "Bearer " + token },
      responseType: "arraybuffer"
    });
    var base64   = Buffer.from(imgRes.data).toString("base64");
    var mimeType = imgRes.headers["content-type"] || "image/jpeg";
    return "data:" + mimeType + ";base64," + base64;
  } catch (e) {
    console.error("Error descargando imagen Meta:", e.message);
    return null;
  }
}

async function sendWhatsAppMessage(to, message, phoneNumberId) {
  var token = process.env.WHATSAPP_TOKEN;
  var pid   = phoneNumberId || process.env.WHATSAPP_PHONE_ID;
  if (!token || !pid) { console.error("Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID"); return; }

  var toNum = to.replace(/[^0-9]/g, "");
  if (!toNum.startsWith("57") && toNum.length === 10) toNum = "57" + toNum;

  try {
    await axios.post(
      "https://graph.facebook.com/v19.0/" + pid + "/messages",
      { messaging_product: "whatsapp", to: toNum, type: "text", text: { body: message } },
      { headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" } }
    );
    console.log("Mensaje enviado a " + toNum);
  } catch (err) {
    var errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Error enviando WhatsApp:", errData);
  }
}

function estaEnHorario(restaurante) {
  try {
    var ahora      = new Date(Date.now() - 5 * 60 * 60 * 1000);
    var horaActual = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
    var apertura   = restaurante.hora_apertura || "16:00:00";
    var cierre     = restaurante.hora_cierre   || "00:00:00";
    var partsA     = apertura.split(":").map(Number);
    var partsC     = cierre.split(":").map(Number);
    var minApertura = partsA[0] * 60 + partsA[1];
    var minCierre   = partsC[0] * 60 + partsC[1];
    var dias    = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    var diaHoy  = dias[ahora.getUTCDay()];
    var diasAct = (restaurante.dias_activos || "lunes,martes,miercoles,jueves,viernes,sabado,domingo").split(",");
    if (!diasAct.includes(diaHoy)) return false;
    if (minCierre <= minApertura) return horaActual >= minApertura || horaActual <= minCierre;
    return horaActual >= minApertura && horaActual <= minCierre;
  } catch (e) { return true; }
}

function getMenuActivo(restaurante) {
  var modoDia = restaurante.modo_dia || false;
  if (modoDia && restaurante.menu_dia && restaurante.menu_dia.trim().length > 10) return restaurante.menu_dia;
  if (!modoDia && restaurante.menu_noche && restaurante.menu_noche.trim().length > 10) return restaurante.menu_noche;
  return MENU_TEXT;
}

function getMensaje(restaurante, clave, fallback) {
  return (restaurante && restaurante[clave] && restaurante[clave].trim())
    ? restaurante[clave].trim()
    : fallback;
}

const MENU_TEXT = `
HAMBURGUESAS TRADICIONALES:

- La especial: $18.900 (carne artesanal, pan brioche, ripio, queso, tocineta, jamon, lechuga)
- La sencilla: $16.900 (carne artesanal, pan brioche, ripio, queso, lechuga)
- La curva: $29.900 (pan brioche, ripio, lechuga, carne, queso fundido, maicitos, tocineta)
- La Mega especial: $37.900 (carne artesanal, filetes de pollo, queso, lechuga, tomate, tocineta)
- La doble carne: $24.900 (dos carnes, pan brioche, queso, tocinetas, jamon)
- La super queso: $22.900 (carne artesanal, pan brioche, lechuga, ripio, mucho queso fundido)
- La de pollo: $19.900 (pan brioche, ripio, lechuga, tomate, filete de pollo, tocineta, jamon)

HAMBURGUESAS ANGUS (todas con papa rustica, chipotle, tocineta, queso cheddar, cebolla morada):

- Angus Especial: $26.900
- Angus Doble: $36.900 (dos carnes Angus)
- Angus Mixta: $37.900 (carne + pollo)
- Madurita: $29.900 (con maduro calado)
- Montanera: $35.900 (con huevo frito y chorizo)
- Celestina: $31.900 (con costilla ahumada y salsa de guayaba)
- BBQ King: $30.900 (con aros de cebolla y salsa bbq)
- La mela: $29.400 (con cebolla caramelizada)
- Mexicana: $32.900 (con guacamole, nachos y jalapenos)

COMBOS DEL DIA:

- Aplastado especial combo: $22.900 (aplastado + papas + gaseosa)
- Hamburguesa tradicional combo: $23.900 (hamburguesa + papas + gaseosa)
- Perro italiano combo: $21.900 (perro italiano + papas + gaseosa)
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

ALITAS (con salsa ajo, bbq, mielmostaza, papa amarilla, palitos zanahoria):

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

ASADOS JUNIOR (250gr, con papa francesa y ensalada):

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
- Coca-Cola 1.5L: $8.900 (tambien conocida como "litro y cuarto")
- Mr. Tee: $4.500
- Jugo Hit: $4.900

MENU KIDS (incluye jugo Hit cajita + sorpresa):

- Nuggets con francesa: $22.900
- Burguer con francesa: $25.900
- Salchipapa con ranchera: $21.400
- Perro con francesa: $21.400
`;

const SYSTEM_PROMPT = `Eres Luz, la encargada de atencion al cliente de La Curva Street Food, restaurante de comida callejera en Canaveral, Cali. Direccion: Cl. 16 #56-40, Comuna 17, Cali.

PERSONALIDAD:

- Eres una persona real, calenya, calida y cercana. Nunca admitas ser IA.
- Tu nombre es Luz. Solo preséntate LA PRIMERA VEZ que alguien te escribe en una conversación nueva. Si ya hubo mensajes antes, NO te presentes de nuevo.
- Hablas natural. Usas: "con gusto", "a listo", "claro que si", "digame", "ya le confirmo". Ocasionalmente "Dama" o "Caballero".
- SIEMPRE responde en UN SOLO mensaje. Nunca mandes 2 o 3 mensajes separados.
- Respuestas cortas y al grano.
- NUNCA mandes el link del menu dos veces en la misma conversacion. Solo la primera vez.
- Nunca seas fría ni cortante. Siempre cálida y cercana.

MENSAJES DE VOZ:
Si el cliente envia un audio responde: "Hola! Por favor escribeme tu pedido, no puedo escuchar audios por acá. Con gusto te atiendo."

INFORMACION:

- Ubicacion: UBICACION_PLACEHOLDER
- Domicilio: sur de Cali y parte del centro
- Tiempo estimado: 25 a 45 minutos

HORARIO_PLACEHOLDER

METODOS DE PAGO:

- Nequi: @NEQUIJOS126
- Bancolombia llave: 0089102980 (Jose Gregorio Charris)
- Efectivo: domiciliario lleva cambio (pregunta con que billete cancela)
- Datafono: domiciliario lo lleva
- Pago mixto: acepta parte digital + parte efectivo.
- NUNCA esperes a que el cliente pida los datos de pago. Delos siempre tu primero.

PROMOCIONES SEMANALES:

- Lunes y Jueves: Pague 2 lleve 3 hamburguesas tradicionales
- Martes: Pague 2 lleve 3 en todos los perros
- Jueves: Pague 2 lleve 3 en Angus BBQ King o Celestina
- Domingos: Pague 2 lleve 3 en asados junior

MENU ACTIVO:
MENU_PLACEHOLDER

PAGINA VISUAL DEL MENU:
Cuando un cliente pida el menu o diga que quiere pedir, ofrece siempre:
"Te comparto nuestro menu completo 👉 MENU_URL_PLACEHOLDER — ahi armas tu pedido y me lo mandas. O me dices aqui mismo con gusto."

DESECHABLES — REGLA CRITICA:

- $500 por cada producto de COMIDA.
- BEBIDAS NO cobran desechable.
- AREPAS tampoco cobran desechable.

DOMICILIO — pregunta siempre la direccion completa:

- $2.000: Canaveral
- $4.000: San Judas, La Granja, La Selva, Santo Domingo
- $6.000: Ciudad Jardin, Pance, Tequendama, El Ingenio, Pampalinda, Melendez, Univalle, Lili, Mojica, Poblado, Mario Correa, Valle del Lili, Calipso, Compartir, Capri, Niza, Caney, Santa Barbara, San Joaquin, centro (San Nicolas, San Bosco, Santa Rosa, Salomia), extremos norte, extremos sur
- Si no reconoces el barrio: $4.000 y avisa que puede variar $1.000.

CALCULO — SIEMPRE muestra este desglose:
Productos:    $XX.XXX
Desechables:  $XXX
Domicilio:    $X.XXX
TOTAL:        $XX.XXX

REGLA ANTI-DUPLICADOS:
- Si el cliente escribe mal y repite corregido, toma SOLO la version corregida.
- Verifica que no haya duplicados antes de confirmar.

REGLA DE ORO:
- Si el cliente ya dio producto + direccion + pago en el mismo mensaje, confirma TODO de una vez.
- NUNCA preguntes algo que el cliente ya respondio.

PEDIDO DESDE PAGINA DE MENU:
- Si el cliente llega con un mensaje que ya incluye productos con precios y totales (formato de la pagina del menu con bullets y precios), escribe INMEDIATAMENTE las señales ocultas PEDIDO_LISTO con esos productos.
- No esperes confirmacion adicional — el cliente ya eligio sus productos desde la pagina visual.
- Calcula desechables ($500 por cada comida, no bebidas ni arepas) con los productos recibidos.
- En DOMICILIO escribe 0 porque aun no sabes el barrio.
- En TOTAL escribe solo productos + desechables sin domicilio.
- Luego en el mismo mensaje pide la direccion completa al cliente.

MODIFICAR PEDIDO EN CURSO:
- Si el cliente quiere agregar un producto MIENTRAS el pedido ya esta registrado (antes de confirmar el pago), escribe de nuevo PEDIDO_LISTO completo con TODOS los productos — los anteriores MAS el nuevo.
- Recalcula desechables y total con todos los productos.
- NUNCA pierdas los productos anteriores al actualizar.

MODIFICACIONES: acepta "sin queso", "extra salsa", etc.

QUEJAS POR FALTANTES:
- Si el cliente dice que le faltó algo, ofrécelo de inmediato sin preguntar.

JERGA: "litro y cuarto" = Coca-Cola 1.5L. "una gaseosa" = pregunta cual.

VENTAS:
- Eres vendedora. Tu objetivo es que el cliente pida más y quede feliz.
- Cuando el cliente confirme su pedido, SIEMPRE ofrece algo adicional de forma natural.
- Solo ofrece UNA cosa adicional.
- Cuando aplique una promoción del dia, mencionala con entusiasmo.

FLUJO:
1. Saludo -> UN mensaje amable + ofrece link del menu
2. Cliente pide -> confirma productos con precios
3. Pide la direccion completa: calle, numero, barrio y cualquier referencia. Ejemplo: "Me regalas la direccion completa — calle, numero y barrio?"
4. Con direccion -> identifica barrio, calcula domicilio y muestra desglose completo
5. Cliente confirma -> pregunta pago Y da datos de inmediato
6. Pago:
- Nequi: "Transferi a @NEQUIJOS126 y mandame el comprobante"
- Bancolombia: "Transferi a la llave 0089102980 a nombre de Jose Gregorio Charris y mandame el comprobante"
- Efectivo: pregunta billete -> escribe PAGO_EFECTIVO:[denominacion]
- Datafono: confirma -> escribe PAGO_DATAFONO
7. Cliente envia comprobante -> escribe PAGO_CONFIRMADO
8. Cuando el pedido quede confirmado di siempre exactamente: "Listo! Tu pedido quedó confirmado. Te estaremos informando el estado 🙏" — NUNCA digas que va en camino ni des tiempo estimado en este momento.

MENSAJES DESPUES DE PEDIDO CONFIRMADO:
- Una vez que el pedido quedo confirmado, el cliente puede enviar mensajes cortos de respuesta como "ok", "gracias", "listo", "perfecto", "en camino", "ya sale", "bueno", "dale", "okis", "👍", "😊" u otras reacciones cortas.
- Para estos mensajes responde SOLO con algo breve y calido: "Con gusto! Que disfrutes 🙏", "A la orden!", "Con mucho gusto 😊" o similar.
- NUNCA vuelvas a presentarte, NUNCA vuelvas a mandar el link del menu, NUNCA reinicies el flujo de pedido.
- SOLO inicia un nuevo flujo de pedido si el cliente dice explicitamente algo como: "quiero pedir", "para un domicilio", "quiero otro pedido", "nuevo pedido", "me puedes traer", "quiero ordenar", "para pedir" o cualquier frase que claramente indique una nueva intención de compra.
- Si no estás segura si es un nuevo pedido o una respuesta al estado, responde brevemente sin iniciar flujo nuevo.

⚠️ OBLIGATORIO — EN CADA RESPUESTA DONDE CONFIRMES PRODUCTOS escribe SIEMPRE esto al final, sin excepcion:
PEDIDO_LISTO:
ITEMS: [producto1 $precio|producto2 $precio]
DESECHABLES: [solo el numero sin puntos ni $ — ejemplo: 500 o 1000 o 1500]
DOMICILIO: [solo el numero sin puntos ni $ — si no sabes escribe 0]
TOTAL: [solo el numero sin puntos ni $ — ejemplo: 23400]

Si no escribes PEDIDO_LISTO el sistema no puede procesar el pedido. ES OBLIGATORIO.
CUANDO TENGAS DIRECCION: DIRECCION_LISTA:[direccion completa con calle numero y barrio]
TELEFONO ADICIONAL: TELEFONO_ADICIONAL:[numero]

REGLAS FINALES:
- NUNCA digas que eres IA. Eres Luz, la encargada de atencion.
- Aplica promociones del dia automaticamente.
- Si piden algo que no existe, ofrece alternativas similares.`;

async function printTicket(orderData) {
  var orderNumber      = orderData.orderNumber;
  var items            = orderData.items;
  var total            = orderData.total;
  var desechables      = orderData.desechables;
  var domicilio        = orderData.domicilio;
  var address          = orderData.address;
  var paymentMethod    = orderData.paymentMethod;
  var cashDenomination = orderData.cashDenomination;
  var extraPhone       = orderData.extraPhone;
  var phone            = orderData.phone;
  var timestamp        = orderData.timestamp;

  var subtotal = Number(total) - Number(desechables || 0) - Number(domicilio || 0);

  var pagoLabel =
    paymentMethod === "efectivo"    ? "Efectivo - billete: " + cashDenomination :
    paymentMethod === "datafono"    ? "Datafono (llevar)" :
    paymentMethod === "bancolombia" ? "Bancolombia llave: 0089102980" :
    "Nequi @NEQUIJOS126";

  var lines = [
    "================================",
    "     LA CURVA STREET FOOD      ",
    "    Canaveral - Cali, Col.     ",
    "================================",
    "Pedido #" + orderNumber,
    "Hora: " + timestamp,
    "Tel: " + phone.replace(/[^0-9]/g, ""),
    extraPhone ? "Tel adicional: " + extraPhone : null,
    "––––––––––––––––",
    "PRODUCTOS:",
  ].filter(function (l) { return l !== null; });

  items.forEach(function (i) { lines.push("  " + i); });

  lines = lines.concat([
    "––––––––––––––––",
    "Subtotal:    $" + subtotal.toLocaleString("es-CO"),
    "Desechables: $" + Number(desechables || 0).toLocaleString("es-CO"),
    "Domicilio:   $" + Number(domicilio || 0).toLocaleString("es-CO"),
    "––––––––––––––––",
    "TOTAL:       $" + Number(total).toLocaleString("es-CO"),
    "––––––––––––––––",
    "Direccion: " + address,
    "Pago: " + pagoLabel,
    "================================",
    "     GRACIAS POR SU PEDIDO     ",
    "================================",
    ""
  ]);

  var ticketText = lines.join("\n");
  console.log("\n TICKET PARA COCINA:");
  console.log(ticketText);

  var PRINT_SERVER = process.env.PRINT_SERVER_URL || "http://localhost:3001/print";
  var PRINT_SECRET = process.env.PRINT_SECRET     || "lacurva2024";

  var ticketPayload = {
    secret: PRINT_SECRET, orderNumber: orderNumber, timestamp: timestamp,
    phone: phone.replace(/[^0-9]/g, ""), extraPhone: extraPhone || null,
    items: items, subtotal: subtotal,
    desechables: Number(desechables || 0), domicilio: Number(domicilio || 0),
    total: Number(total), address: address,
    paymentMethod: paymentMethod, cashDenomination: cashDenomination || null
  };

  axios.post(PRINT_SERVER, ticketPayload, { timeout: 6000 })
    .then(function () { console.log("Ticket #" + orderNumber + " enviado a impresora"); })
    .catch(function (err) { console.error("Error impresora:", err.message); });

  return ticketText;
}

function parseReply(reply, from) {
  var cleanReply = reply;
  var sideEffect = null;

  if (reply.indexOf("PEDIDO_LISTO:") !== -1) {
    var itemsMatch     = reply.match(/ITEMS:\s*(.+)/);
    var totalMatch     = reply.match(/TOTAL:\s*([^\n]+)/);
    var desechMatch    = reply.match(/DESECHABLES:\s*([^\n]+)/);
    var domicilioMatch = reply.match(/DOMICILIO:\s*([^\n]+)/);

    if (itemsMatch && totalMatch) {
      var items       = itemsMatch[1].split("|").map(function (i) { return i.trim(); });
      var total       = limpiarNumero(totalMatch[1]);
      var desechables = limpiarNumero(desechMatch ? desechMatch[1] : "0");
      var domicilio   = limpiarNumero(domicilioMatch ? domicilioMatch[1] : "0");
      var orderNumber = nextOrderNumber();

      orderState[from] = {
        status:      "esperando_direccion",
        orderNumber: orderNumber,
        items:       items,
        desechables: desechables,
        domicilio:   domicilio,
        total:       total
      };
      console.log("📦 orderState creado para:", from, "pedido #" + orderNumber, "total:", total, "desech:", desechables, "domi:", domicilio);
      sideEffect = "pedido_registrado";
    }

    cleanReply = cleanReply
      .replace(/PEDIDO_LISTO:[\s\S]*?(?=DIRECCION_LISTA:|TELEFONO_ADICIONAL:|PAGO_|$)/g, "")
      .trim();
  }

  if (reply.indexOf("DIRECCION_LISTA:") !== -1) {
    var dirMatch = reply.match(/DIRECCION_LISTA:(.+)/);
    if (dirMatch && orderState[from]) {
      orderState[from].address = dirMatch[1].trim();
      orderState[from].status  = "esperando_pago";
      sideEffect = "direccion_registrada";
    }
    cleanReply = cleanReply.replace(/DIRECCION_LISTA:.+/g, "").trim();
  }

  if (reply.indexOf("TELEFONO_ADICIONAL:") !== -1) {
    var telMatch = reply.match(/TELEFONO_ADICIONAL:(.+)/);
    if (telMatch && orderState[from]) orderState[from].extraPhone = telMatch[1].trim();
    cleanReply = cleanReply.replace(/TELEFONO_ADICIONAL:.+/g, "").trim();
  }

  if (reply.indexOf("PAGO_EFECTIVO:") !== -1) {
    var cashMatch = reply.match(/PAGO_EFECTIVO:(.+)/);
    if (cashMatch && orderState[from]) {
      orderState[from].paymentMethod    = "efectivo";
      orderState[from].cashDenomination = cashMatch[1].trim();
      orderState[from].status           = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = cleanReply.replace(/PAGO_EFECTIVO:.+/g, "").trim();
  }

  if (reply.indexOf("PAGO_DATAFONO") !== -1) {
    if (orderState[from]) {
      orderState[from].paymentMethod = "datafono";
      orderState[from].status        = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = cleanReply.replace("PAGO_DATAFONO", "").trim();
  }

  if (reply.indexOf("PAGO_CONFIRMADO") !== -1) {
    console.log("✅ PAGO_CONFIRMADO detectado para:", from);
    console.log("📦 orderState actual:", JSON.stringify(orderState[from]));
    if (orderState[from]) {
      orderState[from].paymentMethod = orderState[from].paymentMethod || "digital";
      orderState[from].status        = "confirmado";
      sideEffect = "pago_confirmado";
    } else {
      console.error("❌ orderState VACIO para:", from, "— intentando recuperar de Supabase");
    }
    cleanReply = cleanReply.replace("PAGO_CONFIRMADO", "").trim();
  }

  return { cleanReply: cleanReply, sideEffect: sideEffect };
}

app.get("/menu",        function (req, res) { res.sendFile(path.join(__dirname, "menu.html")); });
app.get("/admin",       function (req, res) { res.sendFile(path.join(__dirname, "admin.html")); });
app.get("/restaurante", function (req, res) { res.sendFile(path.join(__dirname, "restaurante.html")); });

app.post("/api/pedido-estado", async function (req, res) {
  var id              = req.body.id;
  var estado          = req.body.estado;
  var telefonoCliente = req.body.telefono_cliente;
  var numeroPedido    = req.body.numero_pedido || "";
  var restauranteId   = req.body.restaurante_id || null;

  console.log("PATCH pedido — id:", id, "estado:", estado);
  if (!id || !estado) return res.status(400).json({ error: "Faltan datos" });

  var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;

  try {
    await axios.patch(
      SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id,
      { estado: estado },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } }
    );

    if (telefonoCliente) {
      var restaurante = null;
      if (restauranteId) {
        try {
          var rr = await axios.get(
            SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restauranteId + "&select=*",
            { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } }
          );
          if (rr.data && rr.data.length > 0) restaurante = rr.data[0];
        } catch(e) { console.error("Error buscando restaurante:", e.message); }
      }

      var numStr = numeroPedido ? " #" + numeroPedido : "";

      if (estado === "en_preparacion") {
        var msgPrep = getMensaje(restaurante, "msg_en_preparacion",
          "👨‍🍳 ¡Tu pedido" + numStr + " ya está en preparación! En breve estará listo.");
        await sendWhatsAppMessage(telefonoCliente, msgPrep, process.env.WHATSAPP_PHONE_ID);
        console.log("Cliente notificado: en_preparacion");
      }
      if (estado === "listo") {
        var msgListo = getMensaje(restaurante, "msg_listo",
          "✅ ¡Tu pedido" + numStr + " está listo y esperando al domiciliario! Pronto va en camino 🛵");
        await sendWhatsAppMessage(telefonoCliente, msgListo, process.env.WHATSAPP_PHONE_ID);
        console.log("Cliente notificado: listo");
      }
      if (estado === "en_camino") {
        var msgCamino = getMensaje(restaurante, "msg_en_camino",
          "🛵 Tu pedido" + numStr + " ya va en camino. Llega en 25-35 minutos. ¡Que lo disfrutes!");
        await sendWhatsAppMessage(telefonoCliente, msgCamino, process.env.WHATSAPP_PHONE_ID);
        console.log("Cliente notificado: en_camino");
      }
    }

    res.json({ ok: true });
  } catch (err) {
    var errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Error actualizando pedido:", errData);
    res.status(500).json({ ok: false, error: errData });
  }
});

app.post("/api/menu-toggle", async function (req, res) {
  var id = req.body.id; var disponible = req.body.disponible;
  if (!id) return res.status(400).json({ error: "Falta id" });
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/menu_items?id=eq." + id, { disponible: disponible },
      { headers: { "apikey": process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY, "Authorization": "Bearer " + (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/menu-add", async function (req, res) {
  try {
    await axios.post(SUPABASE_URL + "/rest/v1/menu_items", req.body,
      { headers: { "apikey": process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY, "Authorization": "Bearer " + (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY), "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/restaurante-config", async function (req, res) {
  var restauranteId = req.body.restaurante_id;
  var config        = req.body.config;
  if (!restauranteId || !config) return res.status(400).json({ error: "Faltan datos" });
  var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  try {
    await axios.patch(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restauranteId, config,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "return=minimal" } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.response ? JSON.stringify(err.response.data) : err.message });
  }
});

app.post("/enviar-mensaje-cliente", async function (req, res) {
  var telefono = req.body.telefono; var mensaje = req.body.mensaje;
  if (!telefono || !mensaje) return res.status(400).json({ error: "Faltan datos" });
  try {
    await sendWhatsAppMessage(telefono, mensaje, process.env.WHATSAPP_PHONE_ID);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/notificar-cliente", async function (req, res) {
  var telefono      = req.body.telefono;
  var restauranteId = req.body.restaurante_id || null;
  var numeroPedido  = req.body.numero_pedido  || "";
  if (!telefono) return res.status(400).json({ error: "Telefono requerido" });
  var restaurante = null;
  if (restauranteId) {
    try {
      var rr = await axios.get(SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restauranteId + "&select=*",
        { headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } });
      if (rr.data && rr.data.length > 0) restaurante = rr.data[0];
    } catch(e) {}
  }
  var numStr = numeroPedido ? " #" + numeroPedido : "";
  var msg = getMensaje(restaurante, "msg_en_camino",
    "🛵 Tu pedido" + numStr + " ya va en camino. Llega en 25-35 minutos. ¡Que lo disfrutes!");
  try {
    await sendWhatsAppMessage(telefono, msg, process.env.WHATSAPP_PHONE_ID);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/enviar-promo", async function (req, res) {
  var restauranteId = req.body.restaurante_id; var mensaje = req.body.mensaje;
  if (!restauranteId || !mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    var resp = await axios.get(
      SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restauranteId + "&created_at=gte." + hace30 + "&select=cliente_tel",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    var unicos = {};
    (resp.data || []).forEach(function (p) { if (p.cliente_tel) unicos[p.cliente_tel] = true; });
    var telefonos = Object.keys(unicos);
    if (!telefonos.length) return res.json({ ok: true, enviados: 0, fallidos: 0, total: 0 });
    var enviados = 0, fallidos = 0;
    for (var i = 0; i < telefonos.length; i++) {
      try { await sendWhatsAppMessage(telefonos[i], mensaje, process.env.WHATSAPP_PHONE_ID); enviados++; }
      catch (e) { fallidos++; }
      if (i < telefonos.length - 1) await new Promise(function (r) { setTimeout(r, 300); });
    }
    res.json({ ok: true, enviados: enviados, fallidos: fallidos, total: telefonos.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.response ? JSON.stringify(err.response.data) : err.message });
  }
});

app.get("/api/comprobante/:mediaId", async function (req, res) {
  var mediaId = req.params.mediaId;
  try {
    var imgData = await descargarImagenMeta(mediaId);
    if (!imgData) return res.status(404).json({ error: "No se pudo obtener la imagen" });
    var matches = imgData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches) return res.status(500).json({ error: "Formato inválido" });
    var buffer = Buffer.from(matches[2], "base64");
    res.setHeader("Content-Type", matches[1]);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/chat/:telefono", async function (req, res) {
  var telefono      = req.params.telefono;
  var restauranteId = req.query.restaurante_id;
  if (!restauranteId) return res.json({ ok: true, mensajes: [] });
  var mensajes = await obtenerMensajesSupabase(restauranteId, telefono);
  res.json({ ok: true, mensajes: mensajes });
});

app.delete("/api/pedido/:id", async function (req, res) {
  var id     = req.params.id;
  var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  try {
    await axios.delete(
      SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id,
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get("/webhook", function (req, res) {
  var mode = req.query["hub.mode"], token = req.query["hub.verify_token"], challenge = req.query["hub.challenge"];
  var VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "luz_verify_token_2026";
  if (mode === "subscribe" && token === VERIFY_TOKEN) { console.log("Webhook verificado"); return res.status(200).send(challenge); }
  if (!mode) return res.send("LUZ esta activa - La Curva Street Food");
  res.sendStatus(403);
});

app.post("/webhook", async function (req, res) {
  res.sendStatus(200);

  try {
    var body = req.body;
    if (!body.object || body.object !== "whatsapp_business_account") return;

    var entry   = body.entry   && body.entry[0];
    var changes = entry        && entry.changes && entry.changes[0];
    var value   = changes      && changes.value;

    if (!value || !value.messages || value.messages.length === 0) return;

    var msg           = value.messages[0];
    var from          = msg.from;
    var phoneNumberId = value.metadata && value.metadata.phone_number_id;
    var msgType       = msg.type;

    if (msgType === "audio") {
      await sendWhatsAppMessage(from, "Hola! Por favor escríbeme tu pedido, no puedo escuchar audios por acá 🙏 Con gusto te atiendo.", phoneNumberId);
      return;
    }

    var userText      = "";
    var mediaId       = null;
    var esComprobante = false;

    if (msgType === "text") {
      userText = msg.text && msg.text.body ? msg.text.body.trim() : "";
    } else if (msgType === "image" || msgType === "document" || msgType === "sticker") {
      mediaId       = msg.image ? msg.image.id : (msg.document ? msg.document.id : null);
      esComprobante = true;
      var caption   = msg.image ? msg.image.caption : (msg.document ? msg.document.caption : "");
      userText = caption
        ? caption + " [El cliente envio una imagen, posiblemente comprobante de pago]"
        : "[El cliente envio una imagen, posiblemente comprobante de pago de Nequi o Bancolombia]";
    } else if (msgType === "location") {
      var loc = msg.location;
      userText = "Mi ubicacion es: lat " + loc.latitude + ", lng " + loc.longitude + (loc.name ? " (" + loc.name + ")" : "");
    } else if (msgType === "interactive") {
      if (msg.interactive.type === "button_reply") userText = msg.interactive.button_reply.title;
      else if (msg.interactive.type === "list_reply") userText = msg.interactive.list_reply.title;
    } else {
      console.log("Tipo no soportado: " + msgType);
      return;
    }

    if (!userText) return;

    // Recuperar orderState de Supabase si no está en memoria
    if (!orderState[from]) {
      var savedState = await getOrderState(from);
      if (savedState) {
        orderState[from] = savedState;
        console.log("📦 orderState recuperado de Supabase para:", from);
      }
    }

    var restaurante = await getRestaurante(phoneNumberId);

    if (restaurante) {
      if (restaurante.estado !== "activo") { console.log("Restaurante inactivo"); return; }
      if (!estaEnHorario(restaurante)) { console.log("Fuera de horario"); return; }
      console.log("Restaurante activo: " + restaurante.nombre);
    }

    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: userText });
    if (conversations[from].length > 20) conversations[from] = conversations[from].slice(-20);

    var menuActivo  = restaurante ? getMenuActivo(restaurante) : MENU_TEXT;
    var ubicacion   = (restaurante && restaurante.direccion) ? restaurante.direccion : "Cl. 16 #56-40, Canaveral, Cali";
    var horarioInfo = restaurante
      ? "Atiendes de " + (restaurante.hora_apertura || "16:00").substring(0,5) + " a " + (restaurante.hora_cierre || "00:00").substring(0,5) + ". Estás en horario activo ahora."
      : "Atiendes de 4:00pm a 12:00am.";

    var bienvenidaExtra = "";
    var msgBienvenidaConf = getMensaje(restaurante, "msg_bienvenida", "");
    if (msgBienvenidaConf && conversations[from].length === 1) {
      bienvenidaExtra = "\n\nMENSAJE DE BIENVENIDA PERSONALIZADO (usa este texto como base para tu primer saludo, adaptándolo naturalmente):\n" + msgBienvenidaConf;
    }

    var systemFinal = SYSTEM_PROMPT
      .replace("MENU_URL_PLACEHOLDER", getMenuUrl())
      .replace("MENU_PLACEHOLDER", menuActivo)
      .replace("UBICACION_PLACEHOLDER", ubicacion)
      .replace("HORARIO_PLACEHOLDER", "HORARIO: " + horarioInfo)
      + bienvenidaExtra;

    var claudeResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: "claude-haiku-4-5-20251001", max_tokens: 2000, system: systemFinal, messages: conversations[from] },
      { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } }
    );

    if (!claudeResponse.data || !claudeResponse.data.content || !claudeResponse.data.content[0]) {
      console.error("Respuesta inválida de Claude:", JSON.stringify(claudeResponse.data));
      await sendWhatsAppMessage(from, "Hola! En este momento tengo un problemita técnico. Escríbeme en un momento 🙏", phoneNumberId);
      return;
    }

    var rawReply   = claudeResponse.data.content[0].text;
    console.log("🤖 RAW:", rawReply.substring(0, 600));
    var parsed     = parseReply(rawReply, from);
    var cleanReply = parsed.cleanReply;
    var sideEffect = parsed.sideEffect;

    if (esComprobante && mediaId && orderState[from]) {
      orderState[from].comprobanteMediaId = mediaId;
      orderState[from].comprobanteUrl     = "/api/comprobante/" + mediaId;
      console.log("Comprobante guardado:", mediaId);
    }

    conversations[from].push({ role: "assistant", content: rawReply });

    await sendWhatsAppMessage(from, cleanReply, phoneNumberId);

    console.log("De " + from + ": " + userText);
    console.log("Luz: " + cleanReply.substring(0, 100));

    if (restaurante) {
      guardarMensajeSupabase(restaurante.id, from, userText, "cliente").catch(function(){});
      guardarMensajeSupabase(restaurante.id, from, cleanReply, "restaurante").catch(function(){});
    }

    // Persistir orderState en Supabase después de cada mensaje
    if (orderState[from]) {
      await setOrderState(from, orderState[from]);
    }

    console.log("🎯 sideEffect:", sideEffect, "| orderState existe:", !!orderState[from]);

    if (sideEffect === "pago_confirmado" && orderState[from]) {
      var state     = orderState[from];
      var timestamp = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

      await printTicket({
        orderNumber:      state.orderNumber,
        items:            state.items,
        desechables:      state.desechables,
        domicilio:        state.domicilio,
        total:            state.total,
        address:          state.address          || "Por confirmar",
        paymentMethod:    state.paymentMethod    || "digital",
        cashDenomination: state.cashDenomination || null,
        extraPhone:       state.extraPhone       || null,
        phone:            from,
        timestamp:        timestamp
      });

      console.log("Pedido #" + state.orderNumber + " confirmado");

      var restId = restaurante ? restaurante.id : null;
      console.log("🔍 restId inicial:", restId);
      if (!restId) {
        try {
          var svcKey2 = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
          var restFallback = await axios.get(
            SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=id&limit=1",
            { headers: { "apikey": svcKey2, "Authorization": "Bearer " + svcKey2 } }
          );
          if (restFallback.data && restFallback.data.length > 0) restId = restFallback.data[0].id;
          console.log("🔍 restId por fallback:", restId);
        } catch (e) { console.error("Error fallback restaurante:", e.message); }
      }

      if (restId) {
        await guardarPedidoSupabase(restId, {
          orderNumber:        state.orderNumber,
          phone:              from,
          items:              state.items,
          subtotal:           Number(state.total) - Number(state.desechables || 0) - Number(state.domicilio || 0),
          desechables:        Number(state.desechables || 0),
          domicilio:          Number(state.domicilio   || 0),
          total:              Number(state.total),
          address:            state.address            || "Por confirmar",
          paymentMethod:      state.paymentMethod      || "digital",
          comprobanteUrl:     state.comprobanteUrl     || null,
          comprobanteMediaId: state.comprobanteMediaId || null
        });
      } else {
        console.error("❌ No se pudo guardar pedido — restaurante no encontrado");
      }

      delete orderState[from];
      await deleteOrderState(from);
    }

  } catch (err) {
    console.error("Error webhook POST:", err.response ? JSON.stringify(err.response.data) : err.message);
  }
});

app.get("/pedidos", function (req, res) {
  res.json({ activos: Object.keys(orderState).length, pedidos: orderState });
});

app.get("/", function (req, res) {
  res.json({
    status: "La Curva Bot activo - WhatsApp Cloud API (Meta)",
    menu_url: getMenuUrl(), hora: new Date().toLocaleString("es-CO"),
    conversaciones_activas: Object.keys(conversations).length,
    pedidos_activos: Object.keys(orderState).length
  });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log("La Curva Street Food - LUZ corriendo en puerto " + PORT);
  console.log("WhatsApp Cloud API (Meta) activa");
  console.log("Menu disponible en: " + getMenuUrl());
});

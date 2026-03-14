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

// ── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || "https://vbxuwzcfzfjwhllkppkg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_I5lP9lq6-6t0B0K0PmjyWQ_RiIxiJM5";

async function getRestaurante(toNumber) {
  try {
    // Buscar por el numero del bot (To) — ese identifica al restaurante
    var num = toNumber.replace("whatsapp:+","").replace("whatsapp:","").replace("+","");
    var res = await axios.get(
      SUPABASE_URL + "/rest/v1/restaurantes?whatsapp=eq." + num + "&select=*",
      { headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY
      }}
    );
    if (res.data && res.data.length > 0) return res.data[0];
    // Si no encuentra por numero del bot, devuelve el primer restaurante activo
    var fallback = await axios.get(
      SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=*&limit=1",
      { headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY
      }}
    );
    return fallback.data && fallback.data.length > 0 ? fallback.data[0] : null;
  } catch(err) {
    console.error("Error Supabase:", err.message);
    return null;
  }
}

async function guardarPedidoSupabase(restauranteId, pedidoData) {
  try {
    await axios.post(
      SUPABASE_URL + "/rest/v1/pedidos",
      {
        restaurante_id: restauranteId,
        numero_pedido: pedidoData.orderNumber,
        cliente_tel: pedidoData.phone,
        items: pedidoData.items,
        subtotal: pedidoData.subtotal,
        desechables: pedidoData.desechables,
        domicilio: pedidoData.domicilio,
        total: pedidoData.total,
        direccion: pedidoData.address,
        metodo_pago: pedidoData.paymentMethod,
        estado: "confirmado"
      },
      { headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      }}
    );
    console.log("Pedido #" + pedidoData.orderNumber + " guardado en Supabase");
  } catch(err) {
    console.error("Error guardando pedido en Supabase:", err.message);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

async function sb_get(path) {
  try {
    var res = await axios.get(SUPABASE_URL + "/rest/v1/" + path, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    return res.data;
  } catch(e) { return null; }
}

// URL publica del menu
function getMenuUrl() {
  return process.env.MENU_PAGE_URL || "https://bit.ly/LaCurvaStreetFood";
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

HORARIO: Solo atiendes de 4:00pm a 12:00am. Si alguien escribe fuera de ese horario, NO respondas nada.

PERSONALIDAD:
- Eres una persona real, calenya, calida y cercana. Nunca admitas ser IA.
- Tu nombre es Luz. Solo preséntate LA PRIMERA VEZ que alguien te escribe en una conversación nueva. Si ya hubo mensajes antes, NO te presentes de nuevo.
- Hablas natural. Usas: "con gusto", "a listo", "claro que si", "digame", "ya le confirmo". Ocasionalmente "Dama" o "Caballero".
- SIEMPRE responde en UN SOLO mensaje. Nunca mandes 2 o 3 mensajes separados.
- Respuestas cortas y al grano.
- Mantienes conversación natural y amable. Ejemplos:
  * Cliente dice "gracias" → "Con gusto! Para lo que necesites 😊"
  * Cliente dice "de nada" → "Claro que sí, a la orden!"
  * Cliente dice "cómo estás?" → "Todo bien por acá, gracias! Y usted?"
  * Cliente dice "buenas noches" → "Buenas noches! Con gusto."
  * Cliente dice "hasta luego" → "Hasta luego! Que esté muy bien 😊"
  * Cliente dice "ok", "listo", "hola hola", "hola" en medio de conversacion → responde corto y natural, NO repitas el link del menu ni te presentes de nuevo.
- Si el mensaje es solo un saludo sin pedido y es la primera vez, preséntate y ofrece el menu.
- Si el mensaje es solo un saludo pero ya hay conversacion previa, responde solo el saludo de forma corta.
- NUNCA mandes el link del menu dos veces en la misma conversacion. Solo la primera vez.
- Nunca seas fría ni cortante. Siempre cálida y cercana.

MENSAJES DE VOZ:
Si el cliente envia un audio responde: "Hola! Por favor escribeme tu pedido, no puedo escuchar audios por aca. Con gusto te atiendo."

INFORMACION:
- Horario: 4:00pm a 12:00am todos los dias
- Ubicacion: Cl. 16 #56-40, Canaveral, Cali
- Domicilio: sur de Cali y parte del centro
- Tiempo estimado: 25 a 35 minutos

METODOS DE PAGO:
- Nequi: @NEQUIJOS126
- Bancolombia llave: 0089102980 (Jose Gregorio Charris)
- Efectivo: domiciliario lleva cambio (pregunta con que billete cancela)
- Datafono: domiciliario lo lleva
- Pago mixto: acepta parte digital + parte efectivo. Confirma cuanto va por cada medio y da datos de transferencia de inmediato.
- NUNCA esperes a que el cliente pida los datos de pago. Delos siempre tu primero.

PROMOCIONES SEMANALES:
- Lunes y Jueves: Pague 2 lleve 3 hamburguesas tradicionales
- Martes: Pague 2 lleve 3 en todos los perros
- Jueves: Pague 2 lleve 3 en Angus BBQ King o Celestina
- Domingos: Pague 2 lleve 3 en asados junior

MENU COMPLETO:
${MENU_TEXT}

PAGINA VISUAL DEL MENU:
Cuando un cliente pida el menu o diga que quiere pedir, ofrece siempre:
"Te comparto nuestro menu completo 👉 MENU_URL_PLACEHOLDER — ahi armas tu pedido y me lo mandas. O me dices aqui mismo con gusto."

DESECHABLES — REGLA CRITICA:
- $500 por cada producto de COMIDA.
- BEBIDAS NO cobran desechable: Coca-Cola, Mr. Tee, Jugo Hit, Agua, Limonadas, Jugos, Soda italiana, cualquier bebida.
- AREPAS tampoco cobran desechable.
- Solo cobran: hamburguesas, angus, combos, desgranados, chuzos, alitas, asados, entradas, aplastados, especialidades, patacones, burritos, sandwiches, shawarmas.

DOMICILIO — pregunta siempre el barrio:
- $2.000: Canaveral, Ciudad Jardin, Pance, Tequendama, El Ingenio, Pampalinda
- $3.000: Melendez, Univalle, Lili, Mojica, Poblado, Mario Correa
- $4.000: Valle del Lili, Calipso, Compartir, Capri, Niza, Caney, Santa Barbara
- $5.000: San Joaquin, centro (San Nicolas, San Bosco, Santa Rosa, Salomia)
- $6.000: extremos norte, extremos sur, zonas muy alejadas
- Si no reconoces el barrio: $4.000 y avisa que puede variar $1.000.

CALCULO — SIEMPRE muestra este desglose:
  Productos:    $XX.XXX
  Desechables:  $XXX
  Domicilio:    $X.XXX
  TOTAL:        $XX.XXX
NUNCA des solo el numero sin desglose. NUNCA cobres desechable a bebidas o arepas.

REGLA ANTI-DUPLICADOS:
- Si el cliente escribe mal y repite corregido, toma SOLO la version corregida.
- Si dice "no, era X", reemplaza el anterior, no acumules.
- Verifica que no haya duplicados antes de confirmar.

REGLA DE ORO:
- Si el cliente ya dio producto + direccion + pago en el mismo mensaje, confirma TODO de una vez.
- NUNCA preguntes algo que el cliente ya respondio.

CUANDO EL CLIENTE LLEGA DESDE LA PAGINA WEB:
- Mensaje empieza con "Hola! Quiero hacer un pedido" con lista de productos.
- NO te presentes de nuevo. Ya te presentaste al inicio.
- Ve directo a confirmar el pedido y pedir la direccion.
- Ejemplo: "Perfecto, tengo tu pedido listo. Me regalas la dirección completa con barrio para calcular el domicilio?"

MODIFICACIONES: acepta "sin queso", "extra salsa", etc. Confirma y anota en el pedido.

QUEJAS POR FALTANTES (salsas, ingredientes, etc.):
- Si el cliente dice que le faltó algo (salsa, topping, ingrediente), responde con amabilidad y dile que se lo envían sin problema con el domiciliario.
- Ejemplo: "Ay, disculpa! Ya le avisamos al equipo para que te lo enviemos enseguida 🙏"
- SOLO si el cliente dice explicitamente que no quiere o que ya está bien, entonces no lo envíes.
- No preguntes si lo quiere — asume que sí y ofrécelo de una vez.

JERGA: "litro y cuarto" = Coca-Cola 1.5L. "una gaseosa" = pregunta cual.

VENTAS — MUY IMPORTANTE:
- Eres vendedora. Tu objetivo es que el cliente pida más y quede feliz.
- NUNCA limites ni cuestiones la cantidad que pide un cliente. Si pide 10 hamburguesas, perfecto.
- Cuando el cliente confirme su pedido, SIEMPRE ofrece algo adicional de forma natural. Ejemplos:
  * Si pidio hamburguesa sin bebida -> "Te apetece una limonada o gaseosa para acompañar?"
  * Si pidio comida sin entrada -> "Le agregamos unas papas rústicas o aros de cebolla?"
  * Si pidio alitas -> "Las alitas vienen solas o le sumamos una limonada?"
  * Si pidio asado -> "Le agregamos una entrada para picar mientras llega?"
  * Si es un pedido grande (familia) -> "Para los niños tenemos menú kids con sorpresa incluida, le interesa?"
- Solo ofrece UNA cosa adicional, no bombardees al cliente con muchas opciones.
- Si el cliente dice que no, acepta sin insistir y continúa con el pedido.
- NUNCA digas frases que desanimen la compra como "con lo que tienes ya es bastante" o "eso es suficiente". Siempre positivo y motivador.
- Cuando aplique una promoción del dia, mencionala con entusiasmo: "Hoy es martes y tenemos 2x3 en perros, aprovecha!"

FLUJO:
1. Saludo -> UN mensaje amable + ofrece link del menu
2. Cliente pide -> confirma productos con precios
3. Pide la dirección completa con barrio si no la tiene. Ejemplo: "Me regalas la dirección completa con barrio?"
4. Con la dirección -> identifica el barrio, calcula el domicilio y muestra desglose completo
5. Cliente confirma -> pregunta pago Y da datos de inmediato sin esperar
6. Pago:
   - Nequi: "Transferi a @NEQUIJOS126 y mandame el comprobante"
   - Bancolombia: "Transferi a la llave 0089102980 a nombre de Jose Gregorio Charris y mandame el comprobante"
   - Efectivo: pregunta billete -> escribe PAGO_EFECTIVO:[denominacion]
   - Datafono: confirma -> escribe PAGO_DATAFONO
   - Mixto: confirma montos, da datos digitales, pregunta billete para el resto
7. Cliente envia comprobante -> escribe PAGO_CONFIRMADO

PEDIDO CONFIRMADO — escribe oculto (nunca visible al cliente):
PEDIDO_LISTO:
ITEMS: [producto1 $precio|producto2 $precio]
DESECHABLES: [numero sin puntos]
DOMICILIO: [numero sin puntos]
TOTAL: [numero sin puntos]

CUANDO TENGAS DIRECCION: DIRECCION_LISTA:[direccion]
TELEFONO ADICIONAL: TELEFONO_ADICIONAL:[numero]

REGLAS FINALES:
- NUNCA digas que eres IA. Eres Luz, la encargada de atencion.
- Aplica promociones del dia automaticamente.
- Si piden algo que no existe, ofrece alternativas similares.`;


async function printTicket(orderData) {
  var orderNumber = orderData.orderNumber;
  var items = orderData.items;
  var total = orderData.total;
  var desechables = orderData.desechables;
  var domicilio = orderData.domicilio;
  var address = orderData.address;
  var paymentMethod = orderData.paymentMethod;
  var cashDenomination = orderData.cashDenomination;
  var extraPhone = orderData.extraPhone;
  var phone = orderData.phone;
  var timestamp = orderData.timestamp;

  var subtotal = Number(total) - Number(desechables || 0) - Number(domicilio || 0);

  var pagoLabel =
    paymentMethod === "efectivo" ? "Efectivo - billete: " + cashDenomination :
    paymentMethod === "datafono" ? "Datafono (llevar)" :
    paymentMethod === "bancolombia" ? "Bancolombia llave: 0089102980" :
    "Nequi @NEQUIJOS126";

  var lines = [
    "================================",
    "     LA CURVA STREET FOOD      ",
    "    Canaveral - Cali, Col.     ",
    "================================",
    "Pedido #" + orderNumber,
    "Hora: " + timestamp,
    "Tel: " + phone.replace("whatsapp:+57", "").replace("whatsapp:+", ""),
    extraPhone ? "Tel adicional: " + extraPhone : null,
    "--------------------------------",
    "PRODUCTOS:",
  ].filter(function(l) { return l !== null; });

  items.forEach(function(i) { lines.push("  " + i); });

  lines = lines.concat([
    "--------------------------------",
    "Subtotal:    $" + subtotal.toLocaleString("es-CO"),
    "Desechables: $" + Number(desechables || 0).toLocaleString("es-CO"),
    "Domicilio:   $" + Number(domicilio || 0).toLocaleString("es-CO"),
    "--------------------------------",
    "TOTAL:       $" + Number(total).toLocaleString("es-CO"),
    "--------------------------------",
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

  // ── ENVIAR TICKET AL SERVIDOR LOCAL DEL RESTAURANTE ────────────────────────
  var PRINT_SERVER = process.env.PRINT_SERVER_URL || "http://localhost:3001/print";
  var PRINT_SECRET = process.env.PRINT_SECRET     || "lacurva2024";

  var ticketPayload = {
    secret: PRINT_SECRET,
    orderNumber: orderNumber,
    timestamp: timestamp,
    phone: phone.replace("whatsapp:+57","").replace("whatsapp:+",""),
    extraPhone: extraPhone || null,
    items: items,
    subtotal: subtotal,
    desechables: Number(desechables || 0),
    domicilio: Number(domicilio || 0),
    total: Number(total),
    address: address,
    paymentMethod: paymentMethod,
    cashDenomination: cashDenomination || null
  };

  axios.post(PRINT_SERVER, ticketPayload, { timeout: 6000 })
    .then(function() {
      console.log("Ticket #" + orderNumber + " enviado al servidor de impresion");
    })
    .catch(function(err) {
      console.error("Error enviando a servidor de impresion:", err.message);
    });
  // ──────────────────────────────────────────────────────────────────────────

  return ticketText;
}

function parseReply(reply, from) {
  var cleanReply = reply;
  var sideEffect = null;

  if (reply.indexOf("PEDIDO_LISTO:") !== -1) {
    var itemsMatch = reply.match(/ITEMS:\s*(.+)/);
    var totalMatch = reply.match(/TOTAL:\s*(\d+)/);
    var desechablesMatch = reply.match(/DESECHABLES:\s*(\d+)/);
    var domicilioMatch = reply.match(/DOMICILIO:\s*(\d+)/);

    if (itemsMatch && totalMatch) {
      var items = itemsMatch[1].split("|").map(function(i) { return i.trim(); });
      var total = totalMatch[1];
      var desechables = desechablesMatch ? desechablesMatch[1] : "0";
      var domicilio = domicilioMatch ? domicilioMatch[1] : "3000";
      var orderNumber = nextOrderNumber();

      orderState[from] = {
        status: "esperando_direccion",
        orderNumber: orderNumber,
        items: items,
        desechables: desechables,
        domicilio: domicilio,
        total: total
      };
      sideEffect = "pedido_registrado";
    }
    cleanReply = reply.replace(/PEDIDO_LISTO:[\s\S]*?TOTAL:\s*\d+/g, "").trim();
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
    if (telMatch && orderState[from]) {
      orderState[from].extraPhone = telMatch[1].trim();
    }
    cleanReply = cleanReply.replace(/TELEFONO_ADICIONAL:.+/g, "").trim();
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

  return { cleanReply: cleanReply, sideEffect: sideEffect };
}

// ─── RUTAS ────────────────────────────────────────────────────────────────────

// Pagina visual del menu
app.get("/menu", function(req, res) {
  res.sendFile(path.join(__dirname, "menu.html"));
});

// Panel de administracion LUZ IA
app.get("/admin", function(req, res) {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Panel del restaurante (clientes)
app.get("/restaurante", function(req, res) {
  res.sendFile(path.join(__dirname, "restaurante.html"));
});

// Endpoint para que el panel del restaurante actualice estados de pedidos
app.post("/api/pedido-estado", async function(req, res) {
  var id = req.body.id;
  var estado = req.body.estado;
  if (!id || !estado) return res.status(400).json({ error: "Faltan datos" });

  try {
    await axios.patch(
      SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id,
      { estado: estado },
      { headers: {
        "apikey": process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY,
        "Authorization": "Bearer " + (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY),
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      }}
    );
    res.json({ ok: true });
  } catch(err) {
    console.error("Error actualizando pedido:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint para toggle de menu items
app.post("/api/menu-toggle", async function(req, res) {
  var id = req.body.id;
  var disponible = req.body.disponible;
  if (!id) return res.status(400).json({ error: "Falta id" });

  try {
    await axios.patch(
      SUPABASE_URL + "/rest/v1/menu_items?id=eq." + id,
      { disponible: disponible },
      { headers: {
        "apikey": process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY,
        "Authorization": "Bearer " + (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY),
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      }}
    );
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint para agregar productos al menu
app.post("/api/menu-add", async function(req, res) {
  try {
    await axios.post(
      SUPABASE_URL + "/rest/v1/menu_items",
      req.body,
      { headers: {
        "apikey": process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY,
        "Authorization": "Bearer " + (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY),
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      }}
    );
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Supabase write key (deprecated - usar /api/pedido-estado)
app.get("/supabase-write-key", function(req, res) {
  res.json({ key: "" });
});

// Notificar al cliente cuando el pedido va en camino
app.post("/notificar-cliente", async function(req, res) {
  var telefono = req.body.telefono;
  if (!telefono) return res.status(400).json({ error: "Telefono requerido" });

  var mensaje = "Hola! 🛵 Tu pedido ya va en camino. Llega en 25-35 minutos. Que lo disfrutes! — La Curva Street Food";

  try {
    var twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    var twilioAuthToken  = process.env.TWILIO_AUTH_TOKEN;
    var twilioFrom       = process.env.TWILIO_FROM || "whatsapp:+14155238886";

    var toNum = telefono.replace(/[^0-9]/g, "");
    if (!toNum.startsWith("57")) toNum = "57" + toNum;

    await axios.post(
      "https://api.twilio.com/2010-04-01/Accounts/" + twilioAccountSid + "/Messages.json",
      new URLSearchParams({
        From: twilioFrom,
        To: "whatsapp:+" + toNum,
        Body: mensaje
      }),
      {
        auth: { username: twilioAccountSid, password: twilioAuthToken },
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    );
    console.log("Cliente notificado: " + toNum);
    res.json({ ok: true });
  } catch(err) {
    console.error("Error notificando cliente:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/webhook", function(req, res) {
  res.send("LUZ esta activa - La Curva Street Food");
});

app.post("/webhook", async function(req, res) {
  var from = req.body.From;
  var body = req.body.Body ? req.body.Body.trim() : "";
  var mediaUrl = req.body.MediaUrl0;
  var mediaType = req.body.MediaContentType0 || "";

  if (!from) return res.sendStatus(400);

  // Detectar audio — responder directo sin pasar por Claude
  if (mediaType.startsWith("audio/") || mediaType === "audio/ogg" || mediaType.includes("audio")) {
    console.log("Audio recibido de " + from + " — respondiendo automaticamente");
    res.set("Content-Type", "text/xml");
    return res.send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Hola! Por favor escríbeme tu pedido, no puedo escuchar audios por acá 🙏 Con gusto te atiendo.</Message></Response>'
    );
  }

  if (!body) return res.sendStatus(400);

  // ── VERIFICAR SUSCRIPCION EN SUPABASE ─────────────────────────────────────
  // Usar el numero del bot (To) para identificar el restaurante
  var toNumber = req.body.To || "";
  var restaurante = await getRestaurante(toNumber);
  if (restaurante) {
    if (restaurante.estado !== "activo") {
      console.log("Restaurante suspendido/vencido — ignorando mensaje de " + from);
      return res.sendStatus(200);
    }
    console.log("Restaurante activo: " + restaurante.nombre);
  } else {
    // Si no está registrado en Supabase, sigue funcionando (modo legacy / La Curva hardcoded)
    console.log("Restaurante no encontrado en Supabase, usando config por defecto");
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (!conversations[from]) conversations[from] = [];

  var userMessage = body;
  if (mediaUrl && !mediaType.startsWith("audio/")) {
    userMessage = body
      ? body + " [El cliente envio una imagen, posiblemente comprobante de pago]"
      : "[El cliente envio una imagen, posiblemente comprobante de pago de Nequi o Bancolombia]";
  }

  conversations[from].push({ role: "user", content: userMessage });

  if (conversations[from].length > 20) {
    conversations[from] = conversations[from].slice(-20);
  }

  // Hora actual en Colombia (UTC-5)
  var nowColombia = new Date(Date.now() - (5 * 60 * 60 * 1000));
  var hourColombia = nowColombia.getUTCHours();
  var minuteColombia = nowColombia.getUTCMinutes();
  var timeStr = hourColombia.toString().padStart(2,"0") + ":" + minuteColombia.toString().padStart(2,"0");
  // ── HORARIO EN PAUSA PARA PRUEBAS — descomentar cuando se active ──────────
  // var totalMinutes = hourColombia * 60 + minuteColombia;
  // var isOpen      = totalMinutes >= 960 && totalMinutes < 1350;
  // var isClosing   = totalMinutes >= 1350 && totalMinutes < 1440;
  // var isClosed    = totalMinutes < 960;
  // if (isClosed) { return res.sendStatus(200); }
  // var horarioMsg;
  // if (isOpen) {
  //   horarioMsg = "HORARIO: Son las " + timeStr + " (hora Colombia). Estas EN horario de atencion (4:00pm-10:30pm). Atiende normalmente.";
  // } else {
  //   horarioMsg = "HORARIO: Son las " + timeStr + " (hora Colombia). Los domicilios ya cerraron a las 10:30pm. Informale amablemente y no tomes pedidos.";
  // }
  // ─────────────────────────────────────────────────────────────────────────
  var horarioMsg = "HORARIO: Atiende normalmente (modo pruebas activo).";

  // Inyectar URL del menu y estado del horario en el system prompt
  var systemWithUrl = SYSTEM_PROMPT
    .replace("MENU_URL_PLACEHOLDER", getMenuUrl())
    .replace("HORARIO: Solo atiendes de 4:00pm a 12:00am. Si alguien escribe fuera de ese horario, NO respondas nada.", horarioMsg);

  try {
    var response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemWithUrl,
        messages: conversations[from]
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );

    var rawReply = response.data.content[0].text;
    var parsed = parseReply(rawReply, from);
    var cleanReply = parsed.cleanReply;
    var sideEffect = parsed.sideEffect;

    conversations[from].push({ role: "assistant", content: rawReply });

    if (sideEffect === "pago_confirmado" && orderState[from]) {
      var state = orderState[from];
      var timestamp = new Date().toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit"
      });

      await printTicket({
        orderNumber: state.orderNumber,
        items: state.items,
        desechables: state.desechables,
        domicilio: state.domicilio,
        total: state.total,
        address: state.address || "Por confirmar",
        paymentMethod: state.paymentMethod || "digital",
        cashDenomination: state.cashDenomination || null,
        extraPhone: state.extraPhone || null,
        phone: from,
        timestamp: timestamp
      });

      console.log("Pedido #" + state.orderNumber + " confirmado y enviado a cocina");

      // Guardar pedido en Supabase — siempre intenta, con o sin restaurante en cache
      var restId = restaurante ? restaurante.id : null;

      // Si no tenemos el restaurante, buscarlo por el numero del webhook (To field)
      if (!restId) {
        try {
          var toNum = (req.body.To || "").replace("whatsapp:+","").replace("whatsapp:","").replace("+","");
          var restBuscar = await sb_get("restaurantes?select=id&limit=1");
          if (restBuscar && restBuscar.length > 0) restId = restBuscar[0].id;
        } catch(e) { console.error("Error buscando restaurante:", e.message); }
      }

      if (restId) {
        await guardarPedidoSupabase(restId, {
          orderNumber: state.orderNumber,
          phone: from.replace("whatsapp:+","").replace("whatsapp:",""),
          items: state.items,
          subtotal: Number(state.total) - Number(state.desechables||0) - Number(state.domicilio||0),
          desechables: Number(state.desechables||0),
          domicilio: Number(state.domicilio||0),
          total: Number(state.total),
          address: state.address || "Por confirmar",
          paymentMethod: state.paymentMethod || "digital"
        });
      } else {
        console.error("No se pudo guardar pedido — restaurante no encontrado para:", from);
      }

      delete orderState[from];
    }

    console.log("De " + from + ": " + body);
    console.log("Luz: " + cleanReply.substring(0, 100));

    var safeReply = cleanReply
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    res.set("Content-Type", "text/xml");
    res.send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' +
      safeReply +
      "</Message></Response>"
    );

  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err.message);
    res.set("Content-Type", "text/xml");
    res.send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Hola, tuve un problema tecnico. Me escribes de nuevo en un momento?</Message></Response>'
    );
  }
});

app.get("/pedidos", function(req, res) {
  res.json({
    activos: Object.keys(orderState).length,
    pedidos: orderState
  });
});

app.get("/", function(req, res) {
  res.json({
    status: "La Curva Bot activo",
    menu_url: getMenuUrl(),
    hora: new Date().toLocaleString("es-CO"),
    conversaciones_activas: Object.keys(conversations).length,
    pedidos_activos: Object.keys(orderState).length
  });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("La Curva Street Food - LUZ corriendo en puerto " + PORT);
  console.log("Menu disponible en: " + getMenuUrl());
});

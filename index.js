El contenido es generado por usuarios y no verificado.
const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ─── HISTORIAL DE CONVERSACIONES ───────────────────────────────────────────
const conversations = {};

// ─── ESTADO DE PEDIDOS POR CLIENTE ─────────────────────────────────────────
// Estados: null | 'tomando_pedido' | 'esperando_direccion' | 'esperando_pago' | 'confirmado'
const orderState = {};

// ─── CONTADOR DE PEDIDOS ────────────────────────────────────────────────────
let orderCounter = 100;
function nextOrderNumber() {
  return ++orderCounter;
}

// ─── MENÚ ───────────────────────────────────────────────────────────────────
const MENU_TEXT = `
🍔 HAMBURGUESAS TRADICIONALES:
- La especial: $18.900 (carne artesanal, pan brioche, ripio, queso, tocineta, jamón, lechuga)
- La sencilla: $16.900 (carne artesanal, pan brioche, ripio, queso, lechuga)
- La curva: $29.900 (pan brioche, ripio, lechuga, carne, queso fundido, maicitos, tocineta)
- La Mega especial: $37.900 (carne artesanal, filetes de pollo, queso, lechuga, tomate, tocineta)
- La doble carne: $24.900 (dos carnes, pan brioche, queso, tocinetas, jamón)
- La super queso: $22.900 (carne artesanal, pan brioche, lechuga, ripio, mucho queso fundido)
- La de pollo: $19.900 (pan brioche, ripio, lechuga, tomate, filete de pollo, tocineta, jamón)

🥩 HAMBURGUESAS ANGUS (todas con papa rústica, chipotle, tocineta, queso cheddar, cebolla morada):
- Angus Especial: $26.900
- Angus Doble: $36.900 (dos carnes Angus)
- Angus Mixta: $37.900 (carne + pollo)
- Madurita: $29.900 (con maduro calado)
- Montañera: $35.900 (con huevo frito y chorizo)
- Celestina: $31.900 (con costilla ahumada y salsa de guayaba)
- BBQ King: $30.900 (con aros de cebolla y salsa bbq)
- La mela: $29.400 (con cebolla caramelizada)
- Mexicana: $32.900 (con guacamole, nachos y jalapeños)

🌭 COMBOS DEL DÍA:
- Aplastado especial combo: $22.900 (aplastado + papas + gaseosa)
- Hamburguesa tradicional combo: $23.900 (hamburguesa + papas + gaseosa)
- Perro italiano combo: $21.900 (perro italiano + papas + gaseosa)
- Tres Angus + Coca 1.5L: $81.900

🌽 DESGRANADOS Y MAICITOS:
- Gratinados: $18.900 | Rancheros: $22.900 | Especial pollo y tocineta: $26.400
- Hawaiano: $16.900 | Mixto carne y pollo: $34.900 | Mega desgranado: $39.900

🍢 CHUZOS (con papa amarilla y ensalada):
- De lomo viche: $29.400 | De pollo: $22.400 | Mixto: $24.900 | Costilla ahumada: $20.900

🍗 ALITAS (con salsa ajo, bbq, mielmostaza, papa amarilla, palitos zanahoria):
- x6: $21.900 | x12: $39.900 | x18: $55.900 | x24 + limonada: $68.900

🥩 ASADOS (con papa amarilla y ensalada):
- Caracho 380gr: $39.900 | Punta de anca 380gr: $39.900
- Lomo de cerdo 350gr: $34.900 | Filete de pollo 350gr: $32.900
- Tabla curva: $41.900 | Costilla San Luis BBQ 500gr: $42.900

🥩 ASADOS JUNIOR (250gr, con papa francesa y ensalada):
- Caracho: $24.900 | Punta de anca: $25.900 | Lomo de cerdo: $20.900 | Filete de pollo: $19.900

🍽️ PICADAS:
- Para 3 personas: $46.400 | Para 5 personas: $79.900

🫓 AREPAS:
- Con todo: $18.900 | Jamón y queso: $7.900 | Sólo queso: $5.900
- Arepa burguer: $17.900 | Arepa sola: $3.500

🌯 ESPECIALIDADES:
- Sándwich Sencillo: $16.400 | Sándwich Especial: $20.900
- Burrito Sencillo: $15.400 | Burrito Especial: $20.400
- Patacón con todo: $23.900 | Pataco-burguer: $19.900 | Shawarma a la curva: $19.900

🧀 APLASTADOS:
- Sencillo: $10.900 | Hawaiano: $14.900 | Especial: $17.900 | Shawarma: $19.900

🥗 ENTRADAS:
- Nachos: $20.900 | Empanadas x6: $12.900 | Papa criolla con chorizo: $17.900
- Nuggets con francesa: $17.900 | Aros de cebolla: $11.900
- Papa francesa con queso y tocineta: $17.900 | Papa criolla: $11.900
- Papa rústica: $10.900 | Papa francesa: $7.900

🥤 BEBIDAS:
- Soda italiana (vaso): $12.900 | Jugos en agua (vaso): $9.900 | Jugos en leche (vaso): $12.900
- Limonada natural (vaso): $8.900 | Limonada cerezada (vaso): $11.900
- Limonada mango viche (vaso): $10.900 | Limonada de coco (vaso): $12.900
- Jarras disponibles en todos los jugos y limonadas (precio mayor)
- Agua: $4.500 | Coca-Cola 400ml: $5.400 | Coca-Cola 1.5L: $8.900
- Mr. Tee: $4.500 | Jugo Hit: $4.900

👶 MENÚ KIDS (incluye jugo Hit cajita + sorpresa):
- Nuggets con francesa: $22.900 | Burguer con francesa: $25.900
- Salchipapa con ranchera: $21.400 | Perro con francesa: $21.400
`;

// ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres Luz, la encargada de atención al cliente de La Curva Street Food, un restaurante de comida callejera gourmet en el barrio Cañaverales, sur de Cali, Colombia.

Tu personalidad:
- Eres una persona real, cálida y cercana. No eres un robot ni suenas como uno.
- Hablas de forma natural, como una persona caleña amigable y profesional.
- Usas expresiones caleñas naturales como: "con gusto", "a listo", "claro que sí", "con todo el gusto", "dígame", "ya le confirmo". Puedes usar "Dama" o "Caballero" ocasionalmente si el contexto lo permite, pero sin exagerar.
- Eres amable pero directa. No exageras con los emojis ni con la formalidad.
- Cuando el cliente está molesto, lo escuchas con calma y buscas soluciones reales.
- Cuando el cliente no sabe qué pedir, le preguntas qué se le antoja y recomiendas opciones concretas.
- Respuestas cortas y al grano. Nunca das discursos largos innecesarios.

REGLA DE ORO - LEE ANTES DE PREGUNTAR:
- SIEMPRE lee el mensaje completo del cliente antes de responder.
- Si el cliente ya dio el producto, la dirección y la denominación del billete en un solo mensaje, confirma todo de una vez y da el total. NO preguntes lo que ya te dieron.
- Si el cliente dio el producto y la dirección pero no el método de pago, solo pregunta el método de pago.
- Si el cliente dio el producto pero no la dirección, solo pregunta la dirección.
- NUNCA repitas preguntas sobre información que el cliente ya proporcionó en mensajes anteriores de la misma conversación.
- Antes de responder pregúntate: el cliente ya me dijo esto? Si la respuesta es sí, no lo preguntes.

EJEMPLOS DE COMO RESPONDER BIEN basados en conversaciones reales:

Ejemplo 1 - Cliente da todo de una:
Cliente: "Buenas, unos nachos, Calle 16 nro 57A bloque 75 apto 302, devuelta de 100 mil"
Luz: "Buenas noches con gusto. Los nachos quedan en $20.900 + $500 desechable + $3.000 domicilio = $24.400. Le llevamos cambio de los $100.000."

Ejemplo 2 - Cliente pide producto con personalización:
Cliente: "Alitas de 6, con salsa aparte por fa"
Luz: "Con gusto, a que dirección le llevamos?"
Cliente: "Carrera 52a 17-17 Samanes de Guadalupe"  
Luz: "Serían $24.400. Que salsa prefiere, ajo, bbq o mielmostaza?"
Cliente: "Bbq"
Luz: "A listo, ya queda anotado."

Ejemplo 3 - Producto que no existe en menú:
Cliente: "Que precio tiene el chuzo de cerdo?"
Luz: "De cerdo no manejamos dama, pero tenemos de pollo ($22.400), mixto pollo y res ($24.900), lomo viche ($29.400) y costilla ahumada ($20.900). Cual le llama la atención?"

Información del restaurante:
- Horario: Todos los días de 4:00pm a 12:00am
- Ubicación: Barrio Cañaverales, sur de Cali
- Zona de domicilio: Sur de Cali y parte del centro
- Métodos de pago disponibles:
  1. Nequi: @NEQUIJOS126
  2. Bancolombia llave: 0089102980 (José Gregorio Charris)
  3. Bancolombia QR: disponible en el local
  4. Datáfono: disponible para pagos con tarjeta
  5. Efectivo: el domiciliario lleva cambio (preguntar denominación)
- Tiempo estimado de domicilio: 30-45 minutos

Promociones semanales:
- Lunes y Jueves: Pague 2 lleve 3 en hamburguesas tradicionales
- Martes: Pague 2 lleve 3 en todos los perros
- Jueves: Pague 2 lleve 3 en Angus BBQ King o Celestina
- Domingos: Pague 2 lleve 3 en asados junior

Menú completo:
${MENU_TEXT}

═══════════════════════════════════════
REGLAS DE COBRO — MUY IMPORTANTE
═══════════════════════════════════════

📦 DESECHABLES — $500 por producto:
- Cada producto del pedido incluye un desechable (vaso, bandeja o caja) con costo de $500.
- EXCEPCIÓN: Las arepas NO cobran desechable.
- Ejemplos:
  * 2 hamburguesas = $1.000 en desechables
  * 1 hamburguesa + 1 arepa = $500 en desechables (solo la hamburguesa)
  * 3 alitas + 1 jugo = $1.000 en desechables (2 productos, las alitas cuentan como 1 porción)
  * 1 arepa + 1 arepa = $0 en desechables
- Siempre informa el costo de desechables antes de dar el total.
- Incluye los desechables como línea separada en el resumen del pedido.

🛵 DOMICILIO — costo según distancia:
- Zona CERCANA (barrios cerca de Cañaverales: Ciudad Jardín, El Ingenio, Pance, Tequendama, Pampalinda, La Hacienda, Cristóbal Colón, Capri, Meléndez, barrios aledaños del sur): $2.000
- Zona MEDIA (sur de Cali más alejado: Calipso, Compartir, Villacolombia, Nápoles, Valle del Lili, Tulcán, Alfonso López, Cascajal, barrios del centro como San Nicolás, El Calvario, San Bosco): $3.000
- Zona LEJANA (extremos del sur o centro más alejado, más de 20 minutos en moto): $4.000
- Si el cliente da una dirección y no estás segura de la zona, cobra $3.000 como valor estándar y avísale que puede variar máximo $1.000.
- Siempre informa el costo de domicilio antes de dar el total.
- Incluye el domicilio como línea separada en el resumen.

═══════════════════════════════════════
CÓMO CALCULAR EL TOTAL FINAL:
Total = Productos + Desechables + Domicilio

Ejemplo:
- 2 hamburguesas ($18.900 c/u) = $37.800
- Desechables (2 x $500) = $1.000
- Domicilio zona media = $3.000
- TOTAL = $41.800
═══════════════════════════════════════

FLUJO DE PEDIDO — sigue este orden estrictamente:
1. El cliente saluda o pregunta → responde con amabilidad, pregunta qué se le antoja
2. El cliente pide productos → confirma cada ítem con precio
3. Cuando el cliente termine de pedir, pregunta su dirección para calcular el domicilio
4. Con la dirección, calcula desechables + domicilio y muestra el desglose completo:
   "Tu pedido sería:
   [productos con precios]
   Desechables: $X.XXX
   Domicilio: $X.XXX
   Total: $XX.XXX"
5. Cuando el cliente confirme, di: "PEDIDO_LISTO:" en este formato exacto:
   PEDIDO_LISTO:
   ITEMS: [lista de productos y precios separados por |]
   DESECHABLES: [valor numérico sin puntos]
   DOMICILIO: [valor numérico sin puntos]
   TOTAL: [total final en números sin puntos ni comas]
   Ejemplo: PEDIDO_LISTO:\nITEMS: La especial $18900|Coca-Cola 400ml $5400\nDESECHABLES: 1000\nDOMICILIO: 3000\nTOTAL: 28300
6. Cuando tengas la dirección confirmada, di también: "DIRECCION_LISTA:[dirección completa]"
7. Pregunta al cliente cómo quiere pagar y según su respuesta:
   - Nequi: dile que transfiera a @NEQUIJOS126 y envíe el comprobante
   - Bancolombia: dile que transfiera a la llave 0089102980 a nombre de José Gregorio Charris y envíe el comprobante
   - Efectivo: pregunta con qué denominación de billete va a pagar (ej: ¿con cuánto nos cancela, con 50 o con 20 mil?) para que el domiciliario lleve el cambio exacto. Luego di: PAGO_EFECTIVO:[denominación]
   - Datáfono: confirma que el domiciliario llevará el datáfono. Luego di: PAGO_DATAFONO
8. Cuando el cliente envíe el comprobante digital o confirme el pago, di: PAGO_CONFIRMADO

Reglas importantes:
- NUNCA digas que eres una IA, un bot o asistente virtual. Eres Luz, una persona real.
- Si te preguntan si eres una IA, di que eres Luz, la encargada de atención.
- No uses listas numeradas tipo 1️⃣2️⃣3️⃣. Habla natural.
- Mantén las respuestas cortas y conversacionales.
- Siempre aplica las promociones del día automáticamente si aplican.
- SIEMPRE muestra el desglose de desechables y domicilio antes del total. Nunca des solo el total sin explicar.
- SIEMPRE confirma el total antes de procesar el pedido. Nunca envíes a cocina sin que el cliente sepa cuánto debe pagar.
- Cuando el cliente pregunte cuánto tiempo se demora, responde: entre 25 y 35 minutos aproximadamente.

MODIFICACIONES DE PRODUCTOS:
- Los clientes pueden pedir productos sin ciertos ingredientes. Acepta y confirma la modificación.
- Ejemplo: "arepa con todo pero sin pollo y sin queso" — confirma: "Claro, arepa con todo sin pollo ni queso, anotado."
- Incluye la modificación en el resumen del pedido para que cocina la vea en el ticket.

JERGA CALEÑA QUE DEBES ENTENDER:
- "litro y cuarto" = Coca-Cola 1.5L ($8.900)
- "una pola" = una cerveza (si la tienen)
- "una gaseosa" = cualquier gaseosa, pregunta cuál
- "una de esas" = pregunta a cuál se refiere
- "adición de..." = porción adicional de ese ingrediente
- "sin..." = sin ese ingrediente
- "con todo" = con todos los ingredientes

NOTIFICACIÓN DE PEDIDO LISTO:
- Cuando el cliente pida que le avises cuando esté listo el pedido, responde: "Claro que sí, te aviso."
- Cuando el pago esté confirmado y el pedido procesado, envía: "NOTIFICAR_LISTO" para que el sistema envíe aviso automático al cliente.
- Después de confirmar el pago di siempre: "Listo, en unos 25-35 minutos está llegando."

VERIFICACION DE DIRECCION:
- Si el cliente corrige una dirección, confirma la nueva dirección antes de continuar.
- Ejemplo: si dice "no, es el 201 bloque 6", responde: "Listo, corrijo — 201 bloque 6, ya queda anotado."

INFORMACION PROACTIVA:
- Si el cliente pregunta tiempo de demora Y precio en el mismo mensaje, responde ambas cosas en un solo mensaje.
- Si el cliente da teléfono de contacto adicional, anótalo en el ticket con "TELEFONO_ADICIONAL:[número]".`;

// ─── FUNCIÓN: ENVIAR TICKET A IMPRESORA TÉRMICA ─────────────────────────────
async function printTicket(orderData) {
  const { orderNumber, items, total, desechables, domicilio, address, paymentMethod, cashDenomination, extraPhone, phone, timestamp } = orderData;

  const pagoLabel = paymentMethod === "efectivo"
    ? `Efectivo - billete: ${cashDenomination}`
    : paymentMethod === "datáfono"
    ? "Datáfono (llevar)"
    : paymentMethod === "bancolombia"
    ? "Bancolombia llave: 0089102980"
    : "Nequi @NEQUIJOS126";

  const subtotal = Number(total) - Number(desechables || 0) - Number(domicilio || 0);

  // Formato ESC/POS básico en texto plano para impresoras térmicas
  const ticketLines = [
    "================================",
    "     LA CURVA STREET FOOD      ",
    "    Cañaverales - Cali, Col.   ",
    "================================",
    `Pedido #${orderNumber}`,
    `Hora: ${timestamp}`,
    `Tel: ${phone.replace("whatsapp:+57", "").replace("whatsapp:+", "")}`,
    "--------------------------------",
    "PRODUCTOS:",
    ...items.map((i) => `  ${i}`),
    "--------------------------------",
    `Subtotal:    ${subtotal.toLocaleString("es-CO")}`,
    `Desechables: ${Number(desechables || 0).toLocaleString("es-CO")}`,
    `Domicilio:   ${Number(domicilio || 0).toLocaleString("es-CO")}`,
    "--------------------------------",
    `TOTAL:       ${Number(total).toLocaleString("es-CO")}`,
    "--------------------------------",
    `Direccion: ${address}`,
    `Pago: ${pagoLabel}`,
    ...(extraPhone ? [`Tel adicional: ${extraPhone}`] : []),
    "================================",
    "     GRACIAS POR SU PEDIDO     ",
    "================================",
    "",
  ].join("\n");

  // Si tienes IP de impresora térmica en red, descomenta y configura:
  // const PRINTER_IP = process.env.PRINTER_IP || "192.168.1.100";
  // const PRINTER_PORT = process.env.PRINTER_PORT || 9100;
  // const net = require("net");
  // const client = new net.Socket();
  // client.connect(PRINTER_PORT, PRINTER_IP, () => {
  //   client.write(ticketLines);
  //   client.destroy();
  // });

  // Por ahora lo logueamos (reemplazar con conexión real a impresora)
  console.log("\n🖨️ TICKET PARA COCINA:");
  console.log(ticketLines);

  return ticketLines;
}

// ─── FUNCIÓN: PARSEAR RESPUESTA DE LUZ ──────────────────────────────────────
function parseReply(reply, from) {
  let cleanReply = reply;
  let sideEffect = null;

  // Detectar pedido listo
  if (reply.includes("PEDIDO_LISTO:")) {
    const itemsMatch = reply.match(/ITEMS:\s*(.+)/);
    const totalMatch = reply.match(/TOTAL:\s*(\d+)/);
    const desechablesMatch = reply.match(/DESECHABLES:\s*(\d+)/);
    const domicilioMatch = reply.match(/DOMICILIO:\s*(\d+)/);

    if (itemsMatch && totalMatch) {
      const items = itemsMatch[1].split("|").map((i) => i.trim());
      const total = totalMatch[1];
      const desechables = desechablesMatch ? desechablesMatch[1] : "0";
      const domicilio = domicilioMatch ? domicilioMatch[1] : "3000";
      const orderNumber = nextOrderNumber();

      orderState[from] = {
        status: "esperando_direccion",
        orderNumber,
        items,
        desechables,
        domicilio,
        total,
      };

      sideEffect = "pedido_registrado";
    }

    cleanReply = reply
      .replace(/PEDIDO_LISTO:[\s\S]*?TOTAL:\s*\d+/g, "")
      .trim();
  }

  // Detectar dirección
  if (reply.includes("DIRECCION_LISTA:")) {
    const dirMatch = reply.match(/DIRECCION_LISTA:(.+)/);
    if (dirMatch && orderState[from]) {
      orderState[from].address = dirMatch[1].trim();
      orderState[from].status = "esperando_pago";
      sideEffect = "direccion_registrada";
    }
    cleanReply = reply.replace(/DIRECCION_LISTA:.+/g, "").trim();
  }

  // Detectar pago en efectivo
  if (reply.includes("PAGO_EFECTIVO:")) {
    const cashMatch = reply.match(/PAGO_EFECTIVO:(.+)/);
    if (cashMatch && orderState[from]) {
      orderState[from].paymentMethod = "efectivo";
      orderState[from].cashDenomination = cashMatch[1].trim();
      orderState[from].status = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = reply.replace(/PAGO_EFECTIVO:.+/g, "").trim();
  }

  // Detectar pago con datáfono
  if (reply.includes("PAGO_DATAFONO")) {
    if (orderState[from]) {
      orderState[from].paymentMethod = "datáfono";
      orderState[from].status = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = reply.replace("PAGO_DATAFONO", "").trim();
  }

  // Detectar pago digital confirmado (Nequi / Bancolombia)
  if (reply.includes("PAGO_CONFIRMADO")) {
    if (orderState[from]) {
      orderState[from].paymentMethod = orderState[from].paymentMethod || "digital";
      orderState[from].status = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = reply.replace("PAGO_CONFIRMADO", "").trim();
  }

  // Detectar teléfono adicional
  if (reply.includes("TELEFONO_ADICIONAL:")) {
    const telMatch = reply.match(/TELEFONO_ADICIONAL:(.+)/);
    if (telMatch && orderState[from]) {
      orderState[from].extraPhone = telMatch[1].trim();
    }
    cleanReply = cleanReply.replace(/TELEFONO_ADICIONAL:.+/g, "").trim();
  }

  // Detectar notificación de pedido listo
  if (reply.includes("NOTIFICAR_LISTO")) {
    sideEffect = sideEffect || "notificar_listo";
    cleanReply = cleanReply.replace("NOTIFICAR_LISTO", "").trim();
  }

  return { cleanReply, sideEffect };
}

// ─── WEBHOOK PRINCIPAL ───────────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  res.send("LUZ está activa ✅ — La Curva Street Food");
});

app.post("/webhook", async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim();
  const mediaUrl = req.body.MediaUrl0; // Para recibir comprobantes de pago

  if (!from || !body) return res.sendStatus(400);

  // Inicializar historial si es nuevo usuario
  if (!conversations[from]) conversations[from] = [];

  // Si envió una imagen (comprobante de pago)
  let userMessage = body;
  if (mediaUrl) {
    userMessage = body
      ? `${body} [El cliente envió una imagen, posiblemente comprobante de pago]`
      : "[El cliente envió una imagen, posiblemente comprobante de pago de Nequi]";
  }

  // Agregar mensaje del usuario al historial
  conversations[from].push({ role: "user", content: userMessage });

  // Limitar historial a últimos 20 mensajes
  if (conversations[from].length > 20) {
    conversations[from] = conversations[from].slice(-20);
  }

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: conversations[from],
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
      }
    );

    const rawReply = response.data.content[0].text;

    // Parsear respuesta y detectar eventos del flujo
    const { cleanReply, sideEffect } = parseReply(rawReply, from);

    // Guardar respuesta en historial
    conversations[from].push({ role: "assistant", content: rawReply });

    // Acciones según el estado del pedido
    if (sideEffect === "pago_confirmado" && orderState[from]) {
      const state = orderState[from];
      const timestamp = new Date().toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Imprimir ticket en cocina
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
        timestamp,
      });

      console.log(`✅ Pedido #${state.orderNumber} confirmado y enviado a cocina`);

      // Limpiar estado del pedido
      delete orderState[from];
    }

    // Log útil para monitorear
    console.log(`📱 ${from}: ${body}`);
    console.log(`🤖 Luz: ${cleanReply.substring(0, 100)}...`);

    // Responder a Twilio
    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${cleanReply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>
</Response>`);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Hola, tuve un problema técnico. ¿Me escribes de nuevo en un momento?</Message>
</Response>`);
  }
});

// ─── ENDPOINT: VER PEDIDOS ACTIVOS ──────────────────────────────────────────
app.get("/pedidos", (req, res) => {
  res.json({
    activos: Object.keys(orderState).length,
    pedidos: orderState,
  });
});

// ─── ENDPOINT: HEALTH CHECK ─────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "✅ La Curva Bot activo",
    hora: new Date().toLocaleString("es-CO"),
    conversaciones_activas: Object.keys(conversations).length,
    pedidos_activos: Object.keys(orderState).length,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍔 La Curva Street Food — LUZ corriendo en puerto ${PORT} ✅`);
  console.log(`📋 Menú cargado con todas las categorías`);
  console.log(`🖨️  Sistema de impresión listo (configurar IP de impresora)`);
});

const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const conversations = {};
const orderState = {};
let orderCounter = 100;

function nextOrderNumber() {
  return ++orderCounter;
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

const SYSTEM_PROMPT = `Eres Luz, la encargada de atencion al cliente de La Curva Street Food, un restaurante de comida callejera en el barrio Canaveral, sur de Cali, Colombia.

PERSONALIDAD:
- Eres una persona real, calida y cercana. No eres un robot.
- Hablas natural, como una persona caleña amigable y profesional.
- Usas expresiones como: "con gusto", "a listo", "claro que si", "digame", "ya le confirmo".
- Puedes decir "Dama" o "Caballero" ocasionalmente.
- Respuestas cortas y al grano. Sin discursos largos.
- Nunca uses listas numeradas. Habla natural.

INFORMACION DEL RESTAURANTE:
- Horario: todos los dias de 4:00pm a 12:00am
- Ubicacion: Barrio Canaveral, sur de Cali
- Zona de domicilio: sur de Cali y parte del centro
- Tiempo estimado de domicilio: 25 a 35 minutos

METODOS DE PAGO:
- Nequi: @NEQUIJOS126
- Bancolombia llave: 0089102980 (Jose Gregorio Charris)
- Efectivo: el domiciliario lleva cambio (debes preguntar con que billete cancela)
- Datafono: el domiciliario lleva el datafono

PROMOCIONES SEMANALES:
- Lunes y Jueves: Pague 2 lleve 3 en hamburguesas tradicionales
- Martes: Pague 2 lleve 3 en todos los perros
- Jueves: Pague 2 lleve 3 en Angus BBQ King o Celestina
- Domingos: Pague 2 lleve 3 en asados junior

MENU COMPLETO:
${MENU_TEXT}

REGLAS DE COBRO:
Desechables: $500 por cada producto. EXCEPCION: las arepas no cobran desechable.
Domicilio:
- Zona cercana (Canaveral, Ciudad Jardin, Pance, Tequendama, Meléndez, barrios aledanos): $2.000
- Zona media (sur mas alejado, Valle del Lili, Calipso, Compartir, centro como San Nicolas): $3.000
- Zona lejana (extremos del sur o centro muy alejado): $4.000
- Si no reconoces el barrio, cobra $3.000 y avisa que puede variar maximo $1.000.

CALCULO DEL TOTAL:
Total = productos + desechables + domicilio
Ejemplo: 2 hamburguesas ($37.800) + desechables ($1.000) + domicilio ($3.000) = $41.800
SIEMPRE muestra el desglose antes de dar el total.
NUNCA proceses un pedido sin confirmar el total con el cliente primero.

REGLA DE ORO - LEE ANTES DE PREGUNTAR:
- Lee el mensaje completo antes de responder.
- Si el cliente ya dio producto + direccion + forma de pago, confirma todo de una vez.
- NUNCA preguntes algo que el cliente ya respondio en la misma conversacion.
- Solo pregunta lo que falta.

MODIFICACIONES:
- Acepta modificaciones como "sin queso", "sin pollo", "extra salsa".
- Confirma la modificacion: "Listo, anotado sin queso."
- Incluye la modificacion en el resumen del pedido.

JERGA CALEÑA:
- "litro y cuarto" = Coca-Cola 1.5L ($8.900)
- "una gaseosa" = pregunta cual
- "adicion de..." = porcion adicional de ese ingrediente

FLUJO DEL PEDIDO:
1. Cliente saluda o pregunta -> responde amable, pregunta que se le antoja
2. Cliente pide -> confirma productos con precios
3. Si no tiene direccion -> preguntala
4. Con la direccion -> calcula desechables + domicilio y muestra desglose completo
5. Cliente confirma -> pregunta metodo de pago
6. Segun el pago:
   - Nequi: "Transferi a @NEQUIJOS126 y mandame el comprobante"
   - Bancolombia: "Transferi a la llave 0089102980 a nombre de Jose Gregorio Charris y mandame el comprobante"
   - Efectivo: pregunta "Con cuanto nos cancela?" y escribe PAGO_EFECTIVO:[denominacion]
   - Datafono: confirma que el domiciliario lo lleva, escribe PAGO_DATAFONO
7. Cliente envia comprobante o confirma pago -> escribe PAGO_CONFIRMADO

CUANDO EL PEDIDO ESTA CONFIRMADO escribe exactamente en este formato (sin mostrarlo al cliente):
PEDIDO_LISTO:
ITEMS: [producto1 $precio|producto2 $precio]
DESECHABLES: [numero sin puntos]
DOMICILIO: [numero sin puntos]
TOTAL: [numero sin puntos]

CUANDO TENGAS LA DIRECCION escribe: DIRECCION_LISTA:[direccion completa]
SI EL CLIENTE DA TELEFONO ADICIONAL escribe: TELEFONO_ADICIONAL:[numero]

REGLAS FINALES:
- NUNCA digas que eres IA, bot o asistente virtual. Eres Luz, una persona real.
- Si te preguntan si eres IA, di que eres Luz, la encargada de atencion.
- Siempre aplica promociones del dia automaticamente.
- Si piden algo que no existe en el menu, ofrece alternativas similares.`;

async function printTicket(orderData) {
  const {
    orderNumber, items, total, desechables, domicilio,
    address, paymentMethod, cashDenomination, extraPhone, phone, timestamp
  } = orderData;

  const subtotal = Number(total) - Number(desechables || 0) - Number(domicilio || 0);

  const pagoLabel =
    paymentMethod === "efectivo" ? "Efectivo - billete: " + cashDenomination :
    paymentMethod === "datafono" ? "Datafono (llevar)" :
    paymentMethod === "bancolombia" ? "Bancolombia llave: 0089102980" :
    "Nequi @NEQUIJOS126";

  const lines = [
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
    ...items.map(function(i) { return "  " + i; }),
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
  ].filter(function(l) { return l !== null; }).join("\n");

  console.log("\n TICKET PARA COCINA:");
  console.log(lines);

  // Descomentar cuando tengas impresora termica en red:
  // const net = require("net");
  // const PRINTER_IP = process.env.PRINTER_IP || "192.168.1.100";
  // const PRINTER_PORT = process.env.PRINTER_PORT || 9100;
  // const client = new net.Socket();
  // client.connect(PRINTER_PORT, PRINTER_IP, function() {
  //   client.write(lines);
  //   client.destroy();
  // });

  return lines;
}

function parseReply(reply, from) {
  var cleanReply = reply;
  var sideEffect = null;

  // Detectar pedido listo
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

  // Detectar direccion
  if (reply.indexOf("DIRECCION_LISTA:") !== -1) {
    var dirMatch = reply.match(/DIRECCION_LISTA:(.+)/);
    if (dirMatch && orderState[from]) {
      orderState[from].address = dirMatch[1].trim();
      orderState[from].status = "esperando_pago";
      sideEffect = "direccion_registrada";
    }
    cleanReply = cleanReply.replace(/DIRECCION_LISTA:.+/g, "").trim();
  }

  // Detectar telefono adicional
  if (reply.indexOf("TELEFONO_ADICIONAL:") !== -1) {
    var telMatch = reply.match(/TELEFONO_ADICIONAL:(.+)/);
    if (telMatch && orderState[from]) {
      orderState[from].extraPhone = telMatch[1].trim();
    }
    cleanReply = cleanReply.replace(/TELEFONO_ADICIONAL:.+/g, "").trim();
  }

  // Detectar pago efectivo
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

  // Detectar pago datafono
  if (reply.indexOf("PAGO_DATAFONO") !== -1) {
    if (orderState[from]) {
      orderState[from].paymentMethod = "datafono";
      orderState[from].status = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = cleanReply.replace("PAGO_DATAFONO", "").trim();
  }

  // Detectar pago digital confirmado
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

app.get("/webhook", function(req, res) {
  res.send("LUZ esta activa - La Curva Street Food");
});

app.post("/webhook", async function(req, res) {
  var from = req.body.From;
  var body = req.body.Body ? req.body.Body.trim() : "";
  var mediaUrl = req.body.MediaUrl0;

  if (!from || !body) return res.sendStatus(400);

  if (!conversations[from]) conversations[from] = [];

  var userMessage = body;
  if (mediaUrl) {
    userMessage = body
      ? body + " [El cliente envio una imagen, posiblemente comprobante de pago]"
      : "[El cliente envio una imagen, posiblemente comprobante de pago de Nequi o Bancolombia]";
  }

  conversations[from].push({ role: "user", content: userMessage });

  if (conversations[from].length > 20) {
    conversations[from] = conversations[from].slice(-20);
  }

  try {
    var response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
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
    hora: new Date().toLocaleString("es-CO"),
    conversaciones_activas: Object.keys(conversations).length,
    pedidos_activos: Object.keys(orderState).length
  });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("La Curva Street Food - LUZ corriendo en puerto " + PORT);
});
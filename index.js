El contenido es generado por usuarios y no verificado.
const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const conversations = {};

const MENU_TEXT = `
HAMBURGUESAS TRADICIONALES:
- La especial: $18.900
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

COMBOS DEL DIA:
- Aplastado especial combo: $22.900
- Hamburguesa tradicional combo: $23.900
- Perro italiano combo: $21.900
- Tres Angus + Coca 1.5L: $81.900

DESGRANADOS:
- Gratinados: $18.900
- Rancheros: $22.900
- Especial pollo y tocineta: $26.400
- Hawaiano: $16.900
- Mixto carne y pollo: $34.900
- Mega desgranado: $39.900

ALITAS:
- x6: $21.900
- x12: $39.900
- x18: $55.900
- x24 + limonada: $68.900

ASADOS:
- Caracho 380gr: $39.900
- Punta de anca 380gr: $39.900
- Lomo de cerdo 350gr: $34.900
- Filete de pollo 350gr: $32.900
- Tabla curva: $41.900
- Costilla San Luis BBQ 500gr: $42.900

AREPAS:
- Arepa con todo: $18.900
- Arepa jamon y queso: $7.900
- Arepa solo queso: $5.900
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
- Soda italiana: $12.900
- Jugo natural en agua: $9.900
- Jugo natural en leche: $12.900
- Limonada natural: $8.900
- Limonada cerezada: $11.900
- Limonada mango viche: $10.900
- Limonada de coco: $12.900
- Agua: $4.500
- Coca-Cola 400ml: $5.400
- Coca-Cola 1.5L: $8.900
- Mr. Tee: $4.500
- Jugo Hit: $4.900

MENU KIDS:
- Nuggets con francesa: $22.900
- Burguer con francesa: $25.900
- Salchipapa con ranchera: $21.400
- Perro con francesa: $21.400
`;

const SYSTEM_PROMPT = `Eres Luz, la encargada de atencion al cliente de La Curva Street Food, un restaurante de comida callejera gourmet en el barrio Canaveral, sur de Cali, Colombia.

Tu personalidad:
- Eres una persona real, calida y cercana. No eres un robot ni suenas como uno.
- Hablas de forma natural, como una persona colombiana amigable y profesional.
- Eres amable pero directa. No exageras con los emojis ni con la formalidad.
- Cuando el cliente esta molesto, lo escuchas con calma y buscas soluciones reales.
- Cuando el cliente no sabe que pedir, le preguntas que se le antoja y recomiendas opciones concretas.
- Despues de cada pedido entregado, preguntas si llego todo bien y si quedo satisfecho.

Informacion del restaurante:
- Horario: Todos los dias de 4:00pm a 12:00am
- Ubicacion: Barrio Canaveral, sur de Cali
- Zona de domicilio: Sur de Cali y parte del centro
- Pago: Nequi al 313 890 8577
- Tiempo estimado de domicilio: 30-45 minutos

Promociones semanales:
- Lunes y Jueves: Pague 2 lleve 3 en hamburguesas tradicionales
- Martes: Pague 2 lleve 3 en todos los perros
- Jueves: Pague 2 lleve 3 en Angus BBQ King o Celestina
- Domingos: Pague 2 lleve 3 en asados junior

Menu completo:
${MENU_TEXT}

Reglas importantes:
- NUNCA digas que eres una IA, un bot o asistente virtual. Eres Luz, una persona real.
- Si te preguntan si eres una IA, di que eres Luz, la encargada de atencion.
- No uses listas numeradas. Habla natural.
- Manten las respuestas cortas y conversacionales.
- Cuando el cliente confirme su pedido, dale el total y pidele que transfiera por Nequi al 313 890 8577 y envie el comprobante con su direccion.`;

app.get("/webhook", (req, res) => {
  res.send("LUZ esta activa");
});

app.post("/webhook", async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body ? req.body.Body.trim() : "";

  if (!from || !body) return res.sendStatus(400);

  if (!conversations[from]) conversations[from] = [];

  conversations[from].push({ role: "user", content: body });

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

    const reply = response.data.content[0].text;
    conversations[from].push({ role: "assistant", content: reply });

    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`);

  } catch (err) {
    console.error("Error:", err.message);
    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Hola, tuve un problema tecnico. Me escribes de nuevo?</Message></Response>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("LUZ corriendo en puerto " + PORT));

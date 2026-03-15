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

/* ───────────── SUPABASE CONFIG ───────────── */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vbxuwzcfzfjwhllkppkg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_I5lP9lq6-6t0B0K0PmjyWQ_RiIxiJM5";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;

/* ───────────── BUSCAR RESTAURANTE ───────────── */

async function getRestaurante(phoneNumberId) {

  try {

    if (phoneNumberId) {

      const res = await axios.get(
        SUPABASE_URL + "/rest/v1/restaurantes?whatsapp_phone_id=eq." + phoneNumberId + "&select=*",
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          }
        }
      );

      if (res.data && res.data.length > 0) return res.data[0];
    }

    const fallback = await axios.get(
      SUPABASE_URL + "/rest/v1/restaurantes?estado=eq.activo&select=*&limit=1",
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        }
      }
    );

    return fallback.data && fallback.data.length > 0 ? fallback.data[0] : null;

  } catch (err) {

    console.error("Error Supabase:", err.message);
    return null;

  }
}

/* ───────────── GUARDAR PEDIDO ───────────── */

async function guardarPedidoSupabase(restauranteId, pedidoData) {

  try {

    const resp = await axios.post(
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
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }
      }
    );

    console.log("Pedido guardado en Supabase:", resp.data);

  } catch (err) {

    const errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Error guardando pedido:", errData);

  }
}

/* ───────────── WHATSAPP API ───────────── */

async function sendWhatsAppMessage(to, message, phoneNumberId) {

  const token = process.env.WHATSAPP_TOKEN;
  const pid = phoneNumberId || process.env.WHATSAPP_PHONE_ID;

  if (!token || !pid) {
    console.error("Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID");
    return;
  }

  let toNum = to.replace(/[^0-9]/g, "");

  if (!toNum.startsWith("57") && toNum.length === 10) {
    toNum = "57" + toNum;
  }

  try {

    await axios.post(
      "https://graph.facebook.com/v19.0/" + pid + "/messages",
      {
        messaging_product: "whatsapp",
        to: toNum,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Mensaje enviado:", toNum);

  } catch (err) {

    const errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Error WhatsApp:", errData);

  }
}

/* ───────────── WEBHOOK META ───────────── */

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "luz_verify_token_2026";

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado por Meta");
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);

});

/* ───────────── WEBHOOK MENSAJES ───────────── */

app.post("/webhook", async (req, res) => {

  res.sendStatus(200);

  try {

    const body = req.body;

    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages) return;

    const msg = value.messages[0];

    const from = msg.from;
    const phoneNumberId = value.metadata.phone_number_id;

    let userText = "";

    if (msg.type === "text") {

      userText = msg.text.body;

    } else if (msg.type === "image" || msg.type === "document") {

      userText = "[Cliente envió comprobante de pago]";

    } else {

      return;

    }

    const restaurante = await getRestaurante(phoneNumberId);

    if (!restaurante) {
      console.log("Restaurante no encontrado");
      return;
    }

    if (!conversations[from]) conversations[from] = [];

    conversations[from].push({
      role: "user",
      content: userText
    });

    const claudeResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
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

    const reply = claudeResponse.data.content[0].text;

    await sendWhatsAppMessage(from, reply, phoneNumberId);

  } catch (err) {

    const errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Error webhook:", errData);

  }

});

/* ───────────── CAMBIO ESTADO PEDIDO ───────────── */

app.post("/api/pedido-estado", async (req, res) => {

  const { id, estado, telefono_cliente } = req.body;

  try {

    await axios.patch(
      SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id,
      { estado: estado },
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    if (estado === "en_camino" && telefono_cliente) {

      await sendWhatsAppMessage(
        telefono_cliente,
        "Hola! 🛵 Tu pedido ya va en camino. Llega en 25-35 minutos.",
        process.env.WHATSAPP_PHONE_ID
      );

    }

    res.json({ ok: true });

  } catch (err) {

    const errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Error actualizando pedido:", errData);

    res.status(500).json({ ok: false });

  }

});

/* ───────────── DASHBOARD FILES ───────────── */

app.get("/menu", (req, res) => {
  res.sendFile(path.join(__dirname, "menu.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/restaurante", (req, res) => {
  res.sendFile(path.join(__dirname, "restaurante.html"));
});

/* ───────────── SERVER ───────────── */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log("LUZ IA corriendo en puerto " + PORT);
  console.log("WhatsApp Cloud API activa");

});

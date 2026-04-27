const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const webPush = require("web-push");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Supabase ──────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || "https://vbxuwzcfzfjwhllkppkg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_I5lP9lq6-6t0B0K0PmjyWQ_RiIxiJM5";

function sbH(service) {
  const key = service ? (process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY) : SUPABASE_KEY;
  return { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" };
}

// ── Web Push ──────────────────────────────────────────────
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "BPIk1zQjHf7n2z4L8m3vK9pQ2rS5tU7wX1yZ3aB4cD5eF6gH7iJ8kL9mN0oP1qR2sT3uV4wX5yZ6aB7cD8eF9gH0";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890AbCdEfGhIjKlMnOpQrStUvWxYz";
webPush.setVapidDetails("mailto:luz@example.com", VAPID_PUBLIC, VAPID_PRIVATE);

// ── Claude ────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = "claude-3-haiku-20240307";

// ── Estado ────────────────────────────────────────────────
const conversations = {};
const orderState = {};
let orderCounter = 1000;

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// ── Helpers ───────────────────────────────────────────────
function stripCountryCode(num) {
  let n = num.replace(/[^0-9]/g, "");
  if (n.startsWith("57") && n.length === 12) n = n.substring(2);
  return n;
}

function getOrderNumber() {
  orderCounter++;
  return orderCounter;
}

async function guardarMensajeSupabase(restId, telefono, contenido, tipo, extra) {
  try {
    await axios.post(SUPABASE_URL + "/rest/v1/mensajes", {
      restaurante_id: restId,
      telefono: stripCountryCode(telefono),
      contenido,
      tipo,
      extra: extra ? JSON.stringify(extra) : null
    }, { headers: sbH(false) });
  } catch(e) { console.error("[guardarMensaje]", e.message); }
}

async function getOrderState(telefono) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/order_state?telefono=eq." + encodeURIComponent(telefono) + "&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    if(r.data && r.data.length > 0) {
      var estado = r.data[0].estado;
      if(typeof estado === "string") estado = JSON.parse(estado);
      if(estado && estado.status && estado.status !== "entregado" && estado.status !== "cancelado") {
        return estado;
      }
    }
    return null;
  } catch(e) { return null; }
}

async function setOrderState(telefono, estado) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.post(
      SUPABASE_URL + "/rest/v1/order_state?on_conflict=telefono",
      { telefono, estado: JSON.stringify(estado), updated_at: new Date().toISOString() },
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" } }
    );
  } catch(e) { console.error("setOrderState:", e.message); }
}

async function deleteOrderState(telefono) {
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    await axios.delete(
      SUPABASE_URL + "/rest/v1/order_state?telefono=eq." + encodeURIComponent(telefono),
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
  } catch(e) { console.error("deleteOrderState:", e.message); }
}

async function sendWhatsAppMessage(to, message, phoneId) {
  const pid = phoneId || process.env.WHATSAPP_PHONE_ID;
  if (!pid) throw new Error("WHATSAPP_PHONE_ID no configurado");
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("WHATSAPP_TOKEN no configurado");

  const formattedTo = to.startsWith("57") ? to : "57" + to.replace(/^\+/, "");

  await axios.post(
    `https://graph.facebook.com/v20.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to: formattedTo,
      type: "text",
      text: { body: message }
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );
}

async function enviarPushPorRol(restId, rol, payload) {
  try {
    const r = await axios.get(
      SUPABASE_URL + "/rest/v1/push_subscriptions?restaurante_id=eq." + restId + "&rol=eq." + rol + "&select=*",
      { headers: sbH(false) }
    );
    for (const sub of (r.data || [])) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload)
        );
      } catch(e) { console.error("[push] fallo:", e.message); }
    }
  } catch(e) { console.error("[push] error:", e.message); }
}

function getMensaje(rest, key, fallback) {
  if (!rest) return fallback;
  const val = rest[key];
  return (val && val.trim()) ? val : fallback;
}

// ── Claude System Prompt ──────────────────────────────────
function buildSystemPrompt(rest, pedidoActivo) {
  let menuText = "";
  if (rest.menu_items && rest.menu_items.length) {
    menuText = rest.menu_items.map(i => `- ${i.emoji || "•"} ${i.nombre}: $${Number(i.precio).toLocaleString("es-CO")} (${i.categoria})${i.descripcion ? " - " + i.descripcion : ""}`).join("\n");
  }

  let pedidoInfo = "";
  if (pedidoActivo && pedidoActivo.items && pedidoActivo.items.length) {
    pedidoInfo = `\n\n🛒 PEDIDO ACTIVO #${pedidoActivo.orderNumber}:\n`;
    pedidoInfo += pedidoActivo.items.map(it => `- ${it.nombre} x${it.cantidad} = $${(it.precio * it.cantidad).toLocaleString("es-CO")}`).join("\n");
    pedidoInfo += `\nTotal: $${pedidoActivo.total.toLocaleString("es-CO")}`;
    pedidoInfo += `\nEstado: ${pedidoActivo.status}`;
    if (pedidoActivo.paymentMethod) pedidoInfo += `\nPago: ${pedidoActivo.paymentMethod}`;
    if (pedidoActivo.address) pedidoInfo += `\nDirección: ${pedidoActivo.address}`;
  }

  return `Eres LUZ, la asistente virtual de ${rest.nombre || "el restaurante"}. Eres amable, rápida y hablas como una persona real (no robótica).\n\nMENÚ ACTUAL:\n${menuText || "Consulta el menú con el restaurante"}\n${pedidoInfo}\n\nINSTRUCCIONES:\n- Si el cliente quiere pedir, guía paso a paso\n- Si ya tiene pedido activo, ofrece modificarlo\n- Pregunta dirección si es domicilio\n- Pregunta método de pago\n- Confirma todo antes de enviar a cocina\n- Responde en español colombiano\n- Sé breve y directa`;
}

// ── Procesar mensaje WhatsApp ─────────────────────────────
async function procesarMensaje(msg, from, phoneNumberId) {
  try {
    const telefono = stripCountryCode(from);

    // Buscar restaurante por phone_id
    let restaurante = null;
    try {
      const rr = await axios.get(
        SUPABASE_URL + "/rest/v1/restaurantes?whatsapp_phone_id=eq." + phoneNumberId + "&select=*",
        { headers: sbH(false) }
      );
      if (rr.data && rr.data.length) restaurante = rr.data[0];
    } catch(e) {}

    if (!restaurante) {
      console.log("[procesar] Restaurante no encontrado para phone_id:", phoneNumberId);
      return;
    }

    // Guardar mensaje del cliente
    await guardarMensajeSupabase(restaurante.id, from, msg, "cliente", null);

    // Recuperar conversación
    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: msg });
    if (conversations[from].length > 20) conversations[from] = conversations[from].slice(-20);

    // Recuperar pedido activo
    if (!orderState[from]) {
      var saved = await getOrderState(from);
      if (saved) { 
        orderState[from] = saved; 
        console.log("[recuperado] Pedido activo para:", from, "#", saved.orderNumber);
      }
    }

    // Buscar pedido activo en BD como fallback
    if (!orderState[from]) {
      try {
        var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
        var pedActivo = await axios.get(
          SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante.id +
          "&cliente_tel=eq." + encodeURIComponent(telefono) +
          "&estado=in.(confirmado,en_preparacion,listo)&order=created_at.desc&limit=1&select=*",
          { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
        );
        if (pedActivo.data && pedActivo.data.length > 0) {
          var p = pedActivo.data[0];
          orderState[from] = {
            status: p.estado === "confirmado" ? "esperando_pago" : p.estado,
            orderNumber: p.numero_pedido,
            items: Array.isArray(p.items) ? p.items : [],
            total: p.total,
            desechables: p.desechables,
            domicilio: p.domicilio,
            address: p.direccion,
            paymentMethod: p.metodo_pago,
            notasEspeciales: p.notas_especiales
          };
          await setOrderState(from, orderState[from]);
          console.log("[recuperado BD] Pedido #", p.numero_pedido, "para:", from);
        }
      } catch(e) { /* silencioso */ }
    }

    // Detectar intención de pedido
    const lowerMsg = msg.toLowerCase();
    const esPedido = /quiero|pedir|ordenar|dame|pido|me das|hazme|envíame|enviame|trae|lleva/.test(lowerMsg);

    if (esPedido && !orderState[from]) {
      orderState[from] = { status: "tomando_pedido", items: [], total: 0 };
      await setOrderState(from, orderState[from]);
    }

    // Construir prompt
    const systemPrompt = buildSystemPrompt(restaurante, orderState[from]);
    const messages = [{ role: "system", content: systemPrompt }, ...conversations[from]];

    // Llamar a Claude
    let respuesta = "";
    try {
      const claudeResp = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: ANTHROPIC_MODEL,
          max_tokens: 500,
          messages: messages
        },
        { headers: { "x-api-key": ANTHROPIC_KEY, "Content-Type": "application/json", "anthropic-version": "2023-06-01" } }
      );
      respuesta = claudeResp.data.content[0].text;
    } catch(e) {
      console.error("[Claude] error:", e.message);
      respuesta = "Disculpa, estoy teniendo problemas técnicos. ¿Puedes intentar de nuevo en un momento?";
    }

    // Guardar respuesta
    conversations[from].push({ role: "assistant", content: respuesta });
    await guardarMensajeSupabase(restaurante.id, from, respuesta, "luz", null);

    // Enviar por WhatsApp
    try {
      await sendWhatsAppMessage(from, respuesta, phoneNumberId);
    } catch(e) {
      console.error("[WhatsApp] error enviando:", e.message);
    }

  } catch(err) {
    console.error("[procesarMensaje] error:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════

// ── Health check ──────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Geocoding ─────────────────────────────────────────────
app.get("/api/geocode", async function(req, res) {
  var q = req.query.q;
  if(!q) return res.status(400).json({ error: "Falta q" });
  try {
    var r = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: q, format: "json", limit: 1 },
      headers: { "User-Agent": "LUZ-IA-Restaurant-App/1.0" },
      timeout: 5000
    });
    if(r.data && r.data.length > 0){
      res.json({ lat: parseFloat(r.data[0].lat), lon: parseFloat(r.data[0].lon), display_name: r.data[0].display_name });
    } else {
      res.json({ lat: null, lon: null });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Clásicas ──────────────────────────────────────────────
app.get("/api/clasicas", async function(req, res) {
  if(!req.query.restaurante_id) return res.json([]);
  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var r = await axios.get(
      SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + req.query.restaurante_id +
      "&categoria=eq.Cl%C3%A1sicas%20de%20La%20Curva&disponible=eq.true&order=orden_destacado.asc,precio.asc&select=*",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );
    res.json(r.data || []);
  } catch(e) { console.error("[clasicas] error:", e.message); res.json([]); }
});

// ── Pedido manual (menú web) ──────────────────────────────
app.post("/api/pedido-manual", async function(req, res) {
  try {
    const { restaurante_id, items, total, nombre_cliente, telefono, direccion, metodo_pago, notas, desechables, domicilio } = req.body;

    if (!restaurante_id || !items || !items.length) {
      return res.status(400).json({ ok: false, error: "Faltan datos del pedido" });
    }

    const num = getOrderNumber();
    const pedidoData = {
      restaurante_id,
      numero_pedido: num,
      items: JSON.stringify(items),
      total: Number(total) || 0,
      nombre_cliente: nombre_cliente || "Cliente Web",
      cliente_tel: telefono ? stripCountryCode(telefono) : null,
      direccion: direccion || "",
      metodo_pago: metodo_pago || "efectivo",
      notas_especiales: notas || "",
      desechables: desechables || false,
      domicilio: domicilio || 0,
      estado: "confirmado",
      canal: "web",
      created_at: new Date().toISOString()
    };

    await axios.post(SUPABASE_URL + "/rest/v1/pedidos", pedidoData, { headers: sbH(false) });

    // Enviar confirmación WhatsApp
    var restaurante = null;
    try {
      var rr = await axios.get(
        SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id + "&select=*",
        { headers: sbH(false) }
      );
      if(rr.data?.length) restaurante = rr.data[0];
    } catch(e) {}

    if(restaurante && telefono) {
      var pid = restaurante.whatsapp_phone_id || process.env.WHATSAPP_PHONE_ID;
      var numStr = num ? " #" + num : "";
      var msgConfirmacion = getMensaje(restaurante, "msg_confirmacion",
        "¡Hola! Tu pedido" + numStr + " ya fue recibido. Total: $" + Number(total).toLocaleString("es-CO") +
        ". Estamos preparándolo y te avisamos cuando esté listo. ¡Gracias por preferirnos! 🍔"
      );

      try {
        await sendWhatsAppMessage(telefono, msgConfirmacion, pid);
        await guardarMensajeSupabase(restaurante_id, telefono, msgConfirmacion, "estado_luz", null);
        console.log("[confirmación] WhatsApp enviado a", telefono, "pedido #", num);
      } catch(e) {
        console.error("[confirmación] Error enviando WhatsApp:", e.message);
      }

      // Notificación push a cocina
      enviarPushPorRol(restaurante_id, "cocina", {
        title: "🍳 Nuevo pedido" + numStr,
        body: nombre_cliente + " · $" + Number(total).toLocaleString("es-CO"),
        icon: "/icons/icon-192.png",
        vibrate: [100, 50, 100],
        tag: "pedido-" + num,
        url: "/cocina"
      });
    }

    res.json({ ok: true, numero: num, numero_pedido: num });

  } catch(e) {
    console.error("[pedido-manual] error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Promos masivas ────────────────────────────────────────
app.post("/api/enviar-promo", async function(req, res) {
  if (!req.body.restaurante_id || !req.body.mensaje) {
    return res.status(400).json({ ok: false, error: "Faltan datos" });
  }

  try {
    var svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
    var restId = req.body.restaurante_id;
    var mensaje = req.body.mensaje;
    var imagenUrl = req.body.imagen_url || null;

    var hace30 = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    var resp = await axios.get(
      SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restId +
      "&created_at=gte." + hace30 + "&select=cliente_tel",
      { headers: { "apikey": svcKey, "Authorization": "Bearer " + svcKey } }
    );

    var unicos = {};
    (resp.data || []).forEach(function(p) { if (p.cliente_tel) unicos[p.cliente_tel] = true; });
    var telefonos = Object.keys(unicos);

    if (!telefonos.length) {
      return res.json({ ok: true, enviados: 0, fallidos: 0, total: 0, warning: "No hay clientes activos" });
    }

    var pid = process.env.WHATSAPP_PHONE_ID;
    try {
      var rr = await axios.get(
        SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restId + "&select=whatsapp_phone_id",
        { headers: sbH(false) }
      );
      if (rr.data?.length && rr.data[0].whatsapp_phone_id) pid = rr.data[0].whatsapp_phone_id;
    } catch(e) {}

    if (!pid) return res.status(500).json({ ok: false, error: "WhatsApp no configurado" });

    var enviados = 0, fallidos = 0, errores = [];

    for (var i = 0; i < telefonos.length; i++) {
      var tel = telefonos[i];
      try {
        var toNum = tel.replace(/[^0-9]/g, "");
        if (!toNum.startsWith("57") && toNum.length === 10) toNum = "57" + toNum;

        if (imagenUrl) {
          await axios.post(
            "https://graph.facebook.com/v20.0/" + pid + "/messages",
            { messaging_product: "whatsapp", to: toNum, type: "image", image: { link: imagenUrl, caption: mensaje } },
            { headers: { "Authorization": "Bearer " + process.env.WHATSAPP_TOKEN, "Content-Type": "application/json" } }
          );
        } else {
          await axios.post(
            "https://graph.facebook.com/v20.0/" + pid + "/messages",
            { messaging_product: "whatsapp", to: toNum, type: "text", text: { body: mensaje } },
            { headers: { "Authorization": "Bearer " + process.env.WHATSAPP_TOKEN, "Content-Type": "application/json" } }
          );
        }
        enviados++;
        await guardarMensajeSupabase(restId, tel, mensaje, "promo", null);
      } catch (e) {
        fallidos++;
        errores.push({ telefono: tel, error: e.response?.data?.error?.message || e.message });
        console.error("Promo fallida a " + tel + ":", e.response?.data || e.message);
      }
      if (i < telefonos.length - 1) await new Promise(function(r) { setTimeout(r, 300); });
    }

    res.json({ ok: true, enviados, fallidos, total: telefonos.length, errores: errores.length > 0 ? errores : undefined });

  } catch (e) { res.status(500).json({ ok: false, error: e.response ? JSON.stringify(e.response.data) : e.message }); }
});

// ── Config restaurante ────────────────────────────────────
app.post("/api/restaurante-config", async function(req, res) {
  try {
    const { restaurante_id, config } = req.body;
    if (!restaurante_id || !config) return res.status(400).json({ ok: false, error: "Faltan datos" });
    await axios.patch(
      SUPABASE_URL + "/rest/v1/restaurantes?id=eq." + restaurante_id,
      config,
      { headers: sbH(false) }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Pedidos ───────────────────────────────────────────────
app.get("/api/pedidos", async function(req, res) {
  try {
    const { restaurante_id, estado, desde, hasta } = req.query;
    let url = SUPABASE_URL + "/rest/v1/pedidos?restaurante_id=eq." + restaurante_id;
    if (estado) url += "&estado=eq." + estado;
    if (desde) url += "&created_at=gte." + desde;
    if (hasta) url += "&created_at=lte." + hasta;
    url += "&order=created_at.desc&select=*";
    const r = await axios.get(url, { headers: sbH(false) });
    res.json(r.data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/pedidos/:id", async function(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    await axios.patch(
      SUPABASE_URL + "/rest/v1/pedidos?id=eq." + id,
      updates,
      { headers: sbH(false) }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Menú items ────────────────────────────────────────────
app.get("/api/menu", async function(req, res) {
  try {
    const { restaurante_id } = req.query;
    const r = await axios.get(
      SUPABASE_URL + "/rest/v1/menu_items?restaurante_id=eq." + restaurante_id + "&order=orden.asc&select=*",
      { headers: sbH(false) }
    );
    res.json(r.data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/menu", async function(req, res) {
  try {
    const item = req.body;
    await axios.post(SUPABASE_URL + "/rest/v1/menu_items", item, { headers: sbH(false) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/menu/:id", async function(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    await axios.patch(
      SUPABASE_URL + "/rest/v1/menu_items?id=eq." + id,
      updates,
      { headers: sbH(false) }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/menu/:id", async function(req, res) {
  try {
    const { id } = req.params;
    await axios.delete(
      SUPABASE_URL + "/rest/v1/menu_items?id=eq." + id,
      { headers: sbH(false) }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Cupones ───────────────────────────────────────────────
app.get("/api/cupones", async function(req, res) {
  try {
    const { restaurante_id, codigo } = req.query;
    let url = SUPABASE_URL + "/rest/v1/cupones?restaurante_id=eq." + restaurante_id;
    if (codigo) url += "&codigo=eq." + codigo;
    url += "&select=*";
    const r = await axios.get(url, { headers: sbH(false) });
    res.json(r.data || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Fidelidad ─────────────────────────────────────────────
app.get("/api/fidelidad", async function(req, res) {
  try {
    const { restaurante_id, telefono } = req.query;
    const r = await axios.get(
      SUPABASE_URL + "/rest/v1/clientes_fidelidad?restaurante_id=eq." + restaurante_id + "&telefono=eq." + telefono + "&select=*",
      { headers: sbH(false) }
    );
    res.json(r.data?.[0] || null);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Push subscriptions ────────────────────────────────────
app.post("/api/push-subscribe", async function(req, res) {
  try {
    const { restaurante_id, rol, subscription } = req.body;
    await axios.post(
      SUPABASE_URL + "/rest/v1/push_subscriptions",
      { restaurante_id, rol, endpoint: subscription.endpoint, keys: subscription.keys },
      { headers: sbH(false) }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── WhatsApp Webhook ──────────────────────────────────────
app.get("/webhook", function(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "luz_verify_token";
  if (mode === "subscribe" && token === verifyToken) {
    console.log("[webhook] verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async function(req, res) {
  res.sendStatus(200);
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    if (!value || !value.messages) return;

    const phoneNumberId = value.metadata?.phone_number_id;
    for (const msg of value.messages) {
      if (msg.type === "text") {
        await procesarMensaje(msg.text.body, msg.from, phoneNumberId);
      }
    }
  } catch(e) { console.error("[webhook] error:", e.message); }
});

// ── Iniciar ───────────────────────────────────────────────
app.listen(PORT, function() {
  console.log("[LUZ IA] Servidor en puerto", PORT);
  console.log("[LUZ IA] Supabase:", SUPABASE_URL);
  console.log("[LUZ IA] Claude:", ANTHROPIC_KEY ? "✅ Configurado" : "❌ No configurado");
  console.log("[LUZ IA] WhatsApp:", process.env.WHATSAPP_TOKEN ? "✅ Configurado" : "❌ No configurado");
});

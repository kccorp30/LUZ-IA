// ── parseReply CORREGIDO ──────────────────────────────────────────────────────
function parseReply(reply, from) {
  var cleanReply = reply;
  var sideEffect = null;

  // FIX: regex más robusto que captura el bloque completo aunque tenga saltos de línea
  if (reply.indexOf("PEDIDO_LISTO:") !== -1) {
    var itemsMatch       = reply.match(/ITEMS:\s*(.+)/);
    var totalMatch       = reply.match(/TOTAL:\s*(\d+)/);
    var desechablesMatch = reply.match(/DESECHABLES:\s*(\d+)/);
    var domicilioMatch   = reply.match(/DOMICILIO:\s*(\d+)/);

    if (itemsMatch && totalMatch) {
      var items       = itemsMatch[1].split("|").map(function (i) { return i.trim(); });
      var total       = totalMatch[1];
      var desechables = desechablesMatch ? desechablesMatch[1] : "0";
      var domicilio   = domicilioMatch   ? domicilioMatch[1]   : "3000";
      var orderNumber = nextOrderNumber();

      orderState[from] = {
        status:      "esperando_direccion",
        orderNumber: orderNumber,
        items:       items,
        desechables: desechables,
        domicilio:   domicilio,
        total:       total
      };
      sideEffect = "pedido_registrado";
    }

    // FIX: limpia TODO el bloque PEDIDO_LISTO hasta el final del último campo conocido
    cleanReply = cleanReply
      .replace(/PEDIDO_LISTO:[\s\S]*?(?:TOTAL|DOMICILIO|DESECHABLES|ITEMS):\s*\S+[^\n]*/g, "")
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
    if (telMatch && orderState[from]) {
      orderState[from].extraPhone = telMatch[1].trim();
    }
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
    if (orderState[from]) {
      orderState[from].paymentMethod = orderState[from].paymentMethod || "digital";
      orderState[from].status        = "confirmado";
      sideEffect = "pago_confirmado";
    }
    cleanReply = cleanReply.replace("PAGO_CONFIRMADO", "").trim();
  }

  return { cleanReply: cleanReply, sideEffect: sideEffect };
}

// ── guardarPedidoSupabase CORREGIDO ───────────────────────────────────────────
async function guardarPedidoSupabase(restauranteId, pedidoData) {
  try {
    // FIX: siempre usa SERVICE_KEY para bypasear RLS en inserts
    var svcKey = process.env.SUPABASE_SERVICE_KEY;
    if (!svcKey) {
      console.error("ADVERTENCIA: SUPABASE_SERVICE_KEY no definida — el pedido puede ser rechazado por RLS");
      svcKey = SUPABASE_KEY;
    }

    var subtotal = Number(pedidoData.total)
      - Number(pedidoData.desechables || 0)
      - Number(pedidoData.domicilio   || 0);

    var payload = {
      restaurante_id: restauranteId,
      numero_pedido:  pedidoData.orderNumber,
      cliente_tel:    pedidoData.phone,
      items:          pedidoData.items,
      subtotal:       subtotal,
      desechables:    pedidoData.desechables,
      domicilio:      pedidoData.domicilio,
      total:          pedidoData.total,
      direccion:      pedidoData.address,
      metodo_pago:    pedidoData.paymentMethod,
      estado:         "confirmado"
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
          // FIX: "return=representation" para ver la respuesta y confirmar el insert
          "Prefer":        "return=representation"
        }
      }
    );

    console.log("✅ Pedido #" + pedidoData.orderNumber + " guardado en Supabase. ID:", response.data[0]?.id);

    // FIX: notifica al dashboard via endpoint interno si existe
    notificarDashboard(response.data[0]);

  } catch (err) {
    var errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("❌ Error guardando pedido en Supabase:", errData);

    // FIX: log del status HTTP para diagnosticar si es RLS (403) u otro error
    if (err.response) {
      console.error("HTTP Status:", err.response.status);
      console.error("Detalles:", JSON.stringify(err.response.data));
    }
  }
}

// ── NOTIFICAR DASHBOARD (nuevo) ───────────────────────────────────────────────
// Si tu dashboard escucha un webhook interno o usa polling, este helper lo activa.
// Si usas Supabase Realtime en el frontend, el INSERT ya lo dispara automáticamente
// siempre que el INSERT haya ocurrido (por eso el fix de SERVICE_KEY es crítico).
function notificarDashboard(pedido) {
  var DASHBOARD_WEBHOOK = process.env.DASHBOARD_WEBHOOK_URL;
  if (!DASHBOARD_WEBHOOK || !pedido) return;

  axios.post(DASHBOARD_WEBHOOK, { evento: "nuevo_pedido", pedido: pedido }, { timeout: 4000 })
    .then(function () { console.log("Dashboard notificado del nuevo pedido #" + pedido.numero_pedido); })
    .catch(function (err) { console.error("Error notificando dashboard:", err.message); });
}
```

---

**Qué tienes que hacer:**

1. **Reemplaza la función `parseReply`** completa con la de arriba.
2. **Reemplaza `guardarPedidoSupabase`** completa con la de arriba.
3. **Agrega `notificarDashboard`** como función nueva.
4. **En tu `.env` o variables de entorno**, asegúrate de tener:
```
   SUPABASE_SERVICE_KEY=tu_service_role_key_aqui
```
   Esa la consigues en Supabase → Project Settings → API → `service_role` (no la `anon`).

5. **Opcional**: si tu dashboard tiene un webhook URL propio, agrégalo como:
```
   DASHBOARD_WEBHOOK_URL=https://tu-dashboard.com/nuevo-pedido

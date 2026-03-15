async function guardarPedidoSupabase(restauranteId, pedidoData) {
  try {

    const svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;

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
          "apikey": svcKey,
          "Authorization": "Bearer " + svcKey,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        }
      }
    );

    console.log("Pedido guardado correctamente:", resp.data);

  } catch (err) {

    const errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Error guardando pedido:", errData);

  }
}

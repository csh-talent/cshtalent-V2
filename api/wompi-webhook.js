import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = 'https://eiauimhrybdamjpntdwh.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET;

  const body = req.body;

  // ── 1. Verificar que esta notificación viene de verdad de Wompi ──
  try {
    const { signature, timestamp, data } = body;
    if (!signature?.checksum || !signature?.properties) {
      return res.status(400).json({ error: 'Firma faltante' });
    }
    // Wompi concatena los valores de las propiedades indicadas + timestamp + el secreto de eventos
    const getProp = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
    const concatenado = signature.properties.map(p => getProp(body, p)).join('') + timestamp + WOMPI_EVENTS_SECRET;
    const checksumCalculado = crypto.createHash('sha256').update(concatenado).digest('hex').toUpperCase();

    if (checksumCalculado !== signature.checksum.toUpperCase()) {
      console.error('Firma de Wompi inválida — posible notificación falsa.');
      return res.status(401).json({ error: 'Firma inválida' });
    }
  } catch (e) {
    console.error('Error verificando firma de Wompi:', e);
    return res.status(400).json({ error: 'No se pudo verificar la notificación' });
  }

  // ── 2. Extraer la transacción ──
  const transaccion = body?.data?.transaction;
  if (!transaccion?.reference || !transaccion?.status) {
    return res.status(200).json({ ok: true }); // evento sin transacción útil, no reintentar
  }

  const { reference, status, id: wompiTransactionId } = transaccion;

  // ── 3. Buscar el pedido correspondiente ──
  let pedido;
  try {
    const pedidoRes = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?reference=eq.${reference}&select=*`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    );
    const pedidos = await pedidoRes.json();
    pedido = pedidos?.[0];
    if (!pedido) {
      console.error('Pedido no encontrado para reference:', reference);
      return res.status(200).json({ ok: true }); // no reintentar, no hay nada que hacer
    }
    if (pedido.status !== 'pending') {
      return res.status(200).json({ ok: true }); // ya fue procesado antes, evita duplicar el entitlement
    }
  } catch (e) {
    console.error('Error buscando el pedido:', e);
    return res.status(500).json({ error: 'Error interno' });
  }

  // ── 4. Actualizar el estado del pedido ──
  const nuevoEstado = status === 'APPROVED' ? 'approved' : (status === 'DECLINED' ? 'declined' : 'error');
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/payments?id=eq.${pedido.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: nuevoEstado,
        wompi_transaction_id: wompiTransactionId,
        updated_at: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Error actualizando el pedido:', e);
  }

  // ── 5. Si fue aprobado, crear el entitlement — esto es lo que da acceso real ──
  if (nuevoEstado === 'approved') {
    try {
      if (pedido.type === 'tool') {
        const toolRes = await fetch(`${SUPABASE_URL}/rest/v1/tools?slug=eq.${pedido.tool_slug}&select=id`, {
          headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
        const tools = await toolRes.json();
        const toolId = tools?.[0]?.id;
        if (toolId) {
          const expira = new Date();
          expira.setDate(expira.getDate() + 30);
          await fetch(`${SUPABASE_URL}/rest/v1/entitlements`, {
            method: 'POST',
            headers: {
              'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json', 'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              user_id: pedido.user_id,
              type: 'tool',
              tool_id: toolId,
              source: 'individual_purchase',
              expires_at: expira.toISOString()
            })
          });
        }
      } else if (pedido.type === 'membership') {
        const planRes = await fetch(`${SUPABASE_URL}/rest/v1/membership_plans?slug=eq.${pedido.plan_slug}&select=duration_days`, {
          headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
        const planes = await planRes.json();
        const duracion = planes?.[0]?.duration_days || 30;
        const expira = new Date();
        expira.setDate(expira.getDate() + duracion);
        await fetch(`${SUPABASE_URL}/rest/v1/entitlements`, {
          method: 'POST',
          headers: {
            'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            user_id: pedido.user_id,
            type: 'membership',
            source: 'membership_purchase',
            expires_at: expira.toISOString()
          })
        });
      }
    } catch (e) {
      console.error('Error creando el entitlement:', e);
      return res.status(500).json({ error: 'Pago confirmado pero hubo un error otorgando el acceso' });
    }
  }

  return res.status(200).json({ ok: true });
}

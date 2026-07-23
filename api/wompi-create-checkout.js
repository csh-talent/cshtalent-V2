import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = 'https://eiauimhrybdamjpntdwh.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const WOMPI_PUBLIC_KEY = 'pub_prod_KRiXKf8aQBn9i1Bdj8fXj7DVhPWrUomm';
  const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET;

  // ── 1. Verificar quién está pagando ──
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
  }

  let user;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_KEY }
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Tu sesión no es válida. Inicia sesión de nuevo.' });
    }
    user = await userRes.json();
  } catch (e) {
    return res.status(401).json({ error: 'No pudimos verificar tu sesión.' });
  }

  // ── 2. Determinar qué se está comprando y su precio ──
  const { tipo, tool_slug } = req.body; // tipo: 'tool' | 'membership'

  let amountCop, paymentRow;
  try {
    if (tipo === 'tool') {
      const toolRes = await fetch(`${SUPABASE_URL}/rest/v1/tools?slug=eq.${tool_slug}&select=price_cop`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const tools = await toolRes.json();
      if (!tools?.[0]?.price_cop) {
        return res.status(400).json({ error: 'Esta herramienta no tiene un precio configurado.' });
      }
      amountCop = tools[0].price_cop;
      paymentRow = { type: 'tool', tool_slug };
    } else if (tipo === 'membership') {
      const planRes = await fetch(`${SUPABASE_URL}/rest/v1/membership_plans?slug=eq.estandar&select=price_cop`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const planes = await planRes.json();
      if (!planes?.[0]?.price_cop) {
        return res.status(400).json({ error: 'La membresía no tiene un precio configurado.' });
      }
      amountCop = planes[0].price_cop;
      paymentRow = { type: 'membership', plan_slug: 'estandar' };
    } else {
      return res.status(400).json({ error: 'Tipo de compra no reconocido.' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'No pudimos calcular el precio.' });
  }

  const amountInCents = amountCop * 100;
  const currency = 'COP';
  const reference = `csh_${paymentRow.type}_${user.id.slice(0, 8)}_${Date.now()}`;

  // ── 3. Guardar el pedido como 'pending' antes de firmar nada ──
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        reference,
        user_id: user.id,
        type: paymentRow.type,
        tool_slug: paymentRow.tool_slug || null,
        plan_slug: paymentRow.plan_slug || null,
        amount_cents: amountInCents,
        status: 'pending'
      })
    });
  } catch (e) {
    return res.status(500).json({ error: 'No pudimos registrar el pedido.' });
  }

  // ── 4. Firmar el checkout (evita que alguien altere el monto en el navegador) ──
  const signatureString = `${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_SECRET}`;
  const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

  return res.status(200).json({
    publicKey: WOMPI_PUBLIC_KEY,
    currency,
    amountInCents,
    reference,
    signature
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = 'https://eiauimhrybdamjpntdwh.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const DESTINO = 'gh.bycaro@gmail.com';

  const { nombre, correo, tipo, mensaje } = req.body;

  if (!nombre || !correo || !mensaje) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios.' });
  }

  // ── 1. Identificar al usuario si venía con sesión (opcional, no bloquea el envío) ──
  let userId = null;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (token) {
    try {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_KEY }
      });
      if (userRes.ok) {
        const user = await userRes.json();
        userId = user?.id || null;
      }
    } catch (e) { /* si falla, seguimos sin user_id */ }
  }

  // ── 2. Guardar el mensaje en su propia tabla — esto es lo permanente,
  //      para estadísticas y un futuro panel de administrador ──
  let mensajeGuardado = false;
  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/pqrs_mensajes`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ user_id: userId, nombre, correo, tipo: tipo || 'Otro', mensaje })
    });
    mensajeGuardado = insertRes.ok;
  } catch (e) {
    console.error('Error guardando el PQRS:', e);
  }

  // ── 3. Intentar además el envío por correo (best-effort, no bloquea si falla) ──
  let emailEnviado = false;
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'CSH Talent <hola@cshtalent.com>',
        to: [DESTINO],
        reply_to: correo,
        subject: `[${tipo || 'PQRS'}] Nuevo mensaje de ${nombre}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="font-size: 18px; font-weight: 800; letter-spacing: 0.08em; color: #111827;">CSH TALENT</div>
            <div style="height: 3px; width: 50px; background: #b5404a; margin: 6px 0 20px;"></div>
            <p style="font-size: 14px; color: #1f2937;"><strong>Tipo:</strong> ${tipo || 'No especificado'}</p>
            <p style="font-size: 14px; color: #1f2937;"><strong>Nombre:</strong> ${nombre}</p>
            <p style="font-size: 14px; color: #1f2937;"><strong>Correo:</strong> ${correo}</p>
            <p style="font-size: 14px; color: #1f2937;"><strong>Mensaje:</strong></p>
            <p style="font-size: 14px; color: #1f2937; white-space: pre-wrap;">${mensaje}</p>
          </div>
        `
      })
    });
    emailEnviado = emailRes.ok;
    if (!emailRes.ok) {
      const errData = await emailRes.json().catch(() => ({}));
      console.error('Error de Resend:', errData);
    }
  } catch (e) {
    console.error('Error enviando el correo:', e);
  }

  // ── 4. Reflejar en la tabla si el correo sí salió, para saberlo después ──
  if (mensajeGuardado && emailEnviado) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/pqrs_mensajes?correo=eq.${encodeURIComponent(correo)}&mensaje=eq.${encodeURIComponent(mensaje)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ email_enviado: true })
      });
    } catch (e) { /* no crítico */ }
  }

  // El mensaje se considera "recibido" si al menos quedó guardado en la tabla,
  // aunque el correo de notificación haya fallado (nada se pierde).
  if (!mensajeGuardado && !emailEnviado) {
    return res.status(500).json({ ok: false, error: 'No pudimos recibir tu mensaje. Intenta de nuevo.' });
  }

  return res.status(200).json({ ok: true, guardado: mensajeGuardado, correo_enviado: emailEnviado });
}

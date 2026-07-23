export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const DESTINO = 'gh.bycaro@gmail.com';

  const { nombre, correo, tipo, mensaje } = req.body;

  if (!nombre || !correo || !mensaje) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios.' });
  }

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

    if (!emailRes.ok) {
      const errData = await emailRes.json().catch(() => ({}));
      console.error('Error de Resend:', errData);
      return res.status(500).json({ ok: false, error: 'No pudimos enviar el mensaje.' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Error enviando contacto:', e);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
}

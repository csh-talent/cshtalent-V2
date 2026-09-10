// api/buscar-noticias.js
// Disparado por Vercel Cron cada 5 días. Busca noticias nuevas de actualidad
// laboral colombiana, evita duplicados y temas repetidos, y las deja en
// estado='pendiente' (activo=false) para revisión humana. Si hay candidatas
// nuevas, avisa a Carolina por correo (Resend, mismo patrón que
// api/enviar-contacto.js).
//
// Variables de entorno requeridas (agregar en Vercel si no existen):
// - CRON_SECRET        -> nueva, protege este endpoint
// - SUPABASE_SERVICE_ROLE_KEY  -> ya existe
// - ANTHROPIC_API_KEY   -> ya existe
// - RESEND_API_KEY      -> ya existe

const SUPABASE_URL = 'https://eiauimhrybdamjpntdwh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function sbSelect(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase select falló: ${await r.text()}`);
  return r.json();
}

async function sbInsert(table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase insert falló: ${await r.text()}`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  // Vercel envía automáticamente "Authorization: Bearer <CRON_SECRET>" en
  // las invocaciones de cron cuando la variable de entorno CRON_SECRET
  // está configurada en el proyecto. Esto bloquea llamadas externas.
  // También se acepta ?secret=... por query param, únicamente para poder
  // probar el endpoint manualmente desde el navegador (Vercel Cron nunca
  // usa esta vía).
  const authHeader = req.headers['authorization'];
  const secretQuery = req.query?.secret;
  const autorizado =
    authHeader === `Bearer ${process.env.CRON_SECRET}` || secretQuery === process.env.CRON_SECRET;
  if (!autorizado) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  try {
    // 1. Contexto: últimas 20 noticias ya publicadas o pendientes, para que
    //    Claude no proponga el mismo tema dos veces.
    const existentes = await sbSelect('actualidad_laboral?select=titular,medio,fecha&order=fecha.desc&limit=20');

    const contextoExistentes = (existentes || [])
      .map((n) => `- [${n.medio}] ${n.titular} (${n.fecha})`)
      .join('\n') || '(ninguna todavía)';

    const hoy = new Date().toISOString().split('T')[0];

    const prompt = `Eres un investigador de actualidad laboral colombiana para el sitio CSH Talent.

Busca noticias RECIENTES (idealmente publicadas en los últimos 2 meses; hoy es ${hoy}) sobre estos temas:
- Actualidad laboral general en Colombia
- SST (Seguridad y Salud en el Trabajo)
- Conceptos de las Cortes en materia laboral (Corte Suprema de Justicia, Corte Constitucional) — jurisprudencia laboral relevante
- Circulares del Ministerio del Trabajo
- Estadísticas del DANE relacionadas con trabajo y empleo
- Circulares del SENA

Criterios OBLIGATORIOS:
- Solo medios reconocidos y serios: El Tiempo, Portafolio, Semana, El Universal, El País, o fuentes profesionales especializadas en SST. Evita Infobae si hay una alternativa más seria cubriendo la misma noticia.
- No repitas el mismo medio dos veces en tu respuesta.
- No propongas ninguna noticia sobre el mismo tema que estas ya publicadas o pendientes:
${contextoExistentes}
- El titular debe ser corto y PARAFRASEADO por ti — nunca copies el titular original palabra por palabra.
- Nunca reproduzcas el contenido del artículo, solo un titular corto parafraseado.
- Si no encuentras candidatas de calidad, es mejor devolver una lista vacía que forzar algo débil.

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional, sin backticks de markdown, con este formato exacto:
[{"titular": "...", "medio": "...", "fecha": "YYYY-MM-DD", "url": "..."}]

Si no encuentras ninguna noticia nueva que cumpla los criterios, responde exactamente: []`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Error llamando a la API de Anthropic:', errText);
      return res.status(502).json({ ok: false, error: 'Error al buscar noticias' });
    }

    const data = await anthropicRes.json();
    const textoRespuesta = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const limpio = textoRespuesta.replace(/```json|```/g, '').trim();

    let candidatas = [];
    try {
      candidatas = JSON.parse(limpio);
    } catch (e) {
      console.error('No se pudo parsear la respuesta de Claude:', limpio);
      return res.status(200).json({ ok: true, insertadas: 0, motivo: 'respuesta_no_parseable' });
    }

    if (!Array.isArray(candidatas) || candidatas.length === 0) {
      return res.status(200).json({ ok: true, insertadas: 0, motivo: 'sin_candidatas_nuevas' });
    }

    // 2. Filtrar: url ya existente en la tabla, o medio repetido dentro del propio lote.
    const urlsExistentes = await sbSelect('actualidad_laboral?select=url');
    const setUrls = new Set((urlsExistentes || []).map((r) => r.url));
    const mediosUsados = new Set();
    const nuevas = [];

    for (const c of candidatas) {
      if (!c || !c.titular || !c.medio || !c.url) continue;
      if (setUrls.has(c.url)) continue;
      if (mediosUsados.has(c.medio)) continue;
      mediosUsados.add(c.medio);
      nuevas.push({
        titular: c.titular,
        medio: c.medio,
        fecha: c.fecha || hoy,
        url: c.url,
        activo: false,
        estado: 'pendiente',
      });
    }

    if (nuevas.length === 0) {
      return res.status(200).json({ ok: true, insertadas: 0, motivo: 'todas_duplicadas' });
    }

    try {
      await sbInsert('actualidad_laboral', nuevas);
    } catch (insertError) {
      console.error('Error insertando noticias:', insertError);
      return res.status(500).json({ ok: false, error: 'Error al guardar en la base de datos' });
    }

    // 3. Avisar a Carolina por correo (best-effort — nunca perdemos las
    //    noticias insertadas si el correo falla).
    let correoEnviado = false;
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'CSH Talent <noreply@cshtalent.com>',
          to: 'gh.bycaro@gmail.com',
          subject: `${nuevas.length} noticia(s) nueva(s) por revisar — Actualidad laboral`,
          html: `<p>El agente de noticias encontró <strong>${nuevas.length}</strong> noticia(s) nueva(s) para revisar:</p>
            <ul>${nuevas.map((n) => `<li><strong>${n.medio}</strong> — ${n.titular}</li>`).join('')}</ul>
            <p><a href="https://www.cshtalent.com/admin-noticias.html">Revisar en el panel de administración</a></p>`,
        }),
      });
      correoEnviado = resendRes.ok;
      if (!correoEnviado) {
        console.error('Resend respondió con error:', await resendRes.text());
      }
    } catch (e) {
      console.error('Error enviando correo de alerta:', e);
    }

    return res.status(200).json({ ok: true, insertadas: nuevas.length, correo_enviado: correoEnviado });
  } catch (e) {
    console.error('Error en buscar-noticias:', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

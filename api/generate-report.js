export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = 'https://eiauimhrybdamjpntdwh.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TOOL_SLUG = 'cima';

  // ── 1. Verificar quién está llamando, usando su token de sesión ──
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión para generar el diagnóstico.' });
  }

  let user;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SERVICE_KEY
      }
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Tu sesión no es válida. Inicia sesión de nuevo.' });
    }
    user = await userRes.json();
  } catch (e) {
    return res.status(401).json({ error: 'No pudimos verificar tu sesión.' });
  }

  // ── 2. Contar cuántos diagnósticos COMPLETADOS ya tiene este usuario ──
  // (los borradores no cuentan contra el límite: solo los diagnósticos
  // realmente terminados consumen un cupo)
  let yaGenerados = 0;
  try {
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/diagnosticos?user_id=eq.${user.id}&estado=eq.completado&select=id`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Prefer': 'count=exact'
        }
      }
    );
    const contentRange = countRes.headers.get('content-range'); // ej. "0-1/2"
    yaGenerados = contentRange ? parseInt(contentRange.split('/')[1], 10) || 0 : 0;
  } catch (e) {
    return res.status(500).json({ error: 'No pudimos verificar tu historial de diagnósticos.' });
  }

  // ── 3. Preguntarle a la función genérica si este usuario puede usar el CIMA ──
  // Esta misma función (check_tool_access) la reutilizará cualquier herramienta
  // futura: ella resuelve sola membresía activa vs. límite gratuito configurado
  // en la tabla `tools`, sin que cada endpoint reinvente esa lógica.
  let acceso;
  try {
    const accesoRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_tool_access`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_user_id: user.id,
        p_tool_slug: TOOL_SLUG,
        p_current_uses: yaGenerados
      })
    });
    acceso = await accesoRes.json();
  } catch (e) {
    return res.status(500).json({ error: 'No pudimos verificar tu acceso a esta herramienta.' });
  }

  if (!acceso.allowed) {
    return res.status(403).json({
      error: 'Ya generaste tus diagnósticos gratuitos con esta cuenta.',
      limite_alcanzado: true
    });
  }

  // ── 4. Generar el informe (misma lógica de siempre, sin tocar) ──
  const { empresa, scores, totalPct, nivel } = req.body;

  if (!empresa || !scores) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const pesos = {
    'Estructura organizacional y perfiles': '10%',
    'Rotación y retención': '13%',
    'Desarrollo y Gestión del Desempeño': '13%',
    'Compensación y Beneficios': '18%',
    'Cumplimiento Legal Laboral': '18%',
    'Cultura y liderazgo': '15%',
    'Reclutamiento y Selección': '5%',
    'Responsabilidad Social, Diversidad e Inclusión e Innovación': '4%',
    'Nuevas formas de trabajo': '4%'
  };

  const resumenSecciones = scores.map(s => {
    const pct = Math.round(s.avg * 100);
    const nivelTexto = s.avg < 0.5 ? 'Bajo' : s.avg < 0.8 ? 'Medio' : 'Alto';
    return `- ${s.titulo} (Peso: ${pesos[s.titulo] || '—'}): ${pct}% — Nivel ${nivelTexto}
  Descripción del diagnóstico: ${s.diagnostico || 'Sin descripción disponible'}`;
  }).join('\n\n');

  const prompt = `Eres un consultor experto en Gestión Humana con amplia experiencia en diagnósticos organizacionales para empresas colombianas. Tu tarea es redactar un informe ejecutivo profesional, claro y estratégico basado en los resultados del Diagnóstico CIMA®.

DATOS DE LA EMPRESA:
- Nombre: ${empresa.nombre}
- Tamaño: ${empresa.tamano || 'No especificado'}
- Sector: ${empresa.sector || 'No especificado'}
- Número de empleados: ${empresa.empleados || 'No especificado'}

RESULTADO GENERAL: ${totalPct}% — Nivel ${nivel}

RESULTADOS POR DIMENSIÓN:
${resumenSecciones}

INSTRUCCIONES PARA EL INFORME:
Redacta un informe ejecutivo y gerencial con la siguiente estructura:

1. RESUMEN EJECUTIVO: Contexto de la empresa y objetivo del diagnóstico (2-3 párrafos)

2. PANORAMA GENERAL: Dimensiones con mejor desempeño y dimensiones con mayores oportunidades

3. HALLAZGOS POR DIMENSIÓN: Para cada una incluye:
   - Nombre y resultado porcentual
   - Principales fortalezas
   - Oportunidades de mejora
   - Impacto de no atender estas oportunidades

4. CONCLUSIONES Y RECOMENDACIONES ESTRATÉGICAS:
   - Fortalezas estratégicas
   - Áreas críticas de mejora
   - Impacto esperado

Redacta en tono profesional pero cercano, en español colombiano. No uses lenguaje genérico — conecta cada hallazgo con el impacto real en el negocio y en las personas. El informe debe fluir como si lo hubiera escrito un consultor experto, no como una lista de descripciones pegadas.

Formato: no uses tablas en formato markdown (nada de símbolos | para crear filas o columnas). Si necesitas comparar dimensiones o presentar datos en paralelo, hazlo en prosa fluida o con líneas de texto simples, una por dimensión.`;

  let informe;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(500).json({ error: 'Error al generar el informe' });
    }

    informe = data.content[0].text;
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }

  // ── 4. Guardar el diagnóstico (solo el servidor puede insertar/completar aquí) ──
  // Si el usuario venía con un borrador (guardado automático mientras contestaba),
  // ESE MISMO registro pasa a estado 'completado' — no se crea uno nuevo aparte.
  // Así el registro conserva su fecha de creación real (cuando empezó) y su fecha
  // de modificación (cuando terminó), en vez de duplicar filas.
  const get = (id) => {
    const s = scores.find((s, i) => i === id - 2); // s2..s10 → índice 0..8
    return s ? Math.round(s.avg * 100) : null;
  };

  const datosFinales = {
    user_id: user.id,
    user_email: user.email,
    empresa: empresa.nombre,
    sector: empresa.sector || null,
    tamano: empresa.tamano || null,
    empleados: empresa.empleados ? String(empresa.empleados) : null,
    score_total: totalPct,
    nivel: nivel,
    s2_estructura: get(2),
    s3_rotacion: get(3),
    s4_desarrollo: get(4),
    s5_compensacion: get(5),
    s6_cumplimiento: get(6),
    s7_cultura: get(7),
    s8_reclutamiento: get(8),
    s9_rse: get(9),
    s10_nuevas_formas: get(10),
    informe_texto: informe,
    estado: 'completado',
    respuestas_parciales: null,
    updated_at: new Date().toISOString()
  };

  let diagnosticoId = null;
  try {
    // ¿Ya tenía un borrador? Lo completamos en vez de crear una fila nueva.
    const borradorRes = await fetch(
      `${SUPABASE_URL}/rest/v1/diagnosticos?user_id=eq.${user.id}&estado=eq.borrador&select=id`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    );
    const borradores = await borradorRes.json();

    if (Array.isArray(borradores) && borradores.length > 0) {
      const idBorrador = borradores[0].id;
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/diagnosticos?id=eq.${idBorrador}`, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(datosFinales)
      });
      const updated = await updateRes.json();
      diagnosticoId = updated?.[0]?.id ?? idBorrador;
    } else {
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/diagnosticos`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(datosFinales)
      });
      const inserted = await insertRes.json();
      diagnosticoId = inserted?.[0]?.id ?? null;
    }

    // Puntero liviano en el índice de "Mi Espacio" — el detalle real vive en `diagnosticos`.
    if (diagnosticoId) {
      await fetch(`${SUPABASE_URL}/rest/v1/user_workspace`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: user.id,
          tool_slug: 'cima',
          record_type: 'diagnostico',
          record_id: String(diagnosticoId),
          title: `${empresa.nombre} — ${totalPct}% · ${nivel}`
        })
      });
    }
  } catch (e) {
    console.error('Error guardando diagnóstico:', e);
    // No bloqueamos la respuesta al usuario por esto: ya generó su informe,
    // igual se lo mostramos aunque el guardado interno haya fallado.
  }

  return res.status(200).json({
    informe,
    diagnosticos_restantes: acceso.remaining
  });
}

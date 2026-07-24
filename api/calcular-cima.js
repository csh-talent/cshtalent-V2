// ═══════════════════════════════════════════════════════════════
// CSH TALENT — Diagnóstico CIMA®: cálculo + informe (100% en el servidor)
//
// Este archivo concentra TODA la metodología propia del CIMA: los pesos
// de cada dimensión, el puntaje de cada respuesta, los umbrales que
// definen el nivel, y los textos de diagnóstico/recomendación.
//
// El navegador NUNCA recibe nada de esto — solo envía qué opción eligió
// la persona en cada pregunta (un índice, no un puntaje), y recibe de
// vuelta el resultado ya calculado. Así, alguien podría copiar el diseño
// de la página con solo mirarla, pero nunca la metodología en sí.
// ═══════════════════════════════════════════════════════════════

const SECCIONES = [
  {id:2,num:'01',titulo:'Estructura Organizacional y Perfiles',peso:.10,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.1}]},
    {tipo:'radio',opciones:[{score:.1},{score:.5},{score:1}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.1}]}
  ]},
  {id:3,num:'02',titulo:'Rotación y Retención',peso:.13,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.3}]},
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.5}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.4}]},
    {tipo:'escala',scores:{1:.2,2:.4,3:.6,4:.8,5:1}}
  ]},
  {id:4,num:'03',titulo:'Desarrollo y Gestión del Desempeño',peso:.13,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.3}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.3},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.9},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.1}]},
    {tipo:'radio',opciones:[{score:.9},{score:.4}]},
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.4}]}
  ]},
  {id:5,num:'04',titulo:'Compensación y Beneficios',peso:.18,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.8},{score:.1},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.4},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.3}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.5}]},
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.4}]},
    {tipo:'radio',opciones:[{score:1},{score:.5}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.3}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.1}]}
  ]},
  {id:6,num:'05',titulo:'Cumplimiento Legal Laboral',peso:.18,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.2},{score:0}]},
    {tipo:'radio',opciones:[{score:1},{score:.2},{score:0}]},
    {tipo:'radio',opciones:[{score:1},{score:0}]},
    {tipo:'radio',opciones:[{score:1},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:1},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.5}]},
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.5}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:1}]}
  ]},
  {id:7,num:'06',titulo:'Cultura y Liderazgo',peso:.15,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.2}]},
    {tipo:'escala',scores:{1:.2,2:.4,3:.6,4:.8,5:1}},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.2}]},
    {tipo:'escala',scores:{1:.2,2:.4,3:.6,4:.8,5:1}},
    {tipo:'radio',opciones:[{score:1},{score:.6},{score:.2}]}
  ]},
  {id:8,num:'07',titulo:'Reclutamiento y Selección',peso:.05,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.8},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.1}]},
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.3}]},
    {tipo:'radio',opciones:[{score:1},{score:.5},{score:.3}]}
  ]},
  {id:9,num:'08',titulo:'Responsabilidad Social, Diversidad e Innovación',peso:.04,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.8},{score:.4}]},
    {tipo:'radio',opciones:[{score:1},{score:.8},{score:.4}]},
    {tipo:'radio',opciones:[{score:1},{score:.8},{score:.4}]},
    {tipo:'radio',opciones:[{score:1},{score:.8},{score:.2}]}
  ]},
  {id:10,num:'09',titulo:'Nuevas Formas de Trabajo',peso:.04,preguntas:[
    {tipo:'radio',opciones:[{score:1},{score:.2},{score:1},{score:.2},{score:1},{score:.2}]},
    {tipo:'radio',opciones:[{score:1},{score:.3}]},
    {tipo:'radio',opciones:[{score:1},{score:.7},{score:.4}]}
  ]}
];

function getNivel(s){
  if(s<.5)return{label:'Por mejorar',cls:'nivel-bajo'};
  if(s<.8)return{label:'En desarrollo',cls:'nivel-medio'};
  return{label:'Sólido',cls:'nivel-alto'};
}

function getDiag(id,s){
  const t={
    2:s>=.7?'La empresa cuenta con estructura organizacional sólida, perfiles documentados y estrategia definida.':s>=.4?'Existen avances en la estructura, pero se requiere formalizar perfiles, competencias y estrategia corporativa.':'La empresa presenta brechas importantes en documentación de perfiles. Es una prioridad para crecer ordenadamente.',
    3:s>=.7?'Los procesos de retención y gestión de rotación son sólidos, con indicadores claros y planes de acción.':s>=.4?'Hay consciencia sobre la rotación, pero faltan procesos formales de retención y planes de sucesión.':'La rotación es un riesgo crítico. No existen mecanismos formales para retener talento ni identificar cargos clave.',
    4:s>=.7?'La gestión del desempeño está bien estructurada con evaluaciones formales y planes de desarrollo vinculados.':s>=.4?'Hay elementos de gestión del desempeño, pero el proceso no está completamente formalizado ni es consistente.':'La empresa carece de un sistema formal de evaluación del desempeño, lo que limita el crecimiento del equipo.',
    5:s>=.7?'La estructura de compensación es competitiva y equitativa, con bandas salariales y beneficios comunicados.':s>=.4?'Existe alguna estructura salarial, pero faltan políticas formales y vinculación entre compensación y desempeño.':'La compensación no tiene estructura formal, generando riesgo de inequidad y pérdida de talento clave.',
    6:s>=.7?'La empresa demuestra sólido cumplimiento legal laboral con contratos formales y reglamentos establecidos.':s>=.4?'Hay cumplimiento parcial de obligaciones laborales. Se requiere regularizar contratos y procesos disciplinarios.':'Existen riesgos legales significativos. Se deben tomar acciones inmediatas para regularizar el cumplimiento laboral.',
    7:s>=.7?'La cultura organizacional es sólida con líderes accesibles, buena comunicación y programas de bienestar activos.':s>=.4?'Hay elementos de cultura positiva, pero se requiere fortalecer comunicación interna, liderazgo y reconocimiento.':'La cultura y el liderazgo necesitan intervención urgente. Los colaboradores perciben distancia y falta de comunicación.',
    8:s>=.7?'El proceso de reclutamiento y selección es estructurado, con evaluaciones técnicas y seguimiento en prueba.':s>=.4?'Existen elementos en el proceso de selección, pero falta estandarización y medición de indicadores.':'El proceso de selección es informal, aumentando el riesgo de contratar personal no alineado con las necesidades.',
    9:s>=.7?'La empresa demuestra compromiso con responsabilidad social, diversidad e innovación de manera estructurada.':s>=.4?'Hay algunas prácticas de RSE y diversidad, pero no están formalizadas ni medidas de manera consistente.':'La empresa no tiene políticas formales de RSE, diversidad e innovación, lo que puede afectar su reputación.',
    10:s>=.7?'La empresa gestiona bien las nuevas formas de trabajo, con seguimiento estructurado y recursos adecuados.':s>=.4?'Las modalidades de trabajo existen pero se requiere mejorar el seguimiento y los recursos para equipos remotos.':'Las nuevas formas de trabajo generan insatisfacción. Se requieren políticas claras y recursos para los equipos.'
  };
  return t[id]||'';
}

function getRec(id){
  const r={
    2:'Documentar y centralizar perfiles de cargos. Definir competencias mediante un manual estructurado. Implementar revisiones periódicas y alinear con la estrategia corporativa.',
    3:'Implementar un programa integral de retención. Formalizar entrevistas de salida. Identificar cargos críticos y diseñar planes de sucesión. Vincular compensación al desempeño.',
    4:'Implementar evaluaciones formales de desempeño con retroalimentación estructurada. Crear planes de desarrollo vinculados a resultados. Capacitar líderes en feedback efectivo.',
    5:'Establecer bandas salariales y políticas claras de incrementos. Diseñar incentivos ligados al desempeño. Comunicar efectivamente los beneficios. Crear presupuesto anual de talento.',
    6:'Regularizar contratos y afiliaciones a seguridad social de manera urgente. Elaborar y comunicar reglamento interno. Definir procesos disciplinarios y de resolución de conflictos.',
    7:'Formalizar la cultura con valores vividos por todos. Medir clima laboral con planes de acción. Implementar programas de reconocimiento y bienestar. Desarrollar habilidades de liderazgo.',
    8:'Diseñar proceso formal de reclutamiento con descripciones actualizadas. Implementar evaluaciones técnicas y psicotécnicas. Formalizar el seguimiento en período de prueba.',
    9:'Documentar políticas de RSE. Integrar criterios de diversidad en todos los procesos. Crear canales formales para la innovación interna y medir su impacto.',
    10:'Definir políticas claras para cada modalidad. Proporcionar herramientas completas para teletrabajo. Implementar seguimiento estructurado al desempeño remoto.'
  };
  return r[id]||'';
}

// Calcula el promedio (0-1) de una sección a partir de los ÍNDICES que
// eligió la persona (nunca puntajes: esos solo existen aquí, en el servidor).
function calcularPromedioSeccion(seccion, respuestasSeccion) {
  const valores = seccion.preguntas.map((preg, qi) => {
    const elegido = respuestasSeccion ? respuestasSeccion[qi] : undefined;
    if (elegido === undefined || elegido === null) return null;
    if (preg.tipo === 'radio') {
      const opcion = preg.opciones[elegido];
      return opcion ? opcion.score : null;
    }
    if (preg.tipo === 'escala') {
      return preg.scores[elegido] !== undefined ? preg.scores[elegido] : null;
    }
    return null;
  }).filter(v => v !== null);
  if (!valores.length) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = 'https://eiauimhrybdamjpntdwh.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TOOL_SLUG = 'cima';

  // ── 1. Verificar quién está llamando ──
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión para generar el diagnóstico.' });
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

  // ── 2. Contar diagnósticos completados y consultar el acceso ──
  let yaGenerados = 0;
  try {
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/diagnosticos?user_id=eq.${user.id}&estado=eq.completado&select=id`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact' } }
    );
    const contentRange = countRes.headers.get('content-range');
    yaGenerados = contentRange ? parseInt(contentRange.split('/')[1], 10) || 0 : 0;
  } catch (e) {
    return res.status(500).json({ error: 'No pudimos verificar tu historial de diagnósticos.' });
  }

  let acceso;
  try {
    const accesoRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_tool_access`, {
      method: 'POST',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: user.id, p_tool_slug: TOOL_SLUG, p_current_uses: yaGenerados })
    });
    acceso = await accesoRes.json();
  } catch (e) {
    return res.status(500).json({ error: 'No pudimos verificar tu acceso a esta herramienta.' });
  }

  // ── 3. Calcular el resultado real (esto YA NO lo hace el navegador) ──
  // Se calcula SIEMPRE, incluso si el límite ya se alcanzó — el radar y el
  // puntaje se muestran de todas formas; solo el informe con IA se bloquea.
  const { empresa, answers } = req.body;
  if (!empresa || !answers) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const scoresCalculados = SECCIONES.map(sec => {
    const avg = calcularPromedioSeccion(sec, answers[sec.id]);
    return { ...sec, avg, ponderado: avg * sec.peso };
  });
  const total = scoresCalculados.reduce((a, s) => a + s.ponderado, 0);
  const totalPct = Math.round(total * 100);
  const nivelGeneral = getNivel(total);

  const scoresParaRespuesta = scoresCalculados.map(s => {
    const p = Math.round(s.avg * 100);
    const n = getNivel(s.avg);
    return { id: s.id, num: s.num, titulo: s.titulo, pct: p, nivel: n, diag: getDiag(s.id, s.avg) };
  });

  const criticas = scoresCalculados
    .filter(s => s.avg < .5)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 3)
    .map(s => ({ titulo: s.titulo, texto: getRec(s.id) }));

  // Si ya no tiene cupo: se devuelve el radar/puntaje igual, pero SIN generar
  // el informe con IA ni consumir nada — nada se guarda en este caso.
  if (!acceso.allowed) {
    return res.status(200).json({
      scores: scoresParaRespuesta,
      totalPct,
      nivelGeneral,
      recomendaciones: criticas,
      limite_alcanzado: true,
      error: 'Ya generaste tus diagnósticos gratuitos con esta cuenta.'
    });
  }

  // ── 4. Generar el informe ejecutivo con IA (mismo prompt de siempre) ──
  const pesosTexto = {
    'Estructura Organizacional y Perfiles': '10%', 'Rotación y Retención': '13%',
    'Desarrollo y Gestión del Desempeño': '13%', 'Compensación y Beneficios': '18%',
    'Cumplimiento Legal Laboral': '18%', 'Cultura y Liderazgo': '15%',
    'Reclutamiento y Selección': '5%', 'Responsabilidad Social, Diversidad e Innovación': '4%',
    'Nuevas Formas de Trabajo': '4%'
  };
  const resumenSecciones = scoresParaRespuesta.map(s =>
    `- ${s.titulo} (Peso: ${pesosTexto[s.titulo] || '—'}): ${s.pct}% — Nivel ${s.nivel.label}\n  Descripción del diagnóstico: ${s.diag}`
  ).join('\n\n');

  const prompt = `Eres un consultor experto en Gestión Humana con amplia experiencia en diagnósticos organizacionales para empresas colombianas. Tu tarea es redactar un informe ejecutivo profesional, claro y estratégico basado en los resultados del Diagnóstico CIMA®.

DATOS DE LA EMPRESA:
- Nombre: ${empresa.nombre}
- Tamaño: ${empresa.tamano || 'No especificado'}
- Sector: ${empresa.sector || 'No especificado'}
- Número de empleados: ${empresa.empleados || 'No especificado'}

RESULTADO GENERAL: ${totalPct}% — Nivel ${nivelGeneral.label}

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

  // ── 5. Guardar (completar el borrador existente, o crear si no había) ──
  const get = (id) => {
    const s = scoresParaRespuesta.find(x => x.id === id);
    return s ? s.pct : null;
  };

  const datosFinales = {
    user_id: user.id, user_email: user.email, empresa: empresa.nombre,
    sector: empresa.sector || null, tamano: empresa.tamano || null,
    empleados: empresa.empleados ? String(empresa.empleados) : null,
    score_total: totalPct, nivel: nivelGeneral.label,
    s2_estructura: get(2), s3_rotacion: get(3), s4_desarrollo: get(4),
    s5_compensacion: get(5), s6_cumplimiento: get(6), s7_cultura: get(7),
    s8_reclutamiento: get(8), s9_rse: get(9), s10_nuevas_formas: get(10),
    informe_texto: informe, estado: 'completado', respuestas_parciales: null,
    updated_at: new Date().toISOString()
  };

  let diagnosticoId = null;
  try {
    const borradorRes = await fetch(
      `${SUPABASE_URL}/rest/v1/diagnosticos?user_id=eq.${user.id}&estado=eq.borrador&select=id`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    );
    const borradores = await borradorRes.json();

    if (Array.isArray(borradores) && borradores.length > 0) {
      const idBorrador = borradores[0].id;
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/diagnosticos?id=eq.${idBorrador}`, {
        method: 'PATCH',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify(datosFinales)
      });
      const updated = await updateRes.json();
      diagnosticoId = updated?.[0]?.id ?? idBorrador;
    } else {
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/diagnosticos`, {
        method: 'POST',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify(datosFinales)
      });
      const inserted = await insertRes.json();
      diagnosticoId = inserted?.[0]?.id ?? null;
    }

    if (diagnosticoId) {
      await fetch(`${SUPABASE_URL}/rest/v1/user_workspace`, {
        method: 'POST',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          user_id: user.id, tool_slug: 'cima', record_type: 'diagnostico',
          record_id: String(diagnosticoId), title: `${empresa.nombre} — ${totalPct}% · ${nivelGeneral.label}`
        })
      });
    }
  } catch (e) {
    console.error('Error guardando diagnóstico:', e);
  }

  // ── 6. Responder — el navegador recibe SOLO resultados, nunca la metodología ──
  return res.status(200).json({
    scores: scoresParaRespuesta,
    totalPct,
    nivelGeneral,
    recomendaciones: criticas,
    informe,
    diagnosticos_restantes: acceso.remaining
  });
}

// api/calcular-tiempo-suplementario.js
//
// Toda la metodología de cálculo del Simulador de Tiempo Suplementario vive
// AQUÍ y solo aquí: el divisor de jornada, la tabla de factores de horas
// extra y recargos, y las reglas de combinación (ej. extra + dominical).
// El navegador nunca recibe esta tabla — solo envía horas/minutos y salario,
// y recibe de vuelta los valores en pesos ya calculados.
//
// Nota: este archivo NO usa la librería @supabase/supabase-js (para no
// depender de un paquete npm adicional) — verifica la sesión llamando
// directamente al endpoint REST de autenticación de Supabase con fetch.
//
// Requiere las mismas variables de entorno que el resto de /api:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (o el ANON key, si es el que ya usas)

// ══ Jornada legal (Ley 2101 de 2021 — 42h/semana → divisor mensual 210, vigente desde el 15 jul. 2026) ══
const JORNADA = 210;

// ══ Tabla de factores — NUNCA se envía al navegador, solo se usa para calcular aquí ══
// pct = múltiplo total que se paga sobre el valor hora.
const CONCEPTOS = {
  e1: { tipo: 'extra',    pct: 1.25 }, // Hora Extra Diurna Ordinaria
  e2: { tipo: 'extra',    pct: 1.75 }, // Hora Extra Nocturna
  e3: { tipo: 'extra',    pct: 2.15 }, // Hora Extra Diurna Dominical
  e4: { tipo: 'extra',    pct: 2.15 }, // Hora Extra Diurna Festiva
  e6: { tipo: 'extra',    pct: 2.65 }, // Hora Extra Nocturna Dominical/Festiva
  r1: { tipo: 'recargo',  pct: 1.90 }, // Recargo Diurno Dominical Habitual
  r2: { tipo: 'recargo',  pct: 0.90 }, // Recargo Diurno Dominical/Festivo Ocasional
  r3: { tipo: 'recargo',  pct: 0.35 }, // Recargo Nocturno
  r4: { tipo: 'recargo',  pct: 1.25 }, // Recargo Nocturno Dominical/Festivo
};

function validarHoraMinuto(valor, max){
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > max) return 0;
  return Math.floor(n);
}

// ══ Verifica el token de sesión llamando directo a la API de Supabase (sin librería) ══
async function verificarUsuario(token){
  if (!token) return null;
  try{
    const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) return null;
    return await resp.json(); // { id, email, ... }
  }catch(e){
    console.error('Error verificando usuario:', e);
    return null;
  }
}

module.exports = async function handler(req, res){
  if (req.method !== 'POST'){
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  // ══ Autenticación: exige la misma sesión de Supabase que usa el resto del sitio ══
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const user = await verificarUsuario(token);
  if (!user){
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return;
  }

  // ══ Validación de entrada ══
  const body = req.body || {};
  const salario = Number(body.salario);
  if (!Number.isFinite(salario) || salario <= 0 || salario > 500000000){
    res.status(400).json({ error: 'Salario inválido' });
    return;
  }

  const horasEntrada = body.horas && typeof body.horas === 'object' ? body.horas : {};

  // ══ Cálculo (esto es lo que nunca debe llegar al navegador como lógica) ══
  const valorHora = salario / JORNADA;
  const resultados = {};
  let totalExtras = 0;
  let totalRecargos = 0;

  for (const id of Object.keys(CONCEPTOS)){
    const entrada = horasEntrada[id] || {};
    const horas = validarHoraMinuto(entrada.horas, 300);
    const minutos = validarHoraMinuto(entrada.minutos, 59);
    const dec = horas + (minutos / 60);
    const concepto = CONCEPTOS[id];
    const valor = dec * valorHora * concepto.pct;

    if (concepto.tipo === 'extra') totalExtras += valor; else totalRecargos += valor;

    resultados[id] = {
      horas,
      minutos,
      valor: Math.round(valor)
    };
  }

  res.status(200).json({
    valorHora: Math.round(valorHora),
    resultados,
    totalExtras: Math.round(totalExtras),
    totalRecargos: Math.round(totalRecargos),
    totalGeneral: Math.round(totalExtras + totalRecargos)
  });
};

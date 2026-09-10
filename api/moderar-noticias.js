// api/moderar-noticias.js
// Usado por admin-noticias.html. Requiere sesión de un usuario que exista
// en la tabla `admins`. GET lista las pendientes; POST aprueba o descarta.

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

async function getUsuarioAdmin(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;

  const adminRes = await fetch(`${SUPABASE_URL}/rest/v1/admins?select=user_id&user_id=eq.${user.id}`, {
    headers: sbHeaders(),
  });
  if (!adminRes.ok) return null;
  const filas = await adminRes.json();
  return filas.length > 0 ? user : null;
}

export default async function handler(req, res) {
  const admin = await getUsuarioAdmin(req);
  if (!admin) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  if (req.method === 'GET') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/actualidad_laboral?select=id,titular,medio,fecha,url,estado,created_at&estado=eq.pendiente&order=created_at.desc`,
      { headers: sbHeaders() }
    );
    if (!r.ok) {
      return res.status(500).json({ ok: false, error: 'Error al consultar pendientes' });
    }
    const pendientes = await r.json();
    return res.status(200).json({ ok: true, pendientes });
  }

  if (req.method === 'POST') {
    const { id, accion } = req.body || {};
    if (!id || !['aprobar', 'descartar'].includes(accion)) {
      return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
    }

    const update =
      accion === 'aprobar' ? { estado: 'aprobada', activo: true } : { estado: 'descartada', activo: false };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/actualidad_laboral?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(update),
    });
    if (!r.ok) {
      return res.status(500).json({ ok: false, error: 'Error al actualizar' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Método no permitido' });
}

// api/moderar-noticias.js
// Usado por admin-noticias.html. Requiere sesión de un usuario que exista
// en la tabla `admins`. GET lista las pendientes; POST aprueba o descarta.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eiauimhrybdamjpntdwh.supabase.co';

const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getUsuarioAdmin(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: fila } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return fila ? user : null;
}

export default async function handler(req, res) {
  const admin = await getUsuarioAdmin(req);
  if (!admin) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('actualidad_laboral')
      .select('id, titular, medio, fecha, url, estado, created_at')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ ok: false, error: 'Error al consultar pendientes' });
    }
    return res.status(200).json({ ok: true, pendientes: data });
  }

  if (req.method === 'POST') {
    const { id, accion } = req.body || {};
    if (!id || !['aprobar', 'descartar'].includes(accion)) {
      return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
    }

    const update =
      accion === 'aprobar' ? { estado: 'aprobada', activo: true } : { estado: 'descartada', activo: false };

    const { error } = await supabaseAdmin.from('actualidad_laboral').update(update).eq('id', id);
    if (error) {
      return res.status(500).json({ ok: false, error: 'Error al actualizar' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Método no permitido' });
}

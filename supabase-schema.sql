-- ═══════════════════════════════════════════════════════════════
-- CSH TALENT — Esquema de autenticación, espacio personal y monetización
-- Ejecutar en el SQL Editor de tu proyecto de Supabase.
-- Diseñado para no requerir cambios estructurales cuando se agreguen
-- nuevas herramientas, planes, códigos o el panel de administración.
-- ═══════════════════════════════════════════════════════════════

-- ─── PROFILES: ficha básica de la cuenta única ───
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "select own profile" on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Crea automáticamente la fila de profile cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();


-- ─── ADMINS: tabla separada, no un campo en profiles ───
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id)
);

alter table public.admins enable row level security;
create policy "admins can see admin list" on public.admins
  for select using (exists (select 1 from public.admins a where a.user_id = auth.uid()));


-- ─── TOOLS: catálogo central de herramientas del ecosistema ───
create table public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  door text not null check (door in ('empresas','profesionales','trabajadores','general')),
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tools enable row level security;
create policy "anyone can read tools" on public.tools for select using (true);


-- ─── ACCESS_CODES: códigos de regalo / promocionales ───
create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text,
  type text not null check (type in ('tool','membership')),
  tool_id uuid references public.tools(id),
  duration_days int not null,
  max_uses int,                          -- límite global; null = sin límite
  max_uses_per_user int not null default 1, -- configurable por código; null = sin límite por usuario
  expires_at timestamptz,
  active boolean not null default true,
  campaign_tag text,                     -- para campañas, embajadores, aliados
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.access_codes enable row level security;
create policy "admins manage codes" on public.access_codes
  for all using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
-- Sin política de select para usuarios normales: los códigos no deben ser legibles desde el cliente.


-- ─── CODE_REDEMPTIONS: registro de cada canje ───
create table public.code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.access_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

alter table public.code_redemptions enable row level security;
create policy "select own redemptions" on public.code_redemptions
  for select using (auth.uid() = user_id);
-- Los inserts ocurren únicamente a través de la función redeem_code() de abajo.


-- ─── ENTITLEMENTS: qué tiene activo cada usuario (compras, membresía, cortesías, códigos, accesos manuales) ───
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('tool','membership')),
  tool_id uuid references public.tools(id),          -- null si type = 'membership' (desbloquea todo)
  source text not null check (source in (
    'individual_purchase', 'membership_purchase',
    'redemption_code', 'manual_grant', 'courtesy', 'beta'
  )),
  code_id uuid references public.access_codes(id),   -- solo si source = 'redemption_code'
  granted_by uuid references auth.users(id),         -- solo si source = 'manual_grant'
  starts_at timestamptz not null default now(),
  expires_at timestamptz,                            -- null = no expira (ej. accesos beta indefinidos)
  created_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;
create policy "select own entitlements" on public.entitlements
  for select using (auth.uid() = user_id);
create policy "admins manage entitlements" on public.entitlements
  for all using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
-- Las compras (Stripe u otro) y los accesos manuales insertarán aquí vía backend/service role.
-- El canje de códigos inserta aquí a través de redeem_code(), nunca por escritura directa del cliente.


-- ─── Función para redimir un código (transaccional, valida todos los límites) ───
create or replace function public.redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code record;
  v_global_uses int;
  v_user_uses int;
  v_entitlement_id uuid;
begin
  select * into v_code from public.access_codes where code = p_code and active = true;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Código inválido o inactivo');
  end if;

  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'Este código ya expiró');
  end if;

  if v_code.max_uses is not null then
    select count(*) into v_global_uses from public.code_redemptions where code_id = v_code.id;
    if v_global_uses >= v_code.max_uses then
      return jsonb_build_object('success', false, 'error', 'Este código ya alcanzó su número máximo de usos');
    end if;
  end if;

  if v_code.max_uses_per_user is not null then
    select count(*) into v_user_uses from public.code_redemptions
      where code_id = v_code.id and user_id = auth.uid();
    if v_user_uses >= v_code.max_uses_per_user then
      return jsonb_build_object('success', false, 'error', 'Ya has usado este código antes');
    end if;
  end if;

  insert into public.code_redemptions (code_id, user_id) values (v_code.id, auth.uid());

  insert into public.entitlements (user_id, type, tool_id, source, code_id, expires_at)
  values (
    auth.uid(), v_code.type, v_code.tool_id, 'redemption_code', v_code.id,
    now() + (v_code.duration_days || ' days')::interval
  )
  returning id into v_entitlement_id;

  return jsonb_build_object('success', true, 'entitlement_id', v_entitlement_id);
end;
$$;


-- ─── USER_WORKSPACE: espacio personal — todo lo que el usuario genera, de forma permanente ───
create table public.user_workspace (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_slug text,          -- referencia informativa a tools.slug
  record_type text not null, -- 'simulation' | 'liquidation' | 'budget' | 'document' | 'ai_conversation' | 'tool_usage'
  title text,              -- ej. "Liquidación contrato Juan Pérez"
  payload jsonb,           -- el contenido/datos generados
  created_at timestamptz not null default now()
);

alter table public.user_workspace enable row level security;
create policy "select own workspace" on public.user_workspace
  for select using (auth.uid() = user_id);
create policy "insert own workspace" on public.user_workspace
  for insert with check (auth.uid() = user_id);
create policy "delete own workspace" on public.user_workspace
  for delete using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- Verificar acceso premium a una herramienta (para usar desde el front):
--
-- select exists (
--   select 1 from public.entitlements
--   where user_id = auth.uid()
--     and expires_at > now()
--     and (type = 'membership' or tool_id = '<id-de-la-herramienta>')
-- );
-- ═══════════════════════════════════════════════════════════════

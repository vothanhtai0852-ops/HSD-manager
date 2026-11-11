-- KINGKONG MART | SCAN BARCODE
-- Các bảng mới, độc lập với PRODUCTS và PRODUCT_CATALOG.
-- Chạy một lần trong Supabase SQL Editor trước khi deploy code.

create table if not exists public.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete restrict,
  username_snapshot text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint scan_sessions_status_check check (status in ('ACTIVE', 'COMPLETED')),
  constraint scan_sessions_username_check check (length(btrim(username_snapshot)) > 0),
  constraint scan_sessions_completed_check check (
    (status = 'ACTIVE' and completed_at is null) or
    (status = 'COMPLETED' and completed_at is not null)
  )
);

create index if not exists idx_scan_sessions_user_created
  on public.scan_sessions(user_id, created_at desc);
create index if not exists idx_scan_sessions_status_created
  on public.scan_sessions(status, created_at desc);

create table if not exists public.scan_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on update cascade on delete cascade,
  product_code text not null,
  product_name text not null,
  quantity integer not null default 1,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scan_items_quantity_check check (quantity between 1 and 1000000),
  constraint scan_items_code_check check (length(btrim(product_code)) > 0),
  constraint scan_items_name_check check (length(btrim(product_name)) > 0),
  constraint scan_items_session_code_unique unique (session_id, product_code)
);

create index if not exists idx_scan_items_session_created
  on public.scan_items(session_id, created_at asc);

alter table public.scan_sessions enable row level security;
alter table public.scan_items enable row level security;
revoke all on table public.scan_sessions from anon, authenticated;
revoke all on table public.scan_items from anon, authenticated;
grant select, insert, update, delete on table public.scan_sessions to service_role;
grant select, insert, update, delete on table public.scan_items to service_role;

create or replace function public.scan_increment_item(
  p_session_id uuid,
  p_actor_user_id uuid,
  p_product_code text
)
returns table (
  id uuid,
  product_code text,
  product_name text,
  quantity integer,
  note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.scan_sessions%rowtype;
  v_product public.product_catalog%rowtype;
  v_item public.scan_items%rowtype;
begin
  if p_session_id is null or p_actor_user_id is null or
     p_product_code is null or length(btrim(p_product_code)) = 0 then
    raise exception 'INVALID_SCAN_ARGUMENT';
  end if;

  -- Lock session to serialize scans for this session and prevent writes after completion.
  select s.* into v_session
    from public.scan_sessions s
   where s.id = p_session_id and s.user_id = p_actor_user_id
   for update;
  if not found or v_session.status <> 'ACTIVE' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  if not exists (
    select 1 from public.users u
     where u.id = p_actor_user_id and u.active = true
  ) then
    raise exception 'ACTOR_NOT_ACTIVE';
  end if;

  -- Exact TEXT equality only. Do not lowercase, cast to number, or use LIKE.
  select pc.* into v_product
    from public.product_catalog pc
   where pc.product_code = btrim(p_product_code)
     and pc.active = true
   order by pc.id
   limit 1;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  insert into public.scan_items as existing_item(session_id, product_code, product_name, quantity)
  values (p_session_id, v_product.product_code, v_product.product_name, 1)
  on conflict (session_id, product_code)
  do update set
    quantity = existing_item.quantity + 1,
    product_name = excluded.product_name,
    updated_at = now()
  returning * into v_item;

  return query select v_item.id, v_item.product_code, v_item.product_name,
    v_item.quantity, v_item.note, v_item.created_at, v_item.updated_at;
end;
$$;

revoke all on function public.scan_increment_item(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.scan_increment_item(uuid, uuid, text) to service_role;

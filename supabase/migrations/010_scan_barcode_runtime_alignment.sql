-- Align the original Scan Barcode database schema with the current Next.js API.
-- Run once in Supabase SQL Editor after migration 009 and before deploying this source.

alter table public.scan_sessions
  add column if not exists username text;

update public.scan_sessions
   set username = coalesce(nullif(btrim(username), ''), username_snapshot)
 where username is null or length(btrim(username)) = 0;

alter table public.scan_sessions
  alter column username set not null;

-- The application uses DRAFT / COMPLETED. The first version of migration 009
-- used ACTIVE / COMPLETED, which prevents new sessions from being created.
alter table public.scan_sessions
  drop constraint if exists scan_sessions_status_check;
alter table public.scan_sessions
  drop constraint if exists scan_sessions_completed_check;

update public.scan_sessions
   set status = 'DRAFT'
 where status = 'ACTIVE';

alter table public.scan_sessions
  alter column status set default 'DRAFT';

alter table public.scan_sessions
  add constraint scan_sessions_status_check
  check (status in ('DRAFT', 'COMPLETED'));

alter table public.scan_sessions
  add constraint scan_sessions_completed_check
  check (
    (status = 'DRAFT' and completed_at is null) or
    (status = 'COMPLETED' and completed_at is not null)
  );

-- The current API and export endpoint both read/write location_note.
alter table public.scan_items
  add column if not exists location_note text not null default '';

update public.scan_items
   set location_note = ''
 where location_note is null;

-- Replace the old three-argument RPC with the four-argument version used by
-- app/api/scan/[sessionId]/items/route.ts.
drop function if exists public.scan_increment_item(uuid, uuid, text);
drop function if exists public.scan_increment_item(uuid, uuid, text, text);

create function public.scan_increment_item(
  p_session_id uuid,
  p_actor_user_id uuid,
  p_product_code text,
  p_location_note text
)
returns table (
  id uuid,
  product_code text,
  product_name text,
  quantity integer,
  note text,
  location_note text,
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
  v_location_note text := coalesce(btrim(p_location_note), '');
begin
  if p_session_id is null or p_actor_user_id is null or
     p_product_code is null or length(btrim(p_product_code)) = 0 then
    raise exception 'INVALID_SCAN_ARGUMENT';
  end if;

  if length(v_location_note) > 500 then
    raise exception 'LOCATION_NOTE_TOO_LONG';
  end if;

  -- Lock the session so concurrent scans remain serialized and cannot write
  -- after the user completes the session.
  select s.* into v_session
    from public.scan_sessions s
   where s.id = p_session_id and s.user_id = p_actor_user_id
   for update;

  if not found or v_session.status <> 'DRAFT' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  if not exists (
    select 1 from public.users u
     where u.id = p_actor_user_id and u.active = true
  ) then
    raise exception 'ACTOR_NOT_ACTIVE';
  end if;

  select pc.* into v_product
    from public.product_catalog pc
   where pc.product_code = btrim(p_product_code)
     and pc.active = true
   order by pc.id
   limit 1;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  insert into public.scan_items as existing_item (
    session_id, product_code, product_name, quantity, location_note
  )
  values (
    p_session_id, v_product.product_code, v_product.product_name, 1, v_location_note
  )
  on conflict (session_id, product_code)
  do update set
    quantity = existing_item.quantity + 1,
    product_name = excluded.product_name,
    location_note = excluded.location_note,
    updated_at = now()
  returning * into v_item;

  return query
    select v_item.id, v_item.product_code, v_item.product_name,
           v_item.quantity, v_item.note, v_item.location_note,
           v_item.created_at, v_item.updated_at;
end;
$$;

revoke all on function public.scan_increment_item(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.scan_increment_item(uuid, uuid, text, text)
  to service_role;

-- =========================================================
-- HSD Manager
-- Migration: Alert claim / idempotency system
-- =========================================================


-- ---------------------------------------------------------
-- 1. Thêm cột claim vào PRODUCTS
-- ---------------------------------------------------------

alter table public.products
  add column if not exists alert_claim_token uuid null;

alter table public.products
  add column if not exists alert_claimed_at timestamptz null;


-- ---------------------------------------------------------
-- 2. Index phục vụ claim
-- ---------------------------------------------------------

create index if not exists idx_products_alert_claim_token
  on public.products (alert_claim_token);

create index if not exists idx_products_alert_claimed_at
  on public.products (alert_claimed_at);


-- ---------------------------------------------------------
-- 3. CLAIM ALERT PRODUCTS
-- ---------------------------------------------------------

create or replace function public.claim_alert_products(
  p_product_ids uuid[],
  p_claim_token uuid,
  p_stale_after_minutes integer default 15
)
returns table (
  product_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_claim_token is null then
    raise exception 'claim token is required';
  end if;

  if p_stale_after_minutes < 1 then
    raise exception 'stale_after_minutes must be >= 1';
  end if;

  return query
  update public.products p
  set
    alert_claim_token = p_claim_token,
    alert_claimed_at = now()
  where
    p.id = any(p_product_ids)
    and p.alert_sent = false
    and (
      p.alert_claim_token is null
      or p.alert_claimed_at is null
      or p.alert_claimed_at <
        now() - make_interval(
          mins => p_stale_after_minutes
        )
    )
  returning p.id;
end;
$$;


-- ---------------------------------------------------------
-- 4. RELEASE ALERT CLAIM
-- ---------------------------------------------------------

create or replace function public.release_alert_claim(
  p_claim_token uuid,
  p_product_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released integer;
begin
  if p_claim_token is null then
    raise exception 'claim token is required';
  end if;

  update public.products p
  set
    alert_claim_token = null,
    alert_claimed_at = null
  where
    p.alert_claim_token = p_claim_token
    and (
      p_product_ids is null
      or p.id = any(p_product_ids)
    );

  get diagnostics
    v_released = row_count;

  return v_released;
end;
$$;


-- ---------------------------------------------------------
-- 5. COMPLETE ALERT CLAIM
-- ---------------------------------------------------------

create or replace function public.complete_alert_claim(
  p_claim_token uuid,
  p_product_ids uuid[]
)
returns table (
  product_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_claim_token is null then
    raise exception 'claim token is required';
  end if;

  if p_product_ids is null
     or cardinality(p_product_ids) = 0 then
    return;
  end if;

  return query
  update public.products p
  set
    alert_sent = true,
    last_alert_at = now(),
    alert_claim_token = null,
    alert_claimed_at = null
  where
    p.id = any(p_product_ids)
    and p.alert_claim_token = p_claim_token
    and p.alert_sent = false
  returning p.id;
end;
$$;


-- ---------------------------------------------------------
-- 6. KHÓA QUYỀN RPC
-- ---------------------------------------------------------
--
-- Đây là SECURITY DEFINER function.
-- Không được cho browser/user thường gọi trực tiếp.
-- Chỉ backend service_role được phép execute.
-- ---------------------------------------------------------

revoke execute
on function public.claim_alert_products(
  uuid[],
  uuid,
  integer
)
from public, anon, authenticated;


revoke execute
on function public.complete_alert_claim(
  uuid,
  uuid[]
)
from public, anon, authenticated;


revoke execute
on function public.release_alert_claim(
  uuid,
  uuid[]
)
from public, anon, authenticated;


-- ---------------------------------------------------------
-- 7. CHỈ SERVICE ROLE ĐƯỢC EXECUTE
-- ---------------------------------------------------------

grant execute
on function public.claim_alert_products(
  uuid[],
  uuid,
  integer
)
to service_role;


grant execute
on function public.complete_alert_claim(
  uuid,
  uuid[]
)
to service_role;


grant execute
on function public.release_alert_claim(
  uuid,
  uuid[]
)
to service_role;
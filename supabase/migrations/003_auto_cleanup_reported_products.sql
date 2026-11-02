-- HSD MANAGER
-- 003_auto_cleanup_reported_products.sql
--
-- Mục tiêu:
-- 1. Nếu NSX / HSD / Ngày báo lại thay đổi sau khi đã báo:
--      - alert_sent = false
--      - last_alert_at = null
--      - xóa claim cảnh báo còn sót
--    => sản phẩm KHÔNG bị auto-delete theo mốc cảnh báo cũ.
--
-- 2. Sản phẩm chỉ được auto-delete khi:
--      - alert_sent = true  (trạng thái ĐÃ BÁO)
--      - last_alert_at không null
--      - đã qua ít nhất 7 ngày kể từ last_alert_at
--      - không đang bị claim bởi tiến trình cảnh báo
--
-- 3. Trước khi xóa, ghi 1 dòng HISTORY_LOG để còn dấu vết audit.

-- =========================================================
-- INDEX HỖ TRỢ CLEANUP
-- =========================================================

create index if not exists idx_products_auto_cleanup
  on public.products(last_alert_at)
  where alert_sent = true;

-- =========================================================
-- RESET ALERT KHI 3 TRƯỜNG QUAN TRỌNG THAY ĐỔI
-- =========================================================

create or replace function public.reset_product_alert_on_key_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    old.manufacture_date is distinct from new.manufacture_date
    or old.expiry_date is distinct from new.expiry_date
    or old.reminder_date is distinct from new.reminder_date
  then
    new.alert_sent := false;
    new.last_alert_at := null;

    -- 002_alert_claim_system.sql đã thêm 2 cột này.
    new.alert_claim_token := null;
    new.alert_claimed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reset_product_alert_on_key_date_change
  on public.products;

create trigger trg_reset_product_alert_on_key_date_change
before update of manufacture_date, expiry_date, reminder_date
on public.products
for each row
execute function public.reset_product_alert_on_key_date_change();

-- =========================================================
-- AUTO CLEANUP SẢN PHẨM ĐÃ BÁO
-- =========================================================

create or replace function public.cleanup_reported_products(
  p_after_days integer default 7
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  deleted_rows integer := 0;
  one_deleted integer := 0;
  safe_after_days integer := greatest(coalesce(p_after_days, 7), 1);
begin
  for candidate in
    select
      p.id,
      p.user_id,
      p.product_code,
      p.product_name,
      p.manufacture_date,
      p.expiry_date,
      p.reminder_date,
      p.last_alert_at
    from public.products p
    where p.alert_sent = true
      and p.last_alert_at is not null
      and p.last_alert_at <=
        now() - make_interval(days => safe_after_days)
      and p.alert_claim_token is null
    order by p.last_alert_at asc
    for update skip locked
  loop
    -- Giữ lại dấu vết sau khi product bị xóa.
    insert into public.history_logs (
      actor_user_id,
      actor_email,
      action,
      product_id,
      product_code,
      product_name,
      changes
    )
    values (
      null,
      null,
      'TỰ ĐỘNG XÓA',
      candidate.id,
      candidate.product_code,
      candidate.product_name,
      jsonb_build_object(
        'reason',
        'Đã báo quá thời gian lưu và không thay đổi NSX/HSD/Ngày báo lại',
        'after_days',
        safe_after_days,
        'last_alert_at',
        candidate.last_alert_at,
        'manufacture_date',
        candidate.manufacture_date,
        'expiry_date',
        candidate.expiry_date,
        'reminder_date',
        candidate.reminder_date
      )
    );

    -- Kiểm tra lại điều kiện ngay tại thời điểm DELETE.
    delete from public.products p
    where p.id = candidate.id
      and p.alert_sent = true
      and p.last_alert_at = candidate.last_alert_at
      and p.last_alert_at <=
        now() - make_interval(days => safe_after_days)
      and p.alert_claim_token is null;

    get diagnostics one_deleted = row_count;

    if one_deleted = 0 then
      -- Nếu không xóa được do điều kiện thay đổi,
      -- xóa history vừa ghi để tránh log sai.
      delete from public.history_logs h
      where h.product_id = candidate.id
        and h.action = 'TỰ ĐỘNG XÓA'
        and h.created_at >= now() - interval '1 minute';
    else
      deleted_rows := deleted_rows + one_deleted;
    end if;
  end loop;

  return deleted_rows;
end;
$$;

-- =========================================================
-- QUYỀN
-- Chỉ backend service_role được phép gọi hàm cleanup.
-- =========================================================

revoke all on function public.cleanup_reported_products(integer)
  from public;

revoke all on function public.cleanup_reported_products(integer)
  from anon;

revoke all on function public.cleanup_reported_products(integer)
  from authenticated;

grant execute on function public.cleanup_reported_products(integer)
  to service_role;

comment on function public.cleanup_reported_products(integer) is
'Auto-delete products that have alert_sent=true for at least N days without a key-date reset.';

comment on function public.reset_product_alert_on_key_date_change() is
'Automatically resets alert state when manufacture_date, expiry_date, or reminder_date changes.';

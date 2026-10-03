-- HSD MANAGER
-- supabase/migrations/005_catalog_import_function.sql
--
-- RECOVERY VERSION
-- 004 đã được ghi nhận là applied nhưng catalog_import_jobs không tồn tại.
-- File 005 này tự rebuild toàn bộ hạ tầng import rồi mới tạo function.
--
-- AN TOÀN:
-- Chỉ drop/recreate:
--   public.catalog_import_staging
--   public.catalog_import_jobs
--   public.commit_catalog_import(uuid, uuid)
--
-- KHÔNG drop:
--   public.users
--   public.products
--   public.product_catalog
--   public.history_logs

drop function if exists public.commit_catalog_import(uuid, uuid);

drop table if exists public.catalog_import_staging cascade;
drop table if exists public.catalog_import_jobs cascade;

create table public.catalog_import_jobs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null
    references public.users(id)
    on update cascade
    on delete restrict,
  file_name text not null,
  total_rows integer not null,
  status text not null default 'UPLOADING',
  result jsonb null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint catalog_import_jobs_file_name_not_blank
    check (length(btrim(file_name)) > 0),
  constraint catalog_import_jobs_total_rows_valid
    check (total_rows between 1 and 300000),
  constraint catalog_import_jobs_status_valid
    check (status in ('UPLOADING','PROCESSING','COMPLETED','FAILED'))
);

create index idx_catalog_import_jobs_actor
  on public.catalog_import_jobs(actor_user_id);

create index idx_catalog_import_jobs_created_at
  on public.catalog_import_jobs(created_at desc);

create index idx_catalog_import_jobs_status
  on public.catalog_import_jobs(status);

create table public.catalog_import_staging (
  import_id uuid not null
    references public.catalog_import_jobs(id)
    on update cascade
    on delete cascade,
  row_number integer not null,
  product_code text not null,
  product_name text not null,
  sale_price numeric(14,2) null,
  created_at timestamptz not null default now(),
  primary key (import_id, row_number),
  constraint catalog_import_staging_row_number_valid
    check (row_number > 0),
  constraint catalog_import_staging_code_not_blank
    check (length(btrim(product_code)) > 0),
  constraint catalog_import_staging_name_not_blank
    check (length(btrim(product_name)) > 0),
  constraint catalog_import_staging_sale_price_nonnegative
    check (sale_price is null or sale_price >= 0)
);

create index idx_catalog_import_staging_import_id
  on public.catalog_import_staging(import_id);

create unique index ux_catalog_import_staging_code_ci
  on public.catalog_import_staging (
    import_id,
    lower(btrim(product_code))
  );

create index if not exists idx_product_catalog_code_ci
  on public.product_catalog(lower(btrim(product_code)));

create index if not exists idx_products_product_code_ci
  on public.products(lower(btrim(product_code)));

alter table public.catalog_import_jobs enable row level security;
alter table public.catalog_import_staging enable row level security;

revoke all on table public.catalog_import_jobs from anon, authenticated;
revoke all on table public.catalog_import_staging from anon, authenticated;

grant select, insert, update, delete
  on table public.catalog_import_jobs
  to service_role;

grant select, insert, update, delete
  on table public.catalog_import_staging
  to service_role;

create or replace function public.commit_catalog_import(
  p_import_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.catalog_import_jobs%rowtype;
  v_stage_count integer := 0;
  v_existing_count integer := 0;
  v_catalog_updated integer := 0;
  v_catalog_inserted integer := 0;
  v_catalog_deleted integer := 0;
  v_products_synced integer := 0;
  v_stale_products_cleared integer := 0;
  v_final_count integer := 0;
  v_result jsonb;
begin
  if p_import_id is null then
    raise exception 'Thiếu p_import_id.';
  end if;

  if p_actor_user_id is null then
    raise exception 'Thiếu p_actor_user_id.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_actor_user_id
      and u.active = true
      and u.role = 'ADMIN'
  ) then
    raise exception 'Chỉ ADMIN đang hoạt động mới có quyền cập nhật DATA.';
  end if;

  select *
  into v_job
  from public.catalog_import_jobs
  where id = p_import_id
  for update;

  if not found then
    raise exception 'Không tìm thấy phiên cập nhật DATA.';
  end if;

  if v_job.actor_user_id <> p_actor_user_id then
    raise exception 'Phiên cập nhật DATA không thuộc ADMIN hiện tại.';
  end if;

  if v_job.status <> 'UPLOADING' then
    raise exception
      'Phiên cập nhật DATA không ở trạng thái UPLOADING. Trạng thái: %',
      v_job.status;
  end if;

  select count(*)
  into v_stage_count
  from public.catalog_import_staging s
  where s.import_id = p_import_id;

  if v_stage_count <> v_job.total_rows then
    raise exception
      'Số dòng đã upload (%) không khớp số dòng file (%).',
      v_stage_count,
      v_job.total_rows;
  end if;

  if v_stage_count = 0 then
    raise exception 'Phiên import không có dữ liệu.';
  end if;

  if exists (
    select lower(btrim(pc.product_code))
    from public.product_catalog pc
    group by lower(btrim(pc.product_code))
    having count(*) > 1
  ) then
    raise exception
      'DATA hiện tại có mã trùng khi bỏ phân biệt hoa/thường hoặc khoảng trắng.';
  end if;

  update public.catalog_import_jobs
  set status = 'PROCESSING',
      result = null,
      completed_at = null
  where id = p_import_id;

  select count(*)
  into v_existing_count
  from public.catalog_import_staging s
  where s.import_id = p_import_id
    and exists (
      select 1
      from public.product_catalog pc
      where lower(btrim(pc.product_code))
          = lower(btrim(s.product_code))
    );

  update public.product_catalog pc
  set
    product_code = btrim(s.product_code),
    product_name = btrim(s.product_name),
    sale_price = s.sale_price,
    active = true
  from public.catalog_import_staging s
  where s.import_id = p_import_id
    and lower(btrim(pc.product_code))
        = lower(btrim(s.product_code))
    and (
      pc.product_code is distinct from btrim(s.product_code)
      or pc.product_name is distinct from btrim(s.product_name)
      or pc.sale_price is distinct from s.sale_price
      or pc.active is distinct from true
    );

  get diagnostics v_catalog_updated = row_count;

  insert into public.product_catalog (
    product_code,
    product_name,
    sale_price,
    active
  )
  select
    btrim(s.product_code),
    btrim(s.product_name),
    s.sale_price,
    true
  from public.catalog_import_staging s
  where s.import_id = p_import_id
    and not exists (
      select 1
      from public.product_catalog pc
      where lower(btrim(pc.product_code))
          = lower(btrim(s.product_code))
    );

  get diagnostics v_catalog_inserted = row_count;

  update public.products p
  set
    catalog_id = pc.id,
    product_code = pc.product_code,
    product_name = pc.product_name,
    sale_price = pc.sale_price
  from public.product_catalog pc
  where lower(btrim(p.product_code))
      = lower(btrim(pc.product_code))
    and exists (
      select 1
      from public.catalog_import_staging s
      where s.import_id = p_import_id
        and lower(btrim(s.product_code))
            = lower(btrim(pc.product_code))
    )
    and (
      p.catalog_id is distinct from pc.id
      or p.product_code is distinct from pc.product_code
      or p.product_name is distinct from pc.product_name
      or p.sale_price is distinct from pc.sale_price
    );

  get diagnostics v_products_synced = row_count;

  update public.products p
  set
    catalog_id = null,
    sale_price = null
  where not exists (
    select 1
    from public.catalog_import_staging s
    where s.import_id = p_import_id
      and lower(btrim(s.product_code))
          = lower(btrim(p.product_code))
  )
  and (
    p.catalog_id is not null
    or p.sale_price is not null
  );

  get diagnostics v_stale_products_cleared = row_count;

  delete from public.product_catalog pc
  where not exists (
    select 1
    from public.catalog_import_staging s
    where s.import_id = p_import_id
      and lower(btrim(s.product_code))
          = lower(btrim(pc.product_code))
  );

  get diagnostics v_catalog_deleted = row_count;

  select count(*)
  into v_final_count
  from public.product_catalog;

  if v_final_count <> v_stage_count then
    raise exception
      'Số dòng product_catalog sau cập nhật (%) không khớp file mới (%).',
      v_final_count,
      v_stage_count;
  end if;

  v_result := jsonb_build_object(
    'totalRows', v_stage_count,
    'existingBefore', v_existing_count,
    'catalogUpdated', v_catalog_updated,
    'catalogInserted', v_catalog_inserted,
    'catalogDeleted', v_catalog_deleted,
    'productsSynced', v_products_synced,
    'staleProductsCleared', v_stale_products_cleared,
    'finalCatalogCount', v_final_count
  );

  update public.catalog_import_jobs
  set
    status = 'COMPLETED',
    result = v_result,
    completed_at = now()
  where id = p_import_id;

  delete from public.catalog_import_staging
  where import_id = p_import_id;

  return v_result;
end;
$$;

revoke all
  on function public.commit_catalog_import(uuid, uuid)
  from anon, authenticated;

grant execute
  on function public.commit_catalog_import(uuid, uuid)
  to service_role;

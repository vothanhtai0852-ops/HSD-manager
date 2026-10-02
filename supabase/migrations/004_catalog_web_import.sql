-- HSD MANAGER
-- 004_catalog_web_import.sql

-- Web import DATA cho ADMIN.
-- DATA mới chỉ thay catalog khi toàn bộ file upload đủ.
-- Sau commit, product_catalog cũ được đồng bộ/xóa theo file mới.
-- PRODUCTS đang theo dõi cũng được cập nhật product_name + sale_price
-- để web không giữ giá cũ khác DATA mới.

drop table if exists public.product_catalog_staging;

create table if not exists public.catalog_import_jobs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.users(id)
    on update cascade
    on delete restrict,
  file_name text not null,
  total_rows integer not null,
  status text not null default 'UPLOADING',
  result jsonb null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint catalog_import_jobs_total_rows_valid
    check (total_rows > 0 and total_rows <= 300000),
  constraint catalog_import_jobs_status_valid
    check (status in ('UPLOADING','PROCESSING','COMPLETED','FAILED'))
);

create index if not exists idx_catalog_import_jobs_actor
  on public.catalog_import_jobs(actor_user_id);

create index if not exists idx_catalog_import_jobs_created_at
  on public.catalog_import_jobs(created_at desc);

create table if not exists public.catalog_import_staging (
  import_id uuid not null references public.catalog_import_jobs(id)
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

create unique index if not exists ux_catalog_import_staging_code_ci
  on public.catalog_import_staging (
    import_id,
    lower(btrim(product_code))
  );

create index if not exists idx_catalog_import_staging_import_id
  on public.catalog_import_staging(import_id);

create index if not exists idx_product_catalog_code_ci
  on public.product_catalog (lower(btrim(product_code)));

alter table public.catalog_import_jobs enable row level security;
alter table public.catalog_import_staging enable row level security;

revoke all on table public.catalog_import_jobs from anon, authenticated;
revoke all on table public.catalog_import_staging from anon, authenticated;

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
  if not exists (
    select 1
    from public.users u
    where u.id = p_actor_user_id
      and u.active = true
      and u.role = 'ADMIN'
  ) then
    raise exception 'Chỉ ADMIN mới có quyền cập nhật DATA.';
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
    raise exception 'Phiên cập nhật DATA không thuộc tài khoản hiện tại.';
  end if;

  if v_job.status <> 'UPLOADING' then
    raise exception 'Phiên cập nhật DATA không ở trạng thái có thể xử lý.';
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

  if exists (
    select lower(btrim(pc.product_code))
    from public.product_catalog pc
    group by lower(btrim(pc.product_code))
    having count(*) > 1
  ) then
    raise exception
      'DATA hiện tại có mã trùng khi bỏ phân biệt hoa/thường. Cần xử lý trước khi import.';
  end if;

  update public.catalog_import_jobs
  set status = 'PROCESSING'
  where id = p_import_id;

  select count(*)
    into v_existing_count
  from public.catalog_import_staging s
  where s.import_id = p_import_id
    and exists (
      select 1
      from public.product_catalog pc
      where lower(btrim(pc.product_code)) = lower(btrim(s.product_code))
    );

  update public.product_catalog pc
  set
    product_code = btrim(s.product_code),
    product_name = btrim(s.product_name),
    sale_price = s.sale_price,
    active = true
  from public.catalog_import_staging s
  where s.import_id = p_import_id
    and lower(btrim(pc.product_code)) = lower(btrim(s.product_code))
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
      where lower(btrim(pc.product_code)) = lower(btrim(s.product_code))
    );

  get diagnostics v_catalog_inserted = row_count;

  update public.products p
  set
    catalog_id = pc.id,
    product_code = pc.product_code,
    product_name = pc.product_name,
    sale_price = pc.sale_price
  from public.product_catalog pc
  where lower(btrim(p.product_code)) = lower(btrim(pc.product_code))
    and (
      p.catalog_id is distinct from pc.id
      or p.product_code is distinct from pc.product_code
      or p.product_name is distinct from pc.product_name
      or p.sale_price is distinct from pc.sale_price
    );

  get diagnostics v_products_synced = row_count;

  delete from public.product_catalog pc
  where not exists (
    select 1
    from public.catalog_import_staging s
    where s.import_id = p_import_id
      and lower(btrim(s.product_code)) = lower(btrim(pc.product_code))
  );

  get diagnostics v_catalog_deleted = row_count;

  update public.products p
  set
    catalog_id = null,
    sale_price = null
  where not exists (
    select 1
    from public.product_catalog pc
    where lower(btrim(pc.product_code)) = lower(btrim(p.product_code))
  )
  and (
    p.catalog_id is not null
    or p.sale_price is not null
  );

  get diagnostics v_stale_products_cleared = row_count;

  select count(*)
    into v_final_count
  from public.product_catalog;

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

revoke all on function public.commit_catalog_import(uuid, uuid) from public;
revoke all on function public.commit_catalog_import(uuid, uuid) from anon;
revoke all on function public.commit_catalog_import(uuid, uuid) from authenticated;
grant execute on function public.commit_catalog_import(uuid, uuid) to service_role;

comment on function public.commit_catalog_import(uuid, uuid) is
'Atomically replaces product_catalog from one ADMIN web import and syncs products name/price to the new DATA.';

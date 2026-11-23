-- Let an active ADMIN permanently remove any USER or MANAGER and all data
-- that would otherwise block deletion. The work is atomic in one transaction.
create or replace function public.admin_delete_user_account(
  p_admin_user_id uuid,
  p_target_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_ids uuid[];
  v_username text;
begin
  perform 1
    from public.users
   where id = p_admin_user_id
     and role = 'ADMIN'
     and active = true
   for update;

  if not found then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select username
    into v_username
    from public.users
   where id = p_target_user_id
     and role in ('USER', 'MANAGER')
   for update;

  if not found then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
    into v_product_ids
    from public.products
   where user_id = p_target_user_id;

  delete from public.alert_logs
   where user_id = p_target_user_id
      or product_id = any(v_product_ids);

  delete from public.history_logs
   where actor_user_id = p_target_user_id
      or product_id = any(v_product_ids);

  delete from public.products
   where user_id = p_target_user_id;

  delete from public.scan_sessions
   where user_id = p_target_user_id;

  delete from public.catalog_import_jobs
   where actor_user_id = p_target_user_id;

  delete from public.alert_configs
   where user_id = p_target_user_id;

  delete from public.user_emails
   where user_id = p_target_user_id;

  -- Keep the manager's employees and leave them available for reassignment.
  update public.users
     set parent_id = null
   where parent_id = p_target_user_id;

  delete from public.users
   where id = p_target_user_id;

  return v_username;
end;
$$;

revoke all on function public.admin_delete_user_account(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_delete_user_account(uuid, uuid)
  to service_role;

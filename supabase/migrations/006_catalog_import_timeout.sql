-- HSD MANAGER
-- supabase/migrations/006_catalog_import_timeout.sql
--
-- Mục tiêu:
-- Tăng timeout RIÊNG cho function commit_catalog_import khi gọi qua Supabase RPC.
-- Không thay đổi dữ liệu, không xóa bảng, không đổi logic import.

alter function public.commit_catalog_import(uuid, uuid)
  set statement_timeout = '120s';

-- Yêu cầu PostgREST nạp lại cấu hình/schema cache.
notify pgrst, 'reload config';

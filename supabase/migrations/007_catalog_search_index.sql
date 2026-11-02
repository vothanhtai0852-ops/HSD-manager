-- Tối ưu truy vấn ILIKE chứa mã SP ở /api/catalog/search.
-- Chạy một lần trong Supabase SQL Editor trước khi triển khai ứng dụng.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_product_catalog_active_code_trgm
  ON public.product_catalog USING gin (product_code gin_trgm_ops)
  WHERE active = true;

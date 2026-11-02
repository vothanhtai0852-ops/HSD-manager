-- Indexes to support the product list's stable ordering and user scoping.
-- These reduce sorting/scanning work for the dashboard's paged batch reads.

CREATE INDEX IF NOT EXISTS idx_products_created_at_id_desc
  ON public.products (created_at DESC, id ASC);

CREATE INDEX IF NOT EXISTS idx_products_user_created_at_id_desc
  ON public.products (user_id, created_at DESC, id ASC);

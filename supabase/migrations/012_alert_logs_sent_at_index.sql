-- Speed up the dashboard's "sent today" product summary without sending a
-- potentially huge product-id IN list to PostgREST.
create index if not exists idx_alert_logs_sent_at_product_id
  on public.alert_logs (sent_at, product_id)
  where delivery_status = 'SENT' and sent_at is not null;

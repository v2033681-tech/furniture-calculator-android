-- Run this once in Supabase SQL Editor to extend the existing orders table.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS prepayment numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_total numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'Новый';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS installation_date date;
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders(order_number);

-- Realtime: publica los cambios de public.reportes para que el mapa se
-- actualice en vivo (suscripción postgres_changes del motor de sync).
-- Realtime aplica la RLS de select: cada usuario solo recibe lo que puede leer.
alter publication supabase_realtime add table public.reportes;

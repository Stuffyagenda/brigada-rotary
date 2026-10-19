-- 004: los reportes y las visitas no se borran, solo se editan.
-- Ejecutar después de 002 y 003. Es idempotente: se puede aplicar varias veces.
--
-- Sin política DELETE y sin el privilegio DELETE, la API (PostgREST) no puede
-- borrar reportes ni visitas, ni siquiera un administrador.
-- Fuera de alcance (no cambia): el `on delete cascade` de las claves foráneas,
-- el borrado de fotos de Storage y el borrado de clubes por un administrador.

begin;

-- Políticas de borrado (solo admin) que se retiran.
drop policy if exists "reportes: solo admin borra" on public.reportes;
drop policy if exists "visitas: solo admin borra"  on public.visitas;

-- Privilegio DELETE: anon no tiene ninguno; se retira a authenticated.
revoke delete on public.reportes from authenticated;
revoke delete on public.visitas  from authenticated;

commit;

-- Rodar depois que o serviço de Storage do projeto estiver ativo
-- Fotos dos chamados
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 1048576, array['image/jpeg']);
create policy fotos_enviar on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'fotos' and name ~ '^chamados/[0-9a-f-]{36}\.jpg$');

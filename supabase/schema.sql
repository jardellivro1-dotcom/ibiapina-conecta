-- Ibiapina Conecta: esquema do MVP
create table public.equipe (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.equipe enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.equipe where user_id = auth.uid()) $$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create policy equipe_ler_proprio on public.equipe for select to authenticated
  using (user_id = (select auth.uid()));

create table public.chamados (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('Iluminação','Buraco / rua','Estrada / passagem molhada','Falta de água','Lixo / limpeza','Praça / quadra','Bueiro / alagamento','Esgoto','Outro')),
  local text not null check (char_length(local) between 2 and 60),
  descricao text not null check (char_length(descricao) between 5 and 600),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  foto_path text check (foto_path is null or foto_path ~ '^chamados/[0-9a-f-]{36}\.jpg$'),
  status text not null default 'Aberto' check (status in ('Aberto','Em análise','Em andamento','Resolvido')),
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
create index chamados_status_idx on public.chamados (status, criado_em desc);
alter table public.chamados enable row level security;

create policy chamados_publico_ler on public.chamados for select to anon, authenticated using (true);
create policy chamados_publico_criar on public.chamados for insert to anon, authenticated
  with check (status = 'Aberto' and resolvido_em is null);
create policy chamados_equipe_atualizar on public.chamados for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.chamados_marca_resolvido() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'Resolvido' and old.status is distinct from 'Resolvido' then new.resolvido_em := now();
  elsif new.status <> 'Resolvido' then new.resolvido_em := null; end if;
  return new;
end $$;
create trigger chamados_resolvido before update on public.chamados
  for each row execute function public.chamados_marca_resolvido();

-- Contato do cidadão: nunca público, só a equipe lê.
create table public.chamados_contato (
  chamado_id bigint primary key references public.chamados(id) on delete cascade,
  contato text not null check (char_length(contato) between 3 and 120)
);
alter table public.chamados_contato enable row level security;
create policy contato_criar on public.chamados_contato for insert to anon, authenticated with check (true);
create policy contato_equipe_ler on public.chamados_contato for select to authenticated using (public.is_staff());

-- Status das propostas do PPA (o texto das propostas fica no app).
create table public.ppa_status (
  proposta_id int primary key,
  status text not null check (status in ('Recebida','Em análise','Em andamento','Concluída')),
  atualizado_em timestamptz not null default now()
);
alter table public.ppa_status enable row level security;
create policy ppa_status_ler on public.ppa_status for select to anon, authenticated using (true);
create policy ppa_status_equipe_inserir on public.ppa_status for insert to authenticated with check (public.is_staff());
create policy ppa_status_equipe_atualizar on public.ppa_status for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Apoios: um por aparelho por proposta. Sem acesso direto; só via funções.
create table public.ppa_apoios (
  proposta_id int not null,
  aparelho uuid not null,
  criado_em timestamptz not null default now(),
  primary key (proposta_id, aparelho)
);
alter table public.ppa_apoios enable row level security;

create or replace function public.ppa_alternar_apoio(p_proposta int, p_aparelho uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_proposta < 1 or p_proposta > 310 then raise exception 'proposta inválida'; end if;
  if exists (select 1 from ppa_apoios where proposta_id = p_proposta and aparelho = p_aparelho) then
    delete from ppa_apoios where proposta_id = p_proposta and aparelho = p_aparelho; return false;
  end if;
  insert into ppa_apoios (proposta_id, aparelho) values (p_proposta, p_aparelho); return true;
end $$;

create or replace function public.ppa_contagem() returns table (proposta_id int, apoios bigint)
language sql stable security definer set search_path = public as
$$ select proposta_id, count(*) from ppa_apoios group by proposta_id $$;

create or replace function public.ppa_meus_apoios(p_aparelho uuid) returns setof int
language sql stable security definer set search_path = public as
$$ select proposta_id from ppa_apoios where aparelho = p_aparelho $$;

revoke all on function public.ppa_alternar_apoio(int, uuid), public.ppa_contagem(), public.ppa_meus_apoios(uuid) from public;
grant execute on function public.ppa_alternar_apoio(int, uuid), public.ppa_contagem(), public.ppa_meus_apoios(uuid) to anon, authenticated;


# Ibiapina Conecta (MVP)

Aplicativo web (PWA) para o cidadão reportar problemas, acompanhar chamados e apoiar as 310 propostas do PPA 2026-2029 de Ibiapina.

## Rodar localmente
`iniciar.bat` (precisa de Python) e abra http://localhost:8765

## Backend (Supabase)
- Projeto "Ibiapina Conecta" (sa-east-1). URL e chave pública ficam em `config.js`.
- `supabase/schema.sql` cria tabelas, regras RLS e funções; `supabase/storage.sql` cria o bucket de fotos.
- Sem `config.js` preenchido o app roda em modo demonstração (dados só no aparelho).

## Equipe da Prefeitura
1. Supabase > Authentication > Users > Add user (e-mail + senha).
2. Liberar acesso de gestor:
   `insert into public.equipe select id from auth.users where email = 'email@da.equipe';`

## Segurança (resumo)
- Qualquer pessoa pode criar chamado (sempre como "Aberto") e ler chamados. Só a equipe altera status.
- Contato do cidadão fica em tabela separada, legível só pela equipe.
- Apoios ao PPA só por funções, 1 por aparelho; sem contas, então não é à prova de fraude.

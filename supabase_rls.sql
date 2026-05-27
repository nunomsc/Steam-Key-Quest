-- SteamKeyQuest - Supabase Row Level Security (RLS) Security Hardening
--
-- Este script protege as tuas tabelas de base de dados contra acessos públicos não autorizados.
-- Como esta aplicação utiliza um servidor Express com a `SUPABASE_SERVICE_ROLE_KEY` (Chave de Service Role)
-- para realizar operações na base de dados, todos os pedidos dos utilizadores passam de forma segura pelo servidor.
-- Ativar o RLS impede que a chave pública (anon_key) seja usada num browser ou cliente HTTP externo para ler
-- diretamente as chaves de jogos não reveladas (`full_key`).

-- 1. Ativar Row Level Security (RLS) para 'giveaways' e 'users'
ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Nota: Na Supabase, uma vez ativado o RLS, todos os pedidos efetuados com as credenciais 
-- 'anon' (públicas) ou 'authenticated' (utilizadores comuns) são bloqueados por omissão (Default Deny).
--
-- Como o nosso servidor Express utiliza a 'SUPABASE_SERVICE_ROLE_KEY', esta chave ultrapassa (bypasses)
-- todas as políticas de RLS de forma nativa na base de dados, permitindo que a aplicação funcione
-- perfeitamente sem expor dados confidenciais a terceiros.

-- Se em algum momento quiseres permitir pesquisas públicas diretas e seguras, podes criar políticas específicas.
-- No entanto, a forma mais segura recomendada para esta arquitetura é manter o RLS ativo e sem políticas públicas abertas.

# KeyQuest (Local Setup)

Este projeto é uma aplicação full-stack (React + Express + Supabase).

## Pré-requisitos
- Node.js (v22 ou superior recomendado)
- Uma conta na [Supabase](https://supabase.com/)

## Instalação Local

1.  **Clone o projeto** ou descarregue o ZIP via Settings > Export do AI Studio.
2.  **Instale as dependências:**
    ```bash
    npm install
    ```
3.  **Configure o Ambiente:**
    - Crie um ficheiro `.env` na raiz (copie o topo de `.env.example`).
    - No dashboard da Supabase, vá a **Settings > API** e copie o **Project URL** e a **API Key (anon/public)**.
    - Preencha os valores no `.env`:
      ```env
      VITE_SUPABASE_URL=teu_url
      VITE_SUPABASE_ANON_KEY=tua_key
      SUPABASE_SERVICE_ROLE_KEY=tua_key_service_role
      ADMIN_PASSWORD=teu_pass_admin
      ```
4.  **Base de Dados e Segurança (Row Level Security - RLS):**
    - Garanta que tens as tabelas `giveaways` e `users` criadas na Supabase.
    - **Importante (Segurança RLS):** Para evitar que utilizadores maliciosos encontrem a chave pública (`anon`) e obtenham as chaves completas dos sorteios (`full_key`) diretamente da API Rest da Supabase (ultrapassando as pistas), precisas de ativar o **Row Level Security (RLS)** nas tuas tabelas.
    - Executa as seguintes consultas no **SQL Editor** da Supabase (disponível no menu lateral do teu painel Supabase, ou copia o conteúdo do ficheiro `/supabase_rls.sql` na raiz do projeto):
      ```sql
      -- Ativar Row Level Security (RLS) para proteger os dados públicos
      ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      ```
    - **Nota:** Como o nosso servidor Express utiliza a `SUPABASE_SERVICE_ROLE_KEY` para iniciar o cliente Supabase, as operações do servidor continuarão a funcionar na perfeição e de forma 100% segura, pois o modo Service Role ultrapassa nativamente as políticas de RLS da base de dados.

## Execução

### Modo de Desenvolvimento (Hot Reload)
```bash
npm run dev
```
Aceda a `http://localhost:3000`.

### Modo de Produção
```bash
npm run build
npm start
```

## Prompt de Geração

Este projeto foi gerado no **AI Studio Build** com a seguinte base:

> "Cria uma aplicação de sorteios de chaves (giveaways) com um sistema de puzzles. As chaves devem estar parcialmente escondidas e o utilizador precisa de resolver uma pista lógica para as completar. Implementa proteção rigorosa contra abusos usando ID de utilizador, IP e Browser Fingerprint. Adiciona um sistema de 'Cooldown' onde vencedores ficam bloqueados por 3 rondas e utilizadores que falhem muitas vezes ficam bloqueados temporariamente. O design deve ser estilo 'Cyber/Hacker' escuro, com animações de scanline e chaves com efeito de blur constante que só é 'decifrado' ao introduzir a solução correta no backend. Inclui um painel de administração protegido por password para gerir os sorteios."

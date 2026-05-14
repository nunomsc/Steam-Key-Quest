# SteamKeyQuest (Local Setup)

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
4.  **Base de Dados:**
    - Garanta que tens as tabelas `giveaways` e `users` criadas na Supabase.

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

# Guia de Implementação em Produção - SteamKeyQuest

Este guia contém os passos necessários para mover a aplicação do AI Studio para um ambiente de produção real (VPS ou Vercel).

## 1. Configuração da Supabase (Backend)

A aplicação depende da Supabase para persistir sorteios e utilizadores. Para garantir que tudo funciona (incluindo as proteções anti-incógnito e o sistema de rounds), executa o seguinte SQL no **SQL Editor** do teu projeto Supabase:

```sql
-- TABELA: giveaways (Sorteios)
CREATE TABLE IF NOT EXISTS giveaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  full_key TEXT NOT NULL,
  puzzle_hint TEXT,
  hidden_positions INT[] DEFAULT '{}',
  status TEXT DEFAULT 'active',
  winner_id TEXT, 
  platform TEXT DEFAULT 'Steam',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: users (Estado dos Caçadores)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,           
  ip TEXT,                       -- NOVO: Proteção contra Incógnito
  fingerprint TEXT,              -- NOVO: Proteção contra Incógnito
  skip_remaining INT DEFAULT 0,  
  failed_attempts INT DEFAULT 0, 
  last_win_at TIMESTAMPTZ
);

-- FUNÇÃO RPC: Decrementar rounds de cooldown
CREATE OR REPLACE FUNCTION decrement_skip_counts(winner_id_param TEXT)
RETURNS void AS $$
BEGIN
  -- Tenta decrementar na coluna snake_case
  UPDATE users
  SET skip_remaining = GREATEST(0, skip_remaining - 1)
  WHERE id != winner_id_param AND skip_remaining > 0;
  
  -- Tenta decrementar na coluna camelCase (legado)
  UPDATE users
  SET "skipRemaining" = GREATEST(0, "skipRemaining" - 1)
  WHERE id != winner_id_param AND "skipRemaining" > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 2. Variáveis de Ambiente

No teu servidor de produção ou painel da Vercel, deves configurar as seguintes variáveis:

| Variável | Descrição |
| :--- | :--- |
| `VITE_SUPABASE_URL` | O teu Project URL (Settings > API) |
| `VITE_SUPABASE_ANON_KEY` | A tua Anon/Public Key |
| `SUPABASE_SERVICE_ROLE_KEY` | A tua Service Role Key (Apenas para o servidor/node) |
| `ADMIN_PASSWORD` | Password para o BackOffice |
| `GEMINI_API_KEY` | (Opcional) Se usares IA para gerar puzzles |

---

## 3. Opções de Alojamento (Deployment)

### Opção A: VPS (Hetzner / DigitalOcean / Ubuntu)
- **Custo:** ~4€ a 6€ / mês.
- **Recomendação:** Escolhe Ubuntu 22.04 ou 24.04 LTS.

#### Passo 1: Preparar o Servidor
Liga-te via SSH e corre estes comandos para instalar o necessário:
```bash
# Atualizar o sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js (v20+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2 (para manter a app sempre a correr)
sudo npm install -g pm2
```

#### Passo 2: Meter o código no servidor
Podes usar Git ou carregar o ficheiro via SFTP. Depois, dentro da pasta do projeto:
```bash
npm install
# Cria o ficheiro .env e edita com: nano .env (cola os dados da Supabase)
npm run build
```

#### Passo 3: Iniciar a Aplicação
```bash
pm2 start dist/server.cjs --name "steamkeyquest"
pm2 save
pm2 startup
```

#### Passo 4: Configurar domínio e SSL (Nginx)
```bash
sudo apt install nginx -y

# Criar ficheiro de configuração: sudo nano /etc/nginx/sites-available/steamkeyquest
# Conteúdo básico:
# server {
#     listen 80;
#     server_name O_TEU_DOMINIO.com;
#     location / {
#         proxy_pass http://localhost:3000;
#         proxy_http_version 1.1;
#         proxy_set_header Upgrade $http_upgrade;
#         proxy_set_header Connection 'upgrade';
#         proxy_set_header Host $host;
#         proxy_cache_bypass $http_upgrade;
#     }
# }

sudo ln -s /etc/nginx/sites-available/steamkeyquest /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Para HTTPS (Certbot):
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d O_TEU_DOMINIO.com
```

### Opção C: Oracle Cloud (Grátis - Always Free)
- **Custo:** 0€ (Se conseguires vaga no tier gratuito).
- **Setup:**
  1. Escolhe uma instância **Ampere (ARM)** com 4 OCPUs e 24GB RAM (o melhor do mercado grátis).
  2. **Networking (Crucial):**
     - No Dashboard da Oracle, vai a *Ingress Rules* e abre as portas **80 (HTTP)** e **443 (HTTPS)**.
     - No terminal da instância (Ubuntu), tens de abrir a firewall interna:
       ```bash
       sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
       sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
       sudo netfilter-persistent save
       ```
  3. Segue os passos de instalação da Opção A (Node, PM2, Nginx).

---

## 4. Domínio e SSL (Obrigatório para Partilha)

Para o botão "Share" e a segurança da base de dados funcionarem, precisas de HTTPS.

### Passo 1: Comprar um Domínio
Podes comprar em sites como Namecheap, Cloudflare ou GoDaddy. Se quiseres algo barato, procura extensões como `.xyz`, `.site` ou `.online`.

### Passo 2: Configurar o DNS
No painel do teu domínio, cria um **Registo A**:
- **Nome/Host:** `@` (ou deixa vazio)
- **Valor/Alvo:** O endereço IP da tua VPS Hetzner.

### Passo 3: Certificado SSL Grátis
Usa o Certbot (conforme descrito no passo 4 da Opção A) para obter um certificado Let's Encrypt gratuito. Isto transformará o teu `http://` em `https://`.

---

## 5. Checklist de Segurança
1. **RLS (Row Level Security):** Na Supabase, ativa o RLS na tabela `giveaways` para que o campo `full_key` não seja lido por qualquer pessoa (apenas via servidor com a key de service role).
2. **BackOffice:** Nunca uses a password `admin123` em produção.
3. **Domínio:** Garante que tens um certificado SSL ativo (HTTPS) para que o `navigator.share` e a segurança dos headers funcionem corretamente.

---

## 6. Segurança e Endurecimento (Hardening)
A aplicação inclui várias camadas de proteção:
1. **Rate Limiting:** O endpoint `/api/claim` está limitado por IP para evitar ataques de força bruta.
2. **Timing Attack Protection:** A verificação de password de admin usa comparação em tempo constante.
3. **Sensitive Key Isolation:** Chaves como a `SERVICE_ROLE_KEY` nunca são enviadas para o browser.
4. **Sanitização:** Erros internos da base de dados são mascarados para o utilizador final.
5. **Fingerprint & IP Defense:** Foram adicionados mecanismos para dificultar a participação via janelas anónimas (Incógnito), associando o estado de cooldown ao IP e à assinatura do browser.

## 7. Nota sobre Segurança de Administrador
As credenciais de administrador já não são enviadas via URL, o que evita que fiquem gravadas em logs (Hetzner/Nginx). No entanto, para segurança máxima em produção "Enterprise", recomenda-se a integração com o Supabase Auth para gerir utilizadores administrativos em vez de uma password única no `.env`.

---

## 8. Ideias de Monetização (Mínima)
Como o objetivo é algo simples e não intrusivo:
1. **Afiliados (Instant Gaming / Humble Bundle):** Podes colocar links de afiliados para os jogos que estás a oferecer. Se alguém quiser o jogo sem esperar pelo sorteio, tu ganhas uma comissão.
2. **Buy Me a Coffee / Patreon:** Um botão pequeno e elegante no fundo da página ("Support the Vault") para doações voluntárias.
3. **Google AdSense:** Banners pequenos (ex: um lateral ou um no fundo). Atenção para não quebrar a estética "Hacker".
4. **Micro-Transações de Puzzle:** Cobrar um valor simbólico (ex: 0.10€ via Stripe) para revelar instantaneamente uma letra do puzzle (não recomendado se o foco for 100% grátis).

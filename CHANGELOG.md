# Histórico de Versões - SteamKeyQuest

## [V1.1.4] - 2024-05-14
### Corrigido (Crítico)
- Segurança: Removida a password de administrador dos parâmetros de URL (Query String) nas chamadas de API.
- Segurança: Implementada autenticação via Headers HTTP (`x-admin-password`) para maior proteção contra fugas em logs do servidor.
- Adicionado botão "Flush Session" (Logout) no BackOffice para limpar credenciais do `localStorage`.

## [V1.1.3] - 2024-05-14
### Adicionado
- Secção sobre Domínios e configuração de DNS no `PRODUCTION_GUIDE.md`.

## [V1.1.2] - 2024-05-14
### Adicionado
- Guia passo-a-passo detalhado para configuração em Ubuntu/Hetzner no `PRODUCTION_GUIDE.md`.

## [V1.1.1] - 2024-05-14
### Adicionado
- Instruções detalhadas para Oracle Cloud Always Free no `PRODUCTION_GUIDE.md`.

## [V1.1.0] - 2024-05-14 (Atual)
### Adicionado
- Documentação completa de produção (`PRODUCTION_GUIDE.md`).
- Histórico de versões (`CHANGELOG.md`).
- Correção de bug no botão "Share" que apontava para o editor do AI Studio em vez da versão pública.
- Suporte para variáveis de ambiente locais em `.env.example`.

### Corrigido
- Ajuste de design no botão "Return to Vault" e botões do Admin para largura fixa de 110px.
- Mapeamento de colunas Case-Sensitive na Supabase (`skipRemaining` vs `skip_remaining`).

## [V1.0.5] - 2024-05-13
### Adicionado
- Sistema de BackOffice para gestão de Giveaways.
- Integração com Gemini para sugestão de hints de puzzles.
- Sistema de Cooldown para evitar tentativas infinitas de adivinhação.

## [V1.0.0] - 2024-05-12
### Lançamento Inicial
- Interface "Hacker/Terminal" temática.
- Integração básica com Supabase para armazenamento de chaves.
- Mecânica de puzzle com posições escondidas.
- Sistema de "Skips" para utilizadores que não ganharam o prémio atual.

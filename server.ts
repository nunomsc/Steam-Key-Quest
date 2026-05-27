import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import crypto from 'crypto';

const __dirname = process.cwd();

// Security: Simple in-memory rate limiter for admin attempts
const adminAttempts = new Map<string, { count: number; lockUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes lockout

function isLocked(ip: string) {
  const attempt = adminAttempts.get(ip);
  if (attempt && attempt.lockUntil > Date.now()) return true;
  return false;
}

function recordAttempt(ip: string, success: boolean) {
  const attempt = adminAttempts.get(ip) || { count: 0, lockUntil: 0 };
  if (success) {
    adminAttempts.delete(ip);
  } else {
    attempt.count++;
    if (attempt.count >= MAX_ATTEMPTS) {
      attempt.lockUntil = Date.now() + LOCK_TIME;
    }
    adminAttempts.set(ip, attempt);
  }
}

// Security: Constant-time comparison to prevent timing attacks
function secureCompare(a: string, b: string) {
  if (!a || !b || a.length !== b.length) {
    // Perform a dummy comparison to mitigate timing leaks about length
    const dummy = Buffer.alloc(32, 'dummy');
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Critical] Missing Supabase configuration (URL or SERVICE_ROLE_KEY).');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

interface Giveaway {
  id: string;
  title: string;
  fullKey: string;
  puzzleHint: string;
  hiddenPositions: number[];
  status: 'active' | 'claimed';
  winnerId: string | null;
  platform: string;
  createdAt: number;
}

interface UserWinRecord {
  id: string;
  lastWinIndex: number;
  skipRemaining: number;
  failedAttempts: number;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  console.log(`[Server] Starting in ${process.env.NODE_ENV || 'development'} mode (Supabase Edition)`);

  app.use(express.json());

  // Security: Rate limiter for claims/brute force
  const claimLimiter = new Map<string, { count: number; lastReset: number }>();
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  const MAX_CLAIMS_PER_WINDOW = 10;

  const rateLimitMiddleware = (req: any, res: any, next: any) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string;
    const now = Date.now();
    const entry = claimLimiter.get(ip) || { count: 0, lastReset: now };

    if (now - entry.lastReset > RATE_LIMIT_WINDOW) {
      entry.count = 0;
      entry.lastReset = now;
    }

    entry.count++;
    claimLimiter.set(ip, entry);

    if (entry.count > MAX_CLAIMS_PER_WINDOW) {
      return res.status(429).json({ error: 'Demasiadas tentativas (Rate Limit). Aguarde um minuto.' });
    }
    next();
  };

  // Security: Admin Authentication Middleware
  const adminAuth = (req: any, res: any, next: any) => {
    const password = (req.headers['x-admin-password'] as string) || req.body.password;
    const correctPassword = process.env.ADMIN_PASSWORD?.trim();
    const clientIp = ((req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

    if (isLocked(clientIp)) {
      return res.status(429).json({ error: 'Demasiadas tentativas falhadas. Bloqueado por 15 minutos.' });
    }

    if (!correctPassword) {
      console.error('[Security] ADMIN_PASSWORD not set!');
      return res.status(500).json({ error: 'Erro de Configuração no Servidor.' });
    }

    if (secureCompare(password, correctPassword)) {
      recordAttempt(clientIp, true);
      next();
    } else {
      recordAttempt(clientIp, false);
      res.status(401).json({ error: 'Password incorreta' });
    }
  };

  // Request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Admin: Verify password
  app.post('/api/admin/verify', adminAuth, (req, res) => {
    res.json({ success: true });
  });

  // Public: Get giveaways
  app.get('/api/giveaways', async (req, res) => {
    try {
      const { data: finalRows, error } = await supabase
        .from('giveaways')
        .select('id, title, puzzle_hint, platform, status, created_at, winner_id, hidden_positions, full_key')
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      const masked = (finalRows || []).map(g => {
        const fullKey = g.full_key || '';
        const hiddenPositions = g.hidden_positions || [];
        let maskedKey = fullKey.split('');
        
        // Only mask positions that are actually part of the puzzle
        hiddenPositions.forEach((pos: number) => {
          if (pos >= 0 && pos < maskedKey.length) maskedKey[pos] = '_';
        });
        
        return {
          id: g.id,
          title: g.title,
          puzzleHint: g.puzzle_hint,
          platform: g.platform || 'Steam',
          maskedKey: maskedKey.join(''),
          hidden_positions: hiddenPositions,
          status: g.status,
          createdAt: g.created_at,
          winnerId: g.status === 'claimed' ? g.winner_id : null
        };
      });
      res.json(masked);
    } catch (error: any) {
      console.error('[Error] Fetching giveaways:', error.message);
      res.status(500).json({ error: 'Erro ao carregar sorteios. Verifique o console.' });
    }
  });

  // Public: Check user eligibility
  app.get('/api/eligibility/:userId', async (req, res) => {
    const { userId } = req.params;
    const fingerprint = req.query.fp as string;
    const clientIp = ((req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

    try {
      // Identity Protection: Check by ID OR by IP OR by Fingerprint
      let filter = `id.eq."${userId}",ip.eq."${clientIp}"`;
      if (fingerprint && fingerprint !== 'none') {
        filter += `,fingerprint.eq."${fingerprint}"`;
      }

      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .or(filter);

      if (error) throw error;

      if (!users || users.length === 0) return res.json({ eligible: true, skipRemaining: 0 });

      // Find the most restrictive user record
      let maxSkip = 0;
      users.forEach(u => {
        const skip = u.skip_remaining || 0;
        if (skip > maxSkip) maxSkip = skip;
      });

      res.json({ eligible: maxSkip === 0, skipRemaining: maxSkip });
    } catch (error: any) {
      console.error('[Error] Eligibility check:', error.message);
      res.status(500).json({ error: 'Pendente' });
    }
  });

  // Public: Claim a key
  app.post('/api/claim', rateLimitMiddleware, async (req, res) => {
    const { giveawayId, userId, puzzleSolutions, fingerprint } = req.body;
    if (!giveawayId || !userId) return res.status(400).json({ error: 'Faltam parâmetros' });
    const clientIp = ((req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

    try {
      // 1. Fetch Giveaway
      const { data: giveaway, error: gError } = await supabase
        .from('giveaways')
        .select('id, status, full_key, hidden_positions')
        .eq('id', giveawayId)
        .single();

      if (gError || !giveaway) return res.status(404).json({ error: 'Sorteio não encontrado' });
      if (giveaway.status === 'claimed') return res.status(409).json({ error: 'Já foi resgatado!' });

      // Identity Hardening: Check if this IP or Fingerprint is already in cooldown
      let filter = `id.eq."${userId}",ip.eq."${clientIp}"`;
      if (fingerprint && fingerprint !== 'none') {
        filter += `,fingerprint.eq."${fingerprint}"`;
      }

      const { data: existingUsers } = await supabase
        .from('users')
        .select('*')
        .or(filter);

      if (existingUsers && existingUsers.length > 0) {
        let maxSkip = 0;
        existingUsers.forEach(u => {
          const s = u.skip_remaining || 0;
          if (s > maxSkip) maxSkip = s;
        });
        if (maxSkip > 0) {
          return res.status(403).json({ error: `COOLDOWN: Aguarde mais ${maxSkip} rounds (Proteção Ativa).` });
        }
      }

      // 2. Fetch or Create User
      let { data: user, error: uError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!user) {
        console.log('[Supabase] User not found, creating:', userId, 'IP:', clientIp);
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({ 
            id: userId, 
            ip: clientIp, 
            fingerprint: fingerprint || 'none',
            last_win_at: null, 
            skip_remaining: 0, 
            failed_attempts: 0 
          })
          .select()
          .maybeSingle();
        
        if (createError) throw createError;
        user = newUser;
      } else {
        // Update tracking info
        await supabase.from('users').update({ ip: clientIp, fingerprint: fingerprint || 'none' }).eq('id', userId);
      }

      if (!user) throw new Error('Não foi possível identificar ou criar o utilizador.');

      const skipCount = user.skip_remaining || 0;
      if (skipCount > 0) return res.status(403).json({ error: `COOLDOWN: Aguarde mais ${skipCount} rounds.` });

      const hiddenPositions = giveaway.hidden_positions || [];
      const fullKey = giveaway.full_key || '';
      
      const actualSolution = hiddenPositions
        .map((pos: number) => fullKey[pos])
        .join('')
        .toLowerCase();
      
      const userSolution = (puzzleSolutions || '').toString().toLowerCase().trim();

      if (userSolution !== actualSolution) {
        const currentFailed = user.failed_attempts || 0;
        const newFailed = currentFailed + 1;
        const updateObj = newFailed >= 3 ? { skip_remaining: 1, failed_attempts: 0 } : { failed_attempts: newFailed };

        await supabase.from('users').update(updateObj).eq('id', userId);
        
        if (newFailed >= 3) {
          return res.status(400).json({ error: 'BRUTE_FORCE: Demasiadas tentativas FALHADAS. Cooldown de 1 drop.' });
        }
        return res.status(400).json({ error: 'Solução incorreta!', attempts: newFailed });
      }

      // 3. ATOMIC SUCCESS
      const { data: updatedGiveaway, error: updateError } = await supabase
        .from('giveaways')
        .update({ status: 'claimed', winner_id: userId })
        .match({ id: giveawayId, status: 'active' })
        .select()
        .maybeSingle();

      if (updateError || !updatedGiveaway) {
        console.error('[Claim] Update failed:', updateError?.message);
        return res.status(409).json({ error: 'ALREADY_CLAIMED: Alguém foi mais rápido!' });
      }

      // Update winner profile
      await supabase.from('users')
        .update({ last_win_at: new Date().toISOString(), skip_remaining: 3, failed_attempts: 0 })
        .eq('id', userId);
      
      // 4. Update Rounds: Global decrement via RPC
      try {
        console.log(`[Rounds] Giveaway ${giveawayId} claimed! Decrementing via RPC...`);
        const { error: rpcErr } = await supabase.rpc('decrement_skip_counts', { winner_id_param: userId });
        if (rpcErr) throw rpcErr;
      } catch (roundErr: any) {
        console.error('[Rounds] RPC failed, using manual fallback:', roundErr.message);
        const { data: others } = await supabase
          .from('users')
          .select('id, skip_remaining')
          .neq('id', userId)
          .gt('skip_remaining', 0);

        if (others && others.length > 0) {
          for (const otherUser of others) {
            await supabase.from('users')
              .update({ skip_remaining: Math.max(0, (otherUser.skip_remaining || 0) - 1) })
              .eq('id', otherUser.id);
          }
        }
      }

      res.json({ success: true, fullKey });

    } catch (error: any) {
      console.error('[Error] Claim process:', error.message);
      res.status(500).json({ error: 'Erro no processamento.' });
    }
  });

  // Admin: Create giveaway
  app.post('/api/admin/giveaways', adminAuth, async (req, res) => {
    const { title, fullKey, puzzleHint, hiddenPositions, platform } = req.body;

    try {
      const id = uuidv4();
      const { data, error } = await supabase
        .from('giveaways')
        .insert({
          id,
          title,
          full_key: fullKey,
          puzzle_hint: puzzleHint,
          hidden_positions: hiddenPositions || [],
          status: 'active',
          platform: platform || 'Steam',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      console.error('[Error] Creating giveaway:', err.message);
      res.status(500).json({ error: 'Erro ao criar sorteio na Supabase.' });
    }
  });

  // Admin: Delete giveaway
  app.delete('/api/admin/giveaways/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    console.log(`[Admin] Attempting to delete giveaway: ${id}`);

    try {
      const { error } = await supabase.from('giveaways').delete().eq('id', id);
      if (error) {
        console.error('[Supabase] Delete error:', error.message);
        throw error;
      }
      console.log(`[Admin] Successfully deleted giveaway: ${id}`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Erro ao eliminar da base de dados.' });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    console.log(`[Server] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      // If it's an API route, let it pass (though API routes are defined above)
      if (req.url.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('[Server] Initializing Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    
    // Explicitly handle root and SPA fallback for dev
    app.get('*', async (req, res, next) => {
      if (req.url.startsWith('/api')) return next();
      try {
        const url = req.originalUrl;
        const template = await vite.transformIndexHtml(url, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SteamKeyQuest</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('NOTE: Ensure you have created "giveaways" and "users" tables in your Supabase project.');
  });
}

startServer();

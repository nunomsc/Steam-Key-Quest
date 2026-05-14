import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Secrets.');
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
  const PORT = 3000;

  console.log(`[Server] Starting in ${process.env.NODE_ENV || 'development'} mode (Supabase Edition)`);

  app.use(express.json());

  // Request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  app.get('/api/health', async (req, res) => {
    try {
      const { count: gCount, error: gError } = await supabase.from('giveaways').select('*', { count: 'exact', head: true });
      const { count: uCount, error: uError } = await supabase.from('users').select('*', { count: 'exact', head: true });

      if (gError || uError) throw gError || uError;

      res.json({ 
        status: 'ok', 
        engine: 'supabase',
        stats: { 
          giveaways: gCount, 
          users: uCount 
        } 
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Admin: Verify password
  app.post('/api/admin/verify', (req, res) => {
    const password = req.headers['x-admin-password'] || req.body.password;
    const correctPassword = process.env.ADMIN_PASSWORD;
    
    if (!correctPassword) {
      console.error('[Error] ADMIN_PASSWORD environment variable is not set!');
      return res.status(500).json({ error: 'Erro de Configuração: Defina ADMIN_PASSWORD nos Secrets do AI Studio.' });
    }
    
    if (password === correctPassword) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Incorreta' });
    }
  });

  // Public: Get giveaways
  app.get('/api/giveaways', async (req, res) => {
    try {
      // Try ordering by created_at, then fallback to id
      let query = supabase.from('giveaways').select('*');
      
      const { data: rows, error } = await query.order('created_at', { ascending: false });
      
      let finalRows = rows;
      if (error) {
        console.warn('[Supabase] created_at order failed, falling back to id order:', error.message);
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from('giveaways')
          .select('*')
          .order('id', { ascending: false });
        
        if (fallbackError) throw fallbackError;
        finalRows = fallbackRows;
      }

      const masked = (finalRows || []).map(g => {
        const hiddenPositions = g.hiddenPositions || g.hidden_positions || [];
        const fullKey = g.fullKey || g.full_key || '';
        let maskedKey = fullKey.split('');
        hiddenPositions.forEach((pos: number) => {
          if (pos < maskedKey.length) maskedKey[pos] = '_';
        });
        
        return {
          id: g.id,
          title: g.title,
          puzzleHint: g.puzzleHint || g.puzzle_hint,
          platform: g.platform || 'Steam',
          maskedKey: maskedKey.join(''),
          status: g.status,
          createdAt: g.created_at || g.createdAt || Date.now(),
          winnerId: g.status === 'claimed' ? (g.winnerId || g.winner_id) : null
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
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (!user) return res.json({ eligible: true, skipRemaining: 0 });
      const skipCount = user.skipRemaining !== undefined ? user.skipRemaining : (user.skip_remaining !== undefined ? user.skip_remaining : 0);
      res.json({ eligible: skipCount === 0, skipRemaining: skipCount });
    } catch (error: any) {
      console.error('[Error] Eligibility check:', error.message);
      res.status(500).json({ error: 'Erro de elegibilidade' });
    }
  });

  // Public: Claim a key
  app.post('/api/claim', async (req, res) => {
    const { giveawayId, userId, puzzleSolutions } = req.body;
    if (!giveawayId || !userId) return res.status(400).json({ error: 'Faltam parâmetros' });

    try {
      // 1. Fetch Giveaway
      const { data: giveaway, error: gError } = await supabase
        .from('giveaways')
        .select('*')
        .eq('id', giveawayId)
        .single();

      if (gError || !giveaway) return res.status(404).json({ error: 'Sorteio não encontrado' });
      if (giveaway.status === 'claimed') return res.status(409).json({ error: 'Já foi resgatado!' });

      // 2. Fetch or Create User
      let { data: user, error: uError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!user) {
        console.log('[Supabase] User not found, creating:', userId);
        // Try camelCase first for users table
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({ id: userId, lastWinIndex: 0, skipRemaining: 0, failedAttempts: 0 })
          .select()
          .maybeSingle();
        
        if (createError) {
          console.warn('[Supabase] camelCase insert failed, trying snake_case:', createError.message);
          // Fallback to snake_case for users table
          const { data: snakeUser, error: snakeError } = await supabase
            .from('users')
            .insert({ id: userId, last_win_at: 0, skip_remaining: 0, failed_attempts: 0 })
            .select()
            .maybeSingle();
          if (snakeError) {
            console.error('[Supabase] snake_case insert ALSO failed:', snakeError.message);
            throw snakeError;
          }
          user = snakeUser;
        } else {
          user = newUser;
        }
      }

      if (!user) {
        // One more check in case it was created between calls
        const { data: checkUser } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
        user = checkUser;
      }

      if (!user) throw new Error('Não foi possível identificar ou criar o utilizador.');

      const skipCount = user.skipRemaining !== undefined ? user.skipRemaining : (user.skip_remaining !== undefined ? user.skip_remaining : 0);
      if (skipCount > 0) return res.status(403).json({ error: `COOLDOWN: Aguarde mais ${skipCount} rounts.` });

      const hiddenPositions = giveaway.hiddenPositions || giveaway.hidden_positions || [];
      const fullKey = giveaway.fullKey || giveaway.full_key || '';
      const actualSolution = hiddenPositions
        .map((pos: number) => fullKey[pos])
        .join('')
        .toLowerCase();
      
      const userSolution = (puzzleSolutions || '').toString().toLowerCase().trim();

      if (userSolution !== actualSolution) {
        const currentFailed = user.failedAttempts !== undefined ? user.failedAttempts : (user.failed_attempts !== undefined ? user.failed_attempts : 0);
        const newFailed = currentFailed + 1;
        
        const updateObj = user.failedAttempts !== undefined ? 
          (newFailed >= 3 ? { skipRemaining: 1, failedAttempts: 0 } : { failedAttempts: newFailed }) :
          (newFailed >= 3 ? { skip_remaining: 1, failed_attempts: 0 } : { failed_attempts: newFailed });

        await supabase.from('users').update(updateObj).eq('id', userId);
        
        if (newFailed >= 3) {
          return res.status(400).json({ error: 'BRUTE_FORCE: Demasiadas tentativas FALHADAS. Cooldown de 1 drop.', attempts: 3 });
        }
        return res.status(400).json({ error: 'Solução incorreta!', attempts: newFailed });
      }

      // 3. ATOMIC SUCCESS
      const claimUpdate: any = { status: 'claimed' };
      
      // Determine winner field name - we'll try to find which one exists in the giveaway object
      // or just try snake_case as primary fallback since winnerId failed.
      const winnerField = ('winner_id' in giveaway) ? 'winner_id' : 'winnerId';
      claimUpdate[winnerField] = userId;

      const { data: updatedGiveaway, error: updateError } = await supabase
        .from('giveaways')
        .update(claimUpdate)
        .match({ id: giveawayId, status: 'active' })
        .select()
        .maybeSingle();

      if (updateError || !updatedGiveaway) {
        console.error('[Claim] Update failed:', updateError?.message);
        // If it's a column error, try the other one
        if (updateError?.message.includes('column')) {
           const fallbackWinnerField = winnerField === 'winner_id' ? 'winnerId' : 'winner_id';
           const fallbackUpdate: any = { status: 'claimed' };
           fallbackUpdate[fallbackWinnerField] = userId;
           
           const { data: retryUpdate, error: retryError } = await supabase
            .from('giveaways')
            .update(fallbackUpdate)
            .match({ id: giveawayId, status: 'active' })
            .select()
            .maybeSingle();
           
           if (retryError || !retryUpdate) {
             return res.status(409).json({ error: 'ALREADY_CLAIMED: Alguém foi mais rápido!' });
           }
        } else {
          return res.status(409).json({ error: 'ALREADY_CLAIMED: Alguém foi mais rápido!' });
        }
      }

      // Update winner profile
      const now = new Date().toISOString();
      const winnerUpdateObj = user.lastWinIndex !== undefined ? 
        { lastWinIndex: Date.now(), skipRemaining: 3, failedAttempts: 0 } : 
        { last_win_at: now, skip_remaining: 3, failed_attempts: 0 };

      const { error: winUpdateError } = await supabase.from('users')
        .update(winnerUpdateObj)
        .eq('id', userId);
      
      if (winUpdateError) {
        console.error('[Claim] User win update failed:', winUpdateError.message);
      }
      
      // Optional RPC for mass updates - keep in try/catch to avoid breaking everything if not implemented
      try {
        await supabase.rpc('decrement_skip_counts', { winner_id_param: userId });
      } catch (rpcErr) {
        console.warn('[Supabase] RPC decrement_skip_counts failed (optional):', rpcErr);
      }

      res.json({ success: true, fullKey });

    } catch (error: any) {
      console.error('[Error] Claim process:', error.message);
      res.status(500).json({ error: 'Erro interno ao processar resgate.' });
    }
  });

  // Admin: Create giveaway
  app.post('/api/admin/giveaways', async (req, res) => {
    const password = req.headers['x-admin-password'] || req.body.password;
    const { title, fullKey, puzzleHint, hiddenPositions, platform } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const id = uuidv4();
      
      const { data, error } = await supabase
        .from('giveaways')
        .insert({
          id,
          title,
          fullKey,
          puzzleHint,
          hiddenPositions: hiddenPositions || [],
          status: 'active',
          platform: platform || 'Steam',
          createdAt: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        // Fallback to snake_case if camelCase fails
        if (error.message.includes('column') || error.message.includes('not found')) {
           const { data: retryData, error: retryError } = await supabase
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
           if (retryError) throw retryError;
           return res.json(retryData);
        }
        throw error;
      }
      res.json(data);
    } catch (err: any) {
      console.error('[Error] Creating giveaway:', err.message);
      res.status(500).json({ error: 'Error' });
    }
  });

  // Admin: Delete giveaway
  app.delete('/api/admin/giveaways/:id', async (req, res) => {
    const password = req.headers['x-admin-password'] as string;
    const { id } = req.params;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { error } = await supabase.from('giveaways').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Error' });
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

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Key, 
  Puzzle, 
  Settings, 
  Plus, 
  Trash2, 
  Gamepad2, 
  Clock, 
  CheckCircle2, 
  Lock,
  ArrowLeft,
  Eye,
  EyeOff,
  Share2,
  Copy,
  Check
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Giveaway, EligibilityResponse, ClaimResponse } from './types';

// Browser ID setup
const getBrowserId = () => {
  let id = localStorage.getItem('steam_giveaway_browser_id');
  if (!id) {
    id = uuidv4();
    localStorage.setItem('steam_giveaway_browser_id', id);
  }
  return id;
};

const getFingerprint = () => {
  const n = navigator;
  const s = window.screen;
  const str = [
    n.userAgent,
    n.language,
    s.colorDepth,
    s.width + 'x' + s.height,
    new Date().getTimezoneOffset(),
    n.hardwareConcurrency
  ].join('|');
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'fp_' + Math.abs(hash).toString(16);
};

export default function App() {
  const [view, setView] = useState<'home' | 'puzzle' | 'admin'>('home');
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [selectedGiveaway, setSelectedGiveaway] = useState<Giveaway | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
  const [adminPassword, setAdminPassword] = useState(localStorage.getItem('admin_password') || '');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [fullKeyResult, setFullKeyResult] = useState<string | null>(null);
  const [puzzleInput, setPuzzleInput] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const userId = getBrowserId();

  // Admin Form State
  const [newGiveaway, setNewGiveaway] = useState({
    title: '',
    fullKey: '',
    puzzleHint: '',
    hiddenIndicesText: '',
    platform: 'Steam'
  });

  const fetchGiveaways = async () => {
    try {
      const res = await fetch('/api/giveaways');
      
      const contentType = res.headers.get("content-type");
      if (!res.ok || !contentType || contentType.indexOf("application/json") === -1) {
        const text = await res.text();
        console.error('Fetch failed or returned non-JSON:', res.status, text);
        // If it's a 404, the server probably didn't handle the route
        if (res.status === 404) {
          console.warn('API endpoint not found (404). Checking server state...');
        }
        return;
      }

      const data = await res.json();
      
      if (Array.isArray(data)) {
        setGiveaways(data);
        // Update selected giveaway if it's in detailed view
        if (selectedGiveaway) {
          const updated = data.find((g: Giveaway) => g.id === selectedGiveaway.id);
          if (updated) setSelectedGiveaway(updated);
        }
      } else {
        console.error('Invalid giveaways response:', data);
        setGiveaways([]);
        if (data.error) {
          setStatusMsg({ type: 'error', text: data.error });
        }
      }
    } catch (e) {
      console.error('Error fetching giveaways', e);
      setGiveaways([]);
    }
  };

  const checkEligibility = async () => {
    const fingerprint = getFingerprint();
    try {
      const res = await fetch(`/api/eligibility/${userId}?fp=${fingerprint}`);
      const data = await res.json();
      setEligibility(data);
    } catch (e) {
      console.error('Error checking eligibility', e);
    }
  };

  useEffect(() => {
    fetchGiveaways();
    checkEligibility();
    const interval = setInterval(fetchGiveaways, 3000); // Polling for real-time feel
    return () => clearInterval(interval);
  }, [userId]);

  const handleClaim = async (giveawayId: string) => {
    if (!eligibility?.eligible) return;
    
    setIsLoading(true);
    const fingerprint = getFingerprint();
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          giveawayId, 
          userId, 
          puzzleSolutions: puzzleInput,
          fingerprint
        })
      });
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data: ClaimResponse = await res.json();
        if (data.success && data.fullKey) {
          setFullKeyResult(data.fullKey);
          setPuzzleInput('');
          setStatusMsg({ type: 'success', text: 'Key decrypted successfully!' });
          fetchGiveaways();
          checkEligibility();
        } else {
          setStatusMsg({ type: 'error', text: data.error || 'Error claiming key.' });
        }
      } else {
        const text = await res.text();
        console.error('Server returned non-JSON response:', text);
        setStatusMsg({ type: 'error', text: 'The server did not return a valid response.' });
      }
    } catch (e: any) {
      console.error('Claim error', e);
      setStatusMsg({ type: 'error', text: 'Network error: Could not communicate with the server.' });
    } finally {
      setIsLoading(false);
      fetchGiveaways();
      checkEligibility();
      // Auto-clear messages after a few seconds
      setTimeout(() => setStatusMsg(prev => prev?.type === 'success' || prev?.type === 'error' ? null : prev), 5000);
    }
  };

  const handleShare = async (e: React.MouseEvent, g: Giveaway) => {
    e.stopPropagation();
    let shareUrl = window.location.origin + window.location.pathname;
    
    // AI Studio Fix: If we are in the development environment, change the link to the share version (pre)
    if (shareUrl.includes('ais-dev-')) {
      shareUrl = shareUrl.replace('ais-dev-', 'ais-pre-');
    }

    const text = `🕵️‍♂️ Solve the puzzle for "${g.title}" and win the game key before anyone else! #SteamKeyQuest`;
    
    // Attempt navigator.share first
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SteamKeyQuest',
          text: text,
          url: shareUrl,
        });
        return; // Success
      } catch (err) {
        console.log('Share failed, failing back to clipboard:', err);
      }
    }
    
    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      setStatusMsg({ type: 'success', text: 'Share link copied!' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      console.error('Clipboard failed:', err);
      alert('Could not share or copy. Try copying the browser\'s URL.');
    }
  };

  const handleCopyKey = () => {
    if (fullKeyResult) {
      navigator.clipboard.writeText(fullKeyResult);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleCreateGiveaway = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const hiddenPositions = newGiveaway.hiddenIndicesText
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n));

    try {
      const res = await fetch('/api/admin/giveaways', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({
          title: newGiveaway.title,
          fullKey: newGiveaway.fullKey,
          puzzleHint: newGiveaway.puzzleHint,
          hiddenPositions,
          platform: newGiveaway.platform
        })
      });
      
      const data = await res.json();

      if (res.ok) {
        setNewGiveaway({ title: '', fullKey: '', puzzleHint: '', hiddenIndicesText: '', platform: 'Steam' });
        setStatusMsg({ type: 'success', text: 'Giveaway successfully posted!' });
        fetchGiveaways();
        localStorage.setItem('admin_password', adminPassword);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Authentication or data error.' });
      }
    } catch (e) {
      console.error('Create error', e);
      setStatusMsg({ type: 'error', text: 'Network or server error.' });
    } finally {
      setIsLoading(false);
      // Auto-clear success message after 5s
      setTimeout(() => setStatusMsg(prev => prev?.type === 'success' ? null : prev), 5000);
    }
  };

  const handleDeleteGiveaway = async (id: string) => {
    if (!confirm('Are you sure you want to delete this giveaway?')) return;
    try {
      const res = await fetch(`/api/admin/giveaways/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword }
      });
      
      if (res.ok) {
        fetchGiveaways();
      } else {
        const data = await res.json();
        alert(`Error deleting: ${data.error || res.statusText}`);
      }
    } catch (e) {
      console.error('Delete error', e);
      alert('Network error trying to delete.');
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-[#e2e8f0] font-sans selection:bg-cyan-500/30">
      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="fixed top-20 left-1/2 z-[100] pointer-events-none"
          >
            <div className={`px-4 py-2 rounded-full border shadow-lg backdrop-blur-md text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
              statusMsg.type === 'success' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
            }`}>
              {statusMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {statusMsg.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-900/10 blur-[120px] rounded-full" />
      </div>

      {/* Navigation */}
      <header className="relative z-10 border-b border-white/5 bg-slate-950/50 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between h-16">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => { setView('home'); setSelectedGiveaway(null); setFullKeyResult(null); }}
          >
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center rotate-45 group-hover:scale-110 transition-transform">
              <div className="-rotate-45 text-black font-bold">S</div>
            </div>
            <h1 className="text-xl font-bold tracking-tighter text-white uppercase">Steam<span className="text-cyan-400">Quest</span></h1>
          </div>

          <div className="flex items-center gap-4">
            {eligibility && !eligibility.eligible && (
              <div className="hidden md:flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-full text-[10px] font-bold text-cyan-500 uppercase tracking-widest">
                <Clock className="w-3.5 h-3.5" />
                <span>COOLDOWN: {eligibility.skipRemaining} ROUNDS</span>
              </div>
            )}
            <button 
              onClick={() => setView(view === 'admin' ? 'home' : 'admin')}
              className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white"
              title="Administration"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h2 className="text-4xl font-black text-white tracking-tighter sm:text-5xl uppercase neon-text">GIVEAWAY <span className="text-cyan-400 font-black">VAULT</span></h2>
                  <p className="mt-4 text-slate-400 max-w-md text-sm font-medium">Decode the puzzles, secure the fragment, and claim absolute victory. The fastest hunter wins the key.</p>
                </div>
                {eligibility && !eligibility.eligible && (
                  <div className="md:hidden flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-xl text-[10px] font-bold text-cyan-500 uppercase tracking-widest">
                    <Clock className="w-4 h-4" />
                    <span>Locked: {eligibility.skipRemaining} Drops</span>
                  </div>
                )}
              </div>

              {giveaways.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 glass-panel rounded-3xl">
                  <Puzzle className="w-16 h-16 text-slate-700 mb-4" />
                  <p className="text-slate-400 font-bold uppercase tracking-widest">Vault is currently empty</p>
                  <p className="text-slate-600 text-[10px] mt-2 font-bold uppercase tracking-[0.2em]">Next drop incoming shortly</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {giveaways.map((g) => (
                    <motion.div 
                      key={g.id}
                      whileHover={{ y: -4, scale: 1.01 }}
                      onClick={() => { setSelectedGiveaway(g); setView('puzzle'); setFullKeyResult(null); }}
                      className={`group relative overflow-hidden rounded-2xl glass-panel transition-all cursor-pointer ${
                        g.status === 'claimed' ? 'opacity-60 grayscale' : 'hover:border-cyan-500/40'
                      }`}
                    >
                      {g.status === 'claimed' && (
                        <div className="absolute top-4 right-4 z-20 bg-slate-900/80 border border-slate-700 px-3 py-1 rounded flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                          <Lock className="w-3 h-3" />
                          <span>Secured</span>
                        </div>
                      )}
                      
                      <div className="p-8 space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1 text-left w-full">
                            <div className="flex items-center justify-between w-full">
                              <p className="text-[10px] uppercase text-cyan-400 font-black tracking-[0.3em]">{g.platform || 'Steam'}</p>
                              <button 
                                onClick={(e) => handleShare(e, g)}
                                className="p-2 bg-white/5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-white/10 transition-all ml-auto"
                                title="Share"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            </div>
                            <h3 className="text-xl font-bold text-white transition-colors uppercase tracking-tight group-hover:text-cyan-300">{g.title}</h3>
                          </div>
                        </div>

                        <div className="flex gap-1 justify-center relative overflow-hidden rounded-lg bg-black/80 py-2 px-4 border border-white/5 group-hover:border-cyan-500/30 transition-all">
                          {/* Proper Backdrop Blur Layer - Reduced blur (50% of previous) */}
                          <div className="absolute inset-0 z-10 backdrop-blur-[4px] bg-black/40 select-none pointer-events-none group-hover:backdrop-blur-[8px] transition-all duration-500"></div>
                          
                          {/* Hacker/Scan Animation */}
                          <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none opacity-30">
                            <div className="w-full h-[2px] bg-cyan-400/50 blur-[1px] absolute animate-[scan_2s_linear_infinite]"></div>
                          </div>

                          <div className="flex gap-1 relative z-0">
                            {g.maskedKey.split('').map((char, i) => (
                              <div key={i} className={`flex items-center justify-center w-6 h-8 rounded border border-white/10 bg-white/[0.02] text-xs font-mono font-bold ${char === '_' ? 'text-cyan-400' : 'text-white/70'}`}>
                                {char === '_' ? '?' : char}
                              </div>
                            ))}
                          </div>

                          {g.status === 'active' && (
                            <div className="absolute inset-0 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-cyan-500 text-black px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(6,182,212,0.6)] scale-90 group-hover:scale-100 transition-transform">
                                DECRYPT CLUE
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/5 pt-6">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Hunt</span>
                          </div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {g.status === 'claimed' ? 'Winner ID: ' + g.winnerId?.substring(0, 4) : 'Solving...'}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'puzzle' && selectedGiveaway && (
            <motion.div 
              key="puzzle"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-3xl mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <button 
                  onClick={() => { setView('home'); setSelectedGiveaway(null); setFullKeyResult(null); setPuzzleInput(''); }}
                  className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors font-bold uppercase tracking-widest text-[10px] w-[110px]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Vault
                </button>
                <button 
                  onClick={(e) => handleShare(e, selectedGiveaway)}
                  className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors font-bold uppercase tracking-widest text-[10px]"
                >
                  <Share2 className="w-4 h-4" />
                  Share Quest
                </button>
              </div>

              <div className="glass-panel rounded-[2rem] p-8 md:p-12 space-y-10 relative overflow-hidden">
                <div className="text-center space-y-4">
                  <h2 className="text-slate-400 uppercase text-[10px] font-black tracking-[0.4em] mb-2">Decryption Session</h2>
                  <h2 className="text-4xl font-black text-white uppercase tracking-tighter neon-text">{selectedGiveaway.title}</h2>
                  <div className="max-w-xl mx-auto p-6 bg-slate-900/40 border border-slate-800 rounded-xl">
                    <p className="text-sm text-slate-300 italic leading-relaxed font-serif">
                      "{selectedGiveaway.puzzleHint}"
                    </p>
                  </div>
                </div>

                <div className="space-y-12">
                  <div className="flex flex-col items-center gap-8">
                    <div className="relative overflow-hidden rounded-xl bg-black/60 p-6 border border-white/5 mx-auto">
                      {/* Reduced Blur Layer - only visible when not claimed yet */}
                      {!fullKeyResult && (
                        <div className="absolute inset-0 z-10 backdrop-blur-[4px] bg-black/40 select-none pointer-events-none"></div>
                      )}
                      
                      <div 
                        className={`flex flex-wrap gap-2 justify-center relative z-0 ${fullKeyResult ? 'cursor-pointer' : ''}`}
                        onClick={fullKeyResult ? handleCopyKey : undefined}
                      >
                         {(fullKeyResult || selectedGiveaway.maskedKey).split('').map((char, i) => (
                            <div key={i} className={`flex items-center justify-center w-12 h-16 key-slot text-2xl font-bold ${char === '_' || char === '?' ? 'text-cyan-400' : (fullKeyResult ? 'text-cyan-300 winner-pulse shadow-cyan-500/20 border-cyan-500/50' : 'text-white')}`}>
                              {char === '_' ? '?' : char}
                            </div>
                         ))}
                      </div>
                    </div>

                    {!fullKeyResult && (
                      <div className="w-full max-w-md py-6 space-y-8">
                        {selectedGiveaway.status === 'claimed' ? (
                          <div className="bg-red-500/5 border border-red-900/30 p-8 rounded-2xl text-center space-y-2">
                            <Lock className="w-8 h-8 text-red-500 mx-auto mb-2" />
                            <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.3em]">Access Denied</p>
                            <p className="text-slate-500 text-xs font-bold">Key has been successfully extracted by another hunter.</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-6">
                            <div className="w-full space-y-3">
                              <label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 block text-center">Enter Missing Fragment</label>
                              <input 
                                type="text"
                                value={puzzleInput}
                                onChange={(e) => setPuzzleInput(e.target.value.toUpperCase())}
                                placeholder="E.g. A4B7"
                                className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500/50 rounded-xl px-6 py-4 text-center text-xl font-mono font-black tracking-[0.3em] text-white placeholder:text-slate-700 outline-none transition-all"
                              />
                            </div>

                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              disabled={isLoading || !eligibility?.eligible || !puzzleInput}
                              onClick={() => handleClaim(selectedGiveaway.id)}
                              className={`group relative overflow-hidden w-full py-5 rounded-xl font-black text-sm uppercase tracking-[0.3em] transition-all ${
                                !eligibility?.eligible || !puzzleInput
                                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed grayscale' 
                                  : 'winner-pulse bg-cyan-600 text-black shadow-lg shadow-cyan-500/20 hover:bg-cyan-500'
                              }`}
                            >
                              <div className="relative z-10 flex items-center justify-center gap-3">
                                <Key className="w-5 h-5 flex-shrink-0" />
                                <span>{isLoading ? 'Decrypting...' : 'Extract & Verify'}</span>
                              </div>
                            </motion.button>
                            
                            {!eligibility?.eligible ? (
                              <p className="text-cyan-500 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                                COOLDOWN ACTIVE: {eligibility?.skipRemaining} ROUNDS REMAINING
                              </p>
                            ) : (
                              <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">
                                Warning: Single-use claim mechanism enabled
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {fullKeyResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-cyan-500/5 border border-cyan-500/20 p-10 rounded-3xl text-center space-y-6 max-w-sm winner-pulse"
                      >
                        <Trophy className="w-12 h-12 text-cyan-400 mx-auto" />
                        <div className="space-y-1">
                          <h4 className="text-cyan-400 font-black text-xl uppercase tracking-tighter">Extraction Success</h4>
                          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Vault Secured. Transfer the key to Steam.</p>
                        </div>
                        
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleCopyKey}
                          className="w-full flex items-center justify-center gap-2 bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-4 h-4" />
                              Key Copied to Clipboard
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Copy Steam Key
                            </>
                          )}
                        </motion.button>

                        <div className="pt-6 border-t border-cyan-500/10 space-y-4">
                           <div className="flex items-center justify-center gap-2 text-cyan-500 text-[10px] font-black uppercase tracking-[0.2em]">
                             <Clock className="w-3.5 h-3.5" />
                             Anti-Scrape Cooldown Engaged
                           </div>
                           <p className="text-slate-500 text-[9px] uppercase font-bold tracking-widest leading-loose">
                             You have been soft-locked for the next 3 drops to ensure global parity.
                           </p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-12"
            >
              <div className="flex items-center justify-between">
                 <h2 className="text-3xl font-black text-white uppercase tracking-tight italic">Root<span className="text-cyan-500">Access</span></h2>
                 <div className="flex gap-2">
                   <button 
                    onClick={() => setShowAdminLogin(!showAdminLogin)}
                    className="bg-slate-900 px-4 py-2 rounded border border-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors w-[110px]"
                  >
                    {showAdminLogin ? <EyeOff className="w-4 h-4 mr-2 inline" /> : <Eye className="w-4 h-4 mr-2 inline" />}
                    {showAdminLogin ? 'Mask Console' : 'Reveal Console'}
                  </button>
                  <button 
                    onClick={() => {
                      if(confirm('Terminar sessão de administrador?')) {
                        localStorage.removeItem('admin_password');
                        setAdminPassword('');
                        setShowAdminLogin(true);
                      }
                    }}
                    className="bg-red-950/20 px-4 py-2 rounded border border-red-900/50 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-900/40 transition-colors"
                  >
                    Flush Session
                  </button>
                 </div>
              </div>

              {showAdminLogin && (
                <div className="glass-panel rounded-2xl p-8 space-y-6 border-cyan-500/20">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Administrator Credentials</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500" />
                      <input 
                        type="password" 
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="AUTHENTICATION TOKEN..."
                        className="w-full bg-black/60 border border-slate-800 rounded px-12 py-4 focus:outline-none focus:border-cyan-500/50 transition-all text-sm font-mono text-cyan-400 uppercase tracking-widest"
                      />
                      <button 
                        onClick={async () => {
                          const res = await fetch('/api/admin/verify', {
                            method: 'POST',
                            headers: { 
                              'Content-Type': 'application/json',
                              'x-admin-password': adminPassword
                            }
                          });
                          if (res.ok) {
                            alert('✅ Password Correct!');
                            localStorage.setItem('admin_password', adminPassword);
                          } else {
                            const data = await res.json();
                            alert('❌ Error: ' + (data.error || 'Incorrect Password'));
                          }
                        }}
                        className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-widest rounded transition-all"
                      >
                        Check Token Integrity
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-panel rounded-[2rem] p-8 space-y-8 h-fit">
                   <div className="flex items-center gap-3">
                     <Plus className="w-5 h-5 text-cyan-500" />
                     <h3 className="font-black text-sm uppercase tracking-[0.3em] text-white">Initialize Giveaway</h3>
                   </div>

                   <form onSubmit={handleCreateGiveaway} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Entity Title</label>
                        <input 
                          required
                          value={newGiveaway.title}
                          onChange={e => setNewGiveaway({...newGiveaway, title: e.target.value})}
                          placeholder="TITEL_ID..."
                          className="w-full bg-black/40 border border-slate-800 rounded py-3 px-4 focus:outline-none focus:border-cyan-500 transition-all text-sm text-slate-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Master Key</label>
                        <input 
                          required
                          value={newGiveaway.fullKey}
                          onChange={e => setNewGiveaway({...newGiveaway, fullKey: e.target.value})}
                          placeholder="XXXXX-XXXXX-XXXXX"
                          className="w-full bg-black/40 border border-slate-800 rounded py-3 px-4 focus:outline-none focus:border-cyan-500 transition-all text-sm font-mono text-cyan-400 uppercase"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Platform</label>
                        <select 
                          value={newGiveaway.platform}
                          onChange={e => setNewGiveaway({...newGiveaway, platform: e.target.value})}
                          className="w-full bg-black/40 border border-slate-800 rounded py-3 px-4 focus:outline-none focus:border-cyan-500 transition-all text-sm text-slate-200 cursor-pointer"
                        >
                          <option value="Steam">Steam</option>
                          <option value="Epic Games">Epic Games</option>
                          <option value="GOG">GOG</option>
                          <option value="Origin">Origin</option>
                          <option value="Ubisoft">Ubisoft</option>
                          <option value="Playstation">Playstation</option>
                          <option value="Xbox">Xbox</option>
                          <option value="Windows">Windows</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Decryption Clue</label>
                        <textarea 
                          required
                          rows={3}
                          value={newGiveaway.puzzleHint}
                          onChange={e => setNewGiveaway({...newGiveaway, puzzleHint: e.target.value})}
                          placeholder="INPUT_HINT_ARRAY..."
                          className="w-full bg-black/40 border border-slate-800 rounded py-3 px-4 focus:outline-none focus:border-cyan-500 transition-all text-sm text-slate-300 italic"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mask Indices (Arr)</label>
                        <input 
                          required
                          value={newGiveaway.hiddenIndicesText}
                          onChange={e => setNewGiveaway({...newGiveaway, hiddenIndicesText: e.target.value})}
                          placeholder="0, 6, 12..."
                          className="w-full bg-black/40 border border-slate-800 rounded py-3 px-4 focus:outline-none focus:border-cyan-500 transition-all text-sm font-mono"
                        />
                        {newGiveaway.fullKey && (
                          <div className="mt-2 p-3 bg-cyan-500/5 border border-cyan-500/10 rounded flex flex-col gap-1">
                            <p className="text-[8px] font-black uppercase tracking-widest text-cyan-500/50">Live Mask Preview</p>
                            <p className="font-mono text-xs tracking-widest text-cyan-400">
                              {newGiveaway.fullKey.split('').map((char, index) => {
                                const indices = newGiveaway.hiddenIndicesText.split(',').map(s => parseInt(s.trim()));
                                return indices.includes(index) ? '_' : char;
                              }).join('')}
                            </p>
                            <p className="text-[8px] text-slate-600 italic mt-1">* Hyphens (-) also occupy a position in the index count.</p>
                          </div>
                        )}
                      </div>

                      {view === 'admin' && statusMsg && statusMsg.type === 'error' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="p-3 rounded text-[10px] font-bold uppercase tracking-widest bg-red-500/10 text-red-500 border border-red-500/20"
                        >
                          ⚠ {statusMsg.text}
                        </motion.div>
                      )}

                      <button 
                        type="submit"
                        disabled={isLoading}
                        className={`w-full font-black py-4 rounded uppercase tracking-[0.3em] text-xs transition-all active:scale-[0.98] winner-pulse flex items-center justify-center gap-2 ${
                          isLoading ? 'bg-slate-700 text-slate-400 cursor-wait' : 'bg-cyan-600 hover:bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                        }`}
                      >
                        {isLoading ? (
                          <>
                            <Clock className="w-4 h-4 animate-spin" />
                            Transmitting...
                          </>
                        ) : (
                          'Transmit Giveaway'
                        )}
                      </button>
                   </form>
                </div>

                <div className="space-y-6">
                   <div className="glass-panel p-6 rounded-2xl flex items-center justify-between border-cyan-900/30">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">System Inventory</p>
                        <p className="text-2xl font-black text-cyan-400 font-mono tracking-tighter">{giveaways.length}</p>
                      </div>
                      <div className="h-10 w-[1px] bg-white/5" />
                      <div className="space-y-1 text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Successful Extraction</p>
                        <p className="text-2xl font-black text-slate-300 font-mono tracking-tighter">{giveaways.filter(g => g.status === 'claimed').length}</p>
                      </div>
                   </div>

                   <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-[400px]">
                      <div className="p-6 border-b border-white/5 bg-slate-900/40">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Activity Log</h4>
                      </div>
                      <div className="divide-y divide-white/5 overflow-y-auto">
                        {giveaways.length === 0 ? (
                          <p className="p-12 text-center text-slate-600 font-bold uppercase tracking-[0.2em] text-[10px]">Log empty</p>
                        ) : (
                          giveaways.map(g => (
                            <div key={g.id} className="p-6 flex items-center justify-between group hover:bg-white/[0.02]">
                              <div className="space-y-0.5">
                                <p className="font-bold text-slate-200 group-hover:text-cyan-400 transition-colors uppercase text-xs tracking-tight">{g.title}</p>
                                <p className="text-[9px] font-mono text-slate-700">PLATFORM: {g.platform || 'Steam'}</p>
                                <p className="text-[9px] font-mono text-slate-700">HASH: {g.id.substring(0, 12)}</p>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                                  g.status === 'claimed' 
                                    ? 'bg-slate-900 text-slate-600 border-slate-800' 
                                    : 'bg-cyan-900/20 text-cyan-500 border-cyan-800/50'
                                }`}>
                                  {g.status === 'claimed' ? 'Archived' : 'Live'}
                                </span>
                                <button 
                                  onClick={() => handleDeleteGiveaway(g.id)}
                                  className="p-2 text-slate-700 hover:text-red-500 transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                   </div>

                   <div className="glass-panel p-4 rounded-xl border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                         <span className="text-[8px] font-black uppercase text-slate-600 tracking-widest">Server Ping</span>
                         <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                            <span className="text-[8px] font-bold text-cyan-500 uppercase">Linked</span>
                         </div>
                      </div>
                      <p className="text-[7px] font-mono text-slate-700 leading-none">ENDP: /api/admin/giveaways</p>
                      <p className="text-[7px] font-mono text-slate-700 leading-none">AUTH: {adminPassword ? 'Token Encrypted' : 'Missing Token'}</p>
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="relative z-10 max-w-6xl mx-auto px-6 py-12 border-t border-white/5 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 opacity-30 grayscale hover:grayscale-0 transition-all">
           <div className="flex items-center gap-10">
              <span className="text-[9px] font-black uppercase tracking-[0.6em] text-cyan-500">OS_TERMINAL</span>
              <span className="text-[9px] font-black uppercase tracking-[0.6em]">SYSTEM_V2.4</span>
              <span className="text-[9px] font-black uppercase tracking-[0.6em]">VAULT_ACTIVE</span>
           </div>
           <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Encrypted transmission © 2026</p>
        </div>
      </footer>
    </div>
  );
}

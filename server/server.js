import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { Manager, getEncodedToken } from 'coco-cashu-core';
import { SqliteRepositories } from 'coco-cashu-sqlite3';
import crypto from 'crypto';
import sqlite3 from 'sqlite3';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
  testMint: 'https://nofees.testnut.cashu.space',
  mainMint: 'https://mint.minibits.cash/Bitcoin',
  activeMode: process.env.ACTIVE_MODE || 'test',
  dbPath: '/app/data/wallet.db',
  puzzleReward: 10, // sats per puzzle solved
  rateLimitSeconds: 5, // seconds between solves per IP
};

// Load local puzzle database
const puzzlesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'easy_puzzles.json'), 'utf-8'));
console.log(`Loaded ${puzzlesData.length} puzzles from local database`);

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting for puzzle solving
const rateLimitMap = new Map(); // IP -> lastSolveTime

function checkRateLimit(ip) {
  const now = Date.now();
  const lastSolve = rateLimitMap.get(ip);
  const rateLimitMs = config.rateLimitSeconds * 1000;

  if (!lastSolve) {
    rateLimitMap.set(ip, now);
    return { allowed: true };
  }

  const timeSinceLastSolve = now - lastSolve;

  if (timeSinceLastSolve < rateLimitMs) {
    const secondsRemaining = Math.ceil((rateLimitMs - timeSinceLastSolve) / 1000);
    return {
      allowed: false,
      message: `⏳ Slow down! You can only solve 1 puzzle every ${config.rateLimitSeconds} seconds. Try again in ${secondsRemaining} second${secondsRemaining > 1 ? 's' : ''}.`
    };
  }

  // Rate limit passed
  rateLimitMap.set(ip, now);
  return { allowed: true };
}

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  const rateLimitMs = config.rateLimitSeconds * 1000;
  for (const [ip, lastSolve] of rateLimitMap.entries()) {
    if (now - lastSolve > rateLimitMs * 10) { // Keep for 10x the rate limit
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 60 * 1000);

const activeMint = config.activeMode === 'main' ? config.mainMint : config.testMint;

// Generate or load wallet seed (deterministic)
const seedGetter = async () => {
  // In production, load from secure storage. For now, derive from fixed seed
  const seedPhrase = process.env.WALLET_SEED || 'test-seed-for-development-only-change-in-production';
  return crypto.createHash('sha512').update(seedPhrase).digest();
};

// Initialize wallet
let manager;
async function initWallet() {
  console.log(`Initializing wallet with ${config.activeMode} mint: ${activeMint}`);

  // Create SQLite database
  const db = new sqlite3.Database(config.dbPath);

  const repos = new SqliteRepositories({ database: db });
  await repos.init(); // Initialize schema

  const logger = {
    debug: (...args) => console.log('[Wallet:debug]', ...args),
    info: (...args) => console.log('[Wallet]', ...args),
    warn: (...args) => console.warn('[Wallet]', ...args),
    error: (...args) => console.error('[Wallet]', ...args),
  };

  manager = new Manager(repos, seedGetter, logger);

  // Register both mints
  try {
    await manager.mint.addMint(config.testMint);
    console.log(`Registered test mint: ${config.testMint}`);
  } catch (err) {
    console.log(`Test mint already registered or error: ${err.message}`);
  }

  try {
    await manager.mint.addMint(config.mainMint);
    console.log(`Registered main mint: ${config.mainMint}`);
  } catch (err) {
    console.log(`Main mint already registered or error: ${err.message}`);
  }

  console.log('Wallet initialized successfully');
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ChessU Server', mode: config.activeMode, mint: activeMint });
});

// Get wallet balance
app.get('/api/balance', async (req, res) => {
  try {
    const balances = await manager.wallet.getBalances();
    res.json({
      balances,
      activeMode: config.activeMode,
      activeMint,
      total: balances[activeMint] || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a random puzzle from local database
app.get('/api/puzzle', async (req, res) => {
  try {
    const randomIndex = Math.floor(Math.random() * puzzlesData.length);
    const puzzle = puzzlesData[randomIndex];

    console.log('[Debug] Selected puzzle:', {
      id: puzzle.id,
      rating: puzzle.rating,
      fen: puzzle.fen
    });

    res.json({
      id: puzzle.id,
      fen: puzzle.fen,
      rating: puzzle.rating,
      solution: puzzle.solution,
      themes: puzzle.themes
    });
  } catch (err) {
    console.error('[Error] Failed to fetch puzzle:', err);
    res.status(500).json({ error: 'Failed to fetch puzzle: ' + err.message });
  }
});

// Receive Cashu tokens (for donations)
app.post('/api/receive', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Receive the token
    await manager.wallet.receive(token);

    // Get updated balance
    const balances = await manager.wallet.getBalances();
    const totalReceived = balances[activeMint] || 0;

    res.json({
      success: true,
      balance: totalReceived,
      message: 'Tokens received successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create donation (mint quote)
app.post('/api/donate', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'Amount must be at least 1 sat' });
    }

    const quote = await manager.quotes.createMintQuote(activeMint, amount);

    // Generate QR code for the payment request
    const qrCode = await QRCode.toDataURL(quote.request);

    res.json({
      quoteId: quote.quote,
      amount,
      paymentRequest: quote.request,
      qrCode,
      mint: activeMint,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check donation payment status
app.get('/api/donate/check/:quoteId', async (req, res) => {
  try {
    const { quoteId } = req.params;

    // Try to redeem the quote
    await manager.quotes.redeemMintQuote(activeMint, quoteId);

    const balances = await manager.wallet.getBalances();
    res.json({
      paid: true,
      balance: balances[activeMint] || 0
    });
  } catch (err) {
    // If redemption fails, quote might not be paid yet
    res.json({ paid: false, error: err.message });
  }
});

// Solve puzzle
app.post('/api/puzzle/solve', async (req, res) => {
  try {
    const { puzzleId, moves } = req.body;

    if (!puzzleId || !moves || !Array.isArray(moves)) {
      return res.status(400).json({ error: 'Invalid request. Provide puzzleId and moves array.' });
    }

    // Check rate limit
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitCheck = checkRateLimit(clientIp);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({ error: rateLimitCheck.message });
    }

    // Find the puzzle in our local database
    const puzzle = puzzlesData.find(p => p.id === puzzleId);

    if (!puzzle) {
      return res.status(400).json({ error: 'Puzzle not found. Please try a new puzzle.' });
    }

    // Validate solution - check if user's moves match the puzzle solution
    // User's moves are at odd indices (1, 3, 5...) since opponent moves first at index 0
    const userMovesInSolution = puzzle.solution.filter((_, index) => index % 2 === 1);
    const isCorrect = JSON.stringify(moves) === JSON.stringify(userMovesInSolution);

    if (!isCorrect) {
      console.log('[Debug] Solution mismatch:', { submitted: moves, expected: userMovesInSolution });
      return res.status(400).json({ error: 'Incorrect solution. Try again!' });
    }

    // Check if wallet has enough balance
    const balances = await manager.wallet.getBalances();
    const balance = balances[activeMint] || 0;

    if (balance < config.puzzleReward) {
      return res.status(503).json({ error: 'Insufficient funds in puzzle pot. Please ask someone to donate!' });
    }

    // Send tokens
    const token = await manager.wallet.send(activeMint, config.puzzleReward);
    const tokenString = getEncodedToken(token);

    // Generate QR code
    const qrCode = await QRCode.toDataURL(tokenString);

    const newBalance = await manager.wallet.getBalances();

    res.json({
      success: true,
      reward: config.puzzleReward,
      token: tokenString,
      qrCode,
      remainingBalance: newBalance[activeMint] || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
async function start() {
  await initWallet();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

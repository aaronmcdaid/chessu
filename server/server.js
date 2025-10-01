import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { Manager } from 'coco-cashu-core';
import { SqliteRepositories } from 'coco-cashu-sqlite3';
import crypto from 'crypto';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const config = {
  testMint: 'https://testnut.cashu.space',
  mainMint: 'https://mint.minibits.cash',
  activeMode: process.env.ACTIVE_MODE || 'test',
  dbPath: '/app/data/wallet.db',
  puzzleReward: 10, // sats per puzzle solved
};

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

// Solve puzzle (dummy validation for now)
app.post('/api/puzzle/solve', async (req, res) => {
  try {
    const { solution } = req.body;

    // Dummy validation - accept any solution that equals "e4"
    if (solution !== 'e4') {
      return res.status(400).json({ error: 'Incorrect solution' });
    }

    // Check if wallet has enough balance
    const balances = await manager.wallet.getBalances();
    const balance = balances[activeMint] || 0;

    if (balance < config.puzzleReward) {
      return res.status(503).json({ error: 'Insufficient funds in puzzle pot. Please ask someone to donate!' });
    }

    // Send tokens
    const token = await manager.wallet.send(activeMint, config.puzzleReward);
    const tokenString = JSON.stringify(token);

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

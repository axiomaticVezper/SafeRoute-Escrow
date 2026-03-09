const express = require('express');
const cors = require('cors');
const path = require('path');

// Database
const initDatabase = require('./database/init');
const db = initDatabase();

// Blockchain
const BlockchainLedger = require('./blockchain/ledger');
const EscrowChaincode = require('./blockchain/chaincode');
const ledger = new BlockchainLedger();
const chaincode = new EscrowChaincode(ledger);

// Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/orders', require('./routes/orders')(db, chaincode));
app.use('/api/blockchain', require('./routes/blockchain')(ledger));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    blockchain: { blocks: ledger.getChain().length, valid: ledger.isChainValid() },
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║   Smart Contract Escrow Payment System                  ║
  ║   Server running on http://localhost:${PORT}               ║
  ║                                                         ║
  ║   Demo Credentials:                                     ║
  ║   Customer: customer1 / password123                     ║
  ║   Supplier: supplier1 / password123                     ║
  ║   Driver:   driver1   / password123                     ║
  ║   Admin:    admin1    / password123                     ║
  ╚══════════════════════════════════════════════════════════╝
  `);
});

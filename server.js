require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { validateProductionStack } = require('./config/stack');
const initDatabase = require('./database/init');
const db = require('./database/neon');
const Ledger = require('./blockchain/ledger');
const EscrowChaincode = require('./blockchain/chaincode');
const hardhat = require('./blockchain/hardhat');

// Initialize app
const app = express();
app.use(cors());
validateProductionStack();
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize local ledger and chaincode
const ledger = new Ledger();
const chaincode = new EscrowChaincode(ledger, hardhat);

// Initialize database
initDatabase().then(async success => {
  if (success) {
    console.log('✅ Database initialization complete');
    await rehydrateWorldState();
  }
}).catch(err => {
  console.error('❌ Fatal Database Error:', err);
  process.exit(1);
});

async function rehydrateWorldState() {
  try {
    const res = await db.query('SELECT * FROM orders_metadata ORDER BY created_at ASC');
    let rehydratedCount = 0;
    
    for (const row of res.rows) {
      const orderId = row.order_id;
      // Skip if somehow already in worldState
      if (chaincode.worldState.has(orderId)) continue;
      
      const order = {
        orderId: row.order_id,
        customerId: row.customer_id,
        supplierId: row.supplier_id,
        driverId: row.driver_id,
        amount: parseFloat(row.amount),
        description: row.description,
        pickup: row.pickup_address,
        delivery: row.delivery_address,
        status: row.status,
        paymentRef: null,
        deliveryProof: null, // Note: proof hashes/resolutions aren't fully reconstructed here in this version, but status is
        disputeReason: null,
        resolution: null,
        onChainTxHash: row.on_chain_tx_hash,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
      
      chaincode.worldState.set(orderId, order);
      rehydratedCount++;
    }
    
    console.log(`✅ Rehydrated ${rehydratedCount} orders from database into chaincode worldState`);
  } catch (err) {
    console.warn(`⚠️ Warning: Failed to rehydrate world state: ${err.message}`);
  }
}

// Import route modules
const authRoutes = require('./routes/auth')(db);
const orderRoutes = require('./routes/orders')(db, chaincode);
const blockchainRoutes = require('./routes/blockchain')(ledger, hardhat);
const paymentRoutes = require('./routes/payments')(db, chaincode);

// Mount API routes under /api/v1 prefix for Flutter mobile readiness
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/blockchain', blockchainRoutes);
app.use('/api/v1/payments', paymentRoutes);

// Serve React frontend (Production Mode)
if (process.env.NODE_ENV === 'production' || process.env.SERVE_REACT === 'true') {
  app.use(express.static(path.join(__dirname, 'client/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
} else {
  // In development, Vite proxys to this Express backend.
  app.get('/', (req, res) => {
    res.json({ message: 'Escrow API is running. Use frontend proxy or /api/v1 routes.' });
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 API ready for Flutter consumption at /api/v1`);
});

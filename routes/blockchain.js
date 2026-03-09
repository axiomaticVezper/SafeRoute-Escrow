const express = require('express');
const { authenticateToken } = require('../middleware/auth');

module.exports = function(ledger) {
  const router = express.Router();

  // Get full blockchain ledger
  router.get('/chain', authenticateToken, (req, res) => {
    const chain = ledger.getChain();
    res.json({
      length: chain.length,
      chain,
      valid: ledger.isChainValid()
    });
  });

  // Validate chain integrity
  router.get('/validate', authenticateToken, (req, res) => {
    const valid = ledger.isChainValid();
    const chain = ledger.getChain();
    res.json({
      valid,
      blockCount: chain.length,
      latestBlock: chain[chain.length - 1],
      message: valid ? '✅ Blockchain integrity verified — all hashes valid' : '❌ Blockchain integrity compromised!'
    });
  });

  // Get stats
  router.get('/stats', authenticateToken, (req, res) => {
    const chain = ledger.getChain();
    const txTypes = {};
    chain.forEach(b => {
      if (b.data && b.data.type) {
        txTypes[b.data.type] = (txTypes[b.data.type] || 0) + 1;
      }
    });

    res.json({
      totalBlocks: chain.length,
      genesisTimestamp: chain[0].timestamp,
      latestTimestamp: chain[chain.length - 1].timestamp,
      transactionTypes: txTypes,
      chainValid: ledger.isChainValid()
    });
  });

  return router;
};

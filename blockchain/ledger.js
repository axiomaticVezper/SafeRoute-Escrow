const crypto = require('crypto');

class BlockchainLedger {
  constructor() {
    this.chain = [];
    this.createGenesisBlock();
  }

  createGenesisBlock() {
    const genesis = {
      index: 0,
      timestamp: new Date().toISOString(),
      data: { type: 'GENESIS', message: 'Escrow Payment System Ledger Initialized' },
      previousHash: '0',
      nonce: 0,
      hash: ''
    };
    genesis.hash = this.calculateHash(genesis);
    this.chain.push(genesis);
  }

  calculateHash(block) {
    const str = block.index + block.timestamp + JSON.stringify(block.data) + block.previousHash + block.nonce;
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  addBlock(data) {
    const previousBlock = this.chain[this.chain.length - 1];
    const block = {
      index: this.chain.length,
      timestamp: new Date().toISOString(),
      data,
      previousHash: previousBlock.hash,
      nonce: Math.floor(Math.random() * 100000),
      hash: ''
    };
    block.hash = this.calculateHash(block);
    this.chain.push(block);
    return block;
  }

  getChain() {
    return this.chain;
  }

  getBlocksByOrderId(orderId) {
    return this.chain.filter(b => b.data && b.data.orderId === orderId);
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];
      if (current.hash !== this.calculateHash(current)) return false;
      if (current.previousHash !== previous.hash) return false;
    }
    return true;
  }
}

module.exports = BlockchainLedger;

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { authenticateToken, requireRole } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = function(db, chaincode) {
  const router = express.Router();

  // Create Order
  router.post('/', authenticateToken, requireRole('customer'), (req, res) => {
    try {
      const { supplierId, amount, description, pickupAddress, deliveryAddress } = req.body;
      if (!supplierId || !amount || !description) {
        return res.status(400).json({ error: 'Missing required fields: supplierId, amount, description' });
      }

      const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;

      // Create on blockchain
      const result = chaincode.createOrder({
        orderId,
        customerId: req.user.id,
        supplierId,
        amount,
        description,
        pickup: pickupAddress || 'Warehouse A',
        delivery: deliveryAddress || 'Destination B'
      });

      // Store off-chain metadata
      db.prepare(`
        INSERT INTO orders_metadata (order_id, customer_id, supplier_id, description, pickup_address, delivery_address, amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED')
      `).run(orderId, req.user.id, supplierId, description, pickupAddress || 'Warehouse A', deliveryAddress || 'Destination B', parseFloat(amount));

      res.status(201).json({ orderId, order: result.order, block: result.block });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Process Payment & Lock Escrow
  router.post('/:id/pay', authenticateToken, requireRole('customer'), (req, res) => {
    try {
      const orderId = req.params.id;

      // Simulate Razorpay payment
      const paymentRef = `PAY-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const razorpaySimulation = {
        razorpay_payment_id: paymentRef,
        razorpay_order_id: `RPAY-${orderId}`,
        status: 'captured',
        method: 'upi',
        verified: true,
        timestamp: new Date().toISOString()
      };

      // Lock payment on blockchain
      const result = chaincode.lockPayment(orderId, paymentRef);

      // Update off-chain
      db.prepare("UPDATE orders_metadata SET status = ?, updated_at = datetime('now') WHERE order_id = ?")
        .run('LOCKED', orderId);

      res.json({ 
        message: 'Payment processed and locked in escrow',
        paymentRef,
        razorpay: razorpaySimulation,
        order: result.order,
        block: result.block
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Assign Driver
  router.post('/:id/assign', authenticateToken, (req, res) => {
    try {
      const orderId = req.params.id;
      let driverId = req.body.driverId;

      // Auto-assign if not specified
      if (!driverId) {
        const driver = db.prepare("SELECT id FROM users WHERE role = 'driver' LIMIT 1").get();
        if (!driver) return res.status(404).json({ error: 'No drivers available' });
        driverId = driver.id;
      }

      const result = chaincode.assignDriver(orderId, driverId);

      db.prepare("UPDATE orders_metadata SET driver_id = ?, status = ?, updated_at = datetime('now') WHERE order_id = ?")
        .run(driverId, 'IN_TRANSIT', orderId);

      const driverInfo = db.prepare('SELECT name FROM users WHERE id = ?').get(driverId);
      res.json({ message: 'Driver assigned', driverName: driverInfo?.name, order: result.order, block: result.block });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Submit Delivery Proof
  router.post('/:id/proof', authenticateToken, requireRole('driver'), upload.single('image'), (req, res) => {
    try {
      const orderId = req.params.id;
      const { gpsLat, gpsLng, notes } = req.body;

      const proofData = {
        driverId: req.user.id,
        gpsLat: parseFloat(gpsLat || 28.6139),
        gpsLng: parseFloat(gpsLng || 77.2090),
        notes: notes || 'Delivered at front gate',
        imagePath: req.file ? req.file.filename : null,
        timestamp: new Date().toISOString()
      };

      const proofHash = crypto.createHash('sha256').update(JSON.stringify(proofData)).digest('hex');

      // Record on blockchain
      const result = chaincode.submitDeliveryProof(orderId, proofData);

      // Store off-chain
      const proofId = `PRF-${Date.now().toString(36).toUpperCase()}`;
      db.prepare(`
        INSERT INTO delivery_proofs (id, order_id, driver_id, image_path, gps_lat, gps_lng, notes, proof_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(proofId, orderId, req.user.id, proofData.imagePath, proofData.gpsLat, proofData.gpsLng, proofData.notes, proofHash);

      db.prepare("UPDATE orders_metadata SET status = ?, updated_at = datetime('now') WHERE order_id = ?")
        .run('PROOF_SUBMITTED', orderId);

      res.json({ message: 'Delivery proof submitted', proofId, proofHash, order: result.order, block: result.block });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Confirm Delivery
  router.post('/:id/confirm', authenticateToken, requireRole('customer'), (req, res) => {
    try {
      const orderId = req.params.id;
      const result = chaincode.confirmDelivery(orderId, req.user.id);

      db.prepare("UPDATE orders_metadata SET status = ?, updated_at = datetime('now') WHERE order_id = ?")
        .run('SETTLED', orderId);

      // Update reputation
      const order = chaincode.getOrderState(orderId);
      if (order.driverId) {
        db.prepare(`
          UPDATE reputation_scores 
          SET successful_deliveries = successful_deliveries + 1, 
              score = MIN(10, score + 0.1) 
          WHERE user_id = ?
        `).run(order.driverId);
      }

      res.json({ message: 'Delivery confirmed. Payment released to supplier.', order: result.order, block: result.block });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Raise Dispute
  router.post('/:id/dispute', authenticateToken, requireRole('customer'), (req, res) => {
    try {
      const orderId = req.params.id;
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ error: 'Dispute reason is required' });

      const result = chaincode.raiseDispute(orderId, reason);

      db.prepare("UPDATE orders_metadata SET status = ?, updated_at = datetime('now') WHERE order_id = ?")
        .run('DISPUTED', orderId);

      res.json({ message: 'Dispute raised. Funds frozen in escrow.', order: result.order, block: result.block });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Resolve Dispute (Admin only)
  router.post('/:id/resolve', authenticateToken, requireRole('admin'), (req, res) => {
    try {
      const orderId = req.params.id;
      const { decision, amount } = req.body;
      if (!decision || !['RELEASE', 'REFUND', 'PARTIAL'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be RELEASE, REFUND, or PARTIAL' });
      }

      const result = chaincode.resolveDispute(orderId, decision, amount);

      db.prepare("UPDATE orders_metadata SET status = ?, updated_at = datetime('now') WHERE order_id = ?")
        .run('RESOLVED', orderId);

      // Update reputation based on decision
      const order = chaincode.getOrderState(orderId);
      if (order.driverId) {
        if (decision === 'REFUND') {
          db.prepare('UPDATE reputation_scores SET disputes_against = disputes_against + 1, score = MAX(0, score - 0.5) WHERE user_id = ?')
            .run(order.driverId);
        } else {
          db.prepare('UPDATE reputation_scores SET disputes_won = disputes_won + 1, score = MIN(10, score + 0.2) WHERE user_id = ?')
            .run(order.driverId);
        }
      }

      res.json({ message: `Dispute resolved: ${decision}`, order: result.order, block: result.block });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Drivers list (for assign dropdown)
  router.get('/drivers', authenticateToken, (req, res) => {
    try {
      const drivers = db.prepare("SELECT id, name FROM users WHERE role = 'driver'").all();
      res.json(drivers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get All Orders (filtered by role)
  router.get('/', authenticateToken, (req, res) => {
    try {
      const orders = chaincode.getOrdersByUser(req.user.id, req.user.role);

      // Enrich with off-chain data
      const enriched = orders.map(order => {
        const meta = db.prepare('SELECT * FROM orders_metadata WHERE order_id = ?').get(order.orderId);
        const proof = db.prepare('SELECT * FROM delivery_proofs WHERE order_id = ?').get(order.orderId);
        const customerName = db.prepare('SELECT name FROM users WHERE id = ?').get(order.customerId);
        const supplierName = db.prepare('SELECT name FROM users WHERE id = ?').get(order.supplierId);
        const driverName = order.driverId ? db.prepare('SELECT name FROM users WHERE id = ?').get(order.driverId) : null;
        return {
          ...order,
          customerName: customerName?.name,
          supplierName: supplierName?.name,
          driverName: driverName?.name,
          proof: proof || null,
          meta
        };
      });

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Single Order
  router.get('/:id', authenticateToken, (req, res) => {
    try {
      const order = chaincode.getOrderState(req.params.id);
      const meta = db.prepare('SELECT * FROM orders_metadata WHERE order_id = ?').get(req.params.id);
      const proof = db.prepare('SELECT * FROM delivery_proofs WHERE order_id = ?').get(req.params.id);
      const history = chaincode.getOrderHistory(req.params.id);
      const customerName = db.prepare('SELECT name FROM users WHERE id = ?').get(order.customerId);
      const supplierName = db.prepare('SELECT name FROM users WHERE id = ?').get(order.supplierId);
      const driverName = order.driverId ? db.prepare('SELECT name FROM users WHERE id = ?').get(order.driverId) : null;

      res.json({
        ...order,
        customerName: customerName?.name,
        supplierName: supplierName?.name,
        driverName: driverName?.name,
        proof,
        meta,
        history
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Order Blockchain History
  router.get('/:id/history', authenticateToken, (req, res) => {
    try {
      const history = chaincode.getOrderHistory(req.params.id);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

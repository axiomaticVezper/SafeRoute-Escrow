const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, authenticateToken, requireRole } = require('../middleware/auth');

module.exports = function(db) {
  const router = express.Router();

  // Login
  router.post('/login', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const validPassword = bcrypt.compareSync(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Mark user as active
      db.prepare("UPDATE users SET is_active = 1, last_active = datetime('now') WHERE id = ?").run(user.id);

      const token = jwt.sign(
        { id: user.id, username: user.username, name: user.name, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          email: user.email,
          wallet_balance: user.wallet_balance
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logout (mark user inactive)
  router.post('/logout', authenticateToken, (req, res) => {
    try {
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.user.id);
      res.json({ message: 'Logged out' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Register
  router.post('/register', (req, res) => {
    try {
      const { username, password, name, role, email, phone } = req.body;
      if (!username || !password || !name || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const validRoles = ['customer', 'supplier', 'driver', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      const id = `USR-${Date.now().toString(36).toUpperCase()}`;
      const hash = bcrypt.hashSync(password, 10);

      db.prepare(`
        INSERT INTO users (id, username, password, name, role, email, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, username, hash, name, role, email || null, phone || null);

      db.prepare(`INSERT INTO reputation_scores (user_id) VALUES (?)`).run(id);

      const token = jwt.sign(
        { id, username, name, role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({ token, user: { id, username, name, role, email } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get current user profile
  router.get('/me', authenticateToken, (req, res) => {
    const user = db.prepare('SELECT id, username, name, role, email, phone, wallet_balance, is_active, last_active, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Update last_active
    db.prepare("UPDATE users SET last_active = datetime('now') WHERE id = ?").run(req.user.id);
    
    const reputation = db.prepare('SELECT * FROM reputation_scores WHERE user_id = ?').get(req.user.id);
    res.json({ ...user, reputation });
  });

  // Get all users (admin only)
  router.get('/users', authenticateToken, requireRole('admin'), (req, res) => {
    const users = db.prepare(`
      SELECT u.id, u.username, u.name, u.role, u.email, u.phone, u.wallet_balance, 
             u.is_active, u.last_active, u.created_at,
             r.successful_deliveries, r.disputes_against, r.disputes_won, r.score as reputation_score
      FROM users u
      LEFT JOIN reputation_scores r ON u.id = r.user_id
      ORDER BY u.created_at DESC
    `).all();
    
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.is_active === 1).length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const roleBreakdown = {
      customer: users.filter(u => u.role === 'customer').length,
      supplier: users.filter(u => u.role === 'supplier').length,
      driver: users.filter(u => u.role === 'driver').length,
      admin: adminCount,
    };

    res.json({ users, stats: { totalUsers, activeUsers, adminCount, roleBreakdown } });
  });

  // Get active users only (admin only)
  router.get('/users/active', authenticateToken, requireRole('admin'), (req, res) => {
    const users = db.prepare(`
      SELECT id, username, name, role, email, is_active, last_active 
      FROM users WHERE is_active = 1
      ORDER BY last_active DESC
    `).all();
    res.json(users);
  });

  // Promote user to admin (admin only)
  router.post('/users/:id/promote', authenticateToken, requireRole('admin'), (req, res) => {
    try {
      const targetId = req.params.id;
      const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(targetId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.role === 'admin') return res.status(400).json({ error: 'User is already an admin' });

      db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', targetId);
      res.json({ message: `${user.name} has been promoted to admin`, userId: targetId, newRole: 'admin' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Demote admin back to their original or given role (admin only)
  router.post('/users/:id/demote', authenticateToken, requireRole('admin'), (req, res) => {
    try {
      const targetId = req.params.id;
      const { newRole } = req.body;

      if (targetId === req.user.id) {
        return res.status(400).json({ error: 'Cannot demote yourself' });
      }

      const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(targetId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.role !== 'admin') return res.status(400).json({ error: 'User is not an admin' });

      const validRoles = ['customer', 'supplier', 'driver'];
      const role = validRoles.includes(newRole) ? newRole : 'customer';

      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
      res.json({ message: `${user.name} has been changed to ${role}`, userId: targetId, newRole: role });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete user (admin only)
  router.delete('/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
      const targetId = req.params.id;
      if (targetId === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
      }

      const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(targetId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      db.prepare('DELETE FROM reputation_scores WHERE user_id = ?').run(targetId);
      db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
      res.json({ message: `${user.name} has been deleted` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

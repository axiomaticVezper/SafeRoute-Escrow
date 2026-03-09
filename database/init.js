const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

function initDatabase() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const db = new Database(path.join(dataDir, 'escrow.db'));
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer','supplier','driver','admin')),
      email TEXT,
      phone TEXT,
      wallet_balance REAL DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      last_active TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders_metadata (
      order_id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      driver_id TEXT,
      description TEXT,
      pickup_address TEXT,
      delivery_address TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'CREATED',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (supplier_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_proofs (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      image_path TEXT,
      gps_lat REAL,
      gps_lng REAL,
      notes TEXT,
      proof_hash TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders_metadata(order_id),
      FOREIGN KEY (driver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reputation_scores (
      user_id TEXT PRIMARY KEY,
      successful_deliveries INTEGER DEFAULT 0,
      disputes_against INTEGER DEFAULT 0,
      disputes_won INTEGER DEFAULT 0,
      avg_delivery_time REAL DEFAULT 0,
      score REAL DEFAULT 5.0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Seed demo users if not exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('password123', 10);
    const insert = db.prepare(`
      INSERT INTO users (id, username, password, name, role, email, phone, wallet_balance) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedUsers = [
      ['USR-C001', 'customer1', hash, 'Arjun Mehta',     'customer', 'arjun@example.com',  '9876543210', 50000],
      ['USR-C002', 'customer2', hash, 'Priya Sharma',    'customer', 'priya@example.com',  '9876543214', 35000],
      ['USR-C003', 'customer3', hash, 'Vikram Singh',    'customer', 'vikram@example.com', '9876543215', 42000],
      ['USR-S001', 'supplier1', hash, 'TransCo Logistics','supplier', 'transco@example.com', '9876543211', 0],
      ['USR-S002', 'supplier2', hash, 'QuickShip India',  'supplier', 'quickship@example.com','9876543216', 0],
      ['USR-D001', 'driver1',   hash, 'Ravi Kumar',       'driver',   'ravi@example.com',    '9876543212', 0],
      ['USR-D002', 'driver2',   hash, 'Suresh Yadav',     'driver',   'suresh@example.com',  '9876543217', 0],
      ['USR-A001', 'admin1',    hash, 'System Admin',     'admin',    'admin@example.com',   '9876543213', 0],
    ];

    const insertReputation = db.prepare(`
      INSERT INTO reputation_scores (user_id, successful_deliveries, score) VALUES (?, 0, 5.0)
    `);

    const tx = db.transaction(() => {
      for (const u of seedUsers) {
        insert.run(...u);
        insertReputation.run(u[0]);
      }
    });
    tx();

    console.log('✅ Seeded 8 demo users');
  }

  return db;
}

module.exports = initDatabase;

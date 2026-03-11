# SafeRoute Escrow (React + Hardhat + Neon + Stripe)

SafeRoute Escrow is a decentralized escrow payment system designed for the future of logistics. Combining Hardhat blockchain security with Stripe payment processing, it ensures funds are only released when delivery is cryptographically verified. Built with React, Node.js, and Neon PostgreSQL.

![Escrow Flow](media__1773050833091.png)

## �️ Architecture
This project uses a three-tier architecture to ensure absolute transparency and security:
1. **Local Ledger (`ledger.js`)**: A SHA256-linked audit log in RAM for instant tamper detection.
2. **PostgreSQL (Neon)**: Persistent storage for order metadata, users, and reputations.
3. **Hardhat Smart Contract**: An immutable record of order status changes on the Ethereum blockchain.

## �🆕 Tech Stack Update
This project has been extensively modernized:
* **Frontend:** Refactored from static HTML/JS to a dynamic Vite + React single-page application.
* **Database:** Migrated from SQLite (`better-sqlite3`) to Neon Serverless PostgreSQL (`@neondatabase/serverless`).
* **Blockchain:** Escrow smart contract wired to a local Hardhat node via `ethers.js`.
* **Payments:** Stripe Checkout integration replacing manual payment simulations.
* **Mobile-Ready:** Backend rewritten to standard JSON Envelopes under a `/api/v1/` prefix.

## ⚙️ Prerequisites
* Node.js v18+
* PostgreSQL DB or Neon DB URL
* Stripe Account
* Hardhat local node + deployed Escrow contract

## 🛠 Setup & Installation

**1. Clone the repository and install dependencies:**
```bash
npm install
cd client && npm install
cd ..
```

**2. Configure Environment Variables:**
Create a `.env` file in the project root containing your secret keys (Use `.env.example` as a template). 
> **Note:** The backend is configured to run on **Port 3001** to avoid local conflicts.

**Seeded Default Users (on empty DB):**
The initializer seeds 8 test users when the `users` table is empty.
* **Username:** `customer1`
* **Password:** `password123`

**3. Build Frontend & Start Server:**
```bash
npm run build:client
npm start
```
The application will be available at `http://localhost:3001`.

## 🧑‍💻 Development

Start backend, frontend, and Stripe webhook forwarding in separate terminals:
1. Open terminal 1: `npm run hardhat:node` (Runs local blockchain on port 8545)
2. Open terminal 2: `npm run hardhat:deploy:local` (Deploys `EscrowContract`)
3. Open terminal 3: `npm run dev` (Runs backend on port 3001)
4. Open terminal 4: `cd client && npm run dev` (Runs React on port 5174 with API proxy)
5. Open terminal 5: `stripe listen --forward-to localhost:3001/api/v1/payments/webhook`

## 🗄 Data Persistence Notes

- Neon/PostgreSQL tables are persistent across restarts.
- The backend includes a `rehydrateWorldState()` mechanism that fires on startup. It pulls historical and active orders from the persistent database and gracefully reconstructs the live `worldState` in RAM, allowing operations to survive server restarts seamlessly.

## ⭐ Reputation Scoring

Scores are recalculated when order events change delivery/dispute metrics.
```text
score = clamp(3 + 0.25*successful_deliveries + 0.35*disputes_won - 0.4*disputes_against, 1..5)
```

## 📱 Flutter & Mobile Integration

The backend is fully mobile-ready with a clean `/api/v1` JSON structure. 

**Flutter Networking Starter:**
A Flutter integration layer is included at [`mobile/flutter_client`](mobile/flutter_client). It provides a reusable `ApiClient` and models for:
- Auth & Token Management
- Order Management Lifecycle
- Stripe Payment Intent Flow
- Dispute Resolution

To use it, copy the `lib` folder from the `mobile/flutter_client` directory into your own Flutter project.

## 🧪 Testing
We use Jest/Supertest for backend integration tests and Vitest for the frontend:
```bash
npm test
```

# EscrowChain (React + Hardhat + Neon + Stripe)

EscrowChain is a robust smart contract-based payment system for transportation and logistics. It ensures that funds are held securely until delivery conditions are met, protecting both customers and suppliers.

#Escrow Flow

## 🆕 Tech Stack Update
This project has been extensively modernized:
* **Frontend:** Refactored from static HTML/JS to a dynamic Vite + React single-page application.
* **Database:** Migrated from SQLite (`better-sqlite3`) to Neon Serverless PostgreSQL (`@neondatabase/serverless`).
* **Blockchain:** Escrow smart contract wired to a local Hardhat node via `ethers.js` (with optional external EVM RPC support).
* **Payments:** Stripe Checkout integration replacing manual payment simulations.
* **Mobile-Ready:** Backend rewritten to standard JSON Envelopes under a `/api/v1/` prefix, strictly separated from frontend assets.

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
Create a `.env` file in the project root containing your secret keys (Use `.env.example` as a template):
```bash
cp .env.example .env
```
All stack variables are required in the current full-integration mode. Missing values will fail fast at server startup.

**Seeded Default Users (on empty DB):**
The initializer seeds 8 test users when the `users` table is empty.
* **Username:** `customer1`
* **Password:** `password123`

**3. Build Frontend & Start Server:**
```bash
npm run build:client
npm start
```
The application will be available at `http://localhost:3000`.

## 🧑‍💻 Development

Start backend, frontend, and Stripe webhook forwarding in separate terminals:
1. Open terminal 1: `npm run hardhat:node` (Runs local blockchain on port 8545)
2. Open terminal 2: `npm run hardhat:deploy:local` (Deploys `EscrowContract` and writes `hardhat/deployment.local.json`)
3. Open terminal 3: `npm run dev` (Runs backend on port 3000)
4. Open terminal 4: `cd client && npm run dev` (Runs React on port 5173 with API proxy)
5. Open terminal 5: `stripe listen --forward-to localhost:3000/api/v1/payments/webhook`

If Stripe CLI is not authenticated on your machine:
```bash
stripe login
```

## 🗄 Data Persistence Notes

- Neon/PostgreSQL tables are persistent across restarts (`users`, `orders_metadata`, `delivery_proofs`, `reputation_scores`).
- The in-memory blockchain world state and local ledger initially reset on server restart.
- **Improved**: The backend now includes a `rehydrateWorldState()` mechanism that fires on startup. It pulls historical and active orders from the persistent database and gracefully reconstructs the live `worldState` in RAM, allowing operations to survive server crashes or restarts seamlessly.

## ⭐ Reputation Scoring

All users start with a seeded reputation score. Scores are recalculated when order events change delivery/dispute metrics.

Current formula:
```text
score = clamp(3 + 0.25*successful_deliveries + 0.35*disputes_won - 0.4*disputes_against, 1..5)
```

Reputation counters and score are updated through order lifecycle routes (confirm, dispute, resolve), and shown in the admin Users table.

## 🌐 React + 📱 Flutter Together

Both clients are supported against the same `/api/v1` backend.

1. Start backend: `npm run dev`
2. Start React web app: `cd client && npm run dev`
3. Start Flutter app from your mobile project:
   - Android emulator base URL: `http://10.0.2.2:3000/api/v1`
   - iOS simulator base URL: `http://127.0.0.1:3000/api/v1`
   - Physical device base URL: `http://<your-lan-ip>:3000/api/v1`

Payment flow is the same for React and Flutter:
1. `POST /payments/create-intent`
2. Confirm payment intent with Stripe SDK (`@stripe/react-stripe-js` in React or `flutter_stripe` in Flutter)
3. `POST /orders/:id/pay` with `paymentIntentId`

## 🧪 Testing
We use Jest/Supertest for backend integration tests and Vitest for the frontend:
```bash
npm test
```

## 📱 Flutter Mobile Integration
The API has been designed to be consumed by multiple frontends. See [`docs/api-contract.md`](docs/api-contract.md) for the exact schema, authentication headers, and response shapes needed to build a native iOS/Android client using Flutter.

A Flutter networking starter is included at [`mobile/flutter_client`](mobile/flutter_client) with a reusable `ApiClient` for auth, orders, dispute flow, delivery proof upload, and Stripe intent flow.

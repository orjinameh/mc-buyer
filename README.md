# MC Buyer

Agent-native spending layer that lets AI agents use Stellar USDC to purchase everyday Nigerian services.

MC Buyer answers one question: **What can an AI agent actually buy with Stellar USDC in Nigeria?**

The first answer: airtime, mobile data, electricity, and cable TV.

## Architecture

```
AI Agent → MCP → MC Buyer → Stellar USDC → VTU Provider → Real-world service
```

- **9bridge** — Nigerian payment gateway aggregation (Paystack, Monnify, Flutterwave) with Stellar x402
- **MC Buyer** — Agent spending layer, quote/authorization, VTU execution
- **Stellar** — Settlement and spending balance layer
- **MCP** — Agent interface (10 tools)

## Install

```bash
npm install mc-buyer
```

## Environment

```env
MONGODB_URI=mongodb+srv://...
VTPASS_API_KEY=...
VTPASS_SECRET_KEY=...
STELLAR_NETWORK=testnet
STELLAR_PAY_TO=G...
SOROBAN_CONTRACT_ID=C...
PAYSTACK_SECRET_KEY=...
MONNIFY_API_KEY=...
FLUTTERWAVE_SECRET_KEY=...
PORT=3000
```

## Quick Start

```ts
import express from 'express';
import { connectDatabase } from 'mc-buyer/dist/config/database.js';

await connectDatabase(process.env.MONGODB_URI!);

const app = express();
app.use(express.json());

// Mount MC Buyer routes
// See src/index.ts for full wiring
```

## MCP Tools (10)

| Tool | Description |
|------|-------------|
| `get_spending_balance` | Returns USDC balance |
| `quote_airtime` | NGN→USDC quote for airtime |
| `buy_airtime` | Purchase airtime with Stellar USDC |
| `quote_data` | NGN→USDC quote for mobile data |
| `buy_data` | Purchase data with Stellar USDC |
| `quote_electricity` | NGN→USDC quote for electricity |
| `pay_electricity_bill` | Pay electricity bill with Stellar USDC |
| `quote_cable` | NGN→USDC quote for cable TV |
| `renew_cable_tv` | Renew cable TV with Stellar USDC |
| `get_transaction_history` | View spending history |

## API Endpoints

### Funding
- `POST /api/v1/funding/initiate` — Start a funding payment via 9bridge
- `GET /api/v1/funding/status/:reference` — Check funding status

### Account
- `GET /api/v1/account` — Balance + recent transactions

### Transactions
- `GET /api/v1/transactions` — Full transaction history
- `GET /api/v1/transactions/:id` — Single transaction detail

### Quotes
- `POST /api/v1/quote` — Generate NGN→USDC quote

### Agent Policies
- `POST /api/v1/policies` — Create agent spending policy
- `GET /api/v1/policies/:agentId` — Get agent policy
- `PATCH /api/v1/policies/:agentId` — Update agent policy

### Webhooks (from 9bridge)
- `POST /api/v1/webhooks/payment-listener` — Payment confirmation

## Agent Spending Flow

```
Agent: "Buy ₦1,000 MTN airtime"
  ↓
MC Buyer: get_spending_balance → "25.50 USDC"
  ↓
MC Buyer: quote_airtime → 0.625 USDC
  ↓
MC Buyer: authorize (checks limits, allowed services)
  ↓
MC Buyer: reserve USDC (debit spending account)
  ↓
MC Buyer: execute via VTpass
  ↓
Agent: receipt with tx hash, provider ref, amounts
```

## Agent Spending Controls

```ts
// Set limits per agent
POST /api/v1/policies
{
  "agentId": "agent-1",
  "userId": "user-123",
  "dailyLimit": "10",
  "perTransactionLimit": "3",
  "allowedServices": ["airtime", "data", "electricity"]
}
```

## Service Catalog

### Airtime
MTN, Airtel, Glo, 9mobile — ₦100 to ₦5,000

### Data
MTN, Airtel, Glo, 9mobile — 100MB to 10GB plans

### Electricity
11 distribution companies (Ikeja, Eko, Abuja, etc.)

### Cable TV
DStv, GOtv, Startimes — all tiers

## Security

- API key or JWT authentication
- Rate limiting (120 req/min)
- Idempotency key support
- Replay protection (nonce + timestamp)
- Quote expiration (5 min)
- Atomic balance operations
- Duplicate payment rejection
- Webhook signature verification via 9bridge

## Deployment

### Railway
```bash
railway init
railway variables set MONGODB_URI=... VTPASS_API_KEY=...
railway up
```

### Docker
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## Tests

```bash
npm test
```

Uses `mongodb-memory-server` — no external DB needed for tests.

## License

MIT

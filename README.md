# On-Chain Order Matching Engine

> A production-grade Order Matching Engine rebuilt as a Solana on-chain program using Anchor/Rust.

**Program ID:** `CgG3NfTRRTUcAx5qhCh4LWe1pX79WMBU8M4WfB69MP6j`  
**Network:** Devnet

---

## Devnet Transactions

| Action | Transaction |
|--------|-------------|
| Program Deploy | [4ULNhrc...](https://explorer.solana.com/tx/4ULNhrcZktUa1JhrBMh2t52U3DmdZSdur8ZtFUF3X3X6uwQqAh132R8MMBLcfLLv64HnvtWXbCQRQ9fj3FSoD3yv?cluster=devnet) |
| Initialize Market | [2vzFvqF...](https://explorer.solana.com/tx/2vzFvqFWmFJfvMTmakDKXGYvSpL1TWtkcUu7EKZ9pYcMNk5T9ACixkGYfpcrCW55Az6xUfPSvt3FjiVUy6EjpG2?cluster=devnet) |
| Place Bid #1 | [Y8AjodP...](https://explorer.solana.com/tx/Y8AjodP9GzHxHanzif2X8FADmsG6djKro5JG5RsuCtKtrTdhuxXAwhzhfXSt1oZDD5Wqs4LRKxtEiMXdgWha1j1?cluster=devnet) |
| Place Ask #2 | [ceLozcJ...](https://explorer.solana.com/tx/ceLozcJCB46CRRvWg95HT7Ep1Fez8W1pgqNUJ1ns4GqZwfv9cuKBYzS8uR1PhkUQHkzGTWxLxLas9TiwfoZDEPV?cluster=devnet) |
| Match Orders | [5EMRMiJ...](https://explorer.solana.com/tx/5EMRMiJ67YHw4qkjWfRyYkdUgJX7wQ7Xt2ieoMZJt8SsXKmQ3wafJEJ3YPMXpep2eZqDGTTh1sPBgRmMwrwHXqRd?cluster=devnet) |
| Settle Balances | [5hkErGq...](https://explorer.solana.com/tx/5hkErGqXoSWtucmMNjxpk9Dg4wC9rNYYqmeyuUMzbA9HPBi1barLrcuykA9EQQ8iknRBvJM4ZjSyDoqnGG9nGaqY?cluster=devnet) |

---

## What Is This?

This project takes the core backend of a **centralized exchange matching engine** — one of the most compute-intensive Web2 backend systems — and reimplements it as a Solana on-chain program. The goal: demonstrate that Solana's account model is a viable distributed state-machine backend, not just a crypto settlement layer.

---

## How This Works in Web2

A traditional Order Matching Engine (Binance, Coinbase backend) is built around:

| Component | Web2 Implementation |
|-----------|-------------------|
| Order storage | PostgreSQL: `orders(id, trader_id, side, price, qty, status)` |
| User balances | `user_balances(user_id, base_free, base_locked, quote_free, quote_locked)` |
| Market state | In-memory `Market` object + Redis for best bid/ask cache |
| Matching logic | Background service polling for `bid.price >= ask.price` pairs |
| Settlement | Atomic DB transaction + async fund transfer |
| Cancellation | `UPDATE orders SET status='cancelled'` + balance unlock |

**Key characteristics:**
- Centralized trust: you trust the exchange to execute orders fairly and not front-run
- High throughput via in-memory sorted data structures (red-black trees, O(log n))
- ACID transactions for atomicity
- Background matching service runs continuously as a daemon
- Users have no visibility into matching logic internals

---

## How This Works on Solana

Solana forces a fundamentally different mental model. Every piece of state is an explicit on-chain account:

| Component | Solana Implementation |
|-----------|----------------------|
| Order storage | `Order` PDA — `seeds = [b"order", market, order_id]` |
| User balances | `UserPosition` PDA — `seeds = [b"position", market, trader]` |
| Market state | `Market` PDA — `seeds = [b"market", base_mint, quote_mint]` |
| Matching logic | **Permissionless crank** — anyone calls `match_orders` with bid+ask accounts |
| Settlement | `settle` instruction (hooks into SPL Token CPI in production) |
| Cancellation | Closes `Order` PDA → **rent returned to trader** |

### Account Architecture
```
Market PDA
│  seeds: [b"market", base_mint, quote_mint]
│  stores: authority, best_bid, best_ask, total_volume, open_orders_count
│
├── Order PDA (one per open order)
│   seeds: [b"order", market, order_id]
│   stores: side, price, quantity, quantity_remaining, status
│   lifecycle: Open → PartiallyFilled → Filled (closed on cancel)
│
└── UserPosition PDA (one per trader per market)
    seeds: [b"position", market, trader]
    stores: base_free, base_locked, quote_free, quote_locked, lifetime stats
```

### The Crank Model — Key Design Decision

In Web2, a background daemon continuously scans for matching orders. **On Solana, background processes don't exist.** Instead, we use a **permissionless crank** pattern:

1. An off-chain client (bot or user) scans all open Order PDAs
2. It finds a pair where `bid.price >= ask.price`
3. It calls `match_orders` passing both order accounts as arguments
4. The program validates the match on-chain and settles atomically

This is exactly how [OpenBook (Serum v4)](https://github.com/openbook-dex/openbook-v2) and [Phoenix DEX](https://github.com/Ellipsis-Labs/phoenix-v1) work at production scale. Crankers are economically incentivized (they can be paid a fee per match).

### Partial Fill Tracking

Unlike naive implementations that only track binary filled/unfilled state, this engine tracks `quantity_remaining` and `quantity_filled` separately, enabling:
- `PartiallyFilled` status — order stays open for re-cranking
- Correct refund calculation when bid price > ask price (price improvement)
- Accurate lifetime volume stats in `UserPosition`

---

## Tradeoffs & Constraints

| Concern | Web2 | Solana | Notes |
|---------|------|--------|-------|
| **Sorted order book** | O(log n) red-black tree in RAM | No native sorted structures | Off-chain indexer finds best orders, passes to crank |
| **Throughput** | Millions of matches/sec in memory | ~50k TPS; account contention limits concurrent matches | Same account can't be written twice in one block |
| **Trust** | Trust the exchange operator | Trustless — logic is immutable on-chain | Anyone can verify matching rules |
| **Atomicity** | ACID transactions | Solana txs are atomic by default | Match + settle happen in one transaction |
| **Storage cost** | Free (your own DB) | ~0.002 SOL per order (rent-exempt) | Returned to trader on cancel |
| **Background jobs** | OS threads / cron | Crank pattern | Economic incentive keeps crankers running |
| **Token custody** | Exchange holds your funds | Funds locked in PDAs per program logic | Can't be moved without matching valid instruction |
| **Composability** | Closed system | Any program can CPI into this | DeFi protocols can integrate natively |

---

## Instructions

| Instruction | Description | Signer |
|-------------|-------------|--------|
| `initialize_market` | Create market PDA for a token pair | Authority |
| `place_order` | Place limit bid or ask, lock funds in UserPosition | Trader |
| `cancel_order` | Cancel open order, unlock funds, close Order PDA (rent returned) | Trader (owner only) |
| `match_orders` | Crank: validate bid.price ≥ ask.price, settle fill atomically | Anyone (permissionless) |
| `settle` | Withdraw filled balances (simulates SPL Token transfer) | Trader |

---

## Project Structure
```
order-matching-engine/
├── programs/order-matching-engine/
│   └── src/
│       ├── lib.rs                    # program entry, declare_id!, instruction routing
│       ├── errors.rs                 # 10 custom error codes
│       ├── initialize_market.rs      # create market PDA
│       ├── place_order.rs            # place limit order + lock funds
│       ├── cancel_order.rs           # cancel + unlock + close PDA
│       ├── match_orders.rs           # permissionless crank + atomic settlement
│       ├── settle.rs                 # withdraw filled balances
│       └── state/
│           ├── market.rs             # Market account struct
│           ├── order.rs              # Order account + OrderSide/OrderStatus enums
│           └── user_position.rs      # UserPosition account struct
├── tests/
│   └── order_matching_engine.ts      # 8 integration tests
├── client/
│   └── cli/                          # TypeScript CLI (demo.ts)
└── README.md
```

---

## Quick Start

### Prerequisites
- [Rust](https://rustup.rs/) + Solana CLI
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) v0.32.1
- Node.js v18+ + Yarn

### Build & Test
```bash
git clone https://github.com/isenggg8/order-matching-engine
cd order-matching-engine

yarn install
anchor build
anchor test
```

### Run Demo (Devnet)
```bash
# Make sure you have devnet SOL
solana airdrop 2 --url devnet

cd client/cli
npx ts-node demo.ts
```

---

## Why Order Matching Engine?

Most on-chain backends demonstrate simple patterns (rate limiters, counters). An order matching engine is one of the most complex backend systems in fintech — it requires:

- **Multi-party state coordination** (buyer + seller + market in one atomic tx)
- **Partial execution logic** (fills that span multiple transactions)
- **Economic security** (locked funds that can only be released per matching rules)
- **Permissionless execution** (crank model — no trusted intermediary)

This makes it an ideal demonstration that Solana's account model is a viable replacement for traditional database-backed backends in high-stakes financial applications.

---

## License

MIT

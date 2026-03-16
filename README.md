# Solana Order Matching Engine

A simplified Limit Order Book (LOB) matching engine built as an on-chain Rust program on Solana using the Anchor framework.

## Architecture Highlights
- **Market:** Configures trading pair (Base Mint & Quote Mint).
- **Order:** PDA representing limit order, placed by trader.
- **UserPosition:** PDA managing trader balances / locked limits. Virtual digital ledger approach.
- **Matching Rules:** `Bid >= Ask`, executed by a cranker mechanism.

## Deployment Details

- **Network:** Devnet
- **Program ID:** `CgG3NfTRRTUcAx5qhCh4LWe1pX79WMBU8M4WfB69MP6j`

### Real Devnet Transactions
You can verify the program works live on Devnet explorers:

1. **Deploy Transaction:** [4ULNhrcZktUa1JhrBMh2t52U3DmdZSdur8ZtFUF3X3X6uwQqAh132R8MMBLcfLLv64HnvtWXbCQRQ9fj3FSoD3yv](https://explorer.solana.com/tx/4ULNhrcZktUa1JhrBMh2t52U3DmdZSdur8ZtFUF3X3X6uwQqAh132R8MMBLcfLLv64HnvtWXbCQRQ9fj3FSoD3yv?cluster=devnet)
2. **Initialize Market:** [2vzFvqFWmFJfvMTmakDKXGYvSpL1TWtkcUu7EKZ9pYcMNk5T9ACixkGYfpcrCW55Az6xUfPSvt3FjiVUy6EjpG2](https://explorer.solana.com/tx/2vzFvqFWmFJfvMTmakDKXGYvSpL1TWtkcUu7EKZ9pYcMNk5T9ACixkGYfpcrCW55Az6xUfPSvt3FjiVUy6EjpG2?cluster=devnet)
3. **Place Limit Bid Order:** [Y8AjodP9GzHxHanzif2X8FADmsG6djKro5JG5RsuCtKtrTdhuxXAwhzhfXSt1oZDD5Wqs4LRKxtEiMXdgWha1j1](https://explorer.solana.com/tx/Y8AjodP9GzHxHanzif2X8FADmsG6djKro5JG5RsuCtKtrTdhuxXAwhzhfXSt1oZDD5Wqs4LRKxtEiMXdgWha1j1?cluster=devnet)
4. **Place Limit Ask Order:** [ceLozcJCB46CRRvWg95HT7Ep1Fez8W1pgqNUJ1ns4GqZwfv9cuKBYzS8uR1PhkUQHkzGTWxLxLas9TiwfoZDEPV](https://explorer.solana.com/tx/ceLozcJCB46CRRvWg95HT7Ep1Fez8W1pgqNUJ1ns4GqZwfv9cuKBYzS8uR1PhkUQHkzGTWxLxLas9TiwfoZDEPV?cluster=devnet)
5. **Match Orders:** [5EMRMiJ67YHw4qkjWfRyYkdUgJX7wQ7Xt2ieoMZJt8SsXKmQ3wafJEJ3YPMXpep2eZqDGTTh1sPBgRmMwrwHXqRd](https://explorer.solana.com/tx/5EMRMiJ67YHw4qkjWfRyYkdUgJX7wQ7Xt2ieoMZJt8SsXKmQ3wafJEJ3YPMXpep2eZqDGTTh1sPBgRmMwrwHXqRd?cluster=devnet)
6. **Settle Balances:** [5hkErGqXoSWtucmMNjxpk9Dg4wC9rNYYqmeyuUMzbA9HPBi1barLrcuykA9EQQ8iknRBvJM4ZjSyDoqnGG9nGaqY](https://explorer.solana.com/tx/5hkErGqXoSWtucmMNjxpk9Dg4wC9rNYYqmeyuUMzbA9HPBi1barLrcuykA9EQQ8iknRBvJM4ZjSyDoqnGG9nGaqY?cluster=devnet)

## Build & Test Instructions

Build the Anchor program:
```bash
anchor build
```

Run test cases locally:
```bash
anchor test
```

Demonstrate live devnet transaction scripts:
```bash
npx ts-node client/cli/demo.ts
```

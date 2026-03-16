const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

async function main() {
    // 1. Setup Connection to Devnet
    const connection = new Connection("https://devnet.helius-rpc.com/?api-key=15319bf8-e0f1-44ee-888b-1c1e63b6e8d2", "confirmed");
    
    // 2. Load the IDL
    const idlPath = path.join(__dirname, '../target/idl/order_matching_engine.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    
    // 3. Setup dummy wallet provider for Anchor
    const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });
    anchor.setProvider(provider);

    const programId = new PublicKey("CgG3NfTRRTUcAx5qhCh4LWe1pX79WMBU8M4WfB69MP6j");
    const program = new anchor.Program(idl, provider);

    console.log(`\x1b[35m=== Solana Order Matching Engine (CLI Viewer) ===\x1b[0m`);
    console.log("Fetching markets...\n");

    try {
        // 4. Fetch all markets to get a valid live one
        const markets = await program.account.market.all();
        if (markets.length === 0) {
            console.log("❌ No markets found on devnet.");
            return;
        }
        
        const activeMarket = markets[0];
        const marketPda = activeMarket.publicKey;
        const marketAccount = activeMarket.account;

        console.log(`Market Found: ${marketPda.toBase58()}\n`);
        console.log(`🚀 Total Volume Match: \x1b[32m${marketAccount.totalVolume.toString()}\x1b[0m`);

        // 5. Fetch all orders for this market
        console.log("Fetching live order book data...\n");
        const allOrders = await program.account.order.all([
            {
                memcmp: {
                    offset: 8, // anchor discriminator
                    bytes: marketPda.toBase58()
                }
            }
        ]);

        const bids = allOrders
            .filter(o => o.account.side.hasOwnProperty('bid') && o.account.quantityRemaining.toNumber() > 0)
            .sort((a, b) => b.account.price.toNumber() - a.account.price.toNumber());

        const asks = allOrders
            .filter(o => o.account.side.hasOwnProperty('ask') && o.account.quantityRemaining.toNumber() > 0)
            .sort((a, b) => a.account.price.toNumber() - b.account.price.toNumber());

        console.log(`\x1b[41m === 🔴 ASKS (SELLS) === \x1b[0m`);
        const toBase58Safe = (key) => { if (!key) return 'unknown'; if (typeof key === 'string') return key; if (key.toBase58) return key.toBase58(); return key.toString(); };
        const askTable = asks.map(a => ({
            "Order ID": `#${a.account.orderId.toString()}`,
            "Owner": toBase58Safe(a.account.owner).slice(0, 6) + "...",
            "Price": `\x1b[31m${a.account.price.toString()}\x1b[0m`,
            "Remaining": a.account.quantityRemaining.toString()
        }));
        if (askTable.length > 0) console.table(askTable);
        else console.log("   (No active asks)\n");

        console.log(`\x1b[42m === 🟢 BIDS (BUYS) === \x1b[0m`);
        const bidTable = bids.map(b => ({
            "Order ID": `#${b.account.orderId.toString()}`,
            "Owner": toBase58Safe(b.account.owner).slice(0, 6) + "...",
            "Price": `\x1b[32m${b.account.price.toString()}\x1b[0m`,
            "Remaining": b.account.quantityRemaining.toString()
        }));
        if (bidTable.length > 0) console.table(bidTable);
        else console.log("   (No active bids)\n");

        const spread = bids[0] && asks[0] ? asks[0].account.price.toNumber() - bids[0].account.price.toNumber() : null;
        if (spread !== null) {
            console.log(`📊 Current Spread: \x1b[1m${spread}\x1b[0m`);
        }

    } catch (err) {
        console.error("Error drawing orderbook:", err);
    }
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});

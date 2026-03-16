import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getProvider, getProgram, getOrderPda, getPositionPda, explorerUrl } from "./utils";

async function main() {
  const provider = getProvider();
  anchor.setProvider(provider);
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;

  const marketPda = new PublicKey("Fj3omhxNpq5SYufmY2NpoDAFZFDRkBcBdNhr2Lf6TCu6");
  
  console.log("Authority:", authority.toBase58());
  console.log("Market PDA:", marketPda.toBase58());

  // Di demo sebelumnya, Bid ditempatkan di order_id 1 (price 1500, qty 10)
  // Sekarang kita tempatkan Ask di order_id 2 (price 1500, qty 5)
  const [askOrderPda] = getOrderPda(marketPda, BigInt(2));
  const [positionPda] = getPositionPda(marketPda, authority);

  console.log("\n[1] Menempatkan Order Ask (Harga: 1500, Qty: 5)...");
  try {
    const tx = await program.methods
      .placeOrder({ ask: {} }, new anchor.BN(1500), new anchor.BN(5))
      .accounts({
        market: marketPda,
        order: askOrderPda,
        userPosition: positionPda,
        trader: authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("TX Place Ask:", explorerUrl(tx));
  } catch (err: any) {
    console.error("Gagal placeOrder ask:", err.message);
  }

  // Bid order PDA (order_id 1)
  const [bidOrderPda] = getOrderPda(marketPda, BigInt(1));

  console.log("\n[2] Menjalankan Match Orders...");
  try {
    const tx = await program.methods
      .matchOrders()
      .accounts({
        market: marketPda,
        bidOrder: bidOrderPda,
        askOrder: askOrderPda,
        bidPosition: positionPda, // karena trader sama (authority) untuk simplifikasi
        askPosition: positionPda,
        crank: authority,
      })
      .rpc();
    console.log("TX Match Orders:", explorerUrl(tx));
  } catch (err: any) {
    console.error("Gagal matchOrders:", err.message);
  }

  console.log("\n[3] Settle Balances...");
  try {
    const tx = await program.methods
      .settle()
      .accounts({
        market: marketPda,
        userPosition: positionPda,
        trader: authority,
      })
      .rpc();
    console.log("TX Settle:", explorerUrl(tx));
  } catch (err: any) {
    console.error("Gagal settle:", err.message);
  }
}

main().catch(console.error);

import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { getProvider, getProgram, getMarketPda, getOrderPda, getPositionPda, explorerUrl } from "./utils";
import fs from "fs";

async function main() {
  const provider = getProvider();
  anchor.setProvider(provider);
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;

  console.log("=== Demo Order Matching Engine di Devnet ===");
  console.log("Authority:", authority.toBase58());

  // Buat Mints dummy untuk test
  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();
  console.log("Base Mint (dummy):", baseMint.publicKey.toBase58());
  console.log("Quote Mint (dummy):", quoteMint.publicKey.toBase58());

  const [marketPda] = getMarketPda(baseMint.publicKey, quoteMint.publicKey);
  console.log("Market PDA:", marketPda.toBase58());

  // 1. Initialize Market
  console.log("\n[1] Menginisialisasi Market (MINT1/MINT2)...");
  try {
    const tx = await program.methods
      .initializeMarket("MINT1/MINT2")
      .accounts({
        market: marketPda,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        authority: authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Sukses! Explorer:", explorerUrl(tx));
  } catch (err) {
    console.error("Gagal initializeMarket:", err);
    return;
  }

  // 2. Place Bid Order
  console.log("\n[2] Menempatkan Order Bid (Harga: 1500, Qty: 10)...");
  const [orderPda] = getOrderPda(marketPda, BigInt(1));
  const [positionPda] = getPositionPda(marketPda, authority);

  try {
    const tx = await program.methods
      .placeOrder({ bid: {} }, new anchor.BN(1500), new anchor.BN(10))
      .accounts({
        market: marketPda,
        order: orderPda,
        userPosition: positionPda,
        trader: authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Sukses Place Bid! Explorer:", explorerUrl(tx));
    console.log("Order PDA:", orderPda.toBase58());
  } catch (err) {
    console.error("Gagal placeOrder:", err);
    return;
  }

  console.log("\n=== Demo Selesai ===");
}

main().catch(console.error);

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import os from "os";

export const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID ?? "CgG3NfTRRTUcAx5qhCh4LWe1pX79WMBU8M4WfB69MP6j"
);

export function getProvider(): anchor.AnchorProvider {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const walletPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

export function getProgram(provider: anchor.AnchorProvider) {
  const idlPath = path.resolve(__dirname, "../../target/idl/order_matching_engine.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  return new anchor.Program(idl, provider);
}

export function getMarketPda(baseMint: PublicKey, quoteMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), baseMint.toBuffer(), quoteMint.toBuffer()],
    PROGRAM_ID
  );
}

export function getOrderPda(marketPda: PublicKey, orderId: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("order"), marketPda.toBuffer(),
     Buffer.from(new anchor.BN(orderId.toString()).toArrayLike(Buffer, "le", 8))],
    PROGRAM_ID
  );
}

export function getPositionPda(marketPda: PublicKey, trader: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPda.toBuffer(), trader.toBuffer()],
    PROGRAM_ID
  );
}

export function explorerUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

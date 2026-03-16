"use client";

import { useState, useEffect, useCallback } from "react";
import * as anchor from "@coral-xyz/anchor";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "CgG3NfTRRTUcAx5qhCh4LWe1pX79WMBU8M4WfB69MP6j"
);

function getOrderPda(marketPda: PublicKey, orderId: bigint, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("order"), marketPda.toBuffer(),
     Buffer.from(new anchor.BN(orderId.toString()).toArrayLike(Buffer, "le", 8))],
    programId
  );
}

function getPositionPda(marketPda: PublicKey, trader: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPda.toBuffer(), trader.toBuffer()],
    programId
  );
}

function explorerUrl(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

export default function Dashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [program, setProgram] = useState<anchor.Program | null>(null);
  const [market, setMarket] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [asks, setAsks] = useState<any[]>([]);
  const [position, setPosition] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [txLog, setTxLog] = useState<{ label: string; sig: string }[]>([]);
  const [orderSide, setOrderSide] = useState<"bid" | "ask">("bid");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderQty, setOrderQty] = useState("");
  const [marketAddress, setMarketAddress] = useState(
    process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? ""
  );

  useEffect(() => {
    if (!wallet.publicKey) return;
    const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    anchor.setProvider(provider);
  }, [wallet.publicKey, connection]);

  const logTx = (label: string, sig: string) => {
    setTxLog((prev) => [{ label, sig }, ...prev.slice(0, 9)]);
  };

  const refresh = useCallback(async () => {
    if (!program || !marketAddress) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(marketAddress);
      const marketState = await program.account.market.fetch(marketPda);
      setMarket(marketState);

      const maxId = marketState.nextOrderId.toNumber();
      const b: any[] = [], a: any[] = [];
      for (let i = 1; i < maxId; i++) {
        try {
          const [orderPda] = getOrderPda(marketPda, BigInt(i), PROGRAM_ID);
          const order = await program.account.order.fetch(orderPda);
          const isOpen = "open" in order.status || "partiallyFilled" in order.status;
          if (!isOpen) continue;
          if ("bid" in order.side) b.push({ ...order, pda: orderPda });
          else a.push({ ...order, pda: orderPda });
        } catch {}
      }
      b.sort((x, y) => y.price.toNumber() - x.price.toNumber());
      a.sort((x, y) => x.price.toNumber() - y.price.toNumber());
      setBids(b);
      setAsks(a);

      if (wallet.publicKey) {
        const [posPda] = getPositionPda(marketPda, wallet.publicKey, PROGRAM_ID);
        try {
          setPosition(await program.account.userPosition.fetch(posPda));
        } catch { setPosition(null); }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [program, marketAddress, wallet.publicKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const handlePlaceOrder = async () => {
    if (!program || !wallet.publicKey || !marketAddress) return;
    const price = parseInt(orderPrice), qty = parseInt(orderQty);
    if (!price || !qty) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(marketAddress);
      const ms = await program.account.market.fetch(marketPda);
      const [orderPda] = getOrderPda(marketPda, BigInt(ms.nextOrderId.toString()), PROGRAM_ID);
      const [posPda] = getPositionPda(marketPda, wallet.publicKey, PROGRAM_ID);
      const side = orderSide === "bid" ? { bid: {} } : { ask: {} };
      const tx = await program.methods
        .placeOrder(side, new anchor.BN(price), new anchor.BN(qty))
        .accounts({ market: marketPda, order: orderPda, userPosition: posPda, trader: wallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      logTx(`Place ${orderSide.toUpperCase()} @ ${price}`, tx);
      setOrderPrice(""); setOrderQty("");
      await refresh();
    } catch (e: any) { alert(e.message); }
    setLoading(false);
  };

  const handleMatch = async () => {
    if (!program || !wallet.publicKey || !marketAddress || !bids[0] || !asks[0]) return;
    if (bids[0].price.toNumber() < asks[0].price.toNumber()) {
      alert("No match: bid price < ask price"); return;
    }
    setLoading(true);
    try {
      const marketPda = new PublicKey(marketAddress);
      const [bidPosPda] = getPositionPda(marketPda, bids[0].trader, PROGRAM_ID);
      const [askPosPda] = getPositionPda(marketPda, asks[0].trader, PROGRAM_ID);
      const tx = await program.methods.matchOrders()
        .accounts({ market: marketPda, bidOrder: bids[0].pda, askOrder: asks[0].pda, bidPosition: bidPosPda, askPosition: askPosPda, crank: wallet.publicKey })
        .rpc();
      logTx(`Match bid #${bids[0].orderId} vs ask #${asks[0].orderId}`, tx);
      await refresh();
    } catch (e: any) { alert(e.message); }
    setLoading(false);
  };

  const handleSettle = async () => {
    if (!program || !wallet.publicKey || !marketAddress) return;
    setLoading(true);
    try {
      const marketPda = new PublicKey(marketAddress);
      const [posPda] = getPositionPda(marketPda, wallet.publicKey, PROGRAM_ID);
      const tx = await program.methods.settle()
        .accounts({ market: marketPda, userPosition: posPda, trader: wallet.publicKey })
        .rpc();
      logTx("Settle balances", tx);
      await refresh();
    } catch (e: any) { alert(e.message); }
    setLoading(false);
  };

  const spread = bids[0] && asks[0] ? asks[0].price.toNumber() - bids[0].price.toNumber() : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e2e8f0", fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e2533", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ color: "#7c3aed", fontWeight: 700, fontSize: 18 }}>OME</span>
          <span style={{ color: "#64748b", marginLeft: 8, fontSize: 13 }}>On-Chain Order Matching Engine · Devnet</span>
        </div>
        <WalletMultiButton style={{ fontSize: 13, height: 36 }} />
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

        {/* Market input */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={marketAddress}
            onChange={(e) => setMarketAddress(e.target.value)}
            placeholder="Market PDA address..."
            style={{ width: "100%", padding: "8px 12px", background: "#161b27", border: "1px solid #1e2533", borderRadius: 6, color: "#e2e8f0", fontSize: 12, boxSizing: "border-box" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Order Book */}
          <div style={{ background: "#161b27", border: "1px solid #1e2533", borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>ORDER BOOK</span>
              {market && <span style={{ fontSize: 11, color: "#475569" }}>vol: {market.totalVolume.toString()}</span>}
            </div>

            <div style={{ fontSize: 11, color: "#475569", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>ID</span><span>PRICE</span><span>QTY</span>
            </div>

            {[...asks].reverse().slice(0, 5).map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "#f87171" }}>
                <span>#{a.orderId.toString()}</span>
                <span>{a.price.toString()}</span>
                <span>{a.quantityRemaining.toString()}</span>
              </div>
            ))}

            {spread !== null && (
              <div style={{ textAlign: "center", fontSize: 11, color: "#64748b", padding: "6px 0", borderTop: "1px solid #1e2533", borderBottom: "1px solid #1e2533", margin: "4px 0" }}>
                spread: {spread}
              </div>
            )}

            {bids.slice(0, 5).map((b, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "#4ade80" }}>
                <span>#{b.orderId.toString()}</span>
                <span>{b.price.toString()}</span>
                <span>{b.quantityRemaining.toString()}</span>
              </div>
            ))}

            {bids.length === 0 && asks.length === 0 && (
              <div style={{ color: "#475569", fontSize: 12, textAlign: "center", padding: "16px 0" }}>Empty</div>
            )}

            <button onClick={handleMatch} disabled={loading || !bids[0] || !asks[0]}
              style={{ marginTop: 12, width: "100%", padding: "8px 0", background: bids[0] && asks[0] ? "#7c3aed" : "#1e2533", color: "#e2e8f0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              ⚡ Crank Match Engine
            </button>
          </div>

          {/* Place Order */}
          <div style={{ background: "#161b27", border: "1px solid #1e2533", borderRadius: 8, padding: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>PLACE ORDER</span>

            <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 12 }}>
              {(["bid", "ask"] as const).map((s) => (
                <button key={s} onClick={() => setOrderSide(s)}
                  style={{ flex: 1, padding: "8px 0", background: orderSide === s ? (s === "bid" ? "#166534" : "#7f1d1d") : "#1e2533", color: orderSide === s ? (s === "bid" ? "#4ade80" : "#f87171") : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                  {s === "bid" ? "BID (Buy)" : "ASK (Sell)"}
                </button>
              ))}
            </div>

            {[["PRICE", orderPrice, setOrderPrice], ["QUANTITY", orderQty, setOrderQty]].map(([label, val, setter]: any) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: "#64748b" }}>{label}</label>
                <input value={val} onChange={(e) => setter(e.target.value)} placeholder="0"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", background: "#0f1117", border: "1px solid #2d3748", borderRadius: 6, color: "#e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}

            {orderPrice && orderQty && (
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
                Locks: {orderSide === "bid" ? `${parseInt(orderPrice) * parseInt(orderQty)} quote` : `${orderQty} base`}
              </div>
            )}

            <button onClick={handlePlaceOrder} disabled={loading || !wallet.publicKey || !orderPrice || !orderQty}
              style={{ width: "100%", padding: "10px 0", background: orderSide === "bid" ? "#166534" : "#7f1d1d", color: "#e2e8f0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              {loading ? "..." : `Place ${orderSide.toUpperCase()}`}
            </button>

            {position && (
              <div style={{ marginTop: 14, padding: 12, background: "#0f1117", borderRadius: 6, border: "1px solid #1e2533" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>YOUR POSITION</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 12 }}>
                  {[["Base free", position.baseFree, true], ["Base locked", position.baseLocked, false],
                    ["Quote free", position.quoteFree, true], ["Quote locked", position.quoteLocked, false]].map(([k, v, highlight]: any) => (
                    <><span style={{ color: "#64748b" }}>{k}</span><span style={{ color: highlight ? "#4ade80" : "#e2e8f0" }}>{v.toString()}</span></>
                  ))}
                </div>
                {(position.baseFree.toNumber() > 0 || position.quoteFree.toNumber() > 0) && (
                  <button onClick={handleSettle} disabled={loading}
                    style={{ marginTop: 10, width: "100%", padding: "6px 0", background: "#1e3a5f", color: "#60a5fa", border: "1px solid #1d4ed8", borderRadius: 5, cursor: "pointer", fontSize: 12 }}>
                    Settle Free Balances
                  </button>
                )}
              </div>
            )}
          </div>

          {/* TX Log */}
          <div style={{ gridColumn: "1 / -1", background: "#161b27", border: "1px solid #1e2533", borderRadius: 8, padding: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>TRANSACTION LOG</span>
            {txLog.length === 0
              ? <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>No transactions yet.</div>
              : txLog.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 12, fontSize: 12, padding: "4px 0", borderBottom: "1px solid #1e2533" }}>
                  <span style={{ color: "#94a3b8", minWidth: 220 }}>{t.label}</span>
                  <a href={explorerUrl(t.sig)} target="_blank" rel="noreferrer" style={{ color: "#7c3aed" }}>
                    {t.sig.slice(0, 8)}...{t.sig.slice(-6)} ↗
                  </a>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

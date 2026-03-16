"use client";

import { useState, useEffect, useCallback } from "react";
import * as anchor from "@coral-xyz/anchor";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { toast } from "react-hot-toast";
import idl from "./order_matching_engine.json";

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

  const [program, setProgram] = useState<any>(null);
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
    const programInstance = new anchor.Program(idl as anchor.Idl, provider);
    setProgram(programInstance as any);
  }, [wallet.publicKey, connection]);

  const logTx = (label: string, sig: string) => {
    setTxLog((prev) => [{ label, sig }, ...prev.slice(0, 9)]);
  };

  const refresh = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    try {
      let activeMarketAddress = marketAddress;
      
      // Auto-fetch market if not set
      if (!activeMarketAddress) {
        const allMarkets = await program.account.market.all();
        if (allMarkets.length > 0) {
          activeMarketAddress = allMarkets[0].publicKey.toBase58();
          setMarketAddress(activeMarketAddress);
        } else {
          setLoading(false);
          return;
        }
      }

      const marketPda = new PublicKey(activeMarketAddress);
      const marketState = await program.account.market.fetch(marketPda);
      setMarket(marketState);

      // Fast fetch with .all()
      const allOrderAccounts = await program.account.order.all([
        { memcmp: { offset: 8, bytes: marketPda.toBase58() } }
      ]);
      
      const b: any[] = [], a: any[] = [];
      for (const orderAcc of allOrderAccounts) {
        const order = orderAcc.account;
        const isOpen = "open" in order.status || "partiallyFilled" in order.status;
        if (!isOpen) continue;
        if ("bid" in order.side) b.push({ ...order, pda: orderAcc.publicKey });
        else a.push({ ...order, pda: orderAcc.publicKey });
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
    const price = parseFloat(orderPrice);
    const qty = parseFloat(orderQty);
    if (!price || !qty || isNaN(price) || isNaN(qty)) return;
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
      toast.success(`Order placed: ${qty} @ ${price}`);
      setOrderPrice(""); setOrderQty("");
      await refresh();
    } catch (e: any) { 
      toast.error(e.message || "Custom Error");
      console.error(e);
    }
    setLoading(false);
  };

  const handleMatch = async () => {
    if (!program || !wallet.publicKey || !marketAddress || !bids[0] || !asks[0]) return;
    if (bids[0].price.toNumber() < asks[0].price.toNumber()) {
      toast.error("No overlap: Best bid < Best ask"); return;
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
      toast.success("Orders matched successfully!");
      await refresh();
    } catch (e: any) { 
      toast.error(e.message || "Custom Error");
      console.error(e);
    }
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
      toast.success("Balances settled!");
      await refresh();
    } catch (e: any) { 
      toast.error(e.message || "Custom Error");
      console.error(e);
    }
    setLoading(false);
  };

  const spread = bids[0] && asks[0] ? asks[0].price.toNumber() - bids[0].price.toNumber() : null;

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top Navbar */}
      <div style={{ borderBottom: "1px solid var(--border-subtle)", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {wallet.publicKey ? (
            <div className="badge-live">
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-cyan)", boxShadow: "0 0 8px var(--accent-cyan)" }} />
              LIVE DEVNET
            </div>
          ) : (
            <div className="badge-live" style={{ background: "rgba(255,255,255,0.05)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              DISCONNECTED
            </div>
          )}
          <div>
            <span className="title-font" style={{ fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>
              <span className="gradient-text">OME</span>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {market && <div className="glass-card" style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, color: "var(--text-muted)", border: "none" }}>Vol: <span className="mono" style={{ color: "#fff" }}>{market.totalVolume.toString()}</span></div>}
          <WalletMultiButton className="title-font" style={{ fontSize: 13, height: 38, borderRadius: 8, background: "var(--accent-purple)", border: "none" }} />
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        {/* Marketplace Selection Bar */}
        <div className="glass-card" style={{ marginBottom: 20, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, background: "rgba(10,12,18,0.3)" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>Active Market:</span>
          <input
            value={marketAddress}
            onChange={(e) => setMarketAddress(e.target.value)}
            placeholder="Auto-fetching active market..."
            className="input-custom"
            style={{ margin: 0, flex: 1, padding: "8px 12px", background: "rgba(0,0,0,0.2)" }}
          />
        </div>

        <div className="grid-container">
          {/* Panel Form / Place Order */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Form Place Order */}
            <div className="glass-card">
              <div style={{ marginBottom: 16, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 10 }}>
                <span className="title-font" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", letterSpacing: 0.5 }}>PLACE NEW ORDER</span>
              </div>

              {/* Side Selector */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {(["bid", "ask"] as const).map((s) => (
                  <button key={s} onClick={() => setOrderSide(s)}
                    className={`btn-action title-font ${orderSide === s ? (s === "bid" ? "btn-bid" : "btn-ask") : "btn-disabled"}`}
                    style={{ flex: 1, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {s === "bid" ? "Bid (Buy)" : "Ask (Sell)"}
                  </button>
                ))}
              </div>

              {/* Fields Inputs */}
              {[["PRICE (QUOTE)", orderPrice, setOrderPrice], ["QUANTITY (BASE)", orderQty, setOrderQty]].map(([label, val, setter]: any) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</label>
                  <input value={val} onChange={(e) => setter(e.target.value)} placeholder="0.00" className="input-custom" />
                </div>
              ))}

              {/* Locks Estimate */}
              {orderPrice && orderQty && !isNaN(parseFloat(orderPrice)) && !isNaN(parseFloat(orderQty)) && (
                <div style={{ padding: "8px 12px", background: "rgba(255,b255,255,0.02)", borderRadius: 6, marginBottom: 16, fontSize: 12, color: "var(--text-secondary)" }}>
                  Estimated Lock: <span className="mono" style={{ color: orderSide === "bid" ? "var(--green-neon)" : "var(--red-neon)" }}>
                    {orderSide === "bid" ? `${parseFloat(orderPrice) * parseFloat(orderQty)} quote` : `${orderQty} base`}
                  </span>
                </div>
              )}

              <button onClick={handlePlaceOrder} disabled={loading || !wallet.publicKey || !orderPrice || !orderQty}
                className={`btn-action title-font ${loading || !wallet.publicKey || !orderPrice || !orderQty ? "btn-disabled" : (orderSide === "bid" ? "btn-bid" : "btn-ask")}`}
                style={{ height: 44, fontSize: 14, textTransform: "uppercase" }}>
                {loading ? "Processing..." : `Place ${orderSide.toUpperCase()} Order`}
              </button>
            </div>

            {/* Position / User Balances Section */}
            {position && (
              <div className="glass-card" style={{ background: "rgba(124, 58, 237, 0.03)" }}>
                <div style={{ marginBottom: 16, borderBottom: "1px solid rgba(124, 58, 237, 0.1)", paddingBottom: 10 }}>
                  <span className="title-font" style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-purple)", letterSpacing: 0.5 }}>YOUR POSITION</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
                  {[
                    ["Base Free", position.baseFree, true], ["Base Locked", position.baseLocked, false],
                    ["Quote Free", position.quoteFree, true], ["Quote Locked", position.quoteLocked, false]
                  ].map(([k, v, highlight]: any) => (
                    <div key={k} style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>{k}</span>
                      <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: highlight ? "var(--green-neon)" : "var(--text-primary)" }}>
                        {v.toString()}
                      </span>
                    </div>
                  ))}
                </div>
                {(position.baseFree.toNumber() > 0 || position.quoteFree.toNumber() > 0) && (
                  <button onClick={handleSettle} disabled={loading} className="btn-action btn-crank title-font" style={{ marginTop: 20, height: 38, fontSize: 12, background: "transparent", border: "1px solid var(--accent-purple)", color: "var(--accent-purple)" }}>
                    {loading ? "Settling..." : "Settle Free Balances"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Panel Orderbook */}
          <div className="glass-card" style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: 16, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="title-font" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", letterSpacing: 0.5 }}>LIVE ORDER BOOK</span>
            </div>

            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", justifyContent: "space-between", padding: "0 8px 6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                <span style={{ width: "25%" }}>ID</span><span style={{ width: "35%", textAlign: "right" }}>PRICE</span><span style={{ width: "35%", textAlign: "right" }}>REMAINING</span>
              </div>

              {/* ASKS (SELLS) */}
              <div style={{ display: "flex", flexDirection: "column-reverse" }}>
                {[...asks].reverse().slice(0, 8).map((a, i) => (
                  <div key={i} className="order-row ask mono" style={{ fontSize: 13, padding: "5px 8px" }}>
                    <span style={{ width: "25%", color: "var(--text-secondary)" }}>#{a.orderId.toString()}</span>
                    <span style={{ width: "35%", textAlign: "right", fontWeight: 700 }}>{a.price.toString()}</span>
                    <span style={{ width: "35%", textAlign: "right" }}>{a.quantityRemaining.toString()}</span>
                  </div>
                ))}
              </div>

              {/* SPREAD DIVIDER */}
              {spread !== null ? (
                <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-secondary)", padding: "10px 0", background: "rgba(255,255,255,0.01)", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", margin: "6px 0", borderRadius: 4 }}>
                  <span className="title-font" style={{ fontWeight: 600, fontSize: 11, color: "var(--text-muted)" }}>SPREAD:</span> <span className="mono" style={{ color: "#fff", fontWeight: 700 }}>{spread}</span>
                </div>
              ) : (
                <div style={{ height: 1, background: "var(--border-subtle)", margin: "8px 0" }} />
              )}

              {/* BIDS (BUYS) */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {bids.slice(0, 8).map((b, i) => (
                  <div key={i} className="order-row bid mono" style={{ fontSize: 13, padding: "5px 8px" }}>
                    <span style={{ width: "25%", color: "var(--text-secondary)" }}>#{b.orderId.toString()}</span>
                    <span style={{ width: "35%", textAlign: "right", fontWeight: 700 }}>{b.price.toString()}</span>
                    <span style={{ width: "35%", textAlign: "right" }}>{b.quantityRemaining.toString()}</span>
                  </div>
                ))}
              </div>

              {bids.length === 0 && asks.length === 0 && (
                <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
                  No active orders on-chain
                </div>
              )}
            </div>

            <button onClick={handleMatch} disabled={loading || !bids[0] || !asks[0]}
              className={`btn-action title-font btn-crank`}
              style={{ marginTop: 20, height: 42, fontSize: 13, letterSpacing: 0.5 }}>
              ⚡ CRANK MATCH ENGINE
            </button>
          </div>

          {/* Panel Logs */}
          <div className="glass-card" style={{ gridColumn: "1 / -1" }}>
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="title-font" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: 0.5 }}>TRANSACTION LOG</span>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: txLog.length > 0 ? "var(--accent-purple)" : "var(--text-muted)" }} />
            </div>
            
            {txLog.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "10px 0" }}>No transactions executed yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {txLog.map((t, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.01)" }}>
                    <span className="mono" style={{ color: "var(--text-primary)" }}>{t.label}</span>
                    <a href={explorerUrl(t.sig)} target="_blank" rel="noreferrer" style={{ color: "var(--accent-purple)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
                      <span className="mono">{t.sig.slice(0, 8)}...{t.sig.slice(-8)}</span>
                      <span style={{ fontSize: 10 }}>↗</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

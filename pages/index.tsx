import { useEffect, useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";

type AgentCard = { id: string; name: string; model: string; format: string; version: number; blobId: string; owner: string };
type Cfg = { network: string; packageId: string; agentType: string; demoNftId?: string; transferPolicyId?: string; royaltyBps?: number; ownerAddress?: string };

const short = (s?: string, n = 6) => (s ? `${s.slice(0, n + 2)}…${s.slice(-4)}` : "");
const obj = (id?: string) => `https://suiscan.xyz/testnet/object/${id}`;

export default function Home() {
  const account = useCurrentAccount();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [agent, setAgent] = useState<AgentCard | null>(null);
  const [prompt, setPrompt] = useState("In one sentence, what makes you special?");
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [meta, setMeta] = useState<string>("");
  const [denial, setDenial] = useState<string>("");
  const [denying, setDenying] = useState(false);
  const [myNfts, setMyNfts] = useState<AgentCard[]>([]);

  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then((d) => { setCfg(d.config); setAgent(d.agent); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!account?.address) { setMyNfts([]); return; }
    fetch(`/api/nfts?address=${account.address}`).then((r) => r.json()).then((d) => setMyNfts(d.nfts || [])).catch(() => {});
  }, [account?.address]);

  async function runAgent() {
    setRunning(true); setOutput(""); setMeta("");
    try {
      const r = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ as: "owner", prompt }) });
      const d = await r.json();
      if (d.error) setOutput("⚠ " + d.error);
      else { setOutput(d.text); setMeta(`${d.model} · v${d.version} · ${(d.brainBytes / 1e6).toFixed(0)}MB decrypted from Walrus · ${(d.ms / 1000).toFixed(1)}s`); }
    } catch (e) { setOutput("⚠ " + String(e)); } finally { setRunning(false); }
  }
  async function tryDenial() {
    setDenying(true); setDenial("");
    try {
      const r = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ as: "stranger" }) });
      const d = await r.json();
      setDenial(d.denied ? `✓ Denied — Seal refused the key (${d.reason}). seal_approve saw a non-owner.` : `⚠ ${d.note || "not denied"}`);
    } catch (e) { setDenial("⚠ " + String(e)); } finally { setDenying(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">🌰 Walnut</h1>
            <p className="text-sm text-zinc-400">Intelligent NFT for Sui — own the brain, not the picture.</p>
          </div>
          <ConnectButton />
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Demo agent</h2>
            {cfg && <span className="text-xs text-zinc-500">{cfg.network}</span>}
          </div>
          {agent ? (
            <div className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-zinc-400">Name</span><span>{agent.name}</span>
              <span className="text-zinc-400">Model</span><span>{agent.model} ({agent.format})</span>
              <span className="text-zinc-400">Version</span><span>v{agent.version}</span>
              <span className="text-zinc-400">NFT</span><a className="text-emerald-400 hover:underline" href={obj(agent.id)} target="_blank" rel="noreferrer">{short(agent.id)}</a>
              <span className="text-zinc-400">Walrus blob</span><span className="truncate">{short(agent.blobId, 8)}</span>
              <span className="text-zinc-400">Owner</span><span>{short(agent.owner)}</span>
            </div>
          ) : <p className="mt-3 text-sm text-zinc-500">Loading… (run <code>npm run walnut:mint</code> if none)</p>}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <h2 className="font-medium mb-1">Run the agent</h2>
          <p className="text-xs text-zinc-500 mb-3">The model weights are pulled from Walrus, the AES key is released by Seal <em>only because the owner passes seal_approve</em>, decrypted, and run locally with node-llama-cpp (server-side). First run loads the 145MB model (~30s); later runs are fast.</p>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="w-full rounded-lg bg-zinc-800 border border-zinc-700 p-2 text-sm" />
          <button onClick={runAgent} disabled={running} className="mt-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-medium">
            {running ? "Running…" : "Run agent"}
          </button>
          {output && <div className="mt-3 rounded-lg bg-black/40 border border-zinc-800 p-3 text-sm whitespace-pre-wrap">🧠 {output}</div>}
          {meta && <p className="mt-2 text-xs text-zinc-500">{meta}</p>}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <h2 className="font-medium mb-1">Ownership = access</h2>
          <p className="text-xs text-zinc-500 mb-3">A fresh, non-owner key tries to decrypt the same brain. Seal&apos;s key servers evaluate seal_approve and refuse.</p>
          <button onClick={tryDenial} disabled={denying} className="rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 px-4 py-2 text-sm font-medium">
            {denying ? "Trying…" : "Try to run as a non-owner"}
          </button>
          {denial && <p className="mt-3 text-sm">{denial}</p>}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <h2 className="font-medium mb-2">Your Walnut NFTs</h2>
          {!account ? <p className="text-sm text-zinc-500">Connect a wallet to see your agents.</p>
            : myNfts.length === 0 ? <p className="text-sm text-zinc-500">No Walnut NFTs at {short(account.address)}.</p>
            : <ul className="text-sm space-y-1">{myNfts.map((n) => <li key={n.id}><a className="text-emerald-400 hover:underline" href={obj(n.id)} target="_blank" rel="noreferrer">{n.name}</a> — {n.model} v{n.version}</li>)}</ul>}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <h2 className="font-medium mb-1">Trade with enforced royalty</h2>
          <p className="text-xs text-zinc-500">Walnut trades via Kiosk + TransferPolicy ({cfg?.royaltyBps ? cfg.royaltyBps / 100 : 5}% creator royalty). After a sale the buyer calls claim_ownership and access follows them — the seller is locked out. Verified end-to-end by <code>npm run walnut:demo</code>.</p>
          {cfg?.transferPolicyId && <a className="text-emerald-400 hover:underline text-xs" href={obj(cfg.transferPolicyId)} target="_blank" rel="noreferrer">TransferPolicy ↗</a>}
        </section>

        <footer className="text-xs text-zinc-600 pt-2">
          {cfg && <a className="hover:underline" href={`https://suiscan.xyz/testnet/object/${cfg.packageId}`} target="_blank" rel="noreferrer">package {short(cfg.packageId)}</a>}
          <span className="mx-2">·</span>Nautilus re-encryption is simulated (see README §16).
        </footer>
      </div>
    </div>
  );
}

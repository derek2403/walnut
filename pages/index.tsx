import { useEffect, useRef, useState } from "react";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

type Agent = { id: string; name: string; modelId: string; owner: string; version: number; blobId: string };
type Cfg = {
  network: string; walnutPackageId: string; agentType: string;
  enclaveObjectId: string | null; teeUrl: string | null; models: { id: string; name: string }[];
};

const short = (s?: string, n = 6) => (s ? `${s.slice(0, n + 2)}…${s.slice(-4)}` : "");
const obj = (id?: string) => `https://suiscan.xyz/testnet/object/${id}`;
const avatar = (id: string) => `https://api.dicebear.com/9.x/bottts/svg?seed=${id}`;

function Pill({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? "bg-[#e7f0e9] text-[#3f7a52]" : "bg-[#f0ede4] text-[#8a8578]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[#4f9d6b]" : "bg-[#bdb7a8]"}`} />
      {children}
    </span>
  );
}

export default function Home() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("Research Assistant");
  const [modelId, setModelId] = useState("smollm2-135m");
  const [systemPrompt, setSystemPrompt] = useState("You are a concise research assistant. Be precise and cite sources.");
  const [minting, setMinting] = useState(false);
  const [mintMsg, setMintMsg] = useState("");
  const [selected, setSelected] = useState<Agent | null>(null);
  const [message, setMessage] = useState("Introduce yourself in one sentence.");
  const [thread, setThread] = useState<{ role: "you" | "agent"; text: string }[]>([]);
  const [chatting, setChatting] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/v2/config").then((r) => r.json()).then(setCfg).catch(() => {}); }, []);
  const refresh = () => {
    if (!account?.address) { setAgents([]); return; }
    fetch(`/api/v2/agents?address=${account.address}`).then((r) => r.json()).then((d) => setAgents(d.agents || [])).catch(() => {});
  };
  useEffect(refresh, [account?.address]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [thread, chatting]);

  async function mint() {
    if (!account) { setMintMsg("Connect a wallet first."); return; }
    setMinting(true); setMintMsg("Encrypting + storing on Walrus…");
    try {
      // 1) server prepares the encrypted blob (no mint) — plaintext is sealed to your wallet.
      const r = await fetch("/api/v2/prepare-mint", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, modelId, systemPrompt, owner: account.address }) });
      const d = await r.json();
      if (d.error) { setMintMsg("⚠ " + d.error); setMinting(false); return; }
      // 2) YOUR wallet signs the actual mint → you are creator + owner.
      setMintMsg("Approve the mint in your wallet…");
      const enc = new TextEncoder();
      const hexB = (h: string) => Array.from(Uint8Array.from((h.match(/../g) || []).map((x) => parseInt(x, 16))));
      const b64B = (b: string) => Array.from(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
      const tx = new Transaction();
      tx.moveCall({
        target: `${d.packageId}::walnut::mint_to_sender`,
        arguments: [
          tx.pure.vector("u8", Array.from(enc.encode(d.name))),
          tx.pure.vector("u8", Array.from(enc.encode(d.modelId))),
          tx.pure.vector("u8", hexB(d.nonceHex)),
          tx.pure.vector("u8", Array.from(enc.encode(d.blobId))),
          tx.pure.vector("u8", hexB(d.dataHashHex)),
          tx.pure.vector("u8", b64B(d.sealedKeyB64)),
        ],
      });
      const res = await signAndExecute({ transaction: tx });
      setMintMsg(`Minted — you signed it (${short(res.digest)}).`);
      setTimeout(refresh, 2000);
    } catch (e: unknown) { setMintMsg("⚠ " + (e instanceof Error ? e.message : String(e))); } finally { setMinting(false); }
  }

  async function send() {
    if (!selected || !message.trim()) return;
    const mine = message.trim();
    setThread((t) => [...t, { role: "you", text: mine }]); setMessage(""); setChatting(true);
    try {
      const r = await fetch("/api/v2/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nftId: selected.id, message: mine }) });
      const d = await r.json();
      const reply = d.reply || d.response?.data?.reply || (d.pending ? `⏳ ${d.note}` : d.error ? `⚠ ${d.error}` : JSON.stringify(d));
      setThread((t) => [...t, { role: "agent", text: reply }]);
    } catch (e) { setThread((t) => [...t, { role: "agent", text: "⚠ " + String(e) }]); } finally { setChatting(false); }
  }

  const curl = (a: Agent) =>
    `# 1) prove ownership → TEE bearer token\n` +
    `curl -X POST ${cfg?.teeUrl || "$TEE_URL"}/v1/auth/challenge \\\n  -d '{"nftId":"${a.id}","address":"${account?.address || "0xYOU"}"}'\n` +
    `# sign the nonce with your wallet, then:\n` +
    `curl -X POST ${cfg?.teeUrl || "$TEE_URL"}/v1/agents/${a.id}/chat \\\n  -H "Authorization: Bearer <token>" -d '{"message":"hello"}'`;

  const fieldCls = "w-full rounded-xl border border-[#e3e0d6] bg-[#fcfbf7] px-3.5 py-2.5 text-sm text-[#26241f] placeholder-[#a8a294] outline-none focus:border-[#d97757] focus:ring-2 focus:ring-[#d97757]/20 transition";
  const card = "rounded-2xl border border-[#ece9e0] bg-white shadow-[0_1px_2px_rgba(60,50,40,0.04),0_8px_24px_-12px_rgba(60,50,40,0.10)]";

  return (
    <div className="min-h-screen bg-[#faf9f5] text-[#26241f] antialiased" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-[#ece9e0] bg-[#faf9f5]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#5c4636] text-lg">🌰</span>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Walnut</div>
              <div className="text-[11px] text-[#8a8578]">Intelligent NFTs · Sui</div>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-10">
        {/* Hero */}
        <section className="mb-10">
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-[#1f1e1c] sm:text-[2.5rem]">
            Own the brain, not the picture.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#6b6862]">
            Mint an AI agent whose private system prompt is encrypted on Walrus, sealed to you, and run inside a Nautilus TEE. Own it, talk to it, sell it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Pill ok>{cfg?.network || "testnet"}</Pill>
            <Pill ok={!!cfg?.enclaveObjectId}>{cfg?.enclaveObjectId ? "enclave attested" : "enclave pending"}</Pill>
            <Pill ok={!!cfg?.teeUrl}>{cfg?.teeUrl ? "TEE connected" : "TEE not set"}</Pill>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Mint */}
          <section className={`${card} p-6 lg:col-span-2`}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8a8578]">Mint an agent</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#6b6862]">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#6b6862]">Hosted model</label>
                <select value={modelId} onChange={(e) => setModelId(e.target.value)} className={fieldCls}>
                  {(cfg?.models || [{ id: "smollm2-135m", name: "SmolLM2-135M-Instruct" }]).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#6b6862]">System prompt <span className="text-[#b6b0a2]">· private, encrypted</span></label>
                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={4} className={`${fieldCls} resize-none`} />
              </div>
              <button onClick={mint} disabled={minting || !account} className="w-full rounded-xl bg-[#d97757] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c96544] disabled:cursor-not-allowed disabled:opacity-50">
                {minting ? "Minting…" : account ? "Mint agent" : "Connect wallet to mint"}
              </button>
              {mintMsg && <p className="text-sm text-[#6b6862]">{mintMsg}</p>}
            </div>
          </section>

          {/* Agents + Chat */}
          <div className="space-y-6 lg:col-span-3">
            <section className={`${card} p-6`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8a8578]">Your agents</h2>
                {account && <span className="text-xs text-[#a8a294]">{short(account.address)}</span>}
              </div>
              {!account ? (
                <p className="mt-4 text-sm text-[#8a8578]">Connect a wallet to see your agents.</p>
              ) : agents.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-[#e3e0d6] bg-[#fcfbf7] p-6 text-center text-sm text-[#8a8578]">No agents yet — mint your first one.</div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {agents.map((a) => (
                    <button key={a.id} onClick={() => { setSelected(a); setThread([]); }} className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition ${selected?.id === a.id ? "border-[#d97757] bg-[#fdf3ef]" : "border-[#ece9e0] bg-[#fcfbf7] hover:border-[#d8d3c6]"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatar(a.id)} alt="" width={44} height={44} className="rounded-lg bg-white ring-1 ring-[#ece9e0]" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[#26241f]">{a.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="rounded-md bg-[#f0ede4] px-1.5 py-0.5 text-[10px] font-medium text-[#7a7568]">{a.modelId}</span>
                          <span className="text-[10px] text-[#a8a294]">v{a.version}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selected && (
              <section className={`${card} overflow-hidden`}>
                <div className="flex items-center gap-3 border-b border-[#ece9e0] px-5 py-3.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatar(selected.id)} alt="" width={36} height={36} className="rounded-lg ring-1 ring-[#ece9e0]" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{selected.name}</div>
                    <a href={obj(selected.id)} target="_blank" rel="noreferrer" className="text-[11px] text-[#a8a294] hover:text-[#d97757]">{short(selected.id)} ↗</a>
                  </div>
                  <button onClick={() => setSelected(null)} className="ml-auto text-xs text-[#a8a294] hover:text-[#6b6862]">close</button>
                </div>

                <div className="max-h-80 space-y-3 overflow-y-auto px-5 py-4">
                  {thread.length === 0 && <p className="py-6 text-center text-xs text-[#a8a294]">The enclave verifies you own this agent, decrypts its prompt in-TEE, and replies. {cfg?.teeUrl ? "" : "(Set TEE_URL to go live.)"}</p>}
                  {thread.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${m.role === "you" ? "bg-[#d97757] text-white" : "border border-[#ece9e0] bg-[#fcfbf7] text-[#26241f]"}`}>{m.text}</div>
                    </div>
                  ))}
                  {chatting && <div className="flex justify-start"><div className="rounded-2xl border border-[#ece9e0] bg-[#fcfbf7] px-3.5 py-2 text-sm text-[#a8a294]">thinking…</div></div>}
                  <div ref={chatEnd} />
                </div>

                <div className="border-t border-[#ece9e0] p-3">
                  <div className="flex items-end gap-2">
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Message your agent…" className={`${fieldCls} resize-none`} />
                    <button onClick={send} disabled={chatting} className="shrink-0 rounded-xl bg-[#d97757] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c96544] disabled:opacity-50">Send</button>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-[#a8a294] hover:text-[#6b6862]">Use as an API</summary>
                    <div className="relative mt-2">
                      <button onClick={() => { navigator.clipboard?.writeText(curl(selected)); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="absolute right-2 top-2 rounded-md bg-[#26241f] px-2 py-0.5 text-[10px] text-white/80 hover:text-white">{copied ? "copied" : "copy"}</button>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-[#26241f] p-3 pr-14 text-[11px] leading-relaxed text-[#e8e4da]">{curl(selected)}</pre>
                    </div>
                  </details>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Marketplace */}
        <section className={`${card} mt-6 p-6`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8a8578]">Marketplace</h2>
            <span className="rounded-full bg-[#f0ede4] px-2.5 py-1 text-xs text-[#8a8578]">5% royalty · Kiosk</span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#6b6862]">
            List an agent at a price via Kiosk + TransferPolicy. On sale, ownership flips, the enclave re-encrypts the brain to the buyer, and access follows them — the seller is locked out. <span className="text-[#a8a294]">Verified on-chain; in-app trading lands with the enclave.</span>
          </p>
        </section>

        <footer className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#a8a294]">
          {cfg && <a className="hover:text-[#d97757]" href={obj(cfg.walnutPackageId)} target="_blank" rel="noreferrer">walnut package {short(cfg.walnutPackageId)} ↗</a>}
          {cfg?.enclaveObjectId && <a className="hover:text-[#d97757]" href={obj(cfg.enclaveObjectId)} target="_blank" rel="noreferrer">enclave {short(cfg.enclaveObjectId)} ↗</a>}
          <span>Walrus · Seal · Nautilus · Kiosk</span>
        </footer>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Check, ChevronDown, Clock3, Copy, Download, FolderOpen, Gauge, Heart, History, Link2, ListMusic, Minus, MoreHorizontal, Play, Settings, ShieldCheck, Sparkles, Trash2, UserRound, X } from "lucide-react";

const URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/\S+$/;
const spring = { type: "spring", stiffness: 420, damping: 30 };

function formatViews(n) { if (n == null) return null; if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M views`; if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K views`; return `${n} views`; }
function formatDuration(s) { if (s == null) return null; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`; }
function formatDate(d) { if (!d || d.length !== 8) return null; return new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function tier(id) { if (id === "audio") return { short: "MP3", hint: "Audio only", tone: "mint" }; const h = Number(id); if (h >= 2160) return { short: "4K", hint: "Ultra HD", tone: "violet" }; if (h >= 1440) return { short: "2K", hint: "Quad HD", tone: "blue" }; if (h >= 1080) return { short: "FHD", hint: "Full HD", tone: "cyan" }; return { short: "HD", hint: "High definition", tone: "cyan" }; }

function WindowBar() {
  return <div className="window-bar"><div className="window-drag"><span className="window-mark"><Play fill="currentColor" /></span><span>YouTube Downloader</span></div><div className="window-controls"><button onClick={() => window.api?.minimize?.()}><Minus /></button><button onClick={() => window.api?.maximize?.()}><span className="maximize-icon" /></button><button className="window-close" onClick={() => window.api?.close?.()}><X /></button></div></div>;
}

function NavButton({ icon: Icon, label, active, onClick }) { return <button className={`nav-button ${active ? "is-active" : ""}`} onClick={onClick}><span><Icon /></span><b>{label}</b>{active && <motion.i layoutId="nav-dot" />}</button>; }
function Sidebar({ onSupport, onAbout }) { return <aside className="sidebar"><div className="brand-orb"><span><Play fill="currentColor" /></span></div><nav><NavButton icon={Download} label="Download" active /><NavButton icon={History} label="History" /><NavButton icon={Heart} label="Support" onClick={onSupport} /><NavButton icon={UserRound} label="About" onClick={onAbout} /></nav><div className="sidebar-spacer" /><div className="pulse-mark"><i /><i /><i /><i /><i /></div></aside>; }

const WALLETS = [
  { network: "USDT · TRON (TRC20)", address: "TB5V2sNE5GXFnvUmqtpYgKctQJyWrwkiV5", tone: "cyan" },
  { network: "USDT · BNB Smart Chain (BEP20)", address: "0x72d76520a1ce984281336c5503c5623aafe5f3ce", tone: "violet" },
];

function InfoModal({ kind, onClose }) {
  const [copied, setCopied] = useState("");
  const copyAddress = async (address) => { await navigator.clipboard.writeText(address); setCopied(address); setTimeout(() => setCopied(""), 1600); };
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
    <motion.section className="info-modal" initial={{ opacity: 0, y: 18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .97 }} transition={spring} onMouseDown={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={onClose}><X /></button>
      {kind === "support" ? <>
        <span className="modal-symbol support"><Heart fill="currentColor" /></span><small className="modal-kicker">OPTIONAL SUPPORT</small><h2>Enjoying the app?</h2><p className="modal-lead">YouTube Downloader will always stay free and ad-free. If it saved you time, you can support future updates.</p>
        <div className="wallet-list">{WALLETS.map((wallet) => <div className="wallet" key={wallet.network}><span className={`coin-dot ${wallet.tone}`}>₮</span><div><b>{wallet.network}</b><code>{wallet.address}</code></div><button onClick={() => copyAddress(wallet.address)}>{copied === wallet.address ? <Check /> : <Copy />}<span>{copied === wallet.address ? "Copied" : "Copy"}</span></button></div>)}</div>
        <p className="network-warning"><ShieldCheck /> Send only USDT using the network shown for each address.</p>
      </> : <>
        <span className="modal-symbol about"><UserRound /></span><small className="modal-kicker">MADE WITH CARE</small><h2>Crafted by Evgenii Selemenev</h2><p className="modal-lead">A focused desktop utility built to make high-quality downloads feel simple, fast and beautiful.</p>
        <div className="author-card"><div className="author-avatar">ES</div><div><b>Evgenii Selemenev</b><span>Designer & Developer</span></div><div className="discord-chip"><i />Discord · TOTORO<br/><small>@devilren</small></div></div>
        <div className="promise-row"><span><Check />Free forever</span><span><Check />No ads</span><span><Check />No tracking</span></div>
      </>}
    </motion.section>
  </motion.div>;
}

function SectionLabel({ icon: Icon, eyebrow, title, copy }) { return <div className="section-label"><span className="section-icon"><Icon /></span><div><small>{eyebrow}</small><h2>{title}</h2><p>{copy}</p></div></div>; }

function UrlPanel({ url, setUrl, onClear, onFetch, busy, fetching, valid }) {
  return <motion.section className="glass-panel url-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
    <div className="url-topline"><SectionLabel icon={Link2} eyebrow="SOURCE" title="Paste a YouTube URL" copy="Video, playlist or channel — we'll handle the rest." /><div className={`signal-pill ${valid ? "is-ready" : ""}`}><i />{fetching ? "Reading link" : valid ? "Link detected" : "Waiting for link"}</div></div>
    <div className={`url-field ${valid ? "is-valid" : ""}`}><Link2 /><input value={url} disabled={busy} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valid && onFetch()} placeholder="Paste youtube.com or youtu.be link" spellCheck={false} autoFocus />
      <AnimatePresence mode="wait">{fetching ? <motion.span key="loading" className="field-spinner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} /> : url ? <motion.button key="clear" className="field-clear" onClick={onClear} initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .8, opacity: 0 }}><X /></motion.button> : <motion.span key="paste" className="paste-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>CTRL V</motion.span>}</AnimatePresence>
    </div>
  </motion.section>;
}

function QualityPanel({ formats, selected, setSelected, busy }) {
  const [open, setOpen] = useState(false); const current = formats.find((f) => f.id === selected); const info = current ? tier(current.id) : null;
  return <motion.section className="glass-panel quality-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .06 }}>
    <SectionLabel icon={BadgeCheck} eyebrow="OUTPUT" title="Choose quality" copy="Select the ideal resolution." />
    <div className="quality-wrap"><button className={`quality-trigger ${open ? "is-open" : ""}`} onClick={() => formats.length && !busy && setOpen(!open)} disabled={!formats.length || busy}>
      {current ? <><span className={`quality-badge ${info.tone}`}>{info.short}</span><span className="quality-copy"><b>{current.label}</b><small>{info.hint}</small></span></> : <><span className="quality-badge empty"><Sparkles /></span><span className="quality-copy"><b>Auto quality</b><small>Paste a link to reveal options</small></span></>}<span className="chevron"><ChevronDown /></span>
    </button>
    <AnimatePresence>{open && <><button className="dropdown-scrim" onClick={() => setOpen(false)} /><motion.div className="quality-menu" initial={{ opacity: 0, y: -8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .97 }} transition={spring}><div className="menu-heading"><span>AVAILABLE FORMATS</span><Gauge /></div>{formats.map((f, i) => { const t = tier(f.id), active = f.id === selected; return <motion.button key={f.id} className={active ? "is-selected" : ""} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .035 }} onClick={() => { setSelected(f.id); setOpen(false); }}><span className={`quality-badge ${t.tone}`}>{t.short}</span><span><b>{f.label}</b><small>{t.hint}</small></span><span className="menu-check">{active && <Check />}</span></motion.button>; })}</motion.div></>}</AnimatePresence></div>
  </motion.section>;
}

function DownloadPanel({ ready, busy, statusText, onClick }) {
  return <motion.button className="download-panel" disabled={!ready || busy} onClick={onClick} whileHover={ready && !busy ? { y: -3, scale: 1.008 } : undefined} whileTap={ready && !busy ? { scale: .985 } : undefined} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}><span className="download-icon"><Download /></span><span className="download-copy"><small>{busy ? "IN PROGRESS" : ready ? "READY" : "NEXT STEP"}</small><b>Download</b><em>{statusText}</em></span><span className="download-arrow">↘</span></motion.button>;
}

function PreviewPanel({ meta, fetching }) {
  return <motion.section className="glass-panel preview-panel" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .08 }}><div className="preview-head"><span>VIDEO PREVIEW</span><button><MoreHorizontal /></button></div><AnimatePresence mode="wait">
    {fetching ? <motion.div key="loading" className="preview-skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div /><i /><i /></motion.div> : meta ? <motion.div key="meta" className="preview-content" initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }}><div className="thumbnail"><img src={meta.thumbnail} alt="" /><div /><span><Play fill="currentColor" /></span>{meta.duration != null && <time>{formatDuration(meta.duration)}</time>}</div><h3>{meta.title}</h3><div className="video-meta"><span className="avatar">{meta.uploader?.charAt(0)?.toUpperCase() || "Y"}</span><span><b>{meta.uploader}</b><small>{[formatViews(meta.viewCount), formatDate(meta.uploadDate)].filter(Boolean).join(" · ")}</small></span></div></motion.div> : <motion.div key="empty" className="preview-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="empty-visual"><span><Play /></span><i /><i /><i /></div><b>Your preview lives here</b><p>Paste a YouTube link and we'll fetch its artwork and details.</p></motion.div>}
  </AnimatePresence></motion.section>;
}

function DownloadsPanel({ downloads, onClearCompleted, onRemove }) {
  return <motion.section className="glass-panel downloads-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .14 }}><div className="downloads-heading"><SectionLabel icon={ListMusic} eyebrow="ACTIVITY" title={`Downloads · ${downloads.length}`} copy="Saved directly to your Downloads folder." /><button className="quiet-button" onClick={onClearCompleted}><Trash2 />Clear completed</button></div><div className="downloads-body"><AnimatePresence mode="popLayout">
    {!downloads.length ? <motion.div className="downloads-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><span><FolderOpen /></span><div><b>Nothing in the queue</b><small>Your next download will appear here.</small></div></motion.div> : downloads.map((d) => <motion.div className="download-row" key={d.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}><div className="row-thumb">{d.thumb ? <img src={d.thumb} alt="" /> : <Play />}</div><div className="row-main"><div className="row-title"><span><b>{d.title}</b><small>{d.formatLabel}</small></span><em>{d.status === "done" ? "Complete" : d.status === "error" ? "Failed" : `${Math.round(d.progress)}%`}</em></div><div className="progress-track"><motion.i animate={{ width: `${d.progress}%` }} /></div><div className="row-status"><span>{d.status === "updating" ? "Preparing engine…" : d.status === "error" ? d.error : d.status === "done" ? "Saved to Downloads" : "Downloading…"}</span>{d.eta && <span><Clock3 />{d.eta} left</span>}</div></div><button className="row-action" onClick={() => onRemove(d.id)} aria-label="Remove download"><X /></button></motion.div>)}
  </AnimatePresence></div></motion.section>;
}

export default function App() {
  const [url, setUrl] = useState(""); const [formats, setFormats] = useState([]); const [selected, setSelected] = useState(""); const [meta, setMeta] = useState(null); const [fetching, setFetching] = useState(false); const [busy, setBusy] = useState(false); const [statusText, setStatusText] = useState("Paste a link to start"); const [downloads, setDownloads] = useState([]); const [modal, setModal] = useState(null); const activeDownload = useRef(null); const fetchTimer = useRef(null); const fetchRequest = useRef(0);
  const patchActive = (patch) => { const id = activeDownload.current; if (id) setDownloads((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); };
  useEffect(() => { window.api.onStatus((s) => { if (s.includes("update")) { patchActive({ status: "updating" }); setStatusText("Preparing download…"); } else setStatusText("Downloading…"); }); window.api.onProgress(({ percent, eta }) => { patchActive({ status: "downloading", progress: percent, eta }); setStatusText(`${percent.toFixed(0)}% · downloading`); }); window.api.onDone((r) => { setBusy(false); if (r.success) { patchActive({ status: "done", progress: 100 }); setStatusText("Saved to Downloads"); } else { patchActive({ status: "error", error: r.error }); setStatusText("Download failed"); } }); }, []);
  const fetchVideo = async (target) => { const requestId = ++fetchRequest.current; setFetching(true); setFormats([]); setMeta(null); setStatusText("Reading video details…"); try { const r = await window.api.fetchFormats(target); if (requestId !== fetchRequest.current) return; setFetching(false); if (r.ok && r.formats.length) { setFormats(r.formats); setMeta(r.meta); setSelected(r.formats[0].id); setStatusText("Ready to download"); } else setStatusText(r.error || "Couldn't read this video"); } catch { if (requestId === fetchRequest.current) { setFetching(false); setStatusText("Couldn't connect to the download engine"); } } };
  useEffect(() => { if (fetchTimer.current) clearTimeout(fetchTimer.current); if (!URL_RE.test(url.trim()) || busy) return; fetchTimer.current = setTimeout(() => fetchVideo(url.trim()), 650); return () => clearTimeout(fetchTimer.current); }, [url]);
  const clearUrl = () => { fetchRequest.current += 1; setFetching(false); setUrl(""); setFormats([]); setMeta(null); setSelected(""); setStatusText("Paste a link to start"); };
  const startDownload = () => { if (!selected || !meta || busy) return; const id = Date.now(); activeDownload.current = id; setDownloads((items) => [{ id, title: meta.title, thumb: meta.thumbnail, formatLabel: selected === "audio" ? "MP3 · Audio" : `${selected}p · MP4`, progress: 0, eta: null, status: "updating" }, ...items]); setBusy(true); window.api.startDownload(url.trim(), selected); };
  const valid = URL_RE.test(url.trim()), ready = formats.length > 0 && !fetching;
  return <div className="app-shell"><WindowBar /><div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="app-body"><Sidebar onSupport={() => setModal("support")} onAbout={() => setModal("about")} /><main className="workspace"><header className="hero-heading"><div><span className="hero-kicker"><Sparkles />YOUR MEDIA, YOUR WAY</span><h1>YouTube <em>Downloader</em></h1><p>Maximum quality. Zero friction.</p></div><div className="hero-right"><div className="free-badge"><ShieldCheck /><span><b>FREE FOREVER</b><small>No ads · No tracking</small></span></div><div className="engine-status"><i /><span><small>ENGINE STATUS</small><b>Ready</b></span></div></div></header><div className="bento-grid"><UrlPanel url={url} setUrl={setUrl} onClear={clearUrl} onFetch={() => fetchVideo(url.trim())} busy={busy} fetching={fetching} valid={valid} /><PreviewPanel meta={meta} fetching={fetching} /><div className="actions-grid"><QualityPanel formats={formats} selected={selected} setSelected={setSelected} busy={busy} /><DownloadPanel ready={ready} busy={busy} statusText={statusText} onClick={startDownload} /></div><DownloadsPanel downloads={downloads} onClearCompleted={() => setDownloads((items) => items.filter((d) => d.status !== "done" && d.status !== "error"))} onRemove={(id) => setDownloads((items) => items.filter((d) => d.id !== id))} /></div><button className="signature" onClick={() => setModal("about")}>Made by Evgenii Selemenev · @devilren</button></main></div><AnimatePresence>{modal && <InfoModal kind={modal} onClose={() => setModal(null)} />}</AnimatePresence></div>;
}

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  FolderOpen,
  Gauge,
  Heart,
  History,
  Link2,
  ListMusic,
  Minus,
  MoreHorizontal,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

const URL_RE = /^https?:\/\/[^\s]+$/i;
const spring = { type: "spring", stiffness: 420, damping: 30 };

function formatViews(n) {
  if (n == null) return null;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M views`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K views`;
  return `${n} views`;
}
function formatDuration(s) {
  if (s == null) return null;
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}
function formatDate(d) {
  if (!d || d.length !== 8) return null;
  return new Date(
    `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
  ).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function tier(id) {
  if (id === "best")
    return { short: "MAX", hint: "Best available source", tone: "violet" };
  if (id === "audio") return { short: "MP3", hint: "Audio only", tone: "mint" };
  const h = Number(id);
  if (h >= 2160) return { short: "4K", hint: "Ultra HD", tone: "violet" };
  if (h >= 1440) return { short: "2K", hint: "Quad HD", tone: "blue" };
  if (h >= 1080) return { short: "FHD", hint: "Full HD", tone: "cyan" };
  return { short: "HD", hint: "High definition", tone: "cyan" };
}

function WindowBar() {
  return (
    <div className="window-bar">
      <div className="window-drag">
        <span className="window-mark">
          <Play fill="currentColor" />
        </span>
        <span>VantaFetch</span>
      </div>
      <div className="window-controls">
        <button onClick={() => window.api?.minimize?.()} aria-label="Minimize">
          <Minus />
        </button>
        <button
          className="window-close"
          onClick={() => window.api?.close?.()}
          aria-label="Close"
        >
          <X />
        </button>
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      className={`nav-button ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      <span>
        <Icon />
      </span>
      <b>{label}</b>
      {active && <motion.i layoutId="nav-dot" />}
    </button>
  );
}
function Sidebar({ page, onNavigate, onSupport, onAbout }) {
  return (
    <aside className="sidebar">
      <div className="brand-orb">
        <span>
          <Play fill="currentColor" />
        </span>
      </div>
      <nav>
        <NavButton
          icon={Download}
          label="Download"
          active={page === "download"}
          onClick={() => onNavigate("download")}
        />
        <NavButton icon={History} label="Queue" />
        <NavButton
          icon={Wrench}
          label="Tools"
          active={page === "tools"}
          onClick={() => onNavigate("tools")}
        />
        <NavButton icon={Heart} label="Support" onClick={onSupport} />
        <NavButton icon={UserRound} label="About" onClick={onAbout} />
      </nav>
      <div className="sidebar-spacer" />
      <div className="pulse-mark">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </aside>
  );
}

const SIZE_PRESETS = [
  { value: 8, label: "8 MB", note: "Safe / legacy" },
  { value: 20, label: "20 MB", note: "Discord Free" },
  { value: 50, label: "50 MB", note: "Nitro Basic" },
  { value: 500, label: "500 MB", note: "Nitro" },
];

function ToolsWorkspace() {
  const [mode, setMode] = useState("size");
  const [file, setFile] = useState(null);
  const [target, setTarget] = useState(8);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [audioFormat, setAudioFormat] = useState("flac");
  const [animationFormat, setAnimationFormat] = useState("webp");
  const [clipStart, setClipStart] = useState(0);
  const [clipDuration, setClipDuration] = useState(6);
  const [watermark, setWatermark] = useState(null);
  const [watermarkPosition, setWatermarkPosition] = useState("bottomRight");
  const [watermarkScale, setWatermarkScale] = useState(15);
  const [watermarkOpacity, setWatermarkOpacity] = useState(75);
  useEffect(() => {
    return window.api.onToolProgress((value) => setProgress(value));
  }, []);
  const pickFile = async () => {
    const selected = await window.api.pickMedia();
    if (selected) {
      setFile(selected);
      setResult(null);
      setProgress(0);
    }
  };
  const targetMb = custom === "" ? target : Number(custom);
  const pickWatermark = async () => {
    const selected = await window.api.pickWatermark();
    if (selected) {
      setWatermark(selected);
      setResult(null);
    }
  };
  const compress = async () => {
    if (!file || busy || !Number.isFinite(targetMb)) return;
    setBusy(true);
    setResult(null);
    setProgress(1);
    const response = await window.api.compressMedia({
      path: file.path,
      targetMb,
    });
    setBusy(false);
    setResult(response);
  };
  const runTool = async () => {
    if (mode === "size") return compress();
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    setProgress(1);
    let response;
    if (mode === "audio") {
      response = await window.api.extractAudio({
        path: file.path,
        format: audioFormat,
      });
    } else if (mode === "animation") {
      response = await window.api.createAnimation({
        path: file.path,
        format: animationFormat,
        start: clipStart,
        duration: clipDuration,
      });
    } else {
      response = await window.api.applyWatermark({
        path: file.path,
        watermarkPath: watermark?.path,
        position: watermarkPosition,
        scale: watermarkScale,
        opacity: watermarkOpacity / 100,
      });
    }
    setBusy(false);
    setResult(response);
  };
  const toolCopy =
    mode === "size"
      ? {
          kicker: "LOCAL OPTIMIZER",
          title: "Fit video to an exact size",
          text: "Perfect for Discord, messengers and upload limits. Nothing leaves your PC.",
          button: "Optimize video",
          busy: "Two-pass precision encoding",
        }
      : mode === "audio"
        ? {
            kicker: "AUDIO LAB",
            title: "Extract pristine audio",
            text: "Create a FLAC or studio-compatible WAV locally without uploading the source.",
            button: "Extract audio",
            busy: "Decoding the original audio track",
          }
        : mode === "animation"
          ? {
              kicker: "MOTION MAKER",
              title: "Create GIF or animated WebP",
              text: "Turn a short moment into a lightweight animation for chats and posts.",
              button: "Create animation",
              busy: "Rendering frames and colors",
            }
          : {
              kicker: "BRAND STUDIO",
              title: "Add a subtle watermark",
              text: "Place your transparent logo with precise size and opacity controls.",
              button: "Apply watermark",
              busy: "Compositing your branded video",
            };
  const ToolIcon =
    mode === "audio"
      ? ListMusic
      : mode === "animation"
        ? Play
        : mode === "watermark"
          ? BadgeCheck
          : Gauge;
  return (
    <motion.div
      className="tools-workspace"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="tool-switcher">
        <button
          className={mode === "size" ? "is-active" : ""}
          onClick={() => {
            setMode("size");
            setResult(null);
          }}
        >
          <Gauge />
          <span>
            <b>Fit to size</b>
            <small>Discord-ready video</small>
          </span>
        </button>
        <button
          className={mode === "watermark" ? "is-active" : ""}
          onClick={() => {
            setMode("watermark");
            setResult(null);
          }}
        >
          <BadgeCheck />
          <span>
            <b>Watermark</b>
            <small>Logo overlay</small>
          </span>
        </button>
        <button
          className={mode === "audio" ? "is-active" : ""}
          onClick={() => {
            setMode("audio");
            setResult(null);
          }}
        >
          <ListMusic />
          <span>
            <b>Audio</b>
            <small>FLAC or WAV</small>
          </span>
        </button>
        <button
          className={mode === "animation" ? "is-active" : ""}
          onClick={() => {
            setMode("animation");
            setResult(null);
          }}
        >
          <Play />
          <span>
            <b>Animation</b>
            <small>GIF or WebP</small>
          </span>
        </button>
      </div>
      <section className="glass-panel tool-intro">
        <div className="tool-heading">
          <span className="panel-icon">
            <ToolIcon />
          </span>
          <div>
            <small>{toolCopy.kicker}</small>
            <h2>{toolCopy.title}</h2>
            <p>{toolCopy.text}</p>
          </div>
        </div>
        <button
          className={`file-drop ${file ? "has-file" : ""}`}
          onClick={pickFile}
          disabled={busy}
        >
          <span>
            <FolderOpen />
          </span>
          <div>
            <b>{file?.name || "Choose a media file"}</b>
            <small>
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${Math.ceil(file.duration)} sec`
                : "Video or audio · processed locally"}
            </small>
          </div>
          <em>{file ? "Change" : "Browse"}</em>
        </button>
      </section>
      <section className="glass-panel size-tool">
        {mode === "size" && (
          <>
            <div className="tool-section-label">
              <span>OUTPUT LIMIT</span>
              <b>{targetMb || 0} MB</b>
            </div>
            <div className="size-presets">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  className={
                    custom === "" && target === preset.value
                      ? "is-selected"
                      : ""
                  }
                  onClick={() => {
                    setTarget(preset.value);
                    setCustom("");
                  }}
                  disabled={busy}
                >
                  <b>{preset.label}</b>
                  <small>{preset.note}</small>
                </button>
              ))}
            </div>
            <label className="custom-size">
              <span>Custom target</span>
              <div>
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={custom}
                  placeholder="Enter size"
                  onChange={(event) => setCustom(event.target.value)}
                  disabled={busy}
                />
                <b>MB</b>
              </div>
            </label>
          </>
        )}
        {mode === "audio" && (
          <div className="format-options">
            <div className="tool-section-label">
              <span>AUDIO FORMAT</span>
              <b>Lossless output</b>
            </div>
            <button
              className={audioFormat === "flac" ? "is-selected" : ""}
              onClick={() => setAudioFormat("flac")}
            >
              <b>FLAC</b>
              <small>Smaller file · metadata friendly</small>
            </button>
            <button
              className={audioFormat === "wav" ? "is-selected" : ""}
              onClick={() => setAudioFormat("wav")}
            >
              <b>WAV 24-bit</b>
              <small>Maximum compatibility for editors</small>
            </button>
            <p>
              Lossless output preserves the decoded source; it cannot restore
              detail already removed by the original platform.
            </p>
          </div>
        )}
        {mode === "animation" && (
          <div className="animation-options">
            <div className="tool-section-label">
              <span>ANIMATION</span>
              <b>Maximum 30 sec</b>
            </div>
            <div className="format-row">
              <button
                className={animationFormat === "webp" ? "is-selected" : ""}
                onClick={() => setAnimationFormat("webp")}
              >
                <b>WebP</b>
                <small>Compact · smooth</small>
              </button>
              <button
                className={animationFormat === "gif" ? "is-selected" : ""}
                onClick={() => setAnimationFormat("gif")}
              >
                <b>GIF</b>
                <small>Universal</small>
              </button>
            </div>
            <div className="clip-fields">
              <label>
                <span>Start</span>
                <div>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={clipStart}
                    onChange={(event) => setClipStart(event.target.value)}
                  />
                  <b>sec</b>
                </div>
              </label>
              <label>
                <span>Duration</span>
                <div>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="1"
                    value={clipDuration}
                    onChange={(event) => setClipDuration(event.target.value)}
                  />
                  <b>sec</b>
                </div>
              </label>
            </div>
          </div>
        )}
        {mode === "watermark" && (
          <div className="watermark-options">
            <div className="tool-section-label">
              <span>WATERMARK</span>
              <b>PNG or WebP</b>
            </div>
            <button
              className="watermark-picker"
              onClick={pickWatermark}
              disabled={busy}
            >
              <FolderOpen />
              <span>
                <b>{watermark?.name || "Choose transparent logo"}</b>
                <small>
                  {watermark
                    ? "Click to replace"
                    : "Recommended: high-resolution PNG"}
                </small>
              </span>
            </button>
            <span className="control-label">Position</span>
            <div className="position-grid">
              {[
                "topLeft",
                "topRight",
                "center",
                "bottomLeft",
                "bottomRight",
              ].map((position) => (
                <button
                  key={position}
                  className={
                    watermarkPosition === position ? "is-selected" : ""
                  }
                  onClick={() => setWatermarkPosition(position)}
                >
                  <i />
                </button>
              ))}
            </div>
            <label className="range-control">
              <span>
                <b>Size</b>
                <em>{watermarkScale}%</em>
              </span>
              <input
                type="range"
                min="5"
                max="50"
                value={watermarkScale}
                onChange={(event) => setWatermarkScale(event.target.value)}
              />
            </label>
            <label className="range-control">
              <span>
                <b>Opacity</b>
                <em>{watermarkOpacity}%</em>
              </span>
              <input
                type="range"
                min="5"
                max="100"
                value={watermarkOpacity}
                onChange={(event) => setWatermarkOpacity(event.target.value)}
              />
            </label>
          </div>
        )}
        <button
          className="compress-button"
          disabled={
            !file ||
            busy ||
            (mode === "size" && (targetMb < 1 || targetMb > 2000)) ||
            (mode === "watermark" && !watermark)
          }
          onClick={runTool}
        >
          <Download />
          <span>
            <b>{busy ? `Processing · ${progress}%` : toolCopy.button}</b>
            <small>
              {busy ? toolCopy.busy : "Save the result to Downloads"}
            </small>
          </span>
        </button>
        {(busy || result) && (
          <div
            className={`tool-result ${result?.ok === false ? "is-error" : ""}`}
          >
            {busy ? (
              <>
                <div className="tool-progress">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <span>
                  Keep VantaFetch open while your video is being optimized.
                </span>
              </>
            ) : result.ok ? (
              <>
                <Check />
                <span>Done — saved to your Downloads folder.</span>
              </>
            ) : (
              <>
                <X />
                <span>{result.error}</span>
              </>
            )}
          </div>
        )}
      </section>
      <section className="glass-panel tool-note">
        <ShieldCheck />
        <div>
          <b>Private by design</b>
          <p>
            Encoding runs entirely on this computer. VantaFetch never uploads
            your media or requests an account.
          </p>
        </div>
      </section>
    </motion.div>
  );
}

const WALLETS = [
  {
    network: "USDT · TRON (TRC20)",
    address: "TB5V2sNE5GXFnvUmqtpYgKctQJyWrwkiV5",
    tone: "cyan",
  },
  {
    network: "USDT · BNB Smart Chain (BEP20)",
    address: "0x72d76520a1ce984281336c5503c5623aafe5f3ce",
    tone: "violet",
  },
];

function InfoModal({ kind, onClose }) {
  const [copied, setCopied] = useState("");
  const copyAddress = async (address) => {
    await navigator.clipboard.writeText(address);
    setCopied(address);
    setTimeout(() => setCopied(""), 1600);
  };
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.section
        className="info-modal"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.97 }}
        transition={spring}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>
          <X />
        </button>
        {kind === "support" ? (
          <>
            <span className="modal-symbol support">
              <Heart fill="currentColor" />
            </span>
            <small className="modal-kicker">OPTIONAL SUPPORT</small>
            <h2>Enjoying the app?</h2>
            <p className="modal-lead">
              VantaFetch will always stay free and ad-free. If it saved you
              time, you can support future updates.
            </p>
            <div className="wallet-list">
              {WALLETS.map((wallet) => (
                <div className="wallet" key={wallet.network}>
                  <span className={`coin-dot ${wallet.tone}`}>₮</span>
                  <div>
                    <b>{wallet.network}</b>
                    <code>{wallet.address}</code>
                  </div>
                  <button onClick={() => copyAddress(wallet.address)}>
                    {copied === wallet.address ? <Check /> : <Copy />}
                    <span>{copied === wallet.address ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              ))}
            </div>
            <p className="network-warning">
              <ShieldCheck /> Send only USDT using the network shown for each
              address.
            </p>
          </>
        ) : (
          <>
            <span className="modal-symbol about">
              <UserRound />
            </span>
            <small className="modal-kicker">MADE WITH CARE</small>
            <h2>Crafted by Evgenii Selemenev</h2>
            <p className="modal-lead">
              A focused desktop utility built to make high-quality downloads
              feel simple, fast and beautiful.
            </p>
            <div className="author-card">
              <div className="author-avatar">ES</div>
              <div>
                <b>Evgenii Selemenev</b>
                <span>Designer & Developer</span>
              </div>
              <div className="discord-chip">
                <i />
                Discord · TOTORO
                <br />
                <small>@devilren</small>
              </div>
            </div>
            <div className="promise-row">
              <span>
                <Check />
                Free forever
              </span>
              <span>
                <Check />
                No ads
              </span>
              <span>
                <Check />
                No tracking
              </span>
            </div>
            <p className="legal-note">
              Powered by yt-dlp and FFmpeg. Not affiliated with YouTube or
              Google.
            </p>
          </>
        )}
      </motion.section>
    </motion.div>
  );
}

function SectionLabel({ icon: Icon, eyebrow, title, copy }) {
  return (
    <div className="section-label">
      <span className="section-icon">
        <Icon />
      </span>
      <div>
        <small>{eyebrow}</small>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
    </div>
  );
}

function UrlPanel({ url, setUrl, onClear, onFetch, busy, fetching, valid }) {
  return (
    <motion.section
      className="glass-panel url-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="url-topline">
        <SectionLabel
          icon={Link2}
          eyebrow="SOURCE"
          title="Paste a media URL"
          copy="Public video, clip, reel or stream — handled locally."
        />
        <div className={`signal-pill ${valid ? "is-ready" : ""}`}>
          <i />
          {fetching
            ? "Reading link"
            : valid
              ? "Link detected"
              : "Waiting for link"}
        </div>
      </div>
      <div className={`url-field ${valid ? "is-valid" : ""}`}>
        <Link2 />
        <input
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valid && onFetch()}
          placeholder="Paste a public media link"
          spellCheck={false}
          autoFocus
        />
        <AnimatePresence mode="wait">
          {fetching ? (
            <motion.span
              key="loading"
              className="field-spinner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />
          ) : url ? (
            <motion.button
              key="clear"
              className="field-clear"
              onClick={onClear}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <X />
            </motion.button>
          ) : (
            <motion.span
              key="paste"
              className="paste-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              CTRL V
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function QualityPanel({ formats, selected, setSelected, busy }) {
  const [open, setOpen] = useState(false);
  const current = formats.find((f) => f.id === selected);
  const info = current ? tier(current.id) : null;
  return (
    <motion.section
      className="glass-panel quality-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
    >
      <SectionLabel
        icon={BadgeCheck}
        eyebrow="OUTPUT"
        title="Choose quality"
        copy="Select the ideal resolution."
      />
      <div className="quality-wrap">
        <button
          className={`quality-trigger ${open ? "is-open" : ""}`}
          onClick={() => formats.length && !busy && setOpen(!open)}
          disabled={!formats.length || busy}
        >
          {current ? (
            <>
              <span className={`quality-badge ${info.tone}`}>{info.short}</span>
              <span className="quality-copy">
                <b>{current.label}</b>
                <small>{info.hint}</small>
              </span>
            </>
          ) : (
            <>
              <span className="quality-badge empty">
                <Sparkles />
              </span>
              <span className="quality-copy">
                <b>Auto quality</b>
                <small>Paste a link to reveal options</small>
              </span>
            </>
          )}
          <span className="chevron">
            <ChevronDown />
          </span>
        </button>
        <AnimatePresence>
          {open && (
            <>
              <button
                className="dropdown-scrim"
                onClick={() => setOpen(false)}
              />
              <motion.div
                className="quality-menu"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={spring}
              >
                <div className="menu-heading">
                  <span>AVAILABLE FORMATS</span>
                  <Gauge />
                </div>
                {formats.map((f, i) => {
                  const t = tier(f.id),
                    active = f.id === selected;
                  return (
                    <motion.button
                      key={f.id}
                      className={active ? "is-selected" : ""}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.035 }}
                      onClick={() => {
                        setSelected(f.id);
                        setOpen(false);
                      }}
                    >
                      <span className={`quality-badge ${t.tone}`}>
                        {t.short}
                      </span>
                      <span>
                        <b>{f.label}</b>
                        <small>{t.hint}</small>
                      </span>
                      <span className="menu-check">{active && <Check />}</span>
                    </motion.button>
                  );
                })}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function DownloadPanel({ ready, busy, statusText, onClick }) {
  return (
    <motion.button
      className="download-panel"
      disabled={!ready || busy}
      onClick={onClick}
      whileHover={ready && !busy ? { y: -3, scale: 1.008 } : undefined}
      whileTap={ready && !busy ? { scale: 0.985 } : undefined}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <span className="download-icon">
        <Download />
      </span>
      <span className="download-copy">
        <small>{busy ? "IN PROGRESS" : ready ? "READY" : "NEXT STEP"}</small>
        <b>Download</b>
        <em>{statusText}</em>
      </span>
      <span className="download-arrow">↘</span>
    </motion.button>
  );
}

function PreviewPanel({ meta, fetching }) {
  return (
    <motion.section
      className="glass-panel preview-panel"
      initial={{ opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.08 }}
    >
      <div className="preview-head">
        <span>VIDEO PREVIEW</span>
        <button>
          <MoreHorizontal />
        </button>
      </div>
      <AnimatePresence mode="wait">
        {fetching ? (
          <motion.div
            key="loading"
            className="preview-skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div />
            <i />
            <i />
          </motion.div>
        ) : meta ? (
          <motion.div
            key="meta"
            className={`preview-content ${meta.orientation || "landscape"}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="thumbnail">
              <img src={meta.thumbnail} alt="" />
              <div />
              <span>
                <Play fill="currentColor" />
              </span>
              <label>{meta.platform}</label>
              {meta.duration != null && (
                <time>{formatDuration(meta.duration)}</time>
              )}
            </div>
            <h3>{meta.title}</h3>
            <div className="video-meta">
              <span className="avatar">
                {meta.uploader?.charAt(0)?.toUpperCase() || "M"}
              </span>
              <span>
                <b>{meta.uploader}</b>
                <small>
                  {[
                    meta.platform,
                    formatViews(meta.viewCount),
                    formatDate(meta.uploadDate),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="preview-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="empty-visual">
              <span>
                <Play />
              </span>
              <i />
              <i />
              <i />
            </div>
            <b>Your preview lives here</b>
            <p>
              Paste a public media link and we'll fetch its artwork and details.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function DownloadsPanel({ downloads, onClearCompleted, onRemove }) {
  return (
    <motion.section
      className="glass-panel downloads-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14 }}
    >
      <div className="downloads-heading">
        <SectionLabel
          icon={ListMusic}
          eyebrow="ACTIVITY"
          title={`Downloads · ${downloads.length}`}
          copy="Saved directly to your Downloads folder."
        />
        <button className="quiet-button" onClick={onClearCompleted}>
          <Trash2 />
          Clear completed
        </button>
      </div>
      <div className="downloads-body">
        <AnimatePresence mode="popLayout">
          {!downloads.length ? (
            <motion.div
              className="downloads-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span>
                <FolderOpen />
              </span>
              <div>
                <b>Nothing in the queue</b>
                <small>Your next download will appear here.</small>
              </div>
            </motion.div>
          ) : (
            downloads.map((d) => (
              <motion.div
                className="download-row"
                key={d.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="row-thumb">
                  {d.thumb ? <img src={d.thumb} alt="" /> : <Play />}
                </div>
                <div className="row-main">
                  <div className="row-title">
                    <span>
                      <b>{d.title}</b>
                      <small>{d.formatLabel}</small>
                    </span>
                    <em>
                      {d.status === "done"
                        ? "Complete"
                        : d.status === "error"
                          ? "Failed"
                          : `${Math.round(d.progress)}%`}
                    </em>
                  </div>
                  <div className="progress-track">
                    <motion.i animate={{ width: `${d.progress}%` }} />
                  </div>
                  <div className="row-status">
                    <span>
                      {d.status === "updating"
                        ? "Preparing engine…"
                        : d.status === "error"
                          ? d.error
                          : d.status === "done"
                            ? "Saved to Downloads"
                            : "Downloading…"}
                    </span>
                    {d.eta && (
                      <span>
                        <Clock3 />
                        {d.eta} left
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="row-action"
                  onClick={() => onRemove(d.id)}
                  aria-label="Remove download"
                >
                  <X />
                </button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

export default function App() {
  const [page, setPage] = useState("download");
  const [url, setUrl] = useState("");
  const [formats, setFormats] = useState([]);
  const [selected, setSelected] = useState("");
  const [meta, setMeta] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Paste a link to start");
  const [downloads, setDownloads] = useState([]);
  const [modal, setModal] = useState(null);
  const activeDownload = useRef(null);
  const fetchTimer = useRef(null);
  const fetchRequest = useRef(0);
  const patchActive = (patch) => {
    const id = activeDownload.current;
    if (id)
      setDownloads((items) =>
        items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
  };
  useEffect(() => {
    window.api.onStatus((s) => {
      if (s.includes("update")) {
        patchActive({ status: "updating" });
        setStatusText("Preparing download…");
      } else setStatusText("Downloading…");
    });
    window.api.onProgress(({ percent, eta }) => {
      patchActive({ status: "downloading", progress: percent, eta });
      setStatusText(`${percent.toFixed(0)}% · downloading`);
    });
    window.api.onDone((r) => {
      setBusy(false);
      if (r.success) {
        patchActive({ status: "done", progress: 100 });
        setStatusText("Saved to Downloads");
      } else {
        patchActive({ status: "error", error: r.error });
        setStatusText("Download failed");
      }
    });
  }, []);
  const fetchVideo = async (target) => {
    const requestId = ++fetchRequest.current;
    setFetching(true);
    setFormats([]);
    setMeta(null);
    setStatusText("Reading video details…");
    try {
      const r = await window.api.fetchFormats(target);
      if (requestId !== fetchRequest.current) return;
      setFetching(false);
      if (r.ok && r.formats.length) {
        setFormats(r.formats);
        setMeta(r.meta);
        setSelected(r.formats[0].id);
        setStatusText("Ready to download");
      } else setStatusText(r.error || "Couldn't read this video");
    } catch {
      if (requestId === fetchRequest.current) {
        setFetching(false);
        setStatusText("Couldn't connect to the download engine");
      }
    }
  };
  useEffect(() => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    if (!URL_RE.test(url.trim()) || busy) return;
    fetchTimer.current = setTimeout(() => fetchVideo(url.trim()), 650);
    return () => clearTimeout(fetchTimer.current);
  }, [url]);
  const clearUrl = () => {
    fetchRequest.current += 1;
    setFetching(false);
    setUrl("");
    setFormats([]);
    setMeta(null);
    setSelected("");
    setStatusText("Paste a link to start");
  };
  const startDownload = () => {
    if (!selected || !meta || busy) return;
    const id = Date.now();
    activeDownload.current = id;
    const formatLabel =
      selected === "audio"
        ? "MP3 · Audio"
        : selected === "best"
          ? "Best available"
          : `${selected}p · MP4`;
    setDownloads((items) => [
      {
        id,
        title: meta.title,
        thumb: meta.thumbnail,
        formatLabel,
        progress: 0,
        eta: null,
        status: "updating",
      },
      ...items,
    ]);
    setBusy(true);
    window.api.startDownload(url.trim(), selected);
  };
  const valid = URL_RE.test(url.trim()),
    ready = formats.length > 0 && !fetching;
  return (
    <div className="app-shell">
      <WindowBar />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="app-body">
        <Sidebar
          page={page}
          onNavigate={setPage}
          onSupport={() => setModal("support")}
          onAbout={() => setModal("about")}
        />
        <main className="workspace">
          <header className="hero-heading">
            <div>
              <span className="hero-kicker">
                <Sparkles />
                PRIVATE · LOCAL · UNIVERSAL
              </span>
              <h1>
                Vanta<em>Fetch</em>
              </h1>
              <p>Universal media downloader. Zero ads, zero tracking.</p>
            </div>
            <div className="hero-right">
              <div className="free-badge">
                <ShieldCheck />
                <span>
                  <b>FREE FOREVER</b>
                  <small>No ads · No tracking</small>
                </span>
              </div>
              <div className="engine-status">
                <i />
                <span>
                  <small>ENGINE STATUS</small>
                  <b>Ready</b>
                </span>
              </div>
            </div>
          </header>
          {page === "tools" ? (
            <ToolsWorkspace />
          ) : (
            <div className="bento-grid">
              <UrlPanel
                url={url}
                setUrl={setUrl}
                onClear={clearUrl}
                onFetch={() => fetchVideo(url.trim())}
                busy={busy}
                fetching={fetching}
                valid={valid}
              />
              <PreviewPanel meta={meta} fetching={fetching} />
              <div className="actions-grid">
                <QualityPanel
                  formats={formats}
                  selected={selected}
                  setSelected={setSelected}
                  busy={busy}
                />
                <DownloadPanel
                  ready={ready}
                  busy={busy}
                  statusText={statusText}
                  onClick={startDownload}
                />
              </div>
              <DownloadsPanel
                downloads={downloads}
                onClearCompleted={() =>
                  setDownloads((items) =>
                    items.filter(
                      (d) => d.status !== "done" && d.status !== "error",
                    ),
                  )
                }
                onRemove={(id) =>
                  setDownloads((items) => items.filter((d) => d.id !== id))
                }
              />
            </div>
          )}
          <button className="signature" onClick={() => setModal("about")}>
            Made by Evgenii Selemenev · @devilren
          </button>
        </main>
      </div>
      <AnimatePresence>
        {modal && <InfoModal kind={modal} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  );
}

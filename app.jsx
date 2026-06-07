const { useState, useEffect, useRef, useCallback } = React;
const S = window.STRINGS;

/* ───────────────────────── helpers ───────────────────────── */

// deterministic hash from string (kept for avatar gradients)
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

// Build a deterministic two-color gradient from a seed
function gradientFor(seed) {
  const h = hashStr(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + (h % 60)) % 360;
  const c1 = `oklch(0.62 0.17 ${hue1})`;
  const c2 = `oklch(0.48 0.15 ${hue2})`;
  return { c1, c2, angle: (h % 4) * 45 + 25 };
}

async function fetchPost(url) {
  const res = await fetch("/api/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error("server_error");
  return res.json();
}

function downloadItem(item, account, idx) {
  const ext = item.kind === "video" ? "mp4" : "jpg";
  const filename = `snaggr_${account.username}_${String(idx + 1).padStart(2, "0")}.${ext}`;
  const proxyUrl = `/api/download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(filename)}`;
  const a = document.createElement("a");
  a.href = proxyUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

/* ───────────────────────── small UI bits ───────────────────────── */

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11,
        background: "linear-gradient(145deg, var(--accent-bright), var(--accent-deep))",
        display: "grid", placeItems: "center",
        boxShadow: "0 6px 20px var(--accent-glow), inset 0 1px 0 oklch(1 0 0 / 0.25)",
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v11" />
          <path d="M7 11l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>Snaggr</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.22em", color: "var(--faint)", marginTop: 3, textTransform: "uppercase" }}>media saver</span>
      </div>
    </div>
  );
}

function LangSwitch({ lang, setLang }) {
  return (
    <div style={{
      display: "flex", padding: 3, gap: 2, borderRadius: 99,
      background: "var(--surface)", border: "1px solid var(--border)",
    }}>
      {["en", "es"].map((l) => (
        <button key={l} onClick={() => setLang(l)} style={{
          border: "none", cursor: "pointer", padding: "6px 13px", borderRadius: 99,
          fontSize: 12.5, fontWeight: 600, letterSpacing: "0.02em",
          color: lang === l ? "white" : "var(--muted)",
          background: lang === l ? "linear-gradient(145deg, var(--accent-bright), var(--accent-deep))" : "transparent",
          boxShadow: lang === l ? "0 2px 10px var(--accent-glow)" : "none",
          transition: "all .2s var(--ease)",
        }}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function Avatar({ seed, size = 40 }) {
  const g = gradientFor(seed);
  const letter = seed.replace(/[^a-z]/gi, "").charAt(0).toUpperCase() || "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(${g.angle}deg, ${g.c1}, ${g.c2})`,
      display: "grid", placeItems: "center",
      color: "white", fontWeight: 700, fontSize: size * 0.42,
      boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.2)",
    }}>{letter}</div>
  );
}

function AdSlot({ kind, t }) {
  const isSky = kind === "sky";
  return (
    <div className={`ad ${isSky ? "ad-skyscraper" : "ad-leaderboard"}`}>
      <svg className="ad-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 15l5-4 4 3 3-2 6 4" />
        <circle cx="8.5" cy="9.5" r="1.5" />
      </svg>
      <span className="ad-label">{t.ad}</span>
      <span className="ad-size">{isSky ? "160 × 600" : "728 × 90"}</span>
    </div>
  );
}

/* ───────────────────────── media tile ───────────────────────── */

function MediaTile({ item, account, idx, t, delay }) {
  const [saved, setSaved] = useState(false);
  const g = gradientFor(account.username + idx);
  const isVideo = item.kind === "video";
  const aspect = isVideo ? "9 / 16" : "1 / 1";

  const onSave = () => {
    downloadItem(item, account, idx);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div style={{
      borderRadius: "var(--radius-sm)", overflow: "hidden", position: "relative",
      background: "var(--surface)", border: "1px solid var(--border)",
      animation: `popIn .5s var(--ease) ${delay}s both`,
    }}
      onMouseEnter={(e) => { e.currentTarget.querySelector(".tile-overlay").style.opacity = 1; }}
      onMouseLeave={(e) => { e.currentTarget.querySelector(".tile-overlay").style.opacity = 0; }}
    >
      <div style={{
        aspectRatio: aspect, width: "100%",
        background: `linear-gradient(${g.angle}deg, ${g.c1}, ${g.c2})`,
        position: "relative",
      }}>
        {/* real thumbnail */}
        {item.thumbnail && (
          <img src={item.thumbnail} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {/* type badge */}
        <div style={{
          position: "absolute", top: 9, right: 9, display: "flex", alignItems: "center", gap: 5,
          padding: "4px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
          background: "oklch(0.1 0 0 / 0.5)", backdropFilter: "blur(6px)", color: "white",
        }}>
          {isVideo ? (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>{item.duration}</>
          ) : (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.6" fill="white" stroke="none" /><path d="M21 15l-5-5L5 21" /></svg>{t.photo}</>
          )}
        </div>
        {/* center play for video */}
        {isVideo && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "oklch(0.1 0 0 / 0.4)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", border: "1px solid oklch(1 0 0 / 0.25)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
        {/* hover overlay */}
        <div className="tile-overlay" style={{
          position: "absolute", inset: 0, opacity: 0, transition: "opacity .25s var(--ease)",
          background: "linear-gradient(0deg, oklch(0.12 0.02 264 / 0.78), transparent 55%)",
          display: "flex", alignItems: "flex-end", padding: 12,
        }}>
          <button onClick={onSave} style={{
            width: "100%", border: "none", cursor: "pointer",
            padding: "10px", borderRadius: 9, fontSize: 13.5, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            color: "white", background: saved ? "oklch(0.6 0.15 150)" : "var(--accent)",
            boxShadow: "0 4px 16px var(--accent-glow)", transition: "all .2s var(--ease)",
          }}>
            {saved ? (
              <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{t.saved}</>
            ) : (
              <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>{t.save}</>
            )}
          </button>
        </div>
      </div>
      {/* footer row (always visible on mobile / no-hover) */}
      <button onClick={onSave} style={{
        width: "100%", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer",
        padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "transparent", color: "var(--muted)", fontSize: 12.5, fontWeight: 500,
      }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{String(idx + 1).padStart(2, "0")} · {isVideo ? "mp4" : "jpg"}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: saved ? "oklch(0.7 0.15 150)" : "var(--accent-bright)", fontWeight: 600 }}>
          {saved ? t.saved : t.save}
        </span>
      </button>
    </div>
  );
}

/* ───────────────────────── states ───────────────────────── */

function Loading({ t, phase }) {
  return (
    <div style={{ animation: "floatIn .4s var(--ease) both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 20 }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid var(--surface-2)", borderTopColor: "var(--accent-bright)", animation: "spin .7s linear infinite" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{phase}<span className="dots" /></span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--faint)" }}>instagram.com</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            aspectRatio: "1", borderRadius: "var(--radius-sm)",
            background: "linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%)",
            backgroundSize: "480px 100%", animation: "shimmer 1.3s linear infinite",
            animationDelay: `${i * 0.12}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ kind, t, onReset, account }) {
  const map = {
    private:     { title: t.privateTitle, body: t.privateBody, color: "var(--warn)", icon: "lock" },
    invalid:     { title: t.invalidTitle, body: t.invalidBody, color: "var(--danger)", icon: "alert" },
    empty:       { title: t.emptyTitle, body: t.emptyBody, color: "var(--faint)", icon: "empty" },
    fetch_failed:{ title: t.fetchFailedTitle, body: t.fetchFailedBody, color: "var(--danger)", icon: "alert" },
  };
  const c = map[kind];
  const icons = {
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    alert: <><path d="M12 8v5" /><circle cx="12" cy="16.5" r="0.4" fill="currentColor" /><path d="M10.3 4.3l-7 12A2 2 0 0 0 5 19.5h14a2 2 0 0 0 1.7-3.2l-7-12a2 2 0 0 0-3.4 0z" /></>,
    empty: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 15l4-3 4 2 4-3 4 3" /><circle cx="9" cy="9.5" r="1.4" /></>,
  };
  return (
    <div style={{
      animation: "popIn .45s var(--ease) both",
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--bg-2)", padding: "34px 30px", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 58, height: 58, borderRadius: 16, display: "grid", placeItems: "center",
        background: `color-mix(in oklab, ${c.color} 14%, transparent)`,
        color: c.color, border: `1px solid color-mix(in oklab, ${c.color} 30%, transparent)`,
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{icons[c.icon]}</svg>
      </div>
      {kind === "private" && account && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: -4 }}>
          <Avatar seed={account.username} size={30} />
          <span style={{ fontWeight: 600, fontSize: 14.5 }}>@{account.username}</span>
        </div>
      )}
      <div style={{ maxWidth: 380 }}>
        <h3 style={{ margin: "0 0 7px", fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>{c.title}</h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--muted)" }}>{c.body}</p>
      </div>
      <button onClick={onReset} style={{
        marginTop: 4, border: "1px solid var(--border-2)", cursor: "pointer",
        padding: "9px 18px", borderRadius: 10, fontSize: 13.5, fontWeight: 600,
        background: "var(--surface)", color: "var(--text)",
      }}>{t.tryAgain}</button>
    </div>
  );
}

/* ───────────────────────── results ───────────────────────── */

function Results({ post, t }) {
  const downloadAll = () => {
    post.items.forEach((it, i) => setTimeout(() => downloadItem(it, post.account, i), i * 350));
  };
  return (
    <div style={{ animation: "floatIn .5s var(--ease) both" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 14, flexWrap: "wrap", marginBottom: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar seed={post.account.username} size={44} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontWeight: 700, fontSize: 15.5 }}>@{post.account.username}</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--accent-bright)"><path d="M12 2l2.2 1.6 2.7-.3 1.2 2.5 2.5 1.2-.3 2.7L24 12l-1.6 2.2.3 2.7-2.5 1.2-1.2 2.5-2.7-.3L12 22l-2.2-1.6-2.7.3-1.2-2.5L3.4 16.9l.3-2.7L2 12l1.7-2.2-.3-2.7 2.5-1.2L7.1 3.4l2.7.3z" /><path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: "oklch(0.7 0.15 150)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: "oklch(0.7 0.15 150)" }} />{t.publicBadge}
              </span>
              <span style={{ color: "var(--faint)", fontSize: 12 }}>·</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{t.items(post.items.length)}</span>
            </div>
          </div>
        </div>
        <button onClick={downloadAll} style={{
          border: "none", cursor: "pointer", padding: "11px 18px", borderRadius: 11,
          fontSize: 13.5, fontWeight: 600, color: "white",
          display: "flex", alignItems: "center", gap: 8,
          background: "linear-gradient(145deg, var(--accent-bright), var(--accent-deep))",
          boxShadow: "0 5px 18px var(--accent-glow)",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
          {t.downloadAll}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 14 }}>
        {post.items.map((it, i) => (
          <MediaTile key={it.id} item={it} account={post.account} idx={i} t={t} delay={i * 0.05} />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── recent (sessionStorage) ───────────────────────── */

const RECENT_KEY = "snaggr_recent_session";
function loadRecent() {
  try { return JSON.parse(sessionStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function saveRecent(list) {
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch {}
}

function Recent({ list, t, onReload, onClear }) {
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 40, animation: "floatIn .5s var(--ease) both" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: "0.01em" }}>{t.recentTitle}</h3>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            {t.recentNote}
          </span>
        </div>
        <button onClick={onClear} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--faint)", fontSize: 12.5, fontWeight: 600 }}>{t.clear}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((r, i) => {
          const g = gradientFor(r.seed);
          return (
            <button key={i} onClick={() => onReload(r.url)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
              border: "1px solid var(--border)", borderRadius: 12, padding: "9px 12px", cursor: "pointer",
              background: "var(--bg-2)", color: "var(--text)", transition: "border-color .2s, background .2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.background = "var(--surface)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-2)"; }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: `linear-gradient(${g.angle}deg, ${g.c1}, ${g.c2})`, display: "grid", placeItems: "center" }}>
                {r.type === "video"
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                  : <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>{r.count}</span>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{r.username}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.url.replace(/^https?:\/\//, "")}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-bright)", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                {t.reload}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── search bar ───────────────────────── */


function SearchBar({ value, setValue, onSubmit, busy, t }) {
  const [focus, setFocus] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(value); }} style={{
      display: "flex", gap: 10, padding: 7,
      borderRadius: 15, background: "var(--surface)",
      border: `1px solid ${focus ? "var(--accent)" : "var(--border)"}`,
      boxShadow: focus ? "0 0 0 4px var(--accent-faint), 0 10px 30px oklch(0.1 0 0 / 0.3)" : "0 8px 24px oklch(0.1 0 0 / 0.25)",
      transition: "all .25s var(--ease)",
    }}>
      <div style={{ display: "flex", alignItems: "center", paddingLeft: 12, color: "var(--faint)" }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder={t.placeholder}
        spellCheck={false}
        style={{
          flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
          color: "var(--text)", fontSize: 15.5, padding: "8px 0", fontFamily: "var(--mono)",
        }}
      />
      <button type="submit" disabled={busy} style={{
        border: "none", cursor: busy ? "default" : "pointer",
        padding: "0 22px", borderRadius: 11, fontSize: 14.5, fontWeight: 600,
        color: "white", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
        background: busy ? "var(--accent-deep)" : "linear-gradient(145deg, var(--accent-bright), var(--accent-deep))",
        boxShadow: "0 4px 16px var(--accent-glow)", opacity: busy ? 0.7 : 1,
        transition: "all .2s var(--ease)",
      }}>
        {busy ? (
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2.2px solid oklch(1 0 0 / 0.4)", borderTopColor: "white", animation: "spin .7s linear infinite" }} />
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
        )}
        {t.download}
      </button>
    </form>
  );
}

/* ───────────────────────── app ───────────────────────── */

function App() {
  const [lang, setLang] = useState(() => sessionStorage.getItem("snaggr_lang") || (navigator.language?.startsWith("es") ? "es" : "en"));
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | results | error
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState(loadRecent);
  const timers = useRef([]);
  const t = S[lang];

  useEffect(() => { sessionStorage.setItem("snaggr_lang", lang); }, [lang]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = useCallback(async (rawUrl) => {
    const url = (rawUrl ?? value).trim();
    setValue(url);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStatus("loading");
    setPhase(t.analyzing);
    setResult(null);

    timers.current.push(setTimeout(() => setPhase(t.fetching), 900));

    try {
      const data = await fetchPost(url);
      if (data.error) {
        setResult({ error: data.error, account: data.account });
        setStatus("error");
      } else {
        setResult({ post: data.post });
        setStatus("results");
        const entry = {
          url: data.post.url,
          username: data.post.account.username,
          type: data.post.type,
          count: data.post.items.length,
          seed: data.post.account.username,
        };
        setRecent((prev) => {
          const next = [entry, ...prev.filter((p) => p.url !== entry.url)].slice(0, 8);
          saveRecent(next);
          return next;
        });
      }
    } catch {
      setResult({ error: "fetch_failed" });
      setStatus("error");
    } finally {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    }
  }, [value, t]);

  const reset = () => { setStatus("idle"); setResult(null); setValue(""); };
  const clearRecent = () => { setRecent([]); saveRecent([]); };

  return (
    <div className="shell">
      <div style={{ width: "100%", maxWidth: 1320, padding: "20px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo />
        <LangSwitch lang={lang} setLang={setLang} />
      </div>

      <div className="layout" style={{ marginTop: 8 }}>
        <div className="ad-rail"><AdSlot kind="sky" t={t} /></div>

        <div className="main-col">
          {/* hero */}
          <div style={{ textAlign: "center", margin: "44px 0 28px", animation: "floatIn .5s var(--ease) both" }}>
            <h1 style={{ margin: "0 auto 12px", fontSize: "clamp(28px, 4.6vw, 42px)", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.08, maxWidth: 560, textWrap: "balance" }}>{t.tagline}</h1>
            <p style={{ margin: "0 auto", fontSize: 15.5, color: "var(--muted)", maxWidth: 440, lineHeight: 1.5, textWrap: "balance" }}>{t.sub}</p>
          </div>

          {/* search */}
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <SearchBar value={value} setValue={setValue} onSubmit={run} busy={status === "loading"} t={t} />
          </div>

          {/* result area */}
          <div style={{ marginTop: 34 }}>
            {status === "loading" && <Loading t={t} phase={phase} />}
            {status === "results" && result?.post && <Results post={result.post} t={t} />}
            {status === "error" && <ErrorCard kind={result.error} t={t} onReset={reset} account={result.account} />}
          </div>

          {/* recent */}
          <Recent list={recent} t={t} onReload={(url) => run(url)} onClear={clearRecent} />

          {/* bottom leaderboard ad */}
          <div style={{ marginTop: 44 }}>
            <AdSlot kind="leaderboard" t={t} />
          </div>

          {/* footer */}
          <p style={{ marginTop: 30, textAlign: "center", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 520, marginInline: "auto" }}>{t.disclaimer}</p>
        </div>

        <div className="ad-rail"><AdSlot kind="sky" t={t} /></div>
      </div>
    </div>
  );
}

// animated dots for loading text
const styleEl = document.createElement("style");
styleEl.textContent = `
  .dots::after { content: ''; animation: dots 1.4s steps(4, end) infinite; }
  @keyframes dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
`;
document.head.appendChild(styleEl);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

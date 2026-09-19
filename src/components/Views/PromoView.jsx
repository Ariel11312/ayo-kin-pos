import { useState, useEffect, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { BG, BORDER, DR, DR_LIGHT, FONT, inputStyle, MUTED, SUBTLE, TEXT, SUCCESS, SUCCESS_BG } from "../../ui/styles";
import fmt from "../../function/fmt";
import Btn from "../../function/btn";
import { ErrBox, OkBox } from "../../function/messageBox";
import { supabase } from "../../supabase/supabase";

const genId = () => "PROMO-" + Math.random().toString(36).substring(2, 8).toUpperCase();
const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const DANGER = "#C0392B";
const DANGER_BG = "#FDECEA";
const WARNING = "#B7770D";
const WARNING_BG = "#FEF3CD";

function promoStatus(p) {
  if (!p.active) return { label: "Inactive", color: MUTED, bg: SUBTLE };
  if (p.expires_at && new Date(p.expires_at) < new Date()) return { label: "Expired", color: DANGER, bg: DANGER_BG };
  if (p.max_uses != null && p.used_count >= p.max_uses) return { label: "Exhausted", color: WARNING, bg: WARNING_BG };
  return { label: "Active", color: SUCCESS, bg: SUCCESS_BG };
}

/* Responsive rules live here so the rest of the file can keep using plain
   inline styles for colors/spacing while layout breakpoints are centralized. */
function ResponsiveStyles() {
  return (
    <style>{`
      .promo-root { -webkit-text-size-adjust: 100%; }
      .promo-grid {
        display: grid;
        grid-template-columns: minmax(280px, 360px) 1fr;
        gap: 22px;
        align-items: start;
      }
      @media (max-width: 860px) {
        .promo-grid { grid-template-columns: 1fr; gap: 16px; }
      }
      .promo-two-col { display: flex; gap: 10px; margin-bottom: 14px; }
      @media (max-width: 420px) {
        .promo-two-col { flex-direction: column; gap: 14px; }
      }
      .promo-card-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 14px;
      }
      .promo-card {
        display: flex;
        gap: 14px;
      }
      @media (max-width: 380px) {
        .promo-card { flex-direction: column; align-items: center; text-align: center; }
      }
      .promo-input, .promo-input * {
        font-size: 16px !important; /* prevents iOS auto-zoom on focus */
      }
      .promo-tap-btn {
        min-height: 40px;
      }
      @media (max-width: 480px) {
        .promo-container { padding: 14px !important; }
        .promo-form-box { padding: 14px !important; }
      }
    `}</style>
  );
}

/* QR code encodes just the raw promo code text (e.g. "SAVE20"), which is
   exactly what the POSView scanner reads back and looks up. */
function QRBlock({ code, onExpand }) {
  const wrapRef = useRef(null);

  const download = (e) => {
    e.stopPropagation();
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `promo-${code}.png`;
    a.click();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <div
        ref={wrapRef}
        onClick={onExpand}
        role="button"
        tabIndex={0}
        aria-label={`Show ${code} QR code fullscreen`}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onExpand(); }}
        style={{
          padding: 8, background: "#fff", borderRadius: 8, border: `1px solid ${BORDER}`,
          cursor: "pointer",
        }}>
        <QRCodeCanvas value={code} size={88} level="M" />
      </div>
      <button onClick={download}
        className="promo-tap-btn"
        style={{ fontSize: 12, fontWeight: 700, color: DR, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, padding: "4px 8px" }}>
        ⬇ Download
      </button>
    </div>
  );
}

/* Fullscreen view — tap the QR thumbnail to open this. Makes it easy to
   hold the screen up for a customer to scan, or to read it back. */
function FullscreenQR({ promo, onClose }) {
  const wrapRef = useRef(null);
  const [qrSize, setQrSize] = useState(() =>
    typeof window !== "undefined" ? Math.min(320, window.innerWidth - 80) : 320
  );

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onResize = () => setQrSize(Math.min(320, window.innerWidth - 80));
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

  const download = () => {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `promo-${promo.code}.png`;
    a.click();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: FONT, padding: 20,
      }}>
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: "100%" }}>
        <div ref={wrapRef} style={{ padding: 20, background: "#fff", borderRadius: 16, boxShadow: "0 10px 50px rgba(0,0,0,0.4)" }}>
          <QRCodeCanvas value={promo.code} size={qrSize} level="M" />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>{promo.code}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
            {promo.label} · {promo.discount_type === "percent" ? `${promo.discount_value}% off` : `${fmt(promo.discount_value)} off`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={download} className="promo-tap-btn" style={{
            fontSize: 13, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8, padding: "10px 18px",
            cursor: "pointer", fontFamily: FONT,
          }}>⬇ Download</button>
          <button onClick={onClose} className="promo-tap-btn" style={{
            fontSize: 13, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8, padding: "10px 18px",
            cursor: "pointer", fontFamily: FONT,
          }}>✕ Close</button>
        </div>
      </div>
    </div>
  );
}

export default function PromoView() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [code, setCode] = useState(genCode());
  const [label, setLabel] = useState("");
  const [discountType, setDiscountType] = useState("percent"); // 'percent' | 'fixed'
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null); // promo object shown fullscreen, or null

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setPromos(data || []);
    setLoading(false);
  }

  const resetForm = () => {
    setCode(genCode()); setLabel(""); setDiscountType("percent");
    setDiscountValue(""); setMaxUses(""); setExpiresAt("");
  };

  async function handleCreate() {
    setError(""); setOk("");
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return setError("Promo code is required.");
    if (!discountValue || parseFloat(discountValue) <= 0) return setError("Enter a discount value greater than 0.");
    if (discountType === "percent" && parseFloat(discountValue) > 100) return setError("Percent discount can't exceed 100.");
    if (promos.some(p => p.code === cleanCode)) return setError("That code already exists.");

    const row = {
      id: genId(),
      code: cleanCode,
      label: label.trim() || cleanCode,
      discount_type: discountType,
      discount_value: parseFloat(discountValue),
      active: true,
      max_uses: maxUses ? parseInt(maxUses, 10) : null,
      used_count: 0,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      created_at: new Date().toISOString(),
    };

    setSaving(true);
    const { error } = await supabase.from("promo_codes").insert(row);
    setSaving(false);
    if (error) return setError(error.message);
    setOk(`Promo "${cleanCode}" created.`);
    resetForm();
    load();
  }

  async function toggleActive(p) {
    await supabase.from("promo_codes").update({ active: !p.active }).eq("id", p.id);
    load();
  }

  async function removePromo(p) {
    if (!window.confirm(`Delete promo "${p.code}"? This can't be undone.`)) return;
    await supabase.from("promo_codes").delete().eq("id", p.id);
    load();
  }

  const lbl = { fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, display: "block" };
  const field = { marginBottom: 14 };

  return (
    <div className="promo-root promo-container" style={{ height: "100%", overflowY: "auto", overflowX: "hidden", padding: 22, fontFamily: FONT, boxSizing: "border-box" }}>
      <ResponsiveStyles />
      <div className="promo-grid">

        {/* ── Create form ── */}
        <div className="promo-form-box" style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, background: BG, boxSizing: "border-box" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, marginBottom: 14 }}>🎟️ New Promo Code</div>

          <div style={field}>
            <label style={lbl}>Code</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="promo-input" style={{ ...inputStyle, flex: 1, minWidth: 0, boxSizing: "border-box" }} value={code}
                onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. SAVE20" />
              <Btn variant="ghost" onClick={() => setCode(genCode())} style={{ flexShrink: 0, padding: "8px 12px" }}>🎲</Btn>
            </div>
          </div>

          <div style={field}>
            <label style={lbl}>Label (optional)</label>
            <input className="promo-input" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={label}
              onChange={e => setLabel(e.target.value)} placeholder="e.g. September promo" />
          </div>

          <div style={field}>
            <label style={lbl}>Discount type</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ k: "percent", l: "% Percent" }, { k: "fixed", l: "₱ Fixed" }].map(t => (
                <button key={t.k} onClick={() => setDiscountType(t.k)}
                  className="promo-tap-btn"
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 6, border: "none", cursor: "pointer",
                    fontFamily: FONT, fontSize: 12, fontWeight: 700,
                    background: discountType === t.k ? DR : SUBTLE, color: discountType === t.k ? "#fff" : MUTED,
                  }}>{t.l}</button>
              ))}
            </div>
          </div>

          <div style={field}>
            <label style={lbl}>{discountType === "percent" ? "Percent off" : "Amount off (₱)"}</label>
            <input type="number" min="0" inputMode="decimal" className="promo-input" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={discountValue} onChange={e => setDiscountValue(e.target.value)}
              placeholder={discountType === "percent" ? "e.g. 20" : "e.g. 50"} />
          </div>

          <div className="promo-two-col">
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={lbl}>Max uses (optional)</label>
              <input type="number" min="1" inputMode="numeric" className="promo-input" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                value={maxUses} onChange={e => setMaxUses(e.target.value)} placeholder="Unlimited" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={lbl}>Expires (optional)</label>
              <input type="date" className="promo-input" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
          </div>

          <ErrBox msg={error} />
          <OkBox msg={ok} />

          <Btn onClick={handleCreate} disabled={saving} style={{ width: "100%", marginTop: 6 }}>
            {saving ? "Creating…" : "Create promo code"}
          </Btn>
        </div>

        {/* ── List ── */}
        <div>
          {loading ? (
            <div style={{ color: MUTED, padding: 24, textAlign: "center" }}>Loading promos…</div>
          ) : promos.length === 0 ? (
            <div style={{ color: MUTED, padding: 48, textAlign: "center", border: `1px dashed ${BORDER}`, borderRadius: 12 }}>
              No promo codes yet. Create one to get a scannable QR code.
            </div>
          ) : (
            <div className="promo-card-list">
              {promos.map(p => {
                const status = promoStatus(p);
                return (
                  <div key={p.id} className="promo-card" style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, background: BG, boxSizing: "border-box" }}>
                    <QRBlock code={p.code} onExpand={() => setExpanded(p)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap", justifyContent: "inherit" }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, wordBreak: "break-word" }}>{p.code}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: status.color, background: status.bg, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
                          {status.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{p.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DR, marginBottom: 6 }}>
                        {p.discount_type === "percent" ? `${p.discount_value}% off` : `${fmt(p.discount_value)} off`}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
                        <div>Used {p.used_count}{p.max_uses != null ? `/${p.max_uses}` : ""} time{p.used_count === 1 ? "" : "s"}</div>
                        {p.expires_at && <div>Expires {new Date(p.expires_at).toLocaleDateString()}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "inherit" }}>
                        <button onClick={() => toggleActive(p)} className="promo-tap-btn" style={{
                          fontSize: 11, fontWeight: 700, color: DR, background: "none", border: `1px solid ${DR}`,
                          borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontFamily: FONT,
                        }}>{p.active ? "Deactivate" : "Activate"}</button>
                        <button onClick={() => removePromo(p)} className="promo-tap-btn" style={{
                          fontSize: 11, fontWeight: 700, color: DANGER, background: "none", border: `1px solid ${DANGER}`,
                          borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontFamily: FONT,
                        }}>Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {expanded && <FullscreenQR promo={expanded} onClose={() => setExpanded(null)} />}
    </div>
  );
}
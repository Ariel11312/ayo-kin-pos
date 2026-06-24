import { useState } from "react";
import {DR, DR_LIGHT, BG, TEXT, MUTED,BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT, inputStyle} from "../../ui/styles"
import Btn from "../../function/btn";
import fmt from "../../function/fmt";
import Badge from "../../function/Badge";
import { ErrBox, OkBox } from "../../function/messageBox";
export default function VoidRefundView({ orders, setOrders, config, demoMode }) {
  const [search, setSearch] = useState("");
  const [found, setFound] = useState(null);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const doSearch = () => {
    const o = orders.find(o => o.id.toLowerCase() === search.trim().toLowerCase());
    setFound(o || null);
    setError(o ? "" : `No order found with ID "${search.trim()}"`);
    setSuccess(""); setAction(null); setReason("");
  };

  const doAction = async () => {
    if (!reason.trim()) { setError("Please enter a reason."); return; }
    setLoading(true); setError("");
    try {
      if (!demoMode && config.supabaseUrl) await sbReq(config, "PATCH", "orders", { status: action, void_reason: reason }, `id=eq.${found.id}`);
      const updated = { ...found, status: action };
      setOrders(prev => prev.map(o => o.id === found.id ? updated : o));
      setFound(updated);
      setSuccess(`Order ${found.id} has been successfully ${action === "voided" ? "voided" : "refunded"}.`);
      setAction(null); setReason("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const recentVR = orders.filter(o => ["voided", "refunded"].includes(o.status)).slice(0, 6);

  return (
    <div style={{ padding: 22, maxWidth: 660, height: "100%", overflowY: "auto", fontFamily: FONT }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 800 }}>Void / Refund</h2>
      <p style={{ margin: "0 0 24px", color: MUTED, fontSize: 13 }}>Look up an order by ID to void or process a refund.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()}
          placeholder="Enter order ID — e.g. ORD-A1B2C3"
          style={{ ...inputStyle, flex: 1 }} />
        <Btn onClick={doSearch}>Search</Btn>
      </div>

      <ErrBox msg={!found ? error : ""} />
      <OkBox msg={success} />

      {found && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: SUBTLE }}>
            <span style={{ fontWeight: 800, fontFamily: "monospace", fontSize: 16, color: DR }}>{found.id}</span>
            <Badge status={found.status} />
          </div>
          <div style={{ padding: "16px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: MUTED }}>Type: </span><strong style={{ textTransform: "capitalize" }}>{found.type}</strong></div>
              <div><span style={{ color: MUTED }}>Payment: </span><strong style={{ textTransform: "uppercase" }}>{found.payment_method}</strong></div>
              <div><span style={{ color: MUTED }}>Date: </span><strong>{new Date(found.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong></div>
              <div><span style={{ color: MUTED }}>Total: </span><strong style={{ color: DR, fontSize: 15 }}>{fmt(found.total)}</strong></div>
              {found.payment_ref && <div style={{ gridColumn: "1/-1" }}><span style={{ color: MUTED }}>Ref: </span><strong>{found.payment_ref}</strong></div>}
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              {found.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span>{item.name} × {item.qty}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(item.price * item.qty)}</span>
                </div>
              ))}
            </div>
          </div>

          {found.status === "completed" && !action && (
            <div style={{ padding: "14px 18px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 10 }}>
              <Btn variant="outline" onClick={() => { setAction("voided"); setError(""); }} style={{ flex: 1 }}>Void Order</Btn>
              <Btn onClick={() => { setAction("refunded"); setError(""); }} style={{ flex: 1 }}>Process Refund</Btn>
            </div>
          )}
          {found.status !== "completed" && !success && (
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${BORDER}`, fontSize: 13, color: MUTED }}>
              This order has already been {found.status} and cannot be modified further.
            </div>
          )}

          {action && (
            <div style={{ padding: "16px 18px", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ padding: "12px 16px", background: action === "voided" ? DR_LIGHT : "#FFF7ED", borderRadius: 8, marginBottom: 14, borderLeft: `3px solid ${action === "voided" ? DR : "#92400E"}` }}>
                <div style={{ fontWeight: 800, color: action === "voided" ? DR : "#92400E", marginBottom: 4 }}>
                  {action === "voided" ? "Void" : "Refund"} Order {found.id}
                </div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {action === "voided"
                    ? "This cancels the transaction permanently. It cannot be undone."
                    : `A refund of ${fmt(found.total)} will be issued to the customer.`}
                </div>
              </div>
              <Field label="Reason *">
                <textarea value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={action === "voided" ? "e.g. Customer cancelled order" : "e.g. Wrong item served, customer complaint"}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
              </Field>
              <ErrBox msg={error} />
              {demoMode && <p style={{ fontSize: 11, color: MUTED, margin: "0 0 12px" }}>Demo mode — no real changes saved to Supabase.</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="ghost" onClick={() => { setAction(null); setReason(""); setError(""); }} style={{ flex: 1 }}>Cancel</Btn>
                <Btn onClick={doAction} disabled={loading}
                  style={{ flex: 2, background: action === "refunded" ? "#7C2D12" : DR }}>
                  {loading ? "Processing…" : `Confirm ${action === "voided" ? "Void" : "Refund"}`}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {recentVR.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Recent Voids & Refunds</div>
          {recentVR.map(o => (
            <div key={o.id} onClick={() => { setSearch(o.id); setFound(o); setSuccess(""); setError(""); setAction(null); }}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 8, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = SUBTLE}
              onMouseLeave={e => e.currentTarget.style.background = BG}>
              <div>
                <div style={{ fontWeight: 800, fontFamily: "monospace", fontSize: 13, color: DR }}>{o.id}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{new Date(o.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <div style={{ fontWeight: 800 }}>{fmt(o.total)}</div>
                <Badge status={o.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
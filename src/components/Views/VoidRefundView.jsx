import { useState, useMemo } from "react";
import {DR, DR_LIGHT, BG, TEXT, MUTED,BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT, inputStyle} from "../../ui/styles"
import Btn from "../../function/btn";
import fmt from "../../function/fmt";
import Badge from "../../function/Badge";
import { ErrBox, OkBox } from "../../function/messageBox";

// Above this amount, a manager PIN is required to confirm a void/refund.
// Mirrors a real POS control: front-line staff can process small adjustments,
// but anything material needs sign-off so refunds can't be self-approved.
const APPROVAL_THRESHOLD = 1000;
const MANAGER_PIN = "4321"; // demo only — in production this comes from config / a hashed lookup

export default function VoidRefundView({ orders, setOrders, config, demoMode }) {
  const [search, setSearch] = useState("");
  const [found, setFound] = useState(null);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // --- history filters ---
  const [fStatus, setFStatus] = useState("all");
  const [fType, setFType] = useState("all");
  const [fPayment, setFPayment] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fText, setFText] = useState("");
  const [sortBy, setSortBy] = useState({ key: "created_at", dir: "desc" });

  const doSearch = () => {
    const o = orders.find(o => o.id.toLowerCase() === search.trim().toLowerCase());
    setFound(o || null);
    setError(o ? "" : `No order found with ID "${search.trim()}"`);
    setSuccess(""); setAction(null); setReason(""); setStaffName(""); setPin(""); setPinError("");
  };

  const requiresApproval = found && found.total >= APPROVAL_THRESHOLD;

  const doAction = async () => {
    if (!reason.trim()) { setError("Please enter a reason."); return; }
    if (!staffName.trim()) { setError("Please enter the name of the staff member processing this."); return; }
    if (requiresApproval) {
      if (!pin.trim()) { setError("Manager PIN is required for amounts of " + fmt(APPROVAL_THRESHOLD) + " or more."); return; }
      if (pin.trim() !== MANAGER_PIN) { setPinError("Incorrect manager PIN."); return; }
    }
    setLoading(true); setError("");
    try {
      const patch = {
        status: action,
        void_reason: reason,
        processed_by: staffName.trim(),
        processed_at: new Date().toISOString(),
        approved: requiresApproval,
      };
      if (!demoMode && config.supabaseUrl) await sbReq(config, "PATCH", "orders", patch, `id=eq.${found.id}`);
      const updated = { ...found, ...patch };
      setOrders(prev => prev.map(o => o.id === found.id ? updated : o));
      setFound(updated);
      setSuccess(`Order ${found.id} has been successfully ${action === "voided" ? "voided" : "refunded"}.`);
      setAction(null); setReason(""); setStaffName(""); setPin(""); setPinError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const history = useMemo(() => {
    let list = orders.filter(o => ["voided", "refunded"].includes(o.status));

    if (fStatus !== "all") list = list.filter(o => o.status === fStatus);
    if (fType !== "all") list = list.filter(o => o.type === fType);
    if (fPayment !== "all") list = list.filter(o => o.payment_method === fPayment);
    if (fFrom) list = list.filter(o => new Date(o.created_at) >= new Date(fFrom));
    if (fTo) list = list.filter(o => new Date(o.created_at) <= new Date(fTo + "T23:59:59"));
    if (fText.trim()) {
      const q = fText.trim().toLowerCase();
      list = list.filter(o =>
        o.id.toLowerCase().includes(q) ||
        (o.void_reason || "").toLowerCase().includes(q) ||
        (o.processed_by || "").toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      const { key, dir } = sortBy;
      let av = a[key], bv = b[key];
      if (key === "created_at") { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [orders, fStatus, fType, fPayment, fFrom, fTo, fText, sortBy]);

  const paymentMethods = useMemo(() => [...new Set(orders.map(o => o.payment_method))], [orders]);
  const types = useMemo(() => [...new Set(orders.map(o => o.type))], [orders]);

  const toggleSort = (key) => {
    setSortBy(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };

  const clearFilters = () => { setFStatus("all"); setFType("all"); setFPayment("all"); setFFrom(""); setFTo(""); setFText(""); };

  const SortHeader = ({ label, sortKey, align }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      style={{ textAlign: align || "left", padding: "11px 14px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}
    >
      {label}{sortBy.key === sortKey ? (sortBy.dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  // --- summary stats, mirrored from the Orders page ---
  const voidedCount = useMemo(() => orders.filter(o => o.status === "voided").length, [orders]);
  const refundedCount = useMemo(() => orders.filter(o => o.status === "refunded").length, [orders]);
  const voidedAmount = useMemo(() => orders.filter(o => o.status === "voided").reduce((s, o) => s + o.total, 0), [orders]);
  const refundedAmount = useMemo(() => orders.filter(o => o.status === "refunded").reduce((s, o) => s + o.total, 0), [orders]);

  const StatCard = ({ label, value, color }) => (
    <div style={{ flex: 1, minWidth: 150, padding: "16px 18px", background: BG, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || TEXT }}>{value}</div>
    </div>
  );

  const Pill = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      style={{
        padding: "9px 18px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        border: `1px solid ${active ? DR : BORDER}`,
        background: active ? DR : BG,
        color: active ? "#fff" : TEXT,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ padding: 22, maxWidth: 980, height: "100%", overflowY: "auto", fontFamily: FONT }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 800 }}>Void / Refund</h2>
      <p style={{ margin: "0 0 20px", color: MUTED, fontSize: 13 }}>Look up an order by ID to void or process a refund.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 24 }}>
        <StatCard label="Voided" value={voidedCount} color={DR} />
        <StatCard label="Refunded" value={refundedCount} color="#7C2D12" />
        <StatCard label="Voided Amount" value={fmt(voidedAmount)} color={DR} />
        <StatCard label="Refunded Amount" value={fmt(refundedAmount)} color="#7C2D12" />
      </div>

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
              {found.processed_by && <div style={{ gridColumn: "1/-1" }}><span style={{ color: MUTED }}>Processed by: </span><strong>{found.processed_by}</strong>{found.approved && <span style={{ marginLeft: 8, fontSize: 11, color: "#92400E", fontWeight: 700 }}>MANAGER APPROVED</span>}</div>}
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

              <Field label="Staff Name *">
                <input value={staffName} onChange={e => setStaffName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  style={inputStyle} />
              </Field>

              <Field label="Reason *">
                <textarea value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={action === "voided" ? "e.g. Customer cancelled order" : "e.g. Wrong item served, customer complaint"}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
              </Field>

              {requiresApproval && (
                <div style={{ padding: "12px 16px", background: "#FEF3C7", borderRadius: 8, marginBottom: 14, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>
                    Manager approval required — this {action} is {fmt(found.total)}, at or above the {fmt(APPROVAL_THRESHOLD)} threshold.
                  </div>
                  <input
                    type="password"
                    value={pin}
                    onChange={e => { setPin(e.target.value); setPinError(""); }}
                    placeholder="Manager PIN"
                    style={{ ...inputStyle, maxWidth: 200 }}
                  />
                  {pinError && <div style={{ fontSize: 12, color: DR, marginTop: 6, fontWeight: 700 }}>{pinError}</div>}
                </div>
              )}

              <ErrBox msg={error} />
              {demoMode && <p style={{ fontSize: 11, color: MUTED, margin: "0 0 12px" }}>Demo mode — no real changes saved to Supabase.</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="ghost" onClick={() => { setAction(null); setReason(""); setStaffName(""); setPin(""); setPinError(""); setError(""); }} style={{ flex: 1 }}>Cancel</Btn>
                <Btn onClick={doAction} disabled={loading}
                  style={{ flex: 2, background: action === "refunded" ? "#7C2D12" : DR }}>
                  {loading ? "Processing…" : `Confirm ${action === "voided" ? "Void" : "Refund"}`}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Void & Refund History</div>

      {/* --- Filters --- */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, padding: "12px", background: SUBTLE, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        <input
          value={fText}
          onChange={e => setFText(e.target.value)}
          placeholder="Search ID, reason, staff…"
          style={{ ...inputStyle, flex: "1 1 180px", minWidth: 140 }}
        />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ ...inputStyle, flex: "0 1 130px" }}>
          <option value="all">All statuses</option>
          <option value="voided">Voided</option>
          <option value="refunded">Refunded</option>
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={{ ...inputStyle, flex: "0 1 130px" }}>
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t} style={{ textTransform: "capitalize" }}>{t}</option>)}
        </select>
        <select value={fPayment} onChange={e => setFPayment(e.target.value)} style={{ ...inputStyle, flex: "0 1 140px" }}>
          <option value="all">All payment methods</option>
          {paymentMethods.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
        </select>
        <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={{ ...inputStyle, flex: "0 1 140px" }} />
        <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={{ ...inputStyle, flex: "0 1 140px" }} />
        <Btn variant="ghost" onClick={clearFilters}>Clear</Btn>
      </div>

      {/* --- Table --- */}
      {history.length === 0 ? (
        <div style={{ padding: "24px 18px", textAlign: "center", color: MUTED, fontSize: 13, border: `1px dashed ${BORDER}`, borderRadius: 8 }}>
          No voided or refunded orders match these filters.
        </div>
      ) : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: SUBTLE, borderBottom: `1px solid ${BORDER}` }}>
                <SortHeader label="Order ID" sortKey="id" />
                <SortHeader label="Date" sortKey="created_at" />
                <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 }}>Type</th>
                <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 }}>Payment</th>
                <SortHeader label="Total" sortKey="total" align="right" />
                <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 }}>Status</th>
                <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 }}>Reason</th>
                <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 }}>Processed By</th>
              </tr>
            </thead>
            <tbody>
              {history.map(o => (
                <tr
                  key={o.id}
                  onClick={() => { setSearch(o.id); setFound(o); setSuccess(""); setError(""); setAction(null); setStaffName(""); setPin(""); setPinError(""); }}
                  style={{ borderBottom: `1px solid ${BORDER}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = SUBTLE}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 800, color: DR, whiteSpace: "nowrap" }}>{o.id}</td>
                  <td style={{ padding: "10px 12px", color: MUTED, whiteSpace: "nowrap" }}>{new Date(o.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>{o.type}</td>
                  <td style={{ padding: "10px 12px", textTransform: "uppercase" }}>{o.payment_method}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700 }}>{fmt(o.total)}</td>
                  <td style={{ padding: "10px 12px" }}><Badge status={o.status} /></td>
                  <td style={{ padding: "10px 12px", color: MUTED, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.void_reason || ""}>{o.void_reason || "—"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    {o.processed_by || "—"}
                    {o.approved && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#92400E" }}>★</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: MUTED }}>
        {history.length} record{history.length === 1 ? "" : "s"} · ★ = manager-approved (amount ≥ {fmt(APPROVAL_THRESHOLD)})
      </div>
    </div>
  );
}
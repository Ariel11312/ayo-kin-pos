import { DR, BG, TEXT, MUTED, BORDER, FONT } from "../ui/styles";
import fmt from "../function/fmt";

const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
};

const isGcash = (o) =>
  String(o.payment_method || o.paymentMethod || o.payment || "")
    .toLowerCase()
    .includes("gcash");

/**
 * props:
 *  title   - modal title
 *  orders  - list of orders to show
 *  accent  - color for amounts
 *  timeOf  - (order) => ISO string shown as "paid" time
 *  showMethod - show GCash/Cash tag per row (for Grand Total)
 *  showCreated - show original created date (for Paid Credits)
 *  onClose
 */
export default function SalesDetailModal({
  title, orders, accent = DR, timeOf, showMethod = false, showCreated = false, onClose,
}) {
  const sorted = [...orders].sort((a, b) => new Date(timeOf(b)) - new Date(timeOf(a)));
  const total = sorted.reduce((s, o) => s + (Number(o.total) || 0), 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1300, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BG, color: TEXT, fontFamily: FONT, borderRadius: 12,
          width: "100%", maxWidth: 440, maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 8px 30px rgba(0,0,0,0.2)", padding: "20px 20px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "transparent", fontSize: 16, cursor: "pointer", color: MUTED }}
          >✕</button>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          {sorted.length} order{sorted.length !== 1 ? "s" : ""}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map((o) => (
            <div
              key={o.id}
              style={{
                border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
                display: "flex", justifyContent: "space-between", gap: 10, flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.customer_name || "Walk-in"}
                  {showMethod && (
                    <span style={{
                      marginLeft: 6, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 8,
                      background: isGcash(o) ? "#DBEAFE" : "#F3F4F6",
                      color: isGcash(o) ? "#1D4ED8" : MUTED,
                    }}>
                      {isGcash(o) ? "GCASH" : "CASH"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{o.id}</div>
                <div style={{ fontSize: 11, color: MUTED }}>
                  Paid: {fmtTime(timeOf(o))}
                  {showCreated && <> · Ordered: {fmtTime(o.created_at)}</>}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: accent, whiteSpace: "nowrap" }}>
                {fmt(o.total)}
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: MUTED, fontSize: 13 }}>
              Walang orders pa.
            </div>
          )}
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 10,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>TOTAL</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: accent }}>{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
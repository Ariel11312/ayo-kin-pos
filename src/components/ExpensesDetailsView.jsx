import { BG, TEXT, MUTED, BORDER, FONT } from "../ui/styles";
import fmt from "../function/fmt";

const EXPENSE_RED = "#DC2626";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// ── Adjust these if your column names are different ──
const rawDate = (e) => e.expense_date || e.date || e.created_at;

// Date-only columns ("2026-10-12") are parsed as LOCAL midnight so they
// never shift to the wrong day.
export const expenseDate = (e) => {
  const v = rawDate(e);
  return typeof v === "string" && DATE_ONLY.test(v) ? `${v}T00:00:00` : v;
};
export const expenseAmount = (e) => Number(e.amount ?? e.total ?? e.cost) || 0;
const expenseLabel = (e) => e.description || e.name || e.title || e.category || "Expense";

const fmtTime = (e) => {
  const v = rawDate(e);
  if (!v) return "—";
  // Date-only column has no time of day to show
  if (typeof v === "string" && DATE_ONLY.test(v)) return "Today";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
};

export default function ExpensesDetailModal({ expenses, onClose }) {
  const sorted = [...expenses].sort(
    (a, b) => new Date(expenseDate(b)) - new Date(expenseDate(a))
  );
  const total = sorted.reduce((s, e) => s + expenseAmount(e), 0);

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
          <div style={{ fontSize: 16, fontWeight: 800 }}>Today's Expenses</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "transparent", fontSize: 16, cursor: "pointer", color: MUTED }}
          >✕</button>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          {sorted.length} expense{sorted.length !== 1 ? "s" : ""}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map((e, i) => (
            <div
              key={e.id ?? i}
              style={{
                border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
                display: "flex", justifyContent: "space-between", gap: 10, flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {expenseLabel(e)}
                </div>
                {e.category && e.category !== expenseLabel(e) && (
                  <div style={{ fontSize: 11, color: MUTED }}>{e.category}</div>
                )}
                {e.notes && <div style={{ fontSize: 11, color: MUTED }}>{e.notes}</div>}
                <div style={{ fontSize: 11, color: MUTED }}>{fmtTime(e)}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: EXPENSE_RED, whiteSpace: "nowrap" }}>
                {fmt(expenseAmount(e))}
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: MUTED, fontSize: 13 }}>
              Walang expenses pa today.
            </div>
          )}
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 10,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>TOTAL</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: EXPENSE_RED }}>{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
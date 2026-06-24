import { BG, DR, DR_LIGHT, TEXT, SUBTLE, FONT, MUTED, BORDER, inputStyle, SUCCESS_BG, SUCCESS } from "../ui/styles";
import fmt from "./fmt";
import Btn from "./btn";
import { ErrBox, OkBox } from "./messageBox";
import Field from "./field";
import { useState } from "react";

export default function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.48)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: BG, width, maxWidth: "100%", maxHeight: "92vh", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 20px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: MUTED, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
export function ReceiptModal({ order, onClose }) {
  const handlePrint = () => window.print();

  return (
    <Modal title="Receipt" onClose={onClose} width={380}>
      <style>{`
        @media print {
          @page {
            margin: 0;
            size: auto;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden;
          }
          #receipt-print, #receipt-print * {
            visibility: visible;
          }
          #receipt-print {
            position: absolute;
            top: 0;
            left: 0;
            width: 380px;
            margin: 0 auto;
            padding: 24px;
            box-sizing: border-box;
            background: #fff;
          }
        }
      `}</style>

      <div id="receipt-print" style={{ padding: 24, fontFamily: '"Courier New", monospace', fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 18, fontFamily: FONT, letterSpacing: -0.5 }}>SalesPoint POS</div>
          <div style={{ fontSize: 11, color: MUTED }}>Official Receipt</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{new Date(order.created_at).toLocaleString("en-PH")}</div>
        </div>

        <div style={{ fontSize: 12, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
          <span><b>Order:</b> {order.id}</span>
          <span style={{ textTransform: "capitalize" }}>{order.type}</span>
        </div>
        {order.table_no && <div style={{ fontSize: 12, marginBottom: 4 }}><b>Table:</b> {order.table_no}</div>}
        {order.delivery_address && <div style={{ fontSize: 12, marginBottom: 4 }}><b>Address:</b> {order.delivery_address}</div>}

        <div style={{ borderTop: "1px dashed #bbb", borderBottom: "1px dashed #bbb", padding: "12px 0", margin: "14px 0" }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{item.qty} × {fmt(item.price)}</div>
              </div>
              <div style={{ fontWeight: 700 }}>{fmt(item.price * item.qty)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: MUTED }}>Subtotal</span><span>{fmt(order.subtotal)}</span>
        </div>
        {order.discount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: DR }}>
            <span>Discount</span><span>− {fmt(order.discount)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 17, borderTop: "1.5px solid #111", paddingTop: 8, marginTop: 4 }}>
          <span>TOTAL</span><span>{fmt(order.total)}</span>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: MUTED }}>
          <div>Payment: <b style={{ textTransform: "uppercase" }}>{order.payment_method}</b></div>
          {order.payment_ref && <div>Ref No: {order.payment_ref}</div>}
        </div>

        <div style={{ textAlign: "center", marginTop: 22, fontSize: 12, color: MUTED }}>— Thank you! Please come again. —</div>
      </div>

      <div className="no-print" style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Close</Btn>
        <Btn onClick={handlePrint} style={{ flex: 1 }}>🖨 Print Receipt</Btn>
      </div>
    </Modal>
  );
}

export function PaymentModal({ total, config, demoMode, onClose, onPaid }) {
  const [method, setMethod] = useState("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cash = parseFloat(cashGiven) || 0;
  const change = method === "cash" ? Math.max(0, cash - total) : 0;

  // GCash/Card require a configured PayMongo key — locked otherwise,
  // even in demo mode.
  const onlineUnlocked = !!config?.paymongoKey;

  const handlePay = async () => {
    if (method === "cash" && cash < total) { setError("Cash given is less than total amount."); return; }
    if (method !== "cash" && !ref && demoMode) { /* allow demo without ref */ }
    setLoading(true); setError("");
    try {
      let payRef = ref;
      if (!demoMode && config.paymongoKey && method !== "cash") {
        const pmMethods = { gcash: "gcash", card: "card" };
        const pm = await pmReq(config, "payment_intents", {
          data: {
            attributes: {
              amount: Math.round(total * 100),
              payment_method_allowed: [pmMethods[method]],
              currency: "PHP",
              description: `POS Order — ${new Date().toLocaleString("en-PH")}`,
            },
          },
        });
        payRef = pm.data?.id || "";
      }
      await onPaid(method, payRef || (method !== "cash" ? "DEMO-" + genId() : ""));
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const methods = [
    { key: "cash",  emoji: "💵", label: "Cash",  locked: false },
    { key: "gcash", emoji: "📱", label: "GCash", locked: !onlineUnlocked },
    { key: "card",  emoji: "💳", label: "Card",  locked: !onlineUnlocked },
  ];

  return (
    <Modal title="Process Payment" onClose={onClose} width={420}>
      <div style={{ padding: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
          {methods.map(m => (
            <button
              key={m.key}
              onClick={() => { if (m.locked) return; setMethod(m.key); setRef(""); setError(""); }}
              disabled={m.locked}
              title={m.locked ? "Add a PayMongo API key in settings to enable this payment method" : undefined}
              style={{
                padding: "14px 8px", borderRadius: 8, fontFamily: FONT, fontWeight: 700, fontSize: 14, textAlign: "center",
                cursor: m.locked ? "not-allowed" : "pointer",
                position: "relative",
                border: method === m.key && !m.locked ? `2px solid ${DR}` : `1.5px solid ${BORDER}`,
                background: m.locked ? SUBTLE : (method === m.key ? DR_LIGHT : BG),
                color: m.locked ? MUTED : (method === m.key ? DR : TEXT),
                opacity: m.locked ? 0.6 : 1,
              }}>
              {m.locked && (
                <div style={{ position: "absolute", top: 6, right: 8, fontSize: 12 }}>🔒</div>
              )}
              <div style={{ fontSize: 24, marginBottom: 4 }}>{m.emoji}</div>
              {m.label}
            </button>
          ))}
        </div>

        {!onlineUnlocked && (
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 16, textAlign: "center" }}>
            🔒 GCash & Card are locked — configure a PayMongo API key to enable online payments.
          </div>
        )}

        <div style={{ background: SUBTLE, borderRadius: 8, padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: MUTED }}>Amount Due</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: DR }}>{fmt(total)}</span>
        </div>

        {method === "cash" && (
          <>
            <Field label="Cash Given">
              <input type="number" min="0" step="0.01" value={cashGiven} onChange={e => setCashGiven(e.target.value)}
                placeholder="0.00" style={{ ...inputStyle }} autoFocus />
            </Field>
            {cashGiven && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18, padding: "12px 16px",
                background: cash >= total ? SUCCESS_BG : DR_LIGHT, borderRadius: 8, alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: cash >= total ? SUCCESS : DR }}>Change</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: cash >= total ? SUCCESS : DR }}>
                  {cash >= total ? fmt(change) : `Short by ${fmt(total - cash)}`}
                </span>
              </div>
            )}
          </>
        )}

        {method === "gcash" && onlineUnlocked && (
          <Field label="GCash Reference No.">
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. REF123456789" style={{ ...inputStyle }} autoFocus />
          </Field>
        )}
        {method === "card" && onlineUnlocked && (
          <Field label="Card Approval Code">
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. APPR-123456" style={{ ...inputStyle }} autoFocus />
          </Field>
        )}

        <ErrBox msg={error} />
        {demoMode && <p style={{ fontSize: 11, color: MUTED, margin: "0 0 14px" }}>Demo mode — no real charges will be made.</p>}

        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }} disabled={loading}>Cancel</Btn>
          <Btn onClick={handlePay} style={{ flex: 2 }} disabled={loading || (method === "cash" && cash < total && !!cashGiven)}>
            {loading ? "Processing…" : `Confirm ${method === "cash" ? "Cash" : method.toUpperCase()} Payment`}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
export function ConfirmModal({ title = "Are you sure?", message, confirmLabel = "Confirm", danger = false, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={title} onClose={onClose} width={380}>
      <div style={{ padding: 24 }}>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: TEXT, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }} disabled={loading}>Cancel</Btn>
          <Btn
            onClick={handleConfirm}
            style={{ flex: 1, background: danger ? DR : undefined }}
            disabled={loading}
          >
            {loading ? "Processing…" : confirmLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export function SuccessModal({ title = "Success", message, onClose }) {
  return (
    <Modal title="" onClose={onClose} width={340}>
      <div style={{ padding: "32px 24px 24px", textAlign: "center" }}>
<div style={{ marginBottom: 12 }}>
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="28" cy="28" r="28" fill="#D1FAE5" />
    <circle cx="28" cy="28" r="20" fill="#10B981" />
    <polyline points="18,28 25,35 38,21" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
</div>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8, fontFamily: FONT }}>{title}</div>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: MUTED, lineHeight: 1.6 }}>{message}</p>
        <Btn onClick={onClose} style={{ width: "100%" }}>Done</Btn>
      </div>
    </Modal>
  );
}
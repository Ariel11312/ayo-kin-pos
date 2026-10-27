import { BG, DR, DR_LIGHT, TEXT, SUBTLE, FONT, MUTED, BORDER, inputStyle, SUCCESS_BG, SUCCESS } from "../ui/styles";
import fmt from "./fmt";
import Btn from "./btn";
import { ErrBox, OkBox } from "./messageBox";
import Field from "./field";
import { useState, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { printThermal } from "../components/utils/printThermal";

// Local id helper
const genId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Escape text before putting it into the print HTML
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  const payLaterQrRef = useRef(null);
  const riderQrRef = useRef(null);

  // Pickup & Delivery orders carry a rider QR on the receipt.
  const isPickupDelivery = order.type === "pickup_delivery";
  const riderPayload = [
    `Order ID: ${order.id}`,
    `Customer: ${order.customer_name || "—"}`,
    `Address: ${order.delivery_address || "—"}`,
  ].join("\n");

  // Pay Later orders carry a QR that confirms payment when scanned.
  const isPayLater = order.payment_method === "pay_later";
  const payLaterPayload = `PAYLATER-CONFIRM:${order.id}`;

  // Paid/unpaid depends on the PAYMENT, never on the delivery status.
  const isPaid = !isPayLater;

  // Grab the rendered QR canvas as an image for printing
  const qrDataUrl = (ref) => {
    try {
      return ref.current?.querySelector("canvas")?.toDataURL("image/png") || "";
    } catch {
      return "";
    }
  };

  // Build a clean 58mm receipt straight from the order data
  const buildReceiptHtml = () => {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = items.map((item) => `
      <div style="margin-bottom:4px">
        <div class="bold">${esc(item.name)}</div>
        <div class="row small">
          <span>${esc(item.qty)} x ${esc(fmt(item.price))}</span>
          <span>${esc(fmt(item.price * item.qty))}</span>
        </div>
      </div>`).join("");

    const typeLabel = (order.type || "").replace(/_/g, " ");
    const paymentLabel = isPayLater ? "Pay Later" : (order.payment_method || "");

    const payLaterQr = isPayLater ? qrDataUrl(payLaterQrRef) : "";
    const riderQr = isPickupDelivery ? qrDataUrl(riderQrRef) : "";

    return `
      <h2 style="font-size:14px">Bula-On Laundry Shop</h2>
      <div class="center small">Official Receipt</div>
      <div class="center small">${esc(new Date(order.created_at).toLocaleString("en-PH"))}</div>
      <div class="line"></div>

      <div><span class="bold">Order:</span> ${esc(order.id)}</div>
      ${typeLabel ? `<div style="text-transform:capitalize">${esc(typeLabel)}</div>` : ""}
      ${order.customer_name ? `<div><span class="bold">Customer:</span> ${esc(order.customer_name)}</div>` : ""}
      ${order.table_no ? `<div><span class="bold">Table:</span> ${esc(order.table_no)}</div>` : ""}
      ${order.delivery_address ? `<div><span class="bold">Address:</span> ${esc(order.delivery_address)}</div>` : ""}

      <div class="line"></div>
      ${itemsHtml}
      <div class="line"></div>

      <div class="row"><span>Subtotal</span><span>${esc(fmt(order.subtotal ?? order.total))}</span></div>
      ${order.discount > 0 ? `<div class="row"><span>Discount</span><span>- ${esc(fmt(order.discount))}</span></div>` : ""}
      <div class="solid"></div>
      <div class="row bold" style="font-size:14px"><span>TOTAL</span><span>${esc(fmt(order.total))}</span></div>

      <div style="margin-top:8px">
        <div>Payment: <span class="bold" style="text-transform:uppercase">${esc(paymentLabel)}</span></div>
        ${isPayLater ? `<div class="bold">** UNPAID - Pending payment **</div>` : ""}
        ${isPaid ? `<div class="bold">PAID${order.paid_at ? ` - ${esc(new Date(order.paid_at).toLocaleString("en-PH"))}` : ""}</div>` : ""}
        ${isPaid && isPickupDelivery && order.status === "pending" ? `<div>Awaiting delivery</div>` : ""}
        ${order.payment_ref ? `<div>Ref No: ${esc(order.payment_ref)}</div>` : ""}
      </div>

      ${payLaterQr ? `
        <div class="line"></div>
        <img class="qr" src="${payLaterQr}" alt="QR" />
        <div class="center small">Scan at the counter to confirm payment received</div>` : ""}

      ${riderQr ? `
        <div class="line"></div>
        <img class="qr" src="${riderQr}" alt="QR" />
        <div class="center small">Scan for rider pickup &amp; delivery</div>` : ""}

      <div class="line"></div>
      <div class="center small">- Thank you! Please come again. -</div>
    `;
  };

  const handlePrint = () =>
    printThermal(buildReceiptHtml(), { title: `Receipt ${order.id}` });

  return (
    <Modal title="Receipt" onClose={onClose} width={380}>
      {/* On-screen preview only. Printing uses buildReceiptHtml(). */}
      <div id="receipt-print" style={{ padding: 24, fontFamily: '"Courier New", monospace', fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 18, fontFamily: FONT, letterSpacing: -0.5 }}>Bula-On Laundry Shop</div>
          <div style={{ fontSize: 11, color: MUTED }}>Official Receipt</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{new Date(order.created_at).toLocaleString("en-PH")}</div>
        </div>

        <div style={{ fontSize: 12, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
          <span><b>Order:</b> {order.id}</span>
          <span style={{ textTransform: "capitalize" }}>{(order.type || "").replace(/_/g, " ")}</span>
        </div>
        {order.customer_name && <div style={{ fontSize: 12, marginBottom: 4 }}><b>Customer:</b> {order.customer_name}</div>}
        {order.table_no && <div style={{ fontSize: 12, marginBottom: 4 }}><b>Table:</b> {order.table_no}</div>}
        {order.delivery_address && <div style={{ fontSize: 12, marginBottom: 4 }}><b>Address:</b> {order.delivery_address}</div>}

        <div style={{ borderTop: "1px dashed #bbb", borderBottom: "1px dashed #bbb", padding: "12px 0", margin: "14px 0" }}>
          {(order.items || []).map((item, i) => (
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
          <span style={{ color: MUTED }}>Subtotal</span><span>{fmt(order.subtotal ?? order.total)}</span>
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
          <div>
            Payment: <b style={{ textTransform: "uppercase" }}>
              {order.payment_method === "pay_later" ? "Pay Later" : order.payment_method}
            </b>
          </div>
          {isPayLater && (
            <div style={{ color: DR, fontWeight: 700, marginTop: 2 }}>⚠ UNPAID — Pending payment</div>
          )}
          {isPaid && (
            <div style={{ color: SUCCESS, fontWeight: 700, marginTop: 2 }}>
              ✓ PAID{order.paid_at ? ` — ${new Date(order.paid_at).toLocaleString("en-PH")}` : ""}
            </div>
          )}
          {isPaid && isPickupDelivery && order.status === "pending" && (
            <div style={{ marginTop: 2 }}>Awaiting delivery</div>
          )}
          {order.payment_ref && <div>Ref No: {order.payment_ref}</div>}
        </div>

        {isPayLater && (
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <div ref={payLaterQrRef} style={{
              display: "inline-block", padding: 8, background: "#fff",
              border: "1px solid #ddd", borderRadius: 6, lineHeight: 0,
            }}>
              <QRCodeCanvas value={payLaterPayload} size={240} level="M" marginSize={0} style={{ width: 140, height: 140 }} />
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 6, fontFamily: FONT }}>
              Scan at the counter to confirm payment received
            </div>
          </div>
        )}

        {isPickupDelivery && (
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <div ref={riderQrRef} style={{
              display: "inline-block", padding: 8, background: "#fff",
              border: "1px solid #ddd", borderRadius: 6, lineHeight: 0,
            }}>
              <QRCodeCanvas value={riderPayload} size={240} level="M" marginSize={0} style={{ width: 140, height: 140 }} />
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 6, fontFamily: FONT }}>
              Scan for rider pickup &amp; delivery
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 22, fontSize: 12, color: MUTED }}>— Thank you! Please come again. —</div>
      </div>

      <div className="no-print" style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Close</Btn>
        <Btn onClick={handlePrint} style={{ flex: 1 }}>🖨 Print Receipt</Btn>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   PaymentModal

   Props:
   - missingInfo: true when the order is Pickup & Delivery and the customer
     name / 10-digit contact / address aren't complete yet. The payment
     options (Cash / GCash / Pay Later) are ALWAYS shown; while this is
     true we show a warning and keep the Confirm button disabled.
───────────────────────────────────────────── */
export function PaymentModal({ total, config, demoMode, orderType, missingInfo = false, onClose, onPaid }) {
  const [method, setMethod] = useState("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cash = parseFloat(cashGiven) || 0;
  const change = method === "cash" ? Math.max(0, cash - total) : 0;

  const isPayLater = method === "pay_later";

  const handlePay = async () => {
    if (missingInfo) {
      setError("Complete the customer name, 10-digit contact number and address first.");
      return;
    }
    if (method === "cash" && cash < total) { setError("Cash given is less than total amount."); return; }
    if (method === "gcash" && !ref.trim() && !demoMode) { setError("GCash reference number is required."); return; }
    setLoading(true); setError("");
    try {
      // Pay Later: saved as unpaid/pending until settled later.
      if (isPayLater) {
        await onPaid("pay_later", "");
        return;
      }

      // NOTE: the PayMongo call was removed. `pmReq` was never defined or
      // imported, so it threw a ReferenceError whenever a PayMongo key was set.
      // GCash uses the manually entered reference number instead.
      const payRef = ref.trim();
      await onPaid(method, payRef || (method !== "cash" ? "DEMO-" + genId() : ""));
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const methods = [
    { key: "cash",      emoji: "💵", label: "Cash",      locked: false },
    { key: "gcash",     emoji: "📱", label: "GCash",     locked: false },
    { key: "pay_later", emoji: "🕒", label: "Pay Later", locked: false },
  ];

  return (
    <Modal title="Process Payment" onClose={onClose} width={420}>
      <div style={{ padding: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {methods.map(m => (
            <button
              key={m.key}
              onClick={() => { if (m.locked) return; setMethod(m.key); setRef(""); setError(""); }}
              disabled={m.locked}
              style={{
                padding: "12px 6px", borderRadius: 8, fontFamily: FONT, fontWeight: 700, fontSize: 12, textAlign: "center",
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
              <div style={{ fontSize: 22, marginBottom: 4 }}>{m.emoji}</div>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ background: SUBTLE, borderRadius: 8, padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: MUTED }}>Amount Due</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: DR }}>{fmt(total)}</span>
        </div>

        {/* Pickup & Delivery: details still incomplete. Options stay visible,
            but Confirm is disabled until the cashier fills them in. */}
        {missingInfo && (
          <div style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 8,
            background: DR_LIGHT, color: DR, fontSize: 13, fontWeight: 600, lineHeight: 1.5,
          }}>
            ⚠ Pickup &amp; Delivery needs the customer's name, a 10-digit contact number and an address.
            Close this window, fill them in, then pay.
          </div>
        )}

        {isPayLater && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 18, padding: "12px 16px",
            background: DR_LIGHT, borderRadius: 8, fontSize: 13, color: DR, fontWeight: 600,
          }}>
            🕒 This order will be saved as <b>pending</b> — no payment is recorded now. Settle it later from the order.
          </div>
        )}

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

        {method === "gcash" && (
          <Field label="GCash Reference No.">
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. REF123456789" style={{ ...inputStyle }} autoFocus />
          </Field>
        )}

        <ErrBox msg={error} />
        {demoMode && !isPayLater && <p style={{ fontSize: 11, color: MUTED, margin: "0 0 14px" }}>Demo mode — no real charges will be made.</p>}

        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }} disabled={loading}>Cancel</Btn>
          <Btn onClick={handlePay} style={{ flex: 2 }}
            disabled={loading || missingInfo || (method === "cash" && cash < total)}>
            {loading ? "Processing…" : isPayLater ? "Confirm Pay Later" : `Confirm ${method === "cash" ? "Cash" : method.toUpperCase()} Payment`}
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
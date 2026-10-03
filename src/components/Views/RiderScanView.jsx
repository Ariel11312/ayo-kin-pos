import { useState, useEffect, useRef, useMemo } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";
import { BG, BORDER, DR, DR_LIGHT, FONT, MUTED, SUBTLE, TEXT } from "../../ui/styles";
import fmt from "../../function/fmt";
import Btn from "../../function/btn";
import { supabase } from "../../supabase/supabase";

const COMPANY_NAME = "Bula-On Laundry Hub";

const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999, fontFamily: FONT, padding: 16,
  overflowY: "auto",
  boxSizing: "border-box",
};

const modalBox = (isMobile, width, padding, extra = {}) => ({
  background: BG, borderRadius: 12, padding,
  width: isMobile ? "100%" : width, maxWidth: "100%",
  boxShadow: "0 8px 40px rgba(0,0,0,0.25)", border: `1px solid ${BORDER}`,
  boxSizing: "border-box",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  ...extra,
});

const stickyFooter = {
  position: "sticky", bottom: 0, background: BG, paddingTop: 10,
};

const parseRiderOrderId = (decodedText) => {
  const match = (decodedText || "").match(/Order ID:\s*(\S+)/i);
  return match ? match[1] : null;
};

const parsePayLaterOrderId = (decodedText) => {
  const match = (decodedText || "").trim().match(/^PAYLATER-CONFIRM:(\S+)$/i);
  return match ? match[1] : null;
};

const fmtTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return "";
  }
};

let qrScanInstanceCounter = 0;
let cameraReleaseChain = Promise.resolve();

const withTimeout = (promise, ms, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

function QrScanModal({ onDetected, onClose, isMobile, title, subtitle }) {
  const regionIdRef = useRef(`rider-scanner-qr-region-${++qrScanInstanceCounter}`);
  const regionId = regionIdRef.current;
  const scannerRef = useRef(null);
  const [err, setErr] = useState("");
  const [starting, setStarting] = useState(true);

  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  const safeTeardown = (html5Qr) => {
    let resolveDone;
    const done = new Promise((res) => { resolveDone = res; });
    try {
      const maybePromise = html5Qr.stop();
      Promise.resolve(maybePromise)
        .catch(() => {})
        .finally(() => {
          try { html5Qr.clear(); } catch { /* already cleared / never started */ }
          resolveDone();
        });
    } catch {
      try { html5Qr.clear(); } catch { /* ignore */ }
      resolveDone();
    }
    return done;
  };

  useEffect(() => {
    let cancelled = false;
    let html5Qr;

    const myTurn = cameraReleaseChain.then(async () => {
      if (cancelled) return;

      let stream;
      try {
        stream = await withTimeout(
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }),
          8000,
          "Camera permission request timed out."
        );
      } catch (e) {
        if (!cancelled) setErr("Camera unavailable: " + (e?.message || String(e)));
        return;
      }
      stream.getTracks().forEach((t) => t.stop());
      if (cancelled) return;

      try {
        html5Qr = new Html5Qrcode(regionId);
      } catch (e) {
        if (!cancelled) { setErr("Camera unavailable: " + (e?.message || String(e))); setStarting(false); }
        return;
      }
      scannerRef.current = html5Qr;

      withTimeout(
        html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 240 },
          (decodedText) => {
            if (cancelled) return;
            cancelled = true;
            const text = decodedText.trim();
            cameraReleaseChain = safeTeardown(html5Qr);
            onDetectedRef.current(text);
          },
          () => {}
        ),
        8000,
        "Camera took too long to start — try closing other apps/tabs using it."
      )
        .then(() => { if (!cancelled) setStarting(false); })
        .catch((e) => {
          if (!cancelled) setErr("Camera unavailable: " + (e?.message || String(e)));
          cameraReleaseChain = safeTeardown(html5Qr);
        });
    });

    return () => {
      cancelled = true;
      if (html5Qr) {
        cameraReleaseChain = safeTeardown(html5Qr);
      } else {
        cameraReleaseChain = cameraReleaseChain.then(() => myTurn).catch(() => {});
      }
    };
  }, [regionId]);

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox(isMobile, 400, 18)} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          {subtitle}
        </div>
        <div id={regionId} style={{ width: "100%", minHeight: 260, borderRadius: 8, overflow: "hidden", background: "#000" }} />
        {starting && !err && (
          <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Starting camera…</div>
        )}
        {err && (
          <div style={{ fontSize: 12, color: "#e53e3e", marginTop: 10, fontWeight: 600 }}>⚠ {err}</div>
        )}
        <div style={{ ...stickyFooter, marginTop: 14, paddingBottom: 2, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

function OrderDetailModal({ order, onClose, onMarkDelivered, isMobile }) {
  const canvasRef = useRef(null);

  const payload = [
    `Order ID: ${order.id}`,
    `Customer: ${order.customer_name || "—"}`,
    `Address: ${order.delivery_address || "—"}`,
  ].join("\n");

  const handlePrint = () => {
    const dataUrl = canvasRef.current?.toDataURL("image/png");
    if (!dataUrl) return;
    const win = window.open("", "_blank", "width=420,height=600");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Rider QR — ${order.id}</title>
          <style>
            body { font-family: -apple-system, Arial, sans-serif; text-align: center; padding: 28px 20px; }
            h1 { font-size: 16px; margin: 0 0 2px; letter-spacing: 0.4px; }
            h2 { font-size: 12px; margin: 0 0 18px; color: #555; font-weight: 600; }
            img { width: 240px; height: 240px; }
            .details { margin-top: 18px; text-align: left; display: inline-block; font-size: 12px; line-height: 1.7; }
            .details b { display: inline-block; min-width: 70px; }
          </style>
        </head>
        <body>
          <h1>${COMPANY_NAME}</h1>
          <h2>Rider Pickup &amp; Delivery Slip</h2>
          <img src="${dataUrl}" />
          <div class="details">
            <div><b>Order ID:</b> ${order.id}</div>
            <div><b>Customer:</b> ${order.customer_name || "—"}</div>
            <div><b>Address:</b> ${order.delivery_address || "—"}</div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox(isMobile, 380, 22, { textAlign: "center" })} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 800, color: DR, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 }}>
          {COMPANY_NAME}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 14 }}>
          Order {order.id}
        </div>

        <div style={{
          display: "inline-block", borderRadius: 8, overflow: "hidden",
          border: `1px solid ${BORDER}`, lineHeight: 0,
        }}>
          <QRCodeCanvas ref={canvasRef} value={payload} size={200} level="M" marginSize={2} />
        </div>

        <div style={{
          marginTop: 14, textAlign: "left", fontSize: 12, color: TEXT,
          background: SUBTLE, borderRadius: 8, padding: "10px 12px", lineHeight: 1.7,
        }}>
          <div><strong>Customer:</strong> {order.customer_name || "—"}</div>
          <div><strong>Address:</strong> {order.delivery_address || "—"}</div>
          <div><strong>Total:</strong> {fmt(order.total)}</div>
          <div><strong>Placed:</strong> {fmtTime(order.created_at)}</div>
        </div>

        <div style={{ ...stickyFooter, marginTop: 6 }}>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Btn variant="ghost" onClick={handlePrint} style={{ flex: 1, padding: isMobile ? "12px 0" : "9px 0" }}>
              🖨 Print
            </Btn>
            <Btn onClick={() => onMarkDelivered(order.id)} style={{ flex: 1, padding: isMobile ? "12px 0" : "9px 0" }}>
              ✓ Mark delivered
            </Btn>
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn variant="ghost" onClick={onClose} style={{ width: "100%", padding: isMobile ? "12px 0" : "9px 0" }}>
              Close
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function PayLaterDetailModal({ order, onClose, onMarkPaid, isMobile }) {
  const canvasRef = useRef(null);

  const payload = `PAYLATER-CONFIRM:${order.id}`;

  const handlePrint = () => {
    const dataUrl = canvasRef.current?.toDataURL("image/png");
    if (!dataUrl) return;
    const win = window.open("", "_blank", "width=420,height=600");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Pay Later QR — ${order.id}</title>
          <style>
            body { font-family: -apple-system, Arial, sans-serif; text-align: center; padding: 28px 20px; }
            h1 { font-size: 16px; margin: 0 0 2px; letter-spacing: 0.4px; }
            h2 { font-size: 12px; margin: 0 0 18px; color: #555; font-weight: 600; }
            img { width: 240px; height: 240px; }
            .details { margin-top: 18px; text-align: left; display: inline-block; font-size: 12px; line-height: 1.7; }
            .details b { display: inline-block; min-width: 70px; }
          </style>
        </head>
        <body>
          <h1>${COMPANY_NAME}</h1>
          <h2>Pay Later — Confirm Payment Slip</h2>
          <img src="${dataUrl}" />
          <div class="details">
            <div><b>Order ID:</b> ${order.id}</div>
            <div><b>Customer:</b> ${order.customer_name || "—"}</div>
            <div><b>Total:</b> ${fmt(order.total)}</div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox(isMobile, 380, 22, { textAlign: "center" })} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 800, color: DR, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 }}>
          {COMPANY_NAME}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 4 }}>
          Order {order.id}
        </div>
        <div style={{
          display: "inline-block", background: DR_LIGHT, color: DR, fontWeight: 800,
          fontSize: 11, padding: "3px 10px", borderRadius: 20, marginBottom: 12,
        }}>
          🕒 PAY LATER — UNPAID
        </div>

        <div>
          <div style={{
            display: "inline-block", borderRadius: 8, overflow: "hidden",
            border: `1px solid ${BORDER}`, lineHeight: 0,
          }}>
            <QRCodeCanvas ref={canvasRef} value={payload} size={200} level="M" marginSize={2} />
          </div>
        </div>

        <div style={{
          marginTop: 14, textAlign: "left", fontSize: 12, color: TEXT,
          background: SUBTLE, borderRadius: 8, padding: "10px 12px", lineHeight: 1.7,
        }}>
          <div><strong>Customer:</strong> {order.customer_name || "—"}</div>
          <div><strong>Type:</strong> {order.type === "pickup_delivery" ? "Pickup & Delivery" : "Walk-in"}</div>
          <div><strong>Total:</strong> {fmt(order.total)}</div>
          <div><strong>Placed:</strong> {fmtTime(order.created_at)}</div>
        </div>

        <div style={{ ...stickyFooter, marginTop: 6 }}>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Btn variant="ghost" onClick={handlePrint} style={{ flex: 1, padding: isMobile ? "12px 0" : "9px 0" }}>
              🖨 Print
            </Btn>
            <Btn onClick={() => onMarkPaid(order.id)} style={{ flex: 1, padding: isMobile ? "12px 0" : "9px 0" }}>
              ✓ Mark paid
            </Btn>
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn variant="ghost" onClick={onClose} style={{ width: "100%", padding: isMobile ? "12px 0" : "9px 0" }}>
              Close
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Confirm Payment Modal
   Asks whether a Pay Later order was settled
   in Cash or GCash before marking it paid.
───────────────────────────────────────────── */
function ConfirmPaymentModal({ order, onClose, onConfirm, busy }) {
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");

  const handleConfirm = () => {
    if (method === "gcash" && !ref.trim()) {
      setErr("GCash reference number is required.");
      return;
    }
    setErr("");
    onConfirm({ method, ref: ref.trim() });
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox(false, 360, 22)} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 4 }}>
          Confirm payment
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
          How was order <b>{order.id}</b> settled?
        </div>

        <div style={{
          background: SUBTLE, borderRadius: 8, padding: "10px 14px",
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
        }}>
          <span style={{ fontSize: 12, color: MUTED }}>Amount Due</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: DR }}>{fmt(order.total)}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { key: "cash",  emoji: "💵", label: "Cash"  },
            { key: "gcash", emoji: "📱", label: "GCash" },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => { setMethod(m.key); setErr(""); if (m.key === "cash") setRef(""); }}
              style={{
                padding: "14px 6px", borderRadius: 8, fontFamily: FONT, fontWeight: 700, fontSize: 13,
                textAlign: "center", cursor: "pointer",
                border: method === m.key ? `2px solid ${DR}` : `1.5px solid ${BORDER}`,
                background: method === m.key ? DR_LIGHT : BG,
                color: method === m.key ? DR : TEXT,
              }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{m.emoji}</div>
              {m.label}
            </button>
          ))}
        </div>

        {method === "gcash" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
              GCash Reference No.
            </div>
            <input
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="e.g. REF123456789"
              autoFocus
              style={{ width: "100%", padding: "10px 12px", borderRadius: 7, border: `1px solid ${BORDER}`, fontFamily: FONT, fontSize: 13.5, boxSizing: "border-box" }}
            />
          </div>
        )}

        {err && (
          <div style={{ fontSize: 12, color: "#e53e3e", marginBottom: 12, fontWeight: 600 }}>⚠ {err}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose} disabled={busy} style={{ flex: 1, padding: "10px 0" }}>
            Cancel
          </Btn>
          <Btn onClick={handleConfirm} disabled={busy} style={{ flex: 1.4, padding: "10px 0" }}>
            {busy ? "Saving…" : `✓ Mark as ${method === "cash" ? "Cash" : "GCash"}`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function RiderScannerView({ orders, setOrders }) {
  const [scanMode, setScanMode] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedPayLater, setSelectedPayLater] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Which Pay Later order is being confirmed (Cash vs GCash).
  const [confirmingPay, setConfirmingPay] = useState(null);

  const showToast = (msg, type = "warn") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  };

  const pending = useMemo(
    () =>
      (orders || [])
        .filter(o => o.type === "pickup_delivery" && o.status === "pending")
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [orders]
  );

  const pendingPayLater = useMemo(
    () =>
      (orders || [])
        .filter(o => o.payment_method === "pay_later" && o.status === "pending")
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [orders]
  );

  const markDelivered = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) { showToast(`Order ${orderId} not found.`, "err"); return; }
    if (order.status === "completed") { showToast(`Order ${orderId} is already delivered.`, "warn"); return; }

    setBusyId(orderId);

    const { data, error } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderId)
      .select();

    setBusyId(null);

    if (error) { showToast(`Could not update order: ${error.message}`, "err"); return; }
    if (!data || data.length === 0) {
      showToast(`Order ${orderId} was not updated — check update permissions/RLS on "orders".`, "err");
      return;
    }

    const updatedRow = data[0];
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedRow } : o));
    setSelected(null);
    showToast(`Order ${orderId} marked as delivered.`, "warn");
  };

  // markPaid accepts { method, ref } from the confirm modal.
  // paid_at is stamped with the exact moment the cashier confirms Cash/GCash.
  const markPaid = async (orderId, choice = null) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) { showToast(`Order ${orderId} not found.`, "err"); return; }
    if (order.payment_method !== "pay_later") {
      showToast(`Order ${orderId} isn't a Pay Later order.`, "err"); return;
    }
    if (order.status === "completed") { showToast(`Order ${orderId} is already marked as paid.`, "warn"); return; }

    setBusyId(orderId);

    const updates = { status: "completed" };
    if (choice?.method) {
      updates.payment_method = choice.method;      // "cash" | "gcash"
      updates.payment_ref = choice.ref || null;    // GCash ref when applicable
      updates.paid_at = new Date().toISOString();  // date/time the payment was confirmed
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select();

    setBusyId(null);

    if (error) { showToast(`Could not update order: ${error.message}`, "err"); return; }
    if (!data || data.length === 0) {
      showToast(`Order ${orderId} was not updated — check update permissions/RLS on "orders".`, "err");
      return;
    }

    const updatedRow = data[0];
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedRow } : o));
    setSelectedPayLater(null);
    setConfirmingPay(null);
    showToast(`Order ${orderId} marked as paid.`, "warn");
  };

  const handleRiderScanned = (decodedText) => {
    setScanMode(null);
    const orderId = parseRiderOrderId(decodedText);
    if (!orderId) { showToast("QR code not recognized as a rider slip.", "err"); return; }

    const order = orders.find(o => o.id === orderId);
    if (!order) { showToast(`Order ${orderId} not found.`, "err"); return; }
    if (order.type !== "pickup_delivery") { showToast(`Order ${orderId} isn't a Pickup & Delivery order.`, "err"); return; }
    if (order.status === "completed") { showToast(`Order ${orderId} is already marked delivered.`, "warn"); return; }

    markDelivered(orderId);
  };

  const handlePayLaterScanned = (decodedText) => {
    setScanMode(null);
    const orderId = parsePayLaterOrderId(decodedText);
    if (!orderId) { showToast("QR code not recognized as a Pay Later confirmation.", "err"); return; }

    const order = orders.find(o => o.id === orderId);
    if (!order) { showToast(`Order ${orderId} not found.`, "err"); return; }
    if (order.payment_method !== "pay_later") { showToast(`Order ${orderId} isn't a Pay Later order.`, "err"); return; }
    if (order.status === "completed") { showToast(`Order ${orderId} is already marked as paid.`, "warn"); return; }

    // Open the Cash/GCash picker instead of silently marking it paid.
    setConfirmingPay(order);
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
    <div style={{ fontFamily: FONT, padding: 20, paddingBottom: 60, maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>Rider Scanner</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
            Scan a delivery slip to mark it delivered, scan a Pay Later receipt to confirm payment, or complete one manually below.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Btn onClick={() => setScanMode("rider")} style={{ padding: "10px 18px" }}>
            📷 Scan rider QR
          </Btn>
          <Btn variant="ghost" onClick={() => setScanMode("paylater")} style={{ padding: "10px 18px" }}>
            🕒 Scan Pay Later
          </Btn>
        </div>
      </div>

      {/* ── Pending deliveries ── */}
      <div style={{
        marginTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${BORDER}`, paddingBottom: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
          Pending deliveries {pending.length > 0 && <span style={{ color: MUTED, fontWeight: 600 }}>· {pending.length}</span>}
        </div>
      </div>

      {pending.length === 0 ? (
        <div style={{ textAlign: "center", color: MUTED, padding: "56px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🛵</div>
          <div style={{ fontSize: 14 }}>No pending deliveries</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Pickup & Delivery orders will show up here once paid.</div>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {pending.map(o => (
            <div key={o.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px",
              background: BG,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>
                  {o.id} <span style={{ color: MUTED, fontWeight: 600 }}>· {fmt(o.total)}</span>
                </div>
                <div style={{ fontSize: 12, color: TEXT, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.customer_name || "—"}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.delivery_address || "—"}
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Placed {fmtTime(o.created_at)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Btn variant="ghost" onClick={() => setSelected(o)} style={{ padding: "8px 12px" }}>
                  QR
                </Btn>
                <Btn onClick={() => markDelivered(o.id)} disabled={busyId === o.id} style={{ padding: "8px 12px" }}>
                  {busyId === o.id ? "…" : "✓ Delivered"}
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pending Pay Later ── */}
      <div style={{
        marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${BORDER}`, paddingBottom: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
          Pending Pay Later {pendingPayLater.length > 0 && <span style={{ color: MUTED, fontWeight: 600 }}>· {pendingPayLater.length}</span>}
        </div>
      </div>

      {pendingPayLater.length === 0 ? (
        <div style={{ textAlign: "center", color: MUTED, padding: "56px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🕒</div>
          <div style={{ fontSize: 14 }}>No unpaid Pay Later orders</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Orders paid via "Pay Later" will show up here until confirmed.</div>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {pendingPayLater.map(o => (
            <div key={o.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px",
              background: BG,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>
                  {o.id} <span style={{ color: MUTED, fontWeight: 600 }}>· {fmt(o.total)}</span>
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 800, color: DR, background: DR_LIGHT,
                    borderRadius: 20, padding: "1px 8px", verticalAlign: "middle",
                  }}>
                    UNPAID
                  </span>
                </div>
                <div style={{ fontSize: 12, color: TEXT, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.customer_name || "—"} <span style={{ color: MUTED }}>· {o.type === "pickup_delivery" ? "Pickup & Delivery" : "Walk-in"}</span>
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Placed {fmtTime(o.created_at)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Btn variant="ghost" onClick={() => setSelectedPayLater(o)} style={{ padding: "8px 12px" }}>
                  QR
                </Btn>
                {/* Opens the Cash / GCash picker instead of marking paid directly. */}
                <Btn onClick={() => setConfirmingPay(o)} disabled={busyId === o.id} style={{ padding: "8px 12px" }}>
                  {busyId === o.id ? "…" : "✓ Paid"}
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {scanMode === "rider" && (
        <QrScanModal
          onDetected={handleRiderScanned}
          onClose={() => setScanMode(null)}
          isMobile={false}
          title="Scan rider QR"
          subtitle="Point the camera at the delivery slip to mark it delivered."
        />
      )}
      {scanMode === "paylater" && (
        <QrScanModal
          onDetected={handlePayLaterScanned}
          onClose={() => setScanMode(null)}
          isMobile={false}
          title="Scan Pay Later QR"
          subtitle="Point the camera at the customer's receipt to confirm payment."
        />
      )}
      {selected && (
        <OrderDetailModal
          order={selected}
          onClose={() => setSelected(null)}
          onMarkDelivered={markDelivered}
          isMobile={false}
        />
      )}
      {selectedPayLater && (
        <PayLaterDetailModal
          order={selectedPayLater}
          onClose={() => setSelectedPayLater(null)}
          onMarkPaid={() => setConfirmingPay(selectedPayLater)}
          isMobile={false}
        />
      )}

      {/* Cash / GCash confirm modal */}
      {confirmingPay && (
        <ConfirmPaymentModal
          order={confirmingPay}
          busy={busyId === confirmingPay.id}
          onClose={() => setConfirmingPay(null)}
          onConfirm={(choice) => markPaid(confirmingPay.id, choice)}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", zIndex: 10000, bottom: 24, right: 24,
          background: toast.type === "err" ? "#FDECEA" : "#FEF3CD",
          color: toast.type === "err" ? "#C0392B" : "#B7770D",
          border: `1px solid ${toast.type === "err" ? "#C0392B" : "#B7770D"}`,
          borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, fontFamily: FONT,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
    </div>
  );
}
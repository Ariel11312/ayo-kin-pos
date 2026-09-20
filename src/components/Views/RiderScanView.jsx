import { useState, useEffect, useRef, useMemo } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";
import { BG, BORDER, DR, DR_LIGHT, FONT, MUTED, SUBTLE, TEXT } from "../../ui/styles";
import fmt from "../../function/fmt";
import Btn from "../../function/btn";
import { supabase } from "../../supabase/supabase";

const COMPANY_NAME = "Bula-On Laundry Hub";

// Pulls the order id back out of a rider-slip QR payload, which the POS's
// RiderQRModal encodes as "Order ID: ...\nCustomer: ...\nAddress: ...".
const parseRiderOrderId = (decodedText) => {
  const match = (decodedText || "").match(/Order ID:\s*(\S+)/i);
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

/* ─────────────────────────────────────────────
   QR Scan Modal — opens the camera, reads a rider
   slip's QR, hands the raw decoded text back.
───────────────────────────────────────────── */
// Give every mounted scanner its own DOM id rather than one fixed id. If a
// second Html5Qrcode instance is ever constructed before the first one's
// DOM node has fully torn down (e.g. opening the scanner again quickly
// after closing it), some html5-qrcode versions throw *synchronously* from
// `new Html5Qrcode()` or `.stop()`. An uncaught throw inside a mounted
// component with no error boundary blanks the entire React app — which is
// what was happening here.
let qrScanInstanceCounter = 0;

// Tracks the teardown of whichever QrScanModal instance was mounted most
// recently. A new instance awaits this before touching the camera, so it
// never races the previous instance for the device. Without this, closing
// the scanner and reopening it quickly leaves the old `stop()` still
// in flight when the new `start()` fires — on many browsers that means the
// camera device is still locked, and the new `start()` promise just never
// settles (neither resolves nor rejects), which is what an infinite
// "Starting camera…" spinner looks like.
let cameraReleaseChain = Promise.resolve();

// A `start()` call that never settles is otherwise fatal to the UI — this
// wraps any promise so it always resolves/rejects within `ms`, turning a
// silent hang into a visible error.
const withTimeout = (promise, ms, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

function QrScanModal({ onDetected, onClose, isMobile }) {
  const regionIdRef = useRef(`rider-scanner-qr-region-${++qrScanInstanceCounter}`);
  const regionId = regionIdRef.current;
  const scannerRef = useRef(null);
  const [err, setErr] = useState("");
  const [starting, setStarting] = useState(true);

  // FIX: keep the latest onDetected in a ref instead of putting it in the
  // effect's dependency array. Whoever renders <QrScanModal onDetected={
  // (text) => handleScanned(text) }> passes a brand-new function on every
  // parent re-render — with `onDetected` as a dependency, the start-camera
  // effect below would re-run on every one of those re-renders, tearing
  // down and restarting the camera each time. That's what caused the
  // "Starting camera…" spinner to loop endlessly instead of settling.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  // Stopping a scanner that never finished starting, or stopping/clearing
  // it twice, is what tends to throw. This helper makes teardown safe to
  // call from both the detection handler and the unmount cleanup without
  // letting either throw escape uncaught. Returns a promise that resolves
  // once the camera device has actually been released, so callers (see
  // `cameraReleaseChain` below) can wait on it.
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
      // stop() itself threw synchronously (e.g. scanner was never running) —
      // still try to clear so the DOM node is left in a clean state.
      try { html5Qr.clear(); } catch { /* ignore */ }
      resolveDone();
    }
    return done;
  };

  useEffect(() => {
    let cancelled = false;
    let html5Qr;

    // Wait for any previous instance's camera to actually be released
    // before requesting it again, then run the rest of the startup only if
    // this effect hasn't since been cleaned up (e.g. modal closed while
    // we were waiting).
    const myTurn = cameraReleaseChain.then(async () => {
      if (cancelled) return;

      // Explicit permission check up front: getUserMedia rejects clearly
      // on denial/no-camera, instead of leaving start() to hang on some
      // browsers when there's no environment-facing camera to grab.
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
      // We only needed this to confirm access / surface a clear error;
      // html5-qrcode opens its own stream via start() below.
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
            // Tear down the camera first, but don't make the caller wait on
            // it — `onDetected` (which typically closes this modal, unmounting
            // it) can run right away. The unmount cleanup below is guarded to
            // no-op safely if this teardown is still in flight.
            cameraReleaseChain = safeTeardown(html5Qr);
            onDetectedRef.current(text);
          },
          () => {} // per-frame "no QR found yet" — ignore
        ),
        8000,
        "Camera took too long to start — try closing other apps/tabs using it."
      )
        .then(() => { if (!cancelled) setStarting(false); })
        .catch((e) => {
          if (!cancelled) setErr("Camera unavailable: " + (e?.message || String(e)));
          // The start() call may still land after our timeout fires; make
          // sure we release the device rather than leaving it locked for
          // the next instance.
          cameraReleaseChain = safeTeardown(html5Qr);
        });
    });

    return () => {
      cancelled = true;
      if (html5Qr) {
        cameraReleaseChain = safeTeardown(html5Qr);
      } else {
        // We were still waiting our turn (or on the permission prompt) when
        // this unmounted — chain onto myTurn so a late-arriving stream still
        // gets released instead of leaking.
        cameraReleaseChain = cameraReleaseChain.then(() => myTurn).catch(() => {});
      }
    };
    // FIX: `onDetected` removed from deps — see onDetectedRef above. Only
    // `regionId` (stable for the life of this instance) should restart the
    // camera; it never actually changes, so in practice this effect now
    // runs exactly once per mount, as intended.
  }, [regionId]);

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999, fontFamily: FONT, padding: 16,
  };

  const box = {
    background: BG, borderRadius: 12, padding: 18,
    width: isMobile ? "100%" : 400, maxWidth: "100%",
    boxShadow: "0 8px 40px rgba(0,0,0,0.25)", border: `1px solid ${BORDER}`,
    boxSizing: "border-box",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Scan rider QR</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          Point the camera at the delivery slip to mark it delivered.
        </div>
        <div id={regionId} style={{ width: "100%", minHeight: 260, borderRadius: 8, overflow: "hidden", background: "#000" }} />
        {starting && !err && (
          <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Starting camera…</div>
        )}
        {err && (
          <div style={{ fontSize: 12, color: "#e53e3e", marginTop: 10, fontWeight: 600 }}>⚠ {err}</div>
        )}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Order Detail / QR Modal
   Lets staff re-open an order's rider QR (to
   reprint a lost slip) or confirm delivery by
   hand when scanning isn't practical.
───────────────────────────────────────────── */
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

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999, fontFamily: FONT, padding: 16,
  };

  const box = {
    background: BG, borderRadius: 12, padding: 22,
    width: isMobile ? "100%" : 380, maxWidth: "100%",
    boxShadow: "0 8px 40px rgba(0,0,0,0.25)", border: `1px solid ${BORDER}`,
    boxSizing: "border-box", textAlign: "center",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
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

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
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
  );
}

/* ─────────────────────────────────────────────
   Rider Scanner — main view
   Sidebar page: scan a delivery slip's QR to
   close out a Pickup & Delivery order, or pick
   one from the pending list by hand.
───────────────────────────────────────────── */
export default function RiderScannerView({ orders, setOrders }) {
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

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

  const markDelivered = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) { showToast(`Order ${orderId} not found.`, "err"); return; }
    if (order.status === "completed") { showToast(`Order ${orderId} is already delivered.`, "warn"); return; }

    setBusyId(orderId);

    // IMPORTANT: .select() forces Supabase to return the rows it actually
    // touched. Without it, `error` comes back null even when RLS silently
    // blocks the write or the `.eq("id", ...)` match hits zero rows — the
    // request "succeeds" but nothing in the database changes, which is why
    // the order can look delivered locally and then revert to pending on
    // the next refresh/subscription tick.
    const { data, error } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderId)
      .select();

    setBusyId(null);

    if (error) {
      showToast(`Could not update order: ${error.message}`, "err");
      return;
    }

    if (!data || data.length === 0) {
      // Zero rows affected with no error — almost always a Row-Level
      // Security policy blocking the UPDATE for the current role, or the
      // scanned/selected id not actually matching the `id` column (type
      // mismatch, stale QR text, etc). Surface this instead of silently
      // pretending it worked.
      showToast(
        `Order ${orderId} was not updated — check update permissions/RLS on "orders".`,
        "err"
      );
      return;
    }

    const updatedRow = data[0];
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedRow } : o));
    setSelected(null);
    showToast(`Order ${orderId} marked as delivered.`, "warn");
  };

  const handleScanned = (decodedText) => {
    setScanning(false);
    const orderId = parseRiderOrderId(decodedText);
    if (!orderId) { showToast("QR code not recognized as a rider slip.", "err"); return; }

    const order = orders.find(o => o.id === orderId);
    if (!order) { showToast(`Order ${orderId} not found.`, "err"); return; }
    if (order.type !== "pickup_delivery") { showToast(`Order ${orderId} isn't a Pickup & Delivery order.`, "err"); return; }
    if (order.status === "completed") { showToast(`Order ${orderId} is already marked delivered.`, "warn"); return; }

    markDelivered(orderId);
  };

  return (
    <div style={{ fontFamily: FONT, padding: 20, maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>Rider Scanner</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
            Scan a delivery slip to mark it delivered, or complete one manually below.
          </div>
        </div>
        <Btn onClick={() => setScanning(true)} style={{ padding: "10px 18px", flexShrink: 0 }}>
          📷 Scan rider QR
        </Btn>
      </div>

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

      {scanning && (
        <QrScanModal onDetected={handleScanned} onClose={() => setScanning(false)} isMobile={false} />
      )}
      {selected && (
        <OrderDetailModal
          order={selected}
          onClose={() => setSelected(null)}
          onMarkDelivered={markDelivered}
          isMobile={false}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", zIndex: 300, bottom: 24, right: 24,
          background: toast.type === "err" ? "#FDECEA" : "#FEF3CD",
          color: toast.type === "err" ? "#C0392B" : "#B7770D",
          border: `1px solid ${toast.type === "err" ? "#C0392B" : "#B7770D"}`,
          borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, fontFamily: FONT,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { BG, BORDER, DR, DR_LIGHT, FONT, inputStyle, MUTED, SUBTLE, TEXT } from "../../ui/styles";
import fmt from "../../function/fmt";
import { ErrBox } from "../../function/messageBox";
import Btn from "../../function/btn";
import { PaymentModal, ReceiptModal } from "../../function/modal";
import { supabase } from "../../supabase/supabase";

/* ── localStorage helpers ── */
const STORAGE_KEY = "pos_cart_state";

const loadCartState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveCartState = (state) => {
  try {
    if (state === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // storage full or unavailable — fail silently
  }
};

const genId = () => "ORD-" + Math.random().toString(36).substring(2, 8).toUpperCase();
const ts = () => new Date().toISOString();

const DISCOUNT_TYPES = [
  { key: "none",   label: "None",           rate: 0    },
  { key: "pwd",    label: "PWD",            rate: 0.20 },
  { key: "senior", label: "Senior Citizen", rate: 0.20 },
  { key: "custom", label: "Custom",         rate: null },
];

/* ── stock status (mirrors StockView logic) ── */
const WARNING    = "#B7770D";
const WARNING_BG = "#FEF3CD";
const DANGER     = "#C0392B";
const DANGER_BG  = "#FDECEA";

const getStockStatus = (item) => {
  if (item.stock == null) return null; // stock not tracked for this item
  // Coerce to Number: numeric/decimal Postgres columns come back as strings
  // via supabase-js, and strict equality (===) won't coerce "0" to 0.
  const stock   = Number(item.stock ?? 0);
  const reorder = Number(item.reorder ?? 3);
  if (stock === 0)      return "out";
  if (stock <= reorder) return "low";
  return "ok";
};

/* ─────────────────────────────────────────────
   Responsive helper
   Single source of truth for the phone/tablet
   breakpoint. Listens to matchMedia so rotating
   the device re-renders immediately.
───────────────────────────────────────────── */
const MOBILE_BP = 820;

const useIsMobile = (bp = MOBILE_BP) => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= bp
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${bp}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [bp]);

  return isMobile;
};

// iOS zooms the page when a focused input's font-size is under 16px.
const noZoomFont = (isMobile) => (isMobile ? 16 : 13);
const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";

/* ─────────────────────────────────────────────
   Discount Info Modal (PWD / Senior Citizen)
   Desktop: centred dialog. Mobile: bottom sheet
   that stays clear of the keyboard.
───────────────────────────────────────────── */
function DiscountInfoModal({ type, onConfirm, onClose, isMobile }) {
  const [idNo,    setIdNo]    = useState("");
  const [name,    setName]    = useState("");
  const [address, setAddress] = useState("");
  const [err,     setErr]     = useState("");

  const label = type === "pwd" ? "PWD" : "Senior Citizen";

  const handleConfirm = () => {
    if (!idNo.trim())    return setErr("ID number is required.");
    if (!name.trim())    return setErr("Name is required.");
    if (!address.trim()) return setErr("Address is required.");
    setErr("");
    onConfirm({ idNo: idNo.trim(), name: name.trim(), address: address.trim() });
  };

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center",
    zIndex: 9999, fontFamily: FONT,
    padding: isMobile ? 0 : 16,
    overscrollBehavior: "contain",
  };

  const box = {
    background: BG,
    borderRadius: isMobile ? "16px 16px 0 0" : 12,
    padding: isMobile ? "22px 18px" : 28,
    width: isMobile ? "100%" : 380,
    maxWidth: "100%",
    maxHeight: isMobile ? "92vh" : "90vh",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    paddingBottom: isMobile ? `calc(22px + ${SAFE_BOTTOM})` : 28,
    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
    border: `1px solid ${BORDER}`,
    boxSizing: "border-box",
  };

  const badge = {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: DR, color: "#fff", fontSize: 12, fontWeight: 800,
    padding: "4px 12px", borderRadius: 20, marginBottom: 16, letterSpacing: 0.4,
  };

  const field = { marginBottom: 14 };
  const lbl   = { fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase",
                  letterSpacing: 0.5, marginBottom: 5, display: "block" };
  const inp   = {
    ...inputStyle,
    fontSize: noZoomFont(isMobile),
    padding: isMobile ? "11px 12px" : "8px 10px",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>

        {/* Grab handle — mobile only */}
        {isMobile && (
          <div style={{ width: 38, height: 4, borderRadius: 2, background: BORDER, margin: "0 auto 14px" }} />
        )}

        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <div style={badge}>🪪 {label} Discount — 20% off</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, marginBottom: 4 }}>
            {label} Details
          </div>
          <div style={{ fontSize: 12, color: MUTED }}>
            Required for discount eligibility. Please fill in all fields.
          </div>
        </div>

        {/* Fields */}
        <div style={field}>
          <label style={lbl}>{label} ID Number</label>
          <input
            style={inp}
            value={idNo}
            onChange={e => setIdNo(e.target.value)}
            placeholder={type === "pwd" ? "e.g. PWD-2024-000123" : "e.g. SC-2024-000456"}
            autoFocus={!isMobile}
            autoCapitalize="characters"
            autoCorrect="off"
          />
        </div>

        <div style={field}>
          <label style={lbl}>Full Name</label>
          <input
            style={inp}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="As shown on ID"
            autoCapitalize="words"
          />
        </div>

        <div style={field}>
          <label style={lbl}>Address</label>
          <textarea
            style={{ ...inp, resize: "vertical", minHeight: 64, lineHeight: 1.5 }}
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Home address on record"
          />
        </div>

        {err && (
          <div style={{ fontSize: 12, color: "#e53e3e", marginBottom: 12, fontWeight: 600 }}>
            ⚠ {err}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}
            style={{ flexShrink: 0, padding: isMobile ? "12px 18px" : "9px 16px" }}>
            Cancel
          </Btn>
          <Btn onClick={handleConfirm} style={{ flex: 1, padding: isMobile ? "12px 16px" : undefined }}>
            Apply discount
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main POS View
───────────────────────────────────────────── */
export default function POSView({ categories, items, setItems, orders, setOrders, config, demoMode }) {
  const isMobile = useIsMobile();

  const [activeCat, setActiveCat] = useState("all");

  // Restore persisted cart state on mount (lazy initializers run once, before first paint)
  const [cart, setCart]                 = useState(() => loadCartState()?.cart ?? []);
const [orderType, setOrderType] = useState(() => loadCartState()?.orderType ?? "pickup");
  const [tableNo, setTableNo]           = useState(() => loadCartState()?.tableNo ?? "");
  const [deliveryAddr, setDeliveryAddr] = useState(() => loadCartState()?.deliveryAddr ?? "");
  const [discount, setDiscount]         = useState(() => loadCartState()?.discount ?? "");
  const [discountType, setDiscountType] = useState(() => loadCartState()?.discountType ?? "none");
  const [discountInfo, setDiscountInfo] = useState(() => loadCartState()?.discountInfo ?? null);

  const [pendingDiscType, setPendingDiscType] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [modal, setModal] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  // Mobile only: the cart lives in a sheet that slides up over the menu.
  const [cartOpen, setCartOpen] = useState(false);

  // Persist cart-related state on every change
  useEffect(() => {
    saveCartState({ cart, orderType, tableNo, deliveryAddr, discount, discountType, discountInfo });
  }, [cart, orderType, tableNo, deliveryAddr, discount, discountType, discountInfo]);

  // Leaving mobile width while the sheet is open would otherwise strand it open.
  useEffect(() => {
    if (!isMobile) setCartOpen(false);
  }, [isMobile]);

  // Stop the page behind the sheet/modals from scrolling on touch devices.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const lock = isMobile && (cartOpen || modal !== null);
    const prev = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, cartOpen, modal]);

  const showToast = (msg, type = "warn") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  };

  const filtered = items.filter(i => {
    const matchCat = activeCat === "all" || i.category_id === activeCat;
    const matchSearch = !searchQ || i.name.toLowerCase().includes(searchQ.toLowerCase());
    return matchCat && matchSearch && i.available;
  });

  const addToCart = (item) => {
    const status = getStockStatus(item);
    const currentQtyInCart = cart.find(c => c.id === item.id)?.qty ?? 0;

    if (status === "out") {
      showToast(`${item.name} is out of stock`, "err");
      return; // block adding entirely
    }

    setCart(prev => {
      const idx = prev.findIndex(c => c.id === item.id);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...item, qty: 1 }];
    });

    if (item.stock != null && currentQtyInCart + 1 > Number(item.stock)) {
      showToast(`${item.name}: cart now exceeds available stock (${Number(item.stock)} left)`, "err");
    } else if (status === "low") {
      showToast(`${item.name}: only ${Number(item.stock)} left in stock`, "warn");
    }
  };

  const updateQty = (id, delta) =>
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const discAmt = (() => {
    if (discountType === "custom") return Math.min(parseFloat(discount) || 0, subtotal);
    const found = DISCOUNT_TYPES.find(d => d.key === discountType);
    return found?.rate ? Math.min(subtotal * found.rate, subtotal) : 0;
  })();

  const total = subtotal - discAmt;

  // Does any line in the cart exceed currently-known live stock?
  const hasOverstockedItem = cart.some(c => {
    const live = items.find(i => i.id === c.id);
    return live?.stock != null && c.qty > Number(live.stock);
  });

const clearOrder = () => {
  setCart([]); setOrderType("pickup"); setTableNo("");
  setDeliveryAddr(""); setDiscount(""); setDiscountType("none");
  setDiscountInfo(null); setError("");
  saveCartState(null);
};

  /* When a discount button is clicked */
  const handleDiscountSelect = (d) => {
    if (d.key === "pwd" || d.key === "senior") {
      // If already confirmed for this type, just toggle off
      if (discountType === d.key) {
        setDiscountType("none");
        setDiscountInfo(null);
      } else {
        setPendingDiscType(d.key);
        setModal("discountInfo");
      }
    } else {
      setDiscountType(d.key);
      setDiscountInfo(null);
      if (d.key !== "custom") setDiscount("");
    }
  };

  const handleDiscountInfoConfirm = (info) => {
    setDiscountType(pendingDiscType);
    setDiscountInfo(info);
    setPendingDiscType(null);
    setModal(null);
  };

  const handleDiscountInfoClose = () => {
    setPendingDiscType(null);
    setModal(null);
  };

  const handlePaid = async (method, ref) => {
    setLoading(true); setError("");
    try {
      const order = {
        id: genId(), type: orderType, table_no: tableNo, delivery_address: deliveryAddr,
        items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
        subtotal, discount: discAmt, total, status: "completed",
        payment_method: method, payment_ref: ref, created_at: ts(),
        discount_type: discountType,
        discount_info: discountInfo ?? null,
      };
      const { error } = await supabase.from("orders").insert(order);
      if (error) throw new Error(error.message);

      // Decrement stock for every item sold. Writing this update to
      // menu_items is what triggers Supabase Realtime — StockView (and any
      // other open screen) picks up the new stock automatically.
      const stockResults = await Promise.all(
        cart
          .filter(c => items.find(i => i.id === c.id)?.stock != null) // only tracked items
          .map(c => {
            const current = Number(items.find(i => i.id === c.id)?.stock ?? 0);
            const newStock = Math.max(0, current - c.qty);
            return supabase.from("menu_items").update({ stock: newStock }).eq("id", c.id);
          })
      );
      const stockErr = stockResults.find(r => r.error);
      if (stockErr) throw new Error(stockErr.error.message);

      // Reflect the new stock locally so POS UI doesn't wait on a refetch
      setItems(prev => prev.map(i => {
        const sold = cart.find(c => c.id === i.id);
        if (!sold || i.stock == null) return i;
        return { ...i, stock: Math.max(0, Number(i.stock) - sold.qty) };
      }));

      setOrders(prev => [order, ...prev]);
      setReceipt(order);
      clearOrder();
      setCartOpen(false);
      setModal("receipt");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const catPillStyle = (active) => ({
    padding: isMobile ? "9px 16px" : "5px 15px",
    borderRadius: 20, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 700, fontFamily: FONT,
    whiteSpace: "nowrap", flexShrink: 0,
    background: active ? DR : SUBTLE, color: active ? "#fff" : MUTED,
  });

  const qtyBtnStyle = {
    width: isMobile ? 36 : 26, height: isMobile ? 36 : 26,
    borderRadius: 6, border: `1px solid ${BORDER}`, background: SUBTLE,
    cursor: "pointer", fontWeight: 900, fontSize: isMobile ? 18 : 15, lineHeight: 1,
    color: TEXT, fontFamily: FONT, flexShrink: 0, touchAction: "manipulation",
  };

  /* ── Cart contents: shared by the desktop column and the mobile sheet ── */
  const cartBody = (
    <>
      {/* Order type */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
    {["pickup", "drop off", "delivery"].map(t => (
      <button key={t} onClick={() => setOrderType(t)}
        style={{
          flex: 1, padding: isMobile ? "11px 0" : "7px 0", borderRadius: 6, border: "none",
          cursor: "pointer", fontFamily: FONT, fontSize: isMobile ? 12 : 11, fontWeight: 700,
          textTransform: "capitalize", touchAction: "manipulation",
          background: orderType === t ? DR : SUBTLE, color: orderType === t ? "#fff" : MUTED,
        }}>
        {t}
      </button>
    ))}
  </div>
  {orderType === "delivery" && (
    <input value={deliveryAddr} onChange={e => setDeliveryAddr(e.target.value)} placeholder="Delivery address"
      style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: noZoomFont(isMobile), padding: isMobile ? "11px 12px" : "7px 10px" }} />
  )}
</div>

      {/* Cart items */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "10px 14px" }}>
        {cart.length === 0 ? (
          <div style={{ textAlign: "center", color: MUTED, paddingTop: 48 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🛒</div>
            <div style={{ fontSize: 14 }}>Cart is empty</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tap any menu item to add</div>
          </div>
        ) : cart.map(c => {
          const liveItem = items.find(i => i.id === c.id); // realtime-updated stock
          const liveStock = liveItem?.stock != null ? Number(liveItem.stock) : null;
          const overStock = liveStock != null && c.qty > liveStock;
          return (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
              {/* Mobile stacks name above the stepper so long names never squeeze the controls */}
              <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? 8 : 0 }}>
                <div style={{ flex: isMobile ? "1 1 100%" : 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: TEXT,
                    whiteSpace: isMobile ? "normal" : "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{fmt(c.price)} each</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: isMobile ? 0 : 8 }}>
                  <button onClick={() => updateQty(c.id, -1)} aria-label={`Remove one ${c.name}`} style={qtyBtnStyle}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 800, minWidth: 20, textAlign: "center" }}>{c.qty}</span>
                  <button onClick={() => updateQty(c.id, 1)} aria-label={`Add one ${c.name}`} style={qtyBtnStyle}>+</button>
                </div>
                <div style={{
                  minWidth: 68, textAlign: "right", fontSize: 13, fontWeight: 800,
                  marginLeft: isMobile ? "auto" : 6, alignSelf: "center",
                }}>{fmt(c.price * c.qty)}</div>
              </div>
              {overStock && (
                <div style={{ fontSize: 11, color: DANGER, fontWeight: 700, marginTop: 4 }}>
                  ⚠ Only {liveStock} in stock — {c.qty - liveStock} over
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals + action */}
      <div style={{
        padding: "12px 14px", borderTop: `1px solid ${BORDER}`, flexShrink: 0,
        paddingBottom: isMobile ? `calc(12px + ${SAFE_BOTTOM})` : 12,
        background: BG,
      }}>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13, color: MUTED }}>
          <span>Subtotal</span>
          <span style={{ color: TEXT, fontWeight: 600 }}>{fmt(subtotal)}</span>
        </div>

        {/* Discount type buttons — 2×2 on phones, 4-up on desktop */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>Discount</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 6 }}>
            {DISCOUNT_TYPES.map(d => (
              <button key={d.key}
                onClick={() => handleDiscountSelect(d)}
                style={{
                  padding: isMobile ? "10px 6px" : "6px 4px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: isMobile ? 12 : 10, fontWeight: 700, textAlign: "center",
                  touchAction: "manipulation", lineHeight: 1.25,
                  background: discountType === d.key ? DR : SUBTLE,
                  color: discountType === d.key ? "#fff" : MUTED,
                }}>
                {d.label}
                {d.rate ? <div style={{ fontSize: 9, marginTop: 1, opacity: 0.85 }}>20% off</div> : null}
              </button>
            ))}
          </div>
        </div>

        {/* PWD / Senior info summary chip */}
        {discountInfo && (discountType === "pwd" || discountType === "senior") && (
          <div style={{
            background: DR_LIGHT, border: `1px solid ${DR}`, borderRadius: 8,
            padding: "8px 10px", marginBottom: 10, fontSize: 11, wordBreak: "break-word",
          }}>
            <div style={{ fontWeight: 800, color: DR, marginBottom: 3 }}>
              🪪 {discountType === "pwd" ? "PWD" : "Senior Citizen"} — Verified
            </div>
            <div style={{ color: TEXT, fontWeight: 600 }}>{discountInfo.name}</div>
            <div style={{ color: MUTED }}>ID: {discountInfo.idNo}</div>
            <div style={{ color: MUTED, marginTop: 1 }}>{discountInfo.address}</div>
            <button
              onClick={() => { setDiscountType("none"); setDiscountInfo(null); }}
              style={{ marginTop: 6, background: "none", border: "none", color: DR, fontSize: 11,
                fontWeight: 700, cursor: "pointer", padding: isMobile ? "6px 0" : 0, fontFamily: FONT }}>
              ✕ Remove discount
            </button>
          </div>
        )}

        {/* Custom discount input */}
        {discountType === "custom" && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <span style={{ fontSize: 12, color: MUTED, flexShrink: 0, fontWeight: 600 }}>Amount ₱</span>
            <input type="number" min="0" inputMode="decimal" value={discount}
              onChange={e => setDiscount(e.target.value)} placeholder="0"
              style={{ ...inputStyle, flex: 1, minWidth: 0, boxSizing: "border-box",
                padding: isMobile ? "10px 12px" : "5px 8px", textAlign: "right", fontSize: noZoomFont(isMobile) }} />
          </div>
        )}

        {/* Discount line */}
        {discAmt > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: DR, fontWeight: 600 }}>
              {discountType === "pwd" ? "PWD (20%)" : discountType === "senior" ? "Senior Citizen (20%)" : "Discount"}
            </span>
            <span style={{ color: DR, fontWeight: 700 }}>− {fmt(discAmt)}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 14, borderTop: `2px solid ${TEXT}`, paddingTop: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>TOTAL</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: DR }}>{fmt(total)}</span>
        </div>

        {hasOverstockedItem && (
          <div style={{
            background: DANGER_BG, border: `1px solid ${DANGER}`, borderRadius: 8,
            padding: "8px 10px", marginBottom: 10, fontSize: 12, color: DANGER, fontWeight: 700,
          }}>
            ⚠ One or more items exceed available stock. Adjust quantity before charging.
          </div>
        )}

        <ErrBox msg={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={clearOrder}
            style={{ flexShrink: 0, padding: isMobile ? "12px 18px" : "9px 14px" }}
            disabled={cart.length === 0}>Clear</Btn>
          <Btn onClick={() => { setError(""); setModal("payment"); }}
            style={{ flex: 1, padding: isMobile ? "12px 16px" : undefined }}
            disabled={cart.length === 0 || loading || hasOverstockedItem}>
            {loading ? "Saving…" : `Pay ${fmt(total)}`}
          </Btn>
        </div>
      </div>
    </>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      height: "100%", minHeight: 0, overflow: "hidden",
      position: "relative",
    }}>

      {/* ── Menu ── */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        borderRight: isMobile ? "none" : `1px solid ${BORDER}`,
        overflow: "hidden", width: "100%",
      }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 8, flexShrink: 0 }}>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search menu items…"
            type="search" autoCorrect="off"
            style={{ ...inputStyle, flex: 1, minWidth: 0, boxSizing: "border-box",
              fontSize: noZoomFont(isMobile), padding: isMobile ? "11px 12px" : undefined }} />
        </div>

        {/* Category pills: scroll sideways on phones instead of wrapping into a tall block */}
        <div style={{
          padding: isMobile ? "10px 14px" : "10px 14px",
          borderBottom: `1px solid ${BORDER}`,
          display: "flex", gap: 6, flexShrink: 0,
          flexWrap: isMobile ? "nowrap" : "wrap",
          overflowX: isMobile ? "auto" : "visible",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}>
          <button style={catPillStyle(activeCat === "all")} onClick={() => setActiveCat("all")}>All</button>
          {categories.map(c => (
            <button key={c.id} style={catPillStyle(activeCat === c.id)} onClick={() => setActiveCat(c.id)}>{c.name}</button>
          ))}
        </div>

        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: 12,
          // leave room for the fixed cart bar on mobile
          paddingBottom: isMobile ? `calc(96px + ${SAFE_BOTTOM})` : 12,
          display: "grid",
          gridTemplateColumns: isMobile
            ? "repeat(auto-fill, minmax(132px, 1fr))"
            : "repeat(auto-fill, minmax(148px, 1fr))",
          gap: 10, alignContent: "start",
        }}>
          {filtered.map(item => {
            const status = getStockStatus(item);
            const isOut = status === "out";
            return (
              <button key={item.id} onClick={() => addToCart(item)}
                disabled={isOut}
                style={{
                  background: isOut ? SUBTLE : BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8, padding: isMobile ? "12px 10px" : "14px 12px", textAlign: "left",
                  cursor: isOut ? "not-allowed" : "pointer", fontFamily: FONT,
                  opacity: isOut ? 0.6 : 1,
                  minHeight: isMobile ? 96 : undefined,
                  touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                }}
                onMouseEnter={e => { if (!isOut && !isMobile) { e.currentTarget.style.borderColor = DR; e.currentTarget.style.background = DR_LIGHT; } }}
                onMouseLeave={e => { if (!isOut && !isMobile) { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = BG; } }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, lineHeight: 1.3, color: TEXT, wordBreak: "break-word" }}>{item.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: DR }}>{fmt(item.price)}</div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 5 }}>{categories.find(c => c.id === item.category_id)?.name}</div>
                {status === "low" && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: WARNING, background: WARNING_BG, borderRadius: 4, padding: "2px 6px", marginTop: 6, display: "inline-block" }}>
                    ⚠ {Number(item.stock)} left
                  </div>
                )}
                {status === "out" && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: DANGER, background: DANGER_BG, borderRadius: 4, padding: "2px 6px", marginTop: 6, display: "inline-block" }}>
                    Out of stock
                  </div>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", color: MUTED, padding: 48, fontSize: 14 }}>No items found</div>
          )}
        </div>
      </div>

      {/* ── Cart: fixed column on desktop ── */}
      {!isMobile && (
        <div style={{ width: 336, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {cartBody}
        </div>
      )}

      {/* ── Cart: bottom bar + sheet on mobile ── */}
      {isMobile && (
        <>
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 120,
            background: BG, borderTop: `1px solid ${BORDER}`,
            padding: `10px 14px calc(10px + ${SAFE_BOTTOM})`,
            display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>
                {cartCount === 0 ? "No items yet" : `${cartCount} item${cartCount > 1 ? "s" : ""}`}
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: DR, lineHeight: 1.2 }}>{fmt(total)}</div>
            </div>
            <Btn onClick={() => setCartOpen(true)} disabled={cart.length === 0}
              style={{ padding: "12px 20px", flexShrink: 0 }}>
              View cart
            </Btn>
          </div>

          {cartOpen && (
            <div
              onClick={() => setCartOpen(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 200,
                background: "rgba(0,0,0,0.45)",
                display: "flex", alignItems: "flex-end",
                fontFamily: FONT, overscrollBehavior: "contain",
              }}>
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: BG, width: "100%", height: "92vh", maxHeight: "92vh",
                  borderRadius: "16px 16px 0 0", display: "flex", flexDirection: "column",
                  overflow: "hidden", boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
                }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px 10px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>
                    Current order {cartCount > 0 && <span style={{ color: MUTED, fontWeight: 700 }}>· {cartCount}</span>}
                  </div>
                  <button onClick={() => setCartOpen(false)} aria-label="Close cart"
                    style={{
                      width: 36, height: 36, borderRadius: 8, border: `1px solid ${BORDER}`,
                      background: SUBTLE, color: TEXT, fontSize: 16, fontWeight: 800,
                      cursor: "pointer", fontFamily: FONT, lineHeight: 1,
                    }}>✕</button>
                </div>
                {cartBody}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {modal === "discountInfo" && pendingDiscType && (
        <DiscountInfoModal
          type={pendingDiscType}
          isMobile={isMobile}
          onConfirm={handleDiscountInfoConfirm}
          onClose={handleDiscountInfoClose}
        />
      )}
      {modal === "payment" && (
        <PaymentModal total={total} config={config} demoMode={demoMode} isMobile={isMobile}
          onClose={() => setModal(null)} onPaid={handlePaid} />
      )}
      {modal === "receipt" && receipt && (
        <ReceiptModal order={receipt} isMobile={isMobile} onClose={() => setModal(null)} />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", zIndex: 300,
          bottom: isMobile ? `calc(104px + ${SAFE_BOTTOM})` : 24,
          right: isMobile ? 14 : 24,
          left: isMobile ? 14 : "auto",
          textAlign: isMobile ? "center" : "left",
          background: toast.type === "err" ? DANGER_BG : WARNING_BG,
          color:      toast.type === "err" ? DANGER    : WARNING,
          border: `1px solid ${toast.type === "err" ? DANGER : WARNING}`,
          borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, fontFamily: FONT,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
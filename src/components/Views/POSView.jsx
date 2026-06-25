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
   Discount Info Modal (PWD / Senior Citizen)
───────────────────────────────────────────── */
function DiscountInfoModal({ type, onConfirm, onClose }) {
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
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999, fontFamily: FONT,
  };

  const box = {
    background: BG, borderRadius: 12, padding: 28, width: 380,
    boxShadow: "0 8px 40px rgba(0,0,0,0.18)", border: `1px solid ${BORDER}`,
  };

  const badge = {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: DR, color: "#fff", fontSize: 12, fontWeight: 800,
    padding: "4px 12px", borderRadius: 20, marginBottom: 16, letterSpacing: 0.4,
  };

  const field = { marginBottom: 14 };
  const lbl   = { fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase",
                  letterSpacing: 0.5, marginBottom: 5, display: "block" };
  const inp   = { ...inputStyle, fontSize: 13, padding: "8px 10px", width: "100%", boxSizing: "border-box" };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>

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
            autoFocus
          />
        </div>

        <div style={field}>
          <label style={lbl}>Full Name</label>
          <input
            style={inp}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="As shown on ID"
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
          <Btn variant="ghost" onClick={onClose} style={{ flexShrink: 0, padding: "9px 16px" }}>
            Cancel
          </Btn>
          <Btn onClick={handleConfirm} style={{ flex: 1 }}>
            Apply Discount →
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
  const [activeCat, setActiveCat] = useState("all");

  // Restore persisted cart state on mount (lazy initializers run once, before first paint)
  const [cart, setCart]                 = useState(() => loadCartState()?.cart ?? []);
  const [orderType, setOrderType]       = useState(() => loadCartState()?.orderType ?? "dine-in");
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

  // Persist cart-related state on every change
  useEffect(() => {
    saveCartState({ cart, orderType, tableNo, deliveryAddr, discount, discountType, discountInfo });
  }, [cart, orderType, tableNo, deliveryAddr, discount, discountType, discountInfo]);

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
    setCart([]); setOrderType("dine-in"); setTableNo("");
    setDeliveryAddr(""); setDiscount(""); setDiscountType("none");
    setDiscountInfo(null); setError("");
    saveCartState(null); // wipe persisted snapshot too
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
      setModal("receipt");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const catPillStyle = (active) => ({
    padding: "5px 15px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT,
    background: active ? DR : SUBTLE, color: active ? "#fff" : MUTED,
  });

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── LEFT: Menu ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${BORDER}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 8, flexShrink: 0 }}>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search menu items…"
            style={{ ...inputStyle, flex: 1, fontSize: 13 }} />
        </div>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
          <button style={catPillStyle(activeCat === "all")} onClick={() => setActiveCat("all")}>All</button>
          {categories.map(c => (
            <button key={c.id} style={catPillStyle(activeCat === c.id)} onClick={() => setActiveCat(c.id)}>{c.name}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 10, alignContent: "start" }}>
          {filtered.map(item => {
            const status = getStockStatus(item);
            const isOut = status === "out";
            return (
              <button key={item.id} onClick={() => addToCart(item)}
                disabled={isOut}
                style={{
                  background: isOut ? SUBTLE : BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8, padding: "14px 12px", textAlign: "left",
                  cursor: isOut ? "not-allowed" : "pointer", fontFamily: FONT,
                  opacity: isOut ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!isOut) { e.currentTarget.style.borderColor = DR; e.currentTarget.style.background = DR_LIGHT; } }}
                onMouseLeave={e => { if (!isOut) { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = BG; } }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, lineHeight: 1.3, color: TEXT }}>{item.name}</div>
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

      {/* ── RIGHT: Cart ── */}
      <div style={{ width: 336, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Order type */}
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {["dine-in", "takeout", "delivery"].map(t => (
              <button key={t} onClick={() => setOrderType(t)}
                style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                  background: orderType === t ? DR : SUBTLE, color: orderType === t ? "#fff" : MUTED }}>
                {t}
              </button>
            ))}
          </div>
          {orderType === "dine-in" && (
            <input value={tableNo} onChange={e => setTableNo(e.target.value)} placeholder="Table number (optional)"
              style={{ ...inputStyle, fontSize: 13, padding: "7px 10px" }} />
          )}
          {orderType === "delivery" && (
            <input value={deliveryAddr} onChange={e => setDeliveryAddr(e.target.value)} placeholder="Delivery address"
              style={{ ...inputStyle, fontSize: 13, padding: "7px 10px" }} />
          )}
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
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
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{fmt(c.price)} each</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                    <button onClick={() => updateQty(c.id, -1)} style={{ width: 26, height: 26, borderRadius: 4, border: `1px solid ${BORDER}`, background: SUBTLE, cursor: "pointer", fontWeight: 900, fontSize: 15, lineHeight: 1 }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 800, minWidth: 18, textAlign: "center" }}>{c.qty}</span>
                    <button onClick={() => updateQty(c.id, 1)} style={{ width: 26, height: 26, borderRadius: 4, border: `1px solid ${BORDER}`, background: SUBTLE, cursor: "pointer", fontWeight: 900, fontSize: 15, lineHeight: 1 }}>+</button>
                  </div>
                  <div style={{ minWidth: 68, textAlign: "right", fontSize: 13, fontWeight: 800, marginLeft: 6 }}>{fmt(c.price * c.qty)}</div>
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
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13, color: MUTED }}>
            <span>Subtotal</span>
            <span style={{ color: TEXT, fontWeight: 600 }}>{fmt(subtotal)}</span>
          </div>

          {/* Discount type buttons */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Discount</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
              {DISCOUNT_TYPES.map(d => (
                <button key={d.key}
                  onClick={() => handleDiscountSelect(d)}
                  style={{
                    padding: "6px 4px", borderRadius: 6, border: "none", cursor: "pointer",
                    fontFamily: FONT, fontSize: 10, fontWeight: 700, textAlign: "center",
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
              padding: "8px 10px", marginBottom: 10, fontSize: 11,
            }}>
              <div style={{ fontWeight: 800, color: DR, marginBottom: 3 }}>
                🪪 {discountType === "pwd" ? "PWD" : "Senior Citizen"} — Verified
              </div>
              <div style={{ color: TEXT, fontWeight: 600 }}>{discountInfo.name}</div>
              <div style={{ color: MUTED }}>ID: {discountInfo.idNo}</div>
              <div style={{ color: MUTED, marginTop: 1 }}>{discountInfo.address}</div>
              <button
                onClick={() => { setDiscountType("none"); setDiscountInfo(null); }}
                style={{ marginTop: 6, background: "none", border: "none", color: DR, fontSize: 10,
                  fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: FONT }}>
                ✕ Remove discount
              </button>
            </div>
          )}

          {/* Custom discount input */}
          {discountType === "custom" && (
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
              <span style={{ fontSize: 12, color: MUTED, flexShrink: 0, fontWeight: 600 }}>Amount ₱</span>
              <input type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0"
                style={{ ...inputStyle, padding: "5px 8px", textAlign: "right", fontSize: 13 }} />
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

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, borderTop: `2px solid ${TEXT}`, paddingTop: 10 }}>
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
            <Btn variant="ghost" onClick={clearOrder} style={{ flexShrink: 0, padding: "9px 14px" }} disabled={cart.length === 0}>Clear</Btn>
            <Btn onClick={() => { setError(""); setModal("payment"); }} style={{ flex: 1 }} disabled={cart.length === 0 || loading || hasOverstockedItem}>
              {loading ? "Saving…" : "Pay Now →"}
            </Btn>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === "discountInfo" && pendingDiscType && (
        <DiscountInfoModal
          type={pendingDiscType}
          onConfirm={handleDiscountInfoConfirm}
          onClose={handleDiscountInfoClose}
        />
      )}
      {modal === "payment" && (
        <PaymentModal total={total} config={config} demoMode={demoMode}
          onClose={() => setModal(null)} onPaid={handlePaid} />
      )}
      {modal === "receipt" && receipt && (
        <ReceiptModal order={receipt} onClose={() => setModal(null)} />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 300,
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
import { useState, useEffect, useRef } from "react";

const DR = "#8B0000";
const DR_LIGHT = "#FFF0F0";
const BG = "#FFFFFF";
const TEXT = "#111111";
const MUTED = "#666666";
const BORDER = "#E2E2E2";
const SUBTLE = "#F7F7F7";
const SUCCESS = "#1A5C32";
const SUCCESS_BG = "#ECFDF5";
const FONT = '"Segoe UI Historic","Segoe UI",Helvetica,Arial,sans-serif';

const fmt = (n) =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const genId = () => "ORD-" + Math.random().toString(36).substr(2, 6).toUpperCase();
const ts = () => new Date().toISOString();

// ═══════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════

async function sbReq(cfg, method, table, body = null, qs = "") {
  const url = `${cfg.supabaseUrl}/rest/v1/${table}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${table}: ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

async function pmReq(cfg, endpoint, body) {
  const res = await fetch(`https://api.paymongo.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(cfg.paymongoKey + ":")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PayMongo ${endpoint}: ${await res.text()}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// DEMO DATA
// ═══════════════════════════════════════════════════════════════

const INIT_CATS = [
  { id: "c1", name: "Beverages" },
  { id: "c2", name: "Main Course" },
  { id: "c3", name: "Sides & Salads" },
  { id: "c4", name: "Desserts" },
];

const INIT_ITEMS = [
  { id: "i1",  name: "Iced Coffee",       category_id: "c1", price: 120, available: true },
  { id: "i2",  name: "Lemonade Soda",     category_id: "c1", price: 95,  available: true },
  { id: "i3",  name: "Mango Shake",       category_id: "c1", price: 110, available: true },
  { id: "i4",  name: "Mineral Water",     category_id: "c1", price: 45,  available: true },
  { id: "i5",  name: "Grilled Chicken",   category_id: "c2", price: 320, available: true },
  { id: "i6",  name: "Beef Burger",       category_id: "c2", price: 280, available: true },
  { id: "i7",  name: "Pasta Carbonara",   category_id: "c2", price: 260, available: true },
  { id: "i8",  name: "Pork Sisig",        category_id: "c2", price: 250, available: true },
  { id: "i9",  name: "Sinigang na Baboy", category_id: "c2", price: 295, available: false },
  { id: "i10", name: "Caesar Salad",      category_id: "c3", price: 180, available: true },
  { id: "i11", name: "French Fries",      category_id: "c3", price: 120, available: true },
  { id: "i12", name: "Garlic Rice",       category_id: "c3", price: 65,  available: true },
  { id: "i13", name: "Chocolate Lava",    category_id: "c4", price: 200, available: true },
  { id: "i14", name: "NY Cheesecake",     category_id: "c4", price: 185, available: true },
];

const INIT_ORDERS = [
  {
    id: "ORD-A1B2C3", type: "dine-in", table_no: "5", delivery_address: "",
    items: [{ id: "i5", name: "Grilled Chicken", price: 320, qty: 2 }, { id: "i1", name: "Iced Coffee", price: 120, qty: 2 }],
    subtotal: 880, discount: 0, total: 880, status: "completed",
    payment_method: "cash", payment_ref: "", created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "ORD-D4E5F6", type: "takeout", table_no: "", delivery_address: "",
    items: [{ id: "i6", name: "Beef Burger", price: 280, qty: 1 }, { id: "i11", name: "French Fries", price: 120, qty: 1 }],
    subtotal: 400, discount: 0, total: 400, status: "voided",
    payment_method: "gcash", payment_ref: "REF20241234", created_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "ORD-G7H8I9", type: "delivery", table_no: "", delivery_address: "123 Rizal St, Quezon City",
    items: [{ id: "i7", name: "Pasta Carbonara", price: 260, qty: 2 }, { id: "i14", name: "NY Cheesecake", price: 185, qty: 2 }],
    subtotal: 890, discount: 0, total: 890, status: "completed",
    payment_method: "card", payment_ref: "APPR-CC4567", created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

// ═══════════════════════════════════════════════════════════════
// SHARED UI ATOMS
// ═══════════════════════════════════════════════════════════════

function Badge({ status }) {
  const map = {
    completed: { bg: SUCCESS_BG,   color: SUCCESS,    label: "Completed" },
    voided:    { bg: DR_LIGHT,     color: DR,         label: "Voided"    },
    refunded:  { bg: "#FFF7ED",    color: "#92400E",  label: "Refunded"  },
    pending:   { bg: "#EFF6FF",    color: "#1E40AF",  label: "Pending"   },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function Btn({ variant = "primary", children, style: sx, ...props }) {
  const base = { padding: "9px 18px", borderRadius: 6, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2, transition: "opacity 0.15s" };
  const variants = {
    primary: { background: DR,          color: "#fff",  border: "none"              },
    outline:  { background: "transparent", color: DR,   border: `1.5px solid ${DR}` },
    ghost:    { background: "transparent", color: TEXT,  border: `1px solid ${BORDER}` },
  };
  return <button {...props} style={{ ...base, ...variants[variant], ...(props.disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}), ...sx }}>{children}</button>;
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</label>}
      {children}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 6, fontFamily: FONT, fontSize: 14, boxSizing: "border-box", outline: "none", color: TEXT };

function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.48)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: BG, width, maxWidth: "100%", maxHeight: "92vh", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 20px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: MUTED, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return <div style={{ color: DR, fontSize: 13, padding: "8px 12px", background: DR_LIGHT, borderRadius: 6, marginBottom: 12 }}>{msg}</div>;
}

function OkBox({ msg }) {
  if (!msg) return null;
  return <div style={{ color: SUCCESS, fontSize: 13, padding: "8px 12px", background: SUCCESS_BG, borderRadius: 6, marginBottom: 12 }}>{msg}</div>;
}

// ═══════════════════════════════════════════════════════════════
// RECEIPT MODAL
// ═══════════════════════════════════════════════════════════════

function ReceiptModal({ order, onClose }) {
  const handlePrint = () => window.print();
  return (
    <Modal title="Receipt" onClose={onClose} width={380}>
      <div style={{ padding: 24, fontFamily: '"Courier New", monospace', fontSize: 13, lineHeight: 1.6 }}>
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
      <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Close</Btn>
        <Btn onClick={handlePrint} style={{ flex: 1 }}>🖨 Print Receipt</Btn>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT MODAL
// ═══════════════════════════════════════════════════════════════

function PaymentModal({ total, config, demoMode, onClose, onPaid }) {
  const [method, setMethod] = useState("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cash = parseFloat(cashGiven) || 0;
  const change = method === "cash" ? Math.max(0, cash - total) : 0;

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
    { key: "cash",  emoji: "💵", label: "Cash"  },
    { key: "gcash", emoji: "📱", label: "GCash" },
    { key: "card",  emoji: "💳", label: "Card"  },
  ];

  return (
    <Modal title="Process Payment" onClose={onClose} width={420}>
      <div style={{ padding: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 22 }}>
          {methods.map(m => (
            <button key={m.key} onClick={() => { setMethod(m.key); setRef(""); setError(""); }}
              style={{ padding: "14px 8px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 14, textAlign: "center",
                border: method === m.key ? `2px solid ${DR}` : `1.5px solid ${BORDER}`,
                background: method === m.key ? DR_LIGHT : BG,
                color: method === m.key ? DR : TEXT }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{m.emoji}</div>
              {m.label}
            </button>
          ))}
        </div>

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

        {method === "gcash" && (
          <Field label="GCash Reference No.">
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. REF123456789" style={{ ...inputStyle }} autoFocus />
          </Field>
        )}
        {method === "card" && (
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

// ═══════════════════════════════════════════════════════════════
// POS / SALES VIEW
// ═══════════════════════════════════════════════════════════════

function POSView({ categories, items, orders, setOrders, config, demoMode }) {
  const [activeCat, setActiveCat] = useState("all");
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("dine-in");
  const [tableNo, setTableNo] = useState("");
  const [deliveryAddr, setDeliveryAddr] = useState("");
  const [discount, setDiscount] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [modal, setModal] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filtered = items.filter(i => {
    const matchCat = activeCat === "all" || i.category_id === activeCat;
    const matchSearch = !searchQ || i.name.toLowerCase().includes(searchQ.toLowerCase());
    return matchCat && matchSearch && i.available;
  });

  const addToCart = (item) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.id === item.id);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const discAmt = Math.min(parseFloat(discount) || 0, subtotal);
  const total = subtotal - discAmt;

  const clearOrder = () => { setCart([]); setOrderType("dine-in"); setTableNo(""); setDeliveryAddr(""); setDiscount(""); setError(""); };

  const handlePaid = async (method, ref) => {
    setLoading(true); setError("");
    try {
      const order = {
        id: genId(), type: orderType, table_no: tableNo, delivery_address: deliveryAddr,
        items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
        subtotal, discount: discAmt, total, status: "completed",
        payment_method: method, payment_ref: ref, created_at: ts(),
      };
      if (!demoMode && config.supabaseUrl) await sbReq(config, "POST", "orders", order);
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
          {categories.map(c => <button key={c.id} style={catPillStyle(activeCat === c.id)} onClick={() => setActiveCat(c.id)}>{c.name}</button>)}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 10, alignContent: "start" }}>
          {filtered.map(item => (
            <button key={item.id} onClick={() => addToCart(item)}
              style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 12px", textAlign: "left", cursor: "pointer", fontFamily: FONT }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = DR; e.currentTarget.style.background = DR_LIGHT; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = BG; }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, lineHeight: 1.3, color: TEXT }}>{item.name}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: DR }}>{fmt(item.price)}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 5 }}>{categories.find(c => c.id === item.category_id)?.name}</div>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", color: MUTED, padding: 48, fontSize: 14 }}>No items found</div>}
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
          ) : cart.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
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
          ))}
        </div>

        {/* Totals + action */}
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, color: MUTED }}>
            <span>Subtotal</span><span style={{ color: TEXT, fontWeight: 600 }}>{fmt(subtotal)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 8 }}>
            <span style={{ fontSize: 12, color: MUTED, flexShrink: 0, fontWeight: 600 }}>Discount ₱</span>
            <input type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0"
              style={{ ...inputStyle, padding: "5px 8px", textAlign: "right", fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, borderTop: `2px solid ${TEXT}`, paddingTop: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>TOTAL</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: DR }}>{fmt(total)}</span>
          </div>
          <ErrBox msg={error} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={clearOrder} style={{ flexShrink: 0, padding: "9px 14px" }} disabled={cart.length === 0}>Clear</Btn>
            <Btn onClick={() => { setError(""); setModal("payment"); }} style={{ flex: 1 }} disabled={cart.length === 0 || loading}>
              {loading ? "Saving…" : "Pay Now →"}
            </Btn>
          </div>
        </div>
      </div>

      {modal === "payment" && (
        <PaymentModal total={total} config={config} demoMode={demoMode}
          onClose={() => setModal(null)} onPaid={handlePaid} />
      )}
      {modal === "receipt" && receipt && (
        <ReceiptModal order={receipt} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MENU SETUP VIEW
// ═══════════════════════════════════════════════════════════════

function MenuView({ categories, setCategories, items, setItems, config, demoMode }) {
  const [filterCat, setFilterCat] = useState("all");
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", category_id: "", price: "", available: true });
  const [catName, setCatName] = useState("");
  const [error, setError] = useState("");

  const openItem = (item = null) => {
    setEditing(item);
    setForm(item ? { ...item } : { name: "", category_id: categories[0]?.id || "", price: "", available: true });
    setError(""); setModal("item");
  };

  const saveItem = async () => {
    if (!form.name.trim() || !form.price) { setError("Name and price are required."); return; }
    const data = { ...form, price: parseFloat(form.price) };
    try {
      if (editing) {
        if (!demoMode && config.supabaseUrl) await sbReq(config, "PATCH", "menu_items", data, `id=eq.${editing.id}`);
        setItems(prev => prev.map(i => i.id === editing.id ? { ...i, ...data } : i));
      } else {
        const newItem = { ...data, id: "i" + Date.now() };
        if (!demoMode && config.supabaseUrl) await sbReq(config, "POST", "menu_items", newItem);
        setItems(prev => [...prev, newItem]);
      }
      setModal(null);
    } catch (e) { setError(e.message); }
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      if (!demoMode && config.supabaseUrl) await sbReq(config, "DELETE", "menu_items", null, `id=eq.${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) { alert(e.message); }
  };

  const toggleAvail = async (item) => {
    const next = !item.available;
    try {
      if (!demoMode && config.supabaseUrl) await sbReq(config, "PATCH", "menu_items", { available: next }, `id=eq.${item.id}`);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, available: next } : i));
    } catch (e) { alert(e.message); }
  };

  const saveCategory = async () => {
    if (!catName.trim()) return;
    const newCat = { id: "c" + Date.now(), name: catName.trim() };
    try {
      if (!demoMode && config.supabaseUrl) await sbReq(config, "POST", "categories", newCat);
      setCategories(prev => [...prev, newCat]);
      setCatName(""); setModal(null);
    } catch (e) { alert(e.message); }
  };

  const deleteCategory = async (id) => {
    if (items.some(i => i.category_id === id)) { alert("Remove all items in this category first."); return; }
    if (!window.confirm("Delete this category?")) return;
    try {
      if (!demoMode && config.supabaseUrl) await sbReq(config, "DELETE", "categories", null, `id=eq.${id}`);
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch (e) { alert(e.message); }
  };

  const visibleItems = filterCat === "all" ? items : items.filter(i => i.category_id === filterCat);
  const catPill = (id, label) => ({
    padding: "5px 15px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT,
    background: filterCat === id ? DR : SUBTLE, color: filterCat === id ? "#fff" : MUTED,
  });

  return (
    <div style={{ padding: 22, height: "100%", overflowY: "auto", fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Menu Setup</h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>{items.length} items · {categories.length} categories</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="outline" onClick={() => { setCatName(""); setModal("category"); }}>+ Category</Btn>
          <Btn onClick={() => openItem()}>+ Add Item</Btn>
        </div>
      </div>

      {/* Categories summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 22 }}>
        {categories.map(cat => {
          const count = items.filter(i => i.category_id === cat.id).length;
          return (
            <div key={cat.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{cat.name}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{count} item{count !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => deleteCategory(cat.id)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          );
        })}
      </div>

      {/* Filter + Items table */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button style={catPill("all", "All")} onClick={() => setFilterCat("all")}>All Items</button>
        {categories.map(c => <button key={c.id} style={catPill(c.id, c.name)} onClick={() => setFilterCat(c.id)}>{c.name}</button>)}
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: SUBTLE }}>
              {["Item Name", "Category", "Price", "Available", ""].map((h, i) => (
                <th key={i} style={{ padding: "10px 14px", textAlign: i >= 2 ? "center" : "left", fontWeight: 700, color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, idx) => (
              <tr key={item.id} style={{ borderTop: `1px solid ${BORDER}`, background: idx % 2 === 0 ? BG : "#FAFAFA" }}>
                <td style={{ padding: "10px 14px", fontWeight: 700 }}>{item.name}</td>
                <td style={{ padding: "10px 14px", color: MUTED }}>{categories.find(c => c.id === item.category_id)?.name || "—"}</td>
                <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800, color: DR }}>{fmt(item.price)}</td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <button onClick={() => toggleAvail(item)} style={{ padding: "3px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700,
                    background: item.available ? SUCCESS_BG : DR_LIGHT, color: item.available ? SUCCESS : DR }}>
                    {item.available ? "Yes" : "No"}
                  </button>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <Btn variant="ghost" onClick={() => openItem(item)} style={{ padding: "4px 12px", fontSize: 12 }}>Edit</Btn>
                    <Btn variant="ghost" onClick={() => deleteItem(item.id)} style={{ padding: "4px 12px", fontSize: 12, color: DR, borderColor: DR }}>Delete</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleItems.length === 0 && <div style={{ textAlign: "center", padding: 40, color: MUTED, fontSize: 13 }}>No items in this category</div>}
      </div>

      {/* Add / Edit Item Modal */}
      {modal === "item" && (
        <Modal title={editing ? "Edit Item" : "Add Menu Item"} onClose={() => setModal(null)}>
          <div style={{ padding: 22 }}>
            <Field label="Item Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Grilled Chicken" style={{ ...inputStyle }} autoFocus />
            </Field>
            <Field label="Category">
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...inputStyle }}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Price (₱)">
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" style={{ ...inputStyle }} />
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <input type="checkbox" id="avail" checked={form.available} onChange={e => setForm(f => ({ ...f, available: e.target.checked }))} style={{ width: 16, height: 16 }} />
              <label htmlFor="avail" style={{ fontSize: 14, cursor: "pointer" }}>Available for ordering</label>
            </div>
            <ErrBox msg={error} />
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn onClick={saveItem} style={{ flex: 2 }}>{editing ? "Save Changes" : "Add to Menu"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Category Modal */}
      {modal === "category" && (
        <Modal title="Add Category" onClose={() => setModal(null)} width={360}>
          <div style={{ padding: 22 }}>
            <Field label="Category Name">
              <input value={catName} onChange={e => setCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveCategory()} placeholder="e.g. Beverages" style={{ ...inputStyle }} autoFocus />
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn onClick={saveCategory} style={{ flex: 2 }}>Add Category</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ORDERS VIEW
// ═══════════════════════════════════════════════════════════════

function OrdersView({ orders }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString());
  const todaySales = todayOrders.filter(o => o.status === "completed").reduce((s, o) => s + o.total, 0);

  const visible = orders.filter(o => {
    const matchStatus = filter === "all" || o.status === filter;
    const matchSearch = !search || o.id.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const summaries = [
    { label: "All Orders",  value: orders.length,                                          color: TEXT    },
    { label: "Completed",   value: orders.filter(o => o.status === "completed").length,    color: SUCCESS },
    { label: "Voided",      value: orders.filter(o => o.status === "voided").length,       color: DR      },
    { label: "Refunded",    value: orders.filter(o => o.status === "refunded").length,     color: "#92400E" },
  ];

  return (
    <div style={{ padding: 22, height: "100%", overflowY: "auto", fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Orders</h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>
            Today's sales: <strong style={{ color: DR }}>{fmt(todaySales)}</strong> from {todayOrders.filter(o => o.status === "completed").length} orders
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
        {summaries.map(s => (
          <div key={s.label} style={{ background: SUBTLE, borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order ID…"
          style={{ ...inputStyle, width: 200, fontSize: 13, padding: "7px 12px" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", "completed", "voided", "refunded"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                background: filter === s ? DR : SUBTLE, color: filter === s ? "#fff" : MUTED }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: SUBTLE }}>
              {["Order ID", "Time", "Type", "Items", "Total", "Payment", "Status"].map((h, i) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: i >= 3 ? "center" : "left", fontWeight: 700, color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((order, idx) => (
              <tr key={order.id} onClick={() => setSelectedOrder(order)}
                style={{ borderTop: `1px solid ${BORDER}`, cursor: "pointer", background: idx % 2 === 0 ? BG : "#FAFAFA" }}
                onMouseEnter={e => e.currentTarget.style.background = DR_LIGHT}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? BG : "#FAFAFA"}>
                <td style={{ padding: "10px 14px", fontWeight: 800, fontFamily: "monospace", fontSize: 12, color: DR }}>{order.id}</td>
                <td style={{ padding: "10px 14px", color: MUTED, whiteSpace: "nowrap" }}>{new Date(order.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</td>
                <td style={{ padding: "10px 14px", textTransform: "capitalize" }}>{order.type}</td>
                <td style={{ padding: "10px 14px", textAlign: "center", color: MUTED }}>{order.items.length}</td>
                <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800 }}>{fmt(order.total)}</td>
                <td style={{ padding: "10px 14px", textAlign: "center", textTransform: "uppercase", fontSize: 11, fontWeight: 700 }}>{order.payment_method}</td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}><Badge status={order.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 14 }}>No orders found</div>}
      </div>
      {selectedOrder && <ReceiptModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VOID / REFUND VIEW
// ═══════════════════════════════════════════════════════════════

function VoidRefundView({ orders, setOrders, config, demoMode }) {
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

// ═══════════════════════════════════════════════════════════════
// CONFIG PANEL
// ═══════════════════════════════════════════════════════════════

function ConfigPanel({ config, setConfig, demoMode, setDemoMode, onClose }) {
  const [form, setForm] = useState({ supabaseUrl: "", supabaseKey: "", paymongoKey: "", ...config });

  const save = () => {
    const saved = { ...form };
    try { localStorage.setItem("pos_config", JSON.stringify(saved)); } catch {}
    setConfig(saved);
    setDemoMode(!saved.supabaseUrl || !saved.supabaseKey);
    onClose();
  };

  const schemaSQL = `-- Run this in your Supabase SQL editor:
CREATE TABLE categories (
  id text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE menu_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  category_id text REFERENCES categories(id),
  price numeric NOT NULL,
  available boolean DEFAULT true
);
CREATE TABLE orders (
  id text PRIMARY KEY,
  type text,
  table_no text,
  delivery_address text,
  items jsonb,
  subtotal numeric,
  discount numeric DEFAULT 0,
  total numeric,
  status text DEFAULT 'completed',
  payment_method text,
  payment_ref text,
  void_reason text,
  created_at timestamptz DEFAULT now()
);`;

  return (
    <Modal title="API Configuration" onClose={onClose} width={540}>
      <div style={{ padding: 22 }}>
        <div style={{ padding: "12px 14px", background: demoMode ? "#FFF7ED" : SUCCESS_BG, borderRadius: 8, marginBottom: 20, fontSize: 13, borderLeft: `3px solid ${demoMode ? "#F59E0B" : SUCCESS}` }}>
          {demoMode
            ? "⚠ Demo mode is active. Data lives in memory only. Add credentials below to enable live persistence and payments."
            : "✓ Connected — orders will be saved to Supabase and payments routed through PayMongo."}
        </div>

        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: DR, marginBottom: 14 }}>Supabase</div>
          <Field label="Project URL">
            <input value={form.supabaseUrl} onChange={e => setForm(f => ({ ...f, supabaseUrl: e.target.value }))} placeholder="https://xxxx.supabase.co" style={{ ...inputStyle }} />
          </Field>
          <Field label="Anon / Service Key">
            <input type="password" value={form.supabaseKey} onChange={e => setForm(f => ({ ...f, supabaseKey: e.target.value }))} placeholder="eyJhbGci…" style={{ ...inputStyle }} />
          </Field>
        </div>

        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: DR, marginBottom: 14 }}>PayMongo</div>
          <Field label="Secret Key">
            <input type="password" value={form.paymongoKey} onChange={e => setForm(f => ({ ...f, paymongoKey: e.target.value }))} placeholder="sk_test_…" style={{ ...inputStyle }} />
          </Field>
          <p style={{ margin: 0, fontSize: 11, color: MUTED }}>Get your key at <strong>dashboard.paymongo.com</strong> → Developers → API Keys</p>
        </div>

        <details style={{ marginBottom: 20 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, userSelect: "none" }}>Supabase Schema SQL ↓</summary>
          <pre style={{ margin: "10px 0 0", padding: 12, background: SUBTLE, borderRadius: 6, fontSize: 11, overflowX: "auto", lineHeight: 1.5, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
            {schemaSQL}
          </pre>
        </details>

        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={save} style={{ flex: 2 }}>Save & Connect</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  const [view, setView] = useState("pos");
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_config") || "{}"); } catch { return {}; }
  });
  const [demoMode, setDemoMode] = useState(true);
  const [categories, setCategories] = useState(INIT_CATS);
  const [items, setItems] = useState(INIT_ITEMS);
  const [orders, setOrders] = useState(INIT_ORDERS);
  const [showConfig, setShowConfig] = useState(false);
  const [clock, setClock] = useState(new Date());

  useEffect(() => { setDemoMode(!config.supabaseUrl || !config.supabaseKey); }, [config]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const navItems = [
    { key: "pos",        emoji: "🧾", label: "Sales / POS"   },
    { key: "menu",       emoji: "📋", label: "Menu Setup"    },
    { key: "orders",     emoji: "📦", label: "Orders"        },
    { key: "voidRefund", emoji: "↩",  label: "Void / Refund" },
  ];

  const todaySales = orders
    .filter(o => o.status === "completed" && new Date(o.created_at).toDateString() === new Date().toDateString())
    .reduce((s, o) => s + o.total, 0);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: FONT, background: BG, color: TEXT, overflow: "hidden" }}>
      {/* ── Sidebar ── */}
      <div style={{ width: 220, background: DR, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", opacity: 0.65, marginBottom: 3, fontWeight: 700 }}>Restaurant POS</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>SalesPoint</div>
          {demoMode && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.18)", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
              ● Demo Mode
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: "8px 0" }}>
          {navItems.map(({ key, emoji, label }) => {
            const active = view === key;
            return (
              <button key={key} onClick={() => setView(key)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 18px",
                  background: active ? "rgba(255,255,255,0.18)" : "transparent", color: "#fff", border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 13, fontWeight: active ? 800 : 400,
                  borderLeft: active ? "3px solid rgba(255,255,255,0.9)" : "3px solid transparent" }}>
                <span style={{ fontSize: 16 }}>{emoji}</span> {label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Today's Sales</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{fmt(todaySales)}</div>
          <button onClick={() => setShowConfig(true)}
            style={{ width: "100%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            ⚙ API Settings
          </button>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
            {clock.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}<br />
            {clock.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ height: 50, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{navItems.find(n => n.key === view)?.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: MUTED }}>
            <span>{orders.length} orders today</span>
            <span style={{ width: 1, height: 16, background: BORDER, display: "inline-block" }} />
            <span style={{ fontWeight: 700, color: demoMode ? "#92400E" : SUCCESS }}>{demoMode ? "Demo Mode" : "Live"}</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {view === "pos"        && <POSView       categories={categories} items={items} orders={orders} setOrders={setOrders} config={config} demoMode={demoMode} />}
          {view === "menu"       && <MenuView      categories={categories} setCategories={setCategories} items={items} setItems={setItems} config={config} demoMode={demoMode} />}
          {view === "orders"     && <OrdersView    orders={orders} />}
          {view === "voidRefund" && <VoidRefundView orders={orders} setOrders={setOrders} config={config} demoMode={demoMode} />}
        </div>
      </div>

      {showConfig && <ConfigPanel config={config} setConfig={setConfig} demoMode={demoMode} setDemoMode={setDemoMode} onClose={() => setShowConfig(false)} />}
    </div>
  );
}
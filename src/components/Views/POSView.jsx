import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
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

// Two order types: a combined "Pickup & Delivery" (requires customer name,
// contact number and address, starts as "pending" until a rider completes
// it) and "Walk-in" for in-store customers (completes immediately at the
// counter, but we still capture the same contact details for records).
const ORDER_TYPES = [
  { key: "pickup_delivery", label: "Pickup & Delivery" },
  { key: "walk_in",         label: "Walk-in" },
];

// PH mobile numbers are entered as e.g. "09171234567" but stored/dialled
// as "+639171234567". Strip everything but digits, drop a leading trunk
// "0" (only ever meaningful as the very first digit), and cap at the 10
// digits that follow the +63 country code.
const CONTACT_DIGITS = 10;

const normalizeContactInput = (raw) => {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2); // strip country code if pasted in full
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, CONTACT_DIGITS);
};

const formatContactForSave = (digits) => (digits ? `+63${digits}` : "");

/* ── stock status (mirrors StockView logic) ── */
const WARNING    = "#B7770D";
const WARNING_BG = "#FEF3CD";
const DANGER     = "#C0392B";
const DANGER_BG  = "#FDECEA";

// Items marked unit "service" aren't physical inventory — they never go
// "out of stock" no matter what's sitting in the `stock` column. Some rows
// still have a numeric `stock` value left over in the DB (often 0), so unit
// alone — not just `stock == null` — has to decide whether an item is
// stock-tracked.
const isTracked = (item) => !!item && item.unit !== "service" && item.stock != null;

const getStockStatus = (item) => {
  if (!isTracked(item)) return null; // service item or stock not tracked
  // Coerce to Number: numeric/decimal Postgres columns come back as strings
  // via supabase-js, and strict equality (===) won't coerce "0" to 0.
  const stock   = Number(item.stock ?? 0);
  const reorder = Number(item.reorder ?? 3);
  if (stock === 0)      return "out";
  if (stock <= reorder) return "low";
  return "ok";
};

// Short label shown on a menu/cart line, e.g. "per load", "per piece".
const unitLabel = (unit) => (unit ? `per ${unit}` : null);

// Pulls the order id back out of a rider-slip QR payload, which the
// receipt (see ReceiptModal) encodes as
// "Order ID: ...\nCustomer: ...\nAddress: ...".
const parseRiderOrderId = (decodedText) => {
  const match = (decodedText || "").match(/Order ID:\s*(\S+)/i);
  return match ? match[1] : null;
};

// Minimum characters typed before we bother querying past orders for a
// matching customer, and how long to wait after the last keystroke.
const CUSTOMER_SEARCH_MIN_CHARS = 2;
const CUSTOMER_SEARCH_DEBOUNCE_MS = 350;
const CUSTOMER_SEARCH_MAX_RESULTS = 6;

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
   Camera helpers for the built-in QR scanner (same logic as
   RiderScannerView). The scanner itself lives inside POSView.
───────────────────────────────────────────── */
// Every mounted scanner gets its own DOM id, so a new Html5Qrcode never
// gets constructed on top of a node the previous one hasn't torn down.
let qrScanInstanceCounter = 0;

// Tracks the teardown of the most recently mounted scanner. A new scanner
// awaits this before touching the camera, so it never races the previous
// one for the device (closing + reopening quickly leaves the old stop() in
// flight when the new start() fires, and start() then never settles —
// the endless "Starting camera…").
let cameraReleaseChain = Promise.resolve();

// A start()/getUserMedia() that never settles is fatal to the UI. This
// turns a silent hang into a visible error.
const withTimeout = (promise, ms, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

// Safe to call any number of times, in any state (never started, mid-start,
// already stopped). Never throws, never rejects. Resolves once the camera
// has actually been released.
const safeTeardown = (html5Qr) =>
  new Promise((resolve) => {
    const finish = () => {
      try { Promise.resolve(html5Qr.clear()).catch(() => {}); } catch { /* already cleared */ }
      resolve();
    };
    try {
      Promise.resolve(html5Qr.stop()).catch(() => {}).finally(finish);
    } catch {
      finish(); // stop() threw synchronously (scanner was never running)
    }
  });

/* ─────────────────────────────────────────────
   Main POS View
───────────────────────────────────────────── */
export default function POSView({ categories, items, setItems, orders, setOrders, config, demoMode }) {
  const isMobile = useIsMobile();

  const [activeCat, setActiveCat] = useState("all");

  // Restore persisted cart state on mount (lazy initializers run once, before first paint)
  const [cart, setCart]                 = useState(() => loadCartState()?.cart ?? []);
  const [orderType, setOrderType]       = useState(() => loadCartState()?.orderType ?? "walk_in");
  const [customerName, setCustomerName] = useState(() => loadCartState()?.customerName ?? "");
  // Stored as bare local digits (no "+63", no leading "0") — see
  // normalizeContactInput / formatContactForSave.
  const [contactNumber, setContactNumber] = useState(() => loadCartState()?.contactNumber ?? "");
  const [tableNo, setTableNo]           = useState(() => loadCartState()?.tableNo ?? "");
  const [deliveryAddr, setDeliveryAddr] = useState(() => loadCartState()?.deliveryAddr ?? "");
  const [discount, setDiscount]         = useState(() => loadCartState()?.discount ?? "");
  const [discountType, setDiscountType] = useState(() => loadCartState()?.discountType ?? "none");
  const [discountInfo, setDiscountInfo] = useState(() => loadCartState()?.discountInfo ?? null);
  const [promo, setPromo]               = useState(() => loadCartState()?.promo ?? null);

  const [pendingDiscType, setPendingDiscType] = useState(null);
  const [promoInput, setPromoInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [modal, setModal] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  // Mobile only: the cart lives in a sheet that slides up over the menu.
  const [cartOpen, setCartOpen] = useState(false);

  // ── Built-in QR scanner (promo + rider) ──
  // `modal` decides which scan is open; there is no separate scanner
  // component, the camera effect and the overlay both live in POSView.
  const scanMode = modal === "scanPromo" ? "promo" : modal === "scanRider" ? "rider" : null;
  const [scanRegionId, setScanRegionId] = useState("pos-qr-scan-region-0");
  const [scanErr, setScanErr] = useState("");
  const [scanStarting, setScanStarting] = useState(true);
  // Always points at the latest handler, so the camera effect never needs
  // the handlers in its deps (they're new functions on every render).
  const scanHandlerRef = useRef(null);

  // ── Existing-customer lookup ──
  // As the cashier types a name, we look for matching customers among past
  // orders (an order row already carries name/contact/address, so there's
  // no separate customers table to query). Picking a suggestion fills in
  // the contact number and address so repeat customers don't need to be
  // re-typed from scratch.
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const customerFieldRef = useRef(null);
  // True right after a suggestion is picked (or the field is cleared), so
  // the effect below doesn't immediately re-search and reopen the dropdown.
  const suppressNextSearchRef = useRef(false);

  // Persist cart-related state on every change
  useEffect(() => {
    saveCartState({ cart, orderType, customerName, contactNumber, tableNo, deliveryAddr, discount, discountType, discountInfo, promo });
  }, [cart, orderType, customerName, contactNumber, tableNo, deliveryAddr, discount, discountType, discountInfo, promo]);

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

  // Debounced search of past orders for a matching customer name.
  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }
    const q = customerName.trim();
    if (q.length < CUSTOMER_SEARCH_MIN_CHARS) {
      setCustomerSuggestions([]);
      setCustomerSearchLoading(false);
      return;
    }
    let cancelled = false;
    setCustomerSearchLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("customer_name, contact_number, delivery_address, created_at")
        .ilike("customer_name", `%${q}%`)
        .not("customer_name", "is", null)
        .neq("customer_name", "")
        .order("created_at", { ascending: false })
        .limit(30);

      if (cancelled) return;
      setCustomerSearchLoading(false);

      if (error || !data) { setCustomerSuggestions([]); return; }

      // Dedupe by name+contact (same person can place several orders),
      // keeping the most recent record for each.
      const seen = new Set();
      const unique = [];
      for (const row of data) {
        const key = `${row.customer_name.trim().toLowerCase()}|${row.contact_number || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(row);
        if (unique.length >= CUSTOMER_SEARCH_MAX_RESULTS) break;
      }
      setCustomerSuggestions(unique);
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(handle); };
  }, [customerName]);

  // Close the suggestions dropdown on outside click/tap.
  useEffect(() => {
    const onOutside = (e) => {
      if (customerFieldRef.current && !customerFieldRef.current.contains(e.target)) {
        setShowCustomerSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, []);

  const selectCustomerSuggestion = (row) => {
    suppressNextSearchRef.current = true;
    setCustomerName(row.customer_name || "");
    setContactNumber(normalizeContactInput(row.contact_number || ""));
    if (row.delivery_address) setDeliveryAddr(row.delivery_address);
    setCustomerSuggestions([]);
    setShowCustomerSuggestions(false);
  };

  // Each open gets its own DOM id so a new Html5Qrcode never lands on a
  // node the previous one hasn't torn down.
  const openScanner = (kind) => {
    setScanRegionId(`pos-qr-scan-region-${++qrScanInstanceCounter}`);
    setModal(kind);
  };

  const showToast = (msg, type = "warn") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  };

  const handleContactChange = (e) => {
    setContactNumber(normalizeContactInput(e.target.value));
  };

  const filtered = items.filter(i => {
    const matchCat = activeCat === "all" || i.category_id === activeCat;
    const matchSearch = !searchQ || i.name.toLowerCase().includes(searchQ.toLowerCase());
    return matchCat && matchSearch && i.available;
  });

  const addToCart = (item) => {
    const status = getStockStatus(item);
    const tracked = isTracked(item);
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

    if (tracked && currentQtyInCart + 1 > Number(item.stock)) {
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
    if (discountType === "promo" && promo) {
      return promo.discount_type === "percent"
        ? Math.min(subtotal * (Number(promo.discount_value) / 100), subtotal)
        : Math.min(Number(promo.discount_value), subtotal);
    }
    const found = DISCOUNT_TYPES.find(d => d.key === discountType);
    return found?.rate ? Math.min(subtotal * found.rate, subtotal) : 0;
  })();

  const total = subtotal - discAmt;

  // Does any line in the cart exceed currently-known live stock?
  // Service items (unit === "service", or stock not tracked) never count here.
  const hasOverstockedItem = cart.some(c => {
    const live = items.find(i => i.id === c.id);
    return isTracked(live) && c.qty > Number(live.stock);
  });

  // Pickup & Delivery orders need a name, a full 10-digit contact number,
  // and an address so the rider knows who/where to go — required before
  // checkout, not just before printing. Walk-in still collects the same
  // fields but doesn't require them.
  const missingDeliveryInfo = orderType === "pickup_delivery" &&
    (!customerName.trim() || contactNumber.length !== CONTACT_DIGITS || !deliveryAddr.trim());

  const clearOrder = () => {
    setCart([]); setOrderType("walk_in"); setCustomerName(""); setContactNumber(""); setTableNo("");
    setDeliveryAddr(""); setDiscount(""); setDiscountType("none");
    setDiscountInfo(null); setPromo(null); setPromoInput(""); setError("");
    setCustomerSuggestions([]); setShowCustomerSuggestions(false);
    saveCartState(null);
  };

  /* When a discount button is clicked */
  const handleDiscountSelect = (d) => {
    setPromo(null); // manual discount and promo code are mutually exclusive
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

  /* Look up a promo code (typed or scanned) and, if valid, apply it. */
  const applyPromoCode = async (codeRaw) => {
    const code = (codeRaw || "").trim().toUpperCase();
    setModal(null); // close scanner if it was open
    if (!code) return;

    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (error || !data) { showToast(`Promo "${code}" not found.`, "err"); return; }
    if (!data.active) { showToast(`Promo "${code}" is inactive.`, "err"); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      showToast(`Promo "${code}" has expired.`, "err"); return;
    }
    if (data.max_uses != null && data.used_count >= data.max_uses) {
      showToast(`Promo "${code}" has reached its usage limit.`, "err"); return;
    }

    setPromo(data);
    setDiscountType("promo");
    setDiscountInfo(null);
    setDiscount("");
    setPromoInput("");
    showToast(`Promo "${code}" applied.`, "warn");
  };

  /* Scan a rider slip's QR to mark a Pickup & Delivery order as delivered.
     Looks the order up locally first (fast, and works if the DB row is
     mid-flight), then persists the status change to Supabase. */
  const completeRiderOrder = async (decodedText) => {
    setModal(null);
    const orderId = parseRiderOrderId(decodedText);
    if (!orderId) { showToast("QR code not recognized as a rider slip.", "err"); return; }

    const order = orders.find(o => o.id === orderId);
    if (!order) { showToast(`Order ${orderId} not found.`, "err"); return; }
    if (order.type !== "pickup_delivery") {
      showToast(`Order ${orderId} isn't a Pickup & Delivery order.`, "err"); return;
    }
    if (order.status === "completed") {
      showToast(`Order ${orderId} is already marked delivered.`, "warn"); return;
    }

    // .select() forces Supabase to return the rows it actually touched.
    // Without it, `error` is null even when RLS silently blocks the write or
    // the .eq("id", ...) matches zero rows — the request "succeeds" but
    // nothing changes in the database.
    const { data, error } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderId)
      .select();

    if (error) { showToast(`Could not update order: ${error.message}`, "err"); return; }
    if (!data || data.length === 0) {
      showToast(`Order ${orderId} was not updated — check update permissions/RLS on "orders".`, "err");
      return;
    }

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...data[0] } : o));
    showToast(`Order ${orderId} marked as delivered.`, "warn");
  };

  // Route a decoded QR to the right handler for the open scan.
  useEffect(() => {
    scanHandlerRef.current =
      scanMode === "promo" ? applyPromoCode
      : scanMode === "rider" ? completeRiderOrder
      : null;
  });

  // Camera lifecycle — same logic as RiderScannerView's scanner.
  useEffect(() => {
    if (!scanMode) return;

    let disposed = false;
    let handled = false;
    let html5Qr = null;
    setScanErr("");
    setScanStarting(true);

    // Wait for the previous scan's camera to be released first. This promise
    // only settles once start() has settled (or failed / timed out), so the
    // cleanup below can safely chain a stop() after it.
    const myTurn = cameraReleaseChain.then(async () => {
      if (disposed) return; // closed while waiting (e.g. StrictMode)

      // Explicit permission check: rejects clearly on denial / no camera /
      // insecure origin instead of leaving start() to hang. 30s because the
      // user may still be deciding on the browser's "Allow" prompt.
      let stream;
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires HTTPS or a supported browser.");
        }
        stream = await withTimeout(
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }),
          30000,
          "Camera permission request timed out."
        );
      } catch (e) {
        if (!disposed) {
          setScanErr("Camera unavailable: " + (e?.message || String(e)));
          setScanStarting(false);
        }
        return;
      }
      stream.getTracks().forEach((t) => t.stop()); // html5-qrcode opens its own stream
      if (disposed) return;

      try {
        html5Qr = new Html5Qrcode(scanRegionId);
      } catch (e) {
        if (!disposed) {
          setScanErr("Camera unavailable: " + (e?.message || String(e)));
          setScanStarting(false);
        }
        return;
      }

      try {
        await withTimeout(
          html5Qr.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 240 },
            (decodedText) => {
              if (disposed || handled) return; // ignore repeat frames
              handled = true;
              // The handler closes the scan -> effect cleanup stops the camera.
              scanHandlerRef.current?.(decodedText.trim());
            },
            () => {} // per-frame "no QR found yet" — ignore
          ),
          10000,
          "Camera took too long to start — try closing other apps/tabs using it."
        );
        if (!disposed) setScanStarting(false);
      } catch (e) {
        if (!disposed) {
          setScanErr("Camera unavailable: " + (e?.message || String(e)));
          setScanStarting(false);
        }
        // start() may still land after our timeout; release the device
        // rather than leaving it locked for the next scan.
        await safeTeardown(html5Qr);
      }
    });

    return () => {
      disposed = true;
      // Always tear down AFTER myTurn settles, never mid-start.
      cameraReleaseChain = myTurn
        .catch(() => {})
        .then(() => (html5Qr ? safeTeardown(html5Qr) : undefined))
        .catch(() => {});
    };
  }, [scanMode, scanRegionId]);

  const closeReceipt = () => {
    setModal(null);
  };

  const handlePaid = async (method, ref) => {
    setLoading(true); setError("");
    try {
      const status = orderType === "pickup_delivery" ? "pending" : "completed";
      const order = {
        id: genId(), type: orderType, customer_name: customerName,
        contact_number: formatContactForSave(contactNumber),
        table_no: tableNo, delivery_address: deliveryAddr,
        items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
        subtotal, discount: discAmt, total, status,
        payment_method: method, payment_ref: ref, created_at: ts(),
        discount_type: discountType,
        discount_info: discountType === "promo" && promo
          ? { code: promo.code, label: promo.label }
          : (discountInfo ?? null),
      };
      const { error } = await supabase.from("orders").insert(order);
      if (error) throw new Error(error.message);

      // Decrement stock only for physical, stock-tracked items. Service
      // items never touch menu_items.stock, even if the row still has a
      // leftover numeric value there.
      //
      // Writing this update to menu_items is what triggers Supabase Realtime
      // — StockView (and any other open screen) picks up the new stock
      // automatically.
      const stockResults = await Promise.all(
        cart
          .filter(c => isTracked(items.find(i => i.id === c.id)))
          .map(c => {
            const current = Number(items.find(i => i.id === c.id)?.stock ?? 0);
            const newStock = Math.max(0, current - c.qty);
            return supabase.from("menu_items").update({ stock: newStock }).eq("id", c.id);
          })
      );
      const stockErr = stockResults.find(r => r.error);
      if (stockErr) throw new Error(stockErr.error.message);

      // Promo code redeemed — bump its usage counter.
      if (discountType === "promo" && promo) {
        await supabase.from("promo_codes")
          .update({ used_count: (Number(promo.used_count) || 0) + 1 })
          .eq("id", promo.id);
      }

      // Reflect the new stock locally so POS UI doesn't wait on a refetch
      setItems(prev => prev.map(i => {
        const sold = cart.find(c => c.id === i.id);
        if (!sold || !isTracked(i)) return i;
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
      {/* Order type + customer details */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {ORDER_TYPES.map(t => (
            <button key={t.key} onClick={() => setOrderType(t.key)}
              style={{
                flex: 1, padding: isMobile ? "11px 0" : "7px 0", borderRadius: 6, border: "none",
                cursor: "pointer", fontFamily: FONT, fontSize: isMobile ? 12 : 11, fontWeight: 700,
                touchAction: "manipulation",
                background: orderType === t.key ? DR : SUBTLE, color: orderType === t.key ? "#fff" : MUTED,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Customer name, contact number and address — captured for every
            order type. Only Pickup & Delivery requires them filled in
            (see missingDeliveryInfo). */}
        <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
          Customer details
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Name field doubles as an existing-customer search: typing a
              name looks up past orders and offers matches to autofill. */}
          <div ref={customerFieldRef} style={{ position: "relative" }}>
            <input
              value={customerName}
              onChange={e => { setCustomerName(e.target.value); setShowCustomerSuggestions(true); }}
              onFocus={() => { if (customerName.trim().length >= CUSTOMER_SEARCH_MIN_CHARS) setShowCustomerSuggestions(true); }}
              placeholder="Customer name"
              autoCapitalize="words"
              autoComplete="off"
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: noZoomFont(isMobile), padding: isMobile ? "11px 12px" : "7px 10px" }} />

            {showCustomerSuggestions && customerName.trim().length >= CUSTOMER_SEARCH_MIN_CHARS && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 60,
                background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)", maxHeight: 220, overflowY: "auto",
              }}>
                {customerSearchLoading && customerSuggestions.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: MUTED }}>Searching…</div>
                )}
                {!customerSearchLoading && customerSuggestions.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: MUTED }}>No existing customer found</div>
                )}
                {customerSuggestions.map((row, idx) => (
                  <button
                    key={`${row.customer_name}-${row.contact_number}-${idx}`}
                    onClick={() => selectCustomerSuggestion(row)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                      background: "transparent", border: "none", fontFamily: FONT,
                      padding: isMobile ? "10px 12px" : "8px 12px",
                      borderBottom: idx < customerSuggestions.length - 1 ? `1px solid ${BORDER}` : "none",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = SUBTLE; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{row.customer_name}</div>
                    <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.contact_number || "No contact number"}
                      {row.delivery_address ? ` · ${row.delivery_address}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex" }}>
            <span style={{
              display: "flex", alignItems: "center", flexShrink: 0,
              padding: isMobile ? "0 12px" : "0 10px",
              border: `1px solid ${BORDER}`, borderRight: "none",
              borderRadius: "6px 0 0 6px", background: SUBTLE, color: MUTED,
              fontWeight: 700, fontFamily: FONT, fontSize: noZoomFont(isMobile),
            }}>+63</span>
            <input
              value={contactNumber}
              onChange={handleContactChange}
              placeholder="9171234567"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={CONTACT_DIGITS}
              style={{
                ...inputStyle, flex: 1, minWidth: 0, boxSizing: "border-box",
                fontSize: noZoomFont(isMobile), padding: isMobile ? "11px 12px" : "7px 10px",
                borderRadius: "0 6px 6px 0",
              }}
            />
          </div>

          <input value={deliveryAddr} onChange={e => setDeliveryAddr(e.target.value)}
            placeholder={orderType === "pickup_delivery" ? "Delivery address" : "Address"}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: noZoomFont(isMobile), padding: isMobile ? "11px 12px" : "7px 10px" }} />
        </div>
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
          const overStock = isTracked(liveItem) && c.qty > Number(liveItem.stock);
          const uLabel = unitLabel(c.unit);
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
                  <div style={{ fontSize: 11, color: MUTED }}>
                    {fmt(c.price)}{uLabel ? ` / ${c.unit}` : " each"}
                  </div>
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
                  ⚠ Only {Number(liveItem.stock)} in stock — {c.qty - Number(liveItem.stock)} over
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

        {/* Promo code: type it or scan its QR */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>Promo code</div>
          {discountType === "promo" && promo ? (
            <div style={{
              background: DR_LIGHT, border: `1px solid ${DR}`, borderRadius: 8,
              padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: DR, fontSize: 12 }}>🎟️ {promo.code}</div>
                <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{promo.label}</div>
              </div>
              <button
                onClick={() => { setDiscountType("none"); setPromo(null); }}
                style={{ background: "none", border: "none", color: DR, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", fontFamily: FONT, flexShrink: 0, padding: isMobile ? "6px 0" : 0 }}>
                ✕ Remove
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={promoInput}
                onChange={e => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === "Enter") applyPromoCode(promoInput); }}
                placeholder="Enter code"
                style={{ ...inputStyle, flex: 1, minWidth: 0, boxSizing: "border-box",
                  fontSize: noZoomFont(isMobile), padding: isMobile ? "10px 12px" : "6px 8px" }}
              />
              <Btn variant="ghost" onClick={() => applyPromoCode(promoInput)}
                style={{ flexShrink: 0, padding: isMobile ? "10px 12px" : "6px 10px" }}>Apply</Btn>
              <Btn variant="ghost" onClick={() => openScanner("scanPromo")}
                style={{ flexShrink: 0, padding: isMobile ? "10px 12px" : "6px 10px" }} aria-label="Scan promo QR">📷</Btn>
            </div>
          )}
        </div>

        {/* Discount line */}
        {discAmt > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: DR, fontWeight: 600 }}>
              {discountType === "pwd" ? "PWD (20%)"
                : discountType === "senior" ? "Senior Citizen (20%)"
                : discountType === "promo" && promo ? `Promo (${promo.code})`
                : "Discount"}
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
          <Btn
            onClick={() => {
              if (missingDeliveryInfo) {
                setError("Customer name, a valid 10-digit contact number, and delivery address are required for Pickup & Delivery orders.");
                return;
              }
              setError(""); setModal("payment");
            }}
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
          <Btn variant="ghost" onClick={() => openScanner("scanRider")}
            style={{ flexShrink: 0, padding: isMobile ? "11px 14px" : "8px 12px" }}
            aria-label="Scan rider QR to mark a delivery complete">
            🛵 Scan rider
          </Btn>
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
            const uLabel = unitLabel(item.unit);
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
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: DR }}>{fmt(item.price)}</div>
                  {uLabel && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: MUTED }}>{uLabel}</div>
                  )}
                </div>
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
      {scanMode && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, fontFamily: FONT, padding: 16,
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: BG, borderRadius: 12, padding: 18,
              width: isMobile ? "100%" : 400, maxWidth: "100%",
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)", border: `1px solid ${BORDER}`,
              boxSizing: "border-box",
            }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 4 }}>
              {scanMode === "promo" ? "Scan promo QR" : "Scan rider QR"}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
              {scanMode === "promo"
                ? "Point the camera at the customer's promo code."
                : "Point the camera at the rider slip to mark that delivery complete."}
            </div>
            <div id={scanRegionId}
              style={{ width: "100%", minHeight: 260, borderRadius: 8, overflow: "hidden", background: "#000" }} />
            {scanStarting && !scanErr && (
              <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Starting camera…</div>
            )}
            {scanErr && (
              <div style={{ fontSize: 12, color: "#e53e3e", marginTop: 10, fontWeight: 600 }}>⚠ {scanErr}</div>
            )}
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}
      {modal === "payment" && (
        <PaymentModal total={total} config={config} demoMode={demoMode} isMobile={isMobile}
          orderType={orderType} onClose={() => setModal(null)} onPaid={handlePaid} />
      )}
      {modal === "receipt" && receipt && (
        <ReceiptModal order={receipt} isMobile={isMobile} onClose={closeReceipt} />
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
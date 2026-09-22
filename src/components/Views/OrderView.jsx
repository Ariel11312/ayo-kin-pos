import { useState, useEffect } from "react";
import { DR, DR_LIGHT, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT, inputStyle } from "../../ui/styles";
import Btn from "../../function/btn";
import fmt from "../../function/fmt";
import Badge from "../../function/badge";
import { ReceiptModal, ConfirmModal, SuccessModal } from "../../function/modal";
import { supabase } from "../../supabase/supabase";
import useIsMobile, { noZoomFont, SAFE_BOTTOM } from "../../function/useIsMobile";

// ── Discount type labels & colors ─────────────────────────
const DISCOUNT_META = {
  pwd:    { label: "PWD",  icon: "♿", bg: "#EFF6FF", color: "#1D4ED8", desc: "Person with Disability" },
  senior: { label: "SC",   icon: "🧓", bg: "#FEF3C7", color: "#92400E", desc: "Senior Citizen (60+)"   },
};
const DISCOUNT_RATE = 0.20; // 20% both types

const ID_NO_MAX_LEN    = 20;
const NAME_MAX_LEN     = 80;
const ADDRESS_MAX_LEN  = 150;

const EMPTY_FORM = { type: "", idNo: "", name: "", address: "" };

// Desktop table columns. Columns from CENTER_FROM_INDEX onward (Items,
// Total, Discount, Payment, Status, Actions) are center-aligned; everything
// before that (Order ID, Time, Type, and the customer-info columns) reads
// left-aligned like ordinary text.
const TABLE_HEADERS = ["Order ID", "Time", "Type", "Customer", "Contact", "Delivery Address", "Items", "Total", "Discount", "Payment", "Status", "Actions"];
const CENTER_FROM_INDEX = TABLE_HEADERS.indexOf("Items");

// ── Date-range (sales period) filter options ──────────────
// Each entry drives one filter button plus the label shown next to the
// sales total in the page header (e.g. "Today's sales", "This week's sales").
const DATE_FILTERS = [
  { key: "today",     label: "Today",      headerLabel: "Today's"      },
  { key: "yesterday", label: "Yesterday",  headerLabel: "Yesterday's"  },
  { key: "week",      label: "This Week",  headerLabel: "This week's"  },
  { key: "month",     label: "This Month", headerLabel: "This month's" },
  { key: "year",      label: "This Year",  headerLabel: "This year's"  },
  { key: "all",       label: "All Time",   headerLabel: "All-time"     },
];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Returns { start, end } (end exclusive) for a given filter key, or null
// for "all" (meaning: no bound, include everything). All boundaries are
// computed from the browser's local time, so the cutoff lines up with
// whatever "today"/"this week" etc. mean for whoever is using the till.
function getDateRange(filterKey) {
  const now = new Date();
  const todayStart = startOfDay(now);

  switch (filterKey) {
    case "today": {
      const start = todayStart;
      const end = new Date(start); end.setDate(end.getDate() + 1);
      return { start, end };
    }
    case "yesterday": {
      const start = new Date(todayStart); start.setDate(start.getDate() - 1);
      const end = todayStart;
      return { start, end };
    }
    case "week": {
      // Monday-start week
      const day = now.getDay(); // 0 = Sun, 1 = Mon, ...
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const start = new Date(todayStart); start.setDate(start.getDate() + diffToMonday);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      return { start, end };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start, end };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear() + 1, 0, 1);
      return { start, end };
    }
    default: // "all"
      return null;
  }
}

export default function OrdersView({ orders, setOrders }) {
  const isMobile = useIsMobile();

  const [filter, setFilter]           = useState("all");
  const [dateFilter, setDateFilter]   = useState("today"); // today | yesterday | week | month | year | all
  const [search, setSearch]           = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [confirmModal, setConfirmModal]   = useState(null);
  const [successModal, setSuccessModal]   = useState(null);
  const [discountModal, setDiscountModal] = useState(null); // order obj or null
  const [discountForm, setDiscountForm]   = useState(EMPTY_FORM); // { type, idNo, name, address }
  const updateOrders = typeof setOrders === "function" ? setOrders : () => {};

  // ── Live updates: subscribe to order changes from Supabase Realtime ──
  useEffect(() => {
    const channel = supabase
      .channel("orders-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          // eslint-disable-next-line no-console
          console.log("[orders realtime] event received:", payload.eventType, payload);
          const { eventType, new: newRow, old: oldRow } = payload;

          updateOrders(prev => {
            if (eventType === "INSERT") {
              // avoid duplicates if this client already added it optimistically
              if (prev.some(o => o.id === newRow.id)) return prev;
              return [newRow, ...prev];
            }
            if (eventType === "UPDATE") {
              return prev.map(o => (o.id === newRow.id ? { ...o, ...newRow } : o));
            }
            if (eventType === "DELETE") {
              return prev.filter(o => o.id !== oldRow.id);
            }
            return prev;
          });

          // Keep an open modal in sync if its underlying order just changed
          // (e.g. voided/discounted from another terminal while open here)
          if (eventType === "UPDATE") {
            setSelectedOrder(curr => (curr && curr.id === newRow.id ? { ...curr, ...newRow } : curr));
            setDiscountModal(curr => (curr && curr.id === newRow.id ? { ...curr, ...newRow } : curr));
          }
          if (eventType === "DELETE") {
            setSelectedOrder(curr => (curr && curr.id === oldRow.id ? null : curr));
            setDiscountModal(curr => (curr && curr.id === oldRow.id ? null : curr));
          }
        }
      )
      .subscribe((status, err) => {
        // eslint-disable-next-line no-console
        console.log("[orders realtime] subscription status:", status, err || "");
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop the page behind an open sheet/modal from scrolling on touch devices.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const lock = isMobile && (!!discountModal || !!selectedOrder || !!confirmModal || !!successModal);
    const prev = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, discountModal, selectedOrder, confirmModal, successModal]);

  // ── Modal helpers ──────────────────────────────────────
  const showConfirm  = (opts)          => setConfirmModal(opts);
  const showSuccess  = (title, message) => setSuccessModal({ title, message });
  const closeConfirm = ()              => setConfirmModal(null);
  const closeSuccess = ()              => setSuccessModal(null);

  // ── Open discount modal (pre-fill form for edit / late ID entry) ──
  const openDiscountModal = (order) => {
    const info = order.discount_info || {};
    setDiscountForm({
      type:    order.discount_type || "",
      idNo:    info.idNo || "",
      name:    info.name || "",
      address: info.address || "",
    });
    setDiscountModal(order);
  };
  const closeDiscountModal = () => {
    setDiscountModal(null);
    setDiscountForm(EMPTY_FORM);
  };

  // ── Derived data ───────────────────────────────────────
  // Period filter (today / yesterday / week / month / year / all) narrows
  // the order set first; status filter + search then apply on top of that.
  const dateRange = getDateRange(dateFilter);
  const periodOrders = orders.filter(o => {
    if (!dateRange) return true; // "all"
    const d = new Date(o.created_at);
    return d >= dateRange.start && d < dateRange.end;
  });
  const periodSales = periodOrders
    .filter(o => o.status === "completed")
    .reduce((s, o) => s + o.total, 0);
  const headerLabel = DATE_FILTERS.find(f => f.key === dateFilter)?.headerLabel || "Today's";

  const visible = periodOrders.filter(o => {
    const matchStatus = filter === "all" || o.status === filter;
    const matchSearch = !search || o.id.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const summaries = [
    { label: "All Orders", value: periodOrders.length,                                         color: TEXT      },
    { label: "Completed",  value: periodOrders.filter(o => o.status === "completed").length,   color: SUCCESS   },
    { label: "Voided",     value: periodOrders.filter(o => o.status === "voided").length,      color: DR        },
    { label: "Refunded",   value: periodOrders.filter(o => o.status === "refunded").length,    color: "#92400E" },
  ];

  // ── Print the currently visible orders as a receipt-style report ──
  // Prints exactly what's on screen — respects the active period filter
  // (Today/This Week/etc.), status filter, and search box — plus a totals
  // summary for the whole period at the bottom.
  // Pull a readable name/qty/line-total out of an order item regardless of
  // which field names the item objects actually use — different parts of
  // the app may have written items with slightly different shapes over time.
  function itemFields(it) {
    const name  = it.name || it.item_name || it.product_name || it.service || "Item";
    const qty   = it.qty ?? it.quantity ?? 1;
    const price = it.price ?? it.unit_price ?? 0;
    const line  = it.total ?? it.subtotal ?? (price * qty);
    return { name, qty, line };
  }

  function printOrders() {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

    const orderBlocksHtml = visible.map(o => {
      const time = new Date(o.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
      const dm   = DISCOUNT_META[o.discount_type];

      const itemsHtml = (o.items || []).map(it => {
        const { name, qty, line } = itemFields(it);
        return `
          <tr>
            <td>${qty} × ${name}</td>
            <td style="text-align:right">${fmt(line)}</td>
          </tr>`;
      }).join("");

      const customerHtml = [
        o.customer_name    ? `<div>Customer: <strong>${o.customer_name}</strong></div>` : "",
        o.contact_number   ? `<div>Contact: ${o.contact_number}</div>` : "",
        o.delivery_address ? `<div>Address: ${o.delivery_address}</div>` : "",
      ].join("");

      const totalsHtml = o.subtotal
        ? `
          <div>Subtotal: ${fmt(o.subtotal)}</div>
          <div>${dm ? dm.label : "Discount"}: -${fmt(o.discount)}</div>
          <div><strong>Total: ${fmt(o.total)}</strong></div>`
        : `<div><strong>Total: ${fmt(o.total)}</strong></div>`;

      return `
        <div class="order-block">
          <div class="order-head">
            <span><strong>${o.id}</strong></span>
            <span>${time}</span>
          </div>
          <div class="order-meta">${o.type} · ${o.payment_method?.toUpperCase() || "—"} · ${o.status.toUpperCase()}</div>
          ${customerHtml ? `<div class="customer">${customerHtml}</div>` : ""}
          <table class="items">
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="order-totals">${totalsHtml}</div>
        </div>
        <div class="line"></div>`;
    }).join("");

    const completedCount = periodOrders.filter(o => o.status === "completed").length;
    const voidedCount    = periodOrders.filter(o => o.status === "voided").length;
    const refundedCount  = periodOrders.filter(o => o.status === "refunded").length;

    const html = `
      <html>
        <head>
          <title>Sales Report - ${dateStr}</title>
          <style>
            body { font-family: 'Courier New', monospace; width: 320px; margin: 0 auto; padding: 10px; font-size: 12px; }
            h2 { text-align: center; margin: 4px 0; font-size: 14px; }
            .sub { text-align: center; font-size: 11px; margin-bottom: 4px; }
            .line { border-top: 1px dashed #000; margin: 10px 0; }
            .order-head { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
            .order-meta { font-size: 10px; color: #333; text-transform: uppercase; margin-bottom: 4px; }
            .customer { font-size: 11px; margin-bottom: 6px; line-height: 1.5; }
            table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
            table.items td { padding: 2px 0; font-size: 11px; }
            .order-totals { font-size: 11px; line-height: 1.5; text-align: right; border-top: 1px dashed #999; padding-top: 4px; }
            .order-totals strong { font-size: 13px; }
            .totals { margin-top: 4px; font-size: 12px; line-height: 1.6; }
            .totals strong { font-size: 13px; }
          </style>
        </head>
        <body>
          <h2>SALES REPORT</h2>
          <div class="sub">${headerLabel} sales · ${dateStr} ${timeStr}</div>
          ${filter !== "all" ? `<div class="sub">Status filter: ${filter}</div>` : ""}
          ${search ? `<div class="sub">Search: "${search}"</div>` : ""}
          <div class="line"></div>
          ${orderBlocksHtml || `<div class="sub">No orders to show.</div>`}
          <div class="totals">
            Orders shown: ${visible.length}<br/>
            Period total: ${periodOrders.length} · Completed: ${completedCount} · Voided: ${voidedCount} · Refunded: ${refundedCount}<br/>
            <strong>${headerLabel} sales: ${fmt(periodSales)}</strong>
          </div>
        </body>
      </html>`;

    const win = window.open("", "_blank", "width=380,height=600");
    if (!win) return; // popup blocked by browser
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  // ── Remove discount (restore original total) ──────────
  const removeDiscount = async (order) => {
    const restored = order.subtotal ?? order.total;
    try {
      const { error } = await supabase
        .from("orders")
        .update({ discount_type: null, discount: null, subtotal: null, total: restored, discount_info: null })
        .eq("id", order.id);
      if (error) throw new Error(error.message);
      updateOrders(prev => prev.map(o =>
        o.id === order.id
          ? { ...o, discount_type: null, discount: null, subtotal: null, total: restored, discount_info: null }
          : o
      ));
      closeDiscountModal();
      showSuccess("Discount Removed", `Discount removed from order ${order.id}. Total restored to ${fmt(restored)}.`);
    } catch (e) {
      closeDiscountModal();
      showSuccess("Error", e.message);
    }
  };

  // ── Void order ─────────────────────────────────────────
  const voidOrder = (order) => {
    showConfirm({
      title:        "Void Order",
      message:      `Void order ${order.id} totalling ${fmt(order.total)}? This action cannot be undone.`,
      confirmLabel: "Void Order",
      danger:       true,
      onConfirm:    async () => {
        try {
          const { error } = await supabase
            .from("orders")
            .update({ status: "voided" })
            .eq("id", order.id);
          if (error) throw new Error(error.message);
          updateOrders(prev => prev.map(o =>
            o.id === order.id ? { ...o, status: "voided" } : o
          ));
          closeConfirm();
          showSuccess("Order Voided", `Order ${order.id} has been voided.`);
        } catch (e) {
          closeConfirm();
          showSuccess("Error", e.message);
        }
      },
    });
  };

  // ── Apply / save PWD / Senior Citizen discount + ID info ──
  // Used both for first-time discounting and for recording ID details
  // when the customer presents their SC/PWD card later (late presentation).
  const applyDiscount = async (order) => {
    const { type, idNo, name, address } = discountForm;

    if (!type) {
      showSuccess("Select a Discount Type", "Please choose PWD or Senior Citizen before saving.");
      return;
    }
    const trimmedIdNo    = idNo.trim().slice(0, ID_NO_MAX_LEN);
    const trimmedName    = name.trim().slice(0, NAME_MAX_LEN);
    const trimmedAddress = address.trim().slice(0, ADDRESS_MAX_LEN);

    if (!trimmedIdNo || !trimmedName) {
      showSuccess("Missing ID Details", "ID Number and Cardholder Name are required to apply this discount.");
      return;
    }

    const base        = order.subtotal ?? order.total;
    const discountAmt = parseFloat((base * DISCOUNT_RATE).toFixed(2));
    const newTotal     = parseFloat((base - discountAmt).toFixed(2));
    const discount_info = {
      idNo:    trimmedIdNo,
      name:    trimmedName,
      address: trimmedAddress,
    };

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          discount_type: type,
          discount:      discountAmt,
          subtotal:      base,
          total:         newTotal,
          discount_info,
        })
        .eq("id", order.id);
      if (error) throw new Error(error.message);
      updateOrders(prev => prev.map(o =>
        o.id === order.id
          ? { ...o, discount_type: type, discount: discountAmt, subtotal: base, total: newTotal, discount_info }
          : o
      ));
      closeDiscountModal();
      showSuccess(
        "Discount Saved",
        `20% ${DISCOUNT_META[type].desc} discount saved for ${order.id} (ID: ${discount_info.idNo}). New total: ${fmt(newTotal)}`
      );
    } catch (e) {
      closeDiscountModal();
      showSuccess("Error", e.message);
    }
  };

  // ── Shared row-action styles ───────────────────────────
  const actionBtn = (borderColor, bg, color) => ({
    padding: isMobile ? "9px 14px" : "4px 10px",
    borderRadius: 6, border: `1px solid ${borderColor}`, cursor: "pointer",
    fontFamily: FONT, fontSize: isMobile ? 12 : 11, fontWeight: 700,
    background: bg, color, whiteSpace: "nowrap", touchAction: "manipulation",
  });

  const modalInput = {
    ...inputStyle, width: "100%", boxSizing: "border-box",
    fontSize: noZoomFont(isMobile), padding: isMobile ? "11px 12px" : undefined,
  };

  // Truncating text cell shared by the Customer/Contact/Address columns —
  // keeps long values from blowing out the row height or column width.
  const truncCell = (maxWidth) => ({
    padding: "10px 14px", color: MUTED, maxWidth,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  });

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{
      padding: isMobile ? 14 : 22,
      // 100dvh tracks the visible viewport on mobile browsers, where the
      // address bar makes 100vh taller than what you can actually see.
      height: isMobile ? "100dvh" : "100vh",
      boxSizing: "border-box", display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: FONT,
    }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "center" : "flex-start", marginBottom: isMobile ? 14 : 18, flexShrink: 0, gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Orders</h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>
            {headerLabel} sales:{" "}
            <strong style={{ color: DR }}>{fmt(periodSales)}</strong>{" "}
            from {periodOrders.filter(o => o.status === "completed").length} orders
          </p>
        </div>
        <button
          onClick={printOrders}
          style={{
            padding: isMobile ? "9px 14px" : "7px 14px",
            borderRadius: 6, border: `1px solid ${BORDER}`, cursor: "pointer",
            fontFamily: FONT, fontSize: 12, fontWeight: 700, color: MUTED, background: BG,
            whiteSpace: "nowrap", touchAction: "manipulation", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          🖨️ Print
        </button>
      </div>

      {/* Summary cards — 2×2 on phones */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: isMobile ? 8 : 12,
        marginBottom: isMobile ? 14 : 22, flexShrink: 0,
      }}>
        {summaries.map(s => (
          <div key={s.label} style={{ background: SUBTLE, borderRadius: 8, padding: isMobile ? "10px 12px" : "14px 16px" }}>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 0.4, marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Date period filter (Today / Yesterday / This Week / This Month / This Year / All Time) */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 10, flexShrink: 0,
        overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
      }}>
        {DATE_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setDateFilter(f.key)}
            style={{
              padding: isMobile ? "9px 14px" : "6px 13px",
              borderRadius: 6, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 12, fontWeight: 700,
              whiteSpace: "nowrap", flexShrink: 0, touchAction: "manipulation",
              background: dateFilter === f.key ? DR : SUBTLE,
              color:      dateFilter === f.key ? "#fff" : MUTED,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        gap: 10, marginBottom: 14, flexWrap: "wrap", flexShrink: 0,
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search order ID…"
          type="search" autoCorrect="off" autoCapitalize="characters"
          style={{
            ...inputStyle,
            width: isMobile ? "100%" : 200, boxSizing: "border-box",
            fontSize: noZoomFont(isMobile),
            padding: isMobile ? "11px 12px" : "7px 12px",
          }}
        />
        <div style={{
          display: "flex", gap: 6,
          flexWrap: isMobile ? "nowrap" : "wrap",
          overflowX: isMobile ? "auto" : "visible",
          WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
        }}>
          {["all", "completed", "voided", "refunded"].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: isMobile ? "10px 16px" : "7px 14px",
                borderRadius: 6, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                whiteSpace: "nowrap", flexShrink: 0, touchAction: "manipulation",
                background: filter === s ? DR : SUBTLE,
                color:      filter === s ? "#fff" : MUTED,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Orders: card list on mobile, table on desktop ── */}
      {isMobile ? (
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
          paddingBottom: `calc(24px + ${SAFE_BOTTOM})`,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map(order => {
              const dm         = order.discount_type ? DISCOUNT_META[order.discount_type] : null;
              const canVoid         = order.status === "completed";
              const canDiscount     = order.status === "completed" && !order.discount_type;
              const canEditDiscount = order.status === "completed" && !!dm;
              const missingId       = !!dm && !order.discount_info?.idNo;

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  style={{
                    border: `1px solid ${missingId ? "#DC2626" : BORDER}`,
                    borderRadius: 10, padding: 14, background: BG, cursor: "pointer",
                  }}
                >
                  {/* Top row: ID + status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 800, fontFamily: "monospace", fontSize: 13, color: DR }}>{order.id}</span>
                    <Badge status={order.status} />
                  </div>

                  {/* Meta line */}
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 5, textTransform: "capitalize" }}>
                    {new Date(order.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                    {" · "}{order.type}
                    {" · "}{order.items.length} item{order.items.length !== 1 ? "s" : ""}
                    {" · "}<span style={{ textTransform: "uppercase", fontWeight: 700 }}>{order.payment_method}</span>
                  </div>

                  {/* Customer info line — name, contact, delivery address */}
                  {(order.customer_name || order.contact_number || order.delivery_address) && (
                    <div style={{ fontSize: 12, color: TEXT, marginTop: 4, lineHeight: 1.5 }}>
                      {order.customer_name && <div style={{ fontWeight: 700 }}>{order.customer_name}</div>}
                      {order.contact_number && <div style={{ color: MUTED }}>{order.contact_number}</div>}
                      {order.delivery_address && (
                        <div style={{ color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {order.delivery_address}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Total */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                    {order.subtotal ? (
                      <>
                        <span style={{ textDecoration: "line-through", color: MUTED, fontSize: 12 }}>{fmt(order.subtotal)}</span>
                        <span style={{ fontWeight: 800, fontSize: 18, color: DR }}>{fmt(order.total)}</span>
                      </>
                    ) : (
                      <span style={{ fontWeight: 800, fontSize: 18 }}>{fmt(order.total)}</span>
                    )}
                  </div>

                  {/* Discount badge */}
                  {dm && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 10px", borderRadius: 12,
                        background: dm.bg, color: dm.color, fontSize: 10, fontWeight: 800,
                      }}>
                        {dm.icon} {dm.label} 20%
                      </span>
                      {missingId ? (
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#DC2626" }}>⚠ No ID on file</span>
                      ) : (
                        <span style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{order.discount_info.idNo}</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {(canDiscount || canEditDiscount || canVoid) && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}
                    >
                      {canDiscount && (
                        <button onClick={() => openDiscountModal(order)} style={actionBtn("#D97706", "#FFFBEB", "#92400E")}>
                          + Discount
                        </button>
                      )}
                      {canEditDiscount && (
                        <button
                          onClick={() => openDiscountModal(order)}
                          style={actionBtn(
                            missingId ? "#DC2626" : dm.color,
                            missingId ? "#FFF5F5" : dm.bg,
                            missingId ? "#DC2626" : dm.color
                          )}
                        >
                          {missingId ? "🪪 Add ID" : "✏ Edit"}
                        </button>
                      )}
                      {canVoid && (
                        <button onClick={() => voidOrder(order)} style={{ ...actionBtn(DR, "#FFF5F5", DR), marginLeft: "auto" }}>
                          Void
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {visible.length === 0 && (
            <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 14, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              No orders found
            </div>
          )}
        </div>
      ) : (
        /* Table — only this region scrolls; header row stays pinned */
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden", marginBottom: "40px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ overflowY: "auto", overflowX: "auto", flex: 1, minHeight: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: SUBTLE }}>
                  {TABLE_HEADERS.map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 14px",
                        textAlign: i >= CENTER_FROM_INDEX ? "center" : "left",
                        fontWeight: 700, color: MUTED, fontSize: 10,
                        textTransform: "uppercase", letterSpacing: 0.8,
                        whiteSpace: "nowrap",
                        position: "sticky", top: 0, background: SUBTLE, zIndex: 1,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((order, idx) => {
                  const dm          = order.discount_type ? DISCOUNT_META[order.discount_type] : null;
                  const rowBg       = idx % 2 === 0 ? BG : "#FAFAFA";
                  const canVoid          = order.status === "completed";
                  const canDiscount      = order.status === "completed" && !order.discount_type;
                  const canEditDiscount  = order.status === "completed" && !!dm;
                  const missingId        = !!dm && !order.discount_info?.idNo;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      style={{ borderTop: `1px solid ${BORDER}`, cursor: "pointer", background: rowBg }}
                      onMouseEnter={e => (e.currentTarget.style.background = DR_LIGHT)}
                      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                    >
                      {/* Order ID */}
                      <td style={{ padding: "10px 14px", fontWeight: 800, fontFamily: "monospace", fontSize: 12, color: DR }}>
                        {order.id}
                      </td>

                      {/* Time */}
                      <td style={{ padding: "10px 14px", color: MUTED, whiteSpace: "nowrap" }}>
                        {new Date(order.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                      </td>

                      {/* Type */}
                      <td style={{ padding: "10px 14px", textTransform: "capitalize" }}>{order.type}</td>

                      {/* Customer */}
                      <td style={truncCell(140)} title={order.customer_name || ""}>
                        {order.customer_name || "—"}
                      </td>

                      {/* Contact */}
                      <td style={{ padding: "10px 14px", color: MUTED, whiteSpace: "nowrap" }}>
                        {order.contact_number || "—"}
                      </td>

                      {/* Delivery Address */}
                      <td style={truncCell(200)} title={order.delivery_address || ""}>
                        {order.delivery_address || "—"}
                      </td>

                      {/* Items */}
                      <td style={{ padding: "10px 14px", textAlign: "center", color: MUTED }}>{order.items.length}</td>

                      {/* Total — show strikethrough original if discounted */}
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        {order.subtotal ? (
                          <div>
                            <div style={{ textDecoration: "line-through", color: MUTED, fontSize: 11, lineHeight: 1.3 }}>
                              {fmt(order.subtotal)}
                            </div>
                            <div style={{ fontWeight: 800, color: DR }}>{fmt(order.total)}</div>
                          </div>
                        ) : (
                          <span style={{ fontWeight: 800 }}>{fmt(order.total)}</span>
                        )}
                      </td>

                      {/* Discount badge + ID-on-file status */}
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        {dm ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "3px 9px", borderRadius: 12,
                              background: dm.bg, color: dm.color,
                              fontSize: 10, fontWeight: 800,
                            }}>
                              {dm.icon} {dm.label} 20%
                            </span>
                            {missingId ? (
                              <span style={{ fontSize: 9, fontWeight: 800, color: "#DC2626" }}>
                                ⚠ No ID on file
                              </span>
                            ) : (
                              <span style={{ fontSize: 9, color: MUTED, fontFamily: "monospace" }}>
                                {order.discount_info.idNo}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: MUTED, fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Payment */}
                      <td style={{ padding: "10px 14px", textAlign: "center", textTransform: "uppercase", fontSize: 11, fontWeight: 700 }}>
                        {order.payment_method}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <Badge status={order.status} />
                      </td>

                      {/* Actions — stop row-click propagation */}
                      <td style={{ padding: "8px 14px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "nowrap" }}>
                          {canDiscount && (
                            <button onClick={() => openDiscountModal(order)} style={actionBtn("#D97706", "#FFFBEB", "#92400E")}>
                              + Discount
                            </button>
                          )}
                          {canEditDiscount && (
                            <button
                              onClick={() => openDiscountModal(order)}
                              style={actionBtn(
                                missingId ? "#DC2626" : dm.color,
                                missingId ? "#FFF5F5" : dm.bg,
                                missingId ? "#DC2626" : dm.color
                              )}
                            >
                              {missingId ? "🪪 Add ID" : "✏ Edit"}
                            </button>
                          )}
                          {canVoid && (
                            <button onClick={() => voidOrder(order)} style={actionBtn(DR, "#FFF5F5", DR)}>
                              Void
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 14 }}>
                No orders found
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Receipt Modal ── */}
      {selectedOrder && (
        <ReceiptModal order={selectedOrder} isMobile={isMobile} onClose={() => setSelectedOrder(null)} />
      )}

      {/* ── PWD / Senior Citizen Discount Modal ── */}
      {discountModal && (() => {
        const isEditing = !!discountModal.discount_type;
        const base       = discountModal.subtotal ?? discountModal.total; // always pre-discount base
        const savings    = parseFloat((base * DISCOUNT_RATE).toFixed(2));
        const newTotal   = parseFloat((base - savings).toFixed(2));
        const idMissingOnLoad = isEditing && !discountModal.discount_info?.idNo;

        return (
          <div
            onClick={closeDiscountModal}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: isMobile ? "flex-end" : "center",
              justifyContent: "center",
              padding: isMobile ? 0 : 24,
              overflowY: "auto", overscrollBehavior: "contain",
              zIndex: 1000,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: BG,
                borderRadius: isMobile ? "16px 16px 0 0" : 14,
                padding: isMobile ? "20px 16px" : 28,
                paddingBottom: isMobile ? `calc(20px + ${SAFE_BOTTOM})` : 28,
                width: isMobile ? "100%" : 420,
                maxWidth: "100%",
                maxHeight: isMobile ? "92dvh" : "calc(100vh - 48px)",
                overflowY: "auto", WebkitOverflowScrolling: "touch",
                boxShadow: "0 24px 60px rgba(0,0,0,0.18)", fontFamily: FONT,
                margin: isMobile ? 0 : "auto",
                boxSizing: "border-box",
              }}
            >
              {/* Grab handle — mobile only */}
              {isMobile && (
                <div style={{ width: 38, height: 4, borderRadius: 2, background: BORDER, margin: "0 auto 14px" }} />
              )}

              {/* Header */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>
                  {isEditing ? "Edit Discount" : "Apply Discount"}
                </h3>
                <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>
                  Order <strong style={{ color: DR }}>{discountModal.id}</strong>
                  {" · "}Original total: <strong>{fmt(base)}</strong>
                </p>
              </div>

              {/* Late presentation notice */}
              {idMissingOnLoad && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#FFF5F5", border: "1px solid #DC2626",
                  borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠</span>
                  <div style={{ fontSize: 12, color: "#991B1B", lineHeight: 1.4 }}>
                    No SC/PWD ID was recorded for this order yet. Fill in the cardholder's
                    details below once they present their card.
                  </div>
                </div>
              )}

              {/* Current discount banner (edit mode only, ID on file) */}
              {isEditing && !idMissingOnLoad && (() => {
                const cur = DISCOUNT_META[discountModal.discount_type];
                return (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: cur.bg, border: `1px solid ${cur.color}`,
                    borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                  }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{cur.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: cur.color }}>
                        {cur.desc} discount active
                      </div>
                      <div style={{ fontSize: 11, color: MUTED }}>
                        {fmt(discountModal.discount)} off · Current total: {fmt(discountModal.total)}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Legal note */}
              <div style={{
                background: SUBTLE, borderRadius: 8, padding: "10px 14px",
                marginBottom: 16, fontSize: 12, color: MUTED, lineHeight: 1.5,
              }}>
                <strong style={{ color: TEXT }}>20% discount</strong> per RA 9257/RA 9994 (Senior Citizens Act) and RA 7277 (Magna Carta for Disabled Persons).
                ID details below are required for BIR documentation, even if the discount was applied before the card was shown.
              </div>

              {/* Discount type cards (select, not auto-apply) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {Object.entries(DISCOUNT_META).map(([type, d]) => {
                  const active = discountForm.type === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setDiscountForm(f => ({ ...f, type }))}
                      style={{
                        border:       `2px solid ${active ? d.color : BORDER}`,
                        borderRadius: 10, padding: isMobile ? "14px 10px" : "16px 12px", cursor: "pointer",
                        background:   active ? d.bg : "#fff",
                        textAlign:    "center", fontFamily: FONT,
                        transition:   "border-color 0.15s",
                        position:     "relative", touchAction: "manipulation",
                      }}
                      onMouseEnter={e => { if (!isMobile) e.currentTarget.style.borderColor = d.color; }}
                      onMouseLeave={e => { if (!isMobile) e.currentTarget.style.borderColor = active ? d.color : BORDER; }}
                    >
                      {active && (
                        <div style={{
                          position: "absolute", top: 7, right: 9,
                          fontSize: 11, fontWeight: 800, color: d.color,
                        }}>✓</div>
                      )}
                      <div style={{ fontSize: isMobile ? 24 : 28, marginBottom: 6 }}>{d.icon}</div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: d.color }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{d.desc}</div>
                      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: d.color }}>
                        Save {fmt(savings)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, marginTop: 2 }}>
                        → {fmt(newTotal)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* SC/PWD card details */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, letterSpacing: 0.4, marginBottom: 8 }}>
                  Cardholder details
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <input
                      value={discountForm.idNo}
                      onChange={e => setDiscountForm(f => ({ ...f, idNo: e.target.value.slice(0, ID_NO_MAX_LEN) }))}
                      placeholder="SC / PWD ID Number *"
                      maxLength={ID_NO_MAX_LEN}
                      autoCapitalize="characters" autoCorrect="off"
                      style={modalInput}
                    />
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 2, textAlign: "right" }}>
                      {discountForm.idNo.length}/{ID_NO_MAX_LEN}
                    </div>
                  </div>
                  <div>
                    <input
                      value={discountForm.name}
                      onChange={e => setDiscountForm(f => ({ ...f, name: e.target.value.slice(0, NAME_MAX_LEN) }))}
                      placeholder="Cardholder Full Name *"
                      maxLength={NAME_MAX_LEN}
                      autoCapitalize="words"
                      style={modalInput}
                    />
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 2, textAlign: "right" }}>
                      {discountForm.name.length}/{NAME_MAX_LEN}
                    </div>
                  </div>
                  <div>
                    <input
                      value={discountForm.address}
                      onChange={e => setDiscountForm(f => ({ ...f, address: e.target.value.slice(0, ADDRESS_MAX_LEN) }))}
                      placeholder="Address (optional)"
                      maxLength={ADDRESS_MAX_LEN}
                      autoCapitalize="words"
                      style={modalInput}
                    />
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 2, textAlign: "right" }}>
                      {discountForm.address.length}/{ADDRESS_MAX_LEN}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>* Required before saving</div>
              </div>

              <Btn
                variant="primary"
                onClick={() => applyDiscount(discountModal)}
                style={{ width: "100%", marginBottom: 10, padding: isMobile ? "13px 14px" : undefined }}
              >
                {isEditing ? "Save Details" : "Apply Discount"}
              </Btn>

              {/* Remove discount (edit mode only) */}
              {isEditing && (
                <button
                  onClick={() => removeDiscount(discountModal)}
                  style={{
                    width: "100%", padding: isMobile ? "13px 10px" : "9px", marginBottom: 10,
                    borderRadius: 8, border: `1px solid ${BORDER}`,
                    background: "#FFF5F5", color: DR,
                    fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    touchAction: "manipulation",
                  }}
                >
                  🗑 Remove Discount — Restore {fmt(discountModal.subtotal ?? discountModal.total)}
                </button>
              )}

              <Btn variant="ghost" onClick={closeDiscountModal} style={{ width: "100%", padding: isMobile ? "13px 14px" : undefined }}>
                Cancel
              </Btn>
            </div>
          </div>
        );
      })()}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          isMobile={isMobile}
          onClose={closeConfirm}
          onConfirm={confirmModal.onConfirm}
        />
      )}

      {/* ── Success / Info Modal ── */}
      {successModal && (
        <SuccessModal
          title={successModal.title}
          message={successModal.message}
          isMobile={isMobile}
          onClose={closeSuccess}
        />
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { DR, DR_LIGHT, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT, inputStyle } from "../../ui/styles";
import Btn from "../../function/btn";
import fmt from "../../function/fmt";
import Badge from "../../function/Badge";
import { ReceiptModal, ConfirmModal, SuccessModal } from "../../function/modal";
import { supabase } from "../../supabase/supabase";

// ── Discount type labels & colors ─────────────────────────
const DISCOUNT_META = {
  pwd:    { label: "PWD",  icon: "♿", bg: "#EFF6FF", color: "#1D4ED8", desc: "Person with Disability" },
  senior: { label: "SC",   icon: "🧓", bg: "#FEF3C7", color: "#92400E", desc: "Senior Citizen (60+)"   },
};
const DISCOUNT_RATE = 0.20; // 20% both types

const EMPTY_FORM = { type: "", idNo: "", name: "", address: "" };

export default function OrdersView({ orders, setOrders }) {
  const [filter, setFilter]           = useState("all");
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
  const todayOrders = orders.filter(o =>
    new Date(o.created_at).toDateString() === new Date().toDateString()
  );
  const todaySales = todayOrders
    .filter(o => o.status === "completed")
    .reduce((s, o) => s + o.total, 0);

  const visible = orders.filter(o => {
    const matchStatus = filter === "all" || o.status === filter;
    const matchSearch = !search || o.id.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const summaries = [
    { label: "All Orders", value: orders.length,                                         color: TEXT      },
    { label: "Completed",  value: orders.filter(o => o.status === "completed").length,   color: SUCCESS   },
    { label: "Voided",     value: orders.filter(o => o.status === "voided").length,      color: DR        },
    { label: "Refunded",   value: orders.filter(o => o.status === "refunded").length,    color: "#92400E" },
  ];

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
    if (!idNo.trim() || !name.trim()) {
      showSuccess("Missing ID Details", "ID Number and Cardholder Name are required to apply this discount.");
      return;
    }

    const base        = order.subtotal ?? order.total;
    const discountAmt = parseFloat((base * DISCOUNT_RATE).toFixed(2));
    const newTotal     = parseFloat((base - discountAmt).toFixed(2));
    const discount_info = {
      idNo:    idNo.trim(),
      name:    name.trim(),
      address: address.trim(),
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

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{ padding: 22, height: "100%", overflowY: "auto", fontFamily: FONT }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Orders</h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>
            Today's sales:{" "}
            <strong style={{ color: DR }}>{fmt(todaySales)}</strong>{" "}
            from {todayOrders.filter(o => o.status === "completed").length} orders
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
        {summaries.map(s => (
          <div key={s.label} style={{ background: SUBTLE, borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search order ID…"
          style={{ ...inputStyle, width: 200, fontSize: 13, padding: "7px 12px" }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", "completed", "voided", "refunded"].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                background: filter === s ? DR : SUBTLE,
                color:      filter === s ? "#fff" : MUTED,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: SUBTLE }}>
              {["Order ID", "Time", "Type", "Items", "Total", "Discount", "Payment", "Status", "Actions"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: i >= 3 ? "center" : "left",
                    fontWeight: 700, color: MUTED, fontSize: 10,
                    textTransform: "uppercase", letterSpacing: 0.8,
                    whiteSpace: "nowrap",
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
                        <button
                          onClick={() => openDiscountModal(order)}
                          style={{
                            padding: "4px 10px", borderRadius: 6,
                            border: `1px solid #D97706`, cursor: "pointer",
                            fontFamily: FONT, fontSize: 11, fontWeight: 700,
                            background: "#FFFBEB", color: "#92400E",
                            whiteSpace: "nowrap",
                          }}
                        >
                          + Discount
                        </button>
                      )}
                      {canEditDiscount && (
                        <button
                          onClick={() => openDiscountModal(order)}
                          style={{
                            padding: "4px 10px", borderRadius: 6,
                            border: `1px solid ${missingId ? "#DC2626" : DISCOUNT_META[order.discount_type].color}`,
                            cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 700,
                            background: missingId ? "#FFF5F5" : DISCOUNT_META[order.discount_type].bg,
                            color: missingId ? "#DC2626" : DISCOUNT_META[order.discount_type].color,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {missingId ? "🪪 Add ID" : "✏ Edit"}
                        </button>
                      )}
                      {canVoid && (
                        <button
                          onClick={() => voidOrder(order)}
                          style={{
                            padding: "4px 10px", borderRadius: 6,
                            border: `1px solid ${DR}`, cursor: "pointer",
                            fontFamily: FONT, fontSize: 11, fontWeight: 700,
                            background: "#FFF5F5", color: DR,
                            whiteSpace: "nowrap",
                          }}
                        >
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

      {/* ── Receipt Modal ── */}
      {selectedOrder && (
        <ReceiptModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}

      {/* ── PWD / Senior Citizen Discount Modal ── */}
      {discountModal && (() => {
        const isEditing = !!discountModal.discount_type;
        const base       = discountModal.subtotal ?? discountModal.total; // always pre-discount base
        const savings    = parseFloat((base * DISCOUNT_RATE).toFixed(2));
        const newTotal   = parseFloat((base - savings).toFixed(2));
        const idMissingOnLoad = isEditing && !discountModal.discount_info?.idNo;

        return (
          <div style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}>
            <div style={{
              background: BG, borderRadius: 14, padding: 28, width: 420,
              maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 24px 60px rgba(0,0,0,0.18)", fontFamily: FONT,
            }}>
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
                  <span style={{ fontSize: 18 }}>⚠</span>
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
                    <span style={{ fontSize: 20 }}>{cur.icon}</span>
                    <div style={{ flex: 1 }}>
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
                        borderRadius: 10, padding: "16px 12px", cursor: "pointer",
                        background:   active ? d.bg : "#fff",
                        textAlign:    "center", fontFamily: FONT,
                        transition:   "border-color 0.15s",
                        position:     "relative",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = d.color)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = active ? d.color : BORDER)}
                    >
                      {active && (
                        <div style={{
                          position: "absolute", top: 7, right: 9,
                          fontSize: 11, fontWeight: 800, color: d.color,
                        }}>✓</div>
                      )}
                      <div style={{ fontSize: 28, marginBottom: 6 }}>{d.icon}</div>
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
                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Cardholder Details
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    value={discountForm.idNo}
                    onChange={e => setDiscountForm(f => ({ ...f, idNo: e.target.value }))}
                    placeholder="SC / PWD ID Number *"
                    style={{ ...inputStyle, width: "100%", fontSize: 13 }}
                  />
                  <input
                    value={discountForm.name}
                    onChange={e => setDiscountForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Cardholder Full Name *"
                    style={{ ...inputStyle, width: "100%", fontSize: 13 }}
                  />
                  <input
                    value={discountForm.address}
                    onChange={e => setDiscountForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Address (optional)"
                    style={{ ...inputStyle, width: "100%", fontSize: 13 }}
                  />
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>* Required before saving</div>
              </div>

              <Btn
                variant="primary"
                onClick={() => applyDiscount(discountModal)}
                style={{ width: "100%", marginBottom: 10 }}
              >
                {isEditing ? "Save Details" : "Apply Discount"}
              </Btn>

              {/* Remove discount (edit mode only) */}
              {isEditing && (
                <button
                  onClick={() => removeDiscount(discountModal)}
                  style={{
                    width: "100%", padding: "9px", marginBottom: 10,
                    borderRadius: 8, border: `1px solid ${BORDER}`,
                    background: "#FFF5F5", color: DR,
                    fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  🗑 Remove Discount — Restore {fmt(discountModal.subtotal ?? discountModal.total)}
                </button>
              )}

              <Btn variant="ghost" onClick={closeDiscountModal} style={{ width: "100%" }}>
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
          onClose={closeConfirm}
          onConfirm={confirmModal.onConfirm}
        />
      )}

      {/* ── Success / Info Modal ── */}
      {successModal && (
        <SuccessModal
          title={successModal.title}
          message={successModal.message}
          onClose={closeSuccess}
        />
      )}
    </div>
  );
}
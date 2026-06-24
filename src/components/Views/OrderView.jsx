import { useState } from "react";
import {DR, DR_LIGHT, BG, TEXT, MUTED,BORDER, SUBTLE, SUCCESS, FONT, inputStyle} from "../../ui/styles"
import Btn from "../../function/btn";
import fmt from "../../function/fmt";
import Badge from "../../function/Badge";
import { ReceiptModal } from "../../function/modal";

export default function OrdersView({ orders }) {
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
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { DR, DR_LIGHT, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT } from "../../ui/styles";
import fmt from "../../function/fmt";
import { supabase } from "../../supabase/supabase";
// ── Mini chart primitives ──────────────────────────────────────────────────────

function PieChart({ data, size = 180 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#eee" }} />;

  let cumAngle = -90;
  const slices = data.map((d) => {
    const angle = (d.value / total) * 360;
    const start = cumAngle;
    cumAngle += angle;
    return { ...d, startAngle: start, angle };
  });

  const toXY = (angle, r) => {
    const rad = (angle * Math.PI) / 180;
    return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
  };

  const paths = slices.map((s) => {
    const [x1, y1] = toXY(s.startAngle, 38);
    const [x2, y2] = toXY(s.startAngle + s.angle, 38);
    const large = s.angle > 180 ? 1 : 0;
    return `M50,50 L${x1},${y1} A38,38 0 ${large},1 ${x2},${y2} Z`;
  });

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block" }}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill={slices[i].color} stroke="#fff" strokeWidth="1.5" />
      ))}
      <circle cx="50" cy="50" r="20" fill={BG} />
    </svg>
  );
}

function BarChart({ data, height = 180, color = DR }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
            <div
              style={{
                width: "100%",
                height: `${Math.max((d.value / max) * 100, 2)}%`,
                background: color,
                borderRadius: "4px 4px 0 0",
                transition: "height 0.4s ease",
                minHeight: d.value > 0 ? 4 : 0,
              }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <div style={{ fontSize: 9, color: MUTED, textAlign: "center", lineHeight: 1.2, wordBreak: "break-word" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, color = TEXT }) {
  return (
    <div style={{ background: SUBTLE, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function Legend({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
          <span style={{ color: TEXT, fontWeight: 600 }}>{d.label}</span>
          <span style={{ color: MUTED, marginLeft: "auto", fontWeight: 700 }}>{d.display ?? d.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, children, style = {} }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "18px 20px", background: BG, ...style }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, color: TEXT }}>{title}</div>
      {children}
    </div>
  );
}

// ── Color palettes ─────────────────────────────────────────────────────────────
const PIE_COLORS = ["#C0392B", "#2980B9", "#27AE60", "#F39C12", "#8E44AD", "#16A085", "#D35400"];

// ── Main View ──────────────────────────────────────────────────────────────────
export default function StatisticsView() {
  const [range, setRange] = useState("7d");
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Fetching life cycle hooks from Supabase
  useEffect(() => {
    async function loadDashboardMetrics() {
      try {
        setLoading(true);

        // Executes requests in parallel. 
        // Note: Used "orders" explicitly based on your Supabase panel configuration screen.
        const [ordersRes, categoriesRes, itemsRes] = await Promise.all([
          supabase.from("orders").select("*"),
          supabase.from("categories").select("*"),
          supabase.from("menu_items").select("*")
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (categoriesRes.error) throw categoriesRes.error;
        if (itemsRes.error) throw itemsRes.error;

        setOrders(ordersRes.data || []);
        setCategories(categoriesRes.data || []);
        setItems(itemsRes.data || []);
      } catch (err) {
        console.error("Database connection failed:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardMetrics();
  }, []);

  const now = new Date();
  const filtered = useMemo(() => {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "today" ? 1 : 9999;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    cutoff.setHours(0, 0, 0, 0);
    return (orders || []).filter((o) => new Date(o.created_at) >= cutoff);
  }, [orders, range]);

  const completed = filtered.filter((o) => o.status === "completed");
  const voided    = filtered.filter((o) => o.status === "voided");
  const refunded  = filtered.filter((o) => o.status === "refunded");

  const totalRevenue   = completed.reduce((s, o) => s + o.total, 0);
  const totalDiscount  = completed.reduce((s, o) => s + (o.discount || 0), 0);
  const avgOrder       = completed.length ? totalRevenue / completed.length : 0;

  // ── Status pie ──────────────────────────────────────────────────────────────
  const statusData = [
    { label: "Completed", value: completed.length, color: "#27AE60" },
    { label: "Voided",    value: voided.length,    color: DR },
    { label: "Refunded",  value: refunded.length,  color: "#F39C12" },
  ].filter((d) => d.value > 0);

  // ── Payment method pie ──────────────────────────────────────────────────────
  const pmMap = {};
  completed.forEach((o) => { if(o.payment_method) pmMap[o.payment_method] = (pmMap[o.payment_method] || 0) + 1; });
  const paymentData = Object.entries(pmMap).map(([k, v], i) => ({
    label: k.toUpperCase(), value: v, color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  // ── Order type pie ──────────────────────────────────────────────────────────
  const typeMap = {};
  filtered.forEach((o) => { if(o.type) typeMap[o.type] = (typeMap[o.type] || 0) + 1; });
  const typeData = Object.entries(typeMap).map(([k, v], i) => ({
    label: k.replace("-", " "), value: v, color: ["#2980B9", "#8E44AD", "#F39C12"][i] || PIE_COLORS[i],
  }));

  // ── Discount type breakdown ─────────────────────────────────────────────────
  const discountMap = {};
  completed.forEach((o) => {
    const t = o.discount_type && o.discount_type !== "none" ? o.discount_type.toUpperCase() : null;
    if (t) discountMap[t] = (discountMap[t] || 0) + 1;
  });
  const discountData = Object.entries(discountMap).map(([k, v], i) => ({
    label: k, value: v, color: PIE_COLORS[(i + 2) % PIE_COLORS.length],
  }));

  // ── Daily revenue bar ───────────────────────────────────────────────────────
  const days = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 14;
  const dailyRevenue = useMemo(() => {
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
      buckets[key] = 0;
    }
    completed.forEach((o) => {
      const key = new Date(o.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
      if (key in buckets) buckets[key] += o.total;
    });
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [completed, range, days]);

  // ── Top items bar ───────────────────────────────────────────────────────────
  const itemQtyMap = {};
  completed.forEach((o) => {
    (o.items || []).forEach((it) => {
      itemQtyMap[it.name] = (itemQtyMap[it.name] || 0) + it.qty;
    });
  });
  const topItems = Object.entries(itemQtyMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  // ── Category revenue bar ────────────────────────────────────────────────────
  const catRevMap = {};
  completed.forEach((o) => {
    (o.items || []).forEach((it) => {
      const item = items.find((i) => i.id === it.id);
      const cat  = categories.find((c) => c.id === item?.category_id)?.name || "Other";
      catRevMap[cat] = (catRevMap[cat] || 0) + it.price * it.qty;
    });
  });
  const catRevData = Object.entries(catRevMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  const ranges = [
    { key: "today", label: "Today" },
    { key: "7d",    label: "7 Days" },
    { key: "30d",   label: "30 Days" },
    { key: "all",   label: "All Time" },
  ];

  // Render loading state cleanly matching view geometry
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", padding: 100, fontFamily: FONT, color: MUTED }}>
        <h3>Loading database analytics...</h3>
      </div>
    );
  }

  // Render errors cleanly
  if (error) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", padding: 100, fontFamily: FONT, color: DR }}>
        <h3>Error loading metric data: {error}</h3>
      </div>
    );
  }

  return (
    <div style={{ padding: 22, height: "100%", overflowY: "auto", fontFamily: FONT }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Statistics</h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>Sales performance and order breakdown</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {ranges.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: FONT,
                fontSize: 12, fontWeight: 700,
                background: range === r.key ? DR : SUBTLE,
                color: range === r.key ? "#fff" : MUTED }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Revenue"   value={fmt(totalRevenue)}      color={DR} />
        <StatCard label="Completed Orders" value={completed.length}       sub={`of ${filtered.length} total`} color="#27AE60" />
        <StatCard label="Avg Order Value"  value={fmt(avgOrder)}          color="#2980B9" />
        <StatCard label="Total Discounts"  value={fmt(totalDiscount)}     color="#F39C12" />
        <StatCard label="Voided / Refunded" value={voided.length + refunded.length} color={MUTED} />
      </div>

      {/* Row 1: Daily Revenue bar + Order Status pie */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14, marginBottom: 14 }}>
        <ChartCard title={`Daily Revenue — ${ranges.find(r => r.key === range)?.label}`}>
          {dailyRevenue.length > 0
            ? <BarChart data={dailyRevenue} height={200} color={DR} />
            : <Empty />}
        </ChartCard>

        <ChartCard title="Order Status">
          {statusData.length > 0 ? (
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <PieChart data={statusData} size={160} />
              <Legend data={statusData} />
            </div>
          ) : <Empty />}
        </ChartCard>
      </div>

      {/* Row 2: Top Items bar + Payment Method pie + Order Type pie */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px 280px", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Top Items by Qty Sold">
          {topItems.length > 0
            ? <BarChart data={topItems} height={180} color="#2980B9" />
            : <Empty />}
        </ChartCard>

        <ChartCard title="Payment Method">
          {paymentData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
              <PieChart data={paymentData} size={140} />
              <Legend data={paymentData} />
            </div>
          ) : <Empty />}
        </ChartCard>

        <ChartCard title="Order Type">
          {typeData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
              <PieChart data={typeData} size={140} />
              <Legend data={typeData} />
            </div>
          ) : <Empty />}
        </ChartCard>
      </div>

      {/* Row 3: Revenue by Category + Discount type */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14, marginBottom:"50px"} }>
        <ChartCard title="Revenue by Category">
          {catRevData.length > 0
            ? <BarChart data={catRevData} height={160} color="#27AE60" />
            : <Empty />}
        </ChartCard>

        <ChartCard title="Discount Type Breakdown">
          {discountData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
              <PieChart data={discountData} size={140} />
              <Legend data={discountData} />
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 0", color: MUTED, fontSize: 13 }}>No discounts applied</div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ textAlign: "center", padding: "40px 0", color: MUTED, fontSize: 13 }}>No data for this period</div>;
}

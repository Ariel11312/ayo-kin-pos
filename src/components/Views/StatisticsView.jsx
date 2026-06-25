import { useState, useEffect, useMemo } from "react";
import { DR, BG, TEXT, MUTED, BORDER, SUBTLE, FONT } from "../../ui/styles";
import fmt from "../../function/fmt";
import { supabase } from "../../supabase/supabase";

// ── Color tokens ───────────────────────────────────────────────────────────────
const STOCK_OK   = "#27AE60";
const STOCK_LOW  = "#F39C12";
const STOCK_OUT  = "#C0392B";
const BLUE       = "#2980B9";
const PURPLE     = "#8E44AD";
const TEAL       = "#16A085";
const PIE_COLORS = [DR, BLUE, STOCK_OK, STOCK_LOW, PURPLE, TEAL, "#D35400", "#1ABC9C"];

// ── Shared primitives ──────────────────────────────────────────────────────────

function PieChart({ data, size = 160 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#eee" }} />;
  let cum = -90;
  const slices = data.map((d) => {
    const angle = (d.value / total) * 360;
    const start = cum; cum += angle;
    return { ...d, startAngle: start, angle };
  });
  const xy = (a, r) => { const rad = (a * Math.PI) / 180; return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)]; };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block" }}>
      {slices.map((s, i) => {
        const [x1, y1] = xy(s.startAngle, 38);
        const [x2, y2] = xy(s.startAngle + s.angle, 38);
        return <path key={i} d={`M50,50 L${x1},${y1} A38,38 0 ${s.angle > 180 ? 1 : 0},1 ${x2},${y2} Z`} fill={s.color} stroke="#fff" strokeWidth="1.5" />;
      })}
      <circle cx="50" cy="50" r="20" fill={BG} />
    </svg>
  );
}

function BarChart({ data, height = 180, color = DR, showValue = false }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height, paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%" }}>
          {showValue && d.value > 0 && (
            <div style={{ fontSize: 8, color: MUTED, fontWeight: 700 }}>{d.value}</div>
          )}
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
            <div style={{
              width: "100%", height: `${Math.max((d.value / max) * 100, 2)}%`,
              background: d.color || color, borderRadius: "4px 4px 0 0",
              transition: "height 0.4s ease", minHeight: d.value > 0 ? 4 : 0,
            }} title={`${d.label}: ${d.value}`} />
          </div>
          <div style={{ fontSize: 8, color: MUTED, textAlign: "center", lineHeight: 1.2, wordBreak: "break-word" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bar chart — great for ranked lists */
function HBarChart({ data, color = BLUE, formatValue = (v) => v }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 110, fontSize: 11, color: TEXT, fontWeight: 600, textAlign: "right", flexShrink: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
          <div style={{ flex: 1, background: SUBTLE, borderRadius: 4, height: 14, overflow: "hidden" }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: "100%",
              background: d.color || color, borderRadius: 4, transition: "width 0.4s ease", minWidth: d.value > 0 ? 4 : 0 }} />
          </div>
          <div style={{ width: 68, fontSize: 11, color: MUTED, fontWeight: 700, flexShrink: 0 }}>{formatValue(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

/** Stock bar with per-bar colour + dashed reorder line */
function StockBarChart({ data, height = 200 }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height, paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%", position: "relative" }}>
            {d.reorder > 0 && (
              <div style={{ position: "absolute", bottom: `${Math.min((d.reorder / max) * 100, 98)}%`,
                left: 0, right: 0, borderTop: "2px dashed #F39C12", zIndex: 2 }}
                title={`Reorder: ${d.reorder}`} />
            )}
            <div style={{ width: "100%", height: `${Math.max((d.value / max) * 100, 2)}%`,
              background: d.color, borderRadius: "4px 4px 0 0", position: "relative", zIndex: 1,
              transition: "height 0.4s ease", minHeight: d.value > 0 ? 4 : 0 }}
              title={`${d.label}: ${d.value} (reorder @${d.reorder})`} />
          </div>
          <div style={{ fontSize: 8, color: MUTED, textAlign: "center", lineHeight: 1.2, wordBreak: "break-word" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Gauge / progress ring — for single percentage KPI */
function GaugeRing({ pct, color, size = 90, label }) {
  const r = 36, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke={SUBTLE} strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
        <text x="50" y="55" textAnchor="middle" fontSize="16" fontWeight="800" fill={color}>{pct}%</text>
      </svg>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textAlign: "center" }}>{label}</div>
    </div>
  );
}

function StatCard({ label, value, sub, color = TEXT, badge }) {
  return (
    <div style={{ background: SUBTLE, borderRadius: 10, padding: "14px 16px", position: "relative" }}>
      {badge && (
        <div style={{ position: "absolute", top: 10, right: 10, background: badge.bg, color: badge.text,
          fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4 }}>{badge.label}</div>
      )}
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Legend({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <div style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flexShrink: 0 }} />
          <span style={{ color: TEXT, fontWeight: 600 }}>{d.label}</span>
          <span style={{ color: MUTED, marginLeft: "auto", fontWeight: 700 }}>{d.display ?? d.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, children, style = {}, accent }) {
  return (
    <div style={{ border: `1px solid ${accent ? accent + "55" : BORDER}`, borderRadius: 10,
      padding: "16px 18px", background: BG,
      borderLeft: accent ? `4px solid ${accent}` : undefined, ...style }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function SectionDivider({ label, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 18px" }}>
      <div style={{ height: 1, background: BORDER, flex: 1 }} />
      <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>
        {icon} {label}
      </span>
      <div style={{ height: 1, background: BORDER, flex: 1 }} />
    </div>
  );
}

function AlertRow({ item, type }) {
  const isOut     = type === "out";
  const isConflict = type === "conflict";
  const bg    = isOut ? "#fdecea" : isConflict ? "#f3e5f5" : "#fff8e1";
  const border= isOut ? "#f5c6c2" : isConflict ? "#ce93d8" : "#ffe082";
  const dot   = isOut ? STOCK_OUT  : isConflict ? PURPLE : STOCK_LOW;
  const tag   = isOut ? "OUT" : isConflict ? "CONFLICT" : "LOW";
  const tagBg = isOut ? "#fdecea" : isConflict ? "#f3e5f5" : "#fff8e1";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 10px", borderRadius: 7, background: bg, border: `1px solid ${border}`, marginBottom: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{item.name}</span>
        <span style={{ fontSize: 9, fontWeight: 800, color: dot, background: tagBg,
          border: `1px solid ${border}`, padding: "1px 5px", borderRadius: 3 }}>{tag}</span>
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: 11, color: MUTED }}>
        {!isConflict && <>
          <span>Stock: <strong style={{ color: dot }}>{item.stock}</strong></span>
          <span>Reorder: <strong>{item.reorder}</strong></span>
        </>}
        {isConflict && <span style={{ color: PURPLE, fontWeight: 700 }}>Available=TRUE but stock=0</span>}
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ textAlign: "center", padding: "36px 0", color: MUTED, fontSize: 13 }}>No data for this period</div>;
}

// ── Main View ──────────────────────────────────────────────────────────────────
export default function StatisticsView() {
  const [range, setRange]         = useState("7d");
  const [orders, setOrders]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveFlash, setLiveFlash]    = useState(false);

  // ── Shared fetch (called on mount + every real-time event) ─────────────────
  async function fetchAll(quiet = false) {
    try {
      if (!quiet) setLoading(true);
      const [oR, cR, iR] = await Promise.all([
        supabase.from("orders").select("*"),
        supabase.from("categories").select("*"),
        supabase.from("menu_items").select("*"),
      ]);
      if (oR.error) throw oR.error;
      if (cR.error) throw cR.error;
      if (iR.error) throw iR.error;
      setOrders(oR.data || []);
      setCategories(cR.data || []);
      setItems(iR.data || []);
      setLastUpdated(new Date());
      // Pulse the live indicator briefly
      setLiveFlash(true);
      setTimeout(() => setLiveFlash(false), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial load
    fetchAll(false);

    // ── Real-time subscriptions ───────────────────────────────────────────────
    const ordersChannel = supabase
      .channel("rt-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchAll(true))
      .subscribe();

    const itemsChannel = supabase
      .channel("rt-menu-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => fetchAll(true))
      .subscribe();

    const catsChannel = supabase
      .channel("rt-categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => fetchAll(true))
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(catsChannel);
    };
  }, []);

  const now = new Date();

  // ── Date-range filter ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const daysMap = { today: 1, "7d": 7, "30d": 30, all: 9999 };
    const d = daysMap[range] || 7;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - (d - 1));
    cutoff.setHours(0, 0, 0, 0);
    return orders.filter((o) => new Date(o.created_at) >= cutoff);
  }, [orders, range]);

  const completed = filtered.filter((o) => o.status === "completed");
  const voided    = filtered.filter((o) => o.status === "voided");
  const refunded  = filtered.filter((o) => o.status === "refunded");

  const totalRevenue  = completed.reduce((s, o) => s + o.total, 0);
  const totalDiscount = completed.reduce((s, o) => s + (o.discount || 0), 0);
  const avgOrder      = completed.length ? totalRevenue / completed.length : 0;

  // ── Sales charts ────────────────────────────────────────────────────────────
  const statusData = [
    { label: "Completed", value: completed.length, color: STOCK_OK },
    { label: "Voided",    value: voided.length,    color: DR },
    { label: "Refunded",  value: refunded.length,  color: STOCK_LOW },
  ].filter((d) => d.value > 0);

  const pmMap = {};
  completed.forEach((o) => { if (o.payment_method) pmMap[o.payment_method] = (pmMap[o.payment_method] || 0) + 1; });
  const paymentData = Object.entries(pmMap).map(([k, v], i) => ({ label: k.toUpperCase(), value: v, color: PIE_COLORS[i % PIE_COLORS.length] }));

  const typeMap = {};
  filtered.forEach((o) => { if (o.type) typeMap[o.type] = (typeMap[o.type] || 0) + 1; });
  const typeData = Object.entries(typeMap).map(([k, v], i) => ({ label: k.replace("-", " "), value: v, color: [BLUE, PURPLE, STOCK_LOW][i] || PIE_COLORS[i] }));

  const discountMap = {};
  completed.forEach((o) => {
    const t = o.discount_type && o.discount_type !== "none" ? o.discount_type.toUpperCase() : null;
    if (t) discountMap[t] = (discountMap[t] || 0) + 1;
  });
  const discountData = Object.entries(discountMap).map(([k, v], i) => ({ label: k, value: v, color: PIE_COLORS[(i + 2) % PIE_COLORS.length] }));

  const barDays = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 14;
  const dailyRevenue = useMemo(() => {
    const buckets = {};
    for (let i = barDays - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
      buckets[key] = 0;
    }
    completed.forEach((o) => {
      const key = new Date(o.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
      if (key in buckets) buckets[key] += o.total;
    });
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [completed, range, barDays]);

  const itemQtyMap = {};
  completed.forEach((o) => { (o.items || []).forEach((it) => { itemQtyMap[it.name] = (itemQtyMap[it.name] || 0) + it.qty; }); });
  const topItems = Object.entries(itemQtyMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));

  const catRevMap = {};
  completed.forEach((o) => {
    (o.items || []).forEach((it) => {
      const item = items.find((i) => i.id === it.id);
      const cat  = categories.find((c) => c.id === item?.category_id)?.name || "Other";
      catRevMap[cat] = (catRevMap[cat] || 0) + it.price * it.qty;
    });
  });
  const catRevData = Object.entries(catRevMap).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  // ══════════════════════════════════════════════════════════════════════════════
  // ── INVENTORY ANALYTICS ───────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════
  const inv = useMemo(() => {
    const real = items.filter((i) => i.name);

    // ── Stock health classification ────────────────────────────────────────────
    const inStock  = real.filter((i) => i.stock > i.reorder);
    const lowStock = real.filter((i) => i.stock > 0 && i.stock <= i.reorder);
    const outStock = real.filter((i) => i.stock === 0);
    const avail    = real.filter((i) => i.available === true);
    const unavail  = real.filter((i) => i.available === false);

    // Items available=TRUE but stock=0  →  data conflict
    const conflicts = real.filter((i) => i.available === true && i.stock === 0);

    const totalUnits = real.reduce((s, i) => s + (i.stock || 0), 0);

    // Stock health %
    const healthPct = real.length ? Math.round((inStock.length / real.length) * 100) : 0;
    const availPct  = real.length ? Math.round((avail.length  / real.length) * 100) : 0;

    // ── Inventory value  (price × stock) ──────────────────────────────────────
    const totalInvValue = real.reduce((s, i) => s + i.price * i.stock, 0);

    // Per-item inventory value — top 8
    const invValueData = [...real]
      .map((i) => ({ label: i.name, value: i.price * i.stock, color: BLUE }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Inventory value by category
    const catValMap = {};
    real.forEach((i) => {
      const cat = categories.find((c) => c.id === i.category_id)?.name || "Other";
      catValMap[cat] = (catValMap[cat] || 0) + i.price * i.stock;
    });
    const catValueData = Object.entries(catValMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], idx) => ({ label, value, color: PIE_COLORS[idx % PIE_COLORS.length] }));

    // ── Price distribution histogram ─────────────────────────────────────────
    const priceBuckets = { "₱1–99": 0, "₱100–199": 0, "₱200–299": 0, "₱300+": 0 };
    real.forEach((i) => {
      if      (i.price < 100) priceBuckets["₱1–99"]++;
      else if (i.price < 200) priceBuckets["₱100–199"]++;
      else if (i.price < 300) priceBuckets["₱200–299"]++;
      else                    priceBuckets["₱300+"]++;
    });
    const priceDistData = Object.entries(priceBuckets).map(([label, value]) => ({ label, value, color: TEAL }));

    // ── Stock vs Reorder gap (buffer) ─────────────────────────────────────────
    // Positive = buffer above reorder; negative = deficit
    const gapData = [...real]
      .map((i) => ({ label: i.name, value: i.stock - i.reorder, raw: i }))
      .sort((a, b) => a.value - b.value); // worst first

    // ── Sales velocity → estimated days of stock ──────────────────────────────
    // Use all completed orders (not date-filtered) for velocity accuracy
    const allCompleted = orders.filter((o) => o.status === "completed");
    const velocityMap = {}; // item_name → total_qty_sold
    allCompleted.forEach((o) => {
      (o.items || []).forEach((it) => {
        velocityMap[it.name] = (velocityMap[it.name] || 0) + it.qty;
      });
    });
    // Days of data in orders
    let oldestDate = new Date();
    allCompleted.forEach((o) => { const d = new Date(o.created_at); if (d < oldestDate) oldestDate = d; });
    const totalDays = Math.max((now - oldestDate) / (1000 * 60 * 60 * 24), 1);

    const coverageData = real
      .map((i) => {
        const soldTotal = velocityMap[i.name] || 0;
        const dailyRate = soldTotal / totalDays;
        const coverageDays = dailyRate > 0 ? Math.round(i.stock / dailyRate) : null;
        return { label: i.name, stock: i.stock, dailyRate: +dailyRate.toFixed(2), coverageDays };
      })
      .filter((d) => d.coverageDays !== null)
      .sort((a, b) => a.coverageDays - b.coverageDays)
      .slice(0, 10);

    // ── Stock levels per item (coloured) ──────────────────────────────────────
    const stockBarData = [...real]
      .sort((a, b) => a.stock - b.stock)
      .map((i) => ({
        label: i.name,
        value: i.stock,
        reorder: i.reorder,
        color: i.stock === 0 ? STOCK_OUT : i.stock <= i.reorder ? STOCK_LOW : STOCK_OK,
      }));

    // Stock by category
    const catStockMap = {};
    real.forEach((i) => {
      const cat = categories.find((c) => c.id === i.category_id)?.name || "Other";
      catStockMap[cat] = (catStockMap[cat] || 0) + (i.stock || 0);
    });
    const catStockData = Object.entries(catStockMap).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

    // Reorder alerts — ALL items including "sample"
    const reorderAlerts = real
      .filter((i) => i.stock <= i.reorder)
      .sort((a, b) => a.stock - b.stock);

    // ── Stock status + availability pies ──────────────────────────────────────
    const stockStatusData = [
      { label: "In Stock",     value: inStock.length,  color: STOCK_OK  },
      { label: "Low Stock",    value: lowStock.length, color: STOCK_LOW },
      { label: "Out of Stock", value: outStock.length, color: STOCK_OUT },
    ].filter((d) => d.value > 0);

    const availData = [
      { label: "Available",   value: avail.length,   color: BLUE },
      { label: "Unavailable", value: unavail.length, color: "#aaa" },
    ].filter((d) => d.value > 0);

    return {
      real, inStock, lowStock, outStock, avail, unavail, conflicts,
      totalUnits, healthPct, availPct, totalInvValue,
      invValueData, catValueData, priceDistData, gapData,
      coverageData, stockBarData, catStockData, reorderAlerts,
      stockStatusData, availData,
    };
  }, [items, categories, orders]);

  const ranges = [
    { key: "today", label: "Today" },
    { key: "7d",    label: "7 Days" },
    { key: "30d",   label: "30 Days" },
    { key: "all",   label: "All Time" },
  ];

  if (loading && orders.length === 0) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", fontFamily: FONT, color: MUTED }}>
      <h3>Loading analytics...</h3>
    </div>
  );
  if (error) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", fontFamily: FONT, color: DR }}>
      <h3>Error: {error}</h3>
    </div>
  );

  return (
    <div style={{ padding: 22, height: "100%", overflowY: "auto", fontFamily: FONT }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Statistics</h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>Sales performance · Order breakdown · Inventory analytics</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Live badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: MUTED }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: liveFlash ? "#27AE60" : "#4ade80",
              boxShadow: liveFlash ? "0 0 0 4px rgba(39,174,96,0.3)" : "none",
              transition: "all 0.3s ease",
            }} />
            <span style={{ fontWeight: 700, color: "#27AE60" }}>LIVE</span>
            {lastUpdated && (
              <span style={{ color: MUTED, fontWeight: 400 }}>
                · updated {lastUpdated.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          {/* Range buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            {ranges.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)}
                style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 12, fontWeight: 700,
                  background: range === r.key ? DR : SUBTLE,
                  color: range === r.key ? "#fff" : MUTED }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SALES SECTION
      ══════════════════════════════════════════════════════════════════════ */}
      <SectionDivider label="Sales Overview" icon="📊" />

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Total Revenue"     value={fmt(totalRevenue)}                  color={DR} />
        <StatCard label="Completed Orders"  value={completed.length}                   sub={`of ${filtered.length} total`} color={STOCK_OK} />
        <StatCard label="Avg Order Value"   value={fmt(avgOrder)}                      color={BLUE} />
        <StatCard label="Total Discounts"   value={fmt(totalDiscount)}                 color={STOCK_LOW} />
        <StatCard label="Voided / Refunded" value={voided.length + refunded.length}    color={MUTED} />
      </div>

      {/* Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14, marginBottom: 14 }}>
        <ChartCard title={`Daily Revenue — ${ranges.find(r => r.key === range)?.label}`}>
          {dailyRevenue.length > 0 ? <BarChart data={dailyRevenue} height={200} color={DR} /> : <Empty />}
        </ChartCard>
        <ChartCard title="Order Status">
          {statusData.length > 0 ? (
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <PieChart data={statusData} size={150} />
              <Legend data={statusData} />
            </div>
          ) : <Empty />}
        </ChartCard>
      </div>

      {/* Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 270px 270px", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Top Items by Qty Sold">
          {topItems.length > 0 ? <BarChart data={topItems} height={180} color={BLUE} showValue /> : <Empty />}
        </ChartCard>
        <ChartCard title="Payment Method">
          {paymentData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
              <PieChart data={paymentData} size={130} />
              <Legend data={paymentData} />
            </div>
          ) : <Empty />}
        </ChartCard>
        <ChartCard title="Order Type">
          {typeData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
              <PieChart data={typeData} size={130} />
              <Legend data={typeData} />
            </div>
          ) : <Empty />}
        </ChartCard>
      </div>

      {/* Row 3 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 290px", gap: 14 }}>
        <ChartCard title="Revenue by Category">
          {catRevData.length > 0 ? <BarChart data={catRevData} height={160} color={STOCK_OK} /> : <Empty />}
        </ChartCard>
        <ChartCard title="Discount Type Breakdown">
          {discountData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
              <PieChart data={discountData} size={130} />
              <Legend data={discountData} />
            </div>
          ) : <div style={{ textAlign: "center", padding: "30px 0", color: MUTED, fontSize: 13 }}>No discounts applied</div>}
        </ChartCard>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          INVENTORY SECTION
      ══════════════════════════════════════════════════════════════════════ */}
      <SectionDivider label="Inventory & Stock Analytics" icon="📦" />

      {/* Inventory KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Total SKUs"      value={inv.real.length}        color={TEXT} />
        <StatCard label="In Stock"        value={inv.inStock.length}     color={STOCK_OK}  sub="Above reorder pt." />
        <StatCard label="Low Stock"       value={inv.lowStock.length}    color={STOCK_LOW} sub="At/below reorder"
          badge={inv.lowStock.length > 0 ? { label: "ACTION", bg: "#fff8e1", text: STOCK_LOW } : null} />
        <StatCard label="Out of Stock"    value={inv.outStock.length}    color={STOCK_OUT} sub="Zero units"
          badge={inv.outStock.length > 0 ? { label: "URGENT", bg: "#fdecea", text: STOCK_OUT } : null} />
        <StatCard label="Total Units"     value={inv.totalUnits}         color={BLUE}  sub="All items combined" />
        <StatCard label="Inventory Value" value={fmt(inv.totalInvValue)} color={PURPLE} sub="price × stock" />
      </div>

      {/* Gauge row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Stock Health Rate" subtitle="% of SKUs above their reorder point">
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <GaugeRing pct={inv.healthPct} color={inv.healthPct >= 70 ? STOCK_OK : inv.healthPct >= 40 ? STOCK_LOW : STOCK_OUT} size={110} label="In-Stock Rate" />
          </div>
        </ChartCard>
        <ChartCard title="Availability Rate" subtitle="% of items marked available = TRUE">
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <GaugeRing pct={inv.availPct} color={inv.availPct >= 80 ? STOCK_OK : STOCK_LOW} size={110} label="Available Rate" />
          </div>
        </ChartCard>
        <ChartCard title="Data Conflicts" subtitle="available=TRUE but stock=0" accent={inv.conflicts.length > 0 ? PURPLE : undefined}>
          {inv.conflicts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: STOCK_OK, fontSize: 13, fontWeight: 700 }}>✓ No conflicts detected</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {inv.conflicts.map((i) => <AlertRow key={i.id} item={i} type="conflict" />)}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Stock Status + Availability + Reorder Alerts */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 240px 1fr", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Stock Health" subtitle="By reorder threshold">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
            <PieChart data={inv.stockStatusData} size={130} />
            <Legend data={inv.stockStatusData} />
          </div>
        </ChartCard>
        <ChartCard title="Item Availability" subtitle="available flag">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
            <PieChart data={inv.availData} size={130} />
            <Legend data={inv.availData} />
          </div>
        </ChartCard>
        <ChartCard title="⚠ Reorder Alerts" subtitle="Items at or below reorder point — sorted by urgency" accent={inv.reorderAlerts.length > 0 ? STOCK_LOW : undefined}>
          {inv.reorderAlerts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: STOCK_OK, fontSize: 13, fontWeight: 700 }}>✓ All items are well-stocked</div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {inv.reorderAlerts.map((i) => (
                <AlertRow key={i.id} item={i} type={i.stock === 0 ? "out" : "low"} />
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Stock bar + Category stock */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Stock Levels per Item"
          subtitle="Sorted lowest→highest · Dashed orange = reorder point · 🟥 Out · 🟧 Low · 🟩 OK">
          {inv.stockBarData.length > 0 ? <StockBarChart data={inv.stockBarData} height={200} /> : <Empty />}
        </ChartCard>
        <ChartCard title="Units by Category" subtitle="Total stock units per category">
          {inv.catStockData.length > 0 ? <BarChart data={inv.catStockData} height={200} color={TEAL} showValue /> : <Empty />}
        </ChartCard>
      </div>

      {/* Inventory Value per Item + by Category */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, marginBottom: 14 }}>
        <ChartCard title="Inventory Value per Item (Top 8)"
          subtitle="price × stock — higher = more capital tied up">
          {inv.invValueData.length > 0
            ? <HBarChart data={inv.invValueData} color={BLUE} formatValue={(v) => fmt(v)} />
            : <Empty />}
        </ChartCard>
        <ChartCard title="Inventory Value by Category">
          {inv.catValueData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
              <PieChart data={inv.catValueData} size={130} />
              <Legend data={inv.catValueData.map((d) => ({ ...d, display: fmt(d.value) }))} />
            </div>
          ) : <Empty />}
        </ChartCard>
      </div>

      {/* Price Distribution + Coverage Days */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, marginBottom: 50 }}>
        <ChartCard title="Price Distribution" subtitle="How many items fall in each price range">
          {inv.priceDistData.some((d) => d.value > 0)
            ? <BarChart data={inv.priceDistData} height={160} color={TEAL} showValue />
            : <Empty />}
        </ChartCard>
        <ChartCard title="Estimated Days of Stock Remaining"
          subtitle="Based on actual sales velocity · Items sold appear here; sorted most urgent first"
          accent={inv.coverageData.some((d) => d.coverageDays <= 7) ? STOCK_OUT : undefined}>
          {inv.coverageData.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: MUTED, fontSize: 13 }}>
              No sales data to compute velocity
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {inv.coverageData.map((d, i) => {
                const urgent = d.coverageDays <= 3;
                const warn   = d.coverageDays <= 7 && !urgent;
                const color  = urgent ? STOCK_OUT : warn ? STOCK_LOW : STOCK_OK;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "6px 10px", borderRadius: 7,
                    background: urgent ? "#fdecea" : warn ? "#fff8e1" : SUBTLE }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, width: 130, flexShrink: 0,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
                    <div style={{ flex: 1, background: BORDER, borderRadius: 3, height: 8, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min((d.coverageDays / 30) * 100, 100)}%`,
                        height: "100%", background: color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color, width: 60, textAlign: "right", flexShrink: 0 }}>
                      {d.coverageDays}d left
                    </span>
                    <span style={{ fontSize: 10, color: MUTED, width: 70, textAlign: "right", flexShrink: 0 }}>
                      {d.dailyRate}/day sold
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../supabase/supabase";
import {
  DR, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT
} from "../../ui/styles";
import fmt from "../../function/fmt";
import useIsMobile, { noZoomFont, SAFE_BOTTOM } from "../../function/useIsMobile";

/* ─── palette ─── */
const DANGER    = "#C0392B";
const DANGER_BG = "#FDECEA";
const WARNING   = "#B7770D";
const WARNING_BG= "#FEF3CD";
const INFO      = "#185FA5";
const INFO_BG   = "#E8F1FB";
const CARD_BG   = "#F7F7F7";
const NEUTRAL   = "#6B7280";
const NEUTRAL_BG= "#EEF0F2";

const REORDER_REASONS = [
  "Delivery received",
  "Supplier restock",
  "Customer return",
  "Inventory correction",
  "Opening stock",
];

/* ─── helpers ─── */
// Items sold "per load" (wash/dry/fold, delivery tiers, etc.) are services,
// not physical inventory — they never go "out of stock" no matter what's
// sitting in the `stock` column.
function isTracked(item) {
  return !!item && item.unit !== "service";
}
function getStatus(item) {
  if (!isTracked(item)) return null; // service item — stock not applicable
  const stock   = item.stock   ?? 0;
  const reorder = item.reorder ?? 3;
  if (stock === 0)      return "out";
  if (stock <= reorder) return "low";
  return "ok";
}

function StatusBadge({ item }) {
  const s = getStatus(item);
  if (s === null) {
    return (
      <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: NEUTRAL_BG, color: NEUTRAL }}>
        Service
      </span>
    );
  }
  const map = {
    ok:  { label: "In stock",     color: SUCCESS,  bg: SUCCESS_BG },
    low: { label: "Low stock",    color: WARNING,  bg: WARNING_BG },
    out: { label: "Out of stock", color: DANGER,   bg: DANGER_BG  },
  };
  const { label, color, bg } = map[s];
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: bg, color }}>
      {label}
    </span>
  );
}

function StockBar({ item }) {
  if (!isTracked(item)) return null; // services have no meaningful stock level
  const max   = Math.max(item.stock ?? 0, (item.reorder ?? 3) * 4, 10);
  const pct   = Math.min(100, Math.round(((item.stock ?? 0) / max) * 100));
  const s     = getStatus(item);
  const color = s === "out" ? DANGER : s === "low" ? WARNING : SUCCESS;
  return (
    <div style={{ height: 4, borderRadius: 2, background: BORDER, overflow: "hidden", marginTop: 5, width: "100%" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width .25s" }} />
    </div>
  );
}

function StatCard({ label, value, sub, valueColor, isMobile }) {
  return (
    <div style={{ background: CARD_BG, borderRadius: 8, padding: isMobile ? "10px 12px" : "12px 16px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: MUTED, marginBottom: 4, fontWeight: 600, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: valueColor || TEXT }}>{value}</div>
      {sub && !isMobile && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ModalShell({ title, onClose, children, isMobile }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.40)",
      display: "flex",
      alignItems: isMobile ? "flex-end" : "center",
      justifyContent: "center",
      zIndex: 200, padding: isMobile ? 0 : 16,
      overscrollBehavior: "contain",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff",
        borderRadius: isMobile ? "16px 16px 0 0" : 12,
        border: isMobile ? "none" : `1px solid ${BORDER}`,
        padding: isMobile ? "18px 16px" : 24,
        paddingBottom: isMobile ? `calc(18px + ${SAFE_BOTTOM})` : 24,
        width: isMobile ? "100%" : 380,
        maxWidth: "100%",
        maxHeight: isMobile ? "92dvh" : "85vh",
        overflowY: "auto", WebkitOverflowScrolling: "touch",
        fontFamily: FONT, boxSizing: "border-box",
      }}>
        {isMobile && (
          <div style={{ width: 38, height: 4, borderRadius: 2, background: BORDER, margin: "0 auto 14px" }} />
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{title}</span>
          {!isMobile && (
            <button onClick={onClose} style={{
              background: "none", border: `1px solid ${BORDER}`, borderRadius: 6,
              padding: "4px 10px", cursor: "pointer", fontFamily: FONT, fontSize: 12, color: MUTED,
            }}>✕</button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function StockView({ demoMode }) {
  const isMobile = useIsMobile();

  /* ── data state ── */
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  /* ── UI state ── */
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState("all");
  const [sortKey,  setSortKey]  = useState("name");
  const [sortDir,  setSortDir]  = useState("asc");
  const [modal,    setModal]    = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [toast,    setToast]    = useState(null);
  const [log,      setLog]      = useState([]);
  const [saving,   setSaving]   = useState(false);

  /* ── restock form ── */
  const [rsItem,   setRsItem]   = useState("");
  const [rsQty,    setRsQty]    = useState(10);
  const [rsReason, setRsReason] = useState(REORDER_REASONS[0]);

  /* ── edit form ── */
  const [edStock,   setEdStock]   = useState(0);
  const [edReorder, setEdReorder] = useState(3);
  const [edPrice,   setEdPrice]   = useState(0);

  const channelRef = useRef(null);

  /* ── shared styles that depend on breakpoint ── */
  const ghostBtn = {
    background: "none", border: `1px solid ${BORDER}`, borderRadius: 6,
    padding: isMobile ? "8px 14px" : "4px 10px", cursor: "pointer",
    fontFamily: FONT, fontSize: 12, color: MUTED, touchAction: "manipulation",
  };
  const primaryBtn = {
    background: DR, color: "#fff", border: "none", borderRadius: 6,
    padding: isMobile ? "11px 18px" : "8px 18px", cursor: "pointer",
    fontFamily: FONT, fontSize: 13, fontWeight: 700, touchAction: "manipulation",
  };
  const inputStyle = {
    width: "100%", padding: isMobile ? "10px 12px" : "8px 11px",
    border: `1px solid ${BORDER}`, borderRadius: 6,
    fontFamily: FONT, fontSize: noZoomFont(isMobile), color: TEXT, background: "#fff", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 12, color: MUTED, display: "block", marginBottom: 4, fontWeight: 600 };
  const rowStyle   = { marginBottom: 14 };
  const qtyBtn  = {
    width: isMobile ? 34 : 24, height: isMobile ? 34 : 24, borderRadius: 6, border: `1px solid ${BORDER}`,
    background: "#fff", cursor: "pointer", fontFamily: FONT, fontSize: isMobile ? 18 : 16,
    display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, color: TEXT,
    touchAction: "manipulation", flexShrink: 0,
  };

  /* ══ initial fetch + real-time ══ */
  useEffect(() => {
    fetchItems();
    setupRealtime();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  // Lock background scroll on mobile while any modal is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const lock = isMobile && modal !== null;
    const prev = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, modal]);

  async function fetchItems() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("menu_items")
        .select("id, name, category_id, price, available, stock, reorder, unit")
        .order("name");
      if (err) throw err;
      setItems(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function setupRealtime() {
    const channel = supabase
      .channel("stock-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        setItems(prev => {
          if (eventType === "INSERT") return [...prev, newRow].sort((a, b) => a.name.localeCompare(b.name));
          if (eventType === "DELETE") return prev.filter(i => i.id !== oldRow.id);
          if (eventType === "UPDATE") return prev.map(i => i.id === newRow.id ? newRow : i);
          return prev;
        });
      })
      .subscribe();
    channelRef.current = channel;
  }

  async function updateItemDB(id, patch) {
    // Optimistic: update UI immediately
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    try {
      const { error: err } = await supabase.from("menu_items").update(patch).eq("id", id);
      if (err) throw err;
    } catch (e) {
      await fetchItems(); // rollback
      showToast(`Save failed: ${e.message}`, "err");
    }
  }

  /* ── helpers ── */
  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  }

  function pushLog(entry) {
    setLog(prev => [{ ...entry, time: new Date() }, ...prev].slice(0, 100));
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function colHeader(key, label) {
    const active = sortKey === key;
    return (
      <span onClick={() => handleSort(key)} style={{ cursor: "pointer", userSelect: "none", fontWeight: active ? 800 : 600, color: active ? DR : MUTED }}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </span>
    );
  }

  async function adjust(item, delta) {
    const newStock = Math.max(0, (item.stock ?? 0) + delta);
    if (newStock === (item.stock ?? 0)) return;
    await updateItemDB(item.id, { stock: newStock });
    pushLog({ item: item.name, change: delta > 0 ? `+${delta}` : `${delta}`, result: newStock, reason: "Quick adjust" });
    showToast(`${item.name} → ${newStock} units`);
  }

  async function toggleAvail(item) {
    const next = !item.available;
    await updateItemDB(item.id, { available: next });
    pushLog({ item: item.name, change: "—", result: item.stock ?? 0, reason: next ? "Marked available" : "Marked hidden" });
    showToast(`${item.name} ${next ? "available" : "hidden"}`);
  }

  function openRestock() {
    const firstTracked = items.find(isTracked) ?? items[0];
    setRsItem(firstTracked?.id ?? "");
    setRsQty(10);
    setRsReason(REORDER_REASONS[0]);
    setModal("restock");
  }

  function openEdit(item) {
    setEditItem(item);
    setEdStock(item.stock ?? 0);
    setEdReorder(item.reorder ?? 3);
    setEdPrice(item.price ?? 0);
    setModal("edit");
  }

  async function doRestock() {
    const item = items.find(i => i.id === rsItem);
    if (!item || Number(rsQty) <= 0) return;
    setSaving(true);
    const newStock = (item.stock ?? 0) + Number(rsQty);
    await updateItemDB(item.id, { stock: newStock, available: true });
    pushLog({ item: item.name, change: `+${rsQty}`, result: newStock, reason: rsReason });
    showToast(`Restocked ${item.name} +${rsQty} → ${newStock}`);
    setSaving(false);
    setModal(null);
  }

  async function doEdit() {
    if (!editItem) return;
    setSaving(true);
    const prev  = editItem.stock ?? 0;
    const next  = Number(edStock);
    const patch = { stock: next, reorder: Number(edReorder), price: Number(edPrice) };
    await updateItemDB(editItem.id, patch);
    if (next !== prev) {
      const delta = next - prev;
      pushLog({ item: editItem.name, change: delta >= 0 ? `+${delta}` : `${delta}`, result: next, reason: "Manual edit" });
    }
    showToast(`${editItem.name} updated`);
    setSaving(false);
    setModal(null);
  }

  /* ── filtered + sorted rows ── */
  const rows = useMemo(() => {
    let list = [...items];
    const q = search.toLowerCase();
    if (q) list = list.filter(i => i.name?.toLowerCase().includes(q) || i.category_id?.toLowerCase().includes(q));
    if (filter === "out") list = list.filter(i => isTracked(i) && (i.stock ?? 0) === 0);
    if (filter === "low") list = list.filter(i => isTracked(i) && (i.stock ?? 0) > 0 && (i.stock ?? 0) <= (i.reorder ?? 3));
    list.sort((a, b) => {
      let av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
    return list;
  }, [items, search, filter, sortKey, sortDir]);

  // Only physically stock-tracked items (unit !== "load") count toward
  // out-of-stock / low-stock / inventory-value totals. Service items are
  // still counted in Total SKUs.
  const totalItems = items.length;
  const trackedItems = items.filter(isTracked);
  const serviceCount = totalItems - trackedItems.length;
  const outCount   = trackedItems.filter(i => (i.stock ?? 0) === 0).length;
  const lowCount   = trackedItems.filter(i => (i.stock ?? 0) > 0 && (i.stock ?? 0) <= (i.reorder ?? 3)).length;
  const invValue   = trackedItems.reduce((s, i) => s + (i.stock ?? 0) * (i.price ?? 0), 0);

  /* ══ RENDER ══ */
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: FONT, color: MUTED, flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 24, animation: "spin 1s linear infinite" }}>⟳</div>
      <div style={{ fontSize: 13 }}>Loading stock data…</div>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: FONT, flexDirection: "column", gap: 12, padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: DANGER }}>Failed to load stock data</div>
      <div style={{ fontSize: 12, color: MUTED }}>{error}</div>
      <button onClick={fetchItems} style={primaryBtn}>Retry</button>
    </div>
  );

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: isMobile ? "100dvh" : "100%",
      fontFamily: FONT, background: BG, overflow: "hidden",
    }}>

      {/* stat bar — 2×2 (+1) on phones, 5-up on desktop */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)",
        gap: 10, padding: isMobile ? "12px 14px 8px" : "14px 20px 10px", flexShrink: 0,
      }}>
        <StatCard isMobile={isMobile} label="Total SKUs"      value={totalItems}    sub={`${trackedItems.length - outCount - lowCount} healthy`} />
        <StatCard isMobile={isMobile} label="Out of stock"    value={outCount}      sub="need restocking"    valueColor={outCount > 0 ? DANGER  : TEXT} />
        <StatCard isMobile={isMobile} label="Low stock"       value={lowCount}      sub="at / below reorder" valueColor={lowCount > 0 ? WARNING : TEXT} />
        <StatCard isMobile={isMobile} label="Inventory value" value={fmt(invValue)} sub="at sell price" />
        <StatCard isMobile={isMobile} label="Services"        value={serviceCount}  sub="per-load, not stock-tracked" valueColor={NEUTRAL} />
      </div>

      {/* toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: isMobile ? "8px 14px" : "8px 20px",
        borderBottom: `1px solid ${BORDER}`, flexShrink: 0, flexWrap: "wrap",
      }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
          type="search" autoCorrect="off"
          style={{ ...inputStyle, width: isMobile ? "100%" : 200 }}
        />
        <div style={{
          display: "flex", gap: 6,
          overflowX: isMobile ? "auto" : "visible",
          WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
          flex: isMobile ? "1 1 100%" : "0 0 auto",
        }}>
          {[["all","All"],["low","Low stock"],["out","Out of stock"]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              ...ghostBtn, borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0,
              background: filter === k ? DR : "transparent",
              color:      filter === k ? "#fff" : MUTED,
              border:     `1px solid ${filter === k ? DR : BORDER}`,
              fontWeight: filter === k ? 700 : 400,
            }}>{label}</button>
          ))}
          {!isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: SUCCESS, marginLeft: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: SUCCESS, display: "inline-block" }} />
              Live
            </div>
          )}
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        <div style={{ display: "flex", gap: 8, flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
          <button onClick={() => setModal("log")} style={{ ...ghostBtn, flex: isMobile ? 1 : undefined }}>📋 Activity log</button>
          <button onClick={openRestock} style={{ ...primaryBtn, flex: isMobile ? 1 : undefined }}>+ Restock</button>
        </div>
      </div>

      {/* ── Items: card list on mobile, table on desktop ── */}
      {isMobile ? (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: `10px 14px calc(20px + ${SAFE_BOTTOM})` }}>
          {rows.length === 0 && (
            <div style={{ textAlign: "center", color: MUTED, padding: "40px 0", fontSize: 13 }}>No items match your search or filter.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(item => {
              const s = getStatus(item);
              const leftBorder = s === "out" ? DANGER : s === "low" ? WARNING : BORDER;
              return (
                <div key={item.id} style={{
                  background: "#fff", borderRadius: 10, padding: 14,
                  borderLeft: `4px solid ${leftBorder}`, border: `1px solid ${BORDER}`, borderLeftWidth: 4,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: TEXT, fontSize: 14, wordBreak: "break-word" }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 20, background: SUBTLE }}>{item.category_id || "—"}</span>
                        {"  ·  "}{fmt(item.price ?? 0)}
                        {item.unit ? ` / ${item.unit}` : ""}
                      </div>
                    </div>
                    <StatusBadge item={item} />
                  </div>

                  {isTracked(item) ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                        <button onClick={() => adjust(item, -1)} style={qtyBtn}>−</button>
                        <span style={{ minWidth: 32, textAlign: "center", fontWeight: 800, fontSize: 16, color: TEXT }}>{item.stock ?? 0}</span>
                        <button onClick={() => adjust(item, 1)} style={qtyBtn}>+</button>
                        <span style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>reorder @ {item.reorder ?? 3}</span>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => openEdit(item)} style={ghostBtn}>Edit</button>
                      </div>
                      <StockBar item={item} />
                    </>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", marginTop: 12 }}>
                      <span style={{ fontSize: 12, color: MUTED }}>Service item · stock not tracked</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => openEdit(item)} style={ghostBtn}>Edit</button>
                    </div>
                  )}

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 12 }}>
                    <span style={{ position: "relative", display: "inline-block", width: 38, height: 22, flexShrink: 0 }}>
                      <input type="checkbox" checked={item.available ?? true} onChange={() => toggleAvail(item)}
                        style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
                      <span style={{ position: "absolute", inset: 0, borderRadius: 20, background: item.available ? DR : BORDER, transition: "background .2s" }} />
                      <span style={{ position: "absolute", top: 3, left: item.available ? 18 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                    </span>
                    <span style={{ fontSize: 12, color: item.available ? SUCCESS : MUTED, fontWeight: 600 }}>
                      {item.available ? "Available" : "Hidden"}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
          {rows.length > 0 && (
            <div style={{ fontSize: 11, color: MUTED, padding: "12px 2px 0", textAlign: "center" }}>
              Showing {rows.length} of {items.length} items · updates live
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "18%" }} /><col style={{ width: "10%" }} /><col style={{ width: "9%" }} />
              <col style={{ width: "17%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} /><col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: "left", padding: "10px 8px 8px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 1 }}>{colHeader("name", "Item")}</th>
                <th style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: "left", padding: "10px 8px 8px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 1 }}>{colHeader("category_id", "Category")}</th>
                <th style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: "right", padding: "10px 8px 8px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 1 }}>{colHeader("price", "Price")}</th>
                <th style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: "left", padding: "10px 8px 8px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 1 }}>Qty</th>
                <th style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: "left", padding: "10px 8px 8px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 1 }}>{colHeader("stock", "Status")}</th>
                <th style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: "left", padding: "10px 8px 8px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 1 }}>{colHeader("reorder", "Reorder at")}</th>
                <th style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: "left", padding: "10px 8px 8px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 1 }}>Available</th>
                <th style={{ fontSize: 11, fontWeight: 700, color: MUTED, textAlign: "right", padding: "10px 8px 8px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: BG, zIndex: 1 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: MUTED, padding: "40px 0", fontSize: 13 }}>No items match your search or filter.</td></tr>
              )}
              {rows.map(item => {
                const s = getStatus(item);
                const leftBorder = s === "out" ? DANGER : s === "low" ? WARNING : "transparent";
                const tdStyle = { padding: "10px 8px", borderBottom: `1px solid ${BORDER}` };
                const tracked = isTracked(item);
                return (
                  <tr key={item.id}>
                    <td style={{ ...tdStyle, borderLeft: `3px solid ${leftBorder}` }}>
                      <div style={{ fontWeight: 700, color: TEXT }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>ID: {item.id}</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: SUBTLE, color: MUTED }}>
                        {item.category_id || "—"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: TEXT }}>{fmt(item.price ?? 0)}</td>
                    <td style={tdStyle}>
                      {tracked ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button onClick={() => adjust(item, -1)} style={qtyBtn}>−</button>
                            <span style={{ minWidth: 28, textAlign: "center", fontWeight: 800, fontSize: 14, color: TEXT }}>{item.stock ?? 0}</span>
                            <button onClick={() => adjust(item, 1)} style={qtyBtn}>+</button>
                          </div>
                          <StockBar item={item} />
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: MUTED }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}><StatusBadge item={item} /></td>
                    <td style={{ ...tdStyle, color: MUTED, fontWeight: 600 }}>{tracked ? `${item.reorder ?? 3} units` : "—"}</td>
                    <td style={tdStyle}>
                      <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                        <span style={{ position: "relative", display: "inline-block", width: 34, height: 20, flexShrink: 0 }}>
                          <input type="checkbox" checked={item.available ?? true} onChange={() => toggleAvail(item)}
                            style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
                          <span style={{ position: "absolute", inset: 0, borderRadius: 20, background: item.available ? DR : BORDER, transition: "background .2s" }} />
                          <span style={{ position: "absolute", top: 3, left: item.available ? 16 : 3, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                        </span>
                        <span style={{ fontSize: 12, color: item.available ? SUCCESS : MUTED, fontWeight: 600 }}>{item.available ? "On" : "Off"}</span>
                      </label>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button onClick={() => openEdit(item)} style={ghostBtn}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 0 && (
            <div style={{ fontSize: 11, color: MUTED, padding: "10px 0", textAlign: "right" }}>
              Showing {rows.length} of {items.length} items · updates live
            </div>
          )}
        </div>
      )}

      {/* ══ MODALS ══ */}

      {modal === "restock" && (
        <ModalShell title="Restock items" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={rowStyle}>
            <label style={labelStyle}>Item</label>
            <select value={rsItem} onChange={e => setRsItem(e.target.value)} style={inputStyle}>
              {items.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} {isTracked(i) ? `(stock: ${i.stock ?? 0})` : "(service — not stock-tracked)"}
                </option>
              ))}
            </select>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Quantity to add</label>
            <input type="number" min={1} inputMode="numeric" value={rsQty} onChange={e => setRsQty(e.target.value)} style={inputStyle} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Reason</label>
            <select value={rsReason} onChange={e => setRsReason(e.target.value)} style={inputStyle}>
              {REORDER_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          {rsItem && (() => {
            const found = items.find(i => i.id === rsItem);
            if (!found) return null;
            if (!isTracked(found)) {
              return (
                <div style={{ background: NEUTRAL_BG, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: NEUTRAL }}>
                  <strong>{found.name}</strong> is a service item (per {found.unit}) — restocking has no effect since it isn't stock-tracked.
                </div>
              );
            }
            return (
              <div style={{ background: INFO_BG, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: INFO }}>
                <strong>{found.name}</strong>: {found.stock ?? 0} → {(found.stock ?? 0) + Number(rsQty)} units
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 8, justifyContent: isMobile ? "stretch" : "flex-end" }}>
            <button onClick={() => setModal(null)} style={{ ...ghostBtn, flex: isMobile ? 1 : undefined, textAlign: "center" }}>Cancel</button>
            <button onClick={doRestock} disabled={saving} style={{ ...primaryBtn, flex: isMobile ? 1 : undefined, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Confirm restock"}
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "edit" && editItem && (
        <ModalShell title={`Edit — ${editItem.name}`} onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Category: <strong>{editItem.category_id || "—"}</strong> · ID: {editItem.id}
            {!isTracked(editItem) && <> · <span style={{ color: NEUTRAL, fontWeight: 700 }}>Service item (not stock-tracked)</span></>}
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Stock (units){!isTracked(editItem) ? " — not tracked for this item" : ""}</label>
            <input type="number" min={0} inputMode="numeric" value={edStock} onChange={e => setEdStock(e.target.value)} style={inputStyle} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Reorder point — alert when stock ≤ this</label>
            <input type="number" min={0} inputMode="numeric" value={edReorder} onChange={e => setEdReorder(e.target.value)} style={inputStyle} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Price (₱)</label>
            <input type="number" min={0} inputMode="decimal" value={edPrice} onChange={e => setEdPrice(e.target.value)} style={inputStyle} />
          </div>
          {isTracked(editItem) && Number(edStock) !== (editItem.stock ?? 0) && (
            <div style={{ background: WARNING_BG, borderRadius: 8, padding: "9px 13px", marginBottom: 14, fontSize: 12, color: WARNING }}>
              Stock will change from <strong>{editItem.stock ?? 0}</strong> → <strong>{edStock}</strong> units. This will be logged.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: isMobile ? "stretch" : "flex-end" }}>
            <button onClick={() => setModal(null)} style={{ ...ghostBtn, flex: isMobile ? 1 : undefined, textAlign: "center" }}>Cancel</button>
            <button onClick={doEdit} disabled={saving} style={{ ...primaryBtn, flex: isMobile ? 1 : undefined, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "log" && (
        <ModalShell title="Stock activity log" onClose={() => setModal(null)} isMobile={isMobile}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>Current session · {log.length} entries</div>
          {log.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 13, padding: "16px 0" }}>No stock changes yet this session.</div>
          ) : log.map((l, idx) => {
            const isPos = String(l.change).startsWith("+");
            const isNeg = String(l.change).startsWith("-");
            return (
              <div key={idx} style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "flex-start" : "center",
                justifyContent: "space-between", gap: isMobile ? 4 : 0,
                padding: "8px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12,
              }}>
                <div>
                  <div style={{ fontWeight: 700, color: TEXT }}>{l.item}</div>
                  <div style={{ color: MUTED, marginTop: 1 }}>{l.reason}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 800, color: isPos ? SUCCESS : isNeg ? DANGER : MUTED }}>{l.change}</span>
                  <span style={{ color: MUTED }}>→ {l.result}</span>
                  <span style={{ color: MUTED, fontSize: 11 }}>{l.time.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: isMobile ? "stretch" : "flex-end", marginTop: 16 }}>
            <button onClick={() => setModal(null)} style={{ ...ghostBtn, flex: isMobile ? 1 : undefined, textAlign: "center" }}>Close</button>
          </div>
        </ModalShell>
      )}

      {toast && (
        <div style={{
          position: "fixed", zIndex: 300,
          bottom: isMobile ? `calc(14px + ${SAFE_BOTTOM})` : 24,
          right: isMobile ? 14 : 24,
          left: isMobile ? 14 : "auto",
          textAlign: isMobile ? "center" : "left",
          background: toast.type === "err" ? DANGER_BG : SUCCESS_BG,
          color:      toast.type === "err" ? DANGER    : SUCCESS,
          border:    `1px solid ${toast.type === "err" ? DANGER : SUCCESS}`,
          borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, fontFamily: FONT,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
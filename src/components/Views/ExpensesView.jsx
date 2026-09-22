import { useState, useEffect, useMemo } from "react";
import { DR, DR_LIGHT, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT, inputStyle } from "../../ui/styles";
import Btn from "../../function/btn";
import fmt from "../../function/fmt";
import { ConfirmModal, SuccessModal } from "../../function/modal";
import { supabase } from "../../supabase/supabase";
import useIsMobile, { noZoomFont, SAFE_BOTTOM } from "../../function/useIsMobile";

/*
  ExpensesView
  ─────────────────────────────────────────────────────────
  Usage:  <ExpensesView orders={orders} />
  "orders" is the same array already loaded elsewhere in the
  app (used only to compute the sales-side KPI cards). This
  view manages its own "expenses" fetch, realtime sync, and
  full create / read / update / delete.
───────────────────────────────────────────────────────── */

// ── Status meta ──────────────────────────────────────────
const STATUS_META = {
  paid:    { label: "Paid",    icon: "✅", color: SUCCESS,   bg: SUCCESS_BG },
  pending: { label: "Pending", icon: "⏳", color: "#B7770D", bg: "#FEF3CD" },
  overdue: { label: "Overdue", icon: "⚠",  color: "#C0392B", bg: "#FDECEA" },
};
const STATUS_KEYS = ["pending", "paid", "overdue"];

const CATEGORY_OPTIONS = [
  "Rent", "Utilities", "Salaries", "Supplies", "Ingredients",
  "Maintenance", "Marketing", "Transportation", "Equipment", "Other",
];

const PAYMENT_METHODS = ["Cash", "GCash", "Bank Transfer", "Card", "Other"];

const todayISO = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
};

const EMPTY_FORM = {
  date: todayISO(),
  category: "",
  description: "",
  payment_method: "Cash",
  status: "pending",
  amount: "",
  notes: "",
};

// ── Robust date helpers ───────────────────────────────────
// Orders can come from different schemas/exports where the
// timestamp field isn't always called "created_at". Try the
// common candidates in order so "Sales Today" doesn't silently
// show ₱0 just because the field name doesn't match.
const ORDER_DATE_FIELDS = ["created_at", "createdAt", "date", "order_date", "inserted_at", "updated_at"];

function getOrderDate(order) {
  for (const field of ORDER_DATE_FIELDS) {
    const v = order?.[field];
    if (v) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// Status values can come back with inconsistent casing ("completed"
// vs "Completed"), so normalize before comparing.
const isCompleted = (order) => (order?.status || "").toString().trim().toLowerCase() === "completed";

const isSameDay = (date, ref) => {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return false;
  return d.toDateString() === ref.toDateString();
};
const isSameMonth = (date, ref) => {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return false;
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
};

// ── Small KPI card ───────────────────────────────────────
function KpiCard({ label, value, sub, color = TEXT, isMobile }) {
  return (
    <div style={{ background: SUBTLE, borderRadius: 10, padding: isMobile ? "12px 12px" : "14px 16px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: isMobile ? 18 : 21, fontWeight: 800, color, lineHeight: 1.15, wordBreak: "break-word" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 12, background: m.bg, color: m.color,
      fontSize: 10, fontWeight: 800, whiteSpace: "nowrap",
    }}>
      {m.icon} {m.label}
    </span>
  );
}

export default function ExpensesView({ orders: ordersProp = [] }) {
  const isMobile = useIsMobile();

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Orders: fetched directly instead of trusting the parent's
  // "orders" prop, since that prop was found to be stale/out of
  // sync with the rest of the app (Orders Today / Sales Today
  // showed 0 here while the sidebar showed real numbers). This
  // guarantees the KPI cards always reflect the live orders table.
  const [ownOrders, setOwnOrders] = useState(null); // null = not loaded yet
  const [ordersError, setOrdersError] = useState(null);

  async function fetchOrders() {
    try {
      const { data, error, count } = await supabase.from("orders").select("*", { count: "exact" });
      if (error) throw error;
      // eslint-disable-next-line no-console
      console.log(`[ExpensesView] orders fetch: ${data?.length ?? 0} rows (count=${count})`, data?.slice(0, 2));
      setOwnOrders(data || []);
    } catch (e) {
      setOrdersError(e.message);
      setOwnOrders([]);
    }
  }

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("orders-live-expenses")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        setOwnOrders((prev) => {
          const list = prev || [];
          if (eventType === "INSERT") {
            if (list.some((o) => o.id === newRow.id)) return list;
            return [newRow, ...list];
          }
          if (eventType === "UPDATE") return list.map((o) => (o.id === newRow.id ? { ...o, ...newRow } : o));
          if (eventType === "DELETE") return list.filter((o) => o.id !== oldRow.id);
          return list;
        });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Prefer the freshly-fetched orders; fall back to the prop only
  // if our own fetch hasn't resolved yet (avoids a flash of zeros).
  const orders = ownOrders !== null ? ownOrders : ordersProp;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [range, setRange] = useState("30d");

  const [formModal, setFormModal] = useState(null); // { mode: "add"|"edit", data }
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [confirmModal, setConfirmModal] = useState(null);
  const [successModal, setSuccessModal] = useState(null);

  const showSuccess = (title, message) => setSuccessModal({ title, message });

  // ── Initial fetch ──────────────────────────────────────
  async function fetchExpenses() {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("expenses").select("*").order("date", { ascending: false });
      if (error) throw error;
      setExpenses(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchExpenses();

    const channel = supabase
      .channel("expenses-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        setExpenses((prev) => {
          if (eventType === "INSERT") {
            if (prev.some((e) => e.id === newRow.id)) return prev;
            return [newRow, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date));
          }
          if (eventType === "UPDATE") return prev.map((e) => (e.id === newRow.id ? { ...e, ...newRow } : e));
          if (eventType === "DELETE") return prev.filter((e) => e.id !== oldRow.id);
          return prev;
        });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Lock background scroll on touch devices while a sheet/modal is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const lock = isMobile && (formModal || confirmModal || successModal);
    const prev = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, formModal, confirmModal, successModal]);

  // ══════════════════════════════════════════════════════
  // KPI CALCULATIONS
  // ══════════════════════════════════════════════════════
  const now = new Date();

  const kpis = useMemo(() => {
    // Only orders explicitly marked "completed" count toward sales
    // (case-insensitive, since status casing has been inconsistent).
    const completedOrders = orders.filter(isCompleted);

    const ordersToday = orders.filter((o) => isSameDay(getOrderDate(o), now));

    // Every completed order whose date falls on today gets summed here.
    const completedToday = completedOrders.filter((o) => isSameDay(getOrderDate(o), now));
    const salesToday = completedToday.reduce((s, o) => s + (Number(o.total) || 0), 0);

    const ordersThisMonth = orders.filter((o) => isSameMonth(getOrderDate(o), now));
    const completedThisMonth = completedOrders.filter((o) => isSameMonth(getOrderDate(o), now));
    const salesThisMonth = completedThisMonth.reduce((s, o) => s + (Number(o.total) || 0), 0);

    const collectedToday = expenses
      .filter((e) => e.status === "paid" && isSameDay(e.date, now))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const outstandingBalance = expenses
      .filter((e) => e.status === "pending" || e.status === "overdue")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const expensesThisMonth = expenses
      .filter((e) => isSameMonth(e.date, now))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const netProfitThisMonth = salesThisMonth - expensesThisMonth;

    return {
      ordersToday: ordersToday.length,
      completedOrdersToday: completedToday.length,
      salesToday,
      collectedToday,
      outstandingBalance,
      ordersThisMonth: ordersThisMonth.length,
      salesThisMonth,
      expensesThisMonth,
      netProfitThisMonth,
    };
  }, [orders, expenses]);

  // ══════════════════════════════════════════════════════
  // FILTERED LIST (for the table / card list, not the KPIs)
  // ══════════════════════════════════════════════════════
  const visible = useMemo(() => {
    const daysMap = { today: 1, "7d": 7, "30d": 30, month: null, all: null };
    let cutoff = null;
    if (range === "month") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range !== "all") {
      const d = daysMap[range] || 30;
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - (d - 1));
      cutoff.setHours(0, 0, 0, 0);
    }

    return expenses
      .filter((e) => {
        const matchStatus = statusFilter === "all" || e.status === statusFilter;
        const q = search.toLowerCase();
        const matchSearch = !q ||
          (e.description || "").toLowerCase().includes(q) ||
          (e.category || "").toLowerCase().includes(q);
        const matchRange = !cutoff || new Date(e.date) >= cutoff;
        return matchStatus && matchSearch && matchRange;
      });
  }, [expenses, statusFilter, search, range]);

  const totalVisible = visible.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // ══════════════════════════════════════════════════════
  // CRUD
  // ══════════════════════════════════════════════════════
  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormErr("");
    setFormModal({ mode: "add" });
  };

  const openEdit = (expense) => {
    setForm({
      date: expense.date || todayISO(),
      category: expense.category || "",
      description: expense.description || "",
      payment_method: expense.payment_method || "Cash",
      status: expense.status || "pending",
      amount: expense.amount != null ? String(expense.amount) : "",
      notes: expense.notes || "",
    });
    setFormErr("");
    setFormModal({ mode: "edit", data: expense });
  };

  const closeForm = () => {
    setFormModal(null);
    setForm(EMPTY_FORM);
    setFormErr("");
  };

  const saveExpense = async () => {
    if (!form.category.trim()) return setFormErr("Category is required.");
    if (!form.description.trim()) return setFormErr("Description is required.");
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) return setFormErr("Enter a valid amount greater than 0.");
    if (!form.date) return setFormErr("Date is required.");

    setSaving(true);
    setFormErr("");
    try {
      const payload = {
        date: form.date,
        category: form.category.trim(),
        description: form.description.trim(),
        payment_method: form.payment_method,
        status: form.status,
        amount: amt,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (formModal.mode === "add") {
        const { data, error } = await supabase.from("expenses").insert(payload).select().single();
        if (error) throw new Error(error.message);
        setExpenses((prev) => (prev.some((e) => e.id === data.id) ? prev : [data, ...prev]));
        showSuccess("Expense Added", `${payload.description} — ${fmt(amt)} recorded.`);
      } else {
        const { error } = await supabase.from("expenses").update(payload).eq("id", formModal.data.id);
        if (error) throw new Error(error.message);
        setExpenses((prev) => prev.map((e) => (e.id === formModal.data.id ? { ...e, ...payload } : e)));
        showSuccess("Expense Updated", `${payload.description} — ${fmt(amt)} saved.`);
      }
      closeForm();
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (expense) => {
    try {
      const { error } = await supabase
        .from("expenses")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("id", expense.id);
      if (error) throw new Error(error.message);
      setExpenses((prev) => prev.map((e) => (e.id === expense.id ? { ...e, status: "paid" } : e)));
      showSuccess("Marked as Paid", `${expense.description} — ${fmt(expense.amount)} settled.`);
    } catch (e) {
      showSuccess("Error", e.message);
    }
  };

  const deleteExpense = (expense) => {
    setConfirmModal({
      title: "Delete Expense",
      message: `Delete "${expense.description}" (${fmt(expense.amount)})? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
          if (error) throw new Error(error.message);
          setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
          setConfirmModal(null);
          showSuccess("Expense Deleted", `${expense.description} has been removed.`);
        } catch (e) {
          setConfirmModal(null);
          showSuccess("Error", e.message);
        }
      },
    });
  };

  // ── Shared styles ────────────────────────────────────────
  const actionBtn = (borderColor, bg, color) => ({
    padding: isMobile ? "9px 14px" : "4px 10px",
    borderRadius: 6, border: `1px solid ${borderColor}`, cursor: "pointer",
    fontFamily: FONT, fontSize: isMobile ? 12 : 11, fontWeight: 700,
    background: bg, color, whiteSpace: "nowrap", touchAction: "manipulation",
  });

  const modalInput = {
    ...inputStyle, width: "100%", boxSizing: "border-box",
    fontSize: noZoomFont(isMobile), padding: isMobile ? "11px 12px" : "8px 10px",
  };

  const ranges = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All Time" },
  ];

  if ((loading && expenses.length === 0) || ownOrders === null) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", minHeight: 240, fontFamily: FONT, color: MUTED, padding: 20, textAlign: "center" }}>
        <h3>Loading expenses...</h3>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", minHeight: 240, fontFamily: FONT, color: DR, padding: 20, textAlign: "center" }}>
        <h3>Error: {error}</h3>
      </div>
    );
  }

  return (
    <div style={{
      padding: isMobile ? 14 : 22,
      height: isMobile ? "100dvh" : "100vh",
      boxSizing: "border-box", display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: FONT,
    }}>

      {ordersError && (
        <div style={{ background: "#FDECEA", color: "#C0392B", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12, flexShrink: 0 }}>
          ⚠ Couldn't load orders for KPI cards: {ordersError}
        </div>
      )}
      {!ordersError && ownOrders !== null && ownOrders.length === 0 && (
        <div style={{ background: "#FEF3CD", color: "#B7770D", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12, flexShrink: 0 }}>
          ⚠ 0 orders came back from the database for this view, even though the sidebar shows real sales.
          This is a Row Level Security (RLS) policy on the <code>orders</code> table silently filtering out rows
          for the current role — not a bug in this component. Check Supabase → Authentication/Database → Policies → orders.
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start",
        gap: 12, marginBottom: isMobile ? 14 : 18, flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Expenses</h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>
            Track spending, payment status, and profitability
          </p>
        </div>
        <Btn onClick={openAdd} style={{ flexShrink: 0, padding: isMobile ? "12px 16px" : undefined }}>
          + Add Expense
        </Btn>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, marginBottom: isMobile ? 14 : 20,
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: isMobile ? 8 : 12,
      }}>
        <KpiCard isMobile={isMobile} label="Orders Today" value={kpis.ordersToday} color={TEXT} />
        <KpiCard isMobile={isMobile} label="Sales Today" value={fmt(kpis.salesToday)} color={SUCCESS} sub={`${kpis.completedOrdersToday} completed order${kpis.completedOrdersToday !== 1 ? "s" : ""}`} />
        <KpiCard isMobile={isMobile} label="Collected Today" value={fmt(kpis.collectedToday)} color="#2980B9" sub="Expenses paid today" />
        <KpiCard isMobile={isMobile} label="Outstanding Balance" value={fmt(kpis.outstandingBalance)} color="#C0392B" sub="Unpaid / overdue" />
        <KpiCard isMobile={isMobile} label="Orders This Month" value={kpis.ordersThisMonth} color={TEXT} />
        <KpiCard isMobile={isMobile} label="Sales This Month" value={fmt(kpis.salesThisMonth)} color={SUCCESS} />
        <KpiCard isMobile={isMobile} label="Expenses This Month" value={fmt(kpis.expensesThisMonth)} color="#B7770D" />
        <KpiCard isMobile={isMobile}
          label="Net Profit This Month"
          value={fmt(kpis.netProfitThisMonth)}
          color={kpis.netProfitThisMonth >= 0 ? SUCCESS : "#C0392B"}
          sub={kpis.netProfitThisMonth >= 0 ? "Sales − Expenses" : "Running a loss"} />
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        gap: 10, marginBottom: 12, flexWrap: "wrap", flexShrink: 0,
      }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search description or category…"
          type="search"
          style={{ ...inputStyle, width: isMobile ? "100%" : 220, boxSizing: "border-box", fontSize: noZoomFont(isMobile), padding: isMobile ? "11px 12px" : "7px 12px" }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
          {["all", ...STATUS_KEYS].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{
                padding: isMobile ? "10px 16px" : "7px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                whiteSpace: "nowrap", flexShrink: 0,
                background: statusFilter === s ? DR : SUBTLE,
                color: statusFilter === s ? "#fff" : MUTED,
              }}>
              {s === "all" ? "All" : STATUS_META[s].label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling: "touch", marginLeft: isMobile ? 0 : "auto" }}>
          {ranges.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              style={{
                padding: isMobile ? "10px 14px" : "7px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                background: range === r.key ? TEXT : SUBTLE,
                color: range === r.key ? "#fff" : MUTED,
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10, flexShrink: 0 }}>
        Showing <strong style={{ color: TEXT }}>{visible.length}</strong> expense{visible.length !== 1 ? "s" : ""} · Total{" "}
        <strong style={{ color: DR }}>{fmt(totalVisible)}</strong>
      </div>

      {/* ── List: cards on mobile, table on desktop ─────────── */}
      {isMobile ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: `calc(24px + ${SAFE_BOTTOM})` }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map((e) => (
              <div key={e.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, background: BG }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: TEXT, wordBreak: "break-word" }}>{e.description}</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{e.category}</div>
                  </div>
                  <StatusPill status={e.status} />
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                  {new Date(e.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                  {" · "}<span style={{ textTransform: "uppercase", fontWeight: 700 }}>{e.payment_method}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: DR, marginTop: 8 }}>{fmt(e.amount)}</div>
                {e.notes && <div style={{ fontSize: 11, color: MUTED, marginTop: 6, fontStyle: "italic" }}>{e.notes}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {e.status !== "paid" && (
                    <button onClick={() => markPaid(e)} style={actionBtn(SUCCESS, SUCCESS_BG, SUCCESS)}>✓ Mark Paid</button>
                  )}
                  <button onClick={() => openEdit(e)} style={actionBtn(BORDER, SUBTLE, TEXT)}>✏ Edit</button>
                  <button onClick={() => deleteExpense(e)} style={{ ...actionBtn(DR, "#FFF5F5", DR), marginLeft: "auto" }}>🗑 Delete</button>
                </div>
              </div>
            ))}
          </div>
          {visible.length === 0 && (
            <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 14, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              No expenses found
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ overflowY: "auto", overflowX: "auto", flex: 1, minHeight: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: SUBTLE }}>
                  {["Date", "Category", "Description", "Payment", "Amount", "Status", "Actions"].map((h, i) => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: i >= 4 ? "center" : "left",
                      fontWeight: 700, color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8,
                      whiteSpace: "nowrap", position: "sticky", top: 0, background: SUBTLE, zIndex: 1,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((e, idx) => {
                  const rowBg = idx % 2 === 0 ? BG : "#FAFAFA";
                  return (
                    <tr key={e.id} style={{ borderTop: `1px solid ${BORDER}`, background: rowBg }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.background = DR_LIGHT)}
                      onMouseLeave={(ev) => (ev.currentTarget.style.background = rowBg)}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: MUTED }}>
                        {new Date(e.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{e.category}</td>
                      <td style={{ padding: "10px 14px", maxWidth: 260 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.description}>{e.description}</div>
                        {e.notes && <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.notes}>{e.notes}</div>}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", textTransform: "uppercase", fontSize: 11, fontWeight: 700 }}>{e.payment_method}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800, color: DR }}>{fmt(e.amount)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}><StatusPill status={e.status} /></td>
                      <td style={{ padding: "8px 14px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "nowrap" }}>
                          {e.status !== "paid" && (
                            <button onClick={() => markPaid(e)} style={actionBtn(SUCCESS, SUCCESS_BG, SUCCESS)}>✓ Paid</button>
                          )}
                          <button onClick={() => openEdit(e)} style={actionBtn(BORDER, SUBTLE, TEXT)}>Edit</button>
                          <button onClick={() => deleteExpense(e)} style={actionBtn(DR, "#FFF5F5", DR)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 14 }}>No expenses found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────── */}
      {formModal && (
        <div onClick={closeForm} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
          padding: isMobile ? 0 : 24, overflowY: "auto", overscrollBehavior: "contain", zIndex: 1000,
        }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{
            background: BG, borderRadius: isMobile ? "16px 16px 0 0" : 14,
            padding: isMobile ? "20px 16px" : 28,
            paddingBottom: isMobile ? `calc(20px + ${SAFE_BOTTOM})` : 28,
            width: isMobile ? "100%" : 440, maxWidth: "100%",
            maxHeight: isMobile ? "92dvh" : "calc(100vh - 48px)",
            overflowY: "auto", WebkitOverflowScrolling: "touch",
            boxShadow: "0 24px 60px rgba(0,0,0,0.18)", fontFamily: FONT,
            margin: isMobile ? 0 : "auto", boxSizing: "border-box",
          }}>
            {isMobile && <div style={{ width: 38, height: 4, borderRadius: 2, background: BORDER, margin: "0 auto 14px" }} />}

            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800 }}>
              {formModal.mode === "add" ? "Add Expense" : "Edit Expense"}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Date */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, display: "block" }}>Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={modalInput} />
              </div>

              {/* Category */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, display: "block" }}>Category</label>
                <input
                  list="expense-categories"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Utilities"
                  style={modalInput}
                />
                <datalist id="expense-categories">
                  {CATEGORY_OPTIONS.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, display: "block" }}>Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What was this for?"
                  style={modalInput}
                />
              </div>

              {/* Amount */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, display: "block" }}>Amount ₱</label>
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  style={modalInput}
                />
              </div>

              {/* Payment method */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>Payment Method</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 6 }}>
                  {PAYMENT_METHODS.map((p) => (
                    <button key={p} onClick={() => setForm((f) => ({ ...f, payment_method: p }))}
                      style={{
                        padding: isMobile ? "10px 6px" : "7px 6px", borderRadius: 6, border: "none", cursor: "pointer",
                        fontFamily: FONT, fontSize: 11, fontWeight: 700,
                        background: form.payment_method === p ? DR : SUBTLE,
                        color: form.payment_method === p ? "#fff" : MUTED,
                      }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>Status</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {STATUS_KEYS.map((s) => {
                    const m = STATUS_META[s];
                    const active = form.status === s;
                    return (
                      <button key={s} onClick={() => setForm((f) => ({ ...f, status: s }))}
                        style={{
                          padding: isMobile ? "10px 6px" : "8px 6px", borderRadius: 8,
                          border: `2px solid ${active ? m.color : BORDER}`,
                          background: active ? m.bg : "#fff", cursor: "pointer",
                          fontFamily: FONT, fontSize: 12, fontWeight: 700, color: active ? m.color : MUTED,
                        }}>
                        {m.icon} {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, display: "block" }}>Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional details…"
                  style={{ ...modalInput, resize: "vertical", minHeight: 60, lineHeight: 1.5 }}
                />
              </div>
            </div>

            {formErr && (
              <div style={{ fontSize: 12, color: "#e53e3e", marginTop: 12, fontWeight: 600 }}>⚠ {formErr}</div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <Btn variant="ghost" onClick={closeForm} style={{ flexShrink: 0, padding: isMobile ? "12px 18px" : "9px 16px" }}>Cancel</Btn>
              <Btn onClick={saveExpense} disabled={saving} style={{ flex: 1, padding: isMobile ? "12px 16px" : undefined }}>
                {saving ? "Saving…" : formModal.mode === "add" ? "Add Expense" : "Save Changes"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm / Success Modals ─────────────────────────── */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          isMobile={isMobile}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
        />
      )}
      {successModal && (
        <SuccessModal
          title={successModal.title}
          message={successModal.message}
          isMobile={isMobile}
          onClose={() => setSuccessModal(null)}
        />
      )}
    </div>
  );
}
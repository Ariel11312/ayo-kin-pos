import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { getCategories } from "./data/category"
import { getItems } from "./data/items"
import { getOrders } from "./data/orders"
import { DR, BG, TEXT, MUTED, BORDER, SUCCESS, FONT } from "../ui/styles"
import fmt from "../function/fmt"
import POSView from "./Views/POSView";
import MenuView from "./Views/MenuView";
import OrdersView from "./Views/OrderView";
import VoidRefundView from "./Views/VoidRefundView";
import StatisticsView from "./Views/StatisticsView";
import StockView from "./Views/StockView";
import EmployeeTimeView from "./Views/EmplyeeTimeView";
import CalendarView from "./Views/CalendarView";
import ExpensesView from "./Views/ExpensesView";
import PromoView from "./Views/PromoView";
import RiderScannerView from "./Views/RiderScanView";
import KioskQR from "./Views/Kiosqr";

const LOGO_RED = "#C81E1E";

const PENDING_COLOR = "#FCD34D";
const PAID_COLOR = "#86EFAC";
const GCASH_COLOR = "#60A5FA";

/* ───────────────────────── Pure helpers ───────────────────────── */

// Is date `d` on the same calendar day as `ref`?
const isSameDay = (d, ref) => !!d && new Date(d).toDateString() === ref.toDateString();

// Was date `d` before the start of `ref`'s day?
const isBeforeDay = (d, ref) => {
  if (!d) return false;
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  return new Date(d) < start;
};

// The moment an order was actually PAID.
// paid_at is set by the DB trigger when status becomes 'completed'.
// We deliberately do NOT fall back to updated_at: any edit would make an
// old order look like it was "paid today". created_at is the safe fallback
// (an old completed order with no paid_at will never count as paid today).
const paidDate = (o) => o.paid_at || o.completed_at || o.created_at;

const isGcash = (o) =>
  String(o.payment_method || o.paymentMethod || o.payment || "")
    .toLowerCase()
    .includes("gcash");

const sumTotal = (list) => list.reduce((s, o) => s + (Number(o.total) || 0), 0);

// Compute all sidebar / top-bar numbers in one place.
function computeStats(allOrders, now) {
  // 1) Orders created today and already completed
  const todayCompleted = allOrders.filter(
    (o) => o.status === "completed" && isSameDay(o.created_at, now)
  );
  const todayGcashOrders = todayCompleted.filter(isGcash);
  const todayGcashTotal = sumTotal(todayGcashOrders);
  const todayCashOrders = todayCompleted.filter((o) => !isGcash(o));
  const todaySales = sumTotal(todayCashOrders);

  // 2) Old orders (created before today) that were PAID today
  const collectedOldToday = allOrders.filter(
    (o) =>
      o.status === "completed" &&
      isBeforeDay(o.created_at, now) &&
      isSameDay(paidDate(o), now)
  );
  const collectedOldTotal = sumTotal(collectedOldToday);

  // 3) Grand total = everything actually collected today
  const grandTotal = todaySales + todayGcashTotal + collectedOldTotal;
  const grandTotalCount =
    todayCashOrders.length + todayGcashOrders.length + collectedOldToday.length;

  // 4) GCash portion of Grand Total (info only)
  const gcashOrdersToday = [...todayGcashOrders, ...collectedOldToday.filter(isGcash)];
  const gcashTotal = sumTotal(gcashOrdersToday);

  // 5) Unpaid old credits (created before today, still pending)
  const unpaidCreditsOrders = allOrders.filter(
    (o) => o.status === "pending" && isBeforeDay(o.created_at, now)
  );
  const unpaidCreditsTotal = sumTotal(unpaidCreditsOrders);

  // 6) Pending created today
  const pendingTodayOrders = allOrders.filter(
    (o) => o.status === "pending" && isSameDay(o.created_at, now)
  );
  const pendingTodayTotal = sumTotal(pendingTodayOrders);

  // 7) All pending (any date)
  const pendingTotal = sumTotal(allOrders.filter((o) => o.status === "pending"));

  // 8) Orders created today
  const ordersTodayCount = allOrders.filter((o) => isSameDay(o.created_at, now)).length;

  return {
    todayCashOrders, todaySales,
    todayGcashOrders, todayGcashTotal,
    collectedOldToday, collectedOldTotal,
    grandTotal, grandTotalCount,
    gcashOrdersToday, gcashTotal,
    unpaidCreditsOrders, unpaidCreditsTotal,
    pendingTodayOrders, pendingTodayTotal,
    pendingTotal, ordersTodayCount,
  };
}

const rowStyle = (mb = 4) => ({
  display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: mb,
});

/* ───────────────────────── Logo bits ───────────────────────── */

function ChromeText({ children, fontSize, letterSpacing = "0.5px" }) {
  return (
    <span
      style={{
        fontFamily: FONT,
        fontWeight: 800,
        fontSize,
        letterSpacing,
        lineHeight: 1,
        backgroundImage:
          "linear-gradient(180deg, #ffffff 0%, #cfe7ee 28%, #7fa9b4 48%, #ffffff 62%, #9fc2cc 80%, #ffffff 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        textShadow:
          "0 1px 0 rgba(255,255,255,0.6), 0 -1px 1px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.45)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function PowerBadge({ size }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        margin: "0 3px",
        flexShrink: 0,
        background: "radial-gradient(circle at 35% 30%, #3a3a3a, #0c0c0c 70%)",
        boxShadow: `0 0 0 1.5px rgba(255,255,255,0.15), 0 0 ${size * 0.6}px ${LOGO_RED}99, inset 0 1px 2px rgba(255,255,255,0.15)`,
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M12 3v8" stroke={LOGO_RED} strokeWidth="2.4" strokeLinecap="round" />
        <path
          d="M7 6.5a8 8 0 1 0 10 0"
          stroke={LOGO_RED}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

/* ───────────────────────── App ───────────────────────── */

export default function App() {
  const navigate = useNavigate();
  const [view, setView] = useState(() => localStorage.getItem("pos_view") || "pos");
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_config") || "{}"); } catch { return {}; }
  });
  const [demoMode, setDemoMode] = useState(false);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // ── Initial data loads ──
  useEffect(() => {
    (async () => {
      const data = await getCategories();
      setCategories(data || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const data = await getItems();
      setItems(data || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const data = await getOrders();
      setOrders(data || []);
    })();
  }, []);

  // ── Keep orders in sync (any device) via Supabase realtime + 60s backup poll ──
  useEffect(() => {
    let timer;
    let cancelled = false;

    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const data = await getOrders();
          if (!cancelled) setOrders(data || []);
        } catch (e) {
          console.error("Orders refresh failed:", e);
        }
      }, 300); // debounce bursts of events
    };

    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refetch)
      .subscribe();

    const poll = setInterval(refetch, 60000);

    // Refresh when the tab becomes visible again (phone sleep, tab switch)
    const onVisible = () => { if (document.visibilityState === "visible") refetch(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => { setDemoMode(!config.supabaseUrl || !config.supabaseKey); }, [config]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 860) setMobileNavOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleSetView = (key) => {
    setView(key);
    localStorage.setItem("pos_view", key);
    setMobileNavOpen(false);
  };

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    setLoggingOut(false);
    setShowLogoutConfirm(false);
    navigate("/", { replace: true });
  }

  const navItems = [
    { key: "pos", emoji: "🧾", label: "Sales / POS" },
    { key: "menu", emoji: "📋", label: "Menu Setup" },
    { key: "orders", emoji: "📦", label: "Orders" },
    { key: "riderScanner", emoji: "🛵", label: "Rider Scanner" },
    { key: "stock", emoji: "🗃️", label: "Stock" },
    { key: "expenses", emoji: "💸", label: "Expenses" },
    { key: "promo", emoji: "🎟️", label: "Promo Codes" },
    { key: "statistics", emoji: "📈", label: "Statistics" },
    { key: "voidRefund", emoji: "↩", label: "Void / Refund" },
    { key: "timeClock", emoji: "🕒", label: "Time Clock" },
    { key: "calendar", emoji: "📅", label: "Calendar" },
    { key: "kiosqr", emoji: "📱", label: "Kiosk QR" },
  ];

  // Recompute only when orders change or the calendar day rolls over
  // (not every second when the clock ticks).
  const todayKey = clock.toDateString();
  const stats = useMemo(
    () => computeStats(orders || [], new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, todayKey]
  );

  const {
    todayCashOrders, todaySales,
    todayGcashOrders, todayGcashTotal,
    collectedOldToday, collectedOldTotal,
    grandTotal, grandTotalCount,
    gcashOrdersToday, gcashTotal,
    unpaidCreditsOrders, unpaidCreditsTotal,
    pendingTodayOrders, pendingTodayTotal,
    pendingTotal, ordersTodayCount,
  } = stats;

  return (
    <div style={{ fontFamily: FONT, background: BG, color: TEXT }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        body { margin: 0 !important; padding: 0 !important; }
        * { box-sizing: border-box; }

        .app-shell { display: flex; height: 100vh; overflow: hidden; }

        .sidebar {
          width: 220px;
          background: ${DR};
          color: #fff;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          height: 100vh;
          min-height: 0;
          overflow: hidden;
        }

        /* Regions: header fixed, nav flexes+scrolls, footer fixed+capped. */
        .sidebar-header { flex-shrink: 0; }
        .sidebar-nav {
          flex: 1 1 0;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
        .sidebar-footer {
          flex-shrink: 0;
          max-height: 48vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        .sidebar-nav::-webkit-scrollbar,
        .sidebar-footer::-webkit-scrollbar { width: 6px; }
        .sidebar-nav::-webkit-scrollbar-thumb,
        .sidebar-footer::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.25);
          border-radius: 3px;
        }
        .sidebar-nav::-webkit-scrollbar-track,
        .sidebar-footer::-webkit-scrollbar-track { background: transparent; }

        .main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

        .hamburger-btn { display: none; }
        .sidebar-close-btn { display: none; }
        .sidebar-backdrop { display: none; }

        @media (max-width: 860px) {
          .sidebar {
            position: fixed;
            top: 0; left: 0; bottom: 0;
            z-index: 1200;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: 4px 0 24px rgba(0,0,0,0.3);
            height: 100vh;
          }
          .sidebar.open { transform: translateX(0); }

          .sidebar-backdrop {
            display: none;
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 1100;
          }
          .sidebar-backdrop.open { display: block; }

          .hamburger-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 34px; height: 34px;
            border-radius: 7px;
            border: 1px solid ${BORDER};
            background: #fff;
            cursor: pointer;
            font-size: 16px;
            flex-shrink: 0;
          }

          .sidebar-close-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px; height: 28px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.3);
            background: rgba(255,255,255,0.1);
            color: #fff;
            cursor: pointer;
            font-size: 14px;
          }

          .topbar-orders-label { display: none; }
          .topbar { padding: 0 14px !important; }
          .topbar-title { font-size: 13.5px !important; }
          .content-area { padding-bottom: env(safe-area-inset-bottom); }
        }

        @media (max-width: 480px) {
          .sidebar { width: 250px; }
        }
      `}} />

      <div className="app-shell">
        <div
          className={`sidebar-backdrop ${mobileNavOpen ? "open" : ""}`}
          onClick={() => setMobileNavOpen(false)}
        />

        {/* ── Sidebar ── */}
        <div className={`sidebar ${mobileNavOpen ? "open" : ""}`}>
          {/* Header */}
          <div className="sidebar-header" style={{
            padding: "16px 18px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <ChromeText fontSize={16}>BULA</ChromeText>
                <PowerBadge size={16} />
                <ChromeText fontSize={16}>ON</ChromeText>
              </div>
              <div style={{ fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase", opacity: 0.7, marginTop: 3, marginBottom: 6, fontWeight: 700, color: "#fff" }}>
                Laundry Hub
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>SalesPoint</div>
              {demoMode && (
                <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.18)", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                  ● Live Mode
                </div>
              )}
            </div>
            <button className="sidebar-close-btn" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">✕</button>
          </div>

          {/* Nav — scrolls independently */}
          <nav className="sidebar-nav" style={{ padding: "4px 0" }}>
            {navItems.map(({ key, emoji, label }) => {
              const active = view === key;
              return (
                <button key={key} onClick={() => handleSetView(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", textAlign: "left",
                    padding: "9px 16px",
                    background: active ? "rgba(255,255,255,0.18)" : "transparent",
                    color: "#fff", border: "none", cursor: "pointer",
                    fontFamily: FONT, fontSize: 12.5, fontWeight: active ? 800 : 400,
                    borderLeft: active ? "3px solid rgba(255,255,255,0.9)" : "3px solid transparent",
                    lineHeight: 1.3,
                  }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{emoji}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer — compact inline stats */}
          <div className="sidebar-footer" style={{
            padding: "10px 14px 12px",
            borderTop: "1px solid rgba(255,255,255,0.12)",
          }}>
            {/* Today's Sales — cash / non-GCash */}
            <div title="Today's completed sales, not including GCash" style={rowStyle(4)}>
              <span style={{ fontSize: 10, opacity: 0.7 }}>Today's Sales ({todayCashOrders.length})</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{fmt(todaySales)}</span>
            </div>

            {/* Today's GCash */}
            <div title="Today's completed GCash sales" style={rowStyle(4)}>
              <span style={{ fontSize: 10, opacity: 0.7 }}>Today's GCash ({todayGcashOrders.length})</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: GCASH_COLOR }}>{fmt(todayGcashTotal)}</span>
            </div>

            {/* Paid Credits — old orders PAID today (counted in Grand Total) */}
            <div title="Old orders (created before today) that were paid today, cash + GCash" style={rowStyle(6)}>
              <span style={{ fontSize: 10, opacity: 0.7 }}>Paid Credits ({collectedOldToday.length})</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: PAID_COLOR }}>{fmt(collectedOldTotal)}</span>
            </div>

            {/* Grand Total */}
            <div style={{
              padding: "6px 10px", marginBottom: 4,
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 7,
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
            }}>
              <span style={{ fontSize: 10, opacity: 0.85 }}>Grand Total ({grandTotalCount})</span>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{fmt(grandTotal)}</span>
            </div>

            {/* Info only: GCash portion already included in Grand Total */}
            <div
              title="GCash portion of the Grand Total (today's GCash + old orders paid via GCash today). Already included above."
              style={{ ...rowStyle(8), padding: "0 4px" }}
            >
              <span style={{ fontSize: 10, opacity: 0.6 }}>↳ incl. GCash ({gcashOrdersToday.length})</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: GCASH_COLOR }}>{fmt(gcashTotal)}</span>
            </div>

            {/* Unpaid old credits — NOT in Grand Total */}
            <div title="Old orders (created before today) that are still unpaid. Not in Grand Total." style={rowStyle(6)}>
              <span style={{ fontSize: 10, opacity: 0.7 }}>Unpaid Credits ({unpaidCreditsOrders.length})</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: PENDING_COLOR }}>{fmt(unpaidCreditsTotal)}</span>
            </div>

            {/* Pending created today */}
            <div
              onClick={() => handleSetView("orders")}
              title="View orders"
              style={{
                padding: "6px 10px", marginBottom: 8,
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 7,
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 10, opacity: 0.8 }}>Pending ({pendingTodayOrders.length})</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: PENDING_COLOR }}>{fmt(pendingTodayTotal)}</span>
            </div>

            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textAlign: "center", marginBottom: 8 }}>
              {clock.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })} · {clock.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
            </div>

            <button
              onClick={() => setShowLogoutConfirm(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "8px 0",
                background: "rgba(255,255,255,0.1)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.25)", borderRadius: 7,
                fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
            >
              <span style={{ fontSize: 13 }}>↪</span> Log out
            </button>
          </div>
        </div>

        {/* ── Main ── */}
        <div className="main-area">
          <div className="topbar" style={{ height: 50, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <button className="hamburger-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">☰</button>
              <div className="topbar-title" style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {navItems.find(n => n.key === view)?.label}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: MUTED, flexShrink: 0 }}>
              <span className="topbar-orders-label">{ordersTodayCount} orders today</span>
              <span className="topbar-orders-label" style={{ width: 1, height: 16, background: BORDER, display: "inline-block" }} />
              <span className="topbar-orders-label" style={{ fontWeight: 700, color: "#92400E" }}>
                Pending: {fmt(pendingTotal)}
              </span>
              <span className="topbar-orders-label" style={{ width: 1, height: 16, background: BORDER, display: "inline-block" }} />
              <span style={{ fontWeight: 700, color: demoMode ? "#92400E" : SUCCESS }}>{demoMode ? "Live Mode" : "Live"}</span>
            </div>
          </div>

          <div className="content-area" style={{ flex: 1, overflow: "hidden" }}>
            {view === "pos" && <POSView categories={categories} items={items} setItems={setItems} orders={orders} setOrders={setOrders} demoMode={demoMode} />}
            {view === "menu" && <MenuView categories={categories} setCategories={setCategories} items={items} setItems={setItems} config={config} demoMode={demoMode} />}
            {view === "orders" && <OrdersView orders={orders} setOrders={setOrders} />}
            {view === "riderScanner" && <RiderScannerView orders={orders} setOrders={setOrders} />}
            {view === "stock" && <StockView items={items} setItems={setItems} demoMode={demoMode} />}
            {view === "statistics" && <StatisticsView demoMode={demoMode} />}
            {view === "voidRefund" && <VoidRefundView orders={orders} setOrders={setOrders} config={config} demoMode={demoMode} />}
            {view === "timeClock" && <EmployeeTimeView demoMode={demoMode} />}
            {view === "calendar" && <CalendarView demoMode={demoMode} />}
            {view === "expenses" && <ExpensesView demoMode={demoMode} />}
            {view === "kiosqr" && <KioskQR secret={config.totpSecret || config.secret} />}
            {view === "promo" && <PromoView />}
          </div>
        </div>
      </div>

      {showLogoutConfirm && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300,
            padding: 16,
          }}
          onClick={() => !loggingOut && setShowLogoutConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: BG, borderRadius: 12, padding: "28px 28px 22px",
              width: "100%", maxWidth: 340, boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
              fontFamily: FONT,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 8 }}>
              Log out?
            </div>
            <div style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5, marginBottom: 22 }}>
              Are you sure you want to log out? You'll need to sign in again to access the POS.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                disabled={loggingOut}
                style={{
                  padding: "8px 16px", borderRadius: 7, border: `1px solid ${BORDER}`,
                  background: BG, color: TEXT, fontFamily: FONT, fontSize: 13, fontWeight: 600,
                  cursor: loggingOut ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  padding: "8px 16px", borderRadius: 7, border: "none",
                  background: DR, color: "#fff", fontFamily: FONT, fontSize: 13, fontWeight: 700,
                  cursor: loggingOut ? "not-allowed" : "pointer",
                  opacity: loggingOut ? 0.75 : 1,
                }}
              >
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
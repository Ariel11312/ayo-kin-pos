import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { getCategories } from "./data/category"
import INIT_ITEMS, { getItems } from "./data/items"
import INIT_ORDERS, { getOrders } from "./data/orders"
import { DR, DR_LIGHT, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT } from "../ui/styles"
import Badge from "../function/badge"
import fmt from "../function/fmt"
import Btn from "../function/btn"
import Field from "../function/field"
import Modal, { PaymentModal, ReceiptModal } from '../function/modal';
import { ErrBox, OkBox } from "../function/messageBox";
import POSView from "./Views/POSView";
import MenuView from "./Views/MenuView";
import OrdersView from "./Views/OrderView";
import VoidRefundView from "./Views/VoidRefundView";
import StatisticsView from "./Views/StatisticsView";
import StockView from "./Views/StockView";
import EmployeeTimeView from "./Views/EmplyeeTimeView";
import CalendarView from "./Views/CalendarView";
import ExpensesView from "./Views/ExpensesView";
export default function App() {
  const navigate = useNavigate();
  const [view, setView] = useState(() => localStorage.getItem("pos_view") || "pos");
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_config") || "{}"); } catch { return {}; }
  });
  const [demoMode, setDemoMode] = useState(true);
  const [categories, setCategories] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    async function fetchLayoutData() {
      const data = await getCategories();
      setCategories(data || []);
    }
    fetchLayoutData();
  }, []);

  const [items, setItems] = useState([]);
  useEffect(() => {
    async function fetchItemsData() {
      const data = await getItems();
      setItems(data || []);
    }
    fetchItemsData();
  }, []);

  const [orders, setOrders] = useState([]);
  useEffect(() => {
    async function fetchOrdersData() {
      const data = await getOrders();
      setOrders(data || []);
    }
    fetchOrdersData();
  }, []);

  const [showConfig, setShowConfig] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => { setDemoMode(!config.supabaseUrl || !config.supabaseKey); }, [config]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  // Close the mobile drawer automatically if the window is resized back to desktop width
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
    setMobileNavOpen(false); // auto-close drawer after picking a page on mobile
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
    { key: "stock", emoji: "🗃️", label: "Stock" },
    { key: "expenses", emoji: "💸", label: "expenses" },
    { key: "statistics", emoji: "📈", label: "Statistics" },
    { key: "voidRefund", emoji: "↩", label: "Void / Refund" },
    { key: "timeClock", emoji: "🕒", label: "Time Clock" },
    { key: "calendar", emoji: "📅", label: "Calendar" },
  ];

  const todaySales = orders
    ? orders
      .filter(o => o.status === "completed" && new Date(o.created_at).toDateString() === new Date().toDateString())
      .reduce((s, o) => s + o.total, 0)
    : 0;

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
        }

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
        {/* Backdrop (mobile only) */}
        <div
          className={`sidebar-backdrop ${mobileNavOpen ? "open" : ""}`}
          onClick={() => setMobileNavOpen(false)}
        />

        {/* ── Sidebar ── */}
        <div className={`sidebar ${mobileNavOpen ? "open" : ""}`}>
          <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.12)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", opacity: 0.65, marginBottom: 3, fontWeight: 700 }}>Bula-On Laundry Hub</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>SalesPoint</div>
              {demoMode && (
                <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.18)", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                  ● Demo Mode
                </div>
              )}
            </div>
            <button className="sidebar-close-btn" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">✕</button>
          </div>

          <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
            {navItems.map(({ key, emoji, label }) => {
              const active = view === key;
              return (
                <button key={key} onClick={() => handleSetView(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "13px 18px",
                    background: active ? "rgba(255,255,255,0.18)" : "transparent", color: "#fff", border: "none", cursor: "pointer",
                    fontFamily: FONT, fontSize: 13, fontWeight: active ? 800 : 400,
                    borderLeft: active ? "3px solid rgba(255,255,255,0.9)" : "3px solid transparent"
                  }}>
                  <span style={{ fontSize: 16 }}>{emoji}</span> {label}
                </button>
              );
            })}
          </nav>

          <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Today's Sales</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{fmt(todaySales)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, marginBottom: 14 }}>
              {clock.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }) + " "}
              {clock.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "9px 0",
                background: "rgba(255,255,255,0.1)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.25)", borderRadius: 7,
                fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
            >
              <span style={{ fontSize: 14 }}>↪</span> Log out
            </button>
          </div>
        </div>

        {/* ── Main ── */}
        <div className="main-area">
          {/* Topbar */}
          <div className="topbar" style={{ height: 50, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <button className="hamburger-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">☰</button>
              <div className="topbar-title" style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {navItems.find(n => n.key === view)?.label}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: MUTED, flexShrink: 0 }}>
              <span className="topbar-orders-label">{orders ? orders.length : 0} orders today</span>
              <span className="topbar-orders-label" style={{ width: 1, height: 16, background: BORDER, display: "inline-block" }} />
              <span style={{ fontWeight: 700, color: demoMode ? "#92400E" : SUCCESS }}>{demoMode ? "Demo Mode" : "Live"}</span>
            </div>
          </div>

          {/* Content */}
          <div className="content-area" style={{ flex: 1, overflow: "hidden" }}>
            {view === "pos" && <POSView categories={categories} items={items} setItems={setItems} orders={orders} setOrders={setOrders} demoMode={demoMode} />}
            {view === "menu" && <MenuView categories={categories} setCategories={setCategories} items={items} setItems={setItems} config={config} demoMode={demoMode} />}
            {view === "orders" && <OrdersView orders={orders} setOrders={setOrders} />}
            {view === "stock" && <StockView items={items} setItems={setItems} demoMode={demoMode} />}
            {view === "statistics" && <StatisticsView demoMode={demoMode} />}
            {view === "voidRefund" && <VoidRefundView orders={orders} setOrders={setOrders} config={config} demoMode={demoMode} />}
            {view === "timeClock" && <EmployeeTimeView demoMode={demoMode} />}
            {view === "calendar" && <CalendarView demoMode={demoMode} />}
            {view === "expenses" && <ExpensesView demoMode={demoMode} />}

          </div>
        </div>
      </div>

      {showConfig && <ConfigPanel config={config} setConfig={setConfig} demoMode={demoMode} setDemoMode={setDemoMode} onClose={() => setShowConfig(false)} />}

      {/* ── Logout confirmation ── */}
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
import { useState, useEffect, useRef } from "react";
import { getCategories } from "./data/category"
import INIT_ITEMS, { getItems } from "./data/items"
import INIT_ORDERS, { getOrders } from "./data/orders"
import {DR, DR_LIGHT, BG, TEXT, MUTED,BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT} from "../ui/styles"
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

export default function App() {
  const [view, setView] = useState(() => localStorage.getItem("pos_view") || "pos");
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pos_config") || "{}"); } catch { return {}; }
  });
  const [demoMode, setDemoMode] = useState(true);
  const [categories, setCategories] = useState([]);
  
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

  useEffect(() => { setDemoMode(!config.supabaseUrl || !config.supabaseKey); }, [config]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const handleSetView = (key) => {
    setView(key);
    localStorage.setItem("pos_view", key);
  };

  // ── FIXED: "stistics" typo corrected to "statistics" ──
  const navItems = [
    { key: "pos",        emoji: "🧾", label: "Sales / POS"   },
    { key: "menu",       emoji: "📋", label: "Menu Setup"    },
    { key: "orders",     emoji: "📦", label: "Orders"        },
    { key: "statistics", emoji: "📈", label: "Statistics"    }, 
    { key: "voidRefund", emoji: "↩",  label: "Void / Refund" },
  ];

  const todaySales = orders
    ? orders
        .filter(o => o.status === "completed" && new Date(o.created_at).toDateString() === new Date().toDateString())
        .reduce((s, o) => s + o.total, 0)
    : 0;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: FONT, background: BG, color: TEXT, overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{__html: `body { margin: 0 !important; padding: 0 !important; }`}} />

      {/* ── Sidebar ── */}
      <div style={{ width: 220, background: DR, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", opacity: 0.65, marginBottom: 3, fontWeight: 700 }}>AYO - KIN POS</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>SalesPoint</div>
          {demoMode && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.18)", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
              ● Demo Mode
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: "8px 0" }}>
          {navItems.map(({ key, emoji, label }) => {
            const active = view === key;
            return (
              <button key={key} onClick={() => handleSetView(key)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 18px",
                  background: active ? "rgba(255,255,255,0.18)" : "transparent", color: "#fff", border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 13, fontWeight: active ? 800 : 400,
                  borderLeft: active ? "3px solid rgba(255,255,255,0.9)" : "3px solid transparent" }}>
                <span style={{ fontSize: 16 }}>{emoji}</span> {label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Today's Sales</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{fmt(todaySales)}</div>
           <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
            {clock.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }) + " "}
            {clock.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ height: 50, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{navItems.find(n => n.key === view)?.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: MUTED }}>
            <span>{orders ? orders.length : 0} orders today</span>
            <span style={{ width: 1, height: 16, background: BORDER, display: "inline-block" }} />
            <span style={{ fontWeight: 700, color: demoMode ? "#92400E" : SUCCESS }}>{demoMode ? "Demo Mode" : "Live"}</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {view === "pos"        && <POSView       categories={categories} items={items} orders={orders} setOrders={setOrders} demoMode={demoMode} />}
          {view === "menu"       && <MenuView      categories={categories} setCategories={setCategories} items={items} setItems={setItems} config={config} demoMode={demoMode} />}
          {view === "orders"     && <OrdersView    orders={orders} />}
          {view === "voidRefund" && <VoidRefundView orders={orders} setOrders={setOrders} config={config} demoMode={demoMode} />}
          {view === "statistics" && <StatisticsView  demoMode={demoMode} />}
        </div>
      </div>

      {showConfig && <ConfigPanel config={config} setConfig={setConfig} demoMode={demoMode} setDemoMode={setDemoMode} onClose={() => setShowConfig(false)} />}
    </div>
  );
}

import { useState, useMemo } from "react";
import { DR, DR_LIGHT, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT, inputStyle } from "../../ui/styles";
import Btn from "../../function/btn";
import fmt from "../../function/fmt";
import Badge from "../../function/badge";
import { ErrBox, OkBox } from "../../function/messageBox";

const APPROVAL_THRESHOLD = 1000;
const MANAGER_PIN = "4321";

export default function VoidRefundView({ orders, setOrders, config, demoMode }) {
  const [search, setSearch] = useState("");
  const [found, setFound] = useState(null);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [fStatus, setFStatus] = useState("all");
  const [fType, setFType] = useState("all");
  const [fPayment, setFPayment] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fText, setFText] = useState("");
  const [sortBy, setSortBy] = useState({ key: "created_at", dir: "desc" });

  const doSearch = () => {
    const o = orders.find(o => o.id.toLowerCase() === search.trim().toLowerCase());
    setFound(o || null);
    setError(o ? "" : `No order found with ID "${search.trim()}"`);
    setSuccess("");
    setAction(null);
    setReason("");
    setStaffName("");
    setPin("");
    setPinError("");
  };

  const closeFound = () => {
    setFound(null);
    setSearch("");
    setError("");
    setSuccess("");
    setAction(null);
    setReason("");
    setStaffName("");
    setPin("");
    setPinError("");
  };

  const requiresApproval = found && found.total >= APPROVAL_THRESHOLD;

  const doAction = async () => {
    if (!reason.trim()) { setError("Please enter a reason."); return; }
    if (!staffName.trim()) { setError("Please enter the name of the staff member processing this."); return; }
    if (requiresApproval) {
      if (!pin.trim()) { setError("Manager PIN is required for amounts of " + fmt(APPROVAL_THRESHOLD) + " or more."); return; }
      if (pin.trim() !== MANAGER_PIN) { setPinError("Incorrect manager PIN."); return; }
    }
    setLoading(true);
    setError("");
    try {
      const patch = {
        status: action,
        void_reason: reason,
        processed_by: staffName.trim(),
        processed_at: new Date().toISOString(),
        approved: requiresApproval,
      };
      if (!demoMode && config.supabaseUrl) await sbReq(config, "PATCH", "orders", patch, `id=eq.${found.id}`);
      const updated = { ...found, ...patch };
      setOrders(prev => prev.map(o => o.id === found.id ? updated : o));
      setFound(updated);
      setSuccess(`Order ${found.id} has been successfully ${action === "voided" ? "voided" : "refunded"}.`);
      setAction(null);
      setReason("");
      setStaffName("");
      setPin("");
      setPinError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const history = useMemo(() => {
    let list = orders.filter(o => ["voided", "refunded"].includes(o.status));

    if (fStatus !== "all") list = list.filter(o => o.status === fStatus);
    if (fType !== "all") list = list.filter(o => o.type === fType);
    if (fPayment !== "all") list = list.filter(o => o.payment_method === fPayment);
    if (fFrom) list = list.filter(o => new Date(o.created_at) >= new Date(fFrom));
    if (fTo) list = list.filter(o => new Date(o.created_at) <= new Date(fTo + "T23:59:59"));
    if (fText.trim()) {
      const q = fText.trim().toLowerCase();
      list = list.filter(o =>
        o.id.toLowerCase().includes(q) ||
        (o.void_reason || "").toLowerCase().includes(q) ||
        (o.processed_by || "").toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      const { key, dir } = sortBy;
      let av = a[key],
        bv = b[key];
      if (key === "created_at") { av = new Date(av).getTime();
        bv = new Date(bv).getTime(); }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [orders, fStatus, fType, fPayment, fFrom, fTo, fText, sortBy]);

  const paymentMethods = useMemo(() => [...new Set(orders.map(o => o.payment_method))], [orders]);
  const types = useMemo(() => [...new Set(orders.map(o => o.type))], [orders]);

  const toggleSort = (key) => {
    setSortBy(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };

  const clearFilters = () => {
    setFStatus("all");
    setFType("all");
    setFPayment("all");
    setFFrom("");
    setFTo("");
    setFText("");
  };

  const SortHeader = ({ label, sortKey, align }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      style={{
        textAlign: align || "left",
        padding: "12px 16px",
        fontSize: 11,
        fontWeight: 700,
        color: MUTED,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
        borderBottom: `2px solid ${BORDER}`,
        transition: "color 0.2s",
        position: "sticky",
        top: 0,
        background: SUBTLE,
        zIndex: 10,
      }}
      onMouseEnter={e => e.currentTarget.style.color = TEXT}
      onMouseLeave={e => e.currentTarget.style.color = MUTED}
    >
      {label}{sortBy.key === sortKey ? (sortBy.dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  const voidedCount = useMemo(() => orders.filter(o => o.status === "voided").length, [orders]);
  const refundedCount = useMemo(() => orders.filter(o => o.status === "refunded").length, [orders]);
  const voidedAmount = useMemo(() => orders.filter(o => o.status === "voided").reduce((s, o) => s + o.total, 0), [orders]);
  const refundedAmount = useMemo(() => orders.filter(o => o.status === "refunded").reduce((s, o) => s + o.total, 0), [orders]);

  const StatCard = ({ label, value, color, icon, subtitle }) => (
    <div style={{
      flex: 1,
      minWidth: 150,
      padding: "18px 20px",
      background: `linear-gradient(135deg, ${BG} 0%, ${SUBTLE} 100%)`,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      transition: "all 0.2s",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      textAlign: "center",
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
    }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom: 8,
      }}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.7 }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || TEXT, letterSpacing: -0.5 }}>
        {value}
      </div>
      {subtitle && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      maxHeight: "100vh",
      background: BG,
      fontFamily: FONT,
    }}>
      {/* Scrollable Content */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "24px 28px 28px 28px",
      }}>
        <div style={{
          maxWidth: 1200,
          margin: "0 auto",
          width: "100%",
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            paddingBottom: 16,
            borderBottom: `2px solid ${BORDER}`,
            flexWrap: "wrap",
            gap: 12,
          }}>
            <div>
              <h2 style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: -0.5,
                color: TEXT,
              }}>
                Void / Refund
              </h2>
              <p style={{
                margin: "4px 0 0",
                color: MUTED,
                fontSize: 13,
              }}>
                Look up an order by ID to void or process a refund
              </p>
            </div>
            <div style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "6px 12px",
              background: SUCCESS_BG,
              border: `1px solid ${SUCCESS}`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              color: SUCCESS,
            }}>
              <span>●</span> {orders.filter(o => o.status === "completed").length} active orders
            </div>
          </div>

          {/* Stats */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}>
            <StatCard
              label="Voided Orders"
              value={voidedCount}
              color={DR}
              icon="🚫"
              subtitle={`${voidedCount > 0 ? fmt(voidedAmount / voidedCount) : "—"} avg`}
            />
            <StatCard
              label="Refunded Orders"
              value={refundedCount}
              color="#7C2D12"
              icon="↩️"
              subtitle={`${refundedCount > 0 ? fmt(refundedAmount / refundedCount) : "—"} avg`}
            />
            <StatCard
              label="Voided Amount"
              value={fmt(voidedAmount)}
              color={DR}
              icon="💰"
            />
            <StatCard
              label="Refunded Amount"
              value={fmt(refundedAmount)}
              color="#7C2D12"
              icon="💳"
            />
          </div>

          {/* Search */}
          <div style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            padding: "14px 16px",
            background: SUBTLE,
            borderRadius: 10,
            border: `1px solid ${BORDER}`,
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder="Enter order ID — e.g. ORD-A1B2C3"
              style={{
                ...inputStyle,
                flex: 1,
                padding: "10px 14px",
                fontSize: 14,
                borderRadius: 6,
                border: `2px solid ${BORDER}`,
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.currentTarget.style.borderColor = DR}
              onBlur={e => e.currentTarget.style.borderColor = BORDER}
            />
            <Btn
              onClick={doSearch}
              style={{
                padding: "10px 24px",
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              🔍 Search
            </Btn>
          </div>

          <ErrBox msg={!found ? error : ""} />
          <OkBox msg={success} />

          {/* Found Order */}
          {found && (
            <div style={{
              border: `2px solid ${BORDER}`,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 24,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              position: "relative",
            }}>
              {/* Close button */}
              <button
                onClick={closeFound}
                aria-label="Close"
                title="Close"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 12,
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${BORDER}`,
                  background: BG,
                  color: MUTED,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 6,
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = DR_LIGHT; e.currentTarget.style.color = DR; }}
                onMouseLeave={e => { e.currentTarget.style.background = BG; e.currentTarget.style.color = MUTED; }}
              >
                ✕
              </button>

              <div style={{
                padding: "14px 20px",
                paddingRight: 48,
                borderBottom: `2px solid ${BORDER}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: `linear-gradient(90deg, ${SUBTLE} 0%, ${BG} 100%)`,
                flexWrap: "wrap",
                gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontWeight: 800,
                    fontFamily: "monospace",
                    fontSize: 17,
                    color: DR,
                    letterSpacing: 0.5,
                  }}>
                    {found.id}
                  </span>
                  <Badge status={found.status} />
                </div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {new Date(found.created_at).toLocaleString("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short"
                  })}
                </div>
              </div>

              <div style={{ padding: "16px 20px" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px 20px",
                  marginBottom: 14,
                  fontSize: 13,
                }}>
                  <div>
                    <span style={{ color: MUTED, fontWeight: 500 }}>Type: </span>
                    <strong style={{ textTransform: "capitalize" }}>{found.type}</strong>
                  </div>
                  <div>
                    <span style={{ color: MUTED, fontWeight: 500 }}>Payment: </span>
                    <strong style={{ textTransform: "uppercase" }}>{found.payment_method}</strong>
                  </div>
                  <div>
                    <span style={{ color: MUTED, fontWeight: 500 }}>Total: </span>
                    <strong style={{ color: DR, fontSize: 17 }}>{fmt(found.total)}</strong>
                  </div>
                  {found.payment_ref && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <span style={{ color: MUTED, fontWeight: 500 }}>Reference: </span>
                      <strong style={{ fontFamily: "monospace" }}>{found.payment_ref}</strong>
                    </div>
                  )}
                  {found.processed_by && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <span style={{ color: MUTED, fontWeight: 500 }}>Processed by: </span>
                      <strong>{found.processed_by}</strong>
                      {found.approved && (
                        <span style={{
                          marginLeft: 10,
                          padding: "2px 8px",
                          background: "#FEF3C7",
                          borderRadius: 4,
                          fontSize: 10,
                          color: "#92400E",
                          fontWeight: 700,
                        }}>
                          ★ MANAGER APPROVED
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{
                  borderTop: `1px solid ${BORDER}`,
                  paddingTop: 12,
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 600,
                    color: MUTED,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    paddingBottom: 6,
                    borderBottom: `1px solid ${BORDER}`,
                    marginBottom: 6,
                  }}>
                    <span>Item</span>
                    <span>Amount</span>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    {found.items.map((item, i) => (
                      <div key={i} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        padding: "4px 0",
                        borderBottom: i < found.items.length - 1 ? `1px solid ${BORDER}` : "none",
                      }}>
                        <span>{item.name} <span style={{ color: MUTED, fontSize: 11 }}>×{item.qty}</span></span>
                        <span style={{ fontWeight: 600 }}>{fmt(item.price * item.qty)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {found.status === "completed" && !action && (
                <div style={{
                  padding: "14px 20px",
                  borderTop: `2px solid ${BORDER}`,
                  display: "flex",
                  gap: 10,
                  background: SUBTLE,
                }}>
                  <Btn
                    variant="outline"
                    onClick={() => { setAction("voided");
                      setError(""); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 6, fontWeight: 700, fontSize: 13 }}
                  >
                    🚫 Void Order
                  </Btn>
                  <Btn
                    onClick={() => { setAction("refunded");
                      setError(""); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 6, fontWeight: 700, fontSize: 13 }}
                  >
                    💳 Process Refund
                  </Btn>
                </div>
              )}
              {found.status !== "completed" && !success && (
                <div style={{
                  padding: "12px 20px",
                  borderTop: `2px solid ${BORDER}`,
                  fontSize: 13,
                  color: MUTED,
                  background: SUBTLE,
                  textAlign: "center",
                }}>
                  This order has already been <strong>{found.status}</strong> and cannot be modified further.
                </div>
              )}

              {action && (
                <div style={{
                  padding: "16px 20px",
                  borderTop: `2px solid ${BORDER}`,
                  background: SUBTLE,
                }}>
                  <div style={{
                    padding: "12px 16px",
                    background: action === "voided" ? DR_LIGHT : "#FFF7ED",
                    borderRadius: 6,
                    marginBottom: 14,
                    borderLeft: `4px solid ${action === "voided" ? DR : "#92400E"}`,
                  }}>
                    <div style={{
                      fontWeight: 800,
                      color: action === "voided" ? DR : "#92400E",
                      fontSize: 14,
                      marginBottom: 4,
                    }}>
                      {action === "voided" ? "🚫 Void" : "💳 Refund"} Order {found.id}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {action === "voided"
                        ? "This cancels the transaction permanently. It cannot be undone."
                        : `A refund of ${fmt(found.total)} will be issued to the customer.`}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    <div>
                      <label style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 700,
                        color: TEXT,
                        marginBottom: 4,
                      }}>
                        Staff Name <span style={{ color: DR }}>*</span>
                      </label>
                      <input
                        value={staffName}
                        onChange={e => setStaffName(e.target.value)}
                        placeholder="e.g. Maria Santos"
                        style={{
                          ...inputStyle,
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: `2px solid ${BORDER}`,
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 700,
                        color: TEXT,
                        marginBottom: 4,
                      }}>
                        Reason <span style={{ color: DR }}>*</span>
                      </label>
                      <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder={action === "voided" ? "e.g. Customer cancelled order" : "e.g. Wrong item served, customer complaint"}
                        style={{
                          ...inputStyle,
                          resize: "vertical",
                          minHeight: 70,
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: `2px solid ${BORDER}`,
                          fontSize: 13,
                        }}
                      />
                    </div>
                  </div>

                  {requiresApproval && (
                    <div style={{
                      padding: "12px 16px",
                      background: "#FEF3C7",
                      borderRadius: 6,
                      marginTop: 14,
                      border: `2px solid #FDE68A`,
                    }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#92400E",
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}>
                        <span>🔒</span> Manager approval required — this {action} is {fmt(found.total)}, at or above the {fmt(APPROVAL_THRESHOLD)} threshold.
                      </div>
                      <input
                        type="password"
                        value={pin}
                        onChange={e => { setPin(e.target.value);
                          setPinError(""); }}
                        placeholder="Manager PIN"
                        style={{
                          ...inputStyle,
                          maxWidth: 200,
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: `2px solid ${BORDER}`,
                          fontSize: 13,
                        }}
                      />
                      {pinError && (
                        <div style={{
                          fontSize: 12,
                          color: DR,
                          marginTop: 6,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}>
                          <span>⚠️</span> {pinError}
                        </div>
                      )}
                    </div>
                  )}

                  <ErrBox msg={error} />
                  {demoMode && (
                    <p style={{
                      fontSize: 11,
                      color: MUTED,
                      margin: "10px 0",
                      padding: "6px 10px",
                      background: "#FFF7ED",
                      borderRadius: 4,
                      border: `1px solid #FDE68A`,
                    }}>
                      ⚡ Demo mode — no real changes saved to Supabase.
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <Btn
                      variant="ghost"
                      onClick={() => {
                        setAction(null);
                        setReason("");
                        setStaffName("");
                        setPin("");
                        setPinError("");
                        setError("");
                      }}
                      style={{ flex: 1, padding: "10px", borderRadius: 6 }}
                    >
                      Cancel
                    </Btn>
                    <Btn
                      onClick={doAction}
                      disabled={loading}
                      style={{
                        flex: 2,
                        padding: "10px",
                        borderRadius: 6,
                        fontWeight: 700,
                        background: action === "refunded" ? "#7C2D12" : DR,
                      }}
                    >
                      {loading ? "⏳ Processing…" : `✅ Confirm ${action === "voided" ? "Void" : "Refund"}`}
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History */}
          <div>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              flexWrap: "wrap",
              gap: 8,
            }}>
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: MUTED,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}>
                📋 Void & Refund History
              </div>
              <div style={{ fontSize: 11, color: MUTED }}>
              </div>
            </div>

            {/* Filters */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 14,
              padding: "12px 14px",
              background: SUBTLE,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}>
              <input
                value={fText}
                onChange={e => setFText(e.target.value)}
                placeholder="🔍 Search ID, reason, staff…"
                style={{
                  ...inputStyle,
                  flex: "1 1 160px",
                  minWidth: 120,
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: `1px solid ${BORDER}`,
                  fontSize: 12,
                }}
              />
              <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{
                ...inputStyle,
                flex: "0 1 120px",
                padding: "6px 10px",
                borderRadius: 4,
                border: `1px solid ${BORDER}`,
                fontSize: 12,
              }}>
                <option value="all">All statuses</option>
                <option value="voided">Voided</option>
                <option value="refunded">Refunded</option>
              </select>
              <select value={fType} onChange={e => setFType(e.target.value)} style={{
                ...inputStyle,
                flex: "0 1 120px",
                padding: "6px 10px",
                borderRadius: 4,
                border: `1px solid ${BORDER}`,
                fontSize: 12,
              }}>
                <option value="all">All types</option>
                {types.map(t => <option key={t} value={t} style={{ textTransform: "capitalize" }}>{t}</option>)}
              </select>
              <select value={fPayment} onChange={e => setFPayment(e.target.value)} style={{
                ...inputStyle,
                flex: "0 1 130px",
                padding: "6px 10px",
                borderRadius: 4,
                border: `1px solid ${BORDER}`,
                fontSize: 12,
              }}>
                <option value="all">All payment methods</option>
                {paymentMethods.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
              <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={{
                ...inputStyle,
                flex: "0 1 130px",
                padding: "6px 10px",
                borderRadius: 4,
                border: `1px solid ${BORDER}`,
                fontSize: 12,
              }} />
              <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={{
                ...inputStyle,
                flex: "0 1 130px",
                padding: "6px 10px",
                borderRadius: 4,
                border: `1px solid ${BORDER}`,
                fontSize: 12,
              }} />
              <Btn variant="ghost" onClick={clearFilters} style={{
                padding: "6px 14px",
                borderRadius: 4,
                fontSize: 12,
              }}>
                ✕ Clear
              </Btn>
            </div>

            {/* Table */}
            {history.length === 0 ? (
              <div style={{
                padding: "32px 20px",
                textAlign: "center",
                color: MUTED,
                fontSize: 13,
                border: `2px dashed ${BORDER}`,
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
                No voided or refunded orders match these filters.
              </div>
            ) : (
              <div style={{
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                maxHeight: 400,
                overflow: "auto",
              }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                  minWidth: 650,
                }}>
                  <thead>
                    <tr style={{ 
                      background: SUBTLE, 
                      borderBottom: `2px solid ${BORDER}`,
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                    }}>
                      <SortHeader label="Order ID" sortKey="id" />
                      <SortHeader label="Date" sortKey="created_at" />
                      <th style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: MUTED,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        borderBottom: `2px solid ${BORDER}`,
                        position: "sticky",
                        top: 0,
                        background: SUBTLE,
                        zIndex: 5,
                      }}>Type</th>
                      <th style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: MUTED,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        borderBottom: `2px solid ${BORDER}`,
                        position: "sticky",
                        top: 0,
                        background: SUBTLE,
                        zIndex: 5,
                      }}>Payment</th>
                      <SortHeader label="Total" sortKey="total" align="right" />
                      <th style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: MUTED,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        borderBottom: `2px solid ${BORDER}`,
                        position: "sticky",
                        top: 0,
                        background: SUBTLE,
                        zIndex: 5,
                      }}>Status</th>
                      <th style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: MUTED,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        borderBottom: `2px solid ${BORDER}`,
                        position: "sticky",
                        top: 0,
                        background: SUBTLE,
                        zIndex: 5,
                      }}>Reason</th>
                      <th style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: MUTED,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        borderBottom: `2px solid ${BORDER}`,
                        position: "sticky",
                        top: 0,
                        background: SUBTLE,
                        zIndex: 5,
                      }}>Processed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(o => (
                      <tr
                        key={o.id}
                        onClick={() => {
                          setSearch(o.id);
                          setFound(o);
                          setSuccess("");
                          setError("");
                          setAction(null);
                          setStaffName("");
                          setPin("");
                          setPinError("");
                        }}
                        style={{
                          borderBottom: `1px solid ${BORDER}`,
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = SUBTLE}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{
                          padding: "10px 14px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: DR,
                          whiteSpace: "nowrap",
                          fontSize: 12,
                        }}>
                          {o.id}
                        </td>
                        <td style={{
                          padding: "10px 14px",
                          color: MUTED,
                          whiteSpace: "nowrap",
                          fontSize: 11,
                        }}>
                          {new Date(o.created_at).toLocaleString("en-PH", {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })}
                        </td>
                        <td style={{
                          padding: "10px 14px",
                          textTransform: "capitalize",
                          fontSize: 12,
                        }}>{o.type}</td>
                        <td style={{
                          padding: "10px 14px",
                          textTransform: "uppercase",
                          fontWeight: 500,
                          fontSize: 12,
                        }}>{o.payment_method}</td>
                        <td style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          fontWeight: 700,
                          fontSize: 12,
                        }}>{fmt(o.total)}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <Badge status={o.status} />
                        </td>
                        <td style={{
                          padding: "10px 14px",
                          color: MUTED,
                          maxWidth: 160,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                        }} title={o.void_reason || ""}>
                          {o.void_reason || "—"}
                        </td>
                        <td style={{
                          padding: "10px 14px",
                          whiteSpace: "nowrap",
                          textAlign: "center",
                          fontSize: 12,
                        }}>
                          {o.processed_by || "—"}
                          {o.approved && (
                            <span style={{
                              marginLeft: 6,
                              fontSize: 12,
                              color: "#92400E",
                            }}>★</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{
              marginTop: 10,
              fontSize: 11,
              color: MUTED,
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 6,
            }}>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function
async function sbReq(config, method, table, data, query) {
  console.log("Supabase request:", { config, method, table, data, query });
  return { success: true };
}
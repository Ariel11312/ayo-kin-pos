import { useState, useEffect, useRef, useMemo } from "react";
import { DR, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT } from "../../ui/styles";
import Badge from "../../function/badge";
import Btn from "../../function/btn";
import Field from "../../function/field";
import Modal from "../../function/modal";
import { ErrBox, OkBox } from "../../function/messageBox";
import { getEmployees, addEmployee, updateEmployee } from "../data/employee";
import { getTimeLogs } from "../data/timelogs";
import { useIsMobile } from "../hooks/useMediaQuery";

// ── Config ──
const SHIFT_START = "09:00";         // HH:MM — anyone clocking in after this + grace is "Late"
const LATE_GRACE_MIN = 10;           // grace period
const SHIFT_END = "18:00";           // used for expected-hours math
const AUTO_REFRESH_MS = 30 * 1000;   // pull fresh logs every 30s
const POPUP_MS = 4000;

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 7, border: `1px solid ${BORDER}`, fontFamily: FONT, fontSize: 13.5, boxSizing: "border-box" };
const linkBtnStyle = { background: "none", border: "none", color: DR, fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 0" };
const smallInput = { padding: "8px 10px", borderRadius: 7, border: `1px solid ${BORDER}`, fontFamily: FONT, fontSize: 13, boxSizing: "border-box" };
const thStyle = { padding: "10px 16px", fontSize: 11, color: MUTED, whiteSpace: "nowrap" };

const POPUP_THEME = {
  in:   { icon: "✅", color: SUCCESS,   bg: SUCCESS_BG },
  out:  { icon: "👋", color: "#92400E", bg: "#FEF3C7" },
  warn: { icon: "⏳", color: "#92400E", bg: "#FEF3C7" },
  err:  { icon: "⚠️", color: "#B91C1C", bg: "#FDECEA" },
};

// ── Helpers ──
function genCode() {
  return "EMP-" + Math.floor(1000 + Math.random() * 9000);
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function dateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayKey() {
  return dateKey(new Date().toISOString());
}
function fmtHours(h) {
  if (!isFinite(h) || h <= 0) return "0h 00m";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
/** Late if first Time In of the day is after SHIFT_START + grace */
function isLate(log, allLogsForDay) {
  if (!log || log.type !== "in") return false;
  const firstIn = allLogsForDay
    .filter(l => l.type === "in")
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
  if (!firstIn || firstIn.id !== log.id) return false;
  const t = new Date(firstIn.timestamp);
  return t.getHours() * 60 + t.getMinutes() > toMinutes(SHIFT_START) + LATE_GRACE_MIN;
}

/**
 * Pair Time In/Out per employee per day → array of sessions
 * { employee_id, date, in, out, hours }
 */
function buildSessions(logs) {
  const byEmp = {};
  for (const l of logs) {
    const k = `${l.employee_id}|${dateKey(l.timestamp)}`;
    (byEmp[k] = byEmp[k] || []).push(l);
  }
  const sessions = [];
  for (const k of Object.keys(byEmp)) {
    const rows = byEmp[k].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let openIn = null;
    for (const r of rows) {
      if (r.type === "in") {
        if (openIn) {
          // two "in"s in a row → treat previous as 0-hour session
          sessions.push({ employee_id: r.employee_id, date: k, in: openIn, out: null, hours: 0 });
        }
        openIn = r;
      } else if (r.type === "out" && openIn) {
        const hrs = (new Date(r.timestamp) - new Date(openIn.timestamp)) / 36e5;
        sessions.push({ employee_id: r.employee_id, date: k, in: openIn, out: r, hours: hrs > 0 ? hrs : 0 });
        openIn = null;
      }
    }
    if (openIn) {
      // still clocked in → count hours up to now
      const hrs = (Date.now() - new Date(openIn.timestamp)) / 36e5;
      sessions.push({ employee_id: openIn.employee_id, date: k, in: openIn, out: null, hours: hrs > 0 ? hrs : 0 });
    }
  }
  return sessions;
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Shared UI bits ──
function ListCard({ children, onClick, style = {} }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${BORDER}`, borderRadius: 10, background: "#fff",
        padding: "12px 14px", marginBottom: 8, cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function TypePill({ type }) {
  const isIn = type === "in";
  const color = isIn ? SUCCESS : "#DC2626";
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      color, background: isIn ? SUCCESS_BG : "#FDECEA", border: `1px solid ${color}`,
    }}>
      {isIn ? "Time In" : "Time Out"}
    </span>
  );
}

function LatePill() {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      color: "#92400E", background: "#FEF3C7", border: "1px solid #F59E0B", marginLeft: 6,
    }}>
      Late
    </span>
  );
}

function StatCard({ label, value, sub, accent = DR }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: "14px 16px", minWidth: 0, borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ResultPopup({ popup, onClose, isMobile }) {
  const theme = POPUP_THEME[popup.kind] || POPUP_THEME.err;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10000, fontFamily: FONT, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, padding: isMobile ? "24px 20px" : "28px 32px",
          width: isMobile ? "100%" : 360, maxWidth: "100%", boxSizing: "border-box",
          textAlign: "center", boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
          border: `2px solid ${theme.color}`,
        }}
      >
        <div style={{
          width: 72, height: 72, borderRadius: "50%", background: theme.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 34, margin: "0 auto 14px",
        }}>
          {theme.icon}
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: theme.color, marginBottom: 4 }}>{popup.title}</div>
        {popup.name && <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{popup.name}</div>}
        {popup.message && <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 4 }}>{popup.message}</div>}
        {popup.time && <div style={{ fontSize: 12.5, color: MUTED }}>{popup.time}</div>}
        <Btn onClick={onClose} style={{ width: "100%", minHeight: 44, marginTop: 18 }}>OK</Btn>
      </div>
    </div>
  );
}

// ── Main component ──
export default function EmployeeTimeView({ demoMode }) {
  const isMobile = useIsMobile();

  const [tab, setTab] = useState("overview");
  const [employees, setEmployees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [modal, setModal] = useState(null); // "employee" | "history"
  const [editing, setEditing] = useState(null);
  const [historyEmp, setHistoryEmp] = useState(null);
  const [form, setForm] = useState({ name: "", position: "", code: "", active: true });

  const [popup, setPopup] = useState(null);

  // ── Filters ──
  const [empSearch, setEmpSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("all"); // all | in | out
  const [sortCol, setSortCol] = useState("timestamp");
  const [sortDir, setSortDir] = useState("desc");

  const employeesRef = useRef(employees);
  employeesRef.current = employees;
  const logsRef = useRef(logs);
  useEffect(() => { logsRef.current = logs; }, [logs]);

  async function refresh() {
    const [emp, lg] = await Promise.all([getEmployees(), getTimeLogs()]);
    setEmployees(emp || []);
    setLogs(lg || []);
  }
  useEffect(() => { refresh(); }, []);

  // Auto-refresh so the "clocked in now" count stays accurate
  useEffect(() => {
    const t = setInterval(refresh, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  function lastLogFor(employeeId, list) {
    return list
      .filter(l => l.employee_id === employeeId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
  }
  function statusFor(employeeId) {
    const last = lastLogFor(employeeId, logs);
    return last && last.type === "in" ? "in" : "out";
  }

  // ── Popup ──
  function closePopup() { setPopup(null); }
  useEffect(() => {
    if (!popup) return;
    const t = setTimeout(closePopup, POPUP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup]);

  // ── Derived data ──
  const clockedIn = employees.filter(e => e.active && statusFor(e.id) === "in");
  const tk = todayKey();
  const todayLogs = useMemo(
    () => logs.filter(l => dateKey(l.timestamp) === tk),
    [logs, tk]
  );

  // Sessions grouped per employee/day
  const sessions = useMemo(() => buildSessions(logs), [logs]);

  // Today's hours per employee
  const todayHoursByEmp = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      if (s.date !== tk) continue;
      map[s.employee_id] = (map[s.employee_id] || 0) + s.hours;
    }
    return map;
  }, [sessions, tk]);

  // Late employee ids today
  const lateToday = useMemo(() => {
    const byEmp = {};
    for (const l of todayLogs) {
      (byEmp[l.employee_id] = byEmp[l.employee_id] || []).push(l);
    }
    const set = new Set();
    for (const [id, rows] of Object.entries(byEmp)) {
      const firstIn = rows
        .filter(r => r.type === "in")
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
      if (!firstIn) continue;
      const t = new Date(firstIn.timestamp);
      if (t.getHours() * 60 + t.getMinutes() > toMinutes(SHIFT_START) + LATE_GRACE_MIN) {
        set.add(id);
      }
    }
    return set;
  }, [todayLogs]);

  // Summary stats
  const stats = useMemo(() => {
    const activeCount = employees.filter(e => e.active).length;
    const presentToday = new Set(todayLogs.map(l => l.employee_id)).size;
    const totalHoursToday = Object.values(todayHoursByEmp).reduce((a, b) => a + b, 0);
    const avgHours = presentToday > 0 ? totalHoursToday / presentToday : 0;
    const expectedHours = Math.max(0, (toMinutes(SHIFT_END) - toMinutes(SHIFT_START)) / 60);
    const absent = Math.max(0, activeCount - presentToday);
    return { activeCount, presentToday, totalHoursToday, avgHours, late: lateToday.size, absent, expectedHours };
  }, [employees, todayLogs, todayHoursByEmp, lateToday]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.position || "").toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q)
    );
  }, [employees, empSearch]);

  // Filtered + sorted logs
  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    const from = logFrom ? new Date(logFrom + "T00:00:00").getTime() : null;
    const to = logTo ? new Date(logTo + "T23:59:59").getTime() : null;
    let out = logs.filter(l => {
      if (logTypeFilter !== "all" && l.type !== logTypeFilter) return false;
      if (from !== null && new Date(l.timestamp).getTime() < from) return false;
      if (to !== null && new Date(l.timestamp).getTime() > to) return false;
      if (q) {
        const name = (l.employees?.name || "").toLowerCase();
        const code = (l.employees?.code || "").toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      if (sortCol === "timestamp") {
        return (new Date(a.timestamp) - new Date(b.timestamp)) * dir;
      }
      if (sortCol === "name") {
        return (a.employees?.name || "").localeCompare(b.employees?.name || "") * dir;
      }
      if (sortCol === "type") {
        return (a.type || "").localeCompare(b.type || "") * dir;
      }
      return 0;
    });
    return out;
  }, [logs, logSearch, logFrom, logTo, logTypeFilter, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  function exportLogsCSV() {
    const rows = [
      ["Date", "Employee", "Code", "Type", "Time"],
      ...filteredLogs.map(l => [
        fmtDate(l.timestamp),
        l.employees?.name || "Unknown",
        l.employees?.code || "",
        l.type === "in" ? "Time In" : "Time Out",
        fmtTime(l.timestamp),
      ]),
    ];
    downloadCSV(`time-logs-${todayKey()}.csv`, rows);
  }

  // ── Employee CRUD ──
  function openAddEmployee() {
    setEditing(null);
    setForm({ name: "", position: "", code: genCode(), active: true });
    setError("");
    setModal("employee");
  }
  function openEditEmployee(emp) {
    setEditing(emp);
    setForm({ name: emp.name, position: emp.position || "", code: emp.code, active: emp.active });
    setError("");
    setModal("employee");
  }
  async function saveEmployee() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.code.trim()) { setError("Employee code is required"); return; }
    try {
      if (editing) {
        const updated = await updateEmployee(editing.id, form);
        setEmployees(prev => prev.map(e => (e.id === editing.id ? updated : e)));
      } else {
        const created = await addEmployee(form);
        setEmployees(prev => [...prev, created]);
      }
      setModal(null);
      setOk("Employee saved");
      setTimeout(() => setOk(""), 2000);
    } catch (e) {
      setError(e.message || "Failed to save employee");
    }
  }
  async function removeEmployee(emp) {
    if (!window.confirm(`Deactivate ${emp.name}?`)) return;
    try {
      const updated = await updateEmployee(emp.id, { active: false });
      setEmployees(prev => prev.map(e => (e.id === emp.id ? updated : e)));
    } catch (e) {
      setError(e.message || "Failed to update employee");
    }
  }

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "employees", label: "Employees" },
    { key: "logs", label: "Time Logs" },
    { key: "hours", label: "Hours" },
  ];

  const cardStyle = {
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
    padding: isMobile ? 16 : 20, minWidth: 0,
  };
  const tableWrap = {
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
    overflowX: "auto", WebkitOverflowScrolling: "touch",
  };
  const filterBarStyle = {
    display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
    marginBottom: 14,
  };

  return (
    <div className="emp-root" style={{
      padding: isMobile ? "16px 14px 28px" : "22px 26px",
      height: "100%", overflowY: "auto", boxSizing: "border-box",
      WebkitOverflowScrolling: "touch",
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 640px) {
          .emp-root input, .emp-root select, .emp-root textarea { font-size: 16px; }
        }
        .emp-root .clickable-th { cursor: pointer; user-select: none; }
        .emp-root .clickable-th:hover { color: ${DR}; }
      `}} />

      {/* Header */}
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start",
        gap: 12, marginBottom: 18,
      }}>
        <div>
          <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800 }}>Employee Time Clock</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
            {stats.activeCount} employees · {clockedIn.length} clocked in now
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={refresh} style={{ minHeight: 44 }}>⟳ Refresh</Btn>
          <Btn onClick={openAddEmployee} style={{ flex: isMobile ? 1 : undefined, minHeight: 44 }}>+ Add Employee</Btn>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <StatCard label="Clocked In" value={clockedIn.length} sub={`of ${stats.activeCount} active`} accent={SUCCESS} />
        <StatCard label="Present Today" value={stats.presentToday} sub={`${stats.absent} absent`} />
        <StatCard label="Hours Today" value={fmtHours(stats.totalHoursToday)} sub={`avg ${fmtHours(stats.avgHours)}`} />
        <StatCard label="Late Today" value={stats.late} sub={`grace ${LATE_GRACE_MIN}m after ${SHIFT_START}`} accent="#F59E0B" />
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 20,
        overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2,
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); closePopup(); }}
            style={{
              padding: "9px 16px", borderRadius: 20, border: `1px solid ${tab === t.key ? DR : BORDER}`,
              background: tab === t.key ? DR : "#fff", color: tab === t.key ? "#fff" : TEXT,
              fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap", flex: "0 0 auto", minHeight: 40,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrBox msg={error} />
      <OkBox msg={ok} />

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Currently Clocked In ({clockedIn.length})</div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
            gap: 12, marginBottom: 26,
          }}>
            {clockedIn.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No one is clocked in right now.</div>}
            {clockedIn.map(emp => {
              const lastLog = lastLogFor(emp.id, logs);
              const hrs = todayHoursByEmp[emp.id] || 0;
              const late = lateToday.has(emp.id);
              return (
                <div key={emp.id} style={{ background: SUCCESS_BG, border: `1px solid ${SUCCESS}`, borderRadius: 10, padding: "12px 16px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{emp.name}</div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{emp.position || "—"}</div>
                  <div style={{ fontSize: 11, color: SUCCESS, fontWeight: 700, marginTop: 6 }}>
                    Since {lastLog ? fmtTime(lastLog.timestamp) : "—"} · {fmtHours(hrs)}
                  </div>
                  {late && <div style={{ marginTop: 4 }}><LatePill /></div>}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Today's Activity ({todayLogs.length})</div>
            <button onClick={() => {
              const rows = [
                ["Employee", "Type", "Time"],
                ...todayLogs.map(l => [l.employees?.name || "Unknown", l.type === "in" ? "Time In" : "Time Out", fmtTime(l.timestamp)]),
              ];
              downloadCSV(`today-activity-${todayKey()}.csv`, rows);
            }} style={linkBtnStyle}>Export today ↓</button>
          </div>

          {isMobile ? (
            todayLogs.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 10, fontSize: 13 }}>
                No activity yet today.
              </div>
            ) : (
              todayLogs.map(l => (
                <ListCard key={l.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{l.employees?.name || "Unknown"}</span>
                    <span>
                      <TypePill type={l.type} />
                      {lateToday.has(l.employee_id) && l.type === "in" && <LatePill />}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{fmtTime(l.timestamp)}</div>
                </ListCard>
              ))
            )
          ) : (
            <div style={tableWrap}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
                <thead>
                  <tr style={{ background: SUBTLE, textAlign: "left" }}>
                    <th style={thStyle}>EMPLOYEE</th>
                    <th style={thStyle}>TYPE</th>
                    <th style={thStyle}>TIME</th>
                  </tr>
                </thead>
                <tbody>
                  {todayLogs.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: 20, textAlign: "center", color: MUTED }}>No activity yet today.</td></tr>
                  )}
                  {todayLogs.map(l => (
                    <tr key={l.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: "10px 16px" }}>{l.employees?.name || "Unknown"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <TypePill type={l.type} />
                        {lateToday.has(l.employee_id) && l.type === "in" && <LatePill />}
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{fmtTime(l.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── EMPLOYEES ── */}
      {tab === "employees" && (
        <div>
          <div style={filterBarStyle}>
            <input
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              placeholder="Search name, position, or code…"
              style={{ ...smallInput, flex: "1 1 220px", minWidth: 0 }}
            />
            <div style={{ fontSize: 12, color: MUTED }}>{filteredEmployees.length} of {employees.length}</div>
          </div>

          {isMobile ? (
            filteredEmployees.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 10, fontSize: 13 }}>
                No employees match.
              </div>
            ) : (
              filteredEmployees.map(emp => {
                const hrs = todayHoursByEmp[emp.id] || 0;
                const late = lateToday.has(emp.id);
                return (
                  <ListCard key={emp.id} onClick={() => { setHistoryEmp(emp); setModal("history"); }} style={{ opacity: emp.active ? 1 : 0.55 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{emp.name}</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{emp.position || "—"}</div>
                        <div style={{ fontSize: 12, fontFamily: "monospace", color: MUTED, marginTop: 2 }}>{emp.code}</div>
                        {hrs > 0 && <div style={{ fontSize: 11.5, color: DR, fontWeight: 700, marginTop: 4 }}>Today: {fmtHours(hrs)}</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                        <Badge color={statusFor(emp.id) === "in" ? SUCCESS : MUTED}>
                          {statusFor(emp.id) === "in" ? "Clocked In" : "Clocked Out"}
                        </Badge>
                        {late && <Badge color="#F59E0B">Late</Badge>}
                        {!emp.active && <Badge color="#DC2626">Inactive</Badge>}
                      </div>
                    </div>
                    <div style={{
                      display: "flex", gap: 18, marginTop: 10, paddingTop: 8,
                      borderTop: `1px solid ${BORDER}`,
                    }}>
                      <button onClick={(e) => { e.stopPropagation(); setHistoryEmp(emp); setModal("history"); }} style={linkBtnStyle}>History</button>
                      <button onClick={(e) => { e.stopPropagation(); openEditEmployee(emp); }} style={linkBtnStyle}>Edit</button>
                      {emp.active && <button onClick={(e) => { e.stopPropagation(); removeEmployee(emp); }} style={{ ...linkBtnStyle, color: "#DC2626", marginLeft: "auto" }}>Deactivate</button>}
                    </div>
                  </ListCard>
                );
              })
            )
          ) : (
            <div style={tableWrap}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 800 }}>
                <thead>
                  <tr style={{ background: SUBTLE, textAlign: "left" }}>
                    <th style={thStyle}>NAME</th>
                    <th style={thStyle}>POSITION</th>
                    <th style={thStyle}>CODE</th>
                    <th style={thStyle}>TODAY</th>
                    <th style={thStyle}>STATUS</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: MUTED }}>No employees match.</td></tr>
                  )}
                  {filteredEmployees.map(emp => {
                    const hrs = todayHoursByEmp[emp.id] || 0;
                    const late = lateToday.has(emp.id);
                    return (
                      <tr key={emp.id} style={{ borderTop: `1px solid ${BORDER}`, opacity: emp.active ? 1 : 0.5 }}>
                        <td style={{ padding: "10px 16px", fontWeight: 700 }}>{emp.name}</td>
                        <td style={{ padding: "10px 16px" }}>{emp.position || "—"}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>{emp.code}</td>
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{hrs > 0 ? fmtHours(hrs) : "—"}</td>
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                          <Badge color={statusFor(emp.id) === "in" ? SUCCESS : MUTED}>
                            {statusFor(emp.id) === "in" ? "Clocked In" : "Clocked Out"}
                          </Badge>
                          {late && <Badge color="#F59E0B" style={{ marginLeft: 6 }}>Late</Badge>}
                          {!emp.active && <Badge color="#DC2626" style={{ marginLeft: 6 }}>Inactive</Badge>}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => { setHistoryEmp(emp); setModal("history"); }} style={{ ...linkBtnStyle, marginLeft: 10 }}>History</button>
                          <button onClick={() => openEditEmployee(emp)} style={{ ...linkBtnStyle, marginLeft: 10 }}>Edit</button>
                          {emp.active && <button onClick={() => removeEmployee(emp)} style={{ ...linkBtnStyle, color: "#DC2626", marginLeft: 10 }}>Deactivate</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── LOGS ── */}
      {tab === "logs" && (
        <div>
          <div style={filterBarStyle}>
            <input
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
              placeholder="Search employee…"
              style={{ ...smallInput, flex: "1 1 180px", minWidth: 0 }}
            />
            <input type="date" value={logFrom} onChange={e => setLogFrom(e.target.value)} style={smallInput} />
            <input type="date" value={logTo} onChange={e => setLogTo(e.target.value)} style={smallInput} />
            <select value={logTypeFilter} onChange={e => setLogTypeFilter(e.target.value)} style={smallInput}>
              <option value="all">All types</option>
              <option value="in">Time In</option>
              <option value="out">Time Out</option>
            </select>
            <button onClick={() => { setLogSearch(""); setLogFrom(""); setLogTo(""); setLogTypeFilter("all"); }} style={linkBtnStyle}>Clear</button>
            <button onClick={exportLogsCSV} style={{ ...linkBtnStyle, marginLeft: "auto" }}>Export CSV ↓</button>
          </div>

          <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>{filteredLogs.length} entries</div>

          {isMobile ? (
            filteredLogs.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 10, fontSize: 13 }}>
                No logs match.
              </div>
            ) : (
              filteredLogs.map(l => (
                <ListCard key={l.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{l.employees?.name || "Unknown"}</span>
                    <TypePill type={l.type} />
                  </div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
                    {fmtDate(l.timestamp)} · {fmtTime(l.timestamp)}
                  </div>
                </ListCard>
              ))
            )
          ) : (
            <div style={tableWrap}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: SUBTLE, textAlign: "left" }}>
                    <th className="clickable-th" style={thStyle} onClick={() => toggleSort("timestamp")}>
                      DATE {sortCol === "timestamp" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="clickable-th" style={thStyle} onClick={() => toggleSort("name")}>
                      EMPLOYEE {sortCol === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="clickable-th" style={thStyle} onClick={() => toggleSort("type")}>
                      TYPE {sortCol === "type" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th style={thStyle}>TIME</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: MUTED }}>No logs match.</td></tr>
                  )}
                  {filteredLogs.map(l => (
                    <tr key={l.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{fmtDate(l.timestamp)}</td>
                      <td style={{ padding: "10px 16px" }}>{l.employees?.name || "Unknown"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <TypePill type={l.type} />
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{fmtTime(l.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── HOURS SUMMARY ── */}
      {tab === "hours" && (
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
            Total logged hours per employee, grouped by day. Currently-clocked-in sessions count up to now.
          </div>
          {isMobile ? (
            <HoursMobile employees={employees} sessions={sessions} />
          ) : (
            <HoursDesktop employees={employees} sessions={sessions} />
          )}
        </div>
      )}

      {/* ── EMPLOYEE MODAL ── */}
      {modal === "employee" && (
        <Modal title={editing ? "Edit Employee" : "Add Employee"} onClose={() => setModal(null)}>
          <div style={{ padding: isMobile ? 16 : 22 }}>
            <Field label="Full Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Juan Dela Cruz" style={inputStyle} autoFocus={!isMobile} />
            </Field>
            <Field label="Position">
              <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. Attendant" style={inputStyle} />
            </Field>
            <Field label="Employee Code">
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} style={{ ...inputStyle, fontFamily: "monospace" }} />
                <Btn variant="ghost" onClick={() => setForm(f => ({ ...f, code: genCode() }))} style={{ whiteSpace: "nowrap", minHeight: 44 }}>Regenerate</Btn>
              </div>
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <input type="checkbox" id="empActive" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 18, height: 18 }} />
              <label htmlFor="empActive" style={{ fontSize: 14, cursor: "pointer" }}>Active</label>
            </div>
            <ErrBox msg={error} />
            <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setModal(null)} style={{ flex: 1, minHeight: 44 }}>Cancel</Btn>
              <Btn onClick={saveEmployee} style={{ flex: 2, minHeight: 44 }}>{editing ? "Save Changes" : "Add Employee"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── HISTORY MODAL ── */}
      {modal === "history" && historyEmp && (
        <Modal title={`${historyEmp.name} — Attendance`} onClose={() => setModal(null)}>
          <EmployeeHistory emp={historyEmp} logs={logs} sessions={sessions} isMobile={isMobile} />
        </Modal>
      )}

      {popup && <ResultPopup popup={popup} onClose={closePopup} isMobile={isMobile} />}
    </div>
  );
}

// ── Hours summary tables ──
function HoursDesktop({ employees, sessions }) {
  const rows = useMemo(() => {
    const byEmp = {};
    for (const s of sessions) {
      byEmp[s.employee_id] = byEmp[s.employee_id] || { total: 0, days: {} };
      byEmp[s.employee_id].total += s.hours;
      byEmp[s.employee_id].days[s.date] = (byEmp[s.employee_id].days[s.date] || 0) + s.hours;
    }
    return employees.map(e => ({ emp: e, ...(byEmp[e.id] || { total: 0, days: {} }) }));
  }, [employees, sessions]);

  const allDates = useMemo(() => {
    const set = new Set();
    for (const s of sessions) set.add(s.date);
    return [...set].sort().reverse().slice(0, 7); // last 7 days with activity
  }, [sessions]);

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
        <thead>
          <tr style={{ background: SUBTLE, textAlign: "left" }}>
            <th style={thStyle}>EMPLOYEE</th>
            {allDates.map(d => <th key={d} style={thStyle}>{d}</th>)}
            <th style={thStyle}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={allDates.length + 2} style={{ padding: 24, textAlign: "center", color: MUTED }}>No data.</td></tr>
          )}
          {rows.map(r => (
            <tr key={r.emp.id} style={{ borderTop: `1px solid ${BORDER}` }}>
              <td style={{ padding: "10px 16px", fontWeight: 700 }}>{r.emp.name}</td>
              {allDates.map(d => (
                <td key={d} style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                  {r.days[d] ? fmtHours(r.days[d]) : "—"}
                </td>
              ))}
              <td style={{ padding: "10px 16px", fontWeight: 800, whiteSpace: "nowrap" }}>{fmtHours(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoursMobile({ employees, sessions }) {
  const rows = useMemo(() => {
    const byEmp = {};
    for (const s of sessions) {
      byEmp[s.employee_id] = (byEmp[s.employee_id] || 0) + s.hours;
    }
    return employees
      .map(e => ({ emp: e, total: byEmp[e.id] || 0 }))
      .sort((a, b) => b.total - a.total);
  }, [employees, sessions]);

  return (
    <div>
      {rows.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 10, fontSize: 13 }}>No data.</div>
      )}
      {rows.map(r => (
        <ListCard key={r.emp.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.emp.name}</div>
              <div style={{ fontSize: 11.5, color: MUTED }}>{r.emp.position || "—"}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: DR }}>{fmtHours(r.total)}</div>
          </div>
        </ListCard>
      ))}
    </div>
  );
}

// ── Per-employee history ──
function EmployeeHistory({ emp, logs, sessions, isMobile }) {
  const empSessions = useMemo(
    () => sessions.filter(s => s.employee_id === emp.id).sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, emp.id]
  );
  const empLogs = useMemo(
    () => logs.filter(l => l.employee_id === emp.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 30),
    [logs, emp.id]
  );
  const totalHours = empSessions.reduce((a, s) => a + s.hours, 0);
  const daysWorked = new Set(empSessions.filter(s => s.hours > 0).map(s => s.date)).size;
  const avgPerDay = daysWorked > 0 ? totalHours / daysWorked : 0;

  return (
    <div style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <StatCard label="Total" value={fmtHours(totalHours)} />
        <StatCard label="Days" value={daysWorked} />
        <StatCard label="Avg/Day" value={fmtHours(avgPerDay)} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Daily Sessions</div>
      <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        {empSessions.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: MUTED, fontSize: 12 }}>No sessions yet.</div>
        )}
        {empSessions.map((s, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", padding: "8px 12px",
            borderTop: i > 0 ? `1px solid ${BORDER}` : "none", fontSize: 12.5,
          }}>
            <span>{s.date}</span>
            <span style={{ color: MUTED }}>
              {fmtTime(s.in.timestamp)} → {s.out ? fmtTime(s.out.timestamp) : "…"}
            </span>
            <span style={{ fontWeight: 700 }}>{fmtHours(s.hours)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, margin: "16px 0 8px" }}>Recent Logs</div>
      <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        {empLogs.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: MUTED, fontSize: 12 }}>No logs yet.</div>
        )}
        {empLogs.map((l, i) => (
          <div key={l.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 12px", borderTop: i > 0 ? `1px solid ${BORDER}` : "none", fontSize: 12.5,
          }}>
            <span>{fmtDate(l.timestamp)}</span>
            <TypePill type={l.type} />
            <span style={{ color: MUTED }}>{fmtTime(l.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
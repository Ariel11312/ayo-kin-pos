import { Fragment, useState, useEffect, useMemo } from "react";
import { DR, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, FONT } from "../../ui/styles";
import Badge from "../../function/badge";
import { supabase } from "../../supabase/supabase";
import { updateEmployee } from "../data/employee";

// ── Helpers ──
const peso = n =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtHours(h) {
  if (!isFinite(h) || h <= 0) return "0h 00m";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Same matching rule used in ExpensesView ("Cash Advance", "C.A", "CA"…)
const isCashAdvance = cat => /^(cash\s*advance|c\.?\s*a\.?)$/i.test((cat || "").trim());

const PRESETS = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "lastMonth", label: "Last month" },
  { key: "first", label: "1st – 15th" },
  { key: "second", label: "16th – end" },
  { key: "all", label: "All time" },
];

function presetRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "week") {
    const offset = (now.getDay() + 6) % 7; // Monday = 0
    return [ymd(new Date(y, m, now.getDate() - offset)), ymd(new Date(y, m, now.getDate() - offset + 6))];
  }
  if (key === "month") return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
  if (key === "year") return [`${y}-01-01`, `${y}-12-31`];
  if (key === "lastMonth") return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
  if (key === "first") return [ymd(new Date(y, m, 1)), ymd(new Date(y, m, 15))];
  if (key === "second") return [ymd(new Date(y, m, 16)), ymd(new Date(y, m + 1, 0))];
  return ["", ""];
}

const smallInput = {
  padding: "8px 10px", borderRadius: 7, border: `1px solid ${BORDER}`,
  fontFamily: FONT, fontSize: 13, boxSizing: "border-box",
};
const linkBtnStyle = {
  background: "none", border: "none", color: DR, fontFamily: FONT,
  fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 0",
};
const thStyle = { padding: "10px 16px", fontSize: 11, color: MUTED, whiteSpace: "nowrap" };
const chipStyle = active => ({
  padding: "7px 12px", borderRadius: 20, border: `1px solid ${active ? DR : BORDER}`,
  background: active ? DR : "#fff", color: active ? "#fff" : TEXT,
  fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flex: "0 0 auto",
});

/** Inline editable daily rate: type a value, press Enter or click away to save. */
function RateInput({ emp, onSaved }) {
  const current = Number(emp.daily_rate) || 0;
  const [val, setVal] = useState(current ? String(current) : "");
  const [state, setState] = useState("idle"); // idle | saving | ok | err
  const [msg, setMsg] = useState("");

  // keep in sync if the employee record is refreshed from the server
  useEffect(() => { setVal(current ? String(current) : ""); }, [current]);

  async function commit() {
    const n = val.trim() === "" ? 0 : Number(val);
    if (!isFinite(n) || n < 0) { setState("err"); setMsg("Enter a valid amount"); return; }
    if (n === current) { setState("idle"); setMsg(""); return; }
    setState("saving");
    try {
      await updateEmployee(emp.id, { daily_rate: n });
      setState("ok"); setMsg("");
      if (onSaved) onSaved();
      setTimeout(() => setState(s => (s === "ok" ? "idle" : s)), 1500);
    } catch (e) {
      setState("err"); setMsg(e.message || "Failed to save");
    }
  }

  const missing = current === 0 && val.trim() === "";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
        <span style={{ color: MUTED }}>₱</span>
        <input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={val} placeholder="Set rate"
          onChange={e => { setVal(e.target.value); if (state !== "saving") setState("idle"); }}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={{
            ...smallInput, width: 92, textAlign: "right",
            borderColor: state === "err" ? "#DC2626" : missing ? "#F59E0B" : BORDER,
          }}
        />
        <span style={{ color: MUTED, fontSize: 11 }}>/day</span>
        {state === "saving" && <span style={{ fontSize: 11, color: MUTED }}>…</span>}
        {state === "ok" && <span style={{ fontSize: 12, color: SUCCESS, fontWeight: 800 }}>✓</span>}
      </div>
      {state === "err" && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 2 }}>{msg}</div>}
    </div>
  );
}

function Stat({ label, value, sub, accent = DR }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: "14px 16px", minWidth: 0, borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/**
 * Salary tab.
 *   Gross = hours worked in period × (daily_rate ÷ expectedHours)
 *   Net   = Gross − cash advances (auto, from the expenses table) − other deduction (manual)
 *
 * Props:
 *  employees, sessions (from buildSessions), logs, isMobile
 *  shiftStart ("HH:MM"), lateGraceMin, expectedHours
 *  onSaved() – called after a rate is saved (parent should refresh employees)
 *  onExport(filename, rows)
 */
export default function SalaryTab({
  employees, sessions, logs, isMobile,
  shiftStart, lateGraceMin, expectedHours, onSaved, onExport,
}) {
  const [preset, setPreset] = useState("month");
  const [[from, to], setRange] = useState(() => presetRange("month"));
  const [otherDed, setOtherDed] = useState({}); // manual extra deductions { [employeeId]: "123.45" }
  const [showInactive, setShowInactive] = useState(false);
  const [expand, setExpand] = useState(null); // employee id whose cash advances are shown
  const [otOn, setOtOn] = useState(true);       // pay overtime at a higher rate?
  const [otMult, setOtMult] = useState("1.25");  // overtime multiplier (PH ordinary-day OT = 125%)

  // ── Cash advances come from the same "expenses" table as ExpensesView ──
  const [advances, setAdvances] = useState([]);
  const [advErr, setAdvErr] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase.from("expenses").select("*");
      if (!alive) return;
      if (error) { setAdvErr(error.message); return; }
      setAdvErr("");
      setAdvances((data || []).filter(e => isCashAdvance(e.category)));
    }
    load();

    const channel = supabase
      .channel("salary-expenses-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, load)
      .subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  function applyPreset(key) {
    setPreset(key);
    setRange(presetRange(key));
  }
  function editDate(i, v) {
    setPreset("custom");
    setRange(i === 0 ? [v, to] : [from, v]);
  }

  const hoursPerDay = expectedHours > 0 ? expectedHours : 8;

  const { rows, unmatchedAdv } = useMemo(() => {
    const inRange = d => d && (!from || d >= from) && (!to || d <= to);

    // hours + days worked per employee within range
    const agg = {};
    for (const s of sessions) {
      if (!inRange(s.date)) continue;
      const a = (agg[s.employee_id] = agg[s.employee_id] || { byDay: {} });
      a.byDay[s.date] = (a.byDay[s.date] || 0) + s.hours;
    }

    const parsedMult = parseFloat(otMult);
    const mult = isFinite(parsedMult) && parsedMult > 0 ? parsedMult : 1.25;

    // late days per employee
    const firstIn = {};
    for (const l of logs) {
      if (l.type !== "in") continue;
      const d = new Date(l.timestamp);
      const key = ymd(d);
      if (!inRange(key)) continue;
      const k = `${l.employee_id}|${key}`;
      if (!firstIn[k] || d < firstIn[k]) firstIn[k] = d;
    }
    const lateCount = {};
    const limit = toMinutes(shiftStart) + lateGraceMin;
    for (const [k, d] of Object.entries(firstIn)) {
      if (d.getHours() * 60 + d.getMinutes() > limit) {
        const id = k.split("|")[0];
        lateCount[id] = (lateCount[id] || 0) + 1;
      }
    }

    // cash advances per employee within range (matched by id, else by name)
    const byId = {};
    const byName = {};
    employees.forEach(e => {
      byId[String(e.id)] = String(e.id);
      byName[(e.name || "").trim().toLowerCase()] = String(e.id);
    });
    const caByEmp = {};
    let unmatched = 0;
    for (const a of advances) {
      const day = String(a.date || "").slice(0, 10);
      if (!inRange(day)) continue;
      const id =
        (a.employee_id != null && byId[String(a.employee_id)]) ||
        byName[(a.employee_name || "").trim().toLowerCase()] ||
        null;
      if (!id) { unmatched += Number(a.amount) || 0; continue; }
      const c = (caByEmp[id] = caByEmp[id] || { total: 0, items: [] });
      c.total += Number(a.amount) || 0;
      c.items.push({ date: day, amount: Number(a.amount) || 0, status: a.status, desc: a.description });
    }

    const out = employees
      .filter(e => e.active || showInactive || agg[e.id] || caByEmp[String(e.id)])
      .map(e => {
        // Per day: hours beyond a full day are overtime (when enabled)
        const byDay = (agg[e.id] || { byDay: {} }).byDay;
        let regular = 0, ot = 0, days = 0;
        for (const h of Object.values(byDay)) {
          if (h > 0) days++;
          const extra = Math.max(0, h - hoursPerDay);
          regular += Math.min(h, hoursPerDay);
          if (otOn) ot += extra; else regular += extra;
        }
        const ca = caByEmp[String(e.id)] || { total: 0, items: [] };
        const daily = Number(e.daily_rate) || 0;
        const hourly = daily / hoursPerDay;
        const otPay = ot * hourly * mult;
        const gross = hourly * regular + otPay;
        const other = Math.max(0, parseFloat(otherDed[e.id]) || 0);
        const totalDed = ca.total + other;
        return {
          emp: e, daily, hours: regular + ot, ot, otPay, days, late: lateCount[e.id] || 0,
          gross, ca: ca.total, caItems: ca.items.sort((x, y) => x.date.localeCompare(y.date)),
          other, net: Math.max(0, gross - totalDed), shortfall: Math.max(0, totalDed - gross),
        };
      })
      .sort((a, b) => b.net - a.net);

    return { rows: out, unmatchedAdv: unmatched };
  }, [employees, sessions, logs, advances, from, to, otherDed, showInactive, shiftStart, lateGraceMin, hoursPerDay, otOn, otMult]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    hours: t.hours + r.hours, ot: t.ot + r.ot, otPay: t.otPay + r.otPay, gross: t.gross + r.gross, ca: t.ca + r.ca,
    other: t.other + r.other, net: t.net + r.net,
    noRate: t.noRate + (r.daily > 0 ? 0 : 1),
  }), { hours: 0, ot: 0, otPay: 0, gross: 0, ca: 0, other: 0, net: 0, noRate: 0 }), [rows]);

  function exportCSV() {
    const out = [
      ["Employee", "Code", "Position", "Daily Rate", "Days Worked", "Hours", "Late Days", "Overtime Hours", "Overtime Pay", "Gross", "Cash Advance", "Other Deduction", "Net"],
      ...rows.map(r => [
        r.emp.name, r.emp.code, r.emp.position || "", r.daily.toFixed(2), r.days,
        r.hours.toFixed(2), r.late, r.ot.toFixed(2), r.otPay.toFixed(2), r.gross.toFixed(2), r.ca.toFixed(2), r.other.toFixed(2), r.net.toFixed(2),
      ]),
      ["TOTAL", "", "", "", "", totals.hours.toFixed(2), "", totals.ot.toFixed(2), totals.otPay.toFixed(2), totals.gross.toFixed(2), totals.ca.toFixed(2), totals.other.toFixed(2), totals.net.toFixed(2)],
    ];
    onExport(`salary-${from || "start"}_to_${to || "now"}.csv`, out);
  }

  const dedInput = r => (
    <input
      type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
      value={otherDed[r.emp.id] ?? ""}
      onChange={e => setOtherDed(prev => ({ ...prev, [r.emp.id]: e.target.value }))}
      style={{ ...smallInput, width: isMobile ? "100%" : 100, textAlign: "right" }}
    />
  );

  const rateCell = r => <RateInput emp={r.emp} onSaved={onSaved} />;

  const caCell = r =>
    r.ca > 0 ? (
      <button
        onClick={() => setExpand(expand === r.emp.id ? null : r.emp.id)}
        style={{ ...linkBtnStyle, color: "#C0392B", fontSize: 13 }}
        title="Show cash advances"
      >
        −{peso(r.ca)} {expand === r.emp.id ? "▲" : "▼"}
      </button>
    ) : (
      <span style={{ color: MUTED }}>—</span>
    );

  const advList = r => (
    <div style={{ background: "#FFF5F5", border: "1px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      {r.caItems.map((it, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "2px 0" }}>
          <span style={{ color: MUTED }}>{it.date}{it.desc ? ` · ${it.desc}` : ""}</span>
          <span style={{ fontWeight: 700, color: "#C0392B", whiteSpace: "nowrap" }}>−{peso(it.amount)}</span>
        </div>
      ))}
    </div>
  );

  const shortNote = r => r.shortfall > 0 && (
    <div style={{ fontSize: 11, color: "#C0392B", marginTop: 2 }}>
      Deductions exceed pay by {peso(r.shortfall)}
    </div>
  );

  return (
    <div>
      {/* Period */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 10, WebkitOverflowScrolling: "touch" }}>
        {PRESETS.map(p => (
          <button key={p.key} style={chipStyle(preset === p.key)} onClick={() => applyPreset(p.key)}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input type="date" value={from} onChange={e => editDate(0, e.target.value)} style={smallInput} />
        <span style={{ color: MUTED, fontSize: 12 }}>to</span>
        <input type="date" value={to} onChange={e => editDate(1, e.target.value)} style={smallInput} />
        <button onClick={exportCSV} style={{ ...linkBtnStyle, marginLeft: "auto" }}>Export CSV ↓</button>
      </div>

      {/* Summary */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: 12, marginBottom: 14,
      }}>
        <Stat label="Gross Pay" value={peso(totals.gross)} sub={totals.otPay > 0 ? `incl. ${peso(totals.otPay)} overtime` : `${fmtHours(totals.hours)} total`} />
        <Stat label="Cash Advances" value={peso(totals.ca)} accent="#C0392B" sub="auto-deducted" />
        <Stat label="Other Deductions" value={peso(totals.other)} accent="#F59E0B" sub="manual" />
        <Stat label="Net Payroll" value={peso(totals.net)} accent={SUCCESS} sub={`${rows.length} employees`} />
      </div>

      {advErr && (
        <div style={{ background: "#FDECEA", color: "#C0392B", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>
          ⚠ Couldn't load cash advances: {advErr}. Cash advances are NOT being deducted right now.
        </div>
      )}
      {unmatchedAdv > 0 && (
        <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#92400E", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>
          {peso(unmatchedAdv)} in cash advances in this period couldn't be matched to an employee (no employee linked or the name doesn't match), so they weren't deducted.
        </div>
      )}
      {totals.noRate > 0 && (
        <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#92400E", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>
          {totals.noRate} employee{totals.noRate > 1 ? "s have" : " has"} no daily rate set — gross shows ₱0.00. Type a rate in the Daily Rate box to add one.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: TEXT, fontWeight: 700, cursor: "pointer" }}>
          <input type="checkbox" checked={otOn} onChange={e => setOtOn(e.target.checked)} />
          Pay overtime
        </label>
        {otOn && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: MUTED }}>
            beyond {hoursPerDay}h/day at ×
            <input
              type="number" min="1" step="0.05" inputMode="decimal" value={otMult}
              onChange={e => setOtMult(e.target.value)}
              style={{ ...smallInput, width: 76, textAlign: "right" }}
            />
          </label>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: MUTED, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
        Include inactive employees
      </label>

      {isMobile ? (
        <div>
          {rows.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 10, fontSize: 13 }}>
              No data for this period.
            </div>
          )}
          {rows.map(r => (
            <div key={r.emp.id} style={{
              border: `1px solid ${BORDER}`, borderRadius: 10, background: "#fff",
              padding: "12px 14px", marginBottom: 8, opacity: r.emp.active ? 1 : 0.6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{r.emp.name}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{r.emp.position || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>NET</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: DR }}>{peso(r.net)}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 12, color: MUTED, marginTop: 8, alignItems: "center" }}>
                <span>Rate: {rateCell(r)}</span>
                <span>{r.days} day{r.days === 1 ? "" : "s"}</span>
                <span>{fmtHours(r.hours)}</span>
                {r.late > 0 && <Badge color="#F59E0B">{r.late} late</Badge>}
                {r.ot > 0 && <Badge color="#2980B9">OT {fmtHours(r.ot)} · {peso(r.otPay)}</Badge>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: MUTED }}>Gross</div>
                  <div style={{ fontWeight: 700 }}>{peso(r.gross)}</div>
                  <div style={{ color: MUTED, marginTop: 6 }}>Cash advance</div>
                  <div>{caCell(r)}</div>
                </div>
                <div style={{ flex: "0 0 45%" }}>
                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>Other deduction (₱)</div>
                  {dedInput(r)}
                </div>
              </div>
              {expand === r.emp.id && r.ca > 0 && <div style={{ marginTop: 8 }}>{advList(r)}</div>}
              {shortNote(r)}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1080 }}>
            <thead>
              <tr style={{ background: SUBTLE, textAlign: "left" }}>
                <th style={thStyle}>EMPLOYEE</th>
                <th style={thStyle}>DAILY RATE</th>
                <th style={thStyle}>DAYS</th>
                <th style={thStyle}>HOURS</th>
                <th style={thStyle}>LATE</th>
                <th style={thStyle}>OVERTIME</th>
                <th style={{ ...thStyle, textAlign: "right" }}>GROSS</th>
                <th style={{ ...thStyle, textAlign: "right" }}>CASH ADVANCE</th>
                <th style={{ ...thStyle, textAlign: "right" }}>OTHER DED.</th>
                <th style={{ ...thStyle, textAlign: "right" }}>NET PAY</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: MUTED }}>No data for this period.</td></tr>
              )}
              {rows.map(r => (
                <Fragment key={r.emp.id}>
                  <tr style={{ borderTop: `1px solid ${BORDER}`, opacity: r.emp.active ? 1 : 0.55 }}>
                    <td style={{ padding: "10px 16px" }}>
                      <div style={{ fontWeight: 700 }}>{r.emp.name}</div>
                      <div style={{ fontSize: 11.5, color: MUTED }}>{r.emp.position || "—"}</div>
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{rateCell(r)}</td>
                    <td style={{ padding: "10px 16px" }}>{r.days}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{fmtHours(r.hours)}</td>
                    <td style={{ padding: "10px 16px" }}>{r.late > 0 ? <Badge color="#F59E0B">{r.late}</Badge> : "—"}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      {r.ot > 0 ? (
                        <>
                          <div style={{ fontWeight: 700, color: "#2980B9" }}>{fmtHours(r.ot)}</div>
                          <div style={{ fontSize: 11, color: MUTED }}>+{peso(r.otPay)}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>{peso(r.gross)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>{caCell(r)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>{dedInput(r)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>
                      {peso(r.net)}
                      {shortNote(r)}
                    </td>
                  </tr>
                  {expand === r.emp.id && r.ca > 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: "0 16px 12px" }}>{advList(r)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: `2px solid ${BORDER}`, background: SUBTLE, fontWeight: 800 }}>
                  <td style={{ padding: "10px 16px" }} colSpan={3}>TOTAL</td>
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{fmtHours(totals.hours)}</td>
                  <td></td>
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap", color: "#2980B9" }}>{totals.ot > 0 ? fmtHours(totals.ot) : "—"}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right" }}>{peso(totals.gross)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: "#C0392B" }}>−{peso(totals.ca)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right" }}>{peso(totals.other)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: DR }}>{peso(totals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
        Gross = regular hours × (daily rate ÷ {hoursPerDay}h){otOn ? ` + overtime hours (beyond ${hoursPerDay}h in a day) × ${otMult || 1.25}` : ""}. Cash advances recorded in Expenses (by date, any status) are deducted automatically.
        “Other deduction” is manual and isn't saved after you leave this page.
      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { DR, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT } from "../../ui/styles";
import Badge from "../../function/badge";
import Btn from "../../function/btn";
import Field from "../../function/field";
import Modal from "../../function/modal";
import { ErrBox, OkBox } from "../../function/messageBox";
import { getEmployees, addEmployee, updateEmployee } from "../data/employee";
import { getTimeLogs, logTime } from "../data/timelogs";
import { useIsMobile } from "../hooks/useMediaQuery";

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 7, border: `1px solid ${BORDER}`, fontFamily: FONT, fontSize: 13.5, boxSizing: "border-box" };
const linkBtnStyle = { background: "none", border: "none", color: DR, fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 0" };

const thStyle = { padding: "10px 16px", fontSize: 11, color: MUTED, whiteSpace: "nowrap" };

function genCode() {
  return "EMP-" + Math.floor(1000 + Math.random() * 9000);
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function downloadQR(employee) {
  const svg = document.getElementById("qr-svg");
  if (!svg) return;
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  const img = new Image();
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const pngUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = `${employee.name.replace(/\s+/g, "_")}_QR.png`;
    a.click();
  };
  img.src = url;
}

/** Card shell used wherever a table would be too wide for a phone */
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

export default function EmployeeTimeView({ demoMode }) {
  const isMobile = useIsMobile();

  const [tab, setTab] = useState("scan");
  const [employees, setEmployees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [modal, setModal] = useState(null); // "employee" | "qr"
  const [editing, setEditing] = useState(null);
  const [qrEmployee, setQrEmployee] = useState(null);
  const [form, setForm] = useState({ name: "", position: "", code: "", active: true });

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // {name, action, time}
  const scannerRef = useRef(null);
  const scanCooldown = useRef(false);
  const employeesRef = useRef(employees);
  employeesRef.current = employees;

  async function refresh() {
    const [emp, lg] = await Promise.all([getEmployees(), getTimeLogs()]);
    setEmployees(emp || []);
    setLogs(lg || []);
  }
  useEffect(() => { refresh(); }, []);

  function statusFor(employeeId) {
    const empLogs = logs
      .filter(l => l.employee_id === employeeId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!empLogs.length) return "out";
    return empLogs[0].type === "in" ? "in" : "out";
  }

  async function clockAction(employee) {
    const nextType = statusFor(employee.id) === "in" ? "out" : "in";
    try {
      const newLog = await logTime(employee.id, nextType);
      setLogs(prev => [{ ...newLog, employees: { name: employee.name, code: employee.code } }, ...prev]);
      setScanResult({ name: employee.name, action: nextType, time: new Date() });
      setError("");
    } catch (e) {
      setError(e.message || "Failed to log time");
    }
  }

  // ── QR Scanner lifecycle ──
  useEffect(() => {
    if (!scanning) return;
    // Smaller scan box on phones so the camera preview fits the screen
    const box = Math.min(240, Math.round((typeof window !== "undefined" ? window.innerWidth : 360) * 0.62));
    const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: box }, false);
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        if (scanCooldown.current) return;
        scanCooldown.current = true;
        const emp = employeesRef.current.find(e => e.code === decodedText.trim());
        if (emp) {
          clockAction(emp);
        } else {
          setError("QR code not recognized — not linked to any employee.");
        }
        setTimeout(() => { scanCooldown.current = false; }, 2500);
      },
      () => { /* ignore per-frame scan misses */ }
    );

    return () => { scanner.clear().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

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

  const clockedIn = employees.filter(e => e.active && statusFor(e.id) === "in");
  const todayStr = new Date().toDateString();
  const todayLogs = logs.filter(l => new Date(l.timestamp).toDateString() === todayStr);

  const tabs = [
    { key: "scan", label: "Scan" },
    { key: "overview", label: "Overview" },
    { key: "employees", label: "Employees" },
    { key: "logs", label: "Time Logs" },
  ];

  const cardStyle = {
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
    padding: isMobile ? 16 : 20, minWidth: 0,
  };
  const tableWrap = {
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
    overflowX: "auto", WebkitOverflowScrolling: "touch",
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
          .emp-root #qr-reader { max-width: 100%; }
          .emp-root #qr-reader img { max-width: 100%; height: auto; }
          .emp-root #qr-reader video { width: 100% !important; height: auto !important; }
        }
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
            {employees.filter(e => e.active).length} employees · {clockedIn.length} clocked in now
          </div>
        </div>
        <Btn onClick={openAddEmployee} style={{ width: isMobile ? "100%" : undefined, minHeight: 44 }}>+ Add Employee</Btn>
      </div>

      {/* Tabs — scroll sideways instead of wrapping */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 20,
        overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2,
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setScanning(false); setScanResult(null); }}
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

      {tab === "scan" && (
        <div style={{ display: "flex", gap: isMobile ? 14 : 24, flexWrap: "wrap" }}>
          <div style={{ ...cardStyle, flex: "1 1 300px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Scan Employee QR Code</div>
            {!scanning ? (
              <div style={{ textAlign: "center", padding: isMobile ? "24px 0" : "40px 0" }}>
                <div style={{ fontSize: 46, marginBottom: 14 }}>📷</div>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 18, lineHeight: 1.5 }}>
                  Employees scan their badge to time in or out automatically.
                </div>
                <Btn onClick={() => { setScanResult(null); setError(""); setScanning(true); }}
                  style={{ width: isMobile ? "100%" : undefined, minHeight: 44 }}>
                  Start Scanner
                </Btn>
              </div>
            ) : (
              <div>
                <div id="qr-reader" style={{ width: "100%" }} />
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <Btn variant="ghost" onClick={() => setScanning(false)}
                    style={{ width: isMobile ? "100%" : undefined, minHeight: 44 }}>
                    Stop Scanner
                  </Btn>
                </div>
              </div>
            )}

            {scanResult && (
              <div
                style={{
                  marginTop: 18, padding: "16px 18px", borderRadius: 10,
                  background: scanResult.action === "in" ? SUCCESS_BG : "#FEF3C7",
                  border: `1px solid ${scanResult.action === "in" ? SUCCESS : "#F59E0B"}`,
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 800, color: scanResult.action === "in" ? SUCCESS : "#92400E" }}>
                  {scanResult.name} — Timed {scanResult.action === "in" ? "In" : "Out"}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {scanResult.time.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
            )}
          </div>

          <div style={{ ...cardStyle, flex: "1 1 280px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Manual Time In / Out</div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>Use this if the camera isn't available.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: isMobile ? 420 : 340, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {employees.filter(e => e.active).map(emp => {
                const status = statusFor(emp.id);
                return (
                  <div key={emp.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>{emp.position || "—"}</div>
                    </div>
                    <Btn
                      onClick={() => clockAction(emp)}
                      style={{ background: status === "in" ? "#DC2626" : SUCCESS, padding: "9px 14px", fontSize: 11.5, minHeight: 40, flexShrink: 0 }}
                    >
                      {status === "in" ? "Time Out" : "Time In"}
                    </Btn>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
              const lastLog = logs.find(l => l.employee_id === emp.id);
              return (
                <div key={emp.id} style={{ background: SUCCESS_BG, border: `1px solid ${SUCCESS}`, borderRadius: 10, padding: "12px 16px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{emp.name}</div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{emp.position || "—"}</div>
                  <div style={{ fontSize: 11, color: SUCCESS, fontWeight: 700, marginTop: 6 }}>
                    Since {lastLog ? fmtTime(lastLog.timestamp) : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Today's Activity ({todayLogs.length})</div>

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
                    <Badge color={l.type === "in" ? SUCCESS : "#DC2626"}>{l.type === "in" ? "Time In" : "Time Out"}</Badge>
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
                    <th style={thStyle}>ACTION</th>
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
                        <Badge color={l.type === "in" ? SUCCESS : "#DC2626"}>{l.type === "in" ? "Time In" : "Time Out"}</Badge>
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

      {tab === "employees" && (
        isMobile ? (
          employees.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 10, fontSize: 13 }}>
              No employees yet.
            </div>
          ) : (
            employees.map(emp => (
              <ListCard key={emp.id} style={{ opacity: emp.active ? 1 : 0.55 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{emp.name}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{emp.position || "—"}</div>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: MUTED, marginTop: 2 }}>{emp.code}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                    <Badge color={statusFor(emp.id) === "in" ? SUCCESS : MUTED}>
                      {statusFor(emp.id) === "in" ? "Clocked In" : "Clocked Out"}
                    </Badge>
                    {!emp.active && <Badge color="#DC2626">Inactive</Badge>}
                  </div>
                </div>
                <div style={{
                  display: "flex", gap: 18, marginTop: 10, paddingTop: 8,
                  borderTop: `1px solid ${BORDER}`,
                }}>
                  <button onClick={() => { setQrEmployee(emp); setModal("qr"); }} style={linkBtnStyle}>View QR</button>
                  <button onClick={() => openEditEmployee(emp)} style={linkBtnStyle}>Edit</button>
                  {emp.active && <button onClick={() => removeEmployee(emp)} style={{ ...linkBtnStyle, color: "#DC2626", marginLeft: "auto" }}>Deactivate</button>}
                </div>
              </ListCard>
            ))
          )
        ) : (
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr style={{ background: SUBTLE, textAlign: "left" }}>
                  <th style={thStyle}>NAME</th>
                  <th style={thStyle}>POSITION</th>
                  <th style={thStyle}>CODE</th>
                  <th style={thStyle}>STATUS</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: MUTED }}>No employees yet.</td></tr>
                )}
                {employees.map(emp => (
                  <tr key={emp.id} style={{ borderTop: `1px solid ${BORDER}`, opacity: emp.active ? 1 : 0.5 }}>
                    <td style={{ padding: "10px 16px", fontWeight: 700 }}>{emp.name}</td>
                    <td style={{ padding: "10px 16px" }}>{emp.position || "—"}</td>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>{emp.code}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      <Badge color={statusFor(emp.id) === "in" ? SUCCESS : MUTED}>
                        {statusFor(emp.id) === "in" ? "Clocked In" : "Clocked Out"}
                      </Badge>
                      {!emp.active && <Badge color="#DC2626" style={{ marginLeft: 6 }}>Inactive</Badge>}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => { setQrEmployee(emp); setModal("qr"); }} style={{ ...linkBtnStyle, marginLeft: 10 }}>View QR</button>
                      <button onClick={() => openEditEmployee(emp)} style={{ ...linkBtnStyle, marginLeft: 10 }}>Edit</button>
                      {emp.active && <button onClick={() => removeEmployee(emp)} style={{ ...linkBtnStyle, color: "#DC2626", marginLeft: 10 }}>Deactivate</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "logs" && (
        isMobile ? (
          logs.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: MUTED, border: `1px dashed ${BORDER}`, borderRadius: 10, fontSize: 13 }}>
              No time logs yet.
            </div>
          ) : (
            logs.map(l => (
              <ListCard key={l.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{l.employees?.name || "Unknown"}</span>
                  <Badge color={l.type === "in" ? SUCCESS : "#DC2626"}>{l.type === "in" ? "Time In" : "Time Out"}</Badge>
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
                  <th style={thStyle}>DATE</th>
                  <th style={thStyle}>EMPLOYEE</th>
                  <th style={thStyle}>ACTION</th>
                  <th style={thStyle}>TIME</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: MUTED }}>No time logs yet.</td></tr>
                )}
                {logs.map(l => (
                  <tr key={l.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{fmtDate(l.timestamp)}</td>
                    <td style={{ padding: "10px 16px" }}>{l.employees?.name || "Unknown"}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <Badge color={l.type === "in" ? SUCCESS : "#DC2626"}>{l.type === "in" ? "Time In" : "Time Out"}</Badge>
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{fmtTime(l.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {modal === "employee" && (
        <Modal title={editing ? "Edit Employee" : "Add Employee"} onClose={() => setModal(null)}>
          <div style={{ padding: isMobile ? 16 : 22 }}>
            <Field label="Full Name">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Juan Dela Cruz" style={inputStyle} autoFocus={!isMobile} />
            </Field>
            <Field label="Position">
              <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. Attendant" style={inputStyle} />
            </Field>
            <Field label="Employee Code (QR value)">
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} style={{ ...inputStyle, fontFamily: "monospace" }} />
                <Btn variant="ghost" onClick={() => setForm(f => ({ ...f, code: genCode() }))}
                  style={{ whiteSpace: "nowrap", minHeight: 44 }}>
                  Regenerate
                </Btn>
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

      {modal === "qr" && qrEmployee && (
        <Modal title={`${qrEmployee.name}'s QR Code`} onClose={() => setModal(null)}>
          <div style={{ padding: isMobile ? 16 : 22, textAlign: "center" }}>
            <div style={{
              background: "#fff", padding: isMobile ? 14 : 20, borderRadius: 10,
              border: `1px solid ${BORDER}`, display: "inline-block", maxWidth: "100%",
            }}>
              <QRCodeSVG id="qr-svg" value={qrEmployee.code} size={isMobile ? 180 : 200} style={{ maxWidth: "100%", height: "auto" }} />
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800 }}>{qrEmployee.name}</div>
              <div style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{qrEmployee.code}</div>
            </div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20,
            }}>
              <Btn onClick={() => downloadQR(qrEmployee)} style={{ flex: "1 1 140px", minHeight: 44 }}>Download PNG</Btn>
              <Btn onClick={() => window.print()} style={{ flex: "1 1 140px", minHeight: 44 }}>Print</Btn>
              <Btn variant="ghost" onClick={() => setModal(null)} style={{ flex: isMobile ? "1 1 100%" : "1 1 120px", minHeight: 44 }}>Close</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
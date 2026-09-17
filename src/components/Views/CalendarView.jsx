import { useState, useEffect, useMemo } from "react";
import { DR, BG, TEXT, MUTED, BORDER, SUBTLE, SUCCESS, SUCCESS_BG, FONT } from "../../ui/styles";
import Badge from "../../function/badge";
import Btn from "../../function/btn";
import Field from "../../function/field";
import Modal from "../../function/modal";
import { ErrBox, OkBox } from "../../function/messageBox";
import { getEvents, addEvent, updateEvent, deleteEvent } from "../data/events";
import { useIsMobile } from "../hooks/useMediaQuery";

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 7, border: `1px solid ${BORDER}`, fontFamily: FONT, fontSize: 13.5, boxSizing: "border-box" };

const CATEGORIES = [
  { key: "booking", label: "Booking", color: DR },
  { key: "reminder", label: "Reminder", color: "#F59E0B" },
  { key: "maintenance", label: "Maintenance", color: "#6366F1" },
  { key: "other", label: "Other", color: MUTED },
];
const catInfo = (key) => CATEGORIES.find(c => c.key === key) || CATEGORIES[3];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtTime12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}
function fmtDateLong(dateStr, short = false) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", short
    ? { weekday: "short", month: "short", day: "numeric" }
    : { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const emptyForm = { title: "", category: "booking", event_date: "", start_time: "", end_time: "", customer_name: "", customer_phone: "", notes: "" };

export default function CalendarView({ demoMode }) {
  const isMobile = useIsMobile();

  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [modal, setModal] = useState(null); // "event"
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  async function refresh() {
    const data = await getEvents();
    setEvents(data || []);
  }
  useEffect(() => { refresh(); }, []);

  const filteredEvents = useMemo(
    () => categoryFilter === "all" ? events : events.filter(e => e.category === categoryFilter),
    [events, categoryFilter]
  );

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const e of filteredEvents) {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
    }
    for (const key in map) {
      map[key].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
    }
    return map;
  }, [filteredEvents]);

  const upcoming = useMemo(() => {
    const todayStr = toDateStr(new Date());
    return [...filteredEvents]
      .filter(e => e.event_date >= todayStr)
      .sort((a, b) => (a.event_date + (a.start_time || "")).localeCompare(b.event_date + (b.start_time || "")))
      .slice(0, 6);
  }, [filteredEvents]);

  // ── Build month grid ──
  const grid = useMemo(() => {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  function prevMonth() { setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1)); }
  function nextMonth() { setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1)); }
  function goToday() {
    const t = new Date();
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDate(toDateStr(t));
  }

  function openAdd(dateStr) {
    setEditing(null);
    setForm({ ...emptyForm, event_date: dateStr || selectedDate });
    setError("");
    setModal("event");
  }
  function openEdit(ev) {
    setEditing(ev);
    setForm({
      title: ev.title, category: ev.category, event_date: ev.event_date,
      start_time: ev.start_time || "", end_time: ev.end_time || "",
      customer_name: ev.customer_name || "", customer_phone: ev.customer_phone || "", notes: ev.notes || "",
    });
    setError("");
    setModal("event");
  }
  async function saveEvent() {
    if (!form.title.trim()) { setError("Title is required"); return; }
    if (!form.event_date) { setError("Date is required"); return; }
    try {
      const payload = { ...form };
      if (!payload.start_time) payload.start_time = null;
      if (!payload.end_time) payload.end_time = null;
      if (editing) {
        const updated = await updateEvent(editing.id, payload);
        setEvents(prev => prev.map(e => (e.id === editing.id ? updated : e)));
      } else {
        const created = await addEvent(payload);
        setEvents(prev => [...prev, created]);
      }
      setModal(null);
      setOk("Event saved");
      setTimeout(() => setOk(""), 2000);
    } catch (e) {
      setError(e.message || "Failed to save event");
    }
  }
  async function removeEvent(ev) {
    if (!window.confirm(`Delete "${ev.title}"?`)) return;
    try {
      await deleteEvent(ev.id);
      setEvents(prev => prev.filter(e => e.id !== ev.id));
      setOk("Event deleted");
      setTimeout(() => setOk(""), 2000);
    } catch (e) {
      setError(e.message || "Failed to delete event");
    }
  }

  const todayStr = toDateStr(new Date());
  const selectedEvents = eventsByDate[selectedDate] || [];

  const panelStyle = {
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
    padding: isMobile ? 14 : 18, minWidth: 0,
  };

  return (
    <div className="cal-root" style={{
      padding: isMobile ? "16px 12px 28px" : "22px 26px",
      height: "100%", overflowY: "auto", boxSizing: "border-box",
      WebkitOverflowScrolling: "touch",
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 640px) {
          .cal-root input, .cal-root select, .cal-root textarea { font-size: 16px; }
        }
      `}} />

      {/* Header */}
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start",
        marginBottom: 18, flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800 }}>Calendar</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{events.length} events total</div>
        </div>
        <Btn onClick={() => openAdd(selectedDate)} style={{ width: isMobile ? "100%" : undefined, minHeight: 44 }}>+ Add Event</Btn>
      </div>

      {/* Category filter — scrolls sideways on phones */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 18,
        flexWrap: isMobile ? "nowrap" : "wrap",
        overflowX: isMobile ? "auto" : "visible",
        WebkitOverflowScrolling: "touch",
        paddingBottom: isMobile ? 2 : 0,
      }}>
        <button
          onClick={() => setCategoryFilter("all")}
          style={{
            padding: "8px 14px", borderRadius: 20, border: `1px solid ${categoryFilter === "all" ? DR : BORDER}`,
            background: categoryFilter === "all" ? DR : "#fff", color: categoryFilter === "all" ? "#fff" : TEXT,
            fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer",
            whiteSpace: "nowrap", flex: "0 0 auto", minHeight: 38,
          }}
        >
          All
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCategoryFilter(c.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20,
              border: `1px solid ${categoryFilter === c.key ? c.color : BORDER}`,
              background: categoryFilter === c.key ? c.color : "#fff", color: categoryFilter === c.key ? "#fff" : TEXT,
              fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap", flex: "0 0 auto", minHeight: 38,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: categoryFilter === c.key ? "#fff" : c.color, display: "inline-block", flexShrink: 0 }} />
            {c.label}
          </button>
        ))}
      </div>

      <ErrBox msg={error} />
      <OkBox msg={ok} />

      <div style={{
        display: "flex", gap: isMobile ? 14 : 20,
        alignItems: "flex-start", flexWrap: "wrap",
      }}>
        {/* ── Month grid ── */}
        <div style={{ ...panelStyle, flex: "2 1 520px", width: isMobile ? "100%" : undefined }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800 }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <Btn variant="ghost" onClick={prevMonth} style={{ padding: "8px 14px", minHeight: 40 }} aria-label="Previous month">‹</Btn>
              <Btn variant="ghost" onClick={goToday} style={{ padding: "8px 12px", fontSize: 11.5, minHeight: 40 }}>Today</Btn>
              <Btn variant="ghost" onClick={nextMonth} style={{ padding: "8px 14px", minHeight: 40 }} aria-label="Next month">›</Btn>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMobile ? 3 : 4, marginBottom: 6 }}>
            {(isMobile ? WEEKDAYS_SHORT : WEEKDAYS).map((w, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: MUTED, padding: "4px 0" }}>{w}</div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMobile ? 3 : 4 }}>
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const dateStr = toDateStr(d);
              const dayEvents = eventsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedDate(dateStr)}
                  style={{
                    minHeight: isMobile ? 44 : 64, borderRadius: 8,
                    padding: isMobile ? "4px 3px" : "6px 6px",
                    cursor: "pointer", minWidth: 0, overflow: "hidden",
                    border: isSelected ? `2px solid ${DR}` : `1px solid ${BORDER}`,
                    background: isToday ? SUCCESS_BG : "#fff",
                    display: "flex", flexDirection: "column", gap: 3,
                    alignItems: isMobile ? "center" : "stretch",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? SUCCESS : TEXT }}>{d.getDate()}</div>

                  {isMobile ? (
                    // Dots instead of titles — chip text is unreadable at ~44px wide
                    <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
                      {dayEvents.slice(0, 3).map(ev => (
                        <span key={ev.id} style={{ width: 5, height: 5, borderRadius: "50%", background: catInfo(ev.category).color }} />
                      ))}
                      {dayEvents.length > 3 && (
                        <span style={{ fontSize: 8, color: MUTED, fontWeight: 700, lineHeight: "5px" }}>+</span>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      {dayEvents.slice(0, 2).map(ev => (
                        <div
                          key={ev.id}
                          title={ev.title}
                          style={{
                            fontSize: 9.5, fontWeight: 700, color: "#fff", background: catInfo(ev.category).color,
                            borderRadius: 4, padding: "1px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>+{dayEvents.length - 2} more</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Selected day + upcoming ── */}
        <div style={{
          flex: "1 1 300px", display: "flex", flexDirection: "column",
          gap: isMobile ? 14 : 16, minWidth: 0, width: isMobile ? "100%" : undefined,
        }}>
          <div style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, minWidth: 0 }}>{fmtDateLong(selectedDate, isMobile)}</div>
              <button onClick={() => openAdd(selectedDate)} style={{ background: "none", border: "none", color: DR, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 0", flexShrink: 0 }}>+ Add</button>
            </div>
            {selectedEvents.length === 0 && (
              <div style={{ fontSize: 12.5, color: MUTED, padding: "10px 0" }}>No events this day.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedEvents.map(ev => (
                <div key={ev.id} style={{ border: `1px solid ${BORDER}`, borderLeft: `4px solid ${catInfo(ev.category).color}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, wordBreak: "break-word" }}>{ev.title}</div>
                      {(ev.start_time || ev.end_time) && (
                        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                          {fmtTime12(ev.start_time)}{ev.end_time ? ` – ${fmtTime12(ev.end_time)}` : ""}
                        </div>
                      )}
                      {ev.customer_name && (
                        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, wordBreak: "break-word" }}>
                          👤 {ev.customer_name}{ev.customer_phone ? ` · ${ev.customer_phone}` : ""}
                        </div>
                      )}
                      {ev.notes && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4, wordBreak: "break-word" }}>{ev.notes}</div>}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <Badge color={catInfo(ev.category).color}>{catInfo(ev.category).label}</Badge>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 18, marginTop: 8 }}>
                    <button onClick={() => openEdit(ev)} style={{ background: "none", border: "none", color: DR, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: "6px 0" }}>Edit</button>
                    <button onClick={() => removeEvent(ev)} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: "6px 0" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 12 }}>Upcoming</div>
            {upcoming.length === 0 && <div style={{ fontSize: 12.5, color: MUTED }}>Nothing coming up.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {upcoming.map(ev => (
                <div key={ev.id} onClick={() => setSelectedDate(ev.event_date)} style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", padding: "2px 0" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: catInfo(ev.category).color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, wordBreak: "break-word" }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>
                      {new Date(ev.event_date + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      {ev.start_time ? ` · ${fmtTime12(ev.start_time)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Add/Edit Event Modal ── */}
      {modal === "event" && (
        <Modal title={editing ? "Edit Event" : "Add Event"} onClose={() => setModal(null)}>
          <div style={{ padding: isMobile ? 16 : 22 }}>
            <Field label="Title">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Pickup - Mrs. Reyes" style={inputStyle} autoFocus={!isMobile} />
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} style={inputStyle} />
            </Field>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                <Field label="Start Time">
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} />
                </Field>
              </div>
              <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                <Field label="End Time">
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} />
                </Field>
              </div>
            </div>
            <Field label="Customer Name (optional)">
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="e.g. Ana Reyes" style={inputStyle} />
            </Field>
            <Field label="Customer Phone (optional)">
              <input type="tel" inputMode="tel" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="e.g. 0917 123 4567" style={inputStyle} />
            </Field>
            <Field label="Notes (optional)">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
            <ErrBox msg={error} />
            <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10, marginTop: 4 }}>
              <Btn variant="ghost" onClick={() => setModal(null)} style={{ flex: 1, minHeight: 44 }}>Cancel</Btn>
              <Btn onClick={saveEvent} style={{ flex: 2, minHeight: 44 }}>{editing ? "Save Changes" : "Add Event"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
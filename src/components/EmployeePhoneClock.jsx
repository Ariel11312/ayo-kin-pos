import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "../supabase/supabase"; // <- point at your existing client
import { getDeviceId, getSavedEmployeeCode, saveEmployeeCode, forgetEmployeeCode } from "../components/data/deviceid";
import { TEXT, MUTED, BORDER, FONT, SUCCESS } from "../ui/styles";
import Btn from "../function/btn";

/** Employee-side page: runs on the employee's own phone. */
export default function EmployeePhoneClock() {
  const [code, setCode] = useState(getSavedEmployeeCode());
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null); // {ok, text}
  const lock = useRef(false);

  useEffect(() => {
    if (!scanning || !code) return;
    const qr = new Html5Qrcode("emp-reader");
    qr.start(
      { facingMode: "environment" }, { fps: 10, qrbox: 240 },
      async (text) => {
        if (lock.current) return;
        lock.current = true;
        try {
          const { otp } = JSON.parse(text);
          const { data, error } = await supabase.rpc("clock_with_totp", {
            p_code: code, p_device: getDeviceId(), p_otp: otp,
          });
          if (error) throw error;
          setResult({ ok: true, text: `${data.name} timed ${data.type === "in" ? "in" : "out"}.` });
        } catch (e) {
          setResult({ ok: false, text: e.message || "Invalid QR code." });
        }
        setScanning(false);
        setTimeout(() => { lock.current = false; }, 1500);
      },
      () => {}
    ).catch((e) => { setResult({ ok: false, text: "Camera unavailable: " + e }); setScanning(false); });
    return () => { qr.isScanning && qr.stop().then(() => qr.clear()).catch(() => {}); };
  }, [scanning, code]);

  const wrap = { fontFamily: FONT, color: TEXT, maxWidth: 420, margin: "0 auto", padding: 20 };

  if (!code) return (
    <div style={wrap}>
      <h2 style={{ fontSize: 20 }}>Set up this phone</h2>
      <p style={{ color: MUTED, fontSize: 13 }}>Enter your employee code. The first phone you use becomes your only clock-in device.</p>
      <input value={input} onChange={(e) => setInput(e.target.value.trim())} placeholder="EMP-1234"
        style={{ width: "100%", padding: 12, fontSize: 16, border: `1px solid ${BORDER}`, borderRadius: 8, boxSizing: "border-box" }} />
      <Btn onClick={() => { saveEmployeeCode(input); setCode(input); }} style={{ width: "100%", minHeight: 44, marginTop: 12 }}>Continue</Btn>
    </div>
  );

  return (
    <div style={wrap}>
      <h2 style={{ fontSize: 20 }}>Clock in or out</h2>
      <p style={{ color: MUTED, fontSize: 13 }}>Scan the QR code shown on the office screen.</p>
      {result && (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 14, fontWeight: 700,
          color: result.ok ? SUCCESS : "#B91C1C", background: result.ok ? "#ECFDF5" : "#FDECEA" }}>{result.text}</div>
      )}
      {scanning ? <div id="emp-reader" style={{ width: "100%" }} />
        : <Btn onClick={() => { setResult(null); setScanning(true); }} style={{ width: "100%", minHeight: 48 }}>Scan QR</Btn>}
      <button onClick={() => { forgetEmployeeCode(); setCode(""); }}
        style={{ background: "none", border: "none", color: MUTED, fontSize: 12, marginTop: 16, cursor: "pointer" }}>
        Not {code}? Switch employee
      </button>
    </div>
  );
}
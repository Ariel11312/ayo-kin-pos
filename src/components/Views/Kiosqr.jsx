import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { totp, stepAt, secondsLeft, PERIOD } from "../data/totp";
import { DR, MUTED, BORDER, FONT } from "../../ui/styles";
import { supabase } from "../../supabase/supabase";

/** The system's rotating clock-in QR. Show this on the office screen. */
export default function KioskQR({ secret: propSecret }) {
    const [secret, setSecret] = useState(propSecret || "");
    const [code, setCode] = useState("");
    const [left, setLeft] = useState(() => Math.max(0, Math.min(PERIOD, Math.ceil(secondsLeft()))));

useEffect(() => {
    if (propSecret) {
        setSecret(propSecret);
        return;
    }

    let alive = true;
  supabase
    .from("settings")
    .select("value")
    .eq("key", "totp_secret")
    .maybeSingle()
    .then(({ data, error }) => {
            if (!alive) return;
            if (error) console.error(error);
            setSecret(data?.value || "");
        })
        .catch((error) => {
            if (alive) console.error("Failed to load TOTP secret:", error);
        });

    return () => {
        alive = false;
    };
}, [propSecret]);

    useEffect(() => {
        if (!secret) return;

        let lastStep = -1;
        let alive = true;

        const updateTOTP = async () => {
            try {
                const c = await totp(secret);
                if (alive) {
                    setCode(c);
                }
            } catch (err) {
                console.error("Failed to generate TOTP code:", err);
            }
        };

        const tick = () => {
            if (!alive) return;

            const currentSeconds = secondsLeft();
            setLeft(Math.max(0, Math.min(PERIOD, Math.ceil(currentSeconds))));

            const s = stepAt();
            if (s !== lastStep) {
                lastStep = s;
                updateTOTP();
            }
        };

        tick();
        const id = setInterval(tick, 250);

        return () => {
            alive = false;
            clearInterval(id);
        };
    }, [secret]);

    if (!secret) {
        return (
            <div style={{ textAlign: "center", padding: 40, fontFamily: FONT, color: MUTED }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>TOTP secret is not set up yet.</div>
                <div style={{ fontSize: 13 }}>Please configure your office time-clock secret in settings or storage.</div>
            </div>
        );
    }

    const progressPercent = Math.max(0, Math.min(100, (left / PERIOD) * 100));

    return (
        <div style={{ textAlign: "center", fontFamily: FONT, padding: 24 }}>
            <div style={{ display: "inline-block", padding: 18, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                {code ? (
                    <QRCodeSVG value={JSON.stringify({ v: 1, otp: code })} size={240} style={{ maxWidth: "100%", height: "auto" }} />
                ) : (
                    <div style={{ width: 240, height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}>
                        Generating QR...
                    </div>
                )}
            </div>
            <div style={{ height: 6, background: BORDER, borderRadius: 3, margin: "14px auto 6px", maxWidth: 276, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progressPercent}%`, background: DR, transition: "width .25s linear" }} />
            </div>
            <div style={{ fontSize: 12.5, color: MUTED }}>Refreshes in {left}s. Scan with your registered phone.</div>
        </div>
    );
}
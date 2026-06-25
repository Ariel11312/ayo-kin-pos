import { useState, useEffect } from "react";
import { supabase } from "../../supabase/supabase";
import { useNavigate } from "react-router-dom";

// — styles.js tokens (inline for portability) —
const DR       = "#8B0000";
const DR_LIGHT = "#FFF0F0";
const BG       = "#FFFFFF";
const TEXT     = "#111111";
const MUTED    = "#666666";
const BORDER   = "#E2E2E2";
const SUBTLE   = "#F7F7F7";
const SUCCESS  = "#1A5C32";
const FONT     = '"Segoe UI Historic","Segoe UI",Helvetica,Arial,sans-serif';

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontFamily: FONT,
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none",
  color: TEXT,
  background: BG,
  transition: "border-color 0.15s",
};

export default function LoginView() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [focusedField, setFocusedField] = useState(null);
  const navigate = useNavigate();

  // If already logged in, skip the login form entirely.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        navigate("/pos", { replace: true });
      } else {
        setCheckingSession(false);
      }
    });

    return () => { mounted = false; };
  }, [navigate]);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return; // don't redirect on failed login
    }

    navigate("/pos", { replace: true });
  }

  // Avoid flashing the login form while we check for an existing session.
  if (checkingSession) {
    return null;
  }

  return (
    <div style={styles.root}>
      <style dangerouslySetInnerHTML={{ __html: `body { margin: 0 !important; padding: 0 !important; }` }} />

      {/* Left panel — brand */}
      <div style={styles.brand}>
        <div style={styles.brandInner}>
          <div style={styles.logoMark}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="8" fill={DR} />
              <path d="M10 26V14l8-4 8 4v12l-8 4-8-4Z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round"/>
              <circle cx="18" cy="19" r="3" fill="#fff" />
            </svg>
          </div>

          <h1 style={styles.brandName}>Ayo-Kin POS</h1>
          <p style={styles.brandTagline}>
            Fast, reliable point-of-sale<br />for every transaction.
          </p>

          <div style={styles.featureList}>
            {["Live inventory tracking", "Sales analytics", "Void &amp; refund management"].map((f) => (
              <div key={f} style={styles.featureItem}>
                <span style={styles.featureDot} />
                <span dangerouslySetInnerHTML={{ __html: f }} />
              </div>
            ))}
          </div>
        </div>

        {/* subtle grid overlay */}
        <div style={styles.gridOverlay} aria-hidden />
      </div>

      {/* Right panel — login form */}
      <div style={styles.formPanel}>
        <div style={styles.formCard}>
          <p style={styles.formEyebrow}>Staff access</p>
          <h2 style={styles.formHeading}>Sign in to your account</h2>
          <p style={styles.formSub}>Enter your credentials to continue.</p>

          <form onSubmit={handleLogin} noValidate>
            <div style={styles.fieldGroup}>
              <label style={styles.label} htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                placeholder="you@example.com"
                style={{
                  ...inputStyle,
                  borderColor: focusedField === "email" ? DR : BORDER,
                  boxShadow: focusedField === "email" ? `0 0 0 3px ${DR_LIGHT}` : "none",
                }}
              />
            </div>

            <div style={{ ...styles.fieldGroup, marginBottom: 0 }}>
              <label style={styles.label} htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                placeholder="••••••••"
                style={{
                  ...inputStyle,
                  borderColor: focusedField === "password" ? DR : BORDER,
                  boxShadow: focusedField === "password" ? `0 0 0 3px ${DR_LIGHT}` : "none",
                }}
              />
            </div>

            {error && (
              <div style={styles.errorBox} role="alert">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="7" cy="7" r="6" stroke={DR} strokeWidth="1.4" />
                  <path d="M7 4v3.5M7 10h.01" stroke={DR} strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.submitBtn,
                opacity: loading ? 0.75 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p style={styles.helpText}>
            Trouble signing in? Contact your store manager.
          </p>
        </div>

        <p style={styles.footer}>
          © {new Date().getFullYear()} Ayo-Kin POS · All rights reserved
        </p>
      </div>
    </div>
  );
}

const styles = {
  root: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: FONT,
    background: BG,
  },

  // ── left brand panel ──────────────────────────────────────────
  brand: {
    position: "relative",
    width: "42%",
    background: DR,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  brandInner: {
    position: "relative",
    zIndex: 1,
    padding: "48px 40px",
    color: "#fff",
    maxWidth: 340,
  },
  logoMark: {
    marginBottom: 24,
  },
  brandName: {
    margin: "0 0 10px",
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.5px",
    color: "#fff",
  },
  brandTagline: {
    margin: "0 0 36px",
    fontSize: 15,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.75)",
  },
  featureList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  featureItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.5)",
    flexShrink: 0,
  },
  gridOverlay: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "repeating-linear-gradient(0deg,rgba(255,255,255,0.04) 0,rgba(255,255,255,0.04) 1px,transparent 1px,transparent 40px)," +
      "repeating-linear-gradient(90deg,rgba(255,255,255,0.04) 0,rgba(255,255,255,0.04) 1px,transparent 1px,transparent 40px)",
    pointerEvents: "none",
  },

  // ── right form panel ──────────────────────────────────────────
  formPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 32px",
    background: SUBTLE,
  },
  formCard: {
    width: "100%",
    maxWidth: 400,
    background: BG,
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    padding: "36px 32px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  formEyebrow: {
    margin: "0 0 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: DR,
  },
  formHeading: {
    margin: "0 0 6px",
    fontSize: 22,
    fontWeight: 700,
    color: TEXT,
    letterSpacing: "-0.3px",
  },
  formSub: {
    margin: "0 0 28px",
    fontSize: 13,
    color: MUTED,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    color: TEXT,
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    padding: "10px 12px",
    background: DR_LIGHT,
    border: `1px solid ${DR}22`,
    borderRadius: 6,
    fontSize: 13,
    color: DR,
    lineHeight: 1.5,
  },
  submitBtn: {
    marginTop: 22,
    width: "100%",
    padding: "10px 0",
    background: DR,
    color: "#fff",
    border: "none",
    borderRadius: 7,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "0.01em",
    transition: "background 0.15s",
  },
  helpText: {
    marginTop: 20,
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
  },
  footer: {
    marginTop: 28,
    fontSize: 11,
    color: MUTED,
    textAlign: "center",
  },
};
// RFC 6238 TOTP (HMAC-SHA1, 6 digits) using the Web Crypto API.
// Needs a secure context (https or localhost). Secret is stored as hex.

export const PERIOD = 30; // seconds — change to 60 if you want a slower refresh

const hexToBytes = (hex) =>
  new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

export function generateSecret(bytes = 20) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

export async function hotp(secretHex, counter, digits = 6) {
  const key = await crypto.subtle.importKey(
    "raw", hexToBytes(secretHex), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(counter / 2 ** 32));
  dv.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const o = h[19] & 0x0f;
  const n =
    ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (now = Date.now(), period = PERIOD) =>
  Math.floor(now / 1000 / period);

export const totp = (secretHex, now = Date.now(), period = PERIOD) =>
  hotp(secretHex, stepAt(now, period));

export const secondsLeft = (now = Date.now(), period = PERIOD) =>
  period - ((now / 1000) % period);

// Accepts the previous/next step too, to tolerate clock drift.
// (The real check runs on the server — see clock_with_totp.sql.)
export async function verifyTOTP(secretHex, code, window = 1, period = PERIOD) {
  const step = stepAt(Date.now(), period);
  for (let d = -window; d <= window; d++) {
    if ((await hotp(secretHex, step + d)) === code) return true;
  }
  return false;
}
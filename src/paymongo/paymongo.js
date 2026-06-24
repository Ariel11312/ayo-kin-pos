async function pmReq(cfg, endpoint, body) {
  const res = await fetch(`https://api.paymongo.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(cfg.paymongoKey + ":")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PayMongo ${endpoint}: ${await res.text()}`);
  return res.json();
}

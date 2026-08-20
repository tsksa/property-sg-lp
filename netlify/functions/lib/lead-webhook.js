async function postJson(url, payload, fetchImpl = globalThis.fetch) {
  if (!url) throw new Error('LEAD_WEBHOOK_URL is not configured');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`lead webhook returned ${response.status}`);
  return response;
}

module.exports = { postJson };

export function setApiHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export function handleMethod(req, res) {
  setApiHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function safeError(error, fallback) {
  const message = error instanceof Error ? error.message : '';
  if (/api[_ -]?key|token|authorization|bearer/i.test(message)) return fallback;
  return message || fallback;
}

export function errorStatus(error, fallback = 500) {
  const status = Number(error?.statusCode);
  return status >= 400 && status <= 599 ? status : fallback;
}

export function upstreamError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

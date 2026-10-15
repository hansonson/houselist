// Small fetch wrapper: JSON in/out, same-origin credentials, consistent error shape.
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    // A 401 while already on the authenticated app page means the session died
    // (expired, or the server restarted) — bounce to login instead of leaving
    // the user stuck looking at a stale, now-broken view.
    if (res.status === 401 && window.location.pathname.endsWith('/app.html')) {
      window.location.href = 'index.html';
      return new Promise(() => {});
    }
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export function generateCsrf() {
  return crypto.randomUUID().replace(/-/g, '');
}

export function getCsrfFromCookie(request) {
  const h = request.headers.get('Cookie') || '';
  const m = h.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? m[1] : null;
}

export function verifyCsrf(request, formToken) {
  const c = getCsrfFromCookie(request);
  return !!(c && formToken && c === formToken);
}

export function setCsrfCookie(headers, token) {
  headers.append('Set-Cookie', `csrf_token=${token}; Path=/; SameSite=Lax; HttpOnly`);
}

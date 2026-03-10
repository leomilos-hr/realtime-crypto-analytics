/**
 * Input validation helpers for API routes.
 */

/** Validate a Binance symbol — alphanumeric only, 2-20 chars */
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;

export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol.toUpperCase());
}

/** Sanitize and uppercase a symbol, returns null if invalid */
export function sanitizeSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!SYMBOL_RE.test(cleaned)) return null;
  return cleaned;
}

/** Validate a range string like "-24h", "-7d", etc. */
const VALID_RANGES = new Set(["-1h", "-24h", "-7d", "-30d", "-90d", "-365d", "-730d"]);

export function isValidRange(range: string): boolean {
  return VALID_RANGES.has(range);
}

/** Validate email format */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

/** Validate password strength */
export function isValidPassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  if (password.length > 128) {
    return { valid: false, error: "Password must be at most 128 characters" };
  }
  return { valid: true };
}

/** Sanitize a generic string — strip control characters, limit length */
export function sanitizeString(raw: string, maxLength = 200): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, maxLength);
}

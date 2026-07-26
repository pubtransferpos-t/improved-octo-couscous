import { Router, type Request, type Response, type NextFunction } from "express";

const router: Router = Router();

/** Extract the real client IP, Cloudflare-aware. */
function getClientIp(req: Request): string {
  // Cloudflare sets CF-Connecting-IP to the original visitor IP
  const cf = req.headers["cf-connecting-ip"];
  if (cf) return String(cf).split(",")[0].trim();

  // Standard reverse-proxy header (Express trust proxy must be on)
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();

  return req.socket?.remoteAddress ?? (req.ip ?? "");
}

/** Addresses always allowed (local development). */
const LOCALHOST_ADDRS = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"];

function isIpAllowed(ip: string): boolean {
  if (LOCALHOST_ADDRS.includes(ip)) return true;
  const rawEnv = process.env["ADMIN_ALLOWED_IPS"] ?? "";
  const configured = rawEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.some((entry) => ip === entry || ip === `::ffff:${entry}`);
}

/**
 * Middleware: require that the caller's IP is on the allowlist.
 * Applied to all mutation routes; /access is excluded (it only reads the allowed status).
 */
function requireAllowedIp(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  if (isIpAllowed(ip)) {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden: IP not on admin allowlist" });
}

/**
 * POST /api/admin/verify
 *
 * Checks the submitted password against the ADMIN_PASSWORD environment secret.
 * Returns { allowed: boolean }. The password is never stored or echoed.
 * Requires IP allowlist (server-side enforced).
 */
router.post("/admin/verify", requireAllowedIp, (req, res) => {
  const { password } = (req.body ?? {}) as { password?: string };
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (!adminPassword || !password) {
    res.json({ allowed: false });
    return;
  }
  res.json({ allowed: password === adminPassword });
});

/**
 * GET /api/admin/access
 *
 * Returns { allowed: boolean } based on whether the caller's IP is in the
 * ADMIN_ALLOWED_IPS environment variable (comma-separated).
 * Localhost is always allowed so local development works without config.
 *
 * For Cloudflare deployments, set ADMIN_ALLOWED_IPS to your home/office
 * public IP(s). The Worker will forward CF-Connecting-IP automatically.
 */
router.get("/admin/access", (req, res) => {
  const ip = getClientIp(req);
  const allowed = isIpAllowed(ip);

  // Only expose the detected IP in development (useful for setting up the allowlist)
  const responseBody: { allowed: boolean; ip?: string } = { allowed };
  if (process.env["NODE_ENV"] === "development") {
    responseBody.ip = ip;
  }

  res.json(responseBody);
});

export default router;

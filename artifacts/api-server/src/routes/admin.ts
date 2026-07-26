import { Router, type Request } from "express";

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

  // Localhost is always allowed
  const alwaysAllowed = [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "localhost",
  ];

  const rawEnv = process.env["ADMIN_ALLOWED_IPS"] ?? "";
  const configured = rawEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowlist = [...alwaysAllowed, ...configured];
  const allowed = allowlist.some(
    (entry) => ip === entry || ip === `::ffff:${entry}`,
  );

  // Only expose the detected IP in development (useful for setting up the allowlist)
  const responseBody: { allowed: boolean; ip?: string } = { allowed };
  if (process.env["NODE_ENV"] === "development") {
    responseBody.ip = ip;
  }

  res.json(responseBody);
});

export default router;

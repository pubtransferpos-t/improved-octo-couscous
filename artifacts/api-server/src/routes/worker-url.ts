import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

function readWorkerUrl(): string | null {
  try {
    const filePath = path.resolve(process.cwd(), "../../workerurl-200.txt");
    const contents = fs.readFileSync(filePath, "utf8");
    return (
      contents
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith("#")) ?? null
    );
  } catch {
    return null;
  }
}

router.get("/worker-url", (_req, res) => {
  const url = readWorkerUrl();
  if (!url) return res.json({ url: null });
  res.json({ url });
});

// Checks whether the worker URL is configured AND responds
router.get("/worker-status", async (_req, res) => {
  const url = readWorkerUrl();
  if (!url) return res.json({ online: false, reason: "no_url" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    // Worker returns 404 for GET / (no room matched) — that still means it's running
    await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    res.json({ online: true });
  } catch {
    clearTimeout(timer);
    res.json({ online: false, reason: "unreachable" });
  }
});

export default router;

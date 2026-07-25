import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

function getWorkerUrl(): string | null {
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

async function proxyToWorker(req: Request, res: Response) {
  const workerBase = getWorkerUrl();
  if (!workerBase) {
    res.status(503).json({ error: "Multiplayer not configured" });
    return;
  }

  // Strip /api/worker-proxy prefix, forward the rest.
  // Express 5 (path-to-regexp v6) puts a named wildcard's matched segments
  // in req.params.path as an array, NOT req.params[0] (that was Express 4).
  const rawSuffix = req.params.path;
  const suffix = Array.isArray(rawSuffix)
    ? rawSuffix.join("/")
    : (rawSuffix ?? "");

  const targetUrl = `${workerBase.replace(/\/$/, "")}/${suffix}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  try {
    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? JSON.stringify(req.body)
        : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const text = await upstream.text();
    res.status(upstream.status).set("Content-Type", "application/json").send(text);
  } catch (err) {
    res.status(502).json({ error: "Worker unreachable" });
  }
}

router.all("/worker-proxy/*path", (req, res) => proxyToWorker(req, res));
router.all("/worker-proxy", (req, res) => proxyToWorker(req, res));

export default router;
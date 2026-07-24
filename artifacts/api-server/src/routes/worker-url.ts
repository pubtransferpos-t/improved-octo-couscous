import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

router.get("/worker-url", (_req, res) => {
  try {
    const filePath = path.resolve(process.cwd(), "../../workerurl-200.txt");
    const contents = fs.readFileSync(filePath, "utf8");
    // Strip comments and blank lines, grab the first real line
    const url = contents
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#"));

    if (!url) {
      return res.json({ url: null });
    }
    res.json({ url });
  } catch {
    res.json({ url: null });
  }
});

export default router;

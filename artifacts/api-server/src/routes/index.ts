import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workerUrlRouter from "./worker-url";
import workerProxyRouter from "./worker-proxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workerUrlRouter);
router.use(workerProxyRouter);

export default router;

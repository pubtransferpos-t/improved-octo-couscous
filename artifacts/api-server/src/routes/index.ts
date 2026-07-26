import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workerUrlRouter from "./worker-url";
import workerProxyRouter from "./worker-proxy";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workerUrlRouter);
router.use(workerProxyRouter);
router.use(adminRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workerUrlRouter from "./worker-url";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workerUrlRouter);

export default router;

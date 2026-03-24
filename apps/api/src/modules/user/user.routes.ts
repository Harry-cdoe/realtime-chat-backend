import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/auth.middleware";

const router = Router();

router.get("/me", requireAuth, (req: Request, res: Response) => {
  return res.status(200).json({
    message: "Authenticated user",
    data: req.user,
  });
});

export default router;

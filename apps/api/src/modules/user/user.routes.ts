import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/auth.middleware";

// 1. Define what your Auth Request looks like
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

const router = Router();

// 2. Use AuthRequest instead of Request
router.get("/me", requireAuth, (req: AuthRequest, res: Response) => {
  return res.status(200).json({
    message: "Authenticated user",
    data: req.user,
  });
});

export default router;

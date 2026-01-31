import { Router, Request, Response } from "express";
import { requireAuth } from "../lib/auth.middleware";

const router = Router();

// protected route
router.get("/me", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user;

    return res.status(200).json({
        message: "Authenticated user",
        data: user,
    });
});

export default router;

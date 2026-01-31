import { Router } from "express";
import { AuthController } from "./auth.controller";

const router = Router();

// public routes
router.post("/signup", AuthController.signup);
router.post("/login", AuthController.login);
router.post("/refresh", AuthController.refresh);
router.post("/logout", AuthController.logout);

export default router;

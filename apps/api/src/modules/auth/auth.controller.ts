import { Request, Response } from "express";
import { AuthService } from "./auth.service"; // Ensure path is correct

export class AuthController {
  static async signup(req: Request, res: Response) {
    try {
      const result = await AuthService.signup(req.body);
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      return res.json(result);
    } catch (error: any) {
      return res.status(401).json({ message: error.message });
    }
  }

  static async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      const result = await AuthService.refresh(refreshToken);
      return res.json(result);
    } catch (error: any) {
      return res.status(401).json({ message: error.message });
    }
  }
}

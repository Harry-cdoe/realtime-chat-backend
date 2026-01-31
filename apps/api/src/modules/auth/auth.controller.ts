import { Request, Response } from "express";
import { AuthService } from "./auth.service";

export class AuthController {
    static async signup(req: Request, res: Response) {
        try {
            const { name, email, password, avatarUrl } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    message: "Name, email and password are required",
                });
            }

            const tokens = await AuthService.signup({
                name,
                email,
                password,
                avatarUrl,
            });

            return res.status(201).json({
                message: "User registered successfully",
                data: tokens,
            });
        } catch (error: any) {
            return res.status(400).json({
                message: error.message || "Signup failed",
            });
        }
    }

    static async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    message: "Email and password are required",
                });
            }

            const tokens = await AuthService.login(email, password);

            return res.status(200).json({
                message: "Login successful",
                data: tokens,
            });
        } catch (error: any) {
            return res.status(401).json({
                message: error.message || "Invalid credentials",
            });
        }
    }

    static async refresh(req: Request, res: Response) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({
                    message: "Refresh token required",
                });
            }

            const tokens = await AuthService.refresh(refreshToken);

            return res.status(200).json({
                message: "Token refreshed",
                data: tokens,
            });
        } catch (error: any) {
            return res.status(401).json({
                message: error.message || "Refresh failed",
            });
        }
    }

    static async logout(req: Request, res: Response) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({
                    message: "Refresh token required",
                });
            }

            await AuthService.logout(refreshToken);

            return res.status(200).json({
                message: "Logged out successfully",
            });
        } catch {
            return res.status(500).json({
                message: "Logout failed",
            });
        }
    }
}

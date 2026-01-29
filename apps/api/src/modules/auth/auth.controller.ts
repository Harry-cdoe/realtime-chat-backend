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

            const result = await AuthService.signup({
                name,
                email,
                password,
                avatarUrl,
            });

            return res.status(201).json({
                message: "User registered successfully",
                data: result,
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

            const result = await AuthService.login(email, password);

            return res.status(200).json({
                message: "Login successful",
                data: result,
            });
        } catch (error: any) {
            return res.status(401).json({
                message: error.message || "Invalid credentials",
            });
        }
    }
}

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload {
    userId: string;
    email: string;
}

export interface AuthenticatedRequest extends Request {
    user: JwtPayload;
}

export const requireAuth = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Missing or invalid token",
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_ACCESS_SECRET!
        ) as JwtPayload;

        (req as AuthenticatedRequest).user = decoded;

        next();

    } catch (error) {

        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({
                message: "Token expired",
            });
        }

        return res.status(401).json({
            message: "Invalid token",
        });
    }
};
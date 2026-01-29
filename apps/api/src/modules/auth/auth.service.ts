import { UserService } from "../user/user.service";
import { prisma } from "../../../../../packages/postgres/src/client";
import { hashPassword, comparePassword } from "../lib/hash";
import { signAccessToken, signRefreshToken } from "../lib/jwt";

export class AuthService {
    /**
     * Signup a new user
     */
    static async signup(input: {
        name: string;
        email: string;
        password: string;
        avatarUrl?: string;
    }) {
        const hashedPassword = await hashPassword(input.password);

        const user = await UserService.createUser({
            ...input,
            password: hashedPassword,
        });

        const session = await prisma.userSession.create({
            data: {
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
        });

        const accessToken = signAccessToken({
            userId: user.id,
            sessionId: session.id,
        });

        const refreshToken = signRefreshToken({
            userId: user.id,
            sessionId: session.id,
        });

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        return { user, accessToken, refreshToken };
    }

    /**
     * Login existing user
     */
    static async login(email: string, password: string) {
        const user = await UserService.findByEmail(email);

        if (!user) {
            throw new Error("Invalid email or password");
        }

        const isValid = await comparePassword(password, user.password);

        if (!isValid) {
            throw new Error("Invalid email or password");
        }

        const session = await prisma.userSession.create({
            data: {
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        const accessToken = signAccessToken({
            userId: user.id,
            sessionId: session.id,
        });

        const refreshToken = signRefreshToken({
            userId: user.id,
            sessionId: session.id,
        });

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        return { user, accessToken, refreshToken };
    }
}

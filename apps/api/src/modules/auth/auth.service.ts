import jwt from "jsonwebtoken";
import { prisma } from "../../../../../packages/postgres/src/client";
import { UserService } from "../user/user.service";
import { hashPassword, comparePassword } from "../lib/hash";
import { signAccessToken, signRefreshToken } from "../lib/jwt";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export class AuthService {
  /**
   * Signup
   */
  static async signup(input: {
    name: string;
    email: string;
    password: string;
    avatarUrl?: string;
  }) {
    const user = await UserService.createUser(input);

    return this.createSession(user.id);
  }

  /**
   * Login
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

    return this.createSession(user.id);
  }

  /**
   * Refresh token rotation
   */
  static async refresh(refreshToken: string) {
    let payload: any;

    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!);
    } catch {
      throw new Error("Invalid refresh token");
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.revoked) {
      throw new Error("Refresh token revoked");
    }

    // 🔥 Rotation: invalidate old token
    await prisma.refreshToken.delete({
      where: { token: refreshToken },
    });

    return this.createSession(payload.userId);
  }

  /**
   * Logout
   */
  static async logout(refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  }

  /**
   * Internal session creator
   */
  private static async createSession(userId: string) {
    const session = await prisma.userSession.create({
      data: {
        userId,
        expiresAt: new Date(
          Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ),
      },
    });

    const accessToken = signAccessToken({
      userId,
      sessionId: session.id,
    });

    const refreshToken = signRefreshToken({
      userId,
      sessionId: session.id,
    });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: new Date(
          Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ),
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}

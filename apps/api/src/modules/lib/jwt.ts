import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

export const signAccessToken = (payload: object) => {
    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
        expiresIn: ACCESS_TOKEN_TTL,
    });
};

export const signRefreshToken = (payload: object) => {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
        expiresIn: REFRESH_TOKEN_TTL,
    });
};

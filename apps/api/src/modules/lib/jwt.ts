import jwt, { JwtPayload } from "jsonwebtoken";
import { accessTokenSecret, refreshTokenSecret } from "./config";

export const signAccessToken = (payload: object) => {
  return jwt.sign(payload, accessTokenSecret, {
    expiresIn: "15m",
  });
};

export const signRefreshToken = (payload: object) => {
  return jwt.sign(payload, refreshTokenSecret, {
    expiresIn: "30d",
  });
};

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, accessTokenSecret) as JwtPayload;

export const verifyRefreshToken = (token: string): JwtPayload =>
  jwt.verify(token, refreshTokenSecret) as JwtPayload;

const DEFAULT_FRONTEND_ORIGINS = ["http://localhost:5173"];

const splitCsv = (value?: string) =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

export const frontendOrigins =
  splitCsv(process.env.CORS_ORIGIN).length > 0
    ? splitCsv(process.env.CORS_ORIGIN)
    : DEFAULT_FRONTEND_ORIGINS;

const sharedJwtSecret = process.env.JWT_SECRET;

const requireValue = (value: string | undefined, message: string): string => {
  if (!value) {
    throw new Error(message);
  }

  return value;
};

export const accessTokenSecret = requireValue(
  process.env.JWT_ACCESS_SECRET ?? sharedJwtSecret,
  "JWT secret is not defined. Set JWT_SECRET or both JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.",
);

export const refreshTokenSecret = requireValue(
  process.env.JWT_REFRESH_SECRET ?? sharedJwtSecret,
  "JWT secret is not defined. Set JWT_SECRET or both JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.",
);

export const apiPort = Number(process.env.PORT ?? 3000);
export const socketPort = Number(process.env.SOCKET_PORT ?? 3001);

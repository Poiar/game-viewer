function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value && !process.env.CI) {
    console.warn(`[config] Missing env var: ${key} — set it in server/.env`);
  }
  return value ?? "";
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  host: process.env.HOST ?? "127.0.0.1",
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtRefreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  jwtExpiresIn: "15m",
  jwtRefreshExpiresIn: "7d",
  bcryptRounds: 12,
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:4200",
  sgdbApiKey: process.env.SGDB_API_KEY ?? "",
  igdbClientId: process.env.IGDB_CLIENT_ID ?? "",
  igdbAccessToken: process.env.IGDB_ACCESS_TOKEN ?? "",
  rapidApiKey: process.env.RAPIDAPI_KEY ?? "",
} as const;

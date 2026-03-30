import { SignJWT, jwtVerify } from "jose";

const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export async function createToken(secret: string): Promise<{ token: string; expiresAt: number }> {
  const key = new TextEncoder().encode(secret);
  const expiresAt = Date.now() + JWT_EXPIRY_MS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);
  return { token, expiresAt };
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  try {
    const key = new TextEncoder().encode(secret);
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}

import { SignJWT, jwtVerify } from "jose";

const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error("Thiếu SESSION_SECRET trong .env.local");
}

const secretKey = new TextEncoder().encode(secret);

export type SessionPayload = {
  userId: string;
  username: string;
  role: "ADMIN" | "MANAGER" | "USER";
};

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("6h")
    .sign(secretKey);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);

    if (
      !payload.sub ||
      typeof payload.username !== "string" ||
      (
        payload.role !== "ADMIN" &&
        payload.role !== "MANAGER" &&
        payload.role !== "USER"
      )
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
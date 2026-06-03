import { cookies } from "next/headers";
import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
// Секретный ключ сессии (должен быть 32 байта). Если переменной нет, сгенерируем стабильный на основе PLEX_CLIENT_ID
const SESSION_SECRET = process.env.SESSION_SECRET 
  ? crypto.createHash("sha256").update(process.env.SESSION_SECRET).digest()
  : crypto.createHash("sha256").update(process.env.PLEX_CLIENT_ID || "default-secret-key").digest();

const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, SESSION_SECRET, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(text: string): string | null {
  try {
    const textParts = text.split(":");
    const ivHex = textParts.shift();
    if (!ivHex) return null;
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, SESSION_SECRET, iv);
    let decrypted = decipher.update(encryptedText, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return null;
  }
}

export async function setSession(data: Record<string, any>) {
  const sessionData = JSON.stringify(data);
  const encrypted = encrypt(sessionData);
  const cookieStore = await cookies();
  cookieStore.set("session", encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 дней
  });
}

export async function getSession(): Promise<Record<string, any> | null> {
  const adminToken = process.env.PLEX_TOKEN;
  if (adminToken) {
    return {
      authToken: adminToken,
      user: {
        username: "Plex Admin",
        email: "",
        id: "admin",
        thumb: null
      }
    };
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  if (!sessionCookie) return null;
  const decrypted = decrypt(sessionCookie.value);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

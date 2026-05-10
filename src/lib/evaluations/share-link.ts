import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function generateRawToken(): string {
	return randomBytes(32).toString("base64url");
}

export function hashToken(token: string, pepper: string): string {
	return createHash("sha256")
		.update(token + pepper)
		.digest("hex");
}

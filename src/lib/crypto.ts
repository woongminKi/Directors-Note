import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * 부모 share-link 토큰 발급.
 * - URL 에는 unhashed 토큰
 * - DB 에는 sha256(token + pepper) 만 저장
 * Pepper 는 server-only env (절대 client 노출 X).
 */
export function generateShareLinkToken(): {
	token: string;
	tokenHash: string;
} {
	const token = randomBytes(24).toString("base64url"); // 32 chars URL-safe
	const tokenHash = hashShareLinkToken(token);
	return { token, tokenHash };
}

export function hashShareLinkToken(token: string): string {
	return createHash("sha256")
		.update(`${token}${env.SHARE_LINK_PEPPER}`)
		.digest("hex");
}

/**
 * 30일 후 만료 시각.
 */
export function shareLinkExpiry(): Date {
	const d = new Date();
	d.setDate(d.getDate() + 30);
	return d;
}

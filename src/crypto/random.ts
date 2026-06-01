import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export function generateRandomBytes(length: number): Buffer {
	return randomBytes(length);
}

export function generateOpaqueToken(byteLength = 32): string {
	return randomBytes(byteLength).toString("base64url");
}

export function generateUuid(): string {
	return randomUUID();
}

export function constantTimeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

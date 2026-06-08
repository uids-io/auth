import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { generatePkcePair } from "../../src/crypto/pkce.js";
import { handleAuthorize } from "../../src/oauth/authorize.js";
import {
	createTestAuthKit,
	setupTestDb,
	teardownTestDb,
} from "../helpers/testDb.js";
import type { AuthKit } from "../../src/config.js";
import { createAuthKit } from "../../src/config.js";

describe("handleAuthorize", () => {
	let kit: AuthKit;

	beforeAll(async () => {
		await setupTestDb();
		kit = await createTestAuthKit();
	});

	afterAll(async () => {
		await teardownTestDb();
	});

	it("redirects unauthenticated users to issuer-prefixed login", async () => {
		const testPool = kit.pool;
		const pathKit = await createAuthKit({
			issuer: "http://localhost:3000/api/auth",
			apiAudience: kit.config.apiAudience,
			pg: testPool,
			cookie: kit.config.cookie,
			csrf: { secret: "test-csrf-secret-key-32chars!" },
			email: { sendMagicLink: async () => {} },
		});

		const { challenge, method } = generatePkcePair();
		const result = await handleAuthorize(pathKit, {
			query: {
				response_type: "code",
				client_id: "merchant_portal_web",
				redirect_uri: "https://merchant.example.com/auth/callback",
				scope: "openid profile email",
				state: "portal-state-123",
				code_challenge: challenge,
				code_challenge_method: method,
			},
		});

		expect(result.type).toBe("redirect_login");
		const loginUrl = new URL(result.url);
		expect(loginUrl.origin).toBe("http://localhost:3000");
		expect(loginUrl.pathname).toBe("/api/auth/login");
		expect(loginUrl.searchParams.get("state")).toBe("portal-state-123");
	});
});

import { describe, expect, it } from "vitest";
import { getOpenIdConfiguration } from "../../src/oidc/discovery.js";

describe("getOpenIdConfiguration", () => {
	const kit = {
		config: {
			issuer: "http://localhost:3000/api/auth",
		},
	} as Parameters<typeof getOpenIdConfiguration>[0];

	it("preserves path-prefixed issuer in OIDC endpoints", () => {
		const doc = getOpenIdConfiguration(kit);
		expect(doc.issuer).toBe("http://localhost:3000/api/auth");
		expect(doc.authorization_endpoint).toBe(
			"http://localhost:3000/api/auth/authorize",
		);
		expect(doc.token_endpoint).toBe(
			"http://localhost:3000/api/auth/token",
		);
		expect(doc.jwks_uri).toBe(
			"http://localhost:3000/api/auth/.well-known/jwks.json",
		);
	});
});

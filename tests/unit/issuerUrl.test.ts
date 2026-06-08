import { describe, expect, it } from "vitest";
import { buildIssuerUrl, normalizeIssuer } from "../../src/issuerUrl.js";

describe("buildIssuerUrl", () => {
	it("preserves path-prefixed issuer for login", () => {
		const url = buildIssuerUrl("http://localhost:3000/api/auth", "/login");
		expect(url.href).toBe("http://localhost:3000/api/auth/login");
	});

	it("works when issuer has no path prefix", () => {
		const url = buildIssuerUrl("https://auth.example.com", "/login");
		expect(url.href).toBe("https://auth.example.com/login");
	});

	it("strips trailing slash from issuer", () => {
		const url = buildIssuerUrl("http://localhost:3000/api/auth/", "/login");
		expect(url.href).toBe("http://localhost:3000/api/auth/login");
	});

	it("accepts pathname without leading slash", () => {
		const url = buildIssuerUrl(
			"http://localhost:3000/api/auth",
			"email/magic/callback",
		);
		expect(url.href).toBe(
			"http://localhost:3000/api/auth/email/magic/callback",
		);
	});
});

describe("normalizeIssuer", () => {
	it("strips trailing slash", () => {
		expect(normalizeIssuer("https://auth.example.com/api/auth/")).toBe(
			"https://auth.example.com/api/auth",
		);
	});
});

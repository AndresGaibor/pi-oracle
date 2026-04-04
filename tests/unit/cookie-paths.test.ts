import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock fs.existsSync BEFORE importing cookie-paths
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	readdirSync: vi.fn(),
}));

import { existsSync } from "node:fs";
const mockedExistsSync = vi.mocked(existsSync);

// ---------------------------------------------------------------------------
// Helper: fake process.platform
// ---------------------------------------------------------------------------
const originalPlatform = process.platform;
function overridePlatform(value: string) {
	Object.defineProperty(process, "platform", { value, configurable: true });
}

// ---------------------------------------------------------------------------
// Import the module under test (after mock)
// ---------------------------------------------------------------------------
const {
	detectBrowserDataDir,
	getCookiePath,
} = await import("../../extensions/oracle/lib/cookie-paths");

// ---------------------------------------------------------------------------
// detectBrowserDataDir
// ---------------------------------------------------------------------------
describe("detectBrowserDataDir", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		overridePlatform(originalPlatform);
	});

	it("debe retornar null si el directorio del browser no existe", () => {
		mockedExistsSync.mockReturnValue(false);
		expect(detectBrowserDataDir("brave")).toBeNull();
	});

	it("debe encontrar el directorio de Brave en macOS", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockImplementation(
			(path) => typeof path === "string" && path.includes("BraveSoftware")
		);
		const result = detectBrowserDataDir("brave");
		expect(result).toContain("BraveSoftware");
		expect(result).toContain("Brave-Browser");
	});

	it("debe encontrar el directorio de Chrome en macOS", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockImplementation(
			(path) => typeof path === "string" && path.includes("Google/Chrome")
		);
		const result = detectBrowserDataDir("chrome");
		expect(result).toContain("Google");
		expect(result).toContain("Chrome");
	});

	it("debe encontrar el directorio de Brave en Linux (primary path)", () => {
		overridePlatform("linux");
		mockedExistsSync.mockImplementation(
			(path) => typeof path === "string" && path.includes(".config/BraveSoftware")
		);
		const result = detectBrowserDataDir("brave");
		expect(result).toContain(".config");
		expect(result).toContain("BraveSoftware");
	});

	it("debe encontrar el directorio de Chrome en Windows", () => {
		overridePlatform("win32");
		mockedExistsSync.mockReturnValue(true);
		const result = detectBrowserDataDir("chrome");
		expect(result).toBeTruthy();
		expect(result?.toLowerCase()).toContain("chrome");
	});
});

// ---------------------------------------------------------------------------
// getCookiePath
// ---------------------------------------------------------------------------
describe("getCookiePath", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		overridePlatform(originalPlatform);
	});

	it("debe retornar null si el directorio del browser no existe", () => {
		mockedExistsSync.mockReturnValue(false);
		expect(getCookiePath("brave")).toBeNull();
	});

	it("debe incluir 'Default/Cookies' en la ruta si el directorio existe", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockReturnValue(true);
		const result = getCookiePath("brave", "Default");
		expect(result).toContain("Default");
		expect(result).toContain("Cookies");
	});

	it("debe usar el perfil especificado", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockReturnValue(true);
		const result = getCookiePath("chrome", "Profile 1");
		expect(result).toContain("Profile 1");
		expect(result).toContain("Cookies");
	});

	it("debe usar 'Default' como perfil por defecto", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockReturnValue(true);
		const result = getCookiePath("brave");
		expect(result).toContain("Default");
	});
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock fs.existsSync BEFORE importing browser-detection
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

import { existsSync } from "node:fs";
const mockedExistsSync = vi.mocked(existsSync);

// ---------------------------------------------------------------------------
// Helper: fake process.platform
// ---------------------------------------------------------------------------
function overridePlatform(value: string) {
	Object.defineProperty(process, "platform", { value, configurable: true });
}

const originalPlatform = process.platform;

// ---------------------------------------------------------------------------
// Import the module under test (after mock)
// ---------------------------------------------------------------------------
const {
	detectBravePath,
	detectChromePath,
	detectEdgePath,
	autoDetectBrowser,
	resolveBrowserPath,
} = await import("../../extensions/oracle/lib/browser-detection");

// ---------------------------------------------------------------------------
// detectBravePath
// ---------------------------------------------------------------------------
describe("detectBravePath", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		overridePlatform(originalPlatform);
	});

	it("debe retornar null si Brave no existe en ninguna ruta", () => {
		mockedExistsSync.mockReturnValue(false);
		expect(detectBravePath()).toBeNull();
	});

	it("debe encontrar Brave en macOS si el .app existe", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockImplementation(
			(path) => typeof path === "string" && path.includes("Brave Browser.app")
		);
		const result = detectBravePath();
		expect(result).toContain("Brave Browser.app");
		expect(result).toContain("Contents/MacOS/Brave Browser");
	});

	it("debe encontrar Brave en Linux si /usr/bin/brave-browser existe", () => {
		overridePlatform("linux");
		mockedExistsSync.mockImplementation(
			(path) => typeof path === "string" && path === "/usr/bin/brave-browser"
		);
		expect(detectBravePath()).toBe("/usr/bin/brave-browser");
	});

	it("debe encontrar Brave en Windows si existe en Program Files", () => {
		overridePlatform("win32");
		mockedExistsSync.mockImplementation(
			(path) =>
				typeof path === "string" &&
				path.includes("BraveSoftware") &&
				path.endsWith("brave.exe")
		);
		expect(detectBravePath()).toContain("BraveSoftware");
	});
});

// ---------------------------------------------------------------------------
// detectChromePath
// ---------------------------------------------------------------------------
describe("detectChromePath", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		overridePlatform(originalPlatform);
	});

	it("debe retornar null si Chrome no existe en ninguna ruta", () => {
		mockedExistsSync.mockReturnValue(false);
		expect(detectChromePath()).toBeNull();
	});

	it("debe encontrar Chrome en macOS", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockImplementation(
			(path) => typeof path === "string" && path.includes("Google Chrome.app")
		);
		expect(detectChromePath()).toContain("Google Chrome.app");
	});

	it("debe encontrar Chromium en Linux", () => {
		overridePlatform("linux");
		mockedExistsSync.mockImplementation(
			(path) => typeof path === "string" && path === "/usr/bin/chromium"
		);
		expect(detectChromePath()).toBe("/usr/bin/chromium");
	});
});

// ---------------------------------------------------------------------------
// detectEdgePath
// ---------------------------------------------------------------------------
describe("detectEdgePath", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		overridePlatform(originalPlatform);
	});

	it("debe retornar null si Edge no existe", () => {
		mockedExistsSync.mockReturnValue(false);
		expect(detectEdgePath()).toBeNull();
	});

	it("debe encontrar Edge en macOS", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockImplementation(
			(path) => typeof path === "string" && path.includes("Microsoft Edge.app")
		);
		expect(detectEdgePath()).toContain("Microsoft Edge.app");
	});
});

// ---------------------------------------------------------------------------
// autoDetectBrowser
// ---------------------------------------------------------------------------
describe("autoDetectBrowser", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		overridePlatform(originalPlatform);
	});

	it("debe preferir Brave sobre Chrome", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockImplementation(
			(path) =>
				typeof path === "string" &&
				(path.includes("Brave Browser.app") || path.includes("Google Chrome.app"))
		);
		const result = autoDetectBrowser();
		expect(result).not.toBeNull();
		expect(result!.name).toBe("brave");
	});

	it("debe usar Chrome si Brave no existe", () => {
		overridePlatform("darwin");
		mockedExistsSync.mockImplementation(
			(path) =>
				typeof path === "string" &&
				path.includes("Google Chrome.app") &&
				!path.includes("Brave Browser.app")
		);
		const result = autoDetectBrowser();
		expect(result).not.toBeNull();
		expect(result!.name).toBe("chrome");
	});

	it("debe retornar null si no hay ningún browser disponible", () => {
		mockedExistsSync.mockReturnValue(false);
		expect(autoDetectBrowser()).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// resolveBrowserPath (capas)
// ---------------------------------------------------------------------------
describe("resolveBrowserPath", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.BROWSER_PATH;
		delete process.env.ORACLE_BROWSER_PATH;
	});

	afterEach(() => {
		overridePlatform(originalPlatform);
		delete process.env.BROWSER_PATH;
		delete process.env.ORACLE_BROWSER_PATH;
	});

	it("Capa 1: debe priorizar configuración explícita sobre auto-detección", () => {
		mockedExistsSync.mockReturnValue(true);
		const result = resolveBrowserPath("/custom/path/to/chrome");
		expect(result.executablePath).toBe("/custom/path/to/chrome");
		expect(result.source).toBe("config");
	});

	it("Capa 2: debe priorizar BROWSER_PATH env var sobre auto-detección", () => {
		process.env.BROWSER_PATH = "/env/path/to/chrome";
		mockedExistsSync.mockReturnValue(true);
		const result = resolveBrowserPath();
		expect(result.executablePath).toBe("/env/path/to/chrome");
		expect(result.source).toBe("env");
	});

	it("Capa 2 alternative: debe respetar ORACLE_BROWSER_PATH env var", () => {
		process.env.ORACLE_BROWSER_PATH = "/env2/path/to/firefox";
		mockedExistsSync.mockReturnValue(true);
		const result = resolveBrowserPath();
		expect(result.executablePath).toBe("/env2/path/to/firefox");
		expect(result.source).toBe("env");
	});

	it("Capa 4: debe retornar fallback 'chromium' si no encuentra nada", () => {
		delete process.env.BROWSER_PATH;
		delete process.env.ORACLE_BROWSER_PATH;
		mockedExistsSync.mockReturnValue(false);
		const result = resolveBrowserPath();
		expect(result.executablePath).toBe("chromium");
		expect(result.source).toBe("fallback");
	});

	it("BROWSER_PATH tiene prioridad sobre ORACLE_BROWSER_PATH", () => {
		process.env.BROWSER_PATH = "/primary/env/path";
		process.env.ORACLE_BROWSER_PATH = "/secondary/env/path";
		const result = resolveBrowserPath();
		expect(result.executablePath).toBe("/primary/env/path");
	});
});

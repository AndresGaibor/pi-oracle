/**
 * Mock factory for BrowserActions — enables testing Page Objects and actions
 * without a real browser.
 *
 * Each method is a vitest mock function so tests can assert call arguments,
 * return values, and call counts.
 */
import { vi } from "vitest";
import type { BrowserActions } from "../../extensions/oracle/pages/browser-actions.types";

interface MockBrowserActions extends BrowserActions {
	snapshotText: ReturnType<typeof vi.fn>;
	pageText: ReturnType<typeof vi.fn>;
	evaluate: ReturnType<typeof vi.fn>;
	clickRef: ReturnType<typeof vi.fn>;
	fill: ReturnType<typeof vi.fn>;
	type: ReturnType<typeof vi.fn>;
	press: ReturnType<typeof vi.fn>;
	screenshot: ReturnType<typeof vi.fn>;
	getMainPageId: ReturnType<typeof vi.fn>;
	getCurrentUrl: ReturnType<typeof vi.fn>;
}

const DEFAULT_PAGE_ID = "mock-main-page";
const DEFAULT_URL = "https://chatgpt.com/";

/**
 * Create a mock BrowserActions implementation.
 *
 * ```ts
 * const mock = createMockBrowserActions();
 * mock.snapshotText.mockResolvedValue("my snapshot");
 * mock.evaluate.mockResolvedValue(JSON.stringify({ messages: [] }));
 * ```
 *
 * You can pass overrides that return custom values:
 * ```ts
 * const mock = createMockBrowserActions({
 *     snapshotText: async () => `button "Send" @e1`,
 *     getCurrentUrl: async () => "https://chatgpt.com/c/abc123",
 * });
 * ```
 */
export function createMockBrowserActions(
    overrides?: Partial<Record<keyof BrowserActions, (...args: unknown[]) => unknown>>,
): MockBrowserActions {
    return {
        snapshotText: vi.fn(
            overrides?.snapshotText ?? (async () => ""),
        ),
        pageText: vi.fn(
            overrides?.pageText ?? (async () => ""),
        ),
        evaluate: vi.fn(
            overrides?.evaluate ?? (async () => null),
        ),
        clickRef: vi.fn(
            overrides?.clickRef ?? (async () => {}),
        ),
        fill: vi.fn(
            overrides?.fill ?? (async () => {}),
        ),
        type: vi.fn(
            overrides?.type ?? (async () => {}),
        ),
        press: vi.fn(
            overrides?.press ?? (async () => {}),
        ),
        screenshot: vi.fn(
            overrides?.screenshot ?? (async () => {}),
        ),
        getMainPageId: vi.fn(
            overrides?.getMainPageId ?? (() => DEFAULT_PAGE_ID),
        ),
        getCurrentUrl: vi.fn(
            overrides?.getCurrentUrl ?? (async () => DEFAULT_URL),
        ),
        open: overrides?.open
            ? vi.fn(overrides.open)
            : vi.fn(async () => {}),
        reload: overrides?.reload
            ? vi.fn(overrides.reload)
            : vi.fn(async () => {}),
    } as MockBrowserActions;
}

/**
 * BrowserActions – the contract between Page Objects and the browser infrastructure layer.
 *
 * This is the only interface that Page Objects receive to interact with the browser.
 * The Playwright `page` object is NEVER exposed directly to Page Objects.
 *
 * Extracted to its own file to avoid circular dependencies at runtime.
 *
 * @remarks
 * All methods accept an optional `pageId` parameter for multi-page scenarios.
 * In most cases, Page Objects should omit it (the worker uses the main page).
 */
export interface BrowserActions {
	/**
	 * Returns the accessibility snapshot of the current page as plain text.
	 * The snapshot represents the accessibility tree (roles, labels, states).
	 * This is the primary data source for assertions and state classification.
	 */
	snapshotText(pageId?: string): Promise<string>;

	/**
	 * Returns the full innerText of the page body.
	 * Useful for broad text searches when the accessibility tree is insufficient.
	 */
	pageText(pageId?: string): Promise<string>;

	/**
	 * Evaluates a JavaScript script in the page context.
	 * @param pageId - The page identifier (required for evaluation)
	 * @param script - JavaScript code to evaluate
	 */
	evaluate(pageId: string, script: string): Promise<unknown>;

	/**
	 * Clicks an element by its snapshot ref token (e.g., "@e123").
	 * @param refOrToken - Snapshot ref ("@e123") or selector
	 */
	clickRef(refOrToken: string, pageIdHint?: string): Promise<void>;

	/**
	 * Fills a text input element with the given text.
	 * Clears any existing value before typing.
	 * @param refOrToken - Snapshot ref or selector of the input element
	 */
	fill(refOrToken: string, text: string, pageIdHint?: string): Promise<void>;

	/**
	 * Types text into the currently focused element (simulates keypresses).
	 * Useful for contenteditable or rich-text editors that don't support fill().
	 * @param text - Text to type character by character
	 */
	type(text: string, pageId?: string): Promise<void>;

	/**
	 * Presses a keyboard key on the currently focused element.
	 * @param key - Key name (e.g., "Enter", "Escape", "Tab")
	 */
	press(key: string, pageId?: string): Promise<void>;

	/**
	 * Takes a screenshot of the current page.
	 * @param destPath - File path to write the screenshot to
	 */
	screenshot(destPath: string, pageId?: string): Promise<void>;

	/**
	 * Returns the page ID of the main browser page.
	 * Used by evaluate() and other methods that require a pageId.
	 */
	getMainPageId(): string;

	/** Opens a URL in the main page. Optional — not all implementations provide this. */
	open?(url: string): Promise<void>;

	/** Reloads the current page. Optional. */
	reload?(pageId?: string): Promise<void>;

	/**
	 * Returns the current URL of the main page.
	 * Useful for verifying navigation or extracting conversation IDs.
	 */
	getCurrentUrl(): Promise<string>;
}

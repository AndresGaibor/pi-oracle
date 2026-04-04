/**
 * BrowserActions – the contract between Page Objects and the browser infrastructure layer.
 * Extracted to its own file to avoid circular dependencies at runtime.
 */

export interface BrowserActions {
	/** Get snapshot text of the current page */
	snapshotText(pageId?: string): Promise<string>;
	/** Get body innerText of the current page */
	pageText(pageId?: string): Promise<string>;
	/** Evaluate a script in the page context */
	evaluate(pageId: string, script: string): Promise<unknown>;
	/** Click an element by ref token or selector */
	clickRef(refOrToken: string, pageIdHint?: string): Promise<void>;
	/** Fill text into an element */
	fill(refOrToken: string, text: string, pageIdHint?: string): Promise<void>;
	/** Type text into a focused element (like contenteditable) */
	type(text: string, pageId?: string): Promise<void>;
	/** Press a keyboard key (e.g., 'Enter', 'Escape') */
	press(key: string, pageId?: string): Promise<void>;
	/** Take a screenshot */
	screenshot(destPath: string, pageId?: string): Promise<void>;
	/** Get the main page ID for evaluation */
	getMainPageId(): string;
	/** Open a URL in the main page */
	open?(url: string): Promise<void>;
	/** Reload the page */
	reload?(pageId?: string): Promise<void>;
	/** Get current URL */
	getCurrentUrl(): Promise<string>;
}

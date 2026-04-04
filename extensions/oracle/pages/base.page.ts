/**
 * ## Page Object Model (POM) — Estructura
 *
 * Este proyecto usa un patrón POM con 3 archivos por página:
 *
 * - `{provider}.selectors.ts` — Selectores CSS, data-testid, labels textuales
 * - `{provider}.actions.ts`    — Funciones puras de acción (reciben BrowserActions)
 * - `{provider}.assertions.ts` — Funciones puras de aserción (reciben snapshot string)
 * - `{provider}.page.ts`       — Page Object principal (extiende BasePage, delega a actions/assertions)
 *
 * ### Convenciones:
 *
 * 1. **Imports estáticos** — Todos los imports son estáticos al inicio del archivo.
 *    Los `await import()` dinámicos solo se usan si hay dependencias circulares reales.
 *
 * 2. **Sin require()** — Todos los imports usan sintaxis ESM (`import` / `import type`).
 *
 * 3. **data-testid primero** — Los selectores basados en `data-testid` son la estrategia
 *    primaria. Los text labels se mantienen como fallback con `@deprecated`.
 *
 * 4. **Tipos canónicos** — `ParsedSnapshotEntry` (de `shared/snapshot-utils.ts`) es el
 *    único tipo de entrada de snapshot. `BrowserActions` (de `browser-actions.types.ts`)
 *    es la única interfaz de acciones del navegador.
 *
 * 5. **Funciones puras** — Actions y assertions son funciones puras exportadas, no métodos
 *    de clase. Esto permite testing independiente y mocking fácil.
 */

// pages/base.page.ts - Base Page Object Model class

import {
	parseSnapshotEntries,
	findEntry,
	findLastEntry,
	type ParsedSnapshotEntry,
} from "../shared/snapshot-utils";
import type { BrowserActions } from "./browser-actions.types";

/** Subset of ParsedSnapshotEntry used by BasePage */
export type SnapshotEntry = Pick<ParsedSnapshotEntry, "ref" | "kind" | "label" | "disabled" | "checked" | "href" | "value" | "placeholder">;


/**
 * BasePage – Pure Page Object Model base class.
 * Provides snapshot parsing and query utilities that work with any BrowserActions implementation.
 */
export class BasePage {
	/**
	 * Find entry in snapshot by predicate
	 */
	protected findEntry(
		snapshot: string,
		predicate: (e: SnapshotEntry) => boolean,
	): SnapshotEntry | undefined {
		const entry = findEntry(snapshot, (e: ParsedSnapshotEntry) =>
			predicate({
				ref: e.ref,
				kind: e.kind,
				label: e.label,
				disabled: e.disabled,
				checked: e.checked,
				href: e.href,
				value: e.value,
				placeholder: e.placeholder,
			}),
		);
		return entry
			? {
					ref: entry.ref,
					kind: entry.kind,
					label: entry.label,
					disabled: entry.disabled,
					checked: entry.checked,
					href: entry.href,
					value: entry.value,
					placeholder: entry.placeholder,
				}
			: undefined;
	}

	/**
	 * Find last entry in snapshot by predicate
	 */
	protected findLastEntry(
		snapshot: string,
		predicate: (e: SnapshotEntry) => boolean,
	): SnapshotEntry | undefined {
		const entry = findLastEntry(snapshot, (e: ParsedSnapshotEntry) =>
			predicate({
				ref: e.ref,
				kind: e.kind,
				label: e.label,
				disabled: e.disabled,
				checked: e.checked,
				href: e.href,
				value: e.value,
				placeholder: e.placeholder,
			}),
		);
		return entry
			? {
					ref: entry.ref,
					kind: entry.kind,
					label: entry.label,
					disabled: entry.disabled,
					checked: entry.checked,
					href: entry.href,
					value: entry.value,
					placeholder: entry.placeholder,
				}
			: undefined;
	}

	/**
	 * Parse raw snapshot into structured entries
	 */
	protected parseSnapshot(raw: string): SnapshotEntry[] {
		const parsed = parseSnapshotEntries(raw);
		return parsed.map((p) => ({
			ref: p.ref,
			kind: p.kind,
			label: p.label,
			disabled: p.disabled,
			checked: p.checked,
			href: p.href,
			value: p.value,
			placeholder: p.placeholder,
		}));
	}

	/**
	 * Check if label matches any candidate
	 */
	protected labelMatches(actual: string, candidates: readonly string[]): boolean {
		const normalized = actual.toLowerCase().trim();
		return candidates.some((c) => normalized.includes(c.toLowerCase()));
	}

	/**
	 * Find entries by kind
	 */
	protected filterByKind(snapshot: string, kind: string): SnapshotEntry[] {
		return this.parseSnapshot(snapshot).filter((e) => e.kind === kind);
	}
	/**
	 * Find enabled entries
	 */
	protected enabledOnly(entries: SnapshotEntry[]): SnapshotEntry[] {
		return entries.filter((e) => !e.disabled);
	}
}

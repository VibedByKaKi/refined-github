/* eslint-disable @typescript-eslint/naming-convention, new-cap, unicorn/no-computed-property-existence-check, unicorn/no-global-object-property-assignment -- Mirrors the `chrome.*` and `GM_*` APIs */
// Minimal `chrome.*` implementation for running the extension as a userscript.
// Storage uses the `GM_*` API, messages are answered in the same context.

declare const GM_getValue: (key: string, fallback?: unknown) => unknown;
declare const GM_setValue: (key: string, value: unknown) => void;
declare const GM_deleteValue: (key: string) => void;
declare const GM_listValues: () => string[];
declare const GM_openInTab: (url: string, options?: {active?: boolean}) => void;
declare const GM_xmlhttpRequest: (details: {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	onload: (response: {status: number; responseText: string}) => void;
	onerror: () => void;
}) => void;
declare const __USERSCRIPT_VERSION__: string;

function createEvent(): {
	addListener: (listener: (...arguments_: any[]) => unknown) => unknown;
	removeListener: (listener: (...arguments_: any[]) => unknown) => unknown;
	hasListener: (listener: (...arguments_: any[]) => unknown) => boolean;
	dispatch: (...arguments_: unknown[]) => void;
} {
	type Listener = (...arguments_: any[]) => unknown;
	const listeners = new Set<Listener>();
	return {
		addListener: (listener: Listener) => listeners.add(listener),
		removeListener: (listener: Listener) => listeners.delete(listener),
		hasListener: (listener: Listener) => listeners.has(listener),
		dispatch(...arguments_: unknown[]) {
			for (const listener of listeners) {
				listener(...arguments_);
			}
		},
	};
}

const onChanged = createEvent();

function createStorageArea(areaName: string, persistent: boolean): Record<string, any> {
	const prefix = `chrome.storage.${areaName}:`;
	const memory = new Map<string, unknown>();

	const read = (key: string): unknown => persistent ? GM_getValue(prefix + key) : memory.get(key);
	const write = (key: string, value: unknown): void => {
		if (persistent) {
			GM_setValue(prefix + key, value);
		} else {
			memory.set(key, value);
		}
	};

	const erase = (key: string): void => {
		if (persistent) {
			GM_deleteValue(prefix + key);
		} else {
			memory.delete(key);
		}
	};

	const getKeys = async (): Promise<string[]> =>
		persistent
			? GM_listValues().filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length))
			: [...memory.keys()];

	return {
		getKeys,
		async get(request?: string | string[] | Record<string, unknown>) {
			const defaults: Record<string, unknown> =
				request === undefined || (typeof request === 'string') || Array.isArray(request) ? {} : request;
			const keys = typeof request === 'string'
				? [request]
				: (Array.isArray(request) ? request : (request ? Object.keys(request) : await getKeys()));
			const result: Record<string, unknown> = {};
			for (const key of keys) {
				const value = read(key);
				if (value !== undefined) {
					result[key] = value;
				} else if (key in defaults) {
					result[key] = defaults[key];
				}
			}

			return result;
		},
		async set(items: Record<string, unknown>) {
			const changes: Record<string, {oldValue?: unknown; newValue?: unknown}> = {};
			for (const [key, value] of Object.entries(items)) {
				changes[key] = {oldValue: read(key), newValue: value};
				write(key, value);
			}

			onChanged.dispatch(changes, areaName);
		},
		async remove(keys: string | string[]) {
			const changes: Record<string, {oldValue?: unknown}> = {};
			for (const key of [keys].flat()) {
				changes[key] = {oldValue: read(key)};
				erase(key);
			}

			onChanged.dispatch(changes, areaName);
		},
		async clear() {
			await this.remove(await getKeys());
		},
		async getBytesInUse() {
			return 0;
		},
		async setAccessLevel() {/* Not needed */},
	};
}

/** Page requests to other origins are blocked by GitHub's CSP, so they go through the userscript manager */
async function xhr(url: string, options: RequestInit = {}): Promise<string> {
	return new Promise((resolve, reject) => {
		GM_xmlhttpRequest({
			url,
			method: options.method,
			headers: Object.fromEntries(new Headers(options.headers).entries()),
			onload(response) {
				resolve(response.status >= 200 && response.status < 300 ? response.responseText : '');
			},
			onerror() {
				reject(new Error(`Request to ${url} failed`));
			},
		});
	});
}

// There is no background page: its handlers are the local equivalents
const messageHandlers: Record<string, (argument: any) => Promise<unknown>> = {
	async ping() {
		return 'pong';
	},
	async openUrls(urls: string[]) {
		for (const url of urls) {
			GM_openInTab(url, {active: false});
		}
	},
	async closeTab() {
		globalThis.close();
	},
	async fetchText({url, options}: {url: string; options: RequestInit}) {
		return xhr(url, options);
	},
	async fetchJson(url: string) {
		return JSON.parse(await xhr(url));
	},
	async openOptionsPage() {/* No options page */},
};

const manifest = {
	name: 'Refined GitHub',
	version: __USERSCRIPT_VERSION__,
	manifest_version: 3,
};

(globalThis as any).chrome = {
	runtime: {
		id: 'refined-github-userscript',
		getManifest: () => manifest,
		getURL: (path: string) => path,
		onMessage: createEvent(),
		onInstalled: createEvent(),
		async sendMessage(message: Record<string, unknown>) {
			for (const [id, argument] of Object.entries(message)) {
				if (id in messageHandlers) {
					return messageHandlers[id](argument);
				}
			}

			return undefined;
		},
	},
	storage: {
		sync: createStorageArea('sync', true),
		local: createStorageArea('local', true),
		session: createStorageArea('session', false),
		onChanged,
	},
	permissions: {
		contains: async () => true,
		request: async () => true,
		onAdded: createEvent(),
		onRemoved: createEvent(),
	},
	tabs: {
		async create({url, active = true}: {url: string; active?: boolean}) {
			GM_openInTab(url, {active});
		},
		async remove() {
			globalThis.close();
		},
		async reload() {
			location.reload();
		},
	},
};

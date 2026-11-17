import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'tsdown';
import svelte from 'rollup-plugin-svelte';

import svelteConfig from '../../svelte.config.js';

const output = 'distribution-userscript';
const cssFile = path.join(output, 'refined-github.css');

/** The version is the commit date as calver (`26.11.17`), so the same commit always produces the same file */
function getVersion() {
	const date = execFileSync('git', ['show', '--no-patch', '--format=%cs', 'HEAD'], {encoding: 'utf8'}).trim();
	const [year, month, day] = date.split('-').map(Number);
	return `${year - 2000}.${month}.${day}`;
}

const version = process.env.USERSCRIPT_VERSION ?? getVersion();
const repository = process.env.GITHUB_REPOSITORY ?? 'refined-github/refined-github';

fs.rmSync(output, {recursive: true, force: true});

/** @type {import('tsdown').UserConfig} */
const shared = {
	platform: 'browser',
	dts: false,
	hash: false,
	fixedExtension: false,
	deps: {alwaysBundle: [/.*/], onlyBundle: false},
	alias: {react: 'dom-chef'},
	loader: {'.gql': 'text', '.svg': 'text'},
	inputOptions: {
		resolve: {conditionNames: ['production', 'browser', 'module', 'import', 'default']},
		transform: {jsx: {runtime: 'classic'}},
	},
	target: false,
	clean: false,
	outDir: output,
	report: {summary: true},
};

/** Features read their ID from `import.meta.url`, which doesn't exist in a single-file bundle */
const importMetaUrl = {
	name: 'import-meta-url',
	transform: {
		filter: {code: 'import.meta.url'},
		handler(code, id) {
			return code.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(id).href));
		},
	},
};

await build({
	...shared,
	config: false,
	entry: {'refined-github': 'build/userscript/entry.ts'},
	format: 'iife',
	define: {__USERSCRIPT_VERSION__: JSON.stringify(version)},
	css: {splitting: false, fileName: 'refined-github.css'},
	plugins: [importMetaUrl, svelte(svelteConfig)],
});

const js = fs.readFileSync(path.join(output, 'refined-github.iife.js'), 'utf8');
const css = fs.readFileSync(cssFile, 'utf8');

const header = `// ==UserScript==
// @name         Refined GitHub
// @namespace    https://github.com/${repository}
// @version      ${version}
// @description  Simplifies the GitHub interface and adds useful features
// @homepageURL  https://github.com/${repository}
// @downloadURL  https://github.com/${repository}/releases/download/userscript/refined-github.user.js
// @updateURL    https://github.com/${repository}/releases/download/userscript/refined-github.user.js
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @exclude      https://github.com/login/*
// @connect      gist.github.com
// @connect      refined-github.github.io
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// @license      MIT
// ==/UserScript==
`;

const style = `(() => {
	const style = document.createElement('style');
	style.textContent = ${JSON.stringify(css)};
	(document.head ?? document.documentElement).append(style);
})();
`;

fs.writeFileSync(path.join(output, 'refined-github.user.js'), `${header}\n${style}\n${js}`);

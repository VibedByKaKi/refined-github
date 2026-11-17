# Userscript build

`npm run build:userscript` bundles the extension into `distribution-userscript/refined-github.user.js`.

- The version is the date of the latest commit (`26.11.17`), so the same commit always produces the same file.
- `shim.ts` implements the parts of `chrome.*` that the content script uses. Storage uses `GM_getValue`/`GM_setValue`, and cross-origin requests use `GM_xmlhttpRequest`.
- There is no options page, so every feature uses its default setting.
- The `Userscript` workflow builds the file on every push to `dev`, uploads it as an artifact without a ZIP, and attaches it to the `userscript` release. Install it from `https://github.com/<owner>/refined-github/releases/download/userscript/refined-github.user.js`.

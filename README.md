# OmniCode

<p align="center">
  <img src="docs/media/omnicode-logo.png" alt="OmniCode logo" width="220">
</p>

<p align="center">
  OmniCode is a branded VS Code fork with a native OmniProxy control center, custom endpoint model management, multi-provider routing, and OmniRoute-backed provider operations built directly into the workbench.
</p>

## Overview

OmniCode replaces the default Code - OSS branding with the OmniCode identity and adds a first-party OmniProxy workflow inside the editor. The integration is native to the workbench rather than a webview overlay:

- `OmniProxy` opens from the titlebar entry that replaced the old agent action.
- OmniProxy now runs from an embedded runtime inside `vscode-main/omniroute-runtime`, so it no longer depends on a separate `OmniRoute-main` folder name or sibling checkout layout.
- Public repository builds do not ship live OAuth client defaults. Provider OAuth values must be supplied through a local ignored `.env` or deployment secrets.
- Provider management, model sync, usage analytics, cache controls, quotas, and media state are rendered in a native workbench editor.
- Custom endpoints are added through the standard language model flow and can fetch models directly from the configured API.
- Synced OmniProxy models appear in the same model picker used by chat and agents.

## Screenshots

### OmniProxy Control Center

![OmniProxy dashboard](docs/media/omniproxy-dashboard.png)

### Limits and quota overview

![OmniProxy limits](docs/media/omniproxy-limits.png)

## Key capabilities

- Native OmniProxy workspace with dedicated sections for `Home`, `Providers`, `Combos`, `Batch Testing`, `Costs`, `Analytics`, `Cache`, `Limits & Quotas`, and `Media`
- Multi-account provider connection support, including synced model availability inside the normal chat model picker
- Custom endpoint setup that asks only for group name, API key reference, and base URL, then fetches available models from the endpoint
- VS Code-native OmniProxy UI styling with smaller cards, neutral icons, standard theme tokens, and minimal decoration
- Branded OmniCode app icons, in-product logo assets, and renamed product surfaces
- Local-secret handling through VS Code secret storage instead of committed credentials

## Quick start

### Requirements

- macOS with the Electron desktop build chain used by VS Code
- Node.js `22.x`
- npm `10.x`

### Install

```bash
npm install
```

### Build

```bash
npm run gulp compile
node build/next/index.ts bundle --out out --target desktop
```

### Run

```bash
open -na '/Users/amirhamza/Desktop/vscode-main/.build/electron/OmniCode.app' --args '/Users/amirhamza/Desktop/vscode-main'
```

## Security and credentials

No user API keys are stored in this repository. Sensitive values should be entered at runtime and stored through VS Code secret storage or local user profile state outside the repo. Generated local automation captures have also been removed from the workspace and should remain ignored.

## Documentation

- [Detailed OmniCode documentation](docs/OMNICODE.md)
- [Contributing notes](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

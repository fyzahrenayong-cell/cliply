# Cliply 2.0 — Browser-only edition

Cliply is a local-first paste and file vault. It has **no application backend, no database server, no user accounts, and no cloud file storage**. The hosting provider serves the static app only; all paste content and uploaded files remain in the browser that created them.

## Storage architecture

- **IndexedDB** stores paste records, file Blobs, and API-token metadata. It supports larger values than localStorage and is appropriate for uploaded files.
- **localStorage** stores the local workspace profile and small preferences.
- **Web Crypto** generates cryptographically random token secrets and stores SHA-256 digests instead of the displayed token strings.
- **Export / Import** creates a JSON backup containing paste content, file bytes, profile settings, and token metadata. Keep backups private: token digests and private paste content are included.

## Important token limitation

The token manager supports local token generation, encrypted-at-rest token secrets (AES-GCM with a PBKDF2-derived key), repeat reveal after entering the vault passphrase, expiry metadata, and revocation in this browser. It does **not** provide a remotely callable API or authenticate requests from other devices. A browser-only app has no trusted server that can validate a token, enforce scopes, or grant access to an account remotely. Client-side checks cannot securely protect data from someone who controls the browser or its developer tools.

If remote API access is required later, Cliply will need a backend. That backend should store only token hashes, validate scopes and expiry server-side, support revocation, rate-limit requests, and never expose an account-wide master credential in the frontend.

## Local data behavior

- All saved pastes and files are private to the current browser profile.
- A copied Cliply reference is only a local browser reference. It will not open on another device unless the data is exported and imported there.
- Visibility choices are labels only in local mode; they do not publish content or create access controls.
- Clearing site data, using a private browsing session, or browser/device cleanup can erase stored content. Export backups regularly.
- The app does not synchronize between browsers or devices.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

Wrangler serves the static frontend locally. No D1 database, R2 bucket, API secrets, or account setup is needed.

## Deploy

The app can be deployed as static files to any static host. For Cloudflare Workers Static Assets:

```bash
npx wrangler login
npm run deploy
```

No database or bucket bindings are configured. The Worker only serves files from `public/`.

## Features

- Create and search local text pastes
- Store files up to 25 MB per file in IndexedDB
- Local profile name
- Export all data and import a backup
- Individual paste export and deletion
- Local token generation, read/read-write scope labels, expiry, and revocation
- Delete all local data

## Security and production notes

This is a local browser application, not a hosted paste-sharing service. Do not put sensitive secrets into pastes if other people can use the same device/browser profile. Browser storage is not a substitute for server-side access control. Token hashes in IndexedDB reduce accidental disclosure of the token string, but do not create a secure remote authentication system. The static page loads fonts and Highlight.js from third-party CDNs; self-host those assets if you want to avoid those external requests.

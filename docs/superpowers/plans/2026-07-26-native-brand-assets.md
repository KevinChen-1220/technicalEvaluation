# Native Brand Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate, configure, and verify a complete SkillScope native icon and splash asset set.

**Architecture:** Use AI generation for the master full icon and transparent foreground, then derive platform sizes and the monochrome silhouette deterministically. Keep all native paths in Expo config and validate them with a small PNG/config verifier.

**Tech Stack:** Expo SDK 53, PNG assets, Node.js verification, built-in ImageGen

## Global Constraints

- The mark is a white assessment check inside a focus ring.
- Use `#1F7A68` for the primary icon background and `#F4F7F2` for splash.
- No text, gradients, shadows, thin lines, or detailed illustration.
- All master native assets are 1024x1024 PNG files.
- Transparent assets must include an alpha channel.

---

### Task 1: Asset Verification Contract

**Files:**
- Create: `scripts/verify-native-assets.mjs`
- Modify: `package.json`

- [x] **Step 1: Add the verifier and package script**

Check Expo icon, iOS icon, Android icon, adaptive foreground, monochrome image,
and splash image paths. Read PNG headers to require 1024x1024 native masters and
alpha-capable color types for transparent assets.

- [x] **Step 2: Run the verifier and confirm failure**

Run: `npm run verify:assets`

Expected: FAIL because the native asset configuration is not present.

### Task 2: Generate and Derive Brand Assets

**Files:**
- Create: `assets/icon.png`
- Create: `assets/adaptive-icon.png`
- Create: `assets/monochrome-icon.png`
- Create: `assets/splash-icon.png`
- Modify: `public/icon-192.png`
- Modify: `public/icon-512.png`

- [x] **Step 1: Generate the full application icon**

Use the built-in ImageGen tool with the approved geometric ring-and-check
direction and no text.

- [x] **Step 2: Generate a chroma-key foreground**

Generate the same mark on a flat magenta background, remove the key locally,
and verify transparent corners and safe-zone padding.

- [x] **Step 3: Derive remaining assets**

Create monochrome and splash assets from the foreground silhouette, and resize
the full icon for Web/PWA.

### Task 3: Configure and Verify Expo

**Files:**
- Modify: `app.json`

- [x] **Step 1: Configure native icon and splash paths**

Add top-level, iOS, Android, adaptive, monochrome, and splash configuration.

- [x] **Step 2: Run focused verification**

Run: `npm run verify:assets`

Expected: PASS.

- [x] **Step 3: Run full verification**

Run:

```powershell
npm test -- --runInBand
npm run typecheck
npx expo config --type public
npm run build:web
npm run verify:web
```

Expected: all commands pass and the Web build references the refreshed icons.


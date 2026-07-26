# Native Brand Assets Design

## Goal

Create and configure a coherent SkillScope icon and splash asset set for iOS,
Android, Android themed icons, Web, and PWA installation.

## Visual Direction

Preserve the product's existing visual idea: an assessment check mark held
inside a focus ring. Redraw it as a simple, geometric, high-contrast mark that
remains recognizable at small launcher-icon sizes.

- Primary green: `#1F7A68`
- Deep ink: `#17232C`
- Splash background: `#F4F7F2`
- Mark color: white
- No text, letters, gradients, shadows, thin lines, or detailed illustration
- Keep the important mark inside the Android adaptive-icon safe zone

## Asset Set

- `assets/icon.png`: 1024x1024 full-bleed application and store icon.
- `assets/adaptive-icon.png`: 1024x1024 transparent Android foreground.
- `assets/monochrome-icon.png`: 1024x1024 one-color transparent Android 13+
  themed icon derived from the approved foreground silhouette.
- `assets/splash-icon.png`: 1024x1024 transparent centered mark used with a
  solid splash background.
- `public/icon-192.png` and `public/icon-512.png`: resized PWA icons.

The full icon and transparent foreground are generated with the built-in image
generation tool. Monochrome and resized outputs are deterministic derivatives
so every platform uses the same silhouette.

## Expo Configuration

- Set top-level `expo.icon`.
- Set `ios.icon`.
- Set `android.icon`.
- Configure Android adaptive foreground, monochrome image, and background color.
- Configure the top-level splash image, `contain` resize mode, and background
  color.
- Keep the Web favicon and PWA manifest pointing at the resized icon files.

## Validation

Add a repository verification script that checks required configuration paths,
file existence, PNG dimensions, and alpha support for transparent assets. Run
it with tests, type checking, Expo public config inspection, and Web export.


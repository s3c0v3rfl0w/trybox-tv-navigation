# TryBox TV Navigation — experimental TizenBrew module

This unofficial module opens the real `https://trybox.app/` and adds D-pad focus in the page. It does not need Trybox's source code or an API. It contains no account information and makes no network requests of its own.

## Status

On 2026-10-25, signed-in inspection showed that `/tvbox` returns Trybox's 404 page. On the regular homepage, Right/Down left a focused title card unchanged; Enter opened its preview and Escape dismissed it. The profile menu exposed a performance toggle but no TV mode.

The module implements geometric directional focus, high-contrast highlighting, scrolling to selected controls, Enter activation, focus recovery after page updates, and preview/menu focus isolation. It preserves input/select/slider editing. Hardware Back is translated to Escape inside detected overlays. Root-level Back remains the host's responsibility. Media keys affect visible same-document HTML video only.

**Not verified on a Samsung TV.** Four geometry tests passed. In the included synthetic browser fixture, arrows moved Home → Movies → Card A → Card B; Enter opened the preview and activated its action; Escape restored Card B; Down selected Card I. These checks do not prove real-site or S85F compatibility. The browser tool used to inspect Trybox cannot inject the module into the live page. Cross-origin embedded players cannot be controlled by this module. Trybox DOM changes may require maintenance. Nested overlays and TV on-screen keyboard behavior need device testing.

## Install in TizenBrew

1. Install [TizenBrew using its maintained instructions](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md). Test that its module/settings UI works before proceeding; [a Tizen 9 settings issue is open](https://github.com/reisxd/TizenBrew/issues/245).
2. In TizenBrew, open its module settings and add a GitHub module. Enter `s3c0v3rfl0w/trybox-tv-navigation@v0.1.0` if the interface asks for owner/repository. If it asks for a full module identifier, enter `gh/s3c0v3rfl0w/trybox-tv-navigation@v0.1.0`.
3. Return to the module list and launch **TryBox TV Navigation**.
4. Sign in directly on the TV. Do not place login cookies or account credentials in this repository.
5. Test arrows across rails, vertical movement, OK, Back, preview focus restoration, search entry, subtitles, and playback on the S85F. If the player is a third-party frame, its controls require separate integration or pointer fallback.

This repository contains only the navigation script, package metadata, and documentation. It contains no Trybox credentials or cookies. See [TizenBrew's module contract](https://github.com/reisxd/TizenBrew/blob/main/docs/MODULES.md) for metadata. The package.json `private` flag prevents accidental npm publishing; it does not control GitHub repository visibility.

## Local verification

The geometry tests and synthetic browser fixture were run in the development workspace and are not included in this three-file distribution. Syntax can be checked with `node --check main.js`. The pure geometry function is available to Node through `require('./main.js').score` without starting the browser runtime.

## Public distribution

TizenBrew retrieves these files through jsDelivr. Published versions can remain available in CDN caches even if this repository later becomes private or is deleted. Keep this repository accessible for reliable loading and updates. This project is unofficial and is not affiliated with Trybox or Samsung.

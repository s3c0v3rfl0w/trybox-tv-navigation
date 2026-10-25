# TryBox TV Navigation — experimental TizenBrew module

This unofficial module opens the real `https://trybox.app/` and adds D-pad focus in the page. It does not need Trybox's source code or an API. It contains no account information and makes no network requests of its own.

## Status

On 2026-10-25, signed-in inspection showed that `/tvbox` returns Trybox's 404 page. On the regular homepage, Right/Down left a focused title card unchanged; Enter opened its preview and Escape dismissed it. The profile menu exposed a performance toggle but no TV mode.

Version 0.2.0 adds a thin white focus frame around posters and controls, nested overlay focus restoration, and layered Back handling. Back first leaves text editing, dismisses a preview/menu, exits full screen, then returns through pages visited in this session. A deep page opened directly returns to Home; Back at Home returns to the first control. Use the TV's Home button to leave the app. Media keys affect visible same-document HTML video only.

## Ad protection

Ad protection is on by default. It rejects fetch/XHR requests and dynamic script/frame/image sources on a small built-in list of known ad domains, hides common advertising elements, and blocks cross-origin popups except Google/Apple sign-in. The Blue remote button toggles protection; its setting is remembered on this website. Reload the page after turning protection off if a blocked resource needs to retry. TV remotes expose colour buttons through their on-screen control pad where applicable.

This is page-level protection, not a full browser extension or network filter. It cannot guarantee blocking static/parser-created resources before a request starts, unknown ad networks, same-origin ads, or advertisements/popups inside third-party player frames. A popup initially opened on the same origin may subsequently navigate elsewhere. It does not strip ads out of video streams. Other external popup-based workflows may need protection turned off.

Version 0.1.0 was reported working on the user's TV, with unreliable Back and an overly heavy highlight. Version 0.2.0 still needs device testing. Seven geometry/ad-policy tests passed. The synthetic browser fixture verifies card navigation, preview dismissal and focus restoration, menu-local Escape handling, page-history Back, and ad request/frame/popup/banner protection. These checks do not prove real-site playback or hardware Back compatibility. The browser tool used to inspect Trybox cannot inject the module into the live page. Cross-origin embedded players cannot be controlled by this module. Trybox DOM changes may require maintenance. Fullscreen, nested real-site overlays, and TV on-screen keyboard behavior need device testing.

## Install in TizenBrew

1. Install [TizenBrew using its maintained instructions](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md). Test that its module/settings UI works before proceeding; [a Tizen 9 settings issue is open](https://github.com/reisxd/TizenBrew/issues/245).
2. In TizenBrew, open its module settings and add a GitHub module. Enter `s3c0v3rfl0w/trybox-tv-navigation@v0.2.0` if the interface asks for owner/repository. If it asks for a full module identifier, enter `gh/s3c0v3rfl0w/trybox-tv-navigation@v0.2.0`. Remove the old v0.1.0 module entry and add this new version; using a distinct version avoids TizenBrew's in-memory script cache retaining the old code. Relaunch TizenBrew if needed.
3. Return to the module list and launch **TryBox TV Navigation**.
4. Sign in directly on the TV. Do not place login cookies or account credentials in this repository.
5. Test arrows across rails, vertical movement, OK, Back, preview focus restoration, search entry, subtitles, and playback on the S85F. If the player is a third-party frame, its controls require separate integration or pointer fallback.

This repository contains only the navigation script, package metadata, and documentation. It contains no Trybox credentials or cookies. See [TizenBrew's module contract](https://github.com/reisxd/TizenBrew/blob/main/docs/MODULES.md) for metadata. The package.json `private` flag prevents accidental npm publishing; it does not control GitHub repository visibility.

## Local verification

The geometry tests and synthetic browser fixture were run in the development workspace and are not included in this three-file distribution. Syntax can be checked with `node --check main.js`. The pure geometry function is available to Node through `require('./main.js').score` without starting the browser runtime.

## Public distribution

TizenBrew retrieves these files through jsDelivr. Published versions can remain available in CDN caches even if this repository later becomes private or is deleted. Keep this repository accessible for reliable loading and updates. This project is unofficial and is not affiliated with Trybox or Samsung.

# TryBox TV Navigation — experimental TizenBrew module

This unofficial module opens the real `https://trybox.app/` and adds D-pad focus in the page. It does not need Trybox's source code or an API. It contains no account information and makes no network requests of its own.

## Status

On 2026-10-25, signed-in inspection showed that `/tvbox` returns Trybox's 404 page. On the regular homepage, Right/Down left a focused title card unchanged; Enter opened its preview and Escape dismissed it. The profile menu exposed a performance toggle but no TV mode.

Version 0.2.1 restores TizenBrew's immediate-evaluation launch path, used successfully by 0.1.0; 0.2.0's document-start launch mode was followed by a report that selecting the module did nothing. This compatibility change still requires device confirmation. Ad-hook errors no longer prevent navigation startup.

The module retains the thin white focus frame, nested overlay focus restoration, and layered Back handling from 0.2.0. Back first leaves text editing, dismisses a preview/menu, exits full screen, then returns through pages visited in this session. A deep page opened directly returns to Home; Back at Home returns to the first control. Use the TV's Home button to leave the app. Media keys affect visible same-document HTML video only.

## Navigation performance

Version 0.2.2 also enlarges the site's top navbar at TV-sized viewports (960 CSS pixels and wider): text scales from 18 to 26 px, links have 52 px-high targets, and the search icon/profile control are larger. At 1920 × 1080 the synthetic site-header fixture measured 25.92 px text and all tabs fit without overlapping the profile button. At 1280 × 720 there was also no overlap. At 960 px the bar scrolls horizontally and focusing Search brings it into view. The module identifies the navbar by its site links rather than styling every navigation element. Real-TV appearance still needs confirmation.

Directional navigation reuses a cached control list and IntersectionObserver proximity results instead of querying and styling every control on each arrow press. Adjacent offscreen rail cards remain eligible. Scope lookups are cached, focus-frame updates are coalesced into animation frames, held-key repeats are limited, and the DOM observer ignores its own focus frame and text-only player updates. Structural page changes refresh the control index.

In a desktop-browser fixture with 2,019 buttons, one measured arrow press evaluated 18 nearby candidates in about 0.7 ms. Offscreen Card F → Card G and preview Back also passed. This is synthetic evidence, not a Samsung TV performance measurement.

## Ad protection

Ad protection is on by default. It rejects fetch/XHR requests and dynamic script/frame/image sources on a small built-in list of known ad domains, hides common advertising elements, and blocks cross-origin popups except Google/Apple sign-in. The Blue remote button toggles protection; its setting is remembered on this website. Reload the page after turning protection off if a blocked resource needs to retry. TV remotes expose colour buttons through their on-screen control pad where applicable.

This is page-level protection, not a full browser extension or network filter. Version 0.2.1 injects at the usual TizenBrew execution-context stage for launch compatibility, so resources loaded before injection cannot be blocked retroactively. It cannot guarantee blocking static/parser-created resources before a request starts, unknown ad networks, same-origin ads, or advertisements/popups inside third-party player frames. A popup initially opened on the same origin may subsequently navigate elsewhere. It does not strip ads out of video streams. Other external popup-based workflows may need protection turned off.

Version 0.1.0 was reported working on the user's TV, with unreliable Back and an overly heavy highlight. Version 0.2.1 still needs device testing. Nine geometry/ad-policy/startup tests passed. The synthetic browser fixture verifies card navigation, preview dismissal and focus restoration, menu-local Escape handling, page-history Back, and ad request/frame/popup/banner protection. These checks do not prove real-site playback or hardware Back compatibility. The browser tool used to inspect Trybox cannot inject the module into the live page. Cross-origin embedded players cannot be controlled by this module. Trybox DOM changes may require maintenance. Fullscreen, nested real-site overlays, and TV on-screen keyboard behavior need device testing.

## Install in TizenBrew

1. Install [TizenBrew using its maintained instructions](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md). Test that its module/settings UI works before proceeding; [a Tizen 9 settings issue is open](https://github.com/reisxd/TizenBrew/issues/245).
2. In TizenBrew, open its module settings and add a GitHub module. Enter `s3c0v3rfl0w/trybox-tv-navigation@v0.2.2` if the interface asks for owner/repository. If it asks for a full module identifier, enter `gh/s3c0v3rfl0w/trybox-tv-navigation@v0.2.2`. Remove the old module entry and add this new version; using a distinct version avoids TizenBrew's in-memory script cache retaining the old code. Fully restart TizenBrew if needed.
3. Return to the module list and launch **TryBox TV Navigation**.
4. Sign in directly on the TV. Do not place login cookies or account credentials in this repository.
5. Test arrows across rails, vertical movement, OK, Back, preview focus restoration, search entry, subtitles, and playback on the S85F. If the player is a third-party frame, its controls require separate integration or pointer fallback.

This repository contains only the navigation script, package metadata, and documentation. It contains no Trybox credentials or cookies. See [TizenBrew's module contract](https://github.com/reisxd/TizenBrew/blob/main/docs/MODULES.md) for metadata. The package.json `private` flag prevents accidental npm publishing; it does not control GitHub repository visibility.

## Local verification

The geometry tests and synthetic browser fixture were run in the development workspace and are not included in this three-file distribution. Syntax can be checked with `node --check main.js`. The pure geometry function is available to Node through `require('./main.js').score` without starting the browser runtime.

## Public distribution

TizenBrew retrieves these files through jsDelivr. Published versions can remain available in CDN caches even if this repository later becomes private or is deleted. Keep this repository accessible for reliable loading and updates. This project is unofficial and is not affiliated with Trybox or Samsung.

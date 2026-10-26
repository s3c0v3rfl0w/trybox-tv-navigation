/* Unofficial Trybox navigation and page-level ad protection. No service APIs. */
(function (root) {
  'use strict';

  // Pure geometry is exported for tests without starting a browser runtime.
  function score(from, to, direction) {
    var horizontal = direction === 'left' || direction === 'right';
    var positive = direction === 'right' || direction === 'down';
    var main = horizontal ? 'x' : 'y';
    var cross = horizontal ? 'y' : 'x';
    var mainSize = horizontal ? 'width' : 'height';
    var crossSize = horizontal ? 'height' : 'width';
    var mainDelta = (to[main] + to[mainSize] / 2 - from[main] - from[mainSize] / 2) * (positive ? 1 : -1);
    if (mainDelta <= 2) return Infinity;
    var crossDelta = Math.abs(to[cross] + to[crossSize] / 2 - from[cross] - from[crossSize] / 2);
    var overlap = Math.min(from[cross] + from[crossSize], to[cross] + to[crossSize]) - Math.max(from[cross], to[cross]);
    return mainDelta + crossDelta * 3 + (overlap > 2 ? 0 : 1000);
  }
  var adDomains = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adsterra.com', 'popads.net', 'popcash.net', 'propellerads.com', 'exoclick.com'];
  function isAdURL(value, base) {
    try {
      var hostname = new URL(String(value), base || 'https://trybox.app/').hostname.toLowerCase();
      return adDomains.some(function (domain) { return hostname === domain || hostname.slice(-(domain.length + 1)) === '.' + domain; });
    } catch (_) { return false; }
  }
  function popupAllowed(value, base) {
    try {
      var url = new URL(String(value || ''), base);
      return !isAdURL(url.href) && (url.origin === new URL(base).origin || url.hostname === 'accounts.google.com' || url.hostname === 'appleid.apple.com');
    } catch (_) { return false; }
  }
  if (typeof module === 'object' && module.exports) { module.exports = { score: score, isAdURL: isAdURL, popupAllowed: popupAllowed }; return; }
  if (!root || root.__tryboxRemoteActive) return;
  if (root.top !== root) return;
  // Localhost is permitted solely for the included test fixture.
  if (root.location.hostname !== 'trybox.app' && root.location.hostname !== '127.0.0.1' && root.location.hostname !== 'localhost') return;
  root.__tryboxRemoteActive = true;

  var doc = root.document;
  var selector = 'a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="switch"],[role="menuitem"],[role="slider"],[tabindex]';
  var selected = null;
  var oldScope = null;
  var returnFocus = [];
  var scanTimer;
  var focusRing;
  var protectionStyle;
  var lastBackAt = 0;
  var forwardingEscape = false;
  var candidatesCache = [];
  var candidatesDirty = false;
  var nearbyCandidates = new Set();
  var trackedCandidates = new Set();
  var intersectionReady = false;
  var nearbyObserver;
  var scopeDirty = true;
  var cachedScope;
  var paintPending = false;
  var lastMoveAt = 0;
  var pageTrail = [root.location.href];
  var blockAds = true;
  try { blockAds = root.localStorage.getItem('trybox:tv:adblock') !== 'off'; } catch (_) {}

  // Best-effort page protection; already-loaded resources cannot be blocked retroactively.
  function installAdProtection() {
    if (root.fetch) {
      var originalFetch = root.fetch;
      root.fetch = function (input) {
        if (blockAds && isAdURL(input && input.url || input, root.location.href)) return Promise.reject(new TypeError('Advertising request blocked by TryBox TV'));
        return originalFetch.apply(this, arguments);
      };
    }
    var xhr = root.XMLHttpRequest && root.XMLHttpRequest.prototype;
    if (xhr) {
      var originalOpen = xhr.open;
      var originalSend = xhr.send;
      xhr.open = function (method, url) {
        this.__tryboxAdURL = url;
        return originalOpen.apply(this, arguments);
      };
      xhr.send = function () {
        if (!blockAds || !isAdURL(this.__tryboxAdURL, root.location.href)) return originalSend.apply(this, arguments);
        var request = this;
        request.abort();
        setTimeout(function () { request.dispatchEvent(new Event('error')); request.dispatchEvent(new Event('loadend')); }, 0);
      };
    }
    // These setters cover dynamically created script/frame/image advertisements.
    ['HTMLScriptElement', 'HTMLIFrameElement', 'HTMLImageElement'].forEach(function (name) {
      var prototype = root[name] && root[name].prototype;
      var descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'src');
      if (!descriptor || !descriptor.set || !descriptor.configurable) return;
      Object.defineProperty(prototype, 'src', {
        configurable: descriptor.configurable, enumerable: descriptor.enumerable, get: descriptor.get,
        set: function (value) {
          if (blockAds && isAdURL(value, root.location.href)) { this.setAttribute('data-trybox-blocked-ad', ''); return; }
          descriptor.set.call(this, value);
        }
      });
    });
    var originalSetAttribute = root.Element.prototype.setAttribute;
    root.Element.prototype.setAttribute = function (name, value) {
      if (blockAds && String(name).toLowerCase() === 'src' && /^(SCRIPT|IFRAME|IMG)$/.test(this.tagName) && isAdURL(value, root.location.href)) {
        originalSetAttribute.call(this, 'data-trybox-blocked-ad', '');
        return;
      }
      return originalSetAttribute.apply(this, arguments);
    };
    var originalWindowOpen = root.open;
    root.open = function (url) {
      if (blockAds && !popupAllowed(url, root.location.href)) return null;
      return originalWindowOpen.apply(this, arguments);
    };
  }
  try { installAdProtection(); } catch (error) { console.warn('TryBox TV: some ad protection hooks are unavailable', error); }

  // Track only this session's own navigation, avoiding unrelated browser history.
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = root.history[method];
    root.history[method] = function () {
      var before = root.location.href;
      var result = original.apply(this, arguments);
      if (before !== root.location.href) {
        if (method === 'pushState') pageTrail.push(root.location.href);
        else pageTrail[pageTrail.length - 1] = root.location.href;
        selected = null;
        setTimeout(recover, 100);
      }
      return result;
    };
  });

  function visible(element) {
    if (!element || !element.isConnected || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
    if (element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    var style = root.getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0 && rect.width > 2 && rect.height > 2;
  }
  function rect(element) {
    var box = element.getBoundingClientRect();
    return { x: box.left, y: box.top, width: box.width, height: box.height };
  }
  function scope() {
    if (!scopeDirty && cachedScope && (cachedScope === doc.body || visible(cachedScope))) return cachedScope;
    scopeDirty = false;
    var layers = Array.prototype.slice.call(doc.querySelectorAll('[role="dialog"],[role="menu"],[aria-modal="true"]')).filter(visible);
    if (layers.length) { cachedScope = layers[layers.length - 1]; return cachedScope; }
    // Trybox previews currently use a fixed z-index 9999 layer without a dialog role.
    var candidates = doc.querySelectorAll('body > div');
    for (var i = candidates.length - 1; i >= 0; i--) {
      var style = root.getComputedStyle(candidates[i]);
      var box = candidates[i].getBoundingClientRect();
      if (style.position === 'fixed' && parseInt(style.zIndex, 10) >= 100 && box.width > root.innerWidth / 2 && box.height > root.innerHeight / 2 && visible(candidates[i]) && candidates[i].querySelector(selector)) { cachedScope = candidates[i]; return cachedScope; }
    }
    cachedScope = doc.body;
    return cachedScope;
  }
  function refreshCandidates() {
    enhanceNavigation();
    candidatesCache = Array.prototype.slice.call(doc.querySelectorAll(selector));
    if (!nearbyObserver) return;
    var next = new Set(candidatesCache);
    trackedCandidates.forEach(function (element) {
      if (!next.has(element)) { nearbyObserver.unobserve(element); nearbyCandidates.delete(element); }
    });
    candidatesCache.forEach(function (element) { if (!trackedCandidates.has(element)) nearbyObserver.observe(element); });
    trackedCandidates = next;
  }
  function enhanceNavigation() {
    // Identify the actual site navbar, leaving footer and player controls alone.
    Array.prototype.forEach.call(doc.querySelectorAll('nav'), function (nav) {
      var knownPaths = ['/', '/movies', '/tv', '/universes', '/clips', '/trysub', '/my-box', '/search'];
      var links = nav.querySelectorAll('a[href]');
      var matches = Array.prototype.filter.call(links, function (link) {
        try { return knownPaths.indexOf(new URL(link.href, root.location.href).pathname) >= 0; } catch (_) { return false; }
      });
      if (matches.length < 4) return;
      nav.classList.add('trybox-tv-nav');
      if (nav.parentElement && root.getComputedStyle(nav.parentElement).position === 'fixed') nav.parentElement.classList.add('trybox-tv-nav-host');
    });
    Array.prototype.forEach.call(doc.querySelectorAll('header [aria-label="Profile menu"]'), function (button) {
      button.classList.add('trybox-tv-profile');
      button.closest('header').classList.add('trybox-tv-header');
    });
  }
  function addAdjacent(pool) {
    // IntersectionObserver clips horizontal rails; include the next hidden card.
    var cursor = selected;
    for (var depth = 0; cursor && cursor !== doc.body && depth < 4; depth++, cursor = cursor.parentElement) {
      [cursor.previousElementSibling, cursor.nextElementSibling].forEach(function (sibling) {
        if (!sibling) return;
        if (sibling.matches(selector)) pool.add(sibling);
        // Do not descend into an entire unrelated page section.
        if (sibling.children.length < 10) {
          var nested = sibling.querySelectorAll(selector);
          if (nested.length < 30) Array.prototype.forEach.call(nested, function (element) { pool.add(element); });
        }
      });
    }
  }
  function controls(container) {
    var pool;
    if (container === doc.body && intersectionReady) {
      pool = new Set(nearbyCandidates);
      if (selected) pool.add(selected);
      addAdjacent(pool);
      pool = Array.from(pool);
    } else pool = container === doc.body ? candidatesCache : Array.prototype.slice.call(container.querySelectorAll(selector));
    return pool.filter(function (element) {
      if (!element.isConnected || element.getAttribute('tabindex') === '-1' || element.closest('svg')) return false;
      var box = element.getBoundingClientRect();
      if (container === doc.body && (box.bottom < -root.innerHeight || box.top > root.innerHeight * 2 || box.right < -root.innerWidth || box.left > root.innerWidth * 2)) return false;
      return visible(element);
    });
  }
  function schedulePaint() {
    if (paintPending) return;
    paintPending = true;
    root.requestAnimationFrame(function () { paintPending = false; paintFocus(); });
  }
  function focus(element) {
    if (!visible(element)) return;
    if (selected) selected.classList.remove('trybox-remote-focus');
    selected = element;
    selected.classList.add('trybox-remote-focus');
    try { selected.focus({ preventScroll: true }); } catch (_) { selected.focus(); }
    selected.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    schedulePaint();
  }
  function paintFocus() {
    if (!focusRing || !visible(selected)) { if (focusRing && !focusRing.hidden) focusRing.hidden = true; return; }
    // Highlight the poster rather than the oversized ranking/card wrapper.
    var images = selected.querySelectorAll('img');
    var target = selected;
    var area = 0;
    for (var i = 0; i < images.length; i++) {
      var box = images[i].getBoundingClientRect();
      if (visible(images[i]) && box.width * box.height > area) { target = images[i]; area = box.width * box.height; }
    }
    var bounds = target.getBoundingClientRect();
    var radius = parseFloat(root.getComputedStyle(target).borderTopLeftRadius) || 8;
    var hideRing = !inView(target);
    if (focusRing.hidden !== hideRing) focusRing.hidden = hideRing;
    focusRing.style.left = (bounds.left - 4) + 'px';
    focusRing.style.top = (bounds.top - 4) + 'px';
    focusRing.style.width = (bounds.width + 8) + 'px';
    focusRing.style.height = (bounds.height + 8) + 'px';
    focusRing.style.borderRadius = Math.min(radius + 3, bounds.height / 2 + 4) + 'px';
  }
  function inView(element) {
    var box = element.getBoundingClientRect();
    return box.bottom > 0 && box.top < root.innerHeight && box.right > 0 && box.left < root.innerWidth;
  }
  function recover() {
    var currentScope = scope();
    if (currentScope !== oldScope) {
      var previous = null;
      var savedIndex = -1;
      for (var i = 0; i < returnFocus.length; i++) if (returnFocus[i].scope === currentScope) savedIndex = i;
      if (savedIndex >= 0) {
        previous = returnFocus[savedIndex].element;
        returnFocus = returnFocus.slice(0, savedIndex);
      } else if (oldScope) returnFocus.push({ scope: oldScope, element: selected });
      oldScope = currentScope;
      if (previous && visible(previous) && currentScope.contains(previous)) { focus(previous); return; }
    }
    if (visible(selected) && currentScope.contains(selected)) { paintFocus(); return; }
    var candidates = controls(currentScope);
    var onscreen = candidates.filter(inView);
    focus(onscreen[0] || candidates[0]);
  }
  function move(direction) {
    var moveStarted = root.performance.now();
    recover();
    if (!selected) return;
    var origin = rect(selected);
    var best = null;
    var bestScore = Infinity;
    var candidates = controls(scope());
    candidates.forEach(function (element) {
      if (element === selected) return;
      var box = rect(element);
      // Limit unrelated far-away page sections; allow offscreen cards in a rail.
      if (box.y + box.height < -root.innerHeight || box.y > root.innerHeight * 2) return;
      var value = score(origin, box, direction);
      if (value < bestScore) { bestScore = value; best = element; }
    });
    if (best) focus(best);
    focusRing.setAttribute('data-navigation-candidates', String(candidates.length));
    focusRing.setAttribute('data-navigation-ms', (root.performance.now() - moveStarted).toFixed(1));
  }
  function editing(element) {
    return element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.getAttribute('role') === 'slider');
  }
  function back(event) {
    if (forwardingEscape) return;
    // Own both hardware Back and Escape; repeated keydown must not skip screens.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || Date.now() - lastBackAt < 250) return;
    lastBackAt = Date.now();
    if (editing(doc.activeElement)) {
      doc.activeElement.blur();
      return;
    }
    var layer = scope();
    if (layer !== doc.body) {
      var buttons = controls(layer);
      var close = buttons.filter(function (button) {
        var label = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim();
        return /^(close|dismiss)( (preview|dialog|menu|player))?$|^(إغلاق|اغلاق)$/i.test(label);
      })[0];
      if (close) close.click();
      else {
        // Dispatch from the focused control so menu-local handlers receive Escape.
        forwardingEscape = true;
        try { (layer.contains(doc.activeElement) ? doc.activeElement : layer).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true })); }
        finally { forwardingEscape = false; }
      }
      setTimeout(function () {
        // Trybox's role-less preview also supports clicking its backdrop.
        if (visible(layer) && scope() === layer && !layer.getAttribute('role') && layer.parentElement === doc.body && root.getComputedStyle(layer).position === 'fixed' && parseInt(root.getComputedStyle(layer).zIndex, 10) === 9999) layer.click();
        recover();
      }, 140);
      return;
    }
    if (doc.fullscreenElement && doc.exitFullscreen) { var exited = doc.exitFullscreen(); if (exited && exited.catch) exited.catch(function () {}); return; }
    if (pageTrail.length > 1) { root.history.back(); return; }
    if (root.location.pathname !== '/') { root.location.assign('/'); return; }
    // At Home, move back to the top instead of unexpectedly leaving Trybox.
    var first = candidatesCache.filter(visible)[0];
    root.scrollTo(0, 0);
    if (first) focus(first);
  }
  function media(code) {
    var videos = Array.prototype.slice.call(doc.querySelectorAll('video')).filter(visible);
    var video = videos[videos.length - 1];
    if (!video) return false;
    if (code === 415 || (code === 10252 && video.paused)) {
      var result = video.play();
      if (result && result.catch) result.catch(function () {});
    } else if (code === 19 || code === 10252) video.pause();
    else if (code === 412 || code === 417) {
      if (!isFinite(video.duration)) return false;
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (code === 412 ? -10 : 10)));
    }
    return true;
  }
  function keydown(event) {
    if (forwardingEscape) return;
    var code = event.keyCode;
    if (code === 10009 || code === 27 || event.key === 'Escape' || event.key === 'BrowserBack' || (code === 8 && !editing(doc.activeElement))) { back(event); return; }
    if (code === 406) {
      event.preventDefault(); event.stopImmediatePropagation();
      blockAds = !blockAds;
      try { root.localStorage.setItem('trybox:tv:adblock', blockAds ? 'on' : 'off'); } catch (_) {}
      updateAdStyle();
      var notice = doc.createElement('div');
      notice.className = 'trybox-remote-notice';
      notice.textContent = 'Ad protection ' + (blockAds ? 'on' : 'off') + '. Reload Trybox if playback needs to retry.';
      doc.body.appendChild(notice);
      setTimeout(function () { notice.remove(); }, 3500);
      return;
    }
    if (editing(doc.activeElement)) return;
    var direction = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[code];
    if (direction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat && Date.now() - lastMoveAt < 70) return;
      lastMoveAt = Date.now();
      move(direction);
    } else if (code === 13) {
      recover();
      if (selected) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selected.click();
      }
    } else if ([415, 19, 10252, 412, 417].indexOf(code) >= 0 && media(code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function updateAdStyle() {
    if (protectionStyle) protectionStyle.textContent = blockAds ? 'ins.adsbygoogle,[data-ad-slot],[data-ad-client],[data-trybox-blocked-ad],[id^="google_ads_iframe"],.ad-banner,.advertisement,[data-testid="ad-banner"]{display:none!important}' : '';
  }
  function start() {
    if (!doc.body || !doc.head) { setTimeout(start, 50); return; }
    var style = doc.createElement('style');
    style.textContent = '.trybox-remote-focus{outline:none!important}.trybox-remote-ring{position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.3),0 5px 20px rgba(0,0,0,.28);transition:left .1s ease-out,top .1s ease-out,width .1s ease-out,height .1s ease-out}.trybox-remote-ring[hidden]{display:none!important}.trybox-remote-notice{position:fixed;bottom:5vh;left:10vw;right:10vw;padding:20px 28px;background:#171b24;color:white;border-radius:12px;font:24px Arial;text-align:center;z-index:2147483647}@media(prefers-reduced-motion:reduce){.trybox-remote-ring{transition:none}}';
    style.textContent += '@media(min-width:960px){.trybox-tv-nav-host{top:20px!important;align-items:center!important}.trybox-tv-nav{height:auto!important;min-height:64px!important;max-width:calc(100vw - 320px)!important;gap:6px!important;padding:6px!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none;background:rgba(10,13,20,.94)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.trybox-tv-nav::-webkit-scrollbar{display:none}.trybox-tv-nav>a{display:flex!important;align-items:center!important;justify-content:center!important;flex-shrink:0!important;width:auto!important;min-width:52px!important;height:52px!important;padding:0 clamp(14px,1vw,20px)!important;font-size:clamp(18px,1.35vw,26px)!important;line-height:1.2!important;font-weight:600!important;white-space:nowrap!important}.trybox-tv-nav>a[aria-current="page"]{background:rgba(255,255,255,.18)!important;color:#fff!important}.trybox-tv-nav>a svg{width:26px!important;height:26px!important}.trybox-tv-header>div{height:104px!important}.trybox-tv-profile{min-width:52px!important;min-height:52px!important;justify-content:center!important}.trybox-tv-profile img{width:46px!important;height:46px!important}}';
    doc.head.appendChild(style);
    protectionStyle = doc.createElement('style');
    doc.head.appendChild(protectionStyle);
    updateAdStyle();
    focusRing = doc.createElement('div');
    focusRing.className = 'trybox-remote-ring';
    focusRing.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(focusRing);
    if (root.IntersectionObserver) {
      nearbyObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) nearbyCandidates.add(entry.target); else nearbyCandidates.delete(entry.target); });
        intersectionReady = true;
      }, { rootMargin: '80% 80%' });
    }
    refreshCandidates();
    root.addEventListener('keydown', keydown, true);
    root.addEventListener('keyup', function (event) {
      if (event.keyCode === 10009 || event.keyCode === 27 || event.key === 'BrowserBack') { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    root.addEventListener('tizenhwkey', function (event) { if (/^(back|return)$/i.test(event.keyName || '')) back(event); }, true);
    doc.addEventListener('focusin', function (event) {
      if (visible(event.target) && event.target.matches(selector)) {
        if (selected) selected.classList.remove('trybox-remote-focus');
        selected = event.target;
        selected.classList.add('trybox-remote-focus');
        schedulePaint();
      }
    });
    new MutationObserver(function (records) {
      // Ignore our own overlay and text-only updates (including player timers).
      var relevant = records.filter(function (record) {
        if (record.target === focusRing || record.target === protectionStyle || (record.target.closest && record.target.closest('.trybox-remote-notice'))) return false;
        if (record.type !== 'childList') return true;
        return Array.prototype.some.call(record.addedNodes, function (node) { return node.nodeType === 1; }) || Array.prototype.some.call(record.removedNodes, function (node) { return node.nodeType === 1; });
      });
      if (!relevant.length) return;
      if (relevant.some(function (record) { return record.type === 'childList'; })) candidatesDirty = true;
      scopeDirty = true;
      clearTimeout(scanTimer);
      scanTimer = setTimeout(function () {
        if (candidatesDirty) { candidatesDirty = false; refreshCandidates(); }
        recover();
      }, 120);
    }).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'disabled'] });
    root.addEventListener('scroll', schedulePaint, true);
    root.addEventListener('resize', function () { scopeDirty = true; schedulePaint(); });
    root.addEventListener('popstate', function () {
      var index = pageTrail.lastIndexOf(root.location.href);
      pageTrail = index >= 0 ? pageTrail.slice(0, index + 1) : [root.location.href];
      selected = null;
      setTimeout(recover, 100);
    });
    recover();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
}(typeof window === 'undefined' ? null : window));

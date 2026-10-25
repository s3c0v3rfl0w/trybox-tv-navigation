/* Unofficial Trybox navigation. No credentials, network requests, or service APIs. */
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
  if (typeof module === 'object' && module.exports) { module.exports = { score: score }; return; }
  if (!root || root.__tryboxRemoteActive) return;
  // Localhost is permitted solely for the included test fixture.
  if (root.location.hostname !== 'trybox.app' && root.location.hostname !== '127.0.0.1' && root.location.hostname !== 'localhost') return;
  root.__tryboxRemoteActive = true;

  var doc = root.document;
  var selector = 'a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="switch"],[role="menuitem"],[role="slider"],[tabindex]';
  var selected = null;
  var oldScope = null;
  var returnFocus = [];
  var scanTimer;

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
    var layers = Array.prototype.slice.call(doc.querySelectorAll('[role="dialog"],[role="menu"],[aria-modal="true"]')).filter(visible);
    if (layers.length) return layers[layers.length - 1];
    // Trybox previews currently use a fixed z-index 9999 layer without a dialog role.
    var candidates = doc.querySelectorAll('body > div');
    for (var i = candidates.length - 1; i >= 0; i--) {
      var style = root.getComputedStyle(candidates[i]);
      var box = candidates[i].getBoundingClientRect();
      if (style.position === 'fixed' && parseInt(style.zIndex, 10) >= 100 && box.width > root.innerWidth / 2 && box.height > root.innerHeight / 2 && visible(candidates[i]) && candidates[i].querySelector(selector)) return candidates[i];
    }
    return doc.body;
  }
  function controls(container) {
    return Array.prototype.slice.call(container.querySelectorAll(selector)).filter(function (element) {
      return visible(element) && element.getAttribute('tabindex') !== '-1' && !element.closest('svg');
    });
  }
  function focus(element) {
    if (!visible(element)) return;
    if (selected) selected.classList.remove('trybox-remote-focus');
    selected = element;
    selected.classList.add('trybox-remote-focus');
    try { selected.focus({ preventScroll: true }); } catch (_) { selected.focus(); }
    selected.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }
  function inView(element) {
    var box = element.getBoundingClientRect();
    return box.bottom > 0 && box.top < root.innerHeight && box.right > 0 && box.left < root.innerWidth;
  }
  function recover() {
    var currentScope = scope();
    if (currentScope !== oldScope) {
      if (oldScope && currentScope !== doc.body && returnFocus.indexOf(currentScope) < 0) returnFocus.push(selected);
      var previous = currentScope === doc.body ? returnFocus.pop() : null;
      oldScope = currentScope;
      if (previous && visible(previous) && currentScope.contains(previous)) { focus(previous); return; }
    }
    if (visible(selected) && currentScope.contains(selected)) return;
    var candidates = controls(currentScope);
    var onscreen = candidates.filter(inView);
    focus(onscreen[0] || candidates[0]);
  }
  function move(direction) {
    recover();
    if (!selected) return;
    var origin = rect(selected);
    var best = null;
    var bestScore = Infinity;
    controls(scope()).forEach(function (element) {
      if (element === selected) return;
      var box = rect(element);
      // Limit unrelated far-away page sections; allow offscreen cards in a rail.
      if (box.y + box.height < -root.innerHeight || box.y > root.innerHeight * 2) return;
      var value = score(origin, box, direction);
      if (value < bestScore) { bestScore = value; best = element; }
    });
    if (best) focus(best);
  }
  function editing(element) {
    return element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.getAttribute('role') === 'slider');
  }
  function back(event) {
    if (editing(doc.activeElement)) {
      doc.activeElement.blur();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // Let the site's own Escape handler close its preview/menu.
    if (event.keyCode === 27 || event.key === 'Escape') return;
    if (scope() !== doc.body) {
      event.preventDefault();
      event.stopImmediatePropagation();
      doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      return;
    }
    // Delegate root-level Back to the host; never exit the TV from website code.
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
    var code = event.keyCode;
    if (code === 10009 || code === 27 || event.key === 'Escape') { back(event); return; }
    if (editing(doc.activeElement)) return;
    var direction = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[code];
    if (direction) {
      event.preventDefault();
      event.stopImmediatePropagation();
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
  function start() {
    var style = doc.createElement('style');
    style.textContent = '.trybox-remote-focus{outline:4px solid #fff!important;outline-offset:4px!important;box-shadow:0 0 0 8px #e52946!important;border-radius:8px!important;}';
    doc.head.appendChild(style);
    doc.addEventListener('keydown', keydown, true);
    doc.addEventListener('focusin', function (event) {
      if (visible(event.target) && event.target.matches(selector)) {
        if (selected) selected.classList.remove('trybox-remote-focus');
        selected = event.target;
        selected.classList.add('trybox-remote-focus');
      }
    });
    new MutationObserver(function (records) {
      // Ignore our focus-class changes; watch navigation and modal lifecycle.
      if (!records.some(function (record) { return record.type === 'childList' || record.attributeName !== 'class'; })) return;
      clearTimeout(scanTimer);
      scanTimer = setTimeout(recover, 100);
    }).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'disabled'] });
    root.addEventListener('popstate', function () { setTimeout(recover, 100); });
    recover();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
}(typeof window === 'undefined' ? null : window));

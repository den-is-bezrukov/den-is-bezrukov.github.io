// Edit mode: every heading and paragraph is typed into in place and saved into the page's file a moment later.
// Enter starts a new paragraph (a new item in a list), Backspace at the start of one joins it to the paragraph above; Shift+Enter
// sets a line break, ⌥Space a non-breaking space, ⌘K or pasting an address over selected words a link.
// A toolbar above the block with the caret switches the block's style and its line layout (Pretty, Balance) and moves it (↓ ↑);
// a second one over the block's right end adds a section or a project (§) or a spacer (⁋).
// ⌥⌘1/2/3/0/8 and ⌘⇧↑/↓ do the same from the keyboard, ⌘Z/⇧⌘Z step through saves.
(function () {
  var blocks = Array.prototype.slice.call(document.querySelectorAll('main h1, main h2, main h3, main p'))
  var source = window.EDIT_SOURCE
  if (blocks.length !== source.length) return alert('Не удалось сопоставить текст с файлом, режим правки выключен.')

  var style = document.createElement('style')
  style.textContent =
    '[contenteditable]:focus, main .spacer:focus { outline: none; box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 6%, transparent); border-radius: 2px; background: color-mix(in srgb, currentColor 6%, transparent); }' +
    '.edit-status { position: fixed; right: 16px; bottom: 16px; font: 13px/1 Inter, system-ui, sans-serif; color: var(--muted); opacity: 0; transition: opacity .3s; pointer-events: none; }' +
    '.edit-status.on { opacity: 1; }' +
    '.edit-link, .edit-tools { z-index: 1; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 8px; font: 14px/1.143 Inter, system-ui, sans-serif; color: var(--text); background: var(--bg); box-shadow: 0 4px 16px color-mix(in srgb, var(--text) 10%, transparent); outline: none; }' +
    '.edit-link { position: fixed; width: 320px; max-width: calc(100vw - 32px); }' +
    // Every button is 40px tall with 8px either side of its label, so any two labels are 16px apart; each group gets 8px more
    // at its ends, 16px from the toolbar's edge or the 6% line between groups; the buttons touch, so the pointer goes straight
    // from one to the next. Labels are set at 500, the current style at 600; a hidden copy of the label at 600 keeps each
    // button as wide either way.
    '.edit-tools { display: none; position: absolute; flex-wrap: wrap; max-width: calc(100vw - 16px); padding: 0; color: var(--muted); }' +
    '.edit-tools.shown, .edit-tools span { display: flex; flex-wrap: wrap; }' +
    '.edit-tools span { padding: 0 8px; }' +
    '.edit-tools span:not([hidden]) ~ span:not([hidden]) { border-left: 1px solid color-mix(in srgb, var(--text) 6%, transparent); }' +
    '.edit-tools span[hidden] { display: none; }' +
    '.edit-tools button { all: unset; box-sizing: border-box; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; height: 40px; padding: 0 8px; font-weight: 500; cursor: pointer; }' +
    '.edit-tools button::after { content: attr(data-label); height: 0; overflow: hidden; visibility: hidden; font-weight: 600; }' +
    '.edit-tools button:hover, .edit-tools button.on { color: var(--text); }' +
    '.edit-tools button.on { font-weight: 600; }' +
    '.nb { background: color-mix(in srgb, currentColor 18%, transparent); border-radius: 2px; }' +
    // A spacer has no text, so in edit mode it shows as a faint ground to click on.
    'main .spacer { background: color-mix(in srgb, currentColor 4%, transparent); border-radius: 2px; cursor: pointer; }'
  document.head.appendChild(style)
  var status = document.createElement('div')
  status.className = 'edit-status'
  document.body.appendChild(status)

  // A non-breaking space set by hand (⌥Space, &nbsp; in the file) sits in its own marked span, apart from Typograf's.
  // The editor runs before Typograf, so on load every non-breaking space in a block is one of these.
  function nbsp() {
    var span = document.createElement('span')
    span.className = 'nb'
    span.contentEditable = 'false'
    span.textContent = '\u00a0'
    return span
  }
  function markNbsp(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = []
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeValue.indexOf('\u00a0') >= 0 && !n.parentNode.classList.contains('nb')) nodes.push(n)
    }
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment()
      node.nodeValue.split('\u00a0').forEach(function (part, i) {
        if (i) frag.appendChild(nbsp())
        if (part) frag.appendChild(document.createTextNode(part))
      })
      node.parentNode.replaceChild(frag, node)
    })
  }

  // Typograf's non-breaking spaces and the spans that keep hyphenated words whole are only layout, so the file never gets them;
  // the browser also keeps typed spaces as &nbsp; and leaves a <br> at the end of a cleared line. Hand-set ones stay as &nbsp;.
  function clean(html) {
    return html
      .replace(/<span class="nw">([^<]*)<\/span>/g, '$1')
      .replace(/<span class="nb" contenteditable="false">&nbsp;<\/span>/g, '\u0000')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u0000/g, '&nbsp;')
      .replace(/<br>$/, '')
  }

  // The indentation trimmed on load goes back around the text, so the file keeps its layout.
  function indent(before, html) {
    return before.match(/^\s*/)[0] + html + before.match(/\s*$/)[0]
  }

  // A spacer is an empty paragraph, class spacer and a step of the spacing scale; it takes focus but no typing.
  var SPACES = ['100', '150', '200', '300', '400', '600', '800']
  function spacer(el) {
    return el.classList.contains('spacer')
  }
  function spaceOf(el) {
    var m = el.className.match(/\bspace-(\d+)/)
    return m ? m[1] : '150'
  }
  function bullet(el) {
    return el.classList.contains('bullet')
  }

  function setup(el) {
    if (spacer(el)) el.tabIndex = 0
    else el.contentEditable = 'plaintext-only'
    el.spellcheck = true
    el.savedHtml = clean(el.innerHTML)
    el.savedBalance = el.classList.contains('balance')
  }
  blocks.forEach(function (el) {
    // An editable block shows the file's indentation as spaces and line breaks, which pushes a link row off its place.
    el.innerHTML = el.innerHTML.trim()
    markNbsp(el)
    setup(el)
  })

  function caret(node, offset) {
    var range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    return range
  }

  function insert(node) {
    var sel = getSelection()
    if (!sel.rangeCount) return
    var range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(node)
    caret(node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1)
    node.parentNode.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function show(text, stay) {
    status.textContent = text
    status.classList.add('on')
    clearTimeout(show.t)
    if (!stay) show.t = setTimeout(function () { status.classList.remove('on') }, 1200)
  }

  // Saves go out one at a time and in order: `source` already holds what the file will hold once the queue is through,
  // and the server checks every change against it, so a split or a join never mixes up which block is which.
  var queue = Promise.resolve(), timer = null, pending = false, broken = false
  function send(ops) {
    queue = queue.then(function () {
      if (broken) return
      return fetch('/save?' + location.pathname, { method: 'POST', body: JSON.stringify(ops) }).then(function (r) {
        if (!r.ok) throw new Error(r.status)
        if (!timer) pending = false
        show('Сохранено')
      })
    }).catch(function () {
      broken = true
      show('Не сохранилось. Обновите страницу', true)
    })
  }

  function save() {
    clearTimeout(timer)
    timer = null
    var ops = []
    blocks.forEach(function (el, i) {
      var html = clean(el.innerHTML), balance = el.classList.contains('balance')
      if (html === el.savedHtml && balance === el.savedBalance) return
      var after = indent(source[i], html)
      ops.push({ op: 'edit', index: i, before: source[i], after: after, balance: balance })
      source[i] = after
      el.savedHtml = html
      el.savedBalance = balance
    })
    if (ops.length) send(ops)
  }

  // A plain paragraph: not a heading, not a grey service line or a row of links.
  function plain(el) {
    return el.tagName === 'P' && !el.className.replace('balance', '').trim()
  }

  // Enter: the text after the caret becomes a new paragraph below; in a list, a new item.
  function split(el) {
    var sel = getSelection()
    if (!sel.rangeCount) return
    save()
    var i = blocks.indexOf(el), range = sel.getRangeAt(0)
    range.deleteContents()
    var tail = document.createRange()
    tail.setStart(range.endContainer, range.endOffset)
    tail.setEnd(el, el.childNodes.length)
    var holder = document.createElement('div')
    holder.appendChild(tail.extractContents())
    var first = clean(el.innerHTML).replace(/\s+$/, ''), second = clean(holder.innerHTML).replace(/^\s+/, '')
    var next = document.createElement('p'), cls = bullet(el) ? 'bullet' : ''
    next.className = cls
    el.innerHTML = first
    next.innerHTML = second
    markNbsp(el)
    markNbsp(next)
    el.after(next)
    setup(next)
    el.savedHtml = first
    var after = indent(source[i], first)
    send([{ op: 'split', index: i, before: source[i], after: after, next: second, cls: cls }])
    source[i] = after
    source.splice(i + 1, 0, second)
    blocks.splice(i + 1, 0, next)
    next.focus()
    caret(next, 0)
  }

  // Backspace at the start of a paragraph joins it to the paragraph or list item above; an empty one is simply removed,
  // and a spacer above goes instead.
  function join(el) {
    var i = blocks.indexOf(el), prev = blocks[i - 1]
    if (!prev) return
    var empty = !el.textContent.trim()
    if (!empty && spacer(prev)) return removeBlock(prev, el)
    if (!empty && !(plain(el) && (plain(prev) || bullet(prev)))) return
    save()
    if (empty) {
      send([{ op: 'remove', index: i, before: source[i] }])
      source.splice(i, 1)
      blocks.splice(i, 1)
      el.remove()
      prev.focus()
      caret(prev, prev.childNodes.length)
      return
    }
    var a = clean(prev.innerHTML).replace(/\s+$/, ''), b = clean(el.innerHTML).replace(/^\s+/, '')
    prev.innerHTML = a + ' <span data-caret></span>' + b
    markNbsp(prev)
    var mark = prev.querySelector('[data-caret]')
    var after = indent(source[i - 1], a + ' ' + b)
    send([{ op: 'merge', index: i, before: source[i], prevBefore: source[i - 1], after: after }])
    source[i - 1] = after
    source.splice(i, 1)
    blocks.splice(i, 1)
    prev.savedHtml = a + ' ' + b
    // The caret goes where the two paragraphs meet. Removing the focused block can fire focusout and a save right away,
    // so the marker and the bookkeeping are done before it goes.
    var spot = document.createRange()
    spot.setStartBefore(mark)
    spot.collapse(true)
    mark.remove()
    el.remove()
    prev.focus()
    getSelection().removeAllRanges()
    getSelection().addRange(spot)
  }

  // A block goes away; the caret goes to `then`, or to the end of the block above (below, for the first one).
  function removeBlock(el, then) {
    var i = blocks.indexOf(el)
    save()
    send([{ op: 'remove', index: i, before: source[i] }])
    source.splice(i, 1)
    blocks.splice(i, 1)
    var target = then || blocks[i - 1] || blocks[i]
    el.remove()
    if (then || !target) return
    target.focus()
    if (!spacer(target)) placeCaret(target, null)
  }

  function atStart(el) {
    var sel = getSelection()
    if (!sel.rangeCount || !sel.isCollapsed) return false
    var before = document.createRange()
    before.setStart(el, 0)
    before.setEnd(sel.anchorNode, sel.anchorOffset)
    return !before.toString() && !before.cloneContents().querySelector('br, .nb')
  }

  // Links: ⌘K puts one on the selected words or opens the one under the caret; an empty address removes it.
  // Pasting an address over selected words links them right away.
  var linkField = document.createElement('input')
  linkField.className = 'edit-link'
  linkField.placeholder = 'https://'
  linkField.hidden = true
  document.body.appendChild(linkField)
  var asking = null

  function address(text) {
    text = text.trim()
    if (!text || /\s/.test(text)) return ''
    if (/^([a-z]+:|\/|#)/i.test(text)) return text
    return /^[^.\/]+\.[a-zа-яё]{2,}/i.test(text) ? 'https://' + text : ''
  }

  function linkAt(range, el) {
    var node = range.commonAncestorContainer
    var a = (node.nodeType === 1 ? node : node.parentNode).closest('a')
    return a && el.contains(a) ? a : null
  }

  function setLink(range, link, url) {
    if (link) {
      if (url) link.setAttribute('href', url)
      else link.replaceWith.apply(link, Array.prototype.slice.call(link.childNodes))
      return
    }
    if (!url || range.collapsed) return
    var a = document.createElement('a')
    a.setAttribute('href', url)
    a.appendChild(range.extractContents())
    range.insertNode(a)
    range.setStartAfter(a)
    range.collapse(true)
  }

  function openLink(el) {
    var sel = getSelection()
    if (!sel.rangeCount) return
    var range = sel.getRangeAt(0), link = linkAt(range, el)
    if (!link && range.collapsed) return
    asking = { kind: 'link', block: el, range: range.cloneRange(), link: link }
    hideControls()
    // The field opens 8px above the words it links.
    var rect = (link || range).getBoundingClientRect()
    linkField.value = link ? link.getAttribute('href') : ''
    linkField.hidden = false
    linkField.style.left = Math.max(16, Math.min(rect.left, innerWidth - 336)) + 'px'
    linkField.style.top = rect.top - 8 - linkField.getBoundingClientRect().height + 'px'
    linkField.focus()
    linkField.select()
  }

  function closeLink(apply) {
    var l = asking
    if (!l) return
    if (l.kind === 'anchor') return closeAnchor(apply)
    asking = null
    linkField.hidden = true
    l.block.focus()
    if (apply) {
      var typed = linkField.value.trim()
      setLink(l.range, l.link, typed && (address(typed) || typed))
      l.block.dispatchEvent(new Event('input', { bubbles: true }))
    }
    getSelection().removeAllRanges()
    getSelection().addRange(l.range)
  }

  linkField.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); closeLink(true) }
    if (e.key === 'Escape') { e.preventDefault(); closeLink(false) }
  })
  linkField.addEventListener('blur', function () { closeLink(false) })

  document.addEventListener('paste', function (e) {
    var el = e.target.closest && e.target.closest('[contenteditable="plaintext-only"]')
    var sel = getSelection()
    if (!el || !sel.rangeCount || sel.isCollapsed) return
    var url = address(e.clipboardData.getData('text/plain'))
    if (!url) return
    e.preventDefault()
    var range = sel.getRangeAt(0)
    setLink(range, linkAt(range, el), url)
    sel.removeAllRanges()
    sel.addRange(range)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })

  document.addEventListener('input', function () {
    placeControls()
    pending = true
    clearTimeout(timer)
    timer = setTimeout(save, 700)
  })

  // The toolbar sits above the block with the caret, 8px off its highlight, left edge on the highlight's left edge, and follows
  // the block as it grows; plain text in groups, the current style in the text colour.
  var current = null
  var STYLES = [['H1', 'h1', ''], ['H2', 'h2', ''], ['H3', 'h3', ''], ['Lead', 'p', 'lead'], ['Body', 'p', ''], ['Meta', 'p', 'meta'], ['List', 'p', 'bullet']]
  var KEYS = { Digit1: 'h1', Digit2: 'h2', Digit3: 'h3', Digit0: 'p', Digit8: 'p.meta' }
  function styleOf(el) {
    var cls = ['meta', 'lead', 'bullet'].filter(function (c) { return el.classList.contains(c) })[0]
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '')
  }
  // Rows of links and breadcrumbs keep their markup; they can only move.
  function fixed(el) {
    return el.classList.contains('list') || el.classList.contains('crumbs')
  }
  // Every style is offered but H3, which only a page that already has section headings gets.
  var offered = {}
  var styles = STYLES.filter(function (s) {
    return s[1] !== 'h3' || blocks.some(function (el) { return el.tagName === 'H3' })
  })
  styles.forEach(function (s) { offered[s[1] + (s[2] ? '.' + s[2] : '')] = true })
  var home = !!document.querySelector('.about')

  var tools = document.createElement('div'), adds = document.createElement('div')
  tools.className = adds.className = 'edit-tools'
  document.body.appendChild(tools)
  document.body.appendChild(adds)
  function group(buttons, bar) {
    var span = document.createElement('span')
    buttons.forEach(function (b) { span.appendChild(b) })
    ;(bar || tools).appendChild(span)
    return span
  }
  function label(b, text) {
    b.textContent = text
    b.dataset.label = text
  }
  function button(text, action) {
    var b = document.createElement('button')
    label(b, text)
    // Pressing a button, with a mouse or a finger, leaves the caret in the block.
    b.addEventListener('pointerdown', function (e) { e.preventDefault() })
    b.addEventListener('mousedown', function (e) { e.preventDefault() })
    b.addEventListener('click', function () { if (current) action(current) })
    return b
  }
  var styleGroup = group(styles.map(function (s) {
    var b = button(s[0], function (el) { retype(el, s[1], s[2]) })
    b.dataset.style = s[1] + (s[2] ? '.' + s[2] : '')
    return b
  }))
  // A spacer has its step of the scale in place of the styles; a press takes the next one.
  var spaceButton = button('Space: 300', respace)
  var spaceGroup = group([spaceButton])
  // The block's line layout, named as it is now: Pretty as the site lays out text everywhere, Balance with lines of nearly
  // equal length (the balance class, on the site too); a press switches to the other.
  var wrapButton = button('Pretty', function (el) {
    el.classList.toggle('balance')
    render()
    placeControls()
    save()
  })
  var wrapGroup = group([wrapButton])
  group([button('↓', function (el) { move(el, 1) })])
  group([button('↑', function (el) { move(el, -1) })])
  // § adds a part of the page: a project on the home page, a section in a case; ⁋ a spacer.
  group([button('§', home ? askAnchor : addSection)], adds)
  group([button('⁋', addSpacer)], adds)


  function render() {
    if (!current) return
    var gap = spacer(current)
    styleGroup.hidden = fixed(current) || gap
    spaceGroup.hidden = !gap
    wrapGroup.hidden = gap
    var now = styleOf(current)
    Array.prototype.forEach.call(styleGroup.children, function (b) { b.classList.toggle('on', b.dataset.style === now) })
    if (gap) label(spaceButton, 'Space: ' + spaceOf(current))
    else label(wrapButton, current.classList.contains('balance') ? 'Balance' : 'Pretty')
  }
  function placeControls() {
    if (!current) return
    var rect = current.getBoundingClientRect(), ring = 6 // the 6px highlight around a block being edited
    var size = tools.getBoundingClientRect(), more = adds.getBoundingClientRect(), width = document.documentElement.clientWidth
    // On a narrow screen the toolbar stays inside it, 8px off the right edge at most.
    var left = Math.max(8, Math.min(rect.left - ring, width - size.width - 8))
    var top = rect.top - ring - 8 - size.height
    // Once the block's start has gone above the window, the toolbar holds 8px below the window's top, but goes up with the
    // block's end, so it never floats over the next block.
    var pinned = top < 8
    if (pinned) top = Math.min(8, rect.bottom + ring - size.height)
    // § and ⁋ sit level with it over the right end of the highlight; when the two would meet, they go 8px above it.
    var right = Math.min(rect.right + ring, width - 8) - more.width, high = top
    if (right < left + size.width + 8) {
      right = left
      high = top - 8 - more.height
    }
    place(tools, left, top, pinned)
    place(adds, right, high, pinned)
  }
  function place(bar, left, top, pinned) {
    bar.style.position = pinned ? 'fixed' : ''
    bar.style.left = left + (pinned ? 0 : scrollX) + 'px'
    bar.style.top = top + (pinned ? 0 : scrollY) + 'px'
  }
  addEventListener('scroll', placeControls, { passive: true })
  addEventListener('resize', placeControls)
  function hideControls() {
    tools.classList.remove('shown')
    adds.classList.remove('shown')
  }
  document.addEventListener('focusin', function (e) {
    if (blocks.indexOf(e.target) < 0) return
    current = e.target
    tools.classList.add('shown')
    adds.classList.add('shown')
    render()
    placeControls()
  })

  function caretOffset(el) {
    var sel = getSelection()
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null
    var range = document.createRange()
    range.selectNodeContents(el)
    range.setEnd(sel.anchorNode, sel.anchorOffset)
    return range.toString().length
  }
  function placeCaret(el, offset) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      if (offset !== null && offset <= n.length) return caret(n, offset)
      if (offset !== null) offset -= n.length
    }
    caret(el, el.childNodes.length)
  }
  function selectAll(el) {
    var range = document.createRange()
    range.selectNodeContents(el)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  }

  // A new style: the block becomes another tag or class, its text stays.
  function retype(el, tag, cls) {
    var i = blocks.indexOf(el)
    if (i < 0 || fixed(el) || styleOf(el) === tag + (cls ? '.' + cls : '')) return
    save()
    var offset = caretOffset(el)
    var next = document.createElement(tag)
    next.className = [cls, el.classList.contains('balance') && 'balance'].filter(Boolean).join(' ')
    while (el.firstChild) next.appendChild(el.firstChild)
    setup(next)
    next.savedHtml = el.savedHtml
    next.savedBalance = el.savedBalance
    // The block list points at the new element before the old one goes, so its focusout finds nothing to clean up.
    blocks[i] = next
    el.replaceWith(next)
    send([{ op: 'retype', index: i, before: source[i], tag: tag, cls: cls }])
    current = next
    next.focus()
    placeCaret(next, offset)
    render()
    placeControls()
  }

  // A block swaps places with its neighbour in the same group; a project title takes the whole project along.
  function move(el, dir) {
    var article = el.closest('article')
    if (article && el.tagName === 'H2' && article.querySelector('h2') === el) {
      var neighbour = dir < 0 ? article.previousElementSibling : article.nextElementSibling
      if (!neighbour || neighbour.tagName !== 'ARTICLE') return
      return structural({ op: 'moveProject', id: article.id, dir: dir }, { selector: '#' + article.id + ' h2' })
    }
    var i = blocks.indexOf(el), j = i + dir, other = blocks[j]
    if (!other || (dir < 0 ? el.previousElementSibling : el.nextElementSibling) !== other) return
    save()
    send([{ op: 'move', index: i, dir: dir, before: source[i], otherBefore: source[j] }])
    var swap = source[i]; source[i] = source[j]; source[j] = swap
    blocks[i] = other; blocks[j] = el
    // The neighbour moves round the block, so the block keeps its focus and caret.
    if (dir < 0) el.after(other)
    else el.before(other)
    placeControls()
  }

  // § in a case puts a section heading and a paragraph after the block, the heading's text selected to type over.
  function addSection(el) {
    var i = blocks.indexOf(el)
    save()
    var h = document.createElement('h3'), p = document.createElement('p')
    h.textContent = 'Новый раздел'
    p.textContent = 'Текст.'
    el.after(h, p)
    setup(h)
    setup(p)
    send([{ op: 'insert', index: i, before: source[i], blocks: ['<h3>Новый раздел</h3>', '<p>Текст.</p>'] }])
    source.splice(i + 1, 0, 'Новый раздел', 'Текст.')
    blocks.splice(i + 1, 0, h, p)
    current = h
    h.focus()
    selectAll(h)
    render()
    placeControls()
  }

  // ⁋ puts a spacer of space-300 after the block and selects it, so the next press on its step changes it.
  function addSpacer(el) {
    var i = blocks.indexOf(el), html = '<p class="spacer space-300"></p>'
    save()
    var s = document.createElement('p')
    s.className = 'spacer space-300'
    el.after(s)
    setup(s)
    send([{ op: 'insert', index: i, before: source[i], blocks: [html] }])
    source.splice(i + 1, 0, '')
    blocks.splice(i + 1, 0, s)
    current = s
    s.focus()
    render()
    placeControls()
  }
  function respace(el) {
    var i = blocks.indexOf(el), step = SPACES[(SPACES.indexOf(spaceOf(el)) + 1) % SPACES.length]
    save()
    el.className = 'spacer space-' + step
    send([{ op: 'retype', index: i, before: source[i], tag: 'p', cls: el.className }])
    render()
    placeControls()
  }

  // § on the home page asks for the anchor first (the resume links to projects by it), then adds a project after the current one.
  function askAnchor(el) {
    asking = { kind: 'anchor', block: el }
    var rect = el.getBoundingClientRect()
    hideControls()
    linkField.value = ''
    linkField.placeholder = 'якорь'
    linkField.hidden = false
    linkField.style.left = rect.left - 6 + 'px'
    linkField.style.top = rect.top - 6 - 8 - linkField.getBoundingClientRect().height + 'px'
    linkField.focus()
  }
  function closeAnchor(apply) {
    var l = asking, id = linkField.value.trim()
    if (apply && (!/^[a-z0-9-]+$/.test(id) || document.getElementById(id))) return show('Такой якорь не подойдёт')
    asking = null
    linkField.hidden = true
    linkField.placeholder = 'https://'
    l.block.focus()
    if (!apply) return
    var article = l.block.closest('article')
    structural({ op: 'addProject', id: id, after: article && article.id }, { selector: '#' + id + ' h2', select: true })
  }

  // Bigger changes go to the server and the page comes back from the file, at the same place.
  function reloadTo(focus) {
    try { sessionStorage.setItem('edit-return', JSON.stringify({ path: location.pathname, y: scrollY, focus: focus })) } catch (e) {}
    pending = false
    location.reload()
  }
  function structural(op, focus) {
    save()
    send([op])
    queue = queue.then(function () { if (!broken) reloadTo(focus) })
  }

  // ⌘Z steps back one save, ⇧⌘Z forward again; the page reloads from the file it now holds.
  function step(kind) {
    save()
    var at = current ? { index: blocks.indexOf(current) } : null
    queue = queue.then(function () {
      if (broken) return
      return fetch('/' + kind + '?' + location.pathname, { method: 'POST' }).then(function (r) {
        if (!r.ok) throw new Error(r.status)
        return r.json()
      }).then(function (result) {
        if (result.ok) reloadTo(at)
        else show(kind === 'undo' ? 'Нечего отменять' : 'Нечего возвращать')
      })
    }).catch(function () {
      broken = true
      show('Страница поменялась. Обновите её', true)
    })
  }

  // Leaving a block saves it and lays it out again with the site's line rules; an empty paragraph left behind goes away.
  document.addEventListener('focusout', function (e) {
    var el = e.target, i = blocks.indexOf(el)
    if (i < 0 || asking) return save()
    current = null
    hideControls()
    if (plain(el) && !el.textContent.trim() && blocks.length > 1) {
      save()
      send([{ op: 'remove', index: i, before: source[i] }])
      source.splice(i, 1)
      blocks.splice(i, 1)
      el.remove()
      return
    }
    save()
    if (!window.typografRu) return
    el.innerHTML = clean(el.innerHTML)
    markNbsp(el)
    window.typografRu(el)
  })

  document.addEventListener('keydown', function (e) {
    var block = blocks.indexOf(e.target) >= 0 ? e.target : null
    var el = block && block.isContentEditable ? block : null
    if (el && e.key === 'Enter') {
      e.preventDefault()
      if (el.classList.contains('list')) return
      if (e.shiftKey) {
        insert(document.createElement('br'))
      } else if (bullet(el) && !el.textContent.trim()) {
        retype(el, 'p', '')
      } else {
        split(el)
      }
    }
    // At the start of a list item Backspace turns it into a plain paragraph first, as Enter in an empty item does.
    if (el && e.key === 'Backspace' && atStart(el)) {
      e.preventDefault()
      if (bullet(el)) retype(el, 'p', '')
      else join(el)
    }
    if (block && spacer(block) && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      removeBlock(block)
    }
    if (el && e.altKey && e.code === 'Space') {
      e.preventDefault()
      insert(nbsp())
    }
    if (el && (e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
      e.preventDefault()
      openLink(el)
    }
    if (el && e.metaKey && e.altKey && KEYS[e.code]) {
      e.preventDefault()
      var style = KEYS[e.code].split('.')
      if (offered[KEYS[e.code]]) retype(el, style[0], style[1] || '')
    }
    if (block && e.metaKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      move(block, e.key === 'ArrowUp' ? -1 : 1)
    }
    if (e.target !== linkField && e.metaKey && e.code === 'KeyZ') {
      e.preventDefault()
      step(e.shiftKey ? 'redo' : 'undo')
    }
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
      e.preventDefault()
      save()
    }
  })

  // Links stay links but don't take you away mid-edit; ⌘-click follows them. Another page of the site opens in edit mode too,
  // an anchor on this page just scrolls to its place.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a')
    if (!a) return
    if (!e.metaKey) return e.preventDefault()
    var url = new URL(a.getAttribute('href'), location.href)
    if (url.origin !== location.origin) return
    e.preventDefault()
    if (url.pathname === location.pathname) {
      var target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)))
      if (target) target.scrollIntoView()
      return
    }
    url.search = '?edit'
    window.open(url.href)
  })
  window.addEventListener('beforeunload', function (e) {
    if (pending) e.preventDefault()
  })

  // After a reload made by the editor: back to the same scroll, the caret in the block it was in. This runs once Typograf
  // has laid the page out, since its script comes right after this one.
  setTimeout(function () {
    var back
    try {
      back = JSON.parse(sessionStorage.getItem('edit-return') || 'null')
      sessionStorage.removeItem('edit-return')
    } catch (e) {}
    if (!back || back.path !== location.pathname) return
    scrollTo(0, back.y)
    var f = back.focus, el = f && (f.selector ? document.querySelector(f.selector) : blocks[f.index])
    if (!el || blocks.indexOf(el) < 0) return
    el.focus()
    if (f.select) selectAll(el)
    else placeCaret(el, null)
  })
})()

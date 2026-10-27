// Edit mode: every heading and paragraph is typed into in place and saved into the page's file a moment later.
// Enter breaks the line (in a list it starts the next item), ⌘Enter adds a paragraph below the block, ⇧⌘Enter cuts the block
// at the caret into a new paragraph, Backspace at the start of a paragraph joins it to the one above; ⌥Space sets a non-breaking space, ⌘K or pasting an address over selected words a link.
// A toolbar above the block with the caret adds a section or a project (#), switches the block's style and its line layout
// (pretty, balance), links words (a) and moves it (↑ ↓); ⌥⌘1/2/3/0/8 and ⌘⇧↑/↓ do the same from the keyboard, ⌘Z/⇧⌘Z step through saves.
(function () {
  var blocks = Array.prototype.slice.call(document.querySelectorAll('main h1, main h2, main h3, main p, main ul, main div.space'))
  var source = window.EDIT_SOURCE
  if (blocks.length !== source.length) return alert('Не удалось сопоставить текст с файлом, режим правки выключен.')

  // A space's class on the spacing scale and its height in pixels, as the editor names it.
  var SPACES = [['100', '16'], ['150', '24'], ['200', '32'], ['300', '48'], ['400', '64'], ['500', '80'], ['600', '96']]
  var style = document.createElement('style')
  style.textContent =
    // The editor's own lettering is Geist Mono, kept in _edit with its licence, so the site never loads it.
    '@font-face { font-family: "Geist Mono"; src: url("/_edit/GeistMonoVariable.woff2") format("woff2"); font-weight: 100 900; }' +
    // In edit mode the page stands on #fafafa, so the white toolbar sits a step above it.
    ':root { --bg: #fafafa; }' +
    // The block being edited is marked by a light grey shape under its lines (drawn by mark()), not by a box around it.
    '[contenteditable]:focus { outline: none; }' +
    '.edit-mark { position: absolute; z-index: -1; pointer-events: none; overflow: visible; fill: #f0f0f0; }' +
    '.edit-status { position: fixed; right: 16px; bottom: 16px; font: 14px/1.15 "Geist Mono", ui-monospace, monospace; color: var(--muted); opacity: 0; transition: opacity .3s; pointer-events: none; }' +
    '.edit-status.on { opacity: 1; }' +
    // The floating panels are white, a step lighter than the page's #fafafa, all lettering in them 14px.
    '.edit-link, .edit-tools { z-index: 1; box-sizing: border-box; padding: 8px; border: 0; border-radius: 4px; font: 14px/1.15 "Geist Mono", ui-monospace, monospace; font-feature-settings: "lnum", "pnum"; color: var(--text); background: #ffffff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08); outline: none; }' +
    '.edit-link { position: fixed; width: 320px; max-width: calc(100vw - 32px); padding-right: 32px; }' +
    '.edit-link-off { all: unset; position: fixed; z-index: 2; width: 32px; text-align: center; font: 14px/1.15 "Geist Mono", ui-monospace, monospace; color: var(--muted); cursor: pointer; }' +
    '.edit-link-off:hover { color: var(--text); }' +
    '.edit-link-off[hidden] { display: none; }' +
    // Pages and projects offered under the link field: the link in black, its title in grey after it.
    '.edit-suggest { position: fixed; z-index: 1; display: flex; flex-direction: column; width: 320px; max-width: calc(100vw - 32px); max-height: 50vh; overflow: auto; padding: 4px 0; border-radius: 4px; font: 14px/1.15 "Geist Mono", ui-monospace, monospace; background: #ffffff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.08); }' +
    '.edit-suggest[hidden] { display: none; }' +
    '.edit-suggest button { all: unset; padding: 4px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); cursor: pointer; }' +
    '.edit-suggest button span { color: var(--muted); }' +
    '.edit-suggest button.on, .edit-suggest button:hover { color: var(--text); }' +
    // Every button is 32px tall with 4px either side of its label, so labels in a group are 8px apart; each group gets 4px more
    // at its ends, 8px from the toolbar's edge or the 0.5px line between groups, and is 32px wide at least; the buttons touch,
    // so the pointer goes straight from one to the next. Labels are grey capitals, the current style black at 600; in the
    // style group a two-letter label (H1) takes 20px, a four-letter one (BODY) 40px at least.
    '.edit-tools { display: none; position: absolute; flex-wrap: wrap; max-width: calc(100vw - 16px); padding: 0; text-transform: uppercase; color: var(--muted); }' +
    '.edit-tools button[data-style] { min-width: 48px; }' +
    '.edit-tools button[data-style^="h"] { min-width: 0; width: 28px; }' +
    '.edit-tools button[data-size] { width: 28px; }' +
    '.edit-tools.shown, .edit-tools span { display: flex; flex-wrap: wrap; }' +
    '.edit-tools span { justify-content: center; min-width: 32px; box-sizing: border-box; padding: 0 4px; }' +
    '.edit-tools span:not([hidden]) ~ span:not([hidden]) { border-left: 0.5px solid rgba(0, 0, 0, 0.1); }' +
    '.edit-tools span[hidden] { display: none; }' +
    '.edit-tools button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 4px; cursor: pointer; }' +
    '.edit-tools button:hover, .edit-tools button.on { color: var(--text); }' +
    '.edit-tools button.on { font-weight: 600; }' +
    'main .space:focus { outline: none; }' +
    // Every space is marked in the middle of the column by a line across it, as long as the space is tall.
    'main .space { position: relative; cursor: pointer; }' +
    'main .space::after { content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); height: 100%; aspect-ratio: 1; background: linear-gradient(transparent calc(50% - 0.5px), rgba(0, 0, 0, 0.1) 0 calc(50% + 0.5px), transparent 0); }' +
    // Under the pointer, or picked, the line gives way to the space's height in pixels.
    'main .space:hover::after, main .space:focus::after { background: none; display: flex; align-items: center; justify-content: center; font: 14px/1.15 "Geist Mono", ui-monospace, monospace; color: var(--text); }' +
    SPACES.map(function (s) { return 'main .space-' + s[0] + ':is(:hover, :focus)::after { content: "' + s[1] + '"; }' }).join('') +
    // A project's anchor in the gap above it.
    'main article { position: relative; }' +
    '.edit-case { position: absolute; left: 0; right: 0; bottom: 100%; display: flex; align-items: center; justify-content: center; font: 14px/1.15 "Geist Mono", ui-monospace, monospace; text-transform: uppercase; color: var(--muted); }' +
    '.edit-case span { min-width: 1ch; outline: none; cursor: text; }' +
    '.edit-case span:focus { color: var(--text); }' +
    // Over the anchor, 8px above it: + ↑ ↓ under the pointer, × while it is typed into.
    '.edit-case .edit-tools { left: 50%; top: calc(50% - 32px); transform: translate(-50%, -50%); text-transform: none; }' +
    '.edit-case:hover:not(:focus-within) .edit-tools.moves, .edit-case:focus-within .edit-tools.off { display: flex; }' +
    '.nb { background: color-mix(in srgb, currentColor 18%, transparent); border-radius: 2px; }'
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
      .replace(/(<br>)+$/, '')
      // Cutting a block or an item inside bold words or a link leaves an empty copy of them behind.
      .replace(/<(strong|b|em|i|a)(\s[^>]*)?><\/\1>/g, '')
  }

  // The indentation trimmed on load goes back around the text, so the file keeps its layout.
  function indent(before, html) {
    return before.match(/^\s*/)[0] + html + before.match(/\s*$/)[0]
  }

  // A list is one block, a <ul> with an item per line; the file gets one <li> per line at the indentation it already has.
  function content(el) {
    if (el.tagName !== 'UL') return clean(el.innerHTML)
    var gap = (source[blocks.indexOf(el)] || '').match(/^\s*/)[0]
    return Array.prototype.map.call(el.children, function (li) { return '<li>' + clean(li.innerHTML) + '</li>' }).join(gap)
  }
  function itemAt(ul) {
    var sel = getSelection()
    if (!sel.rangeCount) return null
    var node = sel.anchorNode
    var li = (node.nodeType === 1 ? node : node.parentNode).closest('li')
    return li && li.parentNode === ul ? li : null
  }

  function setup(el) {
    // A space has no text to type into; it only takes focus, for its toolbar.
    if (el.classList.contains('space')) el.tabIndex = 0
    else {
      el.contentEditable = 'plaintext-only'
      el.spellcheck = true
    }
    el.savedHtml = content(el)
    el.savedBalance = el.classList.contains('balance')
  }
  blocks.forEach(function (el) {
    // An editable block shows the file's indentation as spaces and line breaks, which pushes a link row off its place.
    el.innerHTML = el.innerHTML.trim()
    if (el.tagName === 'UL') {
      Array.prototype.slice.call(el.childNodes).forEach(function (n) { if (n.nodeType === 3 && !n.nodeValue.trim()) n.remove() })
    }
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
      var html = content(el), balance = el.classList.contains('balance')
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

  // The gaps between blocks are space blocks; a new paragraph comes with the usual one, 150, above it.
  function isSpace(el) {
    return !!el && el.classList.contains('space')
  }
  function newSpace(size) {
    var div = document.createElement('div')
    div.className = 'space space-' + size
    setup(div)
    return div
  }

  // ⌘Enter: a new empty paragraph below the block, wherever the caret is; the block itself stays whole.
  function addParagraph(el) {
    var i = blocks.indexOf(el)
    save()
    var space = newSpace('150'), p = document.createElement('p')
    el.after(space, p)
    setup(p)
    send([{ op: 'insert', index: i, before: source[i], blocks: ['<div class="space space-150"></div>', '<p></p>'] }])
    source.splice(i + 1, 0, '', '')
    blocks.splice(i + 1, 0, space, p)
    p.focus()
    caret(p, 0)
  }

  // ⇧⌘Enter: the text after the caret becomes a new paragraph below.
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
    var next = document.createElement('p')
    el.innerHTML = first
    next.innerHTML = second
    markNbsp(el)
    markNbsp(next)
    var space = newSpace('150')
    el.after(space, next)
    setup(next)
    el.savedHtml = first
    var after = indent(source[i], first)
    send([{ op: 'edit', index: i, before: source[i], after: after }])
    send([{ op: 'insert', index: i, before: after, blocks: ['<div class="space space-150"></div>', '<p>' + second + '</p>'] }])
    source[i] = after
    source.splice(i + 1, 0, '', second)
    blocks.splice(i + 1, 0, space, next)
    next.focus()
    caret(next, 0)
  }

  // Enter and Shift+Enter: a line break. One at the very end shows no new line until something follows it, so a second one
  // holds the line open; trailing line breaks never reach the file.
  function lineBreak() {
    var br = document.createElement('br')
    insert(br)
    var next = br.nextSibling
    while (next && next.nodeType === 3 && !next.nodeValue) next = next.nextSibling
    if (!next) br.after(document.createElement('br'))
  }

  // Backspace at the start of a paragraph joins it to the paragraph above; an empty one is simply removed. The space
  // between them goes too.
  function join(el) {
    var i = blocks.indexOf(el), gap = isSpace(blocks[i - 1]) ? 1 : 0, prev = blocks[i - 1 - gap]
    if (!prev) return
    var empty = !el.textContent.trim()
    if (!empty && !(plain(el) && plain(prev))) return
    save()
    if (empty) {
      send([{ op: 'remove', index: i, before: source[i] }].concat(gap ? [{ op: 'remove', index: i - 1, before: '' }] : []))
      source.splice(i - gap, 1 + gap)
      if (gap) blocks[i - 1].remove()
      blocks.splice(i - gap, 1 + gap)
      el.remove()
      prev.focus()
      caret(prev, prev.childNodes.length)
      return
    }
    if (gap) {
      send([{ op: 'remove', index: i - 1, before: '' }])
      source.splice(i - 1, 1)
      blocks.splice(i - 1, 1)[0].remove()
      i--
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

  // Enter in a list item: the text after the caret becomes the next item. Enter in an empty last item leaves the list for a new
  // paragraph below it.
  function newItem(ul) {
    var li = itemAt(ul), sel = getSelection()
    if (!li || !sel.rangeCount) return
    if (!li.textContent.trim() && li === ul.lastElementChild && ul.children.length > 1) {
      li.remove()
      return addParagraph(ul)
    }
    var range = sel.getRangeAt(0)
    range.deleteContents()
    var tail = document.createRange()
    tail.setStart(range.endContainer, range.endOffset)
    tail.setEnd(li, li.childNodes.length)
    var next = document.createElement('li')
    next.appendChild(tail.extractContents())
    li.after(next)
    caret(next, 0)
    ul.dispatchEvent(new Event('input', { bubbles: true }))
  }
  // Backspace at the start of an item joins it to the item above; in a list of one item, it turns the list into Body.
  function joinItem(ul, li) {
    var prev = li.previousElementSibling
    if (!prev) {
      if (ul.children.length === 1) retype(ul, 'p', '')
      return
    }
    var spot = document.createRange()
    spot.selectNodeContents(prev)
    spot.collapse(false)
    while (li.firstChild) prev.appendChild(li.firstChild)
    li.remove()
    getSelection().removeAllRanges()
    getSelection().addRange(spot)
    ul.dispatchEvent(new Event('input', { bubbles: true }))
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
    // × at the field's end takes an existing link off.
    linkOff.hidden = !link
    var field = linkField.getBoundingClientRect()
    linkOff.style.left = field.right - 32 + 'px'
    linkOff.style.top = field.top + 'px'
    linkOff.style.height = field.height + 'px'
    suggest()
  }

  var linkOff = document.createElement('button')
  linkOff.className = 'edit-link-off'
  linkOff.textContent = '×'
  linkOff.hidden = true
  linkOff.addEventListener('pointerdown', function (e) { e.preventDefault() })
  linkOff.addEventListener('mousedown', function (e) { e.preventDefault() })
  linkOff.addEventListener('click', function () {
    linkField.value = ''
    closeLink(true)
  })
  document.body.appendChild(linkOff)

  // Typing / offers the site's pages and their projects, # the projects of this page; ↑ ↓ pick one, Enter or a click takes
  // it. The link goes in as the site writes its own: cases/#umo from the home page, ../ from the cases.
  var PAGES = [['/', 'Главная'], ['/cases/', 'Проекты']]
  var suggestions = document.createElement('div')
  suggestions.className = 'edit-suggest'
  suggestions.hidden = true
  suggestions.addEventListener('pointerdown', function (e) { e.preventDefault() })
  suggestions.addEventListener('mousedown', function (e) { e.preventDefault() })
  document.body.appendChild(suggestions)
  var known = null, picked = 0
  function relative(path) {
    var here = location.pathname.replace(/[^/]*$/, ''), page = path.split('#')[0], hash = path.slice(page.length)
    if (page === here) return hash || './'
    if (page.indexOf(here) === 0) return page.slice(here.length) + hash
    return '../'.repeat(here.split('/').length - page.split('/').length) + page.replace(/^\//, '') + hash
  }
  // Every page with its projects' anchors and titles, read once.
  function loadKnown() {
    if (known) return Promise.resolve(known)
    return Promise.all(PAGES.map(function (page) {
      return fetch(page[0]).then(function (r) { return r.text() }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html')
        var list = [[page[0], page[1]]]
        Array.prototype.forEach.call(doc.querySelectorAll('main article[id]'), function (a) {
          var title = a.querySelector('h1, h2')
          list.push([page[0] + '#' + a.id, title ? title.textContent.trim() : ''])
        })
        return list
      })
    })).then(function (lists) { return (known = [].concat.apply([], lists)) })
  }
  function suggest() {
    var typed = linkField.value.trim()
    suggestions.hidden = true
    if (!asking || asking.kind !== 'link' || !/^[\/#]/.test(typed)) return
    loadKnown().then(function (all) {
      var here = location.pathname.replace(/[^/]*$/, '')
      var list = all.filter(function (s) {
        return typed[0] === '#' ? s[0].indexOf(here + '#') === 0 && s[0].slice(here.length).indexOf(typed) === 0 : s[0].indexOf(typed) === 0
      })
      suggestions.textContent = ''
      picked = 0
      list.forEach(function (s, k) {
        var b = document.createElement('button'), grey = document.createElement('span')
        b.textContent = typed[0] === '#' ? s[0].slice(here.length) : s[0]
        grey.textContent = '  ' + s[1]
        b.appendChild(grey)
        b.dataset.href = relative(s[0])
        b.classList.toggle('on', k === 0)
        b.addEventListener('click', function () { take(b) })
        suggestions.appendChild(b)
      })
      var field = linkField.getBoundingClientRect()
      suggestions.hidden = !list.length || linkField.hidden
      suggestions.style.left = field.left + 'px'
      suggestions.style.top = field.bottom + 8 + 'px'
    })
  }
  function take(b) {
    linkField.value = b.dataset.href
    closeLink(true)
  }
  linkField.addEventListener('input', suggest)

  function closeLink(apply) {
    var l = asking
    if (!l) return
    asking = null
    linkField.hidden = true
    linkOff.hidden = true
    suggestions.hidden = true
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
    var rows = suggestions.hidden ? [] : suggestions.children
    if (rows.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      picked = (picked + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
      Array.prototype.forEach.call(rows, function (b, k) { b.classList.toggle('on', k === picked) })
    }
    if (e.key === 'Enter' && rows.length) { e.preventDefault(); return take(rows[picked]) }
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

  // Clearing a whole list leaves its text straight in the <ul>; it goes back into an item.
  function tidy(ul) {
    if (Array.prototype.every.call(ul.childNodes, function (n) { return n.nodeName === 'LI' })) return
    var offset = caretOffset(ul), li = null
    Array.prototype.slice.call(ul.childNodes).forEach(function (n) {
      if (n.nodeName === 'LI') return (li = null)
      if (!li) ul.insertBefore(li = document.createElement('li'), n)
      li.appendChild(n)
    })
    placeCaret(ul, offset)
  }
  document.addEventListener('input', function (e) {
    if (e.target.tagName === 'UL') tidy(e.target)
    placeControls()
    pending = true
    clearTimeout(timer)
    timer = setTimeout(save, 700)
  })

  // The toolbar sits above the block with the caret, 8px off its highlight, left edge on the highlight's left edge, and follows
  // the block as it grows; plain text in groups, the current style in the text colour.
  var current = null
  var STYLES = [['h1', 'h1', ''], ['h2', 'h2', ''], ['h3', 'h3', ''], ['lead', 'p', 'lead'], ['body', 'p', ''], ['meta', 'p', 'meta'], ['list', 'ul', '']]
  var KEYS = { Digit1: 'h1', Digit2: 'h2', Digit3: 'h3', Digit0: 'p', Digit8: 'p.meta' }
  function styleOf(el) {
    var cls = ['meta', 'lead'].filter(function (c) { return el.classList.contains(c) })[0]
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '')
  }
  // Rows of links, breadcrumbs and spaces keep their markup; rows can only move, spaces only change their height.
  function fixed(el) {
    return el.classList.contains('list') || el.classList.contains('crumbs') || el.classList.contains('space')
  }
  // Every style is offered but H3, which only a page that already has section headings gets.
  var offered = {}
  var styles = STYLES.filter(function (s) {
    return s[1] !== 'h3' || blocks.some(function (el) { return el.tagName === 'H3' })
  })
  styles.forEach(function (s) { offered[s[1] + (s[2] ? '.' + s[2] : '')] = true })

  var tools = document.createElement('div')
  tools.className = 'edit-tools'
  document.body.appendChild(tools)
  function group(buttons) {
    var span = document.createElement('span')
    buttons.forEach(function (b) { span.appendChild(b) })
    tools.appendChild(span)
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
  // With words selected the toolbar holds only LINK, which links them as ⌘K does.
  var linkGroup = group([button('link', openLink)])
  // list, the last of the styles, works as a switch: pressed on a list, it turns the list back into body.
  var styleGroup = group(styles.map(styleButton))
  function styleButton(s) {
    var b = button(s[0], function (el) {
      if (s[1] === 'ul' && el.tagName === 'UL') retype(el, 'p', '')
      else retype(el, s[1], s[2])
    })
    b.dataset.style = s[1] + (s[2] ? '.' + s[2] : '')
    return b
  }
  // even, a switch like list: on (black at 600), the block's lines come out nearly equal in length (the balance class, on
  // the site too); off, the text fills its lines as everywhere on the site.
  var wrapButton = button('even', function (el) {
    el.classList.toggle('balance')
    render()
    placeControls()
    save()
  })
  var wrapGroup = group([wrapButton])
  // A space's toolbar holds only its height, 16 to 96px, and stands at the column's right edge, over the space's mark.
  var sizeGroup = group(SPACES.map(function (s) {
    var b = button(s[1], function (el) { resize(el, s[0]) })
    b.dataset.size = s[0]
    return b
  }))
  var moveGroups = [group([button('↑', function (el) { move(el, -1) })]), group([button('↓', function (el) { move(el, 1) })])]

  function selected() {
    var sel = getSelection()
    return !!current && sel.rangeCount > 0 && !sel.isCollapsed && current.contains(sel.anchorNode) && current.contains(sel.focusNode)
  }
  function render() {
    if (!current) return
    var words = selected(), space = current.classList.contains('space')
    linkGroup.hidden = !words
    styleGroup.hidden = words || fixed(current)
    wrapGroup.hidden = words || space
    sizeGroup.hidden = !space
    moveGroups[0].hidden = moveGroups[1].hidden = words || space
    Array.prototype.forEach.call(sizeGroup.children, function (b) { b.classList.toggle('on', current.classList.contains('space-' + b.dataset.size)) })
    var now = styleOf(current)
    Array.prototype.forEach.call(styleGroup.children, function (b) { b.classList.toggle('on', b.dataset.style === now) })
    wrapButton.classList.toggle('on', current.classList.contains('balance'))
  }
  // Selecting words or dropping the selection switches the toolbar between LINK and the rest.
  var wasSelected = false
  document.addEventListener('selectionchange', function () {
    if (!current || !tools.classList.contains('shown') || selected() === wasSelected) return
    wasSelected = selected()
    render()
    placeControls()
  })
  function placeControls() {
    if (!current) return
    mark()
    var rect = current.getBoundingClientRect(), ring = 4 // the peach shape reaches 4px past the text on either side
    var size = tools.getBoundingClientRect()
    // On a narrow screen the toolbar stays inside it, 8px off the right edge at most.
    var left = isSpace(current) ? rect.left + (rect.width - size.width) / 2 : rect.left - ring
    left = Math.max(8, Math.min(left, document.documentElement.clientWidth - size.width - 8))
    var top = rect.top - size.height
    // Once the block's start has gone above the window, the toolbar holds 8px below the window's top, but goes up with the
    // block's end, so it never floats over the next block.
    var pinned = top < 8
    if (pinned) top = Math.min(8, rect.bottom - size.height)
    tools.style.position = pinned ? 'fixed' : ''
    tools.style.left = left + (pinned ? 0 : scrollX) + 'px'
    tools.style.top = top + (pinned ? 0 : scrollY) + 'px'
  }
  addEventListener('scroll', placeControls, { passive: true })
  addEventListener('resize', placeControls)
  function hideControls() {
    tools.classList.remove('shown')
    markSvg.style.display = 'none'
  }

  // The mark under the block being edited: one shape that follows its lines like a highlighter, the full line height tall
  // and 4px past the words on either side, every corner rounded by 4px (less where a step is narrower); list items, set
  // apart, get a shape each.
  var SVG = 'http://www.w3.org/2000/svg'
  var markSvg = document.createElementNS(SVG, 'svg')
  markSvg.setAttribute('class', 'edit-mark')
  markSvg.style.display = 'none'
  var markPath = document.createElementNS(SVG, 'path')
  markSvg.appendChild(markPath)
  document.body.appendChild(markSvg)
  function mark() {
    var el = current
    if (!el || !tools.classList.contains('shown')) return
    var lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5
    // Lines: the words' boxes grouped by their middle, each line as tall as the line height around that middle. Only text
    // counts: the boxes of elements around it (the block row of a link list, its dots hidden at a line's start) would not.
    var rects = [], range = document.createRange()
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n)
      rects.push.apply(rects, range.getClientRects())
    }
    var lines = []
    rects.forEach(function (r) {
      if (!r.width) return
      var mid = (r.top + r.bottom) / 2
      var line = lines.filter(function (l) { return Math.abs(l.mid - mid) < lh / 2 })[0]
      if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right) }
      else lines.push({ mid: mid, left: r.left, right: r.right })
    })
    // An empty block shows a stub of one line where the caret stands, a space the whole of itself.
    if (!lines.length) {
      var box = el.getBoundingClientRect()
      if (el.classList.contains('space')) lh = box.height
      lines.push({ mid: box.top + lh / 2, left: box.left, right: el.classList.contains('space') ? box.right : box.left + 8 })
    }
    lines.sort(function (a, b) { return a.mid - b.mid })
    var shapes = [], shape
    lines.forEach(function (l, i) {
      l.top = l.mid - lh / 2
      l.bottom = l.mid + lh / 2
      l.left -= 4
      l.right += 4
      if (!i || l.top - lines[i - 1].bottom > 1) shapes.push(shape = [])
      else l.top = lines[i - 1].bottom
      shape.push(l)
    })
    markPath.setAttribute('d', shapes.map(outline).join(' '))
    markSvg.style.left = scrollX + 'px'
    markSvg.style.top = scrollY + 'px'
    markSvg.style.width = markSvg.style.height = '1px'
    markSvg.style.display = ''
  }
  // The outline of a stack of lines: down the right edge, up the left one, then each corner rounded.
  function outline(stack) {
    var pts = []
    stack.forEach(function (l) { pts.push([l.right, l.top], [l.right, l.bottom]) })
    stack.slice().reverse().forEach(function (l) { pts.push([l.left, l.bottom], [l.left, l.top]) })
    pts = pts.filter(function (p, i) {
      var a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length]
      return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]))
    })
    var n = pts.length
    return pts.map(function (p, i) {
      var a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]
      var da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1])
      var r = Math.min(4, da / 2, db / 2)
      var p1 = [p[0] + (a[0] - p[0]) * r / da, p[1] + (a[1] - p[1]) * r / da]
      var p2 = [p[0] + (b[0] - p[0]) * r / db, p[1] + (b[1] - p[1]) * r / db]
      return (i ? 'L' : 'M') + p1.join(' ') + ' Q' + p.join(' ') + ' ' + p2.join(' ')
    }).join(' ') + ' Z'
  }
  document.addEventListener('focusin', function (e) {
    if (blocks.indexOf(e.target) < 0) return
    current = e.target
    tools.classList.add('shown')
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

  // A new style: the block becomes another tag or class, its text stays. Into a list or out of one, lines become items and
  // items lines, and the page comes back from the file.
  function retype(el, tag, cls) {
    var i = blocks.indexOf(el)
    if (i < 0 || fixed(el) || styleOf(el) === tag + (cls ? '.' + cls : '')) return
    save()
    if ((tag === 'ul') !== (el.tagName === 'UL')) {
      var lines = el.tagName === 'UL'
        ? Array.prototype.map.call(el.children, function (li) { return clean(li.innerHTML) })
        : clean(el.innerHTML).split('<br>')
      // A paragraph right after a list joins that list, so the caret comes back in the list above.
      var into = tag === 'ul' && el.previousElementSibling && el.previousElementSibling === blocks[i - 1] && blocks[i - 1].tagName === 'UL'
      return structural({ op: 'retype', index: i, before: source[i], tag: tag, cls: cls, lines: lines }, { index: into ? i - 1 : i })
    }
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

  // A block swaps places with its neighbour in the same group; whole projects move by the arrows over their anchors.
  function move(el, dir) {
    // A text block passes over the spaces next to it to the next text block; the spaces stay in place and don't move.
    if (isSpace(el)) return
    var i = blocks.indexOf(el), j = i + dir
    while (isSpace(blocks[j])) j += dir
    var other = blocks[j]
    if (!other) return
    // Only within the same group: the two blocks are siblings with nothing but spaces between them.
    var step = function (n) { return dir < 0 ? n.previousElementSibling : n.nextElementSibling }
    var between = [], n = step(el)
    while (n && n !== other && isSpace(n)) { between.push(n); n = step(n) }
    if (n !== other) return
    save()
    send([{ op: 'move', index: i, to: j, dir: dir, before: source[i], otherBefore: source[j] }])
    var swap = source[i]; source[i] = source[j]; source[j] = swap
    blocks[i] = other; blocks[j] = el
    // The neighbour and the spaces move round the block, so the block keeps its focus and caret.
    if (dir < 0) {
      el.after(other)
      between.reverse().forEach(function (s) { other.before(s) })
    } else {
      el.before(other)
      between.forEach(function (s) { el.before(s) })
    }
    placeControls()
  }

  // A space's height, picked in its toolbar.
  function resize(el, size) {
    var i = blocks.indexOf(el)
    if (!el.classList.contains('space')) return
    save()
    send([{ op: 'space', index: i, before: source[i], size: size }])
    el.className = 'space space-' + size
    render()
    placeControls()
  }
  // Backspace or Delete on a space takes it away.
  function removeSpace(el) {
    var i = blocks.indexOf(el)
    save()
    send([{ op: 'remove', index: i, before: source[i] }])
    source.splice(i, 1)
    blocks.splice(i, 1)
    current = null
    hideControls()
    el.remove()
  }
  // A project's anchor (the resume links to projects by it) stands in the middle of the gap above the project, in grey
  // capitals, #UMO, and is typed into right there. Enter or leaving it puts the new one on, on both pages, and the links
  // follow; Escape brings the old one back; an empty one takes it off, along with the project's line in the project list.
  // Over it, under the pointer: + puts a new project here (this one goes down), ↑ ↓ move this one, here and on the
  // other page; while it is typed into: × takes the project off this page.
  var cases = Array.prototype.map.call(document.querySelectorAll('main article'), function (article, n) {
    var tag = document.createElement('div'), id = document.createElement('span')
    tag.className = 'edit-case'
    id.contentEditable = 'plaintext-only'
    id.spellcheck = false
    id.textContent = article.id
    tag.append('#', id, caseTools('moves', [['+', function () {
      gone()
      structural({ op: 'insertProject', article: n, before: article.id, id: freeAnchor() }, { anchor: n })
    }], ['↑', function () { moveCase(-1) }], ['↓', function () { moveCase(1) }]]), caseTools('off', [['×', function () {
      gone()
      structural({ op: 'removeProject', article: n, before: article.id }, null)
    }]]))
    article.prepend(tag)
    function moveCase(dir) {
      var to = n + dir
      if (to < 0 || to >= document.querySelectorAll('main article').length) return
      gone()
      structural({ op: 'moveProject', article: n, before: article.id, dir: dir }, null)
    }
    // Once the project is on its way out, leaving its anchor changes nothing more.
    function gone() { id.dataset.gone = '1' }
    // The anchor's typing is not the page's text: it neither saves the blocks nor holds the page open.
    id.addEventListener('input', function (e) { e.stopPropagation() })
    id.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); id.blur() }
      if (e.key === 'Escape') { e.preventDefault(); id.textContent = article.id; id.blur() }
    })
    id.addEventListener('blur', function () {
      if (id.dataset.gone) return
      var typed = id.textContent.trim().replace(/^#/, '').toLowerCase()
      if (typed === article.id) return (id.textContent = article.id)
      if (typed && (!/^[a-z0-9-]+$/.test(typed) || document.getElementById(typed))) {
        id.textContent = article.id
        return show('Такой якорь не подойдёт')
      }
      if (!typed) return structural({ op: 'removeAnchor', id: article.id }, null)
      structural({ op: 'renameAnchor', article: n, before: article.id, id: typed }, null)
    })
    return { article: article, tag: tag }
  })
  function caseTools(kind, items) {
    var bar = document.createElement('div')
    bar.className = 'edit-tools ' + kind
    items.forEach(function (item) {
      var b = document.createElement('button')
      b.textContent = item[0]
      b.addEventListener('pointerdown', function (e) { e.preventDefault() })
      b.addEventListener('mousedown', function (e) { e.preventDefault() })
      b.addEventListener('click', item[1])
      var span = document.createElement('span')
      span.appendChild(b)
      bar.appendChild(span)
    })
    return bar
  }
  // A new project's anchor until it gets its own: case, case-2…
  function freeAnchor() {
    for (var k = 1; ; k++) {
      var name = k === 1 ? 'case' : 'case-' + k
      if (!document.getElementById(name)) return name
    }
  }
  // Each anchor is as tall as the gap above its project, its text in the middle.
  function placeCases() {
    cases.forEach(function (c) { c.tag.style.height = getComputedStyle(c.article).marginTop })
  }
  placeCases()
  addEventListener('resize', placeCases)

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
      // The space above it goes with it (or the one below, for a paragraph that opens its group).
      var s = isSpace(blocks[i - 1]) ? i - 1 : isSpace(blocks[i + 1]) ? i + 1 : -1
      save()
      send([{ op: 'remove', index: i, before: source[i] }].concat(s >= 0 ? [{ op: 'remove', index: s, before: '' }] : []))
      if (s >= 0) blocks[s].remove()
      var from = s >= 0 ? Math.min(i, s) : i, count = s >= 0 ? 2 : 1
      source.splice(from, count)
      blocks.splice(from, count)
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
      // A list or a row of links isn't cut: ⇧⌘Enter there adds a paragraph below, as ⌘Enter does.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !fixed(el) && el.tagName !== 'UL') split(el)
      else if (e.metaKey || e.ctrlKey) addParagraph(el)
      else if (fixed(el)) return
      else if (el.tagName === 'UL' && !e.shiftKey) newItem(el)
      else lineBreak()
    }
    if (block && block.classList.contains('space') && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      return removeSpace(block)
    }
    if (el && e.key === 'Backspace') {
      var li = el.tagName === 'UL' && itemAt(el)
      if (li ? atStart(li) : atStart(el)) {
        e.preventDefault()
        if (li) joinItem(el, li)
        else join(el)
      }
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
    var f = back.focus
    // A new or moved project: its anchor, selected to type over.
    if (f && f.anchor !== undefined && cases[f.anchor]) {
      var id = cases[f.anchor].tag.querySelector('span')
      id.focus()
      return selectAll(id)
    }
    var el = f && (f.selector ? document.querySelector(f.selector) : blocks[f.index])
    if (!el || blocks.indexOf(el) < 0) return
    el.focus()
    if (f.select) selectAll(el)
    else placeCaret(el, null)
  })
})()

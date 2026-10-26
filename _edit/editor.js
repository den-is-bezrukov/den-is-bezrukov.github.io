// Edit mode: every heading and paragraph is typed into in place and saved into the page's file a moment later.
// Enter starts a new paragraph, Backspace at the start of one joins it to the paragraph above; Shift+Enter sets a line break,
// ⌥Space a non-breaking space, ⌘K or pasting an address over selected words a link; «Ровные строки» evens out a block's lines.
(function () {
  var blocks = Array.prototype.slice.call(document.querySelectorAll('main h1, main h2, main h3, main p'))
  var source = window.EDIT_SOURCE
  if (blocks.length !== source.length) return alert('Не удалось сопоставить текст с файлом, режим правки выключен.')

  var style = document.createElement('style')
  style.textContent =
    '[contenteditable]:focus { outline: none; box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 6%, transparent); border-radius: 2px; background: color-mix(in srgb, currentColor 6%, transparent); }' +
    '.edit-status { position: fixed; right: 16px; bottom: 16px; font: 13px/1 Inter, system-ui, sans-serif; color: var(--muted); opacity: 0; transition: opacity .3s; pointer-events: none; }' +
    '.edit-status.on { opacity: 1; }' +
    '.edit-link, .edit-balance { z-index: 1; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 8px; font: 13px/1.4 Inter, system-ui, sans-serif; color: var(--text); background: var(--bg); box-shadow: 0 8px 24px color-mix(in srgb, var(--text) 12%, transparent); outline: none; }' +
    '.edit-link { position: fixed; width: 320px; }' +
    '.edit-balance { display: none; position: absolute; color: var(--muted); cursor: pointer; }' +
    '.edit-balance.shown { display: block; }' +
    '.edit-balance.on { color: var(--text); background: color-mix(in srgb, var(--text) 8%, var(--bg)); }' +
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
    span.textContent = ' '
    return span
  }
  function markNbsp(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = []
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeValue.indexOf(' ') >= 0 && !n.parentNode.classList.contains('nb')) nodes.push(n)
    }
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment()
      node.nodeValue.split(' ').forEach(function (part, i) {
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

  function setup(el) {
    el.contentEditable = 'plaintext-only'
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

  // Enter: the text after the caret becomes a new paragraph below.
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
    el.after(next)
    setup(next)
    el.savedHtml = first
    var after = indent(source[i], first)
    send([{ op: 'split', index: i, before: source[i], after: after, next: second }])
    source[i] = after
    source.splice(i + 1, 0, second)
    blocks.splice(i + 1, 0, next)
    next.focus()
    caret(next, 0)
  }

  // Backspace at the start of a paragraph joins it to the paragraph above; an empty one is simply removed.
  function join(el) {
    var i = blocks.indexOf(el), prev = blocks[i - 1]
    if (!prev) return
    var empty = !el.textContent.trim()
    if (!empty && !(plain(el) && plain(prev))) return
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
  var linking = null

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
    linking = { block: el, range: range.cloneRange(), link: link }
    toggle.classList.remove('shown')
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
    var l = linking
    if (!l) return
    linking = null
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
    placeToggle()
    pending = true
    clearTimeout(timer)
    timer = setTimeout(save, 700)
  })

  // «Ровные строки» evens out the lines of the block with the caret: the block gets the balance class, on the site too.
  // The button sits above that block, 8px off its highlight, right edge on the highlight's right edge, and follows the block as it grows.
  var current = null
  var toggle = document.createElement('button')
  toggle.className = 'edit-balance'
  toggle.textContent = 'Ровные строки'
  document.body.appendChild(toggle)
  toggle.addEventListener('mousedown', function (e) { e.preventDefault() })
  toggle.addEventListener('click', function () {
    if (!current) return
    toggle.classList.toggle('on', current.classList.toggle('balance'))
    placeToggle()
    save()
  })
  function placeToggle() {
    if (!current) return
    var rect = current.getBoundingClientRect(), size = toggle.getBoundingClientRect(), ring = 6 // the 6px highlight around a block being edited
    toggle.style.left = rect.right + ring + scrollX - size.width + 'px'
    toggle.style.top = rect.top - ring + scrollY - 8 - size.height + 'px'
  }
  document.addEventListener('focusin', function (e) {
    if (blocks.indexOf(e.target) < 0) return
    current = e.target
    toggle.classList.add('shown')
    toggle.classList.toggle('on', current.classList.contains('balance'))
    placeToggle()
  })

  // Leaving a block saves it and lays it out again with the site's line rules; an empty paragraph left behind goes away.
  document.addEventListener('focusout', function (e) {
    var el = e.target, i = blocks.indexOf(el)
    if (i < 0 || linking) return save()
    current = null
    toggle.classList.remove('shown')
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
    var el = e.target.isContentEditable && blocks.indexOf(e.target) >= 0 ? e.target : null
    if (el && e.key === 'Enter') {
      e.preventDefault()
      if (el.classList.contains('list')) return
      if (e.shiftKey) {
        insert(document.createElement('br'))
      } else {
        split(el)
      }
    }
    if (el && e.key === 'Backspace' && atStart(el)) {
      e.preventDefault()
      join(el)
    }
    if (el && e.altKey && e.code === 'Space') {
      e.preventDefault()
      insert(nbsp())
    }
    if (el && (e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
      e.preventDefault()
      openLink(el)
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
})()

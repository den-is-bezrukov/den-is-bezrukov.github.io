// Edit mode: every heading and paragraph is typed into in place and saved into the page's file a moment later.
(function () {
  var blocks = document.querySelectorAll('main h1, main h2, main h3, main p')
  var source = window.EDIT_SOURCE
  if (blocks.length !== source.length) return alert('Не удалось сопоставить текст с файлом, режим правки выключен.')

  var style = document.createElement('style')
  style.textContent =
    '[contenteditable]:focus { outline: none; box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 6%, transparent); border-radius: 2px; background: color-mix(in srgb, currentColor 6%, transparent); }' +
    '.edit-status { position: fixed; right: 16px; bottom: 16px; font: 13px/1 Inter, system-ui, sans-serif; color: var(--muted); opacity: 0; transition: opacity .3s; pointer-events: none; }' +
    '.edit-status.on { opacity: 1; }' +
    '.edit-balance { display: none; position: fixed; left: 16px; bottom: 16px; padding: 8px 12px; border: 0; border-radius: 999px; font: 500 13px/1 Inter, system-ui, sans-serif; color: var(--muted); background: color-mix(in srgb, currentColor 8%, transparent); cursor: pointer; }' +
    '.edit-balance.shown { display: block; }' +
    '.edit-balance.on { color: var(--text); background: color-mix(in srgb, var(--text) 12%, transparent); }' +
    '.nb { background: color-mix(in srgb, currentColor 18%, transparent); border-radius: 2px; }'
  document.head.appendChild(style)
  var status = document.createElement('div')
  status.className = 'edit-status'
  document.body.appendChild(status)

  var saved = [], balanced = []
  blocks.forEach(function (el, i) {
    // An editable block shows the file's indentation as spaces and line breaks, which pushes a link row off its place.
    el.innerHTML = el.innerHTML.trim()
    markNbsp(el)
    el.contentEditable = 'plaintext-only'
    el.spellcheck = true
    saved[i] = el.innerHTML
    balanced[i] = el.classList.contains('balance')
  })

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
  // the browser also keeps typed spaces as &nbsp; and leaves a <br> in a cleared line. Hand-set ones stay as &nbsp;,
  // and a line break set by hand keeps a space before it for the narrow screens that hide it.
  function clean(html) {
    return html
      .replace(/<span class="nw">([^<]*)<\/span>/g, '$1')
      .replace(/<span class="nb" contenteditable="false">&nbsp;<\/span>/g, '\u0000')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u0000/g, '&nbsp;')
      .replace(/<br>$/, '')
      .replace(/\s*<br class="wide">\s*/g, ' <br class="wide">')
  }

  function insert(node) {
    var sel = getSelection()
    if (!sel.rangeCount) return
    var range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    node.parentNode.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // The indentation trimmed on load goes back around the text, so the file keeps its layout.
  function indent(before, html) {
    return before.match(/^\s*/)[0] + html + before.match(/\s*$/)[0]
  }

  var timer, pending = false
  function show(text, stay) {
    status.textContent = text
    status.classList.add('on')
    clearTimeout(show.t)
    if (!stay) show.t = setTimeout(function () { status.classList.remove('on') }, 1200)
  }

  function save() {
    clearTimeout(timer)
    var edits = []
    blocks.forEach(function (el, i) {
      var balance = el.classList.contains('balance')
      if (clean(el.innerHTML) !== clean(saved[i]) || balance !== balanced[i]) edits.push({ index: i, before: source[i], after: indent(source[i], clean(el.innerHTML)), html: el.innerHTML, balance: balance })
    })
    if (!edits.length) return
    fetch('/save?' + location.pathname, { method: 'POST', body: JSON.stringify(edits) }).then(function (r) {
      if (!r.ok) throw new Error(r.status)
      edits.forEach(function (e) {
        source[e.index] = e.after
        saved[e.index] = e.html
        balanced[e.index] = e.balance
      })
      pending = false
      show('Сохранено')
    }).catch(function () {
      show('Не сохранилось. Обновите страницу', true)
    })
  }

  document.addEventListener('input', function () {
    pending = true
    clearTimeout(timer)
    timer = setTimeout(save, 700)
  })
  // «Ровные строки» evens out the lines of the block with the caret: the block gets the balance class, on the site too.
  var current = null
  var toggle = document.createElement('button')
  toggle.className = 'edit-balance'
  toggle.textContent = 'Ровные строки'
  document.body.appendChild(toggle)
  toggle.addEventListener('mousedown', function (e) { e.preventDefault() })
  toggle.addEventListener('click', function () {
    if (!current) return
    toggle.classList.toggle('on', current.classList.toggle('balance'))
    save()
  })
  document.addEventListener('focusin', function (e) {
    if (Array.prototype.indexOf.call(blocks, e.target) < 0) return
    current = e.target
    toggle.classList.add('shown')
    toggle.classList.toggle('on', current.classList.contains('balance'))
  })

  // Leaving a block saves it and lays it out again with the site's line rules.
  document.addEventListener('focusout', function (e) {
    save()
    if (Array.prototype.indexOf.call(blocks, e.target) < 0) return
    current = null
    toggle.classList.remove('shown')
    if (!window.typografRu) return
    e.target.innerHTML = clean(e.target.innerHTML)
    markNbsp(e.target)
    window.typografRu(e.target)
  })
  document.addEventListener('keydown', function (e) {
    // Enter sets a line break that holds on a full-width column; ⌥Space sets a non-breaking space.
    if (e.target.isContentEditable && e.key === 'Enter') {
      e.preventDefault()
      var br = document.createElement('br')
      br.className = 'wide'
      insert(br)
    }
    if (e.target.isContentEditable && e.altKey && e.code === 'Space') {
      e.preventDefault()
      insert(nbsp())
    }
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      save()
    }
  })
  // Links stay links but don't take you away mid-edit; ⌘-click still opens them.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a')
    if (a && !e.metaKey) e.preventDefault()
  })
  window.addEventListener('beforeunload', function (e) {
    if (pending) e.preventDefault()
  })
})()

// Edit mode: every heading and paragraph is typed into in place and saved into the page's file a moment later.
(function () {
  var blocks = document.querySelectorAll('main h1, main h2, main h3, main p')
  var source = window.EDIT_SOURCE
  if (blocks.length !== source.length) return alert('Не удалось сопоставить текст с файлом, режим правки выключен.')

  var style = document.createElement('style')
  style.textContent =
    '[contenteditable]:focus { outline: none; box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 6%, transparent); border-radius: 2px; background: color-mix(in srgb, currentColor 6%, transparent); }' +
    '.edit-status { position: fixed; right: 16px; bottom: 16px; font: 13px/1 Inter, system-ui, sans-serif; color: var(--muted); opacity: 0; transition: opacity .3s; pointer-events: none; }' +
    '.edit-status.on { opacity: 1; }'
  document.head.appendChild(style)
  var status = document.createElement('div')
  status.className = 'edit-status'
  document.body.appendChild(status)

  var saved = []
  blocks.forEach(function (el, i) {
    el.contentEditable = 'plaintext-only'
    el.spellcheck = true
    saved[i] = el.innerHTML
  })

  // The browser keeps typed spaces as &nbsp; and leaves a <br> in a cleared line; Typograf places the real nbsp itself.
  function clean(html) {
    return html.replace(/&nbsp;/g, ' ').replace(/<br>$/, '')
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
      if (el.innerHTML !== saved[i]) edits.push({ index: i, before: source[i], after: clean(el.innerHTML), html: el.innerHTML })
    })
    if (!edits.length) return
    fetch('/save?' + location.pathname, { method: 'POST', body: JSON.stringify(edits) }).then(function (r) {
      if (!r.ok) throw new Error(r.status)
      edits.forEach(function (e) {
        source[e.index] = e.after
        saved[e.index] = e.html
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
  document.addEventListener('focusout', save)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.isContentEditable) e.preventDefault()
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

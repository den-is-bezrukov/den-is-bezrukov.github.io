// Short words never end a line and a paragraph's last line never holds one word alone: the layout is fluid,
// so the non-breaking spaces are placed in the browser by Typograf's spacing rules.
(function () {
  if (!window.Typograf) return
  var NBSP = ' '
  var tp = new Typograf({
    locale: ['ru', 'en-US'],
    disableRule: '*',
    enableRule: ['common/nbsp/*', 'ru/nbsp/*', 'ru/dash/main'],
  })
  tp.disableRule(['common/nbsp/replaceNbsp', 'common/nbsp/nowrap'])
  tp.setSetting('common/nbsp/afterShortWord', 'lengthShortWord', 3)
  var INLINE = { A: 1, SPAN: 1, STRONG: 1, EM: 1, B: 1, I: 1 }
  function endsLine(node) {
    for (var n = node; ; n = n.parentNode) {
      for (var s = n.nextSibling; s; s = s.nextSibling) if (s.textContent.trim()) return false
      if (!n.parentNode || !INLINE[n.parentNode.nodeName]) return true
    }
  }
  // A hyphenated word (ИИ-агентами, B2B-сервис, UI-кит) breaks at its hyphen otherwise, leaving «ИИ-» alone.
  function keepHyphenated(node) {
    var re = /[0-9A-Za-zА-Яа-яЁё]+(?:-[0-9A-Za-zА-Яа-яЁё]+)+/g
    var text = node.nodeValue, last = 0, frag = document.createDocumentFragment(), m
    while ((m = re.exec(text))) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)))
      var word = document.createElement('span')
      word.className = 'nw'
      word.textContent = m[0]
      frag.appendChild(word)
      last = m.index + m[0].length
    }
    if (!last) return
    frag.appendChild(document.createTextNode(text.slice(last)))
    node.parentNode.replaceChild(frag, node)
  }
  var nodes = []
  var walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT)
  for (var n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) nodes.push(n)
  nodes.forEach(function (node) {
    var text = node.nodeValue
    var result = tp.execute(text)
    if (endsLine(node)) result = result.replace(/ (\S+\s*)$/, NBSP + '$1')
    if (result !== text) node.nodeValue = result
    keepHyphenated(node)
  })
})()

"""Serves the site at localhost; with ?edit in the address a page turns editable and writes edits back into its file:
a block's text and style, the balance class from Pretty/Balance, paragraphs split, joined, removed or moved,
a new section or project, a project's anchor taken off. Every write keeps the version it replaces, so ⌘Z can step back through them.

The editor script is injected only here, so the published page never carries it, and it goes in before Typograf:
it marks the file's own non-breaking spaces first, then Typograf lays the page out as on the site, and the editor
strips Typograf's non-breaking spaces and word spans before anything is saved.
"""
import http.server
import json
import os
import re
import socketserver
import sys
import threading
import time
import webbrowser
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDITABLE = ('h1', 'h2', 'h3', 'p', 'ul')
# Spaces between blocks: <div class="space space-300"></div>, 16 to 96px.
SPACES = ('100', '150', '200', '300', '400', '500', '600')
ONLY_SPACES = re.compile(r'(\s*<div class="space[^"]*"></div>)*\s*')
PORT = 8765
LOCK = threading.Lock()
# Earlier versions of every page, also kept as files in _edit/history (not in git), the last 200 per page.
HISTORY = os.path.join(ROOT, '_edit', 'history')
KEEP = 200
undone, redone, written = {}, {}, {}

PROJECT = '''<article id="{id}">
{i}  <h2>Новый проект</h2>
{i}  <p class="meta">Клиент · роль · год</p>
{i}  <p>Что это за проект и что я в нём сделал.</p>
{i}  <p class="meta">Роль: Денис Безруков</p>
{i}</article>'''


class Blocks(HTMLParser):
    """Every h1, h2, h3, p, ul and space inside <main> in document order, as (tag name, where its start tag begins, where its inner HTML
    begins and ends), and every <article> as (id, where it begins, where it ends)."""

    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.lines = [0]
        for line in source.splitlines(keepends=True):
            self.lines.append(self.lines[-1] + len(line))
        self.in_main = False
        self.open = None
        self.article = None
        self.spans = []
        self.articles = []
        self.feed(source)

    def position(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag == 'main':
            self.in_main = True
        elif self.in_main and tag == 'article':
            self.article = (dict(attrs).get('id'), self.position())
        elif self.in_main and self.open is None and (tag in EDITABLE or tag == 'div' and 'space' in (dict(attrs).get('class') or '').split()):
            start = self.position()
            self.open = (tag, start, start + len(self.get_starttag_text()))

    def handle_endtag(self, tag):
        if tag == 'main':
            self.in_main = False
        elif tag == 'article' and self.article:
            self.articles.append(self.article + (self.position() + len('</article>'),))
            self.article = None
        elif self.open and tag == self.open[0]:
            self.spans.append(self.open + (self.position(),))
            self.open = None


class Refused(Exception):
    pass


def with_class(tag, name, on):
    """The start tag with the class name added or removed."""
    m = re.search(r'\sclass="([^"]*)"', tag)
    names = m.group(1).split() if m else []
    if on and name not in names:
        names.append(name)
    if not on and name in names:
        names.remove(name)
    attr = ' class="%s"' % ' '.join(names) if names else ''
    if m:
        return tag[:m.start()] + attr + tag[m.end():]
    return tag[:-1] + attr + '>'


def retag(tag, old, new, cls):
    """A start tag turned into another style: a new tag name and class, other attributes and the balance class kept."""
    m = re.search(r'\sclass="([^"]*)"', tag)
    names = ([cls] if cls else []) + [c for c in (m.group(1).split() if m else []) if c == 'balance']
    attrs = re.sub(r'\sclass="[^"]*"', '', tag[1 + len(old):-1])
    return '<%s%s%s>' % (new, attrs, ' class="%s"' % ' '.join(names) if names else '')


def line_start(source, pos):
    """Where the line holding pos begins (its newline) and its indentation, when pos is the first thing on it."""
    line = source.rfind('\n', 0, pos)
    indent = source[line + 1:pos]
    return (line, indent) if not indent.strip() else (pos, '')


def project_row(source):
    """Where the project list under the summary begins and ends."""
    m = re.search(r'<section class="about">.*?(<p class="meta list">.*?</p>)', source, re.S)
    if not m:
        raise Refused('no project list')
    return m.start(1), m.end(1)


def entry(row, id):
    return re.search(r'<span><a href="[^"]*#%s">.*?</a></span>' % re.escape(id), row, re.S)


def relink(source, prefix, old, new):
    """Links to an anchor of a page, written as prefix + #old, pointed at #new."""
    return source.replace('href="%s#%s"' % (prefix, old), 'href="%s#%s"' % (prefix, new))


def pages():
    """The site's pages, as paths from ROOT: the home page and the cases."""
    return ['index.html', os.path.join('cases', 'index.html')]


def apply(source, edit, spans, articles):
    op = edit.get('op', 'edit')
    if op == 'addProject':
        id = edit['id']
        if not re.fullmatch(r'[a-z0-9-]+', id) or 'id="%s"' % id in source:
            raise Refused('bad anchor')
        after = next((a for a in articles if a[0] == edit.get('after')), articles[-1] if articles else None)
        if not after:
            raise Refused('no projects')
        _, indent = line_start(source, after[1])
        source = source[:after[2]] + '\n\n' + indent + PROJECT.format(id=id, i=indent) + source[after[2]:]
        start, end = project_row(source)
        row = source[start:end]
        m = entry(row, edit.get('after') or '')
        new = '<wbr><span><a href="#%s">Новый проект</a></span>' % id
        row = row[:m.end()] + new + row[m.end():] if m else re.sub(r'(</span>\s*</p>)$', new + r'\1', row)
        return source[:start] + row + source[end:]
    if op == 'removeAnchor':
        # The anchor comes off: the project's line in the project list goes, its text stays without the anchor, and only
        # a project with no blocks left goes as well.
        id = edit['id']
        _, a1, a2 = next(a for a in articles if a[0] == id)
        if re.search(r'<(h1|h2|h3|p|ul)\b', source[a1:a2]):
            tag_end = source.index('>', a1) + 1
            source = source[:a1] + re.sub(r'\sid="[^"]*"', '', source[a1:tag_end], 1) + source[tag_end:]
        else:
            cut = a1
            while cut and source[cut - 1] in ' \t\n':
                cut -= 1
            source = source[:cut] + source[a2:]
        try:
            start, end = project_row(source)
        except Refused:
            return source
        row = source[start:end]
        m = entry(row, id)
        if m:
            s1, s2 = m.span()
            if row[:s1].endswith('<wbr>'):
                s1 -= len('<wbr>')
            elif row[s2:].startswith('<wbr>'):
                s2 += len('<wbr>')
            row = row[:s1] + row[s2:]
        return source[:start] + row + source[end:]
    if op == 'renameAnchor':
        # A project gets a new anchor (or its first one); the links to it on this page follow.
        old, id = edit.get('before') or '', edit['id']
        _, a1, _ = articles[edit['article']]
        if (articles[edit['article']][0] or '') != old:
            raise Refused('changed')
        if not re.fullmatch(r'[a-z0-9-]+', id) or 'id="%s"' % id in source:
            raise Refused('bad anchor')
        tag_end = source.index('>', a1)
        start_tag = re.sub(r'\sid="[^"]*"', '', source[a1:tag_end]) + ' id="%s"' % id
        source = source[:a1] + start_tag + source[tag_end:]
        return relink(source, '', old, id) if old else source
    if op == 'fillProject':
        # A project with no blocks left gets the template back under its anchor.
        id = edit['id']
        _, a1, a2 = next(a for a in articles if a[0] == id)
        if re.search(r'<(h1|h2|h3|p|ul)\b', source[a1:a2]):
            raise Refused('not empty')
        _, indent = line_start(source, a1)
        return source[:a1] + PROJECT.format(id=id, i=indent) + source[a2:]
    if op == 'moveProject':
        k = next(n for n, a in enumerate(articles) if a[0] == edit['id'])
        j = k + edit['dir']
        if not 0 <= j < len(articles):
            return source
        (_, a1, a2), (_, b1, b2) = sorted([articles[k], articles[j]], key=lambda a: a[1])
        source = source[:a1] + source[b1:b2] + source[a2:b1] + source[a1:a2] + source[b2:]
        try:
            start, end = project_row(source)
        except Refused:
            return source
        row = source[start:end]
        x, y = entry(row, articles[k][0]), entry(row, articles[j][0])
        if x and y:
            (x1, x2), (y1, y2) = sorted([x.span(), y.span()])
            row = row[:x1] + row[y1:y2] + row[x2:y1] + row[x1:x2] + row[y2:]
        return source[:start] + row + source[end:]

    name, tag, start, end = spans[edit['index']]
    if source[start:end] != edit['before']:
        raise Refused('changed')
    close = end + len('</%s>' % name)
    cut, indent = line_start(source, tag)
    if op == 'edit':
        source = source[:start] + edit['after'] + source[end:]
        if 'balance' in edit:
            source = source[:tag] + with_class(source[tag:start], 'balance', edit['balance']) + source[start:]
    elif op == 'split':
        source = source[:start] + edit['after'] + source[end:close] + '\n%s<p>%s</p>' % (indent, edit['next']) + source[close:]
    elif op == 'insert':
        source = source[:close] + ''.join('\n' + indent + html for html in edit['blocks']) + source[close:]
    elif op == 'remove':
        source = source[:cut] + source[close:]
    elif op == 'space':
        size = str(edit.get('size'))
        if name != 'div' or size not in SPACES:
            raise Refused('bad space')
        source = source[:tag] + '<div class="space space-%s">' % size + source[start:]
    elif op == 'merge':
        _, _, prev_start, prev_end = spans[edit['index'] - 1]
        if source[prev_start:prev_end] != edit['prevBefore']:
            raise Refused('changed')
        source = source[:cut] + source[close:]
        source = source[:prev_start] + edit['after'] + source[prev_end:]
    elif op == 'retype':
        new = edit['tag']
        if new not in EDITABLE:
            raise Refused('bad tag')
        if 'lines' in edit:
            # Into a list, each line becomes an item on a line of its own; out of one, the items become lines of one block.
            lines = edit['lines']
            inner = ''.join('\n%s  <li>%s</li>' % (indent, l) for l in lines) + '\n' + indent if new == 'ul' else '<br>'.join(lines)
            source = source[:start] + inner + '</%s>' % new + source[close:]
            source = source[:tag] + retag(source[tag:start], name, new, edit.get('cls')) + source[start:]
            # A list right next to another one joins it: one list, not two with a gap between them.
            if new == 'ul':
                source = re.sub(r'</li>(\n[ \t]*)</ul>\s*<ul>(\n[ \t]*)<li>', r'</li>\2<li>', source)
            return source
        else:
            source = source[:end] + '</%s>' % new + source[close:]
        source = source[:tag] + retag(source[tag:start], name, new, edit.get('cls')) + source[start:]
    elif op == 'move':
        # The block swaps places with the next block up or down; the spaces between them stay where they are.
        other = spans[edit.get('to', edit['index'] + edit['dir'])]
        if source[other[2]:other[3]] != edit['otherBefore']:
            raise Refused('changed')
        (a1, a2), (b1, b2) = sorted([(tag, close), (other[1], other[3] + len('</%s>' % other[0]))])
        if not ONLY_SPACES.fullmatch(source[a2:b1]):
            raise Refused('not neighbours')
        source = source[:a1] + source[b1:b2] + source[a2:b1] + source[a1:a2] + source[b2:]
    return source


def snapshot(path, source):
    folder = os.path.join(HISTORY, os.path.relpath(path, ROOT).replace(os.sep, '__'))
    os.makedirs(folder, exist_ok=True)
    stamp = time.strftime('%Y%m%d-%H%M%S') + '-%03d' % (time.time() * 1000 % 1000)
    with open(os.path.join(folder, stamp + '.html'), 'w', encoding='utf-8') as f:
        f.write(source)
    for old in sorted(os.listdir(folder))[:-KEEP]:
        os.remove(os.path.join(folder, old))


def write(path, source):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(source)
    written[path] = source


def prefix(source_path, target_path):
    """How a link on source_path's page starts when it points at target_path's page: '', 'cases/' or '../'."""
    rel = os.path.relpath(os.path.dirname(target_path), os.path.dirname(source_path)).replace(os.sep, '/')
    return '' if rel == '.' else rel + '/'


def anchor_taken(path, id):
    """Whether another page already has this anchor on something else, so the project's pair can't take it."""
    for page in pages():
        other = os.path.join(ROOT, page)
        with open(other, encoding='utf-8') as f:
            if other != path and 'id="%s"' % id in f.read():
                return True
    return False


def relink_others(path, old, new):
    """A project's anchor goes by one name on both pages: the other page's project with the old anchor takes the new one,
    and every link to either of them follows. Each write is kept in history like the editor's own."""
    for page in pages():
        other = os.path.join(ROOT, page)
        if other == path:
            continue
        with open(other, encoding='utf-8') as f:
            source = f.read()
        result = relink(source, prefix(other, path), old, new)
        paired = re.search(r'<article\b[^>]*\sid="%s"' % re.escape(old), result)
        if paired:
            result = result[:paired.start()] + paired.group(0).replace('id="%s"' % old, 'id="%s"' % new) + result[paired.end():]
            result = relink(result, '', old, new)
            with open(path, encoding='utf-8') as f:
                own = f.read()
            relinked = relink(own, prefix(path, other), old, new)
            if relinked != own:
                write(path, relinked)
        if result != source:
            snapshot(other, source)
            undone.setdefault(other, []).append(source)
            redone[other] = []
            write(other, result)


def page_file(url):
    """The .html file a URL shows (a folder shows its index.html), or None outside the site."""
    path = os.path.normpath(os.path.join(ROOT, url.split('?')[0].lstrip('/')))
    if os.path.isdir(path):
        path = os.path.join(path, 'index.html')
    if path.startswith(ROOT) and path.endswith('.html') and os.path.isfile(path):
        return path


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, *args):
        pass

    # Every reload shows the files as they are on disk right now.
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_body(self, body, kind):
        data = body.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url, _, query = self.path.partition('?')
        path = page_file(url)
        if path and not url.endswith('/') and os.path.isdir(os.path.join(ROOT, url.strip('/'))):
            self.send_response(301)
            self.send_header('Location', url + '/' + ('?' + query if query else ''))
            return self.end_headers()
        if path and 'edit' in query.split('&'):
            with open(path, encoding='utf-8') as f:
                source = f.read()
            blocks = [source[a:b] for _, _, a, b in Blocks(source).spans]
            editor = ('<script>window.EDIT_SOURCE = %s</script>\n<script src="/_edit/editor.js"></script>\n'
                      % json.dumps(blocks, ensure_ascii=False).replace('</', '<\\/'))
            typograf = re.search(r'<script src="[./]*typograf\.min\.js"></script>', source)
            at = typograf.start() if typograf else source.index('</body>')
            page = source[:at] + editor + source[at:]
            return self.send_body(page, 'text/html; charset=utf-8')
        super().do_GET()

    def do_POST(self):
        action, _, url = self.path.partition('?')
        path = action in ('/save', '/undo', '/redo') and page_file(url)
        if not path:
            return self.send_error(404)
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        # One request at a time: each save checks the file against what the editor expects it to hold.
        with LOCK:
            with open(path, encoding='utf-8') as f:
                source = f.read()
            if action == '/save':
                edits = json.loads(body)
                blocks = Blocks(source)
                result = source
                try:
                    if any(e.get('op') == 'renameAnchor' and anchor_taken(path, e['id']) for e in edits):
                        raise Refused('anchor taken')
                    for edit in sorted(edits, key=lambda e: -e.get('index', 0)):
                        result = apply(result, edit, blocks.spans, blocks.articles)
                except (Refused, KeyError, IndexError, StopIteration):
                    return self.send_error(409, 'The page changed on disk, reload it')
                if result != source:
                    snapshot(path, source)
                    undone.setdefault(path, []).append(source)
                    redone[path] = []
                    write(path, result)
                # A project's new anchor: its pair on the other page and the links to both follow.
                for edit in edits:
                    if edit.get('op') == 'renameAnchor' and edit.get('before'):
                        relink_others(path, edit['before'], edit['id'])
                return self.send_body('{"ok": true}', 'application/json')
            # Undo and redo only step through the editor's own writes; a file changed from outside stops them.
            back, forth = (undone, redone) if action == '/undo' else (redone, undone)
            if not back.get(path):
                return self.send_body('{"ok": false}', 'application/json')
            if written.get(path) != source:
                return self.send_error(409, 'The page changed outside the editor')
            forth.setdefault(path, []).append(source)
            snapshot(path, source)
            write(path, back[path].pop())
        self.send_body('{"ok": true}', 'application/json')


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    for port in range(PORT, PORT + 20):
        try:
            server = Server(('127.0.0.1', port), Handler)
            break
        except OSError:
            continue
    url = f'http://localhost:{port}/'
    print(f'Просмотр: {url}\nПравка: {url}?edit\nОстановить: Ctrl+C')
    if '--no-open' not in sys.argv:
        webbrowser.open(url + '?edit')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

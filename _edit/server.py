"""Serves the site at localhost; with ?edit in the address a page turns editable and writes text edits back into its file.

The editor script is injected only here, so the published page never carries it. Typograf is left out
while editing, so its non-breaking spaces never land in the file.
"""
import http.server
import json
import os
import re
import socketserver
import sys
import webbrowser
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDITABLE = ('h1', 'h2', 'h3', 'p')
PORT = 8765


class Blocks(HTMLParser):
    """Offsets of the inner HTML of every h1, h2, h3 and p inside <main>, in document order."""

    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.lines = [0]
        for line in source.splitlines(keepends=True):
            self.lines.append(self.lines[-1] + len(line))
        self.in_main = False
        self.open = None
        self.spans = []
        self.feed(source)

    def position(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag == 'main':
            self.in_main = True
        elif self.in_main and tag in EDITABLE and self.open is None:
            self.open = (tag, self.position() + len(self.get_starttag_text()))

    def handle_endtag(self, tag):
        if tag == 'main':
            self.in_main = False
        elif self.open and tag == self.open[0]:
            self.spans.append((self.open[1], self.position()))
            self.open = None


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
            blocks = [source[a:b] for a, b in Blocks(source).spans]
            page = re.sub(r'<script src="[./]*typograf\.min\.js"></script>\n?', '', source)
            page = page.replace('</body>', '<script>window.EDIT_SOURCE = %s</script>\n'
                                '<script src="/_edit/editor.js"></script>\n</body>'
                                % json.dumps(blocks, ensure_ascii=False).replace('</', '<\\/'))
            return self.send_body(page, 'text/html; charset=utf-8')
        super().do_GET()

    def do_POST(self):
        path = self.path.startswith('/save?') and page_file(self.path[len('/save?'):])
        if not path:
            return self.send_error(404)
        edits = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with open(path, encoding='utf-8') as f:
            source = f.read()
        spans = Blocks(source).spans
        for edit in sorted(edits, key=lambda e: -e['index']):
            start, end = spans[edit['index']]
            if source[start:end] != edit['before']:
                return self.send_error(409, 'The page changed on disk, reload it')
            source = source[:start] + edit['after'] + source[end:]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(source)
        self.send_body('{}', 'application/json')


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

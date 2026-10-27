"""Prints the home page into denis-bezrukov.pdf next to it with the Chrome on this Mac, as the site's print styles lay it
out: A4, Geist, links that work. Run it after editing the text, before the site goes out: python3 _edit/pdf.py
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
OUT = os.path.join(ROOT, 'denis-bezrukov.pdf')

if not os.path.exists(CHROME):
    sys.exit('Нужен Google Chrome в «Программах».')
subprocess.run([
    CHROME, '--headless', '--disable-gpu', '--no-pdf-header-footer',
    # Time for the font and Typograf to lay the page out before it is printed.
    '--virtual-time-budget=5000',
    '--print-to-pdf=' + OUT,
    'file://' + os.path.join(ROOT, 'index.html'),
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print('Готово:', os.path.relpath(OUT, ROOT))

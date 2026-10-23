# cases

Denis Bezrukov's portfolio page: one static page with no build, deployed to GitHub Pages only on his word. It is his user site: the GitHub repository is `den-is-bezrukov/den-is-bezrukov.github.io` (not yet created), the page lives at `den-is-bezrukov.github.io`, and the resume links to cases by their ids (`den-is-bezrukov.github.io/#umo`), so don't rename the ids. Texts are Russian; answer him in Russian.

`index.html` holds only the copy, so Denis can edit it himself (his steps are in `README.md`: BBEdit, then commit and push in GitHub Desktop). Keep styles in `style.css` and scripts in their own files, never back in `index.html`. He works in this same folder: before editing, run `git status` and `git fetch`; uncommitted changes are his and mid-work, so ask before touching them.

- Each project is an `<article>` with a title, a grey line (client · role · period), two or three short paragraphs and a credits line. Write like Maxim Ilyakhov: past-tense verbs, facts and numbers, no self-praise, his honest share. Who did what comes from the Behance case credits; don't widen his role beyond them.
- Layout is deliberately default, like a Claude artifact or Notion page: Inter (Google Fonts), one 680px column, spacing instead of dividers, light and dark themes.
- Non-breaking spaces are placed in the browser by Typograf (`typograf.min.js`, 7.8.0, kept next to the page; `typography.js` applies his `ru-typograph` rules and keeps hyphenated words whole), so don't type `&nbsp;` into the copy.
- Images from client work: only what is already public on Behance; TXN Pro and UMO need his say first.

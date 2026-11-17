# Tickerboard

Live quote board for the desk: 5,000 instruments, 18 live fields each,
streamed from our market-data client.

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # static site in dist/
```

## Layout

- `src/feed/` is the market-data client. It is shared with the other desks
  and is not ours to change.
- `src/quoteStore.ts` holds the live values, coalesces feed messages into one
  update per frame, flashes changed cells, and windows row rendering.
- `src/App.tsx` holds filter and sort. `src/QuoteRow.tsx` renders a row.

## Behavior the desk relies on

- Every instrument is in the board and reachable by scrolling.
- Each numeric cell shows the latest value from the feed, to 2 decimals.
- A cell that changes flashes green (`flash-up`) or red (`flash-down`) for
  about 400 ms.
- Clicking a numeric column header sorts by it, descending first, then
  ascending on the next click. The order stays live as values move.
- The filter box narrows the board to symbols containing the text, ignoring
  case.

## QA automation

Our end-to-end checks read the board through its markup, so keep it:
rows are `tr[data-symbol]`, numeric cells are `td[data-field]` holding the
formatted value, sortable headers are `th[data-field]` with `aria-sort`,
and the filter is `input[name="filter"]`. The checks compare the screen to
the feed client's own state through `window.__marketQA`, which application
code must not use.

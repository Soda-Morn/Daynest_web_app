/**
 * Task notes: plain text with a small Markdown-style syntax.
 *
 * Notes are stored as plain text (so search, sync and old notes keep
 * working) and rendered with formatting. Supported:
 *
 *   **bold**   *italic*   ~~strike~~   `code`   [text](https://…)   bare https:// links
 *   # Heading   - bullet   1. numbered   - [ ] / - [x] checklist   > quote
 *
 * Rendering never uses HTML strings: the parser returns a small tree that
 * the component turns into elements, so note text can't inject markup.
 */

/* ---------------- Inline ---------------- */

const INLINE =
  /\*\*(.+?)\*\*|~~(.+?)~~|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])|\*(?![\s*])((?:\*\*[^*\n]+?\*\*|[^*\n])*?(?:\*\*[^*\n]+?\*\*|[^*\s]))\*/g
// (No regex lookbehind: older iOS Safari can't parse it.)

/** Parses inline marks into nodes: { t: 'text'|'b'|'i'|'s'|'code'|'a', … }. */
export function parseInline(text) {
  const out = []
  let last = 0
  // A fresh regex per call: the recursive calls below must not share lastIndex.
  const re = new RegExp(INLINE.source, 'g')
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'b', children: parseInline(m[1]) })
    else if (m[2] !== undefined) out.push({ t: 's', children: parseInline(m[2]) })
    else if (m[3] !== undefined) out.push({ t: 'code', text: m[3] })
    else if (m[4] !== undefined) out.push({ t: 'a', href: m[5], children: parseInline(m[4]) })
    else if (m[6] !== undefined) out.push({ t: 'a', href: m[6], children: [{ t: 'text', text: m[6] }] })
    else out.push({ t: 'i', children: parseInline(m[7]) })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) })
  return out
}

/* ---------------- Blocks ---------------- */

const RE_HEADING = /^#{1,3}\s+(.*)$/
const RE_CHECK = /^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/
const RE_BULLET = /^\s*[-*•]\s+(.*)$/
const RE_NUMBER = /^\s*(\d+)[.)]\s+(.*)$/
const RE_QUOTE = /^>\s?(.*)$/

/**
 * Parses notes into blocks:
 *  { t: 'h', children } | { t: 'p', lines: [children] } | { t: 'quote', lines }
 *  { t: 'ul' | 'ol' | 'check', start?, items: [{ children, done?, line }] }
 * `line` is the source line index (used to toggle checklist items).
 */
export function parseNotes(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let cur = null
  const push = (b) => {
    blocks.push(b)
    cur = b
  }
  lines.forEach((line, i) => {
    let m
    if (!line.trim()) {
      cur = null
    } else if ((m = RE_HEADING.exec(line))) {
      push({ t: 'h', children: parseInline(m[1]) })
      cur = null
    } else if ((m = RE_CHECK.exec(line))) {
      if (cur?.t !== 'check') push({ t: 'check', items: [] })
      cur.items.push({ children: parseInline(m[2]), done: m[1] !== ' ', line: i })
    } else if ((m = RE_BULLET.exec(line))) {
      if (cur?.t !== 'ul') push({ t: 'ul', items: [] })
      cur.items.push({ children: parseInline(m[1]), line: i })
    } else if ((m = RE_NUMBER.exec(line))) {
      if (cur?.t !== 'ol') push({ t: 'ol', start: +m[1], items: [] })
      cur.items.push({ children: parseInline(m[2]), line: i })
    } else if ((m = RE_QUOTE.exec(line))) {
      if (cur?.t !== 'quote') push({ t: 'quote', lines: [] })
      cur.lines.push(parseInline(m[1]))
    } else {
      if (cur?.t !== 'p') push({ t: 'p', lines: [] })
      cur.lines.push(parseInline(line))
    }
  })
  return blocks
}

/** Flips the checkbox on one line of the notes. */
export function toggleCheckLine(text, lineIndex) {
  const lines = String(text).split('\n')
  const line = lines[lineIndex]
  if (line === undefined) return text
  lines[lineIndex] = line.replace(/^(\s*[-*]\s+\[)( |x|X)(\])/, (_, a, c, b) => a + (c === ' ' ? 'x' : ' ') + b)
  return lines.join('\n')
}

/* ---------------- Editing helpers ----------------
 * Each takes the text and selection and returns the replacement to make:
 * { from, to, insert, selStart, selEnd } — the caller applies it so the
 * browser keeps its native undo history.
 */

/** Toggles an inline mark (e.g. '**') around the selection or the word at the caret. */
export function toggleWrap(text, start, end, mark) {
  // Already wrapped just outside the selection → unwrap.
  if (text.slice(start - mark.length, start) === mark && text.slice(end, end + mark.length) === mark) {
    return { from: start - mark.length, to: end + mark.length, insert: text.slice(start, end), selStart: start - mark.length, selEnd: end - mark.length }
  }
  // Selection itself includes the marks → unwrap.
  const sel = text.slice(start, end)
  if (sel.length >= mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, -mark.length)
    return { from: start, to: end, insert: inner, selStart: start, selEnd: start + inner.length }
  }
  // Nothing selected: use the word under the caret, if any.
  if (start === end) {
    let a = start
    let b = end
    while (a > 0 && /\w/.test(text[a - 1])) a--
    while (b < text.length && /\w/.test(text[b])) b++
    if (a === b) return { from: start, to: end, insert: mark + mark, selStart: start + mark.length, selEnd: start + mark.length }
    start = a
    end = b
  }
  // Keep surrounding spaces outside the marks ("**word** " not "**word **").
  const raw = text.slice(start, end)
  const lead = raw.length - raw.trimStart().length
  const trail = raw.length - raw.trimEnd().length
  const core = raw.trim()
  const insert = raw.slice(0, lead) + mark + core + mark + raw.slice(raw.length - trail)
  const s = start + lead + mark.length
  return { from: start, to: end, insert, selStart: s, selEnd: s + core.length }
}

const PREFIXES = {
  bullet: { re: /^\s*[-*•]\s+(?!\[[ xX]\])/, make: () => '- ' },
  number: { re: /^\s*\d+[.)]\s+/, make: (n) => `${n}. ` },
  check: { re: /^\s*[-*]\s+\[[ xX]\]\s?/, make: () => '- [ ] ' },
  heading: { re: /^#{1,3}\s+/, make: () => '## ' },
  quote: { re: /^>\s?/, make: () => '> ' },
}
const ANY_PREFIX = /^(\s*[-*]\s+\[[ xX]\]\s?|\s*[-*•]\s+|\s*\d+[.)]\s+|#{1,3}\s+|>\s?)/

/** Toggles a line style (bullet, number, check, heading, quote) on every selected line. */
export function toggleLinePrefix(text, start, end, kind) {
  const from = text.lastIndexOf('\n', start - 1) + 1
  let to = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end)
  if (to === -1) to = text.length
  const lines = text.slice(from, to).split('\n')
  const p = PREFIXES[kind]
  const all = lines.every((l) => !l.trim() || p.re.test(l))
  let n = 0
  const next = lines.map((l) => {
    if (all) return l.replace(p.re, '')
    if (!l.trim() && lines.length > 1) return l
    return p.make(++n) + l.replace(ANY_PREFIX, '')
  })
  const insert = next.join('\n')
  // Single line: keep the caret at the same spot in the text.
  if (lines.length === 1) {
    const delta = insert.length - lines[0].length
    const caret = Math.max(from + insert.length - (to - end), from)
    return { from, to, insert, selStart: start === end ? caret : Math.max(from, start + delta), selEnd: caret }
  }
  return { from, to, insert, selStart: from, selEnd: from + insert.length }
}

/** Wraps the selection as a link and selects the URL part to type over. */
export function insertLink(text, start, end) {
  const label = text.slice(start, end).trim() || 'link'
  const url = 'https://'
  const insert = `[${label}](${url})`
  const s = start + label.length + 3
  return { from: start, to: end, insert, selStart: s, selEnd: s + url.length }
}

/**
 * Enter inside a list continues it ("- " → next "- ", "3." → "4.");
 * Enter on an empty item ends the list. Returns null when not in a list.
 */
export function continueList(text, caret) {
  const from = text.lastIndexOf('\n', caret - 1) + 1
  const line = text.slice(from, caret)
  const m = /^(\s*)([-*•]\s+\[[ xX]\]\s?|[-*•]\s+|(\d+)([.)])\s+)(.*)$/.exec(line)
  if (!m) return null
  if (!m[5].trim() && text.slice(caret, text.indexOf('\n', caret) === -1 ? text.length : text.indexOf('\n', caret)).trim() === '') {
    // Empty item → leave the list.
    return { from, to: caret, insert: '', selStart: from, selEnd: from }
  }
  let prefix = m[2]
  if (m[3]) prefix = `${+m[3] + 1}${m[4]} `
  else if (/\[[ xX]\]/.test(prefix)) prefix = prefix.replace(/\[[xX]\]/, '[ ]')
  const insert = '\n' + m[1] + prefix
  return { from: caret, to: caret, insert, selStart: caret + insert.length, selEnd: caret + insert.length }
}

import re
import os
from pypdf import PdfReader

BASE = os.path.dirname(os.path.abspath(__file__))
PDF_PATH = os.path.join(BASE, 'V9938-programmers-guide.pdf')
MD_PATH = os.path.join(BASE, 'V9938-programmers-guide.md')

reader = PdfReader(PDF_PATH)

# ---- dictionaries ----
# join_candidates: any plausible English word (used to accept a+b)
join_candidates = set()
with open('/usr/share/dict/words') as f:
    for w in f:
        w = w.strip()
        if w.isalpha() and len(w) > 1:
            join_candidates.add(w.lower())

# known_words: words that actually occur standalone in THIS document,
# used to decide whether a fragment is a real word. Use a frequency
# threshold so one-off split fragments ("corr", "ections", "cessor") are
# not mistaken for real words.
from collections import Counter
_token_freq = Counter()
for page in reader.pages:
    t = page.extract_text() or ''
    for tok in re.findall(r'[A-Za-z]{2,}', t):
        _token_freq[tok.lower()] += 1
known_words = {tok for tok, cnt in _token_freq.items() if cnt >= 3}
known_words.update(['a', 'i'])

extra = [
    'msx', 'msx2', 'vdp', 'vram', 'rgb', 'pal', 'ntsc', 'v9938', 'tms9918a',
    'msx-video', 'graphic1', 'graphic2', 'graphic3', 'graphic4', 'graphic5',
    'graphic6', 'graphic7', 'text1', 'text2', 'multicolor', 'naplps',
    'bitmapped', 'hmmc', 'ymmm', 'hmmm', 'hmmv', 'lmmc', 'lmcm', 'lmmm',
    'lmmv', 'pset', 'point', 'srch', 'interlace', 'dotclock', 'lightpen',
    'backdrop', 'digitize', 'sprite', 'sprites', 'overlap', 'marketed',
    'valuable',
]
join_candidates.update(extra)
known_words.update(extra)

# add words found in the PDF (so "including", "introduced", etc. are accepted)
for page in reader.pages:
    t = page.extract_text() or ''
    for tok in re.findall(r'[A-Za-z]{2,}', t):
        join_candidates.add(tok.lower())

# expand common inflections: "market" -> "marketed", "correction" -> "corrections"
base = list(join_candidates)
for w in base:
    if len(w) >= 3 and w.isalpha():
        for suffix in ('s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly', 'ness'):
            join_candidates.add(w + suffix)

HEADER_RE = re.compile(r'\u00a9\s*1985\s*ASCII')
BLANK_RE = re.compile(r'^\s*This page is intentionally left blank\s*$')

letter_run = re.compile(r'(?<![A-Za-z])([A-Za-z])(?: ([A-Za-z])){1,}(?![A-Za-z])')


def fix_line(line):
    # collapse letter-spacing: "t h e y" -> "they"
    line = letter_run.sub(lambda m: m.group(0).replace(' ', ''), line)
    # join split words
    changed = True
    while changed:
        changed = False
        toks = line.split(' ')
        out = []
        i = 0
        while i < len(toks):
            a = toks[i]
            b = toks[i + 1] if i + 1 < len(toks) else ''
            joined = None
            if (
                a
                and b
                and (b[0].islower() or len(b) == 1)
                and not a.endswith(('.', ',', ';', ':', '!', '?', ')', ']'))
            ):
                cand = (a + b).lower()
                if cand in join_candidates and (a.lower() not in known_words or b.lower() not in known_words):
                    joined = a + b
            if joined is not None:
                out.append(joined)
                i += 2
                changed = True
            else:
                out.append(a)
                i += 1
        line = ' '.join(out)
    return re.sub(r' {2,}', ' ', line)


def is_heading(line):
    m1 = re.match(r'^\d{1,2}\.\s+([A-Z].*)$', line)
    if m1 and not re.search(r'[a-z]', m1.group(1)):
        return 2
    if re.match(r'^\d{1,2}\.\d{1,2}\.\s+[A-Z]', line):
        return 3
    if re.match(r'^\d{1,2}\.\d{1,2}\.\d{1,2}\.\s+[A-Z]', line):
        return 4
    if line.strip() in ('PREFACE', 'CONTENTS', 'DEFINITIONS', 'NOTE FROM THE EDITOR'):
        return 2
    return 0


def clean_heading(line):
    return re.sub(r'\.{3,}', ' ', line).strip()


out = []
out.append("# V9938 MSX-VIDEO - Technical Data Book: Programmer's Guide")
out.append('')
out.append('> ASCII CORPORATION / NIPPON GAKKI CO., LTD. (1985) - reworked & digitized by Eugeny Brychkov (2010-2024)')
out.append('>')
out.append('> Automatically converted from `litarature/V9938-programmers-guide.pdf`. Figures/diagrams are not included; tables are best-effort.')
out.append('')

for pno, page in enumerate(reader.pages, 1):
    text = page.extract_text() or ''
    if pno == 1:
        continue
    out.append('<!-- page %d -->' % pno)
    raw_lines = text.split('\n')

    def is_content(s):
        s = s.rstrip()
        if not s.strip():
            return 'blank'
        if HEADER_RE.search(s):
            return 'skip'
        if BLANK_RE.match(s):
            return 'skip'
        return 'keep'

    prev_empty = False
    i = 0
    n = len(raw_lines)
    while i < n:
        kind = is_content(raw_lines[i])
        if kind == 'skip':
            i += 1
            continue
        if kind == 'blank':
            if not prev_empty:
                out.append('')
            prev_empty = True
            i += 1
            continue
        prev_empty = False
        line = raw_lines[i].rstrip()
        stripped = line.strip()
        h = is_heading(stripped)
        if h:
            out.append('#' * h + ' ' + clean_heading(stripped))
            i += 1
            continue
        if re.fullmatch(r'[A-Z]', stripped):
            out.append('**' + stripped + '**')
            i += 1
            continue
        if re.fullmatch(r'R#\d+', stripped):
            out.append('**' + stripped + '**')
            i += 1
            continue
        code_start = i
        while i < n and is_content(raw_lines[i]) == 'keep' and re.match(r'^\s*(MSB .* LSB|R#\d+\s+\S.*)$', raw_lines[i].rstrip()):
            i += 1
        if i > code_start:
            block = '```text\n' + '\n'.join(raw_lines[k].rstrip() for k in range(code_start, i)) + '\n```'
            out.append(block)
            continue
        out.append(fix_line(line).strip())
        i += 1

result = '\n'.join(out)

# deterministic fixes for the few remaining split words the heuristics missed
POST_FIXES = [
    (r'\bso ftware-compatible\b', 'software-compatible'),
    (r'\bMS X\b', 'MSX'),
    (r'\bth at\b', 'that'),
    (r'\bfr om\b', 'from'),
    (r'\bcolo r\b', 'color'),
    (r'\bus ed\b', 'used'),
    (r'\bbelo w\b', 'below'),
    (r'\bmarg in\b', 'margin'),
    (r'\bbackdro p\b', 'backdrop'),
    (r'\bregist er\b', 'register'),
    (r'\bcomman d\b', 'command'),
    (r'\bexecute d\b', 'executed'),
    (r'\bregister r#46\b', 'register R#46'),
    (r'\bspri te\b', 'sprite'),
    (r'\bpatter n\b', 'pattern'),
    (r'\btabl e\b', 'table'),
    (r'\boccu r\b', 'occur'),
    (r'\bsprite s\b', 'sprites'),
    (r'\br ead\b', 'read'),
    (r'\bs ee\b', 'see'),
    (r'\bre ad\b', 'read'),
    (r'\bdi splayed\b', 'displayed'),
    (r'\bre gister\b', 'register'),
    (r'\bG 1\b', 'G1'),
    (r'\bG 2\b', 'G2'),
    (r'\bG 3\b', 'G3'),
    (r'\bG 4\b', 'G4'),
    (r'\bG 5\b', 'G5'),
    (r'\bG 6\b', 'G6'),
    (r'\bG 7\b', 'G7'),
    (r'\bGRAPHICS7\b', 'GRAPHIC7'),
    (r"there\s+[’']\s+re", "there're"),
    (r"there’sa", "there’s a"),
    (r'R# (\d+)', r'R#\1'),
]
for pattern, repl in POST_FIXES:
    result = re.sub(pattern, repl, result)

with open(MD_PATH, 'w') as f:
    f.write(result)
print('wrote', MD_PATH)
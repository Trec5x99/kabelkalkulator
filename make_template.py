#!/usr/bin/env python3
"""
make_template.py
Convert 'Nek 400 kalkulator/Utregning mal.docx' into a docxtemplater template
and save as 'template.docx' in the repo root.

Run once from repo root: python3 make_template.py
"""
import zipfile, shutil, re, sys

SRC = "Nek 400 kalkulator/Utregning mal.docx"
DST = "template.docx"

shutil.copy(SRC, DST)
print(f"Copied {SRC!r} → {DST!r}")

# ── Read all files from zip ─────────────────────────────────────────────────
files = {}
with zipfile.ZipFile(DST, "r") as z:
    for name in z.namelist():
        files[name] = z.read(name)

xml = files["word/document.xml"].decode("utf-8")

# ── Helpers ─────────────────────────────────────────────────────────────────

def rep(old, new):
    global xml
    n = xml.count(old)
    if n == 0:
        print(f"  WARN not found: {old[:70]!r}", file=sys.stderr)
    else:
        xml = xml.replace(old, new)
        print(f"  rep ×{n}: {old[:50]!r}")
    return n


def simplify_para(frag, tag, desc=""):
    """
    Find the <w:p> element whose text content contains `frag`,
    then replace ALL its runs with a single run containing `tag`.
    Only searches within <w:t> text nodes (safe from attribute false-positives).
    """
    global xml
    # Find the text node that contains frag
    idx = None
    pos = 0
    while True:
        ts = xml.find("<w:t", pos)
        if ts < 0:
            break
        te = xml.find("</w:t>", ts)
        if te < 0:
            break
        inner = re.sub(r"<[^>]+>", "", xml[ts : te + 6])
        if frag in inner:
            idx = ts
            break
        pos = te + 6

    if idx is None:
        print(f"  WARN simplify_para not found ({desc or frag[:50]!r})", file=sys.stderr)
        return

    # Find enclosing <w:p …>
    pstart = xml.rfind("<w:p ", 0, idx)
    pstart2 = xml.rfind("<w:p>", 0, idx)
    pstart = max(pstart, pstart2)
    pend = xml.find("</w:p>", idx) + 6

    para = xml[pstart:pend]
    open_tag_end = xml.index(">", pstart) + 1
    open_tag = xml[pstart:open_tag_end]

    ppr_m = re.search(r"<w:pPr>.*?</w:pPr>", para, re.DOTALL)
    ppr = ppr_m.group(0) if ppr_m else ""

    rpr_m = re.search(r"<w:rPr>.*?</w:rPr>", para, re.DOTALL)
    rpr = rpr_m.group(0) if rpr_m else ""

    new_para = (
        f"{open_tag}{ppr}"
        f'<w:r>{rpr}<w:t xml:space="preserve">{tag}</w:t></w:r>'
        f"</w:p>"
    )
    xml = xml[:pstart] + new_para + xml[pend:]
    lbl = desc or frag[:50]
    print(f"  simplify_para: {lbl!r} → {tag!r}")


# ═══════════════════════════════════════════════════════════════════════════
# 1. SIMPLIFY MULTI-RUN PARAGRAPHS FIRST (before simple replacements)
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Simplifying multi-run paragraphs ──")

# P37 ΔU formula  (runs: "Δ" + "U = 2 × " + "ρ" + "× L × I / A = …")
simplify_para(
    "2 × 0,018 × 13m × 10,8A / 2,5mm² = 2,02V",
    "{spenningsfallFormel}",
    "spenningsfall formula",
)

# P39 ΔU percentage line
simplify_para(
    "= 2,02V × 100 / 230V = 0,9%   &lt;   ",
    "{spenningsfallProsent}  =&gt;  {spenningsfallStatus}",
    "spenningsfall pct",
)

# P11 Krav 1 result line
simplify_para(
    "10,8A  ≤  16A  ≤  19,5A  ",
    "{krav1tekst}  =&gt;  {krav1status}",
    "krav1",
)

# P14 Krav 2 result line
simplify_para(
    "I2 = 19,2A  ≤  ",
    "{krav2tekst}  =&gt;  {krav2status}",
    "krav2",
)

# P58 Ik2pmin formula with substituted values
simplify_para(
    "= (0,9 × 230) / (2 × 1,2 × (31m",
    "{ik2pFormelMedVerdier}",
    "ik2p formula med verdier",
)

# P59 Ik2pmin result line
simplify_para(
    "       = 0,677 ",
    "{ik2pResultat}",
    "ik2p resultat",
)

# P61 I5 line
simplify_para(
    "I5 = In × 10   =   16A × 10 = 160A",
    "{ik2pI5Linje}",
    "i5 linje",
)

# P62 Anbefaling line
simplify_para(
    "Anbefaling: Ik2pmin",
    "{ik2pAnbefaling}  =  {ik2pStatus}",
    "anbefaling",
)

# P51 rfase value cell  ("7,41 " + "mΩ" + "/m")
simplify_para("7,41 ", "{ik2pRfase}", "rfase verdi")

# P55 Zytre value cell  ("31 " + "mΩ")
simplify_para("31 ", "{ik2pZytre}", "zytre verdi")

# ═══════════════════════════════════════════════════════════════════════════
# 2. SIMPLE STRING REPLACEMENTS
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Simple replacements ──")

# H2 heading
rep(
    "Beregninger 16A CK – Vaskemaskin og tørketrommel",
    "Beregninger {vernkode} – {kursnavnliste}",
)

# Korreksjonsfaktor table values
rep("30°C   →   Faktor: 1,00", "{omgTemp}   →   Faktor: {kfTemp}")
rep("1   →   Faktor: 1,00",    "{antallKurser}   →   Faktor: {kfKurser}")

# Iz formula value (run: " = 19,5A × 1,00 × 1,00 = 19,5A")
rep(" = 19,5A × 1,00 × 1,00 = 19,5A",
    " = {izRaw} × {kfTemp} × {kfKurser} = {izEndelig}")

# Ny Iz line (run: ": 19,5A")
rep(": 19,5A", ": {izEndelig}")

# Vern double-underlined lines (2 occurrences: P16 + P42)
rep("Vern: CK 16A", "Vern: {vernkode}")

# Kabel double-underlined + oppsumering value (P17, P43, P69)
rep("Kabel: PN 2×2,5mm² + 2,5mm²", "Kabel: {kabelLinje}")

# Oppsumering vern compact form
rep("<w:t>CK16A</w:t>", "<w:t>{vernkode}</w:t>")

# Table cell values: A1 → {metode}  (appears in kabel/vern + oppsumering)
rep("<w:t>A1</w:t>", "<w:t>{metode}</w:t>")

# Table cell: antall ledere "2"  (only one occurrence)
rep("<w:t>2</w:t>", "<w:t>{antallLedere}</w:t>")

# Table cells: "13m" → {lengde}  (spenningsfall + ik2pmin tables)
rep("<w:t>13m</w:t>", "<w:t>{lengde}</w:t>")

# Ik2pmin table: U value
rep("<w:t>230V</w:t>", "<w:t>{ik2pU}</w:t>")

# Spenningsfall krav cell: "5" → {grense}
# P39 was already simplified so only P35's <w:t>5</w:t> remains
rep("<w:t>5</w:t>", "<w:t>{grense}</w:t>")

# ═══════════════════════════════════════════════════════════════════════════
# 3. LOOP MARKERS  {#kurser} / {/kurser}
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Injecting loop markers ──")

# {#kurser} immediately before the H2 heading paragraph
marker = "Beregninger {vernkode} – {kursnavnliste}"
idx_h2 = xml.find(marker)
if idx_h2 < 0:
    print("  WARN: H2 heading not found; cannot inject {#kurser}", file=sys.stderr)
else:
    pstart_h2 = max(xml.rfind("<w:p ", 0, idx_h2), xml.rfind("<w:p>", 0, idx_h2))
    xml = (xml[:pstart_h2]
           + '<w:p><w:r><w:t>{#kurser}</w:t></w:r></w:p>'
           + xml[pstart_h2:])
    print("  inserted {#kurser} before H2")

# {/kurser} immediately after the last </w:tbl> in the document
last_tbl = xml.rfind("</w:tbl>")
if last_tbl < 0:
    print("  WARN: no </w:tbl> found; cannot inject {/kurser}", file=sys.stderr)
else:
    ins = last_tbl + len("</w:tbl>")
    xml = (xml[:ins]
           + '<w:p><w:r><w:t>{/kurser}</w:t></w:r></w:p>'
           + xml[ins:])
    print("  inserted {/kurser} after last </w:tbl>")

# ═══════════════════════════════════════════════════════════════════════════
# 4. MOTOR / OVERBELASTNING / JORDING  conditional sections
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Building Motor/OV/Jording sections ──")

_CELL_BORDERS = (
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
)
_CELL_MAR = (
    '<w:top w:w="60" w:type="dxa"/>'
    '<w:left w:w="120" w:type="dxa"/>'
    '<w:bottom w:w="60" w:type="dxa"/>'
    '<w:right w:w="120" w:type="dxa"/>'
)
_TBL_BORDERS = (
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
)


def _tc(width, content, bold=False):
    rpr_inner = (
        '<w:rFonts w:cstheme="minorHAnsi"/>'
        + ('<w:b/><w:bCs/>' if bold else "")
        + '<w:color w:val="000000" w:themeColor="text1"/>'
    )
    return (
        f"<w:tc>"
        f"<w:tcPr>"
        f'<w:tcW w:w="{width}" w:type="dxa"/>'
        f"<w:tcBorders>{_CELL_BORDERS}</w:tcBorders>"
        f"<w:tcMar>{_CELL_MAR}</w:tcMar>"
        f"</w:tcPr>"
        f"<w:p>"
        f'<w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>'
        f"<w:r>"
        f"<w:rPr>{rpr_inner}</w:rPr>"
        f'<w:t xml:space="preserve">{content}</w:t>'
        f"</w:r>"
        f"</w:p>"
        f"</w:tc>"
    )


def _loop_row_single(loop_tag):
    """A single-cell row spanning 2 columns containing loop_tag."""
    return (
        f"<w:tr>"
        f"<w:tc>"
        f'<w:tcPr><w:tcW w:w="9200" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr>'
        f"<w:p><w:r><w:t>{loop_tag}</w:t></w:r></w:p>"
        f"</w:tc>"
        f"</w:tr>"
    )


def make_section(cond, h2_text, rader_var):
    """
    Build:
      {#cond}
      H2: h2_text
      table with {#rader_var} loop (label | verdi rows)
      {/cond}
    """
    open_cond  = "{" + cond + "}"
    close_cond = "{/" + cond + "}"
    loop_open  = "{#" + rader_var + "}"
    loop_close = "{/" + rader_var + "}"

    h2 = (
        "<w:p>"
        "<w:pPr><w:pStyle w:val=\"Heading2\"/></w:pPr>"
        f"<w:r><w:t>{h2_text}</w:t></w:r>"
        "</w:p>"
    )

    template_row = (
        "<w:tr>"
        + _tc("4600", "{label}", bold=True)
        + _tc("4600", "{verdi}")
        + "</w:tr>"
    )

    table = (
        "<w:tbl>"
        "<w:tblPr>"
        '<w:tblW w:w="9200" w:type="dxa"/>'
        f"<w:tblBorders>{_TBL_BORDERS}</w:tblBorders>"
        '<w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar>'
        "</w:tblPr>"
        '<w:tblGrid><w:gridCol w:w="4600"/><w:gridCol w:w="4600"/></w:tblGrid>'
        + _loop_row_single(loop_open)
        + template_row
        + _loop_row_single(loop_close)
        + "</w:tbl>"
    )

    return (
        f'<w:p><w:r><w:t>{open_cond}</w:t></w:r></w:p>'
        + h2 + table
        + f'<w:p><w:r><w:t>{close_cond}</w:t></w:r></w:p>'
    )


motor_sec = make_section("harMotor", "Motorberegning",     "motorRader")
ov_sec    = make_section("harOv",    "Overbelastningsvern","ovRader")
jord_sec  = make_section("harJord",  "Jording",            "jordRader")

body_end = xml.rfind("</w:body>")
if body_end < 0:
    print("  WARN: </w:body> not found", file=sys.stderr)
else:
    xml = xml[:body_end] + motor_sec + ov_sec + jord_sec + xml[body_end:]
    print("  appended Motor / OV / Jording sections")

# ═══════════════════════════════════════════════════════════════════════════
# 5. WRITE BACK
# ═══════════════════════════════════════════════════════════════════════════
files["word/document.xml"] = xml.encode("utf-8")
with zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in files.items():
        z.writestr(name, data)

print(f"\n✓ Written {DST}")

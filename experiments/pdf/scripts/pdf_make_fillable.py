#!/usr/bin/env python3
"""Create fillable AcroForm text fields on a non-fillable PDF."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf._text_extraction import mult
from pypdf.generic import (
    ArrayObject,
    BooleanObject,
    DictionaryObject,
    FloatObject,
    NameObject,
    NumberObject,
    TextStringObject,
)


UNDERSCORE_RE = re.compile(r"_{3,}")
WORD_RE = re.compile(r"[a-z0-9]+")


@dataclass
class TextChunk:
    page: int
    x: float
    y: float
    scale: float
    text: str


@dataclass
class FieldCandidate:
    page: int
    x1: float
    y1: float
    x2: float
    y2: float
    base_name: str


LABEL_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"raison\s+sociale"), "raison_sociale"),
    (re.compile(r"adresse"), "adresse"),
    (re.compile(r"code\s+postal"), "code_postal"),
    (re.compile(r"\bville\b"), "ville"),
    (re.compile(r"\b(?:tel|telephone)\b"), "telephone"),
    (re.compile(r"\be[\s\-]?mail\b"), "email"),
    (re.compile(r"date\s+de\s+creation"), "date_creation"),
    (re.compile(r"code\s+naf"), "code_naf"),
    (re.compile(r"code\s+siret"), "code_siret"),
    (re.compile(r"forme\s+juridique"), "forme_juridique"),
    (re.compile(r"chiffres?\s+d[ -]?affaires"), "chiffre_affaires_ht"),
    (re.compile(r"effectif\s+total"), "effectif_total"),
    (re.compile(r"activites?\s+reelles?"), "activites_reelles"),
    (re.compile(r"particuliers?"), "clientele_particuliers"),
    (re.compile(r"professionnels?"), "clientele_professionnels"),
    (re.compile(r"autres"), "clientele_autres"),
    (re.compile(r"nom\s+de\s+l[ -]?assureur"), "assureur_actuel"),
    (re.compile(r"n[°o]?\s*de\s+la\s+police"), "numero_police"),
    (re.compile(r"nature\s+de\s+la\s+resiliation"), "nature_resiliation"),
    (re.compile(r"echeance\s+anniversaire"), "echeance_anniversaire"),
    (re.compile(r"date\s+d[ -]?effet\s+souhaitee"), "date_effet_souhaitee"),
    (re.compile(r"fractionnement\s+souhaite"), "fractionnement_souhaite"),
    (re.compile(r"demandes?\s+particulieres"), "demandes_particulieres"),
    (re.compile(r"si\s+oui,\s+lequel"), "nom_reseau"),
    (re.compile(r"signature\s+du\s+client"), "signature_client"),
]


def normalize_text(value: str) -> str:
    decomp = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(ch for ch in decomp if not unicodedata.combining(ch))
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9:/%()_\-\s]+", " ", ascii_only)
    return re.sub(r"\s+", " ", ascii_only).strip()


def slugify(value: str) -> str:
    words = WORD_RE.findall(normalize_text(value))
    return "_".join(words[:5]).strip("_")


def extract_text_chunks(reader: PdfReader) -> list[TextChunk]:
    output: list[TextChunk] = []
    for page_index, page in enumerate(reader.pages):
        page_chunks: list[tuple[float, float, float, str]] = []

        def visitor(text: str, cm: list[float], tm: list[float], _font: object, _size: object) -> None:
            clean = (text or "").strip()
            if not clean:
                return
            trm = mult(tm, cm)
            scale = abs(float(trm[0])) if trm else 1.0
            page_chunks.append((float(trm[4]), float(trm[5]), max(scale, 0.01), clean))

        page.extract_text(visitor_text=visitor)  # type: ignore[arg-type]
        for x, y, scale, text in page_chunks:
            output.append(TextChunk(page=page_index, x=x, y=y, scale=scale, text=text))
    return output


def infer_base_name(
    text: str,
    local_prefix: str,
    fallback_idx: int,
    run_idx: int,
    total_runs: int,
) -> str:
    full_norm = normalize_text(text)
    prefix_norm = normalize_text(local_prefix)

    numbered_activity = re.match(r"^\s*([1-6])\)", text)
    if numbered_activity and "%" in text:
        n = numbered_activity.group(1)
        return f"activite_{n}_description" if run_idx == 1 else f"activite_{n}_pourcentage"

    if "date d effet souhaitee" in full_norm and "fractionnement souhaite" in full_norm:
        return "date_effet_souhaitee" if run_idx == 1 else "fractionnement_souhaite"

    if "code postal" in full_norm and "ville" in full_norm and total_runs >= 2:
        return "code_postal" if run_idx == 1 else "ville"

    if "tel" in full_norm and "e mail" in full_norm and total_runs >= 2:
        return "telephone" if run_idx == 1 else "email"

    if (
        "date de creation" in full_norm
        and "code naf" in full_norm
        and "code siret" in full_norm
        and total_runs >= 4
    ):
        names = ["date_creation", "code_naf", "code_siret", "forme_juridique"]
        return names[min(run_idx - 1, len(names) - 1)]

    if "echeance anniversaire" in full_norm and "nature de la resiliation" in full_norm and total_runs >= 2:
        return "echeance_anniversaire" if run_idx == 1 else "nature_resiliation"

    if "nom de l assureur actuel" in full_norm and "de la police actuelle" in full_norm and total_runs >= 2:
        return "assureur_actuel" if run_idx == 1 else "numero_police"

    if "fait a meylan" in full_norm:
        return "date_signature_client"

    for pattern, name in LABEL_PATTERNS:
        if pattern.search(prefix_norm):
            return name
    for pattern, name in LABEL_PATTERNS:
        if pattern.search(full_norm):
            return name

    if ":" in local_prefix:
        near_label = local_prefix.rsplit(":", 1)[0]
        slug = slugify(near_label)
        if slug:
            return slug

    slug = slugify(local_prefix) or slugify(text)
    if slug:
        return slug

    return f"champ_{fallback_idx:03d}"


def split_runs_with_grouping(text: str) -> list[tuple[int, int]]:
    runs = [(m.start(), m.end()) for m in UNDERSCORE_RE.finditer(text)]
    if not runs:
        return []

    grouped: list[tuple[int, int]] = []
    current_start, current_end = runs[0]
    for start, end in runs[1:]:
        between = text[current_end:start]
        if re.fullmatch(r"[\s/.\-]{0,5}", between):
            current_end = end
            continue
        grouped.append((current_start, current_end))
        current_start, current_end = start, end
    grouped.append((current_start, current_end))
    return grouped


def find_left_context(chunks: list[TextChunk], page: int, x: float, y: float) -> str:
    candidates: list[TextChunk] = []
    for chunk in chunks:
        if chunk.page != page:
            continue
        if "_" in chunk.text:
            continue
        if chunk.x >= x:
            continue
        if abs(chunk.y - y) > 6.0:
            continue
        candidates.append(chunk)
    if not candidates:
        return ""
    return max(candidates, key=lambda c: c.x).text


def calibrate_run_width_scale(
    reader: PdfReader, chunks: list[TextChunk], char_width: float
) -> dict[int, float]:
    scales: dict[int, float] = {}
    for page_index, page in enumerate(reader.pages):
        page_right = float(page.mediabox.right)
        page_factors: list[float] = []
        for chunk in chunks:
            if chunk.page != page_index:
                continue
            raw = chunk.text.strip()
            if not raw or re.search(r"[^_]", raw):
                continue
            count = len(raw)
            if count < 30:
                continue

            base_width = count * char_width * chunk.scale
            if base_width <= 0:
                continue

            target_right = page_right - 38.0
            observed_width = target_right - chunk.x
            if observed_width <= 0:
                continue

            factor = observed_width / base_width
            if 0.9 <= factor <= 2.5:
                page_factors.append(factor)

        scales[page_index] = sorted(page_factors)[len(page_factors) // 2] if page_factors else 1.45
    return scales


def build_candidates(
    reader: PdfReader,
    char_width: float,
    field_height: float,
    x_offset: float,
    run_width_scale: float | None,
) -> list[FieldCandidate]:
    chunks = extract_text_chunks(reader)
    run_width_scale_by_page = calibrate_run_width_scale(reader, chunks, char_width)
    candidates: list[FieldCandidate] = []
    field_idx = 0

    for chunk in chunks:
        text = chunk.text
        groups = split_runs_with_grouping(text)
        if not groups:
            continue

        previous_end = 0
        for run_idx, (start, end) in enumerate(groups, start=1):
            field_idx += 1
            local_prefix = text[previous_end:start][-80:].strip()
            scaled_char_width = char_width * chunk.scale
            scaled_height = field_height * chunk.scale
            if not local_prefix:
                local_prefix = find_left_context(
                    chunks,
                    page=chunk.page,
                    x=chunk.x + start * scaled_char_width,
                    y=chunk.y,
                )
            previous_end = end

            if not local_prefix and re.fullmatch(r"[_\s/.\-()%]+", text):
                continue

            base = infer_base_name(
                text=text,
                local_prefix=local_prefix,
                fallback_idx=field_idx,
                run_idx=run_idx,
                total_runs=len(groups),
            )
            x1 = chunk.x + (start * scaled_char_width) + x_offset
            run_scale = run_width_scale if run_width_scale is not None else run_width_scale_by_page.get(chunk.page, 1.45)
            width = max((end - start) * scaled_char_width * run_scale, 34.0)
            x2 = x1 + width
            y1 = chunk.y - scaled_height * 0.85
            y2 = y1 + scaled_height

            candidates.append(
                FieldCandidate(
                    page=chunk.page,
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    base_name=base,
                )
            )

    return deduplicate_candidates(candidates)


def deduplicate_candidates(candidates: list[FieldCandidate]) -> list[FieldCandidate]:
    out: list[FieldCandidate] = []
    seen: set[tuple[int, int, int, int, int]] = set()
    for c in sorted(candidates, key=lambda v: (v.page, -v.y1, v.x1)):
        key = (c.page, int(c.x1), int(c.y1), int(c.x2), int(c.y2))
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def ensure_acroform(writer: PdfWriter) -> DictionaryObject:
    root = writer.root_object
    acroform_ref = root.get("/AcroForm")

    if acroform_ref:
        acroform = acroform_ref.get_object()
    else:
        acroform = DictionaryObject()
        acroform_ref = writer._add_object(acroform)
        root[NameObject("/AcroForm")] = acroform_ref

    if "/Fields" not in acroform:
        acroform[NameObject("/Fields")] = ArrayObject()
    acroform[NameObject("/NeedAppearances")] = BooleanObject(True)
    if "/DA" not in acroform:
        acroform[NameObject("/DA")] = TextStringObject("/Helv 10 Tf 0 g")
    return acroform


def make_unique_names(candidates: list[FieldCandidate]) -> list[tuple[FieldCandidate, str]]:
    used: dict[str, int] = {}
    named: list[tuple[FieldCandidate, str]] = []
    for cand in candidates:
        base = slugify(cand.base_name) or "champ"
        idx = used.get(base, 0) + 1
        used[base] = idx
        name = base if idx == 1 else f"{base}_{idx}"
        named.append((cand, name))
    return named


def apply_fields(
    reader: PdfReader,
    output_pdf: Path,
    mapping_json: Path,
    char_width: float,
    field_height: float,
    x_offset: float,
    run_width_scale: float | None,
) -> int:
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    acroform = ensure_acroform(writer)
    fields_array = acroform.get("/Fields")

    candidates = build_candidates(
        reader,
        char_width=char_width,
        field_height=field_height,
        x_offset=x_offset,
        run_width_scale=run_width_scale,
    )
    named_candidates = make_unique_names(candidates)

    mapping: dict[str, dict[str, object]] = {}
    for cand, field_name in named_candidates:
        page = writer.pages[cand.page]
        mb = page.mediabox
        page_left = float(mb.left)
        page_bottom = float(mb.bottom)
        page_right = float(mb.right)
        page_top = float(mb.top)

        x1 = max(page_left + 2.0, min(cand.x1, page_right - 20.0))
        x2 = max(x1 + 18.0, min(cand.x2, page_right - 2.0))
        y1 = max(page_bottom + 2.0, min(cand.y1, page_top - 12.0))
        y2 = max(y1 + 10.0, min(cand.y2, page_top - 2.0))

        annots = page.get("/Annots")
        if annots is None:
            annots = ArrayObject()
            page[NameObject("/Annots")] = annots

        rect = ArrayObject(
            [
                FloatObject(x1),
                FloatObject(y1),
                FloatObject(x2),
                FloatObject(y2),
            ]
        )

        widget = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/FT"): NameObject("/Tx"),
                NameObject("/T"): TextStringObject(field_name),
                NameObject("/V"): TextStringObject(""),
                NameObject("/Rect"): rect,
                NameObject("/F"): NumberObject(4),
                NameObject("/Ff"): NumberObject(0),
                NameObject("/DA"): TextStringObject("/Helv 10 Tf 0 g"),
            }
        )
        if page.indirect_reference is not None:
            widget[NameObject("/P")] = page.indirect_reference

        widget_ref = writer._add_object(widget)
        annots.append(widget_ref)
        fields_array.append(widget_ref)

        mapping[field_name] = {
            "page": cand.page + 1,
            "rect": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
            "source_name": cand.base_name,
        }

    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    with output_pdf.open("wb") as fh:
        writer.write(fh)

    mapping_json.parent.mkdir(parents=True, exist_ok=True)
    mapping_json.write_text(json.dumps(mapping, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    return len(named_candidates)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create fillable AcroForm text fields from blank lines in a PDF.")
    parser.add_argument("pdf", type=Path, help="Input non-fillable PDF")
    parser.add_argument(
        "--output-pdf",
        type=Path,
        default=Path("output/fillable_named.pdf"),
        help="Output path for generated fillable PDF",
    )
    parser.add_argument(
        "--mapping-json",
        type=Path,
        default=Path("output/fillable_named_fields.json"),
        help="JSON output with created field names and coordinates",
    )
    parser.add_argument(
        "--char-width",
        type=float,
        default=4.65,
        help="Estimated width for monospaced underscore characters in PDF units",
    )
    parser.add_argument(
        "--field-height",
        type=float,
        default=14.0,
        help="Height of generated text fields in PDF units",
    )
    parser.add_argument(
        "--x-offset",
        type=float,
        default=0.0,
        help="Horizontal offset applied to all generated fields (PDF units)",
    )
    parser.add_argument(
        "--run-width-scale",
        type=float,
        help="Override horizontal scale for underscore runs (default: auto-calibrated per page)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.pdf.exists() or not args.pdf.is_file():
        print(f"Input PDF not found: {args.pdf}")
        return 1

    reader = PdfReader(str(args.pdf))
    created_count = apply_fields(
        reader=reader,
        output_pdf=args.output_pdf,
        mapping_json=args.mapping_json,
        char_width=args.char_width,
        field_height=args.field_height,
        x_offset=args.x_offset,
        run_width_scale=args.run_width_scale,
    )
    print(f"Created {created_count} fillable fields in {args.output_pdf}")
    print(f"Wrote mapping to {args.mapping_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

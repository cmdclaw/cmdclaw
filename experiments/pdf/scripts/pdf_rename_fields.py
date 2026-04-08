#!/usr/bin/env python3
"""Rename PDF AcroForm field IDs to human-friendly names."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject


KEYWORD_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bnom\b"), "nom"),
    (re.compile(r"\bprenom\b"), "prenom"),
    (re.compile(r"\badresse\b"), "adresse"),
    (re.compile(r"\bcode\s*postal\b"), "code_postal"),
    (re.compile(r"\bville\b"), "ville"),
    (re.compile(r"\b(?:tel|telephone)\b"), "telephone"),
    (re.compile(r"\be[\s\-]?mail\b"), "email"),
    (re.compile(r"\bparticulier\b"), "particulier"),
    (re.compile(r"\bprofessionnel\b"), "professionnel"),
    (re.compile(r"\bimmatriculation\b"), "immatriculation"),
    (re.compile(r"\bdate\s*de\s*naissance\b"), "date_naissance"),
    (re.compile(r"\bdate\s*de\s*permis\b"), "date_permis"),
    (re.compile(r"\bbonus\b"), "bonus"),
    (re.compile(r"\b(?:nombre\s*de\s*km|km\s*/an)\b"), "kilometrage_annuel"),
    (re.compile(r"\bprofession\b"), "profession"),
    (re.compile(r"\bmode\s*acquisition\b"), "mode_acquisition"),
    (re.compile(r"\blieu\s*de\s*garage\b"), "lieu_garage"),
    (re.compile(r"\busage\b"), "usage"),
    (re.compile(r"\bnouvelle\s*acquisition\b"), "nouvelle_acquisition"),
    (re.compile(r"\bdeja\s*assure\b"), "deja_assure"),
    (re.compile(r"\bassureur\s*precedent\b"), "assureur_precedent"),
    (re.compile(r"\bdate\s*d.?achat\b"), "date_achat"),
    (re.compile(r"\bdate\s*du\s*dernier\s*controle\b"), "date_dernier_controle"),
    (re.compile(r"\btaux\b"), "taux"),
    (re.compile(r"\balcoolemie\b"), "alcoolemie"),
    (re.compile(r"\bmotif\b"), "motif"),
    (re.compile(r"\bresiliation\b"), "resiliation_compagnie"),
]

SECTION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\binformations\s+vous\s+concernant\b"), "informations_vous_concernant"),
    (
        re.compile(r"\binformations\s+sur\s+le\s+vehicule\s+a\s+assurer\b"),
        "informations_vehicule",
    ),
    (re.compile(r"\bconducteur\s+principal\b"), "conducteur_principal"),
    (re.compile(r"\bgaranties\s+souhaitees\b"), "garanties_souhaitees"),
    (re.compile(r"\bdate\s+d.?effet\s+souhaitee\b"), "date_effet"),
    (re.compile(r"\bdemandes\s+particulieres\b"), "demandes_particulieres"),
]

NOISY_LABEL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bserenys\b"),
    re.compile(r"\borias\b"),
    re.compile(r"\bboulevard\b"),
    re.compile(r"\bmeylan\b"),
    re.compile(r"\bquestionnaire\b"),
    re.compile(r"\bwww\b"),
    re.compile(r"\bcontact\b"),
]


@dataclass
class TextChunk:
    page: int
    x: float
    y: float
    text: str
    norm: str


@dataclass
class FieldWidget:
    page: int
    name: str
    field_type: str
    x: float
    y: float


def normalize_text(value: str) -> str:
    decomp = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(ch for ch in decomp if not unicodedata.combining(ch))
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9\s:/_-]+", " ", ascii_only)
    return re.sub(r"\s+", " ", ascii_only).strip()


def slugify(value: str) -> str:
    value = normalize_text(value)
    value = re.sub(r"[^a-z0-9]+", "_", value).strip("_")
    return value


def extract_text_chunks(reader: PdfReader) -> list[TextChunk]:
    chunks_out: list[TextChunk] = []
    for page_index, page in enumerate(reader.pages):
        chunks: list[tuple[float, float, str]] = []

        def visitor(text: str, _cm: Any, tm: list[float], _font: Any, _size: Any) -> None:
            clean = (text or "").strip()
            if not clean:
                return
            chunks.append((float(tm[4]), float(tm[5]), clean))

        page.extract_text(visitor_text=visitor)
        for x, y, text in chunks:
            norm = normalize_text(text)
            if not norm:
                continue
            chunks_out.append(TextChunk(page=page_index, x=x, y=y, text=text, norm=norm))
    return chunks_out


def get_inherited_attr(node: Any, key: str) -> Any:
    current = node
    for _ in range(12):
        if not current:
            return None
        if key in current:
            return current[key]
        parent_ref = current.get("/Parent")
        current = parent_ref.get_object() if parent_ref else None
    return None


def extract_widgets(reader: PdfReader) -> dict[str, FieldWidget]:
    widgets: dict[str, FieldWidget] = {}
    for page_index, page in enumerate(reader.pages):
        annots = page.get("/Annots") or []
        for annot_ref in annots:
            annot = annot_ref.get_object()
            if annot.get("/Subtype") != "/Widget":
                continue
            name = get_inherited_attr(annot, "/T")
            if not name:
                continue
            rect = annot.get("/Rect") or [0, 0, 0, 0]
            x = (float(rect[0]) + float(rect[2])) / 2.0
            y = (float(rect[1]) + float(rect[3])) / 2.0
            field_type = str(get_inherited_attr(annot, "/FT") or "/Tx").lstrip("/")
            candidate = FieldWidget(page=page_index, name=str(name), field_type=field_type, x=x, y=y)
            current = widgets.get(candidate.name)
            if current is None or (candidate.page, -candidate.y, candidate.x) < (
                current.page,
                -current.y,
                current.x,
            ):
                widgets[candidate.name] = candidate
    return widgets


def is_section_header(chunk: TextChunk) -> bool:
    raw = chunk.text.strip()
    if len(raw) < 8:
        return False
    if ":" not in raw:
        return False
    letters = [c for c in raw if c.isalpha()]
    if not letters:
        return False
    uppercase_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
    return uppercase_ratio > 0.7


def clean_label_text(text: str) -> str:
    text = normalize_text(text)
    text = re.sub(r"[_\.]{2,}", " ", text)
    text = re.sub(r"\b(?:oui|non|date|resp)\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" :;-")
    return text


def label_from_chunk(chunk: TextChunk) -> str | None:
    cleaned = clean_label_text(chunk.text)
    if not cleaned:
        return None
    # Prefer explicit dictionary labels first.
    for pattern, label in KEYWORD_PATTERNS:
        if pattern.search(cleaned):
            return label
    if any(pattern.search(cleaned) for pattern in NOISY_LABEL_PATTERNS):
        return None
    if any(ch.isdigit() for ch in cleaned):
        return None
    slug = slugify(cleaned)
    if not slug:
        return None
    word_count = len(slug.split("_"))
    if word_count > 4:
        return None
    if len(slug) > 28:
        return None
    if len(slug) < 3:
        return None
    if re.fullmatch(r"[0-9_]+", slug):
        return None
    return slug


def nearest_section_slug(page_chunks: list[TextChunk], y_anchor: float) -> str | None:
    candidates: list[tuple[float, str]] = []
    for chunk in page_chunks:
        if chunk.y < y_anchor - 2:
            continue
        for pattern, section in SECTION_PATTERNS:
            if pattern.search(chunk.norm):
                candidates.append((abs(chunk.y - y_anchor), section))
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[0])[1]


def nearest_label_slug(page_chunks: list[TextChunk], widget: FieldWidget) -> str | None:
    y_anchor = widget.y - 44.0
    candidates: list[tuple[float, TextChunk]] = []
    for chunk in page_chunks:
        dy = abs(chunk.y - y_anchor)
        if dy > 18.0:
            continue
        label = label_from_chunk(chunk)
        if not label:
            continue
        if is_section_header(chunk):
            continue
        # Favor labels just left of field, but allow checkbox labels on the right.
        if chunk.x <= widget.x:
            dx = widget.x - chunk.x
            score = dy * 6.0 + dx * 0.08
        else:
            dx = chunk.x - widget.x
            score = dy * 6.0 + dx * 0.12 + 4.0
        if ":" in chunk.text:
            score -= 2.0
        candidates.append((score, chunk))
    if not candidates:
        return None
    best = min(candidates, key=lambda t: t[0])[1]
    return label_from_chunk(best)


def build_mapping(reader: PdfReader) -> dict[str, str]:
    fields = reader.get_fields() or {}
    widgets = extract_widgets(reader)
    chunks = extract_text_chunks(reader)
    chunks_by_page: dict[int, list[TextChunk]] = {}
    for chunk in chunks:
        chunks_by_page.setdefault(chunk.page, []).append(chunk)

    mapping: dict[str, str] = {}
    used_names: set[str] = set()

    def make_unique(base: str) -> str:
        if base not in used_names:
            used_names.add(base)
            return base
        i = 2
        while f"{base}_{i}" in used_names:
            i += 1
        unique = f"{base}_{i}"
        used_names.add(unique)
        return unique

    # Pass 1: semantic labels by nearest local text + section prefix.
    per_base_count: dict[str, int] = {}
    ordered = sorted(
        widgets.values(), key=lambda w: (w.page, -w.y, w.x, w.field_type, w.name)
    )
    for widget in ordered:
        page_chunks = chunks_by_page.get(widget.page, [])
        label = nearest_label_slug(page_chunks, widget)
        section = nearest_section_slug(page_chunks, widget.y - 44.0)
        base = None
        if label:
            if section and section not in label:
                base = f"{section}_{label}"
            else:
                base = label
        if not base and section:
            base = f"{section}_{widget.field_type.lower()}"
        if not base:
            base = f"page_{widget.page + 1}_{widget.field_type.lower()}"
        per_base_count[base] = per_base_count.get(base, 0) + 1
        if per_base_count[base] > 1:
            base = f"{base}_{per_base_count[base]}"
        mapping[widget.name] = make_unique(base)

    # Any field without a widget still gets a deterministic name.
    for old_name in fields.keys():
        if old_name in mapping:
            continue
        base = "unplaced_field"
        mapping[old_name] = make_unique(base)

    return mapping


def rename_field_tree(node_ref: Any, mapping: dict[str, str]) -> None:
    node = node_ref.get_object()
    old_name = node.get("/T")
    if old_name and str(old_name) in mapping:
        node[NameObject("/T")] = TextStringObject(mapping[str(old_name)])
    for kid_ref in node.get("/Kids") or []:
        rename_field_tree(kid_ref, mapping)


def apply_renaming(reader: PdfReader, output_pdf: Path, mapping: dict[str, str]) -> None:
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    root = writer.root_object
    acroform_ref = root.get("/AcroForm")
    if not acroform_ref:
        with output_pdf.open("wb") as f:
            writer.write(f)
        return
    acroform = acroform_ref.get_object()
    for field_ref in acroform.get("/Fields") or []:
        rename_field_tree(field_ref, mapping)
    with output_pdf.open("wb") as f:
        writer.write(f)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Identify and rename PDF form fields with human-friendly IDs."
    )
    parser.add_argument("pdf", type=Path, help="Input PDF")
    parser.add_argument(
        "--output-pdf",
        type=Path,
        default=Path("output/renamed_fields.pdf"),
        help="Output PDF path with renamed fields",
    )
    parser.add_argument(
        "--mapping-json",
        type=Path,
        default=Path("output/field_mapping.json"),
        help="Output JSON mapping old_name -> new_name",
    )
    parser.add_argument(
        "--mapping-in",
        type=Path,
        help="Optional input JSON mapping old_name -> new_name to enforce",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print mapping, do not write a PDF",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.pdf.exists() or not args.pdf.is_file():
        print(f"Input PDF not found: {args.pdf}")
        return 1

    reader = PdfReader(str(args.pdf))
    mapping = build_mapping(reader)

    if args.mapping_in:
        if not args.mapping_in.exists():
            print(f"Mapping file not found: {args.mapping_in}")
            return 1
        user_mapping = json.loads(args.mapping_in.read_text(encoding="utf-8"))
        if not isinstance(user_mapping, dict):
            print("Mapping file must be a JSON object: {old_name: new_name}")
            return 1
        for old_name, new_name in user_mapping.items():
            if old_name in mapping and isinstance(new_name, str) and new_name.strip():
                mapping[old_name] = new_name.strip()

    # Enforce unique output names while preserving first occurrence.
    seen: set[str] = set()
    for old_name in sorted(mapping.keys()):
        base = mapping[old_name]
        if base not in seen:
            seen.add(base)
            continue
        i = 2
        while f"{base}_{i}" in seen:
            i += 1
        mapping[old_name] = f"{base}_{i}"
        seen.add(mapping[old_name])

    args.mapping_json.parent.mkdir(parents=True, exist_ok=True)
    args.mapping_json.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    if not args.dry_run:
        args.output_pdf.parent.mkdir(parents=True, exist_ok=True)
        apply_renaming(reader, args.output_pdf, mapping)

    for old in sorted(mapping.keys()):
        print(f"{old} -> {mapping[old]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Print form field names from a PDF file."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def is_uuid_like(value: str) -> bool:
    return bool(UUID_RE.match(value))


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def get_inherited_attr(node: Any, key: str) -> Any:
    """Read an annotation field attr directly or from parent chain."""
    current = node
    for _ in range(12):
        if not current:
            return None
        if key in current:
            return current.get(key)
        parent_ref = current.get("/Parent")
        current = parent_ref.get_object() if parent_ref else None
    return None


def build_friendly_names(reader: Any, fields: dict[str, Any]) -> dict[str, str]:
    field_locations: dict[str, tuple[int, float, float, str]] = {}

    for page_index, page in enumerate(reader.pages):
        annots = page.get("/Annots") or []
        for annot_ref in annots:
            annot = annot_ref.get_object()
            if annot.get("/Subtype") != "/Widget":
                continue

            field_name = get_inherited_attr(annot, "/T")
            if not field_name:
                continue

            field_type = get_inherited_attr(annot, "/FT") or "/Tx"
            field_type = str(field_type).lstrip("/")
            rect = annot.get("/Rect") or [0, 0, 0, 0]
            x_left = float(min(rect[0], rect[2]))
            y_top = float(max(rect[1], rect[3]))

            current = field_locations.get(field_name)
            candidate = (page_index, -y_top, x_left, field_type)
            if current is None or candidate < current:
                field_locations[field_name] = candidate

    # Fallback for fields without widget annotations.
    for name in fields.keys():
        field_locations.setdefault(name, (10_000, 0.0, 0.0, "Tx"))

    ordered_names = sorted(field_locations.items(), key=lambda item: item[1])

    counters: dict[tuple[int, str], int] = defaultdict(int)
    slug_counts: dict[str, int] = defaultdict(int)
    friendly: dict[str, str] = {}

    for name, (page_index, _, __, field_type) in ordered_names:
        base_slug = slugify(name)
        if base_slug and not is_uuid_like(name):
            slug_counts[base_slug] += 1
            friendly_name = (
                base_slug if slug_counts[base_slug] == 1 else f"{base_slug}_{slug_counts[base_slug]}"
            )
        else:
            counters[(page_index, field_type)] += 1
            count = counters[(page_index, field_type)]
            friendly_name = f"p{page_index + 1:02d}_{field_type.lower()}_{count:03d}"
        friendly[name] = friendly_name

    return friendly


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract and print AcroForm field names from a PDF"
    )
    parser.add_argument("pdf", type=Path, help="Path to the PDF file")
    parser.add_argument(
        "--output",
        choices=("raw", "map", "friendly", "json"),
        default="raw",
        help="raw: original names, map: original=friendly, friendly: only friendly ids, json: JSON map",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.pdf.exists() or not args.pdf.is_file():
        print(f"Error: file not found: {args.pdf}", file=sys.stderr)
        return 1

    try:
        from pypdf import PdfReader
    except Exception as exc:  # pragma: no cover
        print(
            "Error: pypdf is required. Install it with: pip install pypdf",
            file=sys.stderr,
        )
        print(f"Import detail: {exc}", file=sys.stderr)
        return 1

    try:
        reader = PdfReader(str(args.pdf))
        fields = reader.get_fields() or {}
    except Exception as exc:
        print(f"Error reading PDF: {exc}", file=sys.stderr)
        return 1

    if not fields:
        print("No form fields found.")
        return 0

    if args.output == "raw":
        for name in sorted(fields.keys()):
            print(name)
        return 0

    friendly = build_friendly_names(reader, fields)

    if args.output == "map":
        for name in sorted(fields.keys()):
            print(f"{name}={friendly[name]}")
        return 0

    if args.output == "friendly":
        for name in sorted(fields.keys()):
            print(friendly[name])
        return 0

    print(json.dumps(friendly, indent=2, sort_keys=True))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

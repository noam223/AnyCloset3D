#!/usr/bin/env python3
"""Scrape Formex texture collections into textures/formex and merge into formex_catalog.json."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "color picker" / "formex_catalog.json"
OUT_DIR = ROOT / "textures" / "formex"
CRAWL_PATH = ROOT / "color picker" / "_formex_texture_crawl.json"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Texture-focused styles from Formex catalogs (not paint solids already in the palette).
SECTIONS = [
    {
        "id": "abet-wood",
        "name": "ABET · צבעי עץ",
        "folder": "abet-wood",
        "prefix": "ABET",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/937-%D7%A7%D7%95%D7%9C%D7%A7%D7%A6%D7%99%D7%99%D7%AA%20%D7%A4%D7%95%D7%A8%D7%9E%D7%99%D7%99%D7%A7%D7%94%20ABET/%D7%A6%D7%91%D7%A2%D7%99%20%D7%A2%D7%A5",
    },
    {
        "id": "abet-fantasy",
        "name": "ABET · פנטזיות וגימורים",
        "folder": "abet-fantasy",
        "prefix": "ABET",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/937-%D7%A7%D7%95%D7%9C%D7%A7%D7%A6%D7%99%D7%99%D7%AA%20%D7%A4%D7%95%D7%A8%D7%9E%D7%99%D7%99%D7%A7%D7%94%20ABET/%D7%A4%D7%A0%D7%98%D7%96%D7%99%D7%95%D7%AA%20%D7%95%D7%92%D7%99%D7%9E%D7%95%D7%A8%D7%99%D7%9D",
    },
    {
        "id": "abet-metal",
        "name": "ABET · צבעים מטאליים",
        "folder": "abet-metal",
        "prefix": "ABET",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/937-%D7%A7%D7%95%D7%9C%D7%A7%D7%A6%D7%99%D7%99%D7%AA%20%D7%A4%D7%95%D7%A8%D7%9E%D7%99%D7%99%D7%A7%D7%94%20ABET/%D7%A6%D7%91%D7%A2%D7%99%D7%9D%20%D7%9E%D7%98%D7%90%D7%9C%D7%99%D7%99%D7%9D",
    },
    {
        "id": "dek-wood",
        "name": "DEKOPAL · צבעי עץ",
        "folder": "dek-wood",
        "prefix": "DEK",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/140-%D7%A7%D7%95%D7%9C%D7%A7%D7%A6%D7%99%D7%99%D7%AA%20%D7%A4%D7%95%D7%A8%D7%9E%D7%99%D7%99%D7%A7%D7%94%20DEKOPAL/%D7%A6%D7%91%D7%A2%D7%99%20%D7%A2%D7%A5",
    },
    {
        "id": "dek-fantasy",
        "name": "DEKOPAL · פנטזיות וגימורים",
        "folder": "dek-fantasy",
        "prefix": "DEK",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/140-%D7%A7%D7%95%D7%9C%D7%A7%D7%A6%D7%99%D7%99%D7%AA%20%D7%A4%D7%95%D7%A8%D7%9E%D7%99%D7%99%D7%A7%D7%94%20DEKOPAL/%D7%A4%D7%A0%D7%98%D7%96%D7%99%D7%95%D7%AA%20%D7%95%D7%92%D7%99%D7%9E%D7%95%D7%A8%D7%99%D7%9D",
    },
    {
        "id": "dek-metal",
        "name": "DEKOPAL · צבעים מטאליים",
        "folder": "dek-metal",
        "prefix": "DEK",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/140-%D7%A7%D7%95%D7%9C%D7%A7%D7%A6%D7%99%D7%99%D7%AA%20%D7%A4%D7%95%D7%A8%D7%9E%D7%99%D7%99%D7%A7%D7%94%20DEKOPAL/%D7%A6%D7%91%D7%A2%D7%99%D7%9D%20%D7%9E%D7%98%D7%90%D7%9C%D7%99%D7%99%D7%9D",
    },
    {
        "id": "nano",
        "name": "Nano Carbon",
        "folder": "nano",
        "prefix": "NANO",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/grp_1918-%D7%A7%D7%95%D7%9C%D7%A7%D7%A6%D7%99%D7%99%D7%AA_%D7%A0%D7%90%D7%A0%D7%95_%D7%A7%D7%A8%D7%91%D7%95%D7%9F_Nano_Carbon",
    },
    {
        "id": "polymer",
        "name": "פולימרים",
        "folder": "polymer",
        "prefix": "POLY",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/195-%D7%A4%D7%95%D7%9C%D7%99%D7%9E%D7%A8%D7%99%D7%9D",
    },
    {
        "id": "egger-formex",
        "name": "EGGER by Formex",
        "folder": "egger-formex",
        "prefix": "EGF",
        "base": "https://www.formex.co.il/%D7%A7%D7%98%D7%9C%D7%95%D7%92%D7%99%D7%9D/grp_1672-%D7%A7%D7%98%D7%9C%D7%95%D7%92_EGGER_by_Formex",
    },
]


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "he,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 800:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.formex.co.il/"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        if len(data) < 400:
            return False
        dest.write_bytes(data)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  download fail {url}: {exc}")
        return False


def page_url(base: str, page: int) -> str:
    if page <= 1:
        return base
    return f"{base.rstrip('/')}/{page}"


def max_page(html: str, base: str) -> int:
    pages = set()
    for m in re.finditer(r'href="([^"]+)"[^>]*>\s*(\d+)\s*<', html):
        href, num = m.group(1), int(m.group(2))
        if urllib.parse.unquote(base.split("/")[-1])[:8] in urllib.parse.unquote(href) or "/2" in href or href.rstrip("/").endswith(f"/{num}"):
            pages.add(num)
        elif re.search(r"/\d+/?$", href) and num < 40:
            # pagination links on formex catalogs
            if "formex.co.il" in href or href.startswith("/"):
                pages.add(num)
    # Also catch simple pagination like >2<
    for m in re.finditer(r">\s*(\d+)\s*<", html):
        n = int(m.group(1))
        if 1 <= n <= 30:
            pages.add(n)
    return max(pages) if pages else 1


def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"&amp;", "&", s)
    s = re.sub(r"&#39;", "'", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def parse_items(html: str) -> list[dict]:
    items = []
    # Product cards typically contain a catalog thumb + code/name text.
    blocks = re.findall(
        r'(<li[^>]*>[\s\S]*?</li>)',
        html,
        flags=re.I,
    )
    for block in blocks:
        if "prdPics/catalog/" not in block and "mat_image" not in block:
            continue
        imgs = re.findall(r'src="(https?://[^"]*prdPics/catalog/[^"]+)"', block)
        if not imgs:
            imgs = re.findall(r'src="(/prdPics/catalog/[^"]+)"', block)
            imgs = ["https://www.formex.co.il" + u for u in imgs]
        fulls = re.findall(r'href="(https?://[^"]*prdPics/catalog/image_[^"]+)"', block)
        if not fulls:
            fulls = re.findall(r'href="(/prdPics/catalog/image_[^"]+)"', block)
            fulls = ["https://www.formex.co.il" + u for u in fulls]
        text = strip_tags(block)
        if "קבוצת מחיר" not in text and not re.search(r"\b[A-Z0-9]{2,}\b", text):
            continue
        # Prefer CODE NAME CODE pattern (ABET)
        m = re.search(r"\b([A-Za-z0-9]{2,10})\s+(.+?)\s+\1\b", text)
        code = None
        name = None
        if m:
            code, name = m.group(1), m.group(2).strip(" ,")
        else:
            # DEKOPAL-ish: "שם 4037 וניר 4037, וניר"
            m2 = re.search(r"(?:^|\s)([A-Za-zא-ת][^0-9]{0,40}?)\s*(\d{3,5})\*?\s+([^0-9,]{1,30}?)\s+\2", text)
            if m2:
                name = (m2.group(1) + " " + m2.group(3)).strip(" ,")
                code = m2.group(2)
            else:
                m3 = re.search(r"\b(\d{3,5}|[A-Za-z]\d{2,4}|\d{2,4}[A-Za-z])\b", text)
                if not m3:
                    continue
                code = m3.group(1)
                name = text.split(code)[0].strip(" ,") or code
        if not code or not imgs:
            continue
        thumb = imgs[0]
        full = fulls[0] if fulls else thumb
        # Prefer full-size image_* when available
        items.append(
            {
                "code": code.upper() if re.search(r"[A-Za-z]", code) else code,
                "name": name[:80] if name else code,
                "thumb": thumb,
                "full": full,
                "raw": text[:160],
            }
        )
    # Dedupe by code keeping first
    seen = set()
    out = []
    for it in items:
        if it["code"] in seen:
            continue
        seen.add(it["code"])
        out.append(it)
    return out


def scrape_section(sec: dict) -> list[dict]:
    print(f"\n== {sec['name']} ==")
    try:
        html1 = fetch(page_url(sec["base"], 1))
    except Exception as exc:  # noqa: BLE001
        print(f"  FAIL page1: {exc}")
        return []
    pages = max_page(html1, sec["base"])
    # Cap crazy parse
    pages = min(max(pages, 1), 25)
    print(f"  pages≈{pages}")
    all_items = []
    for p in range(1, pages + 1):
        url = page_url(sec["base"], p)
        try:
            html = html1 if p == 1 else fetch(url)
        except Exception as exc:  # noqa: BLE001
            print(f"  page {p} fail: {exc}")
            break
        items = parse_items(html)
        print(f"  page {p}: {len(items)} items")
        if not items and p > 1:
            break
        all_items.extend(items)
        time.sleep(0.35)
    # Dedupe
    seen = set()
    uniq = []
    for it in all_items:
        if it["code"] in seen:
            continue
        seen.add(it["code"])
        uniq.append(it)
    print(f"  unique: {len(uniq)}")
    return uniq


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    crawl = {"sections": []}
    categories = []

    for sec in SECTIONS:
        items = scrape_section(sec)
        cat_items = []
        folder = OUT_DIR / sec["folder"]
        folder.mkdir(parents=True, exist_ok=True)
        for it in items:
            safe = re.sub(r"[^A-Za-z0-9_-]+", "_", it["code"])
            dest = folder / f"{safe}.jpg"
            src = it["full"] or it["thumb"]
            ok = download(src, dest)
            if not ok and it["thumb"] != src:
                ok = download(it["thumb"], dest)
            if not ok:
                continue
            item_id = f"{sec['prefix']}-{it['code']}"
            rel = f"textures/formex/{sec['folder']}/{safe}.jpg"
            cat_items.append(
                {
                    "id": item_id,
                    "name": it["name"],
                    "img": rel,
                    "finish": "matte",
                    "type": "texture",
                    "code": it["code"],
                }
            )
            time.sleep(0.08)
        crawl["sections"].append({"id": sec["id"], "name": sec["name"], "count": len(cat_items)})
        if cat_items:
            categories.append({"id": sec["id"], "name": sec["name"], "items": cat_items})
        print(f"  saved: {len(cat_items)}")

    CRAWL_PATH.write_text(json.dumps(crawl, ensure_ascii=False, indent=2), encoding="utf-8")

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    # Drop previous texture categories (keep paint solids/matte/half/gloss)
    keep_ids = {"solids", "matte", "half", "gloss", "solids-matte", "solids-half", "solids-gloss"}
    # Also keep categories whose items are all solid/hex
    old_cats = catalog.get("categories") or []
    kept = []
    for cat in old_cats:
        items = cat.get("items") or []
        if not items:
            continue
        if all(it.get("type") == "solid" or (it.get("hex") and not it.get("img")) for it in items):
            kept.append(cat)
        elif cat.get("id") in keep_ids:
            kept.append(cat)
    catalog["categories"] = kept + categories
    catalog["version"] = int(catalog.get("version") or 1) + 1
    catalog["texturesSource"] = "formex.co.il catalogs (ABET/DEKOPAL/Nano/Polymer/EGGER)"
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(len(c["items"]) for c in categories)
    print(f"\nDone. {total} textures in {len(categories)} categories. catalog v{catalog['version']}")


if __name__ == "__main__":
    main()

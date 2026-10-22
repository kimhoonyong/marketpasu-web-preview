#!/usr/bin/env python3
"""Update a PUBLIC, read-only market-news JSON snapshot from Google News RSS.

No Firebase, cloud credentials, AI, Telegram, paid API, or browser tokens.
Collect only article title, publisher, publication time and original RSS link.
If the feed is unavailable, fail without replacing the last usable snapshot.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "market" / "news.json"
TOPICS = ["코스피", "삼성전자", "SK하이닉스", "테슬라", "명신산업", "코스닥", "한국 증시"]
MAX_PER_TOPIC = 7
MAX_TOTAL = 42
KST = dt.timezone(dt.timedelta(hours=9))


def clean(value: str | None, limit: int = 220) -> str:
    return " ".join((value or "").split())[:limit]


def safe_url(text: str | None) -> str:
    value = clean(text, 1800)
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return ""
    except ValueError:
        return ""
    return value


def parse_rss(raw: bytes, topic: str, now: dt.datetime) -> list[dict]:
    root = ET.fromstring(raw)
    if root.tag != "rss":
        raise ValueError("UNEXPECTED_RSS_ROOT")
    records = []
    for item in root.findall("./channel/item"):
        title = clean(item.findtext("title"))
        link = safe_url(item.findtext("link"))
        source = clean(item.findtext("source"), 70) or "뉴스 발행처"
        if title.endswith(" - " + source):
            title = title[:-(len(source) + 3)]
        try:
            stamp = parsedate_to_datetime(item.findtext("pubDate") or "")
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=dt.timezone.utc)
            stamp = stamp.astimezone(dt.timezone.utc)
        except (TypeError, ValueError, OverflowError):
            continue
        # Do not show future-dated or older than 3 days feed entries.
        if stamp > now + dt.timedelta(minutes=10) or now - stamp > dt.timedelta(days=3):
            continue
        if not (title and link):
            continue
        records.append({
            "id": hashlib.sha256(link.encode("utf-8")).hexdigest()[:20],
            "title": title,
            "publisher": source,
            "url": link,
            "published_at": stamp.isoformat(),
            "topic": topic,
        })
        if len(records) >= MAX_PER_TOPIC:
            break
    return records


def feed_url(topic: str) -> str:
    query = urllib.parse.urlencode({
        "q": f"{topic} when:2d", "hl": "ko", "gl": "KR", "ceid": "KR:ko"
    })
    return "https://news.google.com/rss/search?" + query


def update_snapshot(now: dt.datetime | None = None) -> bool:
    now = now or dt.datetime.now(dt.timezone.utc)
    rows = []
    for topic in TOPICS:
        request = urllib.request.Request(
            feed_url(topic), headers={"User-Agent": "Mozilla/5.0 (compatible; MarketPasuPersonal/0.1)"}
        )
        try:
            with urllib.request.urlopen(request, timeout=9) as response:
                raw = response.read(1_500_001)
                if len(raw) > 1_500_000:
                    raise ValueError("FEED_TOO_LARGE")
            rows.extend(parse_rss(raw, topic, now))
        except (OSError, ET.ParseError, ValueError) as exc:
            print(f"Feed unavailable: {topic}: {type(exc).__name__}")
    seen_titles = set()
    unique = []
    for item in sorted(rows, key=lambda r: r["published_at"], reverse=True):
        key = item["title"].casefold().replace(" ", "")
        if key in seen_titles:
            continue
        seen_titles.add(key)
        unique.append(item)
        if len(unique) >= MAX_TOTAL:
            break
    if len(unique) < 3:
        raise RuntimeError("TOO_FEW_PUBLIC_ARTICLES_NO_WRITE")

    try:
        existing = json.loads(DEST.read_text(encoding="utf-8"))
        old_rows = existing.get("items", [])
    except (OSError, ValueError, TypeError):
        old_rows = []
    # Avoid no-op updates and unnecessary Pages deployments.
    if unique == old_rows:
        print("News contents unchanged")
        return False

    payload = {
        "version": 1,
        "source": "google_news_rss_public",
        "snapshot_date": now.astimezone(KST).date().isoformat(),
        "updated_at": now.isoformat(),
        "update_note": "Google News 공개 RSS에 표시된 기사 제목·발행처·링크입니다. 재탕/제목 변경 여부는 판정하지 않습니다.",
        "items": unique,
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = DEST.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(DEST)
    print(f"Updated {len(unique)} public article links")
    return True


if __name__ == "__main__":
    update_snapshot()

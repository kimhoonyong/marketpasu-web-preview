#!/usr/bin/env python3
"""Update a PUBLIC, read-only market-news JSON snapshot from Google News RSS.

No Firebase, cloud credentials, AI, Telegram, paid API, or browser tokens.
Collect only article title, publisher, publication time and original RSS link.
If the feed is unavailable, fail without replacing the last usable snapshot.
"""
from __future__ import annotations

import datetime as dt
import concurrent.futures
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "market" / "news.json"
HISTORY_DEST = ROOT / "market" / "history.json"
TOPICS = ["코스피", "삼성전자", "SK하이닉스", "테슬라", "명신산업", "코스닥", "한국 증시",
          "현대차", "NAVER", "엔비디아", "LG전자", "환율"]
MAX_PER_TOPIC = 6
MAX_TOTAL = 60
MAX_HISTORY_ITEMS = 400
HISTORY_DAYS = 30
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


def consolidate_articles(rows: list[dict]) -> list[dict]:
    """Combine exact same publisher/title or identical URL across RSS topic queries.

    Keep all topic tags. Similar stories or different reporting sources are
    intentionally not treated as verified duplicates or reprints.
    """
    by_url = {}
    by_title_and_source = {}
    unique = []
    for item in sorted(rows, key=lambda r: r["published_at"], reverse=True):
        title_key = " ".join(item["title"].casefold().split())
        source_key = " ".join(item["publisher"].casefold().split())
        fingerprint = (title_key, source_key)
        existing = by_url.get(item["url"]) or by_title_and_source.get(fingerprint)
        if existing is None:
            existing = dict(item)
            existing["topics"] = [item["topic"]]
            unique.append(existing)
        else:
            if item["topic"] not in existing["topics"]:
                existing["topics"].append(item["topic"])
        by_url[item["url"]] = existing
        by_title_and_source[fingerprint] = existing
    return unique



def balanced_articles(rows: list[dict], topics: list[str], limit: int) -> list[dict]:
    """Keep a couple of stories per tracked subject, then fill by recency."""
    chosen = []
    ids = set()
    for topic in topics:
        count = 0
        for item in rows:
            if item["id"] in ids or topic not in item.get("topics", [item.get("topic")]):
                continue
            chosen.append(item)
            ids.add(item["id"])
            count += 1
            if count >= 2 or len(chosen) >= limit:
                break
        if len(chosen) >= limit:
            break
    for item in rows:
        if len(chosen) >= limit:
            break
        if item["id"] not in ids:
            chosen.append(item)
            ids.add(item["id"])
    return sorted(chosen, key=lambda item: item["published_at"], reverse=True)


def update_history(old: dict, items: list[dict], today: str) -> dict:
    """Keep dated RSS observations, not publisher deletion or repost claims."""
    parsed_today = dt.date.fromisoformat(today)
    earliest = (parsed_today - dt.timedelta(days=HISTORY_DAYS - 1)).isoformat()
    records = old.get("records", {}) if isinstance(old, dict) else {}
    if not isinstance(records, dict):
        records = {}
    trimmed = {}
    for key, item in records.items():
        if not isinstance(key, str) or not isinstance(item, dict):
            continue
        dates = item.get("dates", [])
        dates = sorted(set(d for d in dates if isinstance(d, str) and earliest <= d <= today)) if isinstance(dates, list) else []
        if dates:
            trimmed[key] = {
                "dates": dates,
                "titles": [str(t)[:220] for t in item.get("titles", [])[-3:] if isinstance(t, str)] if isinstance(item.get("titles"), list) else []
            }
    for item in items:
        ident = item["id"]
        record = trimmed.setdefault(ident, {"dates": [], "titles": []})
        if today not in record["dates"]:
            record["dates"].append(today)
            record["dates"].sort()
        # A changed title for the same RSS link is only a suspected variation.
        if item["title"] not in record["titles"]:
            record["titles"].append(item["title"])
            record["titles"] = record["titles"][-3:]
    # Bound the long-lived public archive by last observation date.
    newest = sorted(trimmed.items(), key=lambda kv: kv[1]["dates"][-1], reverse=True)
    return {"version": 1, "retention_days": HISTORY_DAYS, "records": dict(newest[:MAX_HISTORY_ITEMS])}


def decorate_observations(items: list[dict], history: dict) -> list[dict]:
    result = []
    for item in items:
        dates = history["records"][item["id"]]["dates"]
        titles = history["records"][item["id"]]["titles"]
        result.append({**item, "first_observed": dates[0],
                       "last_observed": dates[-1],
                       "observed_days": len(dates),
                       "title_variants": len(titles)})
    return result


def fetch_topic(topic: str, now: dt.datetime) -> list[dict]:
    request = urllib.request.Request(
        feed_url(topic), headers={"User-Agent": "Mozilla/5.0 (compatible; MarketPasuPersonal/0.2)"}
    )
    try:
        with urllib.request.urlopen(request, timeout=9) as response:
            raw = response.read(1_500_001)
            if len(raw) > 1_500_000:
                raise ValueError("FEED_TOO_LARGE")
        return parse_rss(raw, topic, now)
    except (OSError, ET.ParseError, ValueError) as exc:
        print(f"Feed unavailable: {topic}: {type(exc).__name__}")
        return []


def update_snapshot(now: dt.datetime | None = None) -> bool:
    now = now or dt.datetime.now(dt.timezone.utc)
    rows = []
    # Bounded 4-worker concurrency: keeps 12 subjects responsive if a feed times out.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for batch in pool.map(lambda topic: fetch_topic(topic, now), TOPICS):
            rows.extend(batch)
    unique = balanced_articles(consolidate_articles(rows), TOPICS, MAX_TOTAL)
    if len(unique) < 3:
        raise RuntimeError("TOO_FEW_PUBLIC_ARTICLES_NO_WRITE")

    try:
        existing = json.loads(DEST.read_text(encoding="utf-8"))
        old_rows = existing.get("items", [])
    except (OSError, ValueError, TypeError):
        old_rows = []
    try:
        old_history = json.loads(HISTORY_DEST.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        old_history = {}
    today = now.astimezone(KST).date().isoformat()
    history = update_history(old_history, unique, today)
    enriched = decorate_observations(unique, history)
    # Avoid unnecessary publication when all displayed fields and the history match.
    if enriched == old_rows and history == old_history:
        print("News contents unchanged")
        return False

    payload = {
        "version": 2,
        "source": "google_news_rss_public",
        "snapshot_date": now.astimezone(KST).date().isoformat(),
        "updated_at": now.isoformat(),
        "update_note": "Google News 공개 RSS에 표시된 기사 제목·발행처·링크입니다. 재탕/제목 변경 여부는 판정하지 않습니다.",
        "items": enriched,
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = DEST.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(DEST)
    if history != old_history:
        history_tmp = HISTORY_DEST.with_suffix(".json.tmp")
        history_tmp.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        history_tmp.replace(HISTORY_DEST)
    print(f"Updated {len(unique)} public article links and 30-day observation index")
    return True


if __name__ == "__main__":
    update_snapshot()

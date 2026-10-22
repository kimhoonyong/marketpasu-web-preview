import datetime as dt
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "update-public-news.py"
spec = importlib.util.spec_from_file_location("public_news_updater", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
NOW = dt.datetime(2026, 10, 22, 3, 0, tzinfo=dt.timezone.utc)

def rss(title="삼성전자 실적", link="https://news.google.com/rss/articles/one", date="Thu, 22 Oct 2026 02:00:00 GMT"):
    return (f'<rss version="2.0"><channel><item><title>{title}</title>'
            f'<link>{link}</link><pubDate>{date}</pubDate>'
            '<source>가상뉴스</source></item></channel></rss>').encode("utf-8")


class PublicNewsTests(unittest.TestCase):
    def test_valid_public_rss_article(self):
        results = mod.parse_rss(rss(), "삼성전자", NOW)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["publisher"], "가상뉴스")
        self.assertEqual(results[0]["topic"], "삼성전자")
        self.assertEqual(len(results[0]["id"]), 20)

    def test_reject_javascript_links(self):
        self.assertEqual(mod.parse_rss(rss(link="javascript:alert(1)"), "test", NOW), [])
        self.assertEqual(mod.safe_url("http://example.com/news"), "")

    def test_reject_stale_or_future_news(self):
        self.assertEqual(mod.parse_rss(rss(date="Wed, 14 Oct 2026 02:00:00 GMT"), "test", NOW), [])
        self.assertEqual(mod.parse_rss(rss(date="Fri, 23 Oct 2026 02:00:00 GMT"), "test", NOW), [])

    def test_bad_document_fails_without_news(self):
        with self.assertRaises(ValueError):
            mod.parse_rss(b"<notrss/>", "test", NOW)

    def test_duplicate_across_topics_keeps_both_topic_tags(self):
        a = {"id": "one", "title": "삼성전자 실적", "publisher": "연합뉴스",
             "url": "https://news.google.com/a", "topic": "삼성전자",
             "published_at": "2026-10-22T03:00:00+00:00"}
        b = dict(a, id="two", url="https://news.google.com/b", topic="코스피")
        merged = mod.consolidate_articles([a, b])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["topics"], ["삼성전자", "코스피"])

    def test_distinct_publisher_or_changed_headline_stays_visible(self):
        a = {"id": "one", "title": "코스피 상승", "publisher": "연합뉴스",
             "url": "https://news.google.com/a", "topic": "코스피",
             "published_at": "2026-10-22T03:00:00+00:00"}
        b = dict(a, id="two", url="https://news.google.com/b", publisher="다른 신문")
        c = dict(a, id="three", url="https://news.google.com/c", title="코스피 하락")
        self.assertEqual(len(mod.consolidate_articles([a, b, c])), 3)

    def test_rss_only_public_https(self):
        self.assertTrue(mod.feed_url("코스피").startswith("https://news.google.com/rss/search?"))
        self.assertIn("q=", mod.feed_url("코스피"))


if __name__ == "__main__":
    unittest.main()

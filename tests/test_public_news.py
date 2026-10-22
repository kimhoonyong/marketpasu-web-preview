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

    def test_rss_only_public_https(self):
        self.assertTrue(mod.feed_url("코스피").startswith("https://news.google.com/rss/search?"))
        self.assertIn("q=", mod.feed_url("코스피"))


if __name__ == "__main__":
    unittest.main()

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

    def test_balanced_stock_coverage(self):
        articles = []
        for topic in ["테슬라", "NAVER", "LG전자"]:
            for i in range(5):
                articles.append({"id": f"{topic}-{i}", "topic": topic,
                    "topics": [topic], "published_at": f"2026-10-22T0{5-i}:00:00+00:00",
                    "title": f"{topic} {i}", "publisher": "테스트", "url": f"https://example.com/{topic}/{i}"})
        selected = mod.balanced_articles(articles, ["테슬라", "NAVER", "LG전자"], 6)
        self.assertEqual(len(selected), 6)
        for topic in ["테슬라", "NAVER", "LG전자"]:
            self.assertGreaterEqual(sum(topic in item["topics"] for item in selected), 2)

    def test_observed_days_only_once_per_day(self):
        item = {"id": "fixed", "title": "원문 1", "publisher": "검증"}
        first = mod.update_history({}, [item], "2026-10-22")
        again = mod.update_history(first, [item], "2026-10-22")
        self.assertEqual(again, first)
        later = mod.update_history(again, [item], "2026-10-23")
        viewed = mod.decorate_observations([item], later)[0]
        self.assertEqual(viewed["observed_days"], 2)
        self.assertEqual(viewed["first_observed"], "2026-10-22")
        self.assertEqual(viewed["last_observed"], "2026-10-23")
        self.assertEqual(viewed["title_variants"], 1)

    def test_changed_title_same_link_not_verified_as_repost(self):
        first = mod.update_history({}, [{"id": "fixed", "title": "실적 발표"}], "2026-10-22")
        changed = mod.update_history(first, [{"id": "fixed", "title": "실적발표"}], "2026-10-23")
        self.assertEqual(mod.decorate_observations([{"id": "fixed"}], changed)[0]["title_variants"], 2)
        self.assertEqual(len(changed["records"]["fixed"]["titles"]), 2)

    def test_prunes_observations_beyond_30_days(self):
        first = mod.update_history({}, [{"id": "old", "title": "과거 기사"}], "2026-09-01")
        later = mod.update_history(first, [{"id": "new", "title": "최근 기사"}], "2026-10-22")
        self.assertNotIn("old", later["records"])
        self.assertIn("new", later["records"])

    def test_discard_unrelated_naver_blog_and_social_articles(self):
        self.assertFalse(mod.market_relevant("어린이 가족체험 행사 : 네이버 블로그","Naver Blog"))
        self.assertFalse(mod.market_relevant("[시승기] 현대차 SUV 체험기","뉴스"))
        self.assertFalse(mod.market_relevant("명신산업 대상 아닌 일반 행사","Naver Blog"))

    def test_reject_blog_at_ingestion_even_if_search_topic_is_naver(self):
        text=rss(title="교육도서관 북 페스티벌 : 네이버 블로그")
        self.assertEqual(mod.parse_rss(text,"NAVER",NOW),[])

    def test_keep_material_company_news(self):
        for title in ["SK하이닉스 솔리다임 IPO 철회",
                      "명신산업 테슬라 납품 계약 체결",
                      "삼성전자 실적 개선",
                      "엔비디아 반도체 투자 확대"]:
            self.assertTrue(mod.market_relevant(title,"연합뉴스"),title)

    def test_keep_market_macro_but_not_small_cap_listing_spikes(self):
        self.assertTrue(mod.market_relevant("원/달러 환율 급등","연합뉴스"))
        self.assertTrue(mod.market_relevant("코스피 외국인 매도 속 반등 마감","연합뉴스"))
        self.assertFalse(mod.market_relevant("[특징주] 디티에스 코스닥 상장 첫날 35% 강세 마감","연합뉴스"))

    def test_rss_search_topic_does_not_count_as_stock_ticker_match(self):
        self.assertFalse(mod.market_relevant("삼성전자와 무관한 초등학생 캠프","Naver Blog"))
        self.assertTrue(mod.market_relevant("SK하이닉스 솔리다임 IPO 철회","연합뉴스"))

    def test_rss_only_public_https(self):
        self.assertTrue(mod.feed_url("코스피").startswith("https://news.google.com/rss/search?"))
        self.assertIn("q=", mod.feed_url("코스피"))


if __name__ == "__main__":
    unittest.main()

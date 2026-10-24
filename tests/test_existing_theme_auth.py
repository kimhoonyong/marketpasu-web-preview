"""Offline-only tests. All simulated credentials are intentionally fake."""
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout,redirect_stderr
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]/"integrations"/"kiwoom"
sys.path.insert(0,str(ROOT))
from existing_rest_auth import (ExistingRestAuth,extract_auth,open_existing_theme_credentials)
import marketpasu_local_chart_server as chart


class ExistingThemeAuthTests(unittest.TestCase):
    def make_theme(self,source):
        tmp=tempfile.TemporaryDirectory()
        root=Path(tmp.name)
        (root/"data").mkdir()
        vault=root/"data"/"kiwoom_rest_credentials.bin"
        vault.write_bytes(b"ENCRYPTED_TEST_FIXTURE_NOT_REAL")
        (root/"secure_credentials.py").write_text(source,encoding="utf-8")
        self.addCleanup(tmp.cleanup)
        return root,vault

    def test_local_load_function_reuses_existing_module_without_file_rewrite(self):
        root,vault=self.make_theme("""
def load_credentials(path):
    from pathlib import Path
    if Path(path).read_bytes()!=b'ENCRYPTED_TEST_FIXTURE_NOT_REAL':
        raise ValueError('local credential unreadable')
    return {'app_key':'FAKE_ONLY_APP_KEY','app_secret':'FAKE_ONLY_APP_SECRET'}
""")
        out=io.StringIO()
        with redirect_stdout(out),redirect_stderr(out):
            credentials,state=open_existing_theme_credentials(root)
        self.assertEqual(state,"SCOUT_CREDENTIALS_READY")
        self.assertEqual(credentials["KIWOOM_APP_KEY"],"FAKE_ONLY_APP_KEY")
        self.assertEqual(vault.read_bytes(),b"ENCRYPTED_TEST_FIXTURE_NOT_REAL")
        self.assertNotIn("FAKE_ONLY",out.getvalue())

    def test_decrypted_value_never_reaches_health_status(self):
        root,_=self.make_theme("""
def load_credentials(path):
    return {'rest': {'appkey':'FAKE_ONLY','secretkey':'NEVER_DISCLOSE_ME'}}
""")
        resolver=ExistingRestAuth(theme_root=root,env={})
        provider=chart.ChartProvider(auth=resolver)
        self.assertTrue(provider.auth_info()["authConfigured"])
        self.assertEqual(provider.auth_info()["authStatus"],"SCOUT_CREDENTIALS_READY")
        self.assertNotIn("NEVER_DISCLOSE_ME",str(provider.auth_info()))
        self.assertNotIn("FAKE_ONLY",str(provider.auth_info()))

    def test_known_nesting_preferred_and_wrong_schemas_not_used(self):
        self.assertEqual(extract_auth({"real":{"app_key":"fake","api_secret":"fake2"}}),
                         {"KIWOOM_APP_KEY":"fake","KIWOOM_APP_SECRET":"fake2"})
        self.assertIsNone(extract_auth({"account_no":"123","password":"123","broker":"foo"}))
        self.assertIsNone(extract_auth({"unrelated":{"app_key":"danger","app_secret":"danger"}}))

    def test_existing_module_not_found_and_vault_not_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            self.assertEqual(open_existing_theme_credentials(root)[1],"EXISTING_MODULE_NOT_FOUND")
            (root/"secure_credentials.py").write_text("def load_credentials(path): return {}",encoding="utf-8")
            self.assertEqual(open_existing_theme_credentials(root)[1],"EXISTING_VAULT_NOT_FOUND")

    def test_invalid_or_unknown_format_fails_closed(self):
        root,_=self.make_theme("def load_credentials(path): return {'account':'FAKE_ONLY'}")
        resolver=ExistingRestAuth(theme_root=root,env={})
        self.assertFalse(resolver.ready())
        self.assertEqual(resolver.status(),"EXISTING_AUTH_FORMAT_UNSUPPORTED")

    def test_failures_do_not_print_exception_with_secret(self):
        root,_=self.make_theme("""
def load_credentials(path):
    raise RuntimeError('FAKE_SECRET_IN_EXCEPTION_NOT_FOR_OUTPUT')
""")
        output=io.StringIO()
        with redirect_stdout(output),redirect_stderr(output):
            result,state=open_existing_theme_credentials(root)
        self.assertIsNone(result)
        self.assertEqual(state,"EXISTING_AUTH_LOAD_FAILED")
        self.assertNotIn("FAKE_SECRET_IN_EXCEPTION_NOT_FOR_OUTPUT",output.getvalue())
        self.assertNotIn("FAKE_SECRET_IN_EXCEPTION_NOT_FOR_OUTPUT",state)

    def test_existing_env_auth_precedes_legacy_file_without_importing_it(self):
        root,vault=self.make_theme("raise AssertionError('SHOULD_NOT_EXECUTE')")
        resolver=ExistingRestAuth(theme_root=root,env={
            "KIWOOM_APP_KEY":"FAKE_APP_KEY","KIWOOM_APP_SECRET":"FAKE_APP_SECRET"
        })
        self.assertEqual(resolver.status(),"ENVIRONMENT_READY")
        self.assertEqual(resolver.credentials()["KIWOOM_APP_KEY"],"FAKE_APP_KEY")

    def test_access_token_cached_in_memory_and_not_in_http_health(self):
        root,_=self.make_theme("def load_credentials(path): return {'app_key':'A','app_secret':'B'}")
        now=[100.0]
        provider=chart.ChartProvider(clock=lambda:now[0],auth=ExistingRestAuth(theme_root=root,env={}))
        with patch.object(chart,"get_access_token",return_value="FAKE_TOKEN_PRIVATE") as token_f:
            self.assertEqual(provider._token(),"FAKE_TOKEN_PRIVATE")
            self.assertEqual(provider._token(),"FAKE_TOKEN_PRIVATE")
            self.assertEqual(token_f.call_count,1)
            now[0]+=13*3600
            self.assertEqual(provider._token(),"FAKE_TOKEN_PRIVATE")
            self.assertEqual(token_f.call_count,2)
        self.assertNotIn("FAKE_TOKEN_PRIVATE",str(provider.auth_info()))

    def test_without_credential_do_not_call_live_rest_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            resolver=ExistingRestAuth(theme_root=tmp,env={})
            provider=chart.ChartProvider(auth=resolver)
            with patch.object(chart,"get_access_token") as requester:
                with self.assertRaises(chart.MarketDataError):
                    provider._token()
                requester.assert_not_called()

    def test_missing_module_retry_succeeds_after_theme_is_restored(self):
        now=[0.0]
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            resolver=ExistingRestAuth(theme_root=root,env={},
                                       clock=lambda:now[0],retry_seconds=15)
            self.assertFalse(resolver.ready())
            self.assertEqual(resolver.status(),"EXISTING_MODULE_NOT_FOUND")
            (root/"data").mkdir()
            (root/"data"/"kiwoom_rest_credentials.bin").write_bytes(b"ENCRYPTED_TEST_FIXTURE_NOT_REAL")
            (root/"secure_credentials.py").write_text(
                "def load_credentials(path): return {'app_key':'FAKE_APP','app_secret':'FAKE_SECRET'}",
                encoding="utf-8")
            # Do not attempt potentially expensive repeated imports every page refresh.
            now[0]=10.0
            self.assertFalse(resolver.ready())
            now[0]=16.0
            self.assertTrue(resolver.ready())
            self.assertEqual(resolver.status(),"SCOUT_CREDENTIALS_READY")
            self.assertEqual(resolver.credentials()["KIWOOM_APP_KEY"],"FAKE_APP")

    def test_failed_loader_retry_does_not_expose_exception_or_credentials(self):
        now=[0.0]
        root,_=self.make_theme(
            "def load_credentials(path): raise RuntimeError('SENSITIVE_VALUE_MUST_NOT_PRINT')")
        resolver=ExistingRestAuth(theme_root=root,env={},clock=lambda:now[0])
        output=io.StringIO()
        with redirect_stdout(output),redirect_stderr(output):
            self.assertFalse(resolver.ready())
            self.assertEqual(resolver.status(),"EXISTING_AUTH_LOAD_FAILED")
            now[0]=30.0
            self.assertFalse(resolver.ready())
        self.assertNotIn("SENSITIVE_VALUE_MUST_NOT_PRINT",output.getvalue())

    def test_existing_module_is_loaded_once_per_session(self):
        root,_=self.make_theme("def load_credentials(path): return {'app_key':'A','app_secret':'B'}")
        resolver=ExistingRestAuth(theme_root=root,env={})
        self.assertEqual(resolver.status(),"SCOUT_CREDENTIALS_READY")
        self.assertEqual(resolver.status(),"SCOUT_CREDENTIALS_READY")
        self.assertTrue(resolver.ready())

if __name__=="__main__":
    unittest.main()

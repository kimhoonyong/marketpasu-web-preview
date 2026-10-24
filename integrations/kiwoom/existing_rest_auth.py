"""Reuse the user's existing ThemeManager REST credentials strictly in local memory.

This code is deliberately *not* a decryptor, key extractor, or credential
exporter. It calls the existing user's own load_credentials(path) function.
Only the original module handles its encryption/DPAPI implementation.
The returned sensitive values never leave the localhost Python process.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
import threading

KNOWN_MODULE="secure_credentials.py"
KNOWN_VAULT=Path("data")/"kiwoom_rest_credentials.bin"
SAFE_FIELDS={
    "appkey":("kiwoom_app_key","kiwoom_rest_app_key","rest_appkey",
              "app_key","appkey","api_key"),
    "secretkey":("kiwoom_app_secret","kiwoom_rest_app_secret","rest_secret",
                 "app_secret","appsecret","secret_key","secretkey","api_secret"),
    "token":("kiwoom_access_token","access_token","accesstoken","token"),
}
NESTED_KEYS=("real","production","prod","live","kiwoom","kiwoom_rest",
             "rest","credentials","api","auth")
SAFE_STATUSES={
    "NOT_CHECKED","ENVIRONMENT_READY","SCOUT_CREDENTIALS_READY",
    "EXISTING_MODULE_NOT_FOUND","EXISTING_VAULT_NOT_FOUND",
    "EXISTING_AUTH_LOAD_FAILED","EXISTING_AUTH_FORMAT_UNSUPPORTED"
}


def _key(k):
    return str(k).replace("-","").replace("_","").strip().casefold()


def extract_auth(payload):
    """Find recognized REST App Key/Secret pairs; do not expose other fields."""
    if not isinstance(payload,dict):
        return None
    normalized={_key(k):v for k,v in payload.items() if isinstance(k,str)}
    def read(field):
        for key in SAFE_FIELDS[field]:
            value=normalized.get(_key(key))
            if isinstance(value,str) and value.strip():
                return value.strip()
        return None
    appkey=read("appkey")
    secretkey=read("secretkey")
    token=read("token")
    if appkey and secretkey:
        return {"KIWOOM_APP_KEY":appkey,"KIWOOM_APP_SECRET":secretkey}
    if token:
        return {"KIWOOM_ACCESS_TOKEN":token}
    # Avoid searching unknown keys which might belong to other brokers/accounts.
    for key in NESTED_KEYS:
        child=normalized.get(_key(key))
        if isinstance(child,dict):
            extracted=extract_auth_shallow(child)
            if extracted:
                return extracted
    return None


def extract_auth_shallow(payload):
    if not isinstance(payload,dict):
        return None
    normalized={_key(k):v for k,v in payload.items() if isinstance(k,str)}
    def lookup(names):
        for key in names:
            value=normalized.get(_key(key))
            if isinstance(value,str) and value.strip():
                return value.strip()
        return None
    appkey=lookup(SAFE_FIELDS["appkey"])
    secret=lookup(SAFE_FIELDS["secretkey"])
    if appkey and secret:
        return {"KIWOOM_APP_KEY":appkey,"KIWOOM_APP_SECRET":secret}
    token=lookup(SAFE_FIELDS["token"])
    return {"KIWOOM_ACCESS_TOKEN":token} if token else None


def open_existing_theme_credentials(theme_root):
    """Call exactly the previously discovered function; no file rewrite."""
    root=Path(theme_root)
    module_path=root/KNOWN_MODULE
    vault=root/KNOWN_VAULT
    if not module_path.is_file():
        return None,"EXISTING_MODULE_NOT_FOUND"
    if not vault.is_file():
        return None,"EXISTING_VAULT_NOT_FOUND"
    try:
        module_name="_marketpasu_existing_theme_credential_loader"
        spec=importlib.util.spec_from_file_location(module_name,str(module_path))
        if spec is None or spec.loader is None:
            return None,"EXISTING_AUTH_LOAD_FAILED"
        module=importlib.util.module_from_spec(spec)
        # Scoped import path for existing module's own local dependencies.
        sys.path.insert(0,str(root))
        try:
            spec.loader.exec_module(module)
            loader=getattr(module,"load_credentials",None)
            if not callable(loader):
                return None,"EXISTING_AUTH_LOAD_FAILED"
            # A local Path is the only argument. The existing module performs
            # the decryption, under the same Windows account as ThemeManager.
            payload=loader(vault)
        finally:
            if sys.path and sys.path[0]==str(root):
                sys.path.pop(0)
        extracted=extract_auth(payload)
        if extracted is None:
            return None,"EXISTING_AUTH_FORMAT_UNSUPPORTED"
        return extracted,"SCOUT_CREDENTIALS_READY"
    except BaseException:
        # Some existing modules can include sensitive data in exceptions;
        # never propagate or log those messages or tracebacks.
        return None,"EXISTING_AUTH_LOAD_FAILED"


class ExistingRestAuth:
    """Lazy, one-time local credential loading, without disk/console export."""
    def __init__(self,theme_root=None,env=None):
        self.root=Path(theme_root) if theme_root is not None else Path(
            os.environ.get("MARKETPASU_THEME_ROOT","D:/ThemeManager"))
        self.env=env if env is not None else os.environ
        self._lock=threading.Lock()
        self._credentials=None
        self._state="NOT_CHECKED"

    def credentials(self):
        with self._lock:
            if self._state!="NOT_CHECKED":
                return self._credentials
            token=self.env.get("KIWOOM_ACCESS_TOKEN","")
            key=self.env.get("KIWOOM_APP_KEY","")
            secret=self.env.get("KIWOOM_APP_SECRET","")
            if isinstance(key,str) and key.strip() and isinstance(secret,str) and secret.strip():
                self._credentials={"KIWOOM_APP_KEY":key.strip(),"KIWOOM_APP_SECRET":secret.strip()}
                self._state="ENVIRONMENT_READY"
            elif isinstance(token,str) and token.strip():
                self._credentials={"KIWOOM_ACCESS_TOKEN":token.strip()}
                self._state="ENVIRONMENT_READY"
            else:
                self._credentials,self._state=open_existing_theme_credentials(self.root)
            return self._credentials

    def status(self):
        self.credentials()
        return self._state

    def ready(self):
        return self.credentials() is not None

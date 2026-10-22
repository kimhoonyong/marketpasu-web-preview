#!/usr/bin/env python3
"""Read-only Windows Kiwoom Scout/ThemeManager preflight (no credential access).

Checks for *existence* of prior install roots/modules/vaults. Never opens,
decrypts, lists values from, or copies any sensitive authentication file.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import sys

SCOUT_MODULES=("app/rest_api.py","app/rest_auth.py","app/kiwoom_rest.py",
               "rest_api.py","rest_auth.py","secure_credentials.py",
               "rest_autostore.py")
SCOUT_LAUNCHERS=("run_kiwoom_rest_collector.bat","run_REST_Collector.bat",
                 "RUN_THEMEMANAGER.bat","run_theme_manager.bat",
                 "run_kiwoom_v15_both.cmd")
CREDENTIAL_LOCATIONS=("data/kiwoom_rest_credentials.bin",
                      "rest_credentials.dat","config/rest_credentials.dat")


def candidate_roots(env: dict[str,str]) -> list[Path]:
    base=Path(env.get("LOCALAPPDATA") or env.get("USERPROFILE") or str(Path.home()))
    home=Path(env.get("USERPROFILE") or str(Path.home()))
    candidates=[base/"KiwoomScoutLite",base/"MarketPasu",
                base/"ThemeManager",home/"Documents"/"ThemeManager",
                Path("D:/Kiwoom_Scout_Lite_V2.9.48"),Path("D:/KiwoomScoutLite"),
                Path("D:/ThemeManager"),Path("D:/OpenAPI"),
                Path("E:/김훈용 폴더/ThemeManager")]
    for name in ("KIWOOM_SCOUT_ROOT","KIWOOM_THEME_ROOT","KIWOOM_EXISTING_ROOT"):
        if env.get(name):candidates.insert(0,Path(env[name]))
    # Never recursively scan the home directory or enumerate secure data.
    seen=set()
    output=[]
    for p in candidates:
        norm=os.path.normcase(os.path.abspath(p))
        if norm not in seen:
            output.append(p)
            seen.add(norm)
    return output


def report_environment(*, env: dict[str,str]|None=None,
                       roots: list[Path]|None=None, os_name: str|None=None) -> dict:
    env=os.environ if env is None else env
    os_name=platform.system() if os_name is None else os_name
    roots=candidate_roots(env) if roots is None else roots
    locations=[]
    for root in roots[:20]:
        # "exists()" and "is_file()" inspect metadata, never contents.
        present_modules=[name for name in SCOUT_MODULES if (root/name).is_file()]
        present_launchers=[name for name in SCOUT_LAUNCHERS if (root/name).is_file()]
        present_vaults=[name for name in CREDENTIAL_LOCATIONS if (root/name).is_file()]
        if present_modules or present_launchers or present_vaults:
            locations.append({"root":str(root),"modules":present_modules,
                              "launchers":present_launchers,
                              "credential_file_names":present_vaults})
    env_ready=bool(env.get("KIWOOM_ACCESS_TOKEN")) or (
        bool(env.get("KIWOOM_APP_KEY")) and bool(env.get("KIWOOM_APP_SECRET")))
    return {
        "status":"PREFLIGHT_ONLY_NOT_LIVE_AUTHENTICATION",
        "windows":os_name=="Windows",
        "python_version":sys.version_info.major,
        "existing_kiwoom_roots":locations,
        "local_environment_auth_available":env_ready,
        "local_environment_auth_values_disclosed":False,
        "credential_files_read":0,
        "requests_sent":0,
        "notes":[
            "확인된 것은 파일·모듈 존재 여부일 뿐입니다. 로그인이 성공했다는 뜻이 아닙니다.",
            "기존 인증파일은 복호화하거나 출력하지 않았습니다.",
            "기존 Scout REST 인증 모듈의 공개 함수와 실행 상태 확인 후 토큰 재사용 연결이 필요합니다.",
        ],
    }


def main(argv=None) -> int:
    p=argparse.ArgumentParser(description="마켓파수 기존 키움 REST 설치환경 안전 진단")
    p.add_argument("--report",help="선택: 이 PC에만 진단 JSON 저장 (인증 내용 없음)")
    args=p.parse_args(argv)
    info=report_environment()
    if args.report:
        target=Path(args.report).expanduser()
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps(info,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    # Safe summary only; no environment dump or secret values.
    print("KIWOOM_PREFLIGHT:",info["status"])
    print("WINDOWS:", "YES" if info["windows"] else "NO")
    print("EXISTING_INSTALL_ROOTS:",len(info["existing_kiwoom_roots"]))
    for r in info["existing_kiwoom_roots"]:
        print("ROOT:",r["root"])
        print("  MODULES:",", ".join(r["modules"]) or "(none)")
        print("  LAUNCHERS:",", ".join(r["launchers"]) or "(none)")
        print("  CREDENTIAL_FILE_NAMES:",", ".join(r["credential_file_names"]) or "(none)")
    print("LOCAL_AUTH_ENV:", "AVAILABLE" if info["local_environment_auth_available"] else "NOT_SET")
    print("CREDENTIAL_FILE_CONTENTS_READ: 0")
    print("LIVE_API_REQUESTS: 0")
    return 0


if __name__=="__main__":
    raise SystemExit(main())

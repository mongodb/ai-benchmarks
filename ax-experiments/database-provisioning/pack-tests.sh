#!/usr/bin/env bash
# Pack tests/*.sh into database-provisioning.yaml script blocks.
# ax requires inline test scripts; tests/*.sh are the editable source of truth.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YAML="$ROOT/database-provisioning.yaml"
TESTS_DIR="$ROOT/tests"
MODE="${1:-pack}"

case "$MODE" in
  pack|--check) ;;
  *)
    echo "usage: $0 [--check]" >&2
    exit 2
    ;;
esac

python3 - "$YAML" "$TESTS_DIR" "$MODE" <<'PY'
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile

yaml_path = Path(sys.argv[1])
tests_dir = Path(sys.argv[2])
mode = sys.argv[3]
test_names = ("uri-reported",)

if not yaml_path.is_file():
    raise SystemExit(f"missing {yaml_path}")

lib_path = tests_dir / "lib.sh"
if not lib_path.is_file():
    raise SystemExit(f"missing {lib_path}")

lib_body = lib_path.read_text().rstrip()
rendered = yaml_path.read_text()

for name in test_names:
    script_path = tests_dir / f"{name}.sh"
    if not script_path.is_file():
        raise SystemExit(f"missing {script_path}")

    lines = []
    for line in script_path.read_text().splitlines():
        if line.startswith("#!"):
            continue
        if line == "# pack:inline-lib":
            continue
        if line == "set -euo pipefail":
            continue
        if line.startswith("source ") and "lib.sh" in line:
            continue
        lines.append(line)

    script_body = "\n".join(lines).strip()
    expanded = f"set -euo pipefail\n\n{lib_body}\n\n{script_body}\n"
    indented = "".join(f"      {line}\n" for line in expanded.splitlines())
    begin = f"# BEGIN PACKED:{name}"
    end = f"# END PACKED:{name}"

    begin_at = rendered.find(begin)
    end_at = rendered.find(end)
    if begin_at < 0 or end_at < 0 or end_at <= begin_at:
        raise SystemExit(f"missing or invalid pack markers for {name}")

    body_start = rendered.find("\n", begin_at) + 1
    rendered = rendered[:body_start] + indented + rendered[end_at:]

current = yaml_path.read_text()
if mode == "--check":
    if rendered != current:
        print(
            f"{yaml_path} is stale; run {yaml_path.parent / 'pack-tests.sh'}",
            file=sys.stderr,
        )
        raise SystemExit(1)
    print(f"packed tests are current: {yaml_path}")
    raise SystemExit(0)

original_mode = yaml_path.stat().st_mode & 0o777
with tempfile.NamedTemporaryFile(
    mode="w",
    dir=yaml_path.parent,
    prefix=f".{yaml_path.name}.",
    delete=False,
) as tmp:
    tmp.write(rendered)
    tmp_path = Path(tmp.name)

os.chmod(tmp_path, original_mode)
os.replace(tmp_path, yaml_path)

for name in test_names:
    print(f"packed {name} <- tests/{name}.sh")
print(f"done: {yaml_path}")
print(f"next: ax experiment validate {yaml_path}")
PY

# AX Experiments

This directory holds [AX](https://docs.514.ax) (Fiveonefour) experiments that
measure coding-agent product performance.

Each subdirectory is one experiment including:
- YAML that AX runs
- packed tests
- analysis notebooks

## Layout

Typical experiment folder:

| Path | Role |
| --- | --- |
| `<name>.yaml` | Runtime spec AX consumes (`schema_version: 2`) |
| `tests/*.sh` | Editable test sources. Do not stage these into the agent workspace |
| `pack-tests.sh` | Inlines `tests/*.sh` into the YAML `script:` blocks |
| `analysis/` | Notebooks over AX query output |
| `.axp/` | Local run artifacts. Gitignored. May contain credentials |

AX requires inline test scripts. After changing a test, pack then validate:

```bash
cd ax-experiments/<experiment>
./pack-tests.sh
./pack-tests.sh --check
./tests/run-tests.sh          # if the experiment has local unit tests
ax experiment validate <name>.yaml
ax experiment variants <name>.yaml
```

Do not put scorer protocols, proof files, or implementation hints in prompts.
Tests run in a separate sandbox from the agent.

## AX CLI

### Install

Install if needed (`ax --version` should work):

```bash
curl -fsSL https://dl.514.ax/install.sh | bash -s -- ax
# or: brew install 514-labs/tap/ax
```

### Learn

`ax learn` is the source of truth for workflows (`ax learn quickstart`,
`ax learn experiment-design`, `ax learn author-experiment`,
`ax learn analyze-results`). Do not invent flags. Prefer `ax <cmd> --help`.

Docs: https://docs.514.ax

### Auth and where runs execute

- Cloud runs need `ax auth status` to succeed.
- `--local` runs in Docker on the host. Default local still uses managed model
  access (sign-in or `AX_API_KEY`). Pass `--local-model-keys` only when using
  host provider keys.
- There is no `--parallel`. Local concurrency is `--jobs N`.

### Author, validate, run

```bash
ax experiment create <name>                 # scaffold YAML
ax experiment validate <name>.yaml
ax experiment variants <name>.yaml          # resolve matrix before scaling
ax experiment push <name>.yaml              # register without running

# Cloud (default)
ax experiment run <name>.yaml --repeat 1 --variant '<id>'

# Local
ax experiment run <name>.yaml --local --watch --repeat 1 --variant '<id>'
```

Narrow the matrix with `--variant`, `--prompt`, `--agent`, `--model`,
`--product`, or `--environment`. Use `--mock` for a deterministic no-spend
driver.

### Inspect and analyze

```bash
ax run list --experiment <name>
ax run view <run-id>
ax run query <run-id>                       # SQL against one composite run
ax experiment query <experiment-id>
ax experiment query <experiment-id> --group-by agent --metric test-pass-rate,cost
```

Debug failed or incomplete runs with `ax run view` / `ax run query` before
drawing product conclusions. Analyze only after enough completed trials across
variants. Local → Cloud later: `ax run upload <run-id>`. Sanitize `.axp/` first.

### Lifecycle

```bash
ax run watch <run-id>
ax run cancel <run-id>
ax run rerun <run-id>                       # failed/canceled variants
ax run rerun --tests --experiment <name>.yaml
```

Retest ids are not always interchangeable with run-request ids. If a command
rejects an id, list with `ax run list` and use the composite id it prints.
`ax run cancel` applies to agent run requests.

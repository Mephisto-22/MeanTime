#!/bin/sh
# From repository root: docker compose run --rm --no-deps --entrypoint sh backend advancement/schemathesis/run.sh
# PILOT_MODE=contract (default) runs full checks; robustness checks server errors only.
set -u
cd /app
uv pip install -r advancement/schemathesis/requirements.txt || exit $?
mkdir -p advancement/schemathesis/results
export PYTHONPATH=/app
export HYPOTHESIS_STORAGE_DIRECTORY=/tmp/meantime-hypothesis
mode=${PILOT_MODE:-contract}
uv pip freeze > "advancement/schemathesis/results/$mode-environment.txt"
python -m pytest advancement/schemathesis/test_pilot.py "$@" \
  --hypothesis-seed=5323 -v --tb=short \
  --junitxml="advancement/schemathesis/results/$mode.xml" \
  > "advancement/schemathesis/results/$mode.txt" 2>&1
result=$?
cat "advancement/schemathesis/results/$mode.txt"
exit "$result"

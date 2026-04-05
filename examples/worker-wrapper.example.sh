#!/usr/bin/env sh
# Example UMBRELLA_WORKER_WRAPPER — receives the subagent job JSON path as $1.
# Copy, chmod +x, set UMBRELLA_WORKER_WRAPPER=/absolute/path/to/this/script
# when using UMBRELLA_SUBAGENT_USE_PROCESS=1.
set -e
JOB="${1:?missing job json path}"
echo "worker-wrapper: would process $JOB" >&2
# Example: run the default Node worker shipped with Umbrella:
# exec node /path/to/Umbrella/dist/modules/agent-runtime/worker/subagent-worker-cli.js "$JOB"
exit 0

#!/usr/bin/env bash
set -eu
if [[ ! "${KEY:-}" =~ [^[:space:]] ]]; then
  echo 'run=false' >> "$GITHUB_OUTPUT"
  echo '::error::Daily agent blocked: ANTHROPIC_API_KEY is not configured. No courses or improvements were generated.'
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' '## Daily agent blocked' 'ANTHROPIC_API_KEY is missing. Installation, agent execution, build and publishing did not run. An owner must decide whether to activate this automation; no credentials were created or changed.' >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 1
fi
echo 'run=true' >> "$GITHUB_OUTPUT"

#!/usr/bin/env python3
"""PreToolUse(Bash) guard: block catastrophic, rarely-legitimate git commands.
Active only when MOONSHOT_GUARD=1 so it is inert in unrelated sessions.
Ported/trimmed from zeroshot cluster-hooks/block-dangerous-git.py."""
import json
import os
import re
import sys

DANGEROUS = [
    (r"\bgit\s+reset\s+--hard\b", 'use "git restore <file>" or a WIP commit instead of "reset --hard"'),
    (r"\bgit\s+push\b.*(--force\b|-f\b)", "force-push is blocked; push normally or open a fresh branch"),
    (r"\bgit\s+clean\s+-[a-zA-Z]*f", '"git clean -f" deletes untracked files; remove them explicitly'),
    (r"\bgit\s+checkout\s+(--\s+\.|-f\b|\.\s*$)", 'use "git restore <file>" instead of destructive checkout'),
    (r"\bgit\s+branch\s+-D\b", 'use "git branch -d" (safe delete) instead of "-D"'),
    (r"\bgit\s+stash\b", "stashing hides work; use a WIP commit instead"),
]


def main():
    if os.environ.get("MOONSHOT_GUARD") != "1":
        sys.exit(0)
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    if payload.get("tool_name") != "Bash":
        sys.exit(0)
    command = (payload.get("tool_input") or {}).get("command", "")
    for pattern, reason in DANGEROUS:
        if re.search(pattern, command):
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": f"BLOCKED: {reason}",
                }
            }))
            sys.exit(0)
    sys.exit(0)


if __name__ == "__main__":
    main()

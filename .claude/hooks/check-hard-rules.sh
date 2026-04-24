#!/bin/bash
# PreToolUse hook: enforces a subset of CLAUDE.md §1 hard rules (§1.1, §1.3,
# §1.4, §1.7, §1.8). Reads tool-use JSON on stdin. Exits 2 with reasons on
# stderr to block Edit/MultiEdit/Write. Scope: files under src/ and
# supabase/migrations/ (relative or absolute paths). Other paths pass through.
#
# Not enforced here: §1.2 (error handling pattern), §1.5 (DB safety), §1.6
# (auth gates), §1.9 (content safety). Those need semantic review, not grep.

set -euo pipefail

input="$(cat)"

tool_name="$(printf '%s' "$input" | jq -r '.tool_name // empty')"
file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"

case "$tool_name" in
  Write)
    content="$(printf '%s' "$input" | jq -r '.tool_input.content // empty')"
    ;;
  Edit)
    content="$(printf '%s' "$input" | jq -r '.tool_input.new_string // empty')"
    ;;
  MultiEdit)
    # Concat every edit's new_string with newlines so we can grep them as one.
    content="$(printf '%s' "$input" | jq -r '.tool_input.edits[]?.new_string // empty')"
    ;;
  *)
    exit 0
    ;;
esac

# Match both absolute paths (Claude Code's default) and bare-relative paths.
case "$file_path" in
  */src/*|src/*|*/supabase/migrations/*|supabase/migrations/*) ;;
  *) exit 0 ;;
esac

violations=()

# §1.1 Browser compatibility — ES2023+ array methods crash Safari <16
if printf '%s' "$content" | grep -qE '\.(toSorted|toReversed|toSpliced)\('; then
  violations+=("§1.1 ES2023+ array method (.toSorted/.toReversed/.toSpliced) — crashes Safari <16. Use slice().sort() etc.")
fi
if printf '%s' "$content" | grep -qE '\.at\(\s*-?[0-9]'; then
  violations+=("§1.1 Array.at() — use arr[arr.length - 1] for the last element.")
fi

# §1.7 Logging — use src/utils/logger.js
case "$file_path" in
  *src/utils/logger.js) ;;
  *)
    if printf '%s' "$content" | grep -qE 'console\.(log|error|warn|info|debug)\('; then
      violations+=("§1.7 Direct console.* call — use logger from src/utils/logger.js. logger.error/.warn always log; .info/.debug are dev-only.")
    fi
    ;;
esac

# §1.8 Storage — use src/lib/storage.js helpers
case "$file_path" in
  *src/lib/storage.js|*src/lib/supabase.js) ;;
  *)
    if printf '%s' "$content" | grep -qE '\blocalStorage\.'; then
      violations+=("§1.8 Direct localStorage.* call — use getStorageItem/setStorageItem/removeStorageItem from src/lib/storage.js.")
    fi
    ;;
esac

# §1.4 Data access — no direct supabase.* in components OR hooks (CLAUDE.md
# §1.4: "No direct Supabase calls from components or hooks"). Match both
# method calls (supabase.from(...)) and chained property access
# (supabase.auth.getUser(), supabase.storage.from(...), etc.).
case "$file_path" in
  *src/pages/*|*src/components/*|*src/hooks/*)
    if printf '%s' "$content" | grep -qE '\bsupabase\.(from|rpc|auth|storage|functions|channel|removeChannel|getChannels)[.(]'; then
      violations+=("§1.4 Direct supabase.* in UI/hooks — all data access must go through src/api/ modules. Use hooks (useDish, useVote, etc.) in components.")
    fi
    ;;
esac

# §1.3 Styling — no Tailwind color classes (layout/spacing only).
# Exemption: rgba overlays (any /N opacity suffix) — §1.3 explicitly permits
# these. So `bg-black/60`, `bg-neutral-900/40` are allowed; solid forms aren't.
if printf '%s' "$content" | grep -qE '\b(text|bg|border|ring|divide|from|to|via|placeholder|fill|stroke|shadow|outline|accent|decoration|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)(\b)([^/]|$)'; then
  violations+=("§1.3 Tailwind color class — use var(--color-*) CSS variables instead. Tailwind is for layout/spacing only. (rgba overlays like bg-neutral-900/60 are permitted.)")
fi
if printf '%s' "$content" | grep -qE '\b(text|bg|border)-(white|black)(\b)([^/]|$)'; then
  violations+=("§1.3 Tailwind text-white/bg-white/bg-black — use var(--color-surface-elevated), var(--color-text-primary), etc. (Opacity overlays like bg-black/5 are permitted.)")
fi

if [ ${#violations[@]} -gt 0 ]; then
  {
    echo "BLOCKED: CLAUDE.md hard-rule violation(s) in $file_path:"
    for v in "${violations[@]}"; do
      echo "  • $v"
    done
    echo ""
    echo "Fix the content and retry. If this is a false positive, ask Dan before bypassing."
  } >&2
  exit 2
fi

exit 0

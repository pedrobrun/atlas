#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

terms_file=.private-terms
if [ ! -s "$terms_file" ]; then
  echo "check-private: no $terms_file (one private term per line). Create it before committing." >&2
  exit 1
fi
if git ls-files --error-unmatch "$terms_file" >/dev/null 2>&1; then
  echo "check-private: $terms_file is tracked by git. Remove it from the index: git rm --cached $terms_file" >&2
  exit 1
fi

pattern=$(grep -vE '^\s*(#|$)' "$terms_file" | sed 's/[][\.*^$/]/\\&/g' | paste -sd'|' -)
range=${1:---all}
found=0

if git ls-files -co --exclude-standard | grep -v '^vendor/' | xargs grep -nIiE "$pattern" 2>/dev/null; then found=1; fi
if git log $range -p --format='commit %H%n%an <%ae>%n%B' -- . ':!vendor' | grep -nIiE "$pattern" | head -20 | grep .; then found=1; fi
if git for-each-ref --format='%(refname:short)' refs/heads | grep -iE "$pattern"; then found=1; fi

if [ "$found" = 1 ]; then
  echo "check-private: private terms found (above). Nothing may be pushed until they are gone from files AND history." >&2
  exit 1
fi
echo "check-private: clean"

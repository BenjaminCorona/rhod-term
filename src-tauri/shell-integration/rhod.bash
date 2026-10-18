# ==============================================================================
# Rhod Terminal - Native High-Performance Shell Integration for Bash
# ==============================================================================
export CLICOLOR=1
export FORCE_COLOR=3

if ! alias ls >/dev/null 2>&1; then
  alias ls='ls --color=auto 2>/dev/null || ls -G'
fi
if ! alias grep >/dev/null 2>&1; then
  alias grep='grep --color=auto'
fi
if ! alias diff >/dev/null 2>&1; then
  alias diff='diff --color=auto'
fi

if [[ -z "$PROMPT_COMMAND" && "$PS1" == "\\s-\\v\\\$ " ]]; then
  PS1='\[\033[36m\]\u\[\033[0m\]@\[\033[90m\]\h\[\033[0m\] \[\033[34m\]\W\[\033[0m\] \[\033[32m\]❯\[\033[0m\] '
fi

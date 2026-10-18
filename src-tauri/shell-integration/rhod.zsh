# ==============================================================================
# Rhod Terminal - Native High-Performance Shell Integration for ZSH
# ==============================================================================

# 1. Habilitar soporte de colores para utilidades del sistema
export CLICOLOR=1
export LSCOLORS="exfxcxdxbxegedabagacad"
export FORCE_COLOR=3

# Aliases con colores automáticos
if ! alias ls >/dev/null 2>&1; then
  if [[ "$OSTYPE" == darwin* ]]; then
    alias ls='ls -G'
  else
    alias ls='ls --color=auto'
  fi
fi
if ! alias grep >/dev/null 2>&1; then
  alias grep='grep --color=auto'
fi
if ! alias diff >/dev/null 2>&1; then
  alias diff='diff --color=auto'
fi

# 2. Resaltado de sintaxis en tiempo real al estilo Lenguaje de Programación
_rhod_dir="${RHOD_SHELL_DIR:-${${(%):-%x}:A:h}}"
if [[ -f "$_rhod_dir/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]]; then
  source "$_rhod_dir/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

  typeset -A ZSH_HIGHLIGHT_STYLES 2>/dev/null
  ZSH_HIGHLIGHT_STYLES[command]="fg=cyan,bold"
  ZSH_HIGHLIGHT_STYLES[builtin]="fg=cyan,bold"
  ZSH_HIGHLIGHT_STYLES[alias]="fg=cyan,bold"
  ZSH_HIGHLIGHT_STYLES[function]="fg=cyan,bold"
  ZSH_HIGHLIGHT_STYLES[unknown-token]="fg=red,bold"
  ZSH_HIGHLIGHT_STYLES[reserved-word]="fg=magenta,bold"
  ZSH_HIGHLIGHT_STYLES[single-hyphen-option]="fg=yellow"
  ZSH_HIGHLIGHT_STYLES[double-hyphen-option]="fg=yellow"
  ZSH_HIGHLIGHT_STYLES[single-quoted-argument]="fg=green"
  ZSH_HIGHLIGHT_STYLES[double-quoted-argument]="fg=green"
  ZSH_HIGHLIGHT_STYLES[dollar-quoted-argument]="fg=green"
  ZSH_HIGHLIGHT_STYLES[back-quoted-argument]="fg=green"
  ZSH_HIGHLIGHT_STYLES[path]="underline"
  ZSH_HIGHLIGHT_STYLES[path_prefix]="underline"
  ZSH_HIGHLIGHT_STYLES[globbing]="fg=blue,bold"
  ZSH_HIGHLIGHT_STYLES[command-substitution]="fg=magenta"
  ZSH_HIGHLIGHT_STYLES[commandseparator]="fg=magenta,bold"
  ZSH_HIGHLIGHT_STYLES[redirection]="fg=magenta"
fi

# 3. Prompt elegante con colores nativos si el usuario no tiene tema personalizado
if [[ "$PROMPT" == "%m%#" || "$PROMPT" == "%n@%m %1~ %# " || "$PROMPT" == "" || "$PROMPT" == "%# " ]]; then
  setopt PROMPT_SUBST
  autoload -Uz vcs_info 2>/dev/null
  zstyle ':vcs_info:*' enable git 2>/dev/null
  zstyle ':vcs_info:git:*' formats ' %F{magenta}git:(%b)%f' 2>/dev/null

  _rhod_precmd() {
    vcs_info 2>/dev/null
  }
  autoload -Uz add-zsh-hook 2>/dev/null
  if (( $+functions[add-zsh-hook] )); then
    add-zsh-hook precmd _rhod_precmd
  fi

  PROMPT='%F{cyan}%n%f@%F{242}%m%f %F{blue}%1~%f${vcs_info_msg_0_} %F{green}❯%f '
fi

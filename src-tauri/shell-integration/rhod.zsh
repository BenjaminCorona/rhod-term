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

# 3. Prompt moderno estilo Rhod con ruta completa y medición de tiempo de ejecución
setopt PROMPT_SUBST
zmodload zsh/datetime 2>/dev/null
autoload -Uz vcs_info 2>/dev/null
zstyle ':vcs_info:*' enable git 2>/dev/null
zstyle ':vcs_info:git:*' formats ' %F{244}git:(%F{213}%b%F{244})%f' 2>/dev/null

_rhod_cmd_start_time=""
_rhod_last_duration=""

_rhod_preexec() {
  _rhod_cmd_start_time=$EPOCHREALTIME
  # Notificar inicio de comando mediante OSC 133;C
  printf "\e]133;C\a"
}

_rhod_precmd() {
  if [[ -n "$_rhod_cmd_start_time" ]]; then
    local -F elapsed=$(( EPOCHREALTIME - _rhod_cmd_start_time ))
    _rhod_cmd_start_time=""
    if (( elapsed < 1 )); then
      _rhod_last_duration=$(printf "(%.3fs)" $elapsed)
    elif (( elapsed < 60 )); then
      _rhod_last_duration=$(printf "(%.2fs)" $elapsed)
    else
      local -i mins=$(( elapsed / 60 ))
      local -F secs=$(( elapsed - mins * 60 ))
      _rhod_last_duration=$(printf "(%dm %.1fs)" $mins $secs)
    fi
    # Notificar duración exacta del comando a Rhod Terminal mediante OSC 133;D
    printf "\e]133;D;%s\a" "$_rhod_last_duration"
  fi

  vcs_info 2>/dev/null
  # Notificar a Rhod el CWD actual mediante OSC 7 en tiempo real
  printf "\e]7;file://%s\a" "$PWD"
  # Notificar a Rhod mediante OSC 133;A que el shell está listo en el prompt
  printf "\e]133;A\a"
}

autoload -Uz add-zsh-hook 2>/dev/null
if (( $+functions[add-zsh-hook] )); then
  add-zsh-hook precmd _rhod_precmd
  add-zsh-hook preexec _rhod_preexec
fi

_rhod_enable_classic() {
  _RHOD_CLASSIC_MODE=1
  PROMPT='%F{244}%~%f %F{242}${_rhod_last_duration}%f${vcs_info_msg_0_} %F{119}❯%f '
  zle && zle reset-prompt 2>/dev/null
}

_rhod_enable_editor() {
  unset _RHOD_CLASSIC_MODE
  PROMPT=""
  RPROMPT=""
  zle && zle reset-prompt 2>/dev/null
}

# En modo Editor (por defecto en Rhod), no mostramos prompt en xterm para que la terminal esté 100% limpia
if [[ -n "$RHOD_TERMINAL" && -z "$_RHOD_CLASSIC_MODE" ]]; then
  PROMPT=""
  RPROMPT=""
else
  if [[ -z "$_RHOD_CUSTOM_PROMPT" ]]; then
    PROMPT='%F{244}%~%f %F{242}${_rhod_last_duration}%f${vcs_info_msg_0_} %F{119}❯%f '
  fi
fi

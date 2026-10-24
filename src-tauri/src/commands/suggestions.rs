use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GhostSuggestion {
    pub full_text: String,
    pub remaining_text: String,
    pub hint_type: String, // "habit" | "project" | "script" | "folder" | "command" | "git"
}

/// Registro individual de un comando en el historial de hábitos
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HabitEntry {
    pub command: String,
    pub cwd: String,
    pub timestamp: u64,
    pub count: u32,
}

/// Base de datos local de hábitos del usuario
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct HabitStore {
    pub entries: Vec<HabitEntry>,
}

static HABIT_STORE: Mutex<Option<HabitStore>> = Mutex::new(None);

/// Obtiene el directorio base de usuario ($HOME en Unix, %USERPROFILE% en Windows)
fn get_user_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Ruta del archivo persistente de hábitos (~/.rhod/history.json)
fn get_history_file_path() -> Option<PathBuf> {
    get_user_home().map(|h| h.join(".rhod").join("history.json"))
}

/// Timestamp actual en segundos
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Carga los hábitos desde el disco, importando el historial nativo si es la primera vez
fn load_habits_internal() -> HabitStore {
    if let Some(path) = get_history_file_path() {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(store) = serde_json::from_str::<HabitStore>(&content) {
                    return store;
                }
            }
        }
    }

    // Primera ejecución: inicializar e intentar pre-cargar comandos comunes del shell nativo
    let mut store = HabitStore::default();
    seed_from_native_shell(&mut store);
    store
}

/// Lee de forma pasiva y segura los últimos comandos de Zsh/Bash/PowerShell si existen
fn seed_from_native_shell(store: &mut HabitStore) {
    let Some(home) = get_user_home() else { return };
    let now = current_timestamp();

    // 1. Zsh (~/.zsh_history)
    let zsh_path = home.join(".zsh_history");
    if zsh_path.exists() {
        if let Ok(content) = fs::read_to_string(&zsh_path) {
            for line in content.lines().rev().take(80) {
                let cmd = if let Some((_, raw_cmd)) = line.split_once(';') {
                    raw_cmd.trim()
                } else {
                    line.trim()
                };
                if !cmd.is_empty() && !store.entries.iter().any(|e| e.command == cmd) {
                    store.entries.push(HabitEntry {
                        command: cmd.to_string(),
                        cwd: "".to_string(),
                        timestamp: now,
                        count: 1,
                    });
                }
            }
        }
    }

    // 2. Bash (~/.bash_history)
    let bash_path = home.join(".bash_history");
    if bash_path.exists() {
        if let Ok(content) = fs::read_to_string(&bash_path) {
            for line in content.lines().rev().take(80) {
                let cmd = line.trim();
                if !cmd.is_empty() && !store.entries.iter().any(|e| e.command == cmd) {
                    store.entries.push(HabitEntry {
                        command: cmd.to_string(),
                        cwd: "".to_string(),
                        timestamp: now,
                        count: 1,
                    });
                }
            }
        }
    }

    // 3. PowerShell en Windows
    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let ps_path = PathBuf::from(appdata)
                .join("Microsoft")
                .join("Windows")
                .join("PowerShell")
                .join("PSReadLine")
                .join("ConsoleHost_history.txt");
            if ps_path.exists() {
                if let Ok(content) = fs::read_to_string(&ps_path) {
                    for line in content.lines().rev().take(80) {
                        let cmd = line.trim();
                        if !cmd.is_empty() && !store.entries.iter().any(|e| e.command == cmd) {
                            store.entries.push(HabitEntry {
                                command: cmd.to_string(),
                                cwd: "".to_string(),
                                timestamp: now,
                                count: 1,
                            });
                        }
                    }
                }
            }
        }
    }
}

/// Guarda los hábitos en disco de forma atómica y segura
fn save_habits_internal(store: &HabitStore) {
    let Some(path) = get_history_file_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(store) {
        let _ = fs::write(&path, json);
    }
}

/// Comando IPC para registrar la ejecución de un comando por parte del usuario
#[tauri::command]
pub fn record_command_habit(cwd: String, command: String) {
    let trimmed = command.trim();
    if trimmed.is_empty() || trimmed.len() > 300 {
        return;
    }

    let mut lock = HABIT_STORE.lock().unwrap_or_else(|e| e.into_inner());
    let store = lock.get_or_insert_with(load_habits_internal);

    let now = current_timestamp();
    let cwd_trimmed = cwd.trim();

    if let Some(existing) = store.entries.iter_mut().find(|e| e.command == trimmed && e.cwd == cwd_trimmed) {
        existing.count = existing.count.saturating_add(1);
        existing.timestamp = now;
    } else {
        store.entries.push(HabitEntry {
            command: trimmed.to_string(),
            cwd: cwd_trimmed.to_string(),
            timestamp: now,
            count: 1,
        });
    }

    // Limitar historial a los 600 comandos más relevantes
    if store.entries.len() > 600 {
        store.entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        store.entries.truncate(500);
    }

    save_habits_internal(store);
}

/// Busca en los hábitos del usuario según el algoritmo de Frecency
fn search_habits(cwd: &Path, input: &str) -> Option<GhostSuggestion> {
    let mut lock = HABIT_STORE.lock().unwrap_or_else(|e| e.into_inner());
    let store = lock.get_or_insert_with(load_habits_internal);

    if store.entries.is_empty() {
        return None;
    }

    let now = current_timestamp();
    let cwd_str = cwd.to_string_lossy();
    let input_trimmed = input.trim_start();
    let input_lower = input_trimmed.to_lowercase();
    let input_char_count = input_trimmed.chars().count();

    let mut best_match: Option<(&HabitEntry, f64)> = None;

    for entry in &store.entries {
        let cmd = &entry.command;
        let cmd_lower = cmd.to_lowercase();

        // Si input no está vacío, debe empezar con input
        if !input_trimmed.is_empty() {
            if !cmd_lower.starts_with(&input_lower) || cmd.chars().count() <= input_char_count {
                continue;
            }
        } else {
            // En línea vacía, solo considerar hábitos ejecutados en ESTE mismo directorio
            if entry.cwd.is_empty() || entry.cwd != cwd_str {
                continue;
            }
        }

        // Puntuación de Frecency:
        let age_secs = now.saturating_sub(entry.timestamp);
        let recency_multiplier = if age_secs < 3600 {
            4.0 // Última hora
        } else if age_secs < 86400 {
            2.5 // Últimas 24 horas
        } else if age_secs < 604800 {
            1.5 // Última semana
        } else {
            1.0
        };

        let cwd_multiplier = if !entry.cwd.is_empty() && entry.cwd == cwd_str {
            3.0 // Máxima prioridad si fue usado en este mismo proyecto
        } else {
            1.0
        };

        let score = (entry.count as f64) * recency_multiplier * cwd_multiplier;

        if let Some((_, best_score)) = best_match {
            if score > best_score {
                best_match = Some((entry, score));
            }
        } else {
            best_match = Some((entry, score));
        }
    }

    if let Some((best, _)) = best_match {
        let rem = safe_skip_chars(&best.command, input_char_count);
        return Some(GhostSuggestion {
            full_text: best.command.clone(),
            remaining_text: rem,
            hint_type: "habit".into(),
        });
    }

    None
}

/// Regla declarativa de proyecto para arranque instantáneo (Cero configuración)
struct ProjectRule {
    files: &'static [&'static str],
    default_cmd: &'static str,
    hint_type: &'static str,
}

/// Catálogo universal de proyectos (Node, Go, Wails, Python/Django, PHP/Laravel, Rust, Ruby, Docker, etc.)
const UNIVERSAL_PROJECT_CATALOG: &[ProjectRule] = &[
    // Wails (Go Desktop)
    ProjectRule {
        files: &["wails.json"],
        default_cmd: "wails dev",
        hint_type: "wails",
    },
    // Go puro
    ProjectRule {
        files: &["go.mod", "main.go"],
        default_cmd: "go run .",
        hint_type: "go",
    },
    // Python - Django
    ProjectRule {
        files: &["manage.py"],
        default_cmd: "python manage.py runserver",
        hint_type: "django",
    },
    // Python - FastAPI / Flask / Scripts
    ProjectRule {
        files: &["main.py", "app.py"],
        default_cmd: "python main.py",
        hint_type: "python",
    },
    // PHP - Laravel
    ProjectRule {
        files: &["artisan"],
        default_cmd: "php artisan serve",
        hint_type: "laravel",
    },
    // PHP - Composer
    ProjectRule {
        files: &["composer.json"],
        default_cmd: "composer run dev",
        hint_type: "php",
    },
    // Rust
    ProjectRule {
        files: &["Cargo.toml"],
        default_cmd: "cargo run",
        hint_type: "rust",
    },
    // Docker Compose
    ProjectRule {
        files: &["docker-compose.yml", "docker-compose.yaml", "compose.yaml", "compose.yml"],
        default_cmd: "docker compose up",
        hint_type: "docker",
    },
    // Ruby on Rails
    ProjectRule {
        files: &["Gemfile"],
        default_cmd: "bundle exec rails s",
        hint_type: "ruby",
    },
    // Flutter / Dart
    ProjectRule {
        files: &["pubspec.yaml"],
        default_cmd: "flutter run",
        hint_type: "flutter",
    },
    // Elixir / Phoenix
    ProjectRule {
        files: &["mix.exs"],
        default_cmd: "mix phx.server",
        hint_type: "elixir",
    },
    // Java / Kotlin / Gradle
    ProjectRule {
        files: &["gradlew", "gradlew.bat", "build.gradle", "build.gradle.kts"],
        default_cmd: "./gradlew bootRun",
        hint_type: "java",
    },
    // Java / Maven
    ProjectRule {
        files: &["pom.xml"],
        default_cmd: "mvn spring-boot:run",
        hint_type: "java",
    },
    // Makefile
    ProjectRule {
        files: &["Makefile", "makefile"],
        default_cmd: "make",
        hint_type: "make",
    },
];

/// Detecta el gestor de paquetes de Node usado en el proyecto
fn detect_node_pm(cwd: &Path) -> &'static str {
    if cwd.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if cwd.join("bun.lockb").exists() || cwd.join("bun.lock").exists() {
        "bun"
    } else if cwd.join("yarn.lock").exists() {
        "yarn"
    } else {
        "npm"
    }
}

/// Extrae la lista de scripts definidos en package.json
fn read_package_scripts(cwd: &Path) -> Vec<String> {
    let pkg_path = cwd.join("package.json");
    if let Ok(content) = fs::read_to_string(&pkg_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = val.get("scripts").and_then(|s| s.as_object()) {
                return scripts.keys().cloned().collect();
            }
        }
    }
    Vec::new()
}

/// Obtiene subdirectorios de una ruta de forma segura, excluyendo carpetas ocultas y dependencias pesadas
fn get_subdirectories(dir: &Path) -> Vec<String> {
    let mut dirs = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.')
                        && name != "node_modules"
                        && name != "target"
                        && name != "dist"
                        && name != "build"
                        && name != ".git"
                    {
                        dirs.push(name);
                    }
                }
            }
        }
    }

    dirs.sort_by(|a, b| {
        let score = |s: &str| match s {
            "src" => 0,
            "src-tauri" => 1,
            "frontend" => 2,
            "backend" => 3,
            "app" => 4,
            "components" => 5,
            "pages" => 6,
            "lib" => 7,
            "public" => 8,
            "scripts" => 9,
            _ => 15,
        };
        score(a).cmp(&score(b)).then_with(|| a.to_lowercase().cmp(&b.to_lowercase()))
    });

    dirs
}

/// Helper para obtener el restante de un texto de forma 100% segura con UTF-8
fn safe_skip_chars(target: &str, char_count: usize) -> String {
    target.chars().skip(char_count).collect()
}

/// Genera la recomendación inline contextual (Ghost Text) combinando Hábitos + Catálogo Universal
#[tauri::command]
pub fn get_ghost_suggestion(
    cwd: Option<String>,
    input: String,
) -> Option<GhostSuggestion> {
    let current_dir = match &cwd {
        Some(c) if !c.trim().is_empty() => PathBuf::from(c.trim()),
        _ => std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
    };

    let trimmed = input.trim_start();
    let is_empty = trimmed.is_empty();

    // 1. PRIORIDAD MÁXIMA: Buscar en hábitos aprendidos del usuario
    if let Some(habit_suggestion) = search_habits(&current_dir, trimmed) {
        return Some(habit_suggestion);
    }

    // 2. Línea vacía: Si no hay hábitos previos, usar el Catálogo Universal de Proyectos
    if is_empty {
        // ¿Proyecto Tauri?
        let is_tauri = current_dir.join("src-tauri").exists()
            || current_dir.join("tauri.conf.json").exists()
            || current_dir.join("src-tauri/tauri.conf.json").exists();

        if is_tauri {
            let pm = detect_node_pm(&current_dir);
            let full = if pm == "npm" {
                "npm run tauri dev".to_string()
            } else {
                format!("{} tauri dev", pm)
            };
            return Some(GhostSuggestion {
                full_text: full.clone(),
                remaining_text: full,
                hint_type: "tauri".into(),
            });
        }

        // ¿Catálogo Universal de Tecnologías (Wails, Go, Django, Laravel, Rails, Docker, etc.)?
        for rule in UNIVERSAL_PROJECT_CATALOG {
            let matched = rule.files.iter().any(|f| current_dir.join(f).exists());
            if matched {
                let full = rule.default_cmd.to_string();
                return Some(GhostSuggestion {
                    full_text: full.clone(),
                    remaining_text: full,
                    hint_type: rule.hint_type.into(),
                });
            }
        }

        // ¿Proyecto Node.js con package.json?
        if current_dir.join("package.json").exists() {
            let pm = detect_node_pm(&current_dir);
            let scripts = read_package_scripts(&current_dir);

            let chosen_script = if scripts.iter().any(|s| s == "dev") {
                Some("dev")
            } else if scripts.iter().any(|s| s == "start:dev") {
                Some("start:dev")
            } else if scripts.iter().any(|s| s == "start") {
                Some("start")
            } else if scripts.iter().any(|s| s == "build") {
                Some("build")
            } else {
                None
            };

            if let Some(script) = chosen_script {
                let full = if pm == "npm" {
                    format!("npm run {}", script)
                } else {
                    format!("{} {}", pm, script)
                };
                return Some(GhostSuggestion {
                    full_text: full.clone(),
                    remaining_text: full,
                    hint_type: "script".into(),
                });
            }
        }

        // ¿Repositorio Git?
        if current_dir.join(".git").exists() {
            let full = "git status".to_string();
            return Some(GhostSuggestion {
                full_text: full.clone(),
                remaining_text: full,
                hint_type: "git".into(),
            });
        }

        // Fallback genérico para línea vacía
        let full = if cfg!(target_os = "windows") {
            "dir".to_string()
        } else {
            "ls -la".to_string()
        };
        return Some(GhostSuggestion {
            full_text: full.clone(),
            remaining_text: full,
            hint_type: "command".into(),
        });
    }

    // 3. Navegación con `cd`
    if trimmed == "cd" {
        let dirs = get_subdirectories(&current_dir);
        if let Some(first) = dirs.first() {
            return Some(GhostSuggestion {
                full_text: format!("cd {}/", first),
                remaining_text: format!(" {}/", first),
                hint_type: "folder".into(),
            });
        }
    } else if trimmed.starts_with("cd ") {
        let arg = trimmed.strip_prefix("cd ").unwrap_or("").trim_start();
        if arg.is_empty() {
            let dirs = get_subdirectories(&current_dir);
            if let Some(first) = dirs.first() {
                return Some(GhostSuggestion {
                    full_text: format!("cd {}/", first),
                    remaining_text: format!("{}/", first),
                    hint_type: "folder".into(),
                });
            }
        } else if let Some((parent_rel, leaf)) = arg.rsplit_once('/') {
            let target_dir = current_dir.join(parent_rel);
            let dirs = get_subdirectories(&target_dir);
            let leaf_lower = leaf.to_lowercase();
            if let Some(matched) = dirs.iter().find(|d| d.to_lowercase().starts_with(&leaf_lower)) {
                let leaf_char_count = leaf.chars().count();
                let matched_char_count = matched.chars().count();
                if matched_char_count > leaf_char_count {
                    let rem = format!("{}/", safe_skip_chars(matched, leaf_char_count));
                    let full = format!("cd {}/{}/", parent_rel, matched);
                    return Some(GhostSuggestion {
                        full_text: full,
                        remaining_text: rem,
                        hint_type: "folder".into(),
                    });
                }
            }
        } else {
            let dirs = get_subdirectories(&current_dir);
            let arg_lower = arg.to_lowercase();
            if let Some(matched) = dirs.iter().find(|d| d.to_lowercase().starts_with(&arg_lower)) {
                let arg_char_count = arg.chars().count();
                let matched_char_count = matched.chars().count();
                if matched_char_count > arg_char_count {
                    let rem = format!("{}/", safe_skip_chars(matched, arg_char_count));
                    let full = format!("cd {}/", matched);
                    return Some(GhostSuggestion {
                        full_text: full,
                        remaining_text: rem,
                        hint_type: "folder".into(),
                    });
                }
            }
        }
    }

    // 4. Subcomandos de herramientas CLI comunes
    let subcommands_db: &[(&str, &[&str], &str)] = &[
        // Git
        (
            "git",
            &["status", "push", "pull", "diff", "checkout", "commit -m \"\"", "branch", "add .", "log --oneline", "fetch", "merge", "stash"],
            "git",
        ),
        // Wails
        (
            "wails",
            &["dev", "build", "doctor", "init", "update", "generate"],
            "wails",
        ),
        // Go
        (
            "go",
            &["run .", "build", "test ./...", "mod tidy", "get", "vet", "fmt"],
            "go",
        ),
        // Cargo (Rust)
        (
            "cargo",
            &["run", "check", "build", "test", "dev", "clippy", "fmt", "add", "update"],
            "rust",
        ),
        // Docker
        (
            "docker",
            &["compose up", "compose down", "ps", "build -t", "run -it", "logs -f", "images"],
            "docker",
        ),
        // Python
        (
            "python",
            &["main.py", "app.py", "manage.py runserver", "-m venv .venv", "-m pip install -r requirements.txt"],
            "python",
        ),
        (
            "python3",
            &["main.py", "app.py", "manage.py runserver", "-m venv .venv", "-m pip install -r requirements.txt"],
            "python",
        ),
        // PHP
        (
            "php",
            &["artisan serve", "artisan migrate", "artisan tinker", "-S localhost:8000"],
            "php",
        ),
        // Flutter
        (
            "flutter",
            &["run", "build", "pub get", "clean", "doctor"],
            "flutter",
        ),
    ];

    for &(cmd_name, subs, hint_tag) in subcommands_db {
        if trimmed == cmd_name {
            if let Some(first) = subs.first() {
                return Some(GhostSuggestion {
                    full_text: format!("{} {}", cmd_name, first),
                    remaining_text: format!(" {}", first),
                    hint_type: hint_tag.into(),
                });
            }
        }

        let prefix_space = format!("{} ", cmd_name);
        if let Some(sub) = trimmed.strip_prefix(&prefix_space) {
            let sub_trimmed = sub.trim_start();
            let sub_lower = sub_trimmed.to_lowercase();
            let sub_char_count = sub_trimmed.chars().count();

            if sub_trimmed.is_empty() {
                if let Some(first) = subs.first() {
                    return Some(GhostSuggestion {
                        full_text: format!("{} {}", cmd_name, first),
                        remaining_text: first.to_string(),
                        hint_type: hint_tag.into(),
                    });
                }
            } else if let Some(matched) = subs.iter().find(|c| c.to_lowercase().starts_with(&sub_lower)) {
                if matched.chars().count() > sub_char_count {
                    return Some(GhostSuggestion {
                        full_text: format!("{} {}", cmd_name, matched),
                        remaining_text: safe_skip_chars(matched, sub_char_count),
                        hint_type: hint_tag.into(),
                    });
                }
            }
        }
    }

    // 5. Gestores de paquetes Node (pnpm, npm, bun, yarn)
    let pms = ["pnpm", "npm", "bun", "yarn"];
    for &pm in &pms {
        if trimmed == pm {
            let full = if pm == "npm" { "npm run dev" } else { "pnpm dev" };
            let rem = if pm == "npm" { " run dev" } else { " dev" };
            return Some(GhostSuggestion {
                full_text: full.into(),
                remaining_text: rem.into(),
                hint_type: "script".into(),
            });
        }

        let prefix_space = format!("{} ", pm);
        if let Some(sub) = trimmed.strip_prefix(&prefix_space) {
            let sub_trimmed = sub.trim_start();
            let scripts = read_package_scripts(&current_dir);
            let mut candidates: Vec<String> = scripts;
            if current_dir.join("src-tauri").exists() {
                candidates.insert(0, "tauri dev".into());
                candidates.insert(1, "tauri build".into());
            }
            candidates.extend(vec!["dev".into(), "build".into(), "test".into(), "install".into()]);

            let sub_lower = sub_trimmed.to_lowercase();
            let sub_char_count = sub_trimmed.chars().count();
            if sub_trimmed.is_empty() {
                if let Some(first) = candidates.first() {
                    return Some(GhostSuggestion {
                        full_text: format!("{} {}", pm, first),
                        remaining_text: first.clone(),
                        hint_type: "script".into(),
                    });
                }
            } else if let Some(matched) = candidates.iter().find(|c| c.to_lowercase().starts_with(&sub_lower)) {
                if matched.chars().count() > sub_char_count {
                    return Some(GhostSuggestion {
                        full_text: format!("{} {}", pm, matched),
                        remaining_text: safe_skip_chars(matched, sub_char_count),
                        hint_type: "script".into(),
                    });
                }
            }
        }
    }

    // 6. Prefijos de comandos habituales multiplataforma
    let common_commands = [
        "cd ",
        "ls -la",
        "clear",
        "code .",
        "mkdir ",
        "touch ",
        "cat ",
    ];

    let trimmed_lower = trimmed.to_lowercase();
    let trimmed_char_count = trimmed.chars().count();
    for cmd in common_commands {
        if cmd.to_lowercase().starts_with(&trimmed_lower) && cmd.chars().count() > trimmed_char_count {
            return Some(GhostSuggestion {
                full_text: cmd.to_string(),
                remaining_text: safe_skip_chars(cmd, trimmed_char_count),
                hint_type: "command".into(),
            });
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ghost_suggestion_empty_in_project() {
        let cwd = std::env::current_dir().unwrap();
        let suggestion = get_ghost_suggestion(Some(cwd.to_string_lossy().to_string()), "".into());
        assert!(suggestion.is_some());
    }

    #[test]
    fn test_ghost_suggestion_cd() {
        let cwd = std::env::current_dir().unwrap();
        let suggestion = get_ghost_suggestion(Some(cwd.to_string_lossy().to_string()), "cd ".into());
        assert!(suggestion.is_some());
        let s = suggestion.unwrap();
        assert_eq!(s.hint_type, "folder");
    }

    #[test]
    fn test_ghost_suggestion_wails() {
        let cwd = std::env::current_dir().unwrap();
        let suggestion = get_ghost_suggestion(Some(cwd.to_string_lossy().to_string()), "wails d".into());
        assert!(suggestion.is_some());
        let s = suggestion.unwrap();
        assert_eq!(s.remaining_text, "ev");
        assert_eq!(s.hint_type, "wails");
    }

    #[test]
    fn test_ghost_suggestion_go() {
        let cwd = std::env::current_dir().unwrap();
        let suggestion = get_ghost_suggestion(Some(cwd.to_string_lossy().to_string()), "go r".into());
        assert!(suggestion.is_some());
        let s = suggestion.unwrap();
        assert_eq!(s.remaining_text, "un .");
        assert_eq!(s.hint_type, "go");
    }

    #[test]
    fn test_habit_recording_and_priority() {
        let test_dir = "/tmp/test_rhod_habit_project".to_string();
        record_command_habit(test_dir.clone(), "python manage.py runserver --noreload".to_string());
        
        let suggestion = get_ghost_suggestion(Some(test_dir), "pyth".into());
        assert!(suggestion.is_some());
        let s = suggestion.unwrap();
        assert_eq!(s.full_text, "python manage.py runserver --noreload");
        assert_eq!(s.hint_type, "habit");
    }
}

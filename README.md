<div align="center">

<img src="public/app-icon.png" alt="Rhod Terminal Logo" width="120" height="120" />

# Rhod

**Terminal moderna, minimalista y ultraligera construida con Rust y Tauri v2.**

[![Release](https://img.shields.io/badge/release-v0.9.2-blue.svg?style=flat-square)](https://github.com)
[![Rust](https://img.shields.io/badge/rust-2024_edition-orange.svg?style=flat-square)](https://www.rust-lang.org)
[![Tauri](https://img.shields.io/badge/tauri-v2-24C8D8.svg?style=flat-square)](https://tauri.app)
[![React](https://img.shields.io/badge/react-v19-61DAFB.svg?style=flat-square)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-v5-3178C6.svg?style=flat-square)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![Memory](https://img.shields.io/badge/RAM_idle-~55_MB-success.svg?style=flat-square)]()
[![Binary Size](https://img.shields.io/badge/binary_size-3.0_MB-success.svg?style=flat-square)]()

</div>

---

## Indice

- [Vision General](#vision-general)
- [Caracteristicas Principales](#caracteristicas-principales)
- [Comparativa de Rendimiento](#comparativa-de-rendimiento)
- [Arquitectura de Software](#arquitectura-de-software)
- [Atajos de Teclado](#atajos-de-teclado)
- [Instalacion](#instalacion)
- [Desarrollo Local](#desarrollo-local)
- [Flujo de Release](#flujo-de-release)
- [Licencia](#licencia)

---

## Vision General

Rhod es un emulador de terminal de escritorio enfocado en desarrolladores que buscan la velocidad y bajo consumo de recursos de las herramientas de bajo nivel, combinada con una experiencia visual moderna, limpia y altamente responsiva.

A diferencia de las alternativas basadas en Electron (que consumen entre 250 MB y 400 MB de memoria solo para mostrar un prompt), Rhod implementa un nucleo de sincronizacion PTY nativo en **Rust** junto con una capa visual optimizada en **Tauri v2** y **WebKit**, logrando un consumo de memoria en reposo de aproximadamente **55 MB** y un binario autocontenido de apenas **3.0 MB**.

---

## Caracteristicas Principales

- **Motor PTY Nativo Cross-Platform:** Control de pseudo-terminales de alto rendimiento utilizando `portable-pty`. Soporta POSIX PTY en macOS/Linux y ConPTY en Windows sin parpadeo de consolas secundarias.
- **Consumo Minimo de Memoria:** Disenado con Vanilla CSS y componentes ligeros para evitar el overhead de runtimes pesados.
- **Integracion de Shell en Tiempo Real:** Deteccion automatica del directorio actual de trabajo (CWD) mediante el protocolo estandar **OSC 7** e inspeccion de procesos en macOS (`lsof`), Linux (`/proc`) y Windows.
- **Extraccion de Assets en Memoria (Lazy Once):** Scripts embebidos de integracion (`rhod.zsh`, plantillas de entorno y resaltado de sintaxis empaquetado) sincronizados en disco una unica vez por sesion con `std::sync::Once`.
- **Tipografia Profesional Embebida:** Incluye tipografias modernas para codigo (**JetBrains Mono** y **Geist Mono**) con cambio en caliente y persistencia de configuracion.
- **Telemetria de Entorno:** Deteccion instantanea de rama Git activa, version de Node.js instalada, shell en ejecucion y sistema operativo en la barra de estado.
- **Navegacion por Pestanas Independientes:** Creacion, aislamiento de procesos, cambio rapido numerico (1 a 9) y destruccion limpia de sesiones PTY con liberacion de descriptores de archivo.
- **Menu de Atajos Integrado:** Paleta flotante interactiva estilo Raycast/Spotlight para consultar y ejecutar comandos de interfaz mediante teclado o clic.

---

## Comparativa de Rendimiento

Mediciones tomadas en entorno macOS (Apple Silicon M-Series, reposo tras inicializacion):

| Metrica | Rhod (Rust + Tauri) | Terminales Electron (Hyper / VS Code) |
| :--- | :--- | :--- |
| **Consumo de Memoria RAM** | **~50 - 55 MB** | 250 MB - 450 MB |
| **Tamano del Binario** | **3.0 MB** | 120 MB - 220 MB |
| **Tiempo de Arranque (Cold Start)** | **< 120 ms** | 800 ms - 2200 ms |
| **Manejador de Estilos** | CSS Puro (Acelerado por HW) | CSS-in-JS / Styled Components |
| **Sobrecarga de Background Tasks** | Nula (Procesos Rust en reposo) | Constante (V8 Garbage Collector) |

---

## Arquitectura de Software

El proyecto sigue una separacion estricta de responsabilidades (**Separation of Concerns**) y principios de **Clean Architecture**:

```text
rhod-term/
├── src-tauri/                         # Backend Nativo en Rust
│   ├── src/
│   │   ├── commands/                  # Capa de Controladores IPC (Thin Handlers)
│   │   │   ├── context.rs             # Controladores de telemetria y CWD
│   │   │   ├── pty.rs                 # Controladores de inicio, resize y cierre PTY
│   │   │   └── mod.rs
│   │   ├── context/                   # Subsistema de Inspeccion de Sistema
│   │   │   ├── git.rs                 # Inspeccion de repositorios y ramas Git
│   │   │   ├── platform.rs            # Comandos silenciosos cross-platform
│   │   │   ├── process.rs             # Resolucion de CWD por PID (lsof, procfs)
│   │   │   ├── runtime.rs             # Deteccion de Node.js, Shell y Home
│   │   │   └── mod.rs
│   │   ├── error.rs                   # Errores de dominio tipados (AppError)
│   │   ├── lib.rs                     # Composicion y arranque de runtime Tauri
│   │   ├── main.rs                    # Entrypoint del binario ejecutable
│   │   ├── pty/                       # Subsistema PTY y Manejo de Concurrencia
│   │   │   ├── integration.rs         # Scripts embebidos y variables de entorno
│   │   │   ├── manager.rs             # Gestor concurrente (Arc<Mutex<HashMap>>)
│   │   │   ├── session.rs             # Entidad PtySession (writer, master, pid)
│   │   │   └── mod.rs
│   │   └── state.rs                   # Estado global de la aplicacion (AppState)
│   ├── Cargo.toml                     # Perfil de optimizacion release (LTO, opt-level "z")
│   └── tauri.conf.json                # Configuracion y permisos de ventanas nativas
│
└── src/                               # Frontend en React 19 + TypeScript
    ├── components/                    # Componentes de Presentacion Modulares
    │   ├── Header/                    # Barra superior, pestanas y version
    │   ├── ShortcutsModal/            # Buscador y catalogo interactivo de atajos
    │   ├── StatusBar/                 # Barra inferior con telemetria de entorno
    │   ├── Terminal/                  # Encapsulamiento de xterm.js y FitAddon
    │   └── Toast/                     # Notificaciones visuales flotantes
    ├── constants/                     # Constantes de tipografia, temas y atajos
    ├── hooks/                         # Hooks de Negocio y Control de Estado
    │   ├── useFontManager.ts          # Seleccion tipografica, zoom y persistencia
    │   ├── useKeyboardShortcuts.ts    # Captura global de eventos de teclado
    │   ├── useSystemContext.ts        # Telemetria en tiempo real de ruta y Git
    │   ├── useTerminalTabs.ts         # Ciclo de vida de pestanas y navegacion
    │   └── useToast.ts                # Sistema de feedback visual
    ├── types/                         # Interfaces y contratos TypeScript
    ├── utils/                         # Funciones puras (formateo de rutas CWD)
    ├── App.css                        # Estilos nativos sin dependencias de runtime
    └── App.tsx                        # Punto de composicion de la interfaz
```

---

## Atajos de Teclado

La interfaz mapea automaticamente los modificadores segun el sistema operativo (`Cmd` en macOS, `Ctrl` en Windows y Linux):

| Categoria | Accion | Atajo (macOS) | Atajo (Windows / Linux) |
| :--- | :--- | :--- | :--- |
| **Pestanas** | Abrir nueva sesion de terminal | `Cmd + T` | `Ctrl + T` |
| **Pestanas** | Cerrar sesion de terminal activa | `Cmd + W` | `Ctrl + W` |
| **Pestanas** | Cambiar a pestana especifica | `Cmd + 1..9` | `Ctrl + 1..9` |
| **Terminal** | Aumentar tamano de fuente | `Cmd + +` | `Ctrl + +` |
| **Terminal** | Disminuir tamano de fuente | `Cmd + -` | `Ctrl + -` |
| **Terminal** | Restablecer fuente a 13.5px | `Cmd + 0` | `Ctrl + 0` |
| **Terminal** | Alternar tipografia (JetBrains / Geist / Sistema) | `Cmd + Shift + F` | `Ctrl + Shift + F` |
| **Terminal** | Copiar seleccion activa | `Cmd + C` | `Ctrl + Shift + C` |
| **Terminal** | Pegar portapapeles | `Cmd + V` | `Ctrl + Shift + V` |
| **Terminal** | Limpiar pantalla visible | `Ctrl + L` | `Ctrl + L` |
| **Terminal** | Interrumpir proceso (SIGINT) | `Ctrl + C` | `Ctrl + C` |
| **Terminal** | Reiniciar shell de la pestana | `Cmd + R` | `Ctrl + R` |
| **Navegacion** | Abrir paleta de atajos de teclado | `Cmd + K` | `Ctrl + K` |
| **Navegacion** | Cerrar paleta flotante | `Escape` | `Escape` |

---

## Instalacion

### Descargar Versiones Precompiladas
Puedes descargar los ejecutables firmados y paquetes de instalacion directamente desde la seccion de **Releases**:

- **macOS (Apple Silicon y x86_64):** Archivo `.dmg` autocontenido.
- **Windows (x64):** Instalador `.msi` o ejecutable portable `.exe`.
- **Linux:** Paquetes `.deb` y binarios `.AppImage`.

---

## Desarrollo Local

### Requisitos Previos
1. **Rust:** Herramientas estables instaladas via [rustup.rs](https://rustup.rs).
2. **Node.js:** Version 20 o superior.
3. **pnpm:** Gestor de paquetes recomendado (`npm install -g pnpm`).
4. **Dependencias del sistema (Linux unicamente):**
   ```bash
   sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
   ```

### Pasos de Instalacion

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/rhod.git
   cd rhod
   ```

2. Instalar dependencias del frontend:
   ```bash
   pnpm install
   ```

3. Iniciar entorno de desarrollo interactivo (compila Rust y arranca Vite con recarga rapida):
   ```bash
   pnpm tauri dev
   ```

4. Compilar binario optimizado para produccion:
   ```bash
   pnpm tauri build
   ```

5. Generar imagen `.dmg` de macOS localmente:
   ```bash
   pnpm build:dmg
   ```

---

## Flujo de Release

El proyecto cuenta con scripts de versionado semantico y una tuberia automatizada de GitHub Actions:

1. **Incrementar version:**
   ```bash
   pnpm bump:patch   # Pasa por ejemplo de 0.3.0 a 0.3.1
   pnpm bump:minor   # Pasa por ejemplo de 0.3.0 a 0.4.0
   pnpm bump:major   # Pasa por ejemplo de 0.3.0 a 1.0.0
   ```
   *Este comando actualiza atomicamente `package.json`, `Cargo.toml`, `tauri.conf.json`, `Cargo.lock` y genera el tag en Git.*

2. **Publicar a produccion:**
   ```bash
   git push origin main --tags
   ```
   *El workflow de GitHub Actions detectara el tag, compilara los artefactos en paralelo en servidores macOS, Windows y Linux, y publicara el release oficial automaticamente.*

---

## Licencia

Distribuido bajo la Licencia **MIT**. Consulta el archivo `LICENSE` para mas informacion.

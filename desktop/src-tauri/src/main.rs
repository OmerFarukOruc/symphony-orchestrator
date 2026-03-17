#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

const DEFAULT_PORT: u16 = 4000;

#[derive(Debug)]
struct ServiceRuntime {
    child: Option<Child>,
    workflow_path: String,
    port: u16,
    repo_root: PathBuf,
    last_error: Option<String>,
}

impl ServiceRuntime {
    fn new() -> Self {
        let repo_root = default_repo_root();
        let workflow_path = default_workflow_path(&repo_root);
        Self {
            child: None,
            workflow_path,
            port: DEFAULT_PORT,
            repo_root,
            last_error: None,
        }
    }

    fn cli_path(&self) -> PathBuf {
        self.repo_root.join("dist").join("cli.js")
    }

    fn dashboard_url(&self) -> String {
        format!("http://127.0.0.1:{}/", self.port)
    }

    fn ensure_process_state(&mut self) {
        let Some(child) = self.child.as_mut() else {
            return;
        };
        match child.try_wait() {
            Ok(Some(status)) => {
                self.child = None;
                self.last_error = Some(format!("service exited with status {}", status));
            }
            Ok(None) => {}
            Err(error) => {
                self.child = None;
                self.last_error = Some(format!("failed to inspect service process: {}", error));
            }
        }
    }

    fn is_running(&mut self) -> bool {
        self.ensure_process_state();
        self.child.is_some()
    }

    fn status(&mut self) -> ServiceStatus {
        let running = self.is_running();
        ServiceStatus {
            running,
            pid: self.child.as_ref().map(Child::id),
            port: self.port,
            workflow_path: self.workflow_path.clone(),
            dashboard_url: self.dashboard_url(),
            repo_root: self.repo_root.to_string_lossy().to_string(),
            cli_path: self.cli_path().to_string_lossy().to_string(),
            last_error: self.last_error.clone(),
        }
    }

    fn start(&mut self, workflow_path: Option<String>, port: Option<u16>) -> Result<ServiceStatus, String> {
        if self.is_running() {
            return Ok(self.status());
        }

        self.port = port.unwrap_or(DEFAULT_PORT);
        if let Some(workflow) = workflow_path {
            let trimmed = workflow.trim();
            if !trimmed.is_empty() {
                self.workflow_path = trimmed.to_string();
            }
        }

        let cli_path = self.cli_path();
        if !cli_path.exists() {
            self.last_error = Some(format!(
                "missing {}. Build Symphony first with `npm run build` from repository root.",
                cli_path.to_string_lossy()
            ));
            return Err(self
                .last_error
                .clone()
                .unwrap_or_else(|| "missing compiled CLI".to_string()));
        }

        let spawn_result = Command::new("node")
            .arg(cli_path)
            .arg(self.workflow_path.clone())
            .arg("--port")
            .arg(self.port.to_string())
            .current_dir(&self.repo_root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        match spawn_result {
            Ok(child) => {
                self.child = Some(child);
                self.last_error = None;
                Ok(self.status())
            }
            Err(error) => {
                let message = format!(
                    "failed to start Symphony service via node dist/cli.js: {}",
                    error
                );
                self.last_error = Some(message.clone());
                Err(message)
            }
        }
    }

    fn stop(&mut self) -> Result<ServiceStatus, String> {
        let Some(mut child) = self.child.take() else {
            return Ok(self.status());
        };

        if let Err(error) = child.kill() {
            if child.try_wait().ok().flatten().is_none() {
                let message = format!("failed to stop Symphony service: {}", error);
                self.last_error = Some(message.clone());
                return Err(message);
            }
        }

        match child.wait() {
            Ok(_status) => {
                self.last_error = None;
                Ok(self.status())
            }
            Err(error) => {
                let message = format!("failed while waiting for service to stop: {}", error);
                self.last_error = Some(message.clone());
                Err(message)
            }
        }
    }
}

#[derive(Debug)]
struct DesktopState {
    runtime: Mutex<ServiceRuntime>,
}

impl DesktopState {
    fn new() -> Self {
        Self {
            runtime: Mutex::new(ServiceRuntime::new()),
        }
    }
}

impl Drop for DesktopState {
    fn drop(&mut self) {
        if let Ok(mut runtime) = self.runtime.lock() {
            let _ = runtime.stop();
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    running: bool,
    pid: Option<u32>,
    port: u16,
    workflow_path: String,
    dashboard_url: String,
    repo_root: String,
    cli_path: String,
    last_error: Option<String>,
}

fn default_repo_root() -> PathBuf {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    repo_root.canonicalize().unwrap_or(repo_root)
}

fn default_workflow_path(repo_root: &PathBuf) -> String {
    let example = repo_root.join("WORKFLOW.example.md");
    if example.exists() {
        return example.to_string_lossy().to_string();
    }
    repo_root
        .join("WORKFLOW.md")
        .to_string_lossy()
        .to_string()
}

fn configure_linux_graphics_fallbacks() {
    #[cfg(target_os = "linux")]
    {
        if env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        if env::var_os("LIBGL_ALWAYS_SOFTWARE").is_none() {
            env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
        }
        if env::var_os("GDK_BACKEND").is_none() && env::var_os("DISPLAY").is_some() {
            env::set_var("GDK_BACKEND", "x11");
        }
    }
}

#[tauri::command]
fn desktop_status(state: tauri::State<'_, DesktopState>) -> Result<ServiceStatus, String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "desktop runtime lock is poisoned".to_string())?;
    Ok(runtime.status())
}

#[tauri::command]
fn desktop_start_service(
    workflow_path: Option<String>,
    port: Option<u16>,
    state: tauri::State<'_, DesktopState>,
) -> Result<ServiceStatus, String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "desktop runtime lock is poisoned".to_string())?;
    runtime.start(workflow_path, port)
}

#[tauri::command]
fn desktop_stop_service(state: tauri::State<'_, DesktopState>) -> Result<ServiceStatus, String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "desktop runtime lock is poisoned".to_string())?;
    runtime.stop()
}

fn main() {
    configure_linux_graphics_fallbacks();
    tauri::Builder::default()
        .manage(DesktopState::new())
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            desktop_start_service,
            desktop_stop_service
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Symphony desktop scaffold");
}

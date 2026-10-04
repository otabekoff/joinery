use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const PROJECT_FILE: &str = "project.joinery.json";

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// Setting JOINERY_DATA_DIR keeps settings and the default projects folder inside that
// directory instead of the user profile: a portable install, or a test run that must
// not touch real projects.
fn data_dir_override() -> Option<PathBuf> {
    std::env::var_os("JOINERY_DATA_DIR").filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn settings_path(app: &tauri::AppHandle) -> CmdResult<PathBuf> {
    if let Some(dir) = data_dir_override() {
        return Ok(dir.join("settings.json"));
    }
    Ok(app.path().app_config_dir().map_err(err)?.join("settings.json"))
}

// Write to a sibling temp file first so a crash never leaves a half-written file.
fn write_atomic(path: &Path, contents: &[u8]) -> CmdResult<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').trim();
    if trimmed.is_empty() { "Project".into() } else { trimmed.into() }
}

/// Documents/Joinery, the projects folder used when the user doesn't pick one.
#[tauri::command]
fn default_root(app: tauri::AppHandle) -> CmdResult<String> {
    if let Some(dir) = data_dir_override() {
        return Ok(dir.join("Projects").to_string_lossy().into_owned());
    }
    let docs = app.path().document_dir().map_err(err)?;
    Ok(docs.join("Joinery").to_string_lossy().into_owned())
}

#[tauri::command]
fn read_settings(app: tauri::AppHandle) -> CmdResult<Option<String>> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(err)
}

#[tauri::command]
fn write_settings(app: tauri::AppHandle, contents: String) -> CmdResult<()> {
    write_atomic(&settings_path(&app)?, contents.as_bytes())
}

/// Every project found directly under `root`, plus the `extra` project folders
/// that live elsewhere. Returns (folder, file contents) pairs.
#[tauri::command]
fn list_projects(root: String, extra: Vec<String>) -> CmdResult<Vec<(String, String)>> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                dirs.push(entry.path());
            }
        }
    }
    for e in extra {
        let p = PathBuf::from(e);
        if !dirs.contains(&p) {
            dirs.push(p);
        }
    }
    let mut out = Vec::new();
    for dir in dirs {
        if let Ok(contents) = fs::read_to_string(dir.join(PROJECT_FILE)) {
            out.push((dir.to_string_lossy().into_owned(), contents));
        }
    }
    Ok(out)
}

/// A folder under `parent` named after the project that no other project uses yet.
#[tauri::command]
fn project_dir(parent: String, name: String) -> String {
    let base = safe_name(&name);
    let parent = PathBuf::from(parent);
    let mut dir = parent.join(&base);
    let mut n = 2;
    while dir.join(PROJECT_FILE).exists() {
        dir = parent.join(format!("{base} {n}"));
        n += 1;
    }
    dir.to_string_lossy().into_owned()
}

#[tauri::command]
fn write_project(dir: String, contents: String) -> CmdResult<()> {
    write_atomic(&PathBuf::from(dir).join(PROJECT_FILE), contents.as_bytes())
}

/// Removes the project file, and the folder too when nothing else is left in it.
#[tauri::command]
fn delete_project(dir: String) -> CmdResult<()> {
    let dir = PathBuf::from(dir);
    let file = dir.join(PROJECT_FILE);
    if file.exists() {
        fs::remove_file(file).map_err(err)?;
    }
    let _ = fs::remove_dir(dir);
    Ok(())
}

#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> CmdResult<()> {
    write_atomic(Path::new(&path), &contents)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // On scaled displays the window was coming up at the size of the whole work
            // area instead of the configured one, so size and center it explicitly,
            // leaving a margin on screens smaller than the preferred 1440 x 900.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unmaximize();
                let (mut w, mut h) = (1440.0_f64, 900.0_f64);
                if let Ok(Some(m)) = win.current_monitor() {
                    let area = m.size().to_logical::<f64>(m.scale_factor());
                    w = w.min(area.width - 80.0);
                    h = h.min(area.height - 120.0);
                }
                let _ = win.set_size(tauri::LogicalSize::new(w, h));
                let _ = win.center();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            default_root,
            read_settings,
            write_settings,
            list_projects,
            project_dir,
            write_project,
            delete_project,
            write_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_drop_characters_windows_rejects() {
        assert_eq!(safe_name("Shop: v2/3?"), "Shop_ v2_3_");
        assert_eq!(safe_name("  trailing dots... "), "trailing dots");
        assert_eq!(safe_name("   "), "Project");
    }

    #[test]
    fn project_dir_avoids_folders_that_already_hold_a_project() {
        let root = std::env::temp_dir().join(format!("joinery-test-{}", std::process::id()));
        let taken = root.join("Shop");
        fs::create_dir_all(&taken).unwrap();
        fs::write(taken.join(PROJECT_FILE), "{}").unwrap();
        let dir = project_dir(root.to_string_lossy().into_owned(), "Shop".into());
        assert_eq!(PathBuf::from(dir), root.join("Shop 2"));
        write_project(root.join("New").to_string_lossy().into_owned(), "{\"id\":\"1\"}".into()).unwrap();
        let found = list_projects(root.to_string_lossy().into_owned(), vec![]).unwrap();
        assert_eq!(found.len(), 2);
        delete_project(root.join("New").to_string_lossy().into_owned()).unwrap();
        assert!(!root.join("New").exists());
        fs::remove_dir_all(root).unwrap();
    }
}

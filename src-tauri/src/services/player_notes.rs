use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerNote {
    pub sgp_server_id: String,
    pub puuid: String,
    pub display_name: String,
    pub note: String,
    pub tag: String,
    pub favorite: bool,
    #[serde(default)]
    pub updated_at: i64,
}

// User-authored data is deliberately outside the disposable match-cache database.
fn open_db() -> Result<Connection, String> {
    let path = super::stats::cache_db_path()
        .ok_or("无法确定本地数据目录")?
        .with_file_name("player-data.sqlite3");
    std::fs::create_dir_all(path.parent().ok_or("本地数据目录无效")?)
        .map_err(|_| "无法创建玩家备注目录")?;
    let conn = Connection::open(path).map_err(|_| "无法打开玩家备注数据库")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    initialize(&conn).map_err(|e| e.to_string())?;
    Ok(conn)
}

fn initialize(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS player_notes (
            sgp_server_id TEXT NOT NULL,
            puuid TEXT NOT NULL,
            display_name TEXT NOT NULL,
            note TEXT NOT NULL,
            tag TEXT NOT NULL,
            favorite INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (sgp_server_id, puuid)
        );",
    )
}

fn normalize_identity(server: &str, puuid: &str) -> Result<(String, String), String> {
    let server = server.trim().to_ascii_uppercase();
    let puuid = puuid.trim().to_ascii_lowercase();
    if !server.starts_with("TENCENT_")
        || server.len() <= "TENCENT_".len()
        || server.len() > 40
        || server == "TENCENT_ALL"
        || !server
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err("请先选择具体国服区服".into());
    }
    if puuid.len() < 16
        || puuid.len() > 128
        || !puuid
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("玩家标识无效，无法保存备注".into());
    }
    Ok((server, puuid))
}

fn save(conn: &Connection, mut entry: PlayerNote) -> Result<PlayerNote, String> {
    (entry.sgp_server_id, entry.puuid) = normalize_identity(&entry.sgp_server_id, &entry.puuid)?;
    entry.display_name = entry.display_name.trim().to_string();
    entry.note = entry.note.trim().to_string();
    entry.tag = entry.tag.trim().to_string();
    if entry.note.chars().count() > 1000
        || entry.tag.chars().count() > 30
        || entry.display_name.chars().count() > 100
    {
        return Err("备注最多 1000 字、标签最多 30 字、名称最多 100 字".into());
    }
    entry.updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;
    conn.execute(
        "INSERT INTO player_notes VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(sgp_server_id, puuid) DO UPDATE SET
         display_name=excluded.display_name, note=excluded.note, tag=excluded.tag,
         favorite=excluded.favorite, updated_at=excluded.updated_at",
        params![
            entry.sgp_server_id,
            entry.puuid,
            entry.display_name,
            entry.note,
            entry.tag,
            entry.favorite,
            entry.updated_at
        ],
    )
    .map_err(|_| "保存失败，请检查磁盘空间与数据目录权限")?;
    Ok(entry)
}

fn list(conn: &Connection) -> Result<Vec<PlayerNote>, String> {
    let mut statement = conn
        .prepare(
            "SELECT sgp_server_id, puuid, display_name, note, tag, favorite, updated_at
         FROM player_notes ORDER BY favorite DESC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |r| {
            Ok(PlayerNote {
                sgp_server_id: r.get(0)?,
                puuid: r.get(1)?,
                display_name: r.get(2)?,
                note: r.get(3)?,
                tag: r.get(4)?,
                favorite: r.get(5)?,
                updated_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_player_notes() -> Result<Vec<PlayerNote>, String> {
    list(&open_db()?)
}

#[tauri::command]
pub fn save_player_note(entry: PlayerNote) -> Result<PlayerNote, String> {
    save(&open_db()?, entry)
}

#[tauri::command]
pub fn delete_player_note(sgp_server_id: String, puuid: String) -> Result<(), String> {
    let (server, puuid) = normalize_identity(&sgp_server_id, &puuid)?;
    open_db()?
        .execute(
            "DELETE FROM player_notes WHERE sgp_server_id=?1 AND puuid=?2",
            params![server, puuid],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(server: &str, name: &str) -> PlayerNote {
        PlayerNote {
            sgp_server_id: server.into(),
            puuid: "ABCDEF12-1234-1234-1234-ABCDEF123456".into(),
            display_name: name.into(),
            note: "常玩辅助".into(),
            tag: "朋友".into(),
            favorite: true,
            updated_at: 0,
        }
    }

    #[test]
    fn rename_preserves_identity_and_servers_are_isolated() {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn).unwrap();
        save(&conn, entry("tencent_hn1", "旧名")).unwrap();
        save(&conn, entry("TENCENT_HN1", "新名")).unwrap();
        save(&conn, entry("TENCENT_HN10", "另一区")).unwrap();
        initialize(&conn).unwrap();
        let rows = list(&conn).unwrap();
        assert_eq!(rows.len(), 2);
        let hn1 = rows
            .iter()
            .find(|r| r.sgp_server_id == "TENCENT_HN1")
            .unwrap();
        assert_eq!(hn1.display_name, "新名");
        assert_eq!(hn1.note, "常玩辅助");
        assert!(hn1.favorite);
    }

    #[test]
    fn notes_survive_reopening_database_and_unfavorite_keeps_note() {
        let path =
            std::env::temp_dir().join(format!("lol-notes-test-{}.sqlite3", std::process::id()));
        {
            let conn = Connection::open(&path).unwrap();
            initialize(&conn).unwrap();
            let mut row = entry("TENCENT_HN1", "测试");
            row.favorite = false;
            save(&conn, row).unwrap();
        }
        let conn = Connection::open(&path).unwrap();
        initialize(&conn).unwrap();
        let rows = list(&conn).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(!rows[0].favorite);
        assert_eq!(rows[0].note, "常玩辅助");
        drop(conn);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_invalid_identity_and_oversized_text() {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn).unwrap();
        assert!(save(&conn, entry("ALL", "测试")).is_err());
        let mut row = entry("TENCENT_HN1", "测试");
        row.note = "字".repeat(1001);
        assert!(save(&conn, row).is_err());
        assert!(list(&conn).unwrap().is_empty());
    }
}

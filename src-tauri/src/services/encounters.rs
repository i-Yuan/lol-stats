//! Local observations only: neither a bookmark nor champion select proves a played encounter.
use super::models::LiveGameResponse;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    collections::HashSet,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncounterSummary {
    pub puuid: String,
    pub previous_games: u64,
    pub last_seen_at: Option<i64>,
}

fn identity(value: &str) -> Option<String> {
    let value = value.trim().to_ascii_lowercase();
    (value.len() >= 16
        && value.len() <= 128
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && value.chars().any(|c| c != '0' && c != '-'))
    .then_some(value)
}

fn initialize(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS encounters (
        server TEXT NOT NULL, observer TEXT NOT NULL, peer TEXT NOT NULL,
        game_id TEXT NOT NULL, first_seen_at INTEGER NOT NULL,
        PRIMARY KEY(server, observer, peer, game_id)
    );",
    )
}

fn observe(
    conn: &mut Connection,
    server: &str,
    observer: &str,
    game_id: Option<u64>,
    peers: &[String],
    record: bool,
    now: i64,
) -> rusqlite::Result<Vec<EncounterSummary>> {
    let tx = conn.transaction()?;
    let mut result = Vec::new();
    let current_game = game_id.unwrap_or(0).to_string();
    for peer in peers {
        let (previous_games, last_seen_at) = tx.query_row(
            "SELECT COUNT(*), MAX(first_seen_at) FROM encounters
             WHERE server=?1 AND observer=?2 AND peer=?3 AND game_id<>?4",
            params![server, observer, peer, current_game],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        result.push(EncounterSummary {
            puuid: peer.clone(),
            previous_games,
            last_seen_at,
        });
        if record && game_id.is_some_and(|id| id > 0) {
            tx.execute(
                "INSERT OR IGNORE INTO encounters VALUES (?1,?2,?3,?4,?5)",
                params![server, observer, peer, current_game, now],
            )?;
        }
    }
    tx.commit()?;
    Ok(result)
}

fn can_record(phase: &str, observer_present: bool) -> bool {
    observer_present
        && matches!(
            phase,
            "InProgress" | "Reconnect" | "WaitingForStats" | "PreEndOfGame" | "EndOfGame"
        )
}

pub fn annotate(mut response: LiveGameResponse, observer: Option<&str>) -> LiveGameResponse {
    let Some(observer) = observer.and_then(identity) else {
        response.encounter_warning = Some("无法确认当前账号，未读取或记录相遇历史".into());
        return response;
    };
    response.observer_puuid = Some(observer.clone());
    let server = response.sgp_server_id.trim().to_ascii_uppercase();
    if !server.starts_with("TENCENT_")
        || server.len() <= 8
        || server == "TENCENT_ALL"
        || !server
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        response.encounter_warning = Some("区服身份不明确，未记录相遇历史".into());
        return response;
    }
    let identities: HashSet<String> = response
        .teams
        .iter()
        .flat_map(|t| &t.players)
        .filter(|p| !p.is_placeholder)
        .filter_map(|p| identity(&p.puuid))
        .collect();
    // A spectator or unidentifiable account must not create a co-play observation.
    let record = can_record(&response.phase, identities.contains(&observer));
    let mut peers: Vec<String> = identities.into_iter().filter(|p| p != &observer).collect();
    peers.sort();
    let result = (|| -> Result<Vec<EncounterSummary>, String> {
        let path = super::stats::cache_db_path()
            .ok_or("无法确定本地数据目录")?
            .with_file_name("encounters.sqlite3");
        std::fs::create_dir_all(path.parent().ok_or("本地数据目录无效")?)
            .map_err(|_| "无法创建相遇记录目录")?;
        let mut conn = Connection::open(path).map_err(|_| "无法打开相遇记录数据库")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| "无法设置数据库等待时间")?;
        initialize(&conn).map_err(|_| "无法初始化相遇记录")?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "系统时钟异常")?
            .as_millis() as i64;
        observe(
            &mut conn,
            &server,
            &observer,
            response.game_id,
            &peers,
            record,
            now,
        )
        .map_err(|_| "相遇记录读取或保存失败".into())
    })();
    match result {
        Ok(rows) => response.encounters = rows,
        Err(message) => response.encounter_warning = Some(message),
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_poll_does_not_count_current_game_or_change_first_seen() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        let peers = vec!["peer".into()];
        for now in [100, 200] {
            let rows = observe(&mut db, "TENCENT_HN1", "me", Some(1), &peers, true, now).unwrap();
            assert_eq!(rows[0].previous_games, 0);
        }
        let rows = observe(&mut db, "TENCENT_HN1", "me", Some(2), &peers, true, 300).unwrap();
        assert_eq!(rows[0].previous_games, 1);
        assert_eq!(rows[0].last_seen_at, Some(100));
        assert_eq!(
            observe(&mut db, "TENCENT_HN1", "me", Some(2), &peers, true, 400).unwrap()[0]
                .previous_games,
            1
        );
    }
    #[test]
    fn accounts_servers_and_unconfirmed_games_are_isolated() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        let peers = vec!["peer".into()];
        observe(&mut db, "TENCENT_HN1", "me", Some(1), &peers, false, 10).unwrap();
        observe(&mut db, "TENCENT_HN1", "me", None, &peers, true, 10).unwrap();
        assert_eq!(
            observe(&mut db, "TENCENT_HN1", "me", Some(2), &peers, true, 20).unwrap()[0]
                .previous_games,
            0
        );
        assert_eq!(
            observe(&mut db, "TENCENT_HN2", "me", Some(3), &peers, true, 30).unwrap()[0]
                .previous_games,
            0
        );
        assert_eq!(
            observe(&mut db, "TENCENT_HN1", "other", Some(3), &peers, true, 30).unwrap()[0]
                .previous_games,
            0
        );
    }
    #[test]
    fn placeholder_identities_are_rejected() {
        assert!(identity("00000000-0000-0000-0000-000000000000").is_none());
        assert!(identity("nickname").is_none());
        assert_eq!(
            identity(" ABCDEF12-1234-1234-1234-ABCDEF123456 ").unwrap(),
            "abcdef12-1234-1234-1234-abcdef123456"
        );
    }
    #[test]
    fn selection_and_spectating_never_record_encounters() {
        for phase in ["ChampSelect", "GameStart", "Lobby", "None"] {
            assert!(!can_record(phase, true));
        }
        for phase in ["InProgress", "Reconnect", "EndOfGame"] {
            assert!(can_record(phase, true));
            assert!(!can_record(phase, false));
        }
    }
    #[test]
    fn records_survive_reopening_and_are_separate_from_match_cache() {
        let dir = std::env::temp_dir().join(format!(
            "lol-encounters-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("encounters.sqlite3");
        let peers = vec!["peer".into()];
        {
            let mut db = Connection::open(&path).unwrap();
            initialize(&db).unwrap();
            observe(&mut db, "TENCENT_HN1", "me", Some(1), &peers, true, 10).unwrap();
        }
        let cache = dir.join("cache.sqlite3");
        std::fs::write(&cache, b"disposable").unwrap();
        std::fs::remove_file(cache).unwrap();
        let mut db = Connection::open(&path).unwrap();
        initialize(&db).unwrap();
        let row = observe(&mut db, "TENCENT_HN1", "me", Some(2), &peers, false, 20).unwrap();
        assert_eq!(row[0].previous_games, 1);
        assert_eq!(row[0].last_seen_at, Some(10));
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }
}

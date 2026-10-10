use super::*;
use crate::services::models::ParticipantIdentity;
use crate::services::test_support::{runtime, serve};

thread_local! {
    static CACHE_PATH: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
}

pub(super) fn cache_path_override() -> Option<PathBuf> {
    CACHE_PATH.with(|path| path.borrow().clone())
}

struct TestCache(PathBuf);
impl TestCache {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let id = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "lol-stats-refresh-{}-{}-{id}",
            std::process::id(),
            unix_time_ms()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        CACHE_PATH.with(|path| *path.borrow_mut() = Some(dir.join("cache.sqlite3")));
        Self(dir)
    }
}
impl Drop for TestCache {
    fn drop(&mut self) {
        CACHE_PATH.with(|path| *path.borrow_mut() = None);
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn summoner() -> SummonerInfo {
    SummonerInfo {
        puuid: "test-player".into(),
        ..Default::default()
    }
}
fn game(id: u64) -> Game {
    Game {
        game_id: id,
        game_creation: id as i64 * 1000,
        game_duration: 1200,
        queue_id: 420,
        participant_identities: vec![ParticipantIdentity {
            participant_id: 1,
            player: IdentityPlayer {
                puuid: "test-player".into(),
                ..Default::default()
            },
        }],
        participants: vec![Participant {
            participant_id: 1,
            team_id: 100,
            champion_id: 1,
            ..Default::default()
        }],
        ..Default::default()
    }
}
fn page(games: Vec<Game>) -> String {
    serde_json::json!({"games":{"games":games}}).to_string()
}

#[test]
fn samples_report_mutually_exclusive_exclusions() {
    let mut pve = game(2);
    pve.queue_id = 830;
    pve.game_duration = 10;
    let mut short = game(3);
    short.game_duration = 479;
    let mut missing = game(4);
    missing.participant_identities[0].player.puuid = "other".into();
    let stats = analyze_games(summoner(), 20, vec![game(1), pve, short, missing]);
    assert_eq!(stats.data_status.raw_games, 4);
    assert_eq!(stats.depth_loaded, 1);
    assert_eq!(stats.data_status.excluded_pve, 1);
    assert_eq!(stats.data_status.excluded_short, 1);
    assert_eq!(stats.data_status.excluded_missing_player, 1);
    assert_eq!(stats.data_status.oldest_game_at, Some(1000));
    assert_eq!(stats.data_status.newest_game_at, Some(4000));
}

#[test]
fn excluded_full_page_does_not_end_pagination() {
    let mut first = (1..=50).map(game).collect::<Vec<_>>();
    for g in &mut first {
        g.queue_id = 830;
    }
    let (url, server) = serve(vec![
        (200, page(first)),
        (200, page((51..=60).map(game).collect())),
    ]);
    let stats = runtime()
        .block_on(load_player_stats_with_progress(
            &LcuClient::for_test(url),
            None,
            None,
            summoner(),
            100,
            true,
            false,
            |_, _| true,
        ))
        .unwrap();
    assert_eq!(stats.data_status.raw_games, 60);
    assert_eq!(stats.depth_loaded, 10);
    assert!(!stats.data_status.has_more);
    assert!(!stats.data_status.stale);
    assert!(stats.data_status.last_success_at.is_some());
    let requests = server.join().unwrap();
    assert!(requests[1].contains("begIndex=50"));
}

#[test]
fn partial_failure_is_not_a_successful_sync() {
    let (url, server) = serve(vec![
        (200, page((1..=50).map(game).collect())),
        (503, "{}".into()),
    ]);
    let stats = runtime()
        .block_on(load_player_stats_with_progress(
            &LcuClient::for_test(url),
            None,
            None,
            summoner(),
            100,
            true,
            false,
            |_, _| true,
        ))
        .unwrap();
    assert_eq!(stats.data_status.raw_games, 50);
    assert!(stats.data_status.stale && stats.data_status.partial);
    assert_eq!(stats.data_status.last_success_at, None);
    assert!(stats.data_status.warning.unwrap().contains("503"));
    server.join().unwrap();
}

#[test]
fn repeated_page_is_marked_partial_and_stopped() {
    let body = page((1..=50).map(game).collect());
    let (url, server) = serve(vec![(200, body.clone()), (200, body)]);
    let stats = runtime()
        .block_on(load_player_stats_with_progress(
            &LcuClient::for_test(url),
            None,
            None,
            summoner(),
            100,
            true,
            false,
            |_, _| true,
        ))
        .unwrap();
    assert_eq!(stats.data_status.raw_games, 50);
    assert!(stats.data_status.partial);
    assert!(!stats.data_status.has_more);
    server.join().unwrap();
}

#[test]
fn cancelled_load_does_not_return_a_cached_success() {
    let result = runtime().block_on(load_player_stats_with_progress(
        &LcuClient::for_test("http://127.0.0.1:1".into()),
        None,
        None,
        summoner(),
        20,
        false,
        true,
        |_, _| false,
    ));
    assert!(matches!(
        result,
        Err(crate::services::error::AppError::Cancelled)
    ));
}

#[test]
fn failed_refresh_invalidates_all_depths_without_resetting_clock() {
    let conn = Connection::open_in_memory().unwrap();
    initialize_cache_schema(&conn).unwrap();
    let key = stats_cache_key(None, Some("TENCENT_HN1"), &summoner(), 20);
    for depth in [20, 100] {
        let mut stats = analyze_games(summoner(), depth, vec![game(1)]);
        stats.data_status.last_success_at = Some(123);
        conn.execute(
            "INSERT INTO stats_cache VALUES (?1, ?2, ?3, ?4, 456, ?5)",
            params![
                key.sgp_server_id,
                key.puuid,
                depth as i64,
                CACHE_SCHEMA_VERSION,
                serde_json::to_string(&stats).unwrap()
            ],
        )
        .unwrap();
    }
    invalidate_player_snapshots(&conn, &key, "timeout").unwrap();
    let mut statement = conn
        .prepare("SELECT stored_at_ms, response_json FROM stats_cache")
        .unwrap();
    for row in statement
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .unwrap()
    {
        let (stored_at, json) = row.unwrap();
        let stats: PlayerStatsResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(stored_at, 456);
        assert_eq!(stats.data_status.last_success_at, Some(123));
        assert!(stats.data_status.stale);
        assert_eq!(stats.data_status.warning.as_deref(), Some("timeout"));
    }
}

#[test]
fn legacy_snapshot_has_unknown_sync_time() {
    let stats = analyze_games(summoner(), 20, vec![]);
    let mut json = serde_json::to_value(stats).unwrap();
    json.as_object_mut().unwrap().remove("dataStatus");
    let legacy: PlayerStatsResponse = serde_json::from_value(json).unwrap();
    assert_eq!(legacy.data_status.last_success_at, None);
}

#[test]
fn full_raw_page_can_have_zero_effective_games_and_more_history() {
    let mut games = (1..=20).map(game).collect::<Vec<_>>();
    for g in &mut games {
        g.game_duration = 30;
    }
    let (url, server) = serve(vec![(200, page(games))]);
    let stats = runtime()
        .block_on(load_player_stats_with_progress(
            &LcuClient::for_test(url),
            None,
            None,
            summoner(),
            20,
            true,
            false,
            |_, _| true,
        ))
        .unwrap();
    assert_eq!(stats.depth_loaded, 0);
    assert!(stats.data_status.has_more);
    server.join().unwrap();
}

#[test]
fn forced_refresh_reloads_deep_pages_instead_of_reusing_old_records() {
    let _cache = TestCache::new();
    let key = stats_cache_key(None, Some("TENCENT_TEST_REFRESH"), &summoner(), 100);
    store_db_cached_games(&key, &(1..=100).map(game).collect::<Vec<_>>());
    let first = (51..=100).rev().map(game).collect::<Vec<_>>();
    let second = (1..=50)
        .rev()
        .map(|id| {
            let mut updated = game(id);
            updated.game_duration = 479;
            updated
        })
        .collect::<Vec<_>>();
    let (url, server) = serve(vec![(200, page(first)), (200, page(second))]);
    let stats = runtime()
        .block_on(load_player_stats_with_progress(
            &LcuClient::for_test(url),
            None,
            Some("TENCENT_TEST_REFRESH"),
            summoner(),
            100,
            true,
            true,
            |_, _| true,
        ))
        .unwrap();
    assert_eq!(stats.data_status.raw_games, 100);
    assert_eq!(stats.depth_loaded, 50);
    assert_eq!(stats.data_status.excluded_short, 50);
    assert_eq!(stats.data_status.source, "lcu");
    assert!(!stats.data_status.stale);
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests[1].contains("begIndex=50"));
}

#[test]
fn ordinary_query_can_still_reuse_cached_history() {
    let _cache = TestCache::new();
    let key = stats_cache_key(None, Some("TENCENT_TEST_INCREMENTAL"), &summoner(), 100);
    store_db_cached_games(&key, &(1..=100).map(game).collect::<Vec<_>>());
    let (url, server) = serve(vec![(200, page((51..=100).rev().map(game).collect()))]);
    let stats = runtime()
        .block_on(load_player_stats_with_progress(
            &LcuClient::for_test(url),
            None,
            Some("TENCENT_TEST_INCREMENTAL"),
            summoner(),
            100,
            false,
            true,
            |_, _| true,
        ))
        .unwrap();
    assert_eq!(stats.depth_loaded, 100);
    assert_eq!(stats.data_status.source, "network-cache");
    assert_eq!(server.join().unwrap().len(), 1);
}

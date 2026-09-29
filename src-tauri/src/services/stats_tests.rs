use super::*;
use crate::services::models::ParticipantIdentity;
use crate::services::test_support::{runtime, serve};

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

use super::*;
use crate::services::test_support::{runtime, serve};
use std::sync::atomic::{AtomicUsize, Ordering};

#[test]
fn malformed_history_is_not_misreported_as_empty_or_complete() {
    for body in ["{}", "{\"games\":[{}]}", "{\"games\":[]}"] {
        let (url, server) = serve(vec![(200, body.into())]);
        let sgp = SgpClient {
            http: Client::new(),
            lcu: LcuClient::for_test(url.clone()),
            base_url: url.clone(),
            access_token: "test".into(),
            league_session_token: "test".into(),
            sgp_server_id: "TENCENT_HN1".into(),
        };
        let result = runtime().block_on(async {
            let response = Client::new().get(url).send().await.unwrap();
            sgp.parse_match_history_response(response, "player").await
        });
        if body == "{\"games\":[]}" {
            assert!(result.unwrap().is_empty());
        } else {
            assert!(result.is_err());
        }
        server.join().unwrap();
    }
}

#[test]
fn unauthorized_retries_once_and_preserves_post_body() {
    let (url, server) = serve(vec![(401, "{}".into()), (200, "{}".into())]);
    let refreshes = AtomicUsize::new(0);
    let result = runtime()
        .block_on(send_with_refresh(
            Client::new().post(url).json(&vec!["player"]),
            "old-test",
            || async {
                refreshes.fetch_add(1, Ordering::SeqCst);
                Ok("new-test".into())
            },
        ))
        .unwrap();
    assert_eq!(result.status(), StatusCode::OK);
    assert_eq!(refreshes.load(Ordering::SeqCst), 1);
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests[0]
        .to_lowercase()
        .contains("authorization: bearer old-test"));
    assert!(requests[1]
        .to_lowercase()
        .contains("authorization: bearer new-test"));
    assert!(requests
        .iter()
        .all(|r| r.starts_with("POST ") && r.ends_with("[\"player\"]")));
}

#[test]
fn repeated_unauthorized_stops_with_relogin_message() {
    let (url, server) = serve(vec![(401, "{}".into()), (401, "{}".into())]);
    let result = runtime().block_on(send_with_refresh(
        Client::new().get(url),
        "old-test",
        || async { Ok("new-test".into()) },
    ));
    assert!(result.unwrap_err().to_string().contains("重新登录"));
    assert_eq!(server.join().unwrap().len(), 2);
}

#[test]
fn forbidden_is_not_treated_as_auth_expiry_or_confirmed_privacy() {
    let (url, server) = serve(vec![(403, "{}".into())]);
    let result = runtime().block_on(send_with_refresh(
        Client::new().get(url),
        "old-test",
        || async { panic!("403 must not refresh") },
    ));
    assert!(result.unwrap_err().to_string().contains("无法据此确认"));
    assert_eq!(server.join().unwrap().len(), 1);
}

#[test]
fn concurrent_requests_share_token_refresh() {
    let (url, server) = serve(vec![(200, "{\"accessToken\":\"new-test\"}".into())]);
    let lcu = LcuClient::for_test(url);
    runtime().block_on(async {
        let (a, b) = futures::join!(
            lcu.refresh_sgp_token("old-test", false),
            lcu.refresh_sgp_token("old-test", false)
        );
        assert_eq!(a.unwrap(), "new-test");
        assert_eq!(b.unwrap(), "new-test");
    });
    assert_eq!(server.join().unwrap().len(), 1);
}

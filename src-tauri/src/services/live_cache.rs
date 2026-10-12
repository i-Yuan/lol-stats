use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
/// One bounded live session only. Request IDs never enter diagnostics.
pub struct SessionReuse<T> {
    scope: String,
    generation: u64,
    entries: HashMap<String, (Instant, T)>,
}
impl<T: Clone> Default for SessionReuse<T> {
    fn default() -> Self {
        Self {
            scope: String::new(),
            generation: 0,
            entries: HashMap::new(),
        }
    }
}
impl<T: Clone> SessionReuse<T> {
    pub fn select(&mut self, scope: String, force: bool) -> u64 {
        if force || self.scope != scope {
            self.scope = scope;
            self.generation += 1;
            self.entries.clear();
        }
        self.generation
    }
    pub fn current(&self, generation: u64) -> bool {
        self.generation == generation
    }
    pub fn get(&self, generation: u64, id: &str, now: Instant) -> Option<T> {
        if !self.current(generation) {
            return None;
        }
        self.entries
            .get(id)
            .filter(|(at, _)| now.saturating_duration_since(*at) < Duration::from_secs(120))
            .map(|(_, v)| v.clone())
    }
    pub fn put(&mut self, generation: u64, id: String, value: T, now: Instant) {
        if self.current(generation) && self.entries.len() < 32 {
            self.entries.insert(id, (now, value));
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_session_reuses_but_game_account_and_roster_changes_invalidate() {
        let mut c = SessionReuse::default();
        let now = Instant::now();
        let g = c.select("account/server/game/roster".into(), false);
        c.put(g, "p".into(), 42, now);
        assert_eq!(c.select("account/server/game/roster".into(), false), g);
        assert_eq!(c.get(g, "p", now), Some(42));
        let next = c.select("different".into(), false);
        assert_ne!(g, next);
        assert_eq!(c.get(next, "p", now), None);
        c.put(g, "p".into(), 99, now);
        assert_eq!(c.get(next, "p", now), None);
    }
    #[test]
    fn ttl_and_force_refresh_reject_old_entries() {
        let mut c = SessionReuse::default();
        let now = Instant::now();
        let g = c.select("game".into(), false);
        c.put(g, "p".into(), 42, now);
        assert_eq!(c.get(g, "p", now + Duration::from_secs(119)), Some(42));
        assert_eq!(c.get(g, "p", now + Duration::from_secs(120)), None);
        let g = c.select("game".into(), true);
        assert_eq!(c.get(g, "p", now), None);
    }
}

/// Completion order, not roster order: a slow first player cannot hold later results.
pub fn concurrent<I, F>(jobs: I, limit: usize) -> impl futures::Stream<Item = F::Output>
where
    I: IntoIterator<Item = F>,
    F: std::future::Future,
{
    use futures::StreamExt;
    futures::stream::iter(jobs).buffer_unordered(limit.max(1))
}
#[cfg(test)]
mod scheduler_tests {
    use super::*;
    use futures::StreamExt;
    #[test]
    fn fast_later_players_are_returned_before_slow_first_player() {
        crate::services::test_support::runtime().block_on(async {
            let (send, wait) = futures::channel::oneshot::channel::<()>();
            let jobs: Vec<std::pin::Pin<Box<dyn std::future::Future<Output = u8>>>> = vec![
                Box::pin(async move {
                    wait.await.unwrap();
                    1
                }),
                Box::pin(async { 2 }),
            ];
            let mut stream = concurrent(jobs, 4);
            assert_eq!(stream.next().await, Some(2));
            send.send(()).unwrap();
            assert_eq!(stream.next().await, Some(1));
        });
    }
    #[test]
    fn shared_batch_never_exceeds_four_players() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        crate::services::test_support::runtime().block_on(async {
            let active = Arc::new(AtomicUsize::new(0));
            let peak = Arc::new(AtomicUsize::new(0));
            let jobs = (0..10).map(|id| {
                let active = active.clone();
                let peak = peak.clone();
                async move {
                    let n = active.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(n, Ordering::SeqCst);
                    tokio::time::sleep(Duration::from_millis(1)).await;
                    active.fetch_sub(1, Ordering::SeqCst);
                    id
                }
            });
            let results: Vec<_> = concurrent(jobs, 4).collect().await;
            assert_eq!(results.len(), 10);
            assert_eq!(peak.load(Ordering::SeqCst), 4);
        });
    }
}

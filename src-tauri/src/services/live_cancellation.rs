use futures::future::{AbortHandle, Abortable};
use std::{collections::HashMap, future::Future, sync::Mutex, time::{Duration, Instant}};

#[derive(Default)]
struct State {
    active: HashMap<String, AbortHandle>,
    early: HashMap<String, Instant>,
}
#[derive(Default)]
pub struct LiveCancellation { state: Mutex<State> }
impl LiveCancellation {
    pub fn cancel(&self, id: &str) {
        if id.is_empty() || id.len() > 128 { return; }
        if let Ok(mut state) = self.state.lock() {
            if let Some(handle) = state.active.get(id) { handle.abort(); return; }
            // IPC cancellation can arrive before the corresponding command starts.
            let now = Instant::now();
            state.early.retain(|_, at| now.duration_since(*at) < Duration::from_secs(300));
            if state.early.len() >= 256 {
                if let Some(oldest) = state.early.iter().min_by_key(|(_, at)| **at).map(|(key, _)| key.clone()) { state.early.remove(&oldest); }
            }
            state.early.insert(id.to_owned(), now);
        }
    }
    pub async fn run<T>(&self, id: &str, work: impl Future<Output = Result<T, String>>) -> Result<T, String> {
        let (handle, registration) = AbortHandle::new_pair();
        {
            let mut state = self.state.lock().map_err(|_| "实时取消状态不可用")?;
            if state.active.contains_key(id) { return Err("重复的实时请求标识".into()); }
            if state.early.remove(id).is_some_and(|at| at.elapsed() < Duration::from_secs(300)) { handle.abort(); }
            state.active.insert(id.to_owned(), handle);
        }
        let _cleanup = Cleanup { registry: self, id };
        // Dropping the whole future also drops buffered player futures, in-flight
        // reqwest waits, pagination and any held enrichment lock. No detached jobs.
        Abortable::new(work, registration).await.map_err(|_| "实时查询已取消".to_string())?
    }
}
struct Cleanup<'a> { registry: &'a LiveCancellation, id: &'a str }
impl Drop for Cleanup<'_> {
    fn drop(&mut self) { if let Ok(mut state) = self.registry.state.lock() { state.active.remove(self.id); } }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
    struct Dropped(Arc<AtomicBool>);
    impl Drop for Dropped { fn drop(&mut self) { self.0.store(true, Ordering::SeqCst); } }
    #[test]
    fn cancellation_before_registration_never_polls_work() {
        let registry = LiveCancellation::default(); registry.cancel("early");
        let result = futures::executor::block_on(registry.run("early", async { panic!("must not start network"); #[allow(unreachable_code)] Ok::<_, String>(()) }));
        assert!(result.unwrap_err().contains("取消"));
        assert!(registry.state.lock().unwrap().active.is_empty());
    }
    #[test]
    fn cancellation_drops_running_work_and_releases_budget() {
        futures::executor::block_on(async {
            let registry = LiveCancellation::default();
            let budget = tokio::sync::Mutex::new(());
            let dropped = Arc::new(AtomicBool::new(false));
            let work = async { let _lock = budget.lock().await; let _probe = Dropped(dropped.clone()); futures::future::pending::<Result<(), String>>().await };
            let mut running = Box::pin(registry.run("running", work));
            assert!(futures::poll!(running.as_mut()).is_pending());
            assert!(budget.try_lock().is_err());
            registry.cancel("running");
            assert!(running.await.is_err());
            assert!(dropped.load(Ordering::SeqCst)); assert!(budget.try_lock().is_ok());
            assert!(registry.state.lock().unwrap().active.is_empty());
        });
    }
    #[test]
    fn queued_cancellation_does_not_wait_for_other_batch() {
        futures::executor::block_on(async {
            let registry = LiveCancellation::default(); let budget = tokio::sync::Mutex::new(()); let _held = budget.lock().await;
            let mut queued = Box::pin(registry.run("queued", async { let _lock = budget.lock().await; Ok::<_, String>(()) }));
            assert!(futures::poll!(queued.as_mut()).is_pending()); registry.cancel("queued"); assert!(queued.await.is_err());
        });
    }
    #[test]
    fn cancelled_old_request_does_not_cancel_new_request() {
        let registry = LiveCancellation::default(); registry.cancel("old");
        assert_eq!(futures::executor::block_on(registry.run("new", async { Ok::<_, String>(42) })).unwrap(), 42);
        for n in 0..300 { registry.cancel(&format!("late-{n}")); }
        assert!(registry.state.lock().unwrap().early.len() <= 256);
    }
}

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::Notify;

/// Shared, concurrency-safe handle that lets the UI pause, resume or
/// cancel an active scan. Designed to be cheaply cloned (Arc-based).
///
/// # Lifecycle
///
/// The scan command calls `reset()` before starting, then checks
/// `is_cancelled()` and `wait_if_paused()` inside the scan loop.
/// Dedicated commands (`pause_scan`, `resume_scan`, `cancel_scan`)
/// toggle the flags from the UI.
#[derive(Debug, Clone)]
pub struct ScanController {
    cancel: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    resume_notify: Arc<Notify>,
}

impl ScanController {
    pub fn new() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
            paused: Arc::new(AtomicBool::new(false)),
            resume_notify: Arc::new(Notify::new()),
        }
    }

    /// Prepare for a fresh scan — clear both flags.
    pub fn reset(&self) {
        self.cancel.store(false, Ordering::SeqCst);
        self.paused.store(false, Ordering::SeqCst);
    }

    // ── Commands (called from Tauri IPC) ─────────────────────────

    /// Cancel the running scan. The scanner will exit the walk as soon
    /// as it checks the flag (next file boundary).
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        // Also wake up a paused scan so it can notice the cancellation.
        self.resume_notify.notify_waiters();
    }

    /// Pause the running scan. The scanner suspends inside
    /// `wait_if_paused()` until resumed or cancelled.
    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    /// Resume a paused scan.
    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
        self.resume_notify.notify_waiters();
    }

    // ── Queries (called from the scanner loop) ───────────────────

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    /// Block the current async task until the scan is resumed.
    /// Returns `true` if scanning should continue,
    /// returns `false` if the scan was cancelled while paused.
    pub async fn wait_if_paused(&self) -> bool {
        loop {
            if self.is_cancelled() {
                return false;
            }
            if !self.is_paused() {
                return true;
            }
            self.resume_notify.notified().await;
        }
    }
}

impl Default for ScanController {
    fn default() -> Self {
        Self::new()
    }
}

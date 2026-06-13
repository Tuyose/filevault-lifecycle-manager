use blake3::Hasher;

/// Streaming BLAKE3 hasher. Chosen for:
///   * very high throughput on modern CPUs
///   * Merkle-tree mode (planned) for fast partial-file verification
///   * small, audited Rust core
///
/// The real implementation will wrap a tokio file reader and feed
/// chunks asynchronously. This stub exists so other modules can depend
/// on the service without pulling in the full hashing pipeline yet.
pub struct HashService;

impl HashService {
    pub fn new() -> Self {
        Self
    }

    /// Hash a small in-memory blob. Used by tests and as a sanity
    /// check that the dependency is wired up correctly.
    pub fn hash_bytes(&self, bytes: &[u8]) -> String {
        let mut hasher = Hasher::new();
        hasher.update(bytes);
        let hash = hasher.finalize();
        hash.to_hex().to_string()
    }
}

impl Default for HashService {
    fn default() -> Self {
        Self::new()
    }
}

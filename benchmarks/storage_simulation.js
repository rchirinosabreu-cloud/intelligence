
/**
 * Storage Performance Benchmark Simulation
 *
 * This script simulates the behavior of the ChatInterface component during a message stream.
 * It compares the "Sync" approach (current) vs the "Debounce" approach (target).
 *
 * Scenario:
 * - A message stream consisting of 50 chunks.
 * - Chunks arrive every 20ms.
 * - Total stream duration: ~1000ms.
 */

const TOTAL_CHUNKS = 50;
const CHUNK_DELAY_MS = 20;
const DEBOUNCE_DELAY_MS = 1000;

function runBenchmark() {
  console.log("⚡ Starting Storage Performance Benchmark\n");
  console.log(`Parameters:`);
  console.log(`- Total Updates (Chunks): ${TOTAL_CHUNKS}`);
  console.log(`- Delay between updates: ${CHUNK_DELAY_MS}ms`);
  console.log(`- Debounce Time: ${DEBOUNCE_DELAY_MS}ms\n`);

  runSyncSimulation().then(() => {
    runDebounceSimulation();
  });
}

/**
 * Simulates the current behavior:
 * useEffect(() => { save() }, [chats])
 */
function runSyncSimulation() {
  return new Promise((resolve) => {
    let writes = 0;
    let updates = 0;

    console.log("--- Baseline: Synchronous Save ---");

    // Simulation loop
    const interval = setInterval(() => {
      updates++;

      // EFFECT: React runs the effect immediately after render
      writes++;

      if (updates >= TOTAL_CHUNKS) {
        clearInterval(interval);
        console.log(`[Baseline] Total Storage Writes: ${writes}`);
        console.log(`[Baseline] Efficiency: 1 write per update (Poor)\n`);
        resolve();
      }
    }, CHUNK_DELAY_MS);
  });
}

/**
 * Simulates the optimized behavior:
 * useEffect(() => {
 *   const t = setTimeout(save, 1000);
 *   return () => clearTimeout(t);
 * }, [chats])
 */
function runDebounceSimulation() {
  let writes = 0;
  let updates = 0;
  let timeoutId = null;

  console.log("--- Optimized: Debounced Save ---");

  const interval = setInterval(() => {
    updates++;

    // EFFECT: React cleans up previous effect and starts new one

    // Cleanup phase
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Effect phase
    timeoutId = setTimeout(() => {
      writes++;
      console.log(`[Optimized] Write triggered at update #${updates}`);
    }, DEBOUNCE_DELAY_MS);

    if (updates >= TOTAL_CHUNKS) {
      clearInterval(interval);

      // Wait to see if the final write happens
      setTimeout(() => {
         console.log(`[Optimized] Total Storage Writes: ${writes}`);
         console.log(`[Optimized] Efficiency: ~${Math.round((writes / TOTAL_CHUNKS) * 100)}% of updates trigger write (Great)`);
         if (writes === 1) {
             console.log("✅ SUCCESS: Only 1 write occurred for the entire stream.");
         } else {
             console.log("❌ FAILURE: More writes than expected.");
         }
      }, DEBOUNCE_DELAY_MS + 100);
    }
  }, CHUNK_DELAY_MS);
}

runBenchmark();

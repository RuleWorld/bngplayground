## 2024-05-24 - [WorkerPool Task Distribution Bottleneck]
**Learning:** Found an O(N) linear array search in `WorkerPool.ts` `processQueue` where it scanned the entire pending tasks array to find an unassigned task. Also, it only assigned one task per call, failing to maximize parallel throughput when multiple workers were idle.
**Action:** Use a `Map<string, PendingTask>` for O(1) lookups by ID and a separate `taskQueue: string[]` for FIFO task distribution. Loop through all workers in `processQueue` to assign tasks to all available workers in a single call.

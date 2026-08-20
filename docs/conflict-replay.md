# Conflict replay checklist

A conflict replay test should start from the same base state, apply operations in different arrival orders, and compare the resulting materialized state. The test should also record whether the operation log remains replayable after compaction.

For debugging, retain the operation identifiers and causal metadata in test fixtures. Do not rely on wall-clock order as a substitute for causality when reproducing an offline merge.

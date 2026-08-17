# Performance budgets

These budgets are the canonical targets for interactive SyntaxPad behavior. Measurements and review
outcomes belong in [records.md](records.md); procedures for collecting them belong in
[verification.md](verification.md).

| Interaction                    | Target | Hard limit | Measurement                              |
| ------------------------------ | -----: | ---------: | ---------------------------------------- |
| Cursor to diagram highlight    |  50 ms |     100 ms | Extension timestamp to Webview paint ack |
| Diagram click to editor reveal |  50 ms |     100 ms | Click timestamp to selection event       |
| Keystroke to diagnostics       | 300 ms |        1 s | Document change to publish               |
| Refactoring application        | 200 ms |        1 s | Command start to edit applied            |

The automated release checks use the same end-to-end update budget as an early warning for core
workloads:

| Workload                                           | Target | Hard limit | Measurement          |
| -------------------------------------------------- | -----: | ---------: | -------------------- |
| Generated 10,000-line grammar parse and model      | 300 ms |        1 s | `npm run benchmark`  |
| Pinned CRuby grammar parse and model               | 300 ms |        1 s | `npm run benchmark`  |
| CRuby model plus one railroad and distance-1 graph | 300 ms |        1 s | Release verification |

The **SyntaxPad Metrics** output channel records cursor, navigation, and refactoring latency
locally. The SyntaxPad language-server output records diagnostics latency. A result above a hard
limit fails the corresponding gate; results between the target and hard limit require review before
acceptance.

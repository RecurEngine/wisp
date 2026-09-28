# Agent reliability tests

From the 1.0.4 development baseline onward, changes to agent execution, recovery,
permissions and vault writes should follow one behavioral test at a time:
reproduce a failure, implement the smallest correction, then run related tests.
Mock external boundaries (model responses, Obsidian storage/DOM), not the runtime
or session store under test.

## Commands

```sh
npm ci
npm run typecheck
npm run test
npm run build
```

Targeted examples:

```sh
npm run test -- tests/AgentRecovery.test.ts tests/WispView.test.ts
npm run test -- tests/VaultToolRegistry.test.ts tests/ToolApprovalModal.test.ts
```

## Coverage by behavior

| Suite | Contract |
| --- | --- |
| LiteAgentRuntime | Tool loop, approval, configurable/unlimited rounds, cancellation during approval |
| AgentRecovery | Persisted success before network failure, explicit continuation, duplicate write suppression, uncertain outcomes, failed checkpoint writes, stopping a batch |
| SessionStore | Session isolation, legacy history, tool results, complete interrupted tool-call pairs, cleanup |
| SettingsPersistence | Concurrent settings saves do not erase execution checkpoints |
| VaultToolRegistry | Atomic partial edits, full-replacement conflicts, cancellation before commit |
| ToolApprovalModal | Stop closes pending approval and denies the write |
| WispView | Actual send/stop/continue buttons, restored operation records, busy state and closing during an in-flight write |

The view tests run in happy-dom with minimal Obsidian API shims. They use the real
runtime and session store. They do not substitute for testing Obsidian itself.

## Recovery contract

- Save the requested tool calls before execution, and mark an operation as running
  durably before invoking it. Save each returned result before starting the next tool.
- Resume only when the user selects Continue task. Supply saved tool results to the
  model; do not replay old tool calls. Identical successful writes from the recovered
  run return their recorded result rather than writing again (argument key order is ignored).
- A crash between a write and its result checkpoint cannot be made transactional
  across Obsidian's vault and plugin data. Such writes stay outcome-unknown. Disable
  continuation, show the arguments/result, and require file inspection and a new request.
- Deduplication is scoped to exact tool name/arguments in the recovered run. It cannot
  identify semantically equivalent edits with different arguments or new requests.
- Stop does not roll back completed operations. Wait for any already-started vault
  operation and its checkpoint to settle before allowing another submission/closing.
- Whole-note replacement requires expectedContent from a read. Compare it inside
  Vault.process; partial edits also run inside Vault.process against current content.
- Execution records contain tool inputs and outputs (including note text) in plugin
  data. Clearing a session's history also clears its operation records.

## Required device smoke test before release

Use a disposable vault on both Obsidian Desktop and Android:

1. Read and edit several notes; inspect success and failure details in Operation record.
2. Disconnect networking after a successful write. Reopen Wisp and continue; confirm
   the completed append appears only once and remaining work can finish.
3. Change a note manually after the model reads it but before approving a full
   replacement. Confirm the edit reports a conflict and preserves the manual change.
4. Stop during approval and during a longer search/write. Confirm the dialog closes,
   no subsequent tool starts, and the interface stays busy until the current operation settles.
5. Close/reopen the view and plugin with an interrupted task. Verify persisted results
   and outcome-unknown handling; never automatically repeat an uncertain write.
6. Clear session history, reopen, and verify both messages and operation records are gone.

Automated tests cover the logic above. Actual Android lifecycle termination, sync
providers, filesystem durability and visual layout still require these device checks.

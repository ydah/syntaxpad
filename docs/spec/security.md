# Security model

This document is the canonical source for SyntaxPad's external-process and Webview safety model. The
parser and language service do not execute grammar actions. Local parser-generator execution is an
explicit trusted-workspace operation with a user-configurable executable and arguments.

## Workspace Trust and configuration

The [extension manifest](../../packages/syntaxpad-vscode/package.json) declares limited support for
untrusted workspaces. Parsing, language features, and visualization remain available, while the
conflict command has an `isWorkspaceTrusted` enablement condition and checks `workspace.isTrusted`
again when invoked.

The manifest marks executable, argument, timeout, and output-limit settings as restricted in
untrusted workspaces. At execution time, Zod validates the tool kind, executable and argument
lengths, NUL exclusion, argument count, timeout range, and capture-limit range.

## External-process controls

- Before the first run of a configuration signature, a modal confirmation displays the primary and
  every possible fallback command. Declining performs no execution.
- The executable is spawned directly with an argument array and `shell: false`; SyntaxPad does not
  compose a shell command or send stdin.
- Source and outputs use a new temporary directory. `input.y` is created exclusively with mode
  `0600`, and the directory is removed after success or failure.
- Stdout, stderr, and report reads are capped. Truncation is carried into the normalized report.
- Cancellation and timeout request termination. All tool exceptions become failed report values so
  parsing and visualization continue.

Invocation formats, fallback behavior, result publication, and stale-run limitations are specified
in [external parser-generator integration](external-tools.md).

## Webview controls

The grammar view allows scripts only from the bundled extension. Its CSP defaults to `none`, permits
styles and images only from the Webview source (plus `data:` images), and permits the bundled script
with a fresh nonce. `localResourceRoots` is limited to the extension's bundled `dist` directory; no
remote font or image is loaded.

Host-to-view and view-to-host messages are strict discriminated Zod schemas. Unexpected properties,
invalid variants, negative offsets, and values outside declared bounds are rejected before dispatch.
Ordinary labels, status, conflicts, and report messages are inserted with DOM `textContent`;
generated SVG escapes model text before the Webview assigns the trusted renderer output with
`innerHTML`.

## Trust boundaries and limitations

- Confirmation is stored in `ExtensionContext.globalState` under a hash of the tool configuration.
  It is shared across workspaces using the same extension profile, not scoped to the workspace or
  document. Changing the signed configuration prompts again; moving the same configuration to a
  different workspace does not.
- Workspace Trust and confirmation do not sandbox the selected executable. After consent, the
  configured executable and user-supplied arguments run as a local process with the extension host's
  operating-system permissions.
- Timeout/cancellation do not hard-kill a process tree or escalate after a failed termination
  request. A child or descendant can survive the requested timeout.
- Capture and report reads are bounded, but files are limited only when they are read. SyntaxPad
  does not cap a report, generated parser file, or total temporary-directory growth while the tool
  is running.
- Temporary-file permissions protect the copied input from other ordinary users on platforms that
  honor the requested modes; they do not isolate it from the invoked generator or processes with
  equivalent/higher privileges.
- Runtime message validation establishes shape, not semantic authorization. The host relies on the
  nonce CSP and bundled script as the sender boundary; the navigate message schema itself does not
  prove that its URI equals the currently cached document.
- External result publication has stale-source and out-of-order parallel-run races. See
  [current external-tool limitations](external-tools.md#current-limitations).

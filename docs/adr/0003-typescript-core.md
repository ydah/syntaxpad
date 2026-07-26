# ADR 0003: TypeScript core

- Status: Accepted after M0 measurement
- Date: 2026-07-26

## Decision

Implement the initial core in strict TypeScript.

## Rationale

One language across core, LSP, extension, and Webview shortens feedback loops and avoids a Wasm
boundary before performance evidence exists. Readonly public models and runtime validation protect
the boundaries.

## Trigger to reconsider

Move only measured parser hotspots to Rust/Wasm if the M0/M5 performance gate cannot be met after
algorithmic profiling.

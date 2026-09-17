# Dispatch visual design

## Concept

An operations desk for following a webhook from intake to receipt. Ink navy surfaces, warm coral actions, mint successful deliveries and amber pending work. A restrained grid gives the delivery lane an instrument-panel feeling. All activity is explicitly a browser simulation; the separately runnable HTTP service is described in documentation.

## Hierarchy and layout

At desktop widths: narrow persistent brand/navigation rail; large workspace with a title, simulation badge and export/reset actions. A slim clock/control strip precedes four scenario cards. An illustrated delivery lane connects producer, retry queue and receiver. Below it, a chronological event ledger (left, approximately two-thirds) sits beside a selected-event inspector. A bottom policy note explains the four-attempt limit. Counts are derived from current events only.

System sans-serif headings and body use compact but readable spacing; system monospace gives event identifiers, JSON, times and HTTP statuses a distinct texture. Body text has sufficient contrast against the dark surface, focus indicators are coral outlines, and status combines words with shape/color. No external font or bitmap is required.

## Primary journey

Load a populated sample containing all four outcomes. Advance the virtual clock to see the next attempt become due, select an event to inspect its payload and chronological attempts, and duplicate it to see the original receipt reused. Change its payload to demonstrate a conflict. Seed another scenario or enter a custom ID/JSON payload; export the complete simulation as JSON. Auto-run advances exactly one virtual second per tick; pausing stops future ticks. Reset produces an empty session at 00:00.000.

## States and boundaries

Invalid IDs and JSON appear next to the labelled composer with a live error announcement. The UI explains the 100-event browser limit and 32KiB request bound. Empty ledger contains a clear seed action. No loading fiction or connected-server badge is shown. Controls disable only when their action has no valid target. A noninterrupting live status reports successful actions. Session data stays in memory and refresh starts a new deterministic sample; there is no hidden or corruptible persistence layer.

## Phone, zoom and motion

At 700px the rail becomes a compact top bar, actions wrap, scenario cards use two columns, lane nodes stack, and the ledger/inspector become a single column. At 380px cards become a single column. Layouts use min-width:0 and wrapping code, permitting 320px and enlarged text without horizontal page overflow. Tables become labelled row cards on phones. All controls are keyboard native and navigation has a skip link. Reduced-motion disables decorative pulse and transition; no task depends on animation.

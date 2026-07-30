# Data model

- laptops
  - 0..\* stickers
- stickers
  - 0..1 annotation
  - embedding
- annotations

## Use case

Given a new set of stickers, retrieve similar stickers, each with their annotation, grouped by their laptop.

## Implementation notes

- user node js built-in sqlite database
- add vector extension for kNN retrieval
- the indexer is fault tolerant, saving work in progress.
- if restarting, skipping already processed stickers and annotations.

## Interaction

- Expose itself as a REST API, covering basic CRUD operations for laptops, stickers, and annotations.

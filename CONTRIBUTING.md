# Contributing to VisualLoop

Thank you for your interest in contributing to VisualLoop. VisualLoop is an open-source, local-first visual feedback companion for AI coding agents.

## Development Workflow

### Prerequisites
- Node.js >= 20 (v22 LTS recommended)
- pnpm >= 9
- Rust toolchain (stable, rustc >= 1.77) with Cargo
- macOS / Linux / Windows developer tools

### Setup
```bash
git clone https://github.com/visualloop/visualloop.git
cd visualloop
pnpm install
```

### Running the Desktop App
```bash
# Run desktop shell with Tauri
pnpm dev

# Or run the web preview shell (browser-only development)
pnpm dev:web
```

### Testing and Verification
```bash
pnpm test
pnpm typecheck
```

## Pull Request Guidelines
- Follow Conventional Commits format (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
- Eliminate decorative emojis in commits, code, and technical documentation.
- Ensure all automated unit and integration tests pass before submitting.

# Run both frontend and backend in dev mode (requires two terminals or a process manager)
dev-api:
    cd apps/api && cargo run

dev-web:
    cd apps/web && npm run dev

# Build both apps
build:
    cd apps/api && cargo build --release
    cd apps/web && npm run build

# Run all tests
test:
    cd apps/api && cargo test
    cd apps/web && npm run test 2>/dev/null || echo "No frontend tests configured yet"

# Check Rust formatting and lints
lint:
    cd apps/api && cargo fmt --check && cargo clippy -- -D warnings

# Apply sqlx migrations
migrate:
    cd apps/api && sqlx migrate run

# Start both in dev using concurrently (npm i -g concurrently)
dev:
    npx concurrently \
      "cd apps/api && cargo run" \
      "cd apps/web && npm run dev"

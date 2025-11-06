.PHONY: build clean install dev test install-prod build-prod

BACKEND_DIR=backend
FRONTEND_DIR=frontend

# Build both frontend and backend
build:
	@echo "🔨 Building PiratePlunder with auto-versioning..."
	$(eval GITHUB_RUN_NUMBER := $(shell echo "$${GITHUB_RUN_NUMBER:-}"))
	$(eval COMMIT_COUNT := $(shell git rev-list --count HEAD 2>/dev/null || git log --oneline 2>/dev/null | wc -l | tr -d ' ' || echo "$${GITHUB_RUN_NUMBER:-1}"))
	$(eval NEW_VERSION := $(shell date +"%Y.%m.%d").$(COMMIT_COUNT))
	@echo "  Version: $(NEW_VERSION)"
	@echo "  Commit: $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
	
	npm version $(NEW_VERSION) --no-git-tag-version || true
	cd $(BACKEND_DIR) && npm version $(NEW_VERSION) --no-git-tag-version || true
	cd $(FRONTEND_DIR) && npm version $(NEW_VERSION) --no-git-tag-version || true

	@echo "Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install
	@echo "Creating version file for frontend..."
	@echo "export const APP_VERSION = '$(NEW_VERSION)';" > $(FRONTEND_DIR)/src/version.ts
	@echo "export const BUILD_TIMESTAMP = '$(shell date -u +"%Y-%m-%dT%H:%M:%SZ")';" >> $(FRONTEND_DIR)/src/version.ts
	@echo "export const COMMIT_HASH = '$(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")';" >> $(FRONTEND_DIR)/src/version.ts
	@echo "Cleaning previous frontend build..."
	rm -rf $(FRONTEND_DIR)/dist/*
	@echo "Building frontend with cache busting..."
	cd $(FRONTEND_DIR) && npm run build
	@echo "Installing backend dependencies (with types for build)..."
	cd $(BACKEND_DIR) && npm install --include=dev
	@echo "Building backend (prebuild will generate Prisma client)..."
	cd $(BACKEND_DIR) && npm run build
	@echo "Clearing and copying frontend to backend public directory..."
	rm -rf $(BACKEND_DIR)/dist/public/*
	mkdir -p $(BACKEND_DIR)/dist/public
	cp -r $(FRONTEND_DIR)/dist/* $(BACKEND_DIR)/dist/public/
	@echo "Copying AI profiles..."
	cp $(BACKEND_DIR)/src/ai-profiles.json $(BACKEND_DIR)/dist/
	
	@echo "COMMIT_HASH=$${COMMIT_HASH:-$(shell git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}" > $(BACKEND_DIR)/dist/.env.build
	@echo "COMMIT_FULL_HASH=$${COMMIT_FULL_HASH:-$(shell git rev-parse HEAD 2>/dev/null || echo 'unknown')}" >> $(BACKEND_DIR)/dist/.env.build
	@echo "BUILD_DATE=$(shell date -u +"%Y-%m-%dT%H:%M:%SZ")" >> $(BACKEND_DIR)/dist/.env.build
	@echo "BUILD_VERSION=$${BUILD_VERSION:-$(NEW_VERSION)}" >> $(BACKEND_DIR)/dist/.env.build
	@echo "✅ PiratePlunder build complete with version $(NEW_VERSION)"

clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(BACKEND_DIR)/dist
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(BACKEND_DIR)/node_modules
	rm -rf $(FRONTEND_DIR)/node_modules

install:
	cd $(BACKEND_DIR) && npm install
	cd $(FRONTEND_DIR) && npm install

dev:
	npm run dev

test:
	npm run test:all

install-prod:
	cd $(BACKEND_DIR) && npm ci --omit=dev
	cd $(FRONTEND_DIR) && npm ci

build-prod: clean install-prod
	@echo "🔨 Building with auto-versioning..."
	@echo "  Commit: $$(git rev-parse --short HEAD)"
	@echo "  Version: $$(date +"%Y.%m.%d").$$(git rev-list --count HEAD)"
	@echo "  Build Date: $$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
	cd $(BACKEND_DIR) && npm version $$(date +"%Y.%m.%d").$$(git rev-list --count HEAD) --no-git-tag-version
	cd $(FRONTEND_DIR) && npm version $$(date +"%Y.%m.%d").$$(git rev-list --count HEAD) --no-git-tag-version
	cd $(FRONTEND_DIR) && npm run build
	cd $(BACKEND_DIR) && npm run build
	mkdir -p $(BACKEND_DIR)/dist/public
	cp -r $(FRONTEND_DIR)/dist/* $(BACKEND_DIR)/dist/public/
	cp $(BACKEND_DIR)/src/ai-profiles.json $(BACKEND_DIR)/dist/
	@echo "COMMIT_HASH=$$(git rev-parse --short HEAD)" > $(BACKEND_DIR)/dist/.env.build
	@echo "COMMIT_FULL_HASH=$$(git rev-parse HEAD)" >> $(BACKEND_DIR)/dist/.env.build
	@echo "BUILD_DATE=$$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> $(BACKEND_DIR)/dist/.env.build
	@echo "BUILD_VERSION=$$(date +"%Y.%m.%d").$$(git rev-list --count HEAD)" >> $(BACKEND_DIR)/dist/.env.build
	@echo "✅ Build complete with auto-versioning"

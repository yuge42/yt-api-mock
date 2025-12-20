.PHONY: help docker-test docker-test-auth docker-build docker-clean test test-auth test-core clean

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

docker-test: ## Run core tests using Docker Compose
	docker compose up --build --abort-on-container-exit --exit-code-from tests
	docker compose down

docker-test-auth: ## Run authorization tests using Docker Compose
	docker compose -f docker-compose.yml -f docker-compose.auth.yml up --build --abort-on-container-exit --exit-code-from tests
	docker compose down

docker-build: ## Build Docker images
	docker compose build

docker-clean: ## Clean up Docker resources
	docker compose down -v
	docker system prune -f

test: ## Run all tests locally (requires Gauge and npm to be installed)
	npm test

test-core: ## Run core tests locally
	gauge run --tags "core" specs/

test-auth: ## Run auth tests locally (requires REQUIRE_AUTH=true)
	gauge run --tags "auth" specs/

clean: ## Clean local test artifacts
	rm -rf reports logs .gauge node_modules proto-gen

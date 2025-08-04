# Browser Notes - Chrome Extension Makefile

.PHONY: help install build test clean icons dev package lint

# Default target
help:
	@echo "Browser Notes - Chrome Extension Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  install     - Install dependencies"
	@echo "  build       - Build TypeScript files"
	@echo "  icons       - Generate extension icons"
	@echo "  test        - Run unit tests"
	@echo "  test-watch  - Run tests in watch mode"
	@echo "  test-cov    - Run tests with coverage report"
	@echo "  lint        - Run linting (if configured)"
	@echo "  clean       - Clean build artifacts"
	@echo "  dev         - Development build (build + icons)"
	@echo "  package     - Create extension package for distribution"
	@echo "  setup       - Initial setup (install + build + icons)"
	@echo ""

# Install dependencies
install:
	@echo "Installing Node.js dependencies..."
	@if [ -f ~/.nvm/nvm.sh ]; then \
		. ~/.nvm/nvm.sh && nvm use; \
	fi
	npm install

# Build TypeScript files
build:
	@echo "Building TypeScript files..."
	@if [ -f ~/.nvm/nvm.sh ]; then \
		. ~/.nvm/nvm.sh && nvm use && npm run build; \
	else \
		npm run build; \
	fi

# Generate extension icons
icons:
	@echo "Generating extension icons..."
	@if [ -f ~/.nvm/nvm.sh ]; then \
		. ~/.nvm/nvm.sh && nvm use && npm run build:icons; \
	else \
		npm run build:icons; \
	fi

# Run tests
test:
	@echo "Running unit tests..."
	@if [ -f ~/.nvm/nvm.sh ]; then \
		. ~/.nvm/nvm.sh && nvm use && npm test; \
	else \
		npm test; \
	fi

# Run tests in watch mode
test-watch:
	@echo "Running tests in watch mode..."
	@if [ -f ~/.nvm/nvm.sh ]; then \
		. ~/.nvm/nvm.sh && nvm use && npm run test:watch; \
	else \
		npm run test:watch; \
	fi

# Run tests with coverage
test-cov:
	@echo "Running tests with coverage..."
	@if [ -f ~/.nvm/nvm.sh ]; then \
		. ~/.nvm/nvm.sh && nvm use && npm run test:coverage; \
	else \
		npm run test:coverage; \
	fi

# Lint code (placeholder for when linting is added)
lint:
	@echo "Linting is not yet configured"
	@echo "Consider adding ESLint or similar tool"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist/
	rm -rf coverage/
	rm -rf node_modules/.cache/
	@echo "Clean complete"

# Development build
dev: icons build
	@echo "Development build complete"

# Create extension package
package: clean install dev test
	@echo "Creating extension package..."
	@mkdir -p dist/extension
	@cp manifest.json dist/extension/
	@cp index.html dist/extension/
	@cp app.js dist/extension/
	@cp vim-mode.js dist/extension/
	@cp styles.css dist/extension/
	@cp background.js dist/extension/
	@cp settings.html dist/extension/
	@cp settings.js dist/extension/
	@cp settings.css dist/extension/
	@cp -r icons/ dist/extension/icons/
	@cd dist && zip -r browser-notes-extension.zip extension/
	@echo "Extension package created: dist/browser-notes-extension.zip"

# Initial setup
setup: install dev
	@echo ""
	@echo "🎉 Setup complete!"
	@echo ""
	@echo "To install the extension:"
	@echo "1. Open Chrome and go to chrome://extensions/"
	@echo "2. Enable 'Developer mode'"
	@echo "3. Click 'Load unpacked'"
	@echo "4. Select this directory"
	@echo ""

# Check if dependencies are installed
check-deps:
	@if [ ! -d "node_modules" ]; then \
		echo "Dependencies not installed. Run 'make install' first."; \
		exit 1; \
	fi
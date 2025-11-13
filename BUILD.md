# Build and CI/CD Documentation

This document explains how to build RATS locally and how the CI/CD pipeline works.

## Table of Contents

- [Local Development Build](#local-development-build)
- [Production Build](#production-build)
- [CI/CD Pipeline](#cicd-pipeline)
- [Artifacts](#artifacts)
- [Release Process](#release-process)
- [Troubleshooting](#troubleshooting)

## Local Development Build

### Prerequisites

#### macOS
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install duckdb node

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### Windows
```powershell
# Install Node.js from https://nodejs.org/

# Install Rust from https://rustup.rs/

# Install DuckDB
# Download from: https://github.com/duckdb/duckdb/releases
# Extract to C:\duckdb or similar location
# Add to PATH and set environment variables:
$env:DUCKDB_LIB_DIR = "C:\duckdb"
$env:DUCKDB_INCLUDE_DIR = "C:\duckdb"
```

### Running Development Server

```bash
# Install dependencies
npm install

# Run development server (macOS)
RUSTFLAGS="-L /opt/homebrew/lib" npm run tauri:dev

# Run development server (Windows)
npm run tauri:dev
```

## Production Build

### macOS

```bash
# Build production app
RUSTFLAGS="-L /opt/homebrew/lib" npm run tauri:build

# Artifacts will be in:
# - src-tauri/target/release/bundle/macos/rats.app
# - src-tauri/target/release/bundle/dmg/rats_0.1.0_aarch64.dmg
```

### Windows

```powershell
# Ensure DuckDB environment variables are set
$env:DUCKDB_LIB_DIR = "C:\duckdb"
$env:DUCKDB_INCLUDE_DIR = "C:\duckdb"

# Build production app
npm run tauri:build

# Artifacts will be in:
# - src-tauri\target\release\bundle\nsis\rats_0.1.0_x64-setup.exe
```

## CI/CD Pipeline

The project uses GitHub Actions for automated builds.

### Workflow Triggers

1. **Push to branches**: main and init
2. **Pull requests**: To main branch
3. **Manual trigger**: Via GitHub Actions UI
4. **Tags**: When pushing a tag starting with v (e.g., v0.1.0)

### Build Matrix

| Platform | Architecture | Installer | Artifact |
|----------|--------------|-----------|----------|
| Windows  | x86_64       | .exe      | windows-installer |
| macOS    | aarch64      | .dmg      | macos-installer-dmg |

## Artifacts

After a successful workflow run:

1. Go to the **Actions** tab in your GitHub repository
2. Click on the workflow run
3. Download installers from **Artifacts** section

## Release Process

To create a GitHub Release:

```bash
# Tag your commit
git tag v0.1.0
git push origin v0.1.0
```

The pipeline automatically creates a release with installers attached.

## Troubleshooting

### DuckDB Not Found (macOS)
```bash
brew install duckdb
export RUSTFLAGS="-L /opt/homebrew/lib"
```

### DuckDB Not Found (Windows)
```powershell
$env:DUCKDB_LIB_DIR = "C:\duckdb"
$env:DUCKDB_INCLUDE_DIR = "C:\duckdb"
```

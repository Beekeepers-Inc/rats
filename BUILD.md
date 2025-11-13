# Building rats for Distribution

## Prerequisites

- Node.js (v24+) and npm
- Rust toolchain (1.87+)
- Platform-specific tools:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Microsoft Visual C++ Build Tools

## Development Mode

Run the app in development mode with hot-reload:

```bash
npm run tauri:dev
```

## Building for Production

### Build for Current Platform

```bash
npm run tauri:build
```

This will create an installer in `src-tauri/target/release/bundle/`:
- **macOS**: `.dmg` and `.app` in `dmg/` and `macos/`
- **Windows**: `.exe` and `.msi` in `nsis/` and `msi/`

### Build for Specific Platform

#### macOS (from macOS)

```bash
# Intel Macs
cargo tauri build --target x86_64-apple-darwin

# Apple Silicon Macs
cargo tauri build --target aarch64-apple-darwin

# Universal Binary (both architectures)
cargo tauri build --target universal-apple-darwin
```

#### Windows (from Windows)

```bash
# 64-bit Windows
cargo tauri build --target x86_64-pc-windows-msvc
```

## Testing the Build

After building, the installer will be in:
- macOS: `src-tauri/target/release/bundle/dmg/rats_0.1.0_[arch].dmg`
- Windows: `src-tauri/target/release/bundle/msi/rats_0.1.0_x64_en-US.msi`

Install and test the application to ensure:
1. CSV/Excel file import works
2. File dialogs open correctly
3. Data displays in the grid
4. Row sorting functions properly

## Distribution

The built installers are self-contained and can be distributed directly to users.

### macOS Notes
- Users may need to right-click → Open the first time (if not code-signed)
- For distribution via Mac App Store, additional code signing is required

### Windows Notes
- Users may see a SmartScreen warning (if not code-signed)
- For trusted distribution, get a code signing certificate

## Code Signing (Optional but Recommended)

For production distribution, consider:
- **macOS**: Apple Developer Program ($99/year) for notarization
- **Windows**: Code signing certificate from trusted CA ($100-400/year)

# Contributing to Pouch

Thank you for contributing to Pouch! Whether you're fixing bugs, adding features, or improving documentation, your contributions are welcome.

## How to Contribute

### 1. Report Issues or Suggest Features

- Open an issue on GitHub using the appropriate issue template
- If reporting a bug, please provide reproduction steps and environment details
- If suggesting a feature, please describe the use case and expected outcome

### 2. Submit Code Changes (Pull Request)

1. **Fork this repository** to your GitHub account
2. **Clone to your local machine**:
   ```bash
   git clone https://github.com/your-username/Pouch.git
   cd Pouch
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes**, ensuring they pass the constraint checks:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/check-constraints.ps1
   ```
5. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: brief description of your change"
   git push origin feature/your-feature-name
   ```
6. **Open a Pull Request** on GitHub and fill out the PR template

### 3. Development Environment

- **JDK 21** (for compiling the Java backend)
- **PowerShell** (for running build scripts on Windows)
- Any modern browser (for frontend testing)

### 4. Build and Run

```powershell
# Compile the backend
powershell -ExecutionPolicy Bypass -File server\build.ps1

# Compile + package distributable zip (optional)
powershell -ExecutionPolicy Bypass -File server\build.ps1 -Version 1.2.3

# Start the server
powershell -ExecutionPolicy Bypass -File server\start.ps1
```

After starting, open `http://127.0.0.1:8787` in your browser.

### 5. Code Constraints

The project uses `scripts/check-constraints.ps1` for code style checks, primarily:
- `fetch` is allowed only in `web/js/api.js`
- Color literals are allowed only in `web/css/tokens.css`
- Data file name literals are allowed only in `server/src/com/pouch/model/Category.java`
- CSS variables must be defined in `web/css/tokens.css`
- Static resources must not have cache headers (no `max-age` in `server/src`)

Please ensure `check-constraints.ps1` passes completely before submitting a PR.

### 6. Commit Message Convention

Please use concise English commit messages in the following format:

```
<type>: <short description>

[optional] detailed description
```

Common `<type>` values:
- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation update
- `refactor`: refactoring (no functional change)
- `style`: formatting (no code logic change)
- `test`: test-related

Example:
```
feat: add tag hierarchy support in compose ring
```

### 7. Code Review

All PRs require code review. Maintainers may request changes—please cooperate patiently.

---

Thank you for contributing! 🎉

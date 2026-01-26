# AGENTS.md

## Project Overview
This is a React-based Knowledge Base Dashboard application. It allows users to search for Question & Answer pairs and contribute new ones. The application uses Google OAuth for secure authentication and communicates with a backend API.

## Tech Stack
- **Frontend Framework:** React 19
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **HTTP Client:** Axios
- **Authentication:** @react-oauth/google (Google OAuth 2.0)
- **Icons:** Lucide React
- **Testing:** Vitest, React Testing Library

## Code Organization
- **`src/main.jsx`**: Application entry point. Wraps the app with `GoogleOAuthProvider` and `ErrorBoundary`.
- **`src/App.jsx`**: Handles authentication state (User/Null) and routes to `Login` or `Dashboard`.
- **`src/components/Login.jsx`**: Handles user login and registration flows.
  - **Note:** `API_BASE` is defined locally in this file.
- **`src/components/Dashboard.jsx`**: Main application interface for searching and adding content.
  - **Note:** `API_BASE` is defined locally in this file.
- **`src/ErrorBoundary.jsx`**: Catches errors in the component tree.
- **`src/index.css`**: Global styles and Tailwind directives.

## Development Workflow

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Setup
1.  **Install Dependencies:**
    ```bash
    npm install
    ```

### Running Locally
1.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    - The app will generally run at `http://localhost:5173`.

### Testing
- **Run Tests:**
    ```bash
    npx vitest --environment jsdom
    ```
- Ensure to add tests for new components or logic, placing them alongside the source files (e.g., `Component.test.jsx`).

### Building
- **Build for Production:**
    ```bash
    npm run build
    ```

### Linting
- **Run Linter:**
    ```bash
    npm run lint
    ```

## Coding Guidelines
- **Functional Components:** Use React functional components with Hooks.
- **Styling:** Use Tailwind CSS utility classes. Avoid custom CSS unless absolutely necessary.
- **Async Operations:** Use `async/await` for API calls and wrap them in `try/catch` blocks for error handling.
- **Authentication:** The app relies on a valid Google Client ID. If working on auth features, ensure the environment is correctly set up.
- **API Base URL:** Currently, the API base URL (`https://app.lt3.live`) is hardcoded in both `Login.jsx` and `Dashboard.jsx`. If you need to change the environment, you must update it in **both** locations.

## Deployment
- The project is configured for deployment to GitHub Pages.
- `vite.config.js` sets the base path to `/answerlist/`.
- Deploy using:
    ```bash
    npm run gh-pages
    ```

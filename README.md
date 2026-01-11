# Knowledge Base Dashboard

A modern, responsive React application designed to manage and query a Question & Answer knowledge base. This dashboard provides a secure interface for users to search for existing information and contribute new Q&A pairs to the system.

## Features

- **Secure Authentication**: Integrated with Google OAuth for secure and easy login.
- **User Registration**: Seamless onboarding flow for new users to set their display profile.
- **Smart Search**: Real-time search functionality to quickly find relevant questions and answers.
- **Content Management**: Intuitive interface for adding new questions and answers to the database.
- **Responsive Design**: Built with Tailwind CSS to ensure a great experience on both desktop and mobile devices.

## Technology Stack

- **Frontend Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **HTTP Client**: [Axios](https://axios-http.com/)
- **Authentication**: [@react-oauth/google](https://github.com/MomenSherif/react-oauth)

## Prerequisites

Before running the application, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher recommended)
- **npm** (comes with Node.js) or **yarn**

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository_url>
   cd <project_directory>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## Development

To start the local development server:

```bash
npm run dev
```

The application will launch in your default browser at `http://localhost:5173` (port may vary).

## Building for Production

To create an optimized production build:

```bash
npm run build
```

The output files will be generated in the `dist/` directory, ready for deployment.

## Project Structure

```
src/
├── assets/          # Static images and assets
├── App.jsx          # Main application logic (Auth, Dashboard, Search, Add)
├── ErrorBoundary.jsx # Global error handling component
├── main.jsx         # Application entry point
├── index.css        # Global styles and Tailwind imports
└── ...
```

## Configuration

The application communicates with a backend API. The API base URL is currently set to:
`https://app.lt3.live`

To change this, update the `API_BASE` constant in `src/App.jsx`.

## Linting

To run the linter and check for code issues:

```bash
npm run lint
```

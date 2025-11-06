# Authentication Setup Guide

This guide will walk you through setting up Google OAuth authentication for Pirate Plunder with PostgreSQL.

## Prerequisites

1. **PostgreSQL**: Access to a PostgreSQL database (either local or via the infra-workflows setup)
2. **Google Cloud Console**: Access to Google Cloud Console to create OAuth credentials

## Step 1: Set up PostgreSQL Database

### Using Infra-Workflows (Recommended)
If you're using the infra-workflows setup, PostgreSQL is already configured:
- Database: `PiratePlunder` 
- User: `svc`
- Connection string: `postgres://svc:${SVC_DB_PASSWORD}@localhost:5432/PiratePlunder?sslmode=disable`

### Local PostgreSQL Setup
```bash
# Install PostgreSQL (example for macOS with Homebrew)
brew install postgresql
brew services start postgresql

# Create database and user
psql postgres
CREATE DATABASE PiratePlunder;
CREATE USER svc WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE PiratePlunder TO svc;
\q
```

## Step 2: Create Google OAuth Application

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing project
3. Enable the Google+ API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - For development: `http://localhost:3001/auth/google/callback`
     - For production: `https://yourdomain.com/auth/google/callback`
   - Save and note down your Client ID and Client Secret

## Step 3: Configure Environment Variables

1. Copy the example environment file:
```bash
cd games/pirate-plunder/backend
cp .env.example .env
```

2. Edit the `.env` file with your values:
```bash
# Database (PostgreSQL)
DATABASE_URL=postgres://svc:your_password@localhost:5432/PiratePlunder?sslmode=disable
# OR if using infra-workflows:
# DATABASE_URL=postgres://svc:${SVC_DB_PASSWORD}@localhost:5432/PiratePlunder?sslmode=disable

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Session Secret (generate a secure random string)
SESSION_SECRET=your_very_secure_session_secret_here

# URLs
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

### Generate Session Secret
You can generate a secure session secret using:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Step 4: Install Dependencies

```bash
# Backend
cd games/pirate-plunder/backend
npm install

# Frontend
cd ../frontend
npm install
```

## Step 5: Run Database Migrations

```bash
# Generate Prisma client and run migrations
cd games/pirate-plunder/backend
npx prisma generate
npx prisma migrate dev --name init
```

## Step 6: Start the Application

```bash
# Start both frontend and backend
npm run dev

# Or start individually:
# Backend: npm run dev --workspace @pirate/game-pirate-plunder-backend
# Frontend: npm run dev --workspace @pirate/game-pirate-plunder-frontend
```

## Step 7: Test Authentication

1. Open your browser to `http://localhost:5173`
2. Click "Login with Google"
3. Complete the Google OAuth flow
4. You should be redirected back to the app as an authenticated user
5. Your profile should be created in the MongoDB database

## Troubleshooting

### Common Issues

1. **"Error 400: redirect_uri_mismatch"**
   - Make sure the redirect URI in Google Cloud Console matches exactly: `http://localhost:3001/auth/google/callback`

2. **PostgreSQL Connection Error**
   - Ensure PostgreSQL is running locally (`brew services start postgresql`)
   - Check your `DATABASE_URL` in the `.env` file
   - Verify database and user exist

3. **Session not persisting**
   - Ensure `SESSION_SECRET` is set in your `.env` file
   - Check that cookies are enabled in your browser

4. **CORS errors**
   - Make sure `CORS_ORIGINS` includes your frontend URL
   - Ensure `FRONTEND_URL` is correctly set for OAuth redirects

### Testing the Database

You can check if users are being created in PostgreSQL:

```bash
# Connect to PostgreSQL
psql postgres://svc:your_password@localhost:5432/PiratePlunder

# List all users
SELECT * FROM users;

# Exit
\q
```

## Production Deployment

For production deployment:

1. Update Google OAuth redirect URIs to use your production domain
2. Set production environment variables:
   ```bash
   NODE_ENV=production
   DATABASE_URL=postgres://svc:${SVC_DB_PASSWORD}@localhost:5432/PiratePlunder?sslmode=disable
   FRONTEND_URL=https://yourdomain.com
   CORS_ORIGINS=https://yourdomain.com
   ```
3. Use secure session cookies (`secure: true` is automatically enabled in production)
4. Consider using environment variable management services (AWS Secrets Manager, etc.)

## Database Schema

The user profile is stored in PostgreSQL using Prisma ORM:

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  bankroll DECIMAL DEFAULT 100,
  total_games_played INTEGER DEFAULT 0,
  total_winnings DECIMAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP DEFAULT NOW(),
  
  -- Cosmetic fields
  banner TEXT DEFAULT 'default',
  emblem TEXT DEFAULT 'default',
  title TEXT DEFAULT 'Landlubber',
  dice_skin TEXT DEFAULT 'wooden',
  pip_style TEXT DEFAULT 'dots',
  high_glow TEXT DEFAULT 'gold',
  low_glow TEXT DEFAULT 'blue',
  unlocked_cosmetics TEXT DEFAULT 'default,wooden,dots,gold,blue,Landlubber'
);

-- Sessions table (managed by connect-pg-simple)
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires TIMESTAMP NOT NULL
);
```

The TypeScript interface includes:
```typescript
interface UserProfile {
  id: string;                // Unique user ID
  googleId: string;          // Unique Google ID  
  email: string;             // User's email
  name: string;              // Display name
  avatar?: string;           // Profile picture URL
  bankroll: number;          // Virtual currency (starts at 100)
  cosmetics: PlayerCosmetics; // Customizable appearance
  unlockedCosmetics: string[]; // Array of unlocked cosmetic IDs
  totalGamesPlayed: number;    // Game statistics
  totalWinnings: number;       // Total winnings
  createdAt: Date;            // Account creation
  lastLogin: Date;            // Last login time
}
```

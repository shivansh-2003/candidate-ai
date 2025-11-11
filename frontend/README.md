# Candidate AI Assistant Frontend

A production-ready Next.js frontend application that connects to your deployed LiveKit voice agent. This frontend provides a beautiful, responsive interface for interacting with your AI interview preparation assistant.

## Features

- 🎤 Real-time voice interaction with LiveKit
- 🎨 Beautiful, modern UI with Tailwind CSS
- 📱 Fully responsive design (mobile & desktop)
- 🔒 Secure server-side token generation
- 🎯 State indicators (listening, thinking, speaking)
- 🔊 Audio visualizer
- ⚡ Fast and optimized with Next.js 14

## Prerequisites

- Node.js 18+ and npm/pnpm/yarn
- Modern browser with WebRTC support (Chrome, Edge, Firefox, Safari)
- LiveKit Cloud account with deployed voice agent
- LiveKit API Key, API Secret, and WebSocket URL

## Getting Started

### 1. Install Dependencies

```bash
cd frontend
npm install
# or
pnpm install
# or
yarn install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your LiveKit credentials:

```env
# Server-side only (never expose these to the client)
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here

# Client-side accessible (must start with NEXT_PUBLIC_)
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### 3. Get Your LiveKit Credentials

1. Log into [LiveKit Cloud Dashboard](https://cloud.livekit.io)
2. Navigate to Settings → API Keys
3. Copy your API Key, API Secret, and WebSocket URL
4. Paste them into your `.env.local` file

**Important:** Never commit `.env.local` to version control. It's already in `.gitignore`.

### 4. Run Development Server

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Allow Microphone Access

When prompted by your browser, allow microphone access to enable voice interaction.

## Project Structure

```
frontend/
├── app/
│   ├── api/
│   │   └── token/
│   │       └── route.ts          # Token generation endpoint
│   ├── components/
│   │   └── VoiceAgent.tsx        # Main voice agent component
│   ├── page.tsx                  # Main page
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
├── public/                       # Static assets
├── .env.local.example            # Example env file
├── .gitignore                    # Git ignore rules
├── next.config.js                # Next.js config
├── package.json                  # Dependencies
├── tailwind.config.ts            # Tailwind config
└── tsconfig.json                 # TypeScript config
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LIVEKIT_API_KEY` | Your LiveKit API Key | Yes |
| `LIVEKIT_API_SECRET` | Your LiveKit API Secret | Yes |
| `NEXT_PUBLIC_LIVEKIT_URL` | Your LiveKit WebSocket URL | Yes |

### Room Configuration

By default, the app connects to a room named `voice-agent-room`. You can modify this in `app/components/VoiceAgent.tsx`:

```typescript
const [roomName] = useState('your-room-name');
```

Make sure your deployed agent is configured to listen to the same room name.

## Deployment

### Vercel (Recommended)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. Add environment variables in Vercel Dashboard:
   - Go to your project settings
   - Navigate to Environment Variables
   - Add: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`

### Docker

1. Build the Docker image:
```bash
docker build -t candidate-ai-frontend .
```

2. Run the container:
```bash
docker run -p 3000:3000 \
  -e LIVEKIT_API_KEY=your_key \
  -e LIVEKIT_API_SECRET=your_secret \
  -e NEXT_PUBLIC_LIVEKIT_URL=your_url \
  candidate-ai-frontend
```

## Troubleshooting

### Token Generation Error

**Symptoms:** 500 error from `/api/token`

**Solutions:**
- Verify environment variables are set correctly in `.env.local`
- Check that `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are valid
- Restart the development server after changing environment variables

### Failed to Connect to Room

**Symptoms:** Connection timeout or WebSocket errors

**Solutions:**
- Verify `NEXT_PUBLIC_LIVEKIT_URL` is correct (must start with `wss://`)
- Check LiveKit Cloud status
- Ensure your voice agent is deployed and running
- Verify the room name matches your agent configuration

### No Audio Input/Output

**Symptoms:** Microphone not detected

**Solutions:**
- Check browser permissions (chrome://settings/content/microphone)
- Test microphone in browser console:
```javascript
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => console.log('Microphone works!'))
  .catch(err => console.error('Microphone error:', err));
```
- Try a different browser (Chrome/Edge recommended)
- Check system audio settings

### Agent Not Responding

**Symptoms:** Connection successful but agent silent

**Solutions:**
- Verify your LiveKit voice agent is deployed and running
- Check agent logs in LiveKit Cloud dashboard
- Ensure room name matches agent configuration
- Test agent directly via LiveKit Playground

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

All browsers must support WebRTC and modern JavaScript features.

## Security

- API keys are never exposed to the client
- Tokens are generated server-side with secure JWT
- Token expiration is set to 10 minutes
- Environment variables are not committed to version control

## Performance

- Optimized bundle size with Next.js
- Code splitting for faster load times
- Audio echo cancellation enabled
- Adaptive streaming for better quality

## License

This project is part of the Candidate AI Assistant system.

## Support

For issues related to:
- **LiveKit**: Check [LiveKit Documentation](https://docs.livekit.io)
- **Frontend**: Open an issue in this repository
- **Agent**: Check your agent deployment logs

## Next Steps

- Add transcript display
- Implement push-to-talk mode
- Add connection quality indicator
- Create session history
- Add multi-language support


# Brainstudio Intelligence

A minimal ChatGPT-style conversational assistant powered by Google Gemini AI. Built with modern web technologies for a clean, responsive chat experience.

![Brainstudio Intelligence](https://horizons-cdn.hostinger.com/34bef26f-0844-4404-9c29-5bd38530bac6/818eb0a9481bbea858b332955da3caac.png)

## Features

- 🤖 **AI-Powered Conversations** - Powered by Google Gemini AI
- 💬 **Real-time Streaming** - See responses as they're generated
- 🎨 **Modern UI** - Clean, minimal design with smooth animations
- 📱 **Responsive** - Works seamlessly on mobile and desktop
- 🌊 **Smooth Animations** - Built with Framer Motion
- 🎯 **Minimalist Design** - Focus on conversation, not distractions

## Tech Stack

- **Frontend Framework**: React 18.3.1 + Vite
- **Styling**: Tailwind CSS 3.4.17
- **Animations**: Framer Motion 11.15.0
- **Icons**: Lucide React 0.469.0
- **UI Components**: Radix UI primitives + shadcn/ui
- **AI Integration**: Google Gemini API
- **State Management**: React Hooks

## Color Palette

- Primary Background: `#F5F1FA`
- Secondary Background: `#E7DCF0`
- User Message: `#9F7892`
- Assistant Message: `#CCC0D4`
- Accent: `#366882`
- Text: `#352C32`
- White: `#FFFFFF`

## Prerequisites

- Node.js 20.x or higher
- npm or yarn
- Google Gemini API Key

## Setup Instructions

### 1. Clone the Repository

\`\`\`bash
git clone <your-repo-url>
cd brainstudio-intelligence
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Configure Environment Variables

Create a \`.env\` file in the root directory:

\`\`\`bash
cp .env.example .env
\`\`\`

Edit \`.env\` and add your Google Gemini API key:

\`\`\`env
VITE_GEMINI_API_KEY=your_actual_api_key_here
VITE_GEMINI_MODEL=gemini-1.5-flash
\`\`\`

**Get your API key:**
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy and paste it into your \`.env\` file

### 4. Run Development Server

\`\`\`bash
npm run dev
\`\`\`

The application will be available at [http://localhost:3000](http://localhost:3000)

## Build for Production

\`\`\`bash
npm run build
npm run preview
\`\`\`

## Deployment

### Deploy to Railway

1. **Create a Railway Account**: Sign up at [railway.app](https://railway.app)

2. **Create New Project**: Click "New Project" → "Deploy from GitHub repo"

3. **Configure Environment Variables**:
   - Go to your project settings
   - Add the following variables:
     - \`VITE_GEMINI_API_KEY\`: Your Google Gemini API key
     - \`VITE_GEMINI_MODEL\`: \`gemini-1.5-flash\` (or your preferred model)

4. **Deploy**: Railway will automatically build and deploy your application

5. **Custom Domain** (optional): Configure a custom domain in Railway settings

### Deploy to Other Platforms

The application can be deployed to any static hosting platform:

- **Vercel**: Import project → Configure environment variables → Deploy
- **Netlify**: New site from Git → Configure environment variables → Deploy
- **Cloudflare Pages**: Create project → Configure variables → Deploy

**Important**: Always configure \`VITE_GEMINI_API_KEY\` in your platform's environment variables.

## Project Structure

\`\`\`
brainstudio-intelligence/
├── public/                 # Static assets
├── src/
│   ├── components/        # React components
│   │   ├── ui/           # shadcn/ui components
│   │   ├── ChatInterface.jsx
│   │   └── SplashScreen.jsx
│   ├── lib/              # Utility functions
│   │   ├── chatUtils.js  # Gemini API integration
│   │   └── utils.js      # General utilities
│   ├── App.jsx           # Main application component
│   ├── main.jsx          # Application entry point
│   └── index.css         # Global styles
├── .env                  # Environment variables (not in git)
├── .env.example          # Environment template
├── package.json          # Dependencies
├── tailwind.config.js    # Tailwind configuration
├── vite.config.js        # Vite configuration
└── README.md            # This file
\`\`\`

## Architecture Overview

### Frontend Architecture

- **React**: Component-based UI with hooks for state management
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first styling
- **Framer Motion**: Smooth animations and transitions

### API Integration

The application communicates directly with Google Gemini API from the browser:

1. User sends a message through the chat interface
2. \`chatUtils.js\` formats the message and sends it to Gemini API
3. API streams the response in real-time
4. Chat interface updates as chunks arrive
5. Conversation history is maintained in React state

### Key Components

- **SplashScreen**: Animated loading screen with logo
- **ChatInterface**: Main chat UI with message display and input
- **chatUtils**: API integration and streaming logic
- **UI Components**: Reusable shadcn/ui components (Button, Toast, etc.)

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| \`VITE_GEMINI_API_KEY\` | Google Gemini API key | - | Yes |
| \`VITE_GEMINI_MODEL\` | Gemini model to use | \`gemini-1.5-flash\` | No |

## API Configuration

### Supported Models

- \`gemini-1.5-flash\`: Fast, efficient responses (recommended)
- \`gemini-1.5-pro\`: More capable, slower responses

### Generation Parameters

- **Temperature**: 0.7 (balanced creativity)
- **Top K**: 40 (sampling diversity)
- **Top P**: 0.95 (nucleus sampling)
- **Max Tokens**: 2048 (response length)

## Future Enhancements

- [ ] **Function Calling**: Enable Gemini to call external tools and APIs
- [ ] **Multi-modal Support**: Add image and file upload capabilities
- [ ] **Conversation History**: Persist chat history with localStorage/Supabase
- [ ] **Custom System Prompts**: Allow users to customize assistant behavior
- [ ] **Dark Mode**: Add theme switching
- [ ] **Voice Input**: Speech-to-text integration
- [ ] **Export Conversations**: Download chat history as PDF/TXT
- [ ] **Multi-language Support**: i18n for Spanish, English, etc.
- [ ] **Code Highlighting**: Better formatting for code snippets
- [ ] **Markdown Support**: Rich text rendering in messages

## Troubleshooting

### "API Key not configured" error

- Ensure \`.env\` file exists in the root directory
- Verify \`VITE_GEMINI_API_KEY\` is set correctly
- Restart the development server after adding environment variables

### Streaming not working

- Check your API key has proper permissions
- Verify your Gemini API quota hasn't been exceeded
- Check browser console for detailed error messages

### Build errors

- Ensure Node.js version is 20.x or higher
- Clear \`node_modules\` and reinstall: \`rm -rf node_modules && npm install\`
- Check that all required dependencies are in \`package.json\`

## Development

### Available Scripts

- \`npm run dev\`: Start development server on port 3000
- \`npm run build\`: Build for production
- \`npm run preview\`: Preview production build locally
- \`npm run lint\`: Run ESLint

### Adding New Features

1. Create new components in \`src/components/\`
2. Add utility functions to \`src/lib/\`
3. Update \`App.jsx\` to integrate new features
4. Test thoroughly before deployment

## License

MIT License - feel free to use this project for your own purposes.

## Support

For issues or questions:
- Open an issue on GitHub
- Check the [Google Gemini API documentation](https://ai.google.dev/docs)
- Review the [Vite documentation](https://vitejs.dev/)

---

**Built with ❤️ using React, Vite, and Google Gemini AI**
\`\`\`

## Important Notes

⚠️ **This is a Vite + React Implementation**

The original request asked for Next.js with App Router, but this environment only supports Vite + React. This implementation provides the same functionality using:

- **Vite** instead of Next.js
- **Client-side API calls** instead of Next.js API routes
- **React components** instead of Next.js App Router pages
- **Direct Gemini API integration** from the browser

### Key Differences from Next.js:

1. **No Server-Side API Routes**: API calls are made directly from the browser to Gemini API
2. **Environment Variables**: Use \`VITE_\` prefix instead of \`NEXT_PUBLIC_\`
3. **File Structure**: Standard React structure instead of Next.js \`app/\` directory
4. **No SSR**: Client-side rendering only

The application provides identical functionality and user experience as requested, just with different underlying architecture.

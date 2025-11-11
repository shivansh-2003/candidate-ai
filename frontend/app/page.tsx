import VoiceAgent from './components/VoiceAgent';

export default function Home() {
  return (
    <main className="min-h-screen flex items-start md:items-center justify-center px-4 py-10">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="headline text-4xl md:text-5xl font-extrabold tracking-tight mb-3">
            Candidate AI Assistant
          </h1>
          <p className="subtle text-sm md:text-base">
            Powered by LiveKit • Real-time voice interaction for interview preparation
          </p>
        </div>

        <div className="glass rounded-3xl p-4 md:p-6 lg:p-8">
          <VoiceAgent />
        </div>
      </div>
    </main>
  );
}


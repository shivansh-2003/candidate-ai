import VoiceAgent from './components/VoiceAgent';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Candidate AI Assistant
          </h1>
          <p className="text-gray-600">
            Powered by LiveKit • Real-time voice interaction for interview preparation
          </p>
        </div>
        
        <div className="bg-white rounded-2xl shadow-xl max-w-4xl mx-auto overflow-hidden">
          <VoiceAgent />
        </div>
      </div>
    </main>
  );
}


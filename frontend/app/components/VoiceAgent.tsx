'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
  useLocalParticipant,
  useRemoteParticipants,
} from '@livekit/components-react';
import { Track, RemoteParticipant, Participant, RoomEvent, DisconnectReason } from 'livekit-client';
import '@livekit/components-styles';

// Inner component - must be inside LiveKitRoom
function VoiceInterface() {
  const room = useRoomContext();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Microphone, Track.Source.Camera], { onlySubscribed: false });
  
  const [agentState, setAgentState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [isListening, setIsListening] = useState(false);
  const agentParticipantRef = useRef<RemoteParticipant | null>(null);

  // Find the agent participant (usually the first remote participant)
  useEffect(() => {
    const agentParticipant = Array.from(remoteParticipants.values())[0];
    if (agentParticipant) {
      agentParticipantRef.current = agentParticipant;
    }
  }, [remoteParticipants]);

  // Track agent connection and audio state
  useEffect(() => {
    const agentParticipant = agentParticipantRef.current;
    
    if (!agentParticipant) {
      // Agent not connected yet
      setAgentState('listening');
      setIsListening(true);
      return;
    }

    // Check if agent has audio tracks by filtering tracks from useTracks hook
    const agentTracks = tracks.filter(
      (trackRef) => trackRef.participant && trackRef.participant.identity === agentParticipant.identity && trackRef.source === Track.Source.Microphone
    );

    if (agentTracks.length === 0) {
      // Agent connected but no audio track yet - waiting
      setAgentState('listening');
      setIsListening(true);
      return;
    }

    // Agent is connected and has audio track - default to listening
    // The actual speaking state will be detected through audio visualization
    setAgentState('listening');
    setIsListening(true);
  }, [remoteParticipants, tracks]);

  // Listen for data messages from agent (if agent sends state updates)
  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array, participant?: Participant) => {
      if (participant && participant !== localParticipant.localParticipant) {
        try {
          const decoder = new TextDecoder();
          const data = JSON.parse(decoder.decode(payload));
          if (data.state) {
            setAgentState(data.state);
          }
        } catch (e) {
          // Not JSON or not a state update, ignore
        }
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, localParticipant]);

  const getStatusEmoji = () => {
    switch (agentState) {
      case 'listening': return '🎤';
      case 'thinking': return '🤔';
      case 'speaking': return '🗣️';
      default: return '💤';
    }
  };

  const getStatusText = () => {
    switch (agentState) {
      case 'listening': return 'Listening to you...';
      case 'thinking': return 'Processing...';
      case 'speaking': return 'Speaking...';
      default: return 'Ready to chat';
    }
  };

  const getStatusColor = () => {
    switch (agentState) {
      case 'listening': return 'bg-green-500';
      case 'thinking': return 'bg-yellow-500';
      case 'speaking': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  // Get agent audio tracks using useTracks hook (already available above)
  const agentAudioTracks = tracks.filter(
    (trackRef) => trackRef.participant && trackRef.participant !== localParticipant.localParticipant && trackRef.source === Track.Source.Microphone
  );

  return (
    <div className="flex flex-col items-center justify-center space-y-6 p-8 min-h-screen">
      {/* Status Indicator */}
      <div className="flex flex-col items-center space-y-4">
        <div className={`
          w-32 h-32 rounded-full flex items-center justify-center
          ${getStatusColor()} transition-all duration-300 text-6xl
          ${isListening ? 'animate-pulse' : ''}
          shadow-lg
        `}>
          {getStatusEmoji()}
        </div>
        
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">
            {getStatusText()}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {room.state} • {tracks.length} tracks
          </p>
        </div>
      </div>

      {/* Audio Visualizer - Visual indicator */}
      <div className="w-full max-w-md">
        <div className="flex items-end justify-center space-x-2 h-24">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`w-3 bg-blue-500 rounded-full transition-all duration-500 ${
                agentState === 'speaking'
                  ? 'animate-pulse'
                  : agentState === 'listening'
                  ? 'opacity-70 animate-pulse-slow'
                  : 'opacity-30'
              }`}
              style={{
                height: agentState === 'speaking' 
                  ? `${20 + i * 8}px` 
                  : agentState === 'listening'
                  ? `${10 + i * 3}px`
                  : '8px',
                animationDelay: `${i * 0.15}s`,
                minHeight: '8px',
              }}
            />
          ))}
        </div>
      </div>

      {/* Connection Info */}
      <div className="text-xs text-gray-400 text-center">
        <p>Room: {room.name}</p>
        <p>Participants: {room.remoteParticipants.size + 1}</p>
      </div>
    </div>
  );
}

// Main component
export default function VoiceAgent() {
  const [token, setToken] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string>('');
  const [roomName] = useState('voice-agent-room');

  const fetchToken = useCallback(async () => {
    setIsConnecting(true);
    setError('');
    
    try {
      const response = await fetch(
        `/api/token?roomName=${roomName}&participantName=user-${Date.now()}`
      );
      
      if (!response.ok) {
        throw new Error(`Token fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.token) {
        throw new Error('No token received');
      }
      
      setToken(data.token);
      console.log('Token received successfully');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Token fetch error:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  }, [roomName]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Loading state
  if (isConnecting || !token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-600">Connecting to voice agent...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Connection Error</h3>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            onClick={fetchToken}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Connected state
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!serverUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Configuration Error</h3>
          <p className="text-red-600 text-sm">
            NEXT_PUBLIC_LIVEKIT_URL is not configured. Please check your environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={false}
      onConnected={() => {
        console.log('Connected to room');
      }}
      onDisconnected={(reason) => {
        console.log('Disconnected:', reason);
        // Optional: Auto-reconnect (skip if user initiated disconnect)
        if (reason !== DisconnectReason.CLIENT_INITIATED) {
          setTimeout(fetchToken, 2000);
        }
      }}
      onError={(error) => {
        console.error('Room error:', error);
        setError(error.message);
      }}
      className="h-screen w-full"
    >
      <VoiceInterface />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}


'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
  useLocalParticipant,
  useRemoteParticipants,
} from '@livekit/components-react';
import {
  Track,
  RemoteParticipant,
  Participant,
  Room,
  RoomEvent,
  DisconnectReason,
  DefaultReconnectPolicy,
} from 'livekit-client';
import '@livekit/components-styles';
import RadialVisualizer from '../components/RadialVisualizer';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';

type ConnectionState = 'idle' | 'connecting' | 'waiting-agent' | 'connected' | 'reconnecting';
const AGENT_TIMEOUT_MS = 12000;

// Module-level flag to prevent duplicate connections across React Strict Mode remounts
let globalConnectionActive = false;
const STORAGE_KEY = 'livekit_connection_active';

function waitForAgentParticipant(room: Room, timeout = AGENT_TIMEOUT_MS) {
  return new Promise<RemoteParticipant>((resolve, reject) => {
    const existing = Array.from(room.remoteParticipants.values())[0];
    if (existing) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Agent connection timeout'));
    }, timeout);

    const handler = (participant: RemoteParticipant) => {
      cleanup();
      resolve(participant);
    };

    const cleanup = () => {
      clearTimeout(timer);
      room.off(RoomEvent.ParticipantConnected, handler);
    };

    room.on(RoomEvent.ParticipantConnected, handler);
  });
}

// Inner component - must be inside LiveKitRoom
function VoiceInterface({
  connectionState,
  connectionStatus,
  setConnectionState,
  setConnectionStatus,
  setAgentReady,
  onRoomReady,
}: {
  connectionState: ConnectionState;
  connectionStatus: string;
  setConnectionState: (state: ConnectionState) => void;
  setConnectionStatus: (note: string) => void;
  setAgentReady: (ready: boolean) => void;
  onRoomReady?: (room: Room) => void;
}) {
  const room = useRoomContext();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Microphone, Track.Source.Camera], { onlySubscribed: false });

  const [agentState, setAgentState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [isListening, setIsListening] = useState(false);
  const agentParticipantRef = useRef<RemoteParticipant | null>(null);
  const micEnabledRef = useRef(false);

  // Pass room reference to parent
  useEffect(() => {
    if (room && onRoomReady) {
      onRoomReady(room);
    }
  }, [room, onRoomReady]);

  // Find the agent participant (usually the first remote participant)
  useEffect(() => {
    const agentParticipant = Array.from(remoteParticipants.values())[0];
    if (agentParticipant) {
      agentParticipantRef.current = agentParticipant;
    }
  }, [remoteParticipants]);

  // Monitor room-level connection events for UI feedback
  useEffect(() => {
    if (!room) return;

    const handleReconnecting = () => {
      setConnectionState('reconnecting');
      setConnectionStatus('Connection lost. Reconnecting…');
    };
    const handleReconnected = () => {
      setConnectionState('waiting-agent');
      setConnectionStatus('Reconnected. Waiting for agent…');
      micEnabledRef.current = false;
      setAgentReady(false);
    };
    const handleDisconnected = () => {
      setConnectionState('connecting');
      setConnectionStatus('Disconnected. Attempting new session…');
      micEnabledRef.current = false;
      setAgentReady(false);
    };

    room.on(RoomEvent.Reconnecting, handleReconnecting);
    room.on(RoomEvent.Reconnected, handleReconnected);
    room.on(RoomEvent.Disconnected, handleDisconnected);

    return () => {
      room.off(RoomEvent.Reconnecting, handleReconnecting);
      room.off(RoomEvent.Reconnected, handleReconnected);
      room.off(RoomEvent.Disconnected, handleDisconnected);

      // Disconnect room on component unmount to prevent stale connections
      if (room.state === 'connected' || room.state === 'connecting') {
        console.log('Cleaning up room connection on unmount');
        room.disconnect().catch((err) => {
          console.warn('Error disconnecting room during cleanup:', err);
        });
      }
    };
  }, [room, setAgentReady, setConnectionState, setConnectionStatus]);

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

  // Enable microphone only once agent is present (with user interaction for AudioContext)
  useEffect(() => {
    if (!room || connectionState !== 'waiting-agent') return;
    let cancelled = false;

    const run = async () => {
      try {
        const agent = await waitForAgentParticipant(room);
        if (cancelled) return;
        setConnectionState('connected');
        setConnectionStatus('Connected');
        if (!micEnabledRef.current) {
          // Resume AudioContext if suspended (required for autoplay policy)
          try {
            const audioContext = (room as any).audioContext;
            if (audioContext && audioContext.state === 'suspended') {
              await audioContext.resume();
            }
          } catch (e) {
            console.warn('Could not resume AudioContext:', e);
          }
          await room.localParticipant.setMicrophoneEnabled(true);
          micEnabledRef.current = true;
        }
        setAgentReady(true);
      } catch (err) {
        if (!cancelled) {
          setConnectionStatus((err as Error).message ?? 'Agent unavailable');
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [connectionState, room, setAgentReady, setConnectionState, setConnectionStatus]);

  // Listen for data messages from agent (if agent sends state updates)
  useEffect(() => {
    if (!room) return;

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

  const getAgentStatusText = () => {
    switch (agentState) {
      case 'listening': return 'Listening to you...';
      case 'thinking': return 'Processing...';
      case 'speaking': return 'Speaking...';
      default: return 'Ready to chat';
    }
  };

  const statusLabel = useMemo(() => {
    switch (connectionState) {
      case 'connecting':
        return 'Connecting to voice agent...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'waiting-agent':
        return 'Waiting for agent...';
      default:
        return getAgentStatusText();
    }
  }, [connectionState, agentState]);

  // Find agent audio MediaStreamTrack (first remote mic track)
  const agentMicTrack = useMemo(() => {
    const ref = tracks.find(
      (t) =>
        t.participant &&
        t.participant !== localParticipant.localParticipant &&
        t.source === Track.Source.Microphone &&
        t.publication?.track?.mediaStreamTrack
    );
    return ref?.publication?.track?.mediaStreamTrack ?? null;
  }, [localParticipant.localParticipant, tracks]);

  // Live audio analyzer bound to agent's audio
  const analyzer = useAudioAnalyzer(agentMicTrack, { fftSize: 1024, smoothingTimeConstant: 0.82 });

  const guideSections = useMemo(
    () => [
      {
        title: 'Experience Deep-Dives',
        items: [
          '“Walk me through your role at Acme Corp.”',
          '“How did you scale the payments platform?”',
          '“What impact did your work have on revenue?”',
        ],
      },
      {
        title: 'Interview Prep',
        items: [
          '“Give me a STAR answer for system outages.”',
          '“What questions should I ask a CTO?”',
          '“Mock me on behavioral leadership questions.”',
        ],
      },
      {
        title: 'Tech Refreshers',
        items: [
          '“Explain Kubernetes like I’m interviewing.”',
          '“How do you optimize SQL queries?”',
          '“Compare event-driven vs REST architectures.”',
        ],
      },
      {
        title: 'Story Crafting',
        items: [
          '“Help summarize my machine learning project.”',
          '“Polish my answer about cross-team collaboration.”',
          '“Draft a closing statement for onsite interviews.”',
        ],
      },
    ],
    []
  );

  return (
    <div className="flex flex-col items-center justify-center space-y-8 md:space-y-10 py-8 md:py-12">
      {/* Status Indicator */}
      <div className="flex flex-col items-center space-y-5">
        <div className="status-orb">
          <div className="status-orb-ring" />
          <div
            className={`status-dot ${
              agentState === 'speaking'
                ? 'state-speaking'
                : agentState === 'thinking'
                ? 'state-thinking'
                : agentState === 'listening'
                ? 'state-listening'
                : 'state-idle'
            }`}
          />
        </div>

        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white drop-shadow-[0_6px_30px_rgba(56,189,248,0.45)] tracking-wide">
            {statusLabel}
          </h2>
          <div className="mt-3 flex items-center justify-center gap-3 text-xs md:text-sm text-white/85 font-medium">
            <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 bg-emerald-500/15 border border-emerald-400/50 text-emerald-100 shadow-[0_8px_26px_-18px_rgba(34,197,94,0.9)]">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  room?.state === 'connected'
                    ? 'bg-green-500'
                    : room?.state === 'connecting'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
              />
              {room?.state || 'unknown'}
            </span>
            <span className="text-white/60">•</span>
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-sky-500/10 border border-sky-400/50 text-sky-100 shadow-[0_8px_26px_-18px_rgba(14,165,233,0.9)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19a3 3 0 0 0-6 0m9-7a4.5 4.5 0 0 0-9 0v.75a2.25 2.25 0 0 1-1.125 1.943l-.9.514A2.25 2.25 0 0 0 6 16.152V17.25A2.25 2.25 0 0 0 8.25 19.5h7.5A2.25 2.25 0 0 0 18 17.25v-1.098a2.25 2.25 0 0 0-1.125-1.943l-.9-.514A2.25 2.25 0 0 1 15 11.75V11.5Z" />
              </svg>
              {(room?.remoteParticipants?.size ?? 0) + 1} participants
            </span>
          </div>
          <div className="mt-2 text-[11px] md:text-xs text-white/70">
            {connectionStatus}
          </div>
        </div>
      </div>
      {/* Audio Visualizer - radial canvas (real-time) */}
      <div className="w-full flex items-center justify-center">
        <RadialVisualizer
          data={analyzer}
          size={360}
          state={agentState}
        />
      </div>

      {/* Connection Info - subtle */}
      <div className="text-[11px] md:text-xs text-white/65 text-center">
        <p>Room: <span className="font-semibold text-white/80">{room?.name || 'connecting...'}</span></p>
      </div>

      {/* Guide Sections */}
      <div className="w-full max-w-4xl pt-6 md:pt-8">
        <div className="text-center mb-4 md:mb-6">
          <span className="uppercase tracking-[0.45em] text-[11px] md:text-xs text-sky-200/90">
            What you can ask
          </span>
        </div>
        <div className="grid gap-4 md:gap-6 md:grid-cols-2">
          {guideSections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-white/22 bg-slate-900/70 px-6 py-5 backdrop-blur-md shadow-[0_20px_40px_-18px_rgba(56,189,248,0.55)]"
            >
              <h3 className="text-sm md:text-base font-semibold text-white mb-4">
                {section.title}
              </h3>
              <ul className="space-y-2.5 text-xs md:text-sm text-white/80">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main component
export default function VoiceAgent() {
  const [token, setToken] = useState<string>('');
  const [sessionId, setSessionId] = useState<number>(() => Date.now());
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string>('');
  const [roomName] = useState('voice-agent-room');
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionStatus, setConnectionStatus] = useState('Click to start voice session');
  const [, setAgentReady] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const hasConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const connectionAttemptedRef = useRef(false);
  const connectInitiatedRef = useRef(false);
  const roomRef = useRef<Room | null>(null);

  // Stable shouldConnect value using useMemo to prevent unnecessary re-renders
  // Based on LiveKit docs: once connect={true}, keep it true to maintain connection
  // Only connect when we have a token and user has interacted
  const shouldConnect = useMemo(() => {
    // Don't connect if no token or user hasn't started session
    if (!token || !userInteracted) {
      return false;
    }

    // If already initiated, keep connection active
    if (connectInitiatedRef.current) {
      return true;
    }

    // Only initiate connection when in a connecting state
    const needsConnection = connectionState === 'connecting' ||
                            connectionState === 'waiting-agent' ||
                            connectionState === 'reconnecting';

    if (needsConnection) {
      connectInitiatedRef.current = true;
      return true;
    }

    return false;
  }, [token, userInteracted, connectionState]);

  // Cleanup effect: Reset refs and disconnect on page reload/unmount
  useEffect(() => {
    // Clear any stale connection flags from previous sessions on mount
    // If a stale connection exists, it means the page was reloaded while connected
    if (typeof window !== 'undefined') {
      const staleConnection = sessionStorage.getItem(STORAGE_KEY);
      if (staleConnection) {
        console.log('Detected page reload with active connection - clearing stale flags');
        sessionStorage.removeItem(STORAGE_KEY);
        globalConnectionActive = false;
      }
    }

    // Handle page reload/close - ensure room is disconnected
    const handleBeforeUnload = () => {
      console.log('Page unloading, disconnecting room');

      // Clear connection flags immediately
      globalConnectionActive = false;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEY);
      }

      if (roomRef.current) {
        const room = roomRef.current;
        if (room.state === 'connected' || room.state === 'connecting') {
          // Synchronous disconnect on beforeunload
          try {
            room.disconnect();
          } catch (err) {
            console.warn('Error disconnecting room during beforeunload:', err);
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      console.log('VoiceAgent unmounting, cleaning up connection state');

      // Remove beforeunload listener
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Only clear flags and disconnect if this is a real unmount (not Strict Mode remount)
      // We detect this by checking if there's a setTimeout delay
      const disconnectTimeout = setTimeout(() => {
        // Reset all connection tracking refs
        hasConnectedRef.current = false;
        isConnectingRef.current = false;
        connectionAttemptedRef.current = false;
        connectInitiatedRef.current = false;

        // Clear global flags
        globalConnectionActive = false;
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(STORAGE_KEY);
        }

        // Disconnect room if connected
        if (roomRef.current) {
          const room = roomRef.current;
          if (room.state === 'connected' || room.state === 'connecting') {
            console.log('Disconnecting room on VoiceAgent unmount (delayed)');
            room.disconnect().catch((err) => {
              console.warn('Error disconnecting room during unmount:', err);
            });
          }
          roomRef.current = null;
        }
      }, 100); // Small delay to allow Strict Mode remount to complete

      // If component remounts before timeout, cleanup won't happen
      return () => clearTimeout(disconnectTimeout);
    };
  }, []);

  const connectWithRetry = useCallback(
    async (attempt = 1) => {
      // Prevent multiple simultaneous connection attempts
      if (isConnectingRef.current) {
        console.log('Connection already in progress, skipping...');
        return;
      }

      const maxRetries = 3;
      const baseDelay = 1000;
      isConnectingRef.current = true;
      setConnectionState('connecting');
      setConnectionStatus('Requesting access token…');
      setIsConnecting(true);
      setError('');
      setAgentReady(false);
      hasConnectedRef.current = false; // Reset connection tracking

      try {
        // Generate unique participant name with timestamp + random component
        // This ensures no conflicts even on very fast reloads
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const response = await fetch(
          `/api/token?roomName=${roomName}&participantName=user-${uniqueId}`
        );

        if (!response.ok) {
          throw new Error(`Token fetch failed: ${response.status}`);
        }

        const data = await response.json();

        if (!data.token) {
          throw new Error('No token received');
        }

        setToken(data.token);
        // Only update sessionId if we don't have one yet (prevents unnecessary remounts)
        if (!sessionId || sessionId === 0) {
          setSessionId(Date.now());
        }
        setConnectionStatus('Token acquired. Connecting to room…');
        setIsConnecting(false);
        connectionAttemptedRef.current = true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('Token fetch error:', errorMessage);

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          setConnectionStatus(`Connection failed (${errorMessage}). Retrying in ${Math.round(delay / 1000)}s…`);
          isConnectingRef.current = false; // Reset before retry
          setTimeout(() => connectWithRetry(attempt + 1), delay);
        } else {
          setError(errorMessage);
          setIsConnecting(false);
          isConnectingRef.current = false;
          setConnectionStatus('Unable to connect. Please retry.');
        }
      }
    },
    [roomName]
  );

  // Start session on user interaction (required for AudioContext autoplay policy)
  const handleStartSession = useCallback(async () => {
    // Prevent multiple clicks from triggering multiple connections
    if (userInteracted || isConnectingRef.current || hasConnectedRef.current) {
      console.log('Session already started or connection in progress');
      return;
    }

    setUserInteracted(true);
    // Resume any suspended AudioContext (required for autoplay policy)
    try {
      const contexts = (window as any).__livekitAudioContexts || [];
      for (const ctx of contexts) {
        if (ctx && ctx.state === 'suspended') {
          await ctx.resume();
        }
      }
    } catch (e) {
      console.warn('Could not resume AudioContext:', e);
    }
    connectWithRetry();
  }, [userInteracted, connectWithRetry]);

  // Idle state - show start button
  if (connectionState === 'idle' && !userInteracted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-bold text-white mb-2">Ready to Start</h2>
          <p className="text-white/70 mb-6">Click the button below to begin your voice session</p>
          <button
            onClick={handleStartSession}
            className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold rounded-full hover:from-blue-700 hover:to-cyan-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Start Voice Session
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isConnecting || !token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-white">{connectionStatus}</p>
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
            onClick={() => connectWithRetry()}
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

  // Only render LiveKitRoom when we have a token and are ready to connect
  // Also ensure we only render once per session to prevent duplicate connections
  if (!token || connectionState === 'idle') {
    return null;
  }

  // Prevent duplicate LiveKitRoom renders if connection is already active
  // This handles React Strict Mode double-mounting in development
  // Check BEFORE setting the flag to handle the first render
  if (globalConnectionActive) {
    console.log('Connection already active globally, preventing duplicate LiveKitRoom render');
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-white">Connecting to existing session...</p>
        </div>
      </div>
    );
  }

  // Set the flag NOW before rendering LiveKitRoom to prevent second render from Strict Mode
  // This must happen before the component renders, not in onConnected
  if (!globalConnectionActive && shouldConnect) {
    console.log('Setting global connection flag before LiveKitRoom render');
    globalConnectionActive = true;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    }
  }

  // Use a stable key based on sessionId to prevent unnecessary remounts
  // Only change key when we explicitly want a fresh connection
  const roomKey = `room-${sessionId}`;

  return (
    <LiveKitRoom
      key={roomKey}
      token={token}
      serverUrl={serverUrl}
      connect={shouldConnect}
      audio={false}
      video={false}
      options={{
        adaptiveStream: true,
        dynacast: true,
        reconnectPolicy: new DefaultReconnectPolicy(),
      }}
      onConnected={() => {
        if (hasConnectedRef.current) {
          console.log('Already connected, skipping duplicate connection setup');
          return;
        }
        console.log('Connected to room');
        hasConnectedRef.current = true;
        // globalConnectionActive is already set before render, just ensure it's set
        globalConnectionActive = true;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, 'true');
        }
        setConnectionState('waiting-agent');
        setConnectionStatus('Connected to room. Waiting for agent…');
      }}
      onDisconnected={(reason) => {
        console.log('Disconnected:', reason);
        hasConnectedRef.current = false; // Reset connection tracking
        isConnectingRef.current = false; // Reset connecting flag
        connectionAttemptedRef.current = false; // Reset connection attempt flag
        connectInitiatedRef.current = false; // Reset so we can reconnect
        roomRef.current = null; // Clear room reference

        // Clear global connection flags
        globalConnectionActive = false;
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(STORAGE_KEY);
        }

        // Optional: Auto-reconnect (skip if user initiated disconnect)
        if (reason !== DisconnectReason.CLIENT_INITIATED && userInteracted) {
          setConnectionState('connecting');
          setConnectionStatus('Connection lost. Reconnecting…');
          setTimeout(() => connectWithRetry(), 2000);
        } else {
          setConnectionState('idle');
          setConnectionStatus('Disconnected. Click to reconnect');
        }
      }}
      onError={(error) => {
        console.error('Room error:', error);
        setError(error.message);
        setConnectionStatus(`Room error: ${error.message}`);
      }}
      className="h-screen w-full"
    >
      <VoiceInterface
        connectionState={connectionState}
        connectionStatus={connectionStatus}
        setConnectionState={setConnectionState}
        setConnectionStatus={setConnectionStatus}
        setAgentReady={setAgentReady}
        onRoomReady={(room) => {
          roomRef.current = room;
        }}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}


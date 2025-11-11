import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

// Do not cache endpoint result
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Extract parameters from query string
    const roomName = request.nextUrl.searchParams.get('roomName') || 'default-room';
    const participantName = request.nextUrl.searchParams.get('participantName') || 
                           `user-${Math.random().toString(36).substring(7)}`;
    
    // Validate environment variables
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
      console.error('Missing environment variables:', {
        hasApiKey: !!process.env.LIVEKIT_API_KEY,
        hasApiSecret: !!process.env.LIVEKIT_API_SECRET,
      });
      return NextResponse.json(
        { 
          error: 'Server configuration error: Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET. Please check your .env.local file.' 
        },
        { status: 500 }
      );
    }

    // Create access token
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: participantName,
        ttl: '10m', // Token expires in 10 minutes
      }
    );

    // Grant permissions
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,      // Can send audio
      canSubscribe: true,    // Can receive audio
      canPublishData: true,  // Can send data messages
    });

    // Generate JWT token
    const token = await at.toJwt();
    
    return NextResponse.json({ 
      token,
      roomName,
      participantName 
    }, {
      headers: { 
        "Cache-Control": "no-store",
        "Content-Type": "application/json"
      }
    });
    
  } catch (error) {
    console.error('Token generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate token: ${errorMessage}` },
      { status: 500 }
    );
  }
}


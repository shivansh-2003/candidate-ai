"""
LiveKit Voice Agent - Interview Assistant
==========================================
Voice-activated AI interview assistant with RAG capabilities.
"""

import os
import logging
from typing import Annotated
from datetime import datetime
from dotenv import load_dotenv

from livekit import rtc, agents
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    WorkerOptions,
    RunContext,
    cli,
)
from livekit.agents.llm import function_tool
from livekit.plugins import silero, deepgram, openai
from pinecone import Pinecone
from openai import AsyncOpenAI

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def prewarm(proc: JobProcess):
    """Prewarm function to load models before job starts."""
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("Models prewarmed")


class RAGRetriever:
    def __init__(self):
        pinecone_api_key = os.getenv("PINECONE_API_KEY")
        pinecone_index_name = os.getenv("PINECONE_INDEX_NAME")
        openai_api_key = os.getenv("OPENAI_API_KEY")
        
        if not pinecone_api_key:
            logger.warning("PINECONE_API_KEY not set - RAG will not be available")
            self.enabled = False
            return
        
        if not pinecone_index_name:
            logger.warning("PINECONE_INDEX_NAME not set - RAG will not be available")
            self.enabled = False
            return
            
        if not openai_api_key:
            logger.warning("OPENAI_API_KEY not set - RAG will not be available")
            self.enabled = False
            return
        
        try:
            self.pc = Pinecone(api_key=pinecone_api_key)
            self.index = self.pc.Index(pinecone_index_name)
            self.openai_client = AsyncOpenAI(api_key=openai_api_key)
            self.embed_model = "text-embedding-3-small"
            self.enabled = True
            logger.info("RAG system initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize RAG: {e}")
            self.enabled = False
        
    async def retrieve(self, query: str, top_k: int = 3) -> str:
        if not self.enabled:
            return "RAG system is not available. Please configure PINECONE_API_KEY, PINECONE_INDEX_NAME, and OPENAI_API_KEY."
        
        try:
            embedding_response = await self.openai_client.embeddings.create(
                input=query, model=self.embed_model
            )
            query_embedding = embedding_response.data[0].embedding
            
            results = self.index.query(
                vector=query_embedding,
                top_k=top_k,
                include_metadata=True
            )
            
            if not results.matches:
                return "No relevant information found."
            
            context_parts = []
            for match in results.matches:
                text = match.metadata.get("text", "")
                if text:
                    context_parts.append(f"[Score: {match.score:.2f}] {text}")
            
            return "\n\n".join(context_parts) if context_parts else "No relevant information found."
        except Exception as e:
            logger.error(f"RAG retrieval error: {e}")
            return "Error retrieving information."


_retriever = None


def get_retriever():
    global _retriever
    if _retriever is None:
        _retriever = RAGRetriever()
    return _retriever


@function_tool
async def search_knowledge_base(
    context: RunContext,
    query: Annotated[str, "The search query to find relevant information"]
) -> str:
    """Search the knowledge base for relevant information to answer user questions."""
    logger.info("=" * 80)
    logger.info(f"🔍 TOOL CALLED: search_knowledge_base")
    logger.info(f"📝 Query: {query}")
    logger.info("=" * 80)
    
    retriever = get_retriever()
    
    if not retriever.enabled:
        logger.warning("⚠️  RAG is not enabled")
        return "RAG system is not available. Please configure PINECONE_API_KEY, PINECONE_INDEX_NAME, and OPENAI_API_KEY."
    
    result = await retriever.retrieve(query)
    logger.info(f"✅ Search completed. Result length: {len(result)} characters")
    return result


@function_tool
async def get_current_date_and_time(context: RunContext) -> str:
    """Get the current date and time."""
    current_datetime = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    return f"The current date and time is {current_datetime}"


class InterviewAssistant(Agent):
    """Voice-activated AI interview assistant."""
    
    def __init__(self):
        super().__init__(
            instructions="""You are a personalized AI interview assistant - an intelligent extension of the candidate.
            Your purpose is to help with technical interview preparation by acting as an interactive knowledge base
            of the candidate's experiences, skills, and projects.

            CRITICAL: You have access to a search_knowledge_base tool. You MUST use this tool whenever:
            - User asks about specific projects, work experiences, or technical details
            - User asks "what projects have I worked on" or similar questions
            - User asks about technologies, frameworks, or tools they used
            - User asks about problem-solving approaches or challenges they faced
            - User requests examples or specific scenarios from their experience
            - ANY question about their background, resume, or past work

            TOOL USAGE:
            When user asks about their experience, ALWAYS call search_knowledge_base(query="their question")
            DO NOT try to answer from general knowledge - you must search the knowledge base first.
            
            CORE RESPONSIBILITIES:
            1. Answer questions about the candidate's technical background, projects, and experiences
            2. Conduct mock technical interviews with relevant questions
            3. Help recall specific details about past work, technologies used, and problem-solving approaches
            4. Provide context-aware responses based on the candidate's actual experience

            INTERACTION STYLE:
            - Be conversational and natural, as if you're the candidate thinking out loud
            - Keep responses concise and interview-appropriate (30-60 seconds typically)
            - When using search_knowledge_base, say 'Let me recall...' or 'Checking my notes...'
            - Reference specific projects, technologies, and experiences from the search results
            - For mock interviews, ask follow-up questions and probe deeper like real interviewers do

            HANDS-FREE OPTIMIZATION:
            - Assume the user might be driving or commuting - keep responses clear and memorable
            - Structure answers in logical chunks that are easy to process audibly
            - For complex topics, offer to break them down into smaller parts
            - Don't overload with too many details at once

            Always ground your responses in the candidate's actual knowledge base using the search_knowledge_base tool.
            If the search returns no information, acknowledge it honestly.""",
            tools=[search_knowledge_base, get_current_date_and_time]
        )
    
    async def on_enter(self):
        """Called when the agent becomes active."""
        logger.info("Interview assistant session started")
        await self.session.generate_reply(
            instructions="Greet the user warmly as their AI interview assistant. Let them know you can help with interview prep, recall their experiences, or conduct mock interviews."
        )
    
    async def on_exit(self):
        """Called when the agent session ends."""
        logger.info("Interview assistant session ended")


async def entrypoint(ctx: JobContext):
    """Main entry point for the agent worker."""
    
    logger.info(f"Agent started in room: {ctx.room.name}")
    
    # Configure the voice pipeline
    session = AgentSession(
        # Speech-to-Text
        stt=deepgram.STT(
            model="nova-3",
            language="en-US",
            interim_results=True,
            punctuate=True,
            smart_format=True
        ),
        
        # Large Language Model
        llm=openai.LLM(model=os.getenv("LLM_CHOICE", "gpt-4.1-mini")),
        
        # Text-to-Speech
        tts=openai.TTS(
            voice="alloy",
            speed=1.0,
        ),
        
        # Voice Activity Detection
        vad=silero.VAD.load(
            min_speech_duration=0.3,
            min_silence_duration=0.5,
            activation_threshold=0.5
        ),
    )
    
    # Handle session events
    @session.on("agent_state_changed")
    def on_state_changed(ev):
        """Log agent state changes."""
        logger.info(f"Agent state: {ev.old_state} -> {ev.new_state}")
    
    @session.on("user_speech_committed")
    def on_user_speech(msg):
        """Log user speech."""
        logger.info(f"User: {msg}")
    
    @session.on("agent_speech_committed")
    def on_agent_speech(msg):
        """Log agent speech."""
        logger.info(f"Agent: {msg}")
    
    # Start the session
    await session.start(
        room=ctx.room,
        agent=InterviewAssistant(),
    )


if __name__ == "__main__":
    # Run the agent using LiveKit CLI
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm
        )
    )
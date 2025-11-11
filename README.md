# LiveKit Voice Agent - Interview Assistant

## Project Overview

This project is a **real-time voice-activated AI interview assistant** built using LiveKit's agent framework. It helps candidates prepare for technical interviews by providing an intelligent, hands-free interface to access their knowledge base, practice mock interviews, and recall specific details about their past experiences and projects.

---

## Core Functionality

### 1. **Voice-Activated Interaction Pipeline**

The agent implements a complete voice interaction loop:

- **Speech-to-Text (STT)**: Uses Deepgram's Nova-3 model to convert user speech to text with:
  - Real-time interim results for responsiveness
  - Smart formatting and punctuation
  - English language optimization
  
- **Natural Language Understanding**: Powered by OpenAI's GPT-4.1-mini (configurable) to:
  - Understand user questions and intents
  - Decide when to invoke tools
  - Generate contextually relevant responses
  
- **Text-to-Speech (TTS)**: Uses OpenAI's TTS with "alloy" voice to:
  - Convert responses back to natural speech
  - Maintain conversational flow
  - Provide clear, audible feedback

- **Voice Activity Detection (VAD)**: Silero VAD for intelligent speech detection:
  - Minimum speech duration: 300ms
  - Minimum silence duration: 500ms
  - Activation threshold: 0.5
  - Ensures accurate turn-taking in conversations

---

### 2. **RAG-Powered Knowledge Retrieval**

The system implements a Retrieval-Augmented Generation (RAG) pipeline:

#### **RAGRetriever Class**
- **Vector Database**: Pinecone for semantic search
- **Embedding Model**: OpenAI's `text-embedding-3-small` for query vectorization
- **Top-K Retrieval**: Fetches the 3 most relevant documents per query

#### **Search Process**
1. Converts user query into embeddings using OpenAI
2. Performs semantic similarity search in Pinecone
3. Returns ranked results with relevance scores
4. Formats context for LLM consumption

#### **Use Cases**
- Retrieving specific project details
- Recalling technologies and frameworks used
- Finding problem-solving approaches from past work
- Accessing work experiences and achievements

---

### 3. **Function Tools**

The agent has access to two function tools that the LLM can invoke:

#### **`search_knowledge_base`**
```python
async def search_knowledge_base(query: str) -> str
```
- **Purpose**: Search the candidate's personal knowledge base
- **When Called**: 
  - Questions about specific projects
  - Queries about technical skills and experiences
  - Requests for examples or scenarios
  - Any background or resume-related questions
- **Returns**: Formatted context with relevance scores

#### **`get_current_date_and_time`**
```python
async def get_current_date_and_time() -> str
```
- **Purpose**: Provide current timestamp
- **Format**: "Month Day, Year at HH:MM AM/PM"
- **Use Case**: Time-aware responses and scheduling

---

### 4. **InterviewAssistant Agent**

The core agent class with specialized instructions:

#### **Personality & Role**
- Acts as an extension of the candidate's memory
- Conversational and natural tone
- Interview-appropriate response length (30-60 seconds)

#### **Key Behaviors**
1. **Tool-First Approach**: MUST use `search_knowledge_base` for any experience-related questions
2. **Grounded Responses**: Only provides information from actual knowledge base
3. **Honest Fallbacks**: Acknowledges when information isn't available
4. **Mock Interview Mode**: Can conduct practice interviews with follow-up questions

#### **Hands-Free Optimization**
- Designed for commuting/driving scenarios
- Clear, logical chunking of information
- Memorable structure for audio consumption
- Offers to break down complex topics

---

### 5. **Session Management**

#### **Lifecycle Hooks**

**`on_enter()`**
- Called when agent session starts
- Greets user warmly
- Explains available capabilities (interview prep, experience recall, mock interviews)

**`on_exit()`**
- Called when session ends
- Logs session termination

#### **Event Handlers**

**State Change Tracking**
```python
@session.on("agent_state_changed")
```
- Logs transitions between agent states
- Helps debug conversation flow

**Speech Monitoring**
```python
@session.on("user_speech_committed")
@session.on("agent_speech_committed")
```
- Logs all user and agent speech
- Provides conversation transcript
- Useful for debugging and analysis

---

### 6. **Pre-warming & Optimization**

```python
def prewarm(proc: JobProcess)
```
- **Purpose**: Load models before job execution
- **Loads**: Silero VAD model
- **Benefit**: Reduces latency on first interaction
- **Implementation**: Stores in `proc.userdata["vad"]`

---

### 7. **Deployment Architecture**

#### **Docker Containerization**
- **Base Image**: UV Python 3.13 on Debian Bookworm
- **Build Tools**: gcc, g++, python3-dev for native extensions
- **Package Manager**: UV for fast, reproducible dependency management
- **Security**: Runs as non-privileged user (UID 10001)

#### **Build Process**
1. Install system dependencies
2. Copy dependency files (`pyproject.toml`, `uv.lock`)
3. Install Python packages with locked versions
4. Copy application code
5. Pre-download ML models
6. Set non-root user permissions

#### **Runtime**
- Entry point: `uv run agent.py start`
- Connects to LiveKit server
- Waits for job assignments
- Handles multiple concurrent sessions

---

### 8. **Configuration & Environment**

Required environment variables:

```bash
PINECONE_API_KEY      # Pinecone vector DB access
PINECONE_INDEX_NAME   # Target index name
OPENAI_API_KEY        # For embeddings and LLM
LLM_CHOICE           # Model selection (default: gpt-4.1-mini)
LIVEKIT_URL          # LiveKit server URL
LIVEKIT_API_KEY      # LiveKit authentication
LIVEKIT_API_SECRET   # LiveKit authentication
```

---

### 9. **Error Handling & Logging**

#### **Graceful Degradation**
- RAG failures don't crash the agent
- Falls back to informing user when RAG unavailable
- Logs all errors with context

#### **Comprehensive Logging**
- Session lifecycle events
- Tool invocations with queries
- Search results metadata
- State transitions
- All speech inputs/outputs

---

## Technical Architecture

```
User Voice Input
      ↓
[Deepgram STT] → Text
      ↓
[OpenAI LLM] → Determines intent
      ↓
[Function Tool Invocation?]
      ↓
[RAGRetriever] → Pinecone → OpenAI Embeddings
      ↓
[Context + Response Generation]
      ↓
[OpenAI TTS] → Audio
      ↓
User Voice Output
```

---

## Key Features Summary

✅ **Real-time voice interaction** with sub-2 second latency  
✅ **Semantic search** over personal knowledge base  
✅ **Context-aware responses** grounded in actual experience  
✅ **Mock interview capabilities** with follow-up questions  
✅ **Hands-free operation** optimized for commuting  
✅ **Production-ready deployment** with Docker  
✅ **Comprehensive logging** for debugging and analysis  
✅ **Graceful error handling** with fallback mechanisms  
✅ **Scalable architecture** using LiveKit's agent framework

---

## Use Cases

1. **Interview Preparation**: Practice answering technical questions
2. **Experience Recall**: Quick access to project details before interviews
3. **Mock Interviews**: Simulate real interview scenarios
4. **Commute Learning**: Hands-free review while driving
5. **Knowledge Reinforcement**: Regular interaction with past work

This system transforms a static resume/knowledge base into an interactive, voice-enabled interview preparation tool that candidates can use anytime, anywhere.



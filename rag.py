import os
import asyncio
from dotenv import load_dotenv
from pinecone import Pinecone
from openai import AsyncOpenAI

load_dotenv()

class RAGRetriever:
    def __init__(self):
        pinecone_api_key = os.getenv("PINECONE_API_KEY")
        pinecone_index_name = os.getenv("PINECONE_INDEX_NAME")
        openai_api_key = os.getenv("OPENAI_API_KEY")
        
        if not pinecone_api_key:
            raise ValueError("PINECONE_API_KEY not set")
        if not pinecone_index_name:
            raise ValueError("PINECONE_INDEX_NAME not set")
        if not openai_api_key:
            raise ValueError("OPENAI_API_KEY not set")
        
        self.pc = Pinecone(api_key=pinecone_api_key)
        self.index = self.pc.Index(pinecone_index_name)
        self.openai_client = AsyncOpenAI(api_key=openai_api_key)
        self.embed_model = "text-embedding-3-small"
        print(f"✅ Connected to Pinecone index: {pinecone_index_name}")
        
    async def retrieve(self, query: str, top_k: int = 3) -> str:
        print(f"\n🔍 Searching for: {query}")
        
        embedding_response = await self.openai_client.embeddings.create(
            input=query, model=self.embed_model
        )
        query_embedding = embedding_response.data[0].embedding
        print(f"✅ Generated embedding (dimension: {len(query_embedding)})")
        
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True
        )
        
        print(f"✅ Found {len(results.matches)} matches\n")
        
        if not results.matches:
            return "No relevant information found."
        
        context_parts = []
        for i, match in enumerate(results.matches, 1):
            text = match.metadata.get("text", "")
            score = match.score
            print(f"Match {i} (Score: {score:.4f}):")
            print(f"  {text[:200]}..." if len(text) > 200 else f"  {text}")
            print()
            if text:
                context_parts.append(f"[Score: {score:.2f}] {text}")
        
        return "\n\n".join(context_parts) if context_parts else "No relevant information found."


async def test_rag():
    print("=" * 80)
    print("RAG RETRIEVAL TEST")
    print("=" * 80)
    
    try:
        retriever = RAGRetriever()
        
        query = "tell me about the data analyst agent ?"
        
        result = await retriever.retrieve(query)
        
        print("\n" + "=" * 80)
        print("FINAL RESULT:")
        print("=" * 80)
        print(result)
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_rag())
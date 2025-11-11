"""
Document Ingestion Pipeline
Handles PDF, DOCX, and PPTX document loading, chunking, and vector store creation
"""

import os
import sys
from pathlib import Path
from typing import List
from dotenv import load_dotenv
import config

# Load environment variables from .env file
load_dotenv()

from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    UnstructuredPowerPointLoader
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from pinecone import Pinecone
from langchain_pinecone import PineconeVectorStore


class DocumentIngestionPipeline:
    """Pipeline for ingesting documents into vector store"""
    
    def __init__(self):
        """Initialize the ingestion pipeline"""
        print("Initializing Document Ingestion Pipeline...")
        
        # Initialize OpenAI embeddings for ingestion
        # NOTE: Must use same embeddings as retrieval for dimension compatibility
        print(f"Loading OpenAI embedding model: {config.OPENAI_EMBEDDING_MODEL}")
        openai_api_key = os.getenv('OPENAI_API_KEY')
        if not openai_api_key:
            raise ValueError(
                "❌ OPENAI_API_KEY not set!\n"
                "Please set OPENAI_API_KEY environment variable or add it to your .env file"
            )
        self.embeddings = OpenAIEmbeddings(
            model=config.OPENAI_EMBEDDING_MODEL,
            openai_api_key=openai_api_key
        )
        
        # Initialize Pinecone
        print("Initializing Pinecone...")
        api_key = os.getenv('PINECONE_API_KEY', config.PINECONE_API_KEY)
        if api_key == "your-pinecone-api-key":
            raise ValueError(
                "❌ PINECONE_API_KEY not set!\n"
                "Please set PINECONE_API_KEY environment variable or update config.py"
            )
        
        self.pc = Pinecone(api_key=api_key)
        
        # Check if index exists (user should create it manually on Pinecone cloud)
        print(f"Checking for Pinecone index: {config.PINECONE_INDEX_NAME}")
        try:
            existing_indexes = [idx.name for idx in self.pc.list_indexes()]
            
            if config.PINECONE_INDEX_NAME not in existing_indexes:
                raise ValueError(
                    f"\n❌ Pinecone index '{config.PINECONE_INDEX_NAME}' not found!\n\n"
                    f"Please create the index manually on Pinecone Cloud with these settings:\n"
                    f"  - Index Name: {config.PINECONE_INDEX_NAME}\n"
                    f"  - Dimension: {config.PINECONE_DIMENSION}\n"
                    f"  - Metric: {config.PINECONE_METRIC}\n"
                    f"  - Cloud: {config.PINECONE_CLOUD}\n"
                    f"  - Region: {config.PINECONE_REGION}\n\n"
                    f"Visit: https://app.pinecone.io to create the index\n"
                )
            
            # Verify index is accessible and show stats
            print(f"✓ Found Pinecone index: {config.PINECONE_INDEX_NAME}")
            try:
                index = self.pc.Index(config.PINECONE_INDEX_NAME)
                index_stats = index.describe_index_stats()
                vector_count = index_stats.get('total_vector_count', 0)
                print(f"  Current vector count: {vector_count}")
            except Exception as e:
                print(f"  Warning: Could not retrieve index stats: {e}")
                
        except ValueError:
            # Re-raise ValueError with helpful message
            raise
        except Exception as e:
            raise RuntimeError(
                f"❌ Error connecting to Pinecone: {e}\n"
                f"Please check your PINECONE_API_KEY and network connection"
            ) from e
        
        # Initialize text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=config.CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP,
            separators=config.SEPARATORS
        )
        
        print("Pipeline initialized successfully!")
    
    def load_document(self, file_path: str) -> List:
        """
        Load document based on file extension
        
        Args:
            file_path: Path to the document file
            
        Returns:
            List of Document objects
        """
        file_extension = Path(file_path).suffix.lower()
        
        if file_extension not in config.SUPPORTED_EXTENSIONS:
            raise ValueError(f"Unsupported file type: {file_extension}. Supported: {config.SUPPORTED_EXTENSIONS}")
        
        print(f"Loading document: {file_path}")
        
        if file_extension == ".pdf":
            loader = PyPDFLoader(file_path)
        elif file_extension == ".docx":
            loader = Docx2txtLoader(file_path)
        elif file_extension == ".pptx":
            loader = UnstructuredPowerPointLoader(file_path)
        
        documents = loader.load()
        print(f"Loaded {len(documents)} pages/sections")
        
        return documents
    
    def chunk_documents(self, documents: List) -> List:
        """
        Split documents into chunks
        
        Args:
            documents: List of Document objects
            
        Returns:
            List of chunked Document objects
        """
        print(f"Chunking documents with size={config.CHUNK_SIZE}, overlap={config.CHUNK_OVERLAP}")
        chunks = self.text_splitter.split_documents(documents)
        print(f"Created {len(chunks)} chunks")
        return chunks
    
    def create_vector_store(self, chunks: List):
        """
        Create Pinecone vector store from chunks
        
        Args:
            chunks: List of chunked Document objects
            
        Returns:
            PineconeVectorStore instance
        """
        print(f"Creating Pinecone vector store with {len(chunks)} chunks...")
        
        vectorstore = PineconeVectorStore.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            index_name=config.PINECONE_INDEX_NAME
        )
        
        print(f"Vector store created in Pinecone index: {config.PINECONE_INDEX_NAME}")
        return vectorstore
    
    def process_document(self, file_path: str):
        """
        Complete pipeline: load -> chunk -> embed -> store
        
        Args:
            file_path: Path to document file
            
        Returns:
            PineconeVectorStore instance
        """
        print("\n" + "="*60)
        print("STARTING DOCUMENT INGESTION PIPELINE")
        print("="*60)
        
        documents = self.load_document(file_path)
        chunks = self.chunk_documents(documents)
        vectorstore = self.create_vector_store(chunks)
        
        print("\n" + "="*60)
        print("INGESTION PIPELINE COMPLETED SUCCESSFULLY")
        print("="*60 + "\n")
        
        return vectorstore
    
    def process_multiple_documents(self, file_paths: List[str]):
        """
        Process multiple documents into single vector store
        
        Args:
            file_paths: List of document file paths
            
        Returns:
            PineconeVectorStore instance
        """
        print("\n" + "="*60)
        print(f"PROCESSING {len(file_paths)} DOCUMENTS")
        print("="*60)
        
        all_chunks = []
        
        for file_path in file_paths:
            print(f"\nProcessing: {file_path}")
            documents = self.load_document(file_path)
            chunks = self.chunk_documents(documents)
            all_chunks.extend(chunks)
        
        print(f"\nTotal chunks from all documents: {len(all_chunks)}")
        vectorstore = self.create_vector_store(all_chunks)
        
        print("\n" + "="*60)
        print("MULTI-DOCUMENT INGESTION COMPLETED")
        print("="*60 + "\n")
        
        return vectorstore


def main():
    """Main function to ingest documents into vector store"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Ingest documents into Pinecone vector store")
    parser.add_argument(
        "file_path",
        nargs="?",
        default="shivansh_persona_knowledge_base.pdf",
        help="Path to the document file to ingest (default: shivansh_persona_knowledge_base.pdf)"
    )
    parser.add_argument(
        "--multiple",
        nargs="+",
        help="Process multiple documents (provide multiple file paths)"
    )
    
    args = parser.parse_args()
    
    try:
        # Initialize pipeline
        pipeline = DocumentIngestionPipeline()
        
        # Process document(s)
        if args.multiple:
            # Process multiple documents
            file_paths = args.multiple
            print(f"\nProcessing {len(file_paths)} documents...")
            for fp in file_paths:
                if not os.path.exists(fp):
                    raise FileNotFoundError(f"File not found: {fp}")
            pipeline.process_multiple_documents(file_paths)
        else:
            # Process single document
            file_path = args.file_path
            
            # Check if file exists
            if not os.path.exists(file_path):
                # Try with current directory
                current_dir_file = os.path.join(os.getcwd(), file_path)
                if os.path.exists(current_dir_file):
                    file_path = current_dir_file
                else:
                    raise FileNotFoundError(
                        f"File not found: {file_path}\n"
                        f"Current directory: {os.getcwd()}\n"
                        f"Please provide the correct path to the PDF file."
                    )
            
            pipeline.process_document(file_path)
            
    except FileNotFoundError as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
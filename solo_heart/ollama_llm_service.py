#!/usr/bin/env python3
"""
Ollama LLM Service for SoloHeart
Centralized service for all LLM interactions using Ollama with LLaMA 3.
"""

import os
import json
import logging
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OllamaLLMService:
    """Centralized service for Ollama LLM interactions."""
    
    def __init__(self, model_name: str = "llama3", base_url: str = "http://localhost:11434"):
        self.model_name = model_name
        self.base_url = base_url
        self.chat_endpoint = f"{base_url}/api/chat"
        self.health_endpoint = f"{base_url}/api/tags"
        
        # Verify Ollama is running
        self._verify_ollama_connection()
    
    def _verify_ollama_connection(self):
        """Verify that Ollama is running and accessible."""
        try:
            response = requests.get(self.health_endpoint, timeout=5)
            if response.status_code == 200:
                logger.info(f"✅ Ollama connection verified at {self.base_url}")
                # Check if the model is available
                models = response.json().get('models', [])
                model_names = [model.get('name', '') for model in models]
                if self.model_name in model_names:
                    logger.info(f"✅ Model '{self.model_name}' is available")
                else:
                    logger.warning(f"⚠️  Model '{self.model_name}' not found. Available models: {model_names}")
                    logger.info("💡 You may need to pull the model: ollama pull llama3")
            else:
                raise Exception(f"Ollama health check failed with status {response.status_code}")
        except requests.exceptions.ConnectionError:
            raise Exception(f"❌ Cannot connect to Ollama at {self.base_url}. Is Ollama running?")
        except Exception as e:
            raise Exception(f"❌ Ollama connection error: {e}")
    
    def chat_completion(self, messages: List[Dict[str, str]], temperature: float = 0.7, max_tokens: Optional[int] = None) -> str:
        """
        Send a chat completion request to Ollama.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
            temperature: Controls randomness (0.0 to 1.0)
            max_tokens: Maximum tokens to generate (optional)
        
        Returns:
            The assistant's response content as a string
        
        Raises:
            Exception: If Ollama is not available or request fails
        """
        try:
            # Prepare the request payload
            payload = {
                "model": self.model_name,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": temperature
                }
            }
            
            # Add max_tokens if specified
            if max_tokens:
                payload["options"]["num_predict"] = max_tokens
            
            logger.debug(f"Sending request to Ollama: {json.dumps(payload, indent=2)}")
            
            # Make the request
            response = requests.post(
                self.chat_endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=60  # 60 second timeout for LLM responses
            )
            
            if response.status_code != 200:
                raise Exception(f"Ollama API error: {response.status_code} - {response.text}")
            
            # Parse the response
            response_data = response.json()
            assistant_message = response_data.get('message', {})
            content = assistant_message.get('content', '')
            
            if not content:
                raise Exception("Empty response from Ollama")
            
            logger.debug(f"Received response from Ollama: {content[:100]}...")
            return content
            
        except requests.exceptions.ConnectionError:
            raise Exception(f"❌ Cannot connect to Ollama at {self.base_url}. Is Ollama running?")
        except requests.exceptions.Timeout:
            raise Exception("❌ Ollama request timed out. The model may be too slow or overloaded.")
        except Exception as e:
            raise Exception(f"❌ Ollama API error: {e}")
    
    def generate_text(self, prompt: str, system_prompt: str = "", temperature: float = 0.7) -> str:
        """
        Generate text using a simple prompt format.
        
        Args:
            prompt: The user prompt
            system_prompt: Optional system prompt
            temperature: Controls randomness
        
        Returns:
            Generated text
        """
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        return self.chat_completion(messages, temperature=temperature)
    
    def generate_conversation_response(self, conversation_history: List[Dict[str, str]], system_prompt: str = "", temperature: float = 0.7) -> str:
        """
        Generate a response in a conversation context.
        
        Args:
            conversation_history: List of message dictionaries
            system_prompt: Optional system prompt
            temperature: Controls randomness
        
        Returns:
            The assistant's response
        """
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        # Add conversation history
        messages.extend(conversation_history)
        
        return self.chat_completion(messages, temperature=temperature)

# Global instance for use throughout the application
_ollama_service = None

def get_ollama_service() -> OllamaLLMService:
    """Get the global Ollama service instance."""
    global _ollama_service
    if _ollama_service is None:
        _ollama_service = OllamaLLMService()
    return _ollama_service

def chat_completion(messages: List[Dict[str, str]], temperature: float = 0.7, max_tokens: Optional[int] = None) -> str:
    """Convenience function for chat completion."""
    service = get_ollama_service()
    return service.chat_completion(messages, temperature, max_tokens)

def generate_text(prompt: str, system_prompt: str = "", temperature: float = 0.7) -> str:
    """Convenience function for text generation."""
    service = get_ollama_service()
    return service.generate_text(prompt, system_prompt, temperature)

def generate_conversation_response(conversation_history: List[Dict[str, str]], system_prompt: str = "", temperature: float = 0.7) -> str:
    """Convenience function for conversation responses."""
    service = get_ollama_service()
    return service.generate_conversation_response(conversation_history, system_prompt, temperature) 
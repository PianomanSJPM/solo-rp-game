#!/usr/bin/env python3
"""
Consumer-Friendly Launcher for SoloHeart
Simple setup and launch for non-technical users.
"""

import subprocess
import sys
import time
import os
import webbrowser

def main():
    print("🎲 SoloHeart - AI Adventure Game")
    print("=" * 40)
    
    # Check if .env exists and configure Ollama
    if not os.path.exists('.env'):
        print("🔧 First time setup - configuring Ollama LLM service")
        print("Make sure Ollama is running with LLaMA 3 model available")
        print("Install Ollama from: https://ollama.ai")
        print("Then run: ollama pull llama3")
        
        # Create .env file with Ollama configuration
        with open('.env', 'w') as f:
            f.write("OLLAMA_MODEL=llama3\n")
            f.write("OLLAMA_BASE_URL=http://localhost:11434\n")
            f.write("FLASK_SECRET_KEY=your_secret_key_here\n")
            f.write("FLASK_ENV=production\n")
            f.write("DEBUG=False\n")
            f.write("HOST=0.0.0.0\n")
            f.write("PORT=5001\n")
        
        print("✅ Ollama configuration complete!")
        print("💡 Make sure Ollama is running before starting the game")
    
    print("🚀 Starting game...")
    
    # Start the game
    try:
        process = subprocess.Popen([sys.executable, 'solo_heart/simple_unified_interface.py'])
        time.sleep(3)
        
        print("✅ Game started!")
        print("🌐 Opening in browser...")
        webbrowser.open('http://localhost:5001')
        
        print("\n🎮 How to play:")
        print("1. Click 'Start New Campaign'")
        print("2. Choose 'Natural Language' for character creation")
        print("3. Describe your character concept")
        print("4. Start your adventure!")
        print("\n🛑 Press Ctrl+C to stop")
        
        process.wait()
        
    except KeyboardInterrupt:
        print("\n🛑 Stopping game...")
        process.terminate()
        print("✅ Game stopped!")

if __name__ == '__main__':
    main() 
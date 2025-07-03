#!/usr/bin/env python3
"""
Simple Unified SoloHeart Narrative Interface
A single Flask server that provides the complete immersive solo DnD experience.
"""

import os
import json
import logging
import uuid
import datetime
from typing import Dict, List, Optional, Any
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from ollama_llm_service import chat_completion

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ollama LLM service - no fallbacks, must be available

app = Flask(__name__, template_folder='../templates', static_folder='../static')
app.secret_key = os.environ.get('SECRET_KEY', 'unified-narrative-key')

class SimpleCharacterGenerator:
    """Simple character generator for step-by-step guided character creation with immediate fact commitment."""
    
    def __init__(self, playtest_mode: bool = None):
        self.conversation_history = []
        self.character_data = {
            "name": "Adventurer",
            "race": "Unknown",
            "class": "Unknown",
            "level": 1,
            "background": "Unknown",
            "alignment": "Neutral",
            "personality": "A brave adventurer",
            "ability_scores": {
                "strength": 10, "dexterity": 10, "constitution": 10,
                "intelligence": 10, "wisdom": 10, "charisma": 10
            },
            "hit_points": 10,
            "armor_class": 10,
            "saving_throws": [],
            "skills": [],
            "feats": [],
            "weapons": [],
            "gear": [],
            "spells": [],
            "background_freeform": "",
            "created_date": None
        }
        self.is_complete = False
        self.character_finalized = False
        self.in_review_mode = False
        self.confirmed_facts = set()
        self.narrative_bridge = None
        self.fact_history = []
        
        # Step-by-step creation tracking
        self.creation_steps = [
            "race", "class", "name", "background", "personality", "ability_scores"
        ]
        self.current_step_index = 0
        self.in_ability_score_assignment = False
        
        if playtest_mode is None:
            playtest_mode = os.environ.get('PLAYTEST_LOG', '0') == '1'
        self.playtest_mode = playtest_mode
    
    def _log(self, method, *args, **kwargs):
        # Logging disabled - removed playtest logger
        pass
    
    def _get_current_step(self) -> str:
        """Get the current step in character creation."""
        if self.current_step_index < len(self.creation_steps):
            return self.creation_steps[self.current_step_index]
        return "complete"
    
    def _get_next_step_prompt(self) -> str:
        """Generate the appropriate prompt for the current step."""
        current_step = self._get_current_step()
        
        if current_step == "race":
            return "What race would you like to be? Your options include: Human, Elf, Dwarf, Halfling, Dragonborn, Gnome, Half-Elf, Half-Orc, and Tiefling. Each race has unique abilities and traits."
        
        elif current_step == "class":
            race = self.character_data.get("race", "Unknown")
            return f"Great! You're a {race}. What class would you like to be? Your options include: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, and Wizard. Each class has different abilities and playstyles."
        
        elif current_step == "name":
            race = self.character_data.get("race", "Unknown")
            char_class = self.character_data.get("class", "Unknown")
            return f"Perfect! You're a {race} {char_class}. What's your character's name?"
        
        elif current_step == "background":
            name = self.character_data.get("name", "Adventurer")
            race = self.character_data.get("race", "Unknown")
            char_class = self.character_data.get("class", "Unknown")
            return f"Excellent! {name} the {race} {char_class}. What background does your character have? Your options include: Acolyte, Criminal, Folk Hero, Noble, Sage, Soldier, or you can describe a custom background."
        
        elif current_step == "personality":
            name = self.character_data.get("name", "Adventurer")
            return f"Great! Now tell me about {name}'s personality. What are they like? Are they brave, cautious, friendly, mysterious, or something else? Describe their character and temperament."
        
        elif current_step == "ability_scores":
            name = self.character_data.get("name", "Adventurer")
            char_class = self.character_data.get("class", "Unknown")
            return f"Perfect! Now let's assign {name}'s ability scores. As a {char_class}, you'll want to focus on certain abilities. I can suggest scores based on your class, or you can choose your own method. Would you like me to suggest optimal scores for a {char_class}, or do you have a preference for how to assign them?"
        
        else:
            return "Character creation is complete! Let's review your character."
    
    def _extract_single_fact(self, user_input: str, step: str) -> Optional[str]:
        """Extract a single fact from user input for the current step."""
        user_input_lower = user_input.lower()
        logger.info(f"Extracting {step} from: '{user_input}'")
        
        if step == "race":
            races = ["human", "elf", "dwarf", "halfling", "dragonborn", "gnome", "half-elf", "half-orc", "tiefling"]
            # Clean the input by removing punctuation and extra spaces
            import re
            clean_input = re.sub(r'[^\w\s]', ' ', user_input_lower)
            clean_input = ' '.join(clean_input.split())
            
            for race in races:
                # Check if the race appears as a whole word
                if re.search(r'\b' + race + r'\b', clean_input):
                    return race.title()
        
        elif step == "class":
            classes = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"]
            # Clean the input by removing punctuation and extra spaces
            import re
            clean_input = re.sub(r'[^\w\s]', ' ', user_input_lower)
            clean_input = ' '.join(clean_input.split())
            
            for char_class in classes:
                # Check if the class appears as a whole word
                if re.search(r'\b' + char_class + r'\b', clean_input):
                    return char_class.title()
        
        elif step == "name":
            # Extract name from various patterns
            import re
            name_patterns = [
                r"my name is ([a-z]+)", r"i'm called ([a-z]+)", r"call me ([a-z]+)",
                r"my character is named ([a-z]+)", r"name me ([a-z]+)",
                r"^i am ([a-z]+)$", r"^i'm ([a-z]+)$",
                r"my name's ([a-z]+)", r"i go by ([a-z]+)",
                r"my character is ([a-z]+)", r"([a-z]+) is my name",
                r"name is ([a-z]+)", r"called ([a-z]+)", r"named ([a-z]+)",
                r"my character's name is ([a-z]+)", r"character name is ([a-z]+)",
                r"i want to be ([a-z]+)", r"i want to play ([a-z]+)"
            ]
            for pattern in name_patterns:
                match = re.search(pattern, user_input_lower)
                if match:
                    return match.group(1).title()
            
            # If no pattern matches, try to extract a single word that could be a name
            words = user_input_lower.split()
            for word in words:
                if len(word) > 2 and word.isalpha() and word not in ["the", "and", "but", "for", "with", "from", "that", "this", "they", "them", "their", "have", "will", "would", "could", "should", "want", "like", "make", "create", "character", "name", "race", "class", "background", "personality", "ability", "scores", "stats", "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]:
                    return word.title()
        
        elif step == "background":
            backgrounds = ["acolyte", "criminal", "folk hero", "noble", "sage", "soldier"]
            for bg in backgrounds:
                if bg in user_input_lower:
                    return bg.title()
            # For custom backgrounds, return the input as-is
            return user_input.strip()
        
        elif step == "personality":
            # For personality, return the input as-is
            return user_input.strip()
        
        return None
    
    def _extract_fact_with_llm(self, user_input: str, step: str) -> Optional[str]:
        """Use LLM to extract a fact from user input for the current step."""
        try:
            step_prompts = {
                "race": "What race did the player choose? Extract only the race name from their response. Valid options: Human, Elf, Dwarf, Halfling, Dragonborn, Gnome, Half-Elf, Half-Orc, Tiefling. Return only the race name, nothing else.",
                "class": "What class did the player choose? Extract only the class name from their response. Valid options: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard. Return only the class name, nothing else.",
                "name": "What is the character's name? Extract only the name from their response. Return only the name, nothing else.",
                "background": "What background did the player choose? Extract only the background name from their response. Valid options: Acolyte, Criminal, Folk Hero, Noble, Sage, Soldier, or return their custom background description. Return only the background, nothing else.",
                "personality": "What personality traits did the player describe? Extract their personality description from their response. Return only the personality description, nothing else."
            }
            
            if step not in step_prompts:
                return None
            
            prompt = f"Player input: '{user_input}'\n\n{step_prompts[step]}"
            
            response = chat_completion([
                {"role": "system", "content": "You are a DnD 5e character creation assistant. Extract specific facts from player input. Return only the requested information, no explanations."},
                {"role": "user", "content": prompt}
            ], temperature=0.1, max_tokens=50)
            
            # Clean the response
            extracted_fact = response.strip()
            if extracted_fact and extracted_fact.lower() not in ["none", "unknown", "not specified", ""]:
                logger.info(f"LLM extracted {step}: '{extracted_fact}' from '{user_input}'")
                return extracted_fact
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting fact with LLM: {e}")
            # Fallback to simple extraction
            return self._extract_single_fact(user_input, step)
    
    def _commit_step_fact(self, step: str, value: str) -> None:
        """Commit a fact for the current step and advance to the next step."""
        try:
            old_value = self.character_data.get(step)
            self.fact_history.append((step, old_value))
            logger.info(f"Committing {step} = {value} (old value: {old_value})")
            
            if step == "name":
                self.character_data["name"] = value
            elif step == "race":
                self.character_data["race"] = value
            elif step == "class":
                self.character_data["class"] = value
                self.character_data["saving_throws"] = self._get_class_saving_throws(value)
                self.character_data["skills"] = self._get_class_skills(value)
                weapons, gear, spells = self._generate_equipment(value)
                self.character_data["weapons"] = weapons
                self.character_data["gear"] = gear
                self.character_data["spells"] = spells
                self.character_data["ability_scores"] = self._generate_ability_scores(value)
            elif step == "background":
                self.character_data["background"] = value
            elif step == "personality":
                self.character_data["personality"] = value
            
            self.confirmed_facts.add(step)
            timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
            logger.info(f"[STEP COMMIT] {step} = {value} (replaced: {old_value}) @ {timestamp}")
            
            # Advance to next step
            self.current_step_index += 1
            
        except Exception as e:
            logger.error(f"Error committing step fact {step}: {e}")
    
    def _generate_ability_score_suggestions(self, char_class: str) -> Dict[str, int]:
        """Generate suggested ability scores based on class."""
        suggestions = {
            "strength": 10, "dexterity": 10, "constitution": 12,
            "intelligence": 10, "wisdom": 10, "charisma": 10
        }
        
        # Class-specific suggestions
        if char_class == "Fighter":
            suggestions.update({"strength": 16, "constitution": 14, "dexterity": 12})
        elif char_class == "Wizard":
            suggestions.update({"intelligence": 16, "constitution": 12, "dexterity": 12})
        elif char_class == "Paladin":
            suggestions.update({"strength": 16, "charisma": 14, "constitution": 12})
        elif char_class == "Rogue":
            suggestions.update({"dexterity": 16, "intelligence": 12, "constitution": 12})
        elif char_class == "Cleric":
            suggestions.update({"wisdom": 16, "constitution": 12, "strength": 12})
        elif char_class == "Bard":
            suggestions.update({"charisma": 16, "dexterity": 14, "constitution": 12})
        elif char_class == "Monk":
            suggestions.update({"dexterity": 16, "wisdom": 14, "constitution": 12})
        elif char_class == "Ranger":
            suggestions.update({"dexterity": 16, "wisdom": 14, "constitution": 12})
        elif char_class == "Sorcerer":
            suggestions.update({"charisma": 16, "constitution": 12, "dexterity": 12})
        elif char_class == "Warlock":
            suggestions.update({"charisma": 16, "constitution": 12, "dexterity": 12})
        elif char_class == "Barbarian":
            suggestions.update({"strength": 16, "constitution": 14, "dexterity": 12})
        elif char_class == "Druid":
            suggestions.update({"wisdom": 16, "constitution": 12, "dexterity": 12})
        
        return suggestions
    
    def _get_step_confirmation(self, step: str, value: str) -> str:
        """Generate a confirmation message for the committed fact."""
        if step == "race":
            return f"Excellent! You are a {value}."
        elif step == "class":
            race = self.character_data.get("race", "Unknown")
            return f"Perfect! You are a {race} {value}."
        elif step == "name":
            race = self.character_data.get("race", "Unknown")
            char_class = self.character_data.get("class", "Unknown")
            return f"Great! {value} the {race} {char_class}."
        elif step == "background":
            name = self.character_data.get("name", "Adventurer")
            return f"Wonderful! {name} has a {value} background."
        elif step == "personality":
            name = self.character_data.get("name", "Adventurer")
            return f"Perfect! {name} is {value}."
        else:
            return f"Great! {step} set to {value}."
    
    def _get_clarification_prompt(self, step: str, user_input: str) -> str:
        """Generate a clarification prompt when fact extraction fails."""
        if step == "race":
            return f"I didn't quite catch that. Could you please tell me what race you'd like to be? Your options are: Human, Elf, Dwarf, Halfling, Dragonborn, Gnome, Half-Elf, Half-Orc, and Tiefling."
        elif step == "class":
            race = self.character_data.get("race", "Unknown")
            return f"I didn't quite catch that. Could you please tell me what class you'd like to be? As a {race}, you can choose from: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, and Wizard."
        elif step == "name":
            return f"I didn't quite catch your character's name. Could you please tell me what your character is called?"
        elif step == "background":
            return f"I didn't quite catch that. Could you please tell me what background your character has? You can choose from: Acolyte, Criminal, Folk Hero, Noble, Sage, Soldier, or describe a custom background."
        elif step == "personality":
            return f"I didn't quite catch that. Could you please tell me about your character's personality? What are they like?"
        else:
            return f"I didn't quite understand. Could you please clarify?"
    
    def _handle_ability_score_assignment(self, user_input: str) -> Dict[str, Any]:
        """Handle the ability score assignment step."""
        user_input_lower = user_input.lower()
        char_class = self.character_data.get("class", "Unknown")
        
        # Check if user wants suggestions
        if any(word in user_input_lower for word in ["suggest", "optimal", "recommend", "auto", "automatic"]):
            suggestions = self._generate_ability_score_suggestions(char_class)
            self.character_data["ability_scores"] = suggestions
            self.confirmed_facts.add("ability_scores")
            self.current_step_index += 1
            
            response = f"Perfect! I've assigned optimal ability scores for a {char_class}:\n\n"
            for ability, score in suggestions.items():
                response += f"• {ability.title()}: {score}\n"
            response += f"\n{self.get_character_summary()}\n\n🎯 **Character Creation Complete!**\n\nHere is your complete character sheet. Would you like to begin the campaign or make any changes?"
            
            self.conversation_history.append({"role": "assistant", "content": response})
            self.in_review_mode = True
            self.is_complete = True
            
            return {
                "success": True,
                "message": response,
                "is_complete": True,
                "in_review_mode": True
            }
        
        # Check if user wants to assign manually
        elif any(word in user_input_lower for word in ["manual", "myself", "choose", "pick", "assign"]):
            response = f"Great! You can assign your ability scores manually. You have 27 points to spend on your six abilities (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma). Each ability starts at 8, and costs increase as scores get higher. Would you like me to explain the point-buy system, or do you have specific scores in mind?"
            
            self.conversation_history.append({"role": "assistant", "content": response})
            return {
                "success": True,
                "message": response,
                "is_complete": False,
                "current_step": "ability_scores"
            }
        
        # Try to extract ability scores from input
        else:
            # For now, just use suggestions if we can't parse manual scores
            suggestions = self._generate_ability_score_suggestions(char_class)
            self.character_data["ability_scores"] = suggestions
            self.confirmed_facts.add("ability_scores")
            self.current_step_index += 1
            
            response = f"I've assigned ability scores for your {char_class}:\n\n"
            for ability, score in suggestions.items():
                response += f"• {ability.title()}: {score}\n"
            response += f"\n{self.get_character_summary()}\n\n🎯 **Character Creation Complete!**\n\nHere is your complete character sheet. Would you like to begin the campaign or make any changes?"
            
            self.conversation_history.append({"role": "assistant", "content": response})
            self.in_review_mode = True
            self.is_complete = True
            
            return {
                "success": True,
                "message": response,
                "is_complete": True,
                "in_review_mode": True
            }
    
    def _log(self, method, *args, **kwargs):
        # Logging disabled - removed playtest logger
        pass
    
    def _mock_llm_response(self, messages: List[Dict[str, str]]) -> str:
        """Generate deterministic mock responses for offline testing."""
        try:
            # Get the last user message and system message
            last_user_message = ""
            system_message = ""
            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                elif msg["role"] == "user":
                    last_user_message = msg["content"].lower()
            
            # Extract current character state from system message
            current_race = "Unknown"
            current_class = "Unknown"
            current_name = "Adventurer"
            current_background = "Unknown"
            
            if "CONFIRMED CHARACTER FACTS:" in system_message:
                if "Race: Human" in system_message:
                    current_race = "Human"
                elif "Race: Elf" in system_message:
                    current_race = "Elf"
                elif "Race: Dwarf" in system_message:
                    current_race = "Dwarf"
                elif "Race: Dragonborn" in system_message:
                    current_race = "Dragonborn"
                
                if "Class: Fighter" in system_message:
                    current_class = "Fighter"
                elif "Class: Wizard" in system_message:
                    current_class = "Wizard"
                elif "Class: Paladin" in system_message:
                    current_class = "Paladin"
                elif "Class: Monk" in system_message:
                    current_class = "Monk"
                
                if "Name: " in system_message:
                    name_match = system_message.split("Name: ")[1].split("\n")[0]
                    if name_match != "Not specified":
                        current_name = name_match
                
                if "Background: " in system_message:
                    bg_match = system_message.split("Background: ")[1].split("\n")[0]
                    if bg_match != "Not specified":
                        current_background = bg_match
            
            # Handle specific edit requests for testing
            if "change my class to wizard" in last_user_message:
                return "Class changed to Wizard. What else would you like to modify?"
            elif "make me chaotic neutral" in last_user_message:
                return "Alignment changed to Chaotic Neutral. What else would you like to modify?"
            elif "change my name to alice" in last_user_message:
                return "Name changed to Alice. What else would you like to modify?"
            elif "change my background to noble" in last_user_message:
                return "Background changed to Noble. What else would you like to modify?"
            elif "change my class to barbarian" in last_user_message:
                return "Character is already finalized and cannot be edited."
            
            # Handle compound statements (multiple facts in one input)
            if "human paladin" in last_user_message:
                return "Excellent! You are a Human Paladin. What's your name?"
            elif "human fighter" in last_user_message:
                return "Perfect! You are a Human Fighter. What's your name?"
            elif "human wizard" in last_user_message:
                return "Great choice! You are a Human Wizard. What's your name?"
            elif "elf wizard" in last_user_message:
                return "A wise choice! You are an Elf Wizard. What's your name?"
            elif "dwarf fighter" in last_user_message:
                return "Excellent! You are a Dwarf Fighter. What's your name?"
            elif "human monk" in last_user_message:
                return "Great choice! You are a Human Monk. What's your name?"
            
            # Generate context-aware responses
            if "what do you know" in last_user_message or "character so far" in last_user_message:
                response_parts = []
                if current_race != "Unknown":
                    response_parts.append(f"a {current_race}")
                if current_class != "Unknown":
                    response_parts.append(f"{current_class}")
                if current_name != "Adventurer":
                    response_parts.append(f"named {current_name}")
                if current_background != "Unknown":
                    response_parts.append(f"with a {current_background} background")
                
                if response_parts:
                    return f"Based on our conversation, you are {' '.join(response_parts)}. What would you like to tell me next?"
                else:
                    return "We're just getting started! What race would you like to be?"
            
            elif "dragonborn" in last_user_message:
                return "Excellent choice! You are a Dragonborn. What class would you like to be?"
            elif "elf" in last_user_message:
                return "A wise choice! You are an Elf. What class would you like to be?"
            elif "human" in last_user_message:
                return "A classic choice! You are a Human. What class would you like to be?"
            elif "fighter" in last_user_message:
                if current_race != "Unknown":
                    return f"Perfect! You are a {current_race} Fighter. What's your name?"
                else:
                    return "Perfect! You are a Fighter. What race would you like to be?"
            elif "wizard" in last_user_message:
                if current_race != "Unknown":
                    return f"Excellent! You are a {current_race} Wizard. What's your name?"
                else:
                    return "Excellent! You are a Wizard. What race would you like to be?"
            elif "monk" in last_user_message:
                if current_race != "Unknown":
                    return f"Excellent choice! You are a {current_race} Monk. What's your name?"
                else:
                    return "Excellent choice! You are a Monk. What race would you like to be?"
            elif "paladin" in last_user_message:
                if current_race != "Unknown":
                    return f"Great choice! You are a {current_race} Paladin. What's your name?"
                else:
                    return "Great choice! You are a Paladin. What race would you like to be?"
            elif "name" in last_user_message or "called" in last_user_message:
                if current_race != "Unknown" and current_class != "Unknown":
                    return f"Great name! As a {current_race} {current_class}, what background would you like?"
                else:
                    return "Great name! What background would you like for your character?"
            elif "criminal background" in last_user_message:
                return "Perfect background choice! Character creation complete! Here's your character summary."
            elif "complete" in last_user_message or "done" in last_user_message:
                return "Character creation complete! Your character has been created successfully."
            elif "actually" in last_user_message:
                # Handle stability-first logic - remind about review phase
                if any(word in last_user_message for word in ["human", "elf", "dwarf", "fighter", "wizard", "monk", "name", "background"]):
                    return "I understand you want to make a change! We'll have a chance to make changes after the character is complete. For now, let's finish gathering all the information we need."
                else:
                    return "I understand you want to make a change. What would you like to modify?"
            else:
                return "I'd be happy to help you create a character! What race would you like to be?"
                
        except Exception as e:
            logger.error(f"Error in mock LLM response: {e}")
            return "I'm here to help you create your character. What would you like to know?"
    
    def _real_llm_call(self, messages: List[Dict[str, str]]) -> str:
        """Make a real LLM call to Ollama."""
        try:
            import time
            
            # Add a small delay to avoid overwhelming the local model
            time.sleep(0.5)
            
            response_content = chat_completion(messages, temperature=0.7, max_tokens=500)
            return response_content.strip()
        except Exception as e:
            logger.error(f"Error in Ollama LLM call: {e}")
            raise Exception(f"Ollama LLM service error: {e}")
    
    def start_character_creation(self, description: str, campaign_name: str = "") -> Dict[str, Any]:
        """Start step-by-step character creation."""
        try:
            # Reset to beginning
            self.current_step_index = 0
            self.confirmed_facts.clear()
            self.conversation_history = []
            self.in_review_mode = False
            self.is_complete = False
            
            # Get the first step prompt
            first_prompt = self._get_next_step_prompt()
            
            # Store initial conversation
            self.conversation_history = [
                {"role": "system", "content": "You are a helpful DnD 5e character creation assistant guiding the player through each step one at a time."},
                {"role": "assistant", "content": first_prompt}
            ]
            
            self._log('log_state', self.character_data)
            
            return {
                "success": True,
                "message": first_prompt,
                "is_complete": False,
                "current_step": self._get_current_step()
            }
            
        except Exception as e:
            self._log('log_error', str(e))
            logger.error(f"Error starting character creation: {e}")
            return {
                "success": False,
                "message": "Error starting character creation. Please try again."
            }
    
    def continue_conversation(self, user_input: str) -> Dict[str, Any]:
        """Continue step-by-step character creation with immediate fact commitment."""
        try:
            self._log('log_user_input', user_input)
            self.conversation_history.append({"role": "user", "content": user_input})
            
            current_step = self._get_current_step()
            logger.info(f"Current step: {current_step}")
            logger.info(f"Current character data: {self.character_data}")
            
            # Handle ability score assignment
            if current_step == "ability_scores":
                return self._handle_ability_score_assignment(user_input)
            
            # Handle completion
            if current_step == "complete":
                self.in_review_mode = True
                self.is_complete = True
                return {
                    "success": True,
                    "message": f"{self.get_character_summary()}\n\n🎯 **Character Creation Complete!**\n\nHere is your complete character sheet. Would you like to begin the campaign or make any changes?",
                    "is_complete": True,
                    "in_review_mode": True
                }
            
            # Use LLM to extract fact for current step
            extracted_fact = self._extract_fact_with_llm(user_input, current_step)
            logger.info(f"Current step: {current_step}, Extracted fact: {extracted_fact}")
            
            if extracted_fact:
                # Commit the fact immediately
                self._commit_step_fact(current_step, extracted_fact)
                logger.info(f"Committed {current_step}: {extracted_fact}")
                logger.info(f"Character data after commit: {self.character_data}")
                
                # Generate confirmation and next step
                confirmation = self._get_step_confirmation(current_step, extracted_fact)
                next_step = self._get_current_step()
                
                if next_step == "complete":
                    # Character creation is complete
                    self.in_review_mode = True
                    self.is_complete = True
                    response = f"{confirmation}\n\n{self.get_character_summary()}\n\n🎯 **Character Creation Complete!**\n\nHere is your complete character sheet. Would you like to begin the campaign or make any changes?"
                else:
                    # Continue to next step
                    next_prompt = self._get_next_step_prompt()
                    response = f"{confirmation}\n\n{next_prompt}"
                
                self.conversation_history.append({"role": "assistant", "content": response})
                self._log('log_ai_response', response)
                self._log('log_state', self.character_data)
                
                return {
                    "success": True,
                    "message": response,
                    "is_complete": self.is_complete,
                    "in_review_mode": self.in_review_mode,
                    "current_step": next_step
                }
            else:
                # Could not extract fact, ask for clarification
                clarification = self._get_clarification_prompt(current_step, user_input)
                self.conversation_history.append({"role": "assistant", "content": clarification})
                self._log('log_ai_response', clarification)
                
                return {
                    "success": True,
                    "message": clarification,
                    "is_complete": False,
                    "current_step": current_step
                }
            
        except Exception as e:
            self._log('log_error', str(e))
            logger.error(f"Error continuing conversation: {e}")
            return {
                "success": False,
                "message": "Error processing your input. Please try again."
            }
    
    def _extract_character_data(self) -> Optional[Dict[str, Any]]:
        """Extract character data from conversation history."""
        try:
            # Use LLM to extract comprehensive character data
            conversation_text = " ".join([msg["content"] for msg in self.conversation_history])
            
            extraction_prompt = f"""
            Based on this DnD 5e character creation conversation, extract a complete character sheet in JSON format.
            
            Conversation:
            {conversation_text}
            
            IMPORTANT: Carefully analyze the entire conversation to find all character details that were mentioned. Look for:
            - Name: Any name mentioned by the player
            - Race: Human, Elf, Dwarf, Halfling, Dragonborn, Gnome, Half-Elf, Half-Orc, Tiefling
            - Class: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard
            - Background: Acolyte, Criminal, Folk Hero, Noble, Sage, Soldier, or custom
            - Personality traits and appearance details
            - Backstory elements
            
            Generate a complete character with the following structure:
            {{
                "name": "Character Name",
                "race": "Race",
                "class": "Class", 
                "level": 1,
                "background": "Background",
                "personality": "Personality description",
                "ability_scores": {{
                    "strength": 10,
                    "dexterity": 10,
                    "constitution": 10,
                    "intelligence": 10,
                    "wisdom": 10,
                    "charisma": 10
                }},
                "hit_points": 10,
                "armor_class": 10,
                "saving_throws": ["STR", "CON"],
                "skills": ["Athletics", "Perception"],
                "feats": [],
                "weapons": ["Longsword"],
                "gear": ["Explorer's Pack"],
                "spells": [],
                "background_freeform": "Character backstory and motivations"
            }}
            
            Use reasonable defaults for any missing information. Return only valid JSON.
            """
            
            response_text = chat_completion([
                {"role": "system", "content": "You are a DnD 5e character sheet generator. Carefully analyze the conversation and extract all character details mentioned. Return only valid JSON."},
                {"role": "user", "content": extraction_prompt}
            ], temperature=0.1, max_tokens=800)
            
            # Parse the JSON response
            import json
            import re
            
            response_text = response_text.strip()
            
            # Extract JSON from response (in case there's extra text)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                character_data = json.loads(json_match.group())
                
                # Ensure all required fields are present
                character_data.setdefault("name", "Adventurer")
                character_data.setdefault("race", "Human")
                character_data.setdefault("class", "Fighter")
                character_data.setdefault("level", 1)
                character_data.setdefault("background", "Adventurer")
                character_data.setdefault("personality", f"A {character_data['race']} {character_data['class']}")
                character_data.setdefault("ability_scores", {
                    "strength": 10, "dexterity": 10, "constitution": 10,
                    "intelligence": 10, "wisdom": 10, "charisma": 10
                })
                character_data.setdefault("hit_points", 10)
                character_data.setdefault("armor_class", 10)
                character_data.setdefault("saving_throws", [])
                character_data.setdefault("skills", [])
                character_data.setdefault("feats", [])
                character_data.setdefault("weapons", [])
                character_data.setdefault("gear", [])
                character_data.setdefault("spells", [])
                character_data.setdefault("background_freeform", "")
                character_data["created_date"] = datetime.datetime.now().isoformat()
                
                return character_data
            else:
                # Fallback to simple extraction
                return self._simple_extract_character_data(conversation_text)
            
        except Exception as e:
            logger.error(f"Error extracting character data: {e}")
            # Fallback to simple extraction
            conversation_text = " ".join([msg["content"] for msg in self.conversation_history])
            return self._simple_extract_character_data(conversation_text)
    
    def _detect_and_commit_facts(self, user_input: str, ai_response: str) -> None:
        """Detect new character facts from the conversation and commit them immediately."""
        try:
            import re
            combined_text = f"{user_input} {ai_response}".lower()
            logger.info(f"Analyzing text for facts: '{combined_text[:100]}...'")
            logger.info(f"Current confirmed facts: {self.confirmed_facts}")
            # Patterns for revisions/edits
            revision_patterns = [
                r"actually[,:]? (i'?m|i am|let's go with|let's make it|i'll go with|i'll take|i've decided|maybe|scratch that)[^.,;:]*? (human|elf|dwarf|halfling|dragonborn|gnome|half-elf|half-orc|tiefling|barbarian|bard|cleric|druid|fighter|monk|paladin|ranger|rogue|sorcerer|warlock|wizard|acolyte|criminal|folk hero|noble|sage|soldier)"
            ]
            # Detect race/class/background revisions
            for pattern in revision_patterns:
                match = re.search(pattern, combined_text)
                if match:
                    value = match.group(2).title()
                    # Determine fact type
                    if value in ["Human", "Elf", "Dwarf", "Halfling", "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling"]:
                        self._commit_fact("race", value, "player", allow_overwrite=True)
                        logger.info(f"[REVISION] Overwrote race with: {value}")
                    elif value in ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]:
                        self._commit_fact("class", value, "player", allow_overwrite=True)
                        logger.info(f"[REVISION] Overwrote class with: {value}")
                    elif value in ["Acolyte", "Criminal", "Folk Hero", "Noble", "Sage", "Soldier"]:
                        self._commit_fact("background", value, "player", allow_overwrite=True)
                        logger.info(f"[REVISION] Overwrote background with: {value}")
            # Flexible confirmation patterns
            def match_patterns(fact_type, values, extra_patterns=None):
                found_any = False
                for value in values:
                    if value.lower() in combined_text:
                        patterns = [
                            f"you are a {value.lower()}", f"your character is a {value.lower()}", f"you're a {value.lower()}",
                            f"i am a {value.lower()}", f"i'm a {value.lower()}", f"let's make you a {value.lower()}",
                            f"i want to be a {value.lower()}", f"i want a {value.lower()}", f"make me a {value.lower()}",
                            f"i choose {value.lower()}", f"i pick {value.lower()}", f"i'll be a {value.lower()}",
                            f"i've decided i'll be a {value.lower()}", f"let's go with {value.lower()}",
                            f"maybe a {value.lower()} suits me best", f"i'll take the {value.lower()} background",
                            # Additional patterns for compound statements
                            f"a {value.lower()}", f"the {value.lower()}", f"my {value.lower()}"
                        ]
                        if extra_patterns:
                            patterns.extend(extra_patterns)
                        if any(p in combined_text for p in patterns):
                            self._commit_fact(fact_type, value.title(), "player")
                            found_any = True
                return found_any
            # Race
            match_patterns("race", ["Human", "Elf", "Dwarf", "Halfling", "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling"])
            # Class
            match_patterns("class", ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"])
            # Background
            match_patterns("background", ["Acolyte", "Criminal", "Folk Hero", "Noble", "Sage", "Soldier"])
            # Name
            name_patterns = [
                r"my name is ([a-z]+)", r"i'm called ([a-z]+)", r"call me ([a-z]+)",
                r"my character is named ([a-z]+)", r"name me ([a-z]+)",
                r"^i am ([a-z]+)$", r"^i'm ([a-z]+)$",  # Only match standalone "I am X" or "I'm X"
                r"my name's ([a-z]+)", r"i go by ([a-z]+)",
                r"my character is ([a-z]+)"  # NEW: match 'my character is John'
            ]
            if "name" not in self.confirmed_facts or any(re.search(p, combined_text) for p in name_patterns):
                for pattern in name_patterns:
                    match = re.search(pattern, combined_text)
                    if match:
                        name = match.group(1).title()
                        self._commit_fact("name", name, "player", allow_overwrite=True)
                        break
            # Personality
            personality_keywords = ["brave", "loyal", "cunning", "wise", "charismatic", "strong", "kind", "fierce", "gentle", "bold"]
            if "personality" not in self.confirmed_facts or any(word in combined_text for word in personality_keywords):
                personality_patterns = [
                    r"(?:i am|i'm|my personality is|i am) ([^.]+)",
                    r"(?:i am|i'm) ([^.]+)",
                    r"(?:my character is|i am) ([^.]+)"
                ]
                for pattern in personality_patterns:
                    personality_match = re.search(pattern, combined_text)
                    if personality_match:
                        personality = personality_match.group(1).strip()
                        self._commit_fact("personality", personality, "player", allow_overwrite=True)
                        break
        except Exception as e:
            logger.error(f"Error detecting and committing facts: {e}")
    
    def _commit_fact(self, fact_type: str, value: str, source: str = "player", allow_overwrite: bool = False) -> None:
        """Commit a character fact to memory and update the character sheet with timestamp and source tracking."""
        try:
            old_value = self.character_data.get(fact_type)
            is_overwrite = old_value is not None and old_value != value
            # Enforce immutability during creation (unless in review mode or explicitly allowed)
            if not self.in_review_mode and not allow_overwrite and fact_type in self.confirmed_facts:
                logger.info(f"[IMMUTABLE] Fact {fact_type} already confirmed during creation phase")
                return
            self.fact_history.append((fact_type, old_value))
            if fact_type == "name":
                self.character_data["name"] = value
            elif fact_type == "race":
                self.character_data["race"] = value
            elif fact_type == "class":
                self.character_data["class"] = value
                self.character_data["saving_throws"] = self._get_class_saving_throws(value)
                self.character_data["skills"] = self._get_class_skills(value)
                weapons, gear, spells = self._generate_equipment(value)
                self.character_data["weapons"] = weapons
                self.character_data["gear"] = gear
                self.character_data["spells"] = spells
                self.character_data["ability_scores"] = self._generate_ability_scores(value)
            elif fact_type == "background":
                self.character_data["background"] = value
            elif fact_type == "personality":
                self.character_data["personality"] = value
            self.confirmed_facts.add(fact_type)
            timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
            if self.narrative_bridge:
                self._store_character_fact_in_memory(fact_type, value, source)
            logger.info(f"[CHAR FACT COMMIT] {fact_type}  {value} (source: {source}, replaced: {old_value if is_overwrite else None}) @ {timestamp}")
            self._log('log_fact', fact_type, value, source, replaced=old_value if old_value != value else None)
        except Exception as e:
            logger.error(f"Error committing fact {fact_type}: {e}")
    
    def undo_last_fact(self) -> Optional[tuple]:
        """Undo the last committed character fact and return the undone fact."""
        try:
            if not self.fact_history:
                logger.info("No facts to undo")
                return None
            
            fact_type, old_value = self.fact_history.pop()
            
            # Restore the old value
            if old_value is None:
                if fact_type in self.character_data:
                    del self.character_data[fact_type]
                if fact_type in self.confirmed_facts:
                    self.confirmed_facts.remove(fact_type)
            else:
                self.character_data[fact_type] = old_value
                # Keep the fact as confirmed since it was previously confirmed
            
            # Log the reversal
            logger.info(f"Undid character fact: {fact_type} = {old_value}")
            
            # Memory storage disabled - removed vector memory system
            pass
            
            return (fact_type, old_value)
            
        except Exception as e:
            logger.error(f"Error undoing last fact: {e}")
            return None
    
    def _store_character_fact_in_memory(self, fact_type: str, value: str, source: str = "player") -> None:
        """Store a character fact in the vector memory system with timestamp and source tracking."""
        try:
            character_name = self.character_data.get("name", "Adventurer")
            
            # Create a memory entry for this fact
            fact_description = f"Character fact confirmed: {character_name} is a {value}"
            if fact_type == "race":
                fact_description = f"Character fact confirmed: {character_name} is a {value}"
            elif fact_type == "class":
                fact_description = f"Character fact confirmed: {character_name} is a {value}"
            elif fact_type == "background":
                fact_description = f"Character fact confirmed: {character_name} has a {value} background"
            elif fact_type == "personality":
                fact_description = f"Character fact confirmed: {character_name} is {value}"
            
            # Memory storage disabled - removed vector memory system
            pass
            
        except Exception as e:
            logger.error(f"Error storing character fact in memory: {e}")
    
    def _get_current_character_state(self, bullet_points: bool = False) -> str:
        """Get a summary of what character information has been collected so far."""
        try:
            confirmed_facts = []
            unconfirmed_facts = []
            if "name" in self.confirmed_facts:
                confirmed_facts.append(f"Name: {self.character_data.get('name')}")
            else:
                unconfirmed_facts.append("Name")
            if "race" in self.confirmed_facts:
                confirmed_facts.append(f"Race: {self.character_data.get('race')}")
            else:
                unconfirmed_facts.append("Race")
            if "class" in self.confirmed_facts:
                confirmed_facts.append(f"Class: {self.character_data.get('class')}")
            else:
                unconfirmed_facts.append("Class")
            if "background" in self.confirmed_facts:
                confirmed_facts.append(f"Background: {self.character_data.get('background')}")
            else:
                unconfirmed_facts.append("Background")
            if "personality" in self.confirmed_facts:
                confirmed_facts.append(f"Personality: {self.character_data.get('personality')}")
            else:
                unconfirmed_facts.append("Personality")
            if bullet_points:
                return '\n'.join(f"- {fact}" for fact in confirmed_facts) if confirmed_facts else "- None yet"
            state_summary = f"""
CONFIRMED CHARACTER FACTS:
{chr(10).join(f"- {fact}" for fact in confirmed_facts) if confirmed_facts else "- None yet"}

STILL NEEDED:
{chr(10).join(f"- {fact}" for fact in unconfirmed_facts) if unconfirmed_facts else "- All facts confirmed!"}

Level: {self.character_data.get('level', 1)}
"""
            return state_summary
        except Exception as e:
            logger.error(f"Error getting current character state: {e}")
            return "Unable to determine current character state"

    def _get_unknown_facts_list(self):
        """Return a list of unconfirmed fact types in order."""
        order = ["name", "race", "class", "background", "personality"]
        return [fact.title() for fact in order if fact not in self.confirmed_facts]
    
    def is_character_complete(self) -> bool:
        """Check if all required character fields are filled."""
        required_fields = {
            "name": lambda x: x != "Adventurer" and x != "Unknown",
            "race": lambda x: x != "Unknown",
            "class": lambda x: x != "Unknown", 
            "background": lambda x: x != "Unknown",
            "personality": lambda x: x != "A brave adventurer" and x != "Unknown",
            "ability_scores": lambda x: isinstance(x, dict) and all(isinstance(v, int) for v in x.values())
        }
        
        for field, validator in required_fields.items():
            if not validator(self.character_data.get(field, "Unknown")):
                return False
        return True
    
    def get_character_summary(self) -> str:
        """Generate a formatted character summary for review."""
        char = self.character_data
        summary = f"""
🎭 **Character Summary**

**Name:** {char['name']}
**Race:** {char['race']}
**Class:** {char['class']} (Level {char['level']})
**Background:** {char['background']}
**Alignment:** {char['alignment']}

**Ability Scores:**
- Strength: {char['ability_scores']['strength']}
- Dexterity: {char['ability_scores']['dexterity']}
- Constitution: {char['ability_scores']['constitution']}
- Intelligence: {char['ability_scores']['intelligence']}
- Wisdom: {char['ability_scores']['wisdom']}
- Charisma: {char['ability_scores']['charisma']}

**Combat Stats:**
- Hit Points: {char['hit_points']}
- Armor Class: {char['armor_class']}

**Skills:** {', '.join(char['skills']) if char['skills'] else 'None'}
**Saving Throws:** {', '.join(char['saving_throws']) if char['saving_throws'] else 'None'}

**Equipment:**
- Weapons: {', '.join(char['weapons']) if char['weapons'] else 'None'}
- Gear: {', '.join(char['gear']) if char['gear'] else 'None'}
- Spells: {', '.join(char['spells']) if char['spells'] else 'None'}

**Personality:** {char['personality']}
"""
        return summary.strip()
    
    def apply_character_edit(self, message: str) -> Dict[str, Any]:
        """Apply edits to character during review mode."""
        import re
        # Check finalized first
        if self.character_finalized:
            return {
                "success": False,
                "message": "Character is already finalized and cannot be edited."
            }
        if not self.in_review_mode:
            return {
                "success": False,
                "message": "Character edits are only allowed during the review phase."
            }
        try:
            message_lower = message.lower()
            changes_made = []
            # Sort alignment patterns by length descending for specificity
            alignment_patterns = dict(sorted({
                "lawful good": "Lawful Good", "lg": "Lawful Good",
                "lawful neutral": "Lawful Neutral", "ln": "Lawful Neutral", 
                "lawful evil": "Lawful Evil", "le": "Lawful Evil",
                "neutral good": "Neutral Good", "ng": "Neutral Good",
                "neutral": "Neutral", "n": "Neutral",
                "neutral evil": "Neutral Evil", "ne": "Neutral Evil",
                "chaotic good": "Chaotic Good", "cg": "Chaotic Good",
                "chaotic neutral": "Chaotic Neutral", "cn": "Chaotic Neutral",
                "chaotic evil": "Chaotic Evil", "ce": "Chaotic Evil"
            }.items(), key=lambda x: -len(x[0])))
            for pattern, alignment in alignment_patterns.items():
                if pattern in message_lower:
                    old_alignment = self.character_data["alignment"]
                    self.character_data["alignment"] = alignment
                    changes_made.append(f"Alignment: {old_alignment} → {alignment}")
                    break
            
            # Parse class changes
            class_patterns = {
                "barbarian", "bard", "cleric", "druid", "fighter", "monk", 
                "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"
            }
            
            for class_name in class_patterns:
                if f"change my class to {class_name}" in message_lower or f"make me a {class_name}" in message_lower:
                    old_class = self.character_data["class"]
                    self.character_data["class"] = class_name.title()
                    # Update class-specific data
                    self.character_data["saving_throws"] = self._get_class_saving_throws(class_name.title())
                    self.character_data["skills"] = self._get_class_skills(class_name.title())
                    weapons, gear, spells = self._generate_equipment(class_name.title())
                    self.character_data["weapons"] = weapons
                    self.character_data["gear"] = gear
                    self.character_data["spells"] = spells
                    self.character_data["ability_scores"] = self._generate_ability_scores(class_name.title())
                    changes_made.append(f"Class: {old_class} → {class_name.title()}")
                    break
            
            # Parse name changes
            name_match = re.search(r"change my name to ([a-z]+)", message_lower)
            if name_match:
                old_name = self.character_data["name"]
                new_name = name_match.group(1).title()
                self.character_data["name"] = new_name
                changes_made.append(f"Name: {old_name} → {new_name}")
            
            # Parse background changes
            background_patterns = ["acolyte", "criminal", "folk hero", "noble", "sage", "soldier"]
            for bg in background_patterns:
                if f"change my background to {bg}" in message_lower or f"make my background {bg}" in message_lower:
                    old_bg = self.character_data["background"]
                    self.character_data["background"] = bg.title()
                    changes_made.append(f"Background: {old_bg} → {bg.title()}")
                    break
            
            if changes_made:
                # Update vector memory for changed facts
                for change in changes_made:
                    fact_type = change.split(":")[0].lower()
                    new_value = change.split("→")[1].strip()
                    if self.narrative_bridge:
                        self._store_character_fact_in_memory(fact_type, new_value, "edit")
                
                logger.info(f"Applied character edits: {changes_made}")
                return {
                    "success": True,
                    "message": f"Changes applied: {', '.join(changes_made)}",
                    "summary": self.get_character_summary()
                }
            else:
                return {
                    "success": False,
                    "message": "I didn't understand what you wanted to change. Try phrases like 'change my class to wizard' or 'make me chaotic neutral'."
                }
                
        except Exception as e:
            logger.error(f"Error applying character edit: {e}")
            return {
                "success": False,
                "message": "Error applying changes. Please try again."
            }
    
    def finalize_character(self) -> Dict[str, Any]:
        """Finalize the character and prevent further edits."""
        if not self.is_character_complete():
            return {
                "success": False,
                "message": "Character is not complete. Please fill in all required fields."
            }
        
        if not self.in_review_mode:
            return {
                "success": False,
                "message": "Character must be in review mode before finalization."
            }
        
        self.character_finalized = True
        self.in_review_mode = False
        
        # Memory storage disabled - removed vector memory system
        pass
        
        logger.info(f"Character finalized: {self.character_data['name']}")
        return {
            "success": True,
            "message": f"Character {self.character_data['name']} is now finalized and ready for adventure!",
            "character_data": self.character_data
        }

    def _simple_extract_character_data(self, conversation_text: str) -> Dict[str, Any]:
        """Simple fallback character data extraction."""
        import re
        
        # Name - look for "name is" or "called" patterns
        name_match = re.search(r'(?:name is|called|named)\s+([A-Z][a-z]+)', conversation_text, re.IGNORECASE)
        name = name_match.group(1) if name_match else "Adventurer"
        
        # Race - look for race mentions
        races = ["Human", "Elf", "Dwarf", "Halfling", "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling"]
        race = "Human"
        for r in races:
            if r.lower() in conversation_text.lower():
                race = r
                break
        
        # Class - look for class mentions
        classes = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]
        character_class = "Fighter"
        for c in classes:
            if c.lower() in conversation_text.lower():
                character_class = c
                break
        
        # Generate reasonable ability scores based on class
        ability_scores = self._generate_ability_scores(character_class)
        
        # Generate equipment based on class
        weapons, gear, spells = self._generate_equipment(character_class)
        
        return {
            "name": name,
            "race": race,
            "class": character_class,
            "level": 1,
            "background": "Adventurer",
            "personality": f"A {race} {character_class} named {name}",
            "ability_scores": ability_scores,
            "hit_points": ability_scores["constitution"] + 5,  # Base HP
            "armor_class": 10,
            "saving_throws": self._get_class_saving_throws(character_class),
            "skills": self._get_class_skills(character_class),
            "feats": [],
            "weapons": weapons,
            "gear": gear,
            "spells": spells,
            "background_freeform": f"{name} is a {race} {character_class} seeking adventure and glory.",
            "created_date": datetime.datetime.now().isoformat()
        }
    
    def _generate_ability_scores(self, character_class: str) -> Dict[str, int]:
        """Generate reasonable ability scores for a character class."""
        # Base scores with class-appropriate bonuses
        base_scores = {
            "strength": 10, "dexterity": 10, "constitution": 10,
            "intelligence": 10, "wisdom": 10, "charisma": 10
        }
        
        # Class-specific adjustments
        if character_class in ["Barbarian", "Fighter", "Paladin"]:
            base_scores["strength"] = 14
            base_scores["constitution"] = 12
        elif character_class in ["Rogue", "Ranger", "Monk"]:
            base_scores["dexterity"] = 14
            base_scores["constitution"] = 12
        elif character_class in ["Wizard", "Sorcerer"]:
            base_scores["intelligence"] = 14 if character_class == "Wizard" else 12
            base_scores["charisma"] = 14 if character_class == "Sorcerer" else 12
            base_scores["constitution"] = 12
        elif character_class in ["Cleric", "Druid"]:
            base_scores["wisdom"] = 14
            base_scores["constitution"] = 12
        elif character_class == "Bard":
            base_scores["charisma"] = 14
            base_scores["dexterity"] = 12
        elif character_class == "Warlock":
            base_scores["charisma"] = 14
            base_scores["constitution"] = 12
        
        return base_scores
    
    def _generate_equipment(self, character_class: str) -> tuple:
        """Generate starting equipment for a character class."""
        weapons = []
        gear = ["Backpack", "Bedroll", "Rations (5 days)", "Waterskin", "50 feet of rope"]
        spells = []
        
        if character_class == "Fighter":
            weapons = ["Longsword", "Shield"]
            gear.extend(["Chain mail", "Crossbow, light", "20 bolts"])
        elif character_class == "Wizard":
            weapons = ["Quarterstaff"]
            gear.extend(["Spellbook", "Arcane focus", "Scholar's pack"])
            spells = ["Fire Bolt", "Mage Hand", "Prestidigitation"]
        elif character_class == "Cleric":
            weapons = ["Mace", "Shield"]
            gear.extend(["Chain mail", "Holy symbol"])
            spells = ["Sacred Flame", "Spare the Dying", "Cure Wounds"]
        elif character_class == "Rogue":
            weapons = ["Shortsword", "Shortbow"]
            gear.extend(["Leather armor", "Thieves' tools", "Burglar's pack"])
        elif character_class == "Ranger":
            weapons = ["Longbow", "Shortsword"]
            gear.extend(["Leather armor", "Explorer's pack"])
        elif character_class == "Barbarian":
            weapons = ["Greataxe", "Javelin"]
            gear.extend(["Explorer's pack", "4 javelins"])
        elif character_class == "Bard":
            weapons = ["Rapier", "Lute"]
            gear.extend(["Leather armor", "Diplomat's pack"])
            spells = ["Vicious Mockery", "Prestidigitation", "Cure Wounds"]
        elif character_class == "Druid":
            weapons = ["Quarterstaff"]
            gear.extend(["Leather armor", "Druidic focus", "Explorer's pack"])
            spells = ["Produce Flame", "Guidance", "Cure Wounds"]
        elif character_class == "Monk":
            weapons = ["Shortsword"]
            gear.extend(["Explorer's pack", "10 darts"])
        elif character_class == "Paladin":
            weapons = ["Longsword", "Shield"]
            gear.extend(["Chain mail", "Holy symbol", "Priest's pack"])
        elif character_class == "Sorcerer":
            weapons = ["Quarterstaff"]
            gear.extend(["Arcane focus", "Explorer's pack"])
            spells = ["Fire Bolt", "Mage Hand", "Burning Hands"]
        elif character_class == "Warlock":
            weapons = ["Quarterstaff"]
            gear.extend(["Arcane focus", "Scholar's pack"])
            spells = ["Eldritch Blast", "Prestidigitation", "Hex"]
        
        return weapons, gear, spells
    
    def _get_class_saving_throws(self, character_class: str) -> List[str]:
        """Get saving throw proficiencies for a character class."""
        saving_throws = {
            "Barbarian": ["STR", "CON"],
            "Bard": ["DEX", "CHA"],
            "Cleric": ["WIS", "CHA"],
            "Druid": ["INT", "WIS"],
            "Fighter": ["STR", "CON"],
            "Monk": ["STR", "DEX"],
            "Paladin": ["WIS", "CHA"],
            "Ranger": ["STR", "DEX"],
            "Rogue": ["DEX", "INT"],
            "Sorcerer": ["CON", "CHA"],
            "Warlock": ["WIS", "CHA"],
            "Wizard": ["INT", "WIS"]
        }
        return saving_throws.get(character_class, ["STR", "CON"])
    
    def _get_class_skills(self, character_class: str) -> List[str]:
        """Get skill proficiencies for a character class."""
        skills = {
            "Barbarian": ["Athletics", "Survival"],
            "Bard": ["Acrobatics", "Performance"],
            "Cleric": ["Insight", "Religion"],
            "Druid": ["Animal Handling", "Nature"],
            "Fighter": ["Athletics", "Intimidation"],
            "Monk": ["Acrobatics", "Athletics"],
            "Paladin": ["Athletics", "Intimidation"],
            "Ranger": ["Animal Handling", "Survival"],
            "Rogue": ["Acrobatics", "Stealth"],
            "Sorcerer": ["Arcana", "Deception"],
            "Warlock": ["Arcana", "Deception"],
            "Wizard": ["Arcana", "History"]
        }
        return skills.get(character_class, ["Athletics", "Perception"])
    
    def get_character_data(self) -> Dict[str, Any]:
        """Get the completed character data."""
        # Ensure created_date is set
        if not self.character_data.get("created_date"):
            self.character_data["created_date"] = datetime.datetime.now().isoformat()
        
        return self.character_data
    
    def save_character(self, campaign_id: str):
        """Save character data to file."""
        try:
            os.makedirs("character_saves", exist_ok=True)
            character_file = f"character_saves/{campaign_id}_character.json"
            with open(character_file, 'w') as f:
                json.dump(self.character_data, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving character: {e}")

class SimpleNarrativeBridge:
    """Simple narrative bridge for basic DnD functionality."""
    
    def __init__(self):
        self.ensure_directories()
    
    def ensure_directories(self):
        """Ensure necessary directories exist."""
        os.makedirs("campaign_saves", exist_ok=True)
        os.makedirs("character_saves", exist_ok=True)
    
    def initialize_campaign(self, character_data: Dict[str, Any], campaign_name: str = None) -> Optional[Dict[str, Any]]:
        """Initialize a new campaign with character data."""
        try:
            campaign_id = str(uuid.uuid4())[:8]
            campaign_name = campaign_name or f"Campaign {campaign_id}"
            
            # Generate setting introduction
            setting_intro = self.generate_setting_introduction(character_data, campaign_name)
            
            campaign_data = {
                "id": campaign_id,
                "name": campaign_name,
                "created_date": datetime.datetime.now().isoformat(),
                "last_modified": datetime.datetime.now().isoformat(),
                "active_character": character_data,
                "setting_introduction": setting_intro,
                "session_count": 1,
                "conversation_history": [
                    {"role": "dm", "content": setting_intro, "timestamp": datetime.datetime.now().isoformat()}
                ]
            }
            
            # Save campaign
            campaign_file = f"campaign_saves/{campaign_id}.json"
            with open(campaign_file, 'w') as f:
                json.dump(campaign_data, f, indent=2)
            
            # Save character
            character_file = f"character_saves/{campaign_id}_character.json"
            with open(character_file, 'w') as f:
                json.dump(character_data, f, indent=2)
            
            logger.info(f"Initialized campaign: {campaign_id}")
            return campaign_data
            
        except Exception as e:
            logger.error(f"Error initializing campaign: {e}")
            return None
    
    def generate_setting_introduction(self, character_data: Dict[str, Any], campaign_name: str) -> str:
        """Generate an immersive setting introduction."""
        try:
            prompt = f"""
            Create an immersive opening scene for a DnD 5e solo adventure featuring:
            
            Character: {character_data.get('name', 'Adventurer')} - a {character_data.get('race', 'Human')} {character_data.get('class', 'Fighter')}
            Campaign: {campaign_name}
            
            The scene should include:
            - A vivid description of the starting location
            - Atmospheric details (weather, lighting, sounds, smells)
            - A sense of mystery or adventure
            - The character's current situation
            
            Write in third person, present tense, as if narrating the scene to the player.
            """
            
            response_content = chat_completion([
                {"role": "system", "content": "You are a master DnD storyteller creating immersive opening scenes."},
                {"role": "user", "content": prompt}
            ], temperature=0.8, max_tokens=300)
            
            return response_content.strip()
            
        except Exception as e:
            logger.error(f"Error generating setting introduction: {e}")
            return f"You find yourself in a mysterious land, ready to begin your adventure as {character_data.get('name', 'a hero')}..."
    
    def load_campaign(self, campaign_id: str) -> bool:
        """Load an existing campaign."""
        try:
            campaign_file = f"campaign_saves/{campaign_id}.json"
            if not os.path.exists(campaign_file):
                logger.error(f"Campaign file not found: {campaign_file}")
                return False
            
            logger.info(f"Loaded campaign: {campaign_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading campaign: {e}")
            return False
    
    def process_player_input(self, player_input: str, campaign_id: str) -> str:
        """Process player input and return DM response."""
        try:
            prompt = f"""
            You are a Dungeon Master running a solo DnD 5e adventure. The player has just said: "{player_input}"
            
            Respond as a DM would, describing what happens next, asking for clarification if needed, 
            and moving the story forward. Be descriptive, atmospheric, and engaging.
            
            Keep your response to 2-3 paragraphs maximum. Focus on the immediate consequences and 
            what the player sees/hears/experiences.
            """
            
            response_content = chat_completion([
                {"role": "system", "content": "You are an experienced Dungeon Master running a solo DnD 5e adventure. Be descriptive, atmospheric, and engaging."},
                {"role": "user", "content": prompt}
            ], temperature=0.8, max_tokens=400)
            
            return response_content.strip()
            
        except Exception as e:
            logger.error(f"Error processing player input: {e}")
            return "I'm sorry, but I'm having trouble processing that right now. Please try again."
    
    def save_campaign(self, campaign_id: str) -> bool:
        """Save current campaign state."""
        try:
            campaign_file = f"campaign_saves/{campaign_id}.json"
            if os.path.exists(campaign_file):
                with open(campaign_file, 'r') as f:
                    campaign_data = json.load(f)
                
                campaign_data["last_modified"] = datetime.datetime.now().isoformat()
                campaign_data["session_count"] = campaign_data.get("session_count", 0) + 1
                
                with open(campaign_file, 'w') as f:
                    json.dump(campaign_data, f, indent=2)
            
            logger.info(f"Saved campaign: {campaign_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving campaign: {e}")
            return False
    
    def get_campaign_data(self, campaign_id: str) -> Optional[Dict[str, Any]]:
        """Get campaign data."""
        try:
            campaign_file = f"campaign_saves/{campaign_id}.json"
            if not os.path.exists(campaign_file):
                return None
            
            with open(campaign_file, 'r') as f:
                return json.load(f)
                
        except Exception as e:
            logger.error(f"Error getting campaign data: {e}")
            return None

class SimpleUnifiedGame:
    """Simple unified game manager."""
    
    def __init__(self):
        self.character_generator = SimpleCharacterGenerator()
        self.narrative_bridge = SimpleNarrativeBridge()
    
    def get_saved_campaigns(self):
        """Get list of all saved campaigns."""
        campaigns = []
        try:
            if os.path.exists('campaign_saves'):
                for filename in os.listdir('campaign_saves'):
                    if filename.endswith('.json'):
                        campaign_id = filename.replace('.json', '')
                        filepath = os.path.join('campaign_saves', filename)
                        
                        try:
                            with open(filepath, 'r') as f:
                                campaign_data = json.load(f)
                            
                            campaigns.append({
                                'id': campaign_id,
                                'name': campaign_data.get('name', f'Campaign {campaign_id}'),
                                'created_date': campaign_data.get('created_date', 'Unknown'),
                                'last_modified': datetime.datetime.fromtimestamp(os.path.getmtime(filepath)).isoformat(),
                                'character_name': campaign_data.get('active_character', {}).get('name', 'Unknown')
                            })
                        except Exception as e:
                            logger.error(f"Error reading campaign {campaign_id}: {e}")
                            campaigns.append({
                                'id': campaign_id,
                                'name': f'Campaign {campaign_id} (Corrupted)',
                                'created_date': 'Unknown',
                                'last_modified': 'Unknown',
                                'character_name': 'Unknown'
                            })
        except Exception as e:
            logger.error(f"Error listing campaigns: {e}")
        
        return sorted(campaigns, key=lambda x: x['last_modified'], reverse=True)
    
    def delete_campaign(self, campaign_id):
        """Delete a campaign and all its associated files."""
        try:
            # Delete main campaign file
            campaign_file = os.path.join('campaign_saves', f'{campaign_id}.json')
            if os.path.exists(campaign_file):
                os.remove(campaign_file)
            
            # Delete associated files
            associated_files = [
                f'{campaign_id}_character.json'
            ]
            
            for filename in associated_files:
                filepath = os.path.join('character_saves', filename)
                if os.path.exists(filepath):
                    os.remove(filepath)
            
            return True
        except Exception as e:
            logger.error(f"Error deleting campaign {campaign_id}: {e}")
            return False

# Initialize game manager
game = SimpleUnifiedGame()

@app.route('/')
def start_screen():
    """Start screen - the only gamified portion of the UI."""
    return render_template('start_screen.html')

@app.route('/api/campaigns')
def list_campaigns():
    """List all saved campaigns."""
    campaigns = game.get_saved_campaigns()
    return jsonify({'success': True, 'campaigns': campaigns})

@app.route('/api/campaigns/<campaign_id>/delete', methods=['POST'])
def delete_campaign(campaign_id):
    """Delete a campaign."""
    success = game.delete_campaign(campaign_id)
    return jsonify({'success': success})

@app.route('/api/campaigns/<campaign_id>/load', methods=['POST'])
def load_campaign(campaign_id):
    """Load a campaign and redirect to game."""
    try:
        success = game.narrative_bridge.load_campaign(campaign_id)
        if success:
            session['campaign_id'] = campaign_id
            return jsonify({'success': True, 'redirect': '/game'})
        else:
            return jsonify({'success': False, 'message': 'Failed to load campaign'})
    except Exception as e:
        logger.error(f"Error loading campaign: {e}")
        return jsonify({'success': False, 'message': 'Error loading campaign'})

@app.route('/character-creation')
def character_creation():
    """Character creation screen with two options."""
    return render_template('character_creation.html')

@app.route('/vibe-code-creation')
def vibe_code_creation():
    """Vibe code character creation interface."""
    return render_template('vibe_code_creation.html')

@app.route('/api/character/vibe-code/start', methods=['POST'])
def start_vibe_code_creation():
    """Start the vibe code character creation process."""
    try:
        data = request.get_json()
        description = data.get('description', '')
        campaign_name = data.get('campaign_name', '')
        
        if not description:
            return jsonify({'success': False, 'message': 'Character description is required'})
        
        # Initialize narrative bridge for character creation
        temp_bridge = SimpleNarrativeBridge()
        game.character_generator.narrative_bridge = temp_bridge
        
        # Start character creation conversation
        result = game.character_generator.start_character_creation(description, campaign_name)
        
        if result['success']:
            # Store the character generator state in session
            session['character_creation_active'] = True
            session['campaign_name'] = campaign_name
            
            return jsonify({
                'success': True,
                'message': result['message'],
                'is_complete': result['is_complete']
            })
        else:
            return jsonify({'success': False, 'message': 'Failed to start character creation'})
    
    except Exception as e:
        logger.error(f"Error starting vibe code creation: {e}")
        return jsonify({'success': False, 'message': 'Error starting character creation'})

@app.route('/api/character/vibe-code/continue', methods=['POST'])
def continue_vibe_code_creation():
    """Continue the vibe code character creation conversation."""
    try:
        data = request.get_json()
        user_input = data.get('user_input', '')
        
        if not user_input:
            return jsonify({'success': False, 'message': 'User input is required'})
        
        # Continue character creation conversation
        result = game.character_generator.continue_conversation(user_input)
        
        response_data = {
            'success': result['success'],
            'message': result['message'],
            'is_complete': result.get('is_complete', False)
        }
        
        # Add review mode specific fields
        if result.get('in_review_mode'):
            response_data['in_review_mode'] = True
            response_data['character_summary'] = game.character_generator.get_character_summary()
        
        # Add finalization specific fields
        if result.get('character_finalized'):
            response_data['character_finalized'] = True
            response_data['character_data'] = result.get('character_data')
        
        return jsonify(response_data)
    
    except Exception as e:
        logger.error(f"Error continuing vibe code creation: {e}")
        return jsonify({'success': False, 'message': 'Error continuing character creation'})

@app.route('/api/character/vibe-code/complete', methods=['POST'])
def complete_vibe_code_creation():
    """Complete character creation and start campaign."""
    try:
        # Get character data
        character_data = game.character_generator.get_character_data()
        campaign_name = session.get('campaign_name', 'New Campaign')
        
        if not character_data:
            return jsonify({'success': False, 'message': 'No character data available'})
        
        # Initialize campaign
        campaign_data = game.narrative_bridge.initialize_campaign(character_data, campaign_name)
        
        if campaign_data:
            # Store character creation data in memory (this is now called within initialize_campaign)
            # The store_character_creation method is called automatically during campaign initialization
            
            # Clear session data
            session.pop('character_creation_active', None)
            session.pop('campaign_name', None)
            session['campaign_id'] = campaign_data['id']
            
            return jsonify({
                'success': True,
                'message': 'Character created and campaign started!',
                'redirect': '/game'
            })
        else:
            return jsonify({'success': False, 'message': 'Failed to start campaign'})
    
    except Exception as e:
        logger.error(f"Error completing vibe code creation: {e}")
        return jsonify({'success': False, 'message': 'Error completing character creation'})

@app.route('/api/character/vibe-code/undo', methods=['POST'])
def undo_last_character_fact():
    """Undo the last committed character fact."""
    try:
        # Get character generator from session
        if not hasattr(game, 'character_generator'):
            return jsonify({"success": False, "message": "No active character creation session"}), 400
        
        generator = game.character_generator
        undone_fact = generator.undo_last_fact()
        
        if undone_fact is None:
            return jsonify({
                "success": False, 
                "message": "No facts to undo"
            }), 400
        
        fact_type, old_value = undone_fact
        
        return jsonify({
            "success": True,
            "message": f"Undid {fact_type}: {old_value}",
            "undone_fact": {
                "type": fact_type,
                "old_value": old_value
            },
            "current_character_data": generator.get_character_data()
        })
        
    except Exception as e:
        logger.error(f"Error undoing last fact: {e}")
        return jsonify({"success": False, "message": "Error undoing last fact"}), 500

@app.route('/api/character/vibe-code/edit', methods=['POST'])
def edit_character():
    """Apply edits to character during review mode."""
    try:
        data = request.get_json()
        edit_message = data.get('edit_message', '')
        
        if not edit_message:
            return jsonify({'success': False, 'message': 'Edit message is required'})
        
        # Get character generator from session
        if not hasattr(game, 'character_generator'):
            return jsonify({"success": False, "message": "No active character creation session"}), 400
        
        generator = game.character_generator
        
        # Apply the edit
        result = generator.apply_character_edit(edit_message)
        
        return jsonify({
            'success': result['success'],
            'message': result['message'],
            'summary': result.get('summary', ''),
            'character_data': generator.get_character_data()
        })
        
    except Exception as e:
        logger.error(f"Error editing character: {e}")
        return jsonify({'success': False, 'message': 'Error editing character'})

@app.route('/api/character/vibe-code/finalize', methods=['POST'])
def finalize_character():
    """Finalize character and start campaign."""
    try:
        # Get character generator from session
        if not hasattr(game, 'character_generator'):
            return jsonify({"success": False, "message": "No active character creation session"}), 400
        
        generator = game.character_generator
        
        # Finalize the character
        result = generator.finalize_character()
        
        if not result['success']:
            return jsonify(result)
        
        # Get campaign name from session
        campaign_name = session.get('campaign_name', 'New Campaign')
        
        # Initialize campaign with finalized character
        campaign_data = game.narrative_bridge.initialize_campaign(result['character_data'], campaign_name)
        
        if campaign_data:
            # Clear session data
            session.pop('character_creation_active', None)
            session.pop('campaign_name', None)
            session['campaign_id'] = campaign_data['id']
            
            return jsonify({
                'success': True,
                'message': result['message'],
                'redirect': '/game'
            })
        else:
            return jsonify({'success': False, 'message': 'Failed to start campaign'})
        
    except Exception as e:
        logger.error(f"Error finalizing character: {e}")
        return jsonify({'success': False, 'message': 'Error finalizing character'})

@app.route('/api/character/create', methods=['POST'])
def create_character():
    """Create character using step-by-step form."""
    try:
        data = request.get_json()
        
        # Extract all character data from form (SRD-compliant)
        character_data = {
            'name': data.get('name', 'Adventurer'),
            'race': data.get('race', 'Human'),
            'class': data.get('class', 'Fighter'),
            'level': int(data.get('level', 1)),
            'background': data.get('background', 'Adventurer'),
            'personality': data.get('personality', 'A brave adventurer'),
            
            # Ability scores
            'ability_scores': {
                'strength': int(data.get('str', 10)),
                'dexterity': int(data.get('dex', 10)),
                'constitution': int(data.get('con', 10)),
                'intelligence': int(data.get('int', 10)),
                'wisdom': int(data.get('wis', 10)),
                'charisma': int(data.get('cha', 10))
            },
            
            # Combat stats
            'hit_points': int(data.get('hp', 10)),
            'armor_class': 10,  # Default, will be calculated based on class/equipment
            
            # Proficiencies
            'saving_throws': data.get('savingThrows', '').split(', ') if data.get('savingThrows') else [],
            'skills': data.get('skills', '').split(', ') if data.get('skills') else [],
            'feats': data.get('feats', '').split(', ') if data.get('feats') else [],
            
            # Equipment
            'weapons': data.get('weapons', '').split(', ') if data.get('weapons') else [],
            'gear': data.get('gear', '').split(', ') if data.get('gear') else [],
            'spells': data.get('spells', '').split(', ') if data.get('spells') else [],
            
            # Freeform background
            'background_freeform': data.get('backgroundFreeform', ''),
            
            'created_date': datetime.datetime.now().isoformat()
        }
        
        campaign_name = data.get('campaign_name', 'New Campaign')
        
        # Initialize campaign
        campaign_data = game.narrative_bridge.initialize_campaign(character_data, campaign_name)
        
        if campaign_data:
            # Store character creation data in memory (this is now called within initialize_campaign)
            # The store_character_creation method is called automatically during campaign initialization
            
            session['campaign_id'] = campaign_data['id']
            return jsonify({
                'success': True,
                'message': 'Character created and campaign started!',
                'redirect': '/game'
            })
        else:
            return jsonify({'success': False, 'message': 'Failed to start campaign'})
    
    except Exception as e:
        logger.error(f"Error creating character: {e}")
        return jsonify({'success': False, 'message': 'Error creating character'})

@app.route('/game')
def game_screen():
    """Main game interface - pure conversation."""
    return render_template('game_screen.html')

@app.route('/api/game/action', methods=['POST'])
def process_game_action():
    """Process player action in the game."""
    try:
        data = request.get_json()
        player_input = data.get('input', '')
        campaign_id = session.get('campaign_id')
        
        if not player_input:
            return jsonify({'success': False, 'message': 'Player input is required'})
        
        if not campaign_id:
            return jsonify({'success': False, 'message': 'No active campaign'})
        
        # Process player input
        dm_response = game.narrative_bridge.process_player_input(player_input, campaign_id)
        
        # Save campaign
        game.narrative_bridge.save_campaign(campaign_id)
        
        return jsonify({
            'success': True,
            'response': dm_response
        })
    
    except Exception as e:
        logger.error(f"Error processing game action: {e}")
        return jsonify({'success': False, 'message': 'Error processing action'})

@app.route('/api/game/save', methods=['POST'])
def save_game():
    """Save current game state."""
    try:
        campaign_id = session.get('campaign_id')
        if not campaign_id:
            return jsonify({'success': False, 'message': 'No active campaign'})
        
        success = game.narrative_bridge.save_campaign(campaign_id)
        return jsonify({'success': success})
    
    except Exception as e:
        logger.error(f"Error saving game: {e}")
        return jsonify({'success': False, 'message': 'Error saving game'})

@app.route('/api/game/current')
def get_current_game():
    """Get current game state."""
    try:
        campaign_id = session.get('campaign_id')
        if not campaign_id:
            return jsonify({'success': False, 'message': 'No active campaign'})
        
        campaign_data = game.narrative_bridge.get_campaign_data(campaign_id)
        if not campaign_data:
            return jsonify({'success': False, 'message': 'Campaign not found'})
        
        return jsonify({
            'success': True,
            'campaign': campaign_data
        })
    
    except Exception as e:
        logger.error(f"Error getting current game: {e}")
        return jsonify({'success': False, 'message': 'Error getting game state'})

if __name__ == '__main__':
    print("🎲 Starting Simple Unified SoloHeart Narrative Interface...")
    print("Access the game at: http://localhost:5001")
    print("Press Ctrl+C to stop the server")
    app.run(host='0.0.0.0', port=5001, debug=True)

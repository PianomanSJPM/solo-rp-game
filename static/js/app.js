// Enhanced DnD 5E Solo Game - Frontend JavaScript
// ==============================================

class DnDGameApp {
    constructor() {
        this.isTyping = false;
        this.isProcessing = false;
        this.campaignId = 'demo-campaign';
        this.activeCharacter = null;
        this.characters = {};
        this.chatHistory = [];
        this.debugMode = false;
        this.sidebarCollapsed = false;
        this.dynamicsPanelCollapsed = false;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.autoResizeTextarea();
        this.updateCharCount();
        this.loadGameState();
        this.focusInput();
        this.loadCharacters();
        this.updateSidebar();
        this.loadCampaignOverview();
    }

    bindEvents() {
        // Message input events
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');

        messageInput.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.updateCharCount();
            this.updateSendButton();
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        messageInput.addEventListener('paste', () => {
            setTimeout(() => {
                this.autoResizeTextarea();
                this.updateCharCount();
            }, 0);
        });

        sendButton.addEventListener('click', () => {
            this.sendMessage();
        });

        // Character selection
        document.getElementById('character-select').addEventListener('change', (e) => {
            this.setActiveCharacter(e.target.value);
        });

        document.getElementById('add-character-btn').addEventListener('click', () => {
            this.showAddCharacterModal();
        });

        // Header button events
        document.getElementById('save-campaign-btn').addEventListener('click', () => {
            this.showSaveModal();
        });

        document.getElementById('load-campaign-btn').addEventListener('click', () => {
            this.showLoadModal();
        });

        document.getElementById('debug-toggle-btn').addEventListener('click', () => {
            this.toggleDebugMode();
        });

        // Sidebar toggle
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Dynamics panel toggle
        document.getElementById('dynamics-toggle').addEventListener('click', () => {
            this.toggleDynamicsPanel();
        });

        // Diagnostics toggle
        document.getElementById('diagnostics-toggle').addEventListener('click', () => {
            this.toggleDiagnosticsPanel();
        });

        // Campaign Overview toggle
        document.getElementById('overview-toggle').addEventListener('click', () => {
            this.toggleOverviewPanel();
        });

        // Campaign Overview export buttons
        document.getElementById('export-markdown').addEventListener('click', () => {
            this.exportCampaignMarkdown();
        });

        document.getElementById('export-json').addEventListener('click', () => {
            this.exportCampaignJSON();
        });

        document.getElementById('copy-summary').addEventListener('click', () => {
            this.copyCampaignSummary();
        });

        document.getElementById('view-full-journal').addEventListener('click', () => {
            this.showFullJournalModal();
        });

        // Modal events
        this.bindModalEvents();

        // Close modal when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideAllModals();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
            }
        });

        // Focus on input when clicking in chat area
        document.querySelector('.chat-container').addEventListener('click', () => {
            this.focusInput();
        });
    }

    bindModalEvents() {
        // Add character modal
        document.getElementById('close-add-character-modal').addEventListener('click', () => {
            this.hideModal('add-character-modal');
        });

        document.getElementById('cancel-add-character').addEventListener('click', () => {
            this.hideModal('add-character-modal');
        });

        document.getElementById('confirm-add-character').addEventListener('click', () => {
            this.addCharacter();
        });

        // Save modal
        document.getElementById('close-save-modal').addEventListener('click', () => {
            this.hideModal('save-campaign-modal');
        });

        document.getElementById('cancel-save').addEventListener('click', () => {
            this.hideModal('save-campaign-modal');
        });

        document.getElementById('confirm-save').addEventListener('click', () => {
            this.saveCampaign();
        });

        // Load modal
        document.getElementById('close-load-modal').addEventListener('click', () => {
            this.hideModal('load-campaign-modal');
        });

        document.getElementById('cancel-load').addEventListener('click', () => {
            this.hideModal('load-campaign-modal');
        });

        // Debug modal
        document.getElementById('close-debug-modal').addEventListener('click', () => {
            this.hideModal('debug-modal');
        });
    }

    focusInput() {
        const messageInput = document.getElementById('message-input');
        messageInput.focus();
    }

    autoResizeTextarea() {
        const textarea = document.getElementById('message-input');
        textarea.style.height = 'auto';
        const newHeight = Math.min(textarea.scrollHeight, 8 * 24); // 8rem max height
        textarea.style.height = newHeight + 'px';
    }

    updateCharCount() {
        const textarea = document.getElementById('message-input');
        const charCount = document.getElementById('char-count');
        const count = textarea.value.length;
        charCount.textContent = `${count}/4000`;
        
        if (count > 3600) {
            charCount.style.color = '#ef4444';
        } else if (count > 3000) {
            charCount.style.color = '#f59e0b';
        } else {
            charCount.style.color = '#9ca3af';
        }
    }

    updateSendButton() {
        const textarea = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const hasText = textarea.value.trim().length > 0;
        const hasCharacter = this.activeCharacter !== null;
        
        sendButton.disabled = !hasText || !hasCharacter || this.isTyping || this.isProcessing;
    }

    async sendMessage() {
        const textarea = document.getElementById('message-input');
        const message = textarea.value.trim();
        
        if (!message || this.isTyping || this.isProcessing || !this.activeCharacter) return;

        this.isProcessing = true;
        this.updateSendButton();

        const userMessage = message;
        textarea.value = '';
        this.autoResizeTextarea();
        this.updateCharCount();

        // Add user message to chat
        this.addMessage(userMessage, 'user', this.activeCharacter);

        setTimeout(() => {
            this.showTypingIndicator();
        }, 300);

        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    action: userMessage,
                    character_id: this.activeCharacter
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.hideTypingIndicator();
                this.addMessage(data.narration, 'ai', 'Dungeon Master');
                
                // Update sidebar with new data
                this.updateSidebar();
                
                // Load narrative dynamics to show real-time updates
                this.loadNarrativeDynamics();
                
                // Show orchestration events if any
                if (data.orchestration_events && data.orchestration_events.length > 0) {
                    this.showOrchestrationEvents(data.orchestration_events);
                }
                
                // Check for triggered events
                this.checkTriggeredEvents(userMessage);
            } else {
                throw new Error(data.error || 'Failed to send message');
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.hideTypingIndicator();
            this.addMessage(`Sorry, I encountered an error: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            this.updateSendButton();
            this.focusInput();
        }
    }

    addMessage(content, type = 'ai', speaker = 'Dungeon Master') {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;

        const timestamp = this.formatTimestamp(new Date());
        const character = this.characters[speaker] || { name: speaker, class: 'NPC' };

        let avatarIcon = 'fas fa-user';
        if (type === 'ai') {
            avatarIcon = 'fas fa-dragon';
        } else if (type === 'error') {
            avatarIcon = 'fas fa-exclamation-triangle';
        }

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="${avatarIcon}"></i>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="speaker-name">${character.name} (${character.class})</span>
                    <span class="message-timestamp">${timestamp}</span>
                </div>
                <div class="message-text">
                    ${this.formatMessageContent(content)}
                </div>
            </div>
        `;

        chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Add to chat history
        this.chatHistory.push({
            timestamp: new Date().toISOString(),
            type: type,
            speaker: speaker,
            content: content
        });
    }

    formatMessageContent(content) {
        // Convert markdown-like formatting to HTML
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTimestamp(date) {
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) { // Less than 1 minute
            return 'Just now';
        } else if (diff < 3600000) { // Less than 1 hour
            const minutes = Math.floor(diff / 60000);
            return `${minutes}m ago`;
        } else if (diff < 86400000) { // Less than 1 day
            const hours = Math.floor(diff / 3600000);
            return `${hours}h ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    showTypingIndicator() {
        this.isTyping = true;
        this.updateSendButton();
        document.getElementById('typing-indicator').style.display = 'flex';
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.isTyping = false;
        this.updateSendButton();
        document.getElementById('typing-indicator').style.display = 'none';
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Character Management
    async loadCharacters() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/characters`);
            const data = await response.json();
            
            if (response.ok) {
                this.characters = data.characters || {};
                this.activeCharacter = data.active_character;
                this.updateCharacterDropdown();
                this.updateActiveCharacterInfo();
            }
        } catch (error) {
            console.error('Error loading characters:', error);
        }
    }

    updateCharacterDropdown() {
        const select = document.getElementById('character-select');
        select.innerHTML = '<option value="">Select Character...</option>';
        
        Object.entries(this.characters).forEach(([id, character]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${character.name} (${character.class})`;
            if (id === this.activeCharacter) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    async setActiveCharacter(characterId) {
        if (!characterId) return;
        
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/characters/${characterId}/activate`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.activeCharacter = characterId;
                this.updateActiveCharacterInfo();
                this.updateSidebar();
                this.updateSendButton();
            }
        } catch (error) {
            console.error('Error setting active character:', error);
        }
    }

    updateActiveCharacterInfo() {
        const character = this.characters[this.activeCharacter];
        const infoDiv = document.getElementById('active-character-info');
        
        if (character) {
            infoDiv.innerHTML = `
                <div class="character-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="character-details">
                    <div class="character-name">${character.name}</div>
                    <div class="character-class">${character.class}</div>
                    <div class="character-emotion">Emotional state: Active</div>
                </div>
            `;
        } else {
            infoDiv.innerHTML = `
                <div class="character-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="character-details">
                    <div class="character-name">No character selected</div>
                    <div class="character-class">-</div>
                    <div class="character-emotion">Emotional state: -</div>
                </div>
            `;
        }
    }

    showAddCharacterModal() {
        document.getElementById('add-character-modal').classList.add('show');
    }

    async addCharacter() {
        const characterId = document.getElementById('new-character-id').value.trim();
        const characterName = document.getElementById('new-character-name').value.trim();
        const characterClass = document.getElementById('new-character-class').value;

        if (!characterId || !characterName) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/characters`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    character_id: characterId,
                    name: characterName,
                    class: characterClass
                })
            });

            if (response.ok) {
                await this.loadCharacters();
                this.hideModal('add-character-modal');
                
                // Clear form
                document.getElementById('new-character-id').value = '';
                document.getElementById('new-character-name').value = '';
                document.getElementById('new-character-class').value = 'Fighter';
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to add character');
            }
        } catch (error) {
            console.error('Error adding character:', error);
            alert('Failed to add character');
        }
    }

    // Sidebar Management
    async updateSidebar() {
        if (!this.activeCharacter) return;
        
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/sidebar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    character_id: this.activeCharacter
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.updateSidebarContent(data);
            }
        } catch (error) {
            console.error('Error updating sidebar:', error);
        }
        
        this.saveGameState();
    }

    updateSidebarContent(data) {
        // Update character arcs
        this.updateCharacterArcs(data.character_arcs || []);
        
        // Update plot threads
        this.updatePlotThreads(data.plot_threads || []);
        
        // Update journal entries
        this.updateJournalEntries(data.journal_entries || []);
    }

    updateCharacterArcs(arcs) {
        const container = document.getElementById('character-arcs');
        
        if (arcs.length === 0) {
            container.innerHTML = '<p class="no-data">No active arcs</p>';
            return;
        }

        container.innerHTML = arcs.map(arc => `
            <div class="arc-item">
                <div class="arc-name">${arc.name}</div>
                <div class="arc-description">${arc.description}</div>
                <div class="arc-progress">
                    <div class="arc-progress-bar" style="width: ${arc.progress || 0}%"></div>
                </div>
                <div class="arc-status">
                    <span class="arc-progress-text">${arc.progress || 0}% complete</span>
                    <span class="arc-type">${arc.arc_type}</span>
                </div>
            </div>
        `).join('');
    }

    updatePlotThreads(threads) {
        const container = document.getElementById('plot-threads');
        
        if (threads.length === 0) {
            container.innerHTML = '<p class="no-data">No active threads</p>';
            return;
        }

        container.innerHTML = threads.map(thread => `
            <div class="thread-item">
                <div class="thread-header">
                    <div class="thread-name">${thread.name}</div>
                    <div class="thread-priority">P${thread.priority}</div>
                </div>
                <div class="thread-description">${thread.description}</div>
                <div class="thread-status">${thread.status}</div>
            </div>
        `).join('');
    }

    updateJournalEntries(entries) {
        const container = document.getElementById('journal-entries');
        
        if (entries.length === 0) {
            container.innerHTML = '<p class="no-data">No journal entries</p>';
            return;
        }

        container.innerHTML = entries.map(entry => `
            <div class="journal-item">
                <div class="journal-title">${entry.title}</div>
                <div class="journal-preview">${entry.content.substring(0, 100)}...</div>
                <div class="journal-meta">
                    <span>${this.formatTimestamp(new Date(entry.timestamp))}</span>
                    <span>${entry.entry_type}</span>
                </div>
            </div>
        `).join('');
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebar-toggle');
        
        this.sidebarCollapsed = !this.sidebarCollapsed;
        
        if (this.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
            toggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
        } else {
            sidebar.classList.remove('collapsed');
            toggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
        }
        
        this.saveGameState();
    }

    toggleDynamicsPanel() {
        const panel = document.getElementById('narrative-dynamics-panel');
        const toggle = document.getElementById('dynamics-toggle');
        
        this.dynamicsPanelCollapsed = !this.dynamicsPanelCollapsed;
        
        if (this.dynamicsPanelCollapsed) {
            panel.classList.add('collapsed');
            toggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
        } else {
            panel.classList.remove('collapsed');
            toggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
            // Load dynamics data when panel is opened
            this.loadNarrativeDynamics();
        }
        
        this.saveGameState();
    }

    async loadNarrativeDynamics() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/narrative-dynamics`);
            const data = await response.json();
            
            if (response.ok) {
                this.narrativeDynamicsData = data.narrative_dynamics;
                this.updateNarrativeDynamics();
            } else {
                console.error('Failed to load narrative dynamics:', data.error);
            }
        } catch (error) {
            console.error('Error loading narrative dynamics:', error);
        }
    }

    updateNarrativeDynamics() {
        if (!this.narrativeDynamicsData) return;
        
        this.updateCampaignMomentum();
        this.updateActiveEvents();
        this.updateRecentEvents();
        this.updateEmotionalThemes();
        this.updatePressurePoints();
        this.updateEmergentConflicts();
        this.updateSuggestedActions();
    }

    updateCampaignMomentum() {
        const momentumFill = document.getElementById('momentum-fill');
        const momentumText = document.getElementById('momentum-text');
        
        const momentum = this.narrativeDynamicsData.campaign_momentum || 'unknown';
        let percentage = 0;
        let text = 'Unknown';
        
        switch (momentum) {
            case 'high':
                percentage = 85;
                text = 'High Momentum';
                break;
            case 'medium':
                percentage = 55;
                text = 'Medium Momentum';
                break;
            case 'low':
                percentage = 25;
                text = 'Low Momentum';
                break;
            default:
                percentage = 0;
                text = 'Analyzing...';
        }
        
        momentumFill.style.width = `${percentage}%`;
        momentumText.textContent = text;
    }

    updateActiveEvents() {
        const container = document.getElementById('active-events');
        const events = this.narrativeDynamicsData.active_events || [];
        
        if (events.length === 0) {
            container.innerHTML = '<p class="no-data">No active events</p>';
            return;
        }
        
        container.innerHTML = events.map(event => `
            <div class="event-item">
                <div class="event-header">
                    <span class="event-icon">${event.event_icon || '⚔️'}</span>
                    <span class="event-title">${this.escapeHtml(event.title)}</span>
                    <span class="event-urgency ${event.urgency_level || 'normal'}">${event.urgency_level || 'normal'}</span>
                </div>
                <div class="event-description">${this.escapeHtml(event.description)}</div>
                ${event.suggested_actions && event.suggested_actions.length > 0 ? `
                    <div class="event-suggestions">
                        ${event.suggested_actions.slice(0, 3).map(action => 
                            `<span class="event-suggestion">${this.escapeHtml(action)}</span>`
                        ).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    updateRecentEvents() {
        const container = document.getElementById('recent-events');
        const events = this.narrativeDynamicsData.recent_events || [];
        
        if (events.length === 0) {
            container.innerHTML = '<p class="no-data">No recent events</p>';
            return;
        }
        
        container.innerHTML = events.map(event => `
            <div class="timeline-item">
                <span class="timeline-icon">${event.event_icon || '⚔️'}</span>
                <div class="timeline-content">
                    <div class="timeline-title">${this.escapeHtml(event.title)}</div>
                    <div class="timeline-time">${this.formatTimestamp(new Date(event.created_timestamp))}</div>
                </div>
            </div>
        `).join('');
    }

    updateEmotionalThemes() {
        const container = document.getElementById('emotional-themes');
        const themes = this.narrativeDynamicsData.emotional_themes || {};
        
        if (Object.keys(themes).length === 0) {
            container.innerHTML = '<p class="no-data">No emotional themes detected</p>';
            return;
        }
        
        container.innerHTML = Object.entries(themes).map(([theme, count]) => `
            <span class="theme-tag">
                ${this.escapeHtml(theme)}
                <span class="theme-count">${count}</span>
            </span>
        `).join('');
    }

    updatePressurePoints() {
        const container = document.getElementById('pressure-points');
        const points = this.narrativeDynamicsData.pressure_points || [];
        
        if (points.length === 0) {
            container.innerHTML = '<p class="no-data">No pressure points</p>';
            return;
        }
        
        container.innerHTML = points.map(point => `
            <div class="pressure-item ${point.priority || 'low'}">
                <div class="pressure-description">${this.escapeHtml(point.description)}</div>
                <div class="pressure-count">${point.count} items</div>
            </div>
        `).join('');
    }

    updateEmergentConflicts() {
        const container = document.getElementById('emergent-conflicts');
        const conflicts = this.narrativeDynamicsData.active_conflicts || [];
        
        if (conflicts.length === 0) {
            container.innerHTML = '<p class="no-data">No conflicts detected</p>';
            return;
        }
        
        container.innerHTML = conflicts.map(conflict => `
            <div class="conflict-card">
                <div class="conflict-header">
                    <div class="conflict-title">
                        <span>${conflict.conflict_icon || '⚔️'}</span>
                        ${this.escapeHtml(conflict.title)}
                    </div>
                    <span class="conflict-type">${conflict.type_label || conflict.type}</span>
                </div>
                
                <div class="conflict-description">${this.escapeHtml(conflict.description)}</div>
                
                <span class="conflict-urgency ${conflict.urgency}">${conflict.urgency}</span>
                
                ${conflict.characters_involved && conflict.characters_involved.length > 0 ? `
                    <div class="conflict-characters">
                        <strong>Involved:</strong> ${conflict.characters_involved.join(', ')}
                    </div>
                ` : ''}
                
                ${conflict.suggested_resolutions && conflict.suggested_resolutions.length > 0 ? `
                    <div class="conflict-resolutions">
                        <div class="conflict-resolution-title">Suggested Resolutions:</div>
                        ${conflict.suggested_resolutions.map(resolution => `
                            <div class="conflict-resolution" onclick="app.resolveConflict('${conflict.id}', '${resolution.id}')">
                                <div class="conflict-resolution-title">${this.escapeHtml(resolution.text)}</div>
                                <div class="conflict-resolution-description">${this.escapeHtml(resolution.description)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${conflict.impact_preview && Object.keys(conflict.impact_preview).length > 0 ? `
                    <div class="conflict-impact">
                        <div class="conflict-impact-title">Potential Impact:</div>
                        <div class="conflict-impact-details">
                            ${this.formatImpactPreview(conflict.impact_preview)}
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }
    
    formatImpactPreview(impact) {
        const parts = [];
        
        if (impact.emotional_changes) {
            const emotionalChanges = Object.entries(impact.emotional_changes)
                .map(([emotion, change]) => `${emotion}: ${change > 0 ? '+' : ''}${change}`)
                .join(', ');
            parts.push(`Emotional: ${emotionalChanges}`);
        }
        
        if (impact.arc_progress) {
            parts.push(`Arc Progress: ${Math.round(impact.arc_progress * 100)}%`);
        }
        
        if (impact.relationship_effects && Object.keys(impact.relationship_effects).length > 0) {
            const relationshipEffects = Object.entries(impact.relationship_effects)
                .map(([relationship, effect]) => `${relationship}: ${effect > 0 ? '+' : ''}${effect}`)
                .join(', ');
            parts.push(`Relationships: ${relationshipEffects}`);
        }
        
        if (impact.world_implications && impact.world_implications.length > 0) {
            parts.push(`World: ${impact.world_implications.join(', ')}`);
        }
        
        return parts.join(' | ');
    }
    
    async resolveConflict(conflictId, resolutionId) {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/conflicts/${conflictId}/resolve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    resolution_id: resolutionId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Show resolution message
                this.addMessage(`Conflict resolved: ${conflictId}`, 'ai', 'Narrative Engine');
                
                // Reload narrative dynamics to update conflicts
                await this.loadNarrativeDynamics();
            } else {
                console.error('Failed to resolve conflict:', data.error);
            }
        } catch (error) {
            console.error('Error resolving conflict:', error);
        }
    }

    updateSuggestedActions() {
        const container = document.getElementById('suggested-actions');
        const events = this.narrativeDynamicsData.active_events || [];
        
        // Collect all suggested actions from active events
        const suggestions = [];
        events.forEach(event => {
            if (event.suggested_responses && event.suggested_responses.length > 0) {
                suggestions.push(...event.suggested_responses.slice(0, 2));
            }
        });
        
        if (suggestions.length === 0) {
            container.innerHTML = '<p class="no-data">No suggestions available</p>';
            return;
        }
        
        container.innerHTML = suggestions.slice(0, 3).map(suggestion => `
            <div class="suggestion-item" onclick="app.executeSuggestion('${suggestion.id}')">
                <div class="suggestion-text">${this.escapeHtml(suggestion.text)}</div>
                <div class="suggestion-description">${this.escapeHtml(suggestion.description)}</div>
                <div class="suggestion-emotion">Emotional impact: ${suggestion.emotional_impact || 'neutral'}</div>
            </div>
        `).join('');
    }

    async executeSuggestion(suggestionId) {
        // This would execute a suggested action
        console.log('Executing suggestion:', suggestionId);
        // For now, just show a message
        this.addMessage(`Executing suggested action: ${suggestionId}`, 'ai', 'Dungeon Master');
    }

    async checkTriggeredEvents(action) {
        try {
            const character = this.characters[this.activeCharacter];
            const response = await fetch(`/api/campaign/${this.campaignId}/orchestration/triggered-events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: action,
                    character: character ? character.name : 'Unknown',
                    location: 'Current location', // This could be enhanced
                    emotional_context: ['determination', 'curiosity'] // This could be enhanced
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.triggered_events && data.triggered_events.length > 0) {
                // Show triggered events in a special way
                this.showTriggeredEvents(data.triggered_events);
            }
        } catch (error) {
            console.error('Error checking triggered events:', error);
        }
    }

    showTriggeredEvents(events) {
        // Add a special message showing triggered events
        const eventText = events.map(event => 
            `**${event.title}** (${event.event_type}): ${event.description}`
        ).join('\n\n');
        
        this.addMessage(`🎯 **Narrative Events Triggered:**\n\n${eventText}`, 'ai', 'Narrative Engine');
    }

    // Save/Load Management
    showSaveModal() {
        document.getElementById('save-campaign-modal').classList.add('show');
    }

    async saveCampaign() {
        const saveName = document.getElementById('save-name').value.trim();
        
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    save_name: saveName || undefined
                })
            });

            const data = await response.json();
            
            if (data.success) {
                alert(`Campaign saved successfully as: ${data.save_name}`);
                this.hideModal('save-campaign-modal');
                document.getElementById('save-name').value = '';
            } else {
                alert(data.error || 'Failed to save campaign');
            }
        } catch (error) {
            console.error('Error saving campaign:', error);
            alert('Failed to save campaign');
        }
    }

    showLoadModal() {
        document.getElementById('load-campaign-modal').classList.add('show');
        this.loadSavedCampaigns();
    }

    async loadSavedCampaigns() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/saves`);
            const data = await response.json();
            
            const container = document.getElementById('saved-sessions-list');
            
            if (data.saves && data.saves.length > 0) {
                container.innerHTML = data.saves.map(save => `
                    <div class="saved-session-item" onclick="app.loadCampaign('${save.save_name}')">
                        <div class="saved-session-name">${save.save_name}</div>
                        <div class="saved-session-meta">
                            <span>${this.formatTimestamp(new Date(save.save_timestamp))}</span>
                            <span>${save.chat_history_count} messages</span>
                        </div>
                        <div class="saved-session-characters">
                            ${Object.keys(save.characters || {}).length} characters
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<p class="no-data">No saved campaigns found</p>';
            }
        } catch (error) {
            console.error('Error loading saved campaigns:', error);
            document.getElementById('saved-sessions-list').innerHTML = 
                '<p class="no-data">Error loading saved campaigns</p>';
        }
    }

    async loadCampaign(saveName) {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/load`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    save_name: saveName
                })
            });

            const data = await response.json();
            
            if (data.success) {
                alert(`Campaign loaded successfully: ${data.save_name}`);
                this.hideModal('load-campaign-modal');
                
                // Reload game state
                await this.loadCharacters();
                await this.loadChatHistory();
                this.updateSidebar();
            } else {
                alert(data.error || 'Failed to load campaign');
            }
        } catch (error) {
            console.error('Error loading campaign:', error);
            alert('Failed to load campaign');
        }
    }

    async loadChatHistory() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/chat/history`);
            const data = await response.json();
            
            if (response.ok && data.chat_history) {
                // Clear current chat
                document.getElementById('chat-messages').innerHTML = '';
                
                // Add welcome message back
                this.addMessage(
                    'Welcome back! Your campaign has been loaded successfully.',
                    'ai',
                    'Dungeon Master'
                );
                
                // Add chat history (limit to last 20 messages)
                const recentHistory = data.chat_history.slice(-20);
                recentHistory.forEach(entry => {
                    this.addMessage(entry.action || entry.narration, 'ai', entry.character_name || 'Dungeon Master');
                });
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    // Debug Management
    async toggleDebugMode() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/debug/toggle`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.debugMode = data.debug_mode;
                
                if (this.debugMode) {
                    this.showDebugModal();
                }
            }
        } catch (error) {
            console.error('Error toggling debug mode:', error);
        }
    }

    async showDebugModal() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/debug/info`);
            const data = await response.json();
            
            const container = document.getElementById('debug-content');
            
            if (response.ok) {
                container.innerHTML = `
                    <div class="debug-section">
                        <h4>Session Information</h4>
                        <div class="debug-item">
                            <div class="debug-label">Campaign ID</div>
                            <div class="debug-value">${data.campaign_id || 'N/A'}</div>
                        </div>
                        <div class="debug-item">
                            <div class="debug-label">Session Duration</div>
                            <div class="debug-value">${data.session_duration || 'N/A'}</div>
                        </div>
                        <div class="debug-item">
                            <div class="debug-label">Chat History Count</div>
                            <div class="debug-value">${data.chat_history_count || 0}</div>
                        </div>
                    </div>
                    
                    <div class="debug-section">
                        <h4>Characters</h4>
                        <div class="debug-item">
                            <div class="debug-label">Active Character</div>
                            <div class="debug-value">${data.active_character || 'None'}</div>
                        </div>
                        <div class="debug-item">
                            <div class="debug-label">Total Characters</div>
                            <div class="debug-value">${Object.keys(data.characters || {}).length}</div>
                        </div>
                    </div>
                    
                    <div class="debug-section">
                        <h4>Memory Statistics</h4>
                        <div class="debug-item">
                            <div class="debug-label">Memory Stats</div>
                            <div class="debug-value">${JSON.stringify(data.memory_stats || {}, null, 2)}</div>
                        </div>
                    </div>
                `;
            } else {
                container.innerHTML = '<p class="no-data">Error loading debug information</p>';
            }
            
            document.getElementById('debug-modal').classList.add('show');
        } catch (error) {
            console.error('Error loading debug info:', error);
        }
    }

    // Modal Management
    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
        });
    }

    // Orchestration Events
    showOrchestrationEvents(events) {
        events.forEach(event => {
            this.addMessage(
                `🎭 **Orchestration Event**: ${event.description}\n\n*Suggested Response: ${event.suggested_response}*`,
                'ai',
                'Dungeon Master'
            );
        });
    }

    // Local Storage Management
    loadGameState() {
        try {
            const savedState = localStorage.getItem('dnd_game_state');
            if (savedState) {
                const state = JSON.parse(savedState);
                this.sidebarCollapsed = state.sidebarCollapsed || false;
                this.dynamicsPanelCollapsed = state.dynamicsPanelCollapsed || false;
                
                if (this.sidebarCollapsed) {
                    document.getElementById('sidebar').classList.add('collapsed');
                    document.getElementById('sidebar-toggle').innerHTML = '<i class="fas fa-chevron-right"></i>';
                }
                if (this.dynamicsPanelCollapsed) {
                    document.getElementById('narrative-dynamics-panel').classList.add('collapsed');
                    document.getElementById('dynamics-toggle').innerHTML = '<i class="fas fa-chevron-left"></i>';
                }
            }
        } catch (error) {
            console.error('Error loading game state:', error);
        }
    }

    saveGameState() {
        try {
            const state = {
                sidebarCollapsed: this.sidebarCollapsed,
                dynamicsPanelCollapsed: this.dynamicsPanelCollapsed,
                activeCharacter: this.activeCharacter
            };
            localStorage.setItem('dnd_game_state', JSON.stringify(state));
        } catch (error) {
            console.error('Error saving game state:', error);
        }
    }

    // Diagnostics Panel Management
    toggleDiagnosticsPanel() {
        const panel = document.getElementById('diagnostics-panel');
        const toggle = document.getElementById('diagnostics-toggle');
        const icon = toggle.querySelector('i');
        
        if (panel.classList.contains('open')) {
            panel.classList.remove('open');
            icon.className = 'fas fa-chevron-right';
        } else {
            panel.classList.add('open');
            icon.className = 'fas fa-chevron-left';
            this.loadDiagnostics();
        }
    }
    
    async loadDiagnostics() {
        try {
            // Load all diagnostics data
            const [timeline, arcs, heatmap, report] = await Promise.all([
                this.fetchDiagnosticsData('timeline'),
                this.fetchDiagnosticsData('arcs'),
                this.fetchDiagnosticsData('heatmap'),
                this.fetchDiagnosticsData('report')
            ]);
            
            // Store data for filtering
            this.diagnosticsData = { timeline, arcs, heatmap, report };
            
            // Update UI
            this.updateConflictTimeline(timeline);
            this.updateArcMap(arcs);
            this.updateEmotionHeatmap(heatmap);
            this.updateDiagnosticReport(report);
            
        } catch (error) {
            console.error('Error loading diagnostics:', error);
            this.showDiagnosticsError();
        }
    }
    
    async fetchDiagnosticsData(type) {
        const response = await fetch(`/api/campaign/${this.campaignId}/diagnostics/${type}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${type} data`);
        }
        return await response.json();
    }
    
    updateConflictTimeline(timeline) {
        const container = document.getElementById('conflict-timeline');
        
        if (!timeline || timeline.length === 0) {
            container.innerHTML = '<p class="no-data">No conflicts found</p>';
            return;
        }
        
        // Populate character filter
        this.populateTimelineFilters(timeline);
        
        // Display timeline
        container.innerHTML = timeline.map(conflict => this.renderTimelineItem(conflict)).join('');
        
        // Add filter event listeners
        this.bindTimelineFilters(timeline);
    }
    
    populateTimelineFilters(timeline) {
        const characterFilter = document.getElementById('timeline-character-filter');
        const characters = new Set();
        
        timeline.forEach(conflict => {
            conflict.characters_involved.forEach(char => characters.add(char));
        });
        
        // Clear existing options except "All Characters"
        characterFilter.innerHTML = '<option value="">All Characters</option>';
        characters.forEach(char => {
            const option = document.createElement('option');
            option.value = char;
            option.textContent = char;
            characterFilter.appendChild(option);
        });
    }
    
    renderTimelineItem(conflict) {
        const statusClass = conflict.resolved ? 'resolved' : 'unresolved';
        const statusIcon = conflict.resolved ? '✔️' : '❌';
        const statusText = conflict.resolved ? 'Resolved' : 'Unresolved';
        
        return `
            <div class="timeline-item ${statusClass} ${conflict.type}" data-conflict-id="${conflict.id}">
                <div class="timeline-header">
                    <div class="timeline-title">${this.escapeHtml(conflict.description)}</div>
                    <div class="timeline-meta">
                        <span class="timeline-type ${conflict.type}">${conflict.type}</span>
                        <span class="timeline-urgency ${conflict.urgency}">${conflict.urgency}</span>
                        <span class="timeline-status ${statusClass}">${statusIcon} ${statusText}</span>
                    </div>
                </div>
                <div class="timeline-description">${this.escapeHtml(conflict.description)}</div>
                <div class="timeline-characters">
                    <strong>Involved:</strong> ${conflict.characters_involved.join(', ')}
                </div>
                ${conflict.resolution_action ? `
                    <div class="timeline-resolution">
                        <strong>Resolution:</strong> ${this.escapeHtml(conflict.resolution_action)}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    bindTimelineFilters(originalTimeline) {
        const characterFilter = document.getElementById('timeline-character-filter');
        const typeFilter = document.getElementById('timeline-type-filter');
        const statusFilter = document.getElementById('timeline-status-filter');
        
        const applyFilters = () => {
            let filtered = [...originalTimeline];
            
            const character = characterFilter.value;
            const type = typeFilter.value;
            const status = statusFilter.value;
            
            if (character) {
                filtered = filtered.filter(conflict => 
                    conflict.characters_involved.includes(character)
                );
            }
            
            if (type) {
                filtered = filtered.filter(conflict => conflict.type === type);
            }
            
            if (status) {
                filtered = filtered.filter(conflict => {
                    if (status === 'resolved') return conflict.resolved;
                    if (status === 'unresolved') return !conflict.resolved;
                    return true;
                });
            }
            
            const container = document.getElementById('conflict-timeline');
            container.innerHTML = filtered.map(conflict => this.renderTimelineItem(conflict)).join('');
        };
        
        characterFilter.addEventListener('change', applyFilters);
        typeFilter.addEventListener('change', applyFilters);
        statusFilter.addEventListener('change', applyFilters);
    }
    
    updateArcMap(arcs) {
        const container = document.getElementById('arc-map');
        
        if (!arcs || Object.keys(arcs).length === 0) {
            container.innerHTML = '<p class="no-data">No character arcs found</p>';
            return;
        }
        
        container.innerHTML = Object.entries(arcs).map(([characterId, characterArcs]) => `
            <div class="character-arcs">
                <div class="character-arcs-header">${this.escapeHtml(characterId)}</div>
                ${characterArcs.map(arc => this.renderArcItem(arc)).join('')}
            </div>
        `).join('');
        
        // Bind arc controls
        this.bindArcControls(arcs);
    }
    
    renderArcItem(arc) {
        const statusClass = arc.status || 'active';
        const progress = arc.milestones ? Math.round((arc.milestones.length / 5) * 100) : 0;
        
        return `
            <div class="arc-item" data-arc-id="${arc.arc_id}">
                <div class="arc-header">
                    <div class="arc-title">${this.escapeHtml(arc.title)}</div>
                    <span class="arc-status ${statusClass}">${statusClass}</span>
                </div>
                <div class="arc-description">${this.escapeHtml(arc.description)}</div>
                <div class="arc-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
                ${arc.milestones && arc.milestones.length > 0 ? `
                    <div class="arc-milestones">
                        ${arc.milestones.map(milestone => `
                            <div class="milestone-item">
                                <div class="milestone-title">${this.escapeHtml(milestone.title)}</div>
                                <div class="milestone-description">${this.escapeHtml(milestone.description)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    bindArcControls(arcs) {
        const showAllCheckbox = document.getElementById('show-all-arcs');
        
        showAllCheckbox.addEventListener('change', () => {
            const showAll = showAllCheckbox.checked;
            const arcItems = document.querySelectorAll('.arc-item');
            
            arcItems.forEach(item => {
                const status = item.querySelector('.arc-status').textContent;
                if (!showAll && status === 'resolved') {
                    item.style.display = 'none';
                } else {
                    item.style.display = 'block';
                }
            });
        });
    }
    
    updateEmotionHeatmap(heatmap) {
        const container = document.getElementById('emotion-heatmap');
        const chartCanvas = document.getElementById('emotion-chart');
        const placeholder = document.getElementById('heatmap-placeholder');
        
        if (!heatmap || Object.keys(heatmap).length === 0) {
            chartCanvas.style.display = 'none';
            placeholder.style.display = 'block';
            placeholder.innerHTML = '<p class="no-data">No emotion data found</p>';
            return;
        }
        
        // Hide placeholder and show chart
        placeholder.style.display = 'none';
        chartCanvas.style.display = 'block';
        
        // Populate character selector
        this.populateHeatmapCharacterSelector(heatmap);
        
        // Store heatmap data for export
        this.currentHeatmapData = heatmap;
        
        // Create Chart.js visualization
        this.createEmotionChart(heatmap);
        
        // Bind heatmap controls
        this.bindHeatmapControls(heatmap);
    }
    
    createEmotionChart(heatmap) {
        const ctx = document.getElementById('emotion-chart').getContext('2d');
        
        // Destroy existing chart if it exists
        if (this.emotionChart) {
            this.emotionChart.destroy();
        }
        
        // Get all unique emotions and create color mapping
        const emotions = new Set();
        Object.values(heatmap).forEach(characterData => {
            characterData.forEach(point => emotions.add(point.emotion));
        });
        
        const emotionColors = {
            'joy': '#27ae60',
            'fear': '#e74c3c',
            'anger': '#c0392b',
            'curiosity': '#3498db',
            'sadness': '#9b59b6',
            'wonder': '#f39c12',
            'anxiety': '#e67e22',
            'hope': '#2ecc71',
            'surprise': '#f1c40f',
            'disgust': '#8e44ad',
            'love': '#e91e63',
            'hate': '#d35400'
        };
        
        // Prepare datasets for each emotion
        const datasets = [];
        const selectedCharacter = document.getElementById('heatmap-character-select').value;
        
        emotions.forEach(emotion => {
            const data = [];
            const labels = [];
            
            if (selectedCharacter && heatmap[selectedCharacter]) {
                // Single character view
                heatmap[selectedCharacter].forEach(point => {
                    if (point.emotion === emotion) {
                        const timestamp = new Date(point.timestamp);
                        labels.push(timestamp.toLocaleTimeString());
                        data.push(point.intensity);
                    }
                });
            } else {
                // All characters view - aggregate data
                const timeMap = new Map();
                
                Object.values(heatmap).forEach(characterData => {
                    characterData.forEach(point => {
                        if (point.emotion === emotion) {
                            const timeKey = new Date(point.timestamp).toLocaleTimeString();
                            if (!timeMap.has(timeKey)) {
                                timeMap.set(timeKey, []);
                            }
                            timeMap.get(timeKey).push(point.intensity);
                        }
                    });
                });
                
                // Average intensities for each time point
                timeMap.forEach((intensities, timeKey) => {
                    labels.push(timeKey);
                    data.push(intensities.reduce((a, b) => a + b, 0) / intensities.length);
                });
            }
            
            if (data.length > 0) {
                datasets.push({
                    label: emotion.charAt(0).toUpperCase() + emotion.slice(1),
                    data: data,
                    borderColor: emotionColors[emotion] || '#95a5a6',
                    backgroundColor: emotionColors[emotion] || '#95a5a6',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 6
                });
            }
        });
        
        // Create the chart
        this.emotionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: datasets.length > 0 ? datasets[0].data.map((_, i) => `Time ${i + 1}`) : [],
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#ecf0f1',
                            font: {
                                size: 11
                            },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.9)',
                        titleColor: '#ecf0f1',
                        bodyColor: '#bdc3c7',
                        borderColor: '#34495e',
                        borderWidth: 1,
                        cornerRadius: 6,
                        displayColors: true,
                        callbacks: {
                            title: function(context) {
                                return `Time: ${context[0].label}`;
                            },
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Time',
                            color: '#ecf0f1',
                            font: {
                                size: 12
                            }
                        },
                        ticks: {
                            color: '#bdc3c7',
                            maxTicksLimit: 8
                        },
                        grid: {
                            color: 'rgba(52, 73, 94, 0.3)'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Emotion Intensity',
                            color: '#ecf0f1',
                            font: {
                                size: 12
                            }
                        },
                        ticks: {
                            color: '#bdc3c7',
                            beginAtZero: true,
                            max: 1,
                            stepSize: 0.2
                        },
                        grid: {
                            color: 'rgba(52, 73, 94, 0.3)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                elements: {
                    point: {
                        hoverBackgroundColor: '#ecf0f1'
                    }
                }
            }
        });
    }
    
    populateHeatmapCharacterSelector(heatmap) {
        const selector = document.getElementById('heatmap-character-select');
        selector.innerHTML = '<option value="">All Characters</option>';
        
        Object.keys(heatmap).forEach(characterId => {
            const option = document.createElement('option');
            option.value = characterId;
            option.textContent = characterId;
            selector.appendChild(option);
        });
    }
    
    bindHeatmapControls(heatmap) {
        const characterSelect = document.getElementById('heatmap-character-select');
        const exportPngButton = document.getElementById('export-heatmap-png');
        const exportCsvButton = document.getElementById('export-heatmap-csv');
        
        // Character selection - update chart when changed
        characterSelect.addEventListener('change', () => {
            const selectedCharacter = characterSelect.value;
            this.createEmotionChart(heatmap);
        });
        
        // PNG Export
        exportPngButton.addEventListener('click', () => {
            this.exportHeatmapAsPNG();
        });
        
        // CSV Export
        exportCsvButton.addEventListener('click', () => {
            this.exportHeatmapAsCSV(heatmap);
        });
    }
    
    exportHeatmapAsPNG() {
        if (!this.emotionChart) {
            this.showNotification('No chart available to export', 'error');
            return;
        }
        
        try {
            const canvas = document.getElementById('emotion-chart');
            const link = document.createElement('a');
            link.download = `emotion-heatmap-${this.campaignId}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            this.showNotification('Chart exported as PNG successfully!', 'success');
        } catch (error) {
            console.error('Error exporting PNG:', error);
            this.showNotification('Failed to export PNG', 'error');
        }
    }
    
    exportHeatmapAsCSV(heatmap) {
        if (!heatmap || Object.keys(heatmap).length === 0) {
            this.showNotification('No data available to export', 'error');
            return;
        }
        
        try {
            const selectedCharacter = document.getElementById('heatmap-character-select').value;
            let csvContent = 'Timestamp,Character,Emotion,Intensity,Context\n';
            
            if (selectedCharacter && heatmap[selectedCharacter]) {
                // Single character export
                heatmap[selectedCharacter].forEach(point => {
                    csvContent += `"${point.timestamp}","${selectedCharacter}","${point.emotion}",${point.intensity},"${point.context}"\n`;
                });
            } else {
                // All characters export
                Object.entries(heatmap).forEach(([character, data]) => {
                    data.forEach(point => {
                        csvContent += `"${point.timestamp}","${character}","${point.emotion}",${point.intensity},"${point.context}"\n`;
                    });
                });
            }
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `emotion-heatmap-${this.campaignId}.csv`;
            link.click();
            
            this.showNotification('Data exported as CSV successfully!', 'success');
        } catch (error) {
            console.error('Error exporting CSV:', error);
            this.showNotification('Failed to export CSV', 'error');
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 3000);
    }
    
    updateDiagnosticReport(report) {
        const container = document.getElementById('diagnostic-report');
        
        if (!report) {
            container.innerHTML = '<p class="no-data">No report data available</p>';
            return;
        }
        
        container.innerHTML = `
            <div class="report-section">
                <div class="report-section-title">Campaign Statistics</div>
                <div class="report-stats">
                    <div class="report-stat">
                        <div class="report-stat-value">${report.total_actions || 0}</div>
                        <div class="report-stat-label">Total Actions</div>
                    </div>
                    <div class="report-stat">
                        <div class="report-stat-value">${report.total_conflicts || 0}</div>
                        <div class="report-stat-label">Total Conflicts</div>
                    </div>
                    <div class="report-stat">
                        <div class="report-stat-value">${report.resolved_conflicts || 0}</div>
                        <div class="report-stat-label">Resolved</div>
                    </div>
                    <div class="report-stat">
                        <div class="report-stat-value">${report.unresolved_conflicts || 0}</div>
                        <div class="report-stat-label">Unresolved</div>
                    </div>
                </div>
            </div>
            
            ${report.dominant_emotions && Object.keys(report.dominant_emotions).length > 0 ? `
                <div class="report-section">
                    <div class="report-section-title">Dominant Emotions</div>
                    <div class="report-emotions">
                        ${Object.entries(report.dominant_emotions).map(([character, emotion]) => `
                            <span class="emotion-tag">${character}: ${emotion}</span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${report.arc_progress_summary && Object.keys(report.arc_progress_summary).length > 0 ? `
                <div class="report-section">
                    <div class="report-section-title">Arc Progress Summary</div>
                    <div class="report-emotions">
                        ${Object.entries(report.arc_progress_summary).map(([character, statuses]) => `
                            <span class="emotion-tag">${character}: ${statuses.length} arcs</span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
        
        // Store report data for export
        this.currentReport = report;
        
        // Bind report actions
        this.bindReportActions();
    }
    
    bindReportActions() {
        const downloadJsonButton = document.getElementById('download-json');
        const downloadMarkdownButton = document.getElementById('download-markdown');
        const downloadPdfButton = document.getElementById('download-pdf');
        const copyMarkdownButton = document.getElementById('copy-markdown');
        
        downloadJsonButton.addEventListener('click', () => {
            this.downloadReportAsJSON();
        });
        
        downloadMarkdownButton.addEventListener('click', () => {
            this.downloadReportAsMarkdown();
        });
        
        downloadPdfButton.addEventListener('click', () => {
            this.downloadReportAsPDF();
        });
        
        copyMarkdownButton.addEventListener('click', () => {
            this.copyReportAsMarkdown();
        });
    }
    
    downloadReportAsJSON() {
        if (!this.currentReport) {
            this.showNotification('No report data available', 'error');
            return;
        }
        
        try {
            const dataStr = JSON.stringify(this.currentReport, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `diagnostic-report-${this.campaignId}.json`;
            link.click();
            
            URL.revokeObjectURL(url);
            this.showNotification('Report exported as JSON successfully!', 'success');
        } catch (error) {
            console.error('Error exporting JSON:', error);
            this.showNotification('Failed to export JSON', 'error');
        }
    }
    
    downloadReportAsMarkdown() {
        if (!this.currentReport) {
            this.showNotification('No report data available', 'error');
            return;
        }
        
        try {
            const markdown = this.generateMarkdownReport();
            const dataBlob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `diagnostic-report-${this.campaignId}.md`;
            link.click();
            
            URL.revokeObjectURL(url);
            this.showNotification('Report exported as Markdown successfully!', 'success');
        } catch (error) {
            console.error('Error exporting Markdown:', error);
            this.showNotification('Failed to export Markdown', 'error');
        }
    }
    
    async downloadReportAsPDF() {
        if (!this.currentReport) {
            this.showNotification('No report data available', 'error');
            return;
        }
        
        try {
            const markdown = this.generateMarkdownReport();
            const htmlContent = this.convertMarkdownToHTML(markdown);
            
            const element = document.createElement('div');
            element.innerHTML = htmlContent;
            element.style.padding = '20px';
            element.style.fontFamily = 'Arial, sans-serif';
            element.style.color = '#333';
            element.style.backgroundColor = '#fff';
            
            const opt = {
                margin: 1,
                filename: `diagnostic-report-${this.campaignId}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
            };
            
            await html2pdf().set(opt).from(element).save();
            this.showNotification('Report exported as PDF successfully!', 'success');
        } catch (error) {
            console.error('Error exporting PDF:', error);
            this.showNotification('Failed to export PDF', 'error');
        }
    }
    
    async copyReportAsMarkdown() {
        if (!this.currentReport) {
            this.showNotification('No report data available', 'error');
            return;
        }
        
        try {
            const markdown = this.generateMarkdownReport();
            await navigator.clipboard.writeText(markdown);
            
            // Show success feedback
            const copyButton = document.getElementById('copy-markdown');
            const originalText = copyButton.innerHTML;
            copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyButton.style.background = '#27ae60';
            
            setTimeout(() => {
                copyButton.innerHTML = originalText;
                copyButton.style.background = '';
            }, 2000);
            
            this.showNotification('Markdown report copied to clipboard!', 'success');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showNotification('Failed to copy to clipboard', 'error');
        }
    }
    
    generateMarkdownReport() {
        const report = this.currentReport;
        const timestamp = new Date().toLocaleString();
        
        let markdown = `# Diagnostic Report - ${this.campaignId}\n\n`;
        markdown += `**Generated:** ${timestamp}\n\n`;
        
        // Campaign Statistics
        markdown += `## Campaign Statistics\n\n`;
        markdown += `| Metric | Value |\n`;
        markdown += `|--------|-------|\n`;
        markdown += `| Total Actions | ${report.total_actions || 0} |\n`;
        markdown += `| Total Conflicts | ${report.total_conflicts || 0} |\n`;
        markdown += `| Resolved Conflicts | ${report.resolved_conflicts || 0} |\n`;
        markdown += `| Unresolved Conflicts | ${report.unresolved_conflicts || 0} |\n`;
        markdown += `| Campaign Health Score | ${(report.campaign_health_score * 100).toFixed(1)}% |\n`;
        markdown += `| Narrative Coherence | ${(report.narrative_coherence * 100).toFixed(1)}% |\n`;
        markdown += `| Character Engagement | ${(report.character_engagement * 100).toFixed(1)}% |\n\n`;
        
        // Dominant Emotions
        if (report.dominant_emotions && Object.keys(report.dominant_emotions).length > 0) {
            markdown += `## Dominant Emotions\n\n`;
            Object.entries(report.dominant_emotions).forEach(([character, emotion]) => {
                markdown += `- **${character}**: ${emotion}\n`;
            });
            markdown += `\n`;
        }
        
        // Arc Progress Summary
        if (report.arc_progress_summary && Object.keys(report.arc_progress_summary).length > 0) {
            markdown += `## Character Arc Progress\n\n`;
            Object.entries(report.arc_progress_summary).forEach(([character, statuses]) => {
                markdown += `- **${character}**: ${statuses.length} active arcs\n`;
            });
            markdown += `\n`;
        }
        
        // Additional Metrics
        if (report.conflict_resolution_rate !== undefined) {
            markdown += `## Additional Metrics\n\n`;
            markdown += `- **Conflict Resolution Rate**: ${(report.conflict_resolution_rate * 100).toFixed(1)}%\n`;
            markdown += `- **Emotional Volatility**: ${(report.emotional_volatility * 100).toFixed(1)}%\n\n`;
        }
        
        markdown += `---\n*Report generated by DnD 5E Solo Adventure Diagnostics Panel*\n`;
        
        return markdown;
    }
    
    convertMarkdownToHTML(markdown) {
        // Simple markdown to HTML conversion for PDF export
        let html = markdown
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        // Handle tables
        html = html.replace(/\|(.*)\|/g, '<tr><td>' + '$1'.split('|').join('</td><td>') + '</td></tr>');
        html = html.replace(/<tr><td>Metric<\/td><td>Value<\/td><\/tr>/g, '<table border="1" style="border-collapse: collapse; width: 100%;"><tr><th>Metric</th><th>Value</th></tr>');
        html = html.replace(/<\/tr><p>/g, '</tr></table><p>');
        
        return `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${html}</div>`;
    }
    
    showDiagnosticsError() {
        const sections = ['conflict-timeline', 'arc-map', 'emotion-heatmap', 'diagnostic-report'];
        sections.forEach(sectionId => {
            const container = document.getElementById(sectionId);
            if (container) {
                container.innerHTML = '<p class="no-data">Error loading data</p>';
            }
        });
    }

    // Campaign Overview Management
    toggleOverviewPanel() {
        const panel = document.getElementById('campaign-overview-panel');
        const toggle = document.getElementById('overview-toggle');
        
        this.overviewPanelCollapsed = !this.overviewPanelCollapsed;
        
        if (this.overviewPanelCollapsed) {
            panel.classList.add('collapsed');
            toggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
        } else {
            panel.classList.remove('collapsed');
            toggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
        }
        
        this.saveGameState();
    }

    async loadCampaignOverview() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/summary`);
            const data = await response.json();
            
            if (response.ok) {
                this.updateCampaignOverview(data);
            } else {
                console.error('Failed to load campaign overview:', data.error);
            }
        } catch (error) {
            console.error('Error loading campaign overview:', error);
        }
    }

    updateCampaignOverview(data) {
        // Update campaign info
        document.getElementById('campaign-name').textContent = data.campaign_name || 'Demo Campaign';
        document.getElementById('campaign-id').textContent = data.campaign_id || this.campaignId;
        
        // Update session stats
        document.getElementById('total-sessions').textContent = data.total_sessions || '0';
        document.getElementById('last-session').textContent = this.formatLastSession(data.last_session);
        document.getElementById('session-duration').textContent = this.formatDuration(data.session_duration);
        
        // Update characters
        this.updateActiveCharacters(data.characters || []);
        
        // Update arcs summary
        this.updateArcsSummary(data.character_arcs || []);
        
        // Update threads summary
        this.updateThreadsSummary(data.plot_threads || []);
        
        // Update journal stats
        document.getElementById('total-journal-entries').textContent = data.total_journal_entries || '0';
    }

    updateActiveCharacters(characters) {
        const container = document.getElementById('active-characters');
        const loadingSpinner = document.getElementById('characters-loading');
        const noData = document.getElementById('characters-no-data');
        
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        
        if (characters.length === 0) {
            if (noData) noData.style.display = 'block';
            return;
        }
        
        if (noData) noData.style.display = 'none';
        
        const charactersHtml = characters.map(char => `
            <div class="character-card">
                <div class="character-card-header">
                    <div class="character-card-avatar">
                        ${char.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="character-card-info">
                        <div class="character-card-name">${this.escapeHtml(char.name)}</div>
                        <div class="character-card-class">${this.escapeHtml(char.class || 'Adventurer')}</div>
                    </div>
                </div>
                <div class="character-card-stats">
                    <div class="character-stat">
                        <span class="character-stat-value">${char.level || 1}</span>
                        <span class="character-stat-label">Level</span>
                    </div>
                    <div class="character-stat">
                        <span class="character-stat-value">${char.hp || '??'}</span>
                        <span class="character-stat-label">HP</span>
                    </div>
                    <div class="character-stat">
                        <span class="character-stat-value">${char.xp || 0}</span>
                        <span class="character-stat-label">XP</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = charactersHtml;
    }

    updateArcsSummary(arcs) {
        // Update summary stats
        const totalArcs = arcs.length;
        const activeArcs = arcs.filter(arc => arc.status === 'active').length;
        const completedArcs = arcs.filter(arc => arc.status === 'completed').length;
        
        document.getElementById('total-arcs').textContent = totalArcs;
        document.getElementById('active-arcs').textContent = activeArcs;
        document.getElementById('completed-arcs').textContent = completedArcs;
        
        // Update arcs list
        const container = document.getElementById('arcs-summary-list');
        if (arcs.length === 0) {
            container.innerHTML = '<p class="no-data">No arcs found</p>';
            return;
        }
        
        const arcsHtml = arcs.slice(0, 3).map(arc => `
            <div class="summary-item">
                <div class="summary-item-header">
                    <div class="summary-item-title">${this.escapeHtml(arc.title)}</div>
                    <div class="summary-item-status ${arc.status}">${arc.status}</div>
                </div>
                <div class="summary-item-description">${this.escapeHtml(arc.description || '')}</div>
            </div>
        `).join('');
        
        container.innerHTML = arcsHtml;
    }

    updateThreadsSummary(threads) {
        // Update summary stats
        const totalThreads = threads.length;
        const openThreads = threads.filter(thread => thread.status === 'open').length;
        const resolvedThreads = threads.filter(thread => thread.status === 'resolved').length;
        
        document.getElementById('total-threads').textContent = totalThreads;
        document.getElementById('open-threads').textContent = openThreads;
        document.getElementById('resolved-threads').textContent = resolvedThreads;
        
        // Update threads list
        const container = document.getElementById('threads-summary-list');
        if (threads.length === 0) {
            container.innerHTML = '<p class="no-data">No threads found</p>';
            return;
        }
        
        const threadsHtml = threads.slice(0, 3).map(thread => `
            <div class="summary-item">
                <div class="summary-item-header">
                    <div class="summary-item-title">${this.escapeHtml(thread.title)}</div>
                    <div class="summary-item-status ${thread.status}">${thread.status}</div>
                </div>
                <div class="summary-item-description">${this.escapeHtml(thread.description || '')}</div>
            </div>
        `).join('');
        
        container.innerHTML = threadsHtml;
    }

    formatLastSession(lastSession) {
        if (!lastSession) return 'Never';
        
        const date = new Date(lastSession);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        return `${Math.floor(diffDays / 30)} months ago`;
    }

    formatDuration(duration) {
        if (!duration) return 'Unknown';
        
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    async exportCampaignMarkdown() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/summary`);
            const data = await response.json();
            
            if (response.ok) {
                const markdown = this.generateCampaignMarkdown(data);
                this.downloadFile(markdown, `campaign-${this.campaignId}.md`, 'text/markdown');
                this.showExportFeedback('Markdown exported successfully!', 'success');
            } else {
                this.showExportFeedback('Failed to export markdown', 'error');
            }
        } catch (error) {
            console.error('Error exporting markdown:', error);
            this.showExportFeedback('Error exporting markdown', 'error');
        }
    }

    async exportCampaignJSON() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/summary`);
            const data = await response.json();
            
            if (response.ok) {
                const json = JSON.stringify(data, null, 2);
                this.downloadFile(json, `campaign-${this.campaignId}.json`, 'application/json');
                this.showExportFeedback('JSON exported successfully!', 'success');
            } else {
                this.showExportFeedback('Failed to export JSON', 'error');
            }
        } catch (error) {
            console.error('Error exporting JSON:', error);
            this.showExportFeedback('Error exporting JSON', 'error');
        }
    }

    async copyCampaignSummary() {
        try {
            const response = await fetch(`/api/campaign/${this.campaignId}/summary`);
            const data = await response.json();
            
            if (response.ok) {
                const summary = this.generateCampaignSummary(data);
                await navigator.clipboard.writeText(summary);
                this.showExportFeedback('Summary copied to clipboard!', 'success');
            } else {
                this.showExportFeedback('Failed to copy summary', 'error');
            }
        } catch (error) {
            console.error('Error copying summary:', error);
            this.showExportFeedback('Error copying summary', 'error');
        }
    }

    generateCampaignMarkdown(data) {
        return `# Campaign Overview: ${data.campaign_name || 'Demo Campaign'}

## Campaign Info
- **Campaign ID**: ${data.campaign_id || this.campaignId}
- **Total Sessions**: ${data.total_sessions || 0}
- **Last Session**: ${this.formatLastSession(data.last_session)}
- **Session Duration**: ${this.formatDuration(data.session_duration)}

## Characters
${(data.characters || []).map(char => `
### ${char.name}
- **Class**: ${char.class || 'Adventurer'}
- **Level**: ${char.level || 1}
- **HP**: ${char.hp || '??'}
- **XP**: ${char.xp || 0}
`).join('\n')}

## Character Arcs
${(data.character_arcs || []).map(arc => `
### ${arc.title}
- **Status**: ${arc.status}
- **Description**: ${arc.description || ''}
`).join('\n')}

## Plot Threads
${(data.plot_threads || []).map(thread => `
### ${thread.title}
- **Status**: ${thread.status}
- **Description**: ${thread.description || ''}
`).join('\n')}

## Journal Entries
Total entries: ${data.total_journal_entries || 0}

---
*Generated on ${new Date().toLocaleString()}*
`;
    }

    generateCampaignSummary(data) {
        return `Campaign: ${data.campaign_name || 'Demo Campaign'}
Characters: ${(data.characters || []).length}
Active Arcs: ${(data.character_arcs || []).filter(arc => arc.status === 'active').length}
Open Threads: ${(data.plot_threads || []).filter(thread => thread.status === 'open').length}
Journal Entries: ${data.total_journal_entries || 0}`;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showExportFeedback(message, type) {
        const feedback = document.getElementById('export-feedback');
        const feedbackMessage = document.getElementById('feedback-message');
        
        if (feedback && feedbackMessage) {
            feedbackMessage.textContent = message;
            feedback.className = `export-feedback ${type}`;
            feedback.style.display = 'block';
            
            setTimeout(() => {
                feedback.style.display = 'none';
            }, 3000);
        }
    }

    showFullJournalModal() {
        // TODO: Implement full journal modal
        this.showNotification('Full journal view coming soon!', 'info');
    }
}

// Initialize the app when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DnDGameApp();
});

// Save state before page unload
window.addEventListener('beforeunload', () => {
    if (app) {
        app.saveGameState();
    }
});

// Lore Panel functionality
let lorePanel = {
    isOpen: false,
    currentEntries: [],
    currentFilters: {
        query: '',
        type: '',
        importance: '',
        showSecrets: false
    }
};

// Toggle lore panel
document.getElementById('lore-toggle').addEventListener('click', function() {
    lorePanel.isOpen = !lorePanel.isOpen;
    const panel = document.getElementById('lore-panel');
    const icon = this.querySelector('i');
    
    if (lorePanel.isOpen) {
        panel.classList.add('active');
        icon.className = 'fas fa-chevron-left';
        loadLoreData();
    } else {
        panel.classList.remove('active');
        icon.className = 'fas fa-chevron-right';
    }
});

// Load lore data
async function loadLoreData() {
    try {
        const response = await fetch(`/api/campaign/${currentCampaign}/lore`);
        const data = await response.json();
        
        if (data.entries) {
            lorePanel.currentEntries = data.entries;
            updateLoreSummary(data.summary);
            renderLoreEntries(data.entries);
        }
    } catch (error) {
        console.error('Error loading lore data:', error);
        showNotification('Error loading lore data', 'error');
    }
}

// Update lore summary
function updateLoreSummary(summary) {
    document.getElementById('total-lore-entries').textContent = summary.total_entries || 0;
    document.getElementById('recent-lore-entries').textContent = summary.recent_entries || 0;
    
    // Count secret entries
    const secretCount = lorePanel.currentEntries.filter(entry => entry.is_secret).length;
    document.getElementById('secret-lore-entries').textContent = secretCount;
}

// Render lore entries
function renderLoreEntries(entries) {
    const container = document.getElementById('lore-entries');
    
    if (!entries || entries.length === 0) {
        container.innerHTML = '<p class="no-data">No lore entries found</p>';
        return;
    }
    
    container.innerHTML = entries.map(entry => `
        <div class="lore-entry-card ${entry.is_secret ? 'secret' : ''} ${getImportanceClass(entry.importance_level)}" 
             data-lore-id="${entry.id}">
            <div class="lore-entry-header">
                <h5 class="lore-entry-title">${entry.title}</h5>
                <span class="lore-entry-type">${entry.type}</span>
            </div>
            <div class="lore-entry-content">${entry.content}</div>
            <div class="lore-entry-meta">
                <div class="lore-entry-tags">
                    ${entry.tags.map(tag => `<span class="lore-tag">${tag}</span>`).join('')}
                </div>
                <div class="lore-entry-importance">
                    <span class="importance-stars">${'★'.repeat(entry.importance_level)}</span>
                    ${entry.discovered_by ? `<span class="lore-entry-discovered">by ${entry.discovered_by}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.lore-entry-card').forEach(card => {
        card.addEventListener('click', () => showLoreEntryModal(card.dataset.loreId));
    });
}

// Get importance class for styling
function getImportanceClass(importance) {
    if (importance >= 5) return 'critical';
    if (importance >= 4) return 'high';
    return '';
}

// Show lore entry modal
async function showLoreEntryModal(loreId) {
    try {
        const response = await fetch(`/api/campaign/${currentCampaign}/lore/${loreId}`);
        const entry = await response.json();
        
        if (!entry) {
            showNotification('Lore entry not found', 'error');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal show lore-entry-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Lore Entry</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="lore-entry-full">
                        <div class="lore-entry-full-header">
                            <h4 class="lore-entry-full-title">${entry.title}</h4>
                            <span class="lore-entry-full-type">${entry.type}</span>
                        </div>
                        <div class="lore-entry-full-content">${entry.content}</div>
                        <div class="lore-entry-full-meta">
                            <div class="meta-item">
                                <div class="meta-label">Importance</div>
                                <div class="meta-value">${'★'.repeat(entry.importance_level)}</div>
                            </div>
                            ${entry.discovered_by ? `
                                <div class="meta-item">
                                    <div class="meta-label">Discovered By</div>
                                    <div class="meta-value">${entry.discovered_by}</div>
                                </div>
                            ` : ''}
                            ${entry.discovery_context ? `
                                <div class="meta-item">
                                    <div class="meta-label">Context</div>
                                    <div class="meta-value">${entry.discovery_context}</div>
                                </div>
                            ` : ''}
                            <div class="meta-item">
                                <div class="meta-label">Created</div>
                                <div class="meta-value">${new Date(entry.created_at).toLocaleDateString()}</div>
                            </div>
                            ${entry.is_secret ? `
                                <div class="meta-item">
                                    <div class="meta-label">Status</div>
                                    <div class="meta-value">Secret</div>
                                </div>
                            ` : ''}
                        </div>
                        ${entry.tags.length > 0 ? `
                            <div class="lore-entry-linked">
                                <h5>Tags</h5>
                                <div class="linked-items">
                                    ${entry.tags.map(tag => `<span class="linked-item">${tag}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${Object.keys(entry.linked_items).some(key => entry.linked_items[key].length > 0) ? `
                            <div class="lore-entry-linked">
                                <h5>Linked Items</h5>
                                <div class="linked-items">
                                    ${Object.entries(entry.linked_items).map(([type, items]) => 
                                        items.map(item => `<span class="linked-item">${type}: ${item}</span>`).join('')
                                    ).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
    } catch (error) {
        console.error('Error loading lore entry:', error);
        showNotification('Error loading lore entry', 'error');
    }
}

// Search lore entries
document.getElementById('lore-search-btn').addEventListener('click', function() {
    const query = document.getElementById('lore-search-input').value;
    lorePanel.currentFilters.query = query;
    searchLoreEntries();
});

document.getElementById('lore-search-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const query = this.value;
        lorePanel.currentFilters.query = query;
        searchLoreEntries();
    }
});

// Filter lore entries
document.getElementById('lore-type-filter').addEventListener('change', function() {
    lorePanel.currentFilters.type = this.value;
    searchLoreEntries();
});

document.getElementById('lore-importance-filter').addEventListener('change', function() {
    lorePanel.currentFilters.importance = this.value;
    searchLoreEntries();
});

document.getElementById('show-secrets').addEventListener('change', function() {
    lorePanel.currentFilters.showSecrets = this.checked;
    searchLoreEntries();
});

// Search and filter lore entries
async function searchLoreEntries() {
    try {
        const params = new URLSearchParams();
        if (lorePanel.currentFilters.query) {
            params.append('q', lorePanel.currentFilters.query);
        }
        if (lorePanel.currentFilters.type) {
            params.append('type', lorePanel.currentFilters.type);
        }
        if (lorePanel.currentFilters.importance) {
            params.append('importance', lorePanel.currentFilters.importance);
        }
        
        const response = await fetch(`/api/campaign/${currentCampaign}/lore/search?${params}`);
        const data = await response.json();
        
        let filteredEntries = data.results || [];
        
        // Apply client-side filters
        if (!lorePanel.currentFilters.showSecrets) {
            filteredEntries = filteredEntries.filter(entry => !entry.is_secret);
        }
        
        if (lorePanel.currentFilters.importance) {
            const importance = parseInt(lorePanel.currentFilters.importance);
            filteredEntries = filteredEntries.filter(entry => entry.importance_level >= importance);
        }
        
        renderLoreEntries(filteredEntries);
        
    } catch (error) {
        console.error('Error searching lore entries:', error);
        showNotification('Error searching lore entries', 'error');
    }
}

// Add new lore entry
document.getElementById('add-lore-btn').addEventListener('click', function() {
    showAddLoreModal();
});

function showAddLoreModal() {
    const modal = document.createElement('div');
    modal.className = 'modal show add-lore-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Add New Lore Entry</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <form class="add-lore-form" id="add-lore-form">
                    <div class="form-group">
                        <label for="lore-title">Title *</label>
                        <input type="text" id="lore-title" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="lore-type">Type *</label>
                            <select id="lore-type" required>
                                <option value="">Select Type</option>
                                <option value="location">Location</option>
                                <option value="faction">Faction</option>
                                <option value="character">Character</option>
                                <option value="item">Item</option>
                                <option value="event">Event</option>
                                <option value="discovery">Discovery</option>
                                <option value="history">History</option>
                                <option value="cosmology">Cosmology</option>
                                <option value="culture">Culture</option>
                                <option value="magic">Magic</option>
                                <option value="creature">Creature</option>
                                <option value="plot">Plot</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="lore-importance">Importance</label>
                            <select id="lore-importance">
                                <option value="1">Low (1)</option>
                                <option value="2">Medium (2)</option>
                                <option value="3" selected>High (3)</option>
                                <option value="4">Very High (4)</option>
                                <option value="5">Critical (5)</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="lore-content">Content *</label>
                        <textarea id="lore-content" required></textarea>
                    </div>
                    <div class="form-group">
                        <label for="lore-tags">Tags</label>
                        <div class="tags-input" id="lore-tags-input">
                            <input type="text" class="tag-input" placeholder="Add tags...">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="lore-discovered-by">Discovered By</label>
                            <input type="text" id="lore-discovered-by" placeholder="Character name">
                        </div>
                        <div class="form-group">
                            <label for="lore-context">Discovery Context</label>
                            <input type="text" id="lore-context" placeholder="How was this discovered?">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="lore-secret">
                            Mark as Secret
                        </label>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="createLoreEntry()">Create Entry</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize tags input
    initializeTagsInput();
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Initialize tags input functionality
function initializeTagsInput() {
    const tagsInput = document.getElementById('lore-tags-input');
    const tagInput = tagsInput.querySelector('.tag-input');
    const tags = [];
    
    function addTag(tag) {
        if (tag && !tags.includes(tag)) {
            tags.push(tag);
            renderTags();
        }
    }
    
    function removeTag(tag) {
        const index = tags.indexOf(tag);
        if (index > -1) {
            tags.splice(index, 1);
            renderTags();
        }
    }
    
    function renderTags() {
        const tagElements = tags.map(tag => `
            <span class="tag-item">
                ${tag}
                <button class="tag-remove" onclick="removeTag('${tag}')">×</button>
            </span>
        `).join('');
        
        tagsInput.innerHTML = tagElements + '<input type="text" class="tag-input" placeholder="Add tags...">';
        
        // Re-attach event listener
        const newTagInput = tagsInput.querySelector('.tag-input');
        newTagInput.addEventListener('keypress', handleTagInput);
        newTagInput.addEventListener('blur', handleTagInput);
        newTagInput.focus();
    }
    
    function handleTagInput(e) {
        if (e.key === 'Enter' || e.type === 'blur') {
            e.preventDefault();
            const tag = e.target.value.trim();
            if (tag) {
                addTag(tag);
                e.target.value = '';
            }
        }
    }
    
    tagInput.addEventListener('keypress', handleTagInput);
    tagInput.addEventListener('blur', handleTagInput);
    
    // Make functions globally available
    window.addTag = addTag;
    window.removeTag = removeTag;
}

// Create lore entry
async function createLoreEntry() {
    const form = document.getElementById('add-lore-form');
    const formData = new FormData(form);
    
    const title = document.getElementById('lore-title').value;
    const loreType = document.getElementById('lore-type').value;
    const content = document.getElementById('lore-content').value;
    const importance = parseInt(document.getElementById('lore-importance').value);
    const discoveredBy = document.getElementById('lore-discovered-by').value;
    const context = document.getElementById('lore-context').value;
    const isSecret = document.getElementById('lore-secret').checked;
    
    // Get tags
    const tags = Array.from(document.querySelectorAll('.tag-item')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
    
    if (!title || !loreType || !content) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/campaign/${currentCampaign}/lore`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                type: loreType,
                content: content,
                tags: tags,
                discovered_by: discoveredBy || null,
                discovery_context: context || null,
                importance_level: importance,
                is_secret: isSecret
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Lore entry created successfully', 'success');
            document.querySelector('.add-lore-modal').remove();
            loadLoreData(); // Refresh the lore list
        } else {
            showNotification(data.error || 'Failed to create lore entry', 'error');
        }
    } catch (error) {
        console.error('Error creating lore entry:', error);
        showNotification('Error creating lore entry', 'error');
    }
}

// Enhanced Lore Search and Filtering
let currentLoreEntries = [];
let filteredLoreEntries = [];

function initializeLoreSearch() {
    const searchInput = document.getElementById('lore-search-input');
    const searchBtn = document.getElementById('lore-search-btn');
    const typeFilter = document.getElementById('lore-type-filter');
    const importanceFilter = document.getElementById('lore-importance-filter');
    const showSecretsCheckbox = document.getElementById('show-secrets');
    
    if (!searchInput) return;
    
    // Search functionality
    searchInput.addEventListener('input', debounce(filterLoreEntries, 300));
    if (searchBtn) searchBtn.addEventListener('click', filterLoreEntries);
    
    // Filter functionality
    if (typeFilter) typeFilter.addEventListener('change', filterLoreEntries);
    if (importanceFilter) importanceFilter.addEventListener('change', filterLoreEntries);
    if (showSecretsCheckbox) showSecretsCheckbox.addEventListener('change', filterLoreEntries);
    
    // Enter key to search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            filterLoreEntries();
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function filterLoreEntries() {
    const searchInput = document.getElementById('lore-search-input');
    const typeFilter = document.getElementById('lore-type-filter');
    const importanceFilter = document.getElementById('lore-importance-filter');
    const showSecretsCheckbox = document.getElementById('show-secrets');
    
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase();
    const typeValue = typeFilter ? typeFilter.value : '';
    const importanceValue = importanceFilter ? importanceFilter.value : '';
    const showSecrets = showSecretsCheckbox ? showSecretsCheckbox.checked : false;
    
    filteredLoreEntries = currentLoreEntries.filter(entry => {
        // Search filter
        const matchesSearch = !searchTerm || 
            entry.title.toLowerCase().includes(searchTerm) ||
            entry.content.toLowerCase().includes(searchTerm) ||
            (entry.tags && entry.tags.some(tag => tag.toLowerCase().includes(searchTerm)));
        
        // Type filter
        const matchesType = !typeValue || entry.type === typeValue;
        
        // Importance filter
        const matchesImportance = !importanceValue || entry.importance_level.toString() === importanceValue;
        
        // Secrets filter
        const matchesSecrets = showSecrets || !entry.is_secret;
        
        return matchesSearch && matchesType && matchesImportance && matchesSecrets;
    });
    
    renderLoreEntries(filteredLoreEntries);
    updateLoreSearchResults();
}

function updateLoreSearchResults() {
    const searchInput = document.getElementById('lore-search-input');
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.trim();
    
    if (searchTerm && filteredLoreEntries.length > 0) {
        // Highlight first matching entry
        const firstMatch = document.querySelector('.lore-entry-card');
        if (firstMatch) {
            firstMatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            firstMatch.style.borderColor = 'var(--accent-color)';
            setTimeout(() => {
                firstMatch.style.borderColor = '';
            }, 2000);
        }
    }
}

// Enhanced Loading States
function showLoadingState(elementId, message = 'Loading...') {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }
}

function hideLoadingState(elementId, fallbackContent = '') {
    const element = document.getElementById(elementId);
    if (element) {
        const loadingSpinner = element.querySelector('.loading-spinner');
        if (loadingSpinner) {
            loadingSpinner.remove();
        }
        if (fallbackContent) {
            element.innerHTML = fallbackContent;
        }
    }
}

// Enhanced Export Button Feedback
function showExportSuccess(button, message = 'Exported successfully!') {
    const originalText = button.innerHTML;
    const originalClass = button.className;
    
    button.innerHTML = `<i class="fas fa-check"></i> ${message}`;
    button.className = originalClass + ' success';
    button.disabled = true;
    
    setTimeout(() => {
        button.innerHTML = originalText;
        button.className = originalClass;
        button.disabled = false;
    }, 2000);
}

// Initialize enhanced features
document.addEventListener('DOMContentLoaded', function() {
    initializeLoreSearch();
    
    // Override loadLoreData with enhanced version
    const originalLoadLoreData = window.loadLoreData;
    window.loadLoreData = async function() {
        showLoadingState('lore-entries', 'Loading lore entries...');
        try {
            const response = await fetch(`/api/campaign/${currentCampaign}/lore`);
            const data = await response.json();
            
            if (data.success) {
                currentLoreEntries = data.entries || [];
                filteredLoreEntries = [...currentLoreEntries];
                updateLoreSummary(data.summary);
                renderLoreEntries(filteredLoreEntries);
                hideLoadingState('lore-entries');
            } else {
                hideLoadingState('lore-entries', '<p class="no-data">Error loading lore entries</p>');
            }
        } catch (error) {
            console.error('Error loading lore data:', error);
            hideLoadingState('lore-entries', '<p class="no-data">Error loading lore entries</p>');
        }
    };
}); 
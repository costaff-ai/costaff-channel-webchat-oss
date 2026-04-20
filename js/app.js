document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const btnSend = document.getElementById('btn-send');
    const btnReset = document.getElementById('btn-reset');
    const userDisplayId = document.getElementById('user-display-id');
    const systemStatus = document.getElementById('system-status');

    // Configuration: Use URL params for ID, or generate a random one
    const urlParams = new URLSearchParams(window.location.search);
    let userId = urlParams.get('key') || localStorage.getItem('costaff_user_id');
    
    if (!userId) {
        userId = 'web_' + Math.random().toString(16).slice(2, 18);
        localStorage.setItem('costaff_user_id', userId);
    }
    const sessionId = `web_${userId}`;
    userDisplayId.textContent = `ID: ${userId.slice(0, 8)}...`;

    // Add a message to the UI
    function addMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        
        // Convert Telegram-style HTML tags to Web HTML
        // Note: The agent already sends <b>, <i>, <code>, <pre>
        const contentDiv = document.createElement('div');
        contentDiv.className = 'content';
        contentDiv.innerHTML = content.replace(/\n/g, '<br>');
        
        msgDiv.appendChild(contentDiv);
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Send message to CoStaff Agent
    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        addMessage('user', text);
        userInput.value = '';
        userInput.style.height = 'auto';

        try {
            systemStatus.textContent = 'Agent is thinking...';
            // In Docker environment, we use the local proxy configured in Nginx
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_name: 'costaff_agent',
                    user_id: userId,
                    session_id: sessionId,
                    message: `(Context ID: ${userId}) ${text}`
                })
            });

            if (!response.ok) throw new Error('API request failed');
            
            const data = await response.json();
            const reply = data.response || 'No response from agent.';
            addMessage('agent', reply);
        } catch (error) {
            console.error('Error:', error);
            addMessage('system', '⚠️ Failed to connect to AI team. Check if costaff-agent is running.');
        } finally {
            systemStatus.textContent = 'Connected to CoStaff Agent';
        }
    }

    // Reset Chat
    btnReset.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to reset the current session?')) return;
        
        chatMessages.innerHTML = '';
        addMessage('system', 'Resetting session...');
        
        try {
            await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
            // Initial greeting
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_name: 'costaff_agent',
                    user_id: userId,
                    session_id: sessionId,
                    message: `(Context ID: ${userId}). Please check my identity and greet me.`
                })
            });
            const data = await response.json();
            addMessage('agent', data.response);
        } catch (e) {
            addMessage('system', 'Reset completed locally.');
        }
    });

    // Event Listeners
    btnSend.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Initial Greeting if empty
    if (chatMessages.children.length <= 1) {
        addMessage('system', 'AI Team ready. Type your request below.');
    }
});

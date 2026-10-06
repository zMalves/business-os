// State Management
let currentTab = 'dashboard';
let activeTaskFilter = 'PENDING';
let allTasks = [];
let allMemories = [];
let activeConversationId = localStorage.getItem('active_conversation_id') || null;
let currentEcommerceDays = 1;

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');
const tabHeading = document.getElementById('tab-heading');
const tabSubheading = document.getElementById('tab-subheading');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnRefresh = document.getElementById('btn-refresh');
const tasksGrid = document.getElementById('tasks-grid');
const taskCounter = document.getElementById('task-counter');
const memoriesGrid = document.getElementById('memories-grid');

const tabTitles = {
  dashboard: { title: 'Visão Geral Executiva', sub: 'Centro de comando dos seus negócios, tráfego, vendas e agenda.' },
  'meta-business': { title: 'Meta Ads & Growth Hub', sub: 'Gerenciamento de contas de anúncios, tráfego pago e métricas consolidadas.' },
  ecommerce: { title: 'Operações & Lojas', sub: 'Faturamento consolidado, expedição e monitoramento do Mercado Livre.' },
  tasks: { title: 'Tarefas & Agenda', sub: 'Acompanhe compromissos, Google Calendar, Meet e pendências.' },
  skills: { title: 'Dynamic Skills Engine', sub: 'Catálogo de habilidades compostas e rotinas operacionais autônomas.' },
  webhooks: { title: 'Webhooks & Hub de Eventos', sub: 'Gerenciamento de eventos externos e integrações de automação.' },
  crons: { title: 'Rotinas & Crons Automáticos', sub: 'Tarefas agendadas e briefings automáticos enviados no seu WhatsApp.' },
  settings: { title: 'Configurações & Governança', sub: 'Custos e usos de IA, memória corporativa, terminal de logs e preferências.' },
  system: { title: 'Configurações & Governança', sub: 'Custos e usos de IA, memória corporativa, terminal de logs e preferências.' },
};

// Authentication Management
async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login';
      return null;
    }
    const data = await res.json();
    if (!data.success || !data.user) {
      window.location.href = '/login';
      return null;
    }
    if (data.user) {
      const emailEl = document.getElementById('current-user-email');
      const nameEl = document.getElementById('current-user-name');
      if (emailEl) emailEl.textContent = data.user.email;
      if (nameEl) nameEl.textContent = data.user.name || data.user.email.split('@')[0];
    }
    return data.user;
  } catch (err) {
    console.warn('Falha na validação de sessão:', err);
    return null;
  }
}

async function handleLogout(e) {
  if (e && e.preventDefault) e.preventDefault();
  try {
    localStorage.removeItem('secretary_token');
    sessionStorage.clear();
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    localStorage.removeItem('secretary_token');
    document.cookie = "secretary_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.replace('/login');
  }
}
window.handleLogout = handleLogout;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  const btnLogoutSidebar = document.getElementById('btn-logout-sidebar');
  if (btnLogoutSidebar) {
    btnLogoutSidebar.addEventListener('click', handleLogout);
  }
  const btnLogoutTop = document.getElementById('btn-logout-top');
  if (btnLogoutTop) {
    btnLogoutTop.addEventListener('click', handleLogout);
  }

  checkAuthSession();
  setupPreferences();
  setupNavigation();
  setupChat();
  setupTasks();
  setupCrons();
  setupMemories();
  setupWhatsApp();
  setupGoogle();
  setupAiUsage();
  setupMetaBusiness();
  setupLogs();
  setupContacts();
  fetchHealth();
  fetchDashboardOverview();
  fetchEcommerceData();
  fetchTasks();
  fetchCronJobs();
  fetchMemories();
  fetchContacts();
  fetchWhatsAppStatus();
  fetchGoogleStatus();
  fetchAiUsageStats();
  fetchMetaBusinessData();
  fetchLogs();
  
  btnRefresh.addEventListener('click', () => {
    fetchHealth();
    fetchDashboardOverview();
    fetchEcommerceData();
    fetchTasks();
    fetchCronJobs();
    fetchMemories();
    fetchContacts();
    fetchWhatsAppStatus();
    fetchGoogleStatus();
    fetchAiUsageStats();
    fetchMetaBusinessData();
    fetchLogs();
  });
});

function setupPreferences() {
  const toggleBadges = document.getElementById('toggle-tool-badges');
  // Padrão: FALSE (Desativado)
  const savedState = localStorage.getItem('show_tool_badges');
  const showBadges = savedState === 'true'; // false se for null ou 'false'

  if (toggleBadges) {
    toggleBadges.checked = showBadges;
    toggleBadges.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('show_tool_badges', enabled ? 'true' : 'false');
      applyBadgeVisibility(enabled);
    });
  }

  applyBadgeVisibility(showBadges);
}

function applyBadgeVisibility(show) {
  if (show) {
    document.body.classList.remove('hide-tool-badges');
  } else {
    document.body.classList.add('hide-tool-badges');
  }
}

// Navigation Handling
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  let targetScrollSection = null;
  // Aliases for legacy section references
  if (['ai-hub', 'contacts', 'memories', 'logs', 'system', 'webhooks', 'settings'].includes(tab)) {
    if (tab === 'contacts') targetScrollSection = 'settings-contacts';
    else if (tab === 'ai-hub') targetScrollSection = 'settings-costs';
    else if (tab === 'memories') targetScrollSection = 'settings-memories';
    else if (tab === 'logs') targetScrollSection = 'settings-logs';
    else if (tab === 'webhooks') targetScrollSection = 'settings-webhooks';
    else if (tab === 'system') targetScrollSection = 'settings-system';
    tab = 'settings';
  }

  currentTab = tab;
  navItems.forEach(nav => {
    nav.classList.toggle('active', nav.dataset.tab === tab);
  });
  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });

  if (tabTitles[tab]) {
    tabHeading.textContent = tabTitles[tab].title;
    tabSubheading.textContent = tabTitles[tab].sub;
  }

  if (tab === 'dashboard') fetchDashboardOverview();
  if (tab === 'ecommerce') fetchEcommerceData();
  if (tab === 'skills') fetchSkillsCatalog();
  if (tab === 'meta-business') fetchMetaBusinessData();
  if (tab === 'tasks') {
    activeTaskFilter = 'PENDING';
    document.querySelectorAll('#tab-tasks .filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === 'PENDING');
    });
    fetchTasks();
  }
  if (tab === 'crons') fetchCronJobs();
  if (tab === 'webhooks') {
    // webhooks tab data
  }
  if (tab === 'settings') {
    fetchAiUsageStats();
    startUsagePolling();
    fetchMemories();
    fetchLogs();
    fetchHealth();

    if (targetScrollSection) {
      setTimeout(() => {
        const el = document.getElementById(targetScrollSection);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  } else {
    stopUsagePolling();
  }
}
window.switchTab = switchTab;

// Chat Functionality
function setupChat() {
  const btnNewChat = document.getElementById('btn-new-chat');
  if (btnNewChat && chatMessages) {
    btnNewChat.addEventListener('click', () => {
      activeConversationId = null;
      localStorage.removeItem('active_conversation_id');
      chatMessages.innerHTML = `
        <div class="message-bubble message-assistant">
          <div class="avatar"><i class="fa-solid fa-robot"></i></div>
          <div class="bubble-body">
            <div class="bubble-header">
              <strong>Victoria</strong>
              <small>Agora</small>
            </div>
            <div class="bubble-content">
              <p>Olá! Sou a <strong>Victoria</strong>, sua Assistente Executiva do <strong>Business OS</strong>.</p>
              <p>Como posso ajudar com a visão geral do seu negócio, operações, tráfego ou tomada de decisão estratégica hoje?</p>
            </div>
          </div>
        </div>
      `;
    });
  }

  if (chatInput && chatForm) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
      }
    });

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      appendUserMessage(text);
      chatInput.value = '';
      chatInput.style.height = 'auto';

      const loadingId = appendLoadingMessage();

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeConversationId || undefined,
            message: text,
            channel: 'web'
          })
        });

        const data = await res.json();
        removeLoadingMessage(loadingId);

        if (data.success) {
          if (data.conversationId) {
            activeConversationId = data.conversationId;
            localStorage.setItem('active_conversation_id', activeConversationId);
          }
          appendAssistantMessage(data.response, data.toolCalls);
          fetchTasks(); // Atualiza a lista caso tenha criado tarefa
          fetchMemories(); // Atualiza a lista caso tenha criado memória
        } else {
          appendAssistantMessage(`❌ Erro: ${data.message || 'Falha ao processar mensagem.'}`);
        }
      } catch (err) {
        removeLoadingMessage(loadingId);
        appendAssistantMessage(`⚠️ Falha de comunicação com o servidor: ${err.message}`);
      }
    });
  }
}

function sendQuickPrompt(promptText) {
  if (chatInput && chatForm) {
    chatInput.value = promptText;
    chatForm.dispatchEvent(new Event('submit'));
  } else {
    sendCopilotPrompt(promptText);
  }
}

function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message-bubble message-user';
  div.innerHTML = `
    <div class="avatar"><i class="fa-solid fa-user"></i></div>
    <div class="bubble-body">
      <div class="bubble-header">
        <small>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        <strong>Você</strong>
      </div>
      <div class="bubble-content">
        <p>${escapeHtml(text)}</p>
      </div>
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendAssistantMessage(text, toolCalls = []) {
  const div = document.createElement('div');
  div.className = 'message-bubble message-assistant';

  let toolCallsHtml = '';
  if (toolCalls && toolCalls.length > 0) {
    toolCallsHtml = toolCalls.map(tc => `
      <div class="tool-call-badge">
        <i class="fa-solid fa-gear fa-spin"></i>
        <span>Executou Ferramenta: <strong>${tc.name}</strong></span>
      </div>
    `).join('');
  }

  // Formatar quebras de linha e negrito básico
  const formatted = escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  div.innerHTML = `
    <div class="avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="bubble-body">
      <div class="bubble-header">
        <strong>Victoria</strong>
        <small>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
      </div>
      <div class="bubble-content">
        ${toolCallsHtml}
        <p>${formatted}</p>
      </div>
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendLoadingMessage() {
  const id = 'msg-loading-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'message-bubble message-assistant';
  div.innerHTML = `
    <div class="avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="bubble-body">
      <div class="bubble-header">
        <strong>Victoria</strong>
        <small>digitando...</small>
      </div>
      <div class="bubble-content" style="padding: 12px 18px;">
        <div class="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return id;
}

function removeLoadingMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// Tasks Management
function setupTasks() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTaskFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  const btnNewTask = document.getElementById('btn-new-task');
  if (btnNewTask) {
    btnNewTask.addEventListener('click', () => {
      document.getElementById('task-id').value = '';
      document.getElementById('form-new-task').reset();
      const modalTitle = document.getElementById('modal-task-title');
      const btnSave = document.getElementById('btn-save-task');
      if (modalTitle) modalTitle.textContent = 'Nova Tarefa no Google Tasks';
      if (btnSave) btnSave.innerHTML = '<i class="fa-brands fa-google"></i> Salvar no Google Tasks';
      openModal('modal-task');
    });
  }

  const formNewTask = document.getElementById('form-new-task');
  if (formNewTask) {
    formNewTask.addEventListener('submit', async (e) => {
      e.preventDefault();
      const taskId = document.getElementById('task-id').value.trim();
      const title = document.getElementById('task-title').value.trim();
      const description = document.getElementById('task-desc').value.trim();
      const dueDate = document.getElementById('task-due').value;
      const priority = document.getElementById('task-priority').value;

      const isEdit = !!taskId;
      const url = isEdit ? `/api/tasks/${taskId}` : '/api/tasks';
      const method = isEdit ? 'PATCH' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description: description || '',
            dueDate: dueDate ? new Date(`${dueDate}T12:00:00.000Z`).toISOString() : null,
            priority
          })
        });
        if (res.ok) {
          closeModal('modal-task');
          formNewTask.reset();
          document.getElementById('task-id').value = '';
          fetchTasks();
        } else {
          const errData = await res.json().catch(() => ({}));
          alert('Erro ao salvar tarefa: ' + (errData.message || errData.error || 'Erro desconhecido'));
        }
      } catch (err) {
        alert('Erro ao salvar tarefa: ' + err.message);
      }
    });
  }
}

function openEditTaskModal(taskId) {
  const task = allTasks.find(t => t.id === taskId || (t.googleTaskId && t.googleTaskId === taskId));
  if (!task) return;

  const idInput = document.getElementById('task-id');
  const titleInput = document.getElementById('task-title');
  const descInput = document.getElementById('task-desc');
  const prioritySelect = document.getElementById('task-priority');
  const dueInput = document.getElementById('task-due');
  const modalTitle = document.getElementById('modal-task-title');
  const btnSave = document.getElementById('btn-save-task');

  if (idInput) idInput.value = task.id || task.googleTaskId;
  if (titleInput) titleInput.value = task.title || '';
  if (descInput) descInput.value = task.description || '';
  if (prioritySelect) prioritySelect.value = task.priority || 'MEDIUM';

  if (dueInput) {
    if (task.dueDate) {
      const d = new Date(task.dueDate);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dueInput.value = `${yyyy}-${mm}-${dd}`;
    } else {
      dueInput.value = '';
    }
  }

  if (modalTitle) modalTitle.textContent = 'Editar Tarefa no Google Tasks';
  if (btnSave) btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Alterações';

  openModal('modal-task');
}
window.openEditTaskModal = openEditTaskModal;

async function fetchTasks() {
  try {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    if (data.success) {
      allTasks = data.tasks;
      const pendingCount = allTasks.filter(t => t.status === 'PENDING').length;
      taskCounter.textContent = pendingCount;
      renderTasks();
    }
  } catch (err) {
    console.error('Erro ao buscar tarefas:', err);
  }
}

function renderTasks() {
  let filtered = allTasks;
  if (activeTaskFilter !== 'ALL') {
    filtered = allTasks.filter(t => t.status === activeTaskFilter);
  }

  if (filtered.length === 0) {
    tasksGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 24px; color: var(--text-dim); background: #FFFFFF; border-radius: var(--radius-sm); border: 1px dashed var(--color-sand-border);">
        <i class="fa-solid fa-clipboard-check" style="font-size: 2.2rem; margin-bottom: 12px; color: var(--color-mint); opacity: 0.6;"></i>
        <p style="font-size: 0.95rem; font-weight: 600; color: var(--color-cyprus); margin-bottom: 4px;">Nenhuma tarefa encontrada neste filtro</p>
        <small style="color: var(--color-muted);">Suas pendências do Google Tasks aparecerão listadas aqui.</small>
      </div>
    `;
    return;
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  tasksGrid.innerHTML = `
    <div class="tasks-list-container">
      ${filtered.map(task => {
        let dateStr = 'Sem prazo';
        let isOverdue = false;
        let isToday = false;

        if (task.dueDate) {
          const d = new Date(task.dueDate);
          const taskDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          
          if (taskDateStr === todayStr) {
            isToday = true;
            dateStr = 'Hoje ' + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
          } else {
            if (d < now && task.status !== 'COMPLETED') {
              isOverdue = true;
            }
            dateStr = d.toLocaleDateString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            });
          }
        }

        const isCompleted = task.status === 'COMPLETED';

        return `
          <div class="task-list-row ${isCompleted ? 'completed' : ''}">
            <button class="task-check-btn ${isCompleted ? 'checked' : ''}" onclick="toggleTaskStatus('${task.id}', '${task.status}')" title="${isCompleted ? 'Reabrir tarefa no Google Tasks' : 'Concluir tarefa no Google Tasks'}">
              <i class="${isCompleted ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i>
            </button>

            <div class="task-list-body" onclick="openEditTaskModal('${task.id}')" title="Clique para editar tarefa no Google Tasks">
              <div class="task-list-title-row">
                <span class="task-list-title ${isCompleted ? 'completed' : ''}">${escapeHtml(task.title)}</span>
                <span class="priority-badge priority-${task.priority || 'MEDIUM'}">${task.priority || 'NORMAL'}</span>
              </div>
              ${task.description ? `<p class="task-list-notes">${escapeHtml(task.description)}</p>` : ''}
              <div class="task-list-meta">
                <span class="task-badge-google">
                  <i class="fa-brands fa-google"></i> Google Tasks
                </span>
                <span class="task-due-badge ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''}">
                  <i class="fa-regular fa-calendar"></i> ${escapeHtml(dateStr)}
                </span>
                ${task.category && task.category !== 'Google Tasks' ? `<span class="category-badge">${escapeHtml(task.category)}</span>` : ''}
              </div>
            </div>

            <div class="task-list-actions">
              <button class="btn-action-icon" title="Editar Tarefa" onclick="event.stopPropagation(); openEditTaskModal('${task.id}')">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn-action-icon danger" title="Excluir do Google Tasks" onclick="event.stopPropagation(); deleteTask('${task.id}')">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function toggleTaskStatus(id, currentStatus) {
  const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
  try {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    fetchTasks();
  } catch (err) {
    alert('Erro ao atualizar status da tarefa');
  }
}

async function completeTask(id) {
  return toggleTaskStatus(id, 'PENDING');
}

async function deleteTask(id) {
  if (!confirm('Deseja realmente excluir esta tarefa do Google Tasks?')) return;
  try {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
  } catch (err) {
    alert('Erro ao excluir tarefa');
  }
}

// ==========================================================================
// CRONS & AUTOMATIONS MANAGEMENT
// ==========================================================================
let allCronJobs = [];

function setupCrons() {
  const form = document.getElementById('form-new-cron');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('cron-title').value.trim();
    const actionType = document.getElementById('cron-type').value;
    const preset = document.getElementById('cron-preset').value;
    const customExpr = document.getElementById('cron-custom-expr').value.trim();
    const prompt = document.getElementById('cron-prompt').value.trim();

    const cronExpr = preset === 'custom' ? customExpr : preset;

    if (!cronExpr) {
      alert('Por favor, informe a expressão cron.');
      return;
    }

    try {
      const res = await fetch('/api/cron/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          cronExpr,
          actionType,
          prompt: prompt || undefined,
          targetChannel: 'WHATSAPP'
        })
      });
      const data = await res.json();
      if (data.success) {
        closeModal('modal-cron');
        form.reset();
        document.getElementById('cron-custom-expr-group').style.display = 'none';
        document.getElementById('cron-prompt-group').style.display = 'none';
        fetchCronJobs();
      } else {
        alert('Erro ao salvar rotina: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (err) {
      alert('Erro ao salvar rotina: ' + err.message);
    }
  });
}

function handleCronPresetChange(val) {
  const customGroup = document.getElementById('cron-custom-expr-group');
  if (customGroup) {
    customGroup.style.display = val === 'custom' ? 'block' : 'none';
  }
}

function handleCronTypeChange(val) {
  const promptGroup = document.getElementById('cron-prompt-group');
  if (promptGroup) {
    promptGroup.style.display = val === 'CUSTOM_MESSAGE' ? 'block' : 'none';
  }
}

async function fetchCronJobs() {
  const grid = document.getElementById('crons-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/cron/jobs');
    const data = await res.json();
    if (data.success) {
      allCronJobs = data.jobs || [];
      renderCronJobs();
    }
  } catch (err) {
    console.error('Erro ao buscar rotinas cron:', err);
  }
}

function renderCronJobs() {
  const grid = document.getElementById('crons-grid');
  if (!grid) return;

  if (!allCronJobs || allCronJobs.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 32px; color: var(--text-dim); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-clock-rotate-left" style="font-size: 1.8rem; margin-bottom: 10px; color: #818CF8;"></i>
        <p>Nenhuma rotina automática cadastrada ainda.</p>
        <small style="color: var(--text-muted);">Clique em "+ Nova Rotina" ou peça à Victoria pelo chat/WhatsApp!</small>
      </div>
    `;
    return;
  }

  grid.innerHTML = allCronJobs.map(job => {
    const isActive = job.active;
    const typeLabel = job.actionType === 'DAILY_BRIEFING' ? 'Briefing Matinal' : 'Mensagem Personalizada';
    const typeIcon = job.actionType === 'DAILY_BRIEFING' ? 'fa-solid fa-newspaper' : 'fa-solid fa-comment-dots';
    
    let nextRunStr = 'Calculando...';
    if (job.nextRun) {
      nextRunStr = new Date(job.nextRun).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short'
      });
    }

    return `
      <div class="cron-card">
        <div class="cron-card-header">
          <div>
            <div class="cron-card-title">
              <i class="${typeIcon}" style="color: #818CF8;"></i>
              <span>${escapeHtml(job.title)}</span>
            </div>
            <small style="color: var(--text-dim); font-size: 0.78rem;">${typeLabel}</small>
          </div>
          <span class="cron-badge ${isActive ? 'active' : 'paused'}">
            <i class="fa-solid fa-circle" style="font-size: 0.5rem;"></i>
            ${isActive ? 'Ativo' : 'Pausado'}
          </span>
        </div>

        <div class="cron-expr-box">
          <span><i class="fa-regular fa-clock"></i> ${escapeHtml(job.cronExpr)}</span>
          <span style="font-size: 0.72rem; color: #94A3B8;">America/Sao_Paulo</span>
        </div>

        <div class="cron-timing-info">
          <i class="fa-solid fa-forward-step" style="color: #10B981;"></i>
          <span>Próxima Execução: <strong>${nextRunStr}</strong></span>
        </div>

        ${job.prompt ? `<div style="font-size: 0.8rem; color: var(--text-muted); background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 6px;"><em>"${escapeHtml(job.prompt)}"</em></div>` : ''}

        <div class="cron-card-footer">
          <button class="btn btn-secondary btn-sm" onclick="runCronNow('${job.id}')" title="Testar envio no WhatsApp agora">
            <i class="fa-solid fa-play" style="color: #10B981;"></i> Executar Agora
          </button>
          <div class="cron-actions">
            <button class="btn btn-secondary btn-sm" onclick="toggleCron('${job.id}', ${!isActive})" title="${isActive ? 'Pausar rotina' : 'Ativar rotina'}">
              <i class="fa-solid ${isActive ? 'fa-pause' : 'fa-play'}"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteCron('${job.id}')" title="Excluir rotina">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function runCronNow(id) {
  if (!confirm('Deseja disparar esta rotina agora para teste no WhatsApp?')) return;
  try {
    const res = await fetch(`/api/cron/jobs/${id}/run`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('🚀 Rotina executada com sucesso e enviada ao WhatsApp!');
      fetchCronJobs();
    } else {
      alert('Erro ao executar: ' + (data.error || 'Erro desconhecido'));
    }
  } catch (err) {
    alert('Erro ao executar: ' + err.message);
  }
}

async function toggleCron(id, active) {
  try {
    const res = await fetch(`/api/cron/jobs/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });
    const data = await res.json();
    if (data.success) {
      fetchCronJobs();
    }
  } catch (err) {
    alert('Erro ao alterar status: ' + err.message);
  }
}

async function deleteCron(id) {
  if (!confirm('Deseja realmente excluir esta rotina automática?')) return;
  try {
    const res = await fetch(`/api/cron/jobs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchCronJobs();
    }
  } catch (err) {
    alert('Erro ao excluir rotina: ' + err.message);
  }
}

// Memories Management
function setupMemories() {
  document.getElementById('btn-new-memory').addEventListener('click', () => {
    openModal('modal-memory');
  });

  document.getElementById('form-new-memory').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = document.getElementById('mem-key').value.trim();
    const value = document.getElementById('mem-value').value.trim();
    const category = document.getElementById('mem-category').value.trim();

    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, category: category || undefined })
      });
      if (res.ok) {
        closeModal('modal-memory');
        document.getElementById('form-new-memory').reset();
        fetchMemories();
      }
    } catch (err) {
      alert('Erro ao salvar memória: ' + err.message);
    }
  });
}

async function fetchMemories() {
  try {
    const res = await fetch('/api/memories');
    const data = await res.json();
    if (data.success) {
      allMemories = data.memories;
      renderMemories();
    }
  } catch (err) {
    console.error('Erro ao buscar memórias:', err);
  }
}

function renderMemories() {
  if (allMemories.length === 0) {
    memoriesGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);">
        <i class="fa-solid fa-brain" style="font-size: 2rem; margin-bottom: 12px;"></i>
        <p>Nenhum fato memorizado ainda. Peça para a Victoria memorizar algo no Business OS ou adicione acima.</p>
      </div>
    `;
    return;
  }

  memoriesGrid.innerHTML = allMemories.map(mem => `
    <div class="memory-card">
      <div class="memory-card-header">
        <span class="memory-key">
          <i class="fa-solid fa-key"></i>
          <span>${escapeHtml(mem.key)}</span>
        </span>
        ${mem.category ? `<span class="category-badge">${escapeHtml(mem.category)}</span>` : ''}
      </div>
      <p class="task-desc" style="white-space: pre-wrap; word-break: break-word; line-height: 1.5;">${escapeHtml(mem.value)}</p>
      <div class="task-card-footer">
        <small><i class="fa-regular fa-clock"></i> ${new Date(mem.updatedAt).toLocaleDateString('pt-BR')}</small>
        <button class="btn-icon trash" title="Excluir Fato" onclick="deleteMemory('${mem.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

async function deleteMemory(id) {
  if (!confirm('Deseja esquecer este fato da memória?')) return;
  try {
    await fetch(`/api/memories/${id}`, { method: 'DELETE' });
    fetchMemories();
  } catch (err) {
    alert('Erro ao excluir memória');
  }
}

// System Health
async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.status === 'ok') {
      const branchName = data.branch || 'sub';
      const commitHash = data.commitHash || (data.commit ? data.commit.split(' ')[0] : '');
      const commitText = data.commit || commitHash || '';

      const statusDot = document.getElementById('status-dot');
      if (statusDot) statusDot.className = 'dot online';
      
      const sysModel = document.getElementById('sys-model');
      if (sysModel) sysModel.textContent = (data.aiProvider || 'deepseek').toUpperCase() + ' V4';
      
      const sysDb = document.getElementById('sys-db');
      if (sysDb) sysDb.textContent = data.database === 'connected' ? 'Conectado (MariaDB)' : 'Erro no Banco';
      
      const sysUptime = document.getElementById('sys-uptime');
      if (sysUptime) sysUptime.textContent = `Uptime: ${Math.floor(data.uptime)}s`;

      const sysBranchEl = document.getElementById('sys-branch');
      const sysCommitBadgeEl = document.getElementById('sys-commit-badge');
      if (sysBranchEl) {
        if (sysCommitBadgeEl) {
          const branchSpan = sysBranchEl.querySelector('span:first-child');
          if (branchSpan) branchSpan.textContent = branchName;
          else sysBranchEl.firstChild.textContent = branchName;
          sysCommitBadgeEl.textContent = commitHash ? `#${commitHash}` : '';
        } else {
          sysBranchEl.textContent = branchName;
        }
      }

      const sysCommitEl = document.getElementById('sys-commit');
      if (sysCommitEl) {
        const cleanMsg = data.commit ? data.commit.replace(/^[a-f0-9]+\s*-\s*/i, '') : 'Sincronizado';
        sysCommitEl.textContent = cleanMsg;
        sysCommitEl.title = commitText ? `Commit completo: ${commitText}` : 'Git Sincronizado';
      }

      const statusEnvEl = document.getElementById('status-env');
      if (statusEnvEl) {
        statusEnvEl.textContent = commitHash ? `${branchName} • #${commitHash}` : `Ambiente: ${branchName}`;
        statusEnvEl.title = commitText;
      }
    }
  } catch (err) {
    const statusDot = document.getElementById('status-dot');
    if (statusDot) statusDot.className = 'dot';
  }
}

// WhatsApp Integration
let waPollInterval = null;

function setupWhatsApp() {
  const btnHeader = document.getElementById('btn-whatsapp-header');
  if (btnHeader) {
    btnHeader.addEventListener('click', () => {
      openModal('modal-whatsapp');
      refreshWhatsAppQR();
      startWaPolling();
    });
  }
}

async function fetchWhatsAppStatus() {
  try {
    const res = await fetch('/api/whatsapp/status');
    const data = await res.json();
    const state = data?.data?.state || 'close';

    const headerStatus = document.getElementById('wa-header-status');
    const headerBtn = document.getElementById('btn-whatsapp-header');
    const badge = document.getElementById('wa-status-badge');
    const badgeText = document.getElementById('wa-status-text');
    const qrImg = document.getElementById('wa-qr-img');
    const connectedBox = document.getElementById('wa-connected-box');
    const btnDisconnect = document.getElementById('btn-wa-disconnect');
    const btnRefreshQR = document.getElementById('btn-wa-refresh');
    const instructions = document.getElementById('wa-instructions');

    if (state === 'open') {
      if (headerStatus) headerStatus.textContent = 'WhatsApp Conectado';
      if (headerBtn) {
        headerBtn.classList.add('connected');
        headerBtn.classList.remove('connecting');
        headerBtn.title = 'WhatsApp Conectado e Operacional';
      }
      if (badge) badge.className = 'wa-status-badge status-open';
      if (badgeText) badgeText.textContent = 'Conectado e Operacional';
      if (qrImg) qrImg.style.display = 'none';
      if (connectedBox) connectedBox.style.display = 'flex';
      if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
      if (btnRefreshQR) btnRefreshQR.style.display = 'none';
      if (instructions) instructions.style.display = 'none';
    } else if (state === 'connecting') {
      if (headerStatus) headerStatus.textContent = 'Conectando...';
      if (headerBtn) {
        headerBtn.classList.remove('connected');
        headerBtn.classList.add('connecting');
        headerBtn.title = 'WhatsApp: Aguardando Leitura do QR Code';
      }
      if (badge) badge.className = 'wa-status-badge status-connecting';
      if (badgeText) badgeText.textContent = 'Aguardando Leitura do QR Code';
      if (connectedBox) connectedBox.style.display = 'none';
      if (btnDisconnect) btnDisconnect.style.display = 'none';
      if (btnRefreshQR) btnRefreshQR.style.display = 'inline-flex';
      if (instructions) instructions.style.display = 'block';
    } else {
      if (headerStatus) headerStatus.textContent = 'WhatsApp';
      if (headerBtn) {
        headerBtn.classList.remove('connected', 'connecting');
        headerBtn.title = 'WhatsApp Desconectado - Clique para Parear';
      }
      if (badge) badge.className = 'wa-status-badge status-close';
      if (badgeText) badgeText.textContent = 'Desconectado';
      if (connectedBox) connectedBox.style.display = 'none';
      if (btnDisconnect) btnDisconnect.style.display = 'none';
      if (btnRefreshQR) btnRefreshQR.style.display = 'inline-flex';
      if (instructions) instructions.style.display = 'block';
    }
  } catch (err) {
    console.error('Erro ao verificar status do WhatsApp:', err);
  }
}

async function refreshWhatsAppQR() {
  const loading = document.getElementById('wa-qr-loading');
  const qrImg = document.getElementById('wa-qr-img');
  const connectedBox = document.getElementById('wa-connected-box');

  if (loading) loading.style.display = 'flex';
  if (qrImg) qrImg.style.display = 'none';
  if (connectedBox) connectedBox.style.display = 'none';

  try {
    const res = await fetch('/api/whatsapp/connect');
    const data = await res.json();

    if (loading) loading.style.display = 'none';

    if (data?.data?.base64) {
      if (qrImg) {
        qrImg.src = data.data.base64;
        qrImg.style.display = 'block';
      }
      fetchWhatsAppStatus();
    } else if (data?.data?.instance?.state === 'open' || data?.data?.state === 'open') {
      fetchWhatsAppStatus();
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    console.error('Erro ao gerar QR Code WhatsApp:', err);
  }
}

async function setupWhatsAppWebhook() {
  try {
    const res = await fetch('/api/whatsapp/set-webhook', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('✅ Webhook configurado com sucesso para receber mensagens!');
    } else {
      alert('Erro ao configurar webhook: ' + (data.error || 'Falha'));
    }
  } catch (err) {
    alert('Erro ao configurar webhook: ' + err.message);
  }
}

async function disconnectWhatsApp() {
  if (!confirm('Deseja realmente desconectar o WhatsApp da Victoria?')) return;
  try {
    await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    alert('Instância desconectada.');
    fetchWhatsAppStatus();
  } catch (err) {
    alert('Erro ao desconectar: ' + err.message);
  }
}

function startWaPolling() {
  if (waPollInterval) clearInterval(waPollInterval);
  waPollInterval = setInterval(fetchWhatsAppStatus, 5000);
}

// Google Workspace Integration
function setupGoogle() {
  const btnHeader = document.getElementById('btn-google-header');
  if (btnHeader) {
    btnHeader.addEventListener('click', () => {
      openModal('modal-google');
      fetchGoogleStatus();
    });
  }

  // Verificar se acabou de retornar de autenticação do Google
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('google') === 'connected') {
    const email = urlParams.get('email') || '';
    alert('🎉 Conta Google conectada com sucesso!\n' + (email ? `Email: ${email}\n` : '') + 'A Victoria já pode gerenciar sua agenda, Google Meet e contatos.');
    window.history.replaceState({}, document.title, window.location.pathname);
    fetchGoogleStatus();
  } else if (urlParams.get('google') === 'error' || urlParams.get('google') === 'failed') {
    const err = urlParams.get('error') || 'Erro desconhecido';
    alert('❌ Falha ao conectar conta Google: ' + err);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function fetchGoogleStatus() {
  try {
    const res = await fetch('/api/auth/google/status');
    const data = await res.json();
    const isConnected = data?.data?.connected;
    const email = data?.data?.email || '';

    const headerStatus = document.getElementById('google-header-status');
    const headerBtn = document.getElementById('btn-google-header');
    const badge = document.getElementById('google-status-badge');
    const badgeText = document.getElementById('google-status-text');
    const disconnectedBox = document.getElementById('google-disconnected-box');
    const connectedBox = document.getElementById('google-connected-box');
    const connectedEmail = document.getElementById('google-connected-email');

    if (isConnected) {
      if (headerBtn) {
        headerBtn.classList.add('connected');
        headerBtn.title = `Google Conectado (${email}) - Clique para detalhes`;
      }
      if (headerStatus) headerStatus.textContent = 'Google Conectado';
      if (badge) badge.className = 'wa-status-badge status-open';
      if (badgeText) badgeText.textContent = 'Google Conectado';
      if (disconnectedBox) disconnectedBox.style.display = 'none';
      if (connectedBox) connectedBox.style.display = 'block';
      if (connectedEmail) connectedEmail.textContent = email;
    } else {
      if (headerBtn) {
        headerBtn.classList.remove('connected');
        headerBtn.title = 'Google Workspace (Calendar, Meet, Contatos) - Desconectado';
      }
      if (headerStatus) headerStatus.textContent = 'Google';
      if (badge) badge.className = 'wa-status-badge status-close';
      if (badgeText) badgeText.textContent = 'Desconectado';
      if (disconnectedBox) disconnectedBox.style.display = 'block';
      if (connectedBox) connectedBox.style.display = 'none';
    }
  } catch (err) {
    console.error('Erro ao verificar status do Google:', err);
  }
}

async function disconnectGoogle() {
  if (!confirm('Deseja realmente desconectar sua conta Google da Victoria?')) return;
  try {
    const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('Conta Google desconectada.');
      fetchGoogleStatus();
    } else {
      alert('Erro ao desconectar: ' + (data.error || 'Falha'));
    }
  } catch (err) {
    alert('Erro ao desconectar: ' + err.message);
  }
}


function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ============================================================================
// STANDARDIZED TOAST NOTIFICATION SYSTEM (Executive Feedback)
// ============================================================================
window.showToast = function(message, type = 'info', title = null, duration = 4500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const validTypes = ['success', 'error', 'warning', 'info'];
  const toastType = validTypes.includes(type) ? type : 'info';

  const defaultTitles = {
    success: 'Sucesso',
    error: 'Atenção / Erro',
    warning: 'Aviso',
    info: 'Notificação'
  };

  const icons = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error: '<i class="fa-solid fa-circle-xmark"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
    info: '<i class="fa-solid fa-circle-info"></i>'
  };

  const toastTitle = title || defaultTitles[toastType];

  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${toastType}`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="toast-icon">${icons[toastType]}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(toastTitle)}</div>
      <div class="toast-message">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
    </div>
    <button class="toast-close" title="Fechar" aria-label="Fechar">&times;</button>
    <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
  `;

  let dismissTimeout = null;

  const dismiss = () => {
    if (toastEl.classList.contains('removing')) return;
    toastEl.classList.add('removing');
    if (dismissTimeout) clearTimeout(dismissTimeout);
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }, 260);
  };

  toastEl.querySelector('.toast-close').addEventListener('click', dismiss);
  dismissTimeout = setTimeout(dismiss, duration);

  container.appendChild(toastEl);
};

window.toast = {
  success: (msg, title) => window.showToast(msg, 'success', title),
  error: (msg, title) => window.showToast(msg, 'error', title),
  warning: (msg, title) => window.showToast(msg, 'warning', title),
  info: (msg, title) => window.showToast(msg, 'info', title)
};

// Automatic non-breaking interception of browser alert() into Executive Toasts
const nativeAlert = window.alert;
window.alert = function(msg) {
  const str = String(msg || '');
  let type = 'info';
  let title = 'Notificação';

  if (str.includes('✅') || str.includes('🚀') || str.includes('🎉') || str.toLowerCase().includes('sucesso') || str.toLowerCase().includes('conectada') || str.toLowerCase().includes('ativo') || str.toLowerCase().includes('salvo')) {
    type = 'success';
    title = 'Sucesso';
  } else if (str.includes('❌') || str.toLowerCase().includes('erro') || str.toLowerCase().includes('falha')) {
    type = 'error';
    title = 'Erro';
  } else if (str.includes('⚠️') || str.toLowerCase().includes('aviso') || str.toLowerCase().includes('atenção')) {
    type = 'warning';
    title = 'Aviso';
  }

  const cleanMsg = str.replace(/^[✅❌⚠️🎉🚀📋📸ℹ️⚡]\s*/, '');
  window.showToast(cleanMsg, type, title);
};

// ============================================================================
// STANDARDIZED MODAL SYSTEM
// ============================================================================
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  const firstInput = el.querySelector('input:not([type="hidden"]), select, textarea');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 60);
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('active');
  }
  if (id === 'modal-whatsapp' && waPollInterval) {
    clearInterval(waPollInterval);
    waPollInterval = null;
  }
}

// Global Modal Backdrop click to dismiss
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop') && e.target.classList.contains('active')) {
    closeModal(e.target.id);
  }
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

// ESC key to dismiss active modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const activeModal = document.querySelector('.modal-backdrop.active');
    if (activeModal) {
      closeModal(activeModal.id);
    }
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

// AI Usage & Cost Monitoring (FinOps)
let usagePollInterval = null;
let activeLogFilter = 'ALL';
let currentUsageData = null;

function setupAiUsage() {
  const btnRefreshUsage = document.getElementById('btn-refresh-usage');
  if (btnRefreshUsage) {
    btnRefreshUsage.addEventListener('click', () => {
      fetchAiUsageStats();
    });
  }

  // Configuração dos filtros de log (Todas, Chat, Áudio)
  const filterPills = document.querySelectorAll('#log-filter-pills .table-pill-btn');
  filterPills.forEach(btn => {
    btn.addEventListener('click', () => {
      filterPills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLogFilter = btn.getAttribute('data-log-filter') || 'ALL';
      if (currentUsageData) {
        renderUsageLogsTable(currentUsageData.recentLogs || []);
      }
    });
  });
}

function startUsagePolling() {
  if (usagePollInterval) clearInterval(usagePollInterval);
  usagePollInterval = setInterval(fetchAiUsageStats, 4000);
}

function stopUsagePolling() {
  if (usagePollInterval) {
    clearInterval(usagePollInterval);
    usagePollInterval = null;
  }
}

async function fetchAiUsageStats() {
  try {
    const res = await fetch('/api/ai/usage-stats');
    const data = await res.json();
    if (data.success && data.data) {
      currentUsageData = data.data;
      renderUsageStats(data.data);
    }
  } catch (err) {
    console.error('Erro ao buscar estatísticas de uso de IA:', err);
  }
}

function renderUsageStats(stats) {
  const summary = stats.summary || {};

  // 1. KPI Cards
  const totalUsdEl = document.getElementById('stat-total-cost-usd');
  if (totalUsdEl) totalUsdEl.textContent = `$${summary.totalCostUsd.toFixed(5)} USD`;

  const totalTokensEl = document.getElementById('stat-total-tokens');
  if (totalTokensEl) totalTokensEl.textContent = summary.totalTokens.toLocaleString('pt-BR');

  const tokensBreakdownEl = document.getElementById('stat-tokens-breakdown');
  if (tokensBreakdownEl) {
    tokensBreakdownEl.innerHTML = `
      <span style="color: #818CF8;">Prompt: ${summary.totalPromptTokens.toLocaleString('pt-BR')}</span> • 
      <span style="color: #C084FC;">Resp: ${summary.totalCompletionTokens.toLocaleString('pt-BR')}</span>
    `;
  }

  // Ratio meter calculation
  const totalTokens = summary.totalTokens || 1;
  const promptPct = Math.round((summary.totalPromptTokens / totalTokens) * 100) || 50;
  const compPct = 100 - promptPct;
  const barIn = document.getElementById('ratio-bar-in');
  const barOut = document.getElementById('ratio-bar-out');
  if (barIn && barOut) {
    barIn.style.width = `${promptPct}%`;
    barOut.style.width = `${compPct}%`;
  }

  const totalAudiosEl = document.getElementById('stat-total-audios');
  if (totalAudiosEl) totalAudiosEl.textContent = `${summary.totalAudioCalls} áudio${summary.totalAudioCalls === 1 ? '' : 's'}`;

  const audioMinutesEl = document.getElementById('stat-audio-minutes');
  if (audioMinutesEl) audioMinutesEl.textContent = `${summary.totalAudioMinutes} min de voz`;

  const totalReqsEl = document.getElementById('stat-total-requests');
  if (totalReqsEl) totalReqsEl.textContent = summary.totalRequests;

  const reqsBreakdownEl = document.getElementById('stat-requests-breakdown');
  if (reqsBreakdownEl) reqsBreakdownEl.textContent = `Chat: ${summary.totalChatCalls} • Áudio: ${summary.totalAudioCalls}`;

  // 2. Categories Breakdown (Onde você gasta mais)
  const categoriesGrid = document.getElementById('categories-usage-grid');
  if (categoriesGrid) {
    const categories = stats.categories || [];
    if (categories.length === 0) {
      categoriesGrid.innerHTML = `
        <div style="background: var(--color-sand-light); border: 1px dashed var(--color-sand-border); border-radius: var(--radius-sm); padding: 24px; text-align: center; color: var(--color-muted);">
          <i class="fa-solid fa-chart-pie" style="font-size: 1.5rem; margin-bottom: 8px; display: block; opacity: 0.6; color: var(--color-cyprus);"></i>
          Nenhum consumo categorizado ainda.
        </div>
      `;
    } else {
      categoriesGrid.innerHTML = categories.map(c => {
        return `
          <div class="category-item">
            <div class="category-item-top">
              <div class="category-name-group">
                <div class="category-icon-box" style="background: ${c.color}22; color: ${c.color}; border: 1px solid ${c.color}44;">
                  <i class="fa-solid ${c.icon}"></i>
                </div>
                <div>
                  <span class="category-title">${escapeHtml(c.label)}</span>
                  <div class="category-calls-badge">${c.calls} chamada${c.calls === 1 ? '' : 's'} • ${c.totalTokens.toLocaleString('pt-BR')} tok</div>
                </div>
              </div>
              <div class="category-cost-group">
                <div class="category-cost-brl" style="color: #FBBF24; font-weight: 700;">$${c.costUsd.toFixed(5)} USD</div>
                <span class="category-pct-badge">${c.percentage}% do total</span>
              </div>
            </div>

            <div class="category-progress-track">
              <div class="category-progress-bar" style="width: ${Math.max(c.percentage, 4)}%; background: linear-gradient(90deg, ${c.color}, ${c.color}dd); box-shadow: 0 0 10px ${c.color}66;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 3. Models Breakdown
  const modelsGrid = document.getElementById('models-usage-grid');
  if (modelsGrid) {
    const models = stats.models || [];
    if (models.length === 0) {
      modelsGrid.innerHTML = `
        <div style="background: var(--color-sand-light); border: 1px dashed var(--color-sand-border); border-radius: var(--radius-sm); padding: 24px; text-align: center; color: var(--color-muted);">
          <i class="fa-solid fa-server" style="font-size: 1.5rem; margin-bottom: 8px; display: block; opacity: 0.6; color: var(--color-cyprus);"></i>
          Nenhum modelo acionado ainda.
        </div>
      `;
    } else {
      modelsGrid.innerHTML = models.map(m => {
        const isWhisper = m.model.includes('whisper') || m.audioSeconds > 0;
        const iconName = isWhisper ? 'fa-microphone-lines' : 'fa-brain';
        const iconColor = isWhisper ? '#10B981' : '#818CF8';
        const modelTitle = isWhisper ? 'OpenAI Whisper-1' : (m.model.includes('deepseek') ? 'DeepSeek V4 Flash' : m.model);
        const subTitle = isWhisper ? 'Transcrição de Áudio (STT)' : 'Cérebro Central & Tool Calling';

        const col1Title = isWhisper ? 'Áudios' : 'Tokens Entrada';
        const col1Val = isWhisper ? `${m.calls} áudios` : m.promptTokens.toLocaleString('pt-BR');

        const col2Title = isWhisper ? 'Duração' : 'Tokens Saída';
        const col2Val = isWhisper ? `${(m.audioSeconds / 60).toFixed(1)}m` : m.completionTokens.toLocaleString('pt-BR');

        return `
          <div class="model-card-item">
            <div class="model-header-row">
              <div class="model-title-block">
                <div class="category-icon-box" style="background: ${iconColor}22; color: ${iconColor}; border: 1px solid ${iconColor}44;">
                  <i class="fa-solid ${iconName}"></i>
                </div>
                <div>
                  <strong>${escapeHtml(modelTitle)}</strong>
                  <small>${escapeHtml(subTitle)}</small>
                </div>
              </div>
              <span class="badge" style="background: rgba(0, 70, 67, 0.08); color: var(--color-cyprus); border: 1px solid rgba(0, 70, 67, 0.18); font-size: 0.74rem; font-weight: 700; padding: 3px 10px; border-radius: var(--radius-full); font-family: var(--font-mono);">
                ${m.calls} reqs
              </span>
            </div>

            <div class="model-metrics-grid">
              <div class="model-metric-col">
                <span>${col1Title}</span>
                <strong>${col1Val}</strong>
              </div>
              <div class="model-metric-col">
                <span>${col2Title}</span>
                <strong>${col2Val}</strong>
              </div>
              <div class="model-metric-col" style="text-align: right;">
                <span>Custo Total</span>
                <strong style="color: #FBBF24;">$${m.costUsd.toFixed(5)} USD</strong>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Top Expensive Interactions (Perguntas que mais gastaram)
  const topBody = document.getElementById('top-interactions-body');
  if (topBody) {
    const topInteractions = stats.topInteractions || [];
    if (topInteractions.length === 0) {
      topBody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 32px; text-align: center; color: var(--text-dim);">
            <i class="fa-solid fa-ranking-star" style="font-size: 1.5rem; margin-bottom: 8px; display: block; opacity: 0.4;"></i>
            Nenhuma interação registrada ainda.
          </td>
        </tr>
      `;
    } else {
      topBody.innerHTML = topInteractions.map((item, idx) => {
        const isWa = item.channel === 'whatsapp_group';
        const channelBadge = isWa
          ? `<span class="priority-badge" style="background: rgba(37, 211, 102, 0.15); color: #25D366; font-size: 0.72rem;"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>`
          : `<span class="priority-badge" style="background: rgba(56, 189, 248, 0.15); color: #38BDF8; font-size: 0.72rem;"><i class="fa-solid fa-desktop"></i> Web</span>`;

        let rankClass = 'rank-other';
        if (idx === 0) rankClass = 'rank-1';
        else if (idx === 1) rankClass = 'rank-2';
        else if (idx === 2) rankClass = 'rank-3';

        return `
          <tr>
            <td>
              <span class="rank-badge ${rankClass}">#${idx + 1}</span>
            </td>
            <td style="max-width: 300px;">
              <div style="color: #fff; font-weight: 600; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.promptSummary)}">
                ${escapeHtml(item.promptSummary)}
              </div>
            </td>
            <td>
              <span style="color: #818CF8; font-weight: 500; font-size: 0.8rem;">${escapeHtml(item.categoryLabel)}</span>
            </td>
            <td>${channelBadge}</td>
            <td>
              <span class="latency-badge"><i class="fa-solid fa-arrows-split-up-and-left"></i> ${item.stepsCount} passo${item.stepsCount === 1 ? '' : 's'}</span>
            </td>
            <td>
              <span class="mono-tokens">${item.totalTokens.toLocaleString('pt-BR')}</span>
            </td>
            <td style="text-align: right;">
              <div class="cost-tag-highlight" style="color: #FBBF24; font-weight: 700;">$${item.totalCostUsd.toFixed(5)} USD</div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // 5. Recent Logs Table with Filter
  renderUsageLogsTable(stats.recentLogs || []);
}

function renderUsageLogsTable(logs) {
  const tbody = document.getElementById('usage-logs-body');
  if (!tbody) return;

  let filtered = logs;
  if (activeLogFilter !== 'ALL') {
    filtered = logs.filter(l => l.operationType === activeLogFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 32px; text-align: center; color: var(--text-dim);">
          <i class="fa-solid fa-receipt" style="font-size: 1.5rem; margin-bottom: 8px; display: block; opacity: 0.4;"></i>
          Nenhum log encontrado para este filtro.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const date = new Date(l.createdAt);
    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    const isAudio = l.operationType === 'transcription';
    const opBadge = isAudio
      ? `<span class="priority-badge" style="background: rgba(16, 185, 129, 0.15); color: #34D399; font-size: 0.75rem;"><i class="fa-solid fa-microphone"></i> Transcrição</span>`
      : `<span class="priority-badge" style="background: rgba(129, 140, 248, 0.15); color: #818CF8; font-size: 0.75rem;"><i class="fa-solid fa-comments"></i> Chat LLM</span>`;

    const channelBadge = l.channel === 'whatsapp_group'
      ? `<span class="priority-badge" style="background: rgba(37, 211, 102, 0.15); color: #25D366; font-size: 0.75rem;"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>`
      : `<span class="priority-badge" style="background: rgba(56, 189, 248, 0.15); color: #38BDF8; font-size: 0.75rem;"><i class="fa-solid fa-desktop"></i> Painel Web</span>`;

    const metricStr = isAudio
      ? `<span class="mono-tokens" style="color: #34D399;">${l.audioSeconds}s áudio</span>`
      : `<span class="mono-tokens">${l.totalTokens} tok <small style="color: var(--text-dim);">(${l.promptTokens} in / ${l.completionTokens} out)</small></span>`;

    const latencyColor = l.durationMs < 1500 ? '#34D399' : (l.durationMs < 4000 ? '#FBBF24' : '#FB7185');

    return `
      <tr>
        <td style="color: var(--text-dim);">
          <strong style="color: #fff; display: block; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;">${timeStr}</strong>
          <small>${dateStr}</small>
        </td>
        <td>
          <strong style="color: #fff; font-size: 0.88rem;">${escapeHtml(l.model)}</strong>
          <small style="display: block; color: var(--text-dim); text-transform: uppercase; font-size: 0.7rem; font-weight: 600;">${escapeHtml(l.provider)}</small>
        </td>
        <td>${opBadge}</td>
        <td>${channelBadge}</td>
        <td>${metricStr}</td>
        <td>
          <span class="latency-badge" style="color: ${latencyColor}; border: 1px solid ${latencyColor}33;">
            <i class="fa-solid fa-gauge-high"></i> ${(l.durationMs / 1000).toFixed(2)}s
          </span>
        </td>
        <td style="text-align: right;">
          <div class="cost-tag-highlight" style="color: #FBBF24; font-weight: 700;">$${l.costUsd.toFixed(5)} USD</div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// 6. LOGS DO SISTEMA EM TEMPO REAL
// ==========================================
let allSystemLogs = [];
let activeLogCategory = 'all';
let activeLogLevel = 'all';
let logSearchQuery = '';
let isLiveLogsActive = true;
let liveLogsInterval = null;

function setupLogs() {
  const catPills = document.querySelectorAll('#logs-category-pills button');
  const levelSelect = document.getElementById('logs-level-filter');
  const searchInput = document.getElementById('logs-search-input');
  const btnToggleLive = document.getElementById('btn-toggle-live-logs');
  const btnSyncWebhook = document.getElementById('btn-sync-webhook');
  const btnCopyLogs = document.getElementById('btn-copy-logs');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  // Filtro por Categoria
  catPills.forEach(btn => {
    btn.addEventListener('click', () => {
      catPills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLogCategory = btn.dataset.logCat || 'all';
      renderLogs();
    });
  });

  // Filtro por Nível
  if (levelSelect) {
    levelSelect.addEventListener('change', (e) => {
      activeLogLevel = e.target.value;
      renderLogs();
    });
  }

  // Filtro por Busca de Texto
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      logSearchQuery = e.target.value.toLowerCase().trim();
      renderLogs();
    });
  }

  // Pausar / Retomar Live
  if (btnToggleLive) {
    btnToggleLive.addEventListener('click', () => {
      isLiveLogsActive = !isLiveLogsActive;
      const dot = document.getElementById('live-logs-dot');
      const label = document.getElementById('live-logs-label');
      if (isLiveLogsActive) {
        if (dot) dot.style.background = '#10B981';
        if (label) label.textContent = 'Ao Vivo';
        fetchLogs();
      } else {
        if (dot) dot.style.background = '#94A3B8';
        if (label) label.textContent = 'Pausado';
      }
    });
  }

  // Sincronizar Webhook
  if (btnSyncWebhook) {
    btnSyncWebhook.addEventListener('click', async () => {
      btnSyncWebhook.disabled = true;
      const origHtml = btnSyncWebhook.innerHTML;
      btnSyncWebhook.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sincronizando...';
      try {
        const res = await fetch('/api/system/sync-webhook', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert(`✅ Webhook sincronizado com sucesso!\nURL: ${data.targetUrl}`);
        } else {
          alert(`❌ Erro: ${data.error || 'Falha ao sincronizar webhook'}`);
        }
      } catch (err) {
        alert(`❌ Erro de conexão: ${err.message}`);
      } finally {
        btnSyncWebhook.disabled = false;
        btnSyncWebhook.innerHTML = origHtml;
        fetchLogs();
      }
    });
  }

  // Copiar Logs
  if (btnCopyLogs) {
    btnCopyLogs.addEventListener('click', () => {
      const textToCopy = allSystemLogs.map(l => `[${l.timestamp}] [${l.category.toUpperCase()}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert('📋 Logs copiados para a área de transferência!');
      }).catch(() => {
        alert('Não foi possível copiar os logs.');
      });
    });
  }

  // Limpar Logs
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async () => {
      if (!confirm('Deseja realmente limpar o histórico de logs do servidor?')) return;
      try {
        await fetch('/api/system/logs/clear', { method: 'POST' });
        allSystemLogs = [];
        renderLogs();
      } catch (err) {
        console.error('Erro ao limpar logs:', err);
      }
    });
  }

  // Inicia Polling Periódico (a cada 2.5s)
  if (liveLogsInterval) clearInterval(liveLogsInterval);
  liveLogsInterval = setInterval(() => {
    if (isLiveLogsActive) {
      fetchLogs(true);
    }
  }, 2500);
}

async function fetchLogs(isBackground = false) {
  try {
    const res = await fetch('/api/system/logs?limit=300');
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.logs)) {
      allSystemLogs = data.logs;
      
      const counter = document.getElementById('logs-counter');
      if (counter) {
        counter.textContent = data.total || data.logs.length;
      }

      const streamStats = document.getElementById('logs-stream-stats');
      if (streamStats) {
        streamStats.textContent = `Total: ${data.total || data.logs.length} logs`;
      }

      renderLogs();
    }
  } catch (err) {
    if (!isBackground) console.error('Erro ao carregar logs:', err);
  }
}

function renderLogs() {
  const container = document.getElementById('logs-terminal-body');
  if (!container) return;

  let filtered = [...allSystemLogs];

  // Filtro por Categoria
  if (activeLogCategory !== 'all') {
    filtered = filtered.filter(l => l.category.toLowerCase() === activeLogCategory.toLowerCase());
  }

  // Filtro por Nível
  if (activeLogLevel !== 'all') {
    filtered = filtered.filter(l => l.level.toLowerCase() === activeLogLevel.toLowerCase());
  }

  // Filtro por Busca
  if (logSearchQuery) {
    filtered = filtered.filter(l => {
      const msg = (l.message || '').toLowerCase();
      const meta = l.metadata ? JSON.stringify(l.metadata).toLowerCase() : '';
      return msg.includes(logSearchQuery) || meta.includes(logSearchQuery);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="logs-empty-state">
        <i class="fa-solid fa-terminal" style="font-size: 2rem; color: #475569; margin-bottom: 12px;"></i>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Nenhum registro de log encontrado para os filtros selecionados.</p>
        <small style="color: var(--text-dim); margin-top: 4px;">Envie uma mensagem pelo WhatsApp ou Chat Web para gerar novos logs.</small>
      </div>
    `;
    return;
  }

  // Salva se o scroll estava no final antes de atualizar
  const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;

  container.innerHTML = filtered.map(l => {
    const date = new Date(l.timestamp);
    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });

    const lvl = (l.level || 'info').toLowerCase();
    const cat = (l.category || 'system').toLowerCase();

    let badgeClass = 'log-badge-info';
    if (lvl === 'success') badgeClass = 'log-badge-success';
    else if (lvl === 'warn') badgeClass = 'log-badge-warn';
    else if (lvl === 'error') badgeClass = 'log-badge-error';

    const catClass = `cat-${cat}`;
    const hasMeta = l.metadata && Object.keys(l.metadata).length > 0;
    const metaId = `meta_${l.id}`;

    return `
      <div class="log-row" id="row_${l.id}">
        <span class="log-time">${timeStr}</span>
        <span class="log-badge ${badgeClass}">${lvl}</span>
        <span class="log-cat-pill ${catClass}">${cat}</span>
        <div style="flex: 1; display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span class="log-msg">${escapeHtml(l.message)}</span>
            ${hasMeta ? `<button class="log-meta-toggle" onclick="toggleLogMeta('${metaId}')"><i class="fa-solid fa-code"></i> JSON</button>` : ''}
          </div>
          ${hasMeta ? `
            <div class="log-meta-box" id="${metaId}" style="display: none;">
              <code>${escapeHtml(JSON.stringify(l.metadata, null, 2))}</code>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (isScrolledToBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

window.toggleLogMeta = function(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
};

// =========================================================================
// META BUSINESS & INSTAGRAM (PERFIS, ASSETS DISCOVERY E CLIENTES)
// =========================================================================

let allMetaProfiles = [];
let allMetaClients = [];
let cachedProfileAssets = {};
let activeInsightsClientId = null;
let activeInsightsPeriod = 'last_7d';
let activeInsightsSubtab = 'overview';
let cachedCampaignsData = null;
let cachedCreativesData = null;

function setupMetaBusiness() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const metaStatus = params.get('meta');
  const clientId = params.get('clientId');
  const profileName = params.get('profile');

  if (tab === 'meta-business' || metaStatus) {
    const navMeta = document.querySelector('.nav-item[data-tab="meta-business"]');
    if (navMeta) navMeta.click();
  }

  if (metaStatus === 'connected') {
    const msg = profileName 
      ? `✅ Conta "${decodeURIComponent(profileName)}" conectada com sucesso à Meta!`
      : '✅ Conta conectada com sucesso!';
    
    // Limpa a URL para não reabrir em refresh
    window.history.replaceState({}, document.title, window.location.pathname);

    setTimeout(() => {
      alert(msg + (clientId ? '\nAgora selecione os ativos desejados para este cliente.' : ''));
      if (clientId) {
        openEditClientModal(clientId);
      }
    }, 600);
  } else if (metaStatus === 'failed' || metaStatus === 'error') {
    const err = params.get('error') || 'Não especificado';
    window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(() => {
      alert(`❌ Erro ao conectar conta: ${decodeURIComponent(err)}`);
    }, 600);
  }
}

async function fetchMetaBusinessData() {
  try {
    const [profilesRes, clientsRes] = await Promise.all([
      fetch('/api/meta/profiles'),
      fetch('/api/meta/clients'),
    ]);

    if (profilesRes.ok) {
      const profilesData = await profilesRes.json();
      allMetaProfiles = profilesData.data || [];
    }

    if (clientsRes.ok) {
      const clientsData = await clientsRes.json();
      allMetaClients = clientsData.data || [];
      renderMetaClients();
    }
  } catch (err) {
    console.error('Erro ao carregar dados do Meta Business:', err);
  }
}

function renderMetaClients(clients = allMetaClients) {
  const container = document.getElementById('meta-clients-grid');
  if (!container) return;

  if (clients.length === 0) {
    container.innerHTML = `
      <div style="padding: 32px; border-radius: 12px; border: 1px dashed var(--border-color); color: var(--text-dim); text-align: center; grid-column: 1 / -1;">
        <i class="fa-brands fa-meta" style="font-size: 2rem; color: #0081FB; margin-bottom: 10px; display: block;"></i>
        Nenhum cliente cadastrado ainda.<br>
        Clique no botão <strong>"Cadastrar Cliente"</strong> acima para começar.
      </div>
    `;
    return;
  }

  container.innerHTML = clients.map((c) => {
    const assets = Array.isArray(c.connectedAssets) ? c.connectedAssets : [];
    const hasAds = assets.includes('ad_account') || Boolean(c.adAccountId);
    const hasIg = assets.includes('instagram') || Boolean(c.instagramAccountId || c.instagramUsername);
    const hasFb = assets.includes('facebook') || Boolean(c.facebookPageId);
    const hasAnyAsset = hasAds || hasIg || hasFb;

    return `
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              <strong style="font-size: 1.15rem; color: var(--text-primary); display: block;">${escapeHtml(c.name)}</strong>
              ${c.profile ? `
                <small style="display: block; color: var(--text-dim); margin-top: 2px;">
                  Origem: <span style="color: #818CF8;">${escapeHtml(c.profile.name)}</span>
                </small>
              ` : `
                <small style="display: block; color: var(--text-dim); margin-top: 2px;">
                  <span style="color: #F59E0B;">Nenhum perfil vinculado</span>
                </small>
              `}
            </div>
            ${c.targetCpa ? `
              <span style="font-size: 0.75rem; padding: 3px 8px; border-radius: 12px; background: rgba(16, 185, 129, 0.12); color: #10B981; font-weight: 600;">
                Meta CPA: R$ ${c.targetCpa.toFixed(2)}
              </span>
            ` : ''}
          </div>

          ${c.description ? `
            <p style="font-size: 0.84rem; color: var(--text-muted); margin: 8px 0 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${escapeHtml(c.description)}
            </p>
          ` : ''}

          <!-- Badges de Ativos Conectados -->
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
            ${hasAds ? `
              <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; background: rgba(56, 189, 248, 0.08); padding: 5px 8px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.2);">
                <i class="fa-solid fa-chart-line" style="color: #38bdf8;"></i>
                <span style="color: var(--text-primary); font-weight: 500;">${escapeHtml(c.adAccountName || 'Conta de Anúncios')}</span>
                <span style="color: var(--text-dim); font-family: monospace; font-size: 0.72rem; margin-left: auto;">${escapeHtml(c.adAccountId || '')}</span>
              </div>
            ` : ''}

            ${hasIg ? `
              <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; background: rgba(225, 48, 108, 0.08); padding: 5px 8px; border-radius: 6px; border: 1px solid rgba(225, 48, 108, 0.2);">
                <i class="fa-brands fa-instagram" style="color: #E1306C;"></i>
                <span style="color: #E1306C; font-weight: 600;">${escapeHtml(c.instagramUsername ? (c.instagramUsername.startsWith('@') ? c.instagramUsername : `@${c.instagramUsername}`) : 'Instagram Conectado')}</span>
              </div>
            ` : ''}

            ${hasFb ? `
              <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; background: rgba(0, 129, 251, 0.08); padding: 5px 8px; border-radius: 6px; border: 1px solid rgba(0, 129, 251, 0.2);">
                <i class="fa-brands fa-facebook" style="color: #0081FB;"></i>
                <span style="color: var(--text-primary); font-weight: 500;">${escapeHtml(c.facebookPageName || 'Página do Facebook')}</span>
              </div>
            ` : ''}

            ${!hasAnyAsset ? `
              <div style="padding: 10px; border-radius: 8px; background: rgba(245, 158, 11, 0.08); border: 1px dashed rgba(245, 158, 11, 0.3); font-size: 0.8rem; color: #F59E0B; text-align: center; margin-bottom: 4px;">
                Nenhum ativo conectado neste cliente.
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <a href="/api/auth/meta?clientId=${c.id}" class="btn btn-secondary btn-sm" style="flex: 1; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: rgba(0, 129, 251, 0.12); color: #0081FB; border-color: rgba(0, 129, 251, 0.25); font-size: 0.78rem;">
                  <i class="fa-brands fa-facebook"></i> Conectar Meta
                </a>
                <a href="/api/auth/instagram?clientId=${c.id}" class="btn btn-secondary btn-sm" style="flex: 1; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: rgba(225, 48, 108, 0.12); color: #E1306C; border-color: rgba(225, 48, 108, 0.25); font-size: 0.78rem;">
                  <i class="fa-brands fa-instagram"></i> Conectar IG
                </a>
              </div>
            ` : ''}
          </div>
        </div>

        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${hasAds ? `
              <button class="btn btn-primary btn-sm" onclick="openClientInsightsModal('${c.id}')" style="display: inline-flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-chart-pie"></i> Anúncios
              </button>
            ` : ''}
            ${hasIg ? `
              <button class="btn btn-secondary btn-sm" onclick="openClientInstagramModal('${c.id}')" style="display: inline-flex; align-items: center; gap: 6px; color: #E1306C; border-color: rgba(225, 48, 108, 0.3);">
                <i class="fa-brands fa-instagram"></i> Perfil IG
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" onclick="openEditClientModal('${c.id}')" title="Editar Ativos e Configurações" style="display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-gear"></i> Ativos
            </button>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteMetaClient('${c.id}')" title="Excluir Cliente">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.filterMetaClients = function(query) {
  const clean = (query || '').toLowerCase().trim();
  if (!clean) {
    renderMetaClients(allMetaClients);
    return;
  }
  const filtered = allMetaClients.filter(c =>
    c.name.toLowerCase().includes(clean) ||
    (c.adAccountId && c.adAccountId.toLowerCase().includes(clean)) ||
    (c.instagramUsername && c.instagramUsername.toLowerCase().includes(clean)) ||
    (c.facebookPageName && c.facebookPageName.toLowerCase().includes(clean))
  );
  renderMetaClients(filtered);
};

window.openCreateClientModal = function() {
  document.getElementById('meta-client-edit-id').value = '';
  document.getElementById('modal-client-title').textContent = 'Cadastrar Cliente & Vincular Ativos';
  document.getElementById('form-new-meta-client').reset();

  const connectMetaBtn = document.getElementById('btn-modal-connect-meta');
  const connectIgBtn = document.getElementById('btn-modal-connect-ig');
  if (connectMetaBtn) connectMetaBtn.href = '/api/auth/meta';
  if (connectIgBtn) connectIgBtn.href = '/api/auth/instagram';

  populateProfileSelect(null);
  resetAssetSelects();
  openModal('modal-meta-client');
};

window.openEditClientModal = function(clientId) {
  const client = allMetaClients.find(c => c.id === clientId);
  if (!client) return;

  document.getElementById('meta-client-edit-id').value = client.id;
  document.getElementById('modal-client-title').textContent = `Configurar Cliente: ${client.name}`;
  document.getElementById('meta-client-name').value = client.name || '';
  document.getElementById('meta-client-cpa').value = client.targetCpa || '';
  document.getElementById('meta-client-desc').value = client.description || '';

  const connectMetaBtn = document.getElementById('btn-modal-connect-meta');
  const connectIgBtn = document.getElementById('btn-modal-connect-ig');
  if (connectMetaBtn) connectMetaBtn.href = `/api/auth/meta?clientId=${client.id}`;
  if (connectIgBtn) connectIgBtn.href = `/api/auth/instagram?clientId=${client.id}`;

  populateProfileSelect(client.profileId);
  if (client.profileId) {
    handleProfileChange(client.profileId, client);
  } else {
    resetAssetSelects();
  }

  openModal('modal-meta-client');
};

function populateProfileSelect(selectedProfileId) {
  const profileSelect = document.getElementById('meta-client-profile');
  if (!profileSelect) return;

  if (allMetaProfiles.length === 0) {
    profileSelect.innerHTML = '<option value="">Nenhum perfil conectado. Clique em "Conectar Meta" acima...</option>';
    return;
  }

  profileSelect.innerHTML = `
    <option value="">Selecione o perfil conectado...</option>
    ${allMetaProfiles.map((p) => `<option value="${p.id}" ${p.id === selectedProfileId ? 'selected' : ''}>${escapeHtml(p.name)} (${p.provider.toUpperCase()})</option>`).join('')}
  `;

  if (!selectedProfileId && allMetaProfiles.length === 1) {
    profileSelect.value = allMetaProfiles[0].id;
    handleProfileChange(allMetaProfiles[0].id);
  }
}

function resetAssetSelects() {
  document.getElementById('check-asset-ad').checked = false;
  document.getElementById('check-asset-ig').checked = false;
  document.getElementById('check-asset-fb').checked = false;
  document.getElementById('box-asset-ad').style.display = 'none';
  document.getElementById('box-asset-ig').style.display = 'none';
  document.getElementById('box-asset-fb').style.display = 'none';
}

window.toggleAssetField = function(type) {
  const box = document.getElementById(`box-asset-${type}`);
  const check = document.getElementById(`check-asset-${type}`);
  if (box && check) {
    box.style.display = check.checked ? 'block' : 'none';
  }
};

window.handleProfileChange = async function(profileId, presetClient = null) {
  if (!profileId) {
    resetAssetSelects();
    return;
  }

  const adSelect = document.getElementById('meta-client-ad-select');
  const igSelect = document.getElementById('meta-client-ig-select');
  const fbSelect = document.getElementById('meta-client-fb-select');

  adSelect.innerHTML = '<option value="">Carregando contas de anúncios...</option>';
  igSelect.innerHTML = '<option value="">Carregando perfis do Instagram...</option>';
  fbSelect.innerHTML = '<option value="">Carregando páginas do Facebook...</option>';

  try {
    const res = await fetch(`/api/meta/profiles/${profileId}/assets`);
    const data = await res.json();

    if (!data.success || !data.assets) {
      alert(`Aviso: ${data.error || 'Não foi possível carregar ativos deste perfil.'}`);
      return;
    }

    const { adAccounts, instagramAccounts, pages } = data.assets;
    cachedProfileAssets[profileId] = data.assets;

    // 1. Popula Contas de Anúncios Agrupadas por BM
    if (adAccounts.length === 0) {
      adSelect.innerHTML = '<option value="">Nenhuma conta de anúncios encontrada neste perfil</option>';
    } else {
      const byBm = {};
      const noBm = [];

      adAccounts.forEach(a => {
        if (a.bm && a.bm.name) {
          const bmKey = a.bm.name.trim();
          if (!byBm[bmKey]) byBm[bmKey] = [];
          byBm[bmKey].push(a);
        } else {
          noBm.push(a);
        }
      });

      let adHtml = '<option value="">Selecione a conta de anúncios...</option>';

      // Grupos por BM
      Object.keys(byBm).sort((a, b) => a.localeCompare(b)).forEach(bmName => {
        adHtml += `<optgroup label="🏢 BM: ${escapeHtml(bmName)}">`;
        byBm[bmName].forEach(a => {
          adHtml += `<option value="${a.id}" data-name="${escapeHtml(a.name)}" data-bmid="${a.bm?.id || ''}" data-bmname="${escapeHtml(a.bm?.name || '')}">⚡ ${escapeHtml(a.name)} (${a.id})</option>`;
        });
        adHtml += '</optgroup>';
      });

      // Contas sem BM / Pessoais
      if (noBm.length > 0) {
        adHtml += '<optgroup label="👤 Contas Pessoais / Outras">';
        noBm.forEach(a => {
          adHtml += `<option value="${a.id}" data-name="${escapeHtml(a.name)}" data-bmid="" data-bmname="">⚡ ${escapeHtml(a.name)} (${a.id})</option>`;
        });
        adHtml += '</optgroup>';
      }

      adSelect.innerHTML = adHtml;
    }

    // 2. Popula Contas do Instagram
    if (instagramAccounts.length === 0) {
      igSelect.innerHTML = '<option value="">Nenhuma conta de Instagram vinculada encontrada</option>';
    } else {
      let igHtml = '<option value="">Selecione o perfil do Instagram...</option>';
      igHtml += '<optgroup label="📸 Perfis do Instagram (Profissional / Criador)">';
      instagramAccounts.forEach(ig => {
        const username = ig.username ? (ig.username.startsWith('@') ? ig.username : `@${ig.username}`) : '';
        const namePart = ig.name ? ` — ${escapeHtml(ig.name)}` : '';
        igHtml += `<option value="${ig.id}" data-username="${escapeHtml(ig.username)}">${escapeHtml(username)}${namePart}</option>`;
      });
      igHtml += '</optgroup>';
      igSelect.innerHTML = igHtml;
    }

    // 3. Popula Páginas do Facebook
    if (pages.length === 0) {
      fbSelect.innerHTML = '<option value="">Nenhuma página encontrada neste perfil</option>';
    } else {
      let fbHtml = '<option value="">Selecione a página do Facebook...</option>';
      fbHtml += '<optgroup label="📘 Páginas Gerenciadas do Facebook">';
      pages.forEach(p => {
        const catPart = p.category ? ` (${escapeHtml(p.category)})` : '';
        fbHtml += `<option value="${p.id}" data-name="${escapeHtml(p.name)}" data-token="${p.token || ''}">${escapeHtml(p.name)}${catPart}</option>`;
      });
      fbHtml += '</optgroup>';
      fbSelect.innerHTML = fbHtml;
    }

    // Se estiver editando um cliente existente, pré-seleciona os valores
    if (presetClient) {
      if (presetClient.adAccountId) {
        document.getElementById('check-asset-ad').checked = true;
        document.getElementById('box-asset-ad').style.display = 'block';
        adSelect.value = presetClient.adAccountId;
      }
      if (presetClient.instagramAccountId || presetClient.instagramUsername) {
        document.getElementById('check-asset-ig').checked = true;
        document.getElementById('box-asset-ig').style.display = 'block';
        if (presetClient.instagramAccountId) igSelect.value = presetClient.instagramAccountId;
      }
      if (presetClient.facebookPageId) {
        document.getElementById('check-asset-fb').checked = true;
        document.getElementById('box-asset-fb').style.display = 'block';
        fbSelect.value = presetClient.facebookPageId;
      }
    }
  } catch (err) {
    alert(`Erro ao buscar ativos: ${err.message}`);
  }
};

window.handleSaveMetaClient = async function(e) {
  e.preventDefault();
  const editId = document.getElementById('meta-client-edit-id').value;
  const profileId = document.getElementById('meta-client-profile').value || undefined;
  const name = document.getElementById('meta-client-name').value.trim();
  const description = document.getElementById('meta-client-desc').value.trim();
  const targetCpa = document.getElementById('meta-client-cpa').value;

  if (!name) {
    alert('Por favor, informe o Nome do Cliente.');
    return;
  }

  const checkAd = document.getElementById('check-asset-ad').checked;
  const checkIg = document.getElementById('check-asset-ig').checked;
  const checkFb = document.getElementById('check-asset-fb').checked;

  let adAccountId = undefined;
  let adAccountName = undefined;
  let bmId = undefined;
  let bmName = undefined;
  if (checkAd) {
    const adSelect = document.getElementById('meta-client-ad-select');
    adAccountId = adSelect.value || undefined;
    const selectedOpt = adSelect.options[adSelect.selectedIndex];
    if (selectedOpt) {
      adAccountName = selectedOpt.dataset.name;
      bmId = selectedOpt.dataset.bmid || undefined;
      bmName = selectedOpt.dataset.bmname || undefined;
    }
  }

  let instagramAccountId = undefined;
  let instagramUsername = undefined;
  if (checkIg) {
    const igSelect = document.getElementById('meta-client-ig-select');
    instagramAccountId = igSelect.value || undefined;
    const selectedOpt = igSelect.options[igSelect.selectedIndex];
    if (selectedOpt) {
      instagramUsername = selectedOpt.dataset.username;
    }
  }

  let facebookPageId = undefined;
  let facebookPageName = undefined;
  let facebookPageToken = undefined;
  if (checkFb) {
    const fbSelect = document.getElementById('meta-client-fb-select');
    facebookPageId = fbSelect.value || undefined;
    const selectedOpt = fbSelect.options[fbSelect.selectedIndex];
    if (selectedOpt) {
      facebookPageName = selectedOpt.dataset.name;
      facebookPageToken = selectedOpt.dataset.token;
    }
  }

  const connectedAssets = [];
  if (adAccountId) connectedAssets.push('ad_account');
  if (instagramAccountId || instagramUsername) connectedAssets.push('instagram');
  if (facebookPageId) connectedAssets.push('facebook');

  const payload = {
    profileId,
    name,
    description,
    connectedAssets,
    bmId,
    bmName,
    adAccountId,
    adAccountName,
    facebookPageId,
    facebookPageName,
    facebookPageToken,
    instagramAccountId,
    instagramUsername,
    targetCpa: targetCpa ? parseFloat(targetCpa) : undefined,
  };

  try {
    const url = editId ? `/api/meta/clients/${editId}` : '/api/meta/clients';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Cliente "${name}" salvo com sucesso!`);
      closeModal('modal-meta-client');
      fetchMetaBusinessData();
    } else {
      alert(`❌ Erro: ${data.error}`);
    }
  } catch (err) {
    alert(`❌ Falha de rede: ${err.message}`);
  }
};

window.deleteMetaClient = async function(id) {
  if (!confirm('Deseja realmente excluir este cliente?')) return;
  try {
    const res = await fetch(`/api/meta/clients/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchMetaBusinessData();
    } else {
      alert(`Erro: ${data.error}`);
    }
  } catch (err) {
    alert(`Erro de conexão: ${err.message}`);
  }
};

window.openClientInsightsModal = async function(clientId) {
  activeInsightsClientId = clientId;
  activeInsightsPeriod = 'last_7d';
  activeInsightsSubtab = 'overview';
  cachedCampaignsData = null;
  cachedCreativesData = null;

  const client = allMetaClients.find(c => c.id === clientId);
  if (!client) return;

  const titleEl = document.getElementById('modal-insights-title');
  const subEl = document.getElementById('modal-insights-subtitle');
  const targetBadgeEl = document.getElementById('modal-insights-target-badge');

  if (titleEl) titleEl.textContent = `${client.name} • Análises & Histórico`;
  if (subEl) subEl.textContent = `Conta: ${client.adAccountId || 'N/A'} (Perfil: ${client.profile?.name || 'N/A'})`;
  if (targetBadgeEl) {
    targetBadgeEl.textContent = client.targetCpa ? `Meta CPA: ${client.currency || 'BRL'} ${client.targetCpa.toFixed(2)}` : 'Sem Meta CPA';
  }

  // Reseta estado dos botões de período
  document.querySelectorAll('#meta-insights-period-pills .meta-period-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === activeInsightsPeriod);
  });

  // Reseta para a aba Visão Geral
  switchMetaInsightsSubtab('overview');

  openModal('modal-meta-insights');
  await loadAllClientInsightsData();
};

window.selectInsightsPeriod = async function(period) {
  activeInsightsPeriod = period;
  document.querySelectorAll('#meta-insights-period-pills .meta-period-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  await loadAllClientInsightsData();
};

window.switchMetaInsightsSubtab = function(subtab) {
  activeInsightsSubtab = subtab;

  const overviewPane = document.getElementById('meta-subtab-pane-overview');
  const campaignsPane = document.getElementById('meta-subtab-pane-campaigns');
  const creativesPane = document.getElementById('meta-subtab-pane-creatives');

  const btnOverview = document.getElementById('meta-subtab-btn-overview');
  const btnCampaigns = document.getElementById('meta-subtab-btn-campaigns');
  const btnCreatives = document.getElementById('meta-subtab-btn-creatives');

  if (overviewPane) overviewPane.style.display = subtab === 'overview' ? 'block' : 'none';
  if (campaignsPane) campaignsPane.style.display = subtab === 'campaigns' ? 'block' : 'none';
  if (creativesPane) creativesPane.style.display = subtab === 'creatives' ? 'block' : 'none';

  if (btnOverview) btnOverview.classList.toggle('active', subtab === 'overview');
  if (btnCampaigns) btnCampaigns.classList.toggle('active', subtab === 'campaigns');
  if (btnCreatives) btnCreatives.classList.toggle('active', subtab === 'creatives');
};

window.reloadActiveMetaInsightsTab = async function() {
  await loadAllClientInsightsData();
};

window.loadAllClientInsightsData = async function() {
  if (!activeInsightsClientId) return;

  const cardsContainer = document.getElementById('modal-insights-cards');
  const topCampContainer = document.getElementById('modal-overview-top-campaigns');
  const topCreativesContainer = document.getElementById('modal-overview-top-creatives');
  const campaignsTbody = document.getElementById('modal-campaigns-tbody');
  const creativesGrid = document.getElementById('modal-creatives-grid');
  const campCountEl = document.getElementById('meta-camp-count');
  const creativeCountEl = document.getElementById('meta-creative-count');

  if (cardsContainer) {
    cardsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--text-dim);">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.5rem; color: #38bdf8; margin-bottom: 8px;"></i>
        <div>Consultando métricas históricas da Meta Graph API...</div>
      </div>
    `;
  }
  if (campaignsTbody) {
    campaignsTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px; color: var(--text-dim);"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando campanhas...</td></tr>';
  }
  if (creativesGrid) {
    creativesGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--text-dim);"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando criativos e anúncios...</div>';
  }

  try {
    async function safeFetchJson(url) {
      try {
        const res = await fetch(url);
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await res.json();
          if (!res.ok && !data.error) data.error = `Erro ${res.status}: ${res.statusText}`;
          return data;
        }
        if (res.status === 401 || res.status === 403) {
          return { success: false, error: 'Sessão expirada. Faça login novamente no painel.' };
        }
        return { success: false, error: `Erro HTTP ${res.status} na requisição.` };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    const [overviewRes, campaignsRes, creativesRes] = await Promise.all([
      safeFetchJson(`/api/meta/clients/${activeInsightsClientId}/insights?datePreset=${activeInsightsPeriod}`),
      safeFetchJson(`/api/meta/clients/${activeInsightsClientId}/campaign-insights?datePreset=${activeInsightsPeriod}`),
      safeFetchJson(`/api/meta/clients/${activeInsightsClientId}/creative-insights?datePreset=${activeInsightsPeriod}`),
    ]);

    cachedCampaignsData = campaignsRes;
    cachedCreativesData = creativesRes;

    const currency = overviewRes.client?.currency || campaignsRes.client?.currency || 'BRL';
    const targetCpa = overviewRes.client?.targetCpa || campaignsRes.client?.targetCpa;

    // Atualiza contadores nas abas
    if (campCountEl) campCountEl.textContent = campaignsRes.success && Array.isArray(campaignsRes.campaigns) ? campaignsRes.campaigns.length : 0;
    if (creativeCountEl) creativeCountEl.textContent = creativesRes.success && Array.isArray(creativesRes.creatives) ? creativesRes.creatives.length : 0;

    // 1. RENDER: Visão Geral (Cards)
    if (cardsContainer) {
      if (overviewRes.success && overviewRes.metrics) {
        const m = overviewRes.metrics;
        cardsContainer.innerHTML = `
          <div style="background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; text-align: center;">
            <small style="color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">Investimento Total</small>
            <strong style="display: block; font-size: 1.3rem; color: #38bdf8; margin-top: 4px;">${currency} ${m.spend.toFixed(2)}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem;">no período</small>
          </div>
          <div style="background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; text-align: center;">
            <small style="color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">Leads / Contatos</small>
            <strong style="display: block; font-size: 1.3rem; color: #10B981; margin-top: 4px;">${m.leads}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem;">conversões</small>
          </div>
          <div style="background: var(--bg-dark); border: 1px solid ${targetCpa && m.costPerLead > targetCpa ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}; border-radius: 10px; padding: 14px; text-align: center;">
            <small style="color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">CPA / Custo p/ Lead</small>
            <strong style="display: block; font-size: 1.3rem; color: ${targetCpa && m.costPerLead > targetCpa ? '#EF4444' : '#F59E0B'}; margin-top: 4px;">${m.costPerLeadFormatted}</strong>
            <small style="color: ${targetCpa && m.costPerLead > targetCpa ? '#EF4444' : 'var(--text-muted)'}; font-size: 0.72rem;">
              ${targetCpa ? (m.costPerLead > targetCpa ? `⚠️ Acima da meta (${currency} ${targetCpa})` : `✅ Dentro da meta`) : 'sem meta definida'}
            </small>
          </div>
          <div style="background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; text-align: center;">
            <small style="color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">Cliques (CTR)</small>
            <strong style="display: block; font-size: 1.15rem; color: var(--text-primary); margin-top: 4px;">${m.clicks.toLocaleString('pt-BR')}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem;">CTR: ${m.ctr}%</small>
          </div>
          <div style="background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; text-align: center;">
            <small style="color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">CPC Médio / CPM</small>
            <strong style="display: block; font-size: 1.15rem; color: var(--text-primary); margin-top: 4px;">${currency} ${m.cpc.toFixed(2)}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem;">CPM: ${currency} ${m.cpm.toFixed(2)}</small>
          </div>
          <div style="background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; text-align: center;">
            <small style="color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">ROAS / Retorno</small>
            <strong style="display: block; font-size: 1.15rem; color: #A855F7; margin-top: 4px;">${m.roas > 0 ? `${m.roas}x` : 'N/A'}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem;">compras: ${m.purchases || 0}</small>
          </div>
        `;
      } else {
        const errMsg = overviewRes.error || '';
        const isTokenErr = /token|session|validating|oauth|auth|expired/i.test(errMsg);
        cardsContainer.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 14px 18px; border-radius: var(--radius-sm); background: rgba(239, 68, 68, 0.08); color: #DC2626; font-size: 0.86rem; text-align: center; border: 1px solid rgba(239, 68, 68, 0.2);">
            <i class="fa-solid fa-triangle-exclamation" style="margin-right: 6px;"></i>
            ${isTokenErr 
              ? 'O token do perfil da Meta expirou devido à redefinição de segurança. Vá até a aba <strong>Meta Business</strong> e clique em <strong>Conectar Perfil Meta</strong> para renovar.' 
              : (errMsg || 'Não foi possível carregar o resumo de métricas.')}
          </div>
        `;
      }
    }

    // Top Campanhas e Criativos no Overview
    if (topCampContainer) {
      if (campaignsRes.success && Array.isArray(campaignsRes.campaigns) && campaignsRes.campaigns.length > 0) {
        topCampContainer.innerHTML = campaignsRes.campaigns.slice(0, 4).map(c => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--color-sand-light); border: 1px solid var(--color-sand-border); border-radius: var(--radius-sm); font-size: 0.84rem; box-shadow: var(--shadow-xs);">
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 68%;">
              <strong style="color: var(--color-ink); display: block; overflow: hidden; text-overflow: ellipsis; font-size: 0.88rem;">${escapeHtml(c.name)}</strong>
              <small style="color: var(--color-slate);">${c.spendFormatted} • ${c.leads} leads (${c.costPerLeadFormatted})</small>
            </div>
            <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-full); font-weight: 700; ${c.status === 'ACTIVE' ? 'background: rgba(46, 196, 182, 0.15); color: var(--color-cyprus); border: 1px solid rgba(46, 196, 182, 0.3);' : 'background: rgba(112, 138, 135, 0.15); color: var(--color-muted); border: 1px solid rgba(112, 138, 135, 0.3);'}">
              ${c.status}
            </span>
          </div>
        `).join('');
      } else {
        topCampContainer.innerHTML = '<div style="color: var(--color-slate); font-size: 0.82rem; text-align: center; padding: 14px;">Nenhuma campanha com dados no período.</div>';
      }
    }

    if (topCreativesContainer) {
      if (creativesRes.success && Array.isArray(creativesRes.creatives) && creativesRes.creatives.length > 0) {
        const topCreatives = [...creativesRes.creatives].sort((a, b) => b.leads - a.leads).slice(0, 4);
        topCreativesContainer.innerHTML = topCreatives.map(cr => `
          <div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--color-sand-light); border: 1px solid var(--color-sand-border); border-radius: var(--radius-sm); font-size: 0.84rem; box-shadow: var(--shadow-xs);">
            ${cr.thumbnailUrl ? `<img src="${escapeHtml(cr.thumbnailUrl)}" style="width: 38px; height: 38px; border-radius: 6px; object-fit: cover; flex-shrink: 0; border: 1px solid var(--color-sand-border);" />` : `<div style="width: 38px; height: 38px; border-radius: 6px; background: var(--color-sand-muted); display: flex; align-items: center; justify-content: center; color: var(--color-cyprus); flex-shrink: 0;"><i class="fa-solid fa-image"></i></div>`}
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
              <strong style="color: var(--color-ink); display: block; overflow: hidden; text-overflow: ellipsis; font-size: 0.88rem;">${escapeHtml(cr.headline || cr.name)}</strong>
              <small style="color: var(--color-slate);">${cr.spendFormatted} • <span style="color: var(--color-cyprus); font-weight: 700;">${cr.leads} leads</span> (${cr.costPerLeadFormatted})</small>
            </div>
          </div>
        `).join('');
      } else {
        topCreativesContainer.innerHTML = '<div style="color: var(--color-slate); font-size: 0.82rem; text-align: center; padding: 14px;">Nenhum criativo com dados no período.</div>';
      }
    }

    // 2. RENDER: Tabela de Campanhas
    if (campaignsTbody) {
      if (campaignsRes.success && Array.isArray(campaignsRes.campaigns) && campaignsRes.campaigns.length > 0) {
        campaignsTbody.innerHTML = campaignsRes.campaigns.map(camp => {
          const isTargetAlert = camp.targetCpaAlert;
          return `
            <tr>
              <td>
                <strong style="color: var(--text-primary); display: block;">${escapeHtml(camp.name)}</strong>
                <small style="color: var(--text-dim); font-size: 0.75rem;">ID: ${camp.campaignId} • Obj: ${camp.objective}</small>
              </td>
              <td>
                <span style="display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; ${camp.status === 'ACTIVE' ? 'background: rgba(16, 185, 129, 0.15); color: #10B981;' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8;'}">
                  ${camp.status === 'ACTIVE' ? '🟢 ATIVA' : '⏸️ PAUSADA'}
                </span>
              </td>
              <td>
                <span style="font-weight: 600; color: var(--text-primary);">${camp.dailyBudget || 'Conjunto'}</span>
              </td>
              <td>
                <strong style="color: #38bdf8;">${camp.spendFormatted}</strong>
              </td>
              <td>
                <strong style="color: #10B981; font-size: 0.95rem;">${camp.leads}</strong>
              </td>
              <td>
                <span style="font-weight: 700; padding: 2px 6px; border-radius: 4px; ${isTargetAlert ? 'background: rgba(239, 68, 68, 0.2); color: #EF4444;' : 'color: #F59E0B;'}">
                  ${camp.costPerLeadFormatted}
                  ${isTargetAlert ? ' ⚠️' : ''}
                </span>
              </td>
              <td>
                <span>${camp.clicks}</span>
                <small style="color: var(--text-dim); display: block; font-size: 0.72rem;">CTR: ${camp.ctr}%</small>
              </td>
              <td>
                <span style="color: #A855F7; font-weight: 600;">${camp.roas > 0 ? `${camp.roas}x` : '-'}</span>
              </td>
              <td>
                <div style="display: flex; gap: 4px;">
                  <button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 0.75rem;" onclick="toggleMetaCampaignStatus('${activeInsightsClientId}', '${camp.campaignId}', '${camp.status}')" title="${camp.status === 'ACTIVE' ? 'Pausar Campanha' : 'Ativar Campanha'}">
                    <i class="fa-solid ${camp.status === 'ACTIVE' ? 'fa-pause' : 'fa-play'}"></i>
                  </button>
                  <button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 0.75rem;" onclick="promptMetaCampaignBudget('${activeInsightsClientId}', '${camp.campaignId}', ${camp.dailyBudgetRaw || 0})" title="Ajustar Orçamento Diário">
                    <i class="fa-solid fa-dollar-sign"></i>
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      } else {
        campaignsTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-dim);">${campaignsRes.error || 'Nenhuma campanha encontrada para este período.'}</td></tr>`;
      }
    }

    // 3. RENDER: Criativos & Anúncios
    // Popula dropdown de filtro por campanha
    const campFilterSelect = document.getElementById('meta-creative-campaign-filter');
    if (campFilterSelect && campaignsRes.success && Array.isArray(campaignsRes.campaigns)) {
      const currentVal = campFilterSelect.value;
      campFilterSelect.innerHTML = '<option value="">Todas as Campanhas</option>' + campaignsRes.campaigns.map(c => `
        <option value="${c.campaignId}" ${currentVal === c.campaignId ? 'selected' : ''}>${escapeHtml(c.name)}</option>
      `).join('');
    }

    renderCreativesGrid();

  } catch (err) {
    if (cardsContainer) cardsContainer.innerHTML = `<div style="grid-column: 1 / -1; color: #EF4444; padding: 16px;">Erro de conexão: ${err.message}</div>`;
  }
};

window.handleCreativeCampaignFilter = function() {
  renderCreativesGrid();
};

function renderCreativesGrid() {
  const creativesGrid = document.getElementById('modal-creatives-grid');
  const campFilterSelect = document.getElementById('meta-creative-campaign-filter');
  const summaryInfo = document.getElementById('meta-creative-summary-info');
  if (!creativesGrid) return;

  const selectedCampId = campFilterSelect ? campFilterSelect.value : '';

  if (!cachedCreativesData || !cachedCreativesData.success || !Array.isArray(cachedCreativesData.creatives)) {
    creativesGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--text-dim);">${cachedCreativesData?.error || 'Nenhum criativo disponível.'}</div>`;
    return;
  }

  let list = cachedCreativesData.creatives;
  if (selectedCampId) {
    list = list.filter(c => c.campaignId === selectedCampId);
  }

  if (summaryInfo) {
    summaryInfo.textContent = `Exibindo ${list.length} criativo(s)${selectedCampId ? ' filtrados' : ''}`;
  }

  if (list.length === 0) {
    creativesGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 32px; color: var(--text-dim);">Nenhum criativo encontrado para este filtro/período.</div>`;
    return;
  }

  creativesGrid.innerHTML = list.map(c => {
    const isTargetAlert = c.targetCpaAlert;
    return `
      <div class="meta-creative-card">
        <div class="meta-creative-media">
          ${c.imageUrl || c.thumbnailUrl ? `
            <img src="${escapeHtml(c.imageUrl || c.thumbnailUrl)}" alt="Criativo" loading="lazy" />
          ` : `
            <div class="no-media">
              <i class="fa-solid fa-photo-film" style="font-size: 2rem;"></i>
              <span>Sem Imagem / Vídeo</span>
            </div>
          `}
          <span style="position: absolute; top: 8px; right: 8px; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; ${c.status === 'ACTIVE' ? 'background: rgba(16, 185, 129, 0.9); color: #fff;' : 'background: rgba(15, 23, 42, 0.8); color: #cbd5e1;'}">
            ${c.status === 'ACTIVE' ? 'ATIVA' : 'PAUSADA'}
          </span>
        </div>

        <div class="meta-creative-body">
          <small style="color: #38bdf8; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(c.campaignName || 'Campanha')}
          </small>
          <div class="meta-creative-headline" title="${escapeHtml(c.headline || c.name)}">
            ${escapeHtml(c.headline || c.name)}
          </div>
          ${c.bodyText ? `
            <div class="meta-creative-copy" title="${escapeHtml(c.bodyText)}">
              ${escapeHtml(c.bodyText)}
            </div>
          ` : '<div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px; font-style: italic;">(Sem texto de copy configurado)</div>'}

          <div class="meta-creative-metrics-row">
            <div class="meta-cmetric-item">
              <small>Gasto</small>
              <strong style="color: #38bdf8;">${c.spendFormatted}</strong>
            </div>
            <div class="meta-cmetric-item">
              <small>Leads</small>
              <strong style="color: #10B981;">${c.leads}</strong>
            </div>
            <div class="meta-cmetric-item">
              <small>CPA</small>
              <strong style="${isTargetAlert ? 'color: #EF4444;' : 'color: #F59E0B;'}">${c.costPerLeadFormatted}</strong>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 0.75rem; color: var(--text-dim); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
            <div>
              <span>CTR: <strong>${c.ctr}%</strong></span> • <span>CPC: <strong>R$ ${c.cpc.toFixed(2)}</strong></span>
            </div>
            ${c.instagramLink ? `
              <a href="${escapeHtml(c.instagramLink)}" target="_blank" rel="noopener noreferrer" style="color: #E1306C; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-brands fa-instagram"></i> Ver Post
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleMetaCampaignStatus = async function(clientId, campaignId, currentStatus) {
  const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
  const actionLabel = newStatus === 'ACTIVE' ? 'ativar' : 'pausar';
  if (!confirm(`Deseja realmente ${actionLabel} esta campanha?`)) return;

  try {
    const res = await fetch(`/api/meta/clients/${clientId}/campaigns/${campaignId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      alert(`Campanha ${newStatus === 'ACTIVE' ? 'ativada' : 'pausada'} com sucesso!`);
      await loadAllClientInsightsData();
    } else {
      alert(`Erro: ${data.error}`);
    }
  } catch (err) {
    alert(`Erro de conexão: ${err.message}`);
  }
};

window.promptMetaCampaignBudget = async function(clientId, campaignId, currentBudget) {
  const currentVal = currentBudget > 0 ? currentBudget.toFixed(2) : '50.00';
  const val = prompt('Informe o novo orçamento diário em Reais (R$):', currentVal);
  if (!val) return;
  const num = parseFloat(val.replace(',', '.'));
  if (isNaN(num) || num <= 0) {
    alert('Valor de orçamento inválido.');
    return;
  }

  try {
    const res = await fetch(`/api/meta/clients/${clientId}/campaigns/${campaignId}/budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyBudget: num }),
    });
    const data = await res.json();
    if (data.success) {
      alert(`Orçamento alterado para R$ ${num.toFixed(2)}/dia com sucesso!`);
      await loadAllClientInsightsData();
    } else {
      alert(`Erro: ${data.error}`);
    }
  } catch (err) {
    alert(`Erro de conexão: ${err.message}`);
  }
};

window.openClientInstagramModal = async function(clientId) {
  const client = allMetaClients.find(c => c.id === clientId);
  if (!client) return;

  try {
    const res = await fetch(`/api/meta/clients/${clientId}/instagram`);
    const data = await res.json();

    if (data.success && data.profile) {
      const p = data.profile;
      alert(`📸 Instagram: ${p.username}\nNome: ${p.name}\nSeguidores: ${p.followers.toLocaleString('pt-BR')}\nSeguindo: ${p.following.toLocaleString('pt-BR')}\nPublicações: ${p.postsCount}\n\nBio:\n${p.biography || '(Sem bio)'}`);
    } else {
      alert(`Instagram de ${client.name}:\n${data.error || 'Não foi possível carregar dados do Instagram.'}`);
    }
  } catch (err) {
    alert(`Erro de conexão: ${err.message}`);
  }
};

/* ============================================================================
   BUSINESS OS — EXECUTIVE WORKSPACE MODULES (DASHBOARD, ECOMMERCE, SKILLS, COPILOT)
   ============================================================================ */

// 1. Dashboard Overview Loader
async function fetchDashboardOverview() {
  try {
    // A. Vendas de Hoje
    fetch('/api/ecommerce/overview?days=1')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          const rev = d.data.total_amount || 0;
          const ord = d.data.total_orders || 0;
          const salesEl = document.getElementById('dash-sales-today');
          const ordEl = document.getElementById('dash-orders-today');
          if (salesEl) salesEl.textContent = `R$ ${rev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          if (ordEl) ordEl.innerHTML = `<i class="fa-solid fa-box"></i> ${ord} pedidos hoje`;
        }
      })
      .catch(() => {});

    // B. Meta Ads Overview (Cache do Banco de Dados sincronizado a cada 2 min)
    fetch('/api/meta/overview?datePreset=today')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.consolidated) {
          const spend = Number(d.consolidated.spend || 0);
          const leads = Number(d.consolidated.leads || 0);
          const metaSpendEl = document.getElementById('dash-meta-spend');
          const metaLeadsEl = document.getElementById('dash-meta-leads');
          if (metaSpendEl) {
            metaSpendEl.textContent = `R$ ${spend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
          if (metaLeadsEl) {
            metaLeadsEl.innerHTML = `<i class="fa-solid fa-users"></i> ${leads} leads hoje`;
          }
        }
      })
      .catch(() => {});

    // C. Tarefas
    fetch('/api/tasks')
      .then(r => r.json())
      .then(d => {
        if (d.tasks) {
          const pending = d.tasks.filter(t => t.status === 'PENDING');
          const tCountEl = document.getElementById('dash-tasks-count');
          const tInfoEl = document.getElementById('dash-tasks-info');
          if (tCountEl) tCountEl.textContent = pending.length;
          if (tInfoEl) tInfoEl.textContent = `${pending.length} pendências na fila`;
        }
      })
      .catch(() => {});

    // D. IA Telemetria
    fetch('/api/usage/stats?days=30')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.stats) {
          const summary = d.stats.summary || d.stats;
          const costUsd = summary.totalCostUsd || 0;
          const tokens = summary.totalTokens || 0;
          const costEl = document.getElementById('dash-ai-cost');
          const tokEl = document.getElementById('dash-ai-tokens');
          if (costEl) costEl.textContent = `$${costUsd.toFixed(5)} USD`;
          if (tokEl) tokEl.innerHTML = `<i class="fa-solid fa-coins"></i> ${tokens.toLocaleString('pt-BR')} tokens (30d)`;
        }
      })
      .catch(() => {});

    // E. Skills Ativas
    fetch('/api/skills')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.skills)) {
          const countEl = document.getElementById('dash-skills-count');
          if (countEl) countEl.textContent = d.skills.length;
        }
      })
      .catch(() => {});

    // F. Alertas das Lojas
    fetch('/api/ecommerce/orders/pending?days=1')
      .then(r => r.json())
      .then(d => {
        const alertsEl = document.getElementById('dash-store-alerts');
        if (!alertsEl) return;
        if (d.success && d.data && Array.isArray(d.data.orders) && d.data.orders.length > 0) {
          alertsEl.innerHTML = d.data.orders.slice(0, 4).map(o => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--color-sand-light); border-radius: var(--radius-sm); border: 1px solid var(--color-sand-border);">
              <div>
                <strong style="font-size: 0.84rem; color: var(--color-ink);">${o.buyer_name || 'Cliente'}</strong>
                <div style="font-size: 0.74rem; color: var(--color-muted);">${o.items?.[0]?.title || 'Pedido #' + o.order_id}</div>
              </div>
              <span class="badge badge-amber">Despacho</span>
            </div>
          `).join('');
        } else {
          alertsEl.innerHTML = `<div style="color: var(--color-muted); font-size: 0.84rem; padding: 12px; text-align: center;"><i class="fa-solid fa-circle-check" style="color: var(--color-mint);"></i> Todos os envios do dia estão em dia!</div>`;
        }
      })
      .catch(() => {});

    // G. Google Calendar Agenda
    fetchGoogleEvents();

  } catch (err) {
    console.warn('[Dashboard] Erro ao carregar overview:', err);
  }
}
window.fetchDashboardOverview = fetchDashboardOverview;

// Google Calendar Agenda Loader
async function fetchGoogleEvents() {
  const container = document.getElementById('dash-upcoming-events');
  if (!container) return;

  try {
    const res = await fetch('/api/google/calendar/events?limit=5');
    const data = await res.json();

    if (data.success && Array.isArray(data.events) && data.events.length > 0) {
      container.innerHTML = data.events.map(ev => {
        const timeStr = ev.start?.dateTime 
          ? new Date(ev.start.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
          : (ev.start?.date || 'Dia todo');
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--color-sand-light); border-radius: var(--radius-sm); border: 1px solid var(--color-sand-border);">
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 210px;">
              <strong style="font-size: 0.84rem; color: var(--color-ink); display: block; overflow: hidden; text-overflow: ellipsis;">${ev.summary || 'Compromisso'}</strong>
              <div style="font-size: 0.74rem; color: var(--color-muted); overflow: hidden; text-overflow: ellipsis;">${ev.location || 'Google Calendar'}</div>
            </div>
            <span class="badge badge-info" style="font-size: 0.72rem; flex-shrink: 0;"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = `
        <div style="color: var(--color-muted); font-size: 0.84rem; padding: 14px; text-align: center;">
          <i class="fa-regular fa-calendar-check" style="color: var(--color-mint); margin-bottom: 4px; display: block; font-size: 1.2rem;"></i>
          Nenhum compromisso pendente na agenda hoje.
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `
      <div style="color: var(--color-muted); font-size: 0.82rem; padding: 10px; text-align: center;">
        Google Calendar não conectado ou indisponível.
      </div>
    `;
  }
}
window.fetchGoogleEvents = fetchGoogleEvents;

// 2. E-Commerce Operations Loader
async function setEcommercePeriod(days) {
  currentEcommerceDays = days;
  const filterBtns = document.querySelectorAll('#ecom-period-filters button');
  filterBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.period, 10) === days);
  });
  const badge = document.getElementById('ecom-period-badge');
  if (badge) badge.textContent = days === 1 ? 'Hoje' : `Últimos ${days} Dias`;
  await fetchEcommerceData();
}
window.setEcommercePeriod = setEcommercePeriod;

async function fetchEcommerceData() {
  try {
    const days = currentEcommerceDays || 1;

    // Resumo Consolidado
    const res = await fetch(`/api/ecommerce/overview?days=${days}`);
    const data = await res.json();
    if (data.success && data.data) {
      const rep = data.data;
      const totalRev = rep.total_amount || 0;
      const totalOrd = rep.total_orders || 0;
      const avgTicket = totalOrd > 0 ? totalRev / totalOrd : 0;

      const revEl = document.getElementById('ecom-total-revenue');
      const ordEl = document.getElementById('ecom-total-orders');
      const tickEl = document.getElementById('ecom-total-ticket');
      if (revEl) revEl.textContent = `R$ ${totalRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (ordEl) ordEl.innerHTML = `<i class="fa-solid fa-box"></i> ${totalOrd} pedidos`;
      if (tickEl) tickEl.innerHTML = `<i class="fa-solid fa-receipt"></i> Ticket médio: R$ ${avgTicket.toFixed(2)}`;

      // Loja 1: KlimaParts
      const kRev = rep.klimaparts?.total_amount || 0;
      const kOrd = rep.klimaparts?.total_orders || 0;
      const kTick = kOrd > 0 ? kRev / kOrd : 0;
      const kRevEl = document.getElementById('ecom-klima-revenue');
      const kOrdEl = document.getElementById('ecom-klima-orders');
      const kTickEl = document.getElementById('ecom-klima-ticket');
      if (kRevEl) kRevEl.textContent = `R$ ${kRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (kOrdEl) kOrdEl.innerHTML = `<i class="fa-solid fa-box"></i> ${kOrd} pedidos`;
      if (kTickEl) kTickEl.innerHTML = `<i class="fa-solid fa-receipt"></i> Ticket: R$ ${kTick.toFixed(2)}`;

      // Loja 2: ArmorCar
      const aRev = rep.armorcar?.total_amount || 0;
      const aOrd = rep.armorcar?.total_orders || 0;
      const aTick = aOrd > 0 ? aRev / aOrd : 0;
      const aRevEl = document.getElementById('ecom-armor-revenue');
      const aOrdEl = document.getElementById('ecom-armor-orders');
      const aTickEl = document.getElementById('ecom-armor-ticket');
      if (aRevEl) aRevEl.textContent = `R$ ${aRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (aOrdEl) aOrdEl.innerHTML = `<i class="fa-solid fa-box"></i> ${aOrd} pedidos`;
      if (aTickEl) aTickEl.innerHTML = `<i class="fa-solid fa-receipt"></i> Ticket: R$ ${aTick.toFixed(2)}`;
    }

    // Envios Pendentes
    fetch(`/api/ecommerce/orders/pending?days=${days}`)
      .then(r => r.json())
      .then(d => {
        const listEl = document.getElementById('ecom-shipments-list');
        const countEl = document.getElementById('ecom-pending-shipments-count');
        if (!listEl) return;
        if (d.success && d.data && Array.isArray(d.data.orders) && d.data.orders.length > 0) {
          if (countEl) countEl.textContent = `${d.data.orders.length} pendentes`;
          listEl.innerHTML = d.data.orders.map(o => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--color-sand-light); border-radius: var(--radius-sm); border: 1px solid var(--color-sand-border);">
              <div>
                <strong style="font-size: 0.86rem; color: var(--color-ink);">${o.buyer_name || 'Comprador'}</strong>
                <div style="font-size: 0.76rem; color: var(--color-slate);">${o.items?.[0]?.title || 'Pedido #' + o.order_id}</div>
                <div style="font-size: 0.72rem; color: var(--color-muted);">${new Date(o.date_created).toLocaleString('pt-BR')}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 700; color: var(--color-cyprus); font-size: 0.88rem;">R$ ${(o.total_amount || 0).toFixed(2)}</div>
                <span class="badge badge-amber" style="margin-top: 4px;">Pendente</span>
              </div>
            </div>
          `).join('');
        } else {
          if (countEl) countEl.textContent = '0 pendentes';
          listEl.innerHTML = `<div style="color: var(--color-muted); font-size: 0.84rem; padding: 20px; text-align: center;"><i class="fa-solid fa-circle-check" style="color: var(--color-mint); font-size: 1.2rem; display: block; margin-bottom: 6px;"></i> Nenhum pedido aguardando despacho!</div>`;
        }
      })
      .catch(() => {});

    // Perguntas Mercado Livre
    fetch('/api/ecommerce/questions/pending')
      .then(r => r.json())
      .then(d => {
        const qListEl = document.getElementById('ecom-questions-list');
        const qCountEl = document.getElementById('ecom-questions-count');
        if (!qListEl) return;
        if (d.success && d.data && Array.isArray(d.data.questions) && d.data.questions.length > 0) {
          if (qCountEl) qCountEl.textContent = `${d.data.questions.length} perguntas`;
          qListEl.innerHTML = d.data.questions.map(q => `
            <div style="padding: 10px 12px; background: var(--color-sand-light); border-radius: var(--radius-sm); border: 1px solid var(--color-sand-border);">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="font-size: 0.82rem; color: var(--color-cyprus);">${q.item_title || 'Anúncio'}</strong>
                <span class="badge badge-coral">Sem resposta</span>
              </div>
              <p style="font-size: 0.82rem; color: var(--color-ink); margin: 0;">"${q.text || ''}"</p>
            </div>
          `).join('');
        } else {
          if (qCountEl) qCountEl.textContent = '0 perguntas';
          qListEl.innerHTML = `<div style="color: var(--color-muted); font-size: 0.84rem; padding: 20px; text-align: center;"><i class="fa-solid fa-circle-check" style="color: var(--color-mint); font-size: 1.2rem; display: block; margin-bottom: 6px;"></i> Nenhuma pergunta pendente no Mercado Livre!</div>`;
        }
      })
      .catch(() => {});

  } catch (err) {
    console.warn('[Ecommerce] Erro ao carregar dados:', err);
  }
}
window.fetchEcommerceData = fetchEcommerceData;

// 3. Dynamic Skills Catalog Loader
async function fetchSkillsCatalog() {
  const grid = document.getElementById('skills-catalog-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/skills');
    const data = await res.json();
    if (data.success && Array.isArray(data.skills) && data.skills.length > 0) {
      grid.innerHTML = data.skills.map(s => `
        <div class="bento-module-card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--color-cyprus); margin: 0;">${s.displayName || s.name}</h4>
              <span class="badge ${s.isActive ? 'badge-mint' : 'badge-coral'}">${s.isActive ? 'Ativa' : 'Pausada'}</span>
            </div>
            <p style="font-size: 0.82rem; color: var(--color-slate); line-height: 1.4; margin-bottom: 12px;">${s.description || 'Sem descrição.'}</p>
            ${Array.isArray(s.triggerExamples) && s.triggerExamples.length > 0 ? `
              <div style="font-size: 0.74rem; color: var(--color-muted); margin-bottom: 8px;">
                <strong>Gatilhos:</strong> ${s.triggerExamples.map(t => `<code>${t}</code>`).join(' ')}
              </div>
            ` : ''}
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; border-top: 1px solid var(--color-sand-border-soft); padding-top: 10px;">
            <button class="btn btn-secondary btn-xs" onclick="runSkillDryRun('${s.id}')"><i class="fa-solid fa-play"></i> Simular (Dry-Run)</button>
            <button class="btn btn-secondary btn-xs" onclick="toggleSkillActive('${s.id}')"><i class="fa-solid fa-power-off"></i> ${s.isActive ? 'Pausar' : 'Ativar'}</button>
          </div>
        </div>
      `).join('');
    } else {
      grid.innerHTML = `<div style="grid-column: 1 / -1; color: var(--color-muted); font-size: 0.88rem; padding: 30px; text-align: center; background: var(--color-surface-pure); border: 1px solid var(--color-sand-border); border-radius: var(--radius-sm);"><i class="fa-solid fa-wand-magic-sparkles" style="font-size: 1.6rem; color: var(--color-cyprus); margin-bottom: 8px; display: block;"></i>Nenhuma Dynamic Skill criada ainda. Peça para a Victoria no chat: <em>"Aprenda a fazer um resumo das lojas..."</em></div>`;
    }
  } catch (err) {
    console.warn('[Skills] Erro ao carregar catálogo:', err);
  }
}
window.fetchSkillsCatalog = fetchSkillsCatalog;

// 4. Global Victoria Copilot Drawer
function toggleCopilotDrawer(forceState) {
  const drawer = document.getElementById('copilot-drawer');
  const backdrop = document.getElementById('copilot-backdrop');
  if (!drawer || !backdrop) return;

  const isActive = typeof forceState === 'boolean' ? forceState : !drawer.classList.contains('active');
  drawer.classList.toggle('active', isActive);
  backdrop.classList.toggle('active', isActive);

  if (isActive) {
    const input = document.getElementById('copilot-input');
    if (input) setTimeout(() => input.focus(), 150);
  }
}
window.toggleCopilotDrawer = toggleCopilotDrawer;

// Atalho global Cmd+K / Ctrl+K
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    toggleCopilotDrawer();
  }
});

function clearCopilotChat() {
  const container = document.getElementById('copilot-messages');
  if (container) {
    container.innerHTML = `
      <div class="copilot-bubble copilot-assistant">
        <div class="copilot-bubble-header">
          <strong>Victoria</strong>
          <small>Agora</small>
        </div>
        <div class="copilot-bubble-content">
          <p>Conversa reiniciada. Em que posso te ajudar no <strong>Business OS</strong>?</p>
        </div>
      </div>
    `;
  }
}
window.clearCopilotChat = clearCopilotChat;

function sendCopilotPrompt(text) {
  toggleCopilotDrawer(true);
  const input = document.getElementById('copilot-input');
  if (input) {
    input.value = text;
    const form = document.getElementById('copilot-form');
    if (form) form.dispatchEvent(new Event('submit'));
  }
}
window.sendCopilotPrompt = sendCopilotPrompt;

async function handleCopilotSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('copilot-input');
  const container = document.getElementById('copilot-messages');
  if (!input || !container) return;

  const text = input.value.trim();
  if (!text) return;

  // Append user bubble
  const userDiv = document.createElement('div');
  userDiv.className = 'copilot-bubble copilot-user';
  userDiv.innerHTML = `<div class="copilot-bubble-content">${escapeHtml(text)}</div>`;
  container.appendChild(userDiv);
  input.value = '';
  container.scrollTop = container.scrollHeight;

  // Loading indicator
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'copilot-bubble copilot-assistant';
  loadingDiv.innerHTML = `
    <div class="copilot-bubble-content" style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
      <i class="fa-solid fa-circle-notch fa-spin" style="color: var(--color-mint); font-size: 0.95rem;"></i>
      <span>Processando com Victoria...</span>
    </div>
  `;
  container.appendChild(loadingDiv);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        channel: 'web_copilot',
        conversationId: activeConversationId
      })
    });

    const data = await res.json();
    if (data.conversationId) {
      activeConversationId = data.conversationId;
      localStorage.setItem('active_conversation_id', activeConversationId);
    }

    if (data.success && data.response) {
      loadingDiv.innerHTML = `
        <div class="copilot-bubble-header" style="margin-bottom: 4px; font-weight: 700; color: var(--color-cyprus);">
          <strong>Victoria</strong>
        </div>
        <div class="copilot-bubble-content" style="white-space: pre-wrap;">${data.response}</div>
      `;
    } else {
      loadingDiv.innerHTML = `<span style="color: var(--color-coral);">Erro: ${data.error || 'Não foi possível obter resposta.'}</span>`;
    }
  } catch (err) {
    loadingDiv.innerHTML = `<span style="color: var(--color-coral);">Erro de conexão: ${err.message}</span>`;
  }
  container.scrollTop = container.scrollHeight;
}
window.handleCopilotSubmit = handleCopilotSubmit;

/* ============================================================================
   CONTACTS & PERMISSIONS MANAGEMENT (VICTORIA WHATSAPP)
   ============================================================================ */
let allContacts = [];

const ROLE_DEFINITIONS = {
  ADMIN: {
    name: 'Administrador (Dono)',
    badgeClass: 'role-ADMIN',
    icon: 'fa-solid fa-crown',
    desc: 'Acesso total irrestrito: finanças, métricas, tarefas, skills, comandos do sistema e controle de acessos.',
  },
  MANAGER: {
    name: 'Gestor / Gerente',
    badgeClass: 'role-MANAGER',
    icon: 'fa-solid fa-briefcase',
    desc: 'Acesso a relatórios de vendas, estoque, reuniões, criação de tarefas e briefing operacional.',
  },
  OPERATOR: {
    name: 'Operacional / Equipe',
    badgeClass: 'role-OPERATOR',
    icon: 'fa-solid fa-screwdriver-wrench',
    desc: 'Consultas sobre produtos, pedidos, procedimentos e agendamento de compromissos.',
  },
  VIP_CLIENT: {
    name: 'Cliente VIP',
    badgeClass: 'role-VIP_CLIENT',
    icon: 'fa-solid fa-star',
    desc: 'Atendimento executivo exclusivo, status de pedidos e suporte prioritário personalizado.',
  },
  VIEWER: {
    name: 'Visualizador (Consulta)',
    badgeClass: 'role-VIEWER',
    icon: 'fa-solid fa-eye',
    desc: 'Apenas tira dúvidas informativas gerais com a IA sem executar ações operacionais.',
  },
};

function setupContacts() {
  const roleSelect = document.getElementById('contact-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      updateContactRoleDescription(e.target.value);
    });
  }
}

function updateContactRoleDescription(role) {
  const descEl = document.getElementById('contact-role-description');
  if (descEl && ROLE_DEFINITIONS[role]) {
    descEl.textContent = ROLE_DEFINITIONS[role].desc;
  }
}
window.updateContactRoleDescription = updateContactRoleDescription;

function formatPhoneDisplay(phone) {
  if (!phone) return '-';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 13 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  } else if (clean.length === 12 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  } else if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  } else if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

async function fetchContacts() {
  const tbody = document.getElementById('contacts-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/contacts');
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      allContacts = data.data;
      renderContacts(allContacts);
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 24px; text-align: center; color: var(--color-coral);">
            Erro ao carregar contatos: ${data.error || 'Falha desconhecida'}
          </td>
        </tr>
      `;
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 24px; text-align: center; color: var(--color-coral);">
            Falha na conexão com a API de contatos.
          </td>
        </tr>
      `;
    }
  }
}
window.fetchContacts = fetchContacts;

function renderContacts(list) {
  const tbody = document.getElementById('contacts-tbody');
  const countBadge = document.getElementById('contacts-count-badge');
  if (!tbody) return;

  if (countBadge) {
    const activeCount = list.filter(c => c.isActive).length;
    countBadge.textContent = `${list.length} cadastrado${list.length !== 1 ? 's' : ''} (${activeCount} ativo${activeCount !== 1 ? 's' : ''})`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 32px; text-align: center; color: var(--text-dim);">
          <div style="font-size: 1rem; margin-bottom: 6px; font-weight: 500;">Nenhum contato autorizado encontrado.</div>
          <button class="btn btn-primary btn-sm" onclick="openCreateContactModal()" style="margin-top: 8px;">
            <i class="fa-solid fa-user-plus"></i> Autorizar Primeiro Contato
          </button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const roleInfo = ROLE_DEFINITIONS[c.role] || {
      name: c.role,
      badgeClass: 'role-VIEWER',
      icon: 'fa-solid fa-user',
      desc: ''
    };

    const initials = (c.name || 'U')
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const formattedPhone = formatPhoneDisplay(c.phone);
    const waLink = `https://wa.me/${c.phone.replace(/\D/g, '')}`;

    return `
      <tr style="opacity: ${c.isActive ? '1' : '0.65'}; transition: opacity 0.2s;">
        <td>
          <div class="contact-user-cell">
            <div class="contact-avatar ${roleInfo.badgeClass}">${initials}</div>
            <div>
              <div class="contact-info-title">${escapeHtml(c.name)}</div>
              <small style="color: var(--text-dim); font-size: 0.74rem;">Cadastrado em ${new Date(c.createdAt).toLocaleDateString('pt-BR')}</small>
            </div>
          </div>
        </td>
        <td>
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="contact-phone-link" title="Abrir conversa no WhatsApp">
            <i class="fa-brands fa-whatsapp" style="color: #25D366;"></i> ${formattedPhone}
          </a>
        </td>
        <td>
          <span class="badge-role ${roleInfo.badgeClass}" title="${escapeHtml(roleInfo.desc)}">
            <i class="${roleInfo.icon}"></i> ${escapeHtml(roleInfo.name)}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <label class="custom-switch" style="transform: scale(0.85); transform-origin: left center;" title="${c.isActive ? 'Clique para Bloquear/Desativar' : 'Clique para Ativar'}">
              <input type="checkbox" ${c.isActive ? 'checked' : ''} onchange="toggleContactStatus('${c.id}')">
              <span class="slider"></span>
            </label>
            <span class="${c.isActive ? 'contact-status-active' : 'contact-status-blocked'}">
              <i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> ${c.isActive ? 'Autorizado' : 'Bloqueado'}
            </span>
          </div>
        </td>
        <td>
          <div style="max-width: 260px; line-height: 1.35;">
            ${c.briefing ? `<div style="font-size: 0.8rem; color: var(--color-ink); font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 2px;" title="Briefing para IA: ${escapeHtml(c.briefing)}"><i class="fa-solid fa-brain" style="color: var(--color-amber); font-size: 0.72rem; margin-right: 4px;"></i>${escapeHtml(c.briefing)}</div>` : ''}
            <div style="font-size: 0.76rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(c.notes || '-')}">${escapeHtml(c.notes || (c.briefing ? '' : 'Sem notas'))}</div>
          </div>
        </td>
        <td style="text-align: right;">
          <div class="contact-actions-cell">
            <button class="btn btn-secondary btn-xs" onclick="openEditContactModal('${c.id}')" title="Editar contato">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-secondary btn-xs" onclick="deleteContact('${c.id}', '${escapeHtml(c.name)}')" title="Remover contato" style="color: var(--color-coral);">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterContactsList() {
  const searchInput = document.getElementById('contacts-search-input');
  const roleSelect = document.getElementById('contacts-role-filter');

  const query = (searchInput?.value || '').trim().toLowerCase();
  const selectedRole = roleSelect?.value || 'ALL';

  const filtered = allContacts.filter(c => {
    const matchQuery = !query ||
      c.name.toLowerCase().includes(query) ||
      c.phone.includes(query) ||
      (c.briefing && c.briefing.toLowerCase().includes(query)) ||
      (c.notes && c.notes.toLowerCase().includes(query));

    const matchRole = selectedRole === 'ALL' || c.role === selectedRole;
    return matchQuery && matchRole;
  });

  renderContacts(filtered);
}
window.filterContactsList = filterContactsList;

function openCreateContactModal() {
  document.getElementById('modal-contact-title').textContent = 'Autorizar Contato na Victoria';
  document.getElementById('contact-id').value = '';
  document.getElementById('contact-name').value = '';
  document.getElementById('contact-phone').value = '';
  document.getElementById('contact-role').value = 'ADMIN';
  document.getElementById('contact-briefing').value = '';
  document.getElementById('contact-notes').value = '';
  document.getElementById('contact-is-active').checked = true;
  updateContactRoleDescription('ADMIN');

  openModal('modal-contact');
}
window.openCreateContactModal = openCreateContactModal;

function openEditContactModal(id) {
  const contact = allContacts.find(c => c.id === id);
  if (!contact) return;

  document.getElementById('modal-contact-title').textContent = 'Editar Contato Autorizado';
  document.getElementById('contact-id').value = contact.id;
  document.getElementById('contact-name').value = contact.name;
  document.getElementById('contact-phone').value = contact.phone;
  document.getElementById('contact-role').value = contact.role;
  document.getElementById('contact-briefing').value = contact.briefing || '';
  document.getElementById('contact-notes').value = contact.notes || '';
  document.getElementById('contact-is-active').checked = contact.isActive;
  updateContactRoleDescription(contact.role);

  openModal('modal-contact');
}
window.openEditContactModal = openEditContactModal;

async function handleSaveContact(event) {
  if (event && event.preventDefault) event.preventDefault();

  const id = document.getElementById('contact-id').value;
  const name = document.getElementById('contact-name').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const role = document.getElementById('contact-role').value;
  const briefing = document.getElementById('contact-briefing').value.trim();
  const notes = document.getElementById('contact-notes').value.trim();
  const isActive = document.getElementById('contact-is-active').checked;

  if (!name || !phone) {
    showToast('Preencha o Nome e o Número de WhatsApp.', 'error');
    return;
  }

  const btnSubmit = document.getElementById('btn-submit-contact');
  if (btnSubmit) btnSubmit.disabled = true;

  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/contacts/${id}` : '/api/contacts';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, role, briefing, notes, isActive })
    });

    const data = await res.json();
    if (data.success) {
      showToast(id ? 'Contato atualizado com sucesso!' : 'Novo contato autorizado com sucesso!', 'success');
      closeModal('modal-contact');
      await fetchContacts();
    } else {
      showToast(`Erro ao salvar: ${data.error || 'Falha desconhecida'}`, 'error');
    }
  } catch (err) {
    showToast(`Erro de conexão: ${err.message}`, 'error');
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
}
window.handleSaveContact = handleSaveContact;

async function toggleContactStatus(id) {
  try {
    const res = await fetch(`/api/contacts/${id}/toggle`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      showToast(`Status de ${data.data.name} alterado com sucesso!`, 'success');
      await fetchContacts();
    } else {
      showToast(`Erro: ${data.error}`, 'error');
      await fetchContacts();
    }
  } catch (err) {
    showToast(`Erro de conexão: ${err.message}`, 'error');
    await fetchContacts();
  }
}
window.toggleContactStatus = toggleContactStatus;

async function deleteContact(id, name) {
  if (!confirm(`Deseja realmente revogar a autorização e remover "${name}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`Contato "${name}" removido com sucesso.`, 'success');
      await fetchContacts();
    } else {
      showToast(`Erro ao remover: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Erro ao remover contato: ${err.message}`, 'error');
  }
}
window.deleteContact = deleteContact;








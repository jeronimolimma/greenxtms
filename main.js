// --- INICIALIZAÇÃO DA APLICAÇÃO ---

function initApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    const user = window.db.currentUser;
    const displayName = user.name ? `${user.name} ${user.surname || ''}`.trim() : user.user;
    document.getElementById('display-username').innerText = displayName;
    
    // Atualizar foto no header
    const headerAvatar = document.getElementById('header-user-avatar');
    const photoSrc = user.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;
    headerAvatar.src = photoSrc;
    headerAvatar.style.display = 'block';

    applyAccessControl();
    checkNotifications(); // Inicia verificação de notificações
    if (user.role === 'operacional') {
        navigate('fretes');
    } else {
        navigate('dashboard');
    }
}

function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

function getNotificationData() {
    const today = new Date().toISOString().split('T')[0];
    let notifications = [];

    // 1. Verificar Fretes Atrasados
    const overdue = window.db.freights.filter(f => f.deliveryDate && f.deliveryDate < today && f.status !== 'Entregue');
    overdue.forEach(f => {
        notifications.push({
            id: `overdue_${f.id}`,
            type: 'alert',
            title: 'Entrega Atrasada',
            message: `CTE ${f.id} venceu em ${new Date(f.deliveryDate).toLocaleDateString('pt-BR')}`,
            action: `closeModal(); navigate('fretes'); openModal('modal-frete', '${f.id}')`,
            time: 'Atenção'
        });
    });

    // 2. Verificar Usuários Pendentes (Apenas Admin)
    const user = window.db.currentUser;
    const role = user ? (user.role || 'admin') : 'operacional';

    if (role === 'admin') {
        const pendingUsers = window.db.users.filter(u => u.approved === false);
        if (pendingUsers.length > 0) {
            notifications.push({
                id: `pending_users_${pendingUsers.map(u => u.id).sort().join('_')}`, // ID único baseado na lista exata de usuários pendentes
                type: 'alert',
                title: 'Novos Usuários',
                message: `${pendingUsers.length} cadastro(s) aguardando aprovação.`,
                action: `navigate('perfil')`,
                time: 'Ação Necessária'
            });
        }
    }
    return notifications;
}

function checkNotifications() {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notification-badge');
    
    const notifications = getNotificationData();
    const readList = JSON.parse(localStorage.getItem('tms_read_notifications') || '[]');

    // Filtra apenas as não lidas para o contador (badge) e som
    const unreadNotifications = notifications.filter(n => !readList.includes(n.id));

    // Verificar se há novas notificações CRÍTICAS para tocar som
    const criticalCount = unreadNotifications.filter(n => n.type === 'alert').length;
    const lastCriticalCount = parseInt(localStorage.getItem('tms_notif_critical_count') || '0');

    if (criticalCount > lastCriticalCount) {
        playNotificationSound();
    }
    localStorage.setItem('tms_notif_count', unreadNotifications.length);
    localStorage.setItem('tms_notif_critical_count', criticalCount);

    // Renderizar
    if (unreadNotifications.length > 0) {
        badge.innerText = unreadNotifications.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    // Renderizar Lista (Mostra todas, mas diferencia visualmente as lidas)
    if (notifications.length > 0) {
        list.innerHTML = notifications.map(n => {
            const isRead = readList.includes(n.id);
            const opacityStyle = isRead ? 'opacity: 0.5;' : '';
            const icon = n.type === 'alert' ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i>' : '<i class="fa-solid fa-info-circle"></i>';
            
            return `
            <div class="notification-item ${n.type}" onclick="${n.action || ''}" style="${opacityStyle}">
                <span class="notification-title">
                    ${icon} ${n.title}
                </span>
                <span class="notification-desc">${n.message}</span>
                <span class="notification-time">${n.time}</span>
            </div>
        `}).join('');
    } else {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-light); font-size: 0.9rem;"><i class="fa-regular fa-bell-slash" style="font-size: 1.5rem; margin-bottom: 10px; display:block;"></i>Nenhuma notificação nova.</div>';
    }
}

function markAllAsRead() {
    const notifications = getNotificationData();
    const allIds = notifications.map(n => n.id);
    
    // Mesclar com as já lidas para não perder histórico antigo se necessário
    const currentRead = JSON.parse(localStorage.getItem('tms_read_notifications') || '[]');
    const newRead = [...new Set([...currentRead, ...allIds])];
    
    localStorage.setItem('tms_read_notifications', JSON.stringify(newRead));
    checkNotifications(); // Atualiza a UI
}

function playNotificationSound() {
    // Verificar preferência do usuário (padrão true se undefined)
    if (window.db.currentUser && window.db.currentUser.notificationSound === false) return;

    // Som suave de notificação ("Ding")
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log("Autoplay de áudio bloqueado:", e));
}

function toggleNotifications() {
    const dropdown = document.getElementById('notification-dropdown');
    dropdown.classList.toggle('hidden');
    
    // Atualiza ao abrir
    if (!dropdown.classList.contains('hidden')) checkNotifications();
}

function applyAccessControl() {
    const user = window.db.currentUser;
    const role = user.role || 'admin'; // Padrão admin para compatibilidade

    // Mapeamento de quais menus cada role pode ver
    // Se não estiver na lista, esconde. Admin vê tudo.
    const allowedMenus = {
        'admin': ['dashboard', 'fretes', 'clientes', 'faturamento', 'pagamentos', 'rastreio', 'perfil'],
        'financeiro': ['dashboard', 'faturamento', 'pagamentos', 'fretes', 'clientes', 'perfil'],
        'operacional': ['fretes', 'clientes', 'rastreio', 'perfil']
    };

    const allowed = allowedMenus[role] || allowedMenus['operacional'];

    document.querySelectorAll('.sidebar li').forEach(li => {
        const onclickAttr = li.getAttribute('onclick');
        if (onclickAttr) {
            const viewId = onclickAttr.match(/'([^']+)'/)[1];
            if (allowed.includes(viewId)) {
                li.classList.remove('hidden');
            } else {
                li.classList.add('hidden');
            }
        }
    });
}

function navigate(viewId) {
    // Verificação de Segurança na Navegação
    const user = window.db.currentUser;
    const role = user.role || 'admin';
    
    const restrictedViews = {
        'dashboard': ['admin', 'financeiro'],
        'faturamento': ['admin', 'financeiro'],
        'pagamentos': ['admin', 'financeiro'],
        'rastreio': ['admin', 'operacional'],
        'fretes': ['admin', 'operacional', 'financeiro'], // Financeiro vê lista, mas Operacional lança
        'clientes': ['admin', 'operacional', 'financeiro']
    };

    if (restrictedViews[viewId] && !restrictedViews[viewId].includes(role)) {
        alert("Acesso negado: Você não tem permissão para acessar esta área.");
        return;
    }

    // Atualizar menu ativo
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    
    const evt = window.event;
    if (evt && evt.currentTarget && evt.currentTarget.classList) {
        evt.currentTarget.classList.add('active');
    } else {
        const link = document.querySelector(`.sidebar li[onclick*="'${viewId}'"]`);
        if (link) link.classList.add('active');
    }

    // Esconder todas as seções
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    // Mostrar a desejada
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.remove('hidden');
    
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);

    // Carregar dados específicos da view
    if (viewId === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
    if (viewId === 'fretes' && typeof renderFretes === 'function') renderFretes();
    if (viewId === 'clientes' && typeof renderClientes === 'function') renderClientes();
    if (viewId === 'faturamento' && typeof renderFaturamento === 'function') renderFaturamento();
    if (viewId === 'pagamentos' && typeof renderPagamentos === 'function') renderPagamentos();
    if (viewId === 'rastreio' && typeof renderRastreio === 'function') renderRastreio();
    if (viewId === 'perfil' && typeof renderProfile === 'function') renderProfile();

    // Fechar menu mobile se estiver aberto
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }
}

// --- MONITORAMENTO DE AUTH ---
if (window.auth) {
    window.auth.onAuthStateChanged((user) => {
        if (user) {
            // Usuário logado: Carrega DB e inicia App
            loadDb().then(() => {
                // Define o usuário atual localmente
                if (!window.db.users) window.db.users = [];
                
                let currentUser = window.db.users.find(u => u.email === user.email);
                
                // Se não achar o perfil local, cria um temporário
                if (!currentUser) {
                    currentUser = { id: Date.now(), user: user.email.split('@')[0], email: user.email, pass: '***', photo: null, approved: false };
                    window.db.users.push(currentUser);
                }

                // VERIFICAÇÃO DE APROVAÇÃO
                if (currentUser.approved === false) {
                    alert("Seu cadastro aguarda aprovação do administrador.");
                    window.auth.signOut();
                    document.getElementById('loading-overlay').classList.add('hidden');
                    return;
                }
                
                window.db.currentUser = currentUser;
                initApp();
            });
        } else {
            // Usuário deslogado
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('app-screen').classList.add('hidden');
            document.getElementById('loading-overlay').classList.add('hidden');
        }
    });
} else {
    // Fallback se Firebase não estiver ativo
    loadDb();
}

// --- GESTOS DE SWIPE (MOBILE) ---
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const swipeThreshold = 100; // Distância mínima para considerar swipe
    const edgeThreshold = 50; // Área da borda esquerda para iniciar swipe de abertura

    // Swipe Direita (Abrir Menu) - Apenas se começar na borda esquerda
    if (touchEndX > touchStartX + swipeThreshold && touchStartX < edgeThreshold) {
        if (!sidebar.classList.contains('active')) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        }
    }
    // Swipe Esquerda (Fechar Menu)
    if (touchEndX < touchStartX - swipeThreshold) {
        if (sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
    }
}

function validatePhone(phone) {
    if (!phone) return true; // Not required, so if it's empty, it's valid.
    const cleanPhone = phone.replace(/\D/g, '');
    return cleanPhone.length >= 10 && cleanPhone.length <= 11;
}

function inputMaskPhone(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
    v = v.replace(/(\d)(\d{4})$/, '$1-$2');
    input.value = v.slice(0, 15); // (XX) XXXXX-XXXX
}

function inputMaskDoc(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length <= 11) { // CPF
        v = v.replace(/(\d{3})(\d)/, '$1.$2');
        v = v.replace(/(\d{3})(\d)/, '$1.$2');
        v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else { // CNPJ
        v = v.replace(/^(\d{2})(\d)/, '$1.$2');
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
    }
    input.value = v.slice(0, 18);
}

function openModal(modalId, editId = null) {
    // Criação dinâmica simples de modal para adicionar dados
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');
    
    let content = '';
    if (modalId === 'modal-frete') {
        // Se for edição, busca os dados
        let data = {};
        if (editId && editId !== 'null') {
            data = window.db.freights.find(f => f.id === editId) || {};
        }

        // Formatar data para o input type="date" (YYYY-MM-DD)
        const shippingDateValue = data.shippingDate ? data.shippingDate.split('T')[0] : '';
        const deliveryDateValue = data.deliveryDate ? data.deliveryDate.split('T')[0] : '';

        // Função para buscar os dados do CEP
        async function buscarEndereco(cep) {
            // Remove caracteres não numéricos
            cep = cep.replace(/\D/g, '');
        
            // Verifica se o CEP tem o formato correto
            if (cep.length !== 8) {
                alert('CEP inválido.');
                return;
            }
        
            const url = `https://viacep.com.br/ws/${cep}/json/`;
        
            try {
                const response = await fetch(url);
                const data = await response.json();
        
                if (!data.erro) {
                    document.getElementById('new-frete-endereco').value = data.logradouro;
                    document.getElementById('new-frete-bairro').value = data.bairro;
                    document.getElementById('new-frete-cidade').value = data.localidade;
                    document.getElementById('new-frete-uf').value = data.uf;
                } else {
                    alert('CEP não encontrado.');
                }
            } catch (error) {
                alert('Erro ao buscar o CEP.');
            }
        }
        const packagingOptions = [
            'Caixa de papelão', 'Bombona Plastica', 'Caixa de isopor', 
            'Caixa plastica', 'Pallet', 'Saca', 'Outros'
        ];
        const packagingSelectHtml = packagingOptions.map(opt => `<option value="${opt}" ${data.tipoEmbalagem === opt ? 'selected' : ''}>${opt}</option>`).join('');

        const clientOptions = window.db.clients.map(c => 
            `<option value="${c.id}" ${data.clientId == c.id ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        // Gerar campos de agentes (5 campos fixos)
        let agentesHtml = '';
        for (let i = 0; i < 5; i++) {
            const agente = (data.agentes && data.agentes[i]) ? data.agentes[i] : { nome: '', valor: '' };
            agentesHtml += `
                <div class="agent-row">
                    <input type="text" id="agent-name-${i}" placeholder="Nome do Agente ${i+1}" value="${agente.nome}">
                    <input type="number" step="0.01" id="agent-val-${i}" placeholder="Valor (R$)" value="${agente.valor}">
                </div>
            `;
        }

        const medidas = data.medidas || { l: '', w: '', h: '' };
        const isEdit = !!editId;

        content = `
            <div class="modal">
                <span class="close-modal" onclick="closeModal()">&times;</span>
                <h3>${isEdit ? 'Editar Pedido' : 'Novo Pedido de Frete'}</h3>
                <input type="hidden" id="edit-frete-id" value="${editId && editId !== 'null' ? editId : ''}">
                
                <h4>Dados Gerais</h4>
                <div class="input-group">
                    <label>Cliente</label>
                    <select id="new-frete-client">${clientOptions}</select>
                </div>
                <div class="input-group">
                    <label>CTE Interna / Ref.</label>
                    <input type="text" id="new-frete-internal-ref" value="${data.internalRef || ''}">
                </div>
                <div class="input-group">
                    <label>Data de Envio</label>
                    <input type="date" id="new-frete-shipping-date" value="${shippingDateValue}">
                </div>
                <div class="input-group">
                    <label>Data de Entrega</label>
                    <input type="date" id="new-frete-delivery-date" value="${deliveryDateValue}">
                </div>
                <div class="input-group">
                    <label>Remetente</label>
                    <input type="text" id="new-frete-remetente" value="${data.remetente || ''}">
                </div>
                <div class="input-group">
                    <label>Destinatário</label>
                    <input type="text" id="new-frete-destinatario" value="${data.destinatario || ''}">
                </div>

                <h4>Endereço de Entrega</h4>
                <div class="input-group"><label>Endereço</label><input type="text" id="new-frete-endereco" value="${data.endereco || ''}"></div>
                <div class="input-group"><label>Bairro</label><input type="text" id="new-frete-bairro" value="${data.bairro || ''}"></div>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px;">
                    <div class="input-group"><label>Cidade</label><input type="text" id="new-frete-cidade" value="${data.cidade || ''}"></div>
                    <div class="input-group"><label>UF</label><input type="text" id="new-frete-uf" maxlength="2" value="${data.uf || ''}"></div>
                </div>
                <div class="input-group"><label>CEP</label><input type="text" id="new-frete-cep" value="${data.cep || ''}" onblur="buscarEndereco(this.value)"></div>
                <div class="input-group"><label>Complemento</label><input type="text" id="new-frete-complemento" value="${data.complemento || ''}" /></div>
                <div class="input-group"><label>Telefone</label><input type="text" id="new-frete-telefone" value="${data.telefone || ''}" oninput="inputMaskPhone(this)" /></div>

                <h4>Carga</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="input-group">
                        <label>Tipo de Embalagem</label>
                        <select id="new-frete-embalagem">${packagingSelectHtml}</select>
                    </div>
                    <div class="input-group">
                        <label>Qtd. Volumes</label>
                        <input type="number" id="new-frete-qtd-vol" value="${data.volume || 1}" onkeyup="calculateModalValues()" onchange="calculateModalValues()">
                    </div>
                </div>
                <div class="input-group" style="display: flex; gap: 20px; margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                        <input type="checkbox" id="new-frete-perecivel" ${data.isPerishable ? 'checked' : ''}> Produto Perecível
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                        <input type="checkbox" id="new-frete-fragil" ${data.isFragile ? 'checked' : ''}> Produto Frágil
                    </label>
                </div>
                <div class="input-group">
                    <label>Medidas Unitárias (L x W x H em metros)</label>
                    <div style="display: flex; gap: 5px;">
                        <input type="number" step="0.01" id="new-frete-l" placeholder="Compr." value="${medidas.l}" onkeyup="calculateModalValues()">
                        <input type="number" step="0.01" id="new-frete-w" placeholder="Larg." value="${medidas.w}" onkeyup="calculateModalValues()">
                        <input type="number" step="0.01" id="new-frete-h" placeholder="Alt." value="${medidas.h}" onkeyup="calculateModalValues()">
                    </div>
                </div>
                <div class="input-group">
                    <label>Peso da Carga (kg)</label>
                    <input type="number" step="0.1" id="new-frete-peso" value="${data.peso || ''}">
                </div>
                <div class="input-group">
                    <label>Cálculo de Cubagem (kg)</label>
                    <input type="text" id="new-frete-cubagem" value="${data.cubagem || ''}" readonly>
                </div>

                <h4>Valores e Custos</h4>
                <div class="input-group">
                    <label>Valor da Nota Fiscal (R$)</label>
                    <input type="number" step="0.01" id="new-frete-nf" value="${data.valorNF || ''}">
                </div>
                <div class="input-group">
                    <label>Valor do Seguro (R$)</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="number" step="0.01" id="new-frete-seguro" value="${data.valorSeguro || ''}" style="flex-grow: 1;">
                        <button type="button" class="btn-secondary" onclick="calculateSeguro()" style="padding: 8px 12px;">Calcular</button>
                    </div>
                </div>
                
                <div class="input-group">
                    <label>Agentes / Parceiros (Nome e Valor Negociado)</label>
                    ${agentesHtml}
                </div>

                <div class="input-group">
                    <label>Valor do Frete (a cobrar) (R$)</label>
                    <input type="number" step="0.01" id="new-frete-valor" value="${data.valor || ''}">
                </div>

                <div class="input-group">
                    <label>Observação Interna</label>
                    <textarea id="new-frete-obs" rows="3" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:5px; background-color: var(--card-bg); color: var(--text-dark); outline: none; font-family: inherit;">${data.internalObs || ''}</textarea>
                </div>

                <h4>Flags</h4>
                <div class="input-group" style="display: flex; align-items: center; gap: 20px;">
                    <label><input type="checkbox" id="new-frete-coleta" ${data.coleta ? 'checked' : ''}> Coleta</label>
                    <label><input type="checkbox" id="new-frete-entrega" ${data.entrega !== false ? 'checked' : ''}> Entrega</label>
                </div>
                
                <button class="btn-primary" onclick="saveFrete()">${isEdit ? 'Salvar Alterações' : 'Criar Pedido'}</button>
            </div>
        `;
    } else if (modalId === 'modal-cliente') {
        let data = {};
        if (editId) {
            data = window.db.clients.find(c => c.id === editId) || {};
        }

        content = `
            <div class="modal">
                <span class="close-modal" onclick="closeModal()">&times;</span>
                <h3>${editId ? 'Editar Cliente' : 'Novo Cliente'}</h3>
                <input type="hidden" id="edit-client-id" value="${editId || ''}">
                
                <div class="input-group"><label>Nome</label><input type="text" id="new-cli-name" value="${data.name || ''}"></div>
                <div class="input-group"><label>CNPJ</label><input type="text" id="new-cli-cnpj" value="${data.cnpj || ''}" oninput="inputMaskDoc(this)"></div>
                <div class="input-group"><label>Telefone</label><input type="text" id="new-cli-phone" value="${data.phone || ''}" oninput="inputMaskPhone(this)"></div>
                <div class="input-group"><label>Cidade</label><input type="text" id="new-cli-city" value="${data.city || ''}"></div>
                <button class="btn-primary" onclick="saveCliente()">${editId ? 'Salvar Alterações' : 'Salvar'}</button>
            </div>
        `;
    } else if (modalId === 'modal-user') {
        let data = {};
        if (editId) {
            data = window.db.users.find(u => u.id === editId) || {};
        }
        
        const role = data.role || 'operacional';

        content = `
            <div class="modal">
                <span class="close-modal" onclick="closeModal()">&times;</span>
                <h3>${editId ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                <input type="hidden" id="edit-user-id" value="${editId || ''}">
                <div class="input-group"><label>Login</label><input type="text" id="new-user-login" value="${data.user || ''}"></div>
                <div class="input-group"><label>Senha</label><input type="password" id="new-user-pass" value="${data.pass || ''}"></div>
                <div class="input-group"><label>Função / Permissão</label>
                    <select id="new-user-role">
                        <option value="admin" ${role === 'admin' ? 'selected' : ''}>Administrador (Acesso Total)</option>
                        <option value="financeiro" ${role === 'financeiro' ? 'selected' : ''}>Financeiro (Faturamento/Pagamentos)</option>
                        <option value="operacional" ${role === 'operacional' ? 'selected' : ''}>Operacional (Fretes/Rastreio)</option>
                    </select>
                </div>
                <button class="btn-primary" onclick="saveUser()">${editId ? 'Salvar' : 'Criar'}</button>
            </div>
        `;
    } else if (modalId === 'modal-payment') {
        const [fid, idxStr] = editId.split('|');
        const idx = parseInt(idxStr);
        const f = window.db.freights.find(item => item.id == fid);
        const agente = f ? f.agentes[idx] : { nome: '', valor: 0 };

        content = `
            <div class="modal">
                <span class="close-modal" onclick="closeModal()">&times;</span>
                <h3>Editar Pagamento</h3>
                <input type="hidden" id="edit-payment-id" value="${editId}">
                <div class="input-group"><label>Agente/Parceiro</label><input type="text" id="edit-payment-name" value="${agente.nome}"></div>
                <div class="input-group"><label>Valor (R$)</label><input type="number" step="0.01" id="edit-payment-val" value="${agente.valor}"></div>
                <div class="input-group"><label>Status</label>
                    <select id="edit-payment-status">
                        <option value="Pendente" ${agente.status !== 'Pago' ? 'selected' : ''}>Pendente</option>
                        <option value="Pago" ${agente.status === 'Pago' ? 'selected' : ''}>Pago</option>
                    </select>
                </div>
                <button class="btn-primary" onclick="savePayment()">Salvar</button>
            </div>
        `;
    }
    overlay.innerHTML = content;
}

function saveFrete() {
    const editId = document.getElementById('edit-frete-id').value;
    
    // Preservar dados existentes se for edição (para manter status de pagamento dos agentes)
    let existingData = {};
    if (editId) {
        const found = window.db.freights.find(f => f.id === editId);
        if (found) existingData = found;
    }



    // Coletar Agentes
    const agentes = [];
    for (let i = 0; i < 5; i++) {
        const nome = document.getElementById(`agent-name-${i}`).value;
        const valor = parseFloat(document.getElementById(`agent-val-${i}`).value) || 0;
        if (nome || valor > 0) {
            // Validação básica de agente
            if (nome && !valor) {
                alert(`Informe o valor para o agente ${nome}`);
                return;
            }
            // Tenta manter o status se o agente já existia (pelo nome)
            let status = 'Pendente';
            if (existingData.agentes) {
                const existingAgent = existingData.agentes.find(a => a.nome === nome);
                if (existingAgent && existingAgent.status) status = existingAgent.status;
            }
            agentes.push({ nome, valor, status });
        }
    }

    const newFreight = {
        id: editId ? editId : generateCTE(),
        date: existingData.date || new Date().toISOString(),
        internalRef: document.getElementById('new-frete-internal-ref').value || '',
        internalObs: document.getElementById('new-frete-obs').value || '',
        deliveryDate: document.getElementById('new-frete-delivery-date').value || null,
        shippingDate: document.getElementById('new-frete-shipping-date').value || null,
        clientId: document.getElementById('new-frete-client').value,
        remetente: document.getElementById('new-frete-remetente').value,
        destinatario: document.getElementById('new-frete-destinatario').value,
        endereco: document.getElementById('new-frete-endereco').value,
        bairro: document.getElementById('new-frete-bairro').value,
        cidade: document.getElementById('new-frete-cidade').value,
        uf: document.getElementById('new-frete-uf').value.toUpperCase(),
        cep: document.getElementById('new-frete-cep').value,
        complemento: document.getElementById('new-frete-complemento').value,
        telefone: document.getElementById('new-frete-telefone').value,
        tipoEmbalagem: document.getElementById('new-frete-embalagem').value,
        medidas: {
            l: parseFloat(document.getElementById('new-frete-l').value) || 0,
            w: parseFloat(document.getElementById('new-frete-w').value) || 0,
            h: parseFloat(document.getElementById('new-frete-h').value) || 0,
        },
        peso: parseFloat(document.getElementById('new-frete-peso').value) || 0,
        volume: parseInt(document.getElementById('new-frete-qtd-vol').value) || 1,
        cubagem: parseFloat(document.getElementById('new-frete-cubagem').value) || 0,
        valorNF: parseFloat(document.getElementById('new-frete-nf').value) || 0,
        valorSeguro: parseFloat(document.getElementById('new-frete-seguro').value) || 0,
        agentes: agentes,
        isPerishable: document.getElementById('new-frete-perecivel').checked,
        isFragile: document.getElementById('new-frete-fragil').checked,
        valor: parseFloat(document.getElementById('new-frete-valor').value) || 0,
        coleta: document.getElementById('new-frete-coleta').checked,
        entrega: document.getElementById('new-frete-entrega').checked,
        trackingHistory: existingData.trackingHistory || [], // Preserva histórico
        attachments: existingData.attachments || [] // Preserva anexos
    };

    // Basic validation
    if (!newFreight.clientId || !newFreight.remetente || !newFreight.destinatario || !newFreight.valor) {
        alert('Preencha os campos obrigatórios: Cliente, Remetente, Destinatário e Valor do Frete.');
        return;
    }

    // Validação de Telefone do Frete
    if (newFreight.telefone) {
        if (!validatePhone(newFreight.telefone)) {
            alert('Telefone de contato inválido. Informe DDD + Número (10 ou 11 dígitos).');
            return;
        }
    }

    // Validação de Datas (Entrega vs Envio)
    if (newFreight.shippingDate && newFreight.deliveryDate) {
        if (newFreight.deliveryDate < newFreight.shippingDate) {
            alert('A data de entrega não pode ser anterior à data de envio.');
            return;
        }
    }

    if (editId) {
        const idx = window.db.freights.findIndex(f => f.id === editId);
        if (idx !== -1) {
            newFreight.status = window.db.freights[idx].status; 
            window.db.freights[idx] = newFreight;

            // Log de Atividade (Edição)
            if (!window.db.auditLog) window.db.auditLog = [];
            window.db.auditLog.push({
                date: new Date().toISOString(),
                action: 'Edição de Frete',
                adminUser: window.db.currentUser.user,
                details: `Usuário '${window.db.currentUser.user}' editou o frete CTE ${editId}.`
            });
        }
    } else {
        newFreight.status = 'Pendente';
        window.db.freights.push(newFreight);

        // Log de Atividade (Criação)
        if (!window.db.auditLog) window.db.auditLog = [];
        window.db.auditLog.push({
            date: new Date().toISOString(),
            action: 'Criação de Frete',
            adminUser: window.db.currentUser.user,
            details: `Usuário '${window.db.currentUser.user}' criou o frete CTE ${newFreight.id}.`
        });
    }

    saveDb();
    closeModal();
    checkNotifications(); // Atualiza notificações após salvar
    renderFretes();
}


function savePayment() {
    const editId = document.getElementById('edit-payment-id').value;
    const [fid, idxStr] = editId.split('|');
    const idx = parseInt(idxStr);
    
    const nome = document.getElementById('edit-payment-name').value;
    const valor = parseFloat(document.getElementById('edit-payment-val').value);
    const status = document.getElementById('edit-payment-status').value;

    const f = window.db.freights.find(item => item.id == fid);
    if (f && f.agentes && f.agentes[idx]) {
        f.agentes[idx].nome = nome;
        f.agentes[idx].valor = valor;
        f.agentes[idx].status = status;
        saveDb();
        closeModal();
        renderPagamentos();
    }
}
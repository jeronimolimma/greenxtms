const FATOR_CUBAGEM = 300; // Fator de cubagem padrão (kg/m³)
const SEGURO_TAXA = 0.005; // 0.5% sobre o valor da NF
const ITEMS_PER_PAGE = 5; // Itens por página
let currentPage = 1;

// --- HELPERS ESPECÍFICOS ---
function getFreightTotalCost(freight) {
    const totalAgentes = freight.agentes ? freight.agentes.reduce((sum, a) => sum + (a.valor || 0), 0) : 0;
    return totalAgentes + (freight.valorSeguro || 0);
}

function generateCTE() {
    window.db.lastCteSequence = (window.db.lastCteSequence || 0) + 1;
    return 'VIO' + String(window.db.lastCteSequence).padStart(9, '0');
}

function copyTrackingLink(id) {
    // Gera a URL absoluta baseada na localização atual
    const url = new URL('tracking.html', window.location.href);
    url.searchParams.set('id', id);
    
    navigator.clipboard.writeText(url.toString()).then(() => {
        alert('Link de rastreamento copiado para a área de transferência!');
    }).catch(err => {
        prompt("Copie o link manualmente:", url.toString());
    });
}

function shareWhatsApp(id) {
    const url = new URL('tracking.html', window.location.href);
    url.searchParams.set('id', id);
    const text = `Olá! Acompanhe o status da sua encomenda ${id} pelo link: ${url.toString()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function openExternalTracking(id) {
    const url = new URL('tracking.html', window.location.href);
    url.searchParams.set('id', id);
    window.open(url.toString(), '_blank');
}

// --- FRETES ---

function renderFretes() {
    const tbody = document.getElementById('fretes-table-body');
    tbody.innerHTML = '';
    
    // Controle de Permissões (Botão Novo Frete)
    const user = window.db.currentUser;
    const role = user.role || 'admin';
    const btnNew = document.getElementById('btn-new-freight');
    const fabNew = document.getElementById('fab-new-freight');

    if (btnNew) {
        // Apenas Admin e Operacional podem lançar fretes
        const canCreate = ['admin', 'operacional'].includes(role);
        btnNew.classList.toggle('hidden', !canCreate);
        if (fabNew) fabNew.classList.toggle('hidden', !canCreate);
    }

    // 1. Filtrar dados
    const searchTerm = document.getElementById('fretes-search-input')?.value.toLowerCase() || '';
    const statusFilterEl = document.querySelector('#mobile-status-filter .active');
    const statusFilter = statusFilterEl ? statusFilterEl.dataset.status : 'all';

    const filteredFreights = window.db.freights.filter(f => {
        const searchMatch = (() => {
            if (!searchTerm) return true;
            const client = window.db.clients.find(c => c.id == f.clientId)?.name.toLowerCase() || '';
            const route = `${f.remetente || ''} ${f.destinatario || ''}`.toLowerCase();
            return f.id.toLowerCase().includes(searchTerm) ||
                   client.includes(searchTerm) ||
                   route.includes(searchTerm) ||
                   (f.internalRef && f.internalRef.toLowerCase().includes(searchTerm));
        })();

        const statusMatch = statusFilter === 'all' || f.status === statusFilter;

        return searchMatch && statusMatch;
    }).sort((a, b) => String(b.id).localeCompare(String(a.id))); // Mais recentes primeiro

    // 2. Totais (Calculados sobre os itens filtrados)
    let totalFreteCobrado = 0;
    let totalCustoOperacional = 0;

    filteredFreights.forEach(f => {
        const custoTotal = getFreightTotalCost(f);
        totalFreteCobrado += (f.valor || 0);
        totalCustoOperacional += custoTotal;
    });

    // 3. Paginação
    const totalPages = Math.ceil(filteredFreights.length / ITEMS_PER_PAGE);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const paginatedItems = filteredFreights.slice(start, end);

    // 4. Renderizar Itens da Página Atual
    paginatedItems.forEach(f => {
        const client = window.db.clients.find(c => c.id == f.clientId)?.name || 'N/A';
        const tr = document.createElement('tr');

        // Adiciona classe se a entrega estiver atrasada
        const today = new Date().toISOString().split('T')[0];
        const isOverdue = f.deliveryDate && f.deliveryDate < today && f.status !== 'Entregue';
        if (isOverdue) {
            tr.classList.add('overdue-row');
        }
        
        const custoTotal = getFreightTotalCost(f);
        const lucro = (f.valor || 0) - custoTotal;

        const shippingDate = f.shippingDate ? new Date(f.shippingDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-';
        const deliveryDate = f.deliveryDate ? new Date(f.deliveryDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-';

        let badgeClass = 'status-pendente';
        if(f.status === 'Em Trânsito') badgeClass = 'status-transito';
        if(f.status === 'Entregue') badgeClass = 'status-entregue';

        // Definir ações baseadas no perfil
        let actionsHtml = '';
        if (['admin', 'operacional'].includes(role)) {
            actionsHtml = `
                <button class="btn-success" title="Ver Detalhes" onclick="showDetails('${f.id}')" style="padding: 8px 12px;"><i class="fa-solid fa-eye"></i></button>
                <button class="btn-secondary" title="Duplicar Pedido" onclick="duplicateFreight('${f.id}')" style="padding: 8px 12px;"><i class="fa-solid fa-copy"></i></button>
                <button class="btn-primary" title="Editar Pedido" onclick="openModal('modal-frete', '${f.id}')" style="padding: 8px 12px;"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-warning" title="Atualizar Status" onclick="editStatus('${f.id}')" style="padding: 8px 12px;"><i class="fa-solid fa-rotate"></i></button>
                ${role === 'admin' ? `<button class="btn-danger" title="Excluir Pedido" onclick="deleteFreight('${f.id}')" style="padding: 8px 12px;"><i class="fa-solid fa-trash"></i></button>` : ''}
            `;
        } else {
            actionsHtml = `<button class="btn-success" title="Ver Detalhes" onclick="showDetails('${f.id}')" style="padding: 8px 12px;"><i class="fa-solid fa-eye"></i></button>`;
        }

        tr.innerHTML = `
            <td data-label="CTE">${f.id}</td>
            <td data-label="Cliente">${client}</td>
            <td data-label="Rota">${f.remetente || 'N/A'} -> ${f.destinatario || 'N/A'}</td>
            <td data-label="Envio">${shippingDate}</td>
            <td data-label="Prev. Entrega">${deliveryDate}</td>
            <td data-label="Valor" class="success">${formatCurrency(f.valor || 0)}</td>
            <td data-label="Custo" class="danger">${formatCurrency(custoTotal)}</td>
            <td data-label="Lucro">${formatCurrency(lucro)}</td>
            <td data-label="Status"><span class="status-badge ${badgeClass}">${f.status}</span></td>
            <td data-label="Ações">
                <div style="display: flex; gap: 5px;">${actionsHtml}</div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 5. Renderizar Rodapé (Totais e Paginação)
    const footerEl = document.getElementById('fretes-footer');
    if (footerEl) {
        const lucroTotal = totalFreteCobrado - totalCustoOperacional;
        footerEl.innerHTML = `
        <div class="footer-totals">
            <div>
                <span>Total Frete (Filtrado)</span>
                <p class="success">${formatCurrency(totalFreteCobrado)}</p>
            </div>
            <div>
                <span>Total Custo (Filtrado)</span>
                <p class="danger">${formatCurrency(totalCustoOperacional)}</p>
            </div>
            <div>
                <span>Lucro Total (Filtrado)</span>
                <p>${formatCurrency(lucroTotal)}</p>
            </div>
        </div>
        <div class="footer-pagination">
            <button class="btn-secondary" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
            <span>Página ${currentPage} de ${totalPages || 1}</span>
            <button class="btn-secondary" onclick="changePage(1)" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
        `;
    }
}

function changePage(delta) {
    currentPage += delta;
    renderFretes();
}

function editStatus(id) {
    const newStatus = prompt("Novo Status (Pendente, Em Trânsito, Entregue):");
    if (newStatus && ['Pendente', 'Em Trânsito', 'Entregue'].includes(newStatus)) {
        const freight = window.db.freights.find(f => f.id === id);
        if(freight) {
            const oldStatus = freight.status;
            freight.status = newStatus;
            
            // Log de Atividade
            if (!window.db.auditLog) window.db.auditLog = [];
            window.db.auditLog.push({
                date: new Date().toISOString(),
                action: 'Alteração de Status',
                adminUser: window.db.currentUser.user,
                details: `Usuário '${window.db.currentUser.user}' alterou status do CTE ${id} de '${oldStatus}' para '${newStatus}'.`
            });

            saveDb();
            renderFretes();
        }
    } else if (newStatus) {
        alert("Status inválido. Use: Pendente, Em Trânsito ou Entregue.");
    }
}

function deleteFreight(id) {
    const confirmation = confirm(`Tem certeza que deseja excluir o CTE ${id}? Esta ação não pode ser desfeita.`);
    if (confirmation) {
        const index = window.db.freights.findIndex(f => f.id === id);
        if (index !== -1) {
            window.db.freights.splice(index, 1);
            
            // Log de Atividade
            if (!window.db.auditLog) window.db.auditLog = [];
            window.db.auditLog.push({
                date: new Date().toISOString(),
                action: 'Exclusão de Frete',
                adminUser: window.db.currentUser.user,
                details: `Usuário '${window.db.currentUser.user}' excluiu o frete CTE ${id}.`
            });

            saveDb();
            renderFretes(); // Re-render to show the updated list and totals
        }
    }
}

function duplicateFreight(id) {
    if (!confirm('Deseja duplicar este pedido? Isso criará um novo CTE com os mesmos dados.')) return;

    const original = window.db.freights.find(f => f.id === id);
    if (original) {
        // Cria cópia profunda do objeto para não alterar o original
        const newFreight = JSON.parse(JSON.stringify(original));

        // Define novos dados para o clone
        newFreight.id = generateCTE();
        newFreight.date = new Date().toISOString();
        newFreight.status = 'Pendente';
        newFreight.trackingHistory = []; // Limpa histórico
        newFreight.attachments = []; // Limpa anexos
        newFreight.deliveryDate = null; // Limpa data de entrega
        newFreight.shippingDate = null; // Limpa data de envio
        
        // Reseta status de pagamento dos agentes se houver
        if (newFreight.agentes) {
            newFreight.agentes.forEach(a => a.status = 'Pendente');
        }

        window.db.freights.push(newFreight);
        
        // Log de Atividade
        if (!window.db.auditLog) window.db.auditLog = [];
        window.db.auditLog.push({
            date: new Date().toISOString(),
            action: 'Duplicação de Frete',
            adminUser: window.db.currentUser.user,
            details: `Usuário '${window.db.currentUser.user}' duplicou o frete CTE ${id} para o novo CTE ${newFreight.id}.`
        });

        saveDb();
        renderFretes();
    }
}

function showDetails(id) {
    const f = window.db.freights.find(item => item.id === id);
    if (!f) return;

    const client = window.db.clients.find(c => c.id == f.clientId)?.name || 'N/A';
    const medidas = f.medidas ? `${f.medidas.l}x${f.medidas.w}x${f.medidas.h}` : '-';

    const shippingDate = f.shippingDate ? new Date(f.shippingDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-';
    const deliveryDate = f.deliveryDate ? new Date(f.deliveryDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-';

    const tags = [];
    if (f.isPerishable) tags.push('<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-right:5px;">Perecível</span>');
    if (f.isFragile) tags.push('<span style="background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; font-size:0.8em;">Frágil</span>');

    const agentesHtml = f.agentes && f.agentes.length > 0 
        ? f.agentes.map(a => `<li>${a.nome}: <strong>${formatCurrency(a.valor)}</strong></li>`).join('') 
        : '<li>Nenhum agente informado</li>';

    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    overlay.innerHTML = `
        <div class="modal">
            <span class="close-modal" onclick="closeModal()">&times;</span>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-right: 30px;">
                <h3 style="margin: 0;">Detalhes do CTE ${f.id}</h3>
                <div style="display: flex; gap: 5px;">
                    <button class="btn-primary" onclick="openExternalTracking('${f.id}')" style="padding: 5px 10px; font-size: 0.85rem;" title="Abrir Rastreio Externo">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir
                    </button>
                    <button class="btn-secondary" onclick="copyTrackingLink('${f.id}')" style="padding: 5px 10px; font-size: 0.85rem;" title="Copiar Link">
                        <i class="fa-solid fa-link"></i>
                    </button>
                    <button class="btn-success" onclick="shareWhatsApp('${f.id}')" style="padding: 5px 10px; font-size: 0.85rem; background-color: #25D366; border: none;" title="Compartilhar no WhatsApp">
                        <i class="fa-brands fa-whatsapp"></i> WhatsApp
                    </button>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 15px;">
                <div>
                    <h4>Dados Gerais</h4>
                    <p><strong>Cliente:</strong> ${client}</p>
                    <p><strong>Remetente:</strong> ${f.remetente || '-'}</p>
                    <p><strong>Destinatário:</strong> ${f.destinatario || '-'}</p>
                    <p><strong>Ref. Interna:</strong> ${f.internalRef || '-'}</p>
                    <hr style="border:0; border-top: 1px solid var(--border-color); margin: 10px 0;">
                    <p><strong>Data Envio:</strong> ${shippingDate}</p>
                    <p><strong>Prev. Entrega:</strong> ${deliveryDate}</p>
                    <p><strong>Status:</strong> ${f.status}</p>
                </div>
                <div>
                    <h4>Endereço</h4>
                    <p>${f.endereco || '-'}</p> 
                    <p>${f.bairro || '-'}, ${f.cidade || ''} - ${f.uf || ''}</p>
                    <p>CEP: ${f.cep || '-'}</p>
                    <p>Tel: ${f.telefone || '-'}</p>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 15px;">
                <div>
                    <h4>Carga</h4>
                    <p><strong>Embalagem:</strong> ${f.tipoEmbalagem || '-'}</p>
                    <p>${tags.join('')}</p>
                    <p><strong>Volume:</strong> ${f.volume || 1} pacote(s)</p>
                    <p><strong>Medidas:</strong> ${medidas} m</p>
                    <p><strong>Peso:</strong> ${f.peso || 0} kg</p>
                    <p><strong>Cubagem:</strong> ${f.cubagem || 0} kg</p>
                </div>
                <div>
                    <h4>Financeiro</h4>
                    <p><strong>Valor NF:</strong> ${formatCurrency(f.valorNF || 0)}</p>
                    <p><strong>Valor Frete:</strong> <span class="success">${formatCurrency(f.valor || 0)}</span></p>
                </div>
            </div>

            ${f.internalObs ? `<div style="background: #fffbeB; color: #b45309; padding: 10px; border-radius: 5px; margin-bottom: 15px; border: 1px solid #fde68a;">
                <h4>Observação Interna</h4>
                <p>${f.internalObs}</p>
            </div>` : ''}

            <div style="background: #f9fafb; padding: 10px; border-radius: 5px;">
                <h4>Custos & Margem</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <p>Seguro: <br><strong>${formatCurrency(f.valorSeguro || 0)}</strong></p>
                    <p>Agentes: <br><strong>${formatCurrency(f.agentes ? f.agentes.reduce((s,a)=>s+a.valor,0) : 0)}</strong></p>
                    <div>
                        <ul style="font-size: 0.8rem; list-style: none; padding: 0;">${agentesHtml}</ul>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// --- CLIENTES ---

function renderClientes() {
    const tbody = document.getElementById('clientes-table-body');
    tbody.innerHTML = '';
    
    const searchTerm = document.getElementById('clientes-search-input')?.value.toLowerCase() || '';

    const filteredClients = window.db.clients.filter(c => {
        if (!searchTerm) return true;
        return c.name.toLowerCase().includes(searchTerm) || (c.cnpj && c.cnpj.includes(searchTerm));
    });

    filteredClients.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.name}</td>
            <td>${c.cnpj}</td>
            <td>${c.phone}</td>
            <td>${c.city}</td>
            <td>
                <button class="btn-primary" onclick="openModal('modal-cliente', ${c.id})">Editar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- RASTREIO ---

function renderRastreio() {
    document.getElementById('track-result').classList.add('hidden');
    const container = document.getElementById('tracking-list-container');
    container.classList.remove('hidden');
    
    let html = `
        <div class="actions-bar-fretes" style="margin-bottom: 15px;">
             <div class="fretes-search-bar">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="tracking-search-input" onkeyup="filterTrackingTable()" placeholder="Buscar CTE...">
            </div>
        </div>
        <div class="card" style="margin-top: 20px;">
            <h3>Envios Recentes (CTE)</h3>
            <div class="table-responsive">
                <table class="data-table" id="tracking-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Cliente</th>
                            <th>Destino</th>
                            <th>Status</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    // Ordenar por ID decrescente (mais recentes primeiro)
    const sortedFreights = [...window.db.freights].sort((a, b) => String(b.id).localeCompare(String(a.id)));

    sortedFreights.forEach(f => {
        const client = window.db.clients.find(c => c.id == f.clientId)?.name || 'N/A';
        let badgeClass = 'status-pendente';
        if(f.status === 'Em Trânsito') badgeClass = 'status-transito';
        if(f.status === 'Entregue') badgeClass = 'status-entregue';

        html += `
            <tr>
                <td>${f.id}</td>
                <td>${client}</td>
                <td>${f.destinatario || 'N/A'} <br><small>${f.cidade || ''}</small></td>
                <td><span class="status-badge ${badgeClass}">${f.status}</span></td>
                <td><button class="btn-primary" onclick="trackOrder('${f.id}')">Gerenciar</button></td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
}

function filterTrackingTable() {
    const input = document.getElementById('tracking-search-input');
    const filter = input.value.toUpperCase();
    const table = document.getElementById('tracking-table');
    const tr = table.getElementsByTagName('tr');

    for (let i = 0; i < tr.length; i++) {
        const td = tr[i].getElementsByTagName('td')[0]; // Coluna ID
        if (td) {
            const txtValue = td.textContent || td.innerText;
            tr[i].style.display = txtValue.toUpperCase().indexOf(filter) > -1 ? "" : "none";
        }
    }
}

function trackOrder(id) {
    if (!id) return;
    
    const resultDiv = document.getElementById('track-result');
    const listDiv = document.getElementById('tracking-list-container');
    
    const user = window.db.currentUser;
    const role = user.role || 'admin';
    const canUpdate = ['admin', 'operacional'].includes(role);

    const f = window.db.freights.find(f => f.id == id);
    
    if (!f) {
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `<p style="color: red; padding: 15px;">Pedido não encontrado.</p>`;
        return;
    }

    listDiv.classList.add('hidden');
    resultDiv.classList.remove('hidden');

    // Inicializar arrays se não existirem (para compatibilidade com dados antigos)
    if (!f.trackingHistory) f.trackingHistory = [];
    if (!f.attachments) f.attachments = [];

    resultDiv.classList.remove('hidden');

    // Ordenar histórico (mais recente primeiro)
    const historySorted = [...f.trackingHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

    let timelineHtml = '';
    let lastDate = '';

    historySorted.forEach(h => {
        const dateObj = new Date(h.date);
        const dateKey = dateObj.toLocaleDateString('pt-BR');
        const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isAlert = h.alert ? 'timeline-alert' : '';

        if (dateKey !== lastDate) {
            timelineHtml += `<div style="margin: 15px 0 10px -42px; background: var(--bg-light); border: 1px solid var(--border-color); color: var(--text-dark); padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 0.8rem; display: inline-block; position: relative; z-index: 1;">${dateKey}</div>`;
            lastDate = dateKey;
        }

        timelineHtml += `
            <div class="timeline-item ${isAlert}">
                <div class="timeline-date">${timeStr}</div>
                <div class="timeline-content">
                    <h4>${h.status} ${h.alert ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i>' : ''}</h4>
                    <p><strong>Local:</strong> ${h.location}</p>
                    <p>${h.observation || ''}</p>
                </div>
            </div>
        `;
    });

    if (historySorted.length === 0) timelineHtml = '<p style="color: #666; font-style: italic;">Nenhuma movimentação registrada.</p>';


    let attachmentsHtml = f.attachments.map(a => `
        <li class="attachment-item">
            <div><i class="fa-solid fa-paperclip" style="color: var(--primary)"></i> ${a.name}</div>
            <button class="btn-secondary" style="padding: 2px 8px; font-size: 0.7rem;" onclick="alert('Visualização do arquivo: ${a.name}')">Ver</button>
            
        </li>
    `).join('');

    let uploadButtonHtml = `
    <input type="file" id="attachment-file" hidden onchange="uploadAttachment('${f.id}', this)">
    <button class="btn-secondary" style="width: 100%; margin-top: 15px;" onclick="document.getElementById('attachment-file').click()"><i class="fa-solid fa-cloud-arrow-up"></i> Anexar Arquivo</button>`;
    
    // Renderiza o formulário de atualização apenas se tiver permissão
    resultDiv.innerHTML = `
        <button class="btn-secondary" onclick="renderRastreio()" style="margin-bottom: 15px;"><i class="fa-solid fa-arrow-left"></i> Voltar para Lista</button>
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
            <div>
                <h3 style="color: var(--primary); margin-bottom: 5px;">Rastreamento CTE ${f.id}</h3>
                <p style="color: var(--text-light);">${f.remetente || 'N/A'} <i class="fa-solid fa-arrow-right"></i> ${f.destinatario || 'N/A'}</p>
            </div>
            <span class="status-badge status-${f.status === 'Entregue' ? 'entregue' : (f.status === 'Em Trânsito' ? 'transito' : 'pendente')}" style="font-size: 1rem; padding: 8px 15px;">${f.status}</span>
        </div>

        <div class="tracking-container">
            <div class="tracking-main">
                ${canUpdate ? `<div class="update-form">
                    <h4 style="margin-bottom: 15px;">Nova Movimentação</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <select id="track-new-status" style="padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                            <option value="Em Trânsito">Em Trânsito</option>
                            <option value="Chegado na Filial">Chegado na Filial</option>

                            <option value="Saiu para Entrega">Saiu para Entrega</option>
                            <option value="Entregue">Entregue</option>
                            <option value="Ocorrência">Ocorrência / Avaria</option>
                        </select>
                        <input type="text" id="track-new-location" placeholder="Localização Atual (Cidade/UF)" style="padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                    </div>
                    <textarea id="track-new-obs" placeholder="Observações..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px;"></textarea>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <input type="file" id="track-new-attachment" accept="image/*,.pdf">

                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;"><input type="checkbox" id="track-new-alert"> Gerar Alerta / Ocorrência</label>
                        <button class="btn-primary" onclick="addTrackingEvent('${f.id}')">Atualizar Rastreio</button>
                    </div>
                </div>` : ''}

                <h4 style="color: var(--text-dark); margin-bottom: 15px;">Histórico de Eventos</h4>
                <div class="timeline">
                    ${timelineHtml}
                </div>
            </div>

            <div class="tracking-sidebar">
                <div class="card">
                    <h4>Comprovantes & Anexos</h4>
                    <ul class="attachment-list">
                        ${attachmentsHtml}
                        
                    </ul>
                    <input type="file" id="attachment-file" hidden onchange="uploadAttachment('${f.id}', this)">
                    <button class="btn-secondary" style="width: 100%; margin-top: 15px;" onclick="addAttachment('${f.id}')"><i class="fa-solid fa-cloud-arrow-up"></i> Anexar Arquivo</button>
                </div>
            </div>
        </div>
    `;
}

function addTrackingEvent(id) {
    const status = document.getElementById('track-new-status').value;
    const location = document.getElementById('track-new-location').value;
    const obs = document.getElementById('track-new-obs').value;
    const isAlert = document.getElementById('track-new-alert').checked; // Renomeado para evitar conflito
    const fileInput = document.getElementById('track-new-attachment');
    const file = fileInput.files[0];

    if (!location) return window.alert('Informe a localização.');

    const f = window.db.freights.find(f => f.id == id);
    if (f) {
        if (!f.trackingHistory) f.trackingHistory = [];
        f.trackingHistory.push({
            date: new Date().toISOString(),
            status,
            location,
            observation: obs,
            alert: isAlert
        });

        // Se houver arquivo, adiciona aos anexos
        if (file) {
            if (!f.attachments) f.attachments = [];
            f.attachments.push({ name: file.name, date: new Date().toISOString() });
        }

        f.status = status; // Atualiza status principal
        
        // Log de Atividade
        if (!window.db.auditLog) window.db.auditLog = [];
        window.db.auditLog.push({
            date: new Date().toISOString(),
            action: 'Atualização de Rastreio',
            adminUser: window.db.currentUser.user,
            details: `Usuário '${window.db.currentUser.user}' adicionou evento '${status}' em '${location}' ao CTE ${id}.`
        });

        saveDb();
        renderFretes(); // Atualiza lista se estiver visível
        trackOrder(id); // Atualiza a tela de rastreio imediatamente
    }
}

async function uploadAttachment(id, input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const fileName = file.name;
        
        // Simula o upload para o Firebase Storage (você precisará configurar o Firebase Storage)
        
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(`attachments/${id}/${fileName}`);
        
        try {
            //await fileRef.put(file); // Descomente para usar o Firebase Storage
            
            const f = window.db.freights.find(f => f.id == id);
            if (f) {
                if (!f.attachments) f.attachments = [];
                f.attachments.push({ name: fileName, date: new Date().toISOString() });
                saveDb();
                trackOrder(id); // Recarrega a tela
            }
        } catch (error) {
            alert("Erro ao fazer upload do arquivo.");
        }
    }
    input.value = ''; // Limpar o input
}

function saveCliente() {
    const editId = document.getElementById('edit-client-id').value;
    const name = document.getElementById('new-cli-name').value;
    const cnpj = document.getElementById('new-cli-cnpj').value;
    const city = document.getElementById('new-cli-city').value;
    const phone = document.getElementById('new-cli-phone').value;

    if (name && cnpj) {
        if (editId) {
            const idx = db.clients.findIndex(c => c.id == editId);
            if (idx !== -1) {
                db.clients[idx] = { ...db.clients[idx], name, cnpj, city, phone };
            }
        } else {
            const newId = db.clients.length > 0 ? Math.max(...db.clients.map(c => c.id)) + 1 : 1;
            db.clients.push({ id: newId, name, cnpj, city, phone });
        }
        saveDb();
        closeModal();
        renderClientes();
    }
}

function calculateModalValues() {
    // Cubagem
    const l = parseFloat(document.getElementById('new-frete-l').value) || 0;
    const w = parseFloat(document.getElementById('new-frete-w').value) || 0;
    const h = parseFloat(document.getElementById('new-frete-h').value) || 0;
    document.getElementById('new-frete-cubagem').value = (l * w * h * FATOR_CUBAGEM).toFixed(2);

}

function calculateSeguro() {
    const valorNF = parseFloat(document.getElementById('new-frete-nf').value) || 0;
    document.getElementById('new-frete-seguro').value = (valorNF * SEGURO_TAXA).toFixed(2);
}

// --- PULL TO REFRESH LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const contentEl = document.querySelector('.content');
    const pullEl = document.getElementById('pull-refresh');
    let startY = 0;
    let isPulling = false;

    if (!contentEl || !pullEl) return;

    contentEl.addEventListener('touchstart', (e) => {
        // Só ativa se estiver na view de fretes e no topo da rolagem
        const isFretesView = !document.getElementById('view-fretes').classList.contains('hidden');
        if (contentEl.scrollTop === 0 && isFretesView) {
            startY = e.touches[0].pageY;
            isPulling = true;
        }
    }, { passive: true });

    contentEl.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        
        const y = e.touches[0].pageY;
        const delta = y - startY;

        if (delta > 0 && contentEl.scrollTop === 0) {
            // Arrastando para baixo
            if (delta < 200) { // Limite visual
                pullEl.style.height = `${delta * 0.4}px`; // Resistência
                if (delta > 120) pullEl.classList.add('rotate');
                else pullEl.classList.remove('rotate');
            }
        } else {
            isPulling = false;
            pullEl.style.height = '0px';
        }
    }, { passive: true });

    contentEl.addEventListener('touchend', async () => {
        if (!isPulling) return;
        isPulling = false;

        if (parseInt(pullEl.style.height) > 50) {
            // Gatilho de atualização
            pullEl.classList.add('loading');
            pullEl.style.height = '60px';
            
            // Simula refresh de dados (recarrega DB e renderiza)
            if (typeof loadDb === 'function') await loadDb();
            renderFretes();
            
            setTimeout(() => {
                pullEl.classList.remove('loading');
                pullEl.style.height = '0px';
            }, 800); // Tempo mínimo para ver o spinner
        } else {
            pullEl.style.height = '0px';
        }
    });

    // --- STATUS FILTER LOGIC ---
    const filterBadges = document.querySelectorAll('#mobile-status-filter .status-filter-badge');
    filterBadges.forEach(badge => {
        badge.addEventListener('click', () => {
            // Remove active class from all
            filterBadges.forEach(b => b.classList.remove('active'));
            // Add to clicked one
            badge.classList.add('active');
            // Reset page and re-render
            currentPage = 1;
            renderFretes();
        });
    });
});
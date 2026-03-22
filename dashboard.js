// Variáveis para armazenar instâncias dos gráficos (para destruir antes de recriar)
let dashboardCharts = {
    clients: null,
    status: null,
    revenue: null,
    profit: null,
    cashflow: null,
    monthly: null
};

// --- DASHBOARD ---

function renderDashboard() {
    const dateStartInput = document.getElementById('dashboard-date-start');
    const dateEndInput = document.getElementById('dashboard-date-end');

    const startDate = dateStartInput && dateStartInput.value ? new Date(dateStartInput.value).setHours(0,0,0,0) : null;
    const endDate = dateEndInput && dateEndInput.value ? new Date(dateEndInput.value).setHours(23,59,59,999) : null;

    // Filtrar fretes por período
    let filteredFreights = window.db.freights.filter(f => {
        const fDate = f.date ? new Date(f.date).getTime() : (typeof f.id === 'number' ? f.id : 0);
        const startMatch = !startDate || fDate >= startDate;
        const endMatch = !endDate || fDate <= endDate;
        return startMatch && endMatch;
    });

    const totalRevenue = filteredFreights.reduce((acc, f) => acc + (f.valor || 0), 0);
    const totalCost = filteredFreights.reduce((acc, f) => acc + getFreightTotalCost(f), 0);
    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : 0;

    document.getElementById('dash-revenue').innerText = formatCurrency(totalRevenue);
    document.getElementById('dash-cost').innerText = formatCurrency(totalCost);
    document.getElementById('dash-profit').innerText = formatCurrency(profit);
    document.getElementById('dash-margin').innerText = margin + '%';

    // Evolução do Lucro (Gráfico de Linha)
    const dailyProfitMap = new Map();
    filteredFreights.forEach(f => {
        const fDate = f.date ? new Date(f.date).getTime() : (typeof f.id === 'number' ? f.id : 0);
        if (fDate === 0) return;

        const d = new Date(fDate);
        d.setHours(0,0,0,0);
        const key = d.getTime();
        
        const cost = getFreightTotalCost(f);
        const itemProfit = (f.valor || 0) - cost;
        
        dailyProfitMap.set(key, (dailyProfitMap.get(key) || 0) + itemProfit);
    });

    // Melhores Clientes (para o gráfico)
    const clientRanking = {};
    filteredFreights.forEach(f => {
        const clientName = window.db.clients.find(c => c.id == f.clientId)?.name || 'Desconhecido';
        clientRanking[clientName] = (clientRanking[clientName] || 0) + (f.valor || 0);
    });

    const sortedClients = Object.entries(clientRanking)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // Resumo Status (para o gráfico)
    const statusCounts = filteredFreights.reduce((acc, f) => {
        acc[f.status] = (acc[f.status] || 0) + 1;
        return acc;
    }, {});

    // Fluxo de Caixa (Recebido vs A Receber)
    let totalReceived = 0;
    let totalReceivable = 0;

    filteredFreights.forEach(f => {
        const bStatus = f.billingStatus || 'Pendente';
        if (bStatus === 'Pago') totalReceived += (f.valor || 0);
        if (bStatus === 'Faturado') totalReceivable += (f.valor || 0);
        // 'Pendente' é ignorado neste gráfico conforme solicitado
    });

    // Faturamento Mensal (Últimos 6 Meses)
    const monthlyDataMap = new Map();
    const today = new Date();
    const monthKeys = [];

    // Inicializa os últimos 6 meses com 0
    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`; // Chave única ano-mês
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }); // Ex: Fev/24
        monthlyDataMap.set(key, { label, value: 0 });
        monthKeys.push(key);
    }

    window.db.freights.forEach(f => {
        const d = f.date ? new Date(f.date) : new Date();
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthlyDataMap.has(key)) {
            monthlyDataMap.get(key).value += (f.valor || 0);
        }
    });
    
    // Custo por Tipo (para o gráfico de pizza)
    let totalAgentCost = 0;
    let totalInsuranceCost = 0;

    filteredFreights.forEach(f => {
        totalInsuranceCost += (f.valorSeguro || 0);
        if (f.agentes) {
            totalAgentCost += f.agentes.reduce((sum, a) => sum + (a.valor || 0), 0);
        }
    });


    // --- RENDERIZAR GRÁFICOS COM CHART.JS ---

    // 0. Gráfico de Lucro
    if (dashboardCharts.profit) dashboardCharts.profit.destroy();
    const ctxProfit = document.getElementById('chart-profit').getContext('2d');
    
    const sortedProfitKeys = Array.from(dailyProfitMap.keys()).sort((a, b) => a - b);
    const profitLabels = sortedProfitKeys.map(ts => new Date(ts).toLocaleDateString('pt-BR').substring(0, 5));
    const profitData = sortedProfitKeys.map(ts => dailyProfitMap.get(ts));

    dashboardCharts.profit = new Chart(ctxProfit, {
        type: 'line',
        data: {
            labels: profitLabels,
            datasets: [{
                label: 'Lucro (R$)',
                data: profitData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => 'Lucro: ' + formatCurrency(c.parsed.y) } }
            },
            scales: { y: { beginAtZero: true } }
        }
    });

    // 1. Gráfico de Clientes (Barra)
    if (dashboardCharts.clients) dashboardCharts.clients.destroy();
    
    const ctxClients = document.getElementById('chart-clients').getContext('2d');
    dashboardCharts.clients = new Chart(ctxClients, {
        type: 'bar',
        data: {
            labels: sortedClients.map(item => item[0]),
            datasets: [{
                label: 'Faturamento (R$)',
                data: sortedClients.map(item => item[1]),
                backgroundColor: '#2563eb',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    // 2. Gráfico de Status (Doughnut)
    if (dashboardCharts.status) dashboardCharts.status.destroy();

    const ctxStatus = document.getElementById('chart-status').getContext('2d');
    const statusLabels = Object.keys(statusCounts);
    const statusData = Object.values(statusCounts);
    
    // Cores baseadas no status (aproximadas do CSS)
    const statusColors = statusLabels.map(s => {
        if(s === 'Entregue') return '#10b981';
        if(s === 'Em Trânsito') return '#2563eb';
        return '#f59e0b'; // Pendente
    });

    dashboardCharts.status = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: statusLabels,
            datasets: [{ data: statusData, backgroundColor: statusColors, borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 3. Gráfico de Fluxo de Caixa (Pie/Doughnut)
    if (dashboardCharts.cashflow) dashboardCharts.cashflow.destroy();

    const ctxCashflow = document.getElementById('chart-cashflow').getContext('2d');
    dashboardCharts.cashflow = new Chart(ctxCashflow, {
        type: 'pie',
        data: {
            labels: ['Recebido (Pago)', 'A Receber (Faturado)'],
            datasets: [{
                data: [totalReceived, totalReceivable],
                backgroundColor: ['#10b981', '#f59e0b'], // Verde e Laranja
                borderWidth: 1,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (c) => ` ${c.label}: ${formatCurrency(c.parsed)}`
                    }
                }
            }
        }
    });

    // 4. Gráfico Mensal (Barra)
    if (dashboardCharts.monthly) dashboardCharts.monthly.destroy();

    const ctxMonthly = document.getElementById('chart-monthly').getContext('2d');
    dashboardCharts.monthly = new Chart(ctxMonthly, {
        type: 'bar',
        data: {
            labels: monthKeys.map(k => monthlyDataMap.get(k).label),
            datasets: [{
                label: 'Faturamento',
                data: monthKeys.map(k => monthlyDataMap.get(k).value),
                backgroundColor: '#8b5cf6', // Roxo
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { beginAtZero: true } 
            }
        }
    });

    // 5. Gráfico de Distribuição de Custos (Pizza)
    if (dashboardCharts.costDistribution) dashboardCharts.costDistribution.destroy();

    const ctxCostDistribution = document.getElementById('chart-cost-distribution').getContext('2d');
    dashboardCharts.costDistribution = new Chart(ctxCostDistribution, {
        type: 'pie',
        data: {
            labels: ['Custo com Agentes', 'Custo de Seguro'],
            datasets: [{
                data: [totalAgentCost, totalInsuranceCost],
                backgroundColor: ['#ef4444', '#f97316'], // Vermelho e Laranja
                borderWidth: 2,
                borderColor: 'var(--card-bg)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (c) => ` ${c.label}: ${formatCurrency(c.parsed)}`
                    }
                }
            }
        }
    });

    // 6. Verificar Alertas de Atraso
    checkOverdueDeliveries();
}

function clearDashboardFilters() {
    document.getElementById('dashboard-date-start').value = '';
    document.getElementById('dashboard-date-end').value = '';
    renderDashboard();
}

// --- FUNÇÕES DE ALERTA ---

function checkOverdueDeliveries() {
    const today = new Date().toISOString().split('T')[0]; // Data de hoje YYYY-MM-DD
    
    // Filtra fretes: Tem data de entrega definida + Data é menor que hoje + Não foi entregue
    const overdue = window.db.freights.filter(f => {
        return f.deliveryDate && f.deliveryDate < today && f.status !== 'Entregue';
    });

    let alertBox = document.getElementById('dashboard-alert-box');
    
    // Se não houver atrasos, remove o alerta se ele existir
    if (overdue.length === 0) {
        if (alertBox) alertBox.remove();
        return;
    }

    // Se houver atrasos e o box não existir, cria ele
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'dashboard-alert-box';
        Object.assign(alertBox.style, {
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#b91c1c',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        });
        
        const dashboardView = document.getElementById('view-dashboard');
        if (dashboardView) dashboardView.prepend(alertBox);
    }

    // Atualiza o texto do alerta
    alertBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem;"></i>
            <div>
                <strong>Atenção:</strong> Existem ${overdue.length} entrega(s) com data vencida.
            </div>
        </div>
        <button class="btn-danger" style="padding: 5px 15px;" onclick="showOverdueList()">Ver Lista</button>
    `;
}

function showOverdueList() {
    const today = new Date().toISOString().split('T')[0];
    const overdue = window.db.freights.filter(f => f.deliveryDate && f.deliveryDate < today && f.status !== 'Entregue');

    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    const rows = overdue.map(f => {
        const client = window.db.clients.find(c => c.id == f.clientId)?.name || 'N/A';
        const dateParts = f.deliveryDate.split('-');
        const dateDisplay = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`; // DD/MM/YYYY
        
        return `
        <tr>
            <td>${f.id}</td>
            <td>${client}</td>
            <td>${dateDisplay}</td>
            <td><span class="status-badge status-pendente">${f.status}</span></td>
            <td>
                <button class="btn-primary" onclick="closeModal(); navigate('fretes'); openModal('modal-frete', '${f.id}')" title="Resolver">
                    <i class="fa-solid fa-arrow-right"></i>
                </button>
            </td>
        </tr>
    `}).join('');

    overlay.innerHTML = `
        <div class="modal">
            <span class="close-modal" onclick="closeModal()">&times;</span>
            <h3 style="color: #b91c1c;">Entregas Vencidas</h3>
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>CTE</th>
                            <th>Cliente</th>
                            <th>Prev. Entrega</th>
                            <th>Status</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div style="margin-top: 15px; text-align: right;">
                <button class="btn-secondary" onclick="closeModal()">Fechar</button>
            </div>
        </div>
    `;
}
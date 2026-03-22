// --- FATURAMENTO ---

function renderFaturamento() {
    const select = document.getElementById('faturamento-client-select');
    const dateStartInput = document.getElementById('faturamento-date-start');
    const dateEndInput = document.getElementById('faturamento-date-end');
    const statusFilter = document.getElementById('faturamento-status-filter')?.value || 'all';
    const nfseFilter = document.getElementById('faturamento-nfse-filter')?.checked || false;

    if (select.options.length === 1) {
        window.db.clients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.innerText = c.name;
            select.appendChild(opt);
        });
    }

    const selectedClient = select.value;
    const startDate = dateStartInput && dateStartInput.value ? new Date(dateStartInput.value).setHours(0,0,0,0) : null;
    const endDate = dateEndInput && dateEndInput.value ? new Date(dateEndInput.value).setHours(23,59,59,999) : null;

    let filteredFreights = window.db.freights.filter(f => {
        const fDate = f.date ? new Date(f.date).getTime() : new Date().getTime();
        const clientMatch = selectedClient === 'all' || f.clientId == selectedClient;
        const startMatch = !startDate || fDate >= startDate;
        const endMatch = !endDate || fDate <= endDate;
        
        const currentStatus = f.billingStatus || 'Pendente';
        const statusMatch = statusFilter === 'all' || currentStatus === statusFilter;
        
        const nfseMatch = !nfseFilter || (f.nfse && f.nfse.trim() !== '');

        return clientMatch && startMatch && endMatch && statusMatch && nfseMatch;
    });

    // Cálculos Financeiros
    const totalRevenue = filteredFreights.reduce((acc, f) => acc + (f.valor || 0), 0);
    const totalCost = filteredFreights.reduce((acc, f) => acc + getFreightTotalCost(f), 0);
    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : 0;
    const count = filteredFreights.length;
    const avgTicket = count > 0 ? totalRevenue / count : 0;

    // Preparar dados para o gráfico (Agrupar por dia)
    const dailyMap = new Map();
    filteredFreights.forEach(f => {
        const d = f.date ? new Date(f.date) : new Date();
        d.setHours(0,0,0,0);
        const key = d.getTime();
        dailyMap.set(key, (dailyMap.get(key) || 0) + (f.valor || 0));
    });
    const sortedKeys = Array.from(dailyMap.keys()).sort((a, b) => a - b);
    const chartLabels = sortedKeys.map(ts => new Date(ts).toLocaleDateString('pt-BR').substring(0, 5)); // DD/MM
    const chartData = sortedKeys.map(ts => dailyMap.get(ts));

    document.getElementById('faturamento-details').innerHTML = `
        <div class="finance-summary">
            <div class="card">
                <h3>Faturamento Bruto</h3>
                <p class="big-number success">${formatCurrency(totalRevenue)}</p>
            </div>
            <div class="card">
                <h3>Custos Totais</h3>
                <p class="big-number danger">${formatCurrency(totalCost)}</p>
            </div>
            <div class="card">
                <h3>Lucro Líquido</h3>
                <p class="big-number" style="color: var(--primary)">${formatCurrency(profit)}</p>
            </div>
            <div class="card">
                <h3>Margem Líquida</h3>
                <p class="big-number">${margin}%</p>
            </div>
            <div class="card">
                <h3>Ticket Médio</h3>
                <p class="big-number">${formatCurrency(avgTicket)}</p>
            </div>
        </div>

        <div class="chart-box" style="margin-bottom: 20px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <h3 style="margin-bottom: 15px; font-size: 1.1rem; color: var(--text-dark);">Evolução da Receita (Dia a Dia)</h3>
            <div class="canvas-container" style="height: 300px;"><canvas id="chart-revenue"></canvas></div>
        </div>

        <div class="table-responsive" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-dark);">Detalhamento do Período</h3>
                <div style="display: flex; gap: 5px;">
                    <button class="btn-secondary" onclick="updateBillingStatus('Pendente')" title="Cancelar Faturamento / Estornar"><i class="fa-solid fa-rotate-left"></i> Estornar</button>
                    <button class="btn-primary" onclick="updateBillingStatus('Faturado')" title="Gerar Fatura"><i class="fa-solid fa-file-invoice-dollar"></i> Faturar</button>
                    <button class="btn-success" onclick="updateBillingStatus('Pago')" title="Marcar como Pago"><i class="fa-solid fa-check-double"></i> Baixar</button>
                </div>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 40px;"><input type="checkbox" onchange="toggleAllBilling(this); updateSelectionSummary();"></th>
                        <th>Data</th>
                        <th>CTE</th>
                        <th>Cliente</th>
                        <th>Rota</th>
                        <th>Status Cobrança</th>
                        <th>NFS-e</th>
                        <th>Valor Frete</th>
                        <th>Lucro</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredFreights.length > 0 ? filteredFreights.map(f => {
                        const client = window.db.clients.find(c => c.id == f.clientId)?.name || 'N/A';
                        const date = f.date ? new Date(f.date).toLocaleDateString('pt-BR') : '-';
                        const cost = getFreightTotalCost(f);
                        const itemProfit = (f.valor || 0) - cost;
                        
                        const billingStatus = f.billingStatus || 'Pendente';
                        let badgeClass = 'status-pendente'; // Amarelo/Cinza
                        if (billingStatus === 'Faturado') badgeClass = 'status-transito'; // Azul
                        if (billingStatus === 'Pago') badgeClass = 'status-entregue'; // Verde

                        return `
                            <tr>
                                <td><input type="checkbox" class="billing-checkbox" value="${f.id}" onchange="updateSelectionSummary()"></td>
                                <td>${date}</td>
                                <td>${f.id}</td>
                                <td>${client}</td>
                                <td>${f.remetente || '-'} -> ${f.destinatario || '-'}</td>
                                <td><span class="status-badge ${badgeClass}">${billingStatus}</span></td>
                                <td ondblclick="editNfse('${f.id}')" title="Clique duplo para editar" style="cursor: pointer;">${f.nfse || '-'} <i class="fa-solid fa-pen" style="font-size: 0.7em; opacity: 0.5;"></i></td>
                                <td>${formatCurrency(f.valor || 0)}</td>
                                <td class="${itemProfit >= 0 ? 'success' : 'danger'}">${formatCurrency(itemProfit)}</td>
                            </tr>
                        `;
                    }).join('') : '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #666;">Nenhum registro encontrado para os filtros selecionados.</td></tr>'}
                </tbody>
            </table>
            <div id="billing-selection-summary" class="hidden" style="margin-top: 20px; padding: 15px; background-color: var(--bg-light); border: 1px solid var(--border-color); border-radius: 8px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; color: var(--primary);">Resumo da Seleção</h4>
                <div style="display: flex; justify-content: space-between; font-size: 1rem;">
                    <span>Itens Selecionados: <strong id="selected-count">0</strong></span>
                    <span>Valor Total: <strong id="selected-total">R$ 0,00</strong></span>
                </div>
            </div>
        </div>
    `;

    // Renderizar Gráfico
    if (dashboardCharts.revenue) dashboardCharts.revenue.destroy();
    const ctxRevenue = document.getElementById('chart-revenue').getContext('2d');
    dashboardCharts.revenue = new Chart(ctxRevenue, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Receita (R$)',
                data: chartData,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#2563eb'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Receita: ' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumSignificantDigits: 3 });
                        }
                    }
                }
            }
        }
    });
}

function toggleAllBilling(source) {
    const checkboxes = document.querySelectorAll('.billing-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

function updateBillingStatus(newStatus) {
    const checkboxes = document.querySelectorAll('.billing-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Selecione pelo menos um frete para atualizar.");
        return;
    }

    let nfseValue = null;
    if (newStatus === 'Faturado') {
        nfseValue = prompt("Informe o número da NFS-e (Nota Fiscal de Serviço) para os itens selecionados:");
        if (nfseValue === null) return; // Cancelou a operação
    } else if (newStatus === 'Pendente') {
        nfseValue = ''; // Limpa a NFS-e ao estornar/cancelar
    }

    if (!confirm(`Deseja marcar ${checkboxes.length} itens como '${newStatus}'?`)) return;

    let count = 0;
    checkboxes.forEach(cb => {
        const id = cb.value;
        const freight = window.db.freights.find(f => f.id == id); // ID pode ser string ou number
        if (freight) {
            freight.billingStatus = newStatus;
            if (nfseValue !== null) freight.nfse = nfseValue;
            count++;
        }
    });

    saveDb();
    renderFaturamento();
    alert(`${count} fretes atualizados para ${newStatus}.`);
}

function exportBillingCSV() {
    const select = document.getElementById('faturamento-client-select');
    const dateStartInput = document.getElementById('faturamento-date-start');
    const dateEndInput = document.getElementById('faturamento-date-end');

    const selectedClient = select.value;
    const startDate = dateStartInput && dateStartInput.value ? new Date(dateStartInput.value).setHours(0,0,0,0) : null;
    const endDate = dateEndInput && dateEndInput.value ? new Date(dateEndInput.value).setHours(23,59,59,999) : null;

    let filteredFreights = window.db.freights.filter(f => {
        const fDate = f.date ? new Date(f.date).getTime() : new Date().getTime();
        const clientMatch = selectedClient === 'all' || f.clientId == selectedClient;
        const startMatch = !startDate || fDate >= startDate;
        const endMatch = !endDate || fDate <= endDate;
        return clientMatch && startMatch && endMatch;
    });

    if (filteredFreights.length === 0) {
        alert("Nenhum dado para exportar.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // BOM para Excel
    csvContent += "Data;CTE;Cliente;Remetente;Destinatario;NFS-e;Valor Frete;Custo Total;Lucro\n";

    filteredFreights.forEach(f => {
        const client = window.db.clients.find(c => c.id == f.clientId)?.name || 'N/A';
        const date = f.date ? new Date(f.date).toLocaleDateString('pt-BR') : '-';
        const val = f.valor ? f.valor.toFixed(2).replace('.', ',') : '0,00';
        const cost = getFreightTotalCost(f).toFixed(2).replace('.', ',');
        const profit = ((f.valor || 0) - getFreightTotalCost(f)).toFixed(2).replace('.', ',');
        
        csvContent += `${date};${f.id};${client};${f.remetente || ''};${f.destinatario || ''};${f.nfse || ''};${val};${cost};${profit}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "faturamento_tms.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function printClientInvoice() {
    const select = document.getElementById('faturamento-client-select');
    const selectedClient = select.value;
    
    // Verificar itens selecionados
    const checkboxes = document.querySelectorAll('.billing-checkbox:checked');
    let filteredFreights = [];

    if (checkboxes.length > 0) {
        // Se houver seleção manual, usa apenas os selecionados
        checkboxes.forEach(cb => {
            const f = window.db.freights.find(item => item.id == cb.value);
            if (f) filteredFreights.push(f);
        });
    } else {
        // Se nada selecionado, alerta o usuário
        alert("Selecione os fretes que deseja incluir na fatura.");
        return;
    }

    // Validar se todos os fretes são do mesmo cliente (se 'Todos' estiver selecionado no filtro)
    const firstClientId = filteredFreights[0].clientId;
    const mixedClients = filteredFreights.some(f => f.clientId != firstClientId);
    
    if (mixedClients) {
        alert("Atenção: Você selecionou fretes de clientes diferentes. Gere uma fatura por cliente.");
        return;
    }

    const clientData = window.db.clients.find(c => c.id == firstClientId);
    if (!clientData) {
        alert("Erro ao identificar o cliente.");
        return;
    }

    if (filteredFreights.length === 0) {
        alert("Nenhum frete encontrado para este período.");
        return;
    }

    // Ordenar por data
    filteredFreights.sort((a, b) => new Date(a.date) - new Date(b.date));

    const totalValue = filteredFreights.reduce((acc, f) => acc + (f.valor || 0), 0);
    
    const periodStr = "Itens Selecionados";
    const emissionDate = new Date().toLocaleDateString('pt-BR');

    const printWindow = window.open('', '_blank');
    
    const html = `
        <html>
        <head>
            <title>Fatura - ${clientData.name}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
                .company-info h1 { margin: 0; color: #2563eb; font-size: 24px; }
                .invoice-details { text-align: right; }
                .client-box { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 30px; border: 1px solid #e5e7eb; }
                .client-box h3 { margin-top: 0; margin-bottom: 10px; font-size: 16px; color: #555; text-transform: uppercase; letter-spacing: 1px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                th, td { padding: 12px 15px; border-bottom: 1px solid #ddd; text-align: left; font-size: 14px; }
                th { background-color: #f3f4f6; font-weight: 600; color: #374151; }
                tr:last-child td { border-bottom: none; }
                .total-box { display: flex; justify-content: flex-end; }
                .total-table { width: 300px; }
                .total-table td { border-bottom: 1px solid #eee; }
                .total-row { font-weight: bold; font-size: 18px; color: #2563eb; }
                .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #888; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-info"><h1>GreenX TMS</h1><p>Soluções em Logística</p></div>
                <div class="invoice-details"><h2>DEMONSTRATIVO DE SERVIÇOS</h2><p><strong>Emissão:</strong> ${emissionDate}</p><p><strong>Período:</strong> ${periodStr}</p></div>
            </div>
            <div class="client-box">
                <h3>Dados do Cliente</h3>
                <p><strong>Razão Social:</strong> ${clientData.name}</p>
                <p><strong>CNPJ:</strong> ${clientData.cnpj || 'Não informado'}</p>
                <p><strong>Endereço:</strong> ${clientData.city || ''}</p>
            </div>
            <table>
                <thead><tr><th>Data</th><th>CTE / Ref</th><th>Rota</th><th>Nota Fiscal</th><th style="text-align: right;">Valor Frete</th></tr></thead>
                <tbody>
                    ${filteredFreights.map(f => `
                        <tr>
                            <td>${new Date(f.date).toLocaleDateString('pt-BR')}</td>
                            <td>${f.id} <br><small style="color:#666">${f.internalRef || ''}</small></td>
                            <td>${f.remetente} -> ${f.destinatario}</td>
                            <td>${f.valorNF ? f.valorNF.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : '-'}</td>
                            <td style="text-align: right;">${(f.valor || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
            <div class="total-box"><table class="total-table"><tr class="total-row"><td>TOTAL A PAGAR</td><td style="text-align: right;">${totalValue.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td></tr></table></div>
            <div class="footer"><p>GreenX TMS - Sistema de Gestão de Transportes</p></div>
            <script>window.onload = function() { window.print(); }</script>
        </body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
}

// --- PAGAMENTOS (CONTAS A PAGAR) ---

function renderPagamentos() {
    const select = document.getElementById('pagamentos-agent-select');
    const dateStartInput = document.getElementById('pagamentos-date-start');
    const dateEndInput = document.getElementById('pagamentos-date-end');
    const tbody = document.getElementById('pagamentos-table-body');
    
    // Popular select de agentes se estiver vazio
    if (select && select.options.length === 1) {
        const agentsSet = new Set();
        window.db.freights.forEach(f => {
            if (f.agentes) f.agentes.forEach(a => { if(a.nome) agentsSet.add(a.nome); });
        });
        agentsSet.forEach(agentName => {
            const opt = document.createElement('option');
            opt.value = agentName;
            opt.innerText = agentName;
            select.appendChild(opt);
        });
    }

    const selectedAgent = select ? select.value : 'all';
    const startDate = dateStartInput && dateStartInput.value ? new Date(dateStartInput.value).setHours(0,0,0,0) : null;
    const endDate = dateEndInput && dateEndInput.value ? new Date(dateEndInput.value).setHours(23,59,59,999) : null;

    tbody.innerHTML = '';
    
    let totalPaid = 0;
    let totalPending = 0;
    let hasItems = false;

    // Itera sobre todos os fretes para encontrar agentes
    window.db.freights.forEach(f => {
        if (f.agentes && f.agentes.length > 0) {
            f.agentes.forEach((agente, index) => {
                // Filtros
                const fDate = f.date ? new Date(f.date).getTime() : (typeof f.id === 'number' ? f.id : 0);
                const agentMatch = selectedAgent === 'all' || agente.nome === selectedAgent;
                const startMatch = !startDate || fDate >= startDate;
                const endMatch = !endDate || fDate <= endDate;

                if (agentMatch && startMatch && endMatch) {
                    hasItems = true;
                    const val = parseFloat(agente.valor) || 0;
                    if (agente.status === 'Pago') {
                        totalPaid += val;
                    } else {
                        totalPending += val;
                    }

                    const date = f.date ? new Date(f.date).toLocaleDateString('pt-BR') : '-';
                    const isPaid = agente.status === 'Pago';
                    const statusClass = isPaid ? 'status-fin-pago' : 'status-fin-pendente';
                    const toggleIcon = isPaid ? 'fa-rotate-left' : 'fa-check';
                    const toggleTitle = isPaid ? 'Reabrir' : 'Marcar como Pago';
                    const toggleClass = isPaid ? 'btn-warning' : 'btn-success';
                
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                    <td><input type="checkbox" class="payment-checkbox" data-fid="${f.id}" data-idx="${index}"></td>
                    <td>${date}</td>
                    <td>${f.id}</td>
                    <td>${agente.nome}</td>
                    <td>${formatCurrency(agente.valor)}</td>
                    <td><span class="status-badge ${statusClass}">${agente.status || 'Pendente'}</span></td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button class="btn-primary" onclick="editAgentPayment('${f.id}', ${index})" style="padding: 5px 10px;" title="Editar"><i class="fa-solid fa-pen"></i></button>
                            <button class="${toggleClass}" onclick="toggleAgentPayment('${f.id}', ${index})" style="padding: 5px 10px;" title="${toggleTitle}"><i class="fa-solid ${toggleIcon}"></i></button>
                            <button class="btn-danger" onclick="deleteAgentPayment('${f.id}', ${index})" style="padding: 5px 10px;" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                    `;
                    tbody.appendChild(tr);
                }
            });
        }
    });

    if (!hasItems) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Nenhum pagamento pendente ou registrado.</td></tr>';
    }

    const summaryEl = document.getElementById('pagamentos-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="finance-summary">
                <div class="card">
                    <h3>Total a Pagar</h3>
                    <p class="big-number danger">${formatCurrency(totalPending)}</p>
                </div>
                <div class="card">
                    <h3>Total Pago</h3>
                    <p class="big-number success">${formatCurrency(totalPaid)}</p>
                </div>
                <div class="card">
                    <h3>Total Geral</h3>
                    <p class="big-number">${formatCurrency(totalPending + totalPaid)}</p>
                </div>
            </div>
        `;
    }
}

function printAgentInvoice() {
    const select = document.getElementById('pagamentos-agent-select');
    const selectedAgent = select.value;
    
    if (selectedAgent === 'all') {
        alert("Selecione um agente específico para gerar a fatura.");
        return;
    }

    const dateStartInput = document.getElementById('pagamentos-date-start');
    const dateEndInput = document.getElementById('pagamentos-date-end');
    const startDate = dateStartInput && dateStartInput.value ? new Date(dateStartInput.value).setHours(0,0,0,0) : null;
    const endDate = dateEndInput && dateEndInput.value ? new Date(dateEndInput.value).setHours(23,59,59,999) : null;

    let items = [];
    let total = 0;

    window.db.freights.forEach(f => {
        if (f.agentes) {
            f.agentes.forEach(a => {
                const fDate = f.date ? new Date(f.date).getTime() : 0;
                const agentMatch = a.nome === selectedAgent;
                const startMatch = !startDate || fDate >= startDate;
                const endMatch = !endDate || fDate <= endDate;

                if (agentMatch && startMatch && endMatch) {
                    items.push({
                        date: f.date ? new Date(f.date).toLocaleDateString('pt-BR') : '-',
                        cte: f.id,
                        value: a.valor,
                        status: a.status || 'Pendente'
                    });
                    total += (a.valor || 0);
                }
            });
        }
    });

    if (items.length === 0) {
        alert("Nenhum item encontrado para este período.");
        return;
    }

    const printWindow = window.open('', '_blank');
    const periodStr = (startDate ? new Date(startDate).toLocaleDateString('pt-BR') : 'Início') + ' até ' + (endDate ? new Date(endDate).toLocaleDateString('pt-BR') : 'Hoje');

    const html = `
        <html><head><title>Extrato - ${selectedAgent}</title>
        <style>body{font-family:sans-serif;padding:40px;color:#333}.header{text-align:center;border-bottom:2px solid #10b981;padding-bottom:20px;margin-bottom:30px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}th{background:#f9fafb}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}</style>
        </head><body>
            <div class="header"><h1>Extrato de Pagamento</h1><p>GreenX TMS</p></div>
            <p><strong>Agente:</strong> ${selectedAgent}<br><strong>Período:</strong> ${periodStr}</p>
            <table>
                <thead><tr><th>Data</th><th>CTE</th><th>Status</th><th style="text-align:right">Valor</th></tr></thead>
                <tbody>
                    ${items.map(i => `<tr><td>${i.date}</td><td>${i.cte}</td><td>${i.status}</td><td style="text-align:right">${i.value.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td></tr>`).join('')}
                </tbody>
            </table>
            <div class="total">Total: ${total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</div>
            <script>window.print();</script>
        </body></html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
}

function toggleAgentPayment(freightId, agentIndex) {
    const f = window.db.freights.find(item => item.id == freightId);
    if (f && f.agentes && f.agentes[agentIndex]) {
        const currentStatus = f.agentes[agentIndex].status || 'Pendente';
        f.agentes[agentIndex].status = currentStatus === 'Pago' ? 'Pendente' : 'Pago';
        saveDb();
        renderPagamentos();
    }
}

function toggleAllPayments(source) {
    const checkboxes = document.querySelectorAll('.payment-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

function paySelectedAgents() {
    const checkboxes = document.querySelectorAll('.payment-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Selecione pelo menos um pagamento.");
        return;
    }

    if (!confirm(`Confirma o pagamento de ${checkboxes.length} itens selecionados?`)) return;

    let count = 0;
    checkboxes.forEach(cb => {
        const fid = cb.getAttribute('data-fid');
        const idx = parseInt(cb.getAttribute('data-idx'));
        const f = window.db.freights.find(item => item.id == fid);
        if (f && f.agentes && f.agentes[idx]) {
            f.agentes[idx].status = 'Pago';
            count++;
        }
    });

    saveDb();
    renderPagamentos();
    alert(`${count} pagamentos atualizados.`);
}

function deleteAgentPayment(freightId, agentIndex) {
    if (!confirm("Tem certeza que deseja excluir este pagamento?")) return;
    
    const f = window.db.freights.find(item => item.id == freightId);
    if (f && f.agentes) {
        f.agentes.splice(agentIndex, 1);
        saveDb();
        renderPagamentos();
    }
}

function editAgentPayment(freightId, agentIndex) {
    openModal('modal-payment', `${freightId}|${agentIndex}`);
}

function editNfse(id) {
    const f = window.db.freights.find(item => item.id == id);
    if (f) {
        const newNfse = prompt("Editar Número da NFS-e:", f.nfse || "");
        if (newNfse !== null) {
            f.nfse = newNfse.trim();
            saveDb();
            renderFaturamento();
        }
    }
}

function updateSelectionSummary() {
    const checkboxes = document.querySelectorAll('.billing-checkbox:checked');
    const summaryDiv = document.getElementById('billing-selection-summary');
    const countSpan = document.getElementById('selected-count');
    const totalSpan = document.getElementById('selected-total');

    if (!summaryDiv || !countSpan || !totalSpan) return;

    if (checkboxes.length === 0) {
        summaryDiv.classList.add('hidden');
        return;
    }

    let totalValue = 0;
    checkboxes.forEach(cb => {
        const freightId = cb.value;
        const freight = window.db.freights.find(f => f.id == freightId);
        if (freight) {
            totalValue += (freight.valor || 0);
        }
    });

    countSpan.innerText = checkboxes.length;
    totalSpan.innerText = formatCurrency(totalValue);
    summaryDiv.classList.remove('hidden');
}
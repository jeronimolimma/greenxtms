// --- AUTENTICAÇÃO ---

function toggleRegister() {
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.classList.add('hidden'); // Limpa erros anteriores
    document.getElementById('login-form').classList.toggle('hidden');
    document.getElementById('register-form').classList.toggle('hidden');
}

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;

    const errorEl = document.getElementById('login-error');
    
    window.auth.signInWithEmailAndPassword(user, pass)
        .catch((error) => {
            if (errorEl) {
                errorEl.innerText = "Erro: " + error.message;
                errorEl.classList.remove('hidden');
            }
        });
});

document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('reg-user').value;
    const pass = document.getElementById('reg-pass').value;

    window.auth.createUserWithEmailAndPassword(user, pass)
        .then((userCredential) => {
            // Cria perfil no banco de dados
            if (!window.db.users) window.db.users = [];
            window.db.users.push({
                id: Date.now(),
                user: user.split('@')[0],
                email: user,
                pass: '***', // Não salvamos mais a senha real no banco
                role: 'operacional', // Padrão para auto-cadastro
                photo: null,
                approved: false // Requer aprovação
            });
            sendNewUserAlert(user, 'Auto-cadastro');
            saveDb();
            alert('Cadastro realizado! Aguarde a aprovação do administrador para acessar.');
            toggleRegister();
        })
        .catch((error) => {
            alert("Erro ao cadastrar: " + error.message);
        });
});

function logout() {
    window.auth.signOut();
    // O onAuthStateChanged no main.js vai lidar com o redirecionamento
}

function forgotPassword() {
    const email = prompt("Por favor, insira o e-mail cadastrado para recuperação de senha:");
    if (email) {
        window.auth.sendPasswordResetEmail(email)
            .then(() => {
                alert("Um e-mail de recuperação de senha foi enviado para " + email + ". Verifique sua caixa de entrada e spam.");
            })
            .catch((error) => {
                console.error("Erro ao enviar e-mail de recuperação:", error);
                alert("Erro ao enviar e-mail de recuperação: " + error.message);
            });
    }
}

// --- PERFIL ---

function renderProfile() {
    // Preencher dados do usuário atual
    document.getElementById('profile-user-edit').value = window.db.currentUser.user;
    document.getElementById('profile-name').value = window.db.currentUser.name || '';
    document.getElementById('profile-surname').value = window.db.currentUser.surname || '';
    document.getElementById('profile-phone').value = window.db.currentUser.phone || '';
    document.getElementById('profile-email').value = window.db.currentUser.email || '';
    document.getElementById('profile-job').value = window.db.currentUser.job || '';
    document.getElementById('profile-notif-sound').checked = window.db.currentUser.notificationSound !== false; // Padrão true

    const fullName = (window.db.currentUser.name || window.db.currentUser.user) + ' ' + (window.db.currentUser.surname || '');
    document.getElementById('profile-name-display').innerText = fullName.trim();
    document.getElementById('profile-job-display').innerText = window.db.currentUser.job || 'Usuário';
    
    const img = document.getElementById('profile-img-display');
    img.src = window.db.currentUser.photo || `https://ui-avatars.com/api/?name=${window.db.currentUser.user}&background=random`;

    renderUserList();
    renderAuditLog();
}

function renderUserList() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';
    
    window.db.users.forEach(u => {
        const photoSrc = u.photo || `https://ui-avatars.com/api/?name=${u.user}&background=random`;
        const canReset = u.email && u.email.includes('@');
        
        const isPending = u.approved === false;

        const roleMap = {
            'admin': '<span class="status-badge status-entregue">Admin</span>',
            'financeiro': '<span class="status-badge status-transito">Financeiro</span>',
            'operacional': '<span class="status-badge status-pendente">Operacional</span>'
        };
        const roleBadge = roleMap[u.role || 'admin'] || u.role;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${photoSrc}" class="user-avatar-small"></td>
            <td>
                ${u.user}
                ${u.email ? `<div style="font-size: 0.8em; color: var(--text-light)">${u.email}</div>` : ''}
                ${isPending ? '<div style="font-size: 0.7em; color: var(--danger); font-weight:bold;">Aguardando Aprovação</div>' : ''}
            </td>
            <td>${roleBadge}</td>
            <td>
                <div style="display: flex; gap: 5px;">
                    ${isPending ? `<button class="btn-success" onclick="approveUser(${u.id})" style="padding: 5px 10px;" title="Aprovar"><i class="fa-solid fa-check"></i></button>` : ''}
                    <button class="btn-primary" onclick="openModal('modal-user', ${u.id})" style="padding: 5px 10px;" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    ${canReset ? `<button class="btn-warning" onclick="adminResetPassword('${u.email}')" style="padding: 5px 10px;" title="Enviar Email de Redefinição"><i class="fa-solid fa-key"></i></button>` : ''}
                    ${u.user !== window.db.currentUser.user ? `<button class="btn-danger" onclick="deleteUser(${u.id})" style="padding: 5px 10px;" title="Excluir"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function approveUser(id) {
    const idx = window.db.users.findIndex(u => u.id === id);
    if (idx !== -1) {
        window.db.users[idx].approved = true;
        
        // Log
        if (!window.db.auditLog) window.db.auditLog = [];
        window.db.auditLog.push({
            date: new Date().toISOString(),
            action: 'Aprovação de Usuário',
            adminUser: window.db.currentUser.user,
            details: `Admin '${window.db.currentUser.user}' aprovou o usuário '${window.db.users[idx].user}'.`
        });

        saveDb();
        renderUserList();
        renderAuditLog();
        alert(`Usuário ${window.db.users[idx].user} aprovado com sucesso.`);
    }
}

function adminResetPassword(email) {
    if(confirm(`Deseja enviar um e-mail de redefinição de senha para ${email}?`)) {
        window.auth.sendPasswordResetEmail(email)
            .then(() => {
                alert(`E-mail de redefinição enviado com sucesso para ${email}.`);
                // Adiciona ao log de auditoria
                if (!window.db.auditLog) window.db.auditLog = [];
                window.db.auditLog.push({
                    date: new Date().toISOString(),
                    action: 'Redefinição de Senha',
                    adminUser: window.db.currentUser.user,
                    details: `Admin '${window.db.currentUser.user}' enviou e-mail de redefinição para '${email}'.`
                });
                saveDb();
                renderAuditLog();
            })
            .catch((error) => {
                console.error("Erro ao enviar e-mail:", error);
                alert("Erro ao enviar e-mail: " + error.message);
            });
    }
}

function triggerPhotoUpload() {
    document.getElementById('profile-photo-input').click();
}

function handlePhotoUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            window.db.currentUser.photo = e.target.result;
            // Atualiza no array de usuários também
            const idx = window.db.users.findIndex(u => u.id === window.db.currentUser.id);
            if (idx !== -1) window.db.users[idx].photo = e.target.result;
            
            // Atualiza o header imediatamente
            const headerAvatar = document.getElementById('header-user-avatar');
            if (headerAvatar) headerAvatar.src = e.target.result;

            saveDb();
            renderProfile();
        }
        reader.readAsDataURL(input.files[0]);
    }
}

async function updateMyProfile() {
    const newPass = document.getElementById('profile-new-pass').value;
    const confirmPass = document.getElementById('profile-confirm-pass').value;
    const name = document.getElementById('profile-name').value;
    const surname = document.getElementById('profile-surname').value;
    const phone = document.getElementById('profile-phone').value;
    const email = document.getElementById('profile-email').value;
    const job = document.getElementById('profile-job').value;
    const notifSound = document.getElementById('profile-notif-sound').checked;
    const userDisplay = document.getElementById('profile-user-edit').value;

    // Validação de Telefone
    const cleanPhone = phone.replace(/\D/g, '');
    if (phone && (cleanPhone.length < 10 || cleanPhone.length > 11)) {
        alert('Telefone inválido. Informe DDD + Número.');
        return;
    }

    const successMessages = [];

    // 1. Handle Password Change
    if (newPass) {
        if (newPass.length < 6) {
            alert('A nova senha deve ter pelo menos 6 caracteres.');
            return;
        }
        if (newPass !== confirmPass) {
            alert('As senhas não conferem. Verifique a confirmação da nova senha.');
            return;
        }

        try {
            const user = window.auth.currentUser;
            await user.updatePassword(newPass);
            successMessages.push('Senha atualizada com sucesso.');
        } catch (error) {
            console.error("Erro ao atualizar senha:", error);
            alert("Erro ao atualizar senha: " + error.message + "\n\nPor segurança, pode ser necessário fazer logout e login novamente para realizar esta operação.");
            return;
        }
    }

    // 2. Handle Profile Data Change
    const currentUser = window.db.currentUser;
    const dataChanged = currentUser.name !== name || currentUser.surname !== surname || currentUser.phone !== phone || currentUser.email !== email || currentUser.job !== job || currentUser.user !== userDisplay || currentUser.notificationSound !== notifSound;

    if (dataChanged) {
        currentUser.user = userDisplay;
        currentUser.name = name;
        currentUser.surname = surname;
        currentUser.phone = phone;
        currentUser.email = email;
        currentUser.job = job;
        currentUser.notificationSound = notifSound;

        const idx = window.db.users.findIndex(u => u.id === currentUser.id);
        if (idx !== -1) {
            window.db.users[idx] = { ...window.db.users[idx], ...currentUser };
        }
        successMessages.push('Dados do perfil atualizados.');
    }

    // 3. Finalize
    if (successMessages.length > 0) {
        saveDb();
        alert(successMessages.join('\n'));
    }

    document.getElementById('profile-new-pass').value = '';
    document.getElementById('profile-confirm-pass').value = '';
    renderProfile();
    
    const newDisplayName = name ? `${name} ${surname || ''}`.trim() : userDisplay;
    document.getElementById('display-username').innerText = newDisplayName;
}

function saveUser() {
    const editId = document.getElementById('edit-user-id').value;
    const user = document.getElementById('new-user-login').value;
    const pass = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;

    if (user && pass) {
        if (editId) {
            const idx = window.db.users.findIndex(u => u.id == editId);
            if (idx !== -1) {
                window.db.users[idx].user = user;
                window.db.users[idx].pass = pass;
                window.db.users[idx].role = role;
            }
        } else {
            window.db.users.push({ id: Date.now(), user, pass, role, photo: null, approved: true }); // Admin cria já aprovado
            sendNewUserAlert(user, window.db.currentUser.user);
        }
        saveDb();
        closeModal();
        renderUserList();
    } else {
        alert('Preencha usuário e senha.');
    }
}

function deleteUser(id) {
    if (confirm('Excluir este usuário?')) {
        const idx = window.db.users.findIndex(u => u.id === id);
        if (idx !== -1) {
            const deletedUser = window.db.users[idx]; // Pega os dados antes de excluir

            window.db.users.splice(idx, 1);

            // Adiciona ao log de auditoria
            if (!window.db.auditLog) window.db.auditLog = [];
            window.db.auditLog.push({
                date: new Date().toISOString(),
                action: 'Exclusão de Usuário',
                adminUser: window.db.currentUser.user,
                details: `Admin '${window.db.currentUser.user}' excluiu o usuário '${deletedUser.user}' (ID: ${deletedUser.id}).`
            });

            saveDb();
            renderUserList();
            renderAuditLog();
        }
    }
}

function sendNewUserAlert(newUserEmail, createdBy) {
    // NOTA: Para envio real de e-mail, seria necessário integrar com EmailJS ou Firebase Cloud Functions aqui.
    // Abaixo simulamos o envio e registramos no sistema.
    
    const adminEmail = 'admin@tms.com'; // E-mail do administrador principal
    console.log(`[EMAIL ALERT] Para: ${adminEmail} | Assunto: Novo Usuário Criado | Corpo: O usuário ${newUserEmail} foi criado por ${createdBy}.`);

    // Adiciona ao log de auditoria como um evento de sistema
    if (!window.db.auditLog) window.db.auditLog = [];
    window.db.auditLog.push({
        date: new Date().toISOString(),
        action: 'ALERTA: Novo Usuário',
        adminUser: 'SISTEMA',
        details: `Notificação de criação do usuário '${newUserEmail}' (Origem: ${createdBy}) enviada para admin.`
    });
}

function renderAuditLog() {
    const tbody = document.getElementById('audit-log-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!window.db.auditLog || window.db.auditLog.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Nenhum registro de auditoria encontrado.</td></tr>';
        return;
    }

    // Ordena os logs por data, do mais recente para o mais antigo
    const sortedLogs = [...window.db.auditLog].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedLogs.forEach(log => {
        const tr = document.createElement('tr');
        const dateStr = new Date(log.date).toLocaleString('pt-BR');
        tr.innerHTML = `
            <td data-label="Data">${dateStr}</td>
            <td data-label="Ação">${log.action}</td>
            <td data-label="Admin">${log.adminUser}</td>
            <td data-label="Detalhes">${log.details}</td>
        `;
        tbody.appendChild(tr);
    });
}
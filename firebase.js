// --- ESTADO E DADOS INICIAIS ---
window.defaultData = {
    lastCteSequence: 3,
    users: [{ 
        id: 1, 
        user: 'admin', 
        pass: 'admin1234', 
        photo: null,
        name: 'Administrador',
        surname: 'Sistema',
        phone: '',
        email: 'admin@tms.com',
        job: 'Gerente Geral',
        notificationSound: true
    }],
    auditLog: [],
    clients: [
        { id: 1, name: 'Tech Solutions Ltda', cnpj: '12.345.678/0001-90', city: 'São Paulo', phone: '(11) 9999-9999' },
        { id: 2, name: 'Mercado Rápido', cnpj: '98.765.432/0001-10', city: 'Rio de Janeiro', phone: '(21) 8888-8888' }
    ],
    freights: [
        { 
            id: 'VIO000000001', 
            date: '2024-02-20T10:00:00.000Z',
            clientId: 1, 
            remetente: 'Fornecedor A',
            destinatario: 'Cliente B',
            endereco: 'Rua das Flores, 123',
            cidade: 'Curitiba',
            uf: 'PR',
            valorNF: 25000,
            valorSeguro: 125,
            agentes: [
                { nome: 'Transportadora Local A', valor: 150.00 },
                { nome: 'Agente de Carga B', valor: 50.00 }
            ],
            isPerishable: false,
            isFragile: true,
            valor: 1500.00, 
            status: 'Entregue',
            trackingHistory: [
                { date: '2024-02-20T10:00:00', status: 'Coletado', location: 'São Paulo - SP', observation: 'Coleta realizada na fábrica.' },
                { date: '2024-02-21T14:30:00', status: 'Em Trânsito', location: 'Registro - SP', observation: 'Parada para descanso.' },
                { date: '2024-02-22T09:00:00', status: 'Entregue', location: 'Curitiba - PR', observation: 'Recebido por João Silva.' }
            ],
            attachments: [
                { name: 'comprovante_entrega.jpg', date: '2024-02-22T09:05:00' },
                { name: 'nota_fiscal.pdf', date: '2024-02-20T08:00:00' }
            ]
        },
        { 
            id: 'VIO000000002', 
            date: '2024-02-21T14:00:00.000Z', 
            clientId: 2, 
            remetente: 'Centro de Distribuição', 
            destinatario: 'Filial Sul', 
            cidade: 'Porto Alegre',
            uf: 'RS',
            valor: 2200.00, 
            agentes: [{ nome: 'Parceiro X', valor: 1200.00 }], 
            isPerishable: true, isFragile: false, status: 'Em Trânsito', trackingHistory: [], attachments: [] 
        },
        { 
            id: 'VIO000000003', 
            date: '2024-02-22T09:30:00.000Z', 
            clientId: 1, 
            remetente: 'Matriz SP', 
            destinatario: 'Cliente C', 
            cidade: 'Campinas',
            uf: 'SP',
            valor: 500.00, agentes: [], isPerishable: false, isFragile: false, status: 'Pendente', trackingHistory: [], attachments: [] 
        }
    ],
    currentUser: null
};

// --- CONFIGURAÇÃO DO FIREBASE ---
// SUBSTITUA ESTES DADOS PELOS DO SEU PROJETO NO FIREBASE CONSOLE
const firebaseConfig = {
    apiKey: "AIzaSyDqyhsWOpzxEefqYWlvEpZSebvCRs8hyNo",
    authDomain: "greenxtms.firebaseapp.com",
    projectId: "greenxtms",
    storageBucket: "greenxtms.firebasestorage.app",
    messagingSenderId: "348266061687",
    appId: "1:348266061687:web:08f00daa1a6188c81a0b72",
    measurementId: "G-DPBR67S91L"
};

// Inicialização do Banco de Dados
window.db = JSON.parse(JSON.stringify(window.defaultData)); // Inicia com padrão
let dbFirestore = null;

try {
    firebase.initializeApp(firebaseConfig);
    dbFirestore = firebase.firestore();
    window.auth = firebase.auth();
    if (firebase.analytics) {
        firebase.storage();
        firebase.analytics();
    }
    console.log("Firebase conectado.");
} catch (e) {
    console.warn("Firebase não configurado. Usando modo local (dados serão perdidos ao atualizar).", e);

}

function saveDb() {
    if (dbFirestore) {
        dbFirestore.collection('greenx_db').doc('main_data').set(window.db)
            .then(() => console.log("Dados salvos na nuvem."))
            .catch((e) => {
                console.error("Erro ao salvar:", e);
                if (e.code === 'permission-denied') {
                    alert("Erro de permissão ao salvar: Verifique as regras do Firebase.");
                }
            });
    } else {
        // Fallback para localStorage se Firebase falhar
        localStorage.setItem('tms_db', JSON.stringify(window.db));
    }
}

// Função para carregar dados da nuvem
async function loadDb() {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) loadingEl.classList.remove('hidden');

    if (dbFirestore) {
        try {
            const docRef = dbFirestore.collection('greenx_db').doc('main_data');
            const docSnap = await docRef.get();

            if (docSnap.exists) {
                window.db = docSnap.data();
                console.log("Dados sincronizados da nuvem.");
            } else {
                console.log("Primeiro acesso. Criando banco de dados...");
                saveDb();
            }
        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            if (error.code === 'permission-denied') {
                alert("Erro de permissão ao carregar: Configure as regras do Firestore para 'allow read, write: if true;'");
            }
            const stored = localStorage.getItem('tms_db');
            if (stored) window.db = JSON.parse(stored);
        }
    } else {
        const stored = localStorage.getItem('tms_db');
        if (stored) window.db = JSON.parse(stored);
    }

    if (!window.db.users) window.db.users = window.defaultData.users;
    if (!window.db.auditLog) window.db.auditLog = [];

    if (loadingEl) loadingEl.classList.add('hidden');
}

// --- HELPERS GLOBAIS ---
function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

// --- TEMA (DARK MODE) ---
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('tms_theme', isDark ? 'dark' : 'light');
}

// Aplicar tema padrão (Dark)
const savedTheme = localStorage.getItem('tms_theme');
if (savedTheme === 'dark' || !savedTheme) {
    document.body.classList.add('dark-mode');
}
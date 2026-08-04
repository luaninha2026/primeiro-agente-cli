require('dotenv').config();
console.log("Minha chave secreta é:", process.env.JWT_SECRET);
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Importações novas
const authRoutes = require('./routes/authRoutes');
const authMiddleware = require('./middlewares/authMiddleware');
const Usuario = require('./models/Usuario');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('📦 Banco Conectado'))
    .catch(err => console.error('❌ Erro Banco:', err));

// Schemas (Mensagem e Jogador continuam, mas Jogador agora pode ser vinculado ao ID do Usuario)
const Mensagem = mongoose.model('Mensagem', new mongoose.Schema({
    role: String,
    parts: [{ text: String }],
    nickname: String,
    dataHora: { type: Date, default: Date.now }
}));

const Jogador = mongoose.model('Jogador', new mongoose.Schema({
    nome: { type: String, unique: true, required: true },
    xp: { type: Number, default: 0 }
}));

// Funções de Ferramentas (adicionarXP e buscarClima permanecem iguais)
// ... (mantenha suas funções buscarClimaTempoReal e adicionarXP aqui)

// --- ROTAS DE AUTENTICAÇÃO ---
app.use('/api/auth', authRoutes);

// --- ROTAS PROTEGIDAS (Adicionado o Middleware) ---

app.get('/api/ranking', authMiddleware, async (req, res) => {
    try {
        const top10 = await Jogador.find().sort({ xp: -1 }).limit(10);
        res.json(top10);
    } catch (error) { res.status(500).json({ erro: error.message }); }
});

app.post('/api/chat', authMiddleware, async (req, res) => {
    try {
        const { pergunta } = req.body;
        // SEGURANÇA: O nickname vem do TOKEN, não do body!
        const nickname = req.usuario.nome; 

        if (!pergunta) return res.status(400).json({ erro: "Faltam dados" });

        // Recupera histórico usando o nickname extraído do Token
        const msgs = await Mensagem.find({ nickname }).sort({ dataHora: 1 }).limit(10).lean();
        
        let historyParaIA = [];
        msgs.forEach(m => {
            const role = m.role === "user" ? "user" : "model";
            if (historyParaIA.length === 0 || historyParaIA[historyParaIA.length - 1].role !== role) {
                historyParaIA.push({ role, parts: m.parts });
            }
        });

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            // Aqui você deve passar suas ferramentas e instruções do Guardião
            systemInstruction: "Você é o Guardião do Cofre..." 
        });

        const chat = model.startChat({ history: historyParaIA });
        // ... (resto da sua lógica de sendMessage e Function Calling)
        let result = await chat.sendMessage(pergunta);
        let response = result.response;
        const respostaFinal = response.text();

        await Mensagem.create({ role: "user", parts: [{ text: pergunta }], nickname });
        await Mensagem.create({ role: "model", parts: [{ text: respostaFinal }], nickname });

        res.json({ resposta: respostaFinal });

    } catch (error) {
        res.status(500).json({ erro: "Erro na IA", detalhe: error.message });
    }
});

// RASTREADOR DE ERROS GLOBAL - Cole antes do app.listen
app.use((err, req, res, next) => {
    console.error("🚨 ERRO CAPTURADO:");
    console.error(err.stack); // Isso VAI imprimir o erro no terminal
    res.status(500).json({ erro: "Erro interno no servidor", detalhe: err.message });
});

app.listen(3000, () => console.log('🚀 Servidor Seguro em http://localhost:3000'));